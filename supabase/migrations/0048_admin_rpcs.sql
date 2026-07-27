-- ============================================================================
-- Dashboard administrateur — partie 2/2 : fonctions.
--
-- Chaque fonction admin_* commence par `if not public.is_admin_user(auth.uid())
-- then raise exception` — c'est LE vrai contrôle d'accès (voir migration
-- 0047). Elles sont grantées à `authenticated` comme le reste des RPC de
-- l'app (voir 0045) : n'importe quel compte connecté peut les appeler, mais
-- seul un compte avec is_admin = true obtient autre chose qu'une erreur.
-- ============================================================================
set search_path = public;

-- ----------------------------------------------------------------------------
-- get_app_status : seule fonction admin-adjacente accessible à tout le
-- monde (y compris anon) — juste assez d'info pour que l'app affiche un
-- bandeau "nouvelles parties désactivées" sans exposer quoi que ce soit
-- d'autre sur l'état interne de l'admin.
-- ----------------------------------------------------------------------------
create or replace function public.get_app_status()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object('new_games_enabled', new_games_enabled) from public.app_settings where id = 1;
$$;

grant execute on function public.get_app_status() to anon, authenticated;

-- ----------------------------------------------------------------------------
-- admin_check_access : appelée à l'ouverture du dashboard. Journalise
-- systématiquement la tentative (réussie ou non) dans admin_access_log —
-- c'est ce qui alimente l'onglet "Sécurité" du dashboard côté tentatives
-- refusées.
-- ----------------------------------------------------------------------------
create or replace function public.admin_check_access()
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_allowed boolean;
begin
  v_allowed := public.is_admin_user(v_user);
  insert into public.admin_access_log (user_id, allowed) values (v_user, v_allowed);
  return v_allowed;
end;
$$;

grant execute on function public.admin_check_access() to authenticated;

-- ----------------------------------------------------------------------------
-- admin_get_stats : chiffres pour l'onglet "Vue d'ensemble", recalculés à
-- chaque appel (le dashboard fait son propre polling côté client, voir
-- AdminDashboard.tsx — pas de cache serveur, les volumes de cette app ne le
-- justifient pas).
-- ----------------------------------------------------------------------------
create or replace function public.admin_get_stats()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
begin
  if not public.is_admin_user(v_user) then
    raise exception 'Accès refusé.';
  end if;

  return jsonb_build_object(
    'total_users', (select count(*) from public.profiles),
    'new_users_today', (select count(*) from public.profiles where created_at >= date_trunc('day', now())),
    'total_games', (select count(*) from public.games),
    'active_games', (select count(*) from public.games where status <> 'ended'),
    'games_today', (select count(*) from public.games where created_at >= date_trunc('day', now())),
    'messages_today', (select count(*) from public.chat_messages where created_at >= date_trunc('day', now())),
    'banned_users', (select count(*) from public.profiles where is_banned),
    'admin_users', (select count(*) from public.profiles where is_admin),
    'pending_deletions', (select count(*) from public.account_deletion_requests),
    'pending_join_requests', (select count(*) from public.game_join_requests where status = 'pending'),
    'new_games_enabled', (select new_games_enabled from public.app_settings where id = 1)
  );
end;
$$;

grant execute on function public.admin_get_stats() to authenticated;

-- ----------------------------------------------------------------------------
-- admin_list_users : recherche par pseudo ou email, avec le nombre de
-- parties jouées par compte.
-- ----------------------------------------------------------------------------
create or replace function public.admin_list_users(p_search text default null, p_limit int default 50, p_offset int default 0)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
begin
  if not public.is_admin_user(v_user) then
    raise exception 'Accès refusé.';
  end if;

  return coalesce((
    select jsonb_agg(row_to_json(u)) from (
      select
        p.id,
        p.username,
        au.email,
        p.created_at,
        p.is_admin,
        p.is_banned,
        p.banned_reason,
        p.lang,
        (select count(*) from public.game_players gp where gp.user_id = p.id) as games_count
      from public.profiles p
      join auth.users au on au.id = p.id
      where p_search is null or p.username ilike '%' || p_search || '%' or au.email ilike '%' || p_search || '%'
      order by p.created_at desc
      limit p_limit offset p_offset
    ) u
  ), '[]'::jsonb);
end;
$$;

grant execute on function public.admin_list_users(text, int, int) to authenticated;

-- ----------------------------------------------------------------------------
-- admin_set_user_ban : suspend/réactive un compte. Un compte suspendu
-- reste capable de se connecter (aucun hook sur l'authentification
-- elle-même) mais create_game/join_game/request_join_public_game
-- lui sont désormais fermées (voir plus bas) — donc plus moyen de créer ou
-- de rejoindre quoi que ce soit de nouveau. Ne l'expulse pas d'une partie
-- où il serait déjà engagé au moment du bannissement.
-- ----------------------------------------------------------------------------
create or replace function public.admin_set_user_ban(p_user_id uuid, p_banned boolean, p_reason text default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_admin uuid := auth.uid();
begin
  if not public.is_admin_user(v_admin) then
    raise exception 'Accès refusé.';
  end if;
  if p_user_id = v_admin and p_banned then
    raise exception 'Vous ne pouvez pas vous bannir vous-même.';
  end if;

  update public.profiles
  set is_banned = p_banned,
      banned_reason = case when p_banned then p_reason else null end,
      banned_at = case when p_banned then now() else null end
  where id = p_user_id;

  insert into public.admin_audit_log (admin_id, action, target, details)
  values (v_admin, case when p_banned then 'ban_user' else 'unban_user' end, p_user_id::text, jsonb_build_object('reason', p_reason));
end;
$$;

grant execute on function public.admin_set_user_ban(uuid, boolean, text) to authenticated;

-- ----------------------------------------------------------------------------
-- admin_set_user_admin : promouvoir/rétrograder un autre compte admin.
-- ----------------------------------------------------------------------------
create or replace function public.admin_set_user_admin(p_user_id uuid, p_is_admin boolean)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_admin uuid := auth.uid();
begin
  if not public.is_admin_user(v_admin) then
    raise exception 'Accès refusé.';
  end if;
  if p_user_id = v_admin and not p_is_admin then
    raise exception 'Vous ne pouvez pas retirer vos propres droits admin.';
  end if;

  update public.profiles set is_admin = p_is_admin where id = p_user_id;

  insert into public.admin_audit_log (admin_id, action, target, details)
  values (v_admin, case when p_is_admin then 'grant_admin' else 'revoke_admin' end, p_user_id::text, null);
end;
$$;

grant execute on function public.admin_set_user_admin(uuid, boolean) to authenticated;

-- ----------------------------------------------------------------------------
-- admin_list_active_games : toutes les parties non terminées, avec l'hôte
-- et le nombre de joueurs — pour repérer un salon bloqué/abandonné.
-- ----------------------------------------------------------------------------
create or replace function public.admin_list_active_games(p_limit int default 100)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
begin
  if not public.is_admin_user(v_user) then
    raise exception 'Accès refusé.';
  end if;

  return coalesce((
    select jsonb_agg(row_to_json(g)) from (
      select
        gm.id,
        gm.code,
        gm.status,
        gm.is_public,
        gm.created_at,
        hp.display_name as host_name,
        (select count(*) from public.game_players gp2 where gp2.game_id = gm.id) as player_count
      from public.games gm
      join public.game_players hp on hp.game_id = gm.id and hp.user_id = gm.host_id
      where gm.status <> 'ended'
      order by gm.created_at desc
      limit p_limit
    ) g
  ), '[]'::jsonb);
end;
$$;

grant execute on function public.admin_list_active_games(int) to authenticated;

-- ----------------------------------------------------------------------------
-- admin_force_end_game : arrête un salon bloqué à la place de l'hôte
-- (ex. hôte parti sans avoir relancé/terminé). Statut direct à 'ended',
-- pas de tentative de calculer un vainqueur — ce n'est pas une vraie fin de
-- partie, juste un arrêt d'urgence.
-- ----------------------------------------------------------------------------
create or replace function public.admin_force_end_game(p_game_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_admin uuid := auth.uid();
begin
  if not public.is_admin_user(v_admin) then
    raise exception 'Accès refusé.';
  end if;

  update public.games set status = 'ended', phase_deadline = null where id = p_game_id;
  insert into public.game_log (game_id, message) values (p_game_id, 'La partie a été arrêtée par un administrateur.');

  insert into public.admin_audit_log (admin_id, action, target, details)
  values (v_admin, 'force_end_game', p_game_id::text, null);
end;
$$;

grant execute on function public.admin_force_end_game(uuid) to authenticated;

-- ----------------------------------------------------------------------------
-- admin_list_pending_deletions / admin_process_account_deletion : la
-- demande (request_account_deletion, migration 0031) ne fait qu'enregistrer
-- l'intention — jusqu'ici il n'existait aucun moyen dans l'app d'aller au
-- bout du processus, il fallait le faire à la main dans le dashboard
-- Supabase. admin_process_account_deletion supprime réellement le compte
-- (auth.users, d'où cascade vers profiles puis tout ce qui en dépend).
-- Irréversible — pas de fonction pour "annuler" une suppression.
-- ----------------------------------------------------------------------------
create or replace function public.admin_list_pending_deletions()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
begin
  if not public.is_admin_user(v_user) then
    raise exception 'Accès refusé.';
  end if;

  return coalesce((
    select jsonb_agg(row_to_json(d)) from (
      select
        adr.id,
        adr.user_id,
        coalesce(p.username, adr.email) as username,
        adr.email,
        adr.created_at
      from public.account_deletion_requests adr
      left join public.profiles p on p.id = adr.user_id
      order by adr.created_at asc
    ) d
  ), '[]'::jsonb);
end;
$$;

grant execute on function public.admin_list_pending_deletions() to authenticated;

create or replace function public.admin_process_account_deletion(p_request_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_admin uuid := auth.uid();
  v_target uuid;
begin
  if not public.is_admin_user(v_admin) then
    raise exception 'Accès refusé.';
  end if;

  select user_id into v_target from public.account_deletion_requests where id = p_request_id;
  if v_target is null then
    raise exception 'Demande introuvable.';
  end if;

  insert into public.admin_audit_log (admin_id, action, target, details)
  values (v_admin, 'process_account_deletion', v_target::text, jsonb_build_object('request_id', p_request_id));

  delete from public.account_deletion_requests where id = p_request_id;
  -- profiles.id référence auth.users(id) on delete cascade : le profil (et
  -- tout ce qui en dépend en cascade — participations, amitiés, etc.)
  -- disparaît avec. Si cette ligne échoue par manque de droits sur le
  -- schéma auth (ça dépend de la configuration exacte du projet Supabase),
  -- la demande reste visible dans la liste : traite-la alors une fois à la
  -- main dans Supabase → Authentication → Users, avec cet onglet comme
  -- pense-bête de ce qui reste à faire.
  delete from auth.users where id = v_target;
end;
$$;

grant execute on function public.admin_process_account_deletion(uuid) to authenticated;

-- ----------------------------------------------------------------------------
-- admin_list_access_log / admin_list_audit_log : les deux journaux de
-- l'onglet "Sécurité".
-- ----------------------------------------------------------------------------
create or replace function public.admin_list_access_log(p_limit int default 50)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
begin
  if not public.is_admin_user(v_user) then
    raise exception 'Accès refusé.';
  end if;

  return coalesce((
    select jsonb_agg(row_to_json(a)) from (
      select
        l.id,
        l.user_id,
        p.username,
        l.allowed,
        l.created_at
      from public.admin_access_log l
      left join public.profiles p on p.id = l.user_id
      order by l.created_at desc
      limit p_limit
    ) a
  ), '[]'::jsonb);
end;
$$;

grant execute on function public.admin_list_access_log(int) to authenticated;

create or replace function public.admin_list_audit_log(p_limit int default 100)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
begin
  if not public.is_admin_user(v_user) then
    raise exception 'Accès refusé.';
  end if;

  return coalesce((
    select jsonb_agg(row_to_json(a)) from (
      select
        l.id,
        l.admin_id,
        p.username as admin_username,
        l.action,
        l.target,
        l.details,
        l.created_at
      from public.admin_audit_log l
      left join public.profiles p on p.id = l.admin_id
      order by l.created_at desc
      limit p_limit
    ) a
  ), '[]'::jsonb);
end;
$$;

grant execute on function public.admin_list_audit_log(int) to authenticated;

-- ----------------------------------------------------------------------------
-- admin_set_new_games_enabled : l'interrupteur "désactiver le jeu".
-- ----------------------------------------------------------------------------
create or replace function public.admin_set_new_games_enabled(p_enabled boolean)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_admin uuid := auth.uid();
begin
  if not public.is_admin_user(v_admin) then
    raise exception 'Accès refusé.';
  end if;

  update public.app_settings set new_games_enabled = p_enabled, updated_at = now(), updated_by = v_admin where id = 1;

  insert into public.admin_audit_log (admin_id, action, target, details)
  values (v_admin, case when p_enabled then 'enable_new_games' else 'disable_new_games' end, null, null);
end;
$$;

grant execute on function public.admin_set_new_games_enabled(boolean) to authenticated;

-- ============================================================================
-- Application effective du bannissement et de l'interrupteur "nouvelles
-- parties" : create_game, join_game, request_join_public_game reprises
-- intégralement (dernières versions : 0033, 0038, 0038) avec deux ajouts.
-- Un compte déjà engagé dans une partie peut toujours s'y reconnecter
-- (return anticipé avant le contrôle de l'interrupteur) même l'interrupteur
-- coupé — seules les entrées VRAIMENT nouvelles sont bloquées.
-- ============================================================================

-- create_game : reprise de 0033_public_games.sql + contrôle banni/interrupteur
-- + correction d'une régression de 0041 (qui avait fait passer
-- role_reveal_seconds de 15 à 30 par défaut, mais sur une signature à 2
-- paramètres de create_game jamais appelée par le client — voir migration
-- 0046 pour un autre cas du même genre. L'intention de 0041 s'applique ici,
-- sur la vraie fonction utilisée.
create or replace function public.create_game(p_display_name text, p_settings jsonb default null, p_is_public boolean default false)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_code text;
  v_game_id uuid;
  v_settings jsonb;
  v_icon text;
begin
  if v_user is null then
    raise exception 'Authentification requise';
  end if;

  if exists (select 1 from public.profiles where id = v_user and is_banned) then
    raise exception 'Votre compte a été suspendu.';
  end if;

  if not (select new_games_enabled from public.app_settings where id = 1) then
    raise exception 'La création de nouvelles parties est temporairement désactivée.';
  end if;

  select avatar_icon into v_icon from public.profiles where id = v_user;

  v_code := public.generate_game_code();
  v_settings := jsonb_build_object(
    'discussion_seconds', coalesce((p_settings->>'discussion_seconds')::int, 300),
    'vote_seconds', coalesce((p_settings->>'vote_seconds')::int, 45),
    'vote_recap_seconds', coalesce((p_settings->>'vote_recap_seconds')::int, 90),
    'night_step_seconds', coalesce((p_settings->>'night_step_seconds')::int, 70),
    'wolf_chat_seconds', coalesce((p_settings->>'wolf_chat_seconds')::int, 180),
    'role_reveal_seconds', coalesce((p_settings->>'role_reveal_seconds')::int, 30),
    'role_counts', p_settings->'role_counts'
  );

  insert into public.games (code, host_id, settings, is_public)
  values (v_code, v_user, v_settings, coalesce(p_is_public, false))
  returning id into v_game_id;

  insert into public.game_players (game_id, user_id, display_name, seat_number, is_host, avatar_color, avatar_icon)
  values (v_game_id, v_user, coalesce(nullif(trim(p_display_name), ''), 'Joueur'), 1, true, public.random_avatar_color(), v_icon);

  insert into public.game_log (game_id, message)
  values (v_game_id, 'La partie a été créée. En attente des joueurs...');

  return jsonb_build_object('game_id', v_game_id, 'code', v_code);
end;
$$;

-- join_game : reprise de 0038_join_in_progress_games.sql + contrôles.
create or replace function public.join_game(p_code text, p_display_name text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_game public.games%rowtype;
  v_existing uuid;
  v_existing_request public.game_join_requests%rowtype;
begin
  if v_user is null then
    raise exception 'Authentification requise';
  end if;

  select * into v_game from public.games where code = upper(trim(p_code));
  if not found then
    raise exception 'Aucune partie ne correspond à ce code.';
  end if;

  select id into v_existing from public.game_players where game_id = v_game.id and user_id = v_user;
  if v_existing is not null then
    -- Reconnexion à une partie où l'on est déjà engagé : toujours autorisée,
    -- même interrupteur coupé ou compte suspendu depuis (on ne coupe pas
    -- une partie en cours sous le pied de quelqu'un).
    delete from public.game_invites where game_id = v_game.id and to_user_id = v_user;
    return jsonb_build_object('status', 'joined', 'game_id', v_game.id, 'code', v_game.code);
  end if;

  if exists (select 1 from public.profiles where id = v_user and is_banned) then
    raise exception 'Votre compte a été suspendu.';
  end if;

  if not (select new_games_enabled from public.app_settings where id = 1) then
    raise exception 'Impossible de rejoindre une nouvelle partie pour le moment.';
  end if;

  if v_game.status in ('lobby', 'ended') then
    perform public._add_player_to_game(v_game.id, v_user, p_display_name);
    delete from public.game_invites where game_id = v_game.id and to_user_id = v_user;
    return jsonb_build_object('status', 'joined', 'game_id', v_game.id, 'code', v_game.code);
  end if;

  select count(*) into v_existing from public.game_players where game_id = v_game.id;
  if v_existing >= 20 then
    raise exception 'Cette partie est complète (20 joueurs maximum).';
  end if;

  select * into v_existing_request from public.game_join_requests where game_id = v_game.id and user_id = v_user;

  if found and v_existing_request.status = 'pending' then
    raise exception 'Votre demande est déjà en attente de réponse.';
  end if;

  if found then
    update public.game_join_requests
    set status = 'pending',
        display_name = coalesce(nullif(trim(p_display_name), ''), 'Joueur'),
        created_at = now(),
        responded_at = null
    where id = v_existing_request.id;
  else
    insert into public.game_join_requests (game_id, user_id, display_name)
    values (v_game.id, v_user, coalesce(nullif(trim(p_display_name), ''), 'Joueur'));
  end if;

  return jsonb_build_object('status', 'pending', 'game_id', v_game.id, 'code', v_game.code);
end;
$$;

-- request_join_public_game : reprise de 0038_join_in_progress_games.sql + contrôles.
create or replace function public.request_join_public_game(p_game_id uuid, p_display_name text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_game public.games%rowtype;
  v_existing public.game_join_requests%rowtype;
  v_count int;
begin
  if v_user is null then
    raise exception 'Authentification requise';
  end if;

  if exists (select 1 from public.profiles where id = v_user and is_banned) then
    raise exception 'Votre compte a été suspendu.';
  end if;

  select * into v_game from public.games where id = p_game_id;
  if not found or not v_game.is_public or v_game.status = 'ended' then
    raise exception 'Cette partie n’accepte plus de nouvelles demandes.';
  end if;

  if exists (select 1 from public.game_players where game_id = p_game_id and user_id = v_user) then
    raise exception 'Vous participez déjà à cette partie.';
  end if;

  if not (select new_games_enabled from public.app_settings where id = 1) then
    raise exception 'Impossible de rejoindre une nouvelle partie pour le moment.';
  end if;

  select count(*) into v_count from public.game_players where game_id = p_game_id;
  if v_game.status = 'lobby' and v_count >= 20 then
    raise exception 'Cette partie est complète (20 joueurs maximum).';
  end if;

  select * into v_existing from public.game_join_requests where game_id = p_game_id and user_id = v_user;

  if found and v_existing.status = 'pending' then
    raise exception 'Votre demande est déjà en attente de réponse.';
  end if;

  if found then
    update public.game_join_requests
    set status = 'pending',
        display_name = coalesce(nullif(trim(p_display_name), ''), 'Joueur'),
        created_at = now(),
        responded_at = null
    where id = v_existing.id;
  else
    insert into public.game_join_requests (game_id, user_id, display_name)
    values (p_game_id, v_user, coalesce(nullif(trim(p_display_name), ''), 'Joueur'));
  end if;

  return jsonb_build_object('status', 'pending');
end;
$$;

grant execute on function public.create_game(text, jsonb, boolean) to authenticated;
grant execute on function public.join_game(text, text) to authenticated;
grant execute on function public.request_join_public_game(uuid, text) to authenticated;
