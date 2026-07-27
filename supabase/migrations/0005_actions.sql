-- ============================================================================
-- start_game, actions de nuit/jour, et lecture de l'état personnel du joueur
-- ============================================================================
set search_path = public;

-- ----------------------------------------------------------------------------
-- start_game
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
    + (v_role_counts->>'cupidon')::boolean::int;

  if (v_role_counts->>'loup_garou')::int < 1 then
    raise exception 'Il faut au moins un Loup-Garou.';
  end if;
  if v_special_total > v_count then
    raise exception 'La configuration des rôles dépasse le nombre de joueurs.';
  end if;

  for i in 1..(v_role_counts->>'loup_garou')::int loop
    v_roles := v_roles || 'loup_garou';
  end loop;
  if (v_role_counts->>'voyante')::boolean then v_roles := v_roles || 'voyante'; end if;
  if (v_role_counts->>'sorciere')::boolean then v_roles := v_roles || 'sorciere'; end if;
  if (v_role_counts->>'chasseur')::boolean then v_roles := v_roles || 'chasseur'; end if;
  if (v_role_counts->>'petite_fille')::boolean then v_roles := v_roles || 'petite_fille'; end if;
  if (v_role_counts->>'cupidon')::boolean then v_roles := v_roles || 'cupidon'; end if;

  while coalesce(array_length(v_roles, 1), 0) < v_count loop
    v_roles := v_roles || 'villageois';
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
      settings = jsonb_set(settings, '{role_counts}', v_role_counts)
  where id = p_game_id;

  insert into public.game_log (game_id, message)
  values (p_game_id, '🎭 Les rôles ont été distribués en secret. Regardez votre carte...');
end;
$$;

-- ----------------------------------------------------------------------------
-- update_game_settings : l'hôte configure la partie depuis le lobby
-- (nombre de loups, rôles spéciaux activés, durées des phases)
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
begin
  select * into v_game from public.games where id = p_game_id for update;
  if not found then raise exception 'Partie introuvable.'; end if;
  if v_game.host_id <> v_user then raise exception 'Seul l’hôte peut modifier les réglages.'; end if;
  if v_game.status <> 'lobby' then raise exception 'La partie a déjà démarré.'; end if;

  update public.games
  set settings = v_game.settings || p_settings
  where id = p_game_id;
end;
$$;

-- ----------------------------------------------------------------------------
-- submit_cupidon
-- ----------------------------------------------------------------------------
create or replace function public.submit_cupidon(p_game_id uuid, p_lover1 uuid, p_lover2 uuid)
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
  if not found or v_game.status <> 'night' or v_game.night_step <> 'cupidon' then
    raise exception 'Ce n’est pas le moment pour Cupidon.';
  end if;
  if public.my_role_in_game(p_game_id) <> 'cupidon' then
    raise exception 'Vous n’êtes pas Cupidon.';
  end if;
  if p_lover1 = p_lover2 then
    raise exception 'Choisissez deux joueurs différents.';
  end if;
  if not exists (select 1 from public.game_players where game_id = p_game_id and user_id = p_lover1 and is_alive)
    or not exists (select 1 from public.game_players where game_id = p_game_id and user_id = p_lover2 and is_alive) then
    raise exception 'Joueur invalide.';
  end if;

  update public.game_players set is_lover = false where game_id = p_game_id;
  update public.game_roles_secret set lover_with = null where game_id = p_game_id;

  update public.game_players set is_lover = true where game_id = p_game_id and user_id in (p_lover1, p_lover2);
  update public.game_roles_secret set lover_with = p_lover2 where game_id = p_game_id and user_id = p_lover1;
  update public.game_roles_secret set lover_with = p_lover1 where game_id = p_game_id and user_id = p_lover2;

  insert into public.night_actions (game_id, night_number, step, actor_id, target_id, extra)
  values (p_game_id, v_game.night_number, 'cupidon', v_user, p_lover1, jsonb_build_object('lover2', p_lover2))
  on conflict (game_id, night_number, step, actor_id)
  do update set target_id = excluded.target_id, extra = excluded.extra;

  insert into public.game_log (game_id, message)
  values (p_game_id, '💘 Cupidon a décoché ses flèches...');

  perform public.advance_phase(p_game_id, true);
end;
$$;

-- ----------------------------------------------------------------------------
-- submit_voyante
-- ----------------------------------------------------------------------------
create or replace function public.submit_voyante(p_game_id uuid, p_target uuid)
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
  if not found or v_game.status <> 'night' or v_game.night_step <> 'voyante' then
    raise exception 'Ce n’est pas le moment pour la Voyante.';
  end if;
  if public.my_role_in_game(p_game_id) <> 'voyante' then
    raise exception 'Vous n’êtes pas la Voyante.';
  end if;
  if p_target = v_user then
    raise exception 'Vous ne pouvez pas vous sonder vous-même.';
  end if;
  if not exists (select 1 from public.game_players where game_id = p_game_id and user_id = p_target and is_alive) then
    raise exception 'Joueur invalide.';
  end if;

  insert into public.night_actions (game_id, night_number, step, actor_id, target_id)
  values (p_game_id, v_game.night_number, 'voyante', v_user, p_target)
  on conflict (game_id, night_number, step, actor_id) do update set target_id = excluded.target_id;

  insert into public.game_log (game_id, message) values (p_game_id, '🔮 La Voyante a sondé un joueur en secret.');

  perform public.advance_phase(p_game_id, true);
end;
$$;

-- ----------------------------------------------------------------------------
-- submit_wolf_vote
-- ----------------------------------------------------------------------------
create or replace function public.submit_wolf_vote(p_game_id uuid, p_target uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_game public.games%rowtype;
  v_target_role text;
  v_alive_wolves int;
  v_submitted int;
begin
  select * into v_game from public.games where id = p_game_id for update;
  if not found or v_game.status <> 'night' or v_game.night_step <> 'loup_garou' then
    raise exception 'Ce n’est pas le moment pour les Loups-Garous.';
  end if;
  if public.my_role_in_game(p_game_id) <> 'loup_garou' then
    raise exception 'Vous n’êtes pas un Loup-Garou.';
  end if;
  if not exists (select 1 from public.game_players where game_id = p_game_id and user_id = v_user and is_alive) then
    raise exception 'Vous êtes mort.';
  end if;

  select role into v_target_role from public.game_roles_secret where game_id = p_game_id and user_id = p_target;
  if v_target_role = 'loup_garou' then
    raise exception 'Vous ne pouvez pas dévorer un autre Loup-Garou.';
  end if;
  if not exists (select 1 from public.game_players where game_id = p_game_id and user_id = p_target and is_alive) then
    raise exception 'Joueur invalide.';
  end if;

  insert into public.night_actions (game_id, night_number, step, actor_id, target_id)
  values (p_game_id, v_game.night_number, 'loup_garou', v_user, p_target)
  on conflict (game_id, night_number, step, actor_id) do update set target_id = excluded.target_id;

  select count(*) into v_alive_wolves
  from public.game_roles_secret rs join public.game_players gp on gp.game_id = rs.game_id and gp.user_id = rs.user_id
  where rs.game_id = p_game_id and rs.role = 'loup_garou' and gp.is_alive;

  select count(distinct actor_id) into v_submitted
  from public.night_actions
  where game_id = p_game_id and night_number = v_game.night_number and step = 'loup_garou';

  if v_submitted >= v_alive_wolves then
    perform public.advance_phase(p_game_id, true);
  end if;
end;
$$;

-- ----------------------------------------------------------------------------
-- submit_sorciere
-- ----------------------------------------------------------------------------
create or replace function public.submit_sorciere(p_game_id uuid, p_heal boolean, p_poison_target uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_game public.games%rowtype;
  v_heal_used boolean;
  v_poison_used boolean;
  v_wolf_target uuid;
begin
  select * into v_game from public.games where id = p_game_id for update;
  if not found or v_game.status <> 'night' or v_game.night_step <> 'sorciere' then
    raise exception 'Ce n’est pas le moment pour la Sorcière.';
  end if;
  if public.my_role_in_game(p_game_id) <> 'sorciere' then
    raise exception 'Vous n’êtes pas la Sorcière.';
  end if;

  select heal_potion_used, poison_potion_used into v_heal_used, v_poison_used
  from public.game_roles_secret where game_id = p_game_id and user_id = v_user;

  if p_heal and v_heal_used then
    raise exception 'Vous avez déjà utilisé votre potion de guérison.';
  end if;
  if p_poison_target is not null and v_poison_used then
    raise exception 'Vous avez déjà utilisé votre potion d’empoisonnement.';
  end if;

  if p_heal then
    v_wolf_target := public.get_wolf_target(p_game_id, v_game.night_number);
    if v_wolf_target is null then
      raise exception 'Il n’y a personne à guérir cette nuit.';
    end if;
  end if;

  if p_poison_target is not null and not exists (
    select 1 from public.game_players where game_id = p_game_id and user_id = p_poison_target and is_alive
  ) then
    raise exception 'Joueur invalide.';
  end if;

  insert into public.night_actions (game_id, night_number, step, actor_id, extra)
  values (
    p_game_id, v_game.night_number, 'sorciere', v_user,
    jsonb_build_object('heal', coalesce(p_heal, false), 'poison_target', p_poison_target)
  )
  on conflict (game_id, night_number, step, actor_id) do update set extra = excluded.extra;

  insert into public.game_log (game_id, message) values (p_game_id, '🧪 La Sorcière a fait son choix en secret.');

  perform public.advance_phase(p_game_id, true);
end;
$$;

-- ----------------------------------------------------------------------------
-- submit_petite_fille
-- ----------------------------------------------------------------------------
create or replace function public.submit_petite_fille(p_game_id uuid, p_peek boolean)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_game public.games%rowtype;
  v_caught boolean := false;
begin
  select * into v_game from public.games where id = p_game_id for update;
  if not found or v_game.status <> 'night' or v_game.night_step <> 'petite_fille' then
    raise exception 'Ce n’est pas le moment pour la Petite Fille.';
  end if;
  if public.my_role_in_game(p_game_id) <> 'petite_fille' then
    raise exception 'Vous n’êtes pas la Petite Fille.';
  end if;

  if p_peek then
    v_caught := random() < 0.2;
  end if;

  insert into public.night_actions (game_id, night_number, step, actor_id, extra)
  values (p_game_id, v_game.night_number, 'petite_fille', v_user, jsonb_build_object('peek', coalesce(p_peek, false), 'caught', v_caught))
  on conflict (game_id, night_number, step, actor_id) do update set extra = excluded.extra;

  perform public.advance_phase(p_game_id, true);
end;
$$;

-- ----------------------------------------------------------------------------
-- submit_vote (jour)
-- ----------------------------------------------------------------------------
create or replace function public.submit_vote(p_game_id uuid, p_target uuid)
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
  if not found or v_game.status <> 'day_vote' then
    raise exception 'Le vote n’est pas ouvert.';
  end if;
  if not exists (select 1 from public.game_players where game_id = p_game_id and user_id = v_user and is_alive) then
    raise exception 'Seuls les joueurs vivants peuvent voter.';
  end if;
  if p_target is not null and not exists (
    select 1 from public.game_players where game_id = p_game_id and user_id = p_target and is_alive
  ) then
    raise exception 'Joueur invalide.';
  end if;

  insert into public.votes (game_id, round_number, voter_id, target_id)
  values (p_game_id, v_game.night_number, v_user, p_target)
  on conflict (game_id, round_number, voter_id) do update set target_id = excluded.target_id;

  select count(*) into v_alive from public.game_players where game_id = p_game_id and is_alive;
  select count(distinct voter_id) into v_submitted from public.votes where game_id = p_game_id and round_number = v_game.night_number;

  if v_submitted >= v_alive then
    perform public.advance_phase(p_game_id, true);
  end if;
end;
$$;

-- ----------------------------------------------------------------------------
-- submit_hunter_shot
-- ----------------------------------------------------------------------------
create or replace function public.submit_hunter_shot(p_game_id uuid, p_target uuid)
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
  if not found or v_game.hunter_pending <> v_user then
    raise exception 'Ce n’est pas à vous de tirer.';
  end if;

  if p_target is not null then
    if p_target = v_user or not exists (
      select 1 from public.game_players where game_id = p_game_id and user_id = p_target and is_alive
    ) then
      raise exception 'Cible invalide.';
    end if;
    perform public.kill_player(p_game_id, p_target, 'chasseur', v_game.night_number);
  else
    insert into public.game_log (game_id, message)
    select p_game_id, gp.display_name || ' (Chasseur) choisit de ne tirer sur personne.'
    from public.game_players gp where gp.game_id = p_game_id and gp.user_id = v_user;
  end if;

  update public.games set hunter_pending = null, hunter_context = null where id = p_game_id;

  perform public.advance_phase(p_game_id, true);
end;
$$;

-- ----------------------------------------------------------------------------
-- tick_game : appelée périodiquement par les clients pour faire avancer le
-- temps (déclenche les transitions de phase quand le minuteur expire).
-- ----------------------------------------------------------------------------
create or replace function public.tick_game(p_game_id uuid)
returns void
language sql
security definer
set search_path = public
as $$
  select public.advance_phase(p_game_id, false);
$$;
