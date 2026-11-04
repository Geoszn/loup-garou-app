import { memo, useId, type ReactNode } from 'react'
import { AVATAR_BGS, SKIN_TONES, type AvatarConfig, type AvatarMood } from '../lib/avatarParts'
import { shade, mix, toRgb } from '../lib/avatarColor'
import { FaceDefs, Neck, Ears, SkinShading, Eyes, Brows, Nose, Mouth, OutfitShading, HairSheen } from './avatarFace'

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

const HEAD_PATHS: Record<AvatarConfig['face'], string> = {
  oval: 'M32 39C32 27 40 20.5 50 20.5S68 27 68 39C68 49 66.5 57 62 62.5C58.5 66.8 54 69 50 69S41.5 66.8 38 62.5C33.5 57 32 49 32 39Z',
  round: 'M31 42C31 28 39 21 50 21S69 28 69 42C69 56 61 68 50 68S31 56 31 42Z',
  square: 'M32 36C32 26 40 21 50 21S68 26 68 36V50C68 60 64 67 57 68.5H43C36 67 32 60 32 50Z',
  long: 'M34 38C34 26 41 19 50 19S66 26 66 38C66 50 65 60 61 66C57.5 70.5 54 72.5 50 72.5S42.5 70.5 39 66C35 60 34 50 34 38Z',
  heart: 'M32 37C32 27 40 21 50 21S68 27 68 37C68 46 65 55 59 63C55 68 52 71 50 71S45 68 41 63C35 55 32 46 32 37Z',
}
const SHOULDERS = 'M5 100C5 85 17 76 36 72.5L50 78L64 72.5C83 76 95 85 95 100Z'

/** Forme pleine avec contour d'encre. */
function P({ d, fill, w = 1.15, extra }: { d: string; fill: string; w?: number; extra?: object }) {
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

/** Tresse qui naît au cuir chevelu : racine cachée sous la calotte de cheveux (hairFront), départ vers l'extérieur puis retombée
 * le long de la tête et de l'épaule, avec un petit nœud à la racine et une perle au bout. `bow` > 0 gonfle la courbe vers
 * l'extérieur ; le côté gauche/droit se règle par le signe de `bow` et la position. */
function HangingBraid({ sx, sy, ex, ey, bow, h, bead = '#e0b04a', w = 4.2 }: { sx: number; sy: number; ex: number; ey: number; bow: number; h: string; bead?: string; w?: number }) {
  const c1x = sx + bow
  const c1y = sy + (ey - sy) * 0.28
  const c2x = ex + bow * 0.55
  const c2y = ey - (ey - sy) * 0.34
  const d = `M${sx} ${sy}C${c1x} ${c1y} ${c2x} ${c2y} ${ex} ${ey}`
  const links: ReactNode[] = []
  const n = Math.floor(Math.hypot(ex - sx, ey - sy) / 3.1)
  for (let i = 1; i < n; i++) {
    const t = i / n
    const u = 1 - t
    const px = u * u * u * sx + 3 * u * u * t * c1x + 3 * u * t * t * c2x + t * t * t * ex
    const py = u * u * u * sy + 3 * u * u * t * c1y + 3 * u * t * t * c2y + t * t * t * ey
    links.push(<path key={i} d={`M${px - w * 0.34} ${py - 1.1}l${w * 0.34} 1.4l${w * 0.34} -1.4`} fill="none" stroke={shade(h, 55)} strokeWidth=".65" strokeLinecap="round" opacity=".8" />)
  }
  return (
    <g>
      <path d={d} fill="none" stroke={INK} strokeWidth={w + 1.6} strokeLinecap="round" />
      <path d={d} fill="none" stroke={h} strokeWidth={w} strokeLinecap="round" />
      {links}
      <circle cx={ex} cy={ey + 0.7} r="1.6" fill={bead} stroke={INK} strokeWidth=".65" />
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

/** Fond n°7 « Aurore Dorée » (édition limitée, 1000 Loup Coins) : nuit
 * profonde, rubans d'aurore qui ondulent, soleil de rayons dorés qui tourne
 * lentement derrière la tête, anneau d'or et poussière d'étoiles qui
 * scintille. Aucun filtre (flou) : seuls des transforms et des opacités
 * animés, pour rester léger même avec plusieurs avatars à l'écran ; les
 * animations s'arrêtent si le joueur a demandé moins de mouvement. */
function goldenAurora(uid: string): ReactNode {
  const cx = 50
  const cy = 42
  const rays = Array.from({ length: 14 }, (_, i) => {
    const a0 = ((i * 360) / 14 - 4.2) * (Math.PI / 180)
    const a1 = ((i * 360) / 14 + 4.2) * (Math.PI / 180)
    const r = 84
    return `M${cx} ${cy}L${(cx + Math.cos(a0) * r).toFixed(2)} ${(cy + Math.sin(a0) * r).toFixed(2)}L${(cx + Math.cos(a1) * r).toFixed(2)} ${(cy + Math.sin(a1) * r).toFixed(2)}Z`
  }).join('')
  const dust = Array.from({ length: 30 }, (_, i) => ({
    x: (i * 37 + 11) % 100,
    y: (i * 53 + 7) % 78,
    r: i % 6 === 0 ? 0.95 : i % 3 === 0 ? 0.65 : 0.4,
    d: (i % 9) * 0.45,
  }))
  const css =
    '@keyframes bgp7a{from{transform:translate(-6px,1.5px)}to{transform:translate(6px,-2px)}}' +
    '@keyframes bgp7b{from{transform:translate(5px,-1px)}to{transform:translate(-7px,2px)}}' +
    '@keyframes bgp7r{to{transform:rotate(360deg)}}' +
    '@keyframes bgp7t{0%,100%{opacity:.15}50%{opacity:1}}' +
    '@keyframes bgp7h{0%,100%{opacity:.75}50%{opacity:1}}' +
    '.bgp7{animation-timing-function:ease-in-out;animation-iteration-count:infinite}' +
    '@media (prefers-reduced-motion:reduce){.bgp7{animation:none!important}}'
  return (
    <>
      <defs>
        <radialGradient id={`${uid}ab`} cx="50%" cy="42%" r="78%">
          <stop offset="0" stopColor="#2c1670" />
          <stop offset=".5" stopColor="#140b3a" />
          <stop offset="1" stopColor="#05030f" />
        </radialGradient>
        <linearGradient id={`${uid}r1`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#2de2b0" stopOpacity="0" />
          <stop offset=".5" stopColor="#2de2b0" stopOpacity=".62" />
          <stop offset="1" stopColor="#3a8bff" stopOpacity="0" />
        </linearGradient>
        <linearGradient id={`${uid}r2`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#8a5cff" stopOpacity="0" />
          <stop offset=".5" stopColor="#b27cff" stopOpacity=".55" />
          <stop offset="1" stopColor="#ff6fb5" stopOpacity="0" />
        </linearGradient>
        <linearGradient id={`${uid}r3`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#ffd56a" stopOpacity="0" />
          <stop offset=".5" stopColor="#ffd56a" stopOpacity=".42" />
          <stop offset="1" stopColor="#ff9a4a" stopOpacity="0" />
        </linearGradient>
        <radialGradient id={`${uid}ry`} cx={`${cx}%`} cy={`${cy}%`} r="62%" gradientUnits="objectBoundingBox">
          <stop offset="0" stopColor="#ffe08a" stopOpacity=".55" />
          <stop offset="1" stopColor="#ffe08a" stopOpacity="0" />
        </radialGradient>
        <radialGradient id={`${uid}gl`}>
          <stop offset="0" stopColor="#ffe9a8" stopOpacity=".55" />
          <stop offset=".6" stopColor="#ffc94d" stopOpacity=".18" />
          <stop offset="1" stopColor="#ffc94d" stopOpacity="0" />
        </radialGradient>
        <linearGradient id={`${uid}rg`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#fff2c2" />
          <stop offset=".5" stopColor="#f0b93c" />
          <stop offset="1" stopColor="#ffe08a" />
        </linearGradient>
        <radialGradient id={`${uid}vg`} cx="50%" cy="46%" r="72%">
          <stop offset=".62" stopColor="#000" stopOpacity="0" />
          <stop offset="1" stopColor="#000" stopOpacity=".55" />
        </radialGradient>
      </defs>
      <style dangerouslySetInnerHTML={{ __html: css }} />
      <rect width="100" height="100" fill={`url(#${uid}ab)`} />
      <g className="bgp7" style={{ animation: 'bgp7a 12s ease-in-out infinite alternate' }}>
        <path d="M-12 30C8 14 28 46 50 28S88 10 112 30V56C90 38 70 66 48 48S8 36 -12 56Z" fill={`url(#${uid}r1)`} />
      </g>
      <g className="bgp7" style={{ animation: 'bgp7b 15s ease-in-out infinite alternate' }}>
        <path d="M-12 46C10 30 34 62 54 44S90 28 112 48V74C92 56 72 82 52 66S10 54 -12 76Z" fill={`url(#${uid}r2)`} />
      </g>
      <g className="bgp7" style={{ animation: 'bgp7a 19s ease-in-out infinite alternate-reverse' }}>
        <path d="M-12 62C12 50 34 76 56 62S90 50 112 64V84C90 72 70 94 50 82S10 74 -12 90Z" fill={`url(#${uid}r3)`} />
      </g>
      <g className="bgp7" style={{ transformOrigin: `${cx}px ${cy}px`, animation: 'bgp7r 80s linear infinite' }}>
        <path d={rays} fill={`url(#${uid}ry)`} opacity=".55" />
      </g>
      <circle cx={cx} cy={cy - 1} r="34" fill={`url(#${uid}gl)`} className="bgp7" style={{ animation: 'bgp7h 5s ease-in-out infinite' }} />
      <circle cx={cx} cy={cy - 1} r="27.5" fill="none" stroke={`url(#${uid}rg)`} strokeWidth="1.3" opacity=".9" />
      <circle cx={cx} cy={cy - 1} r="31" fill="none" stroke="#ffe08a" strokeWidth=".35" opacity=".55" strokeDasharray="1.2 2.2" />
      {dust.map((d, i) => (
        <circle key={i} cx={d.x} cy={d.y} r={d.r} fill={i % 4 === 0 ? '#ffe08a' : '#fff'} className="bgp7" style={{ animation: `bgp7t ${3 + (i % 5) * 0.7}s ease-in-out ${d.d}s infinite` }} />
      ))}
      {[[14, 20, 1.3], [86, 16, 1.6], [90, 52, 1.1], [9, 58, 1.1], [72, 8, 0.9]].map(([x, y, s], i) => (
        <path key={`s${i}`} d={sparkle(x, y, s)} fill="#fff4cf" className="bgp7" style={{ animation: `bgp7t ${2.6 + i * 0.5}s ease-in-out ${i * 0.6}s infinite` }} />
      ))}
      <rect width="100" height="100" fill={`url(#${uid}vg)`} />
    </>
  )
}

/** Palmier : tronc courbe, couronne de palmes, deux noix de coco ; oscille doucement autour de son pied. */
function palm(bx: number, by: number, cx: number, cy: number, s: number, bend: number, delay: number): ReactNode {
  const fronds = [-172, -138, -104, -66, -28, 8, 42]
  return (
    <g className="bgp8" style={{ transformOrigin: `${bx}px ${by}px`, animation: `bgp8s ${7 + delay}s ease-in-out ${-delay * 2}s infinite alternate` }}>
      <path d={`M${bx} ${by}Q${(bx + cx) / 2 + bend} ${(by + cy) / 2} ${cx} ${cy}`} stroke="#5b3a20" strokeWidth={2.4 * s} fill="none" strokeLinecap="round" />
      <path d={`M${bx + 0.7} ${by}Q${(bx + cx) / 2 + bend + 0.7} ${(by + cy) / 2} ${cx + 0.5} ${cy}`} stroke="#7a5230" strokeWidth={0.7 * s} fill="none" strokeLinecap="round" opacity=".6" />
      <g transform={`translate(${cx} ${cy}) scale(${s})`}>
        {fronds.map((a, i) => (
          <path key={a} d="M0 0C5-8 14-9 24-2C15-3.6 7-2.6 0 0Z" transform={`rotate(${a})`} fill={i % 2 ? '#1c7a3d' : '#2fa055'} stroke="#0f4a25" strokeWidth=".35" strokeLinejoin="round" />
        ))}
        <circle cx="-1.3" cy="1.3" r=".95" fill="#5b3a20" />
        <circle cx="1.2" cy="1.6" r=".95" fill="#6b4626" />
      </g>
    </g>
  )
}

/** Fond n°8 « Plage » (édition limitée, 400 Loup Coins) : ciel turquoise, soleil, nuages qui dérivent, mer qui scintille,
 * pirogue de pêcheur à l'horizon, vagues et écume sur le sable doré, deux palmiers qui se balancent. Seuls des transforms
 * et des opacités sont animés (aucun filtre), et les animations s'arrêtent si le joueur a demandé moins de mouvement. */
function beachBackdrop(uid: string): ReactNode {
  const css =
    '@keyframes bgp8c{from{transform:translateX(-5px)}to{transform:translateX(5px)}}' +
    '@keyframes bgp8w{from{transform:translateX(-3px)}to{transform:translateX(3px)}}' +
    '@keyframes bgp8s{from{transform:rotate(-1.6deg)}to{transform:rotate(1.8deg)}}' +
    '@keyframes bgp8b{from{transform:translateY(-.6px) rotate(-2deg)}to{transform:translateY(.7px) rotate(2deg)}}' +
    '@keyframes bgp8t{0%,100%{opacity:.15}50%{opacity:.95}}' +
    '@keyframes bgp8h{0%,100%{opacity:.7}50%{opacity:1}}' +
    '@keyframes bgp8g{from{transform:translate(-4px,1px)}to{transform:translate(5px,-1px)}}' +
    '.bgp8{animation-timing-function:ease-in-out;animation-iteration-count:infinite}' +
    '@media (prefers-reduced-motion:reduce){.bgp8{animation:none!important}}'
  const glitter = [[76, 57, 9], [82, 59.5, 12], [78, 62, 15], [84, 64.5, 10], [79, 67, 13], [75, 69.5, 7]]
  const cloud = (x: number, y: number, k: number) => (
    <g transform={`translate(${x} ${y}) scale(${k})`} fill="#fff" opacity=".88">
      <ellipse cx="0" cy="0" rx="7" ry="2.4" />
      <ellipse cx="-3" cy="-1.7" rx="3.6" ry="2.2" />
      <ellipse cx="2.2" cy="-2.2" rx="4.2" ry="2.6" />
    </g>
  )
  return (
    <>
      <defs>
        <linearGradient id={`${uid}sk`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#1fa9e6" />
          <stop offset=".55" stopColor="#8fdcf6" />
          <stop offset="1" stopColor="#ffe6b4" />
        </linearGradient>
        <linearGradient id={`${uid}se`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#3ad0cf" />
          <stop offset=".6" stopColor="#139bb5" />
          <stop offset="1" stopColor="#0c7fa0" />
        </linearGradient>
        <linearGradient id={`${uid}sa`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#fbe5b0" />
          <stop offset="1" stopColor="#e3b878" />
        </linearGradient>
        <radialGradient id={`${uid}su`}>
          <stop offset="0" stopColor="#fff4c8" stopOpacity=".95" />
          <stop offset=".45" stopColor="#ffe28a" stopOpacity=".4" />
          <stop offset="1" stopColor="#ffe28a" stopOpacity="0" />
        </radialGradient>
        <radialGradient id={`${uid}vg`} cx="50%" cy="46%" r="74%">
          <stop offset=".62" stopColor="#000" stopOpacity="0" />
          <stop offset="1" stopColor="#000" stopOpacity=".38" />
        </radialGradient>
      </defs>
      <style dangerouslySetInnerHTML={{ __html: css }} />
      <rect width="100" height="56" fill={`url(#${uid}sk)`} />
      <circle cx="80" cy="21" r="22" fill={`url(#${uid}su)`} className="bgp8" style={{ animation: 'bgp8h 6s ease-in-out infinite' }} />
      <circle cx="80" cy="21" r="6.6" fill="#fffbe6" />
      <g className="bgp8" style={{ animation: 'bgp8c 26s ease-in-out infinite alternate' }}>
        {cloud(24, 17, 1)}
        {cloud(56, 31, 0.7)}
      </g>
      <g className="bgp8" style={{ animation: 'bgp8g 14s ease-in-out infinite alternate' }} fill="none" stroke="#2c4a5e" strokeWidth=".55" strokeLinecap="round">
        <path d="M40 12q1.6-1.8 3.2 0q1.6-1.8 3.2 0" />
        <path d="M50 18q1.2-1.4 2.4 0q1.2-1.4 2.4 0" />
      </g>

      <rect y="52" width="100" height="26" fill={`url(#${uid}se)`} />
      <rect y="51.6" width="100" height=".7" fill="#fff" opacity=".7" />
      {glitter.map(([x, y, w], i) => (
        <rect key={i} x={x - w / 2} y={y} width={w} height=".55" rx=".27" fill="#fffbe6" className="bgp8" style={{ animation: `bgp8t ${2.4 + (i % 3) * 0.6}s ease-in-out ${i * 0.35}s infinite` }} />
      ))}
      <g transform="translate(26 53.6)">
        <g className="bgp8" style={{ animation: 'bgp8b 4.5s ease-in-out infinite alternate' }}>
          <path d="M0 -2.2L0 -8.4L4.6 -3.4Z" fill="#fff3d1" stroke="#c9a96b" strokeWidth=".25" />
          <path d="M-7 -1.7Q0 3.6 8.4 -2.4L7.4 -3Q0 .6 -6 -2.5Z" fill="#d94a3a" />
          <path d="M-6 -2.3Q0 .6 7.2 -2.9" fill="none" stroke="#ffd24a" strokeWidth=".7" strokeLinecap="round" />
        </g>
      </g>

      {[[0, 60, 0.4], [1, 65.5, 0.34], [2, 71, 0.3]].map(([i, y, o]) => (
        <g key={i} className="bgp8" style={{ animation: `bgp8w ${5 + i * 1.3}s ease-in-out ${-i}s infinite alternate` }}>
          <path d={`M-8 ${y}q6-2.2 12 0t12 0t12 0t12 0t12 0t12 0t12 0t12 0t12 0`} fill="none" stroke="#fff" strokeWidth=".6" strokeLinecap="round" opacity={o} />
        </g>
      ))}

      <path d="M-4 80Q22 75.5 50 79T104 77V104H-4Z" fill={`url(#${uid}sa)`} />
      <path d="M-4 80Q22 75.5 50 79T104 77" fill="none" stroke="#fff" strokeWidth="2.2" strokeLinecap="round" opacity=".9" className="bgp8" style={{ animation: 'bgp8w 6s ease-in-out infinite alternate' }} />
      <path d="M-4 82.5Q22 78.5 50 81.6T104 79.8" fill="none" stroke="#fff" strokeWidth=".7" strokeLinecap="round" opacity=".55" />
      <ellipse cx="50" cy="96" rx="52" ry="9" fill="#fff" opacity=".12" />
      <g transform="translate(14 93)">
        <path d="M0-3.2L.9-1L3.2-.9L1.4 .6L2 2.9L0 1.7L-2 2.9L-1.4 .6L-3.2-.9L-.9-1Z" fill="#ff8a4a" stroke="#b44a1a" strokeWidth=".25" />
      </g>
      <g transform="translate(87 91)">
        <path d="M-3 1.6Q-3-2.8 0-2.8T3 1.6Q0 3.2-3 1.6Z" fill="#fde3d4" stroke="#c98c76" strokeWidth=".3" />
        <path d="M0-2.6V2M-1.5-2.1V1.9M1.5-2.1V1.9" stroke="#e0aa94" strokeWidth=".3" />
      </g>

      {palm(8, 102, 15, 40, 1.05, -6, 0)}
      {palm(95, 102, 87, 49, 0.82, 5, 1.4)}

      <rect width="100" height="100" fill={`url(#${uid}vg)`} />
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
        <P d="M31.4 42C28 52 33.4 60 29.4 70C26 78 31 84 34 90L41 86C37.6 78 40 70 36.8 62C34.8 56.6 35.2 46 34.6 40Z" fill={h} />
        <P d="M68.6 42C72 52 66.6 60 70.6 70C74 78 69 84 66 90L59 86C62.4 78 60 70 63.2 62C65.2 56.6 64.8 46 65.4 40Z" fill={h} />
        <L d="M34.4 52c-2 6 2 10 0 16M64 54c2 6-2 10 0 16" c={hl} w="1.1" o={0.7} />
        <L d="M32.6 74c1.6 4 .6 8 2.6 12M67.4 74c-1.6 4-.6 8-2.6 12" c={hl} w="1" o={0.6} />
        <L d="M35.4 46c-1.8 8 .8 15-.6 25M37.6 44c.4 8-.6 14 .4 22M64.6 46c1.8 8-.8 15 .6 25M62.4 44c-.4 8 .6 14-.4 22" c={shade(h, -45)} w=".6" o={0.55} />
      </>
    )
  }
  const hs = shade(h, -45)
  return (
    <>
      <P d="M31.4 41.6C30.2 53 29.2 66 28.6 79C28.2 84 29 87 30.4 89.4C33.4 86.6 36.6 84 39.4 80.6C37.4 68 37.8 54 35 40Z" fill={h} w={1.2} />
      <P d="M68.6 41.6C69.8 53 70.8 66 71.4 79C71.8 84 71 87 69.6 89.4C66.6 86.6 63.4 84 60.6 80.6C62.6 68 62.2 54 65 40Z" fill={h} w={1.2} />
      <L d="M33.4 46C32.8 58 32.2 70 31.4 84M66.6 46C67.2 58 67.8 70 68.6 84" c={hl} w=".9" o={0.55} />
      <L d="M35.4 44C35.2 56 35.6 68 36.8 78M64.6 44C64.8 56 64.4 68 63.2 78M31.8 60C31.2 70 30.8 78 30.6 86M68.2 60C68.8 70 69.2 78 69.4 86" c={hs} w=".6" o={0.6} />
    </>
  )
}

const HAIR_COLORS: Partial<Record<AvatarConfig['hair'], string>> = {
  braids: '#2a1a10', locs: '#241610', malibu_wave: '#f4c95d',
  braids_pink: '#ff6fae', afro_pink: '#f8a9cb', ponytail_pop: '#ff5fa0', pompadour_ken: '#f2c14e',
  snow_afro: '#e6edf5', frost_locs: '#42566d', xmas_braids: '#2a1a10',
}

// Coiffures qui reçoivent un reflet doux sur le haut (les autres ont déjà leurs propres reflets ou couvrent la tête).
const SHEEN_HAIRS: AvatarConfig['hair'][] = ['fade', 'afro', 'curly', 'flat', 'cornrows', 'locs', 'long', 'braids', 'braids_pink', 'puffs', 'knots', 'slick_back', 'bun', 'topknot', 'afro_pink', 'xmas_braids', 'frost_locs', 'star_puffs', 'fiber_braids', 'holly_bun']
const COVERING: AvatarConfig['head'][] = ['cap', 'hat', 'cowboy_pink', 'santa_hat', 'pompom_beanie', 'elf_hat']
// Foulards : ils cachent les cheveux comme un couvre-chef, sans ombre portée sur le visage.
const HAIR_HIDING: AvatarConfig['head'][] = ['scarf_pink', 'bandana_biker']

function hairBack(kind: AvatarConfig['hair'], h: string, cover = false, hide = false): ReactNode {
  // Foulard sur un afro : les cheveux débordent de chaque côté, sous le foulard, au lieu de disparaître d'un coup.
  if (hide && (kind === 'afro' || kind === 'afro_pink' || kind === 'snow_afro')) {
    return (
      <>
        <CurlBlob cx={29.4} cy={42} r={4.6} bumps={7} br={6.4} h={h} curls />
        <CurlBlob cx={70.6} cy={42} r={4.6} bumps={7} br={6.4} h={h} curls />
      </>
    )
  }
  if (hide) return null
  if (cover && (kind === 'afro' || kind === 'afro_pink' || kind === 'snow_afro')) {
    return (
      <>
        <CurlBlob cx={29.4} cy={42} r={4.6} bumps={7} br={6.4} h={h} curls />
        <CurlBlob cx={70.6} cy={42} r={4.6} bumps={7} br={6.4} h={h} curls />
      </>
    )
  }
  if (cover && (kind === 'puffs' || kind === 'ponytail_pop' || kind === 'star_puffs')) return null
  switch (kind) {
    case 'long':
      return <P d="M26.4 40C25.4 24 35 16.4 50 16.4S74.6 24 73.6 40L76 90H24Z" fill={h} />
    case 'malibu_wave':
      return <P d="M26 40C25 24 35.4 16 50 16S75 24 74 40C77 52 72 60 75.6 70C78 78 72 84 75 92H25C28 84 22 78 24.4 70C28 60 23 52 26 40Z" fill={h} />
    case 'afro':
    case 'afro_pink':
    case 'snow_afro':
      return <CurlBlob cx={50} cy={35} r={21} bumps={14} br={8.4} h={h} curls />
    case 'braids':
    case 'xmas_braids':
    case 'fiber_braids':
      return (
        <>
          {[[37, 26, 24, 78], [35, 29, 27.5, 82], [33.5, 32, 31, 84]].map(([sx, sy, ex, ey], i) => (
            <HangingBraid key={`l${i}`} sx={sx} sy={sy} ex={ex} ey={ey} bow={-5.5} h={h} bead={kind === 'xmas_braids' ? (i % 2 ? '#2f8a4f' : '#d4553a') : kind === 'fiber_braids' ? ['#4ae3ff', '#ff5fd0', '#ffe14a'][i] : undefined} />
          ))}
          {[[63, 26, 76, 78], [65, 29, 72.5, 82], [66.5, 32, 69, 84]].map(([sx, sy, ex, ey], i) => (
            <HangingBraid key={`r${i}`} sx={sx} sy={sy} ex={ex} ey={ey} bow={5.5} h={h} bead={kind === 'xmas_braids' ? (i % 2 ? '#d4553a' : '#2f8a4f') : kind === 'fiber_braids' ? ['#ffe14a', '#ff5fd0', '#4ae3ff'][i] : undefined} />
          ))}
        </>
      )
    case 'ponytail_pop':
      return (
        <>
          <P d="M67 25C75 22 82 30 82 44C82 58 80 70 76.6 82C75.4 72 73.6 64 71.6 56C69.6 46 68 36 65.6 29Z" fill={h} />
          <L d="M71 27c5 1.4 8 8 8 17M74 40c2 6 2.6 14 .6 24" c={shade(h, 52)} w="1.1" o={0.6} />
          <L d="M77.6 58c-.8 6-1.8 10-3 15M80.4 44c0 5-.6 9-1.6 13" c={shade(h, -38)} w="1" o={0.7} />
        </>
      )
    case 'puffs':
    case 'star_puffs':
      return (
        <>
          <CurlBlob cx={29} cy={26} r={5} bumps={8} br={6} h={h} curls />
          <CurlBlob cx={71} cy={26} r={5} bumps={8} br={6} h={h} curls />
          {kind === 'star_puffs' && (
            <g fill="#ffd45a" stroke="#a8741c" strokeWidth=".45">
              <path d={sparkle(27, 23.6, 1.7)} />
              <path d={sparkle(32, 29, 1.1)} />
              <path d={sparkle(73, 23.6, 1.7)} />
              <path d={sparkle(68, 29, 1.1)} />
            </g>
          )}
        </>
      )
    case 'locs':
    case 'frost_locs':
      return (
        <>
          {[[38, 25, 22.5, 74], [36, 27, 26, 80], [34.5, 30, 30, 76], [33.5, 33, 33.5, 82]].map(([sx, sy, ex, ey], i) => (
            <HangingBraid key={`l${i}`} sx={sx} sy={sy} ex={ex} ey={ey} bow={-4.6} h={h} bead={kind === 'frost_locs' ? '#eaf6ff' : h} w={4.6} />
          ))}
          {[[62, 25, 77.5, 74], [64, 27, 74, 80], [65.5, 30, 70, 76], [66.5, 33, 66.5, 82]].map(([sx, sy, ex, ey], i) => (
            <HangingBraid key={`r${i}`} sx={sx} sy={sy} ex={ex} ey={ey} bow={4.6} h={h} bead={kind === 'frost_locs' ? '#eaf6ff' : h} w={4.6} />
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
    case 'holly_bun':
      return (
        <>
          <P d="M31.6 41.5C30.5 27 39 20 50 20S69.5 27 68.4 41.5C66.4 35.4 62.5 32 58 31.2 53.5 32.2 46.5 32.2 42 31.2 37.4 32 33.6 35.4 31.6 41.5Z" fill={h} />
          <L d="M39 27c3-2.4 6.4-4.6 9-8.4M61 27c-3-2.4-6.4-4.6-9-8.4M36 33c2.4-1.6 5-3.2 7-5.4M64 33c-2.4-1.6-5-3.2-7-5.4" c={hs} w=".8" o={0.8} />
          <L d="M37 26c4-3.6 9-5.2 14-4.6" c={hl} w="1.8" o={0.38} />
          <P d="M40.6 12.4C40 6.6 44.6 3.6 50 3.6S60 6.6 59.4 12.4C59 17.4 55 20.6 50 20.6S41 17.4 40.6 12.4Z" fill={h} />
          <L d="M43.4 8.4c3.4-2.2 7.8-2.2 11.2 0M42.6 12.6c4.6-2.8 10.2-2.8 14.8 0M44 16.2c3.6-1.8 8.4-1.8 12 0" c={hl} w=".8" o={0.55} />
          {kind === 'holly_bun' ? (
            <>
              <path d="M41 21.2C45.6 24 54.4 24 59 21.2" fill="none" stroke="#14502e" strokeWidth="2.2" strokeLinecap="round" />
              {[[42.4, 21.4, 200], [46.4, 23, 170], [53.6, 23, 10], [57.6, 21.4, -20]].map(([x, y, a], i) => (
                <g key={i} transform={`translate(${x} ${y}) rotate(${a})`}>
                  <path d="M-4.4 0C-2.4-2.6 2.4-2.8 4.6 0C2.4 2.8 -2.4 2.6-4.4 0Z" fill={i % 2 ? '#1f8a4c' : '#2aa05a'} stroke="#0f4a28" strokeWidth=".6" strokeLinejoin="round" />
                </g>
              ))}
              {[[48.6, 20.6], [51.4, 20.6], [50, 22.4]].map(([x, y]) => (
                <circle key={`${x}-${y}`} cx={x} cy={y} r="1.5" fill="#d03a2e" stroke="#7a1c14" strokeWidth=".5" />
              ))}
            </>
          ) : (
            <path d="M42 19.4C46 22 54 22 58 19.4L57.6 22.6C54 24.4 46 24.4 42.4 22.6Z" fill="#e0b04a" stroke={INK} strokeWidth=".9" strokeLinejoin="round" />
          )}
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
          <L d="M49.4 20.6C43.6 21.6 38.4 25.6 35.2 33.6M50.6 20.6C56.4 21.6 61.6 25.6 64.8 33.6" c={hl} w=".7" o={0.55} />
          <L d="M47 21C41.4 23 37.2 27.6 34.4 36.4M53 21C58.6 23 62.8 27.6 65.6 36.4M44 22.6C39.4 25.4 36 30 33.6 38" c={shade(h, -45)} w=".6" o={0.6} />
          {curtains('long', h)}
        </>
      )
    case 'malibu_wave':
      return (
        <>
          <P d="M30.6 43C29 26 39 19 50 19S71 26 69.4 43C67 35 61 30.4 55 28.6 50 31 41 31.6 33.4 36.4Z" fill={h} />
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
    case 'snow_afro':
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
          {kind === 'snow_afro' && (
            <g fill="#bfe4fb" stroke="#4a86b3" strokeWidth=".45">
              <path d={sparkle(40, 25, 1.25)} />
              <path d={sparkle(62, 23, 1.05)} />
              <path d={sparkle(51, 29.6, 0.7)} />
              <path d={sparkle(30, 34, 0.8)} />
              <path d={sparkle(71, 33, 0.8)} />
              <path d={sparkle(50, 14, 0.9)} />
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
    case 'xmas_braids':
    case 'fiber_braids':
      return (
        <>
          <P d="M31 42C29.5 26 39 19 50 19S70.5 26 69 42C67 34.6 63 31.4 58 30.6 53.5 31.6 46.5 31.6 42 30.6 37 31.4 33 34.6 31 42Z" fill={h} />
          {/* raies : une centrale + des séparations courbes qui dessinent les rangées de tresses */}
          <L d="M50 19.4V30.8" c={hl} w=".9" o={0.85} />
          <L d="M43 20.4C40.8 24 40 27.4 40.6 31M36.5 23C34.6 26.2 33.8 29.4 34 33M57 20.4C59.2 24 60 27.4 59.4 31M63.5 23C65.4 26.2 66.2 29.4 66 33" c={hl} w=".8" o={0.7} />
          <L d="M38 24.4c4-3.6 9-5 14-4.6" c={hl} w="1.7" o={0.38} />
          {[[40.5, 31.6], [34, 33.6], [59.5, 31.6], [66, 33.6]].map(([x, y], i) => (
            <circle key={x} cx={x} cy={y} r="1.5" fill={kind === 'xmas_braids' ? ['#d4553a', '#2f8a4f', '#2f8a4f', '#d4553a'][i] : kind === 'fiber_braids' ? ['#4ae3ff', '#ff5fd0', '#ffe14a', '#4ae3ff'][i] : '#e0b04a'} stroke={INK} strokeWidth=".6" />
          ))}
          {kind === 'fiber_braids' && (
            <g fill="none" strokeLinecap="round" opacity=".9">
              <path d="M40 22.6C42 26 42.6 29 41.6 31.4" stroke="#4ae3ff" strokeWidth=".7" />
              <path d="M46.4 21C47.4 25 47.6 28.6 46.8 31.4" stroke="#ff5fd0" strokeWidth=".7" />
              <path d="M53.6 21C52.6 25 52.4 28.6 53.2 31.4" stroke="#ffe14a" strokeWidth=".7" />
              <path d="M60 22.6C58 26 57.4 29 58.4 31.4" stroke="#4ae3ff" strokeWidth=".7" />
            </g>
          )}
          {kind === 'xmas_braids' && (
            <>
              <path d="M32.6 30.6C38 33.8 44 34.2 50 32.4C56 34.2 62 33.8 67.4 30.6" fill="none" stroke="#2f8a4f" strokeWidth="1.1" strokeLinecap="round" opacity=".9" />
              {[[38.4, 33.6, '#d4553a'], [44.4, 34.4, '#e0b04a'], [55.6, 34.4, '#e0b04a'], [61.6, 33.6, '#d4553a']].map(([x, y, c]) => (
                <circle key={`g${x}`} cx={x as number} cy={y as number} r="1.15" fill={c as string} stroke={INK} strokeWidth=".4" />
              ))}
            </>
          )}
        </>
      )
    case 'puffs':
    case 'star_puffs':
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
    case 'frost_locs':
      return (
        <>
          <P d="M31 42C29.5 26 39 19.5 50 19.5S70.5 26 69 42C67 34.6 63 31.6 58 31 53.5 32 46.5 32 42 31 37 31.6 33 34.6 31 42Z" fill={h} />
          {[36, 41, 46, 51, 56, 61, 66].map((x, i) => (
            <circle key={x} cx={x - 1.5 + (i % 2)} cy={25 + (i % 3) * 2.6} r="1.5" fill="none" stroke={hl} strokeWidth=".7" opacity=".6" />
          ))}
          {[[35, 31, 29.5, 70], [33.5, 34, 33, 74], [65, 31, 70.5, 70], [66.5, 34, 67, 74]].map(([sx, sy, ex, ey], i) => (
            <HangingBraid key={i} sx={sx} sy={sy} ex={ex} ey={ey} bow={sx < 50 ? -2.4 : 2.4} h={h} bead={kind === 'frost_locs' ? '#eaf6ff' : h} w={4.4} />
          ))}
          {kind === 'frost_locs' && (
            <g fill="#e6f5ff" stroke="#4a86b3" strokeWidth=".4">
              <path d={sparkle(38, 24, 1.1)} />
              <path d={sparkle(60, 22.6, 0.95)} />
              <path d={sparkle(50, 27.6, 0.7)} />
            </g>
          )}
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
          <P d="M31.8 40C28.6 25 32.6 11 46 7.6C59 4.8 71.6 11.6 68.2 40C66.4 34.6 62.4 31.4 57 30.4C49 28.4 41 29.6 36 32.6C34 34.2 32.8 36.6 31.8 40Z" fill={h} w={1.1} />
          <P d="M35.6 30C35 20 41.6 12.4 51 12C60.6 11.6 67 17.6 67.4 27C63 21.4 56 19.4 49 21.4C43 23 38.6 26.4 35.6 30Z" fill={shade(h, 14)} w={0.9} />
          <L d="M36 30C37 23 41 17 47 14M42 28C42.6 22 46 17 51 15.6M48 27C49 22 52 18 57 17M55 28C56 23 59 20 63 20.6M62 30C63.4 26 64.6 23 66.6 22.6" c={hs} w=".6" o={0.6} />
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
    case 'led_sweater':
      return (
        <>
          <P d={SHOULDERS} fill="#1b2542" />
          <g clipPath={`url(#${uid}osc)`}>
            {/* fils lumineux en zigzag : cyan, magenta, jaune, avec un halo */}
            {[['#4ae3ff', 84], ['#ff5fd0', 90], ['#ffe14a', 96]].map(([c, y]) => {
              const d = `M0 ${y}` + Array.from({ length: 12 }, (_, i) => `L${(i + 1) * 8.4} ${Number(y) + (i % 2 ? 0 : -3.4)}`).join('')
              return (
                <g key={c as string} fill="none" strokeLinecap="round" strokeLinejoin="round">
                  <path d={d} stroke={c as string} strokeWidth="3.2" opacity=".22" />
                  <path d={d} stroke={c as string} strokeWidth="1.2" />
                  <path d={d} stroke="#fff" strokeWidth=".4" opacity=".8" />
                </g>
              )
            })}
            <path d="M16 80c4-3 8-4 12-3.6M84 80c-4-3-8-4-12-3.6" fill="none" stroke="#3a4a78" strokeWidth=".9" strokeLinecap="round" />
          </g>
          <path d="M36.6 73.6C39.6 84 60.4 84 63.4 73.6" fill="none" stroke={INK} strokeWidth="6" strokeLinecap="round" />
          <path d="M36.6 73.6C39.6 84 60.4 84 63.4 73.6" fill="none" stroke="#2b3a66" strokeWidth="4.2" strokeLinecap="round" />
          <path d="M39 75.4C41.6 82 58.4 82 61 75.4" fill="none" stroke="#3c4d80" strokeWidth=".7" strokeDasharray="1 1.2" />
          {sh}
        </>
      )
    case 'puffer_jacket':
      return (
        <>
          <P d={SHOULDERS} fill="#1f6b52" />
          <g clipPath={`url(#${uid}osc)`}>
            {[80, 86.4, 92.8, 99].map((y) => (
              <path key={y} d={`M0 ${y}C20 ${y - 2.2} 34 ${y - 2.2} 50 ${y}S80 ${y - 2.2} 100 ${y}`} fill="none" stroke="#0f4a37" strokeWidth="1.3" />
            ))}
            {[80, 86.4, 92.8].map((y) => (
              <path key={`h${y}`} d={`M6 ${y + 1.2}C22 ${y - 1} 34 ${y - 1} 46 ${y + 1.2}`} fill="none" stroke="#4aa584" strokeWidth=".8" opacity=".65" />
            ))}
            {/* fermeture et logo baobab (marque fictive BabTech) */}
            <path d="M50 83V102" stroke={INK} strokeWidth="1.6" />
            <path d="M50 83V102" stroke="#e0a83c" strokeWidth=".7" strokeDasharray="1.2 1" />
            <g transform="translate(29 91)">
              <circle r="4.4" fill="#123229" stroke="#e0a83c" strokeWidth=".7" />
              <path d="M-1.2 3V-0.6L1.2 -0.6V3Z" fill="#e0a83c" />
              <path d="M0 -0.4L-2.6 -2.8M0 -0.4L0 -3.6M0 -0.4L2.6 -2.8" stroke="#e0a83c" strokeWidth=".6" strokeLinecap="round" />
              <circle cx="-2.8" cy="-3.2" r=".9" fill="#52c29a" />
              <circle cx="0" cy="-4" r=".9" fill="#52c29a" />
              <circle cx="2.8" cy="-3.2" r=".9" fill="#52c29a" />
            </g>
          </g>
          {/* col montant matelassé */}
          <path d="M35.4 72.4C36.4 82 63.6 82 64.6 72.4L64.6 76.4C62 86.4 38 86.4 35.4 76.4Z" fill="#1f6b52" stroke={INK} strokeWidth="1.3" strokeLinejoin="round" />
          <path d="M37 76.4C41 83 59 83 63 76.4" fill="none" stroke="#0f4a37" strokeWidth="1" />
          {sh}
        </>
      )
    case 'gala_suit':
      return (
        <>
          <P d={SHOULDERS} fill="#15151d" />
          <g clipPath={`url(#${uid}osc)`}>
            <path d="M40 74L50 100L60 74L56 74L50 88L44 74Z" fill="#f6f1e8" />
            <path d="M36 73.6L50 102L40 100Z" fill="#26263a" stroke={INK} strokeWidth=".8" />
            <path d="M64 73.6L50 102L60 100Z" fill="#26263a" stroke={INK} strokeWidth=".8" />
            {[[16, 90], [24, 96], [31, 86], [70, 88], [78, 95], [86, 90], [22, 84], [80, 84]].map(([x, y]) => (
              <path key={`${x}-${y}`} d={sparkle(x, y, 0.9)} fill="#ffe9a8" stroke="#a8741c" strokeWidth=".25" />
            ))}
          </g>
          {/* nœud papillon */}
          <path d="M50 80C45 76.4 41.4 77.6 41.4 80.6C41.4 83.6 45 84.6 50 80.6Z" fill="#b3302a" stroke={INK} strokeWidth=".9" strokeLinejoin="round" />
          <path d="M50 80C55 76.4 58.6 77.6 58.6 80.6C58.6 83.6 55 84.6 50 80.6Z" fill="#b3302a" stroke={INK} strokeWidth=".9" strokeLinejoin="round" />
          <circle cx="50" cy="80.6" r="1.6" fill="#8f1f1b" stroke={INK} strokeWidth=".6" />
          {sh}
        </>
      )
    case 'festive_boubou':
      return (
        <>
          <P d={SHOULDERS} fill="#b3302a" />
          <path d="M5 100C5 94 6 90 8 86M95 100C95 94 94 90 92 86" stroke="#7a1f19" strokeWidth="1" fill="none" />
          <path d="M22 100C20 92 20 84 24 78M78 100C80 92 80 84 76 78" stroke="#d9685f" strokeWidth="1" fill="none" opacity=".7" />
          <path d="M34 73.6C37 84 63 84 66 73.6" fill="none" stroke={INK} strokeWidth="5.2" strokeLinecap="round" />
          <path d="M34 73.6C37 84 63 84 66 73.6" fill="none" stroke="#e8b84a" strokeWidth="3.6" strokeLinecap="round" />
          {[38, 43, 50, 57, 62].map((x, i) => (
            <circle key={x} cx={x} cy={[79.6, 82, 83, 82, 79.6][i]} r="1.5" fill="#f6f1e8" stroke={INK} strokeWidth=".5" />
          ))}
          <path d="M50 84.4V100" stroke={INK} strokeWidth="4.8" />
          <path d="M50 84.4V100" stroke="#e8b84a" strokeWidth="3.2" />
          {[88, 93, 98].map((y) => (
            <path key={y} d={`M45 ${y}l5-2.4 5 2.4-5 2.4z`} fill="#f6f1e8" stroke={INK} strokeWidth=".6" />
          ))}
          {[26, 74].map((x) => (
            <g key={x}>
              <path d={`M${x - 7} 90h14M${x - 6} 94h12M${x - 5} 98h10`} stroke="#e8b84a" strokeWidth="1.5" strokeLinecap="round" />
              <path d={`M${x} 85l1.8 2.4-1.8 2.4-1.8-2.4z`} fill="#e8b84a" stroke={INK} strokeWidth=".5" />
            </g>
          ))}
          {sh}
        </>
      )
    case 'snow_gown':
      return (
        <>
          <P d={SHOULDERS} fill={skin} />
          <L d="M36 73.6C41 77 59 77 64 73.6" c={dark} w="1" o={0.8} />
          <path d="M6 100V90.6C14 86.4 27 86 36.6 90.4C41.4 83.6 46.6 83.6 50 89.6C53.4 83.6 58.6 83.6 63.4 90.4C73 86 86 86.4 94 90.6V100Z" fill="#e8f2fb" stroke={INK} strokeWidth="1.5" strokeLinejoin="round" />
          <L d="M11 94.6C20 91.4 29 92 36 95M89 94.6C80 91.4 71 92 64 95M42 90C44.6 87.6 47 87.4 49 89.4M58 90C55.4 87.6 53 87.4 51 89.4" c="#9ccbe8" w="1.2" o={0.9} />
          <L d="M14 99c6-3 14-3.6 22-1.6M86 99c-6-3-14-3.6-22-1.6" c="#7fb3d8" w="1" o={0.7} />
          <g fill="#bfe4fb" stroke="#4a86b3" strokeWidth=".35">
            <path d={sparkle(20, 95.6, 1.2)} />
            <path d={sparkle(31, 97.6, 0.8)} />
            <path d={sparkle(70, 96.4, 1)} />
            <path d={sparkle(82, 98, 1.2)} />
            <path d={sparkle(56, 95, 0.7)} />
          </g>
          {[[38.4, 74.4], [41, 77.6], [44.6, 79.4], [50, 80], [55.4, 79.4], [59, 77.6], [61.6, 74.4]].map(([x, y]) => (
            <circle key={`${x}`} cx={x} cy={y} r="1.5" fill="#fff" stroke={INK} strokeWidth=".5" />
          ))}
          <path d="M50 88.6l2.2 2.4-2.2 3.2-2.2-3.2z" fill="#cfe9fb" stroke={INK} strokeWidth=".7" strokeLinejoin="round" />
          {sh}
        </>
      )
    case 'santa_jacket':
      return (
        <>
          <P d={SHOULDERS} fill="#c32d28" />
          <g clipPath={`url(#${uid}osc)`}>
            <rect x="44.6" y="80" width="10.8" height="22" fill="#f6f1e8" stroke={INK} strokeWidth=".9" />
            <path d="M46 84h8M46 89h8M46 94h8" stroke="#d6cdb9" strokeWidth=".7" strokeDasharray="1.4 1.2" />
            <rect x="0" y="93" width="100" height="5.4" fill="#1c1612" />
            <rect x="45.4" y="91.8" width="9.2" height="7.8" rx="1" fill="#f0c75a" stroke={INK} strokeWidth=".8" />
            <rect x="47.8" y="94" width="4.4" height="3.4" fill="#1c1612" />
            <path d="M14 84c4-3 8-4 12-3.6M86 84c-4-3-8-4-12-3.6" fill="none" stroke="#e0736b" strokeWidth=".9" strokeLinecap="round" opacity=".7" />
          </g>
          {Array.from({ length: 9 }, (_, i) => {
            const t = i / 8
            return { x: 34.4 + 31.2 * t, y: 73.4 + 8.4 * (1 - (2 * t - 1) ** 2) }
          }).map((f, i) => (
            <circle key={`o${i}`} cx={f.x} cy={f.y} r="4" fill={INK} />
          ))}
          {Array.from({ length: 9 }, (_, i) => {
            const t = i / 8
            return { x: 34.4 + 31.2 * t, y: 73.4 + 8.4 * (1 - (2 * t - 1) ** 2) }
          }).map((f, i) => (
            <circle key={`w${i}`} cx={f.x} cy={f.y} r="3.2" fill="#f6f1e8" />
          ))}
          {[[50, 85.4], [50, 89.4]].map(([x, y]) => (
            <circle key={y} cx={x} cy={y} r="1.3" fill="#f0c75a" stroke={INK} strokeWidth=".5" />
          ))}
          {sh}
        </>
      )
    case 'elf_outfit':
      return (
        <>
          <P d={SHOULDERS} fill="#2c8a4e" />
          <g clipPath={`url(#${uid}osc)`}>
            <path d="M0 87l5 4 5-4 5 4 5-4 5 4 5-4 5 4 5-4 5 4 5-4 5 4 5-4 5 4 5-4 5 4 5-4 5 4 5-4 5 4 5-4 5 4 5-4V93H0Z" fill="#f6f1e8" opacity=".9" />
            <rect x="0" y="93" width="100" height="5.4" fill="#c92f2a" />
            <rect x="45.4" y="91.8" width="9.2" height="7.8" rx="1" fill="#f0c75a" stroke={INK} strokeWidth=".8" />
            <rect x="47.8" y="94" width="4.4" height="3.4" fill="#c92f2a" />
          </g>
          {Array.from({ length: 7 }, (_, i) => {
            const t = i / 6
            return { x: 35 + 30 * t, y: 74 + 7.2 * (1 - (2 * t - 1) ** 2) }
          }).map((f, i) => (
            <g key={i}>
              <path d={`M${f.x - 3.2} ${f.y - 1.4}L${f.x} ${f.y + 5.4}L${f.x + 3.2} ${f.y - 1.4}Z`} fill="#c92f2a" stroke={INK} strokeWidth=".9" strokeLinejoin="round" />
              <circle cx={f.x} cy={f.y + 6.2} r="1.5" fill="#f0c75a" stroke={INK} strokeWidth=".6" />
            </g>
          ))}
          <path d="M36.6 73.4C39.6 80.4 60.4 80.4 63.4 73.4" fill="none" stroke={INK} strokeWidth="3.6" strokeLinecap="round" />
          <path d="M36.6 73.4C39.6 80.4 60.4 80.4 63.4 73.4" fill="none" stroke="#c92f2a" strokeWidth="2.2" strokeLinecap="round" />
          {sh}
        </>
      )
    case 'white_boubou':
      return (
        <>
          <P d={SHOULDERS} fill="#f4efe4" />
          <path d="M5 100C5 94 6 90 8 86M95 100C95 94 94 90 92 86" stroke="#cfc6b2" strokeWidth="1" fill="none" />
          <path d="M22 100C20 92 20 84 24 78M78 100C80 92 80 84 76 78" stroke="#d9d0bd" strokeWidth="1" fill="none" opacity=".8" />
          <path d="M34 73.6C37 84 63 84 66 73.6" fill="none" stroke={INK} strokeWidth="5.2" strokeLinecap="round" />
          <path d="M34 73.6C37 84 63 84 66 73.6" fill="none" stroke="#e0a83c" strokeWidth="3.6" strokeLinecap="round" />
          {[38, 43, 50, 57, 62].map((x, i) => (
            <circle key={x} cx={x} cy={[79.6, 82, 83, 82, 79.6][i]} r="1.5" fill="#c2432a" stroke={INK} strokeWidth=".5" />
          ))}
          <path d="M50 84.4V100" stroke={INK} strokeWidth="4.8" />
          <path d="M50 84.4V100" stroke="#e0a83c" strokeWidth="3.2" />
          {[88, 93, 98].map((y) => (
            <path key={y} d={`M45 ${y}l5-2.4 5 2.4-5 2.4z`} fill="#c2432a" stroke={INK} strokeWidth=".6" />
          ))}
          {[26, 74].map((x) => (
            <g key={x}>
              <path d={`M${x - 7} 90h14M${x - 6} 94h12M${x - 5} 98h10`} stroke="#e0a83c" strokeWidth="1.5" strokeLinecap="round" />
              <path d={`M${x} 86l1.6 2.2-1.6 2.2-1.6-2.2z`} fill="#e0a83c" stroke={INK} strokeWidth=".5" />
            </g>
          ))}
          {sh}
        </>
      )
    case 'xmas_sweater':
      return (
        <>
          <P d={SHOULDERS} fill="#b3302a" />
          <g clipPath={`url(#${uid}osc)`}>
            {/* bande nordique : crème, avec une frise de sapins verts */}
            <rect x="0" y="85" width="100" height="8" fill="#f4efe4" />
            {Array.from({ length: 12 }, (_, i) => (
              <path key={i} d={`M${3 + i * 8.4} 93L${7.2 + i * 8.4} 85L${11.4 + i * 8.4} 93Z`} fill="#23724a" />
            ))}
            <rect x="0" y="84" width="100" height="1.2" fill="#d9d0bd" />
            <rect x="0" y="93" width="100" height="1.2" fill="#d9d0bd" />
            {/* flocons sur la poitrine */}
            {[[18, 98], [34, 97], [50, 98.4], [66, 97], [82, 98]].map(([x, y]) => (
              <circle key={x} cx={x} cy={y} r="1.2" fill="#f4efe4" />
            ))}
            <path d="M14 82c4-3 8-4 12-3.6M86 82c-4-3-8-4-12-3.6" fill="none" stroke="#d9695f" strokeWidth=".9" strokeLinecap="round" opacity=".7" />
          </g>
          {/* col roulé côtelé */}
          <path d="M36.6 73.6C39.6 84 60.4 84 63.4 73.6" fill="none" stroke={INK} strokeWidth="6.2" strokeLinecap="round" />
          <path d="M36.6 73.6C39.6 84 60.4 84 63.4 73.6" fill="none" stroke="#f4efe4" strokeWidth="4.4" strokeLinecap="round" />
          <path d="M39 75.4C41.6 82 58.4 82 61 75.4" fill="none" stroke="#cfc6b2" strokeWidth=".7" strokeDasharray="1 1.2" />
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
          {[27.6, 72.4].map((x) => (
            <g key={x}>
              <ellipse cx={x} cy={ey + 8.4} rx="2.7" ry="3.5" fill="none" stroke={INK} strokeWidth="2" />
              <ellipse cx={x} cy={ey + 8.4} rx="2.7" ry="3.5" fill="none" stroke="#f0c75a" strokeWidth="1.1" />
              <path d={`M${x - 1.5} ${ey + 6.6}c.4-.7 1.1-1 1.7-.8`} stroke="#fff" strokeWidth=".5" fill="none" strokeLinecap="round" />
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
          {[27.8, 72.2].map((x) => (
            <g key={x}>
              <circle cx={x} cy={ey + 7.4} r="1.5" fill="none" stroke={INK} strokeWidth="1.5" />
              <circle cx={x} cy={ey + 7.4} r="1.5" fill="none" stroke="#f0c75a" strokeWidth=".75" />
              <circle cx={x} cy={ey + 5.5} r=".7" fill="#fff4cf" stroke={INK} strokeWidth=".35" />
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
            ['M35.6 49.6l6.4 1.4', '#f3ece0'],
            ['M35.2 52.6l7 1.9', '#f3ece0'],
            ['M35.8 55.6l5.8 1.7', '#c2432a'],
            ['M64.4 49.6l-6.4 1.4', '#f3ece0'],
            ['M64.8 52.6l-7 1.9', '#f3ece0'],
            ['M64.2 55.6l-5.8 1.7', '#c2432a'],
          ].map(([d, c]) => (
            <g key={d}>
              <path d={d} fill="none" stroke={INK} strokeWidth="2.1" opacity=".8" />
              <path d={d} fill="none" stroke={c} strokeWidth="1.2" />
            </g>
          ))}
          <path d="M50 30.6v3.8" stroke={INK} strokeWidth="2.2" opacity=".8" />
          <path d="M50 30.6v3.8" stroke="#f3ece0" strokeWidth="1.3" />
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
    case 'griot_buds':
      return (
        <g>
          {([-1, 1] as const).map((sd) => {
            const x = 50 + sd * 19.8
            return (
              <g key={sd}>
                <path d={`M${x} ${ey + 2.2}V${ey + 8.4}`} stroke={INK} strokeWidth="2.6" strokeLinecap="round" />
                <path d={`M${x} ${ey + 2.2}V${ey + 8.4}`} stroke="#f6f1e8" strokeWidth="1.5" strokeLinecap="round" />
                <circle cx={x} cy={ey + 2} r="2.3" fill="#f6f1e8" stroke={INK} strokeWidth=".9" />
                <circle cx={x} cy={ey + 2} r="1.05" fill="#d4553a" />
                <circle cx={x - 0.7} cy={ey + 1.2} r=".5" fill="#fff" opacity=".9" />
              </g>
            )
          })}
        </g>
      )
    case 'smart_glasses':
      return (
        <g>
          <rect x="34.4" y={ey - 3.8} width="14" height="8.4" rx="3" fill="#4ae3ff" fillOpacity=".2" stroke={INK} strokeWidth="1.8" />
          <rect x="51.6" y={ey - 3.8} width="14" height="8.4" rx="3" fill="#4ae3ff" fillOpacity=".2" stroke={INK} strokeWidth="1.8" />
          <path d={`M48.4 ${ey - 0.6}c.8-.8 2.4-.8 3.2 0M34.4 ${ey - 1.6}l-3 -1M65.6 ${ey - 1.6}l3 -1`} fill="none" stroke={INK} strokeWidth="1.5" strokeLinecap="round" />
          <path d={`M36.6 ${ey - 1.4}c1.6-1 3.6-1.2 5.4-.6M53.8 ${ey - 1.4}c1.6-1 3.6-1.2 5.4-.6`} fill="none" stroke="#fff" strokeWidth="1" strokeLinecap="round" opacity=".7" />
          <circle cx="66.4" cy={ey - 2.4} r="1" fill="#4ae3ff" />
          <circle cx="66.4" cy={ey - 2.4} r="2.2" fill="#4ae3ff" opacity=".28" />
          <path d={`M55.6 ${ey + 1.6}h4M55.6 ${ey + 2.8}h2.6`} stroke="#4ae3ff" strokeWidth=".5" strokeLinecap="round" opacity=".9" />
        </g>
      )
    case 'light_garland':
      return (
        <g>
          <path d="M33.6 72.8C38 84.6 62 84.6 66.4 72.8" fill="none" stroke={INK} strokeWidth="1.8" strokeLinecap="round" />
          <path d="M33.6 72.8C38 84.6 62 84.6 66.4 72.8" fill="none" stroke="#1f6b52" strokeWidth=".9" strokeLinecap="round" />
          {[[36.4, 78.4, '#ff5a4a'], [40.4, 81.6, '#ffe14a'], [45.4, 83.4, '#4ae3ff'], [50, 83.8, '#ff5fd0'], [54.6, 83.4, '#52e08a'], [59.6, 81.6, '#ff5a4a'], [63.6, 78.4, '#ffe14a']].map(([x, y, c]) => (
            <g key={`${x}`}>
              <circle cx={x as number} cy={(y as number) + 1.6} r="3.4" fill={c as string} opacity=".25" />
              <path d={`M${x} ${y}v1.4`} stroke={INK} strokeWidth="1" />
              <ellipse cx={x as number} cy={(y as number) + 3} rx="1.5" ry="2" fill={c as string} stroke={INK} strokeWidth=".6" />
              <circle cx={(x as number) - 0.5} cy={(y as number) + 2.2} r=".5" fill="#fff" opacity=".9" />
            </g>
          ))}
        </g>
      )
    case 'party_mask': {
      const body = `M31.6 ${ey - 1}C34 ${ey - 5.4} 44 ${ey - 5.8} 50 ${ey - 2.6}C56 ${ey - 5.8} 66 ${ey - 5.4} 68.4 ${ey - 1}C67.4 ${ey + 3.6} 62 ${ey + 5.6} 56.6 ${ey + 4.6}C53.4 ${ey + 4.2} 51.6 ${ey + 2.2} 50 ${ey + 2.2}C48.4 ${ey + 2.2} 46.6 ${ey + 4.2} 43.4 ${ey + 4.6}C38 ${ey + 5.6} 32.6 ${ey + 3.6} 31.6 ${ey - 1}Z`
      const hole = (cx: number) => `M${cx - 6} ${ey}C${cx - 4} ${ey - 3.6} ${cx + 4} ${ey - 3.6} ${cx + 6} ${ey}C${cx + 4} ${ey + 3} ${cx - 4} ${ey + 3} ${cx - 6} ${ey}Z`
      return (
        <g>
          <path d={`${body}${hole(41.6)}${hole(58.4)}`} fillRule="evenodd" fill="#4b2a7a" stroke="#e8b84a" strokeWidth="1.1" strokeLinejoin="round" />
          <path d={`M33 ${ey - 2.6}C38 ${ey - 5.2} 43 ${ey - 5} 47 ${ey - 3.4}M53 ${ey - 3.4}C57 ${ey - 5} 62 ${ey - 5.2} 67 ${ey - 2.6}`} fill="none" stroke="#9a6ad6" strokeWidth="1" strokeLinecap="round" opacity=".7" />
          {[[35.6, ey + 2.4], [64.4, ey + 2.4], [50, ey - 0.8]].map(([x, y]) => (
            <path key={`${x}`} d={sparkle(x, y, 1.1)} fill="#ffe9a8" stroke="#a8741c" strokeWidth=".3" />
          ))}
          <path d={`M31.6 ${ey - 0.6}l-2.4 -1.2M68.4 ${ey - 0.6}l2.4 -1.2`} stroke="#e8b84a" strokeWidth="1.2" strokeLinecap="round" />
        </g>
      )
    }
    case 'gold_baubles':
      return (
        <g>
          {[27.4, 72.6].map((x) => (
            <g key={x}>
              <path d={`M${x} ${ey + 5} V${ey + 7.4}`} stroke={INK} strokeWidth="1.4" strokeLinecap="round" />
              <path d={`M${x} ${ey + 5} V${ey + 7.4}`} stroke="#f0c75a" strokeWidth=".6" strokeLinecap="round" />
              <rect x={x - 1.4} y={ey + 6.8} width="2.8" height="1.6" rx=".5" fill="#c2432a" stroke={INK} strokeWidth=".5" />
              <circle cx={x} cy={ey + 10.6} r="2.9" fill="#f0c75a" stroke={INK} strokeWidth=".8" />
              <path d={`M${x - 2} ${ey + 10.8}c.6 1.4 2.4 2 3.8 1.2`} fill="none" stroke="#c2891c" strokeWidth=".6" />
              <circle cx={x - 1} cy={ey + 9.6} r=".9" fill="#fff6d0" opacity=".9" />
            </g>
          ))}
        </g>
      )
    case 'knit_scarf':
      return (
        <g>
          {/* queue qui retombe sur la poitrine */}
          <path d="M37 80L47.6 83.4L45.4 99L33.4 96Z" fill="#c92f2a" stroke={INK} strokeWidth="1.3" strokeLinejoin="round" />
          <path d="M36.2 86.4L46.8 89.4M35 92.4L45.8 95.4" stroke="#f6f1e8" strokeWidth="2" opacity=".95" />
          <path d="M34 96.4v3.4M36.4 97v3.4M38.8 97.6v3.4M41.2 98.2v3.4M43.6 98.6v3.2" stroke="#c92f2a" strokeWidth="1.1" strokeLinecap="round" />
          {/* tour de cou */}
          <path d="M31.6 72.6C37 84.2 63 84.2 68.4 72.6L69 78.4C62 90 38 90 31 78.4Z" fill="#c92f2a" stroke={INK} strokeWidth="1.4" strokeLinejoin="round" />
          <path d="M33.4 77.4C40 86.4 60 86.4 66.6 77.4" fill="none" stroke="#f6f1e8" strokeWidth="1.8" opacity=".95" />
          <path d="M34.6 81.4C41 89 59 89 65.4 81.4" fill="none" stroke="#2f8a4f" strokeWidth="1.2" opacity=".95" />
          <path d="M34 74c-.4 2 0 3 .8 4.2M39 79c0 1.6.6 2.6 1.6 3.4M45 81.8c0 1.4.4 2.2 1.2 2.8M51 82.4c0 1.4.4 2.2 1.2 2.8M57 81.6c.6 1.2 1.2 2 2 2.4M62 78.6c.8 1 1.4 1.6 2 1.8" fill="none" stroke="#8f1f1b" strokeWidth=".7" strokeLinecap="round" opacity=".6" />
        </g>
      )
    default:
      return null
  }
}


/** Couvre-chefs. Dessinés après les cheveux ; ceux qui couvrent la tête
 * (casquette, chapeau) vont avec `cover` côté cheveux. */
/** Coiffures volumineuses : le couvre-chef se pose PAR-DESSUS le volume (plus haut, un peu plus large) au lieu de l'écraser. */
const VOLUME_HAIRS: AvatarConfig['hair'][] = ['afro', 'afro_pink', 'snow_afro', 'curly', 'puffs', 'knots', 'bun', 'topknot', 'ponytail_pop', 'pompadour_ken', 'star_puffs', 'holly_bun']

/** Pose d'un couvre-chef selon la coiffure : plus haut et un peu plus large sur un volume (afro, macarons, chignon...). */
function Posed({ hair, children, rise = -2.4 }: { hair: AvatarConfig['hair']; children: ReactNode; rise?: number }) {
  const volume = VOLUME_HAIRS.includes(hair)
  const lift = volume ? rise : 0
  const grow = volume ? 1.06 : 1
  return <g transform={`translate(${50 - 50 * grow} ${lift + 34 - 34 * grow}) scale(${grow})`}>{children}</g>
}

function headwearArt(kind: AvatarConfig['head'], uid: string, hair: AvatarConfig['hair'] = 'none'): ReactNode {
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
        <g transform="translate(4 -4) scale(.92 1)">
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
    case 'santa_hat': {
      // Pose : le bonnet épouse le front (bandeau de fourrure qui suit la courbure de la tête, ombre portée sur le front), le
      // cône retombe sur le côté, le pompon est un petit amas de fourrure. Sur une coiffure volumineuse, il se pose plus haut.
      const furY = (t: number) => 34.6 - 1.9 * (1 - (2 * t - 1) ** 2)
      const fur = Array.from({ length: 11 }, (_, i) => {
        const t = i / 10
        return { x: 30.4 + 39.2 * t, y: furY(t), r: i % 2 ? 4.1 : 4.5 }
      })
      return (
        <Posed hair={hair}>
          {/* ombre du bandeau sur le front */}
          <ellipse cx="50" cy="38.6" rx="17.4" ry="2.4" fill="#000" opacity=".2" />
          {/* cône */}
          <P d="M33 32C31.4 17.6 42.4 7.2 56.6 7C69.8 6.8 79 13.8 82.2 25C83.2 28.6 83.4 32 83 35.4L62 36L36 35.6Z" fill="#c92f2a" />
          <path d="M60 9.6C72 11 80 18 82 28C82.6 31 82.8 33.4 82.6 35.2L71 35C71.6 25 68 15.6 60 9.6Z" fill="#8f1f1b" opacity=".4" />
          <path d="M37.6 29C37.4 19.6 44.6 11.8 54 9.8" fill="none" stroke="#f0746c" strokeWidth="2" strokeLinecap="round" opacity=".55" />
          <path d="M57.4 20.4C65.4 20.4 71.4 26 73.6 34" fill="none" stroke="#8f1f1b" strokeWidth="1" strokeLinecap="round" opacity=".5" />
          {/* pompon de fourrure */}
          {[[83.2, 38.6, 4.4], [80.4, 36.6, 3.3], [86, 36.8, 3.1], [83, 42, 3]].map(([x, y, r]) => (
            <circle key={`${x}-${y}`} cx={x} cy={y} r={r + 0.9} fill={INK} />
          ))}
          {[[83.2, 38.6, 4.4], [80.4, 36.6, 3.3], [86, 36.8, 3.1], [83, 42, 3]].map(([x, y, r]) => (
            <circle key={`w${x}-${y}`} cx={x} cy={y} r={r} fill="#f6f1e8" />
          ))}
          <path d="M80.4 36.8c1.4-1.6 3.4-1.8 4.8-.4M81.6 40.6c1.4.8 3.2.6 4.2-.6" fill="none" stroke="#cfc6b2" strokeWidth=".7" strokeLinecap="round" />
          <circle cx="81.4" cy="37.4" r="1.3" fill="#fff" opacity=".85" />
          {/* bandeau de fourrure : un chapelet de boules qui suit le front */}
          {fur.map((f, i) => (
            <circle key={`f${i}`} cx={f.x} cy={f.y} r={f.r + 0.9} fill={INK} />
          ))}
          {fur.map((f, i) => (
            <circle key={`g${i}`} cx={f.x} cy={f.y} r={f.r} fill="#f6f1e8" />
          ))}
          <path d={`M32 ${furY(0.04) + 1.6}Q50 ${furY(0.5) + 4.6} 68 ${furY(0.96) + 1.6}`} fill="none" stroke="#d6cdb9" strokeWidth="1.6" strokeLinecap="round" opacity=".7" />
          <path d={`M33 ${furY(0.06) - 2}Q50 ${furY(0.5) - 3.6} 67 ${furY(0.94) - 2}`} fill="none" stroke="#fff" strokeWidth="1.2" strokeLinecap="round" opacity=".7" />
        </Posed>
      )
    }
    case 'holly_crown': {
      // couronne de houx : feuilles pointues le long de l'arc du front, baies rouges au centre
      const pts = [0, 0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1].map((t) => {
        const u = 1 - t
        const x = u * u * 32.4 + 2 * u * t * 50 + t * t * 67.6
        const y = u * u * 36.4 + 2 * u * t * 22.6 + t * t * 36.4
        const dx = 2 * u * (50 - 32.4) + 2 * t * (67.6 - 50)
        const dy = 2 * u * (22.6 - 36.4) + 2 * t * (36.4 - 22.6)
        return { x, y, a: (Math.atan2(dy, dx) * 180) / Math.PI }
      })
      return (
        <Posed hair={hair}>
          <path d="M32.4 36.4Q50 22.6 67.6 36.4" fill="none" stroke="#14502e" strokeWidth="2.6" strokeLinecap="round" />
          {pts.map((p, i) => (
            <g key={i} transform={`translate(${p.x} ${p.y}) rotate(${p.a + (i % 2 ? 28 : -28)})`}>
              <path d="M-5.8 0C-3.2-3.6 3-3.8 6 0C3 3.8 -3.2 3.6-5.8 0Z" fill={i % 2 ? '#1f8a4c' : '#2aa05a'} stroke="#0f4a28" strokeWidth=".7" strokeLinejoin="round" />
              <path d="M-4.4 0H4.6" stroke="#0f4a28" strokeWidth=".5" opacity=".7" />
            </g>
          ))}
          {[[46.6, 27], [50.4, 25.4], [54, 27.4]].map(([x, y]) => (
            <g key={x}>
              <circle cx={x} cy={y} r="2.3" fill="#d03a2e" stroke="#7a1c14" strokeWidth=".6" />
              <circle cx={x - 0.7} cy={y - 0.7} r=".6" fill="#fff" opacity=".85" />
            </g>
          ))}
        </Posed>
      )
    }
    case 'antlers':
      return (
        <Posed hair={hair}>
          {/* serre-tête brun et deux bois ramifiés */}
          <path d="M32.6 36C36 28 43 25.6 50 25.6S64 28 67.4 36" fill="none" stroke={INK} strokeWidth="4.2" strokeLinecap="round" />
          <path d="M32.6 36C36 28 43 25.6 50 25.6S64 28 67.4 36" fill="none" stroke="#7a4e2a" strokeWidth="2.6" strokeLinecap="round" />
          {[-1, 1].map((sd) => {
            const X = (x: number) => (sd < 0 ? x : 100 - x)
            return (
              <g key={sd}>
                <path d={`M${X(38)} 29C${X(34)} 21 ${X(31)} 13 ${X(29)} 5M${X(34.6)} 20.4C${X(30.6)} 19.6 ${X(27)} 19.8 ${X(24)} 22M${X(31.6)} 12.6C${X(28)} 11.4 ${X(25.6)} 9.4 ${X(24.4)} 6.6`} fill="none" stroke={INK} strokeWidth="4" strokeLinecap="round" />
                <path d={`M${X(38)} 29C${X(34)} 21 ${X(31)} 13 ${X(29)} 5M${X(34.6)} 20.4C${X(30.6)} 19.6 ${X(27)} 19.8 ${X(24)} 22M${X(31.6)} 12.6C${X(28)} 11.4 ${X(25.6)} 9.4 ${X(24.4)} 6.6`} fill="none" stroke="#b98450" strokeWidth="2.4" strokeLinecap="round" />
                <path d={`M${X(36.6)} 25C${X(34.6)} 20 ${X(32.8)} 15 ${X(31.6)} 10`} fill="none" stroke="#e0b98a" strokeWidth=".7" strokeLinecap="round" opacity=".7" />
              </g>
            )
          })}
        </Posed>
      )
    case 'headphones':
      return (
        <Posed hair={hair} rise={-1.4}>
          {/* arceau passant par-dessus la tête, de chaque oreille à l'autre */}
          <path d="M27.6 41C26.6 20 38 11 50 11S73.4 20 72.4 41" fill="none" stroke={INK} strokeWidth="5.4" strokeLinecap="round" />
          <path d="M27.6 41C26.6 20 38 11 50 11S73.4 20 72.4 41" fill="none" stroke="#1d2a26" strokeWidth="3.6" strokeLinecap="round" />
          <path d="M29.6 33C30.4 21 38.6 13.4 48 12.6" fill="none" stroke="#52c29a" strokeWidth=".9" strokeLinecap="round" opacity=".8" />
          <path d="M40 12.4C46 10.6 54 10.6 60 12.4" fill="none" stroke="#3a4a44" strokeWidth="1.2" strokeLinecap="round" />
          {/* écouteurs : coques sur les oreilles, avec le logo baobab */}
          {[27.2, 72.8].map((x) => (
            <g key={x}>
              <rect x={x - 4.6} y="38.4" width="9.2" height="14.6" rx="4.4" fill="#1d2a26" stroke={INK} strokeWidth="1.2" />
              <rect x={x - 3} y="40.2" width="6" height="11" rx="3" fill="#2c8a6c" />
              <circle cx={x} cy="45.7" r="2.4" fill="#123229" stroke="#e0a83c" strokeWidth=".5" />
              <path d={`M${x} 47.2V45.2M${x} 45.4L${x - 1.1} 44.4M${x} 45.4L${x + 1.1} 44.4`} stroke="#e0a83c" strokeWidth=".5" strokeLinecap="round" />
              <path d={`M${x - 3} 41.6c.8-.8 2.6-.8 3.4 0`} fill="none" stroke="#9ee3c6" strokeWidth=".6" opacity=".8" />
            </g>
          ))}
        </Posed>
      )
    case 'led_headband': {
      const pts = [[35.6, 34.6, '#ff5a4a'], [40.4, 32.8, '#ffe14a'], [45.4, 31.8, '#52e08a'], [50, 31.4, '#4ae3ff'], [54.6, 31.8, '#ff5fd0'], [59.6, 32.8, '#ffe14a'], [64.4, 34.6, '#52e08a']]
      return (
        <Posed hair={hair}>
          <path d="M31.2 39.6C33.4 31.6 41.4 28.4 50 28.4S66.6 31.6 68.8 39.6" fill="none" stroke={INK} strokeWidth="4" strokeLinecap="round" />
          <path d="M31.2 39.6C33.4 31.6 41.4 28.4 50 28.4S66.6 31.6 68.8 39.6" fill="none" stroke="#232b3a" strokeWidth="2.6" strokeLinecap="round" />
          {pts.map(([x, y, c]) => (
            <g key={`${x}`}>
              <circle cx={x as number} cy={(y as number) - 1.4} r="3.8" fill={c as string} opacity=".28" />
              <circle cx={x as number} cy={(y as number) - 1.4} r="1.5" fill={c as string} stroke={INK} strokeWidth=".4" />
              <circle cx={(x as number) - 0.4} cy={(y as number) - 1.9} r=".45" fill="#fff" opacity=".95" />
            </g>
          ))}
        </Posed>
      )
    }
    case 'party_hat': {
      const stripes = [0.22, 0.42, 0.62, 0.8]
      return (
        <Posed hair={hair} rise={-1}>
          <g transform="rotate(11 50 34)">
            <clipPath id={`${uid}pc`}>
              <path d="M37 33L50 2.6L63 33Z" />
            </clipPath>
            <path d="M37 33L50 2.6L63 33Z" fill="#7a3fd0" stroke={INK} strokeWidth="1.2" strokeLinejoin="round" />
            <g clipPath={`url(#${uid}pc)`}>
              {stripes.map((t, i) => (
                <path key={t} d={`M${37 + (50 - 37) * t * 0.0 - 4} ${33 - 30.4 * t} L${63 + 4} ${33 - 30.4 * t + 7}`} stroke={['#ffd45a', '#4ae3ff', '#ff5fd0', '#ffd45a'][i]} strokeWidth="2" />
              ))}
              {[[44, 24, '#ffd45a'], [55, 20, '#4ae3ff'], [46, 14, '#ff5fd0'], [53, 28, '#ffd45a'], [50, 9, '#4ae3ff']].map(([x, y, c]) => (
                <circle key={`${x}-${y}`} cx={x as number} cy={y as number} r=".9" fill={c as string} />
              ))}
              <path d="M44 28L50 5" stroke="#b58aff" strokeWidth="1.2" strokeLinecap="round" opacity=".6" />
            </g>
            <ellipse cx="50" cy="33.4" rx="13.6" ry="2.2" fill="#5c2aa8" stroke={INK} strokeWidth="1" />
            {/* pompon de confettis */}
            <circle cx="50" cy="2.4" r="2.8" fill="#ffd45a" stroke={INK} strokeWidth=".8" />
            <path d="M47.6 1.6l1.2 1.2M51.4 1.2l1 1.4M49.6 3.8l1.2.6" stroke="#ff5fd0" strokeWidth=".7" strokeLinecap="round" />
          </g>
        </Posed>
      )
    }
    case 'pompom_beanie': {
      const dome = 'M31 36.4C30 20 39.6 11.6 50 11.6S70 20 69 36.4Z'
      return (
        <Posed hair={hair} rise={-0.9}>
          <clipPath id={`${uid}bn`}>
            <path d={dome} />
          </clipPath>
          <path d="M31.2 36.8C30.4 33 40 30.4 50 30.4S69.6 33 68.8 36.8Z" fill="#000" opacity=".16" />
          <P d={dome} fill="#c92f2a" />
          <g clipPath={`url(#${uid}bn)`}>
            <rect x="26" y="20" width="48" height="3.6" fill="#f6f1e8" />
            <rect x="26" y="25" width="48" height="2.4" fill="#2f8a4f" />
            <path d="M36 14v20M42 12v22M48 11.6v22M54 11.6v22M60 12v22M66 14v20" stroke="#8f1f1b" strokeWidth=".7" opacity=".45" />
            <path d="M36 17C40 13 46 12 52 12.4" fill="none" stroke="#f0746c" strokeWidth="1.6" strokeLinecap="round" opacity=".55" />
          </g>
          {/* revers côtelé */}
          <P d="M30.2 38.2C29.6 32.8 40 29.6 50 29.6S70.4 32.8 69.8 38.2C69.6 40.8 60 39.4 50 39.4S30.4 40.8 30.2 38.2Z" fill="#f6f1e8" />
          <path d="M34 33.4v5M38.6 32.2v6M43.4 31.6v6.6M48.4 31.4v7M53.4 31.6v7M58.2 32v6.6M62.8 32.6v6M67 33.6v4.6" stroke="#cfc6b2" strokeWidth=".7" />
          {/* gros pompon */}
          {[[50, 8.2, 5.2], [46.4, 10, 3.6], [53.8, 10, 3.6], [50, 5.2, 3.4]].map(([x, y, r]) => (
            <circle key={`${x}-${y}`} cx={x} cy={y} r={r + 0.9} fill={INK} />
          ))}
          {[[50, 8.2, 5.2], [46.4, 10, 3.6], [53.8, 10, 3.6], [50, 5.2, 3.4]].map(([x, y, r]) => (
            <circle key={`w${x}-${y}`} cx={x} cy={y} r={r} fill="#f6f1e8" />
          ))}
          <circle cx="48.4" cy="6.6" r="1.4" fill="#fff" opacity=".85" />
        </Posed>
      )
    }
    case 'elf_hat': {
      const teeth = Array.from({ length: 8 }, (_, i) => {
        const w = 38.8 / 8
        return `L${69.4 - w * (i + 0.5)} 41.6L${69.4 - w * (i + 1)} 37.6`
      }).join('')
      return (
        <Posed hair={hair}>
          <ellipse cx="50" cy="39.4" rx="17.4" ry="2.4" fill="#000" opacity=".18" />
          <P d="M33.4 34C32 22 40 11 52 7C60.6 4.4 70 6 76 12C79.6 15.6 80.6 19.6 79.6 23C77 20 73.6 18.8 70 19.4C69.6 19.5 69.4 21 69.4 34Z" fill="#2c8a4e" />
          <path d="M60 8.2C70 8.6 77.6 14 79 22" fill="none" stroke="#1d6a38" strokeWidth="1.2" strokeLinecap="round" opacity=".55" />
          <path d="M38 28C38.4 19.6 44 12.4 52 9.6" fill="none" stroke="#6fd093" strokeWidth="1.8" strokeLinecap="round" opacity=".5" />
          <circle cx="79.8" cy="25.6" r="3.3" fill="#f0c75a" stroke={INK} strokeWidth="1" />
          <path d="M77.6 25.6h4.4M79.8 23.2v1.2" stroke="#a8741c" strokeWidth=".7" />
          <circle cx="78.8" cy="24.4" r=".9" fill="#fff6d0" opacity=".9" />
          {/* bandeau rouge à dents */}
          <path d={`M30.6 35.8Q50 29.6 69.4 35.8L69.4 37.6${teeth}Z`} fill="#c92f2a" stroke={INK} strokeWidth="1.15" strokeLinejoin="round" />
          <path d="M33 34.6Q50 30 67 34.6" fill="none" stroke="#e8625a" strokeWidth="1.1" strokeLinecap="round" opacity=".7" />
        </Posed>
      )
    }
    case 'star_halo': {
      // L'étoile et son anneau FLOTTENT au-dessus de la tête, avec un vide entre le crâne et l'anneau. Sur un volume (afro...),
      // le tout est réduit à 80 % pour rester dans le cadre au-dessus des cheveux.
      const pts = Array.from({ length: 10 }, (_, i) => {
        const a = -Math.PI / 2 + (i * Math.PI) / 5
        const r = i % 2 ? 2.7 : 6.2
        return `${(50 + r * Math.cos(a)).toFixed(2)},${(5.6 + r * Math.sin(a)).toFixed(2)}`
      }).join(' ')
      return (
        <g transform={VOLUME_HAIRS.includes(hair) ? 'translate(10 0) scale(.8)' : undefined}>
          <defs>
            <radialGradient id={`${uid}sg`}>
              <stop offset="0" stopColor="#fff3b0" stopOpacity=".95" />
              <stop offset="1" stopColor="#ffd45a" stopOpacity="0" />
            </radialGradient>
          </defs>
          <circle cx="50" cy="5.6" r="12" fill={`url(#${uid}sg)`} />
          <ellipse cx="50" cy="14.4" rx="14.6" ry="3.1" fill="none" stroke={INK} strokeWidth="2.4" opacity=".45" />
          <ellipse cx="50" cy="14.4" rx="14.6" ry="3.1" fill="none" stroke="#ffd45a" strokeWidth="1.4" />
          <ellipse cx="48.4" cy="13.7" rx="7" ry="1.3" fill="none" stroke="#fff3b0" strokeWidth=".55" opacity=".8" />
          <polygon points={pts} fill="#ffd45a" stroke="#a8741c" strokeWidth=".8" strokeLinejoin="round" />
          <polygon points={pts} fill="none" stroke="#fff3b0" strokeWidth=".45" opacity=".7" transform="translate(-.5 -.5) scale(.98)" />
          <circle cx="50" cy="5.6" r="1.2" fill="#fff" opacity=".9" />
        </g>
      )
    }
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
        <g transform="translate(7 -3) scale(.86 1)">
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

function AvatarArtImpl({ config, mood = 'smile' }: { config: AvatarConfig; mood?: AvatarMood }) {
  const uid = useId().replace(/[^a-zA-Z0-9]/g, '')
  const skin = SKIN_TONES[config.skin]
  const dark = shade(skin, -34)
  const acc2 = config.acc2 ?? 'none'
  const lipC = config.acc === 'lipstick_pink' || acc2 === 'lipstick_pink' ? '#ff3d8b' : mix(shade(skin, -46), '#b3262c', 0.5)
  const hairC = HAIR_COLORS[config.hair] ?? '#1b120c'
  // Sourcils : jamais jaunes ou roses vifs (cheveux teints) — on les assombrit pour qu'ils restent naturels.
  const [hr, hg, hb] = toRgb(hairC)
  const browC = (0.299 * hr + 0.587 * hg + 0.114 * hb) / 255 > 0.5 || config.hair === 'braids_pink' || config.hair === 'afro_pink' || config.hair === 'ponytail_pop' || config.hair === 'frost_locs' ? '#2a1a10' : hairC
  const head = HEAD_PATHS[config.face]
  // Un gélé est déjà une coiffe : il remplace tout autre couvre-chef.
  const headwear = config.hair === 'gele' ? 'none' : config.head
  const cover = COVERING.includes(headwear)
  const hairHiding = HAIR_HIDING.includes(headwear)
  const ey = config.face === 'long' ? 44 : 45

  return (
    <svg viewBox="0 0 100 100" className="block h-full w-full" aria-hidden="true">
      <defs>
        <radialGradient id={`${uid}bg`} cx="50%" cy="42%" r="70%">
          <stop offset="0" stopColor="#fff" stopOpacity=".16" />
          <stop offset=".55" stopColor="#fff" stopOpacity="0" />
          <stop offset="1" stopColor="#000" stopOpacity=".22" />
        </radialGradient>
        <FaceDefs uid={uid} skin={skin} ey={ey} />
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
      {config.bg === 7 && goldenAurora(uid)}
      {config.bg === 8 && beachBackdrop(uid)}
      <rect width="100" height="100" fill={`url(#${uid}bg)`} />

      {hairBack(config.hair, hairC, cover, hairHiding)}
      <Neck uid={uid} skin={skin} />
      {outfitArt(config.outfit, skin, dark, uid)}
      <OutfitShading uid={uid} cover={cover} />
      {cover && <ellipse cx="50" cy="73.4" rx="9" ry="3.6" fill="#000" opacity=".3" />}
      <Ears skin={skin} ey={ey} />
      <path d={head} fill={skin} />
      <g clipPath={`url(#${uid}hd)`}>
        <SkinShading uid={uid} skin={skin} ey={ey} face={config.face} cover={cover} mood={mood} />
      </g>
      <path d={head} fill="none" stroke={shade(skin, -66)} strokeWidth=".7" strokeLinejoin="round" opacity=".85" />
      {hairFront(config.hair, hairC, uid, head, cover, hairHiding)}
      {!cover && !hairHiding && SHEEN_HAIRS.includes(config.hair) && <HairSheen uid={uid} />}
      {cover && (
        <g clipPath={`url(#${uid}hd)`}>
          <rect x="28" y={headwear === 'cap' ? 37 : 34} width="44" height="9" fill={`url(#${uid}hs)`} />
        </g>
      )}

      <Eyes uid={uid} skin={skin} ey={ey} mood={mood} />
      <Brows ey={ey} mood={mood} color={browC} />
      <Nose uid={uid} skin={skin} ey={ey} />
      {mouthProp(config.acc)}
      {mouthProp(acc2)}
      <Mouth uid={uid} skin={skin} mood={mood} lip={lipC} />
      {faceAccessory(config.acc, skin, ey)}
      {faceAccessory(acc2, skin, ey)}
      {headwearArt(headwear, uid, config.hair)}
    </svg>
  )
}

function sameAvatar(a: { config: AvatarConfig; mood?: AvatarMood }, b: { config: AvatarConfig; mood?: AvatarMood }): boolean {
  const x = a.config
  const y = b.config
  return (
    (a.mood ?? 'smile') === (b.mood ?? 'smile') &&
    x.skin === y.skin && x.hair === y.hair && x.outfit === y.outfit && x.acc === y.acc && (x.acc2 ?? 'none') === (y.acc2 ?? 'none') &&
    x.head === y.head && x.face === y.face && x.bg === y.bg
  )
}

/** Le visage détaillé coûte cher à dessiner (~230 éléments SVG) et la grille de joueurs se rafraîchit à chaque vote ou changement
 * de phase : on ne redessine un avatar que si sa configuration ou son expression ont réellement changé (les objets de
 * configuration sont recréés à chaque lecture de la vue, d'où la comparaison champ par champ). */
export const AvatarArt = memo(AvatarArtImpl, sameAvatar)

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
    body = value === '8' ? beachBackdrop(uid) : value === '7' ? goldenAurora(uid) : nightSky(uid)
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
