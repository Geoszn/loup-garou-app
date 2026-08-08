-- ============================================================================
-- request_account_deletion (0031_account_deletion_request.sql) n'avait pas
-- de contrepartie : une fois la demande envoyée, rien ne permettait à
-- l'utilisateur de changer d'avis avant qu'un admin la traite (voir
-- admin_process_account_deletion, 0048_admin_rpcs.sql) — sauf à écrire à
-- l'éditeur. cancel_account_deletion() retire simplement sa propre ligne de
-- account_deletion_requests ; ne casse rien côté admin (si la demande a déjà
-- été traitée entre-temps, la ligne n'existe plus, l'appel est un no-op sans
-- erreur).
-- ============================================================================
set search_path = public;

create or replace function public.cancel_account_deletion()
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

  delete from public.account_deletion_requests where user_id = v_user;
end;
$$;

grant execute on function public.cancel_account_deletion() to authenticated;
