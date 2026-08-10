-- ============================================================================
-- Demande : au lieu de dépendre uniquement de l'email (Resend, best-effort,
-- pas encore configuré côté Vercel — voir api/feedback.ts) pour recevoir les
-- retours des joueurs, pouvoir les consulter directement dans le dashboard
-- admin. Les messages sont déjà enregistrés en base par submit_feedback
-- (migration 0056) quoi qu'il arrive côté email — il ne manquait qu'un
-- moyen de les LIRE depuis l'admin. Ce correctif ajoute :
--
-- 1) feedback_messages.read_at — pour distinguer les messages déjà vus (au
--    même principe que la plupart des boîtes de réception).
-- 2) admin_list_feedback : liste paginée, la plus récente en premier, avec
--    le pseudo/email de l'auteur (même style que admin_list_users,
--    0051_username_cooldown_and_admin_filters.sql).
-- 3) admin_mark_feedback_read : marque un message comme lu.
-- 4) admin_get_stats (reprise intégrale de 0048_admin_rpcs.sql) : ajoute
--    'unread_feedback' pour une carte cliquable dans l'onglet Vue
--    d'ensemble, sur le même principe que pending_join_requests.
--
-- Côté client : nouvel onglet "Messages" dans AdminDashboard.tsx.
-- ============================================================================
set search_path = public;

alter table public.feedback_messages add column if not exists read_at timestamptz;

-- ----------------------------------------------------------------------------
-- admin_list_feedback : pagination + total + nombre de non-lus, même schéma
-- de retour que admin_list_users (jsonb_build_object avec un tableau et des
-- compteurs à côté).
-- ----------------------------------------------------------------------------
create or replace function public.admin_list_feedback(p_limit int default 20, p_offset int default 0)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_total int;
  v_unread int;
  v_messages jsonb;
begin
  if not public.is_admin_user(v_user) then
    raise exception 'Accès refusé.';
  end if;

  select count(*) into v_total from public.feedback_messages;
  select count(*) into v_unread from public.feedback_messages where read_at is null;

  select coalesce(jsonb_agg(row_to_json(m)), '[]'::jsonb) into v_messages
  from (
    select
      fm.id,
      fm.user_id,
      p.username,
      au.email,
      fm.message,
      fm.created_at,
      fm.read_at
    from public.feedback_messages fm
    join public.profiles p on p.id = fm.user_id
    join auth.users au on au.id = fm.user_id
    order by fm.created_at desc
    limit p_limit offset p_offset
  ) m;

  return jsonb_build_object('messages', v_messages, 'total', v_total, 'unread', v_unread);
end;
$$;

grant execute on function public.admin_list_feedback(int, int) to authenticated;

-- ----------------------------------------------------------------------------
-- admin_mark_feedback_read : marque un message comme lu (idempotent — ne
-- touche pas read_at s'il est déjà posé, pour garder la date du premier
-- passage en lecture).
-- ----------------------------------------------------------------------------
create or replace function public.admin_mark_feedback_read(p_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
begin
  if not public.is_admin_user(v_user) then
    raise exception 'Accès refusé.';
  end if;

  update public.feedback_messages set read_at = now() where id = p_id and read_at is null;
end;
$$;

grant execute on function public.admin_mark_feedback_read(uuid) to authenticated;

-- ----------------------------------------------------------------------------
-- admin_get_stats : reprise intégrale de 0048_admin_rpcs.sql, ajoute
-- 'unread_feedback'.
-- ----------------------------------------------------------------------------
create or replace function public.admin_get_stats()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
begin
  if not public.is_admin_user(v_user) then
    raise exception 'Accès refusé.';
  end if;

  return jsonb_build_object(
    'total_users', (select count(*) from public.profiles),
    'new_users_today', (select count(*) from public.profiles where created_at >= date_trunc('day', now())),
    'total_games', (select count(*) from public.games),
    'active_games', (select count(*) from public.games where status <> 'ended'),
    'games_today', (select count(*) from public.games where created_at >= date_trunc('day', now())),
    'messages_today', (select count(*) from public.chat_messages where created_at >= date_trunc('day', now())),
    'banned_users', (select count(*) from public.profiles where is_banned),
    'admin_users', (select count(*) from public.profiles where is_admin),
    'pending_deletions', (select count(*) from public.account_deletion_requests),
    'pending_join_requests', (select count(*) from public.game_join_requests where status = 'pending'),
    'unread_feedback', (select count(*) from public.feedback_messages where read_at is null),
    'new_games_enabled', (select new_games_enabled from public.app_settings where id = 1)
  );
end;
$$;

grant execute on function public.admin_get_stats() to authenticated;
