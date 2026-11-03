// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
const BEFORE = 'dsh-webdav-sync:before-snapshot'
const APPLIED = 'dsh-webdav-sync:applied'
let dispose: (() => void) | undefined
beforeEach(() => { vi.resetModules(); localStorage.clear(); vi.useFakeTimers(); vi.setSystemTime(1000) })
afterEach(() => { dispose?.(); dispose = undefined; vi.useRealTimers(); vi.unstubAllGlobals() })
const response = (data: unknown) => ({ ok: true, status: 200, json: async () => ({ ok: true, data }) })
const empty = { savedAt: 0, providerOrder: [], modelOrder: {}, providersDisabled: [] }

it('hands off a pending drag only after its POST has finished, without a duplicate push', async () => {
  let finish!: () => void
  const landing = new Promise<void>(resolve => { finish = resolve })
  const fetcher = vi.fn(async (_url: unknown, init?: RequestInit) => {
    if (init?.method === 'POST') { await landing; return response(null) }
    return response(empty)
  })
  vi.stubGlobal('fetch', fetcher)
  const sync = await import('../src/client/order-sync.js')
  const { setProviderOrder } = await import('../src/client/provider-order.js')
  dispose = sync.startOrderSync()
  await vi.advanceTimersByTimeAsync(0)
  setProviderOrder(['b', 'a'])
  const tasks: Promise<void>[] = []
  window.dispatchEvent(new CustomEvent(BEFORE, { detail: { waitUntil: (task: Promise<void>) => tasks.push(task) } }))
  let settled = false
  const handoff = Promise.all(tasks).then(() => { settled = true })
  await vi.advanceTimersByTimeAsync(0)
  expect(tasks).toHaveLength(1)
  expect(settled).toBe(false)
  expect(fetcher.mock.calls.filter(([, init]) => init?.method === 'POST')).toHaveLength(1)
  finish()
  await handoff
  await vi.advanceTimersByTimeAsync(400)
  expect(settled).toBe(true)
  expect(fetcher.mock.calls.filter(([, init]) => init?.method === 'POST')).toHaveLength(1)
})

it('immediately adopts synchronized provider order, model order and switches into persistent stores', async () => {
  let data = { savedAt: 100, providerOrder: ['a', 'b'], modelOrder: { b: ['one', 'two'] }, providersDisabled: ['b'] }
  vi.stubGlobal('fetch', vi.fn(async () => response(data)))
  const sync = await import('../src/client/order-sync.js')
  dispose = sync.startOrderSync()
  await vi.advanceTimersByTimeAsync(0)
  data = { savedAt: 200, providerOrder: ['b', 'a'], modelOrder: { b: ['two', 'one'] }, providersDisabled: ['a'] }
  window.dispatchEvent(new Event(APPLIED))
  await vi.advanceTimersByTimeAsync(0)
  expect(localStorage.getItem('dsh-model-think-level.provider-order')).toBe('["b","a"]')
  expect(localStorage.getItem('dsh-model-think-level.model-order')).toBe('{"b":["two","one"]}')
  expect(localStorage.getItem('dsh-model-think-level.providers.disabled')).toBe('["a"]')
  expect(localStorage.getItem('dsh-model-think-level.order-saved-at')).toBe('200')
})

it('rejects the snapshot handoff if the order POST could not be saved', async () => {
  vi.stubGlobal('fetch', vi.fn(async (_url: unknown, init?: RequestInit) => init?.method === 'POST'
    ? { ok: false, status: 500, json: async () => ({ ok: false }) } : response(empty)))
  const sync = await import('../src/client/order-sync.js')
  const { setProviderOrder } = await import('../src/client/provider-order.js')
  dispose = sync.startOrderSync()
  await vi.advanceTimersByTimeAsync(0)
  setProviderOrder(['b', 'a'])
  await expect(sync.settleOrderSync()).rejects.toThrow('模型顺序和启停尚未保存')
})

it('does not erase a newer local drag when an earlier POST returns a conflict', async () => {
  let rejectOld!: (answer: unknown) => void
  const first = new Promise(resolve => { rejectOld = resolve })
  let count = 0
  vi.stubGlobal('fetch', vi.fn(async (_url: unknown, init?: RequestInit) => {
    if (init?.method !== 'POST') return response(empty)
    count += 1
    return count === 1 ? first : response(null)
  }))
  const sync = await import('../src/client/order-sync.js')
  const { setProviderOrder, providerOrder } = await import('../src/client/provider-order.js')
  dispose = sync.startOrderSync()
  await vi.advanceTimersByTimeAsync(0)
  setProviderOrder(['first'])
  sync.flushOrderSync()
  setProviderOrder(['latest'])
  rejectOld({ ok: false, status: 409, json: async () => ({ data: { ...empty, savedAt: 1000, providerOrder: ['remote'] } }) })
  await vi.advanceTimersByTimeAsync(0)
  expect(providerOrder()).toEqual(['latest'])
  await sync.settleOrderSync()
  expect(providerOrder()).toEqual(['latest'])
  expect(count).toBe(2)
})

it('retries an unsaved previous-generation push instead of reporting a false handoff success', async () => {
  let failOld!: (error: Error) => void
  const oldPush = new Promise((_resolve, reject) => { failOld = reject })
  let data: unknown = empty
  let posts = 0
  vi.stubGlobal('fetch', vi.fn(async (_url: unknown, init?: RequestInit) => {
    if (init?.method !== 'POST') return response(data)
    posts += 1
    if (posts === 1) return oldPush
    data = JSON.parse(String(init.body))
    return response(data)
  }))
  const sync = await import('../src/client/order-sync.js')
  const { setProviderOrder, providerOrder } = await import('../src/client/provider-order.js')
  dispose = sync.startOrderSync()
  await vi.advanceTimersByTimeAsync(0)
  setProviderOrder(['unsaved'])
  sync.flushOrderSync()
  dispose()
  dispose = sync.startOrderSync()
  failOld(new Error('old push never landed'))
  await vi.advanceTimersByTimeAsync(0)
  await sync.settleOrderSync()
  expect(posts).toBe(2)
  expect(data).toMatchObject({ providerOrder: ['unsaved'] })
  expect(providerOrder()).toEqual(['unsaved'])
})

it('ignores a conflict body that finishes parsing after disposal', async () => {
  let finish!: (value: unknown) => void
  const body = new Promise(resolve => { finish = resolve })
  vi.stubGlobal('fetch', vi.fn(async (_url: unknown, init?: RequestInit) => init?.method === 'POST'
    ? { ok: false, status: 409, json: () => body } : response(empty)))
  const sync = await import('../src/client/order-sync.js')
  const { setProviderOrder, providerOrder } = await import('../src/client/provider-order.js')
  dispose = sync.startOrderSync()
  await vi.advanceTimersByTimeAsync(0)
  setProviderOrder(['local'])
  sync.flushOrderSync()
  await vi.advanceTimersByTimeAsync(0)
  dispose()
  finish({ data: { ...empty, savedAt: 1000, providerOrder: ['stale-response'] } })
  await vi.advanceTimersByTimeAsync(0)
  expect(providerOrder()).toEqual(['local'])
  expect(localStorage.getItem('dsh-model-think-level.provider-order')).toBe('["local"]')
})

it('removes the optional handoff listeners when disposed', async () => {
  const fetcher = vi.fn(async () => response(empty))
  vi.stubGlobal('fetch', fetcher)
  const sync = await import('../src/client/order-sync.js')
  dispose = sync.startOrderSync()
  await vi.advanceTimersByTimeAsync(0)
  dispose()
  const before = fetcher.mock.calls.length
  const register = vi.fn()
  window.dispatchEvent(new CustomEvent(BEFORE, { detail: { waitUntil: register } }))
  window.dispatchEvent(new Event(APPLIED))
  await vi.advanceTimersByTimeAsync(0)
  expect(register).not.toHaveBeenCalled()
  expect(fetcher.mock.calls).toHaveLength(before)
})
