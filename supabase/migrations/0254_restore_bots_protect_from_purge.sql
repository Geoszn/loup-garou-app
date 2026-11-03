-- 0254 — URGENT : (1) la création de TOUT compte non invité échouait ; (2) les bots de test avaient disparu.
--
-- (1) handle_new_user (0250) insérait explicitement NULL dans profiles.avatar_icon pour un compte non invité. Or la colonne est
--     « not null default '🐺' » (0014) : un NULL explicite n'applique pas le défaut, il viole la contrainte. Résultat : à
--     chaque inscription par e-mail, le déclencheur sur auth.users échouait (« Database error saving new user »). Seules les
--     connexions invitées (qui fournissent une icône) passaient. C'est aussi ce qui a fait échouer la recréation des bots.
--     Ici : l'icône n'est fournie QUE pour un invité, la colonne reste omise sinon (défaut de la table).
--
-- (2) « Tous les bots disponibles sont déjà dans cette partie » alors qu'il n'y en a aucun : les 12 comptes bot (0127) avaient
--     été créés avec auth.users.is_anonymous = true. La purge des invités (purge_stale_guests, 0250, appelée par
--     /api/cron-engagement-notifications) supprime tout compte anonyme inactif depuis plus de 30 jours — sans distinguer les
--     bots, qui ne se connectent jamais — profils compris, par cascade.
--
-- Correctif rejouable :
--   1. handle_new_user corrigée (reprend la version de 0250, une seule différence : l'icône) ;
--   2. la purge ne touche plus jamais un bot (profil is_bot, ou adresse @bots.loupgarouafrique.internal) ;
--   3. les bots sont recréés comme comptes NON anonymes (ni « invités », ni éligibles à la purge) ;
--   4. si certains avaient survécu, ils sont aussi corrigés (is_anonymous = false, is_guest = false).
set search_path = public;

-- 0. Création de profil : l'icône n'est fournie que pour un invité (sinon : défaut de la table).
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_guest boolean := coalesce(new.is_anonymous, false);
  v_name text;
  v_lang text;
  v_continent text;
begin
  v_name := coalesce(nullif(trim(new.raw_user_meta_data ->> 'username'), ''), split_part(new.email, '@', 1));
  if v_guest then
    -- Pseudo choisi par l'invité (16 caractères au plus, sans caractère de contrôle), « Invité » à défaut.
    v_name := coalesce(nullif(left(regexp_replace(coalesce(v_name, ''), '[[:cntrl:]]', '', 'g'), 16), ''), 'Invité');
  end if;
  v_lang := case when new.raw_user_meta_data ->> 'lang' in ('fr', 'en') then new.raw_user_meta_data ->> 'lang' else 'fr' end;
  v_continent := case
    when new.raw_user_meta_data ->> 'continent' in ('afrique','europe','amerique_nord','amerique_sud','asie','oceanie')
      then new.raw_user_meta_data ->> 'continent'
    else null
  end;

  if v_guest then
    -- Avatar tiré au hasard parmi les icônes libres pour un invité (il ne peut pas en changer).
    insert into public.profiles (id, username, lang, continent, is_guest, avatar_icon)
    values (new.id, v_name, v_lang, v_continent, true, (array['🐺','🌕','🌲','🏚️','🪶','🛖','🌑','🕯️'])[1 + floor(random() * 8)::int])
    on conflict (id) do nothing;
  else
    insert into public.profiles (id, username, lang, continent, is_guest)
    values (new.id, v_name, v_lang, v_continent, false)
    on conflict (id) do nothing;
  end if;
  return new;
end;
$$;

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
