-- 0254 — Les bots de test avaient disparu : « Tous les bots disponibles sont déjà dans cette partie » alors qu'il n'y en a aucun.
--
-- Cause : les 12 comptes bot (0127) avaient été créés avec auth.users.is_anonymous = true. La purge des invités
-- (purge_stale_guests, 0250, appelée par /api/cron-engagement-notifications) supprime tout compte anonyme inactif depuis plus
-- de 30 jours — sans distinguer les bots, qui ne se connectent jamais. Ils ont donc été supprimés (profils compris, par cascade).
--
-- Correctif en trois temps, rejouable :
--   1. la purge ne touche plus jamais un bot (profil is_bot, ou adresse @bots.loupgarouafrique.internal) ;
--   2. les bots sont recréés comme comptes NON anonymes (ils ne sont donc ni « invités », ni éligibles à la purge) ;
--   3. si certains avaient survécu, ils sont aussi corrigés (is_anonymous = false, is_guest = false).
set search_path = public;

-- 1. La purge épargne les bots.
create or replace function public.purge_stale_guests(p_days int default 30)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count int;
begin
  with gone as (
    delete from auth.users u
    where u.is_anonymous
      and coalesce(u.email, '') not like '%@bots.loupgarouafrique.internal'
      and not exists (select 1 from public.profiles p where p.id = u.id and p.is_bot)
      and coalesce(u.last_sign_in_at, u.created_at) < now() - make_interval(days => greatest(p_days, 7))
    returning 1
  )
  select count(*) into v_count from gone;
  return coalesce(v_count, 0);
end;
$$;
revoke execute on function public.purge_stale_guests(int) from public, anon, authenticated;
grant execute on function public.purge_stale_guests(int) to service_role;

-- 2. Recrée le pool de 12 bots (comme 0127, mais non anonymes). Le déclencheur handle_new_user crée les profils.
insert into auth.users (
  instance_id, id, aud, role, email, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, is_sso_user, is_anonymous, created_at, updated_at
)
select
  '00000000-0000-0000-0000-000000000000'::uuid,
  ('00000000-0000-0000-0000-0000000000' || lpad(n::text, 2, '0'))::uuid,
  'authenticated', 'authenticated',
  'bot' || n || '@bots.loupgarouafrique.internal',
  now(),
  '{"provider":"bot","providers":["bot"]}'::jsonb,
  jsonb_build_object('username', 'Bot ' || n),
  false, false, now(), now()
from generate_series(1, 12) as n
on conflict (id) do nothing;

-- 3. Bots déjà présents : non anonymes, non invités.
update auth.users
set is_anonymous = false
where email like 'bot%@bots.loupgarouafrique.internal' and is_anonymous;

-- Profils : marqués bots, avatar d'origine, jamais « invités ».
with bot_ids as (
  select ('00000000-0000-0000-0000-0000000000' || lpad(n::text, 2, '0'))::uuid as id
  from generate_series(1, 12) as n
),
bot_icons as (
  select id, (array['🐺','🌕','🦇','🕯️','⚰️','🔪','🩸','👁️','🌲','🏚️','🦉','🕷️'])[row_number() over (order by id)] as icon
  from bot_ids
)
update public.profiles p
set is_bot = true,
    is_guest = false,
    avatar_icon = bi.icon
from bot_icons bi
where p.id = bi.id;
