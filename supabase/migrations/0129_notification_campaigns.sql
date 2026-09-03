-- ============================================================================
-- Campagnes de notification push envoyées depuis le dashboard admin (onglet
-- Notifications) : titre/texte/lien libres, envoi immédiat ou programmé,
-- avec aperçu avant envoi côté client. Diffusée à tous les joueurs ayant au
-- moins un abonnement push actif (voir push_subscriptions, 0105) — pas de
-- segmentation par audience pour l'instant.
--
-- Même patron que push_subscriptions : RLS activée, AUCUNE policy cliente —
-- tout passe par les fonctions security definer ci-dessous (lecture/écriture
-- admin) ou par la clé service_role côté serveur (envoi effectif, voir
-- server/pushSend.ts).
--
-- L'envoi lui-même (webpush.sendNotification) ne peut pas se faire en
-- PL/pgSQL — cette table ne fait qu'enregistrer l'INTENTION d'envoi ; le
-- vrai envoi est déclenché soit immédiatement par le dashboard
-- (api/admin-send-campaign.ts, juste après la création de la ligne), soit
-- plus tard par un cron Vercel (api/cron-send-campaigns.ts) qui balaie les
-- lignes status='scheduled' dont scheduled_at est passé.
-- ============================================================================
set search_path = public;

create table if not exists public.notification_campaigns (
  id uuid primary key default gen_random_uuid(),
  push_title text not null,
  push_body text not null,
  push_url text not null default '/dashboard',
  status text not null default 'scheduled' check (status in ('scheduled', 'sending', 'sent', 'canceled', 'failed')),
  -- Envoi "maintenant" = scheduled_at déjà passé au moment de la création
  -- (voir admin_create_notification_campaign) : un seul chemin de code,
  -- l'immédiateté n'est qu'un cas particulier de la programmation.
  scheduled_at timestamptz not null default now(),
  sent_at timestamptz,
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  -- Nombre de destinataires distincts au moment de la création — figé ici
  -- pour l'historique (affiché tel quel même si des joueurs se désabonnent
  -- ensuite), distinct de sent_count/removed_count qui eux reflètent
  -- l'envoi réel.
  recipient_count int not null default 0,
  sent_count int not null default 0,
  removed_count int not null default 0,
  error text
);

create index if not exists notification_campaigns_due_idx
  on public.notification_campaigns (scheduled_at)
  where status = 'scheduled';

alter table public.notification_campaigns enable row level security;
-- Aucune policy client — accès exclusivement via les fonctions ci-dessous
-- (admin) et la clé service_role (envoi serveur).

-- ----------------------------------------------------------------------------
-- admin_get_push_subscriber_count : nombre de joueurs distincts (hors bots
-- de test, voir migration 0127) ayant au moins un abonnement push actif —
-- affiché dans le dashboard avant l'envoi ("X destinataires").
-- ----------------------------------------------------------------------------
create or replace function public.admin_get_push_subscriber_count()
returns int
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin_user(auth.uid()) then
    raise exception 'Accès refusé.';
  end if;

  return (
    select count(distinct ps.user_id)
    from public.push_subscriptions ps
    join public.profiles p on p.id = ps.user_id
    where not p.is_bot
  );
end;
$$;

grant execute on function public.admin_get_push_subscriber_count() to authenticated;

-- ----------------------------------------------------------------------------
-- admin_create_notification_campaign : crée la ligne d'intention d'envoi.
-- p_scheduled_at absent/passé => scheduled_at = now() (le dashboard appelle
-- alors immédiatement api/admin-send-campaign avec l'id renvoyé) ;
-- p_scheduled_at futur => restera 'scheduled' jusqu'au prochain passage du
-- cron. recipient_count est calculé ici une bonne fois, pas recalculé à
-- l'envoi.
-- ----------------------------------------------------------------------------
create or replace function public.admin_create_notification_campaign(
  p_push_title text,
  p_push_body text,
  p_push_url text default '/dashboard',
  p_scheduled_at timestamptz default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_admin uuid := auth.uid();
  v_row public.notification_campaigns;
  v_recipients int;
begin
  if not public.is_admin_user(v_admin) then
    raise exception 'Accès refusé.';
  end if;
  if coalesce(trim(p_push_title), '') = '' or coalesce(trim(p_push_body), '') = '' then
    raise exception 'Le titre et le texte de la notification sont obligatoires.';
  end if;

  select count(distinct ps.user_id) into v_recipients
  from public.push_subscriptions ps
  join public.profiles p on p.id = ps.user_id
  where not p.is_bot;

  insert into public.notification_campaigns (push_title, push_body, push_url, scheduled_at, created_by, recipient_count)
  values (
    trim(p_push_title),
    trim(p_push_body),
    nullif(trim(coalesce(p_push_url, '')), ''),
    coalesce(p_scheduled_at, now()),
    v_admin,
    v_recipients
  )
  returning * into v_row;

  insert into public.admin_audit_log (admin_id, action, target, details)
  values (
    v_admin,
    'create_notification_campaign',
    v_row.id::text,
    jsonb_build_object('title', v_row.push_title, 'scheduled_at', v_row.scheduled_at, 'recipient_count', v_recipients)
  );

  return to_jsonb(v_row);
end;
$$;

grant execute on function public.admin_create_notification_campaign(text, text, text, timestamptz) to authenticated;

-- ----------------------------------------------------------------------------
-- admin_list_notification_campaigns : historique (envoyées, programmées,
-- annulées, en échec), le plus récent en premier.
-- ----------------------------------------------------------------------------
create or replace function public.admin_list_notification_campaigns(p_limit int default 30)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin_user(auth.uid()) then
    raise exception 'Accès refusé.';
  end if;

  return coalesce((
    select jsonb_agg(row_to_json(c))
    from (
      select *
      from public.notification_campaigns
      order by created_at desc
      limit greatest(p_limit, 1)
    ) c
  ), '[]'::jsonb);
end;
$$;

grant execute on function public.admin_list_notification_campaigns(int) to authenticated;

-- ----------------------------------------------------------------------------
-- admin_cancel_notification_campaign : annule une campagne encore
-- programmée (pas encore ramassée par le cron). Sans effet si elle est déjà
-- en cours d'envoi ou envoyée — pas d'erreur, juste retourne false, pour que
-- le dashboard puisse simplement recharger la liste dans ce cas plutôt que
-- d'afficher une erreur confuse sur une simple course avec le cron.
-- ----------------------------------------------------------------------------
create or replace function public.admin_cancel_notification_campaign(p_campaign_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_admin uuid := auth.uid();
  v_updated int;
begin
  if not public.is_admin_user(v_admin) then
    raise exception 'Accès refusé.';
  end if;

  update public.notification_campaigns
  set status = 'canceled'
  where id = p_campaign_id and status = 'scheduled';
  get diagnostics v_updated = row_count;

  if v_updated > 0 then
    insert into public.admin_audit_log (admin_id, action, target, details)
    values (v_admin, 'cancel_notification_campaign', p_campaign_id::text, null);
  end if;

  return v_updated > 0;
end;
$$;

grant execute on function public.admin_cancel_notification_campaign(uuid) to authenticated;
