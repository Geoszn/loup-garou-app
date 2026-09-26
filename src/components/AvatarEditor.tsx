import { useEffect, useState } from 'react'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../lib/supabase'
import { useLanguage } from '../i18n/LanguageContext'
import type { TranslationKey } from '../i18n/translations'
import { Avatar } from './Avatar'
import { Button, Modal } from './ui'
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

export function AvatarEditorModal({
  open,
  onClose,
  initial,
  onSaved,
}: {
  open: boolean
  onClose: () => void
  initial: AvatarConfig | null
  onSaved: () => void
}) {
  const { profile } = useAuth()
  const { t } = useLanguage()
  const points = profile?.rank_points ?? 0
  const [config, setConfig] = useState<AvatarConfig>(initial ?? DEFAULT_AVATAR_CONFIG)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (open) {
      setConfig(initial ?? DEFAULT_AVATAR_CONFIG)
      setError(null)
    }
  }, [open, initial])

  async function save() {
    setSaving(true)
    setError(null)
    const { error: rpcError } = await supabase.rpc('set_my_avatar', { p_config: config })
    setSaving(false)
    if (rpcError) {
      setError(rpcError.message)
      return
    }
    onSaved()
    onClose()
  }

  function chip<K extends 'hair' | 'outfit' | 'acc'>(kind: K, value: AvatarConfig[K], label: string, min: number) {
    const locked = points < min
    const active = config[kind] === value
    return (
      <button
        key={value}
        type="button"
        disabled={locked}
        aria-pressed={active}
        onClick={() => setConfig((c) => ({ ...c, [kind]: value }))}
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
        onClick={() => setConfig((c) => ({ ...c, [kind]: index }))}
        className={`h-8 w-8 rounded-full border-2 transition-shadow ${
          active ? 'border-moon-400 shadow-[0_0_0_2px_rgba(224,168,74,0.5)]' : 'border-night-600'
        }`}
        style={{ backgroundColor: color }}
      />
    )
  }

  const group = (label: string, children: React.ReactNode) => (
    <div>
      <p className="mb-1.5 text-xs uppercase tracking-wider text-moon-200/50">{label}</p>
      <div className="flex flex-wrap gap-1.5">{children}</div>
    </div>
  )

  return (
    <Modal open={open} onClose={onClose} title={t('avatar.title')}>
      <div className="flex flex-col gap-4">
        <div className="flex justify-center">
          <Avatar
            config={config}
            className="h-28 w-28 ring-2 ring-moon-400/60 ring-offset-2 ring-offset-night-900"
          />
        </div>
        {group(t('avatar.skin'), SKIN_TONES.map((c, i) => swatch('skin', i, c)))}
        {group(t('avatar.hair'), HAIRS.map((h) => chip('hair', h, t(HAIR_LABEL[h]), PART_MIN_POINTS.hair[h])))}
        {group(t('avatar.outfit'), OUTFITS.map((o) => chip('outfit', o, t(OUTFIT_LABEL[o]), PART_MIN_POINTS.outfit[o])))}
        {group(t('avatar.acc'), ACCESSORIES.map((a) => chip('acc', a, t(ACC_LABEL[a]), PART_MIN_POINTS.acc[a])))}
        {group(t('avatar.bg'), AVATAR_BGS.map((c, i) => swatch('bg', i, c)))}
        <p className="text-xs text-moon-200/50">{t('avatar.hint')}</p>
        {error && <p className="rounded-xl border border-blood-500/40 bg-blood-500/10 px-3 py-2 text-xs text-blood-400">{error}</p>}
        <Button onClick={save} disabled={saving} className="w-full">
          {saving ? t('common.loading') : t('avatar.save')}
        </Button>
      </div>
    </Modal>
  )
}
