/** Paramètre ?redirect= (renvoi vers la page visée après connexion) : on
 * n'accepte qu'un chemin INTERNE. Sans ça, un lien piégé du type
 * /connexion?redirect=//site-pirate.com (ou avec une barre oblique inverse,
 * cas connu de contournement de react-router) enverrait le joueur, une fois
 * connecté, sur un faux site imitant le nôtre. Renvoie null si la valeur est
 * absente ou suspecte : l'appelant retombe alors sur son écran par défaut. */
export function safeRedirect(value: string | null | undefined): string | null {
  if (!value) return null
  if (!value.startsWith('/') || value.startsWith('//')) return null
  if (value.includes('\\') || /[\u0000-\u001f]/.test(value)) return null
  return value
}
