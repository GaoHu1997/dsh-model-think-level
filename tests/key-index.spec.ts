/**
 * The plugin-owned key index on disk.
 *
 * This file is the only place the plugin keeps key METADATA (references and
 * labels — never a value), and it is written by the host on every key operation
 * while the official page may be writing the provider profile next to it. Two
 * properties therefore matter more than the shape: a read never throws (a
 * manager that cannot open is worse than one that opens empty, because the
 * enabled reference is merged in from the profile anyway), and a write is atomic
 * (a half-written index would silently lose keys the user still has).
 */

import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  emptyKeyIndex,
  hasKeyEntry,
  keyEntriesOf,
  keyIndexFilePath,
  parseKeyIndex,
  readKeyIndex,
  updateKeyIndex,
  withKeyAlias,
  withKeyEntry,
  withoutKeyEntry,
  writeKeyIndex,
} from '../src/key-index.js'

let home = ''

beforeEach(() => {
  home = mkdtempSync(join(tmpdir(), 'bre-key-index-'))
})

afterEach(() => {
  rmSync(home, { recursive: true, force: true })
})

function fileOf(): string {
  return keyIndexFilePath(home)
}

describe('keyIndexFilePath', () => {
  it('keeps the plugin’s own file under the harness home, apart from the profile', () => {
    expect(keyIndexFilePath(join('C:', 'home', '.dsh'))).toBe(
      join('C:', 'home', '.dsh', 'dsh-model-think-level', 'key-index.json'),
    )
    // Outside the pi-ai profile on purpose: the official add-provider card
    // writes that whole profile, so plugin metadata stored inside it is at the
    // mercy of its schema.
    expect(fileOf()).not.toContain('cordis.patch.yml')
  })
})

describe('readKeyIndex', () => {
  it('opens empty when there is no file', () => {
    expect(readKeyIndex(fileOf())).toEqual({ version: 1, providers: {} })
  })

  it('opens empty on malformed content', () => {
    writeKeyIndex(emptyKeyIndex(), fileOf())

    for (const payload of ['{ not json', '"a string"', JSON.stringify({ version: 1 }), '[]', 'null']) {
      writeFileSync(fileOf(), payload, 'utf8')
      expect(readKeyIndex(fileOf())).toEqual(emptyKeyIndex())
    }
  })

  it('opens empty when the path is not readable as a file at all', () => {
    // A directory where the file should be: readFileSync throws, and the
    // manager opens empty rather than failing to open.
    mkdirSync(fileOf(), { recursive: true })
    expect(readKeyIndex(fileOf())).toEqual(emptyKeyIndex())
  })
})

describe('parseKeyIndex', () => {
  it('keeps well-formed entries and drops the rest', () => {
    const parsed = parseKeyIndex({
      version: 1,
      providers: {
        ofox: [{ ref: 'OFOX_API_KEY', alias: ' main ' }, { nope: true }, 'nonsense', { ref: '' }],
        empty: [],
        '': [{ ref: 'X' }],
      },
    })

    expect(keyEntriesOf(parsed, 'ofox')).toEqual([{ ref: 'OFOX_API_KEY', alias: 'main' }])
    // A route with nothing left to list is not a route.
    expect(parsed.providers['empty']).toBeUndefined()
    expect(parsed.providers['']).toBeUndefined()
  })

  it('drops a repeated reference, keeping the first label', () => {
    const parsed = parseKeyIndex({
      providers: { ofox: [{ ref: 'A', alias: 'first' }, { ref: 'A', alias: 'second' }] },
    })
    expect(keyEntriesOf(parsed, 'ofox')).toEqual([{ ref: 'A', alias: 'first' }])
  })
})

describe('writeKeyIndex', () => {
  it('creates the directory tree and round-trips through the reader', () => {
    const document = withKeyEntry(withKeyEntry(emptyKeyIndex(), 'ofox', 'OFOX_API_KEY', 'main'), 'ofox', 'OFOX_API_KEY_2')
    writeKeyIndex(document, fileOf())

    expect(readKeyIndex(fileOf())).toEqual(document)
    expect(keyEntriesOf(readKeyIndex(fileOf()), 'ofox')).toEqual([
      { ref: 'OFOX_API_KEY', alias: 'main' },
      { ref: 'OFOX_API_KEY_2' },
    ])
  })

  it('writes readable JSON and leaves no temporary file behind', () => {
    writeKeyIndex(withKeyEntry(emptyKeyIndex(), 'ofox', 'OFOX_API_KEY'), fileOf())

    const text = readFileSync(fileOf(), 'utf8')
    expect(text.endsWith('\n')).toBe(true)
    expect(JSON.parse(text)).toEqual({ version: 1, providers: { ofox: [{ ref: 'OFOX_API_KEY' }] } })
    expect(text).toContain('\n  "providers"')
    expect(readdirSync(join(home, 'dsh-model-think-level'))).toEqual(['key-index.json'])
  })

  it('replaces the file wholesale rather than appending to it', () => {
    writeKeyIndex(withKeyEntry(emptyKeyIndex(), 'ofox', 'A'), fileOf())
    writeKeyIndex(withKeyEntry(emptyKeyIndex(), 'wb', 'B'), fileOf())
    expect(readKeyIndex(fileOf()).providers['ofox']).toBeUndefined()
    expect(keyEntriesOf(readKeyIndex(fileOf()), 'wb')).toEqual([{ ref: 'B' }])
  })
})

describe('updateKeyIndex', () => {
  it('answers with what it stored, and starts from what is on disk', () => {
    const first = updateKeyIndex((document) => withKeyEntry(document, 'ofox', 'A'), fileOf())
    const second = updateKeyIndex((document) => withKeyEntry(document, 'ofox', 'B'), fileOf())

    expect(keyEntriesOf(first, 'ofox')).toEqual([{ ref: 'A' }])
    expect(keyEntriesOf(second, 'ofox')).toEqual([{ ref: 'A' }, { ref: 'B' }])
    expect(keyEntriesOf(readKeyIndex(fileOf()), 'ofox')).toEqual([{ ref: 'A' }, { ref: 'B' }])
  })
})

describe('withKeyEntry', () => {
  it('appends in order and relabels in place', () => {
    let document = withKeyEntry(emptyKeyIndex(), 'ofox', 'A')
    document = withKeyEntry(document, 'ofox', 'B')
    document = withKeyEntry(document, 'ofox', 'A', 'primary')

    expect(keyEntriesOf(document, 'ofox')).toEqual([{ ref: 'A', alias: 'primary' }, { ref: 'B' }])
  })

  it('keeps an existing label when the new one carries nothing', () => {
    const document = withKeyEntry(withKeyEntry(emptyKeyIndex(), 'ofox', 'A', 'primary'), 'ofox', 'A')
    expect(keyEntriesOf(document, 'ofox')).toEqual([{ ref: 'A', alias: 'primary' }])
  })

  it('leaves other routes alone', () => {
    const document = withKeyEntry(withKeyEntry(emptyKeyIndex(), 'ofox', 'A'), 'wb', 'B')
    expect(keyEntriesOf(document, 'ofox')).toEqual([{ ref: 'A' }])
    expect(keyEntriesOf(document, 'wb')).toEqual([{ ref: 'B' }])
  })
})

describe('withKeyAlias', () => {
  it('renames a listed reference, and clears the label when asked', () => {
    const listed = withKeyEntry(emptyKeyIndex(), 'ofox', 'A', 'primary')
    expect(keyEntriesOf(withKeyAlias(listed, 'ofox', 'A', 'secondary'), 'ofox')).toEqual([{ ref: 'A', alias: 'secondary' }])
    expect(keyEntriesOf(withKeyAlias(listed, 'ofox', 'A', undefined), 'ofox')).toEqual([{ ref: 'A' }])
  })

  it('changes nothing for a reference the provider does not list', () => {
    const listed = withKeyEntry(emptyKeyIndex(), 'ofox', 'A')
    expect(withKeyAlias(listed, 'ofox', 'GHOST', 'x')).toBe(listed)
  })
})

describe('withoutKeyEntry', () => {
  it('removes one reference and keeps the order of the rest', () => {
    let document = withKeyEntry(withKeyEntry(withKeyEntry(emptyKeyIndex(), 'ofox', 'A'), 'ofox', 'B'), 'ofox', 'C')
    document = withoutKeyEntry(document, 'ofox', 'B')
    expect(keyEntriesOf(document, 'ofox')).toEqual([{ ref: 'A' }, { ref: 'C' }])
  })

  it('drops the route entirely once its last key is gone', () => {
    const document = withoutKeyEntry(withKeyEntry(emptyKeyIndex(), 'ofox', 'A'), 'ofox', 'A')
    expect(document.providers['ofox']).toBeUndefined()
    expect(hasKeyEntry(document, 'ofox', 'A')).toBe(false)
  })
})

describe('hasKeyEntry', () => {
  it('is exactly membership of that route’s list', () => {
    const document = withKeyEntry(emptyKeyIndex(), 'ofox', 'A')
    expect(hasKeyEntry(document, 'ofox', 'A')).toBe(true)
    expect(hasKeyEntry(document, 'ofox', 'B')).toBe(false)
    expect(hasKeyEntry(document, 'wb', 'A')).toBe(false)
  })
})

describe('the index never holds a secret', () => {
  it('stores references and labels only, whatever it is handed', () => {
    // The shape has no value field at all: this test fails to compile if one is
    // ever added, which is the point.
    const document = withKeyEntry(emptyKeyIndex(), 'ofox', 'OFOX_API_KEY', 'main')
    writeKeyIndex(document, fileOf())
    const text = readFileSync(fileOf(), 'utf8')
    expect(text).not.toContain('sk-')
    expect(existsSync(fileOf())).toBe(true)
  })
})
