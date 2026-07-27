import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import './index.css'
import App from './App'
import { AuthProvider } from './context/AuthContext'
import { LanguageProvider } from './i18n/LanguageContext'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <LanguageProvider>
        <AuthProvider>
          <App />
        </AuthProvider>
      </LanguageProvider>
    </BrowserRouter>
  </StrictMode>
)

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
