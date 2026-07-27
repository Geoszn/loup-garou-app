-- ============================================================================
-- Panneau "Mon compte" : changer son pseudo et choisir une icône d'avatar
-- parmi 10 propositions thématiques (le changement de mot de passe, lui,
-- passe directement par supabase.auth.updateUser côté client — rien à
-- ajouter ici pour ça).
--
-- - profiles.avatar_icon : icône persistante choisie par le joueur, réutilisée
--   à chaque nouvelle partie (create_game / join_game la copient dans
--   game_players.avatar_icon, comme c'est déjà le cas pour display_name).
-- - update_my_profile(...) est la seule porte d'entrée pour modifier son
--   pseudo/icône, afin de garder la validation (longueur, liste d'icônes
--   autorisées) côté serveur plutôt que de compter sur le client.
-- ============================================================================
set search_path = public;

alter table public.profiles
  add column if not exists avatar_icon text not null default '🐺';

alter table public.profiles
  drop constraint if exists profiles_avatar_icon_check;
alter table public.profiles
  add constraint profiles_avatar_icon_check
  check (avatar_icon in ('🐺','🌕','🦇','🕯️','⚰️','🔪','🩸','👁️','🌲','🏚️'));

alter table public.game_players
  add column if not exists avatar_icon text;

-- ----------------------------------------------------------------------------
-- update_my_profile : modifie le pseudo et/ou l'icône du compte courant.
-- Si le joueur est actuellement dans un salon en attente (statut "lobby"),
-- sa fiche dans ce salon est mise à jour dans la foulée pour éviter un
-- décalage entre le profil et ce qui s'affiche encore aux autres joueurs.
-- ----------------------------------------------------------------------------
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

  if p_avatar_icon is null or p_avatar_icon not in ('🐺','🌕','🦇','🕯️','⚰️','🔪','🩸','👁️','🌲','🏚️') then
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

-- ----------------------------------------------------------------------------
-- create_game / join_game : reprises pour copier l'icône du profil dans
-- game_players.avatar_icon (comme display_name, avatar_color).
-- ----------------------------------------------------------------------------
create or replace function public.create_game(p_display_name text, p_settings jsonb default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_code text;
  v_game_id uuid;
  v_settings jsonb;
  v_icon text;
begin
  if v_user is null then
    raise exception 'Authentification requise';
  end if;

  select avatar_icon into v_icon from public.profiles where id = v_user;

  v_code := public.generate_game_code();
  v_settings := jsonb_build_object(
    'discussion_seconds', coalesce((p_settings->>'discussion_seconds')::int, 90),
    'vote_seconds', coalesce((p_settings->>'vote_seconds')::int, 45),
    'night_step_seconds', coalesce((p_settings->>'night_step_seconds')::int, 40),
    'role_reveal_seconds', coalesce((p_settings->>'role_reveal_seconds')::int, 15),
    'role_counts', p_settings->'role_counts'
  );

  insert into public.games (code, host_id, settings)
  values (v_code, v_user, v_settings)
  returning id into v_game_id;

  insert into public.game_players (game_id, user_id, display_name, seat_number, is_host, avatar_color, avatar_icon)
  values (v_game_id, v_user, coalesce(nullif(trim(p_display_name), ''), 'Joueur'), 1, true, public.random_avatar_color(), v_icon);

  insert into public.game_log (game_id, message)
  values (v_game_id, 'La partie a été créée. En attente des joueurs...');

  return jsonb_build_object('game_id', v_game_id, 'code', v_code);
end;
$$;

create or replace function public.join_game(p_code text, p_display_name text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_game public.games%rowtype;
  v_count int;
  v_existing uuid;
  v_seat int;
  v_icon text;
begin
  if v_user is null then
    raise exception 'Authentification requise';
  end if;

  select * into v_game from public.games where code = upper(trim(p_code));
  if not found then
    raise exception 'Aucune partie ne correspond à ce code.';
  end if;

  select id into v_existing from public.game_players where game_id = v_game.id and user_id = v_user;
  if v_existing is not null then
    return jsonb_build_object('game_id', v_game.id, 'code', v_game.code);
  end if;

  if v_game.status <> 'lobby' then
    raise exception 'Cette partie a déjà commencé.';
  end if;

  select count(*) into v_count from public.game_players where game_id = v_game.id;
  if v_count >= 20 then
    raise exception 'Cette partie est complète (20 joueurs maximum).';
  end if;

  v_seat := v_count + 1;
  select avatar_icon into v_icon from public.profiles where id = v_user;

  insert into public.game_players (game_id, user_id, display_name, seat_number, is_host, avatar_color, avatar_icon)
  values (v_game.id, v_user, coalesce(nullif(trim(p_display_name), ''), 'Joueur'), v_seat, false, public.random_avatar_color(), v_icon);

  insert into public.game_log (game_id, message)
  values (v_game.id, coalesce(nullif(trim(p_display_name), ''), 'Un joueur') || ' a rejoint la partie.');

  return jsonb_build_object('game_id', v_game.id, 'code', v_game.code);
end;
$$;
