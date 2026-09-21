// Exécute un fichier .sql directement contre la base Supabase via une vraie
// connexion Postgres (pg), en lisant le fichier en UTF-8 depuis le disque —
// aucun copier-coller, aucun navigateur impliqué. Contourne définitivement
// la corruption d'accents rencontrée en collant dans l'éditeur SQL de
// Supabase (voir migrations 0170/0171 et la mémoire persistante associée) :
// Safari (et possiblement d'autres apps du Mac) réinterprète mal les octets
// UTF-8 au collage, mais lire un fichier avec fs.readFileSync(path, 'utf-8')
// n'a jamais ce problème.
//
// Usage :
//   export SUPABASE_DB_URL='postgres://postgres:MOT_DE_PASSE@db.XXXX.supabase.co:5432/postgres'
//   node scripts/run-sql-file.mjs supabase/migrations/0171_xxx.sql
//
// SUPABASE_DB_URL n'est JAMAIS écrit dans ce dépôt ni envoyé où que ce soit
// par ce script — uniquement lu depuis l'environnement du terminal où on le
// lance.
import { readFileSync } from 'node:fs'
import pg from 'pg'

const filePath = process.argv[2]
if (!filePath) {
  console.error('Usage: node scripts/run-sql-file.mjs <chemin/vers/fichier.sql>')
  process.exit(1)
}

const connectionString = process.env.SUPABASE_DB_URL
if (!connectionString) {
  console.error('Variable d\'environnement SUPABASE_DB_URL manquante.')
  console.error('Récupère la connection string dans Supabase : Project Settings → Database → Connection string (URI).')
  console.error('Puis : export SUPABASE_DB_URL=\'postgres://postgres:MOT_DE_PASSE@db.XXXX.supabase.co:5432/postgres\'')
  process.exit(1)
}

const sql = readFileSync(filePath, 'utf-8')
console.log(`→ ${filePath} (${sql.length} caractères, lu en UTF-8 depuis le disque)`)

const client = new pg.Client({ connectionString, ssl: { rejectUnauthorized: false } })

try {
  await client.connect()
  await client.query(sql)
  console.log('✅ Migration appliquée avec succès.')
} catch (err) {
  console.error('❌ Échec :', err.message)
  process.exitCode = 1
} finally {
  await client.end()
}
