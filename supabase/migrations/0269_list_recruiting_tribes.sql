-- 0269 : « Tribus qui recrutent » — la page Tribu d'un joueur sans tribu propose quelques tribus à rejoindre sans avoir à
-- connaître leur nom. Lecture seule, même forme de réponse que search_tribes (0223), pour réutiliser le même affichage.
--   * seulement les tribus qui acceptent les demandes et ne sont pas pleines (30) ;
--   * les plus actives d'abord : membres vus dans les 7 derniers jours (user_presence, 0252), puis le nombre de membres ; 5 au plus.
-- Rejouable (create or replace), grants explicites.

create or replace function public.list_recruiting_tribes()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
begin
  if v_user is null then
    raise exception 'Authentification requise';
  end if;

  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', x.id, 'name', x.name, 'motto', x.motto, 'emblem', x.emblem, 'color', x.color,
      'member_count', x.member_count, 'full', false,
      'accepting', true,
      'requested', exists (select 1 from public.tribe_join_requests r where r.tribe_id = x.id and r.user_id = v_user and r.status = 'pending' and r.expires_at > now()),
      'request_id', (select r.id from public.tribe_join_requests r where r.tribe_id = x.id and r.user_id = v_user and r.status = 'pending' and r.expires_at > now() limit 1)
    ) order by x.active_count desc, x.member_count desc, x.name)
    from (
      select t.*, c.member_count, c.active_count
      from public.tribes t
      cross join lateral (
        select count(*)::int as member_count,
               count(*) filter (where exists (
                 select 1 from public.user_presence up where up.user_id = m.user_id and up.last_seen_at > now() - interval '7 days'
               ))::int as active_count
        from public.tribe_members m where m.tribe_id = t.id
      ) c
      where t.accepting_requests and c.member_count < 30
      order by c.active_count desc, c.member_count desc, t.name
      limit 5
    ) x
  ), '[]'::jsonb);
end;
$$;

revoke execute on function public.list_recruiting_tribes() from public, anon;
grant execute on function public.list_recruiting_tribes() to authenticated;
