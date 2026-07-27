-- ============================================================================
-- Sécurité : RLS + Realtime
--
-- Principe : les tables sensibles (rôles secrets, actions de nuit, votes) ne
-- sont JAMAIS lisibles directement par les clients. Toute lecture/écriture
-- passe par des fonctions RPC "security definer" (voir 0003_functions.sql)
-- qui appliquent elles-mêmes la logique de visibilité (ex: un joueur ne voit
-- son propre rôle, ou celui d'un coéquipier loup-garou, ou d'un joueur mort).
-- ============================================================================

alter table public.profiles enable row level security;
alter table public.games enable row level security;
alter table public.game_players enable row level security;
alter table public.game_roles_secret enable row level security;
alter table public.night_actions enable row level security;
alter table public.votes enable row level security;
alter table public.game_log enable row level security;

-- profiles : chacun ne voit / modifie que sa propre ligne
drop policy if exists "profiles_select_own" on public.profiles;
create policy "profiles_select_own" on public.profiles
  for select using (id = auth.uid());

drop policy if exists "profiles_update_own" on public.profiles;
create policy "profiles_update_own" on public.profiles
  for update using (id = auth.uid());

-- games : visible seulement par les joueurs qui y participent
drop policy if exists "games_select_participants" on public.games;
create policy "games_select_participants" on public.games
  for select using (
    exists (
      select 1 from public.game_players gp
      where gp.game_id = games.id and gp.user_id = auth.uid()
    )
  );

-- game_players : visible seulement par les joueurs de la même partie
-- (cette table ne contient jamais le rôle, donc aucun risque de fuite)
drop policy if exists "game_players_select_participants" on public.game_players;
create policy "game_players_select_participants" on public.game_players
  for select using (
    exists (
      select 1 from public.game_players me
      where me.game_id = game_players.game_id and me.user_id = auth.uid()
    )
  );

-- game_log : visible seulement par les joueurs de la même partie
drop policy if exists "game_log_select_participants" on public.game_log;
create policy "game_log_select_participants" on public.game_log
  for select using (
    exists (
      select 1 from public.game_players gp
      where gp.game_id = game_log.game_id and gp.user_id = auth.uid()
    )
  );

-- game_roles_secret, night_actions, votes : AUCUNE policy = accès direct
-- totalement bloqué pour les rôles anon/authenticated. Seules les fonctions
-- "security definer" (exécutées avec les droits du propriétaire, qui n'est
-- pas soumis au RLS) peuvent lire/écrire ces tables.

-- ----------------------------------------------------------------------------
-- Realtime : on ne publie que les tables sans données secrètes
-- ----------------------------------------------------------------------------
alter table public.games replica identity full;
alter table public.game_players replica identity full;
alter table public.game_log replica identity full;

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and tablename = 'games'
  ) then
    alter publication supabase_realtime add table public.games;
  end if;
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and tablename = 'game_players'
  ) then
    alter publication supabase_realtime add table public.game_players;
  end if;
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and tablename = 'game_log'
  ) then
    alter publication supabase_realtime add table public.game_log;
  end if;
end $$;
