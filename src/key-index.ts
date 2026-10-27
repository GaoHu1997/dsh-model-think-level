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
 * Existing unreadable or malformed files fail closed, so a mutation cannot
 * replace lost metadata with a fresh index. Every write is atomic (`write` to a
 * sibling temp file, then `rename`), so a
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
import {
  normalizeKeyAlias,
  normalizeKeyDisabled,
  normalizeKeyModels,
  normalizeKeyProtocol,
  normalizeRouteEndpoints,
  type KeyEntry,
  type RouteEndpoints,
  type RouteProtocol,
} from './key-refs.js'

/** One route's entry, re-exported so the host half has a single import site. */
export type KeyIndexEntry = KeyEntry

/**
 * Build one entry, writing only the fields that carry a value. Keeping absent
 * fields absent (rather than `undefined`) keeps hand-edited index files diff-
 * clean and lets `parseKeyIndex`/`writeKeyIndex` round-trip an unscoped key
 * without inventing an empty `models` list that would read as "reached nothing".
 * Being enabled is the default, so only a switched-off key carries the flag.
 */
function makeEntry(
  ref: string,
  alias: string | undefined,
  models: readonly string[] | undefined,
  protocol: RouteProtocol | undefined,
  disabled: boolean | undefined,
): KeyIndexEntry {
  const entry: {
    ref: string
    alias?: string
    models?: readonly string[]
    protocol?: RouteProtocol
    disabled?: boolean
  } = { ref }
  if (alias !== undefined) entry.alias = alias
  if (models !== undefined) entry.models = models
  if (protocol !== undefined) entry.protocol = protocol
  if (disabled === true) entry.disabled = true
  return entry
}

/** The whole index document, exactly as it sits on disk. */
export interface KeyIndexDocument {
  /** Schema version; a future shape can migrate by reading this. */
  readonly version: 1
  /** Route → keys, in the order the manager lists them. */
  readonly providers: Record<string, readonly KeyIndexEntry[]>
  /**
   * Route → the extra base URLs that provider holds beyond its own `baseURL`.
   * A key pinned to a concrete protocol draws its endpoint from here, which is
   * how one route serves both an OpenAI and an Anthropic endpoint. Absent means
   * "no extra endpoints" (every key falls back to the route's own `baseURL`).
   */
  readonly endpoints?: Record<string, RouteEndpoints>
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
  const root = raw as Record<string, unknown>
  const providers = root['providers']
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
      const models = normalizeKeyModels(record['models'])
      const protocol = normalizeKeyProtocol(record['protocol'])
      const disabled = normalizeKeyDisabled(record['disabled'])
      list.push(makeEntry(ref, alias, models, protocol, disabled))
    }
    if (list.length > 0) out[route] = list
  }
  const endpoints = parseEndpoints(root['endpoints'])
  const document: KeyIndexDocument = { version: 1, providers: out }
  return endpoints === undefined ? document : { ...document, endpoints }
}

/**
 * Read the provider-level endpoint map, dropping unusable entries. Kept separate
 * so a hand-edited or older file that never carried endpoints still parses.
 * @param raw - the decoded `endpoints` member (or anything else).
 * @returns the cleaned map, or undefined when it holds nothing usable.
 */
function parseEndpoints(raw: unknown): Record<string, RouteEndpoints> | undefined {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return undefined
  const out: Record<string, RouteEndpoints> = {}
  for (const [route, value] of Object.entries(raw as Record<string, unknown>)) {
    if (route.length === 0) continue
    const pair = normalizeRouteEndpoints(value)
    if (pair !== undefined) out[route] = pair
  }
  return Object.keys(out).length === 0 ? undefined : out
}

/** Read the index; only an absent file means a fresh, empty document. */
export function readKeyIndex(file: string = keyIndexFilePath()): KeyIndexDocument {
  let text: string
  try {
    text = readFileSync(file, 'utf8')
  } catch (error) {
    if (typeof error === 'object' && error !== null && 'code' in error && error.code === 'ENOENT') {
      return emptyKeyIndex()
    }
    throw error
  }
  const raw: unknown = JSON.parse(text)
  const record = typeof raw === 'object' && raw !== null && !Array.isArray(raw)
    ? raw as Record<string, unknown> : undefined
  const providers = record?.['providers']
  if (record === undefined || (record['version'] !== undefined && record['version'] !== 1) ||
      typeof providers !== 'object' || providers === null || Array.isArray(providers)) {
    throw new Error('the key index is malformed; repair it before changing keys')
  }
  for (const [route, entries] of Object.entries(providers)) {
    if (route.length === 0 || !Array.isArray(entries) || entries.some((entry: unknown) => {
      if (typeof entry !== 'object' || entry === null || Array.isArray(entry)) return true
      const ref = (entry as Record<string, unknown>)['ref']
      return typeof ref !== 'string' || ref.length === 0
    })) {
      throw new Error('the key index is malformed; repair it before changing keys')
    }
  }
  // Keep the existing normalization, including unversioned documents, aliases
  // and duplicate references, for valid indexes written by older versions.
  return parseKeyIndex(raw)
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
  if (index === -1) {
    list.push(makeEntry(ref, label, undefined, undefined, undefined))
  } else {
    const existing = list[index]
    // A relabel with no alias keeps the stored one; the model scope, the
    // pinned protocol and the switch state always ride along untouched —
    // adding or renaming a key never touches its scope, nor silently re-pins
    // its protocol, nor switches it back on.
    const keptLabel = label === undefined ? existing?.alias : label
    list[index] = makeEntry(ref, keptLabel, existing?.models, existing?.protocol, existing?.disabled)
  }
  return { version: 1, providers: { ...document.providers, [route]: list }, ...endpointsOf(document) }
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
  list[index] = makeEntry(ref, label, list[index]?.models, list[index]?.protocol, list[index]?.disabled)
  return { version: 1, providers: { ...document.providers, [route]: list }, ...endpointsOf(document) }
}

/**
 * Set (or clear) the user's model assignment. `undefined` means catch-all, and
 * an empty array remains a concrete empty assignment.
 * @param document - the current document.
 * @param route - the provider route key.
 * @param ref - the credential reference.
 * @param models - the ids this key serves, or undefined to unscope it.
 */
export function withKeyModels(
  document: KeyIndexDocument,
  route: string,
  ref: string,
  models: readonly string[] | undefined,
): KeyIndexDocument {
  const list = [...keyEntriesOf(document, route)]
  const index = list.findIndex(entry => entry.ref === ref)
  if (index === -1) return document
  const scope = models === undefined ? undefined : normalizeKeyModels(models)
  list[index] = makeEntry(ref, list[index]?.alias, scope, list[index]?.protocol, list[index]?.disabled)
  return { version: 1, providers: { ...document.providers, [route]: list }, ...endpointsOf(document) }
}

/**
 * Set (or clear) one key's pinned wire protocol.
 *
 * This is the per-key protocol switch: a key pinned to `anthropic-messages`
 * signs requests routed through the Anthropic API and that key's endpoint, even
 * when the route's own `api` is an OpenAI one. Passing `undefined` restores the
 * AUTOMATIC wire: each request speaks the protocol the model's own family names
 * where the provider addressed that family, and the route's default otherwise.
 * A no-op when the reference is not listed.
 * @param document - the current document.
 * @param route - the provider route key.
 * @param ref - the credential reference.
 * @param protocol - the protocol to pin, or undefined for "automatic".
 */
export function withKeyProtocol(
  document: KeyIndexDocument,
  route: string,
  ref: string,
  protocol: RouteProtocol | undefined,
): KeyIndexDocument {
  const list = [...keyEntriesOf(document, route)]
  const index = list.findIndex(entry => entry.ref === ref)
  if (index === -1) return document
  const pinned = normalizeKeyProtocol(protocol)
  list[index] = makeEntry(ref, list[index]?.alias, list[index]?.models, pinned, list[index]?.disabled)
  return { version: 1, providers: { ...document.providers, [route]: list }, ...endpointsOf(document) }
}

/**
 * Switch one key into or out of the routing pool.
 *
 * Switching a key off keeps everything else about it — its label, its model
 * scope, its pinned protocol — so switching it back on restores exactly what it
 * served. Passing `false` clears the mark; the entry then reads as an ordinary
 * in-use key again. A no-op when the reference is not listed.
 * @param document - the current document.
 * @param route - the provider route key.
 * @param ref - the credential reference.
 * @param disabled - whether no request may sign with this key.
 */
export function withKeyDisabled(
  document: KeyIndexDocument,
  route: string,
  ref: string,
  disabled: boolean,
): KeyIndexDocument {
  const list = [...keyEntriesOf(document, route)]
  const index = list.findIndex(entry => entry.ref === ref)
  if (index === -1) return document
  const existing = list[index]
  list[index] = makeEntry(ref, existing?.alias, existing?.models, existing?.protocol, disabled ? true : undefined)
  return { version: 1, providers: { ...document.providers, [route]: list }, ...endpointsOf(document) }
}

/**
 * Set (or clear) one route's pair of extra base URLs.
 *
 * @param document - the current document.
 * @param route - the provider route key.
 * @param endpoints - the OpenAI/Anthropic base URLs, or undefined to clear both.
 */
export function withRouteEndpoints(
  document: KeyIndexDocument,
  route: string,
  endpoints: RouteEndpoints | undefined,
): KeyIndexDocument {
  const map: Record<string, RouteEndpoints> = { ...(document.endpoints ?? {}) }
  const cleaned = normalizeRouteEndpoints(endpoints)
  if (cleaned === undefined) delete map[route]
  else map[route] = cleaned
  const next: KeyIndexDocument = { version: 1, providers: document.providers }
  return Object.keys(map).length === 0 ? next : { ...next, endpoints: map }
}

/**
 * Carry a document's existing endpoint map forward on a providers-only rewrite.
 * Spread as `{ version: 1, providers, ...endpointsOf(document) }` so the writers
 * above never silently drop a route's endpoints when they only touch key lists.
 * @param document - the source document.
 * @returns `{ endpoints }` when one exists, else `{}` (spreads to nothing).
 */
function endpointsOf(document: KeyIndexDocument): { endpoints?: Record<string, RouteEndpoints> } {
  return document.endpoints === undefined ? {} : { endpoints: document.endpoints }
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
  return { version: 1, providers, ...endpointsOf(document) }
}
