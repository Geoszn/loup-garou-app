import { useEffect, useRef } from 'react'

/**
 * Joue un court son ponctuel (fichier dans public/sounds/) sur commande,
 * avec le même mécanisme de déverrouillage mobile que useNarrator.ts /
 * useSoundEffects.ts : un seul <audio> réutilisé, débloqué par un premier
 * play() réussi en réaction à un vrai geste utilisateur (Safari/iOS n'
 * autorise pas de lecture audio hors interaction). Plus léger que
 * useSoundEffects (qui suit toute une partie) : utile pour des écrans
 * ponctuels hors-partie (salon d'attente, page d'attente d'approbation).
 *
 * Volontairement, l'élément <audio> n'est PAS retiré du DOM au démontage du
 * composant appelant : sur la page d'attente d'approbation, le son
 * "demande validée" est déclenché juste avant une navigation vers le salon,
 * qui démonterait sinon le composant — et couperait le son — avant même
 * qu'il ait fini de jouer.
 */
export function useNotificationSound(src: string) {
  const elRef = useRef<HTMLAudioElement | null>(null)
  const unlockedRef = useRef(false)

  function getEl(): HTMLAudioElement {
    let el = elRef.current
    if (!el) {
      el = document.createElement('audio')
      el.hidden = true
      el.preload = 'auto'
      el.setAttribute('playsinline', 'true')
      el.src = src
      document.body.appendChild(el)
      elRef.current = el
    }
    return el
  }

  useEffect(() => {
    function unlock() {
      if (unlockedRef.current) return
      const el = getEl()
      const prevVolume = el.volume
      el.volume = 0
      el.play()
        .then(() => {
          el.pause()
          el.currentTime = 0
          el.volume = prevVolume
          unlockedRef.current = true
        })
        .catch(() => {
          el.volume = prevVolume
        })
    }
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
  }, [])

  function play() {
    const el = getEl()
    el.volume = 0.55
    el.currentTime = 0
    el.play().catch(() => {
      // Fichier absent ou lecture bloquée : silencieux, ce n'est pas une
      // erreur pour l'utilisateur (voir public/sounds/README.md).
    })
  }

  return play
}
