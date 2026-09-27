-- ============================================================================
-- La page admin "Événements" devient "Événements & Bannières" :
--
--   1. Un ÉVÉNEMENT peut désormais donner son bonus en Loup Coins plutôt
--      qu'en points de rang (bonus_currency) — jusqu'ici toujours des
--      points, appliqué dans apply_rank_result. Un bonus en coins ne peut
--      être que "fixe" (pas de multiplicateur : il n'existe pas de "gain de
--      coins par victoire" de base à multiplier, contrairement aux points).
--
--   2. BANNIÈRE : nouveau type de contenu, plus simple qu'un événement —
--      juste une image, avec un lien optionnel (site externe ou page interne)
--      au clic. Aucun bonus de jeu, aucun texte superposé : c'est une pure
--      image cliquable.
--
--   3. Les deux partagent désormais le même emplacement de défilement sur le
--      tableau de bord (voir EventBannerCarousel côté client, renommé
--      PromoCarousel) — chacun avec sa propre durée d'affichage
--      (display_seconds), réglable depuis le dashboard au lieu d'une
--      constante fixe côté client.
-- ============================================================================
set search_path = public;

-- ----------------------------------------------------------------------------
-- 1. events : monnaie du bonus + durée d'affichage dans le carrousel.
-- ----------------------------------------------------------------------------
alter table public.events add column if not exists bonus_currency text not null default 'points'
  check (bonus_currency in ('points', 'coins'));
alter table public.events add column if not exists display_seconds int not null default 6
  check (display_seconds between 2 and 60);

-- Un bonus en coins ne peut être que "fixe" (voir note en tête de fichier) —
-- gardé en base plutôt qu'uniquement côté formulaire admin, pour ne jamais
-- se retrouver avec un événement "coins + multiplicateur" sans signification.
alter table public.events drop constraint if exists events_coins_bonus_flat_only;
alter table public.events add constraint events_coins_bonus_flat_only
  check (bonus_currency <> 'coins' or bonus_type in ('none', 'flat'));

create or replace function public.get_active_events()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(jsonb_agg(row_to_json(e) order by e.starts_at), '[]'::jsonb)
  from (
    select id, name, starts_at, ends_at, preview_starts_at, bonus_type, bonus_value, bonus_currency, display_seconds,
           banner_text_fr, banner_text_en, banner_color, banner_image_path, banner_image_path_en
    from public.events
    where is_enabled and now() between coalesce(preview_starts_at, starts_at) and ends_at
  ) e;
$$;

grant execute on function public.get_active_events() to anon, authenticated;

drop function if exists public.admin_upsert_event(uuid, text, timestamptz, timestamptz, text, numeric, text, text, text, boolean, timestamptz);

create or replace function public.admin_upsert_event(
  p_id uuid,
  p_name text,
  p_starts_at timestamptz,
  p_ends_at timestamptz,
  p_bonus_type text,
  p_bonus_value numeric,
  p_banner_text_fr text,
  p_banner_text_en text,
  p_banner_color text,
  p_is_enabled boolean,
  p_preview_starts_at timestamptz default null,
  p_bonus_currency text default 'points',
  p_display_seconds int default 6
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
  if p_name is null or length(trim(p_name)) = 0 then
    raise exception 'Nom requis.';
  end if;
  if p_ends_at <= p_starts_at then
    raise exception 'La date de fin doit être après la date de début.';
  end if;
  if p_preview_starts_at is not null and p_preview_starts_at > p_starts_at then
    raise exception 'L''aperçu doit commencer avant (ou en même temps que) le début de l''événement.';
  end if;
  if p_bonus_type not in ('none', 'flat', 'multiplier') then
    raise exception 'Type de bonus invalide.';
  end if;
  if p_bonus_currency not in ('points', 'coins') then
    raise exception 'Monnaie de bonus invalide.';
  end if;
  if p_bonus_currency = 'coins' and p_bonus_type = 'multiplier' then
    raise exception 'Un bonus en Loup Coins ne peut être que fixe, pas un multiplicateur.';
  end if;
  if p_banner_color not in ('gold', 'blood', 'emerald', 'violet') then
    raise exception 'Couleur de bannière invalide.';
  end if;
  if coalesce(p_display_seconds, 6) < 2 or coalesce(p_display_seconds, 6) > 60 then
    raise exception 'Durée d''affichage invalide (entre 2 et 60 secondes).';
  end if;

  if p_id is null then
    insert into public.events (
      name, starts_at, ends_at, preview_starts_at, bonus_type, bonus_value, bonus_currency, display_seconds,
      banner_text_fr, banner_text_en, banner_color, is_enabled, created_by
    ) values (
      trim(p_name), p_starts_at, p_ends_at, p_preview_starts_at, p_bonus_type, coalesce(p_bonus_value, 0),
      coalesce(p_bonus_currency, 'points'), coalesce(p_display_seconds, 6),
      coalesce(p_banner_text_fr, ''), coalesce(p_banner_text_en, ''), p_banner_color,
      coalesce(p_is_enabled, true), v_admin
    )
    returning id into v_id;

    insert into public.admin_audit_log (admin_id, action, target, details)
    values (v_admin, 'create_event', v_id::text, jsonb_build_object('name', p_name));
  else
    update public.events
    set name = trim(p_name),
        starts_at = p_starts_at,
        ends_at = p_ends_at,
        preview_starts_at = p_preview_starts_at,
        bonus_type = p_bonus_type,
        bonus_value = coalesce(p_bonus_value, 0),
        bonus_currency = coalesce(p_bonus_currency, 'points'),
        display_seconds = coalesce(p_display_seconds, 6),
        banner_text_fr = coalesce(p_banner_text_fr, ''),
        banner_text_en = coalesce(p_banner_text_en, ''),
        banner_color = p_banner_color,
        is_enabled = coalesce(p_is_enabled, true)
    where id = p_id
    returning id into v_id;

    if v_id is null then
      raise exception 'Événement introuvable.';
    end if;

    insert into public.admin_audit_log (admin_id, action, target, details)
    values (v_admin, 'update_event', v_id::text, jsonb_build_object('name', p_name));
  end if;

  return v_id;
end;
$$;

revoke execute on function public.admin_upsert_event(uuid, text, timestamptz, timestamptz, text, numeric, text, text, text, boolean, timestamptz, text, int) from public, anon;
grant execute on function public.admin_upsert_event(uuid, text, timestamptz, timestamptz, text, numeric, text, text, text, boolean, timestamptz, text, int) to authenticated;

-- ----------------------------------------------------------------------------
-- 2. apply_rank_result : un événement dont bonus_currency = 'coins' crédite
-- des Loup Coins (montant fixe par victoire, bonus_value) au lieu de
-- modifier les points de rang. Reprise à l'identique de la version 0159
-- pour tout le reste (aucun changement de comportement pour les événements
-- "points", toujours majoritaires).
-- ----------------------------------------------------------------------------
create or replace function public.apply_rank_result(
  p_user_id uuid, p_won boolean, p_participation_ratio numeric default 1, p_impact_bonus int default 0
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_points int;
  v_floor int;
  v_streak int;
  v_new_points int;
  v_new_streak int;
  v_new_floor int;
  v_streak_bonus int;
  v_tier_floor int;
  v_gain int;
  v_multiplier numeric := 1;
  v_flat_bonus int := 0;
  v_coins_bonus int := 0;
  v_event record;
  v_ratio numeric;
begin
  select rank_points, rank_floor, current_streak
    into v_points, v_floor, v_streak
  from public.profiles
  where id = p_user_id
  for update;

  if not found then
    return jsonb_build_object('gain', 0, 'new_points', 0, 'new_tier', 'nouveau_venu');
  end if;

  v_ratio := greatest(least(coalesce(p_participation_ratio, 1), 1), 0.4);

  if p_won then
    v_new_streak := v_streak + 1;
    v_streak_bonus := least((v_new_streak - 1) * 10, 50);

    for v_event in
      select bonus_type, bonus_value, bonus_currency, name from public.events
      where is_enabled and now() between starts_at and ends_at and bonus_type <> 'none'
    loop
      if v_event.bonus_currency = 'coins' then
        -- Voir contrainte events_coins_bonus_flat_only : toujours 'flat' ici.
        v_coins_bonus := v_coins_bonus + v_event.bonus_value::int;
      elsif v_event.bonus_type = 'multiplier' then
        v_multiplier := v_multiplier * v_event.bonus_value;
      elsif v_event.bonus_type = 'flat' then
        v_flat_bonus := v_flat_bonus + v_event.bonus_value::int;
      end if;
    end loop;

    v_gain := round((30 * v_ratio + v_streak_bonus) * v_multiplier) + v_flat_bonus + coalesce(p_impact_bonus, 0);
    v_new_points := v_points + v_gain;
  else
    v_new_streak := 0;
    v_new_points := greatest(v_points - 15 + coalesce(p_impact_bonus, 0), v_floor);
    v_gain := v_new_points - v_points;
  end if;

  v_tier_floor := case
    when v_new_points >= 15000 then 15000
    when v_new_points >= 11000 then 11000
    when v_new_points >= 8500 then 8500
    when v_new_points >= 6400 then 6400
    when v_new_points >= 4800 then 4800
    when v_new_points >= 3600 then 3600
    when v_new_points >= 2700 then 2700
    when v_new_points >= 2000 then 2000
    when v_new_points >= 1500 then 1500
    when v_new_points >= 1100 then 1100
    when v_new_points >= 800 then 800
    when v_new_points >= 550 then 550
    when v_new_points >= 350 then 350
    when v_new_points >= 200 then 200
    when v_new_points >= 100 then 100
    else 0
  end;
  v_new_floor := greatest(v_floor, v_tier_floor);

  update public.profiles
  set rank_points = v_new_points,
      rank_floor = v_new_floor,
      current_streak = v_new_streak,
      best_streak = greatest(best_streak, v_new_streak),
      rank_games_played = rank_games_played + 1,
      rank_wins = rank_wins + (case when p_won then 1 else 0 end),
      loup_coins = loup_coins + v_coins_bonus
  where id = p_user_id;

  if v_coins_bonus > 0 then
    insert into public.loup_coins_transactions (user_id, amount, reason, label)
    values (p_user_id, v_coins_bonus, 'event_bonus', 'Bonus d''événement');
  end if;

  return jsonb_build_object(
    'gain', v_gain,
    'new_points', v_new_points,
    'new_tier', public.rank_tier_for_points(v_new_points),
    'coins_gain', v_coins_bonus
  );
end;
$$;

-- ----------------------------------------------------------------------------
-- 3. banners : image cliquable simple, sans bonus de jeu. Réutilise le
-- bucket de stockage "event-banners" déjà en place (mêmes contraintes de
-- format, pas besoin d'un second bucket) — noms de fichiers préfixés
-- "banner-" pour ne jamais entrer en collision avec ceux des événements.
-- ----------------------------------------------------------------------------
create table if not exists public.banners (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  image_path text,
  image_path_en text,
  link_url text,
  -- Période optionnelle (contrairement aux événements) : une bannière peut
  -- très bien n'avoir ni début ni fin, juste activée/désactivée à la main.
  starts_at timestamptz,
  ends_at timestamptz,
  display_seconds int not null default 6 check (display_seconds between 2 and 60),
  is_enabled boolean not null default true,
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  created_by uuid references public.profiles (id),
  constraint banners_period_check check (starts_at is null or ends_at is null or ends_at > starts_at)
);
create index if not exists banners_period_idx on public.banners (starts_at, ends_at);

alter table public.banners enable row level security;
revoke all on public.banners from anon, authenticated;

create or replace function public.get_active_banners()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(jsonb_agg(row_to_json(b) order by b.sort_order, b.created_at), '[]'::jsonb)
  from (
    select id, image_path, image_path_en, link_url, display_seconds
    from public.banners
    where is_enabled
      and (starts_at is null or now() >= starts_at)
      and (ends_at is null or now() < ends_at)
      and image_path is not null
  ) b;
$$;

revoke execute on function public.get_active_banners() from public, anon;
grant execute on function public.get_active_banners() to anon, authenticated;

create or replace function public.admin_list_banners()
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
    select jsonb_agg(row_to_json(b) order by b.sort_order, b.created_at desc) from public.banners b
  ), '[]'::jsonb);
end;
$$;

revoke execute on function public.admin_list_banners() from public, anon;
grant execute on function public.admin_list_banners() to authenticated;

create or replace function public.admin_upsert_banner(
  p_id uuid,
  p_name text,
  p_link_url text,
  p_starts_at timestamptz,
  p_ends_at timestamptz,
  p_display_seconds int,
  p_sort_order int,
  p_is_enabled boolean
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
  if p_name is null or length(trim(p_name)) = 0 then
    raise exception 'Nom requis.';
  end if;
  if p_starts_at is not null and p_ends_at is not null and p_ends_at <= p_starts_at then
    raise exception 'La date de fin doit être après la date de début.';
  end if;
  if coalesce(p_display_seconds, 6) < 2 or coalesce(p_display_seconds, 6) > 60 then
    raise exception 'Durée d''affichage invalide (entre 2 et 60 secondes).';
  end if;
  if p_link_url is not null and length(trim(p_link_url)) > 0
     and p_link_url !~ '^https?://' and p_link_url !~ '^/' then
    raise exception 'Le lien doit commencer par http://, https:// ou / (page interne).';
  end if;

  if p_id is null then
    insert into public.banners (name, link_url, starts_at, ends_at, display_seconds, sort_order, is_enabled, created_by)
    values (
      trim(p_name), nullif(trim(coalesce(p_link_url, '')), ''), p_starts_at, p_ends_at,
      coalesce(p_display_seconds, 6), coalesce(p_sort_order, 0), coalesce(p_is_enabled, true), v_admin
    )
    returning id into v_id;

    insert into public.admin_audit_log (admin_id, action, target, details)
    values (v_admin, 'create_banner', v_id::text, jsonb_build_object('name', p_name));
  else
    update public.banners
    set name = trim(p_name),
        link_url = nullif(trim(coalesce(p_link_url, '')), ''),
        starts_at = p_starts_at,
        ends_at = p_ends_at,
        display_seconds = coalesce(p_display_seconds, 6),
        sort_order = coalesce(p_sort_order, 0),
        is_enabled = coalesce(p_is_enabled, true)
    where id = p_id
    returning id into v_id;

    if v_id is null then
      raise exception 'Bannière introuvable.';
    end if;

    insert into public.admin_audit_log (admin_id, action, target, details)
    values (v_admin, 'update_banner', v_id::text, jsonb_build_object('name', p_name));
  end if;

  return v_id;
end;
$$;

revoke execute on function public.admin_upsert_banner(uuid, text, text, timestamptz, timestamptz, int, int, boolean) from public, anon;
grant execute on function public.admin_upsert_banner(uuid, text, text, timestamptz, timestamptz, int, int, boolean) to authenticated;

create or replace function public.admin_delete_banner(p_id uuid)
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

  delete from public.banners where id = p_id;

  insert into public.admin_audit_log (admin_id, action, target, details)
  values (v_admin, 'delete_banner', p_id::text, null);
end;
$$;

revoke execute on function public.admin_delete_banner(uuid) from public, anon;
grant execute on function public.admin_delete_banner(uuid) to authenticated;

create or replace function public.admin_set_banner_image(p_id uuid, p_path text, p_lang text default 'fr')
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
  if p_lang not in ('fr', 'en') then
    raise exception 'Langue invalide.';
  end if;

  if p_lang = 'fr' then
    update public.banners set image_path = p_path where id = p_id;
  else
    update public.banners set image_path_en = p_path where id = p_id;
  end if;
end;
$$;

revoke execute on function public.admin_set_banner_image(uuid, text, text) from public, anon;
grant execute on function public.admin_set_banner_image(uuid, text, text) to authenticated;
