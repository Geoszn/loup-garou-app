-- 0264 — Saison 2 « Noël au Village », lot 3 : 13 pièces d'avatar de plus, pour remplir les cases vides du pass.
--
-- Même règle que 0262 et 0263 : des skins de saison (season_id, prix 0), jamais en boutique, donnés par un palier. Valeurs déclarées
-- dans avatar_part_min_points (seuil 999999) et dans src/lib/avatarParts.ts, à garder synchronisés. Ce qu'on a obtenu reste à vie.
--   Piste GRATUITE : 10 Chapeau de Fête 2027 · 16 Guirlande Lumineuse · 22 Masque de Nouvel An · 24 Chignon Houx
--                    28 Serre-tête LED · 30 Lunettes Connectées
--   Piste PREMIUM  : 2 Griot Buds · 6 Tresses Fibre Optique · 12 Doudoune BabTech · 18 Pull à LED · 22 Costume de Gala Scintillant
--                    26 Casque Audio BabTech · 28 Boubou Festif Rouge et Or
-- Avec 0262 et 0263, tous les paliers pairs portent maintenant une récompense sur chaque piste (sauf la piste gratuite du palier 30,
-- remplie ici, et la piste premium du palier 30, déjà le grand lot). À appliquer APRÈS 0263. Rejouable sans risque.
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
      when 'fiber_braids' then 999999 when 'holly_bun' then 999999
      when 'xmas_braids' then 999999 when 'frost_locs' then 999999 when 'star_puffs' then 999999
    end
    when 'outfit' then case p_value
      when 'tunic' then 0 when 'tee' then 0 when 'cloak' then 100 when 'wrap' then 100 when 'kente' then 250
      when 'dashiki' then 250 when 'boubou' then 350 when 'hunter' then 550 when 'suit' then 800 when 'hood' then 600
      when 'armor' then 1100 when 'royal' then 1500 when 'furcape' then 2000
      when 'dream_rose' then 999999 when 'cape_solidaire' then 999999 when 'louve_malibu' then 999999
      when 'varsity' then 999998 when 'gala_gown' then 999998 when 'tracksuit_neon' then 999998 when 'hawaiian' then 999998
      when 'xmas_sweater' then 999999
      when 'led_sweater' then 999999 when 'puffer_jacket' then 999999 when 'gala_suit' then 999999 when 'festive_boubou' then 999999
      when 'snow_gown' then 999999 when 'santa_jacket' then 999999 when 'elf_outfit' then 999999 when 'white_boubou' then 999999
    end
    when 'acc' then case p_value
      when 'none' then 0 when 'ring' then 0 when 'freckles' then 0 when 'glasses' then 100 when 'sunglasses' then 150
      when 'hoops' then 200 when 'scar' then 250 when 'beads' then 350 when 'facepaint' then 550 when 'eyepatch' then 800
      when 'coeur_lunettes' then 999999
      when 'lipstick_pink' then 999998 when 'cigarette' then 999998 when 'toothpick' then 999998 when 'gold_chain' then 999998
      when 'griot_buds' then 999999 when 'smart_glasses' then 999999 when 'light_garland' then 999999 when 'party_mask' then 999999
      when 'gold_baubles' then 999999 when 'knit_scarf' then 999999
    end
    when 'head' then case p_value
      when 'none' then 0 when 'headband' then 100 when 'cap' then 250 when 'hat' then 550 when 'feather' then 800 when 'crown' then 2000
      when 'ribbon_pink' then 999999
      when 'scarf_pink' then 999998 when 'cowboy_pink' then 999998 when 'bandana_biker' then 999998
      when 'santa_hat' then 999999 when 'holly_crown' then 999999 when 'antlers' then 999999
      when 'headphones' then 999999 when 'led_headband' then 999999 when 'party_hat' then 999999
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
      ('chapeau-fete-2027', 'chapeaux', 'commun', 'Chapeau de Fête 2027', '2027 party hat',
       'Un cône de fête violet à rayures dorées et à pompon de confettis, pour la nouvelle année.', 'A purple party cone with golden stripes and a confetti pompom, for the new year.', '{"head":"party_hat"}', 330, 10, 'free'),
      ('guirlande-lumineuse', 'accessoires', 'commun', 'Guirlande Lumineuse', 'Light garland',
       'Une guirlande d''ampoules multicolores portée autour du cou.', 'A string of multicoloured bulbs worn around the neck.', '{"acc":"light_garland"}', 331, 16, 'free'),
      ('masque-nouvel-an', 'accessoires', 'rare', 'Masque de Nouvel An', 'New Year mask',
       'Un masque de bal violet et or, serti d''étincelles.', 'A purple and gold masquerade mask studded with sparkles.', '{"acc":"party_mask"}', 332, 22, 'free'),
      ('chignon-houx', 'coiffures', 'rare', 'Chignon Houx', 'Holly bun',
       'Un chignon noué d''une couronne de houx et de baies rouges.', 'A bun tied with a ring of holly and red berries.', '{"hair":"holly_bun"}', 333, 24, 'free'),
      ('serre-tete-led', 'chapeaux', 'rare', 'Serre-tête LED', 'LED headband',
       'Un serre-tête de lumières multicolores qui clignotent.', 'A headband of twinkling multicoloured lights.', '{"head":"led_headband"}', 334, 28, 'free'),
      ('lunettes-connectees', 'accessoires', 'rare', 'Lunettes Connectées', 'Smart glasses',
       'Des lunettes à verres teintés et affichage lumineux, signées BabTech.', 'Smart glasses with tinted lenses and a glowing display, by BabTech.', '{"acc":"smart_glasses"}', 335, 30, 'free'),
      ('griot-buds', 'accessoires', 'rare', 'Griot Buds', 'Griot Buds',
       'Les écouteurs sans fil BabTech, blancs à pastille rouge.', 'The BabTech wireless earbuds, white with a red dot.', '{"acc":"griot_buds"}', 336, 2, 'premium'),
      ('tresses-fibre-optique', 'coiffures', 'epique', 'Tresses Fibre Optique', 'Fibre-optic braids',
       'Des tresses aux perles et aux fibres lumineuses cyan, magenta et dorées.', 'Braids with beads and glowing cyan, magenta and golden fibres.', '{"hair":"fiber_braids"}', 337, 6, 'premium'),
      ('doudoune-babtech', 'tenues', 'rare', 'Doudoune BabTech', 'BabTech puffer jacket',
       'Une doudoune matelassée verte au col montant, avec le logo baobab brodé.', 'A green quilted puffer jacket with a high collar and the embroidered baobab logo.', '{"outfit":"puffer_jacket"}', 338, 12, 'premium'),
      ('pull-led', 'tenues', 'epique', 'Pull à LED', 'LED sweater',
       'Un pull sombre parcouru de fils lumineux cyan, magenta et jaunes.', 'A dark sweater run through with glowing cyan, magenta and yellow threads.', '{"outfit":"led_sweater"}', 339, 18, 'premium'),
      ('costume-gala-scintillant', 'tenues', 'epique', 'Costume de Gala Scintillant', 'Sparkling gala suit',
       'Un smoking noir semé d''étoiles dorées, avec son nœud papillon rouge.', 'A black tuxedo sprinkled with golden stars, with its red bow tie.', '{"outfit":"gala_suit"}', 340, 22, 'premium'),
      ('casque-audio-babtech', 'chapeaux', 'epique', 'Casque Audio BabTech', 'BabTech headphones',
       'Un casque audio vert sombre aux coques marquées du baobab BabTech.', 'A dark-green headset with ear cups marked with the BabTech baobab.', '{"head":"headphones"}', 341, 26, 'premium'),
      ('boubou-festif-rouge-or', 'tenues', 'epique', 'Boubou Festif Rouge et Or', 'Festive red and gold boubou',
       'Un boubou rouge aux broderies d''or et de perles blanches, pour les grandes fêtes.', 'A red boubou with gold and white-pearl embroidery, for the grand feasts.', '{"outfit":"festive_boubou"}', 342, 28, 'premium')
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
