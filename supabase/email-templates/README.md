# Templates d'email Supabase Auth

Le seul email envoyé aujourd'hui par l'appli est la confirmation d'inscription
(`confirm-signup.html`). Supabase ne lit pas ces fichiers directement — il faut
copier leur contenu dans le dashboard.

## 1. Déposer le logo

Le template référence `https://loup-garou-app-six.vercel.app/email-logo.png`.
Ce fichier n'existe pas encore dans le projet : enregistre l'image du logo
(le badge loup doré rond que tu as créé) sous :

```
public/email-logo.png
```

Format recommandé : PNG, fond carré (le fond noir du logo se fond bien avec
la carte de l'email), largeur autour de 500-600px suffit (affiché à 140px
dans l'email, pas besoin de plus lourd). Une fois le fichier ajouté,
redéploie (`npx vercel --prod`) pour que l'URL réponde.

## 2. Appliquer le template dans Supabase

1. Dashboard Supabase → **Authentication → Emails → Email Templates**.
2. Sélectionne **Confirm signup**.
3. Bascule l'éditeur en mode **Source** (HTML brut, pas l'éditeur visuel).
4. Remplace tout le contenu par celui de `confirm-signup.html`.
5. Optionnel : change aussi le **Subject** en `🌕 Confirmez votre compte — Loup Garou d'Afrique`.
6. Enregistre, puis fais un test d'inscription pour vérifier le rendu (Gmail,
   et si possible un client différent — le rendu peut varier).

Si vous ajoutez plus tard un flux "mot de passe oublié" (`resetPasswordForEmail`),
le même style pourra être repris pour le template **Reset password** — demande-le
et je l'adapterai à ce moment-là.
