#!/bin/bash
# Double-clique sur ce fichier pour déployer les rôles L'Ange et le Grand
# Méchant Loup (migration 0121) :
#   1. Copie le contenu de la migration dans le presse-papiers et ouvre
#      l'éditeur SQL Supabase — colle (Cmd+V) et clique Run.
#   2. Vérifie le code (TypeScript + grants RPC + build).
#   3. Commit + push (Vercel redéploie automatiquement).

set -e
cd "$(dirname "$0")"

trap 'echo; echo "❌ Une erreur est survenue (voir ci-dessus)."; read -p "Appuie sur Entrée pour fermer..."; exit 1' ERR

SUPABASE_PROJECT_REF="cdmxsuzemhdrygobmocp"

echo "==========================================="
echo " L'Ange & Le Grand Méchant Loup — déploiement"
echo "==========================================="
echo

echo "→ Étape 1/3 : migration SQL"
pbcopy < supabase/migrations/0121_ange_and_grand_mechant_loup.sql
echo "Le contenu de la migration a été copié dans le presse-papiers."
echo "⚠️  Migration volumineuse (18 fonctions touchées, 2 nouveaux rôles) —"
echo "   laisse le temps à l'éditeur SQL de l'exécuter entièrement."
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
    msg="Ajoute les rôles L'Ange (victoire solo si mort au premier cycle) et le Grand Méchant Loup (seconde victime tant qu'aucun loup n'est mort)"
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
echo "À tester :"
echo "  - Réglages du salon : les toggles 👼 Ange et 👹 Grand Méchant Loup"
echo "    apparaissent, désactivés par défaut."
echo "  - L'Ange : s'il meurt (loups, vote, chagrin...) pendant la nuit 1 OU"
echo "    le vote du jour 1, victoire immédiate et solitaire. S'il survit,"
echo "    il redevient un simple villageois pour le reste de la partie."
echo "  - Le Grand Méchant Loup : vote avec la meute normalement, PUIS un"
echo "    second tour de nuit lui permet de dévorer une victime en plus"
echo "    (différente de celle de la meute, jamais un autre loup) — la"
echo "    Sorcière ne peut pas la sauver. Dès qu'un loup meurt (n'importe"
echo "    lequel), ce second tour n'apparaît plus les nuits suivantes."
echo
read -p "Appuie sur Entrée pour fermer..."
