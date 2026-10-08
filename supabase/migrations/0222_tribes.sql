-- Les TRIBUS (version 1) : des groupes de joueurs de 30 membres au plus, avec un
-- chat privé. On y entre UNIQUEMENT sur invitation du chef ou d'un sous-chef.
-- Un joueur n'est que dans UNE tribu. Le chef (le fondateur) peut passer son rôle
-- à un membre ; s'il part, la tribu passe au sous-chef (puis au membre) le plus
-- ancien, et disparaît quand le dernier membre s'en va.
--
-- Décisions (validées avec l'utilisateur) :
--  * 30 membres max ; 10 invitations par jour et par chef/sous-chef ; invitation
--    valable 7 jours ;
--  * chat : les 200 derniers messages de chaque tribu sont gardés, les plus
--    anciens sont effacés à chaque nouveau message ; 500 caractères max, limite
--    de fréquence (1 message par seconde, 20 par minute) ;
--  * modération : chef et sous-chef suppriment des messages, rendent muet
--    (24 h) ou excluent ; n'importe quel membre signale un message ; l'admin
--    voit les signalements.
--
-- Toute écriture passe par les fonctions ci-dessous (security definer) : les
-- tables n'ont AUCUN droit direct, sauf la lecture de tribe_messages pour les
-- membres (nécessaire au temps réel).
-- Rejouable sans risque.
set search_path = public;

-- ----------------------------------------------------------------------------
-- Tables
-- ----------------------------------------------------------------------------
create table if not exists public.tribes (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 3 and 24),
  motto text check (motto is null or char_length(motto) <= 80),
  emblem text not null check (emblem in ('wolf', 'lion', 'eagle', 'elephant', 'globe', 'fire', 'moon', 'star', 'sunrise', 'scorpion', 'snake', 'shield')),
  color text not null check (color in ('amber', 'sky', 'emerald', 'blood', 'violet', 'pink')),
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now()
);
create unique index if not exists tribes_name_lower_idx on public.tribes (lower(name));

create table if not exists public.tribe_members (
  user_id uuid primary key references public.profiles (id) on delete cascade, -- un seul tribu par joueur
  tribe_id uuid not null references public.tribes (id) on delete cascade,
  role text not null check (role in ('chef', 'sous_chef', 'membre')),
  joined_at timestamptz not null default now(),
  muted_until timestamptz,
  last_read_at timestamptz not null default now()
);
create index if not exists tribe_members_tribe_idx on public.tribe_members (tribe_id);
create unique index if not exists tribe_one_chef_idx on public.tribe_members (tribe_id) where role = 'chef';

create table if not exists public.tribe_invites (
  id uuid primary key default gen_random_uuid(),
  tribe_id uuid not null references public.tribes (id) on delete cascade,
  invited_user uuid not null references public.profiles (id) on delete cascade,
  invited_by uuid not null references public.profiles (id) on delete cascade,
  status text not null default 'pending' check (status in ('pending', 'accepted', 'declined', 'canceled')),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '7 days'
);
create unique index if not exists tribe_invites_one_pending_idx on public.tribe_invites (tribe_id, invited_user) where status = 'pending';
create index if not exists tribe_invites_user_idx on public.tribe_invites (invited_user, status);
create index if not exists tribe_invites_by_idx on public.tribe_invites (invited_by, created_at);

create table if not exists public.tribe_messages (
  id uuid primary key default gen_random_uuid(),
  tribe_id uuid not null references public.tribes (id) on delete cascade,
  user_id uuid references public.profiles (id) on delete set null,
  kind text not null default 'user' check (kind in ('user', 'system')),
  body text,
  event text check (event is null or event in ('created', 'joined', 'left', 'kicked', 'promoted', 'demoted', 'chief')),
  actor_name text,
  target_name text,
  created_at timestamptz not null default now()
);
create index if not exists tribe_messages_tribe_idx on public.tribe_messages (tribe_id, created_at desc, id desc);

create table if not exists public.tribe_reports (
  id uuid primary key default gen_random_uuid(),
  tribe_id uuid references public.tribes (id) on delete cascade,
  message_id uuid references public.tribe_messages (id) on delete set null,
  reporter_id uuid not null references public.profiles (id) on delete cascade,
  reported_user uuid references public.profiles (id) on delete set null,
  body_snapshot text not null,
  status text not null default 'open' check (status in ('open', 'resolved', 'dismissed')),
  created_at timestamptz not null default now(),
  unique (message_id, reporter_id)
);
create index if not exists tribe_reports_open_idx on public.tribe_reports (status, created_at desc);

alter table public.tribes enable row level security;
alter table public.tribe_members enable row level security;
alter table public.tribe_invites enable row level security;
alter table public.tribe_messages enable row level security;
alter table public.tribe_reports enable row level security;
revoke all on public.tribes, public.tribe_members, public.tribe_invites, public.tribe_messages, public.tribe_reports from anon, authenticated;

-- Lecture des messages réservée aux membres de la tribu (temps réel : Realtime
-- revérifie cette règle pour chaque abonné ; 30 membres au plus, index sur user_id).
grant select on public.tribe_messages to authenticated;
drop policy if exists tribe_messages_select on public.tribe_messages;
create policy tribe_messages_select on public.tribe_messages
  for select to authenticated
  using (exists (select 1 from public.tribe_members m where m.user_id = auth.uid() and m.tribe_id = tribe_messages.tribe_id));

do $$
begin
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'tribe_messages') then
    alter publication supabase_realtime add table public.tribe_messages;
  end if;
end;
$$;

-- ----------------------------------------------------------------------------
-- Outils internes (jamais appelés par le client)
-- ----------------------------------------------------------------------------
create or replace function public.tribe_system_message(p_tribe uuid, p_event text, p_actor uuid, p_target uuid)
returns void
language sql
security definer
set search_path = public
as $$
  insert into public.tribe_messages (tribe_id, kind, event, actor_name, target_name)
  values (
    p_tribe, 'system', p_event,
    (select username from public.profiles where id = p_actor),
    (select username from public.profiles where id = p_target)
  );
$$;
revoke execute on function public.tribe_system_message(uuid, text, uuid, uuid) from public, anon, authenticated;

-- ----------------------------------------------------------------------------
-- Création
-- ----------------------------------------------------------------------------
create or replace function public.create_tribe(p_name text, p_motto text, p_emblem text, p_color text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_name text := regexp_replace(trim(coalesce(p_name, '')), '\s+', ' ', 'g');
  v_motto text := nullif(trim(coalesce(p_motto, '')), '');
  v_id uuid;
begin
  if v_user is null then
    raise exception 'Authentification requise';
  end if;
  if char_length(v_name) not between 3 and 24 or v_name ~ '[<>[:cntrl:]]' then
    raise exception 'Le nom doit faire entre 3 et 24 caractères.';
  end if;
  if v_motto is not null and (char_length(v_motto) > 80 or v_motto ~ '[<>[:cntrl:]]') then
    raise exception 'La devise est trop longue (80 caractères maximum).';
  end if;
  if exists (select 1 from public.tribe_members where user_id = v_user) then
    raise exception 'Tu fais déjà partie d''une tribu.';
  end if;

  begin
    insert into public.tribes (name, motto, emblem, color, created_by)
    values (v_name, v_motto, p_emblem, p_color, v_user)
    returning id into v_id;
  exception
    when unique_violation then
      raise exception 'Ce nom de tribu est déjà pris.';
    when check_violation then
      raise exception 'Blason ou couleur invalide.';
  end;

  insert into public.tribe_members (user_id, tribe_id, role) values (v_user, v_id, 'chef');
  perform public.tribe_system_message(v_id, 'created', v_user, null);
  update public.tribe_invites set status = 'canceled' where invited_user = v_user and status = 'pending';

  return jsonb_build_object('tribe_id', v_id);
end;
$$;

-- ----------------------------------------------------------------------------
-- Lectures
-- ----------------------------------------------------------------------------
-- Résumé léger : accueil (carte « Ma tribu ») et onglet Tribu de la page Amis.
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
      ), '[]'::jsonb)
    );
  end if;

  select * into t from public.tribes where id = m.tribe_id;
  return jsonb_build_object(
    'tribe', jsonb_build_object(
      'id', t.id, 'name', t.name, 'motto', t.motto, 'emblem', t.emblem, 'color', t.color,
      'my_role', m.role, 'muted_until', m.muted_until, 'max', 30,
      'member_count', (select count(*) from public.tribe_members x where x.tribe_id = t.id),
      'unread', (
        select count(*) from (
          select 1 from public.tribe_messages x
          where x.tribe_id = t.id and x.kind = 'user' and x.user_id is distinct from v_user and x.created_at > m.last_read_at
          limit 99
        ) q
      )
    ),
    'invites', '[]'::jsonb
  );
end;
$$;

-- Détail : membres, invitations en attente (chef / sous-chef seulement).
create or replace function public.get_tribe_detail()
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
    return null;
  end if;

  return jsonb_build_object(
    'members', coalesce((
      select jsonb_agg(jsonb_build_object(
        'user_id', p.id, 'username', p.username, 'avatar_icon', p.avatar_icon, 'avatar_config', p.avatar_config,
        'role', x.role, 'joined_at', x.joined_at, 'muted', coalesce(x.muted_until > now(), false)
      ) order by case x.role when 'chef' then 0 when 'sous_chef' then 1 else 2 end, x.joined_at)
      from public.tribe_members x join public.profiles p on p.id = x.user_id
      where x.tribe_id = m.tribe_id
    ), '[]'::jsonb),
    'invites_out', case when m.role in ('chef', 'sous_chef') then coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', i.id, 'user_id', p.id, 'username', p.username, 'avatar_icon', p.avatar_icon, 'avatar_config', p.avatar_config,
        'invited_by_name', b.username, 'expires_at', i.expires_at
      ) order by i.created_at desc)
      from public.tribe_invites i
      join public.profiles p on p.id = i.invited_user
      join public.profiles b on b.id = i.invited_by
      where i.tribe_id = m.tribe_id and i.status = 'pending' and i.expires_at > now()
    ), '[]'::jsonb) else '[]'::jsonb end,
    'invites_today', (select count(*) from public.tribe_invites where invited_by = v_user and created_at > now() - interval '24 hours'),
    'invites_limit', 10
  );
end;
$$;

-- Candidats à l'invitation : sans texte, mes amis sans tribu ; avec 2 lettres ou
-- plus, une recherche par pseudo. Jamais les joueurs déjà en tribu, ni les bots.
create or replace function public.search_tribe_candidates(p_query text)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  m public.tribe_members%rowtype;
  v_query text := trim(coalesce(p_query, ''));
begin
  if v_user is null then
    raise exception 'Authentification requise';
  end if;
  select * into m from public.tribe_members where user_id = v_user;
  if not found or m.role not in ('chef', 'sous_chef') then
    raise exception 'Seuls le chef et les sous-chefs peuvent inviter.';
  end if;

  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'user_id', c.id, 'username', c.username, 'avatar_icon', c.avatar_icon, 'avatar_config', c.avatar_config,
      'is_friend', c.is_friend, 'invited', c.invited
    ) order by c.invited, c.username)
    from (
      select p.id, p.username, p.avatar_icon, p.avatar_config,
        exists (
          select 1 from public.friend_requests fr
          where fr.status = 'accepted' and ((fr.requester_id = v_user and fr.addressee_id = p.id) or (fr.addressee_id = v_user and fr.requester_id = p.id))
        ) as is_friend,
        exists (
          select 1 from public.tribe_invites i
          where i.tribe_id = m.tribe_id and i.invited_user = p.id and i.status = 'pending' and i.expires_at > now()
        ) as invited
      from public.profiles p
      where p.id <> v_user
        and not coalesce(p.is_bot, false)
        and not exists (select 1 from public.tribe_members x where x.user_id = p.id)
        and (
          (length(v_query) >= 2 and p.username ilike '%' || replace(replace(v_query, '%', ''), '_', '') || '%')
          or (length(v_query) < 2 and exists (
            select 1 from public.friend_requests fr
            where fr.status = 'accepted' and ((fr.requester_id = v_user and fr.addressee_id = p.id) or (fr.addressee_id = v_user and fr.requester_id = p.id))
          ))
        )
      order by p.username
      limit 15
    ) c
  ), '[]'::jsonb);
end;
$$;

-- ----------------------------------------------------------------------------
-- Invitations
-- ----------------------------------------------------------------------------
create or replace function public.invite_to_tribe(p_user_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  m public.tribe_members%rowtype;
  v_id uuid;
begin
  if v_user is null then
    raise exception 'Authentification requise';
  end if;
  select * into m from public.tribe_members where user_id = v_user;
  if not found or m.role not in ('chef', 'sous_chef') then
    raise exception 'Seuls le chef et les sous-chefs peuvent inviter.';
  end if;
  if p_user_id = v_user then
    raise exception 'Tu fais déjà partie de la tribu.';
  end if;
  if not exists (select 1 from public.profiles where id = p_user_id and not coalesce(is_bot, false)) then
    raise exception 'Joueur introuvable.';
  end if;
  if exists (select 1 from public.tribe_members where user_id = p_user_id) then
    raise exception 'Ce joueur fait déjà partie d''une tribu.';
  end if;
  if (select count(*) from public.tribe_members where tribe_id = m.tribe_id) >= 30 then
    raise exception 'La tribu est complète (30 membres).';
  end if;
  if (select count(*) from public.tribe_invites where invited_by = v_user and created_at > now() - interval '24 hours') >= 10 then
    raise exception 'Tu as atteint la limite de 10 invitations par jour.';
  end if;

  -- Une ancienne invitation expirée vers le même joueur est fermée avant d'en créer une nouvelle.
  update public.tribe_invites set status = 'canceled'
  where tribe_id = m.tribe_id and invited_user = p_user_id and status = 'pending' and expires_at <= now();

  begin
    insert into public.tribe_invites (tribe_id, invited_user, invited_by)
    values (m.tribe_id, p_user_id, v_user)
    returning id into v_id;
  exception when unique_violation then
    raise exception 'Ce joueur a déjà été invité.';
  end;

  return jsonb_build_object('invite_id', v_id);
end;
$$;

create or replace function public.cancel_tribe_invite(p_invite_id uuid)
returns void
language plpgsql
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
  if not found or m.role not in ('chef', 'sous_chef') then
    raise exception 'Action réservée au chef et aux sous-chefs.';
  end if;
  update public.tribe_invites set status = 'canceled'
  where id = p_invite_id and tribe_id = m.tribe_id and status = 'pending';
end;
$$;

create or replace function public.respond_tribe_invite(p_invite_id uuid, p_accept boolean)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  i public.tribe_invites%rowtype;
begin
  if v_user is null then
    raise exception 'Authentification requise';
  end if;
  select * into i from public.tribe_invites where id = p_invite_id and invited_user = v_user for update;
  if not found or i.status <> 'pending' then
    raise exception 'Cette invitation n''est plus valable.';
  end if;

  if not p_accept then
    update public.tribe_invites set status = 'declined' where id = i.id;
    return jsonb_build_object('joined', false);
  end if;

  if i.expires_at <= now() then
    update public.tribe_invites set status = 'canceled' where id = i.id;
    raise exception 'Cette invitation a expiré.';
  end if;
  if exists (select 1 from public.tribe_members where user_id = v_user) then
    raise exception 'Tu fais déjà partie d''une tribu.';
  end if;

  -- Verrou sur la tribu : deux acceptations simultanées ne dépassent pas 30.
  perform 1 from public.tribes where id = i.tribe_id for update;
  if not found then
    raise exception 'Cette tribu n''existe plus.';
  end if;
  if (select count(*) from public.tribe_members where tribe_id = i.tribe_id) >= 30 then
    raise exception 'La tribu est complète (30 membres).';
  end if;

  insert into public.tribe_members (user_id, tribe_id, role) values (v_user, i.tribe_id, 'membre');
  update public.tribe_invites set status = 'accepted' where id = i.id;
  update public.tribe_invites set status = 'canceled' where invited_user = v_user and status = 'pending';
  perform public.tribe_system_message(i.tribe_id, 'joined', v_user, null);
  return jsonb_build_object('joined', true, 'tribe_id', i.tribe_id);
end;
$$;

-- ----------------------------------------------------------------------------
-- Vie de la tribu : départ, exclusion, rôles
-- ----------------------------------------------------------------------------
create or replace function public.leave_tribe()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  m public.tribe_members%rowtype;
  v_next uuid;
begin
  if v_user is null then
    raise exception 'Authentification requise';
  end if;
  select * into m from public.tribe_members where user_id = v_user for update;
  if not found then
    return;
  end if;

  if m.role = 'chef' then
    select user_id into v_next from public.tribe_members
    where tribe_id = m.tribe_id and user_id <> v_user
    order by case role when 'sous_chef' then 0 else 1 end, joined_at
    limit 1;

    if v_next is null then
      -- Dernier membre : la tribu disparaît (messages, invitations, signalements avec).
      delete from public.tribes where id = m.tribe_id;
      return;
    end if;

    delete from public.tribe_members where user_id = v_user;
    update public.tribe_members set role = 'chef' where user_id = v_next;
    perform public.tribe_system_message(m.tribe_id, 'left', v_user, null);
    perform public.tribe_system_message(m.tribe_id, 'chief', null, v_next);
  else
    delete from public.tribe_members where user_id = v_user;
    perform public.tribe_system_message(m.tribe_id, 'left', v_user, null);
  end if;
end;
$$;

create or replace function public.kick_tribe_member(p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  me public.tribe_members%rowtype;
  tgt public.tribe_members%rowtype;
begin
  if v_user is null then
    raise exception 'Authentification requise';
  end if;
  select * into me from public.tribe_members where user_id = v_user;
  select * into tgt from public.tribe_members where user_id = p_user_id;
  if me.user_id is null or tgt.user_id is null or me.tribe_id <> tgt.tribe_id then
    raise exception 'Ce joueur ne fait pas partie de ta tribu.';
  end if;
  if p_user_id = v_user then
    raise exception 'Utilise « Quitter la tribu ».';
  end if;
  if not (me.role = 'chef' or (me.role = 'sous_chef' and tgt.role = 'membre')) then
    raise exception 'Tu n''as pas le droit d''exclure ce joueur.';
  end if;

  delete from public.tribe_members where user_id = p_user_id;
  perform public.tribe_system_message(me.tribe_id, 'kicked', v_user, p_user_id);
end;
$$;

create or replace function public.set_tribe_role(p_user_id uuid, p_role text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  me public.tribe_members%rowtype;
  tgt public.tribe_members%rowtype;
begin
  if v_user is null then
    raise exception 'Authentification requise';
  end if;
  if p_role not in ('sous_chef', 'membre') then
    raise exception 'Rôle invalide.';
  end if;
  select * into me from public.tribe_members where user_id = v_user;
  select * into tgt from public.tribe_members where user_id = p_user_id;
  if me.user_id is null or me.role <> 'chef' then
    raise exception 'Seul le chef peut changer les rôles.';
  end if;
  if tgt.user_id is null or tgt.tribe_id <> me.tribe_id or tgt.role = 'chef' then
    raise exception 'Ce joueur ne peut pas changer de rôle.';
  end if;
  if tgt.role = p_role then
    return;
  end if;

  update public.tribe_members set role = p_role where user_id = p_user_id;
  perform public.tribe_system_message(me.tribe_id, case when p_role = 'sous_chef' then 'promoted' else 'demoted' end, v_user, p_user_id);
end;
$$;

create or replace function public.transfer_tribe_chief(p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  me public.tribe_members%rowtype;
  tgt public.tribe_members%rowtype;
begin
  if v_user is null then
    raise exception 'Authentification requise';
  end if;
  select * into me from public.tribe_members where user_id = v_user for update;
  select * into tgt from public.tribe_members where user_id = p_user_id for update;
  if me.user_id is null or me.role <> 'chef' then
    raise exception 'Seul le chef peut passer son rôle.';
  end if;
  if tgt.user_id is null or tgt.tribe_id <> me.tribe_id or p_user_id = v_user then
    raise exception 'Ce joueur ne fait pas partie de ta tribu.';
  end if;

  -- L'index « un seul chef » impose de rétrograder l'ancien chef AVANT de promouvoir.
  update public.tribe_members set role = 'sous_chef' where user_id = v_user;
  update public.tribe_members set role = 'chef' where user_id = p_user_id;
  perform public.tribe_system_message(me.tribe_id, 'chief', v_user, p_user_id);
end;
$$;

create or replace function public.mute_tribe_member(p_user_id uuid, p_hours int)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  me public.tribe_members%rowtype;
  tgt public.tribe_members%rowtype;
begin
  if v_user is null then
    raise exception 'Authentification requise';
  end if;
  if p_hours not in (0, 24) then
    raise exception 'Durée invalide.';
  end if;
  select * into me from public.tribe_members where user_id = v_user;
  select * into tgt from public.tribe_members where user_id = p_user_id;
  if me.user_id is null or tgt.user_id is null or me.tribe_id <> tgt.tribe_id or p_user_id = v_user then
    raise exception 'Ce joueur ne fait pas partie de ta tribu.';
  end if;
  if not (me.role = 'chef' or (me.role = 'sous_chef' and tgt.role = 'membre')) then
    raise exception 'Tu n''as pas le droit de rendre ce joueur muet.';
  end if;

  update public.tribe_members
  set muted_until = case when p_hours = 0 then null else now() + make_interval(hours => p_hours) end
  where user_id = p_user_id;
end;
$$;

create or replace function public.update_tribe(p_motto text, p_emblem text, p_color text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  me public.tribe_members%rowtype;
  v_motto text := nullif(trim(coalesce(p_motto, '')), '');
begin
  if v_user is null then
    raise exception 'Authentification requise';
  end if;
  select * into me from public.tribe_members where user_id = v_user;
  if me.user_id is null or me.role <> 'chef' then
    raise exception 'Seul le chef peut modifier la tribu.';
  end if;
  if v_motto is not null and (char_length(v_motto) > 80 or v_motto ~ '[<>[:cntrl:]]') then
    raise exception 'La devise est trop longue (80 caractères maximum).';
  end if;
  begin
    update public.tribes set motto = v_motto, emblem = p_emblem, color = p_color where id = me.tribe_id;
  exception when check_violation then
    raise exception 'Blason ou couleur invalide.';
  end;
end;
$$;

create or replace function public.disband_tribe()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  me public.tribe_members%rowtype;
begin
  if v_user is null then
    raise exception 'Authentification requise';
  end if;
  select * into me from public.tribe_members where user_id = v_user;
  if me.user_id is null or me.role <> 'chef' then
    raise exception 'Seul le chef peut dissoudre la tribu.';
  end if;
  delete from public.tribes where id = me.tribe_id;
end;
$$;

-- ----------------------------------------------------------------------------
-- Chat
-- ----------------------------------------------------------------------------
create or replace function public.send_tribe_message(p_body text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  m public.tribe_members%rowtype;
  v_body text := trim(regexp_replace(coalesce(p_body, ''), '[\x00-\x08\x0b\x0c\x0e-\x1f]', '', 'g'));
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

  insert into public.tribe_messages (tribe_id, user_id, kind, body) values (m.tribe_id, v_user, 'user', v_body);

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
      'role', mm.role
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

create or replace function public.mark_tribe_read()
returns void
language sql
security definer
set search_path = public
as $$
  update public.tribe_members set last_read_at = now() where user_id = auth.uid();
$$;

create or replace function public.delete_tribe_message(p_message_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  me public.tribe_members%rowtype;
  msg public.tribe_messages%rowtype;
begin
  if v_user is null then
    raise exception 'Authentification requise';
  end if;
  select * into me from public.tribe_members where user_id = v_user;
  select * into msg from public.tribe_messages where id = p_message_id;
  if me.user_id is null or msg.id is null or msg.tribe_id <> me.tribe_id or msg.kind <> 'user' then
    raise exception 'Message introuvable.';
  end if;
  if not (me.role in ('chef', 'sous_chef') or msg.user_id = v_user) then
    raise exception 'Tu ne peux pas supprimer ce message.';
  end if;
  delete from public.tribe_messages where id = p_message_id;
end;
$$;

create or replace function public.report_tribe_message(p_message_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  me public.tribe_members%rowtype;
  msg public.tribe_messages%rowtype;
begin
  if v_user is null then
    raise exception 'Authentification requise';
  end if;
  select * into me from public.tribe_members where user_id = v_user;
  select * into msg from public.tribe_messages where id = p_message_id;
  if me.user_id is null or msg.id is null or msg.tribe_id <> me.tribe_id or msg.kind <> 'user' or msg.user_id = v_user then
    raise exception 'Message introuvable.';
  end if;
  if (select count(*) from public.tribe_reports where reporter_id = v_user and created_at > now() - interval '24 hours') >= 10 then
    raise exception 'Tu as atteint la limite de signalements pour aujourd''hui.';
  end if;
  insert into public.tribe_reports (tribe_id, message_id, reporter_id, reported_user, body_snapshot)
  values (me.tribe_id, msg.id, v_user, msg.user_id, left(coalesce(msg.body, ''), 500))
  on conflict (message_id, reporter_id) do nothing;
end;
$$;

-- ----------------------------------------------------------------------------
-- Administration : signalements et liste des tribus
-- ----------------------------------------------------------------------------
create or replace function public.admin_list_tribe_reports()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.is_admin_user(auth.uid()) then
    raise exception 'Accès refusé.';
  end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', r.id, 'tribe_id', r.tribe_id, 'tribe_name', t.name, 'body', r.body_snapshot,
      'reporter', rp.username, 'reported', ru.username, 'reported_id', r.reported_user,
      'message_exists', r.message_id is not null, 'created_at', r.created_at
    ) order by r.created_at desc)
    from public.tribe_reports r
    left join public.tribes t on t.id = r.tribe_id
    left join public.profiles rp on rp.id = r.reporter_id
    left join public.profiles ru on ru.id = r.reported_user
    where r.status = 'open'
  ), '[]'::jsonb);
end;
$$;

create or replace function public.admin_resolve_tribe_report(p_report_id uuid, p_action text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_admin uuid := auth.uid();
  r public.tribe_reports%rowtype;
begin
  if not public.is_admin_user(v_admin) then
    raise exception 'Accès refusé.';
  end if;
  if p_action not in ('delete_message', 'mute_24h', 'dismiss') then
    raise exception 'Action invalide.';
  end if;
  select * into r from public.tribe_reports where id = p_report_id;
  if not found then
    raise exception 'Signalement introuvable.';
  end if;

  if p_action = 'delete_message' and r.message_id is not null then
    delete from public.tribe_messages where id = r.message_id;
  elsif p_action = 'mute_24h' and r.reported_user is not null then
    update public.tribe_members set muted_until = now() + interval '24 hours' where user_id = r.reported_user;
  end if;

  update public.tribe_reports
  set status = case when p_action = 'dismiss' then 'dismissed' else 'resolved' end
  where id = r.id;

  insert into public.admin_audit_log (admin_id, action, target, details)
  values (v_admin, 'resolve_tribe_report', r.id::text, jsonb_build_object('action', p_action, 'tribe_id', r.tribe_id));
end;
$$;

create or replace function public.admin_list_tribes()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.is_admin_user(auth.uid()) then
    raise exception 'Accès refusé.';
  end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', t.id, 'name', t.name, 'emblem', t.emblem, 'created_at', t.created_at,
      'member_count', (select count(*) from public.tribe_members x where x.tribe_id = t.id),
      'chef', (select p.username from public.tribe_members x join public.profiles p on p.id = x.user_id where x.tribe_id = t.id and x.role = 'chef'),
      'open_reports', (select count(*) from public.tribe_reports r where r.tribe_id = t.id and r.status = 'open')
    ) order by t.created_at desc)
    from public.tribes t
  ), '[]'::jsonb);
end;
$$;

create or replace function public.admin_dissolve_tribe(p_tribe_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_admin uuid := auth.uid();
  v_name text;
begin
  if not public.is_admin_user(v_admin) then
    raise exception 'Accès refusé.';
  end if;
  select name into v_name from public.tribes where id = p_tribe_id;
  if not found then
    raise exception 'Tribu introuvable.';
  end if;
  delete from public.tribes where id = p_tribe_id;
  insert into public.admin_audit_log (admin_id, action, target, details)
  values (v_admin, 'dissolve_tribe', p_tribe_id::text, jsonb_build_object('name', v_name));
end;
$$;

-- ----------------------------------------------------------------------------
-- Droits : appelables par un joueur connecté, jamais par un anonyme.
-- ----------------------------------------------------------------------------
revoke execute on function public.create_tribe(text, text, text, text) from public, anon;
grant execute on function public.create_tribe(text, text, text, text) to authenticated;
revoke execute on function public.get_my_tribe_summary() from public, anon;
grant execute on function public.get_my_tribe_summary() to authenticated;
revoke execute on function public.get_tribe_detail() from public, anon;
grant execute on function public.get_tribe_detail() to authenticated;
revoke execute on function public.search_tribe_candidates(text) from public, anon;
grant execute on function public.search_tribe_candidates(text) to authenticated;
revoke execute on function public.invite_to_tribe(uuid) from public, anon;
grant execute on function public.invite_to_tribe(uuid) to authenticated;
revoke execute on function public.cancel_tribe_invite(uuid) from public, anon;
grant execute on function public.cancel_tribe_invite(uuid) to authenticated;
revoke execute on function public.respond_tribe_invite(uuid, boolean) from public, anon;
grant execute on function public.respond_tribe_invite(uuid, boolean) to authenticated;
revoke execute on function public.leave_tribe() from public, anon;
grant execute on function public.leave_tribe() to authenticated;
revoke execute on function public.kick_tribe_member(uuid) from public, anon;
grant execute on function public.kick_tribe_member(uuid) to authenticated;
revoke execute on function public.set_tribe_role(uuid, text) from public, anon;
grant execute on function public.set_tribe_role(uuid, text) to authenticated;
revoke execute on function public.transfer_tribe_chief(uuid) from public, anon;
grant execute on function public.transfer_tribe_chief(uuid) to authenticated;
revoke execute on function public.mute_tribe_member(uuid, int) from public, anon;
grant execute on function public.mute_tribe_member(uuid, int) to authenticated;
revoke execute on function public.update_tribe(text, text, text) from public, anon;
grant execute on function public.update_tribe(text, text, text) to authenticated;
revoke execute on function public.disband_tribe() from public, anon;
grant execute on function public.disband_tribe() to authenticated;
revoke execute on function public.send_tribe_message(text) from public, anon;
grant execute on function public.send_tribe_message(text) to authenticated;
revoke execute on function public.get_tribe_messages(timestamptz, int) from public, anon;
grant execute on function public.get_tribe_messages(timestamptz, int) to authenticated;
revoke execute on function public.mark_tribe_read() from public, anon;
grant execute on function public.mark_tribe_read() to authenticated;
revoke execute on function public.delete_tribe_message(uuid) from public, anon;
grant execute on function public.delete_tribe_message(uuid) to authenticated;
revoke execute on function public.report_tribe_message(uuid) from public, anon;
grant execute on function public.report_tribe_message(uuid) to authenticated;
revoke execute on function public.admin_list_tribe_reports() from public, anon;
grant execute on function public.admin_list_tribe_reports() to authenticated;
revoke execute on function public.admin_resolve_tribe_report(uuid, text) from public, anon;
grant execute on function public.admin_resolve_tribe_report(uuid, text) to authenticated;
revoke execute on function public.admin_list_tribes() from public, anon;
grant execute on function public.admin_list_tribes() to authenticated;
revoke execute on function public.admin_dissolve_tribe(uuid) from public, anon;
grant execute on function public.admin_dissolve_tribe(uuid) to authenticated;
