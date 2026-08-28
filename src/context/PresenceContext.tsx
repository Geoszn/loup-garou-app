import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react'
import type { RealtimeChannel } from '@supabase/supabase-js'
import { supabase } from '../lib/supabase'
import { useAuth } from './AuthContext'

export interface PresenceMeta {
  status: 'idle' | 'in_game'
  game_code: string | null
}

interface PresenceContextValue {
  // Ids de TOUS les utilisateurs actuellement connectés à l'app (pas
  // seulement les amis) — le filtrage sur la liste d'amis se fait côté
  // consommateur (voir FriendsOnlineWidget.tsx), ce contexte se contente de
  // savoir qui a l'app ouverte en ce moment et quoi.
  onlineStatus: Record<string, PresenceMeta>
  setMyStatus: (status: PresenceMeta['status'], gameCode?: string | null) => void
}

const PresenceContext = createContext<PresenceContextValue>({
  onlineStatus: {},
  setMyStatus: () => {},
})

/**
 * Présence globale (canal unique `presence-lobby`, distinct des canaux
 * `game-${gameId}` par partie déjà utilisés par useGame.ts) : sert à
 * afficher "N amis en ligne" sur le tableau de bord, alors que la présence
 * par partie ne dit rien à un joueur qui n'a pas encore rejoint cette
 * partie précise.
 *
 * Monté une seule fois (voir main.tsx, à l'intérieur de AuthProvider dont
 * dépend `user`) pour toute la durée de la session connectée — GameRoom.tsx
 * appelle setMyStatus('in_game', code) à l'entrée d'une partie et
 * setMyStatus('idle') en sortant, sur ce même canal déjà ouvert, plutôt que
 * d'ouvrir un second canal de présence concurrent pour le même utilisateur
 * (qui entrerait en conflit sur la même clé de présence).
 *
 * Coût à surveiller si la base grossit : un canal de présence global (tous
 * les utilisateurs connectés à la fois) a un coût Supabase Realtime plus
 * élevé qu'un canal par partie (peu de monde à la fois) — acceptable au
 * volume actuel.
 */
export function PresenceProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth()
  const [onlineStatus, setOnlineStatus] = useState<Record<string, PresenceMeta>>({})
  const channelRef = useRef<RealtimeChannel | null>(null)

  useEffect(() => {
    if (!user) {
      setOnlineStatus({})
      return
    }

    const channel = supabase
      .channel('presence-lobby', { config: { presence: { key: user.id } } })
      .on('presence', { event: 'sync' }, () => {
        const state = channel.presenceState<PresenceMeta>()
        const next: Record<string, PresenceMeta> = {}
        for (const [uid, metas] of Object.entries(state)) {
          if (metas[0]) next[uid] = metas[0]
        }
        setOnlineStatus(next)
      })
      .subscribe(async (status) => {
        if (status === 'SUBSCRIBED') {
          await channel.track({ status: 'idle', game_code: null } satisfies PresenceMeta)
        }
      })
    channelRef.current = channel

    return () => {
      supabase.removeChannel(channel)
      channelRef.current = null
      setOnlineStatus({})
    }
  }, [user?.id])

  function setMyStatus(status: PresenceMeta['status'], gameCode: string | null = null) {
    channelRef.current?.track({ status, game_code: gameCode } satisfies PresenceMeta)
  }

  return <PresenceContext.Provider value={{ onlineStatus, setMyStatus }}>{children}</PresenceContext.Provider>
}

export function usePresence() {
  return useContext(PresenceContext)
}
