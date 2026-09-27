// Rejoue TOUTES les migrations de supabase/migrations/, dans l'ordre, sur
// une base neuve — pense à bootstrapper un projet Supabase de STAGING en une
// commande, plutôt que de coller 203 fichiers un par un avec run-sql-file.mjs.
// Chaque migration utilise `create table if not exists` / `create or replace
// function` depuis la toute première (0001) : rejouer toute la suite sur une
// base vide est donc sûr et déjà comment ce projet a toujours été pensé.
//
// Chaque fichier est envoyé comme UNE requête (comme run-sql-file.mjs) :
// Postgres traite un texte multi-instructions envoyé en un seul message
// comme une transaction implicite, donc un échec au milieu d'un fichier
// annule CE fichier entièrement — mais n'annule pas les fichiers précédents
// déjà appliqués avec succès. En cas d'échec, le script s'arrête net (les
// migrations suivantes dépendent presque toujours des précédentes) : corrige
// le fichier fautif puis relance — les fichiers déjà appliqués ne seront pas
// rejoués à l'identique (sans risque grâce à IF NOT EXISTS/CREATE OR REPLACE),
// donc relancer depuis le début après une correction est toujours sûr.
//
// Garde-fou : refuse de tourner contre le projet de PRODUCTION connu de ce
// dépôt (identifiant cdmxsuzemhdrygobmocp), sauf --force explicite — pensé
// pour une base de staging neuve, jamais pour rejouer l'historique sur la
// prod déjà à jour.
//
// Usage :
//   export SUPABASE_DB_URL='postgres://postgres.xxxx:MOT_DE_PASSE@aws-0-xxxx.pooler.supabase.com:5432/postgres'
//   node scripts/run-all-migrations.mjs
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import pg from 'pg'

const PROD_PROJECT_REF = 'cdmxsuzemhdrygobmocp'
const force = process.argv.includes('--force')

const connectionString = process.env.SUPABASE_DB_URL
if (!connectionString) {
  console.error('Variable d\'environnement SUPABASE_DB_URL manquante.')
  console.error('Récupère la connection string dans Supabase : Project Settings → Database → Connection string (URI).')
  process.exit(1)
}

if (connectionString.includes(PROD_PROJECT_REF) && !force) {
  console.error(`❌ SUPABASE_DB_URL pointe vers le projet de PRODUCTION (${PROD_PROJECT_REF}).`)
  console.error('Ce script est fait pour bootstrapper une base neuve (staging), pas pour rejouer l\'historique sur la prod déjà à jour.')
  console.error('Si c\'est vraiment voulu, relance avec --force.')
  process.exit(1)
}

const migrationsDir = join(import.meta.dirname, '..', 'supabase', 'migrations')
const files = readdirSync(migrationsDir)
  .filter((f) => f.endsWith('.sql'))
  .sort()

console.log(`${files.length} fichier(s) de migration trouvé(s) dans supabase/migrations/.`)

const client = new pg.Client({ connectionString, ssl: { rejectUnauthorized: false } })
await client.connect()

for (const file of files) {
  const sql = readFileSync(join(migrationsDir, file), 'utf-8')
  process.stdout.write(`→ ${file} ... `)
  try {
    await client.query(sql)
    console.log('✅')
  } catch (err) {
    console.log('❌')
    console.error(`Échec sur ${file} : ${err.message}`)
    await client.end()
    process.exit(1)
  }
}

await client.end()
console.log(`✅ Les ${files.length} migrations ont été appliquées avec succès.`)
