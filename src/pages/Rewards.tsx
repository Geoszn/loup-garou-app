import { useCallback, useEffect, useState, type ReactNode } from 'react'
import { useSearchParams } from 'react-router-dom'
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
import { markStoreSeen, useStoreUnseen } from '../hooks/useStoreUnseen'
import { SeasonHub } from '../components/SeasonHub'

const STREAK_REWARD_COINS = 50 // à garder identique à claim_daily_login (migration 0196)

type Tab = 'quests' | 'store' | 'season' | 'mine'

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

/** Compte à rebours compact (en-tête de la carte des quêtes) : les secondes défilent, rouge pendant la dernière heure. */
function CountdownClock({ ms }: { ms: number }) {
  const { t } = useLanguage()
  const urgent = ms < 60 * 60 * 1000
  return (
    <span className={`font-body text-[11px] font-normal normal-case tracking-normal tabular-nums ${urgent ? 'text-blood-300' : 'text-amber-300'}`}>
      ⏰ {t('rewards.streak.timerLabel')} {formatCountdown(ms)}
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
  // Lien direct vers un onglet précis (ex. l'annonce de lancement de saison,
  // voir AnnouncementsModal.tsx) : ?tab=season ouvre directement cet onglet
  // au lieu du "Quêtes" par défaut. Ignoré si la valeur ne correspond à
  // aucun onglet connu.
  const [searchParams] = useSearchParams()
  const [tab, setTab] = useState<Tab>(() => {
    // « history » (anciens liens) ouvre « Mon sac », qui contient désormais l'historique.
    const requested = searchParams.get('tab') === 'history' ? 'mine' : searchParams.get('tab')
    const valid: Tab[] = ['quests', 'store', 'season', 'mine']
    return (valid as string[]).includes(requested ?? '') ? (requested as Tab) : 'quests'
  })
  const [summary, setSummary] = useState<LoupCoinsSummary | null>(null)
  const [myArtifacts, setMyArtifacts] = useState<MyArtifact[] | null>(null)
  const [ownedSkins, setOwnedSkins] = useState<StoreSkin[] | null>(null)
  const [resetIn, setResetIn] = useState(() => msUntilNextQuestDay())
  // Tick à la seconde (au lieu de 30s) : c'est tout le sens de CountdownClock,
  // voir son commentaire — sans ça les secondes affichées ne bougeraient pas.
  const [error, setError] = useState<string | null>(null)
  const [questScope, setQuestScope] = useState<'day' | 'season'>('day')
  const [historyPage, setHistoryPage] = useState(0)
  // ?section=skins ouvre directement les skins (lien de l'annonce « nouveaux
  // articles » et de la notification push correspondante).
  const [storeTab, setStoreTab] = useState<'artifacts' | 'skins'>(() => (searchParams.get('section') === 'skins' ? 'skins' : 'artifacts'))
  const { quests, claiming, claim } = useMyQuests()
  const myAvatar = useMyAvatarConfig()
  const { season, refresh: refreshSeason } = useMySeason()
  // Point rouge « nouveauté » de la boutique : visible sur l'onglet tant qu'on ne l'a pas ouvert, éteint à l'ouverture
  // (y compris si un article arrive pendant qu'on est déjà dessus).
  const storeUnseen = useStoreUnseen()
  useEffect(() => {
    if (tab === 'store' && storeUnseen > 0) void markStoreSeen()
  }, [tab, storeUnseen])

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
    { id: 'mine', icon: '🎒', label: t('rewards.tab.bag') },
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
  const questsClaimable = allQuests.filter((q) => q.progress >= q.target && !q.claimed_at).length
  const dayQuests = quests === null ? null : allQuests.filter((q) => q.scope !== 'season')
  const seasonQuests = allQuests.filter((q) => q.scope === 'season')
  const hasSeasonQuests = seasonQuests.length > 0
  const shownQuests = questScope === 'season' && hasSeasonQuests ? seasonQuests : dayQuests

  const txs = summary?.transactions ?? []
  const historyPageCount = Math.max(1, Math.ceil(txs.length / PAGE_SIZE))

  return (
    <div className="min-h-screen px-4 pt-8">
      <div className="mx-auto flex max-w-3xl flex-col gap-4">
        {/* En-tête et solde sur une seule ligne : le solde est l'information que l'on vient chercher ici. */}
        <header className="flex items-center justify-between gap-3">
          <h1 className="font-display text-2xl text-moon-200">{t('hub.title')}</h1>
          <button
            type="button"
            onClick={() => setTab('mine')}
            className="flex items-center gap-1.5 rounded-full border border-amber-400/40 bg-amber-400/10 px-3 py-1.5 font-display text-lg text-amber-300"
            aria-label={t('loupStore.balance')}
          >
            <LoupCoinIcon className="h-5 w-5" /> {balance}
          </button>
        </header>

        {/* Quatre onglets fixes, tous visibles à 390 px (plus de défilement horizontal ni de flèche « plus »). */}
        <nav className="grid grid-cols-4 gap-1 rounded-2xl border border-night-600/60 bg-night-900/40 p-1">
          {tabs.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => setTab(item.id)}
              className={`relative flex flex-col items-center gap-0.5 rounded-xl py-2 text-[11px] font-semibold transition-colors ${
                tab === item.id ? 'bg-blood-600 text-[#fdf6e3]' : 'text-moon-200/60 hover:text-moon-200'
              }`}
            >
              <span aria-hidden="true" className="text-base leading-none">{item.icon}</span>
              {item.label}
              {item.id === 'store' && storeUnseen > 0 && (
                <span aria-hidden="true" className="absolute right-2 top-1.5 h-2.5 w-2.5 rounded-full border-2 border-night-950 bg-blood-500" />
              )}
              {item.id === 'quests' && questsClaimable > 0 && (
                <span className="absolute right-1.5 top-1 rounded-full bg-amber-400 px-1.5 text-[9px] font-bold text-night-950">{questsClaimable}</span>
              )}
            </button>
          ))}
        </nav>

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

            <Section
              title={questScope === 'season' && hasSeasonQuests ? t('hub.quests.seasonTitle') : t('hub.quests.daily')}
              right={questScope !== 'season' ? <CountdownClock ms={resetIn} /> : undefined}
            >
              {shownQuests === null ? (
                <div className="h-24 animate-pulse rounded-xl bg-night-900/40" />
              ) : (
                <ul className="flex flex-col gap-3">
                  {sortQuests(shownQuests).map((q) => {
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
            </Section>

              </>
            ) : null}

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
            <SeasonHub season={season} baseConfig={myAvatar.config} onClaimed={refreshSeason} />
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
          <Section
            title={t('loupStore.history.title')}
            right={summary ? <span className="text-[11px] font-normal text-moon-200/50">+{summary.total_earned} · −{summary.total_spent}</span> : undefined}
          >
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
          </>
        )}

      </div>
    </div>
  )
}

/** À réclamer d'abord, puis en cours, puis déjà réclamées. */
function sortQuests<T extends { progress: number; target: number; claimed_at: string | null }>(list: T[]): T[] {
  const rank = (q: T) => (q.claimed_at ? 2 : q.progress >= q.target ? 0 : 1)
  return [...list].sort((a, b) => rank(a) - rank(b))
}
