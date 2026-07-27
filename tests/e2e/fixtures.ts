import type { Page } from '@playwright/test'
import './env'

export const TEST_PASSWORD = process.env.TEST_USER_PASSWORD || 'TestPassword123!'

// 4 joueurs : c'est le minimum pour lancer une partie, et avec 4 joueurs la
// répartition par défaut (compute_default_role_counts) ne donne qu'un seul
// Loup-Garou et aucun rôle spécial côté village — ce qui rend une partie
// jouable de façon totalement générique dans game-flow.spec.ts (un seul
// type d'action de nuit possible, pas besoin de deviner qui a quel rôle).
export const TEST_USERS = Array.from({ length: 4 }, (_, i) => ({
  email: `e2e-player-${i + 1}@example.test`,
  username: `E2E Joueur ${i + 1}`,
}))

export async function loginAs(page: Page, email: string, password: string = TEST_PASSWORD) {
  await page.goto('/connexion')
  await page.getByLabel('Email').fill(email)
  await page.getByLabel('Mot de passe').fill(password)
  await page.getByRole('button', { name: 'Se connecter' }).click()
  await page.waitForURL('**/dashboard')
}
