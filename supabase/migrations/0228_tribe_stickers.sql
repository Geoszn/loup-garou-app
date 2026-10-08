-- Stickers dans le chat de tribu : un sticker est un message sans texte qui porte
-- l'identifiant d'un sticker du catalogue. Le premier pack, « Moi », est dessiné par
-- l'appli avec l'AVATAR de l'expéditeur (une humeur, un accessoire, une légende) : le
-- serveur ne stocke que l'identifiant, rien d'autre.
--
--  * tribe_messages.sticker (identifiant) ; send_tribe_sticker l'enregistre après avoir
--    vérifié qu'il est au catalogue (tribe_sticker_ids) ; mêmes limites que les messages
--    (muet, 1 par seconde, 20 par minute) ;
--  * répondre à un sticker garde une citation « 🎭 Sticker » ;
--  * get_tribe_messages renvoie aussi le sticker.
-- Pour ajouter un sticker : l'ajouter à tribe_sticker_ids() ici ET dans src/lib/stickers.ts.
-- Rejouable sans risque. À appliquer APRÈS 0227.
set search_path = public;

alter table public.tribe_messages add column if not exists sticker text check (sticker is null or char_length(sticker) <= 24);

create or replace function public.tribe_sticker_ids()
returns text[]
language sql
immutable
as $$
  select array['gg', 'haha', 'grr', 'quoi', 'zzz', 'chut', 'bravo', 'ecoutez', 'rip', 'aufeu', 'suspect', 'merci']
$$;

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
    values (m.tribe_id, v_user, 'user', v_body, v_reply.id, v_reply_name, case when v_reply.sticker is not null then '🎭 Sticker' else left(regexp_replace(coalesce(v_reply.body, ''), '\s+', ' ', 'g'), 100) end);
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

create or replace function public.send_tribe_sticker(p_sticker text, p_reply_to uuid default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  m public.tribe_members%rowtype;
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
  if p_sticker is null or not (p_sticker = any (public.tribe_sticker_ids())) then
    raise exception 'Sticker inconnu.';
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
    insert into public.tribe_messages (tribe_id, user_id, kind, sticker, reply_to, reply_name, reply_snippet)
    values (m.tribe_id, v_user, 'user', p_sticker, v_reply.id, v_reply_name, case when v_reply.sticker is not null then '🎭 Sticker' else left(regexp_replace(coalesce(v_reply.body, ''), '\s+', ' ', 'g'), 100) end);
  else
    insert into public.tribe_messages (tribe_id, user_id, kind, sticker) values (m.tribe_id, v_user, 'user', p_sticker);
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
      'id', x.id, 'kind', x.kind, 'body', x.body, 'sticker', x.sticker, 'event', x.event,
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

revoke execute on function public.send_tribe_message(text, uuid) from public, anon;
grant execute on function public.send_tribe_message(text, uuid) to authenticated;
revoke execute on function public.send_tribe_sticker(text, uuid) from public, anon;
grant execute on function public.send_tribe_sticker(text, uuid) to authenticated;
revoke execute on function public.get_tribe_messages(timestamptz, int) from public, anon;
grant execute on function public.get_tribe_messages(timestamptz, int) to authenticated;
