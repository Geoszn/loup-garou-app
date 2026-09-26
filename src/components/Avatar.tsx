import { useId, type ReactNode } from 'react'
import { AvatarIcon } from './AvatarIcon'
import {
  AVATAR_BGS,
  SKIN_TONES,
  isAvatarConfig,
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

function AvatarArt({ config, mood }: { config: AvatarConfig; mood: AvatarMood }) {
  const uid = useId().replace(/[^a-zA-Z0-9]/g, '')
  const skin = SKIN_TONES[config.skin]
  const dark = shade(skin, -28)
  const hair = config.hair === 'braids' ? HAIR_COLOR_BRAIDS : config.hair === 'locs' ? HAIR_COLOR_LOCS : HAIR_COLOR

  let back: ReactNode = null
  if (config.hair === 'afro') back = <circle cx="50" cy="38" r="27" fill={hair} />
  if (config.hair === 'braids') back = <path d="M26 40c0-20 10-27 24-27s24 7 24 27v16H26z" fill={hair} />
  if (config.hair === 'locs') back = <path d="M25 40c0-19 10-26 25-26s25 7 25 26v22H25z" fill={hair} />
  if (config.hair === 'bun') back = <circle cx="50" cy="20" r="9" fill={hair} />

  let front: ReactNode = null
  if (config.hair === 'fade') front = <path d="M32 40c0-13 8-19 18-19s18 6 18 19c-3-6-9-9-18-9s-15 3-18 9z" fill={hair} />
  if (config.hair === 'afro') front = <path d="M32 42c1-8 8-12 18-12s17 4 18 12c-4-5-10-7-18-7s-14 2-18 7z" fill={hair} />
  if (config.hair === 'braids')
    front = (
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
  if (config.hair === 'locs')
    front = (
      <>
        <path d="M31 42c0-12 8-17 19-17s19 5 19 17c-4-5-10-8-19-8s-15 3-19 8z" fill={hair} />
        {[28, 34, 66, 72].map((x) => (
          <path key={x} d={`M${x} 44v26`} stroke={hair} strokeWidth="6" strokeLinecap="round" />
        ))}
      </>
    )
  if (config.hair === 'bun') front = <path d="M32 42c0-12 8-18 18-18s18 6 18 18c-4-6-10-9-18-9s-14 3-18 9z" fill={hair} />
  if (config.hair === 'gele')
    front = (
      <>
        <path d="M27 40c-2-16 8-27 24-26 14 1 23 10 22 26-5-7-12-9-23-9s-17 2-23 9z" fill="#c2432a" />
        <path d="M31 32c8-6 20-8 36-2M34 26c8-4 18-5 30 0" stroke="#e0623f" strokeWidth="2.4" fill="none" strokeLinecap="round" />
        <path d="M63 18c8-6 16-2 14 6-6-2-10-2-14-6z" fill="#ecc97d" />
      </>
    )

  const shoulders = 'M14 100c0-22 16-30 36-30s36 8 36 30z'
  let outfit: ReactNode
  if (config.outfit === 'hood')
    outfit = (
      <>
        <path d={shoulders} fill="#4a3524" />
        <path d="M28 70l-6-16 12 6M72 70l6-16-12 6" fill="#4a3524" />
        <path d="M36 100c0-14 6-22 14-22s14 8 14 22z" fill="#2e1e15" />
      </>
    )
  else if (config.outfit === 'cloak')
    outfit = (
      <>
        <path d={shoulders} fill="#26324a" />
        <path d="M40 72l10 14 10-14" fill="none" stroke="#ecc97d" strokeWidth="2.5" strokeLinejoin="round" />
        <circle cx="50" cy="86" r="3" fill="#ecc97d" />
      </>
    )
  else if (config.outfit === 'kente')
    outfit = (
      <>
        <clipPath id={`${uid}k`}>
          <path d={shoulders} />
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
  else
    outfit = (
      <>
        <path d={shoulders} fill="#8a4b2a" />
        <path d="M42 70l8 10 8-10" fill="none" stroke={dark} strokeWidth="3" strokeLinejoin="round" />
      </>
    )

  let acc: ReactNode = null
  if (config.acc === 'ring')
    acc = (
      <>
        <circle cx="33" cy="54" r="3" fill="none" stroke="#ecc97d" strokeWidth="1.8" />
        <circle cx="67" cy="54" r="3" fill="none" stroke="#ecc97d" strokeWidth="1.8" />
      </>
    )
  if (config.acc === 'glasses')
    acc = (
      <g fill="none" stroke="#1b120c" strokeWidth="1.8">
        <circle cx="43" cy="46" r="5.5" />
        <circle cx="57" cy="46" r="5.5" />
        <path d="M48.5 46h3" />
      </g>
    )
  if (config.acc === 'scar')
    acc = (
      <>
        <path d="M60 38l7 12" stroke="#761f14" strokeWidth="2" strokeLinecap="round" />
        <path d="M61 44l4-2M63 48l4-2" stroke="#761f14" strokeWidth="1.2" strokeLinecap="round" />
      </>
    )

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
      {back}
      {outfit}
      <rect x="43" y="58" width="14" height="16" rx="5" fill={dark} />
      <ellipse cx="32.5" cy="47" rx="3.2" ry="5" fill={skin} />
      <ellipse cx="67.5" cy="47" rx="3.2" ry="5" fill={skin} />
      <ellipse cx="50" cy="45" rx="17" ry="20" fill={skin} />
      {front}
      {eyes}
      {brows}
      <path d="M50 47c-1 3-1 5 1 6" fill="none" stroke={dark} strokeWidth="1.4" strokeLinecap="round" />
      {mouth}
      {acc}
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
  if (isAvatarConfig(config)) {
    return (
      <span className={`inline-block shrink-0 overflow-hidden rounded-full ${className}`}>
        <AvatarArt config={config} mood={mood} />
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
