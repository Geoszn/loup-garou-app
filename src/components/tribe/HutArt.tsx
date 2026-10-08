// Les six designs de case du village, un par groupe de rang (nouveau venu, apprenti,
// éclaireur, doyen, sage, légende). Dessin « jeu de stratégie » : volumes en
// dégradé, contour épais brun foncé, lumière en haut à gauche, ombre de contact,
// textures découpées dans la forme. Chaque dessin tient dans une boîte de 50 × 58 ;
// les ornements (mâts, bannières, halo) peuvent déborder un peu.
import type { ReactNode } from 'react'
import type { TribeRole } from '../../lib/tribe'

const OUT = '#2b1a10'
const BW = 1.5 // épaisseur du contour

type Grad = [number, string][]
function LG({ id, stops, v }: { id: string; stops: Grad; v?: boolean }) {
  return (
    <linearGradient id={id} x1="0" y1="0" x2={v ? 0 : 1} y2={v ? 1 : 0}>
      {stops.map(([o, c], i) => <stop key={i} offset={o} stopColor={c} />)}
    </linearGradient>
  )
}

/** Point de la courbe d'avant-toit (de gauche à droite, t de 0 à 1). */
const eaveY = (eave: number, drop: number, t: number) => eave + 2 * t * (1 - t) * drop

type Mat = { l: string; m: string; d: string }
interface HutProps { id: string; band: string; online: boolean }

/** Mur cylindrique. */
function Wall({ id, c, x0 = 8, x1 = 42, top = 30, bottom = 51, tex }: { id: string; c: Mat; x0?: number; x1?: number; top?: number; bottom?: number; tex?: ReactNode }) {
  const d = `M${x0} ${top}V${bottom - 3}C${x0} ${bottom + 1} ${x0 + 7} ${bottom + 3.5} 25 ${bottom + 3.5}S${x1} ${bottom + 1} ${x1} ${bottom - 3}V${top}Z`
  return (
    <g>
      <defs>
        <LG id={`${id}-w`} stops={[[0, c.l], [0.45, c.m], [1, c.d]]} />
        <LG id={`${id}-wv`} v stops={[[0, '#000'], [0.55, '#000'], [1, '#000']]} />
        <clipPath id={`${id}-wc`}><path d={d} /></clipPath>
      </defs>
      <path d={d} fill={`url(#${id}-w)`} />
      <g clipPath={`url(#${id}-wc)`}>
        {tex}
        {/* ombre portée du toit sur le mur, et assise plus sombre en bas */}
        <ellipse cx="25" cy={top + 1} rx={(x1 - x0) / 2 + 3} ry="5.5" fill="#000" opacity=".28" />
        <rect x={x0} y={bottom - 4} width={x1 - x0} height="12" fill="#000" opacity=".16" />
        <rect x={x0} y={top} width="3.2" height={bottom - top + 6} fill="#fff" opacity=".16" />
      </g>
      <path d={d} fill="none" stroke={OUT} strokeWidth={BW} strokeLinejoin="round" />
    </g>
  )
}

/** Silhouette de toit conique (pointe en haut), avec avant-toit courbe. */
function roofPath(apex: number, eave: number, rx: number, drop = 7, cx = 25) {
  return `M${cx} ${apex}C${cx - 3} ${apex + 11} ${cx - rx * 0.55} ${eave - 8} ${cx - rx} ${eave}Q${cx} ${eave + drop} ${cx + rx} ${eave}C${cx + rx * 0.55} ${eave - 8} ${cx + 3} ${apex + 11} ${cx} ${apex}Z`
}

function Roof({ id, c, apex = 3, eave = 32, rx = 24.5, drop = 7, tex, fringe }: { id: string; c: Mat; apex?: number; eave?: number; rx?: number; drop?: number; tex?: ReactNode; fringe?: string }) {
  const d = roofPath(apex, eave, rx, drop)
  return (
    <g>
      <defs>
        <LG id={`${id}-r`} stops={[[0, c.l], [0.42, c.m], [1, c.d]]} />
        <clipPath id={`${id}-rc`}><path d={d} /></clipPath>
      </defs>
      {fringe && <path d={fringe} fill={c.d} stroke={OUT} strokeWidth={BW} strokeLinejoin="round" />}
      <path d={d} fill={`url(#${id}-r)`} />
      <g clipPath={`url(#${id}-rc)`}>
        {tex}
        {/* reflet le long de l'arête gauche, arête sombre à droite */}
        <path d={`M25 ${apex}C22 ${apex + 11} ${25 - rx * 0.55} ${eave - 8} ${25 - rx} ${eave}`} fill="none" stroke="#fff" strokeOpacity=".35" strokeWidth="2.4" />
        <path d={`M25 ${apex}C28 ${apex + 11} ${25 + rx * 0.55} ${eave - 8} ${25 + rx} ${eave}`} fill="none" stroke="#000" strokeOpacity=".25" strokeWidth="3" />
      </g>
      <path d={d} fill="none" stroke={OUT} strokeWidth={BW} strokeLinejoin="round" />
    </g>
  )
}

/** Franges (mèches de chaume / bords de tuiles) le long de l'avant-toit. */
function fringePath(eave: number, rx: number, drop: number, n: number, depth: number, cx = 25) {
  const pts = Array.from({ length: n + 1 }, (_, i) => ({ x: cx - rx + (2 * rx * i) / n, y: eaveY(eave, drop, i / n) }))
  let d = `M${pts[0].x} ${pts[0].y}`
  for (let i = 0; i < n; i++) {
    const a = pts[i], b = pts[i + 1]
    d += `Q${(a.x + b.x) / 2} ${(a.y + b.y) / 2 + depth * 2} ${b.x} ${b.y}`
  }
  return d + `L${cx + rx} ${eave - 1}L${cx - rx} ${eave - 1}Z`
}

/** Bandeau de tissu aux couleurs de la tribu, noué autour de l'avant-toit. */
function Sash({ band, eave = 32, rx = 24.5, drop = 7 }: { band: string; eave?: number; rx?: number; drop?: number }) {
  const d = `M${25 - rx + 1.5} ${eave + 0.5}Q25 ${eave + drop + 0.5} ${25 + rx - 1.5} ${eave + 0.5}`
  return (
    <g fill="none" strokeLinecap="round">
      <path d={d} stroke={OUT} strokeWidth="5" transform="translate(0 2)" />
      <path d={d} stroke={band} strokeWidth="3.4" transform="translate(0 2)" />
      <path d={d} stroke="#fff" strokeOpacity=".4" strokeWidth="1" transform="translate(0 1)" />
    </g>
  )
}

function Door({ id, online, w = 10, frame = '#6a4224', arch = true, y = 53 }: { id: string; online: boolean; w?: number; frame?: string; arch?: boolean; y?: number }) {
  const x0 = 25 - w / 2
  const d = arch ? `M${x0} ${y}V${y - 10}a${w / 2} ${w / 2} 0 0 1 ${w} 0V${y}Z` : `M${x0} ${y}V${y - 11}h${w}V${y}Z`
  return (
    <g>
      <defs>
        <LG id={`${id}-d`} v stops={online ? [[0, '#ffe9a0'], [1, '#ff9f3a']] : [[0, '#241528'], [1, '#0e0814']]} />
      </defs>
      <path d={d} fill={`url(#${id}-d)`} stroke={frame} strokeWidth="2" strokeLinejoin="round" />
      <path d={d} fill="none" stroke={OUT} strokeWidth="0.9" />
    </g>
  )
}

const Shadow = ({ rx = 21, online }: { rx?: number; online: boolean }) => (
  <>
    <ellipse cx="25" cy="53" rx={rx} ry="5.5" fill="#000" opacity=".38" />
    {online && <ellipse cx="25" cy="50" rx={rx + 3} ry="10" fill="#ffcf6b" opacity=".3" />}
  </>
)

const Knob = ({ cy = 3, r = 2.6, fill = '#e8c35a' }: { cy?: number; r?: number; fill?: string }) => (
  <g>
    <circle cx="25" cy={cy} r={r} fill={fill} stroke={OUT} strokeWidth="1.1" />
    <circle cx="24.2" cy={cy - 0.8} r={r * 0.35} fill="#fff" opacity=".7" />
  </g>
)

// ---------------------------------------------------------------------------
// 1. Nouveau venu : tente de peaux rapiécées, mâts croisés, rondins
function Hut1({ id, band, online }: HutProps) {
  const d = 'M25 9C25 22 13 38 2.5 52Q25 58 47.5 52C37 38 25 22 25 9Z'
  return (
    <g>
      <defs>
        <LG id={`${id}-t`} stops={[[0, '#e2bf84'], [0.45, '#bd9358'], [1, '#7a5630']]} />
        <clipPath id={`${id}-tc`}><path d={d} /></clipPath>
      </defs>
      <Shadow rx={22} online={online} />
      <path d={d} fill={`url(#${id}-t)`} />
      <g clipPath={`url(#${id}-tc)`}>
        <path d="M25 9C21 24 12 40 2.5 52" fill="none" stroke="#fff" strokeOpacity=".35" strokeWidth="3" />
        <path d="M25 9L25 54M25 9L13 54M25 9L37 54" stroke="#5a3d1c" strokeOpacity=".5" strokeWidth=".9" />
        <path d="M11 38h9v8h-9z" fill="#8fb07a" stroke="#4a3a1c" strokeWidth=".7" transform="rotate(-8 15 42)" />
        <path d="M31 30h8v7h-8z" fill="#c9684a" stroke="#4a3a1c" strokeWidth=".7" transform="rotate(10 35 33)" />
        <path d="M13 40h-1.5M18 40h-1.5M31 32h-1.5M36 32h-1.5" stroke="#3a2a14" strokeWidth=".7" />
        <ellipse cx="25" cy="55" rx="26" ry="6" fill="#000" opacity=".2" />
      </g>
      <path d={d} fill="none" stroke={OUT} strokeWidth={BW} strokeLinejoin="round" />
      <path d="M8 46Q25 51 42 46" fill="none" stroke={OUT} strokeWidth="5" strokeLinecap="round" transform="translate(0 1)" />
      <path d="M8 46Q25 51 42 46" fill="none" stroke={band} strokeWidth="3.2" strokeLinecap="round" transform="translate(0 1)" />
      <Door id={id} online={online} w={11} frame="#4a3016" y={53.5} />
      {/* mâts croisés */}
      <path d="M21.5 14L28.5 6.5M28.5 14L21.5 6.5" stroke={OUT} strokeWidth="3.4" strokeLinecap="round" />
      <path d="M21.5 14L28.5 6.5M28.5 14L21.5 6.5" stroke="#9c6a3a" strokeWidth="1.8" strokeLinecap="round" />
      {/* rondins */}
      <g>
        <rect x="-3" y="48" width="11" height="4.6" rx="2.3" fill="#8a5a32" stroke={OUT} strokeWidth="1" />
        <ellipse cx="-2.6" cy="50.3" rx="1.5" ry="2.2" fill="#d9b27a" stroke={OUT} strokeWidth=".7" />
        <rect x="-1" y="44" width="10" height="4.6" rx="2.3" fill="#9c6a3a" stroke={OUT} strokeWidth="1" />
        <ellipse cx="-0.6" cy="46.3" rx="1.5" ry="2.2" fill="#d9b27a" stroke={OUT} strokeWidth=".7" />
      </g>
    </g>
  )
}

// 2. Apprenti : case de chaume dorée sur mur d'argile
function Hut2({ id, band, online }: HutProps) {
  const mat: Mat = { l: '#ffe58a', m: '#e0aa45', d: '#9a6a1e' }
  const n = 9
  const fringe = fringePath(32, 24.5, 7, n, 1.6)
  const bands = [0.2, 0.38, 0.56, 0.74].map((k, i) => {
    const w = 24.5 * (1 - k * 0.88)
    const y = 32 - k * 24
    return <path key={i} d={`M${25 - w} ${y}Q25 ${y + 7 * (1 - k)} ${25 + w} ${y}`} fill="none" stroke="#7a4e12" strokeOpacity=".5" strokeWidth=".9" />
  })
  const strands = Array.from({ length: 13 }, (_, i) => <path key={i} d={`M25 3L${0.5 + i * 4.1} 36`} stroke="#7a4e12" strokeOpacity=".28" strokeWidth=".7" />)
  return (
    <g>
      <Shadow online={online} />
      <Wall id={id} c={{ l: '#e0a878', m: '#b87c4e', d: '#6e4528' }} tex={<path d="M14 40l3 2-2 3M33 38l-2 3 3 2M20 47l2 2" fill="none" stroke="#4a2c14" strokeOpacity=".4" strokeWidth=".8" />} />
      <Door id={id} online={online} frame="#7a4a24" />
      <Roof id={id} c={mat} fringe={fringe} tex={<>{bands}{strands}</>} />
      <Sash band={band} />
      <Knob fill="#b87c4e" />
    </g>
  )
}

// 3. Éclaireur : cabane de planches, toit de bardeaux, trophée et lance
function Hut3({ id, band, online }: HutProps) {
  const planks = [12, 17, 22, 27, 32, 37].map((x, i) => (
    <g key={i}>
      <path d={`M${x} 28V56`} stroke="#2a1408" strokeOpacity=".9" strokeWidth="1.15" />
      <path d={`M${x + 0.9} 28V56`} stroke="#ffd9a0" strokeOpacity=".22" strokeWidth=".8" />
      <path d={`M${x + 2} 36v3M${x + 1.5} 46v4`} stroke="#3a2010" strokeOpacity=".3" strokeWidth=".6" />
      <circle cx={x + 2.4} cy="34" r=".6" fill="#2a1608" /><circle cx={x + 2.4} cy="46" r=".6" fill="#2a1608" />
    </g>
  ))
  const shingles = [0, 1, 2, 3, 4, 5].flatMap((row) => {
    const y = 32 - row * 4.6
    const w = 24.5 * (1 - row * 0.15)
    const cnt = Math.max(3, Math.round(w / 3.2))
    return Array.from({ length: cnt }, (_, i) => {
      const x = 25 - w + ((i + (row % 2 ? 0.5 : 0)) * 2 * w) / cnt
      return <path key={`${row}-${i}`} d={`M${x} ${y - 4.6}v3.4q${w / cnt} 3 ${(2 * w) / cnt} 0v-3.4`} fill="none" stroke="#3a1c0c" strokeOpacity=".55" strokeWidth=".8" />
    })
  })
  return (
    <g>
      <Shadow online={online} />
      <Wall id={id} c={{ l: '#d49a62', m: '#a86a38', d: '#5e3820' }} tex={<>{planks}<path d="M8 38l34 2" stroke="#e8c46a" strokeOpacity=".0" /></>} />
      <path d="M8 42h34" stroke="#e8c46a" strokeWidth="2" strokeDasharray="3 2.4" opacity=".9" />
      <Door id={id} online={online} frame="#4a2c14" arch={false} />
      <Roof id={id} c={{ l: '#d08a52', m: '#a65a2e', d: '#5e2e16' }} fringe={fringePath(32, 24.5, 7, 10, 1.3)} tex={<>{shingles}</>} />
      <Sash band={band} />
      <Knob fill="#caa14a" />
      {/* crâne-trophée et défenses */}
      <g>
        <path d="M17 31q-5-5-1-12M33 31q5-5 1-12" fill="none" stroke={OUT} strokeWidth="4" strokeLinecap="round" />
        <path d="M17 31q-5-5-1-12M33 31q5-5 1-12" fill="none" stroke="#f6edd6" strokeWidth="2.4" strokeLinecap="round" />
      </g>
      {/* lance avec fanion */}
      <g>
        <path d="M46 56V16" stroke={OUT} strokeWidth="3" strokeLinecap="round" />
        <path d="M46 56V16" stroke="#9c6a3a" strokeWidth="1.6" strokeLinecap="round" />
        <path d="M46 8l-3.2 8.4h6.4z" fill="#e4e8ee" stroke={OUT} strokeWidth="1" strokeLinejoin="round" />
        <path d="M46 20h9l-2.6 3L55 26h-9z" fill="#d94a3a" stroke={OUT} strokeWidth=".9" strokeLinejoin="round" />
      </g>
    </g>
  )
}

// 4. Doyen : maison de pierre, toit de tuiles terre cuite, cheminée, totem
function Hut4({ id, band, online }: HutProps) {
  const rows = [0, 1, 2, 3].flatMap((r) => {
    const y = 36 + r * 5.4
    return Array.from({ length: 6 }, (_, i) => {
      const x = 8 + i * 6 + (r % 2 ? 3 : 0)
      return <path key={`${r}-${i}`} d={`M${x} ${y - 5.4}h6v4.4a3 3 0 0 1-6 0z`} fill="none" stroke="#2a1608" strokeOpacity=".4" strokeWidth=".7" />
    })
  })
  const tiles = [0, 1, 2, 3, 4, 5].flatMap((row) => {
    const y = 31 - row * 4.7
    const w = 24.5 * (1 - row * 0.14)
    const cnt = Math.max(3, Math.round(w / 3.3))
    return Array.from({ length: cnt }, (_, i) => {
      const wd = (2 * w) / cnt
      const x = 25 - w + i * wd + (row % 2 ? wd / 2 : 0)
      return <path key={`${row}-${i}`} d={`M${x} ${y - 4.7}h${wd}v3a${wd / 2} ${wd / 2} 0 0 1-${wd} 0z`} fill="#fff" fillOpacity=".08" stroke="#4a1c0c" strokeOpacity=".5" strokeWidth=".8" />
    })
  })
  return (
    <g>
      <Shadow online={online} />
      <Wall id={id} c={{ l: '#e3ddd2', m: '#a9a398', d: '#5e5a54' }} tex={<>{rows}</>} />
      <Door id={id} online={online} frame="#5a3a1c" />
      <path d="M19.5 44h11M19.5 48.5h11" stroke="#3a3a42" strokeWidth="1" opacity=".0" />
      {/* cheminée derrière le toit */}
      <g>
        <rect x="32" y="6" width="7" height="13" fill="#9a958c" stroke={OUT} strokeWidth="1.1" />
        <rect x="31" y="4" width="9" height="3.4" fill="#c9c4bb" stroke={OUT} strokeWidth="1.1" />
        <path d="M35.5 1.5c-3-2.5 2.5-4.5-.5-8M39 -1c-2.2-2.2 2-3.6-.4-6.6" fill="none" stroke="#f0eeea" strokeWidth="2.6" strokeLinecap="round" opacity=".75" />
      </g>
      <Roof id={id} c={{ l: '#ff9a62', m: '#d4602f', d: '#8a2e18' }} fringe={fringePath(32, 24.5, 7, 9, 1.4)} tex={<>{tiles}</>} />
      <Sash band={band} />
      <Knob fill="#d9d2c4" />
      {/* totem peint */}
      <g>
        <rect x="-1.5" y="22" width="6.6" height="33" rx="1.6" fill="#8a5a32" stroke={OUT} strokeWidth="1.2" />
        <rect x="-1.5" y="30" width="6.6" height="6" fill="#d94a3a" stroke={OUT} strokeWidth=".8" />
        <rect x="-1.5" y="40" width="6.6" height="6" fill="#f0c75a" stroke={OUT} strokeWidth=".8" />
        <circle cx="0.4" cy="33" r=".9" fill="#fff" /><circle cx="3.2" cy="33" r=".9" fill="#fff" />
        <path d="M-4 25l6.8-7.4L9.6 25z" fill="#3b82c4" stroke={OUT} strokeWidth="1.1" strokeLinejoin="round" />
      </g>
    </g>
  )
}

// 5. Sage : petite tour de pierre claire, toit bleu vernissé, étoile lumineuse
function Hut5({ id, band, online }: HutProps) {
  const tiles = [0, 1, 2, 3, 4, 5, 6].flatMap((row) => {
    const y = 31 - row * 3.9
    const w = 24.5 * (1 - row * 0.13)
    const cnt = Math.max(3, Math.round(w / 3.1))
    return Array.from({ length: cnt }, (_, i) => {
      const wd = (2 * w) / cnt
      const x = 25 - w + i * wd + (row % 2 ? wd / 2 : 0)
      return <path key={`${row}-${i}`} d={`M${x} ${y - 3.9}h${wd}v2.4a${wd / 2} ${wd / 2} 0 0 1-${wd} 0z`} fill="#bcd4ff" fillOpacity=".12" stroke="#142058" strokeOpacity=".5" strokeWidth=".7" />
    })
  })
  const bricks = [0, 1, 2, 3].flatMap((r) => Array.from({ length: 5 }, (_, i) => <rect key={`${r}-${i}`} x={8 + i * 7 + (r % 2 ? 3.5 : 0)} y={30 + r * 5.6} width="7" height="5.6" fill="none" stroke="#5a6288" strokeOpacity=".4" strokeWidth=".7" />))
  return (
    <g>
      <ellipse cx="25" cy="30" rx="30" ry="30" fill="#9ec0ff" opacity=".13" />
      <Shadow online={online} />
      <Wall id={id} c={{ l: '#ffffff', m: '#d4daea', d: '#7e86a6' }} tex={<>{bricks}</>} />
      {/* colonnes d'angle */}
      <rect x="7" y="30" width="3.6" height="23" rx="1.2" fill="#f0c75a" stroke={OUT} strokeWidth="1" />
      <rect x="39.4" y="30" width="3.6" height="23" rx="1.2" fill="#c9a03a" stroke={OUT} strokeWidth="1" />
      <Door id={id} online={online} frame="#d4a83a" />
      <g>
        <path d="M13 41v-3.4a2.4 2.4 0 0 1 4.8 0V41z" fill="#ffe08a" stroke={OUT} strokeWidth=".9" />
        <path d="M32.2 41v-3.4a2.4 2.4 0 0 1 4.8 0V41z" fill="#ffe08a" stroke={OUT} strokeWidth=".9" />
      </g>
      <Roof id={id} c={{ l: '#8fb4ff', m: '#4a6fd0', d: '#1e2c78' }} fringe={fringePath(32, 24.5, 7, 9, 1.4)} tex={<>{tiles}<path d="M25 3L25 33" stroke="#f0c75a" strokeWidth="1.8" /></>} />
      <Sash band={band} />
      {/* croissant doré sur le toit */}
      <path d="M21.4 15.4a5.2 5.2 0 1 0 6.2 6.4A6.2 6.2 0 0 1 21.4 15.4z" fill="#ffe08a" stroke={OUT} strokeWidth=".9" />
      {/* flèche et étoile */}
      <path d="M25 3V-6" stroke={OUT} strokeWidth="3" strokeLinecap="round" />
      <path d="M25 3V-6" stroke="#f0c75a" strokeWidth="1.5" strokeLinecap="round" />
      <circle cx="25" cy="-9" r="8" fill="#ffe08a" opacity=".3" />
      <path d="M25 -15l2.6 5.4 5.8.8-4.2 4 1 5.8L25 -2.2l-5.2 2.8 1-5.8-4.2-4 5.8-.8z" fill="#ffd54a" stroke={OUT} strokeWidth="1.1" strokeLinejoin="round" />
      {/* lanternes */}
      <g>
        <path d="M45.5 33v5" stroke={OUT} strokeWidth="1" />
        <rect x="43.2" y="38" width="4.8" height="7" rx="1.4" fill="#ffd36b" stroke={OUT} strokeWidth="1" />
        <circle cx="45.6" cy="41.5" r="7" fill="#ffd36b" opacity=".25" />
        <path d="M4.5 33v5" stroke={OUT} strokeWidth="1" />
        <rect x="2.2" y="38" width="4.8" height="7" rx="1.4" fill="#ffd36b" stroke={OUT} strokeWidth="1" />
        <circle cx="4.6" cy="41.5" r="7" fill="#ffd36b" opacity=".25" />
      </g>
    </g>
  )
}

// 6. Légende : palais doré à double toit, bannières, orbe lumineux
function Hut6({ id, band, online }: HutProps) {
  const lowTiles = [0, 1, 2].flatMap((row) => {
    const y = 36 - row * 4.2
    const w = 26 * (1 - row * 0.2)
    const cnt = Math.max(4, Math.round(w / 3.2))
    return Array.from({ length: cnt }, (_, i) => {
      const wd = (2 * w) / cnt
      const x = 25 - w + i * wd + (row % 2 ? wd / 2 : 0)
      return <path key={`${row}-${i}`} d={`M${x} ${y - 4.2}h${wd}v2.8a${wd / 2} ${wd / 2} 0 0 1-${wd} 0z`} fill="#fff" fillOpacity=".12" stroke="#7a4a0c" strokeOpacity=".5" strokeWidth=".7" />
    })
  })
  const upTiles = [0, 1, 2, 3].flatMap((row) => {
    const y = 22 - row * 3.9
    const w = 16 * (1 - row * 0.2)
    const cnt = Math.max(3, Math.round(w / 3))
    return Array.from({ length: cnt }, (_, i) => {
      const wd = (2 * w) / cnt
      const x = 25 - w + i * wd + (row % 2 ? wd / 2 : 0)
      return <path key={`${row}-${i}`} d={`M${x} ${y - 3.9}h${wd}v2.4a${wd / 2} ${wd / 2} 0 0 1-${wd} 0z`} fill="#fff" fillOpacity=".12" stroke="#7a4a0c" strokeOpacity=".5" strokeWidth=".7" />
    })
  })
  const gold: Mat = { l: '#fff0a0', m: '#f2b83c', d: '#a8680e' }
  return (
    <g>
      {/* rayons et halo */}
      <g opacity=".4">
        {Array.from({ length: 9 }, (_, i) => <path key={i} d={`M25 20L${25 + Math.cos(Math.PI + (i * Math.PI) / 8) * 40} ${20 + Math.sin(Math.PI + (i * Math.PI) / 8) * 40}`} stroke="#ffe08a" strokeOpacity=".22" strokeWidth="3.4" />)}
      </g>
      <ellipse cx="25" cy="24" rx="32" ry="30" fill="#ffe08a" opacity=".2" />
      <Shadow rx={23} online={online} />
      {/* marches */}
      <path d="M12 56h26l3 4H9z" fill="#d9cfb8" stroke={OUT} strokeWidth="1.2" strokeLinejoin="round" />
      <path d="M14 53.5h22l1.8 2.5H12.2z" fill="#f0e8d4" stroke={OUT} strokeWidth="1.1" strokeLinejoin="round" />
      <Wall id={id} c={{ l: '#fffbe8', m: '#efdca6', d: '#b09450' }} x0={9} x1={41} top={30} bottom={50} tex={<path d="M9 40h32M9 46h32" stroke="#b09450" strokeOpacity=".4" strokeWidth=".7" />} />
      <Door id={id} online={online} w={11} frame="#e0a82c" />
      {/* colonnes dorées */}
      {[8.6, 38.4].map((x, i) => (
        <g key={i}>
          <rect x={x} y="31" width="3.8" height="22" rx="1.4" fill={i ? '#c98f1e' : '#f6c84a'} stroke={OUT} strokeWidth="1" />
          <rect x={x - 0.8} y="30" width="5.4" height="2.6" rx="1" fill="#ffe27a" stroke={OUT} strokeWidth=".9" />
          <rect x={x - 0.8} y="51.4" width="5.4" height="2.4" rx="1" fill="#ffe27a" stroke={OUT} strokeWidth=".9" />
        </g>
      ))}
      {/* toit bas */}
      <Roof id={`${id}a`} c={gold} apex={17} eave={32} rx={26.5} drop={6.5} fringe={fringePath(32, 26.5, 6.5, 10, 1.4)} tex={<>{lowTiles}</>} />
      <Sash band={band} rx={26.5} drop={6.5} />
      {/* toit haut */}
      <Roof id={`${id}b`} c={gold} apex={1} eave={21} rx={16.5} drop={5} fringe={fringePath(21, 16.5, 5, 7, 1.2)} tex={<>{upTiles}</>} />
      {/* gemmes */}
      <circle cx="25" cy="28" r="2.4" fill="#e63a4a" stroke={OUT} strokeWidth="1" />
      <circle cx="24.3" cy="27.3" r=".8" fill="#fff" opacity=".8" />
      {/* orbe lumineux */}
      <circle cx="25" cy="-1" r="9" fill="#fff2a8" opacity=".35" />
      <circle cx="25" cy="1" r="3.8" fill="#ffd54a" stroke={OUT} strokeWidth="1.2" />
      <circle cx="23.8" cy="-0.2" r="1.2" fill="#fff" opacity=".85" />
      <path d="M25 -2.6V-12" stroke={OUT} strokeWidth="2.6" strokeLinecap="round" />
      <path d="M25 -2.6V-12" stroke="#e8dcc4" strokeWidth="1.2" strokeLinecap="round" />
      <path d="M25.6 -12h11.6l-3.2 3.8 3.2 3.8H25.6z" fill="#d94a3a" stroke={OUT} strokeWidth="1" strokeLinejoin="round" />
      {/* bannières */}
      {[0, 1].map((i) => (
        <path key={i} d={i ? 'M44 34h7v13l-3.5-2.6L44 47z' : 'M-1 34h7v13l-3.5-2.6L-1 47z'} fill="#d94a3a" stroke={OUT} strokeWidth="1.1" strokeLinejoin="round" />
      ))}
      <path d="M2.5 38.5l1 2 2.2.3-1.6 1.5.4 2.2-2-1-2 1 .4-2.2-1.6-1.5 2.2-.3zM47.5 38.5l1 2 2.2.3-1.6 1.5.4 2.2-2-1-2 1 .4-2.2-1.6-1.5 2.2-.3z" fill="#ffd54a" transform="translate(0 -1)" />
    </g>
  )
}

const HUTS = [Hut1, Hut2, Hut3, Hut4, Hut5, Hut6]

/** Pastille de fonction au pied de la case : couronne du chef, étoile d'un sous-chef. */
function RoleBadge({ role }: { role: TribeRole }) {
  if (role === 'membre') return null
  const chef = role === 'chef'
  return (
    <g transform="translate(38 47)">
      <circle r="5" fill={chef ? '#f6c84a' : '#6fb4ff'} stroke={OUT} strokeWidth="1.2" />
      <circle cx="-1.4" cy="-1.6" r="1.4" fill="#fff" opacity=".55" />
      {chef ? (
        <path d="M-3 1.6V-1.6l1.6 1.6L0-2.8l1.4 2.8 1.6-1.6v3.2z" fill="#a8680e" stroke={OUT} strokeWidth=".5" strokeLinejoin="round" />
      ) : (
        <path d="M0-3l1 2.1 2.3.3-1.7 1.6.4 2.3L0 2l-2 1.3.4-2.3-1.7-1.6 2.3-.3z" fill="#1e3f8a" />
      )}
    </g>
  )
}

/** Petits losanges dorés sous la porte : 1 à 3 selon le sous-palier atteint dans le groupe. */
function Pips({ n }: { n: number }) {
  if (n <= 0) return null
  return (
    <g>
      {Array.from({ length: n }, (_, i) => (
        <path key={i} d={`M${25 + (i - (n - 1) / 2) * 5.4} 52.4l2.1 2.4-2.1 2.4-2.1-2.4z`} fill="#ffd54a" stroke={OUT} strokeWidth=".8" strokeLinejoin="round" />
      ))}
    </g>
  )
}

/** La case d'un membre. `level` de 1 à 6 (groupe de rang), `pips` de 0 à 3. Les
 * identifiants des dégradés sont partagés entre toutes les cases du même design. */
export function Hut({ level, band, online, role, pips }: { level: number; band: string; online: boolean; role: TribeRole; pips: number }) {
  const Art = HUTS[Math.min(Math.max(level, 1), 6) - 1]
  return (
    <svg viewBox="0 0 50 58" className="block h-auto w-full overflow-visible" aria-hidden="true">
      <Art id={`hut${level}${online ? 'on' : 'off'}`} band={band} online={online} />
      <Pips n={pips} />
      <RoleBadge role={role} />
    </svg>
  )
}
