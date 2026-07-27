import { test, expect } from '@playwright/test'

test.describe('Page d’accueil', () => {
  test('affiche le contenu principal et les CTA', async ({ page }) => {
    await page.goto('/')
    await expect(page.getByRole('heading', { name: /village dort/i })).toBeVisible()
    await expect(page.getByRole('link', { name: 'Lancer une partie' })).toBeVisible()
    await expect(page.getByRole('link', { name: 'Rejoindre avec un code' })).toBeVisible()
  })

  test('le panneau des règles se déplie et se replie', async ({ page }) => {
    await page.goto('/')

    // Replié par défaut : le contenu n'est même pas monté dans le DOM.
    await expect(page.getByText('🎯 Objectif')).toHaveCount(0)

    await page.getByRole('button', { name: /règles du jeu/i }).click()
    await expect(page.getByText('🎯 Objectif')).toBeVisible()
    await expect(page.getByText('🐺 Loup-Garou', { exact: false }).first()).toBeVisible()
    await expect(page.getByText('🏆 Victoire')).toBeVisible()

    await page.getByRole('button', { name: /règles du jeu/i }).click()
    await expect(page.getByText('🎯 Objectif')).toHaveCount(0)
  })
})
