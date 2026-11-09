/**
 * The auto-continue decision: which ended turns are worth replying 「继续」
 * to, and which are not.
 *
 * A turn ends for a reason the session log records durably (`turn/end`,
 * merge-extensible `TurnEndReason`). The classes split three ways:
 *
 *   - `continue` — the turn was cut off while it was still working: the
 *     output hit its token ceiling (`max-tokens`), or the model call failed
 *     with a TRANSIENT failure (a disconnect, a timeout, a 5xx, a rate
 *     limit, an empty response). These are the endings a user today
 *     answers with a manual 「继续」; the same reply sent automatically is
 *     meaningful.
 *   - `settled` — the turn reached a safe end on its own: `completed`
 *     (nothing to continue), `aborted` (the user stopped it on purpose),
 *     `blocked` (waiting on the user, e.g. an approval). Never continued,
 *     and each one RESETS the watcher's consecutive-attempt streak — a
 *     finished turn is evidence the session is not stuck.
 *   - `refuse` — continuing cannot help or must not happen: non-transient
 *     failures (auth, quota, an invalid request, a context-window
 *     overflow, anything unclassified), lifecycle closers (`forked`,
 *     `orphaned`), and every future reason vocabulary this file does not
 *     know. Failing CLOSED on the unknown is what keeps the feature from
 *     ever firing blindly.
 *
 * The transient-code set mirrors the harness's own step retry policy
 * (`DEFAULT_RETRYABLE_CODES` in dsh-llm): by the time the turn ends with
 * one of these, the in-step retries are exhausted, so one more nudge is
 * the same thing the user would do by hand. Everything else fails closed.
 *
 * One more meaningfulness gate lives here rather than in the watcher: a
 * turn that logged NO input and NO activity (a `turn/start` closed with
 * nothing under it) has nothing to continue, whatever the reason says.
 *
 * Pure module: no DOM, no services — the watcher feeds it the tail of the
 * session's event window and acts on the verdict.
 *
 * @module dsh-model-think-level/client/auto-continue-rules
 */

/**
 * Consecutive automatic replies allowed before the watcher stands down: a
 * dead provider or a model looping on the output ceiling must not be fed
 * forever. Anything the user sends by hand — and every turn that ends
 * completed, aborted or blocked — resets the streak.
 */
export const MAX_CONSECUTIVE = 5

/** Minimal structural view of one durable session event (`SessionEvent`). */
export interface DurableEventLike {
  readonly type: string
  /** Monotonic sequence number within the session. */
  readonly seq: number
  /** Unix epoch milliseconds, as the host logged it. */
  readonly time?: number
  readonly data?: unknown
}

/** The structured failure facts a `turn/end` `error` reason carries (`LlmFailure`). */
export interface LlmFailureLike {
  readonly message?: unknown
  readonly code?: unknown
  readonly status?: unknown
  readonly providerRetryAfterMs?: unknown
}

/**
 * Failure codes that mean "wait a moment and the same request may succeed":
 * the transient class, mirroring the harness's own retryable set.
 */
export const TRANSIENT_ERROR_CODES: readonly string[] = Object.freeze([
  'EMPTY_RESPONSE',
  'RATE_LIMIT',
  'SERVER',
  'TIMEOUT',
  'TRANSPORT',
])

/**
 * The other codes the settings card can offer. None of them is retried by
 * default: a fresh 「继续」 re-sends the very request that produced them.
 */
export const OTHER_ERROR_CODES: readonly string[] = Object.freeze([
  'PI_AI_ERROR',
  'INVALID_REQUEST',
  'AUTH',
  'LEGACY_CLI_OUTCOME_UNKNOWN',
  'UNSUPPORTED_REASONING_EFFORT',
  'MALFORMED_RESPONSE',
  'UNKNOWN_MODEL',
])

/** Every code the policy can carry, in the settings card's order. */
export const KNOWN_ERROR_CODES: readonly string[] = Object.freeze([
  ...TRANSIENT_ERROR_CODES,
  ...OTHER_ERROR_CODES,
])

/**
 * Which interrupted turns a user wants answered. Stored beside the timing
 * config; fields an old record does not carry fall back to today's
 * behaviour (`max-tokens`, HTTP 408/425/429/5xx, the transient codes), so
 * upgrading never changes what an existing installation retries.
 */
export interface AutoContinuePolicy {
  /** Continue a turn cut off by the output-token ceiling. */
  readonly maxTokens: boolean
  /** Continue an `error` whose structured HTTP status is 408/425/429/5xx. */
  readonly httpStatus: boolean
  /** Per-code decision; only `KNOWN_ERROR_CODES` keys are honoured. */
  readonly codes: Readonly<Record<string, boolean>>
}

function defaultCodes(): Record<string, boolean> {
  const codes: Record<string, boolean> = {}
  for (const code of TRANSIENT_ERROR_CODES) codes[code] = true
  for (const code of OTHER_ERROR_CODES) codes[code] = false
  return codes
}

/** The behaviour in force when no policy was ever saved. */
export const DEFAULT_AUTO_CONTINUE_POLICY: AutoContinuePolicy = Object.freeze({
  maxTokens: true,
  httpStatus: true,
  codes: Object.freeze(defaultCodes()),
})

/** Validate an untrusted policy record, filling every missing field from the default. */
export function normalizeAutoContinuePolicy(value: unknown): AutoContinuePolicy {
  const record = value !== null && typeof value === 'object' ? value as Record<string, unknown> : {}
  const raw = record.codes !== null && typeof record.codes === 'object' ? record.codes as Record<string, unknown> : {}
  const codes = defaultCodes()
  for (const code of KNOWN_ERROR_CODES) {
    const flag = raw[code]
    if (typeof flag === 'boolean') codes[code] = flag
  }
  return Object.freeze({
    maxTokens: typeof record.maxTokens === 'boolean' ? record.maxTokens : DEFAULT_AUTO_CONTINUE_POLICY.maxTokens,
    httpStatus: typeof record.httpStatus === 'boolean' ? record.httpStatus : DEFAULT_AUTO_CONTINUE_POLICY.httpStatus,
    codes: Object.freeze(codes),
  })
}

/**
 * The policy's view of one failure code.
 * `undefined` means the code is outside the vocabulary this file knows —
 * the HTTP-status rule still gets its chance, exactly as before the policy
 * existed.
 */
function policyCodeFlag(code: string, policy: AutoContinuePolicy): boolean | undefined {
  const flag = policy.codes[code]
  if (typeof flag === 'boolean') return flag
  return TRANSIENT_ERROR_CODES.includes(code) ? true : undefined
}

/**
 * HTTP statuses worth one more try when the code alone does not classify:
 * request timeouts, too-early, rate limits, and every server-side class.
 * Every other 4xx is a request problem a 「继续」 cannot repair.
 */
function continuableStatus(status: number): boolean {
  return status === 408 || status === 425 || status === 429 || (status >= 500 && status <= 599)
}

/** What the watcher should do with one ended turn. */
export type TurnEndClass =
  | {
      /** Reply 「继续」 automatically. */
      readonly kind: 'continue'
      /** Which cut-off shape matched. */
      readonly reason: 'max-tokens' | 'transient-error'
      /** Failure code or status the verdict came from (diagnostics only). */
      readonly detail: string
      /** The provider's requested delay, when the failure carried one. */
      readonly waitMs?: number
    }
  | {
      /** Never continue; the streak resets (the turn reached a safe end). */
      readonly kind: 'settled'
      readonly detail: string
    }
  | {
      /** Never continue; the streak does NOT reset (the session is broken). */
      readonly kind: 'refuse'
      readonly detail: string
    }

/** The final turn's events, as the watcher cuts them out of the window. */
export interface TurnTail {
  /** The `turn/end` event that just landed. */
  readonly turnEnd: DurableEventLike
  /** That turn's events, oldest first: everything after the PREVIOUS
   * `turn/end`, this one included. May be short when the window's oldest
   * page boundary falls inside the turn. */
  readonly turnEvents: readonly DurableEventLike[]
}

/** Event types that prove the turn carried input or did work. */
const ACTIVE_EVENT_TYPES: ReadonlySet<string> = new Set([
  'user/message',
  'developer/message',
  'system/message',
  'request/header',
  'request/context',
  'step/start',
  'assistant/message',
  'assistant/attempt',
  'tool/call',
  'tool/result',
])

/**
 * Whether the turn under judgement actually carried input or activity.
 *
 * `'unknown'` covers the paged window: the slice starts at the PREVIOUS
 * turn/end, and when the window's oldest page boundary falls inside this
 * turn the slice holds no `turn/start` — the turn's content sits below the
 * boundary where it cannot be read. That is not evidence of an empty turn,
 * so it must not refuse; the error-class and streak gates still bound it.
 * Only a visible `turn/start` with nothing under it is a proven empty turn.
 */
function turnDidAnything(tail: TurnTail): boolean | 'unknown' {
  let sawStart = false
  for (const event of tail.turnEvents) {
    if (event.type === 'turn/end') continue
    if (event.type === 'turn/start') {
      sawStart = true
      continue
    }
    if (ACTIVE_EVENT_TYPES.has(event.type)) return true
  }
  return sawStart ? false : 'unknown'
}

/** Narrow the unknown `reason` payload to its `kind` string. */
function reasonKindOf(turnEnd: DurableEventLike): string | undefined {
  const data = turnEnd.data
  if (typeof data !== 'object' || data === null) return undefined
  const kind = (data as { reason?: unknown })['reason']
  if (typeof kind !== 'object' || kind === null) return typeof kind === 'string' ? kind : undefined
  const inner = (kind as { kind?: unknown })['kind']
  return typeof inner === 'string' ? inner : undefined
}

/** Narrow the unknown `reason.error` payload to the failure facts. */
function failureOf(turnEnd: DurableEventLike): LlmFailureLike | undefined {
  const data = turnEnd.data
  if (typeof data !== 'object' || data === null) return undefined
  const reason = (data as { reason?: unknown })['reason']
  if (typeof reason !== 'object' || reason === null) return undefined
  const error = (reason as { error?: unknown })['error']
  if (typeof error !== 'object' || error === null) return undefined
  return error as LlmFailureLike
}

/** The provider-requested delay, when it is a usable number. */
function retryAfterOf(failure: LlmFailureLike | undefined): number | undefined {
  const ms = failure?.providerRetryAfterMs
  return typeof ms === 'number' && Number.isFinite(ms) && ms > 0 ? ms : undefined
}

/**
 * Judge one ended turn.
 * @param tail - the final `turn/end` plus that turn's events.
 * @param policy - which interruption classes the user wants answered
 *   (defaults to the behaviour that shipped before the policy existed).
 * @returns what the watcher should do.
 */
export function judgeTurnTail(
  tail: TurnTail,
  policy: AutoContinuePolicy = DEFAULT_AUTO_CONTINUE_POLICY,
): TurnEndClass {
  const kind = reasonKindOf(tail.turnEnd)
  // A PROVEN empty turn (a visible turn/start closed with nothing under it)
  // has nothing to continue, whatever the reason says. An unreadable one
  // (content below the window boundary) keeps the normal path.
  if (turnDidAnything(tail) === false) {
    return { kind: 'refuse', detail: `${kind ?? 'unreadable reason'}: empty turn` }
  }
  switch (kind) {
    case 'max-tokens': {
      // The classic: the step hit its output-token ceiling mid-generation and
      // the turn stopped. A 「继续」 resumes exactly where it stopped.
      if (!policy.maxTokens) return { kind: 'refuse', detail: 'max-tokens (not enabled)' }
      return { kind: 'continue', reason: 'max-tokens', detail: 'max-tokens' }
    }
    case 'error': {
      const failure = failureOf(tail.turnEnd)
      const code = typeof failure?.code === 'string' ? failure.code : undefined
      const status = typeof failure?.status === 'number' ? failure.status : undefined
      if (code !== undefined) {
        const flag = policyCodeFlag(code, policy)
        if (flag === true) {
          const waitMs = retryAfterOf(failure)
          return {
            kind: 'continue',
            reason: 'transient-error',
            detail: code,
            ...(waitMs !== undefined ? { waitMs } : {}),
          }
        }
        // A code the user switched off — or one this build never retried —
        // stops here: the status rule must not override an explicit choice.
        if (flag === false) return { kind: 'refuse', detail: `${code} (not enabled)` }
      }
      if (status !== undefined && policy.httpStatus && continuableStatus(status)) {
        return { kind: 'continue', reason: 'transient-error', detail: `status ${status}` }
      }
      // Auth, quota, invalid requests, context overflow, provider-specific
      // codes, and anything unclassified: a nudge cannot fix these, and a
      // stuck one must not be retried from here.
      return { kind: 'refuse', detail: code ?? (status !== undefined ? `status ${status}` : 'unknown error') }
    }
    case 'completed':
      return { kind: 'settled', detail: 'completed' }
    case 'aborted':
      // The user stopped it on purpose; auto-continuing a stop would fight them.
      return { kind: 'settled', detail: 'aborted' }
    case 'interrupted':
      // The turn was closed while the app went away (a reload, a crash
      // recovery). Nothing is running and nothing failed: the session is at
      // rest, and the streak resets exactly as after `completed`.
      return { kind: 'settled', detail: 'interrupted' }
    case 'blocked':
      // Waiting on the user (an approval, a question): silence is the point.
      return { kind: 'settled', detail: 'blocked' }
    case 'forked':
    case 'orphaned':
      // Lifecycle closers, not live failures: a fork moved elsewhere and an
      // orphaned turn was closed after a crash — never auto-continued.
      return { kind: 'refuse', detail: kind }
    default:
      // The reason map is merge-extensible; a vocabulary this file does not
      // know fails closed.
      return { kind: 'refuse', detail: kind === undefined ? 'unreadable reason' : `unknown reason ${kind}` }
  }
}
