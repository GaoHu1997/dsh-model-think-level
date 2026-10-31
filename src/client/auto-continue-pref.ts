/**
 * The auto-continue preference: a localStorage-backed enable flag, deliberately
 * NOT settings.yaml — it is a UI preference like the slider toggle, and it
 * sends chat messages on the user's behalf, so it defaults to OFF and turns on
 * only by an explicit switch.
 *
 * Also here: the per-turn CLAIM one tab takes before sending. Two open tabs
 * would each watch the same session and both answer a cut-off turn with
 * 「继续」; the claim (first writer wins, a fresh read losing to a stale one is
 * bounded by the TTL) makes the second tab stand down. The claim outlives a
 * reload on purpose: a page that reopens during the backoff window must not
 * resend for a turn it already claimed.
 *
 * @module dsh-model-think-level/client/auto-continue-pref
 */

/** localStorage key (own namespace, same convention as the slider pref). */
export const AUTO_CONTINUE_PREF_KEY = 'dsh-model-think-level.auto-continue.enabled'

/** localStorage key prefix of a per-turn claim, followed by `<sessionId>.<seq>`. */
const CLAIM_PREFIX = 'dsh-model-think-level.auto-continue.claim.'

/**
 * How long one claim stays valid. Bounds the window another tab must wait out
 * (it simply does not send), and makes a claim left by a dead tab expire: a
 * turn nobody continued for ten minutes is fair game for a fresh attempt.
 */
const CLAIM_TTL_MS = 10 * 60_000

let enabled = read()

function read(): boolean {
  try {
    return window.localStorage.getItem(AUTO_CONTINUE_PREF_KEY) === 'true'
  } catch {
    return false
  }
}

const listeners = new Set<() => void>()

function notify(): void {
  for (const listener of [...listeners]) listener()
}

/** Snapshot the current preference (default OFF). */
export function autoContinueEnabled(): boolean {
  return enabled
}

/** Save the preference (persisted immediately; a failed write keeps the session value). */
export function setAutoContinueEnabled(next: boolean): void {
  if (enabled === next) return
  enabled = next
  try {
    window.localStorage.setItem(AUTO_CONTINUE_PREF_KEY, String(next))
  } catch {
    // The current page still follows the choice when storage is unavailable.
  }
  notify()
}

/** Apply a value incoming from another tab (no persist: the writer already stored it). */
export function syncAutoContinueEnabled(next: boolean): void {
  if (enabled === next) return
  enabled = next
  notify()
}

/** Subscribe to preference changes; returns the disposer. */
export function subscribeAutoContinueEnabled(listener: () => void): () => void {
  listeners.add(listener)
  return () => { listeners.delete(listener) }
}

/**
 * Try to claim one ended turn for THIS tab.
 * @param sessionId - the session the turn belongs to.
 * @param seq - the `turn/end` event's seq, unique per ending.
 * @returns true when this tab holds the claim and may send; false when
 *   another tab claimed it first (or recently enough that its claim stands).
 */
export function claimTurn(sessionId: string, seq: number): boolean {
  const key = `${CLAIM_PREFIX}${sessionId}.${seq}`
  try {
    const existing = window.localStorage.getItem(key)
    if (existing !== null) {
      const at = JSON.parse(existing)
      if (typeof at === 'number' && Number.isFinite(at) && Date.now() - at < CLAIM_TTL_MS) return false
    }
    window.localStorage.setItem(key, JSON.stringify(Date.now()))
    return true
  } catch {
    // Unreadable or unwritable storage: single-tab behaviour, allow the send.
    return true
  }
}
