// Variante en LECTURE de run-sql-file.mjs : exécute un fichier .sql (une
// requête SELECT en général) et affiche les lignes résultat en JSON, plutôt
// que de se contenter d'un message de succès — utile pour diagnostiquer un
// bug en base sans passer par l'éditeur SQL web de Supabase (voir
// run-sql-file.mjs pour le pourquoi de cette contrainte).
//
// Usage :
//   export SUPABASE_DB_URL='postgres://postgres:MOT_DE_PASSE@db.XXXX.supabase.co:5432/postgres'
//   node scripts/query-sql-file.mjs chemin/vers/requete.sql
import { readFileSync } from 'node:fs'
import pg from 'pg'

const filePath = process.argv[2]
if (!filePath) {
  console.error('Usage: node scripts/query-sql-file.mjs <chemin/vers/requete.sql>')
  process.exit(1)
}

const connectionString = process.env.SUPABASE_DB_URL
if (!connectionString) {
  console.error('Variable d\'environnement SUPABASE_DB_URL manquante.')
  console.error('export SUPABASE_DB_URL=\'postgres://postgres:MOT_DE_PASSE@db.XXXX.supabase.co:5432/postgres\'')
  process.exit(1)
}

const sql = readFileSync(filePath, 'utf-8')

const client = new pg.Client({ connectionString, ssl: { rejectUnauthorized: false } })

try {
  await client.connect()
  const result = await client.query(sql)
  // Un fichier à plusieurs requêtes renvoie un tableau de résultats : on
  // n'affiche que ceux qui ont des lignes (les begin/set/rollback n'en ont pas).
  const rows = Array.isArray(result) ? result.filter((r) => r.rows?.length).flatMap((r) => r.rows) : result.rows
  console.log(JSON.stringify(rows, null, 2))
} catch (err) {
  console.error('❌ Échec :', err.message)
  process.exitCode = 1
} finally {
  await client.end()
}
