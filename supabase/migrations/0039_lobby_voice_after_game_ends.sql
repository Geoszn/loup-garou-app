-- ----------------------------------------------------------------------------
-- can_access_channel : le canal vocal 'lobby' reste ouvert quand la partie
-- vient de se terminer (statut 'ended'), pas seulement avant son lancement
-- — le salon reste ouvert entre deux parties (voir EndScreen dans
-- GameRoom.tsx), les joueurs présents doivent pouvoir continuer à discuter
-- en attendant que l'hôte relance ou que d'autres les rejoignent. Reprise
-- intégrale de 0034_lobby_voice_and_defaults.sql, avec juste ce statut en
-- plus sur la branche 'lobby'.
-- ----------------------------------------------------------------------------
create or replace function public.can_access_channel(p_game_id uuid, p_channel text)
returns boolean
language plpgsql
security definer
stable
set search_path = public
as $$
declare
  v_status text;
  v_night_step text;
  v_alive boolean;
  v_banned boolean;
  v_role text;
begin
  select status, night_step into v_status, v_night_step from public.games where id = p_game_id;
  if v_status is null then return false; end if;

  select is_alive, is_banned into v_alive, v_banned
  from public.game_players where game_id = p_game_id and user_id = auth.uid();
  if v_alive is null then return false; end if; -- pas participant de cette partie
  if v_banned then return false; end if;

  if p_channel = 'lobby' then
    return v_status in ('lobby', 'ended');
  end if;

  if p_channel = 'graveyard' then
    return not v_alive;
  end if;

  if p_channel = 'village' then
    return v_alive and v_status in ('day_reveal', 'day_discussion', 'day_vote', 'night');
  end if;

  if p_channel = 'wolves' then
    if not v_alive or v_status <> 'night' or v_night_step <> 'loup_garou' then
      return false;
    end if;
    select role into v_role from public.game_roles_secret where game_id = p_game_id and user_id = auth.uid();
    return v_role = 'loup_garou';
  end if;

  return false;
end;
$$;
