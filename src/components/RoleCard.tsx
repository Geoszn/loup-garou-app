import { useEffect, useState, type ReactNode } from 'react'
import { supabase } from '../lib/supabase'
import { ROLES, roleTeamLabel, type RoleId } from '../lib/roles'
import { useLanguage } from '../i18n/LanguageContext'

// Portraits façon "carte de tarot illustrée" (bandeau parchemin déchiré +
// rouleau de texte en bas), un par rôle, à déposer dans public/roles/. Tant
// qu'un fichier n'existe pas pour un rôle donné (ex: l'Ancien, ajouté plus
// tard), on retombe sur l'ancien affichage emoji — jamais de lien cassé.
// Exporté : réutilisé par AdminDashboard.tsx pour proposer le même lien de
// téléchargement "image actuellement en ligne" quand aucune image n'a
// encore été mise en ligne depuis le dashboard pour un rôle donné.
export const DEFAULT_ROLE_IMAGES: Partial<Record<RoleId, string>> = {
  villageois: '/roles/villageois.jpg',
  loup_garou: '/roles/loup-garou.jpg',
  voyante: '/roles/voyante.jpg',
  sorciere: '/roles/sorciere.jpg',
  chasseur: '/roles/chasseur.jpg',
  petite_fille: '/roles/petite-fille.jpg',
  cupidon: '/roles/cupidon.jpg',
  voleur: '/roles/voleur.jpg',
}

// Chaque rôle a désormais potentiellement DEUX sources d'image, essayées
// dans l'ordre : d'abord le bucket de stockage "role-cards" (modifiable
// depuis le dashboard admin sans redéploiement — voir migration 0053), puis
// l'asset statique bundlé ci-dessus (avant même que l'admin n'ait rien mis
// en ligne, ou pour les rôles qui n'ont jamais eu d'illustration bundlée,
// ex. l'Ancien/l'Enfant Sauvage). `getPublicUrl` ne fait aucun appel réseau
// — c'est juste la construction déterministe de l'URL ; c'est le <img> qui
// tente réellement de charger, et son onError qui fait passer au candidat
// suivant (voir cascade plus bas).
function roleCardImageCandidates(roleId: RoleId): string[] {
  const candidates: string[] = []
  const { data } = supabase.storage.from('role-cards').getPublicUrl(`${roleId}.jpg`)
  if (data?.publicUrl) candidates.push(data.publicUrl)
  const bundled = DEFAULT_ROLE_IMAGES[roleId]
  if (bundled) candidates.push(bundled)
  return candidates
}

export function RoleCard({ roleId, revealed = true }: { roleId: string | null; revealed?: boolean }) {
  const { t } = useLanguage()
  const role = roleId ? ROLES[roleId as RoleId] : null
  const candidates = role ? roleCardImageCandidates(role.id) : []
  // Repart de zéro (retente d'abord le stockage) à chaque changement de
  // rôle affiché — sinon, une fois épuisée sur un premier rôle sans
  // illustration, la cascade resterait bloquée sur l'emoji pour tous les
  // suivants même s'ils ont bien une image.
  const [candidateIdx, setCandidateIdx] = useState(0)
  useEffect(() => {
    setCandidateIdx(0)
  }, [role?.id])
  const image = candidateIdx < candidates.length ? candidates[candidateIdx] : undefined

  return (
    <div className="card-3d mx-auto w-full max-w-xs">
      {/* Carte "tarot" : proportions 2/3, bordure or, dégradé profond et
          ombre à halo (voir shadow-tarot) pour un vrai effet de révélation
          dramatique plutôt qu'un simple rectangle bordé. */}
      <div className="animate-flip-card relative aspect-[2/3] overflow-hidden rounded-3xl border border-moon-400/40 bg-gradient-to-br from-night-700 via-night-900 to-night-950 shadow-tarot">
        <div className="texture-noise" />

        {!revealed || !role ? (
          <div className="relative flex h-full flex-col items-center justify-center gap-3 px-6 text-center text-moon-200/40">
            <span className="text-5xl">🂠</span>
            <span className="text-sm">En attente...</span>
          </div>
        ) : image ? (
          <>
            <img
              src={image}
              alt=""
              className="absolute inset-0 h-full w-full object-cover"
              onError={() => setCandidateIdx((i) => i + 1)}
            />
            {/* Fixe (pas lié aux variables jour/nuit) : c'est l'éclairage de
                la photo elle-même, pas celui de l'interface autour. */}
            <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/5 to-black/45" />

            <ParchmentBanner className="absolute left-1/2 top-4 w-[88%] -translate-x-1/2">
              {t(role.nameKey)}
            </ParchmentBanner>

            <div className="absolute inset-x-3 bottom-3">
              <ParchmentScroll>
                <p className="mb-1.5 text-[11px] font-bold uppercase tracking-widest" style={{ color: role.color }}>
                  {roleTeamLabel(role.team, t)}
                </p>
                <p className="text-[13px] leading-snug text-[#2e2010]/85">{t(role.descriptionKey)}</p>
              </ParchmentScroll>
            </div>
          </>
        ) : (
          <div className="relative flex h-full flex-col items-center justify-center px-6 text-center">
            <div
              className="pointer-events-none absolute left-1/2 top-12 h-40 w-40 -translate-x-1/2 rounded-full blur-3xl"
              style={{ background: `radial-gradient(circle, ${role.color}33, transparent 70%)` }}
            />
            <div
              className="relative mb-4 flex h-20 w-20 items-center justify-center rounded-full text-5xl ring-1 ring-moon-400/30"
              style={{ background: `radial-gradient(circle, ${role.color}26, transparent 75%)` }}
            >
              {role.emoji}
            </div>
            <h2 className="relative font-display text-2xl" style={{ color: role.color }}>
              {t(role.nameKey)}
            </h2>
            <span className="relative mt-2 inline-block rounded-full border border-moon-400/30 px-3 py-0.5 text-xs uppercase tracking-widest text-moon-300/80">
              {roleTeamLabel(role.team, t)}
            </span>
            <p className="relative mt-4 text-sm leading-relaxed text-moon-200/70">{t(role.descriptionKey)}</p>
          </div>
        )}
      </div>
    </div>
  )
}

/** Bandeau "parchemin déchiré" pour le titre — bords arrondis irréguliers
 * simulés en variant les rayons de chaque coin, plutôt qu'un vrai découpage
 * en dents de scie (SVG/clip-path) qui serait fragile à toutes les tailles
 * d'écran. Suffisant pour évoquer le papier froissé des cartes de référence
 * sans dépendre d'un asset supplémentaire. */
function ParchmentBanner({ children, className = '' }: { children: ReactNode; className?: string }) {
  return (
    <div
      className={`border-2 border-[#c9a668]/70 bg-gradient-to-b from-[#f3e3bd] to-[#e2c68f] px-4 py-1.5 text-center shadow-[0_4px_10px_rgba(0,0,0,0.55)] ${className}`}
      style={{ borderRadius: '3px 18px 6px 22px / 14px 6px 18px 8px' }}
    >
      <span className="font-banner text-lg font-bold leading-tight tracking-wide text-[#3a2711]">{children}</span>
    </div>
  )
}

function ParchmentScroll({ children }: { children: ReactNode }) {
  return (
    <div
      className="border-2 border-[#c9a668]/70 bg-gradient-to-b from-[#f6e9cd]/95 to-[#e9d7a8]/95 px-3.5 py-3 shadow-[0_4px_10px_rgba(0,0,0,0.55)]"
      style={{ borderRadius: '10px 4px 16px 5px / 5px 12px 4px 14px' }}
    >
      {children}
    </div>
  )
}
