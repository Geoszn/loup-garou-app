-- ============================================================================
-- Abonnements Web Push (voir src/hooks/usePushNotifications.ts). Un joueur
-- peut avoir plusieurs abonnements actifs (un par navigateur/appareil sur
-- lequel il a activé les notifications) — endpoint est donc la clé unique
-- naturelle (un abonnement Push API est propre à une paire navigateur +
-- appareil), pas (user_id) seul.
--
-- Même patron que feedback_messages (0056) et account_deletion_requests
-- (0031) : RLS activée, AUCUNE policy — tout passe exclusivement par les
-- fonctions security definer ci-dessous. La lecture pour l'envoi effectif
-- des notifications (api/send-push.ts) se fait elle avec la clé service_role
-- côté serveur, qui contourne RLS de toute façon.
-- ============================================================================
set search_path = public;

create table if not exists public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth_key text not null,
  created_at timestamptz not null default now()
);

alter table public.push_subscriptions enable row level security;

create index if not exists push_subscriptions_user_id_idx on public.push_subscriptions (user_id);

-- ----------------------------------------------------------------------------
-- save_push_subscription : appelée juste après un PushManager.subscribe()
-- réussi côté client. upsert sur endpoint — un même navigateur qui se
-- réabonne (clés renouvelées par le navigateur, ce qui arrive) met à jour la
-- ligne existante plutôt que d'en créer une deuxième orpheline.
-- ----------------------------------------------------------------------------
create or replace function public.save_push_subscription(p_endpoint text, p_p256dh text, p_auth text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
begin
  if v_user is null then
    raise exception 'Authentification requise';
  end if;
  if p_endpoint is null or p_endpoint = '' or p_p256dh is null or p_p256dh = '' or p_auth is null or p_auth = '' then
    raise exception 'Abonnement invalide.';
  end if;

  insert into public.push_subscriptions (user_id, endpoint, p256dh, auth_key)
  values (v_user, p_endpoint, p_p256dh, p_auth)
  on conflict (endpoint) do update
    set user_id = excluded.user_id,
        p256dh = excluded.p256dh,
        auth_key = excluded.auth_key;
end;
$$;

grant execute on function public.save_push_subscription(text, text, text) to authenticated;

-- ----------------------------------------------------------------------------
-- remove_push_subscription : appelée quand le joueur désactive les
-- notifications, ou avant un PushManager.unsubscribe() côté client. Filtrée
-- par user_id en plus de l'endpoint — un joueur ne peut retirer que ses
-- propres abonnements, même s'il devinait l'endpoint d'un autre.
-- ----------------------------------------------------------------------------
create or replace function public.remove_push_subscription(p_endpoint text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'Authentification requise';
  end if;

  delete from public.push_subscriptions
  where endpoint = p_endpoint and user_id = auth.uid();
end;
$$;

grant execute on function public.remove_push_subscription(text) to authenticated;
