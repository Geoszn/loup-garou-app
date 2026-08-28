import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import type { Session, User } from '@supabase/supabase-js'
import { supabase } from '../lib/supabase'

interface Profile {
  id: string
  username: string
  avatar_icon: string
  lang: 'fr' | 'en'
  username_changed_at: string | null
  // Rang/progression (voir migration 0055_ranking_system.sql) : chargés ici
  // directement (RLS profiles_select_own autorise déjà chacun à lire sa
  // propre ligne), pas besoin d'un aller-retour RPC séparé juste pour le
  // badge de rang affiché dans l'en-tête du tableau de bord.
  rank_points: number
  current_streak: number
  best_streak: number
  // Série de connexion quotidienne (voir migration 0110) : distincte de
  // current_streak ci-dessus (victoires d'affilée) — comptée à chaque
  // ouverture de l'app un jour différent, gagné ou perdu. claim_daily_login()
  // met à jour ces deux colonnes en base ; refreshProfile() après l'appel
  // les fait suivre ici pour le badge d'en-tête.
  login_streak: number
  login_streak_best: number
  continent: string | null
}

interface AuthContextValue {
  session: Session | null
  user: User | null
  profile: Profile | null
  loading: boolean
  refreshProfile: () => Promise<void>
  signOut: () => Promise<void>
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [profile, setProfile] = useState<Profile | null>(null)
  const [loading, setLoading] = useState(true)

  async function loadProfile(userId: string) {
    const { data } = await supabase
      .from('profiles')
      .select(
        'id, username, avatar_icon, lang, username_changed_at, rank_points, current_streak, best_streak, login_streak, login_streak_best, continent',
      )
      .eq('id', userId)
      .maybeSingle()
    if (data) setProfile(data as Profile)
  }

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session)
      if (data.session?.user) loadProfile(data.session.user.id)
      setLoading(false)
    })

    const { data: listener } = supabase.auth.onAuthStateChange((_event, newSession) => {
      setSession(newSession)
      if (newSession?.user) {
        loadProfile(newSession.user.id)
      } else {
        setProfile(null)
      }
    })

    // Le rafraîchissement automatique du token (autoRefreshToken, voir
    // lib/supabase.ts) repose sur un minuteur JS qui tourne dans la page —
    // suspendu par l'OS dès que l'onglet/l'app passe en arrière-plan
    // (verrouillage de l'écran, appli mise en veille sur mobile). Un token
    // qui expire pendant ce temps ne se renouvelle jamais tout seul : au
    // retour, le SDK reste persuadé d'avoir une session valide jusqu'au
    // premier appel réseau qui échoue — d'où la déconnexion silencieuse
    // remontée après quelques minutes de veille. startAutoRefresh()/
    // stopAutoRefresh() sur visibilitychange force une vérification
    // immédiate dès que l'app redevient visible, plutôt que d'attendre un
    // minuteur qui ne s'est jamais déclenché (patron documenté par
    // Supabase pour ce cas — habituellement cité pour React Native, mais
    // le problème de fond, des minuteurs suspendus en arrière-plan,
    // s'applique tout autant ici sur mobile Safari/PWA).
    function onVisibilityChange() {
      if (document.visibilityState === 'visible') {
        supabase.auth.startAutoRefresh()
      } else {
        supabase.auth.stopAutoRefresh()
      }
    }
    document.addEventListener('visibilitychange', onVisibilityChange)

    return () => {
      listener.subscription.unsubscribe()
      document.removeEventListener('visibilitychange', onVisibilityChange)
    }
  }, [])

  async function refreshProfile() {
    if (session?.user) await loadProfile(session.user.id)
  }

  async function signOut() {
    await supabase.auth.signOut()
  }

  return (
    <AuthContext.Provider
      value={{ session, user: session?.user ?? null, profile, loading, refreshProfile, signOut }}
    >
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}
