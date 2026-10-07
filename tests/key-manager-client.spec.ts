/**
 * The browser half's transport to the host's key manager.
 *
 * Two things are worth pinning here and nothing else. First, the wire: which
 * method, which URL, which body — the host route is the only writer of both the
 * credential store and the provider profile, so a wrong payload is a wrong
 * write. Second, the failure contract: every refusal is `{ ok: false }` and the
 * host's own wording is passed through untouched, because the panel shows that
 * sentence verbatim and a made-up message would hide what actually went wrong.
 */

// @vitest-environment node
import { afterEach, expect, describe, it, vi } from 'vitest'
import { KEY_INDEX_PATH, PROVIDER_KEY_PATH } from '../src/constants.js'
import { httpKeyManagerClient } from '../src/client/key-manager-client.js'

interface Call {
  readonly url: string
  readonly init: RequestInit | undefined
}

let calls: Call[] = []

/** One stub answer: a status, a decoded body, and a note of what was asked. */
function stubFetch(answer: { status?: number; body?: unknown; throws?: boolean; raw?: string }): void {
  calls = []
  vi.stubGlobal('fetch', async (url: unknown, init?: RequestInit) => {
    calls.push({ url: String(url), init })
    if (answer.throws === true) throw new Error('network down')
    return {
      ok: (answer.status ?? 200) >= 200 && (answer.status ?? 200) < 300,
      status: answer.status ?? 200,
      json: async () => {
        if (answer.raw !== undefined) return JSON.parse(answer.raw) as unknown
        if (answer.body === undefined) throw new Error('no body')
        return answer.body
      },
    } as unknown as Response
  })
}

function optionsOf(index = 0): RequestInit {
  return calls[index]?.init ?? {}
}

function headersOf(index = 0): Record<string, string> {
  return (optionsOf(index)['headers'] ?? {}) as Record<string, string>
}

function bodyOf(index = 0): unknown {
  const raw = optionsOf(index)['body']
  return typeof raw === 'string' ? (JSON.parse(raw) as unknown) : undefined
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('list', () => {
  it('GETs the route with no caching and same-origin credentials', async () => {
    stubFetch({ body: { ok: true, route: 'ofox', enabledRef: null, entries: [] } })
    const answer = await httpKeyManagerClient.list('ofox')

    expect(calls).toHaveLength(1)
    expect(calls[0]?.url).toBe(`${KEY_INDEX_PATH}?route=ofox`)
    expect(optionsOf()).toMatchObject({ method: 'GET', cache: 'no-store', credentials: 'same-origin' })
    expect(optionsOf()['body']).toBeUndefined()
    expect(answer).toEqual({ ok: true, route: 'ofox', enabledRef: null, entries: [] })
  })

  it('escapes the route it interpolates', async () => {
    stubFetch({ body: { ok: true, route: 'a b', enabledRef: null, entries: [] } })
    await httpKeyManagerClient.list('a b')
    expect(calls[0]?.url).toBe(`${KEY_INDEX_PATH}?route=a%20b`)
  })

  it('normalises rows: a label must be a string, an unknown badge is null', async () => {
    stubFetch({
      body: {
        ok: true,
        route: 'ofox',
        enabledRef: 'A',
        entries: [
          { ref: 'A', alias: 'main', enabled: true, configured: true },
          { ref: 'B', alias: '', enabled: false, configured: false },
          { ref: 'C', enabled: false, configured: 'yes' },
          { alias: 'no ref' },
          'nonsense',
        ],
      },
    })

    expect(await httpKeyManagerClient.list('ofox')).toEqual({
      ok: true,
      route: 'ofox',
      enabledRef: 'A',
      entries: [
        { ref: 'A', alias: 'main', enabled: true, configured: true },
        { ref: 'B', enabled: false, configured: false },
        { ref: 'C', enabled: false, configured: null },
      ],
    })
  })

  it('keeps a masked preview only when the host sent a non-empty string', async () => {
    stubFetch({
      body: {
        ok: true,
        route: 'ofox',
        enabledRef: 'A',
        entries: [
          { ref: 'A', enabled: true, configured: true, masked: 'sk-a...wxyz' },
          { ref: 'B', enabled: false, configured: true, masked: '' },
          { ref: 'C', enabled: false, configured: true, masked: 42 },
          { ref: 'D', enabled: false, configured: true },
        ],
      },
    })

    expect(await httpKeyManagerClient.list('ofox')).toEqual({
      ok: true,
      route: 'ofox',
      enabledRef: 'A',
      entries: [
        { ref: 'A', enabled: true, configured: true, masked: 'sk-a...wxyz' },
        { ref: 'B', enabled: false, configured: true },
        { ref: 'C', enabled: false, configured: true },
        { ref: 'D', enabled: false, configured: true },
      ],
    })
  })

  it('reports no enabled reference when the host says null, empty or nothing', async () => {
    for (const enabledRef of [null, '', undefined, 7]) {
      stubFetch({ body: { ok: true, route: 'ofox', enabledRef, entries: [] } })
      const answer = await httpKeyManagerClient.list('ofox')
      expect(answer).toEqual({ ok: true, route: 'ofox', enabledRef: null, entries: [] })
    }
  })
})

describe('mutations', () => {
  it('POSTs an add with the value and an optional label', async () => {
    stubFetch({ body: { ok: true, route: 'ofox', enabledRef: null, entries: [] } })
    await httpKeyManagerClient.add('ofox', 'sk-abc', 'main')

    expect(calls[0]?.url).toBe(`${KEY_INDEX_PATH}?route=ofox`)
    expect(optionsOf()).toMatchObject({ method: 'POST', cache: 'no-store', credentials: 'same-origin' })
    expect(headersOf()['content-type']).toBe('application/json')
    expect(bodyOf()).toEqual({ op: 'add', value: 'sk-abc', alias: 'main' })
  })

  it('leaves the label out entirely when there is none', async () => {
    stubFetch({ body: { ok: true, route: 'ofox', enabledRef: null, entries: [] } })
    await httpKeyManagerClient.add('ofox', 'sk-abc', undefined)
    expect(bodyOf()).toEqual({ op: 'add', value: 'sk-abc' })
    expect(bodyOf()).not.toHaveProperty('alias')
  })

  it('POSTs enable, rename and remove with their own fields', async () => {
    stubFetch({ body: { ok: true, route: 'ofox', enabledRef: 'A', entries: [] } })
    await httpKeyManagerClient.enable('ofox', 'A')
    expect(bodyOf()).toEqual({ op: 'enable', ref: 'A' })

    stubFetch({ body: { ok: true, route: 'ofox', enabledRef: null, entries: [] } })
    await httpKeyManagerClient.rename('ofox', 'A', 'primary')
    expect(bodyOf()).toEqual({ op: 'rename', ref: 'A', alias: 'primary' })

    stubFetch({ body: { ok: true, route: 'ofox', enabledRef: null, entries: [] } })
    await httpKeyManagerClient.rename('ofox', 'A', undefined)
    expect(bodyOf()).toEqual({ op: 'rename', ref: 'A' })

    stubFetch({ body: { ok: true, route: 'ofox', enabledRef: null, entries: [] } })
    await httpKeyManagerClient.remove('ofox', 'A')
    expect(bodyOf()).toEqual({ op: 'remove', ref: 'A' })
  })
})

describe('replace', () => {
  it('POSTs the new secret and the reference it belongs to', async () => {
    stubFetch({ body: { ok: true, route: 'ofox', enabledRef: 'key-2', entries: [] } })
    const answer = await httpKeyManagerClient.replace('ofox', 'key-2', 'sk-live-secret')

    expect(calls[0]?.url).toBe(`${KEY_INDEX_PATH}?route=ofox`)
    expect(optionsOf()).toMatchObject({ method: 'POST', cache: 'no-store', credentials: 'same-origin' })
    expect(headersOf()['content-type']).toBe('application/json')
    expect(bodyOf()).toEqual({ op: 'value', ref: 'key-2', value: 'sk-live-secret' })
    expect(answer).toEqual({ ok: true, route: 'ofox', enabledRef: 'key-2', entries: [] })
  })

  it('passes the host’s refusal through untouched', async () => {
    stubFetch({ status: 400, body: { ok: false, error: 'that key is not listed for this provider' } })
    expect(await httpKeyManagerClient.replace('ofox', 'key-2', 'sk-live-secret')).toEqual({
      ok: false,
      error: 'that key is not listed for this provider',
    })
  })
})

describe('refusals', () => {
  it('passes the host’s own wording through, body first and status irrelevant', async () => {
    stubFetch({ status: 400, body: { ok: false, error: 'that key is not listed for this provider' } })
    expect(await httpKeyManagerClient.enable('ofox', 'GHOST')).toEqual({
      ok: false,
      error: 'that key is not listed for this provider',
    })
  })

  it('accepts a message field as well, and answers without copy when there is none', async () => {
    stubFetch({ status: 500, body: { message: 'boom' } })
    expect(await httpKeyManagerClient.list('ofox')).toEqual({ ok: false, error: 'boom' })

    stubFetch({ status: 500, body: {} })
    expect(await httpKeyManagerClient.list('ofox')).toEqual({ ok: false })

    stubFetch({ status: 403, raw: 'not json' })
    expect(await httpKeyManagerClient.list('ofox')).toEqual({ ok: false })
  })

  it('refuses to read a success payload that has no list in it', async () => {
    stubFetch({ body: { ok: true, route: 'ofox' } })
    expect(await httpKeyManagerClient.list('ofox')).toEqual({ ok: false })

    stubFetch({ body: { ok: true, route: 'ofox', entries: {} } })
    expect(await httpKeyManagerClient.list('ofox')).toEqual({ ok: false })
  })

  it('answers a thrown fetch the same way, without inventing a reason', async () => {
    stubFetch({ throws: true })
    expect(await httpKeyManagerClient.list('ofox')).toEqual({ ok: false })
    expect(await httpKeyManagerClient.add('ofox', 'sk-abc', undefined)).toEqual({ ok: false })
  })
})

describe('reveal', () => {
  it('asks the reveal route for exactly that reference and returns the key', async () => {
    stubFetch({ body: { ok: true, key: 'sk-abc' } })
    expect(await httpKeyManagerClient.reveal('ofox', 'A')).toBe('sk-abc')
    expect(calls[0]?.url).toBe(`${PROVIDER_KEY_PATH}?route=ofox&ref=A`)
    expect(optionsOf()).toMatchObject({ method: 'GET', cache: 'no-store', credentials: 'same-origin' })
  })

  it('answers undefined for every shape that is not one key', async () => {
    const cases: Array<{ status?: number; body?: unknown; raw?: string; throws?: boolean }> = [
      { body: { ok: true, key: '' } },
      { body: { ok: true, key: 42 } },
      { body: { ok: true } },
      { body: { key: 'sk-abc' } },
      { status: 404, body: { ok: false, error: 'no credential is configured for A' } },
      { status: 403, body: { ok: true, key: 'sk-abc' } },
      { raw: 'not json' },
      { throws: true },
    ]
    for (const answer of cases) {
      stubFetch(answer)
      expect(await httpKeyManagerClient.reveal('ofox', 'A')).toBeUndefined()
    }
  })

  it('escapes both the route and the reference', async () => {
    stubFetch({ body: { ok: true, key: 'k' } })
    await httpKeyManagerClient.reveal('a b', 'A B')
    expect(calls[0]?.url).toBe(`${PROVIDER_KEY_PATH}?route=a%20b&ref=A%20B`)
  })
})
