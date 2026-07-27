import { useEffect, useRef } from 'react'

const STORAGE_KEY = 'loup-garou-sfx-enabled'
const CLICK_SRC = '/sounds/click.mp3'

/**
 * Petit clic sonore joué sur n'importe quel <button> de l'appli, pas
 * seulement en partie — écoute globale posée une fois à la racine (App.tsx)
 * plutôt qu'un son ajouté bouton par bouton, pour couvrir tous les écrans
 * (tableau de bord, salon, partie...) sans rien oublier.
 *
 * Partage le même interrupteur que les effets sonores de partie (clé
 * localStorage `loup-garou-sfx-enabled`, réglable via 🎶/🔇 dans le bandeau
 * de phase) : un seul réglage "son" pour le joueur plutôt que d'en ajouter un
 * deuxième.
 *
 * Contrairement au narrateur/aux effets de partie, aucun déverrouillage
 * Safari/iOS n'est nécessaire ici : le clic qui déclenche le son EST déjà le
 * geste utilisateur direct exigé par le navigateur, donc `play()` peut être
 * appelé directement dans le gestionnaire de clic.
 */
export function useUiClickSound() {
  const elRef = useRef<HTMLAudioElement | null>(null)

  useEffect(() => {
    if (typeof Audio === 'undefined') return

    function getEl(): HTMLAudioElement {
      if (!elRef.current) {
        const el = document.createElement('audio')
        el.hidden = true
        el.preload = 'auto'
        el.setAttribute('playsinline', 'true')
        el.src = CLICK_SRC
        document.body.appendChild(el)
        elRef.current = el
      }
      return elRef.current
    }

    function isEnabled() {
      const stored = window.localStorage.getItem(STORAGE_KEY)
      return stored === null ? true : stored === 'true'
    }

    function onClick(e: MouseEvent) {
      if (!isEnabled()) return
      const target = e.target as HTMLElement | null
      const trigger = target?.closest('button, [role="button"]') as HTMLButtonElement | null
      if (!trigger || trigger.disabled) return
      const el = getEl()
      el.volume = 0.35
      el.currentTime = 0
      el.play().catch(() => {
        // Fichier absent (voir public/sounds/README.md) ou lecture bloquée :
        // silencieux, ce n'est pas une erreur pour l'utilisateur.
      })
    }

    // capture: true pour attraper le clic même si un enfant du bouton
    // (icône, span...) appelle stopPropagation plus haut dans l'arbre.
    document.addEventListener('click', onClick, true)
    return () => {
      document.removeEventListener('click', onClick, true)
      elRef.current?.remove()
      elRef.current = null
    }
  }, [])
}
