-- ============================================================================
-- Introduit les "Loup Coins" : une monnaie dédiée, gagnée exclusivement via
-- les quêtes quotidiennes (voir migration 0112/0136) — remplace les points
-- de rang que claim_quest_reward accordait jusqu'ici. Le rang (rank_points,
-- voir migration 0055) reste inchangé et continue de venir uniquement des
-- victoires/de l'impact en partie (apply_rank_updates_for_game) : les deux
-- économies sont désormais complètement séparées, jamais mélangées.
--
-- Profite de l'occasion pour enrichir le système de quêtes côté admin
-- (demande explicite) :
--   1. Rareté/poids par quête (`weight`) : tirage pondéré au lieu d'un tirage
--      uniforme parmi les quêtes actives — une quête à poids plus élevé a
--      plus de chances d'être choisie chaque jour, sans jamais être garantie.
--   2. Trois nouveaux types de condition, en plus des 5 déjà existants
--      (l'ensemble reste fermé — même limite assumée qu'en 0112, une
--      nouvelle condition demande toujours une migration) :
--        - played_as_role  : jouer une partie avec un rôle précis
--        - won_as_role     : gagner une partie avec un rôle précis
--        - win_streak_reached : atteindre une série de victoires d'affilée
--      Les deux premières utilisent la nouvelle colonne `condition_role`
--      (id de rôle, voir src/lib/roles.ts) — NULL pour toutes les autres
--      conditions, validé dans admin_upsert_quest_template.
-- ============================================================================
set search_path = public;

-- ----------------------------------------------------------------------------
-- 1. La monnaie elle-même.
-- ----------------------------------------------------------------------------
alter table public.profiles add column if not exists loup_coins bigint not null default 0 check (loup_coins >= 0);

-- ----------------------------------------------------------------------------
-- 2. Catalogue de quêtes : renommage + nouvelles colonnes.
-- ----------------------------------------------------------------------------
alter table public.quest_templates rename column reward_points to reward_coins;

alter table public.quest_templates add column if not exists weight int not null default 1 check (weight > 0);
alter table public.quest_templates add column if not exists condition_role text;

alter table public.quest_templates drop constraint if exists quest_templates_condition_key_check;
alter table public.quest_templates add constraint quest_templates_condition_key_check
  check (condition_key in (
    'games_played', 'games_won', 'survived', 'won_as_wolf', 'won_as_village',
    'played_as_role', 'won_as_role', 'win_streak_reached'
  ));

-- ----------------------------------------------------------------------------
-- ensure_daily_quests : tirage désormais PONDÉRÉ par `weight` plutôt
-- qu'uniforme. Algorithme d'Efraimidis-Spirakis (tirage pondéré sans remise
-- via une clé aléatoire) : chaque quête active reçoit la clé
-- random()^(1/weight), on garde les 3 plus grandes — un poids plus élevé
-- augmente la probabilité d'être choisie un jour donné, sans jamais figer le
-- même trio pour un catalogue donné (contrairement à un simple tri par
-- poids).
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
  order by power(random(), 1.0::double precision / weight) desc
  limit 3
  on conflict (user_id, quest_date, template_id) do nothing;
end;
$$;

-- ----------------------------------------------------------------------------
-- get_my_quests : reward_coins au lieu de reward_points, sinon inchangée.
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
      'reward_coins', qt.reward_coins, 'claimed_at', qp.claimed_at
    ) order by qt.reward_coins asc)
    from public.quest_progress qp
    join public.quest_templates qt on qt.id = qp.template_id
    where qp.user_id = v_user and qp.quest_date = v_today
  ), '[]'::jsonb);
end;
$$;

-- ----------------------------------------------------------------------------
-- sync_daily_quests_for_game (chemin client, voir migration 0136 — surtout
-- un no-op idempotent aujourd'hui, le chemin serveur ci-dessous fait le
-- vrai travail) et sync_daily_quests_for_all_players (chemin serveur,
-- appelé depuis check_and_apply_win/ange/anancy_win) : mêmes 3 nouvelles
-- conditions ajoutées aux deux, pour qu'ils restent parfaitement équivalents
-- quel que soit celui qui gagne la course sur quest_game_sync. Profite de
-- l'occasion pour aligner la liste des rôles loups de
-- sync_daily_quests_for_game (encore 'loup_garou'/'loup_alpha' seulement,
-- oubliée lors de l'ajout de sans_visage/grand_mechant_loup) sur celle,
-- déjà correcte, de sync_daily_quests_for_all_players.
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
  v_streak int;
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
  select current_streak into v_streak from public.profiles where id = v_user;

  update public.quest_progress qp
  set progress = case
      when qt.condition_key = 'win_streak_reached' then greatest(qp.progress, least(coalesce(v_streak, 0), qt.target))
      else least(qp.progress + 1, qt.target)
    end
  from public.quest_templates qt
  where qp.template_id = qt.id
    and qp.user_id = v_user and qp.quest_date = v_today and qp.claimed_at is null and qp.progress < qt.target
    and (
      qt.condition_key = 'games_played'
      or (qt.condition_key = 'games_won' and coalesce(v_won, false))
      or (qt.condition_key = 'survived' and coalesce(v_alive, false))
      or (qt.condition_key = 'won_as_wolf' and coalesce(v_won, false) and v_role in ('loup_garou', 'loup_alpha', 'sans_visage', 'grand_mechant_loup'))
      or (qt.condition_key = 'won_as_village' and coalesce(v_won, false) and v_role is not null and v_role not in ('loup_garou', 'loup_alpha', 'sans_visage', 'grand_mechant_loup', 'anancy', 'ange'))
      or (qt.condition_key = 'played_as_role' and v_role = qt.condition_role)
      or (qt.condition_key = 'won_as_role' and coalesce(v_won, false) and v_role = qt.condition_role)
      or (qt.condition_key = 'win_streak_reached')
    );

  return public.get_my_quests();
end;
$$;

create or replace function public.sync_daily_quests_for_all_players(p_game_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  r record;
  v_today date := current_date;
begin
  for r in
    select gp.user_id, gp.is_alive, rs.role, gr.won, p.current_streak
    from public.game_players gp
    join public.profiles p on p.id = gp.user_id and not p.is_bot
    left join public.game_roles_secret rs on rs.game_id = gp.game_id and rs.user_id = gp.user_id
    left join public.game_results gr on gr.game_id = gp.game_id and gr.user_id = gp.user_id
    where gp.game_id = p_game_id
  loop
    perform public.ensure_daily_quests(r.user_id, v_today);

    if exists (select 1 from public.quest_game_sync where user_id = r.user_id and game_id = p_game_id) then
      continue;
    end if;
    insert into public.quest_game_sync (user_id, game_id) values (r.user_id, p_game_id);

    update public.quest_progress qp
    set progress = case
        when qt.condition_key = 'win_streak_reached' then greatest(qp.progress, least(coalesce(r.current_streak, 0), qt.target))
        else least(qp.progress + 1, qt.target)
      end
    from public.quest_templates qt
    where qp.template_id = qt.id
      and qp.user_id = r.user_id and qp.quest_date = v_today and qp.claimed_at is null and qp.progress < qt.target
      and (
        qt.condition_key = 'games_played'
        or (qt.condition_key = 'games_won' and coalesce(r.won, false))
        or (qt.condition_key = 'survived' and coalesce(r.is_alive, false))
        or (qt.condition_key = 'won_as_wolf' and coalesce(r.won, false) and r.role in ('loup_garou', 'loup_alpha', 'sans_visage', 'grand_mechant_loup'))
        or (qt.condition_key = 'won_as_village' and coalesce(r.won, false) and r.role is not null and r.role not in ('loup_garou', 'loup_alpha', 'sans_visage', 'grand_mechant_loup', 'anancy', 'ange'))
        or (qt.condition_key = 'played_as_role' and r.role = qt.condition_role)
        or (qt.condition_key = 'won_as_role' and coalesce(r.won, false) and r.role = qt.condition_role)
        or (qt.condition_key = 'win_streak_reached')
      );
  end loop;
end;
$$;

-- ----------------------------------------------------------------------------
-- claim_quest_reward : crédite désormais loup_coins, plus rank_points.
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
  v_new_loup_coins bigint;
begin
  if v_user is null then
    raise exception 'Non authentifié.';
  end if;

  select qp.progress, qt.target, qt.reward_coins, qp.claimed_at
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

  update public.profiles set loup_coins = loup_coins + v_reward
    where id = v_user
    returning loup_coins into v_new_loup_coins;

  return jsonb_build_object('reward_coins', v_reward, 'new_loup_coins', v_new_loup_coins);
end;
$$;

-- ----------------------------------------------------------------------------
-- Administration du catalogue : nouvelle signature (condition_role, weight,
-- reward_coins). Le nombre de paramètres change : DROP explicite de
-- l'ancienne signature avant CREATE, sinon Postgres créerait une deuxième
-- surcharge au lieu de remplacer (voir check-rpc-grants.mjs, exactement le
-- genre de piège qu'il détecte).
-- ----------------------------------------------------------------------------
drop function if exists public.admin_upsert_quest_template(uuid, text, text, text, int, int, boolean);

create or replace function public.admin_upsert_quest_template(
  p_id uuid,
  p_condition_key text,
  p_condition_role text,
  p_label_fr text,
  p_label_en text,
  p_target int,
  p_reward_coins int,
  p_weight int,
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
  v_role_condition boolean;
begin
  if not public.is_admin_user(v_admin) then
    raise exception 'Accès refusé.';
  end if;
  if p_condition_key not in (
    'games_played', 'games_won', 'survived', 'won_as_wolf', 'won_as_village',
    'played_as_role', 'won_as_role', 'win_streak_reached'
  ) then
    raise exception 'Condition invalide.';
  end if;

  v_role_condition := p_condition_key in ('played_as_role', 'won_as_role');
  if v_role_condition then
    if p_condition_role is null or p_condition_role not in (
      'villageois', 'loup_garou', 'loup_alpha', 'voyante', 'sorciere', 'chasseur', 'petite_fille',
      'cupidon', 'ancien', 'voleur', 'enfant_sauvage', 'griot', 'sans_visage', 'anancy', 'ange', 'grand_mechant_loup'
    ) then
      raise exception 'Rôle invalide pour cette condition.';
    end if;
  elsif p_condition_role is not null then
    raise exception 'Ce type de condition ne prend pas de rôle.';
  end if;

  if p_label_fr is null or length(trim(p_label_fr)) = 0 or p_label_en is null or length(trim(p_label_en)) = 0 then
    raise exception 'Texte (FR et EN) requis.';
  end if;
  if coalesce(p_target, 0) <= 0 then
    raise exception 'L''objectif doit être supérieur à 0.';
  end if;
  if coalesce(p_reward_coins, -1) < 0 then
    raise exception 'La récompense ne peut pas être négative.';
  end if;
  if coalesce(p_weight, 0) <= 0 then
    raise exception 'Le poids doit être supérieur à 0.';
  end if;

  if p_id is null then
    insert into public.quest_templates (condition_key, condition_role, label_fr, label_en, target, reward_coins, weight, active)
    values (p_condition_key, p_condition_role, trim(p_label_fr), trim(p_label_en), p_target, p_reward_coins, coalesce(p_weight, 1), coalesce(p_active, true))
    returning id into v_id;

    insert into public.admin_audit_log (admin_id, action, target, details)
    values (v_admin, 'create_quest_template', v_id::text, jsonb_build_object('label_fr', p_label_fr));
  else
    update public.quest_templates
    set condition_key = p_condition_key,
        condition_role = p_condition_role,
        label_fr = trim(p_label_fr),
        label_en = trim(p_label_en),
        target = p_target,
        reward_coins = p_reward_coins,
        weight = coalesce(p_weight, 1),
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

grant execute on function public.get_my_quests() to authenticated;
grant execute on function public.sync_daily_quests_for_game(uuid) to authenticated;
grant execute on function public.claim_quest_reward(uuid) to authenticated;
grant execute on function public.admin_upsert_quest_template(uuid, text, text, text, text, int, int, int, boolean) to authenticated;
