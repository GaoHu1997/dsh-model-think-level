// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createAutoContinue } from '../src/client/injection/auto-continue-run.js'
import { DEFAULT_AUTO_CONTINUE_CONFIG, setAutoContinueConfig, setAutoContinueEnabled } from '../src/client/auto-continue-pref.js'
import type { DurableEventLike } from '../src/client/auto-continue-rules.js'

/** Last release freezes the remote stream but leaves an apparently OPEN snapshot,
 * matching the real Session.dispose(), not an immortal borrowed-binding double. */
function makeHost() {
  const generations = new Map<string, ReturnType<typeof generation>>()
  const rows: Record<string, { id: string; running: boolean; origin?: string; parentId?: string }> = {}
  const resetListeners = new Set<() => void>()
  const acquisitions: string[] = []
  const releases: string[] = []
  let selected: string | undefined
  let releaseView: (() => void) | undefined
  function generation(id: string) {
    const listeners = new Set<() => void>()
    const eventListeners = new Set<() => void>()
    const entries: { type: string; event: DurableEventLike }[] = []
    const prompts: string[] = []
    let seq = 0
    let refs = 0
    let live = true
    let opening: Promise<unknown> = Promise.resolve()
    const snap = { running: false, openState: 'open', pendingSubmissions: [] as unknown[], subagent: undefined as unknown }
    const source = {
      getSnapshot: () => ({ entries: [...entries], hasMore: false }),
      subscribe(fn: () => void) { eventListeners.add(fn); return () => { eventListeners.delete(fn) } },
    }
    const session = {
      getSnapshot: () => ({ ...snap }),
      subscribe(fn: () => void) { listeners.add(fn); return () => { listeners.delete(fn) } },
      async prompt(content: readonly { type: 'text'; text: string }[]) {
        const text = content.map(part => part.text).join('')
        prompts.push(text)
        append('user/message', { content: [{ type: 'text', text }] })
        return { ok: true }
      },
    }
    const binding = { sessionId: id, session, eventSource: source }
    function append(type: string, data: unknown) {
      if (!live || refs === 0) return // No owned use: the Host stream no longer delivers.
      entries.push({ type: 'event', event: { type, seq: ++seq, time: Date.now(), data } })
      for (const fn of [...eventListeners]) fn()
    }
    function hold() {
      refs++
      let released = false
      return () => {
        if (released) return
        released = true
        refs--
        if (refs === 0) live = false // Deliberately do NOT clear history/openState.
      }
    }
    return {
      binding, snap, prompts, append, hold,
      get refs() { return refs }, get live() { return live }, get opening() { return opening },
      invalidate() { live = false },
      deferOpen() {
        let reject!: (error: Error) => void
        opening = new Promise((_resolve, fail) => { reject = fail })
        return reject
      },
      setRunning(running: boolean, publish = true) {
        snap.running = running
        rows[id]!.running = running
        if (publish && live && refs > 0) for (const fn of [...listeners]) fn()
      },
      fail() {
        this.setRunning(true)
        append('turn/end', { turn: 1, reason: { kind: 'max-tokens' } })
        this.setRunning(false)
      },
      get listenerCount() { return listeners.size + eventListeners.size },
    }
  }
  function add(id: string, options: { running?: boolean; origin?: string; parentId?: string } = {}) {
    rows[id] = { id, running: options.running ?? false, ...options }
    const gen = generation(id)
    gen.snap.running = rows[id]!.running
    generations.set(id, gen)
    return gen
  }
  const sessions = {
    binding(id: string) {
      const gen = generations.get(id)
      return gen?.live && gen.refs > 0 ? gen.binding : undefined
    },
    retain(id: string, options: { source: string }) {
      expect(options.source).toBe('dshModelThinkLevelAutoContinue')
      const gen = generations.get(id)!
      if (!gen?.live) throw new Error('dead generation')
      acquisitions.push(id)
      const release = gen.hold()
      let released = false
      return {
        get binding() {
          if (released || !gen.live) throw new Error('reference is released')
          return gen.binding
        },
        ready: gen.opening.then(() => gen.binding),
        release() {
          if (released) return
          released = true
          releases.push(id)
          release()
        },
      }
    },
    list: { getSnapshot: () => ({ ids: Object.keys(rows), byId: rows }) },
  }
  const ctx = {
    get: (key: string) => key === 'sessions' ? sessions : key === 'uiSession'
      ? { adapter: { current: { getSnapshot: () => ({ key: selected }) } } } : undefined,
    on(_key: string, fn: () => void) { resetListeners.add(fn); return () => { resetListeners.delete(fn) } },
  }
  const runner = createAutoContinue({ ctx, t: () => '继续' })
  return {
    add, runner, acquisitions, releases,
    select(id: string | undefined) {
      selected = id
      const old = releaseView
      releaseView = id === undefined ? undefined : generations.get(id)!.hold()
      old?.()
    },
    reset() { for (const fn of [...resetListeners]) fn() },
    dispose() { runner.dispose(); releaseView?.() },
  }
}

let host: ReturnType<typeof makeHost>
beforeEach(() => {
  vi.useFakeTimers()
  setAutoContinueEnabled(true)
  setAutoContinueConfig(DEFAULT_AUTO_CONTINUE_CONFIG)
  host = makeHost()
})
afterEach(() => {
  host.dispose()
  vi.useRealTimers()
  window.localStorage.clear()
})

async function attachCurrent() {
  const a = host.add('a')
  host.add('b')
  host.select('a')
  a.setRunning(true)
  await vi.advanceTimersByTimeAsync(1_100)
  return a
}

describe('auto-continue owned session lifecycle', () => {
  it('keeps a running session alive after switching to a REAL other session', async () => {
    const a = await attachCurrent()
    host.select('b')
    await vi.advanceTimersByTimeAsync(5_000)
    expect(a.refs).toBe(1)
    a.fail()
    await vi.advanceTimersByTimeAsync(3_000)
    expect(a.prompts).toEqual(['继续'])
  })

  it('keeps an armed countdown and its deadline after the view releases the failed session', async () => {
    setAutoContinueConfig({ waitSeconds: 7 })
    const a = await attachCurrent()
    a.fail()
    await vi.advanceTimersByTimeAsync(500)
    const deadline = host.runner.status().nextSendAt
    host.select('b')
    await vi.advanceTimersByTimeAsync(6_999)
    expect(a.prompts).toHaveLength(0)
    expect(Date.now()).toBe(deadline - 1)
    await vi.advanceTimersByTimeAsync(1)
    expect(a.prompts).toEqual(['继续'])
  })

  it('discovers running catalog sessions that were NEVER selected', async () => {
    const background = host.add('background', { running: true })
    await vi.advanceTimersByTimeAsync(1_100)
    expect(background.refs).toBe(1)
    background.fail()
    await vi.advanceTimersByTimeAsync(3_000)
    expect(background.prompts).toEqual(['继续'])
    expect(host.runner.status().sessionId).toBeUndefined()
  })

  it('does not retain or open idle historical sessions', async () => {
    const idle = host.add('history')
    await vi.advanceTimersByTimeAsync(10_000)
    expect(idle.refs).toBe(0)
    expect(host.acquisitions).toEqual([])
  })

  it('does not confuse a fork parentId with a subagent origin', async () => {
    const fork = host.add('fork', { running: true, parentId: 'parent' })
    const child = host.add('child', { running: true, origin: 'subagent', parentId: 'parent' })
    await vi.advanceTimersByTimeAsync(1_100)
    expect(fork.refs).toBe(1)
    expect(child.refs).toBe(0)
  })

  it('excludes a subagent snapshot even if its catalog row looks ordinary', async () => {
    const child = host.add('child', { running: true })
    child.snap.subagent = { parentId: 'parent' }
    await vi.advanceTimersByTimeAsync(1_100)
    expect(child.refs).toBe(0)
  })

  it('continues multiple background chains without routing into the visible session', async () => {
    const a = host.add('a', { running: true })
    const b = host.add('b', { running: true })
    const current = host.add('current')
    host.select('current')
    await vi.advanceTimersByTimeAsync(1_100)
    a.fail(); b.fail()
    await vi.advanceTimersByTimeAsync(3_000)
    expect(a.prompts).toEqual(['继续'])
    expect(b.prompts).toEqual(['继续'])
    expect(current.prompts).toEqual([])
  })

  it('preserves the retry cap across repeated background failures and echoes', async () => {
    setAutoContinueConfig({ maxRetries: 2 })
    const a = host.add('a', { running: true })
    await vi.advanceTimersByTimeAsync(1_100)
    for (let i = 0; i < 4; i++) {
      a.fail()
      await vi.advanceTimersByTimeAsync(3_000)
    }
    expect(a.prompts).toEqual(['继续', '继续'])
  })

  it('global OFF cancels and releases ALL background countdowns immediately', async () => {
    const a = host.add('a', { running: true })
    const b = host.add('b', { running: true })
    await vi.advanceTimersByTimeAsync(1_100)
    a.fail(); b.fail()
    await vi.advanceTimersByTimeAsync(500)
    setAutoContinueEnabled(false)
    expect(a.refs).toBe(0)
    expect(b.refs).toBe(0)
    await vi.advanceTimersByTimeAsync(5_000)
    expect(a.prompts).toEqual([])
    expect(b.prompts).toEqual([])
  })

  it('config edits recompute BACKGROUND waits from the original scheduling time', async () => {
    setAutoContinueConfig({ waitSeconds: 10 })
    const a = host.add('a', { running: true })
    await vi.advanceTimersByTimeAsync(1_100)
    a.fail()
    await vi.advanceTimersByTimeAsync(600)
    // Shorten a BACKGROUND wait: still no <status> (it only renders the pane).
    setAutoContinueConfig({ waitSeconds: 2 })
    await vi.advanceTimersByTimeAsync(2_400)
    expect(a.prompts).toEqual(['继续'])
  })

  it('does not repeatedly acquire a reference on every poll', async () => {
    const a = await attachCurrent()
    await vi.advanceTimersByTimeAsync(20_000)
    expect(host.acquisitions.filter(id => id === 'a')).toHaveLength(1)
    expect(a.refs).toBe(2)
  })

  it('reclaims a completed off-screen session and removes its listeners', async () => {
    const a = await attachCurrent()
    host.select('b')
    a.append('turn/end', { turn: 1, reason: { kind: 'completed' } })
    a.setRunning(false)
    await vi.advanceTimersByTimeAsync(9_000)
    expect(a.refs).toBe(0)
    expect(a.listenerCount).toBe(0)
    expect(host.releases.filter(id => id === 'a')).toHaveLength(1)
  })

  it('dispose cancels pending sends and releases every reference exactly once', async () => {
    const a = await attachCurrent()
    a.fail()
    await vi.advanceTimersByTimeAsync(500)
    host.runner.dispose(); host.runner.dispose()
    expect(a.refs).toBe(1) // Only the main view remains.
    expect(a.listenerCount).toBe(0)
    expect(host.releases.filter(id => id === 'a')).toHaveLength(1)
    await vi.advanceTimersByTimeAsync(5_000)
    expect(a.prompts).toEqual([])
  })

  it('connection reset releases the old chain and fences a late ready rejection', async () => {
    const a = host.add('a')
    const reject = a.deferOpen()
    host.select('a')
    a.setRunning(true)
    await vi.advanceTimersByTimeAsync(1_100)
    host.reset()
    const replacement = host.add('a', { running: true })
    host.select('a')
    await vi.advanceTimersByTimeAsync(1_100)
    reject(new Error('old generation opening failed'))
    await vi.advanceTimersByTimeAsync(0)
    expect(replacement.refs).toBe(2)
    replacement.fail()
    await vi.advanceTimersByTimeAsync(3_000)
    expect(replacement.prompts).toEqual(['继续'])
    expect(a.prompts).toEqual([])
  })

  it('does not send from a dead generation whose stale snapshot still says OPEN', async () => {
    setAutoContinueConfig({ waitSeconds: 1 })
    const a = await attachCurrent()
    a.fail()
    await vi.advanceTimersByTimeAsync(500)
    a.invalidate()
    // The fire happens before the next tracking tick.
    host.runner.resumeNow()
    await vi.advanceTimersByTimeAsync(0)
    expect(a.snap.openState).toBe('open')
    expect(a.prompts).toEqual([])
  })

  it('a fulfilled ready promise with openState ERROR is not successful history opening', async () => {
    const a = host.add('a', { running: true })
    a.snap.openState = 'error'
    await vi.advanceTimersByTimeAsync(1_100)
    a.fail()
    await vi.advanceTimersByTimeAsync(10_000)
    expect(a.prompts).toEqual([])
    expect(host.acquisitions.filter(id => id === 'a')).toHaveLength(1)
  })
})
