/**
 * Saved input declarations for the composer. The host model catalog projects
 * id/name/reasoning but omits input modalities, so badges must also read the
 * settings document. Keep provider and model keys separate: relay ids can be
 * shared by providers whose image support differs.
 */
import { isRecord } from '../shared.js'
import { describeNamespace, providersOf } from './ops.js'
import type { RemoteApi } from './types.js'

export type ConfiguredInputSnapshot = ReadonlyMap<string, ReadonlyMap<string, readonly string[]>>

/** Stable empty snapshot for a composer mounted without a settings reader. */
export const EMPTY_CONFIGURED_INPUTS: ConfiguredInputSnapshot = new Map()

/** Saved model inputs, shared by composer mounts and refreshed on settings pushes. */
export interface ConfiguredInputs {
  getSnapshot(): ConfiguredInputSnapshot
  subscribe(listener: () => void): () => void
  load(): Promise<void>
  invalidate(): void
}

export function createConfiguredInputs(api: RemoteApi): ConfiguredInputs {
  let snapshot = EMPTY_CONFIGURED_INPUTS
  let loaded = false
  let inflight: Promise<void> | undefined
  let generation = 0
  const listeners = new Set<() => void>()
  const notify = (): void => { for (const listener of [...listeners]) listener() }

  const load = (): Promise<void> => {
    if (loaded) return Promise.resolve()
    if (inflight !== undefined) return inflight
    const requestedGeneration = generation
    // A document push reaches us before the official scope mirror finishes
    // refreshing. Read the wire so that old ready snapshots cannot be cached.
    inflight = describeNamespace(api, { fresh: true })
      .then(join => {
        if (requestedGeneration !== generation || join.namespace === undefined) return
        const next = new Map<string, ReadonlyMap<string, readonly string[]>>()
        for (const [provider, profile] of Object.entries(providersOf(join.namespace))) {
          const inputs = new Map<string, readonly string[]>()
          const models = Array.isArray(profile['models']) ? profile['models'] : []
          for (const model of models) {
            if (!isRecord(model) || typeof model['id'] !== 'string' || !Array.isArray(model['input'])) continue
            const input = model['input'].filter((value): value is string => typeof value === 'string')
            // Resolved settings turn undeclared arrays into []; those remain
            // inheritable. An explicit ['text'] must suppress a vision guess.
            if (input.length > 0) inputs.set(model['id'], input)
          }
          if (inputs.size > 0) next.set(provider, inputs)
        }
        snapshot = next
        loaded = true
        notify()
      })
      // Refused/missing reads are retryable on the next menu mount.
      .catch(() => undefined)
      .finally(() => { if (requestedGeneration === generation) inflight = undefined })
    return inflight
  }

  return {
    getSnapshot: () => snapshot,
    subscribe(listener) {
      listeners.add(listener)
      return () => { listeners.delete(listener) }
    },
    load,
    invalidate() {
      generation += 1
      loaded = false
      inflight = undefined
      // Keep the last accepted declaration until the replacement arrives;
      // an in-flight read must not briefly turn a manual choice into a guess.
      if (listeners.size > 0) void load()
    },
  }
}
