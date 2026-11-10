// 生图配置路由的浏览器侧传输：读配置、存配置。
//
// 模型列表由宿主从当前 inputImageGen 行派生。浏览器只保留一份用于首帧
// 绘制的快照，每次读取仍请求宿主；失败和写入都会移除这份快照。

import { IMAGE_CONFIG_PATH } from '../constants.js'
import type { ImageModel } from '../image/config.js'

/** 失败时可附带仍可编辑的偏好；它不代表可用的模型列表。 */
export type TransportAnswer<T> = { ok: true; data: T } | { ok: false; error: string; data?: T }

/** GET image-config 的 tool 块：原生 generate_image 的注册状态。 */
export interface ImageToolView {
  registered: boolean
  name: string | null
  error?: string
}

/** GET image-config 的应答体（浏览器不 import host-only 模块）。 */
export interface ImageConfigView {
  enabled: boolean
  models: ImageModel[]
  defaultModel: string | null
  defaults: { size: string; quality: string; n: number; timeoutMs: number }
  outputDir: string
  syncedAt?: string
  tool: ImageToolView
}

/** 应答体里那句 error，取不到就说 http 状态。 */
async function failureOf(response: Response): Promise<string> {
  try {
    const body = (await response.json()) as { error?: unknown }
    if (typeof body.error === 'string' && body.error.length > 0) return body.error
  } catch {
    // 非 JSON 错误页（代理的 502 之类）：退回状态行。
  }
  return `image request failed (${response.status})`
}

async function jsonPost(path: string, payload: unknown): Promise<TransportAnswer<Record<string, unknown>>> {
  try {
    const response = await fetch(path, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(payload),
    })
    const body = (await response.json().catch(() => ({}))) as Record<string, unknown>
    if (response.ok && body['ok'] === true) return { ok: true, data: body }
    return { ok: false, error: typeof body['error'] === 'string' ? body['error'] : await failureOf(response) }
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) }
  }
}

/** 上一份读成功的首帧快照；不用于省略后续 GET。 */
let cachedView: ImageConfigView | undefined
let readSequence = 0
let configRevision = 0

export function imageConfigRevision(): number {
  return configRevision
}

const configListeners = new Set<() => void>()

/** 保存成功后通知仍在使用旧请求的消费者。 */
export function onImageConfigChanged(listener: () => void): () => void {
  configListeners.add(listener)
  return () => { configListeners.delete(listener) }
}

export function cachedImageConfigView(): ImageConfigView | undefined {
  return cachedView
}

/** 清理快照时也作废尚未完成的旧 GET。 */
export function clearImageConfigCache(): void {
  cachedView = undefined
  readSequence += 1
  configRevision += 1
}

export function prefetchImageConfigView(): void {
  void readImageConfigView()
}

/** unavailable 响应只保留偏好和工具状态，始终移除模型行。 */
function unavailableView(body: Record<string, unknown>): ImageConfigView | undefined {
  const defaults = body['defaults'] as Partial<ImageConfigView['defaults']> | null | undefined
  const tool = body['tool'] as Partial<ImageToolView> | null | undefined
  if (typeof body['enabled'] !== 'boolean'
    || !(body['defaultModel'] === null || typeof body['defaultModel'] === 'string')
    || typeof body['outputDir'] !== 'string'
    || defaults === null || typeof defaults !== 'object'
    || typeof defaults.size !== 'string' || typeof defaults.quality !== 'string'
    || typeof defaults.n !== 'number' || typeof defaults.timeoutMs !== 'number'
    || tool === null || typeof tool !== 'object' || typeof tool.registered !== 'boolean'
    || !(tool.name === null || typeof tool.name === 'string')) return undefined
  return {
    enabled: body['enabled'], models: [], defaultModel: body['defaultModel'],
    defaults: { size: defaults.size, quality: defaults.quality, n: defaults.n, timeoutMs: defaults.timeoutMs },
    outputDir: body['outputDir'],
    tool: { registered: tool.registered, name: tool.name, ...(typeof tool.error === 'string' ? { error: tool.error } : {}) },
  }
}

/** 每次纯 GET 当前宿主视图，禁止浏览器 HTTP 缓存参与配置读取。 */
export async function readImageConfigView(): Promise<TransportAnswer<ImageConfigView>> {
  const sequence = ++readSequence
  try {
    const response = await fetch(IMAGE_CONFIG_PATH, { method: 'GET', cache: 'no-store' })
    const body = (await response.json()) as Record<string, unknown>
    if (response.ok && body['ok'] === true && Array.isArray(body['models'])) {
      // 旧宿主未返回 enabled 时沿用已发布的默认启用行为。
      const view = { ...(body as unknown as ImageConfigView), enabled: body['enabled'] !== false }
      if (sequence === readSequence) cachedView = view
      return { ok: true, data: view }
    }
    if (sequence === readSequence) cachedView = undefined
    const data = unavailableView(body)
    return {
      ok: false,
      error: typeof body['error'] === 'string' ? body['error'] : `image request failed (${response.status})`,
      ...(data === undefined ? {} : { data }),
    }
  } catch (error) {
    if (sequence === readSequence) cachedView = undefined
    return { ok: false, error: error instanceof Error ? error.message : String(error) }
  }
}

/** 保存偏好；POST 前和结束后都作废旧 GET，随后由调用方重新读取。 */
export async function saveImageConfig(patch: {
  enabled?: boolean
  defaultModel?: string | null
  defaults?: Partial<{ size: string; quality: string; n: number; timeoutMs: number }>
  outputDir?: string
}): Promise<TransportAnswer<undefined>> {
  cachedView = undefined
  readSequence += 1
  const answer = await jsonPost(IMAGE_CONFIG_PATH, { op: 'save', ...patch })
  cachedView = undefined
  readSequence += 1
  if (!answer.ok) return { ok: false, error: answer.error }
  configRevision += 1
  for (const listener of configListeners) {
    try {
      listener()
    } catch {
      // A stale subscriber must never fail a save that already happened.
    }
  }
  return { ok: true, data: undefined }
}
