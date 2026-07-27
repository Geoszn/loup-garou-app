import { test, expect } from '@playwright/test'
import { TEST_USERS, loginAs } from './fixtures'

test('modifier le pseudo et l’icône depuis Mon compte', async ({ page }) => {
  const user = TEST_USERS[0]
  await loginAs(page, user.email)

  await page.goto('/compte')
  const newName = `${user.username} ${Date.now() % 100000}`

  await page.getByLabel('Pseudo').fill(newName)
  await page.getByRole('button', { name: "Choisir l'icône 🦇" }).click()
  await page.getByRole('button', { name: 'Enregistrer' }).click()

  await expect(page.getByText('Profil mis à jour.')).toBeVisible()

  // Recharger confirme que c'est bien persisté côté serveur, pas juste dans
  // l'état local du formulaire.
  await page.reload()
  await expect(page.getByLabel('Pseudo')).toHaveValue(newName)

  // Remet le pseudo d'origine pour ne pas polluer les autres tests qui
  // réutilisent ce compte.
  await page.getByLabel('Pseudo').fill(user.username)
  await page.getByRole('button', { name: "Choisir l'icône 🐺" }).click()
  await page.getByRole('button', { name: 'Enregistrer' }).click()
  await expect(page.getByText('Profil mis à jour.')).toBeVisible()
})

test('refuse un mot de passe actuel incorrect', async ({ page }) => {
  const user = TEST_USERS[0]
  await loginAs(page, user.email)
  await page.goto('/compte')

  // { exact: true } est nécessaire ici : "Nouveau mot de passe" est un
  // sous-texte de "Confirmer le nouveau mot de passe", et getByLabel fait un
  // matching par sous-chaîne par défaut — sans ça Playwright lève une
  // "strict mode violation" (2 éléments correspondent).
  await page.getByLabel('Mot de passe actuel').fill('ceci-est-faux')
  await page.getByLabel('Nouveau mot de passe', { exact: true }).fill('unNouveauMotDePasse123')
  await page.getByLabel('Confirmer le nouveau mot de passe').fill('unNouveauMotDePasse123')
  await page.getByRole('button', { name: 'Modifier le mot de passe' }).click()

  await expect(page.getByText('Mot de passe actuel incorrect.')).toBeVisible()
})
