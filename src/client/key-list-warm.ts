/**
 * Revalidating what the last session left on disk.
 *
 * The stored list is what makes an opening instant: the panel paints it before
 * it asks the host anything. It can still be a session old, though — a key
 * deleted on another machine's custody, a route whose addresses moved — so
 * this pass re-reads every stored route once per page opening, well after the
 * first paint and two at a time, and lets the normal write path update the
 * stored copy. Nothing here is user-visible: a slow or refused read is simply
 * the panel's own mount read happening later.
 *
 * Deliberately NOT fed by the panel's click: the panel revalidates what it
 * paints anyway, and two readers racing would double the host's settings reads
 * for one screen. This one only runs while nobody is asking.
 *
 * @module dsh-model-think-level/client/key-list-warm
 */

import type { KeyManagerClient } from './key-manager-client.js'
import { storedKeyLists } from './key-list-store.js'

/** Long enough that the first screen and its interactions are already served. */
const WARM_DELAY_MS = 1_500
/** The host serialises its settings reads; two is the same ceiling the prefetch uses. */
const WARM_CONCURRENCY = 2
/** A page opening warms a handful, not every route ever visited. */
const WARM_LIMIT = 8
/** A list written a minute ago is not stale enough to spend a host read on. */
const WARM_MIN_AGE_MS = 60_000

export interface KeyListWarmOptions {
  /** Delay before the first read, so boot work wins. */
  readonly delayMs?: number
  /** Reads in flight at once. */
  readonly concurrency?: number
  /** Routes warmed per opening, newest first. */
  readonly limit?: number
  /** Only routes older than this are worth re-reading. */
  readonly minAgeMs?: number
  /** Clock, injectable for tests. */
  readonly now?: () => number
}

/**
 * Start the background revalidation of the stored key lists.
 * @param client - transport; only `list` is used.
 * @param options - timing knobs, all optional.
 * @returns a disposer that cancels the pass (a read already on the wire finishes).
 */
export function warmStoredKeyLists(
  client: Pick<KeyManagerClient, 'list'>,
  options: KeyListWarmOptions = {},
): () => void {
  const delayMs = options.delayMs ?? WARM_DELAY_MS
  const concurrency = Math.max(1, options.concurrency ?? WARM_CONCURRENCY)
  const limit = Math.max(1, options.limit ?? WARM_LIMIT)
  const minAgeMs = options.minAgeMs ?? WARM_MIN_AGE_MS
  const now = options.now ?? Date.now

  const at = now()
  const queue = storedKeyLists()
    .filter(entry => at - entry.savedAt >= minAgeMs)
    .slice(0, limit)
    .map(entry => entry.route)

  let cancelled = false
  let running = 0

  const drain = (): void => {
    while (!cancelled && running < concurrency) {
      const route = queue.shift()
      if (route === undefined) return
      running += 1
      // Starting inside a promise also catches a synchronous throw from an
      // older transport; both outcomes release the queue slot.
      void Promise.resolve()
        .then(() => client.list(route, { preferCache: true }))
        .catch(() => undefined)
        .finally(() => {
          running -= 1
          drain()
        })
    }
  }

  const timer = setTimeout(() => {
    if (!cancelled) drain()
  }, delayMs)

  return () => {
    cancelled = true
    clearTimeout(timer)
  }
}
