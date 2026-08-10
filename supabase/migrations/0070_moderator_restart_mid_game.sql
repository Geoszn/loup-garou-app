-- ============================================================================
-- Demande : permettre à l'hôte (modérateur) de recommencer la partie même
-- en cours de jeu (bug bloquant, dispute, joueur à recadrer...), pas
-- seulement une fois la partie terminée comme aujourd'hui.
--
-- restart_game (0041_debate_extend_reply_ghost_listen_night_recap.sql)
-- refusait tout statut différent de 'ended'. Le corps de la fonction
-- nettoyait déjà TOUT l'état de manche en cours (rôles secrets, actions de
-- nuit, votes, chat, journal, statut/étape/deadline...), donc rien d'autre
-- à ajuster que la garde elle-même : on n'interdit plus que le redémarrage
-- d'un salon qui n'a pas encore commencé (statut 'lobby', rien à
-- interrompre).
--
-- Exposé côté client dans ModerationPanel.tsx (déjà réservé à l'hôte, déjà
-- affiché aussi bien dans le salon qu'en pleine partie via le menu ⋮ de
-- GameRoom) — nouveau bouton "Recommencer la partie", avec confirmation
-- appuyée vu le caractère irréversible et immédiat pour tout le monde.
-- La redirection de tous les joueurs vers le salon dès que status repasse
-- à 'lobby' est déjà gérée par l'effet existant dans GameRoom.tsx, aucun
-- changement nécessaire côté propagation temps réel.
-- ============================================================================
set search_path = public;

create or replace function public.restart_game(p_game_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_game public.games%rowtype;
begin
  select * into v_game from public.games where id = p_game_id for update;
  if not found then raise exception 'Partie introuvable.'; end if;
  if v_game.host_id <> v_user then raise exception 'Seul l’hôte peut relancer une partie.'; end if;
  if v_game.status = 'lobby' then raise exception 'La partie n’a pas encore commencé.'; end if;

  delete from public.game_players where game_id = p_game_id and is_banned;

  delete from public.game_roles_secret where game_id = p_game_id;
  delete from public.night_actions where game_id = p_game_id;
  delete from public.votes where game_id = p_game_id;
  delete from public.vote_call_agreements where game_id = p_game_id;
  delete from public.vote_recap_ready where game_id = p_game_id;
  delete from public.day_reveal_ready where game_id = p_game_id;
  delete from public.chat_messages where game_id = p_game_id;
  delete from public.game_log where game_id = p_game_id;

  update public.game_players
  set is_alive = true, death_cause = null, died_at_night = null, is_lover = false, revealed_role = null,
      is_captain = false, is_ready = false
  where game_id = p_game_id;

  update public.games
  set status = 'lobby',
      night_number = 0,
      night_step = null,
      phase_deadline = null,
      winner_team = null,
      hunter_pending = null,
      hunter_context = null,
      captain_pending = null,
      last_vote_captain_id = null,
      night_deaths_resolved = false,
      day_vote_resolved = false
  where id = p_game_id;

  insert into public.game_log (game_id, message) values (p_game_id, '🔄 Une nouvelle partie va commencer avec le même groupe !');
end;
$$;
