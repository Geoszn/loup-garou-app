import { useEffect, useState } from 'react'
import { EventBanner } from './EventBanner'
import { Banner } from './Banner'
import type { GameEvent } from '../types/events'
import type { Banner as BannerData } from '../types/banners'

const CAROUSEL_FADE_MS = 400
// Repli si un élément n'a, par erreur, pas de durée définie — ne devrait
// jamais arriver (colonne NOT NULL côté serveur), gardé par sécurité.
const DEFAULT_HOLD_SECONDS = 6

type Slide = { key: string; holdSeconds: number; render: () => React.ReactNode }

/** Événements ET bannières partagent désormais le même emplacement de
 * défilement sur le tableau de bord (voir migration 0202, retour
 * utilisateur : "toutes les bannières là s'affichent ensemble sur
 * l'emplacement prévu et défilent") — un seul élément à la fois, avec sa
 * propre durée d'affichage réglée depuis le dashboard admin (display_seconds),
 * au lieu d'une constante fixe commune à tout le monde. Un seul événement
 * OU une seule bannière au total (cas le plus courant) : pas de points de
 * pagination, pas de minuterie, juste l'élément affiché. */
export function PromoCarousel({ events, banners, onExpire }: { events: GameEvent[]; banners: BannerData[]; onExpire?: () => void }) {
  const slides: Slide[] = [
    ...events.map((e) => ({
      key: `event-${e.id}`,
      holdSeconds: e.display_seconds || DEFAULT_HOLD_SECONDS,
      render: () => <EventBanner event={e} onExpire={onExpire} />,
    })),
    ...banners.map((b) => ({
      key: `banner-${b.id}`,
      holdSeconds: b.display_seconds || DEFAULT_HOLD_SECONDS,
      render: () => <Banner banner={b} />,
    })),
  ]

  const [index, setIndex] = useState(0)
  const [visible, setVisible] = useState(true)

  // Remet l'index à zéro si la liste change de taille (un élément qui vient
  // d'expirer et disparaît, par ex.) pour ne jamais pointer au-delà du
  // dernier élément disponible.
  useEffect(() => {
    setIndex(0)
  }, [slides.length])

  const currentHoldSeconds = slides[Math.min(index, slides.length - 1)]?.holdSeconds ?? DEFAULT_HOLD_SECONDS

  useEffect(() => {
    if (slides.length < 2) return
    let fadeTimeout: ReturnType<typeof setTimeout>
    const timeout = setTimeout(() => {
      setVisible(false)
      fadeTimeout = setTimeout(() => {
        setIndex((i) => (i + 1) % slides.length)
        setVisible(true)
      }, CAROUSEL_FADE_MS)
    }, currentHoldSeconds * 1000)
    return () => {
      clearTimeout(timeout)
      clearTimeout(fadeTimeout)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slides.length, index, currentHoldSeconds])

  if (slides.length === 0) return null
  const current = slides[Math.min(index, slides.length - 1)]

  return (
    <div className="mb-4">
      <div className="transition-opacity" style={{ opacity: visible ? 1 : 0, transitionDuration: `${CAROUSEL_FADE_MS}ms` }}>
        {/* EventBanner/Banner portent déjà mb-4 pour leur usage empilé
            d'origine — annulé ici (le wrapper ci-dessus le porte à sa place)
            pour ne pas doubler l'espace sous les points de pagination. */}
        <div className="[&>div]:mb-0 [&>button]:mb-0">{current.render()}</div>
      </div>
      {slides.length > 1 && (
        <div className="mt-2 flex justify-center gap-1.5">
          {slides.map((s, i) => (
            <button
              key={s.key}
              type="button"
              aria-label={`Élément ${i + 1}`}
              onClick={() => {
                setVisible(false)
                setTimeout(() => {
                  setIndex(i)
                  setVisible(true)
                }, CAROUSEL_FADE_MS)
              }}
              className={`h-1.5 rounded-full transition-all ${i === index ? 'w-5 bg-moon-400' : 'w-1.5 bg-moon-200/25'}`}
            />
          ))}
        </div>
      )}
    </div>
  )
}
