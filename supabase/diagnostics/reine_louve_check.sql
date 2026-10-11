-- Diagnostic en LECTURE SEULE : la Reine Louve (migration 0242) est-elle bien en place, et que s'est-il passé dans les
-- 3 dernières parties ? À lancer avec : node scripts/query-sql-file.mjs supabase/diagnostics/reine_louve_check.sql
select jsonb_build_object(
  'migration_0242_fonctions', jsonb_build_object(
    'submit_reine_louve', to_regprocedure('public.submit_reine_louve(uuid,uuid)') is not null,
    'reine_louve_eligible_ids', to_regprocedure('public.reine_louve_eligible_ids(uuid)') is not null,
    'start_game_connait_le_role', coalesce(pg_get_functiondef(to_regprocedure('public.start_game(uuid)')) like '%reine_louve%', false),
    'next_night_step_connait_le_role', coalesce(pg_get_functiondef(to_regprocedure('public.next_night_step(uuid,integer,text)')) like '%reine_louve%', false),
    'role_config_ligne', exists (select 1 from public.role_config where role = 'reine_louve')
  ),
  'dernieres_parties', (
    select coalesce(jsonb_agg(x), '[]'::jsonb) from (
      select
        g.code,
        g.status,
        g.night_number,
        g.night_step,
        g.settings -> 'role_counts' as role_counts_demandes,
        (select jsonb_agg(rs.role order by rs.role) from public.game_roles_secret rs where rs.game_id = g.id) as roles_distribues,
        (select jsonb_agg(jsonb_build_object('nuit', na.night_number, 'etape', na.step, 'cible', na.target_id) order by na.night_number)
           from public.night_actions na where na.game_id = g.id and na.step in ('reine_louve', 'voyante')) as actions_reine_et_voyante
      from public.games g
      order by g.created_at desc
      limit 3
    ) x
  )
) as diagnostic;
