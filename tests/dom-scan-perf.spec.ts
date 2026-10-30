// @vitest-environment jsdom
// Performance regression guard for the Models-page scan cascade.
//
// The user-facing symptom this guards against: "很多地方慢，加载慢，删除供应商也慢".
// The cascade's cost is dominated by full-document traversals — `querySelectorAll`
// rooted at `document`/`document.body` — because the scan root is `document.body`
// and the page's class names are CSS-module hashes probed by substring selectors.
// A burst pays every pass TWICE (the synchronous microtask cascade and the
// debounced scan repeat the same passes).
//
// The metric counted here is deliberately browser-representative: jsdom's
// absolute milliseconds are much slower than a real browser, but the NUMBER of
// full-document walks per burst is identical, and it is the number a refactor
// can prove it reduced. Wall time is logged for visibility, budgeted loosely.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createModelsPage, type ModelsPageDeps, type ModelsPageInjection } from '../src/client/injection/models-page.js'
import type { RemoteApi, SettingsJoin } from '../src/client/types.js'

vi.mock('react-dom/client', () => ({
  createRoot: vi.fn(() => ({ render: vi.fn(), unmount: vi.fn() })),
}))

/** jsdom fetch is absent; the balance/key passes must not explode on it. */
const fetchMock = vi.fn(async () => ({
  ok: true,
  status: 200,
  json: async () => ({ ok: true, configured: false }),
}))

interface ScanTally {
  /** querySelectorAll/querySelector calls rooted at document or document.body. */
  documentWalks: number
  selectors: Map<string, number>
}

function tallyOf(): ScanTally {
  return { documentWalks: 0, selectors: new Map() }
}

let tally: ScanTally = tallyOf()
let spying = false

/**
 * Count every selector engine entry rooted at the document or document.body —
 * each one is a walk proportional to the WHOLE app DOM, which is the cost the
 * cascade multiplies. Nested scopes (row/card queries) are not counted.
 */
function startCounting(): void {
  stopCounting()
  tally = tallyOf()
  spying = true
  for (const proto of [Document.prototype, Element.prototype]) {
    for (const method of ['querySelectorAll', 'querySelector'] as const) {
      const original = (proto[method] as unknown) as (this: ParentNode, selector: string) => unknown
      vi.spyOn(proto, method).mockImplementation((function (this: ParentNode, selector: string) {
        if (spying && (this === document || this === document.body)) {
          tally.documentWalks += 1
          tally.selectors.set(selector, (tally.selectors.get(selector) ?? 0) + 1)
        }
        return original.call(this, selector)
      }) as never)
    }
  }
}

function stopCounting(): void {
  spying = false
  vi.restoreAllMocks()
}

function report(label: string): void {
  console.log(`[perf] ${label}: ${tally.documentWalks} full-document walks`)
  for (const [selector, count] of tally.selectors) {
    console.log(`[perf]   ${String(count).padStart(3)}× ${selector}`)
  }
}

class TestObserver {
  static instances: TestObserver[] = []
  observe = vi.fn()
  disconnect = vi.fn()
  constructor(readonly callback: MutationCallback) { TestObserver.instances.push(this) }
}

const join: SettingsJoin = {
  writable: true,
  namespace: {
    ns: 'llm-pi-ai', autoGenerate: true, schema: {}, revision: 1, applies: 'live', secrets: [],
    value: { providers: Object.fromEntries(Array.from({ length: 12 }, (_, i) => [`acme${i}`, { models: [{ id: 'qwen-max' }] }])) },
    user: {},
  },
}

function page(): ModelsPageInjection {
  const settings = {
    describe: vi.fn(async () => ({ ok: true, value: { writable: true, hasDocument: true, namespaces: [join.namespace!] } })),
    mutate: vi.fn(),
  }
  return createModelsPage({
    ctx: { locale: { bind: () => (key: string) => key } } as unknown as ModelsPageDeps['ctx'],
    api: { settings } as unknown as RemoteApi,
    t: (key: string) => key,
    onIdle: vi.fn(),
    refreshed: children => children(),
  })
}

const PROVIDERS = 12
const MODELS_PER_ROW = 3

/**
 * A Models-page-shaped DOM: 12 provider rows (each a `li.rowCard` with a head,
 * an Edit button and a 3-row model list, the first row carrying the OPEN
 * editor card), plus filler elements standing in for the rest of the app's
 * DOM — the walks this suite counts are proportional to THAT total, which is
 * why the filler is part of the fixture.
 */
function modelsDom(): void {
  const rows = Array.from({ length: PROVIDERS }, (_, p) => {
    const models = Array.from({ length: MODELS_PER_ROW }, (_, m) => `
      <li class="modelEntry">
        <input aria-label="Model ID ${p}-${m}" value="qwen-${p}-${m}" />
        <button aria-label="Capacities ${p}-${m}"></button>
        <div class="modelAdvanced"><label>Context window<input /></label></div>
      </li>`).join('')
    const openCard = p === 0
      ? `<div class="editor">
          <select aria-label="API protocol"><option>openai-completions</option></select>
          <input aria-label="Base URL" value="https://api.acme.test" />
          <span class="editorRoute">acme0</span>
          <ul class="modelList">${models}</ul>
          <div class="editorActions"><button>Cancel</button><button>Apply</button></div>
        </div>`
      : ''
    return `
      <li class="rowCard">
        <div class="rowHead">
          <span class="rowName">Acme ${p}</span>
          <button aria-label="Edit acme${p}"></button>
          <div class="rowActions"></div>
        </div>
        ${openCard}
      </li>`
  }).join('')
  const filler = Array.from({ length: 800 }, (_, i) => `<div class="chat-cell chat-cell-${i % 7}"><span>msg ${i}</span></div>`).join('')
  const host = document.createElement('div')
  host.innerHTML = `<h2>模型</h2><ul class="rows">${rows}</ul>`
  document.body.append(host)
  document.body.insertAdjacentHTML('beforeend', `<div class="chat-thread">${filler}</div>`)
}

function childList(nodes: Node[], target: Node = document.body): MutationRecord {
  return { type: 'childList', target, addedNodes: nodes, removedNodes: [] } as unknown as MutationRecord
}

/** Wait out the 120ms scan debounce and drain the microtasks it schedules. */
async function settle(): Promise<void> {
  await new Promise(resolve => setTimeout(resolve, 260))
  await Promise.resolve()
}

describe('Models-page scan cascade performance', () => {
  let instance: ModelsPageInjection
  let observer: TestObserver

  beforeEach(() => {
    document.body.innerHTML = ''
    sessionStorage.clear()
    vi.stubGlobal('fetch', fetchMock)
    vi.stubGlobal('MutationObserver', TestObserver)
    TestObserver.instances = []
    modelsDom()
    instance = page()
    startCounting()
    instance.start(() => {})
    observer = TestObserver.instances[0]!
  })

  afterEach(() => {
    stopCounting()
    instance.teardown()
    vi.unstubAllGlobals()
  })

  it('delete-provider burst stays within the full-document walk budget', async () => {
    // Startup scan first: its cost is the "加载慢" half of the complaint.
    await settle()
    report('startup scan')
    const startupWalks = tally.documentWalks

    const list = document.querySelector('ul.rows')!
    const removed = list.children[1]!
    // The burst a provider delete commits: the row leaves the list and the
    // host re-renders the survivors in place (one childList batch on the ul).
    startCounting()
    const start = performance.now()
    removed.remove()
    observer.callback([childList([removed], list)], observer as unknown as MutationObserver)
    await settle()
    const elapsed = performance.now() - start
    console.log(`[perf] delete burst wall time: ${elapsed.toFixed(0)}ms (jsdom-inflated)`)
    report('delete burst')

    // Budget: the burst must not take tens of document-wide walks. The 2026-10
    // review found ~45 (two full cascades × 8 rowsListOf + 6 reconcile sweeps +
    // the title search); the fix must land well under half of that.
    expect(tally.documentWalks).toBeLessThanOrEqual(30)
    expect(startupWalks).toBeGreaterThan(0)
  })

  it('settled page re-scan stays cheap', async () => {
    await settle()
    startCounting()
    const row = document.querySelector('.rowCard') as HTMLElement
    observer.callback([childList([], row)], observer as unknown as MutationObserver)
    await settle()
    report('settled burst')
    expect(tally.documentWalks).toBeLessThanOrEqual(30)
  })

  it('title-row search is cached once the page has settled', async () => {
    await settle()
    startCounting()
    for (let i = 0; i < 3; i += 1) {
      const row = document.querySelector('.rowCard') as HTMLElement
      observer.callback([childList([], row)], observer as unknown as MutationObserver)
      await settle()
    }
    report('3 settled bursts')
    // The heading did not move, so re-finding it across bursts must not
    // re-walk every element of every ancestor scope more than once.
    expect(tally.selectors.get('*') ?? 0).toBeLessThanOrEqual(1)
  })
})
