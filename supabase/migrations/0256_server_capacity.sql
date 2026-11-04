-- 0256 — « Serveur complet » : plafond de joueurs en ligne.
--
-- Pourquoi : Supabase Realtime plafonne les connexions simultanées (200 en gratuit, 500 en Pro, 10 000 en Pro sans plafond de
-- dépense / Team). Au-delà, les nouveaux arrivants échouent de façon imprévisible et peuvent dégrader les parties en cours.
-- Mieux vaut refuser proprement les NOUVELLES parties que laisser tout le monde ramer.
--
-- Fonctionnement :
--   * server_capacity (une seule ligne) : max_online (NULL = aucun plafond, état par défaut), online_count, is_full.
--   * refresh_server_capacity() recompte toutes les 10 s (pg_cron) : joueurs vus par touch_presence dans les 150 dernières
--     secondes, plus les joueurs (invités compris, bots exclus) d'une partie non terminée. Hystérésis : plein à max_online,
--     de nouveau ouvert sous 95 % de max_online, pour éviter de clignoter.
--   * guest_guard (déjà exécuté avant chaque appel d'API) refuse create_game et join_game quand c'est plein, SAUF à un joueur
--     déjà présent dans une partie en cours : il peut y revenir. Les parties déjà lancées ne sont jamais interrompues.
--   * Le message d'erreur est bilingue : les écrans qui affichent l'erreur du serveur l'affichent tel quel.
--
-- Réglage (dans votre Terminal, voir supabase/ops/set_server_capacity.sql) : tant que max_online est NULL, rien ne change.
-- Une valeur raisonnable = environ 80 % de la limite de connexions Realtime de votre plan (ex. 400 pour un plafond de 500).
-- RETOUR EN ARRIÈRE : update public.server_capacity set max_online = null;
-- À appliquer APRÈS 0255. Rejouable sans risque.
set search_path = public;

create table if not exists public.server_capacity (
  id int primary key default 1 check (id = 1),
  max_online int check (max_online is null or max_online > 0),
  online_count int not null default 0,
  is_full boolean not null default false,
  updated_at timestamptz not null default now()
);

insert into public.server_capacity (id) values (1) on conflict (id) do nothing;

alter table public.server_capacity enable row level security;
revoke all on table public.server_capacity from anon, authenticated;

create or replace function public.refresh_server_capacity()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count int;
  v_max int;
  v_was_full boolean;
begin
  select max_online, is_full into v_max, v_was_full from public.server_capacity where id = 1;

  select count(*) into v_count
  from (
    select up.user_id
    from public.user_presence up
    where up.last_seen_at > now() - interval '150 seconds'
    union
    select gp.user_id
    from public.game_players gp
    join public.games g on g.id = gp.game_id
    join public.profiles p on p.id = gp.user_id
    where g.status <> 'ended' and not p.is_bot
  ) x;

  update public.server_capacity
  set online_count = v_count,
      is_full = case
        when v_max is null then false
        when v_count >= v_max then true
        when v_was_full and v_count >= (v_max * 0.95) then true
        else false
      end,
      updated_at = now()
  where id = 1;
end;
$$;

revoke all on function public.refresh_server_capacity() from public, anon, authenticated;

-- Vrai si le serveur est plein ET que ce joueur n'est pas déjà dans une partie en cours.
create or replace function public.server_full_for_new_player(p_user uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((select sc.is_full from public.server_capacity sc where sc.id = 1), false)
    and not exists (
      select 1
      from public.game_players gp
      join public.games g on g.id = gp.game_id
      where gp.user_id = p_user and g.status <> 'ended'
    );
$$;

revoke all on function public.server_full_for_new_player(uuid) from public, anon, authenticated;
grant execute on function public.server_full_for_new_player(uuid) to anon, authenticated, service_role, authenticator;

-- Garde-fou PostgREST (dernière définition : 0250), avec le contrôle « serveur complet » ajouté avant la vérification des
-- comptes invités. Il ne lit la table que pour create_game et join_game.

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

-- Recomptage toutes les 10 s (si pg_cron est actif, voir 0251).
do $$
begin
  perform cron.unschedule(jobid) from cron.job where jobname = 'refresh-server-capacity';
  perform cron.schedule('refresh-server-capacity', '10 seconds', 'select public.refresh_server_capacity()');
exception when others then
  raise notice 'recomptage du plafond non planifié (%) : sans pg_cron, is_full reste à sa dernière valeur.', sqlerrm;
end;
$$;

select public.refresh_server_capacity();
