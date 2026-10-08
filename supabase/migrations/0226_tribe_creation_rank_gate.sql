-- Fonder une tribu demande un minimum de points de rang : Apprenti III (100 points).
-- Rejoindre une tribu (invitation ou demande) reste ouvert à tous. Les tribus déjà
-- fondées ne sont pas touchées. Pour changer le seuil, modifier tribe_create_min_points()
-- ici ET TRIBE_CREATE_MIN_POINTS dans src/lib/tribe.ts. Rejouable sans risque.
set search_path = public;

create or replace function public.tribe_create_min_points()
returns int
language sql
immutable
as $$ select 100 $$;

create or replace function public.create_tribe(p_name text, p_motto text, p_emblem text, p_color text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_name text := regexp_replace(trim(coalesce(p_name, '')), '\s+', ' ', 'g');
  v_motto text := nullif(trim(coalesce(p_motto, '')), '');
  v_id uuid;
begin
  if v_user is null then
    raise exception 'Authentification requise';
  end if;
  if char_length(v_name) not between 3 and 24 or v_name ~ '[<>[:cntrl:]]' then
    raise exception 'Le nom doit faire entre 3 et 24 caractères.';
  end if;
  if v_motto is not null and (char_length(v_motto) > 80 or v_motto ~ '[<>[:cntrl:]]') then
    raise exception 'La devise est trop longue (80 caractères maximum).';
  end if;
  if exists (select 1 from public.tribe_members where user_id = v_user) then
    raise exception 'Tu fais déjà partie d''une tribu.';
  end if;
  if coalesce((select rank_points from public.profiles where id = v_user), 0) < public.tribe_create_min_points() then
    raise exception '%', format('Il faut atteindre le rang « Apprenti III » (%s points) pour fonder une tribu.', public.tribe_create_min_points());
  end if;

  begin
    insert into public.tribes (name, motto, emblem, color, created_by)
    values (v_name, v_motto, p_emblem, p_color, v_user)
    returning id into v_id;
  exception
    when unique_violation then
      raise exception 'Ce nom de tribu est déjà pris.';
    when check_violation then
      raise exception 'Blason ou couleur invalide.';
  end;

  insert into public.tribe_members (user_id, tribe_id, role) values (v_user, v_id, 'chef');
  perform public.tribe_system_message(v_id, 'created', v_user, null);
  update public.tribe_invites set status = 'canceled' where invited_user = v_user and status = 'pending';

  return jsonb_build_object('tribe_id', v_id);
end;
$$;

revoke execute on function public.create_tribe(text, text, text, text) from public, anon;
grant execute on function public.create_tribe(text, text, text, text) to authenticated;
