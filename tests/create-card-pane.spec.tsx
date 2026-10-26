/**
 * The create-provider card's 高级配置 pane, mounted where `add-card` mounts it.
 *
 * The card this pane lives in is the one the settings document knows nothing
 * about yet: its provider id is being TYPED. So these tests are about the two
 * things that only exist in that situation — the pane reading the id off the
 * live form (the form's React state is not ours to subscribe to, so the DOM
 * event is the whole interface), and the draft it edits having nowhere to go
 * until the card's own 保存 declares the route. The pane therefore edits and
 * STAGES; the write itself is `staged-headers`' business and is covered there.
 */

// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, createElement } from 'react'
import type { Translate } from '@deepseek-ai/dsh-client-ui-slots'
import { createRoot } from 'react-dom/client'
import type { Root } from 'react-dom/client'
import {
  CreateCardPane,
  type CreateCardPaneProps,
} from '../src/client/injection/create-card-pane.js'
import {
  createStagedHeadersState,
  type StagedHeadersState,
} from '../src/client/injection/staged-headers.js'
import { EDITOR_TAB_ID_ATTR, EDITOR_TABS_CLASS } from '../src/client/injection/editor-tabs.js'
import { en } from '../src/client/locales.js'
import type { RemoteApi } from '../src/client/types.js'

;(globalThis as Record<string, unknown>)['IS_REACT_ACT_ENVIRONMENT'] = true

/**
 * The shell's Translate face, approximated with the en dictionary.
 *
 * No message the pane renders takes parameters, so the plain lookup is the whole
 * of what this spec needs — and the shell's own face takes `unknown` params,
 * which the cast at the seam settles.
 */
const t = ((key: string): string => (en as Record<string, string>)[key] ?? key) as unknown as Translate

/** The settings Remote the pane's editor reads a provider through. */
function fakeApi(providers: Record<string, Record<string, unknown>> = {}): RemoteApi {
  const view = {
    ns: 'llm-pi-ai',
    schema: {},
    value: { providers },
    user: { providers },
    base: {},
    revision: 7,
    applies: 'live',
    secrets: [],
  }
  return {
    settings: {
      async describe() {
        return { ok: true, value: { namespaces: [view], writable: true } } as never
      },
      mutate: vi.fn(async () => ({ ok: true }) as never),
    },
  } as unknown as RemoteApi
}

/** Stub the coexistence route; the editor reads it in an effect. */
function stubEnvironment(): void {
  ;(globalThis as Record<string, unknown>)['fetch'] = vi.fn(async () => ({
    ok: true,
    async json() {
      return {
        ok: true,
        data: {
          enabled: true,
          installed: true,
          overrides: [],
          conflicts: [],
          environment: { adapter: 'stock', siblings: [], preferOfficialLayer: false },
        },
      }
    },
  }))
}

/** The official create card, reduced to its custom half the way this plugin does. */
interface Card {
  card: HTMLElement
  panel: HTMLElement
  /** The mount `add-card` inserts as the panel's own first child. */
  host: HTMLElement
  idField: HTMLInputElement
  /** The official footer, which the pane must leave alone. */
  cardCancel: HTMLButtonElement
  clicks: { cardCancel: number }
}

function buildCard(): Card {
  document.body.innerHTML = `
    <li class="addCard">
      <div class="addModes"><div role="tablist">
        <button id="r1-browse" role="tab" aria-selected="false">Browse</button>
        <button id="r1-custom" role="tab" aria-selected="true">Custom</button>
      </div></div>
      <div id="r1-custom-panel" class="editor addPanel">
        <label>Provider ID<input aria-label="Provider ID" type="text"></label>
        <label>Base URL<input aria-label="Base URL" type="text"></label>
        <section class="modelCatalog"><div class="modelListHead">Models</div></section>
        <div class="editorActions">
          <button class="secondaryButton">Cancel</button>
          <button class="primaryButton">Create</button>
        </div>
      </div>
    </li>`
  const card = document.querySelector<HTMLElement>('li.addCard')!
  const panel = card.querySelector<HTMLElement>('.addPanel')!
  const host = document.createElement('div')
  host.className = 'bre-create-host'
  panel.insertBefore(host, panel.firstChild)
  const cardCancel = panel.querySelector<HTMLButtonElement>('.editorActions .secondaryButton')!
  const clicks = { cardCancel: 0 }
  cardCancel.addEventListener('click', () => { clicks.cardCancel += 1 })
  return {
    card,
    panel,
    host,
    idField: panel.querySelector<HTMLInputElement>('input[aria-label="Provider ID"]')!,
    cardCancel,
    clicks,
  }
}

interface MountedPane {
  api: RemoteApi
  staged: StagedHeadersState
  /** Let React's work and the editor's settings read land. */
  settle(): Promise<void>
  unmount(): Promise<void>
}

async function mountPane(card: Card, options: { api?: RemoteApi; staged?: StagedHeadersState } = {}): Promise<MountedPane> {
  const api = options.api ?? fakeApi()
  const staged = options.staged ?? createStagedHeadersState()
  const props: CreateCardPaneProps = {
    host: { current: card.host as HTMLDivElement },
    api,
    t,
    routeIdLabels: () => ['customRoute', 'Provider ID'],
    staged,
  }
  let root: Root | undefined
  await act(async () => {
    root = createRoot(card.host)
    root.render(createElement(CreateCardPane, props))
  })
  return {
    api,
    staged,
    async settle() {
      await act(async () => {})
    },
    async unmount() {
      await act(async () => { root!.unmount() })
    },
  }
}

/**
 * Type into an input the way a user does.
 *
 * The value setter is driven natively first: React tracks the DOM node's value
 * and skips `onChange` for a plain assignment, and the pane's own id read goes
 * through an `input` event it listens for in the capture phase.
 */
async function type(input: HTMLInputElement, value: string): Promise<void> {
  await act(async () => {
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!
    setter.call(input, value)
    input.dispatchEvent(new Event('input', { bubbles: true }))
  })
}

function sectionOf(scope: HTMLElement): HTMLElement {
  const hit = scope.querySelector<HTMLElement>('.bre-headers')
  if (hit === null) throw new Error('no headers section')
  return hit
}

function buttonByText(container: HTMLElement, text: string): HTMLButtonElement {
  const hit = Array.from(container.querySelectorAll('button')).find(candidate => candidate.textContent === text)
  if (hit === undefined) throw new Error(`no button "${text}"`)
  return hit
}

/** Inputs carrying one aria-label, in DOM order. */
function inputsByLabel(container: HTMLElement, label: string): HTMLInputElement[] {
  return Array.from(container.querySelectorAll<HTMLInputElement>('input[type="text"]'))
    .filter(input => input.getAttribute('aria-label') === label)
}

/** The name/value row inputs of the pane's editor. */
function rowInputs(container: HTMLElement): { name: HTMLInputElement; value: HTMLInputElement } {
  const name = inputsByLabel(container, en.headersName)[0]
  const value = inputsByLabel(container, en.headersValue)[0]
  if (name === undefined || value === undefined) throw new Error('no header row')
  return { name, value }
}

/** Type one header pair into the pane, the way a user filling it in does. */
async function typeHeader(container: HTMLElement, name: string, value: string): Promise<void> {
  const row = rowInputs(container)
  await type(row.name, name)
  await type(row.value, value)
}

beforeEach(() => {
  stubEnvironment()
})

afterEach(() => {
  document.body.innerHTML = ''
  vi.restoreAllMocks()
})

describe('CreateCardPane', () => {
  it('mounts the bar ahead of the section it controls', async () => {
    const card = buildCard()
    const pane = await mountPane(card)
    try {
      const children = Array.from(card.host.children)
      expect(children[0]?.classList.contains(EDITOR_TABS_CLASS)).toBe(true)
      expect(children[1]?.classList.contains('bre-headers')).toBe(true)
      // The bar is mounted whole; which of its tabs may light up is the takeover
      // pass's reading of the form, not this pane's. The fingerprint segment
      // rides along like the rest and is the one that never lights up here —
      // m00883: a card still choosing what to be must not offer to fingerprint
      // what it is not yet (see the create-card case in editor-tabs.spec.ts).
      expect(Array.from(card.host.querySelectorAll(`[${EDITOR_TAB_ID_ATTR}]`)).map(
        tab => tab.getAttribute(EDITOR_TAB_ID_ATTR),
      )).toEqual(['provider', 'models', 'fingerprint', 'advanced'])
    } finally {
      await pane.unmount()
    }
  })

  it('opens the editor before the id is typed', async () => {
    // Withholding the rows until the id is filled in read as a pane that had no
    // way to add a header at all. The rows are editable from the first render and
    // nothing is committed until the id they belong to exists — and the pane says
    // nothing about that id, because its field is on this same card.
    const card = buildCard()
    const pane = await mountPane(card)
    try {
      await pane.settle()
      const section = sectionOf(card.host)
      expect(section.textContent).toContain(en.headersTitle)
      // A blank row and its adder, exactly as a typed id would get.
      expect(rowInputs(card.host).name.value).toBe('')
      buttonByText(card.host, en.headersAdd)
      // Still no Save of its own, and nothing staged under a route that does not
      // exist yet.
      expect(Array.from(card.host.querySelectorAll('button')).map(b => b.textContent))
        .not.toContain(en.headersSave)
      expect(pane.staged.intents.size).toBe(0)
    } finally {
      await pane.unmount()
    }
  })

  it('holds a draft typed before the id and stages it once the id arrives', async () => {
    // The id is the LAST thing a user gets right: they fill the headers, word the
    // id, and then read it back. The pane has to keep the draft across that.
    const card = buildCard()
    const pane = await mountPane(card)
    try {
      await typeHeader(card.host, 'X-Tenant', 'acme')
      expect(pane.staged.intents.size).toBe(0)

      await type(card.idField, 'my-api')
      await pane.settle()

      expect(pane.staged.intents.get('my-api')?.headers).toEqual({ 'X-Tenant': 'acme' })
      expect((pane.api.settings.mutate as unknown as ReturnType<typeof vi.fn>)).not.toHaveBeenCalled()
    } finally {
      await pane.unmount()
    }
  })

  it('reads the route off the labelled id field, not off the form at large', async () => {
    // The form's React state is not ours to subscribe to, so the DOM event is the
    // whole interface. The label is what makes the read a read: typing into any
    // other field of the same form names no route.
    const card = buildCard()
    const pane = await mountPane(card)
    try {
      await pane.settle()
      const baseUrl = card.panel.querySelector<HTMLInputElement>('input[aria-label="Base URL"]')!
      await type(baseUrl, 'https://relay.example.com')
      await pane.settle()
      expect(pane.staged.intents.size).toBe(0)

      await type(card.idField, 'my-api')
      await pane.settle()
      await typeHeader(card.host, 'X-From', 'form')

      expect(Array.from(pane.staged.intents.keys())).toEqual(['my-api'])
      expect(pane.staged.intents.get('my-api')?.headers).toEqual({ 'X-From': 'form' })
    } finally {
      await pane.unmount()
    }
  })

  it('finds the id field even when the host keeps it out of the pane’s own half', async () => {
    // Which half of the official create form holds the id field is the host's
    // business, and a pane that only watched its own half would sit on an empty
    // route while the user typed one beside it — which is exactly how a typed
    // draft went missing. The read stays a LABEL read, so widening the scope can
    // only find the same field somewhere else, never a different one.
    const card = buildCard()
    const label = card.idField.closest('label')!
    card.card.insertBefore(label, card.panel)
    const pane = await mountPane(card)
    try {
      await pane.settle()
      await type(card.idField, 'my-api')
      await pane.settle()
      // The keystroke reached the pane even though it happened outside the panel
      // the pane is mounted in: the baseline read is the pane's own answer to
      // "did this id exist before?", and only a read route can produce one.
      expect(pane.staged.baseline.get('my-api')).toBe(false)

      await typeHeader(card.host, 'X-From', 'form')
      expect(pane.staged.intents.get('my-api')?.headers).toEqual({ 'X-From': 'form' })
    } finally {
      await pane.unmount()
    }
  })

  it('answers whether the typed id already existed, before the card can save', async () => {
    // The drain cannot tell a provider the card has just created from one that
    // was there all along — the route looks the same on the wire. The pane can:
    // it asks the moment the id names anything, and one keystroke into a card is
    // long before that card's 保存 can declare a provider.
    const card = buildCard()
    const pane = await mountPane(card, { api: fakeApi({ 'my-api': { baseURL: 'https://example.test' } }) })
    try {
      await type(card.idField, 'my-api')
      await pane.settle()

      expect(pane.staged.baseline.get('my-api')).toBe(true)
    } finally {
      await pane.unmount()
    }
  })

  it('records a route of the card’s own as one its draft may be written to', async () => {
    const card = buildCard()
    const pane = await mountPane(card)
    try {
      await type(card.idField, 'my-api')
      await pane.settle()

      expect(pane.staged.baseline.get('my-api')).toBe(false)

      await typeHeader(card.host, 'X-Tenant', 'acme')

      // Not left waiting for a read that already happened.
      expect(pane.staged.intents.get('my-api')?.declaredBefore).toBe(false)
    } finally {
      await pane.unmount()
    }
  })

  it('edits the draft live and stages it, with no save of its own', async () => {
    const card = buildCard()
    const pane = await mountPane(card)
    try {
      await type(card.idField, 'my-api')
      await pane.settle()
      // Two fields and a row-adder, and no commit button: the route this write
      // would address does not exist yet.
      expect(Array.from(card.host.querySelectorAll('button')).map(b => b.textContent))
        .not.toContain(en.headersSave)
      expect(card.host.textContent).toContain(en.pendingSave)
      expect(card.host.textContent).toContain(en.pendingHint)

      await typeHeader(card.host, 'X-Tenant', 'acme')

      expect(pane.staged.intents.get('my-api')?.headers).toEqual({ 'X-Tenant': 'acme' })
      // Nothing reached the settings seam: staging is not writing.
      const mutate = (pane.api.settings.mutate as unknown as ReturnType<typeof vi.fn>)
      expect(mutate).not.toHaveBeenCalled()
    } finally {
      await pane.unmount()
    }
  })

  it('drops the staged draft on 取消 and leaves the card exactly where it is', async () => {
    const card = buildCard()
    const pane = await mountPane(card)
    try {
      await type(card.idField, 'my-api')
      await pane.settle()
      await typeHeader(card.host, 'X-Tenant', 'acme')
      expect(pane.staged.intents.size).toBe(1)

      await act(async () => { buttonByText(card.host, en.headersCancel).click() })

      // The draft is withdrawn, and the card the user is still filling in is not
      // closed: in this pane 取消 is the user taking the headers back, not the
      // user leaving the form.
      expect(pane.staged.intents.size).toBe(0)
      expect(card.clicks.cardCancel).toBe(0)
    } finally {
      await pane.unmount()
    }
  })

  it('moves the draft to the id the user retyped', async () => {
    const card = buildCard()
    const pane = await mountPane(card)
    try {
      await type(card.idField, 'first')
      await pane.settle()
      await typeHeader(card.host, 'X-Tenant', 'acme')
      expect(pane.staged.intents.get('first')?.headers).toEqual({ 'X-Tenant': 'acme' })

      await type(card.idField, 'second')
      await pane.settle()

      // The old key is released rather than left behind (a cancelled id must not
      // be inherited by whoever takes it later), and the draft follows the id the
      // user settled on.
      expect(pane.staged.intents.has('first')).toBe(false)
      expect(pane.staged.intents.get('second')?.headers).toEqual({ 'X-Tenant': 'acme' })
    } finally {
      await pane.unmount()
    }
  })

  it('clears the draft when the id field is emptied again', async () => {
    const card = buildCard()
    const pane = await mountPane(card)
    try {
      await type(card.idField, 'my-api')
      await pane.settle()
      await typeHeader(card.host, 'X-Tenant', 'acme')
      expect(pane.staged.intents.size).toBe(1)

      await type(card.idField, '')
      await pane.settle()

      // The id is gone, so the draft has no route to belong to — but the rows on
      // screen are the user's and stay put, and naming an id again stages them
      // there.
      expect(pane.staged.intents.size).toBe(0)
      expect(rowInputs(card.host).name.value).toBe('X-Tenant')

      await type(card.idField, 'other-api')
      await pane.settle()
      expect(pane.staged.intents.get('other-api')?.headers).toEqual({ 'X-Tenant': 'acme' })
    } finally {
      await pane.unmount()
    }
  })

  it('releases the draft when the pane goes away, rather than dropping it', async () => {
    // Unmounting cannot tell "the card's 保存 landed" from "the user walked
    // away", so the draft must survive the unmount with its regret stamp: what
    // retires it is the grace window, not this moment.
    const card = buildCard()
    const pane = await mountPane(card)
    await type(card.idField, 'my-api')
    await pane.settle()
    await typeHeader(card.host, 'X-Tenant', 'acme')

    await pane.unmount()

    const intent = pane.staged.intents.get('my-api')
    expect(intent?.headers).toEqual({ 'X-Tenant': 'acme' })
    expect(typeof intent?.releasedAt).toBe('number')
  })
})
