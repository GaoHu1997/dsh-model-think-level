/**
 * The running auto-fill complement (issue #7).
 *
 * The host fills once at boot. Everything a session adds afterwards is filled
 * HERE, on the idle pass: that is the only moment no official card is holding a
 * revision baseline a write would invalidate.
 *
 * @module dsh-model-think-level/client/injection/autofill-run
 */

import { AUTOFILL_CONFIG_PATH, PI_AI_NS } from '../../constants.js'
import { buildAutofillPatch } from '../../autofill.js'
import { describeNamespace, userProvidersOf } from '../ops.js'
import type { RemoteApi } from '../types.js'

/** What the complement needs from its host. */
export interface IdleAutofillDeps {
  /** The settings remote. */
  api: RemoteApi
}

/** The complement's face. */
export interface IdleAutofill {
  /** Run the complement; fire-and-forget on the injector's idle pass. */
  run: () => void
  /** Drop the host-switch snapshot; the next idle run reads it again. */
  invalidate: () => void
}

/**
 * Build the auto-fill complement.
 * @param deps - the settings remote.
 * @returns the complement's {@link IdleAutofill} face.
 */
export function createIdleAutofill(deps: IdleAutofillDeps): IdleAutofill {
  let autofillSwitches: Promise<{ autofill: boolean; modalityAutofill: boolean }> | undefined
  let generation = 0

  /**
   * Cache successful host-switch reads until refresh. A `dsh.client`
   * declaration carries no plugin config, so a deployment configured
   * `autofill: false` would otherwise still be written to from the page.
   * An unreachable or older host keeps the documented defaults for this run,
   * but a later run retries instead of retaining a permissive failure forever.
   */
  const autofillSwitchesOf = (): Promise<{ autofill: boolean; modalityAutofill: boolean }> => {
    if (autofillSwitches !== undefined) return autofillSwitches
    const request = (async () => {
      try {
        const response = await fetch(AUTOFILL_CONFIG_PATH, { method: 'GET' })
        if (!response.ok) return undefined
        const body = (await response.json()) as { ok?: boolean; data?: { autofill?: unknown; modalityAutofill?: unknown } }
        if (body?.ok !== true) return undefined
        return {
          autofill: body.data?.autofill !== false,
          modalityAutofill: body.data?.modalityAutofill !== false,
        }
      } catch {
        return undefined
      }
    })().then((switches) => {
      // An older failed read must not clear the replacement request created
      // after refresh. Successful stale reads never write the cache either.
      if (switches === undefined && autofillSwitches === request) autofillSwitches = undefined
      return switches ?? { autofill: true, modalityAutofill: true }
    })
    autofillSwitches = request
    return request
  }

  /**
   * Fill the models this session added, through the very patch builder the
   * host's boot pass uses (so one suggestion can never produce two different
   * documents). Runs on the idle pass only.
   */
  const runIdleAutofill = async (): Promise<void> => {
    const runGeneration = generation
    try {
      const switches = await autofillSwitchesOf()
      if (runGeneration !== generation || !switches.autofill) return
      // Read the snapshot first. This pass runs on every scan and every pushed
      // invalidation, and the host's `describe()` EMITS `settings/document-updated`
      // whenever the serialized document moved. Reading the wire here would
      // feed the very notification that scheduled this pass:
      //   document-updated -> refresh -> idle -> describe -> document-updated
      // which never settles and starves the renderer -- the whole DSH stopped
      // responding the moment the Models page opened. The scope mirror already
      // carries the resolved section, so "is there anything to fill" costs no
      // round trip and echoes nothing.
      const join = await describeNamespace(deps.api)
      const namespace = join.namespace
      if (runGeneration !== generation || namespace === undefined || join.writable !== true) return
      const userProviders = userProvidersOf(namespace)
      if (userProviders === undefined) return
      const patch = buildAutofillPatch(
        userProviders, () => true, { modalities: switches.modalityAutofill }, namespace.revision,
      )
      if (patch === undefined) return
      // There IS something to fill. Only a MIRRORED read may have gone stale:
      // the scope folds a just-settled write in asynchronously, so fencing the
      // write off it would use a superseded revision and manufacture a
      // `settings/conflict` (the same reason a conflict retry re-reads the
      // wire). A wire read is already authoritative, so re-reading it would
      // only spend a round trip -- and echo a second notification.
      const writeJoin = join.source === 'scope' ? await describeNamespace(deps.api, { fresh: true }) : join
      const writeNamespace = writeJoin.namespace
      if (runGeneration !== generation || writeNamespace === undefined || writeJoin.writable !== true) return
      const writeProviders = userProvidersOf(writeNamespace)
      if (writeProviders === undefined) return
      const settled = buildAutofillPatch(
        writeProviders, () => true, { modalities: switches.modalityAutofill }, writeNamespace.revision,
      )
      if (settled === undefined) return
      const routes = settled['providers'] as Record<string, { models: unknown }>
      const ops = Object.entries(routes).map(([route, profile]) => ({
        op: 'set' as const,
        path: ['providers', route, 'models'],
        value: profile.models,
      })) as unknown as Parameters<typeof deps.api.settings.mutate>[1]
      const response = await deps.api.settings.mutate(PI_AI_NS, ops, writeNamespace.revision)
      // A refusal arrives as a VALUE, not a throw: without this check the whole
      // complement failed silently (the catch below never ran). Whatever is
      // still undeclared is picked up by the next idle pass.
      if (!response.ok) {
        console.error(`[bre] idle autofill refused: ${response.error.message}`)
      }
    } catch (error) {
      console.error(`[bre] idle autofill failed: ${error instanceof Error ? error.message : String(error)}`)
    }
  }

  return {
    run: () => { void runIdleAutofill() },
    invalidate: () => {
      generation += 1
      autofillSwitches = undefined
    },
  }
}
