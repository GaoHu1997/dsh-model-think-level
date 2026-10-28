/**
 * The size ladder the picker shows: three friendly tiers over the pixel values
 * the wire gets. These tests pin the mapping, including the legacy sizes old
 * configs still hold and the tie-break that keeps the smaller tier.
 */

import { describe, expect, it } from 'vitest'
import { canonicalSize, IMAGE_SIZE_TIERS, longestEdge, sizeLabel, tierOfSize } from '../src/image/sizes.js'

describe('IMAGE_SIZE_TIERS', () => {
  it('offers exactly 1K/2K/4K over square pixel values, ascending', () => {
    expect(IMAGE_SIZE_TIERS.map(tier => tier.label)).toEqual(['1K', '2K', '4K'])
    expect(IMAGE_SIZE_TIERS.map(tier => tier.value)).toEqual(['1024x1024', '2048x2048', '4096x4096'])
    expect(IMAGE_SIZE_TIERS.map(tier => tier.edge)).toEqual([1024, 2048, 4096])
  })
})

describe('longestEdge', () => {
  it('reads either orientation and rejects other spellings', () => {
    expect(longestEdge('1024x1024')).toBe(1024)
    expect(longestEdge('1536x1024')).toBe(1536)
    expect(longestEdge('1024x1536')).toBe(1536)
    expect(longestEdge(' 2048x2048 ')).toBe(2048)
    expect(longestEdge('2K')).toBeUndefined()
    expect(longestEdge('1024*1024')).toBeUndefined()
  })
})

describe('tierOfSize', () => {
  it('maps the canonical tier values to themselves', () => {
    expect(tierOfSize('1024x1024').label).toBe('1K')
    expect(tierOfSize('2048x2048').label).toBe('2K')
    expect(tierOfSize('4096x4096').label).toBe('4K')
  })

  it('maps legacy landscape/portrait sizes to the nearest edge, ties downward', () => {
    // 1536 sits 512 from both 1024 and 2048; the smaller tier wins.
    expect(tierOfSize('1536x1024').label).toBe('1K')
    expect(tierOfSize('1024x1536').label).toBe('1K')
    // 512 is nearer 1024 than 2048.
    expect(tierOfSize('512x512').label).toBe('1K')
    // Above 4K clamps to the largest tier.
    expect(tierOfSize('8192x8192').label).toBe('4K')
  })

  it('reads unparsable sizes as the smallest tier', () => {
    expect(tierOfSize('').label).toBe('1K')
    expect(tierOfSize('auto').label).toBe('1K')
  })
})

describe('sizeLabel and canonicalSize', () => {
  it('render the tier label and the wire value', () => {
    expect(sizeLabel('2048x2048')).toBe('2K')
    expect(sizeLabel('1024x1536')).toBe('1K')
    expect(canonicalSize('1536x1024')).toBe('1024x1024')
    expect(canonicalSize('4096x4096')).toBe('4096x4096')
  })
})
