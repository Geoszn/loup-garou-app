-- Chat de tribu, lot 2 : mentions @pseudo, notification de réaction, heures calmes.
--
--  * tribe_messages.mentions : les membres cités avec @pseudo (calculé par send_tribe_message) ;
--    une mention prévient comme une réponse (même en silence si le joueur l'a choisi) et rouvre
--    une discussion archivée ;
--  * pick_tribe_reaction_push : prévient l'auteur d'un message quand quelqu'un y réagit
--    (jamais en silence/archivé, jamais s'il lit déjà, au plus un toutes les 5 minutes) ;
--  * heures calmes : notification_prefs gagne chat_quiet_enabled/start/end (par défaut 22 h – 8 h,
--    heure locale) ; aucun push de chat pendant cette plage, puis un RÉSUMÉ du matin
--    (pick_tribe_chat_digest, appelé par la tâche horaire api/cron-engagement-notifications.ts) ;
--  * get_my_tribe_summary renvoie les heures calmes.
-- Rejouable sans risque. À appliquer APRÈS 0233.
set search_path = public;

alter table public.tribe_messages add column if not exists mentions uuid[] not null default '{}';
alter table public.tribe_message_reactions add column if not exists pushed_at timestamptz;
alter table public.tribe_members
  add column if not exists reaction_last_push_at timestamptz,
  add column if not exists chat_digest_at timestamptz;
alter table public.notification_prefs
  add column if not exists chat_quiet_enabled boolean not null default true,
  add column if not exists chat_quiet_start smallint not null default 22 check (chat_quiet_start between 0 and 23),
  add column if not exists chat_quiet_end smallint not null default 8 check (chat_quiet_end between 0 and 23);

create or replace function public._regex_escape(p_text text)
returns text
language sql
immutable
as $$
  select regexp_replace(coalesce(p_text, ''), '([.^$*+?()\[\]{}|\\-])', '\\\1', 'g')
$$;

-- Heure locale du joueur dans la plage calme ? (tz = décalage en minutes par rapport à UTC)
create or replace function public._in_quiet_hours(p_enabled boolean, p_start int, p_end int, p_tz int)
returns boolean
language sql
stable
as $$
  select coalesce(p_enabled, true) and (
    with h as (select extract(hour from (now() + make_interval(mins => coalesce(p_tz, 0))) at time zone 'utc')::int as hr),
         b as (select coalesce(p_start, 22) as s, coalesce(p_end, 8) as e)
    select case
      when b.s > b.e then (h.hr >= b.s or h.hr < b.e)
      when b.s < b.e then (h.hr >= b.s and h.hr < b.e)
      else false
    end
    from h, b
  )
$$;

create or replace function public.set_chat_quiet_hours(p_enabled boolean, p_start int, p_end int, p_tz int)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
begin
  if v_user is null then
    raise exception 'Authentification requise';
  end if;
  if p_start not between 0 and 23 or p_end not between 0 and 23 then
    raise exception 'Heures invalides.';
  end if;
  insert into public.notification_prefs (user_id, tz_offset_min, chat_quiet_enabled, chat_quiet_start, chat_quiet_end)
  values (v_user, greatest(least(coalesce(p_tz, 0), 840), -840), coalesce(p_enabled, true), p_start, p_end)
  on conflict (user_id) do update
    set tz_offset_min = excluded.tz_offset_min,
        chat_quiet_enabled = excluded.chat_quiet_enabled,
        chat_quiet_start = excluded.chat_quiet_start,
        chat_quiet_end = excluded.chat_quiet_end,
        updated_at = now();
end;
$$;

-- Envoi d'un message : détecte les mentions.
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
    insert into public.tribe_messages (tribe_id, user_id, kind, body, mentions, reply_to, reply_name, reply_snippet)
    values (m.tribe_id, v_user, 'user', v_body, v_mentions, v_reply.id, v_reply_name, case when v_reply.sticker is not null then '🎭 Sticker' else left(regexp_replace(coalesce(v_reply.body, ''), '\s+', ' ', 'g'), 100) end);
  else
    insert into public.tribe_messages (tribe_id, user_id, kind, body, mentions) values (m.tribe_id, v_user, 'user', v_body, v_mentions);
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

-- Lecture des messages : renvoie les mentions.
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
      'id', x.id, 'kind', x.kind, 'body', x.body, 'sticker', x.sticker, 'mentions', to_jsonb(x.mentions), 'event', x.event,
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

-- Résumé de la tribu (0233) + les heures calmes.
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
      'quiet_enabled', coalesce((select np.chat_quiet_enabled from public.notification_prefs np where np.user_id = v_user), true),
      'quiet_start', coalesce((select np.chat_quiet_start from public.notification_prefs np where np.user_id = v_user), 22),
      'quiet_end', coalesce((select np.chat_quiet_end from public.notification_prefs np where np.user_id = v_user), 8),
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

-- Qui prévenir pour le dernier message de l'expéditeur : mentions et réponses d'abord (elles passent
-- le silence si le joueur l'a choisi et rouvrent une discussion archivée), les heures calmes
-- coupent tout. Réservée au serveur (api/notify-user.ts).
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
           (tm.user_id = any(msg.mentions)) as is_mention,
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
        tm.user_id = v_reply_author or tm.user_id = any(msg.mentions)
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
    'preview', left(regexp_replace(coalesce(msg.body, ''), '\s+', ' ', 'g'), 100),
    'recipients', v_recipients
  );
end;
$$;

-- Quelqu'un vient de réagir à un message : prévenir son auteur (réservée au serveur).
create or replace function public.pick_tribe_reaction_push(p_reactor uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  rx public.tribe_message_reactions%rowtype;
  msg public.tribe_messages%rowtype;
  v_name text;
  v_tribe_name text;
  v_target record;
begin
  select * into rx from public.tribe_message_reactions
  where user_id = p_reactor and pushed_at is null and created_at > now() - interval '60 seconds'
  order by created_at desc limit 1
  for update;
  if not found then
    return null;
  end if;
  update public.tribe_message_reactions set pushed_at = now() where id = rx.id;

  select * into msg from public.tribe_messages where id = rx.message_id;
  if msg.id is null or msg.kind <> 'user' or msg.user_id is null or msg.user_id = p_reactor then
    return null;
  end if;

  select tm.user_id, p.lang into v_target
  from public.tribe_members tm
  join public.profiles p on p.id = tm.user_id
  left join public.notification_prefs np on np.user_id = tm.user_id
  where tm.user_id = msg.user_id and tm.tribe_id = rx.tribe_id
    and not coalesce(p.is_bot, false)
    and not tm.chat_archived
    and coalesce(tm.notif_muted_until, '-infinity'::timestamptz) <= now()
    and tm.last_read_at < now() - interval '45 seconds'
    and not public._in_quiet_hours(np.chat_quiet_enabled, np.chat_quiet_start, np.chat_quiet_end, np.tz_offset_min)
    and (tm.reaction_last_push_at is null or tm.reaction_last_push_at < now() - interval '5 minutes');
  if not found then
    return null;
  end if;
  update public.tribe_members set reaction_last_push_at = now() where user_id = v_target.user_id;

  select username into v_name from public.profiles where id = p_reactor;
  select name into v_tribe_name from public.tribes where id = rx.tribe_id;
  return jsonb_build_object(
    'user_id', v_target.user_id, 'lang', v_target.lang, 'tribe_id', rx.tribe_id, 'tribe_name', v_tribe_name,
    'reactor_name', coalesce(v_name, '?'), 'emoji', rx.emoji, 'is_sticker', msg.sticker is not null,
    'preview', left(regexp_replace(coalesce(msg.body, ''), '\s+', ' ', 'g'), 80)
  );
end;
$$;

-- Résumé du matin : à l'heure où se terminent ses heures calmes, chaque membre qui a des messages
-- non lus (hors silence et archive) reçoit UN résumé par tribu. Appelée par la tâche horaire.
create or replace function public.pick_tribe_chat_digest()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_rows jsonb;
begin
  with c as (
    select tm.user_id, tm.tribe_id, p.lang, t.name as tribe_name,
           (
             select count(*) from public.tribe_messages x
             where x.tribe_id = tm.tribe_id and x.kind = 'user' and x.user_id is distinct from tm.user_id
               and x.created_at > greatest(tm.last_read_at, now() - interval '16 hours')
           )::int as total,
           (
             select count(*) from public.tribe_messages x
             where x.tribe_id = tm.tribe_id and x.kind = 'user' and x.user_id is distinct from tm.user_id
               and x.created_at > greatest(tm.last_read_at, now() - interval '16 hours')
               and tm.user_id = any(x.mentions)
           )::int as mentions
    from public.tribe_members tm
    join public.profiles p on p.id = tm.user_id
    join public.tribes t on t.id = tm.tribe_id
    left join public.notification_prefs np on np.user_id = tm.user_id
    where not tm.chat_archived
      and not coalesce(p.is_bot, false)
      and coalesce(tm.notif_muted_until, '-infinity'::timestamptz) <= now()
      and coalesce(np.chat_quiet_enabled, true)
      and extract(hour from (now() + make_interval(mins => coalesce(np.tz_offset_min, 0))) at time zone 'utc')::int = coalesce(np.chat_quiet_end, 8)
      and (tm.chat_digest_at is null or tm.chat_digest_at < now() - interval '12 hours')
  ), sel as (
    select * from c where total > 0
  ), upd as (
    update public.tribe_members tm set chat_digest_at = now() from sel where tm.user_id = sel.user_id returning tm.user_id
  )
  select coalesce(jsonb_agg(jsonb_build_object('user_id', sel.user_id, 'lang', sel.lang, 'tribe_id', sel.tribe_id, 'tribe_name', sel.tribe_name, 'total', sel.total, 'mentions', sel.mentions)), '[]'::jsonb)
  into v_rows
  from sel join upd on upd.user_id = sel.user_id;
  return v_rows;
end;
$$;


revoke execute on function public._regex_escape(text) from public, anon, authenticated;
revoke execute on function public._in_quiet_hours(boolean, int, int, int) from public, anon, authenticated;
revoke execute on function public.send_tribe_message(text, uuid) from public, anon;
grant execute on function public.send_tribe_message(text, uuid) to authenticated;
revoke execute on function public.get_tribe_messages(timestamptz, int) from public, anon;
grant execute on function public.get_tribe_messages(timestamptz, int) to authenticated;
revoke execute on function public.set_chat_quiet_hours(boolean, int, int, int) from public, anon;
grant execute on function public.set_chat_quiet_hours(boolean, int, int, int) to authenticated;
revoke execute on function public.get_my_tribe_summary() from public, anon;
grant execute on function public.get_my_tribe_summary() to authenticated;
revoke execute on function public.pick_tribe_chat_push(uuid) from public, anon, authenticated;
grant execute on function public.pick_tribe_chat_push(uuid) to service_role;
revoke execute on function public.pick_tribe_reaction_push(uuid) from public, anon, authenticated;
grant execute on function public.pick_tribe_reaction_push(uuid) to service_role;
revoke execute on function public.pick_tribe_chat_digest() from public, anon, authenticated;
grant execute on function public.pick_tribe_chat_digest() to service_role;
