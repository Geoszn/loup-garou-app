-- 0252 — Présence légère : fin du canal Realtime global « presence-lobby ».
--
-- Avant : chaque joueur connecté rejoignait un canal de présence UNIQUE (PresenceContext.tsx). Chaque arrivée ou départ
-- était rediffusé à TOUS les connectés : le coût croît comme le carré du nombre de joueurs. Limite officielle Supabase
-- Realtime : 50 messages de présence par seconde en Pro (1 000 sans plafond de dépense) — 1 000 joueurs qui arrivent en
-- quelques minutes la dépassent largement.
--
-- Ici : un battement de cœur toutes les 60 s (touch_presence), qui renvoie dans le même appel
--   - le nombre de joueurs en ligne (compteur du village animé),
--   - le statut (idle / in_game) des SEULS amis et membres de la tribu de l'appelant.
-- Compte « en ligne » = vu dans les 150 dernières secondes. Un onglet caché n'envoie pas de battement.
--
-- RETOUR EN ARRIÈRE : rien à défaire côté base (table et fonction inertes) ; le client précédent n'en a pas besoin.
-- Rejouable sans risque.
set search_path = public;

create table if not exists public.user_presence (
  user_id uuid primary key references public.profiles (id) on delete cascade,
  last_seen_at timestamptz not null default now(),
  status text not null default 'idle' check (status in ('idle', 'in_game'))
) with (fillfactor = 70);

create index if not exists user_presence_seen_idx on public.user_presence (last_seen_at);

alter table public.user_presence enable row level security;
revoke all on table public.user_presence from anon, authenticated;

create or replace function public.touch_presence(p_status text default 'idle')
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_status text := case when p_status = 'in_game' then 'in_game' else 'idle' end;
  v_cut timestamptz := now() - interval '150 seconds';
begin
  if v_user is null then
    raise exception 'Authentification requise';
  end if;

  insert into public.user_presence (user_id, last_seen_at, status)
  values (v_user, now(), v_status)
  on conflict (user_id) do update set last_seen_at = now(), status = excluded.status;

  return jsonb_build_object(
    'online_count', (select count(*) from public.user_presence where last_seen_at > v_cut),
    'online', coalesce((
      with mates as (
        select case when fr.requester_id = v_user then fr.addressee_id else fr.requester_id end as uid
        from public.friend_requests fr
        where fr.status = 'accepted' and v_user in (fr.requester_id, fr.addressee_id)
        union
        select tm2.user_id
        from public.tribe_members tm1
        join public.tribe_members tm2 on tm2.tribe_id = tm1.tribe_id
        where tm1.user_id = v_user and tm2.user_id <> v_user
      )
      select jsonb_object_agg(up.user_id, up.status)
      from mates m
      join public.user_presence up on up.user_id = m.uid
      where up.last_seen_at > v_cut
    ), '{}'::jsonb)
  );
end;
$$;

revoke all on function public.touch_presence(text) from public, anon;
grant execute on function public.touch_presence(text) to authenticated;

-- Les lignes vieilles de plus de 7 jours ne servent à rien : purge quotidienne (si pg_cron est actif, voir 0251).
do $$
begin
  perform cron.unschedule(jobid) from cron.job where jobname = 'purge-user-presence';
  perform cron.schedule('purge-user-presence', '23 4 * * *', $job$delete from public.user_presence where last_seen_at < now() - interval '7 days'$job$);
exception when others then
  raise notice 'purge de user_presence non planifiée (%) : sans gravité, la table reste petite.', sqlerrm;
end;
$$;
