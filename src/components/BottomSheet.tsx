import { useEffect, type ReactNode } from 'react'
import { useLanguage } from '../i18n/LanguageContext'

/** Tiroir qui monte du bas par-dessus l'écran (sans le déplacer) : sert aux infos annexes du débat de jour
 * (joueurs, rôle, vocal) pour que le chat garde tout l'écran. Rendu en place, pas dans un portail : il doit
 * hériter du thème jour/nuit de la partie. Se ferme au tap sur le fond, ✕ ou Échap. */
export function BottomSheet({ open, onClose, title, children }: { open: boolean; onClose: () => void; title: string; children: ReactNode }) {
  const { t } = useLanguage()
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open, onClose])
  if (!open) return null
  return (
    <div className="fixed inset-0 z-[70] flex animate-overlay-in flex-col justify-end bg-black/55" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onClick={(e) => e.stopPropagation()}
        className="mx-auto flex max-h-[78%] w-full max-w-3xl animate-sheet-up flex-col rounded-t-3xl border-t border-night-600/70 bg-gradient-to-b from-night-700 to-night-900 shadow-card"
      >
        <div className="mx-auto mt-2 h-1 w-10 shrink-0 rounded-full bg-moon-200/20" />
        <div className="flex shrink-0 items-center justify-between px-5 pb-2 pt-2">
          <h3 className="font-display text-lg text-moon-200">{title}</h3>
          <button
            type="button"
            onClick={onClose}
            aria-label={t('common.close')}
            className="flex h-8 w-8 items-center justify-center rounded-lg text-moon-200/50 transition-colors hover:bg-night-700/60 hover:text-moon-200"
          >
            ✕
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-5 pb-[max(1.5rem,env(safe-area-inset-bottom))]">{children}</div>
      </div>
    </div>
  )
}
