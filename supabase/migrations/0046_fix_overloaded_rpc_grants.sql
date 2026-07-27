-- ============================================================================
-- Corrige une régression introduite par 0045_lock_down_rpc_execute.sql.
--
-- Cause : deux fonctions ont été étendues au fil des migrations en ajoutant
-- un paramètre supplémentaire (avec valeur par défaut) plutôt qu'en gardant
-- exactement la même signature :
--   - create_game(text, jsonb)        →  create_game(text, jsonb, boolean)
--     (p_is_public ajouté en 0033_public_games.sql)
--   - send_chat_message(uuid, text, text)
--                                      →  send_chat_message(uuid, text, text, uuid)
--     (p_reply_to ajouté en 0041_debate_extend_reply_ghost_listen_night_recap.sql)
--
-- En PostgreSQL, `create or replace function` ne remplace une fonction que
-- si la liste de types de paramètres est identique. Avec un paramètre en
-- plus, ce n'est PAS un remplacement : c'est une nouvelle fonction distincte
-- (une "surcharge") qui coexiste avec l'ancienne. Les deux migrations
-- d'origine n'ont donc jamais "cassé" l'ancienne version — elles en ont
-- juste créé une seconde à côté, sans lui donner son propre
-- `grant execute`. Tant que l'exécution était ouverte par défaut à PUBLIC,
-- ça ne se voyait pas. Depuis 0045 (qui retire ce défaut et ne regrant que
-- les signatures qui avaient un `grant` explicite dans l'historique), la
-- signature à 3/4 paramètres — celle que le client appelle réellement,
-- avec p_is_public / p_reply_to — s'est retrouvée sans aucun droit
-- d'exécution, d'où le blocage silencieux (permission denied) : envoi de
-- message impossible pendant la nuit comme le jour, création de partie
-- cassée pour les parties publiques.
--
-- Correction : accorder l'exécution sur les DEUX signatures qui existent
-- réellement en base, pour ne rien casser si un ancien appel (sans le
-- nouveau paramètre) traîne encore quelque part.
-- ============================================================================
set search_path = public;

grant execute on function public.create_game(text, jsonb, boolean) to authenticated;
grant execute on function public.create_game(text, jsonb) to authenticated;

grant execute on function public.send_chat_message(uuid, text, text, uuid) to authenticated;
grant execute on function public.send_chat_message(uuid, text, text) to authenticated;
