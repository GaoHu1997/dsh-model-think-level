/**
 * apply()-level integration for the image routes: the three same-origin paths
 * register, the config file syncs from the settings document, and a generation
 * through the route lands on disk — over a fake host shaped like the real one.
 */

import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import * as realFs from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { imageConfigFilePath, readImageConfig } from '../src/image/config.js'
import { emptyIndex } from '../src/headers-core.js'
import { IMAGE_CONFIG_PATH, IMAGE_GENERATE_PATH, IMAGE_MCP_PATH } from '../src/constants.js'

type HostCtx = Parameters<typeof import('../src/index.js').apply>[0]

let home = ''
const hostCleanups: Array<() => void> = []

beforeEach(() => {
  home = mkdtempSync(join(tmpdir(), 'bre-image-host-'))
  process.env['DSH_HOME'] = home
})

afterEach(() => {
  for (const cleanup of hostCleanups.splice(0)) cleanup()
  rmSync(home, { recursive: true, force: true })
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

/** One provider whose gpt-image row is marked 生图, pointing at the stub upstream. */
let upstreamUrl = ''

const PROVIDERS = () => ({
  openai: {
    displayName: 'OpenAI',
    api: 'openai-completions',
    baseURL: upstreamUrl,
    apiKeyEnv: 'OPENAI_API_KEY',
    models: [{ id: 'gpt-image-1', name: 'GPT-Image-1', inputImageGen: true }],
  },
})

/** A minimal cordis context face capturing what apply() touches. */
function fakeHost(settings: { describe(): unknown[] }) {
  const listeners: Array<(ns: unknown) => void> = []
  const routes = new Map<string, (req: unknown, res: unknown) => Promise<void>>()
  const disposers: Array<() => void> = []
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
      cb(injected)
    },
    effect(setup: () => () => void): void {
      const disposer = setup()
      if (typeof disposer === 'function') {
        hostCleanups.push(disposer)
        disposers.push(disposer)
      }
    },
    on(event: string, cb: (ns: unknown) => void): void {
      if (event === 'settings/document-updated') listeners.push(cb)
    },
    get(name: string): unknown {
      if (name === 'credentials') {
        return {
          async resolve(ref: string) {
            return { value: ref === 'OPENAI_API_KEY' ? 'sk-test-key' : undefined }
          },
        }
      }
      return undefined
    },
  } as unknown as HostCtx
  return {
    ctx,
    routes,
    emitUpdated: (ns: unknown) => { for (const listener of listeners) listener(ns) },
  }
}

function fakeSettings() {
  let current: Record<string, unknown> = PROVIDERS()
  return {
    describe() {
      return current === undefined ? [] : [{ ns: 'llm-pi-ai', revision: 3, value: { providers: current }, user: { providers: current } }]
    },
    // The boot autofill asks; this suite's fixtures already declare everything.
    async update(): Promise<void> {},
    register(next: Record<string, unknown>): void {
      current = next
    },
  }
}

/** Node http-style req/res doubles, just enough for the handlers. */
function reqRes(method: string, body?: unknown, query = ''): { req: Record<string, unknown>; res: { statusCode: number; headers: Record<string, string>; body: string; setHeader(n: string, v: string): void; end(t?: string): void } } {
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
    url: `/${query}`,
    headers: { host: '127.0.0.1:1234' },
    // readJsonBody iterates the request as an async iterable of chunks.
    [Symbol.asyncIterator]: () => {
      let index = 0
      return { next: async () => (index < chunks.length ? { value: chunks[index++]!, done: false } : { value: undefined, done: true }) }
    },
  }
  return { req, res }
}

/** A stub upstream answering the images call with one b64 png. */
async function startUpstream(): Promise<string> {
  const { createServer } = await import('node:http')
  const server = createServer((req, res) => {
    let text = ''
    req.on('data', chunk => { text += chunk })
    req.on('end', () => {
      res.setHeader('content-type', 'application/json')
      res.end(JSON.stringify({ data: [{ b64_json: Buffer.from([1, 2, 3, 4]).toString('base64') }] }))
    })
    void text
  })
  await new Promise<void>(resolve => { server.listen(0, '127.0.0.1', resolve) })
  hostCleanups.push(() => { server.close() })
  const address = server.address()
  const port = typeof address === 'object' && address !== null ? address.port : 0
  return `http://127.0.0.1:${port}/v1`
}

describe('apply() image wiring', () => {
  it('syncs image.json from the settings document at boot', async () => {
    upstreamUrl = await startUpstream()
    const settings = fakeSettings()
    const { ctx, emitUpdated } = fakeHost(settings)
    const { apply } = await import('../src/index.js')
    apply(ctx)
    try {
      // The config file carries the derived row (with the conservative table).
      const config = readImageConfig(imageConfigFilePath(home))
      expect(config.models.map(model => model.id)).toEqual(['openai/gpt-image-1'])
      expect(config.models[0]!.keyRef).toBe('OPENAI_API_KEY')
      expect(config.models[0]!.baseURL).toBe(upstreamUrl)
      expect(config.models[0]!.params.maxN).toBe(4)
      // A settings update still re-derives the snapshot...
      settings.register({ openai: { ...(PROVIDERS().openai), models: [{ id: 'gpt-image-1' }] } })
      emitUpdated('llm-pi-ai')
      expect(readImageConfig(imageConfigFilePath(home)).models).toEqual([]) // ...down to nothing
    } finally {
      // Dispose through the module-level collector the afterEach drains too.
      for (const cleanup of hostCleanups.splice(0)) cleanup()
    }
  })

  it('GET image-config answers the derived list plus the MCP status block', async () => {
    upstreamUrl = await startUpstream()
    const settings = fakeSettings()
    const { ctx, routes } = fakeHost(settings)
    const { apply } = await import('../src/index.js')
    apply(ctx)
    const handler = routes.get(IMAGE_CONFIG_PATH)!
    expect(handler).toBeDefined()
    const { req, res } = reqRes('GET')
    await handler(req, res)
    expect(res.statusCode).toBe(200)
    const body = JSON.parse(res.body) as Record<string, unknown>
    expect(body['ok']).toBe(true)
    expect((body['models'] as { id: string }[])[0]!.id).toBe('openai/gpt-image-1')
    expect(body['mcp']).toMatchObject({ installed: false, serverName: 'dsh-image', toolName: 'mcp__dsh-image__generate_image' })
  })

  it('POST image-generate runs the shared core and lands the file (辅通道)', async () => {
    upstreamUrl = await startUpstream()
    const settings = fakeSettings()
    const { ctx, routes } = fakeHost(settings)
    const { apply } = await import('../src/index.js')
    apply(ctx)
    const handler = routes.get(IMAGE_GENERATE_PATH)!
    const { req, res } = reqRes('POST', { prompt: 'a red apple' })
    await handler(req, res)
    expect(res.statusCode).toBe(200)
    const body = JSON.parse(res.body) as { ok: boolean; filePath?: string; model?: string; error?: string }
    expect(body.ok).toBe(true)
    expect(body.model).toBe('openai/gpt-image-1')
    expect(existsSync(body.filePath!)).toBe(true)
    // The config file's lastGoodParams stays untouched (no fallback ran).
    expect(readImageConfig(imageConfigFilePath(home)).models[0]!.lastGoodParams).toBeNull()
  })

  it('POST image-mcp status derives from the (uninstalled) patch file', async () => {
    upstreamUrl = await startUpstream()
    const settings = fakeSettings()
    const { ctx, routes } = fakeHost(settings)
    const { apply } = await import('../src/index.js')
    apply(ctx)
    const handler = routes.get(IMAGE_MCP_PATH)!
    const { req, res } = reqRes('POST', { action: 'status' })
    await handler(req, res)
    const body = JSON.parse(res.body) as { ok: boolean; status?: { installed: boolean; patchFile: string } }
    expect(body.ok).toBe(true)
    expect(body.status!.installed).toBe(false)
    expect(body.status!.patchFile.startsWith(home)).toBe(true)
    // Nothing was written by a status read.
    expect(existsSync(body.status!.patchFile)).toBe(false)
    void readFileSync
    void writeFileSync
    void realFs
  })
})
