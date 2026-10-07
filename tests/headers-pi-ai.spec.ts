import { Context as CordisContext } from '@deepseek-ai/cordis'
import { LlmRuntime } from '@deepseek-ai/dsh-llm'
import { PiAiAdapter as RealPiAiAdapter } from '@deepseek-ai/dsh-llm-pi-ai'
import type { ResolvedPiAiProviderProfile } from '@deepseek-ai/dsh-llm-pi-ai'
import {
  InMemoryCredentialStore,
  createAssistantMessageEventStream,
  createModels,
  createProvider,
  defaultProviderAuthContext,
  type AssistantMessage,
  type Context,
  type Model,
  type ProviderStreams,
} from '@earendil-works/pi-ai'
import { describe, expect, it } from 'vitest'
import { buildHeaderIndex } from '../src/headers-core.js'
import { describePiAiHeaderState, installPiAiHeaderTransform, installPiAiHeaderTransforms } from '../src/headers-pi-ai.js'

type ProviderHeaders = Record<string, string | null>
type HeaderTransform = (headers: ProviderHeaders) => ProviderHeaders | Promise<ProviderHeaders>

type CapturedModels = {
  streamSimple(model: unknown, context: unknown, options: Record<string, unknown>): unknown
}

type PiAiSnapshot = { models: CapturedModels }

type PiAiAdapter = {
  current(): PiAiSnapshot
}

function setup() {
  const calls: Record<string, unknown>[] = []
  const models: CapturedModels = {
    streamSimple(_model, _context, options) {
      calls.push(options)
      return 'stream-started'
    },
  }
  const adapter: PiAiAdapter = {
    current: () => ({ models }),
  }
  const source = {
    current: buildHeaderIndex({
      alpha: {
        baseURL: 'https://relay.example.com/v1',
        models: [{ id: 'alpha-model' }],
        headers: { 'user-agent': 'alpha-client/1', 'x-route': 'alpha' },
      },
      beta: {
        baseURL: 'https://relay.example.com/v1',
        models: [{ id: 'beta-model' }],
        headers: { 'user-agent': 'beta-client/1', 'x-route': 'beta' },
      },
    }),
  }
  return { adapter, models, source, calls }
}

function callStream(adapter: PiAiAdapter, model: Record<string, unknown>, options: Record<string, unknown> = {}) {
  const snapshot = adapter.current()
  return snapshot.models.streamSimple(model, {}, options)
}

describe('pi-ai request-level header bridge', () => {
  it('puts configured headers into the final transform and resolves shared endpoints by model', async () => {
    const { adapter, source, calls } = setup()
    const handle = installPiAiHeaderTransform(adapter, source)

    const existing = async (headers: ProviderHeaders): Promise<ProviderHeaders> => ({ ...headers, 'x-existing': 'kept' })
    expect(callStream(adapter, { id: 'beta-model', baseUrl: 'https://relay.example.com/v1' }, {
      headers: { 'user-agent': 'harness-default' },
      transformHeaders: existing,
    })).toBe('stream-started')

    const transform = calls[0]?.['transformHeaders'] as HeaderTransform
    expect(transform).toBeTypeOf('function')
    await expect(transform({ 'user-agent': 'harness-default', 'x-existing': 'old' })).resolves.toEqual({
      'user-agent': 'beta-client/1',
      'x-existing': 'kept',
      'x-route': 'beta',
    })

    handle.dispose()
  })

  it('reads the live index when the lazy provider request reaches dispatch', async () => {
    const { adapter, source, calls } = setup()
    const handle = installPiAiHeaderTransform(adapter, source)
    const model = { id: 'alpha-model', baseUrl: 'https://relay.example.com/v1' }

    callStream(adapter, model)
    source.current = buildHeaderIndex({
      alpha: {
        baseURL: 'https://relay.example.com/v1',
        models: [{ id: 'alpha-model' }],
        headers: { 'x-route': 'updated' },
      },
    })

    const transform = calls[0]?.['transformHeaders'] as HeaderTransform
    await expect(transform({ 'user-agent': 'harness-default' })).resolves.toEqual({
      'user-agent': 'harness-default',
      'x-route': 'updated',
    })
    handle.dispose()
  })

  it('leaves nonmatching models unchanged', async () => {
    const { adapter, source, calls } = setup()
    const originalCurrent = adapter.current
    const handle = installPiAiHeaderTransform(adapter, source)
    const options = { headers: { 'x-keep': '1' } }
    const snapshot = adapter.current()
    expect(snapshot.models.streamSimple({ id: 'other', baseUrl: 'https://other.example.com' }, {}, options)).toBe('stream-started')
    const transform = calls[0]?.['transformHeaders'] as HeaderTransform
    await expect(transform({ 'x-keep': '1' })).resolves.toEqual({ 'x-keep': '1' })
    handle.dispose()
    expect(adapter.current).toBe(originalCurrent)
  })

  it('carries configured headers through real pi-ai applyAuth into provider options', async () => {
    let captured: Record<string, unknown> | undefined
    const providerStreams: ProviderStreams = {
      stream: () => createAssistantMessageEventStream(),
      streamSimple: (_model, _context, options) => {
        captured = options as unknown as Record<string, unknown>
        const stream = createAssistantMessageEventStream()
        const message = {
          role: 'assistant',
          content: [],
          api: 'openai-completions',
          provider: 'alpha',
          model: 'alpha-model',
          usage: {
            input: 0,
            output: 0,
            cacheRead: 0,
            cacheWrite: 0,
            totalTokens: 0,
            cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
          },
          stopReason: 'stop',
          timestamp: Date.now(),
        } as AssistantMessage
        stream.push({ type: 'start', partial: message })
        stream.push({ type: 'done', reason: 'stop', message })
        stream.end(message)
        return stream
      },
    }
    const models = createModels()
    models.setProvider(createProvider({
      id: 'alpha',
      name: 'Alpha',
      baseUrl: 'https://relay.example.com/v1',
      auth: {
        apiKey: {
          name: 'test key',
          resolve: async () => ({ auth: { apiKey: 'secret' } }),
        },
      },
      models: [{
        id: 'alpha-model',
        name: 'Alpha model',
        api: 'openai-completions',
        provider: 'alpha',
        baseUrl: 'https://relay.example.com/v1',
        input: ['text'],
        contextWindow: 4096,
        maxTokens: 512,
        cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
      } as Model<'openai-completions'>],
      api: providerStreams,
    }))
    const source = {
      current: buildHeaderIndex({
        alpha: {
          baseURL: 'https://relay.example.com/v1',
          models: [{ id: 'alpha-model' }],
          headers: { 'user-agent': 'configured-client/1', 'x-route': 'alpha' },
        },
      }),
    }
    const adapter: PiAiAdapter = { current: () => ({ models }) }
    const handle = installPiAiHeaderTransform(adapter, source)

    const model = models.getModel('alpha', 'alpha-model')
    expect(model).toBeDefined()
    const stream = adapter.current().models.streamSimple(model, {} as Context, {
      headers: { 'user-agent': 'harness-default', 'x-request': 'present' },
    } as unknown as Record<string, unknown>) as { result(): Promise<unknown> }
    await stream.result()

    expect(captured?.['headers']).toEqual({
      'user-agent': 'configured-client/1',
      'x-request': 'present',
      'x-route': 'alpha',
    })
    expect(captured?.['apiKey']).toBe('secret')
    handle.dispose()
  })

  it('reapplies configured headers on the actual dsh-llm-pi-ai stream', async () => {
    let captured: Record<string, unknown> | undefined
    const providerStreams: ProviderStreams = {
      stream: () => createAssistantMessageEventStream(),
      streamSimple: (_model, _context, options) => {
        captured = options as unknown as Record<string, unknown>
        const stream = createAssistantMessageEventStream()
        const message = {
          role: 'assistant',
          content: [],
          api: 'openai-completions',
          provider: 'alpha',
          model: 'alpha-model',
          usage: {
            input: 0,
            output: 0,
            cacheRead: 0,
            cacheWrite: 0,
            totalTokens: 0,
            cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
          },
          stopReason: 'stop',
          timestamp: Date.now(),
        } as AssistantMessage
        stream.push({ type: 'start', partial: message })
        stream.push({ type: 'done', reason: 'stop', message })
        stream.end(message)
        return stream
      },
    }
    const model = {
      id: 'alpha-model',
      name: 'Alpha model',
      api: 'openai-completions',
      provider: 'alpha',
      baseUrl: 'https://relay.example.com/v1',
      input: ['text'],
      contextWindow: 4096,
      maxTokens: 512,
      cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
    } as Model<'openai-completions'>
    const piProvider = createProvider({
      id: 'alpha',
      name: 'Alpha',
      baseUrl: 'https://relay.example.com/v1',
      auth: {
        apiKey: {
          name: 'test key',
          resolve: async () => ({ auth: { apiKey: 'secret' } }),
        },
      },
      models: [model],
      api: providerStreams,
    })
    const profile = {
      provider: 'alpha',
      displayName: 'Alpha',
      api: 'openai-completions',
      baseURL: 'https://relay.example.com/v1',
      headers: { 'user-agent': 'configured-client/1', 'x-route': 'alpha' },
      piProvider,
      modelErrors: new Map(),
      configuredMaxTokens: new Map(),
      streamIdleTimeoutMs: 1_000,
      maxRequestImageBytes: 20 * 1024 * 1024,
      requestImagePixelBudget: 4_194_304,
      requestImageMaxBytes: 4 * 1024 * 1024,
    } as unknown as ResolvedPiAiProviderProfile
    const profiles = new Map<string, ResolvedPiAiProviderProfile>([['alpha', profile]])
    const adapter = new RealPiAiAdapter({
      profiles: () => profiles,
      resolveApiKey: async () => 'secret',
      auth: {
        credentials: new InMemoryCredentialStore(),
        authContext: defaultProviderAuthContext(),
      },
    })
    const source = {
      current: buildHeaderIndex({
        alpha: {
          baseURL: 'https://relay.example.com/v1',
          models: [{ id: 'alpha-model' }],
          headers: { 'user-agent': 'configured-client/1', 'x-route': 'alpha' },
        },
      }),
    }
    const handle = installPiAiHeaderTransform(adapter, source)

    const request = {
      provider: 'alpha',
      model: 'alpha-model',
      messages: [],
    } as Parameters<RealPiAiAdapter['stream']>[0]
    for await (const _chunk of adapter.stream(request)) {}

    expect(captured?.['headers']).toEqual({
      'user-agent': 'configured-client/1',
      'x-route': 'alpha',
    })
    handle.dispose()
  })

  it('connects apply(ctx) to a real Cordis llm registration', async () => {
    const { adapter, calls } = setup()
    const settings = {
      describe: () => [{
        ns: 'llm-pi-ai',
        revision: 1,
        value: {
          providers: {
            alpha: {
              baseURL: 'https://relay.example.com/v1',
              models: [{ id: 'alpha-model' }],
              headers: { 'user-agent': 'alpha-client/1', 'x-route': 'alpha' },
            },
          },
        },
        user: undefined,
      }],
      update: async () => {},
    }
    const cordis = new CordisContext()
    new LlmRuntime(cordis)
    cordis.settings = settings as never
    const { apply } = await import('../src/index.js')
    const fiber = cordis.plugin({
      name: 'headers-integration-test',
      apply(ctx) {
        apply(ctx as never, { autofill: false, defaultGuard: false })
      },
    })
    await fiber

    const llm = cordis.llm as unknown as {
      registerAdapter(providers: string[], adapter: unknown): () => void
    }
    const registeredAdapter = Object.assign(adapter, {
      providerInfo: (provider: string) => ({ id: provider, name: provider }),
      providerRetryPolicy: () => undefined,
    })
    const disposeRegistration = llm.registerAdapter(['alpha'], registeredAdapter)
    callStream(adapter, { id: 'alpha-model', baseUrl: 'https://relay.example.com/v1' })
    expect(calls[0]?.['transformHeaders']).toBeTypeOf('function')

    disposeRegistration()
    await fiber.dispose()
  })

  it('patches adapters registered through Cordis traceable llm before dispatch', () => {
    const { adapter, source, calls } = setup()
    const cordis = new CordisContext()
    new LlmRuntime(cordis)
    const llm = cordis.llm as unknown as {
      registerAdapter(providers: string[], adapter: unknown): () => void
    }
    const registeredAdapter = Object.assign(adapter, {
      providerInfo: (provider: string) => ({ id: provider, name: provider }),
      providerRetryPolicy: () => undefined,
    })
    const bridge = installPiAiHeaderTransforms(llm, source)
    const disposeRegistration = llm.registerAdapter(['alpha'], registeredAdapter)

    callStream(adapter, { id: 'alpha-model', baseUrl: 'https://relay.example.com/v1' })
    expect(calls[0]?.['transformHeaders']).toBeTypeOf('function')

    bridge.dispose()
    disposeRegistration()
  })

  it('refreshes adapters registered after the bridge is installed and disposes them', () => {
    const { adapter, source, calls } = setup()
    const llm = { adapters: new Map<string, { adapter: PiAiAdapter }>() }
    const bridge = installPiAiHeaderTransforms(llm, source)

    llm.adapters.set('alpha', { adapter })
    bridge.refresh()
    callStream(adapter, { id: 'alpha-model', baseUrl: 'https://relay.example.com/v1' })
    expect(calls[0]?.['transformHeaders']).toBeTypeOf('function')

    bridge.dispose()
    const options = {}
    callStream(adapter, { id: 'alpha-model', baseUrl: 'https://relay.example.com/v1' }, options)
    expect(calls[1]).toBe(options)
  })

  it('reports the live attach state of the bridge', () => {
    const { adapter, source } = setup()
    const llm = { adapters: new Map<string, { adapter: PiAiAdapter }>(), registerAdapter: () => {} }

    const before = describePiAiHeaderState(llm, source)
    expect(before.runtimeFound).toBe(true)
    expect(before.registerPatched).toBe(false)
    expect(before.adaptersInRuntime).toBe(0)
    expect(before.adaptersPatched).toBe(0)
    expect(before.routes).toBeGreaterThan(0)

    const bridge = installPiAiHeaderTransforms(llm, source)
    llm.adapters.set('alpha', { adapter })
    bridge.refresh()

    const after = describePiAiHeaderState(llm, source)
    expect(after.registerPatched).toBe(true)
    expect(after.adaptersInRuntime).toBe(1)
    expect(after.adaptersPatched).toBe(1)
    expect(after.adapters[0]).toMatch(/\+$/)

    bridge.dispose()
    const disposed = describePiAiHeaderState(llm, source)
    expect(disposed.adaptersPatched).toBe(0)
    expect(disposed.registerPatched).toBe(false)
  })
})
