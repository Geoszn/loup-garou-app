import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import './index.css'
import AdminApp from './AdminApp'
import { AuthProvider } from './context/AuthContext'
import { LanguageProvider } from './i18n/LanguageContext'

// Ce sous-domaine servait auparavant l'appli publique, qui y avait enregistré
// son service worker : le retirer évite qu'un ancien cache du navigateur
// serve l'ancienne page au lieu de celle-ci.
if ('serviceWorker' in navigator) {
  navigator.serviceWorker
    .getRegistrations()
    .then((registrations) => registrations.forEach((r) => r.unregister()))
    .catch(() => {})
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <LanguageProvider>
        <AuthProvider>
          <AdminApp />
        </AuthProvider>
      </LanguageProvider>
    </BrowserRouter>
  </StrictMode>
)
