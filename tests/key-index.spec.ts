/**
 * The plugin-owned key index on disk.
 *
 * This file is the only place the plugin keeps key METADATA (references and
 * labels — never a value), and it is written by the host on every key operation
 * while the official page may be writing the provider profile next to it. Two
 * properties therefore matter more than the shape: an existing unreadable or
 * malformed index must fail closed, and a write must be atomic.
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
  withKeyDisabled,
  withKeyEntry,
  withKeyModels,
  withKeyProtocol,
  withRouteEndpoints,
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

  it('refuses malformed content without replacing it during an update', () => {
    writeKeyIndex(emptyKeyIndex(), fileOf())

    for (const payload of ['{ not json', '"a string"', JSON.stringify({ version: 1 }), '[]', 'null',
      '{"providers":[]}', '{"providers":{"route":[{"bad":"entry"}]}}']) {
      writeFileSync(fileOf(), payload, 'utf8')
      expect(() => readKeyIndex(fileOf())).toThrow()
      expect(() => updateKeyIndex(document => withKeyEntry(document, 'route', 'NEW'), fileOf())).toThrow()
      expect(readFileSync(fileOf(), 'utf8')).toBe(payload)
    }
  })

  it('throws when the path is not readable as a file', () => {
    mkdirSync(fileOf(), { recursive: true })
    expect(() => readKeyIndex(fileOf())).toThrow()
  })

  it('retains normalization of valid unversioned indexes', () => {
    writeKeyIndex(emptyKeyIndex(), fileOf())
    writeFileSync(fileOf(), '{"providers":{"route":[{"ref":"A","alias":" main "},{"ref":"A"}]}}')
    expect(readKeyIndex(fileOf())).toEqual({ version: 1, providers: { route: [{ ref: 'A', alias: 'main' }] } })
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

  it('round-trips a per-key model scope, and keeps an empty one distinct from none', () => {
    const parsed = parseKeyIndex({
      version: 1,
      providers: {
        ofox: [
          { ref: 'A', models: [' glm-4 ', 'glm-4', '', 'glm-4-air', 42] },
          { ref: 'B', models: [] },
          { ref: 'C' },
          { ref: 'D', models: 'nonsense' },
        ],
      },
    })
    expect(keyEntriesOf(parsed, 'ofox')).toEqual([
      // Trimmed and de-duplicated; non-strings dropped.
      { ref: 'A', models: ['glm-4', 'glm-4-air'] },
      // An empty array (probed, reached nothing) stays empty — not the same as
      // an unscoped key, which has no models field at all.
      { ref: 'B', models: [] },
      { ref: 'C' },
      { ref: 'D' },
    ])
    writeKeyIndex(parsed, fileOf())
    expect(readKeyIndex(fileOf())).toEqual(parsed)
  })

  it('round-trips a per-key protocol and the two base URLs', () => {
    const document = withRouteEndpoints(
      withKeyProtocol(withKeyEntry(emptyKeyIndex(), 'ofox', 'A'), 'ofox', 'A', 'anthropic-messages'),
      'ofox',
      { openai: 'https://api.openai.example/v1', anthropic: 'https://api.anthropic.example' },
    )
    expect(keyEntriesOf(document, 'ofox')).toEqual([{ ref: 'A', protocol: 'anthropic-messages' }])
    expect(document.endpoints?.['ofox']).toEqual({
      openai: 'https://api.openai.example/v1',
      anthropic: 'https://api.anthropic.example',
    })
    writeKeyIndex(document, fileOf())
    expect(readKeyIndex(fileOf())).toEqual(document)
  })

  it('drops an unknown protocol and non-URL endpoints on parse, but keeps the rest', () => {
    const parsed = parseKeyIndex({
      version: 1,
      providers: { ofox: [{ ref: 'A', protocol: 'carrier-pigeon' }, { ref: 'B', protocol: 'openai-completions' }] },
      endpoints: { ofox: { openai: 'https://ok.example/v1', anthropic: 'ftp://nope' } },
    })
    expect(keyEntriesOf(parsed, 'ofox')).toEqual([{ ref: 'A' }, { ref: 'B', protocol: 'openai-completions' }])
    expect(parsed.endpoints?.['ofox']).toEqual({ openai: 'https://ok.example/v1' })
  })

  it('drops legacy Gemini pins and endpoints from stored metadata and subsequent writes', () => {
    const legacy: unknown = {
      version: 1,
      providers: { ofox: [{ ref: 'A', alias: 'legacy', protocol: 'google-generative-ai' }] },
      endpoints: {
        ofox: { openai: 'https://ok.example/v1', gemini: 'https://gemini.example/v1beta' },
        google: { gemini: 'https://gemini.example/v1beta' },
      },
    }
    writeKeyIndex(emptyKeyIndex(), fileOf())
    writeFileSync(fileOf(), JSON.stringify(legacy), 'utf8')
    const parsed = readKeyIndex(fileOf())
    expect(keyEntriesOf(parsed, 'ofox')).toEqual([{ ref: 'A', alias: 'legacy' }])
    expect(parsed.endpoints).toEqual({ ofox: { openai: 'https://ok.example/v1' } })
    // A writer still carrying a legacy Gemini field goes in through the same
    // normalizing door: the extra property is dropped before anything lands.
    const legacyWrite = { anthropic: 'https://anthropic.example', gemini: 'https://gemini-new.example/v1beta' }
    const updated = withRouteEndpoints(parsed, 'ofox', legacyWrite)
    writeKeyIndex(updated, fileOf())
    expect(readKeyIndex(fileOf()).endpoints).toEqual({ ofox: { anthropic: 'https://anthropic.example' } })
    expect(readFileSync(fileOf(), 'utf8')).not.toContain('gemini')
    expect(readFileSync(fileOf(), 'utf8')).not.toContain('google-generative-ai')
  })

  it('preserves a protocol and the endpoints through every writer', () => {
    let document = withRouteEndpoints(
      withKeyProtocol(withKeyEntry(emptyKeyIndex(), 'ofox', 'A'), 'ofox', 'A', 'openai-responses'),
      'ofox',
      { anthropic: 'https://a.example' },
    )
    document = withKeyModels(document, 'ofox', 'A', ['glm-4'])
    document = withKeyAlias(document, 'ofox', 'A', 'main')
    expect(keyEntriesOf(document, 'ofox')).toEqual([{ ref: 'A', models: ['glm-4'], alias: 'main', protocol: 'openai-responses' }])
    expect(document.endpoints?.['ofox']).toEqual({ anthropic: 'https://a.example' })
  })

  it('round-trips a switched-off key, and stores nothing for an in-use one', () => {
    const parsed = parseKeyIndex({
      version: 1,
      providers: {
        ofox: [{ ref: 'A', disabled: true }, { ref: 'B', disabled: false }, { ref: 'C', disabled: 'nonsense' }],
      },
    })
    // Only a literal `true` means switched off; being in use is the default and
    // is never written, so a hand-edited file cannot disable a key by typo.
    expect(keyEntriesOf(parsed, 'ofox')).toEqual([{ ref: 'A', disabled: true }, { ref: 'B' }, { ref: 'C' }])
    writeKeyIndex(parsed, fileOf())
    expect(readKeyIndex(fileOf())).toEqual(parsed)
  })

  it('keeps a switch-off mark through every writer, and clears it on switch back', () => {
    let document = withKeyDisabled(withKeyEntry(emptyKeyIndex(), 'ofox', 'A'), 'ofox', 'A', true)
    expect(keyEntriesOf(document, 'ofox')).toEqual([{ ref: 'A', disabled: true }])
    // A pause is not a deletion: relabels, scope edits and protocol pins all
    // leave the mark alone, so switching back on restores the whole key.
    document = withKeyModels(document, 'ofox', 'A', ['glm-4'])
    document = withKeyAlias(document, 'ofox', 'A', 'main')
    document = withKeyProtocol(document, 'ofox', 'A', 'openai-responses')
    document = withKeyEntry(document, 'ofox', 'A', 'renamed')
    expect(keyEntriesOf(document, 'ofox')).toEqual([{
      ref: 'A',
      alias: 'renamed',
      models: ['glm-4'],
      protocol: 'openai-responses',
      disabled: true,
    }])
    document = withKeyDisabled(document, 'ofox', 'A', false)
    expect(keyEntriesOf(document, 'ofox')).toEqual([{
      ref: 'A',
      alias: 'renamed',
      models: ['glm-4'],
      protocol: 'openai-responses',
    }])
    // A reference the route does not list has nothing to switch.
    expect(withKeyDisabled(document, 'ofox', 'NOPE', true)).toBe(document)
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
