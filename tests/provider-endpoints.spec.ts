// @vitest-environment jsdom
/**
 * Provider-card reshape: field order, protocol-labelled address, 更多端点 toggle
 * and the persisted second endpoint (user items 3, 4, 6, 7).
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { decorateProviderCard, forgetEndpointCache, teardownProviderEndpoints, type EndpointLabels } from '../src/client/injection/provider-endpoints.js'
import type { KeyAnswer, KeyManagerClient } from '../src/client/key-manager-client.js'
import { STYLES } from '../src/client/styles.js'

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

  it('seats the family tag on the input’s left, not on a line above it', () => {
    // The official field is a column flex box (title, then control), so a tag
    // injected before the control would get a line of its own. The wrapper is
    // marked so the stylesheet can lay the tag and the input out side by side,
    // while the field's own title keeps the full width above them.
    const card = buildCard({ protocol: 'anthropic-messages' })
    decorateProviderCard(card, LABELS, { t })
    const field = card.querySelector<HTMLElement>('[data-bre-endpoint-field]')
    expect(field).not.toBeNull()
    const tag = field?.querySelector<HTMLElement>('[data-bre-endpoint-family]')
    const input = field?.querySelector<HTMLInputElement>('input[aria-label="Base URL"]')
    // Directly before the input: the two share the address row.
    expect(tag?.nextElementSibling).toBe(input)
    // The field's title comes first, and is marked so the grid spans it. The
    // disclosure shares that line, so the label text is what the node STARTS with.
    expect(tag?.previousElementSibling?.hasAttribute('data-bre-endpoint-title')).toBe(true)
    expect(field?.querySelector('[data-bre-endpoint-title]')?.textContent?.startsWith('Base URL')).toBe(true)
    // The stylesheet really lays this row out as a two-column grid.
    expect(STYLES).toContain('[data-bre-endpoint-field] {')
    expect(STYLES).toContain('grid-template-columns: max-content minmax(0, 1fr);')
  })

  it('drops the row marks when the protocol loses its family', () => {
    // An empty first column would still indent the input by the column gap, so
    // an unlabelled address must go back to the host's own column layout.
    const card = buildCard({ protocol: 'openai-completions' })
    decorateProviderCard(card, LABELS, { t })
    expect(card.querySelector('[data-bre-endpoint-field]')).not.toBeNull()

    const select = card.querySelector<HTMLSelectElement>('select[aria-label="API protocol"]')
    expect(select).not.toBeNull()
    if (select === null) return
    select.value = 'some-other-api'
    decorateProviderCard(card, LABELS, { t })
    expect(card.querySelector('[data-bre-endpoint-field]')).toBeNull()
    expect(card.querySelector('[data-bre-endpoint-title]')).toBeNull()
  })

  it('offers 更多端点 under the address, revealing a second address', () => {
    const card = buildCard({ protocol: 'openai-completions' })
    decorateProviderCard(card, LABELS, { t })
    const toggle = card.querySelector<HTMLButtonElement>('[data-bre-endpoint-toggle]')
    expect(toggle?.textContent).toBe('More endpoints')
    // The caret (a ::after glyph) needs the state on the button itself.
    expect(toggle?.getAttribute('aria-expanded')).toBe('false')

    const row = card.querySelector<HTMLElement>('[data-bre-endpoint-row]')
    expect(row).not.toBeNull()
    expect(row?.hidden).toBe(true)

    toggle?.click()
    expect(toggle?.getAttribute('aria-expanded')).toBe('true')
    expect(card.querySelector<HTMLElement>('[data-bre-endpoint-row]')?.hidden).toBe(false)
    toggle?.click()
    expect(toggle?.getAttribute('aria-expanded')).toBe('false')
    expect(card.querySelector<HTMLElement>('[data-bre-endpoint-row]')?.hidden).toBe(true)
  })

  it('puts 更多端点 on the address label line, right after the label text', () => {
    // User item 4: the disclosure belongs to the address it adds to, and it rides
    // that field's own label line instead of taking one of its own.
    const card = buildCard({ protocol: 'openai-completions' })
    decorateProviderCard(card, LABELS, { t })
    const toggle = card.querySelector<HTMLElement>('[data-bre-endpoint-toggle]')
    if (toggle === null) throw new Error('no disclosure')

    const urlGroup = card.querySelector<HTMLElement>('[data-bre-endpoint-field]')
    expect(urlGroup).not.toBeNull()
    // Inside the address field's title node, after the label's own text.
    expect(urlGroup?.contains(toggle)).toBe(true)
    const title = toggle.parentElement
    expect(title?.hasAttribute('data-bre-endpoint-title')).toBe(true)
    expect(title?.lastElementChild).toBe(toggle)
    expect((title?.textContent ?? '').startsWith('Base URL')).toBe(true)
    // It is not a sibling of the field group any more, and not in the row.
    expect(toggle.previousElementSibling).not.toBe(urlGroup)
    expect(card.querySelector('[data-bre-endpoint-row]')?.contains(toggle)).toBe(false)
  })

  it('keeps the second address row out of the way until it is asked for', () => {
    // A row that is injected but visible would defeat the whole point: the card
    // must keep its single-address shape. `hidden` alone only works because the
    // stylesheet also carries a `[hidden]` rule for this row, asserted below.
    for (const protocol of ['openai-completions', 'openai-responses', 'anthropic-messages']) {
      document.body.innerHTML = ''
      const card = buildCard({ protocol })
      decorateProviderCard(card, LABELS, { t })
      expect(card.querySelector<HTMLElement>('[data-bre-endpoint-row]')?.hidden).toBe(true)
      document.body.removeChild(card)
    }
  })

  it('files the second address next to the main one, blanking only its own empty side', async () => {
    const { client, writes } = fakeClient()
    const card = buildCard({ route: 'acme', protocol: 'openai-completions' })
    decorateProviderCard(card, LABELS, { t, client })
    // The card's own field already shows an address, so the store learns it first.
    await vi.waitFor(() => { expect(writes).toHaveLength(1) })
    expect(writes[0]).toEqual({ route: 'acme', openai: 'https://gw.example.com/v1', anthropic: '' })

    const row = card.querySelector<HTMLElement>('[data-bre-endpoint-row]')
    const input = row?.querySelector<HTMLInputElement>('.bre-endpoint-url')
    expect(input).not.toBeNull()
    if (input === null || input === undefined) return
    input.value = 'https://api.anthropic.com'
    input.dispatchEvent(new Event('change'))

    await vi.waitFor(() => { expect(writes).toHaveLength(2) })
    // The main address already serves OpenAI, so the second row is Anthropic's.
    // BOTH sides travel: that is what keeps a write for one address from blanking
    // the other.
    expect(writes[1]).toEqual({
      route: 'acme',
      openai: 'https://gw.example.com/v1',
      anthropic: 'https://api.anthropic.com',
    })
  })

  it('serializes concurrent endpoint edits so neither family update is lost', async () => {
    // The main side is already stored, so the cards have nothing of their own to file
    // and the two edits are the only writes that race.
    const { client, writes } = fakeClient({ openai: 'https://gw.example.com/v1', anthropic: null })
    const first = buildCard({ route: 'acme', protocol: 'openai-completions' })
    const second = buildCard({ route: 'acme', protocol: 'openai-completions' })
    decorateProviderCard(first, LABELS, { t, client })
    decorateProviderCard(second, LABELS, { t, client })

    const inputA = first.querySelector<HTMLInputElement>('.bre-endpoint-url')
    const inputB = second.querySelector<HTMLInputElement>('.bre-endpoint-url')
    if (inputA === null || inputB === null) throw new Error('a card has no second row')
    inputA.value = 'https://anthropic.example'
    inputB.value = 'https://anthropic-new.example'
    inputA.dispatchEvent(new Event('change'))
    inputB.dispatchEvent(new Event('change'))

    await vi.waitFor(() => { expect(writes).toHaveLength(2) })
    expect(writes[0]).toMatchObject({ openai: 'https://gw.example.com/v1', anthropic: 'https://anthropic.example' })
    expect(writes[1]).toMatchObject({ openai: 'https://gw.example.com/v1', anthropic: 'https://anthropic-new.example' })
  })

  it('keeps the main address when the second row is edited', async () => {
    // The regression this pins: an earlier second-row write sent '' for the main
    // side and wiped the address the provider had configured.
    const { client, writes } = fakeClient({ openai: 'https://api.openai.example/v1', anthropic: null })
    const card = buildCard({ route: 'acme', protocol: 'openai-completions' })
    decorateProviderCard(card, LABELS, { t, client })

    const input = card.querySelector<HTMLInputElement>('.bre-endpoint-url')
    if (input === null) throw new Error('the card has no second row')
    input.value = 'https://api.anthropic.com'
    input.dispatchEvent(new Event('change'))

    await vi.waitFor(() => { expect(writes).toHaveLength(1) })
    expect(writes[0]).toEqual({
      route: 'acme',
      openai: 'https://api.openai.example/v1',
      anthropic: 'https://api.anthropic.com',
    })
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

  it('hides a collapsed second row in CSS, since `display: flex` beats the UA rule', () => {
    // The row sets `display: flex`, which outranks the user agent's
    // `[hidden] { display: none }`. Without an explicit rule the injected row
    // would be on screen from the first scan (the reported bug).
    expect(STYLES).toContain('.bre-endpoint-row[hidden] { display: none; }')
    // 更多端点 reads as an aside under the address it adds to.
    expect(STYLES).toContain('.bre-endpoint-toggle {')
    expect(STYLES).toContain('font-size: 12px;')
  })

  it('picks the API protocol from cards while the host keeps its own value', () => {
    // The card has to keep writing through the host's <select>: the host owns the
    // save path and the validation, so the cards are a skin over that control,
    // never a second source of truth.
    const card = buildCard({ protocol: 'openai-completions' })
    const changes: string[] = []
    const select = card.querySelector<HTMLSelectElement>('select')
    if (select === null) throw new Error('the fixture lost its select')
    select.addEventListener('change', () => changes.push(select.value))
    decorateProviderCard(card, LABELS, { t })

    expect(select.hidden).toBe(true)
    expect(select.getAttribute('data-bre-protocol-source')).toBe('1')

    const cards = Array.from(card.querySelectorAll<HTMLButtonElement>('[data-bre-protocol-value]'))
    expect(cards.map((button) => button.textContent)).toEqual(
      Array.from(select.options).map((option) => option.text.trim()),
    )
    expect(cards.map((button) => button.getAttribute('data-bre-protocol-value'))).toEqual(
      Array.from(select.options).map((option) => option.value),
    )
    // The card the host holds is the one drawn as chosen, and only it is.
    expect(cards.filter((button) => button.classList.contains('is-selected'))).toHaveLength(1)
    const chosen = cards.find((button) => button.classList.contains('is-selected'))
    expect(chosen?.getAttribute('data-bre-protocol-value')).toBe('openai-completions')
    expect(chosen?.getAttribute('aria-checked')).toBe('true')

    const anthropic = cards.find((button) => button.getAttribute('data-bre-protocol-value') === 'anthropic-messages')
    if (anthropic === undefined) throw new Error('no Anthropic card')
    anthropic.click()
    expect(select.value).toBe('anthropic-messages')
    // A React-controlled select only learns about it through these events.
    expect(changes).toEqual(['anthropic-messages'])
    expect(anthropic.classList.contains('is-selected')).toBe(true)
    expect(anthropic.getAttribute('aria-checked')).toBe('true')
    expect(chosen?.classList.contains('is-selected')).toBe(false)

    // Only the chosen card is a tab stop, so the arrow keys have to walk the rest.
    const group = card.querySelector<HTMLElement>('[data-bre-protocol-cards]')
    if (group === null) throw new Error('no group')
    expect(cards.map((button) => button.tabIndex)).toEqual([-1, 0, -1])
    anthropic.focus()
    group.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true }))
    expect(select.value).toBe('openai-completions')
    expect(document.activeElement).toBe(cards[0])
  })

  it('re-reads the cards when the host swaps a protocol label', () => {
    const card = buildCard({ protocol: 'openai-completions' })
    decorateProviderCard(card, LABELS, { t })
    const select = card.querySelector<HTMLSelectElement>('select')
    if (select === null) throw new Error('the fixture lost its select')
    const option = select.options[0]
    if (option === undefined) throw new Error('the fixture lost its first option')
    option.text = 'OpenAI chat'
    decorateProviderCard(card, LABELS, { t })
    const cards = Array.from(card.querySelectorAll('[data-bre-protocol-value]'))
    expect(cards.map((button) => button.textContent)).toEqual(
      Array.from(select.options).map((entry) => entry.text.trim()),
    )
  })

  it('puts 更多端点 on the address label line, with the second address beneath the field', () => {
    // User item 4: the disclosure rides the address's label line; the row it opens
    // still appears directly under the field group.
    const card = buildCard({ protocol: 'openai-completions' })
    decorateProviderCard(card, LABELS, { t })
    const toggle = card.querySelector<HTMLElement>('[data-bre-endpoint-toggle]')
    const row = card.querySelector<HTMLElement>('[data-bre-endpoint-row]')
    const urlGroup = card.querySelector<HTMLElement>('[data-bre-endpoint-field]')
    if (toggle === null || row === null || urlGroup === null) throw new Error('the card lost a part')
    expect(urlGroup.contains(toggle)).toBe(true)
    expect(card.contains(urlGroup.querySelector('input'))).toBe(true)
    expect(row.previousElementSibling).toBe(urlGroup)
    expect(row.hidden).toBe(true)
    // The protocol field is still the one above; the disclosure did not stay there.
    expect(card.querySelector('.field:nth-child(2)')?.contains(toggle)).toBe(false)
  })

  it('lets both address inputs fill their row instead of capping one at 240px', () => {
    // User item 5: the main address is the host's own input, uncapped, so the
    // injected one used to end early and the two did not line up.
    expect(STYLES).toContain('.bre-endpoint-url {')
    expect(STYLES).toContain('max-width: none;')
    expect(STYLES).toContain('.bre-protocol-card.is-selected {')
  })

  it('follows the protocol: the address relabels as soon as it changes', () => {
    // User item 1: the tag and the second row name the protocol on show, so they
    // have to move with it instead of waiting for the next re-render.
    const card = buildCard({ protocol: 'openai-completions' })
    decorateProviderCard(card, LABELS, { t })
    const select = card.querySelector<HTMLSelectElement>('select[aria-label="API protocol"]')
    const tag = card.querySelector<HTMLElement>('[data-bre-endpoint-family]')
    const rowTag = card.querySelector<HTMLElement>('[data-bre-endpoint-row] .bre-endpoint-family')
    if (select === null || tag === null || rowTag === null) throw new Error('the card lost a part')
    expect(tag.textContent).toBe('OpenAI')
    expect(rowTag.textContent).toBe('Anthropic')
    select.value = 'anthropic-messages'
    select.dispatchEvent(new Event('change', { bubbles: true }))
    expect(tag.textContent).toBe('Anthropic')
    expect(rowTag.textContent).toBe('OpenAI')
  })

  it('moves the visible address to the family being left, and shows the one arriving', async () => {
    // Switching families must not lose what the field was showing: the value it
    // held belongs to the family coming off screen, and the family coming on brings
    // its own stored address (user item 1 — no tab switch needed).
    const store = { openai: null as string | null, anthropic: 'https://anthropic.example' }
    const { client, writes } = fakeClient(store)
    const card = buildCard({ protocol: 'openai-completions' })
    decorateProviderCard(card, LABELS, { t, client })
    const select = card.querySelector<HTMLSelectElement>('select[aria-label="API protocol"]')
    const input = card.querySelector<HTMLInputElement>('input[aria-label="Base URL"]')
    const row = card.querySelector<HTMLElement>('[data-bre-endpoint-row]')
    if (select === null || input === null || row === null) throw new Error('the card lost a part')
    select.value = 'anthropic-messages'
    select.dispatchEvent(new Event('change', { bubbles: true }))
    const settle = async (): Promise<void> => {
      for (let turn = 0; turn < 3; turn += 1) await new Promise(resolve => setTimeout(resolve, 0))
    }
    await settle()
    // The OpenAI side had no stored address, so what the field showed is filed there.
    expect(writes).toContainEqual({
      route: 'acme',
      openai: 'https://gw.example.com/v1',
      anthropic: 'https://anthropic.example',
    })
    expect(input.value).toBe('https://anthropic.example')
    // The row now carries the family that came off screen, with its newly filed URL.
    expect(row.querySelector<HTMLInputElement>('input')?.value).toBe('https://gw.example.com/v1')
    expect(row.querySelector<HTMLElement>('.bre-endpoint-family')?.textContent).toBe('OpenAI')
  })

  it('reads the route off the card row, since the edit card names no route field', async () => {
    // The EDIT card has no Provider ID input at all — only the create card does —
    // so the route comes from the row the tab pass publishes it on. Without it the
    // address swap could never be saved.
    const { client, writes } = fakeClient()
    const card = buildCard({ protocol: 'openai-completions' })
    card.querySelector('input[aria-label="Provider ID"]')?.parentElement?.remove()
    const row = document.createElement('div')
    row.setAttribute('data-bre-row-provider', 'ofox')
    row.appendChild(card)
    document.body.appendChild(row)
    decorateProviderCard(card, LABELS, { t, client })

    // Filing the address the card already shows proves the route was found: a card
    // with no route files nothing at all.
    await vi.waitFor(() => { expect(writes).toHaveLength(1) })
    expect(writes[0]).toEqual({ route: 'ofox', openai: 'https://gw.example.com/v1', anthropic: '' })

    const input = card.querySelector<HTMLInputElement>('.bre-endpoint-url')
    if (input === null) throw new Error('the card has no second row')
    input.value = 'https://api.anthropic.com'
    input.dispatchEvent(new Event('change'))

    await vi.waitFor(() => { expect(writes).toHaveLength(2) })
    expect(writes[1]).toEqual({
      route: 'ofox',
      openai: 'https://gw.example.com/v1',
      anthropic: 'https://api.anthropic.com',
    })
  })

  it('learns the address a provider already shows, so its protocol can be picked', async () => {
    // The regression: an Anthropic provider whose address was typed straight into
    // the card's own field had nothing in `endpoints`, so the key picker offered no
    // Anthropic protocol at all for the very family that provider serves.
    const { client, writes } = fakeClient()
    const card = buildCard({ route: 'ofox-anthropic', protocol: 'anthropic-messages' })
    const control = card.querySelector<HTMLInputElement>('input[aria-label="Base URL"]')
    if (control === null) throw new Error('the card has no address field')
    control.value = 'https://api.ofox.io/anthropic'
    decorateProviderCard(card, LABELS, { t, client })

    await vi.waitFor(() => { expect(writes).toHaveLength(1) })
    expect(writes[0]).toEqual({
      route: 'ofox-anthropic',
      openai: '',
      anthropic: 'https://api.ofox.io/anthropic',
    })
  })

  it('files an address typed into the card’s own field', async () => {
    const { client, writes } = fakeClient()
    const card = buildCard({ route: 'ofox-anthropic', protocol: 'anthropic-messages' })
    const control = card.querySelector<HTMLInputElement>('input[aria-label="Base URL"]')
    if (control === null) throw new Error('the card has no address field')
    // Nothing to learn while the field is empty.
    control.value = ''
    decorateProviderCard(card, LABELS, { t, client })
    await vi.waitFor(() => { expect(writes).toHaveLength(0) })

    control.value = 'https://api.ofox.io/anthropic'
    control.dispatchEvent(new Event('change'))

    await vi.waitFor(() => { expect(writes).toHaveLength(1) })
    expect(writes[0]).toEqual({
      route: 'ofox-anthropic',
      openai: '',
      anthropic: 'https://api.ofox.io/anthropic',
    })
  })

  it('never overwrites an address the store already holds', async () => {
    // Learning what the card shows must not clobber the plugin's own routing data:
    // the second row is how that value is changed.
    const { client, writes } = fakeClient({ openai: 'https://stored.example/v1', anthropic: null })
    const card = buildCard({ route: 'acme', protocol: 'openai-completions' })
    decorateProviderCard(card, LABELS, { t, client })
    await vi.waitFor(() => { expect(writes).toHaveLength(0) })
  })

  it('lets an edit of that field replace the address already stored', async () => {
    // Decorating only repairs an unknown address; a change the user makes in the
    // field is the address now, and keys pinned to that family must dial it.
    const { client, writes } = fakeClient({ openai: 'https://old.example/v1', anthropic: null })
    const card = buildCard({ route: 'acme', protocol: 'openai-completions' })
    decorateProviderCard(card, LABELS, { t, client })
    await vi.waitFor(() => { expect(writes).toHaveLength(0) })

    const control = card.querySelector<HTMLInputElement>('input[aria-label="Base URL"]')
    if (control === null) throw new Error('the card has no address field')
    control.value = 'https://new.example/v1'
    control.dispatchEvent(new Event('change'))

    await vi.waitFor(() => { expect(writes).toHaveLength(1) })
    expect(writes[0]).toEqual({
      route: 'acme',
      openai: 'https://new.example/v1',
      anthropic: '',
    })
  })

  it('leaves the addresses alone when only the wire changes, not the family', async () => {
    const { client, writes } = fakeClient({ openai: 'https://openai.example', anthropic: null })
    const card = buildCard({ protocol: 'openai-completions' })
    decorateProviderCard(card, LABELS, { t, client })
    const select = card.querySelector<HTMLSelectElement>('select[aria-label="API protocol"]')
    const input = card.querySelector<HTMLInputElement>('input[aria-label="Base URL"]')
    if (select === null || input === null) throw new Error('the card lost a part')
    select.value = 'openai-responses'
    select.dispatchEvent(new Event('change', { bubbles: true }))
    await new Promise(resolve => setTimeout(resolve, 0))
    expect(input.value).toBe('https://gw.example.com/v1')
    expect(writes).toEqual([])
  })

  it('draws 更多端点 a chevron that turns over, with no underline on hover', () => {
    // User item 2: the disclosure mark is drawn (two strokes) rather than typed,
    // and hovering recolours the link instead of underlining it.
    expect(STYLES).toContain('.bre-endpoint-toggle::after {')
    expect(STYLES).toContain("content: '';")
    expect(STYLES).toContain('transform: rotate(45deg);')
    expect(STYLES).toContain(".bre-endpoint-toggle[aria-expanded='true']::after {")
    expect(STYLES).toContain('transform: rotate(225deg);')
    expect(STYLES).toContain('text-decoration: none;')
  })

  it('draws the protocol cards as one segmented bar, not three loose buttons', () => {
    // User item 1: the segments share a track and the chosen one owns the pill.
    expect(STYLES).toContain('.bre-protocol-cards {')
    expect(STYLES).toContain('background: var(--dsw-alias-fill-tertiary, rgba(120, 125, 140, .09));')
    expect(STYLES).toContain('.bre-protocol-card.is-selected {')
    expect(STYLES).toContain('background: var(--dsw-alias-bg-layer-1, #fff);')
  })

  it('greys the key list’s own links while keeping danger visible', () => {
    expect(STYLES).toContain('.bre-keys-actions .bre-link-button {')
    expect(STYLES).toContain('color: var(--dsw-alias-label-secondary, #61666b);')
    expect(STYLES).toContain('.bre-keys-actions .bre-keys-danger {')
  })
})

describe('teardown', () => {
  it('hands the card back: every injected node and mark comes out', () => {
    const card = buildCard({ protocol: 'openai-completions' })
    decorateProviderCard(card, LABELS, { t })
    const select = card.querySelector<HTMLSelectElement>('select[aria-label="API protocol"]')
    if (select === null) throw new Error('the card has no protocol select')
    // The dressing is all there before the teardown: hidden select, protocol
    // cards, family tag, 更多端点 toggle, second row, and the field-order mark.
    expect(select.hidden).toBe(true)
    expect(card.querySelector('[data-bre-protocol-cards]')).not.toBeNull()
    expect(card.querySelector('[data-bre-endpoint-family]')).not.toBeNull()
    expect(card.querySelector('[data-bre-endpoint-toggle]')).not.toBeNull()
    expect(card.querySelector('[data-bre-endpoint-row]')).not.toBeNull()
    expect(card.hasAttribute('data-bre-field-order')).toBe(true)

    teardownProviderEndpoints()

    // Nothing this module injected survives a disabled plugin: the select is
    // the host's own control again, and every plugin node and mark is gone.
    expect(select.hidden).toBe(false)
    expect(card.querySelector('[data-bre-protocol-cards]')).toBeNull()
    expect(card.querySelector('[data-bre-endpoint-family]')).toBeNull()
    expect(card.querySelector('[data-bre-endpoint-toggle]')).toBeNull()
    expect(card.querySelector('[data-bre-endpoint-row]')).toBeNull()
    expect(card.hasAttribute('data-bre-field-order')).toBe(false)
  })
})
