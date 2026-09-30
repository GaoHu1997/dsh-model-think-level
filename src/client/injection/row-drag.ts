/**
 * The drag engine behind both reorderable lists of the Models settings page:
 * the provider rows, and the model rows inside one provider's editor.
 *
 * Neither list is reordered in the DOM — React owns those children — so a row
 * is moved by writing a CSS `order` on it, which reorders the screen (both
 * lists are flex columns) without touching the child list React holds. The id
 * sequence that results is stored by whoever owns the list, through the
 * adapter's `commit`.
 *
 * What the pointer sees while dragging:
 *   - a chip carrying the row's name, instead of the browser's screenshot of
 *     whatever element was grabbed;
 *   - an insertion line between two rows — drawn as a fixed overlay on the
 *     body, never as a child of the list React owns;
 *   - rows that slide (a FLIP pass) instead of jumping;
 *   - the list scrolling on its own while the pointer rests near an edge.
 *
 * The two lists differ in exactly three ways, and all three live in the
 * adapter: where a row's grip is mounted, whether the whole seat drags or only
 * the grip (a model row is a grid of inputs — grabbing it must stay a text
 * selection), and how a row is named and the order stored.
 *
 * @module dsh-model-think-level/client/injection/row-drag
 */

import { moveToIndex } from '../provider-order.js'

/** One reorderable list, as the engine needs to see it. */
export interface DragAdapter {
  /** How an event target resolves to one of this list's rows, or nothing. */
  rowOf: (node: Element, list: HTMLElement) => HTMLElement | undefined
  /** The row's stable id. A row that cannot be named is never moved or grabbed. */
  idOf: (row: HTMLElement) => string | undefined
  /** The text the carried chip shows for a row. */
  labelOf: (row: HTMLElement) => string | undefined
  /** The stored order applied to the ids now on screen. */
  order: (ids: readonly string[]) => readonly string[]
  /** Persist the order the rows screen in. */
  commit: (list: HTMLElement) => void
  /** The element a row's grip is mounted into. */
  seatOf: (row: HTMLElement) => HTMLElement | undefined
  /** Whether the whole seat drags (a provider header) or only the grip does. */
  readonly seatDrags: boolean
  /** The grip's accessible name. */
  gripLabel: (row: HTMLElement, id: string) => string
  /** The grip's tooltip. */
  gripHint: () => string
  /** Extra per-row DOM work, once the row is known to be nameable. */
  decorate?: (row: HTMLElement, seat: HTMLElement) => void
}

/** The row a drag is currently carrying, plus everything an abandoned drag needs. */
export interface DragSession {
  readonly row: HTMLElement
  readonly list: HTMLElement
  /** Every row in screen order when the drag began — an abandoned drag's undo. */
  readonly before: HTMLElement[]
  /** The nearest scroller, for the edge auto-scroll. */
  readonly scroller: HTMLElement | undefined
  /** The adapter that owned the list when the drag began. */
  readonly adapter: DragAdapter
  /** Pixels per frame the auto-scroll moves while the pointer rests near an edge. */
  scrollStep: number
  /** The scheduled auto-scroll frame, while one is pending. */
  frame: number | undefined
  dropped: boolean
}

/** Per-scan bookkeeping; one instance per module that owns a list. */
export interface DragState {
  /** The drag sources already carrying listeners. */
  readonly sources: WeakSet<Element>
  /** The lists already carrying the delegated dragover/drop listeners. */
  readonly lists: WeakSet<Element>
  /** The insertion line; created on the first drag and reused until teardown. */
  line: HTMLElement | undefined
  drag: DragSession | undefined
}

/** Marks the grip we mount, so a rescan recognizes its own work. */
const HANDLE_ATTR = 'data-bre-drag-handle'
/** Marks a seat we made draggable, so teardown hands back an untouched one. */
const HEAD_ATTR = 'data-bre-row-head'
/** Which side of the hovered row the line is on (before/after). */
const DROP_SIDE_ATTR = 'data-bre-drop-side'
const DRAGGING_CLASS = 'bre-row-dragging'
const DROP_CLASS = 'bre-row-drop-target'
const GHOST_CLASS = 'bre-drag-ghost'
const LINE_CLASS = 'bre-drop-line'
const SVG_NS = 'http://www.w3.org/2000/svg'
/** The official lists' row gap, halved to aim the insertion line at its middle. */
const ROW_GAP = 8
/** How close to a scroller's edge the pointer has to be to start scrolling. */
const EDGE_PX = 28
/** Pixels per frame the edge auto-scroll moves. */
const SCROLL_STEP = 12
/** The slide a row does when the pointer carries another one past it. */
const MOVE_TRANSITION = 'transform 180ms cubic-bezier(0.2, 0.7, 0.3, 1)'
/**
 * Controls that own the gesture that starts on them — including the official
 * card's own buttons, and anything the plugin renders inside a row.
 */
const INTERACTIVE =
  'button, a, input, textarea, select, [contenteditable], [role="button"], ' +
  '[role="switch"], [role="checkbox"], [role="textbox"], [role="combobox"]'

export function createDragState(): DragState {
  return { sources: new WeakSet(), lists: new WeakSet(), line: undefined, drag: undefined }
}

/** A list's child elements, in DOM order. */
export function rowElements(parent: HTMLElement): HTMLElement[] {
  return Array.from(parent.children).filter((child): child is HTMLElement => child instanceof HTMLElement)
}

/** A row's own `order` when it has one, else the position it holds in the DOM. */
function orderOf(row: HTMLElement, index: number): number {
  const raw = row.style.order
  if (raw === '') return index
  const parsed = Number.parseInt(raw, 10)
  return Number.isNaN(parsed) ? index : parsed
}

/** The rows in the sequence they currently screen. */
export function visualRows(list: HTMLElement): HTMLElement[] {
  return rowElements(list)
    .map((row, index) => ({ row, key: orderOf(row, index), index }))
    .sort((left, right) => left.key - right.key || left.index - right.index)
    .map(entry => entry.row)
}

/**
 * Put `sequence` on screen: each row it names takes the slot a named row
 * already held, and a row it does not name keeps the slot it has. Every child
 * gets an explicit `order` once anything moves, so no two rows share a slot.
 */
export function placeRows(list: HTMLElement, sequence: readonly HTMLElement[]): void {
  const current = visualRows(list)
  const named = current.filter(row => sequence.includes(row))
  const slots = named.map(row => current.indexOf(row))
  const ordered = sequence.filter(row => named.includes(row))
  const target = new Map<HTMLElement, number>()
  current.forEach((row, index) => target.set(row, index))
  slots.forEach((slot, position) => {
    const row = ordered[position]
    if (row !== undefined) target.set(row, slot)
  })
  for (const [row, slot] of target) {
    const value = String(slot)
    if (row.style.order !== value) row.style.order = value
  }
}

/**
 * Run `mutate`, then let every row that the mutation moved slide to where it
 * went. A row is pinned to its old offset with a transform, that position is
 * laid out (or the browser animates nothing), and the transform is released
 * under a transition — the standard FLIP pass, measured in layout pixels so a
 * container that cannot be measured (a hidden page) simply does not animate.
 */
export function slideIntoPlace(list: HTMLElement, mutate: () => void): void {
  const rows = rowElements(list)
  const before = rows.map(row => row.offsetTop)
  mutate()
  rows.forEach((row, index) => {
    const delta = (before[index] as number) - row.offsetTop
    if (delta === 0) return
    row.style.transition = 'none'
    row.style.transform = `translateY(${delta}px)`
    void row.offsetHeight
    row.style.transition = MOVE_TRANSITION
    row.style.transform = ''
  })
}

/** The ids of the rows that have one, in the order they screen. */
export function orderedIds(
  list: HTMLElement,
  idOf: (row: HTMLElement) => string | undefined,
): string[] {
  return visualRows(list)
    .map(row => idOf(row))
    .filter((id): id is string => id !== undefined)
}

/**
 * Place the rows in `ids` order. Rows without a known id are left exactly where
 * they are: a row we cannot name is a row we must not move.
 */
export function applyIdOrder(
  list: HTMLElement,
  ids: readonly string[],
  idOf: (row: HTMLElement) => string | undefined,
): void {
  const rank = new Map<string, number>()
  for (const [index, id] of ids.entries()) if (!rank.has(id)) rank.set(id, index)
  const named = visualRows(list).filter(row => idOf(row) !== undefined)
  const ordered = [...named].sort((left, right) => {
    const leftRank = rank.get(idOf(left) as string) ?? Number.MAX_SAFE_INTEGER
    const rightRank = rank.get(idOf(right) as string) ?? Number.MAX_SAFE_INTEGER
    return leftRank - rightRank
  })
  placeRows(list, ordered)
}

/** Hand every row back the inline geometry a drag wrote on it. */
export function clearRowOrder(rows: Iterable<HTMLElement>): void {
  for (const row of rows) {
    row.style.order = ''
    row.style.transition = ''
    row.style.transform = ''
  }
}

/**
 * Where the carried row has to land to sit before/after `hovered`.
 *
 * The index is read against the sequence WITHOUT the carried row, which is the
 * sequence `moveToIndex` splices into. Reading it against the sequence that
 * still holds the row is what makes a downward drag land one slot too far: the
 * row's own slot is still counted.
 */
export function dropIndex(
  rows: readonly HTMLElement[],
  carried: HTMLElement,
  hovered: HTMLElement,
  after: boolean,
): number {
  const rest = rows.filter(row => row !== carried)
  const at = rest.indexOf(hovered)
  if (at < 0) return Math.max(0, rows.indexOf(carried))
  return after ? at + 1 : at
}

/** The row nearest a viewport Y — the fallback while the pointer is between rows. */
export function nearestRow(rows: readonly HTMLElement[], clientY: number): HTMLElement | undefined {
  let best: HTMLElement | undefined
  let bestDistance = Number.POSITIVE_INFINITY
  for (const row of rows) {
    const rect = row.getBoundingClientRect()
    const distance = clientY < rect.top ? rect.top - clientY : clientY > rect.bottom ? clientY - rect.bottom : 0
    if (distance < bestDistance) {
      bestDistance = distance
      best = row
    }
  }
  return best
}

/** Whether the pointer sits in the lower half of `row` (a zero-height row reads as "after"). */
function isAfter(row: HTMLElement, clientY: number): boolean {
  const rect = row.getBoundingClientRect()
  if (rect.height <= 0) return true
  return clientY > rect.top + rect.height / 2
}

/** The viewport Y the insertion line belongs at for `row`. */
export function dropLineTop(row: HTMLElement, after: boolean): number {
  const rect = row.getBoundingClientRect()
  return after ? rect.bottom + ROW_GAP / 2 - 1 : rect.top - ROW_GAP / 2 - 1
}

/** Six dots, drawn rather than fetched, so the grip needs no asset URL. */
function gripIcon(): SVGElement {
  const svg = document.createElementNS(SVG_NS, 'svg')
  svg.setAttribute('width', '10')
  svg.setAttribute('height', '14')
  svg.setAttribute('viewBox', '0 0 10 14')
  svg.setAttribute('fill', 'none')
  svg.setAttribute('aria-hidden', 'true')
  const dots: ReadonlyArray<readonly [number, number]> = [[2.5, 3], [7.5, 3], [2.5, 7], [7.5, 7], [2.5, 11], [7.5, 11]]
  for (const [cx, cy] of dots) {
    const dot = document.createElementNS(SVG_NS, 'circle')
    dot.setAttribute('cx', String(cx))
    dot.setAttribute('cy', String(cy))
    dot.setAttribute('r', '1.2')
    dot.setAttribute('fill', 'currentColor')
    svg.appendChild(dot)
  }
  return svg
}

/**
 * The chip the pointer carries. The browser's own drag image is a screenshot of
 * whatever element was grabbed, which for a grip is nothing and for a row card
 * is an unreadable slab — so we hand it a chip with the row's name.
 */
export function makeGhost(row: HTMLElement, label?: string): HTMLElement {
  const ghost = document.createElement('div')
  ghost.className = GHOST_CLASS
  ghost.setAttribute('aria-hidden', 'true')
  ghost.appendChild(gripIcon())
  const name = document.createElement('span')
  name.className = 'bre-drag-ghost-name'
  const printed = label ?? row.querySelector<HTMLElement>('[class*="rowName"]')?.textContent?.trim()
  name.textContent = printed === undefined ? '' : printed
  ghost.appendChild(name)
  return ghost
}

/** Whether a drag that began on `target` belongs to a control rather than a row. */
function interactiveTarget(target: EventTarget | null): boolean {
  if (!(target instanceof Element)) return false
  if (target.closest(`[${HANDLE_ATTR}]`) !== null) return false
  return target.closest(INTERACTIVE) !== null
}

/** The list a row belongs to — both lists hold their rows as direct children. */
function listOf(row: HTMLElement): HTMLElement | undefined {
  return row.parentElement ?? undefined
}

function clearDropMarks(list: HTMLElement): void {
  for (const child of rowElements(list)) {
    child.classList.remove(DROP_CLASS)
    child.removeAttribute(DROP_SIDE_ATTR)
  }
}

/** The nearest ancestor that actually scrolls, for the edge auto-scroll. */
export function scrollHostOf(node: HTMLElement): HTMLElement | undefined {
  let current: HTMLElement | null = node.parentElement
  while (current !== null) {
    if (scrolls(current)) return current
    current = current.parentElement
  }
  const root = document.scrollingElement
  return root instanceof HTMLElement && root.scrollHeight > root.clientHeight ? root : undefined
}

/** Whether an element is a scroll container with something left to scroll. */
function scrolls(node: HTMLElement): boolean {
  if (node.scrollHeight <= node.clientHeight) return false
  const declared = node.style.overflowY
  const overflow = declared.length > 0 ? declared : window.getComputedStyle(node).overflowY
  return overflow === 'auto' || overflow === 'scroll' || overflow === 'overlay'
}

/** The pixels per frame `host` should scroll while the pointer is at `clientY`. */
export function edgeScrollStep(host: HTMLElement, clientY: number): number {
  const rect = host.getBoundingClientRect()
  if (rect.height <= 0) return 0
  if (clientY < rect.top + EDGE_PX) return -SCROLL_STEP
  if (clientY > rect.bottom - EDGE_PX) return SCROLL_STEP
  return 0
}

/** Start, retarget or stop the auto-scroll pump of one drag. */
function setScrollStep(state: DragState, session: DragSession, step: number): void {
  if (session.scrollStep === step) return
  session.scrollStep = step
  if (step === 0) {
    if (session.frame !== undefined) {
      window.cancelAnimationFrame(session.frame)
      session.frame = undefined
    }
    return
  }
  const host = session.scroller
  if (host === undefined || session.frame !== undefined) return
  const tick = (): void => {
    session.frame = undefined
    if (state.drag !== session || session.scrollStep === 0) return
    host.scrollTop += session.scrollStep
    session.frame = window.requestAnimationFrame(tick)
  }
  session.frame = window.requestAnimationFrame(tick)
}

function dropLine(state: DragState): HTMLElement {
  const existing = state.line
  if (existing !== undefined && existing.isConnected) return existing
  const line = document.createElement('div')
  line.className = LINE_CLASS
  line.setAttribute('aria-hidden', 'true')
  document.body.appendChild(line)
  state.line = line
  return line
}

function showDropLine(state: DragState, row: HTMLElement, after: boolean): void {
  const line = dropLine(state)
  const rect = row.getBoundingClientRect()
  line.style.top = `${dropLineTop(row, after)}px`
  line.style.left = `${rect.left}px`
  line.style.width = `${rect.width}px`
  line.style.display = 'block'
  line.setAttribute(DROP_SIDE_ATTR, after ? 'after' : 'before')
}

function hideDropLine(state: DragState): void {
  if (state.line === undefined) return
  state.line.style.display = 'none'
}

/** End whatever drag is in flight, and undo it unless it landed. */
function finishDrag(state: DragState): void {
  const session = state.drag
  state.drag = undefined
  if (session === undefined) return
  setScrollStep(state, session, 0)
  hideDropLine(state)
  session.row.classList.remove(DRAGGING_CLASS)
  clearDropMarks(session.list)
  // A drag that never landed (Esc, or a drop outside the list) is abandoned:
  // the rows slide back, and nothing is stored.
  if (!session.dropped) slideIntoPlace(session.list, () => { placeRows(session.list, session.before) })
}

function startDrag(row: HTMLElement, event: DragEvent, adapter: DragAdapter, state: DragState): void {
  // A drag that began on a row's own controls is not a reorder: cancel ours and
  // leave the control to the browser.
  if (interactiveTarget(event.target)) {
    event.preventDefault()
    return
  }
  const list = listOf(row)
  const id = adapter.idOf(row)
  if (list === undefined || id === undefined) {
    event.preventDefault()
    return
  }
  const session: DragSession = {
    row,
    list,
    before: visualRows(list),
    scroller: scrollHostOf(list),
    adapter,
    scrollStep: 0,
    frame: undefined,
    dropped: false,
  }
  state.drag = session
  row.classList.add(DRAGGING_CLASS)
  const ghost = makeGhost(row, adapter.labelOf(row))
  if (Number.isFinite(event.clientX) && Number.isFinite(event.clientY)) {
    ghost.style.left = `${event.clientX}px`
    ghost.style.top = `${event.clientY}px`
  }
  document.body.appendChild(ghost)
  // A synthesized drag (a test, or a script) may carry no transfer at all;
  // there is then nothing to hand the chip to, but the session — the part that
  // actually moves rows — is already in place.
  const dataTransfer: DataTransfer | null | undefined = event.dataTransfer
  if (dataTransfer != null) {
    try {
      dataTransfer.effectAllowed = 'move'
      dataTransfer.setData('text/plain', id)
      dataTransfer.setDragImage(ghost, Math.round(ghost.offsetWidth / 2), Math.round(ghost.offsetHeight / 2))
    } catch {
      // Not every engine lets a synthesized drag choose its own image.
    }
  }
  // The snapshot is taken while the drag starts, so the chip only has to exist
  // for this task — leaving it in the DOM would outlive its usefulness.
  window.setTimeout(() => { ghost.remove() }, 0)
}

/** Move the carried row under the pointer, and say where it would land. */
function dragOver(list: HTMLElement, event: DragEvent, state: DragState): void {
  const session = state.drag
  if (session === undefined || session.list !== list) return
  const target = event.target
  const over = target instanceof Element ? session.adapter.rowOf(target, list) : undefined
  const rows = visualRows(list)
  const hovered = over !== undefined && rows.includes(over)
    ? over
    : nearestRow(rows, event.clientY)
  if (hovered === undefined) return
  event.preventDefault()
  const dataTransfer: DataTransfer | null | undefined = event.dataTransfer
  if (dataTransfer != null) dataTransfer.dropEffect = 'move'
  const after = isAfter(hovered, event.clientY)
  const slot = dropIndex(rows, session.row, hovered, after)
  // A dragover repeats for as long as the pointer rests, and re-placing a row
  // that would not move is what makes the list flicker under the cursor.
  if (slot !== rows.indexOf(session.row)) {
    slideIntoPlace(list, () => { placeRows(list, moveToIndex(rows, session.row, slot)) })
  }
  clearDropMarks(list)
  hovered.classList.add(DROP_CLASS)
  hovered.setAttribute(DROP_SIDE_ATTR, after ? 'after' : 'before')
  showDropLine(state, hovered, after)
  setScrollStep(state, session, session.scroller === undefined ? 0 : edgeScrollStep(session.scroller, event.clientY))
}

/** The delegated half of the drag: one pair of listeners per list. */
function wireList(list: HTMLElement, state: DragState): void {
  if (state.lists.has(list)) return
  state.lists.add(list)
  list.addEventListener('dragover', (event: DragEvent) => { dragOver(list, event, state) })
  list.addEventListener('drop', (event: DragEvent) => {
    const session = state.drag
    if (session === undefined || session.list !== list) return
    event.preventDefault()
    session.dropped = true
    // Land the order on the ids the rows actually carry: a row with no id has
    // no name to store, and is left out of the stored sequence.
    session.adapter.commit(list)
  })
}

/** Make one drag source start (and end) a drag, once. */
function wireSource(source: HTMLElement, row: HTMLElement, adapter: DragAdapter, state: DragState): void {
  if (state.sources.has(source)) return
  state.sources.add(source)
  if (adapter.seatDrags) {
    source.setAttribute(HEAD_ATTR, '1')
    source.setAttribute('draggable', 'true')
  }
  source.addEventListener('dragstart', (event: DragEvent) => { startDrag(row, event, adapter, state) })
  source.addEventListener('dragend', () => { finishDrag(state) })
}

/** The grip's own two jobs: it is not a row action, and it can reorder by keyboard. */
function wireGrip(grip: HTMLElement, row: HTMLElement, adapter: DragAdapter, state: DragState): void {
  grip.addEventListener('click', (event: MouseEvent) => {
    event.preventDefault()
    event.stopPropagation()
  })
  grip.addEventListener('keydown', (event: KeyboardEvent) => {
    if (event.key !== 'ArrowUp' && event.key !== 'ArrowDown') return
    const list = listOf(row)
    if (list === undefined) return
    const current = visualRows(list)
    const index = current.indexOf(row)
    if (index < 0) return
    const target = index + (event.key === 'ArrowUp' ? -1 : 1)
    if (target < 0 || target >= current.length) return
    event.preventDefault()
    slideIntoPlace(list, () => { placeRows(list, moveToIndex(current, row, target)) })
    adapter.commit(list)
    // A keyboard move that lost focus would make the next press a no-op the
    // user cannot explain.
    grip.focus()
  })
  void state
}

/** Keep one grip's copy in step with the row it belongs to. */
function syncGrip(grip: HTMLElement, row: HTMLElement, id: string, adapter: DragAdapter): void {
  const label = adapter.gripLabel(row, id)
  const hint = adapter.gripHint()
  if (grip.getAttribute(HANDLE_ATTR) !== id) grip.setAttribute(HANDLE_ATTR, id)
  if (grip.getAttribute('aria-label') !== label) grip.setAttribute('aria-label', label)
  if (grip.getAttribute('title') !== hint) grip.setAttribute('title', hint)
}

/** Mount (or refresh) one row's grip, and wire whatever drags for that row. */
function ensureGrip(
  row: HTMLElement,
  seat: HTMLElement,
  id: string,
  adapter: DragAdapter,
  state: DragState,
): void {
  const existing = seat.querySelector<HTMLElement>(`[${HANDLE_ATTR}]`)
  if (existing !== null) {
    // Already mounted (a rescan, or a language switch): refresh the copy.
    syncGrip(existing, row, id, adapter)
    return
  }
  adapter.decorate?.(row, seat)
  const grip = document.createElement('span')
  grip.className = 'bre-drag-grip'
  grip.setAttribute('role', 'button')
  grip.setAttribute('tabindex', '0')
  grip.setAttribute('draggable', 'true')
  grip.appendChild(gripIcon())
  syncGrip(grip, row, id, adapter)
  wireGrip(grip, row, adapter, state)
  wireSource(adapter.seatDrags ? seat : grip, row, adapter, state)
  seat.insertBefore(grip, seat.firstChild)
}

/**
 * One pass over one list: mount a grip in every nameable row, wire the list,
 * and place the rows in the order the adapter's preference asks for.
 *
 * Idempotent by DOM presence — the same guard the editor injector uses, which
 * keeps the insertion from re-triggering the scan that found it.
 */
export function reconcileRows(
  root: HTMLElement,
  list: HTMLElement,
  adapter: DragAdapter,
  state: DragState,
): void {
  if (!root.isConnected) return
  wireList(list, state)
  for (const row of rowElements(list)) {
    const id = adapter.idOf(row)
    if (id === undefined) continue
    const seat = adapter.seatOf(row)
    if (seat === undefined) continue
    ensureGrip(row, seat, id, adapter, state)
  }
  // Mid-drag the screen order is the user's, not the preference's: writing it
  // now would snap the row back under the pointer.
  if (state.drag !== undefined) return
  applyIdOrder(list, adapter.order(orderedIds(list, adapter.idOf)), adapter.idOf)
}

/**
 * Undo everything the engine put on the page: the grips, the draggable seats,
 * the insertion line, the chip, and the classes a drag left behind. The inline
 * `order` of a row is the list owner's to clear (it knows which rows are its
 * own), because the engine's grip removal is global by attribute.
 *
 * A plugin disable or an HMR replace unmounts React trees on its own, but the
 * grips and the draggable seats are raw DOM with listeners attached to
 * themselves — left behind they would keep reordering rows (and persisting that
 * order) on behalf of a fiber that no longer exists.
 */
export function teardownDrags(state: DragState): void {
  state.drag = undefined
  for (const grip of Array.from(document.querySelectorAll<HTMLElement>(`[${HANDLE_ATTR}]`))) grip.remove()
  for (const head of Array.from(document.querySelectorAll<HTMLElement>(`[${HEAD_ATTR}]`))) {
    head.removeAttribute(HEAD_ATTR)
    head.removeAttribute('draggable')
  }
  for (const row of Array.from(document.querySelectorAll<HTMLElement>(`.${DRAGGING_CLASS}, .${DROP_CLASS}`))) {
    row.classList.remove(DRAGGING_CLASS, DROP_CLASS)
  }
  for (const line of Array.from(document.querySelectorAll<HTMLElement>(`.${LINE_CLASS}`))) line.remove()
  for (const ghost of Array.from(document.querySelectorAll<HTMLElement>(`.${GHOST_CLASS}`))) ghost.remove()
  state.line = undefined
}
