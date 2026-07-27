-- ============================================================================
-- Correctif : les policies RLS de "games", "game_players" et "game_log"
-- utilisaient une sous-requête sur game_players DEPUIS une policy de
-- game_players elle-même. Postgres refuse ce schéma (policy qui se
-- référence, directement ou indirectement, elle-même) avec l'erreur :
--   "infinite recursion detected in policy for relation game_players"
--
-- Solution standard : passer par une fonction SECURITY DEFINER, qui
-- s'exécute avec les droits du propriétaire de la table et BYPASS donc le
-- RLS en interne, ce qui casse la boucle de ré-évaluation des policies.
-- ============================================================================
set search_path = public;

create or replace function public.is_game_participant(p_game_id uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1 from public.game_players
    where game_id = p_game_id and user_id = auth.uid()
  );
$$;

grant execute on function public.is_game_participant(uuid) to authenticated;

drop policy if exists "game_players_select_participants" on public.game_players;
create policy "game_players_select_participants" on public.game_players
  for select using (public.is_game_participant(game_players.game_id));

drop policy if exists "games_select_participants" on public.games;
create policy "games_select_participants" on public.games
  for select using (public.is_game_participant(games.id));

drop policy if exists "game_log_select_participants" on public.game_log;
create policy "game_log_select_participants" on public.game_log
  for select using (public.is_game_participant(game_log.game_id));
