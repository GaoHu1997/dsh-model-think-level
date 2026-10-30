// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createRoot } from 'react-dom/client'
import { createModelsPage, type ModelsPageDeps, type ModelsPageInjection } from '../src/client/injection/models-page.js'
import { pinModelListCards } from '../src/client/injection/models-page-editor.js'
import type { RemoteApi, SettingsJoin } from '../src/client/types.js'

vi.mock('react-dom/client', () => ({
  createRoot: vi.fn(() => ({ render: vi.fn(), unmount: vi.fn() })),
}))

const join: SettingsJoin = {
  writable: true,
  namespace: {
    ns: 'llm-pi-ai', autoGenerate: true, schema: {}, revision: 1,
    applies: 'live', secrets: [],
    value: { providers: { acme: { models: [{ id: 'qwen-max' }] } } },
    user: { providers: { acme: { models: [{ id: 'qwen-max' }] } } },
  },
}

class TestObserver {
  static instances: TestObserver[] = []
  observe = vi.fn()
  disconnect = vi.fn()
  constructor(readonly callback: MutationCallback) { TestObserver.instances.push(this) }
  deliver(records: MutationRecord[] = [{ type: 'childList', target: document.body, addedNodes: document.body.childNodes, removedNodes: [] } as unknown as MutationRecord]): void {
    this.callback(records, this as unknown as MutationObserver)
  }
}

const pages: ModelsPageInjection[] = []
function page(api?: RemoteApi): ModelsPageInjection {
  const settings = {
    describe: vi.fn(async () => ({ ok: true, value: { writable: true, hasDocument: true, namespaces: [join.namespace!] } })),
    mutate: vi.fn(),
  }
  const result = createModelsPage({
    ctx: { locale: { bind: () => (key: string) => key } } as unknown as ModelsPageDeps['ctx'],
    api: api ?? { settings } as unknown as RemoteApi,
    t: (key: string) => key,
    onIdle: vi.fn(),
    refreshed: children => children(),
  })
  pages.push(result)
  return result
}

function modelsDom(): HTMLElement {
  const host = document.createElement('div')
  host.style.overflowY = 'auto'
  host.style.overflowAnchor = 'auto'
  Object.defineProperty(host, 'scrollHeight', { configurable: true, value: 2000 })
  Object.defineProperty(host, 'clientHeight', { configurable: true, value: 600 })
  host.innerHTML = `<div class="rowCard"><div class="editor">
    <span class="editorTitle">acme</span>
    <div class="modelList"><div class="modelEntry">
      <input aria-label="Model ID 1" value="qwen-max" />
      <button aria-label="Capacities 1"></button>
      <div class="modelAdvanced"><label>Context window<input /></label></div>
    </div></div>
  </div></div>`
  document.body.append(host)
  return host
}

beforeEach(() => {
  document.body.innerHTML = ''
  sessionStorage.clear()
  vi.clearAllMocks()
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'requestAnimationFrame', 'cancelAnimationFrame', 'Date', 'performance'] })
  TestObserver.instances = []
  vi.stubGlobal('MutationObserver', TestObserver)
})
afterEach(async () => {
  for (const instance of pages.splice(0)) instance.teardown()
  await Promise.resolve()
  vi.useRealTimers()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('models page lifecycle', () => {
  it('removes editor wrappers so a replacement page can mount into the same disclosure', async () => {
    const host = modelsDom()
    const first = page()
    first.start(vi.fn())
    await vi.advanceTimersByTimeAsync(120)
    expect(host.querySelectorAll('.bre-effort-slot')).toHaveLength(1)
    expect(first.state.mounted.size).toBe(1)

    first.teardown()
    expect(host.querySelector('.bre-effort-slot')).toBeNull()

    const second = page()
    second.start(vi.fn())
    await vi.advanceTimersByTimeAsync(120)
    expect(host.querySelectorAll('.bre-effort-slot')).toHaveLength(1)
    expect(second.state.mounted.size).toBe(1)
    expect(createRoot).toHaveBeenCalledTimes(2)
  })

  it('restores every live pin and cancels its frames when the page tears down', () => {
    const firstHost = modelsDom()
    const secondHost = modelsDom()
    const instance = page()
    instance.start(vi.fn())
    const cancel = vi.spyOn(window, 'cancelAnimationFrame')
    const remove = vi.spyOn(document, 'removeEventListener')
    pinModelListCards(document.body)
    expect(firstHost.style.overflowAnchor).toBe('none')
    expect(secondHost.style.overflowAnchor).toBe('none')

    instance.teardown()
    expect(firstHost.style.overflowAnchor).toBe('auto')
    expect(secondHost.style.overflowAnchor).toBe('auto')
    expect(cancel).toHaveBeenCalledTimes(2)
    for (const event of ['wheel', 'touchstart', 'pointerdown', 'keydown']) {
      expect(remove.mock.calls.filter(([type]) => type === event).length).toBeGreaterThanOrEqual(2)
    }
    expect(vi.getTimerCount()).toBe(0)
  })

  it('does not mount an editor when a describe resolves after teardown', async () => {
    const host = modelsDom()
    let resolve!: (value: unknown) => void
    const describe = vi.fn(() => new Promise(done => { resolve = done }))
    const instance = page({ settings: { describe, mutate: vi.fn() } } as unknown as RemoteApi)
    instance.start(vi.fn())
    await vi.advanceTimersByTimeAsync(120)
    expect(describe).toHaveBeenCalledTimes(1)
    instance.teardown()
    resolve({ ok: true, value: { writable: true, hasDocument: true, namespaces: [join.namespace!] } })
    await vi.advanceTimersByTimeAsync(0)
    expect(host.querySelector('.bre-effort-slot')).toBeNull()
    expect(instance.state.mounted.size).toBe(0)
    expect(createRoot).not.toHaveBeenCalled()
  })

  it('keeps observing and scanning when the startup composer hook throws', async () => {
    const host = modelsDom()
    const error = vi.spyOn(console, 'error').mockImplementation(() => {})
    const instance = page()
    const hook = vi.fn(() => { throw new Error('composer unavailable') })
    expect(() => { instance.start(hook) }).not.toThrow()
    expect(TestObserver.instances[0]?.observe).toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(120)
    expect(host.querySelector('.bre-effort-slot')).not.toBeNull()
    expect(error).toHaveBeenCalledWith('[bre] models page startup failed:', expect.any(Error))
  })

  it('does not rescan Models for unrelated streaming or foreign-root commits', async () => {
    const host = modelsDom()
    const instance = page()
    const hook = vi.fn()
    instance.start(hook)
    await vi.advanceTimersByTimeAsync(120)
    const query = vi.spyOn(document.body, 'querySelectorAll')
    const chat = document.createElement('div')
    chat.textContent = 'streaming'
    document.body.append(chat)
    query.mockClear()
    const own = host.querySelector('.bre-effort-slot')!
    for (let i = 0; i < 100; i++) {
      TestObserver.instances[0]!.deliver([
        { type: 'childList', target: chat, addedNodes: [document.createTextNode('token')], removedNodes: [] } as unknown as MutationRecord,
        { type: 'childList', target: own, addedNodes: [document.createElement('span')], removedNodes: [] } as unknown as MutationRecord,
      ])
    }
    expect(hook.mock.calls.length).toBeGreaterThanOrEqual(100)
    await vi.advanceTimersByTimeAsync(240)
    expect(query).not.toHaveBeenCalled()
  })

  it('still decorates a newly opened disclosure synchronously', async () => {
    const instance = page()
    instance.start(vi.fn())
    await vi.advanceTimersByTimeAsync(120)
    const host = modelsDom()
    TestObserver.instances[0]!.deliver([
      { type: 'childList', target: document.body, addedNodes: [host], removedNodes: [] } as unknown as MutationRecord,
    ])
    await Promise.resolve()
    await Promise.resolve()
    expect(host.querySelector('.bre-effort-slot')).not.toBeNull()
  })

  it('contains a mutation-hook exception and still schedules the next scan', async () => {
    const host = modelsDom()
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const instance = page()
    const hook = vi.fn()
    instance.start(hook)
    await vi.advanceTimersByTimeAsync(120)
    const oldContainer = host.querySelector('.modelAdvanced')!
    const replacement = document.createElement('div')
    replacement.className = 'modelAdvanced'
    oldContainer.replaceWith(replacement)
    hook.mockImplementationOnce(() => { throw new Error('transient hook') })
    expect(() => { TestObserver.instances[0]!.deliver() }).not.toThrow()
    await vi.advanceTimersByTimeAsync(120)
    expect(replacement.querySelector('.bre-effort-slot')).not.toBeNull()
  })
})
