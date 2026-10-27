/**
 * Fingerprint probe dispatch: the one module that talks to the harness `llm`.
 *
 * These tests pin the contract that makes the probe compatible with the
 * harness's prepared-call protocol, which is the only thing that can silently
 * break at runtime: the frozen call-config echo, the "visible answer only"
 * collection rule, and the difference between a dead challenge and a cancelled
 * run.
 */

import { describe, expect, it, vi } from 'vitest'
import {
  DEFAULT_PROBE_MAX_TOKENS,
  DEFAULT_PROBE_TIMEOUT_MS,
  runProbe,
  type ProbeChallenge,
  type ProbeOutcome,
} from '../src/fingerprint/run.js'

const CHALLENGES: ProbeChallenge[] = [
  { id: 'probe-1-aaa', expected_count: 300, prompt: 'P1' },
  { id: 'probe-2-bbb', expected_count: 301, prompt: 'P2' },
  { id: 'probe-3-ccc', expected_count: 302, prompt: 'P3' },
]

/** The stream shape `PreparedLlmCall.stream` is expected to yield. */
function stream(...chunks: unknown[]): AsyncIterable<unknown> {
  return (async function* () {
    for (const chunk of chunks) yield chunk
  })()
}

interface Recorded {
  config: Record<string, unknown>
  request: Record<string, unknown>
}

/**
 * A dispatch that records both halves of one probe: what was prepared and what
 * was dispatched. Each challenge answers from `answers`, chosen by prompt.
 */
function dispatch(options: {
  answers?: Record<string, unknown[]>
  prepared?: Record<string, unknown>
  onPrepare?: (config: Record<string, unknown>) => void
}): { llm: { prepareCall(config: Record<string, unknown>, signal?: unknown): Promise<unknown> }; calls: Recorded[] } {
  const calls: Recorded[] = []
  const llm = {
    async prepareCall(config: Record<string, unknown>): Promise<unknown> {
      options.onPrepare?.(config)
      return {
        config: options.prepared === undefined ? config : { ...config, ...options.prepared },
        stream(request: Record<string, unknown>): AsyncIterable<unknown> {
          calls.push({ config, request })
          const messages = request['messages'] as Array<{ content: Array<{ text: string }> }> | undefined
          const text = String(messages?.[0]?.content?.[0]?.text ?? '')
          return stream(...(options.answers?.[text] ?? [{ type: 'finish', reason: { kind: 'stop' } }]))
        },
      }
    },
  }
  return { llm, calls }
}

describe('runProbe', () => {
  it('runs every challenge and keeps only the accepted answers', async () => {
    const { llm } = dispatch({
      answers: {
        P1: [{ type: 'text-delta', index: 0, text: '5 12 40 ' }, { type: 'finish', reason: { kind: 'stop' } }],
        P2: [{ type: 'text-delta', index: 0, text: '9 ' }, { type: 'finish', reason: { kind: 'stop' } }],
        P3: [{ type: 'text-delta', index: 0, text: '' }],
      },
    })
    const run = await runProbe({ provider: 'magpie', model: 'gpt-5.5', challenges: CHALLENGES, llm })

    expect(run.outcomes.map(outcome => outcome.ok)).toEqual([true, true, false])
    expect(run.outcomes.map(outcome => outcome.text)).toEqual(['5 12 40 ', '9 ', ''])
    // Only the two that produced a visible answer reach the bank.
    expect(run.outputs).toEqual([
      { text: '5 12 40 ', expected_count: 300 },
      { text: '9 ', expected_count: 301 },
    ])
  })

  it('carries the challenge identity through to each outcome', async () => {
    const { llm } = dispatch({})
    const run = await runProbe({ provider: 'magpie', model: 'claude-sonnet-5', challenges: CHALLENGES, llm })

    expect(run.outcomes.map(outcome => outcome.index)).toEqual([0, 1, 2])
    expect(run.outcomes.map(outcome => outcome.challengeId)).toEqual(['probe-1-aaa', 'probe-2-bbb', 'probe-3-ccc'])
    expect(run.outcomes.map(outcome => outcome.expectedCount)).toEqual([300, 301, 302])
  })

  it('sends one bare user message with no tools and no system prompt', async () => {
    const { llm, calls } = dispatch({})
    await runProbe({ provider: 'magpie', model: 'gpt-5.5', challenges: [CHALLENGES[0]!], llm })

    const request = calls[0]!.request
    expect(request['messages']).toEqual([{ role: 'user', content: [{ type: 'text', text: 'P1' }] }])
    expect(request['system']).toBeUndefined()
    // Empty is the explicit "none", so no adapter can project a default toolset.
    expect(request['tools']).toEqual([])
    expect(request['provider']).toBe('magpie')
    expect(request['model']).toBe('gpt-5.5')
    expect(request['signal']).toBeInstanceOf(AbortSignal)
  })

  it('proposes no reasoningEffort of its own', async () => {
    const proposed: Array<Record<string, unknown>> = []
    const { llm, calls } = dispatch({ onPrepare: config => proposed.push({ ...config }) })
    await runProbe({ provider: 'magpie', model: 'gpt-5.5', challenges: [CHALLENGES[0]!], llm })

    expect(proposed[0]!['reasoningEffort']).toBeUndefined()
    expect(calls[0]!.request['reasoningEffort']).toBeUndefined()
  })

  it('echoes the PREPARED call config back, not the proposed one', async () => {
    // The default-guard materialized an effort during preparation. Echoing the
    // request we proposed would mismatch and fail INVALID_PREPARED_CALL.
    const { llm, calls } = dispatch({
      prepared: { reasoningEffort: 'high', temperature: 0.3 },
    })
    await runProbe({ provider: 'magpie', model: 'gpt-5.5', challenges: [CHALLENGES[0]!], llm })

    const request = calls[0]!.request
    expect(request['reasoningEffort']).toBe('high')
    expect(request['temperature']).toBe(0.3)
  })

  it('keeps a prepared stop list and sampling cap on the request', async () => {
    const { llm, calls } = dispatch({
      prepared: { maxTokens: 1234, stop: ['\n\n'] },
    })
    await runProbe({ provider: 'magpie', model: 'gpt-5.5', challenges: [CHALLENGES[0]!], llm })

    const request = calls[0]!.request
    expect(request['maxTokens']).toBe(1234)
    expect(request['stop']).toEqual(['\n\n'])
  })

  it('collects visible answer text and ignores thinking and tool chatter', async () => {
    const { llm } = dispatch({
      answers: {
        P1: [
          { type: 'block-start', index: 0, blockType: 'thinking' },
          { type: 'reasoning-delta', index: 0, text: '6 7 8 ' },
          { type: 'text-delta', index: 0, text: '11 12 ' },
          { type: 'tool-call-delta', index: 1, id: 'x', name: 'calc', argumentsDelta: '{}' },
          { type: 'text-delta', index: 0, text: '13' },
          { type: 'finish', reason: { kind: 'stop' } },
        ],
      },
    })
    const run = await runProbe({ provider: 'magpie', model: 'gpt-5.5', challenges: [CHALLENGES[0]!], llm })

    // The reasoning-delta numbers never reach the bank: they would pollute the
    // distribution with whatever the model happened to think about.
    expect(run.outcomes[0]!.text).toBe('11 12 13')
    expect(run.outcomes[0]!.ok).toBe(true)
  })

  it('reports a terminal error finish as a dead challenge, not as an answer', async () => {
    const { llm } = dispatch({
      answers: {
        P1: [{ type: 'finish', reason: { kind: 'error', failure: { message: 'rate limited' } } }],
      },
    })
    const run = await runProbe({ provider: 'magpie', model: 'gpt-5.5', challenges: [CHALLENGES[0]!], llm })

    expect(run.outcomes[0]!.ok).toBe(false)
    expect(run.outcomes[0]!.error).toBe('error: rate limited')
    expect(run.outcomes[0]!.finish).toBe('error')
    expect(run.outputs).toEqual([])
  })

  it('reports a non-stop finish without a failure message by its kind alone', async () => {
    const { llm } = dispatch({
      answers: { P1: [{ type: 'finish', reason: { kind: 'max-tokens' } }] },
    })
    const run = await runProbe({ provider: 'magpie', model: 'gpt-5.5', challenges: [CHALLENGES[0]!], llm })

    expect(run.outcomes[0]!.ok).toBe(false)
    expect(run.outcomes[0]!.error).toBe('max-tokens')
  })

  it('treats a stream that never finishes as an error', async () => {
    const { llm } = dispatch({ answers: { P1: [{ type: 'text-delta', index: 0, text: '4 5 6' }] } })
    const run = await runProbe({ provider: 'magpie', model: 'gpt-5.5', challenges: [CHALLENGES[0]!], llm })

    expect(run.outcomes[0]!.ok).toBe(false)
    expect(run.outcomes[0]!.error).toBe('stream-ended')
  })

  it('reports a whitespace-only answer as having no visible text', async () => {
    const { llm } = dispatch({
      answers: { P1: [{ type: 'text-delta', index: 0, text: '  \n ' }, { type: 'finish', reason: { kind: 'stop' } }] },
    })
    const run = await runProbe({ provider: 'magpie', model: 'gpt-5.5', challenges: [CHALLENGES[0]!], llm })

    expect(run.outcomes[0]!.ok).toBe(false)
    expect(run.outcomes[0]!.error).toBe('the model answered with no visible text')
    expect(run.outputs).toEqual([])
  })

  it('reports a dispatch that prepares but never streams', async () => {
    const llm = {
      async prepareCall(): Promise<unknown> {
        return { config: {} }
      },
    }
    const run = await runProbe({ provider: 'magpie', model: 'gpt-5.5', challenges: [CHALLENGES[0]!], llm })

    expect(run.outcomes[0]!.ok).toBe(false)
    expect(run.outcomes[0]!.error).toBe('the llm service returned no dispatch')
  })

  it('falls back to the runtime stream when a prepared call carries none', async () => {
    // A loose harness shape returns the bare call config from prepareCall and
    // keeps dispatch on the service. Both halves have to work.
    const seen: Array<Record<string, unknown>> = []
    const llm = {
      async prepareCall(config: Record<string, unknown>): Promise<unknown> {
        return { ...config }
      },
      stream(request: Record<string, unknown>): AsyncIterable<unknown> {
        seen.push(request)
        return stream({ type: 'text-delta', index: 0, text: '1 2 3 ' }, { type: 'finish', reason: { kind: 'stop' } })
      },
    }
    const run = await runProbe({ provider: 'magpie', model: 'gpt-5.5', challenges: [CHALLENGES[0]!], llm })

    expect(run.outcomes[0]!.ok).toBe(true)
    expect(run.outcomes[0]!.text).toBe('1 2 3 ')
    expect(seen).toHaveLength(1)
  })

  it('prefers the prepared stream over the runtime one', async () => {
    const runtimeStream = vi.fn()
    const llm = {
      async prepareCall(): Promise<unknown> {
        return {
          config: {},
          stream(): AsyncIterable<unknown> {
            return stream({ type: 'text-delta', index: 0, text: 'prepared ' }, { type: 'finish', reason: { kind: 'stop' } })
          },
        }
      },
      stream: runtimeStream,
    }
    const run = await runProbe({ provider: 'magpie', model: 'gpt-5.5', challenges: [CHALLENGES[0]!], llm })

    expect(run.outcomes[0]!.text).toBe('prepared ')
    expect(runtimeStream).not.toHaveBeenCalled()
  })

  it('turns a rejected preparation into a dead challenge rather than a throw', async () => {
    const llm = {
      async prepareCall(): Promise<unknown> {
        throw new Error('no such provider route')
      },
    }
    const run = await runProbe({ provider: 'magpie', model: 'gpt-5.5', challenges: CHALLENGES, llm })

    expect(run.outcomes.every(outcome => !outcome.ok)).toBe(true)
    expect(run.outcomes[0]!.error).toBe('no such provider route')
    expect(run.outputs).toEqual([])
  })

  it('keeps the good challenges when only one dies', async () => {
    const { llm } = dispatch({
      answers: {
        P1: [{ type: 'text-delta', index: 0, text: '1 ' }, { type: 'finish', reason: { kind: 'stop' } }],
        P2: [{ type: 'finish', reason: { kind: 'error', failure: { message: 'boom' } } }],
        P3: [{ type: 'text-delta', index: 0, text: '2 ' }, { type: 'finish', reason: { kind: 'stop' } }],
      },
    })
    const run = await runProbe({ provider: 'magpie', model: 'gpt-5.5', challenges: CHALLENGES, llm })

    expect(run.outcomes.map(outcome => outcome.ok)).toEqual([true, false, true])
    expect(run.outputs).toEqual([
      { text: '1 ', expected_count: 300 },
      { text: '2 ', expected_count: 302 },
    ])
  })

  it('reports a caller cancellation as cancelled, not as a provider failure', async () => {
    const controller = new AbortController()
    const llm = {
      async prepareCall(): Promise<unknown> {
        controller.abort()
        throw new Error('the run was abandoned')
      },
    }
    const run = await runProbe({
      provider: 'magpie',
      model: 'gpt-5.5',
      challenges: [CHALLENGES[0]!],
      llm,
      signal: controller.signal,
    })

    expect(run.outcomes[0]!.error).toBe('cancelled')
  })

  it('reports an already-cancelled run without dispatching anything', async () => {
    const controller = new AbortController()
    controller.abort()
    const prepareCall = vi.fn()
    const run = await runProbe({
      provider: 'magpie',
      model: 'gpt-5.5',
      challenges: CHALLENGES,
      llm: { prepareCall },
      signal: controller.signal,
    })

    expect(prepareCall).not.toHaveBeenCalled()
    expect(run.outcomes.map(outcome => outcome.error)).toEqual(['cancelled', 'cancelled', 'cancelled'])
    expect(run.outputs).toEqual([])
  })

  it('offers every challenge together rather than one after another', async () => {
    // Three independent samples of one behaviour: serializing them only
    // triples the wall clock (design §5.3).
    let prepared = 0
    let released = false
    const { llm } = dispatch({
      answers: {
        P1: [{ type: 'text-delta', index: 0, text: '1 ' }, { type: 'finish', reason: { kind: 'stop' } }],
        P2: [{ type: 'text-delta', index: 0, text: '2 ' }, { type: 'finish', reason: { kind: 'stop' } }],
        P3: [{ type: 'text-delta', index: 0, text: '3 ' }, { type: 'finish', reason: { kind: 'stop' } }],
      },
      onPrepare: () => {
        prepared += 1
      },
    })
    const slow = {
      async prepareCall(config: Record<string, unknown>, signal?: unknown): Promise<unknown> {
        prepared += 1
        while (!released) await new Promise(resolve => setTimeout(resolve, 0))
        return llm.prepareCall(config, signal)
      },
    }
    const pending = runProbe({ provider: 'magpie', model: 'gpt-5.5', challenges: CHALLENGES, llm: slow })
    await new Promise(resolve => setTimeout(resolve, 0))
    // All three went out before any of them came back.
    expect(prepared).toBe(3)
    released = true
    const run = await pending
    expect(run.outputs).toHaveLength(3)
  })

  it('reports each challenge to onOutcome as it settles', async () => {
    const { llm } = dispatch({})
    const seen: ProbeOutcome[] = []
    const run = await runProbe({
      provider: 'magpie',
      model: 'gpt-5.5',
      challenges: CHALLENGES,
      llm,
      onOutcome: outcome => seen.push(outcome),
    })

    expect(seen).toHaveLength(3)
    expect([...seen].sort((a, b) => a.index - b.index)).toEqual(run.outcomes)
  })

  it('refuses to run with no challenge at all', async () => {
    const { llm } = dispatch({})
    await expect(
      runProbe({ provider: 'magpie', model: 'gpt-5.5', challenges: [], llm }),
    ).rejects.toThrow(/no challenges to run/)
  })

  it('defaults to two minutes per challenge and 4000 tokens of headroom', () => {
    expect(DEFAULT_PROBE_TIMEOUT_MS).toBe(120_000)
    expect(DEFAULT_PROBE_MAX_TOKENS).toBe(4000)
  })

  it('times every challenge: duration on all outcomes, first token only when text flowed', async () => {
    const { llm } = dispatch({
      answers: {
        P1: [{ type: 'text-delta', index: 0, text: '5 12 40 ' }, { type: 'finish', reason: { kind: 'stop' } }],
        P2: [{ type: 'finish', reason: { kind: 'error', failure: { message: 'boom' } } }],
        P3: [{ type: 'text-delta', index: 0, text: '' }],
      },
    })
    const run = await runProbe({ provider: 'magpie', model: 'gpt-5.5', challenges: CHALLENGES, llm })

    for (const outcome of run.outcomes) {
      expect(typeof outcome.durationMs).toBe('number')
      expect(outcome.durationMs!).toBeGreaterThanOrEqual(0)
    }
    // Only the challenge that actually produced text has a first-token wait;
    // a rejected or empty answer has nothing to timestamp.
    expect(run.outcomes[0]!.firstTokenMs).toBeGreaterThanOrEqual(0)
    expect(run.outcomes[1]!.firstTokenMs).toBeUndefined()
    expect(run.outcomes[2]!.firstTokenMs).toBeUndefined()
  })

  it('does not report an empty first delta as the first token', async () => {
    // Some adapters open with a zero-length delta; the wait must be measured
    // to the first character, or it reads as 0ms and the timing line lies.
    const { llm } = dispatch({
      answers: {
        P1: [
          { type: 'text-delta', index: 0, text: '' },
          { type: 'text-delta', index: 0, text: '5 ' },
          { type: 'finish', reason: { kind: 'stop' } },
        ],
      },
    })
    const run = await runProbe({ provider: 'magpie', model: 'gpt-5.5', challenges: [CHALLENGES[0]!], llm })

    expect(run.outcomes[0]!.firstTokenMs).toBeGreaterThanOrEqual(0)
  })

  it('early exit: a confident shouldStop aborts the still-running challenge and it is not progress', async () => {
    let thirdAborted = false
    const llm = {
      async prepareCall(config: Record<string, unknown>): Promise<unknown> {
        return { ...config }
      },
      stream(request: Record<string, unknown>): AsyncIterable<unknown> {
        const messages = request['messages'] as Array<{ content: Array<{ text: string }> }> | undefined
        const prompt = String(messages?.[0]?.content?.[0]?.text ?? '')
        if (prompt !== 'P3') {
          return stream({ type: 'text-delta', index: 0, text: '5 ' }, { type: 'finish', reason: { kind: 'stop' } })
        }
        // The third challenge hangs exactly the way a slow provider does, and
        // only ends once the early exit cancels it.
        return (async function* (): AsyncGenerator<unknown> {
          const signal = request['signal'] as AbortSignal | undefined
          while (signal?.aborted !== true) await new Promise(resolve => setTimeout(resolve, 0))
          thirdAborted = true
          // Ending without a finish chunk models the stream being cut.
        })()
      },
    }

    const gates: number[] = []
    const seen: ProbeOutcome[] = []
    const run = await runProbe({
      provider: 'magpie',
      model: 'gpt-5.5',
      challenges: CHALLENGES,
      llm,
      shouldStop: settled => {
        gates.push(settled.length)
        return settled.filter(outcome => outcome.ok).length >= 2
      },
      onOutcome: outcome => seen.push(outcome),
    })

    // The gate saw the run accumulate: one settled, then two — and once it
    // said stop it is never consulted again; the run is closing.
    expect(gates).toEqual([1, 2])
    expect(thirdAborted).toBe(true)
    // The aborted challenge still lands in the outcomes (as cancelled), but it
    // never reached onOutcome: it did not answer, so it is not progress.
    expect(run.outcomes).toHaveLength(3)
    expect(run.outcomes[2]!.ok).toBe(false)
    expect(run.outcomes[2]!.error).toBe('cancelled')
    expect(seen).toHaveLength(2)
    // The accepted subset is exactly the two that answered.
    expect(run.outputs).toEqual([
      { text: '5 ', expected_count: 300 },
      { text: '5 ', expected_count: 301 },
    ])
  })

  it('keeps all three running when shouldStop never says stop', async () => {
    const { llm } = dispatch({
      answers: {
        P1: [{ type: 'text-delta', index: 0, text: '1 ' }, { type: 'finish', reason: { kind: 'stop' } }],
        P2: [{ type: 'text-delta', index: 0, text: '2 ' }, { type: 'finish', reason: { kind: 'stop' } }],
        P3: [{ type: 'text-delta', index: 0, text: '3 ' }, { type: 'finish', reason: { kind: 'stop' } }],
      },
    })
    const seen: ProbeOutcome[] = []
    const run = await runProbe({
      provider: 'magpie',
      model: 'gpt-5.5',
      challenges: CHALLENGES,
      llm,
      shouldStop: () => false,
      onOutcome: outcome => seen.push(outcome),
    })

    expect(run.outputs).toHaveLength(3)
    expect(seen).toHaveLength(3)
  })

  it('does not consult shouldStop once the caller cancelled', async () => {
    const controller = new AbortController()
    controller.abort()
    const prepareCall = vi.fn()
    let consulted = false
    const run = await runProbe({
      provider: 'magpie',
      model: 'gpt-5.5',
      challenges: CHALLENGES,
      llm: { prepareCall },
      signal: controller.signal,
      shouldStop: () => {
        consulted = true
        return true
      },
    })

    expect(run.outcomes.every(outcome => outcome.error === 'cancelled')).toBe(true)
    expect(consulted).toBe(false)
  })
})
