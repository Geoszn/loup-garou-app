-- ============================================================================
-- Aperçu ("hype") d'un événement avant son vrai début : la bannière peut
-- désormais devenir visible dès preview_starts_at, une date optionnelle
-- antérieure à starts_at, sans que le bonus de points ne s'active en avance
-- — apply_rank_result (migration 0073) continue de lire directement
-- starts_at/ends_at, jamais preview_starts_at, donc rien ne change côté
-- points. Seule get_active_events() (visibilité de la bannière) tient
-- compte de ce nouveau champ.
--
-- Note sur admin_upsert_event : en PostgreSQL, `create or replace function`
-- ne remplace une fonction existante que si la liste de TYPES de paramètres
-- est identique — ajouter un paramètre en plus (même avec une valeur par
-- défaut) crée une surcharge distincte plutôt que de remplacer l'ancienne
-- (voir 0046_fix_overloaded_rpc_grants.sql, qui a dû corriger exactement ce
-- piège pour create_game/send_chat_message). On supprime donc explicitement
-- l'ancienne signature à 10 paramètres avant de créer la nouvelle à 11, et on
-- ne grant que celle-ci — admin_upsert_event n'est appelée que par le
-- dashboard admin (mis à jour dans le même commit), pas besoin de garder
-- l'ancienne signature utilisable.
-- ============================================================================
set search_path = public;

alter table public.events
  add column if not exists preview_starts_at timestamptz;

alter table public.events
  drop constraint if exists events_preview_before_start;
alter table public.events
  add constraint events_preview_before_start
  check (preview_starts_at is null or preview_starts_at <= starts_at);

-- ----------------------------------------------------------------------------
-- get_active_events : inclut désormais un événement dès preview_starts_at
-- (si renseigné), pas seulement à partir de starts_at. Toujours 0 argument,
-- donc un simple `create or replace` remplace bien la même fonction ici
-- (contrairement à admin_upsert_event plus bas).
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
    select id, name, starts_at, ends_at, preview_starts_at, bonus_type, bonus_value,
           banner_text_fr, banner_text_en, banner_color, banner_image_path
    from public.events
    where is_enabled and now() between coalesce(preview_starts_at, starts_at) and ends_at
  ) e;
$$;

grant execute on function public.get_active_events() to anon, authenticated;

-- ----------------------------------------------------------------------------
-- admin_upsert_event : reprise de 0067, ajoute p_preview_starts_at (voir
-- note en tête de fichier sur pourquoi l'ancienne signature est supprimée
-- explicitement plutôt que remplacée).
-- ----------------------------------------------------------------------------
drop function if exists public.admin_upsert_event(uuid, text, timestamptz, timestamptz, text, numeric, text, text, text, boolean);

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
  p_preview_starts_at timestamptz default null
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
  if p_banner_color not in ('gold', 'blood', 'emerald', 'violet') then
    raise exception 'Couleur de bannière invalide.';
  end if;

  if p_id is null then
    insert into public.events (
      name, starts_at, ends_at, preview_starts_at, bonus_type, bonus_value,
      banner_text_fr, banner_text_en, banner_color, is_enabled, created_by
    ) values (
      trim(p_name), p_starts_at, p_ends_at, p_preview_starts_at, p_bonus_type, coalesce(p_bonus_value, 0),
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

grant execute on function public.admin_upsert_event(uuid, text, timestamptz, timestamptz, text, numeric, text, text, text, boolean, timestamptz) to authenticated;
