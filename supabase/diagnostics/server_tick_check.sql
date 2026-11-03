-- Diagnostic LECTURE SEULE du chronomètre serveur (migration 0251) :
--   node scripts/query-sql-file.mjs supabase/diagnostics/server_tick_check.sql
--  - cron_jobs : les deux jobs doivent apparaître, active = true.
--  - heartbeat_age_s : doit rester sous ~12 s tant que le chrono tourne.
--  - last_runs : dernières exécutions (status = succeeded attendu).
select jsonb_build_object(
  'cron_jobs', (select coalesce(jsonb_agg(jsonb_build_object('name', jobname, 'schedule', schedule, 'active', active)), '[]'::jsonb) from cron.job),
  'heartbeat_age_s', (select round(extract(epoch from now() - beat_at)::numeric, 1) from public.server_tick_heartbeat where id = 1),
  'last_runs', (
    select coalesce(jsonb_agg(r), '[]'::jsonb)
    from (select status, left(return_message, 80) as msg, end_time from cron.job_run_details order by end_time desc limit 5) r
  )
) as server_tick;
