// Exécuté une fois avant tous les tests (voir globalSetup dans
// playwright.config.ts). Crée — ou met à jour — les comptes de test via
// l'API admin de Supabase (createUser avec email_confirm: true), ce qui
// contourne la validation par email obligatoire de l'appli en production.
// Nécessite SUPABASE_SERVICE_ROLE_KEY (jamais exposée côté client, voir
// .env.test.example) : sans elle, les tests qui n'ont pas besoin d'un
// compte connecté (landing, formulaires) tournent quand même, les autres
// échoueront proprement avec un message clair.
import { createClient } from '@supabase/supabase-js'
import './env'
import { TEST_PASSWORD, TEST_USERS } from './fixtures'

export default async function globalSetup() {
  const url = process.env.VITE_SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!url || !serviceKey) {
    console.warn(
      '\n[e2e] VITE_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY manquants (voir .env.test.example).\n' +
        '[e2e] Les tests nécessitant un compte connecté (account, game-flow) vont échouer.\n'
    )
    return
  }

  const admin = createClient(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })

  const { data: existing, error: listError } = await admin.auth.admin.listUsers({ perPage: 1000 })
  if (listError) {
    throw new Error(`[e2e] Impossible de lister les utilisateurs Supabase : ${listError.message}`)
  }

  for (const user of TEST_USERS) {
    const found = existing.users.find((u) => u.email === user.email)
    if (found) {
      const { error } = await admin.auth.admin.updateUserById(found.id, {
        password: TEST_PASSWORD,
        email_confirm: true,
        user_metadata: { username: user.username },
      })
      if (error) throw new Error(`[e2e] Échec mise à jour ${user.email} : ${error.message}`)
      continue
    }

    const { error } = await admin.auth.admin.createUser({
      email: user.email,
      password: TEST_PASSWORD,
      email_confirm: true,
      user_metadata: { username: user.username },
    })
    if (error) throw new Error(`[e2e] Échec création ${user.email} : ${error.message}`)
  }

  console.log(`[e2e] ${TEST_USERS.length} comptes de test prêts (${TEST_USERS[0].email}...).`)
}
