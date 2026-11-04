-- 0268 : liste des joueurs de l'admin — statut de chaque compte (adresse e-mail confirmée ou non).
--   * statut : 'verified' (e-mail confirmé), 'pending' (inscrit par e-mail, pas encore confirmé), 'guest' (invité anonyme), 'bot' (compte technique).
--   * admin_list_users : nouveau filtre p_status, et chaque ligne renvoie `status` et `email_confirmed_at`.
--     Le résultat renvoie aussi `counts` (nombre de comptes par statut sur toute la base, indépendamment des autres filtres).
-- Rejouable : on retire l'ancienne signature à 8 arguments (0084) pour éviter une surcharge ambiguë.

drop function if exists public.admin_list_users(text, text, date, date, int, int, boolean, boolean);

create or replace function public.admin_list_users(
  p_username text default null,
  p_email text default null,
  p_created_from date default null,
  p_created_to date default null,
  p_limit int default 10,
  p_offset int default 0,
  p_banned_only boolean default false,
  p_admin_only boolean default false,
  p_status text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_total int;
  v_users jsonb;
  v_counts jsonb;
begin
  if not public.is_admin_user(v_user) then
    raise exception 'Acces refuse.';
  end if;

  select count(*) into v_total
  from public.profiles p
  join auth.users au on au.id = p.id
  where (p_username is null or p.username ilike '%' || p_username || '%')
    and (p_email is null or au.email ilike '%' || p_email || '%')
    and (p_created_from is null or p.created_at >= p_created_from::timestamptz)
    and (p_created_to is null or p.created_at < (p_created_to + 1)::timestamptz)
    and (not p_banned_only or p.is_banned)
    and (not p_admin_only or p.is_admin)
    and (p_status is null or p_status = (
      case when p.is_bot then 'bot'
           when p.is_guest or au.is_anonymous then 'guest'
           when au.email_confirmed_at is not null then 'verified'
           else 'pending' end));

  select coalesce(jsonb_agg(row_to_json(u)), '[]'::jsonb) into v_users
  from (
    select
      p.id,
      p.username,
      au.email,
      p.created_at,
      p.is_admin,
      p.is_banned,
      p.banned_reason,
      p.lang,
      au.email_confirmed_at,
      (case when p.is_bot then 'bot'
            when p.is_guest or au.is_anonymous then 'guest'
            when au.email_confirmed_at is not null then 'verified'
            else 'pending' end) as status,
      (select count(*) from public.game_results gr where gr.user_id = p.id) as games_count
    from public.profiles p
    join auth.users au on au.id = p.id
    where (p_username is null or p.username ilike '%' || p_username || '%')
      and (p_email is null or au.email ilike '%' || p_email || '%')
      and (p_created_from is null or p.created_at >= p_created_from::timestamptz)
      and (p_created_to is null or p.created_at < (p_created_to + 1)::timestamptz)
      and (not p_banned_only or p.is_banned)
      and (not p_admin_only or p.is_admin)
      and (p_status is null or p_status = (
        case when p.is_bot then 'bot'
             when p.is_guest or au.is_anonymous then 'guest'
             when au.email_confirmed_at is not null then 'verified'
             else 'pending' end))
    order by p.created_at desc
    limit greatest(p_limit, 0) offset greatest(p_offset, 0)
  ) u;

  select jsonb_object_agg(s, n) into v_counts
  from (
    select
      case when p.is_bot then 'bot'
           when p.is_guest or au.is_anonymous then 'guest'
           when au.email_confirmed_at is not null then 'verified'
           else 'pending' end as s,
      count(*) as n
    from public.profiles p
    join auth.users au on au.id = p.id
    group by 1
  ) c;

  return jsonb_build_object('users', v_users, 'total', v_total, 'counts', coalesce(v_counts, '{}'::jsonb));
end;
$$;

revoke execute on function public.admin_list_users(text, text, date, date, int, int, boolean, boolean, text) from public, anon;
grant execute on function public.admin_list_users(text, text, date, date, int, int, boolean, boolean, text) to authenticated;
