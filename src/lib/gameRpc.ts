import { supabase } from './supabase'

// Les actions de jeu (voter, agir la nuit, se déclarer prêt...) renvoient juste
// « ok » : l'écran du joueur (bannière « vote enregistré », bouton qui passe en
// attente, étape suivante) se met à jour quand useGame relit l'état de la
// partie. Cette relecture venait seulement d'un évènement Realtime ou du
// sondage de secours — donc, pour toute action qui ne modifie pas la ligne de
// la partie (ex. « je suis prêt »), la confirmation pouvait mettre plusieurs
// secondes à apparaître. gameRpc prévient useGame dès qu'une action aboutit,
// pour relire l'état tout de suite (voir onGameAction).
const EVENT = 'lg-game-action'

export async function gameRpc(fn: string, args?: Record<string, unknown>) {
  const result = await supabase.rpc(fn, args)
  if (!result.error && typeof window !== 'undefined') window.dispatchEvent(new Event(EVENT))
  return result
}

/** Appelle `cb` à chaque action de jeu réussie ; renvoie la fonction de désabonnement. */
export function onGameAction(cb: () => void): () => void {
  window.addEventListener(EVENT, cb)
  return () => window.removeEventListener(EVENT, cb)
}
