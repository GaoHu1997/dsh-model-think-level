/**
 * The background fingerprint queue's SCHEDULING: bounded concurrency across
 * models, the rate-limit backoff that drops it to one, and the invariants the
 * pane relies on (queue membership, abort, no stalled pool after a failure).
 *
 * The per-model verdicts and the wire shape are pinned elsewhere; here the
 * senders are manual so the interleavings are deterministic.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { FingerprintRecord } from '../src/fingerprint/verdict.js'
import type { FingerprintRun } from '../src/client/fingerprint-client.js'
import {
  DEFAULT_FINGERPRINT_CONCURRENCY,
  fingerprintRunner,
  teardownFingerprintRunners,
  setFingerprintSender,
  type FingerprintSender,
} from '../src/client/fingerprint-runner.js'

function record(model: string): FingerprintRecord {
  return {
    provider: 'magpie',
    model,
    status: 'identified',
    checkedAt: 1_700_000_000_000,
    usedOutputs: 3,
    prediction: 'gpt-5.5',
    predictionName: 'GPT-5.5',
    probability: 0.9,
    calibration: { queries: 3, cvAccuracy: 1 },
  }
}

/** A deferred answer: the test decides when the run settles and how. */
interface Deferred {
  resolve(answer: { ok: true; record: FingerprintRecord } | { ok: false; error: string }): void
  aborted: boolean
}

/**
 * A sender whose runs answer only when the test releases them. Progress lines
 * go out three at once on release, the way the host's early exit skips the
 * suppressed challenge. Aborting resolves the run as cancelled, the way the
 * real transport does.
 */
function manualSender(): { sender: FingerprintSender; deferreds: Map<string, Deferred> } {
  const deferreds = new Map<string, Deferred>()
  const sender: FingerprintSender = {
    run(_route, model, onLine) {
      let release!: Deferred['resolve']
      const done = new Promise<{ ok: true; record: FingerprintRecord } | { ok: false; error: string }>(
        (resolve) => {
          release = resolve
        },
      )
      const entry: Deferred = { resolve: release, aborted: false }
      deferreds.set(model, entry)
      return {
        done,
        abort: (): void => {
          entry.aborted = true
          release({ ok: false, error: 'cancelled' })
        },
      }
    },
  }
  return { sender, deferreds }
}

/** A sender that resolves every run immediately with the given shape. */
function instantSender(answer: { ok: true; record: FingerprintRecord } | { ok: false; error: string }): {
  sender: FingerprintSender
  launched: string[]
} {
  const launched: string[] = []
  const sender: FingerprintSender = {
    run(_route, model) {
      launched.push(model)
      return { done: Promise.resolve(answer), abort: () => {} }
    },
  }
  return { sender, launched }
}

/** Let microtasks and the backoff timer run out. */
const settle = async (ms = 50): Promise<void> => {
  await new Promise(resolve => setTimeout(resolve, ms))
}

describe('fingerprint runner scheduling', () => {
  let route: string
  let index = 0

  beforeEach(() => {
    index += 1
    route = `fp-runner-${index}`
  })

  afterEach(() => {
    teardownFingerprintRunners()
    vi.restoreAllMocks()
  })

  it('runs two models at once by default and pulls the next when one lands', async () => {
    const { sender, deferreds } = manualSender()
    setFingerprintSender(route, sender)
    const runner = fingerprintRunner(route)
    expect(DEFAULT_FINGERPRINT_CONCURRENCY).toBe(2)

    runner.checkAll(['m1', 'm2', 'm3', 'm4'])
    await settle(0)

    let state = runner.getState()
    expect([...state.running.keys()].sort()).toEqual(['m1', 'm2'])
    expect(state.queued).toEqual(['m3', 'm4'])

    deferreds.get('m1')!.resolve({ ok: true, record: record('m1') })
    await settle(10)
    state = runner.getState()
    expect([...state.running.keys()].sort()).toEqual(['m2', 'm3'])
    expect(state.queued).toEqual(['m4'])

    deferreds.get('m2')!.resolve({ ok: true, record: record('m2') })
    deferreds.get('m3')!.resolve({ ok: true, record: record('m3') })
    await settle(10)
    // m4 only launched once a slot opened for it.
    deferreds.get('m4')!.resolve({ ok: true, record: record('m4') })
    await settle(10)
    expect(runner.idle()).toBe(true)
  })

  it('counts progress per model, capped at the three challenges', async () => {
    let onLine: ((line: { type: 'progress'; index: number; ok: boolean }) => void) | undefined
    const sender: FingerprintSender = {
      run(_route, _model, push) {
        onLine = push
        return { done: new Promise(() => {}), abort: () => {} }
      },
    }
    setFingerprintSender(route, sender)
    const runner = fingerprintRunner(route)

    runner.check('m1')
    await settle(0)
    for (const index of [0, 1, 2, 3]) onLine!({ type: 'progress', index, ok: true })
    await settle(0)
    expect(runner.getState().running.get('m1')).toBe(3)
  })

  it('backs off after a rate-limited failure and drops to one at a time', async () => {
    const { sender, deferreds } = manualSender()
    setFingerprintSender(route, sender)
    const runner = fingerprintRunner(route, { backoffMs: 40 })

    runner.checkAll(['m1', 'm2', 'm3'])
    await settle(0)
    // Two went out together; m1 hits the provider's rate limiter.
    deferreds.get('m1')!.resolve({ ok: false, error: 'fingerprint request failed (429)' })
    await settle(10)

    // While the backoff window runs, nothing new is launched even though m2
    // is still in flight and the queue is non-empty.
    let state = runner.getState()
    expect([...state.running.keys()].sort()).toEqual(['m2'])
    expect(state.queued).toEqual(['m3'])

    // m2 lands inside the window; still nothing launches while it lasts.
    deferreds.get('m2')!.resolve({ ok: true, record: record('m2') })
    await settle(10)
    expect(runner.getState().queued).toEqual(['m3'])
    expect(runner.getState().running.size).toBe(0)

    // The window passes: m3 may go, but alone — the batch is throttled to 1.
    await settle(60)
    state = runner.getState()
    expect([...state.running.keys()]).toEqual(['m3'])
    expect(state.queued).toEqual([])

    deferreds.get('m3')!.resolve({ ok: true, record: record('m3') })
    await settle(10)
    expect(runner.idle()).toBe(true)
  })

  it('resets the throttle and concurrency once the batch drains', async () => {
    const failures = instantSender({ ok: false, error: 'fingerprint request failed (429)' })
    setFingerprintSender(route, failures.sender)
    const runner = fingerprintRunner(route, { backoffMs: 20 })

    runner.checkAll(['m1', 'm2'])
    await settle(80)
    expect(runner.idle()).toBe(true)

    // Next batch starts from the default concurrency again: both launch.
    const again = manualSender()
    setFingerprintSender(route, again.sender)
    runner.checkAll(['m3', 'm4'])
    await settle(10)
    expect([...runner.getState().running.keys()].sort()).toEqual(['m3', 'm4'])
    again.deferreds.get('m3')!.resolve({ ok: true, record: record('m3') })
    again.deferreds.get('m4')!.resolve({ ok: true, record: record('m4') })
  })

  it('keeps draining after a plain failure that is not a rate limit', async () => {
    let call = 0
    const sender: FingerprintSender = {
      run() {
        call += 1
        return {
          done: Promise.resolve(call === 1
            ? { ok: false, error: 'the fingerprint bank is unavailable' }
            : { ok: true, record: record('m2') }),
          abort: () => {},
        }
      },
    }
    setFingerprintSender(route, sender)
    const runner = fingerprintRunner(route, { backoffMs: 5_000 })

    runner.checkAll(['m1', 'm2'])
    await settle(10)
    // No backoff was armed: m2 launched immediately after m1's failure.
    expect(runner.idle()).toBe(true)
  })

  it('reports a transport failure to the pane and still finishes the batch', async () => {
    const failures: string[] = []
    let call = 0
    const sender: FingerprintSender = {
      run() {
        call += 1
        return {
          done: Promise.resolve(call === 1
            ? { ok: false, error: 'connection dropped' }
            : { ok: true, record: record('m2') }),
          abort: () => {},
        }
      },
    }
    setFingerprintSender(route, sender)
    const runner = fingerprintRunner(route)
    runner.onFailure((model, error) => failures.push(`${model}: ${error}`))

    runner.checkAll(['m1', 'm2'])
    await settle(10)
    expect(failures).toEqual(['m1: connection dropped'])
    expect(runner.idle()).toBe(true)
  })

  it('abort clears the queue, the running set and every in-flight handle', async () => {
    const { sender, deferreds } = manualSender()
    setFingerprintSender(route, sender)
    const runner = fingerprintRunner(route)

    runner.checkAll(['m1', 'm2', 'm3'])
    await settle(0)
    runner.abort()
    await settle(10)

    expect(runner.getState()).toEqual({ running: new Map(), queued: [] })
    expect(deferreds.get('m1')!.aborted).toBe(true)
    expect(deferreds.get('m2')!.aborted).toBe(true)
    // m3 never launched; abort leaves nothing pending, and the runOne tails of
    // the cancelled pair must not resurrect queue entries.
    expect(runner.idle()).toBe(true)
  })

  it('ignores a duplicate check for a running or queued model', async () => {
    const { sender, deferreds } = manualSender()
    setFingerprintSender(route, sender)
    const runner = fingerprintRunner(route)

    runner.check('m1')
    runner.check('m1')
    runner.checkAll(['m1', 'm2'])
    await settle(0)
    expect([...runner.getState().running.keys()]).toEqual(['m1'])
    expect(runner.getState().queued).toEqual(['m2'])
    deferreds.get('m1')!.resolve({ ok: true, record: record('m1') })
    await settle(10)
    // m2 launched only after m1 landed — the duplicate checks never queued it twice.
    expect([...runner.getState().running.keys()]).toEqual(['m2'])
    deferreds.get('m2')!.resolve({ ok: true, record: record('m2') })
  })

  it('stops dead once disposed even if a run settles late', async () => {
    const { sender, deferreds } = manualSender()
    setFingerprintSender(route, sender)
    const runner = fingerprintRunner(route)
    const records: string[] = []
    runner.onRecord(entry => records.push(entry.model))

    runner.check('m1')
    await settle(0)
    runner.dispose()
    deferreds.get('m1')!.resolve({ ok: true, record: record('m1') })
    await settle(10)
    expect(records).toEqual([])
    expect(runner.idle()).toBe(true)
  })

  it('keeps a stale in-flight FingerprintRun handle type compatible', async () => {
    // Type-level pin: the sender seam still returns abortable runs.
    const sender: FingerprintSender = {
      run(): FingerprintRun {
        return { done: Promise.resolve({ ok: true, record: record('m1') }), abort: () => {} }
      },
    }
    setFingerprintSender(route, sender)
    const runner = fingerprintRunner(route)
    runner.check('m1')
    await settle(10)
    expect(runner.idle()).toBe(true)
  })
})
