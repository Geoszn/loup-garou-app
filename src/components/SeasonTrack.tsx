import { useState } from 'react'
import { supabase } from '../lib/supabase'
import { useLanguage } from '../i18n/LanguageContext'
import { Avatar } from './Avatar'
import { LoupCoinIcon } from './LoupCoinIcon'
import { DEFAULT_AVATAR_CONFIG } from '../lib/avatarParts'
import { RARITY_STYLE } from '../lib/skins'
import type { MySeason, SeasonThemeColor, SeasonTier } from '../types/season'

export const THEME_STYLE: Record<SeasonThemeColor, { border: string; glow: string; bar: string }> = {
  blush: { border: 'border-pink-400/30', glow: 'from-pink-500/15 via-pink-400/5', bar: 'from-pink-400 to-pink-300' },
  gold: { border: 'border-amber-400/30', glow: 'from-amber-500/15 via-amber-400/5', bar: 'from-amber-400 to-amber-300' },
  blood: { border: 'border-blood-500/30', glow: 'from-blood-600/15 via-blood-500/5', bar: 'from-blood-500 to-blood-400' },
  emerald: { border: 'border-emerald-400/30', glow: 'from-emerald-500/15 via-emerald-400/5', bar: 'from-emerald-400 to-emerald-300' },
  violet: { border: 'border-purple-400/30', glow: 'from-purple-500/15 via-purple-400/5', bar: 'from-purple-400 to-purple-300' },
}

export function daysLeftLabel(endsAt: string, lang: 'fr' | 'en'): string {
  const ms = new Date(endsAt).getTime() - Date.now()
  if (ms <= 0) return lang === 'en' ? 'Ended' : 'Terminée'
  const days = Math.ceil(ms / (24 * 3600 * 1000))
  if (days <= 1) return lang === 'en' ? 'Last day' : 'Dernier jour'
  return lang === 'en' ? `${days} days left` : `${days} jours restants`
}

/** Piste de paliers de la saison en cours (voir migration 0203) — un skin
 * "battle pass" gratuit alimenté par l'XP de partie/quête déjà gagné
 * ailleurs, jamais un système à part que le joueur doit apprendre. Affiché
 * juste sous le carrousel événements/bannières sur le tableau de bord.
 * Rendu en scroll horizontal (paliers potentiellement nombreux) plutôt
 * qu'une liste verticale, pour rester compact sur mobile. */
export function SeasonTrack({ season, onClaimed }: { season: MySeason; onClaimed: () => void }) {
  const { lang, t } = useLanguage()
  const [claimingId, setClaimingId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const theme = THEME_STYLE[season.theme_color]
  const name = lang === 'en' ? season.name_en : season.name_fr
  const nextTier = season.tiers.find((tier) => !tier.claimed && tier.xp_required > season.xp)
  const claimable = season.tiers.filter((tier) => !tier.claimed && tier.xp_required <= season.xp)
  const lastTier = season.tiers[season.tiers.length - 1]
  const barTarget = nextTier?.xp_required ?? lastTier?.xp_required ?? 1
  const barPct = Math.min(Math.round((season.xp / barTarget) * 100), 100)

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
    <div className={`overflow-hidden rounded-2xl border bg-gradient-to-b ${theme.border} ${theme.glow} to-transparent`}>
      <div className="flex items-center justify-between gap-3 px-4 pt-3.5">
        <div className="min-w-0">
          <p className="truncate font-display text-base text-moon-200">🎟️ {name}</p>
          <p className="text-[11px] text-moon-200/50">
            {season.xp} XP{nextTier ? ` · ${t('season.nextIn', { xp: nextTier.xp_required - season.xp })}` : ` · ${t('season.complete')}`}
          </p>
        </div>
        <span
          className={`shrink-0 rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide ${
            season.is_active ? 'bg-moon-400/15 text-moon-300' : 'bg-night-700/60 text-moon-200/50'
          }`}
        >
          {season.is_active ? daysLeftLabel(season.ends_at, lang) : lang === 'en' ? 'Ended' : 'Terminée'}
        </span>
      </div>

      <div className="mx-4 mt-2.5 h-1.5 overflow-hidden rounded-full bg-night-900/60">
        <div className={`h-full rounded-full bg-gradient-to-r ${theme.bar} transition-all`} style={{ width: `${barPct}%` }} />
      </div>

      {error && <p className="mx-4 mt-2 text-[11px] text-blood-400">{error}</p>}

      <div className="mt-3 flex gap-2 overflow-x-auto px-4 pb-4 [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden">
        {season.tiers.map((tier) => {
          const unlocked = tier.xp_required <= season.xp
          const canClaim = unlocked && !tier.claimed
          const preview = tier.reward_type === 'skin' && tier.reward_skin ? { ...DEFAULT_AVATAR_CONFIG, ...tier.reward_skin.config } : null
          return (
            <button
              key={tier.id}
              type="button"
              disabled={!canClaim || claimingId !== null}
              onClick={() => claim(tier)}
              className={`relative flex w-16 shrink-0 flex-col items-center gap-1 rounded-xl border px-1.5 py-2 text-center transition-colors ${
                tier.claimed
                  ? 'border-night-700/60 bg-night-900/30 opacity-60'
                  : canClaim
                    ? `${theme.border} bg-moon-400/10 shadow-[0_0_0_1px_rgba(224,168,74,0.25)]`
                    : 'border-night-700/60 bg-night-900/20 opacity-70'
              }`}
            >
              <span className="text-[9.5px] font-bold text-moon-200/50">#{tier.tier_number}</span>
              {preview ? (
                <span
                  className={`relative block h-9 w-9 overflow-hidden rounded-full border-2 ${
                    tier.reward_skin ? RARITY_STYLE[tier.reward_skin.rarity].border : 'border-night-600/60'
                  }`}
                >
                  <Avatar config={preview} className="h-9 w-9" />
                </span>
              ) : (
                <span className="flex h-9 w-9 items-center justify-center rounded-full bg-night-900/50">
                  <LoupCoinIcon className="h-4 w-4" />
                </span>
              )}
              <span className="max-w-full truncate text-[9.5px] font-semibold text-moon-200/80">
                {tier.reward_type === 'coins' ? tier.reward_coins : lang === 'en' ? tier.label_en : tier.label_fr}
              </span>
              {tier.claimed && <span className="absolute right-1 top-1 text-[10px]">✅</span>}
              {!unlocked && <span className="absolute right-1 top-1 text-[10px] opacity-70">🔒</span>}
              {canClaim && <span className="absolute -right-0.5 -top-0.5 h-2.5 w-2.5 animate-pulse rounded-full bg-moon-400" />}
            </button>
          )
        })}
      </div>

      {claimable.length > 0 && (
        <p className="mx-4 -mt-2 mb-3.5 text-[11px] font-semibold text-moon-300">
          {t('season.claimableHint', { count: claimable.length })}
        </p>
      )}
    </div>
  )
}
