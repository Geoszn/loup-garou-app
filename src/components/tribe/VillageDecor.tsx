import type { TranslationKey } from '../../i18n/translations'

// ---------------------------------------------------------------------------
// Les décors de l'île qui se débloquent avec le niveau de la tribu (migration 0225).
// Le niveau 1 a déjà un étendard à l'emblème de la tribu : la tribu s'y reconnaît dès
// le départ. Chaque niveau ajoute ensuite un décor visible pour tout le monde.
// ---------------------------------------------------------------------------
export const DECOR_UNLOCKS: { level: number; icon: string; label: TranslationKey }[] = [
  { level: 1, icon: '🚩', label: 'tribe.decor.1' },
  { level: 2, icon: '🏮', label: 'tribe.decor.2' },
  { level: 3, icon: '🪵', label: 'tribe.decor.3' },
  { level: 4, icon: '🗿', label: 'tribe.decor.4' },
  { level: 5, icon: '🌉', label: 'tribe.decor.5' },
  { level: 6, icon: '🪨', label: 'tribe.decor.6' },
  { level: 7, icon: '🎏', label: 'tribe.decor.7' },
  { level: 8, icon: '🏆', label: 'tribe.decor.8' },
  { level: 9, icon: '🔥', label: 'tribe.decor.9' },
  { level: 10, icon: '👑', label: 'tribe.decor.10' },
]

const OUT = '#2b1a10'

interface DecorProps {
  level: number
  cx: number
  cy: number
  emblem: string
  color: string
  pond: { x: number; y: number }
  layer: 'ground' | 'front' | 'lights'
}

/** Lanterne sur poteau : le corps ; sa lumière est dessinée à part (couche « lights »). */
function LanternPost({ x, y }: { x: number; y: number }) {
  return (
    <g transform={`translate(${x} ${y})`}>
      <ellipse cx="-1.5" cy="2" rx="4.4" ry="1.6" fill="#000" opacity=".32" />
      <rect x="-0.9" y="-15" width="1.8" height="17" rx=".6" fill="#5a3a22" stroke={OUT} strokeWidth=".5" />
      <path d="M-4.2 -16.4h8.4l-1.2 -2.2h-6z" fill="#3a2a1c" stroke={OUT} strokeWidth=".6" strokeLinejoin="round" />
      <rect x="-3.2" y="-23" width="6.4" height="7" rx="1.6" fill="#ffd36b" stroke={OUT} strokeWidth=".8" />
      <path d="M-1 -22v5M1 -22v5" stroke="#b8872a" strokeWidth=".5" />
      <path d="M-3.8 -23.4h7.6l-1 -2h-5.6z" fill="#3a2a1c" stroke={OUT} strokeWidth=".6" strokeLinejoin="round" />
    </g>
  )
}

/** Brasero : un bol de fer et sa flamme. */
function Brazier({ x, y }: { x: number; y: number }) {
  return (
    <g transform={`translate(${x} ${y})`}>
      <ellipse cx="-1.5" cy="3" rx="6" ry="2" fill="#000" opacity=".32" />
      <path d="M-1.4 -3l-2.4 6M1.4 -3l2.4 6" stroke="#3a2a1c" strokeWidth="1.4" strokeLinecap="round" />
      <path d="M-5.6 -9h11.2c0 5-2.2 7-5.6 7s-5.6-2-5.6-7z" fill="#5a4a42" stroke={OUT} strokeWidth=".8" strokeLinejoin="round" />
      <ellipse cx="0" cy="-9" rx="5.6" ry="1.6" fill="#ff7a2a" stroke={OUT} strokeWidth=".6" />
      <g className="tribe-anim" style={{ transformOrigin: '0px -9px', animation: 'tribe-flame 0.8s ease-in-out infinite' }}>
        <path d="M0 -22c2.6 3.4 4.4 5.6 4.4 8.6a4.4 4.4 0 0 1-8.8 0c0-2.2 1.6-3.4 2.2-5 .6 1 1.2 1.6 1.8 1.6-.6-1.6-.6-3.4.4-5.2z" fill="#ff7a2a" />
        <path d="M0 -17c1.4 1.8 2.6 3 2.6 4.8a2.6 2.6 0 0 1-5.2 0c0-1.4 1-2 1.4-3 .4.6.7.9 1.2.9-.4-1-.4-2 0-2.7z" fill="#ffd05a" />
      </g>
    </g>
  )
}

/** Banc de rondins. */
function Bench({ x, y, w = 18 }: { x: number; y: number; w?: number }) {
  return (
    <g transform={`translate(${x} ${y})`}>
      <ellipse cx="0" cy="3.4" rx={w / 2 + 2} ry="2" fill="#000" opacity=".3" />
      <rect x={-w / 2} y="-3" width={w} height="6" rx="3" fill="#8a5a32" stroke={OUT} strokeWidth=".8" />
      <rect x={-w / 2 + 1} y="-2.4" width={w - 2} height="2" rx="1" fill="#b5834e" opacity=".7" />
      <ellipse cx={-w / 2 + 0.6} cy="0" rx="1.6" ry="3" fill="#d9b27a" stroke={OUT} strokeWidth=".5" />
      <ellipse cx={w / 2 - 0.6} cy="0" rx="1.6" ry="3" fill="#d9b27a" stroke={OUT} strokeWidth=".5" />
    </g>
  )
}

/** Étendard (niveaux 1 à 3) : la couleur et l'emblème de la tribu sur une hampe. */
function Flag({ x, y, emblem, color }: { x: number; y: number; emblem: string; color: string }) {
  return (
    <g transform={`translate(${x} ${y})`}>
      <ellipse cx="0" cy="2" rx="5" ry="1.8" fill="#000" opacity=".3" />
      <rect x="-0.9" y="-34" width="1.8" height="36" rx=".6" fill="#6a4529" stroke={OUT} strokeWidth=".5" />
      <circle cx="0" cy="-35" r="1.8" fill="#f0c75a" stroke={OUT} strokeWidth=".5" />
      <g className="tribe-anim" style={{ transformOrigin: '0.9px -31px', animation: 'tribe-wave 3.2s ease-in-out infinite' }}>
        <path d="M0.9 -32h15.4l-3.2 7.4 3.2 7.4H0.9z" fill={color} stroke={OUT} strokeWidth=".8" strokeLinejoin="round" />
        <path d="M0.9 -32h15.4l-1 2.4H0.9z" fill="#fff" opacity=".25" />
        <text x="7.4" y="-22.4" fontSize="7" textAnchor="middle" style={{ filter: 'drop-shadow(0 0 1px rgba(0,0,0,.5))' }}>
          {emblem}
        </text>
      </g>
    </g>
  )
}

/** Totem sculpté (niveau 4 et plus, doré dès le niveau 8) portant l'emblème de la tribu. */
function Totem({ x, y, emblem, color, gold }: { x: number; y: number; emblem: string; color: string; gold: boolean }) {
  const wood = gold ? ['#fff0a0', '#f2b83c', '#a8680e'] : ['#b5834e', '#8a5a32', '#4e2f1a']
  return (
    <g transform={`translate(${x} ${y})`}>
      <defs>
        <linearGradient id={gold ? 'tdTotemG' : 'tdTotemW'} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor={wood[0]} />
          <stop offset=".5" stopColor={wood[1]} />
          <stop offset="1" stopColor={wood[2]} />
        </linearGradient>
      </defs>
      <ellipse cx="-1.5" cy="2.4" rx="8.4" ry="2.4" fill="#000" opacity=".34" />
      <rect x="-4.6" y="-10" width="9.2" height="12" rx="1.4" fill={`url(#${gold ? 'tdTotemG' : 'tdTotemW'})`} stroke={OUT} strokeWidth=".8" />
      <rect x="-4.2" y="-22" width="8.4" height="12.4" rx="1.4" fill={`url(#${gold ? 'tdTotemG' : 'tdTotemW'})`} stroke={OUT} strokeWidth=".8" />
      <rect x="-4.6" y="-32" width="9.2" height="10.4" rx="1.4" fill={`url(#${gold ? 'tdTotemG' : 'tdTotemW'})`} stroke={OUT} strokeWidth=".8" />
      <rect x="-4.2" y="-19" width="8.4" height="3" fill={color} stroke={OUT} strokeWidth=".5" />
      <rect x="-4.6" y="-5" width="9.2" height="2.6" fill={color} stroke={OUT} strokeWidth=".5" />
      <text x="0" y="-24.4" fontSize="7.4" textAnchor="middle">
        {emblem}
      </text>
      <circle cx="-1.8" cy="-13" r=".9" fill="#fff" /><circle cx="1.8" cy="-13" r=".9" fill="#fff" />
      <path d="M-1.6 -10.6q1.6 1 3.2 0" stroke={OUT} strokeWidth=".6" fill="none" strokeLinecap="round" />
      <path d="M-9.6 -32.6l5.6 -5.2v5.2zM9.6 -32.6l-5.6 -5.2v5.2z" fill={color} stroke={OUT} strokeWidth=".7" strokeLinejoin="round" />
      <path d="M-4.6 -32.6L0 -39l4.6 6.4z" fill={gold ? '#ffe27a' : '#6a4529'} stroke={OUT} strokeWidth=".7" strokeLinejoin="round" />
    </g>
  )
}

/** Petit pont de planches au-dessus de la mare (niveau 5). */
function Bridge({ x, y }: { x: number; y: number }) {
  return (
    <g transform={`translate(${x} ${y})`}>
      <rect x="-27" y="-5.4" width="54" height="11" rx="2" fill="#7a5230" stroke={OUT} strokeWidth=".9" />
      {Array.from({ length: 11 }, (_, i) => (
        <path key={i} d={`M${-24 + i * 4.8} -5v10`} stroke="#4e2f1a" strokeWidth=".7" opacity=".75" />
      ))}
      <rect x="-27" y="-5.4" width="54" height="2" rx="1" fill="#b5834e" opacity=".7" />
      <path d="M-27 -9v10M27 -9v10M-14 -9v10M14 -9v10M-27 -8.4h54" stroke="#3a2614" strokeWidth="1.4" strokeLinecap="round" fill="none" />
    </g>
  )
}

/** Points d'une courbe de Bézier quadratique. */
function along(p0: [number, number], p1: [number, number], p2: [number, number], n: number) {
  return Array.from({ length: n }, (_, i) => {
    const t = (i + 0.5) / n
    const u = 1 - t
    return { x: u * u * p0[0] + 2 * u * t * p1[0] + t * t * p2[0], y: u * u * p0[1] + 2 * u * t * p1[1] + t * t * p2[1] }
  })
}

/** Les décors de la tribu, en trois couches : sol (dallage, pont), devant (étendard ou totem,
 * lanternes, bancs, braseros, guirlandes, halo) et lumières (halos chauds par-dessus la nuit). */
export function TribeDecor({ level, cx, cy, emblem, color, pond, layer }: DecorProps) {
  const lv = Math.max(1, Math.min(10, level))
  const px = cx
  const py = cy + 6
  // Les quatre lanternes autour de la place.
  const lamps: [number, number][] = [[cx - 40, cy - 22], [cx + 40, cy - 22], [cx - 48, cy + 30], [cx + 48, cy + 30]]
  const flagX = cx + 38
  const flagY = cy + 42

  if (layer === 'ground') {
    return (
      <g>
        {lv >= 6 && (
          <g>
            <defs>
              <pattern id="tdPaving" width="9" height="6.6" patternUnits="userSpaceOnUse">
                <rect width="9" height="6.6" fill="#8f877a" />
                <path d="M0 0h9M0 3.3h9M4.5 0v3.3M0 3.3v3.3M9 3.3v3.3" stroke="#6e675b" strokeWidth=".5" fill="none" />
                <rect width="9" height="1.4" fill="#fff" opacity=".12" />
              </pattern>
            </defs>
            <ellipse cx={px} cy={cy + 4} rx="47" ry="39" fill="url(#tdPaving)" stroke="#5e574c" strokeWidth="1.4" />
            <ellipse cx={px} cy={cy + 4} rx="47" ry="39" fill="none" stroke="#e0b24a" strokeWidth="1" strokeDasharray="1.5 3" opacity=".7" />
          </g>
        )}
        {lv >= 3 && (
          <g>
            <ellipse cx={cx} cy={cy + 30} rx="14" ry="7" fill="none" stroke="#8a8680" strokeWidth="1" opacity="0" />
          </g>
        )}
        {lv >= 5 && <Bridge x={pond.x} y={pond.y} />}
      </g>
    )
  }

  if (layer === 'front') {
    const bunting = lv >= 7 ? along([cx - 54, cy - 4], [cx, cy + 74], [cx + 54, cy - 4], 11) : []
    return (
      <g>
        {lv >= 10 && (
          <ellipse cx={px} cy={cy + 4} rx="58" ry="49" fill="none" stroke="#ffe08a" strokeWidth="1.6" strokeDasharray="3 4" opacity=".85" className="tribe-anim" style={{ animation: 'tribe-glow 3s ease-in-out infinite' }} />
        )}
        {lv >= 3 && (
          <>
            <Bench x={cx - 34} y={cy + 36} />
            <Bench x={cx + 34} y={cy + 36} w={16} />
          </>
        )}
        {lv >= 9 && (
          <>
            <Brazier x={cx - 56} y={cy + 6} />
            <Brazier x={cx + 56} y={cy + 6} />
          </>
        )}
        {lv >= 2 && lamps.map(([x, y], i) => <LanternPost key={i} x={x} y={y} />)}
        {bunting.map((p, i) => (
          <path key={i} d={`M${p.x - 2.6} ${p.y - 1}h5.2l-2.6 5.4z`} fill={['#fff4d6', color, '#f0c75a'][i % 3]} stroke={OUT} strokeWidth=".5" strokeLinejoin="round" />
        ))}
        {bunting.length > 0 && <path d={`M${cx - 54} ${cy - 4}Q${cx} ${cy + 74} ${cx + 54} ${cy - 4}`} fill="none" stroke="#3a2a1c" strokeWidth=".7" opacity=".8" />}
        {lv < 4 ? <Flag x={flagX} y={flagY} emblem={emblem} color={color} /> : <Totem x={flagX} y={flagY} emblem={emblem} color={color} gold={lv >= 8} />}
      </g>
    )
  }

  // Lumières : halos chauds par-dessus le voile de nuit.
  return (
    <g style={{ mixBlendMode: 'screen' }} aria-hidden="true">
      <defs>
        <radialGradient id="tdLamp" cx="50%" cy="50%" r="50%">
          <stop offset="0" stopColor="#ffc86a" stopOpacity=".7" />
          <stop offset="1" stopColor="#ff9a3a" stopOpacity="0" />
        </radialGradient>
      </defs>
      {lv >= 2 &&
        lamps.map(([x, y], i) => (
          <g key={i}>
            <circle cx={x} cy={y - 19} r="13" fill="url(#tdLamp)" className="tribe-anim" style={{ animation: `tribe-glow ${2.6 + (i % 3) * 0.4}s ease-in-out infinite` }} />
            <ellipse cx={x} cy={y + 2} rx="16" ry="6" fill="url(#tdLamp)" opacity=".55" />
          </g>
        ))}
      {lv >= 9 &&
        [-56, 56].map((dx) => <circle key={dx} cx={cx + dx} cy={cy - 6} r="20" fill="url(#tdLamp)" className="tribe-anim" style={{ animation: 'tribe-glow 1.9s ease-in-out infinite' }} />)}
      {lv >= 10 && [0, 1, 2, 3, 4, 5].map((i) => <text key={i} x={cx - 50 + i * 20} y={cy - 40 + (i % 2) * 8} fontSize="7" fill="#ffe08a" className="tribe-anim" style={{ animation: `tribe-twinkle ${2 + (i % 3)}s ease-in-out ${i * 0.3}s infinite` }}>✦</text>)}
    </g>
  )
}
