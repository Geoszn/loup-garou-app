-- ============================================================================
-- Fermeture entière du salon par l'hôte (retour utilisateur : "pas juste de
-- quitter mais de pouvoir entièrement fermer"). Jusqu'ici, un hôte qui
-- quittait le salon d'attente (leave_game) ne faisait que transférer son
-- rôle au joueur suivant (voir _remove_player, migration 0060) — le salon
-- continuait d'exister pour tout le monde. Cette migration ajoute un geste
-- distinct et volontaire : fermer le salon pour TOUS les joueurs d'un coup,
-- réservé au salon d'attente (avant le lancement d'une partie).
--
-- Choix d'implémentation : plutôt que de supprimer la partie (ce qui
-- laisserait les autres joueurs face à une erreur générique "vous ne
-- participez pas à cette partie", indiscernable d'un bug), on bascule sur
-- status='ended' avec un nouveau winner_team='closed' — réutilise tout le
-- mécanisme déjà en place pour renvoyer chaque joueur vers l'écran de fin
-- (voir l'effet de redirection existant dans Lobby.tsx, déclenché par tout
-- statut différent de 'lobby'), avec un écran dédié bien plus clair qu'une
-- simple erreur (voir EndScreen dans GameRoom.tsx, nouvelle branche
-- winner === 'closed').
-- ============================================================================
set search_path = public;

alter table public.games drop constraint if exists games_winner_team_check;
alter table public.games add constraint games_winner_team_check
  check (winner_team = any (array['village', 'loups', 'amoureux', 'anancy', 'ange', 'chasseuse', 'closed']));

create or replace function public.close_lobby(p_game_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_game public.games%rowtype;
begin
  select * into v_game from public.games where id = p_game_id for update;
  if not found then
    raise exception 'Partie introuvable.';
  end if;
  if v_game.host_id <> auth.uid() then
    raise exception 'Seul l''hôte peut fermer le salon.';
  end if;
  if v_game.status <> 'lobby' then
    raise exception 'Le salon ne peut être fermé qu''avant le lancement de la partie.';
  end if;

  update public.games
  set status = 'ended', winner_team = 'closed', phase_deadline = null
  where id = p_game_id;

  insert into public.game_log (game_id, message) values (p_game_id, '🚪 L''hôte a fermé le salon.');
end;
$$;

grant execute on function public.close_lobby(uuid) to authenticated;
