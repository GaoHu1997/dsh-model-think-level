// @vitest-environment jsdom
/**
 * The config pane (配置页浮层): the derived model list, the default-model
 * radio, per-row endpoint badges and params, the empty state's one-click
 * marking (through the settings write channel, never a raw file edit), the MCP
 * switch driven by the derived install state, and the close paths + z-index
 * fence.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { act } from 'react'
import { ConfigPane } from '../src/client/ConfigPane.js'
import { clearImageConfigCache } from '../src/client/image-config-client.js'
import { STYLES } from '../src/client/styles.js'
import { IMAGE_CONFIG_PATH, IMAGE_GENERATE_PATH, IMAGE_MCP_PATH } from '../src/constants.js'
import type { RemoteApi } from '../src/client/types.js'

/** The config the host answers a GET with. */
const CONFIG_VIEW = {
  ok: true,
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
  mcp: {
    installed: false, serverName: 'dsh-image', toolName: 'mcp__dsh-image__generate_image',
    restartRequired: false, diagnostics: { lastCheckAt: null, ok: false, error: null },
  },
}

/** The settings Remote face the marking write goes through. */
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

describe('ConfigPane', () => {
  it('renders the model display name with the provider display name under it (no key details)', async () => {
    const { api } = fakeApi({})
    mountPane(api, () => {})
    await flush()
    const text = document.body.textContent ?? ''
    // Head: the model label alone — no route prefix, no key reference, no id.
    const heads = [...document.querySelectorAll('.bre-config-name-main')].map(node => node.firstChild?.textContent)
    expect(heads).toEqual(['GPT-Image-1', 'CogView-3-Plus'])
    // Second line: the provider's displayName; a profile without one falls back
    // to the route, so the line is never empty.
    const subs = [...document.querySelectorAll('.bre-config-name-sub')].map(node => node.firstChild?.textContent)
    expect(subs).toEqual(['OpenAI', 'zhipu'])
    expect(text).not.toContain('OPENAI_API_KEY')
    expect(text).not.toContain('openai/gpt-image-1')
    expect(text).toContain('imagegenEndpointOk') // the verified badge
    expect(text).toContain('imagegenEndpointUnverified') // the honest default
    expect(document.querySelectorAll('.bre-config-row')).toHaveLength(2)
  })

  it('falls back to the live settings displayName when the view has no providerLabel', async () => {
    const view = {
      ...CONFIG_VIEW,
      models: CONFIG_VIEW.models.map((model, index) => index === 0 ? { ...model, providerLabel: undefined } : model),
    }
    handleFetch = () => new Response(JSON.stringify(view), { status: 200, headers: { 'content-type': 'application/json' } })
    const { api } = fakeApi({ openai: { displayName: 'OpenAI 官方' } })
    mountPane(api, () => {})
    await flush()
    const subs = [...document.querySelectorAll('.bre-config-name-sub')].map(node => node.firstChild?.textContent)
    expect(subs[0]).toBe('OpenAI 官方')
  })

  it('marks the default model with the radio and the 「默认」 badge', async () => {
    const { api } = fakeApi({})
    mountPane(api, () => {})
    await flush()
    const radios = [...document.querySelectorAll<HTMLInputElement>('.bre-config-radio')]
    expect(radios[0]!.checked).toBe(true)
    expect(radios[1]!.checked).toBe(false)
    expect(document.body.textContent).toContain('imagegenDefaultBadge')
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
    const radios = [...document.querySelectorAll<HTMLInputElement>('.bre-config-radio')]
    await act(async () => { radios[1]!.click() })
    await flush()
    expect(posts).toHaveLength(1)
    expect(posts[0]!.body).toMatchObject({ op: 'save', defaultModel: 'zhipu/cogview-3-plus' })
  })

  it('the per-row size select offers the 1K/2K/4K ladder and saves a pixel override', async () => {
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
    const selects = [...document.querySelectorAll<HTMLSelectElement>('.bre-config-row select')]
    expect([...selects[0]!.options].map(option => option.text)).toEqual(['1K', '2K', '4K'])
    // The stored 1536x1024 legacy size reads as the nearest tier (1K here).
    expect(selects[0]!.value).toBe('1024x1024')
    await act(async () => {
      selects[0]!.value = '2048x2048'
      selects[0]!.dispatchEvent(new Event('change', { bubbles: true }))
    })
    await flush()
    expect(posts[0]).toMatchObject({ op: 'save', models: [{ id: 'openai/gpt-image-1', size: '2048x2048' }] })
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
    const timeoutSelect = document.querySelector<HTMLSelectElement>('.bre-config-timeout select')!
    expect(timeoutSelect.value).toBe('120000')
    expect(Array.from(timeoutSelect.options).map(option => option.value).slice(0, 2))
      .toEqual(['120000', '300000'])
  })

  it('the MCP switch installs through the route and reflects the derived state', async () => {
    const { api } = fakeApi({})
    let installed = false
    handleFetch = (url, init) => {
      if (init?.method === 'POST' && url === IMAGE_MCP_PATH) {
        expect(JSON.parse(String(init.body))).toMatchObject({ action: 'install' })
        installed = true
        return new Response(JSON.stringify({ ok: true, selfcheck: { ok: true, error: null } }), { status: 200 })
      }
      return new Response(JSON.stringify({ ...CONFIG_VIEW, mcp: { ...CONFIG_VIEW.mcp, installed } }), { status: 200 })
    }
    mountPane(api, () => {})
    await flush()
    const toggle = document.querySelector<HTMLButtonElement>('.bre-config-switch')!
    expect(toggle.classList.contains('on')).toBe(false)
    await act(async () => { toggle.click() })
    await flush()
    expect(document.querySelector<HTMLButtonElement>('.bre-config-switch')!.classList.contains('on')).toBe(true)
    expect(document.body.textContent).toContain('mcp__dsh-image__generate_image')
  })

  it('install shows 「热加载中」 and clears it once the poll observes the derived state', async () => {
    const { api } = fakeApi({})
    let installed = false
    let reads = 0
    handleFetch = (url, init) => {
      if (init?.method === 'POST' && url === IMAGE_MCP_PATH) {
        return new Response(JSON.stringify({ ok: true }), { status: 200 })
      }
      reads += 1
      // The first post-action read still shows the old state (HMR in flight);
      // the derived state moves only from the next read on.
      const visible = reads >= 3
      void installed
      return new Response(JSON.stringify({ ...CONFIG_VIEW, mcp: { ...CONFIG_VIEW.mcp, installed: visible } }), { status: 200 })
    }
    vi.useFakeTimers()
    try {
      mountPane(api, () => {})
      await flush()
      const toggle = document.querySelector<HTMLButtonElement>('.bre-config-switch')!
      await act(async () => { toggle.click() })
      await flush()
      // Mid-flight: the submitted line is up, the poll is waiting for HMR.
      expect(document.body.textContent).toContain('mcpHotReload')
      await act(async () => { await vi.advanceTimersByTimeAsync(1500) })
      // The poll's second read sees the state moved: notice cleared, switch on.
      expect(document.body.textContent).not.toContain('mcpHotReload')
      expect(document.body.textContent).not.toContain('mcpRestartHint')
      expect(document.querySelector<HTMLButtonElement>('.bre-config-switch')!.classList.contains('on')).toBe(true)
    } finally {
      vi.useRealTimers()
    }
  })

  it('a poll that exhausts without the state moving lands the conservative restart hint', async () => {
    const { api } = fakeApi({})
    let installed = false
    let installs = 0
    handleFetch = (url, init) => {
      if (init?.method === 'POST' && url === IMAGE_MCP_PATH) {
        installs += 1
        return new Response(JSON.stringify({ ok: true }), { status: 200 })
      }
      // installed stays false forever: the hot reload never lands here.
      return new Response(JSON.stringify({ ...CONFIG_VIEW, mcp: { ...CONFIG_VIEW.mcp, installed } }), { status: 200 })
    }
    vi.useFakeTimers()
    try {
      mountPane(api, () => {})
      await flush()
      const toggle = document.querySelector<HTMLButtonElement>('.bre-config-switch')!
      await act(async () => { toggle.click() })
      await flush()
      expect(document.body.textContent).toContain('mcpHotReload')
      // Burn the whole poll window (5 attempts × 1s): the hint replaces it.
      await act(async () => { await vi.advanceTimersByTimeAsync(6000) })
      expect(document.body.textContent).toContain('mcpRestartHint')
      expect(installs).toBe(1) // the poll reads, never re-installs
      void installed
    } finally {
      vi.useRealTimers()
    }
  })

  it('the empty state offers one-click marking through the settings write channel', async () => {
    const { api, mutates } = fakeApi({
      aliyun: { models: [{ id: 'flux-dev', name: 'FLUX.1 dev' }, { id: 'qwen-max' }] },
    })
    handleFetch = () => new Response(JSON.stringify({ ...CONFIG_VIEW, models: [], defaultModel: null }), { status: 200 })
    mountPane(api, () => {})
    await flush()
    expect(document.body.textContent).toContain('imagegenEmptyText')
    // Step 1: find suspects — the suspected row appears, the chat one does not.
    const find = [...document.querySelectorAll('button')].find(button => button.textContent === 'imagegenFindSuspects')!
    await act(async () => { find.click() })
    await flush()
    expect(document.body.textContent).toContain('aliyun · FLUX.1 dev')
    expect(document.body.textContent).not.toContain('qwen-max')
    // Step 2: mark them — a settings mutate lands (inputImageGen marker).
    const mark = [...document.querySelectorAll('button')].find(button => button.textContent?.startsWith('imagegenMarkSuspects'))!
    await act(async () => { mark.click() })
    await flush()
    expect(mutates).toHaveLength(1)
    const ops = mutates[0] as { op: string; path: string[]; value: unknown }[]
    const modelsOp = ops.find(op => op.path[2] === 'models')
    const row = (modelsOp!.value as { id: string; inputImageGen?: boolean }[]).find(model => model.id === 'flux-dev')!
    expect(row.inputImageGen).toBe(true)
    expect(document.body.textContent).toContain('imagegenMarked')
  })

  it('the 「试一张」 probe calls the direct generate route and reports the path', async () => {
    const { api } = fakeApi({})
    handleFetch = (url, init) => {
      if (init?.method === 'POST' && url === IMAGE_GENERATE_PATH) {
        return new Response(JSON.stringify({ ok: true, filePath: '/out/x.png', mime: 'image/png', model: 'openai/gpt-image-1', paramsUsed: { size: '1024x1024', quality: 'high', n: 1 } }), { status: 200 })
      }
      return new Response(JSON.stringify(CONFIG_VIEW), { status: 200 })
    }
    mountPane(api, () => {})
    await flush()
    const probe = [...document.querySelectorAll('button')].find(button => button.textContent === 'imagegenProbe')!
    await act(async () => { probe.click() })
    await flush()
    expect(document.body.textContent).toContain('imagegenProbeDone')
    expect(document.body.textContent).toContain('/out/x.png')
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
