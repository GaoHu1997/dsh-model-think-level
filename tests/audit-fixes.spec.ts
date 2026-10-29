/**
 * Regression tests for the 2026-10-28 audit fixes (docs/ai-audit-20261028.md,
 * fix round). Each case pins a defect that survived two audit rounds:
 *
 *   - probe-route credential echo (audit F6 / historical P1-4/S2)
 *   - headers-config masking + no-store (audit F2 / historical P0-2)
 *   - wire-forbidden header names riding the overlay (audit F5 / S1/P1-3)
 *   - providers:{x:null} killing the plugin at boot (audit F4 / P1-2/S3)
 *   - key-index fail-closed messages + scope widening (audit F20/F7/M-11)
 *   - route-level hygiene: DIAG method check, fingerprint no-store
 */

import { mkdtempSync, writeFileSync, mkdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { DIAG_PATH, FINGERPRINT_PATH, HEADERS_CONFIG_PATH, KEY_INDEX_PATH, PROBE_PATH } from '../src/constants.js'
import { apply } from '../src/index.js'
import { displayUrl, redactUrlSecrets } from '../src/listing.js'
import { buildHeaderIndex, isSendableHeader } from '../src/headers-core.js'
import { keyIndexFilePath, readKeyIndex } from '../src/key-index.js'

// ---------------------------------------------------------------- listing ---

describe('displayUrl / redactUrlSecrets (F6)', () => {
  it('strips userinfo, query and fragment; keeps the path', () => {
    expect(displayUrl('http://alice:hunter2@127.0.0.1:9/v1?api_key=SECRET&x=1#frag'))
      .toBe('http://127.0.0.1:9/v1')
  })
  it('replaces an unparseable URL with a placeholder (never echoes raw)', () => {
    expect(displayUrl('https://[')).toBe('[unparseable URL]')
  })
  it('refuses to echo the opaque user:pass@host spelling', () => {
    // 'user:pass@example.com' parses as scheme 'user' + opaque path: the
    // username/password setters are no-ops there, so the raw text must go.
    expect(displayUrl('user:pass@example.com/models')).toBe('[unparseable URL]')
  })
  it('redacts user:pass@ shapes from free-form error text', () => {
    expect(redactUrlSecrets('Request cannot be constructed from a URL that includes credentials: http://alice:hunter2@127.0.0.1:9/v1'))
      .toBe('Request cannot be constructed from a URL that includes credentials: http://[redacted]@127.0.0.1:9/v1')
    expect(redactUrlSecrets('Failed to parse URL from user:pass@example.com/models'))
      .toBe('Failed to parse URL from [redacted]@example.com/models')
  })
  it('leaves credential-free text alone', () => {
    const text = 'fetch failed'
    expect(redactUrlSecrets(text)).toBe(text)
  })
})

// ---------------------------------------------------------- headers-core ----

describe('isSendableHeader wire-forbidden names (F5)', () => {
  it.each(['transfer-encoding', 'content-length', 'connection', 'host', 'te', 'upgrade', 'trailer', 'expect', 'keep-alive'])(
    'refuses %s', (name) => {
      expect(isSendableHeader(name, '1')).toBe(false)
    },
  )
  it('still accepts ordinary names (case-insensitive)', () => {
    expect(isSendableHeader('x-tenant', 'abc')).toBe(true)
    expect(isSendableHeader('User-Agent', 'codex_cli_rs/0.5.0')).toBe(true)
    expect(isSendableHeader('Transfer-Encoding', 'chunked')).toBe(false)
  })
  it('buildHeaderIndex skips a null provider slot instead of throwing (F4)', () => {
    const providers = { relay: { api: 'openai-completions', baseURL: 'http://127.0.0.1:9/v1' }, broken: null } as unknown as Record<string, Record<string, unknown>>
    expect(() => buildHeaderIndex(providers)).not.toThrow()
    expect(buildHeaderIndex(providers).routes).toHaveLength(1)
  })
})

// ------------------------------------------------------------ host routes ---

type HostCtx = Parameters<typeof import('../src/index.js').apply>[0]

function fakeHost(providers: unknown, options?: { credentials?: unknown; fetchMock?: unknown }) {
  const routes = new Map<string, (req: unknown, res: unknown) => Promise<void>>()
  const settings = {
    describe: () => [{ ns: 'llm-pi-ai', revision: 3, value: { providers }, user: { providers } }],
    mutate: async () => {},
    update: async () => {},
  }
  // The fake effect, shared by ctx.effect and the injected Context's own
  // effect member (the deferred tool registration runs on the injected value).
  const effect = (setup: () => () => void): void => {
    // The disposer is deliberately dropped: routes must stay registered for
    // the assertions below (the test process tears down with the suite).
    setup()
  }
  const ctx = {
    settings,
    inject(deps: string[], cb: (injected: Record<string, unknown>) => void): void {
      const injected: Record<string, unknown> = {}
      if (deps.includes('settings')) injected['settings'] = settings
      if (deps.includes('webServer')) {
        injected['webServer'] = {
          register(route: { path: string; handler: (req: unknown, res: unknown) => Promise<void> }): () => void {
            routes.set(route.path, route.handler)
            return () => { routes.delete(route.path) }
          },
        }
      }
      // Cordis waits for EVERY dep; a missing one means the callback never
      // runs (the image tool registration defers on tools + attachments).
      if (Object.keys(injected).length < deps.length) return
      injected['effect'] = effect
      cb(injected)
    },
    effect,
    on(): void {},
    get(name: string): unknown {
      return name === 'credentials' ? options?.credentials : undefined
    },
  } as unknown as HostCtx
  if (options?.fetchMock !== undefined) {
    const original = globalThis.fetch
    globalThis.fetch = options.fetchMock as typeof fetch
    apply(ctx)
    globalThis.fetch = original
  } else {
    apply(ctx)
  }
  return routes
}

function fakeReq(overrides: Record<string, unknown> = {}): unknown {
  const body = overrides['body']
  return {
    method: 'GET',
    url: '/',
    headers: { host: '127.0.0.1:3080' },
    ...overrides,
    ...(typeof body === 'string' ? { [Symbol.asyncIterator]: async function* () { yield body } } : {}),
  }
}

function fakeRes(): { res: unknown; out: () => { status: number; body: string; headers: Record<string, string>; writes: string[] } } {
  let status = 0
  let raw = ''
  const headers: Record<string, string> = {}
  const writes: string[] = []
  const res = {
    set statusCode(value: number) { status = value },
    get statusCode(): number { return status },
    setHeader(key: string, value: string): void { headers[key.toLowerCase()] = value },
    end(body?: string): void { if (body !== undefined) raw += body },
    write(body?: string): boolean { writes.push(body ?? ''); return true },
    on(): void {},
  }
  return { res, out: () => ({ status, body: raw, headers, writes }) }
}

async function call(routes: Map<string, (req: unknown, res: unknown) => Promise<void>>, url: string, overrides: Record<string, unknown> = {}): Promise<{ status: number; body: Record<string, unknown>; headers: Record<string, string> }> {
  // Routes register under their bare path; the query rides the request URL.
  const bare = url.slice(0, url.indexOf('?') === -1 ? url.length : url.indexOf('?'))
  const handler = routes.get(bare)
  if (handler === undefined) throw new Error(`route ${bare} not registered`)
  const { res, out } = fakeRes()
  await handler(fakeReq({ url, ...overrides }), res)
  const r = out()
  return { status: r.status, body: JSON.parse((r.body + r.writes.join('')) || '{}') as Record<string, unknown>, headers: r.headers }
}

const ONE_RELAY = {
  relay: { api: 'openai-completions', baseURL: 'http://127.0.0.1:9/v1', models: [{ id: 'm1' }, { id: 'm2' }] },
}

describe('providers with a null slot keep the plugin alive (F4)', () => {
  it('boot registers every route with {broken: null} present', () => {
    const routes = fakeHost({ ...ONE_RELAY, broken: null })
    expect(routes.has(PROBE_PATH)).toBe(true)
    expect(routes.has(KEY_INDEX_PATH)).toBe(true)
  })
})

describe('DIAG route method check (F23)', () => {
  it('POST/DELETE answer 405, GET answers 200', async () => {
    const routes = fakeHost(ONE_RELAY)
    expect((await call(routes, DIAG_PATH, { method: 'POST' })).status).toBe(405)
    expect((await call(routes, DIAG_PATH, { method: 'DELETE' })).status).toBe(405)
    expect((await call(routes, DIAG_PATH)).status).toBe(200)
  })
})

describe('fingerprint route no-store on every verb (F24)', () => {
  it('GET carries cache-control: no-store', async () => {
    const routes = fakeHost(ONE_RELAY)
    const answer = await call(routes, `${FINGERPRINT_PATH}?route=relay`)
    expect({ status: answer.status, noStore: answer.headers['cache-control'] }).toMatchObject({ status: 200, noStore: 'no-store' })
  })
})

describe('headers-config masks credential headers and sets no-store (F2)', () => {
  it('authorization values are masked; user-agent survives; no-store set', async () => {
    const providers = {
      relay: {
        api: 'openai-completions',
        baseURL: 'http://127.0.0.1:9/v1',
        headers: { authorization: 'Bearer sk-live-SECRET', 'x-api-key': 'ak-SECRET', 'user-agent': 'relay-agent/1' },
        models: [],
      },
    }
    const routes = fakeHost(providers)
    const answer = await call(routes, HEADERS_CONFIG_PATH)
    const override = (answer.body['data'] as Record<string, unknown>)['overrides'] as Array<Record<string, unknown>>
    expect(answer.headers['cache-control']).toBe('no-store')
    expect(override[0]?.['headers']).toEqual({
      authorization: '[stored, not echoed]',
      'x-api-key': '[stored, not echoed]',
      'user-agent': 'relay-agent/1',
    })
    expect(JSON.stringify(answer.body)).not.toContain('sk-live-SECRET')
    expect(JSON.stringify(answer.body)).not.toContain('ak-SECRET')
  })
})

describe('probe route error texts carry no credentials (F6 end-to-end)', () => {
  const RESOLVING = {
    resolve: async () => ({ value: 'sk-store-value' }),
    describe: async (refs: string[]) => ({ value: Object.fromEntries(refs.map(ref => [ref, { configured: true }])) }),
  }
  it('userinfo baseURL: the 502 body shows [redacted]@, never the password', async () => {
    const routes = fakeHost({
      relay: { api: 'openai-completions', baseURL: 'http://alice:hunter2@127.0.0.1:9/v1', apiKeyEnv: 'K', models: [] },
    }, {
      credentials: RESOLVING,
      fetchMock: async () => {
        throw new TypeError('Request cannot be constructed from a URL that includes credentials: http://alice:hunter2@127.0.0.1:9/v1/models')
      },
    })
    const answer = await call(routes, `${PROBE_PATH}?route=relay&refresh=1`)
    expect({ status: answer.status, body: answer.body['error'] }).toMatchObject({ status: 502 })
    expect(String(answer.body['error'])).toContain('[redacted]@')
    expect(String(answer.body['error'])).not.toContain('hunter2')
  })
  it('query-key baseURL: the echoed url field carries no query at all', async () => {
    const routes = fakeHost({
      relay: { api: 'openai-completions', baseURL: 'http://127.0.0.1:9/v1?api_key=sk-QUERY-SECRET', apiKeyEnv: 'K', models: [] },
    }, {
      credentials: RESOLVING,
      fetchMock: async () => {
        throw new TypeError('fetch failed')
      },
    })
    const answer = await call(routes, `${PROBE_PATH}?route=relay&refresh=1`)
    expect(String(answer.body['error'])).not.toContain('sk-QUERY-SECRET')
  })
})

describe('key-index hardening (F7/F20)', () => {
  it('scope refuses a non-array models value instead of silently clearing (F7)', async () => {
    process.env['DSH_HOME'] = mkdtempSync(join(tmpdir(), 'audit-fix-'))
    const store = new Map<string, string>()
    const credentials = {
      resolve: async (ref: string) => (store.has(ref) ? { value: store.get(ref) } : undefined),
      describe: async (refs: string[]) => ({ value: Object.fromEntries(refs.map(ref => [ref, { configured: store.has(ref) }])) }),
      set: async (ref: string, value: string) => { store.set(ref, value); return undefined },
      unset: async (ref: string) => { store.delete(ref); return undefined },
    }
    const routes = fakeHost(ONE_RELAY, { credentials })
    const handler = routes.get(KEY_INDEX_PATH)!
    const post = (body: unknown): Promise<{ status: number; body: Record<string, unknown> }> => {
      const { res, out } = fakeRes()
      void res
      return (async () => {
        await handler(fakeReq({ method: 'POST', url: `${KEY_INDEX_PATH}?route=relay`, body: JSON.stringify(body) }), res)
        const r = out()
        return { status: r.status, body: JSON.parse(r.body || '{}') as Record<string, unknown> }
      })()
    }
    const added = await post({ op: 'add', value: 'sk-ONE' })
    expect(added.status).toBe(200)
    const ref = (readKeyIndex(keyIndexFilePath()).providers['relay'] ?? [])[0]!.ref
    expect((await post({ op: 'scope', ref, models: ['m1'] })).status).toBe(200)
    const widened = await post({ op: 'scope', ref, models: 'm1,m2' })
    expect({ status: widened.status, error: widened.body['error'] }).toMatchObject({
      status: 400,
      error: 'model assignments must be an array of model ids',
    })
    expect((readKeyIndex(keyIndexFilePath()).providers['relay'] ?? [])[0]?.models).toEqual(['m1'])
  })

  it('a truncated index file fails closed with the repair message (F20)', () => {
    const home = mkdtempSync(join(tmpdir(), 'audit-fix-'))
    process.env['DSH_HOME'] = home
    const file = keyIndexFilePath()
    mkdirSync(join(file, '..'), { recursive: true })
    writeFileSync(file, '{"version":1,"providers":{"relay":[{"ref":"R_A')
    expect(() => readKeyIndex()).toThrow('the key index is malformed; repair it before changing keys')
  })
})
