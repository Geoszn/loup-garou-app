import { useEffect, useMemo, useRef, useState } from 'react'
import { useLanguage } from '../../i18n/LanguageContext'
import { COLOR_HEX, emblemIcon, type TribeInfo, type TribeMember } from '../../lib/tribe'
import { Avatar } from '../Avatar'

// Ombre d'une teinte (même principe que shade() dans AvatarArt) pour le contour
// et les ombres du toit.
function darker(hex: string, amt: number): string {
  const n = parseInt(hex.slice(1), 16)
  const c = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => Math.max(0, Math.min(255, v + amt)))
  return '#' + c.map((v) => v.toString(16).padStart(2, '0')).join('')
}

/** Une maison du village : toit à la couleur de la tribu, fenêtres allumées si le
 * membre est en ligne (et fumée de cheminée), drapeau pour le chef, étoile pour
 * un sous-chef. L'avatar du membre se tient dans l'embrasure de la porte. */
function House({ roof, online, role }: { roof: string; online: boolean; role: TribeMember['role'] }) {
  const roofDark = darker(roof, -55)
  const roofLight = darker(roof, 38)
  const win = online ? '#ffcf6b' : '#171327'
  return (
    <svg viewBox="0 0 80 78" className="block h-auto w-full overflow-visible" aria-hidden="true">
      <ellipse cx="40" cy="73" rx="30" ry="4" fill="#000" opacity=".35" />
      {/* cheminée + fumée */}
      <rect x="53" y="12" width="9" height="16" fill="#241c3c" stroke="#0a0817" strokeWidth=".8" />
      {online &&
        [0, 1, 2].map((i) => (
          <circle key={i} cx="57.5" cy="12" r="3" fill="#cfc9e0" className="tribe-anim" style={{ animation: `tribe-smoke 3.2s ease-out ${i * 1.05}s infinite`, opacity: 0 }} />
        ))}
      {/* murs */}
      <rect x="12" y="34" width="56" height="37" fill="#2c2347" stroke="#0a0817" strokeWidth="1.2" />
      <path d="M12 44h56M12 54h56M12 63h56" stroke="#0a0817" strokeWidth=".5" opacity=".45" />
      {/* fenêtres */}
      <rect x="18" y="42" width="11" height="11" rx="1.5" fill={win} stroke="#0a0817" strokeWidth=".8" />
      <rect x="51" y="42" width="11" height="11" rx="1.5" fill={win} stroke="#0a0817" strokeWidth=".8" />
      {online && (
        <>
          <circle cx="23.5" cy="47.5" r="9" fill="#ffcf6b" opacity=".28" className="tribe-anim" style={{ animation: 'tribe-glow 2.6s ease-in-out infinite' }} />
          <circle cx="56.5" cy="47.5" r="9" fill="#ffcf6b" opacity=".28" className="tribe-anim" style={{ animation: 'tribe-glow 2.6s ease-in-out .7s infinite' }} />
        </>
      )}
      {/* porte */}
      <path d="M33 71V56a7 7 0 0 1 14 0v15z" fill="#120d20" stroke="#0a0817" strokeWidth=".9" />
      {/* toit */}
      <path d="M4 37L40 8l36 29z" fill={roof} stroke={roofDark} strokeWidth="1.6" strokeLinejoin="round" />
      <path d="M12 35L40 12l8 6.5" fill="none" stroke={roofLight} strokeWidth="1.4" strokeLinecap="round" opacity=".7" />
      <path d="M4 37h72" stroke={roofDark} strokeWidth="2" strokeLinecap="round" />
      {/* marque du rôle */}
      {role === 'chef' && (
        <g>
          <path d="M40 8V-8" stroke="#e8dcc4" strokeWidth="1.4" strokeLinecap="round" />
          <path d="M40.6 -8h16l-4 5 4 5h-16z" fill="#f0c75a" stroke="#0a0817" strokeWidth=".8" strokeLinejoin="round" />
        </g>
      )}
      {role === 'sous_chef' && <path d="M40 -3l2.3 4.8 5.3.7-3.9 3.7 1 5.2-4.7-2.6-4.7 2.6 1-5.2-3.9-3.7 5.3-.7z" fill="#7ec8ff" stroke="#0a0817" strokeWidth=".7" strokeLinejoin="round" />}
    </svg>
  )
}

/** Feu de camp au centre du village. */
function Campfire() {
  return (
    <svg viewBox="0 0 60 56" className="h-14 w-14 overflow-visible" aria-hidden="true">
      <circle cx="30" cy="34" r="26" fill="#ff9a3a" opacity=".16" className="tribe-anim" style={{ animation: 'tribe-glow 2.2s ease-in-out infinite' }} />
      <path d="M12 50l36-9M48 50L12 41" stroke="#4a2f1a" strokeWidth="5" strokeLinecap="round" />
      <path d="M12 50l36-9M48 50L12 41" stroke="#7a4e2a" strokeWidth="2" strokeLinecap="round" />
      <g className="tribe-anim" style={{ transformOrigin: '30px 42px', animation: 'tribe-flame 0.9s ease-in-out infinite' }}>
        <path d="M30 8c6 9 12 13 12 22a12 12 0 0 1-24 0c0-6 4-9 6-14 2 3 3 4 5 4-1-4-1-8 1-12z" fill="#ff7a2a" />
        <path d="M30 22c3 5 7 8 7 14a7 7 0 0 1-14 0c0-4 3-6 4-9 1 2 2 3 3 3-1-3-1-5 0-8z" fill="#ffd05a" />
      </g>
      {[0, 1, 2].map((i) => (
        <circle key={i} cx={24 + i * 6} cy="30" r="1.4" fill="#ffe08a" className="tribe-anim" style={{ animation: `tribe-spark 2.4s ease-out ${i * 0.8}s infinite` }} />
      ))}
    </svg>
  )
}

/**
 * Le village de la tribu : une maison par membre, toutes proches autour d'un feu
 * de camp, avec le nom de chacun. À l'ouverture les maisons apparaissent l'une
 * après l'autre ; un nouveau membre voit sa maison surgir avec des étincelles
 * et son nom brille un moment. Toucher une maison ouvre la fiche du membre.
 */
export function VillageView({
  tribe,
  members,
  onlineIds,
  selfId,
  onSelect,
}: {
  tribe: TribeInfo
  members: TribeMember[]
  onlineIds: Set<string>
  selfId: string | undefined
  onSelect: (m: TribeMember) => void
}) {
  const { t } = useLanguage()
  const roof = COLOR_HEX[tribe.color] ?? COLOR_HEX.amber
  const known = useRef<Set<string> | null>(null)
  const [fresh, setFresh] = useState<Set<string>>(new Set())

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

  // Le chef au premier plan, puis les sous-chefs, puis les membres par ancienneté
  // (l'ordre vient déjà du serveur).
  const ordered = useMemo(() => members, [members])
  const onlineCount = ordered.filter((m) => onlineIds.has(m.user_id)).length

  return (
    <div
      className="relative overflow-hidden rounded-3xl border border-white/10"
      style={{ background: 'linear-gradient(180deg, #070918 0%, #1a1535 38%, #2a1d34 70%, #0f0b1c 100%)' }}
    >
      {/* ciel : lune et étoiles */}
      <div className="pointer-events-none absolute right-5 top-4 h-9 w-9 rounded-full bg-[#fff4d2] shadow-[0_0_28px_8px_rgba(255,244,210,0.35)]" aria-hidden="true" />
      {Array.from({ length: 24 }).map((_, k) => (
        <span
          key={k}
          aria-hidden="true"
          className="village-twinkle pointer-events-none absolute rounded-full bg-white"
          style={{ left: `${(k * 37 + 11) % 96}%`, top: `${(k * 53) % 22}%`, width: k % 5 === 0 ? 2.5 : 1.5, height: k % 5 === 0 ? 2.5 : 1.5, animationDelay: `${(k % 7) * 0.4}s` }}
        />
      ))}

      <div className="relative flex flex-col items-center gap-1 px-3 pb-2 pt-5">
        <span className="text-[10px] font-semibold uppercase tracking-[0.22em] text-moon-300/80">
          {emblemIcon(tribe.emblem)} {t('tribe.village.title')}
        </span>
        <Campfire />
        <p className="text-[11px] text-moon-200/55">
          {t('tribe.village.counter', { online: onlineCount, total: ordered.length })}
        </p>
      </div>

      <ul className="relative grid grid-cols-4 gap-x-1 gap-y-4 px-2 pb-6 pt-3 sm:grid-cols-5">
        {ordered.map((m, i) => {
          const online = onlineIds.has(m.user_id)
          const isNew = fresh.has(m.user_id)
          const big = m.role === 'chef'
          return (
            <li key={m.user_id} className="flex justify-center">
              <button
                type="button"
                onClick={() => onSelect(m)}
                aria-label={m.username}
                className="tribe-house-in group relative flex w-full flex-col items-center focus:outline-none"
                style={{ animationDelay: `${Math.min(i, 29) * 55}ms` }}
              >
                {isNew && (
                  <>
                    {[0, 1, 2, 3, 4].map((s) => (
                      <span key={s} aria-hidden="true" className="tribe-anim pointer-events-none absolute top-6 text-sm" style={{ left: `${18 + s * 16}%`, animation: `tribe-spark 1.6s ease-out ${s * 0.18}s infinite` }}>
                        ✨
                      </span>
                    ))}
                  </>
                )}
                <div className={`relative w-full transition-transform group-active:scale-95 group-focus-visible:ring-2 group-focus-visible:ring-moon-400 ${big ? 'scale-[1.08]' : ''}`}>
                  <House roof={roof} online={online} role={m.role} />
                  <Avatar
                    config={m.avatar_config}
                    icon={m.avatar_icon}
                    name={m.username}
                    className={`absolute bottom-[3%] left-1/2 h-[34%] w-[34%] -translate-x-1/2 ring-2 ${online ? 'ring-emerald-400/80' : 'ring-night-950'} ${isNew ? 'tribe-anim' : ''}`}
                  />
                  {m.muted && <span className="absolute right-[6%] top-[46%] text-[10px]" aria-hidden="true">🔇</span>}
                </div>
                <span
                  className={`mt-0.5 flex max-w-full items-center gap-1 rounded-md px-1.5 py-px text-[10.5px] font-semibold ${isNew ? 'tribe-anim bg-amber-300/20 text-amber-200' : 'text-moon-200/85'}`}
                  style={isNew ? { animation: 'tribe-welcome 1.6s ease-in-out infinite' } : undefined}
                >
                  <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${online ? 'bg-emerald-400' : 'bg-night-500'}`} />
                  <span className="truncate">{m.username}</span>
                  {m.user_id === selfId && <span className="shrink-0 text-[9px] font-normal text-moon-200/40">({t('tribe.you')})</span>}
                </span>
              </button>
            </li>
          )
        })}
      </ul>
      {/* herbe du village */}
      <div className="pointer-events-none absolute inset-x-0 bottom-0 h-8 bg-gradient-to-t from-[#0a0817] to-transparent" aria-hidden="true" />
    </div>
  )
}
