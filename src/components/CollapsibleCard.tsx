import { useState, type ReactNode } from 'react'
import { useLanguage } from '../i18n/LanguageContext'

/** Lit/écrit l'état replié d'un bloc dans le stockage local (confort
 * d'affichage propre à l'appareil, jamais un réglage de compte). */
function useStoredOpen(storageKey: string, defaultOpen: boolean) {
  const [open, setOpen] = useState<boolean>(() => {
    try {
      const saved = localStorage.getItem(storageKey)
      if (saved !== null) return saved === '1'
    } catch {
      // stockage indisponible : valeur par défaut
    }
    return defaultOpen
  })
  function toggle() {
    setOpen((v) => {
      const next = !v
      try {
        localStorage.setItem(storageKey, next ? '1' : '0')
      } catch {
        // sans conséquence : l'état ne sera juste pas mémorisé
      }
      return next
    })
  }
  return [open, toggle] as const
}

/** Bloc du tableau de bord qu'on peut replier : l'en-tête entier bascule, un
 * chevron indique l'état, et `action` (lien « Voir tout »…) reste cliquable à
 * côté sans déclencher le repli. */
export function CollapsibleCard({
  storageKey,
  title,
  action,
  defaultOpen = true,
  children,
}: {
  storageKey: string
  title: ReactNode
  action?: ReactNode
  defaultOpen?: boolean
  children: ReactNode
}) {
  const { t } = useLanguage()
  const [open, toggle] = useStoredOpen(storageKey, defaultOpen)
  return (
    <section className="overflow-hidden rounded-2xl border border-night-600/70 bg-gradient-to-b from-night-700/70 to-night-900/85 shadow-card">
      <div className={`flex items-center gap-3 px-4 py-3 ${open ? 'border-b border-night-700/60' : ''}`}>
        <button
          type="button"
          onClick={toggle}
          aria-expanded={open}
          aria-label={open ? t('section.collapse') : t('section.expand')}
          className="flex min-w-0 flex-1 items-center gap-2 text-left"
        >
          <span className="min-w-0 flex-1 truncate font-display text-base text-moon-200 sm:text-lg">{title}</span>
          <span className={`shrink-0 text-base leading-none text-moon-200/70 transition-transform ${open ? '' : '-rotate-90'}`} aria-hidden="true">
            ⌄
          </span>
        </button>
        {action}
      </div>
      {open && children}
    </section>
  )
}

/** Pagination simple : « Précédent — Page 1 sur 3 — Suivant ». N'affiche rien
 * quand une seule page suffit. */
export function Pager({ page, pageCount, onChange }: { page: number; pageCount: number; onChange: (page: number) => void }) {
  const { t } = useLanguage()
  if (pageCount <= 1) return null
  const button =
    'rounded-lg border border-night-600/60 bg-night-900/50 px-3 py-1.5 text-xs font-semibold text-moon-200 transition-colors hover:border-moon-400/40 disabled:cursor-not-allowed disabled:opacity-35'
  return (
    <div className="flex items-center justify-between gap-2 pt-1">
      <button type="button" className={button} disabled={page <= 0} onClick={() => onChange(page - 1)}>
        ← {t('pager.prev')}
      </button>
      <span className="text-[11px] tabular-nums text-moon-200/50">{t('pager.page', { page: page + 1, total: pageCount })}</span>
      <button type="button" className={button} disabled={page >= pageCount - 1} onClick={() => onChange(page + 1)}>
        {t('pager.next')} →
      </button>
    </div>
  )
}

export const PAGE_SIZE = 10
