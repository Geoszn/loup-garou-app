#!/bin/bash
# Double-clique sur ce fichier dans le Finder pour reconstruire le web build
# et resynchroniser le projet Android avec les derniers changements
# (icône, écran de démarrage, permissions, mise en page).
cd "$(dirname "$0")"
echo "=== npm run build ==="
npm run build
echo ""
echo "=== npx cap sync android ==="
npx cap sync android
echo ""
echo "Terminé. Tu peux fermer cette fenêtre et relancer l'app depuis Android Studio (bouton Run)."
read -p "Appuie sur Entrée pour fermer..."
