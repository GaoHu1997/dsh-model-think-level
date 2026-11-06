/**
 * The camouflage document: which client identity each provider route asks the
 * wire to present.
 *
 * It lives in the plugin's own home directory rather than in the pi-ai profile
 * for the same reason the key index does: the official add-provider card writes
 * the WHOLE profile at `providers.<route>`, so a field the official schema does
 * not know would be dropped by the first save. It also keeps the identity out of
 * the user's `headers` dictionary — a preset expands into several headers, and
 * unfolding them into the user's own list would make "turn it off" a manual
 * cleanup instead of one switch.
 *
 * The document holds no secrets: route names and one of two preset names. It is
 * parsed leniently (an unreadable file means "nothing camouflaged") and written
 * atomically, like the key index and the UI order.
 *
 * @module dsh-model-think-level/camouflage-store
 */

import { mkdirSync, readFileSync, renameSync, unlinkSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { harnessHome } from './key-index.js'
import { CAMOUFLAGE_FILE } from './constants.js'
import { isCamouflagePreset, type CamouflagePreset } from './camouflage.js'

/** The whole stored document. */
export interface CamouflageDocument {
  /** Schema version; a future shape can migrate by reading this. */
  readonly version: 1
  /** Route → the identity its requests present. Absent means "as sent". */
  readonly providers: Readonly<Record<string, CamouflagePreset>>
}

/** A fresh, empty document. */
export function emptyCamouflage(): CamouflageDocument {
  return { version: 1, providers: {} }
}

/** Absolute path of the document beside the key index. */
export function camouflageFilePath(home: string = harnessHome()): string {
  return join(home, 'dsh-model-think-level', CAMOUFLAGE_FILE)
}

/**
 * Parse an already-decoded document. Never throws and never trusts the input:
 * an entry with an unknown preset is dropped, so a file written by a newer
 * build costs only the settings this build cannot express.
 * @param raw - the decoded JSON value (or anything else).
 */
export function parseCamouflage(raw: unknown): CamouflageDocument {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return emptyCamouflage()
  const providers = (raw as Record<string, unknown>)['providers']
  if (typeof providers !== 'object' || providers === null || Array.isArray(providers)) return emptyCamouflage()
  const out: Record<string, CamouflagePreset> = {}
  for (const [route, value] of Object.entries(providers as Record<string, unknown>)) {
    if (route.length === 0) continue
    if (!isCamouflagePreset(value)) continue
    // `defineProperty` keeps `__proto__` an ordinary own key, exactly like the
    // key index does: a JSON dictionary treats every name as data.
    Object.defineProperty(out, route, { value, enumerable: true, configurable: true, writable: true })
  }
  return { version: 1, providers: out }
}

/** Read the document. Never throws; an absent file means "nothing stored". */
export function readCamouflage(file: string = camouflageFilePath()): CamouflageDocument {
  try {
    return parseCamouflage(JSON.parse(readFileSync(file, 'utf8')) as unknown)
  } catch {
    return emptyCamouflage()
  }
}

/** Write the document at one path, atomically. */
export function writeCamouflage(document: CamouflageDocument, file: string = camouflageFilePath()): void {
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
 * Set or clear one route's identity.
 *
 * `undefined` removes the entry rather than storing "off": the document then
 * says exactly what it means, and a route deleted and re-created cannot inherit
 * a stale identity.
 * @param route - the provider route key.
 * @param preset - the identity, or undefined to clear it.
 * @param file - document path (tests pass a temp file).
 * @returns the document as it now stands on disk.
 */
export function setRouteCamouflage(
  route: string,
  preset: CamouflagePreset | undefined,
  file: string = camouflageFilePath(),
): CamouflageDocument {
  const current = readCamouflage(file)
  const providers: Record<string, CamouflagePreset> = { ...current.providers }
  if (preset === undefined) delete providers[route]
  else Object.defineProperty(providers, route, { value: preset, enumerable: true, configurable: true, writable: true })
  const next: CamouflageDocument = { version: 1, providers }
  writeCamouflage(next, file)
  return next
}

/** One route's stored identity, never resolving through Object.prototype. */
export function camouflageOf(document: CamouflageDocument, route: string): CamouflagePreset | undefined {
  return Object.hasOwn(document.providers, route) ? document.providers[route] : undefined
}
