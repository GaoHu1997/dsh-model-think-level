/**
 * The two capacity fields accept the spellings users actually write: plain
 * digits, grouped digits, and the catalogue's K/M shorthand. The official
 * host's own parser only knows digits, so this parser is the one place the
 * shorthand becomes a token count before it reaches that form.
 */

import { describe, expect, it } from 'vitest'
import { capacityText, parseCapacity } from '../src/client/capacity.js'

describe('parseCapacity', () => {
  it('reads plain and grouped digits', () => {
    expect(parseCapacity('1048576')).toBe(1_048_576)
    expect(parseCapacity('1,048,576')).toBe(1_048_576)
    expect(parseCapacity('128000')).toBe(128_000)
  })

  it('reads K and M suffixes, case-insensitively and with spaces', () => {
    expect(parseCapacity('128K')).toBe(128_000)
    expect(parseCapacity('128k')).toBe(128_000)
    expect(parseCapacity('1M')).toBe(1_000_000)
    expect(parseCapacity('1.5m')).toBe(1_500_000)
    expect(parseCapacity('128 K')).toBe(128_000)
  })

  it('treats blank and malformed text as an empty capacity', () => {
    // Empty is "inherit the catalogue value", not zero: the official field is
    // cleared, never filled with "0".
    expect(parseCapacity('')).toBeUndefined()
    expect(parseCapacity('   ')).toBeUndefined()
    expect(parseCapacity('lots')).toBeUndefined()
    expect(parseCapacity('1G')).toBeUndefined()
    expect(parseCapacity('-1M')).toBeUndefined()
    expect(parseCapacity('0')).toBeUndefined()
  })

  it('formats a count as grouped digits and an empty field as empty', () => {
    expect(capacityText(1_048_576)).toBe('1,048,576')
    expect(capacityText(128_000)).toBe('128,000')
    expect(capacityText(undefined)).toBe('')
  })
})
