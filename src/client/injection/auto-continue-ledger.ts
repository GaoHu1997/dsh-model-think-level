export interface AutoContinueLedger {
  readonly version: 1
  readonly savedAt: number
  readonly seq: number
  readonly lastUserSeq: number
  readonly lastHandledTurnEndSeq: number
  readonly consecutive: number
  readonly requests: number
  readonly startedAt?: number
  readonly transientFailures: number
  readonly reserved: boolean
  readonly hasInitial: boolean
  readonly hasStep: boolean
  readonly lastAutoSentAt: number
  readonly lastAutoSentText?: string
  readonly muted: boolean
}

const VERSION = 1 as const
const TTL_MS = 24 * 60 * 60 * 1_000
const MAX_TEXT = 256
const PREFIX = 'dsh-model-think-level.auto-continue.ledger.'

function key(sessionId: string): string {
  return `${PREFIX}${encodeURIComponent(sessionId)}`
}

function finite(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback
}

function decode(value: unknown, now: number): AutoContinueLedger | undefined {
  if (value === null || typeof value !== 'object') return undefined
  const r = value as Record<string, unknown>
  if (r.version !== VERSION) return undefined
  const savedAt = finite(r.savedAt, 0)
  if (savedAt <= 0 || now - savedAt < 0 || now - savedAt > TTL_MS) return undefined
  const text = typeof r.lastAutoSentText === 'string' ? r.lastAutoSentText.slice(0, MAX_TEXT) : undefined
  return {
    version: VERSION,
    savedAt,
    seq: Math.max(0, Math.trunc(finite(r.seq, 0))),
    lastUserSeq: Math.max(0, Math.trunc(finite(r.lastUserSeq, 0))),
    lastHandledTurnEndSeq: Math.max(0, Math.trunc(finite(r.lastHandledTurnEndSeq, 0))),
    consecutive: Math.max(0, Math.trunc(finite(r.consecutive, 0))),
    requests: Math.max(0, Math.trunc(finite(r.requests, 0))),
    ...(finite(r.startedAt, 0) > 0 ? { startedAt: finite(r.startedAt, 0) } : {}),
    transientFailures: Math.max(0, Math.trunc(finite(r.transientFailures, 0))),
    reserved: r.reserved === true,
    hasInitial: r.hasInitial === true,
    hasStep: r.hasStep === true,
    lastAutoSentAt: Math.max(0, finite(r.lastAutoSentAt, 0)),
    ...(text === undefined ? {} : { lastAutoSentText: text }),
    muted: r.muted === true,
  }
}

/** Missing/failed storage is deliberately undefined, not a zero-budget guarantee. */
export function loadAutoContinueLedger(sessionId: string, now = Date.now()): AutoContinueLedger | undefined {
  try {
    const raw = window.localStorage.getItem(key(sessionId))
    if (raw === null) return undefined
    const decoded = decode(JSON.parse(raw), now)
    if (decoded === undefined) window.localStorage.removeItem(key(sessionId))
    return decoded
  } catch {
    return undefined
  }
}

/** Persist one bounded session ledger; false means durability was not obtained. */
export function saveAutoContinueLedger(sessionId: string, value: Omit<AutoContinueLedger, 'version' | 'savedAt'>, now = Date.now()): boolean {
  try {
    const record: AutoContinueLedger = {
      ...value,
      version: VERSION,
      savedAt: now,
      lastAutoSentText: value.lastAutoSentText?.slice(0, MAX_TEXT),
    }
    window.localStorage.setItem(key(sessionId), JSON.stringify(record))
    const entries: Array<{ key: string; savedAt: number }> = []
    for (let i = 0; i < window.localStorage.length; i += 1) {
      const k = window.localStorage.key(i)
      if (k === null || !k.startsWith(PREFIX)) continue
      let candidate: AutoContinueLedger | undefined
      try { candidate = decode(JSON.parse(window.localStorage.getItem(k) ?? 'null'), now) } catch { /* invalid record */ }
      if (candidate === undefined) entries.push({ key: k, savedAt: 0 })
      else entries.push({ key: k, savedAt: candidate.savedAt })
    }
    entries.sort((a, b) => b.savedAt - a.savedAt)
    for (let i = 0; i < entries.length; i += 1) {
      const entry = entries[i]!
      if (entry.savedAt === 0 || i >= 128) window.localStorage.removeItem(entry.key)
    }
    return true
  } catch {
    return false
  }
}

export function clearAutoContinueLedger(sessionId: string): boolean {
  try {
    window.localStorage.removeItem(key(sessionId))
    return true
  } catch {
    return false
  }
}

export const AUTO_CONTINUE_LEDGER_TTL_MS = TTL_MS
export const AUTO_CONTINUE_LEDGER_PREFIX = PREFIX
