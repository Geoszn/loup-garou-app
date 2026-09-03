-- ============================================================================
-- Rallonge le délai de désignation du successeur du Capitaine : il
-- réutilisait jusqu'ici 'night_step_seconds' (70s par défaut, mais peut
-- être réglé bien plus bas par l'hôte pour une partie rapide — c'est un
-- délai pensé pour des actions de nuit récurrentes où le joueur sait déjà
-- que son tour approche, pas pour une décision ponctuelle et inattendue
-- prise juste après avoir appris sa propre mort). Passé à une constante
-- fixe de 120s, indépendante des réglages de la partie — voir aussi le
-- renfort visuel côté client (ActionPanel.tsx, CaptainSuccessionPanel).
--
-- Signalement utilisateur : "le capitaine n'a pas eu l'opportunité de
-- voter son successeur" (partie URPVNC) — le panneau s'affichait bien
-- (correctif du 21 août déjà en place) et le délai s'est bien écoulé
-- normalement (~70s), mais 70s s'est révélé trop court pour réagir à une
-- information aussi soudaine.
-- ============================================================================
set search_path = public;

create or replace function public.advance_phase(p_game_id uuid, p_forced boolean DEFAULT false)
returns void
language plpgsql
security definer
set search_path = public
as $function$
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

  if not p_forced and v_game.phase_deadline is not null and now() < v_game.phase_deadline + interval '2 seconds' then
    return;
  end if;

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

      v_ended := public.check_and_apply_ange_win(p_game_id);
      if v_ended then return; end if;

      v_ended := public.check_and_apply_anancy_win(p_game_id);
      if v_ended then return; end if;

      v_ended := public.check_and_apply_win(p_game_id);
      if v_ended then return; end if;

      select * into v_game from public.games where id = p_game_id;
      if v_game.hunter_pending is not null then
        select coalesce((settings->>'night_step_seconds')::int, 40) into v_seconds from public.games where id = p_game_id;
        update public.games set phase_deadline = now() + make_interval(secs => v_seconds) where id = p_game_id;
        return;
      end if;
      if v_game.captain_pending is not null then
        -- Constante fixe (voir commentaire d'en-tête) : pas liée à
        -- night_step_seconds, pour rester généreuse même sur une partie
        -- réglée avec des tours de nuit très courts.
        update public.games set phase_deadline = now() + interval '120 seconds' where id = p_game_id;
        return;
      end if;

      delete from public.chat_messages where game_id = p_game_id and channel in ('village', 'wolves');

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

    v_ended := public.check_and_apply_ange_win(p_game_id);
    if v_ended then return; end if;

    v_ended := public.check_and_apply_win(p_game_id);
    if v_ended then return; end if;

    select * into v_game from public.games where id = p_game_id;
    if v_game.hunter_pending is not null then
      select coalesce((settings->>'night_step_seconds')::int, 40) into v_seconds from public.games where id = p_game_id;
      update public.games set phase_deadline = now() + make_interval(secs => v_seconds) where id = p_game_id;
      return;
    end if;
    if v_game.captain_pending is not null then
      update public.games set phase_deadline = now() + interval '120 seconds' where id = p_game_id;
      return;
    end if;

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
$function$;
