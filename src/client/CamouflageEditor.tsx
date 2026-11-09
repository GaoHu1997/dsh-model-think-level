/**
 * The request-camouflage section of a provider's advanced configuration.
 *
 * It is a SECTION of the advanced pane, not a second card: it renders inside
 * the request-header section's own container (`HeadersEditor` takes it as
 * `extras`), below the header table and above the pane's single commit row, and
 * separates itself from the headers with the same hairline the host draws
 * between card sections. That is also what puts the pane's 取消/保存 under BOTH
 * sections, which is the shape the pane was supposed to have: one form, one
 * commit row.
 *
 * The choice is a DRAFT until the pane's Save runs. This module therefore only
 * renders the switch; {@link useCamouflage} holds the draft, reads the stored
 * value and commits it, and the pane wires the commit into its own Save. A
 * preset that is clicked and then abandoned with 取消 never reaches the host.
 *
 * The create-provider card has no commit row of its own (its 保存 is the
 * official one that declares the route), so it uses {@link CamouflageField}:
 * the same switch, committed as soon as it is chosen — inert until the route
 * exists, which is exactly the moment that card's 保存 creates it.
 *
 * @module dsh-model-think-level/client/CamouflageEditor
 */

import { useCallback, useEffect, useId, useRef, useState, type ReactNode } from 'react'
import { CAMOUFLAGE_PATH, PLUGIN_ID } from '../constants.js'

/** One identity the host understands. Kept in step with `camouflage.ts`. */
type CamouflagePreset = 'codex' | 'claude'

/** What `GET /dsh-model-think-level/camouflage` answers. */
interface CamouflageStatus {
  readonly presets: readonly CamouflagePreset[]
  readonly providers: Readonly<Record<string, CamouflagePreset>>
  readonly installed: boolean
}

interface CamouflageReply {
  readonly ok?: unknown
  readonly data?: unknown
  readonly error?: unknown
}

/** The identities this build offers, in display order. */
const OPTIONS: readonly { value: CamouflagePreset | undefined; labelKey: string }[] = [
  { value: undefined, labelKey: 'camouflageOff' },
  { value: 'codex', labelKey: 'camouflageCodex' },
  { value: 'claude', labelKey: 'camouflageClaude' },
]

function isPreset(value: unknown): value is CamouflagePreset {
  return value === 'codex' || value === 'claude'
}

function statusOf(reply: CamouflageReply): CamouflageStatus | undefined {
  const data = reply.data
  if (typeof data !== 'object' || data === null) return undefined
  const record = data as Record<string, unknown>
  const providers: Record<string, CamouflagePreset> = {}
  const raw = record['providers']
  if (typeof raw === 'object' && raw !== null && !Array.isArray(raw)) {
    for (const [route, value] of Object.entries(raw as Record<string, unknown>)) {
      if (isPreset(value)) providers[route] = value
    }
  }
  return {
    presets: ['codex', 'claude'],
    providers,
    installed: record['installed'] === true,
  }
}

/** The switch's copy, as the host slot hands it down. */
type Copy = (key: string, params?: Record<string, string | number>) => string

/** Everything the switch needs to paint: no reads, no writes. */
export interface CamouflageEditorProps {
  /** Localized copy. */
  t: Copy
  /** The draft the pane currently holds; `undefined` is 关闭. */
  value: CamouflagePreset | undefined
  /** Whether this build's request seams are in place. */
  installed: boolean
  /** Disable the options (the stored value is still being read). */
  disabled?: boolean
  /** Report a choice; the pane decides when it is written. */
  onChange: (next: CamouflagePreset | undefined) => void
}

/**
 * Render the disguise switch.
 *
 * Presentational on purpose: the pane's Save owns the write, so a click here
 * changes what the form holds and nothing else.
 * @param props - draft value, availability and the change sink.
 * @returns the section.
 */
export function CamouflageEditor({ t, value, installed, disabled = false, onChange }: CamouflageEditorProps): ReactNode {
  // One row, not a stack: the title on the left, the three choices on the right.
  // The paragraph that used to explain the choices above them is still in the
  // DOM for assistive tech (`aria-describedby`) and in the row's `title` for a
  // pointer, so the section costs a single line instead of four.
  const id = useId()
  const titleId = `${id}-title`
  const hintId = `${id}-hint`
  return (
    <div className="bre-camouflage" data-plugin={PLUGIN_ID} data-open="1" title={t('camouflageHint')}>
      <span className="bre-effort-title" id={titleId}>{t('camouflageTitle')}</span>
      <div
        className="bre-camouflage-options"
        role="radiogroup"
        aria-labelledby={titleId}
        aria-describedby={hintId}
      >
        {OPTIONS.map(option => (
          <button
            key={option.value ?? 'off'}
            type="button"
            role="radio"
            aria-checked={value === option.value}
            className="bre-camouflage-option"
            data-active={value === option.value ? '1' : '0'}
            disabled={disabled}
            onClick={() => { onChange(option.value) }}
          >
            {t(option.labelKey)}
          </button>
        ))}
      </div>
      <span className="bre-sr-only" id={hintId}>{t('camouflageHint')}</span>
      {installed ? null : <p className="bre-camouflage-warn">{t('camouflageUnavailable')}</p>}
    </div>
  )
}

/** The draft one route's pane holds, plus the two seams the pane drives. */
export interface CamouflageDraft {
  /** The value on screen — the draft, not necessarily the stored one. */
  value: CamouflagePreset | undefined
  /** The value the host currently has, i.e. what 取消 restores. */
  saved: CamouflagePreset | undefined
  /** Whether this build's request seams are in place. */
  installed: boolean
  /** Whether the stored value is still being read. */
  loading: boolean
  /** Replace the draft. Writes nothing. */
  setValue: (next: CamouflagePreset | undefined) => void
  /** Restore the stored value (the pane's 取消). */
  reset: () => void
  /**
   * Write the draft, if it differs from the stored value.
   *
   * Rejects when the host route could not be reached, so the pane can keep
   * itself open instead of dismissing over a write that did not happen.
   * @param next - the value to write instead of the one on screen (an
   *   immediate-mode caller passes its own choice: state updates are async).
   */
  commit: (next?: { preset: CamouflagePreset | undefined }) => Promise<void>
}

/**
 * Read, hold and commit one route's disguise.
 *
 * The stored value is read once per route and seeds the draft; nothing is
 * written until {@link CamouflageDraft.commit} runs.
 * @param route - the provider route this pane edits.
 * @param t - localized copy (for the error the caller renders).
 * @returns the draft and its seams.
 */
export function useCamouflage(route: string, t: Copy): CamouflageDraft {
  const [saved, setSaved] = useState<CamouflagePreset | undefined>(undefined)
  const [value, setValue] = useState<CamouflagePreset | undefined>(undefined)
  const [installed, setInstalled] = useState(true)
  const [loading, setLoading] = useState(true)
  const savedRef = useRef<CamouflagePreset | undefined>(undefined)
  const valueRef = useRef<CamouflagePreset | undefined>(undefined)
  const alive = useRef(true)
  void t

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
    void fetch(CAMOUFLAGE_PATH, { method: 'GET' })
      .then(async response => await response.json() as CamouflageReply)
      .then((reply) => {
        if (cancelled || !alive.current) return
        const status = statusOf(reply)
        if (status === undefined) return
        const stored = status.providers[route]
        savedRef.current = stored
        valueRef.current = stored
        setSaved(stored)
        setValue(stored)
        setInstalled(status.installed)
      })
      .catch(() => { /* the switch stays on 关闭; Save still reports a failure */ })
      .finally(() => {
        if (!cancelled && alive.current) setLoading(false)
      })
    return () => { cancelled = true }
  }, [route])

  const choose = useCallback((next: CamouflagePreset | undefined): void => {
    valueRef.current = next
    setValue(next)
  }, [])

  const reset = useCallback((): void => {
    valueRef.current = savedRef.current
    setValue(savedRef.current)
  }, [])

  const commit = useCallback(async (next?: { preset: CamouflagePreset | undefined }): Promise<void> => {
    const target = next === undefined ? valueRef.current : next.preset
    if (route === '' || target === savedRef.current) return
    const response = await fetch(CAMOUFLAGE_PATH, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ route, preset: target ?? null }),
    })
    const reply = await response.json() as CamouflageReply
    if (!response.ok || reply.ok !== true) throw new Error('camouflage write rejected')
    const status = statusOf(reply)
    savedRef.current = target
    valueRef.current = target
    setSaved(target)
    setValue(target)
    if (status !== undefined) setInstalled(status.installed)
  }, [route])

  return { value, saved, installed, loading, setValue: choose, reset, commit }
}

/**
 * The create-provider card's copy of the section: the same switch, committed
 * on click.
 *
 * That card has no commit row — the official 保存 declares the route the
 * disguise is addressed to — so holding a draft here would have nothing to
 * release it. The write is inert until that route exists, so choosing here and
 * saving the card is still the one moment the identity starts being sent.
 */
export function CamouflageField({ route, t }: { route: string; t: Copy }): ReactNode {
  const draft = useCamouflage(route, t)
  const [message, setMessage] = useState<{ kind: 'success' | 'error'; text: string } | undefined>(undefined)
  const choose = useCallback((next: CamouflagePreset | undefined): void => {
    draft.setValue(next)
    setMessage(undefined)
    void draft.commit({ preset: next })
      .then(() => { setMessage(undefined) })
      .catch(() => { draft.setValue(undefined); setMessage({ kind: 'error', text: t('camouflageError') }) })
  }, [draft, t])
  return (
    <>
      <CamouflageEditor
        t={t}
        value={draft.value}
        installed={draft.installed}
        disabled={draft.loading || route === ''}
        onChange={choose}
      />
      {message === undefined
        ? null
        : (
          <p className={'bre-effort-message bre-' + message.kind} role={message.kind === 'error' ? 'alert' : 'status'}>
            {message.text}
          </p>
        )}
    </>
  )
}
