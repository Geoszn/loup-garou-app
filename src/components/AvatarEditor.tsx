import { useEffect, useState, type ReactNode } from 'react'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../lib/supabase'
import { useLanguage } from '../i18n/LanguageContext'
import type { TranslationKey } from '../i18n/translations'
import { Avatar } from './Avatar'
import {
  ACCESSORIES,
  AVATAR_BGS,
  DEFAULT_AVATAR_CONFIG,
  HAIRS,
  OUTFITS,
  PART_MIN_POINTS,
  SKIN_TONES,
  isAvatarConfig,
  type AvatarConfig,
} from '../lib/avatarParts'

/** Charge la configuration d'avatar du joueur connecté. Requête séparée du
 * chargement du profil (AuthContext) : si la colonne n'existe pas encore en
 * base, seule cette lecture échoue (config = null), jamais la connexion. */
export function useMyAvatarConfig() {
  const { user } = useAuth()
  const [config, setConfig] = useState<AvatarConfig | null>(null)
  const [version, setVersion] = useState(0)

  useEffect(() => {
    if (!user) return
    let active = true
    supabase
      .from('profiles')
      .select('avatar_config')
      .eq('id', user.id)
      .maybeSingle()
      .then(({ data, error }) => {
        if (!active || error) return
        const value = (data as { avatar_config?: unknown } | null)?.avatar_config
        setConfig(isAvatarConfig(value) ? value : null)
      })
    return () => {
      active = false
    }
  }, [user, version])

  return { config, reload: () => setVersion((v) => v + 1) }
}

const HAIR_LABEL: Record<(typeof HAIRS)[number], TranslationKey> = {
  none: 'avatar.hair.none',
  fade: 'avatar.hair.fade',
  afro: 'avatar.hair.afro',
  braids: 'avatar.hair.braids',
  locs: 'avatar.hair.locs',
  bun: 'avatar.hair.bun',
  gele: 'avatar.hair.gele',
}
const OUTFIT_LABEL: Record<(typeof OUTFITS)[number], TranslationKey> = {
  tunic: 'avatar.outfit.tunic',
  cloak: 'avatar.outfit.cloak',
  kente: 'avatar.outfit.kente',
  hood: 'avatar.outfit.hood',
}
const ACC_LABEL: Record<(typeof ACCESSORIES)[number], TranslationKey> = {
  none: 'avatar.acc.none',
  ring: 'avatar.acc.ring',
  glasses: 'avatar.acc.glasses',
  scar: 'avatar.acc.scar',
}

/** Aperçu + choix des pièces de l'avatar. Contrôlé par le parent, qui gère
 * l'enregistrement (voir ProfileModal dans pages/Account.tsx). */
export function AvatarPartsPicker({
  config,
  onChange,
}: {
  config: AvatarConfig
  onChange: (next: AvatarConfig) => void
}) {
  const { profile } = useAuth()
  const { t } = useLanguage()
  const points = profile?.rank_points ?? 0

  function chip<K extends 'hair' | 'outfit' | 'acc'>(kind: K, value: AvatarConfig[K], label: string, min: number) {
    const locked = points < min
    const active = config[kind] === value
    return (
      <button
        key={value}
        type="button"
        disabled={locked}
        aria-pressed={active}
        onClick={() => onChange({ ...config, [kind]: value })}
        className={`rounded-full border px-3 py-1.5 text-xs transition-colors ${
          active
            ? 'border-moon-400 bg-moon-400/15 font-semibold text-moon-200'
            : 'border-night-600 bg-night-800/60 text-moon-200/80 hover:border-night-500'
        } ${locked ? 'cursor-not-allowed opacity-45' : ''}`}
      >
        {locked ? `🔒 ${label} · ${t('avatar.locked', { points: min })}` : label}
      </button>
    )
  }

  function swatch(kind: 'skin' | 'bg', index: number, color: string) {
    const active = config[kind] === index
    return (
      <button
        key={index}
        type="button"
        aria-pressed={active}
        aria-label={`${t(kind === 'skin' ? 'avatar.skin' : 'avatar.bg')} ${index + 1}`}
        onClick={() => onChange({ ...config, [kind]: index })}
        className={`h-8 w-8 rounded-full border-2 transition-shadow ${
          active ? 'border-moon-400 shadow-[0_0_0_2px_rgba(224,168,74,0.5)]' : 'border-night-600'
        }`}
        style={{ backgroundColor: color }}
      />
    )
  }

  const group = (label: string, children: ReactNode) => (
    <div>
      <p className="mb-1.5 text-xs uppercase tracking-wider text-moon-200/50">{label}</p>
      <div className="flex flex-wrap gap-1.5">{children}</div>
    </div>
  )

  return (
    <div className="flex flex-col gap-4">
      <div className="flex justify-center">
        <Avatar config={config} className="h-28 w-28 ring-2 ring-moon-400/60 ring-offset-2 ring-offset-night-900" />
      </div>
      {group(t('avatar.skin'), SKIN_TONES.map((c, i) => swatch('skin', i, c)))}
      {group(t('avatar.hair'), HAIRS.map((h) => chip('hair', h, t(HAIR_LABEL[h]), PART_MIN_POINTS.hair[h])))}
      {group(t('avatar.outfit'), OUTFITS.map((o) => chip('outfit', o, t(OUTFIT_LABEL[o]), PART_MIN_POINTS.outfit[o])))}
      {group(t('avatar.acc'), ACCESSORIES.map((a) => chip('acc', a, t(ACC_LABEL[a]), PART_MIN_POINTS.acc[a])))}
      {group(t('avatar.bg'), AVATAR_BGS.map((c, i) => swatch('bg', i, c)))}
      <p className="text-xs text-moon-200/50">{t('avatar.hint')}</p>
    </div>
  )
}
