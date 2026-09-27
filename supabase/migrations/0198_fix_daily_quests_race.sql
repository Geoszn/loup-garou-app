-- ============================================================================
-- Bug relevé chez « Monarque ⚜️ » : 5 quêtes assignées pour la même journée
-- au lieu de 3. Cause — course entre deux appels concurrents de
-- get_my_quests() : AppShell.tsx relance get_my_quests à chaque changement
-- de page (pour rafraîchir le badge « récompense à récupérer »), pile en
-- même temps que la page de destination (ex. Récompenses) le fait aussi de
-- son côté. ensure_daily_quests vérifiait "if exists (...) then return" AVANT
-- d'insérer : deux appels simultanés passent tous les deux ce test avant que
-- l'un des deux ait eu le temps de committer son insertion, donc chacun tire
-- ses 3 quêtes au hasard — jusqu'à 6 lignes distinctes pour le même jour.
--
-- Fix : un verrou transactionnel (pg_advisory_xact_lock) sur (user, date) en
-- tout début de fonction. Le second appel concurrent attend que le premier
-- ait committé, puis revoit le test "exists" avec les lignes déjà présentes
-- et ressort aussitôt sans rien insérer — verrou automatiquement relâché à
-- la fin de la transaction, aucun risque d'oubli de déverrouillage.
-- ============================================================================
set search_path = public;

create or replace function public.ensure_daily_quests(p_user uuid, p_date date)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  perform pg_advisory_xact_lock(hashtextextended(p_user::text || p_date::text, 0));

  if exists (select 1 from public.quest_progress where user_id = p_user and quest_date = p_date) then
    return;
  end if;

  insert into public.quest_progress (user_id, quest_date, template_id)
  select p_user, p_date, id
  from public.quest_templates
  where active = true
  order by random()
  limit 3
  on conflict (user_id, quest_date, template_id) do nothing;
end;
$$;

-- ----------------------------------------------------------------------------
-- Nettoyage des journées déjà en trop (aujourd'hui et hier, seules journées
-- où la course a pu se produire depuis le déploiement d'AppShell) : ramène
-- chaque joueur à 3 quêtes par jour, en gardant en priorité les quêtes déjà
-- réclamées puis les plus avancées — jamais une quête sur laquelle il y a
-- déjà de la progression ou une récompense encaissée.
-- ----------------------------------------------------------------------------
with ranked as (
  select
    qp.user_id, qp.quest_date, qp.template_id,
    row_number() over (
      partition by qp.user_id, qp.quest_date
      order by (qp.claimed_at is not null) desc, qp.progress desc, qp.template_id
    ) as rn
  from public.quest_progress qp
  where qp.quest_date >= public.quest_today() - 1
)
delete from public.quest_progress qp
using ranked r
where qp.user_id = r.user_id
  and qp.quest_date = r.quest_date
  and qp.template_id = r.template_id
  and r.rn > 3;
