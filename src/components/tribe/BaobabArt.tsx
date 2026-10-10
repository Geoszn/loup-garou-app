// Le baobab du village grandit avec le niveau de la tribu (1 à 10) :
//  1 pousse protégée · 2 jeune arbre · 3 tronc qui s'épaissit · 4 baobab adulte · 5 racines et creux
//  6 fruits et ruban aux couleurs de la tribu · 7 lanternes · 8 blason sculpté et fleurs blanches
//  9 feuilles d'or · 10 baobab légendaire (halo, étoile, étincelles).
// Dessiné autour de (0, 0) = pied de l'arbre à y = 24, comme l'ancien baobab unique.

interface Stage {
  /** Demi-largeur du tronc : à la base, à la taille, au sommet. */
  wb: number
  wm: number
  wt: number
  /** Hauteur de la taille et du sommet du tronc. */
  ym: number
  yt: number
  /** Nombre de touffes du feuillage, leur rayon, leur étalement et leur hauteur. */
  blobs: number
  r: number
  spread: number
  crownY: number
}

const STAGES: Record<number, Stage> = {
  2: { wb: 9, wm: 6, wt: 4, ym: -2, yt: -16, blobs: 3, r: 9, spread: 14, crownY: -24 },
  3: { wb: 14, wm: 8.5, wt: 5, ym: -4, yt: -20, blobs: 4, r: 10.5, spread: 20, crownY: -31 },
  4: { wb: 21, wm: 12, wt: 6.5, ym: -8, yt: -24, blobs: 5, r: 12, spread: 26, crownY: -42 },
  5: { wb: 24, wm: 14, wt: 7.5, ym: -8, yt: -26, blobs: 6, r: 13, spread: 30, crownY: -45 },
  6: { wb: 27, wm: 16, wt: 8.5, ym: -8, yt: -28, blobs: 7, r: 13.5, spread: 34, crownY: -47 },
  7: { wb: 30, wm: 18, wt: 9, ym: -8, yt: -29, blobs: 8, r: 14, spread: 38, crownY: -49 },
  8: { wb: 33, wm: 20, wt: 10, ym: -8, yt: -30, blobs: 9, r: 14.5, spread: 42, crownY: -51 },
  9: { wb: 35, wm: 21, wt: 10.5, ym: -8, yt: -30, blobs: 10, r: 14.5, spread: 42, crownY: -51 },
  10: { wb: 37, wm: 22, wt: 11, ym: -8, yt: -31, blobs: 11, r: 15, spread: 45, crownY: -53 },
}

const BARK = '#3a2614'

/** Pseudo-hasard stable : l'arbre ne change pas d'allure d'un rendu à l'autre. */
const rnd = (i: number, salt = 0) => {
  const v = Math.sin((i + 1) * 12.9898 + salt * 78.233) * 43758.5453
  return v - Math.floor(v)
}

function Sapling({ ground }: { ground: string }) {
  return (
    <g>
      <ellipse cx="0" cy="25" rx="17" ry="5" fill="#000" opacity=".3" />
      <ellipse cx="0" cy="23" rx="14" ry="5" fill={ground} stroke={BARK} strokeWidth=".8" />
      <ellipse cx="-2" cy="21.5" rx="8" ry="2.4" fill="#7a5a3a" opacity=".6" />
      <path d="M-1.8 23C-2.6 14-1.4 7-.4 -1 .6 -1 1.6 7 2 14 2.2 18 1.8 21 1.8 23Z" fill="#8a6a44" stroke={BARK} strokeWidth=".9" strokeLinejoin="round" />
      <g stroke="#2f7a45" strokeWidth=".6">
        <ellipse cx="-6.5" cy="-3" rx="7.4" ry="3.3" transform="rotate(-24 -6.5 -3)" fill="#27703f" />
        <ellipse cx="6.5" cy="-4" rx="7.4" ry="3.3" transform="rotate(24 6.5 -4)" fill="#2f8a4c" />
        <ellipse cx="-2" cy="-10" rx="5.4" ry="2.8" transform="rotate(-50 -2 -10)" fill="#4fa266" />
        <ellipse cx="2.6" cy="-9" rx="4.6" ry="2.4" transform="rotate(46 2.6 -9)" fill="#3d9558" />
      </g>
      {[-13, 13].map((x) => (
        <g key={x}>
          <path d={`M${x} 24V11`} stroke="#6a4c30" strokeWidth="1.8" strokeLinecap="round" />
          <circle cx={x} cy="10.5" r="1.2" fill="#8a6a44" />
        </g>
      ))}
      <path d="M-13 15Q0 18 13 15" stroke="#8a6a44" strokeWidth="1" fill="none" opacity=".8" />
      {[[-9, 25, 2.4], [10, 26, 2]].map(([x, y, r], i) => (
        <ellipse key={i} cx={x} cy={y} rx={r} ry={r * 0.65} fill="#8a8680" stroke="#3a3836" strokeWidth=".5" />
      ))}
    </g>
  )
}

/** `color` : teinte de la tribu (hex) ; `emblem` : l'icône de son blason. */
export function BaobabArt({ level, color, emblem }: { level: number; color: string; emblem: string }) {
  const lv = Math.min(10, Math.max(1, Math.round(level)))
  const id = `bb${lv}`
  const tribe = color
  if (lv === 1) return <Sapling ground="#6a4a2c" />

  const { wb, wm, wt, ym, yt, blobs, r, spread, crownY } = STAGES[lv]
  const gold = lv >= 9
  const legend = lv === 10

  // Le tronc en bouteille : large au pied, une taille, un sommet étroit.
  const trunk = `M${-wb} 24C${-wb * 0.57} 20 ${-wm * 1.25} ${ym + 12} ${-wm} ${ym}C${-wm + 2} ${ym - 8} ${-wt - 1.5} ${yt + 2} ${-wt} ${yt}h${wt * 2}C${wt + 1.5} ${yt + 2} ${wm - 2} ${ym - 8} ${wm} ${ym}C${wm * 1.25} ${ym + 12} ${wb * 0.57} 20 ${wb} 24C${wb * 0.5} 30 ${-wb * 0.5} 30 ${-wb} 24Z`
  const widthAt = (y: number) => wm + (wb - wm) * Math.min(1, Math.max(0, (y - ym) / (24 - ym)))

  // Les touffes du feuillage, en arc : le centre est le plus haut.
  const blobList = Array.from({ length: blobs }, (_, i) => {
    const t = blobs === 1 ? 0.5 : i / (blobs - 1)
    const k = 2 * t - 1
    return { x: k * spread, y: crownY + 12 * k * k - 3 + (rnd(i, 1) - 0.5) * 3, r: r * (0.92 + rnd(i, 2) * 0.16), k }
  })
  if (blobs >= 5) blobList.push({ x: 0, y: crownY - 11, r: r * 0.92, k: 0 })
  // Dès le niveau 7, une seconde rangée de touffes au-dessus : la cime prend du volume.
  if (lv >= 7) {
    const upper = lv - 3
    for (let i = 0; i < upper; i++) {
      const k = upper === 1 ? 0 : (2 * i) / (upper - 1) - 1
      blobList.push({ x: k * spread * 0.66, y: crownY - 12 + 9 * k * k + (rnd(i, 9) - 0.5) * 3, r: r * (0.82 + rnd(i, 10) * 0.14), k: 0.001 })
    }
  }
  const leafDark = gold ? '#1d5a34' : '#174c30'
  const leafMid = legend ? '#3f9a4e' : gold ? '#2f8046' : '#27703f'
  const leafLight = legend ? '#ffd96a' : gold ? '#d8c04a' : '#4fa266'

  const roots = lv >= 5
  const hollow = lv >= 5
  const pods = lv >= 6 ? Math.min(6, lv - 3) : 0
  const lanterns = lv >= 7 ? Math.min(5, lv - 4) : 0
  const flowers = lv >= 8 ? (lv === 8 ? 7 : 11) : 0
  const goldLeaves = gold ? (legend ? 40 : 24) : 0

  return (
    <g >
      <defs>
        <linearGradient id={`${id}t`} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#7a5a3a" />
          <stop offset=".5" stopColor={gold ? '#a98650' : '#9c7a52'} />
          <stop offset="1" stopColor="#5c4129" />
        </linearGradient>
        <radialGradient id={`${id}a`} cx="50%" cy="50%" r="50%">
          <stop offset="0" stopColor="#ffe08a" stopOpacity=".55" />
          <stop offset="1" stopColor="#ffb54a" stopOpacity="0" />
        </radialGradient>
        <radialGradient id={`${id}l`} cx="50%" cy="50%" r="50%">
          <stop offset="0" stopColor="#ffd070" stopOpacity=".85" />
          <stop offset="1" stopColor="#ffa030" stopOpacity="0" />
        </radialGradient>
      </defs>

      {legend && <ellipse cx="0" cy={crownY - 2} rx={spread + r + 16} ry={r + 34} fill={`url(#${id}a)`} className="tribe-anim" style={{ animation: 'tribe-glow 3.2s ease-in-out infinite' }} />}
      <ellipse cx="-3" cy="24" rx={wb + 6} ry={7 + lv * 0.15} fill="#000" opacity=".34" />
      {legend && <ellipse cx="0" cy="25" rx={wb + 10} ry="8" fill="none" stroke="#ffd96a" strokeWidth="1.4" opacity=".7" className="tribe-anim" style={{ animation: 'tribe-glow 2.6s ease-in-out infinite' }} />}

      {roots &&
        [-1, 1].map((d) => (
          <g key={d} fill="none" stroke="#6a4c30" strokeLinecap="round">
            <path d={`M${d * (wb - 3)} 21C${d * (wb + 4)} 22 ${d * (wb + 8)} 26 ${d * (wb + 14 + lv)} 28`} strokeWidth="3.2" />
            <path d={`M${d * (wb - 8)} 25C${d * (wb - 2)} 29 ${d * (wb + 2)} 31 ${d * (wb + 6)} 33`} strokeWidth="2.2" />
          </g>
        ))}

      <path d={trunk} fill={`url(#${id}t)`} stroke={BARK} strokeWidth="1.3" strokeLinejoin="round" />
      <path d={`M${-wm * 0.6} ${ym + 2}C${-wm * 0.8} ${ym + 12} ${-wm * 0.5} 16 ${-wm * 0.7} 22M0 ${yt + 12}C1 0 0 12 1 23M${wm * 0.6} ${ym + 4}C${wm * 0.8} ${ym + 14} ${wm * 0.6} 16 ${wm * 0.8} 22`} stroke="#5c4129" strokeWidth="1" fill="none" opacity=".7" />

      {hollow && (
        <g transform={`translate(${lv >= 8 ? -wb * 0.32 : 0} 0)`}>
          <path d={`M${-(3 + (lv - 5) * 0.5)} 24C${-(3 + (lv - 5) * 0.5)} 14 ${-(2 + (lv - 5) * 0.4)} 8 0 8C${2 + (lv - 5) * 0.4} 8 ${3 + (lv - 5) * 0.5} 14 ${3 + (lv - 5) * 0.5} 24Z`} fill="#24160b" stroke={BARK} strokeWidth="1" />
          {lv >= 7 && <ellipse cx="0" cy="21" rx="2" ry="1.6" fill="#ffcf70" opacity=".85" className="tribe-anim" style={{ animation: 'tribe-glow 2.4s ease-in-out infinite' }} />}
        </g>
      )}

      {lv >= 6 && (
        <g>
          <path d={`M${-widthAt(8)} 8Q0 12 ${widthAt(8)} 8L${widthAt(8)} 12.4Q0 16.4 ${-widthAt(8)} 12.4Z`} fill={tribe} stroke={BARK} strokeWidth=".8" strokeLinejoin="round" />
          <path d={`M${-widthAt(8)} 8Q0 12 ${widthAt(8)} 8L${widthAt(8)} 9.6Q0 13.6 ${-widthAt(8)} 9.6Z`} fill="#fff" opacity=".22" />
          <path d={`M${widthAt(8) - 3} 11l5 8-3 -1.4-1.4 3.4zM${widthAt(8) - 3} 11l-3 8 3.4-1.6z`} fill={tribe} stroke={BARK} strokeWidth=".7" strokeLinejoin="round" />
        </g>
      )}

      {lv >= 8 && (
        <g transform={`translate(${wb * 0.22} ${-3})`}>
          <circle r="8.6" fill="#8a5a32" stroke={BARK} strokeWidth="1" />
          <circle r="6.8" fill="#b5834e" opacity=".55" />
          <text x="0" y="3.4" fontSize="9.4" textAnchor="middle">{emblem}</text>
        </g>
      )}

      {/* Branches vers chaque touffe */}
      <path
        d={blobList.filter((b) => (b.k !== 0 || b.y > crownY - 8) && b.k !== 0.001).map((b) => `M${Math.sign(b.k) * wt * 0.4} ${yt + 1}L${b.x * 0.85} ${b.y + b.r * 0.55}`).join('')}
        stroke="#6a4c30"
        strokeWidth={3 + lv * 0.18}
        strokeLinecap="round"
        fill="none"
      />

      {/* Feuillage : fond sombre, puis touffes plus claires */}
      {blobList.map((b, i) => (
        <g key={i}>
          <circle cx={b.x} cy={b.y} r={b.r} fill={leafDark} />
          <circle cx={b.x - 2} cy={b.y - 2} r={b.r - 3} fill={leafMid} />
          <circle cx={b.x - 4} cy={b.y - 4} r={b.r / 3} fill={leafLight} opacity=".8" />
        </g>
      ))}

      {goldLeaves > 0 &&
        Array.from({ length: goldLeaves }, (_, i) => {
          const b = blobList[i % blobList.length]
          const a = rnd(i, 3) * Math.PI * 2
          const d = b.r * (0.25 + rnd(i, 4) * 0.55)
          return <circle key={i} cx={b.x + Math.cos(a) * d} cy={b.y + Math.sin(a) * d * 0.8} r={1.3 + rnd(i, 5) * 1.1} fill={legend ? '#ffe08a' : '#e8c64f'} opacity={legend ? 0.95 : 0.85} />
        })}

      {Array.from({ length: flowers }, (_, i) => {
        const b = blobList[(i * 3 + 1) % blobList.length]
        const a = rnd(i, 6) * Math.PI * 2
        const d = b.r * (0.3 + rnd(i, 7) * 0.5)
        const x = b.x + Math.cos(a) * d
        const y = b.y + Math.sin(a) * d * 0.8
        return (
          <g key={i}>
            {[0, 72, 144, 216, 288].map((deg) => (
              <circle key={deg} cx={x + Math.cos((deg * Math.PI) / 180) * 1.7} cy={y + Math.sin((deg * Math.PI) / 180) * 1.7} r="1.25" fill="#fff8ec" />
            ))}
            <circle cx={x} cy={y} r=".9" fill="#f2c84a" />
          </g>
        )
      })}

      {Array.from({ length: pods }, (_, i) => {
        const t = pods === 1 ? 0.5 : i / (pods - 1)
        const k = 2 * t - 1
        const x = k * (spread * 0.82)
        const y = crownY + 12 * k * k - 3 + r * 0.7
        return (
          <g key={i}>
            <path d={`M${x} ${y}v4`} stroke="#5c4129" strokeWidth=".8" />
            <ellipse cx={x} cy={y + 8} rx="2.5" ry="4.4" fill="#8a6a3e" stroke={BARK} strokeWidth=".7" />
            <ellipse cx={x - 0.8} cy={y + 6.6} rx=".8" ry="1.8" fill="#c9a66a" opacity=".7" />
          </g>
        )
      })}

      {Array.from({ length: lanterns }, (_, i) => {
        const t = (i + 0.5) / lanterns
        const k = 2 * t - 1
        const x = k * (spread * 0.62) + (rnd(i, 8) - 0.5) * 4
        const y = crownY + 12 * k * k - 3 + r * 0.95
        return (
          <g key={i}>
            <path d={`M${x} ${y - 4}v6`} stroke="#5c4129" strokeWidth=".7" />
            <circle cx={x} cy={y + 6} r="6.4" fill={`url(#${id}l)`} className="tribe-anim" style={{ animation: `tribe-glow 2.${i + 2}s ease-in-out infinite` }} />
            <rect x={x - 1.8} y={y + 3} width="3.6" height="5" rx="1" fill="#ffcf70" stroke={BARK} strokeWidth=".6" />
          </g>
        )
      })}

      {legend && (
        <g>
          <path d={`M0 ${crownY - 45}l2.4 5.2 5.6.6-4.2 3.8 1.2 5.6L0 ${crownY - 32}l-5 3.2 1.2-5.6-4.2-3.8 5.6-.6z`} fill="#ffd96a" stroke="#b8860b" strokeWidth=".7" strokeLinejoin="round" className="tribe-anim" style={{ animation: 'tribe-glow 2.2s ease-in-out infinite' }} />
          {[[-34, -62], [38, -58], [-14, -76], [20, -74], [-48, -44], [52, -40]].map(([x, y], i) => (
            <circle key={i} cx={x} cy={y} r="1.5" fill="#ffe08a" className="tribe-anim" style={{ animation: `tribe-spark 2.6s ease-out ${i * 0.45}s infinite` }} />
          ))}
        </g>
      )}
    </g>
  )
}
