/**
 * The two capacity fields accept the spellings users actually write: plain
 * digits, grouped digits, and the catalogue's K/M shorthand. The official
 * host's own parser only knows digits, so this parser is the one place the
 * shorthand becomes a token count before it reaches that form.
 */

import { describe, expect, it } from 'vitest'
import { capacityShort, capacityText, parseCapacity } from '../src/client/capacity.js'

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

describe('B and T suffixes (user item 4)', () => {
  it('reads B and T suffixes, case-insensitively and with spaces', () => {
    expect(parseCapacity('1B')).toBe(1_000_000_000)
    expect(parseCapacity('2b')).toBe(2_000_000_000)
    expect(parseCapacity('1.5B')).toBe(1_500_000_000)
    expect(parseCapacity('1T')).toBe(1_000_000_000_000)
    expect(parseCapacity('2 T')).toBe(2_000_000_000_000)
  })

  it('still reads K and M beside the new suffixes', () => {
    expect(parseCapacity('200K')).toBe(200_000)
    expect(parseCapacity('1M')).toBe(1_000_000)
  })

  it('rejects a value that rounds to nothing', () => {
    expect(parseCapacity('0')).toBeUndefined()
    expect(parseCapacity('0.0000000001B')).toBeUndefined()
  })
})

describe('capacityShort', () => {
  it('spells binary-exact values in binary units', () => {
    expect(capacityShort(131072)).toBe('128K')
    expect(capacityShort(1048576)).toBe('1M')
    expect(capacityShort(2 * 1024 * 1024)).toBe('2M')
    expect(capacityShort(1024)).toBe('1K')
  })

  it('falls back to decimal units when the binary ones do not divide', () => {
    // The catalogue's decimal spellings (200K / 272000-context models).
    expect(capacityShort(200_000)).toBe('200K')
    expect(capacityShort(272_000)).toBe('272K')
    expect(capacityShort(1_000_000_000)).toBe('1B')
    expect(capacityShort(1_000_000_000_000)).toBe('1T')
    expect(capacityShort(1_500_000_000)).toBe('1.5B')
  })

  it('keeps one binary decimal for values neither family divides', () => {
    expect(capacityShort(1536)).toBe('1.5K')
    expect(capacityShort(1_572_864)).toBe('1.5M')
  })

  it('drops a trailing .0 when the closest quotient rounds onto the whole number', () => {
    // 999999: the decimal quotient rounds to 1000 and wins the error race —
    // the tag must read 1000K, not "1000.0K". 1,000,048 rounds to 1M the
    // same way.
    expect(capacityShort(999_999)).toBe('1000K')
    expect(capacityShort(1_000_048)).toBe('1M')
  })

  it('leaves sub-thousand counts and invalid answers alone', () => {
    expect(capacityShort(512)).toBe('512')
    expect(capacityShort(undefined)).toBe('')
    expect(capacityShort(0)).toBe('')
    expect(capacityShort(-5)).toBe('')
  })
})
