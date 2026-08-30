#!/bin/bash
# Double-clique sur ce fichier pour déployer le nouveau rôle Le Sans-Visage
# (migration 0118) :
#   1. Copie le contenu de la migration dans le presse-papiers et ouvre
#      l'éditeur SQL Supabase — colle (Cmd+V) et clique Run.
#   2. Vérifie le code (TypeScript + grants RPC + build).
#   3. Commit + push (Vercel redéploie automatiquement).

set -e
cd "$(dirname "$0")"

trap 'echo; echo "❌ Une erreur est survenue (voir ci-dessus)."; read -p "Appuie sur Entrée pour fermer..."; exit 1' ERR

SUPABASE_PROJECT_REF="cdmxsuzemhdrygobmocp"

echo "==========================================="
echo " Le Sans-Visage — déploiement"
echo "==========================================="
echo

echo "→ Étape 1/3 : migration SQL"
pbcopy < supabase/migrations/0118_sans_visage_role.sql
echo "Le contenu de la migration a été copié dans le presse-papiers."
echo "⚠️  Migration volumineuse (17 fonctions touchées) — laisse le temps à"
echo "   l'éditeur SQL de l'exécuter entièrement avant de continuer."
open "https://supabase.com/dashboard/project/${SUPABASE_PROJECT_REF}/sql/new"
echo "→ Dans l'éditeur SQL qui vient de s'ouvrir : colle (Cmd+V) puis clique sur Run."
read -p "Appuie sur Entrée une fois la migration exécutée avec succès..."

echo
echo "→ Étape 2/3 : vérification du code"
echo
echo "→ Vérification TypeScript..."
npx tsc -b

echo
echo "→ Vérification des grants RPC..."
npm run check:rpc

echo
echo "→ Build de production..."
npm run build

echo
echo "→ Étape 3/3 : déploiement"
echo
echo "→ Fichiers modifiés :"
git status --short

CHANGES=$(git status --porcelain)
if [ -z "$CHANGES" ]; then
  echo
  echo "Aucun changement de code à pousser."
else
  echo
  read -p "Message de commit (laisse vide pour un message automatique) : " msg
  if [ -z "$msg" ]; then
    msg="Ajoute le rôle Le Sans-Visage (loup infiltré, invisible pour la Voyante uniquement)"
  fi
  git add -A
  git commit -m "$msg"
  echo
  echo "→ Envoi vers GitHub (Vercel va redéployer automatiquement)..."
  git push
fi

echo
echo "✅ Terminé. Vercel reconstruit le site — 1 à 2 minutes."
echo
echo "À tester avec au moins 2 loups (1 Sans-Visage + 1 loup simple) et 1 Voyante :"
echo "  - Réglages du salon : le toggle 👤 Sans-Visage apparaît, désactivé par défaut."
echo "  - Une fois en partie : le Sans-Visage vote chaque nuit avec les autres loups,"
echo "    exactement comme un loup simple (même panneau, même chat des loups)."
echo "  - La Voyante sonde le Sans-Visage : elle voit 'Villageois', jamais 'Loup-Garou'."
echo "  - La Voyante sonde un vrai villageois : résultat identique — indiscernables."
echo "  - Fin de partie gagnée par les loups : le Sans-Visage partage bien la victoire."
echo
read -p "Appuie sur Entrée pour fermer..."
