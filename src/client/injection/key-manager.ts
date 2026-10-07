/**
 * The key list's seat: the official key field grows a plugin-owned host, and the
 * list is rendered inline into it, directly under the input.
 *
 * The field is not reachable from the settings page's React tree — the plugin
 * only gets keyed slots, and none of them sits beside a form field — so the seat
 * is a DOM leaf inserted directly AFTER the field. The list then falls under the
 * input, which is where a provider's keys belong: the label above already says
 * "API key", and the list reads as part of the field rather than as a surface
 * that has to be opened, positioned and dismissed.
 *
 * A sibling rather than a last child: the reveal eye hangs on the field's own
 * bottom edge (`bottom: 0` against the field, which its validation-message rule
 * also measures from), so a list inside the field would carry the eye down with
 * it and leave it sitting on the list's last row. React tolerates the foreign
 * sibling — it resolves a node's next sibling by walking past nodes it does not
 * own — and the list mirrors the field's region, so a pane hides it along with
 * the field it belongs to.
 *
 * The host carries the route its list was built for — that attribute is how the
 * pass knows whether the mounted list still belongs to the field it follows, and
 * how a test asks what is mounted there.
 *
 * The whole seat is skipped when the field is not a key field, or when its card
 * announces no route: the add-provider form has no route yet, and keys belong to
 * a route that exists.
 *
 * @module dsh-model-think-level/client/injection/key-manager
 */

import { createElement } from 'react'
import type { ReactNode } from 'react'
import { KeyManager } from '../KeyManager.js'
import type { KeyManagerClient } from '../key-manager-client.js'
import { setAttr, setClass } from './dom.js'
import { EffortBoundary, mountReact, unmountReact, type ForeignMount } from './mount.js'

/** Set on a field whose keys the plugin lists. */
export const KEY_MANAGED_CLASS = 'bre-key-managed'

/** The plugin's own element right after the field: the container of the list. */
const KEY_HOST_CLASS = 'bre-keys-host'

/** The route the host's list was built for; read by the pass and by tests. */
const KEY_HOST_ATTR = 'data-bre-key-host'

/** The official key input, marked by the reveal pass that dresses it. */
const KEY_INPUT_ATTR = 'data-bre-key-input'

/** The pane the field belongs to; the list mirrors it so a pane hides both. */
const KEY_REGION_ATTR = 'data-bre-region'

/** The repo's inline translator shape. */
export type Translator = (key: string, params?: Record<string, string | number>) => string

/** What a reconcile tells the field's key list. */
export interface KeyManagerFieldDeps {
  /** Copy for the list and its form. */
  readonly t: Translator
  /** The provider route this card edits; absent on the add-provider form. */
  readonly route?: string | undefined
  /** List transport; injectable for tests. */
  readonly client?: KeyManagerClient | undefined
}

/** One mounted list, as the field holding it remembers it. */
interface FieldState {
  /** The route the mounted list manages. */
  route: string
  /** The plugin's element after the field, holding the React root. */
  readonly host: HTMLElement
  /** The React root mounted into {@link host}. */
  readonly mount: ForeignMount
  /** The copy the list was last rendered with. */
  t: Translator
  /** The transport the list was last rendered with. */
  client?: KeyManagerClient | undefined
}

/**
 * The lists this module mounted, keyed by the field holding them.
 *
 * Keyed by the field, not by the route: a card re-render replaces the field's
 * React children (and with them the old host), and looking the field up tells
 * the next pass whether the list it mounted is still there.
 */
const FIELDS = new WeakMap<HTMLElement, FieldState>()

/** The official key input of a field, or undefined when this is another field. */
function keyInputOf(field: HTMLElement): HTMLInputElement | undefined {
  const marked = field.querySelector(`input[${KEY_INPUT_ATTR}]`)
  if (marked instanceof HTMLInputElement) return marked
  // Before the reveal pass has marked it — or with that pass off — the key input
  // is still the field's only password input, and no other field of the card has
  // one. Everything else the card holds (name, base URL, protocol) is text.
  const secret = field.querySelector('input[type="password"]')
  return secret instanceof HTMLInputElement ? secret : undefined
}

/** The plugin's host after a field, or undefined when the field has none. */
function hostOf(field: HTMLElement): HTMLElement | undefined {
  const known = FIELDS.get(field)?.host
  if (known !== undefined && known.isConnected) return known
  const next = field.nextElementSibling
  return next instanceof HTMLElement && next.hasAttribute(KEY_HOST_ATTR) ? next : undefined
}

/**
 * Mount the key list into a field, replacing whatever this module mounted there
 * before. Idempotent: a field whose list is already up and current is left
 * exactly as it is, so a settled page sees no write at all.
 */
export function enhanceKeyManagerField(field: HTMLElement, deps: KeyManagerFieldDeps): void {
  const route = deps.route
  if (route === undefined || route.length === 0) return
  if (keyInputOf(field) === undefined) return
  // A field the page has already dropped cannot take a sibling, and the sweep
  // that removed it has already taken the list down.
  if (field.parentElement === null) return
  setClass(field, KEY_MANAGED_CLASS, true)

  const known = FIELDS.get(field)
  let host = hostOf(field)
  if (host === undefined) {
    // The field has no host: either this is the first pass over it, or the page
    // re-rendered and took the old host with it. Either way the state's own host
    // is gone, so its root is taken down (the element is already detached)
    // before a new host takes its place after the field.
    if (known !== undefined) drop(field, known)
    host = field.ownerDocument.createElement('div')
    host.className = KEY_HOST_CLASS
    field.after(host)
  }
  setAttr(host, KEY_HOST_ATTR, route)
  // The list belongs to the pane the field belongs to and the pane rules key on
  // the region, so the list mirrors the field's own — otherwise it would stay on
  // screen in the Models and Advanced panes, under a field those panes hide.
  const region = field.getAttribute(KEY_REGION_ATTR)
  if (region === null) {
    if (host.hasAttribute(KEY_REGION_ATTR)) host.removeAttribute(KEY_REGION_ATTR)
  } else setAttr(host, KEY_REGION_ATTR, region)

  const subtree = (): ReactNode =>
    createElement(
      EffortBoundary,
      { fallbackText: deps.t('keysPanelFailed') },
      createElement(KeyManager, { route, t: deps.t, client: deps.client }),
    )

  const state = FIELDS.get(field)
  if (state !== undefined && state.route === route) {
    // The same list for the same route: nothing the official page did can change
    // what it shows, so only a new language or transport is worth a render — and
    // React writes no DOM for props that did not change.
    if (state.t !== deps.t || state.client !== deps.client) {
      state.t = deps.t
      state.client = deps.client
      state.mount.root.render(subtree())
    }
    return
  }
  if (state !== undefined) {
    // The field outlived its list: the card switched provider, or the page
    // reused the field. The old root goes, the host stays where it is.
    FIELDS.delete(field)
    state.mount.root.unmount()
  }
  FIELDS.set(field, { route, host, mount: mountReact(host, subtree(), { sync: true }), t: deps.t, client: deps.client })
}

/** Take one mounted list down and forget it; the state's host goes with it. */
function drop(field: HTMLElement, state: FieldState): void {
  FIELDS.delete(field)
  unmountReact(state.mount)
}

/**
 * Drop the list of one field, leaving the official field exactly as the page
 * rendered it. Called when the takeover ends, and for the stray sweep of a page
 * that is being torn down.
 */
export function resetKeyManagerField(field: HTMLElement): void {
  setClass(field, KEY_MANAGED_CLASS, false)
  const state = FIELDS.get(field)
  if (state !== undefined) drop(field, state)
  // Whatever the map knew, nothing of this module may stay in the field: both
  // the state's own host and any host the field picked up along the way go.
  hostOf(field)?.remove()
}

/** Drop every list this module mounted. */
export function teardownKeyManager(): void {
  for (const host of Array.from(document.querySelectorAll<HTMLElement>(`[${KEY_HOST_ATTR}]`))) {
    // A host sits directly after the field it was built for, so the field is the
    // host's previous sibling; one whose field is already gone is removed.
    const field = host.previousElementSibling
    if (field instanceof HTMLElement && FIELDS.has(field)) resetKeyManagerField(field)
    else host.remove()
  }
}

/**
 * The route a field's list was built for, or undefined when it has none.
 *
 * A test hook: the route lives on the host, so what the pass decided can be read
 * back from the DOM alone.
 */
export function keyManagerRoute(field: HTMLElement): string | undefined {
  return hostOf(field)?.getAttribute(KEY_HOST_ATTR) ?? undefined
}
