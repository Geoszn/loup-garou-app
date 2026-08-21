import { useEffect, useRef, useState } from 'react'
import { ROLES, type RoleId } from '../lib/roles'
import type { PublicPlayer, RoleCounts } from '../types/game'
import { supabase } from '../lib/supabase'
import { AvatarIcon } from './AvatarIcon'
import { useLanguage } from '../i18n/LanguageContext'

// Rôles spéciaux du village qu'on affiche en détail (statut vivant/éliminé).
// Volontairement sans 'loup_garou' (compté à part, camp par camp) ni
// 'capitaine' (un titre, pas un rôle avec sa propre carte).
const SPECIAL_ROLE_KEYS: RoleId[] = ['voyante', 'sorciere', 'chasseur', 'petite_fille', 'cupidon', 'ancien', 'voleur', 'enfant_sauvage']

/** Petit bouton "effectifs", ouvert/fermé à la demande, visible pendant
 * toute la partie (branché dans PhaseBanner) — pour répondre à "combien de
 * loups il reste, combien de villageois, est-ce que la voyante est encore
 * vivante" sans avoir à recompter les 💀 dans la grille des joueurs.
 *
 * Important : tout ce qui est affiché ici se déduit uniquement d'infos déjà
 * publiques — la composition de la partie (role_counts, connue de tous dès
 * le salon d'attente) et le rôle des joueurs MORTS (revealed_role, déjà
 * affiché publiquement dès leur élimination). On ne regarde jamais le rôle
 * d'un joueur encore en vie : impossible donc de déduire qui est loup parmi
 * les vivants, seulement combien il en reste quelque part dans la partie —
 * exactement le calcul qu'un joueur pourrait déjà faire de tête.
 *
 * On y ajoute aussi la liste des joueurs avec un bouton "Ajouter en ami" :
 * la grille de joueurs (PlayerGrid) qui portait ce bouton n'est affichée que
 * pendant certaines phases (débat, vote, ou une fois mort) — pendant la
 * nuit, la révélation du jour ou le récap du vote, aucune grille n'est
 * rendue et il devenait impossible d'ajouter quelqu'un en ami. Ce panneau,
 * lui, est visible en permanence quelle que soit la phase. */
export function RosterSummary({
  players,
  roleCounts,
  selfId,
  onlineUserIds,
  infectionOccurred = false,
  wildChildConversionOccurred = false,
}: {
  players: PublicPlayer[]
  roleCounts: RoleCounts | null | undefined
  selfId?: string
  /** Ids des joueurs actuellement connectés (voir useGame.ts, présence
   * Realtime) — si fourni, affiche un petit voyant vert/gris devant chaque
   * nom dans la liste des joueurs. */
  onlineUserIds?: Set<string>
  /** Une infection du Loup Alpha a-t-elle eu lieu dans cette partie (voir
   * MyGameView.alpha_infection_occurred, migration 0095) ? Fait public déjà
   * annoncé à tout le monde dans le journal — ne révèle rien de plus. Permet
   * de corriger `totalWolves` ci-dessous, qui sinon reste figé sur la
   * composition initiale même après une conversion réussie. */
  infectionOccurred?: boolean
  /** Même principe qu'infectionOccurred ci-dessus, mais pour l'Enfant
   * Sauvage qui a perdu son mentor et rejoint les Loups-Garous (voir
   * MyGameView.wild_child_conversion_occurred, migration 0099) — retour
   * utilisateur : sans ça, le total de loups affiché ne changeait pas et
   * pouvait tromper les joueurs. */
  wildChildConversionOccurred?: boolean
}) {
  const { t } = useLanguage()
  const [open, setOpen] = useState(false)
  // État par joueur ciblé : demande en cours d'envoi ou résultat affiché
  // en ligne (pas de popover flottant ici, car la liste défile — voir
  // note ci-dessous).
  const [friendStatus, setFriendStatus] = useState<Record<string, 'sending' | { ok: boolean; message: string }>>({})
  const containerRef = useRef<HTMLDivElement>(null)

  async function addFriend(userId: string) {
    setFriendStatus((s) => ({ ...s, [userId]: 'sending' }))
    const { data, error } = await supabase.rpc('send_friend_request_by_user_id', { p_target_user_id: userId })
    setFriendStatus((s) => ({
      ...s,
      [userId]: error
        ? { ok: false, message: error.message }
        : { ok: true, message: data?.status === 'accepted' ? t('roster.becameFriends') : t('roster.friendSent') },
    }))
  }

  useEffect(() => {
    if (!open) return
    function onClick(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) setOpen(false)
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('click', onClick)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('click', onClick)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  const alive = players.filter((p) => p.is_alive)
  // Loup Alpha compté à part (voir migration 0088) : +1 au total s'il est
  // activé, et ses morts comptent comme des morts loups au même titre que
  // 'loup_garou'. +1 supplémentaire si une infection a réussi (voir
  // infectionOccurred, migration 0095) — corrige la limite notée ici
  // auparavant : ce total restait figé sur la composition INITIALE
  // (role_counts) même une fois un villageois converti en cours de partie.
  const totalWolves =
    (roleCounts?.loup_garou ?? 0) +
    (roleCounts?.loup_alpha ? 1 : 0) +
    (infectionOccurred ? 1 : 0) +
    (wildChildConversionOccurred ? 1 : 0)
  const deadWolves = players.filter(
    (p) => !p.is_alive && (p.revealed_role === 'loup_garou' || p.revealed_role === 'loup_alpha')
  ).length
  const remainingWolves = Math.max(totalWolves - deadWolves, 0)
  const remainingVillage = Math.max(alive.length - remainingWolves, 0)
  const specialRoles = SPECIAL_ROLE_KEYS.filter((k) => roleCounts?.[k as keyof RoleCounts])

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={() => {
          setOpen((v) => !v)
          setFriendStatus({})
        }}
        title={t('roster.title.tooltip')}
        className={`flex h-8 w-8 items-center justify-center rounded-full border text-sm transition-colors ${
          open ? 'border-moon-400/40 bg-moon-400/10 text-moon-300' : 'border-night-600 bg-night-800/60 text-moon-200/70'
        }`}
      >
        📊
      </button>

      {open && (
        <div className="absolute right-0 top-full z-30 mt-2 w-64 rounded-xl border border-night-600 bg-night-800 p-3 text-left shadow-card">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-moon-200/50">{t('roster.title')}</p>
          <p className="mb-3 text-sm text-moon-200">
            👥 <strong>{alive.length}</strong> / {players.length} {t('roster.aliveSuffix')}
          </p>

          <div className="mb-3 flex flex-col gap-1 text-sm">
            <div className="flex items-center justify-between">
              <span className="text-moon-200/80">{t('roster.wolves')}</span>
              <span className="font-semibold text-moon-200">
                {remainingWolves} / {totalWolves}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-moon-200/80">{t('roster.village')}</span>
              <span className="font-semibold text-moon-200">
                {remainingVillage} / {Math.max(players.length - totalWolves, 0)}
              </span>
            </div>
          </div>

          {specialRoles.length > 0 && (
            <>
              <p className="mb-1.5 text-xs font-semibold uppercase tracking-wider text-moon-200/50">{t('roster.specialRoles')}</p>
              <div className="flex flex-col gap-1 text-sm">
                {specialRoles.map((key) => {
                  const role = ROLES[key]
                  const eliminated = players.some((p) => !p.is_alive && p.revealed_role === key)
                  return (
                    <div key={key} className="flex items-center justify-between">
                      <span className="text-moon-200/80">
                        {role.emoji} {t(role.nameKey)}
                      </span>
                      <span className={eliminated ? 'text-blood-400' : 'text-emerald-400'}>
                        {eliminated ? t('roster.eliminated') : t('roster.alive')}
                      </span>
                    </div>
                  )
                })}
              </div>
            </>
          )}

          {selfId && (
            <>
              <p className="mb-1.5 mt-3 text-xs font-semibold uppercase tracking-wider text-moon-200/50">{t('roster.players')}</p>
              <div className="flex max-h-40 flex-col gap-1 overflow-y-auto text-sm">
                {players.map((p) => {
                  const status = friendStatus[p.user_id]
                  return (
                    <div key={p.id} className="flex items-center justify-between gap-2">
                      <span className="min-w-0 truncate text-moon-200/80">
                        {onlineUserIds && (
                          <span
                            title={onlineUserIds.has(p.user_id) ? t('common.online') : t('common.offline')}
                            className={`mr-1.5 inline-block h-1.5 w-1.5 rounded-full align-middle ${
                              onlineUserIds.has(p.user_id) ? 'bg-emerald-400' : 'bg-night-500'
                            }`}
                          />
                        )}
                        <AvatarIcon icon={p.avatar_icon} className="mr-1 inline-block h-3.5 w-3.5 -translate-y-px align-middle" />{' '}
                        {p.display_name}
                        {p.user_id === selfId ? ` (${t('common.you')})` : ''}
                        {!p.is_alive ? ' 💀' : ''}
                      </span>
                      {p.user_id !== selfId &&
                        (status && status !== 'sending' ? (
                          <span className={`shrink-0 text-xs ${status.ok ? 'text-emerald-400' : 'text-blood-400'}`}>
                            {status.ok ? status.message : t('roster.friendFailed')}
                          </span>
                        ) : (
                          <button
                            type="button"
                            onClick={() => addFriend(p.user_id)}
                            disabled={status === 'sending'}
                            title={t('common.addFriend')}
                            className="shrink-0 text-xs text-moon-200/40 transition-colors hover:text-moon-200 disabled:opacity-50"
                          >
                            {status === 'sending' ? '…' : '➕'}
                          </button>
                        ))}
                    </div>
                  )
                })}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  )
}
