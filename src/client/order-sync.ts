/**
 * The order document's sync: the browser half's provider/model orderings
 * mirrored into the host's `ui-order.json` (ORDER_PATH).
 *
 * localStorage — the live stores' medium (provider-order.ts / model-order.ts)
 * — is per-install and does not travel; the file does. The sync is a two-way
 * last-writer-wins fold, arbitrated by the `savedAt` stamp each side carries:
 *
 *   - Every local ORDER CHANGE is stamped into localStorage immediately (not
 *     when the push lands), so a page closed inside the debounce window still
 *     reads as the newer side at the next boot and pushes what it holds.
 *   - Boot pulls the file: a file newer than the local stamp is ADOPTED into
 *     the stores (and with them into localStorage, so the page and the
 *     composer follow without a reload); an older or absent file is
 *     overwritten by the local state — the seed after an upgrade, and the
 *     repair when a previous push never landed.
 *   - Every change is pushed, debounced, so a drag burst lands as one write;
 *     an adoption schedules nothing (the content already matches).
 *
 * The file holds no secrets — provider routes and model ids only — which is
 * what makes it safe to point a sync tool at. Every fetch failure is silent:
 * the local stores keep working, and the next boot reconciles.
 *
 * @module dsh-model-think-level/client/order-sync
 */

import { ORDER_PATH } from '../constants.js'
import { providerOrder, setProviderOrder, subscribeProviderOrder } from './provider-order.js'
import { adoptModelOrders, modelOrders, subscribeModelOrders } from './model-order.js'
import { adoptDisabledProviders, disabledProviders, subscribeDisabledProviders } from './provider-enabled.js'

/** localStorage key of the last local order change (epoch ms; 0 = unstamped). */
export const ORDER_SAVED_AT_KEY = 'dsh-model-think-level.order-saved-at'

/**
 * Floor between a drag and its push. Long enough to fold a keyboard nudge
 * burst into one write, short enough that closing the page right after a drag
 * usually still lands (and `flushOrderSync` covers the rest).
 */
export const ORDER_PUSH_DEBOUNCE_MS = 400

/**
 * How often a visible page asks the host for the document again. The file is
 * written by whichever machine synced last, so a page that only pulled at boot
 * would keep showing the old order (and the old switches) until a reload. One
 * GET a minute per open tab is cheap; `focus`/`visibilitychange` pull sooner.
 */
export const ORDER_POLL_MS = 60_000

/** The wire shape of the order document (declared here; the host parses its own). */
export interface OrderDocumentView {
  savedAt: number
  providerOrder: readonly string[]
  modelOrder: Readonly<Record<string, readonly string[]>>
  /**
   * The disabled set the document carries, or `undefined` when it names none —
   * which is not the same as naming an empty one: an explicit empty array is a
   * real "everything is on" a newer file can hold over a local disabled row,
   * while an absent field is an old writer that never knew the field, and must
   * not clear what this machine has.
   */
  providersDisabled: readonly string[] | undefined
}

/** An id sequence, cleaned and de-duplicated keeping the first occurrence. */
function sanitizeIds(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  const seen = new Set<string>()
  const kept: string[] = []
  for (const entry of value) {
    if (typeof entry !== 'string') continue
    const id = entry.trim()
    if (id.length === 0 || seen.has(id)) continue
    seen.add(id)
    kept.push(id)
  }
  return kept
}

/** Every provider's sequence, dropping empty providers and empty sequences. */
function sanitizeMap(value: unknown): Record<string, readonly string[]> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return {}
  const map: Record<string, readonly string[]> = {}
  for (const [provider, entry] of Object.entries(value as Record<string, unknown>)) {
    if (provider.length === 0) continue
    const ids = sanitizeIds(entry)
    if (ids.length > 0) map[provider] = ids
  }
  return map
}

/** The GET body's `data`, cleaned; undefined when it names no document. */
function sanitizeDocument(raw: unknown): OrderDocumentView | undefined {
  if (typeof raw !== 'object' || raw === null) return undefined
  const record = raw as Record<string, unknown>
  return {
    savedAt: typeof record['savedAt'] === 'number' && Number.isFinite(record['savedAt']) ? record['savedAt'] : 0,
    providerOrder: sanitizeIds(record['providerOrder']),
    modelOrder: sanitizeMap(record['modelOrder']),
    providersDisabled: Array.isArray(record['providersDisabled']) ? sanitizeIds(record['providersDisabled']) : undefined,
  }
}

/** Whether a document names any ordering at all. */
function hasContent(document: OrderDocumentView): boolean {
  return document.providerOrder.length > 0
    || Object.keys(document.modelOrder).length > 0
    || document.providersDisabled !== undefined
}

function readStamp(): number {
  try {
    const raw = window.localStorage.getItem(ORDER_SAVED_AT_KEY)
    const at = raw === null ? 0 : Number(raw)
    return Number.isFinite(at) && at > 0 ? at : 0
  } catch {
    return 0
  }
}

function writeStamp(at: number): void {
  try {
    window.localStorage.setItem(ORDER_SAVED_AT_KEY, String(at))
  } catch {
    // No storage: the boot arbitrate then always favours the file, which is
    // the honest reading of "this session never stamped anything".
  }
}

/** The order content only — the stamp moves per push, so it is not part of the identity. */
function contentKey(): string {
  return JSON.stringify({ providerOrder: providerOrder(), modelOrder: modelOrders(), providersDisabled: disabledProviders() })
}

let lastSynced: string | undefined
let pushTimer: ReturnType<typeof setTimeout> | undefined
/** The periodic pull and the focus listener, while a sync is running. */
let pollTimer: ReturnType<typeof setInterval> | undefined
let stopListening: (() => void) | undefined
let disposed = false
/** True while the stores are being written FROM the file: a change we made, not one to push. */
let adopting = false
/** True while a reconcile's GET is in flight: a poll and a focus event must not ask twice. */
let reconciling = false
/**
 * Bumped on every start and on dispose. A push's answer (or a reconcile's)
 * belongs to the generation that asked; a page that was torn down and rebuilt
 * must not fold a late answer from its predecessor into the new stores.
 */
let generation = 0

/** A stamp strictly newer than the stored one, so a push always beats what it replaces. */
function nextStamp(): number {
  const at = Math.max(Date.now(), readStamp() + 1)
  writeStamp(at)
  return at
}

function pushNow(): void {
  pushTimer = undefined
  if (disposed) return
  // The stamp the change already wrote, not the push time: a successful push
  // must leave file.savedAt EQUAL to the local stamp, so the next boot reads
  // "same" instead of re-adopting this machine's own write.
  const stamp = readStamp()
  const body = JSON.stringify({
    savedAt: stamp > 0 ? stamp : Date.now(),
    providerOrder: providerOrder(),
    modelOrder: modelOrders(),
    providersDisabled: disabledProviders(),
  })
  lastSynced = contentKey()
  const mine = generation
  void fetch(ORDER_PATH, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body,
  }).then(async response => {
    if (disposed || mine !== generation) return
    const answer = await response.json().catch(() => undefined) as Record<string, unknown> | undefined
    const document = sanitizeDocument(answer?.['data'])
    // 409: the host holds a document at least as new as this push, and it differs.
    // This page never saw it (another machine wrote it) — adopt what won instead
    // of pushing the old order and switches back over it.
    if (response.status === 409) {
      if (document !== undefined && hasContent(document)) adopt(document)
      else lastSynced = undefined
      return
    }
    // A refused push clears the identity so the next change retries; the boot
    // arbitrate also repairs it, because the stamp says local is newer.
    if (!response.ok) {
      lastSynced = undefined
      return
    }
    // The host answers with the document as stored. Fold in a newer stamp it
    // may carry (never ours, which it just accepted) so the next boot agrees.
    if (document !== undefined && document.savedAt > readStamp()) writeStamp(document.savedAt)
  }).catch(() => {
    lastSynced = undefined
  })
}

function schedulePush(delayMs: number): void {
  if (disposed || pushTimer !== undefined) return
  // An adoption (or a push) just wrote this content; pushing it back would
  // only round-trip the file to itself.
  if (contentKey() === lastSynced) return
  pushTimer = setTimeout(pushNow, delayMs)
}

/**
 * Push any pending change immediately — the pagehide flush. A drag landing
 * inside the debounce window would otherwise stay local until the next boot.
 * The pending timer is cancelled with it: one change, one push.
 */
export function flushOrderSync(): void {
  if (pushTimer !== undefined) {
    clearTimeout(pushTimer)
    pushNow()
  }
}

/** One local change: stamp it now, push it soon. */
function onChange(): void {
  if (disposed || adopting) return
  nextStamp()
  schedulePush(ORDER_PUSH_DEBOUNCE_MS)
}

/** Fold a newer file into the stores. The stores' own notifications follow. */
function adopt(document: OrderDocumentView): void {
  adopting = true
  try {
    setProviderOrder(document.providerOrder)
    adoptModelOrders(document.modelOrder)
    // Persisted, not merely applied: see adoptDisabledProviders. A value that
    // only lives in the running page comes back as the old one after a reload,
    // and the next reconcile then pushes that old one over the file.
    if (document.providersDisabled !== undefined) adoptDisabledProviders(document.providersDisabled)
  } finally {
    adopting = false
  }
  writeStamp(document.savedAt)
  lastSynced = contentKey()
}

/**
 * Boot pass (and every later pull): fetch the file and arbitrate. Resolves once
 * the decision has been acted on (adoption is synchronous; a push is
 * fire-and-forget).
 */
export async function reconcileOrderSync(): Promise<void> {
  if (disposed || reconciling) return
  reconciling = true
  const mine = generation
  let document: OrderDocumentView | undefined
  try {
    const response = await fetch(ORDER_PATH, { method: 'GET' })
    if (response.ok) {
      const body = (await response.json()) as Record<string, unknown>
      if (body['ok'] === true) document = sanitizeDocument(body['data'])
    }
  } catch {
    // No host on this origin (or offline): the local stores stand alone.
    return
  } finally {
    reconciling = false
  }
  if (disposed || mine !== generation) return
  // A local change is already queued and stamped newer than anything the file
  // can hold; pulling now would only race the push that is about to land.
  if (pushTimer !== undefined) return
  const stamp = readStamp()
  const fileContent = JSON.stringify({
    providerOrder: document?.providerOrder ?? [],
    modelOrder: document?.modelOrder ?? {},
    providersDisabled: document?.providersDisabled ?? [],
  })
  if (document !== undefined && hasContent(document)) {
    if (document.savedAt > stamp) {
      adopt(document)
      return
    }
    // The same instant with different content cannot be arbitrated by the
    // stamp: move ours one millisecond ahead so the push below is strictly
    // newer, instead of bouncing off the host's stale guard forever.
    if (document.savedAt === stamp && contentKey() !== fileContent) writeStamp(nextStamp())
  }
  // The file is older (or empty, or absent): overwrite it with what we hold —
  // the seed after an upgrade, the repair of a push the last session missed.
  // Same content on both sides (a fresh install included) is nothing to sync.
  if (contentKey() !== fileContent) schedulePush(0)
}

/** Ask the host again, unless the page is hidden (a background tab has no reader). */
function poll(): void {
  if (disposed) return
  if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return
  void reconcileOrderSync()
}

/**
 * Start the sync: the boot pass, the change subscription, and the pulls that
 * make another machine's write show up without a reload — a visible page on a
 * timer, plus `focus`/`visibilitychange` for the moment someone comes back to
 * the tab. Returns the disposer; a disposed sync stops pushing, stops pulling
 * and ignores answers already in flight.
 */
export function startOrderSync(): () => void {
  disposed = false
  generation += 1
  const unsubscribeOrders = subscribeProviderOrder(onChange)
  const unsubscribeModels = subscribeModelOrders(onChange)
  const unsubscribeDisabled = subscribeDisabledProviders(onChange)
  pollTimer = setInterval(poll, ORDER_POLL_MS)
  if (typeof window !== 'undefined') window.addEventListener('focus', poll)
  if (typeof document !== 'undefined') {
    const onVisibility = (): void => { if (document.visibilityState === 'visible') poll() }
    document.addEventListener('visibilitychange', onVisibility)
    stopListening = () => {
      document.removeEventListener('visibilitychange', onVisibility)
      if (typeof window !== 'undefined') window.removeEventListener('focus', poll)
    }
  }
  void reconcileOrderSync()
  return () => {
    disposed = true
    generation += 1
    if (pushTimer !== undefined) clearTimeout(pushTimer)
    pushTimer = undefined
    if (pollTimer !== undefined) clearInterval(pollTimer)
    pollTimer = undefined
    stopListening?.()
    stopListening = undefined
    unsubscribeOrders()
    unsubscribeModels()
    unsubscribeDisabled()
  }
}
