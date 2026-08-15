-- ============================================================================
-- Signalement utilisateur : "j'ai été éliminé avant la fin du jeu pourtant
-- j'ai eu 30 points x2" (événement "Weekend des Rois", multiplicateur x2
-- actif). Vérification en base (game_results de la partie 3SKWED) : le
-- calcul lui-même est juste (30 × ratio × multiplicateur = 30 × 1.0 × 2 =
-- 60), mais le RATIO était le problème — public.apply_rank_updates_for_game
-- (0073_impact_based_ranking.sql) calcule
--   ratio := died_at_night / v_total_rounds
-- où v_total_rounds est la dernière manche atteinte par la partie. Un joueur
-- mort pendant la manche qui voit la partie se terminer (ex. dévoré par les
-- Loups-Garous nuit 3, alors que la partie se termine au vote du jour 3)
-- obtient donc ratio = 3/3 = 1.0 — traité EXACTEMENT comme un survivant
-- présent jusqu'au bout, alors qu'il était mort au moment de la victoire.
--
-- Confirmé explicitement par l'utilisateur : "normalement un joueur qui
-- meurt avant la fin du jeu touche moins de 100% des points". Correctif :
-- le ratio d'un joueur mort (died_at_night non nul) est désormais toujours
-- plafonné à 90%, même s'il meurt lors de la toute dernière manche — seul
-- un survivant réellement présent jusqu'à l'issue de la partie (died_at_night
-- null) touche 100%. Le plancher à 40% pour une mort précoce reste inchangé.
--
-- Reprise intégrale de la version actuelle de apply_rank_updates_for_game
-- (signature inchangée, 2 arguments), seul le calcul de v_ratio change.
-- ============================================================================
set search_path = public;

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

    -- BUG corrigé (voir commentaire en tête de cette migration) : un mort ne
    -- touche plus jamais 100%, même mort à la toute dernière manche — ce
    -- 100% est désormais réservé aux joueurs réellement en vie à l'issue de
    -- la partie (died_at_night null).
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

grant execute on function public.apply_rank_updates_for_game(uuid, text) to authenticated;
