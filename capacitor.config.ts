import type { CapacitorConfig } from '@capacitor/cli'

// Config Capacitor : enveloppe le build web (dist/) dans une coquille native
// Android/iOS. webDir pointe vers la sortie de `npm run build` (Vite,
// dossier par défaut) — c'est ce build statique qui est embarqué dans
// l'app, pas un serveur distant : l'appli fonctionne donc même hors ligne
// pour tout ce qui ne dépend pas du réseau (Supabase reste nécessaire pour
// jouer, comme sur le web).
const config: CapacitorConfig = {
  appId: 'com.loupgarouafrique.app',
  appName: 'LG Afrique',
  webDir: 'dist',
  backgroundColor: '#160f0a',
  ios: {
    // Nécessaire pour que le vocal (Daily.co, WebRTC) fonctionne dans la
    // WKWebView d'iOS sans avertissement de contenu mixte.
    contentInset: 'always',
  },
  android: {
    backgroundColor: '#160f0a',
  },
  plugins: {
    // Écran de démarrage géré à la main (voir main.tsx: SplashScreen.hide()
    // appelé après le premier rendu React) plutôt que le délai fixe par
    // défaut — évite à la fois le flash blanc et une coupure brutale entre
    // le splash et l'appli, qui sont ce qui trahit le plus une appli
    // "juste un site web emballé".
    SplashScreen: {
      launchShowDuration: 0,
      launchAutoHide: false,
      backgroundColor: '#160f0a',
      showSpinner: false,
      androidScaleType: 'CENTER_CROP',
      splashFullScreen: true,
      splashImmersive: true,
    },
    // overlaysWebView: true + le padding env(safe-area-inset-*) déjà en
    // place dans index.css => rendu "bord à bord" moderne (voir
    // commentaire dans index.css) plutôt qu'une barre de statut système
    // toute nue qui casse l'immersion.
    StatusBar: {
      overlaysWebView: true,
      style: 'DARK',
    },
  },
}

export default config
