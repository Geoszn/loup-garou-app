-- Diagnostic LECTURE SEULE du pool de bots de test (migrations 0127 et 0254) :
--   node scripts/query-sql-file.mjs supabase/diagnostics/bots_check.sql
-- Attendu : bots = 12, bots_anonymous = 0, bots_guest = 0.
select jsonb_build_object(
  'bots', (select count(*) from public.profiles where is_bot),
  'bots_anonymous', (select count(*) from auth.users u join public.profiles p on p.id = u.id where p.is_bot and u.is_anonymous),
  'bots_guest', (select count(*) from public.profiles where is_bot and is_guest),
  'bot_names', (select coalesce(jsonb_agg(username order by username), '[]'::jsonb) from public.profiles where is_bot)
) as bots;
