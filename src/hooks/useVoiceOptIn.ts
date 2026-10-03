import { useCallback, useSyncExternalStore } from 'react'

// Le vocal Daily est facturé à la minute de CONNEXION (pas de parole), voir
// api/daily-room.ts. Plutôt que de connecter chaque joueur dès qu'il ouvre le
// salon d'attente ou la partie, on attend qu'il appuie sur « Rejoindre le
// vocal » — les joueurs muets, spectateurs et passages éclair ne coûtent
// plus rien.
//
// Le choix est mémorisé PAR PARTIE dans sessionStorage (onglet courant) :
// - rejoindre dans le salon d'attente garde le joueur connecté en passant au
//   jeu (village, loups, cimetière), sans redemander à chaque phase ;
// - un rechargement de la page le reconnecte ;
// - une nouvelle partie, ou un nouvel onglet, repart de « non rejoint ».
// Plusieurs <VoiceChat> peuvent coexister (onglets Village / Loups, etc.) :
// l'évènement ci-dessous les garde synchronisés.
const EVENT = 'lg-voice-optin'
const memory = new Set<string>() // repli si sessionStorage est indisponible
const keyOf = (gameId: string) => `lg-voice-joined-${gameId}`

function read(gameId: string): boolean {
  try {
    return sessionStorage.getItem(keyOf(gameId)) === '1'
  } catch {
    return memory.has(gameId)
  }
}

function write(gameId: string, joined: boolean) {
  if (joined) memory.add(gameId)
  else memory.delete(gameId)
  try {
    if (joined) sessionStorage.setItem(keyOf(gameId), '1')
    else sessionStorage.removeItem(keyOf(gameId))
  } catch {
    // stockage indisponible : le repli en mémoire ci-dessus suffit pour cette session
  }
  window.dispatchEvent(new Event(EVENT))
}

/** [a rejoint le vocal, setter] pour la partie `gameId`. */
export function useVoiceOptIn(gameId: string) {
  const subscribe = useCallback((onChange: () => void) => {
    window.addEventListener(EVENT, onChange)
    return () => window.removeEventListener(EVENT, onChange)
  }, [])
  const joined = useSyncExternalStore(subscribe, () => read(gameId), () => false)
  const setJoined = useCallback((value: boolean) => write(gameId, value), [gameId])
  return [joined, setJoined] as const
}
