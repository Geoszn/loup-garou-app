import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { Button, Card, ConfirmDialog, ErrorText } from '../ui'
import { emblemIcon } from '../../lib/tribe'

interface Report {
  id: string
  tribe_id: string | null
  tribe_name: string | null
  body: string
  reporter: string | null
  reported: string | null
  reported_id: string | null
  message_exists: boolean
  created_at: string
}
interface TribeRow {
  id: string
  name: string
  emblem: string
  created_at: string
  member_count: number
  chef: string | null
  open_reports: number
}

/** Administration des tribus (migration 0222) : signalements de messages à traiter
 * et liste des tribus, avec dissolution en dernier recours. */
export function AdminTribesTab() {
  const [reports, setReports] = useState<Report[] | null>(null)
  const [tribes, setTribes] = useState<TribeRow[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [dissolve, setDissolve] = useState<TribeRow | null>(null)

  const load = useCallback(async () => {
    const [r, t] = await Promise.all([supabase.rpc('admin_list_tribe_reports'), supabase.rpc('admin_list_tribes')])
    if (r.error || t.error) {
      setError((r.error ?? t.error)?.message ?? null)
      return
    }
    setError(null)
    setReports(r.data as Report[])
    setTribes(t.data as TribeRow[])
  }, [])
  useEffect(() => {
    void load()
  }, [load])

  async function resolve(id: string, action: 'delete_message' | 'mute_24h' | 'dismiss') {
    const { error: rpcError } = await supabase.rpc('admin_resolve_tribe_report', { p_report_id: id, p_action: action })
    if (rpcError) setError(rpcError.message)
    await load()
  }

  async function confirmDissolve() {
    const target = dissolve
    setDissolve(null)
    if (!target) return
    const { error: rpcError } = await supabase.rpc('admin_dissolve_tribe', { p_tribe_id: target.id })
    if (rpcError) setError(rpcError.message)
    await load()
  }

  const date = (iso: string) => new Date(iso).toLocaleString('fr-FR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })

  return (
    <div className="flex flex-col gap-6">
      <ErrorText>{error}</ErrorText>
      <Card>
        <h2 className="mb-3 font-display text-lg text-moon-200">Signalements à traiter {reports ? `(${reports.length})` : ''}</h2>
        {reports === null ? (
          <p className="text-sm text-moon-200/50">Chargement…</p>
        ) : reports.length === 0 ? (
          <p className="text-sm text-moon-200/50">Aucun signalement en attente.</p>
        ) : (
          <ul className="flex flex-col gap-3">
            {reports.map((r) => (
              <li key={r.id} className="rounded-xl border border-night-600/60 bg-night-900/40 p-3">
                <p className="text-xs text-moon-200/50">
                  {r.tribe_name ?? 'Tribu supprimée'} · {date(r.created_at)} · signalé par <b>{r.reporter ?? '?'}</b> contre <b>{r.reported ?? '?'}</b>
                </p>
                <p className="mt-2 break-words rounded-lg bg-night-800/70 px-3 py-2 text-sm text-moon-200">{r.body}</p>
                <div className="mt-3 flex flex-wrap gap-2">
                  {r.message_exists && (
                    <Button variant="ghost" className="px-3 py-1.5 text-xs" onClick={() => resolve(r.id, 'delete_message')}>
                      🗑️ Supprimer le message
                    </Button>
                  )}
                  {r.reported_id && (
                    <Button variant="ghost" className="px-3 py-1.5 text-xs" onClick={() => resolve(r.id, 'mute_24h')}>
                      🔇 Rendre muet 24 h
                    </Button>
                  )}
                  <Button variant="ghost" className="px-3 py-1.5 text-xs" onClick={() => resolve(r.id, 'dismiss')}>
                    Classer sans suite
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card>
        <h2 className="mb-3 font-display text-lg text-moon-200">Tribus {tribes ? `(${tribes.length})` : ''}</h2>
        {tribes === null ? (
          <p className="text-sm text-moon-200/50">Chargement…</p>
        ) : tribes.length === 0 ? (
          <p className="text-sm text-moon-200/50">Aucune tribu pour le moment.</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {tribes.map((t) => (
              <li key={t.id} className="flex items-center gap-3 rounded-xl border border-night-600/60 bg-night-900/40 px-3 py-2.5">
                <span className="text-2xl" aria-hidden="true">{emblemIcon(t.emblem)}</span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-moon-200">{t.name}</p>
                  <p className="text-[11px] text-moon-200/50">
                    {t.member_count}/30 membres · chef : {t.chef ?? '—'} · créée le {date(t.created_at)}
                    {t.open_reports > 0 && <span className="font-semibold text-blood-400"> · {t.open_reports} signalement(s)</span>}
                  </p>
                </div>
                <Button variant="ghost" className="px-3 py-1.5 text-xs !text-blood-400" onClick={() => setDissolve(t)}>
                  Dissoudre
                </Button>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <ConfirmDialog
        open={!!dissolve}
        title="Dissoudre cette tribu ?"
        message={dissolve ? `« ${dissolve.name} » (${dissolve.member_count} membres) sera supprimée avec son chat. C'est définitif.` : ''}
        confirmLabel="Dissoudre"
        cancelLabel="Annuler"
        onCancel={() => setDissolve(null)}
        onConfirm={confirmDissolve}
      />
    </div>
  )
}
