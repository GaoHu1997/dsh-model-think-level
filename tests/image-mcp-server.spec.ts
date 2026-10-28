/**
 * The built image MCP server, driven as a REAL subprocess over stdio — the
 * exact shape dsh-mcp-client will run. The bundle is built on the fly (esbuild
 * is a devDependency), an upstream HTTP server stands in for the provider, and
 * a credentials file with a `refs` table supplies the key.
 *
 * Covered: the four protocol methods, tool argument validation, the missing-
 * config guidance, model defaulting, per-call config re-reads, and the rule
 * that ONLY the `refs` table is trusted (a same-named `records` entry must
 * not answer).
 */

import { build } from 'esbuild'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync, readFileSync, existsSync } from 'node:fs'
import { createServer, type Server } from 'node:http'
import { spawn } from 'node:child_process'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// Every case here spawns a real node process and talks JSON-RPC over stdio.
// Alone that costs 1–4 s; when the full suite runs four workers deep the spawn
// plus the handshake can cross the 5 s default, so this file raises its own
// ceiling rather than reporting a phantom protocol failure.
vi.setConfig({ testTimeout: 30_000 })

let workspace = ''
let upstream: Server | null = null
let upstreamRequests: { url: string; auth: string | null; body: string }[] = []
let upstreamAnswer: { status: number; body: Record<string, unknown> } = { status: 200, body: { data: [{ b64_json: Buffer.from([1, 2, 3, 4]).toString('base64') }] } }
let child: ReturnType<typeof spawn> | null = null

beforeEach(() => {
  workspace = mkdtempSync(join(tmpdir(), 'bre-image-mcp-'))
  upstreamRequests = []
  upstreamAnswer = { status: 200, body: { data: [{ b64_json: Buffer.from([1, 2, 3, 4]).toString('base64') }] } }
})

afterEach(async () => {
  child?.kill()
  child = null
  await new Promise(resolve => { upstream ? upstream.close(() => resolve(undefined)) : resolve(undefined) })
  upstream = null
  rmSync(workspace, { recursive: true, force: true })
})

/** Build the zero-dependency bundle once per test (fast: the source is small). */
async function buildServer(): Promise<string> {
  const outfile = join(workspace, 'image-mcp.mjs')
  await build({
    entryPoints: ['src/image/mcp-server.ts'],
    bundle: true,
    format: 'esm',
    platform: 'node',
    target: 'es2022',
    external: ['node:*'],
    outfile,
    logLevel: 'silent',
  })
  return outfile
}

/** Start the stand-in provider, answering every images call. */
async function startUpstream(): Promise<number> {
  upstreamAnswer = { status: 200, body: { data: [{ b64_json: Buffer.from([1, 2, 3, 4]).toString('base64') }] } }
  const server = createServer((req, res) => {
    let text = ''
    req.on('data', chunk => { text += chunk })
    req.on('end', () => {
      upstreamRequests.push({ url: req.url ?? '', auth: req.headers.authorization ?? null, body: text })
      res.statusCode = upstreamAnswer.status
      res.setHeader('content-type', 'application/json')
      res.end(JSON.stringify(upstreamAnswer.body))
    })
  })
  await new Promise<void>(resolve => { server.listen(0, '127.0.0.1', resolve) })
  upstream = server
  const address = server.address()
  return typeof address === 'object' && address !== null ? address.port : 0
}

/** The standard fixture: one config file, one credentials file with refs. */
function writeFixture(port: number, options: { key: string; recordsKey?: string } = { key: 'sk-refs-value' }): string {
  const configPath = join(workspace, 'dsh-model-think-level', 'image.json')
  mkdirSync(join(workspace, 'dsh-model-think-level'), { recursive: true })
  writeFileSync(configPath, JSON.stringify({
    version: 2,
    syncedAt: new Date().toISOString(),
    defaultModel: 'openai/gpt-image-1',
    defaults: { size: '1024x1024', quality: 'high', n: 1, timeoutMs: 10_000 },
    outputDir: 'out',
    mcp: { serverName: 'dsh-image', nodePath: '', diagnostics: { lastCheckAt: null, ok: false, error: null } },
    models: [{
      id: 'openai/gpt-image-1',
      route: 'openai',
      modelId: 'gpt-image-1',
      label: 'GPT-Image-1',
      api: 'images',
      baseURL: `http://127.0.0.1:${port}/v1`,
      keyRef: 'OPENAI_API_KEY',
      endpoint: { kind: 'images', status: 'unverified', checkedAt: null },
      params: { sizes: ['1024x1024'], qualities: ['high'], maxN: 2, responseFormat: 'b64_json' },
      lastGoodParams: null,
    }],
  }), 'utf8')
  const refs = [`version: 1`, `refs:`, `  OPENAI_API_KEY: ${options.key}`]
  if (options.recordsKey !== undefined) {
    // The decoy: a same-named value in the records table (a different shape
    // the parser must never read).
    refs.push(`records:`, `  - kind: grant`, `    payload:`, `      secret: ${options.recordsKey}`)
  }
  writeFileSync(join(workspace, '.credentials.yaml'), `${refs.join('\n')}\n`, 'utf8')
  return configPath
}

/** One JSON-RPC round trip over the subprocess's stdio. */
function rpc(serverFile: string, env: Record<string, string>, message: Record<string, unknown>): Promise<Record<string, unknown>> {
  return new Promise((resolve, reject) => {
    const childProcess = spawn(process.execPath, [serverFile], { stdio: ['pipe', 'pipe', 'pipe'], env: { ...process.env, ...env } })
    child = childProcess
    let buffered = ''
    const timer = setTimeout(() => { childProcess.kill(); reject(new Error(`rpc timeout: ${buffered.slice(0, 400)}`)) }, 15_000)
    childProcess.stdout!.on('data', (chunk: Buffer) => {
      buffered += chunk.toString('utf8')
      const newline = buffered.indexOf('\n')
      if (newline === -1) return
      clearTimeout(timer)
      try {
        resolve(JSON.parse(buffered.slice(0, newline)) as Record<string, unknown>)
      } catch (error) {
        reject(error)
      } finally {
        childProcess.kill()
      }
    })
    childProcess.on('error', error => { clearTimeout(timer); reject(error) })
    childProcess.stdin!.write(`${JSON.stringify(message)}\n`)
  })
}

const INIT = {
  jsonrpc: '2.0',
  id: 0,
  method: 'initialize',
  params: { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'test', version: '1' } },
}

describe('image MCP server (subprocess over stdio)', () => {
  it('answers initialize with the fixed server info and protocol version', async () => {
    const serverFile = await buildServer()
    const reply = await rpc(serverFile, {}, INIT)
    expect(reply['id']).toBe(0)
    const result = reply['result'] as Record<string, unknown>
    expect(result['protocolVersion']).toBe('2025-06-18')
    expect(result['serverInfo']).toMatchObject({ name: 'dsh-image', version: '1' })
  })

  it('answers ping with an empty result', async () => {
    const serverFile = await buildServer()
    const reply = await rpc(serverFile, {}, { jsonrpc: '2.0', id: 7, method: 'ping' })
    expect(reply['id']).toBe(7)
    expect(reply['result']).toEqual({})
  })

  it('lists exactly one tool: generate_image, with prompt required', async () => {
    const serverFile = await buildServer()
    const reply = await rpc(serverFile, {}, { jsonrpc: '2.0', id: 1, method: 'tools/list' })
    const tools = (reply['result'] as Record<string, unknown>)['tools'] as Record<string, unknown>[]
    expect(tools).toHaveLength(1)
    expect(tools[0]!['name']).toBe('generate_image')
    expect(tools[0]!['inputSchema']).toMatchObject({ required: ['prompt'] })
  })

  it('rejects an unknown method and an unknown tool', async () => {
    const serverFile = await buildServer()
    const badMethod = await rpc(serverFile, {}, { jsonrpc: '2.0', id: 1, method: 'prompts/list' })
    expect((badMethod['error'] as Record<string, unknown>)['code']).toBe(-32601)
    const badTool = await rpc(serverFile, {}, { jsonrpc: '2.0', id: 2, method: 'tools/call', params: { name: 'other', arguments: {} } })
    expect((badTool['error'] as Record<string, unknown>)['code']).toBe(-32602)
  })

  it('an empty prompt is an isError, before any config is read', async () => {
    const serverFile = await buildServer()
    const reply = await rpc(serverFile, {}, { jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'generate_image', arguments: { prompt: '   ' } } })
    const result = reply['result'] as Record<string, unknown>
    expect(result['isError']).toBe(true)
    expect((result['content'] as { text: string }[])[0]!.text).toMatch(/prompt/)
  })

  it('a missing config file is an isError with the save-once guidance', async () => {
    const serverFile = await buildServer()
    const reply = await rpc(serverFile, { DSH_IMAGE_CONFIG: join(workspace, 'absent', 'image.json') }, {
      jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'generate_image', arguments: { prompt: 'a cat' } },
    })
    const result = reply['result'] as Record<string, unknown>
    expect(result['isError']).toBe(true)
    expect((result['content'] as { text: string }[])[0]!.text).toMatch(/没有已配置的生图模型/)
  })

  it('generates end to end: default model, the refs-table key, and the image block back', async () => {
    const serverFile = await buildServer()
    const port = await startUpstream()
    const configPath = writeFixture(port, { key: 'sk-refs-value' })
    const reply = await rpc(serverFile, { DSH_IMAGE_CONFIG: configPath, DSH_HOME: workspace }, {
      jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'generate_image', arguments: { prompt: 'a red apple' } },
    })
    const result = reply['result'] as Record<string, unknown>
    expect(result['isError']).toBeUndefined()
    const content = result['content'] as { type: string; text?: string; data?: string; mimeType?: string }[]
    const image = content.find(block => block.type === 'image')
    expect(image).toBeDefined()
    expect(image!.mimeType).toBe('image/png')
    const text = content.find(block => block.type === 'text')!.text!
    expect(text).toMatch(/a-red-apple.*\.png/)
    // The upstream saw the REFS value on the wire, as a bearer.
    expect(upstreamRequests).toHaveLength(1)
    expect(upstreamRequests[0]!.url).toBe('/v1/images/generations')
    expect(upstreamRequests[0]!.auth).toBe('Bearer sk-refs-value')
    const body = JSON.parse(upstreamRequests[0]!.body) as Record<string, unknown>
    expect(body['model']).toBe('gpt-image-1')
    // And the file exists on disk under the config's outputDir. The regex
    // grabs an ABSOLUTE path only (drive letter or leading slash), so the
    // 「已生成：」 prefix never rides along.
    const saved = /([A-Za-z]:\\[^\s]+\.png|\/[^\s]+\.png)/.exec(text)![1]!
    expect(existsSync(saved)).toBe(true)
  })

  it('a same-named records entry never answers: only refs is trusted', async () => {
    const serverFile = await buildServer()
    const port = await startUpstream()
    const configPath = writeFixture(port, { key: 'sk-refs-value', recordsKey: 'sk-records-decoy' })
    await rpc(serverFile, { DSH_IMAGE_CONFIG: configPath, DSH_HOME: workspace }, {
      jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'generate_image', arguments: { prompt: 'x' } },
    })
    expect(upstreamRequests[0]!.auth).toBe('Bearer sk-refs-value')
  })

  it('re-reads the config on EVERY call: a moved baseURL reaches the next call', async () => {
    const serverFile = await buildServer()
    const port = await startUpstream()
    const configPath = writeFixture(port, { key: 'sk-refs-value' })
    const call = (): Promise<Record<string, unknown>> => rpc(serverFile, { DSH_IMAGE_CONFIG: configPath, DSH_HOME: workspace }, {
      jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'generate_image', arguments: { prompt: 'x' } },
    })
    await call()
    expect(upstreamRequests[0]!.url).toBe('/v1/images/generations')
    // Move the endpoint; the same server process must follow.
    const config = JSON.parse(readFileSync(configPath, 'utf8')) as { models: { baseURL: string }[] }
    config.models[0]!.baseURL = `http://127.0.0.1:${port}/v2`
    writeFileSync(configPath, JSON.stringify(config), 'utf8')
    await call()
    expect(upstreamRequests[1]!.url).toBe('/v2/images/generations')
  })

  it('the `path` argument lands the file exactly (and dirs receive the slug naming)', async () => {
    const serverFile = await buildServer()
    const port = await startUpstream()
    const configPath = writeFixture(port, { key: 'sk-refs-value' })
    const custom = join(workspace, 'album', 'custom.png')
    const reply = await rpc(serverFile, { DSH_IMAGE_CONFIG: configPath, DSH_HOME: workspace }, {
      jsonrpc: '2.0', id: 1, method: 'tools/call',
      params: { name: 'generate_image', arguments: { prompt: 'x', path: custom } },
    })
    const result = reply['result'] as Record<string, unknown>
    expect(result['isError']).toBeUndefined()
    const text = (result['content'] as { type: string; text?: string }[]).find(block => block.type === 'text')!.text!
    expect(text).toContain(custom)
    expect(existsSync(custom)).toBe(true)
    // A directory `path` receives the slug-timestamp naming inside it.
    const dir = join(workspace, 'album2')
    const replyDir = await rpc(serverFile, { DSH_IMAGE_CONFIG: configPath, DSH_HOME: workspace }, {
      jsonrpc: '2.0', id: 1, method: 'tools/call',
      params: { name: 'generate_image', arguments: { prompt: 'a red apple', path: dir } },
    })
    const textDir = ((replyDir['result'] as Record<string, unknown>)['content'] as { type: string; text?: string }[])
      .find(block => block.type === 'text')!.text!
    expect(textDir).toMatch(/album2.*a-red-apple-\d+\.png/)
  })

  it('n beyond the ability table is an isError naming the allowed values', async () => {
    const serverFile = await buildServer()
    const port = await startUpstream()
    const configPath = writeFixture(port, { key: 'sk-refs-value' })
    const reply = await rpc(serverFile, { DSH_IMAGE_CONFIG: configPath, DSH_HOME: workspace }, {
      jsonrpc: '2.0', id: 1, method: 'tools/call',
      params: { name: 'generate_image', arguments: { prompt: 'x', n: 9 } },
    })
    const result = reply['result'] as Record<string, unknown>
    expect(result['isError']).toBe(true)
    expect((result['content'] as { text: string }[])[0]!.text).toMatch(/n 超过/)
    expect(upstreamRequests).toHaveLength(0)
  })

  it('an upstream failure surfaces as an isError with the sanitized, classified text', async () => {
    const serverFile = await buildServer()
    const port = await startUpstream()
    const configPath = writeFixture(port, { key: 'sk-refs-value' })
    upstreamAnswer = { status: 403, body: { error: { message: `permission_denied (key sk-refs-value)` } } }
    const reply = await rpc(serverFile, { DSH_IMAGE_CONFIG: configPath, DSH_HOME: workspace }, {
      jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'generate_image', arguments: { prompt: 'x' } },
    })
    const result = reply['result'] as Record<string, unknown>
    expect(result['isError']).toBe(true)
    const text = (result['content'] as { text: string }[])[0]!.text
    expect(text).toMatch(/图片接口专用/)
    expect(text).not.toContain('sk-refs-value')
  })
})
