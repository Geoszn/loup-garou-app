-- 0269 : un compte inscrit par e-mail peut entrer dans le jeu AVANT d'avoir confirmé son adresse.
--   * my_email_unconfirmed() : vrai si le compte connecté (non invité) n'a pas encore confirmé son e-mail.
--   * guest_guard (copie de 0256) : refuse alors les vraies parties (create_game, join_game, request_join_public_game),
--     la tribu et les amis. Restent ouverts : tutoriel, avatar, partie d'entraînement (start_practice_game), quêtes, boutique.
-- Rejouable (create or replace), grants explicites.

create or replace function public.my_email_unconfirmed()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from auth.users u
    where u.id = auth.uid()
      and u.email_confirmed_at is null
      and not coalesce(u.is_anonymous, false)
  );
$$;
revoke execute on function public.my_email_unconfirmed() from public;
grant execute on function public.my_email_unconfirmed() to anon, authenticated, authenticator, service_role;

create or replace function public.guest_guard()
returns void
language plpgsql
as $$
declare
  v_claims jsonb;
  v_fn text;
  v_uid uuid;
begin
  begin
    v_claims := nullif(current_setting('request.jwt.claims', true), '')::jsonb;
  exception when others then
    return;
  end;
  if v_claims is null then
    return;
  end if;

  v_fn := substring(coalesce(current_setting('request.path', true), '') from '/rpc/([A-Za-z0-9_]+)');
  if v_fn is null then
    return;
  end if;

  -- Serveur complet (migration 0256) : refuse, pour TOUS les comptes, de créer ou rejoindre une partie quand le plafond de
  -- joueurs en ligne est atteint — sauf à un joueur déjà dans une partie en cours (il peut y revenir).
  if v_fn in ('create_game', 'join_game') then
    begin
      v_uid := (v_claims ->> 'sub')::uuid;
    exception when others then
      v_uid := null;
    end;
    if v_uid is not null and public.server_full_for_new_player(v_uid) then
      raise exception 'Serveur complet : trop de joueurs en ligne en ce moment, réessayez dans quelques minutes. / Server full: too many players online right now, please try again in a few minutes.';
    end if;
  end if;

  -- Adresse e-mail pas encore confirmée (migration 0269) : le joueur découvre le jeu (tutoriel, avatar, partie
  -- d'entraînement, quêtes), mais ne peut ni jouer avec d'autres joueurs, ni rejoindre une tribu, ni ajouter d'amis.
  if coalesce(v_claims ->> 'is_anonymous', 'false') <> 'true'
     and v_fn ~ '^(create_game|join_game|request_join_|create_tribe|invite_|respond_tribe|respond_friend|send_friend|send_tribe)'
     and public.my_email_unconfirmed()
  then
    raise exception 'Confirme ton adresse e-mail pour jouer avec les autres joueurs. / Confirm your e-mail address to play with other players.' using errcode = '42501';
  end if;

  if coalesce(v_claims ->> 'is_anonymous', 'false') <> 'true' then
    return;
  end if;

  if v_fn ~ '^(claim_|purchase_|equip_|admin_|search_|create_|invite_|cancel_tribe|respond_tribe|respond_friend|send_friend|send_tribe|toggle_tribe|mark_tribe|report_tribe|delete_tribe|remove_friend|request_join_tribe|update_tribe|set_tribe|set_chat_quiet|set_my_avatar|update_my_profile|update_my_continent|start_practice|place_ghost|sync_daily|mark_store|use_oeil|use_parchemin|save_my_notification|save_push|remove_push|request_account|cancel_account|get_home_bootstrap|get_store|get_tribe|get_ghost|get_my_(social|stats|quests|season|artifacts|loup_coins|tribe|unlocked|notification|feedback|account|quest)|list_store)'
  then
    raise exception 'Un compte est requis pour cette action.' using errcode = '42501';
  end if;
end;
$$;

grant execute on function public.guest_guard() to anon, authenticated, service_role, authenticator;

-- PostgREST relit sa configuration (la fonction de pré-requête est la même, seul son corps change).
notify pgrst, 'reload config';
