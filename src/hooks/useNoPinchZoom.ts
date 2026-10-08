import { useEffect } from 'react'

/**
 * Écran « fixe » : bloque le zoom au pincement tant que le composant est affiché (chat de
 * tribu, partie en cours). Safari iOS ignore le réglage de zoom du viewport, d'où ces
 * écouteurs sur les gestes plutôt qu'une simple balise meta. Ne touche pas au défilement ni
 * aux appuis à un doigt.
 */
export function useNoPinchZoom() {
  useEffect(() => {
    const stop = (e: Event) => e.preventDefault()
    const stopMulti = (e: TouchEvent) => {
      if (e.touches.length > 1) e.preventDefault()
    }
    const types = ['gesturestart', 'gesturechange', 'gestureend']
    types.forEach((t) => document.addEventListener(t, stop, { passive: false }))
    document.addEventListener('touchmove', stopMulti, { passive: false })
    return () => {
      types.forEach((t) => document.removeEventListener(t, stop))
      document.removeEventListener('touchmove', stopMulti)
    }
  }, [])
}
