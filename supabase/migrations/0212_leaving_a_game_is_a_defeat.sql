-- 0212 — Quitter une partie en cours = défaite, et seul l'hôte peut retirer.
--
-- Problème : un joueur démasqué pouvait quitter au dernier moment pour éviter
-- le bûcher, puis être compté comme gagnant si son camp finissait par
-- l'emporter (le départ n'était qu'une mort ordinaire, cause 'parti', et le
-- résultat dépendait ensuite du camp). Désormais :
--
--  1. leave_game refuse à un joueur VIVANT et non-hôte de quitter une partie
--     déjà lancée (hors salon d'attente et écran de fin) : il doit demander à
--     l'hôte de le retirer (kick_player, inchangé). Un joueur déjà éliminé peut
--     toujours partir : il n'y a plus d'enjeu pour lui, son résultat reste
--     celui de son camp. L'hôte garde la possibilité de partir (la succession
--     d'hôte existante prend le relais) — pour lui aussi, c'est une défaite.
--  2. Tout joueur retiré en cours de partie alors qu'il était vivant
--     (death_cause 'parti' = départ, 'exclu' = retiré par l'hôte) compte une
--     DÉFAITE, quel que soit le camp vainqueur : -15 points, série remise à
--     zéro, aucun bonus d'impact ni de victoire, aucune XP de saison.
--
-- Reprises à l'identique, sauf ce qui précède : apply_rank_result (0205) et
-- apply_rank_updates_for_game (0207). apply_rank_result gagne un 5e paramètre
-- (p_forfeit) : l'ancienne signature à 4 paramètres est donc supprimée pour ne
-- pas créer d'ambiguïté d'appel.
set search_path = public;

-- ----------------------------------------------------------------------------
-- 1. leave_game
-- ----------------------------------------------------------------------------
create or replace function public.leave_game(p_game_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_status text;
  v_alive boolean;
  v_is_host boolean;
begin
  select status into v_status from public.games where id = p_game_id;
  if v_status is null then
    return;
  end if;

  if v_status not in ('lobby', 'ended') then
    select is_alive, is_host into v_alive, v_is_host
    from public.game_players
    where game_id = p_game_id and user_id = auth.uid();

    if coalesce(v_alive, false) and not coalesce(v_is_host, false) then
      raise exception 'Une partie en cours ne peut pas être quittée : demande à l’hôte de te retirer.';
    end if;
  end if;

  perform public._remove_player(p_game_id, auth.uid(), false);
end;
$$;

-- ----------------------------------------------------------------------------
-- 2. apply_rank_result : p_forfeit = abandon (défaite sans aucun bonus)
-- ----------------------------------------------------------------------------
drop function if exists public.apply_rank_result(uuid, boolean, numeric, int);

create or replace function public.apply_rank_result(
  p_user_id uuid, p_won boolean, p_participation_ratio numeric default 1, p_impact_bonus int default 0,
  p_forfeit boolean default false
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
  v_coins_bonus int := 0;
  v_event record;
  v_ratio numeric;
  v_season_xp int := 0;
  -- Un abandon est toujours une défaite, sans bonus d'impact.
  v_won boolean := coalesce(p_won, false) and not coalesce(p_forfeit, false);
  v_impact int := case when coalesce(p_forfeit, false) then 0 else coalesce(p_impact_bonus, 0) end;
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

  if v_won then
    v_new_streak := v_streak + 1;
    v_streak_bonus := least((v_new_streak - 1) * 10, 50);

    for v_event in
      select bonus_type, bonus_value, bonus_currency, name from public.events
      where is_enabled and now() between starts_at and ends_at and bonus_type <> 'none'
    loop
      if v_event.bonus_currency = 'coins' then
        -- Voir contrainte events_coins_bonus_flat_only : toujours 'flat' ici.
        v_coins_bonus := v_coins_bonus + v_event.bonus_value::int;
      elsif v_event.bonus_type = 'multiplier' then
        v_multiplier := v_multiplier * v_event.bonus_value;
      elsif v_event.bonus_type = 'flat' then
        v_flat_bonus := v_flat_bonus + v_event.bonus_value::int;
      end if;
    end loop;

    v_gain := round((30 * v_ratio + v_streak_bonus) * v_multiplier) + v_flat_bonus + v_impact;
    v_new_points := v_points + v_gain;
  else
    v_new_streak := 0;
    v_new_points := greatest(v_points - 15 + v_impact, v_floor);
    v_gain := v_new_points - v_points;
  end if;

  v_tier_floor := case
    when v_new_points >= 15000 then 15000
    when v_new_points >= 11000 then 11000
    when v_new_points >= 8500 then 8500
    when v_new_points >= 6400 then 6400
    when v_new_points >= 4800 then 4800
    when v_new_points >= 3600 then 3600
    when v_new_points >= 2700 then 2700
    when v_new_points >= 2000 then 2000
    when v_new_points >= 1500 then 1500
    when v_new_points >= 1100 then 1100
    when v_new_points >= 800 then 800
    when v_new_points >= 550 then 550
    when v_new_points >= 350 then 350
    when v_new_points >= 200 then 200
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
      rank_wins = rank_wins + (case when v_won then 1 else 0 end),
      loup_coins = loup_coins + v_coins_bonus
  where id = p_user_id;

  if v_coins_bonus > 0 then
    insert into public.loup_coins_transactions (user_id, amount, reason, label)
    values (p_user_id, v_coins_bonus, 'event_bonus', 'Bonus d''événement');
  end if;

  -- Pas d'XP de saison pour un abandon : quitter ne doit rien rapporter.
  if not coalesce(p_forfeit, false) then
    v_season_xp := v_season_xp + public.grant_season_xp(p_user_id, 'game_played');
    if v_won then
      v_season_xp := v_season_xp + public.grant_season_xp(p_user_id, 'game_won');
    end if;
  end if;

  return jsonb_build_object(
    'gain', v_gain,
    'new_points', v_new_points,
    'new_tier', public.rank_tier_for_points(v_new_points),
    'coins_gain', v_coins_bonus,
    'season_xp_gained', v_season_xp
  );
end;
$$;

-- Fonction interne (voir 0184) : jamais appelable depuis un client.
revoke execute on function public.apply_rank_result(uuid, boolean, numeric, int, boolean) from public, anon, authenticated;

-- ----------------------------------------------------------------------------
-- 3. apply_rank_updates_for_game : un joueur parti ou retiré perd, toujours
-- ----------------------------------------------------------------------------
create or replace function public.apply_rank_updates_for_game(p_game_id uuid, p_winner text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  r record; v_won boolean; v_forfeit boolean; v_code text; v_total_rounds int; v_ratio numeric;
  v_impact jsonb; v_impact_bonus int; v_impact_details jsonb; v_result jsonb;
begin
  select code, greatest(night_number, 1) into v_code, v_total_rounds from public.games where id = p_game_id;

  for r in
    select gp.user_id, (rs.lover_with is not null) as is_lover, gp.died_at_night, gp.death_cause, rs.role
    from public.game_players gp
    left join public.game_roles_secret rs
      on rs.game_id = gp.game_id and rs.user_id = gp.user_id
    where gp.game_id = p_game_id
  loop
    -- 'parti' = a quitté la partie, 'exclu' = retiré par l'hôte (cause posée
    -- par kill_player seulement si le joueur était vivant à ce moment-là).
    v_forfeit := coalesce(r.death_cause in ('parti', 'exclu'), false);

    v_won := case
      when v_forfeit then false
      when r.is_lover then (p_winner = 'amoureux')
      when r.role = 'cupidon' and p_winner = 'amoureux' then true
      when p_winner = 'loups' then coalesce(r.role in ('loup_garou', 'loup_alpha', 'sans_visage', 'grand_mechant_loup'), false)
      when p_winner = 'village' then coalesce(r.role not in ('loup_garou', 'loup_alpha', 'sans_visage', 'grand_mechant_loup', 'anancy', 'chasseuse'), true)
      when p_winner = 'anancy' then coalesce(r.role = 'anancy', false)
      when p_winner = 'ange' then coalesce(r.role = 'ange', false)
      when p_winner = 'chasseuse' then coalesce(r.role = 'chasseuse', false)
      else false
    end;

    v_ratio := case
      when r.died_at_night is null then 1.0
      else least(greatest(r.died_at_night::numeric / v_total_rounds, 0.4), 0.9)
    end;

    if v_forfeit then
      v_impact_bonus := 0;
      v_impact_details := '[]'::jsonb;
    else
      v_impact := public.compute_impact_bonus(p_game_id, r.user_id, r.role);
      v_impact_bonus := coalesce((v_impact->>'bonus')::int, 0);
      v_impact_details := coalesce(v_impact->'details', '[]'::jsonb);
    end if;

    if p_winner = 'anancy' and v_won then
      v_impact_bonus := v_impact_bonus + 50;
      v_impact_details := v_impact_details || jsonb_build_object('kind', 'anancy_solo_win', 'points', 50);
    end if;

    if p_winner = 'loups' and v_won then
      v_impact_bonus := v_impact_bonus + 15;
      v_impact_details := v_impact_details || jsonb_build_object('kind', 'wolf_team_win', 'points', 15);
    end if;

    if p_winner = 'amoureux' and v_won and r.is_lover then
      v_impact_bonus := v_impact_bonus + 70;
      v_impact_details := v_impact_details || jsonb_build_object('kind', 'lovers_win', 'points', 70);
    end if;

    if p_winner = 'amoureux' and v_won and r.role = 'cupidon' then
      v_impact_bonus := v_impact_bonus + 30;
      v_impact_details := v_impact_details || jsonb_build_object('kind', 'cupidon_lovers_win', 'points', 30);
    end if;

    v_result := public.apply_rank_result(r.user_id, v_won, v_ratio, v_impact_bonus, v_forfeit);

    insert into public.game_results (
      game_id, user_id, code, role, is_lover, winner_team, won,
      points_gained, participation_ratio, impact_bonus, impact_details, new_rank_points, new_rank_tier,
      season_xp_gained
    )
    values (
      p_game_id, r.user_id, v_code, r.role, coalesce(r.is_lover, false), p_winner, v_won,
      (v_result->>'gain')::int, v_ratio, v_impact_bonus, v_impact_details,
      (v_result->>'new_points')::int, v_result->>'new_tier',
      coalesce((v_result->>'season_xp_gained')::int, 0)
    );
  end loop;
end;
$$;
