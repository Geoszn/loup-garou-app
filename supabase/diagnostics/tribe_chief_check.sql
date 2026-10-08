-- Vérifie le filet de sécurité « chef » des tribus (migration 0229) — lecture seule.
select 'déclencheur tribe_members_after_delete' as test, exists (select 1 from pg_trigger where tgname = 'tribe_members_after_delete' and not tgisinternal) as ok
union all select 'aucune tribu sans chef', not exists (
  select 1 from public.tribes t where not exists (select 1 from public.tribe_members m where m.tribe_id = t.id and m.role = 'chef')
)
union all select 'aucune tribu sans membre', not exists (
  select 1 from public.tribes t where not exists (select 1 from public.tribe_members m where m.tribe_id = t.id)
);
