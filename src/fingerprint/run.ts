/**
 * One fingerprint probe: ask one model one challenge, keep its visible answer.
 *
 * This is the only module that touches the harness `llm` service. Everything
 * else in `src/fingerprint/` is pure or filesystem-only, so the whole
 * attribution math stays testable without a live provider.
 *
 * The request shape is deliberately ModelTrace's: one bare user message, no
 * system prompt, no tools. Two deviations are worth naming.
 *
 * - `reasoningEffort` is LEFT UNSET on purpose. ModelTrace calls a plain chat
 *   completion, so the measured behaviour is the model under its own default.
 *   Setting an explicit effort would ask a *different* model behaviour than the
 *   one the fingerprint bank was built from, and the wire vocabulary for "off"
 *   differs per provider (`none`, `minimal`, `null`, or a 400). The plugin's
 *   own default-guard may still materialize one, exactly as it would for a
 *   normal user message -- so the probe measures the model under the plugin's
 *   normal conditions.
 * - Only `text-delta` chunks are collected. `reasoning-delta` is thinking, not
 *   the answer the challenge asks for, and feeding it to {@link parseNumbers}
 *   would pollute the distribution with whatever the model happened to reason
 *   about.
 *
 * @module dsh-model-think-level/fingerprint/run
 */

import { isRecord } from '../shared.js'
import type { Output } from './core.js'

/** The llm surface this probe drives: prepare, then dispatch once. */
export interface ProbeDispatch {
  prepareCall(config: Record<string, unknown>, signal?: unknown): Promise<unknown>
  /**
   * Runtime-level dispatch, used only when a prepared call carries no dispatch
   * of its own. The harness's `PreparedLlmCall` owns `.stream`, which is the
   * preferred half because it is the one that already holds the prepared call's
   * auth and routing.
   */
  stream?(options: Record<string, unknown>): AsyncIterable<unknown>
}

/** What one challenge produced, accepted or not. */
export interface ProbeOutcome {
  /** Zero-based challenge index, matching `generateChallenges` order. */
  index: number
  /** Challenge id, e.g. `probe-1-9f2c41a7b03d12`. */
  challengeId: string
  /** How many integers the challenge asked for. */
  expectedCount: number
  /** Whether a model call completed and produced any visible text. */
  ok: boolean
  /** Visible answer text; empty when `ok` is false. */
  text: string
  /** Failure description, present only when `ok` is false. */
  error?: string
  /** Why the stream stopped, when one was reported. */
  finish?: string
}

/** Everything one model's fingerprint run learned, ready for the bank. */
export interface ProbeRunResult {
  /** Per challenge, in order. */
  outcomes: ProbeOutcome[]
  /** The accepted subset, ready for `analyzeGlobalOutputs`. */
  outputs: Output[]
}

/** One challenge to put to the model. */
export interface ProbeChallenge {
  id: string
  expected_count: number
  prompt: string
}

/** Options for {@link runProbe}. */
export interface RunProbeOptions {
  /** Registered provider route selecting the adapter. */
  provider: string
  /** Exact model id. */
  model: string
  /** Challenges to run, in order. */
  challenges: readonly ProbeChallenge[]
  /** The harness llm service. */
  llm: ProbeDispatch
  /** Caller cancellation; combined with the per-probe timeout. */
  signal?: AbortSignal
  /** Per-challenge timeout in milliseconds. Defaults to 120000. */
  timeoutMs?: number
  /** Sampling cap for one answer. Defaults to 4000. */
  maxTokens?: number
  /**
   * Called as each challenge settles, so a caller can stream progress. Fire
   * order is completion order, which for parallel runs is not `index` order.
   */
  onOutcome?: (outcome: ProbeOutcome) => void
}

/** Default per-challenge timeout: two minutes is generous for 300 integers. */
export const DEFAULT_PROBE_TIMEOUT_MS = 120000

/**
 * Enough room for 292-332 integers plus whatever preamble the model refuses to
 * drop. Parsed-count tolerance (55% of expected) means a truncated answer can
 * still score, but a full run is strictly better.
 */
export const DEFAULT_PROBE_MAX_TOKENS = 4000

/** Call-config fields that must be echoed back to `PreparedLlmCall.stream`. */
const FROZEN_CONFIG_FIELDS = ['reasoningEffort', 'temperature', 'maxTokens', 'stop'] as const

function firstString(record: Record<string, unknown>, key: string): string | undefined {
  const value = record[key]
  return typeof value === 'string' && value.length > 0 ? value : undefined
}

/**
 * Describe a terminal finish chunk for the UI.
 * @param reason - the `finish` chunk's `reason`.
 * @returns a short human phrase, or undefined for a clean stop.
 */
function finishProblem(reason: unknown): { kind: string; message?: string } | undefined {
  if (!isRecord(reason)) return undefined
  const kind = typeof reason['kind'] === 'string' ? reason['kind'] : 'unknown'
  if (kind === 'stop') return undefined
  const failure = reason['failure']
  const message = isRecord(failure) ? firstString(failure, 'message') : undefined
  return message === undefined ? { kind } : { kind, message }
}

/**
 * Read one already-prepared call's frozen config so the dispatch echoes it.
 *
 * `PreparedLlmCall.stream` rejects any request whose call-config fields differ
 * from the prepared config (`INVALID_PREPARED_CALL`). The default-guard may
 * have materialized a `reasoningEffort` during preparation, so echoing the
 * request we *proposed* is not good enough -- echo what was *prepared*.
 *
 * @param prepared - the value `prepareCall` resolved to.
 * @param fallback - the config we proposed, used when no frozen copy exists.
 * @returns the call-config fields to send back.
 */
function frozenConfigOf(prepared: unknown, fallback: Record<string, unknown>): Record<string, unknown> {
  if (!isRecord(prepared)) return fallback
  const config = prepared['config']
  return isRecord(config) ? config : fallback
}

/**
 * Ask one model one challenge and keep its visible answer.
 *
 * Never throws for a provider-side failure: a rejected or empty answer comes
 * back as an outcome with `ok: false`, because one dead challenge must not
 * discard the two that worked. Throws only for programmer errors (no
 * challenges) and for an `AbortSignal` that the *caller* cancelled -- an abort
 * is a decision, not a result.
 *
 * @param options - the run.
 * @returns every outcome in order, plus the accepted subset.
 */
export async function runProbe(options: RunProbeOptions): Promise<ProbeRunResult> {
  const { provider, model, challenges, llm, signal } = options
  if (challenges.length === 0) throw new Error('fingerprint probe: no challenges to run')
  const timeoutMs = options.timeoutMs ?? DEFAULT_PROBE_TIMEOUT_MS
  const maxTokens = options.maxTokens ?? DEFAULT_PROBE_MAX_TOKENS

  // The three challenges go out together (design §5.3): they are independent
  // samples of the same behaviour, so serializing them only triples the wall
  // clock. The per-challenge deadline is what bounds a hung provider.
  const settled = await Promise.all(
    challenges.map(async (challenge, index): Promise<ProbeOutcome> => {
      const outcome = signal?.aborted === true
        ? {
            index,
            challengeId: challenge.id,
            expectedCount: challenge.expected_count,
            ok: false,
            text: '',
            error: 'cancelled',
          } satisfies ProbeOutcome
        : await runChallenge({ ...options, index, challenge, timeoutMs, maxTokens })
      options.onOutcome?.(outcome)
      return outcome
    }),
  )
  const outcomes = [...settled]

  const outputs: Output[] = []
  for (const outcome of outcomes) {
    if (outcome.ok) outputs.push({ text: outcome.text, expected_count: outcome.expectedCount })
  }
  return { outcomes, outputs }
}

interface RunChallengeOptions extends RunProbeOptions {
  index: number
  challenge: ProbeChallenge
  timeoutMs: number
  maxTokens: number
}

async function runChallenge(options: RunChallengeOptions): Promise<ProbeOutcome> {
  const { provider, model, challenge, llm, signal, timeoutMs, maxTokens } = options
  const base = {
    index: options.index,
    challengeId: challenge.id,
    expectedCount: challenge.expected_count,
  }

  const deadline = AbortSignal.timeout(timeoutMs)
  const combined = signal === undefined ? deadline : AbortSignal.any([signal, deadline])

  try {
    const config: Record<string, unknown> = { provider, model, maxTokens }
    const prepared = await llm.prepareCall(config, combined)
    const frozen = frozenConfigOf(prepared, config)

    const request: Record<string, unknown> = {
      provider: frozen['provider'] ?? provider,
      model: frozen['model'] ?? model,
      messages: [{ role: 'user', content: [{ type: 'text', text: challenge.prompt }] }],
      // ModelTrace offers no tools, and the prompt forbids them. Empty is the
      // explicit "none" rather than an omission, so no adapter can project a
      // default toolset into the request.
      tools: [],
      signal: combined,
    }
    for (const field of FROZEN_CONFIG_FIELDS) {
      const value = frozen[field]
      if (typeof value !== 'undefined') request[field] = value
    }

    const onPrepared = (prepared as { stream?: (o: Record<string, unknown>) => AsyncIterable<unknown> }).stream
    const stream = typeof onPrepared === 'function'
      ? onPrepared.bind(prepared)
      : typeof llm.stream === 'function'
        ? llm.stream.bind(llm)
        : undefined
    if (stream === undefined) {
      return { ...base, ok: false, text: '', error: 'the llm service returned no dispatch' }
    }

    let text = ''
    let finish: { kind: string; message?: string } | undefined = { kind: 'stream-ended' }
    for await (const chunk of stream(request)) {
      if (!isRecord(chunk)) continue
      const type = chunk['type']
      if (type === 'text-delta') {
        const delta = chunk['text']
        if (typeof delta === 'string') text += delta
      } else if (type === 'finish') {
        finish = finishProblem(chunk['reason'])
      }
    }

    if (signal?.aborted === true) {
      return { ...base, ok: false, text: '', error: 'cancelled' }
    }
    if (finish !== undefined) {
      const detail = finish.message === undefined ? finish.kind : `${finish.kind}: ${finish.message}`
      return { ...base, ok: false, text: '', error: detail, finish: finish.kind }
    }
    if (text.trim().length === 0) {
      return { ...base, ok: false, text: '', error: 'the model answered with no visible text' }
    }
    return { ...base, ok: true, text }
  } catch (error) {
    if (signal?.aborted === true) {
      return { ...base, ok: false, text: '', error: 'cancelled' }
    }
    return {
      ...base,
      ok: false,
      text: '',
      error: error instanceof Error ? error.message : String(error),
    }
  }
}
