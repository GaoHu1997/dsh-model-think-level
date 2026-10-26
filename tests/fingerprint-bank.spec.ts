import { describe, expect, it } from 'vitest'

import { DIMENSION } from '../src/fingerprint/core.js'
import { bankBuiltAt, loadBankSync, parseBank, summarizeBank } from '../src/fingerprint/bank.js'

function counts(fill = 1): number[] {
  return Array<number>(DIMENSION).fill(fill)
}

function minimalBank(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  const rows = 2
  const artifact = {
    feature_mean: counts(0),
    feature_scale: counts(1),
    nuisance_basis: [counts(0.1), counts(0.2)],
    centroids: [counts(0.3), counts(0.4)],
    weight: 0.25,
    environment_centroids: [[counts(0.5), counts(0.6)]],
  }
  return {
    schema: 'robust-number-fingerprint-bank',
    built_at: 'now',
    recommended_queries: 3,
    models: [
      { id: 'gpt-x', display_name: 'gpt-x', family: 'gpt', family_name: 'GPT', counts: counts(1) },
      { id: 'claude-y', display_name: 'claude-y', family: 'claude', family_name: 'Claude', counts: counts(2) },
    ],
    robust: {
      hellinger: { ...artifact, weight: undefined, environment_centroids: undefined },
      ordered_blocks: artifact,
    },
    calibration: {
      '1': { beta: 7.1, cv_accuracy: 0.96 },
      '2': { beta: 12, cv_accuracy: 0.99 },
      '3': { beta: 12, cv_accuracy: 1 },
    },
    ...overrides,
    robust_rows: rows,
  }
}

describe('parseBank', () => {
  it('accepts a well-formed bank', () => {
    expect(() => parseBank(minimalBank())).not.toThrow()
  })

  it.each([
    ['root is not an object', 7],
    ['models missing', { models: [] }],
    ['models entry missing counts', { models: [{ id: 'a', display_name: 'a', family: 'gpt' }] }],
    [
      'centroids misaligned with models',
      {
        robust: {
          hellinger: {
            feature_mean: counts(0),
            feature_scale: counts(1),
            nuisance_basis: [counts(0)],
            centroids: [counts(0.3)],
          },
          ordered_blocks: {
            feature_mean: counts(0),
            feature_scale: counts(1),
            nuisance_basis: [counts(0)],
            centroids: [counts(0.3), counts(0.4)],
            environment_centroids: [[counts(0), counts(0)]],
          },
        },
      },
    ],
    ['calibration incomplete', { calibration: { '1': { beta: 1, cv_accuracy: 1 } } }],
  ])('rejects %s', (_name, overrides) => {
    const raw = overrides as Record<string, unknown>
    const bank = raw['models'] !== undefined || raw['robust'] !== undefined || raw['calibration'] !== undefined
      ? { ...minimalBank(), ...raw }
      : raw
    expect(() => parseBank(bank)).toThrow(/^fingerprint bank: /)
  })
})

describe('the shipped bank', () => {
  const bank = loadBankSync()

  it('parses and reports its provenance', () => {
    expect(bankBuiltAt(bank).length).toBeGreaterThan(0)
    expect(bank.models).toHaveLength(18)
  })

  it('summarises for the front end', () => {
    const summary = summarizeBank(bank)
    expect(summary.builtAt).toBe(bankBuiltAt(bank))
    expect(summary.models).toHaveLength(18)
    expect(summary.families.map((entry) => entry.family).sort()).toEqual(['claude', 'gpt'])
    expect(summary.families.reduce((total, entry) => total + entry.models, 0)).toBe(18)
    expect(summary.models[0]).toMatchObject({ family: expect.any(String), displayName: expect.any(String) })
    expect(summary.recommendedQueries).toBe(3)
  })

  it('is memoised', () => {
    expect(loadBankSync()).toBe(bank)
  })
})
