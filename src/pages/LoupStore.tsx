import { useCallback, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useLanguage } from '../i18n/LanguageContext'
import { Button, Card, ConfirmDialog, ErrorText, Modal, Segmented } from '../components/ui'
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

// Catégories fermées (voir migration 0149, même contrainte côté serveur) —
// ordre d'affichage fixe, du plus "actionnable en partie" au plus "collection".
export const ARTIFACT_CATEGORIES = ['outils', 'rares', 'cosmetiques', 'fragments'] as const
export type ArtifactCategory = (typeof ARTIFACT_CATEGORIES)[number]

// Libellés COURTS pour les chips de filtre (pas la phrase complète utilisée
// côté admin, voir ARTIFACT_CATEGORY_LABELS) — plusieurs chips doivent
// pouvoir tenir sur une ligne qui passe à la ligne suivante si besoin.
export const CATEGORY_FILTER_LABEL_KEYS: Record<ArtifactCategory, TranslationKey> = {
  outils: 'loupStore.category.outils',
  rares: 'loupStore.category.rares',
  cosmetiques: 'loupStore.category.cosmetiques',
  fragments: 'loupStore.category.fragments',
}

export interface StoreArtifact {
  id: string
  category: ArtifactCategory
  image_path: string | null
  name_fr: string
  name_en: string
  description_fr: string
  description_en: string
  price_coins: number
  // Stock (catégorie "rares" uniquement, voir migration 0153) : max_stock
  // null = artefact classique (achat unique, `owned` seul suffit). Sinon,
  // `quantity` est le stock actuellement détenu et `can_purchase` tient déjà
  // compte du plafond ET du délai de rachat — jamais à recalculer côté
  // client.
  max_stock: number | null
  quantity: number
  owned: boolean
  can_purchase: boolean
}

interface MyArtifact {
  id: string
  name_fr: string
  name_en: string
  description_fr: string
  description_en: string
  category: ArtifactCategory
  image_path: string | null
  quantity: number
  max_stock: number | null
  // En HEURES depuis la migration 0173 (auparavant en jours).
  repurchase_cooldown_hours: number | null
  // Horodatage à partir duquel un rachat redevient possible — seulement pour
  // un artefact à stock (max_stock non nul), null sinon.
  next_purchase_at: string | null
}

/** URL publique d'une icône d'artefact (bucket "artifact-icons", migration
 * 0149) — même principe que les bannières d'événement/cartes de rôle :
 * seul le CHEMIN est stocké en base, l'URL publique se reconstruit ici. */
export function artifactImageUrl(path: string | null): string | null {
  if (!path) return null
  return supabase.storage.from('artifact-icons').getPublicUrl(path).data.publicUrl
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
 * ouverte en cliquant sur la ligne "Loup Coins" du menu compte (AccountMenu)
 * ou sur la carte de la page Statistiques. Première version volontairement
 * simple — solde, total gagné, historique des transactions — pensée pour
 * être complétée plus tard (une vraie boutique où dépenser les Loup Coins).
 * get_my_loup_coins() renvoie déjà total_spent et amount négatif possible
 * côté transactions pour ne pas avoir à retoucher le backend à ce moment-là.
 */
type LoupStoreTab = 'boutique' | 'mes_artefacts' | 'historique'

export default function LoupStore() {
  const navigate = useNavigate()
  const { t, lang } = useLanguage()
  const [tab, setTab] = useState<LoupStoreTab>('boutique')
  const [summary, setSummary] = useState<LoupCoinsSummary | null>(null)
  const [artifacts, setArtifacts] = useState<StoreArtifact[] | null>(null)
  const [myArtifacts, setMyArtifacts] = useState<MyArtifact[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [purchasing, setPurchasing] = useState<string | null>(null)
  const [categoryFilter, setCategoryFilter] = useState<ArtifactCategory | 'all'>('all')
  const [detailTarget, setDetailTarget] = useState<StoreArtifact | null>(null)
  const [confirmTarget, setConfirmTarget] = useState<StoreArtifact | null>(null)

  const load = useCallback(async () => {
    const [
      { data: coinsData, error: coinsError },
      { data: storeData, error: storeError },
      { data: myArtifactsData, error: myArtifactsError },
    ] = await Promise.all([
      supabase.rpc('get_my_loup_coins'),
      supabase.rpc('get_store_artifacts'),
      supabase.rpc('get_my_artifacts'),
    ])
    if (coinsError) setError(coinsError.message)
    else setSummary(coinsData as LoupCoinsSummary)
    if (!storeError) setArtifacts(storeData as StoreArtifact[])
    if (!myArtifactsError) setMyArtifacts(myArtifactsData as MyArtifact[])
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

            {/* Onglets plutôt qu'un empilement de 3 sections (retour
                utilisateur, même logique que le filtre par catégorie
                ci-dessous) : Boutique/Mes Artefacts/Historique sont trois
                usages bien distincts, pas besoin de tout garder visible en
                même temps. */}
            <Segmented
              tabs={[
                { id: 'boutique', label: t('loupStore.tabs.boutique') },
                { id: 'mes_artefacts', label: t('loupStore.tabs.myArtifacts') },
                { id: 'historique', label: t('loupStore.tabs.history') },
              ]}
              active={tab}
              onChange={setTab}
            />

            {tab === 'boutique' && (
              <Card>
                <h2 className="mb-1 font-display text-lg text-moon-200">{t('loupStore.boutique.title')}</h2>
                <p className="mb-4 text-sm text-moon-200/50">{t('loupStore.boutique.subtitle')}</p>
                {!artifacts || artifacts.length === 0 ? (
                  <p className="text-sm text-moon-200/50">{t('loupStore.boutique.empty')}</p>
                ) : (
                  <>
                    {/* Filtre par catégorie plutôt qu'un empilement de toutes
                        les catégories à la fois (retour utilisateur : ça
                        prenait trop de place à l'écran) — "Tout" mélange tout
                        le catalogue dans une seule grille, une catégorie
                        précise réduit à sa seule sous-liste. Chips qui
                        passent à la ligne (pas Segmented, qui écraserait des
                        libellés déjà courts mais nombreux) : n'affiche que les
                        catégories qui contiennent réellement un artefact actif. */}
                    <div className="mb-3 flex flex-wrap gap-2">
                      <CategoryChip
                        active={categoryFilter === 'all'}
                        label={t('loupStore.filter.all')}
                        onClick={() => setCategoryFilter('all')}
                      />
                      {ARTIFACT_CATEGORIES.filter((cat) => artifacts.some((a) => a.category === cat)).map((cat) => (
                        <CategoryChip
                          key={cat}
                          active={categoryFilter === cat}
                          label={t(CATEGORY_FILTER_LABEL_KEYS[cat])}
                          onClick={() => setCategoryFilter(cat)}
                        />
                      ))}
                    </div>
                    <div className="grid grid-cols-3 gap-3 sm:grid-cols-4">
                      {artifacts
                        .filter((a) => categoryFilter === 'all' || a.category === categoryFilter)
                        .map((a) => (
                          <ArtifactCard key={a.id} artifact={a} onClick={() => setDetailTarget(a)} />
                        ))}
                    </div>
                  </>
                )}
              </Card>
            )}

            {tab === 'mes_artefacts' && (
              <Card>
                <h2 className="mb-1 font-display text-lg text-moon-200">{t('loupStore.myArtifacts.title')}</h2>
                <p className="mb-4 text-sm text-moon-200/50">{t('loupStore.myArtifacts.subtitle')}</p>
                {!myArtifacts || myArtifacts.length === 0 ? (
                  <p className="text-sm text-moon-200/50">{t('loupStore.myArtifacts.empty')}</p>
                ) : (
                  <ul className="flex flex-col gap-2">
                    {myArtifacts.map((a) => (
                      <MyArtifactRow key={a.id} artifact={a} />
                    ))}
                  </ul>
                )}
              </Card>
            )}

            {tab === 'historique' && (
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
            )}
          </>
        )}
      </div>

      {/* Aperçu détaillé : nom, description complète, prix, et les deux
          actions demandées (Acheter / Retour) — la confirmation d'achat
          elle-même reste un second temps (ConfirmDialog ci-dessous), pas
          fusionnée ici, pour qu'un achat ne parte jamais d'un simple clic. */}
      {detailTarget && (
        <Modal open={!!detailTarget} onClose={() => setDetailTarget(null)} title={lang === 'en' ? detailTarget.name_en : detailTarget.name_fr}>
          <div className="flex flex-col items-center gap-3 text-center">
            <ArtifactIcon artifact={detailTarget} size="h-24 w-24" />
            <p className="text-sm text-moon-200/70">
              {lang === 'en' ? detailTarget.description_en : detailTarget.description_fr}
            </p>
            <span className="flex items-center gap-1.5 font-display text-xl font-semibold text-amber-300">
              <LoupCoinIcon className="h-5 w-5" /> {detailTarget.price_coins}
            </span>
            {/* Stock (catégorie "rares" uniquement) : affiché ici même si le
                joueur ne peut pas encore racheter — sinon "Possédé" seul
                laisserait croire à tort qu'un rachat n'est jamais possible. */}
            {detailTarget.max_stock !== null && (
              <p className="text-xs text-moon-200/50">
                {t('loupStore.boutique.stock', { quantity: detailTarget.quantity, max: detailTarget.max_stock })}
              </p>
            )}
            <div className="mt-2 flex w-full gap-3">
              <Button variant="ghost" className="flex-1" onClick={() => setDetailTarget(null)}>
                {t('common.back')}
              </Button>
              {detailTarget.max_stock === null && detailTarget.owned ? (
                <Button className="flex-1" disabled>
                  {t('loupStore.boutique.owned')}
                </Button>
              ) : (
                <Button
                  className="flex-1"
                  disabled={!detailTarget.can_purchase || !summary || summary.balance < detailTarget.price_coins}
                  onClick={() => {
                    setConfirmTarget(detailTarget)
                    setDetailTarget(null)
                  }}
                >
                  {detailTarget.owned ? t('loupStore.boutique.buyMore') : t('loupStore.boutique.buy')}
                </Button>
              )}
            </div>
            {detailTarget.owned && detailTarget.max_stock !== null && !detailTarget.can_purchase && (
              <p className="text-[11px] text-moon-200/40">{t('loupStore.boutique.onCooldown')}</p>
            )}
          </div>
        </Modal>
      )}

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

/** Icône réelle de l'artefact (bucket "artifact-icons") avec repli propre
 * (pas d'emoji — demande explicite) tant que l'admin n'en a pas encore
 * mis une : un simple monogramme (première lettre du nom) sur fond neutre. */
export function ArtifactIcon({ artifact, size }: { artifact: StoreArtifact; size: string }) {
  const { lang } = useLanguage()
  const name = lang === 'en' ? artifact.name_en : artifact.name_fr
  const url = artifactImageUrl(artifact.image_path)
  return (
    <div className={`${size} shrink-0 overflow-hidden rounded-2xl border border-night-600/60 bg-night-800/60`}>
      {url ? (
        <img src={url} alt="" className="h-full w-full object-cover" />
      ) : (
        <div className="flex h-full w-full items-center justify-center font-display text-2xl text-moon-200/30">
          {name.charAt(0).toUpperCase()}
        </div>
      )}
    </div>
  )
}

/** Carte-icône d'un artefact dans la grille de la boutique — remplace
 * l'ancienne ligne de liste (demande explicite : représentation en icône,
 * pas un design linéaire). Le détail (description complète, achat) vit dans
 * la pop-up ouverte au clic, pas ici. */
function ArtifactCard({ artifact, onClick }: { artifact: StoreArtifact; onClick: () => void }) {
  const { t, lang } = useLanguage()
  const name = lang === 'en' ? artifact.name_en : artifact.name_fr
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex flex-col items-center gap-1.5 rounded-2xl border border-night-600/60 bg-night-900/40 p-3 text-center transition-colors hover:border-amber-400/40"
    >
      <div className="relative">
        <ArtifactIcon artifact={artifact} size="h-16 w-16" />
        {/* Classique (max_stock null) : overlay plein "Possédé" une fois
            acheté, plus rien à faire dessus. À stock : un petit badge de
            quantité en coin plutôt qu'un overlay plein — le joueur doit
            encore pouvoir cliquer pour éventuellement racheter. */}
        {artifact.max_stock === null && artifact.owned && (
          <span className="absolute inset-0 flex items-center justify-center rounded-2xl bg-night-950/70 text-[9px] font-semibold uppercase tracking-wide text-emerald-400">
            {t('loupStore.boutique.owned')}
          </span>
        )}
        {artifact.max_stock !== null && artifact.quantity > 0 && (
          <span className="absolute -right-1.5 -top-1.5 flex h-5 min-w-5 items-center justify-center rounded-full border-2 border-night-900 bg-amber-400 px-1 text-[10px] font-bold text-night-950">
            {artifact.quantity}
          </span>
        )}
      </div>
      <p className="line-clamp-2 text-xs font-semibold text-moon-200">{name}</p>
      <span className="flex items-center gap-1 text-[11px] font-semibold text-amber-300">
        <LoupCoinIcon className="h-3 w-3" /> {artifact.price_coins}
      </span>
    </button>
  )
}

/** Chip de filtre par catégorie — pilule qui passe à la ligne (flex-wrap sur
 * son conteneur), pas un Segmented à largeur égale : le nombre de catégories
 * varie selon ce qui est réellement en vente, pas de largeur fixe à prévoir. */
export function CategoryChip({ active, label, onClick }: { active: boolean; label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors ${
        active
          ? 'border-blood-500 bg-blood-600 text-[#fdf6e3]'
          : 'border-night-600/60 bg-night-900/40 text-moon-200/60 hover:border-moon-400/40 hover:text-moon-200'
      }`}
    >
      {label}
    </button>
  )
}

/** Une ligne de l'onglet "Mes Artefacts" : ce que le joueur possède, avec le
 * stock restant et la prochaine date de rachat pour un artefact à stock
 * (voir migration 0153). Informatif uniquement, pas cliquable — pour
 * racheter, direction l'onglet Boutique (aucun raccourci direct ici, pour
 * garder ce menu simple). */
function MyArtifactRow({ artifact }: { artifact: MyArtifact }) {
  const { t, lang } = useLanguage()
  const name = lang === 'en' ? artifact.name_en : artifact.name_fr
  const description = lang === 'en' ? artifact.description_en : artifact.description_fr
  const url = artifactImageUrl(artifact.image_path)
  const isStockBased = artifact.max_stock !== null
  const canBuyNow = isStockBased && artifact.next_purchase_at !== null && new Date(artifact.next_purchase_at) <= new Date()

  return (
    <li className="flex items-center gap-3 rounded-xl border border-night-600/60 bg-night-900/40 px-3 py-2.5">
      <div className="h-10 w-10 shrink-0 overflow-hidden rounded-xl border border-night-600/60 bg-night-800/60">
        {url ? (
          <img src={url} alt="" className="h-full w-full object-cover" />
        ) : (
          <div className="flex h-full w-full items-center justify-center font-display text-sm text-moon-200/30">
            {name.charAt(0).toUpperCase()}
          </div>
        )}
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold text-moon-200">{name}</p>
        <p className="truncate text-xs text-moon-200/50">{description}</p>
        {isStockBased && (
          <p className="mt-0.5 text-[11px] text-amber-300/80">
            {t('loupStore.myArtifacts.stock', { quantity: artifact.quantity, max: artifact.max_stock ?? 0 })}
            {artifact.quantity < (artifact.max_stock ?? 0) && artifact.next_purchase_at && (
              <>
                {' · '}
                {canBuyNow
                  ? t('loupStore.myArtifacts.canBuyNow')
                  : t('loupStore.myArtifacts.nextPurchase', {
                      // Retour utilisateur (migration 0173) : le délai est
                      // désormais en heures (plus seulement en jours entiers),
                      // donc une date seule ("21 sept.") ne suffit plus à
                      // situer "dans 2h" vs "dans 23h" — l'heure est
                      // maintenant toujours affichée avec la date.
                      date: new Date(artifact.next_purchase_at).toLocaleString(lang === 'fr' ? 'fr-FR' : 'en-US', {
                        day: 'numeric',
                        month: 'short',
                        hour: '2-digit',
                        minute: '2-digit',
                      }),
                    })}
              </>
            )}
          </p>
        )}
      </div>
    </li>
  )
}
