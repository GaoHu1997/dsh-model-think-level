/**
 * Request-header overlay tests: the pure origin index (issue #12) and the
 * fetch-layer installer.
 *
 * The fetch tests drive a STUB global fetch, so what they assert is exactly the
 * contract the real seam has to keep: an unconfigured origin passes through
 * with its arguments untouched, a configured one gets every indexed header
 * merged over the caller's own headers, and the global is restored (and only
 * then) once the last activation goes away.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  buildUserAgentIndex,
  declaredUserAgent,
  emptyIndex,
  headersOf,
  isSendableUserAgent,
  modelOfJsonBody,
  originOf,
  requestUrlOf,
} from '../src/headers-core.js'
import { adapterSourcePatched } from '../src/headers-conflict.js'
import { headerOverlayInstalled, installHeaderOverlay, type OverlaySource } from '../src/headers-fetch.js'

describe('originOf', () => {
  it('reads the scheme, host and port and drops the path', () => {
    expect(originOf('https://relay.example.com/v1/messages')).toBe('https://relay.example.com')
    expect(originOf('http://127.0.0.1:8791/v1')).toBe('http://127.0.0.1:8791')
  })

  it('keeps two loopback ports apart', () => {
    expect(originOf('http://127.0.0.1:8791/x')).not.toBe(originOf('http://127.0.0.1:8792/x'))
  })

  it('refuses what is not an absolute URL', () => {
    expect(originOf('/v1/messages')).toBeUndefined()
    expect(originOf('not a url')).toBeUndefined()
    expect(originOf('')).toBeUndefined()
    expect(originOf(undefined)).toBeUndefined()
  })
})

describe('isSendableUserAgent', () => {
  it('accepts a conventional client identity', () => {
    expect(isSendableUserAgent('claude-cli/2.1.161 (external, cli)')).toBe(true)
  })

  it('refuses an empty value and header-injection shapes', () => {
    expect(isSendableUserAgent('')).toBe(false)
    expect(isSendableUserAgent('a\r\nx-injected: 1')).toBe(false)
    expect(isSendableUserAgent('a\nb')).toBe(false)
    expect(isSendableUserAgent('a\0b')).toBe(false)
  })

  it('refuses an unreasonable length', () => {
    expect(isSendableUserAgent('u'.repeat(513))).toBe(false)
    expect(isSendableUserAgent('u'.repeat(512))).toBe(true)
  })
})

describe('declaredUserAgent', () => {
  it('reads the value case-insensitively', () => {
    expect(declaredUserAgent({ headers: { 'User-Agent': 'kilo/1.0' } })).toBe('kilo/1.0')
    expect(declaredUserAgent({ headers: { 'user-agent': 'kilo/1.0' } })).toBe('kilo/1.0')
  })

  it('ignores a route that declares none, or an unsendable one', () => {
    expect(declaredUserAgent({ headers: { 'x-company': 'acme' } })).toBeUndefined()
    expect(declaredUserAgent({})).toBeUndefined()
    expect(declaredUserAgent(undefined)).toBeUndefined()
    expect(declaredUserAgent({ headers: { 'user-agent': 'a\r\nb' } })).toBeUndefined()
    expect(declaredUserAgent({ headers: { 'user-agent': 42 } })).toBeUndefined()
  })
})

describe('headersOf', () => {
  it('keeps string entries only and reports an empty dict as absent', () => {
    expect(headersOf({ headers: { a: '1', b: 2 } })).toEqual({ a: '1' })
    expect(headersOf({ headers: {} })).toBeUndefined()
    expect(headersOf({ headers: ['a', 'b'] })).toBeUndefined()
    expect(headersOf({})).toBeUndefined()
  })
})

describe('buildUserAgentIndex', () => {
  it('indexes a route by the origin of its endpoint', () => {
    const index = buildUserAgentIndex({
      agentrouter: {
        baseURL: 'https://relay.example.com/api',
        headers: { 'user-agent': 'claude-cli/2.1.161 (external, cli)', 'x-company': 'acme' },
      },
    })
    expect([...index.byOrigin.keys()]).toEqual(['https://relay.example.com'])
    expect(index.byOrigin.get('https://relay.example.com')).toMatchObject({
      route: 'agentrouter',
      userAgent: 'claude-cli/2.1.161 (external, cli)',
    })
    expect(index.conflicts).toEqual([])
  })

  it('indexes a route with any sendable header, even without User-Agent', () => {
    const index = buildUserAgentIndex({
      noEndpoint: { headers: { 'user-agent': 'x' } },
      arbitrary: { baseURL: 'https://a.example.com', headers: { 'x-y': '1' } },
      badEndpoint: { baseURL: 'not a url', headers: { 'user-agent': 'x' } },
    })
    expect(index.byOrigin.size).toBe(1)
    expect(index.byOrigin.get('https://a.example.com')).toMatchObject({
      route: 'arbitrary',
      headers: { 'x-y': '1' },
    })
    expect(index.byOrigin.get('https://a.example.com')?.userAgent).toBeUndefined()
    expect(index.conflicts).toEqual([])
  })

  it('accepts two routes agreeing on one identity', () => {
    const index = buildUserAgentIndex({
      a: { baseURL: 'https://shared.example.com', headers: { 'user-agent': 'same/1' } },
      b: { baseURL: 'https://shared.example.com/v1', headers: { 'user-agent': 'same/1' } },
    })
    expect(index.byOrigin.size).toBe(1)
    expect(index.conflicts).toEqual([])
  })

  it('reports a genuine disagreement instead of picking silently', () => {
    const index = buildUserAgentIndex({
      a: { baseURL: 'https://shared.example.com', headers: { 'user-agent': 'first/1' } },
      b: { baseURL: 'https://shared.example.com', headers: { 'user-agent': 'second/2' } },
    })
    // First declaration still serves (the seam has to send something)...
    expect(index.byOrigin.get('https://shared.example.com')?.userAgent).toBe('first/1')
    // ...and the disagreement is reported rather than hidden.
    expect(index.conflicts).toHaveLength(1)
    expect(index.conflicts[0]).toMatchObject({
      origin: 'https://shared.example.com',
      routes: ['a', 'b'],
      values: ['first/1', 'second/2'],
    })
  })

  it('reports one conflict per origin, not one per later claimant', () => {
    const index = buildUserAgentIndex({
      a: { baseURL: 'https://shared.example.com', headers: { 'user-agent': 'first' } },
      b: { baseURL: 'https://shared.example.com', headers: { 'user-agent': 'second' } },
      c: { baseURL: 'https://shared.example.com', headers: { 'user-agent': 'third' } },
    })
    expect(index.conflicts).toHaveLength(1)
    expect(index.conflicts[0]?.routes).toEqual(['a', 'b', 'c'])
  })
})

describe('requestUrlOf', () => {
  it('reads a string, a URL, and a Request', () => {
    expect(requestUrlOf('https://a.example.com/v1')).toBe('https://a.example.com/v1')
    expect(requestUrlOf(new URL('https://a.example.com/v1'))).toBe('https://a.example.com/v1')
    expect(requestUrlOf(new Request('https://a.example.com/v1'))).toBe('https://a.example.com/v1')
  })

  it('refuses an unclassifiable input', () => {
    expect(requestUrlOf(42)).toBeUndefined()
    expect(requestUrlOf({ url: 'https://a.example.com' })).toBeUndefined()
  })
})

describe('adapterSourcePatched', () => {
  it('recognizes the stock function as unpatched', () => {
    const stock = [
      'function requestHeaders(headers) {',
      'const attribution = attributionHeaders();',
      'const reserved = new Set(Object.keys(attribution).map((name) => name.toLowerCase()));',
      'return { ...Object.fromEntries(Object.entries(headers ?? {}).filter(([name]) => !reserved.has(name.toLowerCase()))), ...attribution };',
      '}',
    ].join('\n')
    expect(adapterSourcePatched(stock)).toBe(false)
  })

  it('recognizes the published patch', () => {
    expect(adapterSourcePatched('const configuredUserAgent = entries.find(...)')).toBe(true)
  })
})

describe('installHeaderOverlay', () => {
  const original = globalThis.fetch
  let calls: { input: unknown; init: RequestInit | undefined }[]
  /** Every handle this test installed, disposed in afterEach no matter what. */
  let handles: { dispose(): void }[]

  /** Install a stub fetch that records what reached it. */
  function stubFetch(): void {
    calls = []
    globalThis.fetch = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      calls.push({ input, init })
      return Promise.resolve(new Response('{}', { status: 200 }))
    }) as unknown as typeof globalThis.fetch
  }

  /** Install an overlay that this suite guarantees to tear down. */
  function install(source: OverlaySource) {
    const handle = installHeaderOverlay(source)
    handles.push(handle)
    return handle
  }

  beforeEach(() => {
    handles = []
    stubFetch()
  })

  afterEach(() => {
    // Unconditional: a failing assertion must not leave a wrapper owning the
    // global for every later test in the run.
    for (const handle of handles) handle.dispose()
    globalThis.fetch = original
  })

  it('passes an unconfigured origin through with its arguments untouched', async () => {
    install({ current: emptyIndex() })
    const init: RequestInit = { method: 'POST', headers: { 'x-keep': '1' } }
    await globalThis.fetch('https://other.example.com/v1', init)
    expect(calls[0]?.input).toBe('https://other.example.com/v1')
    // Same init object identity: a non-matching request is not even copied.
    expect(calls[0]?.init).toBe(init)
  })

  it('injects every indexed header and preserves unrelated caller headers', async () => {
    install({
      current: buildUserAgentIndex({
        agentrouter: {
          baseURL: 'https://relay.example.com',
          headers: {
            'user-agent': 'claude-cli/2.1.161 (external, cli)',
            'x-company': 'configured',
            'x-route-key': 'route-a',
          },
        },
      }),
    })
    await globalThis.fetch('https://relay.example.com/v1/messages', {
      method: 'POST',
      headers: {
        'user-agent': 'deepseek-harness/0.1.7 (+https://github.com/deepseek-ai/deepseek-harness)',
        'x-company': 'caller-value',
        'x-keep': 'acme',
      },
    })
    const headers = new Headers(calls[0]?.init?.headers)
    expect(headers.get('user-agent')).toBe('claude-cli/2.1.161 (external, cli)')
    expect(headers.get('x-company')).toBe('configured')
    expect(headers.get('x-route-key')).toBe('route-a')
    expect(headers.get('x-keep')).toBe('acme')
    expect(calls[0]?.init?.method).toBe('POST')
  })

  it('matches the exact origin, never a prefix of another host', async () => {
    install({
      current: buildUserAgentIndex({
        a: { baseURL: 'https://relay.example.com', headers: { 'user-agent': 'claude-cli/2.1.161' } },
      }),
    })
    const init: RequestInit = { headers: {} }
    await globalThis.fetch('https://relay.example.com.evil.test/v1', init)
    expect(calls[0]?.init).toBe(init)
  })

  it('seeds a Request own headers when the init names none, and lets the init win otherwise', async () => {
    install({
      current: buildUserAgentIndex({
        a: { baseURL: 'https://relay.example.com', headers: { 'user-agent': 'spoofed/1' } },
      }),
    })
    await globalThis.fetch(new Request('https://relay.example.com/v1', { headers: { 'x-own': 'kept' } }))
    expect(new Headers(calls[0]?.init?.headers).get('x-own')).toBe('kept')
    expect(calls[0]?.input).toBeInstanceOf(Request)
    expect((calls[0]?.input as Request).headers.get('user-agent')).toBe('spoofed/1')

    await globalThis.fetch(new Request('https://relay.example.com/v1', { headers: { 'x-request': 'dropped' } }), {
      headers: { 'x-init': 'wins' },
    })
    const merged = new Headers(calls[1]?.init?.headers)
    expect(merged.get('x-init')).toBe('wins')
    // Native semantics: an explicit init.headers replaces the Request's own.
    expect(merged.get('x-request')).toBeNull()
  })

  it('follows a live index swap without reinstalling', async () => {
    const source: OverlaySource = { current: emptyIndex() }
    install(source)
    await globalThis.fetch('https://relay.example.com/v1', { headers: {} })
    expect(new Headers(calls[0]?.init?.headers).get('user-agent')).toBeNull()

    source.current = buildUserAgentIndex({
      a: { baseURL: 'https://relay.example.com', headers: { 'user-agent': 'spoofed/2' } },
    })
    await globalThis.fetch('https://relay.example.com/v1', { headers: {} })
    expect(new Headers(calls[1]?.init?.headers).get('user-agent')).toBe('spoofed/2')

    // Emptying the index is how `uaOverride: false` stands down: the wrapper
    // stays installed and simply stops matching.
    source.current = emptyIndex()
    const init: RequestInit = { headers: {} }
    await globalThis.fetch('https://relay.example.com/v1', init)
    expect(calls[2]?.init).toBe(init)
  })

  it('installs one wrapper for every activation and restores the original last', () => {
    const base = globalThis.fetch
    const first = install({ current: emptyIndex() })
    const wrapper = globalThis.fetch
    const second = install({ current: emptyIndex() })
    expect(globalThis.fetch).toBe(wrapper)

    second.dispose()
    // Still wrapped: the first activation is alive.
    expect(globalThis.fetch).toBe(wrapper)
    expect(first.active).toBe(true)

    first.dispose()
    expect(globalThis.fetch).toBe(base)
    expect(headerOverlayInstalled()).toBe(false)
  })

  it('makes dispose idempotent', () => {
    const base = globalThis.fetch
    const handle = install({ current: emptyIndex() })
    handle.dispose()
    handle.dispose()
    expect(globalThis.fetch).toBe(base)
    expect(handle.active).toBe(false)
  })

  it('does not clobber a wrapper installed after it when restoring', () => {
    const handle = install({ current: emptyIndex() })
    // Someone else replaces the global while we are active.
    const later = vi.fn(() => Promise.resolve(new Response('{}'))) as unknown as typeof globalThis.fetch
    globalThis.fetch = later
    handle.dispose()
    // Our teardown must leave their wrapper alone.
    expect(globalThis.fetch).toBe(later)
  })

  it('lets the first activation serve when several register the same origin', async () => {
    install({
      current: buildUserAgentIndex({
        a: { baseURL: 'https://relay.example.com', headers: { 'user-agent': 'first/1' } },
      }),
    })
    install({
      current: buildUserAgentIndex({
        b: { baseURL: 'https://relay.example.com', headers: { 'user-agent': 'second/2' } },
      }),
    })
    await globalThis.fetch('https://relay.example.com/v1', { headers: {} })
    expect(new Headers(calls[0]?.init?.headers).get('user-agent')).toBe('first/1')
  })
})

describe('per-route request headers on a shared origin', () => {
  const original = globalThis.fetch
  let calls: { input: unknown; init: RequestInit | undefined }[]
  let handles: { dispose(): void }[]

  function stubFetch(): void {
    calls = []
    globalThis.fetch = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      calls.push({ input, init })
      return Promise.resolve(new Response('{}', { status: 200 }))
    }) as unknown as typeof globalThis.fetch
  }

  function install(source: OverlaySource) {
    const handle = installHeaderOverlay(source)
    handles.push(handle)
    return handle
  }

  /** Two routes on ONE origin/path, separated only by the models they serve. */
  function sharedProviders() {
    return buildUserAgentIndex({
      alpha: {
        api: 'openai-completions',
        baseURL: 'https://relay.example.com/v1',
        models: [{ id: 'alpha-large' }],
        headers: { 'user-agent': 'alpha/1.0', 'x-tenant': 'alpha' },
      },
      beta: {
        api: 'openai-completions',
        baseURL: 'https://relay.example.com/v1',
        models: [{ id: 'beta-mini' }],
        headers: { 'user-agent': 'beta/2.0', 'x-tenant': 'beta' },
      },
    })
  }

  beforeEach(() => {
    handles = []
    stubFetch()
  })

  afterEach(() => {
    for (const handle of handles) handle.dispose()
    globalThis.fetch = original
  })

  it('indexes every route, keeping its path and model ids', () => {
    const index = sharedProviders()
    expect(index.overrides).toHaveLength(2)
    expect(index.overrides.map(entry => entry.route)).toEqual(['alpha', 'beta'])
    expect(index.overrides[0]).toMatchObject({
      origin: 'https://relay.example.com',
      pathPrefix: '/v1',
      modelIds: ['alpha-large'],
    })
  })

  it('picks the route whose body model matches, not the first declarer', async () => {
    install({ current: sharedProviders() })
    await globalThis.fetch('https://relay.example.com/v1/chat/completions', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ model: 'beta-mini', messages: [] }),
    })
    const headers = new Headers(calls[0]?.init?.headers)
    expect(headers.get('user-agent')).toBe('beta/2.0')
    expect(headers.get('x-tenant')).toBe('beta')
  })

  it('reads the model from a Request body without consuming it', async () => {
    install({ current: sharedProviders() })
    const request = new Request('https://relay.example.com/v1/chat/completions', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ model: 'alpha-large' }),
    })
    await globalThis.fetch(request)
    expect(new Headers(calls[0]?.init?.headers).get('user-agent')).toBe('alpha/1.0')
    // The clone-fenced body survived: the sent Request still carries it.
    expect(calls[0]?.input).toBeInstanceOf(Request)
    expect(await (calls[0]?.input as Request).clone().text()).toContain('alpha-large')
  })

  it('separates same-origin routes by their baseURL path before reading any body', async () => {
    install({
      current: buildUserAgentIndex({
        a: {
          baseURL: 'https://relay.example.com/a',
          models: [{ id: 'a-model' }],
          headers: { 'user-agent': 'a/1.0' },
        },
        b: {
          baseURL: 'https://relay.example.com/b',
          models: [{ id: 'b-model' }],
          headers: { 'user-agent': 'b/1.0' },
        },
      }),
    })
    // No body at all: the path alone is enough.
    await globalThis.fetch('https://relay.example.com/b/chat/completions', { method: 'POST', headers: {} })
    expect(new Headers(calls[0]?.init?.headers).get('user-agent')).toBe('b/1.0')
    expect(calls[0]?.init?.body).toBeUndefined()
  })

  it('counts modelOverrides keys as route identity', () => {
    const index = buildUserAgentIndex({
      a: { baseURL: 'https://relay.example.com/v1', headers: { 'user-agent': 'a/1' } },
      b: {
        baseURL: 'https://relay.example.com/v1',
        modelOverrides: { 'only-via-override': { input: ['text'] } },
        headers: { 'user-agent': 'b/1' },
      },
    })
    expect(index.overrides.find(entry => entry.route === 'b')?.modelIds).toEqual(['only-via-override'])
  })

  it('falls back to the first declarer when no body model identifies a route', async () => {
    install({ current: sharedProviders() })
    await globalThis.fetch('https://relay.example.com/v1/chat/completions', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ model: 'unknown-model' }),
    })
    expect(new Headers(calls[0]?.init?.headers).get('user-agent')).toBe('alpha/1.0')
  })

  it('leaves a request with no matching route origin untouched', async () => {
    install({ current: sharedProviders() })
    const init: RequestInit = { method: 'POST', headers: {} }
    await globalThis.fetch('https://elsewhere.example.com/v1/chat/completions', init)
    expect(calls[0]?.init).toBe(init)
  })

  it('sends nothing for a route that declares no headers instead of a sibling route\'s', async () => {
    install({
      current: buildUserAgentIndex({
        bare: {
          api: 'openai-completions',
          baseURL: 'https://relay.example.com/v1',
          models: [{ id: 'bare-model' }],
        },
        configured: {
          api: 'openai-completions',
          baseURL: 'https://relay.example.com/v1',
          models: [{ id: 'configured-model' }],
          headers: { 'user-agent': 'configured/1.0' },
        },
      }),
    })
    // The bare route claims its own model: the sibling's UA must not leak in.
    await globalThis.fetch('https://relay.example.com/v1/chat/completions', {
      method: 'POST',
      headers: { 'x-keep': '1' },
      body: JSON.stringify({ model: 'bare-model' }),
    })
    const bareHeaders = new Headers(calls[0]?.init?.headers)
    expect(bareHeaders.get('user-agent')).toBeNull()
    expect(bareHeaders.get('x-keep')).toBe('1')

    await globalThis.fetch('https://relay.example.com/v1/chat/completions', {
      method: 'POST',
      headers: {},
      body: JSON.stringify({ model: 'configured-model' }),
    })
    expect(new Headers(calls[1]?.init?.headers).get('user-agent')).toBe('configured/1.0')
  })
})

describe('modelOfJsonBody', () => {
  it('reads a string model from a JSON object body', () => {
    expect(modelOfJsonBody(JSON.stringify({ model: 'gpt-5.6' }))).toBe('gpt-5.6')
    expect(modelOfJsonBody(JSON.stringify({ messages: [] }))).toBeUndefined()
    expect(modelOfJsonBody(JSON.stringify({ model: 42 }))).toBeUndefined()
    expect(modelOfJsonBody(JSON.stringify(['model']))).toBeUndefined()
  })

  it('refuses a body that is not JSON', () => {
    expect(modelOfJsonBody('model=gpt-5.6')).toBeUndefined()
    expect(modelOfJsonBody('')).toBeUndefined()
  })
})
