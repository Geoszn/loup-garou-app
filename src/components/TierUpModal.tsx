import { motion, type PanInfo } from 'framer-motion'
import { useLanguage } from '../i18n/LanguageContext'
import { RankTierBadge } from './RankTierBadge'
import { AvatarIcon } from './AvatarIcon'
import { tierLabel, type RankTier } from '../lib/ranks'
import { AVATAR_ICON_MIN_POINTS, type AvatarIcon as AvatarIconId } from '../lib/avatars'
import { DRAG_CLOSE_THRESHOLD, DRAG_VELOCITY_THRESHOLD } from './ui'

/** Paliers à partir desquels un cadre d'avatar apparaît en partie (voir
 * tierRingClass, PlayerGrid.tsx) — nouveau_venu et villageois n'ont encore
 * aucun cadre, donc rien à annoncer de ce côté-là pour ces deux paliers. */
const FRAME_TIERS = new Set<RankTier>(['chasseur', 'ancien', 'sage', 'legende'])

/** Popup célébrant le franchissement d'un nouveau palier de rang (voir
 * EndScreen, GameRoom.tsx — seul endroit où rank_points change, à la fin
 * d'une partie). Affichée une seule fois par partie où le palier a
 * effectivement changé, jamais en cours de partie (le nouveau palier n'est
 * connu qu'une fois my_game_result rempli). Montre ce qui vient d'être
 * concrètement débloqué (icônes + cadre d'avatar, voir migration 0074)
 * plutôt qu'un simple "bravo" abstrait — c'est ce qui rend la récompense
 * tangible. */
export function TierUpModal({ newTier, previousPoints, newPoints, onClose }: {
  newTier: RankTier
  previousPoints: number
  newPoints: number
  onClose: () => void
}) {
  const { t } = useLanguage()

  const unlockedIcons = (Object.entries(AVATAR_ICON_MIN_POINTS) as [AvatarIconId, number][])
    .filter(([, min]) => min > previousPoints && min <= newPoints)
    .map(([icon]) => icon)

  const unlocksFrame = FRAME_TIERS.has(newTier)

  // Purement personnelle, comme DeathImpactModal — voir son commentaire
  // pour pourquoi ni elle ni TierUpModal ne posent de risque de
  // désynchronisation, contrairement à NightRecapModal/VoteRecapModal.
  function handleDragEnd(_: PointerEvent | MouseEvent | TouchEvent, info: PanInfo) {
    if (info.offset.y > DRAG_CLOSE_THRESHOLD || info.velocity.y > DRAG_VELOCITY_THRESHOLD) {
      onClose()
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex animate-overlay-in items-center justify-center bg-black/60 px-4 py-8 backdrop-blur-sm">
      <motion.div
        role="dialog"
        aria-modal="true"
        aria-labelledby="tier-up-title"
        className="flex w-full max-w-sm animate-modal-in flex-col rounded-2xl border border-moon-400/40 bg-gradient-to-b from-night-700/95 to-night-900/95 shadow-glow"
        drag="y"
        dragConstraints={{ top: 0, bottom: 0 }}
        dragElastic={{ top: 0, bottom: 0.6 }}
        onDragEnd={handleDragEnd}
      >
        <div className="flex flex-col items-center gap-3 border-b border-night-600/50 px-5 py-6 text-center">
          <p className="text-xs uppercase tracking-widest text-moon-300">{t('tierUp.eyebrow')}</p>
          <div className="animate-fade-in">
            <RankTierBadge tier={newTier} size={64} />
          </div>
          <h2 id="tier-up-title" className="font-display text-xl text-moon-200">
            {t('tierUp.title')}
          </h2>
          <p className="text-sm text-moon-200/70">{t('tierUp.subtitle', { tier: tierLabel(newTier, t) })}</p>
        </div>

        <div className="flex flex-col gap-3 px-5 py-4">
          {unlockedIcons.length > 0 && (
            <div className="flex flex-col gap-2">
              <p className="text-xs uppercase tracking-widest text-moon-200/40">{t('tierUp.unlockedIcons')}</p>
              <div className="flex flex-wrap justify-center gap-2">
                {unlockedIcons.map((icon, i) => (
                  <span
                    key={icon}
                    className="flex h-10 w-10 animate-fade-in items-center justify-center rounded-xl border border-moon-400/50 bg-moon-400/10 text-moon-200"
                    style={{ animationDelay: `${i * 90}ms` }}
                  >
                    <AvatarIcon icon={icon} className="h-5 w-5" />
                  </span>
                ))}
              </div>
            </div>
          )}

          {unlocksFrame && (
            <p className="rounded-xl border border-night-600/60 bg-night-800/60 px-3 py-2.5 text-center text-xs text-moon-200/60">
              {t('tierUp.unlockedFrame')}
            </p>
          )}
        </div>

        <div className="border-t border-night-600/50 px-5 py-4">
          <button
            type="button"
            onClick={onClose}
            className="w-full rounded-xl bg-blood-600 px-4 py-2.5 text-sm font-semibold text-[#fdf6e3] transition-opacity"
          >
            {t('tierUp.continue')}
          </button>
        </div>
      </motion.div>
    </div>
  )
}
