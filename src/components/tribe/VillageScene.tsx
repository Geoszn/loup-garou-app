import { memo, useMemo, type ReactNode } from 'react'
import { TribeDecor, decorSprites } from './VillageDecor'

// ---------------------------------------------------------------------------
// La scène de l'île : le terrain (sol, chemins, mare, forêt des loups…) est un seul dessin
// de fond ; tout ce qui se dresse dessus (arbres, rochers, baobab, feu, décors, cases) est un
// petit dessin à part, rangé par PROFONDEUR (plus il est bas dans l'image, plus il est devant).
// Résultat : un arbre devant une case en cache une partie, le baobab cache ce qui est
// derrière lui, etc. Les cases sont placées par VillageView avec la même règle.
//
// Géométrie : la scène fait W de large ; le haut est la forêt des loups (aucune habitation),
// le village (baobab, feu, cases en anneaux) occupe le reste.
// ---------------------------------------------------------------------------
export const W = 360
export const PX = 34
export const PT = 54
export const PB = 44
export const WT = W + 2 * PX
/** Hauteur de la forêt des loups, au nord de l'île. */
export const FOREST = 118
export const worldHeight = (H: number) => H + PT + PB

export interface Spot {
  x: number
  y: number
}
export interface Layout {
  hutW: number
  /** Hauteur totale de la scène (forêt + village). */
  H: number
  cx: number
  cy: number
  rings: { rx: number; ry: number }[]
  spots: Spot[]
}

/** Générateur pseudo-aléatoire déterministe : le décor ne bouge pas d'un affichage à l'autre. */
export function rng(seed: number) {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

export function layoutFor(n: number): Layout {
  const ringCount = n <= 6 ? 1 : n <= 18 ? 2 : 3
  const Hv = ringCount === 1 ? 330 : ringCount === 2 ? 450 : 620
  const H = Hv + FOREST
  const cx = W / 2
  const cy = FOREST + Hv / 2
  const rings =
    ringCount === 1
      ? [{ rx: 90, ry: 108 }]
      : ringCount === 2
        ? [{ rx: 86, ry: 110 }, { rx: 128, ry: Hv / 2 - 58 }]
        : [{ rx: 86, ry: 116 }, { rx: 122, ry: 178 }, { rx: 156, ry: Hv / 2 - 52 }]
  const counts = ringCount === 1 ? [n] : ringCount === 2 ? [6, n - 6] : [6, 12, n - 18]
  const jitter = rng(n * 7 + 3)
  const spots: Spot[] = []
  counts.forEach((m, k) => {
    // Aucune case pile au-dessus du baobab : on décale le premier anneau pour qu'on voie sa cime.
    const phase = k === 0 ? (ringCount === 1 ? Math.PI / Math.max(m, 1) : Math.PI / 6) : k === 1 ? Math.PI / m : 0.4
    for (let j = 0; j < m; j++) {
      const a = -Math.PI / 2 + phase + (2 * Math.PI * j) / m
      spots.push({
        x: cx + rings[k].rx * Math.cos(a) + (jitter() - 0.5) * 6,
        y: cy + rings[k].ry * Math.sin(a) + (jitter() - 0.5) * 6,
      })
    }
  })
  return { H, cx, cy, rings, spots, hutW: ringCount === 1 ? 14 : ringCount === 2 ? 13 : 11.6 }
}

/** Contour lissé (Catmull-Rom → Bézier) d'une boucle fermée, décalé de dy. */
export function blobPath(pts: Spot[], dy: number): string {
  const n = pts.length
  const P = (i: number) => pts[(i + n) % n]
  let d = `M${P(0).x.toFixed(1)} ${(P(0).y + dy).toFixed(1)}`
  for (let i = 0; i < n; i++) {
    const p0 = P(i - 1)
    const p1 = P(i)
    const p2 = P(i + 1)
    const p3 = P(i + 2)
    const c1 = { x: p1.x + (p2.x - p0.x) / 6, y: p1.y + (p2.y - p0.y) / 6 + dy }
    const c2 = { x: p2.x - (p3.x - p1.x) / 6, y: p2.y - (p3.y - p1.y) / 6 + dy }
    d += `C${c1.x.toFixed(1)} ${c1.y.toFixed(1)} ${c2.x.toFixed(1)} ${c2.y.toFixed(1)} ${p2.x.toFixed(1)} ${(p2.y + dy).toFixed(1)}`
  }
  return d + 'Z'
}

/** Courbe lissée qui passe par des points (chemin ouvert). */
function openPath(pts: Spot[]): string {
  const n = pts.length
  const P = (i: number) => pts[Math.max(0, Math.min(n - 1, i))]
  let d = `M${P(0).x.toFixed(1)} ${P(0).y.toFixed(1)}`
  for (let i = 0; i < n - 1; i++) {
    const p0 = P(i - 1)
    const p1 = P(i)
    const p2 = P(i + 1)
    const p3 = P(i + 2)
    d += `C${(p1.x + (p2.x - p0.x) / 6).toFixed(1)} ${(p1.y + (p2.y - p0.y) / 6).toFixed(1)} ${(p2.x - (p3.x - p1.x) / 6).toFixed(1)} ${(p2.y - (p3.y - p1.y) / 6).toFixed(1)} ${p2.x.toFixed(1)} ${p2.y.toFixed(1)}`
  }
  return d
}

/** Le centre, les rayons de l'île et la position de la mare : partagés par le fond et les objets. */
function geometry(layout: Layout) {
  const { H, cx, cy } = layout
  const A = W / 2 + PX - 8
  const ic = H / 2
  const B = H / 2 + 8
  const Bv = (H - FOREST) / 2 + 10
  const pond = { x: cx - 0.52 * A, y: cy + 0.62 * Bv }
  const cave = { x: cx - 40, y: 70 }
  const onIsland = (x: number, y: number, k: number) => ((x - cx) / A) ** 2 + ((y - ic) / B) ** 2 < k
  return { A, B, ic, pond, cave, onIsland }
}

// ---------------------------------------------------------------------------
// Dessins des objets (origine = point d'appui au sol)
// ---------------------------------------------------------------------------
function Broadleaf({ s, tone }: { s: number; tone: number }) {
  const dark = ['#123a28', '#163f2c', '#0f3424'][tone % 3]
  const mid = ['#1b5e3c', '#246e46', '#185636'][tone % 3]
  const light = ['#33865a', '#3f9663', '#2d7c52'][tone % 3]
  return (
    <g transform={`scale(${s})`}>
      <ellipse cx="-2.4" cy="3" rx="10" ry="3" fill="#000" opacity=".3" />
      <rect x="-1.6" y="-5" width="3.2" height="9" fill="#4a2f1a" />
      <circle cx="0" cy="-13" r="10.5" fill={dark} />
      <circle cx="-3" cy="-15" r="7.8" fill={mid} />
      <circle cx="-4.6" cy="-17.6" r="3.5" fill={light} opacity=".85" />
      <circle cx="4.2" cy="-10" r="5.2" fill={mid} opacity=".92" />
    </g>
  )
}

/** Sapin sombre : la forêt des loups. */
function Pine({ s, tone }: { s: number; tone: number }) {
  const cols = [['#0d2c30', '#14424a', '#1f5a60'], ['#0e2a26', '#164239', '#235a4a'], ['#101f2c', '#183448', '#26506a']][tone % 3]
  return (
    <g transform={`scale(${s})`}>
      <ellipse cx="-2.4" cy="2.4" rx="8" ry="2.4" fill="#000" opacity=".4" />
      <rect x="-1.4" y="-6" width="2.8" height="8" fill="#2c1c12" />
      <path d="M0 -46L-10 -22h20z" fill={cols[0]} />
      <path d="M0 -36L-12.5 -12h25z" fill={cols[1]} />
      <path d="M0 -25L-15 -3h30z" fill={cols[0]} />
      <path d="M0 -46L-4.4 -30 0 -26z" fill={cols[2]} opacity=".75" />
      <path d="M0 -36L-6 -21 0 -16z" fill={cols[2]} opacity=".6" />
      <path d="M0 -25L-7.4 -10 0 -5z" fill={cols[2]} opacity=".5" />
    </g>
  )
}

function Rock({ s, v }: { s: number; v: number }) {
  const base = [['#8c8a92', '#b3b1ba', '#5c5a64'], ['#7d7e86', '#a4a6ae', '#52535c'], ['#928a80', '#bab2a6', '#625a50']][v % 3]
  return (
    <g transform={`scale(${s})`}>
      <ellipse cx="-2.4" cy="2.2" rx="13" ry="3.4" fill="#000" opacity=".35" />
      <path d="M-12 1.6L-10 -8 -3 -13 5 -12 11 -6 12.5 1.6z" fill={base[0]} stroke="#2b2a30" strokeWidth=".9" strokeLinejoin="round" />
      <path d="M-10 -8L-3 -13 -1 -7 -7 -3z" fill={base[1]} opacity=".9" />
      <path d="M5 -12L11 -6 12.5 1.6 4 1.6 2 -5z" fill={base[2]} opacity=".75" />
      <path d="M-7 -3L-1 -7 2 -5 4 1.6 -9 1.6z" fill={base[0]} />
      {v % 2 === 0 && <ellipse cx="-4" cy="-10.6" rx="4" ry="1.6" fill="#4a7a3a" opacity=".8" />}
    </g>
  )
}

/** Entrée de la tanière : un amas de roches, une ouverture sombre et deux yeux qui brillent. */
function Cave() {
  return (
    <g>
      <ellipse cx="-3" cy="2" rx="34" ry="6" fill="#000" opacity=".4" />
      <path d="M-32 2L-28 -16 -16 -30 0 -36 16 -31 28 -18 33 2z" fill="#54535c" stroke="#201f26" strokeWidth="1.3" strokeLinejoin="round" />
      <path d="M-28 -16L-16 -30 -8 -22 -18 -12z" fill="#7a7984" opacity=".9" />
      <path d="M16 -31L28 -18 33 2 22 2 18 -14z" fill="#3a3942" opacity=".85" />
      <path d="M-14 2L-13 -14Q0 -24 13 -14L14 2z" fill="#07060c" stroke="#16151c" strokeWidth="1" />
      <ellipse cx="-4.4" cy="-9" rx="1.9" ry="1.2" fill="#ffd36b" className="tribe-anim" style={{ animation: 'tribe-blink 5s ease-in-out infinite' }} />
      <ellipse cx="4.4" cy="-9" rx="1.9" ry="1.2" fill="#ffd36b" className="tribe-anim" style={{ animation: 'tribe-blink 5s ease-in-out infinite' }} />
      <ellipse cx="0" cy="-8" rx="14" ry="9" fill="#ffb347" opacity=".08" />
      <path d="M-30 -10c-3-5 0-9 4-9M31 -6c3-4 0-8-4-8" stroke="#4a7a3a" strokeWidth="2.4" strokeLinecap="round" fill="none" opacity=".8" />
    </g>
  )
}

/** Panneau planté à l'orée de la forêt des loups. */
function Sign() {
  return (
    <g>
      <ellipse cx="-2" cy="2" rx="7" ry="2" fill="#000" opacity=".35" />
      <rect x="-1" y="-22" width="2" height="24" fill="#5a3a22" stroke="#2b1a10" strokeWidth=".5" />
      <path d="M-9 -26h18v10h-18z" fill="#8a5a32" stroke="#2b1a10" strokeWidth=".8" strokeLinejoin="round" />
      <path d="M-9 -26h18v2.4h-18z" fill="#b5834e" opacity=".7" />
      <text x="0" y="-18" fontSize="7.6" textAnchor="middle">🐾</text>
    </g>
  )
}

function Baobab() {
  return (
    <g>
      <defs>
        <linearGradient id="vsTrunk" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#7a5a3a" />
          <stop offset=".5" stopColor="#9c7a52" />
          <stop offset="1" stopColor="#5c4129" />
        </linearGradient>
      </defs>
      <ellipse cx="-3" cy="24" rx="27" ry="7" fill="#000" opacity=".34" />
      <path d="M-21 24C-12 20-15 4-12 -8-10 -16-8 -22-6.5 -24h13C8 -22 10 -16 12 -8 15 4 12 20 21 24 10 30-10 30-21 24Z" fill="url(#vsTrunk)" stroke="#3a2614" strokeWidth="1.3" strokeLinejoin="round" />
      <path d="M-8 -6C-10 4-7 14-9 22M0 -12C1 0 0 12 1 23M8 -4C10 6 8 15 10 22" stroke="#5c4129" strokeWidth="1" fill="none" opacity=".7" />
      <path d="M-3 -24L-24 -36M0 -26L0 -42M3 -24L24 -36" stroke="#6a4c30" strokeWidth="3.6" strokeLinecap="round" />
      {[[-26, -40, 11], [-13, -50, 13], [7, -52, 14], [25, -41, 12], [0, -40, 11]].map(([x, y, r], i) => (
        <g key={i}>
          <circle cx={x} cy={y} r={r} fill="#174c30" />
          <circle cx={x - 2} cy={y - 2} r={r - 3} fill="#27703f" />
          <circle cx={x - 4} cy={y - 4} r={r / 3} fill="#4fa266" opacity=".8" />
        </g>
      ))}
      {[[-18, -30], [12, -32], [-4, -30]].map(([x, y], i) => (
        <ellipse key={i} cx={x} cy={y} rx="1.8" ry="3.4" fill="#7a5a34" />
      ))}
    </g>
  )
}

function Fire() {
  return (
    <g transform="scale(.8)">
      <defs>
        <radialGradient id="vsFire" cx="50%" cy="50%" r="50%">
          <stop offset="0" stopColor="#ffb54a" stopOpacity=".7" />
          <stop offset="1" stopColor="#ff7a2a" stopOpacity="0" />
        </radialGradient>
      </defs>
      <ellipse cx="0" cy="0" rx="30" ry="18" fill="url(#vsFire)" className="tribe-anim" style={{ animation: 'tribe-glow 2.2s ease-in-out infinite' }} />
      {[[-14, 4], [14, 4], [0, 9], [-9, -3], [9, -3]].map(([x, y], i) => (
        <ellipse key={i} cx={x} cy={y} rx="3.4" ry="2.2" fill="#8a8680" stroke="#3a3836" strokeWidth=".6" />
      ))}
      <path d="M-9 5l18-5M9 5l-18-5" stroke="#4a2f1a" strokeWidth="3.4" strokeLinecap="round" />
      <g className="tribe-anim" style={{ transformOrigin: '0px 2px', animation: 'tribe-flame 0.9s ease-in-out infinite' }}>
        <path d="M0 -17c4 6 8 9 8 15a8 8 0 0 1-16 0c0-4 3-6 4-9 1 2 2 3 3 3-1-3-1-6 1-9z" fill="#ff7a2a" />
        <path d="M0 -8c2 3 5 5 5 9a5 5 0 0 1-10 0c0-3 2-4 3-6 1 1 1 2 2 2-1-2-1-3 0-5z" fill="#ffd05a" />
      </g>
      {[0, 1, 2].map((i) => (
        <circle key={i} cx={-5 + i * 5} cy="-14" r="1.2" fill="#ffe08a" className="tribe-anim" style={{ animation: `tribe-spark 2.4s ease-out ${i * 0.8}s infinite` }} />
      ))}
    </g>
  )
}

// ---------------------------------------------------------------------------
// Les objets de la scène, rangés par profondeur
// ---------------------------------------------------------------------------
interface SceneSprite {
  key: string
  x: number
  y: number
  ox: number
  oy: number
  w: number
  h: number
  node: ReactNode
}

function buildSprites(layout: Layout, level: number, emblem: string, color: string): SceneSprite[] {
  const { H, cx, cy, rings, spots } = layout
  const { A, B, ic, pond, cave, onIsland } = geometry(layout)
  const out: SceneSprite[] = []
  const outer = rings[rings.length - 1]
  const hutClear = (px: number, py: number, d: number) => spots.some((s) => Math.hypot(s.x - px, (s.y - py) * 0.9) < d)
  const nearTrail = (px: number, py: number) => {
    // couloir de la piste de la tanière vers le village
    const t = (py - cave.y) / (FOREST + 24 - cave.y)
    if (t < -0.2 || t > 1.1) return false
    const trailX = cave.x + (cx + 8 - cave.x) * Math.max(0, Math.min(1, t))
    return Math.abs(px - trailX) < 12
  }

  // Forêt des loups : sapins serrés, rien d'habité.
  const rf = rng(H * 17 + 5)
  for (let y = -8; y < FOREST + 12; y += 10) {
    for (let x = -14; x < W + 16; x += 13) {
      const px = x + (rf() - 0.5) * 10 + ((Math.round(y / 10) % 2) * 5)
      const py = y + (rf() - 0.5) * 7
      if (!onIsland(px, py, 0.86)) continue
      if (Math.hypot(px - cave.x, (py - cave.y) * 0.8) < 34) continue
      if (nearTrail(px, py)) continue
      if (Math.hypot(px - cx, py - (FOREST + 4)) < 0) continue
      out.push({ key: `p${out.length}`, x: px, y: py, ox: 20, oy: 56, w: 40, h: 62, node: <Pine s={0.85 + rf() * 0.6} tone={Math.floor(rf() * 3)} /> })
    }
  }

  // Autour du village : quelques arbres isolés, puis la lisière.
  const rv = rng(H * 31 + spots.length)
  for (let y = FOREST + 8; y < H + 16; y += 19) {
    for (let x = -22; x < W + 24; x += 21) {
      const px = x + (rv() - 0.5) * 16
      const py = y + (rv() - 0.5) * 12
      if (!onIsland(px, py, 0.82)) continue
      if (hutClear(px, py, 38)) continue
      const nx = (px - cx) / (outer.rx + 30)
      const ny = (py - cy) / (outer.ry + 30)
      const insideVillage = nx * nx + ny * ny < 1
      if (Math.hypot(px - cx, (py - cy) * 1.1) < 86) continue
      if (Math.hypot(px - pond.x, (py - pond.y) * 1.6) < 62) continue
      if (insideVillage && rv() > 0.14) continue
      out.push({ key: `t${out.length}`, x: px, y: py, ox: 22, oy: 46, w: 44, h: 54, node: <Broadleaf s={0.85 + rv() * 0.5} tone={Math.floor(rv() * 3)} /> })
    }
  }

  // Rochers : quelques-uns à la lisière du village et en bord d'île, des amas près de la tanière.
  const rr = rng(H * 7 + 11)
  const rocks: [number, number, number][] = []
  for (let i = 0; i < 12; i++) {
    const a = rr() * Math.PI * 2
    const k = 0.74 + rr() * 0.16
    rocks.push([cx + A * k * Math.cos(a), ic + B * k * Math.sin(a), 0.7 + rr() * 0.8])
  }
  rocks.push([cave.x - 40, cave.y + 4, 1.3], [cave.x + 42, cave.y + 8, 1.1], [cave.x + 8, cave.y + 22, 0.9], [cx + 70, FOREST - 14, 1.2], [cx - 96, FOREST + 10, 1], [pond.x + 50, pond.y + 8, 0.8], [pond.x - 46, pond.y - 10, 0.9])
  rocks.forEach(([px, py, s], i) => {
    if (!onIsland(px, py, 0.9) || hutClear(px, py, 30)) return
    if (Math.hypot(px - cx, (py - cy) * 1.1) < 62) return
    out.push({ key: `r${i}`, x: px, y: py, ox: 26, oy: 24, w: 52, h: 32, node: <Rock s={s} v={i} /> })
  })

  out.push({ key: 'cave', x: cave.x, y: cave.y, ox: 40, oy: 42, w: 80, h: 48, node: <Cave /> })
  out.push({ key: 'sign', x: cx + 6, y: FOREST + 26, ox: 14, oy: 30, w: 28, h: 36, node: <Sign /> })
  out.push({ key: 'baobab', x: cx, y: cy + 3 + 24, ox: 56, oy: 108, w: 112, h: 118, node: <g transform="translate(0 -24)"><Baobab /></g> })
  out.push({ key: 'fire', x: cx, y: cy + 28, ox: 30, oy: 26, w: 60, h: 42, node: <Fire /> })
  decorSprites({ level, cx, cy, emblem, color }).forEach((d) => out.push({ key: d.key, x: d.x, y: d.y, ox: d.ox, oy: d.oy, w: d.w, h: d.h, node: d.node }))
  return out
}

/** Les objets de la scène (arbres, rochers, baobab, feu, décors, tanière) : chacun est un petit dessin
 * dont la profondeur (z-index) est sa position au sol. Mémoïsé : ne se redessine que si le plan change. */
export const SceneObjects = memo(function SceneObjects({ layout, level, emblem, color }: { layout: Layout; level: number; emblem: string; color: string }) {
  const HT = worldHeight(layout.H)
  const sprites = useMemo(() => buildSprites(layout, level, emblem, color), [layout, level, emblem, color])
  return (
    <>
      {sprites.map((s) => (
        <svg
          key={s.key}
          viewBox={`${-s.ox} ${-s.oy} ${s.w} ${s.h}`}
          preserveAspectRatio="none"
          aria-hidden="true"
          className="pointer-events-none absolute overflow-visible"
          style={{
            left: `${((s.x + PX - s.ox) / WT) * 100}%`,
            top: `${((s.y + PT - s.oy) / HT) * 100}%`,
            width: `${(s.w / WT) * 100}%`,
            height: `${(s.h / HT) * 100}%`,
            zIndex: Math.round(s.y),
          }}
        >
          {s.node}
        </svg>
      ))}
    </>
  )
})

/** Halos et guirlandes par-dessus tout (lumières chaudes des lanternes, halo du niveau 10…). */
export const SceneLights = memo(function SceneLights({ layout, level, emblem, color }: { layout: Layout; level: number; emblem: string; color: string }) {
  const HT = worldHeight(layout.H)
  const { cx, cy } = layout
  const { pond } = geometry(layout)
  return (
    <svg viewBox={`0 0 ${WT} ${HT}`} preserveAspectRatio="none" aria-hidden="true" className="pointer-events-none absolute inset-0 h-full w-full" style={{ zIndex: 900 }}>
      <g transform={`translate(${PX} ${PT})`}>
        <TribeDecor layer="front" level={level} cx={cx} cy={cy} emblem={emblem} color={color} pond={pond} />
        <TribeDecor layer="lights" level={level} cx={cx} cy={cy} emblem={emblem} color={color} pond={pond} />
      </g>
    </svg>
  )
})

// ---------------------------------------------------------------------------
// Le terrain (fond) : ciel, falaise, sol, chemins, mare, forêt sombre, place
// ---------------------------------------------------------------------------
export const Scenery = memo(function Scenery({ layout, level, emblem, color }: { layout: Layout; level: number; emblem: string; color: string }) {
  const { H, cx, cy, rings, spots } = layout
  const HT = worldHeight(H)
  const { A, B, ic, pond, cave } = geometry(layout)

  const island = useMemo(() => {
    const r = rng(H * 13 + 5)
    return Array.from({ length: 16 }, (_, i) => {
      const a = (2 * Math.PI * i) / 16
      const k = 0.95 + r() * 0.09
      return { x: cx + A * k * Math.cos(a), y: ic + B * k * Math.sin(a) }
    })
  }, [H, cx, ic, A, B])

  const patches = useMemo(() => {
    const r = rng(H + 9)
    return Array.from({ length: 34 }, () => ({ x: -10 + r() * (W + 20), y: r() * H, rx: 14 + r() * 26, ry: 6 + r() * 12, o: 0.1 + r() * 0.14 }))
  }, [H])
  const flowers = useMemo(() => {
    const r = rng(H + 77)
    return Array.from({ length: 36 }, () => ({ x: 6 + r() * (W - 12), y: FOREST + 10 + r() * (H - FOREST - 24), c: ['#f6e27a', '#f2a6c4', '#fff', '#ffb27a'][Math.floor(r() * 4)] })).filter(
      (f) => !spots.some((s) => Math.hypot(s.x - f.x, s.y - f.y) < 26) && Math.hypot(f.x - cx, f.y - cy) > 58,
    )
  }, [H, spots, cx, cy])
  // Quelques roches qui pendent sous l'île.
  const hanging = useMemo(() => {
    const r = rng(H + 41)
    return Array.from({ length: 6 }, (_, i) => {
      const a = 0.3 + (i / 5) * 2.55
      return { x: cx + A * 0.72 * Math.cos(a), y: ic + B * 0.84 * Math.sin(a) + 22, w: 7 + r() * 9, h: 10 + r() * 14 }
    })
  }, [H, cx, ic, A, B])

  // Chemins de terre : une route autour de chaque anneau, quelques avenues qui les relient à la
  // place, et un petit sentier de chaque case jusqu'à la route la plus proche. Tout est irrégulier.
  const roads = useMemo(() => {
    const r = rng(H * 5 + spots.length * 3)
    const loops = rings.map((ring) => {
      const N = 20
      return Array.from({ length: N }, (_, i) => {
        const t = (2 * Math.PI * i) / N
        const k = 0.84 + (r() - 0.5) * 0.05
        return { x: cx + ring.rx * k * Math.cos(t) + (r() - 0.5) * 3, y: cy + ring.ry * k * Math.sin(t) + (r() - 0.5) * 3 }
      })
    })
    const outerR = rings[rings.length - 1]
    const avenues = [0.5, 1.9, 3.15, 4.4, 5.6].map((a0) => {
      const a = a0 + (r() - 0.5) * 0.3
      const pts: Spot[] = []
      for (let u = 0.3; u <= 1.001; u += 0.1) {
        const bend = Math.sin(u * 5 + a * 3) * 4
        pts.push({
          x: cx + outerR.rx * 0.86 * u * Math.cos(a) + bend * -Math.sin(a),
          y: cy + 4 + outerR.ry * 0.86 * u * Math.sin(a) + bend * Math.cos(a),
        })
      }
      return pts
    })
    // chaque case est rattachée à la route de son anneau
    const counts = rings.length === 1 ? [spots.length] : rings.length === 2 ? [6, spots.length - 6] : [6, 12, spots.length - 18]
    const stubs: Spot[][] = []
    let idx = 0
    counts.forEach((m, k) => {
      for (let j = 0; j < m; j++) {
        const sp = spots[idx++]
        if (!sp) continue
        const tx = cx + (sp.x - cx) * 0.84
        const ty = cy + (sp.y - cy) * 0.84
        stubs.push([
          { x: sp.x, y: sp.y + 14 },
          { x: (sp.x + tx) / 2 + (r() - 0.5) * 5, y: (sp.y + 14 + ty) / 2 + (r() - 0.5) * 3 },
          { x: tx, y: ty },
        ])
      }
      void k
    })
    const pebbles = loops.flatMap((pts) =>
      pts.flatMap((p, i) => (i % 2 === 0 ? [{ x: p.x + (r() - 0.5) * 8, y: p.y + (r() - 0.5) * 8, s: 0.6 + r() * 0.9, c: ['#7d7870', '#968f84', '#6a655e'][i % 3] }] : [])),
    )
    return { loops, avenues, stubs, pebbles }
  }, [H, rings, spots, cx, cy])

  const prints = useMemo(() => {
    const out: { x: number; y: number; a: number; side: number }[] = []
    const x1 = cx + 8
    const y1 = FOREST + 30
    for (let i = 0; i < 9; i++) {
      const t = i / 8
      out.push({ x: cave.x + (x1 - cave.x) * t + Math.sin(t * 6) * 5 + (i % 2 ? 2.4 : -2.4), y: cave.y + 12 + (y1 - cave.y - 12) * t, a: 20 + Math.sin(t * 6) * 14, side: i % 2 })
    }
    return out
  }, [cx, cave.x, cave.y])

  return (
    <svg viewBox={`0 0 ${WT} ${HT}`} className="absolute inset-0 h-full w-full" preserveAspectRatio="none" aria-hidden="true">
      <defs>
        <radialGradient id="vgGround" cx="50%" cy="55%" r="75%">
          <stop offset="0" stopColor="#4d7c43" />
          <stop offset=".7" stopColor="#33582f" />
          <stop offset="1" stopColor="#1f3d28" />
        </radialGradient>
        <linearGradient id="vgDusk" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#0b0a24" stopOpacity=".5" />
          <stop offset=".55" stopColor="#0b0a24" stopOpacity=".12" />
          <stop offset="1" stopColor="#0b0a24" stopOpacity=".3" />
        </linearGradient>
        <linearGradient id="vgWood" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#06141c" stopOpacity=".85" />
          <stop offset=".7" stopColor="#0a2230" stopOpacity=".45" />
          <stop offset="1" stopColor="#0a2230" stopOpacity="0" />
        </linearGradient>
        <linearGradient id="vgCliff" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#7a5636" />
          <stop offset="1" stopColor="#35241a" />
        </linearGradient>
        <clipPath id="vgIsland">
          <path d={blobPath(island, 0)} />
        </clipPath>
      </defs>

      {/* nuages sous l'île */}
      {[[40, 0.9, 0], [WT - 50, 0.8, 1], [WT / 2, 0.96, 2], [WT - 30, 0.4, 3]].map(([x, k, i]) => (
        <g key={i} className="tribe-anim" style={{ animation: `tribe-cloud ${14 + i * 3}s ease-in-out ${i}s infinite alternate` }} opacity=".5">
          <ellipse cx={x} cy={HT * k} rx="42" ry="9" fill="#5a4a8a" />
          <ellipse cx={x - 16} cy={HT * k - 5} rx="20" ry="9" fill="#6a5a9a" />
          <ellipse cx={x + 14} cy={HT * k - 6} rx="24" ry="10" fill="#6a5a9a" />
        </g>
      ))}

      <g transform={`translate(${PX} ${PT})`}>
        {/* falaise et roches suspendues */}
        {hanging.map((k, i) => (
          <path key={i} d={`M${k.x - k.w} ${k.y - 6}Q${k.x - k.w * 0.4} ${k.y + k.h} ${k.x} ${k.y + k.h}Q${k.x + k.w * 0.5} ${k.y + k.h * 0.5} ${k.x + k.w} ${k.y - 6}Z`} fill="#3a281c" />
        ))}
        <path d={blobPath(island, 20)} fill="#2a1b14" />
        <path d={blobPath(island, 14)} fill="url(#vgCliff)" />
        <path d={blobPath(island, 8)} fill="#6a4a30" />
        <path d={blobPath(island, 20)} fill="none" stroke="#1c110c" strokeWidth="1.2" />

        {/* le sol de l'île */}
        <path d={blobPath(island, 0)} fill="url(#vgGround)" />
        <g clipPath="url(#vgIsland)">
          {patches.map((pt, i) => (
            <ellipse key={i} cx={pt.x} cy={pt.y} rx={pt.rx} ry={pt.ry} fill="#5d8f4c" opacity={pt.o} />
          ))}

          {/* routes : une boucle par anneau, des avenues vers la place, un sentier par case */}
          <g fill="none" strokeLinecap="round" strokeLinejoin="round">
            {[
              ...roads.loops.map((pts) => ({ d: blobPath(pts, 0), w: 6.4 })),
              ...roads.avenues.map((pts) => ({ d: openPath(pts), w: 5.4 })),
              ...roads.stubs.map((pts) => ({ d: openPath(pts), w: 3.4 })),
            ].map((p, i) => (
              <g key={i}>
                <path d={p.d} stroke="#4f3b22" strokeWidth={p.w + 2.6} opacity=".5" />
                <path d={p.d} stroke="#9a7b50" strokeWidth={p.w} />
                <path d={p.d} stroke="#b99765" strokeWidth={p.w * 0.45} opacity=".6" />
              </g>
            ))}
          </g>
          {roads.pebbles.map((p, i) => (
            <ellipse key={i} cx={p.x} cy={p.y} rx={p.s} ry={p.s * 0.7} fill={p.c} />
          ))}

          {/* mare */}
          <ellipse cx={pond.x} cy={pond.y} rx="44" ry="21" fill="#173a52" />
          <ellipse cx={pond.x} cy={pond.y} rx="40" ry="18" fill="#2b6c8c" />
          <ellipse cx={pond.x - 8} cy={pond.y - 4} rx="22" ry="7" fill="#7cc4e0" opacity=".28" />
          {[[-22, -2], [24, -6], [16, 9]].map(([dx, dy], i) => (
            <path key={i} d={`M${pond.x + dx} ${pond.y + dy}v-8M${pond.x + dx + 2} ${pond.y + dy}v-6`} stroke="#3f7a42" strokeWidth="1.6" strokeLinecap="round" />
          ))}

          {/* place du village */}
          <ellipse cx={cx} cy={cy + 6} rx="50" ry="42" fill="#6a4f2f" />
          <ellipse cx={cx} cy={cy + 4} rx="46" ry="38" fill="#8a6a43" />
          <ellipse cx={cx} cy={cy + 4} rx="46" ry="38" fill="none" stroke="#c9a56a" strokeWidth="1" strokeDasharray="2 3" opacity=".6" />
          <TribeDecor layer="ground" level={level} cx={cx} cy={cy} emblem={emblem} color={color} pond={pond} />

          {flowers.map((f, i) => (
            <circle key={i} cx={f.x} cy={f.y} r="1.5" fill={f.c} opacity=".85" />
          ))}

          {/* la forêt des loups : sol sombre, brume, empreintes qui mènent à la tanière */}
          <rect x="-60" y="-60" width={W + 120} height={FOREST + 100} fill="url(#vgWood)" />
          {prints.map((p, i) => (
            <g key={i} transform={`translate(${p.x} ${p.y}) rotate(${p.a})`} opacity={0.5 - i * 0.03}>
              <ellipse cx="0" cy="0" rx="1.7" ry="2" fill="#07130f" />
              {[-1.8, 0, 1.8].map((dx) => (
                <circle key={dx} cx={dx} cy={-2.8} r=".7" fill="#07130f" />
              ))}
            </g>
          ))}
          {[[0.25, 18], [0.7, 46], [0.45, 96]].map(([fx, fy], i) => (
            <ellipse key={i} cx={W * fx} cy={fy} rx="58" ry="9" fill="#cfe6f0" opacity=".07" className="tribe-anim" style={{ animation: `tribe-cloud ${16 + i * 4}s ease-in-out ${i * 2}s infinite alternate` }} />
          ))}

          <rect x="-40" y="-40" width={W + 80} height={H + 80} fill="url(#vgDusk)" />
        </g>
        {/* lisière d'herbe claire au bord de l'île */}
        <path d={blobPath(island, 0)} fill="none" stroke="#7fb86a" strokeWidth="2.2" opacity=".8" />
      </g>
    </svg>
  )
})
