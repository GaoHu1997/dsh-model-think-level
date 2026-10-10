/**
 * Per-provider model ordering tests.
 *
 * Three layers, because the feature is a wire between three of them:
 *   - the stored map (`model-order.ts`): parsing, the no-op that keeps the
 *     snapshot identity, the merge that leaves an un-dragged model in place;
 *   - the model rows inside one provider's editor (`model-order-drag.ts`):
 *     finding the list, naming a row by its id input, mounting the grip in the
 *     official grid, the drag and keyboard paths, and the teardown;
 *   - the composer column (`ComposerSlider`): the switcher reports the very
 *     order the settings page set, per provider, including a change made while
 *     it is open.
 */

// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, createElement } from 'react'
import { createRoot } from 'react-dom/client'
import {
  MODEL_ORDER_KEY,
  modelOrderOf,
  modelOrders,
  orderModelEntries,
  orderModels,
  parseModelOrders,
  resolveModelOrder,
  setModelOrder,
  subscribeModelOrders,
  syncModelOrders,
} from '../src/client/model-order.js'
import {
  createModelOrderState,
  modelListMutation,
  modelListsOf,
  reconcileModelOrder,
  teardownModelOrder,
} from '../src/client/injection/model-order-drag.js'
import { officialModelPage } from './support/model-fixture.js'
import { ComposerSlider } from '../src/client/ComposerSlider.js'
import type { HostLabels } from '../src/client/injection/models-page-editor.js'
import type { ModelDirectoryLike, ModelDirectoryStateLike } from '../src/client/types.js'

;(globalThis as Record<string, unknown>)['IS_REACT_ACT_ENVIRONMENT'] = true

/** The English anchors, as `models-page.ts` resolves them. */
const LABELS: HostLabels = {
  capacity: ['Capacities'],
  modelId: ['Model ID'],
  modelName: ['Display name'],
  routeId: ['Provider ID'],
  baseUrl: ['Base URL'],
  apiProtocol: ['API protocol'],
  apply: ['Apply'],
  cancel: ['Cancel'],
  editProvider: ['Edit {provider}'],
}

/** The drag module's dependencies with a translator that echoes its key. */
function deps(labels: HostLabels = LABELS): { t: (key: string, params?: Record<string, string | number>) => string; labels: () => HostLabels } {
  return {
    t: (key: string, params?: Record<string, string | number>) =>
      params === undefined ? key : key + ':' + String(params['model'] ?? ''),
    labels: () => labels,
  }
}

/** Every grip on the page, in DOM order. */
function grips(): HTMLElement[] {
  return Array.from(document.querySelectorAll<HTMLElement>('.bre-drag-grip'))
}

/** The model entries of a list, in the sequence they screen. */
function shownModels(list: HTMLElement): (string | undefined)[] {
  const rows = Array.from(list.children).filter((child): child is HTMLElement => child instanceof HTMLElement)
  return rows
    .map(row => ({ row, order: row.style.order === '' ? 0 : Number.parseInt(row.style.order, 10) }))
    .sort((left, right) => left.order - right.order)
    .map(entry => entry.row.getAttribute('data-bre-row-model') ?? undefined)
}

function drag(type: string, target: Element, clientY?: number): void {
  const event = clientY === undefined
    ? new Event(type, { bubbles: true })
    : new MouseEvent(type, { bubbles: true, clientY })
  target.dispatchEvent(event)
}

/** Give a row a measurable box so the drop side (above/below the midline) is decidable. */
function measure(row: Element, top: number, height: number): void {
  ;(row as HTMLElement).getBoundingClientRect = () => ({
    top, bottom: top + height, height, left: 0, right: 0, width: 100, x: 0, y: top,
    toJSON: () => ({}),
  }) as DOMRect
}

beforeEach(() => {
  document.body.innerHTML = ''
  // The store is module-level state shared by every case in this file: reset it
  // through the no-persist path so one case cannot seed the next.
  window.localStorage.clear()
  syncModelOrders({})
  vi.restoreAllMocks()
})

afterEach(() => {
  document.body.innerHTML = ''
})

describe('model order store', () => {
  it('parses only clean sequences of non-empty ids, per provider', () => {
    expect(parseModelOrders(JSON.stringify({ aliyun: ['a', 'b', 'a', ''], other: ['c'] })))
      .toEqual({ aliyun: ['a', 'b'], other: ['c'] })
    expect(parseModelOrders('not json')).toEqual({})
    expect(parseModelOrders(JSON.stringify(['a']))).toEqual({})
    expect(parseModelOrders(JSON.stringify({ aliyun: 'a', other: ['c'] }))).toEqual({ other: ['c'] })
    // A provider whose sequence emptied is not an order at all.
    expect(parseModelOrders(JSON.stringify({ aliyun: [] }))).toEqual({})
    expect(parseModelOrders(null)).toEqual({})
  })

  it('stores one provider at a time, and persists the whole map', () => {
    setModelOrder('aliyun', ['c', 'b', 'a'])
    expect(modelOrderOf('aliyun')).toEqual(['c', 'b', 'a'])
    setModelOrder('moonshot', ['kimi'])
    expect(JSON.parse(window.localStorage.getItem(MODEL_ORDER_KEY) as string))
      .toEqual({ aliyun: ['c', 'b', 'a'], moonshot: ['kimi'] })
    // Clearing a provider removes its key rather than storing an empty list.
    setModelOrder('moonshot', [])
    expect(JSON.parse(window.localStorage.getItem(MODEL_ORDER_KEY) as string)).toEqual({ aliyun: ['c', 'b', 'a'] })
    expect(parseModelOrders(window.localStorage.getItem(MODEL_ORDER_KEY))).toEqual({ aliyun: ['c', 'b', 'a'] })
  })

  it('keeps the snapshot identity when nothing would change', () => {
    setModelOrder('aliyun', ['c', 'b'])
    const snapshot = modelOrders()
    const listener = vi.fn()
    const dispose = subscribeModelOrders(listener)
    setModelOrder('aliyun', ['c', 'b'])
    expect(listener).not.toHaveBeenCalled()
    expect(modelOrders()).toBe(snapshot)
    // A provider that was never stored stays absent on a no-op clear.
    setModelOrder('never', [])
    expect(listener).not.toHaveBeenCalled()
    setModelOrder('aliyun', ['b', 'c'])
    expect(listener).toHaveBeenCalledTimes(1)
    expect(modelOrders()).not.toBe(snapshot)
    dispose()
  })

  it('applies another tab’s map without persisting it', () => {
    syncModelOrders({ aliyun: ['b', 'a'] })
    expect(modelOrderOf('aliyun')).toEqual(['b', 'a'])
    expect(window.localStorage.getItem(MODEL_ORDER_KEY)).toBeNull()
  })

  it('permutes the named ids among their slots and ignores unknown ones', () => {
    expect(orderModels(['a', 'b', 'c'], ['c', 'a'])).toEqual(['c', 'b', 'a'])
    // An id the directory no longer holds neither moves nor takes a slot: the
    // named models still swap into the slots they themselves hold.
    expect(orderModels(['a', 'b', 'c'], ['x', 'c', 'a'])).toEqual(['c', 'b', 'a'])
    // One named model cannot permute anything.
    expect(orderModels(['a', 'b', 'c'], ['x', 'c'])).toEqual(['a', 'b', 'c'])
    expect(orderModels(['a', 'b'], [])).toEqual(['a', 'b'])
    expect(resolveModelOrder('aliyun', ['a', 'b'])).toEqual(['a', 'b'])
    setModelOrder('aliyun', ['b', 'a'])
    expect(resolveModelOrder('aliyun', ['a', 'b'])).toEqual(['b', 'a'])
    // A never-dragged provider keeps the directory's own order.
    expect(resolveModelOrder('other', ['a', 'b'])).toEqual(['a', 'b'])
  })

  it('folds whole entries without rebuilding them', () => {
    const entries = [{ id: 'a', name: 'A' }, { id: 'b', name: 'B' }, { id: 'c', name: 'C' }]
    const reordered = orderModelEntries(entries, ['c', 'a'])
    expect(reordered.map(entry => entry.id)).toEqual(['c', 'b', 'a'])
    // The very same objects come back, in a new array.
    expect(reordered[0]).toBe(entries[2])
    expect(orderModelEntries(entries, [])).toBe(entries)
  })
})

describe('model rows inside a provider editor', () => {
  it('finds the model list but not the fragments that merely share its name', () => {
    const { list } = officialModelPage('aliyun', [{ id: 'a' }, { id: 'b' }])
    const head = document.createElement('div')
    head.className = '_3nPmjq_modelListHead'
    head.textContent = 'Models'
    list.before(head)
    const empty = document.createElement('div')
    empty.className = '_3nPmjq_modelList'
    document.body.appendChild(empty)
    expect(modelListsOf(document.body)).toEqual([list])
  })

  it('names each row by its id input and mounts the grip in the official grid', () => {
    const { list } = officialModelPage('aliyun', [
      { id: 'qwen-max', name: 'Qwen Max' },
      { id: '', name: 'New model' },
    ])
    reconcileModelOrder(document.body, deps(), createModelOrderState())
    const [first, second] = Array.from(list.children) as HTMLElement[]
    const grid = (first as HTMLElement).querySelector<HTMLElement>('[class*="modelRow"]') as HTMLElement
    expect(grid.classList.contains('bre-model-grid')).toBe(true)
    // Not `bre-model-row`: that is the plugin's own composer row, and its
    // padding/gap/hover fill must not leak onto the host's grid.
    expect(grid.classList.contains('bre-model-row')).toBe(false)
    const grip = grid.firstElementChild as HTMLElement
    expect(grip.classList.contains('bre-drag-grip')).toBe(true)
    expect(grip.getAttribute('aria-label')).toBe('modelReorderAria:Qwen Max')
    expect(grip.getAttribute('draggable')).toBe('true')
    // The GRID drags nothing on its own: the row is a grid of inputs.
    expect(grid.getAttribute('draggable')).toBeNull()
    // A row whose id input is still blank has no name, so it has no grip and is
    // never moved.
    expect(second?.getAttribute('data-bre-row-model')).toBeNull()
    expect((second as HTMLElement).querySelector('.bre-drag-grip')).toBeNull()
    expect(grips()).toHaveLength(1)
  })

  it('places the rows in the order stored for that provider', () => {
    const aliyun = officialModelPage('aliyun', [{ id: 'a' }, { id: 'b' }, { id: 'c' }])
    const moonshot = officialModelPage('moonshot', [{ id: 'a' }, { id: 'b' }, { id: 'c' }])
    setModelOrder('aliyun', ['c', 'a'])
    reconcileModelOrder(document.body, deps(), createModelOrderState())
    expect(shownModels(aliyun.list)).toEqual(['c', 'b', 'a'])
    // Another provider's list holds the same ids and keeps the host's own order.
    expect(shownModels(moonshot.list)).toEqual(['a', 'b', 'c'])
    // A sequence stored for a provider that is not on screen moves nothing here.
    setModelOrder('aliyun', [])
    setModelOrder('never', ['c', 'a'])
    reconcileModelOrder(document.body, deps(), createModelOrderState())
    expect(shownModels(moonshot.list)).toEqual(['a', 'b', 'c'])
  })

  it('leaves a list alone when its provider cannot be named', () => {
    const { list } = officialModelPage('aliyun', [{ id: 'a' }], { stamped: false, editLabel: 'Something else' })
    reconcileModelOrder(document.body, deps(), createModelOrderState())
    expect(grips()).toHaveLength(0)
    expect(list.children[0]?.getAttribute('data-bre-row-model')).toBeNull()
  })

  it('stores the sequence a drop proposed, under that provider', () => {
    const { list } = officialModelPage('aliyun', [{ id: 'a' }, { id: 'b' }, { id: 'c' }])
    const state = createModelOrderState()
    reconcileModelOrder(document.body, deps(), state)
    const [a, b, c] = Array.from(list.children) as HTMLElement[]
    measure(c as HTMLElement, 0, 20)
    drag('dragstart', grips()[0] as HTMLElement)
    // The pointer is in C's upper half, so A lands BEFORE C — read against the
    // rows that remain once A is lifted out of them.
    drag('dragover', c as HTMLElement, 5)
    expect(shownModels(list)).toEqual(['b', 'a', 'c'])
    drag('drop', c as HTMLElement, 5)
    drag('dragend', grips()[0] as HTMLElement)
    expect(JSON.parse(window.localStorage.getItem(MODEL_ORDER_KEY) as string)).toEqual({ aliyun: ['b', 'a', 'c'] })
    // The rows stay where they were dropped.
    expect(shownModels(list)).toEqual(['b', 'a', 'c'])
    expect(b?.classList.contains('bre-row-drop-target')).toBe(false)
    expect(a?.classList.contains('bre-row-dragging')).toBe(false)
  })

  it('abandons a drag that never landed, storing nothing', () => {
    const { list } = officialModelPage('aliyun', [{ id: 'a' }, { id: 'b' }, { id: 'c' }])
    const state = createModelOrderState()
    reconcileModelOrder(document.body, deps(), state)
    const c = list.children[2] as HTMLElement
    measure(c, 0, 20)
    drag('dragstart', grips()[0] as HTMLElement)
    drag('dragover', c, 5)
    expect(shownModels(list)).toEqual(['b', 'a', 'c'])
    drag('dragend', grips()[0] as HTMLElement)
    expect(shownModels(list)).toEqual(['a', 'b', 'c'])
    expect(window.localStorage.getItem(MODEL_ORDER_KEY)).toBeNull()
  })

  it('reorders with the keyboard and keeps the focus on the grip', () => {
    const { list } = officialModelPage('aliyun', [{ id: 'a' }, { id: 'b' }])
    reconcileModelOrder(document.body, deps(), createModelOrderState())
    const grip = grips()[0] as HTMLElement
    grip.focus()
    grip.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }))
    expect(shownModels(list)).toEqual(['b', 'a'])
    expect(document.activeElement).toBe(grip)
    expect(JSON.parse(window.localStorage.getItem(MODEL_ORDER_KEY) as string)).toEqual({ aliyun: ['b', 'a'] })
    grip.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowUp', bubbles: true }))
    expect(shownModels(list)).toEqual(['a', 'b'])
  })

  it('re-reads the id of a row the user renamed', () => {
    const { list } = officialModelPage('aliyun', [{ id: 'a' }, { id: 'b' }])
    const state = createModelOrderState()
    reconcileModelOrder(document.body, deps(), state)
    setModelOrder('aliyun', ['b', 'a'])
    reconcileModelOrder(document.body, deps(), state)
    expect(shownModels(list)).toEqual(['b', 'a'])
    // The official editor re-renders the input, not the entry: the new id has to
    // reach the stamp, or the stored sequence would name a model that is gone.
    const first = list.children[0] as HTMLElement
    ;(first.querySelector('input[aria-label^="Model ID"]') as HTMLInputElement).value = 'a2'
    reconcileModelOrder(document.body, deps(), state)
    expect(first.getAttribute('data-bre-row-model')).toBe('a2')
    expect(shownModels(list)).toEqual(['b', 'a2'])
  })

  it('hands the page back on teardown', () => {
    const { list } = officialModelPage('aliyun', [{ id: 'a' }, { id: 'b' }])
    const state = createModelOrderState()
    setModelOrder('aliyun', ['b', 'a'])
    reconcileModelOrder(document.body, deps(), state)
    expect(shownModels(list)).toEqual(['b', 'a'])
    teardownModelOrder(state)
    expect(grips()).toHaveLength(0)
    expect(document.querySelectorAll('[data-bre-row-model]')).toHaveLength(0)
    expect(document.querySelectorAll('.bre-model-grid')).toHaveLength(0)
    for (const child of Array.from(list.children) as HTMLElement[]) {
      expect(child.style.order).toBe('')
      expect(child.style.transition).toBe('')
      expect(child.style.transform).toBe('')
    }
  })
})

describe('composer model column', () => {
  /** One provider holding three models, current on the middle one. */
  function composerFixture(): ModelDirectoryLike {
    const groups = ([
      {
        id: 'aliyun',
        name: 'Aliyun',
        models: [
          { id: 'qwen-max', name: 'Qwen Max' },
          { id: 'qwen-plus', name: 'Qwen Plus' },
          { id: 'qwen-turbo', name: 'Qwen Turbo' },
        ],
      },
      { id: 'moonshot', name: 'Moonshot', models: [{ id: 'kimi', name: 'Kimi' }] },
    ] as unknown) as ModelDirectoryStateLike['groups']
    const base: ModelDirectoryStateLike = {
      current: { provider: 'aliyun', model: 'qwen-plus' },
      routable: true,
      groups,
      failures: [],
      status: 'ready',
      pending: null,
      error: null,
    }
    const listeners = new Set<() => void>()
    return {
      store: {
        getSnapshot: () => base,
        subscribe: (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener) } },
      },
      load: vi.fn(async () => base),
      select: vi.fn(async () => ({ ok: true, value: undefined })),
    } as unknown as ModelDirectoryLike
  }

  /** Mount the body, open the model column and report the models it shows. */
  async function modelColumn(): Promise<{ root: ReturnType<typeof createRoot>; names: () => (string | undefined)[] }> {
    const container = document.createElement('div')
    document.body.appendChild(container)
    const root = createRoot(container)
    await act(async () => {
      root.render(createElement(ComposerSlider, {
        directory: composerFixture(),
        t: (key: string) => key,
      }))
    })
    await act(async () => {
      ;(container.querySelector('.bre-row-control') as HTMLElement).click()
    })
    return {
      root,
      names: () => Array.from(container.querySelectorAll('.bre-provider-models .bre-option'))
        .map(el => el.querySelector('.bre-option-name')?.textContent ?? undefined),
    }
  }

  it('lists the models in the directory order when nothing has been dragged', async () => {
    const { root, names } = await modelColumn()
    expect(names()).toEqual(['Qwen Max', 'Qwen Plus', 'Qwen Turbo'])
    await act(async () => { root.unmount() })
  })

  it('follows the order set on the Models page, live', async () => {
    const { root, names } = await modelColumn()
    await act(async () => { setModelOrder('aliyun', ['qwen-turbo', 'qwen-max']) })
    expect(names()).toEqual(['Qwen Turbo', 'Qwen Plus', 'Qwen Max'])
    // An external (cross-tab) change reaches an already-open switcher too.
    await act(async () => { syncModelOrders({ aliyun: ['qwen-plus', 'qwen-turbo'] }) })
    expect(names()).toEqual(['Qwen Max', 'Qwen Plus', 'Qwen Turbo'])
    await act(async () => { root.unmount() })
  })
})

describe('modelListMutation — the guard for the synchronous order pass', () => {
  /**
   * Real MutationRecords, collected the way the injector's observer collects
   * them: observe `body` (childList+subtree), mutate, then await a macrotask —
   * jsdom delivers the callback in a microtask, so the queue is drained by then.
   */
  function burstOf(): { records: MutationRecord[]; flush: () => Promise<void>; stop: () => void } {
    const records: MutationRecord[] = []
    const observer = new MutationObserver(list => { records.push(...list) })
    observer.observe(document.body, { childList: true, subtree: true })
    return {
      records,
      flush: () => new Promise<void>(resolve => { setTimeout(resolve, 0) }),
      stop: () => { observer.disconnect() },
    }
  }

  const entryOf = (list: HTMLElement, index: number): HTMLElement => list.children[index] as HTMLElement

  it('fires when the host removes or adds a model row', async () => {
    const { list } = officialModelPage('aliyun', [{ id: 'a' }, { id: 'b' }, { id: 'c' }])
    const burst = burstOf()
    // The host's index-keyed commit of a delete: the LAST element leaves.
    entryOf(list, 2).remove()
    await burst.flush()
    expect(modelListMutation(burst.records)).toBe(true)
    burst.records.length = 0
    // And an add-model: a new blank entry appears.
    const added = document.createElement('div')
    added.className = '_3nPmjq_modelEntry'
    list.appendChild(added)
    await burst.flush()
    expect(modelListMutation(burst.records)).toBe(true)
    burst.stop()
  })

  it('stays quiet for this plugin’s own inserts inside a row', async () => {
    const { list } = officialModelPage('aliyun', [{ id: 'a' }, { id: 'b' }])
    const burst = burstOf()
    const entry = entryOf(list, 0)
    const seat = entry.querySelector<HTMLElement>('[class*="modelRow"]')!
    // A grip into the grid, and an editor slot into the disclosure: neither is
    // a row, so neither may re-arm the synchronous pass.
    seat.insertBefore(document.createElement('span'), seat.firstChild)
    entry.querySelector<HTMLElement>('[class*="modelAdvanced"]')!.appendChild(document.createElement('div'))
    await burst.flush()
    expect(modelListMutation(burst.records)).toBe(false)
    burst.stop()
  })

  it('stays quiet for the list HEAD, which shares the class fragment', async () => {
    const { list } = officialModelPage('aliyun', [{ id: 'a' }])
    const head = document.createElement('div')
    head.className = '_3nPmjq_modelListHead'
    const card = list.parentElement as HTMLElement
    card.insertBefore(head, list)
    const burst = burstOf()
    head.appendChild(document.createElement('span'))
    await burst.flush()
    expect(modelListMutation(burst.records)).toBe(false)
    burst.stop()
  })
})
