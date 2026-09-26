import { Suspense, lazy } from 'react'
import { Route, Routes } from 'react-router-dom'
import Login from './pages/Login'
import VerifyEmail from './pages/VerifyEmail'
import { ProtectedRoute } from './components/ProtectedRoute'
import { FullScreenLoader } from './components/FullScreenLoader'

// Application d'administration, chargée uniquement par admin.html (jamais par
// le site public). Aucun chemin secret : toute URL de ce sous-domaine mène au
// dashboard, et le vrai contrôle d'accès reste 100 % côté serveur
// (admin_check_access() et le contrôle is_admin_user() de chaque fonction
// admin_*). /connexion et /verifier-email restent nécessaires pour que
// ProtectedRoute puisse rediriger un compte non connecté.
const AdminDashboard = lazy(() => import('./pages/AdminDashboard'))

export default function AdminApp() {
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
