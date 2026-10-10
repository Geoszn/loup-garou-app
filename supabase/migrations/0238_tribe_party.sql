-- Tribu — « Partie de tribu » en un clic.
--
--  * games.tribe_party_id : la partie a été lancée comme partie de tribu ;
--  * invite_tribe_to_game(game, party) : le 2e paramètre (faux par défaut) marque la partie ;
--  * bonus d'XP : +20 XP pour la tribu quand au moins 4 de ses membres jouent la partie (toujours dans la
--    limite de 200 XP par jour, et la partie doit déjà compter 6 joueurs humains) ;
--  * la carte du chat sait si c'est une partie de tribu (get_tribe_messages) et la push le dit (pick_tribe_chat_push).
-- Rejouable sans risque. À appliquer APRÈS 0236.

alter table public.games add column if not exists tribe_party_id uuid references public.tribes (id) on delete set null;

drop function if exists public.invite_tribe_to_game(uuid);

create or replace function public.invite_tribe_to_game(p_game_id uuid, p_party boolean default false)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  g public.games%rowtype;
  m public.tribe_members%rowtype;
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

  select * into g from public.games where id = p_game_id;
  if not found or g.host_id <> v_user then
    raise exception 'Seul l''hôte du salon peut inviter sa tribu.';
  end if;
  if g.status <> 'lobby' then
    raise exception 'Ce salon n''accepte plus de nouveaux joueurs.';
  end if;
  if coalesce(g.is_practice, false) then
    raise exception 'Une partie d''entraînement ne peut pas être partagée.';
  end if;

  if exists (select 1 from public.tribe_messages where tribe_id = m.tribe_id and kind = 'invite' and invite_game_id = g.id) then
    raise exception 'Ta tribu a déjà reçu l''invitation pour ce salon.';
  end if;
  if exists (select 1 from public.tribe_messages where tribe_id = m.tribe_id and user_id = v_user and kind = 'invite' and created_at > now() - interval '3 minutes') then
    raise exception 'Tu as déjà invité ta tribu à l''instant : patiente quelques minutes.';
  end if;

  -- Partie de tribu : +20 XP pour la tribu si au moins 4 de ses membres y jouent (voir tribe_xp_on_game_end).
  if p_party then
    update public.games set tribe_party_id = m.tribe_id where id = g.id;
  end if;

  insert into public.tribe_messages (tribe_id, user_id, kind, game_code, invite_game_id)
  values (m.tribe_id, v_user, 'invite', g.code, g.id);

  delete from public.tribe_messages
  where id in (
    select id from public.tribe_messages where tribe_id = m.tribe_id
    order by created_at desc, id desc offset 200
  );

  update public.tribe_members set last_read_at = now() where user_id = v_user;
end;
$$;

create or replace function public.tribe_xp_on_game_end()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  r record;
  v_today int;
  v_award int;
begin
  begin
    if (
      select count(*) from public.game_players gp
      join public.profiles p on p.id = gp.user_id
      where gp.game_id = new.id and not coalesce(p.is_bot, false)
    ) < 6 then
      return new;
    end if;

    for r in
      select tm.tribe_id, count(*)::int as n
      from public.game_players gp
      join public.profiles p on p.id = gp.user_id and not coalesce(p.is_bot, false)
      join public.tribe_members tm on tm.user_id = gp.user_id
      where gp.game_id = new.id
        and not coalesce(gp.is_banned, false)
        and coalesce(gp.death_cause, '') not in ('parti', 'exclu')
      group by tm.tribe_id
    loop
      if exists (select 1 from public.tribe_xp_events e where e.game_id = new.id and e.tribe_id = r.tribe_id) then
        continue;
      end if;
      select coalesce(sum(e.xp), 0) into v_today
      from public.tribe_xp_events e
      where e.tribe_id = r.tribe_id and e.created_at > now() - interval '24 hours';
      v_award := greatest(0, least(10 + 10 * least(r.n - 1, 4) + case when new.tribe_party_id = r.tribe_id and r.n >= 4 then 20 else 0 end, 200 - v_today));
      insert into public.tribe_xp_events (tribe_id, game_id, xp, members_played)
      values (r.tribe_id, new.id, v_award, r.n)
      on conflict (game_id, tribe_id) do nothing;
      if v_award > 0 then
        update public.tribes set xp = xp + v_award where id = r.tribe_id;
      end if;
    end loop;
  exception when others then
    raise warning 'tribe_xp_on_game_end: %', sqlerrm;
  end;
  return new;
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
      'id', x.id, 'kind', x.kind, 'body', x.body, 'sticker', x.sticker, 'mentions', to_jsonb(x.mentions), 'mention_all', x.mention_all, 'game_code', x.game_code,
      'game', case when x.kind = 'invite' then (
        select jsonb_build_object('status', g.status, 'players', (select count(*) from public.game_players gp where gp.game_id = g.id), 'party', g.tribe_party_id is not null)
        from public.games g where g.id = x.invite_game_id
      ) end, 'event', x.event,
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
  where user_id = p_sender and kind in ('user', 'invite') and pushed_at is null and created_at > now() - interval '60 seconds'
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
             where x.tribe_id = tm.tribe_id and x.kind in ('user', 'invite') and x.user_id is distinct from tm.user_id and x.created_at > tm.last_read_at
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
        tm.user_id = v_reply_author or tm.user_id = any(msg.mentions) or msg.mention_all or msg.kind = 'invite'
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
    'is_invite', msg.kind = 'invite',
    'is_party', coalesce((select g.tribe_party_id is not null from public.games g where g.id = msg.invite_game_id), false),
    'preview', left(regexp_replace(coalesce(msg.body, ''), '\s+', ' ', 'g'), 100),
    'recipients', v_recipients
  );
end;
$$;

revoke execute on function public.invite_tribe_to_game(uuid, boolean) from public, anon;
grant execute on function public.invite_tribe_to_game(uuid, boolean) to authenticated;
revoke execute on function public.tribe_xp_on_game_end() from public, anon, authenticated;
revoke execute on function public.get_tribe_messages(timestamptz, int) from public, anon;
grant execute on function public.get_tribe_messages(timestamptz, int) to authenticated;
revoke execute on function public.pick_tribe_chat_push(uuid) from public, anon, authenticated;
grant execute on function public.pick_tribe_chat_push(uuid) to service_role;
