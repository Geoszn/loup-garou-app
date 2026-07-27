-- ============================================================================
-- Récap du vote du village : une fois le vote du jour dépouillé (et une fois
-- le Chasseur/la succession du Capitaine réglés, s'il y a lieu — inchangé),
-- la partie passe par un nouveau statut `day_vote_recap` qui affiche qui a
-- voté pour qui et le résultat, pendant 90s par défaut (réglage
-- `vote_recap_seconds`) — ou moins si TOUS les joueurs vivants cliquent sur
-- "Continuer" (nouvelle table vote_recap_ready, même principe que
-- vote_call_agreements).
-- ============================================================================
set search_path = public;

alter table public.games drop constraint if exists games_status_check;
alter table public.games add constraint games_status_check
  check (status in ('lobby','role_reveal','captain_election','night','day_reveal','day_discussion','day_vote','day_vote_recap','ended'));

create table if not exists public.vote_recap_ready (
  game_id uuid not null references public.games (id) on delete cascade,
  round_number int not null,
  user_id uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (game_id, round_number, user_id)
);

-- Même principe que les autres tables sensibles (votes, night_actions,
-- vote_call_agreements) : RLS activée, aucune policy — accès uniquement via
-- les fonctions security definer ci-dessous et get_my_game_view.
alter table public.vote_recap_ready enable row level security;

-- ----------------------------------------------------------------------------
-- create_game : reprise pour ajouter le réglage vote_recap_seconds (défaut
-- 90s).
-- ----------------------------------------------------------------------------
create or replace function public.create_game(p_display_name text, p_settings jsonb default null)
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

  select avatar_icon into v_icon from public.profiles where id = v_user;

  v_code := public.generate_game_code();
  v_settings := jsonb_build_object(
    'discussion_seconds', coalesce((p_settings->>'discussion_seconds')::int, 300),
    'vote_seconds', coalesce((p_settings->>'vote_seconds')::int, 45),
    'vote_recap_seconds', coalesce((p_settings->>'vote_recap_seconds')::int, 90),
    'night_step_seconds', coalesce((p_settings->>'night_step_seconds')::int, 70),
    'wolf_chat_seconds', coalesce((p_settings->>'wolf_chat_seconds')::int, 180),
    'role_reveal_seconds', coalesce((p_settings->>'role_reveal_seconds')::int, 15),
    'role_counts', p_settings->'role_counts'
  );

  insert into public.games (code, host_id, settings)
  values (v_code, v_user, v_settings)
  returning id into v_game_id;

  insert into public.game_players (game_id, user_id, display_name, seat_number, is_host, avatar_color, avatar_icon)
  values (v_game_id, v_user, coalesce(nullif(trim(p_display_name), ''), 'Joueur'), 1, true, public.random_avatar_color(), v_icon);

  insert into public.game_log (game_id, message)
  values (v_game_id, 'La partie a été créée. En attente des joueurs...');

  return jsonb_build_object('game_id', v_game_id, 'code', v_code);
end;
$$;

-- ----------------------------------------------------------------------------
-- restart_game : reprise pour nettoyer aussi vote_recap_ready.
-- ----------------------------------------------------------------------------
create or replace function public.restart_game(p_game_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_game public.games%rowtype;
begin
  select * into v_game from public.games where id = p_game_id for update;
  if not found then raise exception 'Partie introuvable.'; end if;
  if v_game.host_id <> v_user then raise exception 'Seul l’hôte peut relancer une partie.'; end if;
  if v_game.status <> 'ended' then raise exception 'La partie n’est pas terminée.'; end if;

  delete from public.game_roles_secret where game_id = p_game_id;
  delete from public.night_actions where game_id = p_game_id;
  delete from public.votes where game_id = p_game_id;
  delete from public.vote_call_agreements where game_id = p_game_id;
  delete from public.vote_recap_ready where game_id = p_game_id;
  delete from public.chat_messages where game_id = p_game_id;
  delete from public.game_log where game_id = p_game_id;

  update public.game_players
  set is_alive = true, death_cause = null, died_at_night = null, is_lover = false, revealed_role = null,
      is_captain = false, is_ready = false
  where game_id = p_game_id;

  update public.games
  set status = 'lobby',
      night_number = 0,
      night_step = null,
      phase_deadline = null,
      winner_team = null,
      hunter_pending = null,
      hunter_context = null,
      captain_pending = null,
      night_deaths_resolved = false,
      day_vote_resolved = false
  where id = p_game_id;

  insert into public.game_log (game_id, message) values (p_game_id, '🔄 Une nouvelle partie va commencer avec le même groupe !');
end;
$$;

-- ----------------------------------------------------------------------------
-- advance_phase : reprise pour insérer le récap du vote. Le vote se dépouille
-- exactement comme avant (chasseur / succession du Capitaine restent
-- prioritaires et gardent la partie en statut 'day_vote' tant qu'ils ne sont
-- pas réglés, inchangé) — c'est seulement une fois tout ça réglé qu'on bascule
-- sur 'day_vote_recap' au lieu d'enchaîner directement sur la nuit suivante.
-- Le reste de la fonction est identique à 0025_longer_timers_and_wolf_fix.sql.
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

  -- une succession du Capitaine est en attente : même principe.
  if v_game.captain_pending is not null then
    if p_forced or (v_game.phase_deadline is not null and now() >= v_game.phase_deadline) then
      insert into public.game_log (game_id, message)
      select p_game_id, gp.display_name || ' (ancien Capitaine) n’a pas désigné de successeur à temps : le titre est perdu.'
      from public.game_players gp where gp.game_id = p_game_id and gp.user_id = v_game.captain_pending;

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
        select coalesce((settings->>'night_step_seconds')::int, 70) into v_seconds from public.games where id = p_game_id;
        update public.games set phase_deadline = now() + make_interval(secs => v_seconds) where id = p_game_id;
        return;
      end if;
      if v_game.captain_pending is not null then
        select coalesce((settings->>'night_step_seconds')::int, 70) into v_seconds from public.games where id = p_game_id;
        update public.games set phase_deadline = now() + make_interval(secs => v_seconds) where id = p_game_id;
        return;
      end if;

      select coalesce((settings->>'role_reveal_seconds')::int, 15) into v_seconds from public.games where id = p_game_id;
      update public.games
      set status = 'day_reveal', phase_deadline = now() + make_interval(secs => greatest(v_seconds, 6))
      where id = p_game_id;
      return;
    else
      v_next_step := public.next_night_step(p_game_id, v_game.night_number, v_game.night_step);
      v_seconds := public.step_duration_seconds(p_game_id, coalesce(v_next_step, 'resolve'));
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
    select coalesce((settings->>'discussion_seconds')::int, 300) into v_seconds from public.games where id = p_game_id;
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
      select coalesce((settings->>'night_step_seconds')::int, 70) into v_seconds from public.games where id = p_game_id;
      update public.games set phase_deadline = now() + make_interval(secs => v_seconds) where id = p_game_id;
      return;
    end if;
    if v_game.captain_pending is not null then
      select coalesce((settings->>'night_step_seconds')::int, 70) into v_seconds from public.games where id = p_game_id;
      update public.games set phase_deadline = now() + make_interval(secs => v_seconds) where id = p_game_id;
      return;
    end if;

    -- Nouveau : plus personne n'est en attente (chasseur/Capitaine réglés) —
    -- on affiche le récap du vote avant d'enchaîner sur la nuit suivante.
    select coalesce((settings->>'vote_recap_seconds')::int, 90) into v_seconds from public.games where id = p_game_id;
    update public.games
    set status = 'day_vote_recap', phase_deadline = now() + make_interval(secs => v_seconds)
    where id = p_game_id;
    return;
  end if;

  if v_game.status = 'day_vote_recap' then
    perform public.begin_night(p_game_id, v_game.night_number + 1);
    return;
  end if;
end;
$$;

-- ----------------------------------------------------------------------------
-- submit_vote_recap_ready : un joueur vivant signale qu'il a vu le récap et
-- veut continuer. Dès que TOUS les joueurs vivants ont cliqué, la nuit
-- suivante démarre immédiatement sans attendre la fin des 90s.
-- ----------------------------------------------------------------------------
create or replace function public.submit_vote_recap_ready(p_game_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_game public.games%rowtype;
  v_alive_count int;
  v_ready_count int;
begin
  select * into v_game from public.games where id = p_game_id for update;
  if not found or v_game.status <> 'day_vote_recap' then
    raise exception 'Le récap du vote n''est plus affiché.';
  end if;
  if not exists (select 1 from public.game_players where game_id = p_game_id and user_id = v_user and is_alive) then
    raise exception 'Seuls les joueurs vivants participent au récap.';
  end if;

  insert into public.vote_recap_ready (game_id, round_number, user_id)
  values (p_game_id, v_game.night_number, v_user)
  on conflict (game_id, round_number, user_id) do nothing;

  select count(*) into v_alive_count from public.game_players where game_id = p_game_id and is_alive;
  select count(*) into v_ready_count
  from public.vote_recap_ready where game_id = p_game_id and round_number = v_game.night_number;

  if v_alive_count > 0 and v_ready_count >= v_alive_count then
    perform public.advance_phase(p_game_id, true);
  end if;
end;
$$;

grant execute on function public.submit_vote_recap_ready(uuid) to authenticated;

-- ----------------------------------------------------------------------------
-- get_my_game_view : reprise pour exposer le détail du vote (qui a voté pour
-- qui) et la liste des joueurs déjà prêts à continuer, uniquement pendant
-- 'day_vote_recap'. Le détail des votes est sans risque à révéler à ce
-- stade : le vote est déjà entièrement dépouillé et son résultat public
-- (contrairement aux votes des Loups-Garous ou aux actions de nuit, qui
-- restent secrets).
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
  v_result jsonb;
begin
  if not exists (select 1 from public.game_players where game_id = p_game_id and user_id = v_user) then
    raise exception 'Vous ne participez pas à cette partie.';
  end if;

  select * into v_game from public.games where id = p_game_id;
  select role into v_my_role from public.game_roles_secret where game_id = p_game_id and user_id = v_user;
  select is_alive into v_my_alive from public.game_players where game_id = p_game_id and user_id = v_user;
  select lover_with into v_lover_id from public.game_roles_secret where game_id = p_game_id and user_id = v_user;

  select jsonb_build_object(
    'game', to_jsonb(v_game) - 'thief_extra_roles',

    'players', coalesce((
      select jsonb_agg(to_jsonb(gp) order by gp.seat_number)
      from public.game_players gp where gp.game_id = p_game_id
    ), '[]'::jsonb),

    'my_role', v_my_role,
    'my_alive', coalesce(v_my_alive, false),
    'lover_id', v_lover_id,

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

    'little_girl_wolves', case
      when v_my_role = 'petite_fille' and exists (
        select 1 from public.night_actions
        where game_id = p_game_id and actor_id = v_user and step = 'petite_fille'
          and night_number = v_game.night_number
          and (extra->>'peek')::boolean = true and (extra->>'caught')::boolean = false
      ) then coalesce((
        select jsonb_agg(rs.user_id)
        from public.game_roles_secret rs where rs.game_id = p_game_id and rs.role = 'loup_garou'
      ), '[]'::jsonb)
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

    'vote_recap', case when v_game.status = 'day_vote_recap' then jsonb_build_object(
      'votes', coalesce((
        select jsonb_agg(jsonb_build_object('voter_id', voter_id, 'target_id', target_id))
        from public.votes where game_id = p_game_id and round_number = v_game.night_number
      ), '[]'::jsonb),
      'ready_ids', coalesce((
        select jsonb_agg(user_id) from public.vote_recap_ready
        where game_id = p_game_id and round_number = v_game.night_number
      ), '[]'::jsonb)
    ) else null end,

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
