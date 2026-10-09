-- Tribu — @everyone (aussi @tous) dans le chat.
--
--  * réservé au chef et aux sous-chefs, une fois toutes les 10 minutes par tribu (anti-abus) ;
--  * prévient tous les membres via la push « mention » (sans limite de 2 min), SANS forcer le silence :
--    un membre en mode muet, archivé ou en heures calmes n'est pas dérangé ;
--  * le message est stocké avec mention_all = true (la bulle s'affiche en doré pour tout le monde).
-- Rejouable sans risque.

alter table public.tribe_messages
  add column if not exists mention_all boolean not null default false;

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
  v_mentions uuid[] := '{}';
  v_all boolean;
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

  -- Membres cités avec @pseudo (le pseudo entier, sans tenir compte de la casse).
  select coalesce(array_agg(tm.user_id), '{}'::uuid[]) into v_mentions
  from public.tribe_members tm
  join public.profiles pr on pr.id = tm.user_id
  where tm.tribe_id = m.tribe_id and tm.user_id <> v_user
    and lower(v_body) ~ ('(^|[^[:alnum:]_])@' || public._regex_escape(lower(pr.username)) || '($|[^[:alnum:]_])');
  -- @everyone / @tous : réservé au chef et aux sous-chefs, une fois toutes les 10 minutes par tribu.
  v_all := lower(v_body) ~ '(^|[^[:alnum:]_])@(everyone|tous)($|[^[:alnum:]_])';
  if v_all then
    if m.role not in ('chef', 'sous_chef') then
      raise exception 'Seuls le chef et les sous-chefs peuvent utiliser @everyone.';
    end if;
    if exists (select 1 from public.tribe_messages where tribe_id = m.tribe_id and mention_all and created_at > now() - interval '10 minutes') then
      raise exception 'Un @everyone a déjà été envoyé il y a moins de 10 minutes.';
    end if;
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
    insert into public.tribe_messages (tribe_id, user_id, kind, body, mentions, mention_all, reply_to, reply_name, reply_snippet)
    values (m.tribe_id, v_user, 'user', v_body, v_mentions, v_all, v_reply.id, v_reply_name, case when v_reply.sticker is not null then '🎭 Sticker' else left(regexp_replace(coalesce(v_reply.body, ''), '\s+', ' ', 'g'), 100) end);
  else
    insert into public.tribe_messages (tribe_id, user_id, kind, body, mentions, mention_all) values (m.tribe_id, v_user, 'user', v_body, v_mentions, v_all);
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
      'id', x.id, 'kind', x.kind, 'body', x.body, 'sticker', x.sticker, 'mentions', to_jsonb(x.mentions), 'mention_all', x.mention_all, 'event', x.event,
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

create or replace function public.pick_tribe_chat_push(p_sender uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  msg public.tribe_messages%rowtype;
  v_tribe_name text;
  v_sender_name text;
  v_reply_author uuid;
  v_recipients jsonb;
begin
  select * into msg from public.tribe_messages
  where user_id = p_sender and kind = 'user' and pushed_at is null and created_at > now() - interval '60 seconds'
  order by created_at desc limit 1
  for update;
  if not found then
    return null;
  end if;
  update public.tribe_messages set pushed_at = now() where id = msg.id;
  if not exists (select 1 from public.tribe_members where user_id = p_sender and tribe_id = msg.tribe_id) then
    return null;
  end if;

  select name into v_tribe_name from public.tribes where id = msg.tribe_id;
  select username into v_sender_name from public.profiles where id = p_sender;
  if msg.reply_to is not null then
    select user_id into v_reply_author from public.tribe_messages where id = msg.reply_to and tribe_id = msg.tribe_id;
  end if;

  -- Réponse ou mention : la discussion archivée se rouvre.
  update public.tribe_members set chat_archived = false
  where tribe_id = msg.tribe_id and chat_archived and user_id <> p_sender
    and (user_id = v_reply_author or user_id = any(msg.mentions));

  with cand as (
    select tm.user_id, p.lang,
           (tm.user_id = v_reply_author) as is_reply,
           (tm.user_id = any(msg.mentions) or msg.mention_all) as is_mention,
           (
             select count(*) from public.tribe_messages x
             where x.tribe_id = tm.tribe_id and x.kind = 'user' and x.user_id is distinct from tm.user_id and x.created_at > tm.last_read_at
           )::int as unread
    from public.tribe_members tm
    join public.profiles p on p.id = tm.user_id
    left join public.notification_prefs np on np.user_id = tm.user_id
    where tm.tribe_id = msg.tribe_id
      and tm.user_id <> p_sender
      and not coalesce(p.is_bot, false)
      and not tm.chat_archived
      and tm.last_read_at < now() - interval '45 seconds'
      and not public._in_quiet_hours(np.chat_quiet_enabled, np.chat_quiet_start, np.chat_quiet_end, np.tz_offset_min)
      and (
        coalesce(tm.notif_muted_until, '-infinity'::timestamptz) <= now()
        or (tm.notif_replies and (tm.user_id = v_reply_author or tm.user_id = any(msg.mentions)))
      )
      and (
        tm.user_id = v_reply_author or tm.user_id = any(msg.mentions) or msg.mention_all
        or tm.chat_last_push_at is null or tm.chat_last_push_at < now() - interval '2 minutes'
      )
  ), claimed as (
    update public.tribe_members tm set chat_last_push_at = now() from cand where tm.user_id = cand.user_id returning tm.user_id
  )
  select coalesce(jsonb_agg(jsonb_build_object('user_id', cand.user_id, 'lang', cand.lang, 'is_reply', cand.is_reply, 'is_mention', cand.is_mention, 'unread', greatest(cand.unread, 1))), '[]'::jsonb)
  into v_recipients
  from cand join claimed on claimed.user_id = cand.user_id;

  return jsonb_build_object(
    'tribe_id', msg.tribe_id,
    'tribe_name', v_tribe_name,
    'sender_name', coalesce(v_sender_name, '?'),
    'is_sticker', msg.sticker is not null,
    'mention_all', msg.mention_all,
    'preview', left(regexp_replace(coalesce(msg.body, ''), '\s+', ' ', 'g'), 100),
    'recipients', v_recipients
  );
end;
$$;

revoke execute on function public.send_tribe_message(text, uuid) from public, anon;
grant execute on function public.send_tribe_message(text, uuid) to authenticated;
revoke execute on function public.get_tribe_messages(timestamptz, int) from public, anon;
grant execute on function public.get_tribe_messages(timestamptz, int) to authenticated;
revoke execute on function public.pick_tribe_chat_push(uuid) from public, anon, authenticated;
grant execute on function public.pick_tribe_chat_push(uuid) to service_role;
