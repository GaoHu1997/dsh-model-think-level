/**
 * Which endpoint a key's model listing is asked of.
 *
 * A key is not tied to one protocol: a route can answer on an OpenAI-family
 * address, an Anthropic-family one and a Gemini-family one, and each key may
 * pin a protocol of its own. Probing every key against the route's default
 * wire would therefore ask half of them a question their credential cannot
 * answer — an Anthropic-pinned key returns `401` from an OpenAI gateway, and
 * the panel would conclude the key serves nothing. This module derives the
 * *protocols a key can actually be used with* from the same facts routing uses
 * (the pin, the route's api, and the stored endpoints), so a probe is only
 * sent where a request would go.
 *
 * The rules mirror routing ({@link module:key-route-core}):
 * - a pin is honoured only when its family has an address; a cross-family pin
 *   with no address for that family is NOT probed, because no request could be
 *   served that way either — the key keeps its previous scope and the plan says
 *   why;
 * - a same-family pin (Responses vs Chat Completions) rides the route's own
 *   address: only the wire changes, so the listing is asked there;
 * - a key with no pin is AUTOMATIC (the request speaks the model family's own
 *   wire where the provider addressed it), so it is probed on the route's wire
 *   and additionally on every other family's address the route configured —
 *   that is the only way to learn that the key also reaches the models of
 *   those families.
 *
 * @module dsh-model-think-level/key-probe
 */

import { endpointFamilyOf, ENDPOINT_FAMILIES, type EndpointFamily, type RouteEndpoints, type RouteProtocol } from './key-refs.js'
import { LISTABLE_PROTOCOLS, displayUrl, listingEntries, probeListingUrl } from './listing.js'

export type { EndpointFamily }

/** The protocol a probe speaks on a family when it has no more specific pin. */
export const FAMILY_PROTOCOL: Readonly<Record<EndpointFamily, RouteProtocol>> = {
  openai: 'openai-completions',
  anthropic: 'anthropic-messages',
  gemini: 'google-generative-ai',
}

/** The listing request one key should be sent. */
export interface ProbeTarget {
  readonly api: RouteProtocol
  readonly baseURL: string
  readonly family: EndpointFamily
}

/** What a key's probe would ask, and why it asks nothing when it asks nothing. */
export interface ProbePlan {
  readonly targets: readonly ProbeTarget[]
  /** Set when no legal request exists for this key (its pin cannot be honoured). */
  readonly skipped?: string
}

/** The routing facts a probe plan is derived from. */
export interface ProbeIntent {
  /** The route's own wire (the provider profile's `api`). */
  readonly api: unknown
  /** The route's own address. */
  readonly baseURL: string
  /** The protocol this key pinned, when it pinned one. */
  readonly pinned?: RouteProtocol | undefined
  /** The route's stored endpoint pair, when the storage has one. */
  readonly endpoints?: RouteEndpoints | undefined
}

/** The wire a route profile names, or undefined when it names none this plugin can speak. */
function knownWire(api: unknown): RouteProtocol | undefined {
  return api === 'anthropic-messages' || api === 'openai-completions' || api === 'openai-responses' || api === 'google-generative-ai'
    ? api
    : undefined
}

/** A non-empty address, trimmed of surrounding whitespace. */
function address(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined
  const trimmed = value.trim()
  return trimmed.length === 0 ? undefined : trimmed
}

/**
 * The listing requests one key should receive.
 *
 * Every target is a request a real call could also make: the protocol is one
 * the key would be dispatched to, and the address is the one that protocol
 * would use. Targets are de-duplicated by what they would actually fetch — a
 * same-family pin shares its family's address with the route's own wire, and a
 * gateway that spells one listing under both protocols must not be asked twice.
 * @param intent - the route's wire and address, the key's pin, the endpoint pair.
 * @returns the targets in preference order, or a skip reason when none apply.
 */
export function probePlanFor(intent: ProbeIntent): ProbePlan {
  // A probe is a real request on a real wire: when the route names a protocol
  // this plugin cannot speak, there is no wire to ask and no address to ask it
  // on — guessing one would report another provider's capabilities.
  const wire = knownWire(intent.api)
  const family = wire === undefined ? undefined : endpointFamilyOf(wire)
  const baseURL = address(intent.baseURL)
  const targets: ProbeTarget[] = []
  const seen = new Set<string>()
  const push = (target: ProbeTarget): void => {
    if (!LISTABLE_PROTOCOLS.has(target.api)) return
    const key = `${target.api}\u0000${probeListingUrl(target.baseURL, target.api)}`
    if (seen.has(key)) return
    seen.add(key)
    targets.push(target)
  }

  if (intent.pinned !== undefined) {
    const pinFamily = endpointFamilyOf(intent.pinned)
    // A same-family pin keeps the route's address (possibly its other wire);
    // a cross-family pin must use that family's own configured address.
    const pinnedBase = pinFamily === family ? baseURL ?? address(intent.endpoints?.[pinFamily]) : address(intent.endpoints?.[pinFamily])
    if (pinnedBase === undefined) {
      // A pin without an address is not honoured by routing either, so asking
      // it would only manufacture a failure.
      return {
        targets: [],
        skipped: `the key pins ${intent.pinned} but this provider has no ${pinFamily} address`,
      }
    }
    push({ api: intent.pinned, baseURL: pinnedBase, family: pinFamily })
    return { targets }
  }

  if (wire !== undefined && family !== undefined) {
    if (baseURL !== undefined) push({ api: wire, baseURL, family })
    // A key with no pin serves every family the route addressed: each extra
    // address is a wire routing could legally dispatch this key on, so each
    // one is asked (a Gemini address is how a bare key proves it also reaches
    // the models of that family).
    for (const other of ENDPOINT_FAMILIES) {
      if (other === family) continue
      const otherBase = address(intent.endpoints?.[other])
      if (otherBase !== undefined) push({ api: FAMILY_PROTOCOL[other], baseURL: otherBase, family: other })
    }
    return { targets }
  }

  // Unknown route wire: ask only the families the provider explicitly addressed.
  for (const configured of ENDPOINT_FAMILIES) {
    const configuredBase = address(intent.endpoints?.[configured])
    if (configuredBase !== undefined) push({ api: FAMILY_PROTOCOL[configured], baseURL: configuredBase, family: configured })
  }
  return {
    targets,
    ...targets.length === 0
      ? { skipped: `this provider cannot be interrogated on ${String(intent.api)}; set each key's models by hand` }
      : {},
  }
}

/** One target's outcome, in the shape the panel can render. */
export interface ProbeTargetOutcome {
  readonly api: RouteProtocol
  readonly family: EndpointFamily
  /** The URL asked, with userinfo stripped so a stored `user:pass@` never leaks. */
  readonly url: string
  readonly ok: boolean
  /** HTTP status when the endpoint answered at all. */
  readonly status?: number
  /** How many distinct models this target advertised. */
  readonly models?: number
  /** Why this target did not answer, when it did not. */
  readonly error?: string
}

/** What one key's probe learned. */
export interface KeyProbeResult {
  readonly ref: string
  /**
   * The key's new scope: the union of every target that answered. Undefined
   * when no target answered — the caller must then keep the previous scope
   * rather than recording "serves nothing".
   */
  readonly models: string[] | undefined
  readonly targets: readonly ProbeTargetOutcome[]
  /** Set when the plan had no legal target at all (see {@link probePlanFor}). */
  readonly skipped?: string
}

/** Transport and credentials one key's probe needs. */
export interface ProbeKeyOptions {
  readonly ref: string
  readonly intent: ProbeIntent
  /** The resolved credential; a probe is always signed by the key it asks about. */
  readonly apiKey: string
  /** The route profile's configured headers (deployment-owned values ride along). */
  readonly profileHeaders: unknown
  readonly timeoutMs: number
  readonly send: (url: string, init: RequestInit) => Promise<Response>
  /** How to sign one listing request for one protocol. */
  readonly headersFor: (profileHeaders: unknown, apiKey: string, api: RouteProtocol) => Record<string, string>
  /** Reads a bounded listing body. */
  readonly read: (response: Response, url: string) => Promise<string>
  /** Parses a listing body into entries; undefined when it names no listing shape. */
  readonly entries: (body: unknown) => Record<string, unknown>[] | undefined
}

/**
 * Ask one key for its models on every address it can legitimately be used with.
 *
 * A target that fails is reported and does not cancel the others: a key that
 * serves only the Anthropic family still records those models when its OpenAI
 * family probe is refused. When at least one target answers, the key's scope
 * becomes the union of the answers; an endpoint answering with an empty listing
 * is a real answer ("this key serves none") and yields `[]`.
 * @param options - the key, its routing facts, and the transport readers.
 * @returns the scope to store and the per-target report.
 */
export async function probeKeyModels(options: ProbeKeyOptions): Promise<KeyProbeResult> {
  const plan = probePlanFor(options.intent)
  // Every address the plan names is asked AT THE SAME TIME. The addresses are
  // independent reads of the same key, so asking them one after another only
  // added their latencies together: a key whose OpenAI address hangs for the
  // whole timeout used to delay its Anthropic answer by the same amount, and a
  // pass over two families could take twice the timeout before it reported
  // anything. Folded below in plan order, so the ids stay deterministic.
  const answers = await Promise.all(plan.targets.map(async target => {
    const url = probeListingUrl(target.baseURL, target.api)
    const reported = displayUrl(url)
    let response: Response
    try {
      response = await options.send(url, {
        method: 'GET',
        headers: options.headersFor(options.profileHeaders, options.apiKey, target.api),
        redirect: 'error',
        signal: AbortSignal.timeout(options.timeoutMs),
      })
    } catch (error) {
      const outcome: ProbeTargetOutcome = {
        api: target.api,
        family: target.family,
        url: reported,
        ok: false,
        error: error instanceof Error ? error.message : String(error),
      }
      return { outcome, ids: [] as string[] }
    }
    if (!response.ok) {
      await response.body?.cancel().catch(() => {
        // Best-effort cleanup: the outcome is already decided by the status.
      })
      const outcome: ProbeTargetOutcome = {
        api: target.api,
        family: target.family,
        url: reported,
        ok: false,
        status: response.status,
      }
      return { outcome, ids: [] as string[] }
    }
    let entries: Record<string, unknown>[] | undefined
    try {
      entries = options.entries(JSON.parse(await options.read(response, url)) as unknown)
    } catch (error) {
      const outcome: ProbeTargetOutcome = {
        api: target.api,
        family: target.family,
        url: reported,
        ok: false,
        status: response.status,
        error: error instanceof Error ? error.message : String(error),
      }
      return { outcome, ids: [] as string[] }
    }
    if (entries === undefined) {
      const outcome: ProbeTargetOutcome = {
        api: target.api,
        family: target.family,
        url: reported,
        ok: false,
        status: response.status,
        error: 'the reply names no model listing',
      }
      return { outcome, ids: [] as string[] }
    }
    const outcome: ProbeTargetOutcome = {
      api: target.api,
      family: target.family,
      url: reported,
      ok: true,
      status: response.status,
      models: entries.length,
    }
    const found: string[] = []
    for (const entry of entries) {
      const id = entry['id']
      if (typeof id === 'string' && id.length > 0) found.push(id)
    }
    return { outcome, ids: found }
  }))
  const outcomes = answers.map(answer => answer.outcome)
  const ids: string[] = []
  const seen = new Set<string>()
  let answered = 0
  for (const answer of answers) {
    if (!answer.outcome.ok) continue
    answered += 1
    for (const id of answer.ids) {
      if (seen.has(id)) continue
      seen.add(id)
      ids.push(id)
    }
  }
  return {
    ref: options.ref,
    models: answered === 0 ? undefined : ids,
    targets: outcomes,
    ...plan.skipped === undefined ? {} : { skipped: plan.skipped },
  }
}

/** Re-exported so the entry module does not import two listing names for one op. */
export { listingEntries as parseListingEntries }
