-- ----------------------------------------------------------------------------
-- 0025_longer_timers_and_wolf_fix
--
-- 1) Nouveaux réglages par défaut demandés (les parties de test étaient trop
--    courtes pour en profiter) :
--      - discussion_seconds : 180 -> 300 (5 minutes de débat le jour)
--      - night_step_seconds : 40  -> 70  (+30s sur la plupart des étapes de
--        nuit, le temps de bien comprendre son rôle et son action)
--      - wolf_chat_seconds  : 120 -> 180 (3 minutes pour que les loups se
--        concertent avant de voter leur victime)
--
-- 2) Bug réel trouvé en creusant wolf_chat_seconds : step_duration_seconds
--    (0011_wolf_timer.sql) donne bien une durée dédiée aux loups, et
--    begin_night (jamais redéfinie depuis 0011) l'utilise correctement pour
--    la toute première étape d'une nuit. Mais advance_phase a été redéfinie
--    plusieurs fois depuis (0018, 0021) pour d'autres raisons (Capitaine,
--    prêt/vote anticipé) et, à chaque reprise, la branche qui fait avancer
--    la nuit d'une étape à l'autre est repartie d'une ancienne version
--    antérieure à 0011 : elle utilise `night_step_seconds` pour TOUTES les
--    étapes, loups compris. Comme les Loups-Garous ne sont jamais la
--    première étape d'une nuit (Cupidon/Voyante passent avant), leur étape
--    n'a donc, en pratique, jamais bénéficié de sa durée dédiée. On corrige
--    en rebranchant cette branche sur step_duration_seconds, comme
--    begin_night le fait déjà.
--
-- Le reste d'advance_phase est identique à 0021_ready_and_captain_call_vote.sql.
-- ----------------------------------------------------------------------------
create or replace function public.step_duration_seconds(p_game_id uuid, p_step text)
returns int
language sql
security definer
stable
set search_path = public
as $$
  select case p_step
    when 'loup_garou' then coalesce((settings->>'wolf_chat_seconds')::int, 180)
    else coalesce((settings->>'night_step_seconds')::int, 70)
  end
  from public.games where id = p_game_id;
$$;

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
      -- Corrigé : utilise step_duration_seconds (durée dédiée aux Loups-Garous)
      -- au lieu du night_step_seconds générique utilisé pour toutes les étapes.
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

    perform public.begin_night(p_game_id, v_game.night_number + 1);
    return;
  end if;
end;
$$;
