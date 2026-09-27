-- ============================================================================
-- Disponibilité limitée dans le temps pour les articles du Loup Store
-- (artefacts ET skins) : jusqu'ici tout produit actif restait en vente
-- indéfiniment. `starts_at`/`ends_at` (tous deux facultatifs) permettent
-- désormais de programmer une fenêtre de vente — l'un des deux seul, les
-- deux, ou aucun (= illimité, comportement inchangé). `active` reste un
-- interrupteur manuel séparé : un produit désactivé le reste même dans sa
-- fenêtre de vente.
--
-- Un produit dont la fenêtre est terminée disparaît du catalogue CÔTÉ
-- JOUEUR (get_store_artifacts/list_store_skins) mais reste visible côté
-- admin (les fonctions admin_list_* renvoient tout, comme aujourd'hui) —
-- même principe que `active = false`, qui filtrait déjà côté joueur
-- uniquement. Les joueurs qui possèdent déjà un produit expiré le gardent
-- (aucune suppression de player_artifacts/player_skins ici).
--
-- Profite du même passage pour donner aux skins un vrai jeu de fonctions
-- d'administration (admin_list_store_skins/admin_upsert_store_skin/
-- admin_delete_store_skin) : jusqu'ici store_skins n'était modifiable que
-- par migration SQL (voir 0195/0197), aucune interface admin n'existait.
-- ============================================================================
set search_path = public;

-- ----------------------------------------------------------------------------
-- 1. Colonnes + garde-fou (une fin ne peut pas précéder un début).
-- ----------------------------------------------------------------------------
alter table public.store_artifacts add column if not exists starts_at timestamptz;
alter table public.store_artifacts add column if not exists ends_at timestamptz;
alter table public.store_artifacts drop constraint if exists store_artifacts_window_check;
alter table public.store_artifacts add constraint store_artifacts_window_check
  check (starts_at is null or ends_at is null or ends_at > starts_at);

alter table public.store_skins add column if not exists starts_at timestamptz;
alter table public.store_skins add column if not exists ends_at timestamptz;
alter table public.store_skins drop constraint if exists store_skins_window_check;
alter table public.store_skins add constraint store_skins_window_check
  check (starts_at is null or ends_at is null or ends_at > starts_at);

-- ----------------------------------------------------------------------------
-- 2. Catalogues joueur : filtrés désormais sur la fenêtre en plus de `active`.
-- ----------------------------------------------------------------------------
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
      'quantity', coalesce(pa.quantity, 0),
      'owned', pa.user_id is not null,
      'can_purchase', case
        when pa.user_id is null then true
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
    'owned', exists (select 1 from public.player_skins ps where ps.skin_id = s.id and ps.user_id = auth.uid())
  ) order by s.sort_order, s.created_at), '[]'::jsonb)
  from public.store_skins s
  where s.is_active
    and (s.starts_at is null or s.starts_at <= now())
    and (s.ends_at is null or s.ends_at > now());
$$;

-- ----------------------------------------------------------------------------
-- 3. admin_upsert_store_artifact : ajoute p_starts_at/p_ends_at. Signature
-- changée (deux paramètres de plus) : drop explicite requis.
-- ----------------------------------------------------------------------------
drop function if exists public.admin_upsert_store_artifact(uuid, text, text, text, text, text, int, text, text, int, int, boolean);

create or replace function public.admin_upsert_store_artifact(
  p_id uuid,
  p_key text,
  p_name_fr text,
  p_name_en text,
  p_description_fr text,
  p_description_en text,
  p_price_coins int,
  p_category text,
  p_effect_key text,
  p_max_stock int,
  p_repurchase_cooldown_hours int,
  p_starts_at timestamptz,
  p_ends_at timestamptz,
  p_active boolean
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_admin uuid := auth.uid();
  v_id uuid;
  v_max_stock int;
  v_cooldown int;
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
  if coalesce(p_price_coins, -1) < 0 then
    raise exception 'Le prix ne peut pas être négatif.';
  end if;
  if p_category not in ('outils', 'rares', 'cosmetiques', 'fragments') then
    raise exception 'Catégorie invalide.';
  end if;
  if p_effect_key not in (
    'none', 'parchemin_griot', 'dernier_souffle', 'masque_griot', 'plume_anancy',
    'boussole_village', 'masque_sans_visage', 'balance_ange', 'pierre_ancetres', 'feu_sacre_ancetres',
    'larme_renaissance'
  ) then
    raise exception 'Effet invalide.';
  end if;
  if p_starts_at is not null and p_ends_at is not null and p_ends_at <= p_starts_at then
    raise exception 'La date de fin doit être après la date de début.';
  end if;

  if p_category = 'rares' then
    v_max_stock := coalesce(p_max_stock, 1);
    v_cooldown := coalesce(p_repurchase_cooldown_hours, 24);
    if v_max_stock <= 0 then
      raise exception 'Le stock maximum doit être supérieur à 0.';
    end if;
    if v_cooldown < 0 then
      raise exception 'Le délai de rachat ne peut pas être négatif.';
    end if;
  else
    v_max_stock := null;
    v_cooldown := null;
  end if;

  if p_id is null then
    if p_key is null or p_key !~ '^[a-z0-9_]+$' then
      raise exception 'Identifiant technique invalide (minuscules, chiffres, underscore uniquement).';
    end if;
    if exists (select 1 from public.store_artifacts where key = p_key) then
      raise exception 'Cet identifiant technique est déjà utilisé.';
    end if;

    insert into public.store_artifacts (
      key, name_fr, name_en, description_fr, description_en, price_coins, category, effect_key,
      max_stock, repurchase_cooldown_hours, starts_at, ends_at, active
    )
    values (
      p_key, trim(p_name_fr), trim(p_name_en), trim(p_description_fr), trim(p_description_en), p_price_coins, p_category, p_effect_key,
      v_max_stock, v_cooldown, p_starts_at, p_ends_at, coalesce(p_active, true)
    )
    returning id into v_id;

    insert into public.admin_audit_log (admin_id, action, target, details)
    values (v_admin, 'create_store_artifact', v_id::text, jsonb_build_object('key', p_key, 'name_fr', p_name_fr));
  else
    update public.store_artifacts
    set name_fr = trim(p_name_fr),
        name_en = trim(p_name_en),
        description_fr = trim(p_description_fr),
        description_en = trim(p_description_en),
        price_coins = p_price_coins,
        category = p_category,
        effect_key = p_effect_key,
        max_stock = v_max_stock,
        repurchase_cooldown_hours = v_cooldown,
        starts_at = p_starts_at,
        ends_at = p_ends_at,
        active = coalesce(p_active, true)
    where id = p_id
    returning id into v_id;

    if v_id is null then
      raise exception 'Artefact introuvable.';
    end if;

    insert into public.admin_audit_log (admin_id, action, target, details)
    values (v_admin, 'update_store_artifact', v_id::text, jsonb_build_object('name_fr', p_name_fr));
  end if;

  return v_id;
end;
$$;

revoke execute on function public.admin_upsert_store_artifact(uuid, text, text, text, text, text, int, text, text, int, int, timestamptz, timestamptz, boolean) from public, anon;
grant execute on function public.admin_upsert_store_artifact(uuid, text, text, text, text, text, int, text, text, int, int, timestamptz, timestamptz, boolean) to authenticated;

-- ----------------------------------------------------------------------------
-- 4. Administration des skins — n'existait pas du tout avant cette migration
-- (même patron que admin_list/upsert/delete_store_artifact ci-dessus).
-- ----------------------------------------------------------------------------
create or replace function public.admin_list_store_skins()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_admin uuid := auth.uid();
begin
  if not public.is_admin_user(v_admin) then
    raise exception 'Accès refusé.';
  end if;

  return coalesce((
    select jsonb_agg(row_to_json(s) order by s.sort_order, s.created_at) from public.store_skins s
  ), '[]'::jsonb);
end;
$$;

revoke execute on function public.admin_list_store_skins() from public, anon;
grant execute on function public.admin_list_store_skins() to authenticated;

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
  p_active boolean
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_admin uuid := auth.uid();
  v_id uuid;
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
  if coalesce(p_price_coins, -1) <= 0 then
    raise exception 'Le prix doit être supérieur à 0.';
  end if;
  if p_category not in ('tenues', 'coiffures', 'chapeaux', 'packs') then
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

  if p_id is null then
    if p_slug is null or p_slug !~ '^[a-z0-9-]+$' then
      raise exception 'Identifiant technique invalide (minuscules, chiffres, tirets uniquement).';
    end if;
    if exists (select 1 from public.store_skins where slug = p_slug) then
      raise exception 'Cet identifiant technique est déjà utilisé.';
    end if;

    insert into public.store_skins (
      slug, category, rarity, name_fr, name_en, description_fr, description_en,
      price_coins, config, sort_order, starts_at, ends_at, is_active
    )
    values (
      p_slug, p_category, p_rarity, trim(p_name_fr), trim(p_name_en), trim(p_description_fr), trim(p_description_en),
      p_price_coins, p_config, coalesce(p_sort_order, 0), p_starts_at, p_ends_at, coalesce(p_active, true)
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
        price_coins = p_price_coins,
        config = p_config,
        sort_order = coalesce(p_sort_order, 0),
        starts_at = p_starts_at,
        ends_at = p_ends_at,
        is_active = coalesce(p_active, true)
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

revoke execute on function public.admin_upsert_store_skin(uuid, text, text, text, text, text, text, text, int, jsonb, int, timestamptz, timestamptz, boolean) from public, anon;
grant execute on function public.admin_upsert_store_skin(uuid, text, text, text, text, text, text, text, int, jsonb, int, timestamptz, timestamptz, boolean) to authenticated;

create or replace function public.admin_delete_store_skin(p_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_admin uuid := auth.uid();
begin
  if not public.is_admin_user(v_admin) then
    raise exception 'Accès refusé.';
  end if;

  delete from public.store_skins where id = p_id;

  insert into public.admin_audit_log (admin_id, action, target, details)
  values (v_admin, 'delete_store_skin', p_id::text, null);
end;
$$;

revoke execute on function public.admin_delete_store_skin(uuid) from public, anon;
grant execute on function public.admin_delete_store_skin(uuid) to authenticated;

-- ----------------------------------------------------------------------------
-- 5. admin_get_stats : tendance (hier), activité 7 jours, et un résumé
-- boutique (actifs / programmés / expirent sous 48h / expirés, artefacts +
-- skins confondus) — nourrit la Vue d'ensemble redessinée.
-- ----------------------------------------------------------------------------
create or replace function public.admin_get_stats()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
begin
  if not public.is_admin_user(v_user) then
    raise exception 'Accès refusé.';
  end if;

  return jsonb_build_object(
    'total_users', (select count(*) from public.profiles),
    'new_users_today', (select count(*) from public.profiles where created_at >= date_trunc('day', now())),
    'new_users_yesterday', (
      select count(*) from public.profiles
      where created_at >= date_trunc('day', now()) - interval '1 day' and created_at < date_trunc('day', now())
    ),
    'total_games', (select count(*) from public.games),
    'active_games', (select count(*) from public.games where status <> 'ended'),
    'games_today', (select count(*) from public.games where created_at >= date_trunc('day', now())),
    'games_yesterday', (
      select count(*) from public.games
      where created_at >= date_trunc('day', now()) - interval '1 day' and created_at < date_trunc('day', now())
    ),
    'games_last_7_days', (
      select jsonb_agg(jsonb_build_object('date', d::date, 'count', coalesce(c.cnt, 0)) order by d)
      from generate_series(current_date - 6, current_date, interval '1 day') d
      left join (
        select date_trunc('day', created_at)::date as day, count(*) as cnt
        from public.games
        where created_at >= current_date - 6
        group by 1
      ) c on c.day = d::date
    ),
    'messages_today', (select count(*) from public.chat_messages where created_at >= date_trunc('day', now())),
    'banned_users', (select count(*) from public.profiles where is_banned),
    'admin_users', (select count(*) from public.profiles where is_admin),
    'pending_deletions', (select count(*) from public.account_deletion_requests),
    'pending_join_requests', (select count(*) from public.game_join_requests where status = 'pending'),
    'unread_feedback', (select count(*) from public.feedback_messages where read_at is null),
    'new_games_enabled', (select new_games_enabled from public.app_settings where id = 1),
    'store_active_count', (
      (select count(*) from public.store_artifacts where active
        and (starts_at is null or starts_at <= now()) and (ends_at is null or ends_at > now()))
      + (select count(*) from public.store_skins where is_active
        and (starts_at is null or starts_at <= now()) and (ends_at is null or ends_at > now()))
    ),
    'store_scheduled_count', (
      (select count(*) from public.store_artifacts where active and starts_at is not null and starts_at > now())
      + (select count(*) from public.store_skins where is_active and starts_at is not null and starts_at > now())
    ),
    'store_expiring_soon_count', (
      (select count(*) from public.store_artifacts where active and (starts_at is null or starts_at <= now())
        and ends_at is not null and ends_at > now() and ends_at <= now() + interval '48 hours')
      + (select count(*) from public.store_skins where is_active and (starts_at is null or starts_at <= now())
        and ends_at is not null and ends_at > now() and ends_at <= now() + interval '48 hours')
    ),
    'store_expired_count', (
      (select count(*) from public.store_artifacts where ends_at is not null and ends_at <= now())
      + (select count(*) from public.store_skins where ends_at is not null and ends_at <= now())
    )
  );
end;
$$;

revoke execute on function public.admin_get_stats() from public, anon;
grant execute on function public.admin_get_stats() to authenticated;
