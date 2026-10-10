import { Navigate, Route, Routes, useLocation } from 'react-router-dom'
import { Suspense, lazy, useEffect, useRef, type ReactNode } from 'react'
import { useAuth } from './context/AuthContext'
import { useLanguage } from './i18n/LanguageContext'
import { useUiClickSound } from './hooks/useUiClickSound'
import { AmbientMusicController } from './components/AmbientMusicController'
import Landing from './pages/Landing'
import SignUp from './pages/SignUp'
import Login from './pages/Login'
import ForgotPassword from './pages/ForgotPassword'
import ResetPassword from './pages/ResetPassword'
import VerifyEmail from './pages/VerifyEmail'
import Dashboard from './pages/Dashboard'
import PendingApproval from './pages/PendingApproval'
import JoinByLink from './pages/JoinByLink'
import NotFound from './pages/NotFound'
import { FullScreenLoader } from './components/FullScreenLoader'
import { ProtectedRoute } from './components/ProtectedRoute'
import { AppShell } from './components/AppShell'
import { UpdateBanner } from './components/UpdateBanner'
import { SeoManager } from './components/SeoManager'

// Pages légales : gros blocs de texte juridique/RGPD (en deux langues),
// rarement consultés — chargées à la demande plutôt qu'incluses dans le
// bundle principal, pour ne pas alourdir le chargement initial de l'appli
// avec du texte que la plupart des joueurs ne liront jamais.
const Privacy = lazy(() => import('./pages/Privacy'))
const Terms = lazy(() => import('./pages/Terms'))
const LegalNotice = lazy(() => import('./pages/LegalNotice'))
// Page d'aide (règles + classement) : même logique, consultée ponctuellement
// plutôt qu'à chaque chargement — voir Help.tsx (remplace l'ancien
// RulesPanel affiché en permanence sur Landing.tsx / Dashboard.tsx).
// Volontairement PAS derrière ProtectedRoute : accessible aussi aux
// visiteurs non connectés depuis le lien du header de Landing.tsx.
const Help = lazy(() => import('./pages/Help'))

// Écrans secondaires (compte, stats, amis, salon d'attente) : sortis du
// bundle principal, chargés à la demande — n'affectent pas le premier
// écran vu après connexion (Dashboard, resté eager).
const Account = lazy(() => import('./pages/Account'))
const Stats = lazy(() => import('./pages/Stats'))
const Play = lazy(() => import('./pages/Play'))
const Rewards = lazy(() => import('./pages/Rewards'))
const Profile = lazy(() => import('./pages/Profile'))
const Friends = lazy(() => import('./pages/Friends'))
const Tribe = lazy(() => import('./pages/Tribe'))
const Lobby = lazy(() => import('./pages/Lobby'))
const SpectateGame = lazy(() => import('./pages/SpectateGame'))
// GameRoom entraîne avec lui tout le SDK vocal Daily.co/WebRTC (le plus
// gros contributeur de poids du bundle après React/Supabase) — inutile
// avant qu'une partie ne démarre réellement, donc chargé à ce moment-là
// seulement plutôt que dans le JS initial que la WKWebView doit analyser/
// exécuter dès l'ouverture de l'appli.
const GameRoom = lazy(() => import('./pages/GameRoom'))

/** Applique la langue par défaut du compte (profiles.lang) dès qu'un profil
 * vient de se charger après une connexion — une seule fois par connexion,
 * pour ne jamais écraser un changement fait ensuite manuellement (bouton
 * FR/EN) tant que l'utilisateur reste connecté avec le même compte. Pour un
 * visiteur non connecté, LanguageContext garde son propre repli
 * (localStorage puis langue du navigateur, voir detectInitialLang). */
function LanguageProfileSync() {
  const { profile } = useAuth()
  const { setLang } = useLanguage()
  const syncedUserIdRef = useRef<string | null>(null)

  useEffect(() => {
    if (!profile) {
      syncedUserIdRef.current = null
      return
    }
    if (syncedUserIdRef.current === profile.id) return
    syncedUserIdRef.current = profile.id
    if (profile.lang === 'fr' || profile.lang === 'en') setLang(profile.lang)
  }, [profile, setLang])

  return null
}

export default function App() {
  useUiClickSound()

  return (
    <>
      <UpdateBanner />
      <LanguageProfileSync />
      <AmbientMusicController />
      <SeoManager />
      <Routes>
      <Route path="/" element={<Landing />} />
      <Route path="/inscription" element={<SignUp />} />
      <Route path="/connexion" element={<Login />} />
      <Route path="/mot-de-passe-oublie" element={<ForgotPassword />} />
      <Route path="/reinitialiser-mot-de-passe" element={<ResetPassword />} />
      <Route path="/verifier-email" element={<VerifyEmail />} />
      <Route
        path="/confidentialite"
        element={
          <Suspense fallback={<FullScreenLoader />}>
            <Privacy />
          </Suspense>
        }
      />
      <Route
        path="/cgu"
        element={
          <Suspense fallback={<FullScreenLoader />}>
            <Terms />
          </Suspense>
        }
      />
      <Route
        path="/mentions-legales"
        element={
          <Suspense fallback={<FullScreenLoader />}>
            <LegalNotice />
          </Suspense>
        }
      />
      <Route
        path="/aide"
        element={
          <Suspense fallback={<FullScreenLoader />}>
            <Help />
          </Suspense>
        }
      />
      <Route
        element={
          <ProtectedRoute>
            <AppShell />
          </ProtectedRoute>
        }
      >
        <Route path="/dashboard" element={<Dashboard />} />
        <Route
          path="/jouer"
          element={
            <Suspense fallback={<FullScreenLoader />}>
              <Play />
            </Suspense>
          }
        />
        <Route
          path="/recompenses"
          element={
            <Suspense fallback={<FullScreenLoader />}>
              <Rewards />
            </Suspense>
          }
        />
        <Route
          path="/amis"
          element={
            <Suspense fallback={<FullScreenLoader />}>
              <Friends />
            </Suspense>
          }
        />
        <Route
          path="/tribu"
          element={
            <Suspense fallback={<FullScreenLoader />}>
              <Tribe />
            </Suspense>
          }
        />
        <Route
          path="/profil"
          element={
            <Suspense fallback={<FullScreenLoader />}>
              <Profile />
            </Suspense>
          }
        />
      </Route>
      <Route path="/loup-store" element={<Navigate to="/recompenses" replace />} />
      <Route
        path="/compte"
        element={
          <ProtectedRoute>
            <Suspense fallback={<FullScreenLoader />}>
              <Account />
            </Suspense>
          </ProtectedRoute>
        }
      />
      <Route
        path="/stats"
        element={
          <ProtectedRoute>
            <Suspense fallback={<FullScreenLoader />}>
              <Stats />
            </Suspense>
          </ProtectedRoute>
        }
      />
      <Route
        path="/rejoindre/:code"
        element={<JoinByLink />}
      />
      {/* Salon, attente et partie : la barre de navigation reste affichée (AppShell compact). */}
      <Route
        element={
          <ProtectedRoute>
            <AppShell compact />
          </ProtectedRoute>
        }
      >
        <Route
          path="/attente/:gameId"
          element={
              <PendingApproval />
          }
        />
        <Route
          path="/attente/:gameId/observer"
          element={
              <Suspense fallback={<FullScreenLoader />}>
                <SpectateGame />
              </Suspense>
          }
        />
        <Route
          path="/partie/:code/lobby"
          element={
              <Suspense fallback={<FullScreenLoader />}>
                <Lobby />
              </Suspense>
          }
        />
        <Route
          path="/partie/:code"
          element={
              <Suspense fallback={<FullScreenLoader />}>
                <GameRoom />
              </Suspense>
          }
        />
      </Route>
      <Route path="*" element={<NotFound />} />
      </Routes>
    </>
  )
}
