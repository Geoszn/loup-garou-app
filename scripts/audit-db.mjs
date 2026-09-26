// Audit de sécurité de la base Supabase RÉELLE (lecture seule) — à relancer
// après chaque série de migrations : `npm run audit:db`.
//
// Pourquoi : les failles trouvées lors de l'audit du 26/09/2026 (auto-promotion
// admin via profiles, fonctions internes ouvertes à tous les visiteurs) ne se
// voyaient PAS dans les fichiers de migration — seulement dans l'état réel de
// la base (droits par défaut de Supabase, dérive manuelle...). Ce script
// interroge donc directement la base et échoue (code de sortie 1) si l'un de
// ces garde-fous est rompu.
//
// Usage : export SUPABASE_DB_URL='postgres://...' puis `npm run audit:db`.
// N'écrit jamais rien, n'affiche jamais l'URL de connexion.
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import pg from 'pg'

// ---------------------------------------------------------------------------
// Listes blanches — à modifier UNIQUEMENT en connaissance de cause.
// ---------------------------------------------------------------------------

// Seules fonctions appelables par un visiteur NON connecté (page d'accueil,
// aperçu d'un lien d'invitation, textes du jeu).
const ANON_ALLOWED = new Set([
  'get_active_events',
  'get_app_status',
  'get_content_overrides',
  'get_disabled_roles',
  'get_invite_preview',
  'get_public_leaderboard',
])

// Fonctions appelables par un joueur connecté SANS être nommées dans le code
// du site : aides évaluées par les policies (RLS/stockage) avec le rôle du
// joueur, et petites fonctions de calcul sans effet de bord.
const AUTHENTICATED_HELPERS = new Set([
  'can_access_channel',
  'can_listen_channel',
  'can_read_channel',
  'is_game_participant',
  'my_role_in_game',
  'is_alive_petite_fille',
  'is_admin_user',
  'avatar_icon_min_points',
  'rank_tier_for_points',
  'get_leaderboard',
])

// Tables dont AUCUNE ligne ne doit être diffusée en temps réel (Realtime
// envoie la ligne entière aux abonnés autorisés par la RLS).
const REALTIME_FORBIDDEN = [
  'game_roles_secret', 'votes', 'night_actions', 'profiles', 'player_artifacts',
  'loup_coins_transactions', 'push_subscriptions', 'feedback_messages',
  'account_deletion_requests', 'admin_audit_log', 'admin_access_log', 'game_results',
]

// Colonnes qui ont déjà fuité un secret de jeu et ne doivent plus exister.
const FORBIDDEN_COLUMNS = [['game_players', 'is_lover']]

// ---------------------------------------------------------------------------

const connectionString = process.env.SUPABASE_DB_URL
if (!connectionString) {
  console.error("Variable d'environnement SUPABASE_DB_URL manquante.")
  process.exit(1)
}

function walk(dir, out = []) {
  let entries
  try {
    entries = readdirSync(dir)
  } catch {
    return out
  }
  for (const name of entries) {
    const p = join(dir, name)
    const st = statSync(p)
    if (st.isDirectory()) walk(p, out)
    else if (/\.(ts|tsx)$/.test(name)) out.push(p)
  }
  return out
}

// Tout identifiant écrit entre guillemets dans le code du site (src/) ou de
// l'API (api/, server/) : couvre les .rpc('nom') directs comme les noms
// choisis dynamiquement (ternaire...).
const referenced = new Set()
for (const dir of ['src', 'api', 'server']) {
  for (const file of walk(dir)) {
    const text = readFileSync(file, 'utf-8')
    for (const m of text.matchAll(/['"`]([a-z_][a-z0-9_]*)['"`]/g)) referenced.add(m[1])
  }
}

const client = new pg.Client({ connectionString, ssl: { rejectUnauthorized: false } })
await client.connect()
const q = async (sql, params = []) => (await client.query(sql, params)).rows

const results = []
const add = (level, title, details = []) => results.push({ level, title, details })
const check = (title, failures, hint) =>
  failures.length === 0 ? add('ok', title) : add('fail', title, [...failures, ...(hint ? ['→ ' + hint] : [])])

try {
  // 1. RLS activée partout
  const noRls = await q(`
    select c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind in ('r','p') and not c.relrowsecurity order by 1`)
  check('Toutes les tables publiques ont la RLS activée', noRls.map((r) => r.relname))

  // 2. Aucune écriture directe pour anon / authenticated
  const writes = await q(`
    select c.relname as tbl, r.rolname as role, p.priv
    from pg_class c join pg_namespace n on n.oid = c.relnamespace
    cross join (values ('anon'), ('authenticated')) as r(rolname)
    cross join (values ('INSERT'), ('UPDATE'), ('DELETE'), ('TRUNCATE')) as p(priv)
    where n.nspname = 'public' and c.relkind in ('r','p')
      and case when p.priv in ('INSERT','UPDATE') then has_any_column_privilege(r.rolname, c.oid, p.priv)
               else has_table_privilege(r.rolname, c.oid, p.priv) end
    order by 1, 2, 3`)
  check(
    'Aucune écriture directe possible sur les tables (anon / authenticated)',
    writes.map((r) => `${r.role} peut ${r.priv} sur ${r.tbl}`),
    'Les écritures doivent passer par des fonctions SECURITY DEFINER (voir migration 0183).'
  )

  // 3. Fonctions exécutables par un visiteur non connecté
  const anonFns = await q(`
    select distinct p.proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.prokind = 'f' and has_function_privilege('anon', p.oid, 'EXECUTE') order by 1`)
  check(
    'Visiteurs non connectés : uniquement les lectures publiques prévues',
    anonFns.map((r) => r.proname).filter((n) => !ANON_ALLOWED.has(n)).map((n) => `${n}() est appelable sans connexion`),
    'Voir migrations 0184/0185 (revoke execute ... from anon / public).'
  )

  // 4. Fonctions exécutables par un joueur connecté mais inconnues du site
  const authFns = await q(`
    select distinct p.proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.prokind = 'f' and has_function_privilege('authenticated', p.oid, 'EXECUTE') order by 1`)
  check(
    "Joueurs connectés : uniquement des fonctions utilisées par le site (ou aides de RLS)",
    authFns.map((r) => r.proname).filter((n) => !referenced.has(n) && !AUTHENTICATED_HELPERS.has(n))
      .map((n) => `${n}() est appelable par tout joueur mais jamais utilisée par le site`),
    "Retirer avec `revoke execute on function ... from authenticated` — ou l'ajouter à AUTHENTICATED_HELPERS si c'est voulu."
  )

  // 5. Droits par défaut : les futures fonctions/tables ne doivent rien ouvrir
  const defAcl = await q(`
    select d.defaclobjtype as objtype, d.defaclacl::text[] as acl, d.defaclrole::regrole::text as owner
    from pg_default_acl d join pg_namespace n on n.oid = d.defaclnamespace where n.nspname = 'public'`)
  const badDefaults = []
  for (const row of defAcl) {
    for (const item of row.acl ?? []) {
      const m = item.match(/^(?:"?)(anon|authenticated)(?:"?)=([A-Za-z*]*)\//)
      if (!m) continue
      if (row.objtype === 'f' && m[2].includes('X')) badDefaults.push(`futures fonctions (${row.owner}) : ${m[1]} reçoit EXECUTE`)
      if (row.objtype === 'r' && /[awdD]/.test(m[2])) badDefaults.push(`futures tables (${row.owner}) : ${m[1]} reçoit écriture (${m[2]})`)
    }
  }
  check('Privilèges par défaut : rien d\'ouvert automatiquement aux futures fonctions/tables', badDefaults)

  // 6. Fonctions SECURITY DEFINER sans search_path fixé
  const noSp = await q(`
    select p.proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.prosecdef
      and (p.proconfig is null or not exists (select 1 from unnest(p.proconfig) c where c like 'search_path=%'))
    order by 1`)
  check('Fonctions SECURITY DEFINER : search_path toujours fixé', noSp.map((r) => r.proname))

  // 7. Fonctions admin_* : contrôle d'admin présent, et SECURITY DEFINER
  const adminFns = await q(`
    select p.proname, p.prosecdef, p.prosrc from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname like 'admin\\_%' order by 1`)
  check(
    `Fonctions admin_* (${adminFns.length}) : contrôle d'administrateur présent`,
    adminFns.filter((f) => !/is_admin_user|admin_check_access/.test(f.prosrc) || !f.prosecdef)
      .map((f) => `${f.proname}() n'a pas de contrôle is_admin_user (ou n'est pas SECURITY DEFINER)`)
  )

  // 8. Tables sensibles absentes du temps réel
  const rt = await q(`select tablename from pg_publication_tables where pubname = 'supabase_realtime'`)
  check(
    'Temps réel : aucune table sensible diffusée',
    rt.map((r) => r.tablename).filter((t) => REALTIME_FORBIDDEN.includes(t)).map((t) => `${t} est diffusée en temps réel`)
  )

  // 9. Vues contournant la RLS
  const views = await q(`
    select c.relname, c.reloptions from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind in ('v','m')`)
  check(
    'Aucune vue publique contournant la RLS',
    views.filter((v) => !(v.reloptions ?? []).includes('security_invoker=true')).map((v) => `${v.relname} n'est pas security_invoker`)
  )

  // 10. Colonnes qui ont déjà fuité un secret de jeu
  const colFailures = []
  for (const [table, column] of FORBIDDEN_COLUMNS) {
    const r = await q(
      `select 1 from information_schema.columns where table_schema = 'public' and table_name = $1 and column_name = $2`,
      [table, column]
    )
    if (r.length) colFailures.push(`${table}.${column} existe encore (lisible par les autres joueurs et diffusée en temps réel)`)
  }
  check('Aucune colonne secrète exposée (ex. les amoureux)', colFailures)

  // 11. Écritures sur le stockage : réservées aux admins
  const stor = await q(`
    select policyname, cmd, coalesce(qual, '') || ' ' || coalesce(with_check, '') as expr
    from pg_policies where schemaname = 'storage' and tablename = 'objects' and cmd in ('INSERT','UPDATE','DELETE','ALL')`)
  check(
    'Stockage : écriture réservée aux administrateurs',
    stor.filter((p) => !p.expr.includes('is_admin_user')).map((p) => `policy "${p.policyname}" (${p.cmd}) sans is_admin_user`)
  )

  // 12. Policies d'écriture sur les tables (information : inertes tant que les droits sont retirés)
  const wp = await q(`
    select tablename, policyname, cmd from pg_policies
    where schemaname = 'public' and cmd in ('INSERT','UPDATE','DELETE','ALL') order by 1, 2`)
  if (wp.length) {
    add('warn', "Policies d'écriture présentes (inertes tant que les droits d'écriture sont retirés à anon/authenticated)",
      wp.map((p) => `${p.tablename} : ${p.policyname} (${p.cmd})`))
  }

  // 13. Comptes administrateurs (à relire : chacun doit être connu)
  const admins = await q(`select username from public.profiles where is_admin order by 1`)
  add('info', `Comptes administrateurs (${admins.length})`, admins.map((a) => a.username))
} finally {
  await client.end()
}

const icon = { ok: '✅', fail: '❌', warn: '⚠️ ', info: 'ℹ️ ' }
for (const r of results) {
  console.log(`${icon[r.level]} ${r.title}`)
  for (const d of r.details) console.log(`     ${d}`)
}
const failed = results.filter((r) => r.level === 'fail').length
console.log(failed === 0 ? '\nAudit réussi : tous les garde-fous sont en place.' : `\n${failed} garde-fou(s) rompu(s).`)
process.exit(failed === 0 ? 0 : 1)
