-- ============================================================================
-- Stock limité + cooldown de rachat pour les artefacts rares, et un nouveau
-- menu "Mes Artefacts" côté joueur pour suivre ce qu'il possède.
--
-- Jusqu'ici, TOUS les artefacts suivaient le même principe : achat unique,
-- possédé pour toujours, effet réutilisable à volonté dans chaque partie
-- future (une fois par partie pour les effets à déclenchement, voir
-- game_artifact_uses). Pour un artefact aussi fort que Pierre des Ancêtres
-- (une résurrection), ça revient à l'avoir gratuitement dans CHAQUE partie
-- dès le premier achat — demande explicite : limiter ça à un stock personnel
-- rechargeable, pas tous les 10 jours.
--
-- Portée : automatique pour toute la catégorie "rares" (`store_artifacts.
-- category = 'rares'`), pas un réglage séparé par artefact — n'importe quel
-- artefact catégorisé "Objets rares et légendaires" devient rechargeable
-- (au lieu d'achat unique) et voit son stock/délai de rachat réglables
-- depuis le dashboard admin. Toutes les autres catégories gardent
-- exactement le comportement actuel (achat unique, pour toujours).
--
-- `max_stock`/`repurchase_cooldown_days` pilotent l'ACHAT (purchase_artifact
-- ci-dessous). La CONSOMMATION du stock (décrémenter `quantity` quand
-- l'effet se déclenche vraiment en partie) reste séparée et doit être
-- ajoutée dans le code spécifique de CHAQUE effet — câblée ici uniquement
-- pour Pierre des Ancêtres (kill_player), le seul effet rare existant à ce
-- jour. Un futur effet rare qui ne décrémenterait pas `quantity` resterait
-- utilisable à volonté malgré son stock affiché — à ne pas oublier si un
-- nouvel effet rare est ajouté plus tard.
-- ============================================================================
set search_path = public;

-- ----------------------------------------------------------------------------
-- 1. Colonnes.
-- ----------------------------------------------------------------------------
alter table public.store_artifacts add column if not exists max_stock int;
alter table public.store_artifacts add column if not exists repurchase_cooldown_days int;

alter table public.store_artifacts drop constraint if exists store_artifacts_max_stock_check;
alter table public.store_artifacts add constraint store_artifacts_max_stock_check check (max_stock is null or max_stock > 0);

alter table public.store_artifacts drop constraint if exists store_artifacts_cooldown_check;
alter table public.store_artifacts add constraint store_artifacts_cooldown_check check (repurchase_cooldown_days is null or repurchase_cooldown_days > 0);

-- Un artefact "rares" déjà créé (avant cette migration) sans ces réglages
-- reçoit un stock de départ raisonnable plutôt que de rester bloqué à null
-- (achat unique) malgré sa catégorie — 1 unité, rachat tous les 10 jours,
-- modifiable ensuite depuis le dashboard.
update public.store_artifacts
set max_stock = coalesce(max_stock, 1), repurchase_cooldown_days = coalesce(repurchase_cooldown_days, 10)
where category = 'rares' and (max_stock is null or repurchase_cooldown_days is null);

-- `quantity` : stock actuellement disponible. Pour un artefact "classique"
-- (max_stock null), reste toujours à 1 — n'a alors aucun rôle fonctionnel,
-- purchase_artifact continue de bloquer tout rachat comme avant. Pour un
-- artefact "rares", chaque achat l'incrémente (jusqu'à max_stock) et chaque
-- utilisation en partie la décrémente (voir kill_player pour Pierre des
-- Ancêtres) — jamais supprimée en tombant à 0, l'artefact reste "possédé",
-- juste temporairement sans charge utilisable.
alter table public.player_artifacts add column if not exists quantity int not null default 1;

-- ----------------------------------------------------------------------------
-- 2. admin_upsert_store_artifact : nouveaux paramètres p_max_stock/
-- p_repurchase_cooldown_days (signature changée, drop explicite). Corrige au
-- passage un oubli de la migration 0152 : la liste d'effets acceptés ici
-- n'avait jamais été mise à jour avec les 5 nouveaux effets (seule la
-- contrainte CHECK en base l'avait été) — un admin choisissant l'un des 5
-- nouveaux effets dans le menu déroulant se serait vu opposer "Effet
-- invalide." malgré un choix parfaitement valide.
-- ----------------------------------------------------------------------------
drop function if exists public.admin_upsert_store_artifact(uuid, text, text, text, text, text, int, text, text, boolean);

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
  p_repurchase_cooldown_days int,
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
    'boussole_village', 'masque_sans_visage', 'balance_ange', 'pierre_ancetres', 'feu_sacre_ancetres'
  ) then
    raise exception 'Effet invalide.';
  end if;

  -- Stock/cooldown : uniquement pertinents pour la catégorie "rares" — forcés
  -- à null pour toute autre catégorie, quoi que le client envoie, pour ne
  -- jamais laisser un artefact non-rare devenir rechargeable par erreur.
  if p_category = 'rares' then
    v_max_stock := coalesce(p_max_stock, 1);
    v_cooldown := coalesce(p_repurchase_cooldown_days, 10);
    if v_max_stock <= 0 then
      raise exception 'Le stock maximum doit être supérieur à 0.';
    end if;
    if v_cooldown <= 0 then
      raise exception 'Le délai de rachat doit être supérieur à 0.';
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
      max_stock, repurchase_cooldown_days, active
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
        repurchase_cooldown_days = v_cooldown,
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

grant execute on function public.admin_upsert_store_artifact(uuid, text, text, text, text, text, int, text, text, int, int, boolean) to authenticated;

-- ----------------------------------------------------------------------------
-- 3. purchase_artifact : rachat autorisé pour un artefact à stock (max_stock
-- non nul), sous réserve du plafond de stock et du délai de rachat depuis le
-- dernier achat (purchased_at, réutilisé comme horodatage du DERNIER achat
-- plutôt que du premier). Comportement inchangé pour tout artefact classique
-- (max_stock null) : bloqué dès la première possession, comme avant.
-- ----------------------------------------------------------------------------
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
  v_cooldown_days int;
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

  select price_coins, name_fr, active, max_stock, repurchase_cooldown_days
    into v_price, v_name_fr, v_active, v_max_stock, v_cooldown_days
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
    v_next_allowed := v_existing_purchased_at + make_interval(days => coalesce(v_cooldown_days, 0));
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

grant execute on function public.purchase_artifact(uuid) to authenticated;

-- ----------------------------------------------------------------------------
-- 3bis. get_store_artifacts : expose le stock (max_stock/quantity) et un
-- indicateur `can_purchase` qui tient compte du rachat (au lieu du simple
-- `owned` qui, seul, ferait à tort passer un artefact à stock pour "déjà
-- possédé, plus achetable" côté client dès la première unité).
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
        else now() >= pa.purchased_at + make_interval(days => coalesce(sa.repurchase_cooldown_days, 0))
      end
    ) order by sa.price_coins asc)
    from public.store_artifacts sa
    left join public.player_artifacts pa on pa.artifact_id = sa.id and pa.user_id = v_user
    where sa.active = true
  ), '[]'::jsonb);
end;
$$;

grant execute on function public.get_store_artifacts() to authenticated;

-- ----------------------------------------------------------------------------
-- 4. Pierre des Ancêtres consomme désormais réellement une charge de stock à
-- chaque déclenchement (`quantity > 0` requis, décrémentée d'une unité) —
-- reste par ailleurs limitée à une fois par partie (game_artifact_uses,
-- inchangé). Le reste de kill_player est identique à 0152.
-- ----------------------------------------------------------------------------
create or replace function public.kill_player(p_game_id uuid, p_user_id uuid, p_cause text, p_night int)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_name text;
  v_role text;
  v_is_lover boolean;
  v_was_captain boolean;
  v_lover_id uuid;
  v_ancien_used boolean;
  v_wild_child_id uuid;
  v_any_wild_child_converted boolean := false;
  v_pierre_artifact_id uuid;
begin
  select role into v_role from public.game_roles_secret where game_id = p_game_id and user_id = p_user_id;

  if p_cause = 'loup_garou' and v_role = 'ancien' then
    select ancien_extra_life_used into v_ancien_used
    from public.game_roles_secret where game_id = p_game_id and user_id = p_user_id;

    if not coalesce(v_ancien_used, false) and exists (
      select 1 from public.game_players where game_id = p_game_id and user_id = p_user_id and is_alive
    ) then
      update public.game_roles_secret set ancien_extra_life_used = true
      where game_id = p_game_id and user_id = p_user_id;

      insert into public.game_log (game_id, message, night_number)
      select p_game_id, gp.display_name || ' (Ancien) encaisse l’attaque des Loups-Garous et s’accroche à la vie !', p_night
      from public.game_players gp where gp.game_id = p_game_id and gp.user_id = p_user_id;

      return;
    end if;
  end if;

  update public.game_players
  set is_alive = false, death_cause = p_cause, died_at_night = p_night, revealed_role = v_role
  where game_id = p_game_id and user_id = p_user_id and is_alive = true
  returning display_name, is_lover, is_captain into v_name, v_is_lover, v_was_captain;

  if v_name is null then
    return; -- déjà mort, rien à faire
  end if;

  insert into public.game_log (game_id, message, night_number)
  values (p_game_id, v_name || ' (' || public.role_display_name(v_role) || ') ' || public.death_phrase(p_cause), p_night);

  -- Pierre des Ancêtres (migration 0152/0153) : ni secret ni instantané — la
  -- mort ci-dessus vient d'être annoncée normalement, le retour ne le sera
  -- qu'au prochain passage au jour (voir advance_phase, boucle sur
  -- pending_revival). Exclu du bûcher/kick de l'hôte ('exclu' n'est de
  -- toute façon jamais une cause passée à kill_player). Une charge de stock
  -- consommée (quantity > 0 requis), en plus de la limite d'une fois par
  -- partie (game_artifact_uses) déjà en place.
  if p_cause <> 'exclu' then
    select pa.artifact_id into v_pierre_artifact_id
    from public.player_artifacts pa
    join public.store_artifacts sa on sa.id = pa.artifact_id
    where pa.user_id = p_user_id and sa.effect_key = 'pierre_ancetres' and pa.quantity > 0
      and not exists (
        select 1 from public.game_artifact_uses gau
        where gau.game_id = p_game_id and gau.user_id = p_user_id and gau.artifact_id = pa.artifact_id
      )
    limit 1;

    if v_pierre_artifact_id is not null then
      update public.game_players set pending_revival = true
      where game_id = p_game_id and user_id = p_user_id;

      update public.player_artifacts set quantity = quantity - 1
      where user_id = p_user_id and artifact_id = v_pierre_artifact_id;

      insert into public.game_artifact_uses (game_id, user_id, artifact_id)
      values (p_game_id, p_user_id, v_pierre_artifact_id);
    end if;
  end if;

  if v_role = 'ancien' and p_cause = 'vote' then
    update public.games set village_powers_disabled = true where id = p_game_id;
    insert into public.game_log (game_id, message, night_number)
    values (p_game_id, '⚖️ Le village a eu tort de lyncher l’Ancien : ses pouvoirs spéciaux s’éteignent pour le reste de la partie...', p_night);
  end if;

  -- Un Enfant Sauvage vivant avait choisi cette victime comme mentor : il
  -- rejoint immédiatement et définitivement les Loups-Garous. Une boucle
  -- plutôt qu'un simple `if` : rien n'empêche plusieurs Enfants Sauvages
  -- d'avoir choisi le même mentor. Toujours aucun message nommant le joueur
  -- ni révélant son ancien rôle (wild_child_turned_at_night reste la seule
  -- trace privée, voir get_my_game_view) — seul le fait qu'UNE conversion a
  -- eu lieu cette nuit est maintenant annoncé publiquement, une fois, après
  -- la boucle.
  for v_wild_child_id in
    select rs.user_id
    from public.game_roles_secret rs
    join public.game_players gp on gp.game_id = rs.game_id and gp.user_id = rs.user_id
    where rs.game_id = p_game_id and rs.role = 'enfant_sauvage'
      and rs.wild_child_mentor = p_user_id and gp.is_alive
  loop
    update public.game_roles_secret
    set role = 'loup_garou', wild_child_turned_at_night = p_night
    where game_id = p_game_id and user_id = v_wild_child_id;
    v_any_wild_child_converted := true;
  end loop;

  if v_any_wild_child_converted then
    insert into public.game_log (game_id, message, night_number)
    values (p_game_id, '🌑 Une ombre a changé de camp cette nuit... un villageois a secrètement rejoint les Loups-Garous.', p_night);
  end if;

  if v_is_lover then
    select lover_with into v_lover_id from public.game_roles_secret where game_id = p_game_id and user_id = p_user_id;
    if v_lover_id is not null and exists (
      select 1 from public.game_players where game_id = p_game_id and user_id = v_lover_id and is_alive
    ) then
      perform public.kill_player(p_game_id, v_lover_id, 'chagrin', p_night);
    end if;
  end if;

  if v_role = 'chasseur' then
    update public.games
    set hunter_pending = p_user_id,
        hunter_context = case when status = 'day_vote' then 'day' else 'night' end
    where id = p_game_id and hunter_pending is null and not village_powers_disabled;
  end if;

  if v_was_captain then
    update public.games set captain_pending = p_user_id where id = p_game_id and captain_pending is null;
    insert into public.game_log (game_id, message, night_number)
    values (p_game_id, v_name || ' était le Capitaine : il ou elle désigne son successeur dans son dernier souffle.', p_night);
  end if;
end;
$$;

-- ----------------------------------------------------------------------------
-- 5. get_my_artifacts : nouveau menu joueur "Mes Artefacts" (Loup Store) —
-- tout ce qui est possédé, avec stock et prochaine date de rachat pour les
-- artefacts à stock.
-- ----------------------------------------------------------------------------
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
      'repurchase_cooldown_days', sa.repurchase_cooldown_days,
      'next_purchase_at', case
        when sa.max_stock is not null and sa.repurchase_cooldown_days is not null
        then pa.purchased_at + make_interval(days => sa.repurchase_cooldown_days)
        else null
      end
    ) order by sa.category, sa.name_fr)
    from public.player_artifacts pa
    join public.store_artifacts sa on sa.id = pa.artifact_id
    where pa.user_id = v_user
  ), '[]'::jsonb);
end;
$$;

grant execute on function public.get_my_artifacts() to authenticated;
