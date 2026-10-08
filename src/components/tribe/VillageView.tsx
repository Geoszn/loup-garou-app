import { createPortal } from 'react-dom'
import { memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { useLanguage } from '../../i18n/LanguageContext'
import { COLOR_HEX, hutLevel, hutPips, type TribeInfo, type TribeMember, type TribeMessage } from '../../lib/tribe'
import { tierForPoints, tierLabel } from '../../lib/ranks'
import { supabase } from '../../lib/supabase'
import { Avatar } from '../Avatar'
import { Hut } from './HutArt'
import { TribeDecor } from './VillageDecor'
import { emblemIcon } from '../../lib/tribe'

// ---------------------------------------------------------------------------
// Le plan du village : un baobab et un feu de camp au centre, des cases rondes
// (une par membre) rangées autour sur des anneaux, des chemins de terre, la forêt
// tout autour, une mare. Le village grandit avec la tribu : 1 anneau jusqu'à
// 6 membres, 2 jusqu'à 18, 3 jusqu'à 30. Les plus anciens (chef, sous-chefs,
// puis par ancienneté — l'ordre vient du serveur) sont au plus près du feu.
// ---------------------------------------------------------------------------
const W = 360

interface Spot {
  x: number
  y: number
}
interface Layout {
  hutW: number
  H: number
  cx: number
  cy: number
  rings: { rx: number; ry: number }[]
  spots: Spot[]
}

/** Générateur pseudo-aléatoire déterministe : le décor ne bouge pas d'un affichage à l'autre. */
function rng(seed: number) {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function layoutFor(n: number): Layout {
  const ringCount = n <= 6 ? 1 : n <= 18 ? 2 : 3
  const H = ringCount === 1 ? 330 : ringCount === 2 ? 450 : 620
  const cx = W / 2
  const cy = H / 2
  const rings =
    ringCount === 1
      ? [{ rx: 90, ry: 108 }]
      : ringCount === 2
        ? [{ rx: 86, ry: 110 }, { rx: 128, ry: cy - 58 }]
        : [{ rx: 86, ry: 116 }, { rx: 122, ry: 178 }, { rx: 156, ry: cy - 52 }]
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

/** Arbre vu de côté : tronc et houppier en deux tons. */
function Tree({ x, y, s, tone }: { x: number; y: number; s: number; tone: number }) {
  const dark = ['#14402a', '#1a4a2e', '#103a26'][tone % 3]
  const mid = ['#1f6a3e', '#2a7a48', '#1b6038'][tone % 3]
  const light = ['#3a9a58', '#48a862', '#33905a'][tone % 3]
  return (
    <g transform={`translate(${x} ${y}) scale(${s})`}>
      <ellipse cx="0" cy="3" rx="9" ry="3" fill="#000" opacity=".28" />
      <rect x="-1.6" y="-4" width="3.2" height="8" fill="#4a2f1a" />
      <circle cx="0" cy="-12" r="10" fill={dark} />
      <circle cx="-3" cy="-14" r="7.5" fill={mid} />
      <circle cx="-4.5" cy="-16.5" r="3.4" fill={light} opacity=".85" />
      <circle cx="4" cy="-9" r="5" fill={mid} opacity=".9" />
    </g>
  )
}

// L'île flotte dans le ciel : la scène (le village, W × H) est entourée d'une marge
// de ciel, d'une falaise et de nuages. Les cases se placent en % de ce « monde ».
const PX = 26
const PT = 22
const PB = 40
const WT = W + 2 * PX
const worldHeight = (H: number) => H + PT + PB

/** Contour irrégulier de l'île, lissé (Catmull-Rom → Bézier), décalé de dy. */
function blobPath(pts: Spot[], dy: number): string {
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

/** Le décor : ciel, île et falaise, chemins, place, mare, forêt, baobab et feu de
 * camp. Mémoïsé : il ne se redessine que si le plan change (nouveau membre). */
const Scenery = memo(function Scenery({ layout, level, emblem, color }: { layout: Layout; level: number; emblem: string; color: string }) {
  const { H, cx, cy, rings, spots } = layout
  const HT = worldHeight(H)
  const A = W / 2 + PX - 10
  const B = H / 2 + 10
  const pond = { x: cx - 0.52 * A, y: cy + 0.62 * B }

  const island = useMemo(() => {
    const r = rng(H * 13 + 5)
    return Array.from({ length: 14 }, (_, i) => {
      const a = (2 * Math.PI * i) / 14
      const k = 0.94 + r() * 0.1
      return { x: cx + A * k * Math.cos(a), y: cy + B * k * Math.sin(a) }
    })
  }, [H, cx, cy, A, B])

  const trees = useMemo(() => {
    const r = rng(H * 31 + spots.length)
    const out: { x: number; y: number; s: number; tone: number }[] = []
    const outer = rings[rings.length - 1]
    for (let y = -2; y < H + 14; y += 19) {
      for (let x = -14; x < W + 16; x += 21) {
        const px = x + (r() - 0.5) * 16
        const py = y + (r() - 0.5) * 12
        const nearHut = spots.some((s) => Math.hypot(s.x - px, (s.y - py) * 0.9) < 36)
        const nx = (px - cx) / (outer.rx + 30)
        const ny = (py - cy) / (outer.ry + 30)
        const insideVillage = nx * nx + ny * ny < 1
        const nearPlaza = Math.hypot(px - cx, (py - cy) * 1.1) < 84
        const nearPond = Math.hypot(px - pond.x, (py - pond.y) * 1.6) < 62
        const onIsland = ((px - cx) / A) ** 2 + ((py - cy) / B) ** 2 < 0.8
        if (!onIsland || nearHut || nearPlaza || nearPond) continue
        // Dans le village, seuls quelques arbres isolés ; au-delà, la forêt.
        if (insideVillage && r() > 0.16) continue
        out.push({ x: px, y: py, s: 0.85 + r() * 0.5, tone: Math.floor(r() * 3) })
      }
    }
    return out.sort((a, b) => a.y - b.y)
  }, [H, spots, rings, cx, cy, A, B, pond.x, pond.y])

  const patches = useMemo(() => {
    const r = rng(H + 9)
    return Array.from({ length: 30 }, () => ({ x: -10 + r() * (W + 20), y: r() * H, rx: 14 + r() * 26, ry: 6 + r() * 12, o: 0.1 + r() * 0.14 }))
  }, [H])
  const flowers = useMemo(() => {
    const r = rng(H + 77)
    return Array.from({ length: 34 }, () => ({ x: 6 + r() * (W - 12), y: 6 + r() * (H - 12), c: ['#f6e27a', '#f2a6c4', '#fff', '#ffb27a'][Math.floor(r() * 4)] }))
      .filter((f) => !spots.some((s) => Math.hypot(s.x - f.x, s.y - f.y) < 26) && Math.hypot(f.x - cx, f.y - cy) > 56)
  }, [H, spots, cx, cy])
  // Quelques roches qui pendent sous l'île.
  const rocks = useMemo(() => {
    const r = rng(H + 41)
    return Array.from({ length: 5 }, (_, i) => {
      const a = 0.35 + (i / 4) * 2.4
      return { x: cx + A * 0.7 * Math.cos(a), y: cy + B * 0.82 * Math.sin(a) + 22, w: 7 + r() * 8, h: 10 + r() * 12 }
    })
  }, [H, cx, cy, A, B])

  return (
    <svg viewBox={`0 0 ${WT} ${HT}`} className="absolute inset-0 h-full w-full" preserveAspectRatio="none" aria-hidden="true">
      <defs>
        <radialGradient id="vgGround" cx="50%" cy="50%" r="75%">
          <stop offset="0" stopColor="#4d7c43" />
          <stop offset=".7" stopColor="#33582f" />
          <stop offset="1" stopColor="#1f3d28" />
        </radialGradient>
        <radialGradient id="vgFire" cx="50%" cy="50%" r="50%">
          <stop offset="0" stopColor="#ffb54a" stopOpacity=".7" />
          <stop offset="1" stopColor="#ff7a2a" stopOpacity="0" />
        </radialGradient>
        <linearGradient id="vgDusk" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#0b0a24" stopOpacity=".5" />
          <stop offset=".55" stopColor="#0b0a24" stopOpacity=".12" />
          <stop offset="1" stopColor="#0b0a24" stopOpacity=".3" />
        </linearGradient>
        <linearGradient id="vgTrunk" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#7a5a3a" />
          <stop offset=".5" stopColor="#9c7a52" />
          <stop offset="1" stopColor="#5c4129" />
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
      {[[40, 0.88, 0], [WT - 50, 0.78, 1], [WT / 2, 0.95, 2]].map(([x, k, i]) => (
        <g key={i} className="tribe-anim" style={{ animation: `tribe-cloud ${14 + i * 3}s ease-in-out ${i}s infinite alternate` }} opacity=".5">
          <ellipse cx={x} cy={HT * k} rx="42" ry="9" fill="#5a4a8a" />
          <ellipse cx={x - 16} cy={HT * k - 5} rx="20" ry="9" fill="#6a5a9a" />
          <ellipse cx={x + 14} cy={HT * k - 6} rx="24" ry="10" fill="#6a5a9a" />
        </g>
      ))}

      <g transform={`translate(${PX} ${PT})`}>
        {/* falaise et roches suspendues */}
        {rocks.map((k, i) => (
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

          {/* chemins de terre : de la place vers chaque case, et des sentiers entre les anneaux */}
          <g fill="none" stroke="#9b7a4c" strokeLinecap="round" opacity=".85">
            {rings.map((r, i) => (
              <ellipse key={i} cx={cx} cy={cy} rx={r.rx} ry={r.ry} strokeWidth="3.2" opacity=".55" />
            ))}
            {spots.map((sp, i) => (
              <path key={i} d={`M${cx} ${cy} Q${(cx + sp.x) / 2 + (i % 2 ? 6 : -6)} ${(cy + sp.y) / 2} ${sp.x} ${sp.y}`} strokeWidth="4.4" />
            ))}
          </g>

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

          {/* forêt (triée par profondeur) */}
          {trees.map((t, i) => (
            <Tree key={i} {...t} />
          ))}

          {/* le grand baobab */}
          <g transform={`translate(${cx} ${cy + 3}) scale(1)`}>
            <ellipse cx="0" cy="24" rx="26" ry="7" fill="#000" opacity=".32" />
            <path d="M-21 24C-12 20-15 4-12 -8-10 -16-8 -22-6.5 -24h13C8 -22 10 -16 12 -8 15 4 12 20 21 24 10 30-10 30-21 24Z" fill="url(#vgTrunk)" stroke="#3a2614" strokeWidth="1.3" strokeLinejoin="round" />
            <path d="M-8 -6C-10 4-7 14-9 22M0 -12C1 0 0 12 1 23M8 -4C10 6 8 15 10 22" stroke="#5c4129" strokeWidth="1" fill="none" opacity=".7" />
            <path d="M-3 -24L-24 -36M0 -26L0 -42M3 -24L24 -36" stroke="#6a4c30" strokeWidth="3.6" strokeLinecap="round" />
            {[[-26, -40, 11], [-13, -50, 13], [7, -52, 14], [25, -41, 12], [0, -40, 11]].map(([x, y, r], i) => (
              <g key={i}>
                <circle cx={x} cy={y} r={r} fill="#1c5a36" />
                <circle cx={x - 2} cy={y - 2} r={r - 3} fill="#2f8248" />
                <circle cx={x - 4} cy={y - 4} r={r / 3} fill="#5cb872" opacity=".8" />
              </g>
            ))}
            {[[-18, -30], [12, -32], [-4, -30]].map(([x, y], i) => (
              <ellipse key={i} cx={x} cy={y} rx="1.8" ry="3.4" fill="#7a5a34" />
            ))}
          </g>

          {/* le feu de camp, devant le baobab */}
          <g transform={`translate(${cx} ${cy + 27}) scale(.8)`}>
            <ellipse cx="0" cy="0" rx="30" ry="18" fill="url(#vgFire)" className="tribe-anim" style={{ animation: 'tribe-glow 2.2s ease-in-out infinite' }} />
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

          <TribeDecor layer="front" level={level} cx={cx} cy={cy} emblem={emblem} color={color} pond={pond} />

          <rect x="-40" y="-40" width={W + 80} height={H + 80} fill="url(#vgDusk)" />
          <TribeDecor layer="lights" level={level} cx={cx} cy={cy} emblem={emblem} color={color} pond={pond} />
        </g>
        {/* lisière d'herbe claire au bord de l'île */}
        <path d={blobPath(island, 0)} fill="none" stroke="#7fb86a" strokeWidth="2.2" opacity=".8" />
      </g>
    </svg>
  )
})

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
  const [maxH, setMaxH] = useState(() => Math.min(660, Math.max(380, (typeof window === 'undefined' ? 800 : window.innerHeight) - 300)))
  /** Hauteur disponible : sur grand écran (village à côté du menu) tout ce qui reste sous l'en-tête ; sur téléphone, l'écran moins l'en-tête. */
  const computeMaxH = (el: HTMLElement) => {
    if (window.matchMedia('(min-width: 1024px)').matches) {
      const top = el.getBoundingClientRect().top + window.scrollY
      return Math.min(1000, Math.max(460, window.innerHeight - top - 120))
    }
    return Math.min(660, Math.max(380, window.innerHeight - 300))
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
                style={{ left: `${fx(spot.x)}%`, top: `${fy(spot.y)}%`, width: `${hutWidth(m)}%`, zIndex: Math.round(spot.y) }}
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
