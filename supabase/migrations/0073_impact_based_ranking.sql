-- ============================================================================
-- Refonte du calcul de points en fin de partie (retour utilisateur) :
-- jusqu'ici, un joueur mort à la nuit 1 touchait exactement les mêmes
-- points qu'un joueur qui survit jusqu'au bout, dès lors que son camp
-- gagne — aucune notion de participation réelle. Deux ajouts :
--
-- 1) Ratio de survie : le gain de victoire (30 pts + bonus de série, comme
--    avant) est désormais multiplié par la part de la partie que le joueur
--    a effectivement vécue (died_at_night / nombre de manches jouées),
--    avec un plancher à 40% — mourir tôt réduit les points, mais ne les
--    écrase jamais. Une défaite reste à -15 fixe, INCHANGÉ : perdre dépend
--    surtout du rôle tiré au hasard, pas de la performance (philosophie
--    déjà en place, voir 0055_ranking_system.sql).
--
-- 2) Bonus d'impact : des gestes concrets et vérifiables en base, gagnés
--    QUEL QUE SOIT le résultat final (victoire ou défaite) — la Sorcière
--    qui sauve ou empoisonne un loup, le Chasseur dont le tir abat un
--    loup, la Voyante qui démasque un loup, l'Ancien qui survit à une
--    attaque grâce à sa vie supplémentaire. Toujours acquis au moment du
--    geste, jamais remis en cause ensuite (voir compute_impact_bonus).
--
-- Permanences : game_results (historique déjà permanent, 0062) gagne les
-- colonnes du détail pour que get_my_stats/l'écran de fin puissent
-- afficher le calcul exact, pas seulement le résultat net.
--
-- Client (GameRoom.tsx) :
--   - my_impact_preview : ce qui est DÉJÀ acquis pour le joueur mort tant
--     que la partie continue (popup de mort, animé) — jamais le résultat
--     final tant que l'issue n'est pas connue.
--   - my_game_result : le détail complet une fois la partie terminée
--     (section personnelle dans l'écran de fin).
-- ============================================================================
set search_path = public;

alter table public.game_results
  add column if not exists points_gained int not null default 0,
  add column if not exists participation_ratio numeric,
  add column if not exists impact_bonus int not null default 0,
  add column if not exists impact_details jsonb not null default '[]'::jsonb,
  add column if not exists new_rank_points int,
  add column if not exists new_rank_tier text;

-- ----------------------------------------------------------------------------
-- compute_impact_bonus : gestes de rôle mesurables objectivement en base.
-- STABLE (pas de valeur aléatoire, pas d'écriture) — appelable aussi bien en
-- lecture "en direct" (get_my_game_view, pour la popup de mort) qu'au moment
-- du calcul final (apply_rank_updates_for_game), toujours le même résultat
-- pour un même état de partie. Plafonné intentionnellement bas par rôle
-- (voir Voyante, max 2 visions comptées) pour rester un vrai bonus, pas une
-- deuxième source de points dominante.
-- ----------------------------------------------------------------------------
create or replace function public.compute_impact_bonus(p_game_id uuid, p_user_id uuid, p_role text)
returns jsonb
language plpgsql
security definer
set search_path = public
stable
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

  return jsonb_build_object('bonus', v_bonus, 'details', v_details);
end;
$$;

-- ----------------------------------------------------------------------------
-- apply_rank_result : accepte désormais le ratio de survie (multiplie le
-- gain de victoire, plancher 40%) et le bonus d'impact (ajouté tel quel,
-- gagnant comme perdant). Renvoie le détail appliqué (jsonb) au lieu de
-- void, pour que apply_rank_updates_for_game puisse l'enregistrer dans
-- game_results sans recalculer. Sur une défaite, le gain affiché est
-- recalculé APRÈS écrêtage par rank_floor : jamais un total affiché qui ne
-- correspond pas à ce qui a réellement été appliqué.
-- ----------------------------------------------------------------------------
-- L'ancienne signature à 2 arguments (p_user_id, p_won) — voir 0067 — a un
-- nombre de paramètres différent de la nouvelle : CREATE OR REPLACE ne
-- remplace pas une fonction dont la liste de types d'arguments diffère, il
-- créerait une surcharge (overload) supplémentaire et laisserait l'ancienne
-- version (logique plate, sans ratio ni bonus d'impact) trainer et rester
-- appelable. On la supprime explicitement d'abord.
drop function if exists public.apply_rank_result(uuid, boolean);

create or replace function public.apply_rank_result(
  p_user_id uuid, p_won boolean, p_participation_ratio numeric default 1, p_impact_bonus int default 0
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_points int;
  v_floor int;
  v_streak int;
  v_new_points int;
  v_new_streak int;
  v_new_floor int;
  v_streak_bonus int;
  v_tier_floor int;
  v_gain int;
  v_multiplier numeric := 1;
  v_flat_bonus int := 0;
  v_event record;
  v_ratio numeric;
begin
  select rank_points, rank_floor, current_streak
    into v_points, v_floor, v_streak
  from public.profiles
  where id = p_user_id
  for update;

  if not found then
    return jsonb_build_object('gain', 0, 'new_points', 0, 'new_tier', 'nouveau_venu');
  end if;

  v_ratio := greatest(least(coalesce(p_participation_ratio, 1), 1), 0.4);

  if p_won then
    v_new_streak := v_streak + 1;
    v_streak_bonus := least((v_new_streak - 1) * 10, 50);

    for v_event in
      select bonus_type, bonus_value from public.events
      where is_enabled and now() between starts_at and ends_at and bonus_type <> 'none'
    loop
      if v_event.bonus_type = 'multiplier' then
        v_multiplier := v_multiplier * v_event.bonus_value;
      elsif v_event.bonus_type = 'flat' then
        v_flat_bonus := v_flat_bonus + v_event.bonus_value::int;
      end if;
    end loop;

    v_gain := round((30 * v_ratio + v_streak_bonus) * v_multiplier) + v_flat_bonus + coalesce(p_impact_bonus, 0);
    v_new_points := v_points + v_gain;
  else
    v_new_streak := 0;
    v_new_points := greatest(v_points - 15 + coalesce(p_impact_bonus, 0), v_floor);
    v_gain := v_new_points - v_points;
  end if;

  v_tier_floor := case
    when v_new_points >= 2800 then 2800
    when v_new_points >= 1400 then 1400
    when v_new_points >= 600 then 600
    when v_new_points >= 250 then 250
    when v_new_points >= 100 then 100
    else 0
  end;
  v_new_floor := greatest(v_floor, v_tier_floor);

  update public.profiles
  set rank_points = v_new_points,
      rank_floor = v_new_floor,
      current_streak = v_new_streak,
      best_streak = greatest(best_streak, v_new_streak),
      rank_games_played = rank_games_played + 1,
      rank_wins = rank_wins + (case when p_won then 1 else 0 end)
  where id = p_user_id;

  return jsonb_build_object(
    'gain', v_gain,
    'new_points', v_new_points,
    'new_tier', public.rank_tier_for_points(v_new_points)
  );
end;
$$;

-- ----------------------------------------------------------------------------
-- apply_rank_updates_for_game : calcule désormais, par joueur, le ratio de
-- survie (died_at_night / nombre de manches jouées par la partie, ou 1.0
-- s'il a survécu jusqu'au bout) et le bonus d'impact (compute_impact_bonus),
-- transmis à apply_rank_result — puis enregistre le détail complet dans
-- game_results, une fois pour toutes, jamais recalculé ensuite.
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
      when p_winner = 'loups' then coalesce(r.role = 'loup_garou', false)
      when p_winner = 'village' then coalesce(r.role <> 'loup_garou', true)
      else false
    end;

    v_ratio := case
      when r.died_at_night is null then 1.0
      else greatest(r.died_at_night::numeric / v_total_rounds, 0.4)
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
-- get_my_game_view : reprise intégrale de 0069_wild_child_private_reveal.sql,
-- ajoute my_impact_preview et my_game_result.
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
      select jsonb_agg(to_jsonb(gp) order by gp.seat_number)
      from public.game_players gp where gp.game_id = p_game_id
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

    -- Ce qui est DÉJÀ acquis pour un joueur mort tant que la partie continue
    -- (voir migration 0073) : jamais le résultat final (victoire/défaite),
    -- seulement les bonus d'impact, gagnés au moment du geste et jamais
    -- remis en cause ensuite. NightRecapModal/GameRoom.tsx s'en sert pour la
    -- popup affichée juste après la mort.
    'my_impact_preview', case
      when not coalesce(v_my_alive, false) and v_game.status <> 'ended' and v_my_role is not null
      then public.compute_impact_bonus(p_game_id, v_user, v_my_role)
      else null
    end,

    -- Détail complet une fois la partie terminée (game_results, migration
    -- 0073) : section personnelle de l'écran de fin.
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
