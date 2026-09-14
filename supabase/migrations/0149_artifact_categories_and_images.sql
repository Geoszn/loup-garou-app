-- ============================================================================
-- Boutique du Loup Store : catégories + icônes réelles (au lieu d'emoji) pour
-- chaque artefact, gérées depuis l'onglet admin "Artefacts" — même patron
-- d'upload que les bannières d'événement (bucket "event-banners", migration
-- 0067) et les cartes de rôle (bucket "role-cards", migration 0053) :
-- l'image monte dans un bucket Storage public en lecture, écriture réservée
-- aux admins, et seul le CHEMIN (pas l'URL) est stocké en base — le client
-- reconstruit l'URL publique via supabase.storage.from(...).getPublicUrl(...).
--
-- Catégories (fermées, comme condition_key pour les quêtes) : reprennent les
-- 4 catégories du document de cadrage transmis par l'admin ("Outils
-- utilisables en partie", "Objets rares et légendaires", "Objets
-- cosmétiques", "Fragments et objets de collection").
--
-- Catalogue complété avec 4 nouveaux artefacts (tous créés INACTIFS,
-- l'admin les active lui-même une fois prêt — demande explicite) :
--   - Pierre des Ancêtres (rares) : AUCUN effet en jeu implémenté pour
--     l'instant. L'idée d'origine ("permet un retour exceptionnel en
--     partie") est une forme de résurrection — un vrai changement d'issue de
--     partie, à ne pas coder à la légère sans trancher d'abord son
--     équilibrage (voir la discussion pay-to-win menée avant de construire
--     Parchemin du Griot/Dernier Souffle). Catalogué ici pour que l'admin
--     puisse déjà voir/nommer/pricer l'objet, mais l'activer aujourd'hui
--     n'aurait aucun effet visible en jeu.
--   - Masque du Griot (cosmétiques), Plume d'Anancy (cosmétiques),
--     Griffe de la Meute (fragments) : purement cosmétiques/collection par
--     conception, mais leur AFFICHAGE (cadre de profil, titre sous le
--     pseudo, badge de collection) n'est pas encore câblé côté interface —
--     seuls le nom/la description/le prix existent pour l'instant. Même
--     remarque que ci-dessus : activer l'un de ces artefacts aujourd'hui le
--     rend achetable, mais ne change encore rien à l'affichage du joueur qui
--     l'achète.
-- ============================================================================
set search_path = public;

-- ----------------------------------------------------------------------------
-- 1. Catégories + image.
-- ----------------------------------------------------------------------------
alter table public.store_artifacts add column if not exists category text not null default 'outils';
alter table public.store_artifacts add column if not exists image_path text;

alter table public.store_artifacts drop constraint if exists store_artifacts_category_check;
alter table public.store_artifacts add constraint store_artifacts_category_check
  check (category in ('outils', 'rares', 'cosmetiques', 'fragments'));

update public.store_artifacts set category = 'outils' where key in ('parchemin_griot', 'dernier_souffle');

insert into public.store_artifacts (key, name_fr, name_en, description_fr, description_en, price_coins, category, active) values
  (
    'pierre_ancetres',
    'Pierre des Ancêtres',
    'Ancestors'' Stone',
    'Permet un retour exceptionnel en partie. Effet non encore implémenté — objet de catalogue uniquement pour l''instant.',
    'Allows an exceptional comeback in a game. Effect not implemented yet — catalog entry only for now.',
    150,
    'rares',
    false
  ),
  (
    'masque_griot',
    'Masque du Griot',
    'Griot''s Mask',
    'Un cadre de profil spécial, affiché autour de ton avatar. Affichage non encore implémenté — objet de catalogue uniquement pour l''instant.',
    'A special profile frame, displayed around your avatar. Display not implemented yet — catalog entry only for now.',
    50,
    'cosmetiques',
    false
  ),
  (
    'plume_anancy',
    'Plume d''Anancy',
    'Anancy''s Feather',
    'Un titre spécial affiché sous ton pseudo. Affichage non encore implémenté — objet de catalogue uniquement pour l''instant.',
    'A special title displayed under your username. Display not implemented yet — catalog entry only for now.',
    50,
    'cosmetiques',
    false
  ),
  (
    'griffe_meute',
    'Griffe de la Meute',
    'Pack''s Claw',
    'Un objet de collection rare, sans effet en jeu — un symbole de fierté pour qui l''obtient.',
    'A rare collectible, with no in-game effect — a symbol of pride for whoever gets it.',
    80,
    'fragments',
    false
  )
on conflict (key) do nothing;

-- ----------------------------------------------------------------------------
-- 2. Bucket Storage "artifact-icons" : même principe que "event-banners"
-- (migration 0067) — lecture publique, écriture réservée aux admins.
-- ----------------------------------------------------------------------------
insert into storage.buckets (id, name, public)
values ('artifact-icons', 'artifact-icons', true)
on conflict (id) do nothing;

drop policy if exists "artifact-icons public read" on storage.objects;
create policy "artifact-icons public read"
  on storage.objects for select
  using (bucket_id = 'artifact-icons');

drop policy if exists "artifact-icons admin insert" on storage.objects;
create policy "artifact-icons admin insert"
  on storage.objects for insert
  with check (bucket_id = 'artifact-icons' and public.is_admin_user(auth.uid()));

drop policy if exists "artifact-icons admin update" on storage.objects;
create policy "artifact-icons admin update"
  on storage.objects for update
  using (bucket_id = 'artifact-icons' and public.is_admin_user(auth.uid()));

drop policy if exists "artifact-icons admin delete" on storage.objects;
create policy "artifact-icons admin delete"
  on storage.objects for delete
  using (bucket_id = 'artifact-icons' and public.is_admin_user(auth.uid()));

create or replace function public.admin_set_artifact_image(p_id uuid, p_path text)
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

  update public.store_artifacts set image_path = p_path where id = p_id;
end;
$$;

grant execute on function public.admin_set_artifact_image(uuid, text) to authenticated;

-- ----------------------------------------------------------------------------
-- 3. get_store_artifacts (côté joueur) : ajoute category/image_path.
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
      'owned', exists (
        select 1 from public.player_artifacts pa where pa.user_id = v_user and pa.artifact_id = sa.id
      )
    ) order by sa.price_coins asc)
    from public.store_artifacts sa
    where sa.active = true
  ), '[]'::jsonb);
end;
$$;

grant execute on function public.get_store_artifacts() to authenticated;

-- ----------------------------------------------------------------------------
-- 4. admin_upsert_store_artifact : nouveau paramètre p_category. Signature
-- changée (nombre de paramètres) : drop explicite de l'ancienne avant de
-- recréer, même précaution que pour l'ajout de p_condition_role sur les
-- quêtes (migration 0146) — voir check-rpc-grants.mjs.
-- ----------------------------------------------------------------------------
drop function if exists public.admin_upsert_store_artifact(uuid, text, text, text, text, text, int, boolean);

create or replace function public.admin_upsert_store_artifact(
  p_id uuid,
  p_key text,
  p_name_fr text,
  p_name_en text,
  p_description_fr text,
  p_description_en text,
  p_price_coins int,
  p_category text,
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
  if coalesce(p_price_coins, -1) < 0 then
    raise exception 'Le prix ne peut pas être négatif.';
  end if;
  if p_category not in ('outils', 'rares', 'cosmetiques', 'fragments') then
    raise exception 'Catégorie invalide.';
  end if;

  if p_id is null then
    if p_key is null or p_key !~ '^[a-z0-9_]+$' then
      raise exception 'Identifiant technique invalide (minuscules, chiffres, underscore uniquement).';
    end if;
    if exists (select 1 from public.store_artifacts where key = p_key) then
      raise exception 'Cet identifiant technique est déjà utilisé.';
    end if;

    insert into public.store_artifacts (key, name_fr, name_en, description_fr, description_en, price_coins, category, active)
    values (p_key, trim(p_name_fr), trim(p_name_en), trim(p_description_fr), trim(p_description_en), p_price_coins, p_category, coalesce(p_active, true))
    returning id into v_id;

    insert into public.admin_audit_log (admin_id, action, target, details)
    values (v_admin, 'create_store_artifact', v_id::text, jsonb_build_object('key', p_key, 'name_fr', p_name_fr));
  else
    -- `key` n'est jamais modifié ici, quoi que le client envoie dans
    -- p_key : c'est l'identifiant que le moteur de jeu reconnaît
    -- (can_read_channel, send_last_words) — le changer casserait
    -- silencieusement l'effet en jeu d'un artefact existant.
    update public.store_artifacts
    set name_fr = trim(p_name_fr),
        name_en = trim(p_name_en),
        description_fr = trim(p_description_fr),
        description_en = trim(p_description_en),
        price_coins = p_price_coins,
        category = p_category,
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

grant execute on function public.admin_upsert_store_artifact(uuid, text, text, text, text, text, int, text, boolean) to authenticated;
