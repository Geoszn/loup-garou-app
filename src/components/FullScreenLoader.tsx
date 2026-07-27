/** Écran affiché pendant tout chargement plein écran — au tout premier
 * allumage de l'appli (le temps que AuthContext résolve la session) comme
 * lors des transitions protégées par <ProtectedRoute>. Le logo qui respire
 * (animate-breathe) sert d'écran de démarrage ("splash screen") ; l'anneau
 * qui tourne autour reste le signal universel de chargement en cours, pour
 * ne pas laisser croire que l'appli est figée si ça prend plus d'une seconde. */
export function FullScreenLoader() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-5 bg-night-950">
      <div className="relative flex h-24 w-24 items-center justify-center">
        <div className="absolute inset-0 animate-spin rounded-full border-2 border-moon-400/70 border-t-transparent" />
        <img src="/logo.png" alt="Loup Garou d'Afrique" className="animate-breathe h-16 w-16 rounded-full" />
      </div>
    </div>
  )
}
