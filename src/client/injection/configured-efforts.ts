/**
 * The browser-side cache of the settings document's per-model `defaultEffort`
 * field (issue #4).
 *
 * The composer effort chain reads it through {@link ConfiguredEfforts.of}; a
 * pushed document update or a connection reset invalidates it and the next read
 * re-describes. A refused or empty read is deliberately NOT cached, so a
 * gateway hiccup cannot silently disable the configured layer until the next
 * invalidation.
 *
 * @module dsh-model-think-level/client/injection/configured-efforts
 */

import { DEFAULT_EFFORT_FIELD } from '../../constants.js'
import { describeNamespace, providersOf } from '../ops.js'
import type { RemoteApi } from '../types.js'

/** What the cache reads through. */
export interface ConfiguredEffortsDeps {
  /** The settings remote. */
  api: RemoteApi
}

/**
 * How long a read waits for the settings document before it answers "nothing
 * configured" and lets the caller's chain fall through.
 *
 * The composer switch this layer feeds is a click: it must not stall behind a
 * describe of the whole settings document (which is also re-read after every
 * settings push, and after any gateway hiccup). Answering undefined on a slow
 * read only moves the level to the projection watcher a moment later — the
 * document read itself keeps running, so the NEXT read is already warm.
 */
const READY_WAIT_MS = 350

/** The cache's face. */
export interface ConfiguredEfforts {
  /** The configured pick for one model, after the cache has settled. */
  of: (provider: string, model: string) => Promise<string | undefined>
  /** Drop the cache; the next read re-describes. */
  invalidate: () => void
}

/**
 * Build the configured-pick cache.
 * @param deps - the settings remote.
 * @returns the cache's {@link ConfiguredEfforts} face.
 */
export function createConfiguredEfforts(deps: ConfiguredEffortsDeps): ConfiguredEfforts {
  let configuredEfforts: Map<string, string> | undefined
  let configuredEffortsInflight: Promise<void> | undefined
  let configuredEffortsGeneration = 0

  const ensureConfiguredEfforts = (): Promise<void> => {
    if (configuredEfforts !== undefined) return Promise.resolve()
    const generation = configuredEffortsGeneration
    configuredEffortsInflight ??= describeNamespace(deps.api)
      .then((join) => {
        if (join.namespace === undefined) {
          // The namespace is unregistered, or the read was refused (a
          // gateway hiccup): do NOT cache the empty answer — the next chain
          // read re-describes, instead of silently disabling the configured
          // layer until the next invalidation.
          configuredEffortsInflight = undefined
          return
        }
        const map = new Map<string, string>()
        for (const [route, profile] of Object.entries(providersOf(join.namespace))) {
          const rawModels = Array.isArray(profile['models']) ? profile['models'] : []
          for (const model of rawModels) {
            if (typeof model !== 'object' || model === null || Array.isArray(model)) continue
            const id = (model as Record<string, unknown>)['id']
            const effort = (model as Record<string, unknown>)[DEFAULT_EFFORT_FIELD]
            if (typeof id === 'string' && typeof effort === 'string' && effort.length > 0) {
              map.set(`${route}/${id}`, effort)
            }
          }
        }
        // An invalidation during the flight must not land a stale snapshot:
        // the caller re-describes on the next read instead.
        if (generation === configuredEffortsGeneration) configuredEfforts = map
        else configuredEffortsInflight = undefined
      })
      .catch(() => {
        // A failed read leaves the cache empty: the next read re-describes.
        if (generation === configuredEffortsGeneration) configuredEffortsInflight = undefined
      })
    return configuredEffortsInflight
  }

  const of = async (provider: string, model: string): Promise<string | undefined> => {
    // Warm read: answer from the settled snapshot without touching the wire.
    if (configuredEfforts === undefined) {
      const pending = ensureConfiguredEfforts()
      // Bounded wait, never a rejection: a slow or refusing describe leaves the
      // layer unanswered for this call instead of stalling the model switch.
      await new Promise<void>((resolve) => {
        let settled = false
        const finish = (): void => {
          if (settled) return
          settled = true
          resolve()
        }
        const timer = setTimeout(finish, READY_WAIT_MS)
        pending.then(
          () => {
            clearTimeout(timer)
            finish()
          },
          () => {
            clearTimeout(timer)
            finish()
          },
        )
      })
    }
    return configuredEfforts?.get(`${provider}/${model}`)
  }

  const invalidate = (): void => {
    configuredEffortsGeneration += 1
    configuredEfforts = undefined
    configuredEffortsInflight = undefined
  }

  return { of, invalidate }
}
