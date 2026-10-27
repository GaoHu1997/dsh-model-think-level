/**
 * `estimateRun`: 未检测行的「约 X 秒」是从哪来的。
 *
 * 它取代了一个写死的 15 秒 —— 那个数字在真实上游上会被差出三四倍，所以这里
 * 只守卫一件事：说明白用的样本（已落盘的 `timing.durationMs`）、抗单个离群
 * 样本（中位数）、以及**没有样本时什么都不说**。最后一条是这次修正的重点：
 * 没测过就报一个秒数是在替上游打包票。
 */

import { describe, expect, it } from 'vitest'
import { estimateRun } from '../src/fingerprint/estimate.js'
import type { FingerprintRecord } from '../src/fingerprint/verdict.js'

/** 一条已落盘的结论，只关心耗时。 */
function record(model: string, durationMs: number | undefined, over: Partial<FingerprintRecord> = {}): FingerprintRecord {
  return {
    provider: 'magpie',
    model,
    status: 'identified',
    checkedAt: 1_700_000_000_000,
    usedOutputs: 3,
    timing: durationMs === undefined ? undefined : { durationMs },
    ...over,
  }
}

describe('estimateRun', () => {
  it('says nothing before this route has measured a single run', () => {
    expect(estimateRun([])).toBeUndefined()
    expect(estimateRun([record('gpt-5.5', undefined), record('claude-sonnet-5', undefined)])).toBeUndefined()
  })

  it('reads the stored wall time and rounds it to five seconds', () => {
    expect(estimateRun([record('gpt-5.5', 18_000)])).toEqual({ unit: 'seconds', value: 20 })
    expect(estimateRun([record('gpt-5.5', 21_000)])).toEqual({ unit: 'seconds', value: 20 })
  })

  it('never claims less than five seconds', () => {
    expect(estimateRun([record('gpt-5.5', 1_200)])).toEqual({ unit: 'seconds', value: 5 })
  })

  it('takes the median, so one slow run does not redefine the whole page', () => {
    // Two normal runs and one that hit a queue: 22s is the honest answer.
    const records = [record('a', 20_000), record('b', 22_000), record('c', 240_000)]
    expect(estimateRun(records)).toEqual({ unit: 'seconds', value: 20 })
  })

  it('switches to whole minutes past a minute of measured wait', () => {
    expect(estimateRun([record('a', 75_000)])).toEqual({ unit: 'minutes', value: 1 })
    expect(estimateRun([record('a', 95_000)])).toEqual({ unit: 'minutes', value: 2 })
    expect(estimateRun([record('a', 150_000)])).toEqual({ unit: 'minutes', value: 3 })
  })

  it('ignores timings that cannot describe a real run', () => {
    // Failed runs land no timing; a corrupted store must not turn into "0s".
    const broken = [
      record('a', 0),
      record('b', -1_000),
      record('c', Number.NaN),
      record('d', Number.POSITIVE_INFINITY),
    ]
    expect(estimateRun(broken)).toBeUndefined()
    expect(estimateRun([...broken, record('e', 30_000)])).toEqual({ unit: 'seconds', value: 30 })
  })
})
