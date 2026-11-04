-- Diagnostic de performance, ÉTAPE 1/2 — à lancer JUSTE AVANT une partie de test (8 joueurs ou plus, idéalement 2 nuits).
--   node scripts/run-sql-file.mjs supabase/diagnostics/perf_game_before.sql
-- Remet à zéro les compteurs de requêtes (pg_stat_statements) pour ne mesurer QUE la partie de test. Ne modifie aucune donnée de jeu.
-- Puis jouez la partie, et lancez perf_game_after.sql juste après (avec query-sql-file.mjs).
select extensions.pg_stat_statements_reset();
