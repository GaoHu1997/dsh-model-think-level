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
import { disabledProviders, subscribeDisabledProviders, syncDisabledProviders } from './provider-enabled.js'

/** localStorage key of the last local order change (epoch ms; 0 = unstamped). */
export const ORDER_SAVED_AT_KEY = 'dsh-model-think-level.order-saved-at'

/**
 * Floor between a drag and its push. Long enough to fold a keyboard nudge
 * burst into one write, short enough that closing the page right after a drag
 * usually still lands (and `flushOrderSync` covers the rest).
 */
export const ORDER_PUSH_DEBOUNCE_MS = 400

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
let disposed = false
/** True while the stores are being written FROM the file: a change we made, not one to push. */
let adopting = false

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
  void fetch(ORDER_PATH, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body,
  }).then(response => {
    // A refused push clears the identity so the next change retries; the boot
    // arbitrate also repairs it, because the stamp says local is newer.
    if (!response.ok) lastSynced = undefined
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
  writeStamp(Date.now())
  schedulePush(ORDER_PUSH_DEBOUNCE_MS)
}

/** Fold a newer file into the stores. The stores' own notifications follow. */
function adopt(document: OrderDocumentView): void {
  adopting = true
  try {
    setProviderOrder(document.providerOrder)
    adoptModelOrders(document.modelOrder)
    if (document.providersDisabled !== undefined) syncDisabledProviders(document.providersDisabled)
  } finally {
    adopting = false
  }
  writeStamp(document.savedAt)
  lastSynced = contentKey()
}

/**
 * Boot pass: pull the file and arbitrate. Resolves once the decision has been
 * acted on (adoption is synchronous; a push is fire-and-forget).
 */
export async function reconcileOrderSync(): Promise<void> {
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
  }
  if (disposed) return
  const stamp = readStamp()
  if (document !== undefined && hasContent(document) && document.savedAt > stamp) {
    adopt(document)
    return
  }
  // The file is older (or empty, or absent): overwrite it with what we hold —
  // the seed after an upgrade, the repair of a push the last session missed.
  // Same content on both sides (a fresh install included) is nothing to sync.
  const fileContent = JSON.stringify({
    providerOrder: document?.providerOrder ?? [],
    modelOrder: document?.modelOrder ?? {},
    providersDisabled: document?.providersDisabled ?? [],
  })
  if (contentKey() !== fileContent) schedulePush(0)
}

/**
 * Start the sync: the boot pass plus the change subscription. Returns the
 * disposer; a disposed sync stops pushing and ignores the boot answer.
 */
export function startOrderSync(): () => void {
  disposed = false
  const unsubscribeOrders = subscribeProviderOrder(onChange)
  const unsubscribeModels = subscribeModelOrders(onChange)
  const unsubscribeDisabled = subscribeDisabledProviders(onChange)
  void reconcileOrderSync()
  return () => {
    disposed = true
    if (pushTimer !== undefined) clearTimeout(pushTimer)
    pushTimer = undefined
    unsubscribeOrders()
    unsubscribeModels()
    unsubscribeDisabled()
  }
}
