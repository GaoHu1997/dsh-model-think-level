/**
 * The provider key index: plugin-owned metadata about the keys configured for
 * one provider route.
 *
 * The harness stores VALUES only: `<DSH_HOME>/.credentials.yaml` holds one value
 * per reference, the service reports `{configured, source, writable}` and never
 * the value, and there is no enumeration API at all. A list of "the keys this
 * provider has", each with a human label, therefore cannot live in the harness
 * — it is plugin state. It is kept here, beside the harness home rather than
 * inside the pi-ai profile, because the official add-provider card writes the
 * WHOLE profile at `providers.<route>` and an unknown sibling key there would
 * be at the mercy of schema validation.
 *
 * The file holds no secrets: references and labels only, which is what makes it
 * safe to keep in plain text and easy for a user to inspect or repair by hand.
 * Every read is defensive (a corrupted file degrades to "nothing listed") and
 * every write is atomic (`write` to a sibling temp file, then `rename`), so a
 * crash mid-write cannot leave a half-parsed index behind.
 *
 * All of it is synchronous on purpose: the host is single-threaded, so a
 * read-modify-write inside one request handler cannot interleave with another
 * request's, which is the whole concurrency story this file needs.
 *
 * @module dsh-model-think-level/key-index
 */

import { mkdirSync, readFileSync, renameSync, unlinkSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'
import { normalizeKeyAlias, type KeyEntry } from './key-refs.js'

/** One route's entry, re-exported so the host half has a single import site. */
export type KeyIndexEntry = KeyEntry

/** The whole index document, exactly as it sits on disk. */
export interface KeyIndexDocument {
  /** Schema version; a future shape can migrate by reading this. */
  readonly version: 1
  /** Route → keys, in the order the manager lists them. */
  readonly providers: Record<string, readonly KeyIndexEntry[]>
}

/** A fresh, empty index. */
export function emptyKeyIndex(): KeyIndexDocument {
  return { version: 1, providers: {} }
}

/**
 * The harness home: `$DSH_HOME` when the host exports it, else the `~/.dsh`
 * the harness would have defaulted to. Never throws.
 */
export function harnessHome(): string {
  const configured = process.env['DSH_HOME']
  if (typeof configured === 'string' && configured.length > 0) return configured
  try {
    return join(homedir(), '.dsh')
  } catch {
    return '.dsh'
  }
}

/** Absolute path of the plugin's key index. */
export function keyIndexFilePath(home: string = harnessHome()): string {
  return join(home, 'dsh-model-think-level', 'key-index.json')
}

/**
 * Parse an already-decoded index document. Never throws and never trusts the
 * input: anything unrecognisable is dropped entry by entry, so a hand-edited or
 * truncated file costs at most the lines it got wrong.
 * @param raw - the decoded JSON value (or anything else).
 * @returns a well-formed document.
 */
export function parseKeyIndex(raw: unknown): KeyIndexDocument {
  if (typeof raw !== 'object' || raw === null) return emptyKeyIndex()
  const providers = (raw as Record<string, unknown>)['providers']
  if (typeof providers !== 'object' || providers === null) return emptyKeyIndex()
  const out: Record<string, KeyIndexEntry[]> = {}
  for (const [route, entries] of Object.entries(providers as Record<string, unknown>)) {
    if (route.length === 0 || !Array.isArray(entries)) continue
    const list: KeyIndexEntry[] = []
    for (const entry of entries) {
      if (typeof entry !== 'object' || entry === null) continue
      const record = entry as Record<string, unknown>
      const ref = record['ref']
      if (typeof ref !== 'string' || ref.length === 0) continue
      if (list.some(existing => existing.ref === ref)) continue
      const alias = normalizeKeyAlias(record['alias'])
      list.push(alias === undefined ? { ref } : { ref, alias })
    }
    if (list.length > 0) out[route] = list
  }
  return { version: 1, providers: out }
}

/** Read the index at one path, or an empty one when there is nothing to read. */
export function readKeyIndex(file: string = keyIndexFilePath()): KeyIndexDocument {
  try {
    return parseKeyIndex(JSON.parse(readFileSync(file, 'utf8')))
  } catch {
    // Missing, unreadable and malformed are the same answer here: the manager
    // opens with an empty list, and the profile's own enabled reference is
    // merged into what it lists anyway.
    return emptyKeyIndex()
  }
}

/** Write the index at one path, atomically. */
export function writeKeyIndex(document: KeyIndexDocument, file: string = keyIndexFilePath()): void {
  mkdirSync(dirname(file), { recursive: true })
  const temporary = `${file}.${process.pid}.tmp`
  writeFileSync(temporary, `${JSON.stringify(document, null, 2)}\n`, 'utf8')
  try {
    renameSync(temporary, file)
  } catch (error) {
    try {
      unlinkSync(temporary)
    } catch {
      // The temp file is best-effort cleanup; the rename failure is the news.
    }
    throw error
  }
}

/**
 * One synchronous read-modify-write. The returned document is what was stored.
 * @param mutate - pure document transform.
 * @param file - index path (tests pass a temp file).
 */
export function updateKeyIndex(
  mutate: (document: KeyIndexDocument) => KeyIndexDocument,
  file: string = keyIndexFilePath(),
): KeyIndexDocument {
  const next = mutate(readKeyIndex(file))
  writeKeyIndex(next, file)
  return next
}

/** One route's keys, or an empty list. */
export function keyEntriesOf(document: KeyIndexDocument, route: string): readonly KeyIndexEntry[] {
  const entries = document.providers[route]
  return Array.isArray(entries) ? entries : []
}

/** Whether one route's list names this reference. */
export function hasKeyEntry(document: KeyIndexDocument, route: string, ref: string): boolean {
  return keyEntriesOf(document, route).some(entry => entry.ref === ref)
}

/**
 * Add a key, or relabel the one already there. Order is preserved: the list is
 * what the panel renders, and a key that moves on every rename is a worse list.
 * @param document - the current document.
 * @param route - the provider route key.
 * @param ref - the credential reference.
 * @param alias - a label, or undefined to keep whatever is stored.
 */
export function withKeyEntry(
  document: KeyIndexDocument,
  route: string,
  ref: string,
  alias?: string | undefined,
): KeyIndexDocument {
  const list = [...keyEntriesOf(document, route)]
  const index = list.findIndex(entry => entry.ref === ref)
  const label = normalizeKeyAlias(alias)
  const next: KeyIndexEntry = label === undefined ? { ref } : { ref, alias: label }
  if (index === -1) list.push(next)
  else list[index] = label === undefined && list[index]?.alias !== undefined ? { ref, alias: list[index]?.alias } : next
  return { version: 1, providers: { ...document.providers, [route]: list } }
}

/**
 * Set (or clear) one key's label.
 * @param document - the current document.
 * @param route - the provider route key.
 * @param ref - the credential reference; a no-op when it is not listed.
 * @param alias - the new label, or undefined to fall back to the reference.
 */
export function withKeyAlias(
  document: KeyIndexDocument,
  route: string,
  ref: string,
  alias: string | undefined,
): KeyIndexDocument {
  const list = [...keyEntriesOf(document, route)]
  const index = list.findIndex(entry => entry.ref === ref)
  if (index === -1) return document
  const label = normalizeKeyAlias(alias)
  list[index] = label === undefined ? { ref } : { ref, alias: label }
  return { version: 1, providers: { ...document.providers, [route]: list } }
}

/**
 * Drop one key. The route key itself is removed once its list empties, so a
 * provider the user cleaned up leaves no residue in the file.
 * @param document - the current document.
 * @param route - the provider route key.
 * @param ref - the credential reference to forget.
 */
export function withoutKeyEntry(document: KeyIndexDocument, route: string, ref: string): KeyIndexDocument {
  const list = keyEntriesOf(document, route).filter(entry => entry.ref !== ref)
  const providers: Record<string, readonly KeyIndexEntry[]> = { ...document.providers }
  if (list.length === 0) delete providers[route]
  else providers[route] = list
  return { version: 1, providers }
}
