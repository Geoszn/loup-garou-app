import { useEffect, useState } from 'react'
import { roleLabel } from '../lib/roles'
import type { PublicPlayer } from '../types/game'
import { FriendRequestPopover } from './FriendRequestPopover'
import { AvatarIcon } from './AvatarIcon'
import { useLanguage } from '../i18n/LanguageContext'

// Cadre visuel autour de l'avatar, qui monte en gamme avec le palier de rang
// (voir p.rank_tier, migration 0074) — même principe de progression que
// RankTierBadge (Stats.tsx), mais un simple anneau CSS plutôt qu'un second
// glyphe SVG : l'avatar ici affiche déjà sa propre icône, superposer un
// second dessin (le badge complet) l'aurait rendu illisible en si petit.
// Visible par tous les AUTRES joueurs pendant la partie, pas seulement sur
// sa propre page de compte — c'est ce qui donne l'effet de statut social.
// Rien avant Éclaireur : un cadre dès le tout premier palier aurait rendu
// "avoir un cadre" banal plutôt que gratifiant.
function tierRingClass(tier: string | null | undefined): string {
  switch (tier) {
    case 'chasseur':
      return 'ring-2 ring-moon-300/70'
    case 'ancien':
      return 'ring-2 ring-moon-300 shadow-[0_0_8px_rgba(217,154,63,0.5)]'
    case 'sage':
      return 'ring-[3px] ring-moon-400 shadow-[0_0_10px_rgba(224,168,74,0.6)]'
    case 'legende':
      return 'ring-[3px] ring-moon-400 shadow-[0_0_14px_rgba(224,168,74,0.85)]'
    default:
      return ''
  }
}

interface Props {
  players: PublicPlayer[]
  selfId?: string
  selectable?: boolean
  selectedId?: string | null
  disabledIds?: string[]
  highlightIds?: string[]
  onSelect?: (userId: string) => void
  showDeathReveal?: boolean
  /** Ids des joueurs actuellement connectés (voir useGame.ts, présence
   * Realtime) — si fourni, affiche un petit voyant vert/gris sur chaque
   * avatar. Omis (undefined) : pas de voyant du tout, pour les usages qui
   * n'ont pas cette donnée sous la main. */
  onlineUserIds?: Set<string>
  /** Version resserrée (demande utilisateur : "moins encombrant" pour tous
   * les votes/choix) — avatars plus petits, plus de colonnes, marges
   * réduites. Réservée aux grilles de SÉLECTION (vote village, loups,
   * Voyante, Sorcière, Chasseur...) ; le roster en lecture seule garde la
   * taille normale, plus confortable à parcourir sans urgence de clic. */
  compact?: boolean
}

export function PlayerGrid({
  players,
  selfId,
  selectable = false,
  selectedId,
  disabledIds = [],
  highlightIds = [],
  onSelect,
  showDeathReveal = true,
  onlineUserIds,
  compact = false,
}: Props) {
  // Popover "Ajouter en ami" : uniquement en dehors d'un mode vote/action
  // (selectable), pour ne jamais gêner le choix d'une cible pendant un vote.
  // Un seul avatar ouvert à la fois ; un clic n'importe où ailleurs le ferme.
  const [openId, setOpenId] = useState<string | null>(null)
  const { t } = useLanguage()

  useEffect(() => {
    if (!openId) return
    const close = () => setOpenId(null)
    document.addEventListener('click', close)
    return () => document.removeEventListener('click', close)
  }, [openId])

  return (
    <div
      className={
        compact
          ? 'grid grid-cols-4 gap-1.5 sm:grid-cols-5 md:grid-cols-6'
          : 'grid grid-cols-3 gap-2 sm:grid-cols-4 md:grid-cols-5'
      }
    >
      {players.map((p) => {
        const isDisabled = !p.is_alive || disabledIds.includes(p.user_id)
        const isSelected = selectedId === p.user_id
        const isHighlighted = highlightIds.includes(p.user_id)
        // Un seul style "choisi" fort pour les deux mécanismes de sélection
        // du composant (selectedId : une seule cible ; highlightIds : cibles
        // multiples, ex. Cupidon/Anancy qui choisissent 2 joueurs) — retour
        // utilisateur : le contour doré discret jusqu'ici réservé à
        // highlightIds seul ne suffisait pas à voir clairement qui était
        // sélectionné.
        const isPicked = isSelected || isHighlighted
        const clickable = selectable && !isDisabled && onSelect
        const canAddFriend = !selectable && !!selfId && p.user_id !== selfId

        return (
          <div key={p.id} className="relative">
            <button
              type="button"
              disabled={!clickable && !canAddFriend}
              onClick={() => {
                if (clickable) {
                  onSelect?.(p.user_id)
                } else if (canAddFriend) {
                  setOpenId((cur) => (cur === p.user_id ? null : p.user_id))
                }
              }}
              className={`group relative flex w-full flex-col items-center gap-1 rounded-xl border-2 text-center shadow-card transition-all ${compact ? 'p-1.5' : 'p-2'}
                ${isPicked ? 'scale-[1.04] border-blood-400 bg-gradient-to-b from-blood-600/45 to-blood-700/25 shadow-blood-glow' : 'border-night-600/60 bg-gradient-to-b from-night-700/50 to-night-900/50'}
                ${!p.is_alive ? 'opacity-40 grayscale' : ''}
                ${clickable || canAddFriend ? 'cursor-pointer hover:border-moon-400/50 hover:from-night-600/60 active:scale-95' : ''}
              `}
            >
              {/* Couleur du texte fixe (pas liée au thème jour/nuit) : les
                  avatars utilisent une palette de couleurs claires/vives fixe,
                  donc un texte sombre garde une bonne lisibilité dans les deux
                  thèmes, contrairement à night-950 qui deviendrait blanc de jour. */}
              <span className="relative inline-flex">
                <span
                  className={`flex items-center justify-center rounded-full font-bold text-[#05070d] ring-offset-2 ${compact ? 'h-8 w-8 text-xs' : 'h-10 w-10 text-sm'} ${
                    p.rank_tier ? `ring-offset-night-900 ${tierRingClass(p.rank_tier)}` : ''
                  }`}
                  style={{ backgroundColor: p.avatar_color }}
                >
                  {p.avatar_icon ? (
                    <AvatarIcon icon={p.avatar_icon} className={compact ? 'h-4 w-4' : 'h-5 w-5'} />
                  ) : (
                    p.display_name.slice(0, 1).toUpperCase()
                  )}
                </span>
                {onlineUserIds && (
                  <span
                    title={onlineUserIds.has(p.user_id) ? t('common.online') : t('common.offline')}
                    className={`absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full border-2 border-night-900 ${
                      onlineUserIds.has(p.user_id) ? 'bg-emerald-400' : 'bg-night-500'
                    }`}
                  />
                )}
              </span>
              <span
                className={`max-w-full truncate font-medium ${compact ? 'text-[10px]' : 'text-xs'} ${
                  isPicked ? 'font-semibold text-moon-200' : 'text-moon-200/90'
                }`}
              >
                {p.display_name}
                {p.user_id === selfId ? ` (${t('common.you')})` : ''}
              </span>
              {!p.is_alive && showDeathReveal && p.revealed_role && (
                <span className="text-[10px] text-blood-400">💀 {roleLabel(p.revealed_role, t)}</span>
              )}
              {p.is_host && <span className="absolute -right-1 -top-1 text-xs">👑</span>}
              {p.is_captain && (
                <span className="absolute -left-1 -top-1 text-xs" title={t('common.captain')}>
                  🎖️
                </span>
              )}
              {/* Badge ✓, en plus (pas à la place) du contour/fond déjà mis en
                  évidence ci-dessus : retour utilisateur — le contour seul
                  restait trop discret pour être certain, d'un coup d'œil,
                  d'avoir cliqué sur la bonne personne dans une grille dense.
                  Coin bas-droit de la carte, jamais utilisé par 👑/🎖️
                  (coins du haut) ni par le voyant en ligne (ancré sur
                  l'avatar, pas sur la carte). */}
              {isPicked && (
                <span className="absolute -bottom-1 -right-1 flex h-5 w-5 animate-check-in items-center justify-center rounded-full border-2 border-night-900 bg-blood-400 text-[11px] font-bold leading-none text-night-950 shadow-blood-btn">
                  ✓
                </span>
              )}
            </button>
            {openId === p.user_id && (
              <FriendRequestPopover
                userId={p.user_id}
                displayName={p.display_name}
                avatarIcon={p.avatar_icon}
                onClose={() => setOpenId(null)}
              />
            )}
          </div>
        )
      })}
    </div>
  )
}
