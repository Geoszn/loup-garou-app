-- Avatars : forme du visage (champ face). Gratuite ; les avatars enregistrés
-- avant cette migration n'ont pas ce champ, qui vaut alors « oval ».
-- Doit rester synchronisé avec FACES dans src/lib/avatarParts.ts.
set search_path = public;

create or replace function public.set_my_avatar(p_config jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_points int;
  v_skin int;
  v_bg int;
  v_kind text;
  v_value text;
  v_min int;
  v_head text;
  v_face text;
  v_clean jsonb;
begin
  if v_user is null then
    raise exception 'Authentification requise';
  end if;
  if p_config is null or jsonb_typeof(p_config) <> 'object' then
    raise exception 'Avatar invalide.';
  end if;

  begin
    v_skin := (p_config ->> 'skin')::int;
    v_bg := (p_config ->> 'bg')::int;
  exception when others then
    raise exception 'Avatar invalide.';
  end;
  if v_skin is null or v_skin not between 0 and 5 or v_bg is null or v_bg not between 0 and 5 then
    raise exception 'Avatar invalide.';
  end if;

  v_head := coalesce(p_config ->> 'head', 'none');
  v_face := coalesce(p_config ->> 'face', 'oval');
  if v_face not in ('oval', 'round', 'square', 'long', 'heart') then
    raise exception 'Avatar invalide.';
  end if;

  select coalesce(rank_points, 0) into v_points from public.profiles where id = v_user;

  foreach v_kind in array array['hair', 'outfit', 'acc', 'head'] loop
    v_value := case when v_kind = 'head' then v_head else p_config ->> v_kind end;
    v_min := public.avatar_part_min_points(v_kind, v_value);
    if v_min is null then
      raise exception 'Avatar invalide.';
    end if;
    if v_points < v_min then
      raise exception 'Cette pièce se débloque à % points de rang.', v_min;
    end if;
  end loop;

  v_clean := jsonb_build_object(
    'skin', v_skin,
    'bg', v_bg,
    'hair', p_config ->> 'hair',
    'outfit', p_config ->> 'outfit',
    'acc', p_config ->> 'acc',
    'head', v_head,
    'face', v_face
  );

  update public.profiles set avatar_config = v_clean where id = v_user;
  return v_clean;
end;
$$;
