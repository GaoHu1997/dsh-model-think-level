import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  cachedImageConfigView,
  clearImageConfigCache,
  onImageConfigChanged,
  readImageConfigView,
  saveImageConfig,
} from '../src/client/image-config-client.js'
import { IMAGE_CONFIG_PATH } from '../src/constants.js'

function payload(model = 'a/image', enabled = true): Record<string, unknown> {
  return {
    ok: true, enabled,
    models: [{ id: model, label: model }], defaultModel: model,
    defaults: { size: '1024x1024', quality: 'high', n: 1, timeoutMs: 300_000 },
    outputDir: 'generated-images', tool: { registered: true, name: 'generate_image' },
  }
}

function response(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status })
}

function deferred<T>(): { promise: Promise<T>; resolve: (value: T) => void } {
  let resolve!: (value: T) => void
  const promise = new Promise<T>(settle => { resolve = settle })
  return { promise, resolve }
}

beforeEach(() => { clearImageConfigCache() })
afterEach(() => { vi.unstubAllGlobals() })

describe('image config browser transport', () => {
  it('reads live models through a no-store GET on every call', async () => {
    let current = payload()
    const fetcher = vi.fn(async () => response(current))
    vi.stubGlobal('fetch', fetcher)
    expect((await readImageConfigView()).ok).toBe(true)
    current = payload('b/new')
    expect((await readImageConfigView()).ok).toBe(true)
    expect(fetcher).toHaveBeenCalledTimes(2)
    expect(fetcher).toHaveBeenLastCalledWith(IMAGE_CONFIG_PATH, { method: 'GET', cache: 'no-store' })
    expect(cachedImageConfigView()?.models.map(model => model.id)).toEqual(['b/new'])
  })

  it.each(['network', 'http', 'json', 'models'] as const)('clears the warmed view after a current %s failure', async failure => {
    vi.stubGlobal('fetch', vi.fn(async () => response(payload())))
    await readImageConfigView()
    expect(cachedImageConfigView()).toBeDefined()
    vi.stubGlobal('fetch', vi.fn(async () => {
      if (failure === 'network') throw new Error('offline')
      if (failure === 'http') return response({ ok: false, error: 'settings unavailable' }, 503)
      if (failure === 'json') return new Response('not json')
      return response({ ...payload(), models: {} })
    }))
    expect((await readImageConfigView()).ok).toBe(false)
    expect(cachedImageConfigView()).toBeUndefined()
  })

  it('returns unavailable preferences and tool status with an empty model list, without caching them', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => response({
      ...payload('stale/image', false), ok: false, error: '生图配置尚未就绪',
      tool: { registered: false, name: null, error: 'tools unavailable' },
    }, 503)))
    const answer = await readImageConfigView()
    expect(answer).toMatchObject({
      ok: false, error: '生图配置尚未就绪',
      data: { enabled: false, models: [], defaultModel: 'stale/image', tool: { registered: false, name: null } },
    })
    expect(cachedImageConfigView()).toBeUndefined()
  })

  it('an older GET success cannot replace a newer GET result', async () => {
    const old = deferred<Response>()
    vi.stubGlobal('fetch', vi.fn().mockReturnValueOnce(old.promise).mockResolvedValueOnce(response(payload('new/image'))))
    const pending = readImageConfigView()
    await readImageConfigView()
    old.resolve(response(payload('old/image')))
    await pending
    expect(cachedImageConfigView()?.defaultModel).toBe('new/image')
  })

  it('an older GET failure cannot clear a newer GET result', async () => {
    const old = deferred<Response>()
    vi.stubGlobal('fetch', vi.fn().mockReturnValueOnce(old.promise).mockResolvedValueOnce(response(payload('new/image'))))
    const pending = readImageConfigView()
    await readImageConfigView()
    old.resolve(response({ ok: false, error: 'old failure' }, 503))
    await pending
    expect(cachedImageConfigView()?.defaultModel).toBe('new/image')
  })

  it('a GET started before a save cannot publish after the successful POST', async () => {
    const old = deferred<Response>()
    vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce(response(payload())).mockReturnValueOnce(old.promise)
      .mockResolvedValueOnce(response({ ok: true })))
    await readImageConfigView()
    const pending = readImageConfigView()
    const listener = vi.fn()
    const unsubscribe = onImageConfigChanged(listener)
    expect(await saveImageConfig({ enabled: false })).toEqual({ ok: true, data: undefined })
    expect(cachedImageConfigView()).toBeUndefined()
    old.resolve(response(payload('old/image')))
    await pending
    expect(cachedImageConfigView()).toBeUndefined()
    expect(listener).toHaveBeenCalledOnce()
    unsubscribe()
  })

  it('a GET started during a save cannot publish after the POST settles', async () => {
    const writing = deferred<Response>()
    const reading = deferred<Response>()
    vi.stubGlobal('fetch', vi.fn().mockReturnValueOnce(writing.promise).mockReturnValueOnce(reading.promise))
    const save = saveImageConfig({ enabled: false })
    const read = readImageConfigView()
    writing.resolve(response({ ok: true }))
    await save
    reading.resolve(response(payload('before-write/image')))
    await read
    expect(cachedImageConfigView()).toBeUndefined()
  })

  it('a newer post-save GET is not overwritten by an older outstanding GET', async () => {
    const old = deferred<Response>()
    vi.stubGlobal('fetch', vi.fn().mockReturnValueOnce(old.promise).mockResolvedValueOnce(response({ ok: true }))
      .mockResolvedValueOnce(response(payload('new/image', false))))
    const pending = readImageConfigView()
    await saveImageConfig({ enabled: false })
    await readImageConfigView()
    old.resolve(response(payload('old/image', true)))
    await pending
    expect(cachedImageConfigView()).toMatchObject({ enabled: false, defaultModel: 'new/image' })
  })

  it('clearing the cache also invalidates outstanding requests', async () => {
    const old = deferred<Response>()
    vi.stubGlobal('fetch', vi.fn().mockReturnValueOnce(old.promise))
    const pending = readImageConfigView()
    clearImageConfigCache()
    old.resolve(response(payload()))
    await pending
    expect(cachedImageConfigView()).toBeUndefined()
  })
})
