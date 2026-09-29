-- Annonce automatique du lancement d'une saison, demandée par l'hôte :
--   1. Notification push à tout le monde, programmée pour la date de début
--      de la saison (`starts_at`) — créée automatiquement dès que l'admin
--      crée la saison (admin_upsert_season, chemin insertion uniquement,
--      jamais sur une simple modification). Reprend le système de
--      campagnes déjà existant (migration 0129) : le cron quotidien
--      (api/cron-send-campaigns.ts, 08h00 UTC) l'envoie dès qu'elle est due
--      — précision à la journée, pas à la minute (limite de Vercel Cron
--      sur le plan actuel).
--   2. Popup "vu une seule fois" pour tout joueur qui ouvre l'appli pendant
--      qu'une saison est active — même mécanisme que l'annonce des avatars
--      (announcement_views, migration 0194), géré côté client dans
--      AnnouncementsModal.tsx (aucun changement SQL nécessaire pour ça :
--      get_my_season()/get_my_seen_announcements()/mark_announcement_seen()
--      existent déjà tels quels).
set search_path = public;

create or replace function public.admin_upsert_season(
  p_id uuid,
  p_slug text,
  p_name_fr text,
  p_name_en text,
  p_theme_color text,
  p_starts_at timestamptz,
  p_ends_at timestamptz,
  p_xp_per_game_played int,
  p_xp_per_game_won int,
  p_xp_per_quest_claim int,
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
  if p_name_fr is null or length(trim(p_name_fr)) = 0 or p_name_en is null or length(trim(p_name_en)) = 0 then
    raise exception 'Nom requis (FR et EN).';
  end if;
  if p_ends_at <= p_starts_at then
    raise exception 'La date de fin doit être après la date de début.';
  end if;
  if p_theme_color not in ('blush', 'gold', 'blood', 'emerald', 'violet') then
    raise exception 'Couleur de thème invalide.';
  end if;
  if coalesce(p_xp_per_game_played, -1) < 0 or coalesce(p_xp_per_game_won, -1) < 0 or coalesce(p_xp_per_quest_claim, -1) < 0 then
    raise exception 'Les valeurs d''XP ne peuvent pas être négatives.';
  end if;

  if p_id is null then
    if p_slug is null or p_slug !~ '^[a-z0-9-]+$' then
      raise exception 'Identifiant technique invalide (minuscules, chiffres, tirets uniquement).';
    end if;
    if exists (select 1 from public.seasons where slug = p_slug) then
      raise exception 'Cet identifiant technique est déjà utilisé.';
    end if;

    insert into public.seasons (
      slug, name_fr, name_en, theme_color, starts_at, ends_at,
      xp_per_game_played, xp_per_game_won, xp_per_quest_claim, is_enabled, created_by
    ) values (
      p_slug, trim(p_name_fr), trim(p_name_en), p_theme_color, p_starts_at, p_ends_at,
      coalesce(p_xp_per_game_played, 10), coalesce(p_xp_per_game_won, 15), coalesce(p_xp_per_quest_claim, 20),
      coalesce(p_is_enabled, true), v_admin
    )
    returning id into v_id;

    insert into public.admin_audit_log (admin_id, action, target, details)
    values (v_admin, 'create_season', v_id::text, jsonb_build_object('name_fr', p_name_fr));

    -- Campagne push programmée pour le jour de lancement — seulement si la
    -- saison est activée d'entrée (une saison créée désactivée n'a encore
    -- rien à annoncer).
    if coalesce(p_is_enabled, true) then
      perform public.admin_create_notification_campaign(
        '🍂 ' || trim(p_name_fr) || ' est arrivée !',
        'De nouvelles récompenses vous attendent : jouez pour gagner de l''XP et débloquer les paliers de la saison.',
        '/recompenses?tab=season',
        p_starts_at
      );
    end if;
  else
    update public.seasons
    set name_fr = trim(p_name_fr),
        name_en = trim(p_name_en),
        theme_color = p_theme_color,
        starts_at = p_starts_at,
        ends_at = p_ends_at,
        xp_per_game_played = coalesce(p_xp_per_game_played, 10),
        xp_per_game_won = coalesce(p_xp_per_game_won, 15),
        xp_per_quest_claim = coalesce(p_xp_per_quest_claim, 20),
        is_enabled = coalesce(p_is_enabled, true)
    where id = p_id
    returning id into v_id;

    if v_id is null then
      raise exception 'Saison introuvable.';
    end if;

    insert into public.admin_audit_log (admin_id, action, target, details)
    values (v_admin, 'update_season', v_id::text, jsonb_build_object('name_fr', p_name_fr));
  end if;

  return v_id;
end;
$$;

revoke execute on function public.admin_upsert_season(uuid, text, text, text, text, timestamptz, timestamptz, int, int, int, boolean) from public, anon;
grant execute on function public.admin_upsert_season(uuid, text, text, text, text, timestamptz, timestamptz, int, int, int, boolean) to authenticated;
