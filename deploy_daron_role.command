#!/bin/bash
# Double-clique sur ce fichier pour déployer le nouveau rôle Le Daron 🛡️ :
#   1. Copie le contenu de la migration dans le presse-papiers et ouvre
#      l'éditeur SQL Supabase — colle (Cmd+V) et clique Run.
#   2. Vérifie le code (TypeScript + grants RPC + cohérence des champs de
#      get_my_game_view + build).
#   3. Prépare le commit (git add + commit) et affiche la commande "git push"
#      à coller toi-même pour envoyer vers GitHub (Vercel redéploie alors
#      automatiquement) — dernière étape volontairement manuelle.
#
# Contenu — nouveau rôle village :
#  - Chaque nuit, le Daron choisit un joueur vivant à protéger (auto-
#    protection autorisée). Si ce joueur est attaqué cette même nuit — par
#    les Loups-Garous OU par le poison de la Sorcière — l'attaque échoue et
#    il survit. Impossible de protéger la même personne deux nuits de suite.
#  - Le Daron ne voit jamais les rôles : il peut protéger un Loup-Garou sans
#    le savoir. Le récap du village reste entièrement anonyme quand une
#    protection réussit ("Un joueur a survécu grâce à la protection du
#    Daron cette nuit."), sans jamais dire qui ni contre quoi.
#  - Gagne avec le village dès que tous les Loups sont éliminés — aucune
#    condition de victoire à part.
#  - Disponible uniquement en configuration manuelle par l'hôte pour
#    l'instant (case à cocher dans "Rôles maison", à côté du Griot/Anancy/
#    Ange) — pas encore dans le mode de composition automatique.
#  - Petit bonus de classement (+10 pts) par protection réussie, comme le
#    sauvetage de la Sorcière.

set -e
cd "$(dirname "$0")"

trap 'echo; echo "❌ Une erreur est survenue (voir ci-dessus)."; read -p "Appuie sur Entrée pour fermer..."; exit 1' ERR

SUPABASE_PROJECT_REF="cdmxsuzemhdrygobmocp"

echo "==========================================="
echo " Nouveau rôle : Le Daron 🛡️"
echo "==========================================="
echo

echo "→ Étape 1/3 : migration SQL"
pbcopy < supabase/migrations/0158_daron_role.sql
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
    msg="Ajoute le rôle Le Daron (protection de nuit contre loups et poison)"
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
echo "  - Dashboard admin > salon d'attente : la case 'Daron' 🛡️ doit"
echo "    apparaître dans la section 'Rôles maison', à côté du Griot."
echo "  - Activer le Daron et lancer une partie : il doit agir en tout"
echo "    premier chaque nuit (avant même la Voyante), pouvoir se protéger"
echo "    lui-même, et ne pas pouvoir reprotéger la même personne que la"
echo "    nuit précédente (grisée dans la grille de sélection)."
echo "  - Faire attaquer par les loups (ou empoisonner par la Sorcière) le"
echo "    joueur protégé : il doit survivre, et le récap doit afficher"
echo "    'Un joueur a survécu grâce à la protection du Daron cette nuit.'"
echo "    sans jamais dire qui."
echo "  - Vérifier que le Daron voit bien, dans son propre récap, qui il a"
echo "    protégé (et si ça a servi), et que les autres joueurs ne voient"
echo "    rien de personnel à ce sujet."
echo "  - Faire lyncher l'Ancien à tort (si présent) : le Daron doit perdre"
echo "    son pouvoir comme la Voyante/la Sorcière/le Griot."
echo

read -p "Appuie sur Entrée pour fermer..."
