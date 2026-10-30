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
import { IMAGE_CONFIG_PATH } from '../src/constants.js'
import type { RemoteApi } from '../src/client/types.js'

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

beforeEach(() => {
  // The transport caches the last GET so the pane can paint instantly; a test
  // must start without another test's snapshot.
  clearImageConfigCache()
  handleFetch = () => new Response(JSON.stringify(CONFIG_VIEW), { status: 200, headers: { 'content-type': 'application/json' } })
  vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL, init?: RequestInit) =>
    handleFetch(String(input), init)) as unknown as typeof globalThis.fetch)
})

afterEach(() => {
  vi.unstubAllGlobals()
  document.body.innerHTML = ''
})

/** Mount one pane; returns the component's container and a close helper. */
function mountPane(api: RemoteApi, onClose: () => void): { host: HTMLElement; root: Root } {
  const host = document.createElement('div')
  document.body.appendChild(host)
  const root = createRoot(host)
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

describe('ConfigPane', () => {
  it('the card head is the 「生图」 title and its state — no auto-fetch sub, no model count', async () => {
    const { api } = fakeApi({})
    mountPane(api, () => {})
    await flush()
    const head = document.querySelector('.bre-config-card-head')!
    expect(head.querySelector('.bre-config-card-title')!.textContent).toBe('imagegenSectionTitle')
    expect(head.querySelector('.bre-config-card-state')!.textContent).toBe('imagegenEnabled')
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
    expect(document.querySelector('.bre-config-card-state')!.textContent).toBe('imagegenDisabled')
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

  it('a failed GET renders the readable failure instead of an empty pane', async () => {
    handleFetch = () => new Response(JSON.stringify({ ok: false, error: 'boom' }), { status: 500 })
    const { api } = fakeApi({})
    mountPane(api, () => {})
    await flush()
    expect(document.body.textContent).toContain('imagegenLoadFailed')
    expect(document.body.textContent).toContain('boom')
  })
})
