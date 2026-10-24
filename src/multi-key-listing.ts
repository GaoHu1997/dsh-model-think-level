/**
 * One model catalogue from a route's several keys.
 *
 * A provider route may hold more than one key, and the keys need not see the
 * same models: an Anthropic-pinned key answers a different listing than the
 * OpenAI-family one, and a gateway can give two OpenAI keys different quotas
 * while advertising different catalogues. Probing each key separately answers
 * "what does THIS key serve" — the question routing needs — but a picker and a
 * "detect models" button both ask the other question: "what does this provider
 * serve at all?". This module answers that one by keeping, per model, the keys
 * that advertised it.
 *
 * Two rules are inherited from the gateway practice this mirrors (magpie's
 * `fetchPerKey`):
 * - a model advertised by several keys is ONE model, listing every key that
 *   serves it;
 * - a key whose listing could not be read this time keeps the models it was
 *   last seen serving, instead of making them disappear from the catalogue
 *   (those models are reported as `retained`, so a caller can say the scope is
 *   stale rather than fresh).
 *
 * The catalogue reads in one natural id order (`numeric` collation, so a model
 * family keeps version order), not in the order the keys were asked: a
 * catalogue assembled key by key would read as one key's list with the next
 * key's extras appended, scattering one letter across both ends.
 *
 * Probing is the caller's job: {@link collectKeyListings} only bounds how many
 * probes run at once and merges what comes back, so the panel, the `discover`
 * operation and the fetch overlay all share one merge.
 *
 * @module dsh-model-think-level/multi-key-listing
 */

import type { KeyProbeResult } from './key-probe.js'

/** How many probes run at once unless the caller says otherwise. */
export const DEFAULT_PROBE_CONCURRENCY = 4

/**
 * How model ids read in the merged catalogue. `numeric` keeps a family in
 * version order (`glm-4.5` before `glm-4.6`), and `en` pins the alphabet so the
 * order does not drift with the host's locale.
 */
const MODEL_ORDER = new Intl.Collator('en', { numeric: true, sensitivity: 'base' })

/** One model in the merged catalogue and the keys that advertised it. */
export interface MergedModel {
  readonly id: string
  /** The keys whose listing named this model, in key-list order. */
  readonly keys: readonly string[]
}

/** A route's whole catalogue, merged across the keys that were asked. */
export interface MergedListing {
  /** The models, in natural id order, each naming its keys. */
  readonly models: readonly MergedModel[]
  /** Just the ids, in the same order (what a picker or a patch needs). */
  readonly ids: readonly string[]
  /** Keys that answered this pass. */
  readonly answered: readonly string[]
  /**
   * Keys whose probe produced no scope at all. When a last-known scope exists
   * for one of them, its models are still in the catalogue and the key is
   * reported here — the caller decides whether "stale" is worth saying.
   */
  readonly unreadable: readonly string[]
  /** Keys whose models came from their last-known scope rather than this pass. */
  readonly retained: readonly string[]
}

/** Normalized model ids of one stored scope (blank ids dropped, order kept). */
function idsOf(models: readonly string[] | undefined): string[] {
  if (models === undefined) return []
  const out: string[] = []
  const seen = new Set<string>()
  for (const id of models) {
    const trimmed = typeof id === 'string' ? id.trim() : ''
    if (trimmed.length === 0 || seen.has(trimmed)) continue
    seen.add(trimmed)
    out.push(trimmed)
  }
  return out
}

/**
 * Fold per-key probe results into one catalogue.
 *
 * A key with `models === undefined` did not answer; its last-known scope (when
 * one is supplied) keeps its models in the catalogue and marks it `retained`.
 * Without such a scope the key simply contributes nothing to this pass.
 * @param results - one result per key, in key-list order.
 * @param lastKnown - the scopes the keys were seen serving before this pass.
 * @returns the merged catalogue and the per-key bookkeeping.
 */
export function mergeKeyListings(
  results: readonly KeyProbeResult[],
  lastKnown?: ReadonlyMap<string, readonly string[]>,
): MergedListing {
  const order: string[] = []
  const keysByModel = new Map<string, string[]>()
  const answered: string[] = []
  const unreadable: string[] = []
  const retained: string[] = []
  const seenKeys = new Set<string>()

  const add = (ref: string, ids: readonly string[]): void => {
    for (const id of ids) {
      const owners = keysByModel.get(id)
      if (owners === undefined) {
        keysByModel.set(id, [ref])
        order.push(id)
      } else if (!owners.includes(ref)) {
        owners.push(ref)
      }
    }
  }

  for (const result of results) {
    if (seenKeys.has(result.ref)) continue
    seenKeys.add(result.ref)
    if (result.models !== undefined) {
      answered.push(result.ref)
      add(result.ref, idsOf(result.models))
      continue
    }
    unreadable.push(result.ref)
    const known = idsOf(lastKnown?.get(result.ref))
    if (known.length === 0) continue
    retained.push(result.ref)
    add(result.ref, known)
  }

  order.sort(MODEL_ORDER.compare)
  const models = order.map(id => ({ id, keys: keysByModel.get(id) ?? [] }))
  return {
    models,
    ids: order,
    answered,
    unreadable,
    retained,
  }
}

/** What one collection run needs from its caller. */
export interface CollectKeyListingsOptions<Key> {
  /** The keys to ask, in the order the catalogue should read. */
  readonly keys: readonly Key[]
  /** Ask one key for its listing (typically `probeKeyModels`). */
  readonly probe: (key: Key) => Promise<KeyProbeResult>
  /**
   * The ref a key is known by. When given, a probe that THROWS is recorded as
   * that key having no answer (so its last-known scope still survives); without
   * it a throwing probe simply contributes nothing.
   */
  readonly refOf?: (key: Key) => string
  /** How many probes may be in flight; at least 1. Defaults to 4. */
  readonly concurrency?: number
  /** The scopes the keys were seen serving before this pass. */
  readonly lastKnown?: ReadonlyMap<string, readonly string[]>
}

/**
 * Probe every key with bounded concurrency, then merge the answers.
 *
 * Kept in key order regardless of which probe finished first: the per-key
 * bookkeeping reads in the keys' preference order, not by network luck. (The
 * catalogue itself reads in id order — see {@link mergeKeyListings}.) A probe
 * that throws contributes nothing for its key (the caller's own probe decides
 * what "no answer" means); the remaining probes still run.
 * @param options - the keys, how to probe one, and the concurrency bound.
 * @returns the results in key order, plus the merged catalogue.
 */
export async function collectKeyListings<Key>(
  options: CollectKeyListingsOptions<Key>,
): Promise<{ results: KeyProbeResult[]; merged: MergedListing }> {
  const total = options.keys.length
  const results: (KeyProbeResult | undefined)[] = new Array<KeyProbeResult | undefined>(total)
  const bound = Math.max(1, Math.min(options.concurrency ?? DEFAULT_PROBE_CONCURRENCY, Math.max(total, 1)))
  let next = 0

  const worker = async (): Promise<void> => {
    for (;;) {
      const index = next
      next += 1
      if (index >= total) return
      const key = options.keys[index] as Key
      try {
        results[index] = await options.probe(key)
      } catch {
        // A probe that cannot even report a failure answers "nothing this time";
        // recording it that way (rather than dropping the key) is what lets the
        // merge keep the models the key was last seen serving.
        const ref = options.refOf?.(key)
        if (ref !== undefined) results[index] = { ref, models: undefined, targets: [] }
      }
    }
  }

  await Promise.all(Array.from({ length: bound }, async () => worker()))
  const settled = results.filter((result): result is KeyProbeResult => result !== undefined)
  return { results: settled, merged: mergeKeyListings(settled, options.lastKnown) }
}
