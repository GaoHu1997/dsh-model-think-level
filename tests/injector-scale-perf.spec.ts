// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { DEFAULT_EFFORT_FIELD, INPUT_IMAGE_GEN_MARKER, UNSET_MARKER } from '../src/constants.js'
import {
  createScanState,
  reconcile,
  releaseModelListRepins,
  stageEffortsInto,
  type EditorMountProps,
  type InjectorDeps,
  type MountedEditor,
  type ScanState,
  type SettingsJoin,
} from '../src/client/injection/models-page-editor.js'
import type { RemoteApi } from '../src/client/types.js'

vi.mock('react-dom/client', () => ({
  createRoot: vi.fn(() => ({ render: vi.fn(), unmount: vi.fn() })),
}))

function makeJoin(providers: Record<string, Record<string, unknown>>): SettingsJoin {
  const value = { providers } as NonNullable<SettingsJoin['namespace']>['value']
  return {
    writable: true,
    namespace: {
      ns: 'llm-pi-ai', autoGenerate: true, schema: {}, revision: 1,
      applies: 'live', secrets: [], value, user: value,
    },
  }
}

/** Like injector.spec's official DOM fixture, with arbitrarily many rows. */
function modelsDom(ids: readonly string[], route = 'acme', draft = false): { root: HTMLElement; card: HTMLElement } {
  const root = document.createElement('div')
  root.style.overflowY = 'auto'
  root.innerHTML = `<div class="rowCard"><div class="editor">
    <span class="editorTitle">${route}</span>
    ${draft ? `<div class="field"><input aria-label="Provider ID" value="${route}" /></div>
      <div class="field"><input aria-label="Base URL" value="https://example.com/v1" /></div>
      <div class="field"><select aria-label="API protocol"><option selected>openai</option></select></div>` : ''}
    <div class="modelList">${ids.map((id, index) => `<div class="modelEntry">
      <div class="modelRow"><input aria-label="Model ID ${index + 1}" value="${id}" />
        <button aria-label="Capacities ${index + 1}"></button></div>
      <div class="modelAdvanced"><label>Context window<input /></label></div>
    </div>`).join('')}</div>
    <div class="editorActions"><button>Cancel</button><button>Apply</button></div>
  </div></div>`
  document.body.append(root)
  return { root, card: root.querySelector<HTMLElement>('.editor')! }
}

interface FakeEditor {
  render: ReturnType<typeof vi.fn<(props: EditorMountProps) => void>>
  unmount: ReturnType<typeof vi.fn<() => void>>
}
const states: ScanState[] = []
function makeDeps(read: () => SettingsJoin) {
  const editors: FakeEditor[] = []
  const mount = vi.fn<(container: HTMLElement, props: EditorMountProps) => MountedEditor>((container) => {
    const marker = document.createElement('div')
    marker.dataset['plugin'] = 'dsh-model-think-level'
    container.append(marker)
    const editor = { render: vi.fn<(props: EditorMountProps) => void>(), unmount: vi.fn(() => { marker.remove() }) }
    editors.push(editor)
    return editor
  })
  const mutate = vi.fn()
  const api = {
    settings: {
      describe: vi.fn(async () => ({ ok: true, value: { writable: true, hasDocument: true, namespaces: [read().namespace!] } })),
      mutate,
    },
  } as unknown as RemoteApi
  const deps: InjectorDeps = {
    api,
    describeNamespace: vi.fn(async () => read()),
    t: key => key,
    labels: () => ({
      capacity: ['Capacities', 'Capacities 1', '容量'], modelId: ['Model ID'], modelName: ['Display name'],
      routeId: ['Provider ID'], baseUrl: ['Base URL'], apiProtocol: ['API protocol'],
      apply: ['Apply'], cancel: ['Cancel'], editProvider: ['Edit {provider}'], inputImage: ['Image'],
      contextWindow: ['Context window'], maxOutput: ['Max output'], addModel: ['Add model'],
    }),
    mount,
  }
  const state = createScanState()
  states.push(state)
  return { deps, state, mount, editors, mutate }
}

async function scan(root: HTMLElement, deps: InjectorDeps, state: ScanState): Promise<void> {
  reconcile(root, deps, state)
  await state.describePromise
  await Promise.resolve()
  await Promise.resolve()
}

beforeEach(() => {
  document.body.innerHTML = ''
  sessionStorage.clear()
  vi.restoreAllMocks()
  vi.useFakeTimers({ toFake: ['requestAnimationFrame', 'cancelAnimationFrame'] })
})
afterEach(() => {
  for (const state of states.splice(0)) {
    state.disposed = true
    for (const entry of state.mounted.values()) entry.editor.unmount()
    state.mounted.clear()
  }
  releaseModelListRepins()
  vi.useRealTimers()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('injector per-continuation scale budget', () => {
  it.each([20, 100, 500])('prepares %i expanded models linearly, including a no-op second scan', async n => {
    let idReads = 0
    const ids = Array.from({ length: n }, (_, index) => `model-${index}`)
    const models = ids.map(id => {
      const entry: Record<string, unknown> = { name: id, input: ['text'], compat: { supportsReasoningEffort: true } }
      Object.defineProperty(entry, 'id', { enumerable: true, get: () => { idReads += 1; return id } })
      return entry
    })
    const join = makeJoin({ acme: { models } })
    const { root, card } = modelsDom(ids)
    const { deps, state, mount, editors } = makeDeps(() => join)
    const filters = vi.spyOn(models, 'filter')
    const queries = vi.spyOn(Element.prototype, 'querySelectorAll')
    const measure = () => ({
      idReads,
      catalogueFilters: filters.mock.calls.length,
      elementQueries: queries.mock.calls.length,
      cardInputQueries: queries.mock.calls.filter(([selector], index) =>
        queries.mock.contexts[index] === card && selector === 'input[aria-label], select[aria-label]').length,
    })

    await scan(root, deps, state)
    const first = measure()
    expect(mount).toHaveBeenCalledTimes(n)
    expect(state.mounted.size).toBe(n)
    expect(first.idReads).toBeLessThanOrEqual(8 * n)
    expect(first.catalogueFilters).toBe(1)
    expect(first.elementQueries).toBeLessThanOrEqual(40 * n + 100)
    // No editorRoute tag: route discovery would otherwise re-read the entire
    // card's inputs for each expanded row. Constant per-card work is allowed.
    expect(first.cardInputQueries).toBeLessThanOrEqual(20)

    const live = new WeakSet(state.mounted.keys())
    let liveSetChecks = 0
    let liveContainersSet: Set<unknown> | undefined
    const OriginalSet = Set
    // Count only the set constructed from found containers. Spying on every
    // Set.has would also count jsdom's internal selector/ancestor sets.
    vi.stubGlobal('Set', class MeasuredSet<T> extends OriginalSet<T> {
      constructor(values?: Iterable<T> | null) {
        super(values)
        if (Array.isArray(values) && values.length === n
          && values.every(value => value instanceof HTMLElement && live.has(value))) {
          liveContainersSet = this
        }
      }
      override has(value: T): boolean {
        if (this === liveContainersSet) liveSetChecks += 1
        return super.has(value)
      }
    })
    idReads = 0
    filters.mockClear()
    queries.mockClear()
    mount.mockClear()
    await scan(root, deps, state)
    const settled = measure()
    expect(mount).not.toHaveBeenCalled()
    expect(editors.every(editor => editor.render.mock.calls.length === 0)).toBe(true)
    expect(settled.idReads).toBeLessThanOrEqual(8 * n)
    expect(settled.catalogueFilters).toBe(1)
    expect(settled.elementQueries).toBeLessThanOrEqual(40 * n + 100)
    expect(settled.cardInputQueries).toBeLessThanOrEqual(20)
    expect(liveSetChecks).toBe(n)
    console.info('[injector-scale]', { n, first, settled, liveSetChecks })
  }, 20_000)

  it('shares the saved catalogue across cards without merging duplicate DOM rows or accessor results', async () => {
    const models = [
      { id: 'same', name: 'First', reasoningEfforts: false, input: ['text'], compat: { supportsReasoningEffort: true }, [DEFAULT_EFFORT_FIELD]: 'low' },
      { id: 'same', name: 'Second', reasoningEfforts: { high: 'high' }, input: ['image'], [UNSET_MARKER]: true, [INPUT_IMAGE_GEN_MARKER]: true },
      { id: 7, name: 'Not string seven' },
    ]
    const join = makeJoin({ acme: { models } })
    modelsDom(['same'])
    modelsDom(['same', '7'])
    const { deps, state, mount } = makeDeps(() => join)
    const filters = vi.spyOn(models, 'filter')
    await scan(document.body, deps, state)
    expect(filters).toHaveBeenCalledTimes(1)
    expect(mount).toHaveBeenCalledTimes(3)
    const first = mount.mock.calls[0]![1]
    const second = mount.mock.calls[1]![1]
    for (const props of [first, second]) {
      expect(props.route).toBe('acme')
      expect(props.staged).toBe(false)
      expect(props.modelName).toBe('First')
      expect(props.efforts).toBe(false)
      expect(props.input).toEqual(['text'])
      expect(props.compat).toEqual({ supportsReasoningEffort: true })
      expect(props.defaultEffort).toBe('low')
      expect(props.imageGen).toBeUndefined()
      // Opt-out intentionally has some semantics, unlike first-entry find.
      expect(props.effortsUnset).toBe(true)
    }
    expect(first.input).not.toBe(second.input)
    expect(first.compat).not.toBe(second.compat)
    expect(mount.mock.calls[2]![1].staged).toBe(true)
  })

  it('memoizes an unresolved card, including rows visited by staging bookkeeping', async () => {
    const join = makeJoin({ acme: { models: [] } })
    const { root, card } = modelsDom(Array.from({ length: 20 }, (_, index) => `model-${index}`), 'unknown')
    const { deps, state, mount } = makeDeps(() => join)
    stageEffortsInto(state, 'acme', 'absent', { high: 'high' })
    const query = vi.spyOn(card, 'querySelector')
    await scan(root, deps, state)
    // autoEffortTargets remains independently per-card; the continuation's
    // pending/card/row paths all share one other lookup, even for undefined.
    expect(query.mock.calls.filter(([selector]) => selector === '[class*="editorRoute"]')).toHaveLength(2)
    expect(mount).not.toHaveBeenCalled()
  })

  it('keeps draft fields card-scoped and updates the route on the next continuation', async () => {
    const join = makeJoin({})
    const first = modelsDom(['model-0'], 'draft', true)
    const second = modelsDom(['model-0'], 'draft', true)
    second.card.querySelector<HTMLInputElement>('[aria-label="Base URL"]')!.value = 'https://second.example/v1'
    const { deps, state, mount, editors, mutate } = makeDeps(() => join)
    await scan(document.body, deps, state)
    expect(mount).toHaveBeenCalledTimes(2)
    expect(mount.mock.calls[0]![1].routeBaseURL).toBe('https://example.com/v1')
    expect(mount.mock.calls[1]![1].routeBaseURL).toBe('https://second.example/v1')
    first.card.querySelector<HTMLInputElement>('[aria-label="Provider ID"]')!.value = 'draft-next'
    await scan(document.body, deps, state)
    expect(mount).toHaveBeenCalledTimes(2)
    expect(editors[0]!.render).toHaveBeenCalledTimes(1)
    expect(editors[0]!.render.mock.calls[0]![0].route).toBe('draft-next')
    expect(editors[1]!.render).not.toHaveBeenCalled()
    expect(mutate).not.toHaveBeenCalled()
  })

  it('rebuilds the catalogue for a new snapshot and only refreshes changed rows', async () => {
    let join = makeJoin({ acme: { models: [{ id: 'model-0' }, { id: 'model-1' }] } })
    const { root } = modelsDom(['model-0', 'model-1'])
    const { deps, state, mount, editors } = makeDeps(() => join)
    await scan(root, deps, state)
    join = makeJoin({ acme: { models: [{ id: 'model-0', reasoningEfforts: { high: 'high' } }, { id: 'model-1' }] } })
    state.describePromise = undefined
    await scan(root, deps, state)
    expect(mount).toHaveBeenCalledTimes(2)
    expect(editors[0]!.render).toHaveBeenCalledTimes(1)
    expect(editors[0]!.render.mock.calls[0]![0].efforts).toEqual({ high: 'high' })
    expect(editors[1]!.render).not.toHaveBeenCalled()
  })

  it('keeps submit, cancel and the editor API staged check live between scans', async () => {
    const join = makeJoin({ acme: { models: [{ id: 'model-0' }] } })
    const { root, card } = modelsDom(['model-0'])
    const { deps, state, mount, mutate } = makeDeps(() => join)
    await scan(root, deps, state)
    const api = mount.mock.calls[0]![1].api
    const routeField = document.createElement('div')
    routeField.innerHTML = '<input aria-label="Provider ID" value="draft-live" />'
    card.prepend(routeField)
    // No reconcile: event-time route resolution must not use the prior memo.
    api.commit('draft-live', 'model-0', { efforts: { high: 'high' } })
    expect(state.pending.get('draft-live')?.has('model-0')).toBe(true)
    expect(state.queued.has('draft-live')).toBe(false)
    card.querySelector<HTMLButtonElement>('.editorActions button:last-child')!.click()
    expect(state.committing.has('draft-live')).toBe(true)
    card.querySelector<HTMLButtonElement>('.editorActions button:first-child')!.click()
    expect(state.pending.has('draft-live')).toBe(false)
    expect(state.committing.has('draft-live')).toBe(false)
    routeField.remove()
    api.commit('acme', 'model-0', { efforts: { low: 'low' } })
    expect(state.queued.get('acme')?.has('model-0')).toBe(true)
    expect(mutate).not.toHaveBeenCalled()
  })

  it.each([true, false])('skips layout reads for a single disclosure (row scope: %s)', async rowScope => {
    const join = makeJoin({ acme: { models: [{ id: 'model-0' }] } })
    const { root } = modelsDom(['model-0'])
    if (!rowScope) root.querySelector<HTMLElement>('.modelEntry')!.className = 'modelRecord'
    const container = root.querySelector<HTMLElement>('.modelAdvanced')!
    const offsetParent = vi.fn(() => null)
    Object.defineProperty(container, 'offsetParent', { configurable: true, get: offsetParent })
    const { deps, state, mount } = makeDeps(() => join)
    await scan(root, deps, state)
    expect(mount).toHaveBeenCalledTimes(1)
    expect(mount.mock.calls[0]![0]).toBe(container)
    expect(offsetParent).not.toHaveBeenCalled()
  })

  it('preserves visible-first and first-candidate fallback with multiple disclosures', async () => {
    const join = makeJoin({ acme: { models: [{ id: 'model-0' }] } })
    const { root } = modelsDom(['model-0'])
    const row = root.querySelector<HTMLElement>('.modelEntry')!
    const first = row.querySelector<HTMLElement>('.modelAdvanced')!
    const second = first.cloneNode(true) as HTMLElement
    row.append(second)
    Object.defineProperty(first, 'offsetParent', { configurable: true, get: () => null })
    Object.defineProperty(second, 'offsetParent', { configurable: true, get: () => row })
    const { deps, state, mount, editors } = makeDeps(() => join)
    await scan(root, deps, state)
    expect(mount.mock.calls[0]![0]).toBe(second)
    Object.defineProperty(second, 'offsetParent', { configurable: true, get: () => null })
    await scan(root, deps, state)
    expect(editors[0]!.unmount).toHaveBeenCalledTimes(1)
    expect(mount.mock.calls[1]![0]).toBe(first)
  })
})
