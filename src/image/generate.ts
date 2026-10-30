/**
 * The image-generation core: ONE implementation of the OpenAI-compatible
 * images API call + disk write, behind three entries (the `generate_image`
 * native tool, the `/image-generate` route, the `/生图` host command).
 * Anything about request construction, param fallback, sanitization or file
 * naming lives here and nowhere else.
 *
 * Endpoint choice: no reference images → `POST {baseURL}/images/generations`
 * (JSON); with reference images → `POST {baseURL}/images/edits` with a
 * hand-built multipart/form-data body (zero dependencies — the boundary is
 * constructed here, not by a library the bundle cannot carry).
 *
 * Failure taxonomy (v3): the GUI used to show an image-only key's `403
 * permission_denied` as "API 密钥无效" because the CHAT wire produced it. This
 * core never talks the chat wire, and its errors are classified — auth vs
 * image-endpoint-only permission vs missing endpoint vs param — so every entry
 * can show the operative sentence instead of the misleading one. Error text is
 * sanitized: the key value can never appear in a message, whatever shape the
 * upstream echoes back.
 *
 * @module dsh-model-think-level/image/generate
 */

import { mkdirSync, readFileSync, writeFileSync, existsSync, statSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { harnessHome } from '../key-index.js'
import { createImageDeadline, type ImageDeadline } from './deadline.js'
import {
  effectiveParams,
  readImageConfig,
  resolveImageModel,
  type ImageConfig,
  type ImageModel,
} from './config.js'

/** What a caller asks for. Everything but `prompt` is optional. */
export interface GenerateRequest {
  /** `"<route>/<modelId>"`, a bare modelId, or the label; default when omitted. */
  readonly model?: string
  readonly prompt: string
  /**
   * Caller cancellation is propagated to cooperative dependencies and bounds
   * local waiting even when they ignore it. Aborting HTTP is best effort: it
   * cannot guarantee that a remote paid job or an already-started save stops.
   */
  readonly signal?: AbortSignal
  readonly size?: string
  readonly quality?: string
  readonly n?: number
  /** Local file paths; any non-empty list switches to the edits endpoint. */
  readonly referenceImages?: readonly string[]
  /**
   * Reference images as already-decoded bytes — the attachment-backed channel:
   * the native tool resolves conversation image IDs through the attachment
   * store and hands the bytes over, so no temp file ever hits the disk. Any
   * entry here (alone or beside `referenceImages`) switches to the edits
   * endpoint.
   */
  readonly referenceFiles?: readonly {
    readonly name: string
    readonly mime: string
    readonly bytes: Uint8Array
  }[]
  /**
   * Where to land the file: a path ending in `.png` is honored EXACTLY (an
   * existing one gains a `-2` suffix — never overwritten), anything else is
   * created as a directory and receives the slug-timestamp naming. Absent
   * means the config's `outputDir`.
   */
  readonly outputPath?: string
}

/** One generated image: the b64 payload the wire returned + where it landed. */
export interface GeneratedImage {
  readonly filePath: string
  readonly data: string
}

/** What a successful generation reports. */
export interface GenerateResult {
  /**
   * Every image the wire returned, in order, each already written to disk.
   * The upstream is asked for `paramsUsed.n` images; a relay that answers
   * fewer yields fewer entries — the result never invents one.
   */
  readonly images: readonly GeneratedImage[]
  readonly mime: string
  readonly model: string
  /** The prompt this run answered (the reply's markdown alt text derives from it). */
  readonly prompt: string
  readonly paramsUsed: { readonly size: string; readonly quality: string; readonly n: number }
  /**
   * What the fallback chain had to change, in order — the "回退说明" the reply
   * text carries. Empty when the first attempt went through untouched.
   */
  readonly revisions: readonly string[]
}

/** The classified failure `generateImage` throws (as `GenerateError`). */
export type GenerateFailureKind = 'config' | 'auth' | 'permission' | 'endpoint' | 'param' | 'reference' | 'upstream' | 'timeout' | 'aborted'

export class GenerateError extends Error {
  readonly kind: GenerateFailureKind
  readonly status?: number
  constructor(kind: GenerateFailureKind, message: string, status?: number) {
    super(message)
    this.name = 'GenerateError'
    this.kind = kind
    if (status !== undefined) this.status = status
  }
}

/** The faces this core needs from its host. All injectable for tests. */
export interface GenerateDeps {
  /** The live config; read fresh per call (the MCP path re-reads the file). */
  readonly config?: () => ImageConfig
  /** Resolve one credential reference to its value. */
  readonly resolveKey: (ref: string, signal?: AbortSignal) => Promise<string | undefined>
  /** The fetch beneath any wrapper — the images call must not be re-intercepted. */
  readonly send: typeof globalThis.fetch
  /** Base dir for relative `outputDir`s (defaults to the harness home). */
  readonly home?: () => string
  /** Persist `lastGoodParams` after a successful fallback (host: config file). */
  readonly persistLastGood?: (modelId: string, params: ImageModel['lastGoodParams']) => void
  /** Now, for file stamps (defaults to Date.now). */
  readonly now?: () => number
  /** Per-call timeout override (ms). */
  readonly timeoutMs?: number
}

/** Error classification patterns: what the fallback chain may still fix. */
const PARAM_ERROR_PATTERNS: readonly { readonly pattern: RegExp; readonly revision: string }[] = [
  { pattern: /response_format/i, revision: 'removed response_format' },
  { pattern: /output_format/i, revision: 'removed output_format' },
  { pattern: /\bquality\b/i, revision: 'lowered quality' },
  { pattern: /\bsize\b/i, revision: 'reset size to 1024x1024' },
  { pattern: /\bn\b|num_images|too many images/i, revision: 'set n to 1' },
]

const QUALITY_LADDER: readonly string[] = ['high', 'medium', 'low']

/** Strip the credential and other obvious secrets out of any error text. */
function sanitize(text: string, key: string | undefined): string {
  let out = text
  if (key !== undefined && key.length >= 4) {
    // Length-independent: even a partial echo must not survive.
    out = out.split(key).join('***')
    out = out.split(encodeURIComponent(key)).join('***')
    const head = key.slice(0, 6)
    const tail = key.slice(-4)
    if (key.length > 12) out = out.split(`${head}...${tail}`).join('***')
  }
  // A bearer token pasted back by an echo, whatever it reads as.
  out = out.replace(/(?:Bearer\s+|sk-)[A-Za-z0-9_\-=.]{8,}/g, '***')
  return out
}

/** Read under the call's deadline, cancelling even a non-cooperative body. */
async function responseBytes(response: Response, deadline: ImageDeadline, limit = Infinity): Promise<Uint8Array> {
  deadline.check()
  const reader = response.body?.getReader()
  if (reader === undefined) return new Uint8Array()
  const chunks: Uint8Array[] = []
  let length = 0
  let complete = false
  try {
    while (length < limit) {
      const { done, value } = await deadline.run(() => reader.read())
      if (done) { complete = true; break }
      const chunk = value.subarray(0, limit - length)
      chunks.push(chunk)
      length += chunk.length
    }
    deadline.check()
    const bytes = new Uint8Array(length)
    let offset = 0
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length }
    return bytes
  } finally {
    // Cleanup must not become another unbounded await. A rejected/late cancel
    // is consumed, and releaseLock rejects any still-pending read safely.
    if (!complete) void reader.cancel().catch(() => {})
    reader.releaseLock()
  }
}

/** Only error snippets are bounded; successful JSON must never be truncated. */
async function boundedText(response: Response, deadline: ImageDeadline, limit = 4096): Promise<string> {
  try {
    return new TextDecoder().decode(await responseBytes(response, deadline, limit))
  } catch {
    deadline.check()
    return ''
  }
}

/** The upstream JSON envelope of an error, flattened to one sentence. */
function upstreamMessage(body: unknown): string | undefined {
  if (typeof body === 'object' && body !== null) {
    const record = body as Record<string, unknown>
    const error = record['error']
    if (typeof error === 'string') return error
    if (typeof error === 'object' && error !== null && typeof (error as Record<string, unknown>)['message'] === 'string') {
      return (error as Record<string, unknown>)['message'] as string
    }
    if (typeof record['message'] === 'string') return record['message']
  }
  return undefined
}

/**
 * Classify one failed attempt. The 403 case is the user's actual incident: a
 * key restricted to a site's IMAGE endpoints must never read as "invalid key".
 * `text` arrives SANITIZED (the caller strips the credential before this sees
 * it) — every message built here flows into user-visible copy.
 */
function classifyFailure(status: number, text: string): { kind: GenerateFailureKind; message: string } {
  if (status === 401 || /invalid[_\s-]?api[_\s-]?key/i.test(text) || /incorrect api key/i.test(text)) {
    return { kind: 'auth', message: '密钥无效或已过期（upstream 401）' }
  }
  if (status === 403 || /permission_denied/i.test(text) || /仅开放图片接口/i.test(text) || /only (?:the )?image/i.test(text)) {
    return {
      kind: 'permission',
      message: '该密钥被限制为该站点的图片接口专用，不能用于聊天接口。已改走 images 接口；如仍失败，请到配置页对该模型执行「测试」。',
    }
  }
  if (status === 404) {
    return { kind: 'endpoint', message: '该供应商地址上不存在 images 端点（404）——请到配置页确认该模型的端点类型' }
  }
  if (status === 429) {
    return { kind: 'upstream', message: '上游限流（429）——请稍后重试' }
  }
  if (status >= 400 && status < 500) {
    return { kind: 'param', message: text.trim().length > 0 ? text.trim().slice(0, 400) : `上游拒绝了请求（${status}）` }
  }
  return { kind: 'upstream', message: text.trim().length > 0 ? text.trim().slice(0, 400) : `上游错误（${status}）` }
}

/** Whether this 4xx names a param the fallback chain can drop or downgrade. */
function fallbackRevisionFor(status: number, bodyText: string): string | undefined {
  if (status < 400 || status >= 500) return undefined
  for (const { pattern, revision } of PARAM_ERROR_PATTERNS) {
    if (pattern.test(bodyText)) return revision
  }
  return undefined
}

/** The multipart body of an /images/edits call, hand-built (zero deps). */
export function buildMultipart(
  boundary: string,
  fields: Readonly<Record<string, string>>,
  images: readonly { readonly name: string; readonly bytes: Uint8Array; readonly mime: string }[],
): { body: Uint8Array<ArrayBuffer>; contentType: string } {
  const encoder = new TextEncoder()
  const chunks: Uint8Array[] = []
  const push = (text: string): void => { chunks.push(encoder.encode(text)) }
  for (const [name, value] of Object.entries(fields)) {
    push(`--${boundary}\r\n`)
    push(`Content-Disposition: form-data; name="${name}"\r\n\r\n`)
    push(`${value}\r\n`)
  }
  images.forEach(image => {
    push(`--${boundary}\r\n`)
    push(`Content-Disposition: form-data; name="image[]"; filename="${image.name.replace(/"/g, '')}"\r\n`)
    push(`Content-Type: ${image.mime}\r\n\r\n`)
    chunks.push(image.bytes)
    push(`\r\n`)
  })
  push(`--${boundary}--\r\n`)
  const total = chunks.reduce((sum, chunk) => sum + chunk.length, 0)
  const body = new Uint8Array(total)
  let at = 0
  for (const chunk of chunks) {
    body.set(chunk, at)
    at += chunk.length
  }
  return { body, contentType: `multipart/form-data; boundary=${boundary}` }
}

/** MIME type of a reference image, by the extension the path carries. */
function mimeOfPath(path: string): string {
  const lower = path.toLowerCase()
  if (lower.endsWith('.jpg') || lower.endsWith('.jpeg')) return 'image/jpeg'
  if (lower.endsWith('.webp')) return 'image/webp'
  if (lower.endsWith('.gif')) return 'image/gif'
  return 'image/png'
}

/** Filesystem slug of a prompt: CJK kept, everything unsafe folded to `-`. */
export function promptSlug(prompt: string): string {
  const slug = prompt
    .slice(0, 40)
    .replace(/[\r\n]+/g, ' ')
    .replace(/[\\/:*?"<>|\u0000-\u001f]/g, '')
    .replace(/\s+/g, '-')
    .replace(/^-+|-+$/g, '')
  return slug.length > 0 ? slug : 'image'
}

/** The output dir for one config: absolute when configured absolute, else under home. */
function outputDirOf(deps: GenerateDeps, config: ImageConfig): string {
  const home = deps.home?.() ?? harnessHome()
  const dir = config.outputDir
  if (/^([A-Za-z]:[\\/]|\/)/.test(dir)) return dir
  return join(home, 'dsh-model-think-level', dir)
}

/** A file path that never overwrites: `<slug>-<ts>.png`, plus -2, -3… when taken. */
function destinationOf(dir: string, slug: string, now: () => number): string {
  const base = join(dir, `${slug}-${now()}.png`)
  if (!existsSync(base)) return base
  for (let index = 2; ; index += 1) {
    const candidate = join(dir, `${slug}-${now()}-${index}.png`)
    if (!existsSync(candidate)) return candidate
  }
}

/**
 * Where this run's file lands. An explicit `.png` path is honored exactly
 * (an existing one gains a numeric suffix — the never-overwrite rule);
 * anything else — an existing directory, a trailing separator, a non-png
 * name — is created as a directory and receives the slug-timestamp naming.
 */
export function resolveDestination(
  requested: string | undefined,
  fallbackDir: string,
  slug: string,
  now: () => number,
): string {
  if (requested === undefined || requested.trim().length === 0) {
    mkdirSync(fallbackDir, { recursive: true })
    return destinationOf(fallbackDir, slug, now)
  }
  const target = resolve(requested.trim())
  let isDir = false
  try {
    isDir = statSync(target).isDirectory()
  } catch {
    // Absent: classify by spelling below.
  }
  if (isDir || /[\\/]$/.test(target) || !target.toLowerCase().endsWith('.png')) {
    mkdirSync(target, { recursive: true })
    return destinationOf(target, slug, now)
  }
  mkdirSync(dirname(target), { recursive: true })
  if (!existsSync(target)) return target
  for (let index = 2; ; index += 1) {
    const candidate = target.replace(/\.png$/i, `-${index}.png`)
    if (!existsSync(candidate)) return candidate
  }
}

/** The b64 payloads of a successful images answer, in the order the wire returned them. */
async function imagesOfAnswer(answer: unknown, send: typeof globalThis.fetch, deadline: ImageDeadline, key: string | undefined): Promise<string[]> {
  if (typeof answer !== 'object' || answer === null) throw new GenerateError('upstream', '上游返回了无法识别的应答结构')
  const data = (answer as Record<string, unknown>)['data']
  if (!Array.isArray(data) || data.length === 0) {
    // Some relays wrap the answer one level deeper; try the common shapes once.
    for (const nestedKey of ['images', 'output', 'result'] as const) {
      const nested = (answer as Record<string, unknown>)[nestedKey]
      if (Array.isArray(nested) && nested.length > 0) return imagesOfAnswer({ data: nested }, send, deadline, key)
    }
    throw new GenerateError('upstream', '上游应答缺少 data 数组')
  }
  const images: string[] = []
  for (const entry of data) {
    if (typeof entry !== 'object' || entry === null) throw new GenerateError('upstream', '上游应答的 data 数组里有非对象项')
    const record = entry as Record<string, unknown>
    if (typeof record['b64_json'] === 'string' && record['b64_json'].length > 0) {
      images.push(record['b64_json'])
      continue
    }
    deadline.check()
    if (typeof record['url'] === 'string' && record['url'].length > 0) {
      try {
        const response = await deadline.run(() => send(record['url'] as string, { redirect: 'follow', signal: deadline.signal }))
        if (!response.ok) throw new GenerateError('upstream', `下载上游图片失败（${response.status}）`)
        const bytes = await responseBytes(response, deadline)
        let binary = ''
        for (let index = 0; index < bytes.length; index += 1) binary += String.fromCharCode(bytes[index]!)
        deadline.check()
        images.push(btoa(binary))
      } catch (error) {
        deadline.check()
        if (error instanceof GenerateError) throw error
        throw new GenerateError('upstream', `下载上游图片失败：${sanitize(error instanceof Error ? error.message : String(error), key)}`)
      }
      continue
    }
    throw new GenerateError('upstream', '上游应答既无 b64_json 也无 url')
  }
  return images
}

/** The core and native tool use identical cancellation/timeout classification. */
export function createGenerateDeadline(timeoutMs: number, signal?: AbortSignal): ImageDeadline {
  return createImageDeadline(timeoutMs, signal, kind => new GenerateError(kind, kind === 'aborted'
    ? '生成已取消'
    : `生成超时（${timeoutMs}ms）——可在配置页调大超时`))
}

/**
 * Run one generation. Reads the config fresh, resolves the model per the
 * priority chain, merges params, calls the images endpoint (with one pass of
 * the param fallback chain), decodes and writes the file.
 */
export async function generateImage(deps: GenerateDeps, request: GenerateRequest, sharedDeadline?: ImageDeadline): Promise<GenerateResult> {
  const config = deps.config?.() ?? readImageConfig()
  const deadline = sharedDeadline ?? createGenerateDeadline(deps.timeoutMs ?? config.defaults.timeoutMs, request.signal)
  try {
    deadline.check()
    return await generateWithinDeadline(deps, request, config, deadline)
  } catch (error) {
    deadline.check()
    throw error
  } finally {
    if (sharedDeadline === undefined) deadline.dispose()
  }
}

async function generateWithinDeadline(deps: GenerateDeps, request: GenerateRequest, config: ImageConfig, deadline: ImageDeadline): Promise<GenerateResult> {
  // The switch is authoritative for EVERY entry (tool, `/生图`, any cached
  // execute): a generation that starts after the user turned the service off
  // must not spend a paid request on a model that is no longer offered.
  if (!config.enabled) throw new GenerateError('config', '生图服务已关闭——可在「高级设置 → 生图」里重新开启')
  const prompt = request.prompt.trim()
  if (prompt.length === 0) throw new GenerateError('param', '提示词为空')
  const model = resolveImageModel(config, request.model)
  if (model === undefined) {
    throw new GenerateError('config', config.models.length === 0
      ? '没有已配置的生图模型——请到 模型配置 → 输入模态 勾选「生图」，或在插件配置页添加'
      : `生图模型不存在或无法唯一定位：${request.model ?? config.defaultModel ?? `(未设默认，候选 ${config.models.map(candidate => candidate.id).join('、')})`}。请带上 model 参数，或到插件配置页把其中一个设为默认模型`)
  }
  if (model.api !== 'images') {
    throw new GenerateError('endpoint', `该模型（${model.id}）的协议没有兼容的 images 端点，生成已禁用`)
  }
  if (model.baseURL.length === 0) {
    throw new GenerateError('config', `模型 ${model.id} 所在供应商未配置 baseURL`)
  }
  const params = effectiveParams(config, model, request)
  const key = model.keyRef === undefined ? undefined : await deadline.run(() => deps.resolveKey(model.keyRef!, deadline.signal))
  if (model.keyRef !== undefined && key === undefined) {
    throw new GenerateError('auth', `该 route（${model.route}）未配置密钥（引用 ${model.keyRef}）——请到模型配置页填写`)
  }

  const base = model.baseURL.replace(/\/+$/, '')
  const now = deps.now ?? (() => Date.now())
  // Reference images never change across the fallback loop: both channels are
  // read once, before the first attempt (a missing file fails the call up
  // front instead of after a paid round-trip).
  const referenceReads: { name: string; bytes: Uint8Array; mime: string }[] = [
    ...(request.referenceFiles ?? []).map(file => ({ name: file.name, bytes: file.bytes, mime: file.mime })),
    ...(request.referenceImages ?? []).map(path => {
      deadline.check()
      const absolute = resolve(path)
      if (!existsSync(absolute)) throw new GenerateError('reference', `参考图不存在或不可读：${path}`)
      try {
        return { name: absolute.split(/[\\/]/).pop() ?? 'image', bytes: readFileSync(absolute), mime: mimeOfPath(absolute) }
      } catch {
        throw new GenerateError('reference', `参考图不存在或不可读：${path}`)
      }
    }),
  ]
  // One fallback pass, in the design's order: drop response_format → lower
  // quality → reset size → n=1. Each revision is recorded for the reply text.
  const revisions: string[] = []
  let format: 'b64_json' | 'output_format' | 'none' = model.lastGoodParams?.responseFormat ?? model.params.responseFormat
  let quality = params.quality
  let size = params.size
  let count = params.n
  let lastFailure: { kind: GenerateFailureKind; message: string; status?: number } | undefined

  for (let attempt = 0; attempt < 5; attempt += 1) {
    deadline.check()
    const signal = deadline.signal
    let response: Response
    try {
      if (referenceReads.length > 0) {
        const boundary = `dsh-image-${now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`
        const fields: Record<string, string> = {
          prompt,
          model: model.modelId,
          n: String(count),
          size,
        }
        if (format !== 'none') fields['output_format'] = 'png'
        const { body, contentType } = buildMultipart(boundary, fields, referenceReads)
        response = await deadline.run(() => deps.send(`${base}/images/edits`, {
          method: 'POST',
          headers: {
            'content-type': contentType,
            ...(key === undefined ? {} : { authorization: `Bearer ${key}` }),
          },
          body,
          signal,
        }))
      } else {
        const payload: Record<string, unknown> = {
          model: model.modelId,
          prompt,
          n: count,
          size,
          quality,
        }
        if (format === 'b64_json') payload['response_format'] = 'b64_json'
        if (format === 'output_format') payload['output_format'] = 'png'
        response = await deadline.run(() => deps.send(`${base}/images/generations`, {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            ...(key === undefined ? {} : { authorization: `Bearer ${key}` }),
          },
          body: JSON.stringify(payload),
          signal,
        }))
      }
    } catch (error) {
      deadline.check()
      if (error instanceof GenerateError) throw error
      const message = error instanceof Error ? error.message : String(error)
      throw new GenerateError('upstream', `无法连接 ${base}：${sanitize(message, key)}`)
    }

    if (response.ok) {
      let answer: unknown
      try {
        answer = JSON.parse(new TextDecoder().decode(await responseBytes(response, deadline)))
      } catch {
        deadline.check()
        throw new GenerateError('upstream', '上游应答不是合法 JSON')
      }
      const payloads = await imagesOfAnswer(answer, deps.send, deadline, key)
      // One file per returned image. Each destination is resolved only after
      // the previous file is on disk, so the never-overwrite suffixes advance
      // (`a.png`, `a-2.png`, …) whatever spelling the caller chose.
      const images: GeneratedImage[] = []
      for (const data of payloads) {
        deadline.check()
        const filePath = resolveDestination(request.outputPath, outputDirOf(deps, config), promptSlug(prompt), now)
        const bytes = Uint8Array.from(atob(data), ch => ch.charCodeAt(0))
        deadline.check()
        writeFileSync(filePath, bytes)
        images.push({ filePath, data })
      }
      deadline.check()
      if (revisions.length > 0 && deps.persistLastGood !== undefined) {
        deps.persistLastGood(model.id, {
          ...model.params,
          responseFormat: format,
          sizes: model.params.sizes,
          qualities: model.params.qualities,
          maxN: model.params.maxN,
        })
      }
      deadline.check()
      return {
        images,
        mime: 'image/png',
        model: model.id,
        prompt,
        paramsUsed: { size, quality, n: count },
        revisions: [...revisions],
      }
    }

    const bodyText = await boundedText(response, deadline)
    let body: unknown
    try {
      body = JSON.parse(bodyText)
    } catch {
      body = undefined
    }
    // The upstream sentence first (it is the operative one), the raw body as
    // backup context — both through the sanitizer before anything downstream
    // can see them.
    const combined = sanitize([upstreamMessage(body), bodyText].filter((part): part is string =>
      typeof part === 'string' && part.length > 0).join(' '), key)
    lastFailure = classifyFailure(response.status, combined)
    // Endpoint facts are worth persisting even on a terminal failure: a 404
    // means "no images endpoint here", and the badge should say so.
    if (lastFailure.kind === 'endpoint') deps.persistLastGood?.(model.id, null)
    const revision = fallbackRevisionFor(response.status, bodyText)
    if (revision !== undefined && revisions.length < 4) {
      // Apply the FIRST matching downgrade the error names; the loop retries
      // with the narrowed shape, so one 4xx costs one extra attempt at most
      // per dropped param.
      if (revision === 'removed response_format' || revision === 'removed output_format') {
        if (format === 'none') continue
        revisions.push(revision)
        format = 'none'
      } else if (revision === 'lowered quality') {
        const at = QUALITY_LADDER.indexOf(quality)
        if (at === -1 || at === QUALITY_LADDER.length - 1) continue
        revisions.push(revision)
        quality = QUALITY_LADDER[at + 1]!
      } else if (revision === 'reset size to 1024x1024') {
        if (size === '1024x1024') continue
        revisions.push(revision)
        size = '1024x1024'
      } else {
        if (count === 1) continue
        revisions.push(revision)
        count = 1
      }
      continue
    }
    break
  }

  const failure = lastFailure ?? { kind: 'upstream' as const, message: '生成失败' }
  throw new GenerateError(failure.kind, `生图失败：${failure.message}${revisions.length > 0 ? `（已回退：${revisions.join('、')}）` : ''}`, failure.status)
}
