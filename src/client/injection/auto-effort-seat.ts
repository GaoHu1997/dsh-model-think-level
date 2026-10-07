/**
 * The "adapt every model of this provider" seat, beside the official
 * fetch-models link (user request ⑤).
 *
 * The official catalogue head carries exactly one control — the link that
 * fetches the provider's model list — so a provider with twenty models makes
 * the user open twenty rows and click 自动适配 in each. The seat stands next to
 * that link and asks every model of the provider to adapt at once.
 *
 * It is raw DOM inside the host's own head for the same reason the provider
 * delete seat is: the plugin owns no slot there. It never moves a React-owned
 * node — it only inserts itself as the anchor's next sibling and re-inserts
 * itself when a re-render drops it — and every write is compare-before-write,
 * so a settled pass emits no mutation of its own.
 *
 * The click does not write anything itself: it publishes a request on the
 * document (see `../auto-effort.js`), which the per-model editors answer for
 * their own rows, and hands the route to `deps.onRequest`, which answers for
 * the models that have no editor on screen -- a collapsed row renders no
 * disclosure container, so nothing else on the page can serve it. The seat
 * therefore holds no write path of its own, and neither answer stages a
 * document the open card is already holding.
 *
 * @module dsh-model-think-level/client/injection/auto-effort-seat
 */

import { requestAutoEffort } from '../auto-effort.js'

/** Marks the seat, and carries the route whose models it adapts. */
const SEAT_ATTR = 'data-bre-auto-effort'

/** The card's catalogue, probed by class-name fragment (a CSS-module hash). */
const CATALOG_PROBE = '[class*="modelCatalog"]'

/** The catalogue's head row: the strip that carries the fetch link. */
const HEAD_PROBE = '[class*="modelListHead"]'

/** The host's own link-shaped control, probed the same way. */
const LINK_PROBE = 'button[class*="linkButton"]'

/** The seat's class: `bre-link-button` gives it the shared link metrics. */
const SEAT_CLASS = 'bre-link-button bre-auto-effort'

/** One card's catalogue, paired with the route that card edits. */
export interface AutoEffortSeatTarget {
  /** The card's catalogue section. */
  readonly catalogue: HTMLElement
  /** The provider route the card edits. */
  readonly route: string
}

export interface AutoEffortSeatDeps {
  /** The plugin's own translator, for the label and the tooltip. */
  t: (key: string, params?: Record<string, string | number>) => string
  /**
   * Adapt every model of the route that has no on-screen editor: the injector
   * owns the settings writes, so the seat only reports the click. Absent in
   * tests that only care where the seat is placed.
   */
  onRequest?: (route: string) => void
}

/**
 * Give every target's catalogue head an auto-adapt seat. Idempotent: a head
 * that already has one is only relabelled and re-seated, and a seat whose
 * catalogue this pass no longer names is taken out.
 */
export function reconcileAutoEffortSeats(
  root: HTMLElement,
  targets: readonly AutoEffortSeatTarget[],
  deps: AutoEffortSeatDeps,
): void {
  const wanted = new Map<HTMLElement, string>()
  for (const target of targets) {
    if (target.route.length === 0) continue
    if (!target.catalogue.isConnected) continue
    wanted.set(target.catalogue, target.route)
  }
  const label = deps.t('autoAdaptAll')
  const hint = deps.t('autoAdaptAllHint')
  for (const [catalogue, route] of wanted) {
    const head = catalogue.querySelector<HTMLElement>(HEAD_PROBE) ?? catalogue
    const seat = head.querySelector<HTMLButtonElement>(`[${SEAT_ATTR}]`) ?? createSeat(deps)
    // Beside the host's own link when the head renders one (the control the
    // user already reaches for), else at the head's end.
    const anchor = lastLink(head)
    if (anchor !== null) {
      if (anchor.nextElementSibling !== seat) anchor.after(seat)
    } else if (head.lastElementChild !== seat) {
      head.append(seat)
    }
    syncSeat(seat, route, label, hint)
  }
  // The target set is the only state the seat set may hold: a seat whose
  // catalogue is gone — or that a React re-render moved out of one — comes out.
  for (const seat of Array.from(root.querySelectorAll<HTMLElement>(`[${SEAT_ATTR}]`))) {
    const catalogue = seat.closest<HTMLElement>(CATALOG_PROBE)
    if (catalogue === null || !wanted.has(catalogue)) seat.remove()
  }
}

/** Take every seat out again (plugin dispose, HMR teardown). */
export function teardownAutoEffortSeats(): void {
  for (const seat of Array.from(document.querySelectorAll<HTMLElement>(`[${SEAT_ATTR}]`))) {
    seat.remove()
  }
}

/** The head's own fetch link: the LAST link-shaped button it renders. */
function lastLink(head: HTMLElement): HTMLElement | null {
  const links = Array.from(head.querySelectorAll<HTMLElement>(LINK_PROBE))
  return links.length === 0 ? null : links[links.length - 1]
}

function createSeat(deps: AutoEffortSeatDeps): HTMLButtonElement {
  const seat = document.createElement('button')
  seat.className = SEAT_CLASS
  seat.setAttribute('type', 'button')
  seat.setAttribute(SEAT_ATTR, '')
  // The route is read at CLICK time, not captured: a create card's Provider ID
  // can be retyped after the seat was first placed, and the sync below rewrites
  // the attribute to whatever the card names now.
  seat.addEventListener('click', () => {
    const route = seat.getAttribute(SEAT_ATTR) ?? ''
    if (route.length === 0) return
    // Two answers, one click: the event reaches every mounted row's editor
    // (the expanded ones), and `onRequest` covers the rows the pass could not
    // mount -- a collapsed row has no disclosure container to mount into.
    requestAutoEffort(route)
    deps.onRequest?.(route)
  })
  return seat
}

/** Make the seat stand for this route, compare-before-write on every field. */
function syncSeat(seat: HTMLElement, route: string, label: string, hint: string): void {
  if (seat.getAttribute(SEAT_ATTR) !== route) seat.setAttribute(SEAT_ATTR, route)
  // Guarded: the page's observer watches childList, and replacing the seat's
  // text node on every scan would make each pass feed the next one.
  if (seat.textContent !== label) seat.textContent = label
  // The label IS the accessible name (a text button names itself), so the
  // scope goes in the tooltip only: an aria-label that replaced the visible
  // word would break "click 自动获取思考等级" for voice control (WCAG 2.5.3).
  if (seat.getAttribute('title') !== hint) seat.setAttribute('title', hint)
}
