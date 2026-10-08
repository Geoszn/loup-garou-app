-- Filet de sécurité : une tribu ne doit jamais rester sans chef ni vide.
--
-- Quand une ligne de tribe_members disparaît SANS passer par « Quitter la tribu » (compte
-- supprimé par un administrateur, suppression en cascade d'un profil…) :
--  * si c'était le chef et qu'il reste des membres, le plus ancien sous-chef (à défaut le
--    plus ancien membre) devient chef, avec le message « nouveau chef » dans le chat ;
--  * s'il ne reste plus personne, la tribu est supprimée (messages, invitations,
--    demandes avec).
-- Si la tribu est en train d'être dissoute, le déclencheur ne fait rien. leave_tribe fait
-- déjà sa propre succession : elle prévient le déclencheur (réglage de session) pour ne
-- pas la doubler. Le déclencheur est protégé par un bloc d'exception : il ne doit JAMAIS
-- empêcher la suppression d'un compte. Rejouable sans risque. À appliquer APRÈS 0222.
set search_path = public;

create or replace function public.tribe_after_member_delete()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_next uuid;
begin
  begin
    -- La tribu est en train d'être dissoute : rien à réparer.
    if not exists (select 1 from public.tribes where id = old.tribe_id) then
      return old;
    end if;

    if not exists (select 1 from public.tribe_members where tribe_id = old.tribe_id) then
      delete from public.tribes where id = old.tribe_id;
      return old;
    end if;

    if old.role = 'chef'
       and coalesce(current_setting('tribe.chief_handled', true), '') <> '1'
       and not exists (select 1 from public.tribe_members where tribe_id = old.tribe_id and role = 'chef') then
      select user_id into v_next from public.tribe_members
      where tribe_id = old.tribe_id
      order by case role when 'sous_chef' then 0 else 1 end, joined_at
      limit 1;
      if v_next is not null then
        update public.tribe_members set role = 'chef' where user_id = v_next;
        perform public.tribe_system_message(old.tribe_id, 'chief', null, v_next);
      end if;
    end if;
  exception when others then
    raise warning 'tribe_after_member_delete: %', sqlerrm;
  end;
  return old;
end;
$$;

revoke execute on function public.tribe_after_member_delete() from public, anon, authenticated;

drop trigger if exists tribe_members_after_delete on public.tribe_members;
create trigger tribe_members_after_delete
  after delete on public.tribe_members
  for each row
  execute function public.tribe_after_member_delete();

-- leave_tribe : identique à 0222, avec le réglage de session qui évite la double succession.
create or replace function public.leave_tribe()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  m public.tribe_members%rowtype;
  v_next uuid;
begin
  if v_user is null then
    raise exception 'Authentification requise';
  end if;
  select * into m from public.tribe_members where user_id = v_user for update;
  if not found then
    return;
  end if;

  if m.role = 'chef' then
    select user_id into v_next from public.tribe_members
    where tribe_id = m.tribe_id and user_id <> v_user
    order by case role when 'sous_chef' then 0 else 1 end, joined_at
    limit 1;

    if v_next is null then
      -- Dernier membre : la tribu disparaît (messages, invitations, signalements avec).
      delete from public.tribes where id = m.tribe_id;
      return;
    end if;

    -- La succession est faite ici (avec son message) : le déclencheur de filet de sécurité ne doit pas la doubler.
    perform set_config('tribe.chief_handled', '1', true);
    delete from public.tribe_members where user_id = v_user;
    update public.tribe_members set role = 'chef' where user_id = v_next;
    perform public.tribe_system_message(m.tribe_id, 'left', v_user, null);
    perform public.tribe_system_message(m.tribe_id, 'chief', null, v_next);
  else
    delete from public.tribe_members where user_id = v_user;
    perform public.tribe_system_message(m.tribe_id, 'left', v_user, null);
  end if;
end;
$$;

revoke execute on function public.leave_tribe() from public, anon;
grant execute on function public.leave_tribe() to authenticated;

-- Réparation unique des tribus déjà abîmées (aucune si tout va bien) : un chef pour chaque
-- tribu qui n'en a pas, et suppression des tribus sans aucun membre.
update public.tribe_members m
set role = 'chef'
from (
  select distinct on (t.tribe_id) t.user_id
  from public.tribe_members t
  where t.tribe_id in (
    select tribe_id from public.tribe_members group by tribe_id having count(*) filter (where role = 'chef') = 0
  )
  order by t.tribe_id, case t.role when 'sous_chef' then 0 else 1 end, t.joined_at
) x
where m.user_id = x.user_id;

delete from public.tribes tr
where not exists (select 1 from public.tribe_members m where m.tribe_id = tr.id);
