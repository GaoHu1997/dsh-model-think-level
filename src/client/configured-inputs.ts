/**
 * Saved per-model facts for the composer. The host model catalog projects
 * id/name/reasoning but omits the plugin-owned answers — input modalities, the
 * image-generation marker (生图), and the declared context window — so badges,
 * the switcher's image-generation filter and its capacity tag all read the
 * settings document. Keep provider and model keys separate: relay ids can be
 * shared by providers whose answers differ.
 */
import { isRecord } from '../shared.js'
import { INPUT_IMAGE_GEN_MARKER } from '../constants.js'
import { describeNamespace, providersOf } from './ops.js'
import type { RemoteApi } from './types.js'

/** What the document says about one model, as the composer surfaces consume it. */
export interface ModelFacts {
  /** The saved input-modality declaration, when the model declares one. */
  input?: readonly string[]
  /** Whether the model is declared an image generator (生图). */
  imageGen?: boolean
  /** The declared context window, when the model carries one. */
  contextWindow?: number
}

export type ConfiguredInputSnapshot = ReadonlyMap<string, ReadonlyMap<string, ModelFacts>>

/** Stable empty snapshot for a composer mounted without a settings reader. */
export const EMPTY_CONFIGURED_INPUTS: ConfiguredInputSnapshot = new Map()

/** Saved model facts, shared by composer mounts and refreshed on settings pushes. */
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
        const next = new Map<string, ReadonlyMap<string, ModelFacts>>()
        for (const [provider, profile] of Object.entries(providersOf(join.namespace))) {
          const facts = new Map<string, ModelFacts>()
          const models = Array.isArray(profile['models']) ? profile['models'] : []
          for (const model of models) {
            if (!isRecord(model) || typeof model['id'] !== 'string' || model['id'].length === 0) continue
            const entry: {
              input?: readonly string[]
              imageGen?: boolean
              contextWindow?: number
            } = {}
            if (Array.isArray(model['input'])) {
              const input = model['input'].filter((value): value is string => typeof value === 'string')
              // Resolved settings turn undeclared arrays into []; those remain
              // inheritable. An explicit ['text'] must suppress a vision guess.
              if (input.length > 0) entry.input = input
            }
            if (model[INPUT_IMAGE_GEN_MARKER] === true) entry.imageGen = true
            const window = model['contextWindow']
            if (typeof window === 'number' && Number.isFinite(window) && window > 0) {
              entry.contextWindow = window
            }
            if (entry.input !== undefined || entry.imageGen !== undefined || entry.contextWindow !== undefined) {
              facts.set(model['id'], entry)
            }
          }
          if (facts.size > 0) next.set(provider, facts)
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
