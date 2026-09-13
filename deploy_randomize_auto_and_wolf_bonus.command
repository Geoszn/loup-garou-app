#!/bin/bash
# Double-clique sur ce fichier pour déployer trois ajustements (migration
# 0145) :
#   1. Copie le contenu de la migration dans le presse-papiers et ouvre
#      l'éditeur SQL Supabase — colle (Cmd+V) et clique Run.
#   2. Vérifie le code (TypeScript + grants RPC + cohérence des champs de
#      get_my_game_view + build).
#   3. Prépare le commit (git add + commit) et affiche la commande "git push"
#      à coller toi-même pour envoyer vers GitHub (Vercel redéploie alors
#      automatiquement) — dernière étape volontairement manuelle.
#
# Contenu :
#  - Le mode automatique de composition (salon d'attente) choisit désormais
#    une composition VARIÉE à chaque fois (au lieu de toujours la même pour
#    un même effectif), y compris côté loups (Loup Alpha / Sans-Visage /
#    Grand Méchant Loup possibles), tout en restant équilibré (garde-fou
#    testé sur 200 000 tirages simulés, jamais de dépassement).
#  - "+ Ajouter un bot" et "Faire jouer les bots" disparaissent dès qu'un
#    vrai second joueur (pas juste toi, l'admin) est dans la partie.
#  - Une victoire en tant que Loup-Garou (ou variante) rapporte désormais
#    +15 points, pour refléter la difficulté d'être minoritaire.

set -e
cd "$(dirname "$0")"

trap 'echo; echo "❌ Une erreur est survenue (voir ci-dessus)."; read -p "Appuie sur Entrée pour fermer..."; exit 1' ERR

SUPABASE_PROJECT_REF="cdmxsuzemhdrygobmocp"

echo "==========================================="
echo " Variété du mode auto + bonus loup — déploiement"
echo "==========================================="
echo

echo "→ Étape 1/3 : migration SQL"
pbcopy < supabase/migrations/0145_randomize_auto_role_counts.sql
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
echo "→ Vérification des champs de get_my_game_view..."
npm run check:game-view

echo
echo "→ Build de production..."
npm run build

echo
echo "→ Étape 3/3 : préparation du commit"
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
    msg="Ajoute de la variété au mode auto (dont les cartes loups) et un bonus de +15 points pour une victoire loup"
  fi
  git add -A
  git commit -m "$msg"
  echo
  echo "✅ Commit créé localement. Dernière étape, à faire toi-même (copie/colle) :"
  echo
  echo "     git push"
  echo
  echo "   (Vercel redéploiera automatiquement une fois envoyé sur GitHub.)"
fi

echo
echo "À tester une fois déployé :"
echo "  - Salon avec au moins un bot ajouté, puis un VRAI second compte qui"
echo "    rejoint : les boutons 'Ajouter un bot' et 'Faire jouer les bots'"
echo "    doivent disparaître immédiatement dès son arrivée."
echo "  - Mode auto activé, effectif fixe (ex. 12) : ouvre/referme les"
echo "    réglages plusieurs fois — la composition annoncée doit varier"
echo "    (rôles différents, parfois une variante de loup, parfois non)."
echo "  - Lance plusieurs parties en mode auto à effectif variés (6, 10, 20) :"
echo "    jamais d'échec au lancement, jamais deux variantes de loup en même"
echo "    temps."
echo "  - Termine une partie gagnée par les loups : l'écran de fin doit"
echo "    afficher '+15' pour le bonus 'Victoire en tant que Loup-Garou'."
echo
read -p "Appuie sur Entrée pour fermer..."
