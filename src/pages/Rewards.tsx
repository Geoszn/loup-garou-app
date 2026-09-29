import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../lib/supabase'
import { useLanguage } from '../i18n/LanguageContext'
import { Avatar } from '../components/Avatar'
import { Button, ErrorText } from '../components/ui'
import { LoupCoinIcon } from '../components/LoupCoinIcon'
import { PAGE_SIZE, Pager } from '../components/CollapsibleCard'
import { ArtifactsPanel, SkinsPanel } from '../components/StorePanels'
import { MyArtifactRow, REASON_LABELS, type LoupCoinsSummary, type MyArtifact } from './LoupStore'
import { useMyQuests } from '../hooks/useMyQuests'
import { DEFAULT_AVATAR_CONFIG } from '../lib/avatarParts'
import { useMyAvatarConfig, notifyAvatarChanged } from '../components/AvatarEditor'
import type { StoreSkin } from '../lib/skins'
import { useMySeason } from '../hooks/useMySeason'
import { SeasonTrack } from '../components/SeasonTrack'

const STREAK_REWARD_COINS = 50 // à garder identique à claim_daily_login (migration 0196)

type Tab = 'quests' | 'store' | 'season' | 'mine' | 'history'

const box = 'rounded-2xl border border-night-600/70 bg-gradient-to-b from-night-700/70 to-night-900/85 shadow-card'

/** Millisecondes avant le prochain changement de journée de quêtes (06h00 UTC,
 * voir quest_today, migration 0187). */
function msUntilNextQuestDay(now = Date.now()): number {
  const d = new Date(now)
  let next = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), 6)
  if (next <= now) next += 24 * 60 * 60 * 1000
  return next - now
}

/** HH:MM:SS, secondes visibles — volontairement précis à la seconde (voir
 * CountdownClock ci-dessous) pour que le compte à rebours se voie défiler et
 * crée un vrai sentiment d'urgence, plutôt que le simple "3 h 24 min" d'avant
 * qui ne changeait qu'une fois par minute. */
function formatCountdown(ms: number): string {
  const total = Math.max(Math.floor(ms / 1000), 0)
  const h = Math.floor(total / 3600)
  const m = Math.floor((total % 3600) / 60)
  const s = total % 60
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${pad(h)}:${pad(m)}:${pad(s)}`
}

/** Compte à rebours mis en avant : gros chiffres tabulaires (les secondes
 * défilent visiblement), fond rouge/ambre pulsant quand il reste moins d'une
 * heure — pour créer l'urgence de revenir avant la remise à zéro des quêtes
 * du jour, plutôt qu'une petite mention discrète dans l'en-tête. */
function CountdownClock({ ms }: { ms: number }) {
  const { t } = useLanguage()
  const urgent = ms < 60 * 60 * 1000
  return (
    <div
      className={`flex items-center justify-between gap-3 rounded-xl border px-3.5 py-2.5 ${
        urgent ? 'border-blood-500/50 bg-blood-600/15 animate-pulse' : 'border-amber-400/40 bg-amber-400/10'
      }`}
    >
      <span className={`text-xs font-semibold ${urgent ? 'text-blood-300' : 'text-amber-300'}`}>
        ⏰ {t('rewards.streak.timerLabel')}
      </span>
      <span className={`font-display text-xl font-bold tabular-nums tracking-wide ${urgent ? 'text-blood-300' : 'text-amber-300'}`}>
        {formatCountdown(ms)}
      </span>
    </div>
  )
}

function SoonBadge() {
  const { t } = useLanguage()
  return (
    <span className="rounded-full border border-moon-400/40 bg-moon-400/10 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-moon-300">
      {t('hub.soonFull')}
    </span>
  )
}

function Section({ title, right, children }: { title: string; right?: ReactNode; children: ReactNode }) {
  return (
    <div className={`${box} flex flex-col gap-3 p-4`}>
      <p className="flex items-center justify-between gap-2 font-display text-base text-moon-200">
        {title}
        {right}
      </p>
      {children}
    </div>
  )
}

/** Page « Récompenses » : solde, quêtes, Store (artefacts et skins), Saison,
 * mes objets et historique des Loup Coins. */
export default function Rewards() {
  const { profile, refreshProfile } = useAuth()
  const { t, lang } = useLanguage()
  const [tab, setTab] = useState<Tab>('quests')
  const [summary, setSummary] = useState<LoupCoinsSummary | null>(null)
  const [myArtifacts, setMyArtifacts] = useState<MyArtifact[] | null>(null)
  const [ownedSkins, setOwnedSkins] = useState<StoreSkin[] | null>(null)
  const [resetIn, setResetIn] = useState(() => msUntilNextQuestDay())
  // Tick à la seconde (au lieu de 30s) : c'est tout le sens de CountdownClock,
  // voir son commentaire — sans ça les secondes affichées ne bougeraient pas.
  const [error, setError] = useState<string | null>(null)
  const [questScope, setQuestScope] = useState<'day' | 'season'>('day')
  const [historyPage, setHistoryPage] = useState(0)
  const [canScrollRight, setCanScrollRight] = useState(false)
  const navRef = useRef<HTMLElement>(null)
  const [storeTab, setStoreTab] = useState<'artifacts' | 'skins'>('artifacts')
  const { quests, claiming, claim } = useMyQuests()
  const myAvatar = useMyAvatarConfig()
  const { season, refresh: refreshSeason } = useMySeason()

  const loadAll = useCallback(async () => {
    const [coins, mine, skins] = await Promise.all([
      supabase.rpc('get_my_loup_coins'),
      supabase.rpc('get_my_artifacts'),
      supabase.rpc('list_store_skins'),
    ])
    if (!coins.error) setSummary(coins.data as LoupCoinsSummary)
    if (!mine.error) setMyArtifacts(mine.data as MyArtifact[])
    setOwnedSkins(skins.error ? [] : (skins.data as StoreSkin[]).filter((s) => s.owned))
  }, [])

  useEffect(() => {
    void loadAll()
  }, [loadAll])

  useEffect(() => {
    const id = setInterval(() => setResetIn(msUntilNextQuestDay()), 1000)
    return () => clearInterval(id)
  }, [])

  const balance = profile?.loup_coins ?? summary?.balance ?? 0
  const refresh = () => {
    void refreshProfile()
    void loadAll()
  }

  async function equip(skin: StoreSkin) {
    const { error: rpcError } = await supabase.rpc('equip_skin', { p_skin_id: skin.id })
    if (rpcError) {
      setError(rpcError.message)
      return
    }
    setError(null)
    notifyAvatarChanged()
  }

  const tabs: { id: Tab; icon: string; label: string; soon?: boolean }[] = [
    { id: 'quests', icon: '📜', label: t('hub.menu.quests') },
    { id: 'store', icon: '🛒', label: t('hub.menu.store') },
    { id: 'season', icon: '🏆', label: t('hub.menu.season') },
    { id: 'mine', icon: '🎒', label: t('rewards.tab.mine') },
    { id: 'history', icon: '🧾', label: t('rewards.tab.history') },
  ]

  const streak = profile?.login_streak ?? 0
  // Trois derniers jours (aujourd'hui compris) puis les trois suivants : un
  // rappel de revenir demain. Les jours passés sont déduits de la série (jours
  // consécutifs se terminant aujourd'hui) ; 🎁 = jour où la série atteint un
  // multiple de 7.
  const streakDays = [-2, -1, 0, 1, 2, 3].map((d) => {
    const date = new Date(Date.now() + d * 86400000)
    return {
      d,
      label: d === 0 ? t('rewards.streak.today') : date.toLocaleDateString(lang === 'en' ? 'en-US' : 'fr-FR', { weekday: 'short' }),
      done: d <= 0 && -d < streak,
      gift: d > 0 && (streak + d) % 7 === 0,
    }
  })
  const daysToReward = 7 - (streak % 7)

  const allQuests = quests ?? []
  const dayQuests = quests === null ? null : allQuests.filter((q) => q.scope !== 'season')
  const seasonQuests = allQuests.filter((q) => q.scope === 'season')
  const hasSeasonQuests = seasonQuests.length > 0
  const shownQuests = questScope === 'season' && hasSeasonQuests ? seasonQuests : dayQuests

  const updateScrollHint = useCallback(() => {
    const el = navRef.current
    if (el) setCanScrollRight(el.scrollLeft + el.clientWidth < el.scrollWidth - 6)
  }, [])
  useEffect(() => {
    updateScrollHint()
    window.addEventListener('resize', updateScrollHint)
    return () => window.removeEventListener('resize', updateScrollHint)
  }, [updateScrollHint])

  const txs = summary?.transactions ?? []
  const historyPageCount = Math.max(1, Math.ceil(txs.length / PAGE_SIZE))

  return (
    <div className="min-h-screen px-4 pt-8">
      <div className="mx-auto flex max-w-3xl flex-col gap-4">
        <header>
          <h1 className="font-display text-2xl text-moon-200">{t('hub.title')}</h1>
          <p className="mt-0.5 text-sm text-moon-200/60">{t('rewards.subtitle')}</p>
        </header>

        <div className={`${box} flex items-center justify-between gap-3 p-4`}>
          <div>
            <p className="text-[11px] uppercase tracking-wider text-moon-200/50">{t('loupStore.balance')}</p>
            <p className="flex items-center gap-2 font-display text-3xl text-amber-300">
              <LoupCoinIcon className="h-8 w-8" /> {balance}
            </p>
          </div>
          {summary && (
            <div className="text-right text-xs text-moon-200/60">
              <p>
                {t('loupStore.totalEarned')} : <b className="text-moon-200">{summary.total_earned}</b>
              </p>
              <p>
                {t('loupStore.totalSpent')} : <b className="text-moon-200">{summary.total_spent}</b>
              </p>
            </div>
          )}
        </div>

        <div className="relative">
        <nav ref={navRef} onScroll={updateScrollHint} className="-mx-4 flex gap-1.5 overflow-x-auto px-4 pb-1 pr-10 [scrollbar-width:none]">
          {tabs.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => setTab(item.id)}
              className={`flex shrink-0 items-center gap-1.5 rounded-full border px-3.5 py-2 text-xs font-semibold transition-colors ${
                tab === item.id ? 'border-blood-500 bg-blood-600 text-[#fdf6e3]' : 'border-night-600/60 bg-night-900/40 text-moon-200/60 hover:text-moon-200'
              }`}
            >
              <span aria-hidden="true">{item.icon}</span>
              {item.label}
              {item.soon && (
                <span className="rounded-full border border-moon-400/40 bg-moon-400/10 px-1.5 text-[8px] uppercase tracking-wider text-moon-300">{t('hub.soon')}</span>
              )}
            </button>
          ))}
        </nav>
          {canScrollRight && (
            <button
              type="button"
              aria-label={t('rewards.tabs.more')}
              onClick={() => navRef.current?.scrollBy({ left: 160, behavior: 'smooth' })}
              className="absolute -right-4 top-0 flex h-[calc(100%-4px)] w-12 items-center justify-end bg-gradient-to-l from-night-950 via-night-950/85 to-transparent pr-3 text-moon-300"
            >
              <span className="animate-pulse text-lg leading-none" aria-hidden="true">›</span>
            </button>
          )}
        </div>

        <ErrorText>{error}</ErrorText>

        {tab === 'quests' && (
          <>
            {hasSeasonQuests && (
              <div className="flex gap-1 rounded-xl border border-night-600/60 bg-night-900/40 p-1">
                {(['day', 'season'] as const).map((sc) => (
                  <button
                    key={sc}
                    type="button"
                    onClick={() => setQuestScope(sc)}
                    className={`flex-1 rounded-lg py-2 text-xs font-semibold transition-colors ${questScope === sc ? 'bg-blood-600 text-[#fdf6e3]' : 'text-moon-200/60'}`}
                  >
                    {sc === 'day' ? t('rewards.quests.day') : t('rewards.quests.season')}
                  </button>
                ))}
              </div>
            )}

            {!hasSeasonQuests && (
              <div className="flex flex-col items-center gap-2 rounded-2xl border border-dashed border-moon-400/30 bg-moon-400/[0.04] p-4 text-center">
              <p className="font-display text-base text-moon-200">{t('hub.quests.seasonTitle')}</p>
              <p className="text-xs text-moon-200/60">{t('hub.quests.seasonBody')}</p>
              <SoonBadge />
            </div>
            )}

            {questScope === 'day' || !hasSeasonQuests ? (
              <>
            <Section title={t('rewards.streak.title')} right={<span className="text-xs font-normal text-moon-300">{streak} {t('dailyStreak.days')} 🔥</span>}>
              <div className="grid grid-cols-6 gap-1.5">
                {streakDays.map((day) => (
                  <div
                    key={day.d}
                    className={`flex flex-col items-center gap-1 rounded-lg border py-2 text-[10px] capitalize ${
                      day.done
                        ? 'border-amber-400/40 bg-amber-400/10 text-amber-300'
                        : day.gift
                          ? 'border-moon-400/40 bg-moon-400/[0.06] text-moon-300'
                          : 'border-night-600/60 bg-night-900/40 text-moon-200/40'
                    } ${day.d === 0 ? 'ring-1 ring-moon-400/60' : ''}`}
                  >
                    {day.label}
                    <span className="text-sm">{day.done ? '✓' : day.gift ? '🎁' : '·'}</span>
                  </div>
                ))}
              </div>
              <p className="text-center text-xs text-moon-200/60">
                {t('rewards.streak.next', { days: daysToReward, coins: STREAK_REWARD_COINS })}
              </p>
              <p className="text-center text-[11px] text-moon-200/40">{t('rewards.streak.rule', { coins: STREAK_REWARD_COINS })}</p>
            </Section>

              </>
            ) : null}

            <Section title={questScope === 'season' && hasSeasonQuests ? t('hub.quests.seasonTitle') : t('hub.quests.daily')}>
              {questScope !== 'season' && <CountdownClock ms={resetIn} />}
              {shownQuests === null ? (
                <div className="h-24 animate-pulse rounded-xl bg-night-900/40" />
              ) : (
                <ul className="flex flex-col gap-3">
                  {shownQuests.map((q) => {
                    const done = q.progress >= q.target
                    const claimed = !!q.claimed_at
                    const segments = q.target > 0 && q.target <= 12 ? q.target : null
                    return (
                      <li
                        key={q.template_id}
                        className={`flex flex-col gap-2 rounded-xl border p-3 ${
                          claimed ? 'border-night-700/40 bg-night-800/20 opacity-60' : done ? 'border-amber-400/40 bg-amber-400/[0.06]' : 'border-night-700/50 bg-night-800/30'
                        }`}
                      >
                        <div className="flex items-center gap-2">
                          <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-amber-400/15 px-2 py-0.5 text-xs font-semibold tabular-nums text-amber-300">
                            <LoupCoinIcon className="h-3 w-3" /> +{q.reward_coins}
                          </span>
                          <span className={`min-w-0 flex-1 text-sm ${claimed ? 'line-through' : 'text-moon-200/90'}`}>{lang === 'en' ? q.label_en : q.label_fr}</span>
                          {claimed && <span className="text-emerald-400">✓</span>}
                        </div>
                        {!claimed && !done && (
                          <div className="flex items-center gap-2.5">
                            {segments ? (
                              <div className="flex flex-1 gap-1">
                                {Array.from({ length: segments }).map((_, i) => (
                                  <div key={i} className={`h-2 flex-1 rounded-full ${i < q.progress ? 'bg-moon-300' : 'bg-night-700'}`} />
                                ))}
                              </div>
                            ) : (
                              <div className="h-2 flex-1 overflow-hidden rounded-full bg-night-800">
                                <div className="h-full rounded-full bg-moon-300" style={{ width: `${Math.min(100, (q.progress / q.target) * 100)}%` }} />
                              </div>
                            )}
                            <span className="shrink-0 text-xs tabular-nums text-moon-200/50">
                              {q.progress}/{q.target}
                            </span>
                          </div>
                        )}
                        {done && !claimed && (
                          <Button className="w-full py-2 text-sm" disabled={claiming === q.template_id} onClick={() => claim(q.template_id)}>
                            {claiming === q.template_id ? t('common.sending') : t('quest.claim', { coins: q.reward_coins })}
                          </Button>
                        )}
                      </li>
                    )
                  })}
                </ul>
              )}
            </Section>

          </>
        )}

        {tab === 'store' && (
          <Section title={t('hub.menu.store')}>
            <div className="flex gap-1 rounded-xl border border-night-600/60 bg-night-900/40 p-1">
              {(['artifacts', 'skins'] as const).map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => setStoreTab(s)}
                  className={`flex-1 rounded-lg py-2 text-xs font-semibold transition-colors ${storeTab === s ? 'bg-blood-600 text-[#fdf6e3]' : 'text-moon-200/60'}`}
                >
                  {s === 'artifacts' ? t('hub.store.artifacts') : t('hub.store.skins')}
                </button>
              ))}
            </div>
            {storeTab === 'artifacts' ? <ArtifactsPanel balance={balance} onPurchased={refresh} /> : <SkinsPanel balance={balance} onPurchased={refresh} />}
          </Section>
        )}

        {tab === 'season' && (
          season ? (
            <SeasonTrack season={season} onClaimed={refreshSeason} />
          ) : (
            <div className="flex flex-col items-center gap-3 rounded-2xl border border-dashed border-moon-400/30 bg-moon-400/[0.04] px-4 py-8 text-center">
              <span className="text-6xl drop-shadow-[0_0_14px_rgba(224,168,74,0.5)]" aria-hidden="true">🏆</span>
              <p className="font-display text-2xl text-moon-200">{t('hub.season.noneTitle')}</p>
              <p className="text-sm leading-relaxed text-moon-200/70">{t('hub.season.noneBody')}</p>
            </div>
          )
        )}

        {tab === 'mine' && (
          <>
            <Section title={t('loupStore.myArtifacts.title')}>
              {!myArtifacts || myArtifacts.length === 0 ? (
                <p className="text-sm text-moon-200/50">{t('loupStore.myArtifacts.empty')}</p>
              ) : (
                <ul className="flex flex-col gap-2">
                  {myArtifacts.map((a) => (
                    <MyArtifactRow key={a.id} artifact={a} />
                  ))}
                </ul>
              )}
            </Section>
            <Section title={t('rewards.mySkins')}>
              {!ownedSkins || ownedSkins.length === 0 ? (
                <p className="text-sm text-moon-200/50">{t('rewards.noSkins')}</p>
              ) : (
                <div className="grid grid-cols-3 gap-2">
                  {ownedSkins.map((s) => (
                    <div key={s.id} className="flex flex-col items-center gap-1 rounded-xl border-2 border-night-600/60 bg-night-900/40 p-2 text-center">
                      <Avatar config={{ ...(myAvatar.config ?? DEFAULT_AVATAR_CONFIG), ...s.config }} className="h-14 w-14" />
                      <span className="line-clamp-1 w-full text-[11px] font-semibold text-moon-200">{lang === 'en' ? s.name_en : s.name_fr}</span>
                      <button type="button" onClick={() => equip(s)} className="text-[10px] font-semibold text-moon-300 underline underline-offset-2">
                        {t('hub.skins.equip')}
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </Section>
          </>
        )}

        {tab === 'history' && (
          <Section title={t('loupStore.history.title')}>
            {txs.length === 0 ? (
              <p className="text-sm text-moon-200/50">{t('loupStore.history.empty')}</p>
            ) : (
              <>
              <ul className="flex flex-col gap-2">
                {txs.slice(historyPage * PAGE_SIZE, (historyPage + 1) * PAGE_SIZE).map((tx) => (
                  <li key={tx.id} className="flex items-center justify-between gap-3 rounded-xl border border-night-600/60 bg-night-900/40 px-4 py-2.5 text-sm">
                    <div className="flex min-w-0 flex-col">
                      <span className="truncate text-moon-200/90">{tx.label || t(REASON_LABELS[tx.reason] ?? 'loupStore.transaction.fallbackLabel')}</span>
                      <span className="text-xs text-moon-200/40">
                        {new Date(tx.created_at).toLocaleString(lang === 'fr' ? 'fr-FR' : 'en-US', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
                      </span>
                    </div>
                    <span className={`flex shrink-0 items-center gap-1 font-display font-semibold ${tx.amount >= 0 ? 'text-emerald-400' : 'text-blood-400'}`}>
                      {tx.amount >= 0 ? '+' : ''}
                      {tx.amount} <LoupCoinIcon className="h-3.5 w-3.5" />
                    </span>
                  </li>
                ))}
              </ul>
              <Pager page={historyPage} pageCount={historyPageCount} onChange={setHistoryPage} />
              </>
            )}
          </Section>
        )}
      </div>
    </div>
  )
}
