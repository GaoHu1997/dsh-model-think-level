// @vitest-environment jsdom
/**
 * The auto-continue watcher: a cut-off turn of the CURRENT session gets one
 * automatic 「继续」, a finished/stopped/unfixable one gets nothing.
 *
 * The fixture is a fake sessions/uiSession pair (the structural faces the
 * watcher probes) with one binding whose snapshot, event window and prompt
 * the test drives directly. The evaluation is deliberately timed: the
 * running edge waits for the durable turn/end, the send waits out its
 * backoff, and fake timers walk both.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  setAutoContinueEnabled, setAutoContinueConfig, DEFAULT_AUTO_CONTINUE_CONFIG, autoContinueConfig,
} from '../src/client/auto-continue-pref.js'
import { createAutoContinue } from '../src/client/injection/auto-continue-run.js'
import type { DurableEventLike } from '../src/client/auto-continue-rules.js'

/** One durable event with the minimal shape the watcher reads. */
function event(type: string, seq: number, data?: unknown): DurableEventLike {
  // `time` rides the (fake) wall clock: echo attribution compares it against
  // the moment the watcher sent, so the two must share one clock.
  return { type, seq, time: Date.now(), ...(data === undefined ? {} : { data }) }
}

interface PromptCall {
  readonly content: readonly { readonly type: string; readonly text: string }[]
  readonly mode: string
}

type PromptAnswer = { ok: true } | { ok: false; error: { code: string; message: string } }

/** One fake session binding: snapshot, window, listeners, prompt record. */
function makeBinding(sessionId: string) {
  const listeners = new Set<() => void>()
  const windowListeners = new Set<() => void>()
  const entries: { type: string; event?: DurableEventLike }[] = []
  const prompts: PromptCall[] = []
  let promptAnswer: PromptAnswer = { ok: true }
  let deferredResponse: Promise<PromptAnswer> | undefined
  const snap = { running: false, pendingSubmissions: [] as unknown[], openState: 'open' }
  const binding = {
    sessionId,
    session: {
      getSnapshot: () => ({ ...snap, pendingSubmissions: [...snap.pendingSubmissions] }),
      subscribe: (fn: () => void) => { listeners.add(fn); return () => { listeners.delete(fn) } },
      prompt: async (content: PromptCall['content'], mode: 'queue' | 'steer') => {
        prompts.push({ content: [...content], mode })
        const response = deferredResponse
        deferredResponse = undefined
        return response ?? promptAnswer
      },
    },
    eventSource: {
      getSnapshot: () => ({ entries: [...entries], hasMore: false }),
      subscribe: (fn: () => void) => { windowListeners.add(fn); return () => { windowListeners.delete(fn) } },
    },
    /** Host-side helper: append one durable event and publish. */
    append(type: string, seq: number, data?: unknown): void {
      entries.push({ type: 'event', event: event(type, seq, data) })
      for (const fn of [...windowListeners]) fn()
    },
    /** Host-side helper: flip running, optionally coalescing away its notification. */
    setRunning(running: boolean, publish = true): void {
      snap.running = running
      if (publish) for (const fn of [...listeners]) fn()
    },
    setPending(pending: unknown[]): void {
      snap.pendingSubmissions = pending
      for (const fn of [...listeners]) fn()
    },
    setOpenState(openState: string): void {
      snap.openState = openState
      for (const fn of [...listeners]) fn()
    },
    deferNextPrompt(): { resolve: (answer: PromptAnswer) => void; reject: (error: Error) => void } {
      let resolve!: (answer: PromptAnswer) => void
      let reject!: (error: Error) => void
      deferredResponse = new Promise<PromptAnswer>((accept, fail) => { resolve = accept; reject = fail })
      return { resolve, reject }
    },
    refuseNextPrompt(): void {
      promptAnswer = { ok: false, error: { code: 'gateway/x', message: 'transport dead' } }
    },
    prompts,
  }
  return binding
}

type Binding = ReturnType<typeof makeBinding>

/** The fake service seats + runner one test drives. */
function makeHarness() {
  const bindings = new Map<string, Binding>()
  let currentId: string | undefined
  const sessions = {
    binding: (id: string) => bindings.get(id),
    list: { getSnapshot: () => ({ byId: {} }) },
  }
  const uiSession = { adapter: { current: { getSnapshot: () => ({ key: currentId }) } } }
  const ctx = {
    get: (name: string) => (name === 'sessions' ? sessions : name === 'uiSession' ? uiSession : undefined),
    on: (_event: string, _listener: () => void) => () => {},
  }
  const t = (key: string): string => (key === 'autoContinueMessage' ? '继续' : key)
  const runner = createAutoContinue({ ctx, t })
  const setCurrent = (id: string | undefined): void => { currentId = id }
  return { bindings, runner, setCurrent }
}

/** The dispose every test needs, even the ones that never armed a session. */
let disposer: (() => void) | undefined

afterEach(() => {
  disposer?.()
  disposer = undefined
  vi.useRealTimers()
  window.localStorage.clear()
  document.body.innerHTML = ''
})

/** Drive one failed-turn cycle: the turn ends and the watcher reacts.
 * The send advance covers the whole backoff ladder (max 30s), so the same
 * helper serves every position of a streak. */
async function failTurn(
  binding: Binding,
  seq: number,
  reason: Record<string, unknown>,
  events: Array<[string, number, unknown?]> = [],
): Promise<void> {
  for (const [type, eventSeq, data] of events) binding.append(type, eventSeq, data)
  binding.append('turn/end', seq, { turn: 1, reason })
  binding.setRunning(true)
  binding.setRunning(false)
  await vi.advanceTimersByTimeAsync(500)
  // Observe the echo near the actual send, not 33 seconds after a fixed 2s wait.
  await vi.advanceTimersByTimeAsync(autoContinueConfig().waitSeconds * 1_000)
}

/** Attach a live session and arm one eligible ending without consuming its send delay. */
async function scheduledCutoff(reason: Record<string, unknown> = { kind: 'max-tokens' }): Promise<Binding> {
  const harness = makeHarness()
  disposer = harness.runner.dispose
  const binding = makeBinding('s1')
  harness.bindings.set('s1', binding)
  harness.setCurrent('s1')
  binding.append('user/message', 1, { id: 'm1', content: [{ type: 'text', text: '长任务' }] })
  binding.setRunning(true)
  await vi.advanceTimersByTimeAsync(1_100)
  binding.append('turn/end', 2, { turn: 1, reason })
  binding.setRunning(false)
  await vi.advanceTimersByTimeAsync(500)
  return binding
}

describe('auto-continue watcher', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    setAutoContinueEnabled(true)
    setAutoContinueConfig(DEFAULT_AUTO_CONTINUE_CONFIG)
  })

  it('replies 继续 to a transport-disconnected turn it watched live', async () => {
    const harness = makeHarness()
    disposer = harness.runner.dispose
    const binding = makeBinding('s1')
    harness.bindings.set('s1', binding)
    harness.setCurrent('s1')
    // Attach while the turn is running; the ending below is observed live.
    binding.append('turn/start', 1, { turn: 1 })
    binding.append('user/message', 2, { id: 'mx', role: 'user', source: 'session', content: [{ type: 'text', text: '写个爬虫' }] })
    binding.append('assistant/message', 3, { turn: 1, step: 1, message: { id: 'a3', role: 'assistant', source: 'model', content: [{ type: 'text', text: '好的，先…' }] }, stream: [] })
    binding.setRunning(true)
    await vi.advanceTimersByTimeAsync(1_100)

    binding.append('turn/end', 4, { turn: 1, reason: { kind: 'error', error: { message: 'other side closed', code: 'TRANSPORT' } } })
    binding.setRunning(false)
    await vi.advanceTimersByTimeAsync(500)
    expect(binding.prompts).toHaveLength(0)
    // The send rides its 2s base delay, measured from the evaluation.
    await vi.advanceTimersByTimeAsync(2_600)
    expect(binding.prompts).toHaveLength(1)
    expect(binding.prompts[0]).toMatchObject({ mode: 'queue', content: [{ type: 'text', text: '继续' }] })
  })

  it('uses the configured wait on every retry, without doubling it', async () => {
    setAutoContinueConfig({ waitSeconds: 7 })
    const binding = await scheduledCutoff()
    await vi.advanceTimersByTimeAsync(6_999)
    expect(binding.prompts).toHaveLength(0)
    await vi.advanceTimersByTimeAsync(1)
    expect(binding.prompts).toHaveLength(1)
    binding.append('turn/end', 3, { turn: 2, reason: { kind: 'max-tokens' } })
    binding.setRunning(true)
    binding.setRunning(false)
    await vi.advanceTimersByTimeAsync(500)
    await vi.advanceTimersByTimeAsync(6_999)
    expect(binding.prompts).toHaveLength(1)
    await vi.advanceTimersByTimeAsync(1)
    expect(binding.prompts).toHaveLength(2)
  })

  it.each([1, 3, 8])('stops after the configured %i retries, not a fixed five', async (maxRetries) => {
    setAutoContinueConfig({ maxRetries })
    const binding = await scheduledCutoff()
    await vi.advanceTimersByTimeAsync(2_000)
    for (let seq = 3; seq < maxRetries + 5; seq += 1) {
      await failTurn(binding, seq, { kind: 'max-tokens' })
    }
    expect(binding.prompts).toHaveLength(maxRetries)
    binding.append('user/message', maxRetries + 6, { id: 'manual', content: [{ type: 'text', text: '再试试' }] })
    await failTurn(binding, maxRetries + 7, { kind: 'max-tokens' })
    expect(binding.prompts).toHaveLength(maxRetries + 1)
  })

  it('applies a wait edit to an armed retry from the original wait start', async () => {
    setAutoContinueConfig({ waitSeconds: 10 })
    const binding = await scheduledCutoff()
    await vi.advanceTimersByTimeAsync(5_000)
    setAutoContinueConfig({ waitSeconds: 20 })
    await vi.advanceTimersByTimeAsync(14_999)
    expect(binding.prompts).toHaveLength(0)
    await vi.advanceTimersByTimeAsync(1)
    expect(binding.prompts).toHaveLength(1)
  })

  it('cancels an armed retry when its newly lowered cap is already reached', async () => {
    const binding = await scheduledCutoff()
    await vi.advanceTimersByTimeAsync(2_000)
    binding.append('turn/end', 3, { turn: 2, reason: { kind: 'max-tokens' } })
    binding.setRunning(true)
    binding.setRunning(false)
    await vi.advanceTimersByTimeAsync(500)
    setAutoContinueConfig({ maxRetries: 1 })
    await vi.advanceTimersByTimeAsync(10_000)
    expect(binding.prompts).toHaveLength(1)
    // Raising the cap does not replay the canceled old ending.
    setAutoContinueConfig({ maxRetries: 4 })
    await vi.advanceTimersByTimeAsync(10_000)
    expect(binding.prompts).toHaveLength(1)
  })

  it.each([
    [2, 10_000, 10_000],
    [300, 200_000, 300_000],
    [2, 200_000, 120_000],
  ])('respects wait=%i seconds and provider Retry-After=%i ms', async (waitSeconds, providerRetryAfterMs, delay) => {
    setAutoContinueConfig({ waitSeconds })
    const binding = await scheduledCutoff({ kind: 'error', error: { code: 'RATE_LIMIT', providerRetryAfterMs } })
    await vi.advanceTimersByTimeAsync(delay - 1)
    expect(binding.prompts).toHaveLength(0)
    await vi.advanceTimersByTimeAsync(1)
    expect(binding.prompts).toHaveLength(1)
  })

  it('does not revive an old pending retry by switching off and back on', async () => {
    const binding = await scheduledCutoff()
    setAutoContinueEnabled(false)
    setAutoContinueEnabled(true)
    await vi.advanceTimersByTimeAsync(10_000)
    expect(binding.prompts).toHaveLength(0)
  })

  it('cancels a pending retry as soon as the user submits a manual message', async () => {
    const binding = await scheduledCutoff()
    binding.append('user/message', 3, { id: 'manual', content: [{ type: 'text', text: '等等，别继续' }] })
    await vi.advanceTimersByTimeAsync(10_000)
    expect(binding.prompts).toHaveLength(0)
  })

  it('keeps an old retry canceled after a manual submission leaves the queue', async () => {
    const binding = await scheduledCutoff()
    binding.setPending([{ text: '继续' }])
    binding.setPending([])
    await vi.advanceTimersByTimeAsync(10_000)
    expect(binding.prompts).toHaveLength(0)
  })

  it('keeps an unevaluated ending canceled after a manual submission leaves the queue', async () => {
    const harness = makeHarness()
    disposer = harness.runner.dispose
    const binding = makeBinding('s1')
    harness.bindings.set('s1', binding)
    harness.setCurrent('s1')
    binding.setRunning(true)
    await vi.advanceTimersByTimeAsync(1_100)
    binding.append('turn/end', 2, { turn: 1, reason: { kind: 'max-tokens' } })
    binding.setRunning(false)
    binding.setPending([{ text: '继续' }])
    binding.setPending([])
    await vi.advanceTimersByTimeAsync(10_000)
    expect(binding.prompts).toHaveLength(0)
  })

  it('keeps an old retry canceled after a new run starts and returns to idle', async () => {
    const binding = await scheduledCutoff()
    binding.setRunning(true)
    binding.setRunning(false)
    await vi.advanceTimersByTimeAsync(10_000)
    expect(binding.prompts).toHaveLength(0)
  })

  it('does not arm an old ending when a manual continue arrives before evaluation', async () => {
    const harness = makeHarness()
    disposer = harness.runner.dispose
    const binding = makeBinding('s1')
    harness.bindings.set('s1', binding)
    harness.setCurrent('s1')
    binding.setRunning(true)
    await vi.advanceTimersByTimeAsync(1_100)
    binding.append('turn/end', 2, { turn: 1, reason: { kind: 'max-tokens' } })
    binding.setRunning(false)
    binding.append('user/message', 3, { id: 'manual', content: [{ type: 'text', text: '继续' }] })
    await vi.advanceTimersByTimeAsync(10_000)
    expect(binding.prompts).toHaveLength(0)
  })

  it('cancels a second retry when the user sends continue after the automatic echo', async () => {
    const binding = await scheduledCutoff()
    await vi.advanceTimersByTimeAsync(autoContinueConfig().waitSeconds * 1_000)
    expect(binding.prompts).toHaveLength(1)
    binding.append('user/message', 3, { id: 'auto', content: [{ type: 'text', text: '继续' }] })
    binding.setRunning(true)
    binding.append('turn/end', 4, { turn: 2, reason: { kind: 'max-tokens' } })
    binding.setRunning(false)
    await vi.advanceTimersByTimeAsync(500)
    binding.append('user/message', 5, { id: 'manual', content: [{ type: 'text', text: '继续' }] })
    await vi.advanceTimersByTimeAsync(10_000)
    expect(binding.prompts).toHaveLength(1)
  })

  it('answers a max-tokens cut-off too', async () => {
    const harness = makeHarness()
    disposer = harness.runner.dispose
    const binding = makeBinding('s1')
    harness.bindings.set('s1', binding)
    harness.setCurrent('s1')
    binding.append('user/message', 1, { id: 'mx', role: 'user', source: 'session', content: [{ type: 'text', text: '写个长文档' }] })
    binding.setRunning(true)
    await vi.advanceTimersByTimeAsync(1_100)
    await failTurn(binding, 2, { kind: 'max-tokens' })
    expect(binding.prompts).toHaveLength(1)
  })
  it('resumes a fresh unanswered failure when an existing session is opened', async () => {
    const harness = makeHarness()
    disposer = harness.runner.dispose
    const binding = makeBinding('s1')
    harness.bindings.set('s1', binding)
    binding.append('user/message', 1, { id: 'mx', role: 'user', source: 'session', content: [{ type: 'text', text: '旧任务' }] })
    binding.append('turn/end', 2, { turn: 1, reason: { kind: 'error', error: { message: '429 rate limited', code: 'RATE_LIMIT' } } })
    harness.setCurrent('s1')
    await vi.advanceTimersByTimeAsync(1_100)
    await vi.advanceTimersByTimeAsync(autoContinueConfig().waitSeconds * 1_000 + 1_000)
    expect(binding.prompts).toHaveLength(1)
  })

  it('ignores endings older than the recovery window', async () => {
    const harness = makeHarness()
    disposer = harness.runner.dispose
    const binding = makeBinding('s1')
    harness.bindings.set('s1', binding)
    binding.append('user/message', 1, { id: 'mx', role: 'user', source: 'session', content: [{ type: 'text', text: '旧任务' }] })
    binding.append('turn/end', 2, { turn: 1, reason: { kind: 'error', error: { message: 'died', code: 'TRANSPORT' } } })
    vi.setSystemTime(Date.now() + 25 * 60 * 60 * 1_000)
    harness.setCurrent('s1')
    await vi.advanceTimersByTimeAsync(30_000)
    expect(binding.prompts).toHaveLength(0)
  })

  it('recovers a recent failure that ended while the view was on another session', async () => {
    const harness = makeHarness()
    disposer = harness.runner.dispose
    const binding = makeBinding('s1')
    harness.bindings.set('s1', binding)
    harness.setCurrent('s1')
    binding.append('user/message', 1, { id: 'mx', role: 'user', source: 'session', content: [{ type: 'text', text: '写个爬虫' }] })
    binding.setRunning(true)
    await vi.advanceTimersByTimeAsync(1_100)
    // The user switches away; the turn then fails with nobody watching.
    harness.setCurrent('s2')
    await vi.advanceTimersByTimeAsync(1_100)
    binding.append('turn/end', 2, { turn: 1, reason: { kind: 'error', error: { message: '429 rate limited', code: 'RATE_LIMIT' } } })
    binding.setRunning(false)
    await vi.advanceTimersByTimeAsync(5_000)
    expect(binding.prompts).toHaveLength(0)
    // Coming back within the recovery window continues it without a manual nudge.
    harness.setCurrent('s1')
    await vi.advanceTimersByTimeAsync(1_100)
    await vi.advanceTimersByTimeAsync(autoContinueConfig().waitSeconds * 1_000 + 1_000)
    expect(binding.prompts).toHaveLength(1)
  })

  it('never continues completed, aborted or blocked turns', async () => {
    const harness = makeHarness()
    disposer = harness.runner.dispose
    for (const reason of [{ kind: 'completed' }, { kind: 'aborted', reason: { kind: 'user' } }, { kind: 'blocked' }]) {
      const binding = makeBinding('safe')
      harness.bindings.set('safe', binding)
      harness.setCurrent('safe')
      binding.append('user/message', 1, { id: 'mx', role: 'user', source: 'session', content: [{ type: 'text', text: '做点事' }] })
      binding.setRunning(true)
      await vi.advanceTimersByTimeAsync(1_100)
      await failTurn(binding, 2, reason)
      expect(binding.prompts, JSON.stringify(reason)).toHaveLength(0)
      harness.bindings.delete('safe')
    }
  })

  it('never continues unfixable failures (auth, quota, invalid)', async () => {
    const harness = makeHarness()
    disposer = harness.runner.dispose
    for (const failure of [
      { message: '401; check the API key', code: 'AUTH' },
      { message: 'insufficient balance', code: 'QUOTA' },
      { message: '400 bad request', code: 'INVALID_REQUEST' },
      { message: 'context too long', code: 'CONTEXT_WINDOW_EXCEEDED' },
    ]) {
      const binding = makeBinding('broken')
      harness.bindings.set('broken', binding)
      harness.setCurrent('broken')
      binding.append('user/message', 1, { id: 'mx', role: 'user', source: 'session', content: [{ type: 'text', text: '做点事' }] })
      binding.setRunning(true)
      await vi.advanceTimersByTimeAsync(1_100)
      await failTurn(binding, 2, { kind: 'error', error: failure })
      expect(binding.prompts, failure.code).toHaveLength(0)
      harness.bindings.delete('broken')
    }
  })

  it('skips an empty turn even when the reason looks continuable', async () => {
    const harness = makeHarness()
    disposer = harness.runner.dispose
    const binding = makeBinding('s1')
    harness.bindings.set('s1', binding)
    harness.setCurrent('s1')
    binding.append('turn/start', 1, { turn: 1 })
    binding.setRunning(true)
    await vi.advanceTimersByTimeAsync(1_100)
    await failTurn(binding, 2, { kind: 'error', error: { message: 'died', code: 'TRANSPORT' } })
    expect(binding.prompts).toHaveLength(0)
  })

  it('stays silent while the switch is off', async () => {
    setAutoContinueEnabled(false)
    const harness = makeHarness()
    disposer = harness.runner.dispose
    const binding = makeBinding('s1')
    harness.bindings.set('s1', binding)
    harness.setCurrent('s1')
    binding.append('user/message', 1, { id: 'mx', role: 'user', source: 'session', content: [{ type: 'text', text: '做点事' }] })
    binding.setRunning(true)
    await vi.advanceTimersByTimeAsync(1_100)
    await failTurn(binding, 2, { kind: 'error', error: { message: 'died', code: 'TRANSPORT' } })
    expect(binding.prompts).toHaveLength(0)
  })

  it('does not send while the user has a pending submission', async () => {
    const harness = makeHarness()
    disposer = harness.runner.dispose
    const binding = makeBinding('s1')
    harness.bindings.set('s1', binding)
    harness.setCurrent('s1')
    binding.append('user/message', 1, { id: 'mx', role: 'user', source: 'session', content: [{ type: 'text', text: '做点事' }] })
    binding.setRunning(true)
    await vi.advanceTimersByTimeAsync(1_100)
    binding.append('turn/end', 2, { turn: 1, reason: { kind: 'error', error: { message: 'died', code: 'TRANSPORT' } } })
    binding.setPending([{ requestId: 'r1', text: '等等，换个思路' }])
    binding.setRunning(false)
    await vi.advanceTimersByTimeAsync(10_000)
    expect(binding.prompts).toHaveLength(0)
  })

  it('treats everything the history page carried as baseline when it lands after the attach', async () => {
    const harness = makeHarness()
    disposer = harness.runner.dispose
    const binding = makeBinding('s1')
    // The binding exists while history is still loading (a page reload into a
    // running conversation): the window is not the truth yet.
    binding.setOpenState('loading')
    harness.bindings.set('s1', binding)
    harness.setCurrent('s1')
    binding.append('user/message', 1, { id: 'm1', role: 'user', source: 'session', content: [{ type: 'text', text: '旧任务' }] })
    binding.setRunning(true)
    await vi.advanceTimersByTimeAsync(1_100)
    // The turn ends and its settlement reaches the window BEFORE the page
    // lands: still baseline, never auto-continued.
    binding.append('turn/end', 2, { turn: 1, reason: { kind: 'error', error: { message: 'died', code: 'TRANSPORT' } } })
    binding.setRunning(false)
    // The page arrived long after that ending: it is history, not live work.
    vi.setSystemTime(Date.now() + 25 * 60 * 60 * 1_000)
    binding.setOpenState('open')
    await vi.advanceTimersByTimeAsync(10_000)
    expect(binding.prompts).toHaveLength(0)

    // Only a LIVE ending after the page is judged.
    binding.append('user/message', 3, { id: 'm3', role: 'user', source: 'session', content: [{ type: 'text', text: '新任务' }] })
    binding.setRunning(true)
    await vi.advanceTimersByTimeAsync(1_100)
    await failTurn(binding, 4, { kind: 'error', error: { message: 'died', code: 'TRANSPORT' } })
    expect(binding.prompts).toHaveLength(1)
  })

  it('stands down after the streak cap and resumes once the user answers', async () => {
    const harness = makeHarness()
    disposer = harness.runner.dispose
    const binding = makeBinding('s1')
    harness.bindings.set('s1', binding)
    harness.setCurrent('s1')
    binding.append('user/message', 1, { id: 'mx', role: 'user', source: 'session', content: [{ type: 'text', text: '长任务' }] })
    binding.setRunning(true)
    await vi.advanceTimersByTimeAsync(1_100)

    // Five max-tokens cut-offs in a row: five automatic replies, then silence.
    let seq = 2
    for (let attempt = 0; attempt < 5; attempt += 1) {
      await failTurn(binding, seq, { kind: 'max-tokens' })
      seq += 1
    }
    expect(binding.prompts).toHaveLength(5)
    await failTurn(binding, seq, { kind: 'max-tokens' })
    expect(binding.prompts).toHaveLength(5)

    // A manual user message resets the streak: the next cut-off continues.
    binding.append('user/message', seq + 1, { id: 'mx', role: 'user', source: 'session', content: [{ type: 'text', text: '我自己来了' }] })
    binding.setRunning(true)
    await vi.advanceTimersByTimeAsync(1_100)
    await failTurn(binding, seq + 2, { kind: 'max-tokens' })
    expect(binding.prompts).toHaveLength(6)
  })

  it('does not reset the streak on its own echo', async () => {
    const harness = makeHarness()
    disposer = harness.runner.dispose
    const binding = makeBinding('s1')
    harness.bindings.set('s1', binding)
    harness.setCurrent('s1')
    binding.append('user/message', 1, { id: 'mx', role: 'user', source: 'session', content: [{ type: 'text', text: '长任务' }] })
    binding.setRunning(true)
    await vi.advanceTimersByTimeAsync(1_100)
    // Five max-tokens cut-offs: five replies, then the cap.
    let seq = 2
    for (let attempt = 0; attempt < 5; attempt += 1) {
      await failTurn(binding, seq, { kind: 'max-tokens' })
      seq += 1
    }
    expect(binding.prompts).toHaveLength(5)
    // The watcher's own reply lands durably with matching text and a fresh
    // timestamp: it must NOT read as the user coming back, or the cap would
    // never hold.
    binding.append('user/message', seq + 1, { id: 'mx', role: 'user', source: 'session', content: [{ type: 'text', text: '继续' }] })
    binding.setRunning(true)
    await vi.advanceTimersByTimeAsync(1_100)
    await failTurn(binding, seq + 2, { kind: 'max-tokens' })
    expect(binding.prompts).toHaveLength(5)
  })

  it('waits out a second-tab claim instead of double-answering', async () => {
    const harness = makeHarness()
    disposer = harness.runner.dispose
    const binding = makeBinding('s1')
    harness.bindings.set('s1', binding)
    harness.setCurrent('s1')
    binding.append('user/message', 1, { id: 'mx', role: 'user', source: 'session', content: [{ type: 'text', text: '做点事' }] })
    binding.setRunning(true)
    await vi.advanceTimersByTimeAsync(1_100)
    // Another tab claimed this exact ending.
    window.localStorage.setItem('dsh-model-think-level.auto-continue.claim.s1.2', JSON.stringify(Date.now()))
    await failTurn(binding, 2, { kind: 'error', error: { message: 'died', code: 'TRANSPORT' } })
    expect(binding.prompts).toHaveLength(0)
  })

  it('does not send after the view moved to another session', async () => {
    const harness = makeHarness()
    disposer = harness.runner.dispose
    const binding = makeBinding('s1')
    harness.bindings.set('s1', binding)
    harness.setCurrent('s1')
    binding.append('user/message', 1, { id: 'mx', role: 'user', source: 'session', content: [{ type: 'text', text: '做点事' }] })
    binding.setRunning(true)
    await vi.advanceTimersByTimeAsync(1_100)
    binding.append('turn/end', 2, { turn: 1, reason: { kind: 'error', error: { message: 'died', code: 'TRANSPORT' } } })
    binding.setRunning(false)
    await vi.advanceTimersByTimeAsync(500)
    // The user navigates away before the send delay elapses; the next tick
    // detaches, and the scheduled send dies with the attachment.
    harness.setCurrent('s2')
    await vi.advanceTimersByTimeAsync(10_000)
    expect(binding.prompts).toHaveLength(0)
  })

  it.each(['before evaluation', 'during wait', 'before attachment'])('ignores host context %s when continuing an unanswered failure', async (timing) => {
    const harness = makeHarness()
    disposer = harness.runner.dispose
    const binding = makeBinding('context-guard')
    harness.bindings.set('context-guard', binding)
    binding.append('user/message', 1, { source: { kind: 'user' }, content: [{ type: 'text', text: '长任务' }] })
    if (timing !== 'before attachment') {
      harness.setCurrent('context-guard')
      binding.setRunning(true)
      await vi.advanceTimersByTimeAsync(1_100)
    }
    binding.append('turn/end', 2, { turn: 1, reason: { kind: 'max-tokens' } })
    binding.setRunning(false)
    if (timing === 'during wait') {
      await vi.advanceTimersByTimeAsync(500)
      expect(harness.runner.status().phase).toBe('waiting')
    }
    binding.append('user/message', 3, {
      source: { kind: 'time-context', form: 'snapshot' },
      content: [{ type: 'text', text: 'Time sampled while preparing turn 2, step 1: …' }],
    })
    if (timing === 'before attachment') harness.setCurrent('context-guard')
    await vi.advanceTimersByTimeAsync(5_000)
    expect(binding.prompts).toHaveLength(1)
    expect(harness.runner.status()).toMatchObject({ phase: 'sent', consecutive: 1 })
  })

  it('counts a refused prompt toward the streak', async () => {
    const harness = makeHarness()
    disposer = harness.runner.dispose
    const binding = makeBinding('s1')
    harness.bindings.set('s1', binding)
    harness.setCurrent('s1')
    binding.refuseNextPrompt()
    binding.append('user/message', 1, { id: 'mx', role: 'user', source: 'session', content: [{ type: 'text', text: '长任务' }] })
    binding.setRunning(true)
    await vi.advanceTimersByTimeAsync(1_100)
    // Four more cap attempts after the refused one all send (refusal counts
    // once per send), then the cap stands.
    let seq = 2
    for (let attempt = 0; attempt < 5; attempt += 1) {
      await failTurn(binding, seq, { kind: 'max-tokens' })
      seq += 1
    }
    expect(binding.prompts).toHaveLength(5)
    await failTurn(binding, seq, { kind: 'max-tokens' })
    expect(binding.prompts).toHaveLength(5)
  })
})

describe('auto-continue controller face', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    setAutoContinueEnabled(true)
    setAutoContinueConfig(DEFAULT_AUTO_CONTINUE_CONFIG)
  })

  async function delayedContinue() {
    const harness = makeHarness()
    disposer = harness.runner.dispose
    const binding = makeBinding('delayed')
    harness.bindings.set('delayed', binding)
    harness.setCurrent('delayed')
    binding.append('user/message', 1, { content: [{ type: 'text', text: '长任务' }] })
    binding.setRunning(true)
    await vi.advanceTimersByTimeAsync(1_100)
    const response = binding.deferNextPrompt()
    binding.append('turn/end', 2, { turn: 1, reason: { kind: 'max-tokens' } })
    binding.setRunning(false)
    await vi.advanceTimersByTimeAsync(3_000)
    expect(binding.prompts).toHaveLength(1)
    return { harness, binding, response }
  }

  it('marks the automatic send in flight before its acknowledgement arrives', async () => {
    const { harness, response } = await delayedContinue()
    expect(harness.runner.status()).toMatchObject({ phase: 'sent', consecutive: 1, nextSendAt: 0 })
    response.resolve({ ok: true })
    await vi.advanceTimersByTimeAsync(10)
    expect(harness.runner.status()).toMatchObject({ phase: 'sent', consecutive: 1 })
  })

  it.each(['completed', 'aborted', 'interrupted', 'blocked'])('does not revive %s after a late successful prompt acknowledgement', async (kind) => {
    const { harness, binding, response } = await delayedContinue()
    binding.setRunning(true)
    binding.append('turn/end', 3, { turn: 2, reason: { kind } })
    binding.setRunning(false)
    await vi.advanceTimersByTimeAsync(1_000)
    expect(harness.runner.status()).toMatchObject({ phase: 'idle', consecutive: 0 })
    response.resolve({ ok: true })
    await vi.advanceTimersByTimeAsync(10_000)
    expect(harness.runner.status()).toMatchObject({ phase: 'idle', consecutive: 0, nextSendAt: 0 })
    expect(binding.prompts).toHaveLength(1)
  })

  it.each(['refused', 'rejected'])('does not count a late %s acknowledgement against a completed chain', async (outcome) => {
    const { harness, binding, response } = await delayedContinue()
    binding.setRunning(true)
    binding.append('turn/end', 3, { turn: 2, reason: { kind: 'completed' } })
    binding.setRunning(false)
    await vi.advanceTimersByTimeAsync(1_000)
    if (outcome === 'refused') response.resolve({ ok: false, error: { code: 'TRANSPORT', message: 'late refusal' } })
    else response.reject(new Error('late transport error'))
    await vi.advanceTimersByTimeAsync(1_000)
    expect(harness.runner.status()).toMatchObject({ phase: 'idle', consecutive: 0, nextSendAt: 0 })
    expect(binding.prompts).toHaveLength(1)
  })

  it('keeps a user-requested stop intact when an in-flight acknowledgement arrives', async () => {
    const { harness, binding, response } = await delayedContinue()
    harness.runner.stop()
    response.resolve({ ok: true })
    await vi.advanceTimersByTimeAsync(1_000)
    expect(harness.runner.status()).toMatchObject({ phase: 'idle', muted: true, consecutive: 0, nextSendAt: 0 })
    expect(binding.prompts).toHaveLength(1)
  })

  it('clears a scheduled continuation as soon as completed lands, before running catches up', async () => {
    const harness = makeHarness()
    disposer = harness.runner.dispose
    const binding = makeBinding('settled-before-running')
    harness.bindings.set(binding.sessionId, binding)
    harness.setCurrent(binding.sessionId)
    binding.append('user/message', 1, { content: [{ type: 'text', text: '长任务' }] })
    binding.setRunning(true)
    await vi.advanceTimersByTimeAsync(1_100)
    binding.append('turn/end', 2, { turn: 1, reason: { kind: 'max-tokens' } })
    binding.setRunning(false)
    await vi.advanceTimersByTimeAsync(500)
    expect(harness.runner.status().phase).toBe('waiting')
    // The snapshot is already running, but its notification is coalesced away.
    // No turn/start arrives to cancel the wait: terminal settlement must do it.
    binding.setRunning(true, false)
    binding.append('assistant/message', 3, { message: { content: [{ type: 'text', text: '已完成' }] } })
    binding.append('turn/end', 4, { turn: 2, reason: { kind: 'completed' } })
    expect(binding.session.getSnapshot().running).toBe(true)
    expect(harness.runner.status()).toMatchObject({ phase: 'idle', consecutive: 0, nextSendAt: 0 })
    await vi.advanceTimersByTimeAsync(10_000)
    expect(binding.prompts).toHaveLength(0)
  })

  it('does not resurrect a completed wait when retry settings change', async () => {
    const harness = makeHarness()
    disposer = harness.runner.dispose
    const binding = makeBinding('settled-settings')
    harness.bindings.set(binding.sessionId, binding)
    harness.setCurrent(binding.sessionId)
    binding.append('user/message', 1, { content: [{ type: 'text', text: '长任务' }] })
    binding.setRunning(true)
    await vi.advanceTimersByTimeAsync(1_100)
    binding.append('turn/end', 2, { turn: 1, reason: { kind: 'max-tokens' } })
    binding.setRunning(false)
    await vi.advanceTimersByTimeAsync(500)
    expect(harness.runner.status().phase).toBe('waiting')
    // A fast turn's running=true frame was coalesced away.
    binding.append('assistant/message', 3, { message: { content: [{ type: 'text', text: '已完成' }] } })
    binding.append('turn/end', 4, { turn: 2, reason: { kind: 'completed' } })
    await vi.advanceTimersByTimeAsync(500)
    expect(harness.runner.status()).toMatchObject({ phase: 'idle', consecutive: 0 })
    setAutoContinueConfig({ waitSeconds: 10 })
    expect(harness.runner.status()).toMatchObject({ phase: 'idle', nextSendAt: 0 })
    harness.runner.resumeNow()
    await vi.advanceTimersByTimeAsync(20_000)
    expect(binding.prompts).toHaveLength(0)
  })

  it.each(['successful', 'refused', 'rejected'])('keeps the retry cap intact after a late %s acknowledgement', async (outcome) => {
    setAutoContinueConfig({ maxRetries: 1 })
    const { harness, binding, response } = await delayedContinue()
    binding.append('turn/end', 3, { turn: 2, reason: { kind: 'max-tokens' } })
    await vi.advanceTimersByTimeAsync(500)
    expect(harness.runner.status()).toMatchObject({ phase: 'exhausted', consecutive: 1, nextSendAt: 0 })
    if (outcome === 'successful') response.resolve({ ok: true })
    else if (outcome === 'refused') response.resolve({ ok: false, error: { code: 'TRANSPORT', message: 'late refusal' } })
    else response.reject(new Error('late transport error'))
    await vi.advanceTimersByTimeAsync(10_000)
    expect(harness.runner.status()).toMatchObject({ phase: 'exhausted', consecutive: 1, nextSendAt: 0 })
    expect(binding.prompts).toHaveLength(1)
  })

  it('preserves a newer retry when an older prompt is refused late', async () => {
    const { harness, binding, response } = await delayedContinue()
    binding.append('turn/end', 3, { turn: 2, reason: { kind: 'max-tokens' } })
    await vi.advanceTimersByTimeAsync(500)
    const waiting = harness.runner.status()
    expect(waiting).toMatchObject({ phase: 'waiting', consecutive: 1 })
    response.resolve({ ok: false, error: { code: 'TRANSPORT', message: 'old refusal' } })
    await vi.advanceTimersByTimeAsync(10)
    expect(harness.runner.status()).toMatchObject({ phase: 'waiting', consecutive: 1, nextSendAt: waiting.nextSendAt })
    await vi.advanceTimersByTimeAsync(3_000)
    expect(binding.prompts).toHaveLength(2)
    expect(harness.runner.status()).toMatchObject({ phase: 'sent', consecutive: 2 })
  })

  it.each(['manual intent', 'disabled', 'reset', 'detached'])('ignores an in-flight reply after %s', async (action) => {
    const { harness, binding, response } = await delayedContinue()
    if (action === 'manual intent') binding.append('user/message', 3, { content: [{ type: 'text', text: '不要继续了' }] })
    else if (action === 'disabled') setAutoContinueEnabled(false)
    else if (action === 'reset') harness.runner.reset()
    else {
      harness.setCurrent(undefined)
      await vi.advanceTimersByTimeAsync(1_100)
    }
    response.resolve({ ok: true })
    await vi.advanceTimersByTimeAsync(1_000)
    expect(harness.runner.status()).toMatchObject({ phase: 'idle', consecutive: action === 'disabled' ? 1 : 0, nextSendAt: 0 })
    expect(binding.prompts).toHaveLength(1)
  })

  it('reports idle → waiting → sent → idle and publishes each change', async () => {
    const harness = makeHarness()
    const binding = makeBinding('s1')
    harness.bindings.set('s1', binding)
    harness.setCurrent('s1')
    const phases: string[] = []
    const stopListening = harness.runner.subscribe(() => { phases.push(harness.runner.status().phase) })
    disposer = () => { stopListening(); harness.runner.dispose() }

    binding.append('user/message', 1, { id: 'm1', content: [{ type: 'text', text: '长任务' }] })
    binding.setRunning(true)
    await vi.advanceTimersByTimeAsync(1_100)
    expect(harness.runner.status()).toMatchObject({ sessionId: 's1', phase: 'idle', consecutive: 0 })

    binding.append('turn/end', 2, { turn: 1, reason: { kind: 'max-tokens' } })
    binding.setRunning(false)
    await vi.advanceTimersByTimeAsync(500)
    expect(harness.runner.status()).toMatchObject({ phase: 'waiting', consecutive: 0, maxRetries: 5 })

    await vi.advanceTimersByTimeAsync(2_100)
    expect(harness.runner.status()).toMatchObject({ phase: 'sent', consecutive: 1 })

    binding.append('turn/end', 4, { turn: 2, reason: { kind: 'completed' } })
    binding.setRunning(true)
    binding.setRunning(false)
    await vi.advanceTimersByTimeAsync(1_000)
    expect(harness.runner.status()).toMatchObject({ phase: 'idle', consecutive: 0 })
    expect(phases).toEqual(expect.arrayContaining(['waiting', 'sent', 'idle']))
  })

  it.each([
    { kind: 'user' }, { kind: 'schedule' }, { kind: 'goal' },
    { kind: 'user-question-reply' }, { kind: 'future-intent' }, 'session', undefined,
  ])('keeps intent guards for source %j even when the text resembles context', async (source) => {
    const harness = makeHarness()
    const binding = makeBinding('intent-source')
    harness.bindings.set('intent-source', binding)
    harness.setCurrent('intent-source')
    disposer = harness.runner.dispose
    binding.append('user/message', 1, { content: [{ type: 'text', text: '长任务' }] })
    binding.setRunning(true)
    await vi.advanceTimersByTimeAsync(1_100)
    await failTurn(binding, 2, { kind: 'max-tokens' })
    expect(harness.runner.status()).toMatchObject({ phase: 'sent', consecutive: 1 })
    binding.append('user/message', 3, {
      source, content: [{ type: 'text', text: '[model changed: selected another model]' }],
    })
    expect(harness.runner.status()).toMatchObject({ phase: 'idle', consecutive: 0 })
  })

  it('stop() hides the chip and mutes this session until the user speaks again', async () => {
    const harness = makeHarness()
    const binding = makeBinding('s1')
    harness.bindings.set('s1', binding)
    harness.setCurrent('s1')
    disposer = harness.runner.dispose

    binding.append('user/message', 1, { id: 'm1', content: [{ type: 'text', text: '长任务' }] })
    binding.setRunning(true)
    await vi.advanceTimersByTimeAsync(1_100)
    binding.append('turn/end', 2, { turn: 1, reason: { kind: 'max-tokens' } })
    binding.setRunning(false)
    await vi.advanceTimersByTimeAsync(500)
    expect(harness.runner.status().phase).toBe('waiting')

    harness.runner.stop()
    expect(harness.runner.status()).toMatchObject({ phase: 'idle', muted: true })
    await vi.advanceTimersByTimeAsync(10_000)
    expect(binding.prompts).toHaveLength(0)

    // A further cut-off while muted stays silent.
    binding.append('turn/end', 3, { turn: 2, reason: { kind: 'max-tokens' } })
    binding.setRunning(true)
    binding.setRunning(false)
    await vi.advanceTimersByTimeAsync(2_000)
    expect(binding.prompts).toHaveLength(0)

    // The user posts in this session: the mute lifts.
    binding.append('user/message', 5, { id: 'm3', content: [{ type: 'text', text: '再来' }] })
    await vi.advanceTimersByTimeAsync(1_100)
    expect(harness.runner.status().muted).toBe(false)
  })

  it('resumeNow() sends without waiting out the delay, reset() clears the streak', async () => {
    const harness = makeHarness()
    const binding = makeBinding('s1')
    harness.bindings.set('s1', binding)
    harness.setCurrent('s1')
    disposer = harness.runner.dispose

    binding.append('user/message', 1, { id: 'm1', content: [{ type: 'text', text: '长任务' }] })
    binding.setRunning(true)
    await vi.advanceTimersByTimeAsync(1_100)
    binding.append('turn/end', 2, { turn: 1, reason: { kind: 'max-tokens' } })
    binding.setRunning(false)
    await vi.advanceTimersByTimeAsync(500)
    expect(harness.runner.status().phase).toBe('waiting')
    expect(binding.prompts).toHaveLength(0)

    harness.runner.resumeNow()
    await vi.advanceTimersByTimeAsync(10)
    expect(binding.prompts).toHaveLength(1)
    expect(harness.runner.status()).toMatchObject({ phase: 'sent', consecutive: 1 })

    harness.runner.reset()
    expect(harness.runner.status()).toMatchObject({ phase: 'idle', consecutive: 0, muted: false })
  })
})
