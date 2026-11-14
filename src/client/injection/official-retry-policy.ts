/**
 * UI-only adapter for the official provider RetryPolicyEditor. No settings,
 * values, events, or runtime retry behavior are changed.
 *
 * Compatibility boundary: inspected dsh-client-ui-settings-models 0.2.2-rc.3.
 * Its public slots expose provider-card extensions, not field visibility, so
 * this adapter uses the existing Models-page CSS-module stem convention plus
 * RetryPolicyEditor's specific failure-id/ARIA and mode-select structure.
 * This is a DOM coupling, not a public API: unfamiliar forms are left alone.
 */

const RETRY_HIDDEN_ATTR = 'data-bre-retry-policy-hidden'
const RETRY_GROUP_SELECTOR = 'div[class*="field"][role="group"][aria-labelledby$="-retry-failure-label"]'
const FOREIGN_ROOT = '[data-plugin], .bre-headers-host, .bre-create-host, .bre-config-host, .bre-effort-slot'

interface DisplaySnapshot {
  value: string
  priority: string
}

export interface OfficialRetryPolicyState {
  /** Strong references also allow restoration of detached/reused host nodes. */
  readonly hidden: Map<HTMLElement, DisplaySnapshot>
}

export function createOfficialRetryPolicyState(): OfficialRetryPolicyState {
  return { hidden: new Map() }
}

/** Match the full official form/field structure, never translated text. */
export function isOfficialRetryPolicyGroup(group: HTMLElement): boolean {
  if (!group.matches(RETRY_GROUP_SELECTOR) || group.closest(FOREIGN_ROOT) !== null) return false
  const body = group.parentElement
  const fold = body?.parentElement
  const editor = fold?.parentElement
  if (body === null || body === undefined || !body.matches('div[class*="customizedBody"]')
    || fold === null || fold === undefined || !fold.matches('details[class*="customized"]')
    || editor === null || editor === undefined || !editor.matches('div[class*="editor"]')
    || editor.closest('[class*="rowCard"], [class*="addCard"]') === null) return false
  const labelId = group.getAttribute('aria-labelledby') ?? ''
  if (labelId.length <= '-retry-failure-label'.length) return false
  const label = Array.from(group.children).find(child =>
    child.matches('span[class*="fieldLabel"]') && child.id === labelId)
  const select = Array.from(group.children).find((child): child is HTMLSelectElement =>
    child instanceof HTMLSelectElement && child.matches('[class*="input"][class*="selectInput"]')
      && child.getAttribute('aria-labelledby') === labelId)
  if (label === undefined || select === undefined) return false
  const values = Array.from(select.options, option => option.value)
  return values.length === 3 && new Set(values).size === 3
    && values.includes('') && values.includes('normal') && values.includes('always')
}

function ownsDisplay(group: HTMLElement): boolean {
  return group.style.getPropertyValue('display') === 'none'
    && group.style.getPropertyPriority('display') === 'important'
}

function hide(group: HTMLElement, state: OfficialRetryPolicyState): void {
  const previous = state.hidden.get(group)
  if (previous !== undefined && ownsDisplay(group)) return
  // Host-owned inline hiding is already sufficient and must survive teardown.
  if (previous === undefined && group.style.display === 'none') return
  // If a host rerender changed display, remember its latest value before hiding.
  state.hidden.set(group, {
    value: group.style.getPropertyValue('display'),
    priority: group.style.getPropertyPriority('display'),
  })
  group.setAttribute(RETRY_HIDDEN_ATTR, '1')
  group.style.setProperty('display', 'none', 'important')
}

function restore(group: HTMLElement, state: OfficialRetryPolicyState): void {
  const previous = state.hidden.get(group)
  state.hidden.delete(group)
  group.removeAttribute(RETRY_HIDDEN_ATTR)
  // Respect subsequent host writes rather than overwriting them on unload.
  if (previous !== undefined && ownsDisplay(group)) {
    if (previous.value === '') group.style.removeProperty('display')
    else group.style.setProperty('display', previous.value, previous.priority)
  }
}

/** Hide all mounted official forms, including both halves of an add card. */
export function reconcileOfficialRetryPolicy(root: HTMLElement, state: OfficialRetryPolicyState): void {
  const eligible = new Set<HTMLElement>()
  for (const group of Array.from(root.querySelectorAll<HTMLElement>(RETRY_GROUP_SELECTOR))) {
    if (!isOfficialRetryPolicyGroup(group)) continue
    eligible.add(group)
    hide(group, state)
  }
  for (const group of Array.from(state.hidden.keys())) {
    if (!eligible.has(group)) restore(group, state)
  }
}

/** Restore the exact prior inline display, also for detached nodes. */
export function teardownOfficialRetryPolicy(state: OfficialRetryPolicyState): void {
  for (const group of Array.from(state.hidden.keys())) restore(group, state)
}

export const OFFICIAL_RETRY_POLICY_HIDDEN_ATTR = RETRY_HIDDEN_ATTR
