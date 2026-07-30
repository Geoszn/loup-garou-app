import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import * as Sentry from '@sentry/react'
import './index.css'
import App from './App'
import { AuthProvider } from './context/AuthContext'
import { LanguageProvider } from './i18n/LanguageContext'

// Suivi d'erreurs en prod : capture les crashs React et les erreurs JS
// avec leur stack trace + contexte. Désactivé si aucune DSN n'est fournie
// (ex: en dev local sans .env configuré) pour ne rien casser.
const sentryDsn = import.meta.env.VITE_SENTRY_DSN
if (sentryDsn) {
  Sentry.init({
    dsn: sentryDsn,
    environment: import.meta.env.MODE,
    sendDefaultPii: false,
  })
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Sentry.ErrorBoundary fallback={<ErrorFallback />}>
      <BrowserRouter>
        <LanguageProvider>
          <AuthProvider>
            <App />
          </AuthProvider>
        </LanguageProvider>
      </BrowserRouter>
    </Sentry.ErrorBoundary>
  </StrictMode>
)

function ErrorFallback() {
  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: '12px',
        padding: '24px',
        textAlign: 'center',
        background: '#160f0a',
        color: '#e8dcc4',
        fontFamily: 'Arial, Helvetica, sans-serif',
      }}
    >
      <h1 style={{ margin: 0, color: '#d99a3f' }}>Oups, un bug est survenu 🐺</h1>
      <p style={{ margin: 0, opacity: 0.8 }}>
        L'erreur a été signalée automatiquement. Rechargez la page pour continuer.
      </p>
      <button
        onClick={() => window.location.reload()}
        style={{
          marginTop: '8px',
          padding: '10px 24px',
          background: '#c2432a',
          color: '#fdf6e3',
          border: 'none',
          borderRadius: '12px',
          fontWeight: 'bold',
          cursor: 'pointer',
        }}
      >
        Recharger
      </button>
    </div>
  )
}

// Rend l'appli installable (icône sur l'écran d'accueil) et lui donne un
// filet de sécurité hors-ligne léger. Enregistré après le premier rendu,
// une fois la page chargée, pour ne jamais retarder l'affichage initial.
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {
      // Pas grave si ça échoue (navigateur non supporté, contexte non
      // sécurisé en dev...) : l'appli fonctionne très bien sans.
    })
  })
}
