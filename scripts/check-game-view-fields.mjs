#!/usr/bin/env node
// ============================================================================
// Vérifie, à partir des migrations SQL seules (sans connexion à une base),
// que tous les champs retournés par get_my_game_view() correspondent
// exactement aux champs de l'interface TypeScript MyGameView
// (src/types/game.ts) — et inversement.
//
// Écrit en même temps que le découpage de get_my_game_view en fonctions
// par domaine (get_my_game_view + game_view_*_fields, voir migration
// 0142_split_get_my_game_view.sql). Avant ce découpage, get_my_game_view
// était un unique bloc PL/pgSQL de ~370 lignes réécrit intégralement à
// chaque migration qui le touchait (39 fois) — et a perdu des champs entiers
// à plusieurs reprises (0044, 0102) parce qu'une migration repartait d'une
// copie du corps plus ancienne que la dernière version réelle, sans qu'aucun
// outil ne le détecte avant qu'un joueur ne le remarque.
//
// Ce script rejoue les migrations dans l'ordre pour reconstituer le corps
// final de get_my_game_view et de chaque fonction game_view_*_fields
// qu'elle appelle, en extrait la liste complète des clés jsonb_build_object
// réellement retournées, et la compare aux champs de MyGameView.
//
// Usage : node scripts/check-game-view-fields.mjs   (ou : npm run check:game-view)
// Code de sortie : 1 si un champ manque d'un côté ou de l'autre, 0 sinon.
// ============================================================================
import { readFileSync, readdirSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const MIGRATIONS_DIR = join(ROOT, 'supabase', 'migrations')
const TYPES_FILE = join(ROOT, 'src', 'types', 'game.ts')

// ----------------------------------------------------------------------------
// 1. Rejoue les migrations pour reconstituer le corps final de get_my_game_view
//    et de chaque fonction game_view_*_fields.
//
// Simplification volontaire par rapport à check-rpc-grants.mjs : ces
// fonctions n'ont jamais qu'une seule signature chacune (jamais de
// surcharge), donc on suit leur corps par simple NOM plutôt que par
// signature complète — un `create or replace` sur ce nom remplace
// l'entrée précédente, un `drop function` (jamais utilisé pour ces
// fonctions à ce jour, mais géré par prudence) la retire.
// ----------------------------------------------------------------------------

/** Retire les commentaires SQL `--...` : mêmes hypothèses que
 * check-rpc-grants.mjs (aucune chaîne de ce projet ne contient `--`). */
function stripSqlComments(sql) {
  return sql.replace(/--[^\n]*/g, '')
}

/** Étant donné une position juste après un '(' d'ouverture, trouve l'index de
 * la parenthèse fermante correspondante (gère l'imbrication). Identique à
 * check-rpc-grants.mjs. */
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

/** Découpe une liste d'arguments SQL bruts en items top-level (respecte les
 * parenthèses imbriquées — une sous-requête ou un jsonb_build_object niché
 * dans la VALEUR d'un argument reste un seul item, pas séparé). Identique à
 * check-rpc-grants.mjs. */
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

const FUNCTION_NAME_RE = /get_my_game_view|game_view_\w+/

const files = readdirSync(MIGRATIONS_DIR)
  .filter((f) => f.endsWith('.sql'))
  .sort()

/** name -> corps SQL brut (texte entre les balises $tag$...$tag$) de la
 * dernière définition rencontrée en rejouant les migrations dans l'ordre. */
const functionBodies = new Map()

for (const file of files) {
  const raw = readFileSync(join(MIGRATIONS_DIR, file), 'utf8')
  const sql = stripSqlComments(raw)

  const events = []
  let m

  const createRe = new RegExp(
    `create\\s+(?:or\\s+replace\\s+)?function\\s+public\\.(${FUNCTION_NAME_RE.source})\\s*\\(`,
    'gi'
  )
  while ((m = createRe.exec(sql))) {
    const name = m[1]
    // Cherche le tag de dollar-quoting (`$$`, `$function$`, ...) après ce
    // `create function`, puis la prochaine occurrence EXACTE de ce même tag
    // pour délimiter le corps — suffisant ici puisqu'on ne suit que des
    // fonctions dont on contrôle entièrement la forme (pas de tag imbriqué
    // du même nom dans leur propre corps).
    const tagRe = /as\s+(\$[A-Za-z_]*\$)/g
    tagRe.lastIndex = m.index
    const tagMatch = tagRe.exec(sql)
    if (!tagMatch) continue
    const tag = tagMatch[1]
    const bodyStart = tagMatch.index + tagMatch[0].length
    const bodyEnd = sql.indexOf(tag, bodyStart)
    if (bodyEnd === -1) continue
    events.push({ index: m.index, type: 'create', name, body: sql.slice(bodyStart, bodyEnd) })
  }

  const dropRe = new RegExp(`drop\\s+function\\s+(?:if\\s+exists\\s+)?public\\.(${FUNCTION_NAME_RE.source})\\s*\\(`, 'gi')
  while ((m = dropRe.exec(sql))) {
    events.push({ index: m.index, type: 'drop', name: m[1] })
  }

  events.sort((a, b) => a.index - b.index)
  for (const ev of events) {
    if (ev.type === 'create') functionBodies.set(ev.name, ev.body)
    else functionBodies.delete(ev.name)
  }
}

// ----------------------------------------------------------------------------
// 2. Extrait les clés top-level d'un `jsonb_build_object(...)` — seulement le
//    PREMIER appel du corps (celui réellement retourné), jamais un appel
//    niché comme VALEUR d'un champ (ex. le sous-objet de `vote_recap`).
// ----------------------------------------------------------------------------
function extractTopLevelKeys(body) {
  const startMatch = /jsonb_build_object\s*\(/i.exec(body)
  if (!startMatch) return { keys: [], afterIndex: body.length }
  const openParenIdx = body.indexOf('(', startMatch.index)
  const closeParenIdx = findMatchingParen(body, openParenIdx)
  if (closeParenIdx === -1) return { keys: [], afterIndex: body.length }

  const rawArgs = body.slice(openParenIdx + 1, closeParenIdx)
  const parts = splitTopLevel(rawArgs)
  const keys = []
  for (let i = 0; i < parts.length; i += 2) {
    const keyExpr = parts[i].trim()
    const km = /^'([a-zA-Z0-9_]+)'$/.exec(keyExpr)
    if (km) keys.push(km[1])
  }
  return { keys, afterIndex: closeParenIdx + 1 }
}

/** Fonctions `game_view_*_fields` référencées après le premier
 * jsonb_build_object d'un corps (le patron `|| public.game_view_xxx(...)`
 * de l'orchestrateur get_my_game_view). */
function findReferencedHelpers(body, afterIndex) {
  const rest = body.slice(afterIndex)
  const re = /public\.(game_view_\w+)\s*\(/g
  const names = new Set()
  let m
  while ((m = re.exec(rest))) names.add(m[1])
  return [...names]
}

const mainBody = functionBodies.get('get_my_game_view')
if (!mainBody) {
  console.log('❌ get_my_game_view introuvable dans les migrations — rien à vérifier.')
  process.exit(1)
}

const { keys: baseKeys, afterIndex } = extractTopLevelKeys(mainBody)
const helperNames = findReferencedHelpers(mainBody, afterIndex)

const sqlFields = new Set(baseKeys)
const missingHelperBodies = []
for (const name of helperNames) {
  const helperBody = functionBodies.get(name)
  if (!helperBody) {
    missingHelperBodies.push(name)
    continue
  }
  const { keys } = extractTopLevelKeys(helperBody)
  for (const k of keys) sqlFields.add(k)
}

// ----------------------------------------------------------------------------
// 3. Extrait les champs top-level de `export interface MyGameView { ... }`
//    dans src/types/game.ts — en ignorant les commentaires (qui peuvent
//    mentionner des accolades en prose) et en ne retenant que les
//    déclarations de champ au premier niveau d'imbrication de l'interface
//    (pas les sous-types imbriqués comme celui de `wolf_night_recap`).
// ----------------------------------------------------------------------------
function stripTsComments(ts) {
  return ts.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '')
}

const tsRaw = readFileSync(TYPES_FILE, 'utf8')
const ts = stripTsComments(tsRaw)

const ifaceStart = ts.indexOf('export interface MyGameView')
if (ifaceStart === -1) {
  console.log('❌ interface MyGameView introuvable dans src/types/game.ts.')
  process.exit(1)
}
const braceOpenIdx = ts.indexOf('{', ifaceStart)
let depth = 0
let braceCloseIdx = -1
for (let i = braceOpenIdx; i < ts.length; i++) {
  if (ts[i] === '{') depth++
  else if (ts[i] === '}') {
    depth--
    if (depth === 0) {
      braceCloseIdx = i
      break
    }
  }
}
const ifaceBody = ts.slice(braceOpenIdx + 1, braceCloseIdx)

const tsFields = new Set()
let lineDepth = 0
for (const line of ifaceBody.split('\n')) {
  if (lineDepth === 0) {
    const fm = /^\s*([a-zA-Z_][a-zA-Z0-9_]*)\??\s*:/.exec(line)
    if (fm) tsFields.add(fm[1])
  }
  for (const ch of line) {
    if (ch === '{') lineDepth++
    else if (ch === '}') lineDepth--
  }
}

// ----------------------------------------------------------------------------
// 4. Rapport.
// ----------------------------------------------------------------------------
const missingFromSql = [...tsFields].filter((f) => !sqlFields.has(f)).sort()
const missingFromTs = [...sqlFields].filter((f) => !tsFields.has(f)).sort()

console.log(
  `check-game-view-fields : ${sqlFields.size} champ(s) retourné(s) par get_my_game_view (via ${helperNames.length} fonction(s) de domaine), ${tsFields.size} champ(s) déclaré(s) dans MyGameView.\n`
)

if (missingHelperBodies.length > 0) {
  console.log(`❌ Fonction(s) référencée(s) par get_my_game_view mais introuvable(s) dans les migrations : ${missingHelperBodies.join(', ')}`)
}

if (missingFromSql.length > 0) {
  console.log('❌ Champ(s) déclaré(s) dans MyGameView mais jamais retourné(s) par get_my_game_view (régression probable) :')
  for (const f of missingFromSql) console.log(`   - ${f}`)
}

if (missingFromTs.length > 0) {
  console.log('⚠️  Champ(s) retourné(s) par get_my_game_view mais absent(s) de MyGameView (type TS à mettre à jour, ou faux positif d’extraction) :')
  for (const f of missingFromTs) console.log(`   - ${f}`)
}

if (missingHelperBodies.length > 0 || missingFromSql.length > 0) {
  console.log('\nProblème(s) trouvé(s). Corrige avant de déployer.')
  process.exit(1)
}

console.log('✅ Tous les champs de MyGameView sont bien retournés par get_my_game_view.')
process.exit(0)
