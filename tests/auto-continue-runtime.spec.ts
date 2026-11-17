import { describe, expect, it } from 'vitest'
import { budgetReason, newChainBudget, observeRequest, retryDelay } from '../src/client/injection/auto-continue-runtime.js'
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

  it('counts visible requests once per durable seq and ignores official retry events', () => {
    const b = newChainBudget()
    const events = [event('turn/start', 1), event('step/start', 2), event('llm/retry', 3), event('llm/retry-started', 4)]
    for (const e of [...events, ...events]) observeRequest(b, e)
    expect(b.requests).toBe(1)
    // Official retries are not our chain: they must not spend its request
    // budget or start its duration clock.
    expect(b.startedAt).toBeUndefined()
    observeRequest(b, event('turn/end', 5))
    observeRequest(b, event('turn/start', 6))
    expect(b.requests).toBe(2)
  })

  it('does not spend a failure chain on healthy steps before the first failure', () => {
    const b = newChainBudget()
    for (let seq = 1; seq < 100; seq += 1) observeRequest(b, event('step/start', seq))
    expect(b.requests).toBe(1)
    expect(b.startedAt).toBeUndefined()
    expect(budgetReason(b, config, 0, 1_000_000)).toBeUndefined()
  })

  it('deduplicates a reserved auto-send when its real turn starts', () => {
    const b = newChainBudget()
    b.requests = 2; b.startedAt = 1_000; b.reserved = true; b.hasInitial = true
    observeRequest(b, event('turn/start', 1))
    observeRequest(b, event('step/start', 2))
    expect(b.requests).toBe(2)
  })

  it('reports attempts, requests and duration budgets independently', () => {
    const b = newChainBudget()
    b.requests = 3
    b.startedAt = 1_000
    expect(budgetReason(b, config, 0, 2_000)).toBe('requests')
    expect(budgetReason({ ...b, requests: 0 }, config, 0, 61_000)).toBe('duration')
    expect(budgetReason(b, config, 5, 2_000)).toBe('attempts')
  })
})
