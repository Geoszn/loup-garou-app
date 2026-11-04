-- 0267 : une saison qui n'a pas commencé n'est plus présentée comme « Terminée ».
--   * get_my_season : le repli « dernière saison avec des paliers à réclamer » ne vaut que pour une saison réellement terminée (now() > ends_at).
--   * claim_season_tier : refuse la réclamation avant le début de la saison.
-- Rejouable (create or replace). Copies des dernières définitions (0266 et 0260).

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
    where s.is_enabled and now() > s.ends_at
      and exists (
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

  if exists (select 1 from public.seasons where id = v_tier.season_id and starts_at > now()) then
    raise exception 'Cette saison n''a pas encore commencé.';
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
