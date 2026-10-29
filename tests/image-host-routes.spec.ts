/**
 * apply()-level integration for the image wiring: the same-origin paths
 * register, the config file syncs from the settings document, a generation
 * through the route lands on disk, and the native `generate_image` tool
 * registers when the host carries the tools/attachments services — over a
 * fake host shaped like the real one.
 */

import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import * as realFs from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { imageConfigFilePath, readImageConfig } from '../src/image/config.js'
import { emptyIndex } from '../src/headers-core.js'
import { IMAGE_CONFIG_PATH, IMAGE_GENERATE_PATH } from '../src/constants.js'

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

/**
 * A minimal cordis context face capturing what apply() touches. The inject
 * callback fires ONLY when every requested service can be provided (cordis
 * waits otherwise), and `withToolServices` decides whether the tools,
 * attachments and systemPrompt services exist in this fake host.
 */
function fakeHost(settings: { describe(): unknown[] }, options: { withToolServices?: boolean } = {}) {
  const listeners: Array<(ns: unknown) => void> = []
  const routes = new Map<string, (req: unknown, res: unknown) => Promise<void>>()
  const disposers: Array<() => void> = []
  const systemPromptNames: string[] = []
  const effect = (setup: () => () => void): void => {
    const disposer = setup()
    if (typeof disposer === 'function') {
      hostCleanups.push(disposer)
      disposers.push(disposer)
    }
  }
  // The tools registry the deferred injection registers into.
  const toolsRegistry = new Map<string, unknown>()
  const tools = {
    register(definition: { name: string } & Record<string, unknown>): () => void {
      if (toolsRegistry.has(definition.name)) throw new Error(`tool "${definition.name}" is already registered`)
      toolsRegistry.set(definition.name, definition)
      return () => { toolsRegistry.delete(definition.name) }
    },
  }
  const attachments = {
    async saveImage(input: { data: Uint8Array; mediaType: string; name?: string }) {
      return { attachmentId: `att-${input.data.length}`, mediaType: input.mediaType, bytes: input.data.length, width: 1, height: 1, ...(input.name === undefined ? {} : { name: input.name }) }
    },
    async readImage(ref: { attachmentId: string }) {
      void ref
      return { data: Uint8Array.from([9, 8, 7]), ref: { name: 'from-chat.png', mediaType: 'image/png' } }
    },
  }
  const systemPrompt = {
    context(contribution: { name: string }): () => void {
      systemPromptNames.push(contribution.name)
      return () => {}
    },
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
      if (options.withToolServices === true) {
        if (deps.includes('tools')) injected['tools'] = tools
        if (deps.includes('attachments')) injected['attachments'] = attachments
        if (deps.includes('systemPrompt')) injected['systemPrompt'] = systemPrompt
      }
      // Cordis waits for EVERY dep; a missing one means the callback never runs.
      if (Object.keys(injected).length < deps.length) return
      // The injected value is a Context: it carries effect.
      injected['effect'] = effect
      cb(injected)
    },
    effect,
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
    toolsRegistry,
    systemPromptNames,
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

  it('GET image-config answers the derived list plus the native-tool status block', async () => {
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
    // The tool block reports the native registration: this fake host carries
    // no tools service, so the deferred injection never ran and it reads
    // unregistered with a null name.
    expect(body['tool']).toMatchObject({ registered: false, name: null })
  })

  it('with tool services present, the native tool registers and the status follows it', async () => {
    upstreamUrl = await startUpstream()
    const settings = fakeSettings()
    const { ctx, routes, toolsRegistry, systemPromptNames } = fakeHost(settings, { withToolServices: true })
    const { apply } = await import('../src/index.js')
    apply(ctx)
    // The tool sits in the registry under its primary name, with the output
    // contract and the execute body the registry requires.
    expect([...toolsRegistry.keys()]).toEqual(['generate_image'])
    const definition = toolsRegistry.get('generate_image') as { output?: { schema?: unknown }; execute?: unknown; presentResult?: unknown }
    expect(typeof definition.execute).toBe('function')
    expect((definition.output as { schema?: unknown }).schema).toBeDefined()
    // The system-prompt hint registered beside it.
    expect(systemPromptNames).toContain('dsh-model-think-level:image-tool')
    // The status route reports the live registration.
    const handler = routes.get(IMAGE_CONFIG_PATH)!
    const { req, res } = reqRes('GET')
    await handler(req, res)
    const body = JSON.parse(res.body) as { tool?: { registered: boolean; name: string | null } }
    expect(body.tool).toMatchObject({ registered: true, name: 'generate_image' })
  })

  it('disposing the tool unregisters it and the status flips back', async () => {
    upstreamUrl = await startUpstream()
    const settings = fakeSettings()
    const { ctx, routes, toolsRegistry } = fakeHost(settings, { withToolServices: true })
    const { apply } = await import('../src/index.js')
    apply(ctx)
    expect(toolsRegistry.size).toBe(1)
    // Drain every disposer apply() handed out (the afterEach does the same).
    for (const cleanup of hostCleanups.splice(0)) cleanup()
    expect(toolsRegistry.size).toBe(0)
    const handler = routes.get(IMAGE_CONFIG_PATH)
    expect(handler).toBeUndefined() // the route went with it (same effect drain)
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
    const body = JSON.parse(res.body) as { ok: boolean; images?: readonly string[]; model?: string; error?: string }
    expect(body.ok).toBe(true)
    expect(body.model).toBe('openai/gpt-image-1')
    expect(body.images).toHaveLength(1)
    expect(existsSync(body.images![0]!)).toBe(true)
    // The config file's lastGoodParams stays untouched (no fallback ran).
    expect(readImageConfig(imageConfigFilePath(home)).models[0]!.lastGoodParams).toBeNull()
  })
})

void readFileSync
void writeFileSync
void realFs
void emptyIndex
