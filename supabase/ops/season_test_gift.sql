-- Test de bout en bout de la saison 2, ÉTAPE 2 : complète le solde du compte de test à 700 Loup Coins (pass à 600 + marge).
--   node scripts/run-sql-file.mjs supabase/ops/season_test_gift.sql
-- Ne touche QUE le compte geoffroyszn@gmail.com. Sans effet s'il a déjà 700 coins ou plus (on ne l'appauvrit jamais). Le cadeau est
-- inscrit au grand livre des Loup Coins (raison « admin_gift », libellé « Test saison 2 ») : il est donc traçable et annulable.
do $$
declare
  v_user uuid;
  v_balance bigint;
  v_gift bigint;
begin
  select id into v_user from auth.users where lower(email) = 'geoffroyszn@gmail.com';
  if v_user is null then
    raise exception 'Compte de test introuvable.';
  end if;

  select loup_coins into v_balance from public.profiles where id = v_user for update;
  v_gift := 700 - coalesce(v_balance, 0);
  if v_gift <= 0 then
    raise notice 'Solde déjà suffisant (%), rien à faire.', v_balance;
    return;
  end if;

  update public.profiles set loup_coins = loup_coins + v_gift where id = v_user;
  insert into public.loup_coins_transactions (user_id, amount, reason, label)
  values (v_user, v_gift, 'admin_gift', 'Test saison 2');
  raise notice 'Cadeau de % coins : nouveau solde %.', v_gift, v_balance + v_gift;
end;
$$;
