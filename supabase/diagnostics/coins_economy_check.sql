-- Diagnostic LECTURE SEULE de l'économie des Loup Coins : sert à fixer le prix du pass de saison payant.
--   node scripts/query-sql-file.mjs supabase/diagnostics/coins_economy_check.sql
-- Le résultat est un JSON sans secret (aucun nom de joueur), à coller dans le chat.
--
-- « Joueur actif » = compte réel (ni bot ni invité) qui a joué au moins 3 parties ces 14 derniers jours.
--  - weekly_earned : Loup Coins gagnés PAR SEMAINE par un joueur actif (moyenne des 14 derniers jours), en percentiles.
--  - suggested_pass_price : deux semaines de gains d'un joueur médian (p50) et d'un joueur à 75 % (p75). Le prix du pass se
--    choisit entre les deux : plus bas = pass accessible à tous, plus haut = pass qui se mérite.
--  - earned_by_reason_30d / spent_by_reason_30d : d'où viennent et où vont les coins (quêtes, événements, séries, boutique...).
--  - balances : combien de coins les actifs ont déjà en réserve (un pass trop cher ou trop bon marché se lit ici).
with real_players as (
  select id, loup_coins from public.profiles where not is_bot and not is_guest
),
active as (
  select gp.user_id
  from public.game_players gp
  join public.games g on g.id = gp.game_id
  join real_players rp on rp.id = gp.user_id
  where g.created_at > now() - interval '14 days'
  group by gp.user_id
  having count(*) >= 3
),
earned as (
  select a.user_id,
         coalesce(sum(t.amount) filter (where t.amount > 0 and t.created_at > now() - interval '14 days'), 0)::numeric / 2.0 as weekly
  from active a
  left join public.loup_coins_transactions t on t.user_id = a.user_id
  group by a.user_id
),
pct as (
  select
    count(*) as n,
    coalesce(percentile_cont(0.25) within group (order by weekly), 0) as p25,
    coalesce(percentile_cont(0.5) within group (order by weekly), 0) as p50,
    coalesce(percentile_cont(0.75) within group (order by weekly), 0) as p75,
    coalesce(percentile_cont(0.9) within group (order by weekly), 0) as p90
  from earned
),
bal as (
  select
    coalesce(percentile_cont(0.5) within group (order by rp.loup_coins), 0) as median_balance,
    coalesce(percentile_cont(0.9) within group (order by rp.loup_coins), 0) as p90_balance,
    count(*) filter (where rp.loup_coins >= 1000) as with_1000,
    count(*) filter (where rp.loup_coins >= 2000) as with_2000
  from real_players rp
  join active a on a.user_id = rp.id
)
select jsonb_build_object(
  'real_players', (select count(*) from real_players),
  'active_players_14d', (select n from pct),
  'weekly_earned', (select jsonb_build_object('p25', round(p25), 'p50', round(p50), 'p75', round(p75), 'p90', round(p90)) from pct),
  'suggested_pass_price', (select jsonb_build_object('two_weeks_median', round(2 * p50, -1), 'two_weeks_p75', round(2 * p75, -1)) from pct),
  'balances', (select jsonb_build_object('median', round(median_balance), 'p90', round(p90_balance), 'actives_with_1000_plus', with_1000, 'actives_with_2000_plus', with_2000) from bal),
  'coins_in_circulation', (select coalesce(sum(loup_coins), 0) from real_players),
  'earned_by_reason_30d', (
    select coalesce(jsonb_agg(r order by (r->>'total')::bigint desc), '[]'::jsonb) from (
      select jsonb_build_object('reason', reason, 'transactions', count(*), 'total', sum(amount)) as r
      from public.loup_coins_transactions
      where amount > 0 and created_at > now() - interval '30 days'
      group by reason
    ) x
  ),
  'spent_by_reason_30d', (
    select coalesce(jsonb_agg(r order by (r->>'total')::bigint), '[]'::jsonb) from (
      select jsonb_build_object('reason', reason, 'transactions', count(*), 'total', sum(amount)) as r
      from public.loup_coins_transactions
      where amount < 0 and created_at > now() - interval '30 days'
      group by reason
    ) x
  )
) as coins_economy;
