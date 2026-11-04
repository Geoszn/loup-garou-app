import type { ReactNode } from 'react'
import type { AvatarConfig, AvatarMood } from '../lib/avatarParts'
import { shade, mix, toRgb } from '../lib/avatarColor'

// Visage « illustration réaliste » des avatars (SVG 100×100, voir AvatarArt.tsx).
//
// Principes, à garder en tête en retouchant :
//  - presque AUCUN contour noir : les formes se lisent par leurs ombres et leurs lumières (dégradés radiaux doux, pas de
//    filtre SVG : un filtre flou par avatar ralentit les téléphones modestes quand 12 à 25 avatars sont affichés) ;
//  - lumière venant du haut à gauche : reflets à gauche, ombres à droite et sous les reliefs (arcade, nez, lèvre, menton) ;
//  - chaque œil est dessiné dans un repère local (coin interne à gauche, coin externe à droite) puis retourné pour l'autre
//    côté : un seul dessin à maintenir ;
//  - les 8 expressions ne changent que la géométrie (paupières, sourcils, bouche, joues), jamais le rôle ni un vote.
// Repères de la tête (viewBox 100) : yeux à y = ey (45, ou 44 pour le visage long) et x = 50 ± 8,4 ; nez de 46 à 57 ;
// bouche centrée à y = 60.

const DARK_LASH = '#1a0f08'

export const MOUTH_Y = 60

/** Clarté perçue de la peau (0 = très foncée, 1 = très claire). Les ombres noires empâtent une peau foncée : on les atténue,
 * et on renforce les lumières, qui sont ce qui donne le volume sur ce genre de peau. */
function lum(skin: string): number {
  const [r, g, b] = toRgb(skin)
  return (0.299 * r + 0.587 * g + 0.114 * b) / 255
}
export function shadowK(skin: string): number {
  return 0.35 + 0.65 * Math.min(1, lum(skin) / 0.7)
}
function lightK(skin: string): number {
  return 1 + (1 - Math.min(1, lum(skin) / 0.7)) * 0.9
}

/** Dégradés du visage. À poser dans <defs>. */
export function FaceDefs({ uid, skin, ey }: { uid: string; skin: string; ey: number }) {
  const blush = mix(skin, '#c2453a', 0.38)
  // Lumière chaude teintée par la peau : un blanc pur « cendre » une peau foncée.
  const glow = mix(skin, '#ffe0bd', 0.55)
  const sk = shadowK(skin)
  const lk = lightK(skin)
  return (
    <>
      {/* Lumière générale : haut-gauche clair, bas-droite dans l'ombre. */}
      <radialGradient id={`${uid}fl`} cx="38%" cy="30%" r="75%">
        <stop offset="0" stopColor={glow} stopOpacity={0.34 * lk} />
        <stop offset=".5" stopColor={glow} stopOpacity={0.05 * lk} />
        <stop offset="1" stopColor="#000" stopOpacity={0.28 * sk} />
      </radialGradient>
      <radialGradient id={`${uid}soft`} cx="50%" cy="50%" r="50%">
        <stop offset="0" stopColor="#000" stopOpacity="1" />
        <stop offset="1" stopColor="#000" stopOpacity="0" />
      </radialGradient>
      <radialGradient id={`${uid}hi`} cx="50%" cy="50%" r="50%">
        <stop offset="0" stopColor={glow} stopOpacity="1" />
        <stop offset="1" stopColor={glow} stopOpacity="0" />
      </radialGradient>
      <radialGradient id={`${uid}blush`} cx="50%" cy="50%" r="50%">
        <stop offset="0" stopColor={blush} stopOpacity=".3" />
        <stop offset="1" stopColor={blush} stopOpacity="0" />
      </radialGradient>
      {/* Globe oculaire : blanc crème au centre, gris rosé vers les coins. */}
      <radialGradient id={`${uid}sc`} cx="50%" cy="46%" r="62%">
        <stop offset=".35" stopColor="#fffaf1" />
        <stop offset="1" stopColor="#d8c3b6" />
      </radialGradient>
      {/* Iris : ambre clair au centre, brun, puis anneau limbique sombre. */}
      <radialGradient id={`${uid}ir`} cx="44%" cy="40%" r="62%">
        <stop offset="0" stopColor="#b9803f" />
        <stop offset=".45" stopColor="#7a4b21" />
        <stop offset=".86" stopColor="#3b1f0d" />
        <stop offset="1" stopColor="#170a04" />
      </radialGradient>
      {/* Ombre que la paupière supérieure projette sur le globe. */}
      <linearGradient id={`${uid}lid`} x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stopColor="#1a0c06" stopOpacity=".55" />
        <stop offset=".6" stopColor="#1a0c06" stopOpacity=".08" />
        <stop offset="1" stopColor="#1a0c06" stopOpacity="0" />
      </linearGradient>
      <linearGradient id={`${uid}jaw`} x1="0" y1="0" x2="1" y2="0">
        <stop offset="0" stopColor={shade(skin, -40)} stopOpacity="0" />
        <stop offset="1" stopColor={shade(skin, -40)} stopOpacity=".5" />
      </linearGradient>
      <linearGradient id={`${uid}neck`} x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stopColor={mix(skin, shade(skin, -62), sk)} />
        <stop offset=".55" stopColor={mix(skin, shade(skin, -42), sk)} />
        <stop offset="1" stopColor={mix(skin, shade(skin, -34), sk)} />
      </linearGradient>
      {/* Tenue : lumière à gauche, ombre à droite et en bas, comme le visage. */}
      <linearGradient id={`${uid}osh`} x1="0" y1="0" x2="1" y2="0.35">
        <stop offset="0" stopColor="#fff" stopOpacity=".14" />
        <stop offset=".45" stopColor="#fff" stopOpacity="0" />
        <stop offset="1" stopColor="#000" stopOpacity=".34" />
      </linearGradient>
      <linearGradient id={`${uid}osv`} x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stopColor="#000" stopOpacity=".3" />
        <stop offset=".35" stopColor="#000" stopOpacity="0" />
        <stop offset="1" stopColor="#000" stopOpacity=".26" />
      </linearGradient>
      <radialGradient id={`${uid}sheen`} cx="50%" cy="50%" r="50%">
        <stop offset="0" stopColor="#fff" stopOpacity=".5" />
        <stop offset="1" stopColor="#fff" stopOpacity="0" />
      </radialGradient>
      <clipPath id={`${uid}osc`}>
        <path d="M5 100C5 85 17 76 36 72.5L50 78L64 72.5C83 76 95 85 95 100Z" />
      </clipPath>
      <clipPath id={`${uid}eyearea`}>
        <ellipse cx="50" cy={ey} rx="22" ry="7" />
      </clipPath>
    </>
  )
}

/** Modelé de la tenue, posé PAR-DESSUS n'importe quelle tenue (dans la silhouette des épaules) : dégradés de lumière, plis
 * discrets aux épaules et sur la poitrine, ombre portée du menton à la base du cou. Donne du volume aux aplats de couleur. */
export function OutfitShading({ uid, cover }: { uid: string; cover: boolean }) {
  return (
    <g clipPath={`url(#${uid}osc)`}>
      <rect x="0" y="68" width="100" height="34" fill={`url(#${uid}osh)`} />
      <rect x="0" y="68" width="100" height="34" fill={`url(#${uid}osv)`} />
      {/* plis du tissu */}
      <g fill="none" strokeLinecap="round">
        <path d="M22 96C24 88 29 82 36 78M30 99C31 92 35 86 41 82" stroke="#000" strokeWidth="1.1" opacity=".16" />
        <path d="M78 96C76 88 71 82 64 78M70 99C69 92 65 86 59 82" stroke="#000" strokeWidth="1.1" opacity=".2" />
        <path d="M24 94C26 87 31 82 38 79" stroke="#fff" strokeWidth=".7" opacity=".14" />
        <path d="M44 99C45 92 47 87 50 84M56 99C55 92 53 87 50 84" stroke="#000" strokeWidth=".9" opacity=".12" />
      </g>
      {/* ombre du menton et du cou sur le vêtement */}
      <ellipse cx="50" cy="76.4" rx="11.4" ry="3.2" fill="#000" opacity={cover ? 0.38 : 0.3} />
    </g>
  )
}

/** Reflet doux sur le haut des cheveux : un éclat large, pas un trait, pour donner du volume. */
export function HairSheen({ uid }: { uid: string }) {
  return <ellipse cx="42" cy="25" rx="11" ry="3.4" fill={`url(#${uid}sheen)`} transform="rotate(-16 42 25)" opacity=".55" />
}

/** Cou : ombré de haut en bas, sans contour noir. */
export function Neck({ uid, skin }: { uid: string; skin: string }) {
  return <path d="M41.6 60v14c0 3.6 3.8 6 8.4 6s8.4-2.4 8.4-6V60z" fill={`url(#${uid}neck)`} stroke={shade(skin, -70)} strokeWidth=".6" strokeLinejoin="round" />
}

/** Oreilles : pavillon, hélix et conque ombrés. À dessiner AVANT la tête. */
export function Ears({ skin, ey }: { skin: string; ey: number }) {
  const edge = shade(skin, -62)
  const inner = shade(skin, -44)
  return (
    <>
      {([-1, 1] as const).map((s) => (
        <g key={s}>
          <path
            d={`M${50 + s * 18.4} ${ey - 3.4}c${s * 3.8} -1.4 ${s * 6} 1.4 ${s * 5.2} 5c-.4 3.6 ${s * -2.4} 5.6 ${s * -5.2} 4.8`}
            fill={skin}
            stroke={edge}
            strokeWidth=".5"
            strokeLinejoin="round"
          />
          <path d={`M${50 + s * 20.2} ${ey - 1.4}c${s * 1.8} .4 ${s * 2.2} 3 ${s * 0.4} 4.4`} fill="none" stroke={inner} strokeWidth=".9" strokeLinecap="round" opacity=".85" />
          <path d={`M${50 + s * 21.4} ${ey - 1.8}c${s * 1.2} 1 ${s * 1.2} 3 0 4.2`} fill="none" stroke={shade(skin, 22)} strokeWidth=".5" strokeLinecap="round" opacity=".5" />
        </g>
      ))}
    </>
  )
}

/** Modelé de la peau, à poser par-dessus la tête (déjà remplie de la couleur de peau), dans le clipPath de la tête. */
export function SkinShading({ uid, skin, ey, face, cover, mood }: { uid: string; skin: string; ey: number; face: AvatarConfig['face']; cover: boolean; mood: AvatarMood }) {
  const deep = shade(skin, -46)
  const sk = shadowK(skin)
  const lk = lightK(skin)
  const chinY = face === 'long' ? 70.6 : 69
  return (
    <>
      {/* lumière / ombre générales */}
      <rect x="26" y="14" width="48" height="62" fill={`url(#${uid}fl)`} />
      {/* creux des orbites */}
      {([-1, 1] as const).map((s) => (
        <ellipse key={`o${s}`} cx={50 + s * 8.6} cy={ey - 0.6} rx="7.6" ry="5.2" fill={deep} opacity={0.2 * sk} />
      ))}
      {/* pommettes éclairées et joues rosées */}
      <ellipse cx="40.4" cy={ey + 7} rx="6" ry="3.4" fill={`url(#${uid}hi)`} opacity={0.3 * lk} />
      <ellipse cx="38.6" cy="55" rx="6.4" ry="4.4" fill={`url(#${uid}blush)`} />
      <ellipse cx="61.4" cy="55" rx="6.4" ry="4.4" fill={`url(#${uid}blush)`} />
      {/* sourire : les pommettes remontent et accrochent la lumière */}
      {(mood === 'smile' || mood === 'grin') && (
        <>
          <ellipse cx="38.6" cy={ey + 7.4} rx="5" ry="3.4" fill={`url(#${uid}hi)`} opacity={0.5 * lk} />
          <ellipse cx="61.4" cy={ey + 7.4} rx="5" ry="3.4" fill={`url(#${uid}hi)`} opacity={0.34 * lk} />
        </>
      )}
      {/* front et arête du nez éclairés */}
      <ellipse cx="46" cy="32" rx="8.5" ry="4" fill={`url(#${uid}hi)`} opacity={0.26 * lk} transform="rotate(-14 46 32)" />
      {/* joue droite dans l'ombre, mâchoire */}
      <path d="M67 30C71.4 45 66.4 60 53 72L74 82L82 20Z" fill={`url(#${uid}jaw)`} opacity={0.7 * sk} />
      <path d={`M33.4 50C34 58 38 65 44 ${chinY - 1}`} fill="none" stroke={deep} strokeWidth="2.4" opacity={0.1 * sk} strokeLinecap="round" />
      {/* ombre portée du menton sur le cou */}
      <ellipse cx="50" cy={chinY + 2.4} rx="14.5" ry="3.8" fill={deep} opacity={(cover ? 0.55 : 0.38) * sk} />
      {/* éclat du menton */}
      <ellipse cx="48" cy={chinY - 3} rx="3.6" ry="1.6" fill={`url(#${uid}hi)`} opacity={0.16 * lk} />
    </>
  )
}

interface EyeLook {
  top: number // hauteur de la paupière supérieure
  bot: number // creux de la paupière inférieure
  lift: number // monte (>0) ou baisse (<0) le coin interne : colère
  iris: number // rayon visible de l'iris
  lidDrop: number // paupière supérieure qui descend sur l'œil (colère, sourire)
}

function eyeLook(mood: AvatarMood): EyeLook {
  switch (mood) {
    case 'shock':
      return { top: 4.9, bot: 3.6, lift: 0, iris: 2.5, lidDrop: 0 }
    case 'angry':
      return { top: 3.2, bot: 2.2, lift: -1.1, iris: 2.8, lidDrop: 1 }
    case 'grin':
      return { top: 3.1, bot: 1.0, lift: 0, iris: 2.9, lidDrop: 0.6 }
    case 'smile':
      return { top: 3.3, bot: 1.2, lift: 0, iris: 2.9, lidDrop: 0.5 }
    case 'calm':
      return { top: 3.4, bot: 2.5, lift: 0, iris: 2.9, lidDrop: 0.5 }
    default:
      return { top: 3.7, bot: 2.6, lift: 0, iris: 2.9, lidDrop: 0 }
  }
}

function OpenEye({ s, cx, cy, mood, uid, skin }: { s: -1 | 1; cx: number; cy: number; mood: AvatarMood; uid: string; skin: string }) {
  const L = eyeLook(mood)
  const rw = 4.9
  const innerY = 0.5 - L.lift // coin interne (colère : plus bas)
  const outerY = -0.4
  const t = L.top - L.lidDrop * 0.6
  const upper = `M${-rw} ${innerY}C${-rw * 0.62} ${-t * 0.86} ${rw * 0.2} ${-t * 1.12} ${rw} ${outerY}`
  const lowerBack = `C${rw * 0.5} ${L.bot} ${-rw * 0.5} ${L.bot + 0.4} ${-rw} ${innerY}Z`
  const ball = `${upper}${lowerBack}`
  const id = `${uid}ecl${s > 0 ? 'r' : 'l'}` // distinct des autres identifiants de l'avatar (ex. dégradé de la couronne : `${uid}cr`)
  const edge = shade(skin, -70)
  const crease = shade(skin, -52)
  const ix = 0.1
  const iy = -0.2 + (mood === 'shock' ? 0 : 0.25)
  const lidShadow = L.lidDrop > 0 ? 1 : 0
  return (
    <g transform={`translate(${cx} ${cy}) scale(${s} 1)`}>
      <clipPath id={id}>
        <path d={ball} />
      </clipPath>
      {/* ombre sous l'arcade, tendue au-dessus de l'œil */}
      <path d={`M${-rw - 0.6} ${innerY - 0.8}C${-rw * 0.5} ${-t * 1.3 - 2.6} ${rw * 0.4} ${-t * 1.5 - 3} ${rw + 0.9} ${outerY - 0.6}L${rw} ${outerY}C${rw * 0.2} ${-t * 1.12} ${-rw * 0.62} ${-t * 0.86} ${-rw} ${innerY}Z`} fill={crease} opacity=".28" />
      <path d={ball} fill={`url(#${uid}sc)`} />
      <g clipPath={`url(#${id})`}>
        <circle cx={ix} cy={iy} r={L.iris} fill={`url(#${uid}ir)`} />
        <circle cx={ix} cy={iy} r={L.iris} fill="none" stroke="#120804" strokeWidth=".55" opacity=".85" />
        <circle cx={ix} cy={iy} r={L.iris * 0.42} fill="#070302" />
        {/* reflets */}
        <ellipse cx={ix - 1.1} cy={iy - 1.1} rx=".95" ry=".8" fill="#fff" opacity=".95" />
        <circle cx={ix + 1.3} cy={iy + 1.3} r=".4" fill="#fff" opacity=".7" />
        {/* ombre de la paupière sur le globe */}
        <rect x={-rw - 1} y={-t * 1.2} width={rw * 2 + 2} height={t * 0.95 + lidShadow * 0.6} fill={`url(#${uid}lid)`} />
      </g>
      {/* caroncule (coin interne) */}
      <ellipse cx={-rw + 0.55} cy={innerY + 0.1} rx=".85" ry=".6" fill="#d48a82" opacity=".85" />
      {/* paupière inférieure : ligne d'eau claire puis fin ourlet */}
      <path d={`M${-rw + 0.6} ${innerY + 0.2}C${-rw * 0.5} ${L.bot + 0.2} ${rw * 0.5} ${L.bot} ${rw - 0.3} ${outerY + 0.2}`} fill="none" stroke="#e9a79c" strokeWidth=".45" opacity=".55" strokeLinecap="round" />
      <path d={`M${-rw + 0.2} ${innerY + 0.7}C${-rw * 0.5} ${L.bot + 1.1} ${rw * 0.5} ${L.bot + 0.9} ${rw} ${outerY + 0.6}`} fill="none" stroke={crease} strokeWidth=".55" opacity=".6" strokeLinecap="round" />
      {/* ligne de cils supérieure : croissant épais effilé + pointe externe */}
      <path
        d={`M${-rw - 0.2} ${innerY + 0.2}C${-rw * 0.62} ${-t * 0.86 - 1.2} ${rw * 0.2} ${-t * 1.12 - 1.6} ${rw + 0.5} ${outerY - 0.7}C${rw * 0.2} ${-t * 1.12 - 0.2} ${-rw * 0.62} ${-t * 0.86 + 0.4} ${-rw + 0.1} ${innerY + 0.7}Z`}
        fill={DARK_LASH}
      />
      <path d={`M${rw - 0.2} ${outerY - 0.5}l1.9 -1.2`} stroke={DARK_LASH} strokeWidth=".7" strokeLinecap="round" />
      {/* pli de la paupière (sillon) */}
      <path d={`M${-rw + 0.7} ${innerY - 2.4}C${-rw * 0.5} ${-t * 1.5 - 1.6} ${rw * 0.3} ${-t * 1.6 - 1.9} ${rw + 0.7} ${outerY - 2.4}`} fill="none" stroke={edge} strokeWidth=".55" opacity=".55" strokeLinecap="round" />
      {(mood === 'smile' || mood === 'grin') && (
        <path d={`M${rw + 1} ${outerY + 1.2}c1.6 -.3 2.6 .1 3.2 .9M${rw + 0.8} ${outerY + 2.6}c1.4 0 2.4 .5 2.9 1.4`} fill="none" stroke={crease} strokeWidth=".5" opacity=".4" strokeLinecap="round" />
      )}
      {/* cerne léger sous l'œil */}
      <ellipse cx="0" cy={L.bot + 2.4} rx={rw} ry="1.7" fill={`url(#${uid}soft)`} opacity=".14" />
    </g>
  )
}

function ClosedEye({ s, cx, cy, skin }: { s: -1 | 1; cx: number; cy: number; skin: string }) {
  const crease = shade(skin, -52)
  return (
    <g transform={`translate(${cx} ${cy}) scale(${s} 1)`}>
      <path d="M-5 -0.6C-3.2 1.6 2.6 2.2 5.2 -0.4C2.6 1.1 -3 0.8 -5 -0.6Z" fill={shade(skin, -34)} opacity=".5" />
      <path d="M-4.9 -0.3C-3 2.6 2.4 3.1 5 -0.3" fill="none" stroke={DARK_LASH} strokeWidth="1.15" strokeLinecap="round" />
      <path d="M5 -0.3l1.3 -0.8M3.4 1.4l.7 .9M1.2 2.3l.3 1M-1.4 2.4l-.2 1" stroke={DARK_LASH} strokeWidth=".4" opacity=".7" strokeLinecap="round" />
      <path d={`M-4.4 -2.2C-2.4 -4 2.4 -4 4.8 -2.2`} fill="none" stroke={crease} strokeWidth=".55" opacity=".5" strokeLinecap="round" />
    </g>
  )
}

/** Les deux yeux selon l'expression. */
export function Eyes({ uid, skin, ey, mood }: { uid: string; skin: string; ey: number; mood: AvatarMood }): ReactNode {
  if (mood === 'dead') {
    return (
      <g stroke={DARK_LASH} strokeWidth="1.5" strokeLinecap="round" opacity=".9">
        <path d={`M38.6 ${ey - 2.2}l5 4.8M43.6 ${ey - 2.2}l-5 4.8M56.4 ${ey - 2.2}l5 4.8M61.4 ${ey - 2.2}l-5 4.8`} />
      </g>
    )
  }
  if (mood === 'sleep') {
    return (
      <>
        <ClosedEye s={-1} cx={41.6} cy={ey} skin={skin} />
        <ClosedEye s={1} cx={58.4} cy={ey} skin={skin} />
      </>
    )
  }
  return (
    <>
      <OpenEye s={-1} cx={41.6} cy={ey} mood={mood} uid={uid} skin={skin} />
      <OpenEye s={1} cx={58.4} cy={ey} mood={mood} uid={uid} skin={skin} />
    </>
  )
}

/** Sourcils : une forme douce en deux couches (halo + cœur) et quelques poils dans le sens de la pousse. */
export function Brows({ ey, mood, color }: { ey: number; mood: AvatarMood; color: string }): ReactNode {
  if (mood === 'dead' || mood === 'sleep') return null
  const baseY = ey - 6.4
  // décalages par expression : [intérieur, sommet, extérieur]
  const dy = mood === 'angry' ? [2.4, 0.4, -0.8] : mood === 'shock' ? [-2.4, -3.2, -2.2] : mood === 'smile' || mood === 'grin' ? [-1.1, -1.5, -1.3] : [0, 0, 0]
  return (
    <>
      {([-1, 1] as const).map((s) => {
        const ix = -5.6
        const ax = 0.6
        const ox = 6.4
        const iy = 0.6 + dy[0]
        const ay = -1.7 + dy[1]
        const oy = 1.0 + dy[2]
        const core = `M${ix} ${iy}C${-3.2} ${iy - 1.6} ${-1} ${ay - 0.4} ${ax} ${ay}C${2.6} ${ay + 0.1} ${4.6} ${oy - 1} ${ox} ${oy}C${4.4} ${oy + 0.2} ${2.4} ${ay + 1.9} ${ax} ${ay + 2.1}C${-1.6} ${ay + 2.3} ${-3.6} ${iy + 1.5} ${ix} ${iy + 1.2}Z`
        return (
          <g key={s} transform={`translate(${50 + s * 8.6} ${baseY}) scale(${s} 1)`}>
            <path d={core} fill={color} opacity=".3" transform="scale(1.06 1.45) translate(0 -.6)" />
            <path d={core} fill={color} opacity=".92" />
            <path
              d={`M${-2.6} ${iy - 0.6}l1.2 -1M${1.8} ${ay + 0.4}l1.4 -.3`}
              stroke={shade(color, 34)}
              strokeWidth=".28"
              opacity=".4"
              strokeLinecap="round"
            />
          </g>
        )
      })}
    </>
  )
}

/** Nez : arête, ailes, narines, bout éclairé et ombre portée sous le nez. */
export function Nose({ uid, skin, ey }: { uid: string; skin: string; ey: number }): ReactNode {
  const deep = shade(skin, -58)
  const mid = shade(skin, -40)
  const top = ey + 1.4
  return (
    <>
      {/* flanc droit dans l'ombre, arête éclairée à gauche */}
      <path d={`M51.7 ${top}C52.6 ${top + 3.4} 53.4 ${top + 6} 54.6 ${top + 8.6}L52.2 ${top + 9.2}C52 ${top + 6} 51.6 ${top + 3} 51.2 ${top}Z`} fill={mid} opacity=".34" />
      <path d={`M48.2 ${top}C47.8 ${top + 3} 47.4 ${top + 6} 46.4 ${top + 8.4}L48 ${top + 9}C48.4 ${top + 6} 48.6 ${top + 3} 48.6 ${top}Z`} fill={mid} opacity=".14" />
      <ellipse cx="49.1" cy={top + 3} rx=".9" ry="3.6" fill={`url(#${uid}hi)`} opacity=".3" />
      {/* bout du nez */}
      <ellipse cx="50.3" cy={top + 8.2} rx="2.6" ry="2" fill={`url(#${uid}hi)`} opacity=".32" />
      {/* ailes du nez */}
      <path d={`M46.9 ${top + 7.6}C45.9 ${top + 9.2} 46.7 ${top + 11} 48.6 ${top + 10.7}`} fill="none" stroke={deep} strokeWidth=".55" strokeLinecap="round" opacity=".5" />
      <path d={`M53.5 ${top + 7.6}C54.5 ${top + 9.2} 53.7 ${top + 11} 51.8 ${top + 10.7}`} fill="none" stroke={deep} strokeWidth=".55" strokeLinecap="round" opacity=".5" />
      {/* narines */}
      <ellipse cx="48.8" cy={top + 10.9} rx=".95" ry=".48" fill="#2a1007" opacity=".6" transform={`rotate(-14 48.8 ${top + 10.9})`} />
      <ellipse cx="51.6" cy={top + 10.9} rx=".95" ry=".48" fill="#2a1007" opacity=".6" transform={`rotate(14 51.6 ${top + 10.9})`} />
      {/* ombre sous le nez et philtrum */}
      <ellipse cx="50.2" cy={top + 12} rx="3.6" ry="1.2" fill={`url(#${uid}soft)`} opacity=".3" />
      <path d={`M49.1 ${top + 12.6}C49 ${top + 14} 48.8 ${top + 15} 48.6 ${top + 15.6}M51.5 ${top + 12.6}C51.6 ${top + 14} 51.8 ${top + 15} 52 ${top + 15.6}`} fill="none" stroke={deep} strokeWidth=".45" opacity=".22" strokeLinecap="round" />
    </>
  )
}

/** Bouche et ses à-côtés (plis du sourire, ombre sous la lèvre). */
export function Mouth({ uid, skin, mood, lip }: { uid: string; skin: string; mood: AvatarMood; lip: string }): ReactNode {
  const my = MOUTH_Y
  const deep = shade(skin, -62)
  const base = mix(shade(skin, -30), '#94463d', 0.42)
  const upper = shade(base, -16)
  const lower = shade(base, 8)
  const line = mix(shade(lip, -70), '#1a0705', 0.5)
  const chinShadow = <ellipse cx="50" cy={my + 5.8} rx="4.4" ry="1.5" fill={`url(#${uid}soft)`} opacity=".22" />
  const lowerGloss = <ellipse cx="49.4" cy={my + 2.8} rx="1.8" ry=".5" fill="#fff" opacity=".24" />

  if (mood === 'dead') {
    return (
      <>
        <path d={`M44.6 ${my + 1.2}C48 ${my + 0.9} 52 ${my + 0.9} 55.4 ${my + 1.2}`} stroke={line} strokeWidth="1" strokeLinecap="round" fill="none" opacity=".9" />
        <path d={`M45 ${my + 1.6}C48 ${my + 3.4} 52 ${my + 3.4} 55 ${my + 1.6}C52 ${my + 2.2} 48 ${my + 2.2} 45 ${my + 1.6}Z`} fill={lower} opacity=".55" />
        {chinShadow}
      </>
    )
  }

  // Bouche ouverte (grin, talk, shock) : cavité sombre, dents, langue, lèvres autour.
  if (mood === 'grin' || mood === 'talk' || mood === 'shock') {
    const o =
      mood === 'grin'
        ? { w: 7.6, up: 1.2, down: 6, cornerLift: 1.6 }
        : mood === 'talk'
          ? { w: 4.9, up: 0.8, down: 4.4, cornerLift: 0.2 }
          : { w: 3.9, up: 1.8, down: 6.8, cornerLift: 0 }
    const x0 = 50 - o.w
    const x1 = 50 + o.w
    const cy = my - o.cornerLift
    const cavity = `M${x0} ${cy}C${50 - o.w * 0.5} ${cy - o.up - 1} ${50 + o.w * 0.5} ${cy - o.up - 1} ${x1} ${cy}C${x1 - 0.7} ${cy + o.down} ${x0 + 0.7} ${cy + o.down} ${x0} ${cy}Z`
    const teeth = `M${x0 + 0.9} ${cy + 0.1}C${50 - o.w * 0.5} ${cy - o.up - 0.6} ${50 + o.w * 0.5} ${cy - o.up - 0.6} ${x1 - 0.9} ${cy + 0.1}L${x1 - 1.4} ${cy + 1.9}C${50 + o.w * 0.4} ${cy + 1.2} ${50 - o.w * 0.4} ${cy + 1.2} ${x0 + 1.4} ${cy + 1.9}Z`
    const id = `${uid}m`
    return (
      <>
        <clipPath id={id}>
          <path d={cavity} />
        </clipPath>
        <path d={cavity} fill="#3a100d" />
        <g clipPath={`url(#${id})`}>
          {(mood === 'grin' || mood === 'talk') && <path d={teeth} fill="#f7f0e2" />}
          {mood === 'grin' && <path d={`M${50 - 2.6} ${cy + 0.4}v1.5M${50} ${cy + 0.2}v1.6M${50 + 2.6} ${cy + 0.4}v1.5`} stroke="#cdbfa8" strokeWidth=".3" />}
          <ellipse cx="50" cy={cy + o.down * 0.72} rx={o.w * 0.55} ry={o.down * 0.32} fill="#c4524f" />
          <ellipse cx="50" cy={cy - o.up - 0.2} rx={o.w} ry="1" fill="#000" opacity=".28" />
        </g>
        {/* lèvres */}
        <path d={`M${x0 - 0.5} ${cy}C${50 - o.w * 0.5} ${cy - o.up - 1.4} ${50 + o.w * 0.5} ${cy - o.up - 1.4} ${x1 + 0.5} ${cy}C${50 + o.w * 0.5} ${cy - o.up - 0.2} ${50 - o.w * 0.5} ${cy - o.up - 0.2} ${x0 - 0.5} ${cy}Z`} fill={upper} />
        <path d={`M${x0 - 0.3} ${cy}C${x0 + 0.3} ${cy + o.down + 1.8} ${x1 - 0.3} ${cy + o.down + 1.8} ${x1 + 0.3} ${cy}C${x1 - 0.7} ${cy + o.down + 0.1} ${x0 + 0.7} ${cy + o.down + 0.1} ${x0 - 0.3} ${cy}Z`} fill={lower} />
        <ellipse cx="49.4" cy={cy + o.down + 0.6} rx={Math.max(1.6, o.w * 0.34)} ry=".6" fill="#fff" opacity=".3" />
        {mood === 'grin' && (
          <path d={`M${x0 - 1.4} ${cy - 1.8}c-.7 .8 -.7 1.8 .2 2.6M${x1 + 1.4} ${cy - 1.8}c.7 .8 .7 1.8 -.2 2.6`} fill="none" stroke={deep} strokeWidth=".6" opacity=".5" strokeLinecap="round" />
        )}
        {chinShadow}
      </>
    )
  }

  // Sourire : bouche large, commissures hautes, lèvres légèrement entrouvertes sur les dents du haut. C'est ce qui le fait lire
  // comme un sourire (une ligne fermée, même courbée, se lit facilement comme une moue).
  if (mood === 'smile') {
    const xl = 41.8
    const xr = 58.2
    const yc = my - 1.9
    const id = `${uid}sm`
    const cavity = `M${xl} ${yc}C45 ${my + 1.4} 55 ${my + 1.4} ${xr} ${yc}C55.6 ${my + 3.6} 44.4 ${my + 3.6} ${xl} ${yc}Z`
    return (
      <>
        <clipPath id={id}>
          <path d={cavity} />
        </clipPath>
        <path d={cavity} fill="#3a100d" />
        <g clipPath={`url(#${id})`}>
          <path d={`M${xl} ${yc - 1}C45 ${my + 0.4} 55 ${my + 0.4} ${xr} ${yc - 1}L${xr} ${my + 1.2}C55 ${my + 2.2} 45 ${my + 2.2} ${xl} ${my + 1.2}Z`} fill="#f8f1e4" />
          <path d={`M46.6 ${my + 0.6}v1.4M50 ${my + 0.7}v1.4M53.4 ${my + 0.6}v1.4`} stroke="#d6c8b0" strokeWidth=".28" />
          <ellipse cx="50" cy={my + 3.1} rx="3" ry=".9" fill="#c4524f" opacity=".7" />
        </g>
        {/* lèvre supérieure : fine, dessinée au-dessus de la courbe des dents */}
        <path d={`M${xl - 0.5} ${yc + 0.1}C44.4 ${my - 2.6} 47 ${my - 2.4} 48.8 ${my - 2.6}C49.5 ${my - 2.6} 49.8 ${my - 2.1} 50 ${my - 2.1}C50.2 ${my - 2.1} 50.5 ${my - 2.6} 51.2 ${my - 2.6}C53 ${my - 2.4} 55.6 ${my - 2.6} ${xr + 0.5} ${yc + 0.1}C55.2 ${my + 0.2} 44.8 ${my + 0.2} ${xl - 0.5} ${yc + 0.1}Z`} fill={upper} />
        {/* lèvre inférieure : pleine, sous la cavité */}
        <path d={`M${xl + 0.2} ${yc + 0.5}C44.6 ${my + 3.6} 55.4 ${my + 3.6} ${xr - 0.2} ${yc + 0.5}C56 ${my + 5.4} 53 ${my + 6.4} 50 ${my + 6.4}C47 ${my + 6.4} 44 ${my + 5.4} ${xl + 0.2} ${yc + 0.5}Z`} fill={lower} />
        <ellipse cx="49.4" cy={my + 4.9} rx="2.2" ry=".55" fill="#fff" opacity=".28" />
        {/* plis du sourire (de chaque côté du nez jusqu'aux commissures) */}
        <path d={`M${xl - 1.2} ${yc - 3.8}c-2.4 1.6 -3 4.4 -1.4 6.8M${xr + 1.2} ${yc - 3.8}c2.4 1.6 3 4.4 1.4 6.8`} fill="none" stroke={deep} strokeWidth=".65" opacity=".38" strokeLinecap="round" />
        <ellipse cx="50" cy={my + 7.4} rx="4.2" ry="1.4" fill={`url(#${uid}soft)`} opacity=".2" />
      </>
    )
  }

  // Bouche fermée : sourire (coins relevés), calme, ou colère (coins abaissés).
  const c = mood === 'angry' ? -1.3 : 0
  const xl = 43.4
  const xr = 56.6
  const yc = my - c * 0.5 // hauteur des commissures
  const lineD = `M${xl} ${yc}C${46.4} ${my + 0.9 + c * 0.4} ${53.6} ${my + 0.9 + c * 0.4} ${xr} ${yc}`
  const upperD = `M${xl} ${yc}C${45} ${my - 1.4} ${47} ${my - 2} ${48.6} ${my - 2}C${49.4} ${my - 2} ${49.7} ${my - 1.5} ${50} ${my - 1.5}C${50.3} ${my - 1.5} ${50.6} ${my - 2} ${51.4} ${my - 2}C${53} ${my - 2} ${55} ${my - 1.4} ${xr} ${yc}C${53.4} ${my + 0.9 + c * 0.4} ${46.6} ${my + 0.9 + c * 0.4} ${xl} ${yc}Z`
  const lowerD = `M${xl + 0.6} ${yc + 0.2}C${46.4} ${my + 1.2 + c * 0.4} ${53.6} ${my + 1.2 + c * 0.4} ${xr - 0.6} ${yc + 0.2}C${xr - 2} ${my + 3.8 + c * 0.2} ${52.4} ${my + 4.6 + c * 0.2} ${50} ${my + 4.6 + c * 0.2}C${47.6} ${my + 4.6 + c * 0.2} ${xl + 2} ${my + 3.8 + c * 0.2} ${xl + 0.6} ${yc + 0.2}Z`
  return (
    <>
      <path d={lowerD} fill={lower} />
      <path d={upperD} fill={upper} />
      {lowerGloss}
      <path d={`M${xl + 1} ${yc - 0.1}C${46} ${my - 1.3} ${48.4} ${my - 1.7} ${49.2} ${my - 1.6}`} fill="none" stroke="#fff" strokeWidth=".4" opacity=".25" strokeLinecap="round" />
      <path d={lineD} fill="none" stroke={line} strokeWidth=".75" strokeLinecap="round" />
      {/* commissures et plis */}
      <circle cx={xl - 0.2} cy={yc} r=".7" fill={deep} opacity=".5" />
      <circle cx={xr + 0.2} cy={yc} r=".7" fill={deep} opacity=".5" />
      {mood === 'angry' && <path d={`M${xl + 1.4} ${my + 1.8}c2.6 -1.2 8 -1.2 10.4 0`} fill="none" stroke={deep} strokeWidth=".5" opacity=".25" />}
      {chinShadow}
    </>
  )
}
