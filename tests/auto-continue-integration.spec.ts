// @vitest-environment jsdom
/**
 * The auto-continue watcher against the REAL session stack.
 *
 * The unit spec (auto-continue-run.spec.ts) drives the watcher over hand-built
 * doubles. This one loads the REAL `@deepseek-ai/dsh-api-session-controller`
 * client bundle (the same file the product page runs), extracts the real
 * `Session` class, and lets the test play the Host: durable events are
 * appended into the session's REAL event window, the running bit moves through
 * the REAL `handleRunning`, and the automatic reply goes out through the REAL
 * `prompt()` admission path into a recording remote stub.
 *
 * What this catches that doubles cannot: the durable event DATA shapes (the
 * `user/message` payload IS the UserMessage — the echo attribution used to
 * read a wrapper that does not exist), the snapshot's `subagent` field, the
 * `beginSubmission`/pendingSubmissions interplay, and `promptError` handling.
 *
 * The bundle ships as a `window.__ModuleLoader__.load({ factory })` module and
 * imports the gateway carrier (not installed outside the harness), so the
 * loader is shimmed and the one unneeded module is stubbed. The only source
 * surgery is exporting the internally-defined `Session` class, which the
 * public face declares type-only.
 */

import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { act } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { DEFAULT_AUTO_CONTINUE_CONFIG, setAutoContinueConfig, setAutoContinueEnabled } from '../src/client/auto-continue-pref.js'
import { mountAutoContinueController } from '../src/client/AutoContinueController.js'
import { createAutoContinue, type AutoContinueRunner } from '../src/client/injection/auto-continue-run.js'
import { zh } from '../src/client/locales.js'
import type { DurableEventLike } from '../src/client/auto-continue-rules.js'

// ---- Real bundle loading ----

const BUNDLE_PATH = resolve(process.cwd(), 'node_modules/@deepseek-ai/dsh-api-session-controller/lib/client.js')

/** The slice of the real Session face the test and the watcher touch. */
interface RealSession {
  sessionId: string
  eventSource: {
    append(entry: { type: string; event: DurableEventLike }): void
    replace(entries: readonly { type: string; event?: DurableEventLike }[], hasMore: boolean): void
    getSnapshot(): { entries: readonly { type: string; event?: DurableEventLike }[]; hasMore: boolean }
    subscribe(fn: () => void): () => void
  }
  getSnapshot(): {
    running: boolean
    blank: boolean
    promptAttempted: boolean
    promptError: { op: string; error: { code?: string; message?: string } } | null
    pendingSubmissions: readonly unknown[]
    subagent: unknown
  }
  subscribe(fn: () => void): () => void
  prompt(content: readonly { type: 'text'; text: string }[], mode: 'queue' | 'steer'): Promise<{ ok: boolean }>
  beginSubmission(input: { text: string; attachments: readonly never[]; mode?: string }): { requestId: string }
  handleRunning(running: boolean): void
}

interface RealPromptInput {
  requestId: string
  sessionId: string
  mode: string
  content: readonly { type: string; text?: string }[]
}

type RemotePromptAnswer = { ok: true; value: { accepted: true } } | { ok: false; error: { code: string; message: string } }

let real: { Session: new (sessionId: string, remote: unknown, options?: { address?: unknown }) => RealSession } | undefined

/** Load the real client bundle once per worker; export the internal Session. */
function loadRealSessionClass(): typeof real extends undefined ? never : NonNullable<typeof real>['Session'] {
  if (real !== undefined) return real.Session
  const source = readFileSync(BUNDLE_PATH, 'utf8')
  const marker = '\t\treturn module.exports;'
  if (!source.includes(marker)) throw new Error('session bundle: export tail not found; the surgery needs revisiting')
  const patched = source.replace(marker, '\t\texports.Session = Session;\n' + marker)
  const anchor = createRequire(pathToFileURL(BUNDLE_PATH))
  // The carrier (gateway) is not installed outside the harness; the Session
  // paths exercised here never construct its streams, so stubs suffice.
  const gatewayStub = {
    RemoteJournalStream: class {},
    RemoteSnapshotStream: class {},
    RemoteStreamCarrierError: class extends Error {},
    isRemoteFailure: () => false,
  }
  const requireShim = (id: string): unknown => (id === '@deepseek-ai/dsh-api-gateway/client' ? gatewayStub : anchor(id))
  let captured!: Record<string, unknown>
  const windowShim = {
    __ModuleLoader__: {
      load(def: { factory: (require: (id: string) => unknown) => unknown }): void {
        captured = def.factory(requireShim) as Record<string, unknown>
      },
    },
  }
  new Function('window', patched)(windowShim)
  const Session = captured['Session']
  if (typeof Session !== 'function') throw new Error('session bundle: Session class not captured')
  real = { Session: Session as NonNullable<typeof real>['Session'] }
  return real.Session
}

// ---- The fake Host the test plays ----

interface Harness {
  session: RealSession
  prompts: RealPromptInput[]
  setPromptAnswer(answer: RemotePromptAnswer): void
  deferNextPrompt(): { resolve: (answer: RemotePromptAnswer) => void }
  append(type: string, data: unknown): void
  runner: AutoContinueRunner
  setCurrent(id: string | undefined): void
}

function makeHarness(sessionId: string, options?: { address?: unknown }): Harness {
  const Session = loadRealSessionClass()
  const prompts: RealPromptInput[] = []
  let answer: RemotePromptAnswer = { ok: true, value: { accepted: true } }
  let deferredResponse: Promise<RemotePromptAnswer> | undefined
  const remote = {
    session: {
      prompt: async (input: RealPromptInput) => {
        prompts.push(input)
        const response = deferredResponse
        deferredResponse = undefined
        return response ?? answer
      },
    },
    subagents: {},
  }
  const session = new Session(sessionId, remote, options)

  let seq = 0
  const harness: Harness = {
    session,
    prompts,
    setPromptAnswer(next) { answer = next },
    deferNextPrompt() {
      let resolve!: (answer: RemotePromptAnswer) => void
      deferredResponse = new Promise<RemotePromptAnswer>((accept) => { resolve = accept })
      return { resolve }
    },
    append(type, data) {
      seq += 1
      session.eventSource.append({ type: 'event', event: { type, seq, time: Date.now(), data } })
    },
    runner: undefined as unknown as AutoContinueRunner,
    setCurrent: undefined as unknown as (id: string | undefined) => void,
  }

  let currentId: string | undefined
  const sessions = {
    binding: (id: string) => (id === sessionId ? { sessionId, session, eventSource: session.eventSource } : undefined),
    list: { getSnapshot: () => ({ byId: {} }) },
  }
  const uiSession = { adapter: { current: { getSnapshot: () => ({ key: currentId }) } } }
  const ctx = {
    get: (name: string) => (name === 'sessions' ? sessions : name === 'uiSession' ? uiSession : undefined),
    on: (_event: string, _listener: () => void) => () => {},
  }
  harness.runner = createAutoContinue({ ctx, t: (key) => (key === 'autoContinueMessage' ? '继续' : key) })
  harness.setCurrent = (id) => { currentId = id }
  return harness
}

/** The view finished opening the session: its window is now the truth. The
 * real doOpen flips openState and marks the snapshot dirty in the same
 * breath — replaying that pairing here matters, because the watcher reads
 * the openState through the (rebuilt) snapshot cache. */
function openHistory(harness: Harness): void {
  ;(harness.session as unknown as { openState: string }).openState = 'open'
  ;(harness.session as unknown as { notifier: { markDirty(): void } }).notifier.markDirty()
  const win = harness.session.eventSource.getSnapshot()
  harness.session.eventSource.replace([...win.entries], win.hasMore)
}

/** The real UserMessage payload a durable `user/message` event carries. */
function userMessage(text: string, source: unknown = { kind: 'user' }): unknown {
  return { id: `u${Math.random()}`, role: 'user', source, content: [{ type: 'text', text }] }
}

/** The real AssistantMessage-bearing payload of a durable `assistant/message`. */
function assistantMessage(text: string): unknown {
  return {
    turn: 1, step: 1,
    message: { id: `a${Math.random()}`, role: 'assistant', source: 'model', content: [{ type: 'text', text }] },
    stream: [],
  }
}

/** Drive one failed-turn cycle the way the Host would land it. `onSent` runs
 * the moment the automatic reply has gone out (detected by watching the
 * prompt record), so the durable echo lands within seconds of the send —
 * exactly when production admits it. */
async function failTurn(
  harness: Harness,
  turn: number,
  reason: Record<string, unknown>,
  body: Array<readonly [string, unknown]> = [],
  onSent?: () => void,
): Promise<void> {
  for (const [type, data] of body) harness.append(type, data)
  harness.append('turn/end', { turn, reason })
  harness.session.handleRunning(true)
  harness.session.handleRunning(false)
  await vi.advanceTimersByTimeAsync(500)
  let sentAt = harness.prompts.length
  let echoed = false
  for (let second = 0; second < 40; second += 1) {
    await vi.advanceTimersByTimeAsync(1_000)
    if (!echoed && onSent !== undefined && harness.prompts.length > sentAt) {
      echoed = true
      onSent()
    }
    sentAt = harness.prompts.length
  }
  if (!echoed) onSent?.()
}

let disposer: (() => void) | undefined
let unmountController: (() => void) | undefined

beforeEach(() => {
  vi.useFakeTimers()
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
  setAutoContinueEnabled(true)
  setAutoContinueConfig(DEFAULT_AUTO_CONTINUE_CONFIG)
})

afterEach(async () => {
  if (unmountController !== undefined) await act(async () => { unmountController?.() })
  unmountController = undefined
  disposer?.()
  disposer = undefined
  vi.useRealTimers()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
  window.localStorage.clear()
  document.body.innerHTML = ''
})

describe('auto-continue against the real session stack', () => {
  it('sends 继续 through the real prompt path when a turn dies on transport', async () => {
    const harness = makeHarness('sess-1')
    disposer = harness.runner.dispose
    harness.setCurrent('sess-1')
    harness.append('turn/start', { turn: 1 })
    harness.append('user/message', userMessage('帮我写个爬虫'))
    harness.append('assistant/message', assistantMessage('好的，我先抓取页面…'))
    harness.session.handleRunning(true)
    await vi.advanceTimersByTimeAsync(1_100)
    // The harness is now attached (wasRunning=true recorded by the real snapshot).
    openHistory(harness)

    await failTurn(harness, 1, { kind: 'error', error: { message: 'other side closed', code: 'TRANSPORT' } })

    expect(harness.prompts).toHaveLength(1)
    const sent = harness.prompts[0]!
    expect(sent.sessionId).toBe('sess-1')
    expect(sent.mode).toBe('queue')
    expect(sent.content).toEqual([{ type: 'text', text: '继续' }])
    expect(typeof sent.requestId).toBe('string')
    // The real admission path ran: promptAttempted latched, no refusal recorded.
    expect(harness.session.getSnapshot().promptAttempted).toBe(true)
    expect(harness.session.getSnapshot().promptError).toBeNull()
  })

  it('keeps the streak cap across max-tokens chains even though every reply echoes back durably', async () => {
    const harness = makeHarness('sess-1')
    disposer = harness.runner.dispose
    harness.setCurrent('sess-1')
    harness.append('user/message', userMessage('写一份很长的报告'))
    harness.session.handleRunning(true)
    await vi.advanceTimersByTimeAsync(1_100)
    openHistory(harness)

    // Five cut-offs. After each automatic reply the HOST lands the durable
    // user/message echo (the real payload shape) within seconds of the send —
    // exactly when production admits it.
    for (let turn = 1; turn <= 5; turn += 1) {
      await failTurn(harness, turn, { kind: 'max-tokens' }, [
        ['assistant/message', assistantMessage(`第 ${turn} 段…`)],
      ], turn > 1 ? () => harness.append('user/message', userMessage('继续')) : undefined)
    }
    expect(harness.prompts).toHaveLength(5)

    // The sixth cut-off stands down: the cap did not reset on our own echoes.
    await failTurn(harness, 6, { kind: 'max-tokens' }, [
      ['assistant/message', assistantMessage('第 6 段…')],
    ], () => harness.append('user/message', userMessage('继续')))
    expect(harness.prompts).toHaveLength(5)

    // The user answers by hand (different text): the streak resets and the
    // next cut-off is continued again.
    harness.append('user/message', userMessage('我来接着写'))
    harness.session.handleRunning(true)
    await vi.advanceTimersByTimeAsync(1_100)
    await failTurn(harness, 7, { kind: 'max-tokens' }, [
      ['assistant/message', assistantMessage('第 7 段…')],
    ])
    expect(harness.prompts).toHaveLength(6)
    expect(harness.prompts.at(-1)).toMatchObject({ content: [{ type: 'text', text: '继续' }] })
  })

  it('keeps the visible controller and streak cap through model/time context notices', async () => {
    setAutoContinueConfig({ ...DEFAULT_AUTO_CONTINUE_CONFIG, maxRetries: 2 })
    const harness = makeHarness('context-chain')
    disposer = harness.runner.dispose
    harness.setCurrent('context-chain')
    document.body.innerHTML = '<div data-composer-dock><span data-composer-stat="turns">1 轮</span><span data-composer-stat="steps">2 步</span></div>'
    for (const pill of document.querySelectorAll<HTMLElement>('[data-composer-stat]')) {
      vi.spyOn(pill, 'getClientRects').mockReturnValue([{}] as unknown as DOMRectList)
    }
    const t = (key: string, params?: Record<string, unknown>): string => (
      (zh[key as keyof typeof zh] ?? key).replace(/\{(\w+)\}/g, (_match, name: string) => String(params?.[name] ?? ''))
    )
    await act(async () => {
      unmountController = mountAutoContinueController({ runner: harness.runner, t, onSettings: () => {} })
      harness.append('user/message', userMessage('继续完成发布工作'))
      harness.session.handleRunning(true)
      await vi.advanceTimersByTimeAsync(1_100)
      openHistory(harness)
    })
    const notice = () => harness.append('user/message', userMessage('[model changed: selected another model]', {
      kind: 'model-selection', form: 'notice',
    }))
    const clock = () => harness.append('user/message', userMessage('Time sampled while preparing the next step', {
      kind: 'time-context', form: 'snapshot',
    }))
    for (let turn = 1; turn <= 2; turn += 1) {
      await act(async () => {
        await failTurn(harness, turn, { kind: 'max-tokens' }, [], () => {
          // Exercise both orders: context before the durable echo must not
          // consume its attribution; context after it must not clear the chain.
          if (turn === 1) notice()
          harness.append('user/message', userMessage('继续'))
          if (turn === 2) notice()
          clock()
          harness.session.handleRunning(true)
        })
      })
      expect(harness.prompts).toHaveLength(turn)
      expect(harness.runner.status()).toMatchObject({ phase: 'sent', consecutive: turn })
      expect(document.querySelector('.bre-ac-chip-sent')?.textContent).toContain('已继续')
      expect(document.querySelector('.bre-ac-chip-sent')?.textContent).toContain(`${turn}/2`)
      expect(document.querySelector('[data-composer-dock] [data-bre-autocontinue]')).not.toBeNull()
    }
    await act(async () => { await failTurn(harness, 3, { kind: 'max-tokens' }) })
    expect(harness.prompts).toHaveLength(2)
    expect(harness.runner.status()).toMatchObject({ phase: 'exhausted', consecutive: 2 })
    expect(document.querySelector('.bre-ac-chip-exhausted')?.textContent).toContain('已停手')
    expect(document.querySelector('.bre-ac-chip-exhausted')?.textContent).toContain('2/2')
  })

  it.each(['model-selection', 'time-context'])('keeps a stopped session muted after %s context but respects real user intent', async (kind) => {
    const harness = makeHarness('stopped-context')
    disposer = harness.runner.dispose
    harness.setCurrent('stopped-context')
    harness.append('user/message', userMessage('长任务'))
    harness.session.handleRunning(true)
    await vi.advanceTimersByTimeAsync(1_100)
    openHistory(harness)
    await failTurn(harness, 1, { kind: 'max-tokens' })
    harness.runner.stop()
    const text = kind === 'model-selection' ? '[model changed: selected another model]' : 'Time sampled while preparing the next step'
    harness.append('user/message', userMessage(text, { kind }))
    expect(harness.runner.status()).toMatchObject({ phase: 'idle', muted: true })
    await failTurn(harness, 2, { kind: 'max-tokens' })
    expect(harness.prompts).toHaveLength(1)
    // Identical text submitted by the user still re-enables the session.
    harness.append('user/message', userMessage(text))
    expect(harness.runner.status().muted).toBe(false)
    await failTurn(harness, 3, { kind: 'max-tokens' })
    expect(harness.prompts).toHaveLength(2)
  })

  it('never continues a turn that completed', async () => {
    const harness = makeHarness('sess-1')
    disposer = harness.runner.dispose
    harness.setCurrent('sess-1')
    harness.append('user/message', userMessage('总结一下'))
    harness.session.handleRunning(true)
    await vi.advanceTimersByTimeAsync(1_100)
    openHistory(harness)
    await failTurn(harness, 1, { kind: 'completed' }, [
      ['assistant/message', assistantMessage('总结如下…')],
    ])
    expect(harness.prompts).toHaveLength(0)
  })

  it('removes the real controller on completion and ignores a delayed prompt admission reply', async () => {
    const harness = makeHarness('late-admission')
    disposer = harness.runner.dispose
    harness.setCurrent('late-admission')
    document.body.innerHTML = '<div data-composer-dock><span data-composer-stat="turns">1 轮</span></div>'
    vi.spyOn(document.querySelector<HTMLElement>('[data-composer-stat]')!, 'getClientRects').mockReturnValue([{}] as unknown as DOMRectList)
    const response = harness.deferNextPrompt()
    await act(async () => {
      unmountController = mountAutoContinueController({ runner: harness.runner, t: (key) => key, onSettings: () => {} })
      harness.append('user/message', userMessage('长任务'))
      harness.session.handleRunning(true)
      await vi.advanceTimersByTimeAsync(1_100)
      openHistory(harness)
      harness.append('turn/end', { turn: 1, reason: { kind: 'max-tokens' } })
      harness.session.handleRunning(false)
      await vi.advanceTimersByTimeAsync(3_000)
    })
    expect(harness.prompts).toHaveLength(1)
    expect(harness.runner.status()).toMatchObject({ phase: 'sent', consecutive: 1, nextSendAt: 0 })
    expect(document.querySelector('.bre-ac-chip-sent')).not.toBeNull()
    await act(async () => {
      // Journal frames may settle the resumed turn before admission's RPC reply.
      harness.append('turn/start', { turn: 2 })
      harness.append('user/message', userMessage('继续'))
      harness.session.handleRunning(true)
      harness.append('assistant/message', assistantMessage('已完成'))
      harness.append('turn/end', { turn: 2, reason: { kind: 'completed' } })
      harness.session.handleRunning(false)
      await vi.advanceTimersByTimeAsync(10)
    })
    expect(harness.runner.status()).toMatchObject({ phase: 'idle', consecutive: 0 })
    expect(document.querySelector('.bre-ac-chip')).toBeNull()
    await act(async () => {
      response.resolve({ ok: true, value: { accepted: true } })
      await vi.advanceTimersByTimeAsync(10_000)
    })
    expect(harness.runner.status()).toMatchObject({ phase: 'idle', consecutive: 0, nextSendAt: 0 })
    expect(document.querySelector('.bre-ac-chip')).toBeNull()
    expect(harness.prompts).toHaveLength(1)
  })

  it('continues the next real cutoff after an older prompt admission reply arrives', async () => {
    const harness = makeHarness('late-admission-cutoff')
    disposer = harness.runner.dispose
    harness.setCurrent('late-admission-cutoff')
    const response = harness.deferNextPrompt()
    harness.append('user/message', userMessage('长任务'))
    harness.session.handleRunning(true)
    await vi.advanceTimersByTimeAsync(1_100)
    openHistory(harness)
    harness.append('turn/end', { turn: 1, reason: { kind: 'max-tokens' } })
    harness.session.handleRunning(false)
    await vi.advanceTimersByTimeAsync(3_000)
    expect(harness.prompts).toHaveLength(1)
    expect(harness.runner.status()).toMatchObject({ phase: 'sent', consecutive: 1 })
    // Unlike beginSubmission, the real automatic prompt does not manufacture
    // a pending composer echo, even while its admission RPC is unresolved.
    expect(harness.session.getSnapshot().pendingSubmissions).toHaveLength(0)
    harness.append('turn/start', { turn: 2 })
    harness.append('user/message', userMessage('继续'))
    harness.session.handleRunning(true)
    harness.append('assistant/message', assistantMessage('尚未完成的下一片段'))
    harness.append('turn/end', { turn: 2, reason: { kind: 'max-tokens' } })
    harness.session.handleRunning(false)
    // A short turn can coalesce away its running edge; allow the poll and
    // evaluation to arm, then follow the actual configurable send deadline.
    await vi.advanceTimersByTimeAsync(2_000)
    const waiting = harness.runner.status()
    expect(waiting).toMatchObject({ phase: 'waiting', consecutive: 1 })
    expect(harness.session.getSnapshot().pendingSubmissions).toHaveLength(0)
    response.resolve({ ok: true, value: { accepted: true } })
    await vi.advanceTimersByTimeAsync(10)
    expect(harness.runner.status()).toMatchObject({ phase: 'waiting', consecutive: 1, nextSendAt: waiting.nextSendAt })
    await vi.advanceTimersByTimeAsync(Math.max(0, waiting.nextSendAt - Date.now()) + 1)
    expect(harness.prompts).toHaveLength(2)
    expect(harness.runner.status()).toMatchObject({ phase: 'sent', consecutive: 2, nextSendAt: 0 })
  })

  it('holds off while a real beginSubmission echo is pending', async () => {
    const harness = makeHarness('sess-1')
    disposer = harness.runner.dispose
    harness.setCurrent('sess-1')
    harness.append('user/message', userMessage('做点事'))
    harness.session.handleRunning(true)
    await vi.advanceTimersByTimeAsync(1_100)
    openHistory(harness)
    // The user typed a new message; the local echo is pending admission.
    harness.session.beginSubmission({ text: '等等，换个思路', attachments: [] })
    expect(harness.session.getSnapshot().pendingSubmissions).toHaveLength(1)
    await failTurn(harness, 1, { kind: 'error', error: { message: 'died', code: 'TRANSPORT' } })
    expect(harness.prompts).toHaveLength(0)
  })

  it('counts a real prompt refusal toward the streak and surfaces promptError', async () => {
    const harness = makeHarness('sess-1')
    disposer = harness.runner.dispose
    harness.setPromptAnswer({ ok: false, error: { code: 'gateway/unreachable', message: 'transport dead' } })
    harness.setCurrent('sess-1')
    harness.append('user/message', userMessage('长任务'))
    harness.session.handleRunning(true)
    await vi.advanceTimersByTimeAsync(1_100)
    openHistory(harness)

    for (let turn = 1; turn <= 5; turn += 1) {
      await failTurn(harness, turn, { kind: 'max-tokens' }, [
        ['assistant/message', assistantMessage(`片段 ${turn}`)],
      ])
    }
    expect(harness.prompts).toHaveLength(5)
    expect(harness.session.getSnapshot().promptError).toMatchObject({ op: 'send', error: { code: 'gateway/unreachable' } })
    // Refusals count: the cap stands after five failed attempts.
    await failTurn(harness, 6, { kind: 'max-tokens' })
    expect(harness.prompts).toHaveLength(5)
  })

  it('ignores a subagent session entirely', async () => {
    const harness = makeHarness('child-1', { address: { parentSessionId: 'p1', childSessionId: 'child-1', mode: 'continuable' } })
    disposer = harness.runner.dispose
    harness.setCurrent('child-1')
    expect(harness.session.getSnapshot().subagent).not.toBeNull()
    harness.append('user/message', userMessage('子任务'))
    harness.session.handleRunning(true)
    await vi.advanceTimersByTimeAsync(1_100)
    await failTurn(harness, 1, { kind: 'error', error: { message: 'died', code: 'TRANSPORT' } })
    expect(harness.prompts).toHaveLength(0)
  })

  it('ignores endings that already sit in the window when the watcher attaches', async () => {
    const harness = makeHarness('sess-1')
    disposer = harness.runner.dispose
    harness.setCurrent('sess-1')
    // The failure predates the attachment: no running edge is ever observed.
    harness.append('user/message', userMessage('旧任务'))
    harness.append('assistant/message', assistantMessage('部分输出…'))
    harness.append('turn/end', { turn: 1, reason: { kind: 'error', error: { message: 'died', code: 'TRANSPORT' } } })
    harness.session.handleRunning(false)
    await vi.advanceTimersByTimeAsync(30_000)
    expect(harness.prompts).toHaveLength(0)
  })

  it('keeps answering a session the view moved away from', async () => {
    const harness = makeHarness('sess-1')
    disposer = harness.runner.dispose
    harness.setCurrent('sess-1')
    harness.append('user/message', userMessage('做点事'))
    harness.session.handleRunning(true)
    await vi.advanceTimersByTimeAsync(1_100)
    openHistory(harness)
    harness.append('turn/end', { turn: 1, reason: { kind: 'error', error: { message: 'died', code: 'TRANSPORT' } } })
    harness.session.handleRunning(false)
    await vi.advanceTimersByTimeAsync(500)
    harness.setCurrent('sess-2')
    await vi.advanceTimersByTimeAsync(10_000)
    // The armed wait belongs to sess-1 and fires there; only the CHIP stops,
    // because the chip renders whichever session is on screen.
    expect(harness.prompts).toHaveLength(1)
    expect(harness.runner.status().sessionId).toBeUndefined()
  })

  // The 0.2 composer gives every pill its own slot entry, so no element wraps
  // them all: widest-common-ancestor search lands on the slot container and the
  // chip would sit left of the context meter — or vanish with the pills.
  it('anchors to the composer dock when the pills share no stat line', async () => {
    const harness = makeHarness('dock-anchor')
    disposer = harness.runner.dispose
    harness.setCurrent('dock-anchor')
    document.body.innerHTML = [
      '<div data-composer-dock>',
      '<div class="pill-slot"><span data-composer-stat="activity">2 轮</span></div>',
      '<span class="meter">2%</span>',
      '</div>',
    ].join('')
    vi.spyOn(HTMLElement.prototype, 'getClientRects').mockReturnValue([{}] as unknown as DOMRectList)
    const response = harness.deferNextPrompt()
    await act(async () => {
      unmountController = mountAutoContinueController({ runner: harness.runner, t: (key) => key, onSettings: () => {} })
      harness.append('user/message', userMessage('长任务'))
      harness.session.handleRunning(true)
      await vi.advanceTimersByTimeAsync(1_100)
      openHistory(harness)
      harness.append('turn/end', { turn: 1, reason: { kind: 'max-tokens' } })
      harness.session.handleRunning(false)
      await vi.advanceTimersByTimeAsync(3_000)
    })
    const dock = document.querySelector('[data-composer-dock]')!
    const seat = (): Element | null | undefined => (
      Array.from(dock.children).find(child => child.hasAttribute('data-bre-autocontinue'))
    )
    expect(seat()).toBeDefined()
    // Last child: right of the context meter, the row's end.
    expect(dock.lastElementChild).toBe(seat())

    // Every pill can disappear (activity reports 0 steps, usage has no tokens);
    // the dock alone must keep the chip anchored.
    document.querySelector('.pill-slot')!.remove()
    await act(async () => { await vi.advanceTimersByTimeAsync(2_100) })
    expect(seat()).toBeDefined()
    await act(async () => { response.resolve({ ok: true, value: { accepted: true } }) })
  })
})
