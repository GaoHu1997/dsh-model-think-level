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
 *   - **the address is labelled by protocol family.** The official base-URL
 *     input is prefixed with "OpenAI"/"Anthropic" according to the protocol the
 *     card currently selects, so it is obvious which wire that URL serves.
 *   - **a second endpoint can be added.** A grey "更多端点" text button beside the
 *     API-protocol label reveals one more address row holding the OTHER family's
 *     URL. It persists to the route's `endpoints` in this plugin's key index,
 *     which is what a key pinned to that family signs against.
 *
 * The add card carries the same three fields, so the same decoration applies to
 * it — "添加供应商" is not left behind (user item 6).
 *
 * @module dsh-model-think-level/client/injection/provider-endpoints
 */

import { endpointFamilyOf, type RouteProtocol } from '../../key-refs.js'
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

/** The endpoint family a route stores one base URL per. */
type Family = 'openai' | 'anthropic'

/** Marks the injected second row. */
const SECOND_ROW_ATTR = 'data-bre-endpoint-row'
/** Marks the family tag span. */
const FAMILY_ATTR = 'data-bre-endpoint-family'
/** Marks the injected toggle button. */
const TOGGLE_ATTR = 'data-bre-endpoint-toggle'
/** Marks a card whose field order was already enforced. */
const ORDERED_ATTR = 'data-bre-field-order'

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
  return value === 'anthropic-messages' || value === 'openai-completions' || value === 'openai-responses'
    ? value
    : undefined
}

/** The family of the protocol the card selects, or undefined while it is unknown. */
function familyOf(card: HTMLElement, labels: EndpointLabels): Family | undefined {
  const protocol = protocolOf(card, labels)
  return protocol === undefined ? undefined : endpointFamilyOf(protocol)
}

/** The route id the card holds, or '' while it is still unnamed. */
function routeOf(card: HTMLElement, labels: EndpointLabels): string {
  return valueByLabel(card, labels.routeId)
}

/** The family tag copy for one family. */
function familyText(family: Family | undefined, t: EndpointDeps['t']): string {
  if (family === 'anthropic') return t('keysEndpointAnthropic')
  if (family === 'openai') return t('keysEndpointOpenAI')
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
 * Keep a family tag immediately before the base-URL control, reading the family
 * of the protocol the card currently selects.
 */
function decorateAddressLabel(card: HTMLElement, labels: EndpointLabels, t: EndpointDeps['t']): void {
  const control = controlByLabel(card, labels.baseUrl)
  if (control === undefined) return
  const urlGroup = fieldGroupOf(card, labels.baseUrl)
  if (urlGroup === undefined) return
  const text = familyText(familyOf(card, labels), t)
  let tag = urlGroup.querySelector<HTMLElement>(`[${FAMILY_ATTR}]`)
  if (tag === null) {
    // A protocol the plugin does not know has no family to name, so no tag is
    // injected at all — an empty span would still be a node the host did not
    // put there, and the card's own label already says "Base URL".
    if (text.length === 0) return
    tag = document.createElement('span')
    tag.setAttribute(FAMILY_ATTR, '1')
    tag.className = 'bre-endpoint-family'
    // Inside the label the tag reads as the field's name; inserting before the
    // control keeps it glued to the input either way.
    const label = control.closest('label')
    if (label !== null && label.contains(control)) label.insertBefore(tag, control)
    else urlGroup.insertBefore(tag, control)
  }
  if (tag.textContent !== text) tag.textContent = text
  tag.hidden = text.length === 0
}

/**
 * Ensure the "更多端点" toggle sits beside the API-protocol label. Clicking it
 * flips the injected second row: the row is a plugin node, so its own state is
 * the source of truth for its visibility.
 */
function decorateToggle(card: HTMLElement, labels: EndpointLabels, t: EndpointDeps['t']): void {
  const protocolGroup = fieldGroupOf(card, labels.apiProtocol)
  if (protocolGroup === undefined) return
  const existing = protocolGroup.querySelector<HTMLButtonElement>(`[${TOGGLE_ATTR}]`)
  if (existing !== null) {
    if (existing.textContent !== t('keysMoreEndpoints')) existing.textContent = t('keysMoreEndpoints')
    return
  }
  const button = document.createElement('button')
  button.type = 'button'
  button.setAttribute(TOGGLE_ATTR, '1')
  button.className = 'bre-endpoint-toggle'
  button.textContent = t('keysMoreEndpoints')
  button.addEventListener('click', () => {
    const row = card.querySelector<HTMLElement>(`[${SECOND_ROW_ATTR}]`)
    if (row === null) return
    row.hidden = !row.hidden
  })
  protocolGroup.appendChild(button)
}

/** Per-route cache of the stored endpoints, so a scan does not re-read them. */
const endpointCache = new Map<string, { openai: string; anthropic: string }>()

/** Fill the second row's input from the route's stored endpoints. */
async function hydrate(row: HTMLElement, route: string, deps: EndpointDeps, other: Family): Promise<void> {
  const input = row.querySelector<HTMLInputElement>('.bre-endpoint-url')
  if (input === null) return
  let stored = endpointCache.get(route)
  if (stored === undefined) {
    const client = deps.client ?? httpKeyManagerClient
    const answer = await client.list(route)
    if (!answer.ok) return
    stored = { openai: answer.endpoints.openai ?? '', anthropic: answer.endpoints.anthropic ?? '' }
    endpointCache.set(route, stored)
  }
  // Never clobber what the user is typing.
  if (document.activeElement === input) return
  const value = stored[other]
  if (input.value !== value) input.value = value
}

/**
 * The second address row: the OTHER family's base URL, persisted to the route's
 * `endpoints`. Created collapsed; the toggle reveals it.
 */
function decorateSecondRow(
  card: HTMLElement,
  labels: EndpointLabels,
  deps: EndpointDeps,
): void {
  const urlGroup = fieldGroupOf(card, labels.baseUrl)
  if (urlGroup === undefined || urlGroup.parentElement === null) return
  const family = familyOf(card, labels)
  // The row stores the family the main address does NOT serve; while the
  // protocol is unknown there is no "other" side to offer.
  const other: Family | undefined = family === 'anthropic' ? 'openai' : family === 'openai' ? 'anthropic' : undefined
  if (other === undefined) return
  let row = card.querySelector<HTMLElement>(`[${SECOND_ROW_ATTR}]`)
  if (row === null) {
    row = document.createElement('div')
    row.setAttribute(SECOND_ROW_ATTR, '1')
    row.className = 'bre-endpoint-row'
    row.hidden = true
    const tag = document.createElement('span')
    tag.className = 'bre-endpoint-family'
    const input = document.createElement('input')
    input.type = 'url'
    input.className = 'bre-text-input bre-endpoint-url'
    input.spellcheck = false
    input.placeholder = 'https://…'
    const client = deps.client ?? httpKeyManagerClient
    input.addEventListener('change', () => {
      const route = routeOf(card, labels)
      const familyNow = familyOf(card, labels)
      if (route.length === 0 || familyNow === undefined) return
      const value = input.value.trim()
      // A pinned key signs against ITS family's URL, so the second address is
      // filed under the family the main address does not already serve.
      const openai = familyNow === 'anthropic' ? value : ''
      const anthropic = familyNow === 'openai' ? value : ''
      void client.setEndpoints(route, openai, anthropic).then(answer => {
        if (answer.ok) endpointCache.set(route, { openai: answer.endpoints.openai ?? '', anthropic: answer.endpoints.anthropic ?? '' })
      })
    })
    row.append(tag, input)
    urlGroup.parentElement.insertBefore(row, urlGroup.nextSibling)
  }
  const tag = row.querySelector<HTMLElement>('.bre-endpoint-family')
  const text = familyText(other, deps.t)
  if (tag !== null && tag.textContent !== text) tag.textContent = text
  const route = routeOf(card, labels)
  if (route.length > 0) void hydrate(row, route, deps, other)
}

/**
 * Reshape one provider card: field order, address label, 更多端点 toggle and the
 * second endpoint row. Safe to call on every scan.
 * @param card - the official card element.
 * @param labels - the host's resolved label anchors.
 * @param deps - the transport and copy.
 */
export function decorateProviderCard(card: HTMLElement, labels: EndpointLabels, deps: EndpointDeps): void {
  enforceFieldOrder(card, labels)
  decorateAddressLabel(card, labels, deps.t)
  decorateToggle(card, labels, deps.t)
  decorateSecondRow(card, labels, deps)
}

/** Drop the per-route endpoint cache (called on teardown). */
export function forgetEndpointCache(): void {
  endpointCache.clear()
}
