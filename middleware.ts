// Edge Middleware Vercel (racine du projet, hors Next.js — voir
// https://vercel.com/docs/functions/edge-middleware). S'exécute AVANT le
// rewrite SPA de vercel.json, uniquement sur les chemins listés dans
// `config.matcher` en bas de fichier (accueil, /aide, /rejoindre/:code).
//
// Le but : quand un lien est collé dans WhatsApp, Telegram, iMessage,
// Discord... l'appli y envoie un robot pour générer un aperçu (image +
// texte) AVANT même que l'utilisateur clique. Ce robot ne charge jamais le
// JS de la page (l'app est une SPA React) : sans cette interception, il ne
// verrait que la coquille HTML d'index.html — un seul jeu de balises
// possible pour TOUTES les pages, avec une image carrée (voir index.html).
// On détecte ces robots via leur user-agent et on leur sert une page HTML
// minimale avec les bonnes balises og:*/twitter:* pour la page visée à la
// place — un visuel 1200×630 différent par contexte (public/og/), plus le
// pseudo de l'hôte pour un lien d'invitation. Tout le reste du trafic
// (navigateurs réels) continue normalement vers la SPA.
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

function renderHtml(opts: { title: string; description: string; imagePath: string; pageUrl: string; origin: string; redirect?: boolean }): Response {
  const title = escapeHtml(opts.title)
  const description = escapeHtml(opts.description)
  const imageUrl = `${opts.origin}${opts.imagePath}`
  const html = `<!doctype html>
<html lang="fr">
<head>
<meta charset="utf-8" />
<title>${title}</title>
<meta name="description" content="${description}" />
<meta property="og:title" content="${title}" />
<meta property="og:description" content="${description}" />
<meta property="og:image" content="${imageUrl}" />
<meta property="og:image:width" content="1200" />
<meta property="og:image:height" content="630" />
<meta property="og:url" content="${opts.pageUrl}" />
<meta property="og:type" content="website" />
<meta name="twitter:card" content="summary_large_image" />
<meta name="twitter:title" content="${title}" />
<meta name="twitter:description" content="${description}" />
<meta name="twitter:image" content="${imageUrl}" />
${opts.redirect ? `<meta http-equiv="refresh" content="0; url=${opts.pageUrl}" />` : ''}
</head>
<body>
<p>${description} <a href="${opts.pageUrl}">Ouvrir Loup Garou d'Afrique</a></p>
</body>
</html>`
  return new Response(html, { headers: { 'content-type': 'text/html; charset=utf-8' } })
}

// Titre/description pour l'accueil et Aide — copie de ceux d'index.html et
// de SeoManager.tsx (INDEXABLE_PAGES) : à garder synchronisés à la main si
// ces textes changent, le Edge Middleware ne peut pas raisonnablement
// importer le composant React qui les porte (dépendances DOM/router).
const STATIC_PAGES: Record<string, { title: string; description: string; image: string }> = {
  '/': {
    title: "Loup Garou d'Afrique – Jouez au Loup-Garou en ligne entre amis",
    description: "Jouez au Loup Garou d'Afrique en ligne, entre amis, jusqu'à 25 joueurs. L'application arbitre la partie : rôles, votes, nuits et chat de groupe.",
    image: '/og/og-default.png',
  },
  '/aide': {
    title: "Règles et rôles du jeu – Loup Garou d'Afrique",
    description: "Découvrez les règles du Loup Garou d'Afrique, le déroulement d'une partie (nuit, jour, vote) et tous les rôles : Voyante, Sorcière, Chasseur, Cupidon...",
    image: '/og/og-aide.png',
  },
}

async function handleInvite(request: Request, url: URL): Promise<Response> {
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

    return renderHtml({
      title: `🐺 ${preview.host_name} vous invite — Loup Garou d'Afrique`,
      description: `Code du salon : ${preview.code} — ${preview.player_count} joueur${preview.player_count > 1 ? 's' : ''} déjà présent${preview.player_count > 1 ? 's' : ''}. Rejoignez la partie !`,
      imagePath: '/og/og-invite.png',
      pageUrl: request.url,
      origin: url.origin,
      redirect: true,
    })
  } catch {
    // La SPA normale sait déjà gérer un code de salon invalide/expiré — en
    // cas de souci ici (Supabase indisponible, etc.), on la laisse faire
    // plutôt que de renvoyer une erreur brute au robot.
    return next()
  }
}

export default async function middleware(request: Request): Promise<Response> {
  const userAgent = request.headers.get('user-agent') ?? ''
  if (!BOT_UA.test(userAgent)) {
    return next()
  }

  const url = new URL(request.url)

  if (url.pathname.startsWith('/rejoindre/')) {
    return handleInvite(request, url)
  }

  const page = STATIC_PAGES[url.pathname]
  if (!page) return next()

  return renderHtml({
    title: page.title,
    description: page.description,
    imagePath: page.image,
    pageUrl: request.url,
    origin: url.origin,
    // Pas de redirection meta-refresh ici (contrairement à l'invitation) :
    // Google-InspectionTool (indexation) fait partie de BOT_UA et doit
    // recevoir le contenu tel quel pour l'indexer, pas être renvoyé vers la
    // même URL en boucle.
  })
}

export const config = {
  matcher: ['/', '/aide', '/rejoindre/:code*'],
}
