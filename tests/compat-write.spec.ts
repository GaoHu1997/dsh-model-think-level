/**
 * The write seam's repair: a wire-protocol switch must carry the compat
 * cleanup of the switches its new protocol cannot take, in the SAME mutate —
 * otherwise the kernel refuses the save outright.
 *
 * Covers the pure op builder (withCompatCleanup / protocolsSwitched) and the
 * patched settings service (installCompatWriteSeam).
 */

import { afterEach, describe, expect, it, vi } from 'vitest'
import { PI_AI_NS } from '../src/constants.js'
import { protocolsSwitched, withCompatCleanup, type WriteOp } from '../src/compat-write.js'
import {
  installCompatWriteSeam,
  userProvidersOfDescribe,
} from '../src/client/injection/compat-write-seam.js'

afterEach(() => { vi.restoreAllMocks() })

describe('protocolsSwitched', () => {
  it('sees a protocol set on the path', () => {
    expect(protocolsSwitched([{ op: 'set', path: ['providers', 'free', 'api'], value: 'openai-responses' }]))
      .toBe(true)
  })
  it('sees a protocol inside a whole-profile set', () => {
    expect(protocolsSwitched([{ op: 'set', path: ['providers', 'free'], value: { api: 'openai-responses' } }]))
      .toBe(true)
  })
  it('ignores writes that name no protocol', () => {
    expect(protocolsSwitched([
      { op: 'set', path: ['providers', 'free', 'baseURL'], value: 'https://x/v1' },
      { op: 'set', path: ['providers', 'free', 'models', '0', 'compat'], value: {} },
      { op: 'unset', path: ['providers', 'free', 'api'] },
      { op: 'set', path: ['providers', 'free', 'api'], value: '' },
    ])).toBe(false)
  })
})

describe('withCompatCleanup', () => {
  /** The reported failure: free switched to responses with completions switches. */
  const free = {
    displayName: 'free',
    api: 'openai-completions',
    baseURL: 'https://freegg.app/v1',
    models: [
      {
        id: 'gpt-6-astra',
        compat: { supportsDeveloperRole: false, supportsReasoningEffort: true, thinkingFormat: 'openai' },
      },
      {
        id: 'gpt-6.1-sol',
        compat: { supportsDeveloperRole: false, supportsReasoningEffort: true, thinkingFormat: 'openai' },
      },
    ],
  }

  it('appends the cleaned models when the write only switches the protocol', () => {
    const ops: WriteOp[] = [{ op: 'set', path: ['providers', 'free', 'api'], value: 'openai-responses' }]
    const repaired = withCompatCleanup(ops, { free })
    expect(repaired).toEqual([
      { op: 'set', path: ['providers', 'free', 'api'], value: 'openai-responses' },
      {
        op: 'set',
        path: ['providers', 'free', 'models'],
        value: [
          { id: 'gpt-6-astra', compat: { supportsDeveloperRole: false } },
          { id: 'gpt-6.1-sol', compat: { supportsDeveloperRole: false } },
        ],
      },
    ])
  })

  it('cleans the caller\'s own models op in place instead of appending a second one', () => {
    const ops: WriteOp[] = [
      { op: 'set', path: ['providers', 'free', 'api'], value: 'openai-responses' },
      {
        op: 'set',
        path: ['providers', 'free', 'models'],
        value: [{ id: 'gpt-6.1-sol', compat: { supportsReasoningEffort: true, supportsStrictMode: true } }],
      },
    ]
    const repaired = withCompatCleanup(ops, { free })
    expect(repaired).toHaveLength(2)
    expect(repaired[1]).toEqual({
      op: 'set',
      path: ['providers', 'free', 'models'],
      value: [{ id: 'gpt-6.1-sol', compat: { supportsStrictMode: true } }],
    })
  })

  it('cleans a whole-profile write through the same single op', () => {
    const ops: WriteOp[] = [{
      op: 'set',
      path: ['providers', 'free'],
      value: {
        api: 'openai-responses',
        compat: { supportsReasoningEffort: true, supportsMaxOutputTokens: true },
        models: [{ id: 'gpt-6.1-sol', compat: { thinkingFormat: 'openai' } }],
      },
    }]
    const repaired = withCompatCleanup(ops, {})
    expect(repaired).toHaveLength(1)
    expect(repaired[0]).toEqual({
      op: 'set',
      path: ['providers', 'free'],
      value: {
        api: 'openai-responses',
        compat: { supportsMaxOutputTokens: true },
        models: [{ id: 'gpt-6.1-sol', compat: {} }],
      },
    })
  })

  it('sweeps the route-level compat block as well as the models', () => {
    const ops: WriteOp[] = [{ op: 'set', path: ['providers', 'free', 'api'], value: 'openai-responses' }]
    const repaired = withCompatCleanup(ops, {
      free: {
        api: 'openai-completions',
        compat: { supportsReasoningEffort: true, supportsStrictMode: true },
        models: [{ id: 'a', compat: { thinkingFormat: 'openai' } }],
      },
    })
    expect(repaired.map(op => [...op.path])).toEqual([
      ['providers', 'free', 'api'],
      ['providers', 'free', 'compat'],
      ['providers', 'free', 'models'],
    ])
  })

  it('leaves the ops alone when nothing on the route is foreign', () => {
    const ops: WriteOp[] = [{ op: 'set', path: ['providers', 'free', 'api'], value: 'openai-responses' }]
    const clean = {
      free: {
        api: 'openai-completions',
        models: [{ id: 'a', compat: { supportsDeveloperRole: false } }],
      },
    }
    expect(withCompatCleanup(ops, clean)).toEqual(ops)
  })

  it('leaves the ops alone when no protocol moved', () => {
    const ops: WriteOp[] = [{ op: 'set', path: ['providers', 'free', 'baseURL'], value: 'https://other/v1' }]
    expect(withCompatCleanup(ops, { free })).toEqual(ops)
  })

  it('keeps rows it cannot represent verbatim', () => {
    const stray = { nope: true }
    const repaired = withCompatCleanup(
      [{ op: 'set', path: ['providers', 'free', 'api'], value: 'anthropic-messages' }],
      { free: { api: 'openai-completions', models: [stray, { id: 'a', compat: { thinkingFormat: 'openai' } }] } },
    )
    const models = (repaired[1] as { value: unknown[] }).value
    expect(models[0]).toBe(stray)
    expect(models[1]).toEqual({ id: 'a', compat: {} })
  })

  it('does nothing for a route the document does not have yet', () => {
    const ops: WriteOp[] = [{ op: 'set', path: ['providers', 'fresh', 'api'], value: 'openai-responses' }]
    expect(withCompatCleanup(ops, {})).toEqual(ops)
  })
})

describe('userProvidersOfDescribe', () => {
  it('reads the user layer of the pi-ai entry', () => {
    const providers = { free: { api: 'openai-completions' } }
    expect(userProvidersOfDescribe({
      writable: true,
      namespaces: [{ ns: PI_AI_NS, user: { providers }, value: { providers: { other: {} } } }],
    })).toBe(providers)
  })
  it('answers undefined without a pi-ai entry or a user layer', () => {
    expect(userProvidersOfDescribe({ namespaces: [{ ns: 'other', user: {} }] })).toBeUndefined()
    expect(userProvidersOfDescribe({ namespaces: [{ ns: PI_AI_NS }] })).toBeUndefined()
    expect(userProvidersOfDescribe(undefined)).toBeUndefined()
  })
})

/**
 * A settings namespace service with an own `mutate` ACCESSOR — the shape the
 * gateway installs per Remote method. `liveMutate` is the real method the
 * accessor answers with, so a test can watch the traffic the seam passes down.
 */
function serviceFixture(providers: unknown) {
  const describe = vi.fn(async () => ({
    ok: true,
    value: { writable: true, namespaces: [{ ns: PI_AI_NS, user: { providers } }] },
  }))
  const liveMutate = vi.fn(async (_ns: string, _ops: unknown[], _revision?: number) => ({ ok: true, value: {} }))
  const service: Record<string, unknown> = { describe }
  Object.defineProperty(service, 'mutate', { configurable: true, enumerable: true, get: () => liveMutate })
  const base = Object.getOwnPropertyDescriptor(service, 'mutate')!
  const seam = installCompatWriteSeam(service)!
  const served = (): { mutate: typeof liveMutate } => service as { mutate: typeof liveMutate }
  return { seam, service, served, base, describe, mutate: liveMutate }
}

/** A test-double service: `mutate` is a plain data property holding a vi.fn. */
function spyServiceFixture(providers: unknown) {
  const describe = vi.fn(async () => ({
    ok: true,
    value: { writable: true, namespaces: [{ ns: PI_AI_NS, user: { providers } }] },
  }))
  const mutate = vi.fn(async (_ns: string, _ops: unknown[], _revision?: number) => ({ ok: true, tag: 'live' }))
  const service = { describe, mutate } as { describe: typeof describe; mutate: typeof mutate }
  const seam = installCompatWriteSeam(service)!
  return { seam, service, describe, mutate }
}

describe('installCompatWriteSeam', () => {
  const free = {
    api: 'openai-completions',
    models: [{ id: 'gpt-6.1-sol', compat: { supportsReasoningEffort: true, thinkingFormat: 'openai' } }],
  }

  it('repairs the OFFICIAL card\'s protocol switch inside its own mutate', async () => {
    const { served, describe, mutate } = serviceFixture({ free })
    await served().mutate(PI_AI_NS, [{ op: 'set', path: ['providers', 'free', 'api'], value: 'openai-responses' }], 3)
    expect(describe).toHaveBeenCalledTimes(1)
    expect(mutate).toHaveBeenCalledTimes(1)
    const [ns, ops, revision] = mutate.mock.calls[0]!
    expect(ns).toBe(PI_AI_NS)
    expect(revision).toBe(3)
    expect(ops).toEqual([
      { op: 'set', path: ['providers', 'free', 'api'], value: 'openai-responses' },
      { op: 'set', path: ['providers', 'free', 'models'], value: [{ id: 'gpt-6.1-sol', compat: {} }] },
    ])
  })

  it('passes an ordinary write straight through without a describe', async () => {
    const { served, describe, mutate } = serviceFixture({ free })
    await served().mutate(PI_AI_NS, [{ op: 'set', path: ['providers', 'free', 'baseURL'], value: 'https://x/v1' }], 4)
    expect(describe).not.toHaveBeenCalled()
    expect(mutate).toHaveBeenCalledTimes(1)
    expect(mutate.mock.calls[0]![1]).toEqual([{ op: 'set', path: ['providers', 'free', 'baseURL'], value: 'https://x/v1' }])
  })

  it('passes another namespace through untouched', async () => {
    const { served, describe, mutate } = serviceFixture({ free })
    await served().mutate('other-plugin', [{ op: 'set', path: ['providers', 'x', 'api'], value: 'a' }])
    expect(describe).not.toHaveBeenCalled()
    expect(mutate).toHaveBeenCalledTimes(1)
  })

  it('sends the caller\'s ops unchanged when the document cannot be read', async () => {
    const describe = vi.fn(async () => ({ ok: false as const, error: { code: 'gateway/internal', message: 'offline' } }))
    const liveMutate = vi.fn(async (_ns: string, _ops: unknown[], _revision?: number) => ({ ok: true }))
    const service: Record<string, unknown> = { describe }
    Object.defineProperty(service, 'mutate', { configurable: true, get: () => liveMutate })
    installCompatWriteSeam(service)
    const ops = [{ op: 'set', path: ['providers', 'free', 'api'], value: 'openai-responses' }]
    await (service as { mutate: typeof liveMutate }).mutate(PI_AI_NS, ops, 1)
    expect(liveMutate.mock.calls[0]![1]).toEqual(ops)
  })

  it('sends the caller\'s ops unchanged when the describe throws', async () => {
    const describe = vi.fn(async () => { throw new Error('offline') })
    const liveMutate = vi.fn(async (_ns: string, _ops: unknown[], _revision?: number) => ({ ok: true }))
    const service: Record<string, unknown> = { describe }
    Object.defineProperty(service, 'mutate', { configurable: true, get: () => liveMutate })
    installCompatWriteSeam(service)
    const ops = [{ op: 'set', path: ['providers', 'free', 'api'], value: 'openai-responses' }]
    await (service as { mutate: typeof liveMutate }).mutate(PI_AI_NS, ops, 1)
    expect(liveMutate.mock.calls[0]![1]).toEqual(ops)
  })

  it('does not double-wrap a second activation and restores on the last release', async () => {
    const { service, seam, base, mutate } = serviceFixture({ free })
    const second = installCompatWriteSeam(service)!
    expect(second.active).toBe(true)
    seam.dispose()
    expect(second.active).toBe(true)
    await (service as { mutate: typeof mutate }).mutate(
      PI_AI_NS, [{ op: 'set', path: ['providers', 'free', 'api'], value: 'openai-responses' }], 1,
    )
    // Still wrapped: the second activation repaired the write.
    expect(mutate.mock.calls[0]![1]).toHaveLength(2)
    second.dispose()
    expect(second.active).toBe(false)
    // The original accessor is back: reading `mutate` answers the live method.
    expect(service.mutate).toBe(mutate)
    expect(Object.getOwnPropertyDescriptor(service, 'mutate')).toStrictEqual(base)
  })

  it('re-asserts the wrap after a re-install replaced it', async () => {
    const { service, seam, mutate } = serviceFixture({ free })
    // The gateway re-installing its accessor: a fresh getter over a new method.
    const second = vi.fn(async (_ns: string, _ops: unknown[], _revision?: number) => ({ ok: true }))
    Object.defineProperty(service, 'mutate', { configurable: true, enumerable: true, get: () => second })
    expect(seam.active).toBe(false)
    seam.ensure()
    expect(seam.active).toBe(true)
    await (service as { mutate: typeof second }).mutate(
      PI_AI_NS, [{ op: 'set', path: ['providers', 'free', 'api'], value: 'openai-responses' }], 1,
    )
    // The repair still rides the write, through the NEW method.
    expect(second).toHaveBeenCalledTimes(1)
    expect(mutate).not.toHaveBeenCalled()
  })

  it('keeps a test double\'s mock surface working through the wrap', async () => {
    // The install replaces `settings.mutate`; existing specs assert on that very
    // member (`expect(api.settings.mutate).not.toHaveBeenCalled()`), so the wrap
    // must answer to vitest's mock protocol exactly like the spy it covers.
    const { service, describe, mutate } = spyServiceFixture({ free })
    expect(service.mutate).not.toBe(mutate)
    expect(service.mutate).not.toHaveBeenCalled()
    mutate.mockResolvedValueOnce({ ok: true, tag: 'once' })
    const reply = await (service.mutate as typeof mutate)(
      PI_AI_NS, [{ op: 'set', path: ['providers', 'free', 'api'], value: 'openai-responses' }], 2,
    )
    expect(reply).toEqual({ ok: true, tag: 'once' })
    expect(service.mutate).toHaveBeenCalledTimes(1)
    expect(service.mutate.mock.calls[0]![2]).toBe(2)
    expect(describe).toHaveBeenCalledTimes(1)
    // And an ordinary write still counts on the same member.
    await (service.mutate as typeof mutate)(PI_AI_NS, [{ op: 'set', path: ['providers', 'free', 'baseURL'], value: 'https://x' }], 9)
    expect(service.mutate).toHaveBeenCalledTimes(2)
  })

  it('answers undefined when there is no settings service to wrap', () => {
    expect(installCompatWriteSeam(undefined)).toBeUndefined()
    expect(installCompatWriteSeam({})).toBeUndefined()
    expect(installCompatWriteSeam({ describe: () => {} })).toBeUndefined()
  })
})
