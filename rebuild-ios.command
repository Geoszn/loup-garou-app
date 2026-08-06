#!/bin/bash
# Double-clique sur ce fichier pour resynchroniser le projet iOS avec les
# derniers changements (icône, écran de démarrage, permissions).
cd "$(dirname "$0")"
echo "=== npx cap sync ios ==="
npx cap sync ios
echo ""
echo "Terminé. Ouvre ios/App/App.xcodeproj dans Xcode et relance (bouton Run)."
echo "(Pas de .xcworkspace ici : ce projet utilise Swift Package Manager, pas CocoaPods.)"
read -p "Appuie sur Entrée pour fermer..."
