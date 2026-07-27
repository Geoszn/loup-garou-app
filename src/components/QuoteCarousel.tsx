import { useEffect, useState } from 'react'
import { useLanguage } from '../i18n/LanguageContext'
import type { TranslationKey } from '../i18n/translations'

interface Quote {
  key: TranslationKey
  kind: 'proverb' | 'tip'
}

// 10 proverbes africains parmi les plus connus (tradition orale, sans auteur
// attribué) + 5 conseils maison en rapport avec le jeu (voir translations.ts,
// namespace `quote.*`, pour le détail des textes). Un seul affiché à la
// fois, dans un ordre aléatoire.
const QUOTES: Quote[] = [
  { key: 'quote.proverb1', kind: 'proverb' },
  { key: 'quote.proverb2', kind: 'proverb' },
  { key: 'quote.proverb3', kind: 'proverb' },
  { key: 'quote.proverb4', kind: 'proverb' },
  { key: 'quote.proverb5', kind: 'proverb' },
  { key: 'quote.proverb6', kind: 'proverb' },
  { key: 'quote.proverb7', kind: 'proverb' },
  { key: 'quote.proverb8', kind: 'proverb' },
  { key: 'quote.proverb9', kind: 'proverb' },
  { key: 'quote.proverb10', kind: 'proverb' },
  { key: 'quote.tip1', kind: 'tip' },
  { key: 'quote.tip2', kind: 'tip' },
  { key: 'quote.tip3', kind: 'tip' },
  { key: 'quote.tip4', kind: 'tip' },
  { key: 'quote.tip5', kind: 'tip' },
]

function randomQuoteIndex(excluding?: number): number {
  if (QUOTES.length <= 1) return 0
  let next = Math.floor(Math.random() * QUOTES.length)
  while (next === excluding) next = Math.floor(Math.random() * QUOTES.length)
  return next
}

/** Bandeau de citations qui défile tout seul (proverbes africains + conseils
 * de jeu), pour occuper l'espace sous les règles du jeu sur le tableau de
 * bord (Dashboard.tsx, page "Mon espace") : un texte à la fois, dans un
 * ordre aléatoire, avec un fondu enchaîné entre chaque. Habillage repris de
 * la DA "plaque dorée" des cartes de rôle (voir shadow-tarot, ui.tsx) plutôt
 * qu'un simple texte nu, avec une étiquette "Citation"/"Conseil" qui
 * distingue les deux registres.
 *
 * Pas de padding horizontal sur le conteneur racine : la page appelante a
 * déjà son propre padding de page (voir Dashboard.tsx, `px-4`), en ajouter
 * un ici en doublerait inutilement sur mobile. `min-h` amortit le saut de
 * hauteur entre une citation courte et une longue, sans jamais la limiter
 * (une citation plus longue que le minimum reste entièrement visible, elle
 * grandit simplement la carte). */
export function QuoteCarousel() {
  const { t } = useLanguage()
  const [index, setIndex] = useState(() => randomQuoteIndex())
  const [visible, setVisible] = useState(true)
  const current = QUOTES[index]

  useEffect(() => {
    const holdMs = 15000
    const fadeMs = 500
    let fadeTimeout: ReturnType<typeof setTimeout>
    const interval = setInterval(() => {
      setVisible(false)
      fadeTimeout = setTimeout(() => {
        setIndex((cur) => randomQuoteIndex(cur))
        setVisible(true)
      }, fadeMs)
    }, holdMs)
    return () => {
      clearInterval(interval)
      clearTimeout(fadeTimeout)
    }
  }, [])

  return (
    <div className="flex justify-center">
      <div
        className={`relative flex min-h-[8rem] w-full max-w-xl flex-col items-center justify-center overflow-hidden rounded-2xl border border-moon-400/25 bg-gradient-to-b from-night-800/70 to-night-900/85 px-5 py-6 text-center shadow-tarot backdrop-blur-sm transition-opacity duration-500 sm:min-h-[9rem] sm:px-10 sm:py-8 ${
          visible ? 'opacity-100' : 'opacity-0'
        }`}
      >
        <span className="pointer-events-none absolute inset-x-6 top-0 h-px bg-gradient-to-r from-transparent via-moon-400/40 to-transparent" />
        <p className="mb-3 font-display text-[11px] font-semibold uppercase tracking-[0.3em] text-moon-400 sm:text-xs">
          {current.kind === 'proverb' ? `📜 ${t('quote.kind.proverb')}` : `🧭 ${t('quote.kind.tip')}`}
        </p>
        <p className="font-display text-base leading-relaxed text-balance text-moon-200 sm:text-xl">
          {t(current.key)}
        </p>
        <span className="pointer-events-none absolute inset-x-6 bottom-0 h-px bg-gradient-to-r from-transparent via-moon-400/40 to-transparent" />
      </div>
    </div>
  )
}
