-- ============================================================================
-- Refonte des paliers de rang — retour utilisateur : "les joueurs arrivent
-- facilement aujourd'hui à atteindre le dernier palier [Légende, 2800 pts],
-- il y a déjà deux joueurs qui l'ont atteint, il n'y a pas d'autre niveau
-- après."
--
-- Deux changements, décidés ensemble :
--  1. Chacun des 5 paliers nommés (Apprenti, Éclaireur, Doyen, Sage,
--     Légende du Village) est désormais divisé en 3 sous-paliers III < II
--     < I (III = premier échelon du groupe, I = dernier avant le groupe
--     suivant — même logique que les rangs "Bronze III/II/I" d'autres
--     jeux). Nouveau Venu reste seul, non subdivisé.
--  2. Seuils entièrement réétalés pour atteindre 15 000 points à Légende du
--     Village I (au lieu de ~2800 avant cette refonte) — resserrés au tout
--     début (100/200/350, progression rapide et gratifiante) puis de plus
--     en plus espacés (jusqu'à +4000 pour le tout dernier échelon).
--
-- ⚠️ Ne concerne QUE le système de palier de rang (rank_points/rank_tier) —
-- aucun rapport avec les rôles jouables qui portent des noms proches
-- (Chasseur, Ancien) : les deux systèmes sont indépendants depuis toujours
-- (voir le commentaire de rank.tier.* dans translations.ts), rien à
-- toucher côté rôles.
--
-- Les seuils de déblocage d'avatars (avatar_icon_min_points,
-- AVATAR_ICON_MIN_POINTS côté client) restent volontairement inchangés
-- (100/250/600/1400/2800) : cette migration ne touche que les paliers de
-- rang, pas ce système-là. Conséquence acceptée : les avatars se
-- débloqueront désormais un peu plus tôt dans la progression allongée
-- qu'avant (par exemple 2800 pts tombe maintenant quelque part dans le
-- groupe Doyen plutôt qu'en tout début de Légende) — pas un bug, juste un
-- système resté indépendant ; à rééquilibrer séparément si besoin.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. rank_tier_for_points : nouveaux seuils, 16 branches (nouveau_venu +
-- 5 groupes × 3 sous-paliers) au lieu de 6.
-- ----------------------------------------------------------------------------
create or replace function public.rank_tier_for_points(p_points int)
returns text
language sql
immutable
as $$
  select case
    when p_points >= 15000 then 'legende_1'
    when p_points >= 11000 then 'legende_2'
    when p_points >= 8500 then 'legende_3'
    when p_points >= 6400 then 'sage_1'
    when p_points >= 4800 then 'sage_2'
    when p_points >= 3600 then 'sage_3'
    when p_points >= 2700 then 'ancien_1'
    when p_points >= 2000 then 'ancien_2'
    when p_points >= 1500 then 'ancien_3'
    when p_points >= 1100 then 'chasseur_1'
    when p_points >= 800 then 'chasseur_2'
    when p_points >= 550 then 'chasseur_3'
    when p_points >= 350 then 'villageois_1'
    when p_points >= 200 then 'villageois_2'
    when p_points >= 100 then 'villageois_3'
    else 'nouveau_venu'
  end
$$;

-- ----------------------------------------------------------------------------
-- 2. apply_rank_result : le "plancher" (rank_floor, jamais redescendre
-- sous le palier déjà atteint après une défaite) suit désormais les MÊMES
-- 15 nouveaux seuils, au lieu des 5 anciens — la protection s'applique donc
-- au sous-palier exact déjà atteint, pas seulement au groupe nommé (ex. une
-- fois "Doyen II" atteint, impossible de redescendre sous ce sous-palier,
-- pas seulement sous "Doyen" en général). Reste, à l'identique, le seul
-- endroit de tout le moteur qui porte cette logique de plancher.
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
      rank_wins = rank_wins + (case when p_won then 1 else 0 end)
  where id = p_user_id;

  return jsonb_build_object(
    'gain', v_gain,
    'new_points', v_new_points,
    'new_tier', public.rank_tier_for_points(v_new_points)
  );
end;
$$;
