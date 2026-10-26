/**
 * The add-provider card: the custom-API form on its own, carrying the tab bar.
 *
 * The official card offers two ways to add a provider — adopt one from the
 * built-in catalogue, or declare a custom API endpoint — behind a segmented
 * "How to add" control. The catalogue half only duplicates the configured
 * provider rows above it, so this pass reduces the card to the custom half: it
 * selects that mode, hides the switch, and gives the form the same three panes
 * its sibling editor cards carry — the bar, and the 高级配置 section the card
 * has nowhere else to put ({@link CreateCardPane}).
 *
 * The card is the SAME card the tab takeover dresses (`bre-tabbed`), and that
 * takeover scopes its regions to the visible half of the form
 * ({@link activeScopeOf}). What it cannot do is hang the bar: the official card
 * renders the provider-card slot only inside the catalogue half, so the custom
 * form has no plugin mount to render a bar into. The mount is created here
 * instead, at the top of the visible form, and it is the ONLY node this module
 * inserts. Everything else is attributes on nodes the official page owns.
 *
 * Degradation is total: a card with no custom half (no API protocol to declare,
 * or no `llm-pi-ai` namespace to declare one into) is left exactly as the
 * official page built it, switch and all, and a card whose dressing throws is
 * rolled back to that same state.
 *
 * @module dsh-model-think-level/client/injection/add-card
 */

import { createElement } from 'react'
import type { ReactNode } from 'react'
import type { Translate } from '@deepseek-ai/dsh-client-ui-slots'
import { setClass } from './dom.js'
import { CreateCardPane } from './create-card-pane.js'
import { enhanceCreateKeySeat, resetCreateKeySeat, teardownCreateKeySeats } from './create-key-seat.js'
import { markKeyField, resetKeyField, KEY_FIELD_CLASS } from './key-reveal.js'
import { suppressScrollAnchoring } from './models-page-editor.js'
import { mountReact, unmountReact, type ForeignMount } from './mount.js'
import type { StagedHeadersState } from './staged-headers.js'
import type { StagedKeysState } from './staged-keys.js'
import type { RemoteApi } from '../types.js'

/** The plugin's mount at the top of the custom form. The tab bar — and, under
 * it, the 高级配置 pane — renders into it; the stylesheet reveals it only under
 * a taken-over card. */
const CREATE_HOST_CLASS = 'bre-create-host'

/** Set on the official "How to add" switch, which the custom-only card hides. */
const MODE_PICKER_CLASS = 'bre-add-mode-picker'

/** The add-provider card. */
const ADD_CARD_SELECTOR = '[class*="addCard"]'

/** One half of the card's form. The official page keeps both mounted once
 * visited and hides the inactive one with `hidden`. */
const ADD_PANEL_SELECTOR = '[class*="addPanel"]'

/** The container of the "How to add" switch (control + its hint). */
const ADD_MODES_SELECTOR = '[class*="addModes"]'

/** The custom half of the form, as the official page IDs it. The ids carry
 * React's `useId()` prefix, so they are matched by suffix and never cached. */
const CUSTOM_PANEL_SUFFIX = '-custom-panel'

/** The custom option inside the switch, likewise identified by suffix. */
const CUSTOM_OPTION_SUFFIX = '-custom'

export interface AddCardDeps {
  /** The plugin's own translator, for the tab labels and the pane's copy. */
  t: Translate
  /** The write seam the pane's header editor reads the settings document with. */
  api: RemoteApi
  /** The official labels of the form's provider-id field, by locale. */
  routeIdLabels: () => readonly string[]
  /** The session's deferred-header ledger (see `staged-headers`). */
  staged: StagedHeadersState
  /** The session's deferred-key ledger (see `staged-keys`): the drafts the
   * custom form's key list stages, waiting for the route this card declares. */
  stagedKeys: StagedKeysState
  /** The plugin's locale-refresh seam, so the pane's copy follows a language
   * switch exactly as the seats the official slot mounts do. */
  refreshed: (children: () => ReactNode) => ReactNode
}

/** One card's mount, remembered by the card it belongs to. */
interface AddCardHost {
  /** The node the root renders into, so a re-created form can be told from a
   * settled one. */
  readonly host: HTMLElement
  readonly mount: ForeignMount
}

export interface AddCardState {
  /** Cards this module mounted a bar into. The mount goes with the card, so a
   * card the page has dropped is dropped here on the next visit. */
  readonly hosts: Map<HTMLElement, AddCardHost>
}

export function createAddCardState(): AddCardState {
  return { hosts: new Map() }
}

/**
 * Reduce every add-provider card on the page to its custom form.
 *
 * Idempotent by construction: a card already showing the custom form with its
 * bar up is left untouched, and switching the mode is driven by the official
 * control's own selected state, so a re-visit writes nothing.
 */
export function reconcileAddCards(root: HTMLElement, deps: AddCardDeps, state: AddCardState): void {
  if (!root.isConnected) return
  const open = new Set<HTMLElement>()
  for (const card of Array.from(root.querySelectorAll<HTMLElement>(ADD_CARD_SELECTOR))) {
    if (!card.isConnected) continue
    try {
      applyAddCard(card, deps, state)
      open.add(card)
    } catch (error) {
      // One unprocessable card must not cost the page its others, and must not
      // leave a half-dressed form behind: the mount goes, the switch comes
      // back, and the key lists stand down with it, which is the official card
      // exactly as it was.
      dropHost(card, state)
      for (const field of keyFieldsOf(card)) {
        try {
          resetCreateKeySeat(field)
        } catch {
          // The card is already being rolled back; a seat that would not reset
          // is swept by the teardown instead.
        }
      }
      setPickerHidden(card, false)
      console.warn('[bre] add provider card: left the official form in place:', error)
    }
  }
  // A card the page closed takes its mount with it; the root behind it must not
  // be left mounted over a detached node.
  for (const card of Array.from(state.hosts.keys())) {
    if (!open.has(card) || !card.isConnected) dropHost(card, state)
  }
}

/** The bar's mount and the mode switch, for the one card this pass knows. */
function applyAddCard(card: HTMLElement, deps: AddCardDeps, state: AddCardState): void {
  let custom = panelWithSuffix(card, CUSTOM_PANEL_SUFFIX)
  if (custom === undefined || custom.hidden) {
    // The official page mounts each half the first time its mode is visited, so
    // on the card's first scan there is no custom half to find — only the
    // option that opens it. Clicking that option IS the switch, and it is why
    // the switch is still standing on the visit that clicks it: the form it
    // would leave is not up yet. A card the option cannot be found on (no API
    // protocol to declare, or no namespace to declare one into) is left exactly
    // as the official page built it.
    //
    // User item 1: the click is read again in this same pass instead of being
    // left for the next observer callback. A click is a discrete React event,
    // so the custom half is committed by the time it returns — mounting into it
    // now makes the bar and the form arrive in ONE frame, where the early
    // return made the form paint and then grow the bar on the visit after.
    chooseCustomMode(card)
    custom = panelWithSuffix(card, CUSTOM_PANEL_SUFFIX)
    if (custom === undefined || custom.hidden) return
  }
  // User item 2: the add-provider card itself kept the official tinted fill,
  // while every card INSIDE the takeover was whitened — a grey slab around a
  // white form. The marker is this pass's own, so the stylesheet can whiten the
  // card without matching a hashed host class.
  if (card.getAttribute('data-bre-add-card') !== '1') card.setAttribute('data-bre-add-card', '1')
  ensureHost(card, custom, deps, state)
  // User item 9: the add-provider form gets the key field MARKED, not a second
  // eye. The official API-key box already draws its own reveal button inside
  // the box (`inset: 1px 1px 1px auto`) as soon as it holds text — and this card
  // has no stored credential to fetch, so the plugin's eye could only ever
  // toggle the mask the official one toggles. Two eyes, one of them hanging
  // under the field, is exactly what the report described. The mark stays
  // because the key list below has to keep finding the input after the official
  // toggle flips its type.
  markKeyFields(card)
  // The key FIELD is dressed card-wide, but the key LIST — the draft list the
  // edit card's key manager mirrors — seats only the custom form's field: the
  // card keeps its other half mounted, and a second seat there would stage a
  // second, empty draft list against the same route the visible one holds.
  seatKeyFields(custom, deps)
  // Hidden only once the custom form is really up: a card whose custom half is
  // disabled must keep the switch that explains why.
  setPickerHidden(card, true)
}

/** The field wrappers of a form, as the official page spells them: the element
 * that holds a single labelled control. */
const FIELD_SELECTOR = '.field, label'

/**
 * The plugin's own surfaces inside a card — the keys list's host, the list
 * itself, and the tab bar's mount.
 *
 * An input inside one of these is OURS, not the official form's. This is not
 * cosmetic: the draft list's open form carries a password box of its own, and a
 * pass that read it as an official key field would seat a SECOND list under it,
 * whose open form carries another password box — a host nested inside a host,
 * one per pass, until the card is metres tall. Reported as "点开新增供应商，
 * 出现了无限向下扩展" (2026-10-25), which is exactly this: the card's own key
 * list grew a list, and that list grew a list.
 */
const OWN_SURFACE_SELECTOR = '.bre-keys-host, .bre-keys, .bre-create-host'

/**
 * The API-key fields of a form, derived from the INPUTS rather than a wrapper
 * class: the reveal pass spells a key input as a masked one (or, once it has
 * dressed the field, a marked one), and the official create form does not agree
 * on a wrapper class the way the edit card's `.field` does — a seat that keyed
 * on the wrapper found nothing on the live card, and the key field kept its
 * official single-input look beside a takeover that plainly worked. The field
 * is the input's nearest `.field`/`label` ancestor, or simply its parent.
 *
 * Inputs inside the plugin's own surfaces are skipped: they are ours to render,
 * not the page's to adopt (see {@link OWN_SURFACE_SELECTOR}).
 */
function keyFieldsOf(scope: HTMLElement): HTMLElement[] {
  const fields: HTMLElement[] = []
  const marked = scope.querySelectorAll<HTMLInputElement>(
    'input[type="password"], input[data-bre-key-input]',
  )
  for (const input of Array.from(marked)) {
    if (input.closest(OWN_SURFACE_SELECTOR) !== null) continue
    const field = input.closest<HTMLElement>(FIELD_SELECTOR) ?? input.parentElement
    if (field !== null && !fields.includes(field)) fields.push(field)
  }
  return fields
}

/**
 * Mark every API-key input in the card, without hanging an eye on it.
 *
 * The create card is not one of the editor cards the tab takeover walks (it only
 * carries a plugin mount for the bar), so nothing else marks its key field —
 * and the key list below needs the mark to still find the input once the
 * official reveal button has flipped it to plain text. See `markKeyField` for
 * why this card gets no eye of its own.
 */
function markKeyFields(scope: HTMLElement): void {
  for (const field of keyFieldsOf(scope)) {
    try {
      markKeyField(field)
    } catch (error) {
      // A form the official page restructured mid-scan is not worth a card: the
      // mark is bookkeeping, and the field still works without it.
      console.warn('[bre] add provider card: could not mark a key field:', error)
    }
  }
}

/**
 * Give the custom form's key field the edit card's draft key list.
 *
 * The list runs over an in-memory store (there is no route to read), and its
 * drafts wait in the session ledger until this card's own 保存 declares the
 * provider they belong to — see `staged-keys`. A field with no key input is
 * reset, so a card the page restructured sheds any list whose field is gone.
 */
function seatKeyFields(scope: HTMLElement, deps: AddCardDeps): void {
  for (const field of keyFieldsOf(scope)) {
    try {
      enhanceCreateKeySeat(field, {
        t: deps.t,
        api: deps.api,
        routeIdLabels: deps.routeIdLabels,
        staged: deps.stagedKeys,
        refreshed: deps.refreshed,
      })
    } catch (error) {
      // The list is an affordance the official form works without: a field it
      // could not seat keeps the official input (the managed mark goes with
      // the reset the enhancer never reached, so the box stays usable).
      resetCreateKeySeat(field)
      console.warn('[bre] add provider card: could not mount the key list:', error)
    }
  }
}

/** Show or hide the official switch. */
function setPickerHidden(card: HTMLElement, hidden: boolean): void {
  const picker = pickerOf(card)
  if (picker === undefined) return
  setClass(picker, MODE_PICKER_CLASS, hidden)
}

/** The card's form half whose id ends with `suffix`. */
function panelWithSuffix(card: HTMLElement, suffix: string): HTMLElement | undefined {
  for (const panel of Array.from(card.querySelectorAll<HTMLElement>(ADD_PANEL_SELECTOR))) {
    if (panel.id.endsWith(suffix)) return panel
  }
  return undefined
}

/** The official "How to add" switch — the control itself, not its hint. */
function pickerOf(card: HTMLElement): HTMLElement | undefined {
  const modes = card.querySelector<HTMLElement>(ADD_MODES_SELECTOR)
  if (modes === null) return undefined
  for (const child of Array.from(modes.children)) {
    if (child instanceof HTMLElement && child.getAttribute('role') === 'tablist') return child
  }
  return undefined
}

/** Click the switch's custom option, unless it is already the selected one. */
function chooseCustomMode(card: HTMLElement): void {
  const picker = pickerOf(card)
  if (picker === undefined) return
  for (const option of Array.from(picker.querySelectorAll<HTMLButtonElement>('[role="tab"]'))) {
    if (!option.id.endsWith(CUSTOM_OPTION_SUFFIX)) continue
    // A disabled option is the official page's own "there is nothing to
    // declare": the switch stays exactly where it is, because it is the only
    // thing on the card that says so.
    if (option.disabled) return
    if (option.getAttribute('aria-selected') !== 'true') option.click()
    return
  }
}

/** The plugin's mount inside one form half, when it is still standing. */
function hostOf(panel: HTMLElement): HTMLElement | undefined {
  for (const child of Array.from(panel.children)) {
    if (child instanceof HTMLElement && child.classList.contains(CREATE_HOST_CLASS)) return child
  }
  return undefined
}

/**
 * Mount the pane at the top of the form this card shows.
 *
 * The mount is created here rather than by the slot because the official card
 * renders the provider-card slot only in its catalogue half. It is a plain
 * block the panel's own flex column then spaces like every other row of the
 * form, and it is inserted at the FRONT of that column: the tab bar belongs
 * above the fields it switches between, and React only ever inserts its own
 * children relative to the siblings it knows, so the mount stays where it is
 * put for as long as the form is up.
 */
function ensureHost(card: HTMLElement, panel: HTMLElement, deps: AddCardDeps, state: AddCardState): void {
  const known = state.hosts.get(card)
  const existing = hostOf(panel)
  // The settled case, and the only one a scan is allowed to take: the node in
  // the form is the very node this module mounted there.
  if (existing !== undefined && known !== undefined && known.host === existing) return
  // Anything else is a page that re-rendered the form under our feet: the
  // recorded root (if any) and the stray node both go, and a fresh mount takes
  // their place. React re-created the panel's children, so the node it left us
  // is no longer reachable from any root this module owns.
  dropHost(card, state)
  if (existing !== undefined) existing.remove()
  const host = card.ownerDocument.createElement('div')
  host.className = CREATE_HOST_CLASS
  panel.insertBefore(host, panel.firstChild)
  // User item 1: the card grows over the next few frames (the pane, then the
  // key list it seats), and the browser's own scroll anchoring reacts to every
  // one of those frames by moving the scroll container to keep an anchor still.
  // The anchor it picks lands inside the card that is growing — pushing the
  // configured provider above it up the viewport — so anchoring is taken out of
  // the decision for the duration. This only writes `overflow-anchor`; it never
  // moves the scroll position itself, so the growth stays growth and everything
  // above the card keeps its place.
  suppressScrollAnchoring(card)
  // `sync`: the card's height is what the settings scroller measures, so the
  // bar (and the pane under it) must be in the tree before this microtask ends,
  // exactly like the editor seats the official card's own render measures.
  const mount = mountReact(
    host,
    deps.refreshed(() => createElement(CreateCardPane, {
      host: { current: host },
      api: deps.api,
      t: deps.t,
      routeIdLabels: deps.routeIdLabels,
      staged: deps.staged,
    })),
    { sync: true },
  )
  state.hosts.set(card, { host, mount })
}

/** Take one card's mount down; the wrapper leaves the DOM with it. */
function dropHost(card: HTMLElement, state: AddCardState): void {
  const known = state.hosts.get(card)
  if (known === undefined) return
  state.hosts.delete(card)
  unmountReact(known.mount)
}

/**
 * Give every card back to the official page: the mounts go, and the switch
 * comes out of hiding. The mode the card is left in is the official page's own
 * state, and it is not this module's to reset — React unmounts the card whole.
 */
export function teardownAddCards(state: AddCardState): void {
  for (const card of Array.from(state.hosts.keys())) dropHost(card, state)
  // Strays: a mount whose card outlived a dead fiber's map.
  for (const host of Array.from(document.querySelectorAll<HTMLElement>(`.${CREATE_HOST_CLASS}`))) host.remove()
  for (const picker of Array.from(document.querySelectorAll<HTMLElement>(`.${MODE_PICKER_CLASS}`))) {
    setClass(picker, MODE_PICKER_CLASS, false)
  }
  // The key-field dressing this module added goes with the rest of its marks, so
  // a withdrawn takeover leaves the official form exactly as the page built it.
  for (const field of Array.from(document.querySelectorAll<HTMLElement>(`.${KEY_FIELD_CLASS}`))) {
    resetKeyField(field)
  }
  // And the draft key lists with it: their hosts are this module's own DOM, and
  // the fields they managed must get the official input back.
  teardownCreateKeySeats()
}
