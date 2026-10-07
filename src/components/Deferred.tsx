import { useEffect, useRef, useState, type ReactNode } from 'react'

// Deux petits outils pour ne pas lancer, à l'ouverture d'un écran, des requêtes
// dont le joueur n'a pas besoin tout de suite : les composants enfants (donc
// leurs requêtes) ne sont montés que plus tard.

/** Monte `children` après `delay` ms — pour ce qui peut attendre que l'écran
 * soit affiché et que les requêtes urgentes soient parties. */
export function AfterIdle({ delay = 1500, children }: { delay?: number; children: ReactNode }) {
  const [ready, setReady] = useState(false)
  useEffect(() => {
    const id = setTimeout(() => setReady(true), delay)
    return () => clearTimeout(id)
  }, [delay])
  return ready ? <>{children}</> : null
}

/** Monte `children` seulement quand l'emplacement approche de l'écran
 * (`rootMargin` avant d'y arriver) : un bloc placé tout en bas de l'accueil ne
 * coûte rien à qui ne descend pas jusque-là. Garde la place (`minHeight`) pour
 * que la page ne saute pas. Sans IntersectionObserver, monte tout de suite. */
export function LazyMount({ children, minHeight = 160, rootMargin = '400px' }: { children: ReactNode; minHeight?: number; rootMargin?: string }) {
  const ref = useRef<HTMLDivElement>(null)
  const [visible, setVisible] = useState(typeof IntersectionObserver === 'undefined')
  useEffect(() => {
    if (visible) return
    const el = ref.current
    if (!el) return
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setVisible(true)
          observer.disconnect()
        }
      },
      { rootMargin }
    )
    observer.observe(el)
    return () => observer.disconnect()
  }, [visible, rootMargin])
  return visible ? <>{children}</> : <div ref={ref} style={{ minHeight }} aria-hidden="true" />
}
