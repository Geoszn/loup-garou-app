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

export function GameJournal({ entries, topPx = 56 }: { entries: JournalEntry[]; topPx?: number }) {
  const { t, lang } = useLanguage()
  const listRef = useRef<HTMLDivElement>(null)
  // Les plus récentes en bas, comme le chat : on se recolle au bas à l'ouverture et à chaque nouvelle entrée.
  useEffect(() => {
    const el = listRef.current
    if (el) el.scrollTop = el.scrollHeight
  }, [entries.length])
  const sorted = [...entries].sort((a, b) => Date.parse(a.created_at) - Date.parse(b.created_at))
  const time = (iso: string) => new Date(iso).toLocaleTimeString(lang === 'fr' ? 'fr-FR' : 'en-GB', { hour: '2-digit', minute: '2-digit' })
  return (
    <div ref={listRef} style={{ paddingTop: Math.max(topPx - 4, 0) }} className="h-full overflow-y-auto overscroll-contain scrollbar-thin px-4 pb-28">
      <p className="mb-4 text-center text-[11px] text-moon-200/45">{t('journal.note')}</p>
      {sorted.length === 0 ? (
        <p className="py-6 text-center text-sm text-moon-200/40">{t('game.logEmpty')}</p>
      ) : (
        <ol className="flex flex-col gap-3">
          {sorted.map((e) => (
            <li key={e.id} className="flex animate-fade-in items-baseline gap-3">
              <span className="w-10 shrink-0 text-right text-[11px] tabular-nums text-moon-200/35">{time(e.created_at)}</span>
              <span className="min-w-0 flex-1 border-l border-moon-300/20 pl-3 text-sm leading-snug text-moon-200/85">
                {translateGameLogMessage(e.message, lang, t)}
              </span>
            </li>
          ))}
        </ol>
      )}
    </div>
  )
}
