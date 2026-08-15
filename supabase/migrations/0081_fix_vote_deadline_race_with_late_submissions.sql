-- ============================================================================
-- Signalement utilisateur : "en cas d'égalité au vote de la journée personne
-- ne meurt, même si le Capitaine est parmi les votants et que son vote
-- compte pour 2." Analyse (voir la conversation, aucun bug trouvé dans le
-- calcul de l'égalité lui-même : quand le Capitaine vote réellement pour
-- quelqu'un, son poids double garantit toujours que son choix fait partie du
-- groupe à égalité, et resolve_day_vote_deaths le départage correctement à
-- chaque cas testé).
--
-- Le vrai coupable : une VRAIE course entre le vote du Capitaine et le tick
-- de fond. TOUS les clients connectés (voir useGame.ts) appellent tick_game
-- (-> advance_phase(force=false)) toutes les 1.5s. Dès que `now() >=
-- phase_deadline` devient vrai, le PREMIER tick de N'IMPORTE QUEL joueur à
-- atteindre le serveur verrouille la ligne `games` et résout le vote avec
-- les bulletins déjà présents. Si le vote du Capitaine part une fraction de
-- seconde avant l'échéance côté client mais arrive côté serveur juste après
-- (latence réseau/mobile), il se fait devancer : le tick résout SANS son
-- vote (donc sans son poids double ni son rôle de départage), puis son
-- propre submit_vote échoue avec "Le vote n'est pas ouvert" une fois le tick
-- passé devant lui — facile à manquer dans le feu de l'action, d'où
-- l'impression que "même si le Capitaine a voté, personne ne meurt".
--
-- Correctif : un tick PASSIF (non forcé, donc uniquement les appels
-- périodiques de tick_game) attend désormais 2s de plus après l'échéance
-- avant de résoudre quoi que ce soit — largement suffisant pour laisser
-- arriver un vote parti à temps mais retardé par le réseau. Le chemin RAPIDE
-- (dernier joueur qui vote déclenche advance_phase(force=true) directement
-- depuis submit_vote/submit_wolf_vote/etc.) n'est PAS concerné : il ignore
-- déjà ce test entièrement (p_forced = true), donc toujours instantané dès
-- que tout le monde a effectivement voté. Cette marge s'applique à TOUTES
-- les phases (vote du village, vote des loups, étapes de nuit, élection du
-- Capitaine...), qui partagent toutes le même risque de course avec
-- tick_game — pas seulement le vote du jour.
-- ============================================================================
set search_path = public;

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

  -- BUG corrigé : marge de 2s ajoutée au tick PASSIF (voir commentaire en
  -- tête de cette migration) pour laisser le temps à un vote parti à temps
  -- mais retardé par le réseau d'arriver avant qu'un tick de fond ne résolve
  -- la phase sans lui. N'affecte jamais le chemin forcé (dernier vote reçu,
  -- p_forced = true), qui reste instantané.
  if not p_forced and v_game.phase_deadline is not null and now() < v_game.phase_deadline + interval '2 seconds' then
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

  if v_game.status = 'day_vote_recap' then
    perform public.begin_night(p_game_id, v_game.night_number + 1);
    return;
  end if;
end;
$$;
