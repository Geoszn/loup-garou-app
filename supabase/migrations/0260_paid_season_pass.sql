-- 0260 — Pass de saison payant (piste gratuite + piste premium), en Loup Coins.
--
-- Principe : chaque palier peut avoir deux récompenses, une sur la piste GRATUITE (pour tous) et une sur la piste PREMIUM
-- (réservée à qui a acheté le pass). Les deux pistes partagent le même seuil d'XP. Le pass s'achète une fois par saison, en
-- Loup Coins ; l'acheter en cours de saison débloque d'un coup tous les paliers déjà atteints.
--   * seasons.pass_price_coins : prix du pass (NULL = pas de pass, comportement de la saison 1 inchangé).
--   * season_tiers.track : 'free' (par défaut, donc toutes les récompenses existantes restent gratuites) ou 'premium'.
--     L'unicité devient (saison, numéro de palier, piste) : un même palier peut porter une récompense par piste.
--   * season_passes : qui a acheté le pass de quelle saison (pas d'accès direct, lecture via get_my_season).
--   * purchase_season_pass : achat atomique (solde verrouillé, débit, écriture au grand livre, pass).
--   * claim_season_tier : refuse une récompense premium sans pass.
--   * get_my_season : ajoute le prix, la possession du pass, le solde du joueur et la piste de chaque palier.
--   * admin_set_season_pass_price / admin_set_season_tier_track : réglages sans migration. Les récompenses premium d'une saison
--     se créent par migration (voir 0261 pour « Noël au Village ») ; l'interface d'admin des paliers ne gère pas encore la piste.
-- Sans effet sur la saison 1 (aucun prix, aucune récompense premium). À appliquer APRÈS 0259. Rejouable sans risque.
set search_path = public;

alter table public.seasons add column if not exists pass_price_coins int;
alter table public.seasons drop constraint if exists seasons_pass_price_check;
alter table public.seasons add constraint seasons_pass_price_check check (pass_price_coins is null or pass_price_coins > 0);

alter table public.season_tiers add column if not exists track text not null default 'free';
alter table public.season_tiers drop constraint if exists season_tiers_track_check;
alter table public.season_tiers add constraint season_tiers_track_check check (track in ('free', 'premium'));

-- L'ancienne unicité (saison, numéro) est remplacée par (saison, numéro, piste).
do $$
declare
  r record;
begin
  for r in
    select c.conname
    from pg_constraint c
    where c.conrelid = 'public.season_tiers'::regclass
      and c.contype = 'u'
      and (select array_agg(a.attname order by a.attname) from pg_attribute a where a.attrelid = c.conrelid and a.attnum = any (c.conkey))
          = array['season_id', 'tier_number']::name[]
  loop
    execute format('alter table public.season_tiers drop constraint %I', r.conname);
  end loop;
end;
$$;
alter table public.season_tiers drop constraint if exists season_tiers_season_tier_track_key;
alter table public.season_tiers add constraint season_tiers_season_tier_track_key unique (season_id, tier_number, track);

create table if not exists public.season_passes (
  user_id uuid not null references public.profiles (id) on delete cascade,
  season_id uuid not null references public.seasons (id) on delete cascade,
  price_paid int not null check (price_paid > 0),
  purchased_at timestamptz not null default now(),
  primary key (user_id, season_id)
);
alter table public.season_passes enable row level security;
revoke all on public.season_passes from anon, authenticated;

-- ----------------------------------------------------------------------------
-- Achat du pass.
-- ----------------------------------------------------------------------------
create or replace function public.purchase_season_pass(p_season_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_season record;
  v_balance bigint;
  v_new bigint;
begin
  if v_user is null then
    raise exception 'Non authentifié.';
  end if;

  select * into v_season from public.seasons where id = p_season_id;
  if not found or not v_season.is_enabled or now() not between v_season.starts_at and v_season.ends_at then
    raise exception 'Cette saison n''est pas en cours.';
  end if;
  if v_season.pass_price_coins is null then
    raise exception 'Cette saison n''a pas de pass premium.';
  end if;
  if exists (select 1 from public.season_passes where user_id = v_user and season_id = p_season_id) then
    raise exception 'Tu as déjà le pass premium.';
  end if;

  -- Le solde est verrouillé le temps de l'achat : deux achats simultanés ne peuvent pas dépenser deux fois les mêmes coins.
  select loup_coins into v_balance from public.profiles where id = v_user for update;
  if coalesce(v_balance, 0) < v_season.pass_price_coins then
    raise exception 'Il te manque % Loup Coins pour obtenir le pass.', v_season.pass_price_coins - coalesce(v_balance, 0);
  end if;

  insert into public.season_passes (user_id, season_id, price_paid) values (v_user, p_season_id, v_season.pass_price_coins);

  update public.profiles set loup_coins = loup_coins - v_season.pass_price_coins where id = v_user
    returning loup_coins into v_new;

  insert into public.loup_coins_transactions (user_id, amount, reason, label)
  values (v_user, -v_season.pass_price_coins, 'season_pass', v_season.name_fr);

  return jsonb_build_object('price_paid', v_season.pass_price_coins, 'new_loup_coins', v_new);
exception
  when unique_violation then
    raise exception 'Tu as déjà le pass premium.';
end;
$$;
revoke execute on function public.purchase_season_pass(uuid) from public, anon;
grant execute on function public.purchase_season_pass(uuid) to authenticated;

-- ----------------------------------------------------------------------------
-- Réclamation : copie de 0203 + refus d'une récompense premium sans pass.
-- ----------------------------------------------------------------------------
create or replace function public.claim_season_tier(p_tier_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_tier record;
  v_xp int;
  v_new_coins bigint;
begin
  if v_user is null then
    raise exception 'Non authentifié.';
  end if;

  select * into v_tier from public.season_tiers where id = p_tier_id;
  if not found then
    raise exception 'Palier introuvable.';
  end if;

  select xp into v_xp from public.season_progress where user_id = v_user and season_id = v_tier.season_id;
  if coalesce(v_xp, 0) < v_tier.xp_required then
    raise exception 'Ce palier n''est pas encore débloqué.';
  end if;

  if v_tier.track = 'premium' and not exists (
    select 1 from public.season_passes where user_id = v_user and season_id = v_tier.season_id
  ) then
    raise exception 'Cette récompense est réservée au pass premium.';
  end if;

  -- Insertion d'abord : la clé primaire (user_id, tier_id) sert de verrou anti-double-réclamation.
  insert into public.season_tier_claims (user_id, tier_id) values (v_user, p_tier_id);

  if v_tier.reward_type = 'coins' then
    update public.profiles set loup_coins = loup_coins + v_tier.reward_coins
      where id = v_user
      returning loup_coins into v_new_coins;

    insert into public.loup_coins_transactions (user_id, amount, reason, label)
    values (v_user, v_tier.reward_coins, 'season_reward', v_tier.label_fr);

    return jsonb_build_object('reward_type', 'coins', 'reward_coins', v_tier.reward_coins, 'new_loup_coins', v_new_coins);
  else
    insert into public.player_skins (user_id, skin_id) values (v_user, v_tier.reward_skin_id)
      on conflict (user_id, skin_id) do nothing;

    return jsonb_build_object('reward_type', 'skin', 'reward_skin_id', v_tier.reward_skin_id);
  end if;
exception
  when unique_violation then
    raise exception 'Récompense déjà réclamée.';
end;
$$;
revoke execute on function public.claim_season_tier(uuid) from public, anon;
grant execute on function public.claim_season_tier(uuid) to authenticated;

-- ----------------------------------------------------------------------------
-- get_my_season : copie de 0210 + pass, solde, piste de chaque palier.
-- ----------------------------------------------------------------------------
create or replace function public.get_my_season()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_season record;
begin
  if v_user is null then
    raise exception 'Non authentifié.';
  end if;

  select * into v_season from public.seasons
  where is_enabled and now() between starts_at and ends_at
  order by starts_at desc
  limit 1;

  if not found then
    -- Aucune saison en cours : on montre quand même la dernière saison où ce
    -- joueur a un palier débloqué mais pas encore réclamé (voir 0203).
    select s.* into v_season
    from public.seasons s
    join public.season_progress sp on sp.season_id = s.id and sp.user_id = v_user
    where exists (
      select 1 from public.season_tiers st
      where st.season_id = s.id and st.xp_required <= sp.xp
        and (st.track = 'free' or exists (select 1 from public.season_passes pp where pp.user_id = v_user and pp.season_id = s.id))
        and not exists (select 1 from public.season_tier_claims c where c.tier_id = st.id and c.user_id = v_user)
    )
    order by s.ends_at desc
    limit 1;
  end if;

  if not found then
    return null;
  end if;

  return jsonb_build_object(
    'id', v_season.id,
    'slug', v_season.slug,
    'name_fr', v_season.name_fr,
    'name_en', v_season.name_en,
    'theme_color', v_season.theme_color,
    'starts_at', v_season.starts_at,
    'ends_at', v_season.ends_at,
    'is_active', now() between v_season.starts_at and v_season.ends_at,
    'xp_per_game_played', v_season.xp_per_game_played,
    'xp_per_game_won', v_season.xp_per_game_won,
    'xp_per_quest_claim', v_season.xp_per_quest_claim,
    'xp', coalesce((select xp from public.season_progress where user_id = v_user and season_id = v_season.id), 0),
    -- Pass premium (migration 0260) : prix (null = pas de pass), possession, solde du joueur pour l'écran d'achat.
    'pass_price_coins', v_season.pass_price_coins,
    'has_pass', exists (select 1 from public.season_passes sp where sp.user_id = v_user and sp.season_id = v_season.id),
    'my_loup_coins', coalesce((select p.loup_coins from public.profiles p where p.id = v_user), 0),
    'tiers', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', st.id,
        'tier_number', st.tier_number,
        'track', st.track,
        'xp_required', st.xp_required,
        'reward_type', st.reward_type,
        'reward_coins', st.reward_coins,
        'reward_skin', case when st.reward_skin_id is not null then jsonb_build_object(
          'id', s.id, 'name_fr', s.name_fr, 'name_en', s.name_en, 'rarity', s.rarity, 'config', s.config,
          'description_fr', s.description_fr, 'description_en', s.description_en, 'category', s.category
        ) end,
        'label_fr', st.label_fr,
        'label_en', st.label_en,
        'claimed', exists (select 1 from public.season_tier_claims c where c.tier_id = st.id and c.user_id = v_user)
      ) order by st.tier_number, st.track desc)
      from public.season_tiers st
      left join public.store_skins s on s.id = st.reward_skin_id
      where st.season_id = v_season.id
    ), '[]'::jsonb)
  );
end;
$$;

revoke execute on function public.get_my_season() from public, anon;
grant execute on function public.get_my_season() to authenticated;

-- ----------------------------------------------------------------------------
-- Réglages d'administration.
-- ----------------------------------------------------------------------------
create or replace function public.admin_set_season_pass_price(p_season_id uuid, p_price int)
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
  if p_price is not null and p_price <= 0 then
    raise exception 'Le prix du pass doit être supérieur à 0 (ou vide pour une saison sans pass).';
  end if;
  update public.seasons set pass_price_coins = p_price where id = p_season_id;
  if not found then
    raise exception 'Saison introuvable.';
  end if;
  insert into public.admin_audit_log (admin_id, action, target, details)
  values (v_admin, 'set_season_pass_price', p_season_id::text, jsonb_build_object('price', p_price));
end;
$$;
revoke execute on function public.admin_set_season_pass_price(uuid, int) from public, anon;
grant execute on function public.admin_set_season_pass_price(uuid, int) to authenticated;

create or replace function public.admin_set_season_tier_track(p_tier_id uuid, p_track text)
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
  if p_track not in ('free', 'premium') then
    raise exception 'Piste invalide.';
  end if;
  update public.season_tiers set track = p_track where id = p_tier_id;
  if not found then
    raise exception 'Palier introuvable.';
  end if;
  insert into public.admin_audit_log (admin_id, action, target, details)
  values (v_admin, 'set_season_tier_track', p_tier_id::text, jsonb_build_object('track', p_track));
end;
$$;
revoke execute on function public.admin_set_season_tier_track(uuid, text) from public, anon;
grant execute on function public.admin_set_season_tier_track(uuid, text) to authenticated;
