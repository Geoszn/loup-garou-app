-- ----------------------------------------------------------------------------
-- Bonus de victoire pour Anancy : gagner seul, en trompant activement tout
-- le village ET tous les loups pendant au moins 5 nuits sans le moindre
-- allié, est nettement plus dur qu'une victoire d'équipe classique (village/
-- loups/amoureux) — le gain de base restait pourtant identique jusqu'ici
-- (voir apply_rank_result : 30 pts + bonus de série, quel que soit le camp
-- vainqueur). On ajoute donc un bonus fixe, dans le même mécanisme que
-- compute_impact_bonus (heal de la Sorcière, loup abattu par le Chasseur...)
-- mais directement dans apply_rank_updates_for_game puisqu'il dépend à la
-- fois du camp vainqueur (p_winner) ET du rôle du joueur (r.role) réunis
-- uniquement à cet endroit.
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
      when p_winner = 'village' then coalesce(r.role not in ('loup_garou', 'loup_alpha', 'sans_visage', 'anancy'), true)
      when p_winner = 'anancy' then coalesce(r.role = 'anancy', false)
      else false
    end;

    v_ratio := case
      when r.died_at_night is null then 1.0
      else least(greatest(r.died_at_night::numeric / v_total_rounds, 0.4), 0.9)
    end;

    v_impact := public.compute_impact_bonus(p_game_id, r.user_id, r.role);
    v_impact_bonus := coalesce((v_impact->>'bonus')::int, 0);
    v_impact_details := coalesce(v_impact->'details', '[]'::jsonb);

    -- Anancy qui gagne : seul contre tout le monde, aucun allié, au moins 5
    -- nuits à jouer sans se faire repérer — bonus fixe distinct du gain de
    -- base, plutôt qu'un multiplicateur qui exploserait avec la taille du
    -- salon (éviter d'inciter à "farmer" le rang via de très grosses parties).
    if p_winner = 'anancy' and v_won then
      v_impact_bonus := v_impact_bonus + 50;
      v_impact_details := v_impact_details || jsonb_build_object('kind', 'anancy_solo_win', 'points', 50);
    end if;

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
