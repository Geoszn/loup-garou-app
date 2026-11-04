-- Règle le plafond de joueurs en ligne (migration 0256) :
--   node scripts/run-sql-file.mjs supabase/ops/set_server_capacity.sql
-- Modifiez la valeur ci-dessous AVANT de lancer. NULL = aucun plafond.
-- Repère : environ 80 % de la limite de connexions Realtime de votre plan (200 gratuit, 500 Pro, 10 000 Pro sans plafond de dépense / Team). Plan gratuit : 160.
update public.server_capacity set max_online = 160 where id = 1;
select public.refresh_server_capacity();
