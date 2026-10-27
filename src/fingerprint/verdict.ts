// 判定一次归属结论的等级：`identified` / `doubtful` / `failed`。
//
// 纯函数、零依赖，客户端（画徽章）和宿主（写落盘）共用同一个判据 ——
// 不能让「显示的等级」和「存下来的等级」各算一套。
// 见 docs/fingerprint-design.md §4.3。

import type { AttributionResult, ResultRow } from './core.js'

/** 落盘的三种状态。`running` 不落盘，只活在客户端 runner 里。 */
export type FingerprintStatus = 'identified' | 'doubtful' | 'failed'

/**
 * 检测的耗时画像（可选）：给结果卡一句「慢在哪」。只收统计量 —— 首 token
 * 等待、整次墙钟、按「总时长 − 首 token 等待」折出的吐字速度；原始文本
 * 从不落盘（design §4.2）。
 */
export interface FingerprintTiming {
  /** 有效回答里最慢的首 token 等待，毫秒。 */
  firstTokenMs?: number
  /** 有效回答里最慢的整题耗时（墙钟 ≈ 用户等的时间），毫秒。 */
  durationMs?: number
  /** 有效回答合计的可见字符 ÷ 合计纯吐字时长，字符/秒。 */
  charsPerSecond?: number
}

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
  /** 本次检测的耗时画像，检测失败时没有意义，不落盘。 */
  timing?: FingerprintTiming
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
 * 两题早停判 `identified` 的概率下界。
 *
 * 银行自带 2 题校准：交叉验证准确率 99.7%（646/648），beta≈12 让概率分布
 * 非常尖。0.9 在那套校准下仍是保守门槛 —— 池化概率到不了 0.9 就继续等第三
 * 题，走三题的完整判据，所以早停只会提前、不会放宽。
 */
export const EARLY_IDENTIFIED_PROBABILITY = 0.9

/** 早停最少需要的有效题数（两题）。 */
export const EARLY_IDENTIFIED_QUERIES = 2

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
 * 三道闸：概率必须够高，题数必须够多，多到哪一档就用哪一档的门槛。三题全有
 * 效走 0.6；两题有效走 0.9（早停或第三题意外作废时，银行 2 题校准的交叉验证
 * 准确率 99.7% 撑得起，但门槛相应收紧）；1 题的交叉验证准确率只有 96.3%，
 * 撑不起任何确定结论 —— 一律 `doubtful`，哪怕那一题的概率是 0.99。
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
  if (usedOutputs >= FULL_RUN_QUERIES) {
    return attribution.probability >= IDENTIFIED_THRESHOLD ? 'identified' : 'doubtful'
  }
  if (usedOutputs >= EARLY_IDENTIFIED_QUERIES) {
    return attribution.probability >= EARLY_IDENTIFIED_PROBABILITY ? 'identified' : 'doubtful'
  }
  return 'doubtful'
}
