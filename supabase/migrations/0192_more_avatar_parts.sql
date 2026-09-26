-- Avatars : nouvelles pièces (coiffures, tenues, accessoires) et un second
-- emplacement « couvre-chef » (head). Les seuils des pièces déjà existantes ne
-- changent pas ; les avatars enregistrés avant cette migration n'ont pas de
-- champ head, qui vaut alors « none ». Doit rester synchronisé avec
-- PART_MIN_POINTS dans src/lib/avatarParts.ts.
set search_path = public;

create or replace function public.avatar_part_min_points(p_kind text, p_value text)
returns int
language sql
immutable
set search_path = public
as $$
  select case p_kind
    when 'hair' then case p_value when 'none' then 0 when 'fade' then 0 when 'afro' then 0 when 'braids' then 0 when 'puffs' then 0 when 'curly' then 100 when 'bun' then 100 when 'flat' then 250 when 'cornrows' then 350 when 'locs' then 250 when 'long' then 550 when 'knots' then 800 when 'mohawk' then 1100 when 'topknot' then 1500 when 'gele' then 600 end
    when 'outfit' then case p_value when 'tunic' then 0 when 'tee' then 0 when 'cloak' then 100 when 'wrap' then 100 when 'kente' then 250 when 'dashiki' then 250 when 'boubou' then 350 when 'hunter' then 550 when 'suit' then 800 when 'hood' then 600 when 'armor' then 1100 when 'royal' then 1500 when 'furcape' then 2000 end
    when 'acc' then case p_value when 'none' then 0 when 'ring' then 0 when 'freckles' then 0 when 'glasses' then 100 when 'sunglasses' then 150 when 'hoops' then 200 when 'scar' then 250 when 'beads' then 350 when 'facepaint' then 550 when 'eyepatch' then 800 end
    when 'head' then case p_value when 'none' then 0 when 'headband' then 100 when 'cap' then 250 when 'hat' then 550 when 'feather' then 800 when 'crown' then 2000 end
  end;
$$;

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
    'head', v_head
  );

  update public.profiles set avatar_config = v_clean where id = v_user;
  return v_clean;
end;
$$;
