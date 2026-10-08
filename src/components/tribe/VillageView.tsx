import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useLanguage } from '../../i18n/LanguageContext'
import { COLOR_HEX, hutLevel, type TribeInfo, type TribeMember, type TribeMessage } from '../../lib/tribe'
import { tierForPoints, tierLabel } from '../../lib/ranks'
import { supabase } from '../../lib/supabase'
import { Avatar } from '../Avatar'

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
      ? [{ rx: 90, ry: 102 }]
      : ringCount === 2
        ? [{ rx: 84, ry: 102 }, { rx: 126, ry: cy - 60 }]
        : [{ rx: 78, ry: 96 }, { rx: 116, ry: 172 }, { rx: 152, ry: cy - 56 }]
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

/** Le décor : sol, chemins, place, mare, forêt, baobab et feu de camp. Mémoïsé :
 * il ne se redessine que si le plan change (nouveau membre). */
const Scenery = memo(function Scenery({ layout }: { layout: Layout }) {
  const { H, cx, cy, rings, spots } = layout

  const trees = useMemo(() => {
    const r = rng(H * 31 + spots.length)
    const out: { x: number; y: number; s: number; tone: number }[] = []
    const outer = rings[rings.length - 1]
    for (let y = 14; y < H + 16; y += 19) {
      for (let x = 6; x < W + 10; x += 21) {
        const px = x + (r() - 0.5) * 16
        const py = y + (r() - 0.5) * 12
        const nearHut = spots.some((s) => Math.hypot(s.x - px, (s.y - py) * 0.9) < 36)
        const nx = (px - cx) / (outer.rx + 30)
        const ny = (py - cy) / (outer.ry + 30)
        const insideVillage = nx * nx + ny * ny < 1
        const nearPlaza = Math.hypot(px - cx, (py - cy) * 1.1) < 84
        const nearPond = Math.hypot(px - 66, (py - (H - 44)) * 1.6) < 62
        if (nearHut || nearPlaza || nearPond) continue
        // Dans le village, seuls quelques arbres isolés ; au-delà, la forêt.
        if (insideVillage && r() > 0.16) continue
        out.push({ x: px, y: py, s: 0.85 + r() * 0.5, tone: Math.floor(r() * 3) })
      }
    }
    return out.sort((a, b) => a.y - b.y)
  }, [H, spots, rings, cx, cy])

  const patches = useMemo(() => {
    const r = rng(H + 9)
    return Array.from({ length: 26 }, () => ({ x: r() * W, y: r() * H, rx: 14 + r() * 26, ry: 6 + r() * 12, o: 0.1 + r() * 0.14 }))
  }, [H])
  const flowers = useMemo(() => {
    const r = rng(H + 77)
    return Array.from({ length: 34 }, () => ({ x: 10 + r() * (W - 20), y: 10 + r() * (H - 20), c: ['#f6e27a', '#f2a6c4', '#fff', '#ffb27a'][Math.floor(r() * 4)] }))
      .filter((f) => !spots.some((s) => Math.hypot(s.x - f.x, s.y - f.y) < 26) && Math.hypot(f.x - cx, f.y - cy) > 56)
  }, [H, spots, cx, cy])

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="absolute inset-0 h-full w-full" preserveAspectRatio="none" aria-hidden="true">
      <defs>
        <radialGradient id="vgGround" cx="50%" cy="50%" r="75%">
          <stop offset="0" stopColor="#47733f" />
          <stop offset=".7" stopColor="#2f5232" />
          <stop offset="1" stopColor="#1d3826" />
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
      </defs>
      <rect width={W} height={H} fill="url(#vgGround)" />
      {patches.map((p, i) => (
        <ellipse key={i} cx={p.x} cy={p.y} rx={p.rx} ry={p.ry} fill="#5d8f4c" opacity={p.o} />
      ))}

      {/* chemins de terre : de la place vers chaque case, et des sentiers entre les anneaux */}
      <g fill="none" stroke="#9b7a4c" strokeLinecap="round" opacity=".85">
        {rings.map((r, i) => (
          <ellipse key={i} cx={cx} cy={cy} rx={r.rx} ry={r.ry} strokeWidth="3.2" strokeDasharray="1 0" opacity=".55" />
        ))}
        {spots.map((s, i) => (
          <path key={i} d={`M${cx} ${cy} Q${(cx + s.x) / 2 + (i % 2 ? 6 : -6)} ${(cy + s.y) / 2} ${s.x} ${s.y}`} strokeWidth="4.4" />
        ))}
      </g>

      {/* mare */}
      <ellipse cx="62" cy={H - 40} rx="44" ry="21" fill="#173a52" />
      <ellipse cx="62" cy={H - 40} rx="40" ry="18" fill="#2b6c8c" />
      <ellipse cx="54" cy={H - 44} rx="22" ry="7" fill="#7cc4e0" opacity=".28" />
      {[[40, -2], [86, -6], [78, 9]].map(([dx, dy], i) => (
        <path key={i} d={`M${dx + 20} ${H - 40 + dy}v-8M${dx + 22} ${H - 40 + dy}v-6`} stroke="#3f7a42" strokeWidth="1.6" strokeLinecap="round" />
      ))}

      {/* place du village */}
      <ellipse cx={cx} cy={cy + 6} rx="50" ry="42" fill="#6a4f2f" />
      <ellipse cx={cx} cy={cy + 4} rx="46" ry="38" fill="#8a6a43" />
      <ellipse cx={cx} cy={cy + 4} rx="46" ry="38" fill="none" stroke="#c9a56a" strokeWidth="1" strokeDasharray="2 3" opacity=".6" />

      {flowers.map((f, i) => (
        <circle key={i} cx={f.x} cy={f.y} r="1.5" fill={f.c} opacity=".85" />
      ))}

      {/* forêt (triée par profondeur) */}
      {trees.map((t, i) => (
        <Tree key={i} {...t} />
      ))}

      {/* le grand baobab */}
      <g transform={`translate(${cx} ${cy - 4}) scale(1.14)`}>
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

      <rect width={W} height={H} fill="url(#vgDusk)" />
    </svg>
  )
})

// Le style de la case suit le niveau du propriétaire : chaume (niv. 1-2), bois
// peint (3), pierre et tuiles (4-5), pierre claire et toit doré (6).
const HUT_STYLES = [
  { wall: '#a8744a', shade: '#6a4529', roof: '#cfa650', roofShade: '#9b7a32', rib: '#7a5a22', stroke: '#3b2616' },
  { wall: '#8a5a36', shade: '#5a3a22', roof: '#b8914a', roofShade: '#8a6a2c', rib: '#6a4a1c', stroke: '#3b2616' },
  { wall: '#9a9690', shade: '#6e6a66', roof: '#b5573a', roofShade: '#8c3f28', rib: '#6e2f1d', stroke: '#35302c' },
  { wall: '#e8dcc0', shade: '#c4b48e', roof: '#e2b13c', roofShade: '#b8872a', rib: '#8a6416', stroke: '#5a4a2a' },
] as const

/** Une case : mur, toit aux couleurs de la tribu, porte éclairée quand le membre est
 * en ligne ; drapeau pour le chef, étoile pour un sous-chef ; l'allure change avec
 * le niveau (rang) du propriétaire. */
function Hut({ band, online, role, level }: { band: string; online: boolean; role: TribeMember['role']; level: number }) {
  const style = level >= 6 ? 3 : level >= 4 ? 2 : level === 3 ? 1 : 0
  const c = HUT_STYLES[style]
  return (
    <svg viewBox="0 0 50 58" className="block h-auto w-full overflow-visible" aria-hidden="true">
      <ellipse cx="25" cy="52" rx="19" ry="4.5" fill="#000" opacity=".35" />
      {online && <ellipse cx="25" cy="49" rx="22" ry="9" fill="#ffcf6b" opacity=".35" className="tribe-anim" style={{ animation: 'tribe-glow 2.6s ease-in-out infinite' }} />}
      {style === 3 && <ellipse cx="25" cy="22" rx="26" ry="20" fill="#ffe08a" opacity=".22" className="tribe-anim" style={{ animation: 'tribe-glow 3s ease-in-out infinite' }} />}
      <path d="M8 31v16c0 3.4 7.2 6 17 6s17-2.6 17-6V31z" fill={c.wall} stroke={c.stroke} strokeWidth="1.2" strokeLinejoin="round" />
      <path d="M31 31v21c6-.6 11-2.4 11-5.2V31z" fill={c.shade} opacity=".55" />
      {style === 1 && (
        <g fill="none" strokeLinecap="round">
          <path d="M14 32v19M20 32v21M30 32v21M36 32v19" stroke="#4a2f1a" strokeWidth=".8" opacity=".7" />
          <path d="M8.6 37l3 3 3-3 3 3 3-3M31.6 37l3 3 3-3 3 3 2-2" stroke="#f0d27a" strokeWidth="1.2" />
        </g>
      )}
      {(style === 2 || style === 3) && (
        <path d="M8 38h34M8 45h34M16 31v7M28 31v7M22 38v7M35 38v7M16 45v7M30 45v7" fill="none" stroke={style === 2 ? '#5e5a56' : '#b9a77f'} strokeWidth=".8" opacity=".8" />
      )}
      <path d="M19.5 51.4V41a5.5 5.5 0 0 1 11 0v10.4z" fill={online ? '#ffcf6b' : '#1a1020'} stroke="#2a1a0e" strokeWidth="1" />
      <path d="M1.5 32C10 28 40 28 48.5 32 40 21 31 9 25 3 19 9 10 21 1.5 32Z" fill={c.roof} stroke={c.rib} strokeWidth="1.3" strokeLinejoin="round" />
      <path d="M25 3C27 12 36 24 48.5 32 38 29 31 29 25 29z" fill={c.roofShade} opacity=".55" />
      <path d="M6 28c6-2 12-3 19-3s13 1 19 3M10 22c5-1.6 10-2.4 15-2.4s10 .8 15 2.4M15 16c3.4-1 6.6-1.4 10-1.4s6.6.4 10 1.4" fill="none" stroke={c.rib} strokeWidth=".9" strokeLinecap="round" opacity=".75" />
      <path d="M2.4 31.4C11 28 39 28 47.6 31.4" fill="none" stroke={band} strokeWidth="3.4" strokeLinecap="round" />
      <circle cx="25" cy="3" r={style === 3 ? 3.4 : 2.2} fill={style === 3 ? '#ffe08a' : c.rib} stroke={style === 3 ? c.rib : 'none'} strokeWidth=".8" />
      {role === 'chef' && (
        <g>
          <path d="M25 3V-9" stroke="#e8dcc4" strokeWidth="1.3" strokeLinecap="round" />
          <path d="M25.6 -9h13l-3.4 4.2 3.4 4.2h-13z" fill="#f0c75a" stroke="#0a0817" strokeWidth=".7" strokeLinejoin="round" />
        </g>
      )}
      {role === 'sous_chef' && <path d="M25 -7l2 4.2 4.6.6-3.4 3.2.9 4.6L25 2.3l-4.1 2.3.9-4.6-3.4-3.2 4.6-.6z" fill="#7ec8ff" stroke="#0a0817" strokeWidth=".6" strokeLinejoin="round" />}
    </svg>
  )
}

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

  /** Position (en %) du haut d'une case, pour y accrocher bulle ou étiquette. */
  const hutTop = (i: number) => {
    const m = members[i]
    const h = layout.hutW * (m.role === 'chef' ? 1.2 : 1) * 1.16 * (W / layout.H)
    return { top: (layout.spots[i].y / layout.H) * 100 - 0.58 * h - (m.role === 'membre' ? 0 : 0.14 * h), bottom: (layout.spots[i].y / layout.H) * 100 + 0.42 * h, h }
  }
  const clampX = (x: number) => Math.min(80, Math.max(20, (x / W) * 100))

  return (
    <div className="flex flex-col gap-2">
      <div
        className="relative isolate mx-auto w-full max-w-[560px] overflow-hidden rounded-3xl border border-white/10 shadow-card"
        style={{ aspectRatio: `${W} / ${layout.H}` }}
        onClick={() => setSelectedId(null)}
      >
        <Scenery layout={layout} />

        {/* lucioles */}
        {Array.from({ length: 9 }).map((_, k) => (
          <span
            key={k}
            aria-hidden="true"
            className="tribe-anim pointer-events-none absolute h-1 w-1 rounded-full bg-[#e6ff8a]"
            style={{ left: `${(k * 41 + 9) % 92}%`, top: `${(k * 57 + 13) % 90}%`, animation: `tribe-firefly ${5 + (k % 4)}s ease-in-out ${k * 0.7}s infinite` }}
          />
        ))}

        {members.map((m, i) => {
          const spot = layout.spots[i]
          if (!spot) return null
          const online = onlineIds.has(m.user_id)
          const isNew = fresh.has(m.user_id)
          const chef = m.role === 'chef'
          const isSelected = m.user_id === selectedId
          const inGame = !!gameCodes[m.user_id]
          return (
            <button
              key={m.user_id}
              type="button"
              onClick={(e) => {
                e.stopPropagation()
                setSelectedId(isSelected ? null : m.user_id)
              }}
              aria-label={m.username}
              aria-pressed={isSelected}
              className="group absolute flex -translate-x-1/2 -translate-y-[58%] flex-col items-center focus:outline-none"
              style={{ left: `${(spot.x / W) * 100}%`, top: `${(spot.y / layout.H) * 100}%`, width: `${chef ? layout.hutW * 1.2 : layout.hutW}%`, zIndex: Math.round(spot.y) }}
            >
              <div className="tribe-house-in relative w-full transition-transform group-active:scale-95 group-focus-visible:ring-2 group-focus-visible:ring-moon-400" style={{ animationDelay: `${Math.min(i, 29) * 55}ms` }}>
                {isSelected && <span aria-hidden="true" className="absolute inset-x-[-6%] bottom-[2%] h-[12%] rounded-[50%] border-2 border-amber-300/90 bg-amber-300/20" />}
                <div className={isSelected ? 'tribe-anim' : undefined} style={isSelected ? { animation: 'tribe-hop 0.9s ease-in-out infinite' } : undefined}>
                  {isNew &&
                    [0, 1, 2, 3, 4].map((s) => (
                      <span key={s} aria-hidden="true" className="tribe-anim pointer-events-none absolute top-1/3 text-xs" style={{ left: `${10 + s * 18}%`, animation: `tribe-spark 1.6s ease-out ${s * 0.18}s infinite` }}>
                        ✨
                      </span>
                    ))}
                  <Hut band={band} online={online} role={m.role} level={hutLevel(m.rank_points)} />
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
          const chef = m.role === 'chef'
          return (
            <span
              key={m.user_id}
              className="pointer-events-none absolute flex -translate-x-1/2 justify-center"
              style={{ left: `${(spot.x / W) * 100}%`, top: `${(spot.y / layout.H) * 100 + 0.487 * layout.hutW * (chef ? 1.2 : 1) * (W / layout.H)}%`, zIndex: 1000 }}
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
