-- ============================================================================
-- Système d'événements, gérés depuis le dashboard admin (nom, période,
-- bonus, bannière). Pour l'instant :
--   - Un événement actif (is_enabled + now() entre starts_at/ends_at)
--     affiche une bannière sur la page d'accueil (get_active_events, lecture
--     publique — voir Landing.tsx).
--   - bonus_type peut valoir 'none' (juste une bannière, aucun effet de
--     jeu), 'flat' (bonus de points fixe ajouté à chaque victoire) ou
--     'multiplier' (multiplie le gain total de points par victoire, ex. 2 =
--     points doublés). D'autres types pourront être ajoutés plus tard (voir
--     apply_rank_result plus bas, qui ne connaît que ces deux-là pour
--     l'instant) sans casser les événements déjà créés.
--   - Bannière : texte bilingue (le site est FR/EN) + couleur parmi une
--     petite palette assortie au thème du jeu, + image optionnelle
--     (bucket "event-banners", même principe que "role-cards" — 0053).
-- ============================================================================
set search_path = public;

create table if not exists public.events (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  bonus_type text not null default 'none' check (bonus_type in ('none', 'flat', 'multiplier')),
  bonus_value numeric not null default 0,
  banner_text_fr text not null default '',
  banner_text_en text not null default '',
  banner_color text not null default 'gold' check (banner_color in ('gold', 'blood', 'emerald', 'violet')),
  -- Chemin de l'objet dans le bucket "event-banners" (ex. "{id}.jpg"), pas
  -- l'URL complète — reconstruite côté client via
  -- supabase.storage.from('event-banners').getPublicUrl(...), comme pour les
  -- illustrations de rôle (RoleImagesSection). Null tant qu'aucune image n'a
  -- été importée : la bannière reste alors un simple bandeau de couleur.
  banner_image_path text,
  is_enabled boolean not null default true,
  created_at timestamptz not null default now(),
  created_by uuid references public.profiles (id),
  constraint events_period_check check (ends_at > starts_at)
);
create index if not exists events_period_idx on public.events (starts_at, ends_at);

alter table public.events enable row level security;
-- Aucune policy client : lecture publique des événements actifs via
-- get_active_events(), gestion complète (liste, création, modification,
-- suppression) réservée à l'admin via les fonctions admin_* ci-dessous.

-- ----------------------------------------------------------------------------
-- get_active_events : seule porte d'entrée publique (anon + authenticated)
-- sur cette table — juste de quoi afficher la bannière, rien sur les
-- événements passés/futurs/désactivés.
-- ----------------------------------------------------------------------------
create or replace function public.get_active_events()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(jsonb_agg(row_to_json(e) order by e.starts_at), '[]'::jsonb)
  from (
    select id, name, starts_at, ends_at, bonus_type, bonus_value,
           banner_text_fr, banner_text_en, banner_color, banner_image_path
    from public.events
    where is_enabled and now() between starts_at and ends_at
  ) e;
$$;

grant execute on function public.get_active_events() to anon, authenticated;

-- ----------------------------------------------------------------------------
-- admin_list_events : tous les événements (passés, en cours, à venir,
-- désactivés) pour l'onglet "Événements" du dashboard.
-- ----------------------------------------------------------------------------
create or replace function public.admin_list_events()
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

  return coalesce((
    select jsonb_agg(row_to_json(e) order by e.starts_at desc) from public.events e
  ), '[]'::jsonb);
end;
$$;

grant execute on function public.admin_list_events() to authenticated;

-- ----------------------------------------------------------------------------
-- admin_upsert_event : création (p_id null) ou modification (p_id fourni)
-- d'un événement. Une seule fonction pour les deux, comme
-- admin_set_content_override — le formulaire du dashboard est le même dans
-- les deux cas.
-- ----------------------------------------------------------------------------
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
  if p_ends_at <= p_starts_at then
    raise exception 'La date de fin doit être après la date de début.';
  end if;
  if p_bonus_type not in ('none', 'flat', 'multiplier') then
    raise exception 'Type de bonus invalide.';
  end if;
  if p_banner_color not in ('gold', 'blood', 'emerald', 'violet') then
    raise exception 'Couleur de bannière invalide.';
  end if;

  if p_id is null then
    insert into public.events (
      name, starts_at, ends_at, bonus_type, bonus_value,
      banner_text_fr, banner_text_en, banner_color, is_enabled, created_by
    ) values (
      trim(p_name), p_starts_at, p_ends_at, p_bonus_type, coalesce(p_bonus_value, 0),
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
        bonus_type = p_bonus_type,
        bonus_value = coalesce(p_bonus_value, 0),
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

grant execute on function public.admin_upsert_event(uuid, text, timestamptz, timestamptz, text, numeric, text, text, text, boolean) to authenticated;

-- ----------------------------------------------------------------------------
-- admin_delete_event : suppression définitive. L'éventuelle image de
-- bannière reste dans le bucket "event-banners" (orphelinée) — volumes
-- négligeables, pas de nettoyage automatisé pour l'instant.
-- ----------------------------------------------------------------------------
create or replace function public.admin_delete_event(p_id uuid)
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

  delete from public.events where id = p_id;

  insert into public.admin_audit_log (admin_id, action, target, details)
  values (v_admin, 'delete_event', p_id::text, null);
end;
$$;

grant execute on function public.admin_delete_event(uuid) to authenticated;

-- ----------------------------------------------------------------------------
-- Bucket "event-banners" : même principe que "role-cards" (0053) — lecture
-- publique, écriture réservée aux comptes admin. Convention de nommage
-- laissée au client (ex. "{event_id}.jpg"), stockée dans banner_image_path.
-- ----------------------------------------------------------------------------
insert into storage.buckets (id, name, public)
values ('event-banners', 'event-banners', true)
on conflict (id) do nothing;

drop policy if exists "event-banners public read" on storage.objects;
create policy "event-banners public read"
  on storage.objects for select
  using (bucket_id = 'event-banners');

drop policy if exists "event-banners admin insert" on storage.objects;
create policy "event-banners admin insert"
  on storage.objects for insert
  with check (bucket_id = 'event-banners' and public.is_admin_user(auth.uid()));

drop policy if exists "event-banners admin update" on storage.objects;
create policy "event-banners admin update"
  on storage.objects for update
  using (bucket_id = 'event-banners' and public.is_admin_user(auth.uid()));

drop policy if exists "event-banners admin delete" on storage.objects;
create policy "event-banners admin delete"
  on storage.objects for delete
  using (bucket_id = 'event-banners' and public.is_admin_user(auth.uid()));

-- ----------------------------------------------------------------------------
-- admin_set_event_banner_image : enregistre le chemin de l'image tout juste
-- importée par le client (upload direct vers le bucket via supabase-js,
-- comme RoleImagesSection — cette fonction ne fait qu'associer le chemin à
-- l'événement, elle ne touche pas au bucket lui-même).
-- ----------------------------------------------------------------------------
create or replace function public.admin_set_event_banner_image(p_id uuid, p_path text)
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

  update public.events set banner_image_path = p_path where id = p_id;
end;
$$;

grant execute on function public.admin_set_event_banner_image(uuid, text) to authenticated;

-- ============================================================================
-- apply_rank_result : reprise de 0064_longer_progression_after_scout.sql,
-- avec application du bonus d'événement actif sur le gain de points d'une
-- victoire (aucun effet sur une défaite, ni sur le plancher rank_floor, qui
-- reste calculé sur les points réellement obtenus — un événement ne fait
-- donc jamais gagner un palier "gratuitement" au-delà des points gagnés).
-- Plusieurs événements actifs en même temps se cumulent : les multiplicateurs
-- se multiplient entre eux, les bonus fixes s'additionnent.
-- ============================================================================
create or replace function public.apply_rank_result(p_user_id uuid, p_won boolean)
returns void
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
  v_bonus int;
  v_tier_floor int;
  v_gain int;
  v_multiplier numeric := 1;
  v_flat_bonus int := 0;
  v_event record;
begin
  select rank_points, rank_floor, current_streak
    into v_points, v_floor, v_streak
  from public.profiles
  where id = p_user_id
  for update;

  if not found then
    return;
  end if;

  if p_won then
    v_new_streak := v_streak + 1;
    v_bonus := least((v_new_streak - 1) * 10, 50);

    for v_event in
      select bonus_type, bonus_value from public.events
      where is_enabled and now() between starts_at and ends_at and bonus_type <> 'none'
    loop
      if v_event.bonus_type = 'multiplier' then
        v_multiplier := v_multiplier * v_event.bonus_value;
      elsif v_event.bonus_type = 'flat' then
        v_flat_bonus := v_flat_bonus + v_event.bonus_value::int;
      end if;
    end loop;

    v_gain := round((30 + v_bonus) * v_multiplier) + v_flat_bonus;
    v_new_points := v_points + v_gain;
  else
    v_new_streak := 0;
    v_new_points := greatest(v_points - 15, v_floor);
  end if;

  v_tier_floor := case
    when v_new_points >= 2800 then 2800
    when v_new_points >= 1400 then 1400
    when v_new_points >= 600 then 600
    when v_new_points >= 250 then 250
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
      rank_wins = rank_wins + (case when p_won then 1 else 0 end)
  where id = p_user_id;
end;
$$;
