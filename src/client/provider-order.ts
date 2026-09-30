/**
 * The provider-order preference: the sequence the user set by dragging the
 * provider rows on the official Models settings page.
 *
 * Deliberately localStorage, like the slider preference and for the same
 * reason: this is a UI ordering, not a wire setting. It is also the ONLY place
 * the order can live. The Models page's row order is not the `providers` key
 * order — `dsh-llm-pi-ai`'s `directoryEntries()` builds the configurable-
 * provider directory as "every installed catalog route, then the routes the
 * profiles declare", and the page keeps that declaration order (pinning
 * `deepseek-account`/`deepseek-official` first). Rewriting the dict would not
 * move a single row, and the settings write vocabulary
 * (`{ op: 'set' | 'unset' }`) has no reorder op to rewrite it with. So the
 * order lives beside the page: the rows are placed with CSS `order`, and the
 * composer model switcher reads the very same sequence.
 *
 * @module dsh-model-think-level/client/provider-order
 */

/** localStorage key (own namespace; the upstream plugin's keys stay untouched). */
export const PROVIDER_ORDER_KEY = 'dsh-model-think-level.provider-order'

/**
 * The two routes the official Models page always pins to the top, in this
 * order (its own `joinProviderDirectory` sort, matched here so the composer
 * switcher mirrors the page before the user has dragged anything).
 */
const PINNED: readonly string[] = ['deepseek-account', 'deepseek-official']

/** Parse a stored/announced payload into a usable id sequence. */
export function parseProviderOrder(raw: string | null): readonly string[] {
  if (raw === null) return []
  try {
    const parsed: unknown = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    return dedupe(parsed.filter((value): value is string => typeof value === 'string'))
  } catch {
    return []
  }
}

/** Drop empty and repeated ids, keeping the first occurrence's position. */
function dedupe(ids: readonly string[]): string[] {
  const seen = new Set<string>()
  const kept: string[] = []
  for (const id of ids) {
    if (id.length === 0 || seen.has(id)) continue
    seen.add(id)
    kept.push(id)
  }
  return kept
}

let order: readonly string[] = (() => {
  try {
    return parseProviderOrder(window.localStorage.getItem(PROVIDER_ORDER_KEY))
  } catch {
    // No storage (a private window, a non-DOM host): the ordering still works
    // for this page, it just does not survive a reload.
    return []
  }
})()

const listeners = new Set<() => void>()

function notify(): void {
  for (const listener of [...listeners]) listener()
}

function sameOrder(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length && left.every((id, index) => id === right[index])
}

/**
 * Snapshot the current sequence. The returned array identity is stable until
 * the order changes, which is what makes it a legal `useSyncExternalStore`
 * snapshot.
 */
export function providerOrder(): readonly string[] {
  return order
}

/** Save the sequence (persisted immediately; a failed write keeps the session value). */
export function setProviderOrder(next: readonly string[]): void {
  const deduped = dedupe(next)
  if (sameOrder(order, deduped)) return
  order = deduped
  try {
    window.localStorage.setItem(PROVIDER_ORDER_KEY, JSON.stringify(order))
  } catch {
    // The current page still follows the new order when storage is unavailable.
  }
  notify()
}

/** Apply a sequence incoming from another tab (no persist: the writer already stored it). */
export function syncProviderOrder(next: readonly string[]): void {
  const deduped = dedupe(next)
  if (sameOrder(order, deduped)) return
  order = deduped
  notify()
}

/** Subscribe to order changes; returns the disposer. */
export function subscribeProviderOrder(listener: () => void): () => void {
  listeners.add(listener)
  return () => { listeners.delete(listener) }
}

/**
 * The order the official Models page itself renders `ids` in: the two pinned
 * routes first, everything else in the order it arrived (a stable sort, exactly
 * like the page's `toSorted`).
 */
export function baseProviderOrder(ids: readonly string[]): readonly string[] {
  const rank = (id: string): number => {
    const pinned = PINNED.indexOf(id)
    return pinned < 0 ? PINNED.length : pinned
  }
  return ids
    .map((id, index) => ({ id, index, rank: rank(id) }))
    .sort((left, right) => left.rank - right.rank || left.index - right.index)
    .map(entry => entry.id)
}

/**
 * Fold the user's sequence into a base order: the ids the preference names are
 * permuted among the slots they occupy, and every other id keeps the slot it
 * already had. A provider the user has never seen therefore keeps its natural
 * position instead of being exiled to the end.
 */
export function mergeProviderOrder(
  base: readonly string[],
  preferred: readonly string[],
): readonly string[] {
  const rank = new Map<string, number>()
  for (const id of preferred) if (!rank.has(id)) rank.set(id, rank.size)
  const slots: number[] = []
  const named: string[] = []
  base.forEach((id, index) => {
    if (!rank.has(id)) return
    slots.push(index)
    named.push(id)
  })
  named.sort((left, right) => (rank.get(left) as number) - (rank.get(right) as number))
  const merged = [...base]
  slots.forEach((slot, position) => { merged[slot] = named[position] as string })
  return merged
}

/**
 * The effective order of `ids`: the dragged sequence where it applies, the
 * official page's own order everywhere else.
 */
export function resolveProviderOrder(ids: readonly string[]): readonly string[] {
  return mergeProviderOrder(baseProviderOrder(ids), providerOrder())
}

/**
 * Move `item` so it ends up at index `toIndex` of the result. The index is
 * interpreted against the RESULT, not the input, so a caller that derived it
 * from the row the pointer is over lands where the user pointed.
 */
export function moveToIndex<T>(items: readonly T[], item: T, toIndex: number): T[] {
  const from = items.indexOf(item)
  if (from < 0) return [...items]
  const next = [...items]
  next.splice(from, 1)
  const target = Math.max(0, Math.min(next.length, toIndex))
  next.splice(target, 0, item)
  return next
}
