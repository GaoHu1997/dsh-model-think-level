/**
 * The provider editor's three-tab takeover for the official Models settings
 * page.
 *
 * The official editor presents one provider as a single long column — identity
 * fields, then the model list, then (one section further up the card) this
 * plugin's request-header editor — and the column keeps growing with every
 * feature. This pass re-presents the same content as three tabs:
 *
 *   `provider` — the official identity fields (display name, key, base URL,
 *                protocol); the editor's own header and action row stay put.
 *   `models`   — the official model list, the rows the effort editor seats
 *                into.
 *   `advanced` — the plugin's request-header section, which the provider-card
 *                slot already mounts and which owns its own save/cancel.
 *
 * The takeover is pure CSS, by the same iron rule every pass here follows:
 * React owns the official children, so none of them move. The card carries the
 * active tab (`data-bre-tab`), each region carries its tab membership
 * (`data-bre-region`), and the stylesheet — not this module — decides what is
 * visible.
 *
 * The bar is NOT part of that DOM, and this module never inserts it. It is
 * React-rendered by {@link EditorTabBar} inside the plugin's own request-header
 * mount, which the provider-card slot already guarantees is a child of the
 * card; the stylesheet reveals it the moment the card carries the takeover
 * class. An earlier revision inserted the bar straight into the official child
 * list from here, which made it a foreign node in a React-reconciled list: it
 * was at the mercy of the next render, and the insertion itself needed the
 * headers mount to be a DIRECT child of the card — an anchor this module cannot
 * verify and which threw (aborting the whole scan) when it did not hold. Owning
 * the bar inside our own subtree removes both hazards: the pass below only ever
 * writes attributes, and the slot component publishes the card's open state the
 * same way.
 *
 * Everything degrades to the official page: a card whose structure this pass
 * cannot recognise (host redesign, partial render) is left exactly as the
 * official page built it, a card whose takeover throws is rolled back the same
 * way, and every attribute write is compared before it lands so the scan never
 * feeds the MutationObserver its own tail.
 *
 * The same visit also dresses the provider's API-key field with its reveal eye
 * ({@link revealKeyField}) and its key controls ({@link enhanceKeyManagerField}),
 * because that field's shape is decided by exactly the same classification and
 * its affordances have to come and go with the takeover.
 *
 * @module dsh-model-think-level/client/injection/editor-tabs
 */

import { setAttr, setClass, setHidden, setText } from './dom.js'
import { KEY_MANAGED_CLASS, enhanceKeyManagerField, resetKeyManagerField, teardownKeyManager } from './key-manager.js'
import { KEY_FIELD_CLASS, resetKeyField, revealKeyField } from './key-reveal.js'
import { scrollHostOf } from './row-drag.js'

/** Marks the tab bar the plugin's own tab-bar component renders (one per card). */
const TABS_CLASS = 'bre-editor-tabs'

/** One button inside the bar; carries its tab id. */
const TAB_BUTTON_CLASS = 'bre-editor-tab'

/** The attribute holding a button's tab id. */
const TAB_ID_ATTR = 'data-bre-tab-id'

/** Set on a card whose editor has been re-presented as tabs. */
const TABBED_CLASS = 'bre-tabbed'

/** The card's active tab id; the region-visibility CSS keys on it. */
const TAB_ATTR = 'data-bre-tab'

/**
 * The provider route a card edits, as published by the provider-card slot on
 * its own mount (`src/client/injection/provider-card-slot.ts` writes
 * `data-bre-provider={route}` on `.bre-headers-host`). Read here rather than
 * imported: an import of the slot would close a cycle back through the tab bar
 * this module backs. Absent on the add-provider form, which edits no route yet.
 */
const PROVIDER_ROUTE_ATTR = 'data-bre-provider'

/** Tags an element as the pane content of one tab. */
const REGION_ATTR = 'data-bre-region'

/** Tags the official editor body, hidden wholesale on the advanced tab. */
const BODY_ATTR = 'data-bre-editor-body'

/** Remembers a `<details>` this pass forced open (the official "Customized"
 * group starts collapsed; with the tab bar in charge it must stay expanded).
 * The value records the state the pass found, so cleanup can restore it. */
const DETAILS_MEMO_ATTR = 'data-bre-details'

/** The plugin's request-header mount inside a provider card. It stays visible
 * on every tab — it carries the tab bar; only the section inside it is a pane. */
const HEADERS_HOST_SELECTOR = '.bre-headers-host'

/** The request-header section itself: the `advanced` pane. */
const HEADERS_SECTION_SELECTOR = '.bre-headers'

/** Tab ids, in display order. */
const TAB_PROVIDER = 'provider'
const TAB_MODELS = 'models'
const TAB_ADVANCED = 'advanced'
const TAB_IDS = [TAB_PROVIDER, TAB_MODELS, TAB_ADVANCED] as const

/**
 * A region id that is NEVER a tab. The pane rules only ever reveal the three
 * ids above, so a region tagged with this one stays hidden on every tab — which
 * is exactly what a part of the editor that the card already shows elsewhere
 * needs. Today that is the editor's own header (its title repeats the card
 * row's provider name, and its route tag repeats the row's route tag).
 */
const REGION_NONE = 'none'

/** A tab id, as both the bar and the card attribute spell it. */
export type EditorTabId = (typeof TAB_IDS)[number]

/** The tab ids, in display order, for the tab-bar component. */
export const EDITOR_TAB_IDS: readonly EditorTabId[] = TAB_IDS

/** The bar's class, a button's class and a button's tab-id attribute, exported
 * so the component that renders the bar and the pass that labels it spell the
 * contract once. */
export const EDITOR_TABS_CLASS = TABS_CLASS
export const EDITOR_TAB_BUTTON_CLASS = TAB_BUTTON_CLASS
export const EDITOR_TAB_ID_ATTR = TAB_ID_ATTR

/** The structural probes of an OPEN official editor — the same signals the
 * editor reconcile and the write fence already trust. */
const EDITOR_PROBE =
  '[class*="editorActions"], [class*="modelList"], [class*="modelCatalog"], [class*="modelEntry"]'

/** Elements that ARE the model list itself — classified as the models pane on
 * sight. The live editor nests the catalog inside the "Customized" disclosure
 * together with the identity fields; anything up to this boundary is a group
 * to step inside, and the boundary itself is where the sorting stops (model
 * rows carry inputs of their own, which must never sort as provider fields). */
const MODELS_TERMINAL = '[class*="modelCatalog"], [class*="modelList"], [class*="modelEntry"]'

/** A provider card: a row with an open editor, or the create-provider card. */
const CARD_PROBE = '[class*="rowCard"], [class*="addCard"], li'

/** Per-scan bookkeeping (one instance lives in `models-page.ts`). */
export interface EditorTabsState {
  /** Cards whose takeover threw and had to be rolled back. A card that cannot
   * be taken over must not repeat its complaint on every scan. */
  readonly warned: WeakSet<Element>
}

export interface EditorTabsDeps {
  /** The plugin's own translator, for the tab labels. */
  t: (key: string, params?: Record<string, string | number>) => string
}

export function createEditorTabsState(): EditorTabsState {
  return { warned: new WeakSet() }
}

/**
 * The card a plugin mount sits in. Both the slot component (publishing the
 * card's open state, switching tabs) and this pass resolve the card through
 * this one rule, so a card can never be taken over by one and addressed by the
 * other.
 */
export function editorCardOf(element: Element | null): HTMLElement | null {
  return element === null ? null : element.closest<HTMLElement>(CARD_PROBE)
}

/**
 * Switch one card to a tab. The card attribute is the single source of truth:
 * the stylesheet swaps the pane on the attribute alone, and the bar's buttons
 * follow it here.
 *
 * Switching panes changes the card's height (the model list is far taller than
 * the identity fields), and the browser's scroll anchoring then keeps a node
 * near the card's BOTTOM visually stable — the card's header walks up the
 * viewport. The card's top is re-pinned here instead: the scroll host's offset
 * is measured against the card's viewport position before the switch and
 * restored against it after, so the header stays put and the card grows
 * DOWNWARD.
 *
 * The restore ADDS the delta to the offset, the way {@link pinCardTop} does:
 * a card that has moved down the screen is brought back by scrolling down the
 * document. Subtracting it works only while the delta is 0 — which is the
 * common case here, because the suppression below is what stops the browser
 * from moving the offset in the first place — and drives the card the wrong way
 * on the occasion the swap really did move it.
 */
export function selectEditorTab(card: HTMLElement, id: EditorTabId): void {
  const host = scrollHostOf(card)
  // The card's viewport Y before the pane swap — the number the restore below
  // re-earns. The scroll host's offset is captured with it because the swap
  // may reset the host's own scrollTop as its content shrinks and grows.
  const topBefore = card.getBoundingClientRect().top
  const scrollTopBefore = host?.scrollTop ?? 0
  // Suppress the host's scroll anchoring across the swap: anchoring keeps a
  // node near the card's BOTTOM stable, which is exactly the walk-up this
  // restores. With it off, the host's scrollTop stays where it was put.
  if (host !== undefined) host.style.overflowAnchor = 'none'
  setAttr(card, TAB_ATTR, id)
  syncSelected(card)
  if (host === undefined) return
  // The pane swap is pure CSS: the reflow it costs lands in the same frame, so
  // one rAF later the new height is measurable and the top can be re-pinned.
  requestAnimationFrame(() => {
    host.style.overflowAnchor = ''
    // A scroll of our own (or of the user, mid-restore) must not be fought.
    if (host.scrollTop !== scrollTopBefore) return
    const delta = card.getBoundingClientRect().top - topBefore
    if (delta !== 0) host.scrollTop += delta
  })
}

/**
 * Visit every open provider editor and make sure it presents as tabs.
 * Idempotent: a card that already carries the takeover is only relabelled,
 * which is also how a language switch reaches the page. Cards the pass no
 * longer recognises as open fall back to the official one-column layout.
 */
export function reconcileEditorTabs(root: HTMLElement, deps: EditorTabsDeps, state: EditorTabsState): void {
  if (!root.isConnected) return
  const open = new Set<HTMLElement>()
  for (const probe of Array.from(root.querySelectorAll<HTMLElement>(EDITOR_PROBE))) {
    const card = probe.closest<HTMLElement>(CARD_PROBE)
    if (card !== null) open.add(card)
  }
  for (const card of Array.from(root.querySelectorAll<HTMLElement>(`.${TABBED_CLASS}`))) {
    if (!open.has(card)) cleanupCard(card)
  }
  for (const card of open) {
    try {
      applyTabs(card, deps)
    } catch (error) {
      // One unprocessable card must not cost the page its other cards. Roll the
      // takeover back — the official editor then renders exactly as the
      // official page built it — and say so once per card rather than on every
      // scan. `cleanupCard` only removes attributes and classes, so the
      // rollback cannot throw a second time.
      if (!state.warned.has(card)) {
        state.warned.add(card)
        console.warn('[bre] editor tabs: rolled a provider card back to the official layout:', error)
      }
      cleanupCard(card)
    }
  }
}

/** Remove every takeover mark. The bar is the tab-bar component's own DOM and
 * is hidden, not removed, by dropping the class it is revealed under. */
export function teardownEditorTabs(): void {
  for (const card of Array.from(document.querySelectorAll<HTMLElement>(`.${TABBED_CLASS}`))) {
    card.classList.remove(TABBED_CLASS)
    card.removeAttribute(TAB_ATTR)
    card.removeAttribute(BODY_ATTR)
    for (const el of Array.from(card.querySelectorAll<HTMLElement>(`[${REGION_ATTR}]`))) {
      el.removeAttribute(REGION_ATTR)
    }
  }
  // Stray marks on cards the class already left (mid-cleanup shapes) — cheap
  // to sweep document-wide once, on teardown only.
  for (const el of Array.from(document.querySelectorAll<HTMLElement>(`[${TAB_ATTR}]`))) el.removeAttribute(TAB_ATTR)
  for (const el of Array.from(document.querySelectorAll<HTMLElement>(`[${REGION_ATTR}]`))) {
    el.removeAttribute(REGION_ATTR)
  }
  for (const el of Array.from(document.querySelectorAll<HTMLElement>(`[${BODY_ATTR}]`))) {
    el.removeAttribute(BODY_ATTR)
  }
  for (const group of Array.from(document.querySelectorAll<HTMLDetailsElement>(`details[${DETAILS_MEMO_ATTR}]`))) {
    group.removeAttribute('open')
    group.removeAttribute(DETAILS_MEMO_ATTR)
  }
  // The reveal eye is the one node this pass inserts into official DOM, so it
  // needs the same stray sweep: whatever card it was left on, it goes — with
  // the mask restored to the input it was unmasking.
  for (const field of Array.from(document.querySelectorAll<HTMLElement>(`.${KEY_FIELD_CLASS}`))) {
    resetKeyField(field)
  }
  // The alias chip and the add button are the other two nodes this pass
  // inserts into official DOM, and the panel they open is a body-level layer:
  // both go the same way, and the layer is closed outright.
  for (const field of Array.from(document.querySelectorAll<HTMLElement>(`.${KEY_MANAGED_CLASS}`))) {
    resetKeyManagerField(field)
  }
  teardownKeyManager()
}

/** The body of the card's open editor, or undefined when unrecognisable. */
function editorBodyOf(card: HTMLElement): HTMLElement | undefined {
  for (const child of Array.from(card.children)) {
    if (!(child instanceof HTMLElement)) continue
    // The card's header and action rows are "editor"-classed too; the body is
    // the remaining editor-classed child that actually holds the form.
    if (child.matches('[class*="editorHeader"], [class*="editorTitle"], [class*="editorActions"], [class*="editorRoute"]')) {
      continue
    }
    if (!child.matches('[class*="editor"]')) continue
    if (child.querySelector(EDITOR_PROBE) !== null || child.querySelector('input, select') !== null) return child
  }
  // Climb from the probes instead: the body is the probe's ancestor hanging
  // directly off the card.
  let node: HTMLElement | null = card.querySelector<HTMLElement>(EDITOR_PROBE)
  while (node !== null && node.parentElement !== card) node = node.parentElement
  return node !== null && node !== card ? node : undefined
}

/** One editor body sorted into tab panes. */
interface BodyRegions {
  /** The editor's own header (title + route tag). The card row directly above
   * already shows both, so the pass tags it {@link REGION_NONE}: hidden on
   * every tab. */
  header?: HTMLElement
  /** The model list's container; absent when the provider has no catalogue. */
  models?: HTMLElement
  /** The commit/cancel row; always visible. */
  actions: HTMLElement
  /** Every remaining child — the provider identity fields. */
  fields: HTMLElement[]
}

/**
 * Sort the body into panes. Undefined when the shape is not the editor this
 * module knows: the identity fields and the action row must be present, or the
 * card is left alone.
 *
 * The model list is deliberately NOT required. A provider with no catalogue
 * yet still has an editor worth tabbing — the fields are exactly the ones a
 * user is looking for — so a missing catalogue only costs the Models tab
 * (which the bar hides) rather than the whole takeover.
 *
 * The live editor does not keep its panes as flat siblings: identity fields
 * and the model catalog share one `<details>` group ("Customized"), so a
 * child that carries the model probes *and* form controls is treated as a
 * grouping wrapper — its children are sorted instead of the group itself
 * becoming one pane. The sort never steps past `MODELS_TERMINAL`, where the
 * catalog's own model rows (inputs of their own) live.
 */
function classifyBody(body: HTMLElement): BodyRegions | undefined {
  const regions = {
    header: undefined as HTMLElement | undefined,
    models: undefined as HTMLElement | undefined,
    actions: undefined as HTMLElement | undefined,
    fields: [] as HTMLElement[],
  }
  classifyChildren(body, regions, 0)
  const { actions, fields, header, models } = regions
  if (actions === undefined || fields.length === 0) return undefined
  if (!fields.some((field) => field.querySelector('input, select, textarea') !== null)) return undefined
  return { header, models, actions, fields }
}

/** Recursion cap: the live nesting is body → details → body → catalog. */
const CLASSIFY_MAX_DEPTH = 4

type BodyRegionsDraft = {
  header: HTMLElement | undefined
  models: HTMLElement | undefined
  actions: HTMLElement | undefined
  fields: HTMLElement[]
}

function classifyChildren(container: HTMLElement, regions: BodyRegionsDraft, depth: number): void {
  if (depth > CLASSIFY_MAX_DEPTH) return
  for (const child of Array.from(container.children)) {
    if (!(child instanceof HTMLElement)) continue
    // Plugin-authored subtrees are nobody's pane. NOTE: the region tags are
    // NOT ownership — they mark this pass's own classification of official
    // children, and filtering on them would make the next scan un-classify
    // everything it classified the pass before.
    if (child.matches('[class*="bre-"], [data-plugin]')) continue
    if (regions.header === undefined && child.matches('[class*="editorHeader"], [class*="editorTitle"]')) {
      regions.header = child
      continue
    }
    if (child.matches('[class*="editorActions"]')) {
      regions.actions ??= child
      continue
    }
    if (child.matches(MODELS_TERMINAL)) {
      regions.models ??= child
      continue
    }
    if (child.querySelector(EDITOR_PROBE) !== null) {
      // A grouping wrapper — fields and the model list together. Step inside.
      classifyChildren(child, regions, depth + 1)
      continue
    }
    if (child.querySelector('[class*="editorActions"]') !== null) {
      regions.actions ??= child
      continue
    }
    if (child.querySelector('input, select, textarea') !== null) {
      regions.fields.push(child)
    }
    // Summaries, error/hint paragraphs, bare wrappers — nobody's pane.
  }
}

/** The provider route this card edits, when the slot has published one. */
function providerRouteOf(card: HTMLElement): string | undefined {
  const host = card.querySelector<HTMLElement>(`[${PROVIDER_ROUTE_ATTR}]`)
  const route = host?.getAttribute(PROVIDER_ROUTE_ATTR)
  return route === null || route === undefined || route === '' ? undefined : route
}

/** Tag one open editor card for the takeover. */
function applyTabs(card: HTMLElement, deps: EditorTabsDeps): void {
  const body = editorBodyOf(card)
  if (body === undefined) {
    cleanupCard(card)
    return
  }
  const regions = classifyBody(body)
  if (regions === undefined) {
    cleanupCard(card)
    return
  }
  const headersSection = card.querySelector<HTMLElement>(HEADERS_SECTION_SELECTOR)

  // One route for the whole pane: every field here belongs to the same
  // provider, and the eye and the key panel both use it to name the provider
  // whose keys they act on.
  const route = providerRouteOf(card)
  for (const field of regions.fields) {
    setAttr(field, REGION_ATTR, TAB_PROVIDER)
    // Dresses the API-key field with its reveal eye; a no-op on every other
    // field of the pane.
    revealKeyField(field, { t: deps.t, route })
    // …and with the alias chip and the add button that open the key panel,
    // likewise only on the field that holds the key input.
    enhanceKeyManagerField(field, { t: deps.t, route })
  }
  // The editor's own header repeats the card row's provider name and route tag,
  // and that row sits right above it: rather than give it a pane of its own it
  // is tagged with a region id no tab can select, so it stays hidden. It is
  // tagged rather than removed so cleanup restores the official markup by
  // dropping the one attribute.
  if (regions.header !== undefined) setAttr(regions.header, REGION_ATTR, REGION_NONE)
  if (regions.models !== undefined) setAttr(regions.models, REGION_ATTR, TAB_MODELS)
  setAttr(body, BODY_ATTR, '')
  // The MOUNT is not the pane: it carries the bar and stays visible on every
  // tab, so only the section inside it is tagged (and hidden off `advanced`).
  if (headersSection !== null) setAttr(headersSection, REGION_ATTR, TAB_ADVANCED)
  forceGroupsOpen(body)

  // A tab whose pane is not on this card steps aside: the model list on a
  // provider with no catalogue, the section while the slot has not rendered it
  // (pre-first-render, or the headers feature off). A card sitting on a tab
  // that just became unavailable falls back to the first one.
  const available = new Set<string>([TAB_PROVIDER])
  if (regions.models !== undefined) available.add(TAB_MODELS)
  if (headersSection !== null) available.add(TAB_ADVANCED)
  const active = card.getAttribute(TAB_ATTR) ?? TAB_PROVIDER
  setAttr(card, TAB_ATTR, available.has(active) ? active : TAB_PROVIDER)
  setClass(card, TABBED_CLASS, true)

  syncTabBar(card, deps, available)
}

/**
 * Keep the bar in step with the card.
 *
 * The bar's STRUCTURE belongs to the tab-bar component; this pass owns the copy
 * (a language switch relabels the official page, and the bar must be relabelled
 * with it), the availability of each pane, and the selected state. All three
 * are written only when they differ, so a settled page produces no mutation of
 * its own.
 */
function syncTabBar(card: HTMLElement, deps: EditorTabsDeps, available: ReadonlySet<string>): void {
  const bar = card.querySelector<HTMLElement>(`.${TABS_CLASS}`)
  if (bar === null) return
  setAttr(bar, 'aria-label', deps.t('editorTabsLabel'))
  setText(tabOf(bar, TAB_PROVIDER), deps.t('editorTabProvider'))
  setText(tabOf(bar, TAB_MODELS), deps.t('editorTabModels'))
  setText(tabOf(bar, TAB_ADVANCED), deps.t('editorTabAdvanced'))
  setHidden(tabOf(bar, TAB_MODELS), !available.has(TAB_MODELS))
  setHidden(tabOf(bar, TAB_ADVANCED), !available.has(TAB_ADVANCED))
  syncSelected(card, bar)
}

/** Mark the active button. The panes follow the card's attribute in CSS, so
 * this is the bar's own state (and assistive tech's), not the pane switch. */
function syncSelected(card: HTMLElement, bar?: HTMLElement): void {
  const target = bar ?? card.querySelector<HTMLElement>(`.${TABS_CLASS}`)
  if (target === null) return
  const active = card.getAttribute(TAB_ATTR) ?? TAB_PROVIDER
  for (const tab of Array.from(target.querySelectorAll<HTMLElement>(`[${TAB_ID_ATTR}]`))) {
    setAttr(tab, 'aria-selected', tab.getAttribute(TAB_ID_ATTR) === active ? 'true' : 'false')
  }
}

function tabOf(bar: HTMLElement, id: string): HTMLElement | undefined {
  for (const tab of Array.from(bar.children)) {
    if (tab instanceof HTMLElement && tab.getAttribute(TAB_ID_ATTR) === id) return tab
  }
  return undefined
}

/** Drop the takeover from one card, back to the official one-column layout. */
function cleanupCard(card: HTMLElement): void {
  // The bar is NOT removed here: it is the tab-bar component's own DOM, and
  // React unmounts it with the card. Leaving the takeover class off is all it
  // takes to hide it, because the stylesheet reveals it only under that class.
  card.classList.remove(TABBED_CLASS)
  card.removeAttribute(TAB_ATTR)
  card.removeAttribute(BODY_ATTR)
  for (const el of Array.from(card.querySelectorAll<HTMLElement>(`[${REGION_ATTR}]`))) {
    if (el.getAttribute(REGION_ATTR) === TAB_PROVIDER) {
      resetKeyField(el)
      resetKeyManagerField(el)
    }
    el.removeAttribute(REGION_ATTR)
  }
  restoreGroups(card)
}

/**
 * The official "Customized" group renders collapsed by default; with the tab
 * bar in charge there is no summary row left to expand it, so any group inside
 * a taken-over body is forced open. A memo attribute records the groups this
 * pass opened (vs. ones the page rendered open) so cleanup restores exactly
 * those.
 */
function forceGroupsOpen(body: HTMLElement): void {
  for (const group of Array.from(body.querySelectorAll('details'))) {
    if (group.hasAttribute('open')) continue
    setAttr(group, DETAILS_MEMO_ATTR, 'closed')
    setAttr(group, 'open', '')
  }
}

/** Undo {@link forceGroupsOpen}: re-close the groups the pass opened. */
function restoreGroups(card: HTMLElement): void {
  for (const group of Array.from(card.querySelectorAll(`details[${DETAILS_MEMO_ATTR}]`))) {
    group.removeAttribute('open')
    group.removeAttribute(DETAILS_MEMO_ATTR)
  }
}

