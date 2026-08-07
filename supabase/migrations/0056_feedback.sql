-- ============================================================================
-- Boîte à idées / retours joueurs : un joueur écrit un message depuis
-- l'application, il arrive directement par email à l'éditeur (voir
-- api/feedback.ts — Postgres ne peut pas envoyer d'email lui-même, cette
-- table sert donc à la fois de trace persistante ET de source de vérité
-- pour la limite de fréquence ; l'envoi effectif de l'email est déclenché
-- par la fonction serverless Vercel APRÈS que submit_feedback ci-dessous ait
-- réussi (donc jamais d'email envoyé si la limite est dépassée).
--
-- Limite : un seul message toutes les 7 jours par joueur, imposée ici
-- côté serveur (pas seulement côté client) pour rester valable même si
-- quelqu'un appelle submit_feedback directement.
--
-- Même patron que account_deletion_requests (0031) : RLS activée, AUCUNE
-- policy — tout passe exclusivement par les fonctions security definer
-- ci-dessous.
-- ============================================================================
set search_path = public;

create table if not exists public.feedback_messages (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  message text not null,
  created_at timestamptz not null default now()
);

alter table public.feedback_messages enable row level security;

create index if not exists feedback_messages_user_id_created_at_idx
  on public.feedback_messages (user_id, created_at desc);

-- ----------------------------------------------------------------------------
-- submit_feedback : valide + enregistre le message, refuse si moins de 7
-- jours se sont écoulés depuis le dernier envoi de ce joueur. Appelée par
-- api/feedback.ts avec le token du joueur (donc avec son propre auth.uid()),
-- jamais directement par le client — c'est la fonction serverless qui
-- envoie ensuite l'email une fois l'insertion réussie.
-- ----------------------------------------------------------------------------
create or replace function public.submit_feedback(p_message text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_message text;
  v_last timestamptz;
  v_row public.feedback_messages%rowtype;
begin
  if v_user is null then
    raise exception 'Authentification requise';
  end if;

  v_message := trim(p_message);
  if v_message = '' then
    raise exception 'Le message ne peut pas être vide.';
  end if;
  if length(v_message) > 2000 then
    raise exception 'Le message est trop long (2000 caractères maximum).';
  end if;

  select max(created_at) into v_last from public.feedback_messages where user_id = v_user;
  if v_last is not null and v_last > now() - interval '7 days' then
    raise exception 'Un seul message par semaine — réessaie à partir du %.', to_char(v_last + interval '7 days', 'DD/MM/YYYY');
  end if;

  insert into public.feedback_messages (user_id, message)
  values (v_user, v_message)
  returning * into v_row;

  return jsonb_build_object('created_at', v_row.created_at, 'next_allowed_at', v_row.created_at + interval '7 days');
end;
$$;

grant execute on function public.submit_feedback(text) to authenticated;

-- ----------------------------------------------------------------------------
-- get_my_feedback_status : pour afficher/désactiver le bouton côté client
-- AVANT même de tenter un envoi (meilleure UX qu'un message d'erreur après
-- coup) — la vérification faite dans submit_feedback ci-dessus reste la
-- seule qui compte réellement, celle-ci n'est qu'informative.
-- ----------------------------------------------------------------------------
create or replace function public.get_my_feedback_status()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_last timestamptz;
  v_next timestamptz;
begin
  if v_user is null then
    raise exception 'Authentification requise';
  end if;

  select max(created_at) into v_last from public.feedback_messages where user_id = v_user;
  v_next := case when v_last is null then null else v_last + interval '7 days' end;

  return jsonb_build_object(
    'can_send', v_next is null or v_next <= now(),
    'next_allowed_at', case when v_next is not null and v_next > now() then v_next else null end
  );
end;
$$;

grant execute on function public.get_my_feedback_status() to authenticated;
