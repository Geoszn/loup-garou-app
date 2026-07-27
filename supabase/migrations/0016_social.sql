-- ============================================================================
-- Fonctionnalités sociales : amis + invitations directes à une partie.
--
-- On ajoute des amis par "code ami" plutôt que par pseudo : le pseudo n'a
-- jamais été garanti unique (profiles.username n'a pas de contrainte
-- d'unicité, et forcer ça rétroactivement sur une base déjà peuplée serait
-- risqué). Le code ami reprend le même principe que le code de partie
-- (6 caractères sans ambiguïté visuelle), un format déjà familier des
-- joueurs.
-- ============================================================================
set search_path = public;

-- ----------------------------------------------------------------------------
-- profiles.friend_code : identifiant court et stable pour se faire ajouter.
-- ----------------------------------------------------------------------------
create or replace function public.generate_friend_code()
returns text
language plpgsql
as $$
declare
  chars text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  result text;
  v_exists boolean;
begin
  loop
    result := '';
    for i in 1..6 loop
      result := result || substr(chars, floor(random() * length(chars) + 1)::int, 1);
    end loop;
    select exists(select 1 from public.profiles where friend_code = result) into v_exists;
    exit when not v_exists;
  end loop;
  return result;
end;
$$;

alter table public.profiles add column if not exists friend_code text;

-- Backfill des comptes déjà créés avant cette migration (une seule ligne à la
-- fois pour garantir l'unicité via generate_friend_code, qui vérifie déjà les
-- codes existants au fur et à mesure).
do $$
declare
  r record;
begin
  for r in select id from public.profiles where friend_code is null loop
    update public.profiles set friend_code = public.generate_friend_code() where id = r.id;
  end loop;
end $$;

alter table public.profiles alter column friend_code set not null;
alter table public.profiles drop constraint if exists profiles_friend_code_key;
alter table public.profiles add constraint profiles_friend_code_key unique (friend_code);

alter table public.profiles alter column friend_code set default public.generate_friend_code();

-- ----------------------------------------------------------------------------
-- friend_requests : une ligne par relation, quel que soit son statut. Un
-- couple (requester, addressee) devenu "accepted" EST la relation d'amitié
-- (on ne duplique pas dans une table séparée).
-- ----------------------------------------------------------------------------
create table if not exists public.friend_requests (
  id uuid primary key default gen_random_uuid(),
  requester_id uuid not null references public.profiles (id) on delete cascade,
  addressee_id uuid not null references public.profiles (id) on delete cascade,
  status text not null default 'pending' check (status in ('pending', 'accepted')),
  created_at timestamptz not null default now(),
  responded_at timestamptz,
  check (requester_id <> addressee_id)
);

-- Empêche une paire de demandes en double dans un sens comme dans l'autre :
-- au niveau applicatif (RPC) on vérifie déjà les deux sens, cet index est un
-- filet de sécurité contre une double soumission concurrente.
create unique index if not exists friend_requests_pair_idx
  on public.friend_requests (least(requester_id, addressee_id), greatest(requester_id, addressee_id));

create index if not exists friend_requests_addressee_idx on public.friend_requests (addressee_id, status);
create index if not exists friend_requests_requester_idx on public.friend_requests (requester_id, status);

-- ----------------------------------------------------------------------------
-- game_invites : invitation directe d'un ami vers une partie en salon
-- d'attente.
-- ----------------------------------------------------------------------------
create table if not exists public.game_invites (
  id uuid primary key default gen_random_uuid(),
  game_id uuid not null references public.games (id) on delete cascade,
  from_user_id uuid not null references public.profiles (id) on delete cascade,
  to_user_id uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (game_id, to_user_id)
);

create index if not exists game_invites_to_idx on public.game_invites (to_user_id);

-- ----------------------------------------------------------------------------
-- RLS + Realtime : même principe que games/game_players — une policy de
-- lecture limitée aux personnes concernées, aucune policy d'écriture (tout
-- passe par les fonctions security definer ci-dessous).
-- ----------------------------------------------------------------------------
alter table public.friend_requests enable row level security;
alter table public.game_invites enable row level security;

drop policy if exists "friend_requests_select_involved" on public.friend_requests;
create policy "friend_requests_select_involved" on public.friend_requests
  for select using (auth.uid() in (requester_id, addressee_id));

drop policy if exists "game_invites_select_involved" on public.game_invites;
create policy "game_invites_select_involved" on public.game_invites
  for select using (auth.uid() in (from_user_id, to_user_id));

alter table public.friend_requests replica identity full;
alter table public.game_invites replica identity full;

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and tablename = 'friend_requests'
  ) then
    alter publication supabase_realtime add table public.friend_requests;
  end if;
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and tablename = 'game_invites'
  ) then
    alter publication supabase_realtime add table public.game_invites;
  end if;
end $$;

-- ----------------------------------------------------------------------------
-- send_friend_request : envoie une demande à partir du code ami de la cible.
-- Si la cible m'a déjà envoyé une demande en attente, on l'accepte directement
-- plutôt que de créer une deuxième ligne (évite le "double clic croisé").
-- ----------------------------------------------------------------------------
create or replace function public.send_friend_request(p_friend_code text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_target uuid;
  v_reverse public.friend_requests%rowtype;
  v_existing public.friend_requests%rowtype;
begin
  if v_user is null then
    raise exception 'Authentification requise';
  end if;

  select id into v_target from public.profiles where friend_code = upper(trim(p_friend_code));
  if v_target is null then
    raise exception 'Aucun compte ne correspond à ce code ami.';
  end if;
  if v_target = v_user then
    raise exception 'Vous ne pouvez pas vous ajouter vous-même.';
  end if;

  select * into v_existing from public.friend_requests
  where least(requester_id, addressee_id) = least(v_user, v_target)
    and greatest(requester_id, addressee_id) = greatest(v_user, v_target);

  if found then
    if v_existing.status = 'accepted' then
      raise exception 'Vous êtes déjà amis.';
    end if;
    if v_existing.requester_id = v_user then
      raise exception 'Demande déjà envoyée, en attente de réponse.';
    end if;
    -- l'autre m'avait déjà envoyé une demande : on l'accepte.
    update public.friend_requests set status = 'accepted', responded_at = now()
    where id = v_existing.id;
    return jsonb_build_object('status', 'accepted');
  end if;

  insert into public.friend_requests (requester_id, addressee_id) values (v_user, v_target);
  return jsonb_build_object('status', 'pending');
end;
$$;

grant execute on function public.send_friend_request(text) to authenticated;

-- ----------------------------------------------------------------------------
-- respond_friend_request : accepter (uniquement le destinataire) ou
-- décliner/annuler (destinataire OU demandeur — permet d'annuler sa propre
-- demande envoyée par erreur).
-- ----------------------------------------------------------------------------
create or replace function public.respond_friend_request(p_request_id uuid, p_accept boolean)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_req public.friend_requests%rowtype;
begin
  select * into v_req from public.friend_requests where id = p_request_id;
  if not found or v_req.status <> 'pending' then
    raise exception 'Demande introuvable ou déjà traitée.';
  end if;

  if p_accept then
    if v_req.addressee_id <> v_user then
      raise exception 'Seul le destinataire peut accepter cette demande.';
    end if;
    update public.friend_requests set status = 'accepted', responded_at = now() where id = p_request_id;
  else
    if v_user not in (v_req.requester_id, v_req.addressee_id) then
      raise exception 'Vous n’êtes pas concerné par cette demande.';
    end if;
    delete from public.friend_requests where id = p_request_id;
  end if;
end;
$$;

grant execute on function public.respond_friend_request(uuid, boolean) to authenticated;

-- ----------------------------------------------------------------------------
-- remove_friend : supprime une amitié acceptée (dans les deux sens).
-- ----------------------------------------------------------------------------
create or replace function public.remove_friend(p_friend_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
begin
  delete from public.friend_requests
  where status = 'accepted'
    and least(requester_id, addressee_id) = least(v_user, p_friend_id)
    and greatest(requester_id, addressee_id) = greatest(v_user, p_friend_id);
end;
$$;

grant execute on function public.remove_friend(uuid) to authenticated;

-- ----------------------------------------------------------------------------
-- get_my_social : tout ce dont le client a besoin pour l'écran "Amis" et la
-- bannière d'invitations du dashboard, en un seul appel.
-- ----------------------------------------------------------------------------
create or replace function public.get_my_social()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_result jsonb;
begin
  if v_user is null then
    raise exception 'Authentification requise';
  end if;

  select jsonb_build_object(
    'friend_code', (select friend_code from public.profiles where id = v_user),

    'friends', coalesce((
      select jsonb_agg(jsonb_build_object('user_id', p.id, 'username', p.username, 'avatar_icon', p.avatar_icon) order by p.username)
      from public.friend_requests fr
      join public.profiles p on p.id = (case when fr.requester_id = v_user then fr.addressee_id else fr.requester_id end)
      where fr.status = 'accepted' and v_user in (fr.requester_id, fr.addressee_id)
    ), '[]'::jsonb),

    'incoming_requests', coalesce((
      select jsonb_agg(jsonb_build_object(
        'request_id', fr.id, 'user_id', p.id, 'username', p.username, 'avatar_icon', p.avatar_icon, 'created_at', fr.created_at
      ) order by fr.created_at desc)
      from public.friend_requests fr
      join public.profiles p on p.id = fr.requester_id
      where fr.status = 'pending' and fr.addressee_id = v_user
    ), '[]'::jsonb),

    'outgoing_requests', coalesce((
      select jsonb_agg(jsonb_build_object(
        'request_id', fr.id, 'user_id', p.id, 'username', p.username, 'avatar_icon', p.avatar_icon, 'created_at', fr.created_at
      ) order by fr.created_at desc)
      from public.friend_requests fr
      join public.profiles p on p.id = fr.addressee_id
      where fr.status = 'pending' and fr.requester_id = v_user
    ), '[]'::jsonb),

    'game_invites', coalesce((
      select jsonb_agg(jsonb_build_object(
        'invite_id', gi.id, 'game_id', gi.game_id, 'code', g.code,
        'from_username', p.username, 'from_avatar_icon', p.avatar_icon, 'created_at', gi.created_at
      ) order by gi.created_at desc)
      from public.game_invites gi
      join public.games g on g.id = gi.game_id and g.status = 'lobby'
      join public.profiles p on p.id = gi.from_user_id
      where gi.to_user_id = v_user
    ), '[]'::jsonb)
  ) into v_result;

  return v_result;
end;
$$;

grant execute on function public.get_my_social() to authenticated;

-- ----------------------------------------------------------------------------
-- invite_friend_to_game : invite un ami à rejoindre la partie en cours de
-- constitution (salon d'attente uniquement).
-- ----------------------------------------------------------------------------
create or replace function public.invite_friend_to_game(p_game_id uuid, p_friend_id uuid)
returns void
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

  select * into v_game from public.games where id = p_game_id;
  if not found or v_game.status <> 'lobby' then
    raise exception 'Cette partie n’accepte plus de nouveaux joueurs.';
  end if;

  if not exists (select 1 from public.game_players where game_id = p_game_id and user_id = v_user) then
    raise exception 'Vous ne participez pas à cette partie.';
  end if;

  if not exists (
    select 1 from public.friend_requests
    where status = 'accepted'
      and least(requester_id, addressee_id) = least(v_user, p_friend_id)
      and greatest(requester_id, addressee_id) = greatest(v_user, p_friend_id)
  ) then
    raise exception 'Vous devez être amis pour inviter ce joueur.';
  end if;

  if exists (select 1 from public.game_players where game_id = p_game_id and user_id = p_friend_id) then
    raise exception 'Cet ami est déjà dans la partie.';
  end if;

  insert into public.game_invites (game_id, from_user_id, to_user_id)
  values (p_game_id, v_user, p_friend_id)
  on conflict (game_id, to_user_id) do nothing;
end;
$$;

grant execute on function public.invite_friend_to_game(uuid, uuid) to authenticated;

-- ----------------------------------------------------------------------------
-- dismiss_game_invite : retire une invitation qu'on a reçue (refusée ou après
-- l'avoir déjà rejointe autrement).
-- ----------------------------------------------------------------------------
create or replace function public.dismiss_game_invite(p_invite_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  delete from public.game_invites where id = p_invite_id and to_user_id = auth.uid();
end;
$$;

grant execute on function public.dismiss_game_invite(uuid) to authenticated;

-- ----------------------------------------------------------------------------
-- join_game : nettoie l'invitation correspondante une fois rejointe (par le
-- code directement, sans passer par le bouton "Rejoindre" de l'invitation).
-- ----------------------------------------------------------------------------
create or replace function public.join_game(p_code text, p_display_name text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_game public.games%rowtype;
  v_count int;
  v_existing uuid;
  v_seat int;
  v_icon text;
begin
  if v_user is null then
    raise exception 'Authentification requise';
  end if;

  select * into v_game from public.games where code = upper(trim(p_code));
  if not found then
    raise exception 'Aucune partie ne correspond à ce code.';
  end if;

  select id into v_existing from public.game_players where game_id = v_game.id and user_id = v_user;
  if v_existing is not null then
    delete from public.game_invites where game_id = v_game.id and to_user_id = v_user;
    return jsonb_build_object('game_id', v_game.id, 'code', v_game.code);
  end if;

  if v_game.status <> 'lobby' then
    raise exception 'Cette partie a déjà commencé.';
  end if;

  select count(*) into v_count from public.game_players where game_id = v_game.id;
  if v_count >= 20 then
    raise exception 'Cette partie est complète (20 joueurs maximum).';
  end if;

  v_seat := v_count + 1;
  select avatar_icon into v_icon from public.profiles where id = v_user;

  insert into public.game_players (game_id, user_id, display_name, seat_number, is_host, avatar_color, avatar_icon)
  values (v_game.id, v_user, coalesce(nullif(trim(p_display_name), ''), 'Joueur'), v_seat, false, public.random_avatar_color(), v_icon);

  insert into public.game_log (game_id, message)
  values (v_game.id, coalesce(nullif(trim(p_display_name), ''), 'Un joueur') || ' a rejoint la partie.');

  delete from public.game_invites where game_id = v_game.id and to_user_id = v_user;

  return jsonb_build_object('game_id', v_game.id, 'code', v_game.code);
end;
$$;
