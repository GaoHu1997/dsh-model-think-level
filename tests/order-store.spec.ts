/**
 * The UI-order document (order-store.ts): the lenient parse, the merge that
 * cannot blank a good file, and the atomic round-trip through disk.
 */

import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { commitUiOrder, emptyUiOrder, mergeUiOrder, parseUiOrder, readUiOrder, uiOrderFilePath, writeUiOrder } from '../src/order-store.js'

let home = ''

beforeEach(() => {
  home = mkdtempSync(join(tmpdir(), 'bre-order-store-'))
  process.env['DSH_HOME'] = home
})

afterEach(() => {
  rmSync(home, { recursive: true, force: true })
})

describe('parseUiOrder', () => {
  it('keeps a well-formed document', () => {
    const parsed = parseUiOrder({
      version: 1,
      savedAt: 1234,
      providerOrder: ['b', 'a', 'b', ''],
      modelOrder: { openai: ['gpt-4', 'gpt-4'], empty: [], blank: '  ' },
      providersDisabled: ['off', 'off', ''],
    })
    expect(parsed).toEqual({
      version: 1,
      savedAt: 1234,
      providerOrder: ['b', 'a'],
      modelOrder: { openai: ['gpt-4'] },
      providersDisabled: ['off'],
    })
  })

  it('degrades every non-document to an empty one', () => {
    expect(parseUiOrder(null)).toEqual(emptyUiOrder())
    expect(parseUiOrder('nope')).toEqual(emptyUiOrder())
    expect(parseUiOrder([1, 2])).toEqual(emptyUiOrder())
    expect(parseUiOrder({ savedAt: 'x', providerOrder: 'a', modelOrder: [1] })).toEqual(emptyUiOrder())
  })

  it('reads an absent disabled set as nothing off, which is a state and not a malformed field', () => {
    const parsed = parseUiOrder({ savedAt: 1, providerOrder: ['a'], modelOrder: {} })
    expect(parsed.providersDisabled).toEqual([])
  })
})

describe('mergeUiOrder', () => {
  const stored = {
    version: 1 as const,
    savedAt: 10,
    providerOrder: ['a'],
    modelOrder: { openai: ['m1'] },
    providersDisabled: ['x'],
  }

  it('replaces only the fields the payload carries in a usable shape', () => {
    const merged = mergeUiOrder(stored, { savedAt: 20, providerOrder: ['c', 'b'] }, 99)
    expect(merged).toEqual({
      version: 1,
      savedAt: 20,
      providerOrder: ['c', 'b'],
      modelOrder: { openai: ['m1'] },
      providersDisabled: ['x'],
    })
  })

  it('keeps the stored field when the payload field is the wrong shape', () => {
    const merged = mergeUiOrder(stored, { providerOrder: 'a', modelOrder: [1], providersDisabled: 'x' }, 99)
    expect(merged).toEqual({ ...stored, savedAt: 99 })
  })

  it('lets an explicit empty disabled set replace the stored one, since all-on is a real state', () => {
    const merged = mergeUiOrder(stored, { providersDisabled: [] }, 99)
    expect(merged.providersDisabled).toEqual([])
  })

  it('lets a payload stamp the document with its own savedAt', () => {
    expect(mergeUiOrder(stored, {}, 99).savedAt).toBe(99)
    expect(mergeUiOrder(stored, { savedAt: 7 }, 99).savedAt).toBe(7)
  })

  it('returns the stored document untouched for a non-object payload', () => {
    expect(mergeUiOrder(stored, 'nope', 99)).toEqual(stored)
  })
})

describe('readUiOrder / writeUiOrder', () => {
  it('round-trips a document atomically', () => {
    const file = join(home, 'nested', 'ui-order.json')
    const document = {
      version: 1 as const,
      savedAt: 5,
      providerOrder: ['b', 'a'],
      modelOrder: { openai: ['m'] },
      providersDisabled: ['x'],
    }
    writeUiOrder(document, file)
    expect(readUiOrder(file)).toEqual(document)
    // The temp sibling is gone; the JSON is pretty-printed for hand editing.
    expect(readFileSync(file, 'utf8')).toContain('"providerOrder"')
  })

  it('reads an absent or corrupt file as an empty document', () => {
    expect(readUiOrder(join(home, 'missing.json'))).toEqual(emptyUiOrder())
    const corrupt = join(home, 'corrupt.json')
    writeFileSync(corrupt, '{not json', 'utf8')
    expect(readUiOrder(corrupt)).toEqual(emptyUiOrder())
  })
})

describe('commitUiOrder', () => {
  it('seeds, then folds the next payload over the stored document', () => {
    const file = uiOrderFilePath(home)
    const first = commitUiOrder({ savedAt: 1, providerOrder: ['a'], modelOrder: { openai: ['m1'] } }, 0, file)
    expect(first.savedAt).toBe(1)
    const second = commitUiOrder({ savedAt: 2, modelOrder: { openai: ['m2'] } }, 0, file)
    expect(second).toEqual({
      version: 1,
      savedAt: 2,
      providerOrder: ['a'],
      modelOrder: { openai: ['m2'] },
      providersDisabled: [],
    })
    expect(readUiOrder(file)).toEqual(second)
  })
})
