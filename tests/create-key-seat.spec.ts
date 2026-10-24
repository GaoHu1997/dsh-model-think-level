/**
 * The create-provider card's draft key list: the seat that mounts it under the
 * official key field, the seed it takes out of a value the user had already
 * typed, and the session-ledger staging its pane performs as the id field
 * changes — the seat-level twin of what `create-card-pane.spec` pins for the
 * headers pane.
 */

// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ReactNode } from 'react'
import type { Translate } from '@deepseek-ai/dsh-client-ui-slots'
import {
  enhanceCreateKeySeat,
  resetCreateKeySeat,
  teardownCreateKeySeats,
  type CreateKeySeatDeps,
} from '../src/client/injection/create-key-seat.js'
import { createStagedKeysState, type StagedKeysState } from '../src/client/injection/staged-keys.js'
import { en } from '../src/client/locales.js'
import type { RemoteApi } from '../src/client/types.js'

const t = ((key: string): string => (en as Record<string, string>)[key] ?? key) as unknown as Translate

/** The settings Remote the pane's baseline reads ride: an empty namespace. */
function fakeApi(): RemoteApi {
  return {
    settings: {
      describe: async () => ({
        ok: true,
        value: {
          namespaces: [{ ns: 'llm-pi-ai', revision: 1, value: {}, user: {}, base: {} }],
          writable: true,
        },
      }),
    },
  } as unknown as RemoteApi
}

function deps(staged: StagedKeysState = createStagedKeysState()): CreateKeySeatDeps {
  return {
    t,
    api: fakeApi(),
    routeIdLabels: () => ['customRoute', 'Provider ID'],
    staged,
    refreshed: (children: () => ReactNode): ReactNode => children(),
  }
}

interface Fixture {
  readonly root: HTMLElement
  readonly card: HTMLElement
  readonly customPanel: HTMLElement
  readonly routeInput: HTMLInputElement
  readonly keyField: HTMLElement
  readonly keyInput: HTMLInputElement
}

/** The create card's custom half: an id field, a base URL field, a key field. */
function buildCard(): Fixture {
  const root = document.createElement('div')
  root.innerHTML = `
    <ul class="rows">
      <li class="addCard">
        <div class="addPanel" id=":r1:-custom-panel" role="tabpanel">
          <div class="editor">
            <div class="field"><input aria-label="Provider ID" /></div>
            <div class="field"><input aria-label="Base URL" /></div>
            <div class="field"><input aria-label="API key" type="password" /></div>
            <div class="editorActions"><button type="button">Create</button></div>
          </div>
        </div>
      </li>
    </ul>
  `
  document.body.appendChild(root)
  const card = root.querySelector('li.addCard') as HTMLElement
  const customPanel = root.querySelector('#\\:r1\\:-custom-panel') as HTMLElement
  const routeInput = customPanel.querySelector<HTMLInputElement>('input[aria-label="Provider ID"]')!
  const keyInput = customPanel.querySelector<HTMLInputElement>('input[aria-label="API key"]')!
  return { root, card, customPanel, routeInput, keyField: keyInput.parentElement as HTMLElement, keyInput }
}

/** The seat's host right after the key field. */
function seatHostOf(fixture: Fixture): HTMLElement | null {
  const next = fixture.keyField.nextElementSibling
  return next instanceof HTMLElement && next.hasAttribute('data-bre-create-keys') ? next : null
}

/** Let React's scheduled renders, the pane's reads and their answers settle. */
async function flush(turns = 6): Promise<void> {
  for (let turn = 0; turn < turns; turn += 1) {
    await new Promise(resolve => setTimeout(resolve, 0))
  }
}

/** Type into an input the way a browser does. */
function type(input: HTMLInputElement, value: string): void {
  const descriptor = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')
  descriptor?.set?.call(input, value)
  input.dispatchEvent(new Event('input', { bubbles: true }))
}

function buttonByText(scope: HTMLElement, text: string): HTMLButtonElement {
  const found = Array.from(scope.querySelectorAll('button')).find(button => button.textContent === text)
  if (found === undefined) throw new Error(`no button "${text}"`)
  return found
}

let warnings: ReturnType<typeof vi.spyOn>

beforeEach(() => {
  warnings = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
})

afterEach(() => {
  teardownCreateKeySeats()
  document.body.innerHTML = ''
  warnings.mockRestore()
})

describe('the seat', () => {
  it('mounts the draft list under the key field, and only there', async () => {
    const fixture = buildCard()
    for (const field of Array.from(fixture.customPanel.querySelectorAll<HTMLElement>('.field'))) {
      enhanceCreateKeySeat(field, deps())
    }
    await flush()

    expect(fixture.keyField.classList.contains('bre-key-managed')).toBe(true)
    const host = seatHostOf(fixture)
    expect(host).not.toBeNull()
    // The list itself: the draft pane's add entry, from the same component the
    // edit card renders.
    expect(host?.querySelector('.bre-keys-add')).not.toBeNull()

    // The id and base-URL fields are not key fields: no host, no handover.
    const routeField = fixture.routeInput.parentElement as HTMLElement
    expect(routeField.classList.contains('bre-key-managed')).toBe(false)
    expect(routeField.nextElementSibling?.hasAttribute?.('data-bre-create-keys')).toBeFalsy()
  })

  it('is idempotent across scans', async () => {
    const fixture = buildCard()
    const seat = deps()
    enhanceCreateKeySeat(fixture.keyField, seat)
    await flush()
    const first = seatHostOf(fixture)

    enhanceCreateKeySeat(fixture.keyField, seat)
    await flush()

    expect(fixture.customPanel.querySelectorAll('[data-bre-create-keys]')).toHaveLength(1)
    expect(seatHostOf(fixture)).toBe(first)
  })

  it('seeds a value the user had already typed as the first draft row', async () => {
    const fixture = buildCard()
    fixture.keyInput.value = 'sk-already-typed-01'

    enhanceCreateKeySeat(fixture.keyField, deps())
    await flush()

    const host = seatHostOf(fixture)
    // The head-and-tail mask, not the value: the row reads exactly like a
    // stored one will after the create.
    expect(host?.querySelector('.bre-keys-mask')?.textContent).toBe('sk-a...d-01')
    // The official form no longer holds the value — its own 保存 would store it
    // as the provider's single key beside the list the drain writes.
    expect(fixture.keyInput.value).toBe('')
  })

  it('mirrors the field’s pane region onto the host', async () => {
    const fixture = buildCard()
    fixture.keyField.setAttribute('data-bre-region', 'provider')

    enhanceCreateKeySeat(fixture.keyField, deps())
    await flush()

    expect(seatHostOf(fixture)?.getAttribute('data-bre-region')).toBe('provider')
  })

  it('hands the field back on reset, host and all', async () => {
    const fixture = buildCard()
    enhanceCreateKeySeat(fixture.keyField, deps())
    await flush()

    resetCreateKeySeat(fixture.keyField)

    expect(fixture.keyField.classList.contains('bre-key-managed')).toBe(false)
    expect(seatHostOf(fixture)).toBeNull()
  })

  it('sweeps a host left behind by a dead fiber', () => {
    const fixture = buildCard()
    const stray = document.createElement('div')
    stray.setAttribute('data-bre-create-keys', '')
    fixture.keyField.after(stray)

    teardownCreateKeySeats()

    expect(document.querySelectorAll('[data-bre-create-keys]')).toHaveLength(0)
  })
})

describe('the pane’s staging', () => {
  /** The card with its seat up, plus the ledger it stages into. */
  async function seated(): Promise<{ fixture: Fixture; staged: StagedKeysState }> {
    const fixture = buildCard()
    const staged = createStagedKeysState()
    for (const field of Array.from(fixture.customPanel.querySelectorAll<HTMLElement>('.field'))) {
      enhanceCreateKeySeat(field, deps(staged))
    }
    await flush()
    return { fixture, staged }
  }

  /** Add one key through the list's own form, the way a user does. */
  async function addKey(fixture: Fixture, value: string, alias: string): Promise<void> {
    buttonByText(fixture.customPanel, en.keysAdd).click()
    await flush()
    const form = fixture.customPanel.querySelector('.bre-keys-form') as HTMLElement
    const inputs = Array.from(form.querySelectorAll('input')) as HTMLInputElement[]
    if (alias.length > 0) type(inputs[0]!, alias)
    type(inputs[inputs.length - 1]!, value)
    await flush()
    buttonByText(fixture.customPanel, en.keysAddConfirm).click()
    await flush()
  }

  it('stages drafts under the id the field reads as they are added', async () => {
    const { fixture, staged } = await seated()
    type(fixture.routeInput, 'my-api')

    await addKey(fixture, 'sk-first-draft-01', 'Team')

    expect(staged.intents.size).toBe(1)
    const intent = staged.intents.get('my-api')
    expect(intent?.drafts).toHaveLength(1)
    expect(intent?.drafts[0]?.value).toBe('sk-first-draft-01')
    expect(intent?.drafts[0]?.alias).toBe('Team')
    // The pane asked the document about the id, and the answer was recorded.
    expect(intent?.declaredBefore).toBe(false)
  })

  it('holds drafts keyed to no route until an id is typed', async () => {
    const { fixture, staged } = await seated()

    // No id yet: the draft exists on screen but the ledger has no key for it.
    await addKey(fixture, 'sk-orphan-draft-001', '')
    expect(staged.intents.size).toBe(0)
    expect(fixture.customPanel.querySelectorAll('.bre-keys-row')).toHaveLength(1)

    // The id arrives: the same draft is filed under it.
    type(fixture.routeInput, 'my-api')
    await flush()
    expect(staged.intents.get('my-api')?.drafts).toHaveLength(1)
  })

  it('moves the held list when the id is retyped', async () => {
    const { fixture, staged } = await seated()
    type(fixture.routeInput, 'my-api')
    await addKey(fixture, 'sk-first-draft-01', '')

    type(fixture.routeInput, 'other-api')
    await flush()

    expect(staged.intents.has('my-api')).toBe(false)
    expect(staged.intents.get('other-api')?.drafts).toHaveLength(1)
  })

  it('withdraws the intent when the last draft is removed', async () => {
    const { fixture, staged } = await seated()
    type(fixture.routeInput, 'my-api')
    await addKey(fixture, 'sk-first-draft-01', '')

    buttonByText(fixture.customPanel, en.keysRemove).click()
    await flush()
    buttonByText(fixture.customPanel, en.keysConfirmRemove).click()
    await flush()

    expect(staged.intents.size).toBe(0)
  })

  it('releases the held list when the seat comes down', async () => {
    const { fixture, staged } = await seated()
    type(fixture.routeInput, 'my-api')
    await addKey(fixture, 'sk-first-draft-01', '')

    resetCreateKeySeat(fixture.keyField)
    await flush()

    expect(staged.intents.get('my-api')?.releasedAt).toBeDefined()
  })
})
