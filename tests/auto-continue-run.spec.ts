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
import { setAutoContinueEnabled } from '../src/client/auto-continue-pref.js'
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

/** One fake session binding: snapshot, window, listeners, prompt record. */
function makeBinding(sessionId: string) {
  const listeners = new Set<() => void>()
  const windowListeners = new Set<() => void>()
  const entries: { type: string; event?: DurableEventLike }[] = []
  const prompts: PromptCall[] = []
  let promptAnswer: { ok: true } | { ok: false; error: { code: string; message: string } } = { ok: true }
  const snap = { running: false, pendingSubmissions: [] as unknown[], openState: 'open' }
  const binding = {
    sessionId,
    session: {
      getSnapshot: () => ({ ...snap, pendingSubmissions: [...snap.pendingSubmissions] }),
      subscribe: (fn: () => void) => { listeners.add(fn); return () => { listeners.delete(fn) } },
      prompt: async (content: PromptCall['content'], mode: 'queue' | 'steer') => {
        prompts.push({ content: [...content], mode })
        return promptAnswer
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
    /** Host-side helper: flip the running bit and publish. */
    setRunning(running: boolean): void {
      snap.running = running
      for (const fn of [...listeners]) fn()
    },
    setPending(pending: unknown[]): void {
      snap.pendingSubmissions = pending
      for (const fn of [...listeners]) fn()
    },
    setOpenState(openState: string): void {
      snap.openState = openState
      for (const fn of [...listeners]) fn()
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
  await vi.advanceTimersByTimeAsync(35_000)
}

describe('auto-continue watcher', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    setAutoContinueEnabled(true)
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
  it('ignores endings that predate the attachment (a page opened into an old failure)', async () => {
    const harness = makeHarness()
    disposer = harness.runner.dispose
    const binding = makeBinding('s1')
    harness.bindings.set('s1', binding)
    harness.setCurrent('s1')
    binding.append('user/message', 1, { id: 'mx', role: 'user', source: 'session', content: [{ type: 'text', text: '旧任务' }] })
    binding.append('turn/end', 2, { turn: 1, reason: { kind: 'error', error: { message: 'died', code: 'TRANSPORT' } } })
    await vi.advanceTimersByTimeAsync(30_000)
    expect(binding.prompts).toHaveLength(0)
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
