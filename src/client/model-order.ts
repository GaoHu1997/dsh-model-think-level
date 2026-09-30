/**
 * The per-provider model-order preference: the sequence the user set by dragging
 * the model rows inside one provider's editor on the official Models page.
 *
 * One storage key holds every provider's sequence, keyed by the provider id the
 * provider rows already use (`data-bre-provider`, or the Edit button's route) —
 * the same id space as `provider-order.ts`, so a provider renamed in the
 * switcher keeps its models' order.
 *
 * localStorage, for the same reason the provider order is: this is a UI
 * ordering, not a wire setting. The official editor renders
 * `models.map((model, index) => <ModelRow position={index + 1} />)`, so the row
 * an index names is not something we can rewrite through the settings API (and
 * a reorder there would renumber every `aria-label` on the page). The rows are
 * placed with CSS `order` instead, and the composer switcher reads the same
 * sequences.
 *
 * @module dsh-model-think-level/client/model-order
 */

import { mergeProviderOrder } from './provider-order.js'

/** localStorage key (own namespace; the upstream plugin's keys stay untouched). */
export const MODEL_ORDER_KEY = 'dsh-model-think-level.model-order'

/** Every provider's stored sequence, by provider id. */
export type ModelOrderMap = Readonly<Record<string, readonly string[]>>

/** Parse a stored/announced payload into a usable map. */
export function parseModelOrders(raw: string | null): ModelOrderMap {
  if (raw === null) return {}
  try {
    const parsed: unknown = JSON.parse(raw)
    if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) return {}
    const map: Record<string, readonly string[]> = {}
    for (const [provider, value] of Object.entries(parsed as Record<string, unknown>)) {
      if (provider.length === 0 || !Array.isArray(value)) continue
      const ids = dedupe(value.filter((entry): entry is string => typeof entry === 'string'))
      // A provider with no nameable model left is not an order: keeping it would
      // pin the provider's rows to slots they can no longer hold.
      if (ids.length > 0) map[provider] = ids
    }
    return map
  } catch {
    return {}
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

let orders: ModelOrderMap = (() => {
  try {
    return parseModelOrders(window.localStorage.getItem(MODEL_ORDER_KEY))
  } catch {
    // No storage (a private window, a non-DOM host): the ordering still works
    // for this page, it just does not survive a reload.
    return {}
  }
})()

const listeners = new Set<() => void>()

function notify(): void {
  for (const listener of [...listeners]) listener()
}

function sameIds(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length && left.every((id, index) => id === right[index])
}

function persist(): void {
  try {
    window.localStorage.setItem(MODEL_ORDER_KEY, JSON.stringify(orders))
  } catch {
    // The current page still follows the new order when storage is unavailable.
  }
}

/**
 * Snapshot every stored sequence. The returned object identity is stable until
 * some provider's order changes, which is what makes it a legal
 * `useSyncExternalStore` snapshot for a component that shows one provider.
 */
export function modelOrders(): ModelOrderMap {
  return orders
}

/** One provider's stored sequence (empty when the user has never dragged its models). */
export function modelOrderOf(provider: string): readonly string[] {
  return orders[provider] ?? EMPTY
}

/** A shared empty sequence, so a never-dragged provider returns a stable value. */
const EMPTY: readonly string[] = []

/** Save one provider's sequence (persisted immediately; a failed write keeps the session value). */
export function setModelOrder(provider: string, next: readonly string[]): void {
  if (provider.length === 0) return
  const ids = dedupe(next)
  const current = modelOrderOf(provider)
  // An exact no-op keeps the snapshot identity, and with it every subscriber's
  // render, untouched — a drag that lands a row where it already was.
  if (sameIds(current, ids) && (ids.length > 0 || !(provider in orders))) return
  const map: Record<string, readonly string[]> = { ...orders }
  if (ids.length === 0) delete map[provider]
  else map[provider] = ids
  orders = map
  persist()
  notify()
}

/** Apply a map incoming from another tab (no persist: the writer already stored it). */
export function syncModelOrders(next: ModelOrderMap): void {
  orders = next
  notify()
}

/** Subscribe to order changes; returns the disposer. */
export function subscribeModelOrders(listener: () => void): () => void {
  listeners.add(listener)
  return () => { listeners.delete(listener) }
}

/**
 * Fold one provider's sequence into the ids the editor currently renders: the
 * ids the preference names are permuted among the slots they occupy, and a model
 * the user has never dragged (a newly added one) keeps the position it holds.
 */
export function orderModels(ids: readonly string[], preferred: readonly string[]): readonly string[] {
  return mergeProviderOrder(ids, preferred)
}

/** The effective order of a provider's `ids`: the dragged sequence where it applies. */
export function resolveModelOrder(provider: string, ids: readonly string[]): readonly string[] {
  return mergeProviderOrder(ids, modelOrderOf(provider))
}

/**
 * The same fold for a caller holding whole model entries rather than ids — the
 * composer switcher renders the directory's own objects, and must not rebuild
 * them. An entry whose id the preference does not name keeps its position, so a
 * model the user has never dragged (a newly added one) does not jump.
 */
export function orderModelEntries<T extends { readonly id: string }>(
  entries: readonly T[],
  preferred: readonly string[],
): readonly T[] {
  if (entries.length === 0 || preferred.length === 0) return entries
  const byId = new Map(entries.map(entry => [entry.id, entry]))
  return orderModels(entries.map(entry => entry.id), preferred).map(id => byId.get(id) as T)
}

/** Drop everything one provider stored (used when its last model is removed). */
export function clearModelOrder(provider: string): void {
  setModelOrder(provider, [])
}
