-- Jouer en invité : un compte temporaire (connexion anonyme Supabase), sans e-mail ni mot de passe.
--
--   * `profiles.is_guest` : posé à la création du compte (handle_new_user) et retiré quand l'invité crée son vrai compte
--     (trigger sur auth.users.is_anonymous). Le pseudo vient des métadonnées d'inscription (borné à 16 caractères).
--   * `guest_guard()` : fonction de pré-requête PostgREST (db_pre_request). Un invité ne peut appeler QUE les fonctions de jeu :
--     création de parties, boutique et artefacts, récompenses, quêtes, saison, amis, tribus, avatar... sont refusés côté serveur
--     (« Un compte est requis »), quoi que fasse le client. Les jetons des invités portent `is_anonymous = true`.
--   * Un invité ne gagne rien de durable : apply_rank_updates_for_game ne lui applique ni points, ni Loup Coins, ni XP, ni ligne
--     de résultat ; elle note seulement `game_guest_results` (ce qu'il aurait gagné) pour l'écran de fin.
--   * Vue de partie : `guest_user_ids` (badge « Invité ») et `my_guest_result`.
--   * Vocal : 20 minutes par invité et par partie (guest_voice_begin / guest_voice_end, appelées par /api/daily-room et le client).
--   * Nettoyage : purge_stale_guests() supprime les invités inactifs depuis 30 jours (appelée par /api/cron-purge-guests).
-- À appliquer APRÈS 0249. Rejouable sans risque.
set search_path = public;

alter table public.profiles add column if not exists is_guest boolean not null default false;

-- 1. Création du profil : invité ou non.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_guest boolean := coalesce(new.is_anonymous, false);
  v_name text;
begin
  v_name := coalesce(nullif(trim(new.raw_user_meta_data ->> 'username'), ''), split_part(new.email, '@', 1));
  if v_guest then
    -- Pseudo choisi par l'invité (16 caractères au plus, sans caractère de contrôle), « Invité » à défaut.
    v_name := coalesce(nullif(left(regexp_replace(coalesce(v_name, ''), '[[:cntrl:]]', '', 'g'), 16), ''), 'Invité');
  end if;

  insert into public.profiles (id, username, lang, continent, is_guest, avatar_icon)
  values (
    new.id,
    v_name,
    case
      when new.raw_user_meta_data ->> 'lang' in ('fr', 'en') then new.raw_user_meta_data ->> 'lang'
      else 'fr'
    end,
    case
      when new.raw_user_meta_data ->> 'continent' in ('afrique','europe','amerique_nord','amerique_sud','asie','oceanie')
        then new.raw_user_meta_data ->> 'continent'
      else null
    end,
    v_guest,
    -- Avatar tiré au hasard parmi les icônes libres pour un invité (il ne peut pas en changer) ; défaut de la table sinon.
    case when v_guest then (array['🐺','🌕','🌲','🏚️','🪶','🛖','🌑','🕯️'])[1 + floor(random() * 8)::int] else null end
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

-- L'invité crée son compte (e-mail confirmé) : Supabase passe is_anonymous à false sur le même identifiant.
create or replace function public.handle_guest_upgraded()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.profiles set is_guest = false where id = new.id and is_guest;
  return new;
end;
$$;

drop trigger if exists on_auth_user_upgraded on auth.users;
create trigger on_auth_user_upgraded
  after update of is_anonymous on auth.users
  for each row
  when (old.is_anonymous is distinct from new.is_anonymous and new.is_anonymous is not true)
  execute procedure public.handle_guest_upgraded();

-- 2. Ce que l'invité aurait gagné.
create table if not exists public.game_guest_results (
  game_id uuid not null references public.games (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  won boolean not null,
  points_preview int not null,
  participation_ratio numeric not null default 1,
  created_at timestamptz not null default now(),
  primary key (game_id, user_id)
);
alter table public.game_guest_results enable row level security;
revoke all on public.game_guest_results from anon, authenticated;


-- 3. Le garde-fou : pré-requête PostgREST. Exécuté avant CHAQUE appel d'API ; ne fait jamais rien pour un compte normal (jeton
-- sans is_anonymous) ni hors appel de fonction. Ne lit aucune table : seulement le jeton et le chemin de la requête.
create or replace function public.guest_guard()
returns void
language plpgsql
as $$
declare
  v_claims jsonb;
  v_fn text;
begin
  begin
    v_claims := nullif(current_setting('request.jwt.claims', true), '')::jsonb;
  exception when others then
    return;
  end;
  if v_claims is null or coalesce(v_claims ->> 'is_anonymous', 'false') <> 'true' then
    return;
  end if;

  v_fn := substring(coalesce(current_setting('request.path', true), '') from '/rpc/([A-Za-z0-9_]+)');
  if v_fn is null then
    return;
  end if;

  if v_fn ~ '^(claim_|purchase_|equip_|admin_|search_|create_|invite_|cancel_tribe|respond_tribe|respond_friend|send_friend|send_tribe|toggle_tribe|mark_tribe|report_tribe|delete_tribe|remove_friend|request_join_tribe|update_tribe|set_tribe|set_chat_quiet|set_my_avatar|update_my_profile|update_my_continent|start_practice|place_ghost|sync_daily|mark_store|use_oeil|use_parchemin|save_my_notification|save_push|remove_push|request_account|cancel_account|get_home_bootstrap|get_store|get_tribe|get_ghost|get_my_(social|stats|quests|season|artifacts|loup_coins|tribe|unlocked|notification|feedback|account|quest)|list_store)'
  then
    raise exception 'Un compte est requis pour cette action.' using errcode = '42501';
  end if;
end;
$$;

grant execute on function public.guest_guard() to anon, authenticated, service_role, authenticator;

-- PostgREST appelle guest_guard avant chaque requête (rechargement de la configuration demandé juste après).
alter role authenticator set pgrst.db_pre_request = 'public.guest_guard';
notify pgrst, 'reload config';

-- 4. Quota de vocal des invités : 20 minutes par partie.
create table if not exists public.guest_voice_usage (
  game_id uuid not null references public.games (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  used_seconds int not null default 0,
  granted_at timestamptz,
  granted_seconds int not null default 0,
  primary key (game_id, user_id)
);
alter table public.guest_voice_usage enable row level security;
revoke all on public.guest_voice_usage from anon, authenticated;

-- Début d'une session vocale : renvoie le nombre de secondes accordées (0 = quota épuisé), ou -1 pour un compte normal (illimité).
-- Une session précédente jamais clôturée compte au plus ce qui lui avait été accordé.
create or replace function public.guest_voice_begin(p_game_id uuid)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_row public.guest_voice_usage%rowtype;
  v_used int;
  v_remaining int;
  c_quota constant int := 1200;
begin
  if v_user is null then
    raise exception 'Authentification requise';
  end if;
  if not exists (select 1 from public.profiles where id = v_user and is_guest) then
    return -1;
  end if;

  insert into public.guest_voice_usage (game_id, user_id) values (p_game_id, v_user) on conflict do nothing;
  select * into v_row from public.guest_voice_usage where game_id = p_game_id and user_id = v_user for update;

  v_used := v_row.used_seconds;
  if v_row.granted_at is not null then
    v_used := v_used + least(v_row.granted_seconds, greatest(extract(epoch from (now() - v_row.granted_at))::int, 0));
  end if;
  v_remaining := greatest(c_quota - v_used, 0);

  update public.guest_voice_usage
  set used_seconds = v_used,
      granted_at = case when v_remaining > 0 then now() else null end,
      granted_seconds = v_remaining
  where game_id = p_game_id and user_id = v_user;

  return v_remaining;
end;
$$;

-- Fin d'une session vocale (l'invité quitte le vocal) : seul le temps réellement écoulé est décompté.
create or replace function public.guest_voice_end(p_game_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_row public.guest_voice_usage%rowtype;
begin
  if v_user is null then
    return;
  end if;
  select * into v_row from public.guest_voice_usage where game_id = p_game_id and user_id = v_user for update;
  if not found or v_row.granted_at is null then
    return;
  end if;
  update public.guest_voice_usage
  set used_seconds = used_seconds + least(granted_seconds, greatest(extract(epoch from (now() - granted_at))::int, 0)),
      granted_at = null,
      granted_seconds = 0
  where game_id = p_game_id and user_id = v_user;
end;
$$;

revoke execute on function public.guest_voice_begin(uuid) from public, anon;
grant execute on function public.guest_voice_begin(uuid) to authenticated;
revoke execute on function public.guest_voice_end(uuid) from public, anon;
grant execute on function public.guest_voice_end(uuid) to authenticated;

-- 5. Nettoyage des invités inactifs (appelée par /api/cron-purge-guests avec la clé service). Supprime le compte d'authentification,
-- et avec lui le profil et tout ce qui lui est rattaché.
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
      and coalesce(u.last_sign_in_at, u.created_at) < now() - make_interval(days => greatest(p_days, 7))
    returning 1
  )
  select count(*) into v_count from gone;
  return coalesce(v_count, 0);
end;
$$;
revoke execute on function public.purge_stale_guests(int) from public, anon, authenticated;
grant execute on function public.purge_stale_guests(int) to service_role;

-- 6. Résultats et vue de partie (voir get_my_game_view).

create or replace function public.apply_rank_updates_for_game(p_game_id uuid, p_winner text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  r record; v_won boolean; v_forfeit boolean; v_code text; v_total_rounds int; v_ratio numeric;
  v_impact jsonb; v_impact_bonus int; v_impact_details jsonb; v_result jsonb;
begin
  -- Partie d'entraînement : ni points, ni résultat, ni statistique.
  if exists (select 1 from public.games where id = p_game_id and is_practice) then
    return;
  end if;

  select code, greatest(night_number, 1) into v_code, v_total_rounds from public.games where id = p_game_id;

  for r in
    select gp.user_id, (rs.lover_with is not null) as is_lover, gp.died_at_night, gp.death_cause, rs.role
    from public.game_players gp
    left join public.game_roles_secret rs
      on rs.game_id = gp.game_id and rs.user_id = gp.user_id
    where gp.game_id = p_game_id
  loop
    -- 'parti' = a quitté la partie, 'exclu' = retiré par l'hôte (cause posée
    -- par kill_player seulement si le joueur était vivant à ce moment-là).
    v_forfeit := coalesce(r.death_cause in ('parti', 'exclu'), false);

    v_won := case
      when v_forfeit then false
      when r.is_lover then (p_winner = 'amoureux')
      when r.role = 'cupidon' and p_winner = 'amoureux' then true
      when p_winner = 'loups' then coalesce(r.role in ('loup_garou', 'loup_alpha', 'sans_visage', 'grand_mechant_loup', 'reine_louve'), false)
      when p_winner = 'village' then coalesce(r.role not in ('loup_garou', 'loup_alpha', 'sans_visage', 'grand_mechant_loup', 'reine_louve', 'anancy', 'chasseuse'), true)
      when p_winner = 'anancy' then coalesce(r.role = 'anancy', false)
      when p_winner = 'ange' then coalesce(r.role = 'ange', false)
      when p_winner = 'chasseuse' then coalesce(r.role = 'chasseuse', false)
      else false
    end;

    v_ratio := case
      when r.died_at_night is null then 1.0
      else least(greatest(r.died_at_night::numeric / v_total_rounds, 0.4), 0.9)
    end;

    if v_forfeit then
      v_impact_bonus := 0;
      v_impact_details := '[]'::jsonb;
    else
      v_impact := public.compute_impact_bonus(p_game_id, r.user_id, r.role);
      v_impact_bonus := coalesce((v_impact->>'bonus')::int, 0);
      v_impact_details := coalesce(v_impact->'details', '[]'::jsonb);
    end if;

    if p_winner = 'anancy' and v_won then
      v_impact_bonus := v_impact_bonus + 50;
      v_impact_details := v_impact_details || jsonb_build_object('kind', 'anancy_solo_win', 'points', 50);
    end if;

    if p_winner = 'loups' and v_won then
      v_impact_bonus := v_impact_bonus + 15;
      v_impact_details := v_impact_details || jsonb_build_object('kind', 'wolf_team_win', 'points', 15);
    end if;

    if p_winner = 'amoureux' and v_won and r.is_lover then
      v_impact_bonus := v_impact_bonus + 70;
      v_impact_details := v_impact_details || jsonb_build_object('kind', 'lovers_win', 'points', 70);
    end if;

    if p_winner = 'amoureux' and v_won and r.role = 'cupidon' then
      v_impact_bonus := v_impact_bonus + 30;
      v_impact_details := v_impact_details || jsonb_build_object('kind', 'cupidon_lovers_win', 'points', 30);
    end if;

    -- Un invité (compte temporaire, migration 0250) ne gagne rien de durable : ni points de rang, ni Loup Coins, ni XP de
    -- saison, ni ligne de résultat. On garde seulement l'estimation de ce qu'il aurait gagné, pour la lui montrer à l'écran
    -- de fin (sans les bonus de série ni d'événement).
    if exists (select 1 from public.profiles where id = r.user_id and is_guest) then
      insert into public.game_guest_results (game_id, user_id, won, points_preview, participation_ratio)
      values (
        p_game_id, r.user_id, v_won,
        case when v_won then round(30 * greatest(least(v_ratio, 1), 0.4))::int + v_impact_bonus else -15 + v_impact_bonus end,
        v_ratio
      )
      on conflict (game_id, user_id) do nothing;
      continue;
    end if;

    v_result := public.apply_rank_result(r.user_id, v_won, v_ratio, v_impact_bonus, v_forfeit);

    insert into public.game_results (
      game_id, user_id, code, role, is_lover, winner_team, won,
      points_gained, participation_ratio, impact_bonus, impact_details, new_rank_points, new_rank_tier,
      season_xp_gained
    )
    values (
      p_game_id, r.user_id, v_code, r.role, coalesce(r.is_lover, false), p_winner, v_won,
      (v_result->>'gain')::int, v_ratio, v_impact_bonus, v_impact_details,
      (v_result->>'new_points')::int, v_result->>'new_tier',
      coalesce((v_result->>'season_xp_gained')::int, 0)
    );
  end loop;
end;
$$;

create or replace function public.game_view_progression_fields(
  p_game_id uuid, p_game public.games, p_user uuid, p_my_role text, p_my_alive boolean
)
returns jsonb
language sql
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'my_impact_preview', case
      when not coalesce(p_my_alive, false) and p_game.status <> 'ended' and p_my_role is not null
      then public.compute_impact_bonus(p_game_id, p_user, p_my_role)
      else null
    end,

    'my_game_result', case when p_game.status = 'ended' then (
      select jsonb_build_object(
        'points_gained', gr.points_gained,
        'participation_ratio', gr.participation_ratio,
        'impact_bonus', gr.impact_bonus,
        'impact_details', gr.impact_details,
        'new_rank_points', gr.new_rank_points,
        'new_rank_tier', gr.new_rank_tier,
        'won', gr.won,
        'season_xp_gained', gr.season_xp_gained
      )
      from public.game_results gr
      where gr.game_id = p_game_id and gr.user_id = p_user
      order by gr.created_at desc limit 1
    ) else null end,

    -- Invités (migration 0250) : qui est invité dans cette partie (badge « Invité »), et pour moi-même, ce que j'aurais gagné
    -- avec un compte une fois la partie terminée.
    'guest_user_ids', coalesce((
      select jsonb_agg(gp.user_id)
      from public.game_players gp
      join public.profiles pr on pr.id = gp.user_id
      where gp.game_id = p_game_id and pr.is_guest
    ), '[]'::jsonb),

    'my_guest_result', case when p_game.status = 'ended' then (
      select jsonb_build_object('won', gg.won, 'points_preview', gg.points_preview)
      from public.game_guest_results gg
      where gg.game_id = p_game_id and gg.user_id = p_user
    ) else null end
  );
$$;
