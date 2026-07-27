import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { Button, ConfirmDialog, ErrorText } from './ui'
import { AvatarIcon } from './AvatarIcon'
import { useLanguage } from '../i18n/LanguageContext'
import type { MyGameView, PublicPlayer } from '../types/game'

/** Outils de modération de l'hôte : retirer un joueur (salon ou partie en
 * cours) et gérer une liste de mots interdits dans le chat. Réutilisé tel
 * quel dans le salon d'attente (Lobby) et en partie (menu ⋮ de GameRoom) —
 * l'hôte peut modérer à tout moment, pas seulement avant le lancement. */
export function ModerationPanel({ view, gameId, selfId }: { view: MyGameView; gameId: string; selfId: string }) {
  const { t } = useLanguage()
  const [words, setWords] = useState<string[]>(view.game.blocked_words ?? [])
  const [wordInput, setWordInput] = useState('')
  const [savingWords, setSavingWords] = useState(false)
  const [kickTarget, setKickTarget] = useState<PublicPlayer | null>(null)
  const [kicking, setKicking] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    setWords(view.game.blocked_words ?? [])
  }, [view.game.blocked_words])

  async function saveWords(next: string[]) {
    setWords(next)
    setSavingWords(true)
    setError(null)
    const { error: rpcError } = await supabase.rpc('set_blocked_words', { p_game_id: gameId, p_words: next })
    setSavingWords(false)
    if (rpcError) setError(rpcError.message)
  }

  function addWord() {
    const w = wordInput.trim().toLowerCase()
    setWordInput('')
    if (!w || words.includes(w)) return
    void saveWords([...words, w])
  }

  function removeWord(w: string) {
    void saveWords(words.filter((x) => x !== w))
  }

  async function confirmKick() {
    if (!kickTarget) return
    setKicking(true)
    setError(null)
    const { error: rpcError } = await supabase.rpc('kick_player', {
      p_game_id: gameId,
      p_target_user_id: kickTarget.user_id,
    })
    setKicking(false)
    if (rpcError) {
      setError(rpcError.message)
      return
    }
    setKickTarget(null)
  }

  const isLobbyOrEnded = view.game.status === 'lobby' || view.game.status === 'ended'
  const others = view.players.filter((p) => p.user_id !== selfId && !p.is_banned)

  return (
    <div className="flex flex-col gap-5">
      <ErrorText>{error}</ErrorText>

      <div>
        <h3 className="mb-2 font-display text-sm text-moon-300">{t('moderation.blockedWordsTitle')}</h3>
        <div className="mb-2 flex flex-wrap gap-1.5">
          {words.length === 0 && <p className="text-xs text-moon-200/40">{t('moderation.noBlockedWords')}</p>}
          {words.map((w) => (
            <span
              key={w}
              className="flex items-center gap-1.5 rounded-full border border-night-600/60 bg-night-800/60 px-2.5 py-1 text-xs text-moon-200/80"
            >
              {w}
              <button
                type="button"
                onClick={() => removeWord(w)}
                disabled={savingWords}
                title={t('moderation.removeWordTitle')}
                className="text-moon-200/40 transition-colors hover:text-blood-400"
              >
                ✕
              </button>
            </span>
          ))}
        </div>
        <div className="flex gap-2">
          <input
            value={wordInput}
            onChange={(e) => setWordInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault()
                addWord()
              }
            }}
            placeholder={t('moderation.addWordPlaceholder')}
            maxLength={40}
            className="min-w-0 flex-1 rounded-xl border border-night-600 bg-night-800/70 px-3 py-2 text-sm text-moon-200 outline-none placeholder:text-moon-200/30 focus:border-moon-400/50"
          />
          <Button variant="ghost" className="px-3 py-2 text-xs" disabled={savingWords || !wordInput.trim()} onClick={addWord}>
            {t('moderation.addWordButton')}
          </Button>
        </div>
      </div>

      <div>
        <h3 className="mb-2 font-display text-sm text-moon-300">{t('moderation.removePlayerTitle')}</h3>
        {others.length === 0 ? (
          <p className="text-xs text-moon-200/40">{t('moderation.noOtherPlayers')}</p>
        ) : (
          <ul className="flex flex-col gap-1.5">
            {others.map((p) => (
              <li
                key={p.id}
                className="flex items-center justify-between rounded-xl border border-night-600/60 bg-night-900/40 px-3 py-2 text-sm"
              >
                <span className="min-w-0 truncate text-moon-200/90">
                  <AvatarIcon icon={p.avatar_icon} className="mr-1 inline-block h-3.5 w-3.5 -translate-y-px align-middle" />{' '}
                  {p.display_name}
                  {!p.is_alive && !isLobbyOrEnded && <span className="ml-1.5 text-xs text-moon-200/40">{t('moderation.ghostTag')}</span>}
                </span>
                <Button variant="danger" className="shrink-0 px-2.5 py-1 text-xs" onClick={() => setKickTarget(p)}>
                  {t('moderation.removeButton')}
                </Button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <ConfirmDialog
        open={!!kickTarget}
        title={t('moderation.kickConfirmTitle')}
        message={t(isLobbyOrEnded ? 'moderation.kickMessageLobby' : 'moderation.kickMessageGame', {
          name: kickTarget?.display_name ?? '',
        })}
        confirmLabel={kicking ? t('moderation.removing') : t('moderation.removeButton')}
        danger
        onCancel={() => setKickTarget(null)}
        onConfirm={confirmKick}
      />
    </div>
  )
}
