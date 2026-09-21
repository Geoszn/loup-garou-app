-- ============================================================================
-- Corrige un scénario signalé par l'utilisateur : si la mort d'un joueur
-- (posant games.revival_pending, voir migration 0172) déclenche AUSSI la
-- fin de la partie au même moment (ex. c'était le dernier Loup, et sa mort
-- fait gagner le village), advance_phase retournait immédiatement dès que
-- le check de victoire correspondant renvoyait vrai — SANS jamais effacer
-- revival_pending. Comme get_my_game_view ne vérifie jamais le statut de la
-- partie pour calculer pending_action_required = 'revival_choice' (juste
-- games.revival_pending = moi), et que le tout premier garde d'advance_phase
-- (`if ... v_game.status = 'ended' ... then return`) empêche toute
-- résolution ultérieure une fois la partie terminée, ce joueur continuait de
-- voir le panneau "Voulez-vous revenir en jeu ?" — et un "oui" éventuel
-- consommait réellement l'artefact (quantity, game_artifact_uses) sans
-- aucun effet, puisque la boucle qui applique la résurrection ne tourne
-- plus jamais après la fin de partie.
--
-- Fix : dès qu'un check_and_apply_*_win renvoie vrai (la partie vient de se
-- terminer), on efface systématiquement toute résurrection en attente avant
-- de retourner — plus aucune possibilité de répondre à cette question une
-- fois la partie réellement finie, quel que soit le joueur concerné.
-- ============================================================================
set search_path = public;

-- ----------------------------------------------------------------------------
-- 1. Nouvelle fonction utilitaire.
-- ----------------------------------------------------------------------------
create or replace function public.clear_revival_pending_if_ended(p_game_id uuid)
returns void
language sql
security definer
set search_path = public
as $$
  update public.games set revival_pending = null, revival_pending_artifact_id = null
  where id = p_game_id and status = 'ended' and revival_pending is not null;
$$;

-- ----------------------------------------------------------------------------
-- 2. advance_phase : les 7 points de sortie "la partie vient de se
-- terminer" (4 dans la résolution de nuit, 3 dans la résolution du vote de
-- jour) effacent désormais la résurrection en attente avant de retourner.
-- Reste identique à 0172 sinon.
-- ----------------------------------------------------------------------------
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
  v_revival record;
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

  -- Balance de l'Ange (migration 0152) : même patron de "drain gate" que
  -- hunter_pending/captain_pending ci-dessus — au bout du délai (45s, voir
  -- plus bas où il est posé), repli sur le comportement d'origine d'une
  -- égalité (personne n'est éliminé) plutôt que de bloquer la partie
  -- indéfiniment si le propriétaire ne répond pas.
  if v_game.balance_ange_pending is not null then
    if p_forced or (v_game.phase_deadline is not null and now() >= v_game.phase_deadline) then
      insert into public.game_log (game_id, message)
      values (p_game_id, '🗳️ Égalité des voix : personne n’est éliminé aujourd’hui.');
      update public.games set balance_ange_pending = null, balance_ange_candidates = null where id = p_game_id;
      select * into v_game from public.games where id = p_game_id;
    else
      return;
    end if;
  end if;

  -- Résurrection en attente (Pierre des Ancêtres / Larme de Renaissance,
  -- migration 0172) : même patron de "drain gate" — au bout du délai, repli
  -- sur un REFUS par défaut (jamais une consommation automatique de
  -- l'artefact sans réponse du joueur, contrairement à hunter/captain
  -- ci-dessus qui ont un fallback "actif").
  if v_game.revival_pending is not null then
    if p_forced or (v_game.phase_deadline is not null and now() >= v_game.phase_deadline) then
      update public.games set revival_pending = null, revival_pending_artifact_id = null where id = p_game_id;
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
      if v_ended then
        perform public.clear_revival_pending_if_ended(p_game_id);
        return;
      end if;

      v_ended := public.check_and_apply_chasseuse_win(p_game_id);
      if v_ended then
        perform public.clear_revival_pending_if_ended(p_game_id);
        return;
      end if;

      v_ended := public.check_and_apply_anancy_win(p_game_id);
      if v_ended then
        perform public.clear_revival_pending_if_ended(p_game_id);
        return;
      end if;

      v_ended := public.check_and_apply_win(p_game_id);
      if v_ended then
        perform public.clear_revival_pending_if_ended(p_game_id);
        return;
      end if;

      select * into v_game from public.games where id = p_game_id;

      if not v_game.anancy_swap_resolved then
        perform public.apply_anancy_swap(p_game_id, v_game.night_number);
        update public.games set anancy_swap_resolved = true where id = p_game_id;
      end if;

      if v_game.hunter_pending is not null then
        select coalesce((settings->>'night_step_seconds')::int, 40) into v_seconds from public.games where id = p_game_id;
        update public.games set phase_deadline = now() + make_interval(secs => v_seconds) where id = p_game_id;
        return;
      end if;
      if v_game.captain_pending is not null then
        update public.games set phase_deadline = now() + interval '120 seconds' where id = p_game_id;
        return;
      end if;
      if v_game.revival_pending is not null then
        select coalesce((settings->>'night_step_seconds')::int, 40) into v_seconds from public.games where id = p_game_id;
        update public.games set phase_deadline = now() + make_interval(secs => v_seconds) where id = p_game_id;
        return;
      end if;

      delete from public.chat_messages where game_id = p_game_id and channel in ('village', 'wolves');

      -- Pierre des Ancêtres / Larme de Renaissance (migration 0152/0169) :
      -- révèle les résurrections en attente juste avant de basculer vers le
      -- jour — après la suppression du chat nocturne (rien à cacher, c'est
      -- une annonce publique), avant que le jour ne commence réellement.
      -- Couvre aussi bien une mort de CETTE nuit qu'une mort par vote du
      -- jour précédent : cette bascule est la toute première occasion de
      -- "passer au jour suivant" pour les deux cas, sans distinction de
      -- cause à faire ici. Le message (et un éventuel reset de rôle) diffère
      -- selon l'artefact réellement utilisé pour CE joueur, retrouvé via
      -- game_artifact_uses. Ne contient plus QUE les joueurs ayant
      -- explicitement accepté (voir submit_revival_choice, migration 0172) —
      -- pending_revival n'est désormais posé qu'après un "oui" du joueur.
      for v_revival in
        select gp.user_id, gp.display_name from public.game_players gp
        where gp.game_id = p_game_id and gp.pending_revival = true
      loop
        update public.game_players set is_alive = true, pending_revival = false
        where game_id = p_game_id and user_id = v_revival.user_id;

        if exists (
          select 1 from public.game_artifact_uses gau
          join public.store_artifacts sa on sa.id = gau.artifact_id
          where gau.game_id = p_game_id and gau.user_id = v_revival.user_id and sa.effect_key = 'larme_renaissance'
        ) then
          update public.game_roles_secret set role = 'villageois'
          where game_id = p_game_id and user_id = v_revival.user_id;

          insert into public.game_log (game_id, message, night_number)
          values (p_game_id, '💧 ' || v_revival.display_name || ' revient d’entre les morts grâce à la Larme de Renaissance, mais en a perdu tout souvenir : il ou elle repart simple Villageois(e).', v_game.night_number);
        else
          insert into public.game_log (game_id, message, night_number)
          values (p_game_id, '🌄 ' || v_revival.display_name || ' revient d’entre les morts, grâce à la Pierre des Ancêtres !', v_game.night_number);
        end if;
      end loop;

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
    if v_ended then
      perform public.clear_revival_pending_if_ended(p_game_id);
      return;
    end if;

    v_ended := public.check_and_apply_chasseuse_win(p_game_id);
    if v_ended then
      perform public.clear_revival_pending_if_ended(p_game_id);
      return;
    end if;

    v_ended := public.check_and_apply_win(p_game_id);
    if v_ended then
      perform public.clear_revival_pending_if_ended(p_game_id);
      return;
    end if;

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
    if v_game.revival_pending is not null then
      select coalesce((settings->>'night_step_seconds')::int, 40) into v_seconds from public.games where id = p_game_id;
      update public.games set phase_deadline = now() + make_interval(secs => v_seconds) where id = p_game_id;
      return;
    end if;
    -- Balance de l'Ange : posé par resolve_day_vote_deaths juste au-dessus
    -- (dans le même appel) si une égalité éligible vient d'avoir lieu — même
    -- traitement que les deux blocs hunter/captain qui précèdent : on
    -- prolonge le délai et on attend, sans passer à day_vote_recap.
    if v_game.balance_ange_pending is not null then
      update public.games set phase_deadline = now() + interval '45 seconds' where id = p_game_id;
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