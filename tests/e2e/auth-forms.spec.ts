import { test, expect } from '@playwright/test'

test.describe('Formulaires d’authentification', () => {
  test('inscription : refuse un mot de passe trop court', async ({ page }) => {
    await page.goto('/inscription')
    await page.getByLabel('Pseudo').fill('Testeur E2E')
    await page.getByLabel('Email').fill(`e2e-refuse-${Date.now()}@example.test`)
    await page.getByLabel('Mot de passe').fill('123')
    await page.getByRole('button', { name: 'Créer mon compte' }).click()
    await expect(page.getByText(/6 caractères/i)).toBeVisible()
  })

  test('inscription : refuse un pseudo trop court', async ({ page }) => {
    await page.goto('/inscription')
    await page.getByLabel('Pseudo').fill('A')
    await page.getByLabel('Email').fill(`e2e-refuse-${Date.now()}@example.test`)
    await page.getByLabel('Mot de passe').fill('unMotDePasseValide123')
    await page.getByRole('button', { name: 'Créer mon compte' }).click()
    await expect(page.getByText(/2 caractères/i)).toBeVisible()
  })

  test('connexion : identifiants invalides affichent une erreur', async ({ page }) => {
    await page.goto('/connexion')
    await page.getByLabel('Email').fill('inexistant-e2e@example.test')
    await page.getByLabel('Mot de passe').fill('mauvaispassword')
    await page.getByRole('button', { name: 'Se connecter' }).click()
    await expect(page.getByText(/incorrect/i)).toBeVisible()
  })
})
