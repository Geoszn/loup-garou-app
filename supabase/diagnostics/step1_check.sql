-- Diagnostic LECTURE SEULE des migrations 0252 (présence légère) et 0253 (version de partie) :
--   node scripts/query-sql-file.mjs supabase/diagnostics/step1_check.sql
-- Attendu : tout à true, game_state_version_rows >= nombre de parties, bump_triggers = 15 (14 tables + games en mise à jour)
-- + 1 (games en création) = 16 déclencheurs.
select jsonb_build_object(
  'presence_table', to_regclass('public.user_presence') is not null,
  'touch_presence_fn', exists (select 1 from pg_proc where proname = 'touch_presence' and pronamespace = 'public'::regnamespace),
  'presence_purge_job', exists (select 1 from cron.job where jobname = 'purge-user-presence'),
  'version_table', to_regclass('public.game_state_version') is not null,
  'get_game_version_fn', exists (select 1 from pg_proc where proname = 'get_game_version' and pronamespace = 'public'::regnamespace),
  'in_realtime_publication', exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'game_state_version'),
  'bump_triggers', (select count(*) from pg_trigger where tgname in ('trg_bump_game_version', 'trg_bump_game_version_ins') and not tgisinternal),
  'game_state_version_rows', (select count(*) from public.game_state_version),
  'games_total', (select count(*) from public.games)
) as step1;
