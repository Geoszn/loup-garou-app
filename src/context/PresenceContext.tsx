import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from './AuthContext'

// Volontairement SANS code de partie : ce statut est lisible par tous les amis et membres de tribu, y compris dans les
// outils de développement du navigateur. Y diffuser le code d'une partie permettait à n'importe quel ami, membre de
// tribu ou curieux de la rejoindre sans invitation ni validation de l'hôte (retour utilisateur du 2026-10-11).
export interface PresenceMeta {
  status: 'idle' | 'in_game'
}

interface PresenceContextValue {
  // Statut des amis et des membres de ma tribu actuellement en ligne (vus dans les 150 dernières secondes) — plus
  // « tous les connectés » comme avec l'ancien canal global : le filtrage sur la liste d'amis / de tribu se fait côté
  // consommateur (FriendsOnlineWidget.tsx, TribePanel.tsx), les autres n'ont jamais été affichés.
  onlineStatus: Record<string, PresenceMeta>
  // Nombre total de joueurs en ligne (compteur du village animé).
  onlineCount: number
  setMyStatus: (status: PresenceMeta['status']) => void
}

const PresenceContext = createContext<PresenceContextValue>({
  onlineStatus: {},
  onlineCount: 0,
  setMyStatus: () => {},
})

// Un battement toutes les 60 s (au lieu d'un canal Realtime de présence commun à tous les connectés : chaque arrivée ou
// départ y était rediffusé à tout le monde, coût en N² — voir migration 0252). touch_presence enregistre « je suis là »
// et renvoie, dans le même appel, le compteur et le statut des amis / de la tribu.
const BEAT_MS = 60_000

/**
 * Présence globale : sert à afficher « N amis en ligne » sur le tableau de bord, les membres de la tribu en ligne et le
 * compteur du village. Monté une seule fois (voir main.tsx, dans AuthProvider) ; GameRoom.tsx appelle
 * setMyStatus('in_game') à l'entrée d'une partie et setMyStatus('idle') en sortant.
 *
 * Un onglet caché n'envoie pas de battement (on n'est « en ligne » que si l'appli est visible) ; le retour au premier
 * plan en renvoie un tout de suite. Les invités n'apparaissent pas (et n'ont pas accès aux amis ni aux tribus).
 */
export function PresenceProvider({ children }: { children: ReactNode }) {
  const { user, isGuest } = useAuth()
  const [onlineStatus, setOnlineStatus] = useState<Record<string, PresenceMeta>>({})
  const [onlineCount, setOnlineCount] = useState(0)
  const statusRef = useRef<PresenceMeta['status']>('idle')
  const beatRef = useRef<() => void>(() => {})

  useEffect(() => {
    if (!user || isGuest) {
      setOnlineStatus({})
      setOnlineCount(0)
      return
    }
    let cancelled = false
    let busy = false

    async function beat() {
      if (busy || cancelled) return
      busy = true
      const { data, error } = await supabase.rpc('touch_presence', { p_status: statusRef.current })
      busy = false
      if (cancelled || error || !data) return
      const next: Record<string, PresenceMeta> = {}
      for (const [uid, status] of Object.entries((data.online ?? {}) as Record<string, string>)) {
        next[uid] = { status: status === 'in_game' ? 'in_game' : 'idle' }
      }
      setOnlineStatus(next)
      setOnlineCount(Number(data.online_count) || 0)
    }
    beatRef.current = () => void beat()

    void beat()
    // Décalage propre à chaque client : les 1 000 battements ne partent pas tous à la même seconde.
    const id = setInterval(() => {
      if (document.visibilityState === 'visible') void beat()
    }, BEAT_MS + Math.random() * 10_000)
    const onVisible = () => {
      if (document.visibilityState === 'visible') void beat()
    }
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      cancelled = true
      clearInterval(id)
      document.removeEventListener('visibilitychange', onVisible)
      beatRef.current = () => {}
      setOnlineStatus({})
      setOnlineCount(0)
    }
  }, [user?.id, isGuest])

  const setMyStatus = useCallback((status: PresenceMeta['status']) => {
    statusRef.current = status
    beatRef.current()
  }, [])

  return <PresenceContext.Provider value={{ onlineStatus, onlineCount, setMyStatus }}>{children}</PresenceContext.Provider>
}

export function usePresence() {
  return useContext(PresenceContext)
}
