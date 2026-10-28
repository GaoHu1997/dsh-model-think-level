import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import {
  emptyFingerprintStore,
  fingerprintFilePath,
  parseFingerprintStore,
  providerRecords,
  readFingerprintStore,
  recordKeyOf,
  updateFingerprintStore,
  withRecord,
  withoutRecord,
  writeFingerprintStore,
  type FingerprintRecord,
} from '../src/fingerprint/store.js'

const BANK = '2026-10-20T00:00:00Z'

function record(overrides: Partial<FingerprintRecord> = {}): FingerprintRecord {
  return {
    provider: 'magpie',
    model: 'gpt-5.5',
    status: 'identified',
    checkedAt: 1761540000000,
    usedOutputs: 3,
    prediction: 'gpt-5.5',
    predictionName: 'gpt-5.5',
    probability: 0.912,
    familyPrediction: 'gpt',
    familyProbability: 0.977,
    top: [{ model: 'gpt-5.5', probability: 0.912, similarity: 0.71 }],
    calibration: { queries: 3, cvAccuracy: 1 },
    timing: { firstTokenMs: 1200, durationMs: 41_000, charsPerSecond: 437.5 },
    ...overrides,
  }
}

describe('recordKeyOf', () => {
  it('separates provider and model with a NUL', () => {
    expect(recordKeyOf('magpie', 'gpt-5.5')).toBe('magpie\u0000gpt-5.5')
  })
})

describe('parseFingerprintStore', () => {
  it('accepts a well-formed document', () => {
    const document = parseFingerprintStore(
      { version: 1, bankBuiltAt: BANK, records: { 'magpie\u0000gpt-5.5': record() } },
      BANK,
    )
    expect(document.bankBuiltAt).toBe(BANK)
    expect(document.records['magpie\u0000gpt-5.5'].probability).toBeCloseTo(0.912)
  })

  it('drops the whole history when the bank changed', () => {
    const document = parseFingerprintStore(
      { version: 1, bankBuiltAt: '2020-01-01', records: { 'magpie\u0000gpt-5.5': record() } },
      BANK,
    )
    expect(document).toEqual(emptyFingerprintStore(BANK))
  })

  it('drops bad entries without losing the good ones', () => {
    const document = parseFingerprintStore(
      {
        version: 1,
        bankBuiltAt: BANK,
        records: {
          'magpie\u0000gpt-5.5': record(),
          'bad-key-without-nul': record(),
          'magpie\u0000': record(),
          'gemini\u0000gemini-2.5': { ...record(), status: 'unsupported' },
          'magpie\u0000gpt-6': { ...record(), status: 'failed', error: '三题全废' },
          'qwen\u0000qwen3': 'not an object',
        },
      },
      BANK,
    )
    expect(Object.keys(document.records).sort()).toEqual([
      'magpie\u0000gpt-5.5',
      'magpie\u0000gpt-6',
    ])
    expect(document.records['magpie\u0000gpt-6'].error).toBe('三题全废')
    expect(document.records['magpie\u0000gpt-6'].prediction).toBeUndefined()
  })

  it('tolerates junk roots', () => {
    for (const raw of [null, undefined, 0, 'x', [], { records: [] }, { bankBuiltAt: BANK, records: 7 }]) {
      expect(parseFingerprintStore(raw, BANK)).toEqual(emptyFingerprintStore(BANK))
    }
  })

  it('keeps at most three top candidates', () => {
    const document = parseFingerprintStore(
      {
        version: 1,
        bankBuiltAt: BANK,
        records: {
          'm\u0000x': record({
            top: [
              { model: 'a', probability: 1, similarity: 1 },
              { model: 'b', probability: 2, similarity: 1 },
              { model: 'c', probability: 3, similarity: 1 },
              { model: 'd', probability: 4, similarity: 1 },
            ],
          }),
        },
      },
      BANK,
    )
    expect(document.records['m\u0000x'].top?.map((entry) => entry.model)).toEqual(['a', 'b', 'c'])
  })

  it('round-trips the timing picture and keeps only finite non-negative members', () => {
    const document = parseFingerprintStore(
      {
        version: 1,
        bankBuiltAt: BANK,
        records: {
          'm\u0000good': record(),
          'm\u0000partial': record({
            model: 'gpt-5.4',
            timing: { firstTokenMs: 900, durationMs: -5, charsPerSecond: Number.NaN },
          }),
          'm\u0000junk': record({ model: 'gpt-6-sol', timing: 'fast' as unknown as FingerprintRecord['timing'] }),
          'm\u0000empty': record({ model: 'claude-sonnet-5', timing: {} }),
        },
      },
      BANK,
    )
    expect(document.records['m\u0000good'].timing).toEqual({
      firstTokenMs: 1200,
      durationMs: 41_000,
      charsPerSecond: 437.5,
    })
    // Negative and NaN members are dropped; the meaningful one stays.
    expect(document.records['m\u0000partial'].timing).toEqual({ firstTokenMs: 900 })
    expect(document.records['m\u0000junk'].timing).toBeUndefined()
    // An object with nothing usable in it is no timing at all.
    expect(document.records['m\u0000empty'].timing).toBeUndefined()
  })

  it('round-trips the per-challenge ledger, even on a failed verdict', () => {
    // 逐题账本记的是「尝试」而不是「结论」：三题全废时它照样留下来，否则用户
    // 看着 failed 无从知道是哪一题没答、答回来多少。
    const ledger = [
      { index: 1, expected: 312, parsed: 312, accepted: true },
      { index: 2, expected: 332, parsed: 121, accepted: false },
      { index: 3, expected: 315, parsed: 0, accepted: false, skipped: true },
    ]
    const document = parseFingerprintStore(
      {
        version: 1,
        bankBuiltAt: BANK,
        records: {
          'm\u0000kept': record({ challenges: ledger }),
          'm\u0000failed': record({
            model: 'gpt-5.4',
            status: 'failed',
            error: 'no usable output',
            challenges: ledger,
          }),
        },
      },
      BANK,
    )
    expect(document.records['m\u0000kept'].challenges).toEqual(ledger)
    expect(document.records['m\u0000failed'].challenges).toEqual(ledger)
    // 但结论类字段照旧被剥掉。
    expect(document.records['m\u0000failed'].probability).toBeUndefined()
  })

  it('drops a malformed ledger instead of inventing questions', () => {
    // 不是数组、空数组、整条读不懂 → 没有账本。编一个「0 / 0」比少一行更糟。
    const document = parseFingerprintStore(
      {
        version: 1,
        bankBuiltAt: BANK,
        records: {
          'm\u0000junk': record({ challenges: 'three' as unknown as FingerprintRecord['challenges'] }),
          'm\u0000partial': record({
            model: 'gpt-5.4',
            challenges: [
              'nope' as unknown as NonNullable<FingerprintRecord['challenges']>[number],
              { index: 2, expected: -5, parsed: Number.NaN, accepted: 'yes' } as unknown as
                NonNullable<FingerprintRecord['challenges']>[number],
            ],
          }),
          'm\u0000empty': record({ model: 'claude-sonnet-5', challenges: [] }),
          'm\u0000capped': record({
            model: 'claude-opus-5',
            challenges: Array.from({ length: 5 }, (_, position) => ({
              index: position + 1,
              expected: 300,
              parsed: 300,
              accepted: true,
            })),
          }),
        },
      },
      BANK,
    )
    expect(document.records['m\u0000junk'].challenges).toBeUndefined()
    expect(document.records['m\u0000empty'].challenges).toBeUndefined()
    // 坏的那条被丢掉，能读的留下；负数与非有限数落到 0，accepted 只认 true。
    expect(document.records['m\u0000partial'].challenges).toEqual([
      { index: 2, expected: 0, parsed: 0, accepted: false },
    ])
    // 题目只有三道，多出来的账本行不认。
    expect(document.records['m\u0000capped'].challenges).toHaveLength(3)
  })

  it('strips the timing from a failed verdict alongside the attribution fields', () => {
    const document = parseFingerprintStore(
      {
        version: 1,
        bankBuiltAt: BANK,
        records: { 'm\u0000x': record({ status: 'failed', error: 'error: rate limited' }) },
      },
      BANK,
    )
    const failed = document.records['m\u0000x']
    expect(failed.prediction).toBeUndefined()
    expect(failed.timing).toBeUndefined()
  })
})

describe('file round-trip', () => {
  let directory: string
  let file: string

  beforeEach(() => {
    directory = mkdtempSync(join(tmpdir(), 'dsh-fingerprint-'))
    file = join(directory, 'fingerprint.json')
  })

  afterEach(() => {
    rmSync(directory, { recursive: true, force: true })
  })

  it('defaults the plugin data path to the DSH home', () => {
    expect(fingerprintFilePath('/home/x')).toBe(join('/home/x', 'dsh-model-think-level', 'fingerprint.json'))
  })

  it('returns an empty store when the file is absent', () => {
    expect(readFingerprintStore(BANK, file)).toEqual(emptyFingerprintStore(BANK))
  })

  it('returns an empty store when the file is corrupt, without throwing', () => {
    writeFileSync(file, '{ not json', 'utf8')
    expect(readFingerprintStore(BANK, file)).toEqual(emptyFingerprintStore(BANK))
  })

  it('writes atomically and reads back', () => {
    const document = withRecord(emptyFingerprintStore(BANK), record())
    writeFingerprintStore(document, file)
    expect(readFingerprintStore(BANK, file)).toEqual(document)
    expect(readFileSync(file, 'utf8').endsWith('\n')).toBe(true)
  })

  it('updateFingerprintStore reads, mutates and writes in one call', () => {
    const first = updateFingerprintStore((current) => withRecord(current, record()), BANK, file)
    expect(Object.keys(first.records)).toHaveLength(1)
    const second = updateFingerprintStore(
      (current) => withRecord(current, record({ provider: 'magpie', model: 'claude-opus-5', status: 'doubtful', probability: 0.4 })),
      BANK,
      file,
    )
    expect(Object.keys(second.records)).toHaveLength(2)
    expect(readFingerprintStore(BANK, file).records['magpie\u0000claude-opus-5'].status).toBe('doubtful')
  })

  it('withoutRecord removes one line and stays unchanged when absent', () => {
    const document = withRecord(emptyFingerprintStore(BANK), record())
    const removed = withoutRecord(document, 'magpie', 'gpt-5.5')
    expect(removed.records).toEqual({})
    expect(withoutRecord(removed, 'magpie', 'gpt-5.5')).toEqual(removed)
  })

  it('providerRecords narrows to one provider', () => {
    const document = withRecord(
      withRecord(emptyFingerprintStore(BANK), record()),
      record({ provider: 'other', model: 'gpt-5.5' }),
    )
    expect(providerRecords(document, 'magpie')).toHaveLength(1)
    expect(providerRecords(document, 'nobody')).toHaveLength(0)
  })
})
