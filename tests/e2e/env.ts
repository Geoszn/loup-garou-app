// Petit chargeur de .env.test écrit à la main, pour ne pas ajouter une
// dépendance `dotenv` juste pour ça. Importé en premier par
// playwright.config.ts et par global-setup.ts (les deux tournent dans des
// process Node séparés, donc les deux doivent charger le fichier).
import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'

function loadEnvFile(filename: string) {
  const path = resolve(process.cwd(), filename)
  if (!existsSync(path)) return

  for (const rawLine of readFileSync(path, 'utf8').split('\n')) {
    const line = rawLine.trim()
    if (!line || line.startsWith('#')) continue
    const eq = line.indexOf('=')
    if (eq === -1) continue
    const key = line.slice(0, eq).trim()
    let value = line.slice(eq + 1).trim()
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1)
    }
    // Ne jamais écraser une variable déjà présente dans l'environnement
    // (permet de surcharger .env.test via le shell si besoin).
    if (!(key in process.env)) process.env[key] = value
  }
}

loadEnvFile('.env.test')
