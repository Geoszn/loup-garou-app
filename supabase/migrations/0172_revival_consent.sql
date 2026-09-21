-- ============================================================================
-- Consentement pour les artefacts de résurrection (Pierre des Ancêtres /
-- Larme de Renaissance) — retour utilisateur explicite : jusqu'ici, kill_player
-- consommait automatiquement l'artefact et programmait le retour en jeu dès
-- la mort, sans jamais demander au joueur s'il le voulait. Après réflexion
-- avec l'utilisateur, ce principe est généralisé : "à chaque fois qu'on a
-- des artefacts qui peuvent s'activer... il faut d'abord demander si on veut
-- l'utiliser." Pour l'instant, seuls les deux artefacts de résurrection sont
-- concernés (ce sont les deux qui partagent le même déclencheur automatique
-- dans kill_player) — Feu Sacré des Ancêtres, Boussole du Village, Masque du
-- Sans-Visage et Balance de l'Ange restent inchangés (soit passifs en
-- continu, soit déjà un choix explicite par nature).
--
-- Même patron que hunter_pending/captain_pending (Chasseur qui tire,
-- Capitaine qui désigne son successeur) : un nouveau couple de colonnes sur
-- games (revival_pending / revival_pending_artifact_id), un "drain gate" en
-- tête d'advance_phase avec repli sur un REFUS par défaut si le délai
-- expire (jamais une consommation automatique sans réponse), un nouveau
-- pending_action_required = 'revival_choice', et une nouvelle RPC
-- submit_revival_choice(p_game_id, p_use) appelée par un vrai Yes/No côté
-- client (RevivalChoicePanel, ActionPanel.tsx).
--
-- kill_player continue de repérer l'artefact éligible (Pierre en priorité,
-- Larme sinon, jamais les deux) exactement comme avant, mais se contente
-- désormais de POSER la question au lieu de consommer directement — la
-- consommation réelle (pending_revival, quantity, game_artifact_uses)
-- n'a lieu que dans submit_revival_choice, uniquement si la réponse est oui.
-- ============================================================================
set search_path = public;

-- ----------------------------------------------------------------------------
-- 1. Colonnes.
-- ----------------------------------------------------------------------------
alter table public.games add column if not exists revival_pending uuid references public.profiles (id);
alter table public.games add column if not exists revival_pending_artifact_id uuid references public.store_artifacts (id);

create or replace function public.kill_player(p_game_id uuid, p_user_id uuid, p_cause text, p_night int)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_name text;
  v_role text;
  v_is_lover boolean;
  v_was_captain boolean;
  v_lover_id uuid;
  v_ancien_used boolean;
  v_wild_child_id uuid;
  v_any_wild_child_converted boolean := false;
  v_pierre_artifact_id uuid;
  v_larme_artifact_id uuid;
begin
  select role into v_role from public.game_roles_secret where game_id = p_game_id and user_id = p_user_id;

  if p_cause = 'loup_garou' and v_role = 'ancien' then
    select ancien_extra_life_used into v_ancien_used
    from public.game_roles_secret where game_id = p_game_id and user_id = p_user_id;

    if not coalesce(v_ancien_used, false) and exists (
      select 1 from public.game_players where game_id = p_game_id and user_id = p_user_id and is_alive
    ) then
      update public.game_roles_secret set ancien_extra_life_used = true
      where game_id = p_game_id and user_id = p_user_id;

      insert into public.game_log (game_id, message, night_number)
      select p_game_id, gp.display_name || ' (Ancien) encaisse l’attaque des Loups-Garous et s’accroche à la vie !', p_night
      from public.game_players gp where gp.game_id = p_game_id and gp.user_id = p_user_id;

      return;
    end if;
  end if;

  update public.game_players
  set is_alive = false, death_cause = p_cause, died_at_night = p_night, revealed_role = v_role
  where game_id = p_game_id and user_id = p_user_id and is_alive = true
  returning display_name, is_lover, is_captain into v_name, v_is_lover, v_was_captain;

  if v_name is null then
    return; -- déjà mort, rien à faire
  end if;

  insert into public.game_log (game_id, message, night_number)
  values (p_game_id, v_name || ' (' || public.role_display_name(v_role) || ') ' || public.death_phrase(p_cause), p_night);

  -- Pierre des Ancêtres (migration 0152/0153) / Larme de Renaissance
  -- (migration 0169) : retour utilisateur (migration 0172) — jusqu'ici,
  -- posséder l'un de ces deux artefacts déclenchait la résurrection
  -- automatiquement, sans qu'on demande au joueur s'il la voulait. Se
  -- contente désormais de repérer l'artefact éligible (Pierre en priorité,
  -- Larme sinon, jamais les deux) et de poser une VRAIE question
  -- (games.revival_pending / revival_pending_artifact_id) — la
  -- consommation réelle (pending_revival, quantity, game_artifact_uses)
  -- n'a lieu que dans submit_revival_choice, uniquement si le joueur
  -- répond oui. Exclu du bûcher/kick de l'hôte ('exclu' n'est de toute
  -- façon jamais une cause passée à kill_player).
  if p_cause <> 'exclu' then
    select pa.artifact_id into v_pierre_artifact_id
    from public.player_artifacts pa
    join public.store_artifacts sa on sa.id = pa.artifact_id
    where pa.user_id = p_user_id and sa.effect_key = 'pierre_ancetres' and pa.quantity > 0
      and not exists (
        select 1 from public.game_artifact_uses gau
        where gau.game_id = p_game_id and gau.user_id = p_user_id and gau.artifact_id = pa.artifact_id
      )
    limit 1;

    if v_pierre_artifact_id is null then
      select pa.artifact_id into v_larme_artifact_id
      from public.player_artifacts pa
      join public.store_artifacts sa on sa.id = pa.artifact_id
      where pa.user_id = p_user_id and sa.effect_key = 'larme_renaissance' and pa.quantity > 0
        and not exists (
          select 1 from public.game_artifact_uses gau
          where gau.game_id = p_game_id and gau.user_id = p_user_id and gau.artifact_id = pa.artifact_id
        )
      limit 1;
    end if;

    if coalesce(v_pierre_artifact_id, v_larme_artifact_id) is not null then
      update public.games
      set revival_pending = p_user_id,
          revival_pending_artifact_id = coalesce(v_pierre_artifact_id, v_larme_artifact_id)
      where id = p_game_id and revival_pending is null;
    end if;
  end if;

  if v_role = 'ancien' and p_cause = 'vote' then
    update public.games set village_powers_disabled = true where id = p_game_id;
    insert into public.game_log (game_id, message, night_number)
    values (p_game_id, '⚖️ Le village a eu tort de lyncher l’Ancien : ses pouvoirs spéciaux s’éteignent pour le reste de la partie...', p_night);
  end if;

  -- Un Enfant Sauvage vivant avait choisi cette victime comme mentor : il
  -- rejoint immédiatement et définitivement les Loups-Garous. Une boucle
  -- plutôt qu'un simple `if` : rien n'empêche plusieurs Enfants Sauvages
  -- d'avoir choisi le même mentor. Toujours aucun message nommant le joueur
  -- ni révélant son ancien rôle (wild_child_turned_at_night reste la seule
  -- trace privée, voir get_my_game_view) — seul le fait qu'UNE conversion a
  -- eu lieu cette nuit est maintenant annoncé publiquement, une fois, après
  -- la boucle.
  for v_wild_child_id in
    select rs.user_id
    from public.game_roles_secret rs
    join public.game_players gp on gp.game_id = rs.game_id and gp.user_id = rs.user_id
    where rs.game_id = p_game_id and rs.role = 'enfant_sauvage'
      and rs.wild_child_mentor = p_user_id and gp.is_alive
  loop
    update public.game_roles_secret
    set role = 'loup_garou', wild_child_turned_at_night = p_night
    where game_id = p_game_id and user_id = v_wild_child_id;
    v_any_wild_child_converted := true;
  end loop;

  if v_any_wild_child_converted then
    insert into public.game_log (game_id, message, night_number)
    values (p_game_id, '🌑 Une ombre a changé de camp cette nuit... un villageois a secrètement rejoint les Loups-Garous.', p_night);
  end if;

  if v_is_lover then
    select lover_with into v_lover_id from public.game_roles_secret where game_id = p_game_id and user_id = p_user_id;
    if v_lover_id is not null and exists (
      select 1 from public.game_players where game_id = p_game_id and user_id = v_lover_id and is_alive
    ) then
      perform public.kill_player(p_game_id, v_lover_id, 'chagrin', p_night);
    end if;
  end if;

  if v_role = 'chasseur' then
    update public.games
    set hunter_pending = p_user_id,
        hunter_context = case when status = 'day_vote' then 'day' else 'night' end
    where id = p_game_id and hunter_pending is null and not village_powers_disabled;
  end if;

  if v_was_captain then
    update public.games set captain_pending = p_user_id where id = p_game_id and captain_pending is null;
    insert into public.game_log (game_id, message, night_number)
    values (p_game_id, v_name || ' était le Capitaine : il ou elle désigne son successeur dans son dernier souffle.', p_night);
  end if;
end;
$$;

-- ----------------------------------------------------------------------------
-- submit_revival_choice (nouvelle fonction) : le joueur répond à la
-- question posée par kill_player (games.revival_pending = lui). Un "oui"
-- consomme réellement l'artefact (pending_revival, quantity, game_artifact_uses
-- — exactement ce que kill_player faisait automatiquement avant cette
-- migration) ; un "non" ne consomme rien, l'artefact reste disponible pour
-- une prochaine partie.
-- ----------------------------------------------------------------------------
create or replace function public.submit_revival_choice(p_game_id uuid, p_use boolean)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_artifact_id uuid;
begin
  select revival_pending_artifact_id into v_artifact_id
  from public.games where id = p_game_id and revival_pending = v_user;

  if v_artifact_id is null then
    raise exception 'Aucune décision de résurrection en attente.';
  end if;

  if p_use then
    update public.game_players set pending_revival = true
    where game_id = p_game_id and user_id = v_user;

    update public.player_artifacts set quantity = quantity - 1
    where user_id = v_user and artifact_id = v_artifact_id;

    insert into public.game_artifact_uses (game_id, user_id, artifact_id)
    values (p_game_id, v_user, v_artifact_id);
  end if;

  update public.games set revival_pending = null, revival_pending_artifact_id = null
  where id = p_game_id;

  perform public.advance_phase(p_game_id, true);
end;
$$;

grant execute on function public.submit_revival_choice(uuid, boolean) to authenticated;

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
      if v_ended then return; end if;

      v_ended := public.check_and_apply_chasseuse_win(p_game_id);
      if v_ended then return; end if;

      v_ended := public.check_and_apply_anancy_win(p_game_id);
      if v_ended then return; end if;

      v_ended := public.check_and_apply_win(p_game_id);
      if v_ended then return; end if;

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
    if v_ended then return; end if;

    v_ended := public.check_and_apply_chasseuse_win(p_game_id);
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

create or replace function public.game_view_vote_fields(
  p_game_id uuid, p_game public.games, p_user uuid, p_my_role text, p_my_alive boolean
)
returns jsonb
language sql
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'my_vote_target', (
      select target_id from public.votes
      where game_id = p_game_id and round_number = p_game.night_number and voter_id = p_user
    ),

    'my_captain_vote_target', (
      select target_id from public.votes
      where game_id = p_game_id and round_number = 0 and voter_id = p_user
    ),

    'vote_call_agreed_ids', case when p_game.status = 'day_discussion' then coalesce((
      select jsonb_agg(user_id) from public.vote_call_agreements
      where game_id = p_game_id and day_number = p_game.night_number
    ), '[]'::jsonb) else '[]'::jsonb end,

    'day_reveal_ready_ids', case when p_game.status = 'day_reveal' then coalesce((
      select jsonb_agg(user_id) from public.day_reveal_ready
      where game_id = p_game_id and round_number = p_game.night_number
    ), '[]'::jsonb) else '[]'::jsonb end,

    'night_recap', case when p_game.status = 'day_reveal' then coalesce((
      select jsonb_agg(jsonb_build_object('id', id, 'message', message) order by created_at asc)
      from public.game_log
      where game_id = p_game_id and night_number = p_game.night_number
    ), '[]'::jsonb) else '[]'::jsonb end,

    'vote_recap', case when p_game.status = 'day_vote_recap' then jsonb_build_object(
      'votes', coalesce((
        select jsonb_agg(jsonb_build_object('voter_id', voter_id, 'target_id', target_id))
        from public.votes where game_id = p_game_id and round_number = p_game.night_number
      ), '[]'::jsonb),
      'ready_ids', coalesce((
        select jsonb_agg(user_id) from public.vote_recap_ready
        where game_id = p_game_id and round_number = p_game.night_number
      ), '[]'::jsonb),
      'captain_voter_id', p_game.last_vote_captain_id,
      'captain_random_notice', (
        select message from public.game_log
        where game_id = p_game_id and night_number = p_game.night_number and kind = 'captain_random'
        order by created_at desc limit 1
      ),
      'protected_by_feu_sacre', exists (
        select 1 from public.game_artifact_uses gau
        join public.store_artifacts sa on sa.id = gau.artifact_id
        where gau.game_id = p_game_id and sa.effect_key = 'feu_sacre_ancetres' and gau.round_number = p_game.night_number
      )
    ) else null end,

    -- 'chasseuse_choice' (migration 0162, colonnes/rôle renommés en 0163,
    -- corrigés ici) ajouté en tête, même priorité que hunter/
    -- captain_succession/balance_ange — tous vérifiés avant le reste.
    -- 'revival_choice' (migration 0172) ajouté juste après balance_ange,
    -- même famille de décision post-mort urgente que hunter/
    -- captain_succession (voir kill_player : posé APRÈS que la victime soit
    -- déjà marquée is_alive = false, donc affiché hors de toute condition
    -- `alive` côté client, comme ces deux-là).
    'pending_action_required', case
      when p_game.hunter_pending = p_user then 'hunter'
      when p_game.captain_pending = p_user then 'captain_succession'
      when p_game.balance_ange_pending = p_user then 'balance_ange'
      when p_game.revival_pending = p_user then 'revival_choice'
      when exists (
        select 1 from public.game_roles_secret
        where game_id = p_game_id and user_id = p_user and role = 'chasseuse' and chasseuse_pending_choice
      ) then 'chasseuse_choice'
      when p_game.status = 'captain_election' and p_my_alive
        and not exists (
          select 1 from public.votes
          where game_id = p_game_id and round_number = 0 and voter_id = p_user
        )
      then 'captain_vote'
      when p_game.status = 'night' and p_my_alive
        and (p_my_role = p_game.night_step or (p_my_role in ('loup_alpha', 'sans_visage', 'grand_mechant_loup') and p_game.night_step = 'loup_garou'))
        and not exists (
          select 1 from public.night_actions
          where game_id = p_game_id and night_number = p_game.night_number
            and step = p_game.night_step and actor_id = p_user
        )
      then p_game.night_step
      when p_game.status = 'day_vote' and p_my_alive
        and not exists (
          select 1 from public.votes
          where game_id = p_game_id and round_number = p_game.night_number and voter_id = p_user
        )
      then 'vote'
      else null
    end,

    -- Nom de l'artefact en attente de décision (migration 0172) — jamais
    -- révélé à qui que ce soit d'autre, seulement quand c'est SOI qui doit
    -- répondre (même garde que pending_action_required ci-dessus).
    'my_revival_artifact_name_fr', case when p_game.revival_pending = p_user then (
      select name_fr from public.store_artifacts where id = p_game.revival_pending_artifact_id
    ) else null end,

    'my_revival_artifact_name_en', case when p_game.revival_pending = p_user then (
      select name_en from public.store_artifacts where id = p_game.revival_pending_artifact_id
    ) else null end,

    'final_reveal', case when p_game.status = 'ended' then coalesce((
      select jsonb_agg(jsonb_build_object('user_id', rs.user_id, 'role', rs.role))
      from public.game_roles_secret rs where rs.game_id = p_game_id
    ), '[]'::jsonb) else null end
  );
$$;

create or replace function public.admin_auto_play_bots(p_game_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_game public.games%rowtype;
  v_bot record;
  v_target uuid;
  v_target2 uuid;
  v_target_arr uuid[];
  v_my_role text;
  v_target_role text;
  v_wolf_target uuid;
  v_acted int;
  v_total_acted int := 0;
  v_iterations int := 0;
  v_ready_updated int;
  v_has_captain boolean;
  v_actor_id uuid;
  v_actor_is_bot boolean;
  v_alive_count int;
  v_agreed_count int;
  v_needed int;
  v_chasseuse_bot_id uuid;
  v_chasseuse_used boolean;
  v_chasseuse_new_target uuid;
begin
  if not public.is_admin_user(auth.uid()) then
    raise exception 'Accès refusé.';
  end if;

  loop
    v_iterations := v_iterations + 1;
    exit when v_iterations > 200; -- filet de sécurité, ne devrait jamais être atteint

    select * into v_game from public.games where id = p_game_id for update;
    if not found then raise exception 'Partie introuvable.'; end if;

    v_acted := 0;

    -- Chasseur en attente de tirer.
    if v_game.hunter_pending is not null then
      if not exists (select 1 from public.profiles where id = v_game.hunter_pending and is_bot) then
        exit; -- un vrai joueur doit tirer
      end if;

      select user_id into v_target from public.game_players
      where game_id = p_game_id and is_alive and user_id <> v_game.hunter_pending
      order by random() limit 1;

      if v_target is not null then
        perform public.kill_player(p_game_id, v_target, 'chasseur', v_game.night_number);
      else
        insert into public.game_log (game_id, message)
        select p_game_id, gp.display_name || ' (Chasseur) choisit de ne tirer sur personne.'
        from public.game_players gp where gp.game_id = p_game_id and gp.user_id = v_game.hunter_pending;
      end if;

      update public.games set hunter_pending = null, hunter_context = null where id = p_game_id;
      perform public.advance_phase(p_game_id, true);
      v_total_acted := v_total_acted + 1;
      continue;
    end if;

    -- Capitaine mourant devant désigner un successeur.
    if v_game.captain_pending is not null then
      if not exists (select 1 from public.profiles where id = v_game.captain_pending and is_bot) then
        exit;
      end if;

      select user_id into v_target from public.game_players
      where game_id = p_game_id and is_alive and user_id <> v_game.captain_pending
      order by random() limit 1;

      if v_target is not null then
        update public.game_players set is_captain = false where game_id = p_game_id and user_id = v_game.captain_pending;
        update public.game_players set is_captain = true where game_id = p_game_id and user_id = v_target;
        insert into public.game_log (game_id, message)
        select p_game_id, '🎖️ ' || gp.display_name || ' devient le nouveau Capitaine.'
        from public.game_players gp where gp.game_id = p_game_id and gp.user_id = v_target;
      end if;

      update public.games set captain_pending = null where id = p_game_id;
      perform public.advance_phase(p_game_id, true);
      v_total_acted := v_total_acted + 1;
      continue;
    end if;

    -- Résurrection en attente (Pierre des Ancêtres / Larme de Renaissance,
    -- migration 0172) : un bot accepte toujours (aucune interface pour lui
    -- poser la question, et aucune raison pour lui de refuser un artefact
    -- qu'il a "payé"). Écrit directement les tables plutôt que d'appeler
    -- submit_revival_choice, qui est gardée par auth.uid() = revival_pending
    -- — inutilisable ici puisque c'est l'admin, pas le bot, qui exécute
    -- cette fonction (même raison que hunter_pending/captain_pending
    -- ci-dessus, qui écrivent aussi directement plutôt que d'appeler leurs
    -- RPC respectives).
    if v_game.revival_pending is not null then
      if not exists (select 1 from public.profiles where id = v_game.revival_pending and is_bot) then
        exit;
      end if;

      update public.game_players set pending_revival = true
      where game_id = p_game_id and user_id = v_game.revival_pending;

      update public.player_artifacts set quantity = quantity - 1
      where user_id = v_game.revival_pending and artifact_id = v_game.revival_pending_artifact_id;

      insert into public.game_artifact_uses (game_id, user_id, artifact_id)
      values (p_game_id, v_game.revival_pending, v_game.revival_pending_artifact_id);

      update public.games set revival_pending = null, revival_pending_artifact_id = null where id = p_game_id;
      perform public.advance_phase(p_game_id, true);
      v_total_acted := v_total_acted + 1;
      continue;
    end if;

    -- La Chasseuse en attente de sa décision abandonner/continuer (migration
    -- 0162) : un bot choisit toujours "continuer" (aucune interface
    -- possible pour lui poser la question) — même validation que
    -- submit_chasseuse_choice, reproduite ici à l'identique. Un état PAR JOUEUR
    -- sur game_roles_secret (pas un champ global sur games comme les deux
    -- pendings ci-dessus), d'où la jointure au lieu d'une simple colonne.
    select rs.user_id, rs.chasseuse_used_reassignment into v_chasseuse_bot_id, v_chasseuse_used
    from public.game_roles_secret rs
    join public.game_players gp on gp.game_id = rs.game_id and gp.user_id = rs.user_id
    join public.profiles p on p.id = rs.user_id
    where rs.game_id = p_game_id and rs.role = 'chasseuse' and rs.chasseuse_pending_choice and gp.is_alive and p.is_bot
    limit 1;

    if v_chasseuse_bot_id is not null then
      if v_chasseuse_used then
        update public.game_roles_secret
        set role = 'villageois', chasseuse_target_id = null, chasseuse_pending_choice = false
        where game_id = p_game_id and user_id = v_chasseuse_bot_id;
      else
        select user_id into v_chasseuse_new_target
        from public.game_players
        where game_id = p_game_id and is_alive and user_id <> v_chasseuse_bot_id
        order by random() limit 1;

        update public.game_roles_secret
        set chasseuse_target_id = v_chasseuse_new_target, chasseuse_used_reassignment = true, chasseuse_pending_choice = false
        where game_id = p_game_id and user_id = v_chasseuse_bot_id;
      end if;

      v_total_acted := v_total_acted + 1;
      continue;
    end if;

    -- Distribution des rôles : marque tous les bots "prêts" — jamais un
    -- vrai joueur, qui doit toujours cliquer lui-même.
    if v_game.status = 'role_reveal' then
      update public.game_players gp
      set is_ready = true
      from public.profiles p
      where gp.game_id = p_game_id and gp.user_id = p.id and p.is_bot and not gp.is_ready;
      get diagnostics v_ready_updated = row_count;

      if exists (
        select 1 from public.game_players gp
        join public.profiles p on p.id = gp.user_id
        where gp.game_id = p_game_id and not p.is_bot and not gp.is_ready
      ) then
        exit; -- un vrai joueur n'a pas encore cliqué "prêt"
      end if;

      if not exists (select 1 from public.game_players where game_id = p_game_id and not is_ready) then
        perform public.advance_phase(p_game_id, true);
        v_total_acted := v_total_acted + greatest(v_ready_updated, 1);
        continue;
      end if;

      exit; -- rien à faire de plus ici
    end if;

    -- Élection du Capitaine.
    if v_game.status = 'captain_election' then
      if exists (
        select 1 from public.game_players gp
        join public.profiles p on p.id = gp.user_id
        where gp.game_id = p_game_id and gp.is_alive and not p.is_bot
          and not exists (select 1 from public.votes where game_id = p_game_id and round_number = 0 and voter_id = gp.user_id)
      ) then
        exit; -- un vrai joueur vivant n'a pas encore voté
      end if;

      for v_bot in
        select gp.user_id from public.game_players gp
        join public.profiles p on p.id = gp.user_id
        where gp.game_id = p_game_id and gp.is_alive and p.is_bot
          and not exists (select 1 from public.votes where game_id = p_game_id and round_number = 0 and voter_id = gp.user_id)
      loop
        select user_id into v_target from public.game_players
        where game_id = p_game_id and is_alive and user_id <> v_bot.user_id
        order by random() limit 1;

        insert into public.votes (game_id, round_number, voter_id, target_id)
        values (p_game_id, 0, v_bot.user_id, v_target)
        on conflict (game_id, round_number, voter_id) do update set target_id = excluded.target_id;
        v_acted := v_acted + 1;
      end loop;

      if v_acted > 0 then
        perform public.advance_phase(p_game_id, true);
        v_total_acted := v_total_acted + v_acted;
        continue;
      end if;
      exit;
    end if;

    -- Débat : les bots n'ont pas d'action de jeu à proprement parler ici,
    -- mais peuvent se déclarer "d'accord" pour lancer le vote (voir
    -- commentaire d'en-tête) — c'est le seul moyen d'écourter cette phase
    -- avant l'expiration de son minuteur (300s par défaut, la plus longue
    -- de toute la partie).
    if v_game.status = 'day_discussion' then
      v_has_captain := coalesce((v_game.settings->'role_counts'->>'capitaine')::boolean, false);

      if v_has_captain then
        select user_id into v_actor_id from public.game_players
        where game_id = p_game_id and is_alive and is_captain limit 1;
      else
        v_actor_id := v_game.host_id;
      end if;

      if v_actor_id is null then
        exit; -- pas d'acteur identifiable (ex. succession de Capitaine pas encore résolue) : rien à faire ici
      end if;

      for v_bot in
        select gp.user_id from public.game_players gp
        join public.profiles p on p.id = gp.user_id
        where gp.game_id = p_game_id and gp.is_alive and p.is_bot and gp.user_id <> v_actor_id
          and not exists (
            select 1 from public.vote_call_agreements
            where game_id = p_game_id and day_number = v_game.night_number and user_id = gp.user_id
          )
      loop
        insert into public.vote_call_agreements (game_id, day_number, user_id)
        values (p_game_id, v_game.night_number, v_bot.user_id)
        on conflict (game_id, day_number, user_id) do nothing;
        v_acted := v_acted + 1;
      end loop;

      if v_acted > 0 then
        v_total_acted := v_total_acted + v_acted;
      end if;

      -- Même formule que submit_captain_call_vote / submit_host_call_vote
      -- (migration 0086) : majorité des AUTRES joueurs vivants (l'acteur
      -- exclu des deux côtés du calcul).
      select count(*) into v_alive_count
      from public.game_players
      where game_id = p_game_id and is_alive and user_id <> v_actor_id;
      select count(*) into v_agreed_count
      from public.vote_call_agreements
      where game_id = p_game_id and day_number = v_game.night_number;
      v_needed := case when v_alive_count = 0 then 0 else v_alive_count / 2 + 1 end;

      if v_agreed_count < v_needed then
        exit; -- majorité pas encore atteinte (ou un humain doit encore répondre)
      end if;

      select is_bot into v_actor_is_bot from public.profiles where id = v_actor_id;
      if not coalesce(v_actor_is_bot, false) then
        exit; -- l'acteur (Capitaine ou hôte) est un vrai joueur : à lui de cliquer "Lancer le vote"
      end if;

      -- L'acteur est un bot (Capitaine élu au hasard parmi les bots) : lance
      -- le vote lui-même, même message de journal que submit_captain_call_vote.
      insert into public.game_log (game_id, message)
      select p_game_id, '🎖️ ' || gp.display_name || ' (Capitaine) lance le vote, avec l’accord de la majorité du village !'
      from public.game_players gp where gp.game_id = p_game_id and gp.user_id = v_actor_id;

      perform public.advance_phase(p_game_id, true);
      v_total_acted := v_total_acted + 1;
      continue;
    end if;

    -- Vote du village.
    if v_game.status = 'day_vote' then
      if exists (
        select 1 from public.game_players gp
        join public.profiles p on p.id = gp.user_id
        where gp.game_id = p_game_id and gp.is_alive and not p.is_bot
          and not exists (select 1 from public.votes where game_id = p_game_id and round_number = v_game.night_number and voter_id = gp.user_id)
      ) then
        exit;
      end if;

      for v_bot in
        select gp.user_id from public.game_players gp
        join public.profiles p on p.id = gp.user_id
        where gp.game_id = p_game_id and gp.is_alive and p.is_bot
          and not exists (select 1 from public.votes where game_id = p_game_id and round_number = v_game.night_number and voter_id = gp.user_id)
      loop
        select user_id into v_target from public.game_players
        where game_id = p_game_id and is_alive and user_id <> v_bot.user_id
        order by random() limit 1;

        insert into public.votes (game_id, round_number, voter_id, target_id)
        values (p_game_id, v_game.night_number, v_bot.user_id, v_target)
        on conflict (game_id, round_number, voter_id) do update set target_id = excluded.target_id;
        v_acted := v_acted + 1;
      end loop;

      if v_acted > 0 then
        perform public.advance_phase(p_game_id, true);
        v_total_acted := v_total_acted + v_acted;
        continue;
      end if;
      exit;
    end if;

    -- Nuit : une seule étape active à la fois.
    if v_game.status = 'night' then
      if v_game.night_step = 'resolve' then
        -- advance_phase se recharge déjà lui-même jusqu'à 'day_reveal'
        -- quand la dernière étape de nuit se termine (v_next_step is null) —
        -- ce cas ne devrait jamais être observé ici, filet de sécurité.
        exit;
      end if;

      if exists (
        select 1 from public.game_players gp
        join public.profiles p on p.id = gp.user_id
        join public.game_roles_secret rs on rs.game_id = gp.game_id and rs.user_id = gp.user_id
        where gp.game_id = p_game_id and gp.is_alive and not p.is_bot
          and (rs.role = v_game.night_step or (rs.role in ('loup_alpha', 'sans_visage', 'grand_mechant_loup') and v_game.night_step = 'loup_garou'))
          and not exists (
            select 1 from public.night_actions
            where game_id = p_game_id and night_number = v_game.night_number
              and step = v_game.night_step and actor_id = gp.user_id
          )
      ) then
        exit; -- un vrai joueur vivant doit encore agir cette étape
      end if;

      for v_bot in
        select gp.user_id, rs.role
        from public.game_players gp
        join public.profiles p on p.id = gp.user_id
        join public.game_roles_secret rs on rs.game_id = gp.game_id and rs.user_id = gp.user_id
        where gp.game_id = p_game_id and gp.is_alive and p.is_bot
          and (rs.role = v_game.night_step or (rs.role in ('loup_alpha', 'sans_visage', 'grand_mechant_loup') and v_game.night_step = 'loup_garou'))
          and not exists (
            select 1 from public.night_actions
            where game_id = p_game_id and night_number = v_game.night_number
              and step = v_game.night_step and actor_id = gp.user_id
          )
      loop
        if v_game.night_step = 'voleur' then
          select user_id into v_target from public.game_players
          where game_id = p_game_id and is_alive and user_id <> v_bot.user_id
          order by random() limit 1;

          if v_target is not null then
            select role into v_my_role from public.game_roles_secret where game_id = p_game_id and user_id = v_bot.user_id;
            select role into v_target_role from public.game_roles_secret where game_id = p_game_id and user_id = v_target;

            update public.game_roles_secret set role = v_target_role where game_id = p_game_id and user_id = v_bot.user_id;
            update public.game_roles_secret set role = v_my_role where game_id = p_game_id and user_id = v_target;

            insert into public.game_log (game_id, message, night_number, kind, meta)
            values (
              p_game_id, '🃏 Le Voleur a fait son choix en secret.', v_game.night_number, 'thief_swap',
              jsonb_build_object('victim_id', v_target, 'new_role', v_my_role, 'actor_id', v_bot.user_id, 'actor_new_role', v_target_role)
            );
          else
            insert into public.game_log (game_id, message, night_number)
            values (p_game_id, '🃏 Le Voleur a fait son choix en secret.', v_game.night_number);
          end if;

          insert into public.night_actions (game_id, night_number, step, actor_id, extra)
          values (p_game_id, v_game.night_number, 'voleur', v_bot.user_id, jsonb_build_object('target_id', v_target))
          on conflict (game_id, night_number, step, actor_id) do update set extra = excluded.extra;

        elsif v_game.night_step = 'cupidon' then
          select array_agg(user_id) into v_target_arr from (
            select user_id from public.game_players
            where game_id = p_game_id and is_alive and user_id <> v_bot.user_id
            order by random() limit 2
          ) t;

          if coalesce(array_length(v_target_arr, 1), 0) = 2 then
            update public.game_players set is_lover = false where game_id = p_game_id;
            update public.game_roles_secret set lover_with = null where game_id = p_game_id;

            update public.game_players set is_lover = true where game_id = p_game_id and user_id = any(v_target_arr);
            update public.game_roles_secret set lover_with = v_target_arr[2] where game_id = p_game_id and user_id = v_target_arr[1];
            update public.game_roles_secret set lover_with = v_target_arr[1] where game_id = p_game_id and user_id = v_target_arr[2];

            insert into public.game_log (game_id, message) values (p_game_id, '💘 Cupidon a décoché ses flèches...');

            insert into public.night_actions (game_id, night_number, step, actor_id, target_id, extra)
            values (p_game_id, v_game.night_number, 'cupidon', v_bot.user_id, v_target_arr[1], jsonb_build_object('lover2', v_target_arr[2]))
            on conflict (game_id, night_number, step, actor_id) do update set target_id = excluded.target_id, extra = excluded.extra;
          end if;

        elsif v_game.night_step = 'enfant_sauvage' then
          select user_id into v_target from public.game_players
          where game_id = p_game_id and is_alive and user_id <> v_bot.user_id
          order by random() limit 1;

          if v_target is not null then
            update public.game_roles_secret set wild_child_mentor = v_target
            where game_id = p_game_id and user_id = v_bot.user_id;

            insert into public.night_actions (game_id, night_number, step, actor_id, target_id)
            values (p_game_id, v_game.night_number, 'enfant_sauvage', v_bot.user_id, v_target)
            on conflict (game_id, night_number, step, actor_id) do update set target_id = excluded.target_id;

            insert into public.game_log (game_id, message) values (p_game_id, '🐾 L''Enfant Sauvage a choisi son mentor en secret.');
          end if;

        elsif v_game.night_step in ('voyante', 'griot') then
          select user_id into v_target from public.game_players
          where game_id = p_game_id and is_alive and user_id <> v_bot.user_id
          order by random() limit 1;

          if v_target is not null then
            insert into public.night_actions (game_id, night_number, step, actor_id, target_id)
            values (p_game_id, v_game.night_number, v_game.night_step, v_bot.user_id, v_target)
            on conflict (game_id, night_number, step, actor_id) do update set target_id = excluded.target_id;

            if v_game.night_step = 'voyante' then
              insert into public.game_log (game_id, message) values (p_game_id, '🔮 La Voyante a sondé un joueur en secret.');
            end if;
          end if;

        elsif v_game.night_step = 'loup_garou' then
          select gp.user_id into v_target
          from public.game_players gp
          join public.game_roles_secret rs2 on rs2.game_id = gp.game_id and rs2.user_id = gp.user_id
          where gp.game_id = p_game_id and gp.is_alive
            and rs2.role not in ('loup_garou', 'loup_alpha', 'sans_visage', 'grand_mechant_loup')
          order by random() limit 1;

          insert into public.night_actions (game_id, night_number, step, actor_id, target_id)
          values (p_game_id, v_game.night_number, 'loup_garou', v_bot.user_id, v_target)
          on conflict (game_id, night_number, step, actor_id) do update set target_id = excluded.target_id;

        elsif v_game.night_step = 'grand_mechant_loup' then
          v_target := null;
          if random() < 0.6 then
            v_wolf_target := public.get_wolf_target(p_game_id, v_game.night_number);
            select gp.user_id into v_target
            from public.game_players gp
            join public.game_roles_secret rs2 on rs2.game_id = gp.game_id and rs2.user_id = gp.user_id
            where gp.game_id = p_game_id and gp.is_alive
              and rs2.role not in ('loup_garou', 'loup_alpha', 'sans_visage', 'grand_mechant_loup')
              and (v_wolf_target is null or gp.user_id <> v_wolf_target)
            order by random() limit 1;
          end if;

          insert into public.night_actions (game_id, night_number, step, actor_id, target_id)
          values (p_game_id, v_game.night_number, 'grand_mechant_loup', v_bot.user_id, v_target)
          on conflict (game_id, night_number, step, actor_id) do update set target_id = excluded.target_id;

        elsif v_game.night_step = 'sorciere' then
          insert into public.night_actions (game_id, night_number, step, actor_id, extra)
          values (p_game_id, v_game.night_number, 'sorciere', v_bot.user_id, jsonb_build_object('heal', false, 'poison_target', null))
          on conflict (game_id, night_number, step, actor_id) do update set extra = excluded.extra;

          insert into public.game_log (game_id, message) values (p_game_id, '🧪 La Sorcière a fait son choix en secret.');

        elsif v_game.night_step = 'anancy' then
          v_target := null;
          v_target2 := null;
          if random() < 0.5 then
            select array_agg(user_id) into v_target_arr from (
              select gp.user_id from public.game_players gp
              where gp.game_id = p_game_id and gp.is_alive and gp.user_id <> v_bot.user_id
                and not exists (
                  select 1 from public.anancy_swapped_players asp
                  where asp.game_id = p_game_id and asp.user_id = gp.user_id
                )
              order by random() limit 2
            ) t;

            if coalesce(array_length(v_target_arr, 1), 0) = 2 then
              v_target := v_target_arr[1];
              v_target2 := v_target_arr[2];
              insert into public.anancy_swapped_players (game_id, user_id, swapped_at_night)
              values (p_game_id, v_target, v_game.night_number + 1), (p_game_id, v_target2, v_game.night_number + 1);
            end if;
          end if;

          insert into public.night_actions (game_id, night_number, step, actor_id, target_id, extra)
          values (p_game_id, v_game.night_number, 'anancy', v_bot.user_id, v_target, jsonb_build_object('target2', v_target2))
          on conflict (game_id, night_number, step, actor_id) do update set target_id = excluded.target_id, extra = excluded.extra;
        end if;

        v_acted := v_acted + 1;
      end loop;

      if v_acted > 0 then
        perform public.advance_phase(p_game_id, true);
        v_total_acted := v_total_acted + v_acted;
        continue;
      end if;
      exit;
    end if;

    -- Écrans de récap (day_reveal, day_vote_recap) : rien à "jouer", mais
    -- on les traverse directement en mode rapide plutôt que d'attendre leur
    -- minuteur — c'est précisément ce qui rendait le test solo lent
    -- (retour utilisateur). Le journal (game_log) reste consultable après
    -- coup pour revoir ce qui s'est passé.
    if v_game.status in ('day_reveal', 'day_vote_recap') then
      perform public.advance_phase(p_game_id, true);
      continue;
    end if;

    -- status non géré ici (lobby, ended...) : rien de plus à faire.
    exit;
  end loop;

  return jsonb_build_object('acted', v_total_acted);
end;
$$;