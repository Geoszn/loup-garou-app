-- ============================================================================
-- Deux changements demandés par l'utilisateur :
--
-- 1. compute_default_role_counts (mode automatique, voir migration 0143)
--    était parfaitement déterministe : pour un même nombre de joueurs, elle
--    renvoyait TOUJOURS exactement la même composition (mêmes rôles actifs
--    selon des seuils fixes, jamais Loup Alpha/Sans-Visage/Grand Méchant
--    Loup/Chasseur/Cupidon/Griot/Anancy/Ange — jamais activés en auto).
--    Corrigé : chaque rôle éligible (même seuil minimum qu'avant pour ceux
--    qui en avaient déjà un) a maintenant une probabilité d'être inclus, et
--    la meute peut désormais piocher UNE SEULE variante (Loup Alpha, Sans-
--    Visage ou Grand Méchant Loup — jamais deux à la fois) au lieu de
--    toujours rester des Loups-Garous simples.
--
--    Garde-fou nécessaire : avec jusqu'à 11 rôles spéciaux désormais
--    possibles simultanément (contre 6 avant), un tirage malchanceux sur une
--    petite partie pourrait dépasser l'effectif et faire échouer start_game
--    (son propre garde-fou "configuration dépasse le nombre de joueurs").
--    Une boucle réduit donc les rôles un par un, du plus exotique au plus
--    "cœur", jusqu'à revenir sous effectif - 1 (garantit toujours au moins un
--    villageois simple) — jamais touché : Voyante, Sorcière, Capitaine, le
--    nombre de base de Loups-Garous.
--
-- 2. apply_rank_updates_for_game : un Loup-Garou (ou variante) qui gagne
--    touche désormais +15 points, même patron que le bonus solo d'Anancy
--    (+50, migration 0120) — gagner en étant minoritaire et en devant
--    bluffer est objectivement plus difficile qu'une victoire village, qui
--    ne rapportait jusqu'ici ni plus ni moins que n'importe quelle victoire.
-- ============================================================================
set search_path = public;

create or replace function public.compute_default_role_counts(p_player_count integer)
returns jsonb
language plpgsql
as $$
declare
  v_wolves int;
  -- null | 'loup_alpha' | 'sans_visage' | 'grand_mechant_loup'
  v_wolf_variant text;
  v_voyante boolean;
  v_sorciere boolean;
  v_petite_fille boolean;
  v_ancien boolean;
  v_voleur boolean;
  v_enfant_sauvage boolean;
  v_chasseur boolean;
  v_cupidon boolean;
  v_griot boolean;
  v_anancy boolean;
  v_ange boolean;
  v_special_total int;
begin
  v_wolves := greatest(1, round(p_player_count * 0.25));
  if v_wolves >= p_player_count then
    v_wolves := greatest(1, p_player_count / 2);
  end if;

  -- Variante de meute : même seuil que celui déjà imposé au Loup Alpha
  -- ailleurs dans le moteur (start_game exige ≥10 joueurs pour lui) —
  -- appliqué identiquement aux trois variantes pour rester cohérent. Une
  -- seule à la fois : le nombre de base de Loups-Garous diminue de 1 dans ce
  -- cas, pour que la meute totale reste proportionnée plutôt que de
  -- s'ajouter en plus.
  v_wolf_variant := null;
  if p_player_count >= 10 and random() < 0.35 then
    v_wolf_variant := (array['loup_alpha', 'sans_visage', 'grand_mechant_loup'])[1 + floor(random() * 3)::int];
    v_wolves := greatest(v_wolves - 1, 1);
  end if;

  v_voyante := p_player_count >= 5 and random() < 0.9;
  v_sorciere := p_player_count >= 6 and random() < 0.85;
  v_petite_fille := p_player_count >= 8 and random() < 0.55;
  v_ancien := p_player_count >= 10 and random() < 0.45;
  v_voleur := p_player_count >= 11 and random() < 0.45;
  v_enfant_sauvage := p_player_count >= 9 and random() < 0.45;
  v_chasseur := p_player_count >= 6 and random() < 0.3;
  v_cupidon := p_player_count >= 6 and random() < 0.3;
  v_griot := p_player_count >= 9 and random() < 0.25;
  v_anancy := p_player_count >= 8 and random() < 0.2;
  v_ange := p_player_count >= 6 and random() < 0.25;

  loop
    v_special_total := v_wolves + (case when v_wolf_variant is not null then 1 else 0 end)
      + v_voyante::int + v_sorciere::int + v_petite_fille::int + v_ancien::int + v_voleur::int
      + v_enfant_sauvage::int + v_chasseur::int + v_cupidon::int + v_griot::int + v_anancy::int + v_ange::int;

    exit when v_special_total <= p_player_count - 1;

    if v_ange then v_ange := false;
    elsif v_anancy then v_anancy := false;
    elsif v_griot then v_griot := false;
    elsif v_cupidon then v_cupidon := false;
    elsif v_chasseur then v_chasseur := false;
    elsif v_enfant_sauvage then v_enfant_sauvage := false;
    elsif v_voleur then v_voleur := false;
    elsif v_ancien then v_ancien := false;
    elsif v_petite_fille then v_petite_fille := false;
    elsif v_wolf_variant is not null then
      v_wolf_variant := null;
      v_wolves := v_wolves + 1;
    else
      exit; -- rien de plus à couper (ne devrait jamais arriver en pratique)
    end if;
  end loop;

  return jsonb_build_object(
    'loup_garou', v_wolves,
    'loup_alpha', v_wolf_variant = 'loup_alpha',
    'voyante', v_voyante,
    'sorciere', v_sorciere,
    'chasseur', v_chasseur,
    'petite_fille', v_petite_fille,
    'cupidon', v_cupidon,
    'ancien', v_ancien,
    'voleur', v_voleur,
    'enfant_sauvage', v_enfant_sauvage,
    'griot', v_griot,
    'sans_visage', v_wolf_variant = 'sans_visage',
    'anancy', v_anancy,
    'ange', v_ange,
    'grand_mechant_loup', v_wolf_variant = 'grand_mechant_loup',
    'capitaine', true
  );
end;
$$;

-- --- apply_rank_updates_for_game : +15 points pour une victoire loup -------
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
      when p_winner = 'loups' then coalesce(r.role in ('loup_garou', 'loup_alpha', 'sans_visage', 'grand_mechant_loup'), false)
      when p_winner = 'village' then coalesce(r.role not in ('loup_garou', 'loup_alpha', 'sans_visage', 'grand_mechant_loup', 'anancy'), true)
      when p_winner = 'anancy' then coalesce(r.role = 'anancy', false)
      when p_winner = 'ange' then coalesce(r.role = 'ange', false)
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

    -- Bonus demandé par l'utilisateur : gagner en tant que Loup (minoritaire,
    -- doit bluffer) est objectivement plus difficile qu'une victoire
    -- village, qui ne rapportait jusqu'ici ni plus ni moins que n'importe
    -- quelle autre victoire. S'applique à tout le camp loup, vivant ou mort
    -- au moment de la victoire — même principe que le gain de base, qui ne
    -- fait déjà aucune distinction sur ce point.
    if p_winner = 'loups' and v_won then
      v_impact_bonus := v_impact_bonus + 15;
      v_impact_details := v_impact_details || jsonb_build_object('kind', 'wolf_team_win', 'points', 15);
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
