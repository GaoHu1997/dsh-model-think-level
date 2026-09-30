/**
 * The providers the user switched OFF on the Models settings page.
 *
 * The stored value is the DISABLED set, not the enabled one, so an empty — or
 * absent — preference means "everything is on". That direction matters for more
 * than brevity: a route that appears AFTER this preference was written is
 * enabled by default, instead of being hidden by an omission nobody made.
 *
 * The composer's Model switcher reads it to leave those providers out of its
 * provider column; the settings page reads it to draw each row's switch.
 *
 * @module dsh-model-think-level/client/provider-enabled
 */

import { parseProviderOrder } from './provider-order.js'

/** Where the disabled provider ids live. */
export const PROVIDER_DISABLED_KEY = 'dsh-model-think-level.providers.disabled'

const listeners = new Set<() => void>()

/** The disabled ids, as a snapshot whose identity is stable until they change. */
let disabled: readonly string[] = read()

function read(): readonly string[] {
  try {
    return parseProviderOrder(window.localStorage.getItem(PROVIDER_DISABLED_KEY))
  } catch {
    return []
  }
}

/**
 * Parse a stored value. The shape is the provider order's — a deduped list of
 * non-empty ids — so the one parser serves both.
 */
export function parseDisabledProviders(raw: string | null): readonly string[] {
  return parseProviderOrder(raw)
}

/** The disabled provider ids. */
export function disabledProviders(): readonly string[] {
  return disabled
}

/** Whether one provider is switched on — the default for anything unnamed. */
export function isProviderEnabled(id: string): boolean {
  return !disabled.includes(id)
}

/** Switch one provider on or off, and persist the new set. */
export function setProviderEnabled(id: string, enabled: boolean): void {
  const already = !disabled.includes(id)
  if (enabled === already) return
  apply(enabled ? disabled.filter(candidate => candidate !== id) : [...disabled, id], true)
}

/** Apply an external (cross-tab) value without writing it back. */
export function syncDisabledProviders(next: readonly string[]): void {
  apply(next, false)
}

/** Listen for a switch, from this tab or another; returns the unsubscribe. */
export function subscribeDisabledProviders(listener: () => void): () => void {
  listeners.add(listener)
  return () => { listeners.delete(listener) }
}

/** Order is meaningless to a set: a reshuffle is not a change, and not a write. */
function sameSet(left: readonly string[], right: readonly string[]): boolean {
  if (left.length !== right.length) return false
  return left.every(id => right.includes(id))
}

function apply(next: readonly string[], persist: boolean): void {
  if (sameSet(disabled, next)) return
  disabled = [...new Set(next)]
  if (persist) {
    try {
      window.localStorage.setItem(PROVIDER_DISABLED_KEY, JSON.stringify(disabled))
    } catch {
      // A storage that refuses the write (private mode, quota) must not lose
      // the in-memory switch: the user sees the row go off either way.
    }
  }
  // Notify a copy: a listener may unsubscribe while being notified.
  for (const listener of [...listeners]) listener()
}
