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
import { mountReact, unmountReact, type ForeignMount } from './mount.js'
import type { StagedHeadersState } from './staged-headers.js'
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
      // leave a half-dressed form behind: the mount goes and the switch comes
      // back, which is the official card exactly as it was.
      dropHost(card, state)
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
  const custom = panelWithSuffix(card, CUSTOM_PANEL_SUFFIX)
  if (custom === undefined) {
    // The official page mounts each half the first time its mode is visited, so
    // on the card's first scan there is no custom half to find — only the
    // option that opens it. Clicking that option IS the switch, and it is why
    // the switch is still standing on the visit that clicks it: the form it
    // would leave is not up yet. A card the option cannot be found on (no API
    // protocol to declare, or no namespace to declare one into) is left exactly
    // as the official page built it.
    chooseCustomMode(card)
    return
  }
  if (custom.hidden) {
    // Visited and switched away again: the official control owns the mode, so
    // the mode is switched by clicking it. The form itself appears on the
    // render that click schedules; this pass dresses it on the visit after.
    chooseCustomMode(card)
    return
  }
  ensureHost(card, custom, deps, state)
  // Hidden only once the custom form is really up: a card whose custom half is
  // disabled must keep the switch that explains why.
  setPickerHidden(card, true)
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
 * form, and it is inserted at the FRONT of that column: React only ever
 * inserts its own children relative to the siblings it knows, so the mount
 * stays where it is put for as long as the form is up.
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
}
