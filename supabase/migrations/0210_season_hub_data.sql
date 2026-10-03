-- 0210 — Données supplémentaires pour la page Saison (onglet Récompenses > Saison).
--
-- get_my_season (0203) renvoie désormais en plus :
--   • les gains d'XP de la saison (xp_per_game_played / _won / _quest_claim),
--     pour afficher "comment gagner de l'XP" sans les coder en dur côté client ;
--   • pour chaque palier à skin : la description FR/EN et la catégorie du skin,
--     pour le volet de détail ouvert au clic sur un palier.
-- Aucun changement de comportement : champs ajoutés uniquement, clients
-- existants (SeasonTrack du tableau de bord) les ignorent.
set search_path = public;

create or replace function public.get_my_season()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_season record;
begin
  if v_user is null then
    raise exception 'Non authentifié.';
  end if;

  select * into v_season from public.seasons
  where is_enabled and now() between starts_at and ends_at
  order by starts_at desc
  limit 1;

  if not found then
    -- Aucune saison en cours : on montre quand même la dernière saison où ce
    -- joueur a un palier débloqué mais pas encore réclamé (voir 0203).
    select s.* into v_season
    from public.seasons s
    join public.season_progress sp on sp.season_id = s.id and sp.user_id = v_user
    where exists (
      select 1 from public.season_tiers st
      where st.season_id = s.id and st.xp_required <= sp.xp
        and not exists (select 1 from public.season_tier_claims c where c.tier_id = st.id and c.user_id = v_user)
    )
    order by s.ends_at desc
    limit 1;
  end if;

  if not found then
    return null;
  end if;

  return jsonb_build_object(
    'id', v_season.id,
    'slug', v_season.slug,
    'name_fr', v_season.name_fr,
    'name_en', v_season.name_en,
    'theme_color', v_season.theme_color,
    'starts_at', v_season.starts_at,
    'ends_at', v_season.ends_at,
    'is_active', now() between v_season.starts_at and v_season.ends_at,
    'xp_per_game_played', v_season.xp_per_game_played,
    'xp_per_game_won', v_season.xp_per_game_won,
    'xp_per_quest_claim', v_season.xp_per_quest_claim,
    'xp', coalesce((select xp from public.season_progress where user_id = v_user and season_id = v_season.id), 0),
    'tiers', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', st.id,
        'tier_number', st.tier_number,
        'xp_required', st.xp_required,
        'reward_type', st.reward_type,
        'reward_coins', st.reward_coins,
        'reward_skin', case when st.reward_skin_id is not null then jsonb_build_object(
          'id', s.id, 'name_fr', s.name_fr, 'name_en', s.name_en, 'rarity', s.rarity, 'config', s.config,
          'description_fr', s.description_fr, 'description_en', s.description_en, 'category', s.category
        ) end,
        'label_fr', st.label_fr,
        'label_en', st.label_en,
        'claimed', exists (select 1 from public.season_tier_claims c where c.tier_id = st.id and c.user_id = v_user)
      ) order by st.tier_number)
      from public.season_tiers st
      left join public.store_skins s on s.id = st.reward_skin_id
      where st.season_id = v_season.id
    ), '[]'::jsonb)
  );
end;
$$;

revoke execute on function public.get_my_season() from public, anon;
grant execute on function public.get_my_season() to authenticated;
