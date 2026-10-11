/**
 * Folded-group tests for the Models page.
 *
 * The group is the answer to "the built-in providers are in the way": a provider
 * stays deletable-proof but its row folds away once the row's own switch turns it
 * off, and one control at the end of the list unfolds them again. Four things are
 * pinned here, because all four are easy to get quietly wrong:
 *   - the rows are NOT moved or removed — the drag pass reads its slots back out
 *     of the DOM, so a folded row must keep the slot it had;
 *   - the unfolded group still screens UNDER its control, not in the slots the
 *     rows happen to hold — that is the stylesheet's order, not a DOM move;
 *   - the control is the list's own last item, because only from inside the list
 *     can it head the rows ordered behind it;
 *   - the click paints immediately and stays the click's own — the scan that
 *     would otherwise paint is 120ms away, and the row's header drags;
 *   - a scan that changes nothing writes nothing — every write lands under the
 *     MutationObserver that scheduled the scan, and an unguarded write would
 *     feed it its own schedule forever.
 */

// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  setProviderEnabled,
  syncDisabledProviders,
} from '../src/client/provider-enabled.js'
import { syncProviderOrder } from '../src/client/provider-order.js'
import { STYLES } from '../src/client/styles.js'
import {
  createProviderDisabledGroupState,
  reconcileProviderDisabledGroup,
  teardownProviderDisabledGroup,
} from '../src/client/injection/provider-disabled-group.js'
import type { HostLabels } from '../src/client/injection/models-page-editor.js'

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

/** The group's dependencies with a translator that echoes key and count. */
function deps(labels: HostLabels = LABELS): {
  t: (key: string, params?: Record<string, string | number>) => string
  labels: () => HostLabels
} {
  return {
    t: (key: string, params?: Record<string, string | number>) =>
      params === undefined ? key : key + ':' + String(params['count'] ?? ''),
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
  /** Whether the row is the shape of a row this plugin cannot name. */
  anonymous?: boolean
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
    if (spec.anonymous !== true) {
      const actions = document.createElement('span')
      actions.className = '_3nPmjq_rowActions'
      const edit = document.createElement('button')
      edit.setAttribute('aria-label', `Edit ${name === spec.id ? spec.id : `${name} (${spec.id})`}`)
      actions.appendChild(edit)
      head.appendChild(actions)
    }
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
function rowList(): HTMLElement {
  return document.body.querySelector<HTMLElement>('ul._3nPmjq_rows') as HTMLElement
}

/** The group's seat, wherever it currently sits. */
function group(): HTMLElement | undefined {
  return document.body.querySelector<HTMLElement>('[data-bre-provider-disabled-group]') ?? undefined
}

/** The button inside the seat: the control the user reads and clicks. */
function control(): HTMLElement | undefined {
  return group()?.querySelector<HTMLElement>('button.bre-provider-disabled-group') ?? undefined
}

/** One row by its route id, named exactly as the official list names it. */
function rowOf(id: string): HTMLElement {
  const list = rowList()
  for (const child of Array.from(list.children)) {
    if (!(child instanceof HTMLElement)) continue
    const label = child.querySelector<HTMLElement>('button[aria-label]')?.getAttribute('aria-label')
    if (label !== null && label !== undefined && (label === `Edit ${id}` || label.endsWith(`(${id})`))) {
      return child
    }
  }
  throw new Error(`no row for ${id}`)
}

/** The rows the group folded away, by their name — DOM order. */
function foldedNames(): string[] {
  return Array.from(rowList().children)
    .filter((child): child is HTMLElement => child instanceof HTMLElement)
    .filter(child => child.classList.contains('bre-row-hidden'))
    .map(child => child.querySelector<HTMLElement>('[class*="rowName"]')?.textContent ?? '')
}

function scan(state = createProviderDisabledGroupState()): void {
  reconcileProviderDisabledGroup(document.body, deps(), state)
}

function click(target: HTMLElement): void {
  target.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }))
}

beforeEach(() => {
  document.body.innerHTML = ''
  // Both stores are module-level state shared by every case in this file: reset
  // them through the no-persist paths so one case cannot seed the next.
  window.localStorage.clear()
  syncProviderOrder([])
  syncDisabledProviders([])
  vi.restoreAllMocks()
})

afterEach(() => {
  document.body.innerHTML = ''
})

describe('the folded group of switched-off providers', () => {
  it('folds the switched-off rows behind the control and leaves every other row in place', () => {
    officialPage([{ id: 'aliyun' }, { id: 'moonshot' }, { id: 'deepseek' }])
    setProviderEnabled('moonshot', false)
    scan()
    // The row keeps its slot: the drag pass reads its slots back out of the DOM,
    // so a folded row must not be moved to the end or removed. Where it SCREENS
    // is the stylesheet's business (`.bre-row-folded`), not the DOM's.
    expect(foldedNames()).toEqual(['moonshot'])
    expect(rowOf('moonshot').classList.contains('bre-row-folded')).toBe(true)
    // Rows plus the seat, and the rows themselves untouched: the seat is an
    // addition to the list, not a rebuild of it.
    expect(rowList().children.length).toBe(4)
    expect(rowList().children[1]).toBe(rowOf('moonshot'))
    expect(rowList().lastElementChild).toBe(group())
    expect(rowOf('aliyun').classList.contains('bre-row-hidden')).toBe(false)
    expect(rowOf('deepseek').classList.contains('bre-row-hidden')).toBe(false)
    expect(rowOf('aliyun').classList.contains('bre-row-folded')).toBe(false)
  })

  it('says nothing while every provider is switched on', () => {
    officialPage([{ id: 'aliyun' }, { id: 'moonshot' }])
    scan()
    // No control at all — an empty count would be a control that does nothing.
    expect(group()).toBeUndefined()
    expect(foldedNames()).toEqual([])
    expect(rowList().children.length).toBe(2)
  })

  it('carries the count on a control that is the list\'s own last item', () => {
    const list = officialPage([{ id: 'aliyun' }, { id: 'moonshot' }, { id: 'deepseek' }])
    setProviderEnabled('moonshot', false)
    setProviderEnabled('deepseek', false)
    scan()
    const seat = group()
    const button = control()
    expect(seat).toBeDefined()
    expect(button).toBeDefined()
    expect(seat?.tagName).toBe('LI')
    expect(button?.getAttribute('type')).toBe('button')
    // The seat is the list's last item: the rows it heads are ordered behind it,
    // so a control outside the list could not head them.
    expect(seat?.parentElement).toBe(list)
    expect(list.lastElementChild).toBe(seat)
    expect(button?.textContent).toBe('providerDisabledGroupShow:2')
    expect(button?.getAttribute('aria-label')).toBe('providerDisabledGroupShow:2')
    expect(button?.getAttribute('title')).toBe('providerDisabledGroupHint')
    expect(button?.getAttribute('aria-expanded')).toBe('false')
  })

  it('orders the folded rows behind the seat, whatever order a drag wrote before', () => {
    // jsdom does not lay out, so the order itself is pinned where it lives: the
    // plugin's own stylesheet, where !important outranks the inline orders the
    // drag passes write onto the rows.
    expect(STYLES).toContain('.bre-row-folded { order: 1001 !important; }')
    expect(STYLES).toContain('.bre-provider-disabled-seat {')
    expect(STYLES).toContain('  order: 1000 !important;\n')
  })

  it('unfolds on click, folds again on the second, and keeps the click its own', () => {
    officialPage([{ id: 'aliyun' }, { id: 'moonshot' }])
    setProviderEnabled('moonshot', false)
    const state = createProviderDisabledGroupState()
    scan(state)
    const button = control() as HTMLElement
    // The row opens the editor on click and its header drags: neither may read
    // this click as its own, and the default must not run either.
    const listClick = vi.fn()
    rowList().addEventListener('click', listClick)
    let defaultPrevented = true
    button.addEventListener('click', (event: MouseEvent) => { defaultPrevented = event.defaultPrevented })
    click(button)
    expect(foldedNames()).toEqual([])
    expect(button.getAttribute('aria-expanded')).toBe('true')
    expect(button.textContent).toBe('providerDisabledGroupHide:1')
    // Painted by the click itself: the debounced scan is 120ms away and has not
    // run here at all.
    expect(state.expanded).toBe(true)
    expect(defaultPrevented).toBe(true)
    expect(listClick).not.toHaveBeenCalled()
    // Unfolded, the row keeps the tail: the group screens under its control
    // instead of in the slot it happens to hold.
    expect(rowOf('moonshot').classList.contains('bre-row-folded')).toBe(true)
    expect(rowList().lastElementChild).toBe(group())
    click(button)
    expect(foldedNames()).toEqual(['moonshot'])
    expect(button.getAttribute('aria-expanded')).toBe('false')
    expect(button.textContent).toBe('providerDisabledGroupShow:1')
  })

  it('folds a row named by the stamp alone, and never a row it cannot name', () => {
    officialPage([
      { id: 'aliyun', name: 'Aliyun', stamped: false },
      { id: 'moonshot', name: 'Moonshot', stamped: true },
      { id: 'mystery', anonymous: true },
    ])
    setProviderEnabled('moonshot', false)
    setProviderEnabled('mystery', false)
    scan()
    // The built-in row has no `data-bre-provider` slot, so its id comes from the
    // official Edit label; the llm-pi-ai row's comes from the stamp.
    expect(foldedNames()).toEqual(['Moonshot'])
    // A row this module cannot name is left alone: folding an unknown card would
    // hide a provider the user never chose — and it is not counted either.
    expect(control()?.textContent).toBe('providerDisabledGroupShow:1')
    // Nor is the seat itself ever taken for a row: it names no provider.
    expect(control()?.classList.contains('bre-row-hidden')).toBe(false)
  })

  it('takes the control away once the last provider is switched back on', () => {
    officialPage([{ id: 'aliyun' }, { id: 'moonshot' }])
    setProviderEnabled('moonshot', false)
    setProviderEnabled('aliyun', false)
    const state = createProviderDisabledGroupState()
    scan(state)
    expect(control()?.textContent).toBe('providerDisabledGroupShow:2')
    setProviderEnabled('moonshot', true)
    setProviderEnabled('aliyun', true)
    scan(state)
    expect(group()).toBeUndefined()
    expect(foldedNames()).toEqual([])
    expect(rowOf('aliyun').classList.contains('bre-row-folded')).toBe(false)
    expect(rowOf('moonshot').classList.contains('bre-row-folded')).toBe(false)
  })

  it('writes nothing on a scan that finds the page already folded', () => {
    officialPage([{ id: 'aliyun' }, { id: 'moonshot' }])
    setProviderEnabled('moonshot', false)
    const state = createProviderDisabledGroupState()
    scan(state)
    // Whatever the first scan did, the next ones must find the page already in
    // the state they would write — the seat is already last, the classes already
    // on the rows — or they feed the observer that scheduled them, forever.
    const writes: MutationRecord[] = []
    const observer = new MutationObserver(records => { writes.push(...records) })
    observer.observe(document.body, { childList: true, attributes: true, subtree: true })
    scan(state)
    scan(state)
    observer.takeRecords()
    observer.disconnect()
    expect(writes).toEqual([])
  })

  it('unfolds everything and removes the control on teardown', () => {
    officialPage([{ id: 'aliyun' }, { id: 'moonshot' }])
    setProviderEnabled('moonshot', false)
    scan()
    expect(group()).toBeDefined()
    teardownProviderDisabledGroup()
    // A dead fiber must not leave provider rows invisible with nothing left to
    // unfold them — nor ordered into a tail with nothing left to explain it.
    expect(group()).toBeUndefined()
    expect(document.querySelectorAll('.bre-row-hidden').length).toBe(0)
    expect(document.querySelectorAll('.bre-row-folded').length).toBe(0)
    expect(rowOf('moonshot')).toBeDefined()
  })
})
