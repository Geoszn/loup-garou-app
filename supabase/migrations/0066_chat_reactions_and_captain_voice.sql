-- ============================================================================
-- 1. Réactions emoji sur les messages de chat, dans les trois salons
--    (village, wolves, graveyard). Jeu fixe de 6 emoji (comme la plupart des
--    apps de chat) plutôt que du texte libre : plus simple à afficher en
--    pastilles groupées, et évite d'ouvrir un nouveau canal de contenu
--    arbitraire à modérer. Une réaction ne révèle jamais rien sur l'auteur
--    d'un message anonyme (chat de nuit du village, migration 0026) — elle ne
--    fait qu'identifier qui a réagi, ce qui n'est jamais sensible ici.
--
--    Autorisé dès que le salon est LISIBLE (can_read_channel), pas seulement
--    écriture (can_access_channel) : un fantôme qui suit le village en
--    lecture seule peut réagir aux messages, pas seulement les vivants qui
--    peuvent écrire.
--
-- 2. can_listen_channel : ouvre le vocal du village pendant l'élection du
--    Capitaine (captain_election), pour les vivants ET les fantômes en
--    écoute — jusqu'ici le vocal ne s'ouvrait qu'aux phases de jour
--    (day_reveal/day_discussion/day_vote), le texte écrit restant fermé
--    pendant l'élection (aucun changement voulu de ce côté, le vote reste
--    silencieux à l'écrit).
-- ============================================================================
set search_path = public;

-- ----------------------------------------------------------------------------
-- chat_message_reactions
-- ----------------------------------------------------------------------------
create table if not exists public.chat_message_reactions (
  id uuid primary key default gen_random_uuid(),
  message_id uuid not null references public.chat_messages (id) on delete cascade,
  game_id uuid not null references public.games (id) on delete cascade,
  channel text not null check (channel in ('village', 'wolves', 'graveyard')),
  user_id uuid not null references public.profiles (id) on delete cascade,
  display_name text not null,
  emoji text not null check (emoji in ('👍', '❤️', '😂', '😮', '😢', '🔥')),
  created_at timestamptz not null default now(),
  unique (message_id, user_id, emoji)
);

create index if not exists chat_message_reactions_message_idx
  on public.chat_message_reactions (message_id);

alter table public.chat_message_reactions enable row level security;

drop policy if exists "chat_reactions_select_when_open" on public.chat_message_reactions;
create policy "chat_reactions_select_when_open" on public.chat_message_reactions
  for select using (public.can_read_channel(chat_message_reactions.game_id, chat_message_reactions.channel));

-- Pas de policy insert/delete : écriture exclusivement via toggle_chat_reaction
-- (security definer), même patron que send_chat_message pour chat_messages.

alter table public.chat_message_reactions replica identity full;

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and tablename = 'chat_message_reactions'
  ) then
    alter publication supabase_realtime add table public.chat_message_reactions;
  end if;
end $$;

-- ----------------------------------------------------------------------------
-- toggle_chat_reaction : ajoute la réaction si elle n'existe pas encore pour
-- ce (message, utilisateur, emoji), la retire sinon — un seul aller-retour
-- client pour les deux cas, pas besoin de connaître l'état actuel avant
-- d'appeler.
-- ----------------------------------------------------------------------------
create or replace function public.toggle_chat_reaction(p_message_id uuid, p_emoji text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_game_id uuid;
  v_channel text;
  v_name text;
  v_existing uuid;
begin
  if v_user is null then
    raise exception 'Authentification requise';
  end if;

  if p_emoji not in ('👍', '❤️', '😂', '😮', '😢', '🔥') then
    raise exception 'Réaction invalide.';
  end if;

  select game_id, channel into v_game_id, v_channel
  from public.chat_messages where id = p_message_id;

  if v_game_id is null then
    raise exception 'Message introuvable.';
  end if;

  if not public.can_read_channel(v_game_id, v_channel) then
    raise exception 'Ce salon n''est pas accessible en ce moment.';
  end if;

  select id into v_existing
  from public.chat_message_reactions
  where message_id = p_message_id and user_id = v_user and emoji = p_emoji;

  if v_existing is not null then
    delete from public.chat_message_reactions where id = v_existing;
    return;
  end if;

  select display_name into v_name from public.game_players where game_id = v_game_id and user_id = v_user;

  insert into public.chat_message_reactions (message_id, game_id, channel, user_id, display_name, emoji)
  values (p_message_id, v_game_id, v_channel, v_user, coalesce(v_name, 'Joueur'), p_emoji);
end;
$$;

grant execute on function public.toggle_chat_reaction(uuid, text) to authenticated;

-- ----------------------------------------------------------------------------
-- can_listen_channel : reprise de 0041_debate_extend_reply_ghost_listen_night
-- _recap.sql, ajoute 'captain_election' aux statuts ouvrant le vocal du
-- village (vivants et fantômes en écoute).
-- ----------------------------------------------------------------------------
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
  if v_alive is null then return false; end if;
  if v_banned then return false; end if;

  if v_alive then
    return v_status in ('day_reveal', 'day_discussion', 'day_vote', 'captain_election');
  end if;

  -- fantôme : peut écouter le village dès qu'il y a effectivement du vocal
  -- côté vivants (mêmes phases), à tout moment de la partie.
  return v_status in ('day_reveal', 'day_discussion', 'day_vote', 'captain_election');
end;
$$;

grant execute on function public.can_listen_channel(uuid, text) to authenticated;
