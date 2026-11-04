-- Diagnostic de performance, ÉTAPE 2/2 — à lancer juste APRÈS la partie de test (voir perf_game_before.sql). LECTURE SEULE.
--   node scripts/query-sql-file.mjs supabase/diagnostics/perf_game_after.sql
-- Le résultat est un JSON sans secret, à coller dans le chat.
--
--  - top_by_total_time : où la base a passé son temps pendant la partie (appels, temps moyen, pire temps).
--  - game_functions : les fonctions du jeu qu'on soupçonne (get_my_game_view, can_read_channel, get_game_version, submit_vote...).
--  - active_now : requêtes en cours ou en attente à l'instant du relevé (wait_event non nul = elle attend un verrou ou une E/S).
--  - cache_hit_ratio : part des lectures servies par la mémoire (sous 99 % : base à l'étroit).
--  - tables : volume des tables du jeu et lignes mortes (gonflement).
--  - recent_games : parties démarrées dans l'heure, avec leur nombre de joueurs et de nuits.
select jsonb_build_object(
  'measured_since', (select stats_reset from extensions.pg_stat_statements_info),
  'total_db_time_s', (select round((sum(total_exec_time) / 1000)::numeric, 1) from extensions.pg_stat_statements),
  'top_by_total_time', (
    select coalesce(jsonb_agg(q), '[]'::jsonb) from (
      select left(regexp_replace(query, '\s+', ' ', 'g'), 110) as query, calls,
             round((total_exec_time / 1000)::numeric, 2) as total_s,
             round(mean_exec_time::numeric, 1) as mean_ms,
             round(max_exec_time::numeric, 0) as max_ms
      from extensions.pg_stat_statements
      order by total_exec_time desc limit 12
    ) q
  ),
  'game_functions', (
    select coalesce(jsonb_agg(w), '[]'::jsonb) from (
      select k.name,
             coalesce(sum(s.calls), 0) as calls,
             round((coalesce(sum(s.total_exec_time), 0) / 1000)::numeric, 2) as total_s,
             round(coalesce(max(s.mean_exec_time), 0)::numeric, 1) as mean_ms,
             round(coalesce(max(s.max_exec_time), 0)::numeric, 0) as max_ms
      from (values ('get_my_game_view'), ('get_game_version'), ('can_read_channel'), ('apply_rls'), ('submit_vote'),
                   ('tick_game'), ('server_tick_games'), ('advance_phase'), ('touch_presence'), ('bump_game_state_version'),
                   ('send_chat_message'), ('chat_messages')) as k(name)
      left join extensions.pg_stat_statements s on s.query ilike '%' || k.name || '%'
      group by k.name
      order by 3 desc
    ) w
  ),
  'active_now', (
    select coalesce(jsonb_agg(a), '[]'::jsonb) from (
      select state, wait_event_type, wait_event,
             round(extract(epoch from (now() - query_start))::numeric, 1) as running_s,
             left(regexp_replace(query, '\s+', ' ', 'g'), 90) as query
      from pg_stat_activity
      where datname = current_database() and pid <> pg_backend_pid() and state <> 'idle'
      order by query_start limit 15
    ) a
  ),
  'cache_hit_ratio', (
    select round(100.0 * sum(heap_blks_hit) / nullif(sum(heap_blks_hit) + sum(heap_blks_read), 0), 2)
    from pg_statio_user_tables
  ),
  'tables', (
    select coalesce(jsonb_agg(t), '[]'::jsonb) from (
      select relname, n_live_tup as live, n_dead_tup as dead, pg_size_pretty(pg_total_relation_size(relid)) as size
      from pg_stat_user_tables
      where relname in ('games', 'game_players', 'game_log', 'chat_messages', 'chat_message_reactions', 'votes',
                        'night_actions', 'game_state_version', 'game_roles_secret', 'user_presence')
      order by pg_total_relation_size(relid) desc
    ) t
  ),
  'recent_games', (
    select coalesce(jsonb_agg(g), '[]'::jsonb) from (
      select gm.status, gm.night_number as nights,
             (select count(*) from public.game_players gp where gp.game_id = gm.id) as players,
             (select count(*) from public.chat_messages cm where cm.game_id = gm.id) as chat_messages,
             (select count(*) from public.game_log gl where gl.game_id = gm.id) as log_lines
      from public.games gm
      where gm.created_at > now() - interval '3 hours'
      order by gm.created_at desc limit 8
    ) g
  )
) as perf;
