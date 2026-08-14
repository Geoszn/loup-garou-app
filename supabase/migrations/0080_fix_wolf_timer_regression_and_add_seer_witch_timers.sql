-- ============================================================================
-- Signalement utilisateur : "les Loups-Garous devraient avoir 3 minutes de
-- discussion (wolf_chat_seconds = 180 par défaut), mais je viens de recevoir
-- seulement 60 secondes."
--
-- BUG CORRIGÉ (régression ancienne, réintroduite en 0053, invisible depuis) :
-- step_duration_seconds (0011/0025) donne bien une durée dédiée par étape de
-- nuit (wolf_chat_seconds pour les Loups, night_step_seconds pour le reste),
-- et begin_night l'utilise correctement pour la toute première étape d'une
-- nuit. Mais la branche d'advance_phase qui fait avancer la nuit d'une étape
-- à l'autre (Voyante -> Loups -> Sorcière, etc.) a été réécrite en 0053 à
-- partir d'une base antérieure à 0025 : elle utilise `night_step_seconds`
-- pour TOUTES les étapes, y compris les Loups-Garous, exactement le même bug
-- que 0025 avait déjà corrigé une première fois (voir son commentaire). La
-- réécriture de 0058 (correctif du blocage du récap de vote) est repartie de
-- cette même base regressée sans le remarquer. Un hôte qui règle
-- night_step_seconds plus bas que wolf_chat_seconds (cas très courant : ce
-- réglage est pensé pour Voyante/Sorcière/etc., pas pour les Loups) voit donc
-- sa durée de chat des Loups silencieusement écrasée par une valeur plus
-- courte, sans aucune erreur ni message.
--
-- Deuxième partie de la demande : la Voyante et la Sorcière partageaient
-- jusqu'ici le même réglage générique `night_step_seconds` que Voleur/
-- Cupidon/Enfant Sauvage, sans possibilité de leur donner plus de temps
-- individuellement (retour utilisateur : la Voyante n'a pas assez de temps
-- pour bien regarder sa carte). Ajout de deux réglages dédiés,
-- `voyante_seconds` et `sorciere_seconds`, même mécanique que
-- `wolf_chat_seconds` — par défaut alignés sur l'ancien comportement (70s,
-- comme night_step_seconds) pour ne rien changer aux parties existantes tant
-- que l'hôte ne les personnalise pas.
-- ============================================================================
set search_path = public;

-- ----------------------------------------------------------------------------
-- step_duration_seconds : ajoute les branches 'voyante'/'sorciere'. Voleur,
-- Cupidon et Enfant Sauvage restent sur night_step_seconds (générique),
-- inchangé.
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
    when 'voyante' then coalesce((settings->>'voyante_seconds')::int, (settings->>'night_step_seconds')::int, 70)
    when 'sorciere' then coalesce((settings->>'sorciere_seconds')::int, (settings->>'night_step_seconds')::int, 70)
    else coalesce((settings->>'night_step_seconds')::int, 70)
  end
  from public.games where id = p_game_id;
$$;

grant execute on function public.step_duration_seconds(uuid, text) to authenticated;

-- ----------------------------------------------------------------------------
-- advance_phase : reprise intégrale de la version actuelle (0058), seul
-- changement — la transition d'une étape de nuit à l'autre repasse par
-- step_duration_seconds au lieu de night_step_seconds en dur, comme
-- begin_night le fait déjà depuis 0025/0028.
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
      -- BUG corrigé : utilise step_duration_seconds (durée dédiée par étape —
      -- wolf_chat_seconds pour les Loups, voyante_seconds/sorciere_seconds
      -- pour Voyante/Sorcière, night_step_seconds pour le reste) au lieu de
      -- night_step_seconds en dur pour TOUTES les étapes. Voir le
      -- commentaire en tête de cette migration.
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

-- ----------------------------------------------------------------------------
-- create_game : reprise intégrale de la version actuelle (0077), ajoute les
-- deux nouveaux réglages avec les mêmes valeurs par défaut que
-- night_step_seconds (70s) — aucun changement de comportement tant que
-- l'hôte ne les personnalise pas. Même signature, pas de risque de
-- surcharge, pas de DROP nécessaire.
-- ----------------------------------------------------------------------------
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
    'vote_recap_seconds', coalesce((p_settings->>'vote_recap_seconds')::int, 30),
    'night_step_seconds', coalesce((p_settings->>'night_step_seconds')::int, 70),
    'wolf_chat_seconds', coalesce((p_settings->>'wolf_chat_seconds')::int, 180),
    'voyante_seconds', coalesce((p_settings->>'voyante_seconds')::int, 70),
    'sorciere_seconds', coalesce((p_settings->>'sorciere_seconds')::int, 70),
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

-- ----------------------------------------------------------------------------
-- update_game_settings : reprise intégrale de la version actuelle (0030),
-- ajoute voyante_seconds/sorciere_seconds à la liste blanche, mêmes bornes
-- que night_step_seconds (20-180s).
-- ----------------------------------------------------------------------------
create or replace function public.update_game_settings(p_game_id uuid, p_settings jsonb)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_game public.games%rowtype;
  v_clamped jsonb := '{}'::jsonb;
begin
  select * into v_game from public.games where id = p_game_id for update;
  if not found then raise exception 'Partie introuvable.'; end if;
  if v_game.host_id <> v_user then raise exception 'Seul l’hôte peut modifier les réglages.'; end if;
  if v_game.status <> 'lobby' then raise exception 'La partie a déjà démarré.'; end if;

  if p_settings ? 'role_counts' then
    v_clamped := v_clamped || jsonb_build_object('role_counts', p_settings->'role_counts');
  end if;
  if p_settings ? 'role_reveal_intro_seconds' then
    v_clamped := v_clamped || jsonb_build_object(
      'role_reveal_intro_seconds', greatest(15, least(180, (p_settings->>'role_reveal_intro_seconds')::int))
    );
  end if;
  if p_settings ? 'discussion_seconds' then
    v_clamped := v_clamped || jsonb_build_object(
      'discussion_seconds', greatest(30, least(900, (p_settings->>'discussion_seconds')::int))
    );
  end if;
  if p_settings ? 'vote_seconds' then
    v_clamped := v_clamped || jsonb_build_object(
      'vote_seconds', greatest(15, least(180, (p_settings->>'vote_seconds')::int))
    );
  end if;
  if p_settings ? 'vote_recap_seconds' then
    v_clamped := v_clamped || jsonb_build_object(
      'vote_recap_seconds', greatest(10, least(180, (p_settings->>'vote_recap_seconds')::int))
    );
  end if;
  if p_settings ? 'night_step_seconds' then
    v_clamped := v_clamped || jsonb_build_object(
      'night_step_seconds', greatest(20, least(180, (p_settings->>'night_step_seconds')::int))
    );
  end if;
  if p_settings ? 'wolf_chat_seconds' then
    v_clamped := v_clamped || jsonb_build_object(
      'wolf_chat_seconds', greatest(30, least(300, (p_settings->>'wolf_chat_seconds')::int))
    );
  end if;
  if p_settings ? 'voyante_seconds' then
    v_clamped := v_clamped || jsonb_build_object(
      'voyante_seconds', greatest(20, least(180, (p_settings->>'voyante_seconds')::int))
    );
  end if;
  if p_settings ? 'sorciere_seconds' then
    v_clamped := v_clamped || jsonb_build_object(
      'sorciere_seconds', greatest(20, least(180, (p_settings->>'sorciere_seconds')::int))
    );
  end if;

  update public.games set settings = v_game.settings || v_clamped where id = p_game_id;
end;
$$;

grant execute on function public.create_game(text, jsonb, boolean) to authenticated;
grant execute on function public.update_game_settings(uuid, jsonb) to authenticated;
