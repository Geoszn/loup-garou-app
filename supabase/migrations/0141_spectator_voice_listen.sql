-- ============================================================================
-- Extension du mode spectateur (migration 0140) au vocal : demande
-- utilisateur "donne-leur la possibilité d'écouter et d'entendre ce qui se
-- passe" — jusqu'ici seul le texte (village + cimetière) était accessible.
--
-- Même principe qu'un fantôme qui écoute le village (migration 0041) :
-- can_listen_channel autorise déjà ça pour un mort de la partie ; on ajoute
-- ici la même dérogation en écoute seule pour un spectateur (pas encore
-- membre, demande "pending" en attente — voir game_join_requests). Jamais de
-- jeton propriétaire (réservé à l'hôte réel via game_players.is_host, voir
-- api/daily-room.ts) et le client rejoint toujours avec listenOnly=true
-- (userData.ghost=true), donc jamais de micro publié ni visible dans la
-- liste des participants.
-- ============================================================================
set search_path = public;

create or replace function public.can_listen_channel(p_game_id uuid, p_channel text)
returns boolean
language plpgsql
security definer
stable
set search_path = public
as $$
declare
  v_status text;
  v_alive boolean;
  v_banned boolean;
begin
  if p_channel <> 'village' then
    return public.can_access_channel(p_game_id, p_channel);
  end if;

  select status into v_status from public.games where id = p_game_id;
  if v_status is null then return false; end if;

  select is_alive, is_banned into v_alive, v_banned
  from public.game_players where game_id = p_game_id and user_id = auth.uid();

  if v_alive is null then
    -- Pas participant : peut-être un spectateur avec une demande "pending"
    -- (voir get_spectator_game_view, migration 0140) — même règle qu'un
    -- fantôme, écoute seule uniquement.
    if exists (
      select 1 from public.game_join_requests
      where game_id = p_game_id and user_id = auth.uid() and status = 'pending'
    ) then
      return v_status in ('day_reveal', 'day_discussion', 'day_vote', 'captain_election');
    end if;
    return false;
  end if;

  if v_banned then return false; end if;

  if v_alive then
    return v_status in ('day_reveal', 'day_discussion', 'day_vote', 'captain_election');
  end if;

  -- fantôme : peut écouter le village dès qu'il y a effectivement du vocal
  -- côté vivants (mêmes phases), à tout moment de la partie.
  return v_status in ('day_reveal', 'day_discussion', 'day_vote', 'captain_election');
end;
$$;

grant execute on function public.can_listen_channel(uuid, text) to authenticated;
