-- ============================================================================
-- Capacité des salons : 20 → 25 joueurs maximum.
--
-- La limite de 20 était codée en dur dans quatre fonctions PL/pgSQL, chacune
-- redéfinie plusieurs fois au fil des migrations précédentes (create or
-- replace function) — seule la dernière version de chacune est réellement
-- active en base. On les redéfinit donc ici à l'identique, seul le seuil (et
-- le message d'erreur associé) change de 20 à 25 :
--   - public._add_player_to_game   (dernière version : 0033_public_games.sql)
--   - public.join_game             (dernière version : 0048_admin_rpcs.sql)
--   - public.request_join_public_game (dernière version : 0048_admin_rpcs.sql)
--   - public.start_game            (dernière version : 0052_enfant_sauvage.sql)
--
-- compute_default_role_counts (répartition des rôles spéciaux) n'a pas besoin
-- de changer : le nombre de Loups-Garous y est déjà calculé proportionnellement
-- (round(joueurs * 0.25)), pas via une table de paliers plafonnée à 20.
-- ============================================================================
set search_path = public;

-- ----------------------------------------------------------------------------
-- _add_player_to_game : reprise à l'identique de 0033_public_games.sql,
-- seuil 20 → 25.
-- ----------------------------------------------------------------------------
create or replace function public._add_player_to_game(p_game_id uuid, p_user_id uuid, p_display_name text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count int;
  v_seat int;
  v_icon text;
begin
  select count(*) into v_count from public.game_players where game_id = p_game_id;
  if v_count >= 25 then
    raise exception 'Cette partie est complète (25 joueurs maximum).';
  end if;

  v_seat := v_count + 1;
  select avatar_icon into v_icon from public.profiles where id = p_user_id;

  insert into public.game_players (game_id, user_id, display_name, seat_number, is_host, avatar_color, avatar_icon)
  values (p_game_id, p_user_id, coalesce(nullif(trim(p_display_name), ''), 'Joueur'), v_seat, false, public.random_avatar_color(), v_icon);

  insert into public.game_log (game_id, message)
  values (p_game_id, coalesce(nullif(trim(p_display_name), ''), 'Un joueur') || ' a rejoint la partie.');
end;
$$;

-- ----------------------------------------------------------------------------
-- join_game : reprise à l'identique de 0048_admin_rpcs.sql, seuil 20 → 25.
-- ----------------------------------------------------------------------------
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
  if v_existing >= 25 then
    raise exception 'Cette partie est complète (25 joueurs maximum).';
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

-- ----------------------------------------------------------------------------
-- request_join_public_game : reprise à l'identique de 0048_admin_rpcs.sql,
-- seuil 20 → 25.
-- ----------------------------------------------------------------------------
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
  if v_game.status = 'lobby' and v_count >= 25 then
    raise exception 'Cette partie est complète (25 joueurs maximum).';
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

-- ----------------------------------------------------------------------------
-- start_game : reprise à l'identique de 0052_enfant_sauvage.sql, seuil
-- 20 → 25.
-- ----------------------------------------------------------------------------
create or replace function public.start_game(p_game_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_game public.games%rowtype;
  v_players uuid[];
  v_count int;
  v_role_counts jsonb;
  v_roles text[] := array[]::text[];
  v_shuffled text[];
  v_special_total int;
  v_seconds int;
  v_thief_extra text[];
begin
  select * into v_game from public.games where id = p_game_id for update;
  if not found then raise exception 'Partie introuvable.'; end if;
  if v_game.host_id <> v_user then raise exception 'Seul l’hôte peut démarrer la partie.'; end if;
  if v_game.status <> 'lobby' then raise exception 'La partie a déjà démarré.'; end if;

  select array_agg(user_id order by seat_number) into v_players
  from public.game_players where game_id = p_game_id;

  v_count := coalesce(array_length(v_players, 1), 0);
  if v_count < 4 then raise exception 'Il faut au moins 4 joueurs pour commencer.'; end if;
  if v_count > 25 then raise exception 'Une partie ne peut pas dépasser 25 joueurs.'; end if;

  v_role_counts := v_game.settings -> 'role_counts';
  if v_role_counts is null or v_role_counts = 'null'::jsonb then
    v_role_counts := public.compute_default_role_counts(v_count);
  end if;

  v_special_total := (v_role_counts->>'loup_garou')::int
    + (v_role_counts->>'voyante')::boolean::int
    + (v_role_counts->>'sorciere')::boolean::int
    + (v_role_counts->>'chasseur')::boolean::int
    + (v_role_counts->>'petite_fille')::boolean::int
    + (v_role_counts->>'cupidon')::boolean::int
    + coalesce((v_role_counts->>'ancien')::boolean::int, 0)
    + coalesce((v_role_counts->>'voleur')::boolean::int, 0)
    + coalesce((v_role_counts->>'enfant_sauvage')::boolean::int, 0);

  if (v_role_counts->>'loup_garou')::int < 1 then
    raise exception 'Il faut au moins un Loup-Garou.';
  end if;
  if v_special_total > v_count then
    raise exception 'La configuration des rôles dépasse le nombre de joueurs.';
  end if;

  for i in 1..(v_role_counts->>'loup_garou')::int loop
    v_roles := v_roles || 'loup_garou'::text;
  end loop;
  if (v_role_counts->>'voyante')::boolean then v_roles := v_roles || 'voyante'::text; end if;
  if (v_role_counts->>'sorciere')::boolean then v_roles := v_roles || 'sorciere'::text; end if;
  if (v_role_counts->>'chasseur')::boolean then v_roles := v_roles || 'chasseur'::text; end if;
  if (v_role_counts->>'petite_fille')::boolean then v_roles := v_roles || 'petite_fille'::text; end if;
  if (v_role_counts->>'cupidon')::boolean then v_roles := v_roles || 'cupidon'::text; end if;
  if coalesce((v_role_counts->>'ancien')::boolean, false) then v_roles := v_roles || 'ancien'::text; end if;
  if coalesce((v_role_counts->>'enfant_sauvage')::boolean, false) then v_roles := v_roles || 'enfant_sauvage'::text; end if;
  if coalesce((v_role_counts->>'voleur')::boolean, false) then
    v_roles := v_roles || 'voleur'::text;
    v_thief_extra := array['loup_garou', 'villageois'];
  end if;

  while coalesce(array_length(v_roles, 1), 0) < v_count loop
    v_roles := v_roles || 'villageois'::text;
  end loop;

  select array_agg(r order by random()) into v_shuffled from unnest(v_roles) r;

  for i in 1..v_count loop
    insert into public.game_roles_secret (game_id, user_id, role)
    values (p_game_id, v_players[i], v_shuffled[i]);
  end loop;

  select coalesce((v_game.settings->>'role_reveal_intro_seconds')::int, 60) into v_seconds;

  update public.game_players set is_ready = false where game_id = p_game_id;

  update public.games
  set status = 'role_reveal',
      night_number = 0,
      night_step = null,
      phase_deadline = now() + make_interval(secs => v_seconds),
      settings = jsonb_set(settings, '{role_counts}', v_role_counts),
      thief_extra_roles = v_thief_extra,
      village_powers_disabled = false,
      captain_pending = null
  where id = p_game_id;

  insert into public.game_log (game_id, message)
  values (p_game_id, '🎭 Les rôles ont été distribués en secret. Regardez votre carte...');
end;
$$;
