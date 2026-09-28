-- ============================================================================
-- tick_game : remplace la file d'attente sur la ligne `games` par un verrou
-- consultatif NON bloquant.
--
-- Incident du 2026-09-28 : base signalée "Unhealthy" (Database/PostgREST/
-- Auth), logs montrant des verrous mettant 1 à 4+ secondes à s'obtenir en
-- boucle sur la même ligne, parties entières bloquées pour tous les joueurs.
--
-- Cause : tick_game (via advance_phase, migration 0180) prend un verrou
-- FOR UPDATE — bloquant — sur la ligne `games`. Ce RPC est appelé par
-- CHAQUE client connecté à une partie toutes les 1,5 secondes (voir
-- useGame.ts), juste pour vérifier si le délai de la phase en cours est
-- écoulé. Avec N joueurs dans le salon, ça fait jusqu'à N appels/1,5s qui
-- font TOUS la queue pour le même verrou — alors qu'un seul de ces appels a
-- réellement quelque chose à faire (les autres ne trouvent rien à avancer
-- et ressortent aussitôt). Sous charge réelle (plusieurs parties actives
-- en même temps sur une instance encore en Nano), cette file d'attente
-- purement redondante suffit à faire grimper le temps d'acquisition à
-- plusieurs secondes et à tout bloquer en cascade.
--
-- Fix : si un autre appel de tick_game pour CETTE MÊME partie est déjà en
-- train de tourner, tous les appels concurrents ressortent IMMÉDIATEMENT
-- sans jamais toucher la ligne `games` ni faire la queue (pg_try_advisory_
-- xact_lock, contrairement à pg_advisory_xact_lock utilisé migration 0198,
-- ne bloque jamais — il renvoie false tout de suite si le verrou est déjà
-- pris). Un seul appel par intervalle passe réellement par advance_phase.
--
-- advance_phase lui-même n'est PAS modifié : les vrais appels d'action
-- (vote, action de nuit, capitaine...) continuent de passer par son verrou
-- FOR UPDATE bloquant habituel, qui reste nécessaire pour leur exactitude —
-- ce correctif ne cible QUE le sondage redondant de tick_game.
-- ============================================================================
set search_path = public;

create or replace function public.tick_game(p_game_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if pg_try_advisory_xact_lock(hashtextextended(p_game_id::text, 2)) then
    perform public.advance_phase(p_game_id, false);
  end if;
end;
$$;
