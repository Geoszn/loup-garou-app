import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

if (!url || !anonKey) {
  // eslint-disable-next-line no-console
  console.error(
    'Variables VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY manquantes. Copiez .env.example vers .env et renseignez vos clés Supabase.'
  )
}

export const supabase = createClient(url, anonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
  },
})

// ============================================================================
// Résilience face aux rejets de JWT ponctuels côté Supabase (incident
// récurrent, voir status.supabase.com : "401 errors due to JWT rejections",
// ouvert depuis fin août 2026, pas encore résolu par Supabase à cette date).
// Un jeton pourtant valide se fait parfois refuser avec un 401. Sans
// contournement, CHAQUE appel RPC touché par cet incident échoue
// silencieusement — y compris le sondage de secours de useGame.ts (toutes
// les 2,5s pendant une partie) — et une partie en cours reste bloquée pour
// tout le monde jusqu'à ce que le SDK rafraîchisse le jeton de son propre
// chef, ce qui peut prendre plusieurs minutes.
//
// On intercepte donc `rpc()` UNE FOIS ici, plutôt que dans chacun des ~150
// sites d'appel : sur un 401/JWT, on force un rafraîchissement de session
// puis on retente l'appel une seule fois avant d'abandonner. Sans danger
// pour les appels qui réussissent déjà (aucun changement de comportement) —
// se contente de donner une seconde chance à ceux qui échouent pour cette
// raison précise. `refreshSessionOnce` mutualise les rafraîchissements
// concomitants (plusieurs appels ratés au même instant ne déclenchent
// qu'UN SEUL refreshSession(), pas un par appel).
const rawRpc = supabase.rpc.bind(supabase)
let refreshInFlight: Promise<boolean> | null = null

function looksLikeJwtRejection(status: number, error: { message?: string } | null): boolean {
  if (status === 401) return true
  return /jwt|invalid token/i.test(error?.message ?? '')
}

function refreshSessionOnce(): Promise<boolean> {
  if (!refreshInFlight) {
    refreshInFlight = supabase.auth
      .refreshSession()
      .then(({ error }) => !error)
      .finally(() => {
        setTimeout(() => {
          refreshInFlight = null
        }, 3000)
      })
  }
  return refreshInFlight
}

// @ts-expect-error - rpc() est une méthode générique fortement surchargée ;
// aucun appel de ce projet ne s'appuie sur son inférence de type (voir les
// ~150 sites d'appel, tous castés manuellement après coup), donc on la
// remplace ici par une version plus permissive plutôt que de reproduire sa
// signature exacte au risque de la désynchroniser d'une future version du
// SDK.
supabase.rpc = async (...args: Parameters<typeof rawRpc>) => {
  const result = await rawRpc(...args)
  if (result.error && looksLikeJwtRejection(result.status, result.error) && (await refreshSessionOnce())) {
    return rawRpc(...args)
  }
  return result
}
