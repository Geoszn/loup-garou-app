-- Diagnostic LECTURE SEULE de la charge Realtime / base — ne modifie rien.
-- À lancer pendant que des parties tournent (ex. en soirée), puis à comparer
-- avant / après un correctif :
--   node scripts/query-sql-file.mjs supabase/diagnostics/realtime_load.sql
--
--  - realtime_subscriptions : nombre d'abonnements postgres_changes ouverts en
--    ce moment (chacun force une vérification de droits à chaque changement de
--    ligne de sa table) — c'est LE chiffre qui doit baisser.
--  - realtime_subscriptions_by_table : réparti par table (chat_messages doit
--    être proche du nombre de joueurs connectés, pas d'un multiple).
--  - db_connections : connexions Postgres par rôle/état.
--  - top_queries_by_total_time : requêtes qui consomment le plus de temps base
--    (cherche can_read_channel, get_my_game_view, realtime.apply_rls...).
select jsonb_build_object(
  'realtime_subscriptions', (select count(*) from realtime.subscription),
  'realtime_subscriptions_by_table', (
    select coalesce(jsonb_object_agg(t, c), '{}'::jsonb)
    from (select entity::text as t, count(*) as c from realtime.subscription group by 1) s
  ),
  'db_connections', (
    select coalesce(jsonb_object_agg(k, c), '{}'::jsonb)
    from (
      select coalesce(usename, '?') || '/' || coalesce(state, '?') as k, count(*) as c
      from pg_stat_activity group by 1
    ) x
  ),
  'live_games', (select count(*) from public.games where status <> 'ended'),
  'top_queries_by_total_time', (
    select coalesce(jsonb_agg(q), '[]'::jsonb)
    from (
      select left(regexp_replace(query, '\s+', ' ', 'g'), 120) as query,
             calls,
             round((total_exec_time / 1000)::numeric, 1) as total_s,
             round(mean_exec_time::numeric, 1) as mean_ms
      from extensions.pg_stat_statements
      order by total_exec_time desc
      limit 8
    ) q
  )
) as diagnostic;
