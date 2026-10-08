-- Vérifie l'installation des niveaux de tribu (migration 0225) — lecture seule.
select 'colonne tribes.xp' as test, exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'tribes' and column_name = 'xp') as ok
union all select 'table tribe_xp_events', to_regclass('public.tribe_xp_events') is not null
union all select 'fonction tribe_level_info', exists (select 1 from pg_proc where proname = 'tribe_level_info' and pronamespace = 'public'::regnamespace)
union all select 'déclencheur tribe_xp_game_end', exists (select 1 from pg_trigger where tgname = 'tribe_xp_game_end' and not tgisinternal)
union all select 'niveau de 0 XP = 1', public.tribe_level_info(0) ->> 'level' = '1'
union all select 'niveau de 250 XP = 3', public.tribe_level_info(250) ->> 'level' = '3'
union all select 'niveau de 99999 XP = 10 (xp_next nul)', public.tribe_level_info(99999) ->> 'level' = '10' and (public.tribe_level_info(99999) -> 'xp_next') = 'null'::jsonb;
