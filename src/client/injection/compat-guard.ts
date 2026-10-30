/**
 * The compat guard: the running repair for a wire protocol switched after
 * compat switches were written.
 *
 * Switching a route to `openai-responses` (or `anthropic-messages`) leaves the
 * old openai-completions switches -- `supportsReasoningEffort` and friends --
 * stored on its models, and the kernel then refuses every model that still
 * carries one ("sets compat ..., but its api is ..., which does not take it"):
 * the route serves nothing until the keys are gone. The host heals what it
 * finds at boot; everything a session changes afterwards is healed HERE, on
 * the idle pass -- the only moment no official card is holding a revision
 * baseline a write would invalidate (issue #7, the same rule the running
 * auto-fill complement follows).
 *
 * @module dsh-model-think-level/client/injection/compat-guard
 */

import { buildCompatCleanupPatch } from '../../autofill.js'
import { PI_AI_NS } from '../../constants.js'
import { describeNamespace, userProvidersOf } from '../ops.js'
import type { RemoteApi, SettingsJoin, SettingsPathOpView } from '../types.js'

/** What the guard needs from its host. */
export interface CompatGuardDeps {
  /** The settings remote. */
  api: RemoteApi
}

/** The guard's face. */
export interface CompatGuard {
  /** Run the guard; fire-and-forget on the injector's idle pass. */
  run: (join?: SettingsJoin) => void
}

/**
 * Build the guard.
 * @param deps - the settings remote.
 * @returns the guard's {@link CompatGuard} face.
 */
export function createCompatGuard(deps: CompatGuardDeps): CompatGuard {
  /**
   * Sweep the user layer for protocol-incompatible compat and write the
   * cleanup patch. Nothing is dirty is the common case, and a dirty sweep is
   * rare (right after a protocol switch), so the pass spends one mirrored
   * read -- the snapshot the idle flush already took -- and writes only when
   * it must.
   */
  const runCleanup = async (seeded?: SettingsJoin): Promise<void> => {
    // Snapshot first, wire read for the write -- the same fencing the idle
    // autofill applies: a scope-mirrored read can lag a write the mirror has
    // not folded in yet, and fencing off it would use a superseded revision
    // and manufacture a `settings/conflict`.
    const join = seeded ?? await describeNamespace(deps.api)
    const namespace = join.namespace
    if (namespace === undefined || join.writable !== true) return
    const userProviders = userProvidersOf(namespace)
    if (userProviders === undefined) return
    if (buildCompatCleanupPatch(userProviders) === undefined) return
    const writeJoin = join.source === 'scope' ? await describeNamespace(deps.api, { fresh: true }) : join
    const writeNamespace = writeJoin.namespace
    if (writeNamespace === undefined || writeJoin.writable !== true) return
    const writeProviders = userProvidersOf(writeNamespace)
    if (writeProviders === undefined) return
    const patch = buildCompatCleanupPatch(writeProviders)
    if (patch === undefined) return
    const routes = patch['providers'] as Record<string, Record<string, unknown>>
    // One set op per patched field, the same shape the idle autofill writes:
    // the settings layer deep-merges the op's value into the user document.
    const ops: SettingsPathOpView[] = []
    for (const [route, profile] of Object.entries(routes)) {
      for (const field of ['compat', 'models'] as const) {
        if (profile[field] === undefined) continue
        ops.push({
          op: 'set',
          path: ['providers', route, field],
          value: profile[field],
        } as unknown as SettingsPathOpView)
      }
    }
    if (ops.length === 0) return
    const response = await deps.api.settings.mutate(PI_AI_NS, ops, writeNamespace.revision)
    // A refusal arrives as a VALUE, not a throw; whatever is still dirty is
    // picked up by the next idle pass (or the next boot's sweep).
    if (!response.ok) {
      console.error(`[bre] compat cleanup refused: ${response.error.message}`)
    }
  }

  return {
    run: (join?: SettingsJoin) => {
      void runCleanup(join).catch((error: unknown) => {
        console.error(`[bre] compat cleanup failed: ${error instanceof Error ? error.message : String(error)}`)
      })
    },
  }
}
