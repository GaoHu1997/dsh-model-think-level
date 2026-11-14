import { describe, expect, it } from 'vitest'
import { budgetReason, newChainBudget, observeRequest, providerRetryOf, retryDelay } from '../src/client/injection/auto-continue-runtime.js'
import type { DurableEventLike } from '../src/client/auto-continue-rules.js'

const event = (type: string, seq: number, data?: unknown): DurableEventLike => ({ type, seq, time: 1_000, data })
const config = { maxRetries: 5, maxRequests: 3, maxChainMinutes: 1 }

describe('auto-continue runtime helpers', () => {
  it('doubles consecutive failures, bounds jitter and preserves base/provider floors', () => {
    expect(retryDelay(2_000, 1, true, undefined, 0)).toBe(2_000)
    expect(retryDelay(2_000, 2, true, undefined, 0.5)).toBe(4_000)
    expect(retryDelay(2_000, 3, true, undefined, 0)).toBe(7_200)
    expect(retryDelay(2_000, 3, true, undefined, 1)).toBe(8_800)
    expect(retryDelay(2_000, 50, true, undefined, 1)).toBe(120_000)
    expect(retryDelay(200_000, 50, true, undefined, 0)).toBe(200_000)
    expect(retryDelay(2_000, 2, true, 20_000, 0)).toBe(20_000)
    expect(retryDelay(2_000, 20, false, undefined, 1)).toBe(2_000)
    expect(retryDelay(2_000, 20, false, 900_000, 1)).toBe(900_000)
  })

  it('counts initial requests and retry-started exactly once per durable seq', () => {
    const b = newChainBudget()
    const events = [event('turn/start', 1), event('step/start', 2), event('llm/retry', 3), event('llm/retry-started', 4)]
    for (const e of [...events, ...events]) observeRequest(b, e, 2_000)
    expect(b.requests).toBe(2)
    expect(b.startedAt).toBe(1_000)
    observeRequest(b, event('llm/retry-started', 5), 2_000)
    expect(budgetReason(b, config, 0, 2_000)).toBe('requests')
  })

  it('does not spend a failure chain on healthy steps before the first failure', () => {
    const b = newChainBudget()
    for (let seq = 1; seq < 100; seq += 1) observeRequest(b, event('step/start', seq), 2_000)
    expect(b.requests).toBe(1)
    expect(b.startedAt).toBeUndefined()
    expect(budgetReason(b, config, 0, 1_000_000)).toBeUndefined()
  })

  it('deduplicates a reserved auto-send when its real turn starts', () => {
    const b = newChainBudget()
    b.requests = 2; b.startedAt = 1_000; b.reserved = true; b.hasInitial = true
    observeRequest(b, event('turn/start', 1), 2_000)
    observeRequest(b, event('step/start', 2), 2_000)
    expect(b.requests).toBe(2)
  })

  it('recovers an initial request when only retry events are visible', () => {
    const b = newChainBudget()
    observeRequest(b, event('llm/retry-started', 20), 2_000)
    expect(b.requests).toBe(2)
    expect(budgetReason(b, config, 0, 61_000)).toBe('duration')
    expect(budgetReason(b, config, 5, 2_000)).toBe('attempts')
  })

  it('observes the latest current retry and its matching started event', () => {
    const retry = event('llm/retry', 2, { retryId: 'a', turn: 1, step: 1, retry: 2, delayMs: 5_000 })
    const events = [event('turn/start', 1, { turn: 1 }), retry]
    expect(providerRetryOf(events, true)).toEqual({ retry: 2, waitMs: 5_000, nextSendAt: 6_000 })
    expect(providerRetryOf([...events, event('llm/retry-started', 3, { retryId: 'other', retry: 2 })], true)?.waitMs).toBe(5_000)
    expect(providerRetryOf([...events, event('llm/retry-started', 3, { retryId: 'a', retry: 2 })], true)?.waitMs).toBe(0)
    expect(providerRetryOf(events, false)).toBeUndefined()
  })

  it('ignores retries attributed to a historical turn or an older step', () => {
    expect(providerRetryOf([
      event('turn/start', 1, { turn: 2 }),
      event('llm/retry', 2, { turn: 1, retry: 2, delayMs: 500 }),
    ], true)).toBeUndefined()
    expect(providerRetryOf([
      event('turn/start', 1, { turn: 2 }), event('step/start', 2, { turn: 2, step: 3 }),
      event('llm/retry', 3, { turn: 2, step: 2, retry: 2, delayMs: 500 }),
    ], true)).toBeUndefined()
  })

  it.each(['turn/end', 'turn/start', 'step/start', 'assistant/message'])('does not resurface historical retry after %s', (type) => {
    const events = [event('llm/retry', 1, { retry: 1, retryId: 'a', delayMs: 5_000 }), event(type, 2)]
    expect(providerRetryOf(events, true)).toBeUndefined()
  })
})
