#!/bin/bash
# Double-clique sur ce fichier pour déployer le nouveau rôle Anancy,
# Tisseur des Destins (migration 0119) :
#   1. Copie le contenu de la migration dans le presse-papiers et ouvre
#      l'éditeur SQL Supabase — colle (Cmd+V) et clique Run.
#   2. Vérifie le code (TypeScript + grants RPC + build).
#   3. Commit + push (Vercel redéploie automatiquement).

set -e
cd "$(dirname "$0")"

trap 'echo; echo "❌ Une erreur est survenue (voir ci-dessus)."; read -p "Appuie sur Entrée pour fermer..."; exit 1' ERR

SUPABASE_PROJECT_REF="cdmxsuzemhdrygobmocp"

echo "==========================================="
echo " Anancy, Tisseur des Destins — déploiement"
echo "==========================================="
echo

echo "→ Étape 1/3 : migration SQL"
pbcopy < supabase/migrations/0119_anancy_role.sql
echo "Le contenu de la migration a été copié dans le presse-papiers."
echo "⚠️  Migration volumineuse (nouveau camp neutre, nouvelle table,"
echo "   advance_phase entièrement réécrite) — laisse le temps à l'éditeur"
echo "   SQL de l'exécuter entièrement avant de continuer."
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
    msg="Ajoute le rôle Anancy, Tisseur des Destins (camp neutre, échange de rôles, victoire personnelle au jour 5)"
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
echo "À tester (au moins 5-6 joueurs, sinon la partie n'atteindra jamais la nuit 5) :"
echo "  - Réglages du salon : le toggle 🕸️ Anancy apparaît, désactivé par défaut."
echo "  - La nuit, Anancy joue TOUJOURS EN DERNIER (après la Sorcière)."
echo "  - Il peut choisir 2 joueurs (jamais lui-même, jamais un joueur déjà 'grisé')."
echo "  - Le lendemain, les DEUX joueurs échangés voient (seuls) 'Le destin a changé',"
echo "    sans savoir ni par qui ni vers quel rôle."
echo "  - Un joueur déjà échangé une fois n'est plus sélectionnable les nuits suivantes."
echo "  - S'il est encore vivant au début du jour 5 : victoire immédiate, personnelle,"
echo "    peu importe l'état des loups/villageois à ce moment-là."
echo
read -p "Appuie sur Entrée pour fermer..."
