-- ============================================================================
-- Préférence de langue persistée par compte + 15 nouvelles icônes d'avatar.
--
-- - profiles.lang : langue par défaut du joueur ('fr' ou 'en'). Choisie à
--   l'inscription (transmise via raw_user_meta_data ->> 'lang', voir
--   handle_new_user() ci-dessous) puis modifiable à tout moment depuis "Mon
--   compte" via update_my_language(...). Le client (LanguageContext) s'en
--   sert pour initialiser la langue de l'appli dès la connexion, à la place
--   de la détection navigateur/localStorage utilisée pour les visiteurs non
--   connectés.
-- - Icônes d'avatar : la liste passe de 10 à 25 propositions (voir
--   src/lib/avatars.ts, qui doit rester synchronisé avec les deux listes
--   ci-dessous). Toujours volontairement neutres, aucune ne doit faire
--   penser à un rôle (voir commentaire dans 0014_account.sql).
-- ============================================================================
set search_path = public;

-- ----------------------------------------------------------------------------
-- Langue de préférence
-- ----------------------------------------------------------------------------
alter table public.profiles
  add column if not exists lang text not null default 'fr';

alter table public.profiles
  drop constraint if exists profiles_lang_check;
alter table public.profiles
  add constraint profiles_lang_check
  check (lang in ('fr','en'));

-- handle_new_user() : reprise pour lire la langue choisie à l'inscription
-- (voir SignUp.tsx, qui passe désormais `lang` dans les métadonnées du
-- compte) ; retombe sur 'fr' si absente ou invalide.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, username, lang)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'username', split_part(new.email, '@', 1)),
    case
      when new.raw_user_meta_data ->> 'lang' in ('fr', 'en') then new.raw_user_meta_data ->> 'lang'
      else 'fr'
    end
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

-- update_my_language : seule porte d'entrée pour changer sa préférence de
-- langue une fois le compte créé (page "Mon compte").
create or replace function public.update_my_language(p_lang text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
begin
  if v_user is null then
    raise exception 'Authentification requise';
  end if;

  if p_lang is null or p_lang not in ('fr', 'en') then
    raise exception 'Langue invalide.';
  end if;

  update public.profiles
  set lang = p_lang
  where id = v_user;

  return jsonb_build_object('lang', p_lang);
end;
$$;

grant execute on function public.update_my_language(text) to authenticated;

-- ----------------------------------------------------------------------------
-- 15 nouvelles icônes d'avatar (10 -> 25 au total)
-- ----------------------------------------------------------------------------
alter table public.profiles
  drop constraint if exists profiles_avatar_icon_check;
alter table public.profiles
  add constraint profiles_avatar_icon_check
  check (avatar_icon in (
    '🐺','🌕','🦇','🕯️','⚰️','🔪','🩸','👁️','🌲','🏚️',
    '🦉','🕷️','🐗','🦁','🐆','🦅','🐍','🦂','🔥','⚡','🌑','⚔️','🪶','🛖','🥁'
  ));

create or replace function public.update_my_profile(p_username text, p_avatar_icon text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_username text;
begin
  if v_user is null then
    raise exception 'Authentification requise';
  end if;

  v_username := trim(p_username);
  if length(v_username) < 2 or length(v_username) > 24 then
    raise exception 'Le pseudo doit contenir entre 2 et 24 caractères.';
  end if;

  if p_avatar_icon is null or p_avatar_icon not in (
    '🐺','🌕','🦇','🕯️','⚰️','🔪','🩸','👁️','🌲','🏚️',
    '🦉','🕷️','🐗','🦁','🐆','🦅','🐍','🦂','🔥','⚡','🌑','⚔️','🪶','🛖','🥁'
  ) then
    raise exception 'Icône invalide.';
  end if;

  update public.profiles
  set username = v_username, avatar_icon = p_avatar_icon
  where id = v_user;

  update public.game_players gp
  set display_name = v_username, avatar_icon = p_avatar_icon
  from public.games g
  where gp.game_id = g.id and gp.user_id = v_user and g.status = 'lobby';

  return jsonb_build_object('username', v_username, 'avatar_icon', p_avatar_icon);
end;
$$;

grant execute on function public.update_my_profile(text, text) to authenticated;
