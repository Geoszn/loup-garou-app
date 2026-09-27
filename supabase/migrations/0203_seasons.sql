-- ============================================================================
-- SAISONS : nouveau système de progression saisonnière, en plus des
-- événements (bonus de partie) et des bannières (image cliquable) déjà en
-- place. Une saison dure une période donnée (25 jours pour la première),
-- met en avant un thème/une collaboration, et propose une piste de paliers
-- (comme un "battle pass") alimentée par de l'XP de saison gagné en jouant.
--
-- Décisions de conception (voir échange avec l'admin) :
--   - XP gagné par partie jouée (+bonus victoire) ET par quête réclamée —
--     deux points d'accroche déjà existants (apply_rank_result,
--     claim_quest_reward), aucun nouveau moteur de suivi.
--   - Paliers = mélange Loup Coins (paliers intermédiaires) + skins
--     exclusifs à la saison (paliers clés). Un skin lié à une saison
--     (store_skins.season_id) est retiré de la boutique normale
--     (list_store_skins) et n'est obtenable qu'en réclamant le palier
--     correspondant — jamais achetable, jamais reproposé après la saison
--     (exclusivité définitive, comme convenu).
--   - Un skin déjà réclamé reste possédé à vie, comme n'importe quel autre
--     skin (aucune suppression après la fin de la saison).
--   - Pas de palier "payant" séparé : une seule piste, gratuite, cohérente
--     avec le reste du jeu (aucune monétisation par ailleurs).
--
-- Première saison : "Octobre Rose × Barbie" (1er → 26 octobre 2026), avec
-- 5 skins exclusifs répartis sur 20 paliers (voir section 8 ci-dessous).
-- ============================================================================
set search_path = public;

-- ----------------------------------------------------------------------------
-- 1. seasons
-- ----------------------------------------------------------------------------
create table if not exists public.seasons (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  name_fr text not null,
  name_en text not null,
  theme_color text not null default 'blush' check (theme_color in ('blush', 'gold', 'blood', 'emerald', 'violet')),
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  -- XP de saison accordé par grant_season_xp (section 6) — réglable par
  -- saison sans nouvelle migration, comme les paramètres d'un événement.
  xp_per_game_played int not null default 10 check (xp_per_game_played >= 0),
  xp_per_game_won int not null default 15 check (xp_per_game_won >= 0),
  xp_per_quest_claim int not null default 20 check (xp_per_quest_claim >= 0),
  is_enabled boolean not null default true,
  created_at timestamptz not null default now(),
  created_by uuid references public.profiles (id),
  constraint seasons_period_check check (ends_at > starts_at)
);
create index if not exists seasons_period_idx on public.seasons (starts_at, ends_at);

alter table public.seasons enable row level security;
revoke all on public.seasons from anon, authenticated;

-- ----------------------------------------------------------------------------
-- 2. season_tiers — paliers séquentiels d'une saison, seuil d'XP cumulatif.
-- ----------------------------------------------------------------------------
create table if not exists public.season_tiers (
  id uuid primary key default gen_random_uuid(),
  season_id uuid not null references public.seasons (id) on delete cascade,
  tier_number int not null check (tier_number > 0),
  xp_required int not null check (xp_required >= 0),
  reward_type text not null check (reward_type in ('coins', 'skin')),
  reward_coins int check (reward_coins > 0),
  reward_skin_id uuid references public.store_skins (id),
  label_fr text not null,
  label_en text not null,
  unique (season_id, tier_number),
  constraint season_tiers_reward_shape check (
    (reward_type = 'coins' and reward_coins is not null and reward_skin_id is null) or
    (reward_type = 'skin' and reward_skin_id is not null and reward_coins is null)
  )
);

alter table public.season_tiers enable row level security;
revoke all on public.season_tiers from anon, authenticated;

-- ----------------------------------------------------------------------------
-- 3. season_progress — XP cumulé d'un joueur pour une saison donnée.
-- ----------------------------------------------------------------------------
create table if not exists public.season_progress (
  user_id uuid not null references public.profiles (id) on delete cascade,
  season_id uuid not null references public.seasons (id) on delete cascade,
  xp int not null default 0,
  primary key (user_id, season_id)
);

alter table public.season_progress enable row level security;
revoke all on public.season_progress from anon, authenticated;

-- ----------------------------------------------------------------------------
-- 4. season_tier_claims — quel palier un joueur a réclamé. Sert aussi de
-- verrou anti-double-réclamation (clé primaire) : voir claim_season_tier.
-- ----------------------------------------------------------------------------
create table if not exists public.season_tier_claims (
  user_id uuid not null references public.profiles (id) on delete cascade,
  tier_id uuid not null references public.season_tiers (id) on delete cascade,
  claimed_at timestamptz not null default now(),
  primary key (user_id, tier_id)
);

alter table public.season_tier_claims enable row level security;
revoke all on public.season_tier_claims from anon, authenticated;

-- ----------------------------------------------------------------------------
-- 5. store_skins : un skin peut être rattaché à une saison (exclusif,
-- jamais dans la boutique normale). Le prix n'a alors aucun sens (jamais
-- acheté) — la contrainte est assouplie à >= 0 plutôt que > 0.
-- ----------------------------------------------------------------------------
alter table public.store_skins add column if not exists season_id uuid references public.seasons (id);
alter table public.store_skins drop constraint if exists store_skins_price_coins_check;
alter table public.store_skins add constraint store_skins_price_coins_check check (price_coins >= 0);

create or replace function public.list_store_skins()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', s.id, 'category', s.category, 'rarity', s.rarity,
    'name_fr', s.name_fr, 'name_en', s.name_en,
    'description_fr', s.description_fr, 'description_en', s.description_en,
    'price_coins', s.price_coins, 'config', s.config,
    'ends_at', s.ends_at,
    'owned', exists (select 1 from public.player_skins ps where ps.skin_id = s.id and ps.user_id = auth.uid())
  ) order by s.sort_order, s.created_at), '[]'::jsonb)
  from public.store_skins s
  where (
    -- Un skin de saison n'apparaît JAMAIS dans la boutique normale, même
    -- actif — seul admin_upsert_season_tier/claim_season_tier peut
    -- l'attribuer. Un skin déjà possédé (offert par une saison passée)
    -- reste renvoyé via la clause exists ci-dessous, comme aujourd'hui.
    s.season_id is null
    and s.is_active
    and (s.starts_at is null or s.starts_at <= now())
    and (s.ends_at is null or s.ends_at > now())
  )
  or exists (select 1 from public.player_skins ps where ps.skin_id = s.id and ps.user_id = auth.uid());
$$;

drop function if exists public.admin_upsert_store_skin(uuid, text, text, text, text, text, text, text, int, jsonb, int, timestamptz, timestamptz, boolean);

create or replace function public.admin_upsert_store_skin(
  p_id uuid,
  p_slug text,
  p_category text,
  p_rarity text,
  p_name_fr text,
  p_name_en text,
  p_description_fr text,
  p_description_en text,
  p_price_coins int,
  p_config jsonb,
  p_sort_order int,
  p_starts_at timestamptz,
  p_ends_at timestamptz,
  p_active boolean,
  p_season_id uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_admin uuid := auth.uid();
  v_id uuid;
  v_price int;
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
  if p_category not in ('tenues', 'coiffures', 'chapeaux', 'packs') then
    raise exception 'Catégorie invalide.';
  end if;
  if p_rarity not in ('commun', 'rare', 'epique', 'legendaire') then
    raise exception 'Rareté invalide.';
  end if;
  if p_config is null or p_config = '{}'::jsonb then
    raise exception 'Le skin doit modifier au moins une pièce d''avatar.';
  end if;
  if p_starts_at is not null and p_ends_at is not null and p_ends_at <= p_starts_at then
    raise exception 'La date de fin doit être après la date de début.';
  end if;
  if p_season_id is not null and not exists (select 1 from public.seasons where id = p_season_id) then
    raise exception 'Saison introuvable.';
  end if;

  -- Un skin de saison n'est jamais acheté : le prix n'a pas de sens, on le
  -- force à 0 quoi que l'admin ait saisi. Sinon, prix normal (> 0) requis.
  if p_season_id is not null then
    v_price := 0;
  else
    if coalesce(p_price_coins, -1) <= 0 then
      raise exception 'Le prix doit être supérieur à 0.';
    end if;
    v_price := p_price_coins;
  end if;

  if p_id is null then
    if p_slug is null or p_slug !~ '^[a-z0-9-]+$' then
      raise exception 'Identifiant technique invalide (minuscules, chiffres, tirets uniquement).';
    end if;
    if exists (select 1 from public.store_skins where slug = p_slug) then
      raise exception 'Cet identifiant technique est déjà utilisé.';
    end if;

    insert into public.store_skins (
      slug, category, rarity, name_fr, name_en, description_fr, description_en,
      price_coins, config, sort_order, starts_at, ends_at, is_active, season_id
    )
    values (
      p_slug, p_category, p_rarity, trim(p_name_fr), trim(p_name_en), trim(p_description_fr), trim(p_description_en),
      v_price, p_config, coalesce(p_sort_order, 0), p_starts_at, p_ends_at, coalesce(p_active, true), p_season_id
    )
    returning id into v_id;

    insert into public.admin_audit_log (admin_id, action, target, details)
    values (v_admin, 'create_store_skin', v_id::text, jsonb_build_object('slug', p_slug, 'name_fr', p_name_fr));
  else
    update public.store_skins
    set category = p_category,
        rarity = p_rarity,
        name_fr = trim(p_name_fr),
        name_en = trim(p_name_en),
        description_fr = trim(p_description_fr),
        description_en = trim(p_description_en),
        price_coins = v_price,
        config = p_config,
        sort_order = coalesce(p_sort_order, 0),
        starts_at = p_starts_at,
        ends_at = p_ends_at,
        is_active = coalesce(p_active, true),
        season_id = p_season_id
    where id = p_id
    returning id into v_id;

    if v_id is null then
      raise exception 'Skin introuvable.';
    end if;

    insert into public.admin_audit_log (admin_id, action, target, details)
    values (v_admin, 'update_store_skin', v_id::text, jsonb_build_object('name_fr', p_name_fr));
  end if;

  return v_id;
end;
$$;

revoke execute on function public.admin_upsert_store_skin(uuid, text, text, text, text, text, text, text, int, jsonb, int, timestamptz, timestamptz, boolean, uuid) from public, anon;
grant execute on function public.admin_upsert_store_skin(uuid, text, text, text, text, text, text, text, int, jsonb, int, timestamptz, timestamptz, boolean, uuid) to authenticated;

-- ----------------------------------------------------------------------------
-- 5bis. avatar_part_min_points : 6 nouvelles pièces (voir Avatar.tsx et
-- avatarParts.ts) pour les 5 skins Octobre Rose × Barbie ci-dessus. Seuil
-- volontairement inatteignable par les points de rang (999999) — ces pièces
-- ne se débloquent QUE via la possession du skin de saison correspondant
-- (voir le contournement déjà en place dans set_my_avatar, migration 0195 :
-- une pièce possédée via un skin est débloquée même sans les points requis).
-- Doit rester synchronisé avec PART_MIN_POINTS dans avatarParts.ts.
-- ----------------------------------------------------------------------------
create or replace function public.avatar_part_min_points(p_kind text, p_value text)
returns int
language sql
immutable
set search_path = public
as $$
  select case p_kind
    when 'hair' then case p_value
      when 'none' then 0 when 'fade' then 0 when 'afro' then 0 when 'braids' then 0 when 'puffs' then 0
      when 'curly' then 100 when 'bun' then 100 when 'flat' then 250 when 'cornrows' then 350 when 'locs' then 250
      when 'long' then 550 when 'knots' then 800 when 'mohawk' then 1100 when 'topknot' then 1500 when 'gele' then 600
      when 'malibu_wave' then 999999
    end
    when 'outfit' then case p_value
      when 'tunic' then 0 when 'tee' then 0 when 'cloak' then 100 when 'wrap' then 100 when 'kente' then 250
      when 'dashiki' then 250 when 'boubou' then 350 when 'hunter' then 550 when 'suit' then 800 when 'hood' then 600
      when 'armor' then 1100 when 'royal' then 1500 when 'furcape' then 2000
      when 'dream_rose' then 999999 when 'cape_solidaire' then 999999 when 'louve_malibu' then 999999
    end
    when 'acc' then case p_value
      when 'none' then 0 when 'ring' then 0 when 'freckles' then 0 when 'glasses' then 100 when 'sunglasses' then 150
      when 'hoops' then 200 when 'scar' then 250 when 'beads' then 350 when 'facepaint' then 550 when 'eyepatch' then 800
      when 'coeur_lunettes' then 999999
    end
    when 'head' then case p_value
      when 'none' then 0 when 'headband' then 100 when 'cap' then 250 when 'hat' then 550 when 'feather' then 800 when 'crown' then 2000
      when 'ribbon_pink' then 999999
    end
  end;
$$;

-- ----------------------------------------------------------------------------
-- 6. grant_season_xp — helper interne (jamais appelé directement par le
-- client, aucun grant à authenticated), appelé depuis apply_rank_result et
-- claim_quest_reward. Sans effet si aucune saison n'est active : ces deux
-- fonctions restent inchangées pour toute période sans saison en cours.
-- ----------------------------------------------------------------------------
create or replace function public.grant_season_xp(p_user_id uuid, p_kind text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_season record;
  v_amount int;
begin
  select * into v_season from public.seasons
  where is_enabled and now() between starts_at and ends_at
  order by starts_at desc
  limit 1;

  if not found then
    return;
  end if;

  v_amount := case p_kind
    when 'game_played' then v_season.xp_per_game_played
    when 'game_won' then v_season.xp_per_game_won
    when 'quest_claim' then v_season.xp_per_quest_claim
    else 0
  end;

  if coalesce(v_amount, 0) <= 0 then
    return;
  end if;

  insert into public.season_progress (user_id, season_id, xp)
  values (p_user_id, v_season.id, v_amount)
  on conflict (user_id, season_id) do update set xp = public.season_progress.xp + excluded.xp;
end;
$$;

revoke execute on function public.grant_season_xp(uuid, text) from public, anon, authenticated;

-- ----------------------------------------------------------------------------
-- 7. Points d'accroche : apply_rank_result (partie jouée + bonus victoire)
-- et claim_quest_reward (quête réclamée). Reprises à l'identique pour tout
-- le reste (0202/0187) — seul l'appel à grant_season_xp est ajouté.
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

  perform public.grant_season_xp(p_user_id, 'game_played');
  if p_won then
    perform public.grant_season_xp(p_user_id, 'game_won');
  end if;

  return jsonb_build_object(
    'gain', v_gain,
    'new_points', v_new_points,
    'new_tier', public.rank_tier_for_points(v_new_points),
    'coins_gain', v_coins_bonus
  );
end;
$$;

create or replace function public.claim_quest_reward(p_template_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_today date := public.quest_today();
  v_date date;
  v_progress int;
  v_target int;
  v_reward int;
  v_label_fr text;
  v_new_loup_coins bigint;
begin
  if v_user is null then
    raise exception 'Non authentifié.';
  end if;

  -- La plus ancienne récompense terminée et non récupérée de cette quête,
  -- parmi la journée en cours et la précédente (délai de grâce).
  select qp.quest_date, qp.progress, qt.target, qt.reward_coins, qt.label_fr
    into v_date, v_progress, v_target, v_reward, v_label_fr
    from public.quest_progress qp
    join public.quest_templates qt on qt.id = qp.template_id
    where qp.user_id = v_user and qp.template_id = p_template_id
      and qp.quest_date in (v_today, v_today - 1)
      and qp.claimed_at is null and qp.progress >= qt.target
    order by qp.quest_date asc
    limit 1
    for update of qp;

  if not found then
    if not exists (
      select 1 from public.quest_progress
      where user_id = v_user and template_id = p_template_id and quest_date = v_today
    ) then
      raise exception 'Quête introuvable pour aujourd''hui.';
    end if;
    if exists (
      select 1 from public.quest_progress
      where user_id = v_user and template_id = p_template_id and quest_date = v_today and claimed_at is not null
    ) then
      raise exception 'Récompense déjà réclamée.';
    end if;
    raise exception 'Quête pas encore terminée.';
  end if;

  update public.quest_progress set claimed_at = now()
    where user_id = v_user and quest_date = v_date and template_id = p_template_id;

  update public.profiles set loup_coins = loup_coins + v_reward
    where id = v_user
    returning loup_coins into v_new_loup_coins;

  insert into public.loup_coins_transactions (user_id, amount, reason, label)
  values (v_user, v_reward, 'quest_reward', v_label_fr);

  perform public.grant_season_xp(v_user, 'quest_claim');

  return jsonb_build_object('reward_coins', v_reward, 'new_loup_coins', v_new_loup_coins);
end;
$$;

-- ----------------------------------------------------------------------------
-- 8. RPC joueur : get_my_season / claim_season_tier.
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
    -- joueur a un palier débloqué mais pas encore réclamé, pour ne jamais
    -- lui faire perdre une récompense déjà gagnée simplement parce que la
    -- saison est terminée entre-temps.
    select s.* into v_season
    from public.seasons s
    join public.season_progress sp on sp.season_id = s.id and sp.user_id = v_user
    where exists (
      select 1 from public.season_tiers st
      where st.season_id = s.id and st.xp_required <= sp.xp
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
    'xp', coalesce((select xp from public.season_progress where user_id = v_user and season_id = v_season.id), 0),
    'tiers', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', st.id,
        'tier_number', st.tier_number,
        'xp_required', st.xp_required,
        'reward_type', st.reward_type,
        'reward_coins', st.reward_coins,
        'reward_skin', case when st.reward_skin_id is not null then jsonb_build_object(
          'id', s.id, 'name_fr', s.name_fr, 'name_en', s.name_en, 'rarity', s.rarity, 'config', s.config
        ) end,
        'label_fr', st.label_fr,
        'label_en', st.label_en,
        'claimed', exists (select 1 from public.season_tier_claims c where c.tier_id = st.id and c.user_id = v_user)
      ) order by st.tier_number)
      from public.season_tiers st
      left join public.store_skins s on s.id = st.reward_skin_id
      where st.season_id = v_season.id
    ), '[]'::jsonb)
  );
end;
$$;

revoke execute on function public.get_my_season() from public, anon;
grant execute on function public.get_my_season() to authenticated;

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

  -- Insertion d'abord : la clé primaire (user_id, tier_id) sert de verrou
  -- anti-double-réclamation en cas d'appels concurrents (même principe que
  -- claim_daily_login) — si elle échoue, aucune récompense n'est distribuée.
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
-- 9. RPC admin : seasons + tiers (même patron que events/banners).
-- ----------------------------------------------------------------------------
create or replace function public.admin_list_seasons()
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
    select jsonb_agg(row_to_json(s) order by s.starts_at desc) from public.seasons s
  ), '[]'::jsonb);
end;
$$;

revoke execute on function public.admin_list_seasons() from public, anon;
grant execute on function public.admin_list_seasons() to authenticated;

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

create or replace function public.admin_delete_season(p_id uuid)
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

  delete from public.seasons where id = p_id;

  insert into public.admin_audit_log (admin_id, action, target, details)
  values (v_admin, 'delete_season', p_id::text, null);
end;
$$;

revoke execute on function public.admin_delete_season(uuid) from public, anon;
grant execute on function public.admin_delete_season(uuid) to authenticated;

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
      'label_fr', st.label_fr, 'label_en', st.label_en
    ) order by st.tier_number)
    from public.season_tiers st
    left join public.store_skins s on s.id = st.reward_skin_id
    where st.season_id = p_season_id
  ), '[]'::jsonb);
end;
$$;

revoke execute on function public.admin_list_season_tiers(uuid) from public, anon;
grant execute on function public.admin_list_season_tiers(uuid) to authenticated;

create or replace function public.admin_upsert_season_tier(
  p_id uuid,
  p_season_id uuid,
  p_tier_number int,
  p_xp_required int,
  p_reward_type text,
  p_reward_coins int,
  p_reward_skin_id uuid,
  p_label_fr text,
  p_label_en text
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
    insert into public.season_tiers (season_id, tier_number, xp_required, reward_type, reward_coins, reward_skin_id, label_fr, label_en)
    values (p_season_id, p_tier_number, p_xp_required, p_reward_type, p_reward_coins, p_reward_skin_id, trim(p_label_fr), trim(p_label_en))
    returning id into v_id;

    insert into public.admin_audit_log (admin_id, action, target, details)
    values (v_admin, 'create_season_tier', v_id::text, jsonb_build_object('season_id', p_season_id, 'tier_number', p_tier_number));
  else
    update public.season_tiers
    set tier_number = p_tier_number,
        xp_required = p_xp_required,
        reward_type = p_reward_type,
        reward_coins = p_reward_coins,
        reward_skin_id = p_reward_skin_id,
        label_fr = trim(p_label_fr),
        label_en = trim(p_label_en)
    where id = p_id and season_id = p_season_id
    returning id into v_id;

    if v_id is null then
      raise exception 'Palier introuvable.';
    end if;

    insert into public.admin_audit_log (admin_id, action, target, details)
    values (v_admin, 'update_season_tier', v_id::text, jsonb_build_object('tier_number', p_tier_number));
  end if;

  return v_id;
end;
$$;

revoke execute on function public.admin_upsert_season_tier(uuid, uuid, int, int, text, int, uuid, text, text) from public, anon;
grant execute on function public.admin_upsert_season_tier(uuid, uuid, int, int, text, int, uuid, text, text) to authenticated;

create or replace function public.admin_delete_season_tier(p_id uuid)
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

  delete from public.season_tiers where id = p_id;

  insert into public.admin_audit_log (admin_id, action, target, details)
  values (v_admin, 'delete_season_tier', p_id::text, null);
end;
$$;

revoke execute on function public.admin_delete_season_tier(uuid) from public, anon;
grant execute on function public.admin_delete_season_tier(uuid) to authenticated;

-- ----------------------------------------------------------------------------
-- 10. Seed : première saison "Octobre Rose × Barbie" (1er → 26 octobre
-- 2026), 5 skins exclusifs et 20 paliers. Entièrement rejouable (upsert par
-- clé naturelle) si cette migration doit être relancée depuis un état
-- partiellement appliqué.
-- ----------------------------------------------------------------------------
do $$
declare
  v_season_id uuid;
  v_skin_ruban uuid;
  v_skin_criniere uuid;
  v_skin_robe uuid;
  v_skin_cape uuid;
  v_skin_pack uuid;
begin
  insert into public.seasons (
    slug, name_fr, name_en, theme_color, starts_at, ends_at,
    xp_per_game_played, xp_per_game_won, xp_per_quest_claim, is_enabled
  ) values (
    'octobre-rose-barbie', 'Octobre Rose × Barbie', 'Pink October × Barbie', 'blush',
    '2026-10-01 00:00:00+02', '2026-10-26 00:00:00+01',
    10, 15, 20, true
  )
  on conflict (slug) do update set slug = excluded.slug
  returning id into v_season_id;

  insert into public.store_skins (slug, category, rarity, name_fr, name_en, description_fr, description_en, price_coins, config, sort_order, is_active, season_id)
  values (
    'ruban-malibu', 'chapeaux', 'commun', 'Ruban Malibu', 'Malibu ribbon',
    'Le ruban rose de sensibilisation, glissé dans les cheveux comme un accessoire glamour — la première pièce de la collab Octobre Rose × Barbie.',
    'The pink awareness ribbon, worn as a glamorous hair clip — the first piece of the Pink October × Barbie collab.',
    0, '{"head":"ribbon_pink"}'::jsonb, 100, true, v_season_id
  )
  on conflict (slug) do update set season_id = excluded.season_id
  returning id into v_skin_ruban;

  insert into public.store_skins (slug, category, rarity, name_fr, name_en, description_fr, description_en, price_coins, config, sort_order, is_active, season_id)
  values (
    'criniere-malibu', 'coiffures', 'rare', 'Crinière Malibu', 'Malibu waves',
    'Une longue chevelure blonde ondulée, avec une mèche rose assortie au ruban.',
    'Long wavy blonde hair, with a pink streak to match the ribbon.',
    0, '{"hair":"malibu_wave"}'::jsonb, 101, true, v_season_id
  )
  on conflict (slug) do update set season_id = excluded.season_id
  returning id into v_skin_criniere;

  insert into public.store_skins (slug, category, rarity, name_fr, name_en, description_fr, description_en, price_coins, config, sort_order, is_active, season_id)
  values (
    'robe-dream-rose', 'tenues', 'rare', 'Robe Dream Rose', 'Dream Rose gown',
    'Une robe scintillante rose poudré, digne d''une Dreamhouse.',
    'A shimmering powder-pink gown, straight out of a Dreamhouse.',
    0, '{"outfit":"dream_rose"}'::jsonb, 102, true, v_season_id
  )
  on conflict (slug) do update set season_id = excluded.season_id
  returning id into v_skin_robe;

  insert into public.store_skins (slug, category, rarity, name_fr, name_en, description_fr, description_en, price_coins, config, sort_order, is_active, season_id)
  values (
    'cape-solidaire', 'tenues', 'epique', 'Cape Solidaire', 'Solidarity cape',
    'Une cape chatoyante avec le ruban brodé dans le dos — porter le symbole comme une fierté.',
    'A shimmering cape with the ribbon embroidered on the back — wearing the symbol with pride.',
    0, '{"outfit":"cape_solidaire"}'::jsonb, 103, true, v_season_id
  )
  on conflict (slug) do update set season_id = excluded.season_id
  returning id into v_skin_cape;

  insert into public.store_skins (slug, category, rarity, name_fr, name_en, description_fr, description_en, price_coins, config, sort_order, is_active, season_id)
  values (
    'pack-louve-malibu', 'packs', 'legendaire', 'Pack Louve Malibu', 'Malibu Wolf pack',
    'La transformation complète : crinière, robe, ruban et lunettes cœur réunis. La Barbie devenue louve — le look exclusif de fin de saison.',
    'The full transformation: hair, gown, ribbon and heart glasses combined. Barbie turned werewolf — the exclusive season finale look.',
    0, '{"hair":"malibu_wave","outfit":"louve_malibu","acc":"coeur_lunettes","head":"ribbon_pink"}'::jsonb, 104, true, v_season_id
  )
  on conflict (slug) do update set season_id = excluded.season_id
  returning id into v_skin_pack;

  insert into public.season_tiers (season_id, tier_number, xp_required, reward_type, reward_coins, reward_skin_id, label_fr, label_en)
  values
    (v_season_id, 1, 60, 'coins', 30, null, '30 Loup Coins', '30 Loup Coins'),
    (v_season_id, 2, 130, 'coins', 40, null, '40 Loup Coins', '40 Loup Coins'),
    (v_season_id, 3, 210, 'coins', 50, null, '50 Loup Coins', '50 Loup Coins'),
    (v_season_id, 4, 300, 'skin', null, v_skin_ruban, 'Ruban Malibu', 'Malibu ribbon'),
    (v_season_id, 5, 400, 'coins', 50, null, '50 Loup Coins', '50 Loup Coins'),
    (v_season_id, 6, 510, 'coins', 60, null, '60 Loup Coins', '60 Loup Coins'),
    (v_season_id, 7, 630, 'coins', 70, null, '70 Loup Coins', '70 Loup Coins'),
    (v_season_id, 8, 760, 'skin', null, v_skin_criniere, 'Crinière Malibu', 'Malibu waves'),
    (v_season_id, 9, 900, 'coins', 70, null, '70 Loup Coins', '70 Loup Coins'),
    (v_season_id, 10, 1050, 'coins', 80, null, '80 Loup Coins', '80 Loup Coins'),
    (v_season_id, 11, 1180, 'coins', 90, null, '90 Loup Coins', '90 Loup Coins'),
    (v_season_id, 12, 1320, 'skin', null, v_skin_robe, 'Robe Dream Rose', 'Dream Rose gown'),
    (v_season_id, 13, 1470, 'coins', 90, null, '90 Loup Coins', '90 Loup Coins'),
    (v_season_id, 14, 1630, 'coins', 100, null, '100 Loup Coins', '100 Loup Coins'),
    (v_season_id, 15, 1800, 'coins', 110, null, '110 Loup Coins', '110 Loup Coins'),
    (v_season_id, 16, 1980, 'skin', null, v_skin_cape, 'Cape Solidaire', 'Solidarity cape'),
    (v_season_id, 17, 2140, 'coins', 110, null, '110 Loup Coins', '110 Loup Coins'),
    (v_season_id, 18, 2310, 'coins', 120, null, '120 Loup Coins', '120 Loup Coins'),
    (v_season_id, 19, 2490, 'coins', 130, null, '130 Loup Coins', '130 Loup Coins'),
    (v_season_id, 20, 2700, 'skin', null, v_skin_pack, 'Pack Louve Malibu', 'Malibu Wolf pack')
  on conflict (season_id, tier_number) do update
  set xp_required = excluded.xp_required,
      reward_type = excluded.reward_type,
      reward_coins = excluded.reward_coins,
      reward_skin_id = excluded.reward_skin_id,
      label_fr = excluded.label_fr,
      label_en = excluded.label_en;
end $$;
