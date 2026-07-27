import { test, expect } from '@playwright/test'
import { TEST_USERS, loginAs } from './fixtures'

// Le compte de test n'a a priori aucune partie terminée à son actif (les
// parties créées par game-flow.spec.ts sont supprimées en fin de test) — on
// vérifie donc surtout que la page se charge et affiche un état "vide"
// propre plutôt qu'une erreur, plus le passage entre les deux onglets.
test('affiche la page de statistiques (mes stats + classement)', async ({ page }) => {
  const user = TEST_USERS[0]
  await loginAs(page, user.email)

  await page.goto('/stats')

  await expect(page.getByRole('heading', { name: 'Statistiques' })).toBeVisible()
  await expect(page.getByText('Parties jouées')).toBeVisible()
  await expect(page.getByText('Victoires', { exact: true })).toBeVisible()
  await expect(page.getByText('Taux de victoire')).toBeVisible()

  await page.getByRole('button', { name: 'Classement' }).click()
  await expect(page.getByText('🏆 Classement')).toBeVisible()
})
