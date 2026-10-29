/**
 * Host apply() integration tests against a fake settings service shaped like
 * the 0.1.7 SettingsForms service: describe() returns one descriptor per
 * active profile entry, and there is deliberately no get().
 */

import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import * as keyIndex from '../src/key-index.js'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { keyIndexFilePath, keyEntriesOf, readKeyIndex, writeKeyIndex } from '../src/key-index.js'
import { maskKeyValue } from '../src/key-refs.js'
import { loadBankSync } from '../src/fingerprint/bank.js'
import { analyzeGlobalOutputs } from '../src/fingerprint/core.js'
import { EARLY_IDENTIFIED_PROBABILITY } from '../src/fingerprint/verdict.js'

type HostCtx = Parameters<typeof import('../src/index.js').apply>[0]

/** A settings service with the real provider's face (narrowed to what apply uses). */
function fakeSettings(providers: Record<string, unknown> | undefined) {
  let revision = 3
  let current = providers
  let describeCalls = 0
  let failNextMutation = 0
  const updates: Array<{ patch: object; expectedRevision: number | undefined }> = []
  const mutations: Array<{ ops: unknown[]; expectedRevision: number | undefined }> = []
  return {
    describe(): Array<{ ns: string; revision: number; value?: unknown; user?: unknown }> {
      describeCalls += 1
      // Registered namespaces only: before llm-pi-ai registers, the list is empty.
      // The descriptor carries the raw USER layer too — the autofill builds its
      // patch from it, never from the resolved view.
      return current === undefined
        ? []
        : [{ ns: 'llm-pi-ai', revision, value: { providers: current }, user: { providers: current } }]
    },
    async update(ns: string, patch: object, expectedRevision?: number): Promise<void> {
      if (expectedRevision !== undefined && expectedRevision !== revision) {
        throw new Error(`settings namespace "${String(ns)}" changed since it was read (expected ${expectedRevision}, now ${revision})`)
      }
      updates.push({ patch, expectedRevision })
      revision += 1
    },
    /**
     * The path-op face the key manager writes through. Only the `providers`
     * subtree is modelled — one field on one route — which is exactly what
     * enabling a key does. The revision fence behaves like the real service,
     * and `failNextMutation` throws the conflict code `isConflictError` looks
     * for, so the retry path is reachable from a test.
     */
    async mutate(ns: string, ops: unknown[], expectedRevision?: number): Promise<void> {
      if (failNextMutation > 0) {
        failNextMutation -= 1
        const conflict = new Error('the settings document moved') as Error & { code?: string }
        conflict.code = 'SETTINGS_CONFLICT'
        throw conflict
      }
      if (expectedRevision !== undefined && expectedRevision !== revision) {
        throw new Error(`settings namespace "${String(ns)}" changed since it was read (expected ${expectedRevision}, now ${revision})`)
      }
      const next: Record<string, unknown> = { ...(current ?? {}) }
      for (const candidate of Array.isArray(ops) ? ops : []) {
        if (typeof candidate !== 'object' || candidate === null) continue
        const op = candidate as Record<string, unknown>
        const path = op['path']
        if (!Array.isArray(path) || path.length !== 3 || path[0] !== 'providers') continue
        const route = String(path[1])
        const field = String(path[2])
        const existing = next[route]
        if (typeof existing !== 'object' || existing === null) continue
        const profile = { ...(existing as Record<string, unknown>) }
        if (op['op'] === 'set') profile[field] = op['value']
        else if (op['op'] === 'unset') delete profile[field]
        next[route] = profile
      }
      current = next
      mutations.push({ ops: Array.isArray(ops) ? ops : [], expectedRevision })
      revision += 1
    },
    updates,
    mutations,
    describeCalls: () => describeCalls,
    /** Make the next `count` mutates lose a race, the way a competing writer does. */
    failNextMutation: (count = 1): void => { failNextMutation = count },
    providers: () => current,
    register(namespace: string, next?: Record<string, unknown>): void {
      void namespace
      if (next !== undefined) current = next
    },
  }
}

/** Disposers collected from every fakeHost effect(), run after each test. */
const hostCleanups: Array<() => void> = []

/** Minimal cordis context face capturing what apply() touches. */
function fakeHost(
  settings: ReturnType<typeof fakeSettings>,
  options?: {
    credentials?: {
      resolve(ref: string): Promise<{ value?: string } | undefined>
      describe?(refs: string[]): Promise<unknown>
      set?(ref: string, value: string): Promise<unknown>
      unset?(ref: string): Promise<unknown>
    }
    llm?: unknown
  },
): {
  ctx: HostCtx
  emitUpdated: (ns: unknown) => void
  routes: Map<string, (req: unknown, res: unknown) => Promise<void>>
  dispose: () => void
} {
  const listeners: Array<(ns: unknown) => void> = []
  const routes = new Map<string, (req: unknown, res: unknown) => Promise<void>>()
  const disposers: Array<() => void> = []
  // The fake effect: shared by ctx.effect and the injected Context's own
  // effect member (the deferred tool registration runs on the injected value).
  const effect = (setup: () => () => void, _name?: string): void => {
    // Collect the disposer like the real cordis fiber does: the boot-fill
    // retry timers must be cleared with the test instead of firing into the
    // next test's world (previously the cleanup was silently dropped).
    const disposer = setup()
    if (typeof disposer === 'function') {
      hostCleanups.push(disposer)
      disposers.push(disposer)
    }
  }
  const ctx = {
    // apply reads the settings service directly (module-level inject already
    // guarantees it); the inner inject remains for webServer only.
    settings,
    inject(deps: string[], cb: (injected: Record<string, unknown>) => void): void {
      const injected: Record<string, unknown> = {}
      if (deps.includes('settings')) injected['settings'] = settings
      if (deps.includes('llm') && options?.llm !== undefined) injected['llm'] = options.llm
      if (deps.includes('webServer')) {
        injected['webServer'] = {
          register(route: { path: string; handler: (req: unknown, res: unknown) => Promise<void> }): () => void {
            routes.set(route.path, route.handler)
            return () => { routes.delete(route.path) }
          },
        }
      }
      // Cordis waits for EVERY dep; a missing one means the callback never
      // runs (the image tool registration defers on tools + attachments).
      if (Object.keys(injected).length < deps.length) return
      injected['effect'] = effect
      cb(injected)
    },
    effect,
    on(event: string, cb: (ns: unknown) => void): void {
      if (event === 'settings/document-updated') listeners.push(cb)
    },
    get(name: string): unknown {
      return name === 'credentials' ? options?.credentials : undefined
    },
  } as unknown as HostCtx
  // dispose() is idempotent with the afterEach drain (restores assign the
  // same originals twice); it lets one test assert the uninstall-clean
  // contract without waiting for teardown.
  const dispose = (): void => {
    for (const disposer of disposers.splice(0)) disposer()
  }
  return { ctx, emitUpdated: (ns) => { for (const listener of listeners) listener(ns) }, routes, dispose }
}

const PROVIDERS = {
  aliyun: {
    displayName: 'Aliyun',
    api: 'openai-completions',
    models: [{ id: 'qwen-max', name: 'Qwen Max' }],
  },
}

beforeEach(() => {
  vi.restoreAllMocks()
})

afterEach(() => {
  vi.useRealTimers()
  for (const cleanup of hostCleanups.splice(0)) cleanup()
})

describe('apply() autofill', () => {
  it('writes the fill through the real service shape, with the optimistic lock', async () => {
    const settings = fakeSettings(PROVIDERS)
    const { ctx } = fakeHost(settings)
    const { apply } = await import('../src/index.js')
    apply(ctx)
    await vi.waitFor(() => { expect(settings.updates).toHaveLength(1) })
    const routes = (settings.updates[0]!.patch as { providers: Record<string, { models: Array<Record<string, unknown>> }> }).providers
    expect(routes.aliyun.models[0]!['reasoningEfforts']).toEqual({ off: null, high: 'high' })
    // The lock carried the revision read at describe() time.
    expect(settings.updates[0]!.expectedRevision).toBe(3)
  })

  it('does nothing when every model already declares efforts and modalities', async () => {
    const declared = {
      aliyun: { api: 'openai-completions', models: [{ id: 'qwen-max', reasoningEfforts: false, input: ['text'] }] },
    }
    const settings = fakeSettings(declared)
    const { ctx } = fakeHost(settings)
    const { apply } = await import('../src/index.js')
    apply(ctx)
    await new Promise(resolve => setTimeout(resolve, 20))
    expect(settings.updates).toHaveLength(0)
  })

  it('never re-fills on a settings/document-updated commit: the running fill is the browser half\'s', async () => {
    // Issue #7: a fill the moment a commit lands rides the official card's own
    // frozen revision baseline, so the user's NEXT save in that card is refused
    // with `settings/conflict` and their edit reads as lost. The browser half
    // owns the running complement now (it writes on its idle pass, once no card
    // is open); the host fills at boot only.
    const settings = fakeSettings({ aliyun: { api: 'openai-completions', models: [] } })
    const { ctx, emitUpdated } = fakeHost(settings)
    const { apply } = await import('../src/index.js')
    apply(ctx)
    await new Promise(resolve => setTimeout(resolve, 20))
    expect(settings.updates).toHaveLength(0)
    // A user edit lands, adding an undeclared model: no host write may follow.
    settings.register('llm-pi-ai', PROVIDERS)
    emitUpdated('llm-pi-ai')
    await new Promise(resolve => setTimeout(resolve, 20))
    expect(settings.updates).toHaveLength(0)
    // Another namespace never triggers a fill either.
    emitUpdated('some-other-ns')
    await new Promise(resolve => setTimeout(resolve, 20))
    expect(settings.updates).toHaveLength(0)
  })

  it('does not refill a declaration the user deliberately unset', async () => {
    const settings = fakeSettings(PROVIDERS)
    const { ctx, emitUpdated } = fakeHost(settings)
    const { apply } = await import('../src/index.js')
    apply(ctx)
    // The boot fill declares the model.
    await vi.waitFor(() => { expect(settings.updates).toHaveLength(1) })
    // The editor's unset flow lands: the field is gone, the durable marker
    // records the absence as a decision.
    settings.register('llm-pi-ai', {
      aliyun: {
        displayName: 'Aliyun',
        api: 'openai-completions',
        models: [{ id: 'qwen-max', name: 'Qwen Max', reasoningEffortsUnset: true, inputUnset: true }],
      },
    })
    emitUpdated('llm-pi-ai')
    await new Promise(resolve => setTimeout(resolve, 20))
    // No second write: the unsets survive the very next autofill pass (and,
    // being persisted in the document, every later boot).
    expect(settings.updates).toHaveLength(1)
  })

  it('fills every undeclared model in the one boot pass, and only there', async () => {
    // The running complement moved to the browser half (issue #7 -- see the
    // "never re-fills on a settings/document-updated commit" case above). What stays
    // here: one boot write carries the whole document, and a deliberate unset
    // is still respected.
    const settings = fakeSettings({
      aliyun: {
        displayName: 'Aliyun',
        api: 'openai-completions',
        models: [
          { id: 'qwen-max', name: 'Qwen Max', reasoningEffortsUnset: true },
          { id: 'qwen-turbo' },
        ],
      },
    })
    const { ctx, emitUpdated } = fakeHost(settings)
    const { apply } = await import('../src/index.js')
    apply(ctx)
    await vi.waitFor(() => { expect(settings.updates).toHaveLength(1) })
    const models = (settings.updates[0]!.patch as { providers: Record<string, { models: Array<Record<string, unknown>> }> })
      .providers.aliyun.models
    // The deliberately-unset row stays untouched; the undeclared one is filled.
    expect(models.find(model => model['id'] === 'qwen-max')!['reasoningEfforts']).toBeUndefined()
    expect(models.find(model => model['id'] === 'qwen-turbo')!['reasoningEfforts']).toBeDefined()
    // A later commit adds nothing.
    emitUpdated('llm-pi-ai')
    await new Promise(resolve => setTimeout(resolve, 20))
    expect(settings.updates).toHaveLength(1)
  })

  it('survives a conflicting write without throwing', async () => {
    const settings = fakeSettings(PROVIDERS)
    // Force the optimistic lock to refuse.
    settings.updates.length = 0
    const { ctx } = fakeHost(settings)
    const { apply } = await import('../src/index.js')
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    // Bump the revision between describe and update by wrapping update.
    const originalUpdate = settings.update.bind(settings)
    let described = false
    Object.defineProperty(settings, 'update', {
      value: async (ns: string, patch: object, expectedRevision?: number) => {
        if (!described && expectedRevision !== undefined) {
          described = true
          throw new Error(`settings namespace "llm-pi-ai" changed since it was read (expected ${expectedRevision}, now 99)`)
        }
        return originalUpdate(ns, patch, expectedRevision)
      },
    })
    apply(ctx)
    await vi.waitFor(() => { expect(errorSpy).toHaveBeenCalled() })
    expect(errorSpy.mock.calls[0]![0]).toContain('changed since it was read')
  })

  it('retries the boot fill on a bounded schedule while llm-pi-ai is unregistered', async () => {
    vi.useFakeTimers()
    const settings = fakeSettings(undefined)
    const { ctx } = fakeHost(settings)
    const { apply } = await import('../src/index.js')
    apply(ctx)
    // The namespace is still missing after the first pass and several retries.
    await vi.advanceTimersByTimeAsync(2500)
    expect(settings.updates).toHaveLength(0)
    // llm-pi-ai registers; the next scheduled retry fills.
    settings.register('llm-pi-ai', PROVIDERS)
    await vi.advanceTimersByTimeAsync(1500)
    expect(settings.updates).toHaveLength(1)
    // The schedule is bounded: no further writes fire.
    await vi.advanceTimersByTimeAsync(10_000)
    expect(settings.updates).toHaveLength(1)
  })

  it('honors an autofill: false configuration by never writing', async () => {
    const settings = fakeSettings(PROVIDERS)
    const { ctx, emitUpdated } = fakeHost(settings)
    const { apply } = await import('../src/index.js')
    apply(ctx, { autofill: false })
    await new Promise(resolve => setTimeout(resolve, 20))
    expect(settings.updates).toHaveLength(0)
    emitUpdated('llm-pi-ai')
    await new Promise(resolve => setTimeout(resolve, 20))
    expect(settings.updates).toHaveLength(0)
  })

  it('honors a configured boot retry schedule', async () => {
    vi.useFakeTimers()
    const settings = fakeSettings(undefined)
    const { ctx } = fakeHost(settings)
    const { apply } = await import('../src/index.js')
    apply(ctx, { bootRetryDelaysMs: [5, 5] })
    // The namespace registers after the first (failed) pass; the retry
    // scheduled on the CONFIGURED 5ms delay fills it.
    settings.register('llm-pi-ai', PROVIDERS)
    await vi.advanceTimersByTimeAsync(6)
    expect(settings.updates).toHaveLength(1)
    await vi.advanceTimersByTimeAsync(100)
    expect(settings.updates).toHaveLength(1)
  })
})

describe('apply() header overlay lifecycle', () => {
  it('recovers on a settings event after header boot retries are exhausted', async () => {
    vi.useFakeTimers()
    const settings = fakeSettings(undefined)
    const fetchMock = vi.fn(async () => new Response('{}', { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)
    const { ctx, emitUpdated } = fakeHost(settings)
    const { apply } = await import('../src/index.js')
    apply(ctx, { autofill: false, bootRetryDelaysMs: [5] })
    await vi.advanceTimersByTimeAsync(50)
    settings.register('llm-pi-ai', { relay: { baseURL: 'https://relay.example.com/v1', headers: { 'x-company': 'late' } } })
    emitUpdated('llm-pi-ai')
    await globalThis.fetch('https://relay.example.com/v1/chat/completions')
    const [, init] = fetchMock.mock.calls[0] as unknown as [string, { headers: HeadersInit }]
    expect(new Headers(init.headers).get('x-company')).toBe('late')
  })

  it('refreshes headers when the pi-ai settings namespace registers after boot', async () => {
    vi.useFakeTimers()
    const settings = fakeSettings(undefined)
    const fetchMock = vi.fn(async () => new Response('{}', { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)
    const { ctx } = fakeHost(settings)
    const { apply } = await import('../src/index.js')
    apply(ctx, { autofill: false, bootRetryDelaysMs: [5] })

    // The settings namespace is registered after the plugin's first pass.
    settings.register('llm-pi-ai', {
      agentrouter: {
        baseURL: 'https://relay.example.com/v1',
        headers: { 'user-agent': 'custom-agent/1.0', 'x-company': 'acme' },
      },
    })
    await vi.advanceTimersByTimeAsync(5)
    await globalThis.fetch('https://relay.example.com/v1/chat/completions')

    const [, init] = fetchMock.mock.calls[0] as unknown as [string, { headers: HeadersInit }]
    const headers = new Headers(init.headers)
    expect(headers.get('user-agent')).toBe('custom-agent/1.0')
    expect(headers.get('x-company')).toBe('acme')
  })
})

describe('apply() probe route', () => {
  const PROBE_PATH = '/dsh-model-think-level/raw-models'

  function fakeRes(): { res: unknown; out: () => { status: number; body: Record<string, unknown> } } {
    let status = 0
    let raw = ''
    const res = {
      set statusCode(value: number) { status = value },
      get statusCode(): number { return status },
      setHeader(_key: string, _value: string): void {},
      end(body?: string): void { raw = body ?? '' },
    }
    return {
      res,
      out: () => ({ status, body: JSON.parse(raw.length > 0 ? raw : '{}') as Record<string, unknown> }),
    }
  }

  function fakeReq(overrides?: { method?: string; url?: string; headers?: Record<string, string> }): unknown {
    return {
      method: 'GET',
      url: `?route=aliyun`,
      headers: { host: '127.0.0.1:3080' },
      ...overrides,
    }
  }

  it('proxies the raw listing with the stored credential, never echoing it', async () => {
    const settings = fakeSettings({
      aliyun: { api: 'openai-completions', baseURL: 'https://gw.example.com/v1', apiKeyEnv: 'ALIYUN_KEY', models: [] },
    })
    const credentials = { resolve: async (ref: string) => ({ value: ref === 'ALIYUN_KEY' ? 'sk-secret' : undefined }) }
    const { ctx, routes } = fakeHost(settings, { credentials })
    const { apply } = await import('../src/index.js')
    apply(ctx)
    const handler = routes.get(PROBE_PATH)
    expect(handler).toBeDefined()

    const fetchMock = vi.fn(async () => ({
      ok: true,
      headers: { get: () => null },
      body: new ReadableStream<Uint8Array>({
        start(controller) {
          controller.enqueue(new TextEncoder().encode(JSON.stringify({ data: [{ id: 'qwen-max', supported_parameters: ['reasoning'] }] })))
          controller.close()
        },
      }),
    }))
    vi.stubGlobal('fetch', fetchMock)

    const { res, out } = fakeRes()
    await handler!(fakeReq(), res)
    const reply = out()
    expect(reply.status).toBe(200)
    expect(reply.body['ok']).toBe(true)
    expect((reply.body['data'] as unknown[]).length).toBe(1)
    // The credential went upstream as a bearer token and nowhere else.
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, { headers: Record<string, string> }]
    expect(url).toBe('https://gw.example.com/v1/models')
    expect(init.headers['authorization']).toBe('Bearer sk-secret')
    expect(JSON.stringify(reply.body)).not.toContain('sk-secret')
    vi.unstubAllGlobals()
  })

  it('refuses to follow a redirect away from the authority the profile names', async () => {
    const settings = fakeSettings({
      aliyun: { api: 'openai-completions', baseURL: 'https://gw.example.com/v1', apiKeyEnv: 'ALIYUN_KEY', models: [] },
    })
    const credentials = { resolve: async () => ({ value: 'sk-secret' }) }
    const { ctx, routes } = fakeHost(settings, { credentials })
    const { apply } = await import('../src/index.js')
    apply(ctx)
    const handler = routes.get(PROBE_PATH)!
    const fetchMock = vi.fn(async () => ({
      ok: true,
      headers: { get: () => null },
      body: new ReadableStream<Uint8Array>({
        start(controller) {
          controller.enqueue(new TextEncoder().encode(JSON.stringify({ data: [{ id: 'qwen-max' }] })))
          controller.close()
        },
      }),
    }))
    vi.stubGlobal('fetch', fetchMock)

    const { res, out } = fakeRes()
    await handler!(fakeReq(), res)
    expect(out().status).toBe(200)
    // Fetch follows a cross-origin redirect by default while keeping the
    // probe's own credential headers attached, so refusing the hop is what
    // keeps the credential bound to the configured authority.
    const [, init] = fetchMock.mock.calls[0] as unknown as [string, { redirect?: string }]
    expect(init.redirect).toBe('error')
    vi.unstubAllGlobals()
  })

  it('probes an Anthropic Messages route through /v1/models with x-api-key', async () => {
    const settings = fakeSettings({
      anthropic: { api: 'anthropic-messages', baseURL: 'https://api.anthropic.com/v1', apiKeyEnv: 'ANTHROPIC_KEY', models: [] },
    })
    const credentials = { resolve: async (ref: string) => ({ value: ref === 'ANTHROPIC_KEY' ? 'sk-ant-secret' : undefined }) }
    const { ctx, routes } = fakeHost(settings, { credentials })
    const { apply } = await import('../src/index.js')
    apply(ctx)
    const handler = routes.get(PROBE_PATH)!
    const fetchMock = vi.fn(async () => ({
      ok: true,
      headers: { get: () => null },
      body: new ReadableStream<Uint8Array>({
        start(controller) {
          controller.enqueue(new TextEncoder().encode(JSON.stringify({ data: [{ id: 'claude-opus-5', capabilities: { thinking: { supported: true }, image_input: { supported: true } } }] })))
          controller.close()
        },
      }),
    }))
    vi.stubGlobal('fetch', fetchMock)
    const { res, out } = fakeRes()
    await handler!(fakeReq({ url: '?route=anthropic' }), res)
    const reply = out()
    expect(reply.status).toBe(200)
    expect((reply.body['data'] as unknown[]).length).toBe(1)
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, { headers: Record<string, string> }]
    // The trailing /v1 is normalized away and reattached on the native route.
    expect(url).toBe('https://api.anthropic.com/v1/models?limit=1000')
    expect(init.headers['x-api-key']).toBe('sk-ant-secret')
    expect(init.headers['anthropic-version']).toBe('2023-06-01')
    expect(init.headers['authorization']).toBeUndefined()
    expect(JSON.stringify(reply.body)).not.toContain('sk-ant-secret')
    vi.unstubAllGlobals()
  })

  it('refuses a protocol whose listing this mirror cannot read', async () => {
    const settings = fakeSettings({ azure: { api: 'azure', baseURL: 'https://azure.example.com', models: [] } })
    const { ctx, routes } = fakeHost(settings)
    const { apply } = await import('../src/index.js')
    apply(ctx)
    const handler = routes.get(PROBE_PATH)!
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    const { res, out } = fakeRes()
    await handler!(fakeReq({ url: '?route=azure' }), res)
    expect(out().status).toBe(400)
    expect(String(out().body['error'])).toContain('cannot be interrogated')
    expect(fetchMock).not.toHaveBeenCalled()
    vi.unstubAllGlobals()
  })

  it('accepts the enriched models-map listing, keying entries by map key', async () => {
    const settings = fakeSettings({ aliyun: { api: 'openai-completions', baseURL: 'https://gw.example.com/v1', models: [] } })
    const { ctx, routes } = fakeHost(settings)
    const { apply } = await import('../src/index.js')
    apply(ctx)
    const handler = routes.get(PROBE_PATH)!
    const fetchMock = vi.fn(async () => ({
      ok: true,
      headers: { get: () => null },
      body: new ReadableStream<Uint8Array>({
        start(controller) {
          controller.enqueue(new TextEncoder().encode(JSON.stringify({
            models: {
              'qwen-max': { id: 'inner-canonical', name: 'Qwen Max', reasoning: true },
              'meta-field': 'not a model',
            },
          })))
          controller.close()
        },
      }),
    }))
    vi.stubGlobal('fetch', fetchMock)
    const { res, out } = fakeRes()
    await handler!(fakeReq({ url: '?route=aliyun' }), res)
    const reply = out()
    expect(reply.status).toBe(200)
    const entries = reply.body['data'] as Array<Record<string, unknown>>
    expect(entries).toHaveLength(1)
    // The map key is the endpoint-facing id; a nested canonical id is
    // overridden exactly as the official parser does.
    expect(entries[0]!['id']).toBe('qwen-max')
    expect(entries[0]!['reasoning']).toBe(true)
    vi.unstubAllGlobals()
  })

  it('reports a listing that answers neither shape', async () => {
    const settings = fakeSettings({ aliyun: { api: 'openai-completions', baseURL: 'https://gw.example.com/v1', models: [] } })
    const { ctx, routes } = fakeHost(settings)
    const { apply } = await import('../src/index.js')
    apply(ctx)
    const handler = routes.get(PROBE_PATH)!
    const fetchMock = vi.fn(async () => ({
      ok: true,
      headers: { get: () => null },
      body: new ReadableStream<Uint8Array>({
        start(controller) {
          controller.enqueue(new TextEncoder().encode(JSON.stringify({ ok: true })))
          controller.close()
        },
      }),
    }))
    vi.stubGlobal('fetch', fetchMock)
    const { res, out } = fakeRes()
    await handler!(fakeReq({ url: '?route=aliyun' }), res)
    expect(out().status).toBe(502)
    expect(String(out().body['error'])).toContain('neither a "data" array nor a "models" object')
    vi.unstubAllGlobals()
  })

  it('refuses a listing that declares more than the byte ceiling', async () => {
    const settings = fakeSettings({ aliyun: { api: 'openai-completions', baseURL: 'https://gw.example.com/v1', models: [] } })
    const { ctx, routes } = fakeHost(settings)
    const { apply } = await import('../src/index.js')
    apply(ctx)
    const handler = routes.get(PROBE_PATH)!
    const fetchMock = vi.fn(async () => ({
      ok: true,
      headers: { get: () => String(5 * 1024 * 1024) },
      body: new ReadableStream<Uint8Array>({
        start(controller) {
          controller.enqueue(new TextEncoder().encode('x'.repeat(1024)))
          controller.close()
        },
      }),
    }))
    vi.stubGlobal('fetch', fetchMock)
    const { res, out } = fakeRes()
    await handler!(fakeReq({ url: '?route=aliyun' }), res)
    expect(out().status).toBe(502)
    expect(String(out().body['error'])).toContain('overshoots')
    vi.unstubAllGlobals()
  })
  it('rejects cross-site callers before touching anything', async () => {
    const settings = fakeSettings({ aliyun: { baseURL: 'https://gw.example.com', models: [] } })
    const { ctx, routes } = fakeHost(settings)
    const { apply } = await import('../src/index.js')
    apply(ctx)
    const handler = routes.get(PROBE_PATH)!
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    const { res, out } = fakeRes()
    await handler(fakeReq({ headers: { host: '10.0.0.5:3080', 'sec-fetch-site': 'cross-site' } }), res)
    expect(out().status).toBe(403)
    expect(fetchMock).not.toHaveBeenCalled()
    vi.unstubAllGlobals()
  })

  it('rejects an Origin that does not match the Host (DNS-rebinding shape)', async () => {
    const settings = fakeSettings({ aliyun: { baseURL: 'https://gw.example.com', models: [] } })
    const { ctx, routes } = fakeHost(settings)
    const { apply } = await import('../src/index.js')
    apply(ctx)
    const handler = routes.get(PROBE_PATH)!
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    const { res, out } = fakeRes()
    // A rebinding page resolves its own origin's host to this server: the
    // Origin header still names the attacker's site and must be refused.
    await handler(fakeReq({
      headers: { host: '127.0.0.1:3080', origin: 'http://evil.example:4080' },
    }), res)
    expect(out().status).toBe(403)
    expect(fetchMock).not.toHaveBeenCalled()
    vi.unstubAllGlobals()
  })

  it('admits an IP-literal LAN Host with no browser trust signal (core parity)', async () => {
    // Core parity: a deployment serving on 0.0.0.0 trusts its derived LAN IP
    // literals; a browser cannot produce an IP Host via DNS rebinding, so the
    // fence admits it and the request fails later on the missing route.
    const settings = fakeSettings({})
    const { ctx, routes } = fakeHost(settings)
    const { apply } = await import('../src/index.js')
    apply(ctx)
    const handler = routes.get(PROBE_PATH)!
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    const { res, out } = fakeRes()
    await handler(fakeReq({
      headers: { host: '10.0.0.5:3080' },
      url: '?route=missing',
    }), res)
    expect(out().status).toBe(400)
    expect(String(out().body['error'])).toContain('no llm-pi-ai provider route')
    vi.unstubAllGlobals()
  })

  it('refuses a domain-named non-loopback Host outright', async () => {
    // The Host fence is THE rebinding defense: a rebound page always names
    // the attacker's domain here even though the socket lands on this
    // server. Unlike loopback/IP-literal hosts, named hosts are never
    // answered — there is no trustedHosts escape hatch yet.
    const settings = fakeSettings({ aliyun: { baseURL: 'https://gw.example.com', models: [] } })
    const { ctx, routes } = fakeHost(settings)
    const { apply } = await import('../src/index.js')
    apply(ctx)
    const handler = routes.get(PROBE_PATH)!
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    const { res, out } = fakeRes()
    // Plain curl against a LAN hostname.
    await handler(fakeReq({ headers: { host: 'harness.lan:3080' } }), res)
    expect(out().status).toBe(403)
    expect(fetchMock).not.toHaveBeenCalled()
    vi.unstubAllGlobals()
  })

  it('refuses a TRUE rebound host whose Origin matches and markers look same-origin', async () => {
    // The real rebinding shape: evil.example re-resolves to this server, so
    // Origin == Host == evil.example and sec-fetch-site is same-origin —
    // every string comparison passes. Only the Host fence stops it.
    const settings = fakeSettings({ aliyun: { baseURL: 'https://gw.example.com/v1', apiKeyEnv: 'ALIYUN_KEY', models: [] } })
    const { ctx, routes } = fakeHost(settings)
    const { apply } = await import('../src/index.js')
    apply(ctx)
    const handler = routes.get(PROBE_PATH)!
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    const { res, out } = fakeRes()
    await handler(fakeReq({
      headers: {
        host: 'evil.example:3080',
        origin: 'http://evil.example:3080',
        'sec-fetch-site': 'same-origin',
      },
    }), res)
    expect(out().status).toBe(403)
    expect(fetchMock).not.toHaveBeenCalled()
    vi.unstubAllGlobals()
  })

  it('admits a same-origin browser caller on a non-loopback Host', async () => {
    const settings = fakeSettings({})
    const { ctx, routes } = fakeHost(settings)
    const { apply } = await import('../src/index.js')
    apply(ctx)
    const handler = routes.get(PROBE_PATH)!
    const { res, out } = fakeRes()
    // Positive control: a real browser tab served from this very server.
    // The fence passes it; the request then fails on the missing route,
    // which proves the rejection above is the fence and not the route table.
    await handler(fakeReq({
      headers: { host: '10.0.0.5:3080', 'sec-fetch-site': 'same-origin' },
      url: '?route=missing',
    }), res)
    expect(out().status).toBe(400)
    expect(String(out().body['error'])).toContain('no llm-pi-ai provider route')
  })

  it('admits a same-site browser caller on an IP-literal LAN Host', async () => {
    // Same-site (sibling-port) tabs are legitimate GUI deployments too.
    const settings = fakeSettings({})
    const { ctx, routes } = fakeHost(settings)
    const { apply } = await import('../src/index.js')
    apply(ctx)
    const handler = routes.get(PROBE_PATH)!
    const { res, out } = fakeRes()
    await handler(fakeReq({
      headers: { host: '10.0.0.5:3080', 'sec-fetch-site': 'same-site' },
      url: '?route=missing',
    }), res)
    expect(out().status).toBe(400)
    expect(String(out().body['error'])).toContain('no llm-pi-ai provider route')
  })

  it('refuses an opaque "null" Origin (sandboxed iframe / file: page)', async () => {
    const settings = fakeSettings(PROVIDERS)
    const { ctx, routes } = fakeHost(settings)
    const { apply } = await import('../src/index.js')
    apply(ctx)
    const handler = routes.get(PROBE_PATH)!
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    const { res, out } = fakeRes()
    await handler(fakeReq({
      headers: { host: '127.0.0.1:3080', origin: 'null' },
    }), res)
    expect(out().status).toBe(403)
    expect(fetchMock).not.toHaveBeenCalled()
    vi.unstubAllGlobals()
  })

  it('answers only GET', async () => {
    const settings = fakeSettings(PROVIDERS)
    const { ctx, routes } = fakeHost(settings)
    const { apply } = await import('../src/index.js')
    apply(ctx)
    const handler = routes.get(PROBE_PATH)!
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    const { res, out } = fakeRes()
    await handler(fakeReq({ method: 'POST' }), res)
    expect(out().status).toBe(405)
    expect(fetchMock).not.toHaveBeenCalled()
    vi.unstubAllGlobals()
  })

  it('reports upstream auth failures with a key hint instead of throwing', async () => {
    const settings = fakeSettings({ aliyun: { api: 'openai-completions', baseURL: 'https://gw.example.com/v1', models: [] } })
    const { ctx, routes } = fakeHost(settings)
    const { apply } = await import('../src/index.js')
    apply(ctx)
    const handler = routes.get(PROBE_PATH)!
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, status: 401 })))
    const { res, out } = fakeRes()
    await handler(fakeReq(), res)
    const reply = out()
    // An upstream failure is a bad-gateway answer, not a silent 200.
    expect(reply.status).toBe(502)
    expect(reply.body['ok']).toBe(false)
    expect(String(reply.body['error'])).toContain('check the API key')
    vi.unstubAllGlobals()
  })

  it('never echoes baseURL credentials in failure responses', async () => {
    const settings = fakeSettings({ aliyun: { api: 'openai-completions', baseURL: 'https://user:sekrit@gw.example.com/v1', models: [] } })
    const { ctx, routes } = fakeHost(settings)
    const { apply } = await import('../src/index.js')
    apply(ctx)
    const handler = routes.get(PROBE_PATH)!
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('boom') }))
    const { res, out } = fakeRes()
    await handler(fakeReq(), res)
    const reply = out()
    expect(reply.status).toBe(502)
    const text = JSON.stringify(reply.body)
    expect(text).not.toContain('sekrit')
    expect(text).not.toContain('user:')
    expect(text).toContain('gw.example.com')
    vi.unstubAllGlobals()
  })

  it('returns 502 without probing when a configured credential cannot be read', async () => {
    const settings = fakeSettings({ aliyun: { api: 'openai-completions', baseURL: 'https://gw.example.com/v1', apiKeyEnv: 'ALIYUN_KEY' } })
    const { ctx, routes } = fakeHost(settings, { credentials: { resolve: async () => { throw new Error('unavailable') } } })
    const { apply } = await import('../src/index.js')
    apply(ctx, { autofill: false })
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    const { res, out } = fakeRes()
    await routes.get(PROBE_PATH)!(fakeReq(), res)
    expect(out().status).toBe(502)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('probes unauthenticated when no credential resolves', async () => {
    const settings = fakeSettings({ aliyun: { api: 'openai-completions', baseURL: 'https://gw.example.com/v1', models: [] } })
    const { ctx, routes } = fakeHost(settings)
    const { apply } = await import('../src/index.js')
    apply(ctx)
    const handler = routes.get(PROBE_PATH)!
    const fetchMock = vi.fn(async () => ({
      ok: true,
      headers: { get: () => null },
      body: new ReadableStream<Uint8Array>({
        start(controller) {
          controller.enqueue(new TextEncoder().encode(JSON.stringify({ data: [] })))
          controller.close()
        },
      }),
    }))
    vi.stubGlobal('fetch', fetchMock)
    const { res, out } = fakeRes()
    await handler(fakeReq(), res)
    expect(out().body['ok']).toBe(true)
    const [, init] = fetchMock.mock.calls[0] as unknown as [string, { headers: Record<string, string> }]
    expect(init.headers['authorization']).toBeUndefined()
    vi.unstubAllGlobals()
  })

  describe('modality autofill', () => {
    it('fills only the missing modality for an effort-declared model', async () => {
      const settings = fakeSettings({
        aliyun: { api: 'openai-completions', models: [{ id: 'qwen-max', reasoningEfforts: false }] },
      })
      const { ctx } = fakeHost(settings)
      const { apply } = await import('../src/index.js')
      apply(ctx)
      await vi.waitFor(() => { expect(settings.updates).toHaveLength(1) })
      const patch = settings.updates[0].patch as {
        providers: Record<string, { models: Array<Record<string, unknown>> }>
      }
      const model = patch.providers.aliyun.models[0]
      expect(model.reasoningEfforts).toBe(false)
      expect(model.input).toEqual(['text'])
    })

    it('honors modalityAutofill:false by never filling modalities', async () => {
      const settings = fakeSettings({
        aliyun: { api: 'openai-completions', models: [{ id: 'qwen-max', reasoningEfforts: false }] },
      })
      const { ctx } = fakeHost(settings)
      const { apply } = await import('../src/index.js')
      apply(ctx, { modalityAutofill: false })
      await new Promise(resolve => setTimeout(resolve, 20))
      expect(settings.updates).toHaveLength(0)
    })

    it('respects a deliberate inputUnset marker while still filling efforts', async () => {
      const settings = fakeSettings({
        aliyun: { api: 'openai-completions', models: [{ id: 'qwen-max', inputUnset: true }] },
      })
      const { ctx } = fakeHost(settings)
      const { apply } = await import('../src/index.js')
      apply(ctx)
      await vi.waitFor(() => { expect(settings.updates).toHaveLength(1) })
      const patch = settings.updates[0].patch as {
        providers: Record<string, { models: Array<Record<string, unknown>> }>
      }
      const model = patch.providers.aliyun.models[0]
      expect(model.reasoningEfforts).toBeDefined()
      expect(model.input).toBeUndefined()
      // The marker survives: the absence stays a decision.
      expect(model.inputUnset).toBe(true)
    })
  })
})

describe('apply() provider-key route', () => {
  const KEY_PATH = '/dsh-model-think-level/provider-key'

  /** The probe's fake response, but this one KEEPS the headers: the route's
   * whole promise is that a shown key is never cacheable. */
  function fakeRes(): {
    res: unknown
    headers: Record<string, string>
    out: () => { status: number; body: Record<string, unknown> }
  } {
    let status = 0
    let raw = ''
    const headers: Record<string, string> = {}
    const res = {
      set statusCode(value: number) { status = value },
      get statusCode(): number { return status },
      setHeader(key: string, value: string): void { headers[key.toLowerCase()] = value },
      end(body?: string): void { raw = body ?? '' },
    }
    return {
      res,
      headers,
      out: () => ({ status, body: JSON.parse(raw.length > 0 ? raw : '{}') as Record<string, unknown> }),
    }
  }

  function fakeReq(overrides?: { method?: string; url?: string; headers?: Record<string, string> }): unknown {
    return {
      method: 'GET',
      url: '?route=aliyun',
      headers: { host: '127.0.0.1:3080' },
      ...overrides,
    }
  }

  const profile = { api: 'openai-completions', baseURL: 'https://gw.example.com/v1', apiKeyEnv: 'ALIYUN_KEY', models: [] }

  /** apply() against a fake host, answering with the registered route. */
  async function routeFor(
    providers: Record<string, unknown>,
    credentials?: { resolve(ref: string): Promise<{ value?: string } | undefined> },
  ): Promise<(req: unknown, res: unknown) => Promise<void>> {
    const settings = fakeSettings(providers)
    const { ctx, routes } = fakeHost(settings, credentials === undefined ? undefined : { credentials })
    const { apply } = await import('../src/index.js')
    apply(ctx)
    const handler = routes.get(KEY_PATH)
    expect(handler).toBeDefined()
    return handler!
  }

  it('answers with the stored credential under a path the client pins', async () => {
    const credentials = { resolve: async (ref: string) => ({ value: ref === 'ALIYUN_KEY' ? 'sk-secret' : undefined }) }
    const handler = await routeFor({ aliyun: profile }, credentials)

    const { res, headers, out } = fakeRes()
    await handler(fakeReq(), res)

    const reply = out()
    expect(reply.status).toBe(200)
    expect(reply.body['ok']).toBe(true)
    expect(reply.body['key']).toBe('sk-secret')
    // The one route here that hands a value to the page has to be uncacheable.
    expect(headers['cache-control']).toBe('no-store')
  })

  it('reports a credential that is not configured', async () => {
    const credentials = { resolve: async () => undefined }
    const handler = await routeFor({ aliyun: profile }, credentials)

    const { res, headers, out } = fakeRes()
    await handler(fakeReq(), res)

    expect(out().status).toBe(404)
    expect(String(out().body['error'])).toContain('ALIYUN_KEY')
    expect(headers['cache-control']).toBe('no-store')
  })

  it('reports unavailable credentials as 502 rather than an absent key', async () => {
    for (const credentials of [undefined, { resolve: async () => { throw new Error('unavailable') } },
      { resolve: async () => ({ ok: false, error: 'unavailable' }) }]) {
      const handler = await routeFor({ aliyun: profile }, credentials as Parameters<typeof routeFor>[1])
      const { res, headers, out } = fakeRes()
      await handler(fakeReq(), res)
      expect(out().status).toBe(502)
      expect(headers['cache-control']).toBe('no-store')
      expect(out().body).not.toHaveProperty('key')
    }
  })

  it('reports unreadable settings as 502 rather than a missing route', async () => {
    const settings = fakeSettings({ aliyun: profile })
    settings.describe = () => { throw new Error('unavailable') }
    const { ctx, routes } = fakeHost(settings)
    const { apply } = await import('../src/index.js')
    apply(ctx, { autofill: false, bootRetryDelaysMs: [] })
    const { res, out } = fakeRes()
    await routes.get(KEY_PATH)!(fakeReq(), res)
    expect(out().status).toBe(502)
  })

  it('reports a profile that names no credential reference', async () => {
    const handler = await routeFor({ local: { api: 'openai-completions', baseURL: 'http://localhost:11434/v1' } })

    const { res, out } = fakeRes()
    await handler(fakeReq({ url: '?route=local' }), res)

    expect(out().status).toBe(404)
    expect(String(out().body['error'])).toContain('stores no credential reference')
  })

  it('refuses a route the settings do not name', async () => {
    const handler = await routeFor({ aliyun: profile })

    const { res, out } = fakeRes()
    await handler(fakeReq({ url: '?route=nope' }), res)

    expect(out().status).toBe(400)
    expect(String(out().body['error'])).toContain('no llm-pi-ai provider route "nope"')
  })

  it('refuses a cross-site caller before it looks anything up', async () => {
    const resolve = vi.fn(async () => ({ value: 'sk-secret' }))
    const handler = await routeFor({ aliyun: profile }, { resolve })

    const { res, headers, out } = fakeRes()
    await handler(fakeReq({ headers: { host: '10.0.0.5:3080', 'sec-fetch-site': 'cross-site' } }), res)

    expect(out().status).toBe(403)
    expect(resolve).not.toHaveBeenCalled()
    expect(headers['cache-control']).toBe('no-store')
  })

  it('answers a non-GET with 405', async () => {
    const handler = await routeFor({ aliyun: profile })

    const { res, out } = fakeRes()
    await handler(fakeReq({ method: 'POST' }), res)

    expect(out().status).toBe(405)
  })

  it('leaves the settings document untouched', async () => {
    const settings = fakeSettings({ aliyun: profile })
    const credentials = { resolve: async () => ({ value: 'sk-secret' }) }
    const { ctx, routes } = fakeHost(settings, { credentials })
    const { apply } = await import('../src/index.js')
    apply(ctx)
    const handler = routes.get(KEY_PATH)!

    const { res, out } = fakeRes()
    await handler(fakeReq(), res)

    expect(out().status).toBe(200)
    // Showing a key is a read: the reveal must never become a write.
    expect(settings.updates).toHaveLength(0)
  })
})

describe('apply() key-index route', () => {
  const INDEX_PATH = '/dsh-model-think-level/key-index'

  /** The index lives under the harness home; point it at a temp dir per test. */
  const savedHome = process.env['DSH_HOME']
  let home = ''

  beforeEach(() => {
    home = mkdtempSync(join(tmpdir(), 'bre-host-index-'))
    process.env['DSH_HOME'] = home
  })

  afterEach(() => {
    if (savedHome === undefined) delete process.env['DSH_HOME']
    else process.env['DSH_HOME'] = savedHome
    rmSync(home, { recursive: true, force: true })
  })

  /** The fake response that also keeps the headers: this route must never be cached. */
  function fakeRes(): {
    res: unknown
    headers: Record<string, string>
    out: () => { status: number; body: Record<string, unknown> }
  } {
    let status = 0
    let raw = ''
    const headers: Record<string, string> = {}
    const res = {
      set statusCode(value: number) { status = value },
      get statusCode(): number { return status },
      setHeader(key: string, value: string): void { headers[key.toLowerCase()] = value },
      end(body?: string): void { raw = body ?? '' },
    }
    return {
      res,
      headers,
      out: () => ({ status, body: JSON.parse(raw.length > 0 ? raw : '{}') as Record<string, unknown> }),
    }
  }

  /** A request whose body is the async iterable the route reads it as. */
  function fakeReq(overrides?: {
    method?: string
    url?: string
    headers?: Record<string, string>
    body?: unknown
  }): unknown {
    const text = overrides?.body === undefined ? '' : JSON.stringify(overrides.body)
    const req: Record<string | symbol, unknown> = {
      method: 'GET',
      url: '?route=aliyun',
      headers: { host: '127.0.0.1:3080' },
      ...overrides,
    }
    if (text.length > 0) {
      req[Symbol.asyncIterator] = async function* () { yield text }
    }
    return req
  }

  /** The credential face the route uses, tracking values in memory. */
  interface Store {
    resolve(ref: string): Promise<{ value?: string } | undefined>
    describe?(refs: string[]): Promise<unknown>
    set?(ref: string, value: string): Promise<unknown>
    unset?(ref: string): Promise<unknown>
  }

  function credentialStore(held?: Record<string, string>): Store & { values: Record<string, string> } {
    const values: Record<string, string> = { ...(held ?? {}) }
    return {
      values,
      async resolve(ref: string) {
        const value = values[ref]
        return value === undefined ? undefined : { value }
      },
      async set(ref: string, value: string) {
        values[ref] = value
        return { ok: true }
      },
      async unset(ref: string) {
        delete values[ref]
        return { ok: true }
      },
    }
  }

  const profile = { api: 'openai-completions', baseURL: 'https://gw.example.com/v1', apiKeyEnv: 'ALIYUN_KEY', models: [] }
  const indexFile = (): string => keyIndexFilePath(home)

  async function mounted(
    providers: Record<string, unknown>,
    credentials?: Store,
  ): Promise<{
    handler: (req: unknown, res: unknown) => Promise<void>
    settings: ReturnType<typeof fakeSettings>
    /** Fire a settings event, as the host does after any document move. */
    emitUpdated: (ns: unknown) => void
  }> {
    const settings = fakeSettings(providers)
    const { ctx, routes, emitUpdated } = fakeHost(settings, credentials === undefined ? undefined : { credentials })
    const { apply } = await import('../src/index.js')
    apply(ctx)
    const handler = routes.get(INDEX_PATH)
    expect(handler).toBeDefined()
    return { handler: handler!, settings, emitUpdated }
  }

  it('leaves a switched-off key out of the key pool entirely', async () => {
    // A key switched off on its row must not be asked for anything, let alone
    // sign anything: it is out of the pool the request path resolves.
    writeKeyIndex({
      version: 1,
      providers: { aliyun: [{ ref: 'ALIYUN_KEY' }, { ref: 'SPARE', disabled: true }] },
    }, indexFile())
    const credentials = credentialStore({ ALIYUN_KEY: 'sk-openai', SPARE: 'sk-spare' })
    const requests: Array<{ url: string; headers: Headers }> = []
    const originalFetch = globalThis.fetch
    globalThis.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      requests.push({ url: String(input), headers: new Headers(init?.headers) })
      return new Response(JSON.stringify({ data: [{ id: 'qwen-model' }] }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      })
    }) as unknown as typeof globalThis.fetch
    const settings = fakeSettings({ aliyun: profile })
    const { ctx, dispose } = fakeHost(settings, { credentials })
    try {
      const { apply } = await import('../src/index.js')
      apply(ctx, { autofill: false })
      await globalThis.fetch('https://gw.example.com/v1/models', {
        headers: { authorization: 'Bearer sk-openai' },
      })
      // Only the enabled key was resolved and asked; the paused one stayed home.
      expect(requests).toHaveLength(1)
      expect(requests[0]?.headers.get('authorization')).toBe('Bearer sk-openai')
    } finally {
      dispose()
      globalThis.fetch = originalFetch
    }
  })

  it('lists the reference in use when the index is still empty', async () => {
    const credentials = credentialStore({ ALIYUN_KEY: 'sk-secret' })
    const { handler } = await mounted({ aliyun: profile }, credentials)

    const { res, headers, out } = fakeRes()
    await handler(fakeReq(), res)

    const reply = out()
    expect(reply.status).toBe(200)
    expect(headers['cache-control']).toBe('no-store')
    expect(reply.body['route']).toBe('aliyun')
    expect(reply.body).not.toHaveProperty('addedRef')
    // The value can be read, so the row carries its display form as well.
    expect(reply.body['entries']).toEqual([
      { ref: 'ALIYUN_KEY', enabled: true, configured: true, masked: maskKeyValue('sk-secret') },
    ])
    // Showing the list is a read: it must not create the index file at all.
    expect(existsSync(indexFile())).toBe(false)
  })

  it('lists stored keys in order, with their labels', async () => {
    writeKeyIndex(
      { version: 1, providers: { aliyun: [{ ref: 'ALIYUN_KEY_2', alias: 'spare' }, { ref: 'ALIYUN_KEY' }] } },
      indexFile(),
    )
    const credentials = credentialStore({ ALIYUN_KEY: 'sk-secret' })
    const { handler } = await mounted({ aliyun: profile }, credentials)

    const { res, out } = fakeRes()
    await handler(fakeReq(), res)

    // Preference order is list order: ALIYUN_KEY_2 is listed first, so a model
    // both keys serve is signed with it first.
    expect(out().body['entries']).toEqual([
      { ref: 'ALIYUN_KEY_2', enabled: true, configured: false, alias: 'spare' },
      { ref: 'ALIYUN_KEY', enabled: true, configured: true, masked: maskKeyValue('sk-secret') },
    ])
  })

  it('merges a reference the index does not know into the list', async () => {
    writeKeyIndex({ version: 1, providers: { aliyun: [{ ref: 'ALIYUN_KEY_2' }] } }, indexFile())
    const { handler } = await mounted({ aliyun: profile }, credentialStore({ ALIYUN_KEY: 'sk-secret' }))

    const { res, out } = fakeRes()
    await handler(fakeReq(), res)

    const entries = out().body['entries'] as Array<Record<string, unknown>>
    expect(entries.map(row => row.ref)).toEqual(['ALIYUN_KEY_2', 'ALIYUN_KEY'])
    // The seat (ALIYUN_KEY) is appended last; being unlisted, it reads as in use.
    expect(entries[1]).toMatchObject({ enabled: true, configured: true, masked: maskKeyValue('sk-secret') })
    // The store says nothing is held for ALIYUN_KEY_2, so it reads as unset.
    expect(entries[0]).toMatchObject({ configured: false })
  })

  it('leaves a seat the store holds nothing under off the list', async () => {
    // A shipped patch can write `apiKeyEnv` for a key nobody has stored yet, and
    // the official card already warns that the variable is missing. Painting that
    // name as a second, "not stored" row invented a key beside that warning.
    writeKeyIndex({ version: 1, providers: { aliyun: [{ ref: 'ALIYUN_KEY_2' }] } }, indexFile())
    const { handler } = await mounted({ aliyun: profile }, credentialStore({ ALIYUN_KEY_2: 'sk-real' }))

    const { res, out } = fakeRes()
    await handler(fakeReq(), res)

    expect(out().status).toBe(200)
    expect((out().body['entries'] as Array<{ ref: string }>).map(row => row.ref)).toEqual(['ALIYUN_KEY_2'])
  })

  it('keeps an unlistable seat on the list when the store cannot answer for it', async () => {
    // Unknown is not "empty": a store that fails to read must not make the row
    // disappear, or a transient outage would look like a deleted key.
    const credentials = credentialStore({ ALIYUN_KEY: 'sk-secret' })
    credentials.resolve = async () => { throw new Error('unavailable') }
    const { handler } = await mounted({ aliyun: profile }, credentials)

    const { res, out } = fakeRes()
    await handler(fakeReq(), res)

    const entries = out().body['entries'] as Array<Record<string, unknown>>
    expect(entries.map(row => row.ref)).toEqual(['ALIYUN_KEY'])
    expect(entries[0]).toMatchObject({ enabled: true, configured: null })
  })

  it('previews a held value as its masked display form, and shows nothing for a ref it cannot read', async () => {
    writeKeyIndex(
      { version: 1, providers: { aliyun: [{ ref: 'ALIYUN_KEY_2' }, { ref: 'ALIYUN_KEY_3' }] } },
      indexFile(),
    )
    // One long value (head and tail), one too short to trim (flat mask), and one
    // the store holds nothing for (no preview at all).
    const credentials = credentialStore({ ALIYUN_KEY: 'sk-live-secret-value', ALIYUN_KEY_3: 'sk-short' })
    const { handler } = await mounted({ aliyun: profile }, credentials)

    const { res, out } = fakeRes()
    await handler(fakeReq(), res)

    const entries = out().body['entries'] as Array<Record<string, unknown>>
    expect(entries).toEqual([
      { ref: 'ALIYUN_KEY_2', enabled: true, configured: false },
      { ref: 'ALIYUN_KEY_3', enabled: true, configured: true, masked: '••••••••' },
      { ref: 'ALIYUN_KEY', enabled: true, configured: true, masked: 'sk-l...alue' },
    ])
    // A row with no readable value carries no preview key at all, rather than an
    // empty one the panel would render as a mask.
    expect(entries[0]).not.toHaveProperty('masked')
  })

  it('limits legacy manual selections to the models the provider has added', async () => {
    // A scope may name models the provider has since dropped from its list: the
    // payload shows only the assignment inside today's universe, while the
    // stored assignment itself is never rewritten.
    writeKeyIndex({ version: 1, providers: { aliyun: [{
      ref: 'ALIYUN_KEY', models: ['chosen', 'legacy-unadded'],
    }] } }, indexFile())
    const { handler } = await mounted({ aliyun: { ...profile, models: [{ id: 'chosen' }] } }, credentialStore({ ALIYUN_KEY: 'fake-key' }))
    const answer = fakeRes()
    await handler(fakeReq(), answer.res)
    expect(answer.out().body['entries']).toEqual([
      expect.objectContaining({ models: ['chosen'] }),
    ])
    expect(readKeyIndex(indexFile()).providers['aliyun']?.[0]?.models).toEqual(['chosen', 'legacy-unadded'])
  })

  it('reads credential previews concurrently instead of adding one delay per key', async () => {
    const refs = ['ALIYUN_KEY', ...Array.from({ length: 11 }, (_, index) => 'SPARE_' + index)]
    writeKeyIndex({ version: 1, providers: { aliyun: refs.map(ref => ({ ref })) } }, indexFile())
    const resolve = vi.fn(async () => await new Promise<{ value: string }>(done => setTimeout(() => done({ value: 'fake-preview-value' }), 50)))
    const describe = vi.fn(async (asked: string[]) => await new Promise<unknown>(done => setTimeout(() => done(Object.fromEntries(asked.map(ref => [ref, { configured: true }]))), 50)))
    const { handler } = await mounted({ aliyun: profile }, { resolve, describe })
    vi.useFakeTimers()
    try {
      const answer = fakeRes()
      const pending = handler(fakeReq(), answer.res)
      expect(resolve).toHaveBeenCalledTimes(refs.length)
      expect(describe).toHaveBeenCalledTimes(1)
      await vi.advanceTimersByTimeAsync(50)
      await pending
      expect(answer.out().status).toBe(200)
      expect(answer.out().body['entries']).toHaveLength(refs.length)
      expect(answer.out().body['entries']).toEqual(refs.map(ref => ({
        ref, enabled: true, configured: true, masked: maskKeyValue('fake-preview-value'),
      })))
    } finally {
      vi.useRealTimers()
    }
  })

  it('returns the list at its display deadline even when a store read never settles', async () => {
    writeKeyIndex({ version: 1, providers: { aliyun: [{ ref: 'ALIYUN_KEY' }, { ref: 'STALLED' }] } }, indexFile())
    const { handler } = await mounted({ aliyun: profile }, {
      async resolve(ref) { return ref === 'STALLED' ? await new Promise<undefined>(() => {}) : { value: 'fake-readable' } },
      async describe() { return await new Promise<unknown>(() => {}) },
    })
    vi.useFakeTimers()
    try {
      const answer = fakeRes()
      const pending = handler(fakeReq(), answer.res)
      await vi.advanceTimersByTimeAsync(250)
      await pending
      expect(answer.out().status).toBe(200)
      expect(answer.out().body['entries']).toEqual([
        { ref: 'ALIYUN_KEY', enabled: true, configured: true, masked: maskKeyValue('fake-readable') },
        { ref: 'STALLED', enabled: true, configured: null },
      ])
    } finally {
      vi.useRealTimers()
    }
  })

  it('releases a committed mutation before waiting for display-only credential previews', async () => {
    writeKeyIndex({ version: 1, providers: { aliyun: [{ ref: 'ALIYUN_KEY' }] } }, indexFile())
    const { handler } = await mounted({ aliyun: profile }, { async resolve() { return await new Promise<undefined>(() => {}) } })
    vi.useFakeTimers()
    try {
      const first = fakeRes()
      const firstPending = handler(fakeReq({ method: 'POST', body: { op: 'rename', ref: 'ALIYUN_KEY', alias: 'first' } }), first.res)
      await vi.advanceTimersByTimeAsync(0)
      expect(readKeyIndex(indexFile()).providers['aliyun']?.[0]?.alias).toBe('first')
      const second = fakeRes()
      const secondPending = handler(fakeReq({ method: 'POST', body: { op: 'rename', ref: 'ALIYUN_KEY', alias: 'second' } }), second.res)
      await vi.advanceTimersByTimeAsync(0)
      expect(readKeyIndex(indexFile()).providers['aliyun']?.[0]?.alias).toBe('second')
      expect(first.out().status).toBe(0)
      await vi.advanceTimersByTimeAsync(250)
      await Promise.all([firstPending, secondPending])
      expect(first.out().status).toBe(200)
      expect(second.out().status).toBe(200)
    } finally {
      vi.useRealTimers()
    }
  })

  it('reports a route the settings do not name', async () => {
    const { handler } = await mounted({ aliyun: profile })

    const { res, headers, out } = fakeRes()
    await handler(fakeReq({ url: '?route=nope' }), res)

    expect(out().status).toBe(400)
    expect(String(out().body['error'])).toContain('no llm-pi-ai provider route "nope"')
    expect(headers['cache-control']).toBe('no-store')
  })

  it('reports a missing route parameter', async () => {
    const { handler } = await mounted({ aliyun: profile })

    const { res, out } = fakeRes()
    await handler(fakeReq({ url: '' }), res)

    expect(out().status).toBe(400)
    expect(String(out().body['error'])).toContain('no llm-pi-ai provider route ""')
  })

  it('refuses a cross-site caller before it reads the settings', async () => {
    const { handler, settings } = await mounted({ aliyun: profile }, credentialStore({ ALIYUN_KEY: 'sk-secret' }))
    const reads = settings.describeCalls()

    const { res, headers, out } = fakeRes()
    await handler(fakeReq({ headers: { host: '10.0.0.5:3080', 'sec-fetch-site': 'cross-site' } }), res)

    expect(out().status).toBe(403)
    expect(out().body['error']).toBe('forbidden')
    expect(settings.describeCalls()).toBe(reads)
    expect(headers['cache-control']).toBe('no-store')
  })

  it('answers a method that is neither GET nor POST with 405', async () => {
    const { handler } = await mounted({ aliyun: profile })

    const { res, out } = fakeRes()
    await handler(fakeReq({ method: 'DELETE' }), res)

    expect(out().status).toBe(405)
    expect(out().body['error']).toBe('method not allowed')
  })

  it('stores a new key, labels it and leaves the one in use alone', async () => {
    const credentials = credentialStore({ ALIYUN_KEY: 'sk-secret' })
    const { handler } = await mounted({ aliyun: profile }, credentials)

    const { res, out } = fakeRes()
    await handler(fakeReq({ method: 'POST', body: { op: 'add', value: 'sk-spare', alias: 'spare' } }), res)

    const reply = out()
    expect(reply.status).toBe(200)
    expect(reply.body['addedRef']).toBe('ALIYUN_API_KEY')
    expect(credentials.values['ALIYUN_API_KEY']).toBe('sk-spare')
    expect(readKeyIndex(indexFile()).providers['aliyun']).toEqual([{ ref: 'ALIYUN_API_KEY', alias: 'spare' }])
    // The new key is listed first, so a model both keys serve is signed with it
    // first; the older seat is appended behind it.
    expect(reply.body['entries']).toEqual([
      { ref: 'ALIYUN_API_KEY', enabled: true, configured: true, alias: 'spare', masked: maskKeyValue('sk-spare') },
      { ref: 'ALIYUN_KEY', enabled: true, configured: true, masked: maskKeyValue('sk-secret') },
    ])
  })

  it('takes the seat when the profile names a reference nothing was stored under', async () => {
    // The exact shape a shipped patch leaves behind: `apiKeyEnv` already names a
    // reference, the store holds no value for it, and the official card warns
    // "未检测到环境变量". Adding a key must fix that route rather than add a
    // second key beside a name the adapter can never resolve.
    const credentials = credentialStore()
    const { handler, settings } = await mounted({ aliyun: profile }, credentials)

    const { res, out } = fakeRes()
    await handler(fakeReq({ method: 'POST', body: { op: 'add', value: 'sk-first' } }), res)

    const reply = out()
    expect(reply.status).toBe(200)
    expect(reply.body['addedRef']).toBe('ALIYUN_API_KEY')
    expect(settings.providers()?.['aliyun']).toHaveProperty('apiKeyEnv', 'ALIYUN_API_KEY')
    // One row, and it is the key that was just stored — the empty name is gone.
    expect(reply.body['entries']).toEqual([
      { ref: 'ALIYUN_API_KEY', enabled: true, configured: true, masked: maskKeyValue('sk-first') },
    ])
  })

  it('leaves a seat alone when the store cannot say whether it holds a value', async () => {
    // An unreadable store is unknown, not empty. Re-pointing a key that may well
    // be working would be worse than leaving the list as it is.
    const credentials = credentialStore({ ALIYUN_KEY: 'sk-live' })
    credentials.resolve = async () => { throw new Error('unavailable') }
    credentials.describe = async () => ({ ok: false, error: 'unavailable' })
    const { handler, settings } = await mounted({ aliyun: profile }, credentials)

    const { res, out } = fakeRes()
    await handler(fakeReq({ method: 'POST', body: { op: 'add', value: 'sk-second' } }), res)

    expect(out().status).toBe(502)
    expect(settings.mutations).toHaveLength(0)
    expect(credentials.values).toEqual({ ALIYUN_KEY: 'sk-live' })
  })

  it('reuses a listed reference that already holds the same secret instead of adding a twin', async () => {
    // The create-provider card is the ordinary way into this: the official form
    // stores its key under the profile's own `apiKeyEnv`, and the profile can
    // name a reference NOTHING holds (`MAGPIE_GATEWAY_KEY` from a shipped
    // patch). The drain then adds the very same secret. Without looking for a
    // reference that already holds that value, the add minted a second name and
    // the panel showed two rows with an identical mask — two keys, one secret.
    writeKeyIndex({ version: 1, providers: { aliyun: [{ ref: 'ALIYUN_API_KEY' }] } }, indexFile())
    const credentials = credentialStore({ ALIYUN_KEY: 'sk-other', ALIYUN_API_KEY: 'sk-same' })
    const set = vi.spyOn(credentials, 'set')
    const { handler } = await mounted({ aliyun: profile }, credentials)

    const { res, out } = fakeRes()
    await handler(fakeReq({ method: 'POST', body: { op: 'add', value: 'sk-same' } }), res)

    expect(out().status).toBe(200)
    // The secret is reported under the reference that already held it…
    expect(out().body['addedRef']).toBe('ALIYUN_API_KEY')
    // …no second copy was stored anywhere…
    expect(set).not.toHaveBeenCalled()
    expect(credentials.values).toEqual({ ALIYUN_KEY: 'sk-other', ALIYUN_API_KEY: 'sk-same' })
    // …and the list still names exactly one row per distinct secret.
    const entries = out().body['entries'] as Array<{ ref: string }>
    expect(entries.map(entry => entry.ref)).toEqual(['ALIYUN_API_KEY', 'ALIYUN_KEY'])
  })

  it('fills a listed reference the store holds nothing under instead of minting the next name', async () => {
    // What a second computer sees after a profile sync: the profile names a
    // reference, the local index still lists that row (labels and scopes never
    // travel), and this store has nothing under it. Re-filling through "add
    // another key" must write into that row — minting `_3` beside the empty
    // `_2` renamed the route's key here while the synced row stayed "not
    // stored", and the two computers drifted apart on every refill.
    writeKeyIndex(
      { version: 1, providers: { aliyun: [{ ref: 'ALIYUN_API_KEY', alias: 'deepseek' }] } },
      indexFile(),
    )
    const credentials = credentialStore()
    const set = vi.spyOn(credentials, 'set')
    const { handler, settings } = await mounted({ aliyun: profile }, credentials)

    const { res, out } = fakeRes()
    await handler(fakeReq({ method: 'POST', body: { op: 'add', value: 'sk-first' } }), res)

    const reply = out()
    expect(reply.status).toBe(200)
    // The name the index already lists is the one that receives the value…
    expect(reply.body['addedRef']).toBe('ALIYUN_API_KEY')
    expect(set).toHaveBeenCalledTimes(1)
    expect(set).toHaveBeenCalledWith('ALIYUN_API_KEY', 'sk-first')
    expect(credentials.values).toEqual({ ALIYUN_API_KEY: 'sk-first' })
    // …its label rides along (an add without an alias never clears one)…
    expect(readKeyIndex(indexFile()).providers['aliyun']).toEqual([{ ref: 'ALIYUN_API_KEY', alias: 'deepseek' }])
    // …and the empty seat hands over, so the official card stops warning.
    expect(settings.providers()?.['aliyun']).toHaveProperty('apiKeyEnv', 'ALIYUN_API_KEY')
    expect(reply.body['entries']).toEqual([
      { ref: 'ALIYUN_API_KEY', enabled: true, configured: true, alias: 'deepseek', masked: maskKeyValue('sk-first') },
    ])
  })

  it('fills the seat itself when the index already lists it empty', async () => {
    // The seat is the reference the adapter resolves, so writing there needs no
    // settings write at all — one write, no re-point, nothing to roll back.
    writeKeyIndex({ version: 1, providers: { aliyun: [{ ref: 'ALIYUN_KEY' }] } }, indexFile())
    const credentials = credentialStore()
    const { handler, settings } = await mounted({ aliyun: profile }, credentials)

    const { res, out } = fakeRes()
    await handler(fakeReq({ method: 'POST', body: { op: 'add', value: 'sk-seat' } }), res)

    expect(out().status).toBe(200)
    expect(out().body['addedRef']).toBe('ALIYUN_KEY')
    expect(credentials.values).toEqual({ ALIYUN_KEY: 'sk-seat' })
    expect(settings.mutations).toHaveLength(0)
  })

  it('never fills a listed row from a store that cannot answer', async () => {
    // The empty-slot path is the only one that writes under a name the index
    // already carries, so it is the one that could overwrite a key it never
    // saw. An unreadable store is unknown, not empty: no write, no re-point.
    writeKeyIndex({ version: 1, providers: { aliyun: [{ ref: 'ALIYUN_API_KEY' }] } }, indexFile())
    const credentials = credentialStore({ ALIYUN_API_KEY: 'sk-live' })
    credentials.resolve = async () => { throw new Error('unavailable') }
    credentials.describe = async () => ({ ok: false, error: 'unavailable' })
    const set = vi.spyOn(credentials, 'set')
    const { handler, settings } = await mounted({ aliyun: profile }, credentials)

    const { res, out } = fakeRes()
    await handler(fakeReq({ method: 'POST', body: { op: 'add', value: 'sk-new' } }), res)

    expect(out().status).toBe(502)
    expect(set).not.toHaveBeenCalled()
    expect(credentials.values).toEqual({ ALIYUN_API_KEY: 'sk-live' })
    expect(settings.mutations).toHaveLength(0)
  })

  it('adds a genuinely new secret even when another reference holds a different one', async () => {
    // The reuse check must not swallow a real second key: only an exact value
    // match is the same key.
    writeKeyIndex({ version: 1, providers: { aliyun: [{ ref: 'ALIYUN_API_KEY' }] } }, indexFile())
    const credentials = credentialStore({ ALIYUN_KEY: 'sk-first', ALIYUN_API_KEY: 'sk-first' })
    const { handler } = await mounted({ aliyun: profile }, credentials)

    const { res, out } = fakeRes()
    await handler(fakeReq({ method: 'POST', body: { op: 'add', value: 'sk-second' } }), res)

    expect(out().status).toBe(200)
    expect(out().body['addedRef']).toBe('ALIYUN_API_KEY_2')
    expect(credentials.values['ALIYUN_API_KEY_2']).toBe('sk-second')
  })

  it('does not add a twin when the same create is drained twice', async () => {
    // The create card's ledger can pass the same draft through `add` more than
    // once (a re-staged pane, a retried pass). Before the value check, the
    // second pass saw the seat as empty and minted a fresh name, so the panel
    // showed two rows with the same mask. The second pass must recognise the
    // secret it already stored.
    writeKeyIndex({ version: 1, providers: {} }, indexFile())
    const credentials = credentialStore()
    const set = vi.spyOn(credentials, 'set')
    const { handler } = await mounted(
      { aliyun: { api: 'openai-completions', baseURL: 'https://gw.example.com/v1', apiKeyEnv: 'ALIYUN_GATEWAY_KEY', models: [] } },
      credentials,
    )

    for (let pass = 0; pass < 2; pass += 1) {
      const answer = fakeRes()
      await handler(fakeReq({ method: 'POST', body: { op: 'add', value: 'sk-once', alias: 'first' } }), answer.res)
      expect(answer.out().status).toBe(200)
      expect(answer.out().body['addedRef']).toBe('ALIYUN_API_KEY')
    }

    // One stored copy, one row, and the empty seat now names the real key.
    expect(set).toHaveBeenCalledTimes(1)
    expect(readKeyIndex(indexFile()).providers['aliyun']).toEqual([{ ref: 'ALIYUN_API_KEY', alias: 'first' }])
    const listing = fakeRes()
    await handler(fakeReq(), listing.res)
    const entries = listing.out().body['entries'] as Array<{ ref: string }>
    expect(entries.map(entry => entry.ref)).toEqual(['ALIYUN_API_KEY'])
  })

  it('adopts the exact key the official form already saved without duplicating its credential', async () => {
    const credentials = credentialStore({ ALIYUN_KEY: 'fake-created' })
    const set = vi.spyOn(credentials, 'set')
    const { handler, settings } = await mounted({ aliyun: profile }, credentials)
    for (const body of [
      { op: 'add', value: 'fake-created', alias: 'first draft' },
      { op: 'protocol', ref: 'ALIYUN_KEY', protocol: 'openai-responses' },
      { op: 'add', value: 'fake-created', alias: 'first draft' },
    ]) {
      const answer = fakeRes()
      await handler(fakeReq({ method: 'POST', body }), answer.res)
      expect(answer.out().status).toBe(200)
      expect(answer.out().body['entries']).toHaveLength(1)
      if (body.op === 'add') expect(answer.out().body['addedRef']).toBe('ALIYUN_KEY')
      else expect(answer.out().body).not.toHaveProperty('addedRef')
    }
    expect(readKeyIndex(indexFile()).providers['aliyun']).toEqual([{
      ref: 'ALIYUN_KEY', alias: 'first draft', protocol: 'openai-responses',
    }])
    expect(set).not.toHaveBeenCalled()
    expect(settings.mutations).toHaveLength(0)
    expect(Object.keys(credentials.values)).toEqual(['ALIYUN_KEY'])
  })

  it('makes the first key on a route that names none the one in use', async () => {
    const credentials = credentialStore()
    const { handler, settings } = await mounted(
      { aliyun: { api: 'openai-completions', baseURL: 'https://gw.example.com/v1', models: [] } },
      credentials,
    )

    const { res, out } = fakeRes()
    await handler(fakeReq({ method: 'POST', body: { op: 'add', value: 'sk-first' } }), res)

    expect(out().status).toBe(200)
    const entries = out().body['entries'] as Array<{ ref: string; enabled: boolean }>
    expect(entries[0]).toMatchObject({ ref: 'ALIYUN_API_KEY', enabled: true })
    const providers = settings.providers() as Record<string, Record<string, unknown>>
    // The seat is still written on the first key so the adapter has a credential
    // path when only one key exists.
    expect(providers['aliyun']?.['apiKeyEnv']).toBe('ALIYUN_API_KEY')
    expect(settings.mutations).toHaveLength(1)
  })

  it('refuses a key value that is not printable ASCII before writing anything', async () => {
    const credentials = credentialStore()
    const { handler } = await mounted({ aliyun: profile }, credentials)

    const { res, out } = fakeRes()
    await handler(fakeReq({ method: 'POST', body: { op: 'add', value: 'sk with space' } }), res)

    expect(out().status).toBe(400)
    expect(String(out().body['error'])).toContain('printable ASCII')
    expect(Object.keys(credentials.values)).toEqual([])
    expect(existsSync(indexFile())).toBe(false)
  })

  it('surfaces a credential store that refuses the value, and indexes nothing', async () => {
    const credentials: Store = {
      ...credentialStore(),
      set: async () => ({ ok: false, error: 'the store is read-only' }),
    }
    const { handler } = await mounted({ aliyun: profile }, credentials)

    const { res, out } = fakeRes()
    await handler(fakeReq({ method: 'POST', body: { op: 'add', value: 'sk-new' } }), res)

    expect(out().status).toBe(400)
    expect(String(out().body['error'])).toContain('read-only')
    // A reference the index lists but the store cannot hold is unusable, so the
    // index must not have learned about it.
    expect(existsSync(indexFile())).toBe(false)
  })

  it.each([
    ['aliyun', 'aliyun', 'ALIYUN_API_KEY'],
    ['foo-bar', 'foo_bar', 'FOO_BAR_API_KEY'],
  ] as const)('keeps concurrent adds distinct for %s and %s while reads remain independent', async (firstRoute, secondRoute, baseRef) => {
    const credentials = credentialStore()
    const writes: string[] = []
    let writesWhilePending: string[] = []
    let enterFirst!: () => void
    let releaseFirst!: () => void
    const entered = new Promise<void>(resolve => { enterFirst = resolve })
    const gate = new Promise<void>(resolve => { releaseFirst = resolve })
    const originalSet = credentials.set!.bind(credentials)
    credentials.set = async (ref, value) => {
      writes.push(value)
      if (value === 'sk-first') {
        enterFirst()
        await gate
      }
      return originalSet(ref, value)
    }
    const { handler } = await mounted({ [firstRoute]: profile, [secondRoute]: profile }, credentials)
    const first = fakeRes()
    const second = fakeRes()
    const addingFirst = handler(fakeReq({ method: 'POST', url: `?route=${firstRoute}`, body: { op: 'add', value: 'sk-first' } }), first.res)
    await entered
    const addingSecond = handler(fakeReq({ method: 'POST', url: `?route=${secondRoute}`, body: { op: 'add', value: 'sk-second' } }), second.res)
    try {
      // Drain the current turn so both unprotected POSTs can reach set().
      await new Promise<void>(resolve => setImmediate(resolve))
      writesWhilePending = [...writes]
      const listing = fakeRes()
      await handler(fakeReq({ url: `?route=${firstRoute}` }), listing.res)
      expect(listing.out().status).toBe(200)
    } finally {
      releaseFirst()
      await Promise.all([addingFirst, addingSecond])
    }
    expect(first.out().status).toBe(200)
    expect(second.out().status).toBe(200)
    expect(credentials.values[baseRef]).toBe('sk-first')
    expect(credentials.values[`${baseRef}_2`]).toBe('sk-second')
    expect(writesWhilePending).toEqual(['sk-first'])
    const document = readKeyIndex(indexFile())
    if (firstRoute === secondRoute) {
      expect(document.providers[firstRoute]).toEqual([{ ref: baseRef }, { ref: `${baseRef}_2` }])
    } else {
      expect(document.providers[firstRoute]).toEqual([{ ref: baseRef }])
      expect(document.providers[secondRoute]).toEqual([{ ref: `${baseRef}_2` }])
    }
  })

  it('keeps a queued rename after a failed remove rolls metadata back', async () => {
    writeKeyIndex({ version: 1, providers: { aliyun: [{ ref: 'ALIYUN_KEY' }, { ref: 'SPARE', alias: 'old' }] } }, indexFile())
    const credentials = credentialStore({ ALIYUN_KEY: 'original', SPARE: 'spare' })
    let enterUnset!: () => void
    let releaseUnset!: () => void
    const entered = new Promise<void>(resolve => { enterUnset = resolve })
    const gate = new Promise<void>(resolve => { releaseUnset = resolve })
    credentials.unset = async () => {
      enterUnset()
      await gate
      return { ok: false, error: 'read-only' }
    }
    const { handler } = await mounted({ aliyun: profile }, credentials)
    const removed = fakeRes()
    const renamed = fakeRes()
    const removing = handler(fakeReq({ method: 'POST', body: { op: 'remove', ref: 'ALIYUN_KEY' } }), removed.res)
    await entered
    const renaming = handler(fakeReq({ method: 'POST', body: { op: 'rename', ref: 'SPARE', alias: 'new' } }), renamed.res)
    try {
      await new Promise<void>(resolve => setImmediate(resolve))
    } finally {
      releaseUnset()
      await Promise.all([removing, renaming])
    }
    expect(removed.out().status).toBe(500)
    expect(renamed.out().status).toBe(200)
    expect(readKeyIndex(indexFile()).providers['aliyun']).toEqual([{ ref: 'ALIYUN_KEY' }, { ref: 'SPARE', alias: 'new' }])
  })

  it('skips occupied credential references absent from the index', async () => {
    const credentials = credentialStore({ ALIYUN_API_KEY: 'original', ALIYUN_API_KEY_2: 'second' })
    const { handler } = await mounted({ aliyun: profile }, credentials)
    const { res, out } = fakeRes()
    await handler(fakeReq({ method: 'POST', body: { op: 'add', value: 'sk-third' } }), res)
    expect(out().status).toBe(200)
    expect(credentials.values).toEqual({ ALIYUN_API_KEY: 'original', ALIYUN_API_KEY_2: 'second', ALIYUN_API_KEY_3: 'sk-third' })
  })

  it('fails closed on malformed index reads before changing credentials', async () => {
    writeKeyIndex({ version: 1, providers: {} }, indexFile())
    writeFileSync(indexFile(), '{ broken', 'utf8')
    const credentials = credentialStore({ ALIYUN_API_KEY: 'original' })
    const set = vi.spyOn(credentials, 'set')
    const { handler } = await mounted({ aliyun: profile }, credentials)
    for (const request of [fakeReq(), fakeReq({ method: 'POST', body: { op: 'add', value: 'sk-new' } })]) {
      const { res, out } = fakeRes()
      await handler(request, res)
      expect(out().status).toBe(500)
    }
    expect(set).not.toHaveBeenCalled()
    expect(readFileSync(indexFile(), 'utf8')).toBe('{ broken')
    expect(credentials.values['ALIYUN_API_KEY']).toBe('original')
  })

  it('keeps failed credential reads unknown and refuses to add or remove', async () => {
    const credentials = credentialStore({ ALIYUN_KEY: 'original' })
    credentials.resolve = async () => ({ ok: false, error: 'unavailable' }) as unknown as { value: string }
    const set = vi.spyOn(credentials, 'set')
    const unset = vi.spyOn(credentials, 'unset')
    const { handler, settings } = await mounted({ aliyun: profile }, credentials)
    const listing = fakeRes()
    await handler(fakeReq(), listing.res)
    expect(listing.out().body['entries']).toEqual([{ ref: 'ALIYUN_KEY', enabled: true, configured: null }])
    for (const body of [{ op: 'add', value: 'sk-new' }, { op: 'remove', ref: 'ALIYUN_KEY' }]) {
      const { res, out } = fakeRes()
      await handler(fakeReq({ method: 'POST', body }), res)
      expect(out().status).toBe(502)
    }
    expect(set).not.toHaveBeenCalled()
    expect(unset).not.toHaveBeenCalled()
    expect(settings.mutations).toHaveLength(0)
  })

  it('reports settings outages rather than a nonexistent route', async () => {
    const { handler, settings, emitUpdated } = await mounted({ aliyun: profile }, credentialStore())
    settings.describe = () => { throw new Error('unavailable') }
    // A list read renders the profile from the section the guard and probe
    // routes cache -- the page repaints this list once per card per second, and
    // a fresh describe per repaint is what put an opened card behind seconds of
    // queued settings reads. That cache is dropped on every document update,
    // which is the one moment a read has to reach the service; an outage there
    // must still be reported as an outage, never as "this provider is gone".
    emitUpdated('llm-pi-ai')
    const { res, out } = fakeRes()
    await handler(fakeReq(), res)
    expect(out().status).toBe(502)
  })

  it('answers a list read from the cached section instead of describing again', async () => {
    const { handler, settings } = await mounted({ aliyun: profile }, credentialStore({ ALIYUN_KEY: 'sk-one' }))
    const describe = vi.spyOn(settings, 'describe')
    // The page hydrates one card per second; each of those reads used to call
    // `describe()`, a call the settings service serialises across the host.
    for (let round = 0; round < 5; round += 1) {
      const { res, out } = fakeRes()
      await handler(fakeReq(), res)
      expect(out().status).toBe(200)
    }
    expect(describe).not.toHaveBeenCalled()
  })

  it('answers the address pair without reading settings or any key value', async () => {
    writeKeyIndex({
      version: 1,
      providers: { aliyun: [{ ref: 'ALIYUN_KEY' }] },
      endpoints: { aliyun: { openai: 'https://openai.example.com/v1', anthropic: 'https://anthropic.example.com' } },
    }, indexFile())
    const credentials = credentialStore({ ALIYUN_KEY: 'sk-secret' })
    const resolve = vi.spyOn(credentials, 'resolve')
    const { handler, settings } = await mounted({ aliyun: profile }, credentials)
    const describe = vi.spyOn(settings, 'describe')
    const { res, out } = fakeRes()
    await handler(fakeReq({ url: '?route=aliyun&op=endpoints' }), res)
    expect(out().status).toBe(200)
    expect(out().body['endpoints']).toEqual({
      openai: 'https://openai.example.com/v1',
      anthropic: 'https://anthropic.example.com',
    })
    // This is the hydration the page repeats for every visible card; it must
    // stay a file read, not a settings read plus one credential resolve a key.
    expect(describe).not.toHaveBeenCalled()
    expect(resolve).not.toHaveBeenCalled()
  })

  it('rolls back a new key when activating the first key fails', async () => {
    const credentials = credentialStore()
    const { handler, settings } = await mounted({ aliyun: { ...profile, apiKeyEnv: undefined } }, credentials)
    settings.failNextMutation(2)
    const { res, out } = fakeRes()
    await handler(fakeReq({ method: 'POST', body: { op: 'add', value: 'sk-new' } }), res)
    expect(out().status).toBe(500)
    expect(credentials.values).toEqual({})
    expect(readKeyIndex(indexFile()).providers['aliyun']).toBeUndefined()
    expect(settings.providers()?.['aliyun']).not.toHaveProperty('apiKeyEnv', 'ALIYUN_API_KEY')
  })

  it('removes a newly stored secret when its index write fails', async () => {
    const credentials = credentialStore()
    const { handler } = await mounted({ aliyun: profile }, credentials)
    vi.spyOn(keyIndex, 'updateKeyIndex').mockImplementationOnce(() => { throw new Error('disk full') })
    const { res, out } = fakeRes()
    await handler(fakeReq({ method: 'POST', body: { op: 'add', value: 'sk-new' } }), res)
    expect(out().status).toBe(500)
    expect(credentials.values).toEqual({})
    expect(existsSync(indexFile())).toBe(false)
  })

  it('restores the active key and ordered metadata when unset fails', async () => {
    const document = {
      version: 1 as const,
      providers: { aliyun: [{ ref: 'ALIYUN_KEY', alias: 'main' }, { ref: 'SPARE' }] },
      endpoints: { aliyun: { openai: 'https://openai.example/v1', anthropic: 'https://anthropic.example/v1' } },
    }
    writeKeyIndex(document, indexFile())
    const credentials = credentialStore({ ALIYUN_KEY: 'original', SPARE: 'spare' })
    credentials.unset = async () => ({ ok: false, error: 'read-only' })
    const { handler, settings } = await mounted({ aliyun: profile }, credentials)
    const { res, out } = fakeRes()
    await handler(fakeReq({ method: 'POST', body: { op: 'remove', ref: 'ALIYUN_KEY' } }), res)
    expect(out().status).toBe(500)
    expect(readKeyIndex(indexFile())).toEqual(document)
    expect(settings.providers()?.['aliyun']).toHaveProperty('apiKeyEnv', 'ALIYUN_KEY')
    expect(credentials.values['ALIYUN_KEY']).toBe('original')
  })

  it('restores the active key without deleting its value when index removal fails', async () => {
    const document = { version: 1 as const, providers: { aliyun: [{ ref: 'ALIYUN_KEY' }, { ref: 'SPARE' }] } }
    writeKeyIndex(document, indexFile())
    const credentials = credentialStore({ ALIYUN_KEY: 'original', SPARE: 'spare' })
    const unset = vi.spyOn(credentials, 'unset')
    const { handler, settings } = await mounted({ aliyun: profile }, credentials)
    vi.spyOn(keyIndex, 'updateKeyIndex').mockImplementationOnce(() => { throw new Error('disk full') })
    const { res, out } = fakeRes()
    await handler(fakeReq({ method: 'POST', body: { op: 'remove', ref: 'ALIYUN_KEY' } }), res)
    expect(out().status).toBe(500)
    expect(unset).not.toHaveBeenCalled()
    expect(readKeyIndex(indexFile())).toEqual(document)
    expect(settings.providers()?.['aliyun']).toHaveProperty('apiKeyEnv', 'ALIYUN_KEY')
  })

  it('mints a free name rather than reusing a listed row that holds a value', async () => {
    // A listed row is only a slot to fill when the store positively holds
    // nothing under it. Both rows here hold a different key, so the new secret
    // needs a name of its own — and the minted name still skips theirs.
    writeKeyIndex(
      { version: 1, providers: { aliyun: [{ ref: 'ALIYUN_API_KEY' }, { ref: 'ALIYUN_API_KEY_2' }] } },
      indexFile(),
    )
    const credentials = credentialStore({ ALIYUN_KEY: 'a', ALIYUN_API_KEY: 'sk-one', ALIYUN_API_KEY_2: 'sk-two' })
    const { handler } = await mounted({ aliyun: profile }, credentials)

    const { res, out } = fakeRes()
    await handler(fakeReq({ method: 'POST', body: { op: 'add', value: 'sk-third' } }), res)

    expect(out().status).toBe(200)
    expect(credentials.values['ALIYUN_API_KEY_3']).toBe('sk-third')
    // Neither stored key was touched.
    expect(credentials.values['ALIYUN_API_KEY']).toBe('sk-one')
    expect(credentials.values['ALIYUN_API_KEY_2']).toBe('sk-two')
  })

  it('records a model scope for a listed key without moving it in the list', async () => {
    writeKeyIndex({ version: 1, providers: { aliyun: [{ ref: 'ALIYUN_KEY' }, { ref: 'ALIYUN_KEY_2' }] } }, indexFile())
    const credentials = credentialStore({ ALIYUN_KEY: 'a', ALIYUN_KEY_2: 'b' })
    const { handler, settings } = await mounted({ aliyun: { ...profile, models: [{"id":"glm-4"},{"id":"glm-4-air"}] } }, credentials)

    const { res, out } = fakeRes()
    await handler(fakeReq({ method: 'POST', body: { op: 'scope', ref: 'ALIYUN_KEY', models: ['glm-4', 'glm-4-air'] } }), res)

    expect(out().status).toBe(200)
    expect(readKeyIndex(indexFile()).providers['aliyun']).toEqual([
      { ref: 'ALIYUN_KEY', models: ['glm-4', 'glm-4-air'] },
      { ref: 'ALIYUN_KEY_2' },
    ])
    const entries = out().body['entries'] as Array<Record<string, unknown>>
    expect(entries[0]).toMatchObject({ ref: 'ALIYUN_KEY', enabled: true, models: ['glm-4', 'glm-4-air'] })
    // Scoping is index metadata, not a settings write.
    expect(settings.mutations).toHaveLength(0)
  })

  it('clears a stored scope when given no models, and trims duplicates', async () => {
    writeKeyIndex(
      { version: 1, providers: { aliyun: [{ ref: 'ALIYUN_KEY', models: ['glm-4'] }, { ref: 'ALIYUN_KEY_2' }] } },
      indexFile(),
    )
    const credentials = credentialStore({ ALIYUN_KEY: 'a' })
    const { handler } = await mounted({ aliyun: { ...profile, models: [{"id":"glm-4"},{"id":"glm-4-flash"}] } }, credentials)

    const scoped = fakeRes()
    await handler(
      fakeReq({ method: 'POST', body: { op: 'scope', ref: 'ALIYUN_KEY', models: [' glm-4 ', 'glm-4', '', 'glm-4-flash'] } }),
      scoped.res,
    )
    expect(scoped.out().status).toBe(200)
    expect(readKeyIndex(indexFile()).providers['aliyun']?.[0]).toEqual({ ref: 'ALIYUN_KEY', models: ['glm-4', 'glm-4-flash'] })

    const cleared = fakeRes()
    await handler(fakeReq({ method: 'POST', body: { op: 'scope', ref: 'ALIYUN_KEY' } }), cleared.res)
    expect(cleared.out().status).toBe(200)
    expect(readKeyIndex(indexFile()).providers['aliyun']?.[0]).toEqual({ ref: 'ALIYUN_KEY' })
  })

  it('refuses unadded models without changing manual assignments', async () => {
    const document = { version: 1 as const, providers: { aliyun: [{
      ref: 'ALIYUN_KEY', models: ['chosen'],
    }] } }
    writeKeyIndex(document, indexFile())
    const { handler } = await mounted({ aliyun: { ...profile, models: [{ id: 'chosen' }] } }, credentialStore({ ALIYUN_KEY: 'fake-key' }))
    const answer = fakeRes()
    await handler(fakeReq({ method: 'POST', body: { op: 'scope', ref: 'ALIYUN_KEY', models: ['unadded'] } }), answer.res)
    expect(answer.out().status).toBe(400)
    expect(String(answer.out().body['error'])).toContain('already added')
    expect(readKeyIndex(indexFile())).toEqual(document)
  })

  it.each([
    [{ op: 'scope', ref: 'ALIYUN_KEY', models: ['chosen'] }, { models: ['chosen'] }],
    [{ op: 'protocol', ref: 'ALIYUN_KEY', protocol: 'openai-responses' }, { protocol: 'openai-responses' }],
  ])('keeps the first metadata edit for an unlisted official seat: %j', async (body, expected) => {
    const { handler } = await mounted({ aliyun: { ...profile, models: [{ id: 'chosen' }] } }, credentialStore({ ALIYUN_KEY: 'fake-key' }))
    const answer = fakeRes()
    await handler(fakeReq({ method: 'POST', body }), answer.res)
    expect(answer.out().status).toBe(200)
    expect(readKeyIndex(indexFile()).providers['aliyun']).toEqual([{ ref: 'ALIYUN_KEY', ...expected }])
  })

  it('commits key metadata and value saves without a single remote request', async () => {
    writeKeyIndex({ version: 1, providers: { aliyun: [{ ref: 'ALIYUN_KEY' }] } }, indexFile())
    const originalFetch = globalThis.fetch
    const fetchMock = vi.fn(async () => { throw new Error('No remote request belongs to a key save') })
    globalThis.fetch = fetchMock as unknown as typeof fetch
    try {
      const { handler, settings } = await mounted({ aliyun: { ...profile, models: [{ id: 'chosen' }] } }, credentialStore({ ALIYUN_KEY: 'fake-key' }))
      for (const body of [
        { op: 'scope', ref: 'ALIYUN_KEY', models: ['chosen'] },
        { op: 'rename', ref: 'ALIYUN_KEY', alias: 'renamed' },
        { op: 'protocol', ref: 'ALIYUN_KEY', protocol: 'openai-responses' },
        { op: 'endpoints', endpoints: { anthropic: 'https://anth.example.com/v1' } },
        { op: 'value', ref: 'ALIYUN_KEY', value: 'fake-replacement' },
      ]) {
        const answer = fakeRes()
        await handler(fakeReq({ method: 'POST', body }), answer.res)
        expect(answer.out().status).toBe(200)
      }
      expect(fetchMock).not.toHaveBeenCalled()
      expect(settings.mutations).toHaveLength(0)
    } finally {
      globalThis.fetch = originalFetch
    }
  })

  it('refuses to scope, rename or remove a key the provider does not list', async () => {
    const { handler, settings } = await mounted({ aliyun: profile }, credentialStore({ ALIYUN_KEY: 'a' }))

    const scoping = fakeRes()
    await handler(fakeReq({ method: 'POST', body: { op: 'scope', ref: 'NOPE_KEY', models: [] } }), scoping.res)
    expect(scoping.out().status).toBe(400)
    expect(String(scoping.out().body['error'])).toContain('not listed for this provider')

    const renaming = fakeRes()
    await handler(fakeReq({ method: 'POST', body: { op: 'rename', ref: 'NOPE_KEY', alias: 'x' } }), renaming.res)
    expect(renaming.out().status).toBe(400)

    const removing = fakeRes()
    await handler(fakeReq({ method: 'POST', body: { op: 'remove', ref: 'NOPE_KEY' } }), removing.res)
    expect(removing.out().status).toBe(400)

    expect(settings.mutations).toHaveLength(0)
    expect(existsSync(indexFile())).toBe(false)
  })

  it('pins a key to a protocol, and clears it back to "any"', async () => {
    writeKeyIndex(
      {
        version: 1,
        providers: { aliyun: [{ ref: 'ALIYUN_KEY' }, { ref: 'ALIYUN_KEY_2' }] },
        endpoints: { aliyun: { anthropic: 'https://anthropic.example' } },
      },
      indexFile(),
    )
    const { handler } = await mounted({ aliyun: profile }, credentialStore({ ALIYUN_KEY: 'a', ALIYUN_KEY_2: 'b' }))

    const pinned = fakeRes()
    await handler(fakeReq({ method: 'POST', body: { op: 'protocol', ref: 'ALIYUN_KEY_2', protocol: 'anthropic-messages' } }), pinned.res)
    expect(pinned.out().status).toBe(200)
    expect(readKeyIndex(indexFile()).providers['aliyun']).toEqual([
      { ref: 'ALIYUN_KEY' },
      { ref: 'ALIYUN_KEY_2', protocol: 'anthropic-messages' },
    ])
    const entries = pinned.out().body['entries'] as Array<Record<string, unknown>>
    expect(entries[1]).toMatchObject({ ref: 'ALIYUN_KEY_2', protocol: 'anthropic-messages' })

    const cleared = fakeRes()
    await handler(fakeReq({ method: 'POST', body: { op: 'protocol', ref: 'ALIYUN_KEY_2' } }), cleared.res)
    expect(cleared.out().status).toBe(200)
    expect(readKeyIndex(indexFile()).providers['aliyun']?.[1]).toEqual({ ref: 'ALIYUN_KEY_2' })
  })

  it('pins a protocol even when the provider has configured no address of that family', async () => {
    // A pin without a family address is the ordinary "same URL, different wire"
    // switch (Responses vs Chat Completions), and the request path already falls
    // back to the provider's own address, so the picker must not be a trap that
    // refuses every choice (user item 3).
    writeKeyIndex({ version: 1, providers: { aliyun: [{ ref: 'ALIYUN_KEY' }] } }, indexFile())
    const { handler } = await mounted({ aliyun: profile }, credentialStore({ ALIYUN_KEY: 'a' }))

    const pinned = fakeRes()
    await handler(
      fakeReq({ method: 'POST', body: { op: 'protocol', ref: 'ALIYUN_KEY', protocol: 'anthropic-messages' } }),
      pinned.res,
    )
    expect(pinned.out().status).toBe(200)
    expect(readKeyIndex(indexFile()).providers['aliyun']).toEqual([
      { ref: 'ALIYUN_KEY', protocol: 'anthropic-messages' },
    ])
  })

  it('pins a protocol once its own family\'s address exists', async () => {
    writeKeyIndex(
      {
        version: 1,
        providers: { aliyun: [{ ref: 'ALIYUN_KEY' }] },
        endpoints: { aliyun: { openai: 'https://openai.example/v1' } },
      },
      indexFile(),
    )
    const { handler } = await mounted({ aliyun: profile }, credentialStore({ ALIYUN_KEY: 'a' }))

    const pinned = fakeRes()
    await handler(
      fakeReq({ method: 'POST', body: { op: 'protocol', ref: 'ALIYUN_KEY', protocol: 'openai-responses' } }),
      pinned.res,
    )
    expect(pinned.out().status).toBe(200)
    expect(readKeyIndex(indexFile()).providers['aliyun']).toEqual([{ ref: 'ALIYUN_KEY', protocol: 'openai-responses' }])
  })

  it('refuses a protocol it cannot dispatch', async () => {
    writeKeyIndex({ version: 1, providers: { aliyun: [{ ref: 'ALIYUN_KEY' }] } }, indexFile())
    const { handler } = await mounted({ aliyun: profile }, credentialStore({ ALIYUN_KEY: 'a' }))

    const { res, out } = fakeRes()
    await handler(fakeReq({ method: 'POST', body: { op: 'protocol', ref: 'ALIYUN_KEY', protocol: 'carrier-pigeon' } }), res)
    expect(out().status).toBe(400)
    expect(String(out().body['error'])).toContain('not supported')
  })

  it('switches a listed key out of use and back in, keeping its metadata', async () => {
    writeKeyIndex(
      { version: 1, providers: { aliyun: [{ ref: 'ALIYUN_KEY', models: ['glm-4'] }, { ref: 'ALIYUN_KEY_2' }] } },
      indexFile(),
    )
    const { handler } = await mounted({ aliyun: profile }, credentialStore({ ALIYUN_KEY: 'a', ALIYUN_KEY_2: 'b' }))

    const off = fakeRes()
    await handler(fakeReq({ method: 'POST', body: { op: 'enable', ref: 'ALIYUN_KEY', enabled: false } }), off.res)
    expect(off.out().status).toBe(200)
    // A pause is not a deletion: the scope stays on the entry, only the mark is
    // added, and the row reads as switched off.
    expect(readKeyIndex(indexFile()).providers['aliyun']).toEqual([
      { ref: 'ALIYUN_KEY', models: ['glm-4'], disabled: true },
      { ref: 'ALIYUN_KEY_2' },
    ])
    const entries = off.out().body['entries'] as Array<Record<string, unknown>>
    expect(entries[0]).toMatchObject({ ref: 'ALIYUN_KEY', enabled: false })
    expect(entries[1]).toMatchObject({ ref: 'ALIYUN_KEY_2', enabled: true })

    const back = fakeRes()
    await handler(fakeReq({ method: 'POST', body: { op: 'enable', ref: 'ALIYUN_KEY', enabled: true } }), back.res)
    expect(back.out().status).toBe(200)
    expect(readKeyIndex(indexFile()).providers['aliyun']?.[0]).toEqual({ ref: 'ALIYUN_KEY', models: ['glm-4'] })
  })

  it('refuses to switch off the last enabled key on a route', async () => {
    // An empty pool would fall back to the adapter's own single-key path, which
    // signs with the very key the user just switched off — so the switch refuses.
    writeKeyIndex(
      { version: 1, providers: { aliyun: [{ ref: 'ALIYUN_KEY' }, { ref: 'ALIYUN_KEY_2', disabled: true }] } },
      indexFile(),
    )
    const { handler } = await mounted({ aliyun: profile }, credentialStore({ ALIYUN_KEY: 'a', ALIYUN_KEY_2: 'b' }))

    const { res, out } = fakeRes()
    await handler(fakeReq({ method: 'POST', body: { op: 'enable', ref: 'ALIYUN_KEY', enabled: false } }), res)
    expect(out().status).toBe(400)
    expect(String(out().body['error'])).toContain('last enabled key')
    expect(readKeyIndex(indexFile()).providers['aliyun']).toEqual([
      { ref: 'ALIYUN_KEY' },
      { ref: 'ALIYUN_KEY_2', disabled: true },
    ])
  })

  it('lets a switch-off stand when the unlisted seat remains as a key', async () => {
    // The profile's own reference is not listed, so it is the pool that remains
    // when the only listed key is switched off.
    writeKeyIndex({ version: 1, providers: { aliyun: [{ ref: 'SPARE' }] } }, indexFile())
    const { handler } = await mounted({ aliyun: profile }, credentialStore({ ALIYUN_KEY: 'a', SPARE: 'b' }))

    const { res, out } = fakeRes()
    await handler(fakeReq({ method: 'POST', body: { op: 'enable', ref: 'SPARE', enabled: false } }), res)
    expect(out().status).toBe(200)
    expect(readKeyIndex(indexFile()).providers['aliyun']).toEqual([{ ref: 'SPARE', disabled: true }])
  })

  it('refuses to switch off the unlisted seat when it is the only key in use', async () => {
    const { handler } = await mounted({ aliyun: profile }, credentialStore({ ALIYUN_KEY: 'a' }))

    const { res, out } = fakeRes()
    await handler(fakeReq({ method: 'POST', body: { op: 'enable', ref: 'ALIYUN_KEY', enabled: false } }), res)
    expect(out().status).toBe(400)
    expect(String(out().body['error'])).toContain('last enabled key')
    // Nothing was written: the seat was never listed, and it stays that way.
    expect(existsSync(indexFile())).toBe(false)
  })

  it('stores the provider\'s base URLs, and reports them in the payload', async () => {
    writeKeyIndex({ version: 1, providers: { aliyun: [{ ref: 'ALIYUN_KEY' }] } }, indexFile())
    const { handler } = await mounted({ aliyun: profile }, credentialStore({ ALIYUN_KEY: 'a' }))

    // A client still carrying a legacy Gemini field has it ignored on the way
    // in: the provider keeps two families now, OpenAI and Anthropic.
    const saved = fakeRes()
    await handler(
      fakeReq({
        method: 'POST',
        body: {
          op: 'endpoints',
          openai: 'https://openai.example/v1',
          anthropic: 'https://anthropic.example',
          gemini: 'https://gemini.example/v1beta',
        },
      }),
      saved.res,
    )
    expect(saved.out().status).toBe(200)
    expect(readKeyIndex(indexFile()).endpoints?.['aliyun']).toEqual({
      openai: 'https://openai.example/v1',
      anthropic: 'https://anthropic.example',
    })
    expect(saved.out().body['endpoints']).toEqual({
      openai: 'https://openai.example/v1',
      anthropic: 'https://anthropic.example',
    })

    // Clearing one side drops only that side.
    const partial = fakeRes()
    await handler(fakeReq({ method: 'POST', body: { op: 'endpoints', openai: '', anthropic: 'https://anthropic.example' } }), partial.res)
    expect(partial.out().status).toBe(200)
    expect(readKeyIndex(indexFile()).endpoints?.['aliyun']).toEqual({ anthropic: 'https://anthropic.example' })
  })

  it('reports a resting key cooldown in the list payload', async () => {
    writeKeyIndex({ version: 1, providers: { aliyun: [{ ref: 'ALIYUN_KEY' }, { ref: 'ALIYUN_KEY_2' }] } }, indexFile())
    const { handler } = await mounted({ aliyun: profile }, credentialStore({ ALIYUN_KEY: 'a', ALIYUN_KEY_2: 'b' }))
    // The wire seam benched the first key: 429 with a 40s Retry-After. The
    // list reads the same memory the routing plan does, so the panel says why
    // a key is not signing.
    const { keyRest, restKeyOf } = await import('../src/key-route-core.js')
    keyRest.reset()
    keyRest.note(restKeyOf('aliyun', 'ALIYUN_KEY'), 'rate', { retryAfterMs: 40_000 })

    const { res, out } = fakeRes()
    await handler(fakeReq(), res)
    const entries = out().body['entries'] as Array<Record<string, unknown>>
    expect(entries[0]?.['rest']).toMatchObject({ kind: 'rate', failures: 1 })
    expect((entries[0]?.['rest'] as { remainingMs: number }).remainingMs).toBeGreaterThan(0)
    // The other key never failed: no rest, the panel paints it healthy.
    expect(entries[1]?.['rest']).toBeUndefined()

    // A cleared (answered) key stops resting: the state the panel shows is the
    // memory's, not a stale note from an earlier failure.
    keyRest.clear(restKeyOf('aliyun', 'ALIYUN_KEY'))
    const after = fakeRes()
    await handler(fakeReq(), after.res)
    const cleared = after.out().body['entries'] as Array<Record<string, unknown>>
    expect(cleared[0]?.['rest']).toBeUndefined()
  })

  it('adds a spare key beside the running one instead of overwriting it', async () => {
    // The profile names the reference the plugin would have minted itself, which
    // is the ordinary case for a card the official page configured: a list made
    // from the index alone hands that very name back, and the new secret lands
    // on top of the key the provider is running on.
    const running = { ...profile, apiKeyEnv: 'ALIYUN_API_KEY' }
    const credentials = credentialStore({ ALIYUN_API_KEY: 'sk-running' })
    const { handler } = await mounted({ aliyun: running }, credentials)

    const { res, out } = fakeRes()
    await handler(fakeReq({ method: 'POST', body: { op: 'add', value: 'sk-spare' } }), res)

    expect(out().status).toBe(200)
    expect(credentials.values['ALIYUN_API_KEY']).toBe('sk-running')
    expect(credentials.values['ALIYUN_API_KEY_2']).toBe('sk-spare')
  })

  it('labels the key the provider is running on, listing it for the first time', async () => {
    // Nothing has ever been listed, so the profile alone names the key in use —
    // and that is the row a user most wants a name for.
    const { handler } = await mounted({ aliyun: profile }, credentialStore({ ALIYUN_KEY: 'a' }))

    const { res, out } = fakeRes()
    await handler(fakeReq({ method: 'POST', body: { op: 'rename', ref: 'ALIYUN_KEY', alias: 'prod' } }), res)

    expect(out().status).toBe(200)
    expect(readKeyIndex(indexFile()).providers['aliyun']).toEqual([{ ref: 'ALIYUN_KEY', alias: 'prod' }])
    const entries = out().body['entries'] as Array<Record<string, unknown>>
    expect(entries[0]?.['ref']).toBe('ALIYUN_KEY')
    expect(entries[0]?.['alias']).toBe('prod')
    expect(entries[0]?.['enabled']).toBe(true)
  })

  it('renames a listed key without moving it in the list', async () => {
    writeKeyIndex({ version: 1, providers: { aliyun: [{ ref: 'ALIYUN_KEY' }, { ref: 'ALIYUN_KEY_2' }] } }, indexFile())
    const { handler } = await mounted({ aliyun: profile }, credentialStore({ ALIYUN_KEY: 'a' }))

    const { res, out } = fakeRes()
    await handler(fakeReq({ method: 'POST', body: { op: 'rename', ref: 'ALIYUN_KEY_2', alias: '  spare  ' } }), res)

    expect(out().status).toBe(200)
    expect(readKeyIndex(indexFile()).providers['aliyun']).toEqual([
      { ref: 'ALIYUN_KEY' },
      { ref: 'ALIYUN_KEY_2', alias: 'spare' },
    ])
    const entries = out().body['entries'] as Array<Record<string, unknown>>
    expect(entries[1]?.['alias']).toBe('spare')
  })

  it('replaces the stored secret of a listed key without touching its name or seat', async () => {
    writeKeyIndex({ version: 1, providers: { aliyun: [{ ref: 'ALIYUN_KEY' }, { ref: 'ALIYUN_KEY_2' }] } }, indexFile())
    const credentials = credentialStore({ ALIYUN_KEY: 'sk-old', ALIYUN_KEY_2: 'sk-spare' })
    const { handler, settings } = await mounted({ aliyun: profile }, credentials)

    const { res, out } = fakeRes()
    await handler(fakeReq({ method: 'POST', body: { op: 'value', ref: 'ALIYUN_KEY', value: 'sk-new-secret' } }), res)

    expect(out().status).toBe(200)
    // The adapter resolves the profile's reference, so that is now the new value.
    expect(credentials.values['ALIYUN_KEY']).toBe('sk-new-secret')
    // Only the secret moved: the index still lists the same name in the same seat.
    expect(readKeyIndex(indexFile()).providers['aliyun']).toEqual([{ ref: 'ALIYUN_KEY' }, { ref: 'ALIYUN_KEY_2' }])
    expect(settings.mutations).toHaveLength(0)
  })

  it('refuses to replace a key the provider does not list, or one that was not named at all', async () => {
    const credentials = credentialStore({ ALIYUN_KEY: 'sk-secret' })
    const { handler } = await mounted({ aliyun: profile }, credentials)

    const unknown = fakeRes()
    await handler(fakeReq({ method: 'POST', body: { op: 'value', ref: 'NOPE_KEY', value: 'sk-other' } }), unknown.res)
    expect(unknown.out().status).toBe(400)
    expect(unknown.out().body['error']).toBe('that key is not listed for this provider')

    const unnamed = fakeRes()
    await handler(fakeReq({ method: 'POST', body: { op: 'value', value: 'sk-other' } }), unnamed.res)
    expect(unnamed.out().status).toBe(400)
    expect(unnamed.out().body['error']).toBe('that key is not listed for this provider')

    expect(credentials.values['NOPE_KEY']).toBeUndefined()
    expect(credentials.values['ALIYUN_KEY']).toBe('sk-secret')
    expect(existsSync(indexFile())).toBe(false)
  })

  it('refuses a replacement value that is not printable ASCII before writing anything', async () => {
    writeKeyIndex({ version: 1, providers: { aliyun: [{ ref: 'ALIYUN_KEY' }] } }, indexFile())
    const credentials = credentialStore({ ALIYUN_KEY: 'sk-secret' })
    const { handler } = await mounted({ aliyun: profile }, credentials)

    for (const value of ['sk with space', '']) {
      const { res, out } = fakeRes()
      await handler(fakeReq({ method: 'POST', body: { op: 'value', ref: 'ALIYUN_KEY', value } }), res)
      expect(out().status).toBe(400)
      expect(out().body['error']).toBe('a key must be printable ASCII without spaces')
    }
    expect(credentials.values['ALIYUN_KEY']).toBe('sk-secret')
  })

  it('replaces the key in use even when the index has never listed it', async () => {
    // The profile names a reference the index does not (written by the official
    // page, or by hand). It is still the key the adapter resolves, so it is
    // still the row a replacement may target.
    const credentials = credentialStore({ ALIYUN_KEY: 'sk-old' })
    const { handler } = await mounted({ aliyun: profile }, credentials)

    const { res, out } = fakeRes()
    await handler(fakeReq({ method: 'POST', body: { op: 'value', ref: 'ALIYUN_KEY', value: 'sk-new' } }), res)

    expect(out().status).toBe(200)
    expect(credentials.values['ALIYUN_KEY']).toBe('sk-new')
    expect(out().body['entries']).toEqual([
      { ref: 'ALIYUN_KEY', enabled: true, configured: true, masked: maskKeyValue('sk-new') },
    ])
    // Nothing to index: the reference was already in use, never listed.
    expect(existsSync(indexFile())).toBe(false)
  })

  it('hands the seat over before it forgets the key that held it', async () => {
    writeKeyIndex({ version: 1, providers: { aliyun: [{ ref: 'ALIYUN_KEY' }, { ref: 'ALIYUN_KEY_2' }] } }, indexFile())
    const credentials = credentialStore({ ALIYUN_KEY: 'a', ALIYUN_KEY_2: 'b' })
    const { handler, settings } = await mounted({ aliyun: profile }, credentials)

    const { res, out } = fakeRes()
    await handler(fakeReq({ method: 'POST', body: { op: 'remove', ref: 'ALIYUN_KEY' } }), res)

    expect(out().status).toBe(200)
    const entries = out().body['entries'] as Array<{ ref: string; enabled: boolean }>
    expect(entries.map(entry => entry.ref)).toEqual(['ALIYUN_KEY_2'])
    expect(entries[0]?.enabled).toBe(true)
    expect(credentials.values['ALIYUN_KEY']).toBeUndefined()
    expect(readKeyIndex(indexFile()).providers['aliyun']).toEqual([{ ref: 'ALIYUN_KEY_2' }])
    // One write only: the profile never names a reference the store just lost.
    expect(settings.mutations).toHaveLength(1)
  })

  it('clears the profile reference when the last key on a route is removed', async () => {
    writeKeyIndex({ version: 1, providers: { aliyun: [{ ref: 'ALIYUN_KEY' }] } }, indexFile())
    const credentials = credentialStore({ ALIYUN_KEY: 'a' })
    const { handler, settings } = await mounted({ aliyun: profile }, credentials)

    const { res, out } = fakeRes()
    await handler(fakeReq({ method: 'POST', body: { op: 'remove', ref: 'ALIYUN_KEY' } }), res)

    expect(out().status).toBe(200)
    expect(out().body['entries']).toEqual([])
    expect(settings.mutations[0]?.ops).toEqual([{ op: 'unset', path: ['providers', 'aliyun', 'apiKeyEnv'] }])
    expect(readKeyIndex(indexFile()).providers['aliyun']).toBeUndefined()
  })

  it('re-reads and retries a settings write that lost a race', async () => {
    // Removing the key the profile runs on forces the seat hand-over — a settings
    // write — so it is the mutation the conflict retry must survive.
    writeKeyIndex({ version: 1, providers: { aliyun: [{ ref: 'ALIYUN_KEY' }, { ref: 'ALIYUN_KEY_2' }] } }, indexFile())
    const credentials = credentialStore({ ALIYUN_KEY: 'a', ALIYUN_KEY_2: 'b' })
    const { handler, settings } = await mounted({ aliyun: profile }, credentials)

    settings.failNextMutation()
    const { res, out } = fakeRes()
    await handler(fakeReq({ method: 'POST', body: { op: 'remove', ref: 'ALIYUN_KEY' } }), res)

    expect(out().status).toBe(200)
    const entries = out().body['entries'] as Array<{ ref: string; enabled: boolean }>
    expect(entries[0]).toMatchObject({ ref: 'ALIYUN_KEY_2', enabled: true })
    expect(settings.mutations).toHaveLength(1)
  })

  it('gives up on a write that keeps losing the race', async () => {
    writeKeyIndex({ version: 1, providers: { aliyun: [{ ref: 'ALIYUN_KEY' }] } }, indexFile())
    const { handler, settings } = await mounted({ aliyun: profile }, credentialStore({ ALIYUN_KEY: 'a' }))

    // Two failed attempts exhaust the retry budget.
    settings.failNextMutation(2)
    const { res, out } = fakeRes()
    await handler(fakeReq({ method: 'POST', body: { op: 'remove', ref: 'ALIYUN_KEY' } }), res)

    expect(out().status).toBe(400)
    expect(String(out().body['error'])).toContain('the settings document moved')
    expect(settings.mutations).toHaveLength(0)
  })

  it('reports an operation it does not serve', async () => {
    const { handler } = await mounted({ aliyun: profile }, credentialStore())

    const { res, out } = fakeRes()
    await handler(fakeReq({ method: 'POST', body: { op: 'nope' } }), res)

    expect(out().status).toBe(400)
    expect(String(out().body['error'])).toContain('unknown key operation "nope"')
  })

  it('reports an empty body as an unknown operation rather than throwing', async () => {
    const { handler } = await mounted({ aliyun: profile }, credentialStore())

    const { res, out } = fakeRes()
    await handler(fakeReq({ method: 'POST' }), res)

    expect(out().status).toBe(400)
    expect(String(out().body['error'])).toContain('unknown key operation ""')
  })

  // ---- The post-save scope probe ----
  //
  // A save (a settings event) and a key change (add / value / endpoints) both
  // ask every listed key what its own listing advertises, record the
  // observations, and check the probe-maintained scopes to the models the key
  // actually serves within the route's declared set. A manual scope is never
  // rewritten.

  describe('post-save scope probe', () => {
    afterEach(() => {
      vi.unstubAllGlobals()
    })

    /**
     * The listing wire, distinguished by the credential each request signs
     * with: the first key's upstream group carries only `m-a`, the second's
     * carries everything declared plus an undeclared extra.
     */
    function listingFetch(): { calls: () => number } {
      let calls = 0
      vi.stubGlobal('fetch', vi.fn(async (_url: unknown, init?: RequestInit) => {
        calls += 1
        const auth = new Headers(init?.headers).get('authorization') ?? ''
        const models = auth.endsWith('sk-second') ? ['m-a', 'm-b', 'm-c'] : ['m-a']
        // A real Response: the probe reads the reply as a bounded stream.
        return new Response(JSON.stringify({ data: models.map(id => ({ id })) }), { status: 200 })
      }))
      return { calls: () => calls }
    }

    it('checks each key to the models it serves once a save moved the route', async () => {
      writeKeyIndex({
        version: 1,
        providers: { aliyun: [{ ref: 'ALIYUN_KEY' }, { ref: 'ALIYUN_KEY_2' }] },
      }, indexFile())
      const store = credentialStore({ ALIYUN_KEY: 'sk-first', ALIYUN_KEY_2: 'sk-second' })
      listingFetch()
      const { settings, emitUpdated } = await mounted(
        { aliyun: { ...profile, models: [{ id: 'm-a' }, { id: 'm-b' }] } },
        store,
      )
      // The first sight of the document is the baseline: no probe follows it,
      // or every page opening would sweep every route.
      emitUpdated('llm-pi-ai')
      settings.register('llm-pi-ai', { aliyun: { ...profile, models: [{ id: 'm-a' }, { id: 'm-b' }, { id: 'm-c' }] } })
      emitUpdated('llm-pi-ai')
      await vi.waitFor(() => {
        const entries = keyEntriesOf(readKeyIndex(indexFile()), 'aliyun')
        expect(entries.find(entry => entry.ref === 'ALIYUN_KEY')?.models).toEqual(['m-a'])
      })
      const entries = keyEntriesOf(readKeyIndex(indexFile()), 'aliyun')
      const first = entries.find(entry => entry.ref === 'ALIYUN_KEY')
      const second = entries.find(entry => entry.ref === 'ALIYUN_KEY_2')
      // The first key serves one declared model of three: its scope is checked
      // to that one, marked as the probe's own assignment.
      expect(first?.models).toEqual(['m-a'])
      expect(first?.auto).toBe(true)
      // The second key serves every declared model: the catch-all it already
      // reads as IS the assignment, so nothing is written and nothing is
      // narrowed — the key keeps serving models added later without a probe
      // pass in between.
      expect(second).toEqual({ ref: 'ALIYUN_KEY_2' })
    })

    it('leaves a scope the user saved by hand alone, whatever the listing says', async () => {
      writeKeyIndex({
        version: 1,
        providers: { aliyun: [{ ref: 'ALIYUN_KEY', models: ['m-a', 'm-b'] }] },
      }, indexFile())
      const store = credentialStore({ ALIYUN_KEY: 'sk-first' })
      const wire = listingFetch()
      const { handler, settings, emitUpdated } = await mounted(
        { aliyun: { ...profile, models: [{ id: 'm-a' }, { id: 'm-b' }] } },
        store,
      )
      emitUpdated('llm-pi-ai')
      settings.register('llm-pi-ai', { aliyun: { ...profile, baseURL: 'https://moved.example.com/v1', models: [{ id: 'm-a' }, { id: 'm-b' }] } })
      emitUpdated('llm-pi-ai')
      // The probe ran (the listing was asked)…
      await vi.waitFor(() => { expect(wire.calls()).toBeGreaterThan(0) })
      // …and settled: no read reports it any more, and the manual scope the
      // entry carries — wider than what its key lists — is exactly as saved.
      await vi.waitFor(async () => {
        const { res, out } = fakeRes()
        await handler(fakeReq(), res)
        expect(out().body['probing']).toBeUndefined()
      })
      const entries = keyEntriesOf(readKeyIndex(indexFile()), 'aliyun')
      expect(entries).toEqual([{ ref: 'ALIYUN_KEY', models: ['m-a', 'm-b'] }])
    })

    it('reports a pending probe on the list and re-asks after a key change', async () => {
      writeKeyIndex({ version: 1, providers: { aliyun: [{ ref: 'ALIYUN_KEY' }] } }, indexFile())
      const store = credentialStore({ ALIYUN_KEY: 'sk-first' })
      const wire = listingFetch()
      const { handler, settings, emitUpdated } = await mounted(
        { aliyun: { ...profile, models: [{ id: 'm-a' }, { id: 'm-b' }] } },
        store,
      )
      emitUpdated('llm-pi-ai')
      settings.register('llm-pi-ai', { aliyun: { ...profile, baseURL: 'https://moved.example.com/v1', models: [{ id: 'm-a' }, { id: 'm-b' }] } })
      emitUpdated('llm-pi-ai')
      // The probe is scheduled: the open panel is told, so it can follow the
      // assignments the probe is about to write.
      {
        const { res, out } = fakeRes()
        await handler(fakeReq(), res)
        expect(out().body['probing']).toBe(true)
      }
      await vi.waitFor(() => { expect(wire.calls()).toBeGreaterThan(0) })
      // Replacing a key's value is a different upstream account: its own
      // probe, without waiting for the next save.
      let calls = 0
      vi.stubGlobal('fetch', vi.fn(async () => {
        calls += 1
        return new Response(JSON.stringify({ data: [{ id: 'm-a' }] }), { status: 200 })
      }))
      {
        const { res, out } = fakeRes()
        await handler(fakeReq({ method: 'POST', body: { op: 'value', ref: 'ALIYUN_KEY', value: 'sk-second' } }), res)
        expect(out().status).toBe(200)
      }
      await vi.waitFor(() => { expect(calls).toBeGreaterThan(0) })
    })
  })
})

describe('apply() default-guard', () => {
  const GUARD_PROVIDERS = {
    suiyue: {
      api: 'openai-completions',
      baseURL: 'https://api.suiyue.site/v1',
      models: [
        { id: 'glm-5.3-flash', reasoningEfforts: { low: 'low', high: 'high', max: 'max' } },
        { id: 'qwen3.8-flash', reasoningEfforts: { off: null, low: 'low', medium: 'medium', xhigh: 'xhigh' } },
      ],
    },
  }

  function fakeLlm(): {
    svc: {
      prepareCall(config: Record<string, unknown>): Promise<Record<string, unknown>>
      stream(options: Record<string, unknown>): AsyncIterable<unknown>
    }
    prepared: Array<Record<string, unknown>>
    streamed: Array<Record<string, unknown>>
  } {
    const prepared: Array<Record<string, unknown>> = []
    const streamed: Array<Record<string, unknown>> = []
    return {
      svc: {
        async prepareCall(config: Record<string, unknown>): Promise<Record<string, unknown>> {
          prepared.push(config)
          return { ...config }
        },
        stream(options: Record<string, unknown>): AsyncIterable<unknown> {
          streamed.push(options)
          return (async function* (): AsyncGenerator<unknown> {})()
        },
      },
      prepared,
      streamed,
    }
  }

  it('injects the vendor default into effort-less calls on forced ladders', async () => {
    const settings = fakeSettings(GUARD_PROVIDERS)
    const llm = fakeLlm()
    const { ctx } = fakeHost(settings, { llm: llm.svc })
    const { apply } = await import('../src/index.js')
    apply(ctx)
    // The model-pro test shape: no effort named (issue #2).
    await llm.svc.prepareCall({ provider: 'suiyue', model: 'glm-5.3-flash', maxTokens: 16, temperature: 0 })
    expect(llm.prepared[0]).toMatchObject({
      provider: 'suiyue',
      model: 'glm-5.3-flash',
      maxTokens: 16,
      temperature: 0,
      reasoningEffort: 'max',
    })
    llm.svc.stream({ provider: 'suiyue', model: 'glm-5.3-flash', maxTokens: 16, messages: [] })
    expect(llm.streamed[0]).toMatchObject({ reasoningEffort: 'max' })
  })

  it('preserves a prepared-call envelope for consumers that stream prepared.config', async () => {
    const settings = fakeSettings(GUARD_PROVIDERS)
    const llm = fakeLlm()
    llm.svc.prepareCall = async config => ({ config, transport: 'prepared' })
    const { ctx } = fakeHost(settings, { llm: llm.svc })
    const { apply } = await import('../src/index.js')
    apply(ctx, { autofill: false })
    const prepared = await llm.svc.prepareCall({ provider: 'suiyue', model: 'glm-5.3-flash' })
    expect(prepared['transport']).toBe('prepared')
    expect(prepared['config']).toMatchObject({ reasoningEffort: 'max' })
    llm.svc.stream({ ...(prepared['config'] as Record<string, unknown>), messages: [] })
    expect(llm.streamed[0]).toMatchObject({ reasoningEffort: 'max', messages: [] })
  })

  it('reads SettingsForms once until a document update invalidates the cache', async () => {
    const settings = fakeSettings(GUARD_PROVIDERS)
    const llm = fakeLlm()
    const { ctx, emitUpdated } = fakeHost(settings, { llm: llm.svc })
    const { apply } = await import('../src/index.js')
    apply(ctx, { autofill: false })

    await llm.svc.prepareCall({ provider: 'suiyue', model: 'glm-5.3-flash' })
    await llm.svc.prepareCall({ provider: 'suiyue', model: 'glm-5.3-flash' })
    expect(settings.describeCalls()).toBe(1)

    emitUpdated('llm-pi-ai')
    await llm.svc.prepareCall({ provider: 'suiyue', model: 'glm-5.3-flash' })
    expect(settings.describeCalls()).toBe(2)
  })

  it('fails open when SettingsForms.describe throws', async () => {
    const settings = fakeSettings(GUARD_PROVIDERS)
    settings.describe = () => {
      throw new Error('settings unavailable')
    }
    const llm = fakeLlm()
    const { ctx } = fakeHost(settings, { llm: llm.svc })
    const { apply } = await import('../src/index.js')
    apply(ctx, { autofill: false })

    await expect(llm.svc.prepareCall({ provider: 'suiyue', model: 'glm-5.3-flash' })).resolves.toBeDefined()
    expect('reasoningEffort' in llm.prepared[0]!).toBe(false)
  })

  it('leaves explicit selections and off-capable ladders alone', async () => {
    const settings = fakeSettings(GUARD_PROVIDERS)
    const llm = fakeLlm()
    const { ctx } = fakeHost(settings, { llm: llm.svc })
    const { apply } = await import('../src/index.js')
    apply(ctx)
    await llm.svc.prepareCall({ provider: 'suiyue', model: 'glm-5.3-flash', reasoningEffort: 'low' })
    expect(llm.prepared[0]).toMatchObject({ reasoningEffort: 'low' })
    // Qwen carries off:null: Default must stay Default.
    await llm.svc.prepareCall({ provider: 'suiyue', model: 'qwen3.8-flash' })
    expect('reasoningEffort' in llm.prepared[1]).toBe(false)
    // Unknown routes/models pass through (fail open).
    await llm.svc.prepareCall({ provider: 'nope', model: 'glm-5.3-flash' })
    expect('reasoningEffort' in llm.prepared[2]).toBe(false)
  })

  it('yields to a route-level reasoning default', async () => {
    const settings = fakeSettings({
      suiyue: {
        api: 'openai-completions',
        baseURL: 'https://api.suiyue.site/v1',
        reasoning: 'low',
        models: [{ id: 'glm-5.3-flash', reasoningEfforts: { low: 'low', high: 'high', max: 'max' } }],
      },
    })
    const llm = fakeLlm()
    const { ctx } = fakeHost(settings, { llm: llm.svc })
    const { apply } = await import('../src/index.js')
    apply(ctx)
    // DSH core materializes profile.reasoning itself; the guard must not
    // clobber the deployment's explicit choice with the vendor default.
    await llm.svc.prepareCall({ provider: 'suiyue', model: 'glm-5.3-flash' })
    expect('reasoningEffort' in llm.prepared[0]).toBe(false)
  })

  it('stays off the wire when defaultGuard is false', async () => {
    const settings = fakeSettings(GUARD_PROVIDERS)
    const llm = fakeLlm()
    const origPrepare = llm.svc.prepareCall
    const origStream = llm.svc.stream
    const { ctx } = fakeHost(settings, { llm: llm.svc })
    const { apply } = await import('../src/index.js')
    apply(ctx, { defaultGuard: false })
    expect(llm.svc.prepareCall).toBe(origPrepare)
    expect(llm.svc.stream).toBe(origStream)
    await llm.svc.prepareCall({ provider: 'suiyue', model: 'glm-5.3-flash' })
    expect('reasoningEffort' in llm.prepared[0]).toBe(false)
  })

  it('preserves later wrappers and makes captured guards inert on disposal', async () => {
    const settings = fakeSettings(GUARD_PROVIDERS)
    const llm = fakeLlm()
    const { ctx, dispose } = fakeHost(settings, { llm: llm.svc })
    const { apply } = await import('../src/index.js')
    apply(ctx, { autofill: false })
    const guardedPrepare = llm.svc.prepareCall
    const guardedStream = llm.svc.stream
    const laterPrepare = vi.fn((config: Record<string, unknown>) => guardedPrepare(config))
    const laterStream = vi.fn((options: Record<string, unknown>) => guardedStream(options))
    llm.svc.prepareCall = laterPrepare
    llm.svc.stream = laterStream
    dispose()
    expect(llm.svc.prepareCall).toBe(laterPrepare)
    expect(llm.svc.stream).toBe(laterStream)
    await llm.svc.prepareCall({ provider: 'suiyue', model: 'glm-5.3-flash' })
    llm.svc.stream({ provider: 'suiyue', model: 'glm-5.3-flash' })
    expect(llm.prepared[0]).not.toHaveProperty('reasoningEffort')
    expect(llm.streamed[0]).not.toHaveProperty('reasoningEffort')
  })

  it('restores each method independently when only one is still owned', async () => {
    const settings = fakeSettings(GUARD_PROVIDERS)
    const llm = fakeLlm()
    const originalStream = llm.svc.stream
    const { ctx, dispose } = fakeHost(settings, { llm: llm.svc })
    const { apply } = await import('../src/index.js')
    apply(ctx, { autofill: false })
    const laterPrepare = async () => ({})
    llm.svc.prepareCall = laterPrepare
    dispose()
    expect(llm.svc.prepareCall).toBe(laterPrepare)
    expect(llm.svc.stream).toBe(originalStream)
  })

  it('restores the originals on dispose (uninstall-clean)', async () => {
    const settings = fakeSettings(GUARD_PROVIDERS)
    const llm = fakeLlm()
    const origPrepare = llm.svc.prepareCall
    const origStream = llm.svc.stream
    const { ctx, dispose } = fakeHost(settings, { llm: llm.svc })
    const { apply } = await import('../src/index.js')
    apply(ctx)
    expect(llm.svc.prepareCall).not.toBe(origPrepare)
    dispose()
    expect(llm.svc.prepareCall).toBe(origPrepare)
    expect(llm.svc.stream).toBe(origStream)
  })
})

describe('apply() fingerprint route', () => {
  const FINGERPRINT_PATH = '/dsh-model-think-level/fingerprint'

  /** The verdict file lives under the harness home; point it at a temp dir per test. */
  const savedHome = process.env['DSH_HOME']
  let home = ''

  beforeEach(() => {
    home = mkdtempSync(join(tmpdir(), 'bre-host-fp-'))
    process.env['DSH_HOME'] = home
  })

  afterEach(() => {
    if (savedHome === undefined) delete process.env['DSH_HOME']
    else process.env['DSH_HOME'] = savedHome
    rmSync(home, { recursive: true, force: true })
  })

  /** A response that can stream NDJSON as well as answer a whole JSON body. */
  function fakeRes(): {
    res: unknown
    headers: Record<string, string>
    lines: () => Array<Record<string, unknown>>
    out: () => { status: number; body: Record<string, unknown> }
  } {
    let status = 0
    let raw = ''
    let ended = false
    const headers: Record<string, string> = {}
    const written: string[] = []
    const closers: Array<() => void> = []
    const res = {
      set statusCode(value: number) { status = value },
      get statusCode(): number { return status },
      get writableEnded(): boolean { return ended },
      setHeader(key: string, value: string): void { headers[key.toLowerCase()] = value },
      write(chunk: string): boolean { written.push(chunk); return true },
      end(body?: string): void { raw = body ?? ''; ended = true },
      on(event: string, listener: () => void): void {
        if (event === 'close') closers.push(listener)
      },
      close(): void { for (const listener of closers) listener() },
    }
    return {
      res,
      headers,
      lines: () => written.join('').split('\n').filter(line => line.length > 0).map(line => JSON.parse(line) as Record<string, unknown>),
      out: () => ({ status, body: JSON.parse(raw.length > 0 ? raw : '{}') as Record<string, unknown> }),
    }
  }

  function fakeReq(overrides?: {
    method?: string
    url?: string
    headers?: Record<string, string>
    body?: unknown
  }): unknown {
    const text = overrides?.body === undefined ? '' : JSON.stringify(overrides.body)
    const req: Record<string | symbol, unknown> = {
      method: 'GET',
      url: '?route=aliyun',
      headers: { host: '127.0.0.1:3080' },
      ...overrides,
    }
    if (text.length > 0) {
      req[Symbol.asyncIterator] = async function* () {
        yield text
      }
    }
    return req
  }

  /**
   * Deterministic LCG text: `count` integers in [1, 355], one run of digits.
   * Unlike a shared-state LCG across parallel streams, the answer does not
   * depend on challenge scheduling.
   */
  function lcgText(seed: number, count: number): string {
    let state = seed >>> 0
    const next = (): number => {
      state = (Math.imul(state, 1664525) + 1013904223) >>> 0
      return state
    }
    return Array.from({ length: count }, () => 1 + (next() % 355)).join(' ')
  }

  /**
   * Expand one bank model's stored counts into the answer text it summarizes.
   * The counts are the model's aggregated number distribution, so the text
   * reproduces exactly the profile the bank attributes to that model.
   */
  function bankCountsText(bank: ReturnType<typeof loadBankSync>, modelId: string): string {
    const model = bank.models.find(entry => entry.id === modelId)
    if (model === undefined) throw new Error(`the bank has no model "${modelId}"`)
    const values: number[] = []
    model.counts.forEach((count, index) => {
      for (let k = 0; k < count; k += 1) values.push(index + 1)
    })
    return values.join(' ')
  }

  /** The route's early-exit gate, evaluated verbatim for one pair of answers. */
  function gateFires(a: string, b: string, bank: ReturnType<typeof loadBankSync>): boolean {
    try {
      const outputs = [
        { text: a, expected_count: 300 },
        { text: b, expected_count: 301 },
      ]
      const pooled = analyzeGlobalOutputs(outputs, bank)
      if (pooled.probability < EARLY_IDENTIFIED_PROBABILITY) return false
      const first = analyzeGlobalOutputs([outputs[0]!], bank)
      const second = analyzeGlobalOutputs([outputs[1]!], bank)
      return first.prediction === second.prediction
    } catch {
      return false
    }
  }

  /**
   * Three noise answers such that NO pair of them trips the early-exit gate:
   * the pooled probability stays under the bar or the two singles disagree.
   * Chosen once per process by a fixed seed scan, so the full three-challenge
   * flow below is deterministic regardless of which pair lands first.
   */
  const quietAnswers: string[] = (() => {
    const bank = loadBankSync()
    const found: string[] = []
    for (let seed = 1; found.length < 3 && seed < 500; seed += 1) {
      const text = lcgText(seed, 300)
      if (found.every(other => !gateFires(other, text, bank))) found.push(text)
    }
    if (found.length < 3) throw new Error('no quiet answer triple found')
    return found
  })()

  /**
   * A dispatch that answers every challenge with a full integer run, so the
   * bank has something to attribute. The point is the plumbing, not the
   * verdict: each challenge gets one of the pairwise-quiet noise answers.
   */
  function speakingLlm(): Record<string, unknown> {
    let call = 0
    return {
      async prepareCall(config: Record<string, unknown>): Promise<Record<string, unknown>> {
        return { ...config }
      },
      stream(): AsyncIterable<unknown> {
        const text = quietAnswers[call % quietAnswers.length]!
        call += 1
        return (async function* (): AsyncGenerator<unknown> {
          yield { type: 'text-delta', index: 0, text }
          yield { type: 'finish', reason: { kind: 'stop' } }
        })()
      },
    }
  }

  const profile = {
    api: 'openai-completions',
    baseURL: 'https://gw.example.com/v1',
    apiKeyEnv: 'ALIYUN_KEY',
    models: [],
  }

  async function mounted(options?: {
    llm?: Record<string, unknown>
  }): Promise<(req: unknown, res: unknown) => Promise<void>> {
    const settings = fakeSettings({ aliyun: profile })
    const { ctx, routes } = fakeHost(
      settings,
      options?.llm === undefined ? undefined : { llm: options.llm },
    )
    const { apply } = await import('../src/index.js')
    apply(ctx, { autofill: false })
    const handler = routes.get(FINGERPRINT_PATH)
    expect(handler).toBeDefined()
    return handler!
  }

  it('names the route and refuses every other verb', async () => {
    const handler = await mounted()
    const { res, out } = fakeRes()
    await handler(fakeReq({ method: 'PATCH' }), res)
    expect(out()).toEqual({ status: 405, body: { ok: false, error: 'method not allowed' } })
  })

  it('refuses a cross-site caller before reading anything', async () => {
    const handler = await mounted()
    const { res, out } = fakeRes()
    await handler(fakeReq({ headers: { host: '10.0.0.5:3080', 'sec-fetch-site': 'cross-site' } }), res)
    expect(out().status).toBe(403)
    expect(out().body['error']).toBe('forbidden')
  })

  it('insists on a provider route', async () => {
    const handler = await mounted()
    const { res, out } = fakeRes()
    await handler(fakeReq({ url: '?' }), res)
    expect(out()).toEqual({ status: 400, body: { ok: false, error: 'a provider route is required' } })
  })

  it('refuses a route the llm-pi-ai settings do not name', async () => {
    const handler = await mounted()
    const { res, out } = fakeRes()
    await handler(fakeReq({ url: '?route=nope' }), res)
    expect(out()).toEqual({
      status: 400,
      body: { ok: false, error: 'no llm-pi-ai provider route "nope"' },
    })
  })

  it('GET answers the bank and an empty verdict list', async () => {
    const handler = await mounted()
    const { res, out } = fakeRes()
    await handler(fakeReq(), res)

    const body = out()
    expect(body.status).toBe(200)
    expect(body.body['ok']).toBe(true)
    const data = body.body['data'] as Record<string, unknown>
    expect(data['records']).toEqual([])
    const bank = data['bank'] as Record<string, unknown>
    // The shipped bank is the 2-family / 18-model one.
    expect((bank['models'] as unknown[]).length).toBe(18)
    expect((bank['families'] as Array<Record<string, unknown>>).map(f => f['family']).sort()).toEqual(['claude', 'gpt'])
    expect(bank['recommendedQueries']).toBe(3)
    expect(data['bankBuiltAt']).toBeUndefined()
  })

  it('POST refuses a model outside the two families instead of spending three calls', async () => {
    const handler = await mounted({ llm: speakingLlm() })
    const { res, out } = fakeRes()
    await handler(fakeReq({ method: 'POST', body: { model: 'qwen3.8-flash' } }), res)

    expect(out()).toEqual({
      status: 400,
      body: { ok: false, error: 'model "qwen3.8-flash" is not a GPT or Claude model' },
    })
  })

  it('POST insists on a model id', async () => {
    const handler = await mounted({ llm: speakingLlm() })
    const { res, out } = fakeRes()
    await handler(fakeReq({ method: 'POST', body: {} }), res)
    expect(out()).toEqual({ status: 400, body: { ok: false, error: 'a model id is required' } })
  })

  it('POST reports an unavailable llm service rather than pretending to fail', async () => {
    const handler = await mounted()
    const { res, out } = fakeRes()
    await handler(fakeReq({ method: 'POST', body: { model: 'gpt-5.5' } }), res)
    expect(out()).toEqual({ status: 503, body: { ok: false, error: 'the llm service is unavailable' } })
  })

  it('POST streams one line per challenge and a verdict, then stores it', async () => {
    const handler = await mounted({ llm: speakingLlm() })
    const fake = fakeRes()
    await handler(fakeReq({ method: 'POST', body: { model: 'gpt-5.5' } }), fake.res)
    const { headers, lines } = fake

    // The answer is streamed, never buffered whole: the page reads it as it lands.
    expect(headers['content-type']).toBe('application/x-ndjson; charset=utf-8')
    expect(headers['cache-control']).toBe('no-store')
    expect(headers['x-accel-buffering']).toBe('no')

    const emitted = lines()
    const progress = emitted.filter(line => line['type'] === 'progress')
    expect(progress).toHaveLength(3)
    expect(progress.map(line => line['index']).sort()).toEqual([0, 1, 2])
    expect(progress.every(line => line['ok'] === true)).toBe(true)

    const result = emitted.find(line => line['type'] === 'result') as Record<string, unknown>
    expect(result).toBeDefined()
    const record = result['record'] as Record<string, unknown>
    expect(record['provider']).toBe('aliyun')
    expect(record['model']).toBe('gpt-5.5')
    expect(['identified', 'doubtful']).toContain(record['status'])
    expect(record['usedOutputs']).toBe(3)
    expect(record['prediction']).toBeTypeOf('string')
    expect(record['probability']).toBeTypeOf('number')
    expect((record['top'] as unknown[]).length).toBeGreaterThan(0)

    // And it is on disk, keyed by provider + model.
    const written = readFileSync(join(home, 'dsh-model-think-level', 'fingerprint.json'), 'utf8')
    const records = (JSON.parse(written) as { records: Record<string, unknown> }).records
    expect(Object.keys(records)).toHaveLength(1)
    expect(Object.keys(records)[0]).toBe('aliyun\u0000gpt-5.5')
  })

  it('concludes from two confident answers before the slowest challenge lands', async () => {
    const bank = loadBankSync()
    const confident = bankCountsText(bank, 'claude-opus-5')
    // Self-check the gate before paying for the route run: the pooled pair
    // clears the 2-query bar and both answers name the same winner. If the
    // bank ever stops satisfying this, this test must be reworked, not hung.
    expect(gateFires(confident, confident, bank)).toBe(true)

    let confidentCalls = 0
    let hungAborted = false
    const llm = {
      async prepareCall(config: Record<string, unknown>): Promise<Record<string, unknown>> {
        return { ...config }
      },
      stream(options: Record<string, unknown>): AsyncIterable<unknown> {
        confidentCalls += 1
        if (confidentCalls <= 2) {
          return (async function* (): AsyncGenerator<unknown> {
            yield { type: 'text-delta', index: 0, text: confident }
            yield { type: 'finish', reason: { kind: 'stop' } }
          })()
        }
        // The third challenge is a slow provider: it produces nothing until
        // the early exit cancels it.
        const signal = options['signal'] as AbortSignal | undefined
        return (async function* (): AsyncGenerator<unknown> {
          while (signal?.aborted !== true) await new Promise(resolve => setTimeout(resolve, 0))
          hungAborted = true
        })()
      },
    }
    const handler = await mounted({ llm })
    const fake = fakeRes()
    await handler(fakeReq({ method: 'POST', body: { model: 'gpt-5.5' } }), fake.res)

    // The suppressed challenge is NOT progress: two lines, then the verdict.
    const emitted = fake.lines()
    const progress = emitted.filter(line => line['type'] === 'progress')
    expect(progress).toHaveLength(2)
    expect(progress.every(line => line['ok'] === true)).toBe(true)

    const result = emitted.find(line => line['type'] === 'result') as Record<string, unknown>
    const record = result['record'] as Record<string, unknown>
    expect(hungAborted).toBe(true)
    expect(record['usedOutputs']).toBe(2)
    expect(record['status']).toBe('identified')
    expect(record['prediction']).toBe('claude-opus-5')
    expect((record['calibration'] as Record<string, unknown>)['queries']).toBe(2)
    // The timing picture exists and describes the two answers that ran.
    const timing = record['timing'] as Record<string, number>
    expect(typeof timing['durationMs']).toBe('number')
    expect(timing['durationMs']).toBeGreaterThanOrEqual(0)

    // And the 2-query verdict is on disk like any other.
    const written = JSON.parse(
      readFileSync(join(home, 'dsh-model-think-level', 'fingerprint.json'), 'utf8'),
    ) as { records: Record<string, { usedOutputs?: number }> }
    expect(written.records['aliyun\u0000gpt-5.5'].usedOutputs).toBe(2)
  })

  it('waits for the third answer when the first two point at different models', async () => {
    const bank = loadBankSync()
    const claude = bankCountsText(bank, 'claude-opus-5')
    const gpt = bankCountsText(bank, 'gpt-5.5')
    // Each answer alone is confident, but they name different winners — the
    // agreement half of the gate must hold the run open for the third.
    const mixed = analyzeGlobalOutputs([
      { text: claude, expected_count: 300 },
      { text: gpt, expected_count: 301 },
    ], bank)
    expect(mixed.probability).toBeLessThan(EARLY_IDENTIFIED_PROBABILITY)

    const answers = [claude, gpt, gpt]
    let call = 0
    const llm = {
      async prepareCall(config: Record<string, unknown>): Promise<Record<string, unknown>> {
        return { ...config }
      },
      stream(): AsyncIterable<unknown> {
        const text = answers[Math.min(call, answers.length - 1)]!
        call += 1
        return (async function* (): AsyncGenerator<unknown> {
          yield { type: 'text-delta', index: 0, text }
          yield { type: 'finish', reason: { kind: 'stop' } }
        })()
      },
    }
    const handler = await mounted({ llm })
    const fake = fakeRes()
    await handler(fakeReq({ method: 'POST', body: { model: 'gpt-5.5' } }), fake.res)

    // No early exit: all three challenges ran, all three are progress.
    const emitted = fake.lines()
    expect(emitted.filter(line => line['type'] === 'progress')).toHaveLength(3)
    const record = (emitted.find(line => line['type'] === 'result') as Record<string, unknown>)['record'] as Record<string, unknown>
    expect(record['usedOutputs']).toBe(3)
    // The majority answer wins the pooled verdict, whatever the grader's edge.
    const expected = analyzeGlobalOutputs([
      { text: claude, expected_count: 300 },
      { text: gpt, expected_count: 301 },
      { text: gpt, expected_count: 302 },
    ], bank)
    expect(record['prediction']).toBe(expected.prediction)
  })

  it('stores a verdict under the model id and can forget it again', async () => {
    const handler = await mounted({ llm: speakingLlm() })
    const run = fakeRes()
    await handler(fakeReq({ method: 'POST', body: { model: 'gpt-5.5' } }), run.res)

    const before = fakeRes()
    await handler(fakeReq(), before.res)
    const records = (before.out().body['data'] as Record<string, unknown>)['records'] as Array<Record<string, unknown>>
    expect(records.map(entry => entry['model'])).toEqual(['gpt-5.5'])

    const gone = fakeRes()
    await handler(fakeReq({ method: 'DELETE', url: '?route=aliyun&model=gpt-5.5' }), gone.res)
    expect(gone.out().body['ok']).toBe(true)

    const after = fakeRes()
    await handler(fakeReq(), after.res)
    expect(((after.out().body['data'] as Record<string, unknown>)['records'] as unknown[]).length).toBe(0)
  })

  it('DELETE insists on a model id', async () => {
    const handler = await mounted()
    const { res, out } = fakeRes()
    await handler(fakeReq({ method: 'DELETE' }), res)
    expect(out()).toEqual({ status: 400, body: { ok: false, error: 'a model id is required' } })
  })

  it('reports a dead model as a verdict, not as a transport error', async () => {
    const silent = {
      async prepareCall(config: Record<string, unknown>): Promise<Record<string, unknown>> {
        return { ...config }
      },
      stream(): AsyncIterable<unknown> {
        return (async function* (): AsyncGenerator<unknown> {
          yield { type: 'finish', reason: { kind: 'error', failure: { message: 'model not found' } } }
        })()
      },
    }
    const handler = await mounted({ llm: silent })
    const { res, lines } = fakeRes()
    await handler(fakeReq({ method: 'POST', body: { model: 'claude-sonnet-5' } }), res)

    const result = lines().find(line => line['type'] === 'result') as Record<string, unknown>
    const record = result['record'] as Record<string, unknown>
    expect(record['status']).toBe('failed')
    expect(record['usedOutputs']).toBe(0)
    // Every call died before producing text, so say what actually went wrong.
    expect(record['error']).toBe('error: model not found')
    expect(record['prediction']).toBeUndefined()
    expect(record['top']).toBeUndefined()
  })
})
