// 未检测行的成本提示里那个「约 X 秒」从哪来：同一家供应商已经测出来的耗时。
//
// 写死一个秒数会撒谎 —— 一次检测要等多久取决于上游，实测从十几秒到近一分钟都
// 有。所以这里只读已落盘的 `timing.durationMs`（有效回答里最慢那题的墙钟，见
// `verdict.ts`），取**中位数**：一次抽风的慢样本不该把整页提示拖成「约 1 分钟」，
// 一家四五个模型里有一两个失败重跑也不该改写常识。一个样本都没有就返回
// `undefined`，提示只报题数 —— 没测过就别说知道要多久。
//
// 纯函数、零依赖，跟 `verdict.ts` 一样客户端和测试都能直接跑。

import type { FingerprintRecord } from './verdict.js'

/** 提示里的时长：秒按 5 秒取整，过了 75 秒改报整分钟。 */
export type RunEstimate = { unit: 'seconds'; value: number } | { unit: 'minutes'; value: number }

/** 过了这个秒数就换单位 —— 「约 95 秒」不如「约 2 分钟」好读。 */
const MINUTES_FROM_SECONDS = 75

/**
 * 估一次完整检测（`FULL_RUN_QUERIES` 题）大概要等多久。
 *
 * @param records - 同一家供应商已落盘的结论，顺序任意，缺 timing 的跳过。
 * @returns 没有任何可参考的耗时时返回 `undefined`。
 */
export function estimateRun(records: readonly FingerprintRecord[]): RunEstimate | undefined {
  const samples: number[] = []
  for (const record of records) {
    const ms = record.timing?.durationMs
    if (typeof ms === 'number' && Number.isFinite(ms) && ms > 0) samples.push(ms)
  }
  if (samples.length === 0) return undefined
  samples.sort((a, b) => a - b)
  const mid = samples.length >> 1
  const median = samples.length % 2 === 1 ? samples[mid] : (samples[mid - 1] + samples[mid]) / 2
  const seconds = median / 1000
  if (seconds >= MINUTES_FROM_SECONDS) {
    return { unit: 'minutes', value: Math.max(1, Math.round(seconds / 60)) }
  }
  return { unit: 'seconds', value: Math.max(5, Math.round(seconds / 5) * 5) }
}
