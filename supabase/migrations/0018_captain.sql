-- ============================================================================
-- Le Capitaine — un TITRE public, pas un rôle secret.
--
-- Contrairement à l'Ancien ou au Voleur, le Capitaine n'est pas une identité
-- tirée au sort qui remplace le rôle du joueur (villageois/loup-garou/...) :
-- c'est une étiquette publique posée sur un joueur qui GARDE son vrai rôle
-- (un Loup-Garou peut très bien être élu Capitaine, et le rester). D'où le
-- choix de le stocker dans game_players.is_captain (colonne publique, comme
-- is_host) plutôt que dans game_roles_secret.
--
-- Pouvoirs (fidèles à la carte physique) :
--   - Élu par un vote à la majorité relative, juste après la distribution des
--     rôles et avant la première nuit — nouveau statut 'captain_election',
--     résolu par resolve_captain_election. Les votes sont stockés dans la
--     table `votes` existante avec round_number = 0 (jamais utilisé par le
--     vote de jour, qui commence à night_number >= 1).
--   - Son vote compte pour 2 voix lors du vote du village.
--   - En cas d'égalité au vote du village, c'est SON vote à lui qui désigne
--     la victime (voir resolve_day_vote_deaths).
--   - À sa mort (quelle qu'en soit la cause), désigne son successeur parmi
--     les joueurs encore en vie avant que la partie puisse continuer — un
--     blocage bloquant, du même principe que le tir du Chasseur
--     (games.captain_pending, en miroir de hunter_pending).
-- ============================================================================
set search_path = public;

alter table public.game_players add column if not exists is_captain boolean not null default false;
alter table public.games add column if not exists captain_pending uuid references public.profiles (id);

alter table public.games drop constraint if exists games_status_check;
alter table public.games add constraint games_status_check
  check (status in ('lobby','role_reveal','captain_election','night','day_reveal','day_discussion','day_vote','ended'));

-- ----------------------------------------------------------------------------
-- compute_default_role_counts : le Capitaine reste désactivé par défaut
-- (l'hôte l'active manuellement depuis les réglages du salon, comme
-- Ancien/Voleur).
-- ----------------------------------------------------------------------------
create or replace function public.compute_default_role_counts(p_player_count int)
returns jsonb
language plpgsql
as $$
declare
  v_wolves int;
begin
  v_wolves := greatest(1, round(p_player_count * 0.25));
  if v_wolves >= p_player_count then
    v_wolves := greatest(1, p_player_count / 2);
  end if;
  return jsonb_build_object(
    'loup_garou', v_wolves,
    'voyante', p_player_count >= 5,
    'sorciere', p_player_count >= 6,
    'chasseur', p_player_count >= 7,
    'petite_fille', p_player_count >= 8,
    'cupidon', p_player_count >= 9,
    'ancien', p_player_count >= 10,
    'voleur', p_player_count >= 11,
    'capitaine', false
  );
end;
$$;

-- ----------------------------------------------------------------------------
-- start_game : reprise identique à avant pour la répartition des rôles ; le
-- Capitaine n'est plus tiré au hasard ici (il est élu juste après, voir
-- advance_phase / resolve_captain_election). Il ne consomme pas de "place"
-- de rôle spécial : contrairement à Ancien/Voleur, il n'entre pas dans
-- v_special_total.
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
  if v_count > 20 then raise exception 'Une partie ne peut pas dépasser 20 joueurs.'; end if;

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
    + coalesce((v_role_counts->>'voleur')::boolean::int, 0);

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

  select coalesce((v_game.settings->>'role_reveal_seconds')::int, 15) into v_seconds;

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

-- ----------------------------------------------------------------------------
-- kill_player : reprise pour déclencher la succession du Capitaine à sa mort.
-- ----------------------------------------------------------------------------
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

      insert into public.game_log (game_id, message)
      select p_game_id, gp.display_name || ' (Ancien) encaisse l’attaque des Loups-Garous et s’accroche à la vie !'
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

  insert into public.game_log (game_id, message)
  values (p_game_id, v_name || ' (' || public.role_display_name(v_role) || ') ' || public.death_phrase(p_cause) );

  if v_role = 'ancien' and p_cause = 'vote' then
    update public.games set village_powers_disabled = true where id = p_game_id;
    insert into public.game_log (game_id, message)
    values (p_game_id, '⚖️ Le village a eu tort de lyncher l’Ancien : ses pouvoirs spéciaux s’éteignent pour le reste de la partie...');
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
    insert into public.game_log (game_id, message)
    values (p_game_id, v_name || ' était le Capitaine : il ou elle désigne son successeur dans son dernier souffle.');
  end if;
end;
$$;

-- ----------------------------------------------------------------------------
-- resolve_captain_election : dépouille l'élection (votes.round_number = 0),
-- à la majorité relative — en cas d'égalité entre plusieurs joueurs à égalité
-- de voix, tirage au sort parmi eux (la carte ne précise pas de règle pour ce
-- cas précis, contrairement au tie-break du vote de jour qui, lui, est géré
-- explicitement par le Capitaine une fois élu).
-- ----------------------------------------------------------------------------
create or replace function public.resolve_captain_election(p_game_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_top record;
begin
  select target_id, count(*) as votes into v_top
  from public.votes
  where game_id = p_game_id and round_number = 0 and target_id is not null
  group by target_id
  order by count(*) desc, random()
  limit 1;

  if v_top.target_id is not null then
    update public.game_players set is_captain = true where game_id = p_game_id and user_id = v_top.target_id;

    insert into public.game_log (game_id, message)
    select p_game_id, '🎖️ ' || gp.display_name || ' est élu(e) Capitaine du village !'
    from public.game_players gp where gp.game_id = p_game_id and gp.user_id = v_top.target_id;
  else
    insert into public.game_log (game_id, message)
    values (p_game_id, '🗳️ Aucun vote exprimé pour l’élection du Capitaine : la partie se jouera sans lui.');
  end if;
end;
$$;

-- ----------------------------------------------------------------------------
-- resolve_day_vote_deaths : reprise pour compter le vote du Capitaine pour 2
-- voix, et faire trancher son vote en cas d'égalité.
-- ----------------------------------------------------------------------------
create or replace function public.resolve_day_vote_deaths(p_game_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_round int;
  v_top record;
  v_tie_count int;
  v_captain_id uuid;
  v_captain_target uuid;
begin
  select night_number into v_round from public.games where id = p_game_id;

  select gp.user_id into v_captain_id
  from public.game_players gp
  where gp.game_id = p_game_id and gp.is_alive and gp.is_captain
  limit 1;

  if v_captain_id is not null then
    select target_id into v_captain_target
    from public.votes
    where game_id = p_game_id and round_number = v_round and voter_id = v_captain_id;
  end if;

  select v.target_id, sum(case when v.voter_id = v_captain_id then 2 else 1 end) as votes
  into v_top
  from public.votes v
  where v.game_id = p_game_id and v.round_number = v_round and v.target_id is not null
  group by v.target_id
  order by votes desc
  limit 1;

  if v_top.target_id is null then
    insert into public.game_log (game_id, message)
    values (p_game_id, '🗳️ Aucun vote exprimé : personne n’est éliminé aujourd’hui.');
  else
    select count(*) into v_tie_count
    from (
      select v.target_id, sum(case when v.voter_id = v_captain_id then 2 else 1 end) as c
      from public.votes v
      where v.game_id = p_game_id and v.round_number = v_round and v.target_id is not null
      group by v.target_id
      having sum(case when v.voter_id = v_captain_id then 2 else 1 end) = v_top.votes
    ) t;

    if v_tie_count > 1 then
      if v_captain_target is not null then
        insert into public.game_log (game_id, message)
        values (p_game_id, '🎖️ Égalité des voix : le vote du Capitaine désigne la victime.');
        perform public.kill_player(p_game_id, v_captain_target, 'vote', v_round);
      else
        insert into public.game_log (game_id, message)
        values (p_game_id, '🗳️ Égalité des voix : personne n’est éliminé aujourd’hui.');
      end if;
    else
      perform public.kill_player(p_game_id, v_top.target_id, 'vote', v_round);
    end if;
  end if;

  update public.games set day_vote_resolved = true where id = p_game_id;
end;
$$;

-- ----------------------------------------------------------------------------
-- advance_phase : reprise pour insérer l'élection du Capitaine entre la
-- révélation des rôles et la première nuit (uniquement si l'hôte a activé le
-- rôle), et pour bloquer l'avancement tant qu'une succession du Capitaine est
-- en attente — même principe que le tir du Chasseur.
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
        select coalesce((settings->>'night_step_seconds')::int, 40) into v_seconds from public.games where id = p_game_id;
        update public.games set phase_deadline = now() + make_interval(secs => v_seconds) where id = p_game_id;
        return;
      end if;
      if v_game.captain_pending is not null then
        select coalesce((settings->>'night_step_seconds')::int, 40) into v_seconds from public.games where id = p_game_id;
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
    select coalesce((settings->>'discussion_seconds')::int, 90) into v_seconds from public.games where id = p_game_id;
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
      select coalesce((settings->>'night_step_seconds')::int, 40) into v_seconds from public.games where id = p_game_id;
      update public.games set phase_deadline = now() + make_interval(secs => v_seconds) where id = p_game_id;
      return;
    end if;

    perform public.begin_night(p_game_id, v_game.night_number + 1);
    return;
  end if;
end;
$$;

-- ----------------------------------------------------------------------------
-- submit_captain_vote : vote pour l'élection du Capitaine (round_number = 0
-- dans `votes`, jamais utilisé par le vote de jour qui démarre à
-- night_number = 1). Abstention possible (p_target = null), comme pour le
-- vote de jour.
-- ----------------------------------------------------------------------------
create or replace function public.submit_captain_vote(p_game_id uuid, p_target uuid default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_game public.games%rowtype;
  v_alive int;
  v_submitted int;
begin
  select * into v_game from public.games where id = p_game_id for update;
  if not found or v_game.status <> 'captain_election' then
    raise exception 'L’élection du Capitaine n’est pas en cours.';
  end if;
  if not exists (select 1 from public.game_players where game_id = p_game_id and user_id = v_user and is_alive) then
    raise exception 'Seuls les joueurs vivants participent à l’élection.';
  end if;
  if p_target is not null and not exists (
    select 1 from public.game_players where game_id = p_game_id and user_id = p_target and is_alive
  ) then
    raise exception 'Joueur invalide.';
  end if;

  insert into public.votes (game_id, round_number, voter_id, target_id)
  values (p_game_id, 0, v_user, p_target)
  on conflict (game_id, round_number, voter_id) do update set target_id = excluded.target_id;

  select count(*) into v_alive from public.game_players where game_id = p_game_id and is_alive;
  select count(distinct voter_id) into v_submitted from public.votes where game_id = p_game_id and round_number = 0;

  if v_submitted >= v_alive then
    perform public.advance_phase(p_game_id, true);
  end if;
end;
$$;

grant execute on function public.submit_captain_vote(uuid, uuid) to authenticated;

-- ----------------------------------------------------------------------------
-- submit_captain_succession : le Capitaine qui vient de mourir désigne son
-- successeur parmi les joueurs encore en vie.
-- ----------------------------------------------------------------------------
create or replace function public.submit_captain_succession(p_game_id uuid, p_successor_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_game public.games%rowtype;
  v_successor_name text;
begin
  select * into v_game from public.games where id = p_game_id for update;
  if not found or v_game.captain_pending is distinct from v_user then
    raise exception 'Ce n’est pas à vous de désigner le nouveau Capitaine.';
  end if;

  select display_name into v_successor_name
  from public.game_players where game_id = p_game_id and user_id = p_successor_id and is_alive;
  if v_successor_name is null then
    raise exception 'Le successeur doit être un joueur actuellement en vie.';
  end if;

  update public.game_players set is_captain = false where game_id = p_game_id and user_id = v_user;
  update public.game_players set is_captain = true where game_id = p_game_id and user_id = p_successor_id;
  update public.games set captain_pending = null where id = p_game_id;

  insert into public.game_log (game_id, message)
  values (p_game_id, '🎖️ ' || v_successor_name || ' devient le nouveau Capitaine.');

  perform public.advance_phase(p_game_id, true);
end;
$$;

grant execute on function public.submit_captain_succession(uuid, uuid) to authenticated;

-- ----------------------------------------------------------------------------
-- get_my_game_view : reprise pour exposer l'élection et la succession du
-- Capitaine comme actions requises, au même titre que le tir du Chasseur.
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
