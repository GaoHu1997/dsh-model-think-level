// @vitest-environment jsdom
/** Isolated read-only audit probes; all APIs and storage use test doubles. */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import * as React from 'react'
import * as JSXRuntime from 'react/jsx-runtime'
import * as ReactDOM from 'react-dom'
import { readFileSync } from 'node:fs'
import { KeyManager } from '../src/client/KeyManager.js'
import { revealKeyField, resetKeyField } from '../src/client/injection/key-reveal.js'
import { EffortEditor, type EffortEditorProps } from '../src/client/EffortEditor.js'
import { HeadersEditor } from '../src/client/HeadersEditor.js'
import { createComposerMenu } from '../src/client/injection/composer-menu.js'
import { createDragState, reconcileRows, teardownDrags, type DragAdapter } from '../src/client/injection/row-drag.js'
import { directoryFixture } from '../tests/support/composer-fixture.js'
import type { EffortEditorApi, PendingWrite, RemoteApi } from '../src/client/types.js'

;(globalThis as Record<string, unknown>)['IS_REACT_ACT_ENVIRONMENT'] = true
const roots: Root[] = []
const disposers: (() => void)[] = []
const evidence: Record<string, unknown>[] = []
const record = (kind: string, details: Record<string, unknown>): void => {
  evidence.push({ kind, ...details })
  console.log('AUDIT_EVIDENCE', JSON.stringify(evidence.at(-1)))
}
const t = (key: string): string => key

beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn(async () => ({ json: async () => ({ ok: false }) })))
})
afterEach(async () => {
  await act(async () => { for (const dispose of disposers.splice(0)) dispose(); for (const root of roots.splice(0)) root.unmount() })
  document.body.innerHTML = ''
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

async function mount(child: ReturnType<typeof createElement>): Promise<HTMLElement> {
  const container = document.createElement('div')
  document.body.appendChild(container)
  await act(async () => { const root = createRoot(container); roots.push(root); root.render(child) })
  return container
}
async function type(input: HTMLInputElement, value: string): Promise<void> {
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, value)
    input.dispatchEvent(new Event('input', { bubbles: true }))
  })
}
async function select(input: HTMLSelectElement, value: string): Promise<void> {
  await act(async () => { input.value = value; input.dispatchEvent(new Event('change', { bubbles: true })) })
}
function seam(): EffortEditorApi & { commit: ReturnType<typeof vi.fn> } {
  return {
    suggest: vi.fn(async () => ({ ok: false, error: 'no-suggestion' } as const)),
    commit: vi.fn(), withdraw: vi.fn(),
    writeEfforts: vi.fn(async () => ({ ok: true } as const)),
    stageEfforts: vi.fn(),
  }
}
function props(api: EffortEditorApi, extra: Partial<EffortEditorProps>): EffortEditorProps {
  return { route: 'audit', routeDisplayName: 'Audit', modelId: 'test', index: 0, efforts: { high: 'high' }, api, readOnly: false, t, ...extra }
}
function writes(api: ReturnType<typeof seam>): PendingWrite[] {
  return api.commit.mock.calls.map(call => call[2]) as PendingWrite[]
}

function rootMenu(): HTMLElement {
  const menu = document.createElement('div')
  menu.setAttribute('role', 'menu')
  menu.innerHTML = '<button role="menuitem">Model</button><button role="menuitem">Effort</button>'
  document.body.appendChild(menu)
  return menu
}

describe('audit: compat controls report preceding render', () => {
  it('budget picker shows the new choice but queues the old one', async () => {
    const api = seam()
    const node = await mount(createElement(EffortEditor, props(api, { routeApi: 'openai-completions', compat: { thinkingTokenBudgetField: 'thinking_token_budget' } })))
    const picker = node.querySelector<HTMLSelectElement>('select[aria-label="budgetFieldLabel 1"]')!
    await select(picker, 'thinking_budget')
    const write = writes(api).at(-1)!
    expect(picker.value).toBe('thinking_budget')
    expect(write.compat?.thinkingTokenBudgetField).toBe('thinking_token_budget')
    record('stale-budget', { visible: picker.value, queued: write })
  })
  it('priority text is one event behind, including the final digit', async () => {
    const api = seam()
    const node = await mount(createElement(EffortEditor, props(api, { routeApi: 'openai-completions', compat: { vllmPriority: 0 } })))
    const input = node.querySelector<HTMLInputElement>('input[aria-label="priorityLabel 1"]')!
    await type(input, '1')
    await type(input, '12')
    const write = writes(api).at(-1)!
    expect(input.value).toBe('12')
    expect(write.compat?.vllmPriority).toBe(1)
    record('stale-priority', { visible: input.value, queued: write, all: writes(api) })
  })
  it('responses switch displays false but queues true', async () => {
    const api = seam()
    const node = await mount(createElement(EffortEditor, props(api, { routeApi: 'openai-responses', compat: { supportsMaxOutputTokens: true } })))
    const picker = node.querySelector<HTMLSelectElement>('select[aria-label="maxOutputLabel 1"]')!
    await select(picker, 'false')
    const write = writes(api).at(-1)!
    expect(picker.value).toBe('false')
    expect(write.compat?.supportsMaxOutputTokens).toBe(true)
    record('stale-max-output', { visible: picker.value, queued: write })
  })
})

describe('audit: header draft identities', () => {
  it('the first added row aliases a second stored header, edits and deletes both', async () => {
    const mutate = vi.fn(async () => ({ ok: true, value: {} }))
    const api = { settings: { describe: async () => ({ ok: true, value: { writable: true, namespaces: [{ ns: 'llm-pi-ai', user: { providers: { audit: { headers: { 'x-first': '1', 'x-second': '2' } } } }, value: {}, base: {}, revision: 7 }] } }), mutate } } as unknown as RemoteApi
    const node = await mount(createElement(HeadersEditor, { route: 'audit', api, t }))
    await act(async () => { node.querySelector<HTMLButtonElement>('.bre-headers-disclosure')!.click() })
    await act(async () => { Array.from(node.querySelectorAll('button')).find(b => b.textContent === 'headersEdit')!.click() })
    await act(async () => { node.querySelector<HTMLButtonElement>('.bre-headers-add')!.click() })
    let names = Array.from(node.querySelectorAll<HTMLInputElement>('input.bre-headers-name'))
    expect(names).toHaveLength(3)
    await type(names[2]!, 'x-added')
    names = Array.from(node.querySelectorAll<HTMLInputElement>('input.bre-headers-name'))
    expect(names.map(n => n.value)).toEqual(['x-first', 'x-added', 'x-added'])
    const afterEdit = names.map(n => n.value)
    await act(async () => { node.querySelectorAll<HTMLButtonElement>('.bre-headers-remove')[2]!.click() })
    const afterRemove = Array.from(node.querySelectorAll<HTMLInputElement>('input.bre-headers-name')).map(n => n.value)
    expect(afterRemove).toEqual(['x-first'])
    await act(async () => { Array.from(node.querySelectorAll('button')).find(b => b.textContent === 'headersSave')!.click() })
    const saved = (mutate.mock.calls[0] as unknown[])[1]
    record('header-id-collision', { afterEdit, afterRemove, saved })
  })
})

describe('audit: composer lifecycle', () => {
  it('disposal of an open root menu removes the replacement but leaves official rows hidden', async () => {
    const menu = rootMenu()
    const directory = directoryFixture()
    const composer = createComposerMenu({ menuOf: () => menu, triggerOf: () => undefined, t, refreshed: f => f(), sliderEnabled: () => true, directory: () => directory })
    disposers.push(composer.dispose)
    await act(async () => { composer.reconcile() })
    expect(menu.querySelector('[data-bre-slider]')).not.toBeNull()
    await act(async () => { composer.dispose() })
    const rows = Array.from(menu.querySelectorAll<HTMLElement>('button[role="menuitem"]'))
    expect(menu.querySelector('[data-bre-slider]')).toBeNull()
    expect(rows.map(row => row.style.display)).toEqual(['none', 'none'])
    expect(menu.classList.contains('bre-model-menu-host')).toBe(true)
    record('blank-menu-after-dispose', { replacement: menu.querySelector('[data-bre-slider]') !== null, officialDisplay: rows.map(row => row.style.display), hostClass: menu.className })
  })
  it('a retained open menu keeps the old session directory after the active directory switches', async () => {
    const menu = rootMenu()
    const first = directoryFixture()
    const second = directoryFixture()
    second.update({ ...second.store.getSnapshot(), current: { provider: 'beta', model: 'b-model', reasoningEffort: 'high' }, groups: [{ id: 'beta', name: 'Beta', models: [{ id: 'b-model', name: 'Beta Model', reasoning: { defaultEffort: 'high', efforts: [{ id: 'high', name: 'High' }] } }] }] })
    let current = first
    const composer = createComposerMenu({ menuOf: () => menu, triggerOf: () => undefined, t, refreshed: f => f(), sliderEnabled: () => true, directory: () => current })
    disposers.push(composer.dispose)
    await act(async () => { composer.reconcile() })
    current = second
    await act(async () => { composer.reconcile() })
    const body = menu.querySelector<HTMLElement>('.bre-slider-body')!
    expect(body.textContent).toContain('Qwen Max')
    expect(body.textContent).not.toContain('Beta Model')
    const row = body.querySelector<HTMLButtonElement>('button.bre-row-control')!
    await act(async () => { row.click() })
    record('stale-session-directory', { currentModel: second.store.getSnapshot().current?.model, displayed: body.textContent })
  })
})

describe('audit: drag listeners across HMR', () => {
  it('old provider header/list listeners remain active after teardown and remount', () => {
    const list = document.createElement('ul')
    list.innerHTML = '<li data-id="a"><div class="head">A</div></li><li data-id="b"><div class="head">B</div></li>'
    document.body.appendChild(list)
    const firstCommit = vi.fn()
    const secondCommit = vi.fn()
    const makeAdapter = (commit: () => void): DragAdapter => ({ rowOf: n => n.closest('li') ?? undefined, idOf: r => r.dataset['id'], labelOf: r => r.dataset['id'], order: ids => ids, commit, seatOf: r => r.querySelector<HTMLElement>('.head') ?? undefined, seatDrags: true, gripLabel: (_, id) => id, gripHint: () => 'drag' })
    const firstState = createDragState()
    reconcileRows(list, list, makeAdapter(firstCommit), firstState)
    teardownDrags(firstState)
    const secondState = createDragState()
    reconcileRows(list, list, makeAdapter(secondCommit), secondState)
    const head = list.querySelector<HTMLElement>('.head')!
    head.dispatchEvent(new Event('dragstart', { bubbles: true, cancelable: true }))
    list.dispatchEvent(new Event('drop', { bubbles: true, cancelable: true }))
    expect(firstState.drag).toBeDefined()
    expect(firstCommit).toHaveBeenCalledOnce()
    expect(secondCommit).toHaveBeenCalledOnce()
    record('retained-drag-listeners', { retiredDragActive: firstState.drag !== undefined, retiredCommits: firstCommit.mock.calls.length, currentCommits: secondCommit.mock.calls.length })
    teardownDrags(secondState)
    teardownDrags(firstState)
  })
})

describe('audit: default model panel search', () => {
  it('opening the default replica model panel never mounts the search box', async () => {
    const menu = rootMenu()
    const directory = directoryFixture()
    const composer = createComposerMenu({ menuOf: () => menu, triggerOf: () => undefined, t, refreshed: f => f(), sliderEnabled: () => true, directory: () => directory })
    disposers.push(composer.dispose)
    await act(async () => { composer.reconcile() })
    await act(async () => { menu.querySelector<HTMLButtonElement>('button.bre-row-control')!.click() })
    await act(async () => { composer.reconcile() })
    expect(menu.querySelector('.bre-panel-models')).not.toBeNull()
    expect(menu.querySelectorAll('.bre-provider-models .bre-option').length).toBeGreaterThan(0)
    expect(menu.querySelector('section[role="group"]')).toBeNull()
    expect(menu.querySelector('input.bre-search-input')).toBeNull()
    record('no-search-in-default-model-panel', { panelOpen: menu.querySelector('.bre-panel-models') !== null, models: menu.querySelectorAll('.bre-provider-models .bre-option').length, searchInputs: menu.querySelectorAll('input.bre-search-input').length })
  })
})

function installedHostModelSelect(): React.ComponentType<Record<string, unknown>> {
  const source = readFileSync('D:/work/dsh-model-think-level/node_modules/@deepseek-ai/dsh-client-ui-model-selection/lib/client.js', 'utf8')
    .replace('exports.ModelDirectory = ModelDirectory;', 'exports.AuditModelSelect = ModelSelect; exports.ModelDirectory = ModelDirectory;')
  let factory: ((require: (name: string) => unknown) => Record<string, unknown>) | undefined
  const fakeWindow = { __ModuleLoader__: { load: (payload: { factory: typeof factory }): void => { factory = payload.factory } } }
  new Function('window', source)(fakeWindow)
  const primitives = new Proxy({
    MenuSurface: React.forwardRef<HTMLDivElement, Record<string, unknown>>((props, ref) => createElement('div', { ...props, ref })),
  }, { get: (obj, key) => key === 'MenuSurface' ? obj.MenuSurface : (() => null) })
  const dependencies: Record<string, unknown> = {
    '@deepseek-ai/dsh-client-ui-primitives': primitives,
    '@deepseek-ai/cordis': { Service: class {} },
    '@deepseek-ai/dsh-client-store': {},
    'react/jsx-runtime': JSXRuntime,
    react: React,
    'react-dom': ReactDOM,
  }
  const exported = factory!((name) => { if (!(name in dependencies)) throw new Error('unexpected host dependency ' + name); return dependencies[name] })
  return exported['AuditModelSelect'] as React.ComponentType<Record<string, unknown>>
}

describe('audit: installed host integration', () => {
  it('Tab from the trigger is intercepted and targets the hidden original cell', async () => {
    const Host = installedHostModelSelect()
    const directory = directoryFixture()
    const node = await mount(createElement(Host, { locked: false, available: true, directory: directory.store, load: () => {}, select: directory.select, t }))
    const trigger = node.querySelector<HTMLButtonElement>('button[aria-haspopup="menu"]')!
    await act(async () => { trigger.click() })
    const menu = document.querySelector<HTMLElement>('[role="menu"]')!
    const composer = createComposerMenu({ menuOf: () => menu, triggerOf: () => trigger, t, refreshed: f => f(), sliderEnabled: () => true, directory: () => directory })
    disposers.push(composer.dispose)
    await act(async () => { composer.reconcile() })
    const officialRows = Array.from(menu.children).filter(el => el.getAttribute('role') === 'menuitem') as HTMLButtonElement[]
    const hiddenFocus = vi.fn()
    // jsdom permits focusing display:none elements. Simulate the browser no-op
    // while preserving an exact count of the real host handler's targets.
    for (const row of officialRows) row.focus = hiddenFocus
    await act(async () => { trigger.focus() })
    const tab = new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true })
    await act(async () => { trigger.dispatchEvent(tab) })
    expect(tab.defaultPrevented).toBe(true)
    expect(hiddenFocus).toHaveBeenCalledOnce()
    expect(document.activeElement).toBe(trigger)
    const arrow = new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true, cancelable: true })
    await act(async () => { trigger.dispatchEvent(arrow) })
    expect(arrow.defaultPrevented).toBe(true)
    expect(hiddenFocus).toHaveBeenCalledTimes(2)
    record('keyboard-hidden-root-cells', { tabPrevented: tab.defaultPrevented, arrowPrevented: arrow.defaultPrevented, hiddenFocusTargets: hiddenFocus.mock.calls.length, focusRemainsTrigger: document.activeElement === trigger })
  })
})

describe('audit: reveal cleanup', () => {
  it('a pending read can unmask and write after teardown of a still-attached field', async () => {
    const field = document.createElement('label')
    field.innerHTML = '<input type="password" value="">'
    document.body.appendChild(field)
    const input = field.querySelector<HTMLInputElement>('input')!
    let resolve!: (value: string | undefined) => void
    const loadKey = vi.fn(() => new Promise<string | undefined>(done => { resolve = done }))
    revealKeyField(field, { t, route: 'audit', loadKey })
    field.querySelector<HTMLButtonElement>('.bre-key-eye')!.click()
    expect(loadKey).toHaveBeenCalledOnce()
    resetKeyField(field)
    expect(input.type).toBe('password')
    resolve('FAKE-AUDIT-KEY')
    await Promise.resolve()
    await Promise.resolve()
    expect(input.type).toBe('text')
    expect(input.value).toBe('FAKE-AUDIT-KEY')
    record('pending-reveal-after-cleanup', { eyeStillExists: field.querySelector('.bre-key-eye') !== null, finalType: input.type, fakeValuePresent: input.value === 'FAKE-AUDIT-KEY' })
  })
})
