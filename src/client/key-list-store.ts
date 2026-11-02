/**
 * The masked key list survives the page — one localStorage entry per route.
 *
 * A cold read (a settings read plus one credential resolve per key, behind the
 * host's serialised settings service) is what the panel used to pay on every
 * page opening: the in-memory cache only ever answered a re-open inside the
 * same page, so a restart painted "正在读取密钥…" again. This store keeps the
 * last successful answer on disk, the client's `listCache` hydrates from it at
 * creation, and the panel's own mount read revalidates in the background —
 * first paint is the real list, and a change made elsewhere (or in an earlier
 * session) lands as soon as that read answers.
 *
 * What is stored is exactly what the panel already paints: references, labels,
 * scopes, protocols and the host's MASKED preview. Revealed secret values never
 * travel through this module — they have their own reveal route and are never
 * cached (see `key-manager-client`).
 *
 * Every access is best-effort: a browser in private mode, a quota error or a
 * corrupted entry degrades to "no cache", never to a thrown panel.
 *
 * @module dsh-model-think-level/client/key-list-store
 */

import type { KeyState } from './key-manager-client.js'

const STORAGE_KEY = 'dsh-model-think-level:key-lists:v1'
/** One entry per provider route; the oldest are pruned past this. */
const MAX_ROUTES = 64
/** An answer older than this is not used as a first paint at all. */
const MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000

interface StoredList {
  readonly savedAt: number
  readonly state: KeyState
}

type StoredLists = Record<string, StoredList>

function store(): Storage | undefined {
  try {
    const candidate = (globalThis as { localStorage?: Storage }).localStorage
    return candidate ?? undefined
  } catch {
    return undefined
  }
}

function readAll(): StoredLists {
  const disk = store()
  if (disk === undefined) return {}
  try {
    const raw = disk.getItem(STORAGE_KEY)
    if (raw === null) return {}
    const parsed: unknown = JSON.parse(raw)
    if (typeof parsed !== 'object' || parsed === null) return {}
    const lists: StoredLists = {}
    for (const [route, value] of Object.entries(parsed as Record<string, unknown>)) {
      if (isStoredList(value)) lists[route] = value
    }
    return lists
  } catch {
    return {}
  }
}

function isStoredList(value: unknown): value is StoredList {
  if (typeof value !== 'object' || value === null) return false
  const candidate = value as { savedAt?: unknown; state?: unknown }
  if (typeof candidate.savedAt !== 'number' || !Number.isFinite(candidate.savedAt)) return false
  const state = candidate.state
  if (typeof state !== 'object' || state === null) return false
  const answer = state as { ok?: unknown; route?: unknown; entries?: unknown }
  return answer.ok === true && typeof answer.route === 'string' && Array.isArray(answer.entries)
}

function writeAll(lists: StoredLists): void {
  const disk = store()
  if (disk === undefined) return
  const kept = Object.entries(lists)
    .sort((left, right) => right[1].savedAt - left[1].savedAt)
    .slice(0, MAX_ROUTES)
  try {
    disk.setItem(STORAGE_KEY, JSON.stringify(Object.fromEntries(kept)))
  } catch {
    // Quota or a disabled store: the panel simply keeps no cache.
  }
}

/**
 * The last successful list for a route, or undefined when there is none (or it
 * is too old to be worth painting).
 */
export function loadKeyList(route: string): KeyState | undefined {
  const stored = readAll()[route]
  if (stored === undefined) return undefined
  if (stored.state.route !== route) return undefined
  const age = Date.now() - stored.savedAt
  if (!(age >= 0) || age > MAX_AGE_MS) {
    dropKeyList(route)
    return undefined
  }
  return stored.state
}

/**
 * Remember one successful answer. Transient fields (a probe in flight, the ref
 * an add just produced) are stripped: they describe a moment, not the list.
 */
export function saveKeyList(route: string, state: KeyState): void {
  if (state.ok !== true || state.route !== route) return
  const lists = readAll()
  lists[route] = {
    savedAt: Date.now(),
    state: { ...state, probing: undefined, addedRef: undefined },
  }
  writeAll(lists)
}

/** Forget one route (the list no longer exists or the route was deleted). */
export function dropKeyList(route: string): void {
  const lists = readAll()
  if (lists[route] === undefined) return
  delete lists[route]
  writeAll(lists)
}

/**
 * Every route this browser has a stored list for, newest first.
 *
 * The boot warm-up uses this to revalidate what the last session left behind;
 * nothing else reads it. A route that is gone from the document simply answers
 * a refusal and settles the warm-up's queue.
 */
export function storedKeyLists(): readonly { readonly route: string; readonly savedAt: number }[] {
  return Object.entries(readAll())
    .map(([route, stored]) => ({ route, savedAt: stored.savedAt }))
    .sort((left, right) => right.savedAt - left.savedAt)
}

/** Forget every route — the panel's own escape hatch. */
export function clearKeyLists(): void {
  const disk = store()
  if (disk === undefined) return
  try {
    disk.removeItem(STORAGE_KEY)
  } catch {
    // Same best-effort contract as the reads.
  }
}

export const KEY_LIST_STORAGE_KEY = STORAGE_KEY
