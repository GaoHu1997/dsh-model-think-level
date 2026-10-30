// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { PI_AI_NS } from '../src/constants.js'
import { apply, REFRESH_MIN_INTERVAL_MS } from '../src/client/index.js'
import { fakeApi, makeCtx, makeJoin } from './support/composer-fixture.js'

const wiring = vi.hoisted(() => ({ onIdle: (): void => {} }))

// Isolate apply's refresh wiring from the separately tested DOM scanner. Use
// the real autofill implementation so a missing invalidate leaves false cached.
vi.mock('../src/client/injection/models-page.js', () => ({
  createModelsPage: (deps: { onIdle: () => void }) => {
    wiring.onIdle = deps.onIdle
    return {
      state: { describePromise: undefined },
      start: vi.fn(),
      teardown: vi.fn(),
      flushOnUnload: vi.fn(),
      schedule: vi.fn(),
    }
  },
}))

async function settle(): Promise<void> {
  await new Promise<void>(resolve => setTimeout(resolve, 0))
}

const sleep = (ms: number): Promise<void> => new Promise(resolve => { setTimeout(resolve, ms) })

afterEach(() => {
  vi.unstubAllGlobals()
  document.body.innerHTML = ''
  document.head.innerHTML = ''
})

describe('idle autofill refresh wiring', () => {
  it.each(['settings/document-updated', 'connection/reset'] as const)('invalidates successful switch settings on %s', async (event) => {
    // The image tool card's registration reads the image-config route once at
    // apply, and the order sync reads the ui-order route at boot; the test
    // counts AUTOFILL calls, so the stub answers both BY URL and the
    // assertions below never depend on those extra reads' positions.
    let autofillCalls = 0
    const fetch = vi.fn<typeof globalThis.fetch>(async (input: RequestInfo | URL) => {
      const url = String(input)
      if (url === '/dsh-model-think-level/image-config') {
        return new Response(JSON.stringify({ ok: true, models: [], defaultModel: null, defaults: {}, outputDir: '', tool: { registered: false, name: null } }), { status: 200 })
      }
      if (url === '/dsh-model-think-level/ui-order') {
        return { ok: true, json: async () => ({ ok: true, data: null }) } as Response
      }
      autofillCalls += 1
      const body = autofillCalls === 1 ? { ok: true, data: { autofill: false } } : { ok: true, data: {} }
      return { ok: true, json: async () => body } as Response
    })
    vi.stubGlobal('fetch', fetch as unknown as typeof globalThis.fetch)
    const providers = { relay: { api: 'openai-completions', models: [{ id: 'qwen-max' }] } }
    const api = fakeApi(async () => makeJoin(providers, providers))
    const context = makeCtx(api)
    try {
      apply(context.ctx as unknown as Parameters<typeof apply>[0])
      wiring.onIdle()
      await settle()
      expect(autofillCalls).toBe(1)
      expect(api.settings.mutate).not.toHaveBeenCalled()

      // Other settings namespaces must leave the valid cached snapshot alone.
      context.emitRemote('settings/document-updated', 'unrelated-namespace')
      wiring.onIdle()
      await settle()
      expect(autofillCalls).toBe(1)

      if (event === 'settings/document-updated') context.emitRemote(event, PI_AI_NS)
      else context.emitLocal(event)
      // The refresh is rate-limited -- that bound is exactly what keeps a chatty
      // host from starving the page -- so the invalidation lands after the
      // scheduler's window, not synchronously with the event. Once it has, the
      // page scan's idle callback runs the fill again.
      await sleep(REFRESH_MIN_INTERVAL_MS + 50)
      wiring.onIdle()
      await settle()
      expect(autofillCalls).toBe(2)
      expect(api.settings.mutate).toHaveBeenCalledTimes(1)
    } finally {
      context.disposeAll()
    }
  })
})
