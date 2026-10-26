/**
 * Provider-card layout and dual endpoints (user items 3, 4, 6, 7).
 *
 * The official card renders its route fields in a fixed order — display name,
 * base URL, API protocol — and offers a single base URL. This module reshapes
 * that card in place on every scan. It is idempotent, so a React re-render
 * self-heals on the next pass — the same pattern `hideOfficialReasoning` uses:
 *
 *   - **the fields are re-ordered** to display name → API protocol → base URL,
 *     so the protocol sits above the address it governs.
 *   - **the API protocol is picked from cards.** The official `<select>` is kept
 *     as the value the host reads, but it is hidden behind a row of plugin cards —
 *     one per protocol, the one in force highlighted — so every choice is visible
 *     without opening a dropdown (user item 1).
 *   - **the address is labelled by protocol family.** The official base-URL
 *     input is prefixed with "OpenAI"/"Anthropic" according to the protocol the
 *     card currently selects, seated immediately LEFT of the input on its own
 *     line — never stacked above it — so the tag reads as the field's prefix.
 *   - **extra endpoints can be added.** A grey "更多端点" text button directly
 *     under the API address — where the rows it reveals appear — opens one more
 *     address row for EVERY family the selected protocol does not serve
 *     (Anthropic and Gemini under an OpenAI protocol, OpenAI and Gemini under
 *     Anthropic). They persist to the route's `endpoints` in this plugin's key
 *     index, which is what a key pinned to that family signs against.
 *
 * The add card carries the same three fields, so the same decoration applies to
 * it — "添加供应商" is not left behind (user item 6).
 *
 * @module dsh-model-think-level/client/injection/provider-endpoints
 */

import { endpointFamilyOf, ENDPOINT_FAMILIES, type EndpointFamily as Family, type RouteProtocol } from '../../key-refs.js'
import { setHidden } from './dom.js'
import { ENDPOINTS_CHANGED_EVENT } from '../events.js'
import { httpKeyManagerClient, type KeyManagerClient } from '../key-manager-client.js'

/** The card-field label anchors this module needs, as the host spells them. */
export interface EndpointLabels {
  /** The provider-id field (names the route). */
  readonly routeId: readonly string[]
  /** The display-name field. */
  readonly modelName: readonly string[]
  /** The base-URL field. */
  readonly baseUrl: readonly string[]
  /** The API-protocol field. */
  readonly apiProtocol: readonly string[]
}

/** The transport and copy an injection needs. */
export interface EndpointDeps {
  /** Transport; injectable for tests. */
  readonly client?: KeyManagerClient | undefined
  /** Copy for the injected controls. */
  readonly t: (key: string, params?: Record<string, string | number>) => string
}

/**
 * The stored endpoint triple, one base URL per family. Always whole: the host
 * replaces the set on write, so every merge carries all three sides.
 */
interface StoredEndpoints {
  readonly openai: string
  readonly anthropic: string
  readonly gemini: string
}

/** Marks the container holding the extra address rows. */
const EXTRA_ROWS_ATTR = 'data-bre-endpoint-rows'
/** Marks one injected extra address row; the value is the family it serves. */
const SECOND_ROW_ATTR = 'data-bre-endpoint-row'
/** Marks the family tag span. */
const FAMILY_ATTR = 'data-bre-endpoint-family'
/**
 * Marks whether the address beside that tag holds anything, so the stylesheet
 * can draw the family's dot solid once it does and hollow while it is still
 * being asked for. Cosmetic only: no behaviour reads it back.
 */
const FILLED_ATTR = 'data-bre-endpoint-filled'
/** Marks the address field whose tag shares a row with the input. */
const ADDRESS_FIELD_ATTR = 'data-bre-endpoint-field'
/** Marks the address field's own title inside that wrapper. */
const ADDRESS_TITLE_ATTR = 'data-bre-endpoint-title'
/** Marks the injected toggle button. */
const TOGGLE_ATTR = 'data-bre-endpoint-toggle'
const COUNT_ATTR = 'data-bre-endpoint-count'
/** Marks a card whose field order was already enforced. */
const ORDERED_ATTR = 'data-bre-field-order'
/** Holds the family the main address field currently serves, on that field. */
const ADDRESS_FAMILY_ATTR = 'data-bre-endpoint-serving'
/** Marks a protocol select whose changes the card already follows. */
const PROTOCOL_WATCH_ATTR = 'data-bre-protocol-watch'
/**
 * The host's own address fields already listened to.
 *
 * Kept out of the DOM on purpose: marking the attribute would be a visible change
 * to a card this plugin otherwise leaves untouched.
 */
const watchedAddresses = new WeakSet<HTMLElement>()
/**
 * The provider route, published by the tab pass on the card row
 * (`src/client/injection/editor-tabs.ts` sets `data-bre-row-provider={route}`).
 * The edit card carries no provider-id field, so this is the only route it has.
 */
const ROW_PROVIDER_ATTR = 'data-bre-row-provider'
/** Marks the plugin-owned group that shows the API protocol as cards. */
const PROTOCOL_CARDS_ATTR = 'data-bre-protocol-cards'
/** Set on one card, holding the select value that card stands for. */
const PROTOCOL_VALUE_ATTR = 'data-bre-protocol-value'
/** Marks the host select the card group drives, and keeps out of sight. */
const PROTOCOL_SOURCE_ATTR = 'data-bre-protocol-source'

/** The first labelled input/select of a card, matched by label stem. */
function controlByLabel(card: HTMLElement, labels: readonly string[]): HTMLElement | undefined {
  for (const label of labels) {
    const hit = Array.from(
      card.querySelectorAll<HTMLElement>('input[aria-label], select[aria-label]'),
    ).find(candidate => (candidate.getAttribute('aria-label') ?? '').startsWith(label))
    if (hit !== undefined) return hit
  }
  return undefined
}

/**
 * The field wrapper of one labelled control: its `<label>` when the official
 * card wraps it, otherwise the control's parent. Used by the per-field
 * decorations, which only need somewhere local to seat their node.
 */
function fieldGroupOf(card: HTMLElement, labels: readonly string[]): HTMLElement | undefined {
  const control = controlByLabel(card, labels)
  if (control === undefined) return undefined
  const label = control.closest('label')
  if (label !== null && label.parentElement !== null) return label as HTMLElement
  return control.parentElement ?? undefined
}

/**
 * The node that represents one control inside a shared container: the ancestor
 * that is a direct child of that container.
 */
function groupWithin(control: HTMLElement, container: HTMLElement): HTMLElement | undefined {
  let at: HTMLElement | null = control
  while (at !== null && at.parentElement !== container) at = at.parentElement
  return at === null || at === container ? undefined : at
}

/** The three field groups, and the container whose children they all are. */
interface FieldGroups {
  readonly container: HTMLElement
  readonly protocol: HTMLElement
  readonly url: HTMLElement
  readonly name: HTMLElement | undefined
}

/**
 * Find the innermost container in which the protocol and base-URL controls are
 * represented by DIFFERENT child nodes. Walking outward from the protocol
 * control guarantees the container is the one holding the field wrappers — the
 * deepest common ancestor of the controls is the document, which would collapse
 * all three fields into one group and reorder nothing.
 */
function fieldGroupsOf(
  nameControl: HTMLElement | undefined,
  protocolControl: HTMLElement,
  urlControl: HTMLElement,
): FieldGroups | undefined {
  for (let container = protocolControl.parentElement; container !== null; container = container.parentElement) {
    if (!container.contains(urlControl)) continue
    if (nameControl !== undefined && !container.contains(nameControl)) continue
    const protocol = groupWithin(protocolControl, container)
    const url = groupWithin(urlControl, container)
    if (protocol === undefined || url === undefined || protocol === url) continue
    const name = nameControl === undefined ? undefined : groupWithin(nameControl, container)
    return { container, protocol, url, name }
  }
  return undefined
}

/** The value of a labelled input/select, trimmed; '' when absent. */
function valueByLabel(card: HTMLElement, labels: readonly string[]): string {
  const control = controlByLabel(card, labels)
  if (control instanceof HTMLSelectElement || control instanceof HTMLInputElement) return control.value.trim()
  return ''
}

/** The protocol the card selects, or undefined when it is not one the plugin knows. */
function protocolOf(card: HTMLElement, labels: EndpointLabels): RouteProtocol | undefined {
  const value = valueByLabel(card, labels.apiProtocol)
  return value === 'anthropic-messages' || value === 'openai-completions' || value === 'openai-responses' || value === 'google-generative-ai'
    ? value
    : undefined
}

/** The family of the protocol the card selects, or undefined while it is unknown. */
function familyOf(card: HTMLElement, labels: EndpointLabels): Family | undefined {
  const protocol = protocolOf(card, labels)
  return protocol === undefined ? undefined : endpointFamilyOf(protocol)
}

/**
 * The route id the card holds.
 *
 * The EDIT card names no route in a field at all — its provider-id field only
 * exists on the create card — so the route is read from the row the editor sits
 * in, which the tab pass and the provider-card slot both publish. Falling back to
 * the create card's own field keeps the other form working.
 */
function routeOf(card: HTMLElement, labels: EndpointLabels): string {
  const typed = valueByLabel(card, labels.routeId)
  if (typed.length > 0) return typed
  const row = card.closest<HTMLElement>(`[${ROW_PROVIDER_ATTR}]`)
  const published = row?.getAttribute(ROW_PROVIDER_ATTR) ?? ''
  return published.trim()
}

/** The family tag copy for one family. */
function familyText(family: Family | undefined, t: EndpointDeps['t']): string {
  if (family === 'anthropic') return t('keysEndpointAnthropic')
  if (family === 'openai') return t('keysEndpointOpenAI')
  if (family === 'gemini') return t('keysEndpointGemini')
  return ''
}

/**
 * Enforce display name → API protocol → base URL on one card.
 *
 * Moves the wrapper NODES rather than setting CSS `order`, so the order holds
 * whatever display the host uses. A card that omits one of them (the add card
 * may not offer a display name at all) still gets the pair it does have in the
 * right order. Idempotent: an already-ordered card costs a few index lookups.
 */
function enforceFieldOrder(card: HTMLElement, labels: EndpointLabels): void {
  const nameControl = controlByLabel(card, labels.modelName)
  const protocolControl = controlByLabel(card, labels.apiProtocol)
  const urlControl = controlByLabel(card, labels.baseUrl)
  if (protocolControl === undefined || urlControl === undefined) return
  // The three fields can be nested (label > span > input), so the nodes to move
  // are whichever ancestors share ONE container. Without such a container the
  // card is left alone rather than having nodes pulled across the tree.
  const groups = fieldGroupsOf(nameControl, protocolControl, urlControl)
  if (groups === undefined) return
  const { container, protocol: protocolGroup, url: urlGroup, name: nameGroup } = groups
  const at = (element: HTMLElement): number => Array.from(container.children).indexOf(element)
  const ordered =
    (nameGroup === undefined || at(nameGroup) < at(protocolGroup)) && at(protocolGroup) < at(urlGroup)
  if (ordered) {
    card.setAttribute(ORDERED_ATTR, '1')
    return
  }
  // Order matters: seat the protocol above the address FIRST, then the display
  // name above the protocol. Doing it the other way round moves the name using
  // the protocol node as the anchor and then moves the protocol away, which
  // lands all three in the wrong order.
  container.insertBefore(protocolGroup, urlGroup)
  if (nameGroup !== undefined) container.insertBefore(nameGroup, protocolGroup)
  card.setAttribute(ORDERED_ATTR, '1')
}

/**
 * The node that renders an address field's TITLE text. The title sits beside the
 * control (the official card: `<span>API 地址</span><input>`), so it is whichever
 * child is neither the control nor this module's family tag. Reading the child
 * that HAS text keeps the walk harmless on wrappers that only hold the input.
 */
function addressTitleOf(urlGroup: HTMLElement, control: HTMLElement): HTMLElement | undefined {
  for (const node of Array.from(urlGroup.children)) {
    if (node === control || node.contains(control)) continue
    if (node.hasAttribute(FAMILY_ATTR)) continue
    // The disclosure link is seated ON the label line, so it must never be
    // mistaken for the label itself.
    if (node.hasAttribute(TOGGLE_ATTR)) continue
    if (!(node instanceof HTMLElement)) continue
    if ((node.textContent ?? '').trim().length > 0) return node
  }
  return undefined
}

/**
 * Mark the address field so the stylesheet can seat the family tag BESIDE the
 * input. The official field stacks title and control in a column flex box, so a
 * tag injected before the control lands on a line of its own above the input —
 * the stylesheet turns a marked wrapper into a two-column grid whose title keeps
 * the full width and whose tag and control share the address row.
 *
 * Marks are removed when there is no tag to place: a grid first column holding
 * only a hidden tag still indents the input by the column gap, which would make
 * a protocol the plugin cannot name look misaligned.
 */
/**
 * Say whether the address this tag names holds a value yet.
 *
 * The row keeps one word ("Anthropic") and the dot beside it carries the state:
 * solid once an address is stored, hollow while the field is still empty. It is
 * rewritten only when it changes, because the scan re-runs this on every pass.
 */
function markFilled(tag: HTMLElement, filled: boolean): void {
  const next = filled ? '1' : '0'
  if (tag.getAttribute(FILLED_ATTR) !== next) tag.setAttribute(FILLED_ATTR, next)
}

function markAddressRow(urlGroup: HTMLElement, control: HTMLElement, tagged: boolean): void {
  const title = addressTitleOf(urlGroup, control)
  if (!tagged) {
    urlGroup.removeAttribute(ADDRESS_FIELD_ATTR)
    title?.removeAttribute(ADDRESS_TITLE_ATTR)
    return
  }
  urlGroup.setAttribute(ADDRESS_FIELD_ATTR, '1')
  title?.setAttribute(ADDRESS_TITLE_ATTR, '1')
}

/**
 * Keep a family tag immediately before the base-URL control, reading the family
 * of the protocol the card currently selects, and lay it out on the input's left.
 */
function decorateAddressLabel(card: HTMLElement, labels: EndpointLabels, t: EndpointDeps['t']): void {
  const control = controlByLabel(card, labels.baseUrl)
  if (control === undefined) return
  const urlGroup = fieldGroupOf(card, labels.baseUrl)
  if (urlGroup === undefined) return
  const text = familyText(familyOf(card, labels), t)
  let tag = urlGroup.querySelector<HTMLElement>(`[${FAMILY_ATTR}]`)
  // A protocol the plugin does not know has no family to name, so no tag is
  // injected at all — an empty span would still be a node the host did not
  // put there, and the card's own label already says "Base URL".
  if (tag === null && text.length > 0) {
    tag = document.createElement('span')
    tag.setAttribute(FAMILY_ATTR, '1')
    tag.className = 'bre-endpoint-family'
    // Inside the label the tag reads as the field's name; inserting before the
    // control keeps it glued to the input either way.
    const label = control.closest('label')
    if (label !== null && label.contains(control)) label.insertBefore(tag, control)
    else urlGroup.insertBefore(tag, control)
  }
  if (tag !== null) {
    if (tag.textContent !== text) tag.textContent = text
    setHidden(tag, text.length === 0)
    markFilled(tag, control instanceof HTMLInputElement && control.value.trim().length > 0)
  }
  markAddressRow(urlGroup, control, tag !== null && text.length > 0)
  // Remember which family this field currently serves: switching the protocol to
  // the other family swaps the two addresses, and this is what says whose value
  // the main field is holding at that moment.
  const family = familyOf(card, labels)
  if (family === undefined) urlGroup.removeAttribute(ADDRESS_FAMILY_ATTR)
  else urlGroup.setAttribute(ADDRESS_FAMILY_ATTR, family)
}

/**
 * Write a value into the host's select and let the host hear about it.
 *
 * The card's fields are controlled by React, which caches the value it last saw
 * on the node itself: assigning `select.value` refreshes that cache, so the
 * `change` that follows looks like no change at all and is dropped. The prototype
 * setter is used on purpose — it writes the DOM value and leaves the cache stale,
 * which is precisely the difference React reacts to.
 */
function writeSelect(select: HTMLSelectElement, value: string): void {
  const setter = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value')?.set
  if (setter === undefined) select.value = value
  else setter.call(select, value)
  select.dispatchEvent(new Event('input', { bubbles: true }))
  select.dispatchEvent(new Event('change', { bubbles: true }))
}

/** Highlight the card that stands for the value the select currently holds. */
function syncProtocolSelection(select: HTMLSelectElement, cards: HTMLElement): void {
  for (const card of Array.from(cards.querySelectorAll<HTMLElement>(`[${PROTOCOL_VALUE_ATTR}]`))) {
    const selected = card.getAttribute(PROTOCOL_VALUE_ATTR) === select.value
    card.classList.toggle('is-selected', selected)
    card.setAttribute('aria-checked', selected ? 'true' : 'false')
    // Roving tabindex: one stop for the whole group, as a radiogroup behaves.
    card.tabIndex = selected ? 0 : -1
  }
}

/** Whether the cards already mirror the select's options exactly. */
function cardsMatch(select: HTMLSelectElement, cards: HTMLElement, deps: EndpointDeps): boolean {
  const rendered = Array.from(cards.querySelectorAll<HTMLElement>(`[${PROTOCOL_VALUE_ATTR}]`))
  const options = Array.from(select.options).filter(option => option.value.length > 0)
  if (rendered.length !== options.length) return false
  return options.every((option, index) => {
    const card = rendered[index]
    return (
      card !== undefined &&
      card.getAttribute(PROTOCOL_VALUE_ATTR) === option.value &&
      // The comparison uses the SHORT name the card renders (see
      // protocolShortText), or every scan would judge the cards stale and
      // rebuild them — the labels are value-keyed, not host-text mirrors.
      (card.textContent ?? '') === protocolShortText(option.value, (option.textContent ?? option.value).trim(), deps.t)
    )
  })
}

/** The Gemini protocol the host select does not offer: its option list predates
 * the plugin's gemini family, and the cards can only offer what the select can
 * carry (协议选择里没有 Gemini). The plugin injects the option — marked, so a
 * re-reconcile re-labels it instead of stacking a second one — and the host
 * saves the select's value like any other. */
const GEMINI_PROTOCOL = 'google-generative-ai'
const GEMINI_OPTION_ATTR = 'data-bre-protocol-option'

/** The short name a protocol's CARD carries. The cards sit four across now
 * that Gemini rides the select, and the host's own labels ("Chat Completions",
 * "Anthropic Messages") are what wrapped the row (协议选项卡换行了) — the card
 * shows the short name and carries the host's full text as its tooltip, so
 * nothing is lost and everything fits. An unknown protocol keeps its own text. */
function protocolShortText(value: string, hostText: string, t: EndpointDeps['t']): string {
  if (value === 'openai-completions') return t('keysProtocolShortChat')
  if (value === 'openai-responses') return t('keysProtocolShortResponses')
  if (value === 'anthropic-messages') return t('keysProtocolShortAnthropic')
  if (value === 'google-generative-ai') return t('keysProtocolGemini')
  return hostText
}

/** Fill the group with one card per selectable option of the select. */
function fillProtocolCards(select: HTMLSelectElement, cards: HTMLElement, deps: EndpointDeps): void {
  cards.replaceChildren()
  for (const option of Array.from(select.options)) {
    const value = option.value
    // The empty value is the host's "nothing chosen" state, not a protocol.
    if (value.length === 0) continue
    const card = document.createElement('button')
    card.type = 'button'
    card.className = 'bre-protocol-card'
    card.setAttribute('role', 'radio')
    card.setAttribute(PROTOCOL_VALUE_ATTR, value)
    // The short name on the card, the host's own text in its tooltip.
    card.textContent = protocolShortText(value, (option.textContent ?? value).trim(), deps.t)
    card.title = (option.textContent ?? value).trim()
    card.addEventListener('click', () => {
      if (select.value === value) return
      writeSelect(select, value)
      // Paint the answer before the host re-renders: a click must feel instant.
      syncProtocolSelection(select, cards)
    })
    cards.appendChild(card)
  }
}

/**
 * Show the API protocol as cards: one per protocol the host offers, the one in
 * force highlighted, so the whole choice is visible at once and the control reads
 * as a picker rather than as a dropdown (user item 1).
 *
 * The host's own `<select>` stays in the DOM and stays the source of truth — the
 * host reads it when saving, this module reads the family from it, and the cards
 * write to it — but it is kept out of sight behind the group.
 */
function decorateProtocolCards(card: HTMLElement, labels: EndpointLabels, deps: EndpointDeps): void {
  const control = controlByLabel(card, labels.apiProtocol)
  if (!(control instanceof HTMLSelectElement)) return
  const group = fieldGroupOf(card, labels.apiProtocol)
  if (group === undefined) return
  // The Gemini option rides the select itself, so the host's own save reads a
  // value it can carry and the cards below need no special casing.
  let gemini = control.querySelector<HTMLOptionElement>(`option[${GEMINI_OPTION_ATTR}]`)
  if (gemini === null) {
    gemini = document.createElement('option')
    gemini.setAttribute(GEMINI_OPTION_ATTR, '1')
    gemini.value = GEMINI_PROTOCOL
    control.appendChild(gemini)
  }
  const geminiText = deps.t('keysProtocolGemini')
  if (gemini.textContent !== geminiText) gemini.textContent = geminiText
  let cards = group.querySelector<HTMLElement>(`[${PROTOCOL_CARDS_ATTR}]`)
  if (cards === null) {
    const fresh = document.createElement('div')
    cards = fresh
    fresh.setAttribute(PROTOCOL_CARDS_ATTR, '1')
    fresh.className = 'bre-protocol-cards'
    fresh.setAttribute('role', 'radiogroup')
    const aria = control.getAttribute('aria-label')
    if (aria !== null) fresh.setAttribute('aria-label', aria)
    control.setAttribute(PROTOCOL_SOURCE_ATTR, '1')
    control.after(fresh)
    fillProtocolCards(control, fresh, deps)
    // Arrow keys walk the group, as a radiogroup is expected to: the roving
    // tabindex leaves only the selected card in the tab order.
    fresh.addEventListener('keydown', event => {
      const step =
        event.key === 'ArrowRight' || event.key === 'ArrowDown'
          ? 1
          : event.key === 'ArrowLeft' || event.key === 'ArrowUp'
            ? -1
            : 0
      const all = Array.from(fresh.querySelectorAll<HTMLElement>(`[${PROTOCOL_VALUE_ATTR}]`))
      if (all.length === 0) return
      if (event.key === 'Home' || event.key === 'End') {
        event.preventDefault()
        const edge = event.key === 'Home' ? all[0] : all[all.length - 1]
        edge?.click()
        edge?.focus()
        return
      }
      if (step === 0) return
      event.preventDefault()
      const current = all.findIndex(entry => entry.classList.contains('is-selected'))
      const next = all[(Math.max(current, 0) + step + all.length) % all.length]
      next?.click()
      next?.focus()
    })
  } else if (!cardsMatch(control, cards, deps)) {
    fillProtocolCards(control, cards, deps)
  }
  // Hidden, never removed: removing the select would take the value the host
  // saves with it. Re-asserted every scan, because a re-render can drop the flag
  // while the group it belongs to survives. Compare-first (setHidden): the
  // Models-page observer watches `hidden` on the whole panel, so a blind
  // re-assert on an already-hidden select records a mutation that re-enters
  // decorate — the feedback loop that hung the page (freeze of 2026-10-26).
  setHidden(control, true)
  syncProtocolSelection(control, cards)
}

/**
 * The folded-address tally now rides the link instead of sitting beside it.
 *
 * It used to be its own span between "API 地址" and "更多端点", so unfolding the
 * rows deleted a text run in the label's inline-flex line and dragged the link
 * sideways by the tally's width. The same sentence is a tooltip on the link now:
 * the line never reflows, and the count stays one hover away.
 */
function syncEndpointTally(
  rows: HTMLElement | null,
  button: HTMLElement,
  deps: EndpointDeps,
): void {
  const count = rows === null ? 0 : rows.querySelectorAll(`[${SECOND_ROW_ATTR}]`).length
  const text = count === 0 ? '' : deps.t('keysEndpointsCount', { count })
  if (text.length === 0) {
    if (button.hasAttribute('title')) button.removeAttribute('title')
    return
  }
  if (button.getAttribute('title') !== text) button.setAttribute('title', text)
}

/**
 * Ensure the "更多端点" toggle rides the API ADDRESS field's own label line, right
 * after the label text (user item 4). The official label is an inline-flex box, so
 * joining its children puts the link on the same line as "API 地址" with the host's
 * own gap between them; the row it opens still appears directly under the field.
 * Clicking it flips the injected second row, which is a plugin node, so its own
 * state is the source of truth for its visibility.
 */
function decorateToggle(card: HTMLElement, labels: EndpointLabels, deps: EndpointDeps): void {
  const existing = card.querySelector<HTMLButtonElement>(`[${TOGGLE_ATTR}]`)
  // A card without a protocol field is not one of these provider cards at all:
  // leave it exactly as it was rather than growing a stray disclosure on it.
  if (fieldGroupOf(card, labels.apiProtocol) === undefined) {
    existing?.remove()
    card.querySelector(`[${COUNT_ATTR}]`)?.remove()
    return
  }
  const urlGroup = fieldGroupOf(card, labels.baseUrl)
  if (urlGroup === undefined) return
  const control = controlByLabel(card, labels.baseUrl)
  if (control === undefined) return
  const title = addressTitleOf(urlGroup, control)
  if (title === undefined || title === existing) return

  // Re-queried on every pass rather than captured once: the host can swap the
  // second row for a fresh node, and a captured handle would then describe rows
  // nobody is looking at (and keep the link's tally pinned to a dead element).
  const rowsOf = (): HTMLElement | null => card.querySelector<HTMLElement>(`[${EXTRA_ROWS_ATTR}]`)

  const rewrite = (button: HTMLButtonElement): void => {
    const label = deps.t('keysMoreEndpoints')
    if (button.textContent !== label) button.textContent = label
    const rows = rowsOf()
    // Kept in step here instead of only on click: a reshaped card can arrive with
    // the old attribute, and a disclosure that lies about its state reads worse
    // than one that simply has no attribute yet.
    button.setAttribute('aria-expanded', rows !== null && !rows.hidden ? 'true' : 'false')
    syncEndpointTally(rows, button, deps)
  }

  if (existing !== null) {
    // A card reshaped by an older build can still hold the link below the field;
    // it is moved up onto the label line it now belongs to.
    if (existing.parentElement !== title) title.append(existing)
    rewrite(existing)
    return
  }
  const button = document.createElement('button')
  button.type = 'button'
  button.setAttribute(TOGGLE_ATTR, '1')
  button.className = 'bre-endpoint-toggle'
  button.textContent = deps.t('keysMoreEndpoints')
  button.addEventListener('click', () => {
    const extra = rowsOf()
    if (extra === null) return
    extra.hidden = !extra.hidden
    rewrite(button)
    // Revealing the rows is the one moment their values must be fresh, and a
    // `hidden` flip fires no childList mutation the scan could ride — read them
    // right here instead of waiting for the throttled scan-driven hydrate.
    if (!extra.hidden) {
      const route = routeOf(card, labels)
      if (route.length > 0) void hydrateRows(extra, route, deps, card, labels)
    }
  })
  title.append(button)
  rewrite(button)
}

/**
 * Per-row ticket, so only the newest hydration pass may write the second address.
 *
 * The stored pair is always read from the host (a cache here went stale and merged
 * one family's URL into the other), but overlapping reads still finish out of order:
 * without a ticket a slow answer can overwrite the value a newer pass just showed.
 */
const hydrateTickets = new WeakMap<HTMLElement, number>()
/**
 * How often a visible second-address row may be re-read by the scan pass.
 *
 * The scan re-runs the decoration constantly (every debounced mutation burst),
 * and each hydrate is a GET on the key route — unthrottled, a settings page
 * left open floods the host with identical reads.
 */
const HYDRATE_MIN_INTERVAL_MS = 1_000
/**
 * When each row was last read, so the scan pass cannot flood the key route.
 * The epoch rides along: a successful write bumps it (see {@link announceEndpoints}),
 * and a row whose last read predates the bump is read again immediately — the
 * post-write repaint must not wait out the interval.
 */
const hydrateReads = new WeakMap<HTMLElement, { at: number; epoch: number }>()
/** Bumped by every endpoints write, invalidating the rows' read stamps. */
let endpointsEpoch = 0
/** Serialize whole-pair read/merge/write operations for each route. */
const endpointUpdates = new Map<string, Promise<unknown>>()

/** Tell every listener the route's addresses just moved. */
function announceEndpoints(route: string, endpoints: { openai: string | null; anthropic: string | null; gemini?: string | null }): void {
  // A write changed what every row of this route shows: the next decoration
  // pass may read past the throttle (see hydrateReads).
  endpointsEpoch += 1
  if (typeof CustomEvent !== 'function') return
  document.dispatchEvent(
    new CustomEvent(ENDPOINTS_CHANGED_EVENT, {
      detail: {
        route,
        openai: endpoints.openai ?? '',
        anthropic: endpoints.anthropic ?? '',
        gemini: endpoints.gemini ?? '',
      },
    }),
  )
}

/** The family one extra row serves, from the attribute that keys it. */
function familyOfRow(row: HTMLElement): Family | undefined {
  const value = row.getAttribute(SECOND_ROW_ATTR)
  return value === 'openai' || value === 'anthropic' || value === 'gemini' ? value : undefined
}

/** Hydrate every extra row of a card, one stored triple per read. */
async function hydrateRows(rows: HTMLElement, route: string, deps: EndpointDeps, card: HTMLElement, labels: EndpointLabels): Promise<void> {
  for (const row of Array.from(rows.querySelectorAll<HTMLElement>(`[${SECOND_ROW_ATTR}]`))) {
    await hydrate(row, route, deps, card, labels)
  }
}

/**
 * Fill one extra row's input from the route's stored endpoints.
 *
 * The row names its family by attribute, but that label can change under a
 * read: a protocol switch re-keys the rows, and writing the old answer under
 * the new label would put an address under the wrong name. The family is
 * therefore re-read after the host answers, and a row whose label moved waits
 * for its own newer pass. The same reason makes a late answer harmful, so only
 * the LATEST pass may write.
 */
async function hydrate(
  row: HTMLElement,
  route: string,
  deps: EndpointDeps,
  card: HTMLElement,
  labels: EndpointLabels,
): Promise<void> {
  const input = row.querySelector<HTMLInputElement>('.bre-endpoint-url')
  const family = familyOfRow(row)
  if (input === null || family === undefined) return
  const ticket = (hydrateTickets.get(row) ?? 0) + 1
  hydrateTickets.set(row, ticket)
  hydrateReads.set(row, { at: Date.now(), epoch: endpointsEpoch })
  const client = deps.client ?? httpKeyManagerClient
  const stored = await readEndpoints(route, client)
  if (stored === undefined) return
  if (hydrateTickets.get(row) !== ticket) return
  if (familyOfRow(row) !== family) return
  // Never clobber what the user is typing.
  if (document.activeElement === input) return
  // Learn what the card's own field shows, so the picker can offer this family.
  await adoptVisibleAddress(card, labels, deps, route, familyOf(card, labels), stored)
  const value = stored[family]
  if (input.value !== value) input.value = value
  const tag = row.querySelector<HTMLElement>(`.bre-endpoint-family`)
  if (tag !== null) markFilled(tag, value.length > 0)
}

/**
 * File the address the card ALREADY shows under the family its protocol names.
 *
 * The key picker offers a family only when the route holds an address for it, and
 * that address lives in the plugin's `endpoints` pair — but the card's own field
 * belongs to the host. A provider set up by typing straight into that field
 * therefore had nothing filed, so its keys were offered no protocol of the very
 * family the provider serves (user report: an Anthropic provider with its address
 * filled offered no Anthropic protocol to pick). Learning what the field shows
 * repairs those routes without retyping anything.
 *
 * Only an EMPTY side is filled. The pair is the plugin's own routing data and may
 * deliberately hold a different URL for the same family, so an address that is
 * already stored is never overwritten here; the second row is how that value is
 * changed.
 * @param card - the provider card.
 * @param labels - the host's resolved label anchors.
 * @param deps - the transport and copy.
 * @param route - the route the card edits.
 * @param family - the family the card's protocol currently names.
 * @param stored - the pair just read from the store.
 * @param overwrite - `true` for an edit the user made in that field (the value IS
 *   the address now, even if one was stored); `false` for the pass that only
 *   repairs a family the store never learned about.
 */
async function adoptVisibleAddress(
  card: HTMLElement,
  labels: EndpointLabels,
  deps: EndpointDeps,
  route: string,
  family: Family | undefined,
  stored: StoredEndpoints,
  overwrite = false,
): Promise<void> {
  if (family === undefined) return
  if (!overwrite && stored[family].length > 0) return
  const control = controlByLabel(card, labels.baseUrl)
  if (!(control instanceof HTMLInputElement)) return
  // Half-typed input is not an address yet.
  if (document.activeElement === control) return
  const visible = control.value.trim()
  if (visible.length === 0 && !overwrite) return
  const client = deps.client ?? httpKeyManagerClient
  await updateEndpoints(route, client, current => {
    if (!overwrite && current[family].length > 0) return undefined
    // Programmatic repaints (a protocol switch) re-dispatch a change carrying the
    // value already stored; writing it again would be a pointless round trip.
    if (current[family] === visible) return undefined
    return {
      openai: family === 'openai' ? visible : current.openai,
      anthropic: family === 'anthropic' ? visible : current.anthropic,
      gemini: family === 'gemini' ? visible : current.gemini,
    }
  })
}

/**
 * The extra address rows: one per family the main field does NOT serve,
 * persisted to the route's `endpoints`. Created collapsed inside one container;
 * the toggle reveals the whole block.
 */
function decorateExtraRows(
  card: HTMLElement,
  labels: EndpointLabels,
  deps: EndpointDeps,
): void {
  const urlGroup = fieldGroupOf(card, labels.baseUrl)
  if (urlGroup === undefined || urlGroup.parentElement === null) return
  const family = familyOf(card, labels)
  // The rows store the families the main address does NOT serve; while the
  // protocol is unknown there is no family to file an address under.
  if (family === undefined) return
  // The rows live INSIDE the address field: that field is the plugin's
  // two-column grid (chip + input), and rows that are grid items of it share
  // its row-gap — every address line then sits the same fixed distance from
  // the last, instead of the field's own outer margin adding a bigger gap
  // above the first extra row (API 地址三个输入框间距不一样).
  let rows = urlGroup.querySelector<HTMLElement>(`:scope > [${EXTRA_ROWS_ATTR}]`)
  if (rows === null) {
    // An older build parked the rows BESIDE the field; re-seat them inside.
    rows = card.querySelector<HTMLElement>(`[${EXTRA_ROWS_ATTR}]`)
    if (rows !== null) urlGroup.appendChild(rows)
  }
  if (rows === null) {
    rows = document.createElement('div')
    rows.setAttribute(EXTRA_ROWS_ATTR, '1')
    rows.hidden = true
    urlGroup.appendChild(rows)
  }
  // One row per family the main address does not serve, in the family order.
  // Append rows ONLY when the seated order differs from the wanted one:
  // appendChild of an already-placed node still fires a childList
  // MutationRecord, and the Models-page observer re-enters decorate from
  // that microtask — an unconditional re-seat here looped the renderer
  // solid (freeze of 2026-10-26). Steady state must be mutation-free.
  const wanted = ENDPOINT_FAMILIES.filter((extra) => extra !== family)
  const seated = Array.from(rows.children).filter(
    (node): node is HTMLElement => node instanceof HTMLElement && node.hasAttribute(SECOND_ROW_ATTR),
  )
  const orderMatches =
    wanted.length === seated.length &&
    wanted.every((extra, index) => familyOfRow(seated[index]) === extra)
  if (!orderMatches) {
    for (const extra of wanted) {
      let row = rows.querySelector<HTMLElement>(`[${SECOND_ROW_ATTR}="${extra}"]`)
      if (row === null) row = createExtraRow(card, labels, deps, extra)
      rows.appendChild(row)
    }
  }
  // A protocol switch changed the extra set; a row that no longer belongs
  // goes. remove() only fires a mutation when the node is actually attached,
  // and a removed row is never re-created here, so this settles after the
  // one corrective pass.
  for (const row of Array.from(rows.querySelectorAll<HTMLElement>(`[${SECOND_ROW_ATTR}]`))) {
    const rowFamily = familyOfRow(row)
    if (rowFamily !== undefined && rowFamily !== family) continue
    row.remove()
  }
  // The link's caret follows the rows it governs (the click handler keeps it in
  // step afterwards), and so does the tally of what is folded away — a protocol
  // switch changes that count, so it is refreshed here as well.
  const toggle = card.querySelector<HTMLElement>(`[${TOGGLE_ATTR}]`)
  if (toggle !== null) {
    toggle.setAttribute('aria-expanded', rows.hidden ? 'false' : 'true')
    syncEndpointTally(rows, toggle, deps)
  }
  const route = routeOf(card, labels)
  if (route.length > 0) {
    // The scan re-runs this decoration constantly (and the hydrate is also the
    // "learn the address the card already shows" repair, which must run while
    // the rows are still hidden), so the read is rate-limited per row instead:
    // once per interval beats once per scan by every measure. A write bumps
    // the epoch and reads past the interval, and the toggle hydrates the
    // moment it reveals the rows (see decorateToggle).
    for (const row of Array.from(rows.querySelectorAll<HTMLElement>(`[${SECOND_ROW_ATTR}]`))) {
      const last = hydrateReads.get(row)
      if (last === undefined || last.epoch !== endpointsEpoch || Date.now() - last.at >= HYDRATE_MIN_INTERVAL_MS) {
        void hydrate(row, route, deps, card, labels)
      }
    }
  }
}

/**
 * One extra address row for one family: the family tag, the input, and the
 * change handler that files the value under the family this ROW names — every
 * other side of the stored set carries over untouched.
 */
function createExtraRow(
  card: HTMLElement,
  labels: EndpointLabels,
  deps: EndpointDeps,
  family: Family,
): HTMLElement {
  const row = document.createElement('div')
  row.setAttribute(SECOND_ROW_ATTR, family)
  row.className = 'bre-endpoint-row'
  const tag = document.createElement('span')
  tag.className = 'bre-endpoint-family'
  tag.textContent = familyText(family, deps.t)
  markFilled(tag, false)
  const input = document.createElement('input')
  input.type = 'url'
  input.className = 'bre-text-input bre-endpoint-url'
  input.spellcheck = false
  input.placeholder = 'https://…'
  const client = deps.client ?? httpKeyManagerClient
  input.addEventListener('change', () => {
    const route = routeOf(card, labels)
    if (route.length === 0) return
    // Captured synchronously: the row repaints itself (and may rewrite the field)
    // as soon as the stored set arrives.
    const value = input.value.trim()
    // The host drops a non-http(s) side silently (normalizeRouteEndpoints);
    // refusing it here keeps the field from showing an address the store
    // never took.
    if (value.length > 0 && !/^https?:\/\//i.test(value)) {
      input.setAttribute('aria-invalid', 'true')
      input.title = deps.t('keysEndpointInvalid')
      return
    }
    if (input.hasAttribute('aria-invalid')) input.removeAttribute('aria-invalid')
    if (input.hasAttribute('title')) input.removeAttribute('title')
    markFilled(tag, value.length > 0)
    void (async () => {
      // The family is re-read after the answer: the row may have been re-keyed
      // while the read was in flight, and filing under the stale one misfiles
      // the URL.
      await updateEndpoints(route, client, stored => {
        const rowFamily = familyOfRow(row)
        if (rowFamily === undefined) return undefined
        // A pinned key signs against ITS family's URL, so the extra address is
        // filed under the family its row names — and every other side is
        // carried over untouched, never blanked.
        return {
          openai: rowFamily === 'openai' ? value : stored.openai,
          anthropic: rowFamily === 'anthropic' ? value : stored.anthropic,
          gemini: rowFamily === 'gemini' ? value : stored.gemini,
        }
      })
    })()
  })
  row.append(tag, input)
  return row
}

/**
 * Swap the address the card presents when the protocol crosses families.
 *
 * The host keeps ONE base URL per route, so the field cannot show several
 * addresses at once: the plugin's `endpoints` set is the only place they all
 * survive. On a crossing the value the field holds is filed under the family
 * being LEFT (only when the user changed it — otherwise the store already has
 * it), and the field then presents the family being ENTERED, blank when that
 * family has no address yet so the user can type the one that protocol needs.
 * The extra rows are outside this swap: each keeps the family it already
 * serves, whatever the main field now presents.
 *
 * Every merge reads the store first. Merging against a cached set is what made
 * an earlier build mirror one URL into both families.
 */
async function swapFamilyAddress(
  card: HTMLElement,
  labels: EndpointLabels,
  deps: EndpointDeps,
  previous: Family,
  next: Family,
): Promise<void> {
  const route = routeOf(card, labels)
  const control = controlByLabel(card, labels.baseUrl)
  if (route.length === 0 || !(control instanceof HTMLInputElement)) return
  const client = deps.client ?? httpKeyManagerClient
  let stored = await readEndpoints(route, client)
  if (stored === undefined) return
  // Another switch landed while this read was in flight: that click's own pass owns
  // the field from here, and filing this now-stale value would misfile it.
  if (familyOf(card, labels) !== next) return
  const leaving = control.value.trim()
  if (leaving.length > 0 && leaving !== stored[previous]) {
    const answer = await updateEndpoints(route, client, current => {
      if (familyOf(card, labels) !== next) return undefined
      return {
        openai: previous === 'openai' ? leaving : current.openai,
        anthropic: previous === 'anthropic' ? leaving : current.anthropic,
        gemini: previous === 'gemini' ? leaving : current.gemini,
      }
    })
    if (answer === undefined) return
    stored = answer
    if (familyOf(card, labels) !== next) return
  }
  const arriving = stored[next]
  if (control.value === arriving) return
  // The host owns this input: write through the prototype setter so its onChange
  // sees a change (a plain assignment only refreshes React's cached value).
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set
  if (setter === undefined) control.value = arriving
  else setter.call(control, arriving)
  control.dispatchEvent(new Event('input', { bubbles: true }))
  control.dispatchEvent(new Event('change', { bubbles: true }))
  // The rows now carry the family just left among their extras, so repaint them
  // from the new state.
  decorateExtraRows(card, labels, deps)
}

/**
 * Store a route's addresses and publish the result.
 *
 * All sides always travel together: a write that carried only the field the
 * user touched would blank the others. Every caller merges with what the store
 * holds first, and this is the single place that records and announces the
 * outcome.
 * @returns the stored set, or undefined when the write was refused.
 */
async function updateEndpoints(
  route: string,
  client: KeyManagerClient,
  merge: (stored: StoredEndpoints) => StoredEndpoints | undefined,
): Promise<StoredEndpoints | undefined> {
  const previous = endpointUpdates.get(route) ?? Promise.resolve()
  const update = previous.then(async () => {
    const stored = await readEndpoints(route, client)
    if (stored === undefined) return undefined
    const next = merge(stored)
    if (next === undefined) return undefined
    const answer = await client.setEndpoints(route, next.openai, next.anthropic, next.gemini)
    if (!answer.ok) return undefined
    const result = {
      openai: answer.endpoints.openai ?? '',
      anthropic: answer.endpoints.anthropic ?? '',
      gemini: answer.endpoints.gemini ?? '',
    }
    announceEndpoints(route, answer.endpoints)
    return result
  })
  endpointUpdates.set(route, update)
  try {
    return await update
  } finally {
    if (endpointUpdates.get(route) === update) endpointUpdates.delete(route)
  }
}

/**
 * The route's stored addresses, straight from the host.
 *
 * No cache: every caller merges one family's URL with the other families', so
 * every other side has to be what the store really holds. A cached set went
 * stale after a write from another card or window and merged one family's URL
 * into BOTH sides, which also made the key picker offer a family whose address
 * was already cleared.
 * @returns the set, or undefined when the read was refused.
 */
async function readEndpoints(
  route: string,
  client: KeyManagerClient,
): Promise<StoredEndpoints | undefined> {
  const answer = await client.list(route)
  if (!answer.ok) return undefined
  return {
    openai: answer.endpoints.openai ?? '',
    anthropic: answer.endpoints.anthropic ?? '',
    gemini: answer.endpoints.gemini ?? '',
  }
}

/**
 * Follow the protocol a card selects: relabel the address block for the family it
 * now names and, when the family changed, move the addresses with it (user: the
 * address below the protocol has to change with the protocol, not on the next
 * tab switch).
 */
function followProtocolFamily(card: HTMLElement, labels: EndpointLabels, deps: EndpointDeps): void {
  const urlGroup = fieldGroupOf(card, labels.baseUrl)
  const next = familyOf(card, labels)
  const previous = urlGroup?.getAttribute(ADDRESS_FAMILY_ATTR)
  // Repaint first: the swap below waits on the host.
  decorateAddressLabel(card, labels, deps.t)
  decorateExtraRows(card, labels, deps)
  if (urlGroup === undefined || previous === undefined || next === undefined) return
  if (previous === next) return
  if (previous !== 'openai' && previous !== 'anthropic' && previous !== 'gemini') return
  void swapFamilyAddress(card, labels, deps, previous, next)
}

/**
 * Reshape one provider card: field order, protocol cards, address label, the
 * 更多端点 toggle and the extra endpoint rows. Safe to call on every scan.
 * @param card - the official card element.
 * @param labels - the host's resolved label anchors.
 * @param deps - the transport and copy.
 */
export function decorateProviderCard(card: HTMLElement, labels: EndpointLabels, deps: EndpointDeps): void {
  enforceFieldOrder(card, labels)
  decorateProtocolCards(card, labels, deps)
  decorateAddressLabel(card, labels, deps.t)
  decorateToggle(card, labels, deps)
  decorateExtraRows(card, labels, deps)
  // The address block follows the protocol as soon as it changes, whoever changed
  // it: our cards dispatch a change on the host's select, and so does the host.
  const select = controlByLabel(card, labels.apiProtocol)
  if (select instanceof HTMLSelectElement && !select.hasAttribute(PROTOCOL_WATCH_ATTR)) {
    select.setAttribute(PROTOCOL_WATCH_ATTR, '1')
    select.addEventListener('change', () => followProtocolFamily(card, labels, deps))
  }
  // The card's own field is the host's, but it is also the address the family its
  // protocol names serves: file an edit of it, replacing what the route held for
  // that family, so keys pinned to that protocol dial the address the card shows
  // (see adoptVisibleAddress).
  const address = controlByLabel(card, labels.baseUrl)
  if (address instanceof HTMLInputElement && !watchedAddresses.has(address)) {
    watchedAddresses.add(address)
    address.addEventListener('change', () => {
      const route = routeOf(card, labels)
      const family = familyOf(card, labels)
      if (route.length === 0 || family === undefined) return
      const client = deps.client ?? httpKeyManagerClient
      void (async () => {
        const stored = await readEndpoints(route, client)
        if (stored === undefined) return
        // A switch may have landed while the read was in flight.
        if (familyOf(card, labels) !== family) return
        await adoptVisibleAddress(card, labels, deps, route, family, stored, true)
      })()
    })
  }
}

/**
 * Hand the protocol selects back to the host (called on teardown): a hidden select
 * is this module's doing, so it must not outlive the module.
 */
export function forgetEndpointCache(): void {
  for (const select of Array.from(document.querySelectorAll<HTMLSelectElement>(`select[${PROTOCOL_SOURCE_ATTR}]`))) {
    select.hidden = false
    select.removeAttribute(PROTOCOL_SOURCE_ATTR)
  }
}

/**
 * Hand the provider cards back to the host entirely (called on teardown): every
 * node and attribute this module injected — the hidden protocol selects, the
 * protocol card groups, the family tags, the 更多端点 toggle and the extra
 * address rows — comes out, so a disabled plugin leaves the official card
 * exactly as the page built it.
 */
export function teardownProviderEndpoints(): void {
  forgetEndpointCache()
  for (const node of Array.from(document.querySelectorAll<HTMLElement>(
    `[${EXTRA_ROWS_ATTR}], [${SECOND_ROW_ATTR}], [${TOGGLE_ATTR}], [${COUNT_ATTR}], [${PROTOCOL_CARDS_ATTR}], [${FAMILY_ATTR}]`,
  ))) {
    node.remove()
  }
  for (const marked of Array.from(document.querySelectorAll<HTMLElement>(
    `[${ORDERED_ATTR}], [${ADDRESS_FIELD_ATTR}], [${ADDRESS_TITLE_ATTR}], [${ADDRESS_FAMILY_ATTR}]`,
  ))) {
    marked.removeAttribute(ORDERED_ATTR)
    marked.removeAttribute(ADDRESS_FIELD_ATTR)
    marked.removeAttribute(ADDRESS_TITLE_ATTR)
    marked.removeAttribute(ADDRESS_FAMILY_ATTR)
  }
}
