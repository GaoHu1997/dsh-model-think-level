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
 * "Can serve" is read from TWO different kinds of knowledge, which are never
 * mixed up:
 *  - an ASSIGNMENT ({@link KeyCandidate.models}): the user's own scope. A scope
 *    that lists the model can serve it; a scope that does not is an exact
 *    denial; an UNSCOPED key is a catch-all that serves whatever is left
 *    (the state before a key has been scoped, and the way a user says "this
 *    key takes whatever is left");
 *  - an OBSERVATION ({@link ServingKnowledge}): what each key's `/models`
 *    listing advertised the last time it answered. Keys on one route can sit
 *    in different upstream groups, so "key B lists this model, key A does not"
 *    is a real fact about the pair — but only when a sibling DOES list it: a
 *    failed listing is not an empty one, and a key nobody probed stays a
 *    candidate. This is the case a per-key scope cannot express, because the
 *    user never assigned anything and the first key is a catch-all.
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
 *  - WIRE FIT: a key is ranked by how much translation the model needs (its own
 *    family first, the route's default second, a different vendor's family
 *    last), so a claude model on an OpenAI-speaking route reaches a key that
 *    can speak the Anthropic wire before paying for a translated round trip.
 *    A key PINNED to a protocol always speaks it; an UNPINNED key is automatic
 *    ({@link autoWireOf}) — it speaks the model family's own wire against that
 *    family's address when the key carries one, and the route's default
 *    otherwise;
 *  - HONOUR: a pin that crosses wire families without that family's endpoint
 *    cannot re-dispatch, so it trails the keys that can (it is never dropped: a
 *    lone key must still sign the request);
 *  - COOLDOWN: a key that just failed with a retryable status rests for a while
 *    instead of being charged the same failure again on the next request. A
 *    failure that names THIS model ({@link classifyFailure}'s `unserved`) rests
 *    only the (key, model) pair, so a key that carries one group's models and
 *    not another's keeps serving the ones it does carry.
 *
 * The wire seam alone ranks by wire, because only it can act on a pin; the fetch
 * seam only consults the cooldown memory, since it can neither switch a protocol
 * nor pick the URL.
 *
 * @module dsh-model-think-level/key-route-core
 */

import { endpointFamilyOf, type EndpointFamily, type RouteProtocol } from './key-refs.js'

/** One key a route may use, with the secret already resolved. */
export interface KeyCandidate {
  /** Stable credential reference (for diagnostics and de-duplication). */
  readonly ref: string
  /** The secret to put on the wire. */
  readonly value: string
  /**
   * Model ids this key is known to serve. `undefined` means "unscoped":
   * deliberately left as a catch-all. An array (possibly empty) is a concrete
   * scope.
   */
  readonly models?: readonly string[]
  /**
   * The wire protocol this key must speak, when it is pinned to one.
   * `undefined` means AUTOMATIC: the request speaks whichever wire the model's
   * own family names — an Anthropic-family endpoint for claude models, the
   * route's default for everything else —
   * as far as the key carries that family's address in {@link endpoints}.
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
  /**
   * The addresses an AUTOMATIC key (no {@link protocol}) may dispatch on, one
   * per endpoint family beyond the route's own. `wireOf` picks the model
   * family's entry and the wire seam sends the request there; families absent
   * from the map fall back to the route's default wire.
   */
  readonly endpoints?: Readonly<Partial<Record<EndpointFamily, string>>>
}

/**
 * What the plugin has OBSERVED about one route's keys, as opposed to what the
 * user ASSIGNED in each key's `models`.
 *
 * A listing says what an account's upstream group actually carries; an
 * assignment says what the user ordered. They answer different questions, so
 * they travel separately: an assignment always wins, and an observation only
 * decides between keys the user left unscoped.
 */
export interface ServingKnowledge {
  /**
   * Each reference's last successful listing: the model ids that key's
   * `/models` answer advertised. A reference with NO entry never answered and
   * is therefore unknown — never "serves nothing", because a failed listing must
   * not be read as an empty one.
   */
  readonly listed: ReadonlyMap<string, readonly string[]>
}

/**
 * Whether `key` can serve `model`, per the assignment and observation rules.
 * @param key - the candidate, with its manual scope (if any).
 * @param model - the model id the request names, or undefined when unknown.
 * @param knowledge - what the route's keys were last observed serving.
 */
export function canServe(key: KeyCandidate, model: string | undefined, knowledge?: ServingKnowledge): boolean {
  // An unknown model (the body was unreadable) cannot be used to exclude any
  // key, so every key stays eligible and list order alone decides.
  if (model === undefined) return true
  const models = key.models
  // The user's assignment is the authority: it excludes a model exactly the way
  // it includes one.
  if (models !== undefined) return models.includes(model)
  // An unscoped key is a catch-all until something observes otherwise.
  if (knowledge === undefined) return true
  const listed = knowledge.listed.get(key.ref)
  // Never probed: unknown, so it keeps the benefit of the doubt.
  if (listed === undefined) return true
  if (listed.includes(model)) return true
  // This key's listing does not name the model. That is only evidence of a
  // refusal when a SIBLING key's listing does name it: several keys of one route
  // can sit in different upstream groups, and "key B carries it, key A does not"
  // is exactly the pair this rule exists for. When nobody lists it, no
  // observation is decisive and the key stays a candidate.
  for (const [ref, other] of knowledge.listed) {
    if (ref !== key.ref && other.includes(model)) return false
  }
  return true
}

/**
 * Order the keys that may sign a request for `model`, most-preferred first.
 *
 * The result is the eligible keys in their original list order, grouped into
 * four tiers: a key the user assigned this model to, then a key whose own
 * listing advertises it, then a key nothing is known about, then — last, when no
 * sibling lists it either — a key that was probed and does not carry it. When
 * the filter leaves nothing, all keys are returned unchanged (last resort) — the
 * caller's failover loop still bounds the attempts, so an over-eager scope is
 * corrected on the wire rather than failing the request outright.
 * @param keys - the route's keys in preference order (may be empty).
 * @param model - the model id the request names, or undefined when unknown.
 * @param knowledge - what the route's keys were last observed serving.
 * @returns the ordered candidates to try.
 */
export function keysForModel(
  keys: readonly KeyCandidate[],
  model: string | undefined,
  knowledge?: ServingKnowledge,
): KeyCandidate[] {
  if (model === undefined) return [...keys]
  const eligible = keys.filter(key => canServe(key, model, knowledge))
  if (eligible.length === 0) return [...keys]
  const rankOf = (key: KeyCandidate): number => {
    // An explicit assignment outranks an observation: honouring "this model
    // belongs to that key" is what makes the user's rule true on the wire.
    if (key.models !== undefined) return 0
    const listed = knowledge?.listed.get(key.ref)
    if (listed === undefined) return 2
    return listed.includes(model) ? 1 : 3
  }
  // A stable sort keeps the "both can serve -> first key" rule inside a tier.
  return [...eligible].sort((a, b) => rankOf(a) - rankOf(b))
}

/** The wire families: one body format and one endpoint shape each. */
export type WireFamily = 'anthropic' | 'openai'

/** The family a protocol draws its body format and endpoint from. */
export function wireFamilyOf(protocol: RouteProtocol): WireFamily {
  if (protocol === 'anthropic-messages') return 'anthropic'
  return 'openai'
}

/**
 * A model id that names its own family. Vendor-prefixed ids (`anthropic/claude-…`)
 * and bare names (`claude-sonnet-5`, `gpt-6.1`, `o3-mini`, `codex-1`)
 * both count; an id that names no family (a relay's `tierflow_pro`) is left unknown
 * so the route's own protocol stays the reference.
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
 * The Anthropic family has exactly one wire, so a key pinned to it needs no
 * translation for a model of that family and deserves the
 * first attempt.
 * @param modelId - the model id the request names, or undefined.
 * @returns the concrete protocol, or undefined when the id does not settle one.
 */
export function modelWireHint(modelId: string | undefined): RouteProtocol | undefined {
  const family = modelWireFamily(modelId)
  if (family === 'anthropic') return 'anthropic-messages'
  return undefined
}

/**
 * The wire an AUTOMATIC key (no pin) dispatches for `model`.
 *
 * The model's own family decides: a claude id speaks the Anthropic wire against
 * the Anthropic address — but only when the key actually carries that family's
 * address; any
 * other model (or a family the route itself serves) keeps the route's default
 * wire, which is the one dispatch that always works. A wire that just failed
 * this model before any content (`avoid`) is skipped as the automatic choice —
 * the route's wire is the fallback that answers when the family's gateway does
 * not — while an explicit pin is never second-guessed this way.
 * @param candidate - the key (only its `endpoints` map is read).
 * @param api - the protocol the route speaks.
 * @param model - the model id the request names, or undefined when unknown.
 * @param avoid - a wire not to pick automatically for this model, when one
 *   recently failed.
 * @returns the protocol this attempt speaks.
 */
export function autoWireOf(
  candidate: Pick<KeyCandidate, 'endpoints'>,
  api: RouteProtocol,
  model: string | undefined,
  avoid?: RouteProtocol | undefined,
): RouteProtocol {
  if (model === undefined) return api
  const family = modelWireFamily(model)
  // The route's own family has no separate address to switch to; the OpenAI
  // family has two wires and no id can single one out, so both stay on `api`.
  if (family === undefined || family === endpointFamilyOf(api)) return api
  if (candidate.endpoints?.[family] === undefined) return api
  const hinted: RouteProtocol =
    family === 'anthropic' ? 'anthropic-messages'
    : 'openai-completions'
  return hinted === avoid ? api : hinted
}

/**
 * The protocol a key actually dispatches on a route speaking `api`.
 *
 * An unpinned key resolves automatically per model ({@link autoWireOf}). A pin
 * is honoured when it names the route's own family (a same-family switch needs
 * no other address) or when it carries the endpoint of its family, which is
 * what lets a true protocol switch happen. A cross-family pin with no endpoint
 * cannot be honoured — the route's base URL carries the route family's paths —
 * so the key still signs on the route's own wire rather than being sent to an
 * address it does not own.
 * @param candidate - the key.
 * @param api - the protocol the route speaks.
 * @param model - the model id the request names, or undefined when unknown.
 * @param avoid - a wire the automatic resolution should skip, when one
 *   recently failed for this model.
 * @returns the protocol the attempt will speak.
 */
export function wireOf(
  candidate: KeyCandidate,
  api: RouteProtocol,
  model?: string | undefined,
  avoid?: RouteProtocol | undefined,
): RouteProtocol {
  const pinned = candidate.protocol
  if (pinned === undefined) return autoWireOf(candidate, api, model, avoid)
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
 * @param avoid - a wire the automatic resolution should skip, when one
 *   recently failed for this model.
 * @returns 0 (native), 1 (translated within the family) or 2 (another family).
 */
export function protocolFit(
  candidate: KeyCandidate,
  api: RouteProtocol,
  modelId: string | undefined,
  avoid?: RouteProtocol | undefined,
): WireFit {
  const wire = wireOf(candidate, api, modelId, avoid)
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
 * @param avoid - a wire the automatic resolution should skip, when one
 *   recently failed for this model.
 * @returns a new array, stable within each rank.
 */
export function sortByFit(
  candidates: readonly KeyCandidate[],
  api: RouteProtocol,
  modelId: string | undefined,
  avoid?: RouteProtocol | undefined,
): KeyCandidate[] {
  return candidates
    .map(candidate => ({ candidate, fit: protocolFit(candidate, api, modelId, avoid) }))
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
  /**
   * The wire that failed this model last time before any content, learned from
   * a pre-content failure. An automatic key does not pick it again for this
   * model ({@link autoWireOf}); explicit pins are never second-guessed.
   */
  readonly avoidWire?: RouteProtocol
  /** Whether a key is cooling down after a failure. */
  readonly isResting?: (candidate: KeyCandidate) => boolean
}

/**
 * Decide what the wire seam attempts, in which order, and on which wire.
 *
 * The order is the composition of four signals, strongest last, so a learned
 * fact always beats a heuristic and a hard constraint always beats both:
 *
 *  1. wire fit — least translation first ({@link protocolFit}; the automatic
 *     resolution inside it also skips {@link PlanOptions.avoidWire});
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
  const model = options.model
  const avoid = options.avoidWire
  const entries = candidates.map((candidate): PlannedKey => ({
    candidate,
    wire: wireOf(candidate, api, model, avoid),
    fit: protocolFit(candidate, api, model, avoid),
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
 * and server faults are all "this key did not work, try the next"; a bare
 * 400/404/422 is a request-shape problem that every key would answer identically,
 * so it is returned to the caller unchanged rather than multiplied across keys.
 *
 * The one exception is a 400/404/422 whose BODY names the model as unsupported:
 * that is not a request-shape problem at all but a fact about this key's upstream
 * group (a multi-account relay answers exactly this way for a model another
 * account carries), so it fails over like any other key-level refusal.
 * @param status - the response status code.
 * @param bodyText - the (bounded) response body, when the caller has read it.
 */
export function shouldFailover(status: number, bodyText = ''): boolean {
  if (classifyFailure(status, bodyText) === 'unserved') return true
  return status === 401 || status === 403 || status === 408 || status === 429 || status >= 500
}

/**
 * Why a key failed, as far as the next request is concerned. The distinction is
 * only between "this key is the problem" and "every key would repeat it", which
 * is why a bare 400 has no kind at all — and between "this key" and "this key
 * for THIS model", which is why `unserved` exists.
 */
export type FailureKind = 'auth' | 'rate' | 'quota' | 'server' | 'timeout' | 'refused' | 'unserved'

/**
 * Bodies that say "the account is out of budget" rather than "you are going too
 * fast". A 429 in this shape must not be retried next minute the way a rate
 * limit is: the key is done for the window, whatever the status implies.
 */
const QUOTA_FAILURE = /quota|insufficient|exhausted|balance|billing|credit|payment required|额度|余额|欠费|用尽|配额|充值/i

/**
 * Bodies that say "this account does not carry this model" rather than "your
 * request is malformed".
 *
 * A relay that fans one route out over several upstream accounts answers a model
 * only SOME accounts carry with a 404 whose text names the model ("Model
 * \"x\" is not supported by any configured account in this group") or a 400 with
 * `model_not_found`. Every key repeating that error is the bug this pattern
 * fixes: the model exists, the key's group just does not carry it, so the next
 * key must be tried. Deliberately anchored on model words — a bare 404 ("404 page
 * not found") is still a request-shape failure.
 */
const UNSERVED_FAILURE = new RegExp([
  'model_not_found',
  'model[_\\s-](?:not[_\\s-](?:found|supported|available|exist(?:s)?)|does\\s+not\\s+exist|is\\s+not\\s+(?:found|supported))',
  // The same sentence with the model id between the noun and the verdict:
  // `Model "gpt-6.1-sol" is not supported`, `model kimi-k2 not found`.
  'model[\\s\\S]{0,80}?(?:not\\s+(?:supported|found|available|allowed)|does\\s+not\\s+exist)',
  '(?:invalid|unknown|unsupported|unrecognized|unrecognised|no\\s+such|invalid_request)[_\\s-]*model',
  'not\\s+supported\\s+by\\s+(?:any|this)',
  'no\\s+(?:available\\s+)?(?:channel|account)s?\\s+(?:for|to\\s+serve)',
  '模型[^,，"」]{0,24}?(?:不存在|不存在或不支持|不支持|未找到|无权限|不可用|无效)',
  '不支持[^,，"」]{0,12}?模型',
  '无可用(?:渠道|账号|账户)|分组(?:中|内)?[^,，"」]{0,12}?(?:不支持|无此|没有)',
].join('|'), 'i')

/** Bodies that announce an authentication problem rather than a model one. */
const AUTH_FAILURE = /invalid[_\s-]*(?:api[_\s-]*)?(?:key|token|secret)|unauthorized|authentication|api[_\s-]*key[_\s-]*(?:is[_\s-]*)?(?:invalid|expired|revoked)|密钥|认证失败/i

/**
 * What a failed attempt says about the key, or undefined when it says nothing —
 * a request-shape failure (400/404/422) that every key would answer identically.
 * @param status - the response status, or undefined when the stream failed without one.
 * @param bodyText - the response body (bounded by the caller) or the stream's error text.
 * @returns the failure kind, or undefined for a failure the key did not cause.
 */
export function classifyFailure(status: number | undefined, bodyText = ''): FailureKind | undefined {
  if (status === undefined) {
    if (QUOTA_FAILURE.test(bodyText)) return 'quota'
    // A stream that died with the provider's own "no such model" text is the
    // same pair-level refusal a 404 would have carried.
    return UNSERVED_FAILURE.test(bodyText) ? 'unserved' : 'refused'
  }
  if (status === 400 || status === 404 || status === 422) {
    return UNSERVED_FAILURE.test(bodyText) ? 'unserved' : undefined
  }
  if (status === 401 || status === 403) {
    // A relay can refuse a model it does not carry with a 403 as well; the
    // authentication wording, when present, still wins.
    if (UNSERVED_FAILURE.test(bodyText) && !AUTH_FAILURE.test(bodyText)) return 'unserved'
    return 'auth'
  }
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
  // A group membership changes when the provider re-plans its accounts, not when
  // a request goes wrong: bench the pair for long enough to stop asking every
  // turn, short enough to pick the model back up after a server-side reshuffle.
  unserved: 10 * 60_000,
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
 * The key a cooldown belongs to: the route and the credential reference, plus
 * the model when the failure was about ONE model rather than the credential.
 *
 * A 401 or a 429 describes the credential and its account, so charging the same
 * key a known failure on every model of the route is exactly what a cooldown
 * exists to prevent. An `unserved` refusal is narrower: the account's group
 * carries some models and not others, so benching the whole key would throw away
 * the models it does carry. Those pass a `model` and get a pair-scoped entry.
 * @param route - the provider route key.
 * @param ref - the credential reference.
 * @param model - the model the refusal named, when the cooldown is pair-scoped.
 */
export function restKeyOf(route: string, ref: string, model?: string | undefined): string {
  const pair = `${route}\u0000${ref}`
  return model === undefined || model.length === 0 ? pair : `${pair}\u0000${model}`
}

/**
 * Whether a key should be deferred for this request: it may be benched as a
 * whole, or benched for this model alone.
 * @param store - the cooldown memory.
 * @param route - the provider route key.
 * @param ref - the credential reference.
 * @param model - the model this request names.
 * @param now - the clock.
 */
export function isRestingFor(
  store: RestStore,
  route: string,
  ref: string,
  model: string | undefined,
  now: number,
): boolean {
  if (store.isResting(restKeyOf(route, ref), now)) return true
  return model !== undefined && store.isResting(restKeyOf(route, ref, model), now)
}

/**
 * Retire every cooldown a successful attempt disproves: the key works, and for
 * this model it works too.
 * @param store - the cooldown memory.
 * @param route - the provider route key.
 * @param ref - the credential reference.
 * @param model - the model that just answered.
 */
export function clearRest(store: RestStore, route: string, ref: string, model?: string | undefined): void {
  store.clear(restKeyOf(route, ref))
  if (model !== undefined) store.clear(restKeyOf(route, ref, model))
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
  const usesGoogle = headers.has('x-goog-api-key')
  const usesApiKey = headers.has('x-api-key')
  const usesBearer = headers.has('authorization')
  if (usesGoogle) headers.set('x-goog-api-key', value)
  if (usesApiKey) headers.set('x-api-key', value)
  if (usesBearer) headers.set('authorization', `Bearer ${value}`)
  // A request that carried no credential header at all: default to Bearer.
  if (!usesGoogle && !usesApiKey && !usesBearer) headers.set('authorization', `Bearer ${value}`)
  // Never let another scheme's (stale) credential linger. A request that named
  // the google scheme carries the only credential that scheme understands, so
  // the other two are cleared together; otherwise an api-key outranks a Bearer.
  if (usesGoogle) {
    headers.delete('authorization')
    headers.delete('x-api-key')
  } else if (usesApiKey && usesBearer) {
    headers.delete('authorization')
  }
}

/**
 * Known credential header names, including legacy/profile-owned headers.
 * Recognizing `x-goog-api-key` here prevents stale credentials from leaking;
 * it does not enable a Google protocol. Used to overwrite the credential the
 * transport already set and remove it when re-signing with a different key.
 */
const AUTH_HEADERS = ['authorization', 'x-api-key', 'x-goog-api-key'] as const

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
