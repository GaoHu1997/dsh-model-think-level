// 生图配置路由的浏览器侧传输：读配置、存配置、测端点、直接生成。
//
// 纯传输 —— 不碰 React、不碰 DOM —— 所以能单测。它不认识"哪些是生图模型"
// （那是宿主从 `inputImageGen` 行派生的），也不认识"工具注册没有"（那由宿主
// 运行时的 tools/attachments 服务决定，宿主在 tool 块里报）。

import { IMAGE_CONFIG_PATH, IMAGE_GENERATE_PATH } from '../constants.js'
import type { ImageModel } from '../image/config.js'

/** 传输层的失败：一句面向用户的原因。 */
export type TransportAnswer<T> = { ok: true; data: T } | { ok: false; error: string }

/** GET image-config 的 tool 块：原生 generate_image 的注册状态。 */
export interface ImageToolView {
  registered: boolean
  name: string | null
}

/** GET image-config 的应答体（结构声明：浏览器不 import host-only 模块）。 */
export interface ImageConfigView {
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

/** 画配置页之前就能拿到的快照（没有过就读不到）。 */
export function cachedImageConfigView(): ImageConfigView | undefined {
  return cachedView
}

/** 丢掉缓存：测试重置用，登出/换账号时也可以先清一次。 */
export function clearImageConfigCache(): void {
  cachedView = undefined
}

/**
 * 预热配置：模型页一挂载就发一次 GET，用户点「生图服务」时缓存已经就位。
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
      const view = body as unknown as ImageConfigView
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
  defaultModel?: string | null
  defaults?: Partial<{ size: string; quality: string; n: number; timeoutMs: number }>
  outputDir?: string
}): Promise<TransportAnswer<undefined>> {
  const answer = await jsonPost(IMAGE_CONFIG_PATH, { op: 'save', ...patch })
  return answer.ok ? { ok: true, data: undefined } : answer
}

/** 对一行模型发起端点测试（n:1、最小尺寸的真实请求）。 */
export async function testImageEndpoint(id: string): Promise<TransportAnswer<{ status: string; checkedAt?: string }>> {
  const answer = await jsonPost(IMAGE_CONFIG_PATH, { op: 'test', id })
  if (!answer.ok) return answer
  const status = typeof answer.data['status'] === 'string' ? answer.data['status'] : 'unverified'
  return { ok: true, data: { status, ...(typeof answer.data['checkedAt'] === 'string' ? { checkedAt: answer.data['checkedAt'] as string } : {}) } }
}

/** 显式生成（辅通道）：拿全部落盘路径直接弹预览。 */
export async function generateImageDirect(request: {
  model?: string
  prompt: string
  size?: string
  quality?: string
  n?: number
  referenceImages?: readonly string[]
}): Promise<TransportAnswer<{ images: readonly string[]; model: string; paramsUsed: { size: string; quality: string; n: number }; warning?: string }>> {
  try {
    const response = await fetch(IMAGE_GENERATE_PATH, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(request),
    })
    const body = (await response.json().catch(() => ({}))) as Record<string, unknown>
    const images = Array.isArray(body['images']) ? body['images'].filter((entry): entry is string => typeof entry === 'string') : undefined
    if (response.ok && body['ok'] === true && images !== undefined) {
      return { ok: true, data: { images, model: String(body['model'] ?? ''), paramsUsed: body['paramsUsed'] as { size: string; quality: string; n: number }, ...(typeof body['warning'] === 'string' ? { warning: body['warning'] } : {}) } }
    }
    return { ok: false, error: typeof body['error'] === 'string' ? body['error'] : await failureOf(response) }
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) }
  }
}
