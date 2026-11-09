/**
 * The failure-detail preference: whether the chat renders a 「查看详情」 seat on
 * each official failure row. Lives in localStorage beside the other client-side
 * switches (never settings.yaml), and defaults to ON — the whole point of the
 * seat is to stop the client from swallowing the provider's own error.
 *
 * @module dsh-model-think-level/client/error-detail-pref
 */

/** localStorage key (own namespace, same convention as the slider pref). */
export const ERROR_DETAIL_PREF_KEY = 'dsh-model-think-level.error-detail.enabled'

function readStored(key: string): string | null {
  try {
    return window.localStorage.getItem(key)
  } catch {
    return null
  }
}

/** Only the literal 'false' turns it off; absent or malformed values mean ON. */
let enabled = readStored(ERROR_DETAIL_PREF_KEY) !== 'false'
const listeners = new Set<() => void>()

function notify(): void {
  for (const listener of [...listeners]) listener()
}

/** Snapshot the current preference (default ON). */
export function errorDetailEnabled(): boolean {
  return enabled
}

/** Save the preference (persisted immediately; a failed write keeps the session value). */
export function setErrorDetailEnabled(next: boolean): void {
  if (enabled === next) return
  enabled = next
  try {
    window.localStorage.setItem(ERROR_DETAIL_PREF_KEY, String(next))
  } catch {
    // The current page still follows the choice when storage is unavailable.
  }
  notify()
}

/** Apply a value incoming from another tab (the writer already persisted it). */
export function syncErrorDetailEnabled(next: boolean): void {
  if (enabled === next) return
  enabled = next
  notify()
}

/** Subscribe to enable/disable changes; returns the unsubscribe seam. */
export function subscribeErrorDetailEnabled(listener: () => void): () => void {
  listeners.add(listener)
  return () => { listeners.delete(listener) }
}
