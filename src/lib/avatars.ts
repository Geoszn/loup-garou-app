/** Icônes d'avatar proposées dans le panneau "Mon compte". Volontairement
 * neutres (pas d'emoji de rôle comme 🔮/🧙/🏹, ni d'emoji déjà utilisé comme
 * indicateur de statut ailleurs dans l'appli comme 💀/👻) pour ne jamais
 * laisser croire qu'un choix d'icône trahit un rôle ou un état en partie.
 * Doit rester synchronisé avec la contrainte `profiles_avatar_icon_check` et
 * la validation de `update_my_profile` en base (voir 0014_account.sql et
 * 0040_lang_preference_and_more_avatars.sql). */
export const AVATAR_ICONS = [
  '🐺', '🌕', '🦇', '🕯️', '⚰️', '🔪', '🩸', '👁️', '🌲', '🏚️',
  '🦉', '🕷️', '🐗', '🦁', '🐆', '🦅', '🐍', '🦂', '🔥', '⚡', '🌑', '⚔️', '🪶', '🛖', '🥁',
] as const

export type AvatarIcon = (typeof AVATAR_ICONS)[number]

export const DEFAULT_AVATAR_ICON: AvatarIcon = '🐺'

// Points de rang requis pour débloquer chaque icône (voir migration 0074,
// avatar_icon_min_points — SEULE source de vérité pour l'application réelle
// de la règle : un appel direct à update_my_profile est toujours revalidé
// côté serveur, cette table ne sert qu'à l'affichage immédiat côté client
// (griser une icône, afficher le palier requis) sans attendre un aller-
// retour réseau qui échouerait de toute façon. Les 8 premières icônes
// restent accessibles dès l'inscription (0 point) pour qu'un nouveau joueur
// ait toujours un choix correct sans être découragé d'entrée de jeu — les 17
// autres se débloquent ensuite par lot de 3-4 à chaque palier, jusqu'à
// Légende du Village (2800 pts). Doit rester synchronisé avec
// avatar_icon_min_points côté serveur, comme RANK_TIERS (lib/ranks.ts) doit
// déjà rester synchronisé avec rank_tier_for_points.
export const AVATAR_ICON_MIN_POINTS: Record<AvatarIcon, number> = {
  '🐺': 0, '🌕': 0, '🕯️': 0, '🌲': 0, '🏚️': 0, '🛖': 0, '🪶': 0, '🌑': 0,
  '🦇': 100, '⚰️': 100, '🔪': 100,
  '👁️': 250, '🕷️': 250, '🐗': 250,
  '🦉': 600, '🐍': 600, '🦂': 600, '🥁': 600,
  '🦁': 1400, '🐆': 1400, '🦅': 1400, '🩸': 1400,
  '🔥': 2800, '⚡': 2800, '⚔️': 2800,
}
