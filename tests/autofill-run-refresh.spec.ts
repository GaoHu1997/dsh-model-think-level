// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { PI_AI_NS } from '../src/constants.js'
import { apply } from '../src/client/index.js'
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

afterEach(() => {
  vi.unstubAllGlobals()
  document.body.innerHTML = ''
  document.head.innerHTML = ''
})

describe('idle autofill refresh wiring', () => {
  it.each(['settings/document-updated', 'connection/reset'] as const)('invalidates successful switch settings on %s', async (event) => {
    const fetch = vi.fn<typeof globalThis.fetch>()
      .mockResolvedValueOnce({ ok: true, json: async () => ({ ok: true, data: { autofill: false } }) } as Response)
      .mockResolvedValue({ ok: true, json: async () => ({ ok: true, data: {} }) } as Response)
    vi.stubGlobal('fetch', fetch)
    const providers = { relay: { api: 'openai-completions', models: [{ id: 'qwen-max' }] } }
    const api = fakeApi(async () => makeJoin(providers, providers))
    const context = makeCtx(api)
    try {
      apply(context.ctx as unknown as Parameters<typeof apply>[0])
      wiring.onIdle()
      await settle()
      expect(fetch).toHaveBeenCalledTimes(1)
      expect(api.settings.mutate).not.toHaveBeenCalled()

      // Other settings namespaces must leave the valid cached snapshot alone.
      context.emitRemote('settings/document-updated', 'unrelated-namespace')
      wiring.onIdle()
      await settle()
      expect(fetch).toHaveBeenCalledTimes(1)

      if (event === 'settings/document-updated') context.emitRemote(event, PI_AI_NS)
      else context.emitLocal(event)
      wiring.onIdle()
      await settle()
      expect(fetch).toHaveBeenCalledTimes(2)
      expect(api.settings.mutate).toHaveBeenCalledTimes(1)
    } finally {
      context.disposeAll()
    }
  })
})
