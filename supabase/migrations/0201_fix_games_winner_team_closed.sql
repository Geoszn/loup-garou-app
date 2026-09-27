-- ============================================================================
-- Bug remonté : "Fermer le salon" échouait avec
-- `new row for relation "games" violates check constraint
-- "games_winner_team_check"`.
--
-- Cause trouvée en comparant la définition réelle de la contrainte en base
-- (village, loups, amoureux, anancy, ange, chasseuse) à celle voulue par la
-- migration 0164 (close_lobby) : cette dernière ajoutait 'closed' à la
-- liste, mais cet ALTER n'a jamais été appliqué sur cette base — seule la
-- fonction close_lobby (qui écrit winner_team = 'closed') l'a été. Ni la
-- migration 0164 ni aucune suivante ne s'en sont resynchronisées depuis.
--
-- Réapplique simplement la contrainte voulue (idempotent : drop + recreate).
-- ============================================================================
set search_path = public;

alter table public.games drop constraint if exists games_winner_team_check;
alter table public.games add constraint games_winner_team_check
  check (winner_team = any (array['village', 'loups', 'amoureux', 'anancy', 'ange', 'chasseuse', 'closed']));
