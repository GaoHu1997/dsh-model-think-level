import { describe, expect, it } from 'vitest'

import {
  ALPHA,
  DIMENSION,
  NO_USABLE_OUTPUT,
  ORDERED_BLOCK_WEIGHT,
  VALUE_MAX,
  VALUE_MIN,
  analyzeGlobalOutputs,
  countNumbers,
  parseNumbers,
  type Output,
} from '../src/fingerprint/core.js'
import { loadBankSync } from '../src/fingerprint/bank.js'
import * as upstream from './fixtures/modeltrace-fingerprint-core.mjs'

/** 可复现的取值序列（LCG，不用 crypto，保证每次跑同一份输入）。 */
function syntheticValues(seed: number, count: number): number[] {
  let state = (seed >>> 0) || 1
  const next = () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0
    return state / 0x100000000
  }
  return Array.from({ length: count }, () => VALUE_MIN + Math.floor(next() * DIMENSION))
}

function joinValues(values: number[]): string {
  return values.join(' ')
}

describe('constants match the upstream core', () => {
  it('keeps every numeric anchor', () => {
    expect(VALUE_MIN).toBe(upstream.VALUE_MIN)
    expect(VALUE_MAX).toBe(upstream.VALUE_MAX)
    expect(DIMENSION).toBe(upstream.DIMENSION)
    expect(ALPHA).toBe(upstream.ALPHA)
    expect(ORDERED_BLOCK_WEIGHT).toBe(upstream.ORDERED_BLOCK_WEIGHT)
    expect(DIMENSION).toBe(355)
    expect(ORDERED_BLOCK_WEIGHT).toBe(0.25)
  })
})

describe('parseNumbers', () => {
  it('takes the longest digit run and drops out-of-range values', () => {
    expect(parseNumbers('1 2 3')).toEqual([1, 2, 3])
    expect(parseNumbers('前 1 2 3；后 4 5')).toEqual([1, 2, 3])
    expect(parseNumbers('1 2 3 word 4 5 6 7')).toEqual([4, 5, 6, 7])
    // 356 越界被丢掉，但不断开 run。
    expect(parseNumbers('1 2 356 355')).toEqual([1, 2, 355])
    expect(parseNumbers('0 1 2')).toEqual([1, 2])
    expect(parseNumbers('')).toEqual([])
    expect(parseNumbers('no numbers here')).toEqual([])
  })

  it('matches the upstream parser exactly', () => {
    const samples = [
      '',
      'abc',
      '1 2 3',
      'a 1 2 3 b 4 5 6 7 8',
      '第1个 2 3\n4, 5; 6',
      '400 399 398 1 2 3 4 5 6',
      '1-2-3-4-5 word 6-7-8-9-10-11',
      '999999 1 2 3',
      'text123 456 789',
    ]
    for (const sample of samples) expect(parseNumbers(sample)).toEqual(upstream.parseNumbers(sample))
  })
})

describe('countNumbers', () => {
  it('bins into 355 counters and matches upstream', () => {
    const values = [1, 1, 355, 200]
    const counts = countNumbers(values)
    expect(counts).toHaveLength(DIMENSION)
    expect(counts[0]).toBe(2)
    expect(counts[354]).toBe(1)
    expect(counts[199]).toBe(1)
    expect(counts).toEqual(upstream.countNumbers(values))
  })
})

describe('analyzeGlobalOutputs parity with upstream ModelTrace', () => {
  const bank = loadBankSync()

  const cases: Array<{ name: string; outputs: Output[] }> = [
    {
      name: 'three clean synthetic answers',
      outputs: [
        { text: joinValues(syntheticValues(1, 300)), expected_count: 300 },
        { text: joinValues(syntheticValues(2, 312)), expected_count: 312 },
        { text: joinValues(syntheticValues(3, 296)), expected_count: 296 },
      ],
    },
    {
      name: 'one answer only',
      outputs: [{ text: joinValues(syntheticValues(7, 305)), expected_count: 305 }],
    },
    {
      name: 'two answers, one truncated away',
      outputs: [
        { text: joinValues(syntheticValues(11, 320)), expected_count: 320 },
        { text: '我不能生成随机数。', expected_count: 300 },
      ],
    },
    {
      name: 'commas and newlines as separators',
      outputs: [
        {
          text: syntheticValues(21, 300).reduce((line, value, index) => (index % 20 === 0 ? `${line}\n${value}` : `${line}, ${value}`), ''),
          expected_count: 300,
        },
        { text: joinValues(syntheticValues(22, 300)), expected_count: 300 },
      ],
    },
  ]

  for (const { name, outputs } of cases) {
    it(name, () => {
      const ours = analyzeGlobalOutputs(outputs, bank)
      const theirs = upstream.analyzeGlobalOutputs(outputs, bank)

      expect(ours.results).toEqual(theirs.results)
      expect(ours.diagnostics).toEqual(theirs.diagnostics)
      expect(ours.family_probabilities).toEqual(theirs.family_probabilities)
      expect(ours.used_outputs).toBe(theirs.used_outputs)
      expect(ours.prediction).toBe(theirs.prediction)
      expect(ours.prediction_name).toBe(theirs.prediction_name)
      expect(ours.probability).toBe(theirs.probability)
      expect(ours.family_prediction).toBe(theirs.family_prediction)
      expect(ours.family_prediction_name).toBe(theirs.family_prediction_name)
      expect(ours.family_probability).toBe(theirs.family_probability)
      expect(ours.method).toBe(theirs.method)
      expect(ours.calibration.beta).toBe(theirs.calibration.beta)
      expect(ours.calibration.cv_accuracy).toBe(theirs.calibration.cv_accuracy)
      // 上游这里返回的是字符串键，我们的契约里是数字。
      expect(ours.calibration.queries).toBe(Number(theirs.calibration.queries))
    })
  }

  it('rejects every answer with the upstream wording', () => {
    const refused = [{ text: '抱歉，我不能这样做。', expected_count: 300 }]
    expect(() => analyzeGlobalOutputs(refused, bank)).toThrow(NO_USABLE_OUTPUT)
    expect(() => upstream.analyzeGlobalOutputs(refused, bank)).toThrow(NO_USABLE_OUTPUT)
    expect(NO_USABLE_OUTPUT).toBe(
      '没有可用回答：请粘贴完整数字序列；拒答或严重截断的回答不会计入。',
    )
  })
})

describe('analyzeGlobalOutputs invariants', () => {
  const bank = loadBankSync()

  it('the shipped bank is the 2-family / 18-model bank', () => {
    expect(bank.models).toHaveLength(18)
    const families = new Set(bank.models.map((model) => model.family))
    expect([...families].sort()).toEqual(['claude', 'gpt'])
  })

  it('normalises to a distribution and ranks results', () => {
    const outputs: Output[] = [
      { text: joinValues(syntheticValues(31, 300)), expected_count: 300 },
      { text: joinValues(syntheticValues(32, 300)), expected_count: 300 },
      { text: joinValues(syntheticValues(33, 300)), expected_count: 300 },
    ]
    const result = analyzeGlobalOutputs(outputs, bank)

    expect(result.results).toHaveLength(18)
    const sum = result.results.reduce((total, row) => total + row.probability, 0)
    expect(sum).toBeCloseTo(1, 12)

    for (let index = 1; index < result.results.length; index += 1) {
      expect(result.results[index - 1].probability).toBeGreaterThanOrEqual(result.results[index].probability)
    }

    expect(result.prediction).toBe(result.results[0].model)
    expect(result.prediction_name).toBe(result.results[0].display_name)
    expect(result.probability).toBe(result.results[0].probability)
    expect(result.used_outputs).toBe(3)

    for (const row of result.results) {
      expect(row.probability).toBeGreaterThanOrEqual(0)
      expect(row.probability).toBeLessThanOrEqual(1)
      expect(row.profile_similarity).toBeGreaterThanOrEqual(0)
      expect(row.profile_similarity).toBeLessThanOrEqual(1)
      expect(row.conditional_probability).toBeGreaterThanOrEqual(0)
      expect(row.conditional_probability).toBeLessThanOrEqual(1)
    }

    const familySum = result.family_probabilities.reduce((total, entry) => total + entry.probability, 0)
    expect(familySum).toBeCloseTo(1, 12)
    for (const entry of result.family_probabilities) {
      const members = result.results.filter((row) => row.family === entry.family)
      const memberSum = members.reduce((total, row) => total + row.probability, 0)
      expect(memberSum).toBeCloseTo(entry.probability, 12)
      for (const row of members) {
        expect(row.conditional_probability).toBeCloseTo(row.probability / entry.probability, 12)
      }
    }
    expect(result.family_prediction).toBe(
      result.family_probabilities.reduce((best, entry) => (entry.probability > best.probability ? entry : best)).family,
    )
    expect(result.method).toBe('统一全局稳健数字指纹')
  })

  it('reports which answers were accepted and the threshold each faced', () => {
    const outputs: Output[] = [
      { text: joinValues(syntheticValues(41, 300)), expected_count: 300 },
      { text: joinValues(syntheticValues(42, 120)), expected_count: 300 },
      { text: '我拒绝。', expected_count: 300 },
    ]
    const result = analyzeGlobalOutputs(outputs, bank)
    expect(result.used_outputs).toBe(1)
    expect(result.diagnostics.map((entry) => entry.accepted)).toEqual([true, false, false])
    expect(result.diagnostics[0].minimum_numbers).toBe(165)
    expect(result.diagnostics[1].minimum_numbers).toBe(165)
    expect(result.diagnostics[1].parsed_numbers).toBe(120)
    expect(result.diagnostics[2].parsed_numbers).toBe(0)
    expect(result.calibration.queries).toBe(1)
  })

  it('is deterministic for the same answers', () => {
    const outputs: Output[] = [
      { text: joinValues(syntheticValues(51, 300)), expected_count: 300 },
    ]
    expect(analyzeGlobalOutputs(outputs, bank)).toEqual(analyzeGlobalOutputs(outputs, bank))
  })
})
