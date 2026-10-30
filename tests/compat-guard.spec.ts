/**
 * The compat guard: the repair for a wire protocol switched after compat
 * switches were written. Covers the pure builders (stripForeignCompat /
 * buildCompatCleanupPatch) and the browser half's idle sweep.
 */

import { afterEach, describe, expect, it, vi } from 'vitest'
import { PI_AI_NS } from '../src/constants.js'
import { stripForeignCompat } from '../src/knowledge.js'
import { buildCompatCleanupPatch } from '../src/autofill.js'
import { createCompatGuard } from '../src/client/injection/compat-guard.js'
import type { RemoteApi, SettingsJoin, SettingsNamespaceView } from '../src/client/types.js'

describe('stripForeignCompat', () => {
  it('strips the completions-only switches from an openai-responses block', () => {
    const cleaned = stripForeignCompat({
      supportsReasoningEffort: true,
      thinkingFormat: 'openai',
      thinkingTokenBudgetField: 'thinking_token_budget',
      supportsThinkingTokenBudget: true,
      vllmPriority: 2,
      supportsDeveloperRole: false,
    }, 'openai-responses')
    expect(cleaned).toEqual({ supportsDeveloperRole: false })
  })
  it('strips forceAdaptiveThinking too: no responses key takes it', () => {
    expect(stripForeignCompat({ forceAdaptiveThinking: true }, 'openai-responses')).toEqual({})
  })
  it('on openai-completions strips only the anthropic-exclusive switch', () => {
    expect(stripForeignCompat({
      supportsReasoningEffort: true, thinkingFormat: 'openai', forceAdaptiveThinking: true,
    }, 'openai-completions')).toEqual({ supportsReasoningEffort: true, thinkingFormat: 'openai' })
  })
  it('on anthropic-messages keeps forceAdaptiveThinking and strips the rest', () => {
    expect(stripForeignCompat({
      supportsReasoningEffort: true, vllmPriority: 1, forceAdaptiveThinking: true,
    }, 'anthropic-messages')).toEqual({ forceAdaptiveThinking: true })
  })
  it('returns undefined for a clean block and an unknown protocol', () => {
    expect(stripForeignCompat({ supportsDeveloperRole: false }, 'openai-responses')).toBeUndefined()
    expect(stripForeignCompat({ supportsReasoningEffort: true }, '')).toBeUndefined()
    expect(stripForeignCompat({ supportsReasoningEffort: true }, 'deepseek')).toBeUndefined()
  })
})

describe('buildCompatCleanupPatch', () => {
  it('rebuilds the dirty route with every foreign switch dropped', () => {
    const patch = buildCompatCleanupPatch({
      magpie: {
        displayName: 'Magpie',
        api: 'openai-responses',
        models: [
          { id: 'group/gemini', name: 'Gemini', compat: { supportsReasoningEffort: true, supportsStrictMode: true } },
          { id: 'group/claude', name: 'Claude' },
        ],
      },
      relay: {
        api: 'openai-completions',
        models: [{ id: 'qwen-max', compat: { thinkingFormat: 'openai' } }],
      },
    })
    const providers = patch!['providers'] as Record<string, Record<string, unknown>>
    // Only the dirty route appears, and only its dirty rows are rebuilt.
    expect(Object.keys(providers)).toEqual(['magpie'])
    const models = providers.magpie.models as Array<Record<string, unknown>>
    expect(models[0]!['compat']).toEqual({ supportsStrictMode: true })
    // The untouched row rides verbatim.
    expect(models[1]).toEqual({ id: 'group/claude', name: 'Claude' })
  })
  it('sweeps the route-level compat block too', () => {
    const patch = buildCompatCleanupPatch({
      magpie: {
        api: 'openai-responses',
        compat: { supportsReasoningEffort: true, supportsMaxOutputTokens: true },
        models: [{ id: 'group/gemini' }],
      },
    })
    const profile = (patch!['providers'] as Record<string, Record<string, unknown>>).magpie
    expect(profile['compat']).toEqual({ supportsMaxOutputTokens: true })
    expect(profile['models']).toBeUndefined()
  })
  it('skips routes without an explicit api and clean documents entirely', () => {
    expect(buildCompatCleanupPatch({
      catalogRoute: { models: [{ id: 'gpt-5', compat: { supportsReasoningEffort: true } }] },
      clean: {
        api: 'openai-responses',
        models: [{ id: 'a', compat: { supportsDeveloperRole: false } }],
      },
    })).toBeUndefined()
    expect(buildCompatCleanupPatch(undefined)).toBeUndefined()
    expect(buildCompatCleanupPatch({ empty: { api: 'openai-responses', models: [] } })).toBeUndefined()
  })
  it('carries rows it cannot represent through verbatim', () => {
    const stray = { nope: true }
    const patch = buildCompatCleanupPatch({
      magpie: {
        api: 'anthropic-messages',
        models: [stray, { id: 'a', compat: { thinkingFormat: 'openai' } }],
      },
    })
    const models = (patch!['providers'] as Record<string, { models: unknown[] }>).magpie.models
    expect(models[0]).toBe(stray)
    expect(models[1]).toEqual({ id: 'a', compat: {} })
  })
})

/** A settings remote shaped like the wire face describeNamespace reads. */
function fixture(userProviders: Record<string, unknown> | undefined, revision = 7) {
  const namespace = {
    ns: PI_AI_NS,
    schema: {},
    value: { providers: userProviders },
    user: { providers: userProviders },
    base: {},
    revision,
    applies: 'live',
    secrets: [],
  }
  const describe = vi.fn(async () => ({ ok: true, value: { namespaces: [namespace], writable: true } }))
  const mutate = vi.fn(async (_ns: string, _ops: unknown[], _rev?: number) => ({ ok: true }))
  const api = { settings: { describe, mutate } } as unknown as RemoteApi
  return { guard: createCompatGuard({ api }), describe, mutate, revision }
}

/** Drain fire-and-forget work, including settled describe/mutate promises. */
async function settle(): Promise<void> {
  await new Promise<void>(resolve => setImmediate(resolve))
}

afterEach(() => { vi.restoreAllMocks() })

describe('compat guard idle sweep', () => {
  const dirty = {
    magpie: {
      displayName: 'Magpie',
      api: 'openai-responses',
      models: [{ id: 'group/gemini', compat: { supportsReasoningEffort: true, supportsDeveloperRole: false } }],
    },
  }

  it('strips the foreign switches through a path-op mutate on the stored revision', async () => {
    const { guard, describe, mutate, revision } = fixture(dirty)
    guard.run()
    await settle()
    expect(describe).toHaveBeenCalledTimes(1)
    expect(mutate).toHaveBeenCalledTimes(1)
    const [ns, ops, rev] = mutate.mock.calls[0]!
    expect(ns).toBe(PI_AI_NS)
    expect(rev).toBe(revision)
    expect(ops).toEqual([{
      op: 'set',
      path: ['providers', 'magpie', 'models'],
      value: [{ id: 'group/gemini', compat: { supportsDeveloperRole: false } }],
    }])
  })

  it('writes a second op when the route-level compat is dirty too', async () => {
    const { guard, mutate } = fixture({
      magpie: {
        api: 'openai-responses',
        compat: { supportsReasoningEffort: true },
        models: [{ id: 'a', compat: { thinkingFormat: 'openai' } }],
      },
    })
    guard.run()
    await settle()
    const ops = mutate.mock.calls[0]![1] as Array<{ path: string[] }>
    expect(ops.map(op => op.path)).toEqual([
      ['providers', 'magpie', 'compat'],
      ['providers', 'magpie', 'models'],
    ])
  })

  it('spends no write on a clean document', async () => {
    const clean = {
      magpie: {
        api: 'openai-responses',
        models: [{ id: 'a', compat: { supportsStrictMode: true } }],
      },
      relay: { api: 'openai-completions', models: [{ id: 'b', compat: { thinkingFormat: 'openai' } }] },
    }
    const { guard, mutate } = fixture(clean)
    guard.run()
    await settle()
    expect(mutate).not.toHaveBeenCalled()
  })

  it('skips a missing namespace and a read-only document', async () => {
    const absent = fixture(undefined)
    absent.guard.run()
    await settle()
    expect(absent.mutate).not.toHaveBeenCalled()

    const readonly = fixture(dirty)
    readonly.describe = vi.fn(async () => ({
      ok: true, value: { namespaces: [], writable: false },
    })) as unknown as typeof readonly.describe
    const readonlyGuard = createCompatGuard({
      api: { settings: { describe: readonly.describe, mutate: readonly.mutate } } as unknown as RemoteApi,
    })
    readonlyGuard.run()
    await settle()
    expect(readonly.mutate).not.toHaveBeenCalled()
  })

  it('consumes the seeded join without describing and fences a scope join with a fresh read', async () => {
    // A wire join (the idle flush's fresh seed) is authoritative: no describe.
    const seeded = fixture(dirty)
    const join: SettingsJoin = {
      namespace: {
        ns: PI_AI_NS, schema: {}, value: { providers: dirty }, user: { providers: dirty },
        base: {}, revision: 7, applies: 'live', secrets: [],
      } as unknown as SettingsNamespaceView,
      writable: true,
      source: 'wire',
    }
    seeded.guard.run(join)
    await settle()
    expect(seeded.describe).not.toHaveBeenCalled()
    expect(seeded.mutate.mock.calls[0]![2]).toBe(7)

    // A scope-mirrored join can lag a settled write: the write fences on a
    // fresh wire read instead, so the revision it locks is the fresh one.
    const mirrored = fixture(dirty, 9)
    const scopeJoin: SettingsJoin = { ...join, source: 'scope' }
    mirrored.guard.run(scopeJoin)
    await settle()
    expect(mirrored.describe).toHaveBeenCalledTimes(1)
    expect(mirrored.mutate.mock.calls[0]![2]).toBe(9)
  })

  it('logs a refusal and a throw instead of rejecting the idle pass', async () => {
    const refused = fixture(dirty)
    refused.mutate = vi.fn(async () => ({
      ok: false as const, error: { code: 'settings/rejected', message: 'no' },
    }))
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const refusedGuard = createCompatGuard({
      api: { settings: { describe: refused.describe, mutate: refused.mutate } } as unknown as RemoteApi,
    })
    refusedGuard.run()
    await settle()
    expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining('compat cleanup refused'))

    const thrown = fixture(dirty)
    thrown.mutate = vi.fn(async () => { throw new Error('offline') })
    const thrownGuard = createCompatGuard({
      api: { settings: { describe: thrown.describe, mutate: thrown.mutate } } as unknown as RemoteApi,
    })
    thrownGuard.run()
    await settle()
    expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining('compat cleanup failed'))
  })
})
