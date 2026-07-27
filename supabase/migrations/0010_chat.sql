-- ============================================================================
-- Chat texte en direct, avec 3 salons dont l'accès est entièrement piloté
-- par l'état de la partie (pas seulement caché côté interface, mais
-- réellement bloqué en base de données) :
--
--   - "village"   : joueurs vivants, uniquement pendant les phases de jour
--                    (day_reveal, day_discussion, day_vote)
--   - "wolves"    : loups-garous vivants, uniquement pendant leur tour de
--                    nuit (night_step = 'loup_garou')
--   - "graveyard" : joueurs éliminés, à tout moment (salon des fantômes,
--                    ne peut jamais influencer la partie)
-- ============================================================================
set search_path = public;

create table if not exists public.chat_messages (
  id uuid primary key default gen_random_uuid(),
  game_id uuid not null references public.games (id) on delete cascade,
  channel text not null check (channel in ('village', 'wolves', 'graveyard')),
  user_id uuid not null references public.profiles (id) on delete cascade,
  display_name text not null,
  content text not null check (char_length(trim(content)) > 0 and char_length(content) <= 500),
  created_at timestamptz not null default now()
);

create index if not exists chat_messages_game_channel_idx
  on public.chat_messages (game_id, channel, created_at);

alter table public.chat_messages enable row level security;

-- ----------------------------------------------------------------------------
-- can_access_channel : source de vérité unique sur qui a le droit de lire ou
-- écrire dans un salon, à l'instant présent. Recalculée à chaque requête à
-- partir de l'état réel de la partie, donc un salon se ferme automatiquement
-- dès que la partie change de phase.
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
    return v_alive and v_status in ('day_reveal', 'day_discussion', 'day_vote');
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

drop policy if exists "chat_select_when_open" on public.chat_messages;
create policy "chat_select_when_open" on public.chat_messages
  for select using (public.can_access_channel(chat_messages.game_id, chat_messages.channel));

drop policy if exists "chat_insert_when_open" on public.chat_messages;
create policy "chat_insert_when_open" on public.chat_messages
  for insert with check (
    user_id = auth.uid()
    and public.can_access_channel(chat_messages.game_id, chat_messages.channel)
  );

-- Fonction d'envoi : plus simple à appeler depuis le client qu'un insert
-- direct, et garantit que display_name reflète bien le pseudo du joueur.
create or replace function public.send_chat_message(p_game_id uuid, p_channel text, p_content text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_name text;
  v_content text := trim(p_content);
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

  select display_name into v_name from public.game_players where game_id = p_game_id and user_id = v_user;

  insert into public.chat_messages (game_id, channel, user_id, display_name, content)
  values (p_game_id, p_channel, v_user, coalesce(v_name, 'Joueur'), v_content);
end;
$$;

grant execute on function public.send_chat_message(uuid, text, text) to authenticated;

alter table public.chat_messages replica identity full;

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and tablename = 'chat_messages'
  ) then
    alter publication supabase_realtime add table public.chat_messages;
  end if;
end $$;
