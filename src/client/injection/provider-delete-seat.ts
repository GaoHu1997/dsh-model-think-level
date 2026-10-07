/**
 * The reserved delete seat on a provider row of the official Models page.
 *
 * The official row renders its destructive button only for a provider the host
 * still considers removable (`row.removable`); a built-in provider such as
 * deepseek renders nothing there at all. The action group is `margin-left: auto`,
 * so the rows that keep the button are wider than the rows that do not and the
 * whole column of buttons lines up raggedly against the card's right edge.
 *
 * The seat is therefore kept warm: a row the host left without a delete button
 * gets a disabled one of the same metrics, which is enough for every row's
 * actions to start at the same place. It is `disabled`, so it takes no click,
 * no focus and no keyboard activation — the button is the alignment, not an
 * action — and it still owns its gesture as far as the drag engine is concerned,
 * because that engine refuses a drag beginning on any `button`.
 *
 * Its word is the host's own: the label is read off a delete button the page
 * still renders, so the odd row out is not the one row written in another
 * language. A page that renders none at all (every provider built in) falls back
 * to this plugin's dictionary.
 *
 * @module dsh-model-think-level/client/injection/provider-delete-seat
 */

import type { HostLabels } from './models-page-editor.js'
import { providerIdOfRow, rowHeadOf, rowNameOf, rowsListOf } from './provider-order-drag.js'

/** Marks the seat, and carries the provider id it stands for. */
const SEAT_ATTR = 'data-bre-provider-delete'

/** The row's action group, probed by class-name fragment (a CSS-module hash). */
const ACTIONS_PROBE = '[class*="rowActions"]'

/** The host's own destructive control, probed the same way. */
const OFFICIAL_DELETE_PROBE = '[class*="dangerButton"]'

/** The seat's class: the metrics it borrows from the official row button. */
const SEAT_CLASS = 'bre-provider-delete'

export interface ProviderDeleteDeps {
  /** The plugin's own translator, for the tooltip and the fallback label. */
  t: (key: string, params?: Record<string, string | number>) => string
  /** The official `settings.models` label sets, resolved fresh on every scan. */
  labels: () => HostLabels
}

/**
 * Give every provider row the delete seat the host left out. Idempotent: a row
 * that already has one is only relabelled, and a row whose provider became
 * removable hands the seat back to the host's own button.
 */
export function reconcileProviderDeleteSeat(root: HTMLElement, deps: ProviderDeleteDeps): void {
  if (!root.isConnected) return
  const list = rowsListOf(root)
  if (list === undefined) return
  const labels = deps.labels()
  const label = officialDeleteLabel(list) ?? deps.t('providerRemoveDisabled')
  for (const child of Array.from(list.children)) {
    if (!(child instanceof HTMLElement)) continue
    // Same rule as the switch pass: a row we cannot name is a row we leave
    // exactly as the host rendered it.
    const id = providerIdOfRow(child, labels)
    if (id === undefined) continue
    const head = rowHeadOf(child)
    if (head === undefined) continue
    const actions = head.querySelector<HTMLElement>(ACTIONS_PROBE)
    // No action group means nothing to line up with: the row already renders its
    // controls somewhere this module does not claim.
    if (actions === null) continue
    const existing = actions.querySelector<HTMLElement>(`[${SEAT_ATTR}]`)
    // A removable provider carries the host's own button: the seat stands down
    // rather than doubling it, so a settings reload that flips `removable` — or
    // an added provider — is followed on the next scan.
    if (actions.querySelector(OFFICIAL_DELETE_PROBE) !== null) {
      if (existing !== null) existing.remove()
      continue
    }
    const seat = existing ?? createSeat()
    // The destructive control is the row's LAST action. A seat that is not there
    // yet — or one the host re-rendered its own children in front of — is put
    // back at the end.
    if (actions.lastElementChild !== seat) actions.appendChild(seat)
    syncSeat(seat, id, label, deps.t('providerRemoveLocked', { provider: rowNameOf(child) ?? id }))
  }
}

/** Take every seat out again (plugin dispose, HMR teardown). */
export function teardownProviderDeleteSeats(): void {
  for (const seat of Array.from(document.querySelectorAll<HTMLElement>(`[${SEAT_ATTR}]`))) {
    seat.remove()
  }
}

/**
 * The word the host uses for this action, off any row that still renders one.
 * The page's own copy beats a translation of ours: it is the same word in the
 * same language, at the width the neighbouring buttons are drawn at.
 */
function officialDeleteLabel(list: HTMLElement): string | undefined {
  const button = list.querySelector<HTMLElement>(`${ACTIONS_PROBE} ${OFFICIAL_DELETE_PROBE}`)
  const text = button?.textContent?.trim() ?? ''
  return text.length > 0 ? text : undefined
}

function createSeat(): HTMLElement {
  const seat = document.createElement('button')
  seat.className = SEAT_CLASS
  seat.setAttribute('type', 'button')
  // `disabled` is the STATE, not the styling: the seat must not take a click, a
  // focus or a keyboard activation. Its dimmed look is the host's own disabled
  // treatment (see STYLES).
  seat.setAttribute('disabled', '')
  return seat
}

/** Make the seat stand for this row, compare-before-write on every field. */
function syncSeat(seat: HTMLElement, id: string, label: string, hint: string): void {
  if (seat.getAttribute(SEAT_ATTR) !== id) seat.setAttribute(SEAT_ATTR, id)
  // Guarded: the page's observer watches childList, and replacing the seat's
  // text node on every scan would make each pass feed the next one.
  if (seat.textContent !== label) seat.textContent = label
  if (seat.getAttribute('aria-label') !== hint) seat.setAttribute('aria-label', hint)
  if (seat.getAttribute('title') !== hint) seat.setAttribute('title', hint)
}
