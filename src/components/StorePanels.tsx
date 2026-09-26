import { useCallback, useEffect, useState } from 'react'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../lib/supabase'
import { useLanguage } from '../i18n/LanguageContext'
import { Avatar } from './Avatar'
import { LoupCoinIcon } from './LoupCoinIcon'
import { Button, ConfirmDialog, ErrorText, Modal } from './ui'
import { notifyAvatarChanged, useMyAvatarConfig } from './AvatarEditor'
import {
  ARTIFACT_CATEGORIES,
  ArtifactIcon,
  CATEGORY_FILTER_LABEL_KEYS,
  CategoryChip,
  type ArtifactCategory,
  type StoreArtifact,
} from '../pages/LoupStore'
import { DEFAULT_AVATAR_CONFIG, type AvatarConfig } from '../lib/avatarParts'
import { RARITY_STYLE, SKIN_CATEGORIES, type SkinCategory, type StoreSkin } from '../lib/skins'
import type { TranslationKey } from '../i18n/translations'

const SKIN_CATEGORY_LABEL: Record<SkinCategory, TranslationKey> = {
  tenues: 'hub.skins.cat.tenues',
  coiffures: 'hub.skins.cat.coiffures',
  chapeaux: 'hub.skins.cat.chapeaux',
  packs: 'hub.skins.cat.packs',
}

/** Artefacts du Loup Store, en grille compacte (mobile d'abord). Mêmes
 * fonctions serveur et mêmes règles que la page Loup Store (get_store_artifacts,
 * purchase_artifact) : rien de nouveau côté achat. */
export function ArtifactsPanel({ balance, onPurchased }: { balance: number; onPurchased: () => void }) {
  const { t, lang } = useLanguage()
  const [artifacts, setArtifacts] = useState<StoreArtifact[] | null>(null)
  const [filter, setFilter] = useState<ArtifactCategory | 'all'>('all')
  const [detail, setDetail] = useState<StoreArtifact | null>(null)
  const [confirm, setConfirm] = useState<StoreArtifact | null>(null)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    const { data, error: rpcError } = await supabase.rpc('get_store_artifacts')
    if (!rpcError) setArtifacts(data as StoreArtifact[])
  }, [])
  useEffect(() => {
    void load()
  }, [load])

  async function purchase() {
    if (!confirm) return
    const target = confirm
    setConfirm(null)
    const { error: rpcError } = await supabase.rpc('purchase_artifact', { p_artifact_id: target.id })
    if (rpcError) {
      setError(rpcError.message)
      return
    }
    setError(null)
    setDetail(null)
    onPurchased()
    void load()
  }

  if (artifacts === null) return <div className="h-24 animate-pulse rounded-xl bg-night-900/40" />
  if (artifacts.length === 0) return <p className="text-sm text-moon-200/50">{t('loupStore.boutique.empty')}</p>

  const name = (a: StoreArtifact) => (lang === 'en' ? a.name_en : a.name_fr)

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap gap-2">
        <CategoryChip active={filter === 'all'} label={t('loupStore.filter.all')} onClick={() => setFilter('all')} />
        {ARTIFACT_CATEGORIES.filter((c) => artifacts.some((a) => a.category === c)).map((c) => (
          <CategoryChip key={c} active={filter === c} label={t(CATEGORY_FILTER_LABEL_KEYS[c])} onClick={() => setFilter(c)} />
        ))}
      </div>
      <ErrorText>{error}</ErrorText>
      <div className="grid grid-cols-3 gap-2">
        {artifacts
          .filter((a) => filter === 'all' || a.category === filter)
          .map((a) => (
            <button
              key={a.id}
              type="button"
              onClick={() => setDetail(a)}
              className="flex flex-col items-center gap-1 rounded-xl border border-night-600/60 bg-night-900/40 p-2 text-center transition-colors hover:border-amber-400/40"
            >
              <div className="relative">
                <ArtifactIcon artifact={a} size="h-12 w-12" />
                {a.max_stock === null && a.owned && (
                  <span className="absolute inset-0 flex items-center justify-center rounded-2xl bg-night-950/70 text-[9px] font-semibold uppercase tracking-wide text-emerald-400">
                    {t('loupStore.boutique.owned')}
                  </span>
                )}
                {a.max_stock !== null && a.quantity > 0 && (
                  <span className="absolute -right-1.5 -top-1.5 flex h-5 min-w-5 items-center justify-center rounded-full border-2 border-night-900 bg-amber-400 px-1 text-[10px] font-bold text-night-950">
                    {a.quantity}
                  </span>
                )}
              </div>
              <p className="line-clamp-2 text-[11px] font-semibold leading-tight text-moon-200">{name(a)}</p>
              <span className="flex items-center gap-1 text-[10px] font-semibold text-amber-300">
                <LoupCoinIcon className="h-2.5 w-2.5" /> {a.price_coins}
              </span>
            </button>
          ))}
      </div>

      {detail && (
        <Modal open onClose={() => setDetail(null)} title={name(detail)}>
          <div className="flex flex-col items-center gap-3 text-center">
            <ArtifactIcon artifact={detail} size="h-20 w-20" />
            <p className="text-sm text-moon-200/70">{lang === 'en' ? detail.description_en : detail.description_fr}</p>
            <span className="flex items-center gap-1.5 font-display text-xl font-semibold text-amber-300">
              <LoupCoinIcon className="h-5 w-5" /> {detail.price_coins}
            </span>
            {detail.max_stock !== null && (
              <p className="text-xs text-moon-200/50">{t('loupStore.boutique.stock', { quantity: detail.quantity, max: detail.max_stock })}</p>
            )}
            <div className="mt-1 flex w-full gap-3">
              <Button variant="ghost" className="flex-1" onClick={() => setDetail(null)}>
                {t('common.back')}
              </Button>
              {detail.max_stock === null && detail.owned ? (
                <Button className="flex-1" disabled>
                  {t('loupStore.boutique.owned')}
                </Button>
              ) : (
                <Button className="flex-1" disabled={!detail.can_purchase || balance < detail.price_coins} onClick={() => setConfirm(detail)}>
                  {detail.owned ? t('loupStore.boutique.buyMore') : t('loupStore.boutique.buy')}
                </Button>
              )}
            </div>
            {balance < detail.price_coins && (
              <p className="text-[11px] text-blood-400">{t('hub.missing', { coins: detail.price_coins - balance })}</p>
            )}
            {detail.owned && detail.max_stock !== null && !detail.can_purchase && (
              <p className="text-[11px] text-moon-200/40">{t('loupStore.boutique.onCooldown')}</p>
            )}
          </div>
        </Modal>
      )}
      <ConfirmDialog
        open={!!confirm}
        title={t('loupStore.boutique.confirmTitle')}
        message={t('loupStore.boutique.confirmMessage', { name: confirm ? name(confirm) : '', price: confirm?.price_coins ?? 0 })}
        confirmLabel={t('loupStore.boutique.buy')}
        cancelLabel={t('common.cancel')}
        onCancel={() => setConfirm(null)}
        onConfirm={purchase}
      />
    </div>
  )
}

/** Skins : lots de pièces d'avatar achetés avec des Loup Coins (migration
 * 0195). Posséder un skin débloque ses pièces dans l'éditeur ; « Équiper »
 * l'applique directement à l'avatar. */
export function SkinsPanel({ balance, onPurchased }: { balance: number; onPurchased: () => void }) {
  const { t, lang } = useLanguage()
  const { refreshProfile } = useAuth()
  const myAvatar = useMyAvatarConfig()
  const [skins, setSkins] = useState<StoreSkin[] | null>(null)
  const [filter, setFilter] = useState<SkinCategory | 'all'>('all')
  const [detail, setDetail] = useState<StoreSkin | null>(null)
  const [confirm, setConfirm] = useState<StoreSkin | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [toast, setToast] = useState<string | null>(null)

  const load = useCallback(async () => {
    const { data, error: rpcError } = await supabase.rpc('list_store_skins')
    // Liste vide plutôt que squelette sans fin si la fonction n'existe pas encore en base.
    setSkins(rpcError ? [] : (data as StoreSkin[]))
  }, [])
  useEffect(() => {
    void load()
  }, [load])

  const base: AvatarConfig = myAvatar.config ?? DEFAULT_AVATAR_CONFIG
  const preview = (s: StoreSkin): AvatarConfig => ({ ...base, ...s.config })
  const name = (s: StoreSkin) => (lang === 'en' ? s.name_en : s.name_fr)
  const say = (message: string) => {
    setToast(message)
    setTimeout(() => setToast(null), 1800)
  }

  async function purchase() {
    if (!confirm) return
    const target = confirm
    setConfirm(null)
    setBusy(true)
    const { error: rpcError } = await supabase.rpc('purchase_skin', { p_skin_id: target.id })
    setBusy(false)
    if (rpcError) {
      setError(rpcError.message)
      return
    }
    setError(null)
    setDetail(null)
    say(t('hub.skins.bought'))
    onPurchased()
    void load()
  }

  async function equip(skin: StoreSkin) {
    setBusy(true)
    const { error: rpcError } = await supabase.rpc('equip_skin', { p_skin_id: skin.id })
    setBusy(false)
    if (rpcError) {
      setError(rpcError.message)
      return
    }
    setError(null)
    setDetail(null)
    say(t('hub.skins.equipDone'))
    notifyAvatarChanged()
    void refreshProfile()
  }

  if (skins === null) return <div className="h-24 animate-pulse rounded-xl bg-night-900/40" />
  if (skins.length === 0) return <p className="text-sm text-moon-200/50">{t('hub.empty')}</p>

  const categories = SKIN_CATEGORIES.filter((c) => skins.some((s) => s.category === c))

  return (
    <div className="flex flex-col gap-3">
      <p className="text-xs text-moon-200/50">{t('hub.skins.intro')}</p>
      <div className="flex flex-wrap gap-2">
        <CategoryChip active={filter === 'all'} label={t('loupStore.filter.all')} onClick={() => setFilter('all')} />
        {categories.map((c) => (
          <CategoryChip key={c} active={filter === c} label={t(SKIN_CATEGORY_LABEL[c])} onClick={() => setFilter(c)} />
        ))}
      </div>
      <ErrorText>{error}</ErrorText>
      <div className="grid grid-cols-3 gap-2">
        {skins
          .filter((s) => filter === 'all' || s.category === filter)
          .map((s) => {
            const r = RARITY_STYLE[s.rarity]
            return (
              <button
                key={s.id}
                type="button"
                onClick={() => setDetail(s)}
                className={`relative flex flex-col items-center gap-1 rounded-xl border-2 ${r.border} bg-night-900/40 px-1.5 pb-2 pt-2.5 text-center transition-colors hover:bg-night-800/50`}
              >
                <span className={`absolute left-1.5 top-1.5 h-2 w-2 rounded-full ${r.dot}`} aria-hidden="true" />
                <Avatar config={preview(s)} className="h-14 w-14 ring-1 ring-night-700" />
                <p className="line-clamp-1 w-full text-[11px] font-semibold text-moon-200">{name(s)}</p>
                {s.owned ? (
                  <span className="text-[10px] font-semibold text-emerald-400">{t('loupStore.boutique.owned')}</span>
                ) : (
                  <span className="flex items-center gap-1 text-[10px] font-semibold text-amber-300">
                    <LoupCoinIcon className="h-2.5 w-2.5" /> {s.price_coins}
                  </span>
                )}
              </button>
            )
          })}
      </div>

      {detail && (
        <Modal open onClose={() => setDetail(null)} title={name(detail)}>
          <div className="flex flex-col items-center gap-3 text-center">
            <span
              className={`rounded-full border px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider ${RARITY_STYLE[detail.rarity].border} ${RARITY_STYLE[detail.rarity].text}`}
            >
              {t(`hub.skins.rarity.${detail.rarity}` as TranslationKey)}
            </span>
            <Avatar config={preview(detail)} className="h-28 w-28 ring-2 ring-moon-400/60 ring-offset-2 ring-offset-night-900" />
            <p className="text-sm text-moon-200/70">{lang === 'en' ? detail.description_en : detail.description_fr}</p>
            {!detail.owned && (
              <span className="flex items-center gap-1.5 font-display text-xl font-semibold text-amber-300">
                <LoupCoinIcon className="h-5 w-5" /> {detail.price_coins}
              </span>
            )}
            <div className="mt-1 flex w-full gap-3">
              <Button variant="ghost" className="flex-1" onClick={() => setDetail(null)}>
                {t('common.back')}
              </Button>
              {detail.owned ? (
                <Button className="flex-1" disabled={busy} onClick={() => equip(detail)}>
                  {t('hub.skins.equip')}
                </Button>
              ) : (
                <Button className="flex-1" disabled={busy || balance < detail.price_coins} onClick={() => setConfirm(detail)}>
                  {t('loupStore.boutique.buy')}
                </Button>
              )}
            </div>
            {!detail.owned && balance < detail.price_coins && (
              <p className="text-[11px] text-blood-400">{t('hub.missing', { coins: detail.price_coins - balance })}</p>
            )}
          </div>
        </Modal>
      )}
      <ConfirmDialog
        open={!!confirm}
        title={t('loupStore.boutique.confirmTitle')}
        message={t('loupStore.boutique.confirmMessage', { name: confirm ? name(confirm) : '', price: confirm?.price_coins ?? 0 })}
        confirmLabel={t('loupStore.boutique.buy')}
        cancelLabel={t('common.cancel')}
        onCancel={() => setConfirm(null)}
        onConfirm={purchase}
      />
      {toast && (
        <div className="pointer-events-none fixed inset-x-0 top-4 z-[70] mx-auto w-fit max-w-[90%] rounded-full border border-emerald-500/40 bg-night-800 px-4 py-2 text-xs text-emerald-400 shadow-card">
          {toast}
        </div>
      )}
    </div>
  )
}
