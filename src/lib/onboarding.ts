import { useCallback, useEffect, useState } from 'react'
import { supabase } from './supabase'
import { useAuth } from '../context/AuthContext'

// Drapeaux d'accueil d'un nouveau joueur. Ils réutilisent le mécanisme des annonces
// (get_my_seen_announcements / mark_announcement_seen) : rien de plus en base, et ils
// suivent le joueur d'un appareil à l'autre.
export const ONBOARDING_TUTORIAL_SEEN = 'onboarding-tuto-seen'
export const ONBOARDING_PRACTICE_DONE = 'onboarding-practice-done'
export const ONBOARDING_DISMISSED = 'onboarding-dismissed'

/** Les drapeaux d'accueil du joueur connecté (null tant qu'ils ne sont pas chargés). */
export function useOnboardingFlags() {
  const { user } = useAuth()
  const [flags, setFlags] = useState<Set<string> | null>(null)

  useEffect(() => {
    if (!user) return
    let active = true
    supabase.rpc('get_my_seen_announcements').then(({ data }) => {
      if (active) setFlags(new Set(Array.isArray(data) ? (data as string[]) : []))
    })
    return () => {
      active = false
    }
  }, [user])

  const mark = useCallback((key: string) => {
    setFlags((prev) => (prev && !prev.has(key) ? new Set(prev).add(key) : prev))
    void supabase.rpc('mark_announcement_seen', { p_key: key })
  }, [])

  return { flags, mark }
}
