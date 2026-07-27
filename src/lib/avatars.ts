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
