#!/usr/bin/env node
// ============================================================================
// Vérifie, à partir des migrations SQL seules (sans connexion à une base),
// que toute fonction appelée par le client via supabase.rpc(...) est bien
// exécutable par le rôle "authenticated" (ou "anon" pour les quelques
// fonctions publiques) dans l'état final des migrations.
//
// Écrit après avoir été mordu deux fois par le même genre de bug :
//   1. La migration 0045 a retiré le droit d'exécution accordé par défaut
//      par Postgres à PUBLIC sur toute fonction, et n'a regranté que les
//      signatures qui avaient déjà un `grant execute` explicite dans
//      l'historique.
//   2. Deux fonctions (create_game, send_chat_message) avaient été
//      étendues plus tard avec un paramètre supplémentaire — en Postgres,
//      ça crée une DEUXIÈME fonction (une surcharge) à côté de l'ancienne,
//      pas un remplacement. La nouvelle version, celle que le client
//      appelle réellement, n'avait jamais eu son propre grant explicite :
//      elle s'est retrouvée bloquée en silence dès que 0045 est passée.
//
// Ce script rejoue les migrations dans l'ordre pour reconstituer l'état
// final (quelles signatures existent, quelles signatures sont accordées à
// quel rôle), puis croise ça avec tous les appels .rpc(...) trouvés dans
// src/ et api/. Objectif : que ce genre de régression soit détecté ici,
// avant un déploiement, plutôt que par un joueur en pleine partie.
//
// Usage : node scripts/check-rpc-grants.mjs   (ou : npm run check:rpc)
// Code de sortie : 1 si un problème est trouvé, 0 sinon.
// ============================================================================
import { readFileSync, readdirSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const MIGRATIONS_DIR = join(ROOT, 'supabase', 'migrations')

// ----------------------------------------------------------------------------
// 1. Rejoue les migrations SQL pour reconstituer l'état final des fonctions.
// ----------------------------------------------------------------------------

/** Retire les commentaires `--...` (naïvement, mais suffisant : aucune chaîne
 * SQL de ce projet ne contient `--`) pour ne jamais confondre du texte de
 * commentaire avec du vrai SQL (ex. une parenthèse dans une explication en
 * français). */
function stripComments(sql) {
  return sql.replace(/--[^\n]*/g, '')
}

/** Étant donné une position juste après un '(' d'ouverture, trouve l'index de
 * la parenthèse fermante correspondante (gère l'imbrication). */
function findMatchingParen(text, openIndex) {
  let depth = 0
  for (let i = openIndex; i < text.length; i++) {
    if (text[i] === '(') depth++
    else if (text[i] === ')') {
      depth--
      if (depth === 0) return i
    }
  }
  return -1
}

/** Découpe une liste de paramètres SQL bruts en items top-level (respecte les
 * parenthèses imbriquées, ex. dans un type ou une valeur par défaut). */
function splitTopLevel(raw) {
  const parts = []
  let depth = 0
  let cur = ''
  for (const ch of raw) {
    if (ch === '(') depth++
    if (ch === ')') depth--
    if (ch === ',' && depth === 0) {
      parts.push(cur)
      cur = ''
    } else {
      cur += ch
    }
  }
  if (cur.trim()) parts.push(cur)
  return parts.map((p) => p.trim()).filter(Boolean)
}

/** Convertit une liste de paramètres SQL bruts ("p_foo text default null, p_bar int")
 * en une liste de types normalisés (["text", "int"]) — c'est le type qui
 * définit la signature Postgres, pas le nom du paramètre. */
function paramsToTypes(raw) {
  return splitTopLevel(raw).map((p) => {
    const withoutDefault = p.split(/\bdefault\b/i)[0].trim()
    const tokens = withoutDefault.split(/\s+/)
    // Le premier token est le nom du paramètre (p_xxx) ; le reste est le
    // type, qui peut contenir plusieurs mots (ex. "double precision").
    return tokens.length >= 2 ? tokens.slice(1).join(' ') : withoutDefault
  })
}

/** Comme paramsToTypes, mais renvoie les NOMS de paramètres — c'est ce que
 * PostgREST utilise pour choisir entre plusieurs surcharges quand l'appel se
 * fait avec des paramètres nommés (JSON), comme le fait ce projet partout. */
function paramsToNames(raw) {
  return splitTopLevel(raw)
    .map((p) => p.trim().split(/\s+/)[0])
    .filter(Boolean)
}

function signatureKey(name, types) {
  return `${name}(${types.join(', ')})`
}

const files = readdirSync(MIGRATIONS_DIR)
  .filter((f) => f.endsWith('.sql'))
  .sort()

/** sig -> { name, types, grantedTo: Set<string> } pour tout ce qui existe
 * encore à la fin de la relecture des migrations. */
const functions = new Map()

for (const file of files) {
  const raw = readFileSync(join(MIGRATIONS_DIR, file), 'utf8')
  const sql = stripComments(raw)

  // create (or replace) function public.name(...)
  const createRe = /create\s+(?:or\s+replace\s+)?function\s+public\.(\w+)\s*\(/gi
  let m
  while ((m = createRe.exec(sql))) {
    const name = m[1]
    const openIdx = m.index + m[0].length - 1
    const closeIdx = findMatchingParen(sql, openIdx)
    if (closeIdx === -1) continue
    const rawParams = sql.slice(openIdx + 1, closeIdx)
    const types = paramsToTypes(rawParams)
    const paramNames = paramsToNames(rawParams)
    const key = signatureKey(name, types)
    if (!functions.has(key)) {
      functions.set(key, { name, types, paramNames, grantedTo: new Set() })
    }
    // Une nouvelle create-or-replace sur une signature déjà vue ne change
    // pas ses grants (Postgres conserve les ACL existantes à travers un
    // `create or replace`) — on ne touche donc pas grantedTo ici.
  }

  // drop function public.name(...)
  const dropRe = /drop\s+function\s+(?:if\s+exists\s+)?public\.(\w+)\s*\(([^)]*)\)/gi
  while ((m = dropRe.exec(sql))) {
    const name = m[1]
    const types = paramsToTypes(m[2])
    const key = signatureKey(name, types)
    functions.delete(key)
  }

  // revoke execute on all functions in schema public from ...
  if (/revoke\s+execute\s+on\s+all\s+functions\s+in\s+schema\s+public\s+from/i.test(sql)) {
    for (const fn of functions.values()) fn.grantedTo.clear()
  }

  // grant execute on function public.name(...) to role1, role2;
  const grantRe = /grant\s+execute\s+on\s+function\s+public\.(\w+)\s*\(([^)]*)\)\s+to\s+([a-z_, ]+);/gi
  while ((m = grantRe.exec(sql))) {
    const name = m[1]
    const types = paramsToTypes(m[2])
    const key = signatureKey(name, types)
    const roles = m[3].split(',').map((r) => r.trim())
    const fn = functions.get(key)
    if (fn) for (const r of roles) fn.grantedTo.add(r)
    // Si la fonction n'existe pas (typo, ou grant avant le create dans le
    // même fichier — rare), on l'ignore silencieusement ici ; ce n'est pas
    // le genre de bug que ce script cherche à attraper.
  }
}

// ----------------------------------------------------------------------------
// 2. Cherche tous les appels supabase.rpc('nom', { ...params }) dans le code
//    client (src/) et serveur (api/), avec les noms de paramètres passés —
//    c'est ce que PostgREST utilise pour choisir entre plusieurs surcharges.
// ----------------------------------------------------------------------------
function walk(dir, out = []) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name.startsWith('.')) continue
    const full = join(dir, entry.name)
    if (entry.isDirectory()) walk(full, out)
    else if (/\.(ts|tsx)$/.test(entry.name)) out.push(full)
  }
  return out
}

const sourceFiles = [...walk(join(ROOT, 'src')), ...walk(join(ROOT, 'api'))]

/** name -> Set of "sorted,param,names" seen across all call sites (une
 * chaîne vide représente un appel sans second argument). */
const calls = new Map()

const callRe = /\.rpc\(\s*['"](\w+)['"]\s*(?:,\s*\{([^}]*)\})?/g
for (const file of sourceFiles) {
  const text = readFileSync(file, 'utf8')
  let m
  while ((m = callRe.exec(text))) {
    const name = m[1]
    const argsBlock = m[2] ?? ''
    const paramNames = [...argsBlock.matchAll(/(\w+)\s*:/g)].map((x) => x[1]).sort()
    if (!calls.has(name)) calls.set(name, new Set())
    calls.get(name).add(paramNames.join(','))
  }
}

// ----------------------------------------------------------------------------
// 3. Croise : pour chaque nom appelé, les signatures existantes ont-elles
//    au moins un rôle pertinent (authenticated ou anon) ?
// ----------------------------------------------------------------------------
const problems = []
const warnings = []

for (const [name, callParamSets] of calls) {
  const existingSigs = [...functions.values()].filter((f) => f.name === name)

  if (existingSigs.length === 0) {
    problems.push(`"${name}" est appelée via .rpc() mais n'existe dans aucune migration (nom mal orthographié ?).`)
    continue
  }

  const ungrantedSigs = existingSigs.filter((f) => f.grantedTo.size === 0)
  if (ungrantedSigs.length === existingSigs.length) {
    problems.push(
      `"${name}" est appelée via .rpc() mais AUCUNE de ses signatures n'a de grant execute (authenticated/anon) : ${existingSigs
        .map((f) => `(${f.types.join(', ')})`)
        .join(' / ')}`
    )
    continue
  }

  // Surcharge : plusieurs signatures existent pour ce nom. PostgREST choisit
  // celle dont l'ensemble de noms de paramètres est compatible avec ceux
  // fournis dans l'appel (paramètres nommés, JSON). Pour chaque appel
  // observé dans le code, on vérifie qu'AU MOINS UNE signature compatible
  // est accordée — sinon c'est bloquant, pas juste un avertissement.
  if (existingSigs.length > 1 && ungrantedSigs.length > 0) {
    for (const paramsCsv of callParamSets) {
      const calledParams = paramsCsv ? paramsCsv.split(',') : []
      const compatibleSigs = existingSigs.filter((f) => calledParams.every((p) => f.paramNames.includes(p)))

      if (compatibleSigs.length === 0) {
        warnings.push(
          `"${name}" : aucune signature connue ne correspond exactement aux paramètres observés (${paramsCsv || 'aucun'}) — vérification manuelle recommandée.`
        )
        continue
      }

      const compatibleAndGranted = compatibleSigs.some((f) => f.grantedTo.size > 0)
      if (!compatibleAndGranted) {
        problems.push(
          `"${name}" appelée avec les paramètres (${paramsCsv || 'aucun'}) correspond à la signature ` +
            compatibleSigs.map((f) => `(${f.types.join(', ')})`).join(' ou ') +
            ` — AUCUNE n'a de grant execute. C'est exactement le bug qui a cassé le chat et la création de partie publique (voir migration 0046).`
        )
      }
    }
  }
}

// ----------------------------------------------------------------------------
// 4. Rapport.
// ----------------------------------------------------------------------------
console.log(`check-rpc-grants : ${functions.size} signature(s) de fonction, ${calls.size} nom(s) de RPC appelé(s) côté client.\n`)

if (warnings.length > 0) {
  console.log('⚠️  Avertissements (surcharges avec grants incohérents, à vérifier manuellement) :')
  for (const w of warnings) console.log(`   - ${w}`)
  console.log('')
}

if (problems.length > 0) {
  console.log('❌ Problèmes bloquants :')
  for (const p of problems) console.log(`   - ${p}`)
  console.log('')
  console.log(`${problems.length} problème(s) trouvé(s). Corrige les grants avant de déployer.`)
  process.exit(1)
}

console.log('✅ Toutes les fonctions appelées par le client ont au moins une signature exécutable.')
process.exit(0)
