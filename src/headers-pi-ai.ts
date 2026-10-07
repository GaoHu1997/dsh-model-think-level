/**
 * Request-level header bridge for the pi-ai-backed Harness adapter.
 *
 * The model-list probe has its own direct fetch path, but conversation requests
 * are assembled inside dsh-llm-pi-ai and then passed to pi-ai's Models service.
 * pi-ai exposes `transformHeaders` exactly after auth and request headers have
 * been merged, so it is the right place to restore the profile values that the
 * Harness attribution layer reserves (most visibly `user-agent`).
 *
 * dsh-llm-pi-ai does not expose its private Models collection through a public
 * plugin API. Its adapter is nevertheless registered in the public llm runtime,
 * and the runtime object keeps that registration in a normal `adapters` Map. The
 * bridge uses a narrow structural adapter of that implementation detail and
 * fails open for other adapters or older runtimes.
 *
 * @module dsh-model-think-level/headers-pi-ai
 */

import { isRecord } from './shared.js'
import { selectOverride, type HeaderIndex, type HeaderOverride } from './headers-core.js'

/** A live route index shared with the fetch overlay. */
export interface PiAiHeaderSource {
  current: HeaderIndex
}

type ProviderHeaders = Record<string, string | null>
type HeaderTransformer = (headers: ProviderHeaders) => ProviderHeaders | Promise<ProviderHeaders>
type UnknownFunction = (...args: unknown[]) => unknown

type ObjectLike = Record<PropertyKey, unknown>

interface PiAiPatchState {
  originalCurrent: UnknownFunction
  wrappedCurrent: UnknownFunction
  source: PiAiHeaderSource
  users: number
}

interface RegisterPatchState {
  originalRegister: UnknownFunction
  wrappedRegister: UnknownFunction
  users: number
}

const PATCH_STATE = Symbol.for('dsh-model-think-level.pi-ai-header-transform')
const REGISTER_PATCH_STATE = Symbol.for('dsh-model-think-level.pi-ai-header-register')
const CORDIS_ORIGINAL = Symbol.for('cordis.original')

function objectOf(value: unknown): ObjectLike | undefined {
  return typeof value === 'object' && value !== null ? value as ObjectLike : undefined
}

function runtimeObjectOf(value: unknown): ObjectLike | undefined {
  const object = objectOf(value)
  if (object === undefined) return undefined
  const original = object[CORDIS_ORIGINAL]
  return objectOf(original) ?? object
}

function noOpHandle(): PiAiHeaderTransformHandle {
  return {
    active: false,
    dispose(): void {},
  }
}

function routeOverrideOf(source: PiAiHeaderSource, model: unknown): HeaderOverride | undefined {
  try {
    if (!isRecord(model)) return undefined
    const baseURL = model['baseUrl']
    if (typeof baseURL !== 'string' || baseURL.length === 0) return undefined
    const modelId = typeof model['id'] === 'string' ? model['id'] : undefined
    return selectOverride(source.current, baseURL, modelId)
  } catch {
    // A stale or partially written settings snapshot must never break a chat.
    return undefined
  }
}

function modelsProxyOf(models: ObjectLike, source: PiAiHeaderSource): ObjectLike {
  return new Proxy(models, {
    get(target, property, receiver): unknown {
      if (property !== 'streamSimple') return Reflect.get(target, property, receiver)
      const streamSimple = Reflect.get(target, property, target)
      if (typeof streamSimple !== 'function') return streamSimple
      return (...args: unknown[]): unknown => {
        const model = args[0]
        const context = args[1]
        const options = args[2]
        const modelObject = isRecord(model) ? model : undefined
        if (modelObject === undefined || typeof modelObject['baseUrl'] !== 'string' || !isRecord(options)) {
          return (streamSimple as UnknownFunction).call(target, model, context, options)
        }

        const existing = typeof options['transformHeaders'] === 'function'
          ? options['transformHeaders'] as HeaderTransformer
          : undefined
        const transformHeaders: HeaderTransformer = async (headers) => {
          // Preserve any transform supplied by the adapter/provider first; the
          // user's route headers are the final request-level values by design.
          const merged = existing === undefined ? headers : await existing(headers)
          const override = routeOverrideOf(source, model)
          return override?.hasHeaders ? { ...merged, ...override.headers } : merged
        }
        return (streamSimple as UnknownFunction).call(target, model, context, {
          ...options,
          transformHeaders,
        })
      }
    },
  })
}

function snapshotProxyOf(snapshot: ObjectLike, source: PiAiHeaderSource): ObjectLike {
  const models = snapshot['models']
  const modelObject = objectOf(models)
  if (modelObject === undefined || typeof modelObject['streamSimple'] !== 'function') return snapshot
  const proxiedModels = modelsProxyOf(modelObject, source)
  return new Proxy(snapshot, {
    get(target, property, receiver): unknown {
      if (property === 'models') return proxiedModels
      return Reflect.get(target, property, receiver)
    },
  })
}

/** Handle returned for one adapter patch. */
export interface PiAiHeaderTransformHandle {
  readonly active: boolean
  dispose(): void
}

/** Install the request-level transform on one pi-ai-shaped adapter. */
export function installPiAiHeaderTransform(adapter: unknown, source: PiAiHeaderSource): PiAiHeaderTransformHandle {
  const target = objectOf(adapter)
  if (target === undefined || typeof target['current'] !== 'function') return noOpHandle()

  const current = target['current'] as UnknownFunction
  const stored = target[PATCH_STATE] as PiAiPatchState | undefined
  if (stored !== undefined && current === stored.wrappedCurrent) {
    stored.source = source
    stored.users += 1
    let active = true
    return {
      get active(): boolean { return active && stored.users > 0 },
      dispose(): void {
        if (!active) return
        active = false
        stored.users -= 1
        if (stored.users > 0) return
        if (target['current'] === stored.wrappedCurrent) target['current'] = stored.originalCurrent
        if (target[PATCH_STATE] === stored) delete target[PATCH_STATE]
      },
    }
  }

  const originalCurrent = current
  const wrappedCurrent: UnknownFunction = function (this: unknown, ...args: unknown[]): unknown {
    const snapshot = originalCurrent.apply(this, args)
    const snapshotObject = objectOf(snapshot)
    return snapshotObject === undefined ? snapshot : snapshotProxyOf(snapshotObject, state.source)
  }
  const state: PiAiPatchState = { originalCurrent, wrappedCurrent, source, users: 1 }
  target['current'] = wrappedCurrent
  Object.defineProperty(target, PATCH_STATE, { configurable: true, value: state })

  let active = true
  return {
    get active(): boolean { return active && state.users > 0 },
    dispose(): void {
      if (!active) return
      active = false
      state.users -= 1
      if (state.users > 0) return
      if (target['current'] === state.wrappedCurrent) target['current'] = state.originalCurrent
      if (target[PATCH_STATE] === state) delete target[PATCH_STATE]
    },
  }
}

/** Diagnostic snapshot of the bridge's live attach state. */
export interface PiAiHeaderBridgeState {
  runtimeFound: boolean
  registerPatched: boolean
  adaptersInRuntime: number
  adaptersPatched: number
  adapters: string[]
  routes: number
  overrides: number
}

/**
 * Describe what the bridge is currently attached to. Read-only; used by the
 * probe route's `?diag=1` arm to make the request-header takeover observable
 * from the running host instead of only from a test harness.
 */
export function describePiAiHeaderState(llm: unknown, source: PiAiHeaderSource): PiAiHeaderBridgeState {
  const runtime = runtimeObjectOf(llm)
  const adapters = runtime?.['adapters']
  const names: string[] = []
  let total = 0
  let patched = 0
  if (adapters instanceof Map) {
    for (const registration of adapters.values()) {
      const adapter = objectOf(objectOf(registration)?.['adapter'])
      if (adapter === undefined || typeof adapter['current'] !== 'function') continue
      total += 1
      const state = adapter[PATCH_STATE] as PiAiPatchState | undefined
      const isPatched = state !== undefined && adapter['current'] === state.wrappedCurrent
      if (isPatched) patched += 1
      const name = typeof adapter['constructor'] === 'function' ? adapter['constructor'].name : 'unknown'
      names.push(`${name}${isPatched ? '+' : '-'}`)
    }
  }
  const registerState = runtime?.[REGISTER_PATCH_STATE] as RegisterPatchState | undefined
  return {
    runtimeFound: runtime !== undefined,
    registerPatched: registerState !== undefined && runtime?.['registerAdapter'] === registerState.wrappedRegister,
    adaptersInRuntime: total,
    adaptersPatched: patched,
    adapters: names,
    routes: source.current.routes.length,
    overrides: source.current.overrides.length,
  }
}

/**
 * Install the bridge on every current pi-ai-shaped registration and expose a
 * refresh for the runtime's `llm/adapters-updated` event.
 */
export interface PiAiHeaderTransformsHandle {
  refresh(): void
  dispose(): void
}

export function installPiAiHeaderTransforms(llm: unknown, source: PiAiHeaderSource): PiAiHeaderTransformsHandle {
  const installed = new Map<object, PiAiHeaderTransformHandle>()
  const runtime = runtimeObjectOf(llm)
  let disposed = false

  const install = (adapter: unknown): void => {
    if (disposed) return
    const adapterObject = objectOf(adapter)
    if (adapterObject === undefined || typeof adapterObject['current'] !== 'function') return
    if (!installed.has(adapterObject)) installed.set(adapterObject, installPiAiHeaderTransform(adapterObject, source))
  }

  const refresh = (): void => {
    if (disposed) return
    const adapters = runtime?.['adapters']
    if (!(adapters instanceof Map)) return
    const seen = new Set<object>()
    for (const registration of adapters.values()) {
      const registrationObject = objectOf(registration)
      const adapterObject = objectOf(registrationObject?.['adapter'])
      if (adapterObject === undefined || typeof adapterObject['current'] !== 'function') continue
      seen.add(adapterObject)
      install(adapterObject)
    }
    for (const [adapter, handle] of installed) {
      if (seen.has(adapter)) continue
      handle.dispose()
      installed.delete(adapter)
    }
  }

  // dsh-llm-pi-ai registers its adapter through this public method. Install
  // before delegating so a registration cannot emit an update and dispatch a
  // request in between the registry mutation and our refresh listener.
  let registerHandle: PiAiHeaderTransformHandle | undefined
  const originalRegister = runtime?.['registerAdapter']
  if (runtime !== undefined && typeof originalRegister === 'function') {
    const registerState = runtime[REGISTER_PATCH_STATE] as RegisterPatchState | undefined
    if (registerState !== undefined && runtime['registerAdapter'] === registerState.wrappedRegister) {
      registerState.users += 1
      registerHandle = {
        get active(): boolean { return !disposed && registerState.users > 0 },
        dispose(): void {
          if (registerState.users <= 0) return
          registerState.users -= 1
          if (registerState.users > 0) return
          if (runtime['registerAdapter'] === registerState.wrappedRegister) runtime['registerAdapter'] = registerState.originalRegister
          if (runtime[REGISTER_PATCH_STATE] === registerState) delete runtime[REGISTER_PATCH_STATE]
        },
      }
    } else {
      const original = originalRegister as UnknownFunction
      const wrappedRegister: UnknownFunction = function (this: unknown, ...args: unknown[]): unknown {
        const adapter = args[1]
        install(adapter)
        try {
          return original.apply(this, args)
        } finally {
          refresh()
        }
      }
      const state: RegisterPatchState = {
        originalRegister: original,
        wrappedRegister,
        users: 1,
      }
      runtime['registerAdapter'] = wrappedRegister
      Object.defineProperty(runtime, REGISTER_PATCH_STATE, { configurable: true, value: state })
      registerHandle = {
        get active(): boolean { return !disposed && state.users > 0 },
        dispose(): void {
          if (state.users <= 0) return
          state.users -= 1
          if (state.users > 0) return
          if (runtime['registerAdapter'] === state.wrappedRegister) runtime['registerAdapter'] = state.originalRegister
          if (runtime[REGISTER_PATCH_STATE] === state) delete runtime[REGISTER_PATCH_STATE]
        },
      }
    }
  }
  refresh()

  return {
    refresh,
    dispose(): void {
      if (disposed) return
      disposed = true
      registerHandle?.dispose()
      for (const handle of installed.values()) handle.dispose()
      installed.clear()
    },
  }
}
