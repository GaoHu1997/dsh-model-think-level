/**
 * The image-generation entry's service wiring (the client's only jobs in the
 * v3 design — the switcher badges are already shipped in ComposerSlider, and
 * point-select stays `directory.select` untouched):
 *
 *  1. the `/生图` completion source over the host input-trigger pipeline
 *     (`/` trigger, model-level candidates), registered ONLY when the host
 *     exposes the service — an older kernel just loses the completion, never
 *     the command itself;
 *  2. a 30s-cached read of the image config, so a burst of completions costs
 *     one route read.
 *
 * @module dsh-model-think-level/client/injection/imagegen-entry
 */

import {
  imagegenCandidates,
  type CompletionModel,
} from './imagegen-completion.js'
import { onImageConfigChanged, readImageConfigView } from '../image-config-client.js'
import type { ClientContext } from '../types.js'

/** The host input-trigger service, typed structurally. */
interface InputTriggersLike {
  registerSource(source: {
    trigger: string
    name: string
    order?: number
    candidates: (projection: { text?: string }, context: { signal?: AbortSignal }) =>
      readonly unknown[] | Promise<readonly unknown[]>
  }): unknown
}

/** The completion source's name (the host dedupes on it). */
const SOURCE_NAME = 'imagegen'

/** How long one config read feeds completions. */
const CONFIG_CACHE_MS = 30_000

/** The cached model list for candidates. */
interface ModelCache {
  at: number
  models: readonly CompletionModel[]
}

let modelCache: ModelCache | undefined

/** Invalidate the cached model list (a settings change can add/remove rows). */
export function invalidateImagegenModels(): void {
  modelCache = undefined
}

async function completionModels(): Promise<readonly CompletionModel[]> {
  if (modelCache !== undefined && Date.now() - modelCache.at < CONFIG_CACHE_MS) return modelCache.models
  const answer = await readImageConfigView()
  // A switched-off service offers no model to complete: the command itself
  // still runs (and reports the switch), the menu simply stops advertising it.
  const models: CompletionModel[] = answer.ok && answer.data.enabled
    ? answer.data.models.map(model => ({
      id: model.id,
      label: model.label,
      isDefault: answer.data.defaultModel === model.id,
    }))
    : []
  modelCache = { at: Date.now(), models }
  return models
}

/**
 * Register the completion source. @returns the disposer (a no-op when the
 * host has no input-trigger service to register with).
 */
export function registerImagegenCompletion(ctx: ClientContext): () => void {
  // cordis THROWS on an undeclared service read ("cannot get property
  // \"inputTriggers\" without inject"), and this plugin's `inject` list does not
  // declare it — the service is optional, and a host without it must simply get
  // no completion source. The lookup is therefore fenced, exactly like the
  // `/生图` host command's `ctx.commands` probe.
  let inputTriggers: InputTriggersLike | undefined
  try {
    inputTriggers = (ctx as unknown as { inputTriggers?: InputTriggersLike }).inputTriggers
  } catch {
    inputTriggers = undefined
  }
  // A saved switch invalidates the 30s model cache immediately: the menu must
  // not keep offering models the user just turned off (or hide the ones just
  // turned on).
  const unsubscribe = onImageConfigChanged(invalidateImagegenModels)
  if (inputTriggers === undefined || typeof inputTriggers.registerSource !== 'function') return unsubscribe
  let registered = true
  try {
    inputTriggers.registerSource({
      // Late order: the generic slash completions and the built-in command
      // menu must not be pushed around by a niche source.
      trigger: '/',
      name: SOURCE_NAME,
      order: 900,
      candidates: (projection: { text?: string }) => {
        const text = typeof projection?.text === 'string' ? projection.text : ''
        // Only feed candidates when the line starts with the command word —
        // this source says nothing about other slash commands.
        if (!/^\/?生图(?:\s|$)/.test(text)) return []
        return completionModels().then(models => imagegenCandidates(text.replace(/^\/?生图/, ''), models))
      },
    })
  } catch {
    // A host that rejects the contribution (duplicate name, wrong shape)
    // keeps working without completion.
    registered = false
  }
  return () => {
    // The register face carries no unregister on the hosts that have it as a
    // plain array push; the disposer therefore only marks the source dead —
    // its candidates answer [] once the fiber is gone.
    registered = false
    unsubscribe()
  }
}
