-- ============================================================================
-- Quêtes quotidiennes : 3 objectifs assignés au hasard chaque jour parmi un
-- catalogue GÉRÉ PAR L'ADMIN (quest_templates, onglet "Quêtes" du dashboard
-- admin) — plutôt qu'un catalogue en dur comme RANK_TIERS/
-- AVATAR_ICON_MIN_POINTS, pour permettre d'ajuster texte/objectif/
-- récompense/activation sans déploiement de code, à la manière du système
-- d'événements déjà en place (admin_upsert_event, migration 0067).
--
-- Limite assumée : `condition_key` reste un ensemble FERMÉ de 5 conditions
-- (voir la contrainte CHECK ci-dessous), chacune correspondant à un bloc de
-- code précis dans sync_daily_quests_for_game — l'admin choisit parmi ces
-- 5 conditions, il ne peut pas en inventer une sixième sans une nouvelle
-- migration. Un moteur de règles totalement générique (conditions
-- arbitraires définies en base) serait un chantier bien plus lourd pour un
-- bénéfice marginal ici.
--
-- Récompense/objectif/texte NON figés au moment de l'assignation (pas de
-- copie sur quest_progress) : get_my_quests fait une jointure live vers
-- quest_templates à chaque appel. Un ajustement admin en cours de journée
-- s'applique donc immédiatement, y compris à une quête déjà assignée mais
-- pas encore réclamée — acceptable pour un jeu entre amis, pas un service
-- monétisé à grande échelle où la copie figée serait justifiée.
--
-- Toujours sans tâche planifiée (cron) : assignation paresseuse au premier
-- appel de la journée, même principe que claim_daily_login (migration
-- 0110). Toujours sans instrumentation du moteur de nuit/vote : la
-- progression est calculée une seule fois, à la fin de partie, dans
-- sync_daily_quests_for_game — le moteur de jeu n'est touché nulle part.
-- ============================================================================
set search_path = public;

create table if not exists public.quest_templates (
  id uuid primary key default gen_random_uuid(),
  condition_key text not null check (condition_key in ('games_played', 'games_won', 'survived', 'won_as_wolf', 'won_as_village')),
  label_fr text not null,
  label_en text not null,
  target int not null default 1 check (target > 0),
  reward_points int not null default 5 check (reward_points >= 0),
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.quest_progress (
  user_id uuid not null references public.profiles (id) on delete cascade,
  quest_date date not null,
  template_id uuid not null references public.quest_templates (id) on delete cascade,
  progress int not null default 0,
  claimed_at timestamptz,
  primary key (user_id, quest_date, template_id)
);

create table if not exists public.quest_game_sync (
  user_id uuid not null references public.profiles (id) on delete cascade,
  game_id uuid not null references public.games (id) on delete cascade,
  primary key (user_id, game_id)
);

-- Catalogue de départ, pour que le pool ne soit jamais vide à la première
-- exécution — l'admin peut ensuite tout modifier depuis le dashboard.
insert into public.quest_templates (condition_key, label_fr, label_en, target, reward_points) values
  ('games_played', 'Joue une partie', 'Play a game', 1, 3),
  ('games_played', 'Joue 3 parties', 'Play 3 games', 3, 8),
  ('games_won', 'Gagne une partie', 'Win a game', 1, 6),
  ('survived', 'Survis jusqu''à la fin d''une partie', 'Survive to the end of a game', 1, 5),
  ('won_as_wolf', 'Gagne en tant que Loup', 'Win as a Werewolf', 1, 8),
  ('won_as_village', 'Gagne en tant que Villageois', 'Win as a Villager', 1, 8)
on conflict do nothing;

-- ----------------------------------------------------------------------------
-- ensure_daily_quests : assigne 3 quêtes au hasard (parmi les templates
-- actifs) pour (p_user, p_date) si ce n'est pas déjà fait. Interne, jamais
-- exposée directement au client.
-- ----------------------------------------------------------------------------
create or replace function public.ensure_daily_quests(p_user uuid, p_date date)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if exists (select 1 from public.quest_progress where user_id = p_user and quest_date = p_date) then
    return;
  end if;

  insert into public.quest_progress (user_id, quest_date, template_id)
  select p_user, p_date, id
  from public.quest_templates
  where active = true
  order by random()
  limit 3
  on conflict (user_id, quest_date, template_id) do nothing;
end;
$$;

-- ----------------------------------------------------------------------------
-- get_my_quests : appelée par le tableau de bord — assigne les quêtes du
-- jour si besoin, renvoie leur état actuel (jointure live vers
-- quest_templates, voir note en tête de fichier).
-- ----------------------------------------------------------------------------
create or replace function public.get_my_quests()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_today date := current_date;
begin
  if v_user is null then
    raise exception 'Non authentifié.';
  end if;

  perform public.ensure_daily_quests(v_user, v_today);

  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'template_id', qp.template_id,
      'label_fr', qt.label_fr, 'label_en', qt.label_en,
      'progress', qp.progress, 'target', qt.target,
      'reward_points', qt.reward_points, 'claimed_at', qp.claimed_at
    ) order by qt.reward_points asc)
    from public.quest_progress qp
    join public.quest_templates qt on qt.id = qp.template_id
    where qp.user_id = v_user and qp.quest_date = v_today
  ), '[]'::jsonb);
end;
$$;

grant execute on function public.get_my_quests() to authenticated;

-- ----------------------------------------------------------------------------
-- sync_daily_quests_for_game : appelée depuis EndScreen, une fois la partie
-- terminée. Ré-vérifie tout côté serveur comme claim_end_of_game_reward
-- (migration 0111) — jamais confiance dans p_game_id seul.
-- ----------------------------------------------------------------------------
create or replace function public.sync_daily_quests_for_game(p_game_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_today date := current_date;
  v_game_status text;
  v_won boolean;
  v_alive boolean;
  v_role text;
begin
  if v_user is null then
    raise exception 'Non authentifié.';
  end if;

  select status into v_game_status from public.games where id = p_game_id;
  if v_game_status is distinct from 'ended' then
    raise exception 'Cette partie n''est pas encore terminée.';
  end if;

  if not exists (select 1 from public.game_players where game_id = p_game_id and user_id = v_user) then
    raise exception 'Vous n''avez pas participé à cette partie.';
  end if;

  perform public.ensure_daily_quests(v_user, v_today);

  if exists (select 1 from public.quest_game_sync where user_id = v_user and game_id = p_game_id) then
    return public.get_my_quests();
  end if;
  insert into public.quest_game_sync (user_id, game_id) values (v_user, p_game_id);

  select won into v_won from public.game_results
    where game_id = p_game_id and user_id = v_user
    order by created_at desc limit 1;
  select is_alive into v_alive from public.game_players where game_id = p_game_id and user_id = v_user;
  select role into v_role from public.game_roles_secret where game_id = p_game_id and user_id = v_user;

  -- role in ('loup_garou', 'loup_alpha') = équipe "loups" — doit rester
  -- synchronisé avec ROLES[].team côté client (src/lib/roles.ts), même
  -- duplication assumée que partout ailleurs dans ce projet pour ce
  -- distingo précis (voir migration 0091, 0100, 0102...).
  update public.quest_progress qp
  set progress = least(qp.progress + 1, qt.target)
  from public.quest_templates qt
  where qp.template_id = qt.id
    and qp.user_id = v_user and qp.quest_date = v_today and qp.claimed_at is null and qp.progress < qt.target
    and (
      qt.condition_key = 'games_played'
      or (qt.condition_key = 'games_won' and coalesce(v_won, false))
      or (qt.condition_key = 'survived' and coalesce(v_alive, false))
      or (qt.condition_key = 'won_as_wolf' and coalesce(v_won, false) and v_role in ('loup_garou', 'loup_alpha'))
      or (qt.condition_key = 'won_as_village' and coalesce(v_won, false) and v_role is not null and v_role not in ('loup_garou', 'loup_alpha'))
    );

  return public.get_my_quests();
end;
$$;

grant execute on function public.sync_daily_quests_for_game(uuid) to authenticated;

-- ----------------------------------------------------------------------------
-- claim_quest_reward : réclame la récompense d'une quête terminée du jour.
-- ----------------------------------------------------------------------------
create or replace function public.claim_quest_reward(p_template_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_today date := current_date;
  v_progress int;
  v_target int;
  v_reward int;
  v_claimed timestamptz;
  v_new_rank_points int;
begin
  if v_user is null then
    raise exception 'Non authentifié.';
  end if;

  select qp.progress, qt.target, qt.reward_points, qp.claimed_at
    into v_progress, v_target, v_reward, v_claimed
    from public.quest_progress qp
    join public.quest_templates qt on qt.id = qp.template_id
    where qp.user_id = v_user and qp.quest_date = v_today and qp.template_id = p_template_id
    for update of qp;

  if not found then
    raise exception 'Quête introuvable pour aujourd''hui.';
  end if;

  if v_claimed is not null then
    raise exception 'Récompense déjà réclamée.';
  end if;

  if v_progress < v_target then
    raise exception 'Quête pas encore terminée.';
  end if;

  update public.quest_progress set claimed_at = now()
    where user_id = v_user and quest_date = v_today and template_id = p_template_id;

  update public.profiles set rank_points = rank_points + v_reward
    where id = v_user
    returning rank_points into v_new_rank_points;

  return jsonb_build_object('reward_points', v_reward, 'new_rank_points', v_new_rank_points);
end;
$$;

grant execute on function public.claim_quest_reward(uuid) to authenticated;

-- ----------------------------------------------------------------------------
-- Administration du catalogue (onglet "Quêtes" du dashboard admin) — mêmes
-- conventions que admin_list_events/admin_upsert_event/admin_delete_event
-- (migration 0067) : upsert unique (p_id null = création), journalisation
-- dans admin_audit_log.
-- ----------------------------------------------------------------------------
create or replace function public.admin_list_quest_templates()
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
    select jsonb_agg(row_to_json(qt) order by qt.created_at desc) from public.quest_templates qt
  ), '[]'::jsonb);
end;
$$;

grant execute on function public.admin_list_quest_templates() to authenticated;

create or replace function public.admin_upsert_quest_template(
  p_id uuid,
  p_condition_key text,
  p_label_fr text,
  p_label_en text,
  p_target int,
  p_reward_points int,
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
  if p_condition_key not in ('games_played', 'games_won', 'survived', 'won_as_wolf', 'won_as_village') then
    raise exception 'Condition invalide.';
  end if;
  if p_label_fr is null or length(trim(p_label_fr)) = 0 or p_label_en is null or length(trim(p_label_en)) = 0 then
    raise exception 'Texte (FR et EN) requis.';
  end if;
  if coalesce(p_target, 0) <= 0 then
    raise exception 'L''objectif doit être supérieur à 0.';
  end if;
  if coalesce(p_reward_points, -1) < 0 then
    raise exception 'La récompense ne peut pas être négative.';
  end if;

  if p_id is null then
    insert into public.quest_templates (condition_key, label_fr, label_en, target, reward_points, active)
    values (p_condition_key, trim(p_label_fr), trim(p_label_en), p_target, p_reward_points, coalesce(p_active, true))
    returning id into v_id;

    insert into public.admin_audit_log (admin_id, action, target, details)
    values (v_admin, 'create_quest_template', v_id::text, jsonb_build_object('label_fr', p_label_fr));
  else
    update public.quest_templates
    set condition_key = p_condition_key,
        label_fr = trim(p_label_fr),
        label_en = trim(p_label_en),
        target = p_target,
        reward_points = p_reward_points,
        active = coalesce(p_active, true)
    where id = p_id
    returning id into v_id;

    if v_id is null then
      raise exception 'Quête introuvable.';
    end if;

    insert into public.admin_audit_log (admin_id, action, target, details)
    values (v_admin, 'update_quest_template', v_id::text, jsonb_build_object('label_fr', p_label_fr));
  end if;

  return v_id;
end;
$$;

grant execute on function public.admin_upsert_quest_template(uuid, text, text, text, int, int, boolean) to authenticated;

create or replace function public.admin_delete_quest_template(p_id uuid)
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

  delete from public.quest_templates where id = p_id;

  insert into public.admin_audit_log (admin_id, action, target, details)
  values (v_admin, 'delete_quest_template', p_id::text, null);
end;
$$;

grant execute on function public.admin_delete_quest_template(uuid) to authenticated;
