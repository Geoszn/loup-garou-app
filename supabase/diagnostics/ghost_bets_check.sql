-- Lecture seule : vérifie que le « Pronostic des fantômes » (migration 0221) est
-- bien installé, puis montre les derniers pronostics.
select 'table ghost_bets' as controle, to_regclass('public.ghost_bets') is not null as ok
union all
select 'RLS activée', coalesce((select relrowsecurity from pg_class where oid = to_regclass('public.ghost_bets')), false)
union all
select 'déclencheur ' || t, exists (select 1 from pg_trigger where tgname = t and not tgisinternal)
from unnest(array['ghost_bets_game_change', 'ghost_bets_game_delete', 'ghost_bets_revive']) as t
union all
select 'fonction ' || f, to_regproc('public.' || f) is not null
from unnest(array['ghost_bet_market', 'ghost_bet_settle', 'ghost_bet_refund', 'ghost_bet_credit', 'get_ghost_bet_state', 'place_ghost_bet']) as f
union all
select 'client peut appeler get_ghost_bet_state', has_function_privilege('authenticated', 'public.get_ghost_bet_state(uuid)', 'execute')
union all
select 'client NE peut PAS appeler ghost_bet_settle', not has_function_privilege('authenticated', 'public.ghost_bet_settle(uuid, text)', 'execute');

select kind, pick, stake, odds, result, payout, created_at, settled_at
from public.ghost_bets order by created_at desc limit 20;
