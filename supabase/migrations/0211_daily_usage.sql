-- 0211 — Suivi de l'usage vocal Daily.co dans la Vue d'ensemble de l'admin.
--
-- Daily facture à la minute-participant (voir api/daily-room.ts). La route
-- api/admin-daily-usage.ts relit les sessions via l'API REST de Daily
-- (GET /meetings, durée de chaque participant) et range ici le total PAR JOUR
-- (UTC) : l'admin garde un historique et la page ne retape pas l'API de Daily
-- à chaque affichage. Valeurs approximatives (horodatage Daily à ~15 s, une
-- session est rattachée au jour où elle commence) — la facture exacte reste
-- celle du tableau de bord Daily.
set search_path = public;

create table if not exists public.daily_usage_days (
  day date primary key,
  participant_seconds bigint not null default 0 check (participant_seconds >= 0),
  sessions int not null default 0 check (sessions >= 0),
  updated_at timestamptz not null default now()
);

alter table public.daily_usage_days enable row level security;
revoke all on public.daily_usage_days from anon, authenticated;

-- Lecture réservée aux admins. L'écriture se fait uniquement par la route
-- serveur (clé service_role, qui contourne RLS) — aucune policy cliente.
create or replace function public.admin_get_daily_usage(p_since date default null)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_since date := coalesce(p_since, (date_trunc('month', now()) - interval '2 months')::date);
begin
  if not public.is_admin_user(auth.uid()) then
    raise exception 'Accès refusé.';
  end if;

  return jsonb_build_object(
    'days', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'day', d.day,
          'minutes', round(d.participant_seconds / 60.0, 1),
          'sessions', d.sessions
        ) order by d.day
      )
      from public.daily_usage_days d
      where d.day >= v_since
    ), '[]'::jsonb),
    'synced_at', (select max(updated_at) from public.daily_usage_days)
  );
end;
$$;

revoke execute on function public.admin_get_daily_usage(date) from public, anon;
grant execute on function public.admin_get_daily_usage(date) to authenticated;
