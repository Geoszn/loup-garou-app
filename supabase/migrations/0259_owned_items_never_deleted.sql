-- 0259 — Un objet possédé n'est jamais retiré à son propriétaire (skins ET artefacts).
--
-- Règle voulue : quand une saison (ou une vente limitée) se termine, ou qu'un objet n'est plus vendu, ceux qui l'ont obtenu le
-- gardent pour toujours. Le catalogue, lui, filtre déjà correctement (list_store_skins renvoie les skins possédés même hors
-- vente ; get_my_artifacts, get_my_unlocked_parts, equip_skin et set_my_avatar ne regardent que la possession).
--
-- Seul trou trouvé : supprimer un objet depuis le dashboard admin (admin_delete_store_skin / admin_delete_store_artifact)
-- le retirait à TOUS ses propriétaires, car player_skins.skin_id et player_artifacts.artifact_id étaient en « on delete cascade ».
--   1. Les deux clés étrangères passent en « on delete restrict » : même un DELETE direct en SQL échoue tant qu'un joueur possède
--      l'objet.
--   2. Les deux fonctions d'administration refusent proprement, avec un message clair, et indiquent quoi faire à la place :
--      DÉSACTIVER l'objet (il disparaît de la boutique, mais reste chez ses propriétaires).
-- À appliquer APRÈS 0258. Rejouable sans risque.
set search_path = public;

do $$
declare
  r record;
begin
  for r in
    select c.conname, c.conrelid::regclass as child, a.attname as col, c.confrelid::regclass as parent
    from pg_constraint c
    join pg_attribute a on a.attrelid = c.conrelid and a.attnum = c.conkey[1]
    where c.contype = 'f'
      and (
        (c.conrelid = 'public.player_skins'::regclass and c.confrelid = 'public.store_skins'::regclass)
        or (c.conrelid = 'public.player_artifacts'::regclass and c.confrelid = 'public.store_artifacts'::regclass)
      )
  loop
    execute format('alter table %s drop constraint %I', r.child, r.conname);
    execute format('alter table %s add constraint %I foreign key (%I) references %s (id) on delete restrict', r.child, r.conname, r.col, r.parent);
  end loop;
end;
$$;

create or replace function public.admin_delete_store_skin(p_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_admin uuid := auth.uid();
  v_owners int;
begin
  if not public.is_admin_user(v_admin) then
    raise exception 'Accès refusé.';
  end if;

  select count(*) into v_owners from public.player_skins where skin_id = p_id;
  if v_owners > 0 then
    raise exception 'Ce skin appartient à % joueur(s) : il ne peut pas être supprimé. Désactivez-le plutôt : il disparaît de la boutique mais reste chez ceux qui l''ont.', v_owners;
  end if;

  delete from public.store_skins where id = p_id;

  insert into public.admin_audit_log (admin_id, action, target, details)
  values (v_admin, 'delete_store_skin', p_id::text, null);
end;
$$;

revoke execute on function public.admin_delete_store_skin(uuid) from public, anon;
grant execute on function public.admin_delete_store_skin(uuid) to authenticated;

create or replace function public.admin_delete_store_artifact(p_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_admin uuid := auth.uid();
  v_owners int;
begin
  if not public.is_admin_user(v_admin) then
    raise exception 'Accès refusé.';
  end if;

  select count(*) into v_owners from public.player_artifacts where artifact_id = p_id;
  if v_owners > 0 then
    raise exception 'Cet artefact appartient à % joueur(s) : il ne peut pas être supprimé. Désactivez-le plutôt : il disparaît de la boutique mais reste chez ceux qui l''ont.', v_owners;
  end if;

  delete from public.store_artifacts where id = p_id;

  insert into public.admin_audit_log (admin_id, action, target, details)
  values (v_admin, 'delete_store_artifact', p_id::text, null);
end;
$$;

revoke execute on function public.admin_delete_store_artifact(uuid) from public, anon;
grant execute on function public.admin_delete_store_artifact(uuid) to authenticated;
