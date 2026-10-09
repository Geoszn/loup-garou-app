-- Notifications du chat de tribu, façon messagerie : un push groupé à chaque message, un mode
-- silencieux réglable et l'archivage de la discussion.
--
--  * tribe_members gagne : notif_muted_until (silencieux jusqu'à ; 'infinity' = toujours),
--    notif_replies (en silencieux, prévenir quand on répond à MES messages), chat_archived
--    (discussion archivée : ni push, ni pastille), chat_last_push_at (limite d'une notification
--    toutes les 2 minutes par membre). NB : muted_until existant = « rendu muet par le chef »,
--    c'est autre chose.
--  * tribe_messages.pushed_at : un message n'est notifié qu'une fois.
--  * set_tribe_chat_prefs : le joueur règle son silence / ses réponses / l'archivage.
--  * pick_tribe_chat_push (réservée au serveur) : à partir du dernier message de l'expéditeur,
--    choisit QUI prévenir (pas lui, pas un bot, pas quelqu'un qui lit déjà le chat, pas un
--    silence/archive — sauf réponse à son message —, pas plus d'un push par 2 min), désarchive
--    celui à qui l'on répond, et renvoie le contenu à notifier. L'envoi se fait dans
--    api/notify-user.ts.
--  * get_my_tribe_summary renvoie les trois réglages.
-- Rejouable sans risque. À appliquer APRÈS 0232.
set search_path = public;

alter table public.tribe_members
  add column if not exists notif_muted_until timestamptz,
  add column if not exists notif_replies boolean not null default true,
  add column if not exists chat_archived boolean not null default false,
  add column if not exists chat_last_push_at timestamptz;
alter table public.tribe_messages add column if not exists pushed_at timestamptz;

create or replace function public.set_tribe_chat_prefs(p_mute text, p_replies boolean, p_archived boolean)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  m public.tribe_members%rowtype;
  v_until timestamptz;
begin
  if v_user is null then
    raise exception 'Authentification requise';
  end if;
  select * into m from public.tribe_members where user_id = v_user;
  if not found then
    raise exception 'Tu n''as pas de tribu.';
  end if;
  v_until := case p_mute
    when 'keep' then m.notif_muted_until
    when 'off' then null
    when '1h' then now() + interval '1 hour'
    when '8h' then now() + interval '8 hours'
    when '1w' then now() + interval '7 days'
    when 'always' then 'infinity'::timestamptz
    else null
  end;
  if p_mute is null or p_mute not in ('keep', 'off', '1h', '8h', '1w', 'always') then
    raise exception 'Réglage invalide.';
  end if;
  update public.tribe_members
  set notif_muted_until = v_until,
      notif_replies = coalesce(p_replies, true),
      chat_archived = coalesce(p_archived, false)
  where user_id = v_user;
  return jsonb_build_object('notif_muted_until', v_until, 'notif_replies', coalesce(p_replies, true), 'archived', coalesce(p_archived, false));
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

  -- On répond à un membre qui avait archivé la discussion : elle se rouvre pour lui.
  if v_reply_author is not null and v_reply_author <> p_sender then
    update public.tribe_members set chat_archived = false
    where user_id = v_reply_author and tribe_id = msg.tribe_id and chat_archived;
  end if;

  with cand as (
    select tm.user_id, p.lang, (tm.user_id = v_reply_author) as is_reply,
           (
             select count(*) from public.tribe_messages x
             where x.tribe_id = tm.tribe_id and x.kind = 'user' and x.user_id is distinct from tm.user_id and x.created_at > tm.last_read_at
           )::int as unread
    from public.tribe_members tm
    join public.profiles p on p.id = tm.user_id
    where tm.tribe_id = msg.tribe_id
      and tm.user_id <> p_sender
      and not coalesce(p.is_bot, false)
      and not tm.chat_archived
      and tm.last_read_at < now() - interval '45 seconds'
      and (coalesce(tm.notif_muted_until, '-infinity'::timestamptz) <= now() or (tm.notif_replies and tm.user_id = v_reply_author))
      and (tm.user_id = v_reply_author or tm.chat_last_push_at is null or tm.chat_last_push_at < now() - interval '2 minutes')
  ), claimed as (
    update public.tribe_members tm set chat_last_push_at = now() from cand where tm.user_id = cand.user_id returning tm.user_id
  )
  select coalesce(jsonb_agg(jsonb_build_object('user_id', cand.user_id, 'lang', cand.lang, 'is_reply', cand.is_reply, 'unread', greatest(cand.unread, 1))), '[]'::jsonb)
  into v_recipients
  from cand join claimed on claimed.user_id = cand.user_id;

  return jsonb_build_object(
    'tribe_id', msg.tribe_id,
    'tribe_name', v_tribe_name,
    'sender_name', coalesce(v_sender_name, '?'),
    'is_sticker', msg.sticker is not null,
    'preview', left(regexp_replace(coalesce(msg.body, ''), '\s+', ' ', 'g'), 100),
    'recipients', v_recipients
  );
end;
$$;

-- Résumé de la tribu (0225) + les réglages de notification.
create or replace function public.get_my_tribe_summary()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  m public.tribe_members%rowtype;
  t public.tribes%rowtype;
begin
  if v_user is null then
    raise exception 'Authentification requise';
  end if;

  select * into m from public.tribe_members where user_id = v_user;
  if not found then
    return jsonb_build_object(
      'tribe', null,
      'invites', coalesce((
        select jsonb_agg(jsonb_build_object(
          'id', i.id, 'tribe_name', tr.name, 'emblem', tr.emblem, 'color', tr.color,
          'member_count', (select count(*) from public.tribe_members x where x.tribe_id = tr.id),
          'invited_by_name', p.username, 'expires_at', i.expires_at
        ) order by i.created_at desc)
        from public.tribe_invites i
        join public.tribes tr on tr.id = i.tribe_id
        join public.profiles p on p.id = i.invited_by
        where i.invited_user = v_user and i.status = 'pending' and i.expires_at > now()
      ), '[]'::jsonb),
      'my_requests', coalesce((
        select jsonb_agg(jsonb_build_object(
          'id', r.id, 'tribe_name', tr.name, 'emblem', tr.emblem, 'color', tr.color, 'expires_at', r.expires_at
        ) order by r.created_at desc)
        from public.tribe_join_requests r
        join public.tribes tr on tr.id = r.tribe_id
        where r.user_id = v_user and r.status = 'pending' and r.expires_at > now()
      ), '[]'::jsonb)
    );
  end if;

  select * into t from public.tribes where id = m.tribe_id;
  return jsonb_build_object(
    'tribe', jsonb_build_object(
      'id', t.id, 'name', t.name, 'motto', t.motto, 'emblem', t.emblem, 'color', t.color,
      'code', t.code, 'accepting_requests', t.accepting_requests,
      'my_role', m.role, 'muted_until', m.muted_until, 'max', 30,
      'notif_muted_until', m.notif_muted_until, 'notif_replies', m.notif_replies, 'archived', m.chat_archived,
      'member_count', (select count(*) from public.tribe_members x where x.tribe_id = t.id),
      'unread', (
        select count(*) from (
          select 1 from public.tribe_messages x
          where x.tribe_id = t.id and x.kind = 'user' and x.user_id is distinct from v_user and x.created_at > m.last_read_at
          limit 99
        ) q
      ),
      'pending_requests', case when m.role in ('chef', 'sous_chef') then
        (select count(*) from public.tribe_join_requests r where r.tribe_id = t.id and r.status = 'pending' and r.expires_at > now())
        else 0 end
    ) || public.tribe_level_info(t.xp) || jsonb_build_object('xp', t.xp),
    'invites', '[]'::jsonb,
    'my_requests', '[]'::jsonb
  );
end;
$$;

revoke execute on function public.set_tribe_chat_prefs(text, boolean, boolean) from public, anon;
grant execute on function public.set_tribe_chat_prefs(text, boolean, boolean) to authenticated;
revoke execute on function public.pick_tribe_chat_push(uuid) from public, anon, authenticated;
grant execute on function public.pick_tribe_chat_push(uuid) to service_role;
revoke execute on function public.get_my_tribe_summary() from public, anon;
grant execute on function public.get_my_tribe_summary() to authenticated;
