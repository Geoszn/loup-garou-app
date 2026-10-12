import { useEffect, useRef, useState } from 'react'
import { useLanguage } from '../i18n/LanguageContext'
import { translateGameLogMessage } from '../lib/gameLogTranslate'

// Journal de la partie, en onglet à part du chat plein écran (jour et nuit) : les évènements publics (morts, votes,
// annonces) ne se mêlent plus aux messages des joueurs. Il prend la place de la liste de messages ; la bulle d'écriture
// (micro, vote) reste en bas.

export interface JournalEntry {
  id: string
  message: string
  created_at: string
}

// Combien d'entrées le joueur a déjà vues, par partie : tient d'un écran à l'autre (le jour et la nuit montent des
// composants différents) pour que la pastille ne réapparaisse pas à chaque changement de phase.
const seenByGame = new Map<string, number>()

/** Nombre d'entrées arrivées depuis la dernière ouverture du journal (0 quand il est ouvert). */
export function useJournalUnread(gameId: string, total: number, open: boolean): number {
  const [seen, setSeen] = useState(() => seenByGame.get(gameId) ?? total)
  useEffect(() => {
    if (!open) return
    seenByGame.set(gameId, total)
    setSeen(total)
  }, [gameId, total, open])
  useEffect(() => {
    if (!seenByGame.has(gameId)) seenByGame.set(gameId, total)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gameId])
  return open ? 0 : Math.max(total - seen, 0)
}

/** Volet du journal : s'ouvre sous la rangée du haut du chat plein écran, sur le haut du fil. Les messages récents
 * (en bas) et la bulle d'écriture restent visibles et utilisables. Se ferme avec ✕, en tapant le fil, ou dès qu'on
 * se met à écrire (voir ChatPanel `onComposerFocus`). */
export function JournalDrawer({ open, onClose, entries, topPx }: { open: boolean; onClose: () => void; entries: JournalEntry[]; topPx?: number }) {
  const { t, lang } = useLanguage()
  const listRef = useRef<HTMLDivElement>(null)
  // Les plus récentes en bas, comme le chat : on se recolle au bas à l'ouverture et à chaque nouvelle entrée.
  useEffect(() => {
    const el = listRef.current
    if (open && el) el.scrollTop = el.scrollHeight
  }, [open, entries.length])
  if (!open) return null
  const sorted = [...entries].sort((a, b) => Date.parse(a.created_at) - Date.parse(b.created_at))
  const time = (iso: string) => new Date(iso).toLocaleTimeString(lang === 'fr' ? 'fr-FR' : 'en-GB', { hour: '2-digit', minute: '2-digit' })
  return (
    <>
      {/* Fond transparent : taper le fil referme le volet, sans toucher à la bulle d'écriture (qui reste en dessous). */}
      <div className="absolute inset-x-0 bottom-24 top-0 z-[9]" onClick={onClose} aria-hidden="true" />
      <section
        role="dialog"
        aria-label={t('tabs.journal')}
        style={{ top: Math.max((topPx ?? 96) - 10, 0) }}
        className="absolute inset-x-3 z-[9] flex max-h-[42%] animate-fade-in flex-col overflow-hidden rounded-2xl border border-night-600/70 bg-night-900 shadow-card"
      >
        <header className="flex items-center justify-between gap-2 border-b border-night-600/50 px-4 py-2">
          <span className="text-[11px] font-semibold uppercase tracking-widest text-moon-300/80">{t('tabs.journal')}</span>
          <button
            type="button"
            onClick={onClose}
            aria-label={t('common.close')}
            className="flex h-7 w-7 items-center justify-center rounded-full text-moon-200/50 transition-colors hover:bg-night-700/60 hover:text-moon-200"
          >
            <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
              <path d="M6 6l12 12M18 6L6 18" />
            </svg>
          </button>
        </header>
        <div ref={listRef} className="min-h-0 flex-1 overflow-y-auto overscroll-contain scrollbar-thin px-4 py-3">
          {sorted.length === 0 ? (
            <p className="py-3 text-center text-sm text-moon-200/40">{t('game.logEmpty')}</p>
          ) : (
            <ol className="flex flex-col gap-2.5">
              {sorted.map((e) => (
                <li key={e.id} className="flex items-baseline gap-3">
                  <span className="w-10 shrink-0 text-right text-[11px] tabular-nums text-moon-200/35">{time(e.created_at)}</span>
                  <span className="min-w-0 flex-1 border-l border-moon-300/20 pl-3 text-sm leading-snug text-moon-200/85">
                    {translateGameLogMessage(e.message, lang, t)}
                  </span>
                </li>
              ))}
            </ol>
          )}
        </div>
      </section>
    </>
  )
}
