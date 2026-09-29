-- Cupidon n'avait aucun intérêt personnel à ce que SES amoureux survivent :
-- son propre gain de points ne dépendait que de son rôle/camp d'origine
-- (village), jamais du sort du couple qu'il a formé. Or lui seul (avec les
-- amoureux eux-mêmes) sait qui ils sont — rien ne l'empêchait donc de
-- pousser à leur élimination (vote, tuyau aux loups) sans jamais en payer
-- le prix, ni en tirer le moindre bénéfice. Cupidon gagne désormais AUSSI
-- quand la partie se termine sur une victoire 'amoureux' (comme s'il faisait
-- partie du camp qu'il a créé), avec un bonus de +30 points — entre le
-- bonus d'équipe des loups (+15) et le bonus solo d'Anancy (+50) : il profite
-- de la victoire qu'il a rendue possible, sans égaler les amoureux eux-mêmes
-- qui ont pris tout le risque (0 point s'ils meurent avant la fin, voir
-- migration 0206). Reprise à l'identique de 0206 pour tout le reste.
set search_path = public;

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
      when r.is_lover then (p_winner = 'amoureux')
      -- Cupidon gagne AUSSI (en plus de son gain normal côté village ci-
      -- dessous) quand SES amoureux gagnent : il n'a alors plus aucune
      -- raison de vouloir leur mort plutôt que leur survie. Condition
      -- restreinte à p_winner = 'amoureux' précisément pour ne jamais
      -- intercepter son cas normal (p_winner = 'village', plus bas).
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

    if p_winner = 'amoureux' and v_won and r.is_lover then
      v_impact_bonus := v_impact_bonus + 70;
      v_impact_details := v_impact_details || jsonb_build_object('kind', 'lovers_win', 'points', 70);
    end if;

    if p_winner = 'amoureux' and v_won and r.role = 'cupidon' then
      v_impact_bonus := v_impact_bonus + 30;
      v_impact_details := v_impact_details || jsonb_build_object('kind', 'cupidon_lovers_win', 'points', 30);
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
