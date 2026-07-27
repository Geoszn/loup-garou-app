import { useEffect, useRef, useState } from 'react'
import type { MyGameView } from '../types/game'

const STORAGE_KEY = 'loup-garou-sfx-enabled'

const SOUND_FILES = {
  nightFalls: '/sounds/night-falls.mp3',
  dawn: '/sounds/dawn.mp3',
  voteOpen: '/sounds/vote-open.mp3',
  death: '/sounds/death.mp3',
  victory: '/sounds/victory.mp3',
} as const

type SoundKey = keyof typeof SOUND_FILES

/**
 * Joue un court effet sonore ponctuel à quelques moments clés de la partie,
 * détectés en comparant l'état du jeu d'un rendu à l'autre (transition de
 * statut, nombre de vivants qui baisse) plutôt qu'en interprétant le texte
 * du journal — plus robuste, et indépendant du narrateur (les deux peuvent
 * fonctionner ensemble ou séparément).
 *
 * Tant qu'un fichier de `public/sounds/` n'existe pas encore, l'effet
 * correspondant échoue silencieusement (voir public/sounds/README.md) : rien
 * ne casse, le moment est juste silencieux.
 *
 * Même piège Safari/iOS que le narrateur (voir useNarrator.ts) : un élément
 * <audio> ne peut être "débloqué" que par un premier play() déclenché en
 * réaction directe à un geste utilisateur, et ce déverrouillage ne s'applique
 * qu'à cette instance précise. On garde donc un pool d'éléments <audio>
 * persistants (un par son) plutôt que de recréer `new Audio()` à chaque fois.
 */
export function useSoundEffects(view: MyGameView | null) {
  const [enabled, setEnabled] = useState<boolean>(() => {
    if (typeof window === 'undefined') return true
    const stored = window.localStorage.getItem(STORAGE_KEY)
    return stored === null ? true : stored === 'true'
  })
  const [supported] = useState(typeof window !== 'undefined' && typeof Audio !== 'undefined')
  const enabledRef = useRef(enabled)
  const elementsRef = useRef<Partial<Record<SoundKey, HTMLAudioElement>>>({})
  const unlockedRef = useRef(false)
  const prevRef = useRef<{ status: string; aliveCount: number } | null>(null)

  enabledRef.current = enabled

  function getEl(key: SoundKey): HTMLAudioElement {
    let el = elementsRef.current[key]
    if (!el) {
      el = document.createElement('audio')
      el.hidden = true
      el.preload = 'auto'
      el.setAttribute('playsinline', 'true')
      el.src = SOUND_FILES[key]
      document.body.appendChild(el)
      elementsRef.current[key] = el
    }
    return el
  }

  function unlock() {
    if (unlockedRef.current || !supported) return
    // Comme pour le narrateur (useNarrator.ts) : on ne marque "déverrouillé"
    // qu'après confirmation qu'au moins un play() a réussi, jamais avant.
    // Sur mobile le tout premier essai peut échouer légitimement ; comme les
    // écouteurs ci-dessous ne sont plus en `once`, un échec ici retente
    // simplement au geste suivant au lieu de couper les sons pour le reste
    // de la partie.
    const attempts = (Object.keys(SOUND_FILES) as SoundKey[]).map((key) => {
      const el = getEl(key)
      const prevVolume = el.volume
      el.volume = 0
      return el
        .play()
        .then(() => {
          el.pause()
          el.currentTime = 0
          el.volume = prevVolume
          return true
        })
        .catch(() => {
          el.volume = prevVolume
          return false
        })
    })
    void Promise.all(attempts).then((results) => {
      if (results.some(Boolean)) unlockedRef.current = true
    })
  }

  function play(key: SoundKey) {
    if (!enabledRef.current || !supported) return
    const el = getEl(key)
    el.volume = 0.55
    el.currentTime = 0
    el.play().catch(() => {
      // Fichier absent (voir public/sounds/README.md) ou lecture bloquée :
      // silencieux, ce n'est pas une erreur pour l'utilisateur.
    })
  }

  useEffect(() => {
    if (!supported) return
    // Pas de `once: true` : unlock() se protège lui-même via unlockedRef une
    // fois confirmé, donc on peut le laisser retenter à chaque geste tant
    // qu'il n'a pas réussi. `touchstart` en plus de `pointerdown` pour les
    // WebView mobiles.
    const opts = { capture: true } as const
    document.addEventListener('pointerdown', unlock, opts)
    document.addEventListener('touchstart', unlock, opts)
    document.addEventListener('keydown', unlock, opts)
    return () => {
      document.removeEventListener('pointerdown', unlock, opts)
      document.removeEventListener('touchstart', unlock, opts)
      document.removeEventListener('keydown', unlock, opts)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [supported])

  useEffect(() => {
    return () => {
      Object.values(elementsRef.current).forEach((el) => {
        el?.pause()
        el?.remove()
      })
      elementsRef.current = {}
    }
  }, [])

  useEffect(() => {
    if (typeof window !== 'undefined') window.localStorage.setItem(STORAGE_KEY, String(enabled))
  }, [enabled])

  useEffect(() => {
    if (!view) return
    const status = view.game.status
    const aliveCount = view.players.filter((p) => p.is_alive).length
    const prev = prevRef.current

    if (prev) {
      if (prev.status !== 'night' && status === 'night') play('nightFalls')
      if (prev.status === 'night' && status === 'day_reveal') play('dawn')
      if (prev.status !== 'day_vote' && status === 'day_vote') play('voteOpen')
      if (prev.status !== 'captain_election' && status === 'captain_election') play('voteOpen')
      if (prev.status !== 'ended' && status === 'ended') play('victory')
      if (aliveCount < prev.aliveCount) play('death')
    }
    prevRef.current = { status, aliveCount }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view?.game.status, view?.players])

  return { enabled, toggle: () => setEnabled((v) => !v), supported }
}
