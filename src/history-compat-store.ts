/**
 * The history-compatibility document: which provider routes may recover a
 * Responses topic whose upstream history was minted under another backend
 * resource.
 *
 * It lives in the plugin's own home directory rather than in the pi-ai profile
 * for the same reason the camouflage document does: the official add-provider
 * card writes the WHOLE profile at `providers.<route>`, so a field the official
 * schema does not know would be dropped by the first save.
 *
 * Only "on" is ever stored. A route that is off carries no entry, so deleting
 * and re-creating a provider cannot inherit a stale switch — and the file says
 * exactly which routes are covered instead of listing the whole catalogue.
 *
 * The document holds no secrets: route names and one boolean. It is parsed
 * leniently (an unreadable file means "nothing enabled") and written
 * atomically, like the camouflage document.
 *
 * @module dsh-model-think-level/history-compat-store
 */

import { mkdirSync, readFileSync, renameSync, unlinkSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { harnessHome } from './key-index.js'
import { HISTORY_COMPAT_FILE, HISTORY_COMPAT_LEGACY_FILE } from './constants.js'

/** The whole stored document. */
export interface HistoryCompatDocument {
  /** Schema version; a future shape can migrate by reading this. */
  readonly version: 1
  /** Route → enabled. An absent route is off. */
  readonly providers: Readonly<Record<string, true>>
}

/** A fresh, empty document. */
export function emptyHistoryCompat(): HistoryCompatDocument {
  return { version: 1, providers: {} }
}

/** Absolute path of the document beside the camouflage and key documents. */
export function historyCompatFilePath(home: string = harnessHome()): string {
  return join(home, 'dsh-model-think-level', HISTORY_COMPAT_FILE)
}

/**
 * Parse an already-decoded document. Never throws and never trusts the input:
 * an entry whose value is not `true` is dropped, so a file written by a newer
 * build costs only the settings this build cannot express.
 * @param raw - the decoded JSON value (or anything else).
 */
export function parseHistoryCompat(raw: unknown): HistoryCompatDocument {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return emptyHistoryCompat()
  const providers = (raw as Record<string, unknown>)['providers']
  if (typeof providers !== 'object' || providers === null || Array.isArray(providers)) return emptyHistoryCompat()
  const out: Record<string, true> = {}
  for (const [route, value] of Object.entries(providers as Record<string, unknown>)) {
    if (route.length === 0) continue
    if (value !== true) continue
    // `defineProperty` keeps `__proto__` an ordinary own key, exactly like the
    // camouflage and key documents do.
    Object.defineProperty(out, route, { value: true, enumerable: true, configurable: true, writable: true })
  }
  return { version: 1, providers: out }
}

/** Read the document. Never throws; an absent file means "nothing enabled". */
export function readHistoryCompat(file: string = historyCompatFilePath()): HistoryCompatDocument {
  const current = readDocument(file)
  if (current !== undefined) return current
  // Earlier builds wrote `history-compat.json`; carry those switches over once
  // rather than quietly treating a configured route as off.
  const legacy = join(dirname(file), HISTORY_COMPAT_LEGACY_FILE)
  if (legacy === file) return emptyHistoryCompat()
  const previous = readDocument(legacy)
  if (previous === undefined) return emptyHistoryCompat()
  try {
    writeHistoryCompat(previous, file)
  } catch {
    // A read-only home still answers with the old document; the next save retries.
  }
  return previous
}

function readDocument(file: string): HistoryCompatDocument | undefined {
  try {
    return parseHistoryCompat(JSON.parse(readFileSync(file, 'utf8')) as unknown)
  } catch {
    return undefined
  }
}

/** Write the document at one path, atomically. */
export function writeHistoryCompat(document: HistoryCompatDocument, file: string = historyCompatFilePath()): void {
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
 * Turn one route's switch on or off.
 *
 * `false` removes the entry rather than storing "off": the document then says
 * exactly which routes are covered.
 * @param route - the provider route key.
 * @param enabled - whether this route may recover foreign history.
 * @param file - document path (tests pass a temp file).
 * @returns the document as it now stands on disk.
 */
export function setRouteHistoryCompat(
  route: string,
  enabled: boolean,
  file: string = historyCompatFilePath(),
): HistoryCompatDocument {
  const current = readHistoryCompat(file)
  const providers: Record<string, true> = { ...current.providers }
  if (enabled) Object.defineProperty(providers, route, { value: true, enumerable: true, configurable: true, writable: true })
  else delete providers[route]
  const next: HistoryCompatDocument = { version: 1, providers }
  writeHistoryCompat(next, file)
  return next
}

/** One route's stored switch, never resolving through Object.prototype. */
export function historyCompatOf(document: HistoryCompatDocument, route: string): boolean {
  return Object.hasOwn(document.providers, route)
}
