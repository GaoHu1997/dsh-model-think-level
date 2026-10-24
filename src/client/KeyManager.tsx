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
 *   - **every key switched on is active.** The keys are ordered by preference,
 *     the first one that can serve a model signs it, a model only one key lists
 *     sticks to that key, and a failed request fails over to the next capable
 *     key. Each row opens with a circular check that switches the key into or
 *     out of that pool: lit is in use, grey is paused — with the label, scope
 *     and protocol pin kept for the switch back on. Which key signs a request
 *     is decided by the model's scope, not by a row's position, so with several
 *     keys there is no "default" seat to mark any more.
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

import { Fragment, useCallback, useEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import {
  endpointFamilyOf,
  isLegalKeyValue,
  normalizeKeyAlias,
  type RouteProtocol,
} from '../key-refs.js'
import { ENDPOINTS_CHANGED_EVENT, type EndpointsChangedDetail } from './events.js'
import { ProtocolMenu, type ProtocolOption } from './ProtocolMenu.js'
import {
  httpKeyManagerClient,
  type KeyAnswer,
  type KeyEndpoints,
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

/** The tick drawn inside a selected model chip, and inside a lit key check. */
const CHECK_PATH = 'M3.9 8.35 6.6 11.05 12.1 5.5'

/**
 * The ring that opens every key row. It stands alone while the key is switched
 * off (a grey circle, nothing inside); switched on, the tick joins it inside
 * and both take the success colour.
 */
const RING_PATH = 'M8 1.75a6.25 6.25 0 1 0 0 12.5a6.25 6.25 0 1 0 0-12.5'

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

/** The protocols a key may pin, in the picker's order (undefined = any). */
const PROTOCOL_CHOICES: readonly RouteProtocol[] = ['anthropic-messages', 'openai-completions', 'openai-responses']

/** The addresses nothing is known about yet. */
const NO_ENDPOINTS: KeyEndpoints = { openai: null, anthropic: null }

/**
 * The protocols the picker may offer: only those whose family address the provider
 * has actually configured, because a pinned key signs against THAT family's URL
 * (user item 3). The row's own protocol always stays on the list, so a pin made
 * while the address existed never comes back reading as "默认协议".
 */
function offeredProtocols(
  endpoints: KeyEndpoints,
  pinned: RouteProtocol | undefined,
): readonly RouteProtocol[] {
  return PROTOCOL_CHOICES.filter(protocol => {
    if (protocol === pinned) return true
    return (endpoints[endpointFamilyOf(protocol)] ?? '').length > 0
  })
}

/** A protocol's short human label for the picker's trigger. */
function protocolLabel(protocol: RouteProtocol | undefined, t: Translate): string {
  if (protocol === 'anthropic-messages') return t('keysProtocolAnthropic')
  if (protocol === 'openai-responses') return t('keysProtocolResponses')
  if (protocol === 'openai-completions') return t('keysProtocolOpenAI')
  // Anything else (including none) means the route's own protocol is used, which
  // is the word the empty option already carries — there is no "any" key to show.
  return t('keysProtocolDefault')
}

/**
 * The line under a protocol's name in the menu: what that wire is for. The names
 * alone do not tell them apart — Chat Completions and Responses are the same
 * provider's two APIs, and which one a key should speak depends on the models
 * behind it (user request: 下拉框改成参考图的样式).
 */
function protocolHint(protocol: RouteProtocol | undefined, t: Translate): string {
  if (protocol === 'anthropic-messages') return t('keysProtocolAnthropicHint')
  if (protocol === 'openai-responses') return t('keysProtocolResponsesHint')
  if (protocol === 'openai-completions') return t('keysProtocolOpenAIHint')
  return t('keysProtocolDefaultHint')
}

/** The menu's choices, in the picker's order, each with its own explanation. */
function protocolOptions(
  endpoints: KeyEndpoints,
  pinned: RouteProtocol | undefined,
  t: Translate,
): readonly ProtocolOption[] {
  const choices: Array<RouteProtocol | undefined> = [undefined, ...offeredProtocols(endpoints, pinned)]
  return choices.map(protocol => ({
    value: protocol ?? '',
    title: protocolLabel(protocol, t),
    hint: protocolHint(protocol, t),
  }))
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
  /** Which row's protocol menu is open, and the trigger it hangs off. */
  const [protocolMenu, setProtocolMenu] = useState<{ ref: string; anchor: HTMLElement } | undefined>(undefined)
  /** Which family addresses this route has, so the picker only offers those. */
  const [endpoints, setEndpoints] = useState<KeyEndpoints>(NO_ENDPOINTS)
  /**
   * The models the keys advertise that the provider itself does not declare yet.
   * Shown as an offer, never applied: writing a provider's model list is the
   * user's click, not a side effect of opening this list.
   */
  const [unmerged, setUnmerged] = useState<readonly string[]>([])

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
      setUnmerged(answer.unmergedModels ?? [])
      setEndpoints(answer.endpoints)
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

  // The provider card above owns the two base URLs, and which protocols this list
  // may offer depends on them (user item 3). When that card changes an address it
  // says so, and this list re-reads instead of offering a stale set.
  useEffect(() => {
    const onChanged = (event: Event): void => {
      const detail = (event as CustomEvent<EndpointsChangedDetail>).detail
      const changed = detail?.route
      if (changed !== undefined && changed !== route) return
      void (async () => {
        const answer = await client.list(route)
        if (answer.ok) adopt(answer, undefined)
      })()
    }
    document.addEventListener(ENDPOINTS_CHANGED_EVENT, onChanged)
    return () => {
      document.removeEventListener(ENDPOINTS_CHANGED_EVENT, onChanged)
    }
  }, [adopt, client, route])

  /** Run one mutation, then take the host's word for the new list. */
  const run = useCallback(
    async (action: () => Promise<KeyAnswer>, okText: string | undefined): Promise<void> => {
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
    setValueDraft('')
    // The scope chips are seeded with the model list the row currently holds.
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
  /**
   * The models a scope may be chosen from: the provider's own list plus whatever
   * the keys advertise — a key serving a model the provider has not declared yet
   * is exactly the case scopes exist for.
   */
  const chipModels = unmerged.length === 0 ? routeModels : [...routeModels, ...unmerged]

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
            {chipModels.length === 0 ? (
              <p className="bre-keys-hint">{t('keysScopeEmpty')}</p>
            ) : (
              chipModels.map(model => {
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
    setProtocolMenu(undefined)
    void run(() => client.setProtocol(route, row.ref, protocol), t('keysProtocolSaved'))
  }

  /** The row whose protocol menu is open, if it is still on screen. */
  const menuRow =
    protocolMenu === undefined ? undefined : rows?.find(row => row.ref === protocolMenu.ref)

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
              <li
                className={row.enabled ? 'bre-keys-row' : 'bre-keys-row is-off'}
                data-state={row.configured === false ? 'missing' : 'ready'}
              >
                {/* The row's switch, not a status dot: clicking it moves the key
                    into or out of the routing pool. There is no default badge to
                    be found beside it — with several keys coexisting, which one
                    signs a model is the scope's decision, not a row's position. */}
                <button
                  type="button"
                  className={row.enabled ? 'bre-keys-toggle is-on' : 'bre-keys-toggle'}
                  aria-pressed={row.enabled}
                  aria-label={t(row.enabled ? 'keysDisable' : 'keysEnable', { name })}
                  title={t(row.enabled ? 'keysDisable' : 'keysEnable', { name })}
                  disabled={busy}
                  onClick={() => void run(() => client.setEnabled(route, row.ref, !row.enabled), undefined)}
                >
                  <span className="bre-keys-toggle-mark" aria-hidden="true">
                    {/* The ring is the seat; the tick only takes it when the key
                        is switched into use — an empty circle reads as "off",
                        a ticked one as "on", with no colour alone to carry it. */}
                    <Glyph paths={[RING_PATH]} />
                    {row.enabled ? <Glyph paths={[CHECK_PATH]} /> : null}
                  </span>
                </button>
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
                      <span className="bre-keys-protocol-wrap">
                        {/* What you read is a LABEL, not the control: a native
                            select is as wide as its WIDEST option, so a short
                            value left the chevron floating a hundred pixels to
                            its right (user item 2). The button is exactly as wide
                            as the text and opens the menu this module draws —
                            a native list cannot explain what each protocol is
                            for (user request, 参考图样式). */}
                        <button
                          type="button"
                          className="bre-keys-protocol"
                          aria-haspopup="listbox"
                          aria-expanded={protocolMenu?.ref === row.ref}
                          aria-label={t('keysProtocolLabel', { name })}
                          title={t('keysProtocolLabel', { name })}
                          disabled={busy}
                          onClick={event => {
                            const anchor = event.currentTarget
                            setProtocolMenu(current =>
                              current?.ref === row.ref ? undefined : { ref: row.ref, anchor },
                            )
                            setConfirming(undefined)
                          }}
                        >
                          <span className="bre-keys-protocol-label">
                            {protocolLabel(row.protocol, t)}
                          </span>
                          <span className="bre-keys-protocol-caret" aria-hidden="true">
                            ›
                          </span>
                        </button>
                      </span>
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
                        {scopeText(row, t)}
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

      {unmerged.length === 0 ? null : (
        <p className="bre-keys-note">
          {t('keysMergedOffer', { count: unmerged.length, models: unmerged.join(', ') })}
          {' '}
          <button
            type="button"
            className="bre-link-button"
            disabled={busy}
            onClick={() => void run(() => client.applyMerged(route), t('keysMergedApplied'))}
          >
            {t('keysMergedApply')}
          </button>
        </p>
      )}
      {notice === undefined ? null : (
        <p className={'bre-effort-message bre-' + notice.kind} role={notice.kind === 'error' ? 'alert' : 'status'}>
          {notice.text}
        </p>
      )}
      {protocolMenu === undefined || menuRow === undefined ? null : (
        <ProtocolMenu
          anchor={protocolMenu.anchor}
          label={t('keysProtocolLabel', { name: nameOf(menuRow) })}
          options={protocolOptions(endpoints, menuRow.protocol, t)}
          selected={menuRow.protocol ?? ''}
          onPick={value => changeProtocol(menuRow, value)}
          onClose={() => setProtocolMenu(undefined)}
        />
      )}
    </div>
  )
}
