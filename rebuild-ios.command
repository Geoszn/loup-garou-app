#!/bin/bash
# Double-clique sur ce fichier pour resynchroniser le projet iOS avec les
# derniers changements (icône, écran de démarrage, permissions).
cd "$(dirname "$0")"
echo "=== npx cap sync ios ==="
npx cap sync ios
echo ""
echo "Terminé. Ouvre ios/App/App.xcworkspace dans Xcode et relance (bouton Run)."
read -p "Appuie sur Entrée pour fermer..."
