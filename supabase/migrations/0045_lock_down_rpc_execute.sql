-- ============================================================================
-- Durcissement sécurité : retire le droit d'exécution par défaut que
-- PostgreSQL accorde automatiquement à PUBLIC (donc à anon/authenticated,
-- via PostgREST) sur TOUTE nouvelle fonction créée dans le schéma public.
--
-- Problème corrigé : aucune des 44 migrations précédentes ne fait de
-- `revoke`. Les fonctions destinées à un usage client (create_game,
-- submit_vote, ...) ont bien un `grant execute ... to authenticated`
-- explicite — mais les fonctions pensées comme des *helpers internes*,
-- appelées uniquement depuis d'autres fonctions "security definer" de
-- confiance, n'en ont jamais eu besoin pour fonctionner et n'en ont donc
-- jamais reçu. Résultat : elles restaient exécutables directement par
-- n'importe quel utilisateur connecté via `supabase.rpc(...)`, en
-- contournant tous les contrôles (hôte, appartenance à la partie, rôle...)
-- que la fonction publique censée les protéger effectue avant de les
-- appeler. Exemples concrets :
--   - `_remove_player(game_id, user_id, kicked)` : aucune vérification
--     d'auth.uid()/hôte en interne (c'est `kick_player` qui la fait avant
--     d'appeler `_remove_player`) — appelable directement, n'importe qui
--     aurait pu exclure/éliminer n'importe quel joueur de n'importe quelle
--     partie.
--   - `get_wolf_target(game_id, night)` : révèle la cible des loups-garous
--     — appelable directement par n'importe quel joueur, y compris hors
--     partie, sans passer par la vérification de rôle faite dans
--     `get_my_game_view`.
--   - `advance_phase`, `begin_night`, `kill_player`,
--     `resolve_night_deaths`, `resolve_day_vote_deaths`,
--     `resolve_captain_election`, `check_and_apply_win`,
--     `_add_player_to_game`, `next_night_step` : mutent l'état du jeu sans
--     aucun contrôle d'appartenance.
--
-- Note : les appels internes (une fonction security definer qui appelle
-- une autre fonction via `perform public.xxx(...)`) continuent de
-- fonctionner sans rien changer : à l'intérieur d'une fonction security
-- definer, le rôle effectif est celui du PROPRIÉTAIRE de la fonction (qui a
-- implicitement tous les droits sur ses propres objets), pas celui de
-- l'utilisateur qui a initié l'appel HTTP. Seul l'appel RPC direct depuis
-- le client (qui s'exécute, lui, avec le rôle anon/authenticated réel) est
-- bloqué par ce revoke.
-- ============================================================================
set search_path = public;

revoke execute on all functions in schema public from public, anon, authenticated;

-- Empêche que ce trou de sécurité ne se reproduise silencieusement : toute
-- future fonction créée dans ce schéma n'aura plus, par défaut, le droit
-- d'exécution accordé à PUBLIC. Chaque nouvelle fonction destinée au client
-- devra désormais recevoir un `grant execute ... to authenticated` (ou
-- `anon`) explicite dans sa propre migration pour être appelable.
alter default privileges in schema public revoke execute on functions from public;

-- ----------------------------------------------------------------------------
-- Re-grant explicite : uniquement les fonctions réellement appelées par le
-- client (src/**, api/**) ou par des policies RLS (can_access_channel,
-- can_read_channel, can_listen_channel — évaluées avec le rôle de
-- l'utilisateur qui lit la table, pas via security definer). Liste
-- reconstituée à partir de tous les `grant execute ... to authenticated`
-- déjà présents dans les migrations 0002 à 0044 : aucun changement de
-- fonctionnalité, seulement la fermeture de l'accès par défaut aux
-- fonctions qui n'y figuraient pas.
-- ----------------------------------------------------------------------------
grant execute on function public.can_access_channel(uuid, text) to authenticated;
grant execute on function public.can_listen_channel(uuid, text) to authenticated;
grant execute on function public.can_read_channel(uuid, text) to authenticated;
grant execute on function public.cancel_join_request(uuid) to authenticated;
grant execute on function public.create_game(text, jsonb) to authenticated;
grant execute on function public.dismiss_game_invite(uuid) to authenticated;
grant execute on function public.extend_phase_deadline(uuid, int) to authenticated;
grant execute on function public.get_invite_preview(text) to anon, authenticated;
grant execute on function public.get_leaderboard(int) to authenticated;
grant execute on function public.get_my_account_deletion_request() to authenticated;
grant execute on function public.get_my_active_game() to authenticated;
grant execute on function public.get_my_game_view(uuid) to authenticated;
grant execute on function public.get_my_join_request_status(uuid) to authenticated;
grant execute on function public.get_my_social() to authenticated;
grant execute on function public.get_my_stats() to authenticated;
grant execute on function public.invite_friend_to_game(uuid, uuid) to authenticated;
grant execute on function public.is_alive_petite_fille(uuid) to authenticated;
grant execute on function public.is_game_participant(uuid) to authenticated;
grant execute on function public.join_game(text, text) to authenticated;
grant execute on function public.kick_player(uuid, uuid) to authenticated;
grant execute on function public.leave_game(uuid) to authenticated;
grant execute on function public.list_public_games() to authenticated;
grant execute on function public.my_role_in_game(uuid) to authenticated;
grant execute on function public.remove_friend(uuid) to authenticated;
grant execute on function public.request_account_deletion() to authenticated;
grant execute on function public.request_join_public_game(uuid, text) to authenticated;
grant execute on function public.respond_friend_request(uuid, boolean) to authenticated;
grant execute on function public.respond_join_request(uuid, boolean) to authenticated;
grant execute on function public.restart_game(uuid) to authenticated;
grant execute on function public.send_chat_message(uuid, text, text) to authenticated;
grant execute on function public.send_friend_request(text) to authenticated;
grant execute on function public.send_friend_request_by_user_id(uuid) to authenticated;
grant execute on function public.set_blocked_words(uuid, text[]) to authenticated;
grant execute on function public.start_game(uuid) to authenticated;
grant execute on function public.step_duration_seconds(uuid, text) to authenticated;
grant execute on function public.submit_captain_call_vote(uuid) to authenticated;
grant execute on function public.submit_captain_succession(uuid, uuid) to authenticated;
grant execute on function public.submit_captain_vote(uuid, uuid) to authenticated;
grant execute on function public.submit_cupidon(uuid, uuid, uuid) to authenticated;
grant execute on function public.submit_day_reveal_ready(uuid) to authenticated;
grant execute on function public.submit_hunter_shot(uuid, uuid) to authenticated;
grant execute on function public.submit_ready(uuid) to authenticated;
grant execute on function public.submit_sorciere(uuid, boolean, uuid) to authenticated;
grant execute on function public.submit_voleur(uuid, text) to authenticated;
grant execute on function public.submit_vote(uuid, uuid) to authenticated;
grant execute on function public.submit_vote_call_agreement(uuid, boolean) to authenticated;
grant execute on function public.submit_vote_recap_ready(uuid) to authenticated;
grant execute on function public.submit_voyante(uuid, uuid) to authenticated;
grant execute on function public.submit_wolf_vote(uuid, uuid) to authenticated;
grant execute on function public.tick_game(uuid) to authenticated;
grant execute on function public.update_game_settings(uuid, jsonb) to authenticated;
grant execute on function public.update_my_language(text) to authenticated;
grant execute on function public.update_my_profile(text, text) to authenticated;

-- handle_new_user (trigger sur auth.users) n'a besoin d'aucun grant : les
-- fonctions déclenchées par un trigger s'exécutent avec les droits du
-- propriétaire de la fonction, jamais via un appel RPC direct du rôle
-- anon/authenticated — elle reste donc opérationnelle sans figurer dans la
-- liste ci-dessus.
