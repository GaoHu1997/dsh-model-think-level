/**
 * The history-compatibility route, exercised through apply() on a fake host.
 *
 * The regression this file guards: the switch pane paints itself from the
 * route's answer, so a write reply that carried only the stored document made a
 * successful save report "request seams not installed". Both GET and POST must
 * answer with the same shape.
 */

import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { HISTORY_COMPAT_PATH } from '../src/constants.js'
import { historyCompatFilePath, readHistoryCompat } from '../src/history-compat-store.js'

type HostCtx = Parameters<typeof import('../src/index.js').apply>[0]

let home = ''
const hostCleanups: Array<() => void> = []

beforeEach(() => {
  home = mkdtempSync(join(tmpdir(), 'bre-history-route-'))
  process.env['DSH_HOME'] = home
})

afterEach(() => {
  for (const cleanup of hostCleanups.splice(0)) cleanup()
  rmSync(home, { recursive: true, force: true })
  vi.restoreAllMocks()
})

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

async function registered(): Promise<(req: unknown, res: unknown) => Promise<void>> {
  const { ctx, routes } = fakeHost()
  const { apply } = await import('../src/index.js')
  apply(ctx)
  const handler = routes.get(HISTORY_COMPAT_PATH)
  expect(handler).toBeDefined()
  return handler as (req: unknown, res: unknown) => Promise<void>
}

describe('apply() history-compat route', () => {
  it('answers GET with the stored document and the seam state', async () => {
    const handler = await registered()
    const { status, json } = await answer(handler, 'GET')
    expect(status).toBe(200)
    expect(json['ok']).toBe(true)
    const data = json['data'] as Record<string, unknown>
    expect(data['providers']).toEqual({})
    expect(typeof data['installed']).toBe('boolean')
    // A read never writes.
    expect(readHistoryCompat(historyCompatFilePath(home)).providers).toEqual({})
  })

  it('answers POST with the stored document AND the seam state', async () => {
    const handler = await registered()
    const { status, json } = await answer(handler, 'POST', { route: 'relay', enabled: true })
    expect(status).toBe(200)
    expect(json['ok']).toBe(true)
    const data = json['data'] as Record<string, unknown>
    expect(data['providers']).toEqual({ relay: true })
    // The regression: a document-only reply left `installed` undefined, and the
    // pane repainted the "seams not installed" warning right after a good save.
    expect(typeof data['installed']).toBe('boolean')
    expect(readHistoryCompat(historyCompatFilePath(home)).providers).toEqual({ relay: true })
  })

  it('turns a route back off and keeps the GET in step', async () => {
    const handler = await registered()
    await answer(handler, 'POST', { route: 'relay', enabled: true })
    await answer(handler, 'POST', { route: 'relay', enabled: false })
    const { json } = await answer(handler, 'GET')
    expect((json['data'] as Record<string, unknown>)['providers']).toEqual({})
  })

  it('refuses a malformed write, a bad method and a foreign host', async () => {
    const handler = await registered()
    expect((await answer(handler, 'POST', { route: '', enabled: true })).status).toBe(400)
    expect((await answer(handler, 'POST', { route: 'relay' })).status).toBe(400)
    expect((await answer(handler, 'POST', 'not json')).status).toBe(400)
    expect((await answer(handler, 'DELETE')).status).toBe(405)
    const { req, res } = reqRes('GET')
    ;(req['headers'] as Record<string, string>)['host'] = 'evil.example.com'
    await handler(req, res)
    expect(res.statusCode).toBe(403)
    expect(readHistoryCompat(historyCompatFilePath(home)).providers).toEqual({})
  })
})
