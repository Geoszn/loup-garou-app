-- Test de bout en bout de la saison 2, ÉTAPE 5 : REFERME la saison (début remis au 1er décembre 2026 00:00 UTC).
--   node scripts/run-sql-file.mjs supabase/ops/season_test_close.sql
-- Rend aussi sa fenêtre d'annonce de lancement à tous les joueurs qui l'auraient vue pendant le test (la fenêtre n'apparaît qu'une
-- fois par joueur : sans cette remise à zéro, ils ne la reverraient pas le vrai jour du lancement).
-- Ne supprime AUCUNE donnée de jeu : l'XP, le pass et les pièces obtenus pendant le test restent (voir le diagnostic pour les contrôler).
do $$
declare
  v_season uuid;
begin
  select id into v_season from public.seasons where slug = 'noel-au-village';
  if v_season is null then
    raise exception 'Saison introuvable.';
  end if;

  update public.seasons set starts_at = timestamptz '2026-12-01 00:00:00+00' where id = v_season;
  delete from public.announcement_views where announcement_key = 'season-launch-noel-au-village';

  raise notice 'Saison REFERMÉE : début au 1er décembre 2026 00:00 UTC.';
end;
$$;
