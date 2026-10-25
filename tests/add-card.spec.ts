/**
 * The create-provider card's own pass: the card is reduced to its custom API
 * form, the official "How to add" switch goes, and the pane the official card
 * does not render there — the tab bar and its 高级配置 section — is mounted at
 * the top of the form.
 *
 * The fixture is the live card: the mode switch (a tablist whose options are
 * IDed `<useId>-catalog` / `-custom`, next to the hint that follows it), the
 * catalogue half always mounted, and the custom half — which the official page
 * mounts the FIRST time its mode is visited, so "not there yet" and "there but
 * hidden" are two different states a test has to tell apart. The switch itself
 * belongs to the official page, so the test drives it the way the page does: a
 * click, and then the render that click schedules.
 */

// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ReactNode } from 'react'
import type { Translate } from '@deepseek-ai/dsh-client-ui-slots'
import {
  createAddCardState,
  reconcileAddCards,
  teardownAddCards,
  type AddCardDeps,
  type AddCardState,
} from '../src/client/injection/add-card.js'
import {
  createEditorTabsState,
  reconcileEditorTabs,
  EDITOR_TAB_ID_ATTR,
  EDITOR_TABS_CLASS,
  type EditorTabsState,
} from '../src/client/injection/editor-tabs.js'
import { createStagedHeadersState, type StagedHeadersState } from '../src/client/injection/staged-headers.js'
import { createStagedKeysState, type StagedKeysState } from '../src/client/injection/staged-keys.js'
import { en } from '../src/client/locales.js'
import type { RemoteApi } from '../src/client/types.js'

const t = ((key: string): string => (en as Record<string, string>)[key] ?? key) as unknown as Translate

/**
 * The settings Remote the pane's editor reads a route through.
 *
 * The card under test has no provider id typed into it, so the pane holds its
 * placeholder and never reads: only enough of the Remote to be one.
 */
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

/**
 * The pass's dependencies. `refreshed` is the identity: no test switches the
 * language under a mounted pane, and the pass's own copy is not what these
 * tests are about.
 */
function deps(
  staged: StagedHeadersState = createStagedHeadersState(),
  stagedKeys: StagedKeysState = createStagedKeysState(),
): AddCardDeps {
  return {
    t,
    api: fakeApi(),
    routeIdLabels: () => ['customRoute', 'Provider ID'],
    staged,
    stagedKeys,
    refreshed: (children: () => ReactNode): ReactNode => children(),
  }
}

/**
 * How far the official page has got with the card's custom half:
 * - `unmounted`: never visited — the option is there, the half is not;
 * - `hidden`: visited, then switched back to the catalogue;
 * - `shown`: the state the pass dresses;
 * - `disabled`: no API protocol to declare, so the option is offered disabled;
 * - `absent`: no custom mode at all — the page renders no switch.
 */
type CustomHalf = 'unmounted' | 'hidden' | 'shown' | 'disabled' | 'absent'

interface Fixture {
  readonly root: HTMLElement
  readonly card: HTMLElement
  readonly picker: HTMLElement | null
  readonly customOption: HTMLElement
  readonly customPanel: HTMLElement
  /** Clicks the custom option the way the user does, and commits the render
   * that follows: the half appears and the catalogue's goes. */
  readonly chooseCustom: () => void
}

/**
 * The add-provider card as the official page builds it: the mode switch, the
 * catalogue half, and the custom half — mounted only once its mode is visited.
 */
function buildCard(custom: CustomHalf = 'unmounted'): Fixture {
  const root = document.createElement('div')
  root.innerHTML = `
    <ul class="rows">
      <li class="addCard">
        <div class="addModes">
          <div role="tablist" aria-label="How to add">
            <button id=":r1:-catalog" type="button" role="tab" aria-selected="true">Third-party model provider</button>
            <button id=":r1:-custom" type="button" role="tab" aria-selected="false">Custom model API</button>
          </div>
          <p class="advancedHint">Pick a provider from the built-in catalogue.</p>
        </div>
        <div class="addPanel" id=":r1:-catalog-panel" role="tabpanel">
          <div class="field"><select aria-label="Provider"></select></div>
          <div class="editor">
            <div class="field"><input aria-label="API key" type="password" /></div>
            <div class="editorActions">
              <button class="secondaryButton" type="button">Cancel</button>
              <button class="primaryButton" type="button">Add</button>
            </div>
          </div>
        </div>
        <div class="addPanel" id=":r1:-custom-panel" role="tabpanel">
          <div class="editor">
            <div class="field"><input aria-label="Provider ID" /></div>
            <div class="field"><input aria-label="Base URL" /></div>
            <div class="field"><input aria-label="API key" type="password" /></div>
            <section class="modelCatalog"><div class="modelListHead"></div></section>
            <div class="editorActions">
              <button class="secondaryButton" type="button">Cancel</button>
              <button class="primaryButton" type="button">Create</button>
            </div>
          </div>
        </div>
      </li>
    </ul>
  `
  const card = root.querySelector('li.addCard') as HTMLElement
  const modes = card.querySelector('.addModes') as HTMLElement
  const customOption = card.querySelector('#\\:r1\\:-custom') as HTMLElement
  const customPanel = card.querySelector('#\\:r1\\:-custom-panel') as HTMLElement
  const catalogPanel = card.querySelector('#\\:r1\\:-catalog-panel') as HTMLElement
  let picker: HTMLElement | null = modes.querySelector('[role="tablist"]')
  if (custom === 'absent') {
    // A page with no custom mode to offer renders no switch at all: the
    // catalogue form is the only form there is.
    picker?.remove()
    picker = null
    customPanel.remove()
  } else if (custom === 'unmounted' || custom === 'disabled') {
    // Mounted on first visit: until then the option is all there is of it.
    customPanel.remove()
    if (custom === 'disabled') (customOption as HTMLButtonElement).disabled = true
  } else if (custom === 'hidden') {
    customPanel.setAttribute('hidden', '')
  } else {
    customOption.setAttribute('aria-selected', 'true')
    catalogPanel.setAttribute('hidden', '')
  }
  document.body.appendChild(root)
  return {
    root,
    card,
    picker,
    customOption,
    customPanel,
    chooseCustom: () => {
      customOption.click()
      // What the official control's own state does on that click.
      card.querySelector('#\\:r1\\:-catalog')?.setAttribute('aria-selected', 'false')
      customOption.setAttribute('aria-selected', 'true')
      if (customPanel.parentElement === null) card.appendChild(customPanel)
      customPanel.removeAttribute('hidden')
      catalogPanel.setAttribute('hidden', '')
    },
  }
}

function barIn(scope: HTMLElement): HTMLElement | null {
  return scope.querySelector(`.${EDITOR_TABS_CLASS}`)
}

/** Let the seat's pane, its first read and the render that adopts it settle. */
async function flush(turns = 6): Promise<void> {
  for (let turn = 0; turn < turns; turn += 1) {
    await new Promise(resolve => setTimeout(resolve, 0))
  }
}

function tabLabel(scope: HTMLElement, id: string): string {
  const tab = scope.querySelector(`[${EDITOR_TAB_ID_ATTR}="${id}"]`)
  return tab?.textContent ?? ''
}

const MODE_PICKER_CLASS = 'bre-add-mode-picker'
const CREATE_HOST_CLASS = 'bre-create-host'

let state: AddCardState
let warnings: ReturnType<typeof vi.spyOn>

beforeEach(() => {
  state = createAddCardState()
  warnings = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
})

afterEach(() => {
  teardownAddCards(state)
  document.body.innerHTML = ''
  warnings.mockRestore()
})

describe('the create-provider card', () => {
  it('switches to the custom form through the official control, then dresses it', () => {
    const fixture = buildCard('unmounted')
    const clicks: number[] = []
    fixture.customOption.addEventListener('click', () => clicks.push(1))

    reconcileAddCards(fixture.root, deps(), state)

    expect(clicks).toHaveLength(1)
    // The switch is still there: the form it would leave is not up yet, and
    // hiding it before the official render lands would strand the card with
    // neither a way to switch back nor a custom form to show.
    expect(fixture.picker?.classList.contains(MODE_PICKER_CLASS)).toBe(false)
    expect(fixture.card.querySelector(`.${CREATE_HOST_CLASS}`)).toBeNull()
    expect(state.hosts.size).toBe(0)

    // The render that click schedules, and the visit that follows it.
    fixture.chooseCustom()
    reconcileAddCards(fixture.root, deps(), state)

    expect(state.hosts.size).toBe(1)
    expect(fixture.picker?.classList.contains(MODE_PICKER_CLASS)).toBe(true)
  })

  it('dresses a custom form the user has come back to', () => {
    const fixture = buildCard('hidden')
    const clicks: number[] = []
    fixture.customOption.addEventListener('click', () => clicks.push(1))

    reconcileAddCards(fixture.root, deps(), state)

    expect(clicks).toHaveLength(1)
    expect(fixture.customPanel.hidden).toBe(true)
    expect(state.hosts.size).toBe(0)
  })

  it('mounts the bar and the Advanced pane at the top of the custom form and hides the switch', () => {
    const fixture = buildCard('shown')

    reconcileAddCards(fixture.root, deps(), state)
    // Twice: the pass is a reconcile, and a second visit must change nothing.
    reconcileAddCards(fixture.root, deps(), state)

    const host = fixture.customPanel.firstElementChild as HTMLElement
    expect(host.classList.contains(CREATE_HOST_CLASS)).toBe(true)
    expect(fixture.customPanel.querySelectorAll(`.${CREATE_HOST_CLASS}`)).toHaveLength(1)
    expect(state.hosts.size).toBe(1)

    const bar = barIn(host) as HTMLElement
    expect(bar).not.toBeNull()
    expect(tabLabel(bar, 'provider')).toBe('Provider')
    expect(tabLabel(bar, 'models')).toBe('Models')
    expect(tabLabel(bar, 'advanced')).toBe('Advanced')
    // Which tabs the card can offer is the tab pass's decision, not this one's:
    // the bar is mounted whole.
    expect(bar.children).toHaveLength(3)
    // The 高级配置 pane is here from the start, blank id and all — the card the
    // official page builds has no other place to hang it, and a tab whose pane
    // only appeared once the id was typed would be a tab that did nothing. The
    // pane is the editor itself: what it says about the missing id is nothing,
    // because the id field is on this same card's 供应商配置 tab.
    const section = host.querySelector('.bre-headers')
    expect(section).not.toBeNull()
    expect(section?.textContent).toContain(en.headersTitle)

    expect(fixture.picker?.classList.contains(MODE_PICKER_CLASS)).toBe(true)
  })

  it('does not seat a list under the list the card already shows', async () => {
    const fixture = buildCard('shown')
    const stagedKeys = createStagedKeysState()

    reconcileAddCards(fixture.root, deps(createStagedHeadersState(), stagedKeys), state)
    await flush()
    // The draft pane opens its form by itself, so the only password box inside
    // the card is the list's own once the seat is up.
    expect(fixture.customPanel.querySelector('.bre-keys-form')).not.toBeNull()
    expect(fixture.customPanel.querySelectorAll('[data-bre-create-keys]')).toHaveLength(1)

    // More passes over the same card: the list's key box must never be adopted
    // as an official field again. The live regression did exactly that — it
    // seated a host under that box, whose open form carried another box, one
    // nested host per pass, until the card measured 150 000px and the reported
    // symptom was 点开新增供应商就无限向下扩展.
    for (let pass = 0; pass < 5; pass += 1) {
      reconcileAddCards(fixture.root, deps(createStagedHeadersState(), stagedKeys), state)
      await flush(2)
    }

    const hosts = fixture.customPanel.querySelectorAll<HTMLElement>('[data-bre-create-keys]')
    expect(hosts).toHaveLength(1)
    expect(hosts[0]?.querySelector('[data-bre-create-keys]')).toBeNull()
    // And the form's own box is not dressed as a managed official field.
    const formInput = fixture.customPanel.querySelector('.bre-keys-form input[type="password"]')
    expect(formInput?.closest('.bre-key-managed')).toBeNull()
  })

  it('gives the create card an Advanced tab the tab pass can light up', () => {
    const fixture = buildCard('shown')
    const tabs: EditorTabsState = createEditorTabsState()

    reconcileAddCards(fixture.root, deps(), state)
    // The pass that decides which tabs exist, over the half this pass left up.
    reconcileEditorTabs(fixture.root, { t }, tabs)

    const host = fixture.customPanel.firstElementChild as HTMLElement
    const section = host.querySelector('.bre-headers') as HTMLElement
    // The pane IS the section the tab pass looks for, and it is the pane's own
    // root rather than a wrapper around it: the request-header editor reads its
    // tabbed state off exactly this element.
    expect(section.getAttribute('data-bre-region')).toBe('advanced')
    expect(fixture.card.classList.contains('bre-tabbed')).toBe(true)
    expect((host.querySelector(`[${EDITOR_TAB_ID_ATTR}="advanced"]`) as HTMLElement).hidden).toBe(false)
    expect((host.querySelector(`[${EDITOR_TAB_ID_ATTR}="provider"]`) as HTMLElement).hidden).toBe(false)
    expect((host.querySelector(`[${EDITOR_TAB_ID_ATTR}="models"]`) as HTMLElement).hidden).toBe(false)
  })

  it('leaves a card with no custom form exactly as the official page built it', () => {
    const fixture = buildCard('absent')

    reconcileAddCards(fixture.root, deps(), state)

    expect(fixture.card.querySelector(`.${CREATE_HOST_CLASS}`)).toBeNull()
    expect(fixture.card.querySelector(`.${MODE_PICKER_CLASS}`)).toBeNull()
    expect(state.hosts.size).toBe(0)
  })

  it('keeps the switch when the custom mode cannot be selected', () => {
    const fixture = buildCard('disabled')
    const clicks: number[] = []
    fixture.customOption.addEventListener('click', () => clicks.push(1))

    reconcileAddCards(fixture.root, deps(), state)

    expect(clicks).toHaveLength(0)
    expect(fixture.picker?.classList.contains(MODE_PICKER_CLASS)).toBe(false)
    expect(fixture.card.querySelector(`.${CREATE_HOST_CLASS}`)).toBeNull()
    expect(state.hosts.size).toBe(0)
  })

  it('gives the card back to the official page, switch and all', () => {
    const fixture = buildCard('shown')
    reconcileAddCards(fixture.root, deps(), state)
    expect(fixture.picker?.classList.contains(MODE_PICKER_CLASS)).toBe(true)

    teardownAddCards(state)

    expect(fixture.customPanel.querySelector(`.${CREATE_HOST_CLASS}`)).toBeNull()
    expect(fixture.picker?.classList.contains(MODE_PICKER_CLASS)).toBe(false)
    expect(state.hosts.size).toBe(0)
  })

  it('dresses the add form key field exactly like the edit form does', () => {
    // User item 7: the same input must look the same on both cards. On the edit
    // card the key field comes out of the tab takeover (`revealKeyField`); here
    // nothing else walks this form, so this pass has to dress it itself.
    const fixture = buildCard('shown')

    reconcileAddCards(fixture.root, deps(), state)
    reconcileAddCards(fixture.root, deps(), state)

    const keyField = fixture.customPanel.querySelector<HTMLElement>('input[aria-label="API key"]')?.parentElement
    expect(keyField).not.toBeNull()
    expect(keyField?.classList.contains('bre-key-field')).toBe(true)
    // Exactly one eye per key field, however many scans ran.
    expect(keyField?.querySelectorAll('.bre-key-eye')).toHaveLength(1)
    // The other fields of the form are not key fields and are left alone.
    const routeField = fixture.customPanel.querySelector<HTMLElement>('input[aria-label="Provider ID"]')?.parentElement
    expect(routeField?.classList.contains('bre-key-field')).toBe(false)
    expect(routeField?.querySelector('.bre-key-eye')).toBeNull()
  })

  it('gives the key field back with the rest of the card', () => {
    const fixture = buildCard('shown')
    reconcileAddCards(fixture.root, deps(), state)

    teardownAddCards(state)

    expect(document.querySelectorAll('.bre-key-field')).toHaveLength(0)
    expect(document.querySelectorAll('.bre-key-eye')).toHaveLength(0)
  })

  it('seats the draft key list under the custom form’s key field, not the catalogue’s', async () => {
    const fixture = buildCard('shown')

    reconcileAddCards(fixture.root, deps(), state)
    await flush()

    const customKeyField = fixture.customPanel.querySelector<HTMLElement>('input[aria-label="API key"]')?.parentElement
    expect(customKeyField?.classList.contains('bre-key-managed')).toBe(true)
    const host = customKeyField?.nextElementSibling
    expect(host instanceof HTMLElement && host.hasAttribute('data-bre-create-keys')).toBe(true)
    // The list itself is up: the same one open form the edit card's list
    // carries, since a card with no key yet shows the field it waits for.
    expect(host instanceof HTMLElement && host.querySelector('.bre-keys-form') !== null).toBe(true)

    // The catalogue half keeps its own key field exactly as the page built it:
    // that half stays mounted, and a second seat would stage a second, empty
    // draft list against the same route the visible one holds.
    const catalogKeyField = fixture.root.querySelector<HTMLElement>(
      '#\\:r1\\:-catalog-panel input[aria-label="API key"]',
    )?.parentElement
    expect(catalogKeyField?.classList.contains('bre-key-managed')).toBe(false)
    expect(catalogKeyField?.nextElementSibling?.hasAttribute?.('data-bre-create-keys')).toBeFalsy()
  })

  it('seats the key list even when the form does not use .field wrappers', async () => {
    // The live create form wraps its controls in classes of its own — the seat
    // keyed on the edit card's `.field` found nothing there and the official
    // single input stayed. The field is derived from the key INPUT instead.
    const fixture = buildCard('shown')
    for (const div of Array.from(fixture.customPanel.querySelectorAll<HTMLElement>('.field'))) {
      div.className = 'formRow'
    }

    reconcileAddCards(fixture.root, deps(), state)
    await flush()

    const keyField = fixture.customPanel.querySelector<HTMLElement>('input[aria-label="API key"]')?.parentElement
    expect(keyField?.classList.contains('bre-key-field')).toBe(true)
    expect(keyField?.classList.contains('bre-key-managed')).toBe(true)
    const host = keyField?.nextElementSibling
    expect(host instanceof HTMLElement && host.hasAttribute('data-bre-create-keys')).toBe(true)
    expect(host instanceof HTMLElement && host.querySelector('.bre-keys-form') !== null).toBe(true)
  })

  it('gives the seated key fields back with the rest of the card', async () => {
    const fixture = buildCard('shown')
    reconcileAddCards(fixture.root, deps(), state)
    await flush()

    teardownAddCards(state)

    expect(document.querySelectorAll('[data-bre-create-keys]')).toHaveLength(0)
    expect(document.querySelectorAll('.bre-key-managed')).toHaveLength(0)
  })

  it('sweeps a mount left behind by a dead fiber', () => {
    const fixture = buildCard('shown')
    const stray = document.createElement('div')
    stray.className = CREATE_HOST_CLASS
    fixture.customPanel.appendChild(stray)

    teardownAddCards(state)

    expect(document.querySelectorAll(`.${CREATE_HOST_CLASS}`)).toHaveLength(0)
  })

  it('rolls one unreadable card back and still dresses the rest', () => {
    const broken = buildCard('shown')
    // A form this pass cannot read: the id it looks the halves up by throws.
    Object.defineProperty(broken.customPanel, 'id', {
      get() {
        throw new Error('unreadable form')
      },
    })
    const healthy = buildCard('shown')

    reconcileAddCards(broken.root, deps(), state)
    reconcileAddCards(healthy.root, deps(), state)

    expect(warnings).toHaveBeenCalledWith(
      '[bre] add provider card: left the official form in place:',
      expect.any(Error),
    )
    // The broken card keeps the switch: a card this pass could not take over
    // must not lose the official control that explains it.
    expect(broken.picker?.classList.contains(MODE_PICKER_CLASS)).toBe(false)
    expect(broken.card.querySelector(`.${CREATE_HOST_CLASS}`)).toBeNull()
    expect(healthy.card.querySelector(`.${CREATE_HOST_CLASS}`)).not.toBeNull()
  })
})
