-- 0266 — Lancement de la saison 2 « Noël au Village » : bonus d'XP, annonces et notifications.
--
--   1. season_xp_boosts : fenêtres de bonus d'XP de saison (multiplicateur), distinctes des « événements » (qui paient des points
--      de rang ou des coins et ne touchent PAS à l'XP de saison). grant_season_xp applique le plus fort multiplicateur actif ;
--      get_my_season renvoie `xp_boost` (ou null) pour l'afficher dans le hub de saison.
--      Seed : « Double XP de Noël », du 24 décembre 2026 00:00 au 26 décembre 2026 00:00 UTC (×2).
--   2. Quatre bandeaux d'événement (sans bonus de jeu) sur la page d'accueil : lancement (1er déc. → 29 janv.), Double XP de Noël
--      (24-25 déc.), Bonne année 2027 (31 déc. → 1er janv.), dernière semaine (23 → 29 janv.). Modifiables dans l'admin.
--   3. Trois notifications push programmées (le cron quotidien de 08h00 UTC les envoie) : lancement (1er déc.), Double XP
--      (24 déc.), dernière semaine (23 janv.). Créées au nom du premier administrateur. À relire / annuler dans l'admin
--      (Notifications) avant leur date.
-- La saison 2 a été créée par migration (0261) : elle n'a donc pas eu la notification de lancement automatique d'admin_upsert_season.
-- À appliquer APRÈS 0265. Rejouable sans risque (chaque ligne n'est créée qu'une fois).
set search_path = public;

create table if not exists public.season_xp_boosts (
  id uuid primary key default gen_random_uuid(),
  season_id uuid not null references public.seasons (id) on delete cascade,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  multiplier numeric not null check (multiplier > 1 and multiplier <= 5),
  label_fr text not null,
  label_en text not null,
  created_at timestamptz not null default now(),
  constraint season_xp_boosts_period_check check (ends_at > starts_at)
);
create index if not exists season_xp_boosts_season_idx on public.season_xp_boosts (season_id, starts_at, ends_at);
alter table public.season_xp_boosts enable row level security;
revoke all on public.season_xp_boosts from anon, authenticated;

create or replace function public.grant_season_xp(p_user_id uuid, p_kind text)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  v_season record;
  v_amount int;
  v_mult numeric;
begin
  select * into v_season from public.seasons
  where is_enabled and now() between starts_at and ends_at
  order by starts_at desc
  limit 1;

  if not found then
    return 0;
  end if;

  v_amount := case p_kind
    when 'game_played' then v_season.xp_per_game_played
    when 'game_won' then v_season.xp_per_game_won
    when 'quest_claim' then v_season.xp_per_quest_claim
    else 0
  end;

  if coalesce(v_amount, 0) <= 0 then
    return 0;
  end if;

  -- Bonus d'XP en cours (migration 0266, ex. « Double XP de Noël ») : le plus fort multiplicateur actif s'applique.
  select max(b.multiplier) into v_mult
  from public.season_xp_boosts b
  where b.season_id = v_season.id and now() between b.starts_at and b.ends_at;
  if v_mult is not null and v_mult > 1 then
    v_amount := round(v_amount * v_mult)::int;
  end if;

  insert into public.season_progress (user_id, season_id, xp)
  values (p_user_id, v_season.id, v_amount)
  on conflict (user_id, season_id) do update set xp = public.season_progress.xp + excluded.xp;

  return v_amount;
end;
$$;
revoke execute on function public.grant_season_xp(uuid, text) from public, anon, authenticated;


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
    -- Bonus d'XP en cours (migration 0266) : null s'il n'y en a pas.
    'xp_boost', (
      select jsonb_build_object('multiplier', b.multiplier, 'ends_at', b.ends_at, 'label_fr', b.label_fr, 'label_en', b.label_en)
      from public.season_xp_boosts b
      where b.season_id = v_season.id and now() between b.starts_at and b.ends_at
      order by b.multiplier desc
      limit 1
    ),
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


do $$
declare
  v_season uuid;
  v_admin uuid;
begin
  select id into v_season from public.seasons where slug = 'noel-au-village';
  if v_season is null then
    raise exception 'La saison noel-au-village n''existe pas : appliquez d''abord la migration 0261.';
  end if;

  -- 1. Bonus d'XP
  insert into public.season_xp_boosts (season_id, starts_at, ends_at, multiplier, label_fr, label_en)
  select v_season, timestamptz '2026-12-24 00:00:00+00', timestamptz '2026-12-26 00:00:00+00', 2, 'Double XP de Noël', 'Christmas double XP'
  where not exists (select 1 from public.season_xp_boosts where season_id = v_season and label_fr = 'Double XP de Noël');

  -- 2. Bandeaux d'événement (aucun bonus de jeu)
  insert into public.events (name, starts_at, ends_at, bonus_type, bonus_value, banner_text_fr, banner_text_en, banner_color, display_seconds, is_enabled)
  select v.name, v.starts_at, v.ends_at, 'none', 0, v.fr, v.en, v.color, 7, true
  from (values
    ('Noël au Village : lancement', timestamptz '2026-12-01 00:00:00+00', timestamptz '2027-01-30 00:00:00+00',
     '🎄 Noël au Village est arrivé ! Un pass de 30 paliers et 30 pièces d''avatar à gagner, du 1er décembre au 29 janvier.',
     '🎄 Christmas Village is here! A 30-tier pass and 30 avatar pieces to win, from December 1 to January 29.', 'emerald'),
    ('Double XP de Noël', timestamptz '2026-12-24 00:00:00+00', timestamptz '2026-12-26 00:00:00+00',
     '⚡ Double XP de Noël, les 24 et 25 décembre : tes paliers de saison avancent deux fois plus vite !',
     '⚡ Christmas double XP, December 24 and 25: your season tiers advance twice as fast!', 'gold'),
    ('Bonne année 2027', timestamptz '2026-12-31 00:00:00+00', timestamptz '2027-01-02 00:00:00+00',
     '🎆 Bonne année 2027 ! Il reste le mois de janvier pour terminer la saison Noël au Village.',
     '🎆 Happy New Year 2027! January is left to finish the Christmas Village season.', 'violet'),
    ('Noël au Village : dernière semaine', timestamptz '2027-01-23 00:00:00+00', timestamptz '2027-01-30 00:00:00+00',
     '⏳ Dernière semaine de Noël au Village : les pièces exclusives et le pass disparaissent le 29 janvier au soir.',
     '⏳ Last week of Christmas Village: the exclusive pieces and the pass are gone after January 29.', 'blood')
  ) as v(name, starts_at, ends_at, fr, en, color)
  where not exists (select 1 from public.events e where e.name = v.name);

  -- 3. Notifications push programmées
  select id into v_admin from public.profiles where is_admin order by created_at limit 1;
  if v_admin is null then
    raise notice 'Aucun administrateur : notifications non programmées (à créer à la main dans l''admin).';
  else
    insert into public.notification_campaigns (push_title, push_body, push_url, scheduled_at, created_by, recipient_count)
    select v.title, v.body, v.url, v.at, v_admin,
           (select count(distinct ps.user_id) from public.push_subscriptions ps join public.profiles p on p.id = ps.user_id where not p.is_bot)
    from (values
      ('🎄 Noël au Village est arrivé !', 'Un pass de 30 paliers et des pièces d''avatar exclusives vous attendent : jouez pour gagner de l''XP.', '/recompenses?tab=season', timestamptz '2026-12-01 00:00:00+00'),
      ('⚡ Double XP de Noël', 'Les 24 et 25 décembre, vos paliers de saison avancent deux fois plus vite. Joue avec tes amis !', '/recompenses?tab=season', timestamptz '2026-12-24 00:00:00+00'),
      ('⏳ Dernière semaine de Noël au Village', 'Il reste quelques jours pour finir la saison et obtenir les pièces exclusives. Fin le 29 janvier.', '/recompenses?tab=season', timestamptz '2027-01-23 00:00:00+00')
    ) as v(title, body, url, at)
    where not exists (select 1 from public.notification_campaigns c where c.push_title = v.title);
  end if;
end;
$$;
