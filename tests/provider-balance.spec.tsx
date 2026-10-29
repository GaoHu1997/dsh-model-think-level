// @vitest-environment jsdom
/**
 * The balance chip in front of a provider's enable switch.
 *
 * Two properties matter most: the chip leads the SWITCH (it is context for the
 * switch, not another action), and it is absent whenever the route has no
 * balance endpoint — a provider without one must not reserve space or print a
 * placeholder. The reads are throttled per route, so a page that rescans on
 * every mutation does not hit the billing API on every pass.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  createProviderBalanceState,
  invalidateProviderBalance,
  reconcileProviderBalance,
  teardownProviderBalance,
  type ProviderBalanceDeps,
} from '../src/client/injection/provider-balance.js'
import { createProviderToggleState, reconcileProviderEnabled, teardownProviderEnabled } from '../src/client/injection/provider-toggle.js'
import type { BalanceClient, ProviderBalanceAnswer } from '../src/client/balance-client.js'
import type { HostLabels } from '../src/client/injection/models-page-editor.js'

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
  inputImage: ['Image'],
  contextWindow: ['Context window'],
  maxOutput: ['Max output'],
  addModel: ['Add model'],
}

const COPY: Record<string, string> = {
  providerToggleAria: 'Enable {provider}',
  providerToggleHint: 'toggle hint',
  providerBalanceLabel: 'Balance',
  providerBalanceHint: 'balance hint',
  providerBalanceRefresh: 'Refresh balance',
  providerBalanceUnavailable: 'Balance —',
}

const t = (key: string, params?: Record<string, string | number>): string => {
  const raw = COPY[key] ?? key
  if (params === undefined) return raw
  return raw.replace(/\{(\w+)\}/g, (_match, name: string) => String(params[name] ?? ''))
}

/** A transport whose answers the cases control. */
function fakeClient(answer: ProviderBalanceAnswer | (() => ProviderBalanceAnswer)) {
  const read = vi.fn(async (): Promise<ProviderBalanceAnswer> =>
    typeof answer === 'function' ? answer() : answer)
  return { client: { read } as BalanceClient, read }
}

function deps(client: BalanceClient): ProviderBalanceDeps {
  return { t, labels: () => LABELS, client }
}

/** One provider row, with the plugin's switch already mounted. */
function page(route = 'acme'): HTMLElement {
  const list = document.createElement('ul')
  list.className = '_3nPmjq_rows'
  const card = document.createElement('li')
  card.className = '_3nPmjq_rowCard'
  const head = document.createElement('div')
  head.className = '_3nPmjq_rowHead'
  const identity = document.createElement('span')
  identity.className = '_3nPmjq_rowIdentity'
  const name = document.createElement('span')
  name.className = '_3nPmjq_rowName'
  name.textContent = route
  identity.appendChild(name)
  head.appendChild(identity)
  const actions = document.createElement('span')
  actions.className = '_3nPmjq_rowActions'
  const edit = document.createElement('button')
  edit.setAttribute('aria-label', `Edit ${route}`)
  actions.appendChild(edit)
  head.appendChild(actions)
  card.appendChild(head)
  list.appendChild(card)
  document.body.appendChild(list)
  // The enable pass owns the seat the chip leads.
  reconcileProviderEnabled(document.body, { t, labels: () => LABELS }, createProviderToggleState())
  return list
}

/** The chip on the page, if any. */
function chip(): HTMLElement | null {
  return document.querySelector<HTMLElement>('[data-bre-provider-balance]')
}

function actionsOf(): HTMLElement {
  return document.querySelector<HTMLElement>('[class*="rowActions"]') as HTMLElement
}

beforeEach(() => {
  document.body.innerHTML = ''
})

afterEach(() => {
  teardownProviderBalance()
  teardownProviderEnabled()
  document.body.innerHTML = ''
  vi.restoreAllMocks()
})

describe('the provider balance chip', () => {
  it('sits immediately in front of the enable switch', async () => {
    const { client } = fakeClient({ ok: true, configured: true, amount: 12.5, currency: 'USD' })
    const state = createProviderBalanceState()
    page('acme')
    reconcileProviderBalance(document.body, deps(client), state)

    await vi.waitFor(() => { expect(chip()).not.toBeNull() })
    const switchButton = actionsOf().querySelector('[data-bre-provider-switch]')
    expect(chip()?.nextElementSibling).toBe(switchButton)
    expect(chip()?.textContent).toBe('Balance $12.5')
    expect(chip()?.getAttribute('title')).toBe('balance hint')
  })

  it('puts the refresh icon after the amount and re-reads on click', async () => {
    let answerSecond: ((value: ProviderBalanceAnswer) => void) | undefined
    const read = vi.fn()
      .mockResolvedValueOnce({ ok: true, configured: true, amount: 5 })
      .mockImplementationOnce(
        () => new Promise<ProviderBalanceAnswer>((resolve) => { answerSecond = resolve }),
      )
    const dependencies: ProviderBalanceDeps = {
      t, labels: () => LABELS, client: { read } as unknown as BalanceClient,
    }
    const state = createProviderBalanceState()
    page('acme')
    reconcileProviderBalance(document.body, dependencies, state)
    await vi.waitFor(() => { expect(chip()?.textContent).toBe('Balance 5') })

    const refresh = chip()?.querySelector<HTMLButtonElement>('[data-bre-provider-balance-refresh]')
    expect(refresh).not.toBeNull()
    // After the amount, inside the same pill.
    expect(refresh?.previousElementSibling?.classList.contains('bre-provider-balance-text')).toBe(true)
    expect(refresh?.getAttribute('aria-label')).toBe('Refresh balance')

    refresh?.click()
    expect(read).toHaveBeenCalledTimes(2)
    // The old amount stays while the refresh is on the wire, and the glyph spins.
    expect(chip()?.textContent).toBe('Balance 5')
    expect(refresh?.classList.contains('is-spinning')).toBe(true)

    answerSecond?.({ ok: true, configured: true, amount: 9 })
    await vi.waitFor(() => { expect(chip()?.textContent).toBe('Balance 9') })
    expect(refresh?.classList.contains('is-spinning')).toBe(false)
  })

  it('never lets the refresh click open the provider row', async () => {
    const { client } = fakeClient({ ok: true, configured: true, amount: 1 })
    const state = createProviderBalanceState()
    page('acme')
    reconcileProviderBalance(document.body, deps(client), state)
    await vi.waitFor(() => { expect(chip()).not.toBeNull() })

    const row = document.querySelector('li')
    if (row === null) throw new Error('no row')
    const rowClick = vi.fn()
    row.addEventListener('click', rowClick)
    chip()?.querySelector<HTMLElement>('[data-bre-provider-balance-refresh]')?.click()
    expect(rowClick).not.toHaveBeenCalled()
  })

  it('renders nothing when the provider has no balance endpoint', async () => {
    const { client, read } = fakeClient({ ok: true, configured: false })
    const state = createProviderBalanceState()
    page('acme')
    reconcileProviderBalance(document.body, deps(client), state)

    await vi.waitFor(() => { expect(read).toHaveBeenCalledTimes(1) })
    expect(chip()).toBeNull()
    // The action group keeps the children it had plus the switch.
    expect(actionsOf().children).toHaveLength(2)
  })

  it('asks once per page opening, and again when the page is reopened', async () => {
    const { client, read } = fakeClient({ ok: true, configured: true, amount: 3 })
    const state = createProviderBalanceState()
    const list = page('acme')
    reconcileProviderBalance(document.body, deps(client), state)
    await vi.waitFor(() => { expect(chip()).not.toBeNull() })

    // Staying on the page does not mean asking again.
    for (let pass = 0; pass < 5; pass += 1) {
      reconcileProviderBalance(document.body, deps(client), state)
    }
    expect(read).toHaveBeenCalledTimes(1)

    // The Models page closes (its provider list leaves the DOM) …
    list.remove()
    reconcileProviderBalance(document.body, deps(client), state)
    // … and opening it again reads exactly once more.
    page('acme')
    reconcileProviderBalance(document.body, deps(client), state)
    await vi.waitFor(() => { expect(read).toHaveBeenCalledTimes(2) })
  })

  it('keeps the last value when a later read fails', async () => {
    let answer: ProviderBalanceAnswer = { ok: true, configured: true, amount: 5 }
    const { client, read } = fakeClient(() => answer)
    const state = createProviderBalanceState()
    const list = page('acme')
    reconcileProviderBalance(document.body, deps(client), state)
    await vi.waitFor(() => { expect(chip()?.textContent).toBe('Balance 5') })

    // Close, then reopen with the endpoint now failing: the amount must stay.
    list.remove()
    reconcileProviderBalance(document.body, deps(client), state)
    answer = { ok: false, configured: true, error: 'timed out' }
    page('acme')
    reconcileProviderBalance(document.body, deps(client), state)
    await vi.waitFor(() => { expect(read).toHaveBeenCalledTimes(2) })
    await new Promise(resolve => { setTimeout(resolve, 10) })
    expect(chip()?.textContent).toBe('Balance 5')
    expect(chip()?.getAttribute('title')).toBe('balance hint')
  })

  it('never asks twice while the page stays open', async () => {
    const { client, read } = fakeClient({ ok: true, configured: true, amount: 1 })
    const state = createProviderBalanceState()
    page('acme')
    reconcileProviderBalance(document.body, deps(client), state)
    await vi.waitFor(() => { expect(chip()).not.toBeNull() })
    for (let pass = 0; pass < 5; pass += 1) {
      reconcileProviderBalance(document.body, deps(client), state)
    }
    expect(read).toHaveBeenCalledTimes(1)
    expect(document.querySelectorAll('[data-bre-provider-balance]')).toHaveLength(1)
  })

  it('re-reads immediately after the balance URL was written', async () => {
    let answer: ProviderBalanceAnswer = { ok: true, configured: false }
    const { client, read } = fakeClient(() => answer)
    const state = createProviderBalanceState()
    page('acme')
    reconcileProviderBalance(document.body, deps(client), state)
    await vi.waitFor(() => { expect(read).toHaveBeenCalledTimes(1) })
    expect(chip()).toBeNull()

    answer = { ok: true, configured: true, amount: 30 }
    invalidateProviderBalance(state, 'acme')
    reconcileProviderBalance(document.body, deps(client), state)
    await vi.waitFor(() => { expect(chip()?.textContent).toBe('Balance 30') })
    expect(read).toHaveBeenCalledTimes(2)
  })

  it('says a configured endpoint failed, but stays silent on a transport failure', async () => {
    let answer: ProviderBalanceAnswer = { ok: false, configured: true, error: 'billing answered 500' }
    const { client } = fakeClient(() => answer)
    const state = createProviderBalanceState()
    page('acme')
    reconcileProviderBalance(document.body, deps(client), state)
    await vi.waitFor(() => { expect(chip()?.textContent).toBe('Balance —') })
    expect(chip()?.getAttribute('title')).toBe('billing answered 500')

    // The host itself did not answer: that says nothing about THIS provider, so
    // the chip goes away rather than turning every row into an error.
    answer = { ok: false }
    invalidateProviderBalance(state, 'acme')
    reconcileProviderBalance(document.body, deps(client), state)
    await vi.waitFor(() => { expect(chip()).toBeNull() })
  })

  it('removes a stale chip when the reading is gone', async () => {
    let answer: ProviderBalanceAnswer = { ok: true, configured: true, amount: 5 }
    const { client } = fakeClient(() => answer)
    const state = createProviderBalanceState()
    page('acme')
    reconcileProviderBalance(document.body, deps(client), state)
    await vi.waitFor(() => { expect(chip()).not.toBeNull() })

    answer = { ok: true, configured: false }
    invalidateProviderBalance(state, 'acme')
    reconcileProviderBalance(document.body, deps(client), state)
    await vi.waitFor(() => { expect(chip()).toBeNull() })
  })

  it('hands every chip back on teardown', async () => {
    const { client } = fakeClient({ ok: true, configured: true, amount: 1 })
    const state = createProviderBalanceState()
    page('acme')
    reconcileProviderBalance(document.body, deps(client), state)
    await vi.waitFor(() => { expect(chip()).not.toBeNull() })

    teardownProviderBalance()
    expect(chip()).toBeNull()
    // The switch is not the chip's to remove.
    expect(document.querySelector('[data-bre-provider-switch]')).not.toBeNull()
  })
})
