/**
 * Editor-tabs tests: the three-tab takeover of the official provider editor.
 *
 * The pass is attribute-and-structure only — it never creates, moves or removes
 * a node — so the fixture supplies the DOM both owners contribute: the official
 * card (row head, editor body: header row, identity fields, model list, action
 * row) and the plugin's own request-header mount, which is what carries the tab
 * bar. Pane visibility itself lives in the stylesheet, not here.
 */

// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  EDITOR_TAB_BUTTON_CLASS,
  EDITOR_TAB_ID_ATTR,
  EDITOR_TAB_IDS,
  EDITOR_TABS_CLASS,
  createEditorTabsState,
  reconcileEditorTabs,
  selectEditorTab,
  teardownEditorTabs,
  type EditorTabsDeps,
} from '../src/client/injection/editor-tabs.js'

const COPY = {
  en: {
    editorTabsLabel: 'Editor sections',
    editorTabProvider: 'Provider',
    editorTabModels: 'Models',
    editorTabAdvanced: 'Advanced',
    keyRevealShow: 'Show key',
    keyRevealHide: 'Hide key',
    keyRevealFailed: 'Stored key unavailable',
  },
  zh: {
    editorTabsLabel: '编辑器分区',
    editorTabProvider: '供应商配置',
    editorTabModels: '模型配置',
    editorTabAdvanced: '高级配置',
    keyRevealShow: '显示密钥',
    keyRevealHide: '隐藏密钥',
    keyRevealFailed: '无法读取已保存的密钥',
  },
} as const

function depsFor(language: keyof typeof COPY): EditorTabsDeps {
  return { t: (key: string) => COPY[language][key as keyof (typeof COPY)['en']] ?? key }
}

interface CardOptions {
  /** Mount the plugin's request-header wrapper (default: mount it). */
  headers?: boolean
  /** ...and the request-header section inside it (default: mount it). */
  section?: boolean
  /** Keep the editor's own header row (default: keep it). */
  editorHeader?: boolean
  /** Keep the row head — the identity line with the Edit button. */
  rowHead?: boolean
  /** Keep the identity fields (name, base URL, ...). */
  fields?: boolean
}

/**
 * The bar the plugin's tab-bar component renders: structure only, no labels —
 * the pass is what labels it, and a test must be able to tell the two apart.
 */
function tabBar(): HTMLElement {
  const bar = document.createElement('div')
  bar.className = EDITOR_TABS_CLASS
  bar.setAttribute('role', 'tablist')
  for (const id of EDITOR_TAB_IDS) {
    const tab = document.createElement('button')
    tab.type = 'button'
    tab.className = EDITOR_TAB_BUTTON_CLASS
    tab.setAttribute(EDITOR_TAB_ID_ATTR, id)
    bar.appendChild(tab)
  }
  return bar
}

/** Build an approximation of the official models page holding ONE open editor. */
function buildCard(options: CardOptions = {}): HTMLElement {
  const {
    headers = true,
    section = true,
    editorHeader = true,
    rowHead = true,
    fields = true,
  } = options
  const root = document.createElement('div')
  root.innerHTML = `
    <ul class="rows">
      <li class="rowCard">
        ${rowHead ? '<div class="rowHead"><span class="rowName">Pi</span></div>' : ''}
        <div class="bre-headers-host" data-edit="1"></div>
        <div class="editor">
          ${editorHeader ? '<div class="editorHeader"><span class="editorTitle">Pi</span><span class="editorRoute">pi</span></div>' : ''}
          ${fields ? `
          <div class="field"><input aria-label="Display name" value="Pi" /></div>
          <div class="field"><input aria-label="Base URL" value="https://api.pi.example.com" /></div>` : ''}
          <div class="modelList">
            <div class="modelEntry">
              <div class="modelRow"><input aria-label="Model ID" value="glm-4" /></div>
              <div class="modelAdvanced"></div>
            </div>
          </div>
          <div class="editorActions">
            <button class="secondaryButton" type="button">Cancel</button>
            <button class="primaryButton" type="button">Apply</button>
          </div>
        </div>
      </li>
    </ul>
  `
  const card = root.querySelector('li.rowCard') as HTMLElement
  const host = card.querySelector('.bre-headers-host') as HTMLElement
  if (headers) {
    // What the slot component renders: the bar, then the section it switches to.
    host.appendChild(tabBar())
    if (section) {
      const pane = document.createElement('div')
      pane.className = 'bre-headers'
      host.appendChild(pane)
    }
  } else {
    // A card whose slot never rendered (no route): no mount, so no bar and no
    // advanced pane either — the section's only container is that mount.
    host.remove()
  }
  document.body.appendChild(root)
  return root
}

function cardOf(root: HTMLElement): HTMLElement {
  return root.querySelector('li.rowCard') as HTMLElement
}

/**
 * The LIVE editor shape: the identity fields and the model catalog share one
 * "Customized" disclosure (details → summary + body), which is how the official
 * bundle nests them — not the flat sibling layout of {@link buildCard}.
 */
function buildLiveCard(): HTMLElement {
  const root = document.createElement('div')
  root.innerHTML = `
    <ul class="rows">
      <li class="rowCard">
        <div class="rowHead"><span class="rowName">Pi</span></div>
        <div class="bre-headers-host" data-edit="1">
          <div class="bre-headers"></div>
        </div>
        <div class="editor">
          <div class="editorHeader"><span class="editorTitle">Pi</span><span class="editorRoute">pi</span></div>
          <div class="field"><input aria-label="API key" type="password" /></div>
          <details class="customized">
            <summary class="customizedSummary">Customized</summary>
            <div class="customizedBody">
              <div class="field"><input aria-label="Display name" value="Pi" /></div>
              <div class="field"><input aria-label="Base URL" value="https://api.pi.example.com" /></div>
              <div class="field"><select aria-label="API protocol"><option>openai</option></select></div>
              <section class="modelCatalog" aria-label="Models">
                <div class="modelListHead"></div>
                <div class="modelList">
                  <div class="modelEntry">
                    <div class="modelRow"><input aria-label="Model ID" value="glm-4" /></div>
                    <div class="modelAdvanced"></div>
                  </div>
                </div>
              </section>
            </div>
          </details>
          <div class="editorActions">
            <button class="secondaryButton" type="button">Cancel</button>
            <button class="primaryButton" type="button">Apply</button>
          </div>
        </div>
      </li>
    </ul>
  `
  const host = root.querySelector('.bre-headers-host') as HTMLElement
  host.insertBefore(tabBar(), host.firstChild)
  document.body.appendChild(root)
  return root
}

function barOf(root: HTMLElement): HTMLElement | undefined {
  return root.querySelector<HTMLElement>(`.${EDITOR_TABS_CLASS}`) ?? undefined
}

function tabOf(root: HTMLElement, id: string): HTMLElement | undefined {
  return root.querySelector<HTMLElement>(`[${EDITOR_TAB_ID_ATTR}="${id}"]`) ?? undefined
}

beforeEach(() => {
  teardownEditorTabs()
  document.body.innerHTML = ''
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('reconcileEditorTabs', () => {
  it('tags the card regions and labels the bar the plugin renders', () => {
    const root = buildCard()
    reconcileEditorTabs(root, depsFor('zh'), createEditorTabsState())

    const card = cardOf(root)
    const bar = barOf(root)
    // The bar is the tab-bar component's DOM, already inside the plugin's own
    // mount; the pass labels it and must not add a second one.
    expect(bar?.parentElement?.classList.contains('bre-headers-host')).toBe(true)
    expect(bar?.previousElementSibling).toBeNull()
    expect(root.querySelectorAll(`.${EDITOR_TABS_CLASS}`)).toHaveLength(1)
    expect(bar?.getAttribute('role')).toBe('tablist')
    expect(bar?.getAttribute('aria-label')).toBe('编辑器分区')
    expect(bar?.children).toHaveLength(3)

    expect(card.classList.contains('bre-tabbed')).toBe(true)
    expect(card.getAttribute('data-bre-tab')).toBe('provider')
    expect(tabOf(root, 'provider')?.getAttribute('aria-selected')).toBe('true')
    expect(tabOf(root, 'models')?.getAttribute('aria-selected')).toBe('false')
    expect(tabOf(root, 'provider')?.textContent).toBe('供应商配置')
    expect(tabOf(root, 'models')?.textContent).toBe('模型配置')
    expect(tabOf(root, 'advanced')?.textContent).toBe('高级配置')

    for (const field of Array.from(root.querySelectorAll('.field'))) {
      expect(field.getAttribute('data-bre-region')).toBe('provider')
    }
    expect(root.querySelector('.modelList')?.getAttribute('data-bre-region')).toBe('models')
    expect(root.querySelector('.bre-headers')?.getAttribute('data-bre-region')).toBe('advanced')
    // The MOUNT is not a pane: it carries the bar, and tagging it would hide the
    // bar along with the pane on every other tab.
    expect(root.querySelector('.bre-headers-host')?.hasAttribute('data-bre-region')).toBe(false)
    expect(root.querySelector('.editor')?.hasAttribute('data-bre-editor-body')).toBe(true)
    // Model rows keep their own inputs — only the catalog itself is a pane.
    expect(root.querySelector('.modelEntry')?.hasAttribute('data-bre-region')).toBe(false)
    // The editor's own header is a region with NO pane: it repeats the card row
    // right above it, so the pass tags it with an id no tab can select and the
    // stylesheet hides it on every tab.
    expect(root.querySelector('.editorHeader')?.getAttribute('data-bre-region')).toBe('none')
    expect(root.querySelectorAll('[data-bre-region]')).toHaveLength(5)
  })

  it('tabs a create-provider card that has no header row', () => {
    const root = buildCard({ editorHeader: false, rowHead: false })
    reconcileEditorTabs(root, depsFor('en'), createEditorTabsState())

    expect(cardOf(root).classList.contains('bre-tabbed')).toBe(true)
    expect(cardOf(root).getAttribute('data-bre-tab')).toBe('provider')
    expect(tabOf(root, 'provider')?.textContent).toBe('Provider')
    expect(root.querySelector('.bre-headers')?.getAttribute('data-bre-region')).toBe('advanced')
    // No header row rendered: nothing to hide either.
    expect(root.querySelectorAll('[data-bre-region="none"]')).toHaveLength(0)
  })

  it('hides the advanced tab when the mount carries no section', () => {
    const root = buildCard({ section: false })
    reconcileEditorTabs(root, depsFor('en'), createEditorTabsState())

    expect(cardOf(root).classList.contains('bre-tabbed')).toBe(true)
    expect(tabOf(root, 'advanced')?.hidden).toBe(true)
    expect(tabOf(root, 'provider')?.hidden).toBe(false)
    expect(tabOf(root, 'models')?.hidden).toBe(false)
    expect(root.querySelectorAll('[data-bre-region="advanced"]')).toHaveLength(0)
  })

  it('takes a card whose mount never rendered, without a bar to label', () => {
    const root = buildCard({ headers: false })
    reconcileEditorTabs(root, depsFor('en'), createEditorTabsState())

    expect(barOf(root)).toBeUndefined()
    expect(cardOf(root).classList.contains('bre-tabbed')).toBe(true)
    expect(cardOf(root).getAttribute('data-bre-tab')).toBe('provider')
    expect(root.querySelectorAll('[data-bre-region="advanced"]')).toHaveLength(0)
  })

  it('keeps the bar in step when a tab is selected', () => {
    const root = buildCard()
    reconcileEditorTabs(root, depsFor('en'), createEditorTabsState())

    // What the bar's buttons call.
    selectEditorTab(cardOf(root), 'models')
    expect(cardOf(root).getAttribute('data-bre-tab')).toBe('models')
    expect(tabOf(root, 'models')?.getAttribute('aria-selected')).toBe('true')
    expect(tabOf(root, 'provider')?.getAttribute('aria-selected')).toBe('false')

    selectEditorTab(cardOf(root), 'advanced')
    expect(cardOf(root).getAttribute('data-bre-tab')).toBe('advanced')
    expect(tabOf(root, 'advanced')?.getAttribute('aria-selected')).toBe('true')

    selectEditorTab(cardOf(root), 'provider')
    expect(cardOf(root).getAttribute('data-bre-tab')).toBe('provider')
    expect(tabOf(root, 'provider')?.getAttribute('aria-selected')).toBe('true')
    expect(tabOf(root, 'models')?.getAttribute('aria-selected')).toBe('false')
  })

  it('is idempotent across scans', () => {
    const root = buildCard()
    const state = createEditorTabsState()
    reconcileEditorTabs(root, depsFor('zh'), state)
    reconcileEditorTabs(root, depsFor('zh'), state)

    expect(root.querySelectorAll(`.${EDITOR_TABS_CLASS}`)).toHaveLength(1)
    expect(barOf(root)?.children).toHaveLength(3)
    expect(root.querySelectorAll('[data-bre-tab]')).toHaveLength(1)
    expect(root.querySelectorAll('[data-bre-editor-body]')).toHaveLength(1)
    expect(root.querySelectorAll('[data-bre-region]')).toHaveLength(5)
  })

  it('relabels the bar on a language switch', () => {
    const root = buildCard()
    const state = createEditorTabsState()
    reconcileEditorTabs(root, depsFor('en'), state)
    expect(tabOf(root, 'provider')?.textContent).toBe('Provider')

    reconcileEditorTabs(root, depsFor('zh'), state)
    expect(tabOf(root, 'provider')?.textContent).toBe('供应商配置')
    expect(barOf(root)?.getAttribute('aria-label')).toBe('编辑器分区')
  })

  it('leaves an editor alone whose shape it cannot recognise', () => {
    // No fields, no action row: not the editor this pass knows.
    const root = buildCard({ fields: false })
    // And a page where the model list hangs off the card directly (no body).
    const bare = document.createElement('div')
    bare.innerHTML = '<ul class="rows"><li class="rowCard"><div class="modelList"></div></li></ul>'
    document.body.appendChild(bare)

    reconcileEditorTabs(root, depsFor('en'), createEditorTabsState())
    reconcileEditorTabs(bare, depsFor('en'), createEditorTabsState())

    expect(cardOf(root).classList.contains('bre-tabbed')).toBe(false)
    expect(root.querySelectorAll('[data-bre-region]')).toHaveLength(0)
    // The unrecognised card keeps the bar the component rendered, unlabelled and
    // hidden — the pass wrote nothing at all to it.
    expect(barOf(root)?.getAttribute('aria-label')).toBeNull()
    expect(tabOf(root, 'provider')?.textContent).toBe('')
    expect(bare.querySelector('li')?.classList.contains('bre-tabbed')).toBe(false)
  })

  it('falls back to the official layout when the editor closes', () => {
    const root = buildCard()
    reconcileEditorTabs(root, depsFor('en'), createEditorTabsState())
    expect(cardOf(root).classList.contains('bre-tabbed')).toBe(true)

    // The official unmount takes the whole editor body with it. The mount and
    // its bar stay (the slot owns them), so the takeover is what must go.
    root.querySelector('.editor')?.remove()
    reconcileEditorTabs(root, depsFor('en'), createEditorTabsState())

    expect(cardOf(root).classList.contains('bre-tabbed')).toBe(false)
    expect(cardOf(root).hasAttribute('data-bre-tab')).toBe(false)
    expect(root.querySelectorAll('[data-bre-region]')).toHaveLength(0)
  })

  it('falls back to the first tab when the advanced pane disappears', () => {
    const root = buildCard()
    const state = createEditorTabsState()
    reconcileEditorTabs(root, depsFor('en'), state)
    selectEditorTab(cardOf(root), 'advanced')
    expect(cardOf(root).getAttribute('data-bre-tab')).toBe('advanced')

    // The slot's own render can withdraw the section (headers feature off) while
    // the takeover stays: a card parked on a tab that just vanished would leave
    // its body hidden with nothing to show for it.
    root.querySelector('.bre-headers')?.remove()
    reconcileEditorTabs(root, depsFor('en'), state)

    expect(cardOf(root).getAttribute('data-bre-tab')).toBe('provider')
    expect(tabOf(root, 'advanced')?.hidden).toBe(true)
    expect(cardOf(root).classList.contains('bre-tabbed')).toBe(true)
  })
})

describe('reconcileEditorTabs — live "Customized" disclosure', () => {
  it('sorts the disclosure into its panes instead of taking it as one models pane', () => {
    const root = buildLiveCard()
    reconcileEditorTabs(root, depsFor('en'), createEditorTabsState())

    expect(cardOf(root).classList.contains('bre-tabbed')).toBe(true)
    // The catalog itself is the models pane — not its details wrapper.
    expect(root.querySelector('.modelCatalog')?.getAttribute('data-bre-region')).toBe('models')
    expect(root.querySelector('details.customized')?.hasAttribute('data-bre-region')).toBe(false)
    // Every identity field — inside the disclosure or not — is the provider pane.
    const fields = Array.from(root.querySelectorAll('.field'))
    expect(fields).toHaveLength(4)
    for (const field of fields) {
      expect(field.getAttribute('data-bre-region')).toBe('provider')
    }
    // Model rows must NOT sort as provider fields.
    expect(root.querySelector('.modelEntry')?.hasAttribute('data-bre-region')).toBe(false)
    // The pass forced the collapsed group open so the panes are reachable.
    const details = root.querySelector('details.customized') as HTMLDetailsElement
    expect(details.open).toBe(true)
    expect(details.getAttribute('data-bre-details')).toBe('closed')
    expect(root.querySelectorAll('[data-bre-region="models"]')).toHaveLength(1)
  })

  it('tabs a provider whose catalogue has not rendered yet, hiding only Models', () => {
    // A provider with no models yet still has the editor a user is looking for,
    // so a missing catalogue costs a tab — not the takeover.
    const root = buildLiveCard()
    root.querySelector('.modelCatalog')?.remove()
    reconcileEditorTabs(root, depsFor('en'), createEditorTabsState())

    expect(cardOf(root).classList.contains('bre-tabbed')).toBe(true)
    expect(root.querySelectorAll('[data-bre-region="models"]')).toHaveLength(0)
    expect(tabOf(root, 'models')?.hidden).toBe(true)
    expect(tabOf(root, 'provider')?.hidden).toBe(false)
    expect(tabOf(root, 'advanced')?.hidden).toBe(false)
  })

  it('re-closes the disclosure it forced open when the takeover withdraws', () => {
    const root = buildLiveCard()
    reconcileEditorTabs(root, depsFor('en'), createEditorTabsState())
    expect((root.querySelector('details.customized') as HTMLDetailsElement).open).toBe(true)

    // The official re-render drops the action row; the shape is no longer known,
    // so the pass withdraws — and undoes its forced-open state with it.
    root.querySelector('.editorActions')?.remove()
    reconcileEditorTabs(root, depsFor('en'), createEditorTabsState())

    const details = root.querySelector('details.customized') as HTMLDetailsElement
    expect(cardOf(root).classList.contains('bre-tabbed')).toBe(false)
    expect(details.open).toBe(false)
    expect(details.hasAttribute('data-bre-details')).toBe(false)
  })

  it('leaves a disclosure the page rendered open alone', () => {
    const root = buildLiveCard()
    const details = root.querySelector('details.customized') as HTMLDetailsElement
    details.open = true
    reconcileEditorTabs(root, depsFor('en'), createEditorTabsState())

    expect(details.open).toBe(true)
    expect(details.hasAttribute('data-bre-details')).toBe(false)

    teardownEditorTabs()
    // Never forced, so never re-closed.
    expect(details.open).toBe(true)
  })

  it('dresses the official API-key field with the reveal eye, and undresses it', () => {
    const root = buildCard()
    const body = root.querySelector('.editor') as HTMLElement
    const field = document.createElement('div')
    field.className = 'field'
    field.innerHTML =
      '<span class="fieldLabel">API key</span><input class="input" type="password" aria-label="API key" />'
    body.insertBefore(field, body.querySelector('.modelList'))

    reconcileEditorTabs(root, depsFor('en'), createEditorTabsState())

    const eye = field.querySelector('.bre-key-eye') as HTMLButtonElement | null
    const input = field.querySelector('input') as HTMLInputElement
    expect(eye).not.toBeNull()
    expect(eye?.getAttribute('aria-label')).toBe('Show key')

    eye?.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }))
    expect(input.type).toBe('text')

    teardownEditorTabs()

    // The takeover owns the affordance: withdrawing it takes the eye away and
    // hands the host's input back masked.
    expect(field.querySelector('.bre-key-eye')).toBeNull()
    expect(field.classList.contains('bre-key-field')).toBe(false)
    expect(input.type).toBe('password')
  })

  it('reads the card route off the mount and fetches the stored key it names', async () => {
    const root = buildLiveCard()
    const host = root.querySelector('.bre-headers-host') as HTMLElement
    // The slot publishes the route it edits on its own mount; the pass has to
    // find it there — it cannot import the slot without a cycle.
    host.setAttribute('data-bre-provider', 'pi')
    const fetchMock = vi.fn(async () =>
      new Response(JSON.stringify({ ok: true, key: 'sk-stored' }), { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)

    reconcileEditorTabs(root, depsFor('en'), createEditorTabsState())

    const field = root.querySelector('.field') as HTMLElement
    const eye = field.querySelector('.bre-key-eye') as HTMLButtonElement
    const input = field.querySelector('input') as HTMLInputElement
    eye.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }))
    await vi.waitFor(() => {
      expect(input.value).toBe('sk-stored')
    })

    // The mount owns an inline key list, which lists the provider's keys as
    // soon as the field appears — so the reveal is not necessarily the FIRST
    // request, only the one whose answer fills the input.
    const urls = fetchMock.mock.calls.map(call => String((call as unknown as [string])[0]))
    expect(urls).toContain('/dsh-model-think-level/provider-key?route=pi')
    expect(input.type).toBe('text')
  })

  it('aborts on the account editor, whose body has no provider fields at all', () => {
    // The official DeepSeek account editor: header + catalog + actions, no fields.
    const root = document.createElement('div')
    root.innerHTML = `
      <ul class="rows">
        <li class="rowCard">
          <div class="rowHead"><span class="rowName">DeepSeek</span></div>
          <div class="editor">
            <div class="editorHeader"><span class="editorTitle">DeepSeek</span><span class="editorRoute">deepseek</span></div>
            <section class="modelCatalog"><div class="modelList"></div></section>
            <div class="editorActions"><button class="primaryButton" type="button">Apply</button></div>
          </div>
        </li>
      </ul>
    `
    document.body.appendChild(root)
    reconcileEditorTabs(root, depsFor('en'), createEditorTabsState())

    expect(root.querySelector(`.${EDITOR_TABS_CLASS}`)).toBeNull()
    expect(root.querySelector('li')?.classList.contains('bre-tabbed')).toBe(false)
    expect(root.querySelectorAll('[data-bre-region]')).toHaveLength(0)
  })
})

describe('teardownEditorTabs', () => {
  it('removes every mark without removing the DOM an owner rendered', () => {
    const root = buildCard()
    reconcileEditorTabs(root, depsFor('en'), createEditorTabsState())
    selectEditorTab(cardOf(root), 'models')

    teardownEditorTabs()

    // The bar is the tab-bar component's own DOM: teardown drops the takeover
    // class that revealed it and never removes the node React owns.
    expect(document.querySelectorAll(`.${EDITOR_TABS_CLASS}`)).toHaveLength(1)
    expect(document.querySelectorAll('[data-bre-tab]')).toHaveLength(0)
    expect(document.querySelectorAll('[data-bre-region]')).toHaveLength(0)
    expect(document.querySelectorAll('[data-bre-editor-body]')).toHaveLength(0)
    expect(cardOf(root).classList.contains('bre-tabbed')).toBe(false)
    // The official content survives untouched.
    expect(root.querySelectorAll('.field')).toHaveLength(2)
    expect(root.querySelector('.modelList')).not.toBeNull()
    expect(root.querySelector('.bre-headers')).not.toBeNull()
  })

  it('restores a disclosure it forced open, wherever it sits', () => {
    const root = buildLiveCard()
    reconcileEditorTabs(root, depsFor('en'), createEditorTabsState())
    const details = root.querySelector('details.customized') as HTMLDetailsElement
    expect(details.open).toBe(true)

    teardownEditorTabs()

    expect(details.open).toBe(false)
    expect(details.hasAttribute('data-bre-details')).toBe(false)
  })
})
