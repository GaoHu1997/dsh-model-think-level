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
 * What the click DID is reported in a bubble at the top of the window
 * ({@link showNote}), never by rewriting the control: the head's button is the
 * host's layout, and a button whose label and enabledness change under the
 * pointer is a different control every time the user looks at it. The bubble
 * takes itself away again, because a verdict is feedback and not state.
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

/**
 * The seat's class.
 *
 * It carries no plugin link class: the seat stands among the host's own head
 * controls and wears THEIR metrics, not the plugin's underlined link look
 * (user request: "不要超链接样式，跟另外两个保持一致").
 */
const SEAT_CLASS = 'bre-auto-effort'

/** The bubble's class, and the phase it carries for the sheet. */
const NOTE_CLASS = 'bre-auto-effort-note'
const NOTE_PHASE_ATTR = 'data-bre-auto-effort-phase'
const NOTE_TEXT_CLASS = 'bre-auto-effort-note-text'
const NOTE_DETAIL_CLASS = 'bre-auto-effort-note-detail'

/**
 * How long a verdict stays on screen before it goes away.
 *
 * A result is feedback, not state: it answers the click the user just made, and
 * the setting it describes is visible in the rows themselves. A bubble that
 * outlives the moment would sit over the card the user is now working in — so
 * it lives as long as the host's own toast does, and no longer.
 */
const OUTCOME_TTL_MS = 3000

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
  /** The plugin's own translator, for the label the seat carries. */
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
 * A verdict is FEEDBACK, not state, and it is not painted onto the control: the
 * head's button keeps its label and its enabledness, because a
 * button that rewrites itself into "已适配 3 个" is a different control every
 * time the user looks at it — and the next click has to be readable as the same
 * action as the last one. The verdict appears in a bubble at the top of the
 * window instead (see {@link showNote}) and goes away on its own.
 */
type SeatPhase = 'working' | 'done' | 'empty' | 'unsuggested' | 'blocked' | 'failed'

/** One route's last verdict, in the words the bubble renders. */
interface SeatOutcome {
  readonly phase: SeatPhase
  /** Unconfigured models the pass held an adaptation for. */
  readonly count: number
  /** Models of the same pass that had no suggestion (told in the detail line). */
  readonly missed: number
  /** The failure text, for the `failed` phase. */
  readonly detail: string
}

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
    syncSeat(seat, route, label)
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
      // A route this pass no longer names is a card that CLOSED, so its bubble
      // goes with it; a route that is merely re-rendered is still in `routes`,
      // which is what keeps a bubble up across the host's own renders.
      if (route.length > 0 && !routes.has(route)) hideNote(route)
      continue
    }
    seated.add(catalogue)
  }
}

/** Take down one route's bubble and its pending dismissal (the card is gone). */
function hideNote(route: string): void {
  const entry = notes.get(route)
  if (entry === undefined) return
  if (entry.timer !== null) clearTimeout(entry.timer)
  entry.note.remove()
  notes.delete(route)
}

/** Take every seat out again (plugin dispose, HMR teardown). */
export function teardownAutoEffortSeats(): void {
  for (const seat of Array.from(document.querySelectorAll<HTMLElement>(`[${SEAT_ATTR}]`))) {
    seat.remove()
  }
  // Bubbles belong to the page that was up, and the bubble elements are this
  // plugin's OWN DOM outside the seat — nothing else would ever unmount them.
  for (const entry of notes.values()) {
    if (entry.timer !== null) clearTimeout(entry.timer)
    entry.note.remove()
  }
  notes.clear()
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
    void runRequest(route, deps)
  })
  return seat
}

/**
 * Ask the injector to adapt the route, and report what came back in a bubble.
 *
 * Without `onRequest` there is no reporter (placement-only tests, and any host
 * that mounted the seat alone): the control then says nothing instead of
 * inventing a verdict.
 */
async function runRequest(route: string, deps: AutoEffortSeatDeps): Promise<void> {
  if (deps.onRequest === undefined) return
  // Shown before the await: the pass reads the settings document and probes
  // each model, which is long enough for a silent click to read as a dead one.
  showNote(route, { phase: 'working', count: 0, missed: 0, detail: '' }, deps, 0)
  let answer: AutoAdaptReport | void
  try {
    answer = await deps.onRequest(route)
  } catch (error) {
    answer = { held: 0, unsuggested: 0, failed: String(error) }
  }
  // A reporter that returned nothing said nothing, and one that answered
  // `busy` only refused a double click: both retire the bubble, because the pass
  // that IS running will put up its own verdict when it lands.
  if (answer === undefined) {
    hideNote(route)
    return
  }
  const outcome = outcomeOf(answer)
  if (outcome === null) return
  showNote(route, outcome, deps, OUTCOME_TTL_MS)
}

/**
 * Raise (or replace) a route's bubble at the top of the window, and — for a
 * verdict — arrange for it to retire.
 *
 * The bubble is this plugin's own DOM: it is never a child of the head, because
 * the head is the host's flex row and a fourth child would be a fourth item in
 * its layout. It hangs off the body as a fixed top-centre overlay instead,
 * exactly like the host's own toast and our own drag ghost.
 */
function showNote(
  route: string,
  outcome: SeatOutcome,
  deps: AutoEffortSeatDeps,
  ttlMs: number,
): void {
  let entry = notes.get(route)
  // A bubble already up for this route is REPLACED, not stacked: two passes of
  // the same card would otherwise leave two bubbles over the same page. One
  // that is no longer in the document was taken out from under us (a host that
  // clears the body, a teardown that missed it) and is rebuilt instead of
  // being written to in vain.
  if (entry !== undefined && !entry.note.isConnected) {
    if (entry.timer !== null) clearTimeout(entry.timer)
    notes.delete(route)
    entry = undefined
  }
  if (entry !== undefined && entry.timer !== null) clearTimeout(entry.timer)
  const note = entry?.note ?? buildNote()
  note.setAttribute(NOTE_PHASE_ATTR, outcome.phase)
  const text = note.querySelector<HTMLElement>(`.${NOTE_TEXT_CLASS}`)!
  const detail = note.querySelector<HTMLElement>(`.${NOTE_DETAIL_CLASS}`)!
  const wording = wordsOf(outcome, deps)
  if (text.textContent !== wording.text) text.textContent = wording.text
  if (detail.textContent !== wording.detail) detail.textContent = wording.detail
  detail.hidden = wording.detail.length === 0
  if (entry === undefined) document.body.append(note)
  // A working bubble has no lifetime of its own: the pass answers and replaces
  // it with the verdict. The clock starts when the verdict lands. The fade is
  // declared in the sheet and timed from here, so the two can never disagree.
  const timer = ttlMs > 0 ? setTimeout(() => { hideNote(route) }, ttlMs) : null
  note.style.setProperty('--bre-note-hold', `${ttlMs}ms`)
  notes.set(route, { note, timer })
}

/** The bubble's own element, empty until it is filled. */
function buildNote(): HTMLElement {
  const note = document.createElement('div')
  note.className = NOTE_CLASS
  // Announced, because the control the user pressed does NOT change: for a
  // reader that cannot see the bubble, this is the only answer to the click.
  note.setAttribute('role', 'status')
  note.setAttribute('aria-live', 'polite')
  note.innerHTML = `<span class="${NOTE_TEXT_CLASS}"></span><span class="${NOTE_DETAIL_CLASS}"></span>`
  return note
}

/**
 * The bubbles currently up, one per route.
 *
 * A route is the key rather than the element: the seat that raised a bubble is
 * re-created by the host's own renders, and the bubble must outlive it — it is
 * fixed at the top of the window and no longer anchored to anything.
 */
const notes = new Map<string, { note: HTMLElement; timer: ReturnType<typeof setTimeout> | null }>()

/** The note's two lines: what happened, and the part the headline omits. */
function wordsOf(outcome: SeatOutcome, deps: AutoEffortSeatDeps): { text: string; detail: string } {
  switch (outcome.phase) {
    case 'working': return { text: deps.t('autoAdaptWorking'), detail: '' }
    case 'done':
      // The detail is the part the headline cannot hold: these writes are HELD
      // for the card's own Save, and some models may have had no suggestion.
      return {
        text: deps.t('autoAdaptDone', { count: outcome.count }),
        detail: outcome.missed > 0
          ? `${deps.t('autoAdaptDoneHint', { count: outcome.count })} ${deps.t('autoAdaptUnsuggestedHint')}`
          : deps.t('autoAdaptDoneHint', { count: outcome.count }),
      }
    case 'empty': return { text: deps.t('autoAdaptEmpty'), detail: deps.t('autoAdaptEmptyHint') }
    case 'unsuggested': return { text: deps.t('autoAdaptUnsuggested'), detail: deps.t('autoAdaptUnsuggestedHint') }
    case 'blocked': return { text: deps.t('autoAdaptBlocked'), detail: deps.t('autoAdaptBlockedHint') }
    case 'failed': return { text: deps.t('autoAdaptFailed', { message: outcome.detail }), detail: outcome.detail }
  }
}

/** Make the seat stand for this route, compare-before-write on every field. */
function syncSeat(seat: HTMLElement, route: string, label: string): void {
  if (seat.getAttribute(SEAT_ATTR) !== route) seat.setAttribute(SEAT_ATTR, route)
  // Guarded: the page's observer watches childList, and replacing the seat's
  // text node on every scan would make each pass feed the next one. The label
  // is the IDLE label and never the verdict: see the module comment.
  if (seat.textContent !== label) seat.textContent = label
  // No tooltip: the seat reads as one more control of the host's own head, and
  // the host gives ITS controls none unless they can be blocked (user request:
  // "也不要鼠标悬浮提示"). The label alone names the action, as it does there.
  if (seat.getAttribute('title') !== null) seat.removeAttribute('title')
}
