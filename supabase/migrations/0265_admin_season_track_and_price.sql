-- 0265 — Admin des saisons : la PISTE (gratuite / premium) de chaque palier, et le prix du pass.
--
--   * admin_list_season_tiers renvoie aussi 'track' (triés par palier, premium avant gratuit).
--   * admin_upsert_season_tier accepte p_track ('free' par défaut, donc les anciens appels restent valables). L'ancienne signature
--     à 9 paramètres est supprimée : sinon PostgREST verrait deux fonctions du même nom et refuserait l'appel (ambiguïté).
--   * Le prix du pass se règle avec admin_set_season_pass_price (migration 0260) ; admin_list_seasons le renvoie déjà
--     (pass_price_coins), car il lit toute la ligne de la saison.
-- À appliquer APRÈS 0264. Rejouable sans risque.
set search_path = public;

create or replace function public.admin_list_season_tiers(p_season_id uuid)
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
    select jsonb_agg(jsonb_build_object(
      'id', st.id, 'season_id', st.season_id, 'tier_number', st.tier_number, 'xp_required', st.xp_required,
      'reward_type', st.reward_type, 'reward_coins', st.reward_coins, 'reward_skin_id', st.reward_skin_id,
      'reward_skin_name', s.name_fr,
      'label_fr', st.label_fr, 'label_en', st.label_en,
      'track', st.track
    ) order by st.tier_number, st.track desc)
    from public.season_tiers st
    left join public.store_skins s on s.id = st.reward_skin_id
    where st.season_id = p_season_id
  ), '[]'::jsonb);
end;
$$;
revoke execute on function public.admin_list_season_tiers(uuid) from public, anon;
grant execute on function public.admin_list_season_tiers(uuid) to authenticated;

drop function if exists public.admin_upsert_season_tier(uuid, uuid, int, int, text, int, uuid, text, text);

create or replace function public.admin_upsert_season_tier(
  p_id uuid,
  p_season_id uuid,
  p_tier_number int,
  p_xp_required int,
  p_reward_type text,
  p_reward_coins int,
  p_reward_skin_id uuid,
  p_label_fr text,
  p_label_en text,
  p_track text default 'free'
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
  if p_tier_number is null or p_tier_number <= 0 then
    raise exception 'Numéro de palier invalide.';
  end if;
  if p_xp_required is null or p_xp_required < 0 then
    raise exception 'Seuil d''XP invalide.';
  end if;
  if p_reward_type not in ('coins', 'skin') then
    raise exception 'Type de récompense invalide.';
  end if;
  if p_label_fr is null or length(trim(p_label_fr)) = 0 or p_label_en is null or length(trim(p_label_en)) = 0 then
    raise exception 'Libellé requis (FR et EN).';
  end if;
  if coalesce(p_track, 'free') not in ('free', 'premium') then
    raise exception 'Piste invalide.';
  end if;
  p_track := coalesce(p_track, 'free');

  if p_reward_type = 'coins' then
    if coalesce(p_reward_coins, 0) <= 0 then
      raise exception 'Le montant en Loup Coins doit être supérieur à 0.';
    end if;
    p_reward_skin_id := null;
  else
    if p_reward_skin_id is null or not exists (
      select 1 from public.store_skins where id = p_reward_skin_id and season_id = p_season_id
    ) then
      raise exception 'Choisis un skin rattaché à cette saison.';
    end if;
    p_reward_coins := null;
  end if;

  if p_id is null then
    insert into public.season_tiers (season_id, tier_number, xp_required, reward_type, reward_coins, reward_skin_id, label_fr, label_en, track)
    values (p_season_id, p_tier_number, p_xp_required, p_reward_type, p_reward_coins, p_reward_skin_id, trim(p_label_fr), trim(p_label_en), p_track)
    returning id into v_id;

    insert into public.admin_audit_log (admin_id, action, target, details)
    values (v_admin, 'create_season_tier', v_id::text, jsonb_build_object('season_id', p_season_id, 'tier_number', p_tier_number, 'track', p_track));
  else
    update public.season_tiers
    set tier_number = p_tier_number,
        xp_required = p_xp_required,
        reward_type = p_reward_type,
        reward_coins = p_reward_coins,
        reward_skin_id = p_reward_skin_id,
        label_fr = trim(p_label_fr),
        label_en = trim(p_label_en),
        track = p_track
    where id = p_id and season_id = p_season_id
    returning id into v_id;

    if v_id is null then
      raise exception 'Palier introuvable.';
    end if;

    insert into public.admin_audit_log (admin_id, action, target, details)
    values (v_admin, 'update_season_tier', v_id::text, jsonb_build_object('tier_number', p_tier_number));
  end if;

  return v_id;
exception
  when unique_violation then
    raise exception 'Ce palier a déjà une récompense sur cette piste.';
end;
$$;

revoke execute on function public.admin_upsert_season_tier(uuid, uuid, int, int, text, int, uuid, text, text, text) from public, anon;
grant execute on function public.admin_upsert_season_tier(uuid, uuid, int, int, text, int, uuid, text, text, text) to authenticated;
