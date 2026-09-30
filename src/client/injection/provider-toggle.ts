/**
 * Per-provider enable switch for the official Models settings page.
 *
 * A provider that is switched off stays listed — that is the only place it can
 * be switched back on — but leaves the composer's provider column, which reads
 * the same store (`../provider-enabled.js`). The stored value is the set of
 * DISABLED ids, so an unknown or newly added route is enabled by default.
 *
 * The switch is a `role="switch"` button appended to the row's action group (or
 * to the header when the official row has no action group), which leaves the
 * header's own flex layout — identity on one side, actions on the other — with
 * the same children it had. `role="switch"` is already in the drag module's list
 * of controls that own their gesture, so a drag started on the switch is refused
 * and the click can only mean "toggle".
 *
 * Nothing here waits for the next scan to look right: the debounced scan is
 * 120ms away, and a switch whose knob only moves a beat later reads as a missed
 * click — so the click paints the new state itself.
 *
 * @module dsh-model-think-level/client/injection/provider-toggle
 */

import { isProviderEnabled, setProviderEnabled } from '../provider-enabled.js'
import type { HostLabels } from './models-page-editor.js'
import { providerIdOfRow, rowHeadOf, rowNameOf, rowsListOf } from './provider-order-drag.js'

/** Marks the switch, and carries the provider id it governs. */
const SWITCH_ATTR = 'data-bre-provider-switch'

/** Set on a row whose provider is switched off. */
const OFF_CLASS = 'bre-row-disabled'

/** Per-scan bookkeeping (one instance lives in `models-page.ts`). */
export interface ProviderToggleState {
  /** Switches that already carry their click listener. */
  readonly switches: WeakSet<Element>
}

export interface ProviderToggleDeps {
  /** The plugin's own translator, for the switch's label and tooltip. */
  t: (key: string, params?: Record<string, string | number>) => string
  /** The official `settings.models` label sets, resolved fresh on every scan. */
  labels: () => HostLabels
}

export function createProviderToggleState(): ProviderToggleState {
  return { switches: new WeakSet() }
}

/**
 * Visit every provider row and make sure it shows a switch carrying its own
 * state. Idempotent: a row that already has one is only relabelled, which is
 * also how a language switch and an external toggle reach the page.
 */
export function reconcileProviderEnabled(
  root: HTMLElement,
  deps: ProviderToggleDeps,
  state: ProviderToggleState,
): void {
  if (!root.isConnected) return
  const list = rowsListOf(root)
  if (list === undefined) return
  const labels = deps.labels()
  for (const child of Array.from(list.children)) {
    if (!(child instanceof HTMLElement)) continue
    // A row we cannot name (an unexpected card shape) is left alone: switching
    // off an unknown id would hide a provider the user never chose.
    const id = providerIdOfRow(child, labels)
    if (id === undefined) continue
    const head = rowHeadOf(child)
    if (head === undefined) continue
    ensureSwitch(child, head, id, deps, state)
    child.classList.toggle(OFF_CLASS, !isProviderEnabled(id))
  }
}

/** Remove every switch and every dimmed row. */
export function teardownProviderEnabled(): void {
  for (const switchButton of Array.from(document.querySelectorAll<HTMLElement>(`[${SWITCH_ATTR}]`))) {
    switchButton.remove()
  }
  for (const row of Array.from(document.querySelectorAll<HTMLElement>(`.${OFF_CLASS}`))) {
    row.classList.remove(OFF_CLASS)
  }
}

function ensureSwitch(
  row: HTMLElement,
  head: HTMLElement,
  id: string,
  deps: ProviderToggleDeps,
  state: ProviderToggleState,
): void {
  const existing = head.querySelector<HTMLElement>(`[${SWITCH_ATTR}]`)
  if (existing !== null) {
    syncSwitch(existing, row, id, deps)
    return
  }
  const control = document.createElement('button')
  control.className = 'bre-provider-switch'
  control.setAttribute('type', 'button')
  control.setAttribute('role', 'switch')
  control.setAttribute(SWITCH_ATTR, id)
  syncSwitch(control, row, id, deps)
  wireSwitch(control, row, state)
  const actions = head.querySelector<HTMLElement>('[class*="rowActions"]')
  // The action group is `margin-left: auto` and holds the card's own buttons:
  // the switch goes in FRONT of them, so the destructive control stays last and
  // the header keeps the children it had. Without a group the header itself
  // takes it, which is the same seat the grip uses.
  if (actions === null) head.appendChild(control)
  else actions.insertBefore(control, actions.firstChild)
}

/** Make the button agree with the store: its name, its tooltip, its state. */
function syncSwitch(
  control: HTMLElement,
  row: HTMLElement,
  id: string,
  deps: ProviderToggleDeps,
): void {
  const label = deps.t('providerToggleAria', { provider: rowNameOf(row) ?? id })
  const hint = deps.t('providerToggleHint')
  const checked = isProviderEnabled(id) ? 'true' : 'false'
  if (control.getAttribute(SWITCH_ATTR) !== id) control.setAttribute(SWITCH_ATTR, id)
  if (control.getAttribute('aria-checked') !== checked) control.setAttribute('aria-checked', checked)
  if (control.getAttribute('aria-label') !== label) control.setAttribute('aria-label', label)
  if (control.getAttribute('title') !== hint) control.setAttribute('title', hint)
}

function wireSwitch(control: HTMLElement, row: HTMLElement, state: ProviderToggleState): void {
  if (state.switches.has(control)) return
  state.switches.add(control)
  control.addEventListener('click', (event: MouseEvent) => {
    // The row is itself a button on the official page (it opens the editor) and
    // the header drags: neither may read this click as its own.
    event.preventDefault()
    event.stopPropagation()
    const id = control.getAttribute(SWITCH_ATTR)
    if (id === null) return
    const next = !isProviderEnabled(id)
    setProviderEnabled(id, next)
    // Paint it now — see the module note: the scan that would have done this is
    // debounced, and the switch must feel like a switch.
    control.setAttribute('aria-checked', next ? 'true' : 'false')
    row.classList.toggle(OFF_CLASS, !next)
  })
}
