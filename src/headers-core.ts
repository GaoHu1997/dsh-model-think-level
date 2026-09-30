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
 * The index is keyed by ORIGIN, deliberately: the fetch seam sees a URL and
 * nothing else, and unlike a substring match an origin compare cannot be
 * fooled by `http://host` matching `http://host.example` or by two loopback
 * ports bleeding into each other.
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

/** One origin's configured request headers, with the route that produced them. */
export interface HeaderOverride {
  /** `scheme://host:port` of the route's endpoint, exactly as Fetch would print it. */
  origin: string
  /** The string header pairs to apply at the fetch layer. */
  headers: Record<string, string>
  /** The route key that declared them (diagnostics and UI labelling). */
  route: string
  /** The configured `user-agent`, retained for compatibility and diagnostics. */
  userAgent?: string
}

/** Backwards-compatible name retained for callers that only knew the UA seam. */
export type UserAgentOverride = HeaderOverride

/** A same-origin header disagreement that the URL-only seam cannot disambiguate. */
export interface HeaderConflict {
  origin: string
  header: string
  routes: string[]
  values: string[]
}

/** The origin index plus what could not be indexed or was ambiguous. */
export interface HeaderIndex {
  /** origin → complete header override, first declarer wins. */
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
  return { byOrigin: new Map(), conflicts: [], headerConflicts: [] }
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

/** Build the origin index from every sendable header in each provider profile. */
export function buildHeaderIndex(
  providers: Record<string, Record<string, unknown>>,
): HeaderIndex {
  const index = emptyIndex()
  const claimedUserAgents = new Map<string, { routes: string[]; values: string[] }>()
  for (const [route, profile] of Object.entries(providers)) {
    const headers = sendableHeadersOf(profile)
    if (headers === undefined) continue
    const origin = originOf(typeof profile['baseURL'] === 'string' ? profile['baseURL'] : undefined)
    if (origin === undefined) continue

    const userAgent = Object.entries(headers).find(([name]) => name.toLowerCase() === 'user-agent')?.[1]
    const existing = index.byOrigin.get(origin)
    if (existing === undefined) {
      index.byOrigin.set(origin, { origin, headers, route, ...(userAgent === undefined ? {} : { userAgent }) })
    } else {
      recordHeaderConflicts(index, existing, route, headers)
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
