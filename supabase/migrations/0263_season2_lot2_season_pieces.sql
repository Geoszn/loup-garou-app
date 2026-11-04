-- 0263 — Saison 2 « Noël au Village », lot 2 : 12 pièces d'avatar de plus, TOUTES réservées à la saison (jamais en boutique).
--
-- Règle : un objet de saison ne s'acquiert qu'en participant à la saison, via un palier. Chaque pièce est un skin de saison
-- (season_id renseigné, prix 0 : list_store_skins ne le montre jamais en boutique) donné par un palier. Les valeurs sont déclarées
-- dans avatar_part_min_points (seuil 999999 = « saison » : seule la possession du skin débloque la pièce) et dans
-- src/lib/avatarParts.ts, qui doivent rester synchronisés. Ce qu'on a obtenu reste à vie (migration 0259).
--
-- Répartition sur les paliers PAIRS (les paliers impairs portent déjà les coins, voir 0261) :
--   Piste GRATUITE : 4 Écharpe Rouge Tricotée · 8 Bonnet à Pompon · 14 Puffs Étoilés · 20 Tenue d'Elfe
--                    (avec le lot 1 : 2 Bonnet de Père Noël, 6 Pull de Noël, 12 Afro Flocons, 18 Couronne de Houx, 26 Bois de Renne)
--   Piste PREMIUM  : 4 Tresses Guirlandes · 8 Chapeau de Lutin · 10 Veste de Père Noël · 14 Boules d'Oreilles Dorées
--                    16 Locs Givrés · 20 Robe de Gala Neige · 24 Étoile du Berger · 30 Boubou Blanc et Or (grand lot)
-- À appliquer APRÈS 0262. Rejouable sans risque.
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
      when 'xmas_braids' then 999999 when 'frost_locs' then 999999 when 'star_puffs' then 999999
    end
    when 'outfit' then case p_value
      when 'tunic' then 0 when 'tee' then 0 when 'cloak' then 100 when 'wrap' then 100 when 'kente' then 250
      when 'dashiki' then 250 when 'boubou' then 350 when 'hunter' then 550 when 'suit' then 800 when 'hood' then 600
      when 'armor' then 1100 when 'royal' then 1500 when 'furcape' then 2000
      when 'dream_rose' then 999999 when 'cape_solidaire' then 999999 when 'louve_malibu' then 999999
      when 'varsity' then 999998 when 'gala_gown' then 999998 when 'tracksuit_neon' then 999998 when 'hawaiian' then 999998
      when 'xmas_sweater' then 999999
      when 'snow_gown' then 999999 when 'santa_jacket' then 999999 when 'elf_outfit' then 999999 when 'white_boubou' then 999999
    end
    when 'acc' then case p_value
      when 'none' then 0 when 'ring' then 0 when 'freckles' then 0 when 'glasses' then 100 when 'sunglasses' then 150
      when 'hoops' then 200 when 'scar' then 250 when 'beads' then 350 when 'facepaint' then 550 when 'eyepatch' then 800
      when 'coeur_lunettes' then 999999
      when 'lipstick_pink' then 999998 when 'cigarette' then 999998 when 'toothpick' then 999998 when 'gold_chain' then 999998
      when 'gold_baubles' then 999999 when 'knit_scarf' then 999999
    end
    when 'head' then case p_value
      when 'none' then 0 when 'headband' then 100 when 'cap' then 250 when 'hat' then 550 when 'feather' then 800 when 'crown' then 2000
      when 'ribbon_pink' then 999999
      when 'scarf_pink' then 999998 when 'cowboy_pink' then 999998 when 'bandana_biker' then 999998
      when 'santa_hat' then 999999 when 'holly_crown' then 999999 when 'antlers' then 999999
      when 'pompom_beanie' then 999999 when 'elf_hat' then 999999 when 'star_halo' then 999999
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
      ('echarpe-rouge-tricotee', 'accessoires', 'commun', 'Écharpe Rouge Tricotée', 'Red knitted scarf',
       'Une écharpe tricotée rouge à rayures, avec ses franges.', 'A red striped knitted scarf with fringes.', '{"acc":"knit_scarf"}', 310, 4, 'free'),
      ('bonnet-pompon', 'chapeaux', 'commun', 'Bonnet à Pompon', 'Pompom beanie',
       'Un bonnet en laine rayé rouge, blanc et vert, avec un gros pompon.', 'A knitted beanie striped red, white and green, with a big pompom.', '{"head":"pompom_beanie"}', 311, 8, 'free'),
      ('puffs-etoiles', 'coiffures', 'commun', 'Puffs Étoilés', 'Starry puffs',
       'Deux macarons de cheveux piqués d''étoiles dorées.', 'Two hair buns studded with golden stars.', '{"hair":"star_puffs"}', 312, 14, 'free'),
      ('tenue-elfe', 'tenues', 'commun', 'Tenue d''Elfe', 'Elf outfit',
       'Une tenue verte à festons rouges et clochettes dorées, pour les lutins du village.', 'A green outfit with red scallops and golden bells, for the village elves.', '{"outfit":"elf_outfit"}', 313, 20, 'free'),
      ('tresses-guirlandes', 'coiffures', 'rare', 'Tresses Guirlandes', 'Garland braids',
       'Des tresses ornées d''une guirlande verte et de boules rouges et dorées.', 'Braids decked with a green garland and red and gold baubles.', '{"hair":"xmas_braids"}', 314, 4, 'premium'),
      ('chapeau-lutin', 'chapeaux', 'rare', 'Chapeau de Lutin', 'Elf hat',
       'Un chapeau vert pointu à bandeau rouge dentelé, avec sa clochette dorée.', 'A pointed green hat with a jagged red band and its golden bell.', '{"head":"elf_hat"}', 315, 8, 'premium'),
      ('veste-pere-noel', 'tenues', 'rare', 'Veste de Père Noël', 'Santa jacket',
       'La veste rouge au col de fourrure, avec sa grande ceinture à boucle dorée.', 'The red jacket with a fur collar and its wide belt with a golden buckle.', '{"outfit":"santa_jacket"}', 316, 10, 'premium'),
      ('boules-oreilles-dorees', 'accessoires', 'rare', 'Boules d''Oreilles Dorées', 'Golden bauble earrings',
       'De petites boules de Noël dorées, accrochées aux oreilles.', 'Little golden Christmas baubles hanging from the ears.', '{"acc":"gold_baubles"}', 317, 14, 'premium'),
      ('locs-givres', 'coiffures', 'epique', 'Locs Givrés', 'Frosted locs',
       'Des locs bleu glacier, perlés de givre et saupoudrés d''étincelles.', 'Glacier-blue locs, beaded with frost and dusted with sparkles.', '{"hair":"frost_locs"}', 318, 16, 'premium'),
      ('robe-gala-neige', 'tenues', 'epique', 'Robe de Gala Neige', 'Snow gala gown',
       'Une robe de bal blanc glacé, brodée de flocons et d''un collier de perles.', 'An icy-white ball gown, embroidered with snowflakes and a pearl necklace.', '{"outfit":"snow_gown"}', 319, 20, 'premium'),
      ('etoile-berger', 'chapeaux', 'epique', 'Étoile du Berger', 'Shepherd''s star',
       'Un halo doré et une étoile lumineuse qui flotte au-dessus de la tête.', 'A golden halo and a glowing star floating above the head.', '{"head":"star_halo"}', 320, 24, 'premium'),
      ('boubou-blanc-or', 'tenues', 'legendaire', 'Boubou Blanc et Or', 'White and gold boubou',
       'Le grand lot de la saison : un boubou blanc aux broderies d''or, la tenue des fêtes les plus solennelles.', 'The grand prize of the season: a white boubou with gold embroidery, the outfit of the most solemn feasts.', '{"outfit":"white_boubou"}', 321, 30, 'premium')
    ) as t(slug, category, rarity, name_fr, name_en, description_fr, description_en, config, sort_order, tier, track)
  loop
    insert into public.store_skins (slug, category, rarity, name_fr, name_en, description_fr, description_en, price_coins, config, sort_order, is_active, season_id)
    values (r.slug, r.category, r.rarity, r.name_fr, r.name_en, r.description_fr, r.description_en, 0, r.config::jsonb, r.sort_order, true, v_season)
    on conflict (slug) do update set season_id = excluded.season_id
    returning id into v_skin;

    insert into public.season_tiers (season_id, tier_number, xp_required, reward_type, reward_skin_id, label_fr, label_en, track)
    values (v_season, r.tier, 160 * r.tier, 'skin', v_skin, r.name_fr, r.name_en, r.track)
    on conflict (season_id, tier_number, track) do nothing;
  end loop;
end;
$$;
