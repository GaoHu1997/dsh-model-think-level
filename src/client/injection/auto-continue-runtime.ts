import type { DurableEventLike } from '../auto-continue-rules.js'

export type ExhaustedReason = 'attempts' | 'requests' | 'duration'

/** Constant-space visible-history ledger. Paged-out events and old hosts without
 * retry events cannot reveal all requests; counts are a lower bound. Never
 * synthesize session events or imply this ledger can stop host-owned requests. */
export interface ChainBudget {
  seq: number
  requests: number
  startedAt: number | undefined
  transientFailures: number
  hasInitial: boolean
  hasStep: boolean
  reserved: boolean
}
export function newChainBudget(seq = 0): ChainBudget {
  return { seq, requests: 0, startedAt: undefined, transientFailures: 0, hasInitial: false, hasStep: false, reserved: false }
}
export function observeRequest(b: ChainBudget, e: DurableEventLike, now: number): void {
  if (e.seq <= b.seq) return
  b.seq = e.seq
  if (e.type === 'turn/start') {
    if (!b.reserved) b.requests += 1
    b.reserved = false
    b.hasInitial = true
    b.hasStep = false
  } else if (e.type === 'step/start') {
    if (b.hasStep || !b.hasInitial) b.requests += 1
    if (b.startedAt === undefined) b.requests = 1
    if (b.hasStep) b.transientFailures = 0
    b.hasInitial = true
    b.hasStep = true
  } else if (e.type === 'llm/retry' || e.type === 'llm/retry-started' || e.type === 'turn/end') {
    if (!b.hasInitial) { b.requests += 1; b.hasInitial = true }
    if (e.type === 'llm/retry-started') b.requests += 1
    if (e.type !== 'turn/end') b.startedAt ??= typeof e.time === 'number' && Number.isFinite(e.time) ? e.time : now
    else { b.hasInitial = false; b.reserved = false }
  }
}
export function budgetReason(b: ChainBudget, config: { maxRetries: number; maxRequests?: number; maxChainMinutes?: number }, attempts: number, now: number): ExhaustedReason | undefined {
  if (attempts >= config.maxRetries) return 'attempts'
  if (b.requests >= (config.maxRequests ?? 36)) return 'requests'
  if (b.startedAt !== undefined && now - b.startedAt >= (config.maxChainMinutes ?? 30) * 60_000) return 'duration'
  return undefined
}
export function retryDelay(base: number, failures: number, backoff: boolean, retryAfter: number | undefined, random: number): number {
  const localCap = Math.max(base, 120_000)
  const providerFloor = Number.isFinite(retryAfter) ? Math.max(0, retryAfter!) : 0
  const exponential = backoff ? Math.min(localCap, base * 2 ** Math.min(30, Math.max(0, failures - 1))) : base
  const localDelay = exponential * (failures > 1 && backoff ? 0.9 + Math.max(0, Math.min(1, random)) * 0.2 : 1)
  return Math.max(base, providerFloor, Math.min(localCap, localDelay))
}
/** Inspect only the latest unfinished turn; a settled historical retry is silent. */
export function providerRetryOf(events: readonly DurableEventLike[], running: boolean): { retry: number; nextSendAt: number; waitMs: number } | undefined {
  if (!running) return undefined
  let retry: DurableEventLike | undefined
  let started = false
  let latestStep: unknown
  let activeTurn: unknown
  let closed = false
  for (const e of events) {
    const data = e.data as Record<string, unknown> | undefined
    if (e.type === 'turn/start' || e.type === 'turn/end' || e.type === 'step/start') {
      retry = undefined; started = false; latestStep = data?.step
    }
    if (e.type === 'turn/start') { activeTurn = data?.turn; closed = false }
    if (e.type === 'turn/end') { activeTurn = data?.turn; closed = true }
    if (e.type === 'llm/retry') {
      if (closed || (activeTurn !== undefined && data?.turn !== activeTurn)) continue
      if (latestStep !== undefined && data?.step !== latestStep) continue
      retry = e; started = false
    }
    if (e.type === 'llm/retry-started' && retry !== undefined) {
      const previous = retry.data as Record<string, unknown>
      if (data?.retryId === previous.retryId && data?.retry === previous.retry) started = true
    }
    if (e.type === 'assistant/message') retry = undefined
  }
  if (retry === undefined) return undefined
  const data = retry.data as Record<string, unknown>
  if (typeof data?.retry !== 'number' || !Number.isFinite(data.retry)) return undefined
  const waitMs = !started && typeof data.delayMs === 'number' && Number.isFinite(data.delayMs) ? Math.max(0, data.delayMs) : 0
  return { retry: data.retry, waitMs, nextSendAt: waitMs > 0 && typeof retry.time === 'number' ? retry.time + waitMs : 0 }
}
