import { test, expect } from '@playwright/test'
import { TEST_USERS, loginAs } from './fixtures'

// On réutilise une seule page et on change de compte via loginAs (Supabase
// remplace simplement la session côté client) : pas besoin de deux contextes
// de navigateur puisque rien ici n'exige que les deux comptes soient
// connectés en même temps, contrairement à game-flow.spec.ts.
test('demande d’ami, acceptation, puis suppression', async ({ page }) => {
  const [a, b] = TEST_USERS

  try {
    // 1. Récupère le code ami de B.
    await loginAs(page, b.email)
    await page.goto('/amis')
    const bCode = (await page.getByTestId('friend-code').innerText()).trim()
    expect(bCode.length).toBeGreaterThanOrEqual(4)

    // 2. A envoie une demande à B avec ce code.
    await loginAs(page, a.email)
    await page.goto('/amis')
    await page.getByLabel('Code ami').fill(bCode)
    await page.getByRole('button', { name: 'Envoyer une demande' }).click()
    await expect(page.getByText(/Demande envoyée\.|amis !/)).toBeVisible()

    // 3. B voit la demande entrante et l'accepte.
    await loginAs(page, b.email)
    await page.goto('/amis')
    await expect(page.getByText(a.username)).toBeVisible()
    await page.getByRole('button', { name: 'Accepter' }).click()

    // 4. A apparaît maintenant dans la liste d'amis de B.
    await expect(page.locator('li', { hasText: a.username }).getByRole('button', { name: 'Retirer' })).toBeVisible()
  } finally {
    // Nettoyage, quel que soit l'état où le test s'est arrêté (demande
    // encore en attente ou déjà acceptée), pour que le test reste rejouable.
    await loginAs(page, b.email)
    await page.goto('/amis')

    const refuseBtn = page.locator('li', { hasText: a.username }).getByRole('button', { name: 'Refuser' })
    if (await refuseBtn.isVisible().catch(() => false)) {
      await refuseBtn.click()
    } else {
      const removeBtn = page.locator('li', { hasText: a.username }).getByRole('button', { name: 'Retirer' })
      if (await removeBtn.isVisible().catch(() => false)) {
        await removeBtn.click()
      }
    }
  }
})
