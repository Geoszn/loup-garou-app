-- ============================================================================
-- Historique des Loup Coins, pour la nouvelle page "Loup Store" côté joueur
-- (voir src/pages/LoupStore.tsx) : jusqu'ici seul le solde courant
-- (profiles.loup_coins, migration 0146) existait, sans aucune trace de
-- comment il s'est constitué. Ajoute un vrai grand livre append-only :
-- chaque crédit de quête (claim_quest_reward) y ajoute désormais une ligne,
-- en plus de créditer le solde comme avant.
--
-- `label` est figé au moment de la transaction (copie du texte de la quête
-- à cet instant), PAS une jointure live vers quest_templates : contrairement
-- à get_my_quests (qui doit refléter un catalogue qui peut changer en cours
-- de journée, voir migration 0112), un historique doit rester fidèle à ce
-- qui s'est réellement passé, y compris si l'admin modifie ou supprime la
-- quête plus tard.
--
-- `amount` peut déjà être négatif : aucune écriture négative n'existe encore
-- (rien ne dépense de Loup Coins pour l'instant), mais get_my_loup_coins
-- calcule déjà total_earned/total_spent séparément pour ne pas avoir à
-- retoucher cette fonction quand une vraie dépense (future itération du
-- Loup Store) sera ajoutée.
-- ============================================================================
set search_path = public;

create table if not exists public.loup_coins_transactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  amount int not null,
  reason text not null,
  label text,
  created_at timestamptz not null default now()
);

create index if not exists loup_coins_transactions_user_created_idx
  on public.loup_coins_transactions (user_id, created_at desc);

-- Pas de RLS ni de grant direct sur cette table : accès en lecture
-- exclusivement via get_my_loup_coins() ci-dessous — même convention que
-- quest_templates/quest_progress/quest_game_sync (migration 0112), aucun
-- accès direct authenticated/anon.

-- ----------------------------------------------------------------------------
-- claim_quest_reward : inchangée dans son comportement, ajoute simplement
-- une ligne au grand livre en plus de créditer le solde.
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
  v_label_fr text;
  v_new_loup_coins bigint;
begin
  if v_user is null then
    raise exception 'Non authentifié.';
  end if;

  select qp.progress, qt.target, qt.reward_coins, qp.claimed_at, qt.label_fr
    into v_progress, v_target, v_reward, v_claimed, v_label_fr
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

  insert into public.loup_coins_transactions (user_id, amount, reason, label)
  values (v_user, v_reward, 'quest_reward', v_label_fr);

  return jsonb_build_object('reward_coins', v_reward, 'new_loup_coins', v_new_loup_coins);
end;
$$;

grant execute on function public.claim_quest_reward(uuid) to authenticated;

-- ----------------------------------------------------------------------------
-- get_my_loup_coins : tout ce qu'il faut pour la page Loup Store en un seul
-- aller-retour — solde, total gagné/dépensé (à vie), et les 50 dernières
-- transactions. 50 lignes suffisent largement pour un historique de quêtes
-- (3 au mieux par jour) sans avoir besoin de pagination dès cette première
-- version ; une pagination pourra être ajoutée plus tard si le besoin s'en
-- fait sentir.
-- ----------------------------------------------------------------------------
create or replace function public.get_my_loup_coins()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_balance bigint;
begin
  if v_user is null then
    raise exception 'Non authentifié.';
  end if;

  select loup_coins into v_balance from public.profiles where id = v_user;

  return jsonb_build_object(
    'balance', coalesce(v_balance, 0),
    'total_earned', coalesce((
      select sum(amount) from public.loup_coins_transactions where user_id = v_user and amount > 0
    ), 0),
    'total_spent', coalesce((
      select -sum(amount) from public.loup_coins_transactions where user_id = v_user and amount < 0
    ), 0),
    'transactions', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', t.id, 'amount', t.amount, 'reason', t.reason, 'label', t.label, 'created_at', t.created_at
      ) order by t.created_at desc)
      from (
        select * from public.loup_coins_transactions
        where user_id = v_user
        order by created_at desc
        limit 50
      ) t
    ), '[]'::jsonb)
  );
end;
$$;

grant execute on function public.get_my_loup_coins() to authenticated;
