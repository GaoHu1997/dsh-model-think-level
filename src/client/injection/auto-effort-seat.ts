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

import { requestAutoEffort, type AutoAdaptReport } from '../auto-effort.js'

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

/** Carries the painted phase, so the sheet can colour a refusal or a success. */
const PHASE_ATTR = 'data-bre-auto-effort-phase'

/**
 * How long a verdict stays on the control before it goes back to its label.
 *
 * A result is feedback, not state: it answers the click the user just made, and
 * the setting it describes is visible in the rows themselves. Leaving it up
 * forever would put a stale sentence in the head of every card the user has
 * ever adapted.
 */
const OUTCOME_TTL_MS = 8000

/** One card's catalogue, paired with the route that card edits. */
export interface AutoEffortSeatTarget {
  /** The card's catalogue section. */
  readonly catalogue: HTMLElement
  /** The provider route the card edits. */
  readonly route: string
}

/**
 * What a reporter may answer with: a report, a promise of one, or nothing at
 * all (a host that cannot say what it did). Both shapes are accepted because
 * the injector's pass is async while a test double is usually not.
 */
export type AutoAdaptAnswer = AutoAdaptReport | void | Promise<AutoAdaptReport | void>

export interface AutoEffortSeatDeps {
  /** The plugin's own translator, for the label and the tooltip. */
  t: (key: string, params?: Record<string, string | number>) => string
  /**
   * Adapt every model of the route that has no on-screen editor, and REPORT
   * what the pass did: the injector owns the settings writes, so the seat can
   * only ask and then say the answer. Absent in tests that only care where the
   * seat is placed — without it the control keeps its idle label, because
   * there is no truthful verdict to show.
   */
  onRequest?: (route: string) => AutoAdaptAnswer
}

/**
 * What the seat says about the last click on one route.
 *
 * The map is keyed by ROUTE and lives for the module, not for the element: the
 * official page re-renders the catalogue head, which drops the seat's DOM and
 * re-creates it from scratch, and a verdict the user just waited for must not
 * vanish with the node.
 */
type SeatPhase = 'working' | 'done' | 'empty' | 'unsuggested' | 'blocked' | 'failed'

/** One route's last verdict, in the words {@link paintSeat} renders. */
interface SeatOutcome {
  readonly phase: SeatPhase
  /** Unconfigured models the pass held an adaptation for. */
  readonly count: number
  /** Models of the same pass that had no suggestion (told in the tooltip). */
  readonly missed: number
  /** The failure text, for the `failed` phase. */
  readonly detail: string
}

const outcomes = new Map<string, SeatOutcome>()

/** The pending fade-back of each route's verdict, so a new click can reset it. */
const reverts = new Map<string, ReturnType<typeof setTimeout>>()

/**
 * The seat's word for one pass, or null when the pass has nothing to say.
 *
 * `busy` is the null case on purpose: a click that arrived while another pass
 * of the same route was in flight did not do anything, and reporting it would
 * erase the verdict the running pass is about to publish when it lands.
 * @param report - what the settings-document walk did.
 * @returns the verdict to paint, or null to leave the label as it is.
 */
function outcomeOf(report: AutoAdaptReport): SeatOutcome | null {
  if (report.blocked === 'busy') return null
  if (report.failed !== undefined) return { phase: 'failed', count: 0, missed: 0, detail: report.failed }
  // Nothing to write is not one condition but three, and they read very
  // differently to a user: "already configured" is the pass working correctly,
  // "blocked" is the pass refusing, and conflating them is exactly the silence
  // this report exists to end.
  if (report.blocked !== undefined) return { phase: 'blocked', count: 0, missed: 0, detail: '' }
  if (report.held > 0) return { phase: 'done', count: report.held, missed: report.unsuggested, detail: '' }
  if (report.unsuggested > 0) return { phase: 'unsuggested', count: 0, missed: report.unsuggested, detail: '' }
  return { phase: 'empty', count: 0, missed: 0, detail: '' }
}

/**
 * The catalogue CONTAINERS inside a scope: the outermost matches only.
 *
 * {@link CATALOG_PROBE} is a class-name SUBSTRING, and the official catalogue
 * renders three more elements whose class names carry it — the heading, the
 * title and the meta nested inside the section. Only the outermost match IS a
 * catalogue, so the container is defined structurally here instead of by a
 * second list of class names to keep in step: seating a control in one of the
 * other three drops a button inside the heading, and the official
 * column-flex text then collapses to a character per line (the
 * empty-catalogue layout break).
 *
 * The sweep in {@link reconcileAutoEffortSeats} deliberately asks the NEAREST
 * match instead: a seat a previous pass left inside the heading belongs to no
 * catalogue this pass names, so it comes out.
 */
export function cataloguesOf(scope: HTMLElement): HTMLElement[] {
  return Array.from(scope.querySelectorAll<HTMLElement>(CATALOG_PROBE))
    .filter(candidate => (candidate.parentElement?.closest(CATALOG_PROBE) ?? null) === null)
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
    syncSeat(seat, route)
    paintSeat(seat, route, label, hint, deps)
  }
  // The target set is the only state the seat set may hold: a seat whose
  // catalogue is gone — or that a React re-render moved out of one — comes out.
  // The NEAREST match answers, so a seat a previous pass left inside the
  // heading (whose own class name carries the stem, but which is not a
  // catalogue) belongs to nothing this pass names and goes. One head holds one
  // seat: the loop above re-homes a nested seat to head level, which would
  // otherwise leave it beside the seat that was already there.
  const seated = new Set<HTMLElement>()
  const routes = new Set(wanted.values())
  for (const seat of Array.from(root.querySelectorAll<HTMLElement>(`[${SEAT_ATTR}]`))) {
    const catalogue = seat.closest<HTMLElement>(CATALOG_PROBE)
    const route = seat.getAttribute(SEAT_ATTR) ?? ''
    if (catalogue === null || !wanted.has(catalogue) || seated.has(catalogue)) {
      seat.remove()
      // A route this pass no longer names is a card that CLOSED, so its verdict
      // goes with it; a route that is merely re-rendered is still in `routes`,
      // which is what keeps the tally alive across the host's own renders.
      if (route.length > 0 && !routes.has(route)) forgetOutcome(route)
      continue
    }
    seated.add(catalogue)
  }
}

/** Drop a route's verdict and its pending fade-back (its card is gone). */
function forgetOutcome(route: string): void {
  const timer = reverts.get(route)
  if (timer !== undefined) clearTimeout(timer)
  reverts.delete(route)
  outcomes.delete(route)
}

/** Take every seat out again (plugin dispose, HMR teardown). */
export function teardownAutoEffortSeats(): void {
  for (const seat of Array.from(document.querySelectorAll<HTMLElement>(`[${SEAT_ATTR}]`))) {
    seat.remove()
  }
  // Verdicts and their pending fade-backs belong to the page that was up: a
  // teardown is a dispose, so the next mount starts from an idle label.
  for (const timer of reverts.values()) clearTimeout(timer)
  reverts.clear()
  outcomes.clear()
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
    void runRequest(seat, route, deps)
  })
  return seat
}

/**
 * Ask the injector to adapt the route, and paint what came back.
 *
 * Without `onRequest` there is no reporter (placement-only tests, and any host
 * that mounted the seat alone): the control then keeps its idle label instead
 * of inventing a verdict.
 */
async function runRequest(seat: HTMLElement, route: string, deps: AutoEffortSeatDeps): Promise<void> {
  if (deps.onRequest === undefined) return
  // Painted before the await: the pass reads the settings document and probes
  // each model, which is long enough for a silent button to read as a dead one.
  const previous = outcomes.get(route)
  outcomes.set(route, { phase: 'working', count: 0, missed: 0, detail: '' })
  const label = deps.t('autoAdaptAll')
  const hint = deps.t('autoAdaptAllHint')
  paintSeat(seat, route, label, hint, deps)
  let answer: AutoAdaptReport | void
  try {
    answer = await deps.onRequest(route)
  } catch (error) {
    answer = { held: 0, unsuggested: 0, failed: String(error) }
  }
  // A reporter that returned nothing said nothing, and one that answered
  // `busy` only refused a double click: both put back whatever the seat was
  // showing, because the pass that IS running will publish its own verdict.
  const outcome = answer === undefined ? null : outcomeOf(answer)
  if (outcome === null) {
    if (previous === undefined) outcomes.delete(route)
    else outcomes.set(route, previous)
    paintSeat(seat, route, label, hint, deps)
    return
  }
  outcomes.set(route, outcome)
  scheduleRevert(route, seat, deps)
  paintSeat(seat, route, label, hint, deps)
}

/** Return a route's seat to its idle face once the verdict has been read. */
function scheduleRevert(route: string, seat: HTMLElement, deps: AutoEffortSeatDeps): void {
  const pending = reverts.get(route)
  if (pending !== undefined) clearTimeout(pending)
  const timer = setTimeout(() => {
    reverts.delete(route)
    outcomes.delete(route)
    // The element may have been replaced by a re-render in the meantime; the
    // next reconcile pass paints the fresh node from the (now idle) map.
    paintSeat(seat, route, deps.t('autoAdaptAll'), deps.t('autoAdaptAllHint'), deps)
  }, OUTCOME_TTL_MS)
  reverts.set(route, timer)
}

/**
 * Write the seat's current face: idle label, the pass in flight, or its
 * verdict. Every field is compare-before-write — the page's own observer
 * watches the head, and an unconditional write per scan would make each pass
 * feed the next one.
 */
function paintSeat(
  seat: HTMLElement,
  route: string,
  label: string,
  hint: string,
  deps: AutoEffortSeatDeps,
): void {
  const outcome = outcomes.get(route)
  // 'idle' is the absence of a verdict, not one of them: the attribute carries
  // it so the sheet can tell a settled control from a working one.
  const phase = outcome === undefined ? 'idle' : outcome.phase
  if (seat.getAttribute(PHASE_ATTR) !== phase) seat.setAttribute(PHASE_ATTR, phase)
  const text = outcome === undefined ? label : faceOf(outcome, deps)
  if (seat.textContent !== text) seat.textContent = text
  const title = outcome === undefined ? hint : titleOf(outcome, deps, hint)
  if (seat.getAttribute('title') !== title) seat.setAttribute('title', title)
  // Busy is the only phase that must not take another click: every other face
  // is a result the user may immediately want to redo (a model they just
  // configured by hand, a probe that failed on the wire).
  const disabled = outcome?.phase === 'working'
  if ((seat as HTMLButtonElement).disabled !== disabled) (seat as HTMLButtonElement).disabled = disabled
}

/** The verdict's visible words. */
function faceOf(outcome: SeatOutcome, deps: AutoEffortSeatDeps): string {
  switch (outcome.phase) {
    case 'working': return deps.t('autoAdaptWorking')
    case 'done': return deps.t('autoAdaptDone', { count: outcome.count })
    case 'empty': return deps.t('autoAdaptEmpty')
    case 'unsuggested': return deps.t('autoAdaptUnsuggested')
    case 'blocked': return deps.t('autoAdaptBlocked')
    case 'failed': return deps.t('autoAdaptFailed', { message: outcome.detail })
  }
}

/** The verdict's tooltip: what happened to the models the label could not hold. */
function titleOf(outcome: SeatOutcome, deps: AutoEffortSeatDeps, idleHint: string): string {
  switch (outcome.phase) {
    case 'working': return idleHint
    case 'done':
      // Only worth a sentence when some model was left out: the label already
      // carries the count that landed.
      return outcome.missed > 0
        ? `${deps.t('autoAdaptDoneHint', { count: outcome.count })} ${deps.t('autoAdaptUnsuggestedHint')}`
        : deps.t('autoAdaptDoneHint', { count: outcome.count })
    case 'empty': return deps.t('autoAdaptEmptyHint')
    case 'unsuggested': return deps.t('autoAdaptUnsuggestedHint')
    case 'blocked': return deps.t('autoAdaptBlockedHint')
    case 'failed': return deps.t('autoAdaptFailed', { message: outcome.detail })
  }
}

/** Make the seat stand for this route, compare-before-write on the attribute. */
function syncSeat(seat: HTMLElement, route: string): void {
  if (seat.getAttribute(SEAT_ATTR) !== route) seat.setAttribute(SEAT_ATTR, route)
}
