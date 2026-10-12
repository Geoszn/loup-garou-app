-- Regarder une partie en cours SANS la rejoindre. Jusqu'ici, observer exigeait d'avoir envoyé une demande pour rejoindre (statut
-- « pending ») ; on peut maintenant regarder seulement, sans aucune demande, puis décider de rejoindre depuis l'écran
-- d'observation.
--
--   * `game_spectators` : qui regarde quelle partie (sans demande). Aucun accès direct : tout passe par les fonctions ci-dessous.
--   * `is_game_spectator(partie, joueur)` : vrai s'il a une demande en attente OU s'il regarde sans demande. C'est l'unique
--     test utilisé par les trois endroits qui ouvraient l'observation aux demandeurs : get_spectator_game_view (vue),
--     can_read_channel (chats village et cimetière, en lecture seule) et can_listen_channel (vocal du village, écoute seule).
--   * `watch_game(p_game_id, p_code)` : commence à regarder. Par code (lien ou saisie du code) pour n'importe quelle partie en
--     cours ; par identifiant seul (liste publique, village de l'accueil) uniquement pour une partie publique. Refusé pour un salon
--     pas encore lancé (il n'y a rien à regarder : on le rejoint) et pour qui participe déjà à la partie.
--   * `stop_watching_game(p_game_id)` : arrête de regarder.
-- À appliquer APRÈS 0248. Rejouable sans risque.
set search_path = public;

create table if not exists public.game_spectators (
  game_id uuid not null references public.games (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (game_id, user_id)
);
alter table public.game_spectators enable row level security;
revoke all on public.game_spectators from anon, authenticated;

create or replace function public.is_game_spectator(p_game_id uuid, p_user uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.game_join_requests
    where game_id = p_game_id and user_id = p_user and status = 'pending'
  ) or exists (
    select 1 from public.game_spectators
    where game_id = p_game_id and user_id = p_user
  );
$$;
revoke execute on function public.is_game_spectator(uuid, uuid) from public, anon, authenticated;

create or replace function public.watch_game(p_game_id uuid default null, p_code text default null)
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

  if p_code is not null then
    select * into v_game from public.games where code = upper(trim(p_code));
  elsif p_game_id is not null then
    select * into v_game from public.games where id = p_game_id and is_public;
  end if;
  if not found then
    raise exception 'Partie introuvable.';
  end if;
  if v_game.status = 'lobby' then
    raise exception 'Cette partie n''a pas encore commencé : rejoignez-la directement.';
  end if;
  if exists (select 1 from public.game_players where game_id = v_game.id and user_id = v_user) then
    raise exception 'Vous participez déjà à cette partie.';
  end if;

  insert into public.game_spectators (game_id, user_id) values (v_game.id, v_user)
  on conflict do nothing;

  return jsonb_build_object('game_id', v_game.id, 'code', v_game.code);
end;
$$;

create or replace function public.stop_watching_game(p_game_id uuid)
returns void
language sql
security definer
set search_path = public
as $$
  delete from public.game_spectators where game_id = p_game_id and user_id = auth.uid();
$$;

revoke execute on function public.watch_game(uuid, text) from public, anon;
grant execute on function public.watch_game(uuid, text) to authenticated;
revoke execute on function public.stop_watching_game(uuid) from public, anon;
grant execute on function public.stop_watching_game(uuid) to authenticated;

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

  if not public.is_game_spectator(p_game_id, v_user) then
    raise exception 'Vous n''observez pas cette partie.';
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

create or replace function public.can_listen_channel(p_game_id uuid, p_channel text)
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
begin
  if p_channel <> 'village' then
    return public.can_access_channel(p_game_id, p_channel);
  end if;

  select status into v_status from public.games where id = p_game_id;
  if v_status is null then return false; end if;

  select is_alive, is_banned into v_alive, v_banned
  from public.game_players where game_id = p_game_id and user_id = auth.uid();

  if v_alive is null then
    -- Pas participant : peut-être un spectateur avec une demande "pending"
    -- (voir get_spectator_game_view, migration 0140) — même règle qu'un
    -- fantôme, écoute seule uniquement.
    if public.is_game_spectator(p_game_id, auth.uid()) then
      return v_status in ('day_reveal', 'day_discussion', 'day_vote', 'captain_election');
    end if;
    return false;
  end if;

  if v_banned then return false; end if;

  if v_alive then
    return v_status in ('day_reveal', 'day_discussion', 'day_vote', 'captain_election');
  end if;

  -- fantôme : peut écouter le village dès qu'il y a effectivement du vocal
  -- côté vivants (mêmes phases), à tout moment de la partie.
  return v_status in ('day_reveal', 'day_discussion', 'day_vote', 'captain_election');
end;
$$;

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
    if p_channel in ('village', 'graveyard') and public.is_game_spectator(p_game_id, auth.uid()) then
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
    if v_status <> 'night' then
      return false;
    end if;
    if v_alive then
      select role into v_role from public.game_roles_secret where game_id = p_game_id and user_id = auth.uid();
      return v_role in ('loup_garou', 'loup_alpha', 'sans_visage', 'grand_mechant_loup', 'reine_louve');
    end if;
    return exists (
      select 1 from public.game_artifact_uses gau
      join public.store_artifacts sa on sa.id = gau.artifact_id
      where gau.game_id = p_game_id and gau.user_id = auth.uid() and sa.effect_key = 'parchemin_griot'
    );
  end if;

  if p_channel = 'amoureux' then
    if not v_alive or v_status not in ('day_reveal', 'day_discussion', 'day_vote') then
      return false;
    end if;
    return exists (
      select 1 from public.game_roles_secret
      where game_id = p_game_id and user_id = auth.uid() and lover_with is not null
    );
  end if;

  return false;
end;
$$;
