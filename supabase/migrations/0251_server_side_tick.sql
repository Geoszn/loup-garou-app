-- 0251 — Chronomètre côté serveur : les phases n'attendent plus un navigateur.
--
-- Avant : c'est le navigateur de l'hôte qui appelle tick_game toutes les 2 s
-- (les autres joueurs toutes les 8 s, en relais — voir useGame.ts). Quand le
-- chrono arrive à zéro, la partie attendait donc le prochain tick d'un téléphone :
-- plusieurs secondes de plus si la base ramait ou si l'hôte avait mis l'appli
-- en arrière-plan.
--
-- Ici, pg_cron appelle server_tick_games() chaque seconde : pour chaque partie
-- dont l'échéance (+ le délai de grâce de 2 s d'advance_phase, qui protège les
-- votes de dernière seconde) est dépassée, on appelle tick_game (inchangée,
-- avec son verrou consultatif). Les clients gardent un tick de secours, beaucoup
-- plus rare tant que server_tick_alive() répond vrai (voir useGame.ts).
--
-- À FAIRE UNE FOIS dans le tableau de bord Supabase si la migration affiche
-- « pg_cron indisponible » : Database → Extensions → pg_cron → Enable, puis
-- rejouer cette migration (elle est rejouable).
--
-- RETOUR EN ARRIÈRE (sans rien perdre) :
--   select cron.unschedule('server-tick-games');
--   select cron.unschedule('purge-cron-history');
set search_path = public;

-- 1. Index : retrouver les parties en cours dont l'échéance est passée sans
--    parcourir toutes les parties terminées.
create index if not exists games_active_deadline_idx
  on public.games (phase_deadline)
  where status not in ('lobby', 'ended');

-- 2. Battement de cœur : les clients savent ainsi si le chronomètre serveur
--    tourne (et peuvent ralentir leur propre tick de secours).
create table if not exists public.server_tick_heartbeat (
  id int primary key check (id = 1),
  beat_at timestamptz not null default now()
);
alter table public.server_tick_heartbeat enable row level security;
revoke all on table public.server_tick_heartbeat from anon, authenticated;
insert into public.server_tick_heartbeat (id) values (1) on conflict (id) do nothing;

-- 3. Le tick serveur. Chaque partie est traitée dans son propre bloc : une
--    erreur dans l'une ne bloque pas les autres (ni le battement de cœur).
create or replace function public.server_tick_games()
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
  v_count int := 0;
begin
  -- Réécrit au plus toutes les 10 s : pas d'écriture inutile à chaque seconde.
  update public.server_tick_heartbeat
  set beat_at = now()
  where id = 1 and beat_at < now() - interval '10 seconds';

  for v_id in
    select id
    from public.games
    where status not in ('lobby', 'ended')
      and phase_deadline is not null
      and phase_deadline + interval '2 seconds' <= now()
  loop
    begin
      perform public.tick_game(v_id);
      v_count := v_count + 1;
    exception when others then
      raise warning 'server_tick_games : partie % : %', v_id, sqlerrm;
    end;
  end loop;

  return v_count;
end;
$$;

revoke all on function public.server_tick_games() from public, anon, authenticated;

-- 4. Réponse aux clients : le chronomètre serveur tourne-t-il ? (battement < 25 s)
create or replace function public.server_tick_alive()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((select beat_at > now() - interval '25 seconds' from public.server_tick_heartbeat where id = 1), false);
$$;

revoke all on function public.server_tick_alive() from public, anon;
grant execute on function public.server_tick_alive() to authenticated;

-- 5. Planification pg_cron (rejouable : l'ancien planning est retiré d'abord).
do $$
begin
  begin
    create extension if not exists pg_cron;
  exception when others then
    raise notice 'pg_cron indisponible (%) : activez-le dans Database > Extensions, puis rejouez cette migration.', sqlerrm;
    return;
  end;

  perform cron.unschedule(jobid) from cron.job where jobname in ('server-tick-games', 'purge-cron-history');

  begin
    perform cron.schedule('server-tick-games', '1 seconds', 'select public.server_tick_games()');
  exception when others then
    -- Anciennes versions de pg_cron : pas de planification à la seconde.
    raise notice 'planification à la seconde refusée (%) : essai toutes les 2 secondes.', sqlerrm;
    perform cron.schedule('server-tick-games', '2 seconds', 'select public.server_tick_games()');
  end;

  -- Une exécution par seconde remplirait vite cron.job_run_details : purge quotidienne.
  perform cron.schedule('purge-cron-history', '17 4 * * *', $job$delete from cron.job_run_details where end_time < now() - interval '1 day'$job$);
end;
$$;
