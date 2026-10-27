/**
 * What each key's own listing said it serves — the observed half of routing.
 *
 * A provider route fans one request shape out over several credentials, and a
 * relay may resolve each of them to a different upstream ACCOUNT with its own
 * catalogue: one key's group carries `gpt-6.1-sol`, another key's group does not
 * and answers "Model ... is not supported by any configured account in this
 * group". The plugin cannot derive that split from configuration — keys are
 * opaque references and the upstream group an account belongs to is declared
 * nowhere — so it records what it observed: every successful model listing per
 * key, with the moment it was taken.
 *
 * `canServe` and `keysForModel` read these observations as a preference and a
 * guardrail (see key-route-core.ts), never as an assertion: a list that could not
 * be read is UNKNOWN, not empty, and a model no key lists is still tried on
 * every key — the provider, not the plugin, has the last word.
 *
 * The document is derived, not authored: losing it costs a round of failed
 * requests until the next listing, never correctness. It is therefore parsed
 * leniently — a malformed entry is dropped instead of thrown over — unlike the
 * key index, which holds what the user wrote.
 *
 * @module dsh-model-think-level/key-serves
 */

import { mkdirSync, readFileSync, renameSync, unlinkSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { harnessHome } from './key-index.js'

/** What one key's last successful listing advertised. */
export interface KeyServesEntry {
  /** Model ids, as the listing sent them, de-duplicated and in listing order. */
  readonly models: readonly string[]
  /** When that listing was read (epoch ms), so a client merge can tell ages apart. */
  readonly at: number
}

/** Every route's per-key observations. */
export interface KeyServesDocument {
  readonly version: 1
  readonly providers: Readonly<Record<string, Readonly<Record<string, KeyServesEntry>>>>
}

/**
 * The bound a single key's recorded catalogue may reach. A relay advertising
 * thousands of ids is a misconfiguration; keeping the first few hundred still
 * answers "does this key serve the model" without letting one document grow
 * without limit.
 */
const MODELS_PER_KEY = 512

/** A fresh, empty document. */
export function emptyKeyServes(): KeyServesDocument {
  return { version: 1, providers: {} }
}

/** Absolute path of the observation document beside the key index. */
export function keyServesFilePath(home: string = harnessHome()): string {
  return join(home, 'dsh-model-think-level', 'key-serves.json')
}

/** One model id, cleaned to the shape a listing can carry. */
function normalizeModelId(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined
  const id = value.trim()
  return id.length === 0 ? undefined : id
}

/**
 * Parse an already-decoded document, dropping whatever does not fit. Never
 * throws: this file is a cache of observations, so a corrupt one is an empty one.
 * @param raw - the decoded JSON value (or anything else).
 * @returns a well-formed document.
 */
export function parseKeyServes(raw: unknown): KeyServesDocument {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return emptyKeyServes()
  const providers = (raw as Record<string, unknown>)['providers']
  if (typeof providers !== 'object' || providers === null || Array.isArray(providers)) return emptyKeyServes()
  const out: Record<string, Record<string, KeyServesEntry>> = {}
  for (const [route, keys] of Object.entries(providers as Record<string, unknown>)) {
    if (route.length === 0 || typeof keys !== 'object' || keys === null || Array.isArray(keys)) continue
    const list: Record<string, KeyServesEntry> = {}
    for (const [ref, entry] of Object.entries(keys as Record<string, unknown>)) {
      if (ref.length === 0 || typeof entry !== 'object' || entry === null || Array.isArray(entry)) continue
      const record = entry as Record<string, unknown>
      const models = Array.isArray(record['models'])
        ? [...new Set(record['models'].map(normalizeModelId).filter((id): id is string => id !== undefined))]
        : []
      const at = typeof record['at'] === 'number' && Number.isFinite(record['at']) ? record['at'] : 0
      if (models.length === 0) continue
      list[ref] = { models: models.slice(0, MODELS_PER_KEY), at }
    }
    if (Object.keys(list).length > 0) out[route] = list
  }
  return { version: 1, providers: out }
}

/**
 * Read the document. Never throws: an absent file and an unreadable one both
 * mean "nothing observed yet".
 * @param file - document path (tests pass a temp file).
 */
export function readKeyServes(file: string = keyServesFilePath()): KeyServesDocument {
  try {
    return parseKeyServes(JSON.parse(readFileSync(file, 'utf8')) as unknown)
  } catch {
    return emptyKeyServes()
  }
}

/** Write the document at one path, atomically. */
export function writeKeyServes(document: KeyServesDocument, file: string = keyServesFilePath()): void {
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

/** What one key last advertised, or undefined when it was never listed. */
export function servesOf(
  document: KeyServesDocument,
  route: string,
  ref: string,
): readonly string[] | undefined {
  return document.providers[route]?.[ref]?.models
}

/**
 * One route's observations, keyed by reference — the shape `canServe` reads.
 * @param document - the observation document.
 * @param route - the provider route.
 */
export function servesOfRoute(
  document: KeyServesDocument,
  route: string,
): ReadonlyMap<string, readonly string[]> {
  const entries = document.providers[route] ?? {}
  return new Map(Object.entries(entries).map(([ref, entry]) => [ref, entry.models]))
}

/**
 * Record one key's listing, replacing whatever it said before. A key with an
 * empty catalogue is dropped from the document: an empty list would assert
 * "serves nothing", which is the reading this module exists to avoid.
 * @param document - the current document.
 * @param route - the provider route.
 * @param ref - the credential reference.
 * @param models - the listing's model ids.
 * @param at - when the listing was read (epoch ms).
 */
export function withServes(
  document: KeyServesDocument,
  route: string,
  ref: string,
  models: readonly string[],
  at: number,
): KeyServesDocument {
  const ids = [...new Set(models.map(normalizeModelId).filter((id): id is string => id !== undefined))]
    .slice(0, MODELS_PER_KEY)
  const current = document.providers[route] ?? {}
  const next: Record<string, KeyServesEntry> = { ...current }
  if (ids.length === 0) delete next[ref]
  else next[ref] = { models: ids, at }
  return { version: 1, providers: { ...document.providers, [route]: next } }
}

/**
 * Forget one key's observations, for a key that was removed or re-pointed.
 * @param document - the current document.
 * @param route - the provider route.
 * @param ref - the credential reference.
 */
export function withoutServes(document: KeyServesDocument, route: string, ref: string): KeyServesDocument {
  const current = document.providers[route]
  if (current === undefined || current[ref] === undefined) return document
  const next = { ...current }
  delete next[ref]
  const providers = { ...document.providers }
  if (Object.keys(next).length === 0) delete providers[route]
  else providers[route] = next
  return { version: 1, providers }
}
