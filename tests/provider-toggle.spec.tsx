/**
 * Provider enable-switch tests.
 *
 * Three layers, because the switch is a wire between three of them:
 *   - the stored set (`provider-enabled.ts`): the DISABLED ids, so an unknown
 *     route is enabled by default, and a switch persists without echoing;
 *   - the Models-page rows (`provider-toggle.ts`): mounting one switch per row,
 *     painting the state the store holds, toggling on click without letting the
 *     row (itself a button) or the header (a drag source) see the click;
 *   - the composer column (`ComposerSlider`): a switched-off provider is simply
 *     not listed, and switching it back on reaches an already-open switcher.
 */

// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, createElement } from 'react'
import { createRoot } from 'react-dom/client'
import {
  PROVIDER_DISABLED_KEY,
  disabledProviders,
  isProviderEnabled,
  parseDisabledProviders,
  setProviderEnabled,
  subscribeDisabledProviders,
  syncDisabledProviders,
} from '../src/client/provider-enabled.js'
import {
  createProviderToggleState,
  reconcileProviderEnabled,
  teardownProviderEnabled,
} from '../src/client/injection/provider-toggle.js'
import { syncProviderOrder } from '../src/client/provider-order.js'
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

/** The toggle module's dependencies with a translator that echoes its key. */
function deps(labels: HostLabels = LABELS): {
  t: (key: string, params?: Record<string, string | number>) => string
  labels: () => HostLabels
} {
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
    edit.setAttribute('aria-label', `Edit ${name === spec.id ? spec.id : `${name} (${spec.id})`}`)
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

/** Every switch on the page, in DOM order. */
function switches(): HTMLElement[] {
  return Array.from(document.querySelectorAll<HTMLElement>('.bre-provider-switch'))
}

/** The rows of the official list, in the sequence they screen. */
function rowList(): HTMLElement {
  return document.body.querySelector<HTMLElement>('ul._3nPmjq_rows') as HTMLElement
}

function scan(dependencies = deps()): void {
  reconcileProviderEnabled(document.body, dependencies, createProviderToggleState())
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

describe('disabled provider store', () => {
  it('parses the stored value the same way the provider order does', () => {
    expect(parseDisabledProviders(null)).toEqual([])
    expect(parseDisabledProviders('not json')).toEqual([])
    expect(parseDisabledProviders('{"a":1}')).toEqual([])
    expect(parseDisabledProviders('["aliyun","aliyun",""]')).toEqual(['aliyun'])
    expect(parseDisabledProviders('["aliyun","moonshot"]')).toEqual(['aliyun', 'moonshot'])
  })

  it('treats every provider as enabled until one is switched off', () => {
    expect(disabledProviders()).toEqual([])
    expect(isProviderEnabled('aliyun')).toBe(true)
    setProviderEnabled('aliyun', false)
    expect(disabledProviders()).toEqual(['aliyun'])
    expect(isProviderEnabled('aliyun')).toBe(false)
    // A route nobody has named is enabled by default — including a new one.
    expect(isProviderEnabled('deepseek-official')).toBe(true)
  })

  it('persists a switch, notifies once, and stays quiet on a no-op', () => {
    const listener = vi.fn()
    const unsubscribe = subscribeDisabledProviders(listener)
    setProviderEnabled('aliyun', false)
    expect(JSON.parse(String(window.localStorage.getItem(PROVIDER_DISABLED_KEY)))).toEqual(['aliyun'])
    expect(listener).toHaveBeenCalledTimes(1)
    // Switching a provider that is already off changes nothing: no write, no
    // notification — a redundant paint here would re-render the composer.
    setProviderEnabled('aliyun', false)
    expect(listener).toHaveBeenCalledTimes(1)
    setProviderEnabled('aliyun', true)
    expect(JSON.parse(String(window.localStorage.getItem(PROVIDER_DISABLED_KEY)))).toEqual([])
    expect(listener).toHaveBeenCalledTimes(2)
    unsubscribe()
    setProviderEnabled('moonshot', false)
    expect(listener).toHaveBeenCalledTimes(2)
  })

  it('accepts an external value without writing it back', () => {
    const listener = vi.fn()
    subscribeDisabledProviders(listener)
    syncDisabledProviders(['moonshot'])
    expect(disabledProviders()).toEqual(['moonshot'])
    expect(window.localStorage.getItem(PROVIDER_DISABLED_KEY)).toBeNull()
    expect(listener).toHaveBeenCalledTimes(1)
    // Order is meaningless to a set: a reshuffle is not a change.
    syncDisabledProviders(['moonshot'])
    expect(listener).toHaveBeenCalledTimes(1)
  })
})

describe('Models-page provider switches', () => {
  it('mounts one switch per row, inside the row action group, named after the provider', () => {
    officialPage([{ id: 'deepseek-official', name: 'DeepSeek' }, { id: 'aliyun', name: 'Aliyun' }])
    scan()
    const mounted = switches()
    expect(mounted).toHaveLength(2)
    for (const control of mounted) {
      expect(control.getAttribute('role')).toBe('switch')
      expect(control.getAttribute('type')).toBe('button')
      expect(control.parentElement?.className).toContain('rowActions')
      // It leads the group: the card's buttons keep their order, the last of
      // them still being the card's own (destructive) one.
      expect(control.parentElement?.firstElementChild).toBe(control)
      expect(control.parentElement?.querySelectorAll('button')).toHaveLength(2)
    }
    expect(mounted.map(control => control.getAttribute('aria-label')))
      .toEqual(['providerToggleAria:DeepSeek', 'providerToggleAria:Aliyun'])
    expect(mounted[0]?.getAttribute('title')).toBe('providerToggleHint')
    expect(mounted.map(control => control.getAttribute('aria-checked')))
      .toEqual(['true', 'true'])
    // A second scan through a fresh state must not double up.
    scan()
    expect(switches()).toHaveLength(2)
  })

  it('shows the stored state on the first scan, and dims the row it applies to', () => {
    syncDisabledProviders(['aliyun'])
    officialPage([{ id: 'deepseek-official', name: 'DeepSeek' }, { id: 'aliyun', name: 'Aliyun' }])
    scan()
    const mounted = switches()
    expect(mounted.map(control => control.getAttribute('aria-checked'))).toEqual(['true', 'false'])
    const rows = Array.from(rowList().children)
    expect(rows[0]?.classList.contains('bre-row-disabled')).toBe(false)
    expect(rows[1]?.classList.contains('bre-row-disabled')).toBe(true)
  })

  it('toggles on click: persists, repaints at once, and never reaches the row', () => {
    officialPage([{ id: 'aliyun', name: 'Aliyun' }])
    scan()
    const row = rowList().children[0] as HTMLElement
    const rowClick = vi.fn()
    const headDrag = vi.fn()
    row.addEventListener('click', rowClick)
    const head = row.querySelector<HTMLElement>('[class*="rowHead"]') as HTMLElement
    head.addEventListener('dragstart', headDrag)
    const control = switches()[0] as HTMLElement
    control.click()
    expect(isProviderEnabled('aliyun')).toBe(false)
    expect(JSON.parse(String(window.localStorage.getItem(PROVIDER_DISABLED_KEY)))).toEqual(['aliyun'])
    // The scan that would normally repaint is 120ms away: the click paints now.
    expect(control.getAttribute('aria-checked')).toBe('false')
    expect(row.classList.contains('bre-row-disabled')).toBe(true)
    // The row itself is a button on the official page, and the header drags:
    // neither may read this click as its own.
    expect(rowClick).not.toHaveBeenCalled()
    expect(headDrag).not.toHaveBeenCalled()
    control.click()
    expect(control.getAttribute('aria-checked')).toBe('true')
    expect(row.classList.contains('bre-row-disabled')).toBe(false)
  })

  it('relabels an existing switch when the plugin language changes', () => {
    officialPage([{ id: 'aliyun', name: 'Aliyun' }])
    scan()
    const first = switches()[0] as HTMLElement
    // The host keeps its own labels; only the plugin's copy is translated.
    scan({
      t: (key: string, params?: Record<string, string | number>) =>
        params === undefined ? key : 'zh:' + key + ':' + String(params['provider'] ?? ''),
      labels: () => LABELS,
    })
    expect(switches()).toHaveLength(1)
    // The very same node, relabelled — not a second switch beside it.
    expect(switches()[0]).toBe(first)
    expect(first.getAttribute('aria-label')).toBe('zh:providerToggleAria:Aliyun')
  })

  it('leaves a row it cannot name alone', () => {
    const list = officialPage([{ id: 'aliyun', name: 'Aliyun' }])
    const stranger = document.createElement('li')
    stranger.className = '_3nPmjq_rowCard'
    const head = document.createElement('div')
    head.className = '_3nPmjq_rowHead'
    const name = document.createElement('span')
    name.className = '_3nPmjq_rowName'
    name.textContent = 'Mystery'
    head.appendChild(name)
    stranger.appendChild(head)
    list.appendChild(stranger)
    scan()
    // Two rows, one switch: an unnamed id must never be switched off silently.
    expect(switches()).toHaveLength(1)
    expect(stranger.classList.contains('bre-row-disabled')).toBe(false)
  })

  it('removes every switch and every dim on teardown', () => {
    syncDisabledProviders(['aliyun'])
    officialPage([{ id: 'deepseek-official', name: 'DeepSeek' }, { id: 'aliyun', name: 'Aliyun' }])
    scan()
    expect(switches()).toHaveLength(2)
    teardownProviderEnabled()
    expect(switches()).toHaveLength(0)
    expect(document.querySelectorAll('.bre-row-disabled')).toHaveLength(0)
    expect(rowList().querySelectorAll('button')).toHaveLength(2)
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
  async function providerColumn(): Promise<{
    root: ReturnType<typeof createRoot>
    names: () => (string | undefined)[]
  }> {
    const container = document.createElement('div')
    document.body.appendChild(container)
    const root = createRoot(container)
    await act(async () => {
      root.render(createElement(ComposerSlider, { directory: composerFixture(), t: (key: string) => key }))
    })
    await act(async () => {
      ;(container.querySelector('.bre-row-control') as HTMLElement).click()
    })
    return {
      root,
      names: () => Array.from(container.querySelectorAll('.bre-provider'))
        .map(el => el.querySelector('.bre-option-name')?.textContent ?? undefined),
    }
  }

  it('leaves a switched-off provider out of the column, and takes it back live', async () => {
    const { root, names } = await providerColumn()
    expect(names()).toEqual(['DeepSeek', 'Aliyun', 'Moonshot'])
    await act(async () => { setProviderEnabled('aliyun', false) })
    expect(names()).toEqual(['DeepSeek', 'Moonshot'])
    // A cross-tab switch reaches an already-open switcher too.
    await act(async () => { syncDisabledProviders(['aliyun', 'moonshot']) })
    expect(names()).toEqual(['DeepSeek'])
    await act(async () => { setProviderEnabled('moonshot', true) })
    expect(names()).toEqual(['DeepSeek', 'Moonshot'])
    await act(async () => { root.unmount() })
  })

  it('leaves the trigger alone when the provider it shows was switched off', async () => {
    const { root } = await providerColumn()
    await act(async () => { setProviderEnabled('aliyun', false) })
    // The current model keeps its own name: the switch governs the LIST, not
    // the model the session runs on.
    expect(document.body.querySelector('.bre-row-value')?.textContent).toContain('Qwen Max')
    await act(async () => { root.unmount() })
  })
})
