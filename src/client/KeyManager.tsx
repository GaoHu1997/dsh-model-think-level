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
 *     "auto" speaks each model's own wire: claude models against the Anthropic
 *     address, gemini models against the Gemini one, the rest the provider's
 *     protocol — wherever that address is configured. The protocol picker lives
 *     in the same hover-revealed action tray as the other actions.
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
  /**
   * Draft mode — the create-provider card's list over an in-memory store
   * instead of the host's. Rows read as "saved on create" rather than probed,
   * the model-scope action is gone (the provider has no models to pick from
   * before it exists), and every protocol is offered (the address a pin rides
   * is the card's own Base URL field, which no endpoint family reports yet).
   */
  readonly draft?: boolean | undefined
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

/** The protocols a key may pin, in the picker's order (undefined = any). The
 *  order is the one the menus show: the two OpenAI wires first (they are the
 *  same provider's two APIs, and the common case), then Anthropic, then Gemini. */
const PROTOCOL_CHOICES: readonly RouteProtocol[] = ['openai-completions', 'openai-responses', 'anthropic-messages', 'google-generative-ai']

/** The addresses nothing is known about yet. */
const NO_ENDPOINTS: KeyEndpoints = { openai: null, anthropic: null, gemini: null }

/**
 * How model ids read in every list this panel shows. `numeric` keeps a family
 * in version order (`glm-4.5` before `glm-4.6`), and one collator over the
 * whole list is what keeps a letter grouped: the route's own models and the
 * ones the keys discovered are merged into one alphabet, not two blocks.
 */
const MODEL_ORDER = new Intl.Collator('en', { numeric: true, sensitivity: 'base' })

/**
 * The protocols the picker may offer: only those whose family address the provider
 * has actually configured, because a pinned key signs against THAT family's URL
 * (user item 3). Protocols with no address stay off the list entirely — a greyed
 * row reads as broken rather than as unavailable (未配置端点地址的协议不要出现在
 * 切换协议选项中). The row's own protocol always stays on the list, so a pin made
 * while the address existed never comes back reading as "自动（按模型）".
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
  if (protocol === 'google-generative-ai') return t('keysProtocolGemini')
  // Anything else (including none) is the AUTOMATIC wire: each request speaks
  // the protocol the model's own family names, where the provider addressed it.
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
  if (protocol === 'google-generative-ai') return t('keysProtocolGeminiHint')
  return t('keysProtocolDefaultHint')
}

/** The menu's choices, in the picker's order, each with its own explanation.
 * A draft list offers every protocol: the address a pin rides is the create
 * card's own Base URL field, which no endpoint family reports yet. */
function protocolOptions(
  endpoints: KeyEndpoints,
  pinned: RouteProtocol | undefined,
  t: Translate,
  draft = false,
): readonly ProtocolOption[] {
  const choices: Array<RouteProtocol | undefined> = [
    undefined,
    ...(draft ? PROTOCOL_CHOICES : offeredProtocols(endpoints, pinned)),
  ]
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
  const { route, t, draft } = props
  const client = props.client ?? httpKeyManagerClient

  const [rows, setRows] = useState<readonly KeyRow[] | undefined>(undefined)
  const [routeModels, setRouteModels] = useState<readonly string[]>([])
  const [notice, setNotice] = useState<Notice | undefined>(undefined)
  const [busy, setBusy] = useState(false)
  const [editing, setEditing] = useState<Editing | undefined>(undefined)
  const [nameDraft, setNameDraft] = useState('')
  const [valueDraft, setValueDraft] = useState('')
  const [scopeDraft, setScopeDraft] = useState<readonly string[]>([])
  /**
   * The protocol a NEW key pins while its form is open (undefined = automatic).
   * It rides the create rather than the row's picker because a key's wire is
   * part of what the user is choosing when they add it: the endpoint family it
   * signs against decides which address that key uses.
   */
  const [protocolDraft, setProtocolDraft] = useState<RouteProtocol | undefined>(undefined)

  /**
   * A create card opens with its key form already unfolded: a provider with no
   * key is a card that cannot save, so the one field it must have waits for no
   * click. It is a mount-time default only — closing the form stays closed.
   */
  useEffect(() => {
    if (draft !== true) return
    setEditing({ kind: 'add' })
  }, [draft])
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
      // Sorted here too, so the offer line reads in the same order the chips do.
      setUnmerged((answer.unmergedModels ?? []).slice().sort(MODEL_ORDER.compare))
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
    setProtocolDraft(undefined)
  }

  const openForm = (kind: 'alias' | 'value' | 'scope', row: KeyRow): void => {
    setEditing({ kind, ref: row.ref })
    setNameDraft(kind === 'alias' ? row.alias ?? '' : '')
    setValueDraft('')
    // The scope chips are seeded with the model list the row currently holds.
    setScopeDraft(row.models ?? [])
    // Only a create carries a protocol pin; once the key exists its own picker
    // owns the protocol, so an edit form must not silently re-pin it.
    setProtocolDraft(undefined)
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
    // Captured before the await: the form may be re-rendered (or cleared) while
    // the create is in flight, and the pin must ride the protocol the user saw.
    const pinnedProtocol = protocolDraft
    setBusy(true)
    void (async () => {
      try {
        if (kind === 'add') {
          // The reference is minted by the host, so only the answer names it:
          // the new row is the one this list did not already hold.
          const before = new Set((rows ?? []).map(row => row.ref))
          const answer = await client.add(route, valueDraft, alias)
          if (!answer.ok) {
            adopt(answer, t('keysAdded'))
            return
          }
          // A protocol chosen in the form rides the create: a key's wire is part
          // of what is being chosen here, and pinning it in the same gesture
          // spares the user a second trip through the row's picker.
          const created = pinnedProtocol === undefined
            ? undefined
            : answer.entries.find(entry => !before.has(entry.ref))
          const pinned = created === undefined
            ? answer
            : await client.setProtocol(route, created.ref, pinnedProtocol)
          adopt(pinned, t('keysAdded'))
          if (pinned.ok) closeForm()
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
   * is exactly the case scopes exist for. One sorted list, so the picker reads
   * as a single alphabet instead of "declared block, then discovered block"
   * (where the same letter would sit at both ends).
   */
  const chipModels = [...routeModels, ...unmerged].sort(MODEL_ORDER.compare)

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
        {kind === 'add' ? (
          <div className="bre-keys-chips" role="group" aria-label={t('keysProtocolCreate')}>
            {protocolOptions(endpoints, undefined, t, draft === true).map(option => {
              const value = option.value === '' ? undefined : (option.value as RouteProtocol)
              const selected = protocolDraft === value
              return (
                <button
                  key={option.value}
                  type="button"
                  className={selected ? 'bre-keys-chip is-selected' : 'bre-keys-chip'}
                  aria-pressed={selected}
                  title={option.hint}
                  disabled={busy}
                  onClick={() => setProtocolDraft(value)}
                >
                  {option.title}
                </button>
              )
            })}
          </div>
        ) : null}
        {kind === 'add' ? <p className="bre-keys-hint">{t('keysProtocolCreateHint')}</p> : null}
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

  // How many keys are switched into the pool right now: the one fact that
  // decides whether a row's check may be clicked at all — the LAST enabled key
  // cannot be switched off (an empty pool would sign with the very key the user
  // just benched), so a single enabled key's check stands down instead of
  // answering a click with the host's refusal.
  const enabledCount = rows.reduce((count, entry) => (entry.enabled ? count + 1 : count), 0)

  return (
    <div className="bre-keys">
      <ul className="bre-keys-list">
        {rows.map(row => {
          const name = nameOf(row)
          const lastEnabled = row.enabled && enabledCount <= 1
          return (
            <Fragment key={row.ref}>
              <li
                className={row.enabled ? 'bre-keys-row' : 'bre-keys-row is-off'}
                data-state={row.configured === false ? 'missing' : 'ready'}
              >
                {/* The row's switch: clicking it moves the key into or out of
                    the routing pool. There is no default badge to be found
                    beside it — with several keys coexisting, which one signs a
                    model is the scope's decision, not a row's position. */}
                <button
                  type="button"
                  className={row.enabled ? 'bre-keys-toggle is-on' : 'bre-keys-toggle'}
                  aria-pressed={row.enabled}
                  aria-label={t(row.enabled ? 'keysDisable' : 'keysEnable', { name })}
                  title={t(row.enabled ? 'keysDisable' : 'keysEnable', { name })}
                  disabled={busy || lastEnabled}
                  onClick={() => void run(() => client.setEnabled(route, row.ref, !row.enabled), undefined)}
                >
                  {/* 圆圈加对勾：选中时整枚图标（圈与勾）都是品牌蓝，未选中是
                      灰圈、没有勾（勾由样式在未选中时藏掉）。唯一不能点的状态
                      是"最后一把启用中的密钥"——宿主会拒绝，控件直接站开。 */}
                  <span className="bre-keys-toggle-mark" aria-hidden="true">
                    <Glyph paths={[CHECK_PATH]} />
                  </span>
                </button>
                {row.alias === undefined ? null : <span className="bre-keys-alias">{row.alias}</span>}
                <span className={row.alias === undefined ? 'bre-keys-mask bre-keys-mask-plain' : 'bre-keys-mask'}>
                  {previewOf(row, t)}
                </span>
                <span
                  className={
                    confirming === row.ref ? 'bre-keys-actions is-confirming' : 'bre-keys-actions'
                  }
                >
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
                      {/* The scope action is the edit card's alone: a draft list
                          has no models to pick from — the provider the scope
                          would name its keys by does not exist yet. */}
                      {draft === true ? null : (
                        <button
                          type="button"
                          className="bre-link-button bre-keys-scope"
                          disabled={busy}
                          title={t('keysScope', { name })}
                          onClick={() => openForm('scope', row)}
                        >
                          {scopeText(row, t)}
                        </button>
                      )}
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

      {/* The one line that tells a draft list what it is: the keys are held by
          this page and land with the card's own create — the same contract the
          request-header pane states, and the reason a reload loses nothing the
          official form would have kept. */}
      {draft === true ? <p className="bre-keys-note">{t('keysDraftHint')}</p> : null}

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
          options={protocolOptions(endpoints, menuRow.protocol, t, draft === true)}
          selected={menuRow.protocol ?? ''}
          onPick={value => changeProtocol(menuRow, value)}
          onClose={() => setProtocolMenu(undefined)}
        />
      )}
    </div>
  )
}
