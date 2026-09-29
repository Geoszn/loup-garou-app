-- ============================================================================
-- Fait remonter jusqu'à l'écran de résultats de fin de partie l'XP de
-- saison réellement gagné pour CETTE partie précise (voir migration 0203 :
-- jusqu'ici grant_season_xp était appelé mais son résultat n'était jamais
-- conservé nulle part, invisible pour le joueur avant de consulter le
-- tableau de bord).
--
-- Double garde contre tout affichage hors saison (demande explicite) :
--   1. Côté serveur — grant_season_xp ne renvoie un montant > 0 QUE s'il
--      existe une saison à la fois activée ET dans sa fenêtre de dates
--      (inchangé depuis 0203) ; sinon 0, toujours.
--   2. Côté client — EndScreen (GameRoom.tsx, migration précédente) ne
--      rend la ligne "XP de saison" que si season_xp_gained est vrai
--      (`!!myResult.season_xp_gained`) : un 0 reste invisible, comme
--      aujourd'hui sans saison en cours.
-- ============================================================================
set search_path = public;

-- ----------------------------------------------------------------------------
-- 1. game_results : nouvelle colonne, snapshot figé par partie (comme les
-- autres champs de cette table) plutôt que recalculé à la volée.
-- ----------------------------------------------------------------------------
alter table public.game_results add column if not exists season_xp_gained int not null default 0;

-- ----------------------------------------------------------------------------
-- 2. grant_season_xp : renvoie désormais le montant réellement accordé
-- (0 si aucune saison active) au lieu de void — signature inchangée par
-- ailleurs, mais le type de retour change : DROP requis (CREATE OR REPLACE
-- ne permet pas de changer le type de retour d'une fonction existante).
-- ----------------------------------------------------------------------------
drop function if exists public.grant_season_xp(uuid, text);

create or replace function public.grant_season_xp(p_user_id uuid, p_kind text)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  v_season record;
  v_amount int;
begin
  select * into v_season from public.seasons
  where is_enabled and now() between starts_at and ends_at
  order by starts_at desc
  limit 1;

  if not found then
    return 0;
  end if;

  v_amount := case p_kind
    when 'game_played' then v_season.xp_per_game_played
    when 'game_won' then v_season.xp_per_game_won
    when 'quest_claim' then v_season.xp_per_quest_claim
    else 0
  end;

  if coalesce(v_amount, 0) <= 0 then
    return 0;
  end if;

  insert into public.season_progress (user_id, season_id, xp)
  values (p_user_id, v_season.id, v_amount)
  on conflict (user_id, season_id) do update set xp = public.season_progress.xp + excluded.xp;

  return v_amount;
end;
$$;

revoke execute on function public.grant_season_xp(uuid, text) from public, anon, authenticated;

-- ----------------------------------------------------------------------------
-- 3. apply_rank_result : capture le total d'XP de saison accordé pour CET
-- appel (partie jouée + bonus victoire) et l'ajoute au jsonb renvoyé. Reste
-- 0 par défaut hors saison active (grant_season_xp renvoie alors 0), donc
-- aucun changement de comportement pour toute période sans saison.
-- ----------------------------------------------------------------------------
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
  v_coins_bonus int := 0;
  v_event record;
  v_ratio numeric;
  v_season_xp int := 0;
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

    v_gain := round((30 * v_ratio + v_streak_bonus) * v_multiplier) + v_flat_bonus + coalesce(p_impact_bonus, 0);
    v_new_points := v_points + v_gain;
  else
    v_new_streak := 0;
    v_new_points := greatest(v_points - 15 + coalesce(p_impact_bonus, 0), v_floor);
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
      rank_wins = rank_wins + (case when p_won then 1 else 0 end),
      loup_coins = loup_coins + v_coins_bonus
  where id = p_user_id;

  if v_coins_bonus > 0 then
    insert into public.loup_coins_transactions (user_id, amount, reason, label)
    values (p_user_id, v_coins_bonus, 'event_bonus', 'Bonus d''événement');
  end if;

  v_season_xp := v_season_xp + public.grant_season_xp(p_user_id, 'game_played');
  if p_won then
    v_season_xp := v_season_xp + public.grant_season_xp(p_user_id, 'game_won');
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

-- ----------------------------------------------------------------------------
-- 4. apply_rank_updates_for_game : conserve le season_xp_gained renvoyé par
-- apply_rank_result dans le snapshot game_results (reprise à l'identique de
-- 0186 pour tout le reste).
-- ----------------------------------------------------------------------------
create or replace function public.apply_rank_updates_for_game(p_game_id uuid, p_winner text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  r record; v_won boolean; v_code text; v_total_rounds int; v_ratio numeric;
  v_impact jsonb; v_impact_bonus int; v_impact_details jsonb; v_result jsonb;
begin
  select code, greatest(night_number, 1) into v_code, v_total_rounds from public.games where id = p_game_id;

  for r in
    select gp.user_id, (rs.lover_with is not null) as is_lover, gp.died_at_night, rs.role
    from public.game_players gp
    left join public.game_roles_secret rs
      on rs.game_id = gp.game_id and rs.user_id = gp.user_id
    where gp.game_id = p_game_id
  loop
    v_won := case
      when p_winner = 'amoureux' then coalesce(r.is_lover, false)
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

    v_impact := public.compute_impact_bonus(p_game_id, r.user_id, r.role);
    v_impact_bonus := coalesce((v_impact->>'bonus')::int, 0);
    v_impact_details := coalesce(v_impact->'details', '[]'::jsonb);

    if p_winner = 'anancy' and v_won then
      v_impact_bonus := v_impact_bonus + 50;
      v_impact_details := v_impact_details || jsonb_build_object('kind', 'anancy_solo_win', 'points', 50);
    end if;

    if p_winner = 'loups' and v_won then
      v_impact_bonus := v_impact_bonus + 15;
      v_impact_details := v_impact_details || jsonb_build_object('kind', 'wolf_team_win', 'points', 15);
    end if;

    v_result := public.apply_rank_result(r.user_id, v_won, v_ratio, v_impact_bonus);

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

-- ----------------------------------------------------------------------------
-- 5. game_view_progression_fields : expose season_xp_gained dans
-- my_game_result, reprise à l'identique de 0142 pour tout le reste.
-- ----------------------------------------------------------------------------
create or replace function public.game_view_progression_fields(
  p_game_id uuid, p_game public.games, p_user uuid, p_my_role text, p_my_alive boolean
)
returns jsonb
language sql
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'my_impact_preview', case
      when not coalesce(p_my_alive, false) and p_game.status <> 'ended' and p_my_role is not null
      then public.compute_impact_bonus(p_game_id, p_user, p_my_role)
      else null
    end,

    'my_game_result', case when p_game.status = 'ended' then (
      select jsonb_build_object(
        'points_gained', gr.points_gained,
        'participation_ratio', gr.participation_ratio,
        'impact_bonus', gr.impact_bonus,
        'impact_details', gr.impact_details,
        'new_rank_points', gr.new_rank_points,
        'new_rank_tier', gr.new_rank_tier,
        'won', gr.won,
        'season_xp_gained', gr.season_xp_gained
      )
      from public.game_results gr
      where gr.game_id = p_game_id and gr.user_id = p_user
      order by gr.created_at desc limit 1
    ) else null end
  );
$$;
