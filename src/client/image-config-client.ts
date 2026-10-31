// 生图配置路由的浏览器侧传输：读配置、存配置。
//
// 纯传输 —— 不碰 React、不碰 DOM —— 所以能单测。它不认识"哪些是生图模型"
// （那是宿主从 `inputImageGen` 行派生的），也不认识"工具注册没有"（那由宿主
// 运行时的 tools/attachments 服务决定，宿主在 tool 块里报）。

import { IMAGE_CONFIG_PATH } from '../constants.js'
import type { ImageModel } from '../image/config.js'

/** 传输层的失败：一句面向用户的原因。 */
export type TransportAnswer<T> = { ok: true; data: T } | { ok: false; error: string }

/** GET image-config 的 tool 块：原生 generate_image 的注册状态。 */
export interface ImageToolView {
  registered: boolean
  name: string | null
  /**
   * Why the registration failed, when it did: the host records the error the
   * `tools.register` call threw, so a broken schema is readable instead of
   * silent. Absent while the tool is registered or never attempted.
   */
  error?: string
}

/** GET image-config 的应答体（结构声明：浏览器不 import host-only 模块）。 */
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

/** 上一份读成功的配置：配置页先用它立刻开画，再在后台刷新。 */
let cachedView: ImageConfigView | undefined
let configRevision = 0

/** Completion caches must not outlive a successful settings write. */
export function imageConfigRevision(): number {
  return configRevision
}

/** Everything that caches a config-derived answer subscribes here. */
const configListeners = new Set<() => void>()

/**
 * Listen for a successful config write (the switch changes what other surfaces
 * may offer). @returns the unsubscribe.
 */
export function onImageConfigChanged(listener: () => void): () => void {
  configListeners.add(listener)
  return () => { configListeners.delete(listener) }
}

/** 画配置页之前就能拿到的快照（没有过就读不到）。 */
export function cachedImageConfigView(): ImageConfigView | undefined {
  return cachedView
}

/** 丢掉缓存：测试重置用，登出/换账号时也可以先清一次。 */
export function clearImageConfigCache(): void {
  cachedView = undefined
  configRevision += 1
}

/**
 * 预热配置：模型页一挂载就发一次 GET，用户点「高级设置」时缓存已经就位。
 * 失败不管——真正打开时会再读一次并把错误显示出来。
 */
export function prefetchImageConfigView(): void {
  void readImageConfigView()
}

/**
 * 读生图配置（宿主先重同步再回答，所以快照不会过期）。
 */
export async function readImageConfigView(): Promise<TransportAnswer<ImageConfigView>> {
  try {
    const response = await fetch(IMAGE_CONFIG_PATH, { method: 'GET' })
    const body = (await response.json()) as Record<string, unknown>
    if (response.ok && body['ok'] === true && typeof body['models'] !== 'undefined') {
      // A host older than the switch never sends `enabled`: the shipped
      // behaviour there was "on", so the view keeps that default.
      const view = { ...(body as unknown as ImageConfigView), enabled: body['enabled'] !== false }
      cachedView = view
      return { ok: true, data: view }
    }
    return { ok: false, error: typeof body['error'] === 'string' ? body['error'] : await failureOf(response) }
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) }
  }
}

/** 保存默认模型/默认参数/输出目录。 */
export async function saveImageConfig(patch: {
  enabled?: boolean
  defaultModel?: string | null
  defaults?: Partial<{ size: string; quality: string; n: number; timeoutMs: number }>
  outputDir?: string
}): Promise<TransportAnswer<undefined>> {
  const answer = await jsonPost(IMAGE_CONFIG_PATH, { op: 'save', ...patch })
  if (!answer.ok) return answer
  configRevision += 1
  if (cachedView !== undefined) {
    cachedView = { ...cachedView, ...patch, defaults: { ...cachedView.defaults, ...patch.defaults } }
  }
  for (const listener of configListeners) {
    try {
      listener()
    } catch {
      // A stale subscriber must never fail a save that already happened.
    }
  }
  return { ok: true, data: undefined }
}
