-- ============================================================================
-- Chat du village ouvert (et anonyme) toute la nuit, pour que les joueurs
-- n'ayant pas de rôle à jouer à un instant donné ne s'ennuient plus en
-- attendant en silence. Deux changements :
--
--   1. Le salon "village" est désormais accessible en lecture/écriture aux
--      joueurs vivants pendant TOUTE la phase de nuit (et plus seulement le
--      jour) — mais les messages envoyés dans "village" pendant la nuit sont
--      anonymes : la ligne stockée dans chat_messages ne porte plus l'auteur
--      réel (ni son nom, ni son user_id, pour empêcher qu'on le retrouve en
--      le comparant à la liste des joueurs), seulement `is_anonymous = true`.
--      L'identité réelle est déposée à part, dans chat_message_identities,
--      une table dont la RLS ne la rend lisible qu'à son auteur (pour qu'il
--      voie ses propres messages en surbrillance) et à la Petite Fille
--      vivante de la partie (nouveau pouvoir passif : elle seule peut
--      démasquer qui écrit quoi durant la nuit — tant qu'elle est en vie).
--   2. Le salon "wolves" est inchangé : toujours réservé aux Loups-Garous
--      vivants pendant leur tour de nuit, toujours nominatif entre eux (ils
--      se connaissent déjà en tant que meute).
--
-- Important pour la vraie confidentialité (pas juste côté interface) :
-- Realtime respecte les policies RLS ligne par ligne mais ne masque jamais
-- une colonne à l'intérieur d'une ligne autorisée — donc si l'auteur réel
-- restait dans chat_messages.user_id/display_name, n'importe quel joueur du
-- salon "village" le recevrait quand même tel quel via l'abonnement temps
-- réel, même si l'interface choisit de ne pas l'afficher. D'où la table à
-- part, avec sa propre RLS bien plus restrictive.
-- ============================================================================
set search_path = public;

-- ----------------------------------------------------------------------------
-- chat_messages : l'auteur d'un message anonyme n'est plus stocké en clair
-- dans cette table (voir chat_message_identities plus bas).
-- ----------------------------------------------------------------------------
alter table public.chat_messages
  alter column user_id drop not null,
  alter column display_name drop not null;

alter table public.chat_messages
  add column if not exists is_anonymous boolean not null default false;

-- ----------------------------------------------------------------------------
-- chat_message_identities : correspondance message -> auteur réel, pour les
-- messages anonymes uniquement. Lisible seulement par l'auteur lui-même et
-- par la Petite Fille vivante de la partie (voir policy plus bas) — jamais
-- par les autres joueurs, y compris via Realtime.
-- ----------------------------------------------------------------------------
create table if not exists public.chat_message_identities (
  message_id uuid primary key references public.chat_messages (id) on delete cascade,
  game_id uuid not null references public.games (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  display_name text not null,
  created_at timestamptz not null default now()
);

create index if not exists chat_message_identities_game_user_idx
  on public.chat_message_identities (game_id, user_id);

alter table public.chat_message_identities enable row level security;

create or replace function public.is_alive_petite_fille(p_game_id uuid)
returns boolean
language plpgsql
security definer
stable
set search_path = public
as $$
declare
  v_alive boolean;
  v_role text;
begin
  select is_alive into v_alive from public.game_players where game_id = p_game_id and user_id = auth.uid();
  if v_alive is not true then return false; end if;
  select role into v_role from public.game_roles_secret where game_id = p_game_id and user_id = auth.uid();
  return v_role = 'petite_fille';
end;
$$;

grant execute on function public.is_alive_petite_fille(uuid) to authenticated;

drop policy if exists "chat_identity_select" on public.chat_message_identities;
create policy "chat_identity_select" on public.chat_message_identities
  for select using (
    user_id = auth.uid()
    or public.is_alive_petite_fille(chat_message_identities.game_id)
  );

alter table public.chat_message_identities replica identity full;

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and tablename = 'chat_message_identities'
  ) then
    alter publication supabase_realtime add table public.chat_message_identities;
  end if;
end $$;

-- ----------------------------------------------------------------------------
-- can_access_channel (écriture) / can_read_channel (lecture) : "village"
-- s'ouvre maintenant aussi pendant `status = 'night'`, en plus des phases de
-- jour. "wolves" et "graveyard" inchangés.
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
  v_role text;
begin
  select status, night_step into v_status, v_night_step from public.games where id = p_game_id;
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
    if not v_alive or v_status <> 'night' or v_night_step <> 'loup_garou' then
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
  v_night_step text;
  v_alive boolean;
  v_role text;
begin
  select status, night_step into v_status, v_night_step from public.games where id = p_game_id;
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
    if not v_alive or v_status <> 'night' or v_night_step <> 'loup_garou' then
      return false;
    end if;
    select role into v_role from public.game_roles_secret where game_id = p_game_id and user_id = auth.uid();
    return v_role = 'loup_garou';
  end if;

  return false;
end;
$$;

grant execute on function public.can_read_channel(uuid, text) to authenticated;

drop policy if exists "chat_select_when_open" on public.chat_messages;
create policy "chat_select_when_open" on public.chat_messages
  for select using (public.can_read_channel(chat_messages.game_id, chat_messages.channel));

drop policy if exists "chat_insert_when_open" on public.chat_messages;
create policy "chat_insert_when_open" on public.chat_messages
  for insert with check (
    user_id = auth.uid()
    and public.can_access_channel(chat_messages.game_id, chat_messages.channel)
  );

-- ----------------------------------------------------------------------------
-- send_chat_message : anonymise désormais les messages du salon "village"
-- envoyés pendant la nuit — la ligne publique ne porte plus l'auteur, qui est
-- déposé à part dans chat_message_identities (accès restreint, voir plus
-- haut).
-- ----------------------------------------------------------------------------
create or replace function public.send_chat_message(p_game_id uuid, p_channel text, p_content text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_name text;
  v_status text;
  v_content text := trim(p_content);
  v_anonymous boolean;
  v_message_id uuid;
begin
  if v_content = '' then
    return;
  end if;
  if char_length(v_content) > 500 then
    v_content := left(v_content, 500);
  end if;

  if not public.can_access_channel(p_game_id, p_channel) then
    raise exception 'Ce salon n''est pas ouvert en ce moment.';
  end if;

  select status into v_status from public.games where id = p_game_id;
  select display_name into v_name from public.game_players where game_id = p_game_id and user_id = v_user;
  v_name := coalesce(v_name, 'Joueur');

  v_anonymous := (p_channel = 'village' and v_status = 'night');

  if v_anonymous then
    insert into public.chat_messages (game_id, channel, user_id, display_name, content, is_anonymous)
    values (p_game_id, p_channel, null, null, v_content, true)
    returning id into v_message_id;

    insert into public.chat_message_identities (message_id, game_id, user_id, display_name)
    values (v_message_id, p_game_id, v_user, v_name);
  else
    insert into public.chat_messages (game_id, channel, user_id, display_name, content, is_anonymous)
    values (p_game_id, p_channel, v_user, v_name, v_content, false);
  end if;
end;
$$;

grant execute on function public.send_chat_message(uuid, text, text) to authenticated;
