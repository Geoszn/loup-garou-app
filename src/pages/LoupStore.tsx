import { useCallback, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useLanguage } from '../i18n/LanguageContext'
import { Button, Card, ConfirmDialog, ErrorText } from '../components/ui'
import { FullScreenLoader } from '../components/FullScreenLoader'
import { LoupCoinIcon } from '../components/LoupCoinIcon'
import type { TranslationKey } from '../i18n/translations'

interface LoupCoinsTransaction {
  id: string
  amount: number
  reason: string
  label: string | null
  created_at: string
}

interface LoupCoinsSummary {
  balance: number
  total_earned: number
  total_spent: number
  transactions: LoupCoinsTransaction[]
}

interface StoreArtifact {
  id: string
  name_fr: string
  name_en: string
  description_fr: string
  description_en: string
  price_coins: number
  owned: boolean
}

// Libellé lisible par raison de transaction (voir migration 0147/0148) —
// reste ouvert : une future raison (nouvel effet du Store) s'ajoute ici sans
// casser l'affichage des transactions déjà enregistrées.
const REASON_LABELS: Record<string, TranslationKey> = {
  quest_reward: 'loupStore.reason.quest_reward',
  store_purchase: 'loupStore.reason.store_purchase',
}

/**
 * "Loup Store" : page dédiée au compte de Loup Coins (migration 0146/0147),
 * ouverte en cliquant sur le badge du tableau de bord (LoupCoinsBadge.tsx)
 * ou sur la carte de la page Statistiques. Première version volontairement
 * simple — solde, total gagné, historique des transactions — pensée pour
 * être complétée plus tard (une vraie boutique où dépenser les Loup Coins).
 * get_my_loup_coins() renvoie déjà total_spent et amount négatif possible
 * côté transactions pour ne pas avoir à retoucher le backend à ce moment-là.
 */
export default function LoupStore() {
  const navigate = useNavigate()
  const { t, lang } = useLanguage()
  const [summary, setSummary] = useState<LoupCoinsSummary | null>(null)
  const [artifacts, setArtifacts] = useState<StoreArtifact[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [purchasing, setPurchasing] = useState<string | null>(null)
  const [confirmTarget, setConfirmTarget] = useState<StoreArtifact | null>(null)

  const load = useCallback(async () => {
    const [{ data: coinsData, error: coinsError }, { data: storeData, error: storeError }] = await Promise.all([
      supabase.rpc('get_my_loup_coins'),
      supabase.rpc('get_store_artifacts'),
    ])
    if (coinsError) setError(coinsError.message)
    else setSummary(coinsData as LoupCoinsSummary)
    if (!storeError) setArtifacts(storeData as StoreArtifact[])
    setLoading(false)
  }, [])

  useEffect(() => {
    load()
  }, [load])

  async function confirmPurchase() {
    if (!confirmTarget) return
    setPurchasing(confirmTarget.id)
    const { error: rpcError } = await supabase.rpc('purchase_artifact', { p_artifact_id: confirmTarget.id })
    setPurchasing(null)
    setConfirmTarget(null)
    if (rpcError) {
      setError(rpcError.message)
      return
    }
    setError(null)
    load()
  }

  if (loading) return <FullScreenLoader />

  return (
    <div className="min-h-screen px-4 py-10">
      <div className="mx-auto flex max-w-2xl flex-col gap-6">
        <header className="flex items-center gap-3">
          <Button variant="ghost" onClick={() => navigate('/dashboard')} className="px-3.5 py-2 text-xs">
            {t('common.back')}
          </Button>
          <h1 className="font-display text-2xl text-moon-200">{t('loupStore.pageTitle')}</h1>
        </header>

        <p className="text-sm text-moon-200/60">{t('loupStore.subtitle')}</p>

        <ErrorText>{error}</ErrorText>

        {summary && (
          <>
            {/* Gestion du compte, en haut : solde bien visible, puis le
                total gagné (et le total dépensé seulement s'il y a déjà eu
                une dépense — toujours à 0 tant qu'il n'existe encore aucune
                façon de dépenser des Loup Coins). */}
            <Card className="text-center">
              <p className="text-[11px] uppercase tracking-wider text-moon-200/50">{t('loupStore.balance')}</p>
              <p className="mt-1 flex items-center justify-center gap-2 font-display text-4xl text-amber-300">
                <LoupCoinIcon className="h-9 w-9" /> {summary.balance}
              </p>

              <div className="mx-auto mt-5 grid max-w-xs grid-cols-1 gap-3 sm:grid-cols-2">
                <div className="rounded-2xl border border-night-600/60 bg-night-900/40 p-3">
                  <p className="text-[11px] uppercase tracking-wider text-moon-200/50">{t('loupStore.totalEarned')}</p>
                  <p className="mt-0.5 flex items-center justify-center gap-1 font-display text-lg text-moon-200">
                    <LoupCoinIcon className="h-4 w-4" /> {summary.total_earned}
                  </p>
                </div>
                {summary.total_spent > 0 && (
                  <div className="rounded-2xl border border-night-600/60 bg-night-900/40 p-3">
                    <p className="text-[11px] uppercase tracking-wider text-moon-200/50">{t('loupStore.totalSpent')}</p>
                    <p className="mt-0.5 flex items-center justify-center gap-1 font-display text-lg text-moon-200">
                      <LoupCoinIcon className="h-4 w-4" /> {summary.total_spent}
                    </p>
                  </div>
                )}
              </div>

              <p className="mt-5 text-xs text-moon-200/40">{t('loupStore.comingSoon')}</p>
            </Card>

            <Card>
              <h2 className="mb-1 font-display text-lg text-moon-200">{t('loupStore.boutique.title')}</h2>
              <p className="mb-4 text-sm text-moon-200/50">{t('loupStore.boutique.subtitle')}</p>
              {!artifacts || artifacts.length === 0 ? (
                <p className="text-sm text-moon-200/50">{t('loupStore.boutique.empty')}</p>
              ) : (
                <ul className="flex flex-col gap-2">
                  {artifacts.map((a) => {
                    const name = lang === 'en' ? a.name_en : a.name_fr
                    const description = lang === 'en' ? a.description_en : a.description_fr
                    const affordable = summary ? summary.balance >= a.price_coins : false
                    return (
                      <li
                        key={a.id}
                        className="flex flex-col gap-2 rounded-xl border border-night-600/60 bg-night-900/40 p-3.5 sm:flex-row sm:items-center sm:justify-between"
                      >
                        <div className="min-w-0">
                          <p className="text-sm font-semibold text-moon-200">{name}</p>
                          <p className="mt-0.5 text-xs text-moon-200/50">{description}</p>
                        </div>
                        <div className="flex shrink-0 items-center gap-3">
                          <span className="flex items-center gap-1 font-display text-sm font-semibold text-amber-300">
                            <LoupCoinIcon className="h-4 w-4" /> {a.price_coins}
                          </span>
                          {a.owned ? (
                            <span className="rounded-full bg-emerald-700/20 px-3 py-1.5 text-xs font-semibold text-emerald-400">
                              {t('loupStore.boutique.owned')}
                            </span>
                          ) : (
                            <Button
                              className="px-3.5 py-1.5 text-xs"
                              disabled={!affordable || purchasing === a.id}
                              onClick={() => setConfirmTarget(a)}
                            >
                              {t('loupStore.boutique.buy')}
                            </Button>
                          )}
                        </div>
                      </li>
                    )
                  })}
                </ul>
              )}
            </Card>

            <Card>
              <h2 className="mb-4 font-display text-lg text-moon-200">{t('loupStore.history.title')}</h2>
              {summary.transactions.length === 0 ? (
                <p className="text-sm text-moon-200/50">{t('loupStore.history.empty')}</p>
              ) : (
                <ul className="flex flex-col gap-2">
                  {summary.transactions.map((tx) => (
                    <li
                      key={tx.id}
                      className="flex items-center justify-between gap-3 rounded-xl border border-night-600/60 bg-night-900/40 px-4 py-2.5 text-sm"
                    >
                      <div className="flex min-w-0 flex-col">
                        <span className="truncate text-moon-200/90">
                          {tx.label || t(REASON_LABELS[tx.reason] ?? 'loupStore.transaction.fallbackLabel')}
                        </span>
                        <span className="text-xs text-moon-200/40">
                          {new Date(tx.created_at).toLocaleString(lang === 'fr' ? 'fr-FR' : 'en-US', {
                            day: 'numeric',
                            month: 'short',
                            hour: '2-digit',
                            minute: '2-digit',
                          })}
                        </span>
                      </div>
                      <span
                        className={`shrink-0 flex items-center gap-1 font-display font-semibold ${
                          tx.amount >= 0 ? 'text-emerald-400' : 'text-blood-400'
                        }`}
                      >
                        {tx.amount >= 0 ? '+' : ''}
                        {tx.amount} <LoupCoinIcon className="h-3.5 w-3.5" />
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          </>
        )}
      </div>

      <ConfirmDialog
        open={!!confirmTarget}
        title={t('loupStore.boutique.confirmTitle')}
        message={t('loupStore.boutique.confirmMessage', {
          name: confirmTarget ? (lang === 'en' ? confirmTarget.name_en : confirmTarget.name_fr) : '',
          price: confirmTarget?.price_coins ?? 0,
        })}
        confirmLabel={t('loupStore.boutique.buy')}
        cancelLabel={t('common.cancel')}
        onCancel={() => setConfirmTarget(null)}
        onConfirm={confirmPurchase}
      />
    </div>
  )
}
