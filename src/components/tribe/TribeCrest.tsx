import { memo, useId, type ReactNode } from 'react'
import { COLOR_HEX } from '../../lib/tribe'

/**
 * Blason dessiné d'une tribu (refonte 2026-11) : un écu héraldique au liseré d'or, une bande tissée en tête, l'emblème
 * dessiné au centre et, en grand format, deux lances croisées derrière l'écu. Tout en SVG (net à toutes les tailles),
 * identifiants uniques par instance (plusieurs blasons sur la même page).
 */

const SHIELD = 'M50 6 C64 12 80 12 92 9 L92 54 C92 84 72 104 50 116 C28 104 8 84 8 54 L8 9 C20 12 36 12 50 6 Z'
const INNER = 'M50 13 C62 18 75 18 85 16 L85 54 C85 79 68 96 50 107 C32 96 15 79 15 54 L15 16 C25 18 38 18 50 13 Z'

// Teinte claire / foncée de l'écu pour chaque couleur de tribu.
function shade(hex: string, amount: number): string {
  const n = parseInt(hex.slice(1), 16)
  const ch = (v: number) => Math.max(0, Math.min(255, Math.round(v + (amount > 0 ? (255 - v) * amount : v * amount))))
  const r = ch((n >> 16) & 255)
  const g = ch((n >> 8) & 255)
  const b = ch(n & 255)
  return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, '0')}`
}

const INK = '#24140a'

/** Les emblèmes : dessinés dans un carré 0-100 centré sur (50, 50), remplis avec `fill` (dégradé crème-or). */
const ART: Record<string, (fill: string) => ReactNode> = {
  lion: (fill) => (
    <g stroke={INK} strokeWidth="1.6" strokeLinejoin="round">
      <polygon
        fill={fill}
        points={Array.from({ length: 36 }, (_, i) => {
          const a = (i / 36) * Math.PI * 2 - Math.PI / 2
          const r = i % 2 === 0 ? 34 : 25
          return `${(50 + Math.cos(a) * r).toFixed(1)},${(50 + Math.sin(a) * r * 1.02).toFixed(1)}`
        }).join(' ')}
      />
      <circle cx="35" cy="31" r="6" fill={fill} />
      <circle cx="65" cy="31" r="6" fill={fill} />
      <path d="M50 26 C64 26 70 38 69 50 C68 64 60 74 50 76 C40 74 32 64 31 50 C30 38 36 26 50 26 Z" fill={fill} />
      <path d="M38 44 L46 46 M62 44 L54 46" fill="none" strokeWidth="2.2" strokeLinecap="round" />
      <ellipse cx="42" cy="49" rx="2.2" ry="2.6" fill={INK} stroke="none" />
      <ellipse cx="58" cy="49" rx="2.2" ry="2.6" fill={INK} stroke="none" />
      <path d="M45 57 L55 57 L50 63 Z" fill={INK} />
      <path d="M50 63 L50 67 M50 67 C47 70 43 70 41 68 M50 67 C53 70 57 70 59 68" fill="none" strokeLinecap="round" />
    </g>
  ),
  wolf: (fill) => (
    <g stroke={INK} strokeWidth="1.6" strokeLinejoin="round">
      <path d="M50 84 L40 70 L28 62 L22 44 L27 18 L41 34 L50 31 L59 34 L73 18 L78 44 L72 62 L60 70 Z" fill={fill} />
      <path d="M30 24 L38 35 L31 40 Z M70 24 L62 35 L69 40 Z" fill={INK} opacity=".55" stroke="none" />
      <path d="M50 84 L42 66 L45 52 L50 49 L55 52 L58 66 Z" fill="#fff7e3" opacity=".75" />
      <path d="M34 46 L45 50 L36 52 Z M66 46 L55 50 L64 52 Z" fill={INK} />
      <circle cx="40" cy="49.5" r="1.3" fill="#f6c453" stroke="none" />
      <circle cx="60" cy="49.5" r="1.3" fill="#f6c453" stroke="none" />
      <path d="M46 70 L54 70 L50 75 Z" fill={INK} />
      <path d="M28 62 L33 66 M72 62 L67 66 M24 52 L29 55 M76 52 L71 55" fill="none" strokeLinecap="round" />
    </g>
  ),
  elephant: (fill) => (
    <g stroke={INK} strokeWidth="1.6" strokeLinejoin="round">
      <path d="M36 30 C18 24 10 36 12 52 C14 66 24 72 36 66 Z" fill={fill} />
      <path d="M64 30 C82 24 90 36 88 52 C86 66 76 72 64 66 Z" fill={fill} />
      <path d="M50 22 C62 22 68 32 67 44 C66 52 60 56 57 58 L57 74 C57 82 62 84 66 81 C68 79 70 81 68 84 C63 90 50 88 50 76 L50 60 C44 58 34 52 33 44 C32 32 38 22 50 22 Z" fill={fill} />
      <path d="M44 58 C40 66 36 70 30 71 M56 58 C60 66 64 70 70 71" fill="none" stroke="#fffaf0" strokeWidth="3.4" strokeLinecap="round" />
      <path d="M44 58 C40 66 36 70 30 71 M56 58 C60 66 64 70 70 71" fill="none" strokeWidth="1" strokeLinecap="round" />
      <circle cx="42" cy="41" r="2.1" fill={INK} stroke="none" />
      <circle cx="58" cy="41" r="2.1" fill={INK} stroke="none" />
      <path d="M50 62 L50 74 M53 66 L53 74" fill="none" strokeWidth="1" opacity=".5" />
    </g>
  ),
  eagle: (fill) => (
    <g stroke={INK} strokeWidth="1.5" strokeLinejoin="round">
      {[1, -1].map((d) => (
        <path
          key={d}
          transform={d === -1 ? 'translate(100 0) scale(-1 1)' : undefined}
          d="M45 44 C36 32 22 24 6 22 L13 30 L6 34 L15 39 L8 45 L18 49 L13 55 L25 57 C34 58 41 55 45 51 Z"
          fill={fill}
        />
      ))}
      <path d="M17 33 L30 38 M14 41 L29 44 M17 49 L31 50" fill="none" strokeWidth="1" opacity=".6" />
      <path d="M83 33 L70 38 M86 41 L71 44 M83 49 L69 50" fill="none" strokeWidth="1" opacity=".6" />
      <path d="M43 68 L50 88 L57 68 Z" fill={fill} />
      <path d="M50 70 L50 86 M46 72 L48 84 M54 72 L52 84" fill="none" strokeWidth="1" opacity=".6" />
      <ellipse cx="50" cy="56" rx="10" ry="16" fill={fill} />
      <path d="M45 52 L50 56 L55 52 M45 60 L50 64 L55 60" fill="none" strokeWidth="1" opacity=".6" />
      <circle cx="50" cy="33" r="9" fill="#fff7e3" />
      <path d="M55 30 L66 33 C66 36 62 38 58 37 L55 37 Z" fill="#f6c453" />
      <circle cx="52.5" cy="31" r="1.6" fill={INK} stroke="none" />
      <path d="M42 72 L38 78 M45 73 L44 80 M58 72 L62 78 M55 73 L56 80" fill="none" strokeWidth="1.8" strokeLinecap="round" />
    </g>
  ),
  panther: (fill) => (
    <g stroke={INK} strokeWidth="1.6" strokeLinejoin="round">
      <circle cx="32" cy="28" r="7" fill={fill} />
      <circle cx="68" cy="28" r="7" fill={fill} />
      <circle cx="32" cy="28" r="3" fill={INK} stroke="none" opacity=".5" />
      <circle cx="68" cy="28" r="3" fill={INK} stroke="none" opacity=".5" />
      <path d="M50 22 C67 22 76 35 75 50 C74 65 63 78 50 80 C37 78 26 65 25 50 C24 35 33 22 50 22 Z" fill={fill} />
      {[
        [38, 30], [46, 27], [56, 28], [63, 32], [32, 40], [68, 41], [30, 54], [70, 55], [42, 34], [58, 35],
      ].map(([x, y], i) => (
        <circle key={i} cx={x} cy={y} r="1.7" fill={INK} stroke="none" opacity=".7" />
      ))}
      <ellipse cx="50" cy="63" rx="12" ry="9" fill="#fff7e3" opacity=".85" />
      <path d="M33 45 C37 41 43 42 46 47 C42 49 37 49 33 45 Z M67 45 C63 41 57 42 54 47 C58 49 63 49 67 45 Z" fill="#9bd35a" />
      <path d="M40 43.5 L40 48 M60 43.5 L60 48" strokeWidth="1.8" strokeLinecap="round" />
      <path d="M45 58 L55 58 L50 63 Z" fill={INK} />
      <path d="M50 63 L50 66 C47 69 44 69 42 67 M50 66 C53 69 56 69 58 67" fill="none" strokeLinecap="round" />
      <path d="M40 64 L30 62 M40 66 L31 67 M60 64 L70 62 M60 66 L69 67" fill="none" strokeWidth="1" />
    </g>
  ),
  crocodile: (fill) => (
    <g stroke={INK} strokeWidth="1.5" strokeLinejoin="round">
      {/* Gueule ouverte, de profil : mâchoire haute, mâchoire basse, crocs. */}
      <path d="M12 52 C12 40 22 32 36 32 C44 32 48 36 54 38 L88 42 C92 43 92 48 88 49 L52 51 Z" fill={fill} />
      <path d="M12 56 L52 56 L86 64 C90 65 89 70 85 70 L40 72 C24 72 12 66 12 56 Z" fill={fill} />
      <path d="M12 52 L52 51 L52 56 L12 56 Z" fill="#7a1f12" />
      {[58, 64, 70, 76, 82].map((x) => (
        <path key={`u${x}`} d={`M${x} ${44 + (x - 58) * 0.08} l2 5 l2 -5`} fill="#fffaf0" strokeWidth="1" />
      ))}
      {[56, 62, 68, 74].map((x) => (
        <path key={`l${x}`} d={`M${x} ${61 + (x - 56) * 0.2} l2 -5 l2 5`} fill="#fffaf0" strokeWidth="1" />
      ))}
      <path d="M30 32 C30 24 42 24 42 32" fill={fill} />
      <circle cx="36" cy="30" r="2.4" fill="#f6c453" />
      <path d="M36 28 L36 32" strokeWidth="1.2" />
      {[20, 28, 46].map((x) => (
        <path key={x} d={`M${x} ${x < 30 ? 38 : 36} l3 -4 l3 4`} fill={fill} strokeWidth="1" />
      ))}
      <path d="M18 64 L26 64 M30 66 L38 66" fill="none" strokeWidth="1" opacity=".6" />
    </g>
  ),
  buffalo: (fill) => (
    <g stroke={INK} strokeWidth="1.6" strokeLinejoin="round">
      {[1, -1].map((d) => (
        <path
          key={d}
          transform={d === -1 ? 'translate(100 0) scale(-1 1)' : undefined}
          d="M46 32 C36 24 22 22 12 30 C6 36 6 46 12 50 C14 44 18 38 26 36 C32 35 38 37 42 40 Z"
          fill="#fff4d0"
        />
      ))}
      <path d="M36 30 C42 24 58 24 64 30 C60 34 40 34 36 30 Z" fill="#c99a45" />
      <path d="M30 46 C22 44 18 50 22 54 C26 56 32 54 34 50 Z M70 46 C78 44 82 50 78 54 C74 56 68 54 66 50 Z" fill={fill} />
      <path d="M36 34 C42 32 58 32 64 34 L66 58 C66 70 60 82 50 84 C40 82 34 70 34 58 Z" fill={fill} />
      <path d="M38 46 L46 48 M62 46 L54 48" fill="none" strokeWidth="2" strokeLinecap="round" />
      <circle cx="43" cy="51" r="2" fill={INK} stroke="none" />
      <circle cx="57" cy="51" r="2" fill={INK} stroke="none" />
      <ellipse cx="50" cy="74" rx="11" ry="8" fill="#fff7e3" opacity=".8" />
      <ellipse cx="45" cy="74" rx="2.2" ry="3" fill={INK} stroke="none" />
      <ellipse cx="55" cy="74" rx="2.2" ry="3" fill={INK} stroke="none" />
    </g>
  ),
  scorpion: (fill) => (
    <g stroke={INK} strokeWidth="1.5" strokeLinejoin="round" strokeLinecap="round">
      {/* Pattes */}
      {[0, 1, 2, 3].map((i) => (
        <g key={i}>
          <path d={`M44 ${46 + i * 6} L${32 - i} ${42 + i * 8} L${26 - i * 2} ${48 + i * 9}`} fill="none" strokeWidth="2.4" />
          <path d={`M56 ${46 + i * 6} L${68 + i} ${42 + i * 8} L${74 + i * 2} ${48 + i * 9}`} fill="none" strokeWidth="2.4" />
        </g>
      ))}
      {/* Pinces */}
      <path d="M45 38 L36 30 L30 22" fill="none" strokeWidth="3.4" />
      <path d="M55 38 L64 30 L70 22" fill="none" strokeWidth="3.4" />
      <path d="M30 22 C22 20 18 12 24 8 C24 14 28 16 32 15 C34 12 38 12 38 16 C36 20 33 22 30 22 Z" fill={fill} />
      <path d="M70 22 C78 20 82 12 76 8 C76 14 72 16 68 15 C66 12 62 12 62 16 C64 20 67 22 70 22 Z" fill={fill} />
      <ellipse cx="50" cy="40" rx="7" ry="6" fill={fill} />
      <ellipse cx="50" cy="56" rx="9" ry="13" fill={fill} />
      <path d="M42 52 H58 M42 58 H58 M43 64 H57" fill="none" strokeWidth="1" opacity=".6" />
      {/* Queue recourbée et dard */}
      {[[50, 72, 4.6], [53, 79, 4.4], [59, 84, 4.2], [66, 84, 4], [71, 79, 3.8]].map(([x, y, r], i) => (
        <circle key={i} cx={x} cy={y} r={r} fill={fill} />
      ))}
      <path d="M72 75 C74 68 72 64 68 63 C70 67 69 71 67 74 Z" fill="#7a1f12" />
      <circle cx="47.5" cy="38.5" r="1.1" fill={INK} stroke="none" />
      <circle cx="52.5" cy="38.5" r="1.1" fill={INK} stroke="none" />
    </g>
  ),
  snake: (fill) => {
    // Corps en S : un trait épais d'encre, puis le même trait plus fin rempli (contour net à toutes les tailles).
    const body = 'M18 84 C34 92 72 92 76 78 C80 64 58 62 46 58 C32 53 28 42 36 34 C42 28 52 30 58 24'
    return (
      <g strokeLinejoin="round" strokeLinecap="round">
        <path d={body} fill="none" stroke={INK} strokeWidth="14" />
        <path d={body} fill="none" stroke={fill} strokeWidth="10.5" />
        <path d="M22 84 C36 89 66 89 72 79 M42 55 C33 50 31 42 37 36" fill="none" stroke={INK} strokeWidth="1" opacity=".45" strokeDasharray="2 3" />
        <path d="M54 26 C56 17 66 13 73 17 C79 21 77 30 70 32 C64 34 58 32 54 26 Z" fill={fill} stroke={INK} strokeWidth="1.6" />
        <circle cx="68" cy="21.5" r="2" fill="#9bd35a" stroke={INK} strokeWidth="1" />
        <path d="M68 20 L68 23" stroke={INK} strokeWidth="1" />
        <path d="M76 27 L84 29 L87 26 M84 29 L87 32" fill="none" stroke="#c0392b" strokeWidth="1.6" />
      </g>
    )
  },
  baobab: (fill) => (
    <g stroke={INK} strokeWidth="1.6" strokeLinejoin="round" strokeLinecap="round">
      <path d="M46 48 L36 34 M46 48 L42 28 M54 48 L64 34 M54 48 L58 28 M50 48 L50 26" fill="none" stroke="#7a4a22" strokeWidth="4" />
      <path d="M46 48 L36 34 M46 48 L42 28 M54 48 L64 34 M54 48 L58 28 M50 48 L50 26" fill="none" strokeWidth="1" opacity=".5" />
      {[[30, 30, 9], [41, 21, 9], [50, 18, 8], [59, 21, 9], [70, 30, 9]].map(([x, y, r], i) => (
        <circle key={i} cx={x} cy={y} r={r} fill="#9bd35a" />
      ))}
      <path d="M40 86 C36 72 38 58 44 46 L56 46 C62 58 64 72 60 86 Z" fill={fill} />
      <path d="M46 54 C44 64 44 74 46 82 M54 54 C56 64 56 74 54 82" fill="none" strokeWidth="1" opacity=".55" />
      <path d="M40 86 C34 86 30 88 26 90 M60 86 C66 86 70 88 74 90 M44 86 L42 91 M56 86 L58 91" fill="none" strokeWidth="1.6" />
      <path d="M18 90 H82" fill="none" strokeWidth="1.4" opacity=".6" />
    </g>
  ),
  // Anciens emblèmes (choisis par des tribus existantes) : redessinés dans le même style, plus proposés au choix.
  globe: (fill) => (
    <g stroke={INK} strokeWidth="1.5" strokeLinejoin="round">
      <circle cx="50" cy="52" r="32" fill="#7fb3d6" />
      <path d="M44 26 C52 24 60 28 62 34 C66 36 70 40 68 46 C66 52 62 54 62 60 C62 68 56 76 52 80 C50 74 48 68 46 64 C42 60 40 56 40 52 C34 52 30 48 32 42 C34 36 38 30 44 26 Z" fill={fill} />
      <path d="M18 52 H82 M50 20 C38 32 38 72 50 84 M50 20 C62 32 62 72 50 84" fill="none" strokeWidth="1" opacity=".45" />
    </g>
  ),
  fire: (fill) => (
    <g stroke={INK} strokeWidth="1.6" strokeLinejoin="round">
      <path d="M50 12 C58 26 72 34 72 56 C72 72 62 84 50 84 C38 84 28 72 28 56 C28 44 34 38 38 30 C40 38 42 42 46 44 C46 32 46 22 50 12 Z" fill="#e8742c" />
      <path d="M50 34 C56 44 64 50 64 62 C64 72 58 78 50 78 C42 78 36 72 36 62 C36 54 40 50 44 46 C46 52 48 54 50 54 C50 46 48 40 50 34 Z" fill={fill} />
      <path d="M50 56 C54 62 56 66 56 70 C56 74 53 76 50 76 C47 76 44 74 44 70 C44 66 47 62 50 56 Z" fill="#fffaf0" />
    </g>
  ),
  moon: (fill) => (
    <g stroke={INK} strokeWidth="1.6" strokeLinejoin="round">
      <path d="M60 16 C40 18 26 34 26 52 C26 70 40 86 60 88 C46 80 38 68 38 52 C38 36 46 24 60 16 Z" fill={fill} />
      {[[66, 34, 5], [74, 54, 4], [62, 70, 3.4]].map(([x, y, r], i) => (
        <path key={i} d={`M${x} ${y - r * 1.6} L${x + r * 0.45} ${y - r * 0.45} L${x + r * 1.6} ${y} L${x + r * 0.45} ${y + r * 0.45} L${x} ${y + r * 1.6} L${x - r * 0.45} ${y + r * 0.45} L${x - r * 1.6} ${y} L${x - r * 0.45} ${y - r * 0.45} Z`} fill="#fff7e3" />
      ))}
    </g>
  ),
  star: (fill) => (
    <g stroke={INK} strokeWidth="1.6" strokeLinejoin="round">
      <polygon
        fill={fill}
        points={Array.from({ length: 10 }, (_, i) => {
          const a = (i / 10) * Math.PI * 2 - Math.PI / 2
          const r = i % 2 === 0 ? 36 : 15
          return `${(50 + Math.cos(a) * r).toFixed(1)},${(53 + Math.sin(a) * r).toFixed(1)}`
        }).join(' ')}
      />
      <circle cx="50" cy="53" r="6" fill="#fff7e3" />
    </g>
  ),
  sunrise: (fill) => (
    <g stroke={INK} strokeWidth="1.6" strokeLinejoin="round" strokeLinecap="round">
      {Array.from({ length: 9 }, (_, i) => {
        const a = Math.PI + (i / 8) * Math.PI
        return <path key={i} d={`M${50 + Math.cos(a) * 24} ${60 + Math.sin(a) * 24} L${50 + Math.cos(a) * 36} ${60 + Math.sin(a) * 36}`} fill="none" stroke="#f6c453" strokeWidth="3.4" />
      })}
      <path d="M30 60 C30 48 39 40 50 40 C61 40 70 48 70 60 Z" fill={fill} />
      <path d="M12 60 H88" fill="none" strokeWidth="2" />
      <path d="M20 68 C28 64 36 72 44 68 C52 64 60 72 68 68 C74 65 78 67 80 68 M26 76 C34 72 42 80 50 76 C58 72 66 80 74 76" fill="none" stroke="#7fb3d6" strokeWidth="2.4" />
    </g>
  ),
  shield: (fill) => (
    <g stroke={INK} strokeWidth="1.6" strokeLinejoin="round">
      {/* Bouclier ovale en peau, sur une lance. */}
      <path d="M50 8 L50 92" stroke="#7a4a22" strokeWidth="3.4" />
      <path d="M50 4 C54 10 54 14 50 18 C46 14 46 10 50 4 Z" fill="#e4e7ec" />
      <ellipse cx="50" cy="52" rx="20" ry="32" fill={fill} />
      <path d="M50 22 L50 82" strokeWidth="5" stroke="#7a1f12" />
      {[30, 42, 54, 66, 76].map((y) => (
        <path key={y} d={`M44 ${y} L56 ${y + 4}`} fill="none" stroke="#fffaf0" strokeWidth="1.6" />
      ))}
      <ellipse cx="38" cy="40" rx="4" ry="6" fill={INK} opacity=".35" stroke="none" />
      <ellipse cx="62" cy="64" rx="4" ry="6" fill={INK} opacity=".35" stroke="none" />
    </g>
  ),
}

/** Emblèmes proposés au choix (création, modification), dans cet ordre. Les anciens restent affichables. */
export const CREST_CHOICES = ['lion', 'wolf', 'elephant', 'eagle', 'panther', 'crocodile', 'buffalo', 'scorpion', 'snake', 'baobab'] as const

/** Motif tissé (chevrons et points) de la bande en tête de l'écu. */
function WovenBand({ id }: { id: string }) {
  return (
    <>
      <pattern id={`${id}-weave`} width="10" height="10" patternUnits="userSpaceOnUse">
        <path d="M0 7 L5 2 L10 7" fill="none" stroke="#000" strokeOpacity=".28" strokeWidth="1.6" />
        <circle cx="5" cy="8.6" r=".9" fill="#fff" fillOpacity=".35" />
      </pattern>
    </>
  )
}

function Spears() {
  return (
    <g stroke={INK} strokeWidth="1.4" strokeLinejoin="round">
      {[-1, 1].map((dir) => (
        <g key={dir} transform={`rotate(${dir * 38} 50 62)`}>
          <rect x="48" y="-10" width="4" height="140" rx="1.8" fill="#7a4a22" />
          <path d="M50 -30 C57 -17 57 -6 50 -1 C43 -6 43 -17 50 -30 Z" fill="#e4e7ec" />
          <path d="M50 -27 L50 -3" stroke="#9aa3ad" strokeWidth=".8" />
          <rect x="45.5" y="-2" width="9" height="4" rx="1.2" fill="#c8932f" />
          <path d="M46 118 L50 128 L54 118 Z" fill="#c8932f" />
        </g>
      ))}
    </g>
  )
}

export const TribeCrest = memo(function TribeCrest({
  emblem,
  color,
  className = 'h-12 w-12',
  spears,
}: {
  emblem: string
  color: string
  className?: string
  /** Lances croisées derrière l'écu : pour les grands formats seulement (illisible en petit). */
  spears?: boolean
}) {
  const uid = useId().replace(/:/g, '')
  const base = color === 'amber' ? shade(COLOR_HEX.amber, -0.25) : (COLOR_HEX[color] ?? COLOR_HEX.amber)
  const art = ART[emblem] ?? ART.lion
  const vb = spears ? '-30 -26 160 168' : '0 0 100 122'
  return (
    <svg viewBox={vb} className={`shrink-0 ${className}`} aria-hidden="true" style={{ overflow: 'visible' }}>
      <defs>
        <linearGradient id={`${uid}-field`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={shade(base, 0.25)} />
          <stop offset=".55" stopColor={base} />
          <stop offset="1" stopColor={shade(base, -0.45)} />
        </linearGradient>
        <linearGradient id={`${uid}-gold`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#fff0b8" />
          <stop offset=".35" stopColor="#e7b54a" />
          <stop offset=".7" stopColor="#a8701c" />
          <stop offset="1" stopColor="#f3d27a" />
        </linearGradient>
        <linearGradient id={`${uid}-art`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#fff4d0" />
          <stop offset="1" stopColor="#e2ae4c" />
        </linearGradient>
        <radialGradient id={`${uid}-medal`} cx=".5" cy=".38" r=".7">
          <stop offset="0" stopColor={shade(base, -0.35)} />
          <stop offset="1" stopColor={shade(base, -0.78)} />
        </radialGradient>
        <radialGradient id={`${uid}-glow`} cx=".5" cy=".42" r=".55">
          <stop offset="0" stopColor="#fff" stopOpacity=".28" />
          <stop offset="1" stopColor="#fff" stopOpacity="0" />
        </radialGradient>
        <clipPath id={`${uid}-clip`}>
          <path d={INNER} />
        </clipPath>
        <WovenBand id={uid} />
      </defs>

      {spears && <Spears />}
      {/* Ombre portée, liseré d'or, puis le champ coloré. */}
      <path d={SHIELD} fill="#000" opacity=".35" transform="translate(0 3)" />
      <path d={SHIELD} fill={`url(#${uid}-gold)`} stroke={INK} strokeWidth="1.6" />
      <path d={INNER} fill={`url(#${uid}-field)`} stroke={INK} strokeWidth="1.2" />
      <g clipPath={`url(#${uid}-clip)`}>
        <rect x="0" y="0" width="100" height="122" fill={`url(#${uid}-glow)`} />
        <rect x="0" y="10" width="100" height="16" fill={shade(base, -0.35)} />
        <rect x="0" y="10" width="100" height="16" fill={`url(#${uid}-weave)`} />
        <path d="M0 26 H100" stroke={`url(#${uid}-gold)`} strokeWidth="1.6" />
      </g>
      {/* Médaillon sombre cerclé d'or : l'emblème reste lisible sur toutes les couleurs et en petit format. */}
      <circle cx="50" cy="62" r="31" fill={`url(#${uid}-gold)`} stroke={INK} strokeWidth="1.2" />
      <circle cx="50" cy="62" r="27" fill={`url(#${uid}-medal)`} stroke={INK} strokeWidth="1" />
      <g transform="translate(19.5 31.5) scale(.61)">{art(`url(#${uid}-art)`)}</g>
    </svg>
  )
})
