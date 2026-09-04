-- ============================================================================
-- Mode spectateur pour une partie déjà en cours. Demande utilisateur :
-- "donne-lui la possibilité de suivre la partie qui est en cours [...] il
-- peut juste joindre et écouter ce qui se passe, soit dans le cimetière,
-- soit dans le truc là [...] c'est uniquement quand la partie se termine et
-- qu'on valide son ajout qu'il rejoint officiellement la partie."
--
-- S'appuie sur ce qui existe déjà (migrations 0038/0101) : rejoindre une
-- partie en cours crée une demande "pending" dans game_join_requests, qui ne
-- devient membre (game_players) qu'une fois l'hôte revenu en salon et ayant
-- accepté. Ce mode spectateur ne change rien à ça — il ajoute juste une
-- lecture seule pendant l'attente, réservée à ceux qui ont une telle demande
-- "pending" pour CETTE partie.
--
-- Deux ajouts :
--   1. can_read_channel : nouvelle dérogation en lecture seule pour un
--      utilisateur qui n'est PAS dans game_players (donc ni vivant ni mort
--      dans la partie) mais a une demande "pending" — mêmes salons qu'un
--      fantôme (village + cimetière, jamais loups). can_access_channel
--      (écriture) n'est PAS touché : un spectateur ne peut jamais écrire,
--      send_chat_message le refusera comme n'importe quel non-participant.
--   2. get_spectator_game_view : équivalent minimal de get_my_game_view pour
--      ce même public — jamais de rôle, jamais d'action en cours, juste
--      l'état public de la partie (identique à ce qu'un joueur voit déjà des
--      AUTRES joueurs) et le journal.
-- ============================================================================
set search_path = public;

-- ----------------------------------------------------------------------------
-- can_read_channel : reprise de 0118_sans_visage_role.sql, avec la seule
-- dérogation spectateur ajoutée en tête (avant : retournait false pour tout
-- non-participant).
-- ----------------------------------------------------------------------------
create or replace function public.can_read_channel(p_game_id uuid, p_channel text)
returns boolean
language plpgsql
stable security definer
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
  if v_alive is null then
    -- Pas participant de la partie : peut-être un spectateur avec une
    -- demande de rejoindre en attente (voir get_spectator_game_view) —
    -- mêmes salons qu'un fantôme, en lecture seule uniquement.
    if p_channel in ('village', 'graveyard') and exists (
      select 1 from public.game_join_requests
      where game_id = p_game_id and user_id = auth.uid() and status = 'pending'
    ) then
      return true;
    end if;
    return false;
  end if;

  if p_channel = 'graveyard' then
    return not v_alive;
  end if;

  if p_channel = 'village' then
    if v_alive then
      return v_status in ('day_reveal', 'day_discussion', 'day_vote', 'night');
    else
      return true;
    end if;
  end if;

  if p_channel = 'wolves' then
    if not v_alive or v_status <> 'night' then
      return false;
    end if;
    select role into v_role from public.game_roles_secret where game_id = p_game_id and user_id = auth.uid();
    return v_role in ('loup_garou', 'loup_alpha', 'sans_visage');
  end if;

  return false;
end;
$$;

grant execute on function public.can_read_channel(uuid, text) to authenticated;

-- ----------------------------------------------------------------------------
-- get_spectator_game_view : lecture seule pour qui a une demande "pending"
-- sur cette partie. Volontairement minimal — pas de rôles, pas de votes/
-- actions en cours, rien que get_my_game_view ne montre pas déjà à tous les
-- AUTRES joueurs d'une partie normale.
-- ----------------------------------------------------------------------------
create or replace function public.get_spectator_game_view(p_game_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_game public.games%rowtype;
begin
  if v_user is null then
    raise exception 'Authentification requise';
  end if;

  if not exists (
    select 1 from public.game_join_requests
    where game_id = p_game_id and user_id = v_user and status = 'pending'
  ) then
    raise exception 'Vous n''avez pas de demande en attente pour cette partie.';
  end if;

  select * into v_game from public.games where id = p_game_id;
  if not found then
    raise exception 'Partie introuvable.';
  end if;

  return jsonb_build_object(
    'game', to_jsonb(v_game) - 'thief_extra_roles',
    'players', coalesce((
      select jsonb_agg(to_jsonb(gp) order by gp.seat_number)
      from public.game_players gp
      where gp.game_id = p_game_id
    ), '[]'::jsonb),
    'log', coalesce((
      select jsonb_agg(jsonb_build_object('id', id, 'message', message, 'created_at', created_at) order by created_at desc)
      from (
        select id, message, created_at from public.game_log
        where game_id = p_game_id order by created_at desc limit 60
      ) recent
    ), '[]'::jsonb)
  );
end;
$$;

grant execute on function public.get_spectator_game_view(uuid) to authenticated;
