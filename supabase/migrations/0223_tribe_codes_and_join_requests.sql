-- Tribus, suite : on peut maintenant CHERCHER une tribu (par nom ou par code) et
-- lui envoyer une DEMANDE d'adhésion, que le chef ou un sous-chef accepte ou
-- refuse. L'invitation reste possible comme avant.
--
--  * chaque tribu a un code de 6 caractères (sans 0/O/1/I/L) que ses membres voient
--    et peuvent partager ;
--  * le chef peut fermer les demandes (accepting_requests) : la tribu ne remonte
--    plus dans la recherche par nom, mais reste trouvable par son code exact ;
--  * un joueur : 5 demandes en attente au plus, 10 par jour, valables 7 jours ;
--  * dès qu'un joueur entre dans une tribu (par n'importe quel chemin), ses autres
--    invitations et demandes en attente sont annulées (déclencheur).
-- NB : les fonctions des demandes de tribu s'appellent cancel_tribe_join_request et
-- respond_tribe_join_request : cancel_join_request / respond_join_request existent
-- déjà pour les demandes d'entrée dans une PARTIE (migrations 0033/0101) et un
-- « create or replace » du même nom les aurait écrasées.
-- Rejouable sans risque.
set search_path = public;

-- ----------------------------------------------------------------------------
-- Code et réglage « demandes ouvertes »
-- ----------------------------------------------------------------------------
alter table public.tribes add column if not exists code text;
alter table public.tribes add column if not exists accepting_requests boolean not null default true;

create or replace function public.tribe_generate_code()
returns text
language plpgsql
volatile
set search_path = public
as $$
declare
  v_alphabet constant text := 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  v_code text;
  v_try int := 0;
begin
  loop
    v_code := '';
    for i in 1..6 loop
      v_code := v_code || substr(v_alphabet, 1 + floor(random() * length(v_alphabet))::int, 1);
    end loop;
    exit when not exists (select 1 from public.tribes where code = v_code);
    v_try := v_try + 1;
    if v_try > 50 then
      raise exception 'Impossible de générer un code de tribu.';
    end if;
  end loop;
  return v_code;
end;
$$;
revoke execute on function public.tribe_generate_code() from public, anon, authenticated;

-- Les tribus déjà créées reçoivent leur code.
update public.tribes set code = public.tribe_generate_code() where code is null;
alter table public.tribes alter column code set not null;
create unique index if not exists tribes_code_idx on public.tribes (code);

-- Les nouvelles tribus reçoivent leur code automatiquement (create_tribe n'a pas à changer).
create or replace function public.tribes_set_code()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.code is null then
    new.code := public.tribe_generate_code();
  end if;
  return new;
end;
$$;

drop trigger if exists tribes_set_code on public.tribes;
create trigger tribes_set_code
  before insert on public.tribes
  for each row execute function public.tribes_set_code();

-- La colonne est NOT NULL : le défaut se pose via le déclencheur, donc on
-- l'autorise à être posée par lui avant la vérification (BEFORE INSERT s'exécute
-- avant le contrôle NOT NULL).

-- ----------------------------------------------------------------------------
-- Demandes d'adhésion
-- ----------------------------------------------------------------------------
create table if not exists public.tribe_join_requests (
  id uuid primary key default gen_random_uuid(),
  tribe_id uuid not null references public.tribes (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  status text not null default 'pending' check (status in ('pending', 'accepted', 'declined', 'canceled')),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '7 days'
);
create unique index if not exists tribe_join_requests_one_pending_idx on public.tribe_join_requests (tribe_id, user_id) where status = 'pending';
create index if not exists tribe_join_requests_user_idx on public.tribe_join_requests (user_id, status);
create index if not exists tribe_join_requests_tribe_idx on public.tribe_join_requests (tribe_id, status);

alter table public.tribe_join_requests enable row level security;
revoke all on public.tribe_join_requests from anon, authenticated;

-- Quand un joueur entre dans une tribu : ses autres invitations et demandes
-- en attente n'ont plus lieu d'être.
create or replace function public.tribe_member_joined()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.tribe_invites set status = 'canceled' where invited_user = new.user_id and status = 'pending';
  update public.tribe_join_requests set status = 'canceled' where user_id = new.user_id and status = 'pending';
  return new;
end;
$$;

drop trigger if exists tribe_member_joined on public.tribe_members;
create trigger tribe_member_joined
  after insert on public.tribe_members
  for each row execute function public.tribe_member_joined();

-- ----------------------------------------------------------------------------
-- Recherche d'une tribu (par nom ou par code) et demande d'adhésion
-- ----------------------------------------------------------------------------
create or replace function public.search_tribes(p_query text)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_query text := trim(coalesce(p_query, ''));
  v_code text := upper(trim(coalesce(p_query, '')));
begin
  if v_user is null then
    raise exception 'Authentification requise';
  end if;
  if length(v_query) < 2 then
    return '[]'::jsonb;
  end if;

  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', x.id, 'name', x.name, 'motto', x.motto, 'emblem', x.emblem, 'color', x.color,
      'member_count', x.member_count, 'full', x.member_count >= 30,
      'accepting', x.accepting_requests,
      'requested', exists (select 1 from public.tribe_join_requests r where r.tribe_id = x.id and r.user_id = v_user and r.status = 'pending' and r.expires_at > now()),
      'request_id', (select r.id from public.tribe_join_requests r where r.tribe_id = x.id and r.user_id = v_user and r.status = 'pending' and r.expires_at > now() limit 1)
    ) order by (x.code = v_code) desc, x.member_count desc, x.name)
    from (
      select t.*, (select count(*) from public.tribe_members m where m.tribe_id = t.id)::int as member_count
      from public.tribes t
      where t.code = v_code
         or (t.accepting_requests and t.name ilike '%' || replace(replace(v_query, '%', ''), '_', '') || '%')
      limit 15
    ) x
  ), '[]'::jsonb);
end;
$$;

create or replace function public.request_join_tribe(p_tribe_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  t public.tribes%rowtype;
  v_id uuid;
begin
  if v_user is null then
    raise exception 'Authentification requise';
  end if;
  if exists (select 1 from public.tribe_members where user_id = v_user) then
    raise exception 'Tu fais déjà partie d''une tribu.';
  end if;
  select * into t from public.tribes where id = p_tribe_id;
  if not found then
    raise exception 'Cette tribu n''existe plus.';
  end if;
  if not t.accepting_requests then
    raise exception 'Cette tribu n''accepte pas de demandes pour le moment.';
  end if;
  if (select count(*) from public.tribe_members where tribe_id = t.id) >= 30 then
    raise exception 'Cette tribu est complète (30 membres).';
  end if;
  if (select count(*) from public.tribe_join_requests where user_id = v_user and status = 'pending' and expires_at > now()) >= 5 then
    raise exception 'Tu as déjà 5 demandes en attente. Annule-en une d''abord.';
  end if;
  if (select count(*) from public.tribe_join_requests where user_id = v_user and created_at > now() - interval '24 hours') >= 10 then
    raise exception 'Tu as atteint la limite de 10 demandes par jour.';
  end if;

  update public.tribe_join_requests set status = 'canceled'
  where tribe_id = t.id and user_id = v_user and status = 'pending' and expires_at <= now();

  begin
    insert into public.tribe_join_requests (tribe_id, user_id) values (t.id, v_user) returning id into v_id;
  exception when unique_violation then
    raise exception 'Tu as déjà fait une demande à cette tribu.';
  end;
  return jsonb_build_object('request_id', v_id);
end;
$$;

create or replace function public.cancel_tribe_join_request(p_request_id uuid)
returns void
language sql
security definer
set search_path = public
as $$
  update public.tribe_join_requests set status = 'canceled'
  where id = p_request_id and user_id = auth.uid() and status = 'pending';
$$;

create or replace function public.respond_tribe_join_request(p_request_id uuid, p_accept boolean)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  me public.tribe_members%rowtype;
  r public.tribe_join_requests%rowtype;
begin
  if v_user is null then
    raise exception 'Authentification requise';
  end if;
  select * into me from public.tribe_members where user_id = v_user;
  if not found or me.role not in ('chef', 'sous_chef') then
    raise exception 'Seuls le chef et les sous-chefs peuvent répondre aux demandes.';
  end if;
  select * into r from public.tribe_join_requests where id = p_request_id and tribe_id = me.tribe_id for update;
  if not found or r.status <> 'pending' then
    raise exception 'Cette demande n''est plus valable.';
  end if;

  if not p_accept then
    update public.tribe_join_requests set status = 'declined' where id = r.id;
    return;
  end if;

  if r.expires_at <= now() then
    update public.tribe_join_requests set status = 'canceled' where id = r.id;
    raise exception 'Cette demande a expiré.';
  end if;
  if exists (select 1 from public.tribe_members where user_id = r.user_id) then
    update public.tribe_join_requests set status = 'canceled' where id = r.id;
    raise exception 'Ce joueur a déjà rejoint une tribu.';
  end if;

  -- Verrou sur la tribu : plusieurs acceptations simultanées ne dépassent pas 30.
  perform 1 from public.tribes where id = me.tribe_id for update;
  if (select count(*) from public.tribe_members where tribe_id = me.tribe_id) >= 30 then
    raise exception 'La tribu est complète (30 membres).';
  end if;

  insert into public.tribe_members (user_id, tribe_id, role) values (r.user_id, me.tribe_id, 'membre');
  update public.tribe_join_requests set status = 'accepted' where id = r.id;
  perform public.tribe_system_message(me.tribe_id, 'joined', r.user_id, null);
end;
$$;

-- ----------------------------------------------------------------------------
-- Lectures mises à jour : le résumé porte maintenant le code, le réglage des
-- demandes, le nombre de demandes à traiter (chef / sous-chefs) et, sans tribu,
-- mes propres demandes en attente.
-- ----------------------------------------------------------------------------
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
    ),
    'invites', '[]'::jsonb,
    'my_requests', '[]'::jsonb
  );
end;
$$;

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
    'requests_in', case when m.role in ('chef', 'sous_chef') then coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', r.id, 'user_id', p.id, 'username', p.username, 'avatar_icon', p.avatar_icon, 'avatar_config', p.avatar_config,
        'created_at', r.created_at, 'expires_at', r.expires_at
      ) order by r.created_at)
      from public.tribe_join_requests r
      join public.profiles p on p.id = r.user_id
      where r.tribe_id = m.tribe_id and r.status = 'pending' and r.expires_at > now()
    ), '[]'::jsonb) else '[]'::jsonb end,
    'invites_today', (select count(*) from public.tribe_invites where invited_by = v_user and created_at > now() - interval '24 hours'),
    'invites_limit', 10
  );
end;
$$;

-- update_tribe gagne un 4e paramètre (demandes ouvertes ou fermées) : l'ancienne
-- signature est remplacée.
drop function if exists public.update_tribe(text, text, text);

create or replace function public.update_tribe(p_motto text, p_emblem text, p_color text, p_accepting boolean)
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
    update public.tribes
    set motto = v_motto, emblem = p_emblem, color = p_color, accepting_requests = coalesce(p_accepting, true)
    where id = me.tribe_id;
  exception when check_violation then
    raise exception 'Blason ou couleur invalide.';
  end;
end;
$$;

revoke execute on function public.search_tribes(text) from public, anon;
grant execute on function public.search_tribes(text) to authenticated;
revoke execute on function public.request_join_tribe(uuid) from public, anon;
grant execute on function public.request_join_tribe(uuid) to authenticated;
revoke execute on function public.cancel_tribe_join_request(uuid) from public, anon;
grant execute on function public.cancel_tribe_join_request(uuid) to authenticated;
revoke execute on function public.respond_tribe_join_request(uuid, boolean) from public, anon;
grant execute on function public.respond_tribe_join_request(uuid, boolean) to authenticated;
revoke execute on function public.update_tribe(text, text, text, boolean) from public, anon;
grant execute on function public.update_tribe(text, text, text, boolean) to authenticated;
