#!/bin/bash
# Double-clique sur ce fichier pour resynchroniser le projet iOS avec les
# derniers changements (icône, écran de démarrage, permissions).
cd "$(dirname "$0")"
echo "=== npm install ==="
npm install
echo ""
echo "=== npm run build ==="
npm run build
echo ""
echo "=== npx cap sync ios ==="
npx cap sync ios
echo ""
echo ""
echo "=== VERIF FIX APIURL ==="
if grep -l "loupgarouafrique.com" ios/App/App/public/assets/*.js 2>/dev/null; then
  echo ">>> FIX PRESENT <<<"
else
  echo ">>> FIX ABSENT <<<"
fi
echo ""
echo "Terminé. Ouvre ios/App/App.xcodeproj dans Xcode et relance (bouton Run)."
echo "(Pas de .xcworkspace ici : ce projet utilise Swift Package Manager, pas CocoaPods.)"
read -p "Appuie sur Entrée pour fermer..."
