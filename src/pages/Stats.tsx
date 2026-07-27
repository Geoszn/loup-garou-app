import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../lib/supabase'
import { roleLabel, ROLES, type RoleId } from '../lib/roles'
import { Button, Card, ErrorText, Segmented } from '../components/ui'
import { FullScreenLoader } from '../components/FullScreenLoader'
import { AvatarIcon } from '../components/AvatarIcon'
import { useLanguage } from '../i18n/LanguageContext'

interface RoleStat {
  role: RoleId
  played: number
  won: number
}

interface RecentGame {
  game_id: string
  code: string
  winner_team: 'village' | 'loups' | 'amoureux'
  role: RoleId | null
  won: boolean
  created_at: string
}

interface MyStats {
  games_played: number
  games_won: number
  by_role: RoleStat[]
  recent_games: RecentGame[]
}

interface LeaderboardEntry {
  user_id: string
  username: string
  avatar_icon: string
  games_played: number
  games_won: number
  win_rate: number
}

export default function Stats() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const { t, lang } = useLanguage()
  const [tab, setTab] = useState<'moi' | 'classement'>('moi')
  const [stats, setStats] = useState<MyStats | null>(null)
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    Promise.all([supabase.rpc('get_my_stats'), supabase.rpc('get_leaderboard', { p_limit: 20 })]).then(
      ([statsRes, boardRes]) => {
        if (cancelled) return
        if (statsRes.error) {
          setError(statsRes.error.message)
        } else {
          setStats(statsRes.data as MyStats)
        }
        if (!boardRes.error) {
          setLeaderboard(boardRes.data as LeaderboardEntry[])
        }
        setLoading(false)
      }
    )
    return () => {
      cancelled = true
    }
  }, [])

  if (loading) return <FullScreenLoader />

  const winRate = stats && stats.games_played > 0 ? Math.round((100 * stats.games_won) / stats.games_played) : 0
  const bestRole = stats?.by_role.slice().sort((a, b) => b.played - a.played)[0] ?? null

  return (
    <div className="min-h-screen px-4 py-10">
      <div className="mx-auto flex max-w-2xl flex-col gap-6">
        <header className="flex items-center gap-3">
          <Button variant="ghost" onClick={() => navigate('/dashboard')} className="px-3.5 py-2 text-xs">
            {t('common.back')}
          </Button>
          <h1 className="font-display text-2xl text-moon-200">{t('stats.title')}</h1>
        </header>

        <ErrorText>{error}</ErrorText>

        <Segmented
          tabs={[
            { id: 'moi', label: t('stats.tab.mine') },
            { id: 'classement', label: t('stats.tab.leaderboard') },
          ]}
          active={tab}
          onChange={setTab}
        />

        {tab === 'moi' && stats && (
          <>
            <div className="grid grid-cols-3 gap-3">
              <StatBox label={t('stats.gamesPlayed')} value={stats.games_played} />
              <StatBox label={t('stats.gamesWon')} value={stats.games_won} />
              <StatBox label={t('stats.winRate')} value={`${winRate}%`} />
            </div>

            <Card>
              <h2 className="mb-1 font-display text-lg text-moon-200">{t('stats.byRole.title')}</h2>
              {bestRole && (
                <p className="mb-4 text-sm text-moon-200/50">
                  {t('stats.byRole.mostPlayed', { emoji: ROLES[bestRole.role]?.emoji ?? '', role: roleLabel(bestRole.role, t) })}
                </p>
              )}
              {stats.by_role.length === 0 ? (
                <p className="text-sm text-moon-200/50">{t('stats.byRole.empty')}</p>
              ) : (
                <ul className="flex flex-col gap-2">
                  {stats.by_role.map((r) => (
                    <li
                      key={r.role}
                      className="flex items-center justify-between rounded-xl border border-night-600/60 bg-night-900/40 px-4 py-2.5 text-sm"
                    >
                      <span className="text-moon-200/90">
                        {ROLES[r.role]?.emoji ?? ''} {roleLabel(r.role, t)}
                      </span>
                      <span className="text-moon-200/60">
                        {t('stats.byRole.winsFraction', {
                          won: r.won,
                          played: r.played,
                          s: r.won > 1 ? 's' : '',
                          pct: r.played > 0 ? Math.round((100 * r.won) / r.played) : 0,
                        })}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </Card>

            <Card>
              <h2 className="mb-4 font-display text-lg text-moon-200">{t('stats.recent.title')}</h2>
              {stats.recent_games.length === 0 ? (
                <p className="text-sm text-moon-200/50">{t('stats.recent.empty')}</p>
              ) : (
                <ul className="flex flex-col gap-2">
                  {stats.recent_games.map((g) => (
                    <li
                      key={g.game_id}
                      className="flex items-center justify-between rounded-xl border border-night-600/60 bg-night-900/40 px-4 py-2.5 text-sm"
                    >
                      <div className="flex flex-col">
                        <span className="text-moon-200/90">
                          {g.code} · {ROLES[g.role as RoleId]?.emoji ?? '❔'} {roleLabel(g.role, t)}
                        </span>
                        <span className="text-xs text-moon-200/40">
                          {new Date(g.created_at).toLocaleDateString(lang === 'fr' ? 'fr-FR' : 'en-US')}
                        </span>
                      </div>
                      <span className={g.won ? 'font-semibold text-emerald-400' : 'font-semibold text-blood-400'}>
                        {g.won ? t('stats.recent.win') : t('stats.recent.loss')}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          </>
        )}

        {tab === 'classement' && (
          <Card>
            <h2 className="mb-1 font-display text-lg text-moon-200">{t('stats.leaderboard.title')}</h2>
            <p className="mb-4 text-sm text-moon-200/50">{t('stats.leaderboard.subtitle')}</p>
            {!leaderboard || leaderboard.length === 0 ? (
              <p className="text-sm text-moon-200/50">{t('stats.leaderboard.empty')}</p>
            ) : (
              <ol className="flex flex-col gap-2">
                {leaderboard.map((entry, i) => (
                  <li
                    key={entry.user_id}
                    className={`flex items-center gap-3 rounded-xl border px-4 py-2.5 text-sm ${
                      entry.user_id === user?.id
                        ? 'border-blood-500 bg-gradient-to-b from-blood-700/20 to-blood-700/5'
                        : 'border-night-600/60 bg-night-900/40'
                    }`}
                  >
                    <span className="w-5 shrink-0 text-center text-moon-200/40">{i + 1}</span>
                    <span className="flex flex-1 min-w-0 items-center gap-1.5 truncate text-moon-200/90">
                      <AvatarIcon icon={entry.avatar_icon} className="h-4 w-4 shrink-0" /> {entry.username}
                    </span>
                    <span className="shrink-0 text-moon-200/60">
                      {entry.games_won}/{entry.games_played}
                    </span>
                    <span className="w-12 shrink-0 text-right font-semibold text-moon-200">{entry.win_rate}%</span>
                  </li>
                ))}
              </ol>
            )}
          </Card>
        )}
      </div>
    </div>
  )
}

function StatBox({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-2xl border border-night-600/70 bg-gradient-to-b from-night-700/60 to-night-900/70 p-4 text-center shadow-card">
      <p className="font-display text-2xl text-moon-200">{value}</p>
      <p className="mt-1 text-[11px] uppercase tracking-wider text-moon-200/50">{label}</p>
    </div>
  )
}
