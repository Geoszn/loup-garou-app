import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import * as Sentry from '@sentry/react'
import { Capacitor } from '@capacitor/core'
import { StatusBar, Style } from '@capacitor/status-bar'
import { SplashScreen } from '@capacitor/splash-screen'
import { CapacitorUpdater } from '@capgo/capacitor-updater'
import './index.css'
import App from './App'
import { AuthProvider } from './context/AuthContext'
import { PresenceProvider } from './context/PresenceContext'
import { LanguageProvider } from './i18n/LanguageContext'

// Coquille native (Android/iOS) uniquement : sur le web classique, ces
// appels seraient soit inutiles (pas de barre de statut) soit no-op (le
// plugin web de SplashScreen n'existe pas visuellement) — on ne les exécute
// donc que dans l'app packagée, pour ne jamais toucher au comportement du
// site web.
if (Capacitor.isNativePlatform()) {
  // Active les règles CSS "effet appli" scopées à cette classe (voir
  // index.css) : jamais posée sur le web classique, donc le site web garde
  // son comportement de navigateur normal (sélection de texte, zoom...).
  document.documentElement.classList.add('capacitor-native')

  // Icônes claires (texte/heure blancs) sur notre thème sombre — sans ça la
  // barre de statut système reste au réglage par défaut (souvent des icônes
  // noires invisibles sur fond sombre), un des détails qui trahit le plus
  // "site web habillé" plutôt que vraie appli.
  StatusBar.setStyle({ style: Style.Dark }).catch(() => {})
  if (Capacitor.getPlatform() === 'android') {
    StatusBar.setBackgroundColor({ color: '#160f0a' }).catch(() => {})
  }
  if (Capacitor.getPlatform() === 'ios') {
    // Voir index.css (html.capacitor-ios) : sur iOS, env(safe-area-inset-top)
    // s'est révélé insuffisant au lancement (header collé sous la barre de
    // statut/l'encoche sur iPhone) — cette classe active un filet de
    // sécurité CSS avec un minimum garanti, jamais posée sur Android où le
    // padding env() seul suffit déjà.
    document.documentElement.classList.add('capacitor-ios')
  }
}

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
            <PresenceProvider>
              <App />
            </PresenceProvider>
          </AuthProvider>
        </LanguageProvider>
      </BrowserRouter>
    </Sentry.ErrorBoundary>
  </StrictMode>
)

// Masque l'écran de démarrage natif une fois le premier vrai rendu affiché
// à l'écran (double requestAnimationFrame : le 1er est planifié avant que
// le navigateur ait peint la frame en cours, le 2nd s'exécute donc juste
// après ce peint) plutôt qu'après un délai fixe arbitraire — élimine à la
// fois le flash blanc (splash masqué trop tôt) et le petit temps mort figé
// (splash masqué trop tard) qui donnent l'un comme l'autre une impression
// de site web qui charge plutôt que d'appli qui s'ouvre.
if (Capacitor.isNativePlatform()) {
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      SplashScreen.hide().catch(() => {})
      // Confirme au plugin Capgo (mises à jour en direct, voir
      // capacitor.config.ts) que ce paquet de code a bien démarré — sans
      // cet appel, le plugin considère le démarrage en échec et revient
      // tout seul à la version précédente (filet de sécurité intégré).
      // Volontairement ici, juste après le premier vrai rendu confirmé
      // (même repère que SplashScreen.hide() ci-dessus) : appeler ça avant
      // même que React ait fini de monter viderait le filet de sécurité de
      // tout son sens, puisqu'un bundle cassé qui plante au premier rendu
      // serait quand même déclaré "prêt".
      CapacitorUpdater.notifyAppReady().catch(() => {})
    })
  })
}

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
