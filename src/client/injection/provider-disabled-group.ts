/**
 * The folded group of switched-off providers on the official Models page.
 *
 * A switched-off provider is not deleted: its row is the only place it can be
 * switched back on, and its configuration is still the user's. It does not
 * belong in the list the user reads either — a page whose built-in providers all
 * stay in the way makes the two or three real ones hard to find. So the rows of
 * the switched-off providers fold away behind one control at the end of the
 * list, and that control says how many are folded and unfolds them again.
 *
 * Unfolding does not scatter them back among the providers that are on: the
 * folded rows are ORDERED behind the control, so the group reads as one group
 * under its own control. The order comes from the plugin's stylesheet
 * (`.bre-row-folded`, `.bre-provider-disabled-seat`), where `!important` outranks
 * the inline orders the drag passes write — this module therefore never has to
 * fight them for the attribute, and the rows are never moved or rebuilt: their
 * DOM slot, which the drag passes read back out of the DOM, stays exactly where
 * the host put them.
 *
 * The only node this module inserts is its own control, as the list's last item:
 * a control outside the list could not head rows inside it, and the list is a
 * flex column the host itself lays out. Both the class writes and the insertion
 * are guarded on the state they would produce: a scan that changes nothing
 * writes nothing, because every write here would otherwise feed the observer
 * that scheduled the scan.
 *
 * The folded state is per session and deliberately not stored. The point of the
 * group is that the switched-off providers are out of the way, and a reload
 * showing them folded again is the behaviour that was asked for.
 *
 * @module dsh-model-think-level/client/injection/provider-disabled-group
 */

import { isProviderEnabled } from '../provider-enabled.js'
import type { HostLabels } from './models-page-editor.js'
import { providerIdOfRow, rowsListOf } from './provider-order-drag.js'

/** Marks the group's own seat, and nothing else on the page. */
const GROUP_ATTR = 'data-bre-provider-disabled-group'

/** The seat itself: the list item this module owns, and the group's header. */
const SEAT_CLASS = 'bre-provider-disabled-seat'

/** The button inside the seat — what the user clicks, and what carries the label. */
const CONTROL_CLASS = 'bre-provider-disabled-group'

/** Set on every switched-off provider's row, open or closed: the tail it is ordered into. */
const FOLDED_CLASS = 'bre-row-folded'

/** Set on a switched-off provider's row while the group is closed. */
const HIDDEN_CLASS = 'bre-row-hidden'

/** Per-scan bookkeeping (one instance lives in `models-page.ts`). */
export interface ProviderDisabledGroupState {
  /** Whether the folded rows are currently unfolded. */
  expanded: boolean
}

export interface ProviderDisabledGroupDeps {
  /** The plugin's own translator, for the control's label and tooltip. */
  t: (key: string, params?: Record<string, string | number>) => string
  /** The official `settings.models` label sets, resolved fresh on every scan. */
  labels: () => HostLabels
}

/** One provider row, named, with the store's answer for it. */
interface NamedRow {
  row: HTMLElement
  id: string
  enabled: boolean
}

export function createProviderDisabledGroupState(): ProviderDisabledGroupState {
  // Folded on the first scan, which is the state the group exists for.
  return { expanded: false }
}

/**
 * Fold the switched-off providers away — or put them back when the control says
 * so — and keep the control's own label, count and position in step.
 *
 * Idempotent: a row already folded stays folded, and the control is only ever
 * written when a value genuinely changed, so a scan never mutates the page on
 * behalf of a state that is already on it.
 * @param list - the provider list already resolved by the caller's scan (see
 *   `reconcileProviderOrder`); re-deriving it here costs a document-wide walk
 *   per pass, and one burst runs several passes.
 */
export function reconcileProviderDisabledGroup(
  root: HTMLElement,
  deps: ProviderDisabledGroupDeps,
  state: ProviderDisabledGroupState,
  list: HTMLElement | undefined = rowsListOf(root),
): void {
  if (!root.isConnected || list === undefined) return
  const rows = namedRows(list, deps.labels())
  const folded = rows.filter(entry => !entry.enabled).length
  const seat = groupSeatOf(list)
  if (folded === 0) {
    // Nothing is folded and nothing has to say so. Removal is guarded too: an
    // empty page must not lose a child on every scan.
    if (seat !== undefined) seat.remove()
    foldRows(rows, state)
    return
  }
  const control = seat ?? createSeat(list, deps, state)
  // `createSeat` appends at this same seat; the guard covers the host (or a drag
  // pass) having put its own node behind it since. The seat is the list's LAST
  // item, because the rows it heads are ordered behind it: a seat anywhere else
  // would head a group that screens above it.
  if (control.parentElement !== list || list.lastElementChild !== control) list.append(control)
  foldRows(rows, state)
  const button = controlOf(control)
  if (button !== undefined) labelControl(button, folded, deps, state)
}

/** Remove the control and unfold every row it hid. */
export function teardownProviderDisabledGroup(): void {
  for (const seat of Array.from(document.querySelectorAll<HTMLElement>(`[${GROUP_ATTR}]`))) {
    seat.remove()
  }
  // Both classes, or a dead fiber leaves rows neither ordered nor hidden —
  // stranded at the tail of a list with nothing left to explain them.
  for (const row of Array.from(document.querySelectorAll<HTMLElement>(`.${HIDDEN_CLASS}, .${FOLDED_CLASS}`))) {
    row.classList.remove(HIDDEN_CLASS, FOLDED_CLASS)
  }
}

/** The list's rows that name their provider, with the store's answer for each. */
function namedRows(list: HTMLElement, labels: HostLabels): NamedRow[] {
  const rows: NamedRow[] = []
  for (const child of Array.from(list.children)) {
    if (!(child instanceof HTMLElement)) continue
    // The seat is a list item of its own. It names no provider, so it must never
    // be probed as if it were a row — and it is skipped by its mark rather than
    // by its shape, which is this module's own to know.
    if (child.getAttribute(GROUP_ATTR) !== null) continue
    // A row this module cannot name is left alone: folding an unknown card would
    // hide a provider the user never chose.
    const id = providerIdOfRow(child, labels)
    if (id === undefined) continue
    rows.push({ row: child, id, enabled: isProviderEnabled(id) })
  }
  return rows
}

/** Fold the switched-off rows away, or put them back when the group is open. */
function foldRows(rows: readonly NamedRow[], state: ProviderDisabledGroupState): void {
  for (const entry of rows) {
    const switchedOff = !entry.enabled
    // `toggle` with a force argument writes only on a real change, which is what
    // keeps a scan from feeding the observer that scheduled it.
    //
    // Two classes: the tail order belongs to every switched-off row whether the
    // group is open or closed — that is what keeps the unfolded group under its
    // control instead of in the slots the rows happened to have — while the
    // hiding belongs only to the closed group.
    entry.row.classList.toggle(FOLDED_CLASS, switchedOff)
    entry.row.classList.toggle(HIDDEN_CLASS, switchedOff && !state.expanded)
  }
}

/**
 * The seat this module owns on this list: the list item carrying the group's
 * control, found among the list's OWN children so a second list would keep its
 * own control instead of sharing one.
 */
function groupSeatOf(list: HTMLElement): HTMLElement | undefined {
  for (const child of Array.from(list.children)) {
    if (child instanceof HTMLElement && child.getAttribute(GROUP_ATTR) !== null) return child
  }
  return undefined
}

/** The seat's own button: what carries the label and what the user clicks. */
function controlOf(seat: HTMLElement): HTMLElement | undefined {
  return seat.querySelector<HTMLElement>(`button.${CONTROL_CLASS}`) ?? undefined
}

/**
 * The seat and its control: the list's last item, heading the rows the
 * stylesheet orders behind it. It stays in the document once it exists — a scan
 * removes it only when no provider is switched off any more.
 */
function createSeat(
  list: HTMLElement,
  deps: ProviderDisabledGroupDeps,
  state: ProviderDisabledGroupState,
): HTMLElement {
  const seat = document.createElement('li')
  seat.className = SEAT_CLASS
  seat.setAttribute(GROUP_ATTR, '')
  const control = document.createElement('button')
  control.className = CONTROL_CLASS
  control.setAttribute('type', 'button')
  control.addEventListener('click', (event: MouseEvent) => {
    // A row opens the editor on click and drags by its header: neither may read
    // this click as its own.
    event.preventDefault()
    event.stopPropagation()
    state.expanded = !state.expanded
    // Paint it now — see the module note: the scan that would have done this is
    // 120ms away, and a group whose rows only appear a beat later reads as a
    // missed click.
    repaint(list, deps, state)
  })
  seat.appendChild(control)
  list.append(seat)
  return seat
}

/** Repaint the folded rows and the control from the stores, right now. */
function repaint(
  list: HTMLElement,
  deps: ProviderDisabledGroupDeps,
  state: ProviderDisabledGroupState,
): void {
  const rows = namedRows(list, deps.labels())
  foldRows(rows, state)
  const seat = groupSeatOf(list)
  if (seat === undefined) return
  const folded = rows.filter(entry => !entry.enabled).length
  if (folded === 0) {
    seat.remove()
    return
  }
  const control = controlOf(seat)
  if (control === undefined) return
  labelControl(control, folded, deps, state)
}

/** Say how many providers are folded, and which way the control moves them. */
function labelControl(
  control: HTMLElement,
  folded: number,
  deps: ProviderDisabledGroupDeps,
  state: ProviderDisabledGroupState,
): void {
  const label = deps.t(
    state.expanded ? 'providerDisabledGroupHide' : 'providerDisabledGroupShow',
    { count: folded },
  )
  const hint = deps.t('providerDisabledGroupHint')
  const expanded = state.expanded ? 'true' : 'false'
  if (control.textContent !== label) control.textContent = label
  if (control.getAttribute('aria-expanded') !== expanded) control.setAttribute('aria-expanded', expanded)
  if (control.getAttribute('aria-label') !== label) control.setAttribute('aria-label', label)
  if (control.getAttribute('title') !== hint) control.setAttribute('title', hint)
}
