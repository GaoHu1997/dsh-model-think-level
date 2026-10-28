/**
 * The image MCP server: a zero-dependency stdio JSON-RPC server exposing ONE
 * tool, `generate_image` (wire name `mcp__dsh-image__generate_image`).
 *
 * Built to `lib/image-mcp.mjs` by `scripts/build-image-mcp.mjs` — the dsh-mcp
 * client spawns it with the runtime node, so the bundle must inline everything
 * (it may import node builtins; npm packages stay out).
 *
 * The subprocess holds no host services: the config comes from
 * `DSH_IMAGE_CONFIG` (carried verbatim by the install's explicit `env:`), the
 * key values come from the credentials file's `refs` table, and the file is
 * RE-READ on every call — a baseURL or key edited on the Models page reaches
 * the next generation with no restart.
 *
 * Protocol: newline-delimited JSON-RPC 2.0; `initialize` / `ping` /
 * `tools/list` / `tools/call`; notifications (no id) are acked by silence.
 *
 * @module dsh-model-think-level/image/mcp-server
 */

import { readFileSync, writeFileSync, mkdirSync, renameSync, unlinkSync } from 'node:fs'
import { createInterface } from 'node:readline'
import { IMAGE_MCP_SERVER_NAME, IMAGE_CONFIG_FILE } from '../constants.js'
import { harnessHome } from '../key-index.js'
import {
  readImageConfig,
  resolveImageModel,
  updateImageConfig,
  type ImageConfig,
} from './config.js'
import { readCredentialRefs } from './credential-refs.js'
import { credentialsFilePath } from './mcp-install.js'
import {
  GenerateError,
  generateImage,
  type GenerateResult,
} from './generate.js'
import { join } from 'node:path'

/** The config path the server serves (one read per call, never cached). */
function configPath(): string {
  const configured = process.env['DSH_IMAGE_CONFIG']
  if (typeof configured === 'string' && configured.length > 0) return configured
  return join(harnessHome(), 'dsh-model-think-level', IMAGE_CONFIG_FILE)
}

/** The credentials refs table, read fresh (a rotated key reaches the next call). */
function resolveKey(ref: string): Promise<string | undefined> {
  const refs = readCredentialRefs(credentialsFilePath())
  const value = refs[ref]
  return Promise.resolve(typeof value === 'string' && value.length > 0 ? value : undefined)
}

/** Persist a fallback's params into the config file (per-model override). */
function persistLastGood(modelId: string, params: ImageConfig['models'][number]['lastGoodParams']): void {
  try {
    updateImageConfig(document => ({
      ...document,
      models: document.models.map(model =>
        model.id === modelId
          ? params === null
            ? { ...model, endpoint: { ...model.endpoint, status: 'unsupported' } }
            : { ...model, lastGoodParams: params }
          : model),
    }), configPath())
  } catch {
    // A diagnostics write must never fail a generation that already succeeded.
  }
}

const generateDeps = {
  config: () => readImageConfig(configPath()),
  resolveKey,
  send: ((input, init) => fetch(input, init)) as typeof globalThis.fetch,
  home: () => harnessHome(),
  persistLastGood,
}

/** The tool's input schema, as the MCP tools/list answer carries it. */
const TOOL_SCHEMA = {
  type: 'object' as const,
  properties: {
    prompt: { type: 'string', description: '提示词（必填）' },
    model: { type: 'string', description: '模型 "<route>/<modelId>" 或 label；缺省取配置页的默认模型' },
    size: { type: 'string', description: '如 1024x1024；缺省取模型行 → defaults' },
    quality: { type: 'string', description: '如 high；缺省取模型行 → defaults' },
    n: { type: 'number', description: '生成张数；缺省取模型行 → defaults，越界报错并列出允许值' },
    reference_images: { type: 'array', items: { type: 'string' }, description: '参考图本地路径；非空走 /images/edits' },
    path: { type: 'string', description: '落盘文件（以 .png 结尾，存在则自动加 -2 后缀，不覆盖）或目录（其他拼写一律按目录创建）；缺省 generated-images/<slug>-<ts>.png' },
  },
  required: ['prompt'],
}

function serverInfo(): Record<string, unknown> {
  return { name: IMAGE_MCP_SERVER_NAME, version: '1' }
}

function toolsList(): Record<string, unknown>[] {
  return [
    {
      name: 'generate_image',
      description: '用当前配置的生图模型生成一张图片并落盘。返回图片内容块与落盘路径。',
      inputSchema: TOOL_SCHEMA,
    },
  ]
}

/** Validation beyond JSON-schema: the value must sit in the model's ability table. */
function validateAgainstTable(
  config: ImageConfig,
  modelId: string | undefined,
  args: Record<string, unknown>,
): string | undefined {
  // The model the CALL would use — the explicit pick, else the default — so a
  // bare `n: 9` is checked against the default model's table, not skipped.
  const model = resolveImageModel(config, modelId)
  if (model === undefined) return undefined
  if (typeof args['size'] === 'string' && !model.params.sizes.includes(args['size'])) {
    return `size 不在该模型的能力表内：${args['size']}（允许：${model.params.sizes.join('、')}）`
  }
  if (typeof args['quality'] === 'string' && !model.params.qualities.includes(args['quality'])) {
    return `quality 不在该模型的能力表内：${args['quality']}（允许：${model.params.qualities.join('、')}）`
  }
  if (typeof args['n'] === 'number' && args['n'] > model.params.maxN) {
    return `n 超过该模型的上限：${args['n']}（允许 ≤ ${model.params.maxN}）`
  }
  return undefined
}

/** One tools/call of generate_image: validation → core → content blocks. */
async function callGenerate(args: unknown): Promise<{ content: Record<string, unknown>[]; isError: boolean }> {
  if (typeof args !== 'object' || args === null) {
    return errorOf('参数不是对象；prompt 为必填字符串')
  }
  const record = args as Record<string, unknown>
  const prompt = typeof record['prompt'] === 'string' ? record['prompt'].trim() : ''
  if (prompt.length === 0) return errorOf('prompt 为必填字符串且不能为空')

  // Config-level rejections get the operative sentence plus the repair path.
  const config = readImageConfig(configPath())
  if (config.models.length === 0) {
    return errorOf('没有已配置的生图模型——请在配置页（模型页右上角「配置」）保存一次，或到 模型配置 → 输入模态 勾选「生图」')
  }
  const shapeError = validateAgainstTable(config, typeof record['model'] === 'string' ? record['model'] : undefined, record)
  if (shapeError !== undefined) return errorOf(shapeError)

  const referenceImages = Array.isArray(record['reference_images'])
    ? record['reference_images'].filter((entry): entry is string => typeof entry === 'string')
    : undefined
  const request = {
    ...(typeof record['model'] === 'string' ? { model: record['model'] } : {}),
    prompt,
    ...(typeof record['size'] === 'string' ? { size: record['size'] } : {}),
    ...(typeof record['quality'] === 'string' ? { quality: record['quality'] } : {}),
    ...(typeof record['n'] === 'number' ? { n: record['n'] } : {}),
    ...(referenceImages !== undefined && referenceImages.length > 0 ? { referenceImages } : {}),
    ...(typeof record['path'] === 'string' && record['path'].trim().length > 0 ? { outputPath: record['path'].trim() } : {}),
  }
  let result: GenerateResult
  try {
    result = await generateImage(generateDeps, request)
  } catch (error) {
    const detail = error instanceof GenerateError
      ? error.message
      : error instanceof Error ? error.message : String(error)
    const hint = error instanceof GenerateError && error.kind === 'auth' && error.message.includes('未配置密钥')
      ? '（也可请用户在配置页改用宿主代理生成）'
      : ''
    return errorOf(`${detail}${hint}`)
  }
  const notes = [
    `已生成：${result.filePath}`,
    `模型 ${result.model} · size ${result.paramsUsed.size} · quality ${result.paramsUsed.quality} · n ${result.paramsUsed.n}`,
    result.revisions.length > 0 ? `参数回退：${result.revisions.join('、')}` : '',
  ].filter(line => line.length > 0).join('\n')
  return {
    isError: false,
    content: [
      { type: 'image', data: result.data, mimeType: result.mime },
      { type: 'text', text: notes },
    ],
  }
}

function errorOf(message: string): { content: Record<string, unknown>[]; isError: boolean } {
  return { isError: true, content: [{ type: 'text', text: message }] }
}

/** One request → one answer object (undefined for notifications). */
async function handleMessage(message: Record<string, unknown>): Promise<Record<string, unknown> | undefined> {
  const id = message['id']
  const method = typeof message['method'] === 'string' ? message['method'] : ''
  if (id === undefined || id === null) return undefined // notification: ack by silence
  const reply = (result: unknown): Record<string, unknown> => ({ jsonrpc: '2.0', id, result })
  const failure = (code: number, text: string): Record<string, unknown> => ({
    jsonrpc: '2.0',
    id,
    error: { code, message: text },
  })
  try {
    if (method === 'initialize') {
      return reply({
        protocolVersion: '2025-06-18',
        capabilities: { tools: {} },
        serverInfo: serverInfo(),
      })
    }
    if (method === 'ping') return reply({})
    if (method === 'tools/list') return reply({ tools: toolsList() })
    if (method === 'tools/call') {
      const params = typeof message['params'] === 'object' && message['params'] !== null
        ? (message['params'] as Record<string, unknown>)
        : {}
      if (params['name'] !== 'generate_image') {
        return failure(-32602, `未知工具：${String(params['name'])}；本服务器只提供 generate_image`)
      }
      const answer = await callGenerate(params['arguments'])
      return reply({ ...(answer.isError ? { isError: true } : {}), content: answer.content })
    }
    return failure(-32601, `未知方法：${method}`)
  } catch (error) {
    return failure(-32603, error instanceof Error ? error.message : String(error))
  }
}

/** Serve stdin → stdout until the stream closes. Exported for tests. */
export async function serve(input: NodeJS.ReadableStream = process.stdin, output: NodeJS.WritableStream = process.stdout): Promise<void> {
  const reader = createInterface({ input, crlfDelay: Infinity })
  for await (const line of reader) {
    if (line.trim().length === 0) continue
    let message: Record<string, unknown>
    try {
      message = JSON.parse(line) as Record<string, unknown>
    } catch {
      continue // A malformed line is dropped: the stream must survive one bad frame.
    }
    const answer = await handleMessage(message)
    if (answer !== undefined) output.write(`${JSON.stringify(answer)}\n`)
  }
}

/** CLI entry: `node image-mcp.mjs`. */
if (process.argv[1] !== undefined && /image-mcp\.(mjs|js)$/.test(process.argv[1])) {
  void serve()
}
