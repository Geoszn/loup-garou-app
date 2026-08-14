-- ============================================================================
-- BUG CORRIGÉ (régression introduite par la migration précédente,
-- 0078_wolf_chat_open_all_night.sql) : cette migration avait recopié
-- can_access_channel depuis l'ancienne version de 0026_night_anonymous_chat.sql
-- ("reprise intégrale de 0026") au lieu de repartir de la DERNIÈRE version
-- réellement en place, qui avait entre-temps gagné :
--   - la branche 'lobby' (migrations 0034 et 0039 — v_status in ('lobby',
--     'ended')), sans laquelle p_channel = 'lobby' tombait dans le `return
--     false` final ;
--   - la vérification `v_banned` (migration 0034), qui empêchait un joueur
--     exclu (is_banned) d'accéder à n'importe quel salon.
-- Résultat en production : le vocal du salon d'attente ('lobby', avant ET
-- après une partie) était entièrement cassé (can_listen_channel délègue à
-- can_access_channel pour tout canal <> 'village' — voir 0026), et un joueur
-- banni pouvait de nouveau accéder aux salons. Repris depuis 0039 (la bonne
-- base), avec le seul changement voulu de 0078 conservé : le salon 'wolves'
-- ne dépend plus de `night_step = 'loup_garou'`, seulement de
-- `v_status = 'night'`.
--
-- Leçon (déjà notée à plusieurs reprises dans l'historique des migrations) :
-- ne jamais repartir d'une ancienne migration comme "base" pour un
-- create-or-replace sans d'abord vérifier s'il existe une version plus
-- récente de la même fonction plus loin dans l'historique.
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
  v_banned boolean;
  v_role text;
begin
  select status into v_status from public.games where id = p_game_id;
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
