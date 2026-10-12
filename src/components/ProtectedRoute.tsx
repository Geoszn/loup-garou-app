import type { ReactNode } from 'react'
import { Navigate, useLocation } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { FullScreenLoader } from './FullScreenLoader'

export function ProtectedRoute({ children }: { children: ReactNode }) {
  const { session, loading } = useAuth()
  const location = useLocation()
  if (loading) return <FullScreenLoader />
  if (!session) {
    // On mémorise la page d'origine (ex: le panel admin) dans ?redirect=...
    // pour que Login.tsx y renvoie l'utilisateur une fois connecté, au lieu
    // de toujours retomber sur /dashboard par défaut.
    const redirect = encodeURIComponent(location.pathname + location.search)
    return <Navigate to={`/connexion?redirect=${redirect}`} replace />
  }
  // Un invité (connexion anonyme) n'a pas d'e-mail à confirmer : il passe.
  if (!session.user.email_confirmed_at && !session.user.is_anonymous) return <Navigate to="/verifier-email" replace />
  return <>{children}</>
}
