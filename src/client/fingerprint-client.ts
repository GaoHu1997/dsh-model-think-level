// 指纹路由的浏览器侧传输：读一家供应商的落盘结论、忘掉一个模型、跑一个模型
// 的三题并把进度行收回来。
//
// 纯传输 —— 不碰 React、不碰 DOM —— 所以能单测。它不认识"该不该测"，那是
// `../fingerprint/eligibility.js` 的事；也不认识"测出来算什么等级"，那是
// `../fingerprint/verdict.js` 的事。这里只负责把字节搬对地方。
//
// 见 docs/fingerprint-design.md §5.4（后台执行）与 §4.2（只存统计量）。

import { FINGERPRINT_PATH } from '../constants.js'
import type { FingerprintRecord } from '../fingerprint/verdict.js'

/**
 * 银行摘要，**结构声明**：`fingerprint/bank.ts` 是 Node-only（它自己读
 * `assets/unified_bank.json`），浏览器不能 import 它。所以这里只声明前端
 * 真正读的两个字段，宿主以后加字段也不会打断激活 —— 与 `SlotRegistrarFace`
 * 同一个理由。
 */
export interface FingerprintBankView {
  /** 银行的构建时间戳；换银行 = 所有落盘结论作废。 */
  builtAt?: string
  /** 建议的题数，写在按钮旁边当成本说明。 */
  recommendedQueries?: number
}

/** GET 的应答体。 */
export interface FingerprintSnapshot {
  bank: FingerprintBankView
  records: FingerprintRecord[]
}

/** 一行流式应答。顺序是 `progress`×N 然后 `result` 或 `error`。 */
export type FingerprintLine =
  | { type: 'progress'; index: number; ok: boolean; error?: string }
  | { type: 'result'; record: FingerprintRecord }
  | { type: 'error'; error: string }

/** 一次检测的答案：要么是落盘的那条记录，要么是一句面向用户的原因。 */
export type FingerprintRunAnswer =
  | { ok: true; record: FingerprintRecord }
  | { ok: false; error: string }

/** 一次进行中的检测：可中止，且一定会 settle。 */
export interface FingerprintRun {
  done: Promise<FingerprintRunAnswer>
  abort(): void
}

/** 传输层的失败：不是"模型没测出来"，是"这一次根本没跑成"。 */
export type TransportAnswer<T> = { ok: true; data: T } | { ok: false; error: string }

const routeQuery = (route: string): string => `?route=${encodeURIComponent(route)}`

/** 应答体里那句 error，取不到就说 http 状态。 */
async function failureOf(response: Response): Promise<string> {
  try {
    const body = (await response.json()) as { error?: unknown }
    if (typeof body.error === 'string' && body.error.length > 0) return body.error
  } catch {
    // 非 JSON 错误页（代理的 502 之类）：退回状态行。
  }
  return `fingerprint request failed (${response.status})`
}

/**
 * 取某供应商已落盘的检测结论。
 * @param route - 供应商的设置键。
 * @returns 银行摘要 + 该供应商的记录；传输失败是一句原因。
 */
export async function readFingerprints(route: string): Promise<TransportAnswer<FingerprintSnapshot>> {
  try {
    const response = await fetch(`${FINGERPRINT_PATH}${routeQuery(route)}`, { method: 'GET' })
    const body = (await response.json()) as {
      ok?: boolean
      data?: { bank?: unknown; records?: unknown }
      error?: unknown
    }
    if (response.ok && body.ok === true) {
      const data = body.data
      return {
        ok: true,
        data: {
          bank: (data?.bank ?? {}) as FingerprintBankView,
          records: Array.isArray(data?.records) ? (data.records as FingerprintRecord[]) : [],
        },
      }
    }
    return { ok: false, error: typeof body.error === 'string' ? body.error : await failureOf(response) }
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) }
  }
}

/**
 * 忘掉一个模型的检测结论。忘掉就是忘掉 —— 不留"上次测过"的痕迹，下次显示
 * 回 `未检测`。
 * @param route - 供应商的设置键。
 * @param model - 模型 id。
 */
export async function forgetFingerprint(route: string, model: string): Promise<TransportAnswer<undefined>> {
  try {
    const response = await fetch(
      `${FINGERPRINT_PATH}${routeQuery(route)}&model=${encodeURIComponent(model)}`,
      { method: 'DELETE' },
    )
    const body = (await response.json()) as { ok?: boolean; error?: unknown }
    if (response.ok && body.ok === true) return { ok: true, data: undefined }
    return { ok: false, error: typeof body.error === 'string' ? body.error : await failureOf(response) }
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) }
  }
}

/**
 * 跑一个模型的三题，流式收进度。
 *
 * 应答是 NDJSON：每题一行 `progress`，末尾一行 `result` 或 `error`。**解析
 * 容忍整个响应一次性到达**（有的代理会缓冲），所以按换行切而不是按到达次序
 * 猜；丢行也不会卡死，`done` 一定会 settle。
 *
 * 调用方 abort 是"不要这个结论了"，不是"回滚"：已经跑完的题不重跑，已经
 * 落盘的结论不撤 —— 落盘是宿主在 `result` 行之前做的。
 *
 * @param route - 供应商的设置键。
 * @param model - 模型 id。
 * @param onLine - 每收到一行调一次；`result` 那行也走这里，方便面板统一记账。
 * @returns 可中止的句柄。
 */
export function runFingerprint(
  route: string,
  model: string,
  onLine: (line: FingerprintLine) => void,
): FingerprintRun {
  const controller = new AbortController()
  let aborted = false

  const done = (async (): Promise<FingerprintRunAnswer> => {
    let final: FingerprintRunAnswer | undefined
    try {
      const response = await fetch(`${FINGERPRINT_PATH}${routeQuery(route)}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ model }),
        signal: controller.signal,
      })
      if (!response.ok) return { ok: false, error: await failureOf(response) }
      // 走到这里就是 200 + NDJSON：错误也以行的形式到，不是状态码。
      const reader = response.body?.getReader()
      if (reader === undefined) return { ok: false, error: 'the fingerprint route sent no body' }

      const decoder = new TextDecoder()
      let pending = ''
      for (;;) {
        const { done: finished, value } = await reader.read()
        if (finished) break
        pending += decoder.decode(value, { stream: true })
        let cut = pending.indexOf('\n')
        while (cut >= 0) {
          const line = pending.slice(0, cut).trim()
          pending = pending.slice(cut + 1)
          if (line.length > 0) {
            const parsed = parseLine(line)
            if (parsed !== undefined) {
              onLine(parsed)
              if (parsed.type === 'result') final = { ok: true, record: parsed.record }
              else if (parsed.type === 'error') final = { ok: false, error: parsed.error }
            }
          }
          cut = pending.indexOf('\n')
        }
      }
      // 尾行没带换行也得收。
      const tail = pending.trim()
      if (tail.length > 0) {
        const parsed = parseLine(tail)
        if (parsed !== undefined) {
          onLine(parsed)
          if (parsed.type === 'result') final = { ok: true, record: parsed.record }
          else if (parsed.type === 'error') final = { ok: false, error: parsed.error }
        }
      }
    } catch (error) {
      if (aborted) return { ok: false, error: 'cancelled' }
      return { ok: false, error: error instanceof Error ? error.message : String(error) }
    }
    // 流结束了却没拿到结论行：代理缓冲、连接被掐、或宿主半路崩了。要说实话，
    // 不能把"没结论"画成"检测失败" —— 前者根本没测完。
    if (final !== undefined) return final
    return aborted
      ? { ok: false, error: 'cancelled' }
      : { ok: false, error: 'the fingerprint route ended without a verdict' }
  })()

  return {
    done,
    abort: (): void => {
      aborted = true
      controller.abort()
    },
  }
}

function parseLine(line: string): FingerprintLine | undefined {
  let parsed: unknown
  try {
    parsed = JSON.parse(line)
  } catch {
    return undefined
  }
  if (typeof parsed !== 'object' || parsed === null) return undefined
  const record = parsed as Record<string, unknown>
  const type = record['type']
  if (type === 'progress') {
    return {
      type: 'progress',
      index: Number(record['index'] ?? 0),
      ok: record['ok'] === true,
      ...(typeof record['error'] === 'string' ? { error: record['error'] } : {}),
    }
  }
  if (type === 'result') {
    const inner = record['record']
    if (typeof inner !== 'object' || inner === null) return undefined
    return { type: 'result', record: inner as FingerprintRecord }
  }
  if (type === 'error') {
    return { type: 'error', error: typeof record['error'] === 'string' ? record['error'] : 'fingerprint route failed' }
  }
  return undefined
}
