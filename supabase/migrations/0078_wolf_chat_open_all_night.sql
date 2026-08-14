-- ============================================================================
-- Le chat "wolves" (texte, nominatif entre Loups-Garous) était réservé à la
-- fenêtre précise `night_step = 'loup_garou'` (voir migration 0026) — c'est-
-- à-dire uniquement pendant leur propre tour de nuit, alors que d'autres
-- rôles (Voyante, etc.) jouent le leur. Retour utilisateur : la meute doit
-- pouvoir discuter dès le début de la nuit, pas seulement pendant sa propre
-- fenêtre d'action — le panneau de VOTE des loups (submit_wolf_vote), lui,
-- reste strictement limité à `night_step = 'loup_garou'`, inchangé (voir
-- WolfPanel/GameRoom.tsx côté client, aucun changement nécessaire là).
--
-- Reprise intégrale de can_access_channel/can_read_channel (0026), seul
-- changement : la condition `v_night_step <> 'loup_garou'` retirée pour le
-- salon 'wolves', qui ne dépend donc plus que de `v_status = 'night'` (et
-- toujours : vivant + rôle loup_garou). Même signature des deux fonctions
-- des deux côtés, pas de risque de surcharge (voir migrations précédentes
-- sur ce piège) — remplace juste sans DROP.
-- ============================================================================
set search_path = public;

create or replace function public.can_access_channel(p_game_id uuid, p_channel text)
returns boolean
language plpgsql
security definer
stable
set search_path = public
as $$
declare
  v_status text;
  v_alive boolean;
  v_role text;
begin
  select status into v_status from public.games where id = p_game_id;
  if v_status is null then return false; end if;

  select is_alive into v_alive from public.game_players where game_id = p_game_id and user_id = auth.uid();
  if v_alive is null then return false; end if; -- pas participant de cette partie

  if p_channel = 'graveyard' then
    return not v_alive;
  end if;

  if p_channel = 'village' then
    return v_alive and v_status in ('day_reveal', 'day_discussion', 'day_vote', 'night');
  end if;

  if p_channel = 'wolves' then
    if not v_alive or v_status <> 'night' then
      return false;
    end if;
    select role into v_role from public.game_roles_secret where game_id = p_game_id and user_id = auth.uid();
    return v_role = 'loup_garou';
  end if;

  return false;
end;
$$;

grant execute on function public.can_access_channel(uuid, text) to authenticated;

create or replace function public.can_read_channel(p_game_id uuid, p_channel text)
returns boolean
language plpgsql
security definer
stable
set search_path = public
as $$
declare
  v_status text;
  v_alive boolean;
  v_role text;
begin
  select status into v_status from public.games where id = p_game_id;
  if v_status is null then return false; end if;

  select is_alive into v_alive from public.game_players where game_id = p_game_id and user_id = auth.uid();
  if v_alive is null then return false; end if; -- pas participant de cette partie

  if p_channel = 'graveyard' then
    return not v_alive;
  end if;

  if p_channel = 'village' then
    if v_alive then
      return v_status in ('day_reveal', 'day_discussion', 'day_vote', 'night');
    else
      -- fantôme : lecture seule, à tout moment, pour suivre la partie.
      return true;
    end if;
  end if;

  if p_channel = 'wolves' then
    if not v_alive or v_status <> 'night' then
      return false;
    end if;
    select role into v_role from public.game_roles_secret where game_id = p_game_id and user_id = auth.uid();
    return v_role = 'loup_garou';
  end if;

  return false;
end;
$$;

grant execute on function public.can_read_channel(uuid, text) to authenticated;
