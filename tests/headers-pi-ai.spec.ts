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
import { describe, expect, it, vi } from 'vitest'
import { buildHeaderIndex } from '../src/headers-core.js'
import { installHeaderOverlay } from '../src/headers-fetch.js'
import {
  describePiAiHeaderState,
  installPiAiHeaderTransform,
  installPiAiHeaderTransforms,
} from '../src/headers-pi-ai.js'
import { keyRest, readRoutePlans, restKeyOf } from '../src/key-route-core.js'

/**
 * The protocol implementations the wire seam re-dispatches through are external
 * modules; they are mocked so an automatic-key test can stage exactly one
 * cross-family stream without any network. Each test stages its own handler;
 * an unstaged dispatch fails loudly instead of reaching a real endpoint.
 */
const protocolMocks = vi.hoisted(() => ({
  anthropic: undefined as
    | undefined
    | ((model: Record<string, unknown>, options: Record<string, unknown>) => AsyncIterable<Record<string, unknown>>),
}))

vi.mock('@earendil-works/pi-ai/api/anthropic-messages', () => ({
  streamSimple: (model: Record<string, unknown>, context: unknown, options: Record<string, unknown>) => {
    const handler = protocolMocks.anthropic
    if (handler === undefined) throw new Error(`no anthropic stream was staged (model ${String((model as Record<string, unknown>)['id'])})`)
    void context
    return handler(model, options)
  },
}))

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
    // With key routing active the proxy resolves the key asynchronously and hands
    // back an async iterable, so the underlying dispatch happens as it is drained.
    const streamed = callStream(adapter, { id: 'alpha-model', baseUrl: 'https://relay.example.com/v1' })
    for await (const _event of streamed as unknown as AsyncIterable<unknown>) void _event
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

/** Build an adapter whose streamSimple returns a controllable async iterable. */
function keyedSetup(plan: (apiKey: string | undefined) => AsyncIterable<Record<string, unknown>>) {
  const seen: (string | undefined)[] = []
  const models: CapturedModels = {
    streamSimple(_model, _context, options) {
      seen.push(typeof options['apiKey'] === 'string' ? options['apiKey'] : undefined)
      return plan(options['apiKey'] as string | undefined)
    },
  }
  const adapter: PiAiAdapter = { current: () => ({ models }) }
  return { adapter, seen }
}

async function drain(stream: unknown): Promise<Record<string, unknown>[]> {
  const events: Record<string, unknown>[] = []
  for await (const event of stream as AsyncIterable<Record<string, unknown>>) events.push(event)
  return events
}

async function* emit(...events: Record<string, unknown>[]): AsyncGenerator<Record<string, unknown>> {
  for (const event of events) yield event
}

describe('pi-ai key routing and failover', () => {
  const MODEL = { id: 'alpha-model', baseUrl: 'https://relay.example.com/v1', api: 'openai-completions' }

  it('signs a request with the first capable key when the delegate path is used', async () => {
    const { adapter, seen } = keyedSetup(() => emit({ type: 'start' }, { type: 'done' }))
    const source = {
      current: buildHeaderIndex({ alpha: { baseURL: 'https://relay.example.com/v1', models: [{ id: 'alpha-model' }] } }),
      keys: async () => [{ ref: 'A', value: 'sk-a' }],
    }
    const handle = installPiAiHeaderTransform(adapter, source)
    const events = await drain(callStream(adapter, MODEL))
    expect(seen).toEqual(['sk-a'])
    expect(events.map((event) => event['type'])).toEqual(['start', 'done'])
    handle.dispose()
  })

  it('fails over to the next key when the first errors before any content', async () => {
    const { adapter, seen } = keyedSetup((apiKey) =>
      apiKey === 'sk-a'
        ? emit({ type: 'error', reason: 'error', error: { message: 'bad key' } })
        : emit({ type: 'start' }, { type: 'text_delta', delta: 'hi' }, { type: 'done' }),
    )
    const source = {
      current: buildHeaderIndex({ alpha: { baseURL: 'https://relay.example.com/v1', models: [{ id: 'alpha-model' }] } }),
      keys: async () => [
        { ref: 'A', value: 'sk-a' },
        { ref: 'B', value: 'sk-b' },
      ],
    }
    const handle = installPiAiHeaderTransform(adapter, source)
    const events = await drain(callStream(adapter, MODEL))
    // Tried A, then B; the answer that streamed is B's.
    expect(seen).toEqual(['sk-a', 'sk-b'])
    expect(events.map((event) => event['type'])).toEqual(['start', 'text_delta', 'done'])
    handle.dispose()
  })

  it('does not fail over once content has committed, even if a later event errors', async () => {
    const { adapter, seen } = keyedSetup(() =>
      emit({ type: 'start' }, { type: 'text_delta', delta: 'partial' }, { type: 'error', reason: 'error' }),
    )
    const source = {
      current: buildHeaderIndex({ alpha: { baseURL: 'https://relay.example.com/v1', models: [{ id: 'alpha-model' }] } }),
      keys: async () => [
        { ref: 'A', value: 'sk-a' },
        { ref: 'B', value: 'sk-b' },
      ],
    }
    const handle = installPiAiHeaderTransform(adapter, source)
    const events = await drain(callStream(adapter, MODEL))
    // Only one key was ever tried: the second was not consulted after commit.
    expect(seen).toEqual(['sk-a'])
    expect(events.map((event) => event['type'])).toEqual(['start', 'text_delta', 'error'])
    handle.dispose()
  })

  it('yields the last error when every key fails before content', async () => {
    const { adapter, seen } = keyedSetup((apiKey) =>
      emit({ type: 'error', reason: 'error', error: { message: `rejected ${apiKey}` } }),
    )
    const source = {
      current: buildHeaderIndex({ alpha: { baseURL: 'https://relay.example.com/v1', models: [{ id: 'alpha-model' }] } }),
      keys: async () => [
        { ref: 'A', value: 'sk-a' },
        { ref: 'B', value: 'sk-b' },
      ],
    }
    const handle = installPiAiHeaderTransform(adapter, source)
    const events = await drain(callStream(adapter, MODEL))
    expect(seen).toEqual(['sk-a', 'sk-b'])
    expect(events).toHaveLength(1)
    expect(events[0]?.['type']).toBe('error')
    handle.dispose()
  })

  it('leaves the request to the route credential when no key claims it', async () => {
    const { adapter, seen } = keyedSetup(() => emit({ type: 'start' }, { type: 'done' }))
    const source = {
      current: buildHeaderIndex({ alpha: { baseURL: 'https://relay.example.com/v1', models: [{ id: 'alpha-model' }] } }),
      keys: async () => [],
    }
    const handle = installPiAiHeaderTransform(adapter, source)
    const events = await drain(callStream(adapter, MODEL))
    // The delegate was reached without an explicit apiKey injected by us.
    expect(seen).toEqual([undefined])
    expect(events.map((event) => event['type'])).toEqual(['start', 'done'])
    handle.dispose()
  })
})

describe('pinned-protocol wire decisions', () => {
  const MODEL = { id: 'alpha-model', baseUrl: 'https://relay.example.com/v1', api: 'openai-completions' }

  it('dispatches a cross-family pin without an endpoint on the route wire', async () => {
    // The key is still the credential — it just cannot change the wire.
    const { adapter, seen } = keyedSetup(() => emit({ type: 'start' }, { type: 'done' }))
    const source = {
      current: buildHeaderIndex({ beta: { baseURL: 'https://relay.example.com/v1', models: [{ id: 'beta-model' }] } }),
      keys: async () => [{ ref: 'A', value: 'sk-a', protocol: 'anthropic-messages' as const }],
    }
    const handle = installPiAiHeaderTransform(adapter, source)
    const events = await drain(
      callStream(adapter, { id: 'beta-model', baseUrl: 'https://relay.example.com/v1', api: 'openai-completions' }),
    )
    expect(seen).toEqual(['sk-a'])
    expect(events.map((event) => event['type'])).toEqual(['start', 'done'])
    handle.dispose()
  })

  it('keeps the unpinned key on the route wire ahead of a cross-family pin', async () => {
    const { adapter, seen } = keyedSetup(() => emit({ type: 'start' }, { type: 'done' }))
    const source = {
      current: buildHeaderIndex({ gamma: { baseURL: 'https://relay.example.com/v1', models: [{ id: 'gamma-model' }] } }),
      keys: async () => [{ ref: 'A', value: 'sk-a' }],
    }
    const handle = installPiAiHeaderTransform(adapter, source)
    const model = { id: 'gamma-model', baseUrl: 'https://relay.example.com/v1', api: 'openai-completions' }
    await drain(callStream(adapter, model))

    // A mixed-protocol route now lists the Anthropic key first; the request that
    // already succeeded on the OpenAI wire must not be sent down the other wire.
    const mixed = {
      current: source.current,
      keys: async () => [
        {
          ref: 'B',
          value: 'sk-b',
          protocol: 'anthropic-messages' as const,
          endpoint: 'https://relay.example.com/anthropic',
        },
        { ref: 'A', value: 'sk-a' },
      ],
    }
    const mixedHandle = installPiAiHeaderTransform(adapter, mixed)
    const events = await drain(callStream(adapter, model))
    expect(seen).toEqual(['sk-a', 'sk-a'])
    expect(events.map((event) => event['type'])).toEqual(['start', 'done'])
    mixedHandle.dispose()
    handle.dispose()
  })

  it('leads with the wire the model belongs to', async () => {
    // claude-haiku is an Anthropic shape: the key pinned to that protocol is the
    // one that can actually serve it, so it leads even though the route is
    // configured for the OpenAI wire. The attempt itself is handed to that
    // protocol's own stream (not to the route's streamSimple), which is why the
    // decision is asserted on the plan trace.
    const { adapter } = keyedSetup(() => emit({ type: 'start' }, { type: 'done' }))
    const source = {
      current: buildHeaderIndex({
        mixed: { baseURL: 'https://relay.example.com/v1', models: [{ id: 'relay-model' }, { id: 'claude-haiku-5' }] },
      }),
      keys: async () => [
        { ref: 'OPENAI', value: 'sk-openai' },
        {
          ref: 'ANTHROPIC',
          value: 'sk-anthropic',
          protocol: 'anthropic-messages' as const,
          endpoint: 'https://relay.example.com/anthropic',
          models: ['claude-*'],
        },
      ],
    }
    const handle = installPiAiHeaderTransform(adapter, source)
    await drain(
      callStream(adapter, { id: 'claude-haiku-5', baseUrl: 'https://relay.example.com/v1', api: 'openai-completions' }),
    )
    const [trace] = readRoutePlans(1)
    expect(trace?.route).toBe('mixed')
    expect(trace?.model).toBe('claude-haiku-5')
    expect(trace?.wire).toBe('anthropic-messages')
    expect(trace?.keys.map(key => key.ref)).toEqual(['ANTHROPIC', 'OPENAI'])
    expect(trace?.keys[0]?.fit).toBe(0)
    expect(trace?.keys[1]?.fit).toBe(2)
    handle.dispose()
  })

  it('defers a key that was just charged for its quota on the next request', async () => {
    // The cooldown memory is shared by the wire seam and every later request:
    // the key that ran out of quota is tried last once it rests.
    const { adapter, seen } = keyedSetup((apiKey) =>
      apiKey === 'sk-a'
        ? emit({
            type: 'error',
            reason: 'error',
            error: { message: '429 insufficient_quota: You exceeded your current quota' },
          })
        : emit({ type: 'start' }, { type: 'done' }),
    )
    const source = {
      current: buildHeaderIndex({ alpha: { baseURL: 'https://relay.example.com/v1', models: [{ id: 'alpha-model' }] } }),
      keys: async () => [
        { ref: 'A', value: 'sk-a' },
        { ref: 'B', value: 'sk-b' },
      ],
    }
    const handle = installPiAiHeaderTransform(adapter, source)
    await drain(callStream(adapter, MODEL))
    expect(seen).toEqual(['sk-a', 'sk-b'])

    // A second request starts with B, because A is resting.
    seen.length = 0
    const events = await drain(callStream(adapter, MODEL))
    expect(seen).toEqual(['sk-b'])
    expect(events.map((event) => event['type'])).toEqual(['start', 'done'])
    handle.dispose()
  })
})

describe('automatic wire decisions (unpinned keys)', () => {
  const CLAUDE = { id: 'claude-haiku-5', baseUrl: 'https://relay.example.com/v1', api: 'openai-completions' }

  it('dispatches a claude model through the anthropic address the key carries', async () => {
    const dispatched: Array<{ model: Record<string, unknown>; apiKey: unknown }> = []
    protocolMocks.anthropic = (model, options) => {
      dispatched.push({ model, apiKey: options['apiKey'] })
      return emit({ type: 'start' }, { type: 'done' })
    }
    const { adapter, seen } = keyedSetup(() => emit({ type: 'start' }, { type: 'done' }))
    const source = {
      current: buildHeaderIndex({ auto: { baseURL: 'https://relay.example.com/v1', models: [{ id: 'claude-haiku-5' }] } }),
      keys: async () => [
        { ref: 'A', value: 'sk-a', endpoints: { anthropic: 'https://relay.example.com/anthropic' } },
      ],
    }
    const handle = installPiAiHeaderTransform(adapter, source)
    const events = await drain(callStream(adapter, CLAUDE))
    // The route provider was never reached: the Anthropic implementation was.
    expect(seen).toEqual([])
    expect(dispatched).toHaveLength(1)
    expect(dispatched[0]?.apiKey).toBe('sk-a')
    expect(dispatched[0]?.model).toMatchObject({
      api: 'anthropic-messages',
      baseUrl: 'https://relay.example.com/anthropic',
    })
    expect(events.map(event => event['type'])).toEqual(['start', 'done'])
    handle.dispose()
  })

  it('keeps models of no addressed family on the route wire', async () => {
    let anthropicAttempts = 0
    protocolMocks.anthropic = () => {
      anthropicAttempts += 1
      return emit({ type: 'start' }, { type: 'done' })
    }
    const { adapter, seen } = keyedSetup(() => emit({ type: 'start' }, { type: 'done' }))
    const source = {
      current: buildHeaderIndex({
        auto: { baseURL: 'https://relay.example.com/v1', models: [{ id: 'relay-model' }, { id: 'claude-haiku-5' }] },
      }),
      keys: async () => [{ ref: 'A', value: 'sk-a' }],
    }
    const handle = installPiAiHeaderTransform(adapter, source)
    // An id that names no family, and a claude id with no family address: both
    // stay on the dispatch that always works.
    await drain(callStream(adapter, { id: 'relay-model', baseUrl: 'https://relay.example.com/v1', api: 'openai-completions' }))
    await drain(callStream(adapter, CLAUDE))
    expect(seen).toEqual(['sk-a', 'sk-a'])
    expect(anthropicAttempts).toBe(0)
    handle.dispose()
  })

  it('falls back to the route wire once the family wire refused this model', async () => {
    let anthropicAttempts = 0
    protocolMocks.anthropic = () => {
      anthropicAttempts += 1
      return emit({ type: 'error', reason: 'error', error: { message: 'no such route' } })
    }
    const { adapter, seen } = keyedSetup(() => emit({ type: 'start' }, { type: 'done' }))
    const source = {
      current: buildHeaderIndex({ auto: { baseURL: 'https://relay.example.com/v1', models: [{ id: 'claude-haiku-5' }] } }),
      keys: async () => [
        { ref: 'A', value: 'sk-a', endpoints: { anthropic: 'https://relay.example.com/anthropic' } },
      ],
    }
    const handle = installPiAiHeaderTransform(adapter, source)
    const first = await drain(callStream(adapter, CLAUDE))
    expect(anthropicAttempts).toBe(1)
    expect(first.map(event => event['type'])).toEqual(['error'])
    expect(readRoutePlans(1)[0]?.wire).toBe('anthropic-messages')

    // The refusal outlives the key's cooldown: unbench the key and ask again —
    // the automatic resolution must fall back to the route wire instead of
    // retrying the family the relay does not serve.
    keyRest.clear(restKeyOf('auto', 'A'))
    seen.length = 0
    const second = await drain(callStream(adapter, CLAUDE))
    expect(anthropicAttempts).toBe(1)
    expect(seen).toEqual(['sk-a'])
    expect(second.map(event => event['type'])).toEqual(['start', 'done'])
    expect(readRoutePlans(1)[0]?.wire).toBe('openai-completions')
    handle.dispose()
  })
})

describe('cross-seam: the fetch layer honours the wire seam\'s signature', () => {
  // Both seams installed at once, sharing one source — the production shape.
  // The wire seam ranks keys by honour and fit (planKeys); the fetch layer
  // ranks by list order (keysForModel). A cross-family pin without an endpoint
  // makes those two orders DISAGREE without any protocol re-dispatch (the pin
  // falls back to the route's own wire but is demoted behind the keys that
  // need no fallback), which is exactly what the wire-dispatch marker exists
  // for: the fetch layer must patch the route's headers without re-signing a
  // request the wire seam already signed, and without running its own failover
  // loop under the wire seam's.
  const MODEL = { id: 'gpt-6.1', baseUrl: 'https://relay.example.com/v1', api: 'openai-completions' }

  /** Both seams over one stubbed network; records every outgoing request. */
  function crossSeamSetup(status = 200, headers: Record<string, string> | undefined = { 'x-route': 'alpha' }) {
    const outgoing: Array<{ url: string; headers: Headers }> = []
    const realFetch = globalThis.fetch
    // The stub lands UNDER the overlay: installHeaderOverlay wraps whatever
    // globalThis.fetch holds at install time.
    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      outgoing.push({ url: String(input), headers: new Headers(init?.headers) })
      return new Response(JSON.stringify({ ok: true }), {
        status,
        headers: { 'content-type': 'application/json' },
      })
    }) as typeof globalThis.fetch
    const source = {
      current: buildHeaderIndex({
        alpha: {
          baseURL: 'https://relay.example.com/v1',
          models: [{ id: 'gpt-6.1' }],
          ...(headers === undefined ? {} : { headers }),
        },
      }),
      // List order puts the cross-family pin first — keysForModel's pick. The
      // pin has no endpoint of its own family, so planKeys demotes it behind
      // the unpinned key (honour before demotion) and the wire seam dispatches
      // sk-b while the fetch layer's order would say sk-a.
      keys: async () => [
        { ref: 'A', value: 'sk-a', protocol: 'anthropic-messages' as const },
        { ref: 'B', value: 'sk-b' },
      ],
    }
    const overlay = installHeaderOverlay(source)
    // A pi-ai-shaped provider: composes auth + transformHeaders and hands the
    // result to the (wrapped) global fetch, exactly as the real one does.
    const models: CapturedModels = {
      async streamSimple(model, _context, options) {
        const extra = typeof options['transformHeaders'] === 'function'
          ? await (options['transformHeaders'] as HeaderTransform)({})
          : {}
        await globalThis.fetch(`${String((model as { baseUrl: string }).baseUrl)}/chat`, {
          method: 'POST',
          headers: { authorization: `Bearer ${String(options['apiKey'])}`, ...extra },
          body: JSON.stringify({ model: (model as { id: string }).id }),
        })
        return status === 200
          ? emit({ type: 'start' }, { type: 'done' })
          : emit({ type: 'error', reason: 'error', error: { message: 'unauthorized' } })
      },
    }
    const adapter: PiAiAdapter = { current: () => ({ models }) }
    const handle = installPiAiHeaderTransform(adapter, source)
    return {
      adapter,
      outgoing,
      restore() {
        handle.dispose()
        overlay.dispose()
        globalThis.fetch = realFetch
      },
    }
  }

  it('keeps the wire seam\'s chosen key on the wire and strips the marker', async () => {
    const { adapter, outgoing, restore } = crossSeamSetup()
    try {
      const events = await drain(callStream(adapter, MODEL))
      expect(events.map((event) => event['type'])).toEqual(['start', 'done'])
      // One request, signed with the wire seam's pick (sk-b, the native-wire
      // pin planKeys ranks first) — NOT sk-a, the list-order key the fetch
      // layer would have re-signed with before the marker existed.
      expect(outgoing).toHaveLength(1)
      expect(outgoing[0]?.headers.get('authorization')).toBe('Bearer sk-b')
      // The route's header patch still applies, and the marker never leaves.
      expect(outgoing[0]?.headers.get('x-route')).toBe('alpha')
      expect(outgoing[0]?.headers.has('x-dsh-model-think-level-wire')).toBe(false)
    } finally {
      restore()
    }
  })

  it('strips the marker even when the route declares no headers of its own', async () => {
    // The common deployment shape: the route matches (so the fetch layer owns
    // its key routing) but stores no header patch. The strip must not be tied
    // to the patch — returning the original init there shipped the internal
    // marker upstream.
    const { adapter, outgoing, restore } = crossSeamSetup(200, {})
    try {
      const events = await drain(callStream(adapter, MODEL))
      expect(events.map((event) => event['type'])).toEqual(['start', 'done'])
      expect(outgoing).toHaveLength(1)
      // The wire seam's signature survives untouched; the marker does not.
      expect(outgoing[0]?.headers.get('authorization')).toBe('Bearer sk-b')
      expect(outgoing[0]?.headers.has('x-dsh-model-think-level-wire')).toBe(false)
      expect(outgoing[0]?.headers.has('x-route')).toBe(false)
    } finally {
      restore()
    }
  })

  it('strips the marker from a request this layer does not claim at all', async () => {
    // The wire seam marks the requests it dispatches, including ones to a key
    // endpoint on ANOTHER origin than the route's base URL — the fetch layer's
    // index never matches those, so the marker would ride the passthrough
    // upstream unless the unclaimed exits strip it too.
    const { outgoing, restore } = crossSeamSetup()
    try {
      await globalThis.fetch('https://key-endpoint.example.com/v1/chat', {
        method: 'POST',
        headers: { authorization: 'Bearer sk-b', 'x-dsh-model-think-level-wire': '1' },
      })
      expect(outgoing).toHaveLength(1)
      expect(outgoing[0]?.headers.has('x-dsh-model-think-level-wire')).toBe(false)
      expect(outgoing[0]?.headers.get('authorization')).toBe('Bearer sk-b')
    } finally {
      restore()
    }
  })

  it('lets the wire seam alone drive the failover of a marked request', async () => {
    const { adapter, outgoing, restore } = crossSeamSetup(401)
    try {
      const events = await drain(callStream(adapter, MODEL))
      expect(events).toHaveLength(1)
      expect(events[0]?.['type']).toBe('error')
      // The wire seam tried its two keys in ITS order (sk-b first, sk-a
      // second) — one network attempt each. Without the marker the fetch
      // layer would have run its own failover under every attempt, re-signing
      // with list order (sk-a first) and doubling the round trips.
      expect(outgoing.map((request) => request.headers.get('authorization')))
        .toEqual(['Bearer sk-b', 'Bearer sk-a'])
      for (const request of outgoing) {
        expect(request.headers.has('x-dsh-model-think-level-wire')).toBe(false)
      }
    } finally {
      restore()
    }
  })
})
