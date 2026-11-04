// @vitest-environment jsdom
/**
 * The config pane (配置页浮层): the params row and the default-model select
 * under it — the marked models surface as that select's options — plus the
 * close paths + z-index fence. The old model list, empty state and
 * built-in-tool card are gone; a guard test keeps them from coming back.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { act } from 'react'
import { ConfigPane } from '../src/client/ConfigPane.js'
import { clearImageConfigCache } from '../src/client/image-config-client.js'
import { STYLES } from '../src/client/styles.js'
import { zh } from '../src/client/locales.js'
import { IMAGE_CONFIG_PATH } from '../src/constants.js'
import type { RemoteApi } from '../src/client/types.js'
import {
  AUTO_CONTINUE_CONFIG_KEY, DEFAULT_AUTO_CONTINUE_CONFIG, autoContinueConfig,
  setAutoContinueConfig, setAutoContinueEnabled,
} from '../src/client/auto-continue-pref.js'

/** The config the host answers a GET with. */
const CONFIG_VIEW = {
  ok: true,
  enabled: true,
  models: [
    {
      id: 'openai/gpt-image-1', route: 'openai', modelId: 'gpt-image-1', label: 'GPT-Image-1', providerLabel: 'OpenAI',
      api: 'images', baseURL: 'https://api.example/v1', keyRef: 'OPENAI_API_KEY',
      endpoint: { kind: 'images', status: 'ok', checkedAt: 'stamped' },
      params: { sizes: ['1024x1024', '1536x1024'], qualities: ['high', 'medium'], maxN: 4, responseFormat: 'b64_json' },
      lastGoodParams: null, size: '1536x1024', quality: 'high', n: 1,
    },
    {
      id: 'zhipu/cogview-3-plus', route: 'zhipu', modelId: 'cogview-3-plus', label: 'CogView-3-Plus',
      api: 'images', baseURL: 'https://zhipu.example/v1', keyRef: 'ZHIPU_API_KEY',
      endpoint: { kind: 'images', status: 'unverified', checkedAt: null },
      params: { sizes: ['1024x1024'], qualities: ['high'], maxN: 2, responseFormat: 'b64_json' },
      lastGoodParams: null,
    },
  ],
  defaultModel: 'openai/gpt-image-1',
  defaults: { size: '1024x1024', quality: 'high', n: 1, timeoutMs: 300000 },
  outputDir: 'generated-images',
  tool: { registered: true, name: 'generate_image' },
}

/** The settings Remote face the pane reads provider display names through. */
function fakeApi(providers: Record<string, unknown>): { api: RemoteApi; mutates: unknown[] } {
  const mutates: unknown[] = []
  const api = {
    settings: {
      async describe() {
        return {
          ok: true,
          value: {
            writable: true, hasDocument: true,
            namespaces: [{
              ns: 'llm-pi-ai', schema: {}, value: { providers }, user: { providers }, revision: 3,
              applies: 'live', secrets: [],
            }],
          },
        }
      },
      async mutate(_ns: string, ops: unknown[]) {
        mutates.push(ops)
        return { ok: true, value: {} }
      },
    },
  } as unknown as RemoteApi
  return { api, mutates }
}

const t = (key: string, params?: Record<string, unknown>): string => {
  // Keys pass through; params render as a suffix so a test can assert them.
  return params === undefined ? key : `${key} ${JSON.stringify(params)}`
}

type FetchHandler = (url: string, init?: RequestInit) => Response | Promise<Response>

let handleFetch: FetchHandler = () => new Response('{}')

const mountedRoots = new Set<Root>()

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
  setAutoContinueEnabled(false)
  setAutoContinueConfig(DEFAULT_AUTO_CONTINUE_CONFIG)
  // The transport caches the last GET so the pane can paint instantly; a test
  // must start without another test's snapshot.
  clearImageConfigCache()
  handleFetch = () => new Response(JSON.stringify(CONFIG_VIEW), { status: 200, headers: { 'content-type': 'application/json' } })
  vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL, init?: RequestInit) =>
    handleFetch(String(input), init)) as unknown as typeof globalThis.fetch)
})

afterEach(() => {
  act(() => {
    for (const root of mountedRoots) root.unmount()
    mountedRoots.clear()
  })
  vi.unstubAllGlobals()
  document.body.innerHTML = ''
})

/** Mount one pane; returns the component's container and a close helper. */
function mountPane(api: RemoteApi, onClose: () => void): { host: HTMLElement; root: Root } {
  const host = document.createElement('div')
  document.body.appendChild(host)
  const root = createRoot(host)
  mountedRoots.add(root)
  act(() => {
    root.render(createElement(ConfigPane, { api, t, onClose }))
  })
  // The initial read is a promise tail; flush it.
  return { host, root }
}

async function flush(): Promise<void> {
  await act(async () => { await Promise.resolve() })
  await act(async () => { await Promise.resolve() })
}

/** The card starts folded; the model and param controls live in its body. */
async function expand(): Promise<void> {
  const head = document.querySelector<HTMLButtonElement>('.bre-config-expand')!
  await act(async () => { head.click() })
  await flush()
}

function autoCard(): Element {
  return [...document.querySelectorAll('.bre-config-card')]
    .find(node => node.querySelector('.bre-config-card-title')!.textContent === 'autoContinueSectionTitle')!
}

async function editNumber(input: HTMLInputElement, value: string, enter = false): Promise<void> {
  await act(async () => {
    input.focus()
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, value)
    input.dispatchEvent(new Event('input', { bubbles: true }))
  })
  await act(async () => {
    if (enter) input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
    else input.blur()
  })
}

describe('ConfigPane', () => {
  it('the card head is the 「生图」 title and its state — no auto-fetch sub, no model count', async () => {
    const { api } = fakeApi({})
    mountPane(api, () => {})
    await flush()
    const head = document.querySelector('.bre-config-card-head')!
    expect(head.querySelector('.bre-config-card-title')!.textContent).toBe('imagegenSectionTitle')
    expect(head.querySelector('.bre-config-card-state')!.textContent).toBe('cardStateOn')
    expect(document.querySelectorAll('.bre-config-card-sub, .bre-config-card-head .bre-config-badge')).toHaveLength(0)
  })

  it('starts folded with the switch on the head, and expands on the title', async () => {
    const { api } = fakeApi({})
    mountPane(api, () => {})
    await flush()
    const head = document.querySelector<HTMLButtonElement>('.bre-config-expand')!
    expect(head.getAttribute('aria-expanded')).toBe('false')
    expect(document.querySelector('.bre-config-card-body')).toBeNull()
    expect(document.querySelector('.bre-config-card-hint')!.textContent).toBe('imagegenEnabledHint')
    await expand()
    expect(head.getAttribute('aria-expanded')).toBe('true')
    expect(document.querySelector('.bre-config-card-body')).not.toBeNull()
    // The switch is on the head line, outside the folded body.
    expect(document.querySelector('.bre-config-card-body .bre-config-switch')).toBeNull()
  })

  it('the switch is a labelled checkbox and flipping it never unfolds the card', async () => {
    const { api } = fakeApi({})
    const posts: unknown[] = []
    handleFetch = (url, init) => {
      if (init?.method === 'POST' && url === IMAGE_CONFIG_PATH) {
        posts.push(JSON.parse(String(init.body)))
        return new Response(JSON.stringify({ ok: true }), { status: 200 })
      }
      return new Response(JSON.stringify(CONFIG_VIEW), { status: 200 })
    }
    mountPane(api, () => {})
    await flush()
    const toggle = document.querySelector<HTMLInputElement>('.bre-config-switch-input')!
    expect(toggle.getAttribute('role')).toBe('switch')
    expect(toggle.getAttribute('aria-label')).toBe('imagegenEnable')
    expect(toggle.checked).toBe(true)
    await act(async () => { toggle.click() })
    await flush()
    expect(posts).toEqual([{ op: 'save', enabled: false }])
    expect(document.querySelector('.bre-config-card-body')).toBeNull()
    expect(document.querySelector<HTMLButtonElement>('.bre-config-expand')!.getAttribute('aria-expanded')).toBe('false')
  })

  it('off says so in the head and hint, and keeps the models and params configured', async () => {
    let enabled = false
    handleFetch = (url, init) => {
      if (init?.method === 'POST' && url === IMAGE_CONFIG_PATH) {
        const body = JSON.parse(String(init.body)) as { enabled?: boolean }
        if (typeof body.enabled === 'boolean') enabled = body.enabled
        return new Response(JSON.stringify({ ok: true }), { status: 200 })
      }
      return new Response(JSON.stringify({
        ...CONFIG_VIEW,
        enabled,
        // A switched-off service registers no tool: not a failure worth a warning.
        tool: { registered: false, name: null },
      }), { status: 200 })
    }
    const { api } = fakeApi({})
    mountPane(api, () => {})
    await flush()
    expect(document.querySelector('.bre-config-card-state')!.textContent).toBe('cardStateOff')
    expect(document.querySelector('.bre-config-card-hint')!.textContent).toBe('imagegenDisabledHint')
    expect(document.querySelector<HTMLInputElement>('.bre-config-switch-input')!.checked).toBe(false)
    expect(document.querySelector('.bre-config-notice-warn')).toBeNull()
    // The stored choice survives: opening still shows the same model menu.
    await expand()
    const select = document.querySelector<HTMLSelectElement>('.bre-config-default-select')!
    expect(select.value).toBe('openai/gpt-image-1')
    expect(document.querySelectorAll('.bre-config-defaults select')).toHaveLength(4)
  })

  it('a failed switch write shows the reason and leaves the switch where it was', async () => {
    handleFetch = (url, init) => {
      if (init?.method === 'POST' && url === IMAGE_CONFIG_PATH) {
        return new Response(JSON.stringify({ ok: false, error: 'settings are read-only' }), { status: 500 })
      }
      return new Response(JSON.stringify(CONFIG_VIEW), { status: 200 })
    }
    const { api } = fakeApi({})
    mountPane(api, () => {})
    await flush()
    const toggle = document.querySelector<HTMLInputElement>('.bre-config-switch-input')!
    await act(async () => { toggle.click() })
    await flush()
    expect(document.querySelector('.bre-config-notice')!.textContent).toContain('settings are read-only')
  })

  it('no model list, empty state or built-in-tool card renders anymore', async () => {
    const { api } = fakeApi({})
    mountPane(api, () => {})
    await flush()
    expect(document.querySelectorAll('.bre-config-rows, .bre-config-row, .bre-config-tool, .bre-config-empty')).toHaveLength(0)
    const text = document.body.textContent ?? ''
    expect(text).not.toContain('imagegenTestEndpoint')
    expect(text).not.toContain('imagegenProbe')
    expect(text).not.toContain('imagegenToolTitle')
    expect(text).not.toContain('imagegenSectionSub')
    expect(text).not.toContain('configPaneFoot')
  })

  it('shows the default model in the select, options carrying no key details', async () => {
    const { api } = fakeApi({})
    mountPane(api, () => {})
    await flush()
    await expand()
    const select = document.querySelector<HTMLSelectElement>('.bre-config-default-select')!
    expect(select.value).toBe('openai/gpt-image-1')
    expect([...select.options].map(option => option.text)).toEqual(['GPT-Image-1', 'CogView-3-Plus'])
    // The options are labels only — no route prefix, no key reference, no id.
    expect(document.body.textContent).not.toContain('OPENAI_API_KEY')
    expect(document.body.textContent).not.toContain('openai/gpt-image-1')
  })

  it('surfaces the host reason when the native tool failed to register', async () => {
    handleFetch = () => new Response(JSON.stringify({
      ...CONFIG_VIEW,
      tool: { registered: false, name: null, error: 'unsupported JSON schema: schema.prompt is not a supported keyword' },
    }), { status: 200 })
    const { api } = fakeApi({})
    mountPane(api, () => {})
    await flush()
    await expand()
    const warn = document.querySelector('.bre-config-notice-warn')!
    expect(warn).not.toBeNull()
    expect(warn.textContent).toContain('imagegenToolMissing')
    expect(warn.querySelector('.bre-config-notice-why')!.textContent).toContain('schema.prompt is not a supported keyword')
  })

  it('stays quiet about the tool when it registered, or was never attempted', async () => {
    const { api } = fakeApi({})
    mountPane(api, () => {})
    await flush()
    await expand()
    expect(document.querySelector('.bre-config-notice-warn')).toBeNull()
  })

  it('the params row comes first and the default-model select sits under it', async () => {
    const { api } = fakeApi({})
    mountPane(api, () => {})
    await flush()
    await expand()
    const children = [...document.querySelector('.bre-config-card-body')!.children]
    const paramsAt = children.findIndex(node => node.classList.contains('bre-config-defaults'))
    const defaultAt = children.findIndex(node => node.classList.contains('bre-config-default-row'))
    expect(paramsAt).toBeGreaterThanOrEqual(0)
    expect(defaultAt).toBe(paramsAt + 1)
    // The params themselves (size / quality / n / timeout) stay in row one.
    expect(children[paramsAt]!.querySelectorAll('select')).toHaveLength(4)
  })

  it('shows the 「未设置」 placeholder when no default model is picked yet', async () => {
    handleFetch = () => new Response(JSON.stringify({ ...CONFIG_VIEW, defaultModel: null }), { status: 200 })
    const { api } = fakeApi({})
    mountPane(api, () => {})
    await flush()
    await expand()
    const select = document.querySelector<HTMLSelectElement>('.bre-config-default-select')!
    expect(select.value).toBe('')
    expect(select.options[0]!.text).toBe('imagegenDefaultModelNone')
    expect(select.options[0]!.disabled).toBe(true)
    // The models are still one pick away; the empty placeholder is not selectable.
    expect([...select.options].map(option => option.value)).toEqual(['', 'openai/gpt-image-1', 'zhipu/cogview-3-plus'])
  })

  it('disambiguates two routes carrying the same model label', async () => {
    const twin = { ...CONFIG_VIEW.models[1]!, id: 'openai/cogview-3-plus', route: 'openai', providerLabel: 'OpenAI' }
    handleFetch = () => new Response(JSON.stringify({ ...CONFIG_VIEW, models: [CONFIG_VIEW.models[1]!, twin] }), { status: 200 })
    const { api } = fakeApi({})
    mountPane(api, () => {})
    await flush()
    await expand()
    const optionTexts = [...document.querySelector('.bre-config-default-select')!.querySelectorAll('option')]
      .map(option => option.textContent)
    expect(optionTexts).toEqual(['CogView-3-Plus · zhipu', 'CogView-3-Plus · OpenAI'])
  })

  it('falls back to the live settings displayName before the route for colliding labels', async () => {
    const view = {
      ...CONFIG_VIEW,
      models: [
        { ...CONFIG_VIEW.models[0]!, label: 'Same Label', providerLabel: undefined },
        { ...CONFIG_VIEW.models[1]!, label: 'Same Label' },
      ],
    }
    handleFetch = () => new Response(JSON.stringify(view), { status: 200 })
    const { api } = fakeApi({ openai: { displayName: 'OpenAI 官方' } })
    mountPane(api, () => {})
    await flush()
    await expand()
    const optionTexts = [...document.querySelector('.bre-config-default-select')!.querySelectorAll('option')]
      .map(option => option.textContent)
    expect(optionTexts).toEqual(['Same Label · OpenAI 官方', 'Same Label · zhipu'])
  })

  it('picking another default saves through the route and re-renders', async () => {
    const { api } = fakeApi({})
    const posts: { url: string; body: unknown }[] = []
    handleFetch = (url, init) => {
      if (init?.method === 'POST' && url === IMAGE_CONFIG_PATH) {
        posts.push({ url, body: JSON.parse(String(init.body)) })
        return new Response(JSON.stringify({ ok: true }), { status: 200 })
      }
      return new Response(JSON.stringify(CONFIG_VIEW), { status: 200 })
    }
    mountPane(api, () => {})
    await flush()
    await expand()
    const select = document.querySelector<HTMLSelectElement>('.bre-config-default-select')!
    await act(async () => {
      select.value = 'zhipu/cogview-3-plus'
      select.dispatchEvent(new Event('change', { bubbles: true }))
    })
    await flush()
    expect(posts).toHaveLength(1)
    expect(posts[0]!.body).toMatchObject({ op: 'save', defaultModel: 'zhipu/cogview-3-plus' })
  })

  it('the defaults size select offers the same ladder and saves the pixel value', async () => {
    const { api } = fakeApi({})
    const posts: unknown[] = []
    handleFetch = (url, init) => {
      if (init?.method === 'POST' && url === IMAGE_CONFIG_PATH) {
        posts.push(JSON.parse(String(init.body)))
        return new Response(JSON.stringify({ ok: true }), { status: 200 })
      }
      return new Response(JSON.stringify(CONFIG_VIEW), { status: 200 })
    }
    mountPane(api, () => {})
    await flush()
    await expand()
    const selects = [...document.querySelectorAll<HTMLSelectElement>('.bre-config-defaults select')]
    expect([...selects[0]!.options].map(option => option.text)).toEqual(['1K', '2K', '4K'])
    await act(async () => {
      selects[0]!.value = '4096x4096'
      selects[0]!.dispatchEvent(new Event('change', { bubbles: true }))
    })
    await flush()
    expect(posts[0]).toMatchObject({ op: 'save', defaults: { size: '4096x4096' } })
  })

  it('the defaults timeout is a five-step minute menu that saves milliseconds', async () => {
    const { api } = fakeApi({})
    const posts: { defaults?: Record<string, unknown> }[] = []
    let stored = 300000
    handleFetch = (url, init) => {
      if (init?.method === 'POST' && url === IMAGE_CONFIG_PATH) {
        const body = JSON.parse(String(init.body)) as { defaults?: { timeoutMs?: number } }
        stored = body.defaults?.timeoutMs ?? stored
        posts.push(body)
        return new Response(JSON.stringify({ ok: true }), { status: 200 })
      }
      return new Response(JSON.stringify({
        ...CONFIG_VIEW,
        defaults: { ...CONFIG_VIEW.defaults, timeoutMs: stored },
      }), { status: 200 })
    }
    mountPane(api, () => {})
    await flush()
    await expand()
    const timeoutSelect = (): HTMLSelectElement => document.querySelector<HTMLSelectElement>('.bre-config-timeout select')!
    // 5/10/15/30/60 minutes, carried as the milliseconds the host stores.
    expect(Array.from(timeoutSelect().options).map(option => option.value))
      .toEqual(['300000', '600000', '900000', '1800000', '3600000'])
    expect(timeoutSelect().value).toBe('300000')
    await act(async () => {
      const select = timeoutSelect()
      select.value = '1800000'
      select.dispatchEvent(new Event('change', { bubbles: true }))
    })
    await flush()
    expect(posts[0]).toMatchObject({ op: 'save', defaults: { timeoutMs: 1800000 } })
    // The reload lands the saved step in the control.
    expect(timeoutSelect().value).toBe('1800000')
  })

  it('keeps a stored timeout outside the menu visible instead of silently changing it', async () => {
    // An older build stored 2 minutes; the menu must show that truth, not snap
    // the setting to 5 minutes behind the user's back.
    const { api } = fakeApi({})
    handleFetch = () => new Response(JSON.stringify({
      ...CONFIG_VIEW,
      defaults: { ...CONFIG_VIEW.defaults, timeoutMs: 120000 },
    }), { status: 200 })
    mountPane(api, () => {})
    await flush()
    await expand()
    const timeoutSelect = document.querySelector<HTMLSelectElement>('.bre-config-timeout select')!
    expect(timeoutSelect.value).toBe('120000')
    expect(Array.from(timeoutSelect.options).map(option => option.value).slice(0, 2))
      .toEqual(['120000', '300000'])
  })

  it('closes on ✕, on Escape, and on a backdrop click — never on an inside click', async () => {
    const { api } = fakeApi({})
    const onClose = vi.fn()
    mountPane(api, onClose)
    await flush()
    const backdrop = document.querySelector('.bre-config-backdrop')!
    const close = document.querySelector<HTMLButtonElement>('.bre-config-close')!
    await act(async () => { close.click() })
    expect(onClose).toHaveBeenCalledTimes(1)
    await act(async () => {
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
    })
    expect(onClose).toHaveBeenCalledTimes(2)
    await act(async () => {
      backdrop.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }))
    })
    expect(onClose).toHaveBeenCalledTimes(3)
    // A click on the pane itself is NOT a close.
    const pane = document.querySelector('.bre-config-pane')!
    await act(async () => {
      pane.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }))
    })
    expect(onClose).toHaveBeenCalledTimes(3)
  })

  it('the pane clears the settings dialog\'s opaque mask (z-index 1010, per design)', () => {
    expect(STYLES).toContain('.bre-config-backdrop')
    expect(STYLES).toMatch(/\.bre-config-backdrop\s*{[^}]*z-index:\s*1010/s)
  })

  it('the card list keeps an even gap between the cards', () => {
    expect(STYLES).toMatch(/\.bre-config-body\s*{[^}]*display:\s*flex/s)
    expect(STYLES).toMatch(/\.bre-config-body\s*{[^}]*gap:\s*12px/s)
  })

  it('a failed GET renders the readable failure instead of an empty pane', async () => {
    handleFetch = () => new Response(JSON.stringify({ ok: false, error: 'boom' }), { status: 500 })
    const { api } = fakeApi({})
    mountPane(api, () => {})
    await flush()
    expect(document.body.textContent).toContain('imagegenLoadFailed')
    expect(document.body.textContent).toContain('boom')
  })

  it('expands auto-continue into labelled wait and retry controls', async () => {
    const { api } = fakeApi({})
    mountPane(api, () => {})
    await flush()
    const card = autoCard()
    const head = card.querySelector<HTMLButtonElement>('.bre-config-expand')!
    const sw = card.querySelector<HTMLInputElement>('.bre-config-switch-input')!
    await act(async () => { sw.click() })
    expect(head.getAttribute('aria-expanded')).toBe('false')
    expect(card.querySelectorAll('input[type="number"]')).toHaveLength(0)
    await act(async () => { head.click() })
    const fields = [...card.querySelectorAll<HTMLInputElement>('input[type="number"]')]
    expect(fields).toHaveLength(2)
    expect(fields.map(input => input.value)).toEqual(['2', '5'])
    expect(fields.map(input => [input.min, input.max, input.step])).toEqual([
      ['1', '3600', '1'], ['1', '100', '1'],
    ])
    expect(fields[0]!.closest('label')!.querySelector('.bre-config-auto-label')!.textContent).toBe('autoContinueWaitLabel')
    expect(fields[1]!.closest('label')!.querySelector('.bre-config-auto-label')!.textContent).toBe('autoContinueRetriesLabel')
    expect([...card.querySelectorAll('.bre-config-auto-unit')].map(unit => unit.textContent)).toEqual(['autoContinueSecondsUnit', 'autoContinueRetriesUnit'])
    expect(fields.map(input => input.getAttribute('aria-label'))).toEqual([
      'autoContinueWaitLabel (autoContinueSecondsUnit)', 'autoContinueRetriesLabel (autoContinueRetriesUnit)',
    ])
    expect(fields.map(input => input.title)).toEqual(['1–3600 autoContinueSecondsUnit', '1–100 autoContinueRetriesUnit'])
    expect(card.querySelector('.bre-config-card-hint')).toBeNull()
    expect(card.textContent).not.toContain('autoContinueDescription')
    expect(card.textContent).not.toContain('autoContinueConfigHint')
  })

  it('saves wait and retry values on blur or Enter and keeps them when folded or disabled', async () => {
    const { api } = fakeApi({})
    const { root } = mountPane(api, () => {})
    await flush()
    let card = autoCard()
    await act(async () => { card.querySelector<HTMLButtonElement>('.bre-config-expand')!.click() })
    let fields = [...card.querySelectorAll<HTMLInputElement>('input[type="number"]')]
    await editNumber(fields[0]!, '12')
    await editNumber(fields[1]!, '3', true)
    expect(autoContinueConfig()).toEqual({ waitSeconds: 12, maxRetries: 3 })
    expect(JSON.parse(window.localStorage.getItem(AUTO_CONTINUE_CONFIG_KEY)!)).toEqual({ waitSeconds: 12, maxRetries: 3 })
    expect(card.querySelector('.bre-config-auto-summary')).toBeNull()
    expect(fields[0]!.value).toBe('12')
    await act(async () => {
      card.querySelector<HTMLButtonElement>('.bre-config-expand')!.click()
      card.querySelector<HTMLInputElement>('.bre-config-switch-input')!.click()
      card.querySelector<HTMLInputElement>('.bre-config-switch-input')!.click()
    })
    expect(card.querySelectorAll('input[type="number"]')).toHaveLength(0)
    expect(card.querySelector('.bre-config-auto-summary')!.textContent).toContain('"seconds":12,"count":3')
    await act(async () => { root.unmount() })
    mountPane(api, () => {})
    await flush()
    card = autoCard()
    await act(async () => { card.querySelector<HTMLButtonElement>('.bre-config-expand')!.click() })
    fields = [...card.querySelectorAll<HTMLInputElement>('input[type="number"]')]
    expect(fields.map(input => input.value)).toEqual(['12', '3'])
  })

  it('normalizes out-of-range drafts and restores a cleared field instead of losing the setting', async () => {
    const { api } = fakeApi({})
    mountPane(api, () => {})
    await flush()
    const card = autoCard()
    await act(async () => { card.querySelector<HTMLButtonElement>('.bre-config-expand')!.click() })
    const fields = [...card.querySelectorAll<HTMLInputElement>('input[type="number"]')]
    await editNumber(fields[0]!, '0')
    await editNumber(fields[1]!, '999')
    expect(fields.map(input => input.value)).toEqual(['1', '100'])
    await editNumber(fields[0]!, '5.8')
    await editNumber(fields[1]!, '')
    expect(autoContinueConfig()).toEqual({ waitSeconds: 5, maxRetries: 100 })
    expect(fields.map(input => input.value)).toEqual(['5', '100'])
  })

  it('reflects a synchronized preference update in both controls and the folded summary', async () => {
    const { api } = fakeApi({})
    mountPane(api, () => {})
    await flush()
    const card = autoCard()
    await act(async () => { card.querySelector<HTMLButtonElement>('.bre-config-expand')!.click() })
    await act(async () => { setAutoContinueConfig({ waitSeconds: 25, maxRetries: 8 }) })
    expect([...card.querySelectorAll<HTMLInputElement>('input[type="number"]')].map(input => input.value)).toEqual(['25', '8'])
    await act(async () => { card.querySelector<HTMLButtonElement>('.bre-config-expand')!.click() })
    expect(card.querySelector('.bre-config-card-hint')!.textContent).toContain('25')
    expect(card.querySelector('.bre-config-card-hint')!.textContent).toContain('8')
  })

  it('keeps field typography smaller than the title even under oversized host label styles', async () => {
    const { api } = fakeApi({})
    mountPane(api, () => {})
    await flush()
    const card = autoCard()
    await act(async () => { card.querySelector<HTMLButtonElement>('.bre-config-expand')!.click() })
    const style = document.createElement('style')
    const selectors = ['.bre-config-card-title', '.bre-config-auto-field', '.bre-config-auto-label', '.bre-config-auto-input', '.bre-config-auto-unit', '.bre-config-auto-control']
    style.textContent = 'label { font-size: 24px; line-height: 1.8; }' + selectors.map(selector => {
      // Anchor at a rule start: the same class name also appears in `:hover` rules.
      const start = STYLES.search(new RegExp(`^${selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')} \\{`, 'm'))
      expect(start).toBeGreaterThanOrEqual(0)
      return STYLES.slice(start, STYLES.indexOf('}', start) + 1)
    }).join('\n')
    document.body.append(style)
    const sizeOf = (selector: string): string => window.getComputedStyle(card.querySelector(selector)!).fontSize
    expect(sizeOf('.bre-config-card-title')).toBe('14.5px')
    expect(sizeOf('.bre-config-auto-label')).toBe('11.5px')
    expect(sizeOf('.bre-config-auto-input')).toBe('13px')
    expect(sizeOf('.bre-config-auto-unit')).toBe('11px')
    for (const control of card.querySelectorAll('.bre-config-auto-control')) {
      expect(window.getComputedStyle(control).height).toBe('34px')
    }
    expect(STYLES).toMatch(/\.bre-config-auto-fields\s*{[^}]*grid-template-columns:\s*repeat\(2,\s*minmax\(0,\s*1fr\)\)/s)
  })

  it('hosts the auto-continue card: folded, the switch reflects and flips the preference', async () => {
    const { api } = fakeApi({})
    mountPane(api, () => {})
    await flush()
    // Two folded cards now: 生图 and 自动继续.
    expect(document.querySelectorAll('.bre-config-card')).toHaveLength(2)
    const card = [...document.querySelectorAll('.bre-config-card')]
      .find(node => node.querySelector('.bre-config-card-title')!.textContent === 'autoContinueSectionTitle')!
    // Same folded shape as the image card: switch on the head, body folded.
    expect(card.querySelector('.bre-config-expand')).not.toBeNull()
    expect(card.querySelector('.bre-config-card-body')).toBeNull()
    expect(card.querySelector('.bre-config-card-state')!.textContent).toBe('cardStateOff')
    // Folded, the one-line streak cap sits under the head and the full
    // description stays folded away — the same collapsed height as 生图.
    expect(card.querySelector('.bre-config-card-hint')!.textContent).toMatch(/^autoContinueHint/)
    expect(card.textContent).not.toContain('autoContinueDescription')
    const sw = card.querySelector<HTMLInputElement>('.bre-config-switch-input')!
    expect(sw.checked).toBe(false)
    await act(async () => { sw.click() })
    expect(sw.checked).toBe(true)
    expect(card.querySelector('.bre-config-card-state')!.textContent).toBe('cardStateOn')
    // Leave the module-level preference as tests found it: OFF.
    await act(async () => { sw.click() })
    expect(sw.checked).toBe(false)
    // Expanded: just two compact controls, not a repeated summary or paragraphs.
    await act(async () => { card.querySelector<HTMLButtonElement>('.bre-config-expand')!.click() })
    expect(card.querySelectorAll('input[type="number"]')).toHaveLength(2)
    expect(card.querySelector('.bre-config-card-hint')).toBeNull()
    expect(card.textContent).not.toContain('autoContinueDescription')
    expect(card.textContent).not.toContain('autoContinueConfigHint')
  })

  it('names the switch state with one shared word on both cards', async () => {
    const { api } = fakeApi({})
    mountPane(api, () => {})
    await flush()
    const [imageCard, auto] = [...document.querySelectorAll('.bre-config-card')]
    expect(imageCard!.querySelector('.bre-config-card-state')!.textContent).toBe('cardStateOn')
    await act(async () => { auto!.querySelector<HTMLInputElement>('.bre-config-switch-input')!.click() })
    expect(auto!.querySelector('.bre-config-card-state')!.textContent).toBe('cardStateOn')
    // The words beside the two switches are one pair, not 「已开启」 next to 「启用」.
    expect(zh.cardStateOn).toBe('开启')
    expect(zh.cardStateOff).toBe('关闭')
    // Leave the module-level preference as tests found it: OFF.
    await act(async () => { auto!.querySelector<HTMLInputElement>('.bre-config-switch-input')!.click() })
  })

  it('the chevron folds and unfolds the card it sits on', async () => {
    const { api } = fakeApi({})
    mountPane(api, () => {})
    await flush()
    const chevron = document.querySelector<HTMLElement>('.bre-config-chevron')!
    expect(chevron.getAttribute('data-open')).toBe('false')
    await act(async () => { chevron.click() })
    expect(chevron.getAttribute('data-open')).toBe('true')
    expect(document.querySelector('.bre-config-card-body')).not.toBeNull()
  })

  it('reserves one fixed pane height so expanding a card never stretches the dialog', () => {
    // 400px holds both cards expanded; the body scrolls instead of the pane growing.
    expect(STYLES).toMatch(/\.bre-config-pane\s*{[^}]*height:\s*min\(400px,\s*calc\(100vh - 48px\)\)/s)
    expect(STYLES).toMatch(/\.bre-config-body\s*{[^}]*overflow-y:\s*auto/s)
  })
})
