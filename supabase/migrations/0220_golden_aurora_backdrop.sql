-- Fond premium « Aurore Dorée » : édition limitée à 1000 Loup Coins, en vente
-- jusqu'au 7 novembre 2026 inclus (fin de vente le 8 novembre à 00:00, heure de
-- Paris). C'est le 8e fond d'avatar (index 7), réservé à son skin : comme le fond
-- n°6, set_my_avatar exige de posséder le skin qui le porte.
-- Rejouable sans risque (create or replace, on conflict).
set search_path = public;

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
  v_acc2 text;
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
  if v_skin is null or v_skin not between 0 and 5 or v_bg is null or v_bg not between 0 and 7 then
    raise exception 'Avatar invalide.';
  end if;

  v_head := coalesce(p_config ->> 'head', 'none');
  v_face := coalesce(p_config ->> 'face', 'oval');
  if v_face not in ('oval', 'round', 'square', 'long', 'heart') then
    raise exception 'Avatar invalide.';
  end if;

  -- 2e détail : valeur ignorée si identique au 1er (évite un doublon).
  v_acc2 := coalesce(p_config ->> 'acc2', 'none');
  if v_acc2 = coalesce(p_config ->> 'acc', 'none') then
    v_acc2 := 'none';
  end if;

  select coalesce(rank_points, 0) into v_points from public.profiles where id = v_user;

  -- Les fonds 0 à 5 sont libres ; les suivants (6 et 7) s'obtiennent dans la boutique.
  if v_bg > 5 and not exists (
    select 1
    from public.player_skins ps
    join public.store_skins s on s.id = ps.skin_id
    where ps.user_id = v_user and s.config ->> 'bg' = v_bg::text
  ) then
    raise exception 'Ce fond s''obtient dans la boutique.';
  end if;

  foreach v_kind in array array['hair', 'outfit', 'acc', 'head', 'acc2'] loop
    v_value := case v_kind when 'head' then v_head when 'acc2' then v_acc2 else p_config ->> v_kind end;
    -- acc2 suit exactement les règles des accessoires (même catalogue).
    v_min := public.avatar_part_min_points(case when v_kind = 'acc2' then 'acc' else v_kind end, v_value);
    if v_min is null then
      raise exception 'Avatar invalide.';
    end if;
    if v_points < v_min and not exists (
      select 1
      from public.player_skins ps
      join public.store_skins s on s.id = ps.skin_id
      where ps.user_id = v_user and s.config ->> (case when v_kind = 'acc2' then 'acc' else v_kind end) = v_value
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
    'acc2', v_acc2,
    'head', v_head,
    'face', v_face
  );

  update public.profiles set avatar_config = v_clean where id = v_user;
  return v_clean;
end;
$$;

insert into public.store_skins
  (slug, category, rarity, name_fr, name_en, description_fr, description_en, price_coins, config, sort_order, is_active, ends_at)
values (
  'aurore-doree', 'fonds', 'legendaire', 'Aurore Dorée', 'Golden Aurora',
  'Édition limitée : une aurore qui ondule, un soleil de rayons d''or qui tourne lentement et un halo doré derrière ta tête. Un fond animé, disponible jusqu''au 7 novembre — il ne reviendra pas.',
  'Limited edition: a rippling aurora, a slowly turning sun of golden rays and a golden halo behind your head. An animated backdrop, available until 7 November — it will not return.',
  1000, '{"bg":7}'::jsonb, 1, true, timestamptz '2026-11-08 00:00:00+01'
)
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
