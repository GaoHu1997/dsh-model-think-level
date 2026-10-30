/**
 * The balance chip in front of a provider's enable switch (Models page).
 *
 * The row shows the amount the provider's own balance endpoint answered, and
 * nothing at all when that provider has no balance endpoint configured — the
 * chip is decoration, not a control, so it must never invent a value or a
 * placeholder. The URL lives in the plugin's key index (written from the
 * provider card's 余额 row) and the host does the authenticated call
 * (`../balance-client.ts`).
 *
 * Timing is deliberate: ONE read per provider per page opening. The Models page
 * is the only place the list exists, so there is nothing to fetch while the
 * user is elsewhere; when the provider list disappears the session is marked
 * closed, and opening the page again starts one fresh read per provider. There
 * is no interval and no polling — a second read inside the same opening only
 * happens when the balance URL itself was written (see
 * {@link invalidateProviderBalance}).
 *
 * A failed read does NOT throw the last answer away: the chip keeps the last
 * successful amount (requirement: show the previous value when nothing new
 * arrived). Only a route that has never answered falls back to the failed chip,
 * and only when its endpoint really is configured — otherwise nothing is shown.
 *
 * The chip is placed immediately BEFORE the switch — the switch belongs to the
 * provider's state, the balance is context for it — and the position is
 * re-asserted on every scan, because the official row can re-render its action
 * group at any time.
 *
 * @module dsh-model-think-level/client/injection/provider-balance
 */

import { formatBalance, type BalanceReading } from '../../balance.js'
import { httpBalanceClient, type BalanceClient } from '../balance-client.js'
import type { HostLabels } from './models-page-editor.js'
import { providerIdOfRow, rowHeadOf, rowsListOf } from './provider-order-drag.js'
import { svgGlyph } from './icon.js'

/** Marks the chip, and carries the provider id it belongs to. */
const CHIP_ATTR = 'data-bre-provider-balance'
/** The enable switch the chip must lead (owned by `./provider-toggle.ts`). */
const SWITCH_ATTR = 'data-bre-provider-switch'
/** Marks the chip's refresh button. */
const REFRESH_ATTR = 'data-bre-provider-balance-refresh'

/**
 * The chip's refresh glyph: a circular arrow on the 16px outline grid the rest
 * of the plugin's icons use (an almost-full circle plus its arrowhead).
 */
const REFRESH_PATHS = [
  'M13.4 8a5.4 5.4 0 1 1-1.6-3.8',
  'M13.8 2.2v3.5h-3.5',
] as const

/** Per-session bookkeeping (one instance lives in `models-page.ts`). */
export interface ProviderBalanceState {
  /** Route → the last successful reading (kept across a failed re-read). */
  readonly readings: Map<string, BalanceReading>
  /** Route → the last failure's reason, for routes with no reading yet. */
  readonly errors: Map<string, string>
  /** Routes already asked during THIS page opening. */
  readonly requested: Set<string>
  /** Routes with a read in flight. */
  readonly inflight: Set<string>
  /** Routes invalidated while a read was in flight (re-read on settle). */
  readonly pending: Set<string>
  /** Reads waiting for a concurrency slot; discarded when the page closes. */
  readonly queued: PendingBalanceRead[]
  /** Whether the provider list was present in the previous pass. */
  visible: boolean
}

/** A read waiting for a slot: the row that asked and the route it asked for. */
interface PendingBalanceRead {
  readonly head: HTMLElement
  readonly route: string
}

/** What the chip needs from its host. */
export interface ProviderBalanceDeps {
  /** The plugin's own translator, for the chip's label and tooltip. */
  readonly t: (key: string, params?: Record<string, string | number>) => string
  /** The official `settings.models` label sets, resolved fresh on every scan. */
  readonly labels: () => HostLabels
  /** Transport; injectable for tests. */
  readonly client?: BalanceClient
  /**
   * Ask the page for one more reconcile after an answer landed for a row that
   * is no longer in the DOM (the page was closed and reopened while the read
   * was in flight). Without it that answer would wait for an unrelated
   * mutation to reach the new row.
   */
  readonly repaint?: () => void
}

/** A fresh state for one page instance. */
export function createProviderBalanceState(): ProviderBalanceState {
  return {
    readings: new Map(),
    errors: new Map(),
    requested: new Set(),
    inflight: new Set(),
    pending: new Set(),
    queued: [],
    visible: false,
  }
}

/**
 * Reads on the wire at once. The page opening fires one read per provider and
 * the list may hold dozens; uncapped, they all arrive as simultaneous host
 * requests, each of which pins a socket for a full timeout window and queues
 * behind the host's serialised settings reads. Three at a time spreads the
 * same total work without the pile-up — the same limit the key prefetch runs.
 */
const BALANCE_READ_CONCURRENCY = 3

/**
 * Visit every provider row: paint what is known, and ask once per page opening
 * for a route that has not been asked in this opening.
 *
 * A missing provider list means the Models page is closed (or not rendered):
 * the opening is over, so the next presence starts a new read session. No
 * request is made from this function while the list is absent.
 * @param list - the provider list already resolved by the caller's scan (see
 *   `reconcileProviderOrder`); re-deriving it here costs a document-wide walk
 *   per pass, and one burst runs several passes.
 */
export function reconcileProviderBalance(
  root: HTMLElement,
  deps: ProviderBalanceDeps,
  state: ProviderBalanceState,
  list: HTMLElement | undefined = rowsListOf(root),
): void {
  if (list === undefined) {
    // The provider list (and with it the Models page) is gone: nothing may be
    // fetched until it is opened again. Reads still queued behind a slot go
    // with the opening — the next one asks afresh.
    state.visible = false
    state.queued.length = 0
    return
  }
  if (!state.visible) {
    // A (re)opened page: each provider gets exactly one fresh read.
    state.visible = true
    state.requested.clear()
  }
  const labels = deps.labels()
  for (const child of Array.from(list.children)) {
    if (!(child instanceof HTMLElement)) continue
    const id = providerIdOfRow(child, labels)
    if (id === undefined) continue
    const head = rowHeadOf(child)
    if (head === undefined) continue
    paintFromState(head, id, deps, state)
    maybeRead(head, id, deps, state)
  }
}

/**
 * Forget one route's session, so the next reconcile reads it now.
 * A balance URL was just written (or cleared): the old amount belongs to the
 * old endpoint, and waiting for a page reopening would leave the chip lying.
 */
export function invalidateProviderBalance(state: ProviderBalanceState, route: string): void {
  state.requested.delete(route)
  state.readings.delete(route)
  state.errors.delete(route)
  // A read already on the wire cannot be cancelled here. It will settle and
  // remove its own marker; the next pass must then read the NEW url, so mark
  // the route for one immediate follow-up.
  if (state.inflight.has(route)) state.pending.add(route)
  // A read still WAITING for a slot goes instead: it has not been asked yet,
  // and its ask would have carried the URL this invalidation just retired.
  for (let i = state.queued.length - 1; i >= 0; i -= 1) {
    if (state.queued[i]?.route === route) state.queued.splice(i, 1)
  }
}

/** Remove every chip (the fiber is going away). */
export function teardownProviderBalance(): void {
  for (const chip of Array.from(document.querySelectorAll<HTMLElement>(`[${CHIP_ATTR}]`))) {
    chip.remove()
  }
}

/** Paint one row from whatever is remembered: amount, failure, or nothing. */
function paintFromState(
  head: HTMLElement,
  id: string,
  deps: ProviderBalanceDeps,
  state: ProviderBalanceState,
): void {
  const reading = state.readings.get(id)
  if (reading !== undefined) {
    paintChip(head, id, reading, deps, state)
    return
  }
  const error = state.errors.get(id)
  if (error !== undefined) {
    paintFailedChip(head, id, error, deps, state)
    return
  }
  removeChip(head)
}

/** Paint one row's chip from a reading, keeping it immediately before the switch. */
function paintChip(
  head: HTMLElement,
  id: string,
  reading: BalanceReading,
  deps: ProviderBalanceDeps,
  state: ProviderBalanceState,
): void {
  const chip = ensureChip(head, id, deps, state)
  writeChip(chip, `${deps.t('providerBalanceLabel')} ${formatBalance(reading)}`, deps.t('providerBalanceHint'), deps)
  placeChip(head, chip)
}

/**
 * Paint the failed state for a CONFIGURED endpoint that has never answered: the
 * amount is unknown, but the user's URL was stored and the plugin tried — showing
 * nothing here would make a typo in the URL indistinguishable from "never
 * configured".
 */
function paintFailedChip(
  head: HTMLElement,
  id: string,
  error: string,
  deps: ProviderBalanceDeps,
  state: ProviderBalanceState,
): void {
  const chip = ensureChip(head, id, deps, state)
  const title = error.length > 0 ? error : deps.t('providerBalanceHint')
  writeChip(chip, deps.t('providerBalanceUnavailable'), title, deps)
  placeChip(head, chip)
}

/**
 * The row's chip, created (unplaced) on first use: the amount first, then the
 * refresh control AFTER it. A chip from a build without the control is rebuilt,
 * so an HMR session cannot leave a chip that can never be refreshed.
 */
function ensureChip(
  head: HTMLElement,
  id: string,
  deps: ProviderBalanceDeps,
  state: ProviderBalanceState,
): HTMLElement {
  let chip = head.querySelector<HTMLElement>(`[${CHIP_ATTR}]`)
  if (chip === null) {
    chip = document.createElement('span')
    chip.className = 'bre-provider-balance'
    chip.setAttribute(CHIP_ATTR, id)
  } else if (chip.getAttribute(CHIP_ATTR) !== id) {
    chip.setAttribute(CHIP_ATTR, id)
  }
  if (
    chip.querySelector('.bre-provider-balance-text') === null ||
    chip.querySelector(`[${REFRESH_ATTR}]`) === null
  ) {
    chip.replaceChildren()
    buildChipContents(chip, head, deps, state)
  }
  return chip
}

/** The chip's children: the balance text, then the refresh icon after it. */
function buildChipContents(
  chip: HTMLElement,
  head: HTMLElement,
  deps: ProviderBalanceDeps,
  state: ProviderBalanceState,
): void {
  const text = document.createElement('span')
  text.className = 'bre-provider-balance-text'
  const refresh = document.createElement('button')
  refresh.type = 'button'
  refresh.className = 'bre-provider-balance-refresh'
  refresh.setAttribute(REFRESH_ATTR, '1')
  refresh.setAttribute('aria-label', deps.t('providerBalanceRefresh'))
  refresh.title = deps.t('providerBalanceRefresh')
  refresh.append(svgGlyph('balance-refresh', REFRESH_PATHS))
  refresh.addEventListener('click', (event: MouseEvent) => {
    // The row itself is a button and the header drags: neither may read this
    // click as its own.
    event.preventDefault()
    event.stopPropagation()
    const route = chip.getAttribute(CHIP_ATTR)
    if (route === null || route.length === 0) return
    if (state.inflight.has(route)) {
      // A read is already running: refresh once more when it settles.
      state.pending.add(route)
      return
    }
    state.requested.delete(route)
    maybeRead(head, route, deps, state)
  })
  chip.append(text, refresh)
}

/** Keep the chip's text and tooltip in step, without blind rewrites. */
function writeChip(
  chip: HTMLElement,
  text: string,
  title: string,
  deps: ProviderBalanceDeps,
): void {
  const label = chip.querySelector<HTMLElement>('.bre-provider-balance-text')
  if (label !== null && label.textContent !== text) label.textContent = text
  if (chip.getAttribute('title') !== title) chip.setAttribute('title', title)
  // A language switch reaches the button's own copy too.
  const refresh = chip.querySelector<HTMLElement>(`[${REFRESH_ATTR}]`)
  if (refresh !== null) {
    const hint = deps.t('providerBalanceRefresh')
    if (refresh.getAttribute('aria-label') !== hint) refresh.setAttribute('aria-label', hint)
    if (refresh.getAttribute('title') !== hint) refresh.setAttribute('title', hint)
  }
}

/** Spin the chip's refresh glyph while a read is on the wire. */
function setRefreshing(head: HTMLElement, id: string, on: boolean): void {
  const chip = head.querySelector<HTMLElement>(`[${CHIP_ATTR}]`)
  if (chip === null || chip.getAttribute(CHIP_ATTR) !== id) return
  const refresh = chip.querySelector<HTMLElement>(`[${REFRESH_ATTR}]`)
  if (refresh === null) return
  refresh.classList.toggle('is-spinning', on)
  if (on) refresh.setAttribute('aria-busy', 'true')
  else refresh.removeAttribute('aria-busy')
}

/** Put the chip immediately before the enable switch (the row's target seat). */
function placeChip(head: HTMLElement, chip: HTMLElement): void {
  const anchor = head.querySelector<HTMLElement>(`[${SWITCH_ATTR}]`)
  if (anchor !== null) {
    // The enable pass runs first in the same scan, but a re-render can replace
    // the switch later; keep the chip glued to whichever switch is there now.
    // Only move it when it is not already its immediate predecessor, so a
    // settled row sees no mutation at all.
    if (chip.nextElementSibling !== anchor) anchor.before(chip)
    return
  }
  if (chip.parentElement !== null) return
  const actions = head.querySelector<HTMLElement>('[class*="rowActions"]')
  if (actions !== null) actions.insertBefore(chip, actions.firstChild)
  else head.appendChild(chip)
}

/** Remove the row's chip, if it has one. */
function removeChip(head: HTMLElement): void {
  for (const chip of Array.from(head.querySelectorAll<HTMLElement>(`[${CHIP_ATTR}]`))) {
    chip.remove()
  }
}

/**
 * Ask the host for one route's balance when this page opening has not asked yet,
 * then paint the answer into the head it was asked for (the head may be gone by
 * then; the state still carries the answer to the next one). Beyond the
 * concurrency cap the read waits in the queue — see
 * {@link BALANCE_READ_CONCURRENCY}.
 */
function maybeRead(
  head: HTMLElement,
  id: string,
  deps: ProviderBalanceDeps,
  state: ProviderBalanceState,
): void {
  if (state.requested.has(id) || state.inflight.has(id)) return
  state.requested.add(id)
  enqueueRead(head, id, deps, state)
}

/** Put a read on the wire, or hold it until a slot frees up. */
function enqueueRead(
  head: HTMLElement,
  id: string,
  deps: ProviderBalanceDeps,
  state: ProviderBalanceState,
): void {
  if (state.inflight.size >= BALANCE_READ_CONCURRENCY) {
    if (!state.queued.some(read => read.route === id)) state.queued.push({ head, route: id })
    return
  }
  startRead(head, id, deps, state)
}

/** Free a slot and start the next queued read, if any. */
function drainBalanceReads(
  deps: ProviderBalanceDeps,
  state: ProviderBalanceState,
): void {
  while (state.inflight.size < BALANCE_READ_CONCURRENCY && state.queued.length > 0) {
    const next = state.queued.shift()
    if (next === undefined) return
    startRead(next.head, next.route, deps, state)
  }
}

function startRead(
  head: HTMLElement,
  id: string,
  deps: ProviderBalanceDeps,
  state: ProviderBalanceState,
): void {
  state.inflight.add(id)
  setRefreshing(head, id, true)
  const client = deps.client ?? httpBalanceClient
  void client.read(id).then((answer) => {
    if (
      answer.ok &&
      answer.configured !== false &&
      typeof answer.amount === 'number' &&
      Number.isFinite(answer.amount)
    ) {
      state.errors.delete(id)
      const reading: BalanceReading = {
        amount: answer.amount,
        ...(answer.currency === undefined ? {} : { currency: answer.currency }),
      }
      state.readings.set(id, reading)
      if (head.isConnected) paintChip(head, id, reading, deps, state)
      return
    }
    // "Not configured" is the host's explicit answer, not a failure: the route
    // has no balance endpoint, so neither a reading nor an error may survive.
    if (answer.ok && answer.configured === false) {
      state.readings.delete(id)
      state.errors.delete(id)
      if (head.isConnected) removeChip(head)
      return
    }
    // A configured endpoint failed: KEEP the last successful reading — the row
    // keeps showing what it last knew rather than going blank.
    if (answer.configured === true) {
      state.errors.set(id, answer.error ?? '')
    }
    if (head.isConnected) paintFromState(head, id, deps, state)
  }).catch(() => {
    // A transport failure keeps the last value too; nothing to paint.
  }).finally(() => {
    state.inflight.delete(id)
    setRefreshing(head, id, false)
    // The row this read belonged to left the DOM while the answer was in
    // flight: a reopened page has a new row that has not seen this answer yet.
    if (!head.isConnected) deps.repaint?.()
    // A refresh click (or a URL write) landed while this read was in flight:
    // ask again now, for the row that asked, instead of waiting for a reopen.
    if (state.pending.delete(id)) {
      state.requested.delete(id)
      enqueueRead(head, id, deps, state)
    }
    drainBalanceReads(deps, state)
  })
}
