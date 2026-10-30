/**
 * The UI-order document: the sequence the user set by dragging the provider
 * rows, and every provider's model-row sequence, mirrored host-side.
 *
 * The live preference lives in the browser half's localStorage
 * (provider-order.ts / model-order.ts) — fast, and shared across tabs through
 * storage events. localStorage does not travel, though, and the orderings are
 * exactly the kind of setting a user wants on every machine, so the document
 * is mirrored into `<DSH_HOME>/dsh-model-think-level/ui-order.json` beside the
 * key index: a file the user can carry through any sync mechanism. The client
 * is the only writer (it pulls at boot and pushes every drag, last-writer-wins
 * on the `savedAt` stamp); the host only reads, stores and serves it.
 *
 * The file holds no secrets — provider routes and model ids only — which is
 * what makes it safe to point a sync tool at. It is parsed leniently: an
 * unreadable or malformed document degrades to "nothing stored", never an
 * error, and a partial payload MERGES over what is already stored, so a
 * buggy writer cannot wipe a good file with an empty one. Every write is
 * atomic, like the key index's.
 *
 * @module dsh-model-think-level/order-store
 */

import { mkdirSync, readFileSync, renameSync, unlinkSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { harnessHome } from './key-index.js'
import { ORDER_FILE } from './constants.js'

/** The whole synced ordering state, stamped by the writing client. */
export interface UiOrderDocument {
  readonly version: 1
  /**
   * Epoch ms of the writing client's last ORDER CHANGE — set by the browser
   * at change time, not by the host at write time, so machines can arbitrate
   * which side is newer. Zero means "unstamped" (a hand-made file).
   */
  readonly savedAt: number
  /** The dragged provider-row sequence, first row first. */
  readonly providerOrder: readonly string[]
  /** Every provider's dragged model-row sequence, keyed by provider id. */
  readonly modelOrder: Readonly<Record<string, readonly string[]>>
  /**
   * The provider ids switched OFF on the Models page. The DISABLED set, not
   * the enabled one — an empty list means "everything is on", which is a real
   * state a machine can hold and another machine must be able to adopt, not
   * the absence of an opinion.
   */
  readonly providersDisabled: readonly string[]
}

/** A fresh, empty document. */
export function emptyUiOrder(): UiOrderDocument {
  return { version: 1, savedAt: 0, providerOrder: [], modelOrder: {}, providersDisabled: [] }
}

/** Absolute path of the document beside the key index. */
export function uiOrderFilePath(home: string = harnessHome()): string {
  return join(home, 'dsh-model-think-level', ORDER_FILE)
}

/** One id, cleaned to the shape an order can carry. */
function normalizeId(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined
  const id = value.trim()
  return id.length === 0 ? undefined : id
}

/** An id sequence, de-duplicated keeping the first occurrence's position. */
function normalizeIds(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  return [...new Set(value.map(normalizeId).filter((id): id is string => id !== undefined))]
}

/**
 * Parse an already-decoded payload, dropping whatever does not fit. Never
 * throws: this file is a UI preference, so a corrupt one is an empty one.
 * @param raw - the decoded JSON value (or anything else).
 */
export function parseUiOrder(raw: unknown): UiOrderDocument {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return emptyUiOrder()
  const record = raw as Record<string, unknown>
  const savedAt = typeof record['savedAt'] === 'number' && Number.isFinite(record['savedAt'])
    ? record['savedAt']
    : 0
  const rawProviders = record['providerOrder']
  const rawModels = record['modelOrder']
  const modelOrder: Record<string, readonly string[]> = {}
  if (typeof rawModels === 'object' && rawModels !== null && !Array.isArray(rawModels)) {
    for (const [provider, value] of Object.entries(rawModels as Record<string, unknown>)) {
      if (provider.length === 0) continue
      const ids = normalizeIds(value)
      // An entry with no nameable model left is not an order: keeping it would
      // pin the provider's rows to slots they can no longer hold.
      if (ids.length > 0) modelOrder[provider] = ids
    }
  }
  return {
    version: 1,
    savedAt,
    providerOrder: normalizeIds(rawProviders),
    modelOrder,
    providersDisabled: normalizeIds(record['providersDisabled']),
  }
}

/**
 * Fold a (possibly partial) payload over a current document: a field the
 * payload carries in a usable shape replaces the stored one, every other
 * field keeps the stored value. A writer that can only name what it knows —
 * or a corrupted body — therefore can never blank a good file.
 * @param current - the stored document.
 * @param patch - the incoming payload, as posted by the client.
 * @param at - the savedAt to stamp when the payload carries no usable one.
 */
export function mergeUiOrder(current: UiOrderDocument, patch: unknown, at: number): UiOrderDocument {
  if (typeof patch !== 'object' || patch === null || Array.isArray(patch)) return current
  const record = patch as Record<string, unknown>
  const providers = record['providerOrder']
  const models = record['modelOrder']
  const disabled = record['providersDisabled']
  const savedAt = typeof record['savedAt'] === 'number' && Number.isFinite(record['savedAt'])
    ? record['savedAt']
    : at
  const parsedModels = parseUiOrder({
    version: 1,
    savedAt,
    providerOrder: Array.isArray(providers) ? providers : current.providerOrder,
    modelOrder: typeof models === 'object' && models !== null && !Array.isArray(models) ? models : current.modelOrder,
    // An absent field keeps the stored set; an explicit empty ARRAY is a real
    // "everything is on" and replaces it.
    providersDisabled: Array.isArray(disabled) ? disabled : current.providersDisabled,
  })
  return parsedModels
}

/**
 * Read the document. Never throws: an absent file and an unreadable one both
 * mean "nothing stored yet" — the client decides whether to adopt or to seed.
 * @param file - document path (tests pass a temp file).
 */
export function readUiOrder(file: string = uiOrderFilePath()): UiOrderDocument {
  try {
    return parseUiOrder(JSON.parse(readFileSync(file, 'utf8')) as unknown)
  } catch {
    return emptyUiOrder()
  }
}

/** Write the document at one path, atomically. */
export function writeUiOrder(document: UiOrderDocument, file: string = uiOrderFilePath()): void {
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
 * Read, fold a payload over it, and write back — the POST route's whole body.
 * The read and the write bracket one synchronous section, so two overlapping
 * requests cannot interleave the read-modify-write.
 * @returns the document as it now stands on disk.
 */
export function commitUiOrder(patch: unknown, at: number, file: string = uiOrderFilePath()): UiOrderDocument {
  const next = mergeUiOrder(readUiOrder(file), patch, at)
  writeUiOrder(next, file)
  return next
}
