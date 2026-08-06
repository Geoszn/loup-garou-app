-- ============================================================================
-- Trois ajouts indépendants demandés par l'hôte :
--
--   1. Succession du Capitaine par le sort : si le Capitaine meurt et ne
--      désigne aucun successeur à temps (submit_captain_succession jamais
--      appelée avant la deadline), le jeu tirait jusqu'ici un trait sur le
--      titre ("le titre est perdu"). Nouveau comportement : un joueur vivant
--      est choisi au hasard pour devenir Capitaine, et tous les joueurs en
--      sont informés via le pop-up de récap (nuit ou jour selon le moment).
--
--   2. content_overrides : table générique permettant à l'admin de
--      remplacer, clé par clé (même schéma que src/i18n/translations.ts :
--      une clé, un texte FR, un texte EN), n'importe quel texte de
--      rôle (role.*) ou de règle du jeu (rules.*) sans redéploiement. Le
--      client charge ces overrides une fois au démarrage (voir
--      LanguageContext.tsx) et les superpose aux textes codés en dur —
--      aucune clé absente de la table ne change de comportement.
--
--   3. Bucket de stockage "role-cards" : permet à l'admin de remplacer
--      l'illustration de chaque carte de rôle (actuellement des fichiers
--      statiques dans public/roles/*.jpg) sans passer par un déploiement.
--      Convention : un objet par rôle, nommé "{role_id}.jpg" quel que soit
--      le type réel du fichier importé (voir RoleCard.tsx, qui tente
--      d'abord cette URL avant de retomber sur l'asset statique bundlé).
-- ============================================================================
set search_path = public;

-- Sert à distinguer, dans le journal, le message "succession aléatoire du
-- Capitaine" des autres lignes portant déjà le même night_number (morts,
-- etc.) — voir get_my_game_view plus bas, qui l'expose spécifiquement dans
-- vote_recap pour que VoteRecapModal puisse l'afficher en évidence.
alter table public.game_log add column if not exists kind text;

-- ----------------------------------------------------------------------------
-- content_overrides : voir en-tête. Clé libre (pas de contrainte de forme)
-- pour rester simple — c'est admin_set_content_override, réservée aux
-- comptes admin, qui en garde la maîtrise, pas une contrainte SQL.
-- ----------------------------------------------------------------------------
create table if not exists public.content_overrides (
  key text primary key,
  text_fr text,
  text_en text,
  updated_at timestamptz not null default now(),
  updated_by uuid references public.profiles (id)
);

alter table public.content_overrides enable row level security;
-- Aucune policy client : lecture via get_content_overrides (public), écriture
-- uniquement via admin_set_content_override / admin_delete_content_override.

-- ----------------------------------------------------------------------------
-- get_content_overrides : lecture PUBLIQUE (anon + authenticated) — ce n'est
-- pas une donnée sensible, tous les joueurs doivent la charger pour afficher
-- les bons textes, pas seulement l'admin.
-- ----------------------------------------------------------------------------
create or replace function public.get_content_overrides()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    jsonb_object_agg(key, jsonb_build_object('fr', text_fr, 'en', text_en)),
    '{}'::jsonb
  )
  from public.content_overrides;
$$;

grant execute on function public.get_content_overrides() to anon, authenticated;

-- ----------------------------------------------------------------------------
-- admin_set_content_override : upsert d'un texte. p_text_fr/p_text_en à null
-- ou vide laisse la clé retomber sur le texte codé en dur côté client pour
-- CETTE langue précise (voir LanguageContext.tsx : on ne superpose que les
-- valeurs non vides).
-- ----------------------------------------------------------------------------
create or replace function public.admin_set_content_override(p_key text, p_text_fr text, p_text_en text)
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
  if p_key is null or length(trim(p_key)) = 0 then
    raise exception 'Clé invalide.';
  end if;

  insert into public.content_overrides (key, text_fr, text_en, updated_at, updated_by)
  values (p_key, nullif(p_text_fr, ''), nullif(p_text_en, ''), now(), v_admin)
  on conflict (key) do update
    set text_fr = excluded.text_fr, text_en = excluded.text_en, updated_at = now(), updated_by = v_admin;

  insert into public.admin_audit_log (admin_id, action, target, details)
  values (v_admin, 'set_content_override', p_key, jsonb_build_object('text_fr', p_text_fr, 'text_en', p_text_en));
end;
$$;

grant execute on function public.admin_set_content_override(text, text, text) to authenticated;

-- ----------------------------------------------------------------------------
-- admin_delete_content_override : retour au texte par défaut codé en dur.
-- ----------------------------------------------------------------------------
create or replace function public.admin_delete_content_override(p_key text)
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

  delete from public.content_overrides where key = p_key;

  insert into public.admin_audit_log (admin_id, action, target, details)
  values (v_admin, 'reset_content_override', p_key, null);
end;
$$;

grant execute on function public.admin_delete_content_override(text) to authenticated;

-- ----------------------------------------------------------------------------
-- Bucket "role-cards" : lecture publique (les illustrations doivent
-- s'afficher pour tous les joueurs, pas seulement les admins), écriture
-- réservée aux comptes admin.
-- ----------------------------------------------------------------------------
insert into storage.buckets (id, name, public)
values ('role-cards', 'role-cards', true)
on conflict (id) do nothing;

drop policy if exists "role-cards public read" on storage.objects;
create policy "role-cards public read"
  on storage.objects for select
  using (bucket_id = 'role-cards');

drop policy if exists "role-cards admin insert" on storage.objects;
create policy "role-cards admin insert"
  on storage.objects for insert
  with check (bucket_id = 'role-cards' and public.is_admin_user(auth.uid()));

drop policy if exists "role-cards admin update" on storage.objects;
create policy "role-cards admin update"
  on storage.objects for update
  using (bucket_id = 'role-cards' and public.is_admin_user(auth.uid()));

drop policy if exists "role-cards admin delete" on storage.objects;
create policy "role-cards admin delete"
  on storage.objects for delete
  using (bucket_id = 'role-cards' and public.is_admin_user(auth.uid()));

-- ----------------------------------------------------------------------------
-- advance_phase : reprise de 0028_reset_chat_per_phase.sql. Seul changement —
-- le bloc de timeout de captain_pending : au lieu d'abandonner le titre, un
-- joueur vivant est tiré au sort pour devenir Capitaine. Le message est
-- taggé night_number = v_game.night_number (comme kill_player) pour
-- apparaître dans le récap de nuit (night_recap, déjà générique), et
-- kind = 'captain_random' pour que get_my_game_view puisse l'exposer
-- distinctement dans vote_recap (récap de jour, qui ne montre pas le
-- journal brut).
-- ----------------------------------------------------------------------------
create or replace function public.advance_phase(p_game_id uuid, p_forced boolean default false)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_game public.games%rowtype;
  v_next_step text;
  v_seconds int;
  v_ended boolean;
  v_random_id uuid;
  v_random_name text;
begin
  select * into v_game from public.games where id = p_game_id for update;
  if not found or v_game.status = 'ended' or v_game.status = 'lobby' then
    return;
  end if;

  if not p_forced and v_game.phase_deadline is not null and now() < v_game.phase_deadline then
    return;
  end if;

  -- un tir de chasseur est en attente : on ne peut pas avancer davantage
  if v_game.hunter_pending is not null then
    if p_forced or (v_game.phase_deadline is not null and now() >= v_game.phase_deadline) then
      insert into public.game_log (game_id, message)
      select p_game_id, gp.display_name || ' (Chasseur) n’a pas tiré à temps.'
      from public.game_players gp where gp.game_id = p_game_id and gp.user_id = v_game.hunter_pending;

      update public.games set hunter_pending = null, hunter_context = null where id = p_game_id;
      select * into v_game from public.games where id = p_game_id;
    else
      return;
    end if;
  end if;

  -- une succession du Capitaine est en attente : passé le délai, le sort
  -- désigne un joueur vivant au hasard plutôt que de laisser le titre se
  -- perdre.
  if v_game.captain_pending is not null then
    if p_forced or (v_game.phase_deadline is not null and now() >= v_game.phase_deadline) then
      select user_id, display_name into v_random_id, v_random_name
      from public.game_players
      where game_id = p_game_id and is_alive
      order by random()
      limit 1;

      if v_random_id is not null then
        update public.game_players set is_captain = false where game_id = p_game_id and user_id = v_game.captain_pending;
        update public.game_players set is_captain = true where game_id = p_game_id and user_id = v_random_id;

        insert into public.game_log (game_id, message, night_number, kind)
        values (
          p_game_id,
          '🎖️ Personne n’a désigné de successeur à temps : le sort en a décidé — ' || v_random_name || ' devient le nouveau Capitaine !',
          v_game.night_number,
          'captain_random'
        );
      else
        -- Filet de sécurité (ne devrait jamais arriver en pratique) : aucun
        -- joueur vivant à qui donner le titre.
        insert into public.game_log (game_id, message, night_number)
        select p_game_id, gp.display_name || ' (ancien Capitaine) n’a pas désigné de successeur à temps : le titre est perdu.', v_game.night_number
        from public.game_players gp where gp.game_id = p_game_id and gp.user_id = v_game.captain_pending;
      end if;

      update public.games set captain_pending = null where id = p_game_id;
      select * into v_game from public.games where id = p_game_id;
    else
      return;
    end if;
  end if;

  if v_game.status = 'role_reveal' then
    if coalesce((v_game.settings->'role_counts'->>'capitaine')::boolean, false)
      and not exists (select 1 from public.game_players where game_id = p_game_id and is_captain)
    then
      select coalesce((v_game.settings->>'vote_seconds')::int, 45) into v_seconds;
      update public.games
      set status = 'captain_election', phase_deadline = now() + make_interval(secs => v_seconds)
      where id = p_game_id;
      insert into public.game_log (game_id, message)
      values (p_game_id, '🎖️ Élisez votre Capitaine avant que la nuit ne tombe !');
      return;
    end if;
    perform public.begin_night(p_game_id, 1);
    return;
  end if;

  if v_game.status = 'captain_election' then
    perform public.resolve_captain_election(p_game_id);
    perform public.begin_night(p_game_id, 1);
    return;
  end if;

  if v_game.status = 'night' then
    if v_game.night_step = 'resolve' then
      if not v_game.night_deaths_resolved then
        perform public.resolve_night_deaths(p_game_id);
      end if;

      v_ended := public.check_and_apply_win(p_game_id);
      if v_ended then return; end if;

      select * into v_game from public.games where id = p_game_id;
      if v_game.hunter_pending is not null then
        select coalesce((settings->>'night_step_seconds')::int, 40) into v_seconds from public.games where id = p_game_id;
        update public.games set phase_deadline = now() + make_interval(secs => v_seconds) where id = p_game_id;
        return;
      end if;
      if v_game.captain_pending is not null then
        select coalesce((settings->>'night_step_seconds')::int, 70) into v_seconds from public.games where id = p_game_id;
        update public.games set phase_deadline = now() + make_interval(secs => v_seconds) where id = p_game_id;
        return;
      end if;

      -- La nuit qui vient de se terminer est effacée du chat (village
      -- anonyme + loups) avant que le jour ne commence.
      delete from public.chat_messages where game_id = p_game_id and channel in ('village', 'wolves');

      select coalesce((settings->>'role_reveal_seconds')::int, 15) into v_seconds from public.games where id = p_game_id;
      update public.games
      set status = 'day_reveal', phase_deadline = now() + make_interval(secs => greatest(v_seconds, 6))
      where id = p_game_id;
      return;
    else
      v_next_step := public.next_night_step(p_game_id, v_game.night_number, v_game.night_step);
      select coalesce((settings->>'night_step_seconds')::int, 40) into v_seconds from public.games where id = p_game_id;
      update public.games
      set night_step = coalesce(v_next_step, 'resolve'),
          phase_deadline = now() + make_interval(secs => v_seconds)
      where id = p_game_id;
      -- si aucune étape suivante, on résout immédiatement pour ne pas attendre un tick de plus
      if v_next_step is null then
        perform public.advance_phase(p_game_id, true);
      end if;
      return;
    end if;
  end if;

  if v_game.status = 'day_reveal' then
    select coalesce((settings->>'discussion_seconds')::int, 180) into v_seconds from public.games where id = p_game_id;
    update public.games
    set status = 'day_discussion', phase_deadline = now() + make_interval(secs => v_seconds)
    where id = p_game_id;
    insert into public.game_log (game_id, message) values (p_game_id, '💬 Le village débat. Qui soupçonnez-vous ?');
    return;
  end if;

  if v_game.status = 'day_discussion' then
    select coalesce((settings->>'vote_seconds')::int, 45) into v_seconds from public.games where id = p_game_id;
    update public.games
    set status = 'day_vote', phase_deadline = now() + make_interval(secs => v_seconds), day_vote_resolved = false
    where id = p_game_id;
    insert into public.game_log (game_id, message) values (p_game_id, '🗳️ Le vote est ouvert !');
    return;
  end if;

  if v_game.status = 'day_vote' then
    if not v_game.day_vote_resolved then
      perform public.resolve_day_vote_deaths(p_game_id);
    end if;

    v_ended := public.check_and_apply_win(p_game_id);
    if v_ended then return; end if;

    select * into v_game from public.games where id = p_game_id;
    if v_game.hunter_pending is not null then
      select coalesce((settings->>'night_step_seconds')::int, 40) into v_seconds from public.games where id = p_game_id;
      update public.games set phase_deadline = now() + make_interval(secs => v_seconds) where id = p_game_id;
      return;
    end if;
    if v_game.captain_pending is not null then
      select coalesce((settings->>'night_step_seconds')::int, 70) into v_seconds from public.games where id = p_game_id;
      update public.games set phase_deadline = now() + make_interval(secs => v_seconds) where id = p_game_id;
      return;
    end if;

    select coalesce((settings->>'vote_recap_seconds')::int, 90) into v_seconds from public.games where id = p_game_id;
    update public.games
    set status = 'day_vote_recap', phase_deadline = now() + make_interval(secs => v_seconds)
    where id = p_game_id;
    return;
  end if;
end;
$$;

-- ----------------------------------------------------------------------------
-- get_my_game_view : reprise de 0049_auto_close_inactive_games.sql, ajoute
-- 'captain_random_notice' dans vote_recap — la ligne de journal
-- kind = 'captain_random' de CE round de vote, si elle existe (récap de
-- nuit : pas besoin d'ajout, night_recap remonte déjà tout le journal taggé
-- de cette nuit, message inclus).
-- ----------------------------------------------------------------------------
create or replace function public.get_my_game_view(p_game_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_game public.games%rowtype;
  v_my_role text;
  v_my_alive boolean;
  v_lover_id uuid;
  v_wild_child_mentor uuid;
  v_result jsonb;
begin
  if not exists (select 1 from public.game_players where game_id = p_game_id and user_id = v_user) then
    raise exception 'Vous ne participez pas à cette partie.';
  end if;

  select * into v_game from public.games where id = p_game_id;

  if v_game.status <> 'ended' and v_game.last_activity_at < now() - interval '2 hours' then
    update public.games set status = 'ended' where id = p_game_id;
    insert into public.game_log (game_id, message)
    values (p_game_id, 'La partie a été fermée automatiquement après 2h d''inactivité.');
    v_game.status := 'ended';
  end if;

  select role into v_my_role from public.game_roles_secret where game_id = p_game_id and user_id = v_user;
  select is_alive into v_my_alive from public.game_players where game_id = p_game_id and user_id = v_user;
  select lover_with, wild_child_mentor into v_lover_id, v_wild_child_mentor
  from public.game_roles_secret where game_id = p_game_id and user_id = v_user;

  select jsonb_build_object(
    'game', to_jsonb(v_game) - 'thief_extra_roles',

    'players', coalesce((
      select jsonb_agg(to_jsonb(gp) order by gp.seat_number)
      from public.game_players gp where gp.game_id = p_game_id
    ), '[]'::jsonb),

    'my_role', v_my_role,
    'my_alive', coalesce(v_my_alive, false),
    'lover_id', v_lover_id,
    'wild_child_mentor', v_wild_child_mentor,

    'thief_extra_roles', case when v_my_role = 'voleur' then v_game.thief_extra_roles else null end,

    'wolf_teammates', case when v_my_role = 'loup_garou' then coalesce((
      select jsonb_agg(rs.user_id)
      from public.game_roles_secret rs
      where rs.game_id = p_game_id and rs.role = 'loup_garou' and rs.user_id <> v_user
    ), '[]'::jsonb) else null end,

    'seer_reveals', case when v_my_role = 'voyante' then coalesce((
      select jsonb_agg(jsonb_build_object(
        'target_id', na.target_id,
        'role', rs.role,
        'night_number', na.night_number
      ) order by na.night_number)
      from public.night_actions na
      join public.game_roles_secret rs on rs.game_id = na.game_id and rs.user_id = na.target_id
      where na.game_id = p_game_id and na.step = 'voyante' and na.actor_id = v_user
    ), '[]'::jsonb) else null end,

    'witch_heal_used', case when v_my_role = 'sorciere' then (
      select heal_potion_used from public.game_roles_secret where game_id = p_game_id and user_id = v_user
    ) else null end,

    'witch_poison_used', case when v_my_role = 'sorciere' then (
      select poison_potion_used from public.game_roles_secret where game_id = p_game_id and user_id = v_user
    ) else null end,

    'wolf_target_visible_to_witch', case
      when v_my_role = 'sorciere' and v_game.status = 'night' and v_game.night_step = 'sorciere'
      then public.get_wolf_target(p_game_id, v_game.night_number)
      else null
    end,

    'wolf_current_votes', case when v_my_role = 'loup_garou' and v_game.status = 'night' and v_game.night_step = 'loup_garou' then coalesce((
      select jsonb_agg(jsonb_build_object('actor_id', actor_id, 'target_id', target_id))
      from public.night_actions
      where game_id = p_game_id and night_number = v_game.night_number and step = 'loup_garou'
    ), '[]'::jsonb) else null end,

    'my_vote_target', (
      select target_id from public.votes
      where game_id = p_game_id and round_number = v_game.night_number and voter_id = v_user
    ),

    'my_captain_vote_target', (
      select target_id from public.votes
      where game_id = p_game_id and round_number = 0 and voter_id = v_user
    ),

    'vote_call_agreed_ids', case when v_game.status = 'day_discussion' then coalesce((
      select jsonb_agg(user_id) from public.vote_call_agreements
      where game_id = p_game_id and day_number = v_game.night_number
    ), '[]'::jsonb) else '[]'::jsonb end,

    'day_reveal_ready_ids', case when v_game.status = 'day_reveal' then coalesce((
      select jsonb_agg(user_id) from public.day_reveal_ready
      where game_id = p_game_id and round_number = v_game.night_number
    ), '[]'::jsonb) else '[]'::jsonb end,

    'night_recap', case when v_game.status = 'day_reveal' then coalesce((
      select jsonb_agg(jsonb_build_object('id', id, 'message', message) order by created_at asc)
      from public.game_log
      where game_id = p_game_id and night_number = v_game.night_number
    ), '[]'::jsonb) else '[]'::jsonb end,

    'vote_recap', case when v_game.status = 'day_vote_recap' then jsonb_build_object(
      'votes', coalesce((
        select jsonb_agg(jsonb_build_object('voter_id', voter_id, 'target_id', target_id))
        from public.votes where game_id = p_game_id and round_number = v_game.night_number
      ), '[]'::jsonb),
      'ready_ids', coalesce((
        select jsonb_agg(user_id) from public.vote_recap_ready
        where game_id = p_game_id and round_number = v_game.night_number
      ), '[]'::jsonb),
      'captain_voter_id', v_game.last_vote_captain_id,
      'captain_random_notice', (
        select message from public.game_log
        where game_id = p_game_id and night_number = v_game.night_number and kind = 'captain_random'
        order by created_at desc limit 1
      )
    ) else null end,

    'join_requests', case
      when v_game.host_id = v_user and v_game.status = 'lobby' then coalesce((
        select jsonb_agg(jsonb_build_object(
          'id', id, 'user_id', user_id, 'display_name', display_name, 'created_at', created_at
        ) order by created_at asc)
        from public.game_join_requests
        where game_id = p_game_id and status = 'pending'
      ), '[]'::jsonb)
      else null
    end,

    'pending_action_required', case
      when v_game.hunter_pending = v_user then 'hunter'
      when v_game.captain_pending = v_user then 'captain_succession'
      when v_game.status = 'captain_election' and v_my_alive
        and not exists (
          select 1 from public.votes
          where game_id = p_game_id and round_number = 0 and voter_id = v_user
        )
      then 'captain_vote'
      when v_game.status = 'night' and v_my_alive and v_my_role = v_game.night_step
        and not exists (
          select 1 from public.night_actions
          where game_id = p_game_id and night_number = v_game.night_number
            and step = v_game.night_step and actor_id = v_user
        )
      then v_game.night_step
      when v_game.status = 'day_vote' and v_my_alive
        and not exists (
          select 1 from public.votes
          where game_id = p_game_id and round_number = v_game.night_number and voter_id = v_user
        )
      then 'vote'
      else null
    end,

    'final_reveal', case when v_game.status = 'ended' then coalesce((
      select jsonb_agg(jsonb_build_object('user_id', rs.user_id, 'role', rs.role))
      from public.game_roles_secret rs where rs.game_id = p_game_id
    ), '[]'::jsonb) else null end,

    'log', coalesce((
      select jsonb_agg(jsonb_build_object('id', id, 'message', message, 'created_at', created_at) order by created_at desc)
      from (
        select id, message, created_at from public.game_log
        where game_id = p_game_id order by created_at desc limit 60
      ) recent
    ), '[]'::jsonb)
  ) into v_result;

  return v_result;
end;
$$;
