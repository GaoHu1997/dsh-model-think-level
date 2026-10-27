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
import { anthropicRequestBaseUrl } from './listing.js'
import {
  classifyFailure,
  clearRest,
  isHonoured,
  isRestingFor,
  keyRest,
  planKeys,
  recordRoutePlan,
  restKeyOf,
  wireOf,
  WIRE_DISPATCH_HEADER,
  type FailureKind,
  type KeyCandidate,
} from './key-route-core.js'
import { endpointFamilyOf, type RouteProtocol } from './key-refs.js'

/**
 * The wire each (route, model) was last served on, learned from the request that
 * produced content.
 *
 * A route may hold two keys pinned to different protocols — one OpenAI-format
 * key and one Anthropic-format key, say — and then the first key in list order
 * is, for half the models, the wrong wire: the gateway rejects its body shape
 * before the model is ever reached and the answer only arrives through the
 * failover. That rejected round trip is paid on every request. Remembering the
 * protocol that actually served the model lets the next request start on the
 * right wire, so a mixed-protocol route settles after one request instead of
 * failing over forever.
 */
const servedWire = new Map<string, RouteProtocol>()

/**
 * The wire each (route, model) last failed on before any content streamed.
 *
 * An automatic key picks its wire from the model id, and a relay may not serve
 * that family at all (`/v1/messages` answering 404 for a key whose models all
 * list under `/v1/chat/completions`). Without a memory, every request pays the
 * rejected round trip again once the key's cooldown expires — and clearing the
 * fact on a later success would only restart the cycle, since the automatic
 * resolution would pick the family wire again. The refusal therefore persists
 * for the model: the automatic resolution falls back to the route's own wire,
 * the dispatch that always works, until the process restarts. Only a failure of
 * an AUTOMATIC resolution is recorded — a pinned key's refusal blames that
 * key's credential, not the family's wire — and a pin is never second-guessed
 * by this memory.
 */
const failedWire = new Map<string, RouteProtocol>()

/** Models in use are few, but a long-lived host can still churn through ids. */
const WIRE_MEMORY_LIMIT = 256

/** Record one wire fact for a model, dropping stale ids when the map grows. */
function rememberWireFact(map: Map<string, RouteProtocol>, key: string, wire: RouteProtocol): void {
  if (map.size >= WIRE_MEMORY_LIMIT) map.clear()
  map.set(key, wire)
}

/**
 * Forget which wire served or failed which model.
 *
 * The memories are process-wide optimisations: they may be dropped at any time
 * without changing an answer, only the number of rejected round trips it takes
 * to find one. Tests (and a host that swaps its provider configuration) call
 * this to start from a clean slate.
 */
export function resetWireMemories(): void {
  servedWire.clear()
  failedWire.clear()
}

/**
 * The protocol a key actually dispatches on this route, and how much the model
 * costs there, are decided by the one plan both seams share — see
 * `planKeys` in the routing module. Nothing here ranks keys on its own: a second
 * ordering would only be able to disagree with the wire the plan chose.
 */

/** What a key resolver is told about the request it must sign and dispatch. */
export interface PiAiKeyContext {
  /** The provider route whose profile claims this request. */
  readonly route: string
  /** The model id the request names, when it could be read. */
  readonly model: string | undefined
}

/** A live route index shared with the fetch overlay, plus optional key routing. */
export interface PiAiHeaderSource {
  current: HeaderIndex
  /**
   * Optional live key resolver. When present, the proxy picks the ordered keys
   * that may sign this request and (a) signs with each in turn, (b) re-dispatches
   * the request through a pinned key's own protocol, and (c) fails over to the
   * next key when a stream errors before any content is emitted.
   */
  keys?: (context: PiAiKeyContext) => Promise<readonly KeyCandidate[]>
}

type ProviderHeaders = Record<string, string | null>
type HeaderTransformer = (headers: ProviderHeaders) => ProviderHeaders | Promise<ProviderHeaders>
type UnknownFunction = (...args: unknown[]) => unknown

type ObjectLike = Record<PropertyKey, unknown>

/** One pi-ai protocol implementation, imported lazily so a route never pays for it. */
interface ProtocolStreams {
  readonly streamSimple: (model: Record<string, unknown>, context: unknown, options: Record<string, unknown>) => AsyncIterable<Record<string, unknown>>
}

const PROTOCOL_CACHE = new Map<RouteProtocol, Promise<ProtocolStreams>>()

type ContextNormalizer = (context: unknown) => unknown

let CONTEXT_NORMALIZER: Promise<ContextNormalizer | undefined> | undefined

/**
 * The runtime's context normaliser, when this pi-ai ships one.
 *
 * `Models.streamSimple` folds a legacy `{ systemPrompt, messages, tools }`
 * context into the transcript shape before it dispatches (`normalizeContext`
 * folds both the prompt and the tool declarations into the leading system
 * message). A key that speaks another protocol has to reach that protocol's
 * module DIRECTLY, which bypasses the fold: the implementation then reads tool
 * declarations from the transcript only, so `context.tools` is invisible and
 * the request goes out with NO tools at all. The model answers as if it had
 * none — one text block, `stop`, `end_turn` — and the whole agent loop stalls
 * after a single request.
 *
 * Older pi-ai builds have no `utils/transcript` subpath; those implementations
 * still read `context.tools`, so the legacy context must be left untouched.
 */
function loadContextNormalizer(): Promise<ContextNormalizer | undefined> {
  if (CONTEXT_NORMALIZER !== undefined) return CONTEXT_NORMALIZER
  CONTEXT_NORMALIZER = (async (): Promise<ContextNormalizer | undefined> => {
    try {
      // Kept in a variable: the build's pi-ai typings predate the subpath, and
      // the module only exists in the runtime the adapter is loaded from.
      const specifier: string = '@earendil-works/pi-ai/utils/transcript'
      const module = await import(/* @vite-ignore */ specifier) as unknown as { normalizeContext?: ContextNormalizer }
      return typeof module.normalizeContext === 'function' ? module.normalizeContext : undefined
    } catch {
      return undefined
    }
  })()
  return CONTEXT_NORMALIZER
}

/** Fold a legacy context once per request object; a no-op on transcript input. */
const NORMALIZED_CONTEXTS = new WeakMap<object, unknown>()

async function normalizeDispatchedContext(context: unknown): Promise<unknown> {
  const object = objectOf(context)
  if (object === undefined) return context
  if (NORMALIZED_CONTEXTS.has(object)) return NORMALIZED_CONTEXTS.get(object)
  if (!Array.isArray(object['messages'])) return context
  const normalize = await loadContextNormalizer()
  if (normalize === undefined) return context
  const normalized = normalize(context)
  if (objectOf(normalized) === undefined) return context
  NORMALIZED_CONTEXTS.set(object, normalized)
  return normalized
}

/**
 * Load one pi-ai protocol implementation on demand.
 *
 * A route in the Harness binds exactly ONE protocol for every model, and the
 * adapter's provider dispatches by that single implementation regardless of
 * `model.api` — so a key that must speak a DIFFERENT protocol needs the proxy to
 * reach that protocol's `streamSimple` directly. The modules are external to this
 * bundle (they ship with the runtime) and are cached by the host's import cache;
 * we additionally memoise the promise so a re-dispatch never re-awaits a cold
 * import twice.
 */
function loadProtocol(protocol: RouteProtocol): Promise<ProtocolStreams> {
  let pending = PROTOCOL_CACHE.get(protocol)
  if (pending !== undefined) return pending
  pending = (async (): Promise<ProtocolStreams> => {
    switch (protocol) {
      case 'anthropic-messages':
        return await import('@earendil-works/pi-ai/api/anthropic-messages') as unknown as ProtocolStreams
      case 'openai-responses':
        return await import('@earendil-works/pi-ai/api/openai-responses') as unknown as ProtocolStreams
      case 'openai-completions':
      default:
        return await import('@earendil-works/pi-ai/api/openai-completions') as unknown as ProtocolStreams
    }
  })()
  PROTOCOL_CACHE.set(protocol, pending)
  return pending
}

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

/**
 * The text a stream error carries.
 *
 * pi-ai reports the provider's message in `error.message` (older shapes also use
 * `error.errorMessage`) and a short `reason` on the event itself. The words in
 * there are what tells a rate limit from a spent balance, which is the one
 * distinction the cooldown memory acts on, so all of them are read.
 */
function errorTextOf(event: Record<string, unknown>): string {
  const error = isRecord(event['error']) ? event['error'] : undefined
  const parts: unknown[] = [error?.['message'], error?.['errorMessage'], event['reason']]
  return parts.filter((part): part is string => typeof part === 'string').join(' ')
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

        // Requests this proxy signs carry the wire-dispatch marker on top of
        // the header patch, so the fetch layer below applies its patch WITHOUT
        // re-signing them (see WIRE_DISPATCH_HEADER): the key, the wire and the
        // endpoint are THIS seam's choice, and this seam's failover loop owns
        // the retries. Constant value only — it is stripped in the fetch
        // wrapper before the request leaves the process.
        const markedTransformHeaders: HeaderTransformer = async (headers) => ({
          ...await transformHeaders(headers),
          [WIRE_DISPATCH_HEADER]: '1',
        })

        const modelId = typeof modelObject['id'] === 'string' ? modelObject['id'] : undefined
        const keyResolver = source.keys
        // Without a key resolver we are a pure header overlay: keep the exact
        // stream object the adapter expects (tests and the host rely on identity).
        if (keyResolver === undefined) {
          return (streamSimple as UnknownFunction).call(target, model, context, {
            ...options,
            transformHeaders,
          })
        }

        const route = routeOverrideOf(source, model)?.route
        const dispatch = (): Promise<readonly KeyCandidate[]> => {
          if (route === undefined) return Promise.resolve([])
          return Promise.resolve(keyResolver({ route, model: modelId })).catch(() => [])
        }
        // A key may force its own protocol / endpoint AND a per-request apiKey.
        // When it does, re-dispatch straight to that protocol's streamSimple;
        // otherwise delegate to the route provider (still honouring the key).
        // `avoid` keeps the attempt's resolution in step with the plan's: an
        // automatic key must not re-pick the wire the plan already skipped.
        const startAttempt = async (candidate: KeyCandidate, avoid?: RouteProtocol): Promise<AsyncIterable<Record<string, unknown>>> => {
          const api = typeof modelObject['api'] === 'string' ? modelObject['api'] as RouteProtocol : 'openai-completions'
          const protocol = wireOf(candidate, api, modelId, avoid)
          // An endpoint only rides along when its family is the one this request
          // actually speaks; a pin the route could not honour keeps its own URL.
          const honoured = isHonoured(candidate, api)
          // An automatic key carries its cross-family addresses in `endpoints`:
          // the wire `wireOf` resolved names the family whose address to use.
          // A same-family resolution (wire === api) keeps the route's own URL.
          const autoEndpoint = honoured && candidate.protocol === undefined && protocol !== api
            ? candidate.endpoints?.[endpointFamilyOf(protocol)]
            : undefined
          const selectedBaseUrl = honoured && candidate.endpoint !== undefined
            ? candidate.endpoint
            : autoEndpoint !== undefined
              ? autoEndpoint
              : modelObject['baseUrl'] as string
          const baseUrl = protocol === 'anthropic-messages'
            ? anthropicRequestBaseUrl(selectedBaseUrl)
            : selectedBaseUrl
          const switched = protocol !== api || baseUrl !== modelObject['baseUrl']
          if (!switched) {
            return (streamSimple as UnknownFunction).call(target, model, context, {
              ...options,
              apiKey: candidate.value,
              transformHeaders: markedTransformHeaders,
            }) as unknown as AsyncIterable<Record<string, unknown>>
          }
          // True protocol switch: the request body shape must change, so call the
          // target protocol directly. There is no ModelsImpl.applyAuth in this
          // path — sign and transform headers ourselves before handing over.
          const mergedHeaders = await transformHeaders(isRecord(options['headers'])
            ? options['headers'] as ProviderHeaders
            : {})
          const implementation = await loadProtocol(protocol)
          // The registry call the adapter normally makes folds the context for
          // us; this direct re-dispatch must do it itself or the target
          // implementation never sees the request's tool declarations.
          const dispatchedContext = await normalizeDispatchedContext(context)
          return implementation.streamSimple(
            { ...modelObject, api: protocol, baseUrl },
            dispatchedContext,
            {
              ...options,
              apiKey: candidate.value,
              headers: { ...mergedHeaders, [WIRE_DISPATCH_HEADER]: '1' },
              transformHeaders: undefined,
            },
          )
        }

        const run = async function* (): AsyncGenerator<Record<string, unknown>> {
          const routeCandidates = await dispatch()
          if (routeCandidates.length === 0) {
            // No key claims this route: fall back to the route's own credential.
            const stream = (streamSimple as UnknownFunction).call(target, model, context, {
              ...options,
              transformHeaders,
            }) as AsyncIterable<Record<string, unknown>>
            for await (const event of stream) yield event
            return
          }
          const api = typeof modelObject['api'] === 'string' ? modelObject['api'] as RouteProtocol : 'openai-completions'
          const servedKey = `${route ?? ''}\u0000${modelId ?? ''}`
          // One decision, shared by both seams: fit for this model, the wire that
          // served it last time, the wire that refused it last time, honour of
          // each pin, the wire pool, and the keys that are cooling down — in that
          // order of authority.
          const avoidWire = failedWire.get(servedKey)
          const plan = planKeys(routeCandidates, {
            api,
            model: modelId,
            preferredWire: servedWire.get(servedKey),
            avoidWire,
            isResting: candidate => isRestingFor(keyRest, route ?? '', candidate.ref, modelId, Date.now()),
          })
          // The plan is reproduced in `?diag=1`; it carries references and ranks,
          // never a key value.
          recordRoutePlan(route ?? '', plan, { model: modelId })
          const wireOfAttempt = (candidate: KeyCandidate): RouteProtocol =>
            plan.entries.find(entry => entry.candidate === candidate)?.wire ?? wireOf(candidate, api, modelId, avoidWire)
          /**
           * The cooldown a failed attempt answers for. A refusal that names the
           * model is a fact about the (key, model) pair — a relay whose accounts
           * sit in different groups carries some models on one key and not the
           * other — so it benches only that pair; everything else (a bad
           * credential, a quota, a dead server) benches the key itself.
           */
          const restKeyFor = (candidate: KeyCandidate, kind: FailureKind): string =>
            kind === 'unserved' && modelId !== undefined
              ? restKeyOf(route ?? '', candidate.ref, modelId)
              : restKeyOf(route ?? '', candidate.ref)
          let lastErrorEvent: Record<string, unknown> | undefined
          let lastError: unknown
          for (const candidate of plan.ordered) {
            let stream: AsyncIterable<Record<string, unknown>>
            try {
              stream = await startAttempt(candidate, avoidWire)
            } catch (error) {
              // A synchronous setup failure (e.g. a missing client key) is a
              // pre-content failure: bench the key and try the next one. An
              // AUTOMATIC resolution's wire is marked refused for this model, so
              // the next request resolves elsewhere; a pin's failure blames the
              // credential, not the wire.
              lastError = error
              if (candidate.protocol === undefined) rememberWireFact(failedWire, servedKey, wireOfAttempt(candidate))
              const kind = classifyFailure(undefined, error instanceof Error ? error.message : '') ?? 'refused'
              keyRest.note(restKeyFor(candidate, kind), kind)
              continue
            }
            let committed = false
            let failed = false
            for await (const event of stream) {
              const type = isRecord(event) ? event['type'] : undefined
              if (!committed) {
                if (type === 'error') {
                  // The key was rejected before any content streamed: fail over,
                  // and remember why so the next request does not start here.
                  lastErrorEvent = event as Record<string, unknown>
                  failed = true
                  if (candidate.protocol === undefined) rememberWireFact(failedWire, servedKey, wireOfAttempt(candidate))
                  const kind = classifyFailure(undefined, errorTextOf(event as Record<string, unknown>)) ?? 'refused'
                  keyRest.note(restKeyFor(candidate, kind), kind)
                  break
                }
                committed = true
                clearRest(keyRest, route ?? '', candidate.ref, modelId)
                // This is the wire that actually serves the model; start here
                // next time instead of paying the rejected round trip again.
                // The refused-wire memory is deliberately kept: a wire that
                // refused the model stays out of the automatic resolution.
                rememberWireFact(servedWire, servedKey, wireOfAttempt(candidate))
              }
              yield event
            }
            if (failed) continue
            return
          }
          if (lastErrorEvent !== undefined) {
            yield lastErrorEvent
            return
          }
          // Every key failed synchronously, before producing any event.
          yield {
            type: 'error',
            reason: 'error',
            error: {
              role: 'assistant',
              content: [],
              stopReason: 'error',
              errorMessage: lastError instanceof Error ? lastError.message : 'No API key could serve this model.',
              usage: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, totalTokens: 0 },
            },
          }
        }

        return run()
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
