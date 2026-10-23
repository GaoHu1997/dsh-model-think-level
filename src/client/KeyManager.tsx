/**
 * The API-key list: one provider's keys, the model scope each key serves, the
 * wire protocol each key speaks, the provider's two base URLs, and the one
 * inline form that adds, relabels, replaces a key or edits its scope.
 *
 * Rendered inline under the official key field (see `injection/key-manager`),
 * not as a floating panel: the field's label already says "API key", so its list
 * belongs directly beneath it, inside the card that owns the profile — the list
 * reads as part of the field rather than as a surface that has to be opened,
 * positioned and dismissed.
 *
 * The list is a view over host state and holds no truth of its own — every
 * mutation answers with the whole list, and the list is adopted as it arrives
 * (`adopt`), so the GUI can never drift from what the settings document and the
 * credential store actually say. The facts it reflects:
 *
 *   - **every listed key is active.** There is no single "in use" seat any more:
 *     the keys are ordered by preference, the FIRST (marked Default) signs any
 *     model that more than one key can serve, a model only one key lists sticks
 *     to that key, and a failed request fails over to the next capable key. The
 *     old per-row radio is gone because the model, not a global switch, decides.
 *   - **each key shows the models it serves.** Picked as chips from the models
 *     the route already offers — never the provider's whole catalog — so no one
 *     has to recall a model id, and an empty scope means "catch-all", serving
 *     whatever is left. The scope summary shares the hover-revealed action tray,
 *     so a resting row stays quiet.
 *   - **each key may pin a wire protocol.** A key that pins a protocol speaks
 *     that API shape (Anthropic Messages, Chat Completions or Responses) instead
 *     of the provider's default, and uses the matching base URL. A key left on
 *     "default protocol" follows the route's own API protocol. The protocol
 *     picker lives in the same hover-revealed action tray as the other actions.
 *   - **a value is shown masked, or not at all.** The host reads the stored
 *     secret and answers a head-and-tail preview; the middle never leaves it,
 *     and the eye beside the field stays the one gesture that reveals a value.
 *   - **one form serves all edits.** Adding, relabelling, replacing a value and
 *     editing a scope differ only in which fields the form shows, so they share
 *     one form rendered as the row below the row they act on — for an add, the
 *     list's last row.
 *
 * @module dsh-model-think-level/client/KeyManager
 */

import { Fragment, useCallback, useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import {
  isLegalKeyValue,
  normalizeKeyAlias,
  type RouteProtocol,
} from '../key-refs.js'
import {
  httpKeyManagerClient,
  type KeyAnswer,
  type KeyManagerClient,
  type KeyRow,
} from './key-manager-client.js'

/** The repo's inline translator shape. */
type Translate = (key: string, params?: Record<string, string | number>) => string

/** Props of {@link KeyManager}. */
export interface KeyManagerProps {
  /** The provider route whose keys this list manages. */
  readonly route: string
  /** Copy for the list's labels. */
  readonly t: Translate
  /** Transport; injectable for tests. */
  readonly client?: KeyManagerClient | undefined
}

/** A transient line under the list: the host's refusal, or a confirmation. */
interface Notice {
  readonly kind: 'error' | 'status'
  readonly text: string
}

/** Which form is open, and on which row. */
interface Editing {
  readonly kind: 'add' | 'alias' | 'value' | 'scope'
  readonly ref?: string | undefined
}

/** The circle-plus drawn on the row that opens the add form. */
const PLUS_PATHS: readonly string[] = ['M8 3.9v8.2', 'M3.9 8h8.2']

/** The tick drawn inside a selected model chip. */
const CHECK_PATH = 'M3.9 8.35 6.6 11.05 12.1 5.5'

/** One 16px stroke glyph, on the same grid the injected controls draw on. */
function Glyph({ paths }: { paths: readonly string[] }): ReactNode {
  return (
    <svg
      viewBox="0 0 16 16"
      width={16}
      height={16}
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      {paths.map(d => (
        <path key={d} d={d} />
      ))}
    </svg>
  )
}

/**
 * What a row shows where its stored value would be.
 *
 * The host masks the value it read; when it could not read one at all, a row
 * that the store says holds nothing says so instead of pretending to hide a
 * secret, and a row the store would not answer for shows the mask alone — the
 * absence of a preview is the store's answer, not a claim about the key.
 */
function previewOf(row: KeyRow, t: Translate): string {
  if (row.masked !== undefined) return row.masked
  return row.configured === false ? t('keysMissing') : '••••••••'
}

/** How a row is named in its controls: its label, its preview, or its ref. */
function nameOf(row: KeyRow): string {
  return row.alias ?? row.masked ?? row.ref
}

/**
 * The one-line summary of a row's model scope: a count when it lists models,
 * or the "all models" / "none discovered" state when it does not.
 */
function scopeText(row: KeyRow, t: Translate): string {
  if (row.models === undefined) return t('keysScopeAll')
  if (row.models.length === 0) return t('keysScopeNone')
  return t('keysScopeCount', { count: row.models.length })
}

/**
 * Parse a comma- or whitespace-separated model list from a scope field.
 * @returns the deduped model ids, or undefined to clear the scope (catch-all).
 */
function parseScope(text: string): string[] | undefined {
  const seen = new Set<string>()
  const models: string[] = []
  for (const token of text.split(/[\s,]+/u)) {
    const model = token.trim()
    if (model.length > 0 && !seen.has(model)) {
      seen.add(model)
      models.push(model)
    }
  }
  return models.length === 0 ? undefined : models
}

/** The protocols a key may pin, in the picker's order (undefined = any). */
const PROTOCOL_CHOICES: readonly RouteProtocol[] = ['anthropic-messages', 'openai-completions', 'openai-responses']

/** A protocol's short human label for the picker's trigger. */
function protocolLabel(protocol: RouteProtocol | undefined, t: Translate): string {
  if (protocol === 'anthropic-messages') return t('keysProtocolAnthropic')
  if (protocol === 'openai-responses') return t('keysProtocolResponses')
  if (protocol === 'openai-completions') return t('keysProtocolOpenAI')
  return t('keysProtocolAny')
}

/**
 * Render the key list for one provider route.
 * @param props - see {@link KeyManagerProps}.
 * @returns the list's root element.
 */
export function KeyManager(props: KeyManagerProps): ReactNode {
  const { route, t } = props
  const client = props.client ?? httpKeyManagerClient

  const [rows, setRows] = useState<readonly KeyRow[] | undefined>(undefined)
  const [routeModels, setRouteModels] = useState<readonly string[]>([])
  const [notice, setNotice] = useState<Notice | undefined>(undefined)
  const [busy, setBusy] = useState(false)
  const [editing, setEditing] = useState<Editing | undefined>(undefined)
  const [nameDraft, setNameDraft] = useState('')
  const [valueDraft, setValueDraft] = useState('')
  const [scopeDraft, setScopeDraft] = useState<readonly string[]>([])
  const [confirming, setConfirming] = useState<string | undefined>(undefined)

  /**
   * Adopt whatever the host just answered. A refusal keeps the list that is
   * already on screen — a failed write changed nothing, so showing an empty
   * list would be a lie about the state of the document.
   */
  const adopt = useCallback(
    (answer: KeyAnswer, okText: string | undefined): void => {
      if (!answer.ok) {
        setNotice({ kind: 'error', text: answer.error ?? t('keysUnreachable') })
        return
      }
      setRows(answer.entries)
      setRouteModels(answer.models ?? [])
      setNotice(okText === undefined ? undefined : { kind: 'status', text: okText })
    },
    [t],
  )

  useEffect(() => {
    let live = true
    void (async () => {
      const answer = await client.list(route)
      if (live) adopt(answer, undefined)
    })()
    return () => {
      live = false
    }
  }, [adopt, client, route])

  /** Run one mutation, then take the host's word for the new list. */
  const run = useCallback(
    async (action: () => Promise<KeyAnswer>, okText: string): Promise<void> => {
      setBusy(true)
      setConfirming(undefined)
      setEditing(undefined)
      try {
        adopt(await action(), okText)
      } finally {
        setBusy(false)
      }
    },
    [adopt],
  )

  const closeForm = (): void => {
    setEditing(undefined)
    setNameDraft('')
    setValueDraft('')
    setScopeDraft([])
  }

  const openForm = (kind: 'alias' | 'value' | 'scope', row: KeyRow): void => {
    setEditing({ kind, ref: row.ref })
    setNameDraft(kind === 'alias' ? row.alias ?? '' : '')
    // The scope field is seeded with the model list it currently holds.
    setValueDraft(kind === 'scope' ? row.models?.join(', ') ?? '' : '')
    setScopeDraft(row.models ?? [])
    setConfirming(undefined)
  }

  /**
   * Write what the open form holds. The four kinds differ only in which fields
   * they showed, so they share one submit: an add stores a new reference, a
   * relabel writes the label, a replace swaps the secret of the reference already
   * on the row, and a scope edit rewrites the models that reference serves.
   */
  const submit = (): void => {
    if (busy || editing === undefined) return
    const kind = editing.kind
    const ref = editing.ref
    // An alias-only edit accepts an empty field: that is how a label is cleared.
    if (kind !== 'alias' && kind !== 'scope' && !isLegalKeyValue(valueDraft)) return
    const alias = normalizeKeyAlias(nameDraft)
    setBusy(true)
    void (async () => {
      try {
        if (kind === 'add') {
          const answer = await client.add(route, valueDraft, alias)
          adopt(answer, t('keysAdded'))
          if (answer.ok) closeForm()
          return
        }
        if (ref === undefined) return
        if (kind === 'scope') {
          const answer = await client.setScope(route, ref, scopeDraft.length === 0 ? undefined : scopeDraft)
          adopt(answer, t('keysScopeSaved'))
          if (answer.ok) closeForm()
          return
        }
        const answer =
          kind === 'alias' ? await client.rename(route, ref, alias) : await client.replace(route, ref, valueDraft)
        adopt(answer, kind === 'alias' ? t('keysRenamed') : t('keysReplaced'))
        if (answer.ok) closeForm()
      } finally {
        setBusy(false)
      }
    })()
  }

  /** Toggle one model in the scope draft. */
  const toggleModel = (model: string): void => {
    setScopeDraft(current =>
      current.includes(model) ? current.filter(entry => entry !== model) : [...current, model],
    )
  }

  /**
   * The one inline form, shaped by the edit it is open for. A scope edit shows
   * the model chips (图1) rather than a free-text field: the user picks from the
   * models the provider actually offers, so no one has to recall a model id.
   */
  const form = (): ReactNode => {
    if (editing === undefined) return null
    const kind = editing.kind
    const wantsValue = kind === 'add' || kind === 'value'
    const wantsScope = kind === 'scope'
    const illegal = wantsValue && valueDraft.length > 0 && !isLegalKeyValue(valueDraft)
    return (
      <div className="bre-keys-form">
        {wantsScope ? (
          <div className="bre-keys-chips" role="group" aria-label={t('keysScope')}>
            {routeModels.length === 0 ? (
              <p className="bre-keys-hint">{t('keysScopeEmpty')}</p>
            ) : (
              routeModels.map(model => {
                const selected = scopeDraft.includes(model)
                return (
                  <button
                    key={model}
                    type="button"
                    className={selected ? 'bre-keys-chip is-selected' : 'bre-keys-chip'}
                    aria-pressed={selected}
                    disabled={busy}
                    onClick={() => toggleModel(model)}
                  >
                    {selected ? (
                      <span className="bre-keys-chip-mark" aria-hidden="true">
                        <Glyph paths={[CHECK_PATH]} />
                      </span>
                    ) : null}
                    {model}
                  </button>
                )
              })
            )}
          </div>
        ) : (
          <div className="bre-keys-form-fields">
            {kind === 'value' ? null : (
              <input
                className="bre-text-input bre-keys-name"
                type="text"
                value={nameDraft}
                placeholder={t('keysAliasPlaceholder')}
                aria-label={t('keysAlias')}
                disabled={busy}
                autoFocus={kind === 'alias'}
                onChange={event => setNameDraft(event.target.value)}
              />
            )}
            {wantsValue ? (
              <input
                className="bre-text-input bre-keys-secret"
                type="password"
                autoComplete="new-password"
                spellCheck={false}
                value={valueDraft}
                placeholder={kind === 'add' ? t('keysValuePlaceholder') : t('keysNewValuePlaceholder')}
                aria-label={t('keysValue')}
                aria-invalid={illegal}
                disabled={busy}
                autoFocus
                onChange={event => setValueDraft(event.target.value)}
              />
            ) : null}
          </div>
        )}
        {wantsScope ? <p className="bre-keys-hint">{t('keysScopeHint')}</p> : null}
        {illegal ? (
          <p className="bre-effort-message bre-error" role="alert">
            {t('keysAddIllegal')}
          </p>
        ) : null}
        <div className="bre-keys-form-actions">
          {wantsScope ? (
            <button
              type="button"
              className="bre-link-button bre-keys-allmodels"
              disabled={busy}
              onClick={() => setScopeDraft([])}
            >
              {t('keysScopeAll')}
            </button>
          ) : null}
          <button type="button" className="bre-link-button" disabled={busy} onClick={closeForm}>
            {t('keysCancel')}
          </button>
          <button
            type="button"
            className="bre-primary-button"
            disabled={busy || (wantsValue && !isLegalKeyValue(valueDraft))}
            onClick={submit}
          >
            {kind === 'add' ? t('keysAddConfirm') : t('keysSave')}
          </button>
        </div>
      </div>
    )
  }

  /**
   * The entry that adds a key: the list's own last item, or the form once it is
   * open. It is offered even when the list could not be read — adding a key
   * needs no list — so a failed read must not leave the user with no way out.
   */
  const addEntry = (): ReactNode =>
    editing?.kind === 'add' ? (
      <li className="bre-keys-form-row">{form()}</li>
    ) : (
      <li className="bre-keys-add-row">
        <button
          type="button"
          className="bre-keys-add"
          disabled={busy}
          onClick={() => {
            setEditing({ kind: 'add' })
            setNameDraft('')
            setValueDraft('')
            setScopeDraft([])
            setConfirming(undefined)
          }}
        >
          <span className="bre-keys-add-mark" aria-hidden="true">
            <Glyph paths={PLUS_PATHS} />
          </span>
          {t('keysAdd')}
        </button>
      </li>
    )

  /** Change one key's pinned protocol; undefined restores the route's own. */
  const changeProtocol = (row: KeyRow, next: string): void => {
    const protocol = next === '' ? undefined : (next as RouteProtocol)
    void run(() => client.setProtocol(route, row.ref, protocol), t('keysProtocolSaved'))
  }

  if (rows === undefined) {
    // Still reading: NOTHING, until the answer lands. A read that FAILED says so
    // instead of appearing to load forever, and still offers the add entry.
    if (notice === undefined) return <div className="bre-keys" />
    return (
      <div className="bre-keys">
        <p className={'bre-effort-message bre-' + notice.kind} role={notice.kind === 'error' ? 'alert' : 'status'}>
          {notice.text}
        </p>
        <ul className="bre-keys-list">{addEntry()}</ul>
      </div>
    )
  }

  return (
    <div className="bre-keys">
      <ul className="bre-keys-list">
        {rows.map(row => {
          const name = nameOf(row)
          return (
            <Fragment key={row.ref}>
              <li className="bre-keys-row" data-state={row.configured === false ? 'missing' : 'ready'}>
                {row.primary ? <span className="bre-keys-default">{t('keysDefault')}</span> : null}
                {row.alias === undefined ? null : <span className="bre-keys-alias">{row.alias}</span>}
                <span className={row.alias === undefined ? 'bre-keys-mask bre-keys-mask-plain' : 'bre-keys-mask'}>
                  {previewOf(row, t)}
                </span>
                <span className="bre-keys-actions">
                  {confirming === row.ref ? (
                    <>
                      <button
                        type="button"
                        className="bre-link-button bre-keys-danger"
                        disabled={busy}
                        onClick={() => void run(() => client.remove(route, row.ref), t('keysRemoved'))}
                      >
                        {t('keysConfirmRemove')}
                      </button>
                      <button
                        type="button"
                        className="bre-link-button"
                        disabled={busy}
                        onClick={() => setConfirming(undefined)}
                      >
                        {t('keysCancel')}
                      </button>
                    </>
                  ) : (
                    <>
                      <span className="bre-keys-scope-label">{scopeText(row, t)}</span>
                      <select
                        className="bre-keys-protocol"
                        value={row.protocol ?? ''}
                        aria-label={t('keysProtocolLabel', { name })}
                        title={t('keysProtocolLabel', { name })}
                        disabled={busy}
                        onChange={event => changeProtocol(row, event.target.value)}
                      >
                        <option value="">{t('keysProtocolDefault')}</option>
                        {PROTOCOL_CHOICES.map(protocol => (
                          <option key={protocol} value={protocol}>
                            {protocolLabel(protocol, t)}
                          </option>
                        ))}
                      </select>
                      <button
                        type="button"
                        className="bre-link-button"
                        disabled={busy}
                        onClick={() => {
                          setConfirming(row.ref)
                          setEditing(undefined)
                        }}
                      >
                        {t('keysRemove')}
                      </button>
                      <button
                        type="button"
                        className="bre-link-button"
                        disabled={busy}
                        onClick={() => openForm('alias', row)}
                      >
                        {t('keysAlias')}
                      </button>
                      <button
                        type="button"
                        className="bre-link-button"
                        disabled={busy}
                        title={t('keysScope', { name })}
                        onClick={() => openForm('scope', row)}
                      >
                        {t('keysModels')}
                      </button>
                      <button
                        type="button"
                        className="bre-link-button"
                        disabled={busy}
                        onClick={() => openForm('value', row)}
                      >
                        {t('keysEdit')}
                      </button>
                    </>
                  )}
                </span>
              </li>
              {editing !== undefined && editing.ref === row.ref ? (
                <li className="bre-keys-form-row">{form()}</li>
              ) : null}
            </Fragment>
          )
        })}
        {addEntry()}
      </ul>

      {notice === undefined ? null : (
        <p className={'bre-effort-message bre-' + notice.kind} role={notice.kind === 'error' ? 'alert' : 'status'}>
          {notice.text}
        </p>
      )}
    </div>
  )
}
