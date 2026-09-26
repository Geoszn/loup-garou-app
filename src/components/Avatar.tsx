import { useId, type ReactNode } from 'react'
import { AvatarIcon } from './AvatarIcon'
import {
  AVATAR_BGS,
  SKIN_TONES,
  parseAvatarConfig,
  type AvatarConfig,
  type AvatarMood,
} from '../lib/avatarParts'

const HAIR_COLOR = '#1b120c'
const HAIR_COLOR_BRAIDS = '#2a1a10'
const HAIR_COLOR_LOCS = '#241610'

function shade(hex: string, amt: number): string {
  const n = parseInt(hex.slice(1), 16)
  const f = (v: number) => Math.max(0, Math.min(255, v + amt))
  return '#' + [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => f(v).toString(16).padStart(2, '0')).join('')
}

const SHOULDERS = 'M14 100c0-22 16-30 36-30s36 8 36 30z'
const CAP_FADE = 'M32 40c0-13 8-19 18-19s18 6 18 19c-3-6-9-9-18-9s-15 3-18 9z'
const CAP_FULL = 'M32 42c0-12 8-18 18-18s18 6 18 18c-4-6-10-9-18-9s-14 3-18 9z'

function hairBack(kind: AvatarConfig['hair'], hair: string): ReactNode {
  switch (kind) {
    case 'afro':
      return <circle cx="50" cy="38" r="27" fill={hair} />
    case 'braids':
      return <path d="M26 40c0-20 10-27 24-27s24 7 24 27v16H26z" fill={hair} />
    case 'locs':
      return <path d="M25 40c0-19 10-26 25-26s25 7 25 26v22H25z" fill={hair} />
    case 'bun':
      return <circle cx="50" cy="20" r="9" fill={hair} />
    case 'puffs':
      return (
        <>
          <circle cx="33" cy="24" r="11" fill={hair} />
          <circle cx="67" cy="24" r="11" fill={hair} />
        </>
      )
    case 'long':
      return <path d="M27 42c0-20 10-27 23-27s23 7 23 27v40H27z" fill={hair} />
    case 'topknot':
      return <circle cx="50" cy="17" r="10" fill={hair} />
    default:
      return null
  }
}

function hairFront(kind: AvatarConfig['hair'], hair: string): ReactNode {
  switch (kind) {
    case 'fade':
      return <path d={CAP_FADE} fill={hair} />
    case 'afro':
      return <path d="M32 42c1-8 8-12 18-12s17 4 18 12c-4-5-10-7-18-7s-14 2-18 7z" fill={hair} />
    case 'braids':
      return (
        <>
          <path d="M32 42c0-11 7-16 18-16s18 5 18 16c-4-5-10-8-18-8s-14 3-18 8z" fill={hair} />
          {[30, 36, 64, 70].map((x) => (
            <g key={x}>
              <path d={`M${x} 44v24`} stroke={hair} strokeWidth="5" strokeLinecap="round" />
              <path d={`M${x} 52h0M${x} 60h0`} stroke="#ecc97d" strokeWidth="2.4" strokeLinecap="round" />
            </g>
          ))}
        </>
      )
    case 'locs':
      return (
        <>
          <path d="M31 42c0-12 8-17 19-17s19 5 19 17c-4-5-10-8-19-8s-15 3-19 8z" fill={hair} />
          {[28, 34, 66, 72].map((x) => (
            <path key={x} d={`M${x} 44v26`} stroke={hair} strokeWidth="6" strokeLinecap="round" />
          ))}
        </>
      )
    case 'bun':
      return <path d={CAP_FULL} fill={hair} />
    case 'puffs':
      return (
        <>
          <path d={CAP_FADE} fill={hair} />
          <circle cx="36" cy="31" r="2" fill="#ecc97d" />
          <circle cx="64" cy="31" r="2" fill="#ecc97d" />
        </>
      )
    case 'curly':
      return (
        <>
          <path d={CAP_FADE} fill={hair} />
          {[
            [34, 33], [38, 27], [44, 23.5], [50, 22.5], [56, 23.5], [62, 27], [66, 33],
          ].map(([x, y]) => (
            <circle key={x} cx={x} cy={y} r="5" fill={hair} />
          ))}
        </>
      )
    case 'flat':
      return <path d="M33 40V24h34v16c-3-5-9-8-17-8s-14 3-17 8z" fill={hair} />
    case 'cornrows':
      return (
        <>
          <path d={CAP_FULL} fill={hair} />
          <path
            d="M39 30c-2 3-3 6-3 9M45 27c-1 3-1 7-1 10M55 27c1 3 1 7 1 10M61 30c2 3 3 6 3 9M50 26v9"
            stroke="#5a4030"
            strokeWidth="1.3"
            fill="none"
            strokeLinecap="round"
          />
        </>
      )
    case 'long':
      return (
        <>
          <path d={CAP_FULL} fill={hair} />
          <path d="M29 44v34M71 44v34" stroke={hair} strokeWidth="7" strokeLinecap="round" />
        </>
      )
    case 'knots':
      return (
        <>
          <path d={CAP_FADE} fill={hair} />
          {[
            [33, 30], [41, 24.5], [50, 22], [59, 24.5], [67, 30],
          ].map(([x, y]) => (
            <circle key={x} cx={x} cy={y} r="4.6" fill={hair} stroke="#4a3524" strokeWidth=".8" />
          ))}
        </>
      )
    case 'mohawk':
      return (
        <>
          <path d={CAP_FADE} fill={hair} opacity=".45" />
          <path d="M44 31c-1-9 1-16 6-19 5 3 7 10 6 19z" fill={hair} />
        </>
      )
    case 'topknot':
      return (
        <>
          <path d={CAP_FULL} fill={hair} />
          <path d="M44 15c2 3 2 6 1 9M50 12v11M56 15c-2 3-2 6-1 9" stroke="#5a4030" strokeWidth="1.3" fill="none" strokeLinecap="round" />
        </>
      )
    case 'gele':
      return (
        <>
          <path d="M27 40c-2-16 8-27 24-26 14 1 23 10 22 26-5-7-12-9-23-9s-17 2-23 9z" fill="#c2432a" />
          <path d="M31 32c8-6 20-8 36-2M34 26c8-4 18-5 30 0" stroke="#e0623f" strokeWidth="2.4" fill="none" strokeLinecap="round" />
          <path d="M63 18c8-6 16-2 14 6-6-2-10-2-14-6z" fill="#ecc97d" />
        </>
      )
    default:
      return null
  }
}

function outfitArt(kind: AvatarConfig['outfit'], skin: string, dark: string, uid: string): ReactNode {
  switch (kind) {
    case 'hood':
      return (
        <>
          <path d={SHOULDERS} fill="#4a3524" />
          <path d="M28 70l-6-16 12 6M72 70l6-16-12 6" fill="#4a3524" />
          <path d="M36 100c0-14 6-22 14-22s14 8 14 22z" fill="#2e1e15" />
        </>
      )
    case 'cloak':
      return (
        <>
          <path d={SHOULDERS} fill="#26324a" />
          <path d="M40 72l10 14 10-14" fill="none" stroke="#ecc97d" strokeWidth="2.5" strokeLinejoin="round" />
          <circle cx="50" cy="86" r="3" fill="#ecc97d" />
        </>
      )
    case 'kente':
      return (
        <>
          <clipPath id={`${uid}k`}>
            <path d={SHOULDERS} />
          </clipPath>
          <g clipPath={`url(#${uid}k)`}>
            <rect x="10" y="66" width="80" height="40" fill="#c2432a" />
            {[0, 1, 2, 3, 4, 5, 6, 7].map((i) => (
              <rect key={i} x={12 + i * 10} y="66" width="5" height="40" fill={i % 2 ? '#ecc97d' : '#2f6b3a'} />
            ))}
            <rect x="10" y="84" width="80" height="4" fill="#1b120c" />
            <rect x="10" y="94" width="80" height="3" fill="#ecc97d" />
          </g>
        </>
      )
    case 'tee':
      return (
        <>
          <path d={SHOULDERS} fill="#e8e2d4" />
          <path d="M42 70q8 9 16 0" fill="none" stroke="#c9c1ae" strokeWidth="3" strokeLinecap="round" />
        </>
      )
    case 'wrap':
      return (
        <>
          <path d={SHOULDERS} fill={skin} />
          <path d="M14 100C14 88 22 78 38 72L86 100Z" fill="#b83a2a" />
          <path d="M38 72L86 100" stroke="#ecc97d" strokeWidth="2" />
          {[[28, 90], [42, 91], [56, 93], [70, 97], [34, 97]].map(([x, y]) => (
            <circle key={x} cx={x} cy={y} r="1.6" fill="#f3ece0" />
          ))}
        </>
      )
    case 'dashiki':
      return (
        <>
          <path d={SHOULDERS} fill="#d18a2a" />
          <path d="M40 70l10 17 10-17z" fill="#1b120c" />
          <path d="M40 70l10 17 10-17" fill="none" stroke="#ecc97d" strokeWidth="2" strokeLinejoin="round" />
          <path d="M22 90l4-7 4 7zM70 90l4-7 4 7zM32 98l3-5 3 5zM62 98l3-5 3 5z" fill="#2f6b3a" />
          <path d="M26 96l3-5 3 5zM66 96l3-5 3 5z" fill="#c2432a" />
        </>
      )
    case 'boubou':
      return (
        <>
          <path d={SHOULDERS} fill="#2b5d7a" />
          <path d="M36 70c3 16 25 16 28 0" fill="none" stroke="#ecc97d" strokeWidth="3" strokeLinecap="round" />
          <path d="M50 84v16" stroke="#ecc97d" strokeWidth="2" />
          <circle cx="38" cy="92" r="1.7" fill="#ecc97d" />
          <circle cx="62" cy="92" r="1.7" fill="#ecc97d" />
        </>
      )
    case 'hunter':
      return (
        <>
          <path d={SHOULDERS} fill="#6b4a2a" />
          <path d="M22 100l6-24 12-6 4 12-6 18zM78 100l-6-24-12-6-4 12 6 18z" fill="#3a2818" />
          <path d="M30 74l40 26" stroke="#1b120c" strokeWidth="4.5" />
          <rect x="47" y="84" width="6" height="6" rx="1" fill="#ecc97d" />
        </>
      )
    case 'suit':
      return (
        <>
          <path d={SHOULDERS} fill="#22262f" />
          <path d="M42 70l8 16 8-16z" fill="#f3ece0" />
          <path d="M42 70l-6 14M58 70l6 14" stroke="#3a3f4b" strokeWidth="3" strokeLinecap="round" />
          <path d="M48 78h4l2 16-4 4-4-4z" fill="#c2432a" />
        </>
      )
    case 'armor':
      return (
        <>
          <path d={SHOULDERS} fill="#5a5f6a" />
          <ellipse cx="22" cy="82" rx="10" ry="8" fill="#7a808c" />
          <ellipse cx="78" cy="82" rx="10" ry="8" fill="#7a808c" />
          <path d="M38 71h24l-3 26H41z" fill="#6a707c" />
          <path d="M50 71v26" stroke="#4a4f5a" strokeWidth="1.5" />
          <circle cx="43" cy="78" r="1.3" fill="#ecc97d" />
          <circle cx="57" cy="78" r="1.3" fill="#ecc97d" />
        </>
      )
    case 'royal':
      return (
        <>
          <path d={SHOULDERS} fill="#4b2a6b" />
          <path d="M16 86c4-8 10-12 20-14M84 86c-4-8-10-12-20-14" stroke="#ecc97d" strokeWidth="3" fill="none" strokeLinecap="round" />
          <path d="M34 71c4 12 28 12 32 0" fill="none" stroke="#ecc97d" strokeWidth="3.5" strokeLinecap="round" />
          <circle cx="50" cy="84" r="3.6" fill="#c2432a" stroke="#ecc97d" strokeWidth="1.2" />
        </>
      )
    case 'furcape':
      return (
        <>
          <path d={SHOULDERS} fill="#2e1e15" />
          <path d="M16 84c4-14 18-20 34-20s30 6 34 20l-6 4-4-6-5 7-5-7-5 8-5-8-5 8-5-8-5 7-5-7-4 6z" fill="#9aa0ab" />
          <path d="M28 82l3 6 3-7M44 86l3 6 3-7M60 86l3 6 3-7" stroke="#c9ced6" strokeWidth="1.4" fill="none" strokeLinecap="round" />
        </>
      )
    default:
      return (
        <>
          <path d={SHOULDERS} fill="#8a4b2a" />
          <path d="M42 70l8 10 8-10" fill="none" stroke={dark} strokeWidth="3" strokeLinejoin="round" />
        </>
      )
  }
}

function headwearArt(kind: AvatarConfig['head']): ReactNode {
  switch (kind) {
    case 'headband':
      return (
        <>
          <path d="M33 36c5-4 12-6 17-6s12 2 17 6v4c-5-4-12-6-17-6s-12 2-17 6z" fill="#c2432a" />
          <circle cx="42" cy="34" r="1.2" fill="#ecc97d" />
          <circle cx="50" cy="32.5" r="1.2" fill="#ecc97d" />
          <circle cx="58" cy="34" r="1.2" fill="#ecc97d" />
        </>
      )
    case 'cap':
      return (
        <>
          <path d="M33 37c0-11 7-17 17-17s17 6 17 17z" fill="#26324a" />
          <path d="M30 37c6-3 12-4 20-4s14 1 20 4c0 2-5 3.5-20 3.5S30 39 30 37z" fill="#1a2234" />
          <circle cx="50" cy="20.5" r="1.7" fill="#ecc97d" />
        </>
      )
    case 'hat':
      return (
        <>
          <ellipse cx="50" cy="33" rx="27" ry="6" fill="#8a6a3a" />
          <path d="M36 33c0-10 6-15 14-15s14 5 14 15z" fill="#a0784a" />
          <path d="M36 30h28v3.5H36z" fill="#4a3524" />
        </>
      )
    case 'feather':
      return (
        <>
          <path d="M35 33c8-3 22-3 30 0v2.5c-8-3-22-3-30 0z" fill="#4a3524" />
          <g transform="rotate(22 64 26)">
            <ellipse cx="64" cy="19" rx="3.4" ry="11" fill="#e0623f" />
            <path d="M64 9v23" stroke="#ecc97d" strokeWidth="1.2" />
          </g>
        </>
      )
    case 'crown':
      return (
        <>
          <path d="M35 32l4-11 6 7 5-10 5 10 6-7 4 11z" fill="#ecc97d" stroke="#a86a1e" strokeWidth="1" strokeLinejoin="round" />
          <circle cx="50" cy="26" r="1.7" fill="#c2432a" />
          <circle cx="41" cy="28" r="1.2" fill="#2b5d7a" />
          <circle cx="59" cy="28" r="1.2" fill="#2f6b3a" />
        </>
      )
    default:
      return null
  }
}

function faceAccessory(kind: AvatarConfig['acc'], skin: string): ReactNode {
  switch (kind) {
    case 'ring':
      return (
        <>
          <circle cx="33" cy="54" r="3" fill="none" stroke="#ecc97d" strokeWidth="1.8" />
          <circle cx="67" cy="54" r="3" fill="none" stroke="#ecc97d" strokeWidth="1.8" />
        </>
      )
    case 'hoops':
      return (
        <>
          <circle cx="32" cy="58" r="5" fill="none" stroke="#ecc97d" strokeWidth="2" />
          <circle cx="68" cy="58" r="5" fill="none" stroke="#ecc97d" strokeWidth="2" />
        </>
      )
    case 'glasses':
      return (
        <g fill="none" stroke="#1b120c" strokeWidth="1.8">
          <circle cx="43" cy="46" r="5.5" />
          <circle cx="57" cy="46" r="5.5" />
          <path d="M48.5 46h3" />
        </g>
      )
    case 'sunglasses':
      return (
        <>
          <rect x="36" y="42" width="13" height="8.5" rx="3.5" fill="#0d0a08" />
          <rect x="51" y="42" width="13" height="8.5" rx="3.5" fill="#0d0a08" />
          <path d="M49 45.5h2" stroke="#0d0a08" strokeWidth="1.6" />
          <path d="M39 44.5l3 0M54 44.5l3 0" stroke="#5a5f6a" strokeWidth="1.2" strokeLinecap="round" />
        </>
      )
    case 'scar':
      return (
        <>
          <path d="M60 38l7 12" stroke="#761f14" strokeWidth="2" strokeLinecap="round" />
          <path d="M61 44l4-2M63 48l4-2" stroke="#761f14" strokeWidth="1.2" strokeLinecap="round" />
        </>
      )
    case 'freckles':
      return (
        <g fill={shade(skin, -45)}>
          {[[38, 52], [41, 54], [36.5, 55], [59, 54], [62, 52], [63.5, 55]].map(([x, y]) => (
            <circle key={`${x}-${y}`} cx={x} cy={y} r=".9" />
          ))}
        </g>
      )
    case 'beads':
      return (
        <g>
          {[[40, 74, '#c2432a'], [43, 77, '#ecc97d'], [46.5, 78.6, '#2f6b3a'], [50, 79, '#c2432a'], [53.5, 78.6, '#ecc97d'], [57, 77, '#2f6b3a'], [60, 74, '#c2432a']].map(([x, y, c]) => (
            <circle key={`${x}`} cx={x as number} cy={y as number} r="1.9" fill={c as string} />
          ))}
        </g>
      )
    case 'facepaint':
      return (
        <path
          d="M36.5 49l7 2M36 53l8 2M63.5 49l-7 2M64 53l-8 2"
          stroke="#f3ece0"
          strokeWidth="1.9"
          strokeLinecap="round"
        />
      )
    case 'eyepatch':
      return (
        <>
          <path d="M33.5 41L52 44M62 47l5 3" stroke="#1b120c" strokeWidth="1.4" strokeLinecap="round" />
          <circle cx="57.4" cy="46" r="4.8" fill="#1b120c" />
        </>
      )
    default:
      return null
  }
}

function AvatarArt({ config, mood }: { config: AvatarConfig; mood: AvatarMood }) {
  const uid = useId().replace(/[^a-zA-Z0-9]/g, '')
  const skin = SKIN_TONES[config.skin]
  const dark = shade(skin, -28)
  const hair = config.hair === 'braids' ? HAIR_COLOR_BRAIDS : config.hair === 'locs' ? HAIR_COLOR_LOCS : HAIR_COLOR

  const brows =
    mood === 'angry' ? (
      <path d="M38 38l9 3M62 38l-9 3" fill="none" stroke={hair} strokeWidth="2.2" strokeLinecap="round" />
    ) : mood === 'shock' ? (
      <path d="M39 37c2-2 5-2 7-1M54 36c2-1 5-1 7 1" fill="none" stroke={hair} strokeWidth="1.8" strokeLinecap="round" />
    ) : (
      <path d="M39 40c2-2 5-2 7-1M54 39c2-1 5-1 7 1" fill="none" stroke={hair} strokeWidth="1.8" strokeLinecap="round" />
    )
  const eyes =
    mood === 'dead' ? (
      <g stroke="#1b120c" strokeWidth="1.9" strokeLinecap="round">
        <path d="M40.5 43.5l5 5M45.5 43.5l-5 5M54.5 43.5l5 5M59.5 43.5l-5 5" />
      </g>
    ) : mood === 'sleep' ? (
      <g fill="none" stroke="#1b120c" strokeWidth="1.9" strokeLinecap="round">
        <path d="M39.5 46c1.6 2.4 5.4 2.4 7 0M53.5 46c1.6 2.4 5.4 2.4 7 0" />
      </g>
    ) : (
      <>
        <ellipse cx="43" cy="46" rx="3.7" ry="3.1" fill="#f3ece0" />
        <ellipse cx="57" cy="46" rx="3.7" ry="3.1" fill="#f3ece0" />
        <circle cx="43.4" cy="46" r="2.1" fill="#1b120c" />
        <circle cx="57.4" cy="46" r="2.1" fill="#1b120c" />
        <circle cx="44" cy="45.2" r=".7" fill="#fff" />
        <circle cx="58" cy="45.2" r=".7" fill="#fff" />
      </>
    )
  const mouth =
    mood === 'dead' ? (
      <path d="M44 57.5h12" fill="none" stroke="#1b120c" strokeWidth="1.8" strokeLinecap="round" />
    ) : mood === 'talk' ? (
      <ellipse cx="50" cy="57" rx="3.2" ry="2.8" fill="#3b1a12" />
    ) : mood === 'sleep' ? (
      <path d="M45 56.5c3 1.4 7 1.4 10 0" fill="none" stroke="#1b120c" strokeWidth="1.8" strokeLinecap="round" />
    ) : mood === 'angry' ? (
      <path d="M43 58c4-3 10-3 14 0" fill="none" stroke="#1b120c" strokeWidth="1.9" strokeLinecap="round" />
    ) : mood === 'shock' ? (
      <ellipse cx="50" cy="57" rx="3.2" ry="4" fill="#3b1a12" />
    ) : mood === 'grin' ? (
      <path d="M42 55c4 5 12 5 16 0" fill="#fff" stroke="#1b120c" strokeWidth="1.6" strokeLinejoin="round" />
    ) : mood === 'calm' ? (
      <path d="M44 56c4 2 8 2 12 0" fill="none" stroke="#1b120c" strokeWidth="1.8" strokeLinecap="round" />
    ) : (
      <path d="M43 55c4 4 10 4 14 0" fill="none" stroke="#1b120c" strokeWidth="1.8" strokeLinecap="round" />
    )

  return (
    <svg viewBox="0 0 100 100" className="block h-full w-full" aria-hidden="true">
      <rect width="100" height="100" fill={AVATAR_BGS[config.bg]} />
      <circle cx="50" cy="100" r="46" fill="rgba(255,255,255,.06)" />
      {hairBack(config.hair, hair)}
      {outfitArt(config.outfit, skin, dark, uid)}
      <rect x="43" y="58" width="14" height="16" rx="5" fill={dark} />
      <ellipse cx="32.5" cy="47" rx="3.2" ry="5" fill={skin} />
      <ellipse cx="67.5" cy="47" rx="3.2" ry="5" fill={skin} />
      <ellipse cx="50" cy="45" rx="17" ry="20" fill={skin} />
      {hairFront(config.hair, hair)}
      {headwearArt(config.head)}
      {eyes}
      {brows}
      <path d="M50 47c-1 3-1 5 1 6" fill="none" stroke={dark} strokeWidth="1.4" strokeLinecap="round" />
      {mouth}
      {faceAccessory(config.acc, skin)}
    </svg>
  )
}

/**
 * Avatar d'un joueur. Avec une configuration personnalisée (voir migration
 * 0190), dessine le buste en SVG ; sans configuration, retombe sur l'ancien
 * rendu (pastille de couleur avec icône ou initiale) pour que rien ne change
 * pour les joueurs qui n'ont pas encore personnalisé le leur.
 * `className` porte la taille (ex. `h-10 w-10`).
 */
export function Avatar({
  config,
  icon,
  color,
  name,
  className = 'h-10 w-10',
  mood = 'smile',
}: {
  config?: unknown
  icon?: string | null
  color?: string
  name?: string
  className?: string
  mood?: AvatarMood
}) {
  const parsed = parseAvatarConfig(config)
  if (parsed) {
    return (
      <span className={`inline-block shrink-0 overflow-hidden rounded-full ${className}`}>
        <AvatarArt config={parsed} mood={mood} />
      </span>
    )
  }
  return (
    <span
      className={`inline-flex shrink-0 items-center justify-center rounded-full text-xs font-bold text-[#05070d] ${className}`}
      style={{ backgroundColor: color ?? '#334160' }}
    >
      {icon ? <AvatarIcon icon={icon} className="h-1/2 w-1/2" /> : (name ?? '?').slice(0, 1).toUpperCase()}
    </span>
  )
}
