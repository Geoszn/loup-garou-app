-- Test de bout en bout de la saison 2, ÉTAPE 3 : OUVRE la saison maintenant et donne 1 700 XP de saison au compte de test.
--   node scripts/run-sql-file.mjs supabase/ops/season_test_open.sql
-- ATTENTION : tant que la saison est ouverte, TOUS les joueurs la voient (pass à 600 coins, paliers) et gagnent de l'XP en jouant.
-- À faire à une heure creuse, et à refermer sans attendre avec supabase/ops/season_test_close.sql.
-- 1 700 XP = palier 10 atteint (160 XP par palier) : de quoi tester le pass et réclamer des paliers sans jouer.
do $$
declare
  v_user uuid;
  v_season uuid;
begin
  select id into v_user from auth.users where lower(email) = 'geoffroyszn@gmail.com';
  select id into v_season from public.seasons where slug = 'noel-au-village';
  if v_user is null or v_season is null then
    raise exception 'Compte de test ou saison introuvable.';
  end if;

  update public.seasons set starts_at = now() - interval '1 minute' where id = v_season;

  insert into public.season_progress (user_id, season_id, xp) values (v_user, v_season, 1700)
  on conflict (user_id, season_id) do update set xp = greatest(public.season_progress.xp, 1700);

  raise notice 'Saison OUVERTE. À refermer avec supabase/ops/season_test_close.sql.';
end;
$$;
