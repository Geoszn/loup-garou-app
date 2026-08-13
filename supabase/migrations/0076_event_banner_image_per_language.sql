-- ============================================================================
-- Image de bannière distincte par langue (FR/EN) — jusqu'ici une seule image
-- (banner_image_path) servait aux deux publics, alors qu'elle contient
-- souvent un titre dessiné DANS l'image elle-même (ex. "LE WEEKEND DES
-- ROIS"), donc forcément dans une seule langue à la fois. banner_image_path
-- reste la colonne "FR / par défaut" (déjà utilisée en production, aucune
-- donnée existante à migrer) ; banner_image_path_en est nouvelle et
-- optionnelle — si absente, EventBanner.tsx retombe sur l'image FR, même
-- principe de repli que banner_text_fr/en déjà en place.
--
-- Note sur admin_set_event_banner_image : comme pour admin_upsert_event en
-- 0075, on supprime explicitement l'ancienne signature à 2 arguments avant
-- de créer la nouvelle à 3 (avec la langue), pour éviter le piège des
-- surcharges déjà rencontré en 0046_fix_overloaded_rpc_grants.sql.
-- ============================================================================
set search_path = public;

alter table public.events
  add column if not exists banner_image_path_en text;

-- ----------------------------------------------------------------------------
-- get_active_events : ajoute banner_image_path_en à la lecture publique.
-- Toujours 0 argument, `create or replace` remplace bien la même fonction.
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
           banner_text_fr, banner_text_en, banner_color, banner_image_path, banner_image_path_en
    from public.events
    where is_enabled and now() between coalesce(preview_starts_at, starts_at) and ends_at
  ) e;
$$;

grant execute on function public.get_active_events() to anon, authenticated;

-- ----------------------------------------------------------------------------
-- admin_set_event_banner_image : ajoute p_lang ('fr' | 'en') pour choisir la
-- colonne à mettre à jour.
-- ----------------------------------------------------------------------------
drop function if exists public.admin_set_event_banner_image(uuid, text);

create or replace function public.admin_set_event_banner_image(p_id uuid, p_path text, p_lang text default 'fr')
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
    update public.events set banner_image_path = p_path where id = p_id;
  else
    update public.events set banner_image_path_en = p_path where id = p_id;
  end if;
end;
$$;

grant execute on function public.admin_set_event_banner_image(uuid, text, text) to authenticated;
