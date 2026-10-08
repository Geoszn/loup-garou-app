import { createPortal } from 'react-dom'
import { memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { useLanguage } from '../../i18n/LanguageContext'
import { COLOR_HEX, hutLevel, hutPips, type TribeInfo, type TribeMember, type TribeMessage } from '../../lib/tribe'
import { tierForPoints, tierLabel } from '../../lib/ranks'
import { supabase } from '../../lib/supabase'
import { Avatar } from '../Avatar'
import { Hut } from './HutArt'
import { PT, PX, Scenery, SceneLights, SceneObjects, WT, W, layoutFor, rng, worldHeight } from './VillageScene'
import { emblemIcon } from '../../lib/tribe'

const BUBBLE_MS = 75_000
const BUBBLE_POLL_MS = 15_000

/** Dernier message de chaque membre, pour les bulles au-dessus des cases. Lecture
 * légère (12 messages) toutes les 15 s tant que le village est visible : pas de
 * canal Realtime ouvert pour ça. */
function useVillageBubbles(tribeId: string): Record<string, { body: string; at: number }> {
  const [latest, setLatest] = useState<Record<string, { body: string; at: number }>>({})
  const [, setTick] = useState(0)
  const load = useCallback(async () => {
    const { data, error } = await supabase.rpc('get_tribe_messages', { p_before: null, p_limit: 12 })
    if (error || !Array.isArray(data)) return
    const next: Record<string, { body: string; at: number }> = {}
    for (const m of data as TribeMessage[]) {
      if (m.kind !== 'user' || !m.user_id || !m.body) continue
      const at = new Date(m.created_at).getTime()
      if (!next[m.user_id] || at > next[m.user_id].at) next[m.user_id] = { body: m.body, at }
    }
    setLatest(next)
  }, [])
  useEffect(() => {
    void load()
    const poll = setInterval(() => {
      if (document.visibilityState === 'visible') void load()
    }, BUBBLE_POLL_MS)
    // Les bulles s'effacent d'elles-mêmes quand le message vieillit.
    const tick = setInterval(() => setTick((n) => n + 1), 10_000)
    return () => {
      clearInterval(poll)
      clearInterval(tick)
    }
  }, [tribeId, load])
  const now = Date.now()
  return Object.fromEntries(Object.entries(latest).filter(([, v]) => now - v.at < BUBBLE_MS))
}

/**
 * Le village de la tribu vu en plan : chaque membre a sa case, rangée autour du
 * baobab et du feu de camp. Les cases apparaissent l'une après l'autre à
 * l'ouverture ; un nouveau membre voit sa case surgir avec des étincelles et son
 * nom brille un moment. Toucher une case la fait sauter, affiche une étiquette
 * flottante (nom, niveau, rang) et ouvre une barre d'actions sous le village ; la
 * dernière phrase écrite par un membre flotte au-dessus de sa case.
 */
export function VillageView({
  tribe,
  members,
  onlineIds,
  gameCodes,
  selfId,
  onProfile,
  onChat,
  onManage,
  onJoinGame,
}: {
  tribe: TribeInfo
  members: TribeMember[]
  onlineIds: Set<string>
  /** Membres actuellement en partie : id → code de la partie. */
  gameCodes: Record<string, string>
  selfId: string | undefined
  onProfile: (m: TribeMember) => void
  onChat: () => void
  onManage: (m: TribeMember) => void
  onJoinGame: (code: string) => void
}) {
  const { t } = useLanguage()
  const band = COLOR_HEX[tribe.color] ?? COLOR_HEX.amber
  const layout = useMemo(() => layoutFor(members.length), [members.length])
  const known = useRef<Set<string> | null>(null)
  const [fresh, setFresh] = useState<Set<string>>(new Set())
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const bubbles = useVillageBubbles(tribe.id)

  // Arrivées : au premier affichage tout le monde apparaît en cascade ; ensuite,
  // seuls les nouveaux venus reçoivent l'effet « bienvenue ».
  useEffect(() => {
    const ids = new Set(members.map((m) => m.user_id))
    if (known.current === null) {
      known.current = ids
      return
    }
    const added = new Set([...ids].filter((id) => !known.current!.has(id)))
    known.current = ids
    if (added.size === 0) return
    setFresh(added)
    const timer = setTimeout(() => setFresh(new Set()), 6000)
    return () => clearTimeout(timer)
  }, [members])

  const onlineCount = members.filter((m) => onlineIds.has(m.user_id)).length
  const selectedIndex = members.findIndex((m) => m.user_id === selectedId)
  const selected = selectedIndex >= 0 ? members[selectedIndex] : null
  const canManage = !!selected && selected.user_id !== selfId && (tribe.my_role === 'chef' || (tribe.my_role === 'sous_chef' && selected.role === 'membre'))
  const selectedGame = selected ? gameCodes[selected.user_id] : undefined

  // --- le monde : la scène + sa marge de ciel, positions en % ---------------
  const HT = worldHeight(layout.H)
  const fx = (x: number) => ((x + PX) / WT) * 100
  const fy = (y: number) => ((y + PT) / HT) * 100
  /** Largeur d'une case en % du monde, et sa hauteur (le dessin fait 50 × 58). */
  const hutWidth = (m: TribeMember) => layout.hutW * (m.role === 'chef' ? 1.2 : 1) * (W / WT)
  const hutHeight = (m: TribeMember) => hutWidth(m) * 1.16 * (WT / HT)
  /** Haut et bas (en %) d'une case, pour y accrocher bulle ou étiquette. */
  const hutTop = (i: number) => {
    const m = members[i]
    const h = hutHeight(m)
    const y = fy(layout.spots[i].y)
    return { top: y - 0.58 * h - (m.role === 'membre' ? 0 : 0.14 * h), bottom: y + 0.42 * h }
  }
  const clampX = (x: number) => Math.min(80, Math.max(20, fx(x)))

  // --- déplacement et zoom (un doigt fait glisser, deux doigts zooment) -----
  const viewportRef = useRef<HTMLDivElement>(null)
  const [vw, setVw] = useState(360)
  // Le village prend la hauteur de l'écran (moins l'en-tête, les onglets et la barre du bas).
  const [maxH, setMaxH] = useState(() => Math.min(760, Math.max(420, (typeof window === 'undefined' ? 800 : window.innerHeight) - 200)))
  /** Hauteur disponible : sur grand écran (village à côté du menu) tout ce qui reste sous l'en-tête ; sur téléphone, l'écran moins l'en-tête. */
  const computeMaxH = (el: HTMLElement) => {
    if (window.matchMedia('(min-width: 1024px)').matches) {
      const top = el.getBoundingClientRect().top + window.scrollY
      return Math.min(1000, Math.max(460, window.innerHeight - top - 120))
    }
    return Math.min(760, Math.max(420, window.innerHeight - 200))
  }
  const [view, setView] = useState({ z: 1, x: 0, y: 0 })
  const movedRef = useRef(false)
  const pointers = useRef(new Map<number, { x: number; y: number }>())
  const gesture = useRef<{ view: typeof view; x: number; y: number; dist: number } | null>(null)

  const vh = Math.min((vw * HT) / WT, maxH)
  const fitZoom = Math.min(1, vh / ((vw * HT) / WT))
  const MAX_ZOOM = 2.6
  const clampView = useCallback(
    (v: { z: number; x: number; y: number }) => {
      const z = Math.min(MAX_ZOOM, Math.max(fitZoom, v.z))
      const ww = vw * z
      const wh = ((vw * HT) / WT) * z
      const x = ww <= vw ? (vw - ww) / 2 : Math.min(0, Math.max(vw - ww, v.x))
      const y = wh <= vh ? (vh - wh) / 2 : Math.min(0, Math.max(vh - wh, v.y))
      return { z, x, y }
    },
    [vw, vh, HT, fitZoom],
  )
  /** Zoom autour d'un point du cadre (cx, cy). */
  const zoomAround = useCallback(
    (from: { z: number; x: number; y: number }, z: number, cx: number, cy: number) => {
      const nz = Math.min(MAX_ZOOM, Math.max(fitZoom, z))
      const k = nz / from.z
      return clampView({ z: nz, x: cx - (cx - from.x) * k, y: cy - (cy - from.y) * k })
    },
    [clampView, fitZoom],
  )

  useLayoutEffect(() => {
    const el = viewportRef.current
    if (!el) return
    const measure = () => {
      setVw(el.clientWidth || 360)
      setMaxH(computeMaxH(el))
    }
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    window.addEventListener('resize', measure)
    return () => {
      ro.disconnect()
      window.removeEventListener('resize', measure)
    }
  }, [])
  // Le village a changé de taille (nouveau palier d'anneaux) ou le cadre aussi : retour à la vue d'ensemble.
  useEffect(() => {
    setView(clampView({ z: fitZoom, x: 0, y: 0 }))
  }, [layout.H, vw, maxH, clampView, fitZoom])

  const zoomed = view.z > fitZoom + 0.01
  const canPan = view.z > 1.001 || (((vw * HT) / WT) * view.z > vh + 1)

  function localPoint(e: React.PointerEvent | PointerEvent) {
    const r = viewportRef.current!.getBoundingClientRect()
    return { x: e.clientX - r.left, y: e.clientY - r.top }
  }
  function beginGesture(v: typeof view) {
    const pts = [...pointers.current.values()]
    if (pts.length >= 2) {
      gesture.current = { view: v, x: (pts[0].x + pts[1].x) / 2, y: (pts[0].y + pts[1].y) / 2, dist: Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y) || 1 }
    } else if (pts.length === 1) {
      gesture.current = { view: v, x: pts[0].x, y: pts[0].y, dist: 0 }
    } else gesture.current = null
  }
  function onPointerDown(e: React.PointerEvent) {
    pointers.current.set(e.pointerId, localPoint(e))
    if (pointers.current.size === 1) movedRef.current = false
    if (pointers.current.size >= 2) movedRef.current = true
    beginGesture(view)
  }
  function onPointerMove(e: React.PointerEvent) {
    if (!pointers.current.has(e.pointerId) || !gesture.current) return
    pointers.current.set(e.pointerId, localPoint(e))
    const g = gesture.current
    const pts = [...pointers.current.values()]
    if (pts.length >= 2) {
      const dist = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y)
      const mx = (pts[0].x + pts[1].x) / 2
      const my = (pts[0].y + pts[1].y) / 2
      const z = g.view.z * (dist / g.dist)
      const next = zoomAround(g.view, z, g.x, g.y)
      setView(clampView({ ...next, x: next.x + (mx - g.x), y: next.y + (my - g.y) }))
      movedRef.current = true
    } else if (canPan) {
      const dx = pts[0].x - g.x
      const dy = pts[0].y - g.y
      if (!movedRef.current && Math.hypot(dx, dy) < 6) return
      movedRef.current = true
      setView(clampView({ z: g.view.z, x: g.view.x + dx, y: g.view.y + dy }))
    }
  }
  function onPointerUp(e: React.PointerEvent) {
    pointers.current.delete(e.pointerId)
    beginGesture(view)
  }
  // Pincer au pavé tactile / Ctrl + molette : zoom sur le curseur (sinon la page défile normalement).
  useEffect(() => {
    const el = viewportRef.current
    if (!el) return
    const onWheel = (e: WheelEvent) => {
      if (!e.ctrlKey && !e.metaKey) return
      e.preventDefault()
      const r = el.getBoundingClientRect()
      setView((v) => zoomAround(v, v.z * Math.exp(-e.deltaY * 0.01), e.clientX - r.left, e.clientY - r.top))
    }
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => el.removeEventListener('wheel', onWheel)
  }, [zoomAround])
  const zoomBy = (k: number) => setView((v) => zoomAround(v, v.z * k, vw / 2, vh / 2))

  return (
    <div className="flex flex-col gap-2">
      <div
        ref={viewportRef}
        className="relative isolate -mx-4 select-none overflow-hidden sm:mx-0"
        style={{ height: vh, touchAction: canPan ? 'none' : 'pan-y' }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onClick={() => {
          if (!movedRef.current) setSelectedId(null)
        }}
      >
        <div className="absolute left-0 top-0" style={{ width: vw * view.z, height: ((vw * HT) / WT) * view.z, transform: `translate3d(${view.x}px, ${view.y}px, 0)` }}>
          <Scenery layout={layout} level={tribe.level ?? 1} emblem={emblemIcon(tribe.emblem)} color={band} />

          {/* lumière des portes : une flaque chaude sur le sol sous chaque case en ligne */}
          {members.map((m, i) => {
            const spot = layout.spots[i]
            if (!spot || !onlineIds.has(m.user_id)) return null
            return (
              <span
                key={m.user_id}
                aria-hidden="true"
                className="pointer-events-none absolute"
                style={{
                  left: `${fx(spot.x)}%`,
                  top: `${fy(spot.y) + hutHeight(m) * 0.2}%`,
                  width: `${hutWidth(m) * 2.5}%`,
                  aspectRatio: '2.2 / 1',
                  transform: 'translate(-50%, -50%)',
                  background: 'radial-gradient(ellipse at center, rgba(255,196,96,0.5), rgba(255,160,60,0) 68%)',
                  mixBlendMode: 'screen',
                }}
              />
            )
          })}

          {/* arbres, rochers, baobab, feu, décors et tanière : rangés par profondeur avec les cases */}
          <SceneObjects layout={layout} level={tribe.level ?? 1} emblem={emblemIcon(tribe.emblem)} color={band} />

          {/* lucioles */}
          {Array.from({ length: 9 }).map((_, k) => (
            <span
              key={k}
              aria-hidden="true"
              className="tribe-anim pointer-events-none absolute h-1 w-1 rounded-full bg-[#e6ff8a]"
              style={{ left: `${15 + ((k * 41 + 9) % 70)}%`, top: `${12 + ((k * 57 + 13) % 70)}%`, animation: `tribe-firefly ${5 + (k % 4)}s ease-in-out ${k * 0.7}s infinite` }}
            />
          ))}

          {members.map((m, i) => {
            const spot = layout.spots[i]
            if (!spot) return null
            const online = onlineIds.has(m.user_id)
            const isNew = fresh.has(m.user_id)
            const isSelected = m.user_id === selectedId
            const inGame = !!gameCodes[m.user_id]
            return (
              <button
                key={m.user_id}
                type="button"
                onClick={(e) => {
                  e.stopPropagation()
                  if (movedRef.current) return
                  setSelectedId(isSelected ? null : m.user_id)
                }}
                aria-label={m.username}
                aria-pressed={isSelected}
                className="group absolute flex -translate-x-1/2 -translate-y-[58%] flex-col items-center focus:outline-none"
                style={{ left: `${fx(spot.x)}%`, top: `${fy(spot.y)}%`, width: `${hutWidth(m)}%`, zIndex: Math.round(spot.y + 0.42 * (layout.hutW / 100) * W * (m.role === 'chef' ? 1.2 : 1) * 1.16) }}
              >
                <div className="tribe-house-in relative w-full transition-transform group-active:scale-95 group-focus-visible:ring-2 group-focus-visible:ring-moon-400" style={{ animationDelay: `${Math.min(i, 29) * 55}ms` }}>
                  {isSelected && <span aria-hidden="true" className="absolute inset-x-[-6%] bottom-[2%] h-[12%] rounded-[50%] border-2 border-amber-300/90 bg-amber-300/20" />}
                  <div className={isSelected ? 'tribe-anim' : undefined} style={isSelected ? { animation: 'tribe-hop 0.9s ease-in-out infinite' } : undefined}>
                    {isNew &&
                      [0, 1, 2, 3, 4].map((sp) => (
                        <span key={sp} aria-hidden="true" className="tribe-anim pointer-events-none absolute top-1/3 text-xs" style={{ left: `${10 + sp * 18}%`, animation: `tribe-spark 1.6s ease-out ${sp * 0.18}s infinite` }}>
                          ✨
                        </span>
                      ))}
                    <Hut band={band} online={online} role={m.role} level={hutLevel(m.rank_points)} pips={hutPips(m.rank_points)} />
                    <Avatar
                      config={m.avatar_config}
                      icon={m.avatar_icon}
                      name={m.username}
                      className={`absolute left-1/2 top-[63%] h-[34%] w-[34%] -translate-x-1/2 -translate-y-1/2 ring-[1.5px] ${online ? 'ring-emerald-400' : 'ring-night-950'}`}
                    />
                    {m.muted && (
                      <span className="absolute right-0 top-[42%] text-[9px]" aria-hidden="true">
                        🔇
                      </span>
                    )}
                    {inGame && (
                      <span className="absolute -right-[10%] top-[18%] flex h-[26%] w-[26%] min-h-3.5 min-w-3.5 items-center justify-center rounded-full bg-night-950/85 text-[9px] ring-1 ring-moon-300/60" aria-hidden="true">
                        🎮
                      </span>
                    )}
                  </div>
                </div>
              </button>
            )
          })}

          <SceneLights layout={layout} level={tribe.level ?? 1} emblem={emblemIcon(tribe.emblem)} color={band} />

          {/* noms : couche au-dessus de toutes les cases, pour qu'une case ne cache jamais le nom de sa voisine */}
          {members.map((m, i) => {
            const spot = layout.spots[i]
            if (!spot) return null
            const isNew = fresh.has(m.user_id)
            return (
              <span
                key={m.user_id}
                className="pointer-events-none absolute flex -translate-x-1/2 justify-center"
                style={{ left: `${fx(spot.x)}%`, top: `${fy(spot.y) + 0.487 * hutWidth(m) * (WT / HT)}%`, zIndex: 1000 }}
              >
                <span
                  className={`flex max-w-[74px] items-center gap-0.5 whitespace-nowrap rounded px-1 text-[10px] font-semibold leading-4 [text-shadow:0_1px_2px_rgba(0,0,0,0.95)] ${isNew ? 'tribe-anim bg-amber-300/25 text-amber-100' : 'text-moon-100'}`}
                  style={isNew ? { animation: 'tribe-welcome 1.6s ease-in-out infinite' } : undefined}
                >
                  <span className="truncate">{m.username}</span>
                  {m.user_id === selfId && <span className="shrink-0 text-[8px] font-normal opacity-60">•</span>}
                </span>
              </span>
            )
          })}

          {/* bulles : la dernière phrase d'un membre flotte au-dessus de sa case */}
          {members.map((m, i) => {
            const bubble = bubbles[m.user_id]
            const spot = layout.spots[i]
            if (!bubble || !spot || m.user_id === selectedId) return null
            const { top } = hutTop(i)
            const text = bubble.body.length > 28 ? `${bubble.body.slice(0, 27)}…` : bubble.body
            return (
              <span
                key={m.user_id}
                className="pointer-events-none absolute w-max max-w-[118px]"
                style={{ left: `${clampX(spot.x)}%`, top: `${Math.max(top - 1.5, 2)}%`, zIndex: 1100, transform: 'translate(-50%, -100%)' }}
              >
                <span className="tribe-anim block rounded-lg bg-[#fdf6e3] px-1.5 py-1 text-[10px] font-medium leading-3 text-[#1a1020] shadow-md" style={{ animation: 'tribe-pop 0.35s ease-out both' }}>{text}</span>
                <span aria-hidden="true" className="mx-auto block h-0 w-0 border-x-4 border-t-4 border-x-transparent border-t-[#fdf6e3]" />
              </span>
            )
          })}

          {/* étiquette de la case touchée : nom, niveau et rang */}
          {selected &&
            (() => {
              const spot = layout.spots[selectedIndex]
              const { top, bottom } = hutTop(selectedIndex)
              const below = top < 14
              const tier = tierForPoints(selected.rank_points ?? 0)
              return (
                <span
                  className="pointer-events-none absolute w-max max-w-[220px]"
                  style={{ left: `${clampX(spot.x)}%`, top: `${below ? bottom + 4 : top}%`, zIndex: 1200, transform: below ? 'translate(-50%, 0)' : 'translate(-50%, -100%)' }}
                >
                  <span className="tribe-anim flex items-center gap-1.5 rounded-full border border-amber-300/60 bg-night-950/90 px-2.5 py-1 text-[11px] font-semibold text-moon-200 shadow-lg" style={{ animation: 'tribe-pop 0.25s ease-out both' }}>
                    <span className="max-w-[90px] truncate">{selected.user_id === selfId ? t('tribe.village.you') : selected.username}</span>
                    <span className="text-amber-300">{t('tribe.village.level', { n: hutLevel(selected.rank_points) })}</span>
                    <span className="text-moon-200/60">{tierLabel(tier.id, t)}</span>
                  </span>
                </span>
              )
            })()}
        </div>

        {/* zoom : + / − et retour à la vue d'ensemble */}
        <div className="absolute bottom-2 right-2 z-[1300] flex flex-col gap-1" onPointerDown={(e) => e.stopPropagation()} onClick={(e) => e.stopPropagation()}>
          <ZoomButton label={t('tribe.village.zoomIn')} disabled={view.z >= MAX_ZOOM - 0.01} onClick={() => zoomBy(1.4)}>
            +
          </ZoomButton>
          <ZoomButton label={t('tribe.village.zoomOut')} disabled={!zoomed} onClick={() => zoomBy(1 / 1.4)}>
            −
          </ZoomButton>
        </div>
      </div>

      {selected ? (
        <div className="flex min-h-11 flex-wrap items-center justify-center gap-1.5" onClick={(e) => e.stopPropagation()}>
          {selected.user_id !== selfId && (
            <ActionButton onClick={() => onProfile(selected)}>👤 {t('tribe.village.profile')}</ActionButton>
          )}
          <ActionButton onClick={onChat}>💬 {t('tribe.village.write')}</ActionButton>
          {selectedGame && selected.user_id !== selfId && (
            <ActionButton tone="go" onClick={() => onJoinGame(selectedGame)}>
              🎮 {t('tribe.village.joinGame')}
            </ActionButton>
          )}
          {canManage && <ActionButton onClick={() => onManage(selected)}>⚙️ {t('tribe.village.manage')}</ActionButton>}
          <ActionButton onClick={() => setSelectedId(null)} aria-label={t('tribe.village.close')}>
            ✕
          </ActionButton>
        </div>
      ) : (
        <p className="flex min-h-11 items-center justify-center text-center text-[11px] text-moon-200/50">
          {t('tribe.village.counter', { online: onlineCount, total: members.length })} · {t('tribe.village.hint')}
        </p>
      )}
    </div>
  )
}

function ZoomButton({ children, onClick, label, disabled }: { children: React.ReactNode; onClick: () => void; label: string; disabled?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      className="flex h-8 w-8 items-center justify-center rounded-full border border-white/20 bg-night-950/75 text-base font-bold leading-none text-moon-200 backdrop-blur-sm transition-opacity active:scale-95 disabled:opacity-35"
    >
      {children}
    </button>
  )
}

function ActionButton({ children, onClick, tone, ...rest }: { children: React.ReactNode; onClick: () => void; tone?: 'go'; 'aria-label'?: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      {...rest}
      className={`rounded-xl px-3 py-2 text-xs font-semibold transition-colors active:scale-95 ${tone === 'go' ? 'bg-emerald-600 text-white hover:bg-emerald-500' : 'border border-night-500 bg-night-900/60 text-moon-200 hover:bg-night-800'}`}
    >
      {children}
    </button>
  )
}

/** Le ciel de nuit du village : il remplit TOUTE la page (derrière l'en-tête, les
 * onglets et le village), pour que l'île flotte dans la page et non dans un cadre.
 * Posé à la racine du document pour ne dépendre d'aucun conteneur. */
export function VillageSky() {
  const stars = useMemo(() => {
    const r = rng(77)
    return Array.from({ length: 90 }, () => ({ x: r() * 100, y: r() * 100, s: 1 + r() * 1.8, o: 0.3 + r() * 0.6, d: r() * 5, big: r() > 0.9 }))
  }, [])
  if (typeof document === 'undefined') return null
  return createPortal(
    <div aria-hidden="true" className="pointer-events-none fixed inset-0 z-0 overflow-hidden" style={{ background: 'linear-gradient(180deg, #0a0922 0%, #181240 45%, #2a1c52 80%, #3a2560 100%)' }}>
      {stars.map((st, i) => (
        <span key={i} className="tribe-anim absolute rounded-full bg-white" style={{ left: `${st.x}%`, top: `${st.y}%`, width: st.s, height: st.s, opacity: st.o, boxShadow: st.big ? '0 0 6px 1px rgba(255,255,255,0.7)' : undefined, animation: `tribe-twinkle ${3 + (i % 4)}s ease-in-out ${st.d}s infinite` }} />
      ))}
      <div className="absolute right-[7%] h-11 w-11 rounded-full" style={{ top: 'calc(env(safe-area-inset-top, 0px) + 10px)', background: 'radial-gradient(circle at 38% 36%, #fffbe6, #f3e3a8 60%, #d8c27a)', boxShadow: '0 0 30px 8px rgba(255, 238, 170, 0.26)' }} />
    </div>,
    document.body,
  )
}
