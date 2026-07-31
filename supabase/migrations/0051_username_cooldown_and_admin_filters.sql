-- ============================================================================
-- Deux ajouts indépendants :
--
-- 1. Cooldown de 7 jours sur le changement de pseudo (update_my_profile) :
--    empêche un joueur de changer de pseudo en boucle (usurpation,
--    contournement d'une suspension par pseudo, spam de recherche d'amis).
--    L'icône d'avatar reste libre de changer à tout moment, seul le pseudo
--    est concerné.
--
-- 2. Filtres "suspendus uniquement" / "admins uniquement" sur
--    admin_list_users, pour que les cartes du dashboard admin (onglet Vue
--    d'ensemble) puissent renvoyer vers une liste déjà filtrée plutôt que
--    la liste complète.
-- ============================================================================
set search_path = public;

-- ----------------------------------------------------------------------------
-- 1. Cooldown de changement de pseudo
-- ----------------------------------------------------------------------------
alter table public.profiles
  add column if not exists username_changed_at timestamptz;

create or replace function public.update_my_profile(p_username text, p_avatar_icon text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_username text;
  v_current_username text;
  v_last_change timestamptz;
  v_next_allowed timestamptz;
begin
  if v_user is null then
    raise exception 'Authentification requise';
  end if;

  v_username := trim(p_username);
  if length(v_username) < 2 or length(v_username) > 24 then
    raise exception 'Le pseudo doit contenir entre 2 et 24 caractères.';
  end if;

  if p_avatar_icon is null or p_avatar_icon not in ('🐺','🌕','🦇','🕯️','⚰️','🔪','🩸','👁️','🌲','🏚️') then
    raise exception 'Icône invalide.';
  end if;

  select username, username_changed_at into v_current_username, v_last_change
  from public.profiles where id = v_user;

  -- Le cooldown ne s'applique que si le pseudo change réellement (comparaison
  -- insensible à la casse : "Loup" -> "loup" compte comme un changement,
  -- mais renvoyer le même pseudo tel quel dans le formulaire ne doit jamais
  -- déclencher ou consommer le cooldown).
  if v_username is distinct from v_current_username and lower(v_username) <> lower(coalesce(v_current_username, '')) and v_last_change is not null then
    v_next_allowed := v_last_change + interval '7 days';
    if now() < v_next_allowed then
      raise exception 'Vous avez déjà changé de pseudo récemment. Vous pourrez le modifier à nouveau le % à %.',
        to_char(v_next_allowed, 'DD/MM/YYYY'), to_char(v_next_allowed, 'HH24:MI');
    end if;
  end if;

  update public.profiles
  set
    username = v_username,
    avatar_icon = p_avatar_icon,
    username_changed_at = case
      when lower(v_username) <> lower(coalesce(v_current_username, '')) then now()
      else username_changed_at
    end
  where id = v_user;

  update public.game_players gp
  set display_name = v_username, avatar_icon = p_avatar_icon
  from public.games g
  where gp.game_id = g.id and gp.user_id = v_user and g.status = 'lobby';

  return jsonb_build_object('username', v_username, 'avatar_icon', p_avatar_icon);
end;
$$;

grant execute on function public.update_my_profile(text, text) to authenticated;

-- ----------------------------------------------------------------------------
-- 2. Filtres suspendus / admins pour admin_list_users
-- ----------------------------------------------------------------------------
create or replace function public.admin_list_users(
  p_username text default null,
  p_email text default null,
  p_created_from date default null,
  p_created_to date default null,
  p_limit int default 10,
  p_offset int default 0,
  p_banned_only boolean default false,
  p_admin_only boolean default false
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
begin
  if not public.is_admin_user(v_user) then
    raise exception 'Accès refusé.';
  end if;

  select count(*) into v_total
  from public.profiles p
  join auth.users au on au.id = p.id
  where (p_username is null or p.username ilike '%' || p_username || '%')
    and (p_email is null or au.email ilike '%' || p_email || '%')
    and (p_created_from is null or p.created_at >= p_created_from::timestamptz)
    and (p_created_to is null or p.created_at < (p_created_to + 1)::timestamptz)
    and (not p_banned_only or p.is_banned)
    and (not p_admin_only or p.is_admin);

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
      (select count(*) from public.game_players gp where gp.user_id = p.id) as games_count
    from public.profiles p
    join auth.users au on au.id = p.id
    where (p_username is null or p.username ilike '%' || p_username || '%')
      and (p_email is null or au.email ilike '%' || p_email || '%')
      and (p_created_from is null or p.created_at >= p_created_from::timestamptz)
      and (p_created_to is null or p.created_at < (p_created_to + 1)::timestamptz)
      and (not p_banned_only or p.is_banned)
      and (not p_admin_only or p.is_admin)
    order by p.created_at desc
    limit greatest(p_limit, 0) offset greatest(p_offset, 0)
  ) u;

  return jsonb_build_object('users', v_users, 'total', v_total);
end;
$$;

grant execute on function public.admin_list_users(text, text, date, date, int, int, boolean, boolean) to authenticated;

-- L'ancienne signature à 6 arguments (0050) devient une surcharge morte :
-- on la retire explicitement, même principe qu'en 0050 pour 0048.
drop function if exists public.admin_list_users(text, text, date, date, int, int);
