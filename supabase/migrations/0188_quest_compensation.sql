-- Compensation des quêtes quotidiennes terminées mais jamais récupérées à
-- cause des anciens bugs (changement de jour, récompenses perdues).
-- Une ligne par joueur concerné, créée ici une seule fois. Le joueur voit une
-- popup et choisit de récupérer ou d'ignorer ; seuls les joueurs concernés
-- ont une ligne, donc seuls eux voient la popup.
set search_path = public;

create table if not exists public.quest_compensations (
  user_id uuid primary key references public.profiles (id) on delete cascade,
  amount int not null check (amount > 0),
  quests_count int not null,
  status text not null default 'pending' check (status in ('pending', 'claimed', 'dismissed')),
  created_at timestamptz not null default now(),
  resolved_at timestamptz
);

alter table public.quest_compensations enable row level security;
revoke all on public.quest_compensations from anon, authenticated;

insert into public.quest_compensations (user_id, amount, quests_count)
select qp.user_id, sum(qt.reward_coins)::int, count(*)::int
from public.quest_progress qp
join public.quest_templates qt on qt.id = qp.template_id
join public.profiles p on p.id = qp.user_id
where qp.claimed_at is null
  and qp.progress >= qt.target
  and qt.reward_coins > 0
  and qp.quest_date < public.quest_today() - 1
  and qp.quest_date >= public.quest_today() - 14
  and not coalesce(p.is_bot, false)
group by qp.user_id
on conflict (user_id) do nothing;

create or replace function public.get_my_quest_compensation()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object('amount', amount, 'quests_count', quests_count)
  from public.quest_compensations
  where user_id = auth.uid() and status = 'pending';
$$;

create or replace function public.claim_quest_compensation()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_amount int;
  v_new bigint;
begin
  if v_user is null then
    raise exception 'Non authentifié.';
  end if;

  update public.quest_compensations
    set status = 'claimed', resolved_at = now()
    where user_id = v_user and status = 'pending'
    returning amount into v_amount;

  if v_amount is null then
    raise exception 'Aucune compensation à récupérer.';
  end if;

  update public.profiles set loup_coins = loup_coins + v_amount
    where id = v_user
    returning loup_coins into v_new;

  insert into public.loup_coins_transactions (user_id, amount, reason, label)
  values (v_user, v_amount, 'quest_reward', 'Compensation quêtes');

  return jsonb_build_object('reward_coins', v_amount, 'new_loup_coins', v_new);
end;
$$;

create or replace function public.dismiss_quest_compensation()
returns void
language sql
security definer
set search_path = public
as $$
  update public.quest_compensations
    set status = 'dismissed', resolved_at = now()
    where user_id = auth.uid() and status = 'pending';
$$;

revoke execute on function public.get_my_quest_compensation() from public, anon;
revoke execute on function public.claim_quest_compensation() from public, anon;
revoke execute on function public.dismiss_quest_compensation() from public, anon;
grant execute on function public.get_my_quest_compensation() to authenticated;
grant execute on function public.claim_quest_compensation() to authenticated;
grant execute on function public.dismiss_quest_compensation() to authenticated;

-- Aperçu pour l'admin : qui est concerné et pour combien.
select p.username, c.amount, c.quests_count, c.status
from public.quest_compensations c join public.profiles p on p.id = c.user_id
order by c.amount desc;
