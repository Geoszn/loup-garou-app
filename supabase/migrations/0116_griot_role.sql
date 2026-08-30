-- ============================================================================
-- Nouveau rôle : Le Griot (village, information). Chaque nuit à partir de
-- la DEUXIÈME, il choisit un joueur vivant (jamais lui-même) et apprend une
-- trace générique de l'action de ce joueur durant la NUIT PRÉCÉDENTE —
-- jamais son rôle ni son camp. Toujours placé juste après la Voyante dans
-- l'ordre de nuit (jamais en dernier, contrairement à une première version
-- de la carte — corrigé sur indication de l'utilisateur), jamais actif la
-- nuit 1 (rien à raconter avant qu'une nuit complète se soit écoulée).
--
-- Décisions issues des échanges avec l'utilisateur (à ne pas re-questionner
-- sans nouvelle demande) :
--   - Tout rôle sans étape de nuit active cette nuit-là (Villageois,
--     Capitaine, Ancien, Chasseur, et Cupidon/Voleur/Enfant Sauvage EN
--     DEHORS de leur unique nuit 1) → phrase générique "aucune action".
--   - Cupidon/Voleur/Enfant Sauvage la nuit où ils agissent (nuit 1
--     uniquement) → phrase dédiée décrivant leur action précise.
--   - "Garde du Corps" (mentionné dans la carte d'origine) ignoré : rôle
--     qui n'existe pas dans ce jeu, sera traité séparément s'il est ajouté
--     un jour.
--   - Le Griot ne peut pas se cibler lui-même, ni cibler un joueur mort
--     (mêmes règles que la Voyante).
-- ============================================================================
set search_path = public;

-- ----------------------------------------------------------------------------
-- 1. compute_default_role_counts : désactivé par défaut, comme
-- Chasseur/Cupidon — l'hôte doit l'activer volontairement.
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
    'capitaine', true
  );
end;
$$;

-- ----------------------------------------------------------------------------
-- 2. next_night_step : le Griot joue juste après la Voyante, jamais la
-- nuit 1 (absent du tableau `n1_sequence`). Ajouté aussi à la liste des
-- rôles suspendus par village_powers_disabled (même famille que
-- Voyante/Sorcière : un pouvoir d'information/utilité du village).
-- ----------------------------------------------------------------------------
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
begin
  select village_powers_disabled into v_powers_disabled from public.games where id = p_game_id;

  if p_night_number <= 1 then
    v_sequence := array['voleur','cupidon','enfant_sauvage','voyante','loup_garou','sorciere'];
  else
    v_sequence := array['voyante','griot','loup_garou','sorciere'];
  end if;

  foreach v_step in array v_sequence loop
    if not v_found_current then
      if v_step = p_current then
        v_found_current := true;
      end if;
      continue;
    end if;

    if v_step in ('voyante','sorciere','griot') and coalesce(v_powers_disabled, false) then
      continue;
    end if;

    if v_step = 'sorciere' and not exists (
      select 1
      from public.game_roles_secret rs
      join public.game_players gp on gp.game_id = rs.game_id and gp.user_id = rs.user_id
      where rs.game_id = p_game_id and rs.role = 'sorciere' and gp.is_alive
        and (not coalesce(rs.heal_potion_used, false) or not coalesce(rs.poison_potion_used, false))
    ) then
      continue;
    end if;

    if public.role_alive_exists(p_game_id, v_step) then
      return v_step;
    end if;
  end loop;

  return null;
end;
$$;

-- ----------------------------------------------------------------------------
-- 3. start_game : ajoute le Griot au décompte des rôles spéciaux et à la
-- distribution — même patron booléen que Chasseur/Cupidon/Petite Fille
-- (un seul exemplaire, pas un nombre).
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
    + coalesce((v_role_counts->>'griot')::boolean::int, 0);

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
-- 4. compute_griot_phrase : détermine, en secret, ce que le joueur ciblé a
-- fait durant la nuit p_night_number (celle D'AVANT la nuit où le Griot
-- choisit) — renvoie un identifiant de phrase générique, jamais le rôle.
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

  if v_role in ('loup_garou', 'loup_alpha') and exists (
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
-- 5. submit_griot : même patron que submit_voyante (migration d'origine) —
-- jamais soi-même, cible obligatoirement vivante, avance immédiatement la
-- phase (rôle solo, personne d'autre à attendre).
-- ----------------------------------------------------------------------------
create or replace function public.submit_griot(p_game_id uuid, p_target uuid)
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
  if not found or v_game.status <> 'night' or v_game.night_step <> 'griot' then
    raise exception 'Ce n''est pas le moment pour le Griot.';
  end if;
  if public.my_role_in_game(p_game_id) <> 'griot' then
    raise exception 'Vous n''êtes pas le Griot.';
  end if;
  if p_target = v_user then
    raise exception 'Vous ne pouvez pas vous observer vous-même.';
  end if;
  if not exists (select 1 from public.game_players where game_id = p_game_id and user_id = p_target and is_alive) then
    raise exception 'Joueur invalide.';
  end if;

  insert into public.night_actions (game_id, night_number, step, actor_id, target_id)
  values (p_game_id, v_game.night_number, 'griot', v_user, p_target)
  on conflict (game_id, night_number, step, actor_id) do update set target_id = excluded.target_id;

  insert into public.game_log (game_id, message) values (p_game_id, '🎭 Le Griot a observé les traces d''un joueur en secret.');

  perform public.advance_phase(p_game_id, true);
end;
$$;

grant execute on function public.submit_griot(uuid, uuid) to authenticated;

-- ----------------------------------------------------------------------------
-- 6. get_my_game_view : ajoute griot_reveals (même patron que seer_reveals
-- juste au-dessus) — reprise intégrale de la définition live, un seul champ
-- ajouté.
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

    'alpha_infect_available', v_my_role in ('loup_garou', 'loup_alpha')
      and v_game.status = 'night' and v_game.night_step = 'loup_garou'
      and public.role_alive_exists(p_game_id, 'loup_alpha')
      and not coalesce((
        select alpha_infect_used from public.game_roles_secret where game_id = p_game_id and role = 'loup_alpha'
      ), false),

    'alpha_infect_agreed_ids', case
      when v_my_role in ('loup_garou', 'loup_alpha') and v_game.status = 'night' and v_game.night_step = 'loup_garou'
      then coalesce((
        select jsonb_agg(user_id) from public.alpha_infect_agreements
        where game_id = p_game_id and night_number = v_game.night_number
      ), '[]'::jsonb)
      else '[]'::jsonb
    end,

    'alpha_infect_confirmed', case
      when v_my_role in ('loup_garou', 'loup_alpha') and v_game.status = 'night' and v_game.night_step = 'loup_garou'
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

    'wolf_teammates', case when v_my_role in ('loup_garou', 'loup_alpha') then coalesce((
      select jsonb_agg(rs.user_id)
      from public.game_roles_secret rs
      where rs.game_id = p_game_id and rs.role in ('loup_garou', 'loup_alpha') and rs.user_id <> v_user
    ), '[]'::jsonb) else null end,

    'wolf_alpha_id', case when v_my_role in ('loup_garou', 'loup_alpha') then (
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

    -- Griot : jamais le rôle ni le camp du joueur observé — uniquement un
    -- identifiant de phrase générique (compute_griot_phrase), traduit côté
    -- client (voir GRIOT_REVEAL_KEYS, ActionPanel.tsx). na.night_number est
    -- la nuit où LE GRIOT a choisi sa cible ; l'action décrite date de la
    -- nuit d'avant (na.night_number - 1) — voir migration 0116.
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

    -- Corrigé (point 3, tête de fichier) : couvre à nouveau 'loup_alpha'
    -- aussi, pas seulement 'loup_garou' — sinon l'Alpha ne voyait jamais le
    -- décompte des votes de la meute dans son propre panneau.
    'wolf_current_votes', case when v_my_role in ('loup_garou', 'loup_alpha') and v_game.status = 'night' and v_game.night_step = 'loup_garou' then coalesce((
      select jsonb_agg(jsonb_build_object('actor_id', actor_id, 'target_id', target_id))
      from public.night_actions
      where game_id = p_game_id and night_number = v_game.night_number and step = 'loup_garou'
    ), '[]'::jsonb) else null end,

    'wolf_night_recap', case
      when v_my_role in ('loup_garou', 'loup_alpha') and v_game.status = 'day_reveal' then coalesce((
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
        and (v_my_role = v_game.night_step or (v_my_role = 'loup_alpha' and v_game.night_step = 'loup_garou'))
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
