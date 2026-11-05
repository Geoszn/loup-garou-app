-- 0270 : le chef peut renommer sa tribu (le CODE de la tribu, lui, ne change jamais).
--   * tribes.name_changed_at : date du dernier changement de nom ; un nouveau nom au plus tous les 7 jours (évite les abus).
--   * update_tribe : nouveau paramètre p_name (facultatif, en dernier). Mêmes règles qu'à la création (0226) : 3 à 24 caractères,
--     espaces regroupés, pas de < > ni de caractères de contrôle, nom unique (insensible à la casse).
-- L'ancienne signature à 4 arguments est retirée (sinon un appel nommé sans p_name serait ambigu) ; l'appli actuelle, qui ne
-- passe pas p_name, continue de marcher avec la nouvelle (p_name vaut null : le nom ne change pas).
-- Rejouable.

alter table public.tribes add column if not exists name_changed_at timestamptz;

drop function if exists public.update_tribe(text, text, text, boolean);

create or replace function public.update_tribe(p_motto text, p_emblem text, p_color text, p_accepting boolean, p_name text default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  me public.tribe_members%rowtype;
  v_motto text := nullif(trim(coalesce(p_motto, '')), '');
  v_name text := nullif(regexp_replace(trim(coalesce(p_name, '')), '\s+', ' ', 'g'), '');
  v_tribe public.tribes%rowtype;
begin
  if v_user is null then
    raise exception 'Authentification requise';
  end if;
  select * into me from public.tribe_members where user_id = v_user;
  if me.user_id is null or me.role <> 'chef' then
    raise exception 'Seul le chef peut modifier la tribu.';
  end if;
  if v_motto is not null and (char_length(v_motto) > 80 or v_motto ~ '[<>[:cntrl:]]') then
    raise exception 'La devise est trop longue (80 caractères maximum).';
  end if;

  select * into v_tribe from public.tribes where id = me.tribe_id for update;
  -- Le même nom (casse comprise) n'est pas un changement.
  if v_name is not null and v_name = v_tribe.name then
    v_name := null;
  end if;
  if v_name is not null then
    if char_length(v_name) not between 3 and 24 or v_name ~ '[<>[:cntrl:]]' then
      raise exception 'Le nom doit faire entre 3 et 24 caractères.';
    end if;
    if v_tribe.name_changed_at is not null and v_tribe.name_changed_at > now() - interval '7 days' then
      raise exception '%', format('Le nom de la tribu ne peut changer qu''une fois tous les 7 jours (prochain changement possible le %s).',
        to_char(v_tribe.name_changed_at + interval '7 days', 'DD/MM à HH24:MI'));
    end if;
  end if;

  begin
    update public.tribes
    set motto = v_motto, emblem = p_emblem, color = p_color, accepting_requests = coalesce(p_accepting, true),
        name = coalesce(v_name, name),
        name_changed_at = case when v_name is not null then now() else name_changed_at end
    where id = me.tribe_id;
  exception
    when unique_violation then
      raise exception 'Ce nom de tribu est déjà pris.';
    when check_violation then
      raise exception 'Blason ou couleur invalide.';
  end;
end;
$$;

revoke execute on function public.update_tribe(text, text, text, boolean, text) from public, anon;
grant execute on function public.update_tribe(text, text, text, boolean, text) to authenticated;
