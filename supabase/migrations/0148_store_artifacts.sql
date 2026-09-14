-- ============================================================================
-- Premier étage du "Loup Store" (voir migration 0146/0147 pour les Loup
-- Coins) : un système générique d'artefacts achetables, gérés depuis un
-- nouvel onglet "Artefacts" du dashboard admin (nom/description FR+EN,
-- prix en Loup Coins, actif/inactif), avec deux artefacts concrets pour
-- commencer :
--
--   - Parchemin du Griot (key = 'parchemin_griot') : un Loup éliminé garde
--     accès en LECTURE au chat "wolves" de son ex-meute pendant les nuits
--     suivantes — jamais en écriture, jamais pour un autre camp. Implémenté
--     dans can_read_channel, sans toucher can_access_channel (qui décide qui
--     peut ÉCRIRE, inchangée).
--   - Dernier Souffle (key = 'dernier_souffle') : un joueur éliminé peut
--     envoyer UN message au salon "village", visible de tous, juste après sa
--     propre élimination — nouvelle fonction send_last_words, jamais via
--     send_chat_message (qui continue de bloquer tout envoi d'un mort vers
--     "village", inchangée). Un seul envoi par partie (game_artifact_uses).
--
-- `key` est l'identifiant technique STABLE que le moteur de jeu reconnaît
-- (ci-dessus) — jamais modifiable une fois l'artefact créé (voir
-- admin_upsert_store_artifact), pour ne jamais casser silencieusement l'effet
-- en jeu d'un artefact existant. Un admin peut créer d'autres artefacts
-- depuis le dashboard, mais seuls ceux dont le `key` est reconnu quelque part
-- dans le moteur (comme les deux ci-dessus) ont un effet réel — les autres
-- restent de simples entrées de catalogue tant qu'aucune migration ne leur
-- donne un comportement, exactement comme quest_templates.condition_key
-- (migration 0112) le documente déjà pour les quêtes.
--
-- Achat permanent (pas de consommable/quantité) : une fois achetée, une ligne
-- dans player_artifacts suffit à posséder l'artefact pour toujours, dans
-- toutes les parties futures — same convention que les icônes d'avatar
-- débloquées par palier (migration 0074), sauf qu'ici l'acquisition est un
-- achat explicite, donc un vrai ledger plutôt qu'un simple seuil calculé.
-- game_artifact_uses ne sert qu'aux effets à usage limité PAR PARTIE (Dernier
-- Souffle : un envoi par partie, pas par compte).
-- ============================================================================
set search_path = public;

-- ----------------------------------------------------------------------------
-- 1. Tables. Pas de RLS ni de grant direct : accès en lecture/écriture
-- exclusivement via les fonctions security definer ci-dessous — même
-- convention que quest_templates/quest_progress/quest_game_sync (0112) et
-- loup_coins_transactions (0147).
-- ----------------------------------------------------------------------------
create table if not exists public.store_artifacts (
  id uuid primary key default gen_random_uuid(),
  key text not null unique,
  name_fr text not null,
  name_en text not null,
  description_fr text not null,
  description_en text not null,
  price_coins int not null default 0 check (price_coins >= 0),
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.player_artifacts (
  user_id uuid not null references public.profiles (id) on delete cascade,
  artifact_id uuid not null references public.store_artifacts (id) on delete cascade,
  purchased_at timestamptz not null default now(),
  primary key (user_id, artifact_id)
);

create table if not exists public.game_artifact_uses (
  game_id uuid not null references public.games (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  artifact_id uuid not null references public.store_artifacts (id) on delete cascade,
  used_at timestamptz not null default now(),
  primary key (game_id, user_id, artifact_id)
);

insert into public.store_artifacts (key, name_fr, name_en, description_fr, description_en, price_coins, active) values
  (
    'parchemin_griot',
    'Parchemin du Griot',
    'Griot''s Scroll',
    'Une fois éliminé, continue de suivre les messages de ton ancienne meute de Loups pendant les nuits suivantes.',
    'Once eliminated, keep following your former wolf pack''s messages during the following nights.',
    40,
    true
  ),
  (
    'dernier_souffle',
    'Dernier Souffle',
    'Last Breath',
    'Envoie un ultime message à tout le village, visible de tous, juste après ton élimination (une fois par partie).',
    'Send one final message to the whole village, visible to everyone, right after your elimination (once per game).',
    60,
    true
  )
on conflict (key) do nothing;

-- ----------------------------------------------------------------------------
-- 2. Boutique côté joueur.
-- ----------------------------------------------------------------------------
create or replace function public.get_store_artifacts()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
begin
  if v_user is null then
    raise exception 'Non authentifié.';
  end if;

  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', sa.id,
      'name_fr', sa.name_fr, 'name_en', sa.name_en,
      'description_fr', sa.description_fr, 'description_en', sa.description_en,
      'price_coins', sa.price_coins,
      'owned', exists (
        select 1 from public.player_artifacts pa where pa.user_id = v_user and pa.artifact_id = sa.id
      )
    ) order by sa.price_coins asc)
    from public.store_artifacts sa
    where sa.active = true
  ), '[]'::jsonb);
end;
$$;

grant execute on function public.get_store_artifacts() to authenticated;

create or replace function public.purchase_artifact(p_artifact_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_price int;
  v_name_fr text;
  v_active boolean;
  v_balance bigint;
  v_new_balance bigint;
begin
  if v_user is null then
    raise exception 'Non authentifié.';
  end if;

  select price_coins, name_fr, active into v_price, v_name_fr, v_active
    from public.store_artifacts where id = p_artifact_id
    for update;

  if not found or not v_active then
    raise exception 'Cet artefact n''est pas disponible.';
  end if;

  if exists (select 1 from public.player_artifacts where user_id = v_user and artifact_id = p_artifact_id) then
    raise exception 'Vous possédez déjà cet artefact.';
  end if;

  select loup_coins into v_balance from public.profiles where id = v_user for update;
  if coalesce(v_balance, 0) < v_price then
    raise exception 'Solde de Loup Coins insuffisant.';
  end if;

  update public.profiles set loup_coins = loup_coins - v_price where id = v_user
    returning loup_coins into v_new_balance;

  insert into public.player_artifacts (user_id, artifact_id) values (v_user, p_artifact_id);

  insert into public.loup_coins_transactions (user_id, amount, reason, label)
  values (v_user, -v_price, 'store_purchase', v_name_fr);

  return jsonb_build_object('artifact_id', p_artifact_id, 'new_balance', v_new_balance);
end;
$$;

grant execute on function public.purchase_artifact(uuid) to authenticated;

-- ----------------------------------------------------------------------------
-- 3. Administration du catalogue (onglet "Artefacts" du dashboard admin) —
-- même patron que admin_list_quest_templates/admin_upsert_quest_template
-- (migration 0112/0146).
-- ----------------------------------------------------------------------------
create or replace function public.admin_list_store_artifacts()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_admin uuid := auth.uid();
begin
  if not public.is_admin_user(v_admin) then
    raise exception 'Accès refusé.';
  end if;

  return coalesce((
    select jsonb_agg(row_to_json(sa) order by sa.created_at desc) from public.store_artifacts sa
  ), '[]'::jsonb);
end;
$$;

grant execute on function public.admin_list_store_artifacts() to authenticated;

create or replace function public.admin_upsert_store_artifact(
  p_id uuid,
  p_key text,
  p_name_fr text,
  p_name_en text,
  p_description_fr text,
  p_description_en text,
  p_price_coins int,
  p_active boolean
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_admin uuid := auth.uid();
  v_id uuid;
begin
  if not public.is_admin_user(v_admin) then
    raise exception 'Accès refusé.';
  end if;

  if p_name_fr is null or length(trim(p_name_fr)) = 0 or p_name_en is null or length(trim(p_name_en)) = 0 then
    raise exception 'Nom requis (FR et EN).';
  end if;
  if p_description_fr is null or length(trim(p_description_fr)) = 0 or p_description_en is null or length(trim(p_description_en)) = 0 then
    raise exception 'Description requise (FR et EN).';
  end if;
  if coalesce(p_price_coins, -1) < 0 then
    raise exception 'Le prix ne peut pas être négatif.';
  end if;

  if p_id is null then
    if p_key is null or p_key !~ '^[a-z0-9_]+$' then
      raise exception 'Identifiant technique invalide (minuscules, chiffres, underscore uniquement).';
    end if;
    if exists (select 1 from public.store_artifacts where key = p_key) then
      raise exception 'Cet identifiant technique est déjà utilisé.';
    end if;

    insert into public.store_artifacts (key, name_fr, name_en, description_fr, description_en, price_coins, active)
    values (p_key, trim(p_name_fr), trim(p_name_en), trim(p_description_fr), trim(p_description_en), p_price_coins, coalesce(p_active, true))
    returning id into v_id;

    insert into public.admin_audit_log (admin_id, action, target, details)
    values (v_admin, 'create_store_artifact', v_id::text, jsonb_build_object('key', p_key, 'name_fr', p_name_fr));
  else
    -- `key` n'est jamais modifié ici, quoi que le client envoie dans
    -- p_key : c'est l'identifiant que le moteur de jeu reconnaît
    -- (can_read_channel, send_last_words) — le changer casserait
    -- silencieusement l'effet en jeu d'un artefact existant.
    update public.store_artifacts
    set name_fr = trim(p_name_fr),
        name_en = trim(p_name_en),
        description_fr = trim(p_description_fr),
        description_en = trim(p_description_en),
        price_coins = p_price_coins,
        active = coalesce(p_active, true)
    where id = p_id
    returning id into v_id;

    if v_id is null then
      raise exception 'Artefact introuvable.';
    end if;

    insert into public.admin_audit_log (admin_id, action, target, details)
    values (v_admin, 'update_store_artifact', v_id::text, jsonb_build_object('name_fr', p_name_fr));
  end if;

  return v_id;
end;
$$;

grant execute on function public.admin_upsert_store_artifact(uuid, text, text, text, text, text, int, boolean) to authenticated;

create or replace function public.admin_delete_store_artifact(p_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_admin uuid := auth.uid();
begin
  if not public.is_admin_user(v_admin) then
    raise exception 'Accès refusé.';
  end if;

  delete from public.store_artifacts where id = p_id;

  insert into public.admin_audit_log (admin_id, action, target, details)
  values (v_admin, 'delete_store_artifact', p_id::text, null);
end;
$$;

grant execute on function public.admin_delete_store_artifact(uuid) to authenticated;

-- ----------------------------------------------------------------------------
-- 4. Parchemin du Griot : can_read_channel réécrite pour ajouter l'exception
-- lecture-seule des loups éliminés qui possèdent l'artefact. Corrige au
-- passage un oubli pré-existant : la liste de rôles autorisés à LIRE le
-- salon "wolves" (0140) n'incluait pas 'grand_mechant_loup', contrairement à
-- can_access_channel (écriture, 0121) qui l'incluait déjà — un Grand Méchant
-- Loup vivant pouvait donc écrire dans le chat des loups mais pas relire ses
-- propres messages après un rechargement de page.
-- ----------------------------------------------------------------------------
create or replace function public.can_read_channel(p_game_id uuid, p_channel text)
returns boolean
language plpgsql
stable security definer
set search_path = public
as $$
declare
  v_status text;
  v_alive boolean;
  v_role text;
begin
  select status into v_status from public.games where id = p_game_id;
  if v_status is null then return false; end if;

  select is_alive into v_alive from public.game_players where game_id = p_game_id and user_id = auth.uid();
  if v_alive is null then
    -- Pas participant de la partie : peut-être un spectateur avec une
    -- demande de rejoindre en attente (voir get_spectator_game_view) —
    -- mêmes salons qu'un fantôme, en lecture seule uniquement.
    if p_channel in ('village', 'graveyard') and exists (
      select 1 from public.game_join_requests
      where game_id = p_game_id and user_id = auth.uid() and status = 'pending'
    ) then
      return true;
    end if;
    return false;
  end if;

  if p_channel = 'graveyard' then
    return not v_alive;
  end if;

  if p_channel = 'village' then
    if v_alive then
      return v_status in ('day_reveal', 'day_discussion', 'day_vote', 'night');
    else
      return true;
    end if;
  end if;

  if p_channel = 'wolves' then
    if v_status <> 'night' then
      return false;
    end if;
    select role into v_role from public.game_roles_secret where game_id = p_game_id and user_id = auth.uid();
    if v_alive then
      return v_role in ('loup_garou', 'loup_alpha', 'sans_visage', 'grand_mechant_loup');
    end if;
    return v_role in ('loup_garou', 'loup_alpha', 'sans_visage', 'grand_mechant_loup')
      and exists (
        select 1 from public.player_artifacts pa
        join public.store_artifacts sa on sa.id = pa.artifact_id
        where pa.user_id = auth.uid() and sa.key = 'parchemin_griot'
      );
  end if;

  return false;
end;
$$;

grant execute on function public.can_read_channel(uuid, text) to authenticated;

-- ----------------------------------------------------------------------------
-- 5. Dernier Souffle : nouvelle colonne pour distinguer ce message côté
-- client (habillage "fantôme" dans ChatPanel.tsx), et la fonction dédiée qui
-- l'envoie — jamais via send_chat_message, qui continue d'exiger v_alive
-- pour le salon "village" (can_access_channel, inchangée) : un mort ne peut
-- toujours pas y écrire par le chemin normal, seulement par celui-ci, une
-- fois par partie.
-- ----------------------------------------------------------------------------
alter table public.chat_messages add column if not exists is_last_words boolean not null default false;

create or replace function public.send_last_words(p_game_id uuid, p_content text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_content text := trim(p_content);
  v_alive boolean;
  v_name text;
  v_artifact_id uuid;
begin
  if v_content = '' then
    return;
  end if;
  if char_length(v_content) > 500 then
    v_content := left(v_content, 500);
  end if;

  select is_alive into v_alive from public.game_players where game_id = p_game_id and user_id = v_user;
  if v_alive is null then
    raise exception 'Vous ne participez pas à cette partie.';
  end if;
  if v_alive then
    raise exception 'Réservé aux joueurs éliminés.';
  end if;

  select sa.id into v_artifact_id
    from public.store_artifacts sa
    join public.player_artifacts pa on pa.artifact_id = sa.id and pa.user_id = v_user
    where sa.key = 'dernier_souffle';

  if v_artifact_id is null then
    raise exception 'Vous ne possédez pas cet artefact.';
  end if;

  if exists (
    select 1 from public.game_artifact_uses
    where game_id = p_game_id and user_id = v_user and artifact_id = v_artifact_id
  ) then
    raise exception 'Déjà utilisé dans cette partie.';
  end if;

  insert into public.game_artifact_uses (game_id, user_id, artifact_id) values (p_game_id, v_user, v_artifact_id);

  select display_name into v_name from public.game_players where game_id = p_game_id and user_id = v_user;
  v_name := coalesce(v_name, 'Joueur');

  insert into public.chat_messages (game_id, channel, user_id, display_name, content, is_anonymous, is_last_words)
  values (p_game_id, 'village', v_user, v_name, v_content, false, true);
end;
$$;

grant execute on function public.send_last_words(uuid, text) to authenticated;

-- ----------------------------------------------------------------------------
-- 6. get_my_game_view : nouvelle fonction de domaine game_view_artifacts_fields
-- (même patron que les 9 autres, migration 0142), fusionnée dans
-- l'orchestrateur — signature de get_my_game_view inchangée (p_game_id uuid),
-- donc create or replace suffit, pas de drop nécessaire.
-- ----------------------------------------------------------------------------
create or replace function public.game_view_artifacts_fields(p_game_id uuid, p_user uuid)
returns jsonb
language sql
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'my_owns_parchemin_griot', exists (
      select 1 from public.player_artifacts pa
      join public.store_artifacts sa on sa.id = pa.artifact_id
      where pa.user_id = p_user and sa.key = 'parchemin_griot'
    ),

    'my_owns_dernier_souffle', exists (
      select 1 from public.player_artifacts pa
      join public.store_artifacts sa on sa.id = pa.artifact_id
      where pa.user_id = p_user and sa.key = 'dernier_souffle'
    ),

    'my_dernier_souffle_used', exists (
      select 1 from public.game_artifact_uses gau
      join public.store_artifacts sa on sa.id = gau.artifact_id
      where gau.game_id = p_game_id and gau.user_id = p_user and sa.key = 'dernier_souffle'
    )
  );
$$;

create or replace function public.get_my_game_view(p_game_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $function$
declare
  v_user uuid := auth.uid();
  v_game public.games%rowtype;
  v_my_role text;
  v_my_alive boolean;
  v_lover_id uuid;
  v_wild_child_mentor uuid;
  v_my_muted_until int;
  v_result jsonb;
begin
  if not exists (select 1 from public.game_players where game_id = p_game_id and user_id = v_user) then
    raise exception 'Vous ne participez pas à cette partie.';
  end if;

  select * into v_game from public.games where id = p_game_id;

  if v_game.status <> 'ended' and v_game.last_activity_at < now() - interval '2 hours' then
    update public.games set status = 'ended' where id = p_game_id;
    insert into public.game_log (game_id, message)
    values (p_game_id, 'La partie a été fermée automatiquement après 2h d''inactivité.');
    v_game.status := 'ended';
  end if;

  select role into v_my_role from public.game_roles_secret where game_id = p_game_id and user_id = v_user;
  select is_alive into v_my_alive from public.game_players where game_id = p_game_id and user_id = v_user;
  select lover_with, wild_child_mentor, village_muted_until_night into v_lover_id, v_wild_child_mentor, v_my_muted_until
  from public.game_roles_secret where game_id = p_game_id and user_id = v_user;

  select (
    jsonb_build_object(
      'game', to_jsonb(v_game) - 'thief_extra_roles',

      'players', coalesce((
        select jsonb_agg(
          to_jsonb(gp) || jsonb_build_object('rank_tier', public.rank_tier_for_points(coalesce(pr.rank_points, 0)))
          order by gp.seat_number
        )
        from public.game_players gp
        left join public.profiles pr on pr.id = gp.user_id
        where gp.game_id = p_game_id
      ), '[]'::jsonb),

      'my_role', v_my_role,
      'my_alive', coalesce(v_my_alive, false),
      'lover_id', v_lover_id,
      'wild_child_mentor', v_wild_child_mentor,

      'village_muted', coalesce(v_my_muted_until = v_game.night_number, false),

      'log', coalesce((
        select jsonb_agg(jsonb_build_object('id', id, 'message', message, 'created_at', created_at) order by created_at desc)
        from (
          select id, message, created_at from public.game_log
          where game_id = p_game_id order by created_at desc limit 60
        ) recent
      ), '[]'::jsonb)
    )
    || public.game_view_witch_fields(p_game_id, v_game, v_user, v_my_role)
    || public.game_view_wolf_pack_fields(p_game_id, v_game, v_user, v_my_role)
    || public.game_view_thief_fields(p_game_id, v_user)
    || public.game_view_wild_child_fields(p_game_id, v_game, v_user)
    || public.game_view_seer_griot_fields(p_game_id, v_user, v_my_role)
    || public.game_view_anancy_fields(p_game_id, v_game, v_user, v_my_role)
    || public.game_view_vote_fields(p_game_id, v_game, v_user, v_my_role, v_my_alive)
    || public.game_view_lobby_fields(p_game_id, v_game, v_user)
    || public.game_view_progression_fields(p_game_id, v_game, v_user, v_my_role, v_my_alive)
    || public.game_view_artifacts_fields(p_game_id, v_user)
  ) into v_result;

  return v_result;
end;
$function$;

grant execute on function public.get_my_game_view(uuid) to authenticated;
