import { useEffect, useState } from 'react'
import { motion, type PanInfo } from 'framer-motion'
import { useLanguage } from '../i18n/LanguageContext'
import type { TranslationKey } from '../i18n/translations'
import { roleLabel, ROLES, type RoleId } from '../lib/roles'
import type { ImpactBonus, ImpactDetail } from '../types/game'
import { DRAG_CLOSE_THRESHOLD, DRAG_VELOCITY_THRESHOLD } from './ui'

type Translate = (key: TranslationKey, vars?: Record<string, string | number>) => string

/** Petit compteur qui monte de 0 jusqu'à `value` en ~600ms — utilisé pour le
 * total de bonus d'impact ci-dessous, seule "animation" demandée pour cette
 * popup (le reste reste sobre, cohérent avec le reste de l'appli : pas de
 * confettis ni de système d'animation nouveau, juste animate-fade-in/
 * animate-modal-in déjà utilisés partout ailleurs). Se relance à chaque
 * nouvelle valeur (montage du composant = une seule fois, cette popup n'est
 * jamais réutilisée pour deux valeurs différentes). */
function useCountUp(value: number, durationMs = 600) {
  const [display, setDisplay] = useState(0)
  useEffect(() => {
    if (value <= 0) {
      setDisplay(value)
      return
    }
    const start = performance.now()
    let raf: number
    const tick = (now: number) => {
      const progress = Math.min((now - start) / durationMs, 1)
      setDisplay(Math.round(value * progress))
      if (progress < 1) raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [value, durationMs])
  return display
}

/** Réutilisé par EndScreen (GameRoom.tsx) pour la section personnelle de
 * l'écran de fin — même libellé pour un même bonus d'impact, qu'il soit
 * affiché ici (à la mort) ou là-bas (au résultat final). */
export function impactLabel(d: ImpactDetail, t: Translate): string {
  if (d.kind === 'seer_wolf_reveal' && (d.count ?? 1) > 1) {
    return t('impact.seer_wolf_reveal_count', { count: d.count ?? 1 })
  }
  return t(`impact.${d.kind}` as TranslationKey)
}

/** Pop-up affichée juste après une élimination EN COURS DE PARTIE (voir
 * déclenchement dans GameRoom.tsx : transition my_alive true → false tant
 * que game.status !== 'ended'). Montre uniquement ce qui est déjà acquis —
 * jamais un total "final" ni un nouveau palier, puisque le résultat
 * victoire/défaite n'est connu qu'à la fin de la partie (voir
 * my_impact_preview, migration 0073). Le détail complet, lui, apparaît plus
 * tard dans la section personnelle de EndScreen une fois la partie
 * terminée. */
export function DeathImpactModal({
  myRole,
  impact,
  onClose,
}: {
  myRole: string | null
  impact: ImpactBonus | null
  onClose: () => void
}) {
  const { t } = useLanguage()
  const details = impact?.details ?? []
  const total = impact?.bonus ?? 0
  const displayTotal = useCountUp(total)
  const roleInfo = myRole ? ROLES[myRole as RoleId] : null

  // Purement personnelle (rien à synchroniser avec les autres joueurs,
  // contrairement à NightRecapModal/VoteRecapModal, volontairement
  // épargnées par ce geste — voir leur "tous prêts" collectif) : le
  // glissement pour fermer y est sans risque. Même schéma que Modal
  // (ui.tsx) — fermeture directe au relâché, sans état intermédiaire (voir
  // le commentaire de handleDragEnd là-bas pour le bug que ça évite).
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
        aria-labelledby="death-impact-title"
        className="flex w-full max-w-sm animate-modal-in flex-col rounded-2xl border border-night-600/70 bg-gradient-to-b from-night-700/95 to-night-900/95 shadow-card"
        drag="y"
        dragConstraints={{ top: 0, bottom: 0 }}
        dragElastic={{ top: 0, bottom: 0.6 }}
        onDragEnd={handleDragEnd}
      >
        <div className="flex flex-col items-center gap-2 border-b border-night-600/50 px-5 py-5 text-center">
          <h2 id="death-impact-title" className="font-display text-lg text-moon-200">
            {t('deathImpact.title')}
          </h2>
          {myRole && (
            <p className="text-sm text-moon-200/60">
              {roleInfo?.emoji} {t('deathImpact.role', { role: roleLabel(myRole, t) })}
            </p>
          )}
        </div>

        <div className="flex flex-col gap-3 px-5 py-4">
          {details.length === 0 ? (
            <p className="rounded-xl border border-night-600/60 bg-night-800/60 px-3 py-2.5 text-sm text-moon-200/60">
              {t('deathImpact.noImpact')}
            </p>
          ) : (
            <>
              <p className="text-xs uppercase tracking-widest text-moon-200/40">{t('deathImpact.impactIntro')}</p>
              <ul className="flex flex-col gap-2">
                {details.map((d, i) => (
                  <li
                    key={`${d.kind}-${i}`}
                    className="flex animate-fade-in items-center justify-between rounded-xl border border-emerald-500/40 bg-emerald-500/10 px-3 py-2.5"
                    style={{ animationDelay: `${i * 100}ms` }}
                  >
                    <span className="text-sm text-moon-200/90">{impactLabel(d, t)}</span>
                    <span className="font-display text-sm font-semibold text-emerald-300">+{d.points}</span>
                  </li>
                ))}
              </ul>
              <div className="flex items-center justify-between rounded-xl bg-night-800/60 px-3 py-2.5">
                <span className="text-sm font-semibold text-moon-200/80">{t('game.myResultTotal')}</span>
                <span className="font-display text-xl font-bold text-emerald-300">+{displayTotal}</span>
              </div>
            </>
          )}
          <p className="text-center text-xs text-moon-200/40">{t('deathImpact.pendingNote')}</p>
        </div>

        <div className="border-t border-night-600/50 px-5 py-4">
          <button
            type="button"
            onClick={onClose}
            className="w-full rounded-xl bg-blood-600 px-4 py-2.5 text-sm font-semibold text-[#fdf6e3] transition-opacity"
          >
            {t('deathImpact.continue')}
          </button>
        </div>
      </motion.div>
    </div>
  )
}
