-- Chat de tribu façon messagerie : répondre à un message (avec retour au message
-- d'origine d'un toucher sur la citation) et réagir avec les mêmes 6 emoji que le chat
-- des parties.
--
--  * tribe_messages gagne reply_to (+ une copie du nom et du début du texte, pour que la
--    citation reste lisible même si l'original est supprimé ou trop ancien) ;
--  * tribe_message_reactions : une ligne par (message, joueur, emoji), écriture
--    uniquement par toggle_tribe_reaction ; lecture réservée aux membres de la tribu ;
--  * send_tribe_message prend un 2e paramètre (p_reply_to) : l'ancienne signature à
--    un paramètre est supprimée, sinon l'appel serait ambigu ;
--  * get_tribe_messages renvoie la citation et les réactions de chaque message.
-- Rejouable sans risque. À appliquer APRÈS 0222.
set search_path = public;

alter table public.tribe_messages
  add column if not exists reply_to uuid references public.tribe_messages (id) on delete set null,
  add column if not exists reply_name text,
  add column if not exists reply_snippet text;

create table if not exists public.tribe_message_reactions (
  id uuid primary key default gen_random_uuid(),
  message_id uuid not null references public.tribe_messages (id) on delete cascade,
  tribe_id uuid not null references public.tribes (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  emoji text not null check (emoji in ('👍', '❤️', '😂', '😮', '😢', '🔥')),
  created_at timestamptz not null default now(),
  unique (message_id, user_id, emoji)
);
create index if not exists tribe_message_reactions_message_idx on public.tribe_message_reactions (message_id);
create index if not exists tribe_message_reactions_user_idx on public.tribe_message_reactions (user_id, created_at desc);

alter table public.tribe_message_reactions enable row level security;
revoke all on public.tribe_message_reactions from anon, authenticated;
grant select on public.tribe_message_reactions to authenticated;
drop policy if exists tribe_message_reactions_select on public.tribe_message_reactions;
create policy tribe_message_reactions_select on public.tribe_message_reactions
  for select to authenticated
  using (exists (select 1 from public.tribe_members m where m.user_id = auth.uid() and m.tribe_id = tribe_message_reactions.tribe_id));

do $$
begin
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'tribe_message_reactions') then
    alter publication supabase_realtime add table public.tribe_message_reactions;
  end if;
end;
$$;

-- L'ancienne signature (un seul paramètre) est remplacée.
drop function if exists public.send_tribe_message(text);

create or replace function public.send_tribe_message(p_body text, p_reply_to uuid default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  m public.tribe_members%rowtype;
  v_body text := trim(regexp_replace(coalesce(p_body, ''), '[\x00-\x08\x0b\x0c\x0e-\x1f]', '', 'g'));
  v_reply public.tribe_messages%rowtype;
  v_reply_name text;
begin
  if v_user is null then
    raise exception 'Authentification requise';
  end if;
  select * into m from public.tribe_members where user_id = v_user;
  if not found then
    raise exception 'Tu n''as pas de tribu.';
  end if;
  if m.muted_until is not null and m.muted_until > now() then
    raise exception 'Tu as été rendu muet par le chef de la tribu.';
  end if;
  if char_length(v_body) not between 1 and 500 then
    raise exception 'Le message doit faire entre 1 et 500 caractères.';
  end if;
  if exists (select 1 from public.tribe_messages where tribe_id = m.tribe_id and user_id = v_user and kind = 'user' and created_at > now() - interval '1 second')
     or (select count(*) from public.tribe_messages where tribe_id = m.tribe_id and user_id = v_user and kind = 'user' and created_at > now() - interval '1 minute') >= 20 then
    raise exception 'Doucement, tu écris trop vite.';
  end if;

  -- Réponse à un message : il doit appartenir à CETTE tribu ; on garde une copie du
  -- nom et du début du texte pour pouvoir l'afficher même quand l'original a été supprimé.
  if p_reply_to is not null then
    select * into v_reply from public.tribe_messages where id = p_reply_to;
    if v_reply.id is null or v_reply.tribe_id <> m.tribe_id or v_reply.kind <> 'user' then
      raise exception 'Le message auquel tu réponds est introuvable.';
    end if;
    select username into v_reply_name from public.profiles where id = v_reply.user_id;
    insert into public.tribe_messages (tribe_id, user_id, kind, body, reply_to, reply_name, reply_snippet)
    values (m.tribe_id, v_user, 'user', v_body, v_reply.id, v_reply_name, left(regexp_replace(coalesce(v_reply.body, ''), '\s+', ' ', 'g'), 100));
  else
    insert into public.tribe_messages (tribe_id, user_id, kind, body) values (m.tribe_id, v_user, 'user', v_body);
  end if;

  -- On ne garde que les 200 derniers messages de la tribu.
  delete from public.tribe_messages
  where id in (
    select id from public.tribe_messages where tribe_id = m.tribe_id
    order by created_at desc, id desc offset 200
  );

  update public.tribe_members set last_read_at = now() where user_id = v_user;
end;
$$;

create or replace function public.get_tribe_messages(p_before timestamptz default null, p_limit int default 50)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  m public.tribe_members%rowtype;
begin
  if v_user is null then
    raise exception 'Authentification requise';
  end if;
  select * into m from public.tribe_members where user_id = v_user;
  if not found then
    return '[]'::jsonb;
  end if;

  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', x.id, 'kind', x.kind, 'body', x.body, 'event', x.event,
      'actor_name', x.actor_name, 'target_name', x.target_name, 'created_at', x.created_at,
      'user_id', x.user_id, 'username', p.username, 'avatar_icon', p.avatar_icon, 'avatar_config', p.avatar_config,
      'role', mm.role,
      'reply_to', x.reply_to, 'reply_name', x.reply_name, 'reply_snippet', x.reply_snippet,
      'reactions', coalesce((
        select jsonb_agg(jsonb_build_object('emoji', r.emoji, 'user_id', r.user_id, 'username', rp.username) order by r.created_at)
        from public.tribe_message_reactions r
        join public.profiles rp on rp.id = r.user_id
        where r.message_id = x.id
      ), '[]'::jsonb)
    ) order by x.created_at, x.id)
    from (
      select * from public.tribe_messages
      where tribe_id = m.tribe_id and (p_before is null or created_at < p_before)
      order by created_at desc, id desc
      limit least(greatest(coalesce(p_limit, 50), 1), 100)
    ) x
    left join public.profiles p on p.id = x.user_id
    left join public.tribe_members mm on mm.user_id = x.user_id and mm.tribe_id = m.tribe_id
  ), '[]'::jsonb);
end;
$$;

-- Ajoute la réaction si elle n'existe pas encore pour (message, joueur, emoji), la retire sinon.
create or replace function public.toggle_tribe_reaction(p_message_id uuid, p_emoji text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  m public.tribe_members%rowtype;
  msg public.tribe_messages%rowtype;
  v_existing uuid;
begin
  if v_user is null then
    raise exception 'Authentification requise';
  end if;
  if p_emoji is null or p_emoji not in ('👍', '❤️', '😂', '😮', '😢', '🔥') then
    raise exception 'Réaction invalide.';
  end if;
  select * into m from public.tribe_members where user_id = v_user;
  if not found then
    raise exception 'Tu n''as pas de tribu.';
  end if;
  if m.muted_until is not null and m.muted_until > now() then
    raise exception 'Tu as été rendu muet par le chef de la tribu.';
  end if;
  select * into msg from public.tribe_messages where id = p_message_id;
  if msg.id is null or msg.tribe_id <> m.tribe_id or msg.kind <> 'user' then
    raise exception 'Message introuvable.';
  end if;

  select id into v_existing from public.tribe_message_reactions
  where message_id = p_message_id and user_id = v_user and emoji = p_emoji;
  if v_existing is not null then
    delete from public.tribe_message_reactions where id = v_existing;
    return;
  end if;

  if (select count(*) from public.tribe_message_reactions where user_id = v_user and created_at > now() - interval '1 minute') >= 40 then
    raise exception 'Doucement, tu réagis trop vite.';
  end if;
  insert into public.tribe_message_reactions (message_id, tribe_id, user_id, emoji)
  values (p_message_id, m.tribe_id, v_user, p_emoji);
end;
$$;

revoke execute on function public.send_tribe_message(text, uuid) from public, anon;
grant execute on function public.send_tribe_message(text, uuid) to authenticated;
revoke execute on function public.get_tribe_messages(timestamptz, int) from public, anon;
grant execute on function public.get_tribe_messages(timestamptz, int) to authenticated;
revoke execute on function public.toggle_tribe_reaction(uuid, text) from public, anon;
grant execute on function public.toggle_tribe_reaction(uuid, text) to authenticated;
