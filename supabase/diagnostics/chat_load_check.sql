-- Diagnostic LECTURE SEULE : le chat est-il le goulot Realtime ? Ne modifie rien.
--   node scripts/query-sql-file.mjs supabase/diagnostics/chat_load_check.sql
-- Complète realtime_load.sql (abonnements ouverts, connexions). À lancer idéalement
-- le soir, pendant que des parties tournent, et le résultat est un JSON sans secret.
--
--  - chat_volume : messages / réactions / identités sur 24 h et 7 j, et pic par minute.
--  - chat_per_game : messages par partie (moyenne, p95, max) et joueurs par partie.
--  - est_rls_checks_24h : estimation des vérifications de droits déclenchées par le
--    chat sur 24 h = pour chaque évènement, nombre de joueurs de la partie (1 abonnement
--    par joueur depuis chatRealtime.ts). Hypothèse déduite du code, pas mesurée.
--  - pg_stat_statements : temps cumulé (depuis stats_reset) de can_read_channel,
--    realtime.apply_rls, get_my_game_view, server_tick_games, et part du temps base total.
--    Si can_read_channel / apply_rls pèsent peu : le chat n'est PAS le goulot.
with msg as (
  select m.game_id, m.created_at from public.chat_messages m where m.created_at > now() - interval '7 days'
),
players as (
  select game_id, count(*) as n from public.game_players group by 1
),
per_game as (
  select g.game_id, count(*) as msgs, coalesce(p.n, 0) as players
  from msg g left join players p using (game_id)
  where g.created_at > now() - interval '7 days'
  group by g.game_id, p.n
),
per_minute as (
  select date_trunc('minute', created_at) as mn, game_id, count(*) as c
  from msg where created_at > now() - interval '7 days'
  group by 1, 2
),
stmts as (
  select query, calls, total_exec_time, mean_exec_time
  from extensions.pg_stat_statements
),
tot as (select coalesce(sum(total_exec_time), 0) as t from stmts)
select jsonb_build_object(
  'chat_volume', jsonb_build_object(
    'messages_24h', (select count(*) from public.chat_messages where created_at > now() - interval '24 hours'),
    'messages_7d', (select count(*) from msg),
    'reactions_24h', (select count(*) from public.chat_message_reactions where created_at > now() - interval '24 hours'),
    'identities_24h', (select count(*) from public.chat_message_identities where created_at > now() - interval '24 hours'),
    'peak_messages_per_minute_one_game_7d', (select coalesce(max(c), 0) from per_minute),
    'peak_messages_per_minute_all_games_7d', (select coalesce(max(s), 0) from (select sum(c) as s from per_minute group by mn) x)
  ),
  'chat_per_game', jsonb_build_object(
    'games_with_chat_7d', (select count(*) from per_game),
    'avg_messages', (select round(coalesce(avg(msgs), 0)::numeric, 1) from per_game),
    'p95_messages', (select coalesce(percentile_cont(0.95) within group (order by msgs), 0) from per_game),
    'max_messages', (select coalesce(max(msgs), 0) from per_game),
    'avg_players', (select round(coalesce(avg(players), 0)::numeric, 1) from per_game)
  ),
  'est_rls_checks_24h', jsonb_build_object(
    'messages', (select coalesce(sum(coalesce(p.n, 0)), 0)
                 from public.chat_messages m left join players p on p.game_id = m.game_id
                 where m.created_at > now() - interval '24 hours'),
    'reactions', (select coalesce(sum(coalesce(p.n, 0)), 0)
                  from public.chat_message_reactions r left join players p on p.game_id = r.game_id
                  where r.created_at > now() - interval '24 hours'),
    'identities', (select coalesce(sum(coalesce(p.n, 0)), 0)
                   from public.chat_message_identities i left join players p on p.game_id = i.game_id
                   where i.created_at > now() - interval '24 hours')
  ),
  'pg_stat_statements', jsonb_build_object(
    'stats_reset', (select stats_reset from extensions.pg_stat_statements_info),
    'total_db_time_s', (select round((t / 1000)::numeric, 1) from tot),
    'watched', (
      select coalesce(jsonb_agg(w order by (w->>'total_s')::numeric desc), '[]'::jsonb)
      from (
        select jsonb_build_object(
          'name', k.name,
          'calls', coalesce(sum(s.calls), 0),
          'total_s', round((coalesce(sum(s.total_exec_time), 0) / 1000)::numeric, 1),
          'mean_ms', round(coalesce(avg(s.mean_exec_time), 0)::numeric, 1),
          'pct_of_db_time', round((100 * coalesce(sum(s.total_exec_time), 0) / nullif((select t from tot), 0))::numeric, 1)
        ) as w
        from (values ('can_read_channel'), ('apply_rls'), ('get_my_game_view'), ('server_tick_games'),
                     ('get_game_version'), ('touch_presence'), ('chat_messages')) as k(name)
        left join stmts s on s.query ilike '%' || k.name || '%'
        group by k.name
      ) z
    )
  )
) as chat_load;
