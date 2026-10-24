/**
 * The cross-key catalogue: one merged model list from several keys' listings.
 *
 * Two properties matter more than the merge itself, and both are what the
 * gateway practice this mirrors guarantees: a shared model is ONE entry naming
 * every key that serves it (not two rows), and a key that fails to answer keeps
 * the models it was last seen serving (a transient 429 does not shrink the
 * catalogue).
 */
import { describe, expect, it, vi } from 'vitest'

import {
  collectKeyListings,
  DEFAULT_PROBE_CONCURRENCY,
  mergeKeyListings,
  type MergedListing,
} from '../src/multi-key-listing.js'
import type { KeyProbeResult } from '../src/key-probe.js'

/** One probe result naming the ids a key advertised (undefined = no answer). */
function result(ref: string, models?: readonly string[]): KeyProbeResult {
  return {
    ref,
    models: models === undefined ? undefined : [...models],
    targets: [],
  }
}

/** The ids of a merge, in catalogue order. */
function idsOf(listing: MergedListing): string[] {
  return [...listing.ids]
}

describe('mergeKeyListings', () => {
  it('keeps first-advertised order and names every key serving one model', () => {
    const merged = mergeKeyListings([
      result('A', ['glm-4', 'glm-4-flash']),
      result('B', ['kimi-k2', 'glm-4']),
    ])

    expect(idsOf(merged)).toEqual(['glm-4', 'glm-4-flash', 'kimi-k2'])
    expect(merged.models).toEqual([
      { id: 'glm-4', keys: ['A', 'B'] },
      { id: 'glm-4-flash', keys: ['A'] },
      { id: 'kimi-k2', keys: ['B'] },
    ])
    expect(merged.answered).toEqual(['A', 'B'])
    expect(merged.retained).toEqual([])
    expect(merged.unreadable).toEqual([])
  })

  it('dedupes inside one key and drops blank ids', () => {
    const merged = mergeKeyListings([result('A', ['glm-4', ' glm-4 ', '', '  '])])

    expect(merged.models).toEqual([{ id: 'glm-4', keys: ['A'] }])
  })

  it('keeps a failing key\'s last-known models instead of shrinking the catalogue', () => {
    const lastKnown = new Map([['B', ['kimi-k2']]])
    const merged = mergeKeyListings(
      [result('A', ['glm-4']), result('B')],
      lastKnown,
    )

    expect(idsOf(merged)).toEqual(['glm-4', 'kimi-k2'])
    expect(merged.unreadable).toEqual(['B'])
    expect(merged.retained).toEqual(['B'])
    expect(merged.answered).toEqual(['A'])
  })

  it('drops a failing key that was never seen serving anything', () => {
    const merged = mergeKeyListings([result('A', ['glm-4']), result('B')])

    expect(idsOf(merged)).toEqual(['glm-4'])
    expect(merged.retained).toEqual([])
    expect(merged.unreadable).toEqual(['B'])
  })

  it('counts a key once even when the same ref appears twice', () => {
    const merged = mergeKeyListings([result('A', ['glm-4']), result('A', ['kimi-k2'])])

    expect(idsOf(merged)).toEqual(['glm-4'])
    expect(merged.answered).toEqual(['A'])
  })

  it('answers an empty list for no keys at all', () => {
    expect(mergeKeyListings([])).toEqual({
      models: [],
      ids: [],
      answered: [],
      unreadable: [],
      retained: [],
    })
  })
})

describe('collectKeyListings', () => {
  it('reports results in key order even when the last key answers first', async () => {
    const keys = ['A', 'B', 'C']
    const { results, merged } = await collectKeyListings({
      keys,
      // A answers last, C first: the catalogue must still read A, B, C.
      probe: async key => {
        await new Promise(resolve => setTimeout(resolve, key === 'A' ? 20 : 0))
        return result(key, [`model-${key}`])
      },
    })

    expect(results.map(entry => entry.ref)).toEqual(['A', 'B', 'C'])
    expect(idsOf(merged)).toEqual(['model-A', 'model-B', 'model-C'])
  })

  it('probes no more keys at once than the bound allows', async () => {
    let inFlight = 0
    let peak = 0
    const keys = ['A', 'B', 'C', 'D', 'E']
    await collectKeyListings({
      keys,
      concurrency: 2,
      probe: async key => {
        inFlight += 1
        peak = Math.max(peak, inFlight)
        await new Promise(resolve => setTimeout(resolve, 5))
        inFlight -= 1
        return result(key, [`model-${key}`])
      },
    })

    expect(peak).toBe(2)
  })

  it('never probes more keys than there are', async () => {
    const probe = vi.fn(async (key: string) => result(key, [`model-${key}`]))
    const { results } = await collectKeyListings({ keys: ['A'], probe, concurrency: DEFAULT_PROBE_CONCURRENCY })

    expect(probe).toHaveBeenCalledTimes(1)
    expect(results).toHaveLength(1)
  })

  it('records a throwing probe as no answer, so its last-known scope survives', async () => {
    const lastKnown = new Map([['B', ['kept-by-B']]])
    const { merged } = await collectKeyListings({
      keys: ['A', 'B'],
      lastKnown,
      refOf: key => key,
      probe: async key => {
        if (key === 'B') throw new Error('network down')
        return result(key, ['model-A'])
      },
    })

    expect(idsOf(merged)).toEqual(['model-A', 'kept-by-B'])
    expect(merged.retained).toEqual(['B'])
  })
})
