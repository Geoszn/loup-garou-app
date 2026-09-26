-- Skins du Loup Store : bundles de pièces d'avatar (tenue, coiffure, chapeau,
-- accessoire, visage) achetés avec des Loup Coins. Posséder un skin débloque
-- ses pièces dans l'éditeur, même si les points de rang ne suffisent pas
-- (set_my_avatar), et « Équiper » applique le skin à l'avatar.
set search_path = public;

create table if not exists public.store_skins (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  category text not null check (category in ('tenues', 'coiffures', 'chapeaux', 'packs')),
  rarity text not null check (rarity in ('commun', 'rare', 'epique', 'legendaire')),
  name_fr text not null,
  name_en text not null,
  description_fr text not null,
  description_en text not null,
  price_coins int not null check (price_coins > 0),
  config jsonb not null,
  is_active boolean not null default true,
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists public.player_skins (
  user_id uuid not null references public.profiles (id) on delete cascade,
  skin_id uuid not null references public.store_skins (id) on delete cascade,
  purchased_at timestamptz not null default now(),
  primary key (user_id, skin_id)
);

alter table public.store_skins enable row level security;
alter table public.player_skins enable row level security;
revoke all on public.store_skins from anon, authenticated;
revoke all on public.player_skins from anon, authenticated;

insert into public.store_skins (slug, category, rarity, name_fr, name_en, description_fr, description_en, price_coins, config, sort_order) values
  ('couronne-doree', 'chapeaux', 'legendaire', 'Couronne dorée', 'Golden crown', 'Une couronne ciselée, réservée aux rois et reines du village.', 'A chiselled crown, reserved for the kings and queens of the village.', 400, '{"head":"crown","outfit":"royal","hair":"afro"}', 1),
  ('cape-royale', 'tenues', 'epique', 'Cape royale', 'Royal cape', 'Velours violet et col doré.', 'Purple velvet and a golden collar.', 350, '{"outfit":"royal","hair":"braids"}', 2),
  ('armure-ebene', 'tenues', 'epique', 'Armure d''ébène', 'Ebony armour', 'Plaques d''acier sombre et peinture de guerre.', 'Dark steel plates and war paint.', 300, '{"outfit":"armor","hair":"fade","acc":"facepaint"}', 3),
  ('peau-de-loup', 'tenues', 'rare', 'Peau de loup', 'Wolf pelt', 'Le trophée du chasseur le plus redouté.', 'The trophy of the most feared hunter.', 250, '{"outfit":"furcape","hair":"locs","acc":"scar"}', 4),
  ('crete-de-guerre', 'coiffures', 'rare', 'Crête de guerre', 'War mohawk', 'Pour les jours où il faut faire peur.', 'For the days when you need to scare them.', 200, '{"hair":"mohawk","outfit":"hunter"}', 5),
  ('plume-sacree', 'chapeaux', 'commun', 'Plume sacrée', 'Sacred feather', 'Une plume rouge portée par les anciens.', 'A red feather worn by the elders.', 150, '{"head":"feather","hair":"fade","outfit":"boubou"}', 6),
  ('pack-griot', 'packs', 'legendaire', 'Pack Griot', 'Griot pack', 'Gele, boubou brodé et créoles : le look complet du conteur.', 'Gele, embroidered boubou and hoops: the storyteller''s full look.', 500, '{"hair":"gele","outfit":"boubou","acc":"hoops","face":"heart"}', 7),
  ('pack-chasseur', 'packs', 'epique', 'Pack Chasseur', 'Hunter pack', 'Chapeau de brousse, gilet de cuir et perles.', 'Bush hat, leather vest and beads.', 420, '{"head":"hat","outfit":"hunter","acc":"beads","face":"square"}', 8)
on conflict (slug) do nothing;

create or replace function public.list_store_skins()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', s.id, 'category', s.category, 'rarity', s.rarity,
    'name_fr', s.name_fr, 'name_en', s.name_en,
    'description_fr', s.description_fr, 'description_en', s.description_en,
    'price_coins', s.price_coins, 'config', s.config,
    'owned', exists (select 1 from public.player_skins ps where ps.skin_id = s.id and ps.user_id = auth.uid())
  ) order by s.sort_order, s.created_at), '[]'::jsonb)
  from public.store_skins s
  where s.is_active;
$$;

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
  where ps.user_id = auth.uid() and kv.key in ('hair', 'outfit', 'acc', 'head');
$$;

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
  v_balance bigint;
  v_new_balance bigint;
begin
  if v_user is null then
    raise exception 'Non authentifié.';
  end if;

  select price_coins, name_fr, is_active into v_price, v_name, v_active
    from public.store_skins where id = p_skin_id;
  if not found or not v_active then
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

create or replace function public.equip_skin(p_skin_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_config jsonb;
  v_current jsonb;
  v_default jsonb := '{"skin":3,"bg":0,"hair":"braids","outfit":"tunic","acc":"none","head":"none","face":"oval"}'::jsonb;
  v_next jsonb;
begin
  if v_user is null then
    raise exception 'Non authentifié.';
  end if;
  select s.config into v_config
    from public.store_skins s
    join public.player_skins ps on ps.skin_id = s.id and ps.user_id = v_user
    where s.id = p_skin_id;
  if not found then
    raise exception 'Vous ne possédez pas ce skin.';
  end if;

  select coalesce(avatar_config, v_default) into v_current from public.profiles where id = v_user;
  v_next := v_default || v_current || v_config;
  update public.profiles set avatar_config = v_next where id = v_user;
  return v_next;
end;
$$;

revoke execute on function public.list_store_skins() from public, anon;
revoke execute on function public.get_my_unlocked_parts() from public, anon;
revoke execute on function public.purchase_skin(uuid) from public, anon;
revoke execute on function public.equip_skin(uuid) from public, anon;
grant execute on function public.list_store_skins() to authenticated;
grant execute on function public.get_my_unlocked_parts() to authenticated;
grant execute on function public.purchase_skin(uuid) to authenticated;
grant execute on function public.equip_skin(uuid) to authenticated;

-- set_my_avatar : une pièce possédée via un skin est débloquée même sans les
-- points de rang requis. Reste identique par ailleurs.
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
  if v_skin is null or v_skin not between 0 and 5 or v_bg is null or v_bg not between 0 and 5 then
    raise exception 'Avatar invalide.';
  end if;

  v_head := coalesce(p_config ->> 'head', 'none');
  v_face := coalesce(p_config ->> 'face', 'oval');
  if v_face not in ('oval', 'round', 'square', 'long', 'heart') then
    raise exception 'Avatar invalide.';
  end if;

  select coalesce(rank_points, 0) into v_points from public.profiles where id = v_user;

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
