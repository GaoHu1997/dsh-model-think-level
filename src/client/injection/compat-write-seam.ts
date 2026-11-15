/**
 * Make a wire-protocol switch and its compat cleanup ONE write, at the seam
 * the official card's own Save goes through.
 *
 * The kernel validates the whole settings document INSIDE the write
 * (`dsh-llm-pi-ai`'s `internal/config` hook -> `assertServiceable` ->
 * `resolveModelCompat`): a model that still carries a switch its NEW protocol
 * does not take fails resolution, and the write is rejected outright --
 *
 *   provider "free" model "gpt-6.1-sol" sets compat "supportsReasoningEffort",
 *   but its api is "openai-responses", which does not take it; that switch
 *   exists on openai-completions
 *
 * -- so switching a route's protocol from the Models card bounces, and the user
 * is left to hand-edit `cordis.patch.yml`. The boot sweep and the idle guard
 * heal that state afterwards, which is too late: the rejection already
 * happened, and the document is left exactly as it was.
 *
 * The repair therefore has to land INSIDE the same mutate call:
 *
 *  - a separate write BEFORE the Save bumps the revision, so the card's own
 *    frozen `expectedRevision` (issue #7) no longer matches and the user gets
 *    `settings/conflict` instead of a saved switch;
 *  - a separate write AFTER it cannot help: the Save was already refused.
 *
 * And the write to repair is the OFFICIAL card's, not this plugin's, so the seam
 * must sit on the `remote.settings` SERVICE — the one object every settings
 * writer ends up calling. (`ctx.remote` is a Cordis traceable proxy: reading
 * `remote.settings` short-circuits to the service registry, so replacing that
 * member would never be observed.) The gateway installs `mutate` as a
 * configurable own accessor per Remote method, so this module redefines that
 * property the same reference-counted way `headers-pi-ai` patches
 * `registerAdapter`, and restores the original descriptor on dispose.
 *
 * The wrapper is a Proxy over the live method, not a captured copy: it is
 * transparent to a test double (vitest's `_isMockFunction`/`mock`/`mock*` all
 * forward to the real function, so existing assertions keep meaning the same
 * traffic), and it re-reads the underlying method on every call so a gateway
 * re-install — which replaces the method records, invalidating old closures —
 * is followed rather than dispatched through a withdrawn token.
 *
 * Cost on the ordinary path is one path inspection: only an op that NAMES a
 * protocol pays for the document read the cleanup needs.
 *
 * @module dsh-model-think-level/client/injection/compat-write-seam
 */

import { PI_AI_NS } from '../../constants.js'
import { protocolsSwitched, withCompatCleanup, type WriteOp } from '../../compat-write.js'
import { isRecord } from '../../shared.js'
import type { SettingsPathOpView, SettingsRemoteApi } from '../types.js'

/** Marker holding this module's patch state on the settings service. */
const SEAM_PATCH_STATE = Symbol.for('dsh-model-think-level.compat-write-seam')

/** The patch state shared by every activation (HMR / double apply). */
interface SeamPatchState {
  /** The `mutate` descriptor found underneath this patch (re-read on install). */
  base: PropertyDescriptor
  /** The accessor this module installs, so a re-install is detectable. */
  getter: () => SettingsRemoteApi['mutate']
  /** The stand-in served as `mutate`. */
  readonly wrapper: SettingsRemoteApi['mutate']
  users: number
}

/** The seam's face. */
export interface CompatWriteSeam {
  /** Whether this patch is the one currently installed. */
  readonly active: boolean
  /**
   * Re-assert the patch if something replaced it, adopting the replacement as
   * the new method underneath.
   *
   * The gateway installs `mutate` as an accessor, and a re-install (a
   * reconnect, an HMR cycle of the gateway itself) replaces that property
   * wholesale, quietly retiring this seam. There is no event to observe, so the
   * caller re-asserts on its idle pass: one property read while nothing has
   * changed, a repair when something has.
   */
  ensure: () => void
  /** Release this activation's hold; the last one restores the original. */
  dispose: () => void
}

/**
 * The user-layer providers dict of one describe answer.
 *
 * The USER layer on purpose (never the resolved `value`): the cleanup rebuilds
 * stored rows, and a resolved read materializes schema defaults into the
 * document — the same rule the boot sweep and the idle fill follow.
 * @param value - the `settings.describe()` value.
 * @returns the raw user-layer providers dict, when there is one.
 */
export function userProvidersOfDescribe(value: unknown): unknown {
  if (!isRecord(value)) return undefined
  const namespaces = value['namespaces']
  if (!Array.isArray(namespaces)) return undefined
  const entry = namespaces.find(candidate => isRecord(candidate) && candidate['ns'] === PI_AI_NS)
  if (!isRecord(entry)) return undefined
  const user = entry['user']
  return isRecord(user) ? user['providers'] : undefined
}

/** Read a descriptor's live value: an accessor's get, or the data value. */
function valueOf(service: unknown, descriptor: PropertyDescriptor): unknown {
  return descriptor.get === undefined ? descriptor.value : descriptor.get.call(service)
}

/** The function a descriptor holds, or undefined when it holds none. */
function methodOf(service: unknown, descriptor: PropertyDescriptor): SettingsRemoteApi['mutate'] | undefined {
  const live = valueOf(service, descriptor)
  return typeof live === 'function' ? live as SettingsRemoteApi['mutate'] : undefined
}

/** Whether a value can serve as the settings service. */
function isSettingsService(value: unknown): value is SettingsRemoteApi {
  if (typeof value !== 'object' || value === null) return false
  const candidate = value as { describe?: unknown; mutate?: unknown }
  return typeof candidate.describe === 'function' && typeof candidate.mutate === 'function'
}

/**
 * The `mutate` in force right now, following gateway re-installs.
 *
 * When the installed descriptor is this patch's own accessor, the method is
 * whatever sits underneath it (`state.base`); otherwise the gateway (or another
 * plugin) has re-installed and its descriptor becomes the new "underneath".
 */
function currentMutate(service: unknown, state: SeamPatchState): SettingsRemoteApi['mutate'] | undefined {
  const live = Object.getOwnPropertyDescriptor(service as object, 'mutate')
  if (live !== undefined && live.get !== state.getter) state.base = live
  return methodOf(service, state.base)
}

/**
 * Build the stand-in served as `mutate`.
 *
 * A Proxy over a no-op dispatch function whose `apply` runs the repair and
 * whose `get` forwards the mock surface (`_isMockFunction`, `mock`, `mock*`)
 * to the live method. That makes the stand-in indistinguishable from a test
 * double: a spec asserting `expect(api.settings.mutate).not.toHaveBeenCalled()`
 * keeps measuring this seam's traffic, and `mockResolvedValueOnce` still steers
 * the reply.
 *
 * @param service - the settings service being patched.
 * @param state - the patch state.
 * @returns the stand-in.
 */
function makeWrapper(service: unknown, state: SeamPatchState): SettingsRemoteApi['mutate'] {
  const dispatch = function dispatch(): void { /* replaced by the apply trap */ }
  const handler: ProxyHandler<typeof dispatch> = {
    apply(_target, thisArg, args) {
      const [ns, ops, expectedRevision] = args as [string, SettingsPathOpView[], number | undefined]
      const live = currentMutate(service, state)
      if (live === undefined) throw new Error('the settings remote has no mutate to call')
      const passthrough = (nextOps: readonly SettingsPathOpView[]): unknown =>
        live.call(thisArg ?? service, ns, nextOps as SettingsPathOpView[], expectedRevision)
      // Only the pi-ai namespace carries provider profiles, and only an op that
      // NAMES a protocol can strand a compat switch. Everything else passes
      // straight through, so the wrap is invisible on the ordinary path.
      if (ns !== PI_AI_NS || !protocolsSwitched(ops as readonly WriteOp[])) return passthrough(ops)
      const describe = (service as { describe: SettingsRemoteApi['describe'] }).describe
      return (async () => {
        let providers: unknown
        try {
          const described = await describe()
          if (!described.ok) return passthrough(ops)
          providers = userProvidersOfDescribe(described.value)
        } catch {
          // An unreadable document is the write's own complaint to make: send
          // the caller's ops unchanged rather than inventing a rejection here.
          return passthrough(ops)
        }
        // The builder hands back fresh op objects with plain string[] paths.
        return passthrough(withCompatCleanup(ops as readonly WriteOp[], providers) as SettingsPathOpView[])
      })()
    },
    get(target, property, receiver) {
      // Anything the no-op dispatch does not define itself is answered by the
      // live method, bound to it: that is what makes vitest's mock surface
      // (`_isMockFunction`, `mock`, `getMockName`, `mockResolvedValueOnce`, …)
      // keep working through the stand-in, so a spec asserting on
      // `api.settings.mutate` still measures the real traffic.
      const own = Reflect.get(target, property, receiver)
      if (own !== undefined) return own
      const live = currentMutate(service, state)
      if (live === undefined) return undefined
      const value = Reflect.get(live as object, property, live)
      return typeof value === 'function' ? value.bind(live) : value
    },
    // Vitest gate-keeps `expect(fn).toHaveBeenCalled*` on `"_isMockFunction" in
    // fn`, i.e. the `in` operator, which the default trap forwards to the
    // dispatch target and so always misses. Delegated like `get` above.
    has(target, property) {
      if (Reflect.has(target, property)) return true
      const live = currentMutate(service, state)
      return live !== undefined && property in (live as object)
    },
  }
  return new Proxy(dispatch, handler) as unknown as SettingsRemoteApi['mutate']
}

/**
 * Patch the shared settings service so a protocol switch cleans the compat
 * switches its new protocol cannot take, in the same write.
 *
 * Idempotent and reference-counted: a second activation (HMR, a double apply,
 * two plugin instances) joins the existing patch instead of wrapping twice, and
 * the last release restores the exact descriptor that was there before.
 *
 * @param service - `ctx.remote.settings`, the service every settings writer
 *   (the official Models card included) calls.
 * @returns the seam's {@link CompatWriteSeam} face, or undefined when the
 *   service carries no `mutate` to patch.
 */
export function installCompatWriteSeam(service: unknown): CompatWriteSeam | undefined {
  if (!isSettingsService(service)) return undefined
  const target = service as object
  const holder = target as Record<symbol, unknown>
  const existing = holder[SEAM_PATCH_STATE] as SeamPatchState | undefined
  if (existing !== undefined) {
    existing.users += 1
    return handleFor(service, target, existing)
  }
  const base = Object.getOwnPropertyDescriptor(target, 'mutate')
  // A missing descriptor means `mutate` is inherited or absent; either way this
  // is not a service this seam knows how to patch. (The gateway always installs
  // an own accessor per Remote method.)
  if (base === undefined || methodOf(service, base) === undefined) return undefined
  const state: SeamPatchState = {
    base,
    getter: undefined as unknown as () => SettingsRemoteApi['mutate'],
    wrapper: undefined as unknown as SettingsRemoteApi['mutate'],
    users: 1,
  }
  state.getter = () => state.wrapper
  ;(state as { wrapper: SettingsRemoteApi['mutate'] }).wrapper = makeWrapper(service, state)
  if (!install(service, target, state)) return undefined
  Object.defineProperty(target, SEAM_PATCH_STATE, { configurable: true, value: state })
  return handleFor(service, target, state)
}

/**
 * Install the state's accessor over whatever `mutate` currently holds.
 * @returns whether the property now carries this state's accessor.
 */
function install(service: unknown, target: object, state: SeamPatchState): boolean {
  try {
    Object.defineProperty(target, 'mutate', {
      configurable: true,
      enumerable: Object.getOwnPropertyDescriptor(target, 'mutate')?.enumerable ?? true,
      // An accessor (not a data property): the descriptor identity is what
      // makes a re-install detectable, and `get` keeps the value stable so the
      // mock surface always resolves to the same stand-in.
      get: state.getter,
    })
    return true
  } catch {
    void service
    return false
  }
}

/** Whether this state's accessor is the one installed. */
function holdsPatch(target: object, state: SeamPatchState): boolean {
  return Object.getOwnPropertyDescriptor(target, 'mutate')?.get === state.getter
}

/** Build the release handle for one patch state. */
function handleFor(service: unknown, target: object, state: SeamPatchState): CompatWriteSeam {
  const holder = target as Record<symbol, unknown>
  return {
    get active(): boolean {
      return holder[SEAM_PATCH_STATE] === state && state.users > 0 && holdsPatch(target, state)
    },
    ensure(): void {
      if (holder[SEAM_PATCH_STATE] !== state || state.users <= 0) return
      if (holdsPatch(target, state)) return
      const live = Object.getOwnPropertyDescriptor(target, 'mutate')
      // Someone else's patch (or none at all): only take over a live method, so
      // this seam never fabricates a `mutate` the service does not have.
      if (live === undefined || methodOf(service, live) === undefined) return
      state.base = live
      install(service, target, state)
    },
    dispose(): void {
      if (state.users <= 0) return
      state.users -= 1
      if (state.users > 0) return
      if (holder[SEAM_PATCH_STATE] === state) delete holder[SEAM_PATCH_STATE]
      // Compare-first: a later install of its own (or the gateway's own
      // re-install) owns the property now, and clobbering it would drop either
      // our successor or the gateway's fresh record.
      if (!holdsPatch(target, state)) return
      Object.defineProperty(target, 'mutate', state.base)
    },
  }
}
