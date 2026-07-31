import type { CapacitorConfig } from '@capacitor/cli'

// Config Capacitor : enveloppe le build web (dist/) dans une coquille native
// Android/iOS. webDir pointe vers la sortie de `npm run build` (Vite,
// dossier par défaut) — c'est ce build statique qui est embarqué dans
// l'app, pas un serveur distant : l'appli fonctionne donc même hors ligne
// pour tout ce qui ne dépend pas du réseau (Supabase reste nécessaire pour
// jouer, comme sur le web).
const config: CapacitorConfig = {
  appId: 'com.loupgarouafrique.app',
  appName: "Loup Garou d'Afrique",
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
}

export default config
