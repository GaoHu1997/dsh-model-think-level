/**
 * Shared reference/alias/value rules.
 *
 * These functions are the contract between the two halves of the plugin: the
 * host mints references with them and the browser previews the reference it is
 * about to create with the same code, so the preview can never promise a name
 * the host would not have picked. They are also the plugin's own copy of the
 * official page's naming rule, which is why the derived reference is pinned
 * there by example rather than described.
 */

import { describe, expect, it } from 'vitest'
import {
  KEY_ALIAS_MAX_LENGTH,
  KEY_REF_MAX_LENGTH,
  KEY_REF_PATTERN,
  deriveKeyRef,
  isKeyRefName,
  isLegalKeyValue,
  maskKeyValue,
  nextKeyRef,
  normalizeKeyAlias,
} from '../src/key-refs.js'

describe('deriveKeyRef', () => {
  it('mirrors the official page: upper case, non-alphanumerics become underscores', () => {
    expect(deriveKeyRef('ofox')).toBe('OFOX_API_KEY')
    expect(deriveKeyRef('angent-router')).toBe('ANGENT_ROUTER_API_KEY')
    expect(deriveKeyRef('9router')).toBe('9ROUTER_API_KEY')
    expect(deriveKeyRef('a.b c/d')).toBe('A_B_C_D_API_KEY')
  })

  it('produces a name its own pattern accepts, digits first included', () => {
    for (const route of ['ofox', '9router', 'a--b', 'UPPER']) {
      expect(KEY_REF_PATTERN.test(deriveKeyRef(route))).toBe(true)
    }
  })

  it('does not truncate: the first key must be the name the page would write', () => {
    // The official derivation has no length rule either, and a route long enough
    // to matter is the credential store's business to refuse — it says so, and
    // the manager surfaces that answer instead of inventing a shorter name.
    expect(deriveKeyRef('a--b')).toBe('A_B_API_KEY')
    expect(deriveKeyRef('aliyun-cn')).toBe('ALIYUN_CN_API_KEY')
    expect(deriveKeyRef('r'.repeat(200))).toBe(`${'R'.repeat(200)}_API_KEY`)
  })
})

describe('isKeyRefName', () => {
  it('accepts letters, digits and underscores only', () => {
    expect(isKeyRefName('OFOX_API_KEY')).toBe(true)
    expect(isKeyRefName('A')).toBe(true)
    expect(isKeyRefName('')).toBe(false)
    expect(isKeyRefName('has-dash')).toBe(false)
    expect(isKeyRefName('has space')).toBe(false)
    expect(isKeyRefName('r'.repeat(KEY_REF_MAX_LENGTH + 1))).toBe(false)
  })
})

describe('nextKeyRef', () => {
  it('starts at the derived name, then counts up', () => {
    expect(nextKeyRef('ofox', [])).toBe('OFOX_API_KEY')
    expect(nextKeyRef('ofox', ['OFOX_API_KEY'])).toBe('OFOX_API_KEY_2')
    expect(nextKeyRef('ofox', ['OFOX_API_KEY', 'OFOX_API_KEY_2'])).toBe('OFOX_API_KEY_3')
  })

  it('skips names that are taken out of order', () => {
    expect(nextKeyRef('ofox', ['OFOX_API_KEY', 'OFOX_API_KEY_3'])).toBe('OFOX_API_KEY_2')
  })

  it('falls back to a timestamp once the counted names run out', () => {
    const taken = ['OFOX_API_KEY']
    for (let index = 2; index <= 999; index += 1) taken.push(`OFOX_API_KEY_${index}`)
    expect(taken).toHaveLength(999)
    expect(nextKeyRef('ofox', taken)).toMatch(/^OFOX_API_KEY_\d{10,}$/)
  })
})

describe('normalizeKeyAlias', () => {
  it('trims, and treats an empty label as no label at all', () => {
    expect(normalizeKeyAlias('  main  ')).toBe('main')
    expect(normalizeKeyAlias('')).toBeUndefined()
    expect(normalizeKeyAlias('   ')).toBeUndefined()
    expect(normalizeKeyAlias(undefined)).toBeUndefined()
  })

  it('drops control characters rather than letting one into the file', () => {
    expect(normalizeKeyAlias('a\u0000b')).toBe('ab')
    expect(normalizeKeyAlias('line\u000Abreak')).toBe('linebreak')
    expect(normalizeKeyAlias('\u007f')).toBeUndefined()
  })

  it('caps the label at KEY_ALIAS_MAX_LENGTH', () => {
    expect(KEY_ALIAS_MAX_LENGTH).toBe(40)
    const capped = normalizeKeyAlias('x'.repeat(200))
    expect(capped).toHaveLength(KEY_ALIAS_MAX_LENGTH)
  })
})

describe('isLegalKeyValue', () => {
  it('accepts printable ASCII, spaces and non-ASCII excluded', () => {
    expect(isLegalKeyValue('sk-abc_123!')).toBe(true)
    expect(isLegalKeyValue('')).toBe(false)
    expect(isLegalKeyValue('has space')).toBe(false)
    expect(isLegalKeyValue('key\t')).toBe(false)
    expect(isLegalKeyValue('密钥')).toBe(false)
  })
})

describe('maskKeyValue', () => {
  it('hides an empty value as nothing at all', () => {
    expect(maskKeyValue('')).toBe('')
  })

  it('masks a value too short for a head and a tail whole', () => {
    expect(maskKeyValue('sk')).toBe('••••••••')
    // Eleven characters is still one short of the twelve a head and a tail need.
    expect(maskKeyValue('sk-abcdefgh')).toBe('••••••••')
  })

  it('keeps four characters at each end of a value long enough to trim', () => {
    expect(maskKeyValue('sk-abcdefghi')).toBe('sk-a...fghi')
    expect(maskKeyValue('sk-live-secret-value')).toBe('sk-l...alue')
  })
})
