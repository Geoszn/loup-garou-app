#!/bin/bash
cd "$(dirname "$0")"
echo "=== npm run build ==="
npm run build
echo ""
echo "=== npx cap sync ios ==="
npx cap sync ios
echo ""
echo "=== Verification du correctif apiUrl (doit contenir loupgarouafrique.com) ==="
if grep -l "loupgarouafrique.com" ios/App/App/public/assets/*.js 2>/dev/null; then
  echo ">>> FIX PRESENT DANS LE BUNDLE IOS <<<"
else
  echo ">>> FIX ABSENT DU BUNDLE IOS - PROBLEME <<<"
fi
echo ""
echo "Ouvre ios/App/App.xcodeproj dans Xcode et relance (bouton Run)."
read -p "Appuie sur Entrée pour fermer..."
