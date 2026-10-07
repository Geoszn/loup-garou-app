-- Collection boutique « Octobre Rose » : 18 pièces d'avatar vendues UNIQUEMENT
-- dans le Loup Store (jamais dans le pass de saison), retirées de la vente à
-- la fin de la saison Octobre Rose × Barbie. Un joueur qui les a achetées les
-- garde (list_store_skins renvoie toujours les skins possédés).
--
-- Ce fichier :
--  1. étend les catégories de skins (accessoires, fonds) ;
--  2. déclare les nouvelles pièces (avatar_part_min_points : seuil 999998 =
--     « boutique uniquement », débloquée par la seule possession du skin) ;
--  3. ouvre un 7e fond d'avatar (index 6), réservé à son skin (set_my_avatar,
--     get_my_unlocked_parts) ;
--  4. durcit purchase_skin : un skin de saison ou hors période ne peut plus
--     être « acheté » en appelant la fonction directement (l'identifiant d'un
--     skin de saison est visible dans get_my_season et son prix est 0) ;
--  5. insère les 18 skins.
-- Rejouable sans risque (create or replace, on conflict, drop constraint if exists).
set search_path = public;

-- ----------------------------------------------------------------------------
-- 1. Catégories
-- ----------------------------------------------------------------------------
alter table public.store_skins drop constraint if exists store_skins_category_check;
alter table public.store_skins
  add constraint store_skins_category_check
  check (category in ('tenues', 'coiffures', 'chapeaux', 'packs', 'accessoires', 'fonds'));

-- ----------------------------------------------------------------------------
-- 2. Seuils des pièces (doit rester synchronisé avec PART_MIN_POINTS dans
-- src/lib/avatarParts.ts). 999999 = saison, 999998 = boutique.
-- ----------------------------------------------------------------------------
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
    end
    when 'outfit' then case p_value
      when 'tunic' then 0 when 'tee' then 0 when 'cloak' then 100 when 'wrap' then 100 when 'kente' then 250
      when 'dashiki' then 250 when 'boubou' then 350 when 'hunter' then 550 when 'suit' then 800 when 'hood' then 600
      when 'armor' then 1100 when 'royal' then 1500 when 'furcape' then 2000
      when 'dream_rose' then 999999 when 'cape_solidaire' then 999999 when 'louve_malibu' then 999999
      when 'varsity' then 999998 when 'gala_gown' then 999998 when 'tracksuit_neon' then 999998 when 'hawaiian' then 999998
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
    end
  end;
$$;

-- ----------------------------------------------------------------------------
-- 3. Fond n°6 : réservé au skin qui le porte.
-- ----------------------------------------------------------------------------
create or replace function public.get_my_unlocked_parts()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(jsonb_agg(distinct kv.key || ':' || kv.value), '[]'::jsonb)
  from public.player_skins ps
  join public.store_skins s on s.id = ps.skin_id
  cross join lateral jsonb_each_text(s.config) kv
  where ps.user_id = auth.uid() and kv.key in ('hair', 'outfit', 'acc', 'head', 'bg');
$$;

create or replace function public.set_my_avatar(p_config jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_points int;
  v_skin int;
  v_bg int;
  v_kind text;
  v_value text;
  v_min int;
  v_head text;
  v_face text;
  v_clean jsonb;
begin
  if v_user is null then
    raise exception 'Authentification requise';
  end if;
  if p_config is null or jsonb_typeof(p_config) <> 'object' then
    raise exception 'Avatar invalide.';
  end if;

  begin
    v_skin := (p_config ->> 'skin')::int;
    v_bg := (p_config ->> 'bg')::int;
  exception when others then
    raise exception 'Avatar invalide.';
  end;
  if v_skin is null or v_skin not between 0 and 5 or v_bg is null or v_bg not between 0 and 6 then
    raise exception 'Avatar invalide.';
  end if;

  v_head := coalesce(p_config ->> 'head', 'none');
  v_face := coalesce(p_config ->> 'face', 'oval');
  if v_face not in ('oval', 'round', 'square', 'long', 'heart') then
    raise exception 'Avatar invalide.';
  end if;

  select coalesce(rank_points, 0) into v_points from public.profiles where id = v_user;

  -- Les fonds 0 à 5 sont libres ; les suivants s'obtiennent dans la boutique.
  if v_bg > 5 and not exists (
    select 1
    from public.player_skins ps
    join public.store_skins s on s.id = ps.skin_id
    where ps.user_id = v_user and s.config ->> 'bg' = v_bg::text
  ) then
    raise exception 'Ce fond s''obtient dans la boutique.';
  end if;

  foreach v_kind in array array['hair', 'outfit', 'acc', 'head'] loop
    v_value := case when v_kind = 'head' then v_head else p_config ->> v_kind end;
    v_min := public.avatar_part_min_points(v_kind, v_value);
    if v_min is null then
      raise exception 'Avatar invalide.';
    end if;
    if v_points < v_min and not exists (
      select 1
      from public.player_skins ps
      join public.store_skins s on s.id = ps.skin_id
      where ps.user_id = v_user and s.config ->> v_kind = v_value
    ) then
      raise exception 'Cette pièce se débloque à % points de rang.', v_min;
    end if;
  end loop;

  v_clean := jsonb_build_object(
    'skin', v_skin,
    'bg', v_bg,
    'hair', p_config ->> 'hair',
    'outfit', p_config ->> 'outfit',
    'acc', p_config ->> 'acc',
    'head', v_head,
    'face', v_face
  );

  update public.profiles set avatar_config = v_clean where id = v_user;
  return v_clean;
end;
$$;

-- ----------------------------------------------------------------------------
-- 4. purchase_skin : seuls les skins de la boutique, dans leur période de vente.
-- ----------------------------------------------------------------------------
create or replace function public.purchase_skin(p_skin_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_price int;
  v_name text;
  v_active boolean;
  v_season uuid;
  v_starts timestamptz;
  v_ends timestamptz;
  v_balance bigint;
  v_new_balance bigint;
begin
  if v_user is null then
    raise exception 'Non authentifié.';
  end if;

  select price_coins, name_fr, is_active, season_id, starts_at, ends_at
    into v_price, v_name, v_active, v_season, v_starts, v_ends
    from public.store_skins where id = p_skin_id;
  if not found or not v_active
     or v_season is not null
     or v_price <= 0
     or (v_starts is not null and v_starts > now())
     or (v_ends is not null and v_ends <= now()) then
    raise exception 'Ce skin n''est pas disponible.';
  end if;

  select loup_coins into v_balance from public.profiles where id = v_user for update;

  if exists (select 1 from public.player_skins where user_id = v_user and skin_id = p_skin_id) then
    raise exception 'Vous possédez déjà ce skin.';
  end if;
  if coalesce(v_balance, 0) < v_price then
    raise exception 'Solde de Loup Coins insuffisant.';
  end if;

  update public.profiles set loup_coins = loup_coins - v_price where id = v_user
    returning loup_coins into v_new_balance;
  insert into public.player_skins (user_id, skin_id) values (v_user, p_skin_id);
  insert into public.loup_coins_transactions (user_id, amount, reason, label)
  values (v_user, -v_price, 'store_purchase', v_name);

  return jsonb_build_object('skin_id', p_skin_id, 'new_balance', v_new_balance);
end;
$$;

-- ----------------------------------------------------------------------------
-- 4bis. admin_upsert_store_skin : accepte les deux nouvelles catégories
-- (corps identique à la migration 0203 pour le reste).
-- ----------------------------------------------------------------------------
create or replace function public.admin_upsert_store_skin(
  p_id uuid,
  p_slug text,
  p_category text,
  p_rarity text,
  p_name_fr text,
  p_name_en text,
  p_description_fr text,
  p_description_en text,
  p_price_coins int,
  p_config jsonb,
  p_sort_order int,
  p_starts_at timestamptz,
  p_ends_at timestamptz,
  p_active boolean,
  p_season_id uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_admin uuid := auth.uid();
  v_id uuid;
  v_price int;
begin
  if not public.is_admin_user(v_admin) then
    raise exception 'Accès refusé.';
  end if;

  if p_name_fr is null or length(trim(p_name_fr)) = 0 or p_name_en is null or length(trim(p_name_en)) = 0 then
    raise exception 'Nom requis (FR et EN).';
  end if;
  if p_description_fr is null or length(trim(p_description_fr)) = 0 or p_description_en is null or length(trim(p_description_en)) = 0 then
    raise exception 'Description requise (FR et EN).';
  end if;
  if p_category not in ('tenues', 'coiffures', 'chapeaux', 'packs', 'accessoires', 'fonds') then
    raise exception 'Catégorie invalide.';
  end if;
  if p_rarity not in ('commun', 'rare', 'epique', 'legendaire') then
    raise exception 'Rareté invalide.';
  end if;
  if p_config is null or p_config = '{}'::jsonb then
    raise exception 'Le skin doit modifier au moins une pièce d''avatar.';
  end if;
  if p_starts_at is not null and p_ends_at is not null and p_ends_at <= p_starts_at then
    raise exception 'La date de fin doit être après la date de début.';
  end if;
  if p_season_id is not null and not exists (select 1 from public.seasons where id = p_season_id) then
    raise exception 'Saison introuvable.';
  end if;

  if p_season_id is not null then
    v_price := 0;
  else
    if coalesce(p_price_coins, -1) <= 0 then
      raise exception 'Le prix doit être supérieur à 0.';
    end if;
    v_price := p_price_coins;
  end if;

  if p_id is null then
    if p_slug is null or p_slug !~ '^[a-z0-9-]+$' then
      raise exception 'Identifiant technique invalide (minuscules, chiffres, tirets uniquement).';
    end if;
    if exists (select 1 from public.store_skins where slug = p_slug) then
      raise exception 'Cet identifiant technique est déjà utilisé.';
    end if;

    insert into public.store_skins (
      slug, category, rarity, name_fr, name_en, description_fr, description_en,
      price_coins, config, sort_order, starts_at, ends_at, is_active, season_id
    )
    values (
      p_slug, p_category, p_rarity, trim(p_name_fr), trim(p_name_en), trim(p_description_fr), trim(p_description_en),
      v_price, p_config, coalesce(p_sort_order, 0), p_starts_at, p_ends_at, coalesce(p_active, true), p_season_id
    )
    returning id into v_id;

    insert into public.admin_audit_log (admin_id, action, target, details)
    values (v_admin, 'create_store_skin', v_id::text, jsonb_build_object('slug', p_slug, 'name_fr', p_name_fr));
  else
    update public.store_skins
    set category = p_category,
        rarity = p_rarity,
        name_fr = trim(p_name_fr),
        name_en = trim(p_name_en),
        description_fr = trim(p_description_fr),
        description_en = trim(p_description_en),
        price_coins = v_price,
        config = p_config,
        sort_order = coalesce(p_sort_order, 0),
        starts_at = p_starts_at,
        ends_at = p_ends_at,
        is_active = coalesce(p_active, true),
        season_id = p_season_id
    where id = p_id
    returning id into v_id;

    if v_id is null then
      raise exception 'Skin introuvable.';
    end if;

    insert into public.admin_audit_log (admin_id, action, target, details)
    values (v_admin, 'update_store_skin', v_id::text, jsonb_build_object('name_fr', p_name_fr));
  end if;

  return v_id;
end;
$$;

-- ----------------------------------------------------------------------------
-- 5. Les 18 skins. Fin de vente = fin de la saison Octobre Rose × Barbie
-- (même instant que seasons.ends_at ; repli sur le 26 octobre si la saison
-- n'existe pas dans cette base).
-- ----------------------------------------------------------------------------
insert into public.store_skins
  (slug, category, rarity, name_fr, name_en, description_fr, description_en, price_coins, config, sort_order, is_active, ends_at)
select v.slug, v.category, v.rarity, v.name_fr, v.name_en, v.description_fr, v.description_en, v.price_coins, v.config::jsonb, v.sort_order, true,
       coalesce((select ends_at from public.seasons where slug = 'octobre-rose-barbie'), timestamptz '2026-10-26 00:00:00+01')
from (values
  ('tresses-rose-bonbon', 'coiffures', 'rare', 'Tresses Rose Bonbon', 'Bubblegum braids',
   'De longues nattes rose bonbon nouées d''un élastique blanc, tombant devant les épaules.',
   'Long bubblegum-pink braids tied with white bands, falling over the shoulders.',
   220, '{"hair":"braids_pink"}', 210),
  ('afro-rose-poudre', 'coiffures', 'rare', 'Afro Rose Poudré', 'Powder-pink afro',
   'Un afro volumineux rose poudré, parsemé de petites étincelles.',
   'A voluminous powder-pink afro sprinkled with tiny sparkles.',
   220, '{"hair":"afro_pink"}', 211),
  ('queue-pop', 'coiffures', 'commun', 'Queue Pop', 'Pop ponytail',
   'Une haute queue de cheval rose vif, nouée d''un chouchou blanc.',
   'A high hot-pink ponytail tied with a white scrunchie.',
   150, '{"hair":"ponytail_pop"}', 212),
  ('pompadour-malibu', 'coiffures', 'rare', 'Pompadour Malibu', 'Malibu pompadour',
   'Une banane blonde gonflée à bloc, impeccable comme sur la plage de Malibu.',
   'A sky-high blond pompadour, flawless as if on Malibu beach.',
   220, '{"hair":"pompadour_ken"}', 213),
  ('coupe-bad-boy', 'coiffures', 'commun', 'Bad Boy', 'Slick-back',
   'Des cheveux plaqués en arrière, brillants comme du cuir.',
   'Slicked-back hair, shiny as leather.',
   150, '{"hair":"slick_back"}', 214),
  ('barbe-soignee', 'coiffures', 'rare', 'Barbe Soignée', 'Groomed beard',
   'Cheveux courts et barbe taillée, fine aux tempes et pleine sur la mâchoire.',
   'Short hair and a trimmed beard, thin at the temples and full along the jaw.',
   200, '{"hair":"beard_full"}', 215),

  ('veste-baseball-rose', 'tenues', 'rare', 'Veste Baseball Rose', 'Pink varsity jacket',
   'La veste de campus rose et blanche, numéro 1 sur le cœur.',
   'The pink and white varsity jacket, number 1 over the heart.',
   250, '{"outfit":"varsity"}', 220),
  ('robe-de-gala', 'tenues', 'epique', 'Robe de Gala', 'Gala gown',
   'Une robe de soirée satinée rose vif, collier de perles et strass.',
   'A hot-pink satin evening gown with a pearl necklace and rhinestones.',
   320, '{"outfit":"gala_gown"}', 221),
  ('survet-neon', 'tenues', 'commun', 'Survêt Néon', 'Neon tracksuit',
   'Le survêtement rose fluo des années 90, bandes blanches sur les manches.',
   'The fluorescent-pink 90s tracksuit with white stripes down the sleeves.',
   180, '{"outfit":"tracksuit_neon"}', 222),
  ('chemise-hawaienne', 'tenues', 'commun', 'Chemise Hawaïenne', 'Hawaiian shirt',
   'Une chemise ouverte fleurie d''hibiscus, l''esprit plage de Malibu.',
   'An open shirt covered in hibiscus flowers, pure Malibu beach spirit.',
   150, '{"outfit":"hawaiian"}', 223),

  ('foulard-solidarite', 'chapeaux', 'commun', 'Foulard Solidarité', 'Solidarity scarf',
   'Un foulard rose à pois, noué sur le côté, en soutien aux femmes qui se battent contre le cancer du sein.',
   'A pink polka-dot scarf tied at the side, in support of women fighting breast cancer.',
   120, '{"head":"scarf_pink"}', 230),
  ('cowboy-rose', 'chapeaux', 'rare', 'Chapeau Cowboy Rose', 'Pink cowboy hat',
   'Un chapeau de cowboy rose à étoile dorée, bord relevé.',
   'A pink cowboy hat with a golden star and a curled brim.',
   200, '{"head":"cowboy_pink"}', 231),
  ('bandana-motard', 'chapeaux', 'commun', 'Bandana Motard', 'Biker bandana',
   'Un bandana noir à motifs roses, noué derrière la tête.',
   'A black bandana with pink patterns, knotted at the back of the head.',
   120, '{"head":"bandana_biker"}', 232),

  ('maquillage-rose', 'accessoires', 'commun', 'Maquillage Rose', 'Pink makeup',
   'Rouge à lèvres rose brillant, fard à paupières et eye-liner ailé.',
   'Glossy pink lipstick, eyeshadow and winged eyeliner.',
   120, '{"acc":"lipstick_pink"}', 240),
  ('cigarette', 'accessoires', 'commun', 'Cigarette', 'Cigarette',
   'Une cigarette au coin des lèvres, avec sa petite fumée. Attitude cool garantie.',
   'A cigarette at the corner of the lips, with a wisp of smoke. Cool attitude guaranteed.',
   120, '{"acc":"cigarette"}', 241),
  ('cure-dent', 'accessoires', 'commun', 'Cure-dent Cool', 'Cool toothpick',
   'Un cure-dent entre les dents, façon cow-boy tranquille.',
   'A toothpick between the teeth, like a laid-back cowboy.',
   100, '{"acc":"toothpick"}', 242),
  ('chaine-en-or', 'accessoires', 'rare', 'Chaîne en Or', 'Gold chain',
   'Une grosse chaîne en or avec un pendentif en diamant rose.',
   'A chunky gold chain with a pink diamond pendant.',
   200, '{"acc":"gold_chain"}', 243),

  ('nuit-etoilee-rose', 'fonds', 'rare', 'Nuit Étoilée Rose', 'Pink starry night',
   'Un ciel qui passe du violet nuit au rose coucher de soleil, semé d''étoiles.',
   'A sky fading from night purple to sunset pink, scattered with stars.',
   150, '{"bg":6}', 250)
) as v(slug, category, rarity, name_fr, name_en, description_fr, description_en, price_coins, config, sort_order)
on conflict (slug) do update set
  category = excluded.category,
  rarity = excluded.rarity,
  name_fr = excluded.name_fr,
  name_en = excluded.name_en,
  description_fr = excluded.description_fr,
  description_en = excluded.description_en,
  price_coins = excluded.price_coins,
  config = excluded.config,
  sort_order = excluded.sort_order,
  ends_at = excluded.ends_at;
