// Vrai uniquement dans le point d'entrée dédié à l'administration
// (admin.html, servi seulement sur le sous-domaine admin — voir
// vercel.json) : c'est cette page qui pose data-app="admin" sur <html>.
// Volontairement un simple drapeau posé par le HTML plutôt qu'un test sur le
// nom de domaine : le code du site public ne contient ainsi aucun nom de
// domaine ni chemin lié à l'administration.
export const isAdminApp = typeof document !== 'undefined' && document.documentElement.dataset.app === 'admin'
