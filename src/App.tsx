import { Navigate, Route, Routes, useLocation } from 'react-router-dom'
import { Suspense, lazy, useEffect, useRef, type ReactNode } from 'react'
import { useAuth } from './context/AuthContext'
import { useLanguage } from './i18n/LanguageContext'
import { useUiClickSound } from './hooks/useUiClickSound'
import Landing from './pages/Landing'
import SignUp from './pages/SignUp'
import Login from './pages/Login'
import ForgotPassword from './pages/ForgotPassword'
import ResetPassword from './pages/ResetPassword'
import VerifyEmail from './pages/VerifyEmail'
import Dashboard from './pages/Dashboard'
import Account from './pages/Account'
import Stats from './pages/Stats'
import Friends from './pages/Friends'
import Lobby from './pages/Lobby'
import PendingApproval from './pages/PendingApproval'
import GameRoom from './pages/GameRoom'
import JoinByLink from './pages/JoinByLink'
import NotFound from './pages/NotFound'
import { FullScreenLoader } from './components/FullScreenLoader'
import { isAdminHost } from './lib/adminHost'

// Dashboard admin : route volontairement chargée en lazy (jamais dans le
// bundle principal) et jamais liée nulle part dans l'app — seule une
// personne connaissant cette URL exacte (voir ADMIN_ROUTE_PATH) peut même
// espérer y accéder. Le vrai contrôle d'accès reste côté serveur
// (admin_check_access(), voir AdminDashboard.tsx) : cette URL cachée n'est
// qu'une couche d'obscurité en plus, pas la sécurité elle-même.
const AdminDashboard = lazy(() => import('./pages/AdminDashboard'))
// Garder ce chemin exact en tête (ou dans un gestionnaire de mots de passe) :
// il n'apparaît nulle part ailleurs dans l'app.
export const ADMIN_ROUTE_PATH = '/panel-beff77e1dae48f88d6b98231f160f0b8'

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

function ProtectedRoute({ children }: { children: ReactNode }) {
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
  if (!session.user.email_confirmed_at) return <Navigate to="/verifier-email" replace />
  return <>{children}</>
}

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

// Accès simplifié au dashboard admin : ce domaine dédié (voir le projet
// Vercel — domaine à ajouter séparément, DNS géré chez le registrar du nom
// de domaine principal) pointe directement vers AdminDashboard quel que
// soit le chemin visité, plutôt que d'avoir à retenir l'URL secrète
// ADMIN_ROUTE_PATH (qui continue de fonctionner normalement par ailleurs,
// notamment pour tout lien déjà enregistré dans un gestionnaire de mots de
// passe). Ce n'est qu'un raccourci pratique : le vrai contrôle d'accès
// reste entièrement côté serveur (admin_check_access(), voir
// AdminDashboard.tsx) — quiconque tape ce nom de domaine sans être admin
// tombe simplement sur l'écran "Accès refusé".

export default function App() {
  useUiClickSound()

  if (isAdminHost) {
    // Mini-routeur dédié : /connexion et /verifier-email restent nécessaires
    // ici pour que ProtectedRoute puisse réellement rediriger un compte non
    // connecté (sinon "?redirect=" pointerait vers un chemin sans route sur
    // ce domaine) — tout le reste ("*") mène directement au dashboard.
    return (
      <Routes>
        <Route path="/connexion" element={<Login />} />
        <Route path="/verifier-email" element={<VerifyEmail />} />
        <Route
          path="*"
          element={
            <ProtectedRoute>
              <Suspense fallback={<FullScreenLoader />}>
                <AdminDashboard />
              </Suspense>
            </ProtectedRoute>
          }
        />
      </Routes>
    )
  }

  return (
    <>
      <LanguageProfileSync />
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
        path="/dashboard"
        element={
          <ProtectedRoute>
            <Dashboard />
          </ProtectedRoute>
        }
      />
      <Route
        path="/compte"
        element={
          <ProtectedRoute>
            <Account />
          </ProtectedRoute>
        }
      />
      <Route
        path="/stats"
        element={
          <ProtectedRoute>
            <Stats />
          </ProtectedRoute>
        }
      />
      <Route
        path="/amis"
        element={
          <ProtectedRoute>
            <Friends />
          </ProtectedRoute>
        }
      />
      <Route
        path="/rejoindre/:code"
        element={<JoinByLink />}
      />
      <Route
        path="/attente/:gameId"
        element={
          <ProtectedRoute>
            <PendingApproval />
          </ProtectedRoute>
        }
      />
      <Route
        path="/partie/:code/lobby"
        element={
          <ProtectedRoute>
            <Lobby />
          </ProtectedRoute>
        }
      />
      <Route
        path="/partie/:code"
        element={
          <ProtectedRoute>
            <GameRoom />
          </ProtectedRoute>
        }
      />
      <Route
        path={ADMIN_ROUTE_PATH}
        element={
          <ProtectedRoute>
            <Suspense fallback={<FullScreenLoader />}>
              <AdminDashboard />
            </Suspense>
          </ProtectedRoute>
        }
      />
      <Route path="*" element={<NotFound />} />
      </Routes>
    </>
  )
}
