import { useEffect, useRef, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useLanguage } from '../i18n/LanguageContext'
import { Avatar } from './Avatar'
import { Button } from './ui'
import { LoupCoinIcon } from './LoupCoinIcon'
import { THEME_STYLE, daysLeftLabel } from './SeasonTrack'
import { DEFAULT_AVATAR_CONFIG, type AvatarConfig } from '../lib/avatarParts'
import { RARITY_STYLE } from '../lib/skins'
import type { MySeason, SeasonTier } from '../types/season'

/** Palier mis en avant à l'ouverture : le premier à réclamer, sinon le
 * prochain à atteindre, sinon le dernier (piste terminée). */
function defaultTierId(season: MySeason): string | null {
  const claimable = season.tiers.find((tier) => !tier.claimed && tier.xp_required <= season.xp)
  const next = season.tiers.find((tier) => !tier.claimed && tier.xp_required > season.xp)
  return (claimable ?? next ?? season.tiers[season.tiers.length - 1])?.id ?? null
}

function XpChips({ season }: { season: MySeason }) {
  const { t } = useLanguage()
  const items = [
    { icon: '🎮', label: t('season.hub.earn.played'), xp: season.xp_per_game_played },
    { icon: '🏆', label: t('season.hub.earn.won'), xp: season.xp_per_game_won },
    { icon: '📜', label: t('season.hub.earn.quest'), xp: season.xp_per_quest_claim },
  ].filter((item): item is { icon: string; label: string; xp: number } => typeof item.xp === 'number' && item.xp > 0)
  if (items.length === 0) return null
  return (
    <div className="grid grid-cols-3 gap-1.5">
      {items.map((item) => (
        <div key={item.label} className="flex flex-col items-center gap-0.5 rounded-xl border border-night-600/60 bg-night-900/40 px-1 py-2 text-center">
          <span className="text-base" aria-hidden="true">
            {item.icon}
          </span>
          <span className="font-display text-sm font-bold tabular-nums text-moon-300">+{item.xp} XP</span>
          <span className="text-[10px] leading-tight text-moon-200/60">{item.label}</span>
        </div>
      ))}
    </div>
  )
}

/** Carte de l'onglet Quêtes (Récompenses) pour la saison en cours : remplace
 * l'ancien « bientôt disponible » — il n'existe pas (encore) de quêtes propres
 * à la saison, mais la progression de saison est bien alimentée par les
 * parties et les quêtes du jour. On montre donc où en est le joueur, ce qu'il
 * peut faire pour avancer, et on renvoie vers la piste complète. */
export function SeasonQuestsCard({
  season,
  claimableQuests,
  onOpen,
}: {
  season: MySeason
  claimableQuests: number
  onOpen: () => void
}) {
  const { lang, t } = useLanguage()
  const theme = THEME_STYLE[season.theme_color]
  const name = lang === 'en' ? season.name_en : season.name_fr
  const nextTier = season.tiers.find((tier) => !tier.claimed && tier.xp_required > season.xp)
  const readyCount = season.tiers.filter((tier) => !tier.claimed && tier.xp_required <= season.xp).length
  const target = nextTier?.xp_required ?? season.tiers[season.tiers.length - 1]?.xp_required ?? 1
  const pct = Math.min(Math.round((season.xp / target) * 100), 100)
  const nextLabel = nextTier ? (nextTier.reward_type === 'coins' ? t('season.hub.coinsTitle', { coins: nextTier.reward_coins ?? 0 }) : lang === 'en' ? nextTier.label_en : nextTier.label_fr) : null

  return (
    <div className={`flex flex-col gap-3 overflow-hidden rounded-2xl border bg-gradient-to-b p-4 ${theme.border} ${theme.glow} to-transparent`}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-moon-200/50">{t('season.card.title')}</p>
          <p className="font-display text-lg leading-tight text-moon-200">🎟️ {name}</p>
        </div>
        <span className={`shrink-0 rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide ${season.is_active ? 'bg-moon-400/15 text-moon-300' : 'bg-night-700/60 text-moon-200/50'}`}>
          {season.is_active ? daysLeftLabel(season.ends_at, lang) : lang === 'en' ? 'Ended' : 'Terminée'}
        </span>
      </div>

      <div className="flex flex-col gap-1.5">
        <div className="flex items-baseline justify-between text-xs text-moon-200/70">
          <span>
            <b className="font-display text-xl tabular-nums text-moon-200">{season.xp}</b> XP
          </span>
          <span className="tabular-nums">{nextTier ? t('season.nextIn', { xp: nextTier.xp_required - season.xp }) : t('season.complete')}</span>
        </div>
        <div className="h-2 overflow-hidden rounded-full bg-night-900/60">
          <div className={`h-full rounded-full bg-gradient-to-r ${theme.bar} transition-all`} style={{ width: `${pct}%` }} />
        </div>
        {nextLabel && (
          <p className="text-[11px] text-moon-200/60">
            {t('season.card.nextReward')} : <b className="text-moon-200">{nextLabel}</b>
          </p>
        )}
      </div>

      <XpChips season={season} />

      {claimableQuests > 0 && (
        <div className="rounded-xl border border-amber-400/40 bg-amber-400/[0.08] px-3 py-2 text-xs">
          <p className="font-semibold text-amber-300">📜 {t('season.card.questsReady', { count: claimableQuests })}</p>
          {typeof season.xp_per_quest_claim === 'number' && season.xp_per_quest_claim > 0 && (
            <p className="mt-0.5 text-moon-200/60">{t('season.card.questsHint', { xp: season.xp_per_quest_claim })}</p>
          )}
        </div>
      )}

      {readyCount > 0 && <p className="text-xs font-semibold text-moon-300">{t('season.claimableHint', { count: readyCount })}</p>}

      <Button variant="ghost" className="w-full py-2.5 text-sm" onClick={onOpen}>
        {t('season.card.cta')} →
      </Button>
    </div>
  )
}

/** Page complète de l'onglet « Saison » : progression, gains d'XP, piste de
 * paliers sélectionnables et volet de détail de la récompense choisie (type,
 * description, XP requis, réclamation). La réclamation se fait dans le volet
 * de détail — toucher un palier ne fait que le consulter. */
export function SeasonHub({
  season,
  baseConfig,
  onClaimed,
}: {
  season: MySeason
  /** Avatar du joueur, sur lequel on essaie le skin du palier. */
  baseConfig?: AvatarConfig | null
  onClaimed: () => void
}) {
  const { lang, t } = useLanguage()
  const theme = THEME_STYLE[season.theme_color]
  const name = lang === 'en' ? season.name_en : season.name_fr
  const [selectedId, setSelectedId] = useState<string | null>(() => defaultTierId(season))
  const [claimingId, setClaimingId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const trackRef = useRef<HTMLDivElement>(null)

  const selected = season.tiers.find((tier) => tier.id === selectedId) ?? season.tiers.find((tier) => tier.id === defaultTierId(season)) ?? null
  const nextTier = season.tiers.find((tier) => !tier.claimed && tier.xp_required > season.xp)
  const lastTier = season.tiers[season.tiers.length - 1]
  const reachedCount = season.tiers.filter((tier) => tier.xp_required <= season.xp).length
  const target = nextTier?.xp_required ?? lastTier?.xp_required ?? 1
  const pct = Math.min(Math.round((season.xp / target) * 100), 100)
  const readyCount = season.tiers.filter((tier) => !tier.claimed && tier.xp_required <= season.xp).length
  const base = baseConfig ?? DEFAULT_AVATAR_CONFIG

  // Centre le palier mis en avant dans la piste à l'ouverture, sans toucher au
  // défilement de la page (scrollTo sur le conteneur, pas scrollIntoView).
  useEffect(() => {
    const el = trackRef.current?.querySelector<HTMLElement>('[data-selected="true"]')
    const box = trackRef.current
    if (el && box) box.scrollTo({ left: el.offsetLeft - box.clientWidth / 2 + el.clientWidth / 2 })
    // uniquement au montage
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function claim(tier: SeasonTier) {
    setClaimingId(tier.id)
    setError(null)
    const { error: rpcError } = await supabase.rpc('claim_season_tier', { p_tier_id: tier.id })
    setClaimingId(null)
    if (rpcError) {
      setError(rpcError.message)
      return
    }
    onClaimed()
  }

  return (
    <div className="flex flex-col gap-4">
      {/* En-tête : saison, XP, progression vers le prochain palier */}
      <div className={`flex flex-col gap-3 overflow-hidden rounded-2xl border bg-gradient-to-b p-4 ${theme.border} ${theme.glow} to-transparent`}>
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="font-display text-xl leading-tight text-moon-200">🎟️ {name}</p>
            <p className="mt-0.5 text-[11px] text-moon-200/50">
              {t('season.hub.endsOn', { date: new Date(season.ends_at).toLocaleDateString(lang === 'en' ? 'en-US' : 'fr-FR', { day: 'numeric', month: 'long' }) })}
            </p>
          </div>
          <span className={`shrink-0 rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide ${season.is_active ? 'bg-moon-400/15 text-moon-300' : 'bg-night-700/60 text-moon-200/50'}`}>
            {season.is_active ? daysLeftLabel(season.ends_at, lang) : lang === 'en' ? 'Ended' : 'Terminée'}
          </span>
        </div>

        <div className="flex items-end justify-between gap-3">
          <p className="font-display text-4xl font-bold tabular-nums leading-none text-moon-200">
            {season.xp}
            <span className="ml-1 text-base font-semibold text-moon-200/50">XP</span>
          </p>
          <p className="pb-0.5 text-right text-xs text-moon-200/60">
            <span className="block font-semibold text-moon-300">{t('season.hub.level', { n: reachedCount, total: season.tiers.length })}</span>
            {nextTier ? t('season.nextIn', { xp: nextTier.xp_required - season.xp }) : t('season.complete')}
          </p>
        </div>

        <div className="h-2.5 overflow-hidden rounded-full bg-night-900/60">
          <div className={`h-full rounded-full bg-gradient-to-r ${theme.bar} transition-all`} style={{ width: `${pct}%` }} />
        </div>

        {readyCount > 0 && <p className="text-xs font-semibold text-moon-300">{t('season.claimableHint', { count: readyCount })}</p>}
      </div>

      <XpChipsSection season={season} />

      {/* Piste des paliers */}
      <div className="flex flex-col gap-2 rounded-2xl border border-night-600/70 bg-gradient-to-b from-night-700/70 to-night-900/85 p-4 shadow-card">
        <div>
          <p className="font-display text-base text-moon-200">{t('season.hub.track')}</p>
          <p className="text-[11px] text-moon-200/45">{t('season.hub.trackHint')}</p>
        </div>

        <div ref={trackRef} className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 pt-1.5 [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden">
          {season.tiers.map((tier) => {
            const unlocked = tier.xp_required <= season.xp
            const canClaim = unlocked && !tier.claimed
            const isSelected = tier.id === selected?.id
            const preview = tier.reward_type === 'skin' && tier.reward_skin ? { ...base, ...tier.reward_skin.config } : null
            return (
              <button
                key={tier.id}
                type="button"
                data-selected={isSelected}
                aria-pressed={isSelected}
                onClick={() => setSelectedId(tier.id)}
                className={`relative flex w-[72px] shrink-0 flex-col items-center gap-1 rounded-xl border px-1.5 py-2 text-center transition-all ${
                  isSelected
                    ? 'border-moon-300 bg-moon-400/15 ring-1 ring-moon-300/70'
                    : tier.claimed
                      ? 'border-night-700/60 bg-night-900/30 opacity-60'
                      : canClaim
                        ? `${theme.border} bg-moon-400/10`
                        : 'border-night-700/60 bg-night-900/20'
                }`}
              >
                <span className="text-[10px] font-bold text-moon-200/50">#{tier.tier_number}</span>
                {preview ? (
                  <span className={`block h-10 w-10 overflow-hidden rounded-full border-2 ${tier.reward_skin ? RARITY_STYLE[tier.reward_skin.rarity].border : 'border-night-600/60'} ${!unlocked ? 'opacity-70' : ''}`}>
                    <Avatar config={preview} className="h-10 w-10" />
                  </span>
                ) : (
                  <span className={`flex h-10 w-10 items-center justify-center rounded-full bg-night-900/50 ${!unlocked ? 'opacity-70' : ''}`}>
                    <LoupCoinIcon className="h-5 w-5" />
                  </span>
                )}
                <span className="text-[10px] font-semibold tabular-nums text-moon-200/70">{tier.xp_required} XP</span>
                {tier.claimed && <span className="absolute right-1 top-1 text-[10px]">✅</span>}
                {!unlocked && <span className="absolute right-1 top-1 text-[10px] opacity-70">🔒</span>}
                {canClaim && <span className="absolute -right-0.5 -top-0.5 h-2.5 w-2.5 animate-pulse rounded-full bg-moon-400" />}
              </button>
            )
          })}
        </div>
      </div>

      {/* Volet de détail du palier sélectionné */}
      {selected && <TierDetail key={selected.id} tier={selected} season={season} base={base} claiming={claimingId === selected.id} disabled={claimingId !== null} error={error} onClaim={() => claim(selected)} />}
    </div>
  )
}

function XpChipsSection({ season }: { season: MySeason }) {
  const { t } = useLanguage()
  if (!season.xp_per_game_played && !season.xp_per_game_won && !season.xp_per_quest_claim) return null
  return (
    <div className="flex flex-col gap-2 rounded-2xl border border-night-600/70 bg-gradient-to-b from-night-700/70 to-night-900/85 p-4 shadow-card">
      <p className="font-display text-base text-moon-200">{t('season.hub.earnTitle')}</p>
      <XpChips season={season} />
    </div>
  )
}

function TierDetail({
  tier,
  season,
  base,
  claiming,
  disabled,
  error,
  onClaim,
}: {
  tier: SeasonTier
  season: MySeason
  base: AvatarConfig
  claiming: boolean
  disabled: boolean
  error: string | null
  onClaim: () => void
}) {
  const { lang, t } = useLanguage()
  const unlocked = tier.xp_required <= season.xp
  const canClaim = unlocked && !tier.claimed
  const skin = tier.reward_type === 'skin' ? tier.reward_skin : null
  const rarity = skin ? RARITY_STYLE[skin.rarity] : null
  const missing = Math.max(tier.xp_required - season.xp, 0)
  const pct = tier.xp_required > 0 ? Math.min(Math.round((season.xp / tier.xp_required) * 100), 100) : 100

  const title = skin ? (lang === 'en' ? skin.name_en : skin.name_fr) : t('season.hub.coinsTitle', { coins: tier.reward_coins ?? 0 })
  const description = skin ? (lang === 'en' ? skin.description_en : skin.description_fr) : t('season.hub.coinsDesc')
  const category = skin?.category ? t(`hub.skins.cat.${skin.category}`) : null

  return (
    <div className={`flex flex-col gap-3.5 rounded-2xl border bg-gradient-to-b from-night-700/70 to-night-900/85 p-4 shadow-card ${canClaim ? 'border-amber-400/50' : 'border-night-600/70'}`}>
      <div className="flex items-center gap-3.5">
        {skin ? (
          <span className={`block h-24 w-24 shrink-0 overflow-hidden rounded-2xl border-2 bg-night-900/50 ${rarity?.border}`}>
            <Avatar config={{ ...base, ...skin.config }} className="h-24 w-24" />
          </span>
        ) : (
          <span className="flex h-24 w-24 shrink-0 items-center justify-center rounded-2xl border-2 border-amber-400/40 bg-amber-400/[0.07]">
            <LoupCoinIcon className="h-12 w-12" />
          </span>
        )}
        <div className="min-w-0 flex-1">
          <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-moon-200/50">{t('season.hub.tierN', { n: tier.tier_number })}</p>
          <p className="font-display text-lg leading-tight text-moon-200">{title}</p>
          <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
            {skin && rarity ? (
              <>
                <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-semibold ${rarity.border} ${rarity.text}`}>
                  <span className={`h-1.5 w-1.5 rounded-full ${rarity.dot}`} />
                  {t(`hub.skins.rarity.${skin.rarity}`)}
                </span>
                {category && <span className="rounded-full border border-night-600/60 px-2 py-0.5 text-[10px] text-moon-200/60">{category}</span>}
              </>
            ) : (
              <span className="rounded-full border border-amber-400/40 px-2 py-0.5 text-[10px] font-semibold text-amber-300">Loup Coins</span>
            )}
          </div>
        </div>
      </div>

      {description && <p className="text-sm leading-relaxed text-moon-200/75">{description}</p>}
      {skin && <p className="text-xs leading-relaxed text-moon-200/50">{tier.claimed ? t('season.hub.skinOwned') : t('season.hub.skinExclusive')}</p>}

      <div className="flex flex-col gap-2 rounded-xl border border-night-600/60 bg-night-900/40 p-3">
        <div className="flex items-center justify-between gap-2 text-xs">
          <span className="text-moon-200/60">{t('season.hub.requires')}</span>
          <span className="font-display text-base font-bold tabular-nums text-moon-200">{tier.xp_required} XP</span>
        </div>
        {!tier.claimed && !unlocked && (
          <>
            <div className="h-2 overflow-hidden rounded-full bg-night-800">
              <div className="h-full rounded-full bg-moon-300" style={{ width: `${pct}%` }} />
            </div>
            <div className="flex items-center justify-between text-[11px] tabular-nums text-moon-200/60">
              <span>
                {t('season.hub.yourXp')} : {season.xp}
              </span>
              <span className="font-semibold text-moon-300">{t('season.hub.status.locked', { xp: missing })}</span>
            </div>
          </>
        )}
        {tier.claimed && <p className="text-xs font-semibold text-emerald-400">✅ {t('season.hub.status.claimed')}</p>}
        {canClaim && <p className="text-xs font-semibold text-amber-300">🎁 {t('season.hub.status.ready')}</p>}
      </div>

      {error && <p className="text-xs text-blood-400">{error}</p>}

      {canClaim && (
        <Button className="w-full py-3 text-sm" disabled={disabled} onClick={onClaim}>
          {claiming ? t('common.sending') : t('season.hub.claim')}
        </Button>
      )}
    </div>
  )
}
