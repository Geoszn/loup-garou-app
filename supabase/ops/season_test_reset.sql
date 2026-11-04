-- Test de la saison 2, REMISE À ZÉRO du compte geoffroyszn@gmail.com (à lancer une fois le test terminé).
--   node scripts/run-sql-file.mjs supabase/ops/season_test_reset.sql
-- Retire : l'XP de la saison, le pass, les paliers réclamés, les pièces de saison, et annule au grand livre les mouvements de coins du test
-- (cadeau « Test saison 2 », achat du pass, coins des paliers) en ajustant le solde. Ne touche QUE ce compte. Rejouable : la 2e fois, rien à faire.
do $$
declare
  v_user uuid;
  v_season uuid;
  v_since timestamptz;
  v_net bigint;
begin
  select id into v_user from auth.users where lower(email) = 'geoffroyszn@gmail.com';
  select id into v_season from public.seasons where slug = 'noel-au-village';
  if v_user is null or v_season is null then
    raise exception 'Compte ou saison introuvable.';
  end if;

  select min(created_at) into v_since from public.loup_coins_transactions
    where user_id = v_user and reason = 'admin_gift' and label = 'Test saison 2';

  if v_since is not null then
    select coalesce(sum(amount), 0) into v_net from public.loup_coins_transactions
      where user_id = v_user and created_at >= v_since
        and (reason in ('season_pass', 'season_reward') or (reason = 'admin_gift' and label = 'Test saison 2'));
    update public.profiles set loup_coins = loup_coins - v_net where id = v_user;
    delete from public.loup_coins_transactions
      where user_id = v_user and created_at >= v_since
        and (reason in ('season_pass', 'season_reward') or (reason = 'admin_gift' and label = 'Test saison 2'));
  end if;

  delete from public.season_tier_claims where user_id = v_user
    and tier_id in (select id from public.season_tiers where season_id = v_season);
  delete from public.season_passes where user_id = v_user and season_id = v_season;
  delete from public.season_progress where user_id = v_user and season_id = v_season;
  delete from public.player_skins where user_id = v_user
    and skin_id in (select id from public.store_skins where season_id = v_season);

  raise notice 'Compte remis à zéro (ajustement de coins : %).', coalesce(-v_net, 0);
end;
$$;
