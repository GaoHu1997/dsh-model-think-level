/**
 * The verdict grader: the one function both the badge (browser) and the store
 * (host) answer to, so a shown status and a saved status can never drift apart.
 * The interesting branches are the downgrades — an incomplete run, and a
 * probability that lands exactly on the threshold.
 */

import { describe, expect, it } from 'vitest'
import type { AttributionResult, ResultRow } from '../src/fingerprint/core.js'
import {
  EARLY_IDENTIFIED_PROBABILITY,
  EARLY_IDENTIFIED_QUERIES,
  IDENTIFIED_THRESHOLD,
  statusOf,
  topEntriesOf,
  FULL_RUN_QUERIES,
} from '../src/fingerprint/verdict.js'

/** A minimal attribution: the grader reads the probability, nothing else. */
function attribution(probability: number): AttributionResult {
  return {
    prediction: 'gpt-5.5',
    prediction_name: 'gpt-5.5',
    probability,
    used_outputs: FULL_RUN_QUERIES,
    results: [],
    diagnostics: [],
    calibration: { queries: FULL_RUN_QUERIES, beta: 1, cv_accuracy: 1 },
    family_prediction: 'gpt',
    family_prediction_name: 'gpt',
    family_probability: 0.9,
    family_probabilities: [],
    method: 'attribution',
  } as unknown as AttributionResult
}

/** One ranked candidate, as the attribution's results carry them. */
function row(model: string, probability: number, profile_similarity: number): ResultRow {
  return {
    model,
    display_name: model,
    probability,
    profile_similarity,
    score: probability,
    family: 'gpt',
    family_name: 'gpt',
    conditional_probability: probability,
  }
}

describe('statusOf', () => {
  it('answers failed for a transport that produced no attribution', () => {
    expect(statusOf(null, FULL_RUN_QUERIES)).toBe('failed')
  })

  it('grades a complete run by the probability threshold, edge included', () => {
    expect(statusOf(attribution(IDENTIFIED_THRESHOLD), FULL_RUN_QUERIES)).toBe('identified')
    // Just under: several candidates biting close — "doubtful" is the honest word.
    expect(statusOf(attribution(IDENTIFIED_THRESHOLD - 0.001), FULL_RUN_QUERIES)).toBe('doubtful')
  })

  it('lets two confident answers carry a verdict at a STRICTER bar', () => {
    // The bank's 2-query calibration cross-validates at 99.7% — an early exit
    // or a dead third challenge can close on two answers, but only when the
    // probability clears the raised bar.
    expect(statusOf(attribution(EARLY_IDENTIFIED_PROBABILITY), EARLY_IDENTIFIED_QUERIES)).toBe('identified')
    expect(statusOf(attribution(0.99), EARLY_IDENTIFIED_QUERIES)).toBe('identified')
    // Just under the raised bar: wait for the third answer instead of guessing.
    expect(statusOf(attribution(EARLY_IDENTIFIED_PROBABILITY - 0.001), EARLY_IDENTIFIED_QUERIES)).toBe('doubtful')
    // The ordinary 3-query bar does NOT qualify on two answers.
    expect(statusOf(attribution(IDENTIFIED_THRESHOLD), EARLY_IDENTIFIED_QUERIES)).toBe('doubtful')
  })

  it('still refuses a single answer, however overwhelming', () => {
    // One prompt's cross-validation accuracy (96.3%) cannot carry a certainty.
    expect(statusOf(attribution(0.99), 1)).toBe('doubtful')
    expect(statusOf(attribution(0.99), 0)).toBe('doubtful')
  })
})

describe('topEntriesOf', () => {
  it('takes the leading rows with the fields the result card draws', () => {
    const rows = [
      row('a', 0.7, 0.81),
      row('b', 0.2, 0.4),
      row('c', 0.06, 0.2),
      row('d', 0.04, 0.1),
    ]
    expect(topEntriesOf(rows)).toEqual([
      { model: 'a', probability: 0.7, similarity: 0.81 },
      { model: 'b', probability: 0.2, similarity: 0.4 },
      { model: 'c', probability: 0.06, similarity: 0.2 },
    ])
    // The bar list is capped, not the attribution itself.
    expect(topEntriesOf(rows, 2)).toHaveLength(2)
    expect(topEntriesOf([], 3)).toEqual([])
  })
})
