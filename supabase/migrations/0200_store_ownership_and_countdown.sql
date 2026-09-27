-- ============================================================================
-- Trois correctifs remontés après la mise en place des articles à durée
-- limitée (migration 0199) :
--
--   1. ARTEFACTS CONSOMMABLES QUI NE DISPARAISSAIENT JAMAIS. Certains
--      effets (pierre_ancetres, larme_renaissance...) décrémentent déjà
--      player_artifacts.quantity à l'usage (voir 0153/0169/0172/0177/0186),
--      mais get_my_artifacts ne filtrait jamais `quantity > 0` : un artefact
--      entièrement consommé restait affiché dans "Mes Artefacts" avec 0 en
--      stock au lieu de disparaître. Même correctif sur le flag `owned` de
--      get_store_artifacts, qui bloquait sinon le rachat visuel côté
--      Boutique. Comportement inchangé pour les artefacts non consommés
--      (quantity reste à 1 tant que rien ne les utilise).
--
--   2. SKINS QUI DISPARAISSAIENT DE "MES SKINS" APRÈS EXPIRATION DE LA
--      VENTE. list_store_skins (0199) filtre désormais le catalogue sur la
--      fenêtre de vente — correct pour la boutique, mais Rewards.tsx et
--      AvatarStudio.tsx réutilisent CETTE MÊME fonction pour lister "mes
--      skins possédés". Un skin acheté puis retiré de la vente disparaissait
--      donc aussi de la liste du joueur qui l'avait déjà payé. Un skin
--      appartient au joueur À VIE une fois acheté (contrairement aux
--      artefacts à stock ci-dessus) : la fenêtre de vente ne doit plus
--      jamais s'appliquer à un skin déjà possédé.
--
--   3. COMPTE À REBOURS CÔTÉ JOUEUR. `ends_at` n'était pas renvoyé aux
--      catalogues joueur (get_store_artifacts/list_store_skins) — la
--      fenêtre ne servait qu'à filtrer, invisible pour le joueur. Ajouté
--      aux deux pour afficher un décompte (urgence d'achat) sur chaque
--      article limité dans le temps, côté client (StorePanels.tsx).
-- ============================================================================
set search_path = public;

create or replace function public.get_my_artifacts()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
begin
  if v_user is null then
    raise exception 'Non authentifié.';
  end if;

  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', sa.id,
      'name_fr', sa.name_fr, 'name_en', sa.name_en,
      'description_fr', sa.description_fr, 'description_en', sa.description_en,
      'category', sa.category,
      'image_path', sa.image_path,
      'quantity', pa.quantity,
      'max_stock', sa.max_stock,
      'repurchase_cooldown_hours', sa.repurchase_cooldown_hours,
      'next_purchase_at', case
        when sa.max_stock is not null and sa.repurchase_cooldown_hours is not null
        then pa.purchased_at + make_interval(hours => sa.repurchase_cooldown_hours)
        else null
      end
    ) order by sa.category, sa.name_fr)
    from public.player_artifacts pa
    join public.store_artifacts sa on sa.id = pa.artifact_id
    where pa.user_id = v_user and pa.quantity > 0
  ), '[]'::jsonb);
end;
$$;

create or replace function public.get_store_artifacts()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
begin
  if v_user is null then
    raise exception 'Non authentifié.';
  end if;

  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', sa.id,
      'category', sa.category,
      'image_path', sa.image_path,
      'name_fr', sa.name_fr, 'name_en', sa.name_en,
      'description_fr', sa.description_fr, 'description_en', sa.description_en,
      'price_coins', sa.price_coins,
      'max_stock', sa.max_stock,
      'ends_at', sa.ends_at,
      'quantity', coalesce(pa.quantity, 0),
      'owned', pa.user_id is not null and pa.quantity > 0,
      'can_purchase', case
        when pa.user_id is null or pa.quantity = 0 then true
        when sa.max_stock is null then false
        when pa.quantity >= sa.max_stock then false
        else now() >= pa.purchased_at + make_interval(hours => coalesce(sa.repurchase_cooldown_hours, 0))
      end
    ) order by sa.price_coins asc)
    from public.store_artifacts sa
    left join public.player_artifacts pa on pa.artifact_id = sa.id and pa.user_id = v_user
    where sa.active = true
      and (sa.starts_at is null or sa.starts_at <= now())
      and (sa.ends_at is null or sa.ends_at > now())
  ), '[]'::jsonb);
end;
$$;

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
    'ends_at', s.ends_at,
    'owned', exists (select 1 from public.player_skins ps where ps.skin_id = s.id and ps.user_id = auth.uid())
  ) order by s.sort_order, s.created_at), '[]'::jsonb)
  from public.store_skins s
  where (
    s.is_active
    and (s.starts_at is null or s.starts_at <= now())
    and (s.ends_at is null or s.ends_at > now())
  )
  or exists (select 1 from public.player_skins ps where ps.skin_id = s.id and ps.user_id = auth.uid());
$$;
