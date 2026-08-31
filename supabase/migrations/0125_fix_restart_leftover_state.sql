-- ----------------------------------------------------------------------------
-- BUG CORRIGÉ (retour utilisateur : "énormément de bugs autour des cartes
-- échangées", partie précédente) : restart_game ("Rejouer avec le même
-- groupe") nettoie game_roles_secret, night_actions, votes, etc. avant de
-- redistribuer les rôles — mais oubliait TROIS tables liées à des rôles/
-- fonctionnalités ajoutées depuis son écriture initiale, jamais mises à
-- jour en même temps :
--
-- 1. anancy_swapped_players (Anancy, migration 0119) — la cause la plus
--    probable du chaos décrit. Ses lignes d'une partie précédente
--    restaient en base après un restart : dans la NOUVELLE partie (même
--    game_id), submit_anancy refusait à tort de cibler des joueurs
--    "déjà touchés" alors qu'ils ne l'avaient jamais été cette fois-ci, ET
--    get_my_game_view (anancy_swapped_me) pouvait déclencher de FAUSSES
--    notices privées "🕸️ Le destin a changé" dès que le night_number de la
--    nouvelle partie recoupait par coïncidence une valeur swapped_at_night
--    laissée par l'ancienne — sans qu'aucun échange réel n'ait eu lieu.
--    Repéré une première fois plus tôt dans la session (nettoyage manuel
--    d'une partie affectée) sans en identifier alors la cause racine.
--
-- 2. quest_game_sync (quêtes quotidiennes, migration 0112) — sync_daily_
--    quests_for_game() n'accorde la progression des quêtes qu'une seule
--    fois par (utilisateur, game_id) : sans nettoyage, une partie rejouée
--    ne crédite plus jamais aucune quête à sa fin.
--
-- 3. reward_drops (coffre de fin de partie, migration 0111) : même
--    principe, claim_end_of_game_reward() renvoie le résultat de la
--    partie précédente au lieu d'en tirer un nouveau.
-- ----------------------------------------------------------------------------

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
  if v_game.host_id <> v_user then raise exception 'Seul l''hôte peut relancer une partie.'; end if;
  if v_game.status = 'lobby' then raise exception 'La partie n''a pas encore commencé.'; end if;

  delete from public.game_players where game_id = p_game_id and is_banned;

  delete from public.game_roles_secret where game_id = p_game_id;
  delete from public.night_actions where game_id = p_game_id;
  delete from public.votes where game_id = p_game_id;
  delete from public.vote_call_agreements where game_id = p_game_id;
  delete from public.vote_recap_ready where game_id = p_game_id;
  delete from public.day_reveal_ready where game_id = p_game_id;
  delete from public.chat_messages where game_id = p_game_id;
  delete from public.game_log where game_id = p_game_id;
  delete from public.alpha_infect_agreements where game_id = p_game_id;
  delete from public.anancy_swapped_players where game_id = p_game_id;
  delete from public.quest_game_sync where game_id = p_game_id;
  delete from public.reward_drops where game_id = p_game_id;

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
