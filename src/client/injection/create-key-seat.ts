/**
 * The create card's key-list seat: the official key field hands its input
 * over to the plugin, and the DRAFT key list renders inline directly under it.
 *
 * The mirror of the edit card's seat (`injection/key-manager`), with two
 * differences the create card forces. First, there is no route to key the
 * list by — the id is being typed, and the drafts wait in the session ledger
 * (`staged-keys`) for the route the card's own 保存 declares — so the list is
 * the draft pane (`create-keys-pane`), not the host-backed one. Second, the
 * official box keeps what the user typed into it: the create card is a FORM,
 * and its own 保存 is what stores the provider's first key. The list below is
 * for adding further keys, and lands once the route is declared.
 *
 * The field keeps the edit card's managed-field handover: `bre-key-managed`
 * stands the official input down (the list below says the same thing once per
 * key), the input stays in the DOM — the host's form still owns it — and
 * unmanaging the field brings the official box back.
 *
 * @module dsh-model-think-level/client/injection/create-key-seat
 */

import { createElement } from 'react'
import type { ReactNode } from 'react'
import type { Translate } from '@deepseek-ai/dsh-client-ui-slots'
import { CreateKeysPane } from './create-keys-pane.js'
import { setAttr, setClass } from './dom.js'
import { KEY_MANAGED_CLASS } from './key-manager.js'
import { EffortBoundary, mountReact, unmountReact, type ForeignMount } from './mount.js'
import type { DraftKeyStore, StagedKeysState } from './staged-keys.js'
import type { RemoteApi } from '../types.js'

/** The plugin's own element right after the field: the container of the list.
 * Marked so the pass and a test can tell it from any sibling the page owns. */
const CREATE_KEYS_HOST_ATTR = 'data-bre-create-keys'

/** The list's container class — the edit card's host class, so both cards'
 * lists read identically. */
const KEY_HOST_CLASS = 'bre-keys-host'

/** The official key input, marked by the reveal pass that dresses it. */
const KEY_INPUT_ATTR = 'data-bre-key-input'

/** The pane the field belongs to; the list mirrors it so a pane hides both. */
const KEY_REGION_ATTR = 'data-bre-region'

/** What a reconcile tells the field's key list. */
export interface CreateKeySeatDeps {
  /** Copy for the list and its failure boundary. */
  readonly t: Translate
  /** The write seam, for the pane's route-baseline reads. */
  readonly api: RemoteApi
  /** The official labels of the form's provider-id field, by locale. */
  readonly routeIdLabels: () => readonly string[]
  /** The session's deferred-key ledger. */
  readonly staged: StagedKeysState
  /** The plugin's locale-refresh seam, so the list's copy follows a language
   * switch exactly as the seats the official slot mounts do. */
  readonly refreshed: (children: () => ReactNode) => ReactNode
}

/** One mounted list, as the field holding it remembers it. */
interface FieldState {
  /** The plugin's element after the field, holding the React root. */
  readonly host: HTMLDivElement
  /** The React root mounted into {@link host}. */
  readonly mount: ForeignMount
}

/**
 * The lists this module mounted, keyed by the field holding them: a card
 * re-render replaces the field's React children (and with them the old host),
 * and looking the field up tells the next pass whether the list it mounted is
 * still there.
 */
const FIELDS = new WeakMap<HTMLElement, FieldState>()

/** The official key input of a field, or undefined when this is another field. */
function keyInputOf(field: HTMLElement): HTMLInputElement | undefined {
  const marked = field.querySelector(`input[${KEY_INPUT_ATTR}]`)
  if (marked instanceof HTMLInputElement) return marked
  // Before the reveal pass has marked it — or with that pass off — the key input
  // is still the field's only password input.
  const secret = field.querySelector('input[type="password"]')
  return secret instanceof HTMLInputElement ? secret : undefined
}

/** The plugin's host after a field, or undefined when the field has none. */
function hostOf(field: HTMLElement): HTMLDivElement | undefined {
  const known = FIELDS.get(field)?.host
  if (known !== undefined && known.isConnected) return known
  const next = field.nextElementSibling
  return next instanceof HTMLDivElement && next.hasAttribute(CREATE_KEYS_HOST_ATTR) ? next : undefined
}

/**
 * Mount the draft key list into a field, replacing whatever this module
 * mounted there before. Idempotent: a field whose list is already up is left
 * exactly as it is (only its region mirror is re-asserted, so a tab pass that
 * tags the field after the fact brings the list into its pane too), and a
 * field with no key input is handed to {@link resetCreateKeySeat}.
 */
export function enhanceCreateKeySeat(field: HTMLElement, deps: CreateKeySeatDeps): void {
  // A field that lives inside a list this module mounted is the plugin's own
  // rendering — the draft form's key box — and never the page's to adopt.
  // Seating it would mount a list under that field, whose own form carries
  // another key box, and so on: one nested host per pass until the card is
  // metres tall ("点开新增供应商，出现了无限向下扩展", 2026-10-25). `add-card`
  // filters these out of its field scan as well; this is the seat's own guard,
  // so no future caller can re-open the hole.
  if (field.closest(`[${CREATE_KEYS_HOST_ATTR}]`) !== null) {
    resetCreateKeySeat(field)
    return
  }
  const input = keyInputOf(field)
  if (input === undefined) {
    resetCreateKeySeat(field)
    return
  }
  // A field the page has already dropped cannot take a sibling.
  if (field.parentElement === null) return
  setClass(field, KEY_MANAGED_CLASS, true)

  const known = FIELDS.get(field)
  let host = hostOf(field)
  if (host === undefined) {
    // The field has no host: either this is the first pass over it, or the page
    // re-rendered and took the old host with it. Either way the state's own
    // root is taken down before a new host takes its place after the field.
    if (known !== undefined) drop(field, known)
    host = field.ownerDocument.createElement('div')
    host.className = KEY_HOST_CLASS
    field.after(host)
  }
  setAttr(host, CREATE_KEYS_HOST_ATTR, '')
  // The list belongs to the pane the field belongs to, so it mirrors the
  // field's own region — otherwise it would stay on screen in the Models and
  // Advanced panes, under a field those panes hide.
  const region = field.getAttribute(KEY_REGION_ATTR)
  if (region === null) {
    if (host.hasAttribute(KEY_REGION_ATTR)) host.removeAttribute(KEY_REGION_ATTR)
  } else setAttr(host, KEY_REGION_ATTR, region)

  if (known !== undefined && known.host === host) return
  if (known !== undefined) drop(field, known)
  // User items 9 and 10: the official key box keeps whatever was typed into it.
  //
  // This seat used to pour that value into the draft list and empty the box (so
  // the official form would not save it as the provider's single key beside the
  // list). Two things went wrong with that. The official create card fetches its
  // models with the key the FORM currently shows — `probe.apiKey` is literally
  // its own draft — so an emptied box made 获取模型 ask the endpoint with no
  // credential at all and the upstream answered 401 (user item 10). And the
  // official in-field eye only exists while the box has text, so emptying it
  // also took the eye away and left this plugin's own button hanging under the
  // field instead (user item 9). The value stays where the user put it: the
  // official box saves the provider's key, and the list below is an OPTIONAL
  // extra for adding more keys, which land once the route is declared.
  const store: DraftKeyStore = { drafts: [] }
  // `sync`: the card's height is what the settings scroller measures, so the
  // list must be in the tree before this microtask ends. The host is bound to a
  // const here: the pane holds it in a ref, and the closure must not see a
  // narrowing it can lose.
  const seatHost: HTMLDivElement = host
  const mount = mountReact(
    host,
    deps.refreshed(() =>
      createElement(
        EffortBoundary,
        { fallbackText: deps.t('keysPanelFailed') },
        createElement(CreateKeysPane, {
          host: { current: seatHost },
          store,
          api: deps.api,
          t: deps.t,
          routeIdLabels: deps.routeIdLabels,
          staged: deps.staged,
        }),
      ),
    ),
    { sync: true },
  )
  FIELDS.set(field, { host, mount })
}

/** Take one mounted list down and forget it; the state's host goes with it. */
function drop(field: HTMLElement, state: FieldState): void {
  FIELDS.delete(field)
  unmountReact(state.mount)
}

/**
 * Drop the list of one field, leaving the official field exactly as the page
 * rendered it: the managed-field mark goes, and the official input comes back.
 */
export function resetCreateKeySeat(field: HTMLElement): void {
  setClass(field, KEY_MANAGED_CLASS, false)
  const state = FIELDS.get(field)
  if (state !== undefined) drop(field, state)
  // Whatever the map knew, nothing of this module may stay in the field.
  hostOf(field)?.remove()
}

/** Drop every list this module mounted. */
export function teardownCreateKeySeats(): void {
  for (const host of Array.from(document.querySelectorAll<HTMLElement>(`[${CREATE_KEYS_HOST_ATTR}]`))) {
    // A host sits directly after the field it was built for, so the field is
    // the host's previous sibling; one whose field is already gone is removed.
    const field = host.previousElementSibling
    if (field instanceof HTMLElement && FIELDS.has(field)) resetCreateKeySeat(field)
    else host.remove()
  }
}
