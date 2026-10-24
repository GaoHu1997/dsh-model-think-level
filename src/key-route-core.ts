/**
 * The pure half of multi-key routing: given the ordered keys a provider route
 * may authenticate with and the model a request names, decide WHICH key signs
 * the request first, and — when that request fails — WHICH key to try next.
 *
 * The rule the user asked for (Scheme A):
 *  - Keys are listed in preference order; index 0 is the default.
 *  - A model reachable through several keys goes to the FIRST key that can
 *    serve it.
 *  - A model only one key can serve sticks to that key.
 *  - When a request errors, the next capable key is tried.
 *
 * "Can serve" is read from each key's discovered `models` scope:
 *  - a scope that lists the model  -> can serve it (an exact claim);
 *  - an UNSCOPED key (no `models`)  -> treated as a catch-all, so it can serve
 *    anything (this is the state before a key has been probed, and the way a
 *    user deliberately says "this key takes whatever is left");
 *  - a scope that does NOT list the model -> cannot serve it (an exact denial).
 *
 * Eligible keys keep their list order, so the "both can serve -> first key"
 * and "only one can -> that key" rules both fall out of a single filter. If NO
 * key is eligible (a stale or empty scope across the board), every key is
 * returned as a last resort so a wrong scope can never strand a model the
 * first key could in fact reach.
 *
 * This module performs no I/O and knows nothing about credentials: the host
 * fills in each candidate's `value`, and the wire seam consumes the answer.
 *
 * On top of the model scope, three further signals decide the attempt order —
 * the same three a gateway such as magpie mixes into its dispatch:
 *
 *  - WIRE FIT: a key pinned to a protocol is ranked by how much translation the
 *    model needs (its own family first, the route's default second, a different
 *    vendor's family last), so a claude model on an OpenAI-speaking route reaches
 *    an Anthropic-pinned key before paying for a translated round trip;
 *  - HONOUR: a pin that crosses wire families without that family's endpoint
 *    cannot re-dispatch, so it trails the keys that can (it is never dropped: a
 *    lone key must still sign the request);
 *  - COOLDOWN: a key that just failed with a retryable status rests for a while
 *    instead of being charged the same failure again on the next request.
 *
 * The wire seam alone ranks by wire, because only it can act on a pin; the fetch
 * seam only consults the cooldown memory, since it can neither switch a protocol
 * nor pick the URL.
 *
 * @module dsh-model-think-level/key-route-core
 */

import { endpointFamilyOf, type RouteProtocol } from './key-refs.js'

/** One key a route may use, with the secret already resolved. */
export interface KeyCandidate {
  /** Stable credential reference (for diagnostics and de-duplication). */
  readonly ref: string
  /** The secret to put on the wire. */
  readonly value: string
  /**
   * Model ids this key is known to serve. `undefined` means "unscoped": not
   * probed yet, or deliberately left as a catch-all. An array (possibly empty)
   * is a concrete scope.
   */
  readonly models?: readonly string[]
  /**
   * The wire protocol this key must speak, when it is not the route's own.
   * `undefined` means "any protocol" — the request keeps the route's default.
   * A concrete value makes the wire seam re-dispatch the request through that
   * protocol's API implementation (a true protocol switch), using {@link endpoint}.
   */
  readonly protocol?: RouteProtocol
  /**
   * The base URL to send this key's request to, already resolved for the key's
   * protocol family. `undefined` means "use the model's own baseUrl" (the route
   * default). A pinned-protocol key carries its family's endpoint here.
   */
  readonly endpoint?: string
}

/** Whether `key` can serve `model`, per the scope rules above. */
export function canServe(key: KeyCandidate, model: string | undefined): boolean {
  // An unknown model (the body was unreadable) cannot be used to exclude any
  // key, so every key stays eligible and list order alone decides.
  if (model === undefined) return true
  const models = key.models
  // Unscoped is a catch-all: it has no claim that excludes this model.
  if (models === undefined) return true
  return models.includes(model)
}

/**
 * Order the keys that may sign a request for `model`, most-preferred first.
 *
 * The result is the eligible keys in their original list order. When the
 * filter leaves nothing, all keys are returned unchanged (last resort) — the
 * caller's failover loop still bounds the attempts, so an over-eager scope is
 * corrected on the wire rather than failing the request outright.
 * @param keys - the route's keys in preference order (may be empty).
 * @param model - the model id the request names, or undefined when unknown.
 * @returns the ordered candidates to try.
 */
export function keysForModel(
  keys: readonly KeyCandidate[],
  model: string | undefined,
): KeyCandidate[] {
  if (model === undefined) return [...keys]
  const eligible = keys.filter(key => canServe(key, model))
  if (eligible.length === 0) return [...keys]
  // A key that names this model is an explicit assignment and outranks a
  // catch-all key that merely *may* serve anything: honouring the assignment
  // first is what makes "this model belongs to that key" true on the wire.
  const named = eligible.filter(key => key.models !== undefined)
  const catchAll = eligible.filter(key => key.models === undefined)
  return [...named, ...catchAll]
}

/** The two wire families: one body format and one endpoint shape each. */
export type WireFamily = 'anthropic' | 'openai'

/** The family a protocol draws its body format and endpoint from. */
export function wireFamilyOf(protocol: RouteProtocol): WireFamily {
  return protocol === 'anthropic-messages' ? 'anthropic' : 'openai'
}

/**
 * A model id that names its own family. Vendor-prefixed ids (`anthropic/claude-…`)
 * and bare names (`claude-sonnet-5`, `gpt-6.1`, `o3-mini`, `codex-1`) both count;
 * an id that names no family (a relay's `tierflow_pro`) is left unknown so the
 * route's own protocol stays the reference.
 */
const ANTHROPIC_MODEL_ID = /(?:^|[/:._-])(?:claude|anthropic)(?:$|[/:._-])/i
const OPENAI_MODEL_ID = /(?:^|[/:._-])(?:gpt|chatgpt|codex)(?:$|[/:._-])|(?:^|[/:._-])o[1-9](?:$|[/:._-])/i

/** The family a model id announces, or undefined when it announces none. */
export function modelWireFamily(modelId: string | undefined): WireFamily | undefined {
  if (modelId === undefined) return undefined
  if (ANTHROPIC_MODEL_ID.test(modelId)) return 'anthropic'
  if (OPENAI_MODEL_ID.test(modelId)) return 'openai'
  return undefined
}

/**
 * The single wire a model id points at, when its family has only one.
 *
 * The OpenAI family has two wires (Chat Completions and Responses), so no id can
 * single one of them out — the route's own protocol stays the tie-breaker there.
 * The Anthropic family has exactly one, so a key pinned to it needs no
 * translation for an Anthropic model and deserves the first attempt.
 * @param modelId - the model id the request names, or undefined.
 * @returns the concrete protocol, or undefined when the id does not settle one.
 */
export function modelWireHint(modelId: string | undefined): RouteProtocol | undefined {
  return modelWireFamily(modelId) === 'anthropic' ? 'anthropic-messages' : undefined
}

/**
 * The protocol a key actually dispatches on a route speaking `api`.
 *
 * An unpinned key keeps the route's wire. A pin is honoured when it names the
 * route's own family (a same-family switch needs no other address) or when it
 * carries the endpoint of its family, which is what lets a true protocol switch
 * happen. A cross-family pin with no endpoint cannot be honoured — the route's
 * base URL carries the route family's paths — so the key still signs on the
 * route's own wire rather than being sent to an address it does not own.
 * @param candidate - the key.
 * @param api - the protocol the route speaks.
 * @returns the protocol the attempt will speak.
 */
export function wireOf(candidate: KeyCandidate, api: RouteProtocol): RouteProtocol {
  const pinned = candidate.protocol
  if (pinned === undefined) return api
  const crossesFamilies = endpointFamilyOf(pinned) !== endpointFamilyOf(api)
  return crossesFamilies && candidate.endpoint === undefined ? api : pinned
}

/** Whether {@link wireOf} can honour the candidate's pin on this route. */
export function isHonoured(candidate: KeyCandidate, api: RouteProtocol): boolean {
  const pinned = candidate.protocol
  if (pinned === undefined) return true
  return endpointFamilyOf(pinned) === endpointFamilyOf(api) || candidate.endpoint !== undefined
}

/**
 * How much translation a key costs for a model: 0 needs none, 1 keeps the wire
 * family but changes the protocol (Chat Completions vs Responses), 2 speaks a
 * different vendor's family and would pay for a translated round trip.
 */
export type WireFit = 0 | 1 | 2

/**
 * Rank one key against one model, following magpie's three-way fit: the model's
 * own family first, the request's own wire next, another family last.
 * @param candidate - the key.
 * @param api - the protocol the route speaks.
 * @param modelId - the model id, or undefined when the body was unreadable.
 * @returns 0 (native), 1 (translated within the family) or 2 (another family).
 */
export function protocolFit(
  candidate: KeyCandidate,
  api: RouteProtocol,
  modelId: string | undefined,
): WireFit {
  const wire = wireOf(candidate, api)
  const keyFamily = wireFamilyOf(wire)
  const targetFamily = modelWireFamily(modelId) ?? wireFamilyOf(api)
  if (keyFamily !== targetFamily) return 2
  // The route's own wire is the request the caller already made: nothing moves.
  if (wire === api) return 0
  return wire === modelWireHint(modelId) ? 0 : 1
}

/**
 * Stable partition: the items `keep` accepts first, in their original order,
 * then the rest, also in their original order.
 */
function partition<T>(items: readonly T[], keep: (item: T) => boolean): T[] {
  const first: T[] = []
  const rest: T[] = []
  for (const item of items) (keep(item) ? first : rest).push(item)
  return [...first, ...rest]
}

/**
 * Order keys by wire fit alone, keeping list order inside each rank.
 *
 * A model whose family no key shares leaves every key at the same rank, so the
 * caller's order survives untouched: ranking can reorder, never drop.
 * @param candidates - the route's keys in preference order.
 * @param api - the protocol the route speaks.
 * @param modelId - the model id the request names, or undefined.
 * @returns a new array, stable within each rank.
 */
export function sortByFit(
  candidates: readonly KeyCandidate[],
  api: RouteProtocol,
  modelId: string | undefined,
): KeyCandidate[] {
  return candidates
    .map(candidate => ({ candidate, fit: protocolFit(candidate, api, modelId) }))
    .sort((a, b) => a.fit - b.fit)
    .map(entry => entry.candidate)
}

/** Move keys the caller reports as resting behind every key that is ready. */
export function restLast<T extends KeyCandidate>(
  candidates: readonly T[],
  isResting: (candidate: KeyCandidate) => boolean,
): T[] {
  return partition(candidates, candidate => !isResting(candidate))
}

/** One key as the wire seam will attempt it, with the reasons recorded. */
export interface PlannedKey {
  readonly candidate: KeyCandidate
  /** The protocol this attempt will speak ({@link wireOf}). */
  readonly wire: RouteProtocol
  /** How much translation the model costs on this wire ({@link protocolFit}). */
  readonly fit: WireFit
  /** Whether a protocol pin can be honoured ({@link isHonoured}). */
  readonly honoured: boolean
  /** Whether this key is cooling down after a failure. */
  readonly resting: boolean
}

/** What the wire seam should attempt, in order, and why. */
export interface KeyPlan {
  /** The keys to try, most-preferred first (pool, then aside, then resting). */
  readonly ordered: readonly KeyCandidate[]
  /** The same order, annotated for diagnostics. */
  readonly entries: readonly PlannedKey[]
  /**
   * The keys that speak the starting wire. A failure inside the pool is most
   * likely environmental, so the pool is drained before any other wire is tried —
   * a mixed-protocol route then costs at most one translated attempt.
   */
  readonly pool: readonly KeyCandidate[]
  /** Keys that would change the wire (or that a missing endpoint demotes). */
  readonly aside: readonly KeyCandidate[]
  /** The protocol the first attempt speaks, when there is any key at all. */
  readonly wire: RouteProtocol | undefined
}

/** What the wire seam knows about the request it is about to place. */
export interface PlanOptions {
  /** The protocol the route speaks. */
  readonly api: RouteProtocol
  /** The model id the request names, when it could be read. */
  readonly model?: string
  /** The wire that served this model last time, learned from a committed stream. */
  readonly preferredWire?: RouteProtocol
  /** Whether a key is cooling down after a failure. */
  readonly isResting?: (candidate: KeyCandidate) => boolean
}

/**
 * Decide what the wire seam attempts, in which order, and on which wire.
 *
 * The order is the composition of four signals, strongest last, so a learned
 * fact always beats a heuristic and a hard constraint always beats both:
 *
 *  1. wire fit — least translation first ({@link protocolFit});
 *  2. the wire that served this model last time ({@link PlanOptions.preferredWire});
 *  3. honour — keys whose pin can be dispatched before keys that cannot;
 *  4. pooling — the starting wire's keys first, other wires appended after them;
 *  5. cooldown — resting keys last, never dropped.
 *
 * Pooling splits the list without dropping anything: the aside keys are still
 * tried when the pool fails, which is what keeps a single misconfigured key from
 * stranding a model that a different wire could serve.
 * @param candidates - the keys the resolver returned, in preference order.
 * @param options - the route's wire, the model, and the runtime's memories.
 * @returns the plan the caller iterates.
 */
export function planKeys(candidates: readonly KeyCandidate[], options: PlanOptions): KeyPlan {
  const api = options.api
  const entries = candidates.map((candidate): PlannedKey => ({
    candidate,
    wire: wireOf(candidate, api),
    fit: protocolFit(candidate, api, options.model),
    honoured: isHonoured(candidate, api),
    resting: options.isResting?.(candidate) === true,
  }))
  const preferredWire = options.preferredWire
  const byFit = [...entries].sort((a, b) => a.fit - b.fit)
  const byPreferred = partition(byFit, entry => preferredWire === undefined || entry.wire === preferredWire)
  const byHonour = partition(byPreferred, entry => entry.honoured)
  // The starting wire is the best-ranked key that can actually be dispatched;
  // every key sharing it is drained before any other wire is attempted.
  const poolWire = byHonour.find(entry => entry.honoured)?.wire
  const pool = byHonour.filter(entry => entry.honoured && entry.wire === poolWire)
  const aside = byHonour.filter(entry => !(entry.honoured && entry.wire === poolWire))
  const ordered = partition([...pool, ...aside], entry => !entry.resting)
  return {
    ordered: ordered.map(entry => entry.candidate),
    entries: ordered,
    pool: pool.map(entry => entry.candidate),
    aside: aside.map(entry => entry.candidate),
    wire: ordered[0]?.wire,
  }
}

/**
 * Whether an HTTP status is worth retrying on the next key. Authentication and
 * authorization failures (the wrong key for this endpoint), rate limits, timeouts
 * and server faults are all "this key did not work, try the next"; a 400/404/422
 * is a request-shape problem that every key would answer identically, so it is
 * returned to the caller unchanged rather than multiplied across keys.
 * @param status - the response status code.
 */
export function shouldFailover(status: number): boolean {
  return status === 401 || status === 403 || status === 408 || status === 429 || status >= 500
}

/**
 * Why a key failed, as far as the next request is concerned. The distinction is
 * only between "this key is the problem" and "every key would repeat it", which
 * is why a 400 has no kind at all.
 */
export type FailureKind = 'auth' | 'rate' | 'quota' | 'server' | 'timeout' | 'refused'

/**
 * Bodies that say "the account is out of budget" rather than "you are going too
 * fast". A 429 in this shape must not be retried next minute the way a rate
 * limit is: the key is done for the window, whatever the status implies.
 */
const QUOTA_FAILURE = /quota|insufficient|exhausted|balance|billing|credit|payment required|额度|余额|欠费|用尽|配额|充值/i

/**
 * What a failed attempt says about the key, or undefined when it says nothing —
 * a request-shape failure (400/404/422) that every key would answer identically.
 * @param status - the response status, or undefined when the stream failed without one.
 * @param bodyText - the response body (bounded by the caller) or the stream's error text.
 * @returns the failure kind, or undefined for a failure the key did not cause.
 */
export function classifyFailure(status: number | undefined, bodyText = ''): FailureKind | undefined {
  if (status === undefined) return QUOTA_FAILURE.test(bodyText) ? 'quota' : 'refused'
  if (status === 401 || status === 403) return 'auth'
  if (status === 402) return 'quota'
  if (status === 408) return 'timeout'
  if (status === 429) return QUOTA_FAILURE.test(bodyText) ? 'quota' : 'rate'
  if (status >= 500) return 'server'
  return undefined
}

/** The first cooling period per kind: a wrong key is retired, a timeout is not. */
const COOLDOWN_MS: Record<FailureKind, number> = {
  auth: 5 * 60_000,
  rate: 60_000,
  quota: 30 * 60_000,
  server: 30_000,
  timeout: 30_000,
  refused: 60_000,
}

/** Longest a key is ever benched, whatever keeps failing. */
export const REST_COOLDOWN_CAP_MS = 30 * 60_000

/**
 * How long a key should rest after its `failures`-th consecutive failure.
 *
 * The provider's own `Retry-After` is the floor when it is longer than the
 * kind's baseline (a server that says "come back in an hour" means it), and
 * repeated failures double the wait up to the cap so a dead key is not retried
 * on every request forever.
 * @param kind - why it failed.
 * @param failures - how many consecutive failures, 1 for the first.
 * @param retryAfterMs - the provider's `Retry-After`, already parsed.
 * @returns the resting period in milliseconds.
 */
export function cooldownFor(kind: FailureKind, failures = 1, retryAfterMs?: number): number {
  const asked = retryAfterMs !== undefined && retryAfterMs > 0 ? retryAfterMs : 0
  const base = Math.min(REST_COOLDOWN_CAP_MS, Math.max(COOLDOWN_MS[kind], asked))
  const escalated = base * 2 ** Math.max(0, failures - 1)
  return Math.round(Math.min(REST_COOLDOWN_CAP_MS, escalated))
}

/**
 * Parse a `Retry-After` header (delay-seconds or an HTTP date) into milliseconds.
 * @param value - the header value, when the response carried one.
 * @param now - the current time, for the date form.
 * @returns milliseconds to wait, or undefined when the value says nothing usable.
 */
export function parseRetryAfter(value: string | null | undefined, now: number): number | undefined {
  if (typeof value !== 'string') return undefined
  const trimmed = value.trim()
  if (trimmed.length === 0) return undefined
  if (/^\d+(?:\.\d+)?$/.test(trimmed)) return Math.round(Number(trimmed) * 1000)
  const at = Date.parse(trimmed)
  if (Number.isNaN(at)) return undefined
  return Math.max(0, at - now)
}

/** One key's cooling state: who benched it, until when, and how often it failed. */
export interface RestState {
  readonly kind: FailureKind
  /** Epoch milliseconds after which the key is a normal candidate again. */
  readonly until: number
  /** Consecutive failures that produced this period. */
  readonly failures: number
}

/** How a failure was observed, so the period can honour the provider's word. */
export interface RestNote {
  /** The observation time; defaults to now. Injected so tests are deterministic. */
  readonly now?: number
  /** The provider's `Retry-After`, already parsed. */
  readonly retryAfterMs?: number
}

/** Bounded memory of which keys are benched and for how long. */
export interface RestStore {
  /** How many keys it remembers (expired entries included until pruned). */
  readonly size: number
  /** The live state of a key, or undefined when it is a normal candidate again. */
  stateOf(key: string, now: number): RestState | undefined
  /** Whether the key should be deferred right now. */
  isResting(key: string, now: number): boolean
  /** Record one failure of a key and return the state it is now in. */
  note(key: string, kind: FailureKind, options?: RestNote): RestState
  /** The key answered: forget its failures. */
  clear(key: string): void
  /** Forget every key. */
  reset(): void
}

/** Enough for a host that churns through routes without growing without bound. */
export const REST_STORE_LIMIT = 256

/**
 * Create a cooldown store.
 *
 * Holding the clock outside makes the store a pure function of its call history,
 * which is what lets both seams share one memory while the tests drive it.
 * @param limit - how many keys it may remember before pruning expired entries.
 * @returns a store with no keys resting.
 */
export function createRestStore(limit = REST_STORE_LIMIT): RestStore {
  const resting = new Map<string, RestState>()
  const live = (key: string, now: number): RestState | undefined => {
    const state = resting.get(key)
    if (state === undefined) return undefined
    if (state.until > now) return state
    resting.delete(key)
    return undefined
  }
  return {
    get size(): number { return resting.size },
    stateOf: live,
    isResting(key, now) { return live(key, now) !== undefined },
    note(key, kind, options) {
      const now = options?.now ?? Date.now()
      const previous = live(key, now)
      const failures = previous === undefined ? 1 : previous.failures + 1
      const until = now + cooldownFor(kind, failures, options?.retryAfterMs)
      if (resting.size >= limit) {
        for (const [staleKey, state] of resting) {
          if (state.until <= now) resting.delete(staleKey)
        }
        // Still full of live entries: a bounded memory matters more than history.
        if (resting.size >= limit) resting.clear()
      }
      const state: RestState = { kind, until, failures }
      resting.set(key, state)
      return state
    },
    clear(key) { resting.delete(key) },
    reset() { resting.clear() },
  }
}

/**
 * The key a cooldown belongs to: the route and the credential reference.
 *
 * Deliberately not per model: a 401 or a 429 describes the credential and its
 * account, and charging the same key a known failure on every model of the route
 * is what a cooldown exists to prevent.
 * @param route - the provider route key.
 * @param ref - the credential reference.
 */
export function restKeyOf(route: string, ref: string): string {
  return `${route}\u0000${ref}`
}

/** The cooldown memory both seams share for this process. */
export const keyRest: RestStore = createRestStore()

/** One key as it took part in a plan, without its secret. */
export interface PlannedKeyTrace {
  readonly ref: string
  readonly wire: RouteProtocol
  readonly fit: WireFit
  readonly honoured: boolean
  readonly resting: boolean
}

/** The last plan the wire seam built for a request, for `?diag=1`. */
export interface RoutePlanTrace {
  /** When the plan was built. */
  readonly at: number
  readonly route: string
  readonly model: string | undefined
  readonly wire: RouteProtocol | undefined
  readonly keys: readonly PlannedKeyTrace[]
}

const PLAN_TRACE_LIMIT = 16
const planTraces: RoutePlanTrace[] = []

/**
 * Remember a plan for diagnostics. Only references and ranks are kept — never a
 * key value — because the probe route prints these entries to the browser.
 * @param route - the provider route the plan was built for.
 * @param plan - the plan.
 * @param options - the model the plan was built for, and the time.
 */
export function recordRoutePlan(
  route: string,
  plan: KeyPlan,
  options?: { readonly model?: string; readonly now?: number },
): void {
  planTraces.push({
    at: options?.now ?? Date.now(),
    route,
    model: options?.model,
    wire: plan.wire,
    keys: plan.entries.map(entry => ({
      ref: entry.candidate.ref,
      wire: entry.wire,
      fit: entry.fit,
      honoured: entry.honoured,
      resting: entry.resting,
    })),
  })
  if (planTraces.length > PLAN_TRACE_LIMIT) planTraces.splice(0, planTraces.length - PLAN_TRACE_LIMIT)
}

/** The most recent plans, newest last. */
export function readRoutePlans(limit = PLAN_TRACE_LIMIT): readonly RoutePlanTrace[] {
  return planTraces.slice(Math.max(0, planTraces.length - limit))
}

/** Forget the recorded plans. */
export function resetRoutePlans(): void {
  planTraces.length = 0
}



/**
 * Re-sign `headers` with `value` in place, preserving whichever credential
 * scheme the request already used.
 *
 * pi-ai's provider has ALREADY set the auth header from the route's configured
 * key by the time a request reaches the fetch seam; this only swaps the value so
 * the chosen key takes effect without re-deriving the scheme. If neither header
 * is present (a transport that auths elsewhere), a Bearer `authorization` is
 * added. The opposite scheme's header is cleared so two credentials can never
 * ride along together.
 * @param headers - the mutable request headers.
 * @param value - the secret to sign with.
 */
export function applyKeyToHeaders(headers: Headers, value: string): void {
  const usesApiKey = headers.has('x-api-key')
  const usesBearer = headers.has('authorization')
  if (usesApiKey) headers.set('x-api-key', value)
  if (usesBearer) headers.set('authorization', `Bearer ${value}`)
  // A request that carried no credential header at all: default to Bearer.
  if (!usesApiKey && !usesBearer) headers.set('authorization', `Bearer ${value}`)
  // Never let the other scheme's (stale) credential linger.
  if (usesApiKey && usesBearer) headers.delete('authorization')
}

/**
 * The header names that carry a credential, for the two wire styles the harness
 * speaks: Anthropic Messages uses `x-api-key`, everything else a Bearer
 * `authorization`. Used to (a) overwrite whichever one the SDK already set, and
 * (b) know the name to remove when a request is re-signed with a different key.
 */
const AUTH_HEADERS = ['authorization', 'x-api-key'] as const

/** The credential header names, exported for the wire seam's diagnostics. */
export const CREDENTIAL_HEADERS: readonly string[] = AUTH_HEADERS

/**
 * Marker the wire seam (headers-pi-ai) stamps on requests it dispatched: it
 * chose that request's key, wire protocol and endpoint, so the fetch seam
 * (headers-fetch) must apply only its header patch and leave the signature and
 * the failover alone — the two seams rank keys differently on purpose, and a
 * re-signing fetch layer would put a different key's credential on a body
 * encoded for the wire seam's choice. Carries a constant value only (never a
 * reference or secret) and is stripped before the request leaves the fetch
 * wrapper.
 */
export const WIRE_DISPATCH_HEADER = 'x-dsh-model-think-level-wire'
