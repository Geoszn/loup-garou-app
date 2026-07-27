-- ----------------------------------------------------------------------------
-- 0031_account_deletion_request : permet à chaque utilisateur de demander la
-- fermeture de son compte directement depuis la page « Mon compte », sans
-- avoir à écrire un email. La suppression effective du compte (auth.users)
-- nécessite les droits d'administration Supabase (clé service_role, non
-- disponible côté client) : cette table ne fait donc qu'enregistrer la
-- demande, à charge pour l'éditeur de la traiter (voir politique de
-- confidentialité, section 9). La ligne disparaît automatiquement (cascade)
-- le jour où le compte est effectivement supprimé.
-- ----------------------------------------------------------------------------
create table if not exists public.account_deletion_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references auth.users(id) on delete cascade,
  email text,
  created_at timestamptz not null default now()
);

alter table public.account_deletion_requests enable row level security;
-- Aucune policy : accès exclusivement via les fonctions security definer
-- ci-dessous, même patron que votes / night_actions.

create or replace function public.request_account_deletion()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_row public.account_deletion_requests%rowtype;
begin
  if v_user is null then
    raise exception 'Authentification requise';
  end if;

  insert into public.account_deletion_requests (user_id, email)
  values (v_user, (select email from auth.users where id = v_user))
  on conflict (user_id) do nothing;

  select * into v_row from public.account_deletion_requests where user_id = v_user;
  return jsonb_build_object('requested_at', v_row.created_at);
end;
$$;

grant execute on function public.request_account_deletion() to authenticated;

create or replace function public.get_my_account_deletion_request()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_row public.account_deletion_requests%rowtype;
begin
  if v_user is null then
    raise exception 'Authentification requise';
  end if;

  select * into v_row from public.account_deletion_requests where user_id = v_user;
  if not found then
    return null;
  end if;
  return jsonb_build_object('requested_at', v_row.created_at);
end;
$$;

grant execute on function public.get_my_account_deletion_request() to authenticated;
