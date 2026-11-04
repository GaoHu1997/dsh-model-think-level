/**
 * The auto-continue preferences live in localStorage, deliberately NOT
 * settings.yaml: sending chat messages on the user's behalf defaults to OFF.
 * The legacy enable key is retained; timing and retry limits use a separate
 * versionable record so existing installations keep their explicit choice.
 *
 * Also here: the per-turn claim preventing two tabs from answering the same
 * interrupted turn. Claims outlive reloads and expire after ten minutes.
 *
 * @module dsh-model-think-level/client/auto-continue-pref
 */

/** localStorage key (own namespace, same convention as the slider pref). */
export const AUTO_CONTINUE_PREF_KEY = 'dsh-model-think-level.auto-continue.enabled'

/** Timing and retry limit, independent of the enable switch. */
export const AUTO_CONTINUE_CONFIG_KEY = 'dsh-model-think-level.auto-continue.config'

/** Bounded, whole-number settings exposed by the advanced-config card. */
export interface AutoContinueConfig {
  readonly waitSeconds: number
  readonly maxRetries: number
}

export const AUTO_CONTINUE_WAIT_MIN = 1
export const AUTO_CONTINUE_WAIT_MAX = 3_600
export const AUTO_CONTINUE_RETRIES_MIN = 1
export const AUTO_CONTINUE_RETRIES_MAX = 100

export const DEFAULT_AUTO_CONTINUE_CONFIG: AutoContinueConfig = Object.freeze({
  waitSeconds: 2,
  maxRetries: 5,
})

/** localStorage key prefix of a per-turn claim, followed by `<sessionId>.<seq>`. */
const CLAIM_PREFIX = 'dsh-model-think-level.auto-continue.claim.'
const CLAIM_TTL_MS = 10 * 60_000

function readStored(key: string): string | null {
  try {
    return window.localStorage.getItem(key)
  } catch {
    return null
  }
}

function boundedInteger(value: unknown, fallback: number, min: number, max: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return fallback
  return Math.min(max, Math.max(min, Math.trunc(value)))
}

/** Validate untrusted storage/input without ever producing an unbounded timer or retry chain. */
export function normalizeAutoContinueConfig(value: unknown): AutoContinueConfig {
  const record = value !== null && typeof value === 'object' ? value as Record<string, unknown> : {}
  return Object.freeze({
    waitSeconds: boundedInteger(record.waitSeconds, DEFAULT_AUTO_CONTINUE_CONFIG.waitSeconds, AUTO_CONTINUE_WAIT_MIN, AUTO_CONTINUE_WAIT_MAX),
    maxRetries: boundedInteger(record.maxRetries, DEFAULT_AUTO_CONTINUE_CONFIG.maxRetries, AUTO_CONTINUE_RETRIES_MIN, AUTO_CONTINUE_RETRIES_MAX),
  })
}

/** Decode an incoming storage value; absent/malformed values restore safe defaults. */
export function parseAutoContinueConfig(value: string | null): AutoContinueConfig {
  try {
    return normalizeAutoContinueConfig(value === null ? undefined : JSON.parse(value))
  } catch {
    return DEFAULT_AUTO_CONTINUE_CONFIG
  }
}

let enabled = readStored(AUTO_CONTINUE_PREF_KEY) === 'true'
let config = parseAutoContinueConfig(readStored(AUTO_CONTINUE_CONFIG_KEY))
const listeners = new Set<() => void>()
const configListeners = new Set<() => void>()

function notify(subscribers: Set<() => void>): void {
  for (const listener of [...subscribers]) listener()
}

/** Snapshot the current preference (default OFF). */
export function autoContinueEnabled(): boolean {
  return enabled
}

/** Stable immutable snapshot, suitable for useSyncExternalStore. */
export function autoContinueConfig(): AutoContinueConfig {
  return config
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
  notify(listeners)
}

/** Save just the requested fields; toggling OFF never discards the configured values. */
export function setAutoContinueConfig(patch: Partial<AutoContinueConfig>): void {
  const next = normalizeAutoContinueConfig({ ...config, ...patch })
  if (config.waitSeconds === next.waitSeconds && config.maxRetries === next.maxRetries) return
  config = next
  try {
    window.localStorage.setItem(AUTO_CONTINUE_CONFIG_KEY, JSON.stringify(next))
  } catch {
    // The current page still follows the choice when storage is unavailable.
  }
  notify(configListeners)
}

/** Apply a value incoming from another tab (the writer already persisted it). */
export function syncAutoContinueEnabled(next: boolean): void {
  if (enabled === next) return
  enabled = next
  notify(listeners)
}

export function syncAutoContinueConfig(next: AutoContinueConfig): void {
  const normalized = normalizeAutoContinueConfig(next)
  if (config.waitSeconds === normalized.waitSeconds && config.maxRetries === normalized.maxRetries) return
  config = normalized
  notify(configListeners)
}

/** Subscribe to enable changes; returns the disposer. */
export function subscribeAutoContinueEnabled(listener: () => void): () => void {
  listeners.add(listener)
  return () => { listeners.delete(listener) }
}

/** Subscribe to timing/retry-limit changes; returns the disposer. */
export function subscribeAutoContinueConfig(listener: () => void): () => void {
  configListeners.add(listener)
  return () => { configListeners.delete(listener) }
}

/**
 * Try to claim one ended turn for THIS tab.
 * @param sessionId - the session the turn belongs to.
 * @param seq - the `turn/end` event's seq, unique per ending.
 * @returns false when another tab already claimed this ending recently.
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
