-- Village de la tribu : le niveau d'une case suit le rang de son propriétaire
-- (chaume, bois, pierre, ornée…). Pour dessiner tout le village d'un coup, la liste
-- des membres renvoie maintenant aussi les points de rang (information déjà
-- publique : profil, classement). Aucun autre changement : même fonction, même
-- signature, mêmes droits. À appliquer APRÈS 0223. Rejouable sans risque.
set search_path = public;

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
        'role', x.role, 'joined_at', x.joined_at, 'muted', coalesce(x.muted_until > now(), false),
        'rank_points', p.rank_points
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

revoke execute on function public.get_tribe_detail() from public, anon;
grant execute on function public.get_tribe_detail() to authenticated;
