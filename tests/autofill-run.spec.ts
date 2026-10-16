import { afterEach, describe, expect, it, vi } from 'vitest'
import { AUTOFILL_CONFIG_PATH, PI_AI_NS } from '../src/constants.js'
import { createIdleAutofill } from '../src/client/injection/autofill-run.js'
import type { RemoteApi } from '../src/client/types.js'

function deferred<T>(): { promise: Promise<T>; resolve(value: T): void } {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((done) => { resolve = done })
  return { promise, resolve }
}

function config(data: unknown = {}): Response {
  return new Response(JSON.stringify({ ok: true, data }))
}

function fixture() {
  const namespace = {
    ns: PI_AI_NS,
    schema: {},
    value: {},
    user: { providers: { relay: { api: 'openai-completions', models: [{ id: 'qwen2.5-vl-72b' }] } } },
    base: {},
    revision: 7,
    applies: 'live',
    secrets: [],
  }
  const describe = vi.fn(async () => ({ ok: true, value: { namespaces: [namespace], writable: true } }))
  const mutate = vi.fn(async (_namespace: string, _ops: unknown[], _revision?: number) => ({ ok: true }))
  const api = { settings: { describe, mutate } } as unknown as RemoteApi
  return { autofill: createIdleAutofill({ api }), describe, mutate }
}

/** Drain fire-and-forget work, including settled fetch/json/describe promises. */
async function settle(): Promise<void> {
  await new Promise<void>(resolve => setImmediate(resolve))
}

afterEach(() => { vi.unstubAllGlobals() })

describe('idle autofill host-switch cache', () => {
  it.each([
    ['HTTP refusal', () => Promise.resolve(new Response(null, { status: 503 }))],
    ['unsuccessful envelope', () => Promise.resolve(new Response(JSON.stringify({ ok: false })))],
    ['invalid JSON', () => Promise.resolve(new Response('{'))],
    ['network rejection', () => Promise.reject(new Error('offline'))],
    ['synchronous fetch failure', () => { throw new Error('fetch unavailable') }],
  ] as const)('retries %s on the next run and respects recovered disabled settings', async (_name, failedRead) => {
    const fetch = vi.fn<typeof globalThis.fetch>()
      .mockImplementationOnce(failedRead)
      .mockResolvedValue(config({ autofill: false }))
    vi.stubGlobal('fetch', fetch)
    const { autofill, describe, mutate } = fixture()

    autofill.run()
    await settle()
    // Preserve the existing defaults for the run whose host read failed.
    expect(mutate).toHaveBeenCalledTimes(1)

    autofill.run()
    await settle()
    expect(fetch).toHaveBeenCalledTimes(2)
    expect(fetch).toHaveBeenLastCalledWith(AUTOFILL_CONFIG_PATH, { method: 'GET' })
    expect(describe).toHaveBeenCalledTimes(1)
    expect(mutate).toHaveBeenCalledTimes(1)

    autofill.run()
    await settle()
    expect(fetch).toHaveBeenCalledTimes(2)
    expect(mutate).toHaveBeenCalledTimes(1)
  })

  it('shares a pending successful read and preserves explicit modality opt-out', async () => {
    const pending = deferred<Response>()
    const fetch = vi.fn<typeof globalThis.fetch>().mockReturnValue(pending.promise)
    vi.stubGlobal('fetch', fetch)
    const { autofill, mutate } = fixture()
    autofill.run()
    autofill.run()
    expect(fetch).toHaveBeenCalledTimes(1)
    pending.resolve(config({ autofill: true, modalityAutofill: false }))
    await settle()
    expect(mutate).toHaveBeenCalledTimes(2)
    const [namespace, ops, revision] = mutate.mock.calls[0]!
    expect(namespace).toBe(PI_AI_NS)
    expect(revision).toBe(7)
    const model = (ops[0] as { value: Record<string, unknown>[] }).value[0]!
    expect(model['reasoningEfforts']).toBeDefined()
    expect(model['input']).toBeUndefined()

    autofill.run()
    await settle()
    expect(fetch).toHaveBeenCalledTimes(1)
  })

  it('keeps omitted and non-false switch values enabled', async () => {
    const fetch = vi.fn<typeof globalThis.fetch>().mockResolvedValue(config({ autofill: 0 }))
    vi.stubGlobal('fetch', fetch)
    const { autofill, mutate } = fixture()
    autofill.run()
    await settle()
    const ops = mutate.mock.calls[0]![1]
    const model = (ops[0] as { value: Record<string, unknown>[] }).value[0]!
    expect(model['reasoningEfforts']).toBeDefined()
    expect(model['input']).toEqual(['text', 'image'])
  })

  it('re-reads successful settings after invalidation', async () => {
    const fetch = vi.fn<typeof globalThis.fetch>()
      .mockResolvedValueOnce(config({ autofill: false }))
      .mockResolvedValue(config())
    vi.stubGlobal('fetch', fetch)
    const { autofill, mutate } = fixture()
    autofill.run()
    await settle()
    expect(mutate).not.toHaveBeenCalled()
    autofill.invalidate()
    autofill.run()
    await settle()
    expect(fetch).toHaveBeenCalledTimes(2)
    expect(mutate).toHaveBeenCalledTimes(1)
  })

  it.each(['failure', 'success'] as const)('ignores stale %s while the replacement read is pending', async (outcome) => {
    const stale = deferred<Response>()
    const current = deferred<Response>()
    const fetch = vi.fn<typeof globalThis.fetch>()
      .mockReturnValueOnce(stale.promise)
      .mockReturnValue(current.promise)
    vi.stubGlobal('fetch', fetch)
    const { autofill, describe, mutate } = fixture()
    autofill.run()
    autofill.invalidate()
    autofill.run()
    expect(fetch).toHaveBeenCalledTimes(2)

    stale.resolve(outcome === 'failure' ? new Response(null, { status: 503 }) : config())
    await settle()
    expect(describe).not.toHaveBeenCalled()
    autofill.run()
    expect(fetch).toHaveBeenCalledTimes(2)
    current.resolve(config({ autofill: false }))
    await settle()
    autofill.run()
    await settle()
    expect(fetch).toHaveBeenCalledTimes(2)
    expect(mutate).not.toHaveBeenCalled()
  })

  it('abandons a pending settings describe when invalidated before the write', async () => {
    const fetch = vi.fn<typeof globalThis.fetch>().mockResolvedValue(config())
    vi.stubGlobal('fetch', fetch)
    const { autofill, describe, mutate } = fixture()
    const result = await describe()
    describe.mockClear()
    const pending = deferred<typeof result>()
    describe.mockReturnValueOnce(pending.promise)
    autofill.run()
    await settle()
    expect(describe).toHaveBeenCalledTimes(1)
    autofill.invalidate()
    pending.resolve(result)
    await settle()
    expect(mutate).not.toHaveBeenCalled()
  })
})
