/**
 * Regression: a chatty settings host must not starve the renderer.
 *
 * Opening the Models page froze the entire DSH. The chain was a client-side
 * feedback loop:
 *
 *   settings/document-updated
 *     -> refresh (drop the describe snapshot, invalidate the idle fill)
 *     -> idle pass -> describeNamespace(..., { fresh: true })
 *     -> host describe()  -- which EMITS settings/document-updated again
 *     -> ... forever
 *
 * The host emits per entry and again whenever a describe() sees the serialized
 * document move, so the notification stream is not ours to control. These cases
 * hold both halves of the fix to account:
 *
 *  - the idle fill must not answer a notification with a wire read it does not
 *    need (it reads the scope mirror and only touches the wire to fence a write
 *    that the mirror could have gone stale for);
 *  - a notification burst must collapse into a bounded number of refreshes, so
 *    even a host with no mirror cannot starve the page.
 */
// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import { createIdleAutofill } from '../src/client/injection/autofill-run.js'
import { createRefreshScheduler } from '../src/client/refresh-scheduler.js'
import type { RemoteApi, SettingsNamespaceView } from '../src/client/types.js'

const NS = 'llm-pi-ai'
const WINDOW_MS = 900

const sleep = (ms: number): Promise<void> => new Promise(resolve => { setTimeout(resolve, ms) })

interface Tally {
  notifications: number
  refreshes: number
  describes: number
  mutates: number
}

function harness(options: {
  /** A `scope` mirror: the shell's shared describe snapshot. */
  mirror: boolean
  /** `churn` changes the serialized document on every describe (worst case). */
  raw: 'stable' | 'churn'
  /** Start with declarations missing, so the fill has real work to do. */
  pending: boolean
}): Tally {
  const tally: Tally = { notifications: 0, refreshes: 0, describes: 0, mutates: 0 }
  const listeners = new Set<(ns: string) => void>()
  const revisions = new Map<string, { raw: string; revision: number }>()
  // No models at all is the one document `buildAutofillPatch` can never report
  // work for, whatever the knowledge bank holds -- so "nothing to fill" here is
  // exact rather than a bet on the bank's contents.
  const models: unknown[] = options.pending
    ? [{ id: 'gpt-6', name: 'GPT-6', modalities: [] }]
    : []
  const document = (): unknown => ({ providers: { acme: { models } } })

  const describeDocument = (): void => {
    tally.describes++
    const raw = options.raw === 'churn' ? JSON.stringify({ n: tally.describes }) : JSON.stringify({ v: 1 })
    const previous = revisions.get(NS)
    const revision = previous === undefined ? 0 : previous.revision + Number(previous.raw !== raw)
    revisions.set(NS, { raw, revision })
    if (previous === undefined || previous.raw !== raw) {
      for (const fn of listeners) fn(NS)
    }
  }

  const namespace = (): unknown => ({
    ns: NS,
    schema: {},
    value: document(),
    user: document(),
    base: document(),
    revision: revisions.get(NS)?.revision ?? 0,
    applies: 'live',
    secrets: [],
  })

  const api = {
    ...(options.mirror
      ? {
          scope: {
            getSnapshot: () => ({
              status: 'ready',
              revision: revisions.get(NS)?.revision ?? 0,
              value: document(),
              user: document(),
              base: document(),
              writable: true,
            }),
          },
        }
      : {}),
    settings: {
      describe: async (): Promise<unknown> => {
        describeDocument()
        return {
          ok: true,
          value: { writable: true, hasDocument: true, namespaces: [namespace() as SettingsNamespaceView] },
        }
      },
      mutate: async (
        _ns: string,
        ops: Array<{ op: string; path: string[]; value: unknown }>,
      ): Promise<unknown> => {
        tally.mutates++
        // Apply the write for real, so the fill's own patch settles the way it
        // does against the host: the next pass sees nothing left to declare.
        for (const op of ops) {
          if (op.op === 'set' && op.path[0] === 'providers' && op.path[2] === 'models') {
            models.length = 0
            models.push(...(op.value as unknown[]))
          }
        }
        return { ok: true }
      },
    },
  } as unknown as RemoteApi

  const autofill = createIdleAutofill({ api })
  const scheduler = createRefreshScheduler(() => {
    tally.refreshes++
    autofill.invalidate()
    void autofill.run()
  }, 150)

  listeners.add(() => {
    tally.notifications++
    scheduler.schedule()
  })

  // Opening the Models page, then the host keeps talking.
  scheduler.schedule()
  for (let i = 0; i < 25; i++) for (const fn of listeners) fn(NS)

  return tally
}

describe('pushed invalidations cannot starve the renderer', () => {
  it('bounds the work even when the host re-emits on every describe', async () => {
    // Worst case: no mirror to read, and the host serializes a different
    // document every time. Every refresh used to start another one; now the
    // rate is capped however many notifications arrive.
    const tally = harness({ mirror: false, raw: 'churn', pending: true })
    await sleep(WINDOW_MS)
    expect(tally.notifications).toBeGreaterThanOrEqual(25)
    expect(tally.refreshes).toBeLessThanOrEqual(7)
    expect(tally.describes).toBeLessThanOrEqual(7)
    expect(tally.mutates).toBeLessThanOrEqual(7)
  })

  it('stays off the wire entirely when the mirror has nothing to fill', async () => {
    // The shell provides a mirror and the document is already complete: the
    // idle pass answers "is there anything to fill" from the snapshot, so this
    // plugin adds no member to the notification stream and it settles.
    const tally = harness({ mirror: true, raw: 'churn', pending: false })
    await sleep(WINDOW_MS)
    expect(tally.describes).toBe(0)
    expect(tally.mutates).toBe(0)
    expect(tally.refreshes).toBeLessThanOrEqual(7)
  })

  it('reads the wire only to fence a write when the mirror shows work', async () => {
    const tally = harness({ mirror: true, raw: 'churn', pending: true })
    await sleep(WINDOW_MS)
    // The mirror answers the "anything to fill?" question; the wire is read
    // once per write and never once per notification.
    expect(tally.describes).toBeLessThanOrEqual(tally.mutates + tally.refreshes)
    expect(tally.refreshes).toBeLessThanOrEqual(7)
    expect(tally.mutates).toBeLessThanOrEqual(7)
  })
})

describe('createRefreshScheduler', () => {
  it('coalesces a synchronous burst into one refresh', async () => {
    let runs = 0
    const scheduler = createRefreshScheduler(() => { runs++ }, 150)
    for (let i = 0; i < 100; i++) scheduler.schedule()
    await sleep(30)
    expect(runs).toBe(1)
  })

  it('caps the refresh rate while events keep arriving', async () => {
    let runs = 0
    const scheduler = createRefreshScheduler(() => { runs++ }, 150)
    const storm = setInterval(() => scheduler.schedule(), 1)
    await sleep(WINDOW_MS)
    clearInterval(storm)
    await sleep(200)
    // 900ms of storming at a 150ms floor: at most 7 runs, never one per event.
    expect(runs).toBeLessThanOrEqual(7)
    expect(runs).toBeGreaterThan(0)
  })

  it('runs nothing after dispose', async () => {
    let runs = 0
    const scheduler = createRefreshScheduler(() => { runs++ }, 150)
    scheduler.schedule()
    scheduler.dispose()
    await sleep(200)
    expect(runs).toBe(0)
    scheduler.schedule()
    await sleep(200)
    expect(runs).toBe(0)
  })
})
