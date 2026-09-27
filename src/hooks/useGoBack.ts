import { useCallback } from 'react'
import { useNavigate } from 'react-router-dom'

/** Retour à la page précédente de l'historique ; `fallback` seulement quand la
 * page a été ouverte directement (lien, notification) et qu'il n'y a rien
 * derrière. */
export function useGoBack(fallback: string) {
  const navigate = useNavigate()
  return useCallback(() => {
    const idx = (window.history.state as { idx?: number } | null)?.idx ?? 0
    if (idx > 0) navigate(-1)
    else navigate(fallback, { replace: true })
  }, [navigate, fallback])
}
