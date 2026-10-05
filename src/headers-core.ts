/**
 * Provider request-header overlay, PURE half: the origin index and the header
 * value rules shared by the fetch-layer installer and the conflict report.
 *
 * Why this exists at all (issue #12): a route's `headers` dict can be merged or
 * overwritten by the official adapter's attribution headers, with `user-agent`
 * being the most visible case. A gateway that depends on any configured client
 * header therefore may not see the value stored in the profile. The overlay
 * reapplies the complete configured dictionary at the fetch layer, the last
 * public seam before the request reaches the wire.
 *
 * The index keeps every route's endpoint path and configured model ids. The URL
 * alone cannot distinguish two routes that share an origin, while an OpenAI-
 * compatible chat request carries the selected model in its JSON body. The
 * origin map remains as a backwards-compatible fallback for requests that do
 * not expose enough identity (for example a GET /models probe).
 *
 * @module dsh-model-think-level/headers-core
 */

import { isRecord } from './shared.js'

/**
 * Upper bound on one header value the plugin will send. Fetch itself refuses
 * newline-bearing values (a header-injection guard); this plugin additionally
 * refuses anything unreasonable long rather than letting a paste of a whole
 * certificate turn every request into an upstream 400.
 */
const MAX_UA_LENGTH = 512

/** One route's configured request headers and its fetch matching metadata. */
export interface HeaderOverride {
  /** `scheme://host:port` of the route's endpoint, exactly as Fetch would print it. */
  origin: string
  /** Normalized pathname prefix from the route's baseURL. */
  pathPrefix: string
  /**
   * The string header pairs to apply at the fetch layer. Empty when the route
   * declares none: the route still participates in matching, so a request that
   * clearly belongs to it is NOT given another route's headers.
   */
  headers: Record<string, string>
  /** The route key that declared them (diagnostics and UI labelling). */
  route: string
  /** Model IDs declared by this route, used to disambiguate shared endpoints. */
  modelIds: string[]
  /** The configured `user-agent`, retained for compatibility and diagnostics. */
  userAgent?: string
  /** Whether this route actually declares sendable request headers. */
  hasHeaders: boolean
}

/** Backwards-compatible name retained for callers that only knew the UA seam. */
export type UserAgentOverride = HeaderOverride

/** A same-origin header disagreement that the URL-only fetch seam cannot disambiguate. */
export interface HeaderConflict {
  origin: string
  header: string
  routes: string[]
  values: string[]
}

/** The route index plus what could not be indexed or was ambiguous. */
export interface HeaderIndex {
  /** Every route with a usable endpoint, headers included or not. */
  routes: HeaderOverride[]
  /** Every route with sendable headers, retained for diagnostics and the UI. */
  overrides: HeaderOverride[]
  /** origin → first complete header override, used as a conservative fallback. */
  byOrigin: Map<string, HeaderOverride>
  /** Same-origin routes that declare different header values. */
  conflicts: { origin: string; routes: string[]; values: string[] }[]
  /** Same-origin disagreements for any configured header. */
  headerConflicts: HeaderConflict[]
}

/** Backwards-compatible name retained for the original public index contract. */
export type UserAgentIndex = HeaderIndex

/** An empty index, for the "no route declares headers" case. */
export function emptyIndex(): HeaderIndex {
  return { routes: [], overrides: [], byOrigin: new Map(), conflicts: [], headerConflicts: [] }
}

/** The `scheme://host:port` of a URL string, or undefined when unparseable. */
export function originOf(url: string | undefined): string | undefined {
  if (url === undefined || url.trim().length === 0) return undefined
  try {
    return new URL(url).origin
  } catch {
    // A relative or malformed endpoint is not an origin this seam can match.
    return undefined
  }
}

/**
 * Whether a configured value can ride a Fetch `user-agent` field. Refused
 * rather than sanitized: a header carrying a newline is a request-splitting
 * hazard, and quietly rewriting the user's value would send something they
 * never asked for.
 * @param value - the configured header value.
 * @returns whether it is safe to `Headers.set()`.
 */
export function isSendableUserAgent(value: string): boolean {
  if (value.length === 0 || value.length > MAX_UA_LENGTH) return false
  // CR/LF and NUL are what Fetch's own guard rejects; refusing them here keeps
  // the refusal at configuration time instead of on every request.
  return !/[\r\n\0]/.test(value)
}

/**
 * Whether a configured name/value pair can ride a Fetch header. Fetch is the
 * authority for the exact token grammar, so this accepts arbitrary legal names
 * instead of maintaining a brittle allow-list.
 */
export function isSendableHeader(name: string, value: string): boolean {
  if (name.length === 0) return false
  try {
    const headers = new Headers()
    headers.set(name, value)
    return true
  } catch {
    return false
  }
}

/** The `headers` dict of one route profile, as string pairs, or undefined. */
export function headersOf(profile: Record<string, unknown> | undefined): Record<string, string> | undefined {
  if (profile === undefined) return undefined
  const headers = profile['headers']
  if (!isRecord(headers)) return undefined
  const pairs: Record<string, string> = {}
  for (const [name, value] of Object.entries(headers)) {
    if (typeof value === 'string') pairs[name] = value
  }
  return Object.keys(pairs).length === 0 ? undefined : pairs
}

/**
 * The subset of a profile's headers that Fetch can send. An invalid stored
 * entry must not make the wrapper throw and break an otherwise valid request.
 */
function sendableHeadersOf(profile: Record<string, unknown> | undefined): Record<string, string> | undefined {
  const headers = headersOf(profile)
  if (headers === undefined) return undefined
  const sendable: Record<string, string> = {}
  for (const [name, value] of Object.entries(headers)) {
    if (!isSendableHeader(name, value)) continue
    // Keep the historical UA guard: it avoids sending a malformed or
    // unexpectedly huge client identity while leaving every other legal header
    // available to the arbitrary-header editor.
    if (name.toLowerCase() === 'user-agent' && !isSendableUserAgent(value)) continue
    sendable[name] = value
  }
  return Object.keys(sendable).length === 0 ? undefined : sendable
}

/**
 * The `user-agent` a route's `headers` dict declares, case-insensitively.
 *
 * A `user-agent` stored here is the user's DECLARATION of the identity their
 * gateway wants, even though the official adapter discards it; the plugin reads
 * the same key so the settings document stays the single source of truth.
 * @param profile - one route's profile record.
 * @returns the value, or undefined when the route declares none.
 */
export function declaredUserAgent(profile: Record<string, unknown> | undefined): string | undefined {
  const headers = headersOf(profile)
  if (headers === undefined) return undefined
  for (const [name, value] of Object.entries(headers)) {
    if (name.toLowerCase() === 'user-agent') return isSendableUserAgent(value) ? value : undefined
  }
  return undefined
}

/** Normalize a route endpoint's pathname for boundary-safe prefix matching. */
function pathPrefixOf(url: string): string {
  try {
    const pathname = new URL(url).pathname.replace(/\/+$/, '')
    return pathname.length === 0 ? '/' : pathname
  } catch {
    return '/'
  }
}

/** Model IDs that can appear in a pi-ai request body for one route. */
function modelIdsOf(profile: Record<string, unknown>): string[] {
  const ids = new Set<string>()
  const models = profile['models']
  if (Array.isArray(models)) {
    for (const model of models) {
      if (!isRecord(model) || typeof model['id'] !== 'string' || model['id'].length === 0) continue
      ids.add(model['id'])
    }
  }
  // modelOverrides is keyed by model id and can carry entries not repeated in
  // the explicit models array, so include it as another source of route identity.
  const overrides = profile['modelOverrides']
  if (isRecord(overrides)) {
    for (const id of Object.keys(overrides)) if (id.length > 0) ids.add(id)
  }
  return [...ids]
}

/** Normalize names the way Fetch's Headers object compares them. */
function normalizedHeaders(headers: Record<string, string>): Map<string, { name: string; value: string }> {
  const normalized = new Map<string, { name: string; value: string }>()
  for (const [name, value] of Object.entries(headers)) {
    normalized.set(name.toLowerCase(), { name, value })
  }
  return normalized
}

/** Record a same-origin difference that the URL-only fetch seam cannot route. */
function recordHeaderConflicts(index: HeaderIndex, existing: HeaderOverride, route: string, headers: Record<string, string>): void {
  const first = normalizedHeaders(existing.headers)
  const next = normalizedHeaders(headers)
  const names = new Set([...first.keys(), ...next.keys()])
  for (const name of names) {
    const oldEntry = first.get(name)
    const nextEntry = next.get(name)
    if (oldEntry?.value === nextEntry?.value) continue
    const reportedName = nextEntry?.name ?? oldEntry?.name ?? name
    const reported = index.headerConflicts.find(entry => entry.origin === existing.origin && entry.header.toLowerCase() === name)
    if (reported === undefined) {
      index.headerConflicts.push({
        origin: existing.origin,
        header: reportedName,
        routes: [existing.route, route],
        values: [oldEntry?.value ?? '<not configured>', nextEntry?.value ?? '<not configured>'],
      })
    } else if (!reported.routes.includes(route)) {
      reported.routes.push(route)
      reported.values.push(nextEntry?.value ?? '<not configured>')
    }
  }
}

/** Build the route index from each provider profile's endpoint and header declaration. */
export function buildHeaderIndex(
  providers: Record<string, Record<string, unknown>>,
): HeaderIndex {
  const index = emptyIndex()
  const claimedUserAgents = new Map<string, { routes: string[]; values: string[] }>()
  for (const [route, profile] of Object.entries(providers)) {
    const baseURL = typeof profile['baseURL'] === 'string' ? profile['baseURL'] : undefined
    const origin = originOf(baseURL)
    if (origin === undefined) continue

    const sendable = sendableHeadersOf(profile) ?? {}
    const hasHeaders = Object.keys(sendable).length > 0
    const userAgent = Object.entries(sendable).find(([name]) => name.toLowerCase() === 'user-agent')?.[1]
    const override: HeaderOverride = {
      origin,
      pathPrefix: pathPrefixOf(baseURL ?? origin),
      headers: sendable,
      route,
      modelIds: modelIdsOf(profile),
      hasHeaders,
      ...(userAgent === undefined ? {} : { userAgent }),
    }
    // Every route is registered, headers or not: a route that declares no
    // headers must still be able to claim its own requests so another route on
    // the same endpoint cannot leak its headers onto them.
    index.routes.push(override)
    if (!hasHeaders) continue
    index.overrides.push(override)
    const existing = index.byOrigin.get(origin)
    if (existing === undefined) {
      index.byOrigin.set(origin, override)
    } else {
      recordHeaderConflicts(index, existing, route, sendable)
    }

    if (userAgent === undefined) continue
    const claimed = claimedUserAgents.get(origin)
    if (claimed === undefined) {
      claimedUserAgents.set(origin, { routes: [route], values: [userAgent] })
      continue
    }
    claimed.routes.push(route)
    claimed.values.push(userAgent)
    // Idempotent declaration (two routes, same identity) is not a UA conflict.
    if (claimed.values.every(value => value === claimed.values[0])) continue
    const reported = index.conflicts.find(entry => entry.origin === origin)
    if (reported === undefined) index.conflicts.push({ origin, routes: [...claimed.routes], values: [...claimed.values] })
    else {
      reported.routes = [...claimed.routes]
      reported.values = [...claimed.values]
    }
  }
  return index
}

/** Original public name retained while callers migrate to the generic index. */
export function buildUserAgentIndex(
  providers: Record<string, Record<string, unknown>>,
): UserAgentIndex {
  return buildHeaderIndex(providers)
}

/** The pathname of a request URL, normalized the way {@link pathPrefixOf} is. */
export function requestPathOf(url: string): string | undefined {
  try {
    return new URL(url).pathname
  } catch {
    return undefined
  }
}

/** Whether a request path sits under a route's baseURL path prefix. */
function pathMatches(requestPath: string, prefix: string): boolean {
  if (prefix === '/') return true
  return requestPath === prefix || requestPath.startsWith(`${prefix}/`)
}

/**
 * The model id carried by a JSON request body, or undefined when the body is
 * not JSON / names no string `model`. OpenAI-compatible chat completions and
 * responses both put the selected model in the top-level `model` field.
 */
export function modelOfJsonBody(body: string): string | undefined {
  try {
    const parsed: unknown = JSON.parse(body)
    if (!isRecord(parsed)) return undefined
    const model = parsed['model']
    return typeof model === 'string' && model.length > 0 ? model : undefined
  } catch {
    // A non-JSON body (multipart, SSE upload, empty) carries no model identity.
    return undefined
  }
}

/**
 * The routes that could own a request, narrowed by origin and endpoint path.
 *
 * The result is the set the fetch layer must disambiguate: one element means
 * the URL already identifies the route (no body read is needed), several means
 * only the request's own `model` can decide, and zero means no route matches.
 * @param index - the live route index.
 * @param url - the request URL.
 * @returns the candidate overrides, in declaration order.
 */
export function pathCandidatesOf(index: HeaderIndex, url: string): HeaderOverride[] {
  const origin = originOf(url)
  if (origin === undefined) return []
  // A hand-built index may carry only the origin map; honour it as the legacy
  // single-candidate shape.
  const known = index.routes.length === 0 ? index.overrides : index.routes
  const byOrigin = known.length === 0
    ? (() => { const only = index.byOrigin.get(origin); return only === undefined ? [] : [only] })()
    : known.filter(entry => entry.origin === origin)
  if (byOrigin.length <= 1) return byOrigin
  const requestPath = requestPathOf(url)
  if (requestPath === undefined) return byOrigin
  const matched = byOrigin.filter(entry => pathMatches(requestPath, entry.pathPrefix))
  // An empty path match means the route paths were not describable (or the
  // request targets a prefix no route declares): keep every candidate.
  return matched.length === 0 ? byOrigin : matched
}

/**
 * Pick one route out of already-narrowed candidates by the request body's model.
 *
 * The model only decides when exactly one candidate declares it; a model no
 * candidate declares, or a model several candidates share, falls back to the
 * first declarer — the same conservative rule as a request with no model at
 * all.
 * @param candidates - the path-narrowed candidates, in declaration order.
 * @param model - the model id read from the request body, when one was found.
 * @returns the override to apply, or undefined when there are no candidates.
 */
export function selectOverrideFrom(candidates: HeaderOverride[], model?: string): HeaderOverride | undefined {
  if (candidates.length <= 1) return candidates[0]
  if (model !== undefined) {
    const byModel = candidates.filter(entry => entry.modelIds.includes(model))
    if (byModel.length === 1) return byModel[0]
  }
  return candidates[0]
}

/**
 * Pick the route whose configured headers belong on one request.
 *
 * Two routes can share an origin, which the URL alone cannot separate. The
 * choice is therefore narrowed in three steps: the endpoint path prefix (see
 * {@link pathCandidatesOf}), then the `model` carried by the JSON body (see
 * {@link selectOverrideFrom}), then the first declarer. A request that cannot
 * be pinned down therefore keeps the conservative behaviour the plugin shipped
 * with, and the index's conflict report tells the user the endpoints overlap.
 * @param index - the live route index.
 * @param url - the request URL.
 * @param model - the model id read from the request body, when one was found.
 * @returns the override to apply, or undefined when no route matches.
 */
export function selectOverride(
  index: HeaderIndex,
  url: string,
  model?: string,
): HeaderOverride | undefined {
  return selectOverrideFrom(pathCandidatesOf(index, url), model)
}

/**
 * The request URL a Fetch call is aimed at, or undefined when it cannot be
 * classified. A `Request` from another realm fails the `instanceof` test and is
 * reported as unclassifiable rather than mis-read — the same conservative
 * posture the official fetch seam takes.
 * @param input - the fetch input.
 * @returns the URL string, when one can be read.
 */
export function requestUrlOf(input: unknown): string | undefined {
  if (typeof input === 'string') return input
  if (typeof URL !== 'undefined' && input instanceof URL) return input.href
  if (typeof Request !== 'undefined' && input instanceof Request) return input.url
  return undefined
}
