/**
 * The observation document: what each key's own listing last advertised.
 *
 * These tests pin the file's two duties — it is a CACHE, so a corrupt document is
 * an empty one rather than an error; and it must never turn "could not list" into
 * "lists nothing", because routing reads an absent key as unknown and an empty
 * list as a refusal.
 */

import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import {
  emptyKeyServes,
  keyServesFilePath,
  parseKeyServes,
  readKeyServes,
  servesOf,
  servesOfRoute,
  withServes,
  withoutServes,
  writeKeyServes,
} from '../src/key-serves.js'

const AT = 1_700_000_000_000

/** One temporary directory, removed after the test. */
const made: string[] = []
function tempDir(): string {
  const dir = mkdtempSync(join(tmpdir(), 'dsh-key-serves-'))
  made.push(dir)
  return dir
}

afterEach(() => {
  for (const dir of made.splice(0)) rmSync(dir, { recursive: true, force: true })
})

describe('the document path', () => {
  it('sits beside the key index under the harness home', () => {
    expect(keyServesFilePath('C:\\home\\dsh')).toBe(join('C:\\home\\dsh', 'dsh-model-think-level', 'key-serves.json'))
  })
})

describe('withServes', () => {
  it('records the ids, de-duplicated and bounded', () => {
    const document = withServes(emptyKeyServes(), 'abin', 'k1', ['a', 'a', 'b'], AT)
    expect(servesOf(document, 'abin', 'k1')).toEqual(['a', 'b'])
  })

  it('replaces what the same key said before', () => {
    const once = withServes(emptyKeyServes(), 'abin', 'k1', ['a'], AT)
    expect(servesOf(withServes(once, 'abin', 'k1', ['b'], AT + 1), 'abin', 'k1')).toEqual(['b'])
  })

  it('drops a key whose listing named nothing, instead of asserting an empty catalogue', () => {
    // An empty list would read as "serves nothing" and bench a working key; the
    // document simply forgets the key and routing treats it as unknown.
    const once = withServes(emptyKeyServes(), 'abin', 'k1', ['a'], AT)
    expect(servesOf(withServes(once, 'abin', 'k1', [], AT + 1), 'abin', 'k1')).toBeUndefined()
  })

  it('keeps routes apart', () => {
    const once = withServes(emptyKeyServes(), 'abin', 'k1', ['a'], AT)
    expect(servesOf(withServes(once, 'other', 'k1', ['b'], AT), 'abin', 'k1')).toEqual(['a'])
  })
})

describe('withoutServes', () => {
  it('forgets one key and leaves the rest', () => {
    const once = withServes(withServes(emptyKeyServes(), 'abin', 'k1', ['a'], AT), 'abin', 'k2', ['b'], AT)
    const after = withoutServes(once, 'abin', 'k1')
    expect(servesOf(after, 'abin', 'k1')).toBeUndefined()
    expect(servesOf(after, 'abin', 'k2')).toEqual(['b'])
  })

  it('is a no-op for a key it never saw', () => {
    const once = withServes(emptyKeyServes(), 'abin', 'k1', ['a'], AT)
    expect(withoutServes(once, 'abin', 'k9')).toBe(once)
  })
})

describe('parseKeyServes', () => {
  it('reads a well-formed document', () => {
    const document = parseKeyServes({
      version: 1,
      providers: { abin: { k1: { models: ['a', 7, 'b'], at: AT } } },
    })
    expect(servesOf(document, 'abin', 'k1')).toEqual(['a', 'b'])
  })

  it('answers empty for anything it cannot use, never throwing', () => {
    for (const raw of [undefined, null, 42, 'text', [], {}, { providers: [] }, { providers: { abin: 'x' } }]) {
      expect(parseKeyServes(raw)).toEqual(emptyKeyServes())
    }
  })

  it('drops an entry with no usable id rather than keeping an empty list', () => {
    const document = parseKeyServes({ version: 1, providers: { abin: { k1: { models: [], at: AT } } } })
    expect(document.providers).toEqual({})
  })
})

describe('readKeyServes', () => {
  it('answers empty when the file is absent', () => {
    expect(readKeyServes(join(tempDir(), 'none.json'))).toEqual(emptyKeyServes())
  })

  it('answers empty — not an error — for a truncated file', () => {
    const file = join(tempDir(), 'key-serves.json')
    writeFileSync(file, '{"providers":', 'utf8')
    expect(readKeyServes(file)).toEqual(emptyKeyServes())
  })

  it('round-trips through writeKeyServes', () => {
    const file = join(tempDir(), 'nested', 'key-serves.json')
    const document = withServes(emptyKeyServes(), 'abin', 'k1', ['gpt-6.1-sol'], AT)
    writeKeyServes(document, file)
    expect(readKeyServes(file)).toEqual(document)
  })
})

describe('servesOfRoute', () => {
  it('is the map canServe reads, empty for an unknown route', () => {
    const document = withServes(emptyKeyServes(), 'abin', 'k1', ['a', 'b'], AT)
    expect([...servesOfRoute(document, 'abin').entries()]).toEqual([['k1', ['a', 'b']]])
    expect(servesOfRoute(document, 'other').size).toBe(0)
  })
})
