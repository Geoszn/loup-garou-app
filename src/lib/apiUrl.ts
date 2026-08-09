import { Capacitor } from '@capacitor/core'

// Sur le web, un chemin relatif "/api/..." suffit : le navigateur le
// résout contre l'origine du site (loupgarouafrique.com), là où vivent les
// fonctions serverless Vercel.
//
// Dans l'app native (Capacitor), la WebView ne charge PAS le site depuis ce
// domaine : elle sert les fichiers de dist/ en local, depuis un
// pseudo-domaine (capacitor://localhost sur iOS, https://localhost sur
// Android — voir capacitor.config.ts, aucun `server.url` n'est configuré).
// Un fetch relatif à "/api/..." résout donc contre CE faux domaine local,
// qui n'héberge aucune fonction serverless : la requête échoue ou retombe
// sur le HTML de l'appli elle-même (jamais du JSON), et ça sans jamais
// remonter d'erreur réseau explicite — juste une réponse qui n'a pas la
// forme attendue (ex: "property 'url': url should be a string" pour le
// vocal, ou l'email de feedback qui ne part jamais). Les appels Supabase ne
// sont eux jamais touchés par ce problème : le SDK Supabase utilise déjà une
// URL absolue (VITE_SUPABASE_URL), pas un chemin relatif.
//
// Toute route "/api/..." appelée depuis le client doit donc passer par ce
// helper plutôt que par un chemin relatif en dur.
//
// IMPORTANT : on cible bien "www." et non le domaine nu. Le domaine nu
// (apex, sans www) répond avec une redirection 308 vers www — vérifié via
// les headers Vercel. Un fetch cross-origin qui se fait rediriger pendant le
// preflight CORS (OPTIONS) est abandonné par le navigateur avec une erreur
// générique ("Load failed" sur iOS/Safari), et cette redirection est servie
// par la couche edge/DNS de Vercel AVANT toute fonction serverless — donc
// invisible dans les Runtime Logs, ce qui a rendu ce bug particulièrement
// difficile à diagnostiquer. www.loupgarouafrique.com ne redirige pas et
// répond directement.
const PROD_ORIGIN = 'https://www.loupgarouafrique.com'

export function apiUrl(path: string): string {
  return Capacitor.isNativePlatform() ? `${PROD_ORIGIN}${path}` : path
}
