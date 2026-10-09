import { useEffect } from 'react'
import { useLocation } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { ambientMusic } from '../lib/ambientMusic'

// Pages où la musique se tait : le salon d'attente, la partie, l'attente d'acceptation
// et le lien d'invitation (qui mène directement au salon). Le vocal et les effets
// sonores de partie ne doivent pas se mélanger à la musique.
const QUIET_PREFIXES = ['/partie', '/attente', '/rejoindre']

/** Allume la musique d'ambiance dans l'appli pour un joueur connecté, hors salons et parties. */
export function AmbientMusicController() {
  const { session } = useAuth()
  const { pathname } = useLocation()
  const active = !!session && !QUIET_PREFIXES.some((p) => pathname.startsWith(p))

  useEffect(() => {
    ambientMusic.init()
  }, [])
  useEffect(() => {
    ambientMusic.setActive(active)
  }, [active])

  return null
}
