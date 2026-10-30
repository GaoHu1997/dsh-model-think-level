/**
 * The order document's client-side sync (order-sync.ts): the boot arbitrate
 * (adopt a newer file, push an older or absent one, touch nothing when the
 * sides agree), the debounced push after a drag, the pagehide flush, and the
 * disposer.
 *
 * Each test re-imports the stores and the sync over `vi.resetModules()`: the
 * stores hold their state at module scope, seeded from localStorage on import,
 * so a fresh registry per test is the isolation.
 */

// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

/** The stores' own localStorage keys (provider-order.ts / model-order.ts / provider-enabled.ts). */
const PROVIDER_ORDER_KEY = 'dsh-model-think-level.provider-order'
const MODEL_ORDER_KEY = 'dsh-model-think-level.model-order'
const PROVIDER_DISABLED_KEY = 'dsh-model-think-level.providers.disabled'
const ORDER_SAVED_AT_KEY = 'dsh-model-think-level.order-saved-at'
const ORDER_PATH = '/dsh-model-think-level/ui-order'

interface FetchCall {
  method: string
  url: string
  body?: Record<string, unknown>
}

/** Capture every call; GET answers `data`, POST succeeds. */
function stubFetch(getAnswer: unknown = { ok: true, data: null }): FetchCall[] {
  const calls: FetchCall[] = []
  const fetchMock = vi.fn(async (input: unknown, init?: { method?: string; body?: string }) => {
    const url = typeof input === 'string' ? input : String(input)
    const method = init?.method ?? 'GET'
    calls.push({ method, url, ...(init?.body === undefined ? {} : { body: JSON.parse(init.body) as Record<string, unknown> }) })
    if (method === 'GET') return { ok: true, status: 200, json: async () => getAnswer }
    return { ok: true, status: 200, json: async () => ({ ok: true }) }
  })
  vi.stubGlobal('fetch', fetchMock)
  return calls
}

const posts = (calls: FetchCall[]): FetchCall[] => calls.filter(call => call.method === 'POST')

beforeEach(() => {
  vi.resetModules()
  window.localStorage.clear()
  vi.useFakeTimers()
  vi.setSystemTime(new Date('2026-01-01T00:00:00Z'))
})

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

describe('boot arbitrate', () => {
  it('adopts a newer file into the stores and localStorage, and pushes nothing', async () => {
    window.localStorage.setItem(PROVIDER_ORDER_KEY, '["a"]')
    window.localStorage.setItem(MODEL_ORDER_KEY, '{"openai":["m1"]}')
    window.localStorage.setItem(ORDER_SAVED_AT_KEY, '100')
    const calls = stubFetch({ ok: true, data: { savedAt: 200, providerOrder: ['b', 'a'], modelOrder: { openai: ['m2', 'm1'], empty: [] } } })
    const { reconcileOrderSync } = await import('../src/client/order-sync.js')
    const { providerOrder } = await import('../src/client/provider-order.js')
    const { modelOrders } = await import('../src/client/model-order.js')
    await reconcileOrderSync()
    expect(providerOrder()).toEqual(['b', 'a'])
    expect(modelOrders()).toEqual({ openai: ['m2', 'm1'] })
    // The adopted state landed in localStorage too, so a reload keeps it even
    // without the file.
    expect(window.localStorage.getItem(PROVIDER_ORDER_KEY)).toBe('["b","a"]')
    expect(window.localStorage.getItem(MODEL_ORDER_KEY)).toBe('{"openai":["m2","m1"]}')
    expect(window.localStorage.getItem(ORDER_SAVED_AT_KEY)).toBe('200')
    // An adoption is a change we made FROM the file: pushing it back would
    // round-trip the file to itself.
    vi.advanceTimersByTime(2_000)
    expect(posts(calls)).toEqual([])
  })

  it('adopts the file disabled set over the local one, an empty array included', async () => {
    window.localStorage.setItem(PROVIDER_DISABLED_KEY, '["a"]')
    window.localStorage.setItem(ORDER_SAVED_AT_KEY, '100')
    const calls = stubFetch({ ok: true, data: { savedAt: 300, providerOrder: [], modelOrder: {}, providersDisabled: [] } })
    const { reconcileOrderSync } = await import('../src/client/order-sync.js')
    const { isProviderEnabled } = await import('../src/client/provider-enabled.js')
    await reconcileOrderSync()
    // The file is newer and says everything is on: the local "a is off" yields,
    // and the sides agree so nothing is pushed back.
    expect(isProviderEnabled('a')).toBe(true)
    vi.advanceTimersByTime(2_000)
    expect(posts(calls)).toEqual([])
  })

  it('pushes the local disabled set over an older file', async () => {
    window.localStorage.setItem(PROVIDER_DISABLED_KEY, '["wb"]')
    window.localStorage.setItem(ORDER_SAVED_AT_KEY, '5000')
    const calls = stubFetch({ ok: true, data: { savedAt: 1000, providerOrder: [], modelOrder: {}, providersDisabled: [] } })
    const { reconcileOrderSync } = await import('../src/client/order-sync.js')
    await reconcileOrderSync()
    await vi.advanceTimersByTimeAsync(0)
    const pushed = posts(calls)
    expect(pushed).toHaveLength(1)
    expect(pushed[0]!.body).toMatchObject({ savedAt: 5000, providersDisabled: ['wb'] })
  })

  it('pushes the local state over an older file (a push the last session missed)', async () => {
    window.localStorage.setItem(PROVIDER_ORDER_KEY, '["a","b"]')
    window.localStorage.setItem(ORDER_SAVED_AT_KEY, '5000')
    const calls = stubFetch({ ok: true, data: { savedAt: 1000, providerOrder: ['b', 'a'], modelOrder: {} } })
    const { reconcileOrderSync } = await import('../src/client/order-sync.js')
    await reconcileOrderSync()
    await vi.advanceTimersByTimeAsync(0)
    const pushed = posts(calls)
    expect(pushed).toHaveLength(1)
    expect(pushed[0]!.url).toBe(ORDER_PATH)
    expect(pushed[0]!.body).toMatchObject({ savedAt: 5000, providerOrder: ['a', 'b'] })
  })

  it('seeds an absent file with the local state', async () => {
    window.localStorage.setItem(MODEL_ORDER_KEY, '{"openai":["m1","m2"]}')
    const calls = stubFetch({ ok: false })
    const { reconcileOrderSync } = await import('../src/client/order-sync.js')
    await reconcileOrderSync()
    await vi.advanceTimersByTimeAsync(0)
    const pushed = posts(calls)
    expect(pushed).toHaveLength(1)
    expect(pushed[0]!.body).toMatchObject({ modelOrder: { openai: ['m1', 'm2'] } })
    // The seeded stamp is this boot's clock, so the file and the local stamp agree.
    expect(pushed[0]!.body?.savedAt).toBe(Date.parse('2026-01-01T00:00:00Z'))
  })

  it('pushes nothing when both sides hold no ordering', async () => {
    const calls = stubFetch({ ok: true, data: { savedAt: 0, providerOrder: [], modelOrder: {} } })
    const { reconcileOrderSync } = await import('../src/client/order-sync.js')
    await reconcileOrderSync()
    expect(calls).toHaveLength(1) // the GET only
    vi.advanceTimersByTime(2_000)
    expect(posts(calls)).toEqual([])
  })

  it('survives an unreachable host with the local stores untouched', async () => {
    window.localStorage.setItem(PROVIDER_ORDER_KEY, '["a"]')
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('down') }))
    const { reconcileOrderSync } = await import('../src/client/order-sync.js')
    const { providerOrder } = await import('../src/client/provider-order.js')
    await expect(reconcileOrderSync()).resolves.toBeUndefined()
    expect(providerOrder()).toEqual(['a'])
  })
})

describe('adopted switches survive a reload', () => {
  it('persists the disabled set the file brought, so the old one cannot come back and win', async () => {
    window.localStorage.setItem(PROVIDER_DISABLED_KEY, '["old"]')
    window.localStorage.setItem(ORDER_SAVED_AT_KEY, '100')
    stubFetch({ ok: true, data: { savedAt: 300, providerOrder: [], modelOrder: {}, providersDisabled: ['b'] } })
    const { reconcileOrderSync } = await import('../src/client/order-sync.js')
    const { isProviderEnabled } = await import('../src/client/provider-enabled.js')
    await reconcileOrderSync()
    expect(isProviderEnabled('b')).toBe(false)
    expect(isProviderEnabled('old')).toBe(true)
    // The write lands in localStorage, not just in the running page.
    expect(window.localStorage.getItem(PROVIDER_DISABLED_KEY)).toBe('["b"]')

    // A reload re-reads the stores from storage; the file's answer must be
    // what comes back, and the reconcile must then agree with the file rather
    // than push the pre-adoption set back over it.
    vi.resetModules()
    const calls = stubFetch({ ok: true, data: { savedAt: 300, providerOrder: [], modelOrder: {}, providersDisabled: ['b'] } })
    const fresh = await import('../src/client/order-sync.js')
    const reloaded = await import('../src/client/provider-enabled.js')
    expect(reloaded.disabledProviders()).toEqual(['b'])
    await fresh.reconcileOrderSync()
    vi.advanceTimersByTime(2_000)
    expect(posts(calls)).toEqual([])
  })
})

describe('stale push', () => {
  it('adopts the document that won when the host refuses an old stamp', async () => {
    window.localStorage.setItem(PROVIDER_DISABLED_KEY, '["stale"]')
    window.localStorage.setItem(ORDER_SAVED_AT_KEY, '100')
    const calls: FetchCall[] = []
    vi.stubGlobal('fetch', vi.fn(async (input: unknown, init?: { method?: string; body?: string }) => {
      const method = init?.method ?? 'GET'
      calls.push({ method, url: String(input), ...(init?.body === undefined ? {} : { body: JSON.parse(init.body) as Record<string, unknown> }) })
      if (method === 'GET') return { ok: false, status: 500, json: async () => ({ ok: false }) }
      // Another machine wrote this while the page was closed.
      return {
        ok: false,
        status: 409,
        json: async () => ({ ok: false, error: 'stale', data: { savedAt: 400, providerOrder: [], modelOrder: {}, providersDisabled: ['fresh'] } }),
      }
    }))
    const { reconcileOrderSync } = await import('../src/client/order-sync.js')
    const { isProviderEnabled } = await import('../src/client/provider-enabled.js')
    await reconcileOrderSync()
    await vi.advanceTimersByTimeAsync(0)
    expect(posts(calls)).toHaveLength(1)
    // The refused push did not leave the old switches in place: the winner was
    // adopted, stamp included, and nothing is retried.
    expect(isProviderEnabled('stale')).toBe(true)
    expect(isProviderEnabled('fresh')).toBe(false)
    expect(window.localStorage.getItem(PROVIDER_DISABLED_KEY)).toBe('["fresh"]')
    expect(window.localStorage.getItem(ORDER_SAVED_AT_KEY)).toBe('400')
    vi.advanceTimersByTime(2_000)
    expect(posts(calls)).toHaveLength(1)
  })
})

describe('later pulls', () => {
  it('picks up a newer document written by another machine without a reload', async () => {
    let answer: unknown = { ok: true, data: { savedAt: 100, providerOrder: ['a', 'b'], modelOrder: {}, providersDisabled: [] } }
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, status: 200, json: async () => answer })))
    const { startOrderSync, ORDER_POLL_MS } = await import('../src/client/order-sync.js')
    const { providerOrder } = await import('../src/client/provider-order.js')
    const dispose = startOrderSync()
    try {
      await vi.advanceTimersByTimeAsync(0)
      expect(providerOrder()).toEqual(['a', 'b'])
      answer = { ok: true, data: { savedAt: 200, providerOrder: ['b', 'a'], modelOrder: {}, providersDisabled: [] } }
      await vi.advanceTimersByTimeAsync(ORDER_POLL_MS)
      expect(providerOrder()).toEqual(['b', 'a'])
    } finally {
      dispose()
    }
  })
})

describe('change push', () => {
  it('stamps a change immediately and pushes it once, debounced', async () => {
    stubFetch()
    const { startOrderSync } = await import('../src/client/order-sync.js')
    const { setProviderOrder } = await import('../src/client/provider-order.js')
    const { setModelOrder } = await import('../src/client/model-order.js')
    const dispose = startOrderSync()
    try {
      setProviderOrder(['x', 'y'])
      // The stamp lands with the change, not with the push: a page closed
      // inside the debounce window still reads as the newer side next boot.
      const first = window.localStorage.getItem(ORDER_SAVED_AT_KEY)
      expect(first).toBe(String(Date.parse('2026-01-01T00:00:00Z')))
      setModelOrder('openai', ['m2', 'm1'])
      setProviderOrder(['x'])
      // Three edits inside one frozen millisecond still get three distinct
      // stamps: the file's arbitration is "strictly newer wins", so a burst
      // must not hand several changes the same instant.
      const last = window.localStorage.getItem(ORDER_SAVED_AT_KEY)
      expect(Number(last)).toBeGreaterThan(Number(first))
      vi.advanceTimersByTime(400)
      // Exactly one POST for the whole burst, carrying the final state and
      // the same stamp the change wrote — so file and localStorage agree.
      const calls = (fetch as ReturnType<typeof vi.fn>).mock.calls as Array<[string, { method?: string; body?: string }]>
      const pushed = calls.filter(([, init]) => init?.method === 'POST')
      expect(pushed).toHaveLength(1)
      expect(JSON.parse(pushed[0]![1].body!)).toEqual({
        savedAt: Number(last),
        providerOrder: ['x'],
        modelOrder: { openai: ['m2', 'm1'] },
        providersDisabled: [],
      })
    } finally {
      dispose()
    }
  })

  it('pushes a provider switched off like any other order change', async () => {
    stubFetch()
    const { startOrderSync } = await import('../src/client/order-sync.js')
    const { setProviderEnabled } = await import('../src/client/provider-enabled.js')
    const dispose = startOrderSync()
    try {
      setProviderEnabled('wb', false)
      vi.advanceTimersByTime(400)
      const calls = (fetch as ReturnType<typeof vi.fn>).mock.calls as Array<[string, { method?: string; body?: string }]>
      const pushed = calls.filter(([, init]) => init?.method === 'POST')
      expect(pushed).toHaveLength(1)
      expect(JSON.parse(pushed[0]![1].body!)).toMatchObject({ providersDisabled: ['wb'] })
    } finally {
      dispose()
    }
  })

  it('flushOrderSync lands a pending push at once, without a second one later', async () => {
    stubFetch()
    const { startOrderSync, flushOrderSync } = await import('../src/client/order-sync.js')
    const { setProviderOrder } = await import('../src/client/provider-order.js')
    const dispose = startOrderSync()
    try {
      setProviderOrder(['z'])
      flushOrderSync()
      const calls = (fetch as ReturnType<typeof vi.fn>).mock.calls as Array<[string, { method?: string }]>
      expect(calls.filter(([, init]) => init?.method === 'POST')).toHaveLength(1)
      vi.advanceTimersByTime(2_000)
      expect(calls.filter(([, init]) => init?.method === 'POST')).toHaveLength(1)
    } finally {
      dispose()
    }
  })

  it('a disposed sync pushes nothing', async () => {
    stubFetch()
    const { startOrderSync } = await import('../src/client/order-sync.js')
    const { setProviderOrder } = await import('../src/client/provider-order.js')
    const dispose = startOrderSync()
    dispose()
    setProviderOrder(['q'])
    vi.advanceTimersByTime(2_000)
    const calls = (fetch as ReturnType<typeof vi.fn>).mock.calls as Array<[string, { method?: string }]>
    expect(calls.filter(([, init]) => init?.method === 'POST')).toEqual([])
  })
})
