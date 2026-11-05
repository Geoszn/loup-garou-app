-- 0271 : nouveaux blasons dessinés pour les tribus (panthère, crocodile, buffle, baobab), en plus des 12 emblèmes d'origine
-- (0222), qui restent valides pour les tribus qui les portent déjà. create_tribe et update_tribe n'ont pas à changer : ils
-- s'appuient sur cette contrainte (« Blason ou couleur invalide. » si l'emblème n'est pas dans la liste).
-- Rejouable : TOUTE contrainte de vérification portant sur l'emblème est retirée (quel que soit son nom en base), puis la
-- nouvelle est posée sous le nom tribes_emblem_check.

do $$
declare
  c record;
begin
  for c in
    select con.conname
    from pg_constraint con
    where con.conrelid = 'public.tribes'::regclass and con.contype = 'c' and pg_get_constraintdef(con.oid) ilike '%emblem%'
  loop
    execute format('alter table public.tribes drop constraint %I', c.conname);
  end loop;
end;
$$;

alter table public.tribes add constraint tribes_emblem_check check (emblem in (
  'wolf', 'lion', 'eagle', 'elephant', 'globe', 'fire', 'moon', 'star', 'sunrise', 'scorpion', 'snake', 'shield',
  'panther', 'crocodile', 'buffalo', 'baobab'
));
