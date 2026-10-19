/**
 * The 高级配置 pane's long-cache section: read the route's pin, write it back as
 * a leaf compat op, and show the switch only where the protocol offers it.
 *
 * The point of the section is that the field a relay rejects (`prompt_cache_key`)
 * is built into the request BODY, so it cannot be a header; these tests pin the
 * two halves of that claim — the read/write seam and what the pane renders.
 */

// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, createElement } from 'react'
import { createRoot } from 'react-dom/client'
import { LongCacheSection } from '../src/client/LongCacheSection.js'
import {
  LONG_CACHE_FIELD,
  describeNamespace,
  providerLongCacheOf,
  writeProviderLongCache,
} from '../src/client/ops.js'
import { en } from '../src/client/locales.js'
import { STYLES } from '../src/client/styles.js'
import type { RemoteApi, SettingsNamespaceView } from '../src/client/types.js'

;(globalThis as Record<string, unknown>)['IS_REACT_ACT_ENVIRONMENT'] = true

const t = (key: string, params?: Record<string, string | number>): string => {
  let text = (en as Record<string, string>)[key] ?? key
  for (const [name, value] of Object.entries(params ?? {})) {
    text = text.replaceAll(`{${String(name)}}`, String(value))
  }
  return text
}

/** One namespace view over the given raw layers. */
function view(user: unknown, base?: unknown): SettingsNamespaceView {
  return {
    ns: 'llm-pi-ai',
    schema: {},
    value: user,
    user,
    ...(base === undefined ? {} : { base }),
    revision: 7,
    applies: 'live',
    secrets: [],
  } as unknown as SettingsNamespaceView
}

/** A settings Remote whose describe answers one namespace view. */
function fakeApi(namespace: SettingsNamespaceView, options: {
  writable?: boolean
  mutate?: (ops: unknown[], attempt: number) => Promise<unknown>
} = {}): RemoteApi & { calls: { ops: unknown[]; revision?: number }[] } {
  const calls: { ops: unknown[]; revision?: number }[] = []
  const api = {
    settings: {
      async describe() {
        return { ok: true, value: { namespaces: [namespace], writable: options.writable !== false } }
      },
      async mutate(_ns: string, ops: unknown[], revision?: number) {
        calls.push({ ops, revision })
        return options.mutate === undefined
          ? ({ ok: true, value: namespace } as never)
          : await options.mutate(ops, calls.length - 1) as never
      },
    },
  }
  return Object.assign(api, { calls }) as unknown as RemoteApi & { calls: typeof calls }
}

/** The body of the one path op a call carried. */
function opOf(call: { ops: unknown[] }): { op: string; path: string[]; value?: unknown } {
  return (call.ops as { op: string; path: string[]; value?: unknown }[])[0]!
}

describe('providerLongCacheOf', () => {
  it('reports an absent pin as inheritance, not as the adapter default', () => {
    // The resolved `value` materializes schema defaults; only the raw layers say
    // whether the USER pinned anything, which is what the switch displays.
    const namespace = view({ providers: { relay: { api: 'openai-completions', models: [{ id: 'm' }] } } })
    expect(providerLongCacheOf(namespace, 'relay')).toEqual({ api: 'openai-completions', offered: true, value: undefined })
  })

  it('reads a user-layer pin', () => {
    const namespace = view({ providers: { relay: { compat: { [LONG_CACHE_FIELD]: false } } } })
    expect(providerLongCacheOf(namespace, 'relay').value).toBe(false)
  })

  it('reads a base-layer pin the user layer does not override', () => {
    const namespace = view({ providers: {} }, { providers: { relay: { compat: { [LONG_CACHE_FIELD]: false } } } })
    expect(providerLongCacheOf(namespace, 'relay').value).toBe(false)
  })

  it('lets the user layer win over the base layer', () => {
    const namespace = view(
      { providers: { relay: { compat: { [LONG_CACHE_FIELD]: true } } } },
      { providers: { relay: { compat: { [LONG_CACHE_FIELD]: false } } } },
    )
    expect(providerLongCacheOf(namespace, 'relay').value).toBe(true)
  })

  it('reports the pin a LOWER layer carries on its own', () => {
    // Deleting the user layer's key cannot clear a pin the profile patch below
    // wrote, so the switch has to know about it before it "un-pins" anything.
    const namespace = view(
      { providers: { relay: {} } },
      { providers: { relay: { compat: { [LONG_CACHE_FIELD]: false } } } },
    )
    expect(providerLongCacheOf(namespace, 'relay').inherited).toBe(false)
  })

  it('reports no lower-layer pin when only the user layer states one', () => {
    const namespace = view({ providers: { relay: { compat: { [LONG_CACHE_FIELD]: false } } } }, { providers: {} })
    expect(providerLongCacheOf(namespace, 'relay').inherited).toBeUndefined()
  })

  it('does not mistake the base layer for the user one when the user omits the provider', () => {
    // A layer that omits the route names no pin; slot order must follow the
    // LAYERS, not whichever layers happened to declare a profile.
    const namespace = view({ providers: {} }, { providers: { relay: { compat: { [LONG_CACHE_FIELD]: false } } } })
    const read = providerLongCacheOf(namespace, 'relay')
    expect(read.value).toBe(false)
    expect(read.inherited).toBe(false)
  })

  it('reads the protocol from the raw layer even when only the base declares it', () => {
    const namespace = view({ providers: { relay: {} } }, { providers: { relay: { api: 'anthropic-messages' } } })
    expect(providerLongCacheOf(namespace, 'relay').api).toBe('anthropic-messages')
  })

  it('refuses the switch on a protocol whose compat gate does not offer it', () => {
    // mistral-conversations is a gate that omits the field: route-level compat
    // there is silently skipped, so offering the switch would be a lie.
    const namespace = view({ providers: { relay: { api: 'mistral-conversations' } } })
    expect(providerLongCacheOf(namespace, 'relay').offered).toBe(false)
  })

  it('offers the switch when the route declares no protocol at all', () => {
    // No `api` means the adapter resolves its default, which is openai-completions.
    const namespace = view({ providers: { relay: {} } })
    expect(providerLongCacheOf(namespace, 'relay').offered).toBe(true)
  })
})

describe('writeProviderLongCache', () => {
  const pinned = view({ providers: { relay: { api: 'openai-completions', compat: { supportsDeveloperRole: true } } } })

  it('writes the flag as a LEAF compat op, so sibling switches survive', async () => {
    const api = fakeApi(pinned)
    await expect(writeProviderLongCache(api, 'relay', false)).resolves.toEqual({ ok: true })
    expect(opOf(api.calls[0]!)).toEqual({
      op: 'set',
      path: ['providers', 'relay', 'compat', LONG_CACHE_FIELD],
      value: false,
    })
    expect(api.calls[0]!.revision).toBe(7)
  })

  it('restores inheritance with an unset of that one key', async () => {
    const api = fakeApi(pinned)
    await expect(writeProviderLongCache(api, 'relay', undefined)).resolves.toEqual({ ok: true })
    expect(opOf(api.calls[0]!)).toEqual({ op: 'unset', path: ['providers', 'relay', 'compat', LONG_CACHE_FIELD] })
  })

  it('refuses an empty route without touching the document', async () => {
    const api = fakeApi(pinned)
    await expect(writeProviderLongCache(api, '', false)).resolves.toEqual({ ok: false, error: 'no-route' })
    expect(api.calls).toHaveLength(0)
  })

  it('refuses a route the document no longer declares', async () => {
    const api = fakeApi(pinned)
    await expect(writeProviderLongCache(api, 'gone', false)).resolves.toEqual({ ok: false, error: 'no-route' })
    expect(api.calls).toHaveLength(0)
  })

  it('refuses a read-only document', async () => {
    const api = fakeApi(pinned, { writable: false })
    await expect(writeProviderLongCache(api, 'relay', false)).resolves.toEqual({ ok: false, error: 'read-only' })
    expect(api.calls).toHaveLength(0)
  })

  it('retries once on a stale revision, then reports the second answer', async () => {
    const api = fakeApi(pinned, {
      mutate: async (_ops, attempt) => (attempt === 0
        ? { ok: false, error: { code: 'settings/conflict', message: 'stale' } }
        : { ok: true, value: pinned }),
    })
    await expect(writeProviderLongCache(api, 'relay', false)).resolves.toEqual({ ok: true })
    expect(api.calls).toHaveLength(2)
  })

  it('surfaces the refusal message when the retry is refused too', async () => {
    const api = fakeApi(pinned, {
      mutate: async () => ({ ok: false, error: { code: 'settings/refused', message: 'nope' } }),
    })
    await expect(writeProviderLongCache(api, 'relay', false)).resolves.toEqual({ ok: false, error: 'nope' })
    expect(api.calls).toHaveLength(1)
  })
})

describe('LongCacheSection', () => {
  afterEach(() => { document.body.innerHTML = '' })

  /** Render the section and return the container plus the switch. */
  async function render(api: RemoteApi): Promise<{ container: HTMLElement; section: HTMLElement; unmount(): Promise<void> }> {
    const container = document.createElement('div')
    document.body.appendChild(container)
    const root = createRoot(container)
    await act(async () => {
      root.render(createElement(LongCacheSection, { route: 'relay', api, t }))
    })
    const section = container.querySelector('.bre-cache') as HTMLElement
    return {
      container,
      section,
      async unmount() {
        await act(async () => { root.unmount() })
      },
    }
  }

  const unsynced = view({ providers: { relay: { api: 'openai-completions', compat: {} } } })

  it('renders its own heading, separate from the header editor', async () => {
    const { section, unmount } = await render(fakeApi(unsynced))
    // A title row of its own is what tells a reader this is not one more header.
    const title = section.querySelector('.bre-headers-title-row .bre-effort-title')
    expect(title?.textContent).toBe(en.cacheTitle)
    // The row names the setting and the switch states it; the switch carries no
    // second label of its own beyond that name.
    const label = section.querySelector('.bre-cache-row .bre-cache-label')
    expect(label?.textContent).toBe(en.cacheRowLabel)
    const button = section.querySelector('[role="switch"]') as HTMLButtonElement
    expect(button.getAttribute('aria-label')).toBe(en.cacheRowLabel)
    await unmount()
  })

  it('reads its description under the row, not above it', async () => {
    const { section, unmount } = await render(fakeApi(unsynced))
    const row = section.querySelector('.bre-cache-row') as HTMLElement
    const hint = Array.from(section.querySelectorAll('.bre-effort-note'))
      .find((node) => node.textContent === en.cacheHint) as HTMLElement
    expect(hint).toBeDefined()
    // A positive node is FOLLOWING the row: the row is the setting, the line
    // under it is why anyone would move it.
    expect(row.compareDocumentPosition(hint) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    await unmount()
  })

  it('shows the switch on while the route just inherits', async () => {
    const { section, unmount } = await render(fakeApi(unsynced))
    // Inheriting means the adapter keeps long-lived caches, so it is the ON
    // position: the switch reads the setting its label names.
    const button = section.querySelector('[role="switch"]') as HTMLButtonElement
    expect(button.getAttribute('aria-checked')).toBe('true')
    expect(button.className).toContain('is-on')
    await unmount()
  })

  it('shows the switch off once the route states the value as false', async () => {
    const pinnedView = view({ providers: { relay: { api: 'openai-completions', compat: { [LONG_CACHE_FIELD]: false } } } })
    const { section, unmount } = await render(fakeApi(pinnedView))
    const button = section.querySelector('[role="switch"]') as HTMLButtonElement
    expect(button.getAttribute('aria-checked')).toBe('false')
    expect(button.className).not.toContain('is-on')
    await unmount()
  })

  it('writes the flag when switched off and confirms it', async () => {
    const api = fakeApi(unsynced)
    const { section, unmount } = await render(api)
    const button = section.querySelector('[role="switch"]') as HTMLButtonElement
    await act(async () => { button.click() })
    expect(opOf(api.calls[0]!)).toEqual({
      op: 'set',
      path: ['providers', 'relay', 'compat', LONG_CACHE_FIELD],
      value: false,
    })
    expect((section.querySelector('[role="switch"]') as HTMLButtonElement).getAttribute('aria-checked')).toBe('false')
    expect(section.textContent).toContain(en.cacheSaved)
    await unmount()
  })

  it('un-pins to inheritance when switched back on', async () => {
    const pinnedView = view({ providers: { relay: { api: 'openai-completions', compat: { [LONG_CACHE_FIELD]: false } } } })
    const api = fakeApi(pinnedView)
    const { section, unmount } = await render(api)
    await act(async () => { (section.querySelector('[role="switch"]') as HTMLButtonElement).click() })
    expect(opOf(api.calls[0]!)).toEqual({ op: 'unset', path: ['providers', 'relay', 'compat', LONG_CACHE_FIELD] })
    expect((section.querySelector('[role="switch"]') as HTMLButtonElement).getAttribute('aria-checked')).toBe('true')
    expect(section.textContent).toContain(en.cacheInherited)
    await unmount()
  })

  it('states an explicit true when a LOWER layer keeps the pin, instead of a useless unset', async () => {
    // BOTH layers state false: unsetting the user's copy would only expose the
    // one below it, so the switch moving back on has to override it — otherwise
    // it would snap straight back off.
    const pinnedView = view(
      { providers: { relay: { api: 'openai-completions', compat: { [LONG_CACHE_FIELD]: false } } } },
      { providers: { relay: { api: 'openai-completions', compat: { [LONG_CACHE_FIELD]: false } } } },
    )
    const api = fakeApi(pinnedView)
    const { section, unmount } = await render(api)
    await act(async () => { (section.querySelector('[role="switch"]') as HTMLButtonElement).click() })
    expect(opOf(api.calls[0]!)).toEqual({
      op: 'set',
      path: ['providers', 'relay', 'compat', LONG_CACHE_FIELD],
      value: true,
    })
    expect((section.querySelector('[role="switch"]') as HTMLButtonElement).getAttribute('aria-checked')).toBe('true')
    await unmount()
  })

  it('keeps the switch where it was when the write is refused, and says why', async () => {
    const api = fakeApi(unsynced, { writable: false })
    const { section, unmount } = await render(api)
    const button = section.querySelector('[role="switch"]') as HTMLButtonElement
    expect(button.disabled).toBe(true)
    await act(async () => { button.click() })
    expect(button.getAttribute('aria-checked')).toBe('true')
    expect(section.textContent).toContain(en.cacheReadOnly)
    await unmount()
  })

  it('says the protocol takes no such switch instead of offering one', async () => {
    const mistral = view({ providers: { relay: { api: 'mistral-conversations' } } })
    const { section, unmount } = await render(fakeApi(mistral))
    expect(section.querySelector('[role="switch"]')).toBeNull()
    expect(section.textContent).toContain('mistral-conversations')
    await unmount()
  })
})

describe('describeNamespace', () => {
  it('is what the section seeds from, so it must answer the writable flag', async () => {
    const api = fakeApi(view({ providers: {} }))
    const join = await describeNamespace(api)
    expect(join.writable).toBe(true)
    expect(join.namespace?.ns).toBe('llm-pi-ai')
  })
})

describe('the section heading against the stylesheet', () => {
  /** The declarations of the rule whose selector starts a line — anchored, so a
   * tab-prefixed override cannot answer for the base rule. */
  const ruleOf = (selector: string): string => {
    const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    const match = new RegExp('^' + escaped + ' \\{([^}]*)\\}', 'm').exec(STYLES)
    expect(match, 'the stylesheet declares ' + selector).not.toBeNull()
    return match === null ? '' : (match[1] ?? '')
  }
  const declaration = (body: string, property: string): string | undefined =>
    body
      .split('\n')
      .map((line) => line.trim())
      .find((line) => line.startsWith(property + ':'))

  it('paints the section title in the same colour as the headers title above it', () => {
    const head = ruleOf('.bre-headers-head .bre-effort-title')
    const section = ruleOf('.bre-headers-title-row .bre-effort-title')
    // The headers title takes the label system's primary colour; the section
    // title must take the SAME one. The base .bre-effort-title is the muted
    // secondary, so a section heading that declares nothing reads as a
    // sub-label of the heading above it rather than a section beside it.
    expect(declaration(head, 'color')).toBe('color: var(--dsw-alias-label-primary, #0f1115);')
    expect(declaration(section, 'color')).toBe(declaration(head, 'color'))
  })

  it('divides the pane above the section title, and leaves the commit row bare', () => {
    const titleRow = ruleOf('.bre-headers-title-row')
    // Above the title it separates 请求头 from 长缓存保留; below it would read as
    // an underline of a title that has a whole section under it.
    expect(declaration(titleRow, 'border-top')).toBe('border-top: 1px solid var(--dsw-alias-border-l2, #0000001a);')
    expect(declaration(titleRow, 'border-bottom')).toBeUndefined()
    // The last section already carries the divider, so the commit row below it
    // gets room instead of a second line.
    const actions = ruleOf('.bre-headers-actions')
    expect(declaration(actions, 'border-top')).toBeUndefined()
    expect(declaration(actions, 'padding-top')).toBe('padding-top: 12px;')
  })
})
