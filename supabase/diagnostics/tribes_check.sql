-- Lecture seule : vérifie que les tribus (migration 0222) sont bien installées,
-- puis liste les tribus existantes.
select 'table ' || t as controle, to_regclass('public.' || t) is not null as ok
from unnest(array['tribes', 'tribe_members', 'tribe_invites', 'tribe_messages', 'tribe_reports']) as t
union all
select 'RLS activée sur ' || t, coalesce((select relrowsecurity from pg_class where oid = to_regclass('public.' || t)), false)
from unnest(array['tribes', 'tribe_members', 'tribe_invites', 'tribe_messages', 'tribe_reports']) as t
union all
select 'temps réel sur tribe_messages', exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'tribe_messages')
union all
select 'règle de lecture des messages', exists (select 1 from pg_policies where tablename = 'tribe_messages' and policyname = 'tribe_messages_select')
union all
select 'fonction ' || f, to_regproc('public.' || f) is not null
from unnest(array['create_tribe', 'get_my_tribe_summary', 'get_tribe_detail', 'search_tribe_candidates', 'invite_to_tribe', 'respond_tribe_invite', 'leave_tribe', 'send_tribe_message', 'get_tribe_messages', 'admin_list_tribe_reports']) as f
union all
select 'les clients ne peuvent PAS écrire dans tribe_messages', not has_table_privilege('authenticated', 'public.tribe_messages', 'insert')
union all
select 'les clients ne peuvent PAS lire tribe_members en direct', not has_table_privilege('authenticated', 'public.tribe_members', 'select');

select t.name, t.emblem, t.created_at,
  (select count(*) from public.tribe_members m where m.tribe_id = t.id) as membres,
  (select count(*) from public.tribe_messages x where x.tribe_id = t.id) as messages
from public.tribes t order by t.created_at desc limit 20;
