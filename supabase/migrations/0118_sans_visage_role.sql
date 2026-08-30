-- ============================================================================
-- Nouveau rôle : Le Sans-Visage (Loups-Garous, dissimulation). Fonctionne
-- EXACTEMENT comme un Loup-Garou simple dans tous les sens du jeu (vote de
-- nuit, chat des loups, majorité d'infection, condition de victoire, score)
-- — confirmé par l'utilisateur : "il est du clan des loups et fonctionne
-- exactement comme un loup". La SEULE exception, explicitement limitée par
-- l'utilisateur à la Voyante uniquement (pas le Griot, pas la Petite
-- Fille) : quand la Voyante sonde un Sans-Visage, elle voit "Villageois"
-- au lieu de "Loup-Garou".
--
-- Étendue du changement : 'sans_visage' doit être ajouté PARTOUT où
-- 'loup_garou'/'loup_alpha' apparaissent ensemble dans ce projet (17
-- fonctions recensées avant d'écrire cette migration, via une recherche sur
-- toutes les définitions live) — SAUF dans la classification de
-- seer_reveals (get_my_game_view), qui doit rester intacte : ne PAS ajouter
-- 'sans_visage' à son test `role in ('loup_garou', 'loup_alpha')` fait déjà
-- retomber sur 'villageois' par défaut (branche else déjà existante), c'est
-- exactement le comportement voulu, obtenu par omission délibérée plutôt
-- que par un cas spécial explicite.
--
-- Décision assumée, non explicitement précisée par l'utilisateur : aucun
-- minimum de joueurs particulier (contrairement au Loup Alpha, 10+) — juste
-- un rôle optionnel en plus (case à cocher, désactivée par défaut, comme le
-- Griot/Chasseur/Cupidon), soumis au seul plafond général déjà existant
-- (v_special_total <= nombre de joueurs).
-- ============================================================================
set search_path = public;

-- ----------------------------------------------------------------------------
-- 1. compute_default_role_counts
-- ----------------------------------------------------------------------------
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
    'griot', false,
    'sans_visage', false,
    'capitaine', true
  );
end;
$$;

-- ----------------------------------------------------------------------------
-- 2. start_game : sans_visage compte comme un vrai Loup pour la contrainte
-- "il faut au moins un Loup-Garou" (v_has_sans_visage ajouté à la garde).
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
  v_last_roles text[];
  v_last_streaks int[];
  v_attempt int;
  v_ok boolean;
  v_has_alpha boolean;
  v_has_sans_visage boolean;
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
  v_has_sans_visage := coalesce((v_role_counts->>'sans_visage')::boolean, false);

  if v_has_alpha then
    if v_count < 10 then
      raise exception 'Le Loup Alpha nécessite au moins 10 joueurs.';
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
    + coalesce((v_role_counts->>'enfant_sauvage')::boolean::int, 0)
    + coalesce((v_role_counts->>'griot')::boolean::int, 0)
    + coalesce((v_role_counts->>'sans_visage')::boolean::int, 0);

  if (v_role_counts->>'loup_garou')::int < 1 and not v_has_alpha and not v_has_sans_visage then
    raise exception 'Il faut au moins un Loup-Garou.';
  end if;
  if v_special_total > v_count then
    raise exception 'La configuration des rôles dépasse le nombre de joueurs.';
  end if;

  for i in 1..(v_role_counts->>'loup_garou')::int loop
    v_roles := v_roles || 'loup_garou'::text;
  end loop;
  if v_has_alpha then v_roles := v_roles || 'loup_alpha'::text; end if;
  if v_has_sans_visage then v_roles := v_roles || 'sans_visage'::text; end if;
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
  if coalesce((v_role_counts->>'griot')::boolean, false) then
    v_roles := v_roles || 'griot'::text;
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

-- ----------------------------------------------------------------------------
-- 3. submit_wolf_vote : le Sans-Visage vote exactement comme un loup simple.
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
  if public.my_role_in_game(p_game_id) not in ('loup_garou', 'loup_alpha', 'sans_visage') then
    raise exception 'Vous n’êtes pas un Loup.';
  end if;
  if not exists (select 1 from public.game_players where game_id = p_game_id and user_id = v_user and is_alive) then
    raise exception 'Vous êtes mort.';
  end if;

  if p_target is not null then
    select role into v_target_role from public.game_roles_secret where game_id = p_game_id and user_id = p_target;
    if v_target_role in ('loup_garou', 'loup_alpha', 'sans_visage') then
      raise exception 'Vous ne pouvez pas dévorer un autre Loup.';
    end if;
    if not exists (select 1 from public.game_players where game_id = p_game_id and user_id = p_target and is_alive) then
      raise exception 'Joueur invalide.';
    end if;
  end if;

  insert into public.night_actions (game_id, night_number, step, actor_id, target_id)
  values (p_game_id, v_game.night_number, 'loup_garou', v_user, p_target)
  on conflict (game_id, night_number, step, actor_id) do update set target_id = excluded.target_id;

  select count(*) into v_alive_wolves
  from public.game_roles_secret rs join public.game_players gp on gp.game_id = rs.game_id and gp.user_id = rs.user_id
  where rs.game_id = p_game_id and rs.role in ('loup_garou', 'loup_alpha', 'sans_visage') and gp.is_alive;

  select count(distinct actor_id) into v_submitted
  from public.night_actions
  where game_id = p_game_id and night_number = v_game.night_number and step = 'loup_garou';

  if v_submitted >= v_alive_wolves then
    perform public.advance_phase(p_game_id, true);
  end if;
end;
$$;

-- ----------------------------------------------------------------------------
-- 4. resolve_night_deaths : le Sans-Visage compte comme un loup "simple"
-- pour la majorité d'infection (même exclusion de l'Alpha que d'habitude).
-- ----------------------------------------------------------------------------
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
  v_infected boolean := false;
  v_alpha_used boolean;
  v_alive_wolves int;
  v_agreed int;
  v_needed int;
  v_alpha_confirmed boolean;
begin
  select night_number into v_night from public.games where id = p_game_id;

  v_final_victim := public.get_wolf_target(p_game_id, v_night);

  if public.role_alive_exists(p_game_id, 'loup_alpha') then
    select alpha_infect_used into v_alpha_used
    from public.game_roles_secret where game_id = p_game_id and role = 'loup_alpha';

    if not coalesce(v_alpha_used, false) then
      select count(*) into v_alive_wolves
      from public.game_roles_secret rs
      join public.game_players gp on gp.game_id = rs.game_id and gp.user_id = rs.user_id
      where rs.game_id = p_game_id and rs.role in ('loup_garou', 'sans_visage') and gp.is_alive;

      select count(*) into v_agreed
      from public.alpha_infect_agreements
      where game_id = p_game_id and night_number = v_night;

      v_needed := case when v_alive_wolves = 0 then 0 else v_alive_wolves / 2 + 1 end;

      select exists (
        select 1 from public.night_actions
        where game_id = p_game_id and night_number = v_night and step = 'loup_alpha_confirm'
          and (extra->>'confirmed')::boolean is true
      ) into v_alpha_confirmed;

      if v_agreed >= v_needed and v_alpha_confirmed then
        v_wolf_mode := 'infect';
      end if;
    end if;
  end if;

  select (extra->>'heal')::boolean, nullif(extra->>'poison_target','')::uuid
  into v_heal, v_poison_target
  from public.night_actions
  where game_id = p_game_id and night_number = v_night and step = 'sorciere'
  limit 1;

  select count(*) into v_deaths_before from public.game_players where game_id = p_game_id and died_at_night = v_night;

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
    values (p_game_id, '☀️ Le village se réveille : personne n’est mort cette nuit !', v_night);
  end if;

  update public.games set night_deaths_resolved = true where id = p_game_id;
end;
$$;

-- ----------------------------------------------------------------------------
-- 5. submit_alpha_infect_agreement : le Sans-Visage participe à ce vote
-- comme un loup simple.
-- ----------------------------------------------------------------------------
create or replace function public.submit_alpha_infect_agreement(p_game_id uuid, p_agree boolean default true)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_game public.games%rowtype;
  v_role text;
begin
  select * into v_game from public.games where id = p_game_id;
  if not found or v_game.status <> 'night' or v_game.night_step <> 'loup_garou' then
    raise exception 'Ce n''est pas le moment pour cette décision.';
  end if;
  if not public.role_alive_exists(p_game_id, 'loup_alpha') then
    raise exception 'Cette partie n''a pas de Loup Alpha.';
  end if;

  select role into v_role from public.game_roles_secret where game_id = p_game_id and user_id = v_user;
  if v_role not in ('loup_garou', 'sans_visage') then
    raise exception 'Seuls les loups simples participent à cette décision.';
  end if;
  if not exists (select 1 from public.game_players where game_id = p_game_id and user_id = v_user and is_alive) then
    raise exception 'Vous êtes mort.';
  end if;

  if p_agree then
    insert into public.alpha_infect_agreements (game_id, night_number, user_id)
    values (p_game_id, v_game.night_number, v_user)
    on conflict (game_id, night_number, user_id) do nothing;
  else
    delete from public.alpha_infect_agreements
    where game_id = p_game_id and night_number = v_game.night_number and user_id = v_user;
  end if;
end;
$$;

-- ----------------------------------------------------------------------------
-- 6. submit_loup_alpha_confirm_infect : même exclusion de l'Alpha, Sans-
-- Visage inclus dans le décompte des loups simples.
-- ----------------------------------------------------------------------------
create or replace function public.submit_loup_alpha_confirm_infect(p_game_id uuid, p_confirm boolean default true)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_game public.games%rowtype;
  v_alive_wolves int;
  v_agreed int;
  v_needed int;
  v_used boolean;
begin
  select * into v_game from public.games where id = p_game_id for update;
  if not found or v_game.status <> 'night' or v_game.night_step <> 'loup_garou' then
    raise exception 'Ce n''est pas le moment pour cette décision.';
  end if;
  if public.my_role_in_game(p_game_id) <> 'loup_alpha' then
    raise exception 'Vous n''êtes pas le Loup Alpha.';
  end if;
  if not exists (select 1 from public.game_players where game_id = p_game_id and user_id = v_user and is_alive) then
    raise exception 'Vous êtes mort.';
  end if;

  select alpha_infect_used into v_used from public.game_roles_secret where game_id = p_game_id and user_id = v_user;
  if coalesce(v_used, false) then
    raise exception 'Vous avez déjà utilisé votre infection.';
  end if;

  if p_confirm then
    select count(*) into v_alive_wolves
    from public.game_roles_secret rs
    join public.game_players gp on gp.game_id = rs.game_id and gp.user_id = rs.user_id
    where rs.game_id = p_game_id and rs.role in ('loup_garou', 'sans_visage') and gp.is_alive;

    select count(*) into v_agreed
    from public.alpha_infect_agreements
    where game_id = p_game_id and night_number = v_game.night_number;

    v_needed := case when v_alive_wolves = 0 then 0 else v_alive_wolves / 2 + 1 end;
    if v_agreed < v_needed then
      raise exception 'La majorité des loups doit être d''accord avant que vous puissiez infecter.';
    end if;
  end if;

  insert into public.night_actions (game_id, night_number, step, actor_id, extra)
  values (p_game_id, v_game.night_number, 'loup_alpha_confirm', v_user, jsonb_build_object('confirmed', p_confirm))
  on conflict (game_id, night_number, step, actor_id) do update set extra = excluded.extra;
end;
$$;

-- ----------------------------------------------------------------------------
-- 7. check_and_apply_win : le Sans-Visage compte dans l'effectif des loups
-- pour la condition de victoire.
-- ----------------------------------------------------------------------------
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
  where rs.game_id = p_game_id and rs.role in ('loup_garou', 'loup_alpha', 'sans_visage') and gp.is_alive;

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
      when 'amoureux' then '💘 Il ne reste que les deux amoureux... L’amour triomphe !'
    end);

    perform public.apply_rank_updates_for_game(p_game_id, v_winner);

    return true;
  end if;

  return false;
end;
$$;

-- ----------------------------------------------------------------------------
-- 8 & 9. can_access_channel / can_read_channel : le Sans-Visage a accès au
-- chat des loups comme n'importe quel loup.
-- ----------------------------------------------------------------------------
create or replace function public.can_access_channel(p_game_id uuid, p_channel text)
returns boolean
language plpgsql
stable security definer
set search_path = public
as $$
declare
  v_status text;
  v_alive boolean;
  v_banned boolean;
  v_role text;
begin
  select status into v_status from public.games where id = p_game_id;
  if v_status is null then return false; end if;

  select is_alive, is_banned into v_alive, v_banned
  from public.game_players where game_id = p_game_id and user_id = auth.uid();
  if v_alive is null then return false; end if;
  if v_banned then return false; end if;

  if p_channel = 'lobby' then
    return v_status in ('lobby', 'ended');
  end if;

  if p_channel = 'graveyard' then
    return not v_alive;
  end if;

  if p_channel = 'village' then
    return v_alive and v_status in ('day_reveal', 'day_discussion', 'day_vote', 'night');
  end if;

  if p_channel = 'wolves' then
    if not v_alive or v_status <> 'night' then
      return false;
    end if;
    select role into v_role from public.game_roles_secret where game_id = p_game_id and user_id = auth.uid();
    return v_role in ('loup_garou', 'loup_alpha', 'sans_visage');
  end if;

  return false;
end;
$$;

create or replace function public.can_read_channel(p_game_id uuid, p_channel text)
returns boolean
language plpgsql
stable security definer
set search_path = public
as $$
declare
  v_status text;
  v_alive boolean;
  v_role text;
begin
  select status into v_status from public.games where id = p_game_id;
  if v_status is null then return false; end if;

  select is_alive into v_alive from public.game_players where game_id = p_game_id and user_id = auth.uid();
  if v_alive is null then return false; end if; -- pas participant de cette partie

  if p_channel = 'graveyard' then
    return not v_alive;
  end if;

  if p_channel = 'village' then
    if v_alive then
      return v_status in ('day_reveal', 'day_discussion', 'day_vote', 'night');
    else
      return true;
    end if;
  end if;

  if p_channel = 'wolves' then
    if not v_alive or v_status <> 'night' then
      return false;
    end if;
    select role into v_role from public.game_roles_secret where game_id = p_game_id and user_id = auth.uid();
    return v_role in ('loup_garou', 'loup_alpha', 'sans_visage');
  end if;

  return false;
end;
$$;

-- ----------------------------------------------------------------------------
-- 10. infect_player : garde-fou "déjà loup" étendu au Sans-Visage (même si
-- ce cas ne devrait jamais se produire en pratique, l'Alpha ne le ciblerait
-- pas puisque submit_wolf_vote l'exclut déjà des cibles possibles).
-- ----------------------------------------------------------------------------
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
  if v_old_role is null or v_old_role in ('loup_garou', 'loup_alpha', 'sans_visage') then
    return; -- déjà loup ou introuvable, rien à faire
  end if;

  update public.game_roles_secret
  set role = 'loup_garou', infected_at_night = p_night
  where game_id = p_game_id and user_id = p_user_id;

  update public.game_roles_secret set alpha_infect_used = true
  where game_id = p_game_id and role = 'loup_alpha';

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

-- ----------------------------------------------------------------------------
-- 11. compute_impact_bonus : le Sans-Visage reçoit les mêmes bonus de score
-- que les autres loups (villageois dévorés, nuits survécues).
-- ----------------------------------------------------------------------------
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

  if p_role in ('loup_garou', 'loup_alpha', 'sans_visage') then
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

-- ----------------------------------------------------------------------------
-- 12. apply_rank_updates_for_game : le Sans-Visage compte comme un loup pour
-- déterminer qui a gagné (partage la victoire de la meute).
-- ----------------------------------------------------------------------------
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
      when p_winner = 'loups' then coalesce(r.role in ('loup_garou', 'loup_alpha', 'sans_visage'), false)
      when p_winner = 'village' then coalesce(r.role not in ('loup_garou', 'loup_alpha', 'sans_visage'), true)
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

-- ----------------------------------------------------------------------------
-- 13. get_leaderboard : même distingo camp que ci-dessus.
-- ----------------------------------------------------------------------------
create or replace function public.get_leaderboard(p_limit integer default 20)
returns jsonb
language sql
stable security definer
set search_path = public
as $$
  with scores as (
    select
      gp.user_id,
      case
        when g.winner_team = 'amoureux' then gp.is_lover
        when g.winner_team = 'loups' then rs.role in ('loup_garou', 'loup_alpha', 'sans_visage')
        when g.winner_team = 'village' then coalesce(rs.role not in ('loup_garou', 'loup_alpha', 'sans_visage'), true)
        else false
      end as won
    from public.game_players gp
    join public.games g on g.id = gp.game_id and g.status = 'ended'
    left join public.game_roles_secret rs on rs.game_id = gp.game_id and rs.user_id = gp.user_id
  ),
  agg as (
    select
      user_id,
      count(*) as games_played,
      count(*) filter (where won) as games_won
    from scores
    group by user_id
    having count(*) >= 3
  ),
  ranked as (
    select
      p.id as user_id,
      p.username,
      p.avatar_icon,
      a.games_played,
      a.games_won,
      round(100.0 * a.games_won / a.games_played, 1) as win_rate
    from agg a
    join public.profiles p on p.id = a.user_id
    order by win_rate desc, a.games_played desc
    limit greatest(p_limit, 0)
  )
  select coalesce(jsonb_agg(row_to_json(ranked)), '[]'::jsonb) from ranked;
$$;

-- ----------------------------------------------------------------------------
-- 14. role_display_name
-- ----------------------------------------------------------------------------
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
    when 'griot' then 'Griot'
    when 'sans_visage' then 'Sans-Visage'
    else coalesce(p_role, 'Inconnu')
  end;
$$;

-- ----------------------------------------------------------------------------
-- 15. sync_daily_quests_for_game : "gagne en tant que Loup" inclut le
-- Sans-Visage.
-- ----------------------------------------------------------------------------
create or replace function public.sync_daily_quests_for_game(p_game_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_today date := current_date;
  v_game_status text;
  v_won boolean;
  v_alive boolean;
  v_role text;
begin
  if v_user is null then
    raise exception 'Non authentifié.';
  end if;

  select status into v_game_status from public.games where id = p_game_id;
  if v_game_status is distinct from 'ended' then
    raise exception 'Cette partie n''est pas encore terminée.';
  end if;

  if not exists (select 1 from public.game_players where game_id = p_game_id and user_id = v_user) then
    raise exception 'Vous n''avez pas participé à cette partie.';
  end if;

  perform public.ensure_daily_quests(v_user, v_today);

  if exists (select 1 from public.quest_game_sync where user_id = v_user and game_id = p_game_id) then
    return public.get_my_quests();
  end if;
  insert into public.quest_game_sync (user_id, game_id) values (v_user, p_game_id);

  select won into v_won from public.game_results
    where game_id = p_game_id and user_id = v_user
    order by created_at desc limit 1;
  select is_alive into v_alive from public.game_players where game_id = p_game_id and user_id = v_user;
  select role into v_role from public.game_roles_secret where game_id = p_game_id and user_id = v_user;

  update public.quest_progress qp
  set progress = least(qp.progress + 1, qt.target)
  from public.quest_templates qt
  where qp.template_id = qt.id
    and qp.user_id = v_user and qp.quest_date = v_today and qp.claimed_at is null and qp.progress < qt.target
    and (
      qt.condition_key = 'games_played'
      or (qt.condition_key = 'games_won' and coalesce(v_won, false))
      or (qt.condition_key = 'survived' and coalesce(v_alive, false))
      or (qt.condition_key = 'won_as_wolf' and coalesce(v_won, false) and v_role in ('loup_garou', 'loup_alpha', 'sans_visage'))
      or (qt.condition_key = 'won_as_village' and coalesce(v_won, false) and v_role is not null and v_role not in ('loup_garou', 'loup_alpha', 'sans_visage'))
    );

  return public.get_my_quests();
end;
$$;

-- ----------------------------------------------------------------------------
-- 16. compute_griot_phrase : le Griot n'est PAS trompé par le Sans-Visage
-- (demande explicite de l'utilisateur : seule la Voyante est concernée) —
-- ajout de 'sans_visage' à la branche wolf_vote, pour un résultat correct.
-- ----------------------------------------------------------------------------
create or replace function public.compute_griot_phrase(p_game_id uuid, p_target_id uuid, p_night_number int)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_role text;
begin
  if p_night_number < 1 then
    return 'no_action';
  end if;

  select role into v_role from public.game_roles_secret where game_id = p_game_id and user_id = p_target_id;
  if v_role is null then
    return 'no_action';
  end if;

  if v_role = 'voyante' and exists (
    select 1 from public.night_actions
    where game_id = p_game_id and night_number = p_night_number and step = 'voyante' and actor_id = p_target_id
  ) then
    return 'observed_card';
  end if;

  if v_role = 'petite_fille' then
    return 'watched_wolves';
  end if;

  if v_role in ('loup_garou', 'loup_alpha', 'sans_visage') and exists (
    select 1 from public.night_actions
    where game_id = p_game_id and night_number = p_night_number and step = 'loup_garou' and actor_id = p_target_id
  ) then
    return 'wolf_vote';
  end if;

  if v_role = 'sorciere' and exists (
    select 1 from public.night_actions
    where game_id = p_game_id and night_number = p_night_number and step = 'sorciere' and actor_id = p_target_id
      and ((extra->>'heal')::boolean is true or nullif(extra->>'poison_target', '') is not null)
  ) then
    return 'used_power';
  end if;

  if p_night_number = 1 and v_role = 'cupidon' and exists (
    select 1 from public.night_actions where game_id = p_game_id and night_number = 1 and step = 'cupidon' and actor_id = p_target_id
  ) then
    return 'linked_lovers';
  end if;

  if p_night_number = 1 and v_role = 'voleur' and exists (
    select 1 from public.night_actions where game_id = p_game_id and night_number = 1 and step = 'voleur' and actor_id = p_target_id
  ) then
    return 'swapped_role';
  end if;

  if p_night_number = 1 and v_role = 'enfant_sauvage' and exists (
    select 1 from public.night_actions where game_id = p_game_id and night_number = 1 and step = 'enfant_sauvage' and actor_id = p_target_id
  ) then
    return 'chose_mentor';
  end if;

  return 'no_action';
end;
$$;

-- ----------------------------------------------------------------------------
-- 17. get_my_game_view : Sans-Visage ajouté partout où la Voyante n'est PAS
-- concernée (wolf_teammates, wolf_current_votes, wolf_night_recap,
-- alpha_infect_*, pending_action_required) — reprise intégrale de la
-- définition live, vérifiée avant d'écrire cette migration.
--
-- seer_reveals (ligne dédiée plus bas) reste VOLONTAIREMENT INCHANGÉE :
-- 'sans_visage' n'y est PAS ajouté au test `role in ('loup_garou',
-- 'loup_alpha')`, ce qui le fait retomber sur la branche 'villageois' déjà
-- existante — exactement la protection demandée, sans cas spécial explicite.
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

    'wild_child_conversion_occurred', exists (
      select 1 from public.game_roles_secret
      where game_id = p_game_id and wild_child_turned_at_night is not null
    ),

    'wild_child_conversion_this_round', exists (
      select 1 from public.game_roles_secret
      where game_id = p_game_id and wild_child_turned_at_night = v_game.night_number
    ),

    'alpha_infected_me', case when v_game.status = 'day_reveal' then exists (
      select 1 from public.game_roles_secret
      where game_id = p_game_id and user_id = v_user and infected_at_night = v_game.night_number
    ) else false end,

    'alpha_infection_occurred', exists (
      select 1 from public.game_roles_secret
      where game_id = p_game_id and role = 'loup_alpha' and alpha_infect_used = true
    ),

    'alpha_infect_used', case when v_my_role = 'loup_alpha' then (
      select alpha_infect_used from public.game_roles_secret where game_id = p_game_id and user_id = v_user
    ) else null end,

    'alpha_infect_available', v_my_role in ('loup_garou', 'loup_alpha', 'sans_visage')
      and v_game.status = 'night' and v_game.night_step = 'loup_garou'
      and public.role_alive_exists(p_game_id, 'loup_alpha')
      and not coalesce((
        select alpha_infect_used from public.game_roles_secret where game_id = p_game_id and role = 'loup_alpha'
      ), false),

    'alpha_infect_agreed_ids', case
      when v_my_role in ('loup_garou', 'loup_alpha', 'sans_visage') and v_game.status = 'night' and v_game.night_step = 'loup_garou'
      then coalesce((
        select jsonb_agg(user_id) from public.alpha_infect_agreements
        where game_id = p_game_id and night_number = v_game.night_number
      ), '[]'::jsonb)
      else '[]'::jsonb
    end,

    'alpha_infect_confirmed', case
      when v_my_role in ('loup_garou', 'loup_alpha', 'sans_visage') and v_game.status = 'night' and v_game.night_step = 'loup_garou'
      then exists (
        select 1 from public.night_actions
        where game_id = p_game_id and night_number = v_game.night_number and step = 'loup_alpha_confirm'
          and (extra->>'confirmed')::boolean is true
      )
      else false
    end,

    'thief_stole_my_card', exists (
      select 1 from public.game_log
      where game_id = p_game_id and kind = 'thief_swap' and (meta->>'victim_id')::uuid = v_user
    ),
    'thief_stole_my_new_role', (
      select meta->>'new_role' from public.game_log
      where game_id = p_game_id and kind = 'thief_swap' and (meta->>'victim_id')::uuid = v_user
      order by created_at desc limit 1
    ),

    'thief_i_stole', exists (
      select 1 from public.game_log
      where game_id = p_game_id and kind = 'thief_swap' and (meta->>'actor_id')::uuid = v_user
    ),
    'thief_my_new_role', (
      select meta->>'actor_new_role' from public.game_log
      where game_id = p_game_id and kind = 'thief_swap' and (meta->>'actor_id')::uuid = v_user
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

    'wolf_teammates', case when v_my_role in ('loup_garou', 'loup_alpha', 'sans_visage') then coalesce((
      select jsonb_agg(rs.user_id)
      from public.game_roles_secret rs
      where rs.game_id = p_game_id and rs.role in ('loup_garou', 'loup_alpha', 'sans_visage') and rs.user_id <> v_user
    ), '[]'::jsonb) else null end,

    'wolf_alpha_id', case when v_my_role in ('loup_garou', 'loup_alpha', 'sans_visage') then (
      select rs.user_id from public.game_roles_secret rs
      where rs.game_id = p_game_id and rs.role = 'loup_alpha'
      limit 1
    ) else null end,

    'seer_reveals', case when v_my_role = 'voyante' then coalesce((
      select jsonb_agg(jsonb_build_object(
        'target_id', na.target_id,
        'role', case when rs.role in ('loup_garou', 'loup_alpha') then 'loup_garou' else 'villageois' end,
        'night_number', na.night_number
      ) order by na.night_number)
      from public.night_actions na
      join public.game_roles_secret rs on rs.game_id = na.game_id and rs.user_id = na.target_id
      where na.game_id = p_game_id and na.step = 'voyante' and na.actor_id = v_user
    ), '[]'::jsonb) else null end,

    'griot_reveals', case when v_my_role = 'griot' then coalesce((
      select jsonb_agg(jsonb_build_object(
        'target_id', na.target_id,
        'night_number', na.night_number,
        'kind', public.compute_griot_phrase(p_game_id, na.target_id, na.night_number - 1)
      ) order by na.night_number)
      from public.night_actions na
      where na.game_id = p_game_id and na.step = 'griot' and na.actor_id = v_user
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

    'wolf_current_votes', case when v_my_role in ('loup_garou', 'loup_alpha', 'sans_visage') and v_game.status = 'night' and v_game.night_step = 'loup_garou' then coalesce((
      select jsonb_agg(jsonb_build_object('actor_id', actor_id, 'target_id', target_id))
      from public.night_actions
      where game_id = p_game_id and night_number = v_game.night_number and step = 'loup_garou'
    ), '[]'::jsonb) else null end,

    'wolf_night_recap', case
      when v_my_role in ('loup_garou', 'loup_alpha', 'sans_visage') and v_game.status = 'day_reveal' then coalesce((
        select jsonb_agg(jsonb_build_object(
          'actor_id', na.actor_id,
          'actor_name', gp.display_name,
          'is_alpha', rs.role = 'loup_alpha',
          'target_id', na.target_id,
          'target_name', tgp.display_name,
          'chose_infect', exists (
            select 1 from public.alpha_infect_agreements aia
            where aia.game_id = p_game_id and aia.night_number = v_game.night_number and aia.user_id = na.actor_id
          )
        ) order by (rs.role = 'loup_alpha') desc, gp.display_name)
        from public.night_actions na
        join public.game_players gp on gp.game_id = na.game_id and gp.user_id = na.actor_id
        join public.game_roles_secret rs on rs.game_id = na.game_id and rs.user_id = na.actor_id
        left join public.game_players tgp on tgp.game_id = na.game_id and tgp.user_id = na.target_id
        where na.game_id = p_game_id and na.night_number = v_game.night_number and na.step = 'loup_garou'
      ), '[]'::jsonb)
      else null
    end,

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
      when v_game.status = 'night' and v_my_alive
        and (v_my_role = v_game.night_step or (v_my_role in ('loup_alpha', 'sans_visage') and v_game.night_step = 'loup_garou'))
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
