import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../lib/supabase'
import { roleLabel, ROLES, type RoleId } from '../lib/roles'
import { tierInfo, tierLabel, pointsToNextTier, previousTierOf, type RankTierInfo } from '../lib/ranks'
import { volumeTitleForGames, nextVolumeTitle } from '../lib/volumeTitles'
import { continentEmoji, continentName } from '../lib/continents'
import { Button, Card, ErrorText, Segmented } from '../components/ui'
import { FullScreenLoader } from '../components/FullScreenLoader'
import { AvatarIcon } from '../components/AvatarIcon'
import { RankTierBadge } from '../components/RankTierBadge'
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

interface MyRank {
  rank_points: number
  rank_tier: string
  current_streak: number
  best_streak: number
  continent: string | null
  global_position: number
  continent_position: number | null
}

interface MyStats {
  games_played: number
  games_won: number
  by_role: RoleStat[]
  recent_games: RecentGame[]
  rank: MyRank | null
}

interface LeaderboardEntry {
  user_id: string
  username: string
  avatar_icon: string
  rank_points: number
  tier: string
  current_streak: number
  best_streak: number
  rank_wins: number
  rank_games_played: number
}

export default function Stats() {
  const { user, profile } = useAuth()
  const navigate = useNavigate()
  const { t, lang } = useLanguage()
  const [tab, setTab] = useState<'moi' | 'classement'>('moi')
  const [scope, setScope] = useState<'global' | 'continent'>('global')
  const [stats, setStats] = useState<MyStats | null>(null)
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[] | null>(null)
  const [leaderboardLoading, setLeaderboardLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    supabase.rpc('get_my_stats').then(({ data, error: rpcError }) => {
      if (cancelled) return
      if (rpcError) {
        setError(rpcError.message)
      } else {
        setStats(data as MyStats)
      }
      setLoading(false)
    })
    return () => {
      cancelled = true
    }
  }, [])

  // Classement chargé séparément (public, indépendant de get_my_stats) et
  // rechargé à chaque bascule mondial/continent — le scope continent reste
  // désactivé si le joueur n'a pas encore choisi de continent (voir Mon
  // compte), et get_public_leaderboard renvoie de toute façon un tableau
  // vide tant qu'il n'y a pas au moins 3 joueurs éligibles sur ce continent.
  useEffect(() => {
    if (tab !== 'classement') return
    let cancelled = false
    setLeaderboardLoading(true)
    supabase
      .rpc('get_public_leaderboard', { p_scope: scope, p_continent: profile?.continent ?? null, p_limit: 20 })
      .then(({ data, error: rpcError }) => {
        if (cancelled) return
        if (!rpcError) setLeaderboard(data as LeaderboardEntry[])
        setLeaderboardLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [tab, scope, profile?.continent])

  if (loading) return <FullScreenLoader />

  const winRate = stats && stats.games_played > 0 ? Math.round((100 * stats.games_won) / stats.games_played) : 0
  const bestRole = stats?.by_role.slice().sort((a, b) => b.played - a.played)[0] ?? null
  const myRank = stats?.rank ?? null
  const nextTier = myRank ? pointsToNextTier(myRank.rank_points) : null
  const prevTier = myRank ? previousTierOf(myRank.rank_tier) : null

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
            {myRank && (
              <Card className="text-center">
                {/* Échelle précédent → actuel → suivant : jusqu'ici seul le
                    palier actuel était affiché (+ une barre de progression
                    sans le nom du palier précédent) — on montre maintenant
                    les deux voisins pour que chacun voie d'où il vient et
                    vers quoi il va, pas juste où il en est. */}
                <div className="flex items-center justify-center gap-2 sm:gap-4">
                  <TierNeighbor tier={prevTier} placeholder={t('stats.rank.firstTier')} />
                  <span className="text-moon-200/20">→</span>
                  <div className="flex flex-col items-center">
                    <RankTierBadge tier={tierInfo(myRank.rank_tier).id} size={56} />
                    <p className="mt-1 font-display text-xl text-moon-200">{tierLabel(myRank.rank_tier, t)}</p>
                  </div>
                  <span className="text-moon-200/20">→</span>
                  <TierNeighbor tier={nextTier?.next ?? null} placeholder={t('stats.rank.maxTier')} />
                </div>
                <p className="mt-2 text-sm text-moon-200/50">
                  {t('stats.rank.points', { points: myRank.rank_points })}
                </p>

                {nextTier && (
                  <div className="mx-auto mt-4 max-w-xs">
                    <div className="h-1.5 overflow-hidden rounded-full bg-night-900/70">
                      <div
                        className="h-full rounded-full bg-gradient-to-r from-blood-500 to-moon-400"
                        style={{
                          width: `${Math.min(
                            100,
                            Math.round(
                              (100 * (myRank.rank_points - tierInfo(myRank.rank_tier).minPoints)) /
                                (nextTier.next.minPoints - tierInfo(myRank.rank_tier).minPoints)
                            )
                          )}%`,
                        }}
                      />
                    </div>
                    <p className="mt-1.5 text-xs text-moon-200/40">
                      {t('stats.rank.nextTier', {
                        points: nextTier.remaining,
                        tier: tierLabel(nextTier.next.id, t),
                      })}
                    </p>
                  </div>
                )}

                <div className="mt-4 flex items-center justify-center gap-4 text-xs text-moon-200/50">
                  {myRank.current_streak >= 2 && (
                    <span className="text-blood-400">🔥 {t('stats.rank.streak', { count: myRank.current_streak })}</span>
                  )}
                  <span>{t('stats.rank.globalPosition', { position: myRank.global_position })}</span>
                  {myRank.continent && myRank.continent_position && (
                    <span>
                      {continentEmoji(myRank.continent)} {t('stats.rank.continentPosition', { position: myRank.continent_position })}
                    </span>
                  )}
                </div>
              </Card>
            )}

            <div className="grid grid-cols-3 gap-3">
              <StatBox label={t('stats.gamesPlayed')} value={stats.games_played} />
              <StatBox label={t('stats.gamesWon')} value={stats.games_won} />
              <StatBox label={t('stats.winRate')} value={`${winRate}%`} />
            </div>

            <VolumeTitleCard gamesPlayed={stats.games_played} />

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

            <div className="mb-4">
              <Segmented
                tabs={[
                  { id: 'global', label: t('stats.leaderboard.global') },
                  {
                    id: 'continent',
                    label: profile?.continent
                      ? `${continentEmoji(profile.continent)} ${continentName(profile.continent, lang) ?? t('stats.leaderboard.continent')}`
                      : t('stats.leaderboard.continent'),
                  },
                ]}
                active={scope}
                onChange={setScope}
              />
              {scope === 'continent' && !profile?.continent && (
                <p className="mt-2 text-xs text-moon-200/40">{t('stats.leaderboard.noContinent')}</p>
              )}
            </div>

            {leaderboardLoading ? (
              <p className="text-sm text-moon-200/50">{t('common.loading')}</p>
            ) : !leaderboard || leaderboard.length === 0 ? (
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
                      <AvatarIcon icon={entry.avatar_icon} className="h-4 w-4 shrink-0" />
                      {entry.username}
                    </span>
                    {entry.current_streak >= 2 && <span className="shrink-0 text-xs text-blood-400">🔥{entry.current_streak}</span>}
                    <RankTierBadge tier={tierInfo(entry.tier).id} size={22} />
                    <span className="w-12 shrink-0 text-right font-semibold text-moon-200">{entry.rank_points}</span>
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

/** Un des deux paliers voisins du palier actuel (précédent ou suivant),
 * volontairement en retrait (plus petit, atténué) pour que le palier actuel
 * au centre reste le point focal — voir la carte de rang de Stats(). Affiche
 * un placeholder (ex. "Début"/"Max") plutôt que rien quand ce voisin
 * n'existe pas (déjà au palier le plus bas ou le plus haut). */
function TierNeighbor({ tier, placeholder }: { tier: RankTierInfo | null; placeholder: string }) {
  const { t } = useLanguage()
  return (
    <div className="flex w-12 shrink-0 flex-col items-center gap-0.5 opacity-40 sm:w-16">
      {tier ? <RankTierBadge tier={tier.id} size={22} /> : <span className="text-lg">—</span>}
      <span className="truncate text-[9px] uppercase tracking-wide text-moon-200/70">
        {tier ? tierLabel(tier.id, t) : placeholder}
      </span>
    </div>
  )
}

/** Titre d'assiduité (voir lib/volumeTitles.ts, migration 0074) : lié au
 * nombre de parties JOUÉES, séparé du palier de rang — un joueur assidu qui
 * ne gagne pas forcément débloque quand même quelque chose. Toujours
 * calculable côté client depuis stats.games_played (déjà chargé), pas
 * besoin d'un champ serveur dédié. */
function VolumeTitleCard({ gamesPlayed }: { gamesPlayed: number }) {
  const { t } = useLanguage()
  const title = volumeTitleForGames(gamesPlayed)
  const next = nextVolumeTitle(gamesPlayed)

  return (
    <Card className="flex items-center justify-between gap-3">
      <div>
        <p className="text-[11px] uppercase tracking-wider text-moon-200/50">{t('stats.volume.label')}</p>
        <p className="font-display text-lg text-moon-200">🎖️ {t(title.nameKey)}</p>
      </div>
      <p className="max-w-[45%] text-right text-xs text-moon-200/40">
        {next
          ? t('stats.volume.nextTitle', { count: next.remaining, s: next.remaining > 1 ? 's' : '', title: t(next.next.nameKey) })
          : t('stats.volume.maxTitle')}
      </p>
    </Card>
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
