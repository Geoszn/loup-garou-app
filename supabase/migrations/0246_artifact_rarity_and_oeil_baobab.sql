-- Raretés et stock par joueur des artefacts, + premier artefact légendaire : L'Œil du Baobab.
--
--   * `rarity` (commun / rare / épique / légendaire) fixe le stock maximum qu'un joueur peut garder en réserve :
--     5 / 3 / 2 / 1 (artifact_stock_cap). Une contrainte de table l'impose pour tout artefact à stock, quelle que soit la
--     voie d'écriture (dashboard admin, migration, SQL).
--   * Plus de délai de rachat : seul le plafond freine les achats. On rachète dès qu'on a utilisé une charge.
--   * Les artefacts à stock existants (catégorie « rares ») reçoivent une rareté d'après leur effet ; leur stock n'est jamais
--     relevé par cette migration (au plus ramené au plafond de leur rareté).
--   * L'Œil du Baobab (effet 'oeil_baobab', légendaire, 1000 Loup Coins, stock max 1) : une fois par partie, de jour à partir du
--     2e jour, le joueur désigne 3 joueurs en vie et apprend en secret s'il y a au moins un Loup parmi eux ou aucun. Consomme
--     une charge. Le journal public note seulement « Quelqu'un a consulté l'Œil du Baobab » (sans nom).
-- À appliquer APRÈS 0244 (le point rouge « nouveauté » de la boutique). Rejouable sans risque.
set search_path = public;

-- 1. Rareté et plafond.
alter table public.store_artifacts add column if not exists rarity text not null default 'commun';
alter table public.store_artifacts drop constraint if exists store_artifacts_rarity_check;
alter table public.store_artifacts add constraint store_artifacts_rarity_check check (rarity in ('commun', 'rare', 'epique', 'legendaire'));

create or replace function public.artifact_stock_cap(p_rarity text)
returns int
language sql
immutable
as $$
  select case p_rarity when 'commun' then 5 when 'rare' then 3 when 'epique' then 2 else 1 end;
$$;

update public.store_artifacts set rarity = 'legendaire' where effect_key = 'pierre_ancetres';
update public.store_artifacts set rarity = 'epique' where effect_key in ('larme_renaissance', 'feu_sacre_ancetres');
update public.store_artifacts set rarity = 'rare' where effect_key in ('boussole_village', 'balance_ange', 'masque_sans_visage');

update public.store_artifacts
set max_stock = least(max_stock, public.artifact_stock_cap(rarity)),
    repurchase_cooldown_hours = 0
where max_stock is not null;

alter table public.store_artifacts drop constraint if exists store_artifacts_stock_cap_check;
alter table public.store_artifacts add constraint store_artifacts_stock_cap_check
  check (max_stock is null or max_stock <= public.artifact_stock_cap(rarity));

-- 2. Nouvel effet + résultat privé d'une utilisation.
alter table public.store_artifacts drop constraint if exists store_artifacts_effect_key_check;
alter table public.store_artifacts add constraint store_artifacts_effect_key_check
  check (effect_key in (
    'none', 'parchemin_griot', 'dernier_souffle', 'masque_griot', 'plume_anancy',
    'boussole_village', 'masque_sans_visage', 'balance_ange', 'pierre_ancetres', 'feu_sacre_ancetres',
    'larme_renaissance', 'oeil_baobab'
  ));

alter table public.game_artifact_uses add column if not exists meta jsonb;

-- 3. Catalogue.
insert into public.store_artifacts
  (key, name_fr, name_en, description_fr, description_en, price_coins, category, effect_key, rarity, max_stock, repurchase_cooldown_hours, active)
values (
  'oeil_baobab',
  'L''Œil du Baobab',
  'The Baobab''s Eye',
  'Une fois par partie, de jour (à partir du 2e jour), choisis 3 joueurs : l''Œil te révèle en secret s''il y a au moins un Loup parmi eux, ou aucun. Un indice, jamais une certitude. Chaque utilisation consomme une charge ; tu peux en garder 1 en réserve.',
  'Once per game, by day (from day 2), choose 3 players: the Eye secretly tells you whether there is at least one Wolf among them, or none. A clue, never a certainty. Each use consumes one charge; you can keep 1 in reserve.',
  1000, 'rares', 'oeil_baobab', 'legendaire', 1, 0, true
)
on conflict (key) do nothing;

-- 4. Catalogues côté joueur et côté admin : la rareté est renvoyée / modifiable.
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
      'rarity', sa.rarity,
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
      'rarity', sa.rarity,
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

drop function if exists public.admin_upsert_store_artifact(uuid, text, text, text, text, text, int, text, text, int, int, timestamptz, timestamptz, boolean);

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
  p_active boolean,
  p_rarity text default null
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
  v_rarity text;
  v_cap int;
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
    'larme_renaissance', 'oeil_baobab'
  ) then
    raise exception 'Effet invalide.';
  end if;
  if p_starts_at is not null and p_ends_at is not null and p_ends_at <= p_starts_at then
    raise exception 'La date de fin doit être après la date de début.';
  end if;

  -- Rareté : fixe le stock maximum qu'un joueur peut détenir (voir artifact_stock_cap). Non fournie à la modification =
  -- celle déjà enregistrée ; à la création = commun.
  v_rarity := p_rarity;
  if v_rarity is null and p_id is not null then
    select rarity into v_rarity from public.store_artifacts where id = p_id;
  end if;
  v_rarity := coalesce(v_rarity, 'commun');
  if v_rarity not in ('commun', 'rare', 'epique', 'legendaire') then
    raise exception 'Rareté invalide.';
  end if;
  v_cap := public.artifact_stock_cap(v_rarity);

  if p_category = 'rares' then
    v_max_stock := coalesce(p_max_stock, v_cap);
    -- Pas de délai de rachat par défaut : seul le plafond de stock freine les achats.
    v_cooldown := coalesce(p_repurchase_cooldown_hours, 0);
    if v_max_stock <= 0 then
      raise exception 'Le stock maximum doit être supérieur à 0.';
    end if;
    if v_max_stock > v_cap then
      raise exception 'Un artefact de rareté % plafonne le stock à % par joueur.', v_rarity, v_cap;
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
      max_stock, repurchase_cooldown_hours, starts_at, ends_at, active, rarity
    )
    values (
      p_key, trim(p_name_fr), trim(p_name_en), trim(p_description_fr), trim(p_description_en), p_price_coins, p_category, p_effect_key,
      v_max_stock, v_cooldown, p_starts_at, p_ends_at, coalesce(p_active, true), v_rarity
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
        active = coalesce(p_active, true),
        rarity = v_rarity
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

revoke execute on function public.admin_upsert_store_artifact(uuid, text, text, text, text, text, int, text, text, int, int, timestamptz, timestamptz, boolean, text) from public, anon;
grant execute on function public.admin_upsert_store_artifact(uuid, text, text, text, text, text, int, text, text, int, int, timestamptz, timestamptz, boolean, text) to authenticated;


-- 5. Utilisation : L'Œil du Baobab.
create or replace function public.use_oeil_baobab(p_game_id uuid, p_targets uuid[])
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_status text;
  v_night int;
  v_alive boolean;
  v_artifact_id uuid;
  v_qty int;
  v_targets uuid[];
  v_has_wolf boolean;
  v_meta jsonb;
begin
  if v_user is null then
    raise exception 'Non authentifié.';
  end if;

  select status, night_number into v_status, v_night from public.games where id = p_game_id;
  if v_status is null then
    raise exception 'Partie introuvable.';
  end if;
  if v_status <> 'day_discussion' then
    raise exception 'L''Œil du Baobab s''utilise pendant le débat du jour.';
  end if;
  if v_night < 2 then
    raise exception 'L''Œil du Baobab est disponible à partir du deuxième jour.';
  end if;

  select is_alive into v_alive from public.game_players where game_id = p_game_id and user_id = v_user;
  if v_alive is null then
    raise exception 'Vous ne participez pas à cette partie.';
  end if;
  if not v_alive then
    raise exception 'Réservé aux joueurs en vie.';
  end if;

  select array_agg(distinct t) into v_targets from unnest(p_targets) as t;
  if v_targets is null or cardinality(v_targets) <> 3 or v_user = any (v_targets) then
    raise exception 'Choisissez exactement 3 autres joueurs.';
  end if;
  if (
    select count(*) from public.game_players
    where game_id = p_game_id and is_alive and user_id = any (v_targets)
  ) <> 3 then
    raise exception 'Choisissez 3 joueurs en vie de cette partie.';
  end if;

  select pa.artifact_id, pa.quantity into v_artifact_id, v_qty
    from public.player_artifacts pa
    join public.store_artifacts sa on sa.id = pa.artifact_id
    where pa.user_id = v_user and sa.effect_key = 'oeil_baobab'
    for update of pa;
  if v_artifact_id is null or v_qty < 1 then
    raise exception 'Vous ne possédez pas cet artefact.';
  end if;

  if exists (
    select 1 from public.game_artifact_uses
    where game_id = p_game_id and user_id = v_user and artifact_id = v_artifact_id
  ) then
    raise exception 'Déjà utilisé dans cette partie.';
  end if;

  select exists (
    select 1 from public.game_roles_secret
    where game_id = p_game_id and user_id = any (v_targets)
      and role in ('loup_garou', 'loup_alpha', 'sans_visage', 'grand_mechant_loup', 'reine_louve')
  ) into v_has_wolf;

  v_meta := jsonb_build_object('targets', to_jsonb(v_targets), 'has_wolf', v_has_wolf);

  update public.player_artifacts set quantity = quantity - 1
    where user_id = v_user and artifact_id = v_artifact_id;
  insert into public.game_artifact_uses (game_id, user_id, artifact_id, round_number, meta)
    values (p_game_id, v_user, v_artifact_id, v_night, v_meta);
  insert into public.game_log (game_id, message, night_number, kind)
    values (p_game_id, '👁️ Quelqu’un a consulté l’Œil du Baobab.', v_night, 'artifact');

  return v_meta;
end;
$$;

revoke execute on function public.use_oeil_baobab(uuid, uuid[]) from public, anon;
grant execute on function public.use_oeil_baobab(uuid, uuid[]) to authenticated;

-- 6. L'état de l'artefact dans la vue de partie (voir get_my_game_view).
create or replace function public.game_view_artifacts_fields(p_game_id uuid, p_user uuid)
returns jsonb
language sql
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'my_owns_parchemin_griot', exists (
      select 1 from public.player_artifacts pa
      join public.store_artifacts sa on sa.id = pa.artifact_id
      where pa.user_id = p_user and sa.effect_key = 'parchemin_griot'
    ),

    'my_parchemin_griot_used', exists (
      select 1 from public.game_artifact_uses gau
      join public.store_artifacts sa on sa.id = gau.artifact_id
      where gau.game_id = p_game_id and gau.user_id = p_user and sa.effect_key = 'parchemin_griot'
    ),

    'my_owns_dernier_souffle', exists (
      select 1 from public.player_artifacts pa
      join public.store_artifacts sa on sa.id = pa.artifact_id
      where pa.user_id = p_user and sa.effect_key = 'dernier_souffle'
    ),

    'my_dernier_souffle_used', exists (
      select 1 from public.game_artifact_uses gau
      join public.store_artifacts sa on sa.id = gau.artifact_id
      where gau.game_id = p_game_id and gau.user_id = p_user and sa.effect_key = 'dernier_souffle'
    ),

    'vote_history', case when exists (
      select 1 from public.player_artifacts pa
      join public.store_artifacts sa on sa.id = pa.artifact_id
      where pa.user_id = p_user and sa.effect_key = 'boussole_village'
    ) then coalesce((
      select jsonb_agg(jsonb_build_object(
        'round_number', v.round_number, 'voter_id', v.voter_id, 'target_id', v.target_id
      ) order by v.round_number, v.voter_id)
      from public.votes v
      where v.game_id = p_game_id and v.round_number > 0
        and v.round_number < (select night_number from public.games where id = p_game_id)
        and v.target_id is not null
    ), '[]'::jsonb) else null end,

    -- L'Œil du Baobab (migration 0246) : charges restantes, et si on l'a déjà utilisé dans CETTE partie, son résultat privé.
    'my_oeil_baobab_stock', coalesce((
      select pa.quantity from public.player_artifacts pa
      join public.store_artifacts sa on sa.id = pa.artifact_id
      where pa.user_id = p_user and sa.effect_key = 'oeil_baobab'
    ), 0),

    'my_oeil_baobab_result', (
      select gau.meta from public.game_artifact_uses gau
      join public.store_artifacts sa on sa.id = gau.artifact_id
      where gau.game_id = p_game_id and gau.user_id = p_user and sa.effect_key = 'oeil_baobab'
    ),

    'feu_sacre_saved_me', exists (
      select 1 from public.game_artifact_uses gau
      join public.store_artifacts sa on sa.id = gau.artifact_id
      where gau.game_id = p_game_id and gau.user_id = p_user and sa.effect_key = 'feu_sacre_ancetres'
        and gau.round_number = (select night_number from public.games where id = p_game_id)
    )
  );
$$;
