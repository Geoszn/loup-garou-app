// Edge Middleware Vercel (racine du projet, hors Next.js — voir
// https://vercel.com/docs/functions/edge-middleware). S'exécute AVANT le
// rewrite SPA de vercel.json, uniquement sur /rejoindre/:code (voir
// `config.matcher` en bas de fichier).
//
// Le but : quand un lien d'invitation (`/rejoindre/XXXX`) est collé dans
// WhatsApp, Telegram, iMessage, Discord... l'appli y envoie un robot pour
// générer un aperçu (image + texte) AVANT même que l'utilisateur clique. Ce
// robot ne charge jamais le JS de la page (l'app est une SPA React) : sans
// cette interception, il ne verrait que la coquille HTML vide d'index.html
// et l'aperçu serait générique/sans intérêt. On détecte ces robots via leur
// user-agent et on leur sert une page HTML minimale avec les bonnes balises
// og:*/twitter:* (code du salon + pseudo de l'hôte) à la place. Tout le
// reste du trafic (navigateurs réels) continue normalement vers la SPA.
//
// Volontairement sans dépendance à @vercel/edge (paquet non installé ici) :
// `next()` est réimplémenté à la main juste en dessous — c'est exactement
// son mécanisme documenté (une Response vide portant l'en-tête
// `x-middleware-next: 1`), donc aucune perte de fonctionnalité.
function next(): Response {
  return new Response(null, { headers: { 'x-middleware-next': '1' } })
}

// User-agents connus des robots d'aperçu de lien des principales applis de
// messagerie/réseaux sociaux. Liste non exhaustive par nature (nouveaux
// robots, variantes) — un robot non reconnu ici tombe simplement sur la SPA
// normale (pas d'aperçu enrichi pour lui, mais rien ne casse).
const BOT_UA = /facebookexternalhit|WhatsApp|Twitterbot|Slackbot|TelegramBot|Discordbot|LinkedInBot|Pinterest|SkypeUriPreview|iMessage|SnapchatAds|Google-InspectionTool|Applebot/i

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] as string)
}

export default async function middleware(request: Request): Promise<Response> {
  const userAgent = request.headers.get('user-agent') ?? ''
  if (!BOT_UA.test(userAgent)) {
    return next()
  }

  const url = new URL(request.url)
  const code = url.pathname.split('/').filter(Boolean)[1] // /rejoindre/XXXX -> XXXX
  const supabaseUrl = process.env.VITE_SUPABASE_URL
  const supabaseAnonKey = process.env.VITE_SUPABASE_ANON_KEY

  if (!code || !supabaseUrl || !supabaseAnonKey) {
    return next()
  }

  try {
    const res = await fetch(`${supabaseUrl}/rest/v1/rpc/get_invite_preview`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: supabaseAnonKey,
        Authorization: `Bearer ${supabaseAnonKey}`,
      },
      body: JSON.stringify({ p_code: code }),
    })

    if (!res.ok) return next()
    const preview = await res.json().catch(() => null)
    if (!preview) return next() // partie introuvable : pas d'aperçu spécial, la SPA affichera "introuvable"

    const title = `🐺 ${escapeHtml(preview.host_name)} vous invite — Loup Garou d'Afrique`
    const description = `Code du salon : ${escapeHtml(preview.code)} — ${preview.player_count} joueur${preview.player_count > 1 ? 's' : ''} déjà présent${preview.player_count > 1 ? 's' : ''}. Rejoignez la partie !`
    const imageUrl = `${url.origin}/logo.png`
    const pageUrl = request.url

    const html = `<!doctype html>
<html lang="fr">
<head>
<meta charset="utf-8" />
<title>${title}</title>
<meta property="og:title" content="${title}" />
<meta property="og:description" content="${description}" />
<meta property="og:image" content="${imageUrl}" />
<meta property="og:url" content="${pageUrl}" />
<meta property="og:type" content="website" />
<meta name="twitter:card" content="summary" />
<meta name="twitter:title" content="${title}" />
<meta name="twitter:description" content="${description}" />
<meta name="twitter:image" content="${imageUrl}" />
<meta http-equiv="refresh" content="0; url=${pageUrl}" />
</head>
<body>
<p>${description} <a href="${pageUrl}">Ouvrir Loup Garou d'Afrique</a></p>
</body>
</html>`

    return new Response(html, { headers: { 'content-type': 'text/html; charset=utf-8' } })
  } catch {
    // La SPA normale sait déjà gérer un code de salon invalide/expiré — en
    // cas de souci ici (Supabase indisponible, etc.), on la laisse faire
    // plutôt que de renvoyer une erreur brute au robot.
    return next()
  }
}

export const config = {
  matcher: '/rejoindre/:code*',
}
