-- Niveau de tribu : la tribu gagne de l'expérience (XP) quand ses membres jouent.
--
--  * une partie TERMINÉE avec au moins 6 joueurs humains rapporte à chaque tribu
--    qui y a des joueurs : 10 XP, + 10 par membre supplémentaire dans la même
--    partie (jusqu'à +40) — on récompense le fait de jouer ENSEMBLE ;
--  * au plus 200 XP par tribu et par 24 h ; une partie ne compte qu'une fois par tribu ;
--  * les messages, les arrivées et les départs ne rapportent rien (rien à « farmer ») ;
--  * 10 niveaux : 0, 100, 250, 450, 700, 1000, 1400, 1900, 2500, 3200 XP.
-- Le calcul tourne dans un déclencheur sur games.status = 'ended' ; il est protégé
-- par un bloc d'exception : une erreur ici ne doit JAMAIS empêcher une partie de
-- se terminer. Rejouable sans risque. À appliquer APRÈS 0223.
set search_path = public;

alter table public.tribes add column if not exists xp int not null default 0;

create table if not exists public.tribe_xp_events (
  id uuid primary key default gen_random_uuid(),
  tribe_id uuid not null references public.tribes (id) on delete cascade,
  game_id uuid not null references public.games (id) on delete cascade,
  xp int not null,
  members_played int not null,
  created_at timestamptz not null default now(),
  unique (game_id, tribe_id)
);
create index if not exists tribe_xp_events_tribe_idx on public.tribe_xp_events (tribe_id, created_at desc);
alter table public.tribe_xp_events enable row level security; -- aucune politique : réservé au serveur

create or replace function public.tribe_level_info(p_xp int)
returns jsonb
language sql
immutable
as $$
  with t(lvl, floor_xp) as (
    values (1, 0), (2, 100), (3, 250), (4, 450), (5, 700), (6, 1000), (7, 1400), (8, 1900), (9, 2500), (10, 3200)
  )
  select jsonb_build_object(
    'level', (select max(lvl) from t where floor_xp <= greatest(coalesce(p_xp, 0), 0)),
    'xp_floor', (select max(floor_xp) from t where floor_xp <= greatest(coalesce(p_xp, 0), 0)),
    'xp_next', (select min(floor_xp) from t where floor_xp > greatest(coalesce(p_xp, 0), 0))
  )
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
      v_award := greatest(0, least(10 + 10 * least(r.n - 1, 4), 200 - v_today));
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

revoke execute on function public.tribe_xp_on_game_end() from public, anon, authenticated;

drop trigger if exists tribe_xp_game_end on public.games;
create trigger tribe_xp_game_end
  after update of status on public.games
  for each row
  when (old.status is distinct from new.status and new.status = 'ended')
  execute function public.tribe_xp_on_game_end();

-- Le résumé de la tribu (déjà relu toutes les 45 s par l'appli) renvoie le niveau.
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
    ) || public.tribe_level_info(t.xp) || jsonb_build_object('xp', t.xp),
    'invites', '[]'::jsonb,
    'my_requests', '[]'::jsonb
  );
end;
$$;

revoke execute on function public.get_my_tribe_summary() from public, anon;
grant execute on function public.get_my_tribe_summary() to authenticated;
