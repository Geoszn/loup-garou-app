#!/bin/bash
# Double-clique sur ce fichier pour déployer le nouveau rôle Le Griot
# (migration 0116) :
#   1. Copie le contenu de la migration dans le presse-papiers et ouvre
#      l'éditeur SQL Supabase — colle (Cmd+V) et clique Run.
#   2. Vérifie le code (TypeScript + grants RPC + build).
#   3. Commit + push (Vercel redéploie automatiquement).

set -e
cd "$(dirname "$0")"

trap 'echo; echo "❌ Une erreur est survenue (voir ci-dessus)."; read -p "Appuie sur Entrée pour fermer..."; exit 1' ERR

SUPABASE_PROJECT_REF="cdmxsuzemhdrygobmocp"

echo "==========================================="
echo " Le Griot — déploiement"
echo "==========================================="
echo

echo "→ Étape 1/3 : migration SQL"
pbcopy < supabase/migrations/0116_griot_role.sql
echo "Le contenu de la migration a été copié dans le presse-papiers."
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
    msg="Ajoute le rôle Le Griot (village, information) : trace vague de l'action d'un joueur la nuit précédente"
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
echo "À tester (idéalement avec le minimum Alpha désactivé si tu veux tester en petit comité, voir plus haut) :"
echo "  - Réglages du salon : le toggle 🎭 Griot apparaît, désactivé par défaut."
echo "  - Une fois activé et la partie lancée : la nuit 1, le Griot ne joue PAS (aucun panneau pour lui)."
echo "  - Nuit 2 : le Griot choisit un joueur juste après la Voyante, avant les Loups."
echo "  - Il ne peut pas se cibler lui-même, ni cibler un joueur mort."
echo "  - Après la résolution : son historique affiche 'Nuit 1 — [nom] [action]', jamais un rôle."
echo "  - Compte VILLAGEOIS ou tout autre rôle : ne voit jamais cette information, à aucun moment."
echo "  - Cibler une Voyante / un Loup / la Sorcière (qui a utilisé un pouvoir) / quelqu'un de passif :"
echo "    vérifier que chaque phrase correspond bien à l'exemple attendu."
echo
read -p "Appuie sur Entrée pour fermer..."
