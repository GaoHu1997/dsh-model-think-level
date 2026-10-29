/**
 * The balance host route: one provider's configured balance URL, queried with
 * that route's stored key.
 *
 * The browser half cannot make this call (third-party origin, and the key lives
 * in the host's credential store), so the route is the whole feature's wire.
 * These cases pin its contract: a route with no URL answers `configured:false`
 * without calling anything, a configured route signs with its key, and every
 * failure stays distinguishable from "not configured".
 */

import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { BALANCE_PATH } from '../src/constants.js'
import { keyIndexFilePath, writeKeyIndex } from '../src/key-index.js'

type HostCtx = Parameters<typeof import('../src/index.js').apply>[0]

let home = ''
const hostCleanups: Array<() => void> = []

beforeEach(() => {
  home = mkdtempSync(join(tmpdir(), 'bre-balance-host-'))
  process.env['DSH_HOME'] = home
})

afterEach(() => {
  for (const cleanup of hostCleanups.splice(0)) cleanup()
  rmSync(home, { recursive: true, force: true })
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

const PROVIDERS = () => ({
  ofox: {
    displayName: 'Ofox',
    api: 'openai-completions',
    baseURL: 'https://api.ofox.example/v1',
    apiKeyEnv: 'OFOX_API_KEY',
    models: [{ id: 'glm-4' }],
  },
})

/** The stored values the fake credential store can resolve. */
const KEY_VALUES: Record<string, string> = {
  OFOX_API_KEY: 'sk-test-key',
  FIRST_KEY: 'sk-first',
  SECOND_KEY: 'sk-second',
}

/** A minimal cordis context face capturing what apply() touches. */
function fakeHost() {
  const routes = new Map<string, (req: unknown, res: unknown) => Promise<void>>()
  const settings = {
    describe() {
      return [{ ns: 'llm-pi-ai', revision: 3, value: { providers: PROVIDERS() }, user: { providers: PROVIDERS() } }]
    },
    async update(): Promise<void> {},
    register(): void {},
  }
  // The fake effect, shared by ctx.effect and the injected Context's own
  // effect member (the deferred tool registration runs on the injected value).
  const effect = (setup: () => () => void): void => {
    const disposer = setup()
    if (typeof disposer === 'function') hostCleanups.push(disposer)
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
      if (name === 'credentials') {
        return {
          async resolve(ref: string) {
            return { value: KEY_VALUES[ref] }
          },
        }
      }
      return undefined
    },
  } as unknown as HostCtx
  return { ctx, routes }
}

/** Node http-style req/res doubles, just enough for the handler. */
function reqRes(method: string, query: string): {
  req: Record<string, unknown>
  res: { statusCode: number; headers: Record<string, string>; body: string; setHeader(n: string, v: string): void; end(t?: string): void }
} {
  const res = {
    statusCode: 0,
    headers: {} as Record<string, string>,
    body: '',
    setHeader(name: string, value: string): void { res.headers[name] = value },
    end(text?: string): void { res.body = text ?? '' },
  }
  const req = {
    method,
    url: query,
    headers: { host: '127.0.0.1:1234' },
  }
  return { req, res }
}

/** Store one route's balance URL in the plugin's index. */
function indexWithBalance(url: string): void {
  writeKeyIndex({
    version: 1,
    providers: { ofox: [{ ref: 'OFOX_API_KEY' }] },
    balances: { ofox: url },
  }, keyIndexFilePath(home))
}

/** Start the plugin and hand back the registered balance handler. */
async function balanceHandler(): Promise<(req: unknown, res: unknown) => Promise<void>> {
  const { ctx, routes } = fakeHost()
  const { apply } = await import('../src/index.js')
  apply(ctx)
  const handler = routes.get(BALANCE_PATH)
  if (handler === undefined) throw new Error('the balance route was not registered')
  return handler
}

describe('GET /balance', () => {
  it('answers configured:false and calls nothing when the route has no URL', async () => {
    const gate = vi.fn()
    vi.stubGlobal('fetch', gate)
    const handler = await balanceHandler()
    const { req, res } = reqRes('GET', '/dsh-model-think-level/balance?route=ofox')
    await handler(req, res)
    expect(res.statusCode).toBe(200)
    expect(JSON.parse(res.body)).toEqual({ ok: true, route: 'ofox', configured: false })
    expect(gate).not.toHaveBeenCalled()
  })

  it('queries the stored URL with the route key and parses the balance', async () => {
    indexWithBalance('https://billing.example/balance')
    const calls: Array<{ url: string; init: RequestInit | undefined }> = []
    vi.stubGlobal('fetch', vi.fn(async (input: unknown, init?: RequestInit) => {
      calls.push({ url: String(input), init })
      return new Response(JSON.stringify({ total_available: 42, currency: 'usd' }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      })
    }))
    const handler = await balanceHandler()
    const { req, res } = reqRes('GET', '/dsh-model-think-level/balance?route=ofox')
    await handler(req, res)

    expect(res.statusCode).toBe(200)
    expect(JSON.parse(res.body)).toEqual({
      ok: true, route: 'ofox', configured: true, amount: 42, currency: 'USD',
    })
    expect(calls).toHaveLength(1)
    expect(calls[0]?.url).toBe('https://billing.example/balance')
    expect((calls[0]?.init?.headers as Record<string, string>)['authorization']).toBe('Bearer sk-test-key')
    // Redirects are refused, so the key only reaches the authority the user typed.
    expect(calls[0]?.init?.redirect).toBe('error')
  })

  it('asks with the first listed key only when a provider has several', async () => {
    // Several keys may resolve to different upstream accounts, but the row shows
    // ONE amount: only the first key is ever asked, so the cost cannot grow with
    // the key count.
    writeKeyIndex({
      version: 1,
      providers: { ofox: [{ ref: 'FIRST_KEY' }, { ref: 'SECOND_KEY' }] },
      balances: { ofox: 'https://billing.example/balance' },
    }, keyIndexFilePath(home))
    const headers: Array<Record<string, string>> = []
    vi.stubGlobal('fetch', vi.fn(async (_input: unknown, init?: RequestInit) => {
      headers.push((init?.headers ?? {}) as Record<string, string>)
      return new Response(JSON.stringify({ balance: 7 }), { status: 200 })
    }))
    const handler = await balanceHandler()
    const { req, res } = reqRes('GET', '/dsh-model-think-level/balance?route=ofox')
    await handler(req, res)

    expect(res.statusCode).toBe(200)
    expect(JSON.parse(res.body)).toMatchObject({ ok: true, configured: true, amount: 7 })
    expect(headers).toHaveLength(1)
    expect(headers[0]?.['authorization']).toBe('Bearer sk-first')
  })

  it('keeps a configured endpoint distinguishable from an unconfigured one on failure', async () => {
    indexWithBalance('https://billing.example/balance')
    vi.stubGlobal('fetch', vi.fn(async () => new Response('nope', { status: 403 })))
    const handler = await balanceHandler()
    const { req, res } = reqRes('GET', '/dsh-model-think-level/balance?route=ofox')
    await handler(req, res)

    expect(res.statusCode).toBe(502)
    const body = JSON.parse(res.body) as Record<string, unknown>
    expect(body['ok']).toBe(false)
    expect(body['configured']).toBe(true)
    expect(String(body['error'])).toContain('403')
    expect(String(body['error'])).toContain('check the API key')
  })

  it('refuses a response with no recognisable balance', async () => {
    indexWithBalance('https://billing.example/balance')
    vi.stubGlobal('fetch', vi.fn(async () => new Response('<html>maintenance</html>', { status: 200 })))
    const handler = await balanceHandler()
    const { req, res } = reqRes('GET', '/dsh-model-think-level/balance?route=ofox')
    await handler(req, res)

    expect(res.statusCode).toBe(502)
    const body = JSON.parse(res.body) as Record<string, unknown>
    expect(body['configured']).toBe(true)
    expect(String(body['error'])).toContain('no recognisable balance')
  })

  it('rejects a cross-site caller and a missing route', async () => {
    const handler = await balanceHandler()
    const crossSite = reqRes('GET', '/dsh-model-think-level/balance?route=ofox')
    ;(crossSite.req['headers'] as Record<string, string>)['origin'] = 'https://evil.example'
    await handler(crossSite.req, crossSite.res)
    expect(crossSite.res.statusCode).toBe(403)

    const noRoute = reqRes('GET', '/dsh-model-think-level/balance')
    await handler(noRoute.req, noRoute.res)
    expect(noRoute.res.statusCode).toBe(400)
    expect(JSON.parse(noRoute.res.body)['error']).toBe('a route is required')
  })
})
