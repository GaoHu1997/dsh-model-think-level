// 判定一次归属结论的等级：`identified` / `doubtful` / `failed`。
//
// 纯函数、零依赖，客户端（画徽章）和宿主（写落盘）共用同一个判据 ——
// 不能让「显示的等级」和「存下来的等级」各算一套。
// 见 docs/fingerprint-design.md §4.3。

import type { AttributionResult, ResultRow } from './core.js'

/** 落盘的三种状态。`running` 不落盘，只活在客户端 runner 里。 */
export type FingerprintStatus = 'identified' | 'doubtful' | 'failed'

/** 结果卡「前三候选」里的一条。 */
export interface FingerprintTopEntry {
  model: string
  probability: number
  similarity: number
}

/**
 * 一个模型的一次检测结论，也是落盘的那一行。
 *
 * 这个形状放在这里而不是 store 里，是因为**前端画徽章要用它**：store 是
 * Node-only（`node:fs`），浏览器只能从纯模块取形状。判据、结果条目、结果行
 * 三者属于同一件事的三个面，拆开会各长各的。
 */
export interface FingerprintRecord {
  provider: string
  model: string
  status: FingerprintStatus
  checkedAt: number
  usedOutputs: number
  /** 仅 identified / doubtful 有值。 */
  prediction?: string
  predictionName?: string
  probability?: number
  familyPrediction?: string
  familyProbability?: number
  top?: FingerprintTopEntry[]
  calibration?: { queries: number; cvAccuracy: number }
  /** 仅 failed 有值，面向用户的失败原因。 */
  error?: string
}

/**
 * `identified` 的概率下界。
 *
 * 库里 18 个候选的均匀先验是 5.6%，0.6 已经是压倒性的；低于它就说明几个候选
 * 咬得很近，说「像」不负责任。
 */
export const IDENTIFIED_THRESHOLD = 0.6

/** 出一个确定结论需要的完整题数。 */
export const FULL_RUN_QUERIES = 3

/**
 * 取概率最高的前几名候选，供结果卡画条形。
 * @param rows - 已按概率降序排好的候选。
 * @param limit - 取几名，默认 3。
 * @returns 前 `limit` 条的模型 id、概率、相似度。
 */
export function topEntriesOf(rows: readonly ResultRow[], limit = 3): FingerprintTopEntry[] {
  return rows.slice(0, limit).map(row => ({
    model: row.model,
    probability: row.probability,
    similarity: row.profile_similarity,
  }))
}

/**
 * 把一次归属结论定级。
 *
 * 两道闸：概率必须够高，而且三题必须都有效。1 题的交叉验证准确率只有
 * 96.3%，不够撑一个确定结论 —— 所以有效题数不足一律降级为 `doubtful`，
 * 哪怕那一题的概率是 0.99。
 *
 * @param attribution - `analyzeGlobalOutputs` 的结果；失败时传 null。
 * @param usedOutputs - 有效题数。
 * @returns 落盘与画徽章共用的状态。
 */
export function statusOf(
  attribution: AttributionResult | null,
  usedOutputs: number,
): FingerprintStatus {
  if (attribution === null) return 'failed'
  if (usedOutputs < FULL_RUN_QUERIES) return 'doubtful'
  return attribution.probability >= IDENTIFIED_THRESHOLD ? 'identified' : 'doubtful'
}
