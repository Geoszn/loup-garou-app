-- Un 2e emplacement « détail » pour les avatars : on peut porter deux
-- accessoires à la fois (lunettes + chaîne, boucles + cigarette…), en gardant
-- UNE tenue, UNE coiffure et UN couvre-chef. Le champ s'appelle `acc2` dans
-- profiles.avatar_config ('none' par défaut ; les avatars existants n'ont pas
-- le champ et se lisent comme « aucun »). Les mêmes règles de déblocage que
-- `acc` s'appliquent (points de rang ou skin possédé).
-- Rejouable sans risque (create or replace).
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
  v_acc2 text;
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
  if v_skin is null or v_skin not between 0 and 5 or v_bg is null or v_bg not between 0 and 6 then
    raise exception 'Avatar invalide.';
  end if;

  v_head := coalesce(p_config ->> 'head', 'none');
  v_face := coalesce(p_config ->> 'face', 'oval');
  if v_face not in ('oval', 'round', 'square', 'long', 'heart') then
    raise exception 'Avatar invalide.';
  end if;

  -- 2e détail : valeur ignorée si identique au 1er (évite un doublon).
  v_acc2 := coalesce(p_config ->> 'acc2', 'none');
  if v_acc2 = coalesce(p_config ->> 'acc', 'none') then
    v_acc2 := 'none';
  end if;

  select coalesce(rank_points, 0) into v_points from public.profiles where id = v_user;

  -- Les fonds 0 à 5 sont libres ; les suivants s'obtiennent dans la boutique.
  if v_bg > 5 and not exists (
    select 1
    from public.player_skins ps
    join public.store_skins s on s.id = ps.skin_id
    where ps.user_id = v_user and s.config ->> 'bg' = v_bg::text
  ) then
    raise exception 'Ce fond s''obtient dans la boutique.';
  end if;

  foreach v_kind in array array['hair', 'outfit', 'acc', 'head', 'acc2'] loop
    v_value := case v_kind when 'head' then v_head when 'acc2' then v_acc2 else p_config ->> v_kind end;
    -- acc2 suit exactement les règles des accessoires (même catalogue).
    v_min := public.avatar_part_min_points(case when v_kind = 'acc2' then 'acc' else v_kind end, v_value);
    if v_min is null then
      raise exception 'Avatar invalide.';
    end if;
    if v_points < v_min and not exists (
      select 1
      from public.player_skins ps
      join public.store_skins s on s.id = ps.skin_id
      where ps.user_id = v_user and s.config ->> (case when v_kind = 'acc2' then 'acc' else v_kind end) = v_value
    ) then
      raise exception 'Cette pièce se débloque à % points de rang.', v_min;
    end if;
  end loop;

  v_clean := jsonb_build_object(
    'skin', v_skin,
    'bg', v_bg,
    'hair', p_config ->> 'hair',
    'outfit', p_config ->> 'outfit',
    'acc', p_config ->> 'acc',
    'acc2', v_acc2,
    'head', v_head,
    'face', v_face
  );

  update public.profiles set avatar_config = v_clean where id = v_user;
  return v_clean;
end;
$$;

-- Équiper un skin qui porte un accessoire : il prend le 1er emplacement ; si le
-- 2e portait déjà le même accessoire, on le vide.
create or replace function public.equip_skin(p_skin_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_config jsonb;
  v_current jsonb;
  v_default jsonb := '{"skin":3,"bg":0,"hair":"braids","outfit":"tunic","acc":"none","acc2":"none","head":"none","face":"oval"}'::jsonb;
  v_next jsonb;
begin
  if v_user is null then
    raise exception 'Non authentifié.';
  end if;
  select s.config into v_config
    from public.store_skins s
    join public.player_skins ps on ps.skin_id = s.id and ps.user_id = v_user
    where s.id = p_skin_id;
  if not found then
    raise exception 'Vous ne possédez pas ce skin.';
  end if;

  select coalesce(avatar_config, v_default) into v_current from public.profiles where id = v_user;
  v_next := v_default || v_current || v_config;
  if v_next ->> 'acc2' = v_next ->> 'acc' then
    v_next := v_next || '{"acc2":"none"}'::jsonb;
  end if;
  update public.profiles set avatar_config = v_next where id = v_user;
  return v_next;
end;
$$;
