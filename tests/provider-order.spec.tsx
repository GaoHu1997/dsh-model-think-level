/**
 * Provider ordering tests.
 *
 * Three layers, because the feature is a wire between three of them:
 *   - the stored sequence (`provider-order.ts`): parsing, pinning, the merge
 *     that keeps un-dragged providers in their natural slots;
 *   - the Models-page rows (`provider-order-drag.ts`): naming a row, mounting
 *     the grip, placing rows with CSS `order`, the drag and keyboard paths, and
 *     the teardown that leaves the official page as it was;
 *   - the composer column (`ComposerSlider`): the switcher reports the very
 *     order the settings page set, including a change made while it is open.
 */

// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, createElement } from 'react'
import { createRoot } from 'react-dom/client'
import {
  PROVIDER_ORDER_KEY,
  baseProviderOrder,
  mergeProviderOrder,
  moveToIndex,
  parseProviderOrder,
  providerOrder,
  resolveProviderOrder,
  setProviderOrder,
  subscribeProviderOrder,
  syncProviderOrder,
} from '../src/client/provider-order.js'
import {
  applyRowOrder,
  createProviderOrderState,
  dropIndex,
  edgeScrollStep,
  idFromTargetLabel,
  makeGhost,
  orderedRowIds,
  providerIdOfRow,
  reconcileProviderOrder,
  rowsListOf,
  scrollHostOf,
  teardownProviderOrder,
  visualRows,
} from '../src/client/injection/provider-order-drag.js'
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
      params === undefined ? key : key + ':' + String(params['provider'] ?? ''),
    labels: () => labels,
  }
}

interface RowSpec {
  /** The route the row belongs to. */
  id: string
  /** The displayed name (defaults to the route). */
  name?: string
  /** Whether the plugin's own slot stamps the route on the row. */
  stamped?: boolean
  /** An aria-label that does NOT follow the official template. */
  foreignLabel?: string
}

/**
 * One provider row as the official section renders it: a row card in a flex
 * column, with a header holding the name and the action buttons, plus the
 * plugin's own stamped slot where an llm-pi-ai card would carry it.
 */
function officialPage(rows: readonly RowSpec[]): HTMLElement {
  const list = document.createElement('ul')
  list.className = '_3nPmjq_rows'
  for (const spec of rows) {
    const name = spec.name ?? spec.id
    const card = document.createElement('li')
    card.className = '_3nPmjq_rowCard'
    const head = document.createElement('div')
    head.className = '_3nPmjq_rowHead'
    const identity = document.createElement('span')
    identity.className = '_3nPmjq_rowIdentity'
    const nameEl = document.createElement('span')
    nameEl.className = '_3nPmjq_rowName'
    nameEl.textContent = name
    identity.appendChild(nameEl)
    head.appendChild(identity)
    const actions = document.createElement('span')
    actions.className = '_3nPmjq_rowActions'
    const edit = document.createElement('button')
    edit.setAttribute('aria-label', spec.foreignLabel ?? `Edit ${name === spec.id ? spec.id : `${name} (${spec.id})`}`)
    actions.appendChild(edit)
    head.appendChild(actions)
    card.appendChild(head)
    if (spec.stamped === true) {
      const slot = document.createElement('div')
      slot.className = 'bre-headers-host'
      slot.setAttribute('data-bre-provider', spec.id)
      card.appendChild(slot)
    }
    list.appendChild(card)
  }
  document.body.appendChild(list)
  return list
}

/** The rows of the official list, in the sequence they screen. */
function shownRows(list: HTMLElement): (string | undefined)[] {
  return visualRows(list).map(row => row.querySelector<HTMLElement>('[class*="rowName"]')?.textContent ?? undefined)
}

/** Every grip on the page, in DOM order. */
function grips(): HTMLElement[] {
  return Array.from(document.querySelectorAll<HTMLElement>('.bre-drag-grip'))
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
  syncProviderOrder([])
  vi.restoreAllMocks()
})

afterEach(() => {
  document.body.innerHTML = ''
  vi.useRealTimers()
})

describe('provider order store', () => {
  it('parses only a clean sequence of non-empty ids', () => {
    expect(parseProviderOrder(JSON.stringify(['a', 'b', 'a', '']))).toEqual(['a', 'b'])
    expect(parseProviderOrder('not json')).toEqual([])
    expect(parseProviderOrder(JSON.stringify({ a: 1 }))).toEqual([])
    expect(parseProviderOrder(JSON.stringify([1, 'a', null]))).toEqual(['a'])
    expect(parseProviderOrder(null)).toEqual([])
  })

  it('pins the two official routes first and keeps the rest in arrival order', () => {
    expect(baseProviderOrder(['x', 'deepseek-official', 'y', 'deepseek-account']))
      .toEqual(['deepseek-account', 'deepseek-official', 'x', 'y'])
    expect(baseProviderOrder(['b', 'a'])).toEqual(['b', 'a'])
  })

  it('permutes the named ids among the slots they occupy and ignores unknown ones', () => {
    expect(mergeProviderOrder(['a', 'b', 'c'], ['c', 'a'])).toEqual(['c', 'b', 'a'])
    // A provider the user has never seen is not invented, and not exiled either.
    expect(mergeProviderOrder(['a', 'b'], ['brand-new', 'a'])).toEqual(['a', 'b'])
    // Everything named, reversed.
    expect(mergeProviderOrder(['a', 'b', 'c'], ['c', 'b', 'a'])).toEqual(['c', 'b', 'a'])
  })

  it('resolves the ids against the stored preference', () => {
    expect(resolveProviderOrder(['a', 'b', 'c'])).toEqual(['a', 'b', 'c'])
    setProviderOrder(['c', 'a'])
    expect(resolveProviderOrder(['a', 'b', 'c'])).toEqual(['c', 'b', 'a'])
    expect(providerOrder()).toEqual(['c', 'a'])
  })

  it('persists on set, notifies subscribers, and follows an external sync without writing', () => {
    const seen = vi.fn()
    const dispose = subscribeProviderOrder(seen)
    setProviderOrder(['b', 'a'])
    expect(seen).toHaveBeenCalledTimes(1)
    expect(window.localStorage.getItem(PROVIDER_ORDER_KEY)).toBe(JSON.stringify(['b', 'a']))
    // Same sequence: no write, no notify.
    setProviderOrder(['b', 'a'])
    expect(seen).toHaveBeenCalledTimes(1)
    // An external (cross-tab) value applies without persisting it back.
    window.localStorage.removeItem(PROVIDER_ORDER_KEY)
    syncProviderOrder(['a'])
    expect(providerOrder()).toEqual(['a'])
    expect(window.localStorage.getItem(PROVIDER_ORDER_KEY)).toBeNull()
    expect(seen).toHaveBeenCalledTimes(2)
    dispose()
    setProviderOrder(['z'])
    expect(seen).toHaveBeenCalledTimes(2)
  })

  it('moves an item to an index read against the RESULT', () => {
    expect(moveToIndex(['a', 'b', 'c'], 'a', 2)).toEqual(['b', 'c', 'a'])
    expect(moveToIndex(['a', 'b', 'c'], 'c', 0)).toEqual(['c', 'a', 'b'])
    expect(moveToIndex(['a', 'b', 'c'], 'a', 99)).toEqual(['b', 'c', 'a'])
    expect(moveToIndex(['a', 'b', 'c'], 'missing', 0)).toEqual(['a', 'b', 'c'])
  })
})

describe('provider row identity', () => {
  it('reads the route out of the official providerTargetLabel forms', () => {
    expect(idFromTargetLabel('DeepSeek (deepseek-official)')).toBe('deepseek-official')
    expect(idFromTargetLabel('minimax-cn')).toBe('minimax-cn')
    // A display name that itself carries parentheses: the route is the last group.
    expect(idFromTargetLabel('Weird (Name) (route)')).toBe('route')
    // Whitespace with no parenthesized route is a display name, not a route.
    expect(idFromTargetLabel('DeepSeek Chat')).toBeUndefined()
    expect(idFromTargetLabel('')).toBeUndefined()
  })

  it('prefers the stamp our own slot carries', () => {
    const list = officialPage([{ id: 'aliyun', name: 'Aliyun', stamped: true }])
    const row = list.children[0] as HTMLElement
    ;(row.querySelector('button') as HTMLElement).setAttribute('aria-label', 'Edit Something Else (other)')
    expect(providerIdOfRow(row, LABELS)).toBe('aliyun')
  })

  it('falls back to the localized Edit label, and ignores labels of our own DOM', () => {
    const list = officialPage([{ id: 'deepseek-official', name: 'DeepSeek' }])
    const row = list.children[0] as HTMLElement
    expect(providerIdOfRow(row, LABELS)).toBe('deepseek-official')
    // A Chinese page resolves the Chinese template.
    expect(providerIdOfRow(row, { ...LABELS, editProvider: ['编辑 {provider}'] })).toBeUndefined()
    ;(row.querySelector('button') as HTMLElement).setAttribute('aria-label', '编辑 DeepSeek (deepseek-official)')
    expect(providerIdOfRow(row, { ...LABELS, editProvider: ['编辑 {provider}'] })).toBe('deepseek-official')
    // A label inside the plugin's own seat is never the page's edit button.
    const host = document.createElement('div')
    host.className = 'bre-headers-host'
    const foreign = document.createElement('button')
    foreign.setAttribute('aria-label', 'Edit Fake (fake)')
    host.appendChild(foreign)
    row.appendChild(host)
    ;(row.querySelector('button') as HTMLElement).setAttribute('aria-label', 'Not a provider label')
    expect(providerIdOfRow(row, LABELS)).toBeUndefined()
  })

  it('finds the official list through either row class', () => {
    const list = officialPage([{ id: 'a', name: 'A', stamped: true }])
    expect(rowsListOf(document.body)).toBe(list)
    list.innerHTML = ''
    const setup = document.createElement('li')
    setup.className = '_3nPmjq_setupCard'
    list.appendChild(setup)
    expect(rowsListOf(document.body)).toBe(list)
    // A card outside a <ul> is not the row list.
    list.remove()
    const stray = document.createElement('div')
    stray.className = '_3nPmjq_rowCard'
    document.body.appendChild(stray)
    expect(rowsListOf(document.body)).toBeUndefined()
  })
})

describe('provider row placement', () => {
  it('places named rows by CSS order and leaves an unmovable row alone', () => {
    const list = officialPage([
      { id: 'a', name: 'A', stamped: true },
      { id: 'b', name: 'B', foreignLabel: 'Mystery' },
      { id: 'c', name: 'C', stamped: true },
    ])
    const middle = list.children[1] as HTMLElement
    // Naming the rows is the scan's job; placement needs the ids it stamps.
    reconcileProviderOrder(document.body, deps(), createProviderOrderState())
    expect(orderedRowIds(list)).toEqual(['a', 'c'])
    applyRowOrder(list, ['c', 'a'])
    expect(shownRows(list)).toEqual(['C', 'B', 'A'])
    // The unnamed row was never assigned a slot of its own.
    expect(middle.style.order).toBe('1')
  })
})

describe('Models-page provider rows', () => {
  it('names each row and mounts exactly one grip as the first header child', () => {
    const list = officialPage([
      { id: 'deepseek-official', name: 'DeepSeek' },
      { id: 'aliyun', name: 'Aliyun', stamped: true },
      { id: 'mystery', name: 'Mystery', foreignLabel: 'Not a template' },
    ])
    const state = createProviderOrderState()
    reconcileProviderOrder(document.body, deps(), state)
    expect(orderedRowIds(list)).toEqual(['deepseek-official', 'aliyun'])
    const mounted = grips()
    expect(mounted).toHaveLength(2)
    for (const grip of mounted) {
      expect(grip.parentElement?.className).toContain('rowHead')
      expect(grip.parentElement?.firstElementChild).toBe(grip)
      expect(grip.getAttribute('role')).toBe('button')
      expect(grip.getAttribute('draggable')).toBe('true')
      expect(grip.getAttribute('aria-label')).toContain('providerReorderAria')
    }
    // A rescan recognizes its own work instead of stacking a second grip.
    reconcileProviderOrder(document.body, deps(), state)
    expect(grips()).toHaveLength(2)
    // The label follows the row it belongs to.
    expect(grips()[0]?.getAttribute('aria-label')).toBe('providerReorderAria:DeepSeek')
  })

  it('applies the stored order on the first scan', () => {
    const list = officialPage([
      { id: 'aliyun', name: 'Aliyun', stamped: true },
      { id: 'deepseek-official', name: 'DeepSeek' },
      { id: 'moonshot', name: 'Moonshot', stamped: true },
    ])
    // Pinned first when nothing is stored: the page's own order.
    reconcileProviderOrder(document.body, deps(), createProviderOrderState())
    expect(shownRows(list)).toEqual(['DeepSeek', 'Aliyun', 'Moonshot'])
    setProviderOrder(['moonshot', 'deepseek-official', 'aliyun'])
    reconcileProviderOrder(document.body, deps(), createProviderOrderState())
    expect(shownRows(list)).toEqual(['Moonshot', 'DeepSeek', 'Aliyun'])
  })

  it('stores the sequence a drop proposed', () => {
    const list = officialPage([
      { id: 'a', name: 'A', stamped: true },
      { id: 'b', name: 'B', stamped: true },
      { id: 'c', name: 'C', stamped: true },
    ])
    const state = createProviderOrderState()
    reconcileProviderOrder(document.body, deps(), state)
    const [a, b, c] = Array.from(list.children) as HTMLElement[]
    measure(c as HTMLElement, 0, 20)
    drag('dragstart', grips()[0] as HTMLElement)
    // The pointer is in C's upper half, so A lands BEFORE C — and the index is
    // read against the rows that remain once A is lifted out of them, so this
    // is index 1, not index 2.
    drag('dragover', c as HTMLElement, 5)
    expect(shownRows(list)).toEqual(['B', 'A', 'C'])
    drag('drop', c as HTMLElement, 5)
    drag('dragend', grips()[0] as HTMLElement)
    expect(JSON.parse(window.localStorage.getItem(PROVIDER_ORDER_KEY) as string)).toEqual(['b', 'a', 'c'])
    // The rows stay where they were dropped.
    expect(shownRows(list)).toEqual(['B', 'A', 'C'])
    expect(b?.classList.contains('bre-row-drop-target')).toBe(false)
    expect(a?.classList.contains('bre-row-dragging')).toBe(false)
  })

  it('abandons a drag that never landed, storing nothing', () => {
    const list = officialPage([
      { id: 'a', name: 'A', stamped: true },
      { id: 'b', name: 'B', stamped: true },
      { id: 'c', name: 'C', stamped: true },
    ])
    const state = createProviderOrderState()
    reconcileProviderOrder(document.body, deps(), state)
    const c = list.children[2] as HTMLElement
    measure(c, 0, 20)
    drag('dragstart', grips()[0] as HTMLElement)
    drag('dragover', c, 5)
    expect(shownRows(list)).toEqual(['B', 'A', 'C'])
    drag('dragend', grips()[0] as HTMLElement)
    expect(shownRows(list)).toEqual(['A', 'B', 'C'])
    expect(window.localStorage.getItem(PROVIDER_ORDER_KEY)).toBeNull()
  })

  it('does not fight the pointer while a drag is in flight', () => {
    const list = officialPage([
      { id: 'a', name: 'A', stamped: true },
      { id: 'b', name: 'B', stamped: true },
      { id: 'c', name: 'C', stamped: true },
    ])
    const state = createProviderOrderState()
    // A stored order that contradicts the drag: the scan must keep the screen.
    setProviderOrder(['c', 'b', 'a'])
    reconcileProviderOrder(document.body, deps(), state)
    expect(shownRows(list)).toEqual(['C', 'B', 'A'])
    setProviderOrder(['a', 'b', 'c'])
    const c = list.children[2] as HTMLElement
    measure(c, 0, 20)
    drag('dragstart', grips()[0] as HTMLElement)
    drag('dragover', c, 5)
    const [first, second, third] = shownRows(list)
    reconcileProviderOrder(document.body, deps(), state)
    expect(shownRows(list)).toEqual([first, second, third])
  })

  it('reorders with the keyboard and keeps the focus on the grip', () => {
    const list = officialPage([
      { id: 'a', name: 'A', stamped: true },
      { id: 'b', name: 'B', stamped: true },
    ])
    const state = createProviderOrderState()
    reconcileProviderOrder(document.body, deps(), state)
    const grip = grips()[0] as HTMLElement
    grip.focus()
    grip.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }))
    expect(shownRows(list)).toEqual(['B', 'A'])
    expect(document.activeElement).toBe(grip)
    expect(JSON.parse(window.localStorage.getItem(PROVIDER_ORDER_KEY) as string)).toEqual(['b', 'a'])
    // At the end of the list there is nowhere left to go.
    grip.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }))
    expect(shownRows(list)).toEqual(['B', 'A'])
    // Any other key is left to the page.
    grip.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
    expect(shownRows(list)).toEqual(['B', 'A'])
  })

  it('reads the drop slot against the sequence without the carried row', () => {
    const a = document.createElement('li')
    const b = document.createElement('li')
    const c = document.createElement('li')
    const rows = [a, b, c]
    // Carrying A: once A is lifted out, the pointer in B's top half asks for
    // slot 0 — the off-by-one that used to land a downward drag a row too far.
    expect(dropIndex(rows, a, b, false)).toBe(0)
    expect(dropIndex(rows, a, b, true)).toBe(1)
    expect(dropIndex(rows, a, c, true)).toBe(2)
    // Carrying C upward: slot 1 puts it before B, slot 2 leaves it where it is.
    expect(dropIndex(rows, c, b, false)).toBe(1)
    expect(dropIndex(rows, c, b, true)).toBe(2)
    // A row that is not on screen at all keeps the carried row's own slot.
    expect(dropIndex(rows, a, document.createElement('li'), false)).toBe(0)
  })

  it('leaves the rows alone until the pointer crosses a midline', () => {
    const list = officialPage([
      { id: 'a', name: 'A', stamped: true },
      { id: 'b', name: 'B', stamped: true },
      { id: 'c', name: 'C', stamped: true },
    ])
    const state = createProviderOrderState()
    reconcileProviderOrder(document.body, deps(), state)
    const b = list.children[1] as HTMLElement
    measure(b, 0, 20)
    drag('dragstart', grips()[0] as HTMLElement)
    // B's top half is exactly where A already is. A dragover repeats every few
    // pixels, so moving the row here is what makes the list jitter.
    drag('dragover', b, 5)
    expect(shownRows(list)).toEqual(['A', 'B', 'C'])
    // What follows the pointer instead is the insertion line.
    const line = document.querySelector<HTMLElement>('.bre-drop-line')
    expect(line).not.toBeNull()
    expect(line?.getAttribute('data-bre-drop-side')).toBe('before')
    expect(line?.style.display).toBe('block')
    // An overlay on the body — never a child of the list React owns.
    expect(list.contains(line)).toBe(false)
    // Crossing B's midline is what moves A past it.
    drag('dragover', b, 15)
    expect(shownRows(list)).toEqual(['B', 'A', 'C'])
    drag('dragend', grips()[0] as HTMLElement)
    expect(line?.style.display).toBe('none')
  })

  it('makes the whole row header the drag source, but not the card controls', () => {
    const list = officialPage([{ id: 'a', name: 'A', stamped: true }])
    const state = createProviderOrderState()
    reconcileProviderOrder(document.body, deps(), state)
    const row = list.children[0] as HTMLElement
    const head = row.querySelector<HTMLElement>('[class*="rowHead"]') as HTMLElement
    expect(head.getAttribute('draggable')).toBe('true')
    // A drag that begins on one of the card's own buttons is refused, so the
    // button keeps whatever it was going to do.
    const refused = new Event('dragstart', { bubbles: true, cancelable: true })
    ;(row.querySelector('button') as HTMLElement).dispatchEvent(refused)
    expect(refused.defaultPrevented).toBe(true)
    expect(state.drag).toBeUndefined()
    expect(row.classList.contains('bre-row-dragging')).toBe(false)
    // The header itself, anywhere off a control, carries the row.
    drag('dragstart', head)
    expect(row.classList.contains('bre-row-dragging')).toBe(true)
    drag('dragend', head)
    expect(row.classList.contains('bre-row-dragging')).toBe(false)
  })

  it('carries a named chip instead of a screenshot of the row', () => {
    const list = officialPage([{ id: 'aliyun', name: 'Aliyun', stamped: true }])
    const row = list.children[0] as HTMLElement
    const chip = makeGhost(row)
    expect(chip.className).toBe('bre-drag-ghost')
    expect(chip.querySelector('.bre-drag-ghost-name')?.textContent).toBe('Aliyun')
    const icon = chip.firstElementChild as SVGElement
    expect(icon.tagName.toLowerCase()).toBe('svg')
    expect(icon.childNodes).toHaveLength(6)

    const state = createProviderOrderState()
    reconcileProviderOrder(document.body, deps(), state)
    const head = row.querySelector<HTMLElement>('[class*="rowHead"]') as HTMLElement
    vi.useFakeTimers()
    head.dispatchEvent(new MouseEvent('dragstart', { bubbles: true, clientX: 40, clientY: 60 }))
    const placed = document.querySelectorAll<HTMLElement>('.bre-drag-ghost')
    expect(placed).toHaveLength(1)
    expect(placed[0]?.style.left).toBe('40px')
    expect(placed[0]?.style.top).toBe('60px')
    // The browser snapshots the drag image while the drag starts, so the chip
    // only has to live for this one task.
    vi.runAllTimers()
    expect(document.querySelectorAll('.bre-drag-ghost')).toHaveLength(0)
  })

  it('finds the scroller to follow and the edge that has to scroll', () => {
    const host = document.createElement('div')
    const inner = document.createElement('span')
    host.appendChild(inner)
    document.body.appendChild(host)
    // jsdom has no layout: give the box a scrollable one by hand.
    Object.defineProperty(host, 'scrollHeight', { value: 200, configurable: true })
    Object.defineProperty(host, 'clientHeight', { value: 100, configurable: true })
    host.style.overflowY = 'auto'
    expect(scrollHostOf(inner)).toBe(host)
    measure(host, 100, 200)
    expect(edgeScrollStep(host, 110)).toBe(-12)
    expect(edgeScrollStep(host, 290)).toBe(12)
    expect(edgeScrollStep(host, 200)).toBe(0)
    // A box that cannot be measured is not an edge to scroll.
    expect(edgeScrollStep(document.createElement('div'), 10)).toBe(0)
    // A container with nothing left to scroll is passed over.
    Object.defineProperty(host, 'scrollHeight', { value: 100, configurable: true })
    expect(scrollHostOf(inner)).toBeUndefined()
  })

  it('restores the official page on teardown, drag leftovers included', () => {
    const list = officialPage([
      { id: 'a', name: 'A', stamped: true },
      { id: 'b', name: 'B', stamped: true },
    ])
    const state = createProviderOrderState()
    setProviderOrder(['b', 'a'])
    reconcileProviderOrder(document.body, deps(), state)
    expect(shownRows(list)).toEqual(['B', 'A'])
    // Leave behind everything a drag in flight would have.
    const head = list.querySelector<HTMLElement>('[class*="rowHead"]') as HTMLElement
    drag('dragstart', head)
    drag('dragover', list.children[0] as HTMLElement, 5)
    expect(document.querySelectorAll('.bre-drop-line, .bre-drag-ghost').length).toBeGreaterThan(0)
    const row = list.children[0] as HTMLElement
    row.style.transform = 'translateY(4px)'
    row.style.transition = 'transform 180ms linear'
    teardownProviderOrder(state)
    expect(grips()).toHaveLength(0)
    expect(document.querySelectorAll('[data-bre-row-provider]')).toHaveLength(0)
    expect(document.querySelectorAll('[data-bre-row-head]')).toHaveLength(0)
    expect(document.querySelectorAll('.bre-drop-line')).toHaveLength(0)
    expect(document.querySelectorAll('.bre-drag-ghost')).toHaveLength(0)
    expect(head.getAttribute('draggable')).toBeNull()
    expect(head.hasAttribute('data-bre-row-head')).toBe(false)
    expect(row.style.transform).toBe('')
    expect(row.style.transition).toBe('')
    for (const child of Array.from(list.children) as HTMLElement[]) expect(child.style.order).toBe('')
    expect(shownRows(list)).toEqual(['A', 'B'])
  })
})

describe('composer provider column', () => {
  /** A three-provider directory, current on Aliyun. */
  function composerFixture(): ModelDirectoryLike {
    const groups = ([
      { id: 'deepseek-official', name: 'DeepSeek', models: [{ id: 'deepseek-chat', name: 'DeepSeek Chat' }] },
      { id: 'aliyun', name: 'Aliyun', models: [{ id: 'qwen-max', name: 'Qwen Max' }] },
      { id: 'moonshot', name: 'Moonshot', models: [{ id: 'kimi', name: 'Kimi' }] },
    ] as unknown) as ModelDirectoryStateLike['groups']
    const base: ModelDirectoryStateLike = {
      current: { provider: 'aliyun', model: 'qwen-max' },
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

  /** Mount the body, open the model column and report the providers it shows. */
  async function providerColumn(): Promise<{ root: ReturnType<typeof createRoot>; container: HTMLElement; names: () => (string | undefined)[] }> {
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
      container,
      names: () => Array.from(container.querySelectorAll('.bre-provider'))
        .map(el => el.querySelector('.bre-option-name')?.textContent ?? undefined),
    }
  }

  it('lists providers in the page order when nothing has been dragged', async () => {
    const { root, names } = await providerColumn()
    expect(names()).toEqual(['DeepSeek', 'Aliyun', 'Moonshot'])
    await act(async () => { root.unmount() })
  })

  it('follows the order set on the Models page, live', async () => {
    const { root, names } = await providerColumn()
    await act(async () => { setProviderOrder(['moonshot', 'deepseek-official', 'aliyun']) })
    expect(names()).toEqual(['Moonshot', 'DeepSeek', 'Aliyun'])
    // An external (cross-tab) change reaches an already-open switcher too.
    await act(async () => { syncProviderOrder(['aliyun', 'deepseek-official', 'moonshot']) })
    expect(names()).toEqual(['Aliyun', 'DeepSeek', 'Moonshot'])
    await act(async () => { root.unmount() })
  })
})
