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
export function observeRequest(b: ChainBudget, e: DurableEventLike): void {
  if (e.seq <= b.seq) return
  b.seq = e.seq
  if (e.type === 'turn/start') {
    if (!b.reserved) b.requests += 1
    b.reserved = false
    b.hasInitial = true
    b.hasStep = false
  } else if (e.type === 'step/start') {
    if (b.hasStep || !b.hasInitial) b.requests += 1
    // Healthy steps before the chain starts belong to the user's turn, not to
    // the failure budget: only a chain already timing (startedAt set by a
    // continue verdict) spends one request per step.
    if (b.startedAt === undefined) b.requests = 1
    if (b.hasStep) b.transientFailures = 0
    b.hasInitial = true
    b.hasStep = true
  } else if (e.type === 'turn/end') {
    if (!b.hasInitial) { b.requests += 1; b.hasInitial = true }
    b.hasInitial = false
    b.reserved = false
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
