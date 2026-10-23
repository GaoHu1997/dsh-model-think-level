// @vitest-environment jsdom
/**
 * Provider-card reshape: field order, protocol-labelled address, 更多端点 toggle
 * and the persisted second endpoint (user items 3, 4, 6, 7).
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { decorateProviderCard, forgetEndpointCache, type EndpointLabels } from '../src/client/injection/provider-endpoints.js'
import type { KeyAnswer, KeyManagerClient } from '../src/client/key-manager-client.js'

const LABELS: EndpointLabels = {
  routeId: ['Provider ID'],
  modelName: ['Display name'],
  baseUrl: ['Base URL'],
  apiProtocol: ['API protocol'],
}

const COPY: Record<string, string> = {
  keysEndpointOpenAI: 'OpenAI',
  keysEndpointAnthropic: 'Anthropic',
  keysMoreEndpoints: 'More endpoints',
}

const t = (key: string): string => COPY[key] ?? key

/** A stand-in transport that records what was persisted. */
function fakeClient(stored: { openai: string | null; anthropic: string | null } = { openai: null, anthropic: null }) {
  const writes: Array<{ route: string; openai: string | undefined; anthropic: string | undefined }> = []
  const list = vi.fn(async (route: string): Promise<KeyAnswer> => ({
    ok: true,
    route,
    entries: [],
    models: [],
    endpoints: { ...stored },
  }))
  const setEndpoints = vi.fn(async (route: string, openai: string | undefined, anthropic: string | undefined): Promise<KeyAnswer> => {
    writes.push({ route, openai, anthropic })
    stored.openai = openai ?? null
    stored.anthropic = anthropic ?? null
    return { ok: true, route, entries: [], models: [], endpoints: { ...stored } }
  })
  const client = { list, setEndpoints } as unknown as KeyManagerClient
  return { client, writes, list, setEndpoints }
}

/**
 * The official card: display name, base URL and API protocol, each in its own
 * wrapper — the shape both the edit card and the add card render.
 */
function buildCard(options: {
  route?: string
  displayName?: boolean
  protocol?: string
} = {}): HTMLElement {
  const card = document.createElement('div')
  card.className = 'editor'
  const fields: string[] = []
  if (options.displayName !== false) {
    fields.push(`<div class="field"><label><span>Display name</span><input aria-label="Display name" value="Acme" /></label></div>`)
  }
  const extra =
    options.protocol === undefined || ['openai-completions', 'anthropic-messages', 'openai-responses'].includes(options.protocol)
      ? ''
      : `<option value="${options.protocol}" selected>${options.protocol}</option>`
  fields.push(
    `<div class="field"><label><span>Base URL</span><input aria-label="Base URL" value="https://gw.example.com/v1" /></label></div>`,
    `<div class="field"><label><span>API protocol</span><select aria-label="API protocol"><option value="openai-completions"${options.protocol === 'openai-completions' ? ' selected' : ''}>openai-completions</option><option value="anthropic-messages"${options.protocol === 'anthropic-messages' ? ' selected' : ''}>anthropic-messages</option><option value="openai-responses"${options.protocol === 'openai-responses' ? ' selected' : ''}>openai-responses</option>${extra}</select></label></div>`,
    `<div class="field"><input aria-label="Provider ID" value="${options.route ?? 'acme'}" /></div>`,
  )
  card.innerHTML = fields.join('')
  document.body.appendChild(card)
  return card
}

/** The label/span text of each field wrapper, in document order. */
function fieldTexts(card: HTMLElement): string[] {
  return Array.from(card.querySelectorAll<HTMLElement>('.field')).map(field => (field.textContent ?? '').replace(/\s+/g, ' ').trim())
}

/** The order the three named fields appear in. */
function orderOf(card: HTMLElement): string[] {
  const names = ['Display name', 'API protocol', 'Base URL']
  return fieldTexts(card)
    .map(text => names.find(name => text.startsWith(name)) ?? '')
    .filter(name => name.length > 0)
}

afterEach(() => {
  document.body.innerHTML = ''
  forgetEndpointCache()
})

describe('the reshaped provider card', () => {
  it('puts display name, then the API protocol, then the base URL', () => {
    const card = buildCard({ protocol: 'openai-completions' })
    // The official card renders display name, address, protocol — the address
    // and the protocol in that order, which is exactly what the user rejected.
    expect(orderOf(card)).toEqual(['Display name', 'Base URL', 'API protocol'])

    decorateProviderCard(card, LABELS, { t })

    expect(orderOf(card)).toEqual(['Display name', 'API protocol', 'Base URL'])
  })

  it('re-orders only once, leaving an already-ordered card alone', () => {
    const card = buildCard({ protocol: 'anthropic-messages' })
    decorateProviderCard(card, LABELS, { t })
    const first = orderOf(card)
    decorateProviderCard(card, LABELS, { t })
    decorateProviderCard(card, LABELS, { t })
    expect(orderOf(card)).toEqual(first)
    expect(first).toEqual(['Display name', 'API protocol', 'Base URL'])
    // The injected nodes are reused, never duplicated by a later scan.
    expect(card.querySelectorAll('[data-bre-endpoint-toggle]')).toHaveLength(1)
    expect(card.querySelectorAll('[data-bre-endpoint-row]')).toHaveLength(1)
    expect(card.querySelectorAll('[data-bre-endpoint-family]')).toHaveLength(1)
  })

  it('reshapes the add card too, which carries no display-name field', () => {
    const card = buildCard({ displayName: false, protocol: 'openai-completions' })
    expect(orderOf(card)).toEqual(['Base URL', 'API protocol'])

    decorateProviderCard(card, LABELS, { t })

    expect(orderOf(card)).toEqual(['API protocol', 'Base URL'])
  })

  it('labels the address with the protocol family the card selects', () => {
    const card = buildCard({ protocol: 'anthropic-messages' })
    decorateProviderCard(card, LABELS, { t })
    const tag = card.querySelector<HTMLElement>('[data-bre-endpoint-family]')
    expect(tag?.textContent).toBe('Anthropic')

    const select = card.querySelector<HTMLSelectElement>('select[aria-label="API protocol"]')
    expect(select).not.toBeNull()
    if (select === null) return
    select.value = 'openai-completions'
    decorateProviderCard(card, LABELS, { t })
    expect(card.querySelector<HTMLElement>('[data-bre-endpoint-family]')?.textContent).toBe('OpenAI')
  })

  it('leaves the address unlabelled while the protocol is not one it knows', () => {
    const card = buildCard({ protocol: 'some-other-api' })
    decorateProviderCard(card, LABELS, { t })
    expect(card.querySelector<HTMLElement>('[data-bre-endpoint-family]')).toBeNull()
  })

  it('offers 更多端点 beside the API-protocol label, revealing a second address', () => {
    const card = buildCard({ protocol: 'openai-completions' })
    decorateProviderCard(card, LABELS, { t })
    const toggle = card.querySelector<HTMLButtonElement>('[data-bre-endpoint-toggle]')
    expect(toggle?.textContent).toBe('More endpoints')

    const row = card.querySelector<HTMLElement>('[data-bre-endpoint-row]')
    expect(row).not.toBeNull()
    expect(row?.hidden).toBe(true)

    toggle?.click()
    expect(card.querySelector<HTMLElement>('[data-bre-endpoint-row]')?.hidden).toBe(false)
    toggle?.click()
    expect(card.querySelector<HTMLElement>('[data-bre-endpoint-row]')?.hidden).toBe(true)
  })

  it('files the second address under the family the main address does not serve', async () => {
    const { client, writes } = fakeClient()
    const card = buildCard({ route: 'acme', protocol: 'openai-completions' })
    decorateProviderCard(card, LABELS, { t, client })
    await vi.waitFor(() => { expect(writes).toHaveLength(0) })

    const row = card.querySelector<HTMLElement>('[data-bre-endpoint-row]')
    const input = row?.querySelector<HTMLInputElement>('.bre-endpoint-url')
    expect(input).not.toBeNull()
    if (input === null || input === undefined) return
    input.value = 'https://api.anthropic.com'
    input.dispatchEvent(new Event('change'))

    await vi.waitFor(() => { expect(writes).toHaveLength(1) })
    // The main address already serves OpenAI, so the second row is Anthropic's.
    expect(writes[0]).toEqual({ route: 'acme', openai: '', anthropic: 'https://api.anthropic.com' })
  })

  it('fills the second row from what the route already stores', async () => {
    const { client } = fakeClient({ openai: null, anthropic: 'https://api.anthropic.com' })
    const card = buildCard({ route: 'acme', protocol: 'openai-responses' })
    decorateProviderCard(card, LABELS, { t, client })

    const input = card.querySelector<HTMLInputElement>('.bre-endpoint-url')
    expect(input).not.toBeNull()
    await vi.waitFor(() => { expect(input?.value).toBe('https://api.anthropic.com') })
  })

  it('does not touch the node tree when the card lacks a protocol field', () => {
    const card = document.createElement('div')
    card.className = 'editor'
    card.innerHTML = '<div class="field"><input aria-label="Base URL" value="https://gw.example.com/v1" /></div>'
    document.body.appendChild(card)
    const before = card.innerHTML
    decorateProviderCard(card, LABELS, { t })
    expect(card.innerHTML).toBe(before)
  })
})
