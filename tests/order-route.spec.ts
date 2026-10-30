/**
 * apply()-level integration for the UI-order route: it registers on the host's
 * web server, GET answers the stored document (an absent file as an EMPTY one,
 * never an error), and POST folds the payload over what is stored — over a
 * fake host shaped like the real one.
 */

import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { readUiOrder, uiOrderFilePath } from '../src/order-store.js'
import { ORDER_PATH } from '../src/constants.js'

type HostCtx = Parameters<typeof import('../src/index.js').apply>[0]

let home = ''
const hostCleanups: Array<() => void> = []

beforeEach(() => {
  home = mkdtempSync(join(tmpdir(), 'bre-order-route-'))
  process.env['DSH_HOME'] = home
})

afterEach(() => {
  for (const cleanup of hostCleanups.splice(0)) cleanup()
  rmSync(home, { recursive: true, force: true })
  vi.restoreAllMocks()
})

/** A minimal cordis context face capturing what apply() touches. */
function fakeHost() {
  const routes = new Map<string, (req: unknown, res: unknown) => Promise<void>>()
  const effect = (setup: () => () => void): void => {
    const disposer = setup()
    if (typeof disposer === 'function') hostCleanups.push(disposer)
  }
  const ctx = {
    settings: {
      describe() {
        return [{ ns: 'llm-pi-ai', revision: 1, value: { providers: {} }, user: { providers: {} } }]
      },
      async update(): Promise<void> {},
    },
    inject(deps: string[], cb: (injected: Record<string, unknown>) => void): void {
      const injected: Record<string, unknown> = {}
      if (deps.includes('settings')) injected['settings'] = ctx.settings
      if (deps.includes('webServer')) {
        injected['webServer'] = {
          register(route: { path: string; handler: (req: unknown, res: unknown) => Promise<void> }): () => void {
            routes.set(route.path, route.handler)
            return () => { routes.delete(route.path) }
          },
        }
      }
      if (Object.keys(injected).length < deps.length) return
      injected['effect'] = effect
      cb(injected)
    },
    effect,
    on(): void {},
    get(): unknown { return undefined },
  } as unknown as HostCtx
  return { ctx, routes }
}

/** Node http-style req/res doubles, just enough for the handlers. */
function reqRes(method: string, body?: unknown): { req: Record<string, unknown>; res: { statusCode: number; headers: Record<string, string>; body: string; setHeader(n: string, v: string): void; end(t?: string): void } } {
  const res = {
    statusCode: 0,
    headers: {} as Record<string, string>,
    body: '',
    setHeader(name: string, value: string): void { res.headers[name] = value },
    end(text?: string): void { res.body = text ?? '' },
  }
  const chunks: string[] = []
  if (body !== undefined) chunks.push(typeof body === 'string' ? body : JSON.stringify(body))
  const req = {
    method,
    url: '/',
    headers: { host: '127.0.0.1:1234' },
    [Symbol.asyncIterator]: () => {
      let index = 0
      return { next: async () => (index < chunks.length ? { value: chunks[index++]!, done: false } : { value: undefined, done: true }) }
    },
  }
  return { req, res }
}

async function answer(handler: (req: unknown, res: unknown) => Promise<void>, method: string, body?: unknown): Promise<{ status: number; json: Record<string, unknown> }> {
  const { req, res } = reqRes(method, body)
  await handler(req, res)
  return { status: res.statusCode, json: JSON.parse(res.body || '{}') as Record<string, unknown> }
}

describe('apply() ui-order route', () => {
  it('registers and answers an absent file as an empty document', async () => {
    const { ctx, routes } = fakeHost()
    const { apply } = await import('../src/index.js')
    apply(ctx)
    const handler = routes.get(ORDER_PATH)!
    expect(handler).toBeDefined()
    const { status, json } = await answer(handler, 'GET')
    expect(status).toBe(200)
    expect(json['ok']).toBe(true)
    expect(json['data']).toMatchObject({ version: 1, savedAt: 0, providerOrder: [], modelOrder: {} })
    // Still no file: the route never writes on a read.
    expect(readUiOrder(uiOrderFilePath(home)).providerOrder).toEqual([])
  })

  it('POST stores the document and GET reads it back', async () => {
    const { ctx, routes } = fakeHost()
    const { apply } = await import('../src/index.js')
    apply(ctx)
    const handler = routes.get(ORDER_PATH)!
    const payload = {
      savedAt: 1234,
      providerOrder: ['openai', 'deepseek-official'],
      modelOrder: { openai: ['gpt-4', 'gpt-3.5'] },
    }
    const stored = await answer(handler, 'POST', payload)
    expect(stored.status).toBe(200)
    expect(stored.json['ok']).toBe(true)
    expect(readUiOrder(uiOrderFilePath(home))).toMatchObject(payload)
    const read = await answer(handler, 'GET')
    expect((read.json['data'] as Record<string, unknown>).modelOrder).toEqual(payload.modelOrder)
  })

  it('POST folds a partial payload over the stored document instead of blanking it', async () => {
    const { ctx, routes } = fakeHost()
    const { apply } = await import('../src/index.js')
    apply(ctx)
    const handler = routes.get(ORDER_PATH)!
    await answer(handler, 'POST', { savedAt: 1, providerOrder: ['a'], modelOrder: { openai: ['m1'] } })
    const partial = await answer(handler, 'POST', { savedAt: 2, providerOrder: ['b'] })
    expect(partial.status).toBe(200)
    expect(readUiOrder(uiOrderFilePath(home))).toEqual({
      version: 1,
      savedAt: 2,
      providerOrder: ['b'],
      modelOrder: { openai: ['m1'] },
      providersDisabled: [],
    })
  })

  it('POST refuses a non-JSON body and leaves the file untouched', async () => {
    const { ctx, routes } = fakeHost()
    const { apply } = await import('../src/index.js')
    apply(ctx)
    const handler = routes.get(ORDER_PATH)!
    await answer(handler, 'POST', { savedAt: 1, providerOrder: ['a'] })
    const { req, res } = reqRes('POST', 'not json at all')
    await handler(req, res)
    expect(res.statusCode).toBe(400)
    expect(readUiOrder(uiOrderFilePath(home)).providerOrder).toEqual(['a'])
  })

  it('answers 405 for other methods and 403 for a foreign host', async () => {
    const { ctx, routes } = fakeHost()
    const { apply } = await import('../src/index.js')
    apply(ctx)
    const handler = routes.get(ORDER_PATH)!
    expect((await answer(handler, 'DELETE')).status).toBe(405)
    const { req, res } = reqRes('GET')
    ;(req['headers'] as Record<string, string>)['host'] = 'evil.example.com'
    await handler(req, res)
    expect(res.statusCode).toBe(403)
  })
})
