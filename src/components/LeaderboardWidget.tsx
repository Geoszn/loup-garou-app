import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { tierInfo } from '../lib/ranks'
import { useLanguage } from '../i18n/LanguageContext'

interface Entry {
  user_id: string
  username: string
  avatar_icon: string
  rank_points: number
  tier: string
  current_streak: number
}

/** Aperçu du classement mondial (top 5), affiché sur la page d'accueil
 * PUBLIQUE — donc sans authentification (get_public_leaderboard est
 * accessible à anon, voir migration 0055). Sert de vitrine pour donner
 * envie de créer un compte et grimper le classement, pas de remplacer la
 * page Statistiques complète (mondial + national, réservée aux comptes
 * connectés — voir Stats.tsx). */
export function LeaderboardWidget() {
  const { t } = useLanguage()
  const [entries, setEntries] = useState<Entry[] | null>(null)

  useEffect(() => {
    let cancelled = false
    supabase
      .rpc('get_public_leaderboard', { p_scope: 'global', p_continent: null, p_limit: 5 })
      .then(({ data, error }) => {
        if (!cancelled && !error) setEntries(data as Entry[])
      })
    return () => {
      cancelled = true
    }
  }, [])

  // Rien tant qu'il n'y a pas encore assez de joueurs classés (get_public_
  // leaderboard exige 3 parties minimum) — pas la peine de montrer un
  // encart vide ou décevant à un tout nouveau visiteur.
  if (!entries || entries.length === 0) return null

  return (
    <div className="w-full rounded-2xl border border-night-600/70 bg-night-800/40 p-5 text-left backdrop-blur-sm sm:p-6">
      <h3 className="mb-4 text-center font-display text-lg text-moon-200">🏆 {t('landing.leaderboard.title')}</h3>
      <ol className="flex flex-col gap-2">
        {entries.map((entry, i) => (
          <li
            key={entry.user_id}
            className="flex items-center gap-3 rounded-xl border border-night-600/50 bg-night-900/40 px-3.5 py-2 text-sm"
          >
            <span className="w-5 shrink-0 text-center text-moon-200/40">{i + 1}</span>
            <span className="flex flex-1 min-w-0 items-center gap-1.5 truncate text-moon-200/90">
              {entry.username}
            </span>
            {entry.current_streak >= 2 && <span className="shrink-0 text-xs text-blood-400">🔥{entry.current_streak}</span>}
            <span className="shrink-0">{tierInfo(entry.tier).emoji}</span>
            <span className="w-10 shrink-0 text-right font-semibold text-moon-200">{entry.rank_points}</span>
          </li>
        ))}
      </ol>
    </div>
  )
}
