import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { Button } from '../ui'

/** Taille de page de TOUTES les listes du côté administrateur. */
export const ADMIN_PAGE_SIZE = 10

/** Découpe une liste en pages de `pageSize` éléments. La page courante reste dans les bornes quand la liste rétrécit (filtre,
 * suppression) et revient à 1 quand `resetKey` change (nouveau filtre, nouvelle recherche). */
export function usePaged<T>(items: readonly T[] | null | undefined, resetKey: unknown = null, pageSize = ADMIN_PAGE_SIZE) {
  const [page, setPage] = useState(1)
  const total = items?.length ?? 0
  const totalPages = Math.max(1, Math.ceil(total / pageSize))
  useEffect(() => setPage(1), [resetKey])
  const current = Math.min(page, totalPages)
  const pageItems = useMemo(() => (items ?? []).slice((current - 1) * pageSize, current * pageSize), [items, current, pageSize])
  return { pageItems, page: current, setPage, total, totalPages, pageSize }
}

/** Barre de pagination : « 12 éléments · Page 1 / 2 » et deux boutons libellés. Rien à afficher tant que tout tient sur une page. */
export function Pager({
  page,
  totalPages,
  total,
  onPage,
  className = '',
}: {
  page: number
  totalPages: number
  total: number
  onPage: (page: number) => void
  className?: string
}) {
  if (totalPages <= 1) return null
  return (
    <div className={`flex items-center justify-between gap-3 text-xs text-moon-200/50 ${className}`}>
      <span>
        {total} élément{total > 1 ? 's' : ''} · Page {page} / {totalPages}
      </span>
      <div className="flex gap-2">
        <Button type="button" variant="ghost" className="px-3 py-1.5 text-xs" disabled={page <= 1} onClick={() => onPage(page - 1)}>
          ← Précédent
        </Button>
        <Button type="button" variant="ghost" className="px-3 py-1.5 text-xs" disabled={page >= totalPages} onClick={() => onPage(page + 1)}>
          Suivant →
        </Button>
      </div>
    </div>
  )
}

/** Liste paginée prête à l'emploi, pour les endroits où l'on ne peut pas appeler un hook (fenêtres de détail, rendu conditionnel).
 * `as` choisit la balise du conteneur (div ou ul) ; `className` est celui de l'ancien conteneur. */
export function PagedList<T>({
  items,
  render,
  as = 'div',
  className = '',
  resetKey = null,
}: {
  items: readonly T[]
  render: (item: T, index: number) => ReactNode
  as?: 'div' | 'ul'
  className?: string
  resetKey?: unknown
}) {
  const { pageItems, page, setPage, total, totalPages, pageSize } = usePaged(items, resetKey)
  const Tag = as
  return (
    <>
      <Tag className={className}>{pageItems.map((item, i) => render(item, (page - 1) * pageSize + i))}</Tag>
      <Pager page={page} totalPages={totalPages} total={total} onPage={setPage} className="mt-2" />
    </>
  )
}
