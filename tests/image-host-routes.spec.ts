/** apply()-level contracts for live image configuration, preferences and native entries. */

import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { imageConfigFilePath } from '../src/image/config.js'
import type { ImageToolValue } from '../src/image/tool.js'
import { IMAGE_CONFIG_PATH } from '../src/constants.js'

type HostCtx = Parameters<typeof import('../src/index.js').apply>[0]
type ImageTool = { execute(args: unknown, exec: { signal: AbortSignal }): Promise<ImageToolValue> }
type Command = { name: string; handler(invocation: unknown): Promise<unknown> }
type RequestRecord = { url: string; authorization: string | undefined; body: Record<string, unknown> }
type RuntimeConfig = {
  ok: boolean
  error?: string
  enabled?: boolean
  models?: Array<{ id: string; keyRef?: string; baseURL: string; params: { maxN: number }; lastGoodParams?: unknown }>
  defaultModel?: string | null
  defaults?: Record<string, unknown>
  outputDir?: string
  tool?: { registered: boolean; name: string | null }
}

let home = ''
let upstreamUrl = ''
const previousHome = process.env['DSH_HOME']
const hostCleanups: Array<() => void> = []
const quietConfig = { autofill: false, defaultGuard: false, uaOverride: false, bootRetryDelaysMs: [] }

beforeEach(() => {
  home = mkdtempSync(join(tmpdir(), 'bre-image-host-'))
  process.env['DSH_HOME'] = home
})

afterEach(() => {
  for (const cleanup of hostCleanups.splice(0)) cleanup()
  rmSync(home, { recursive: true, force: true })
  if (previousHome === undefined) delete process.env['DSH_HOME']
  else process.env['DSH_HOME'] = previousHome
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

function providers(url = upstreamUrl, modelId = 'gpt-image-1', keyRef = 'OPENAI_API_KEY') {
  return {
    openai: {
      displayName: 'OpenAI',
      api: 'openai-completions',
      baseURL: url,
      apiKeyEnv: keyRef,
      models: [{ id: modelId, name: modelId, inputImageGen: true }],
    },
  }
}

/** All transitions are deliberate live changes, without settings events. */
function liveSettings(initialValue: unknown = { providers: providers() }) {
  let value: unknown = initialValue
  let onDescribe: (() => void) | undefined
  return {
    describe: vi.fn(() => {
      onDescribe?.()
      if (value === 'unreadable') throw new Error('settings unavailable')
      return value === undefined ? [] : [{
        ns: 'llm-pi-ai', revision: 3, value,
        // Image consumers must use resolved value, not this stale user layer.
        user: { providers: {} },
      }]
    }),
    async update(): Promise<void> {},
    setValue(next: unknown): void { value = next },
    onDescribe(callback: () => void): void { onDescribe = callback },
  }
}

/** Cordis-shaped host: injection waits for all requested services. */
function fakeHost(settings: { describe(): unknown[] }, options: {
  withToolServices?: boolean
  primaryTaken?: boolean
  onReadImage?: () => void
} = {}) {
  const listeners: Array<(ns: unknown) => void> = []
  const routes = new Map<string, (req: unknown, res: unknown) => Promise<void>>()
  const systemPromptTexts = new Map<string, () => string>()
  const toolsRegistry = new Map<string, unknown>()
  const commandsRegistry = new Map<string, Command>()
  const foreignTool = { name: 'generate_image', owner: 'another-plugin' }
  if (options.primaryTaken) toolsRegistry.set('generate_image', foreignTool)
  const resolveCredential = vi.fn(async (ref: string) => ({
    value: ref === 'OPENAI_API_KEY' ? 'sk-test-key' : ref === 'NEXT_IMAGE_KEY' ? 'sk-test-next' : undefined,
  }))
  const effect = (setup: () => (() => void) | void): void => {
    const disposer = setup()
    if (typeof disposer === 'function') hostCleanups.push(disposer)
  }
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
    async readImage(_ref: { attachmentId: string }) {
      options.onReadImage?.()
      return { data: Uint8Array.from([9, 8, 7]), ref: { name: 'from-chat.png', mediaType: 'image/png' } }
    },
  }
  const systemPrompt = {
    context(contribution: { name: string; text: () => string }): () => void {
      systemPromptTexts.set(contribution.name, contribution.text)
      return () => { systemPromptTexts.delete(contribution.name) }
    },
  }
  const ctx = {
    settings,
    commands: {
      register(contribution: Command): () => void {
        commandsRegistry.set(contribution.name, contribution)
        return () => { commandsRegistry.delete(contribution.name) }
      },
    },
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
      if (options.withToolServices) {
        if (deps.includes('tools')) injected['tools'] = tools
        if (deps.includes('attachments')) injected['attachments'] = attachments
        if (deps.includes('systemPrompt')) injected['systemPrompt'] = systemPrompt
      }
      if (Object.keys(injected).length < deps.length) return
      injected['effect'] = effect
      cb(injected)
    },
    effect,
    on(event: string, cb: (ns: unknown) => void): void {
      if (event === 'settings/document-updated') listeners.push(cb)
    },
    get(name: string): unknown {
      return name === 'credentials' ? { resolve: resolveCredential } : undefined
    },
  } as unknown as HostCtx
  return {
    ctx, routes, toolsRegistry, commandsRegistry, systemPromptTexts, resolveCredential, foreignTool,
    emitUpdated: (ns: unknown) => { for (const listener of listeners) listener(ns) },
  }
}

/** Node HTTP request/response doubles for the same-origin config route. */
function reqRes(method: string, body?: unknown) {
  const res = {
    statusCode: 0,
    headers: {} as Record<string, string>,
    body: '',
    setHeader(name: string, value: string): void { res.headers[name] = value },
    end(text?: string): void { res.body = text ?? '' },
  }
  const chunks = body === undefined ? [] : [JSON.stringify(body)]
  const req = {
    method, url: '/', headers: { host: '127.0.0.1:1234' },
    [Symbol.asyncIterator]: () => {
      let index = 0
      return { next: async () => index < chunks.length ? { value: chunks[index++]!, done: false } : { value: undefined, done: true } }
    },
  }
  return { req, res }
}

/** Loopback only: capture requests and return tiny synthetic image bytes. */
async function startUpstream() {
  const { createServer } = await import('node:http')
  const calls: RequestRecord[] = []
  const server = createServer((req, res) => {
    let text = ''
    req.on('data', chunk => { text += chunk })
    req.on('end', () => {
      const body = req.headers['content-type']?.includes('application/json') ? JSON.parse(text) as Record<string, unknown> : { multipart: text }
      calls.push({ url: req.url ?? '', authorization: req.headers.authorization, body })
      res.setHeader('content-type', 'application/json')
      res.end(JSON.stringify({ data: [{ b64_json: Buffer.from([1, 2, 3, 4]).toString('base64') }] }))
    })
  })
  await new Promise<void>(resolve => { server.listen(0, '127.0.0.1', resolve) })
  hostCleanups.push(() => { server.close() })
  const address = server.address()
  if (typeof address !== 'object' || address === null) throw new Error('loopback upstream did not bind')
  return { url: `http://127.0.0.1:${address.port}/v1`, calls }
}

async function boot(settings = liveSettings(), options: Parameters<typeof fakeHost>[1] = { withToolServices: true }) {
  const host = fakeHost(settings, options)
  const { apply } = await import('../src/index.js')
  apply(host.ctx, quietConfig)
  return host
}

type Host = Awaited<ReturnType<typeof boot>>

async function request(host: Host, method = 'GET', body?: unknown) {
  const handler = host.routes.get(IMAGE_CONFIG_PATH)
  expect(handler).toBeDefined()
  const { req, res } = reqRes(method, body)
  await handler!(req, res)
  return { ...res, json: JSON.parse(res.body) as RuntimeConfig }
}

function hint(host: Host): string {
  const contribution = host.systemPromptTexts.get('dsh-model-think-level:image-tool')
  expect(contribution).toBeDefined()
  return contribution!()
}

function tool(host: Host, name = 'generate_image'): ImageTool {
  expect(host.toolsRegistry.has(name)).toBe(true)
  return host.toolsRegistry.get(name) as ImageTool
}

function execute(definition: ImageTool, args: Record<string, unknown> = {}) {
  return definition.execute({ prompt: 'blue identity photo', ...args }, { signal: new AbortController().signal })
}

function writeFixture(document: unknown): void {
  const file = imageConfigFilePath(home)
  mkdirSync(dirname(file), { recursive: true })
  writeFileSync(file, `${JSON.stringify(document, null, 2)}\n`)
}

function stored(): Record<string, unknown> {
  return JSON.parse(readFileSync(imageConfigFilePath(home), 'utf8')) as Record<string, unknown>
}

function fileSnapshot() {
  const file = imageConfigFilePath(home)
  return { text: readFileSync(file, 'utf8'), mtime: statSync(file, { bigint: true }).mtimeNs }
}

function legacyConfig(baseURL = 'http://127.0.0.1:1/stale', keyRef = 'STALE_KEY') {
  return {
    version: 2,
    enabled: true,
    syncedAt: '2026-01-01T00:00:00.000Z',
    defaultModel: 'openai/gpt-image-1',
    defaults: { size: '1024x1024', quality: 'high', n: 1, timeoutMs: 600_000 },
    outputDir: 'legacy-images',
    models: [{
      id: 'openai/gpt-image-1', route: 'openai', modelId: 'gpt-image-1', label: 'stale image model',
      api: 'images', baseURL, keyRef,
      endpoint: { kind: 'images', status: 'ok', checkedAt: '2026-01-01T00:00:00.000Z' },
      params: { sizes: ['1024x1024'], qualities: ['high'], maxN: 4, responseFormat: 'b64_json' },
      lastGoodParams: { sizes: ['1024x1024'], qualities: ['high'], maxN: 4, responseFormat: 'none' },
    }],
  }
}

describe('apply() live image configuration', () => {
  it('derives GET, hint and tool metadata from resolved settings without creating a config file', async () => {
    const upstream = await startUpstream()
    upstreamUrl = upstream.url
    const settings = liveSettings()
    const host = await boot(settings)
    const file = imageConfigFilePath(home)
    expect(existsSync(file)).toBe(false)
    const reads = settings.describe.mock.calls.length
    for (let index = 0; index < 3; index += 1) {
      const response = await request(host)
      expect(response.statusCode).toBe(200)
      expect(response.json).toMatchObject({ ok: true, tool: { registered: true, name: 'generate_image' } })
      expect(response.json.models).toHaveLength(1)
      expect(response.json.models![0]).toMatchObject({ id: 'openai/gpt-image-1', baseURL: upstream.url, keyRef: 'OPENAI_API_KEY', params: { maxN: 4 } })
      expect(hint(host)).toContain('openai/gpt-image-1')
    }
    expect(settings.describe.mock.calls.length).toBeGreaterThanOrEqual(reads + 6)
    host.emitUpdated('llm-pi-ai')
    expect(existsSync(file)).toBe(false)
    expect(upstream.calls).toEqual([])
    expect(host.resolveCredential).not.toHaveBeenCalled()
    const definition = tool(host) as ImageTool & { output?: { schema?: unknown } }
    expect(definition.output?.schema).toBeDefined()
  })

  it.each([
    ['missing namespace', undefined],
    ['unreadable settings', 'unreadable'],
    ['null resolved value', null],
    ['array resolved value', []],
    ['malformed resolved value', 'malformed'],
  ])('reports %s consistently, then recovers the first execute without an event', async (_label, initialValue) => {
    const upstream = await startUpstream()
    upstreamUrl = upstream.url
    const settings = liveSettings()
    settings.setValue(initialValue)
    const host = await boot(settings)
    const definition = tool(host)
    const response = await request(host)
    expect(response.statusCode).toBe(503)
    expect(response.json).toMatchObject({ ok: false, error: expect.stringContaining('生图配置') })
    expect(response.json.models ?? []).toEqual([])
    expect(hint(host)).toContain('生图配置')
    await expect(execute(definition)).rejects.toThrow('生图配置')
    expect(upstream.calls).toEqual([])
    expect(host.resolveCredential).not.toHaveBeenCalled()
    expect(existsSync(imageConfigFilePath(home))).toBe(false)
    settings.setValue({ providers: providers() })
    // No GET, hint, settings event or plugin reload between readiness and execute.
    const result = await execute(definition)
    expect(result).toMatchObject({ model: 'openai/gpt-image-1', images: [expect.any(Object)] })
    expect(upstream.calls).toHaveLength(1)
    expect((await request(host)).json.models!.map(model => model.id)).toEqual(['openai/gpt-image-1'])
    expect(hint(host)).toContain('openai/gpt-image-1')
  })

  it.each([
    ['empty resolved section', {}],
    ['empty providers', { providers: {} }],
    ['provider without models', { providers: { openai: { api: 'openai-completions' } } }],
    ['explicitly empty models', { providers: { openai: { models: [] } } }],
    ['unmarked model', { providers: { openai: { models: [{ id: 'gpt-image-1' }] } } }],
  ])('treats %s as a ready empty list and sees later models without an event', async (_label, value) => {
    const upstream = await startUpstream()
    upstreamUrl = upstream.url
    const settings = liveSettings(value)
    const host = await boot(settings)
    const response = await request(host)
    expect(response.statusCode).toBe(200)
    expect(response.json).toMatchObject({ ok: true, models: [] })
    expect(hint(host)).toContain('生图配置')
    await expect(execute(tool(host))).rejects.toThrow('没有已配置的生图模型')
    expect(upstream.calls).toEqual([])
    expect(existsSync(imageConfigFilePath(home))).toBe(false)
    settings.setValue({ providers: providers() })
    const result = await execute(tool(host))
    expect(result.model).toBe('openai/gpt-image-1')
    expect(result.images).toHaveLength(1)
  })

  it.each([
    ['empty section', {}],
    ['deleted providers', { providers: {} }],
    ['provider without models', { providers: { openai: { api: 'openai-completions' } } }],
    ['deleted models', { providers: { openai: { models: [] } } }],
    ['removed image marker', { providers: { openai: { models: [{ id: 'gpt-image-1', inputImageGen: false }] } } }],
  ])('honors real %s immediately and retains the selected default preference', async (_label, value) => {
    const upstream = await startUpstream()
    upstreamUrl = upstream.url
    const settings = liveSettings()
    const host = await boot(settings)
    expect((await request(host, 'POST', { defaultModel: 'openai/gpt-image-1' })).json.ok).toBe(true)
    const before = fileSnapshot()
    expect((await request(host)).json.models).toHaveLength(1)
    settings.setValue(value)
    const response = await request(host)
    expect(response.statusCode).toBe(200)
    expect(response.json).toMatchObject({ ok: true, models: [], defaultModel: 'openai/gpt-image-1' })
    expect(hint(host)).not.toContain('默认模型 openai/gpt-image-1')
    await expect(execute(tool(host))).rejects.toThrow('没有已配置的生图模型')
    expect(upstream.calls).toEqual([])
    expect(stored()['defaultModel']).toBe('openai/gpt-image-1')
    expect(fileSnapshot()).toEqual(before)
    settings.setValue({ providers: providers() })
    expect((await request(host)).json.defaultModel).toBe('openai/gpt-image-1')
    expect(hint(host)).toContain('默认模型 openai/gpt-image-1')
  })

  it('reads v2 preferences and diagnostics without authorizing stale rows or rewriting the file', async () => {
    const upstream = await startUpstream()
    upstreamUrl = upstream.url
    writeFixture(legacyConfig(upstream.url, 'OPENAI_API_KEY'))
    const before = fileSnapshot()
    const settings = liveSettings({ providers: {} })
    const host = await boot(settings)
    const response = await request(host)
    expect(response.statusCode).toBe(200)
    expect(response.json).toMatchObject({
      ok: true, models: [], defaultModel: 'openai/gpt-image-1', outputDir: 'legacy-images',
      defaults: { quality: 'high', timeoutMs: 600_000 },
    })
    expect(hint(host)).not.toContain('默认模型 openai/gpt-image-1')
    await expect(execute(tool(host))).rejects.toThrow('没有已配置的生图模型')
    expect(host.resolveCredential).not.toHaveBeenCalled()
    expect(fileSnapshot()).toEqual(before)
    settings.setValue({ providers: providers() })
    const live = await request(host)
    expect(live.json.models![0]).toMatchObject({ baseURL: upstream.url, keyRef: 'OPENAI_API_KEY', lastGoodParams: { responseFormat: 'none' } })
    expect(fileSnapshot()).toEqual(before)
    // Diagnostics belong to the connection that observed them, not just an id.
    settings.setValue({ providers: providers(upstream.url, 'gpt-image-1', 'NEXT_IMAGE_KEY') })
    expect((await request(host)).json.models![0]!.lastGoodParams).toBeNull()
    expect(fileSnapshot()).toEqual(before)
    expect((await request(host, 'POST', { defaults: { quality: 'medium' } })).json.ok).toBe(true)
    const saved = stored()
    expect(saved).toMatchObject({ version: 3, enabled: true, defaultModel: 'openai/gpt-image-1', outputDir: 'legacy-images', defaults: { quality: 'medium', timeoutMs: 600_000 } })
    expect(saved['models']).toBeUndefined()
    expect(JSON.stringify(saved['observations'])).toContain('none')
    expect(JSON.stringify(saved)).not.toMatch(/baseURL|keyRef|stale image model/)
    expect(upstream.calls).toEqual([])
  })

  it('uses changed live baseURL, key reference and model list immediately in GET, hint and execute', async () => {
    const first = await startUpstream()
    const next = await startUpstream()
    upstreamUrl = first.url
    const settings = liveSettings()
    const host = await boot(settings)
    const definition = tool(host)
    expect((await execute(definition)).model).toBe('openai/gpt-image-1')
    settings.setValue({ providers: providers(next.url, 'gpt-image-2', 'NEXT_IMAGE_KEY') })
    const response = await request(host)
    expect(response.json.models).toHaveLength(1)
    expect(response.json.models![0]).toMatchObject({ id: 'openai/gpt-image-2', baseURL: next.url, keyRef: 'NEXT_IMAGE_KEY' })
    expect(hint(host)).toContain('openai/gpt-image-2')
    expect(hint(host)).not.toContain('openai/gpt-image-1')
    const result = await execute(definition)
    expect(result.model).toBe('openai/gpt-image-2')
    expect(first.calls).toHaveLength(1)
    expect(next.calls).toHaveLength(1)
    expect(next.calls[0]).toMatchObject({ url: '/v1/images/generations', authorization: 'Bearer sk-test-next', body: { model: 'gpt-image-2' } })
    expect(host.resolveCredential).toHaveBeenLastCalledWith('NEXT_IMAGE_KEY')
    const saved = stored()
    expect(saved['version']).toBe(3)
    expect(saved['models']).toBeUndefined()
    expect(JSON.stringify(saved)).not.toMatch(/baseURL|apiKeyEnv|keyRef|sk-test/)
  })

  it('refuses an unreadable live source even after successful generation created diagnostics', async () => {
    const upstream = await startUpstream()
    upstreamUrl = upstream.url
    const settings = liveSettings()
    const host = await boot(settings)
    const definition = tool(host)
    await execute(definition)
    const before = fileSnapshot()
    const keyReads = host.resolveCredential.mock.calls.length
    settings.setValue('unreadable')
    const response = await request(host)
    expect(response.statusCode).toBe(503)
    expect(response.json).toMatchObject({ ok: false, error: expect.stringContaining('生图配置') })
    expect(response.json.models ?? []).toEqual([])
    expect(hint(host)).toContain('生图配置')
    expect(hint(host)).not.toContain('默认模型 openai/gpt-image-1')
    await expect(execute(definition)).rejects.toThrow('生图配置')
    expect(upstream.calls).toHaveLength(1)
    expect(host.resolveCredential).toHaveBeenCalledTimes(keyReads)
    expect(fileSnapshot()).toEqual(before)
  })

  it('never rewrites saved v3 preferences on startup, GET, hint or settings events', async () => {
    writeFixture({ version: 3, enabled: true, defaultModel: 'temporarily-absent/model', defaults: { size: '1024x1024', quality: 'medium', n: 1, timeoutMs: 600_000 }, outputDir: 'chosen-output', observations: {} })
    const before = fileSnapshot()
    const settings = liveSettings()
    const host = await boot(settings)
    for (let index = 0; index < 3; index += 1) {
      expect((await request(host)).json).toMatchObject({ ok: true, defaultModel: 'temporarily-absent/model', outputDir: 'chosen-output', defaults: { quality: 'medium' } })
      hint(host)
      host.emitUpdated('llm-pi-ai')
    }
    expect(fileSnapshot()).toEqual(before)
  })

  it('handles a revision-driven document-updated emitted synchronously by describe', async () => {
    const settings = liveSettings()
    const host = await boot(settings)
    let emitted = false
    let emissions = 0
    settings.onDescribe(() => {
      // The host marks a revision observed before it emits. A nested describe
      // of that same revision must not invent another update event.
      if (emitted) return
      emitted = true
      emissions += 1
      host.emitUpdated('llm-pi-ai')
    })
    expect((await request(host)).statusCode).toBe(200)
    expect(hint(host)).toContain('openai/gpt-image-1')
    expect((await request(host)).statusCode).toBe(200)
    expect(emissions).toBe(1)
    expect(existsSync(imageConfigFilePath(home))).toBe(false)
  })

  it('uses one configuration snapshot through asynchronous attachment reads and generation', async () => {
    const first = await startUpstream()
    const next = await startUpstream()
    upstreamUrl = first.url
    const settings = liveSettings()
    const host = await boot(settings, {
      withToolServices: true,
      onReadImage: () => { settings.setValue({ providers: providers(next.url, 'gpt-image-2', 'NEXT_IMAGE_KEY') }) },
    })
    const result = await execute(tool(host), { reference_attachments: ['att-reference'] })
    expect(result.model).toBe('openai/gpt-image-1')
    expect(first.calls).toHaveLength(1)
    expect(first.calls[0]!.authorization).toBe('Bearer sk-test-key')
    expect(next.calls).toEqual([])
    expect((await execute(tool(host))).model).toBe('openai/gpt-image-2')
    expect(next.calls).toHaveLength(1)
  })

  it('uses fresh live model IDs and generation configuration in the slash command', async () => {
    const upstream = await startUpstream()
    upstreamUrl = upstream.url
    const settings = liveSettings()
    const host = await boot(settings)
    const command = host.commandsRegistry.get('生图')!
    expect(command).toBeDefined()
    settings.setValue({ providers: providers(upstream.url, 'gpt-image-2') })
    const answer = await command.handler({ args: 'openai/gpt-image-2 blue photo' })
    expect(answer).toMatchObject({ ok: true, model: 'openai/gpt-image-2' })
    expect(upstream.calls[0]!.body).toMatchObject({ model: 'gpt-image-2', prompt: 'blue photo' })
    settings.setValue('unreadable')
    const failure = await command.handler({ args: 'blue photo' })
    expect(failure).toMatchObject({ ok: false, error: expect.stringContaining('生图配置') })
    expect(upstream.calls).toHaveLength(1)
  })

  it('reports missing native services honestly while still serving live model configuration', async () => {
    const host = await boot(liveSettings(), { withToolServices: false })
    expect((await request(host)).json).toMatchObject({ ok: true, models: [expect.objectContaining({ id: 'openai/gpt-image-1' })], tool: { registered: false, name: null } })
    expect(existsSync(imageConfigFilePath(home))).toBe(false)
  })

  it('advertises the collision fallback name and leaves the other plugin tool intact', async () => {
    const upstream = await startUpstream()
    upstreamUrl = upstream.url
    const host = await boot(liveSettings(), { withToolServices: true, primaryTaken: true })
    expect(host.toolsRegistry.get('generate_image')).toBe(host.foreignTool)
    expect((await request(host)).json.tool).toMatchObject({ registered: true, name: 'dsh_image_generate' })
    expect(hint(host)).toMatch(/调用\s+dsh_image_generate\s+工具/)
    expect(hint(host)).not.toMatch(/调用\s+generate_image\s+工具/)
    expect((await execute(tool(host, 'dsh_image_generate'))).model).toBe('openai/gpt-image-1')
    await request(host, 'POST', { enabled: false })
    expect(host.toolsRegistry.get('generate_image')).toBe(host.foreignTool)
    expect(host.toolsRegistry.has('dsh_image_generate')).toBe(false)
  })

  it('prioritizes the off switch over source failures and permits POST recovery', async () => {
    const upstream = await startUpstream()
    upstreamUrl = upstream.url
    const settings = liveSettings()
    const host = await boot(settings)
    const staleDefinition = tool(host)
    settings.setValue('unreadable')
    expect((await request(host, 'POST', { enabled: false, defaultModel: 'openai/gpt-image-1' })).json.ok).toBe(true)
    expect(host.toolsRegistry.size).toBe(0)
    await expect(execute(staleDefinition)).rejects.toThrow('生图服务已关闭')
    expect(host.resolveCredential).not.toHaveBeenCalled()
    expect(upstream.calls).toEqual([])
    expect(stored()).toMatchObject({ version: 3, enabled: false, defaultModel: 'openai/gpt-image-1' })
    expect(stored()['models']).toBeUndefined()
    const disabled = await request(host)
    expect(disabled.json.enabled).toBe(false)
    expect(disabled.json.tool).toMatchObject({ registered: false, name: null })
    expect(hint(host)).not.toMatch(/调用\s+(?:generate_image|dsh_image_generate)\s+工具/)
    expect((await request(host, 'POST', { enabled: true })).json.ok).toBe(true)
    expect(host.toolsRegistry.has('generate_image')).toBe(true)
    await expect(execute(tool(host))).rejects.toThrow('生图配置')
    settings.setValue({ providers: providers() })
    expect((await execute(tool(host))).model).toBe('openai/gpt-image-1')
    expect((await request(host)).json).toMatchObject({ enabled: true, tool: { registered: true, name: 'generate_image' } })
  })

  it('disposes registered tools, hints and HTTP routes with the plugin scope', async () => {
    const host = await boot()
    expect(host.toolsRegistry.size).toBe(1)
    expect(host.systemPromptTexts.size).toBe(1)
    for (const cleanup of hostCleanups.splice(0)) cleanup()
    expect(host.toolsRegistry.size).toBe(0)
    expect(host.systemPromptTexts.size).toBe(0)
    expect(host.routes.has(IMAGE_CONFIG_PATH)).toBe(false)
  })
})
