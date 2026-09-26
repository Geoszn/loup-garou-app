-- ============================================================================
-- Quêtes journalières : "parfois on reçoit ses Loup Coins, parfois non".
-- Analyse sur la base réelle (26/09/2026) — trois causes distinctes :
--
--   1. CHANGEMENT DE JOUR EN PLEINE SOIRÉE. Le "jour" d'une quête était la date
--      UTC (current_date) : minuit UTC tombe pile au milieu de la période où
--      les joueurs jouent (20h-02h UTC). Exemple relevé : 4 parties d'affilée
--      (23h06, 23h30, 23h46 UTC le 24, puis 00h15 UTC le 25) — les 3 premières
--      comptent pour la journée du 24, la dernière seule pour celle du 25, d'où
--      "Joue 3 parties" bloquée à 1/3. Le même schéma touche Craft, Nocturna,
--      Feodal, Ari, KALLy, Maminou... Vérifié : aucune partie jouée n'est
--      "oubliée" (progression = parties jouées, pour tous, tous les jours).
--      => nouveau helper quest_today() : le jour des quêtes change à 06h00 UTC
--      (heure creuse, hors de la période de jeu) au lieu de minuit. Pour
--      déplacer l'heure de bascule plus tard, il suffit de modifier ce seul
--      intervalle.
--
--   2. RÉCOMPENSES TERMINÉES MAIS PERDUES. claim_quest_reward ne regardait que
--      la journée en cours : une quête terminée (ex. "Joue 3 parties" 3/3) mais
--      non récupérée avant la bascule disparaissait pour toujours (relevé chez
--      Craft, Nocturna, Ben10...). Désormais get_my_quests affiche aussi la
--      récompense terminée de la veille et claim_quest_reward la verse (délai de
--      grâce d'une journée de quêtes, jamais deux fois : claimed_at inchangé).
--
--   3. VICTOIRE CRÉDITÉE D'APRÈS LA MAUVAISE MANCHE. game_results garde une
--      ligne PAR MANCHE quand une partie est relancée dans le même salon, et
--      sync_daily_quests_for_all_players (appelée en fin de partie) joignait
--      toutes ces lignes : la boucle traitait UNE manche au hasard (souvent une
--      ancienne) pour décider si la quête de victoire était remplie. Ne prend
--      plus que la dernière manche, comme le faisait déjà
--      sync_daily_quests_for_game.
--
-- Non traité ici (configuration, pas du code) : la quête "Gagner 10 parties"
-- est configurée avec un objectif de 1 seule victoire pour 120 coins — son nom
-- et son objectif ne correspondent pas ; à corriger depuis le dashboard admin
-- (onglet Quêtes).
-- claim_daily_login (bonus de connexion) garde volontairement la date UTC.
-- ============================================================================
set search_path = public;

-- Jour "des quêtes" : bascule à 06h00 UTC. Réservé aux fonctions du serveur.
create or replace function public.quest_today()
returns date
language sql
stable
as $$
  select ((now() at time zone 'utc') - interval '6 hours')::date;
$$;

revoke execute on function public.quest_today() from public, anon, authenticated;

create or replace function public.get_my_quests()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_today date := public.quest_today();
begin
  if v_user is null then
    raise exception 'Non authentifié.';
  end if;

  perform public.ensure_daily_quests(v_user, v_today);

  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'template_id', q.template_id,
      'label_fr', q.label_fr, 'label_en', q.label_en,
      'progress', q.progress, 'target', q.target,
      'reward_coins', q.reward_coins, 'claimed_at', q.claimed_at
    ) order by q.reward_coins asc)
    from (
      -- Une seule entrée par quête : la récompense terminée mais non récupérée
      -- (la plus ancienne d'abord, hier avant aujourd'hui) l'emporte sur la
      -- version du jour, pour qu'elle reste récupérable après la bascule.
      select distinct on (qp.template_id)
        qp.template_id, qt.label_fr, qt.label_en, qp.progress, qt.target, qt.reward_coins, qp.claimed_at
      from public.quest_progress qp
      join public.quest_templates qt on qt.id = qp.template_id
      where qp.user_id = v_user
        and (
          qp.quest_date = v_today
          or (qp.quest_date = v_today - 1 and qp.claimed_at is null and qp.progress >= qt.target)
        )
      order by qp.template_id,
               (qp.claimed_at is null and qp.progress >= qt.target) desc,
               qp.quest_date asc
    ) q
  ), '[]'::jsonb);
end;
$$;

create or replace function public.claim_quest_reward(p_template_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_today date := public.quest_today();
  v_date date;
  v_progress int;
  v_target int;
  v_reward int;
  v_label_fr text;
  v_new_loup_coins bigint;
begin
  if v_user is null then
    raise exception 'Non authentifié.';
  end if;

  -- La plus ancienne récompense terminée et non récupérée de cette quête,
  -- parmi la journée en cours et la précédente (délai de grâce).
  select qp.quest_date, qp.progress, qt.target, qt.reward_coins, qt.label_fr
    into v_date, v_progress, v_target, v_reward, v_label_fr
    from public.quest_progress qp
    join public.quest_templates qt on qt.id = qp.template_id
    where qp.user_id = v_user and qp.template_id = p_template_id
      and qp.quest_date in (v_today, v_today - 1)
      and qp.claimed_at is null and qp.progress >= qt.target
    order by qp.quest_date asc
    limit 1
    for update of qp;

  if not found then
    if not exists (
      select 1 from public.quest_progress
      where user_id = v_user and template_id = p_template_id and quest_date = v_today
    ) then
      raise exception 'Quête introuvable pour aujourd''hui.';
    end if;
    if exists (
      select 1 from public.quest_progress
      where user_id = v_user and template_id = p_template_id and quest_date = v_today and claimed_at is not null
    ) then
      raise exception 'Récompense déjà réclamée.';
    end if;
    raise exception 'Quête pas encore terminée.';
  end if;

  update public.quest_progress set claimed_at = now()
    where user_id = v_user and quest_date = v_date and template_id = p_template_id;

  update public.profiles set loup_coins = loup_coins + v_reward
    where id = v_user
    returning loup_coins into v_new_loup_coins;

  insert into public.loup_coins_transactions (user_id, amount, reason, label)
  values (v_user, v_reward, 'quest_reward', v_label_fr);

  return jsonb_build_object('reward_coins', v_reward, 'new_loup_coins', v_new_loup_coins);
end;
$$;

create or replace function public.sync_daily_quests_for_game(p_game_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_today date := public.quest_today();
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
  v_today date := public.quest_today();
begin
  for r in
    select gp.user_id, gp.is_alive, rs.role, gr.won, p.current_streak
    from public.game_players gp
    join public.profiles p on p.id = gp.user_id and not p.is_bot
    left join public.game_roles_secret rs on rs.game_id = gp.game_id and rs.user_id = gp.user_id
    -- UNE seule ligne de résultat par joueur : la dernière manche. Une partie
    -- relancée dans le même salon garde une ligne game_results PAR manche ; sans
    -- ce filtre, la boucle traitait une manche au hasard (souvent une ancienne)
    -- et créditait ou non les quêtes de victoire d'après la mauvaise.
    left join lateral (
      select won from public.game_results
      where game_id = gp.game_id and user_id = gp.user_id
      order by created_at desc limit 1
    ) gr on true
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
        or (qt.condition_key = 'won_as_village' and coalesce(r.won, false) and r.role is not null and r.role not in ('loup_garou', 'loup_alpha', 'sans_visage', 'grand_mechant_loup', 'anancy', 'ange', 'chasseuse'))
        or (qt.condition_key = 'played_as_role' and r.role = qt.condition_role)
        or (qt.condition_key = 'won_as_role' and coalesce(r.won, false) and r.role = qt.condition_role)
        or (qt.condition_key = 'win_streak_reached')
      );
  end loop;
end;
$$;
