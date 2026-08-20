-- ============================================================================
-- Demande utilisateur : nouvelle carte "Loup Alpha".
-- - Nécessite au moins 10 joueurs et au maximum 2 Loups-Garous simples.
-- - Chaque nuit, choisit une cible et décide : ÉLIMINER (comme la meute
--   classique) ou INFECTER (la cible rejoint le camp des Loups à la place de
--   mourir). L'infection ne peut être utilisée qu'UNE SEULE FOIS par partie
--   — une fois utilisée, le Loup Alpha ne peut plus qu'éliminer.
-- - Remplace entièrement le vote collectif classique de la meute
--   (submit_wolf_vote / étape 'loup_garou') pendant que le Loup Alpha est en
--   vie : c'est lui seul qui décide chaque nuit (meneur de meute). Si le Loup
--   Alpha meurt, la meute retrouve son vote collectif normal pour le reste de
--   la partie (voir role_alive_exists('loup_alpha') utilisé comme bascule
--   dans next_night_step / resolve_night_deaths — jamais un simple "existe
--   dans la partie", toujours "vivant maintenant").
-- - Points bonus (demande utilisateur) : +5 par villageois dévoré pour
--   TOUS les loups (Loup-Garou + Loup Alpha), +3 par nuit survécue en tant
--   que loup, +20 spécial pour le Loup Alpha s'il a infecté quelqu'un.
-- ============================================================================
set search_path = public;

-- --- Nouvelles colonnes de suivi (game_roles_secret) -----------------------
alter table public.game_roles_secret
  add column if not exists alpha_infect_used boolean not null default false,
  add column if not exists infected_at_night integer;

-- --- role_display_name : nom du nouveau rôle --------------------------------
create or replace function public.role_display_name(p_role text)
returns text
language sql
immutable
as $$
  select case p_role
    when 'villageois' then 'Villageois'
    when 'loup_garou' then 'Loup-Garou'
    when 'loup_alpha' then 'Loup Alpha'
    when 'voyante' then 'Voyante'
    when 'sorciere' then 'Sorcière'
    when 'chasseur' then 'Chasseur'
    when 'petite_fille' then 'Petite Fille'
    when 'cupidon' then 'Cupidon'
    when 'ancien' then 'Ancien'
    when 'voleur' then 'Voleur'
    when 'enfant_sauvage' then 'Enfant Sauvage'
    else coalesce(p_role, 'Inconnu')
  end;
$$;

-- --- compute_default_role_counts : loup_alpha toujours désactivé par défaut,
-- rôle avancé à activer volontairement par l'hôte (impact trop fort sur
-- l'équilibre pour l'auto-activer comme ancien/voleur/enfant_sauvage) -------
create or replace function public.compute_default_role_counts(p_player_count integer)
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
    'loup_alpha', false,
    'voyante', p_player_count >= 5,
    'sorciere', p_player_count >= 6,
    'chasseur', false,
    'petite_fille', p_player_count >= 8,
    'cupidon', false,
    'ancien', p_player_count >= 10,
    'voleur', p_player_count >= 11,
    'enfant_sauvage', p_player_count >= 9,
    'capitaine', true
  );
end;
$$;

-- --- step_duration_seconds : même délai que le chat/vote de meute classique
create or replace function public.step_duration_seconds(p_game_id uuid, p_step text)
returns integer
language sql
stable security definer
set search_path = public
as $$
  select case p_step
    when 'loup_garou' then coalesce((settings->>'wolf_chat_seconds')::int, 180)
    when 'loup_alpha' then coalesce((settings->>'wolf_chat_seconds')::int, 180)
    when 'voyante' then coalesce((settings->>'voyante_seconds')::int, (settings->>'night_step_seconds')::int, 70)
    when 'sorciere' then coalesce((settings->>'sorciere_seconds')::int, (settings->>'night_step_seconds')::int, 70)
    else coalesce((settings->>'night_step_seconds')::int, 70)
  end
  from public.games where id = p_game_id;
$$;

-- --- start_game : validations + distribution du rôle loup_alpha ------------
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
  v_last_roles text[];
  v_last_streaks int[];
  v_attempt int;
  v_ok boolean;
  v_has_alpha boolean;
begin
  select * into v_game from public.games where id = p_game_id for update;
  if not found then raise exception 'Partie introuvable.'; end if;
  if v_game.host_id <> v_user then raise exception 'Seul l''hôte peut démarrer la partie.'; end if;
  if v_game.status <> 'lobby' then raise exception 'La partie a déjà démarré.'; end if;

  select array_agg(user_id order by seat_number) into v_players
  from public.game_players where game_id = p_game_id;

  v_count := coalesce(array_length(v_players, 1), 0);
  if v_count < 4 then raise exception 'Il faut au moins 4 joueurs pour commencer.'; end if;
  if v_count > 25 then raise exception 'Une partie ne peut pas dépasser 25 joueurs.'; end if;

  v_role_counts := v_game.settings -> 'role_counts';
  if v_role_counts is null or v_role_counts = 'null'::jsonb then
    v_role_counts := public.compute_default_role_counts(v_count);
  end if;

  v_has_alpha := coalesce((v_role_counts->>'loup_alpha')::boolean, false);

  if v_has_alpha then
    if v_count < 10 then
      raise exception 'Le Loup Alpha nécessite au moins 10 joueurs.';
    end if;
    if (v_role_counts->>'loup_garou')::int > 2 then
      raise exception 'Avec le Loup Alpha, il ne peut y avoir que 2 Loups-Garous simples au maximum.';
    end if;
  end if;

  v_special_total := (v_role_counts->>'loup_garou')::int
    + coalesce((v_role_counts->>'loup_alpha')::boolean::int, 0)
    + (v_role_counts->>'voyante')::boolean::int
    + (v_role_counts->>'sorciere')::boolean::int
    + (v_role_counts->>'chasseur')::boolean::int
    + (v_role_counts->>'petite_fille')::boolean::int
    + (v_role_counts->>'cupidon')::boolean::int
    + coalesce((v_role_counts->>'ancien')::boolean::int, 0)
    + coalesce((v_role_counts->>'voleur')::boolean::int, 0)
    + coalesce((v_role_counts->>'enfant_sauvage')::boolean::int, 0);

  if (v_role_counts->>'loup_garou')::int < 1 and not v_has_alpha then
    raise exception 'Il faut au moins un Loup-Garou.';
  end if;
  if v_special_total > v_count then
    raise exception 'La configuration des rôles dépasse le nombre de joueurs.';
  end if;

  for i in 1..(v_role_counts->>'loup_garou')::int loop
    v_roles := v_roles || 'loup_garou'::text;
  end loop;
  if v_has_alpha then v_roles := v_roles || 'loup_alpha'::text; end if;
  if (v_role_counts->>'voyante')::boolean then v_roles := v_roles || 'voyante'::text; end if;
  if (v_role_counts->>'sorciere')::boolean then v_roles := v_roles || 'sorciere'::text; end if;
  if (v_role_counts->>'chasseur')::boolean then v_roles := v_roles || 'chasseur'::text; end if;
  if (v_role_counts->>'petite_fille')::boolean then v_roles := v_roles || 'petite_fille'::text; end if;
  if (v_role_counts->>'cupidon')::boolean then v_roles := v_roles || 'cupidon'::text; end if;
  if coalesce((v_role_counts->>'ancien')::boolean, false) then v_roles := v_roles || 'ancien'::text; end if;
  if coalesce((v_role_counts->>'enfant_sauvage')::boolean, false) then v_roles := v_roles || 'enfant_sauvage'::text; end if;
  if coalesce((v_role_counts->>'voleur')::boolean, false) then
    v_roles := v_roles || 'voleur'::text;
  end if;

  while coalesce(array_length(v_roles, 1), 0) < v_count loop
    v_roles := v_roles || 'villageois'::text;
  end loop;

  select array_agg(coalesce(p.last_role, '') order by t.ord), array_agg(coalesce(p.role_streak, 0) order by t.ord)
  into v_last_roles, v_last_streaks
  from unnest(v_players) with ordinality as t(user_id, ord)
  join public.profiles p on p.id = t.user_id;

  for v_attempt in 1..200 loop
    select array_agg(r order by random()) into v_shuffled from unnest(v_roles) r;

    v_ok := true;
    for i in 1..v_count loop
      if v_shuffled[i] = v_last_roles[i] and v_last_streaks[i] >= 2 then
        v_ok := false;
        exit;
      end if;
    end loop;

    exit when v_ok;
  end loop;

  for i in 1..v_count loop
    insert into public.game_roles_secret (game_id, user_id, role)
    values (p_game_id, v_players[i], v_shuffled[i]);

    update public.profiles
    set role_streak = case when last_role = v_shuffled[i] then role_streak + 1 else 1 end,
        last_role = v_shuffled[i]
    where id = v_players[i];
  end loop;

  select coalesce((v_game.settings->>'role_reveal_intro_seconds')::int, 60) into v_seconds;

  update public.game_players set is_ready = false where game_id = p_game_id;

  update public.games
  set status = 'role_reveal',
      night_number = 0,
      night_step = null,
      phase_deadline = now() + make_interval(secs => v_seconds),
      settings = jsonb_set(settings, '{role_counts}', v_role_counts),
      thief_extra_roles = null,
      village_powers_disabled = false,
      captain_pending = null
  where id = p_game_id;

  insert into public.game_log (game_id, message)
  values (p_game_id, '🎭 Les rôles ont été distribués en secret. Regardez votre carte...');
end;
$$;

-- --- next_night_step : le Loup Alpha (vivant) remplace l'étape collective
-- 'loup_garou' dans la séquence de nuit ; la substitution se fait AVANT la
-- comparaison "où en étions-nous" (v_found_current), sinon la reprise après
-- l'action du Loup Alpha ne retrouverait jamais sa position dans la séquence
-- (p_current vaudrait 'loup_alpha', jamais égal à 'loup_garou' resté tel
-- quel dans v_sequence).
create or replace function public.next_night_step(p_game_id uuid, p_night_number integer, p_current text)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_sequence text[];
  v_found_current boolean := (p_current is null);
  v_step text;
  v_powers_disabled boolean;
  v_has_alpha boolean;
begin
  select village_powers_disabled into v_powers_disabled from public.games where id = p_game_id;
  select public.role_alive_exists(p_game_id, 'loup_alpha') into v_has_alpha;

  if p_night_number <= 1 then
    v_sequence := array['voleur','cupidon','enfant_sauvage','voyante','loup_garou','sorciere'];
  else
    v_sequence := array['voyante','loup_garou','sorciere'];
  end if;

  foreach v_step in array v_sequence loop
    if v_step = 'loup_garou' and v_has_alpha then
      v_step := 'loup_alpha';
    end if;

    if not v_found_current then
      if v_step = p_current then
        v_found_current := true;
      end if;
      continue;
    end if;

    if v_step in ('voyante','sorciere') and coalesce(v_powers_disabled, false) then
      continue;
    end if;

    if public.role_alive_exists(p_game_id, v_step) then
      return v_step;
    end if;
  end loop;

  return null; -- plus d'étape : direction résolution
end;
$$;

-- --- submit_loup_alpha : action nocturne du Loup Alpha ----------------------
create or replace function public.submit_loup_alpha(p_game_id uuid, p_target uuid, p_mode text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_game public.games%rowtype;
  v_target_role text;
  v_infect_used boolean;
begin
  select * into v_game from public.games where id = p_game_id for update;
  if not found or v_game.status <> 'night' or v_game.night_step <> 'loup_alpha' then
    raise exception 'Ce n''est pas le moment pour le Loup Alpha.';
  end if;
  if public.my_role_in_game(p_game_id) <> 'loup_alpha' then
    raise exception 'Vous n''êtes pas le Loup Alpha.';
  end if;
  if not exists (select 1 from public.game_players where game_id = p_game_id and user_id = v_user and is_alive) then
    raise exception 'Vous êtes mort.';
  end if;
  if p_mode not in ('eliminate', 'infect') then
    raise exception 'Action invalide.';
  end if;

  if p_target is not null then
    select role into v_target_role from public.game_roles_secret where game_id = p_game_id and user_id = p_target;
    if v_target_role in ('loup_garou', 'loup_alpha') then
      raise exception 'Vous ne pouvez pas cibler un autre Loup.';
    end if;
    if not exists (select 1 from public.game_players where game_id = p_game_id and user_id = p_target and is_alive) then
      raise exception 'Joueur invalide.';
    end if;
  end if;

  if p_mode = 'infect' then
    if p_target is null then
      raise exception 'Choisissez un joueur à infecter.';
    end if;
    select alpha_infect_used into v_infect_used
    from public.game_roles_secret where game_id = p_game_id and user_id = v_user;
    if coalesce(v_infect_used, false) then
      raise exception 'Vous avez déjà utilisé votre infection.';
    end if;
  end if;

  insert into public.night_actions (game_id, night_number, step, actor_id, target_id, extra)
  values (p_game_id, v_game.night_number, 'loup_alpha', v_user, p_target, jsonb_build_object('mode', p_mode))
  on conflict (game_id, night_number, step, actor_id) do update set target_id = excluded.target_id, extra = excluded.extra;

  perform public.advance_phase(p_game_id, true);
end;
$$;

grant execute on function public.submit_loup_alpha(uuid, uuid, text) to authenticated;

-- --- infect_player : conversion d'une victime en Loup-Garou -----------------
create or replace function public.infect_player(p_game_id uuid, p_user_id uuid, p_night integer)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_old_role text;
begin
  select role into v_old_role from public.game_roles_secret where game_id = p_game_id and user_id = p_user_id;
  if v_old_role is null or v_old_role in ('loup_garou', 'loup_alpha') then
    return; -- déjà loup ou introuvable, rien à faire
  end if;

  update public.game_roles_secret
  set role = 'loup_garou', infected_at_night = p_night
  where game_id = p_game_id and user_id = p_user_id;

  update public.game_roles_secret set alpha_infect_used = true
  where game_id = p_game_id and role = 'loup_alpha';

  -- message public anonyme, même patron que la conversion de l'Enfant
  -- Sauvage : jamais révéler qui a été infecté.
  insert into public.game_log (game_id, message, night_number, kind, meta)
  values (
    p_game_id,
    '🧬 Une infection s''est propagée cette nuit... un villageois a secrètement rejoint les Loups-Garous.',
    p_night,
    'alpha_infect',
    jsonb_build_object('victim_id', p_user_id)
  );
end;
$$;

-- --- resolve_night_deaths : bascule éliminer/infecter selon l'action du
-- Loup Alpha (s'il est vivant), sinon comportement inchangé (vote collectif
-- classique via get_wolf_target) -------------------------------------------
create or replace function public.resolve_night_deaths(p_game_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_night int;
  v_final_victim uuid;
  v_wolf_mode text := 'eliminate';
  v_heal boolean;
  v_poison_target uuid;
  v_deaths_before int;
  v_deaths_after int;
  v_has_alpha boolean;
  v_infected boolean := false;
begin
  select night_number into v_night from public.games where id = p_game_id;

  select public.role_alive_exists(p_game_id, 'loup_alpha') into v_has_alpha;

  if v_has_alpha then
    select target_id, coalesce(extra->>'mode', 'eliminate') into v_final_victim, v_wolf_mode
    from public.night_actions
    where game_id = p_game_id and night_number = v_night and step = 'loup_alpha'
    limit 1;
  else
    v_final_victim := public.get_wolf_target(p_game_id, v_night);
  end if;

  select (extra->>'heal')::boolean, nullif(extra->>'poison_target','')::uuid
  into v_heal, v_poison_target
  from public.night_actions
  where game_id = p_game_id and night_number = v_night and step = 'sorciere'
  limit 1;

  select count(*) into v_deaths_before from public.game_players where game_id = p_game_id and died_at_night = v_night;

  -- La potion de guérison protège d'une élimination classique, pas d'une
  -- infection (la cible ne meurt pas, elle change de camp — rien à soigner).
  if v_wolf_mode = 'eliminate' and v_heal is true and v_final_victim is not null then
    insert into public.game_log (game_id, message, night_number, kind, meta)
    values (
      p_game_id,
      '🧪 La Sorcière a utilisé sa potion de guérison pour sauver la victime des loups.',
      v_night,
      'witch_heal',
      jsonb_build_object('target_user_id', v_final_victim)
    );
    update public.game_roles_secret set heal_potion_used = true
    where game_id = p_game_id and role = 'sorciere';
    v_final_victim := null;
  end if;

  if v_final_victim is not null then
    if v_wolf_mode = 'infect' then
      perform public.infect_player(p_game_id, v_final_victim, v_night);
      v_infected := true;
    else
      perform public.kill_player(p_game_id, v_final_victim, 'loup_garou', v_night);
    end if;
  end if;

  if v_poison_target is not null then
    perform public.kill_player(p_game_id, v_poison_target, 'sorciere', v_night);
    update public.game_roles_secret set poison_potion_used = true
    where game_id = p_game_id and role = 'sorciere';
  end if;

  select count(*) into v_deaths_after from public.game_players where game_id = p_game_id and died_at_night = v_night;

  if v_deaths_after = v_deaths_before and not v_infected then
    insert into public.game_log (game_id, message, night_number)
    values (p_game_id, '☀️ Le village se réveille : personne n''est mort cette nuit !', v_night);
  end if;

  update public.games set night_deaths_resolved = true where id = p_game_id;
end;
$$;

-- --- check_and_apply_win : le Loup Alpha compte comme loup ------------------
create or replace function public.check_and_apply_win(p_game_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_status text;
  v_alive int;
  v_wolves int;
  v_winner text;
  v_lover1 uuid;
  v_lover2 uuid;
begin
  select status into v_status from public.games where id = p_game_id;
  if v_status is null or v_status = 'ended' then
    return false;
  end if;

  select count(*) into v_alive from public.game_players where game_id = p_game_id and is_alive;

  select count(*) into v_wolves
  from public.game_roles_secret rs
  join public.game_players gp on gp.game_id = rs.game_id and gp.user_id = rs.user_id
  where rs.game_id = p_game_id and rs.role in ('loup_garou', 'loup_alpha') and gp.is_alive;

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
      hunter_pending = null, hunter_context = null, captain_pending = null
    where id = p_game_id;

    insert into public.game_log (game_id, message)
    values (p_game_id, case v_winner
      when 'village' then '🌞 Le village a éliminé tous les Loups-Garous. Le village gagne !'
      when 'loups' then '🐺 Les Loups-Garous ont dévoré assez de villageois pour prendre le contrôle. Les loups gagnent !'
      when 'amoureux' then '💘 Il ne reste que les deux amoureux... L''amour triomphe !'
    end);

    perform public.apply_rank_updates_for_game(p_game_id, v_winner);

    return true;
  end if;

  return false;
end;
$$;

-- --- apply_rank_updates_for_game : le Loup Alpha compte comme loup pour le
-- calcul de victoire individuelle (won) --------------------------------------
create or replace function public.apply_rank_updates_for_game(p_game_id uuid, p_winner text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  r record;
  v_won boolean;
  v_code text;
  v_total_rounds int;
  v_ratio numeric;
  v_impact jsonb;
  v_impact_bonus int;
  v_impact_details jsonb;
  v_result jsonb;
begin
  select code, greatest(night_number, 1) into v_code, v_total_rounds from public.games where id = p_game_id;

  for r in
    select gp.user_id, gp.is_lover, gp.died_at_night, rs.role
    from public.game_players gp
    left join public.game_roles_secret rs
      on rs.game_id = gp.game_id and rs.user_id = gp.user_id
    where gp.game_id = p_game_id
  loop
    v_won := case
      when p_winner = 'amoureux' then coalesce(r.is_lover, false)
      when p_winner = 'loups' then coalesce(r.role in ('loup_garou', 'loup_alpha'), false)
      when p_winner = 'village' then coalesce(r.role not in ('loup_garou', 'loup_alpha'), true)
      else false
    end;

    v_ratio := case
      when r.died_at_night is null then 1.0
      else least(greatest(r.died_at_night::numeric / v_total_rounds, 0.4), 0.9)
    end;

    v_impact := public.compute_impact_bonus(p_game_id, r.user_id, r.role);
    v_impact_bonus := coalesce((v_impact->>'bonus')::int, 0);
    v_impact_details := coalesce(v_impact->'details', '[]'::jsonb);

    v_result := public.apply_rank_result(r.user_id, v_won, v_ratio, v_impact_bonus);

    insert into public.game_results (
      game_id, user_id, code, role, is_lover, winner_team, won,
      points_gained, participation_ratio, impact_bonus, impact_details, new_rank_points, new_rank_tier
    )
    values (
      p_game_id, r.user_id, v_code, r.role, coalesce(r.is_lover, false), p_winner, v_won,
      (v_result->>'gain')::int, v_ratio, v_impact_bonus, v_impact_details,
      (v_result->>'new_points')::int, v_result->>'new_tier'
    );
  end loop;
end;
$$;

-- --- compute_impact_bonus : bonus loups (+5/villageois dévoré, +3/nuit
-- survécue en tant que loup) + bonus spécial Loup Alpha (+20 s'il a infecté) -
create or replace function public.compute_impact_bonus(p_game_id uuid, p_user_id uuid, p_role text)
returns jsonb
language plpgsql
stable security definer
set search_path = public
as $$
declare
  v_bonus int := 0;
  v_details jsonb := '[]'::jsonb;
  v_heal_used boolean;
  v_poison_used boolean;
  v_poison_killed_wolf boolean;
  v_ancien_used boolean;
  v_hunter_killed_wolf boolean;
  v_seer_hits int;
  v_devoured int;
  v_total_rounds int;
  v_died_at int;
  v_survived int;
  v_alpha_infected boolean;
begin
  if p_role = 'sorciere' then
    select heal_potion_used, poison_potion_used into v_heal_used, v_poison_used
    from public.game_roles_secret where game_id = p_game_id and user_id = p_user_id;

    if coalesce(v_heal_used, false) then
      v_bonus := v_bonus + 10;
      v_details := v_details || jsonb_build_object('kind', 'witch_heal', 'points', 10);
    end if;

    if coalesce(v_poison_used, false) then
      select exists (
        select 1 from public.game_players gp
        join public.game_roles_secret rs on rs.game_id = gp.game_id and rs.user_id = gp.user_id
        where gp.game_id = p_game_id and gp.death_cause = 'sorciere' and rs.role = 'loup_garou'
      ) into v_poison_killed_wolf;

      if v_poison_killed_wolf then
        v_bonus := v_bonus + 15;
        v_details := v_details || jsonb_build_object('kind', 'witch_poison_wolf', 'points', 15);
      end if;
    end if;
  end if;

  if p_role = 'chasseur' then
    select exists (
      select 1 from public.game_players gp
      join public.game_roles_secret rs on rs.game_id = gp.game_id and rs.user_id = gp.user_id
      where gp.game_id = p_game_id and gp.death_cause = 'chasseur' and rs.role = 'loup_garou'
    ) into v_hunter_killed_wolf;

    if v_hunter_killed_wolf then
      v_bonus := v_bonus + 15;
      v_details := v_details || jsonb_build_object('kind', 'hunter_shot_wolf', 'points', 15);
    end if;
  end if;

  if p_role = 'voyante' then
    select count(*) into v_seer_hits
    from public.night_actions na
    join public.game_roles_secret rs on rs.game_id = na.game_id and rs.user_id = na.target_id
    where na.game_id = p_game_id and na.step = 'voyante' and na.actor_id = p_user_id and rs.role = 'loup_garou';

    v_seer_hits := least(coalesce(v_seer_hits, 0), 2);
    if v_seer_hits > 0 then
      v_bonus := v_bonus + v_seer_hits * 5;
      v_details := v_details || jsonb_build_object('kind', 'seer_wolf_reveal', 'points', v_seer_hits * 5, 'count', v_seer_hits);
    end if;
  end if;

  if p_role = 'ancien' then
    select ancien_extra_life_used into v_ancien_used
    from public.game_roles_secret where game_id = p_game_id and user_id = p_user_id;

    if coalesce(v_ancien_used, false) then
      v_bonus := v_bonus + 10;
      v_details := v_details || jsonb_build_object('kind', 'ancien_extra_life', 'points', 10);
    end if;
  end if;

  if p_role in ('loup_garou', 'loup_alpha') then
    select count(*) into v_devoured
    from public.game_players where game_id = p_game_id and death_cause = 'loup_garou';

    if coalesce(v_devoured, 0) > 0 then
      v_bonus := v_bonus + v_devoured * 5;
      v_details := v_details || jsonb_build_object('kind', 'wolf_villagers_devoured', 'points', v_devoured * 5, 'count', v_devoured);
    end if;

    select greatest(night_number, 1) into v_total_rounds from public.games where id = p_game_id;
    select died_at_night into v_died_at from public.game_players where game_id = p_game_id and user_id = p_user_id;
    v_survived := coalesce(v_died_at, v_total_rounds);

    if v_survived > 0 then
      v_bonus := v_bonus + v_survived * 3;
      v_details := v_details || jsonb_build_object('kind', 'wolf_nights_survived', 'points', v_survived * 3, 'count', v_survived);
    end if;

    if p_role = 'loup_alpha' then
      select alpha_infect_used into v_alpha_infected
      from public.game_roles_secret where game_id = p_game_id and user_id = p_user_id;

      if coalesce(v_alpha_infected, false) then
        v_bonus := v_bonus + 20;
        v_details := v_details || jsonb_build_object('kind', 'alpha_infected_villager', 'points', 20);
      end if;
    end if;
  end if;

  return jsonb_build_object('bonus', v_bonus, 'details', v_details);
end;
$$;

-- --- get_my_game_view : coéquipiers loups étendus + statut du pouvoir
-- d'infection + notice privée pour la victime infectée ----------------------
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
  v_wild_child_mentor uuid;
  v_result jsonb;
begin
  if not exists (select 1 from public.game_players where game_id = p_game_id and user_id = v_user) then
    raise exception 'Vous ne participez pas à cette partie.';
  end if;

  select * into v_game from public.games where id = p_game_id;

  if v_game.status <> 'ended' and v_game.last_activity_at < now() - interval '2 hours' then
    update public.games set status = 'ended' where id = p_game_id;
    insert into public.game_log (game_id, message)
    values (p_game_id, 'La partie a été fermée automatiquement après 2h d''inactivité.');
    v_game.status := 'ended';
  end if;

  select role into v_my_role from public.game_roles_secret where game_id = p_game_id and user_id = v_user;
  select is_alive into v_my_alive from public.game_players where game_id = p_game_id and user_id = v_user;
  select lover_with, wild_child_mentor into v_lover_id, v_wild_child_mentor
  from public.game_roles_secret where game_id = p_game_id and user_id = v_user;

  select jsonb_build_object(
    'game', to_jsonb(v_game) - 'thief_extra_roles',

    'players', coalesce((
      select jsonb_agg(
        to_jsonb(gp) || jsonb_build_object('rank_tier', public.rank_tier_for_points(coalesce(pr.rank_points, 0)))
        order by gp.seat_number
      )
      from public.game_players gp
      left join public.profiles pr on pr.id = gp.user_id
      where gp.game_id = p_game_id
    ), '[]'::jsonb),

    'my_role', v_my_role,
    'my_alive', coalesce(v_my_alive, false),
    'lover_id', v_lover_id,
    'wild_child_mentor', v_wild_child_mentor,

    'mentee_ids', coalesce((
      select jsonb_agg(rs.user_id)
      from public.game_roles_secret rs
      where rs.game_id = p_game_id and rs.role = 'enfant_sauvage' and rs.wild_child_mentor = v_user
    ), '[]'::jsonb),

    'witch_saved_me', case when v_game.status = 'day_reveal' then exists (
      select 1 from public.game_log
      where game_id = p_game_id and night_number = v_game.night_number and kind = 'witch_heal'
        and (meta->>'target_user_id')::uuid = v_user
    ) else false end,

    'witch_poisoned_me', case when v_game.status = 'day_reveal' then exists (
      select 1 from public.game_players
      where game_id = p_game_id and user_id = v_user
        and death_cause = 'sorciere' and died_at_night = v_game.night_number
    ) else false end,

    'wild_child_turned_wolf', case when v_game.status = 'day_reveal' then exists (
      select 1 from public.game_roles_secret
      where game_id = p_game_id and user_id = v_user and wild_child_turned_at_night = v_game.night_number
    ) else false end,

    -- Personnel, voir migration 0088 : ai-je été infecté(e) par le Loup
    -- Alpha CETTE nuit (même principe que wild_child_turned_wolf ci-dessus,
    -- gated day_reveal) ? my_role reflète déjà le nouveau rôle en temps réel,
    -- ce champ ne sert qu'à déclencher l'annonce ponctuelle.
    'alpha_infected_me', case when v_game.status = 'day_reveal' then exists (
      select 1 from public.game_roles_secret
      where game_id = p_game_id and user_id = v_user and infected_at_night = v_game.night_number
    ) else false end,

    -- Personnel : le Loup Alpha lui-même sait-il s'il a déjà consommé son
    -- infection (une seule par partie) ? Sert à désactiver le bouton côté
    -- client sans attendre une tentative refusée par le serveur.
    'alpha_infect_used', case when v_my_role = 'loup_alpha' then (
      select alpha_infect_used from public.game_roles_secret where game_id = p_game_id and user_id = v_user
    ) else null end,

    'thief_stole_my_card', exists (
      select 1 from public.game_log
      where game_id = p_game_id and kind = 'thief_swap' and (meta->>'victim_id')::uuid = v_user
    ),
    'thief_stole_my_new_role', (
      select meta->>'new_role' from public.game_log
      where game_id = p_game_id and kind = 'thief_swap' and (meta->>'victim_id')::uuid = v_user
      order by created_at desc limit 1
    ),

    'my_impact_preview', case
      when not coalesce(v_my_alive, false) and v_game.status <> 'ended' and v_my_role is not null
      then public.compute_impact_bonus(p_game_id, v_user, v_my_role)
      else null
    end,

    'my_game_result', case when v_game.status = 'ended' then (
      select jsonb_build_object(
        'points_gained', gr.points_gained,
        'participation_ratio', gr.participation_ratio,
        'impact_bonus', gr.impact_bonus,
        'impact_details', gr.impact_details,
        'new_rank_points', gr.new_rank_points,
        'new_rank_tier', gr.new_rank_tier,
        'won', gr.won
      )
      from public.game_results gr
      where gr.game_id = p_game_id and gr.user_id = v_user
      order by gr.created_at desc limit 1
    ) else null end,

    'wolf_teammates', case when v_my_role in ('loup_garou', 'loup_alpha') then coalesce((
      select jsonb_agg(rs.user_id)
      from public.game_roles_secret rs
      where rs.game_id = p_game_id and rs.role in ('loup_garou', 'loup_alpha') and rs.user_id <> v_user
    ), '[]'::jsonb) else null end,

    'seer_reveals', case when v_my_role = 'voyante' then coalesce((
      select jsonb_agg(jsonb_build_object(
        'target_id', na.target_id,
        'role', rs.role,
        'night_number', na.night_number
      ) order by na.night_number)
      from public.night_actions na
      join public.game_roles_secret rs on rs.game_id = na.game_id and rs.user_id = na.target_id
      where na.game_id = p_game_id and na.step = 'voyante' and na.actor_id = p_user_id
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

    'day_reveal_ready_ids', case when v_game.status = 'day_reveal' then coalesce((
      select jsonb_agg(user_id) from public.day_reveal_ready
      where game_id = p_game_id and round_number = v_game.night_number
    ), '[]'::jsonb) else '[]'::jsonb end,

    'night_recap', case when v_game.status = 'day_reveal' then coalesce((
      select jsonb_agg(jsonb_build_object('id', id, 'message', message) order by created_at asc)
      from public.game_log
      where game_id = p_game_id and night_number = v_game.night_number
    ), '[]'::jsonb) else '[]'::jsonb end,

    'vote_recap', case when v_game.status = 'day_vote_recap' then jsonb_build_object(
      'votes', coalesce((
        select jsonb_agg(jsonb_build_object('voter_id', voter_id, 'target_id', target_id))
        from public.votes where game_id = p_game_id and round_number = v_game.night_number
      ), '[]'::jsonb),
      'ready_ids', coalesce((
        select jsonb_agg(user_id) from public.vote_recap_ready
        where game_id = p_game_id and round_number = v_game.night_number
      ), '[]'::jsonb),
      'captain_voter_id', v_game.last_vote_captain_id,
      'captain_random_notice', (
        select message from public.game_log
        where game_id = p_game_id and night_number = v_game.night_number and kind = 'captain_random'
        order by created_at desc limit 1
      )
    ) else null end,

    'join_requests', case
      when v_game.host_id = v_user and v_game.status = 'lobby' then coalesce((
        select jsonb_agg(jsonb_build_object(
          'id', id, 'user_id', user_id, 'display_name', display_name, 'created_at', created_at
        ) order by created_at asc)
        from public.game_join_requests
        where game_id = p_game_id and status = 'pending'
      ), '[]'::jsonb)
      else null
    end,

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

grant execute on function public.get_my_game_view(uuid) to authenticated;
