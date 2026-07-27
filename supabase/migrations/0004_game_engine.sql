-- ============================================================================
-- Moteur de jeu : mort, victoire, nuit, résolutions, machine à états
-- ============================================================================
set search_path = public;

-- ----------------------------------------------------------------------------
-- kill_player : applique une mort (idempotent), gère la chaîne des amoureux
-- et déclenche le pouvoir du Chasseur le cas échéant.
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
  v_lover_id uuid;
  v_updated boolean;
begin
  select role into v_role from public.game_roles_secret where game_id = p_game_id and user_id = p_user_id;

  update public.game_players
  set is_alive = false, death_cause = p_cause, died_at_night = p_night, revealed_role = v_role
  where game_id = p_game_id and user_id = p_user_id and is_alive = true
  returning display_name, is_lover into v_name, v_is_lover;

  get diagnostics v_updated = row_count;
  if v_name is null then
    return; -- déjà mort, rien à faire
  end if;

  insert into public.game_log (game_id, message)
  values (p_game_id, v_name || ' (' || public.role_display_name(v_role) || ') ' || public.death_phrase(p_cause) );

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
    where id = p_game_id and hunter_pending is null;
  end if;
end;
$$;

create or replace function public.role_display_name(p_role text)
returns text
language sql
immutable
as $$
  select case p_role
    when 'villageois' then 'Villageois'
    when 'loup_garou' then 'Loup-Garou'
    when 'voyante' then 'Voyante'
    when 'sorciere' then 'Sorcière'
    when 'chasseur' then 'Chasseur'
    when 'petite_fille' then 'Petite Fille'
    when 'cupidon' then 'Cupidon'
    else coalesce(p_role, 'Inconnu')
  end;
$$;

create or replace function public.death_phrase(p_cause text)
returns text
language sql
immutable
as $$
  select case p_cause
    when 'loup_garou' then 'a été dévoré par les Loups-Garous cette nuit.'
    when 'sorciere' then 'a été empoisonné par la Sorcière cette nuit.'
    when 'chagrin' then 'est mort de chagrin, son amoureux ayant péri.'
    when 'chasseur' then 'a été abattu par le Chasseur.'
    when 'vote' then 'a été éliminé par le vote du village.'
    when 'petite_fille_surprise' then 'a été surprise en train d’espionner les loups... et en a payé le prix.'
    when 'parti' then 'a quitté la partie.'
    else 'est mort.'
  end;
$$;

-- ----------------------------------------------------------------------------
-- check_and_apply_win : détermine si la partie est terminée
-- ----------------------------------------------------------------------------
create or replace function public.check_and_apply_win(p_game_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_alive int;
  v_wolves int;
  v_winner text;
  v_lover1 uuid;
  v_lover2 uuid;
begin
  select count(*) into v_alive from public.game_players where game_id = p_game_id and is_alive;

  select count(*) into v_wolves
  from public.game_roles_secret rs
  join public.game_players gp on gp.game_id = rs.game_id and gp.user_id = rs.user_id
  where rs.game_id = p_game_id and rs.role = 'loup_garou' and gp.is_alive;

  if v_alive = 2 then
    select user_id into v_lover1 from public.game_players where game_id = p_game_id and is_alive and is_lover limit 1;
    if v_lover1 is not null then
      select lover_with into v_lover2 from public.game_roles_secret where game_id = p_game_id and user_id = v_lover1;
      if v_lover2 is not null and exists (
        select 1 from public.game_players where game_id = p_game_id and user_id = v_lover2 and is_alive
      ) then
        v_winner := 'amoureux';
      end if;
    end if;
  end if;

  if v_winner is null then
    if v_wolves = 0 then
      v_winner := 'village';
    elsif v_wolves >= (v_alive - v_wolves) then
      v_winner := 'loups';
    end if;
  end if;

  if v_winner is not null then
    update public.games set status = 'ended', winner_team = v_winner, phase_deadline = null,
      hunter_pending = null, hunter_context = null
    where id = p_game_id;

    insert into public.game_log (game_id, message)
    values (p_game_id, case v_winner
      when 'village' then '🌞 Le village a éliminé tous les Loups-Garous. Le village gagne !'
      when 'loups' then '🐺 Les Loups-Garous ont dévoré assez de villageois pour prendre le contrôle. Les loups gagnent !'
      when 'amoureux' then '💘 Il ne reste que les deux amoureux... L’amour triomphe !'
    end);

    return true;
  end if;

  return false;
end;
$$;

-- ----------------------------------------------------------------------------
-- Séquence des étapes de nuit
-- ----------------------------------------------------------------------------
create or replace function public.next_night_step(p_game_id uuid, p_night_number int, p_current text)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_sequence text[];
  v_role_for_step text;
  v_idx int := 0;
  v_found_current boolean := (p_current is null);
  v_step text;
begin
  if p_night_number <= 1 then
    v_sequence := array['cupidon','voyante','loup_garou','sorciere','petite_fille'];
  else
    v_sequence := array['voyante','loup_garou','sorciere','petite_fille'];
  end if;

  foreach v_step in array v_sequence loop
    v_role_for_step := v_step;
    if not v_found_current then
      if v_step = p_current then
        v_found_current := true;
      end if;
      continue;
    end if;
    if public.role_alive_exists(p_game_id, v_role_for_step) then
      return v_step;
    end if;
  end loop;

  return null; -- plus d'étape : direction résolution
end;
$$;

-- ----------------------------------------------------------------------------
-- get_wolf_target : cible majoritaire des loups pour une nuit donnée
-- ----------------------------------------------------------------------------
create or replace function public.get_wolf_target(p_game_id uuid, p_night int)
returns uuid
language sql
security definer
set search_path = public
as $$
  select target_id
  from public.night_actions
  where game_id = p_game_id and night_number = p_night and step = 'loup_garou' and target_id is not null
  group by target_id
  order by count(*) desc, random()
  limit 1;
$$;

-- ----------------------------------------------------------------------------
-- begin_night : démarre une nouvelle nuit
-- ----------------------------------------------------------------------------
create or replace function public.begin_night(p_game_id uuid, p_night_number int)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_first_step text;
  v_seconds int;
begin
  v_first_step := public.next_night_step(p_game_id, p_night_number, null);
  select coalesce((settings->>'night_step_seconds')::int, 40) into v_seconds from public.games where id = p_game_id;

  update public.games
  set status = 'night',
      night_number = p_night_number,
      night_step = coalesce(v_first_step, 'resolve'),
      phase_deadline = now() + make_interval(secs => v_seconds),
      night_deaths_resolved = false
  where id = p_game_id;

  insert into public.game_log (game_id, message)
  values (p_game_id, '🌙 La nuit ' || p_night_number || ' tombe sur le village. Tout le monde ferme les yeux...');
end;
$$;

-- ----------------------------------------------------------------------------
-- resolve_night_deaths : applique les effets de la nuit une seule fois
-- ----------------------------------------------------------------------------
create or replace function public.resolve_night_deaths(p_game_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_night int;
  v_wolf_target uuid;
  v_pf_actor uuid;
  v_pf_caught boolean;
  v_final_victim uuid;
  v_cause text := 'loup_garou';
  v_heal boolean;
  v_poison_target uuid;
  v_deaths_before int;
  v_deaths_after int;
begin
  select night_number into v_night from public.games where id = p_game_id;

  select actor_id, (extra->>'caught')::boolean into v_pf_actor, v_pf_caught
  from public.night_actions
  where game_id = p_game_id and night_number = v_night and step = 'petite_fille' and (extra->>'peek')::boolean = true
  limit 1;

  v_wolf_target := public.get_wolf_target(p_game_id, v_night);

  if v_pf_caught then
    v_final_victim := v_pf_actor;
    v_cause := 'petite_fille_surprise';
  else
    v_final_victim := v_wolf_target;
    v_cause := 'loup_garou';
  end if;

  select (extra->>'heal')::boolean, nullif(extra->>'poison_target','')::uuid
  into v_heal, v_poison_target
  from public.night_actions
  where game_id = p_game_id and night_number = v_night and step = 'sorciere'
  limit 1;

  select count(*) into v_deaths_before from public.game_players where game_id = p_game_id and died_at_night = v_night;

  if v_heal is true and v_final_victim is not null then
    insert into public.game_log (game_id, message)
    values (p_game_id, '🧪 La Sorcière a utilisé sa potion de guérison pour sauver la victime des loups.');
    update public.game_roles_secret set heal_potion_used = true
    where game_id = p_game_id and role = 'sorciere';
    v_final_victim := null;
  end if;

  if v_final_victim is not null then
    perform public.kill_player(p_game_id, v_final_victim, v_cause, v_night);
  end if;

  if v_poison_target is not null then
    perform public.kill_player(p_game_id, v_poison_target, 'sorciere', v_night);
    update public.game_roles_secret set poison_potion_used = true
    where game_id = p_game_id and role = 'sorciere';
  end if;

  select count(*) into v_deaths_after from public.game_players where game_id = p_game_id and died_at_night = v_night;

  if v_deaths_after = v_deaths_before then
    insert into public.game_log (game_id, message)
    values (p_game_id, '☀️ Le village se réveille : personne n’est mort cette nuit !');
  end if;

  update public.games set night_deaths_resolved = true where id = p_game_id;
end;
$$;

-- ----------------------------------------------------------------------------
-- resolve_day_vote_deaths : dépouille le vote du village
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
begin
  select night_number into v_round from public.games where id = p_game_id;

  select target_id, count(*) as votes into v_top
  from public.votes
  where game_id = p_game_id and round_number = v_round and target_id is not null
  group by target_id
  order by count(*) desc
  limit 1;

  if v_top.target_id is null then
    insert into public.game_log (game_id, message)
    values (p_game_id, '🗳️ Aucun vote exprimé : personne n’est éliminé aujourd’hui.');
  else
    select count(*) into v_tie_count
    from (
      select target_id, count(*) as c
      from public.votes
      where game_id = p_game_id and round_number = v_round and target_id is not null
      group by target_id
      having count(*) = v_top.votes
    ) t;

    if v_tie_count > 1 then
      insert into public.game_log (game_id, message)
      values (p_game_id, '🗳️ Égalité des voix : personne n’est éliminé aujourd’hui.');
    else
      perform public.kill_player(p_game_id, v_top.target_id, 'vote', v_round);
    end if;
  end if;

  update public.games set day_vote_resolved = true where id = p_game_id;
end;
$$;

-- ----------------------------------------------------------------------------
-- advance_phase : le "meneur de jeu" automatique. Appelable par n'importe
-- quel client de la partie ; idempotent et sûr en cas d'appels concurrents
-- grâce au verrou FOR UPDATE sur la ligne games.
-- p_forced = true permet de bypasser l'attente du minuteur (ex: toutes les
-- actions requises ont déjà été soumises).
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

  if v_game.status = 'role_reveal' then
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

    perform public.begin_night(p_game_id, v_game.night_number + 1);
    return;
  end if;
end;
$$;
