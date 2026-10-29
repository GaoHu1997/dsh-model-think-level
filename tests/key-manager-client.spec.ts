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

describe('the row status payload', () => {
  it('carries a key cooldown through to the row, and drops a malformed one', async () => {
    stubFetch({
      body: {
        ok: true,
        route: 'ofox',
        entries: [
          { ref: 'K1', enabled: true, configured: true, masked: 'sk-1', rest: { remainingMs: 42000, failures: 2 } },
          { ref: 'K2', enabled: true, configured: true, masked: 'sk-2', rest: { remainingMs: -5, failures: 1 } },
          { ref: 'K3', enabled: true, configured: true, masked: 'sk-3', rest: { remainingMs: 'soon' } },
        ],
        endpoints: { openai: null, anthropic: null },
      },
    })
    const answer = await httpKeyManagerClient.list('ofox')
    expect(answer.ok).toBe(true)
    if (!answer.ok) return
    expect(answer.entries[0]?.rest).toEqual({ remainingMs: 42000, failures: 2 })
    // A negative remaining time is not a state the panel can paint.
    expect(answer.entries[1]?.rest).toBeUndefined()
    // A non-numeric remaining time is the host telling nothing, not cooling.
    expect(answer.entries[2]?.rest).toBeUndefined()
  })

  it('carries the probe mark and the route probe flag through to the panel', async () => {
    stubFetch({
      body: {
        ok: true,
        route: 'ofox',
        probing: true,
        entries: [
          { ref: 'K1', enabled: true, configured: true, masked: 'sk-1', models: ['m-a'], auto: true },
        ],
        endpoints: { openai: null, anthropic: null },
      },
    })
    const answer = await httpKeyManagerClient.list('ofox')
    expect(answer.ok).toBe(true)
    if (!answer.ok) return
    expect(answer.probing).toBe(true)
    expect(answer.entries[0]?.models).toEqual(['m-a'])
    expect(answer.entries[0]?.auto).toBe(true)
  })
})

describe('list cache', () => {
  it('returns a masked cached list immediately', async () => {
    let finish!: (response: Response) => void
    vi.stubGlobal('fetch', async () => await new Promise<Response>(resolve => { finish = resolve }))
    const pending = httpKeyManagerClient.list('cache-route')
    finish({
      ok: true,
      json: async () => ({ ok: true, route: 'cache-route', entries: [
        { ref: 'A', configured: true, masked: 'sk-a...z9' },
      ] }),
    } as unknown as Response)
    await pending
    const cached = httpKeyManagerClient.cached?.('cache-route')
    expect(cached?.entries[0]?.masked).toBe('sk-a...z9')
    expect(JSON.stringify(cached)).not.toContain('sk-live-secret')
  })

  it('keeps answering from the cache however old it is', async () => {
    // The panel paints the cached list and revalidates behind it, so age must
    // never take the answer away: an expansion that lands past the old 60s
    // gate used to stare at the loading line for as long as the fresh read
    // took, with a perfectly good list sitting right there.
    stubFetch({
      body: { ok: true, route: 'swr-route', entries: [{ ref: 'A', configured: true, masked: 'sk-a...z9' }] },
    })
    await httpKeyManagerClient.list('swr-route')
    vi.useFakeTimers()
    try {
      vi.setSystemTime(Date.now() + 10 * 60_000)
      // A later read failing does not take the cached answer away either.
      stubFetch({ status: 502, body: { ok: false, error: 'down' } })
      const failed = await httpKeyManagerClient.list('swr-route')
      expect(failed.ok).toBe(false)
      expect(httpKeyManagerClient.cached?.('swr-route')?.entries[0]?.ref).toBe('A')
    } finally {
      vi.useRealTimers()
    }
  })

  it('coalesces concurrent reads and preserves a write against a stale read', async () => {    let finishRead!: (response: Response) => void
    let readCount = 0
    vi.stubGlobal('fetch', async (_url: unknown, init?: RequestInit) => {
      if (init?.method === 'POST') {
        return {
          ok: true,
          json: async () => ({ ok: true, route: 'race-route', entries: [
            { ref: 'NEW', configured: true, masked: 'sk-n...w' },
          ] }),
        } as unknown as Response
      }
      readCount += 1
      return await new Promise<Response>(resolve => { finishRead = resolve })
    })
    const first = httpKeyManagerClient.list('race-route')
    const second = httpKeyManagerClient.list('race-route')
    expect(readCount).toBe(1)
    const written = await httpKeyManagerClient.add('race-route', 'sk-live-secret', undefined)
    expect(written.ok).toBe(true)
    finishRead({
      ok: true,
      json: async () => ({ ok: true, route: 'race-route', entries: [
        { ref: 'OLD', configured: true, masked: 'sk-o...d' },
      ] }),
    } as unknown as Response)
    await Promise.all([first, second])
    expect(httpKeyManagerClient.cached?.('race-route')?.entries[0]?.ref).toBe('NEW')
  })
})

describe('list', () => {
  it('GETs the route with no caching and same-origin credentials', async () => {
    stubFetch({ body: { ok: true, route: 'ofox', entries: [] } })
    const answer = await httpKeyManagerClient.list('ofox')

    expect(calls).toHaveLength(1)
    expect(calls[0]?.url).toBe(`${KEY_INDEX_PATH}?route=ofox`)
    expect(optionsOf()).toMatchObject({ method: 'GET', cache: 'no-store', credentials: 'same-origin' })
    expect(optionsOf()['body']).toBeUndefined()
    expect(answer).toEqual({ ok: true, route: 'ofox', entries: [], endpoints: { openai: null, anthropic: null } })
  })

  it('escapes the route it interpolates', async () => {
    stubFetch({ body: { ok: true, route: 'a b', entries: [] } })
    await httpKeyManagerClient.list('a b')
    expect(calls[0]?.url).toBe(`${KEY_INDEX_PATH}?route=a%20b`)
  })

  it('normalises rows: a label must be a string, an unknown badge is null, off needs a literal false', async () => {
    stubFetch({
      body: {
        ok: true,
        route: 'ofox',
        entries: [
          { ref: 'A', alias: 'main', enabled: false, configured: true, models: ['glm-4', 'glm-4-flash'] },
          { ref: 'B', alias: '', enabled: true, configured: false },
          { ref: 'C', configured: 'yes' },
          { ref: 'D', enabled: 'no', configured: true },
          { alias: 'no ref' },
          'nonsense',
        ],
      },
    })

    expect(await httpKeyManagerClient.list('ofox')).toEqual({
      ok: true,
      route: 'ofox',
      entries: [
        { ref: 'A', alias: 'main', enabled: false, configured: true, models: ['glm-4', 'glm-4-flash'] },
        { ref: 'B', enabled: true, configured: false },
        // No field at all, or anything but a literal false, reads as in use.
        { ref: 'C', enabled: true, configured: null },
        { ref: 'D', enabled: true, configured: true },
      ],
      endpoints: { openai: null, anthropic: null },
    })
  })

  it('keeps a masked preview only when the host sent a non-empty string', async () => {
    stubFetch({
      body: {
        ok: true,
        route: 'ofox',
        entries: [
          { ref: 'A', enabled: true, configured: true, masked: 'sk-a...wxyz' },
          { ref: 'B', enabled: true, configured: true, masked: '' },
          { ref: 'C', enabled: true, configured: true, masked: 42 },
          { ref: 'D', enabled: true, configured: true },
        ],
      },
    })

    expect(await httpKeyManagerClient.list('ofox')).toEqual({
      ok: true,
      route: 'ofox',
      entries: [
        { ref: 'A', enabled: true, configured: true, masked: 'sk-a...wxyz' },
        { ref: 'B', enabled: true, configured: true },
        { ref: 'C', enabled: true, configured: true },
        { ref: 'D', enabled: true, configured: true },
      ],
      endpoints: { openai: null, anthropic: null },
    })
  })

  it('drops model ids that are not non-empty strings, and keeps an empty scope list', async () => {
    stubFetch({
      body: {
        ok: true,
        route: 'ofox',
        entries: [
          { ref: 'A', enabled: true, configured: true, models: ['glm-4', '', 42, 'glm-4'] },
          { ref: 'B', enabled: true, configured: true, models: [] },
          { ref: 'C', enabled: true, configured: true, models: 'nonsense' },
        ],
      },
    })

    expect(await httpKeyManagerClient.list('ofox')).toEqual({
      ok: true,
      route: 'ofox',
      entries: [
        { ref: 'A', enabled: true, configured: true, models: ['glm-4', 'glm-4'] },
        { ref: 'B', enabled: true, configured: true, models: [] },
        { ref: 'C', enabled: true, configured: true },
      ],
      endpoints: { openai: null, anthropic: null },
    })
  })

})

describe('mutations', () => {
  it('keeps an added or reused reference only when the response lists it', async () => {
    const entries = [{ ref: 'SPARE' }, { ref: 'ACTIVE' }]
    stubFetch({ body: { ok: true, route: 'added-ref', entries, addedRef: 'ACTIVE' } })
    expect(await httpKeyManagerClient.add('added-ref', 'sk-active', undefined)).toMatchObject({ addedRef: 'ACTIVE' })

    stubFetch({ body: { ok: true, route: 'added-ref', entries, addedRef: 'UNLISTED' } })
    expect(await httpKeyManagerClient.add('added-ref', 'sk-active', undefined)).not.toHaveProperty('addedRef')
  })

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

  it('POSTs a scope, a protocol, a rename and a remove with their own fields', async () => {
    stubFetch({ body: { ok: true, route: 'ofox', entries: [] } })
    await httpKeyManagerClient.setScope('ofox', 'A', ['glm-4', 'glm-4-flash'])
    expect(bodyOf()).toEqual({ op: 'scope', ref: 'A', models: ['glm-4', 'glm-4-flash'] })

    stubFetch({ body: { ok: true, route: 'ofox', entries: [] } })
    await httpKeyManagerClient.setScope('ofox', 'A', undefined)
    expect(bodyOf()).toEqual({ op: 'scope', ref: 'A' })
    expect(bodyOf()).not.toHaveProperty('models')

    stubFetch({ body: { ok: true, route: 'ofox', entries: [] } })
    await httpKeyManagerClient.setProtocol('ofox', 'A', 'anthropic-messages')
    expect(bodyOf()).toEqual({ op: 'protocol', ref: 'A', protocol: 'anthropic-messages' })

    stubFetch({ body: { ok: true, route: 'ofox', entries: [] } })
    await httpKeyManagerClient.setProtocol('ofox', 'A', undefined)
    expect(bodyOf()).toEqual({ op: 'protocol', ref: 'A' })
    expect(bodyOf()).not.toHaveProperty('protocol')

    stubFetch({ body: { ok: true, route: 'ofox', entries: [] } })
    await httpKeyManagerClient.rename('ofox', 'A', 'primary')
    expect(bodyOf()).toEqual({ op: 'rename', ref: 'A', alias: 'primary' })

    stubFetch({ body: { ok: true, route: 'ofox', entries: [] } })
    await httpKeyManagerClient.rename('ofox', 'A', undefined)
    expect(bodyOf()).toEqual({ op: 'rename', ref: 'A' })

    stubFetch({ body: { ok: true, route: 'ofox', entries: [] } })
    await httpKeyManagerClient.remove('ofox', 'A')
    expect(bodyOf()).toEqual({ op: 'remove', ref: 'A' })

    stubFetch({ body: { ok: true, route: 'ofox', entries: [] } })
    await httpKeyManagerClient.setEnabled('ofox', 'A', false)
    expect(bodyOf()).toEqual({ op: 'enable', ref: 'A', enabled: false })

    stubFetch({ body: { ok: true, route: 'ofox', entries: [] } })
    await httpKeyManagerClient.setEnabled('ofox', 'A', true)
    expect(bodyOf()).toEqual({ op: 'enable', ref: 'A', enabled: true })
  })

  it('POSTs the endpoint pair with unset addresses folded to empty strings', async () => {
    // The host reads the two family addresses as a record of STRINGS and
    // treats an empty one as "clear this side", so a missing address must ride
    // the wire as '' — not as a missing key the host would default itself.
    stubFetch({ body: { ok: true, route: 'ofox', entries: [] } })
    await httpKeyManagerClient.setEndpoints('ofox', 'https://openai.example/v1', undefined)
    expect(bodyOf()).toEqual({
      op: 'endpoints',
      openai: 'https://openai.example/v1',
      anthropic: '',
    })

    stubFetch({ body: { ok: true, route: 'ofox', entries: [] } })
    await httpKeyManagerClient.setEndpoints('ofox', undefined, undefined)
    expect(bodyOf()).toEqual({ op: 'endpoints', openai: '', anthropic: '' })
  })
})

describe('replace', () => {
  it('POSTs the new secret and the reference it belongs to', async () => {
    stubFetch({ body: { ok: true, route: 'ofox', entries: [] } })
    const answer = await httpKeyManagerClient.replace('ofox', 'key-2', 'sk-live-secret')

    expect(calls[0]?.url).toBe(`${KEY_INDEX_PATH}?route=ofox`)
    expect(optionsOf()).toMatchObject({ method: 'POST', cache: 'no-store', credentials: 'same-origin' })
    expect(headersOf()['content-type']).toBe('application/json')
    expect(bodyOf()).toEqual({ op: 'value', ref: 'key-2', value: 'sk-live-secret' })
    expect(answer).toEqual({ ok: true, route: 'ofox', entries: [], endpoints: { openai: null, anthropic: null } })
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
    expect(await httpKeyManagerClient.setScope('ofox', 'GHOST', [])).toEqual({
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

describe('the address pair read', () => {
  it('asks for the endpoints only, never for the key list', async () => {
    stubFetch({
      body: { ok: true, route: 'ofox', endpoints: { openai: 'https://a.example.com', anthropic: null } },
    })
    const answer = await httpKeyManagerClient.endpoints?.('ofox')
    expect(answer).toEqual({
      ok: true,
      endpoints: { openai: 'https://a.example.com', anthropic: null },
    })
    // The page hydrates this once per visible card per second; it must not pull
    // the whole list, which costs the host a settings read and one credential
    // resolve per key on a serialising service.
    expect(calls).toHaveLength(1)
    expect(calls[0]?.url).toBe(`${KEY_INDEX_PATH}?route=ofox&op=endpoints`)
    expect(optionsOf()).toMatchObject({ method: 'GET', cache: 'no-store', credentials: 'same-origin' })
    expect(bodyOf()).toBeUndefined()
  })

  it('reports a refusal as a refusal, and never guesses an address', async () => {
    const cases: Array<{ status?: number; body?: unknown; raw?: string; throws?: boolean }> = [
      { status: 403, body: { ok: false, error: 'forbidden' } },
      { status: 400, body: { ok: false, error: 'a route is required' } },
      { body: { ok: true } },
      { body: { ok: true, endpoints: { openai: 42, anthropic: '' } } },
      { raw: 'not json' },
      { throws: true },
    ]
    for (const answer of cases) {
      stubFetch(answer)
      const result = await httpKeyManagerClient.endpoints?.('ofox')
      expect(result?.ok).toBe(answer.body !== undefined && (answer.body as { ok?: unknown }).ok === true)
      // A missing/malformed pair reads as "nothing stored", which is what the
      // hydration merges with the other families' addresses.
      expect(result?.endpoints?.openai ?? null).toBeNull()
    }
  })

  it('escapes the route', async () => {
    stubFetch({ body: { ok: true, endpoints: { openai: null, anthropic: null } } })
    await httpKeyManagerClient.endpoints?.('a b')
    expect(calls[0]?.url).toBe(`${KEY_INDEX_PATH}?route=a%20b&op=endpoints`)
  })
})
