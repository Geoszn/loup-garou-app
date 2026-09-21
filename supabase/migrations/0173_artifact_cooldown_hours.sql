-- ============================================================================
-- Convertit le délai de rachat des artefacts "rares" de JOURS (entier,
-- toujours ≥ 1, jamais 0) en HEURES (entier, 0 autorisé). Retour utilisateur
-- explicite : le réglage en jours était trop grossier — impossible de
-- configurer "rachats immédiats jusqu'au stock max" (0) ou un rythme fin
-- (ex. toutes les 6h). Décisions prises avec l'utilisateur :
--   - 0 heure = aucun délai, un joueur peut racheter jusqu'à max_stock à la
--     suite, sans attendre.
--   - N heures = il faut attendre N heures depuis le dernier achat avant de
--     pouvoir racheter une nouvelle charge.
--   - Réglable par artefact depuis le dashboard admin (StoreArtifactFormDrawer,
--     AdminDashboard.tsx), avec un texte explicatif clair pour ne pas perdre
--     l'admin dans la sémantique du champ.
--
-- Conversion des données existantes : `repurchase_cooldown_hours =
-- repurchase_cooldown_days * 24` pour préserver le comportement réel déjà
-- configuré (un artefact à "10 jours" reste "10 jours", pas silencieusement
-- réinterprété en "10 heures").
--
-- Touche 4 fonctions : purchase_artifact (vérification du délai à l'achat),
-- get_store_artifacts (can_purchase côté boutique), get_my_artifacts
-- (affichage "Mes Artefacts" + next_purchase_at), admin_upsert_store_artifact
-- (paramètre renommé p_repurchase_cooldown_days -> p_repurchase_cooldown_hours,
-- validation assouplie pour accepter 0). Signature inchangée en nombre/ordre/
-- types de paramètres pour admin_upsert_store_artifact (seul le NOM d'un
-- paramètre change) : create or replace suffit, pas besoin de drop function.
-- ============================================================================
set search_path = public;

-- ----------------------------------------------------------------------------
-- 1. Colonne + contrainte + conversion des données existantes.
-- ----------------------------------------------------------------------------
alter table public.store_artifacts add column if not exists repurchase_cooldown_hours int;

update public.store_artifacts
set repurchase_cooldown_hours = repurchase_cooldown_days * 24
where repurchase_cooldown_days is not null and repurchase_cooldown_hours is null;

alter table public.store_artifacts drop constraint if exists store_artifacts_cooldown_check;
alter table public.store_artifacts add constraint store_artifacts_cooldown_check
  check (repurchase_cooldown_hours is null or repurchase_cooldown_hours >= 0);

alter table public.store_artifacts drop column if exists repurchase_cooldown_days;

create or replace function public.purchase_artifact(p_artifact_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_price int;
  v_name_fr text;
  v_active boolean;
  v_max_stock int;
  v_cooldown_hours int;
  v_balance bigint;
  v_new_balance bigint;
  v_existing_qty int;
  v_existing_purchased_at timestamptz;
  v_row_exists boolean;
  v_next_allowed timestamptz;
begin
  if v_user is null then
    raise exception 'Non authentifié.';
  end if;

  select price_coins, name_fr, active, max_stock, repurchase_cooldown_hours
    into v_price, v_name_fr, v_active, v_max_stock, v_cooldown_hours
    from public.store_artifacts where id = p_artifact_id
    for update;

  if not found or not v_active then
    raise exception 'Cet artefact n''est pas disponible.';
  end if;

  select quantity, purchased_at into v_existing_qty, v_existing_purchased_at
    from public.player_artifacts where user_id = v_user and artifact_id = p_artifact_id
    for update;
  v_row_exists := found;

  if v_row_exists then
    if v_max_stock is null then
      raise exception 'Vous possédez déjà cet artefact.';
    end if;
    if v_existing_qty >= v_max_stock then
      raise exception 'Stock déjà au maximum pour cet artefact.';
    end if;
    v_next_allowed := v_existing_purchased_at + make_interval(hours => coalesce(v_cooldown_hours, 0));
    if now() < v_next_allowed then
      raise exception 'Prochain achat possible le %.', to_char(v_next_allowed, 'DD/MM/YYYY à HH24:MI');
    end if;
  end if;

  select loup_coins into v_balance from public.profiles where id = v_user for update;
  if coalesce(v_balance, 0) < v_price then
    raise exception 'Solde de Loup Coins insuffisant.';
  end if;

  update public.profiles set loup_coins = loup_coins - v_price where id = v_user
    returning loup_coins into v_new_balance;

  if v_row_exists then
    update public.player_artifacts
    set quantity = quantity + 1, purchased_at = now()
    where user_id = v_user and artifact_id = p_artifact_id;
  else
    insert into public.player_artifacts (user_id, artifact_id, quantity, purchased_at)
    values (v_user, p_artifact_id, 1, now());
  end if;

  insert into public.loup_coins_transactions (user_id, amount, reason, label)
  values (v_user, -v_price, 'store_purchase', v_name_fr);

  return jsonb_build_object('artifact_id', p_artifact_id, 'new_balance', v_new_balance);
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
  ), '[]'::jsonb);
end;
$$;

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
    where pa.user_id = v_user
  ), '[]'::jsonb);
end;
$$;

-- create or replace function ne permet pas de renommer un paramètre
-- existant ("cannot change name of input parameter") — seuls le type et le
-- corps peuvent changer sans drop préalable. Types/ordre/nombre de
-- paramètres inchangés ici (seul le NOM du paramètre cooldown change), donc
-- un simple drop suffit, pas besoin de gérer les dépendances (aucune vue ni
-- autre fonction n'appelle celle-ci par son nom qualifié de types).
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

  -- Stock/cooldown : uniquement pertinents pour la catégorie "rares" — forcés
  -- à null pour toute autre catégorie, quoi que le client envoie, pour ne
  -- jamais laisser un artefact non-rare devenir rechargeable par erreur.
  -- Retour utilisateur (migration 0173) : le délai de rachat est désormais
  -- en HEURES (au lieu de jours) et 0 est une valeur valide (rachat
  -- immédiat, jusqu'au stock max) — seul le stock maximum doit rester
  -- strictement positif.
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
      max_stock, repurchase_cooldown_hours, active
    )
    values (
      p_key, trim(p_name_fr), trim(p_name_en), trim(p_description_fr), trim(p_description_en), p_price_coins, p_category, p_effect_key,
      v_max_stock, v_cooldown, coalesce(p_active, true)
    )
    returning id into v_id;

    insert into public.admin_audit_log (admin_id, action, target, details)
    values (v_admin, 'create_store_artifact', v_id::text, jsonb_build_object('key', p_key, 'name_fr', p_name_fr));
  else
    -- `key` n'est jamais modifié ici, quoi que le client envoie dans
    -- p_key — voir migration 0148/0149.
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

-- Le drop function ci-dessus supprime aussi tous ses privilèges — sans ce
-- regrant, admin_upsert_store_artifact deviendrait immédiatement
-- inappelable depuis le client (erreur de permission au premier essai
-- d'enregistrement d'artefact dans le dashboard admin).
grant execute on function public.admin_upsert_store_artifact(uuid, text, text, text, text, text, int, text, text, int, int, boolean) to authenticated;