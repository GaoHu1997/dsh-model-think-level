// 生图配置路由的浏览器侧传输：读配置、存配置、测端点、直接生成、装卸 MCP。
//
// 纯传输 —— 不碰 React、不碰 DOM —— 所以能单测。它不认识"哪些是生图模型"
// （那是宿主从 `inputImageGen` 行派生的），也不认识"开关该不该亮"（那由
// cordis.patch.yml 的标记块存在性派生，宿主在 status 里报）。

import { IMAGE_CONFIG_PATH, IMAGE_GENERATE_PATH, IMAGE_MCP_PATH } from '../constants.js'
import type { ImageModel } from '../image/config.js'

/** 传输层的失败：一句面向用户的原因。 */
export type TransportAnswer<T> = { ok: true; data: T } | { ok: false; error: string }

/** 配置页的 MCP 状态块（由 cordis.patch.yml 标记块存在性派生）。 */
export interface ImageMcpView {
  installed: boolean
  serverName: string
  toolName: string
  restartRequired: boolean
  diagnostics: { lastCheckAt: string | null; ok: boolean; error: string | null }
  patchFile?: string
  nodeCommand?: string
  malformed?: boolean
}

/** GET image-config 的应答体（结构声明：浏览器不 import host-only 模块）。 */
export interface ImageConfigView {
  models: ImageModel[]
  defaultModel: string | null
  defaults: { size: string; quality: string; n: number; timeoutMs: number }
  outputDir: string
  syncedAt?: string
  mcp: ImageMcpView
}

/** MCP 路由的应答。 */
export interface ImageMcpAnswer {
  action?: string
  status?: { installed: boolean; patchFile: string; toolName: string; serverName: string; nodeCommand: string; malformed: boolean }
  selfcheck?: { ok: boolean; error: string | null }
  unchanged?: boolean
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

/** 保存默认模型/默认参数/输出目录/模型行覆盖。 */
export async function saveImageConfig(patch: {
  defaultModel?: string | null
  defaults?: Partial<{ size: string; quality: string; n: number; timeoutMs: number }>
  outputDir?: string
  models?: { id: string; size?: string | null; quality?: string | null; n?: number | null }[]
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

/** 显式生成（辅通道）：拿 filePath 直接弹预览。 */
export async function generateImageDirect(request: {
  model?: string
  prompt: string
  size?: string
  quality?: string
  n?: number
  referenceImages?: readonly string[]
}): Promise<TransportAnswer<{ filePath: string; mime: string; model: string; paramsUsed: { size: string; quality: string; n: number }; warning?: string }>> {
  try {
    const response = await fetch(IMAGE_GENERATE_PATH, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(request),
    })
    const body = (await response.json().catch(() => ({}))) as Record<string, unknown>
    if (response.ok && body['ok'] === true) return { ok: true, data: body as { filePath: string; mime: string; model: string; paramsUsed: { size: string; quality: string; n: number } } }
    return { ok: false, error: typeof body['error'] === 'string' ? body['error'] : await failureOf(response) }
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) }
  }
}

/** MCP 生命周期：install / uninstall / status / selfcheck。 */
export async function imageMcpAction(action: 'install' | 'uninstall' | 'status' | 'selfcheck'): Promise<TransportAnswer<ImageMcpAnswer>> {
  const answer = await jsonPost(IMAGE_MCP_PATH, { action })
  return answer.ok ? { ok: true, data: answer.data as ImageMcpAnswer } : answer
}

/**
 * 安装/卸载后的确认轮询：HMR 热加载是异步的，一次动作后的第一次读数可能还是
 * 旧状态。按间隔重读派生状态，直到与目标一致（热加载完成）或次数用尽（保守
 * 提示"可能需要重启"）。第一轮立即检查，所以状态已到位时零延迟返回。
 * @returns 目标状态是否在期限内被观察到。
 */
export async function pollMcpStatus(
  target: boolean,
  options: { attempts?: number; intervalMs?: number } = {},
): Promise<boolean> {
  const attempts = options.attempts ?? 5
  const intervalMs = options.intervalMs ?? 1000
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    if (attempt > 0) await new Promise(resolve => setTimeout(resolve, intervalMs))
    const answer = await readImageConfigView()
    if (answer.ok && answer.data.mcp.installed === target) return true
  }
  return false
}
