-- 0262 — Saison 2 « Noël au Village », lot 1 : les 5 pièces d'avatar de la piste GRATUITE.
--
--   * Palier 2  : Bonnet de Père Noël  (couvre-chef, commun)   — head = santa_hat
--   * Palier 6  : Pull de Noël du Village (tenue, commun)      — outfit = xmas_sweater
--   * Palier 12 : Afro Flocons (coiffure, rare)                — hair = snow_afro
--   * Palier 18 : Couronne de Houx (couvre-chef, rare)         — head = holly_crown
--   * Palier 26 : Bois de Renne (couvre-chef, rare)            — head = antlers
-- Chaque pièce est un skin de saison (prix 0, jamais en boutique) donné par un palier de la piste gratuite. Les valeurs sont
-- déclarées dans avatar_part_min_points (seuil 999999 = « saison » : seule la possession du skin débloque la pièce, comme pour
-- les pièces de la saison 1) et dans src/lib/avatarParts.ts, qui doivent rester synchronisés.
-- À appliquer APRÈS 0261 (la saison doit exister). Rejouable sans risque.
set search_path = public;

create or replace function public.avatar_part_min_points(p_kind text, p_value text)
returns int
language sql
immutable
set search_path = public
as $$
  select case p_kind
    when 'hair' then case p_value
      when 'none' then 0 when 'fade' then 0 when 'afro' then 0 when 'braids' then 0 when 'puffs' then 0
      when 'curly' then 100 when 'bun' then 100 when 'flat' then 250 when 'cornrows' then 350 when 'locs' then 250
      when 'long' then 550 when 'knots' then 800 when 'mohawk' then 1100 when 'topknot' then 1500 when 'gele' then 600
      when 'malibu_wave' then 999999
      when 'braids_pink' then 999998 when 'afro_pink' then 999998 when 'ponytail_pop' then 999998
      when 'pompadour_ken' then 999998 when 'slick_back' then 999998 when 'beard_full' then 999998
      when 'snow_afro' then 999999
    end
    when 'outfit' then case p_value
      when 'tunic' then 0 when 'tee' then 0 when 'cloak' then 100 when 'wrap' then 100 when 'kente' then 250
      when 'dashiki' then 250 when 'boubou' then 350 when 'hunter' then 550 when 'suit' then 800 when 'hood' then 600
      when 'armor' then 1100 when 'royal' then 1500 when 'furcape' then 2000
      when 'dream_rose' then 999999 when 'cape_solidaire' then 999999 when 'louve_malibu' then 999999
      when 'varsity' then 999998 when 'gala_gown' then 999998 when 'tracksuit_neon' then 999998 when 'hawaiian' then 999998
      when 'xmas_sweater' then 999999
    end
    when 'acc' then case p_value
      when 'none' then 0 when 'ring' then 0 when 'freckles' then 0 when 'glasses' then 100 when 'sunglasses' then 150
      when 'hoops' then 200 when 'scar' then 250 when 'beads' then 350 when 'facepaint' then 550 when 'eyepatch' then 800
      when 'coeur_lunettes' then 999999
      when 'lipstick_pink' then 999998 when 'cigarette' then 999998 when 'toothpick' then 999998 when 'gold_chain' then 999998
    end
    when 'head' then case p_value
      when 'none' then 0 when 'headband' then 100 when 'cap' then 250 when 'hat' then 550 when 'feather' then 800 when 'crown' then 2000
      when 'ribbon_pink' then 999999
      when 'scarf_pink' then 999998 when 'cowboy_pink' then 999998 when 'bandana_biker' then 999998
      when 'santa_hat' then 999999 when 'holly_crown' then 999999 when 'antlers' then 999999
    end
  end;
$$;

do $$
declare
  v_season uuid;
  v_skin uuid;
  r record;
begin
  select id into v_season from public.seasons where slug = 'noel-au-village';
  if v_season is null then
    raise exception 'La saison noel-au-village n''existe pas : appliquez d''abord la migration 0261.';
  end if;

  for r in
    select * from (values
      ('bonnet-pere-noel', 'chapeaux', 'commun', 'Bonnet de Père Noël', 'Santa hat',
       'Le bonnet rouge à pompon blanc, pour entrer au village en fête.',
       'The red hat with a white pompom, to walk into the festive village.',
       '{"head":"santa_hat"}', 300, 2),
      ('pull-noel-village', 'tenues', 'commun', 'Pull de Noël du Village', 'Village Christmas sweater',
       'Un pull rouge à frise de sapins, avec un col roulé crème bien chaud.',
       'A red sweater with a row of fir trees and a warm cream roll collar.',
       '{"outfit":"xmas_sweater"}', 301, 6),
      ('afro-flocons', 'coiffures', 'rare', 'Afro Flocons', 'Snowflake afro',
       'Un afro blanc comme la neige, saupoudré de flocons étincelants.',
       'A snow-white afro sprinkled with sparkling flakes.',
       '{"hair":"snow_afro"}', 302, 12),
      ('couronne-houx', 'chapeaux', 'rare', 'Couronne de Houx', 'Holly crown',
       'Des feuilles de houx et des baies rouges, tressées en couronne.',
       'Holly leaves and red berries woven into a crown.',
       '{"head":"holly_crown"}', 303, 18),
      ('bois-renne', 'chapeaux', 'rare', 'Bois de Renne', 'Reindeer antlers',
       'Un serre-tête à bois de renne, pour tirer le traîneau du village.',
       'A reindeer antler headband, ready to pull the village sleigh.',
       '{"head":"antlers"}', 304, 26)
    ) as t(slug, category, rarity, name_fr, name_en, description_fr, description_en, config, sort_order, tier)
  loop
    insert into public.store_skins (slug, category, rarity, name_fr, name_en, description_fr, description_en, price_coins, config, sort_order, is_active, season_id)
    values (r.slug, r.category, r.rarity, r.name_fr, r.name_en, r.description_fr, r.description_en, 0, r.config::jsonb, r.sort_order, true, v_season)
    on conflict (slug) do update set season_id = excluded.season_id
    returning id into v_skin;

    insert into public.season_tiers (season_id, tier_number, xp_required, reward_type, reward_skin_id, label_fr, label_en, track)
    values (v_season, r.tier, 160 * r.tier, 'skin', v_skin, r.name_fr, r.name_en, 'free')
    on conflict (season_id, tier_number, track) do nothing;
  end loop;
end;
$$;
