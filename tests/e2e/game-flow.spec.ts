// Test de bout en bout d'une partie complète à 4 joueurs (le minimum) :
// création, 3 arrivées par code, lancement, puis résolution générique de
// la partie jusqu'à la victoire d'un camp.
//
// Pourquoi 4 joueurs précisément : compute_default_role_counts(4) ne donne
// qu'un seul Loup-Garou et aucun rôle spécial côté village (voyante/
// sorcière/chasseur/petite_fille/cupidon nécessitent tous plus de joueurs,
// voir 0003_functions.sql). Ça réduit la partie à un seul type d'action de
// nuit (le loup choisit sa victime) et au vote de jour — jouable de façon
// totalement générique, sans avoir besoin de savoir à l'avance quel
// contexte a quel rôle. Le helper playRound() gère quand même les autres
// rôles (au cas où les réglages par défaut changeraient un jour), il ne
// s'en sert simplement jamais ici.
//
// Pour que le test tourne en un temps raisonnable, on raccourcit les
// minuteurs de la partie juste après sa création via update_game_settings
// (le vote et les actions de nuit à un seul acteur forcent de toute façon
// un passage immédiat à l'étape suivante dès que tout le monde a agi — voir
// submit_wolf_vote / submit_vote dans 0005_actions.sql — donc ce n'est que
// la phase de débat, purement chronométrée, qui bénéficie vraiment de ce
// raccourci).
import { test, expect, type Page } from '@playwright/test'
import { createClient } from '@supabase/supabase-js'
import './env'
import { TEST_PASSWORD, TEST_USERS } from './fixtures'

test.setTimeout(180_000)

test('une partie à 4 joueurs se termine sur la victoire d’un camp', async ({ browser }) => {
  test.skip(
    !process.env.VITE_SUPABASE_URL || !process.env.VITE_SUPABASE_ANON_KEY,
    'VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY manquants — voir .env.test.example.'
  )

  const contexts = await Promise.all(TEST_USERS.map(() => browser.newContext()))
  const pages = await Promise.all(contexts.map((c) => c.newPage()))
  let gameId: string | null = null

  try {
    // 1. Tout le monde se connecte.
    for (let i = 0; i < pages.length; i++) {
      await loginAs(pages[i], TEST_USERS[i].email)
    }

    // 2. L'hôte crée la partie (pop-up "Créer une partie" -> "Partie privée").
    const host = pages[0]
    await host.getByRole('button', { name: 'Créer une partie' }).click()
    await host.getByRole('button', { name: /Partie privée/ }).click()
    await host.waitForURL(/\/partie\/[A-Z0-9]+\/lobby/)
    const match = host.url().match(/\/partie\/([A-Z0-9]+)\/lobby/)
    if (!match) throw new Error('Code de partie introuvable dans l’URL après création.')
    const code = match[1]

    // 3. Les 3 autres rejoignent avec le code (pop-up "Rejoindre une partie"
    // -> "Entrer un code").
    for (let i = 1; i < pages.length; i++) {
      const page = pages[i]
      await page.goto('/dashboard')
      await page.getByRole('button', { name: 'Rejoindre une partie' }).click()
      await page.getByRole('button', { name: /Entrer un code/ }).click()
      await page.getByLabel('Code de la partie').fill(code)
      await page.getByRole('button', { name: 'Rejoindre' }).click()
      await page.waitForURL(/\/partie\/[A-Z0-9]+\/lobby/)
    }

    await expect(host.getByText(`Joueurs (${TEST_USERS.length}/20)`)).toBeVisible()

    // 4. Raccourcit les minuteurs pour que la partie se joue en quelques
    // dizaines de secondes plutôt qu'en plusieurs minutes.
    // Client Supabase "normal" (clé anon), juste authentifié comme l'hôte —
    // pas le client service_role (voir plus bas dans le finally, réservé au
    // nettoyage). update_game_settings vérifie lui-même que l'appelant est
    // bien l'hôte de la partie.
    const hostClient = createClient(process.env.VITE_SUPABASE_URL!, process.env.VITE_SUPABASE_ANON_KEY!)
    const { error: signInError } = await hostClient.auth.signInWithPassword({
      email: TEST_USERS[0].email,
      password: TEST_PASSWORD,
    })
    if (signInError) throw new Error(`Connexion API hôte échouée : ${signInError.message}`)

    const { data: game, error: gameError } = await hostClient.from('games').select('id').eq('code', code).single()
    if (gameError || !game) throw new Error(`Partie introuvable en base pour le code ${code}.`)
    gameId = game.id as string

    const { error: settingsError } = await hostClient.rpc('update_game_settings', {
      p_game_id: gameId,
      p_settings: {
        discussion_seconds: 6,
        vote_seconds: 5,
        vote_recap_seconds: 5,
        night_step_seconds: 5,
        role_reveal_seconds: 2,
      },
    })
    if (settingsError) throw new Error(`update_game_settings a échoué : ${settingsError.message}`)

    // 5. L'hôte lance la partie.
    await host.getByRole('button', { name: '🌙 Lancer la partie' }).click()
    await Promise.all(pages.map((page) => page.waitForURL(new RegExp(`/partie/${code}$`))))

    // 6. Boucle générique jusqu'à la fin de partie.
    await playUntilEnded(pages)

    // 7. Un des trois écrans de victoire doit être visible sur l'hôte.
    await expect(host.getByText(/triomphe|ont gagné/i)).toBeVisible()
  } finally {
    if (gameId && process.env.SUPABASE_SERVICE_ROLE_KEY) {
      try {
        const admin = createClient(process.env.VITE_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY, {
          auth: { autoRefreshToken: false, persistSession: false },
        })
        await admin.from('games').delete().eq('id', gameId)
      } catch {
        // Best-effort : un résidu de partie de test n'est pas bloquant.
      }
    }
    await Promise.all(contexts.map((c) => c.close()))
  }
})

async function loginAs(page: Page, email: string) {
  await page.goto('/connexion')
  await page.getByLabel('Email').fill(email)
  await page.getByLabel('Mot de passe').fill(TEST_PASSWORD)
  await page.getByRole('button', { name: 'Se connecter' }).click()
  await page.waitForURL('**/dashboard')
}

async function playUntilEnded(pages: Page[], timeoutMs = 150_000) {
  const deadline = Date.now() + timeoutMs

  while (Date.now() < deadline) {
    for (const page of pages) {
      if (await page.getByText('Partie terminée').isVisible().catch(() => false)) {
        return
      }
    }
    await Promise.all(pages.map((page) => takeGenericAction(page)))
    await new Promise((resolve) => setTimeout(resolve, 1500))
  }

  throw new Error('La partie ne s’est pas terminée dans le temps imparti.')
}

// Panneau d'action générique : quel que soit le rôle affiché à ce joueur en
// ce moment, prend l'option la plus neutre possible (jamais d'utilisation
// de pouvoir optionnel type sorcière/petite fille, jamais de tir de
// chasseur) pour garder le déroulement de la partie déterministe.
async function takeGenericAction(page: Page) {
  // Récap du vote (pop-up plein écran, pas un ActionPanel classique) :
  // clique sur "Continuer" dès qu'il est visible, pour ne pas attendre les
  // vote_recap_seconds à vide à chaque tour (voir migration 0027).
  const continueButton = page.getByRole('button', { name: 'Continuer' })
  if (await continueButton.isVisible().catch(() => false)) {
    await continueButton.click()
    return
  }

  const panel = page.locator('.shadow-blood-glow')
  if (!(await panel.isVisible().catch(() => false))) return

  const playerButton = panel.locator('.grid button:not([disabled])').first()

  if (await panel.getByText('Choisissez votre victime').isVisible().catch(() => false)) {
    if (await playerButton.isVisible().catch(() => false)) await playerButton.click()
    return
  }

  if (await panel.getByText('Votez pour éliminer un suspect').isVisible().catch(() => false)) {
    await panel.getByRole('button', { name: "S'abstenir" }).click()
    return
  }

  if (await panel.getByText("Sondez l'identité d'un joueur").isVisible().catch(() => false)) {
    if (await playerButton.isVisible().catch(() => false)) await playerButton.click()
    await panel.getByRole('button', { name: 'Sonder ce joueur' }).click()
    return
  }

  if (await panel.getByText('Vos potions').isVisible().catch(() => false)) {
    await panel.getByRole('button', { name: 'Confirmer et passer' }).click()
    return
  }

  if (await panel.getByText('Désignez les deux amoureux').isVisible().catch(() => false)) {
    const buttons = panel.locator('.grid button:not([disabled])')
    const count = await buttons.count()
    if (count >= 2) {
      await buttons.nth(0).click()
      await buttons.nth(1).click()
      await panel.getByRole('button', { name: 'Confirmer le couple' }).click()
    }
    return
  }

  if (await panel.getByText('Votre dernière flèche').isVisible().catch(() => false)) {
    await panel.getByRole('button', { name: 'Ne tirer sur personne' }).click()
  }
}
