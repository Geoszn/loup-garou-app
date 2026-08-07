import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../lib/supabase'
import { tierInfo } from '../lib/ranks'
import { countryFlag } from '../lib/countries'
import { AvatarIcon } from './AvatarIcon'
import { Card } from './ui'
import { useLanguage } from '../i18n/LanguageContext'

interface Entry {
  user_id: string
  username: string
  avatar_icon: string
  country: string | null
  rank_points: number
  current_streak: number
}

/** Aperçu du classement mondial affiché EN PERMANENCE sur le tableau de
 * bord (contrairement à LeaderboardWidget sur la page d'accueil publique,
 * qui se masque tant que personne n'est classé) — l'objectif ici n'est pas
 * de faire vitrine mais de rappeler à chaque connexion qu'un classement
 * existe et où on se situe dedans, y compris avec un état de départ
 * encourageant pour un tout nouveau joueur qui n'a encore rien gagné.
 * Toujours accompagné d'une ligne "Toi" séparée quand on n'est pas déjà
 * visible dans le top affiché, pour qu'on voie sa propre position même
 * loin derrière — c'est ce qui donne envie de grimper. */
export function DashboardLeaderboard() {
  const { user, profile } = useAuth()
  const { t } = useLanguage()
  const [entries, setEntries] = useState<Entry[] | null>(null)
  const [myPosition, setMyPosition] = useState<number | null>(null)

  useEffect(() => {
    let cancelled = false
    supabase
      .rpc('get_public_leaderboard', { p_scope: 'global', p_country: null, p_limit: 8 })
      .then(({ data, error }) => {
        if (!cancelled && !error) setEntries(data as Entry[])
      })
    supabase.rpc('get_my_stats').then(({ data, error }) => {
      if (!cancelled && !error) setMyPosition((data as { rank?: { global_position?: number } })?.rank?.global_position ?? null)
    })
    return () => {
      cancelled = true
    }
  }, [])

  const hasEntries = !!entries && entries.length > 0
  const iAmInTop = !!entries?.some((e) => e.user_id === user?.id)
  // La ligne "Toi" ne s'affiche que s'il existe un VRAI classement à côté
  // duquel se situer — sinon "personne n'est classé" + "#1 Toi (0 points)"
  // se contredisent l'un l'autre au premier coup d'œil.
  const showMyRow = hasEntries && profile && !iAmInTop

  return (
    <Card className="!p-0 overflow-hidden">
      <div className="flex items-center justify-between gap-3 border-b border-night-700/60 px-5 py-3.5">
        <h2 className="min-w-0 truncate font-display text-base text-moon-200 sm:text-lg">
          🏆 {t('dashboard.leaderboard.title')}
        </h2>
        <Link to="/stats" className="shrink-0 text-xs text-moon-200/50 underline underline-offset-4 transition-colors hover:text-moon-200">
          {t('dashboard.leaderboard.seeAll')}
        </Link>
      </div>

      <div className="flex flex-col gap-1.5 p-3 sm:p-4">
        {entries === null ? (
          // Squelette de chargement : évite un flash de contenu vide puis
          // plein, surtout perceptible sur mobile avec une connexion lente.
          <div className="flex flex-col gap-1.5">
            {[0, 1, 2].map((i) => (
              <div key={i} className="h-11 animate-pulse rounded-xl bg-night-900/40" />
            ))}
          </div>
        ) : entries.length === 0 ? (
          <div className="flex flex-col items-center gap-2 px-4 py-8 text-center">
            <span className="text-3xl opacity-50">🌱</span>
            <p className="max-w-xs text-sm text-moon-200/50">{t('dashboard.leaderboard.empty')}</p>
          </div>
        ) : (
          <ol className="flex flex-col gap-1.5">
            {entries.map((entry, i) => (
              <LeaderboardRow key={entry.user_id} entry={entry} position={i + 1} mine={entry.user_id === user?.id} />
            ))}
          </ol>
        )}

        {showMyRow && (
          <>
            <div className="my-0.5 flex items-center gap-2 px-1 text-[10px] uppercase tracking-wider text-moon-200/30">
              <span className="h-px flex-1 bg-night-700/60" />
              {t('dashboard.leaderboard.you')}
              <span className="h-px flex-1 bg-night-700/60" />
            </div>
            <LeaderboardRow
              entry={{
                user_id: user?.id ?? '',
                username: profile.username,
                avatar_icon: profile.avatar_icon,
                country: profile.country,
                rank_points: profile.rank_points,
                current_streak: profile.current_streak,
              }}
              position={myPosition}
              mine
            />
          </>
        )}
      </div>
    </Card>
  )
}

function LeaderboardRow({ entry, position, mine }: { entry: Entry; position: number | null; mine: boolean }) {
  const { t } = useLanguage()
  const tier = tierInfo(pointsToTier(entry.rank_points))
  return (
    <li
      className={`flex items-center gap-3 rounded-xl border px-3.5 py-2 text-sm ${
        mine ? 'border-blood-500 bg-gradient-to-b from-blood-700/20 to-blood-700/5' : 'border-night-600/60 bg-night-900/40'
      }`}
    >
      <span className="w-6 shrink-0 text-center text-xs text-moon-200/40">{position ? `#${position}` : '—'}</span>
      <span className="flex flex-1 min-w-0 items-center gap-1.5 truncate text-moon-200/90">
        <AvatarIcon icon={entry.avatar_icon} className="h-4 w-4 shrink-0" />
        {entry.country && <span className="shrink-0">{countryFlag(entry.country)}</span>}
        <span className="truncate">{mine ? t('dashboard.leaderboard.youLabel', { username: entry.username }) : entry.username}</span>
      </span>
      {entry.current_streak >= 2 && <span className="shrink-0 text-xs text-blood-400">🔥{entry.current_streak}</span>}
      <span className="shrink-0 text-base">{tier.emoji}</span>
      <span className="w-10 shrink-0 text-right font-semibold text-moon-200">{entry.rank_points}</span>
    </li>
  )
}

function pointsToTier(points: number): string {
  if (points >= 1500) return 'legende'
  if (points >= 900) return 'sage'
  if (points >= 500) return 'ancien'
  if (points >= 250) return 'chasseur'
  if (points >= 100) return 'villageois'
  return 'nouveau_venu'
}
