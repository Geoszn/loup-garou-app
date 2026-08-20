-- Correctif immédiat (avant tout déploiement client) : la version précédente
-- de infect_player (migration 0088) marquait alpha_infect_used avec une
-- clause WHERE contradictoire (role = 'loup_garou' ET user_id parmi les
-- role = 'loup_alpha' de cette même partie — aucune ligne ne peut satisfaire
-- les deux à la fois, donc le flag n'était jamais posé). Le rôle du Loup
-- Alpha lui-même ne change jamais (seule la victime devient 'loup_garou') :
-- il suffit de cibler directement role = 'loup_alpha'.
set search_path = public;

create or replace function public.infect_player(p_game_id uuid, p_user_id uuid, p_night integer)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_old_role text;
begin
  select role into v_old_role from public.game_roles_secret where game_id = p_game_id and user_id = p_user_id;
  if v_old_role is null or v_old_role in ('loup_garou', 'loup_alpha') then
    return; -- déjà loup ou introuvable, rien à faire
  end if;

  update public.game_roles_secret
  set role = 'loup_garou', infected_at_night = p_night
  where game_id = p_game_id and user_id = p_user_id;

  update public.game_roles_secret set alpha_infect_used = true
  where game_id = p_game_id and role = 'loup_alpha';

  insert into public.game_log (game_id, message, night_number, kind, meta)
  values (
    p_game_id,
    '🧬 Une infection s''est propagée cette nuit... un villageois a secrètement rejoint les Loups-Garous.',
    p_night,
    'alpha_infect',
    jsonb_build_object('victim_id', p_user_id)
  );
end;
$$;
