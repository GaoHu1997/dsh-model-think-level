/**
 * The Responses history-compatibility section of a provider's advanced
 * configuration.
 *
 * It is a SECTION of the advanced pane, like the disguise switch: it renders
 * inside the request-header section's container, below the headers table, and
 * shares the pane's single commit row — a switch clicked and then abandoned
 * with 取消 never reaches the host.
 *
 * The switch exists because a relay may answer a continued conversation with
 * `The requested item was created under a different Azure OpenAI resource`
 * whenever its upstream pool moved the topic to another account. Recovery
 * replays the request with the foreign-looking parts of the history removed,
 * which is why it is opt-in per route: it costs extra upstream calls, and only
 * on a refusal that is worth them.
 *
 * @module dsh-model-think-level/client/HistoryCompatEditor
 */

import { useCallback, useEffect, useId, useRef, useState, type ReactNode } from 'react'
import { HISTORY_COMPAT_PATH, PLUGIN_ID } from '../constants.js'

/** What `GET /dsh-model-think-level/history-compat` answers. */
interface HistoryCompatStatus {
  readonly providers: Readonly<Record<string, true>>
  /**
   * Whether this build's request seams are in place.
   *
   * Optional on purpose: a write reply that carries only the stored document
   * must not be read as "the seams are gone". Absent means "no news", and the
   * pane keeps what the last read told it.
   */
  readonly installed?: boolean
}

interface HistoryCompatReply {
  readonly ok?: unknown
  readonly data?: unknown
  readonly error?: unknown
}

/** The switch's copy, as the host slot hands it down. */
type Copy = (key: string, params?: Record<string, string | number>) => string

function statusOf(reply: HistoryCompatReply): HistoryCompatStatus | undefined {
  const data = reply.data
  if (typeof data !== 'object' || data === null) return undefined
  const record = data as Record<string, unknown>
  const providers: Record<string, true> = {}
  const raw = record['providers']
  if (typeof raw === 'object' && raw !== null && !Array.isArray(raw)) {
    for (const [route, value] of Object.entries(raw as Record<string, unknown>)) {
      if (value === true) providers[route] = true
    }
  }
  // `installed` is carried over only when the answer actually says something
  // about it; a write reply that omits the field must not repaint the warning.
  const installed = record['installed']
  return typeof installed === 'boolean' ? { providers, installed } : { providers }
}

/** Everything the switch needs to paint: no reads, no writes. */
export interface HistoryCompatEditorProps {
  /** Localized copy. */
  t: Copy
  /** The draft the pane currently holds. */
  value: boolean
  /** Whether this build's request seams are in place. */
  installed: boolean
  /** Disable the options (the stored value is still being read). */
  disabled?: boolean
  /** Report a choice; the pane decides when it is written. */
  onChange: (next: boolean) => void
}

/**
 * Render the history-compatibility switch.
 * @param props - draft value, availability and the change sink.
 * @returns the section.
 */
export function HistoryCompatEditor({ t, value, installed, disabled = false, onChange }: HistoryCompatEditorProps): ReactNode {
  // One row: the title on the left, the switch on the right. What recovery does
  // and what it costs used to be two paragraphs above the buttons; they now
  // live in the row's tooltip and in an off-screen description for assistive
  // tech, so the section is a single line of the pane.
  const id = useId()
  const titleId = `${id}-title`
  const hintId = `${id}-hint`
  const hint = t('historyCompatHint') + ' ' + t('historyCompatCost')
  return (
    <div className="bre-camouflage" data-plugin={PLUGIN_ID} data-open="1" data-section="history-compat" title={hint}>
      <span className="bre-effort-title" id={titleId}>{t('historyCompatTitle')}</span>
      <label className="bre-thinking-switch bre-camouflage-toggle">
        <input
          type="checkbox"
          role="switch"
          checked={value}
          disabled={disabled}
          aria-labelledby={titleId}
          aria-describedby={hintId}
          onChange={(event) => { onChange(event.target.checked) }}
        />
        <span className="bre-effort-switch-track" aria-hidden="true" />
      </label>
      <span className="bre-sr-only" id={hintId}>{hint}</span>
      {installed ? null : <p className="bre-camouflage-warn">{t('historyCompatUnavailable')}</p>}
    </div>
  )
}

/** The draft one route's pane holds, plus the two seams the pane drives. */
export interface HistoryCompatDraft {
  /** The value on screen — the draft, not necessarily the stored one. */
  value: boolean
  /** The value the host currently has, i.e. what 取消 restores. */
  saved: boolean
  /** Whether this build's request seams are in place. */
  installed: boolean
  /** Whether the stored value is still being read. */
  loading: boolean
  /** Replace the draft. Writes nothing. */
  setValue: (next: boolean) => void
  /** Restore the stored value (the pane's 取消). */
  reset: () => void
  /** Write the draft, if it differs from the stored value. */
  commit: () => Promise<void>
}

/**
 * Read, hold and commit one route's history-compatibility switch.
 *
 * The stored value is read once per route and seeds the draft; nothing is
 * written until {@link HistoryCompatDraft.commit} runs.
 * @param route - the provider route this pane edits.
 * @returns the draft and its seams.
 */
export function useHistoryCompat(route: string): HistoryCompatDraft {
  const [saved, setSaved] = useState(false)
  const [value, setValue] = useState(false)
  const [installed, setInstalled] = useState(true)
  const [loading, setLoading] = useState(true)
  const savedRef = useRef(false)
  const valueRef = useRef(false)
  const alive = useRef(true)

  useEffect(() => {
    alive.current = true
    return () => { alive.current = false }
  }, [])

  useEffect(() => {
    if (route === '') {
      setLoading(false)
      return undefined
    }
    let cancelled = false
    setLoading(true)
    void fetch(HISTORY_COMPAT_PATH, { method: 'GET' })
      .then(async response => await response.json() as HistoryCompatReply)
      .then((reply) => {
        if (cancelled || !alive.current) return
        const status = statusOf(reply)
        if (status === undefined) return
        const stored = status.providers[route] === true
        savedRef.current = stored
        valueRef.current = stored
        setSaved(stored)
        setValue(stored)
        if (status.installed !== undefined) setInstalled(status.installed)
      })
      .catch(() => { /* the switch stays off; Save still reports a failure */ })
      .finally(() => {
        if (!cancelled && alive.current) setLoading(false)
      })
    return () => { cancelled = true }
  }, [route])

  const choose = useCallback((next: boolean): void => {
    valueRef.current = next
    setValue(next)
  }, [])

  const reset = useCallback((): void => {
    valueRef.current = savedRef.current
    setValue(savedRef.current)
  }, [])

  const commit = useCallback(async (): Promise<void> => {
    if (route === '' || valueRef.current === savedRef.current) return
    const target = valueRef.current
    const response = await fetch(HISTORY_COMPAT_PATH, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ route, enabled: target }),
    })
    const reply = await response.json() as HistoryCompatReply
    if (!response.ok || reply.ok !== true) throw new Error('history-compat write rejected')
    const status = statusOf(reply)
    savedRef.current = target
    valueRef.current = target
    setSaved(target)
    setValue(target)
    if (status !== undefined && status.installed !== undefined) setInstalled(status.installed)
  }, [route])

  return { value, saved, installed, loading, setValue: choose, reset, commit }
}
