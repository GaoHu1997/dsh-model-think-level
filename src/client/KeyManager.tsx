/**
 * The API-key list: one provider's keys, which one is in use, and the one
 * inline form that adds, relabels or replaces a key.
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
 * credential store actually say. Three facts it deliberately reflects:
 *
 *   - **the key in use is the profile's reference.** Choosing a row writes
 *     `providers.<route>.apiKeyEnv`, so it holds for every request the route
 *     makes, not only the ones this GUI starts. Exactly one key is in use per
 *     provider, which is why the mark at the head of a row is a radio.
 *   - **a value is shown masked, or not at all.** The host reads the stored
 *     secret and answers a head-and-tail preview; the middle never leaves it,
 *     and the eye beside the field stays the one gesture that reveals a value.
 *   - **one form serves all three edits.** Adding, relabelling and replacing a
 *     value differ only in which fields it shows, so they share a form rendered
 *     as the row below the row they act on — for an add, the list's last row.
 *
 * @module dsh-model-think-level/client/KeyManager
 */

import { Fragment, useCallback, useEffect, useId, useState } from 'react'
import type { ReactNode } from 'react'
import { isLegalKeyValue, normalizeKeyAlias } from '../key-refs.js'
import { httpKeyManagerClient, type KeyAnswer, type KeyManagerClient, type KeyRow } from './key-manager-client.js'

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
  readonly kind: 'add' | 'alias' | 'value'
  readonly ref?: string | undefined
}

/** The check drawn inside the mark of the key in use. */
const CHECK_PATH = 'M3.9 8.35 6.6 11.05 12.1 5.5'

/** The circle-plus drawn on the row that opens the add form. */
const PLUS_PATHS: readonly string[] = ['M8 3.9v8.2', 'M3.9 8h8.2']

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
 * Render the key list for one provider route.
 * @param props - see {@link KeyManagerProps}.
 * @returns the list's root element.
 */
export function KeyManager(props: KeyManagerProps): ReactNode {
  const { route, t } = props
  const client = props.client ?? httpKeyManagerClient
  const group = useId()

  const [rows, setRows] = useState<readonly KeyRow[] | undefined>(undefined)
  const [enabledRef, setEnabledRef] = useState<string | null>(null)
  const [notice, setNotice] = useState<Notice | undefined>(undefined)
  const [busy, setBusy] = useState(false)
  const [editing, setEditing] = useState<Editing | undefined>(undefined)
  const [nameDraft, setNameDraft] = useState('')
  const [valueDraft, setValueDraft] = useState('')
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
      setEnabledRef(answer.enabledRef)
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
  }

  const openForm = (kind: 'alias' | 'value', row: KeyRow): void => {
    setEditing({ kind, ref: row.ref })
    setNameDraft(kind === 'alias' ? row.alias ?? '' : '')
    setValueDraft('')
    setConfirming(undefined)
  }

  /**
   * Write what the open form holds. The three kinds differ only in which fields
   * they showed, so they share one submit: an add stores a new reference, a
   * relabel writes the label, and a replace swaps the secret of the reference
   * already on the row — never its name, its label or its seat.
   */
  const submit = (): void => {
    if (busy || editing === undefined) return
    const kind = editing.kind
    const ref = editing.ref
    // An alias-only edit accepts an empty field: that is how a label is cleared.
    if (kind !== 'alias' && !isLegalKeyValue(valueDraft)) return
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
        const answer =
          kind === 'alias' ? await client.rename(route, ref, alias) : await client.replace(route, ref, valueDraft)
        adopt(answer, kind === 'alias' ? t('keysRenamed') : t('keysReplaced'))
        if (answer.ok) closeForm()
      } finally {
        setBusy(false)
      }
    })()
  }

  /** The one inline form, shaped by the edit it is open for. */
  const form = (): ReactNode => {
    if (editing === undefined) return null
    const kind = editing.kind
    const wantsValue = kind !== 'alias'
    const illegal = wantsValue && valueDraft.length > 0 && !isLegalKeyValue(valueDraft)
    return (
      <div className="bre-keys-form">
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
        {illegal ? (
          <p className="bre-effort-message bre-error" role="alert">
            {t('keysAddIllegal')}
          </p>
        ) : null}
        <div className="bre-keys-form-actions">
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

  if (rows === undefined) {
    // Still reading: NOTHING, until the answer lands. The mount happens in the
    // same frame the card opens (flushSync), and a placeholder here would paint
    // one frame of a one-line panel that then visibly swaps to the list — the
    // "the key section flashes when you press Edit" report. An empty panel in
    // that frame reads as the card still opening; the list is the first thing
    // the pane ever shows. A read that FAILED says so instead of appearing to
    // load forever, and still offers the add entry.
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
                        onClick={() => openForm('value', row)}
                      >
                        {t('keysEdit')}
                      </button>
                    </>
                  )}
                </span>
                {/* The enable choice sits at the END of the row: one radio per
                    key, one enabled key per provider, and the control is named
                    for what it does instead of for a state to hunt for. */}
                <label className="bre-keys-enable" title={t('keysEnable', { name })}>
                  <input
                    type="radio"
                    name={group}
                    className="bre-keys-enabled"
                    checked={row.enabled}
                    disabled={busy}
                    aria-label={t('keysEnable', { name })}
                    onChange={() => void run(() => client.enable(route, row.ref), t('keysEnabledNote', { name }))}
                  />
                  <span className="bre-keys-mark" aria-hidden="true">
                    {row.enabled ? <Glyph paths={[CHECK_PATH]} /> : null}
                  </span>
                  <span className="bre-keys-enable-text">{t('keysEnabled')}</span>
                </label>
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
