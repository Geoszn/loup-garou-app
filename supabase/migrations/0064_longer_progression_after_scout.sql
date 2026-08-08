-- ============================================================================
-- Seuils de palier (rank_tier_for_points, 0055_ranking_system.sql) : les
-- trois premiers paliers (Nouveau Venu/Apprenti/Éclaireur) restent aux mêmes
-- seuils, mais l'écart entre paliers grossit fortement au-delà — un palier
-- élevé doit se mériter sur la durée plutôt que tomber après quelques
-- dizaines de parties. Ancien seuils : 0/100/250/500/900/1500. Nouveaux :
-- 0/100/250/600/1400/2800 (écart Éclaireur→Doyen 250→350, Doyen→Sage
-- 400→800, Sage→Légende 600→1400).
--
-- rank_floor (le palier le plus haut jamais atteint, sous lequel une
-- défaite ne fait jamais redescendre) est calculé à partir de ces mêmes
-- seuils dans apply_rank_result — les deux fonctions sont redéfinies
-- ensemble ici pour rester cohérentes entre elles, comme à l'origine dans
-- 0055.
-- ============================================================================
set search_path = public;

create or replace function public.rank_tier_for_points(p_points int)
returns text
language sql
immutable
as $$
  select case
    when p_points >= 2800 then 'legende'
    when p_points >= 1400 then 'sage'
    when p_points >= 600 then 'ancien'
    when p_points >= 250 then 'chasseur'
    when p_points >= 100 then 'villageois'
    else 'nouveau_venu'
  end
$$;

create or replace function public.apply_rank_result(p_user_id uuid, p_won boolean)
returns void
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
  v_bonus int;
  v_tier_floor int;
begin
  select rank_points, rank_floor, current_streak
    into v_points, v_floor, v_streak
  from public.profiles
  where id = p_user_id
  for update;

  if not found then
    return;
  end if;

  if p_won then
    v_new_streak := v_streak + 1;
    v_bonus := least((v_new_streak - 1) * 10, 50);
    v_new_points := v_points + 30 + v_bonus;
  else
    v_new_streak := 0;
    v_new_points := greatest(v_points - 15, v_floor);
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
end;
$$;
