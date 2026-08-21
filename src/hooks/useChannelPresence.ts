import { useEffect, useRef, useState } from 'react'
import DailyIframe, { type DailyCall } from '@daily-co/daily-js'
import { getVoiceRoomUrl } from '../lib/daily'

/**
 * Sonde vocale silencieuse (voir demande utilisateur : bouton "talkie-walkie"
 * pour les fantômes, GameRoom.tsx / GhostPanel) — se connecte en arrière-plan
 * à UN salon Daily pour savoir si quelqu'un y a le micro actif en ce moment,
 * SANS jamais télécharger ni jouer le moindre son
 * (subscribeToTracksAutomatically: false, aucun <audio> créé) et sans jamais
 * publier son propre micro/caméra. Sert uniquement à afficher un indicateur
 * "ça parle de l'autre côté" pendant qu'on écoute/parle ailleurs — un vrai
 * double flux audio (entendre réellement les deux salons à la fois) coûterait
 * bien plus cher en bande passante/CPU mobile pour un bénéfice marginal, vu
 * qu'un seul salon peut de toute façon être ouvert pour de vrai à la fois
 * (voir useVoiceChat.ts).
 *
 * Volontairement séparé de useVoiceChat (déjà complexe, en prod avec de
 * vrais joueurs) : un hook dédié minimal limite le risque de régression.
 *
 * `userData: { ghost: true }` réutilise exactement le même marqueur que les
 * fantômes en écoute seule (voir useVoiceChat.ts, refreshParticipants) :
 * cette connexion-sonde est donc automatiquement invisible dans la liste des
 * participants affichée à qui que ce soit, sans code de filtrage
 * supplémentaire à maintenir ailleurs.
 */
export function useChannelPresence(
  gameId: string | null,
  code: string | null,
  channel: 'village' | 'graveyard' | null,
  enabled: boolean
) {
  const callRef = useRef<DailyCall | null>(null)
  const [active, setActive] = useState(false)

  useEffect(() => {
    let cancelled = false

    async function teardown() {
      const call = callRef.current
      callRef.current = null
      if (call) {
        try {
          await call.leave()
        } catch {
          /* ignore */
        }
        call.destroy()
      }
      setActive(false)
    }

    async function connect() {
      if (!enabled || !gameId || !code || !channel) return

      try {
        const { url } = await getVoiceRoomUrl(gameId, code, channel)
        if (cancelled) return

        const call = DailyIframe.createCallObject({ subscribeToTracksAutomatically: false })
        callRef.current = call

        function refresh() {
          const all = call.participants()
          const someoneOn = Object.values(all).some((p) => {
            if (p.local) return false
            // Ignore les autres sondes/écoutes silencieuses (même marqueur
            // que les fantômes en écoute seule, voir useVoiceChat.ts) : sans
            // ce filtre, deux sondes se signaleraient l'une l'autre comme
            // "quelqu'un parle" alors que ni l'une ni l'autre n'a de micro.
            const userData = p.userData as { ghost?: boolean } | undefined
            if (userData?.ghost) return false
            return !!p.audio
          })
          setActive(someoneOn)
        }

        call.on('participant-joined', refresh)
        call.on('participant-updated', refresh)
        call.on('participant-left', refresh)
        // Sonde purement décorative : une erreur (salon fermé, réseau...) ne
        // doit jamais remonter d'avertissement à l'utilisateur, juste ne pas
        // afficher l'indicateur.
        call.on('error', () => {})

        await call.join({
          url,
          userData: { ghost: true },
          userName: 'probe',
          startVideoOff: true,
          startAudioOff: true,
        })
        if (cancelled) {
          await call.leave()
          call.destroy()
          return
        }
        refresh()
      } catch {
        // Idem : échec silencieux, purement décoratif.
      }
    }

    if (enabled) connect()
    else teardown()

    return () => {
      cancelled = true
      teardown()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gameId, code, channel, enabled])

  useEffect(() => {
    return () => {
      const call = callRef.current
      callRef.current = null
      if (call) {
        call.leave().catch(() => {})
        call.destroy()
      }
    }
  }, [])

  return { active }
}
