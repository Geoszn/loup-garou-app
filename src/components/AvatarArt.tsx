import { useId, type ReactNode } from 'react'
import { AVATAR_BGS, SKIN_TONES, type AvatarConfig, type AvatarMood } from '../lib/avatarParts'

// Dessin du buste d'un avatar (SVG 100×100), style « dessin animé détaillé » :
// pour chaque forme un aplat de base, un ton d'ombre et un ton de lumière, le
// tout cerclé d'un trait d'encre — chaque pièce est dessinée pour être
// reconnue d'un coup d'œil, même à petite taille (voir les `case` de
// hairBack/hairFront/outfitArt/headwearArt/faceAccessory, un par valeur de
// AvatarConfig dans lib/avatarParts.ts).
//
// Règles de superposition à garder en tête en ajoutant une pièce :
//  - ordre de dessin : cheveux arrière → cou → tenue → oreilles → tête →
//    cheveux avant → ombre de couvre-chef → visage → accessoire → couvre-chef ;
//  - casquette et chapeau (COVERING) « sont portés » : les cheveux se tassent
//    sous eux (voir `cover` dans hairBack/hairFront), le menton se relève (le
//    couvre-chef remonte pour dégager les yeux) et une ombre tombe sur le
//    visage ; un gélé remplace tout autre couvre-chef.
const INK = '#24150c'

function toRgb(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16)
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}
const toHex = (c: number[]) => '#' + c.map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join('')
const shade = (hex: string, amt: number) => toHex(toRgb(hex).map((v) => v + amt))
const mix = (a: string, b: string, t: number) => {
  const A = toRgb(a)
  const B = toRgb(b)
  return toHex(A.map((v, i) => v + (B[i] - v) * t))
}

const HEAD_PATHS: Record<AvatarConfig['face'], string> = {
  oval: 'M32 39C32 27 40 20.5 50 20.5S68 27 68 39C68 49 66.5 57 62 62.5C58.5 66.8 54 69 50 69S41.5 66.8 38 62.5C33.5 57 32 49 32 39Z',
  round: 'M31 42C31 28 39 21 50 21S69 28 69 42C69 56 61 68 50 68S31 56 31 42Z',
  square: 'M32 36C32 26 40 21 50 21S68 26 68 36V50C68 60 64 67 57 68.5H43C36 67 32 60 32 50Z',
  long: 'M34 38C34 26 41 19 50 19S66 26 66 38C66 50 65 60 61 66C57.5 70.5 54 72.5 50 72.5S42.5 70.5 39 66C35 60 34 50 34 38Z',
  heart: 'M32 37C32 27 40 21 50 21S68 27 68 37C68 46 65 55 59 63C55 68 52 71 50 71S45 68 41 63C35 55 32 46 32 37Z',
}
const SHOULDERS = 'M5 100C5 85 17 76 36 72.5L50 78L64 72.5C83 76 95 85 95 100Z'

/** Forme pleine avec contour d'encre. */
function P({ d, fill, w = 1.5, extra }: { d: string; fill: string; w?: number; extra?: object }) {
  return <path d={d} fill={fill} stroke={INK} strokeWidth={w} strokeLinejoin="round" strokeLinecap="round" {...extra} />
}
/** Trait de détail sans remplissage. */
function L({ d, c, w = 0.8, o = 1 }: { d: string; c: string; w?: number | string; o?: number | string }) {
  return <path d={d} fill="none" stroke={c} strokeWidth={w} strokeLinecap="round" strokeLinejoin="round" opacity={o} />
}

/** Tresse verticale : contour, âme, chevrons de tressage, perle au bout. */
function Braid({ x, y0, y1, bend = 0, h, bead = '#e0b04a', w = 4.4 }: { x: number; y0: number; y1: number; bend?: number; h: string; bead?: string; w?: number }) {
  const cx = x + bend
  const d = `M${x} ${y0}Q${cx} ${(y0 + y1) / 2} ${x + bend * 1.6} ${y1}`
  const links: ReactNode[] = []
  const n = Math.floor((y1 - y0) / 3.2)
  for (let i = 1; i < n; i++) {
    const t = i / n
    const px = x + bend * 1.6 * t * t + (cx - x) * 2 * t * (1 - t)
    const py = y0 + (y1 - y0) * t
    links.push(<path key={i} d={`M${px - w * 0.36} ${py - 1.3}l${w * 0.36} 1.5l${w * 0.36} -1.5`} fill="none" stroke={shade(h, 55)} strokeWidth=".7" strokeLinecap="round" opacity=".8" />)
  }
  const ex = x + bend * 1.6
  return (
    <g>
      <path d={d} fill="none" stroke={INK} strokeWidth={w + 1.7} strokeLinecap="round" />
      <path d={d} fill="none" stroke={h} strokeWidth={w} strokeLinecap="round" />
      {links}
      <circle cx={ex} cy={y1 + 0.6} r="1.7" fill={bead} stroke={INK} strokeWidth=".7" />
    </g>
  )
}

/** Boule de cheveux crépus : disque de bosses (contour d'abord, remplissage ensuite). */
function CurlBlob({ cx, cy, r, bumps, br, h, curls }: { cx: number; cy: number; r: number; bumps: number; br: number; h: string; curls?: boolean }) {
  const pts: [number, number][] = []
  for (let i = 0; i < bumps; i++) {
    const a = (i / bumps) * Math.PI * 2
    pts.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r])
  }
  return (
    <g>
      <g fill={INK} stroke={INK} strokeWidth="3.2">
        <circle cx={cx} cy={cy} r={r} />
        {pts.map(([x, y], i) => (
          <circle key={i} cx={x} cy={y} r={br} />
        ))}
      </g>
      <g fill={h}>
        <circle cx={cx} cy={cy} r={r} />
        {pts.map(([x, y], i) => (
          <circle key={i} cx={x} cy={y} r={br} />
        ))}
      </g>
      {curls &&
        pts.map(([x, y], i) => (
          <path key={'c' + i} d={`M${x - 2.4} ${y + 1.2}c.6-2.6 4-3.2 4.8-.8`} fill="none" stroke={shade(h, 60)} strokeWidth=".8" strokeLinecap="round" opacity=".7" />
        ))}
    </g>
  )
}

/** Couvre-chefs qui recouvrent le haut de la tête : les cheveux ne gardent
 * leur volume que sur les côtés, sous le bord. */

/** Ensemble de disques de cheveux : tous les contours d'abord, tous les remplissages ensuite (union nette). */
function CircleSet({ pts, r, h, swirl }: { pts: [number, number][]; r: number; h: string; swirl?: boolean }) {
  return (
    <g>
      <g fill={INK} stroke={INK} strokeWidth="2.8">
        {pts.map(([x, y], i) => (
          <circle key={i} cx={x} cy={y} r={r} />
        ))}
      </g>
      <g fill={h}>
        {pts.map(([x, y], i) => (
          <circle key={i} cx={x} cy={y} r={r} />
        ))}
      </g>
      {swirl &&
        pts.map(([x, y], i) => (
          <path key={'s' + i} d={`M${x - r * 0.55} ${y + r * 0.15}c0-${r * 0.9} ${r * 1.1}-${r * 1.0} ${r * 1.1}-${r * 0.1}`} fill="none" stroke={shade(h, 60)} strokeWidth=".8" strokeLinecap="round" opacity=".65" />
        ))}
    </g>
  )
}

/** Natte vue de face : une chaîne de brins qui se croisent, de la racine (cachée
 * sous les cheveux) jusqu'à un élastique, avec une pointe qui s'amincit. */
function Plait({ p0, p1, p2, w0 = 5.6, w1 = 3.6, h, tie = '#fff6fb' }: { p0: [number, number]; p1: [number, number]; p2: [number, number]; w0?: number; w1?: number; h: string; tie?: string }) {
  const n = 17
  const pt = (t: number): [number, number] => {
    const u = 1 - t
    return [u * u * p0[0] + 2 * u * t * p1[0] + t * t * p2[0], u * u * p0[1] + 2 * u * t * p1[1] + t * t * p2[1]]
  }
  const ang = (t: number) => {
    const u = 1 - t
    const dx = 2 * u * (p1[0] - p0[0]) + 2 * t * (p2[0] - p1[0])
    const dy = 2 * u * (p1[1] - p0[1]) + 2 * t * (p2[1] - p1[1])
    return (Math.atan2(dy, dx) * 180) / Math.PI
  }
  const len = Math.hypot(p2[0] - p0[0], p2[1] - p0[1]) * 1.06
  const seg = len / n
  const dark = shade(h, -26)
  const [ex, ey] = pt(1)
  return (
    <g>
      <path d={`M${p0[0]} ${p0[1]}Q${p1[0]} ${p1[1]} ${p2[0]} ${p2[1]}`} fill="none" stroke={INK} strokeWidth={(w0 + w1) / 2 + 1.5} strokeLinecap="round" />
      <path d={`M${p0[0]} ${p0[1]}Q${p1[0]} ${p1[1]} ${p2[0]} ${p2[1]}`} fill="none" stroke={dark} strokeWidth={(w0 + w1) / 2 - 0.2} strokeLinecap="round" />
      {Array.from({ length: n }, (_, i) => {
        const t = (i + 0.5) / n
        const [x, y] = pt(t)
        const w = w0 + (w1 - w0) * t
        const tilt = i % 2 ? 30 : -30
        return (
          <g key={i} transform={`rotate(${ang(t) - 90 + tilt} ${x} ${y})`}>
            <ellipse cx={x} cy={y} rx={w * 0.46} ry={seg * 0.95} fill={i % 2 ? h : shade(h, 10)} stroke={INK} strokeWidth=".55" />
            <path d={`M${x - w * 0.16} ${y - seg * 0.55}L${x - w * 0.06} ${y + seg * 0.45}`} fill="none" stroke={shade(h, 62)} strokeWidth=".6" strokeLinecap="round" opacity=".75" />
          </g>
        )
      })}
      <ellipse cx={ex} cy={ey} rx={w1 * 0.56} ry="1.15" fill={tie} stroke={INK} strokeWidth=".6" transform={`rotate(${ang(1) - 90} ${ex} ${ey})`} />
      <path d={`M${ex - 1.7} ${ey + 0.8}C${ex - 2.8} ${ey + 4.6} ${ex + 2.8} ${ey + 4.6} ${ex + 1.7} ${ey + 0.8}Z`} fill={h} stroke={INK} strokeWidth=".6" strokeLinejoin="round" />
    </g>
  )
}

/** Hibiscus : cinq pétales, cœur jaune, deux feuilles. */
function Hibiscus({ x, y, r = 3.4, c = '#ff4f93' }: { x: number; y: number; r?: number; c?: string }) {
  return (
    <g>
      <ellipse cx={x - r * 1.5} cy={y + r * 0.7} rx={r * 0.5} ry={r * 1.1} fill="#2f8a4a" stroke={INK} strokeWidth=".4" transform={`rotate(-62 ${x - r * 1.5} ${y + r * 0.7})`} />
      <ellipse cx={x + r * 1.5} cy={y + r * 0.7} rx={r * 0.5} ry={r * 1.1} fill="#2f8a4a" stroke={INK} strokeWidth=".4" transform={`rotate(62 ${x + r * 1.5} ${y + r * 0.7})`} />
      {[0, 72, 144, 216, 288].map((a) => (
        <ellipse key={a} cx={x} cy={y - r * 0.62} rx={r * 0.62} ry={r * 0.9} fill={c} stroke={INK} strokeWidth=".45" transform={`rotate(${a} ${x} ${y})`} />
      ))}
      <circle cx={x} cy={y} r={r * 0.36} fill="#ffd54a" stroke={INK} strokeWidth=".35" />
    </g>
  )
}

/** Étincelle à quatre branches. */
const sparkle = (x: number, y: number, r: number) =>
  `M${x} ${y - r * 2.4}L${x + r * 0.6} ${y - r * 0.6}L${x + r * 2.4} ${y}L${x + r * 0.6} ${y + r * 0.6}L${x} ${y + r * 2.4}L${x - r * 0.6} ${y + r * 0.6}L${x - r * 2.4} ${y}L${x - r * 0.6} ${y - r * 0.6}Z`

/** Fond « Nuit étoilée rose » (fond n°6 des avatars). */
function nightSky(uid: string): ReactNode {
  return (
    <>
      <defs>
        <linearGradient id={`${uid}ns`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#2a0f45" />
          <stop offset=".6" stopColor="#7a2a78" />
          <stop offset="1" stopColor="#e0558f" />
        </linearGradient>
      </defs>
      <rect width="100" height="100" fill={`url(#${uid}ns)`} />
      {[[12, 16, 1.5], [30, 7, 0.9], [80, 11, 1.7], [91, 30, 0.9], [7, 42, 0.8], [93, 54, 1.2], [21, 60, 0.9], [68, 5, 0.8], [88, 70, 0.9], [10, 74, 1.1]].map(([x, y, r]) => (
        <path key={`${x}-${y}`} d={sparkle(x, y, r)} fill={r > 1 ? '#fff6fb' : '#ffd1e6'} opacity=".92" />
      ))}
    </>
  )
}

const arc = (n: number, a0: number, a1: number, cx: number, cy: number, rx: number, ry: number): [number, number][] =>
  Array.from({ length: n }, (_, i) => {
    const a = Math.PI * (a0 + ((a1 - a0) * i) / (n - 1))
    return [cx + rx * Math.cos(a), cy + ry * Math.sin(a)]
  })

/** Bord festonné : n arcs entre x0 et x1 à la hauteur y, creux de `depth`. */
function scallop(x0: number, x1: number, y: number, n: number, depth: number): string {
  const step = (x1 - x0) / n
  let d = ''
  for (let i = 0; i < n; i++) {
    const xa = x0 + step * i
    const xb = xa + step
    d += `Q${(xa + xb) / 2} ${y + depth} ${xb} ${y}`
  }
  return d
}

/** Mèches qui encadrent le visage et retombent devant les épaules (cheveux longs). */
function curtains(kind: AvatarConfig['hair'], h: string): ReactNode {
  const hl = shade(h, 52)
  if (kind === 'malibu_wave') {
    return (
      <>
        <P d="M31.4 42C28 52 33.4 60 29.4 70C26 78 31 84 34 90L41 86C37.6 78 42 70 38.6 60C36.4 51.6 38.4 45 36.6 40Z" fill={h} />
        <P d="M68.6 42C72 52 66.6 60 70.6 70C74 78 69 84 66 90L59 86C62.4 78 58 70 61.4 60C63.6 51.6 61.6 45 63.4 40Z" fill={h} />
        <L d="M34.4 52c-2 6 2 10 0 16M64 54c2 6-2 10 0 16" c={hl} w="1.1" o={0.7} />
        <L d="M32.6 74c1.6 4 .6 8 2.6 12M67.4 74c-1.6 4-.6 8-2.6 12" c={hl} w="1" o={0.6} />
      </>
    )
  }
  return (
    <>
      <P d="M31.4 41.6C30.4 54 29.6 68 29 82C32 84 36 84 39 82C37.6 68 38.2 54 36.4 40Z" fill={h} />
      <P d="M68.6 41.6C69.6 54 70.4 68 71 82C68 84 64 84 61 82C62.4 68 61.8 54 63.6 40Z" fill={h} />
      <L d="M33.6 46c-.6 10-.8 20-.6 30M66.4 46c.6 10 .8 20 .6 30" c={hl} w="1.2" o={0.55} />
    </>
  )
}

const HAIR_COLORS: Partial<Record<AvatarConfig['hair'], string>> = {
  braids: '#2a1a10', locs: '#241610', malibu_wave: '#f4c95d',
  braids_pink: '#ff6fae', afro_pink: '#f8a9cb', ponytail_pop: '#ff5fa0', pompadour_ken: '#f2c14e',
}

const COVERING: AvatarConfig['head'][] = ['cap', 'hat', 'cowboy_pink']
// Foulards : ils cachent les cheveux comme un couvre-chef, sans ombre portée sur le visage.
const HAIR_HIDING: AvatarConfig['head'][] = ['scarf_pink', 'bandana_biker']

function hairBack(kind: AvatarConfig['hair'], h: string, cover = false, hide = false): ReactNode {
  if (hide) return null
  if (cover && (kind === 'afro' || kind === 'afro_pink')) {
    return (
      <>
        <CurlBlob cx={30} cy={43} r={3.6} bumps={6} br={5.4} h={h} curls />
        <CurlBlob cx={70} cy={43} r={3.6} bumps={6} br={5.4} h={h} curls />
      </>
    )
  }
  if (cover && (kind === 'puffs' || kind === 'ponytail_pop')) return null
  switch (kind) {
    case 'long':
      return <P d="M26.4 40C25.4 24 35 16.4 50 16.4S74.6 24 73.6 40L76 90H24Z" fill={h} />
    case 'malibu_wave':
      return <P d="M26 40C25 24 35.4 16 50 16S75 24 74 40C77 52 72 60 75.6 70C78 78 72 84 75 92H25C28 84 22 78 24.4 70C28 60 23 52 26 40Z" fill={h} />
    case 'afro':
    case 'afro_pink':
      return <CurlBlob cx={50} cy={35} r={21} bumps={14} br={8.4} h={h} curls />
    case 'braids':
      return (
        <>
          {[25, 29, 33].map((x, i) => (
            <Braid key={x} x={x} y0={34} y1={74 + i * 3} bend={-3 + i} h={h} />
          ))}
          {[67, 71, 75].map((x, i) => (
            <Braid key={x} x={x} y0={34} y1={77 - i * 3} bend={3 - i} h={h} />
          ))}
        </>
      )
    case 'ponytail_pop':
      return (
        <>
          <P d="M68 22C80 15 93 27 91 46C90 58 85 68 79 77C79.6 67 77 60.6 74.6 54C72 46 70 38 66 30Z" fill={h} />
          <L d="M74 24c7 1 11 8 11 17M78 34c3 6 4 14 1 24" c={shade(h, 52)} w="1.2" o={0.6} />
          <L d="M82 56c-1.6 6-3.4 10-5.6 14M86 46c-.4 5-1.4 9-3 13" c={shade(h, -38)} w="1.1" o={0.7} />
        </>
      )
    case 'puffs':
      return (
        <>
          <CurlBlob cx={29} cy={26} r={5} bumps={8} br={6} h={h} curls />
          <CurlBlob cx={71} cy={26} r={5} bumps={8} br={6} h={h} curls />
        </>
      )
    case 'locs':
      return (
        <>
          {[24, 28, 32, 36].map((x, i) => (
            <Braid key={x} x={x} y0={32} y1={70 + ((i * 7) % 12)} bend={-2.5} h={h} bead={h} w={4.8} />
          ))}
          {[64, 68, 72, 76].map((x, i) => (
            <Braid key={x} x={x} y0={32} y1={73 - ((i * 5) % 11)} bend={2.5} h={h} bead={h} w={4.8} />
          ))}
        </>
      )
    default:
      return null
  }
}

/** Pattes et mèches sur les tempes, visibles sous le bord d'un chapeau ou d'une casquette. */
function templeHair(h: string): ReactNode {
  return (
    <>
      <P d="M32.2 36.6C31 41 31.6 47 33.6 51.4L36 46.4C35.2 43 35.2 40 36 37Z" fill={h} w={1.3} />
      <P d="M67.8 36.6C69 41 68.4 47 66.4 51.4L64 46.4C64.8 43 64.8 40 64 37Z" fill={h} w={1.3} />
      <L d="M33.6 40c-.3 3 0 6 .8 8.6M66.4 40c.3 3 0 6-.8 8.6" c={shade(h, 52)} w=".7" o={0.6} />
    </>
  )
}

/** Barbe taillée : suit exactement le contour du visage (rognée à la tête),
 * fine sur les tempes où elle se fond dans les cheveux, puis s'élargit sur la
 * mâchoire ; la ligne de joue est nette, la moustache rejoint la barbe et la
 * bouche reste dégagée. */
function beardArt(hair: string, uid: string, headPath: string): ReactNode {
  // la barbe est un peu plus claire que les cheveux : on la distingue sans que ça fasse un masque
  const h = shade(hair, 12)
  const hl = shade(h, 46)
  const cheek = 'M35 44C35.2 46.6 36 48.6 36.8 50.4C38.4 54.4 40.6 56.4 43 57.2C45 55.2 47.8 55.6 50 57C52.2 55.6 55 55.2 57 57.2C59.4 56.4 61.6 54.4 63.2 50.4C64 48.6 64.8 46.6 65 44'
  const mouth = 'M43.4 59.6C46.4 58.2 53.6 58.2 56.6 59.6C56.6 63.8 54 65.6 50 65.6S43.4 63.8 43.4 59.6Z'
  return (
    <>
      <clipPath id={`${uid}bl`}>
        <rect x="0" y="46" width="100" height="60" />
      </clipPath>
      <g clipPath={`url(#${uid}hd)`}>
        <path d={`M31 35H35C35 41 35 44 35 44${cheek.slice(cheek.indexOf('C'))}C65 41 65 41 65 35H69V90H31ZM${mouth.slice(1)}`} fill={h} fillRule="evenodd" />
        <L d="M37.2 48c1 4 2.6 7.4 5.6 10M62.8 48c-1 4-2.6 7.4-5.6 10M38 58c2.4 4.6 6 8.4 11 10.4M62 58c-2.4 4.6-6 8.4-11 10.4M44 68c2 1.8 4 2.8 6 3M56 68c-2 1.8-4 2.8-6 3" c={hl} w=".8" o={0.5} />
        <L d="M36 38c.2 3 .4 5.4 1 7.6M64 38c-.2 3-.4 5.4-1 7.6" c={hl} w=".6" o={0.45} />
        <L d={cheek} c={h} w="3.4" o={0.4} />
      </g>
      <path d={mouth} fill="none" stroke={INK} strokeWidth=".7" opacity=".5" />
      <path d="M41.4 58.4C43.6 55 47.4 55.8 50 57.2C52.6 55.8 56.4 55 58.6 58.4" fill="none" stroke={INK} strokeWidth=".8" strokeLinecap="round" opacity=".55" />
      <g clipPath={`url(#${uid}bl)`}>
        <path d={headPath} fill="none" stroke={INK} strokeWidth="1.6" strokeLinejoin="round" />
      </g>
    </>
  )
}

/** Tresses roses : trois nattes de chaque côté, qui naissent sous le bord des
 * cheveux et retombent devant les épaules. */
function pinkPlaits(h: string): ReactNode {
  const specs: [[number, number], [number, number], [number, number]][] = [
    [[32.4, 38], [28.6, 60], [30.4, 88]],
    [[31, 40.5], [24.4, 62], [23, 91]],
    [[30.2, 43.4], [19.6, 64], [16.4, 93.4]],
  ]
  const mir = (pt: [number, number]): [number, number] => [100 - pt[0], pt[1]]
  return (
    <>
      {[...specs].reverse().map(([a, b, c], i) => (
        <Plait key={`l${i}`} p0={a} p1={b} p2={c} h={h} />
      ))}
      {[...specs].reverse().map(([a, b, c], i) => (
        <Plait key={`r${i}`} p0={mir(a)} p1={mir(b)} p2={mir(c)} h={h} />
      ))}
    </>
  )
}

function hairFront(kind: AvatarConfig['hair'], h: string, uid: string, headPath: string, cover = false, hide = false): ReactNode {
  const hl = shade(h, 52)
  const hd = shade(h, -10)
  // Foulard / bandana : tous les cheveux sont couverts, seule la barbe reste visible.
  if (hide) return kind === 'beard_full' ? beardArt(h, uid, headPath) : null
  if (cover && kind !== 'gele') {
    if (kind === 'long' || kind === 'malibu_wave') return <>{templeHair(h)}{curtains(kind, h)}</>
    if (kind === 'beard_full') return <>{templeHair(h)}{beardArt(h, uid, headPath)}</>
    if (kind === 'braids_pink') return <>{templeHair(h)}{pinkPlaits(h)}</>
    return templeHair(h)
  }
  const hs = shade(h, -55)
  switch (kind) {
    case 'bun':
      return (
        <>
          <P d="M31.6 41.5C30.5 27 39 20 50 20S69.5 27 68.4 41.5C66.4 35.4 62.5 32 58 31.2 53.5 32.2 46.5 32.2 42 31.2 37.4 32 33.6 35.4 31.6 41.5Z" fill={h} />
          <L d="M39 27c3-2.4 6.4-4.6 9-8.4M61 27c-3-2.4-6.4-4.6-9-8.4M36 33c2.4-1.6 5-3.2 7-5.4M64 33c-2.4-1.6-5-3.2-7-5.4" c={hs} w=".8" o={0.8} />
          <L d="M37 26c4-3.6 9-5.2 14-4.6" c={hl} w="1.8" o={0.38} />
          <P d="M40.6 12.4C40 6.6 44.6 3.6 50 3.6S60 6.6 59.4 12.4C59 17.4 55 20.6 50 20.6S41 17.4 40.6 12.4Z" fill={h} />
          <L d="M43.4 8.4c3.4-2.2 7.8-2.2 11.2 0M42.6 12.6c4.6-2.8 10.2-2.8 14.8 0M44 16.2c3.6-1.8 8.4-1.8 12 0" c={hl} w=".8" o={0.55} />
          <path d="M42 19.4C46 22 54 22 58 19.4L57.6 22.6C54 24.4 46 24.4 42.4 22.6Z" fill="#e0b04a" stroke={INK} strokeWidth=".9" strokeLinejoin="round" />
        </>
      )
    case 'topknot':
      return (
        <>
          <P d="M33.6 37C32.6 28 39.6 21.6 50 21.6S67.4 28 66.4 37C63.6 33 58 31 50 31S36.4 33 33.6 37Z" fill={h} />
          <path d="M32.2 38C31.4 31 34 26 38 23.4M67.8 38C68.6 31 66 26 62 23.4" fill="none" stroke={h} strokeWidth="3" opacity=".42" strokeLinecap="round" />
          <L d="M38 27c3.6-2.6 8-3.6 12-3.2" c={hl} w="1.6" o={0.4} />
          <P d="M43 14.4C42.6 9.4 46 7.2 50 7.2S57.4 9.4 57 14.4C56.6 18.6 53.6 21 50 21S43.4 18.6 43 14.4Z" fill={h} />
          <L d="M45.4 11c3-1.6 6.2-1.6 9.2 0M44.8 14.6c3.4-2 7-2 10.4 0" c={hl} w=".8" o={0.55} />
          <path d="M44.6 20.2C47.6 22 52.4 22 55.4 20.2L55 22.8C52.4 24 47.6 24 45 22.8Z" fill="#c2432a" stroke={INK} strokeWidth=".8" strokeLinejoin="round" />
        </>
      )
    case 'curly': {
      const outer = arc(11, 1, 2, 50, 36, 19.2, 16.4)
      const inner = arc(7, 1.1, 1.9, 50, 33, 11.6, 9)
      return (
        <>
          <P d="M32.6 41C31.6 30 38.6 25 50 25S68.4 30 67.4 41C65 35.4 61 32.6 56 32 52 32.8 48 32.8 44 32 39 32.6 35 35.4 32.6 41Z" fill={h} w={1.2} />
          <CircleSet pts={inner} r={5} h={h} swirl />
          <CircleSet pts={outer} r={4.8} h={h} swirl />
        </>
      )
    }
    case 'flat':
      return (
        <>
          <P d="M33.6 39C32.6 31 32.8 24 34.2 19.4C34.6 18.2 36 17.6 37.4 17.6H62.6C64 17.6 65.4 18.2 65.8 19.4C67.2 24 67.4 31 66.4 39C64.2 35 60 33 55 32.4H45C40 33 35.8 35 33.6 39Z" fill={h} />
          <L d="M36.6 21.2H63.4" c={hl} w="1.8" o={0.5} />
          <L d="M35.2 26h29.6M34.8 30.4h30.4" c={hs} w=".7" o={0.6} />
          <path d="M33 39c-.6 3.6-.2 7.6 1 11M67 39c.6 3.6.2 7.6-1 11" fill="none" stroke={h} strokeWidth="2.6" opacity=".5" strokeLinecap="round" />
        </>
      )
    case 'long':
      return (
        <>
          <P d="M31 42C29.6 26 39 19.6 50 19.6S70.4 26 69 42C67 34 62 30 56 29.4 53 29.2 51 29.6 50 30 49 29.6 47 29.2 44 29.4 38 30 33 34 31 42Z" fill={h} />
          <L d="M50 19.8V30" c={hl} w=".9" o={0.85} />
          <L d="M37 25c4-3.6 9-5.2 14-4.8M41 28.6c-1.6 1.8-3 3.8-3.6 6M59 28.6c1.6 1.8 3 3.8 3.6 6" c={hl} w="1.4" o={0.4} />
          {curtains('long', h)}
        </>
      )
    case 'malibu_wave':
      return (
        <>
          <P d="M30.6 43C29 26 39 19 50 19S71 26 69.4 43C67 35 61 30.4 55 28.6 50 31.6 40 33 33 40Z" fill={h} />
          <L d="M36 26c4-3.4 9-5 14-4.6M44 30c2.6-2 6-3.6 9-4" c={hl} w="1.5" o={0.6} />
          <L d="M56 22c4.4 2.6 6.6 7 6.6 12.6" c="#ff6fa5" w="3" o={1} />
          <L d="M57 23.4c3.4 2.2 5.2 5.6 5.4 9.6" c="#ffb3d1" w=".9" o={0.9} />
          {curtains('malibu_wave', h)}
          <L d="M32.6 56c-1 4 1 8 0 12" c="#ff6fa5" w="2.2" o={0.9} />
        </>
      )
    case 'knots': {
      const knots = arc(7, 1.06, 1.94, 50, 36, 19.4, 17)
      return (
        <>
          <P d="M32.6 41C31.6 30 38.6 24.6 50 24.6S68.4 30 67.4 41C65 35.4 61 32.6 56 32 52 32.8 48 32.8 44 32 39 32.6 35 35.4 32.6 41Z" fill={h} w={1.2} />
          <L d="M42 26.4C41 29 40.6 31 40.8 33M50 25.4V32.4M58 26.4C59 29 59.4 31 59.2 33" c={hs} w=".7" o={0.7} />
          {knots.map(([x, y], i) => (
            <g key={i}>
              <circle cx={x} cy={y} r="4.5" fill={h} stroke={INK} strokeWidth="1.3" />
              <path d={`M${x - 2.4} ${y + 1}c-.2-2.6 2.2-3.6 3.6-2.2 1.2 1.4-.2 3.2-1.6 2.6`} fill="none" stroke={hl} strokeWidth=".9" strokeLinecap="round" opacity=".8" />
              <circle cx={x} cy={y + 3.6} r="1.2" fill="#e0b04a" stroke={INK} strokeWidth=".5" />
            </g>
          ))}
        </>
      )
    }
    case 'mohawk':
      return (
        <>
          <P d="M32.6 38C32 29 38 23.4 45 22C47 21.6 53 21.6 55 22C62 23.4 68 29 67.4 38C64.6 33.6 60 31.8 55.4 31H44.6C40 31.8 35.4 33.6 32.6 38Z" fill={h} w={1.2} extra={{ opacity: 0.55 }} />
          <P d="M43.8 31.6C42.6 24 42.8 15.6 45.2 8.4L47.4 12.6 50 3.6 52.6 12.6 54.8 8.4C57.2 15.6 57.4 24 56.2 31.6C53.4 30.4 46.6 30.4 43.8 31.6Z" fill={h} />
          <L d="M47.6 30V14M50 28V8M52.4 30V14" c={hl} w=".9" o={0.6} />
          <L d="M45.2 26c-.4-4-.2-8 .8-11.4" c={hl} w="1.4" o={0.5} />
        </>
      )
    case 'afro_pink':
    case 'afro':
      return (
        <>
          <P d="M32.5 40C31 27 39.5 20.5 50 20.5S69 27 67.5 40C65.5 35.4 62 32.6 57 32C53 32.8 47 32.8 43 32C38 32.6 34.5 35.4 32.5 40Z" fill={h} />
          {kind === 'afro_pink' && (
            <g fill="#fff6fb" stroke={INK} strokeWidth=".4">
              <path d={sparkle(41, 25.6, 1)} />
              <path d={sparkle(60, 24, 0.8)} />
              <path d={sparkle(51, 29.4, 0.6)} />
            </g>
          )}
          <L d="M38 27c3-3 7-4.6 11-4.6M54 22.6c4 .6 7 2.4 9 5" c={hl} w="1.6" o={0.45} />
          {[[36, 33], [41, 30.4], [47, 29], [53, 29], [59, 30.4], [64, 33]].map(([x, y]) => (
            <path key={x} d={`M${x - 2.2} ${y + 0.6}c.6-2.4 3.8-2.8 4.4-.2`} fill="none" stroke={hl} strokeWidth=".8" strokeLinecap="round" opacity=".7" />
          ))}
        </>
      )
    case 'braids_pink':
      return (
        <>
          {pinkPlaits(h)}
          <P d="M31 42C29.5 26 39 19 50 19S70.5 26 69 42C67 34.6 63 31.4 58 30.6 53.5 31.6 46.5 31.6 42 30.6 37 31.4 33 34.6 31 42Z" fill={h} />
          <L d="M50 19.4V30.8" c={shade(h, 52)} w=".9" o={0.85} />
          <L d="M43 20.4C40.8 24 40 27.4 40.6 31M36.5 23C34.6 26.2 33.8 29.4 34 33M57 20.4C59.2 24 60 27.4 59.4 31M63.5 23C65.4 26.2 66.2 29.4 66 33" c={shade(h, 52)} w=".8" o={0.7} />
          <L d="M38 24.4c4-3.6 9-5 14-4.6" c={shade(h, 52)} w="1.7" o={0.38} />
        </>
      )
    case 'braids':
      return (
        <>
          <P d="M31 42C29.5 26 39 19 50 19S70.5 26 69 42C67 34.6 63 31.4 58 30.6 53.5 31.6 46.5 31.6 42 30.6 37 31.4 33 34.6 31 42Z" fill={h} />
          {/* raies : une centrale + des séparations courbes qui dessinent les rangées de tresses */}
          <L d="M50 19.4V30.8" c={hl} w=".9" o={0.85} />
          <L d="M43 20.4C40.8 24 40 27.4 40.6 31M36.5 23C34.6 26.2 33.8 29.4 34 33M57 20.4C59.2 24 60 27.4 59.4 31M63.5 23C65.4 26.2 66.2 29.4 66 33" c={hl} w=".8" o={0.7} />
          <L d="M38 24.4c4-3.6 9-5 14-4.6" c={hl} w="1.7" o={0.38} />
          {[[40.5, 31.6], [34, 33.6], [59.5, 31.6], [66, 33.6]].map(([x, y]) => (
            <circle key={x} cx={x} cy={y} r="1.5" fill="#e0b04a" stroke={INK} strokeWidth=".6" />
          ))}
        </>
      )
    case 'puffs':
      return (
        <>
          <P d="M31.5 41C30.5 27 39 20 50 20S69.5 27 68.5 41C66.6 35 63 31.6 58 31 53.5 31.8 46.5 31.8 42 31 37 31.6 33.4 35 31.5 41Z" fill={h} />
          <L d="M50 20.4C49.4 24 49.4 28 50 31.2" c={hl} w=".9" o={0.8} />
          <L d="M38 25c4-3 9-4.4 14-4" c={hl} w="1.7" o={0.35} />
          {/* chouchous */}
          <path d="M31.2 28.4l-4.6 2.4 1.4 4.4 4.6-1.6zM68.8 28.4l4.6 2.4-1.4 4.4-4.6-1.6z" fill="#e0b04a" stroke={INK} strokeWidth=".9" strokeLinejoin="round" />
          {[[34, 36.6], [38.6, 33.4], [61.4, 33.4], [66, 36.6]].map(([x, y]) => (
            <path key={x} d={`M${x - 1.6} ${y}c.4-1.8 2.8-2 3.2 0`} fill="none" stroke={hl} strokeWidth=".7" opacity=".7" strokeLinecap="round" />
          ))}
        </>
      )
    case 'locs':
      return (
        <>
          <P d="M31 42C29.5 26 39 19.5 50 19.5S70.5 26 69 42C67 34.6 63 31.6 58 31 53.5 32 46.5 32 42 31 37 31.6 33 34.6 31 42Z" fill={h} />
          {[36, 41, 46, 51, 56, 61, 66].map((x, i) => (
            <circle key={x} cx={x - 1.5 + (i % 2)} cy={25 + (i % 3) * 2.6} r="1.5" fill="none" stroke={hl} strokeWidth=".7" opacity=".6" />
          ))}
          {[[30.5, 38], [34, 40], [66, 40], [69.5, 38]].map(([x, y], i) => (
            <Braid key={x} x={x} y0={y} y1={y + 36 + (i % 2) * 8} bend={x < 50 ? -1.5 : 1.5} h={h} bead={h} w={4.6} />
          ))}
        </>
      )
    case 'cornrows':
      return (
        <>
          <P d="M31.5 41.5C30.5 27 39 20 50 20S69.5 27 68.5 41.5C66.6 35.4 63 32 58 31.4 53.5 32.2 46.5 32.2 42 31.4 37 32 33.4 35.4 31.5 41.5Z" fill={hd} />
          {[
            'M50 20.6V31.6',
            'M45 21C44.4 24.6 44.2 28 44.6 31.6',
            'M55 21C55.6 24.6 55.8 28 55.4 31.6',
            'M40.2 22.4C38.8 26 38.4 29.6 39 32.8',
            'M59.8 22.4C61.2 26 61.6 29.6 61 32.8',
            'M35.8 25.4C34.4 28.6 33.8 32 34 35.6',
            'M64.2 25.4C65.6 28.6 66.2 32 66 35.6',
          ].map((d) => (
            <g key={d}>
              <L d={d} c={INK} w="2.8" />
              <L d={d} c={shade(h, 24)} w="1.7" />
              <L d={d} c={hl} w=".5" o={0.8} />
            </g>
          ))}
          <path d="M32 46c-1.4 4-1.2 9 1 13M68 46c1.4 4 1.2 9-1 13" fill="none" stroke={shade(h, 24)} strokeWidth="1.6" strokeLinecap="round" />
        </>
      )
    case 'gele': {
      const c = '#c2432a'
      const lt = '#e0623f'
      const dk = '#8e2a18'
      return (
        <>
          <defs>
            <linearGradient id={`${uid}gl`} x1="0" y1="0" x2="1" y2="1">
              <stop offset="0" stopColor={lt} />
              <stop offset="1" stopColor={dk} />
            </linearGradient>
          </defs>
          <P d="M26 40C21 25 29 11.5 44 10.5c8-5.6 22-4 28 5.5C78 24 77 32 74 40C69 33.4 61 31 50 31S31 33.4 26 40Z" fill={`url(#${uid}gl)`} />
          <L d="M30 33C34 20 46 14 62 17M28 38C32 28 42 22 56 22M35 36C38 28 46 25 58 26" c={dk} w="1" o={0.9} />
          <L d="M33 22C40 14.6 52 12 64 14.6M30 28C38 20 52 17 68 21" c={lt} w="1.5" o={0.8} />
          <path d="M28.4 31.4C37 24 52 22.4 71.6 28.4" fill="none" stroke="#ecc97d" strokeWidth="2.6" strokeLinecap="round" />
          <path d="M28.4 31.4C37 24 52 22.4 71.6 28.4" fill="none" stroke={INK} strokeWidth=".5" strokeLinecap="round" opacity=".5" />
          {/* l'éventail du nœud, côté droit */}
          <P d="M66 15C70 3.6 87 4 91 14.6 92 21.4 84 24 74.4 20.6 69.8 19 67.2 17.4 66 15Z" fill={c} />
          <P d="M71 22C84 18.6 97 25 92 35.4 88 40 79 38 74 31.4 72 28 71 25 71 22Z" fill={lt} />
          <L d="M70 14.6C77 8.6 85 8 89 13M72 20.6c8 .4 15-1.6 19-6.4" c={dk} w=".9" o={0.9} />
          <L d="M75 26c6 3 12 5 16 5M75 30.4c4 2.4 9 4 13 4.4" c={dk} w=".9" o={0.8} />
          <circle cx="68.4" cy="22" r="2.8" fill="#ecc97d" stroke={INK} strokeWidth=".8" />
        </>
      )
    }
    case 'ponytail_pop':
      return (
        <>
          <P d="M32.5 39C31.4 26 39.4 20 50 20S68.6 26 67.5 39C65.4 33.6 62 30.6 57 29.6 52.6 28.8 47.4 28.8 43 29.6 38 30.6 34.6 33.6 32.5 39Z" fill={h} />
          <L d="M42 21.6C50 21 59 22.4 66 26M38 26C48 24.6 59 26 67 29.6M36 31C46 28.6 57 29.4 65 32.6" c={hl} w="1" o={0.55} />
          <L d="M36 25c4-3 9-4.4 14-4" c={hl} w="1.6" o={0.4} />
          {/* chouchou */}
          <P d="M64.6 21.4C67.8 19 73.4 20.6 74 25C74.4 29.4 70 31.4 66.6 30C63.4 28.4 62.4 24 64.6 21.4Z" fill="#fff6fb" w={1.2} />
          <L d="M65.6 23.4c2.4 1.6 5 1.8 7.4.6M65.8 27.4c2.4 1 4.6 1 6.6-.2" c="#ff4f93" w=".8" o={0.9} />
        </>
      )
    case 'pompadour_ken':
      return (
        <>
          <P d="M31.8 40C28.6 25 32.6 11 46 7.6C59 4.8 71.6 11.6 68.2 40C66.4 34.6 62.4 31.4 57 30.4C49 28.4 41 29.6 36 32.6C34 34.2 32.8 36.6 31.8 40Z" fill={h} />
          <P d="M35.6 30C35 20 41.6 12.4 51 12C60.6 11.6 67 17.6 67.4 27C63 21.4 56 19.4 49 21.4C43 23 38.6 26.4 35.6 30Z" fill={shade(h, 14)} w={1.1} />
          <L d="M39 22C41.6 17 46.4 14.2 52 14M45 21C47 18 50.6 16.4 55 16.4M52 20C54 18.6 57.4 18.2 61 19.6" c={hl} w="1.2" o={0.8} />
          <L d="M33.6 33C33 25 35 17.6 40 12.4M60 8.4C66 9.6 69 14 68.6 22" c={hs} w=".9" o={0.6} />
          <L d="M42 10.6c4-2 9-2.2 13.4-.4" c="#fff4cf" w="1.6" o={0.7} />
        </>
      )
    case 'slick_back':
      return (
        <>
          <P d="M32.2 40C31.4 27.6 39 20 50 20S68.6 27.6 67.8 40C66 35 62.6 31.8 58 30.6C52 29 48 29 42 30.6C37.4 31.8 34 35 32.2 40Z" fill={h} />
          <L d="M39 34C38.6 28 41.4 23.6 46.4 21.4M44 31C43.4 26 46 22.4 50.4 20.8M50 30C49.6 25.4 52 22.4 56 21.4M56 31C56.4 26.6 58.4 23.8 62 23" c={hl} w=".8" o={0.55} />
          <L d="M37 28c4-4 9.6-6 15.6-5.4" c="#fff" w="1.8" o={0.42} />
          <path d="M32.5 39c-.6 4 0 8 1 11M67.5 39c.6 4 0 8-1 11" fill="none" stroke={h} strokeWidth="2.6" opacity=".5" strokeLinecap="round" />
        </>
      )
    case 'beard_full':
      return (
        <>
          <P d="M32.5 39C31.6 27 39.5 20.5 50 20.5S68.4 27 67.5 39C65.8 34.6 63 32 59 31 54 29.8 46 29.8 41 31 37 32 34.2 34.6 32.5 39Z" fill={h} />
          <L d="M38 25c4-3 9-4 14-3.4M44 28.6c3-1.2 7-1.2 10 0" c={hl} w="1.5" o={0.4} />
          {beardArt(h, uid, headPath)}
        </>
      )
    case 'fade':
      return (
        <>
          <P d="M32.5 39C31.6 27 39.5 20.5 50 20.5S68.4 27 67.5 39C65.8 34.6 63 32 59 31 54 29.8 46 29.8 41 31 37 32 34.2 34.6 32.5 39Z" fill={h} />
          <path d="M32.5 39c-.6 4 0 8 1 11M67.5 39c.6 4 0 8-1 11" fill="none" stroke={h} strokeWidth="2.6" opacity=".5" strokeLinecap="round" />
          <L d="M38 25c4-3 9-4 14-3.4M44 28.6c3-1.2 7-1.2 10 0" c={hl} w="1.5" o={0.4} />
        </>
      )
    default:
      return null
  }
}

function outfitArt(kind: AvatarConfig['outfit'], skin: string, dark: string, uid: string): ReactNode {
  const sh = <path d={SHOULDERS} fill={`url(#${uid}sh)`} />
  switch (kind) {
    case 'tunic':
      return (
        <>
          <P d={SHOULDERS} fill="#8a4b2a" />
          <path d="M5 100C5 94 6 90 9 86M95 100C95 94 94 90 91 86" stroke={shade('#8a4b2a', -34)} strokeWidth="1" fill="none" />
          <path d="M36 73.4C39 83.4 61 83.4 64 73.4" fill="none" stroke={INK} strokeWidth="5.2" strokeLinecap="round" />
          <path d="M36 73.4C39 83.4 61 83.4 64 73.4" fill="none" stroke="#d9b98a" strokeWidth="3.4" strokeLinecap="round" />
          <path d="M50 82.4V94" stroke={INK} strokeWidth="1.2" />
          {[84.6, 88.2, 91.8].map((y) => (
            <path key={y} d={`M46.4 ${y}L53.6 ${y + 2.2}M53.6 ${y}L46.4 ${y + 2.2}`} stroke="#d9b98a" strokeWidth="1" strokeLinecap="round" />
          ))}
          <L d="M24 100C22 92 22 86 25 80M76 100C78 92 78 86 75 80" c={shade('#8a4b2a', 32)} w="1" o={0.8} />
          <path d="M20 96h6M74 96h6" stroke="#d9b98a" strokeWidth=".9" strokeDasharray="1.6 1.4" />
          {sh}
        </>
      )
    case 'tee':
      return (
        <>
          <P d={SHOULDERS} fill="#e8e2d4" />
          <path d="M19 100C17 92 19 84 26 78M81 100C83 92 81 84 74 78" stroke="#c9c1ae" strokeWidth="1" fill="none" />
          <path d="M37.6 73.2C40 83 60 83 62.4 73.2" fill="none" stroke={INK} strokeWidth="5.6" strokeLinecap="round" />
          <path d="M37.6 73.2C40 83 60 83 62.4 73.2" fill="none" stroke="#cfc7b4" strokeWidth="3.8" strokeLinecap="round" />
          <path d="M38.6 74C41 82 59 82 61.4 74" fill="none" stroke="#a9a08a" strokeWidth=".7" strokeDasharray=".9 1.2" />
          <ellipse cx="50" cy="93" rx="3.8" ry="3.1" fill="#c2432a" />
          {[[44.4, 88.6], [48, 86.4], [52, 86.4], [55.6, 88.6]].map(([x, y]) => (
            <ellipse key={x} cx={x} cy={y} rx="1.4" ry="1.7" fill="#c2432a" />
          ))}
          {sh}
        </>
      )
    case 'wrap':
      return (
        <>
          <P d={SHOULDERS} fill={skin} />
          <L d="M36 73.6C41 77 59 77 64 73.6" c={dark} w="1" o={0.8} />
          <path d="M6 100V89C20 82 34 81.6 50 84 66 81.6 80 82 94 89V100Z" fill="#b83a2a" stroke={INK} strokeWidth="1.5" strokeLinejoin="round" />
          <path d="M6 89C20 82 34 81.6 50 84 66 81.6 80 82 94 89" fill="none" stroke="#ecc97d" strokeWidth="2.2" strokeLinecap="round" />
          {[[16, 92], [26, 95], [36, 92], [46, 96], [56, 93], [66, 96], [76, 92], [86, 95], [30, 99], [60, 99]].map(([x, y]) => (
            <circle key={`${x}-${y}`} cx={x} cy={y} r="1.5" fill="#f3ece0" />
          ))}
          <P d="M44 84C41 79 33 78 33 83 33 88 40 87 44 84Z" fill="#d04a38" w={1.2} />
          <P d="M56 84C59 79 67 78 67 83 67 88 60 87 56 84Z" fill="#d04a38" w={1.2} />
          <circle cx="50" cy="84" r="3.2" fill="#b83a2a" stroke={INK} strokeWidth="1.1" />
          {sh}
        </>
      )
    case 'suit':
      return (
        <>
          <P d={SHOULDERS} fill="#22262f" />
          <path d="M41.4 73.2L50 90.6 58.6 73.2Z" fill="#f3ece0" stroke={INK} strokeWidth="1" strokeLinejoin="round" />
          <P d="M35.6 72.6L41.4 73.2 50 90.6 43.4 97 32.6 84Z" fill="#2c313b" w={1.2} />
          <P d="M64.4 72.6L58.6 73.2 50 90.6 56.6 97 67.4 84Z" fill="#2c313b" w={1.2} />
          <L d="M36.8 76L44 90M63.2 76L56 90" c="#4a5060" w=".9" o={0.9} />
          <path d="M47.6 77.6h4.8l-.8 3.6h-3.2z" fill="#c2432a" stroke={INK} strokeWidth=".8" strokeLinejoin="round" />
          <path d="M48.2 81.2h3.6l1.8 11.6-3.6 3.6-3.6-3.6z" fill="#c2432a" stroke={INK} strokeWidth=".8" strokeLinejoin="round" />
          <L d="M50 81.6V94" c="#8e2a18" w=".7" o={0.8} />
          {/* pochette de costume */}
          <path d="M61.6 90.6L72.6 89.4" stroke="#0c0e12" strokeWidth="1.4" strokeLinecap="round" />
          <path d="M62.4 90.2L63.6 85.6 66.2 88 68.6 84.6 70.4 87.8 72.2 89.2Z" fill="#f3ece0" stroke={INK} strokeWidth=".7" strokeLinejoin="round" />
          <path d="M63.4 89.6L66.2 87.6 68.6 89.2" fill="none" stroke="#e0a0b8" strokeWidth=".8" />
          <circle cx="50" cy="99" r="1.4" fill="#4a5060" />
          {sh}
        </>
      )
    case 'hood':
      return (
        <>
          <P d={SHOULDERS} fill="#4a3524" />
          <P d="M25 76C27 63.6 38 60.6 50 62.6 62 60.6 73 63.6 75 76C68.4 83 59.4 86 50 86S31.6 83 25 76Z" fill="#5c4330" />
          <path d="M37.4 72C40.6 79 59.4 79 62.6 72 62.6 76.6 58 81 50 81S37.4 76.6 37.4 72Z" fill="#1e140d" stroke={INK} strokeWidth="1" strokeLinejoin="round" />
          <L d="M30 74C31 68 37 65 44 64.4M70 74C69 68 63 65 56 64.4" c="#7a5a40" w="1.2" o={0.8} />
          <path d="M44.4 80.4V94M55.6 80.4V94" stroke={INK} strokeWidth="2.6" strokeLinecap="round" />
          <path d="M44.4 80.4V94M55.6 80.4V94" stroke="#e8dcc0" strokeWidth="1.2" strokeLinecap="round" />
          <circle cx="44.4" cy="94.4" r="1.3" fill="#ecc97d" stroke={INK} strokeWidth=".6" />
          <circle cx="55.6" cy="94.4" r="1.3" fill="#ecc97d" stroke={INK} strokeWidth=".6" />
          <P d="M28 100L33 92.6C42 94.4 58 94.4 67 92.6L72 100Z" fill="#3d2b1c" w={1.2} />
          {sh}
        </>
      )
    case 'armor':
      return (
        <>
          <P d={SHOULDERS} fill="#3a3f4a" />
          <P d="M32.6 100L34.8 76.4C39 72.6 45 72.4 50 78 55 72.4 61 72.6 65.2 76.4L67.4 100Z" fill="#6a707c" />
          <path d="M50 78V100" stroke="#4a4f5a" strokeWidth="1.5" />
          <L d="M36.8 80C40 78.4 44 78.8 47 82M63.2 80C60 78.4 56 78.8 53 82" c="#b6bcc8" w="1.4" o={0.8} />
          <L d="M36 90h12M52 90h12" c="#4a4f5a" w=".9" o={0.9} />
          <P d="M38 72.6C41 78.6 59 78.6 62 72.6L60 77C56 81 44 81 40 77Z" fill="#8a909c" w={1.2} />
          <path d="M40 76.6C44 80 56 80 60 76.6" fill="none" stroke="#ecc97d" strokeWidth="1.4" strokeLinecap="round" />
          <P d="M7 92C7 80 17 73.6 31 74L35 85C26 84.6 18 89 14 98Z" fill="#8a909c" />
          <P d="M93 92C93 80 83 73.6 69 74L65 85C74 84.6 82 89 86 98Z" fill="#8a909c" />
          <L d="M9 88C16 83 24 81 32 81.6M91 88C84 83 76 81 68 81.6" c="#b6bcc8" w="1.3" o={0.85} />
          <L d="M11 93C17 89 24 87 31 87.4M89 93C83 89 76 87 69 87.4" c="#4a4f5a" w=".9" o={0.9} />
          {[[16, 84], [24, 80], [84, 84], [76, 80], [43, 84], [57, 84]].map(([x, y]) => (
            <circle key={`${x}-${y}`} cx={x} cy={y} r="1.3" fill="#ecc97d" stroke={INK} strokeWidth=".5" />
          ))}
          {sh}
        </>
      )
    case 'furcape': {
      const fur = '#c9ced6'
      return (
        <>
          <P d={SHOULDERS} fill="#2e1e15" />
          <path d={`M7 92C7 80 19 71.4 36 70.4L50 76.4 64 70.4C81 71.4 93 80 93 92L93 94${scallop(93, 7, 94, 9, 6).replace(/Q/g, 'Q')}Z`} fill={fur} stroke={INK} strokeWidth="1.5" strokeLinejoin="round" />
          <L d="M16 84l3 6M26 80l2 8M38 78l1 7M62 78l-1 7M74 80l-2 8M84 84l-3 6" c="#9aa0ab" w="1.1" o={0.9} />
          <L d="M20 88C24 84 30 82 36 82M80 88C76 84 70 82 64 82" c="#f1f3f6" w="1.6" o={0.7} />
          <circle cx="39" cy="75" r="2.6" fill="#ecc97d" stroke={INK} strokeWidth=".9" />
          <circle cx="61" cy="75" r="2.6" fill="#ecc97d" stroke={INK} strokeWidth=".9" />
          <path d="M39 77.4Q50 88 61 77.4" fill="none" stroke="#ecc97d" strokeWidth="1.2" strokeDasharray="1.6 1.2" />
          {sh}
        </>
      )
    }
    case 'dream_rose':
      return (
        <>
          <P d={SHOULDERS} fill="#ff8fc0" />
          <path d="M5 100C5 94 7 89 10 85M95 100C95 94 93 89 90 85" stroke="#d45b97" strokeWidth="1" fill="none" />
          <path d="M33 73.8C37 85.4 63 85.4 67 73.8" fill="none" stroke={INK} strokeWidth="5.6" strokeLinecap="round" />
          <path d="M33 73.8C37 85.4 63 85.4 67 73.8" fill="none" stroke="#fff0f6" strokeWidth="3.8" strokeLinecap="round" />
          <path d="M35 75C39 84 61 84 65 75" fill="none" stroke="#ff8fc0" strokeWidth=".8" strokeDasharray="1 1.4" />
          {[[24, 90], [37, 96], [63, 96], [76, 90], [50, 92]].map(([x, y]) => (
            <g key={`${x}-${y}`}>
              <circle cx={x} cy={y} r="3.1" fill="#e0559a" stroke={INK} strokeWidth=".7" />
              <path d={`M${x - 1.6} ${y}c0-1.8 3.2-1.8 3.2 0 0 1.4-2.2 1.4-2.2 0`} fill="none" stroke="#ffd1e6" strokeWidth=".6" />
              <path d={`M${x - 3.2} ${y + 3.4}l-2 1.4M${x + 3.2} ${y + 3.4}l2 1.4`} stroke="#2f6b3a" strokeWidth="1.4" strokeLinecap="round" />
            </g>
          ))}
          {[[40.6, 78.4], [45, 80.8], [50, 81.6], [55, 80.8], [59.4, 78.4]].map(([x, y]) => (
            <circle key={x} cx={x} cy={y + 3.2} r="1.4" fill="#fff6fb" stroke={INK} strokeWidth=".5" />
          ))}
          {sh}
        </>
      )
    case 'cape_solidaire':
      return (
        <>
          <P d={SHOULDERS} fill="#e0559a" />
          <L d="M18 98C20 90 24 83 30 78M82 98C80 90 76 83 70 78M50 100V88" c={shade('#e0559a', -38)} w="1.1" o={0.9} />
          <P d="M30 73.4C32 66 41 63.4 50 66S68 66 70 73.4C64 79 57 82.4 50 84 43 82.4 36 79 30 73.4Z" fill="#ff9ecf" w={1.4} />
          <L d="M33 71C36 67.8 42 66.6 47 67.6" c="#ffd1e6" w="1.2" o={0.8} />
          <path d={`M7 96C16 98 30 99 50 99S84 98 93 96`} fill="none" stroke="#ff9ecf" strokeWidth="2.6" strokeLinecap="round" />
          {/* ruban de solidarité épinglé sur la poitrine */}
          <path d="M50 83.4C44.6 83.4 44.2 90.4 47.8 94L44 100.4M50 83.4C55.4 83.4 55.8 90.4 52.2 94L56 100.4" fill="none" stroke={INK} strokeWidth="4.4" strokeLinecap="round" />
          <path d="M50 83.4C44.6 83.4 44.2 90.4 47.8 94L44 100.4M50 83.4C55.4 83.4 55.8 90.4 52.2 94L56 100.4" fill="none" stroke="#ffd1e6" strokeWidth="2.4" strokeLinecap="round" />
          <circle cx="50" cy="93" r="1.3" fill="#ecc97d" stroke={INK} strokeWidth=".5" />
          {sh}
        </>
      )
    case 'louve_malibu':
      return (
        <>
          <P d={SHOULDERS} fill="#ff6fb0" />
          <P d="M10 92L13.6 74 30 82Z" fill="#ff6fb0" />
          <P d="M90 92L86.4 74 70 82Z" fill="#ff6fb0" />
          <path d="M14.2 84L15.4 78.4 23 82Z" fill="#ffb3d6" />
          <path d="M85.8 84L84.6 78.4 77 82Z" fill="#ffb3d6" />
          <path d={`M26 78C27.6 66.6 38 62.6 50 64.6 62 62.6 72.4 66.6 74 78L74 82${scallop(74, 26, 82, 7, 5)}Z`} fill="#ffe3f0" stroke={INK} strokeWidth="1.5" strokeLinejoin="round" />
          <L d="M32 72l2 6M42 68l1 7M58 68l-1 7M68 72l-2 6" c="#f2b4d2" w="1" o={0.9} />
          <path d="M50 88V100" stroke="#c2185b" strokeWidth="1.1" strokeDasharray="1.8 1.4" />
          <circle cx="50" cy="94" r="5" fill="#fff" stroke={INK} strokeWidth="1.1" />
          <ellipse cx="50" cy="95.6" rx="2.1" ry="1.7" fill="#ff6fb0" />
          {[[46.8, 92.2], [49, 91], [51, 91], [53.2, 92.2]].map(([x, y]) => (
            <circle key={x} cx={x} cy={y} r=".85" fill="#ff6fb0" />
          ))}
          {sh}
        </>
      )
    case 'varsity':
      return (
        <>
          <P d={SHOULDERS} fill="#fff6fb" />
          <path d="M30 75.2L36 72.8 50 78 64 72.8 70 75.2C70.6 83 70.8 92 70.4 100H29.6C29.2 92 29.4 83 30 75.2Z" fill="#f0508f" stroke={INK} strokeWidth="1.2" strokeLinejoin="round" />
          <L d="M30 75.4C27.4 84 25.6 92 25 100M70 75.4C72.6 84 74.4 92 75 100" c={INK} w="1" o={0.5} />
          <L d="M6.6 92.6C12 90 18 89 24.6 90M6.2 96.4C12 93.8 18 92.8 24.8 93.8M93.4 92.6C88 90 82 89 75.4 90M93.8 96.4C88 93.8 82 92.8 75.2 93.8" c="#f0508f" w="1.5" />
          <path d="M36 73.4C39 83.4 61 83.4 64 73.4" fill="none" stroke={INK} strokeWidth="5.6" strokeLinecap="round" />
          <path d="M36 73.4C39 83.4 61 83.4 64 73.4" fill="none" stroke="#fff6fb" strokeWidth="3.8" strokeLinecap="round" />
          <path d="M37.4 74.4C40.4 82 59.6 82 62.6 74.4" fill="none" stroke="#f0508f" strokeWidth="1.1" strokeLinecap="round" />
          <path d="M50 82.2V100" stroke={INK} strokeWidth="1.1" />
          {[86.4, 91.6, 96.8].map((y) => (
            <circle key={y} cx="50" cy={y} r="1.1" fill="#ffd35a" stroke={INK} strokeWidth=".5" />
          ))}
          <circle cx="40.6" cy="90.4" r="4.8" fill="#ffd35a" stroke={INK} strokeWidth="1" />
          <path d="M38.8 88.8l2.2-1.4v6.6" fill="none" stroke={INK} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          {sh}
        </>
      )
    case 'gala_gown':
      return (
        <>
          <P d={SHOULDERS} fill={skin} />
          <L d="M36 73.6C41 77 59 77 64 73.6" c={dark} w="1" o={0.8} />
          <path d="M6 100V90.6C14 86.4 27 86 36.6 90.4C41.4 83.6 46.6 83.6 50 89.6C53.4 83.6 58.6 83.6 63.4 90.4C73 86 86 86.4 94 90.6V100Z" fill="#ff4f93" stroke={INK} strokeWidth="1.5" strokeLinejoin="round" />
          <L d="M11 94.6C20 91.4 29 92 36 95M89 94.6C80 91.4 71 92 64 95M42 90C44.6 87.6 47 87.4 49 89.4M58 90C55.4 87.6 53 87.4 51 89.4" c="#ffb3d6" w="1.2" o={0.85} />
          <L d="M14 99c6-3 14-3.6 22-1.6M86 99c-6-3-14-3.6-22-1.6" c="#c2185b" w="1" o={0.7} />
          {[[18, 97], [27, 94.4], [60, 95.6], [72, 94], [82, 97], [34, 98.6], [67, 99]].map(([x, y]) => (
            <circle key={`${x}-${y}`} cx={x} cy={y} r=".8" fill="#fff" opacity=".9" />
          ))}
          {[[38.4, 74.4], [41, 77.6], [44.6, 79.4], [50, 80], [55.4, 79.4], [59, 77.6], [61.6, 74.4]].map(([x, y]) => (
            <circle key={`${x}`} cx={x} cy={y} r="1.5" fill="#fff6fb" stroke={INK} strokeWidth=".5" />
          ))}
          <path d="M50 88.6l2.2 2.4-2.2 3.2-2.2-3.2z" fill="#fff0f6" stroke={INK} strokeWidth=".7" strokeLinejoin="round" />
          {sh}
        </>
      )
    case 'tracksuit_neon':
      return (
        <>
          <P d={SHOULDERS} fill="#ff3fa4" />
          <L d="M17 81C12.6 87 9.8 93.6 8.8 100M21.4 79C17.6 85.4 15 92.6 14 100M83 81C87.4 87 90.2 93.6 91.2 100M78.6 79C82.4 85.4 85 92.6 86 100" c="#fff6fb" w="1.8" />
          <L d="M30 78C33 86 34 93 34 100M70 78C67 86 66 93 66 100" c="#c2185b" w="1" o={0.7} />
          <path d="M50 80V100" stroke={INK} strokeWidth="1.4" />
          {[84, 88, 92, 96].map((y) => (
            <path key={y} d={`M48.8 ${y}h2.4`} stroke="#fff6fb" strokeWidth=".8" />
          ))}
          <P d="M34.6 72.6C36.4 79.8 43 83 50 83S63.6 79.8 65.4 72.6L62 70.4C60.6 75 55.6 77.2 50 77.2S39.4 75 38 70.4Z" fill="#ff7cc4" w={1.3} />
          <L d="M38.4 71.6C40.2 75.8 44.4 77.8 50 77.8S59.8 75.8 61.6 71.6" c="#fff6fb" w="1.2" />
          <rect x="48.6" y="80.6" width="2.8" height="4.4" rx="1" fill="#fff6fb" stroke={INK} strokeWidth=".6" />
          <path d="M60.4 88.4l1.1 2.5 2.7.3-2 1.8.6 2.7-2.4-1.4-2.4 1.4.6-2.7-2-1.8 2.7-.3z" fill="#fff6fb" stroke={INK} strokeWidth=".4" strokeLinejoin="round" />
          {sh}
        </>
      )
    case 'hawaiian':
      return (
        <>
          <P d={SHOULDERS} fill="#5ec9cf" />
          <L d="M22 96C18 90 17 84 20 79M78 96C82 90 83 84 80 79" c="#3aa0a8" w="1" o={0.8} />
          <path d="M38.4 73.4L50 92.4 61.6 73.4Z" fill={skin} stroke={INK} strokeWidth="1" strokeLinejoin="round" />
          <P d="M33.6 72.4L41.2 72.8 50 92.4 38 84.4Z" fill="#9eeaee" w={1.2} />
          <P d="M66.4 72.4L58.8 72.8 50 92.4 62 84.4Z" fill="#9eeaee" w={1.2} />
          <Hibiscus x={22} y={90} />
          <Hibiscus x={78} y={89} c="#ffb347" />
          <Hibiscus x={32} y={97} r={3} c="#ff7ab8" />
          <Hibiscus x={69} y={97} r={3} />
          <Hibiscus x={13} y={98} r={2.6} c="#ffb347" />
          <Hibiscus x={88} y={98} r={2.6} c="#ff7ab8" />
          {sh}
        </>
      )

    case 'kente':
      return (
        <>
          <clipPath id={`${uid}k`}>
            <path d={SHOULDERS} />
          </clipPath>
          <path d={SHOULDERS} fill="#b3341f" />
          <g clipPath={`url(#${uid}k)`}>
            {/* drapé en diagonale sur l'épaule gauche, bandes de tissage */}
            <path d="M5 78L36 72.5 56 100H5Z" fill="#2f6b3a" />
            {[0, 1, 2, 3, 4, 5].map((i) => (
              <path key={i} d={`M${5 + i * 7} 100L${5 + i * 7 - 8} 76`} stroke={i % 2 ? '#ecc97d' : '#14100c'} strokeWidth="2.6" />
            ))}
            <rect x="5" y="86" width="90" height="4.4" fill="#14100c" />
            <rect x="5" y="87.2" width="90" height="2" fill="#ecc97d" />
            {[0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11].map((i) => (
              <path key={i} d={`M${8 + i * 7.6} 93.4l3-2.4 3 2.4-3 2.4z`} fill={i % 2 ? '#ecc97d' : '#2f6b3a'} stroke={INK} strokeWidth=".5" />
            ))}
            <rect x="5" y="97" width="90" height="3" fill="#14100c" />
            {/* bande transversale, côté droit */}
            {[0, 1, 2, 3, 4, 5].map((i) => (
              <rect key={i} x={58 + i * 6} y="76" width="3" height="12" fill={i % 2 ? '#ecc97d' : '#14100c'} opacity=".9" />
            ))}
            <path d="M36 72.5L56 100" stroke={INK} strokeWidth="1.4" />
          </g>
          <path d={SHOULDERS} fill="none" stroke={INK} strokeWidth="1.5" strokeLinejoin="round" />
          <path d="M36 72.5L50 78 64 72.5" fill="none" stroke="#ecc97d" strokeWidth="1.6" strokeLinejoin="round" />
          {sh}
        </>
      )
    case 'boubou':
      return (
        <>
          <P d={SHOULDERS} fill="#2b5d7a" />
          <path d="M5 100C5 94 6 90 8 86M95 100C95 94 94 90 92 86" stroke={shade('#2b5d7a', -35)} strokeWidth="1" fill="none" />
          <path d="M22 100C20 92 20 84 24 78M78 100C80 92 80 84 76 78" stroke={shade('#2b5d7a', 30)} strokeWidth="1" fill="none" opacity=".7" />
          {/* encolure brodée or, à festons */}
          <path d="M34 73.6C37 84 63 84 66 73.6" fill="none" stroke={INK} strokeWidth="5" strokeLinecap="round" />
          <path d="M34 73.6C37 84 63 84 66 73.6" fill="none" stroke="#ecc97d" strokeWidth="3.4" strokeLinecap="round" />
          {[38, 43, 50, 57, 62].map((x, i) => (
            <circle key={x} cx={x} cy={[79.6, 82, 83, 82, 79.6][i]} r="1.5" fill="#c2432a" stroke={INK} strokeWidth=".5" />
          ))}
          <path d="M50 84.4V100" stroke={INK} strokeWidth="4.6" />
          <path d="M50 84.4V100" stroke="#ecc97d" strokeWidth="3" />
          {[88, 93, 98].map((y) => (
            <path key={y} d={`M45 ${y}l5-2.4 5 2.4-5 2.4z`} fill="#c2432a" stroke={INK} strokeWidth=".6" />
          ))}
          {[26, 74].map((x) => (
            <g key={x}>
              <path d={`M${x - 6} 92h12M${x - 5} 96h10`} stroke="#ecc97d" strokeWidth="1.6" strokeLinecap="round" />
            </g>
          ))}
          {sh}
        </>
      )
    case 'dashiki':
      return (
        <>
          <P d={SHOULDERS} fill="#d18a2a" />
          <path d="M5 100C5 93 7 88 10 84M95 100C95 93 93 88 90 84" stroke={shade('#d18a2a', -40)} strokeWidth="1" fill="none" />
          {/* col en V noir à liseré or + plastron brodé */}
          <path d="M37 73L50 92 63 73Z" fill="#14100c" stroke={INK} strokeWidth="1.2" strokeLinejoin="round" />
          <path d="M37 73L50 92 63 73" fill="none" stroke="#ecc97d" strokeWidth="2" strokeLinejoin="round" />
          <path d="M29 82l5-8M71 82l-5-8" stroke="#ecc97d" strokeWidth="1.4" strokeLinecap="round" />
          <path d="M22 100l5-9 5 9zM68 100l5-9 5 9zM36 100l4-7 4 7zM56 100l4-7 4 7z" fill="#2f6b3a" stroke={INK} strokeWidth=".8" strokeLinejoin="round" />
          <path d="M14 100l4-7 4 7zM78 100l4-7 4 7zM29 90l3-5 3 5zM65 90l3-5 3 5z" fill="#c2432a" stroke={INK} strokeWidth=".8" strokeLinejoin="round" />
          {[[44, 98], [56, 98], [50, 96]].map(([x, y]) => (
            <circle key={x} cx={x} cy={y} r="1.3" fill="#ecc97d" />
          ))}
          {sh}
        </>
      )
    case 'hunter':
      return (
        <>
          <P d={SHOULDERS} fill="#e8dcc0" />
          {/* col de chemise ouvert, lacet */}
          <path d="M40 73.5L50 86 60 73.5" fill={dark} stroke={INK} strokeWidth="1.2" strokeLinejoin="round" />
          <path d="M44.4 80.4l11 6M55.6 80.4l-11 6" stroke="#8a6a3a" strokeWidth="1" strokeLinecap="round" />
          {/* gilet de cuir cousu */}
          <P d="M13 100L19 82C21 77 27 74 35 72.6L44 86 41 100Z" fill="#6b4a2a" />
          <P d="M87 100L81 82C79 77 73 74 65 72.6L56 86 59 100Z" fill="#6b4a2a" />
          <path d="M18 98l5-14M82 98l-5-14" stroke="#a9794a" strokeWidth=".9" strokeDasharray="2 1.6" fill="none" />
          <L d="M36 78l-6 18M64 78l6 18" c={shade('#6b4a2a', 32)} w=".8" o={0.9} />
          {/* bandoulière + boucle, et une pochette à la ceinture */}
          <path d="M22 76L74 100" stroke={INK} strokeWidth="6" />
          <path d="M22 76L74 100" stroke="#3a2818" strokeWidth="4.4" />
          <rect x="45" y="87" width="7" height="7" rx="1.2" fill="#ecc97d" stroke={INK} strokeWidth=".9" transform="rotate(24 48.5 90.5)" />
          <P d="M66 95h13v5H66z" fill="#8a5a2c" w={1.2} />
          <path d="M66 95h13l-1.4 3.6h-10.2z" fill="#a9794a" stroke={INK} strokeWidth=".9" strokeLinejoin="round" />
          <circle cx="72.5" cy="98" r="1" fill="#ecc97d" />
          {sh}
        </>
      )
    case 'royal':
      return (
        <>
          <P d={SHOULDERS} fill="#4b2a6b" />
          <path d="M5 100C5 93 6 89 9 85M95 100C95 93 94 89 91 85" stroke={shade('#4b2a6b', -30)} strokeWidth="1" fill="none" />
          {/* épaulettes or et col brodé */}
          <path d="M10 88C14 80 22 76 32 74M90 88C86 80 78 76 68 74" stroke={INK} strokeWidth="6" fill="none" strokeLinecap="round" />
          <path d="M10 88C14 80 22 76 32 74M90 88C86 80 78 76 68 74" stroke="#ecc97d" strokeWidth="4" fill="none" strokeLinecap="round" />
          <path d="M33 73.6C37 85 63 85 67 73.6" fill="none" stroke={INK} strokeWidth="5.4" strokeLinecap="round" />
          <path d="M33 73.6C37 85 63 85 67 73.6" fill="none" stroke="#ecc97d" strokeWidth="3.6" strokeLinecap="round" />
          {[36, 41.5, 50, 58.5, 64].map((x, i) => (
            <circle key={x} cx={x} cy={[78.4, 81.6, 83.6, 81.6, 78.4][i]} r="1.4" fill="#fff4cf" stroke={INK} strokeWidth=".5" />
          ))}
          <path d="M50 86.5l-4 4.6 4 4.4 4-4.4z" fill="#c2432a" stroke={INK} strokeWidth="1" strokeLinejoin="round" />
          <path d="M50 86.5l-1.6 4.6 1.6 4.4" fill="none" stroke="#ff9a8a" strokeWidth=".7" />
          <L d="M18 98c6-4 10-12 12-20M82 98c-6-4-10-12-12-20" c={shade('#4b2a6b', 38)} w="1" o={0.8} />
          {sh}
        </>
      )
    case 'cloak':
      return (
        <>
          <P d={SHOULDERS} fill="#26324a" />
          <path d="M30 100C28 92 30 84 36 76M70 100C72 92 70 84 64 76M50 100V84" stroke={shade('#26324a', -26)} strokeWidth="1.2" fill="none" />
          <L d="M18 98c2-8 6-14 12-20M82 98c-2-8-6-14-12-20" c={shade('#26324a', 36)} w="1" o={0.8} />
          {/* col montant + fermoir à chaîne */}
          <P d="M32 73.4C34 66 42 63 50 66S66 66 68 73.4C62 78.6 56 82 50 84 44 82 38 78.6 32 73.4Z" fill="#34436a" w={1.4} />
          <path d="M32 73.4C38 78.6 44 82 50 84 56 82 62 78.6 68 73.4" fill="none" stroke="#ecc97d" strokeWidth="1.8" strokeLinejoin="round" />
          <path d="M39 80.6Q50 90 61 80.6" fill="none" stroke="#ecc97d" strokeWidth="1.1" strokeDasharray="1.6 1.2" />
          <circle cx="50" cy="86.4" r="3.6" fill="#ecc97d" stroke={INK} strokeWidth="1" />
          <circle cx="50" cy="86.4" r="1.4" fill="#2b5d7a" />
          {sh}
        </>
      )
    default:
      return null
  }
}

/** Objets tenus en bouche : dessinés AVANT la bouche, donc les lèvres passent
 * par-dessus le bout engagé et l'objet semble vraiment pris entre elles. Ils
 * ressortent au coin droit, inclinés vers le bas. */
function mouthProp(kind: AvatarConfig['acc']): ReactNode {
  if (kind === 'cigarette') {
    return (
      <g strokeLinecap="round">
        <path d="M50 60.7L68.6 65.3" stroke={INK} strokeWidth="3.6" />
        <path d="M50 60.7L68.6 65.3" stroke="#fffdf6" strokeWidth="2.2" />
        <path d="M50 60.7L60.6 63.3" stroke="#e0a456" strokeWidth="2.2" />
        <path d="M60.6 63.3L61.4 63.5" stroke="#b9772c" strokeWidth="2.2" />
        <path d="M67.6 65L69.2 65.4" stroke="#ff5a2e" strokeWidth="2.2" />
        <path d="M62.4 63.2L66.6 64.2" stroke="#d6d0c0" strokeWidth=".5" opacity=".8" />
      </g>
    )
  }
  if (kind === 'toothpick') {
    return (
      <g strokeLinecap="round">
        <path d="M50 61L66.2 63.8" stroke={INK} strokeWidth="2.1" />
        <path d="M50 61L66.2 63.8" stroke="#e6c27a" strokeWidth="1" />
        <path d="M58 62.4L63 63.3" stroke="#b58f48" strokeWidth=".5" opacity=".8" />
      </g>
    )
  }
  return null
}

function faceAccessory(kind: AvatarConfig['acc'], skin: string, ey: number): ReactNode {
  switch (kind) {
    case 'lipstick_pink':
      return (
        <g>
          {[-1, 1].map((sg) => {
            const cx = 50 + sg * 8.4
            const wing = `M${cx + sg * 4.4} ${ey - 0.4}Q${cx + sg * 7.4} ${ey - 1.4} ${cx + sg * 9.6} ${ey - 3.8}Q${cx + sg * 7.6} ${ey - 2.2} ${cx + sg * 4} ${ey - 2.6}Z`
            return (
              <g key={sg}>
                <path d={`M${cx - 4.6} ${ey - 1.2}C${cx - 2.4} ${ey - 4.6} ${cx + 2.4} ${ey - 4.6} ${cx + 4.6} ${ey - 1.2}C${cx + 2.4} ${ey - 3.2} ${cx - 2.4} ${ey - 3.2} ${cx - 4.6} ${ey - 1.2}Z`} fill="#ff7ab8" opacity=".75" />
                <path d={wing} fill={INK} />
                <path d={`M${cx + sg * 5} ${ey - 1}l${sg * 2.4} -.4M${cx + sg * 4.6} ${ey - 1.8}l${sg * 2.2} -1.2`} stroke={INK} strokeWidth=".6" strokeLinecap="round" />
              </g>
            )
          })}
          <path d="M45.4 62.8C47.4 63.8 52.6 63.8 54.6 62.8" fill="none" stroke="#fff" strokeWidth=".7" strokeLinecap="round" opacity=".6" />
        </g>
      )
    case 'cigarette':
      return (
        <g fill="none" stroke="#f3f6fa" strokeLinecap="round">
          <path d="M69.6 63.4c-2.6-2.8 2.2-5 0-7.8s2.2-5.4 0-8.6" strokeWidth="1.5" opacity=".55" />
          <path d="M72.8 61c-1.6-2.2 1.6-4 0-6.2" strokeWidth="1" opacity=".4" />
        </g>
      )
    case 'gold_chain': {
      const pts = Array.from({ length: 11 }, (_, i) => {
        const t = i / 10
        const u = 1 - t
        return {
          x: u * u * 36.6 + 2 * u * t * 50 + t * t * 63.4,
          y: u * u * 73.4 + 2 * u * t * 93 + t * t * 73.4,
          a: (Math.atan2(2 * u * (93 - 73.4) + 2 * t * (73.4 - 93), 2 * u * (50 - 36.6) + 2 * t * (63.4 - 50)) * 180) / Math.PI,
        }
      })
      return (
        <g>
          {pts.map((p, i) => (
            <g key={i} transform={`rotate(${p.a + (i % 2 ? 90 : 0)} ${p.x} ${p.y})`}>
              <ellipse cx={p.x} cy={p.y} rx="2.5" ry="1.7" fill="none" stroke={INK} strokeWidth="2.1" />
              <ellipse cx={p.x} cy={p.y} rx="2.5" ry="1.7" fill="none" stroke="#f0c75a" strokeWidth="1.2" />
            </g>
          ))}
          <path d="M50 85.4l4.2 4.6-4.2 6.2-4.2-6.2z" fill="#ff6fb0" stroke="#c8962c" strokeWidth="1.3" strokeLinejoin="round" />
          <path d="M48 89.2l2-2.2" stroke="#fff" strokeWidth=".9" strokeLinecap="round" opacity=".85" />
        </g>
      )
    }
    case 'glasses':
      return (
        <g>
          <circle cx="41.8" cy="45" r="7.2" fill="#bfe6ff" fillOpacity=".16" stroke={INK} strokeWidth="1.9" />
          <circle cx="58.2" cy="45" r="7.2" fill="#bfe6ff" fillOpacity=".16" stroke={INK} strokeWidth="1.9" />
          <path d="M49 44.4c.6-1 1.4-1 2 0M34.6 44l-3 -1M65.4 44l3-1" fill="none" stroke={INK} strokeWidth="1.6" strokeLinecap="round" />
          <path d="M37.6 41.6c1.6-1.4 3.6-1.8 5.4-1.2M54 41.6c1.6-1.4 3.6-1.8 5.4-1.2" fill="none" stroke="#fff" strokeWidth="1.2" strokeLinecap="round" opacity=".7" />
        </g>
      )
    case 'hoops':
      return (
        <g>
          {[31.4, 68.6].map((x) => (
            <g key={x}>
              <ellipse cx={x} cy="55" rx="3.6" ry="5.6" fill="none" stroke={INK} strokeWidth="3" />
              <ellipse cx={x} cy="55" rx="3.6" ry="5.6" fill="none" stroke="#f0c75a" strokeWidth="1.7" />
              <path d={`M${x - 2.2} 52.4c.6-1 1.6-1.4 2.4-1.2`} stroke="#fff" strokeWidth=".7" fill="none" strokeLinecap="round" />
            </g>
          ))}
        </g>
      )
    case 'freckles':
      return (
        <g fill={shade(skin, -55)} opacity=".8">
          {[[37, 51], [40, 53], [35.6, 54], [43, 51.4], [63, 51], [60, 53], [64.4, 54], [57, 51.4]].map(([x, y]) => (
            <circle key={`${x}-${y}`} cx={x} cy={y} r=".85" />
          ))}
        </g>
      )
    case 'ring':
      return (
        <g>
          {[29, 71].map((x) => (
            <g key={x}>
              <circle cx={x} cy="52.4" r="2.5" fill="none" stroke={INK} strokeWidth="2.4" />
              <circle cx={x} cy="52.4" r="2.5" fill="none" stroke="#f0c75a" strokeWidth="1.2" />
              <circle cx={x} cy="49.4" r="1" fill="#fff4cf" stroke={INK} strokeWidth=".5" />
            </g>
          ))}
        </g>
      )
    case 'sunglasses':
      return (
        <g>
          <path d="M34.2 41.6C34.2 40.4 35 40 36.2 40H46.4C48 40 48.8 41 48.6 42.4L48 47.2C47.6 49.8 45.6 51 43 51H39.6C36.4 51 34.6 49.2 34.4 46.2Z" fill="#0d0a08" stroke={INK} strokeWidth="1.2" strokeLinejoin="round" />
          <path d="M65.8 41.6C65.8 40.4 65 40 63.8 40H53.6C52 40 51.2 41 51.4 42.4L52 47.2C52.4 49.8 54.4 51 57 51H60.4C63.6 51 65.4 49.2 65.6 46.2Z" fill="#0d0a08" stroke={INK} strokeWidth="1.2" strokeLinejoin="round" />
          <path d="M48.6 42.2Q50 40.8 51.4 42.2" fill="none" stroke={INK} strokeWidth="1.6" strokeLinecap="round" />
          <path d="M34.4 42L31.4 41.2M65.6 42L68.6 41.2" stroke={INK} strokeWidth="1.5" strokeLinecap="round" />
          <path d="M37 47.4l4.2-5.4M42 48l2.6-3.2M54.6 47.4l4.2-5.4M59.6 48l2.6-3.2" stroke="#fff" strokeWidth="1.1" strokeLinecap="round" opacity=".38" />
          <path d="M34.8 40.6H48.4M51.6 40.6H65.2" stroke="#5a5f6a" strokeWidth=".9" strokeLinecap="round" />
        </g>
      )
    case 'scar':
      return (
        <g>
          <path d="M61.8 35L66.8 52" fill="none" stroke={INK} strokeWidth="3" strokeLinecap="round" />
          <path d="M61.8 35L66.8 52" fill="none" stroke="#b5483e" strokeWidth="1.7" strokeLinecap="round" />
          <path d="M62.2 36.4L66.4 50.6" fill="none" stroke="#e58a7e" strokeWidth=".6" strokeLinecap="round" />
          {[[63, 38.4], [64, 42], [65, 45.6], [66, 49]].map(([x, y]) => (
            <path key={y} d={`M${x - 1.8} ${y - 0.4}l3.6 1.2`} stroke="#5a1c16" strokeWidth=".9" strokeLinecap="round" />
          ))}
        </g>
      )
    case 'facepaint':
      return (
        <g strokeLinecap="round">
          {[
            ['M34.6 50.6l8 2.4', '#f3ece0'],
            ['M34.4 54.4l9 3', '#f3ece0'],
            ['M35.4 58l7.2 2.2', '#c2432a'],
            ['M65.4 50.6l-8 2.4', '#f3ece0'],
            ['M65.6 54.4l-9 3', '#f3ece0'],
            ['M64.6 58l-7.2 2.2', '#c2432a'],
          ].map(([d, c]) => (
            <g key={d}>
              <path d={d} fill="none" stroke={INK} strokeWidth="3" />
              <path d={d} fill="none" stroke={c} strokeWidth="1.8" />
            </g>
          ))}
          <path d="M50 29.4v5.4" stroke={INK} strokeWidth="3.2" />
          <path d="M50 29.4v5.4" stroke="#f3ece0" strokeWidth="2" />
        </g>
      )
    case 'eyepatch':
      return (
        <g>
          <path d="M52.6 42.6C46 39.6 39.6 38.4 31.8 40.4M64.2 43C66 43.8 67.4 44.8 68.4 46.2" fill="none" stroke={INK} strokeWidth="2.6" strokeLinecap="round" />
          <path d="M52.6 42.6C46 39.6 39.6 38.4 31.8 40.4M64.2 43C66 43.8 67.4 44.8 68.4 46.2" fill="none" stroke="#3a2818" strokeWidth="1.2" strokeLinecap="round" />
          <path d="M52.4 42C52.4 39.6 54.6 38.6 58.4 38.6S64.4 39.6 64.4 42.4C64.4 47.4 62 51.4 58.4 51.4S52.4 47.4 52.4 42Z" fill="#14100c" stroke={INK} strokeWidth="1.3" strokeLinejoin="round" />
          <path d="M54.4 41.8c1-1.4 2.4-2 4-2" fill="none" stroke="#6a6f7a" strokeWidth="1" strokeLinecap="round" opacity=".6" />
        </g>
      )
    case 'coeur_lunettes':
      return (
        <g>
          {[41.8, 58.2].map((cx) => (
            <g key={cx}>
              <path d={`M${cx} 51.2C${cx - 6} 47.6 ${cx - 7.6} 44.8 ${cx - 7.6} 42.6C${cx - 7.6} 40.6 ${cx - 6} 39.4 ${cx - 4} 39.4C${cx - 2.2} 39.4 ${cx - 0.8} 40.4 ${cx} 41.8C${cx + 0.8} 40.4 ${cx + 2.2} 39.4 ${cx + 4} 39.4C${cx + 6} 39.4 ${cx + 7.6} 40.6 ${cx + 7.6} 42.6C${cx + 7.6} 44.8 ${cx + 6} 47.6 ${cx} 51.2Z`} fill="#ff4f93" fillOpacity=".62" stroke="#c2185b" strokeWidth="1.6" strokeLinejoin="round" />
              <path d={`M${cx - 5.2} 41.6c.8-1 1.8-1.4 2.8-1.2`} fill="none" stroke="#fff" strokeWidth="1.1" strokeLinecap="round" opacity=".85" />
            </g>
          ))}
          <path d="M49.4 42.6Q50 41.6 50.6 42.6" fill="none" stroke="#c2185b" strokeWidth="1.5" strokeLinecap="round" />
          <path d="M34.2 42.4L31.4 41.6M65.8 42.4L68.6 41.6" stroke="#c2185b" strokeWidth="1.4" strokeLinecap="round" />
        </g>
      )
    case 'beads':
      return (
        <g>
          {[[38, 74.6, '#c2432a'], [41.4, 77.4, '#ecc97d'], [45, 79.2, '#2f6b3a'], [50, 80, '#c2432a'], [55, 79.2, '#ecc97d'], [58.6, 77.4, '#2f6b3a'], [62, 74.6, '#c2432a']].map(([x, y, c]) => (
            <circle key={`${x}`} cx={x as number} cy={y as number} r="2.2" fill={c as string} stroke={INK} strokeWidth=".7" />
          ))}
          <circle cx="50" cy="84.4" r="2.8" fill="#ecc97d" stroke={INK} strokeWidth=".8" />
        </g>
      )
    default:
      return null
  }
}


/** Couvre-chefs. Dessinés après les cheveux ; ceux qui couvrent la tête
 * (casquette, chapeau) vont avec `cover` côté cheveux. */
function headwearArt(kind: AvatarConfig['head'], uid: string): ReactNode {
  switch (kind) {
    case 'headband':
      return (
        <>
          <P d="M31.2 39.4C33.4 31.4 41.4 28 50 28S66.6 31.4 68.8 39.4L67.8 43C65 36.6 58.4 33.6 50 33.6S35 36.6 32.2 43Z" fill="#c2432a" />
          <L d="M33.6 37.2C37 33.2 43 31.4 50 31.4S63 33.2 66.4 37.2" c="#e0623f" w="1.2" o={0.8} />
          {[36, 42, 50, 58, 64].map((x, i) => (
            <circle key={x} cx={x} cy={[37.4, 34.6, 33.6, 34.6, 37.4][i]} r="1.1" fill="#ecc97d" stroke={INK} strokeWidth=".4" />
          ))}
        </>
      )
    case 'cap':
      return (
        <>
          <defs>
            <linearGradient id={`${uid}cp`} x1="0" y1="0" x2="1" y2="1">
              <stop offset="0" stopColor="#3a4a74" />
              <stop offset="1" stopColor="#1c2538" />
            </linearGradient>
          </defs>
          {/* menton relevé : la calotte recule et se tasse sur le haut du crâne */}
          <g transform="translate(0 -2) scale(1 .93)">
            <P d="M29.6 43C28.8 26 38.4 16 50 16S71.2 26 70.4 43C68.4 39 64 36.6 59 35.8 53.6 35 46.4 35 41 35.8 36 36.6 31.6 39 29.6 43Z" fill={`url(#${uid}cp)`} />
            <L d="M50 16.4V35M40.6 17.6C37.8 23.4 36.8 29.6 37.4 36M59.4 17.6C62.2 23.4 63.2 29.6 62.6 36" c="#0e1422" w=".9" o={0.9} />
            <L d="M35.4 24c3.4-3.8 7.6-5.6 12-5.6" c="#8aa0d0" w="1.4" o={0.5} />
            <circle cx="50" cy="16.4" r="1.9" fill="#ecc97d" stroke={INK} strokeWidth=".8" />
            <path d="M29.6 43C31.6 39 36 36.6 41 35.8 46.4 35 53.6 35 59 35.8 64 36.6 68.4 39 70.4 43L69.2 44C67.2 40.6 63.4 38.6 58.6 37.8 53.4 37 46.6 37 41.4 37.8 36.6 38.6 32.8 40.6 30.8 44Z" fill="#141c2e" stroke={INK} strokeWidth=".8" strokeLinejoin="round" />
          </g>
          {/* visière vue de dessous : fine, relevée au-dessus des yeux */}
          <P d="M34.4 33.6C41.4 30.6 58.6 30.6 65.6 33.6C66.2 36.8 60 38.6 50 38.6S33.8 36.8 34.4 33.6Z" fill="#232e4a" />
          <path d="M35.4 34.8C42 32.4 58 32.4 64.6 34.8" fill="none" stroke="#4a5d8c" strokeWidth="1" strokeLinecap="round" opacity=".9" />
        </>
      )
    case 'hat':
      return (
        <g transform="translate(0 -4)">
          {/* bord : large, avec une épaisseur côté face */}
          <path d="M19.8 29.6C20 38.4 36 41 50 41S79.8 38.4 80.2 29.6Z" fill="#5e4524" stroke={INK} strokeWidth="1" strokeLinejoin="round" />
          <P d="M19.6 28.4C19.6 23.6 33 21.6 50 21.6S80.4 23.6 80.4 28.4C80.4 33.6 66 36.2 50 36.2S19.6 33.6 19.6 28.4Z" fill="#8a6a3a" />
          <L d="M25 29.4C32 32.4 42 33.6 50 33.6M75 29.4C68 32.4 58 33.6 50 33.6" c="#b58f58" w="1" o={0.7} />
          {/* calotte posée sur le bord, fermée : pincée au sommet comme un feutre */}
          <P d="M34.6 29.6C33.6 17.6 40.8 11.6 50 11.8S66.4 17.6 65.4 29.6C58.4 33.4 41.6 33.4 34.6 29.6Z" fill="#a0784a" />
          <path d="M45.4 12.8C44 16.4 43.8 21 44.8 25.6M54.6 12.8C56 16.4 56.2 21 55.2 25.6" stroke="#7a5630" strokeWidth="1" fill="none" strokeLinecap="round" />
          <path d="M39 17.4c1.8-2.8 4.6-4.2 8-4.4" fill="none" stroke="#d4a874" strokeWidth="1.5" strokeLinecap="round" opacity=".7" />
          {/* ruban à la base de la calotte, courbé comme le tour de tête */}
          <path d="M34.7 25.6C41.6 29.4 58.4 29.4 65.3 25.6L65.4 29.6C58.4 33.4 41.6 33.4 34.6 29.6Z" fill="#4a3524" stroke={INK} strokeWidth=".9" strokeLinejoin="round" />
          <rect x="55" y="27.2" width="4.6" height="3.6" rx=".8" fill="#ecc97d" stroke={INK} strokeWidth=".6" transform="rotate(8 57.3 29)" />
        </g>
      )
    case 'feather':
      return (
        <>
          <P d="M31.2 39C33.4 31.6 41.4 28.6 50 28.6S66.6 31.6 68.8 39L67.8 41.6C65 36 58.4 33.4 50 33.4S35 36 32.2 41.6Z" fill="#4a3524" />
          <L d="M34 38.6C38 34.6 43 33.2 50 33.2S62 34.6 66 38.6" c="#7a5630" w="1" o={0.9} />
          <g transform="rotate(26 64 30)">
            <path d="M64 31C58 24 58 10 64 3C70 10 70 24 64 31Z" fill="#e0623f" stroke={INK} strokeWidth="1.1" strokeLinejoin="round" />
            <path d="M64 31V5" stroke="#f3d27a" strokeWidth="1.3" strokeLinecap="round" />
            <path d="M64 12C61.4 13 60 15 59.6 17.4M64 18C61.6 19 60.4 20.8 60.2 23M64 12C66.6 13 68 15 68.4 17.4M64 18C66.4 19 67.6 20.8 67.8 23" stroke="#a8321c" strokeWidth=".8" fill="none" strokeLinecap="round" />
          </g>
        </>
      )
    case 'crown':
      return (
        <>
          <defs>
            <linearGradient id={`${uid}cr`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor="#ffe08a" />
              <stop offset="1" stopColor="#c8962c" />
            </linearGradient>
          </defs>
          <P d="M33.4 33L35.4 16.4 42.4 24.4 46.8 12.6 50 22 53.2 12.6 57.6 24.4 64.6 16.4 66.6 33C60 35.4 40 35.4 33.4 33Z" fill={`url(#${uid}cr)`} />
          <L d="M34 30.4C41 33 59 33 66 30.4" c="#a8741c" w="1.1" o={0.9} />
          <circle cx="50" cy="29.4" r="2.2" fill="#c2432a" stroke={INK} strokeWidth=".8" />
          <circle cx="41.4" cy="29.6" r="1.5" fill="#2b5d7a" stroke={INK} strokeWidth=".6" />
          <circle cx="58.6" cy="29.6" r="1.5" fill="#2f6b3a" stroke={INK} strokeWidth=".6" />
          {[[35.4, 16.4], [46.8, 12.6], [53.2, 12.6], [64.6, 16.4]].map(([x, y]) => (
            <circle key={x} cx={x} cy={y} r="1.5" fill="#fff4cf" stroke={INK} strokeWidth=".6" />
          ))}
          <L d="M37 20.6l2.4 6M47.2 16l1 5" c="#fff4cf" w=".8" o={0.8} />
        </>
      )
    case 'scarf_pink':
      return (
        <>
          <P d="M30.2 41C28.4 25 38 17.4 50 17.4S71.6 25 69.8 41C64.4 36 58 34.2 50 34.2S35.6 36 30.2 41Z" fill="#ff6fb0" />
          <L d="M50 17.8C47 24 46 30 46.6 34.4M50 17.8C54 24 56 30 54 34.4M42 19.6C39 25 38.4 30 39.4 35.6M58 19.6C61 25 61.6 30 60.4 35.6" c="#d63c86" w=".9" o={0.8} />
          <L d="M36.4 26c4-4 9-6 15-6" c="#ffc2dc" w="1.4" o={0.7} />
          {[[44, 24], [56, 23], [48, 29], [61, 29.6], [38, 31], [52, 20.4]].map(([x, y]) => (
            <circle key={`${x}-${y}`} cx={x} cy={y} r=".95" fill="#fff6fb" />
          ))}
          <path d="M30.4 40.6C36 36 43 34.4 50 34.4S64 36 69.6 40.6" fill="none" stroke={INK} strokeWidth="3" strokeLinecap="round" />
          <path d="M30.4 40.6C36 36 43 34.4 50 34.4S64 36 69.6 40.6" fill="none" stroke="#e0307a" strokeWidth="1.8" strokeLinecap="round" />
          <P d="M69.4 36.4C73.6 34.4 77.2 37 76.2 40.8 74.4 43.2 70.6 42.2 69.2 39.4Z" fill="#ff6fb0" w={1.2} />
          <P d="M74 40.4L81.6 46.6 77.6 47.6 79.4 52.6 73.4 47.6Z" fill="#e0307a" w={1.1} />
          <P d="M75.4 38.2L84 38.8 79.6 42.6Z" fill="#ff6fb0" w={1.1} />
        </>
      )
    case 'cowboy_pink':
      return (
        <g transform="translate(0 -3)">
          <path d="M12 25C18 33 32 39 50 39S82 33 88 25C84 23 80 25 76 28C68 31 58 32 50 32S32 31 24 28C20 25 16 23 12 25Z" fill="#c2185b" stroke={INK} strokeWidth="1" strokeLinejoin="round" />
          <P d="M12 22C18 29 32 34.4 50 34.4S82 29 88 22C84 20 80 22 76 25C68 28 58 29 50 29S32 28 24 25C20 22 16 20 12 22Z" fill="#ff7ab8" />
          <L d="M20 24.6C28 29.6 40 31.6 50 31.6M80 24.6C72 29.6 60 31.6 50 31.6" c="#ffc2dc" w="1" o={0.7} />
          <P d="M33 28C31 14 37.6 7.6 43.6 8.6C47 11.4 53 11.4 56.4 8.6C62.4 7.6 69 14 67 28C58 32 42 32 33 28Z" fill="#ff9ecb" />
          <path d="M43.6 9.2C42.4 14 42.4 20 44 25.6M56.4 9.2C57.6 14 57.6 20 56 25.6" stroke="#d63c86" strokeWidth="1" fill="none" strokeLinecap="round" />
          <path d="M37 16c1.6-3 4-4.6 7-5" fill="none" stroke="#fff6fb" strokeWidth="1.4" strokeLinecap="round" opacity=".7" />
          <path d="M33.3 24.2C41.6 28.2 58.4 28.2 66.7 24.2L67 28C58 32 42 32 33 28Z" fill="#7a1a46" stroke={INK} strokeWidth=".9" strokeLinejoin="round" />
          <path d="M50 24.6l1.4 2.8 3 .4-2.2 2 .6 3-2.8-1.5-2.8 1.5.6-3-2.2-2 3-.4z" fill="#ffd35a" stroke={INK} strokeWidth=".5" strokeLinejoin="round" />
        </g>
      )
    case 'bandana_biker':
      return (
        <>
          <P d="M30 41.4C28 24 38.4 16 50 16S72 24 70 41.4C64 36.6 58 34.8 50 34.8S36 36.6 30 41.4Z" fill="#1d1b26" />
          <L d="M50 16.4V34.6M41 18C38.4 24 37.8 30 38.8 35.4M59 18C61.6 24 62.2 30 61.2 35.4" c="#0b0a10" w=".9" o={0.9} />
          {[[44, 24.6, 1], [56, 23.6, -1], [48.6, 30, 1], [60.4, 30.4, -1], [38.6, 29.4, 1], [51.4, 20.4, -1]].map(([x, y, f]) => (
            <path key={`${x}-${y}`} d={`M${x} ${y}c${-2.6 * f} 1.4-2.4 4.8.4 5.4 2.2-.4 3-2.8 1.8-4.4z`} fill="#ff4f93" />
          ))}
          <L d="M36 24.6c4-4 9-6 15-6" c="#4a4660" w="1.4" o={0.6} />
          <path d="M30.4 40.8C36 36 43 34.6 50 34.6S64 36 69.6 40.8" fill="none" stroke={INK} strokeWidth="3" strokeLinecap="round" />
          <path d="M30.4 40.8C36 36 43 34.6 50 34.6S64 36 69.6 40.8" fill="none" stroke="#ff4f93" strokeWidth="1.7" strokeLinecap="round" />
          <P d="M68 36.4C72 34 76 36.4 75.6 40.4 74 43 70 42.4 68.4 39.8Z" fill="#1d1b26" w={1.2} />
          <P d="M74 40L82.4 46 78.2 47.4 80.4 52.6 74.4 48.2Z" fill="#1d1b26" w={1.1} />
          <P d="M75.4 38.2L84.6 39.4 80 43Z" fill="#1d1b26" w={1.1} />
        </>
      )
    case 'ribbon_pink':
      return (
        <>
          <P d="M61 27C55 17.6 47 21 50.4 28.6 54 31 58.6 30 61 27Z" fill="#ff4f93" />
          <P d="M61 27C67 17.6 75 21 71.6 28.6 68 31 63.4 30 61 27Z" fill="#ff4f93" />
          <L d="M58.4 25.4C54.6 22.8 51.6 23.6 52 26M63.6 25.4C67.4 22.8 70.4 23.6 70 26" c="#ff9ac6" w="1" o={0.9} />
          <P d="M59.6 29L55.4 38.4 59.8 36.4 61.8 39.6 62.6 29.6Z" fill="#e0307a" w={1.2} />
          <P d="M62.8 29.4L67.4 38 63.4 36.4 61.8 39.6Z" fill="#c2185b" w={1.2} />
          <circle cx="61" cy="27.4" r="3.1" fill="#ff4f93" stroke={INK} strokeWidth="1.1" />
          <circle cx="60" cy="26.4" r=".9" fill="#fff" opacity=".7" />
        </>
      )
    default:
      return null
  }
}

export function AvatarArt({ config, mood = 'smile' }: { config: AvatarConfig; mood?: AvatarMood }) {
  const uid = useId().replace(/[^a-zA-Z0-9]/g, '')
  const skin = SKIN_TONES[config.skin]
  const dark = shade(skin, -34)
  const acc2 = config.acc2 ?? 'none'
  const lipC = config.acc === 'lipstick_pink' || acc2 === 'lipstick_pink' ? '#ff3d8b' : mix(shade(skin, -46), '#b3262c', 0.5)
  const hairC = HAIR_COLORS[config.hair] ?? '#1b120c'
  const browC = config.hair === 'braids_pink' || config.hair === 'afro_pink' || config.hair === 'ponytail_pop' ? '#2a1a10' : hairC
  const head = HEAD_PATHS[config.face]
  // Un gélé est déjà une coiffe : il remplace tout autre couvre-chef.
  const headwear = config.hair === 'gele' ? 'none' : config.head
  const cover = COVERING.includes(headwear)
  const hairHiding = HAIR_HIDING.includes(headwear)
  const ey = config.face === 'long' ? 44 : 45

  const brow = (s: -1 | 1) => {
    const cx = 50 + s * 8.4
    const innerY = mood === 'angry' ? 41.6 : 40.4
    const outerY = mood === 'angry' ? 38 : mood === 'shock' ? 36.8 : 39.4
    const apexY = mood === 'angry' ? 38.8 : mood === 'shock' ? 35.2 : 37.6
    const ix = cx - s * 5.4
    const ox = cx + s * 5.8
    const ax = cx + s * 0.8
    return <path key={s} d={`M${ix} ${innerY}Q${ax} ${apexY} ${ox} ${outerY}L${ox} ${outerY + 1}Q${ax} ${apexY + 1.8} ${ix} ${innerY + 1.4}Z`} fill={browC} stroke={browC} strokeWidth=".4" strokeLinejoin="round" />
  }
  const eye = (s: -1 | 1) => {
    const cx = 50 + s * 8.4
    const cy = ey
    const big = mood === 'shock' ? 1.18 : 1
    const rw = 4.9 * big
    const top = 3.7 * big
    const bot = 2.9 * big
    const almond = `M${cx - rw} ${cy}C${cx - rw / 2} ${cy - top} ${cx + rw / 2} ${cy - top} ${cx + rw} ${cy}C${cx + rw / 2} ${cy + bot} ${cx - rw / 2} ${cy + bot} ${cx - rw} ${cy}Z`
    const id = `${uid}e${s > 0 ? 'r' : 'l'}`
    return (
      <g key={s}>
        <clipPath id={id}>
          <path d={almond} />
        </clipPath>
        <path d={almond} fill="#fffdf6" />
        <g clipPath={`url(#${id})`}>
          <circle cx={cx + s * -0.5} cy={cy + 0.3} r={3.3 * big} fill={`url(#${uid}ir)`} />
          <circle cx={cx + s * -0.5} cy={cy + 0.3} r={1.6 * big} fill="#0e0704" />
          <ellipse cx={cx} cy={cy - top / 2 + 0.6} rx={rw} ry="1.6" fill="#000" opacity=".16" />
          <circle cx={cx - 1.3} cy={cy - 1} r="1.1" fill="#fff" />
          <circle cx={cx + 1.2} cy={cy + 1.3} r=".5" fill="#fff" opacity=".9" />
        </g>
        <path d={almond} fill="none" stroke={INK} strokeWidth=".6" />
        <path d={`M${cx - rw - 0.3} ${cy + 0.2}C${cx - rw / 2} ${cy - top - 0.5} ${cx + rw / 2} ${cy - top - 0.5} ${cx + rw + 0.3} ${cy + 0.2}`} fill="none" stroke={INK} strokeWidth="1.8" strokeLinecap="round" />
        <path d={`M${cx + s * (rw + 0.2)} ${cy + 0.1}l${s * 1.6} -1.1`} stroke={INK} strokeWidth="1.3" strokeLinecap="round" />
        <path d={`M${cx - rw + 1} ${cy - top - 1.1}C${cx - 1} ${cy - top - 2.2} ${cx + 2} ${cy - top - 2.2} ${cx + rw - 0.6} ${cy - top - 0.7}`} fill="none" stroke={dark} strokeWidth=".6" opacity=".7" strokeLinecap="round" />
        {mood === 'angry' && <path d={`M${cx - s * 6} ${cy - 6}L${cx + s * 6} ${cy - 6}L${cx + s * 5.4} ${cy - 3.6}L${cx - s * 5.6} ${cy - 1.2}Z`} fill={skin} stroke={INK} strokeWidth=".9" strokeLinejoin="round" />}
      </g>
    )
  }
  const eyes =
    mood === 'dead' ? (
      <g stroke={INK} strokeWidth="2" strokeLinecap="round">
        <path d={`M38 ${ey - 2.4}l5 5M43 ${ey - 2.4}l-5 5M57 ${ey - 2.4}l5 5M62 ${ey - 2.4}l-5 5`} />
      </g>
    ) : mood === 'sleep' ? (
      <g fill="none" stroke={INK} strokeWidth="2" strokeLinecap="round">
        <path d={`M37.6 ${ey - 0.4}c1.8 3 5.8 3 7.6 0M54.8 ${ey - 0.4}c1.8 3 5.8 3 7.6 0`} />
      </g>
    ) : (
      <>
        {eye(-1)}
        {eye(1)}
      </>
    )

  const my = 60
  const mouth =
    mood === 'dead' ? (
      <path d={`M44 ${my + 1.4}h12`} stroke={INK} strokeWidth="2" strokeLinecap="round" />
    ) : mood === 'talk' ? (
      <g stroke={INK} strokeWidth="1.1" strokeLinejoin="round">
        <ellipse cx="50" cy={my + 1} rx="4" ry="3.6" fill="#4a1710" />
        <ellipse cx="50" cy={my + 2.6} rx="2.3" ry="1.3" fill="#e0675f" stroke="none" />
      </g>
    ) : mood === 'shock' ? (
      <g stroke={INK} strokeWidth="1.1">
        <ellipse cx="50" cy={my + 1.6} rx="3.4" ry="4.6" fill="#4a1710" />
        <ellipse cx="50" cy={my + 3.6} rx="2" ry="1.4" fill="#e0675f" stroke="none" />
      </g>
    ) : mood === 'grin' ? (
      <g stroke={INK} strokeWidth="1.1" strokeLinejoin="round">
        <path d={`M41.4 ${my - 1.4}C45 ${my - 2.6} 55 ${my - 2.6} 58.6 ${my - 1.4}C57.4 ${my + 6.6} 42.6 ${my + 6.6} 41.4 ${my - 1.4}Z`} fill="#4a1710" />
        <path d={`M42.4 ${my - 1.2}C46 ${my - 2.2} 54 ${my - 2.2} 57.6 ${my - 1.2}L57 ${my + 1.8}C53.6 ${my + 1} 46.4 ${my + 1} 43 ${my + 1.8}Z`} fill="#fffdf6" stroke="none" />
        <ellipse cx="50" cy={my + 4.2} rx="3.4" ry="1.5" fill="#e0675f" stroke="none" />
      </g>
    ) : mood === 'angry' ? (
      <g stroke={INK} strokeWidth=".9" strokeLinejoin="round">
        <path d={`M43.4 ${my + 2.4}C46 ${my - 0.2} 54 ${my - 0.2} 56.6 ${my + 2.4}C54 ${my + 1.8} 46 ${my + 1.8} 43.4 ${my + 2.4}Z`} fill={lipC} />
        <path d={`M44 ${my + 2.4}C47 ${my + 4.4} 53 ${my + 4.4} 56 ${my + 2.4}`} fill="none" />
      </g>
    ) : (
      <g stroke={INK} strokeWidth=".9" strokeLinejoin="round">
        <path
          d={mood === 'smile' ? `M42.6 ${my - 0.4}C45.6 ${my - 2.2} 48.4 ${my - 1.8} 50 ${my - 1}C51.6 ${my - 1.8} 54.4 ${my - 2.2} 57.4 ${my - 0.4}C55 ${my + 0.8} 52.4 ${my + 1} 50 ${my + 1}S45 ${my + 0.8} 42.6 ${my - 0.4}Z` : `M43.6 ${my}C46 ${my - 1.8} 48.4 ${my - 1.6} 50 ${my - 0.9}C51.6 ${my - 1.6} 54 ${my - 1.8} 56.4 ${my}C54.2 ${my + 0.8} 52 ${my + 1} 50 ${my + 1}S45.8 ${my + 0.8} 43.6 ${my}Z`}
          fill={lipC}
        />
        <path d={mood === 'smile' ? `M43.4 ${my + 0.6}C46 ${my + 4.6} 54 ${my + 4.6} 56.6 ${my + 0.6}C54 ${my + 1.2} 46 ${my + 1.2} 43.4 ${my + 0.6}Z` : `M44.4 ${my + 0.8}C47 ${my + 3.8} 53 ${my + 3.8} 55.6 ${my + 0.8}C53 ${my + 1.2} 47 ${my + 1.2} 44.4 ${my + 0.8}Z`} fill={shade(lipC, 14)} />
        {mood === 'smile' && <path d={`M41.6 ${my - 1.8}l1.2 1.6M58.4 ${my - 1.8}l-1.2 1.6`} fill="none" strokeWidth=".9" strokeLinecap="round" />}
        <path d={`M47 ${my + 2.6}c1.8 .8 4.2 .8 6 0`} fill="none" stroke="#fff" strokeWidth=".6" opacity=".45" strokeLinecap="round" />
      </g>
    )

  return (
    <svg viewBox="0 0 100 100" className="block h-full w-full" aria-hidden="true">
      <defs>
        <radialGradient id={`${uid}bg`} cx="50%" cy="42%" r="70%">
          <stop offset="0" stopColor="#fff" stopOpacity=".16" />
          <stop offset=".55" stopColor="#fff" stopOpacity="0" />
          <stop offset="1" stopColor="#000" stopOpacity=".22" />
        </radialGradient>
        <radialGradient id={`${uid}ir`} cx="42%" cy="36%" r="72%">
          <stop offset="0" stopColor="#a8692a" />
          <stop offset=".6" stopColor="#5b3416" />
          <stop offset="1" stopColor="#2c1709" />
        </radialGradient>
        <linearGradient id={`${uid}sh`} x1="0" y1="72" x2="0" y2="100" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#fff" stopOpacity=".1" />
          <stop offset=".5" stopColor="#000" stopOpacity="0" />
          <stop offset="1" stopColor="#000" stopOpacity=".3" />
        </linearGradient>
        <linearGradient id={`${uid}hs`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#000" stopOpacity=".42" />
          <stop offset="1" stopColor="#000" stopOpacity="0" />
        </linearGradient>
        <clipPath id={`${uid}hd`}>
          <path d={head} />
        </clipPath>
      </defs>
      <rect width="100" height="100" fill={AVATAR_BGS[config.bg]} />
      {config.bg === 6 && nightSky(uid)}
      <rect width="100" height="100" fill={`url(#${uid}bg)`} />

      {hairBack(config.hair, hairC, cover, hairHiding)}
      <path d="M41.6 60v14c0 3.6 3.8 6 8.4 6s8.4-2.4 8.4-6V60z" fill={dark} stroke={INK} strokeWidth="1.4" strokeLinejoin="round" />
      {outfitArt(config.outfit, skin, dark, uid)}
      {cover && <ellipse cx="50" cy="73.4" rx="9" ry="3.6" fill="#000" opacity=".3" />}
      {/* oreilles */}
      {[-1, 1].map((s) => (
        <g key={s}>
          <path d={`M${50 + s * 18.4} ${ey - 3}c${s * 3.6} -1.2 ${s * 5.6} 1.4 ${s * 5} 4.8c-.4 3.4 ${s * -2.2} 5.2 ${s * -5} 4.6`} fill={skin} stroke={INK} strokeWidth="1.4" strokeLinejoin="round" />
          <path d={`M${50 + s * 20.4} ${ey - 0.4}c${s * 1.6} .4 ${s * 1.8} 3 ${s * 0.2} 4`} fill="none" stroke={dark} strokeWidth=".8" strokeLinecap="round" />
        </g>
      ))}
      <path d={head} fill={skin} stroke={INK} strokeWidth="1.6" strokeLinejoin="round" />
      <g clipPath={`url(#${uid}hd)`}>
        <path d={`M66 30C70 44 66 60 52 72L72 80L80 20Z`} fill={shade(skin, -30)} opacity=".3" />
        <ellipse cx="50" cy="71.4" rx="14" ry="3.6" fill={shade(skin, -40)} opacity={cover ? 0.5 : 0.35} />
        <ellipse cx="41" cy="34" rx="6.4" ry="2.8" fill="#fff" opacity=".22" transform="rotate(-18 41 34)" />
      </g>
      {hairFront(config.hair, hairC, uid, head, cover, hairHiding)}
      {cover && (
        <g clipPath={`url(#${uid}hd)`}>
          <rect x="28" y={headwear === 'cap' ? 37 : 34} width="44" height="9" fill={`url(#${uid}hs)`} />
        </g>
      )}

      {eyes}
      {mood !== 'dead' && mood !== 'sleep' ? [-1, 1].map((s) => brow(s as -1 | 1)) : null}
      <path d="M52.4 46.4c.9 2.8 1.8 5 2.4 6.6" fill="none" stroke={dark} strokeWidth="1.1" strokeLinecap="round" />
      <path d="M46.2 54.6c1.4 1.8 6.2 1.8 7.6 0" fill="none" stroke={dark} strokeWidth="1.3" strokeLinecap="round" />
      {cover && (
        <>
          <ellipse cx="47.8" cy="54.4" rx=".9" ry=".6" fill={INK} opacity=".55" />
          <ellipse cx="52.2" cy="54.4" rx=".9" ry=".6" fill={INK} opacity=".55" />
        </>
      )}
      <ellipse cx="50.4" cy="52" rx="1.9" ry="1.1" fill="#fff" opacity=".22" />
      {mouthProp(config.acc)}
      {mouthProp(acc2)}
      {mouth}
      {faceAccessory(config.acc, skin, ey)}
      {faceAccessory(acc2, skin, ey)}
      {headwearArt(headwear, uid)}
    </svg>
  )
}

export type ItemPart = 'hair' | 'outfit' | 'acc' | 'head' | 'bg'

// Zone visible (viewBox) de chaque pièce présentée seule : on cadre l'objet,
// pas un avatar entier.
const ITEM_VIEW: Record<'hair' | 'head' | 'outfit', string> = {
  hair: '4 2 92 90',
  head: '8 2 84 64',
  outfit: '0 50 100 50',
}
const ITEM_ACC_VIEW: Record<string, string> = {
  cigarette: '44 40 34 32',
  toothpick: '44 52 30 16',
  gold_chain: '14 62 72 38',
  lipstick_pink: '28 32 44 38',
}

/** Une pièce d'avatar présentée SEULE, pour les vignettes de la boutique :
 * l'objet (coiffure, tenue, couvre-chef, accessoire ou fond) posé sur un
 * mannequin fantôme sans visage ni couleur, jamais sur un avatar entier. */
export function ItemArt({ part, value, className = 'h-full w-full' }: { part: ItemPart; value: string; className?: string }) {
  const uid = useId().replace(/[^a-zA-Z0-9]/g, '')
  const ghost = 'rgba(255,246,251,.08)'
  const ghostLine = 'rgba(255,246,251,.22)'
  const skin = '#d9c9ba'
  const head = HEAD_PATHS.oval

  const mannequin = (withBody: boolean) => (
    <g>
      {withBody && <path d={SHOULDERS} fill={ghost} stroke={ghostLine} strokeWidth="1" strokeLinejoin="round" />}
      <path d="M41.6 60v14c0 3.6 3.8 6 8.4 6s8.4-2.4 8.4-6V60z" fill={ghost} stroke={ghostLine} strokeWidth="1" strokeLinejoin="round" />
      <path d={head} fill={ghost} stroke={ghostLine} strokeWidth="1" strokeLinejoin="round" />
    </g>
  )
  const defs = (
    <defs>
      <linearGradient id={`${uid}sh`} x1="0" y1="72" x2="0" y2="100" gradientUnits="userSpaceOnUse">
        <stop offset="0" stopColor="#fff" stopOpacity=".1" />
        <stop offset=".5" stopColor="#000" stopOpacity="0" />
        <stop offset="1" stopColor="#000" stopOpacity=".3" />
      </linearGradient>
      <clipPath id={`${uid}hd`}>
        <path d={head} />
      </clipPath>
    </defs>
  )

  let viewBox = '0 0 100 100'
  let body: ReactNode = null
  if (part === 'bg') {
    body = nightSky(uid)
  } else if (part === 'hair') {
    const kind = value as AvatarConfig['hair']
    const h = HAIR_COLORS[kind] ?? '#1b120c'
    viewBox = ITEM_VIEW.hair
    body = (
      <>
        {hairBack(kind, h)}
        {mannequin(true)}
        {hairFront(kind, h, uid, head)}
      </>
    )
  } else if (part === 'head') {
    const kind = value as AvatarConfig['head']
    viewBox = ITEM_VIEW.head
    body = (
      <>
        {mannequin(false)}
        {headwearArt(kind, uid)}
      </>
    )
  } else if (part === 'outfit') {
    viewBox = ITEM_VIEW.outfit
    body = (
      <>
        {mannequin(false)}
        {outfitArt(value as AvatarConfig['outfit'], skin, shade(skin, -34), uid)}
      </>
    )
  } else {
    const kind = value as AvatarConfig['acc']
    viewBox = ITEM_ACC_VIEW[kind] ?? '0 0 100 100'
    body =
      kind === 'toothpick' ? (
        // le cure-dent est très fin : version épaissie pour qu'il se lise en vignette
        <g strokeLinecap="round">
          <path d="M49 62L67 64.6" stroke={INK} strokeWidth="4.4" />
          <path d="M49 62L67 64.6" stroke="#e6c27a" strokeWidth="2.6" />
          <path d="M56 62.9L63 63.9" stroke="#b58f48" strokeWidth=".9" opacity=".8" />
          <path d="M65 64.3L68.6 64.8" stroke="#b58f48" strokeWidth="1.6" />
        </g>
      ) : kind === 'cigarette' ? (
        <>
          {mouthProp(kind)}
          {faceAccessory(kind, skin, 45)}
        </>
      ) : kind === 'gold_chain' ? (
        <>
          {mannequin(true)}
          {faceAccessory(kind, skin, 45)}
        </>
      ) : (
        <>
          <path d={head} fill={ghost} stroke={ghostLine} strokeWidth="1" />
          {[-1, 1].map((sg) => (
            <path key={sg} d={`M${50 + sg * 8.4 - 4.9} 45C${50 + sg * 8.4 - 2.4} 41.3 ${50 + sg * 8.4 + 2.4} 41.3 ${50 + sg * 8.4 + 4.9} 45C${50 + sg * 8.4 + 2.4} 47.9 ${50 + sg * 8.4 - 2.4} 47.9 ${50 + sg * 8.4 - 4.9} 45Z`} fill="#fffdf6" fillOpacity=".85" stroke={INK} strokeWidth=".6" />
          ))}
          {faceAccessory(kind, skin, 45)}
          <path d="M42.6 59.6C45.6 57.8 48.4 58.2 50 59C51.6 58.2 54.4 57.8 57.4 59.6C55 62.4 52.4 63 50 63S45 62.4 42.6 59.6Z" fill="#ff3d8b" stroke={INK} strokeWidth=".8" strokeLinejoin="round" />
        </>
      )
  }

  return (
    <svg viewBox={viewBox} className={`block ${className}`} aria-hidden="true">
      {defs}
      {body}
    </svg>
  )
}
