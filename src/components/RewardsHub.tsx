import { useCallback, useEffect, useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../lib/supabase'
import { useLanguage } from '../i18n/LanguageContext'
import { Button } from './ui'
import { LoupCoinIcon } from './LoupCoinIcon'
import { ArtifactsPanel, SkinsPanel } from './StorePanels'

type MenuTab = 'quests' | 'store' | 'season'

interface Quest {
  template_id: string
  label_fr: string
  label_en: string
  progress: number
  target: number
  reward_coins: number
  claimed_at: string | null
}

/** Millisecondes avant le prochain changement de journée de quêtes (06h00 UTC,
 * voir quest_today, migration 0187). */
function msUntilNextQuestDay(now = Date.now()): number {
  const d = new Date(now)
  let next = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), 6)
  if (next <= now) next += 24 * 60 * 60 * 1000
  return next - now
}

function formatDelay(ms: number): string {
  const totalMinutes = Math.max(Math.ceil(ms / 60000), 1)
  const h = Math.floor(totalMinutes / 60)
  const m = totalMinutes % 60
  return h > 0 ? `${h} h ${String(m).padStart(2, '0')} min` : `${m} min`
}

function SubTabs<T extends string>({
  tabs,
  active,
  onChange,
}: {
  tabs: { id: T; label: string; soon?: boolean }[]
  active: T
  onChange: (id: T) => void
}) {
  const { t } = useLanguage()
  return (
    <div className="flex gap-1 rounded-xl border border-night-600/60 bg-night-900/40 p-1">
      {tabs.map((tab) => (
        <button
          key={tab.id}
          type="button"
          onClick={() => onChange(tab.id)}
          className={`flex flex-1 items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-xs font-semibold transition-colors ${
            active === tab.id ? 'bg-blood-600 text-[#fdf6e3]' : 'text-moon-200/60 hover:text-moon-200'
          }`}
        >
          {tab.label}
          {tab.soon && (
            <span className="rounded-full border border-moon-400/40 bg-moon-400/10 px-1.5 py-px text-[9px] font-semibold uppercase tracking-wider text-moon-300">
              {t('hub.soon')}
            </span>
          )}
        </button>
      ))}
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

function SoonBox({ children }: { children: ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-moon-400/30 bg-moon-400/[0.04] px-4 py-6 text-center">
      {children}
    </div>
  )
}

/**
 * Hub « Récompenses » du tableau de bord : Quêtes (du jour ; saisonnières
 * bientôt), Store (Artefacts et Skins) et Saison (bientôt). Remplace l'ancienne
 * carte des quêtes.
 */
export function RewardsHub() {
  const { profile, refreshProfile } = useAuth()
  const { t, lang } = useLanguage()
  const [tab, setTab] = useState<MenuTab>('quests')
  const [questTab, setQuestTab] = useState<'daily' | 'season'>('daily')
  const [storeTab, setStoreTab] = useState<'artifacts' | 'skins'>('artifacts')
  const [quests, setQuests] = useState<Quest[] | null>(null)
  const [claiming, setClaiming] = useState<string | null>(null)
  const [resetIn, setResetIn] = useState(() => msUntilNextQuestDay())

  const loadQuests = useCallback(async () => {
    const { data } = await supabase.rpc('get_my_quests')
    if (data) setQuests(data as Quest[])
  }, [])

  useEffect(() => {
    void loadQuests()
  }, [loadQuests])

  useEffect(() => {
    const id = setInterval(() => setResetIn(msUntilNextQuestDay()), 30000)
    return () => clearInterval(id)
  }, [])

  async function claim(templateId: string) {
    setClaiming(templateId)
    const { data, error } = await supabase.rpc('claim_quest_reward', { p_template_id: templateId })
    setClaiming(null)
    if (!error && data) {
      void refreshProfile()
      await loadQuests()
    }
  }

  const balance = profile?.loup_coins ?? 0
  const claimable = !!quests?.some((q) => q.progress >= q.target && !q.claimed_at)

  const menu: { id: MenuTab; icon: string; label: string; soon?: boolean }[] = [
    { id: 'quests', icon: '📜', label: t('hub.menu.quests') },
    { id: 'store', icon: '🛒', label: t('hub.menu.store') },
    { id: 'season', icon: '🏆', label: t('hub.menu.season'), soon: true },
  ]

  return (
    <section className="rounded-2xl border border-night-600/70 bg-gradient-to-b from-night-700/70 to-night-900/85 p-4 shadow-card">
      <div className="mb-3 flex items-center justify-between gap-3">
        <h2 className="font-display text-lg text-moon-200">{t('hub.title')}</h2>
        <Link
          to="/loup-store"
          title={t('hub.seeAll')}
          className="flex items-center gap-1.5 rounded-full border border-amber-400/30 bg-amber-400/10 px-3 py-1 font-display text-base text-amber-300 transition-colors hover:border-amber-400/60"
        >
          <LoupCoinIcon className="h-5 w-5" /> {balance}
        </Link>
      </div>

      <nav className="mb-4 grid grid-cols-3 gap-1 rounded-xl border border-night-600/60 bg-night-900/40 p-1">
        {menu.map((m) => (
          <button
            key={m.id}
            type="button"
            onClick={() => setTab(m.id)}
            className={`relative flex flex-col items-center gap-0.5 rounded-lg px-2 py-2 text-xs font-semibold transition-colors ${
              tab === m.id ? 'bg-blood-600 text-[#fdf6e3]' : 'text-moon-200/60 hover:text-moon-200'
            }`}
          >
            <span className="text-lg leading-none" aria-hidden="true">
              {m.icon}
            </span>
            {m.label}
            {m.soon && (
              <span className="absolute -right-0.5 -top-1 rounded-full border border-moon-400/40 bg-night-900 px-1.5 py-px text-[8px] font-semibold uppercase tracking-wider text-moon-300">
                {t('hub.soon')}
              </span>
            )}
            {m.id === 'quests' && claimable && <span className="absolute right-2 top-1.5 h-2 w-2 rounded-full bg-blood-400" />}
          </button>
        ))}
      </nav>

      {tab === 'quests' && (
        <div className="flex flex-col gap-3">
          <SubTabs
            tabs={[
              { id: 'daily', label: t('hub.quests.daily') },
              { id: 'season', label: t('hub.quests.season'), soon: true },
            ]}
            active={questTab}
            onChange={setQuestTab}
          />
          {questTab === 'daily' ? (
            <>
              <p className="flex items-center gap-1.5 text-xs text-moon-200/50">
                <span aria-hidden="true">⏳</span>
                {t('hub.quests.resetIn', { time: formatDelay(resetIn) })}
              </p>
              {quests === null ? (
                <div className="h-24 animate-pulse rounded-xl bg-night-900/40" />
              ) : (
                <ul className="flex flex-col gap-3">
                  {quests.map((q) => {
                    const done = q.progress >= q.target
                    const claimed = !!q.claimed_at
                    const label = lang === 'en' ? q.label_en : q.label_fr
                    const segments = q.target > 0 && q.target <= 12 ? q.target : null
                    return (
                      <li
                        key={q.template_id}
                        className={`flex flex-col gap-2 rounded-xl border p-3 transition-colors ${
                          claimed ? 'border-night-700/40 bg-night-800/20' : done ? 'border-amber-400/40 bg-amber-400/[0.06]' : 'border-night-700/50 bg-night-800/30'
                        }`}
                      >
                        <div className="flex items-center gap-2">
                          <span
                            className={`inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold tabular-nums ${
                              claimed ? 'bg-night-700/50 text-moon-200/40' : 'bg-amber-400/15 text-amber-300'
                            }`}
                          >
                            <LoupCoinIcon className="h-3 w-3" /> +{q.reward_coins}
                          </span>
                          <span className={`min-w-0 flex-1 text-sm ${claimed ? 'text-moon-200/40 line-through' : 'text-moon-200/90'}`}>{label}</span>
                          {claimed && (
                            <span className="shrink-0 text-sm text-emerald-400" aria-hidden="true">
                              ✓
                            </span>
                          )}
                        </div>
                        {!claimed && !done && (
                          <div className="flex items-center gap-2.5">
                            {segments ? (
                              <div className="flex flex-1 gap-1">
                                {Array.from({ length: segments }).map((_, i) => (
                                  <div key={i} className={`h-2 flex-1 rounded-full transition-colors ${i < q.progress ? 'bg-moon-300' : 'bg-night-700'}`} />
                                ))}
                              </div>
                            ) : (
                              <div className="h-2 flex-1 overflow-hidden rounded-full bg-night-800">
                                <div className="h-full rounded-full bg-moon-300 transition-all" style={{ width: `${Math.min(100, (q.progress / q.target) * 100)}%` }} />
                              </div>
                            )}
                            <span className="shrink-0 text-xs tabular-nums text-moon-200/50">
                              {q.progress}/{q.target}
                            </span>
                          </div>
                        )}
                        {done && !claimed && (
                          <Button className="w-full py-2 text-sm" disabled={claiming === q.template_id} onClick={() => claim(q.template_id)}>
                            {claiming === q.template_id ? (
                              t('common.sending')
                            ) : (
                              <span className="inline-flex items-center gap-1.5">
                                {t('quest.claim', { coins: q.reward_coins })}
                                <LoupCoinIcon className="h-3.5 w-3.5" />
                              </span>
                            )}
                          </Button>
                        )}
                      </li>
                    )
                  })}
                </ul>
              )}
            </>
          ) : (
            <SoonBox>
              <span className="text-3xl" aria-hidden="true">
                🏆
              </span>
              <p className="font-display text-base text-moon-200">{t('hub.quests.seasonTitle')}</p>
              <p className="text-xs leading-relaxed text-moon-200/60">{t('hub.quests.seasonBody')}</p>
              <SoonBadge />
            </SoonBox>
          )}
        </div>
      )}

      {tab === 'store' && (
        <div className="flex flex-col gap-3">
          <SubTabs
            tabs={[
              { id: 'artifacts', label: t('hub.store.artifacts') },
              { id: 'skins', label: t('hub.store.skins') },
            ]}
            active={storeTab}
            onChange={setStoreTab}
          />
          {storeTab === 'artifacts' ? (
            <ArtifactsPanel balance={balance} onPurchased={() => void refreshProfile()} />
          ) : (
            <SkinsPanel balance={balance} onPurchased={() => void refreshProfile()} />
          )}
          <Link to="/loup-store" className="self-center text-xs text-moon-200/50 underline underline-offset-4 transition-colors hover:text-moon-200">
            {t('hub.seeAll')}
          </Link>
        </div>
      )}

      {tab === 'season' && (
        <div className="flex flex-col gap-3">
          <SoonBox>
            <span className="text-5xl drop-shadow-[0_0_14px_rgba(224,168,74,0.5)]" aria-hidden="true">
              🏆
            </span>
            <p className="font-display text-xl text-moon-200">{t('hub.season.title')}</p>
            <SoonBadge />
            <p className="text-sm leading-relaxed text-moon-200/70">{t('hub.season.body')}</p>
          </SoonBox>
          <ul className="flex flex-col gap-2">
            {(
              [
                ['📊', 'hub.season.f1'],
                ['🎯', 'hub.season.f2'],
                ['🎁', 'hub.season.f3'],
              ] as const
            ).map(([icon, key]) => (
              <li key={key} className="flex items-center gap-3 rounded-xl border border-night-600/60 bg-night-900/40 px-3 py-2.5 opacity-70">
                <span className="text-xl" aria-hidden="true">
                  {icon}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-moon-200">{t(`${key}.title` as 'hub.season.f1.title')}</p>
                  <p className="text-xs text-moon-200/50">{t(`${key}.body` as 'hub.season.f1.body')}</p>
                </div>
                <span className="text-sm" aria-hidden="true">
                  🔒
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  )
}
