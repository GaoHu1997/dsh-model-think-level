/**
 * Provider delete-seat tests.
 *
 * The official row renders its destructive button only for a provider the host
 * still considers removable, so a built-in provider's action group is narrower
 * than its neighbours' and the column of buttons never lines up. This module
 * keeps the seat: a disabled button of the official metrics, placed last in the
 * group, wearing the host's own word for the action.
 *
 * What matters here is that the seat is the DOM's own state (idempotent by
 * presence), that it never doubles a real delete button, and that it cannot act.
 */

// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest'
import {
  reconcileProviderDeleteSeat,
  teardownProviderDeleteSeats,
} from '../src/client/injection/provider-delete-seat.js'
import { STYLES } from '../src/client/styles.js'
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

/** The seat module's dependencies with a translator that echoes its key. */
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
  /** Whether the row carries the host's own delete button. */
  removable?: boolean
  /** Whether the plugin's own slot stamps the route on the row. */
  stamped?: boolean
  /** Drop the action group entirely, as an unexpected card shape would. */
  noActions?: boolean
  /** Whether this card's editor is open, which marks the row itself. */
  tabbed?: boolean
}

/** The word the host's own delete button renders, off any removable row. */
const OFFICIAL_LABEL = '删除'

/**
 * One provider row as the official section renders it. `removable` is the host's
 * own flag: with it the row carries the real button, without it the row is a
 * built-in provider and the seat is the only thing that can fill the place.
 */
function officialPage(rows: readonly RowSpec[]): HTMLElement {
  const list = document.createElement('ul')
  list.className = '_3nPmjq_rows'
  for (const spec of rows) {
    const name = spec.name ?? spec.id
    const card = document.createElement('li')
    card.className = spec.tabbed === true ? '_3nPmjq_rowCard bre-tabbed' : '_3nPmjq_rowCard'
    const head = document.createElement('div')
    head.className = '_3nPmjq_rowHead'
    const identity = document.createElement('span')
    identity.className = '_3nPmjq_rowIdentity'
    const nameEl = document.createElement('span')
    nameEl.className = '_3nPmjq_rowName'
    nameEl.textContent = name
    identity.appendChild(nameEl)
    head.appendChild(identity)
    if (spec.noActions !== true) {
      const actions = document.createElement('span')
      actions.className = '_3nPmjq_rowActions'
      const edit = document.createElement('button')
      edit.setAttribute('aria-label', `Edit ${name === spec.id ? spec.id : `${name} (${spec.id})`}`)
      edit.textContent = 'Edit'
      actions.appendChild(edit)
      if (spec.removable === true) {
        const remove = document.createElement('button')
        remove.className = '_3nPmjq_dangerButton'
        remove.setAttribute('aria-label', `Delete ${name} (${spec.id})`)
        remove.textContent = OFFICIAL_LABEL
        actions.appendChild(remove)
      }
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

/** Every seat on the page, in DOM order. */
function seats(): HTMLElement[] {
  return Array.from(document.querySelectorAll<HTMLElement>('.bre-provider-delete'))
}

/** The action group of one row, by its displayed name. */
function actionsOf(name: string): HTMLElement {
  for (const card of Array.from(document.querySelectorAll<HTMLElement>('li._3nPmjq_rowCard'))) {
    const rowName = card.querySelector('[class*="rowName"]')?.textContent ?? ''
    if (rowName !== name) continue
    return card.querySelector<HTMLElement>('[class*="rowActions"]') as HTMLElement
  }
  throw new Error(`no row named ${name}`)
}

afterEach(() => {
  document.body.innerHTML = ''
})

describe('reconcileProviderDeleteSeat', () => {
  it('fills the seat of a row the host left without a delete button', () => {
    officialPage([{ id: 'deepseek', name: 'DeepSeek' }])
    reconcileProviderDeleteSeat(document.body, deps())
    const [seat] = seats()
    expect(seat).toBeDefined()
    // Last in the group: the destructive control is the row's final action.
    expect(actionsOf('DeepSeek').lastElementChild).toBe(seat)
    expect(seat?.parentElement).toBe(actionsOf('DeepSeek'))
    expect(seat?.getAttribute('data-bre-provider-delete')).toBe('deepseek')
  })

  it('leaves a removable row to the host’s own button', () => {
    officialPage([{ id: 'ofox', name: 'ofox', removable: true }])
    reconcileProviderDeleteSeat(document.body, deps())
    expect(seats()).toHaveLength(0)
    expect(actionsOf('ofox').lastElementChild?.className).toContain('dangerButton')
  })

  it('gives the seat to the built-in row only', () => {
    officialPage([
      { id: 'deepseek', name: 'DeepSeek' },
      { id: 'ofox', name: 'ofox', removable: true },
    ])
    reconcileProviderDeleteSeat(document.body, deps())
    expect(seats()).toHaveLength(1)
    expect(seats()[0]?.getAttribute('data-bre-provider-delete')).toBe('deepseek')
    // The removable row keeps the host's button and its own place.
    expect(actionsOf('ofox').querySelectorAll('button')).toHaveLength(2)
    // Both groups now end with a control of the same width class, which is what
    // makes the column line up.
    expect(actionsOf('DeepSeek').children).toHaveLength(2)
    expect(actionsOf('ofox').children).toHaveLength(2)
  })

  it('cannot act: the seat is disabled and named for the provider', () => {
    officialPage([{ id: 'deepseek', name: 'DeepSeek' }])
    reconcileProviderDeleteSeat(document.body, deps())
    const seat = seats()[0] as HTMLButtonElement
    expect(seat.disabled).toBe(true)
    expect(seat.getAttribute('type')).toBe('button')
    expect(seat.getAttribute('title')).toBe('providerRemoveLocked:DeepSeek')
    expect(seat.getAttribute('aria-label')).toBe('providerRemoveLocked:DeepSeek')
  })

  it('wears the host’s own word for the action', () => {
    officialPage([
      { id: 'deepseek', name: 'DeepSeek' },
      { id: 'ofox', name: 'ofox', removable: true },
    ])
    reconcileProviderDeleteSeat(document.body, deps())
    expect(seats()[0]?.textContent).toBe(OFFICIAL_LABEL)
  })

  it('falls back to the plugin dictionary on a page with no delete button at all', () => {
    officialPage([{ id: 'deepseek', name: 'DeepSeek' }])
    reconcileProviderDeleteSeat(document.body, deps())
    expect(seats()[0]?.textContent).toBe('providerRemoveDisabled')
  })

  it('is idempotent: a settled page keeps the very same seat', () => {
    officialPage([{ id: 'deepseek', name: 'DeepSeek' }])
    reconcileProviderDeleteSeat(document.body, deps())
    const first = seats()[0]
    reconcileProviderDeleteSeat(document.body, deps())
    reconcileProviderDeleteSeat(document.body, deps())
    expect(seats()).toHaveLength(1)
    expect(seats()[0]).toBe(first)
    expect(actionsOf('DeepSeek').children).toHaveLength(2)
  })

  it('puts the seat back when the host re-renders its own children after it', () => {
    officialPage([{ id: 'deepseek', name: 'DeepSeek' }])
    reconcileProviderDeleteSeat(document.body, deps())
    const actions = actionsOf('DeepSeek')
    const seat = seats()[0] as HTMLElement
    // React rebuilds the group: the seat is still in the tree but no longer last.
    const extra = document.createElement('button')
    actions.appendChild(extra)
    expect(actions.lastElementChild).toBe(extra)
    reconcileProviderDeleteSeat(document.body, deps())
    expect(actions.lastElementChild).toBe(seat)
  })

  it('hands the seat back when a provider becomes removable', () => {
    officialPage([{ id: 'ofox', name: 'ofox' }])
    reconcileProviderDeleteSeat(document.body, deps())
    expect(seats()).toHaveLength(1)
    // The settings document reloaded: the host now renders its own button.
    const actions = actionsOf('ofox')
    const remove = document.createElement('button')
    remove.className = '_3nPmjq_dangerButton'
    remove.textContent = OFFICIAL_LABEL
    actions.appendChild(remove)
    reconcileProviderDeleteSeat(document.body, deps())
    expect(seats()).toHaveLength(0)
    expect(actions.querySelectorAll('button')).toHaveLength(2)
  })

  it('takes the seat back when the provider becomes removable', () => {
    officialPage([{ id: 'deepseek', name: 'DeepSeek' }])
    reconcileProviderDeleteSeat(document.body, deps())
    expect(seats()).toHaveLength(1)
    const actions = actionsOf('DeepSeek')
    const remove = document.createElement('button')
    remove.className = '_3nPmjq_dangerButton'
    remove.textContent = OFFICIAL_LABEL
    actions.appendChild(remove)
    reconcileProviderDeleteSeat(document.body, deps())
    expect(seats()).toHaveLength(0)
  })

  it('reads the row id off the plugin’s own stamp when there is one', () => {
    officialPage([{ id: 'deepseek', name: 'DeepSeek', stamped: true }])
    reconcileProviderDeleteSeat(document.body, deps())
    expect(seats()[0]?.getAttribute('data-bre-provider-delete')).toBe('deepseek')
  })

  it('leaves a row it cannot name alone', () => {
    officialPage([{ id: 'deepseek', name: 'DeepSeek' }])
    // No `editProvider` template: the row has no id to stand for.
    reconcileProviderDeleteSeat(document.body, deps({ ...LABELS, editProvider: [] }))
    expect(seats()).toHaveLength(0)
  })

  it('does nothing without an action group to align with', () => {
    officialPage([{ id: 'deepseek', name: 'DeepSeek', noActions: true }])
    reconcileProviderDeleteSeat(document.body, deps())
    expect(seats()).toHaveLength(0)
  })

  it('keeps the seat while the row’s own editor is open', () => {
    // The tab takeover marks the OFFICIAL row (`bre-tabbed`) while its editor is
    // open. That mark is state, not ownership: reading it as ownership costs the
    // row its id, and with it the seat — for exactly the card the user has open,
    // and a built-in row has no stamp to fall back on.
    officialPage([{ id: 'deepseek', name: 'DeepSeek', tabbed: true }])
    reconcileProviderDeleteSeat(document.body, deps())
    expect(seats()).toHaveLength(1)
    expect(seats()[0]?.getAttribute('data-bre-provider-delete')).toBe('deepseek')
    expect(actionsOf('DeepSeek').lastElementChild).toBe(seats()[0])
  })

  it('keeps both action columns level while one card is open', () => {
    officialPage([
      { id: 'deepseek', name: 'DeepSeek', tabbed: true },
      { id: 'ofox', name: 'ofox', removable: true, tabbed: true },
    ])
    reconcileProviderDeleteSeat(document.body, deps())
    expect(actionsOf('DeepSeek').children).toHaveLength(2)
    expect(actionsOf('ofox').children).toHaveLength(2)
  })

  it('does nothing when the root is detached', () => {
    const list = officialPage([{ id: 'deepseek', name: 'DeepSeek' }])
    list.remove()
    reconcileProviderDeleteSeat(list, deps())
    expect(seats()).toHaveLength(0)
  })
})

describe('teardownProviderDeleteSeats', () => {
  it('takes every seat out again', () => {
    officialPage([
      { id: 'deepseek', name: 'DeepSeek' },
      { id: 'abin', name: 'abin' },
    ])
    reconcileProviderDeleteSeat(document.body, deps())
    expect(seats()).toHaveLength(2)
    teardownProviderDeleteSeats()
    expect(seats()).toHaveLength(0)
    // The host's own controls are untouched.
    expect(document.querySelectorAll('li._3nPmjq_rowCard [class*="rowActions"] button')).toHaveLength(2)
  })
})

describe('the seat contract with the stylesheet', () => {
  it('carries the official row button’s metrics and the host’s disabled look', () => {
    expect(STYLES).toContain('.bre-provider-delete {\n  box-sizing: border-box;')
    expect(STYLES).toContain('height: 28px;\n  padding: 0 10px;')
    expect(STYLES).toContain('opacity: .4;\n  cursor: default;')
  })

  it('drops the Customized group’s rule AND both of its top paddings in the Models pane', () => {
    // The group's separator divided it from the key field, which this pane
    // hides; leaving its padding behind is the blank space the pane showed
    // where the deleted line had been.
    expect(STYLES).toContain(
      ".bre-tabbed[data-bre-tab='models'] [data-bre-editor-body] details[class*='customized'] {\n" +
      '  border-top: none;\n' +
      '  padding-top: 0;\n' +
      '}',
    )
    expect(STYLES).toContain(
      ".bre-tabbed[data-bre-tab='models'] [data-bre-editor-body] details[class*='customized'] > [class*='customizedBody'] {\n" +
      '  padding-top: 0;\n' +
      '}',
    )
  })

  it('drops the catalogue’s own rule, so nothing is left above its heading', () => {
    // The pane is already ended by the tab bar above it, so the second hairline
    // has nothing to divide either — it goes with its 12px.
    expect(STYLES).toContain(
      ".bre-tabbed[data-bre-tab='models'] [data-bre-editor-body] section[class*='modelCatalog'] {\n" +
      '  border-top: none;\n' +
      '  padding-top: 0;\n' +
      '}',
    )
  })
})
