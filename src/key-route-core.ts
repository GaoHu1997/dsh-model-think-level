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
 * @module dsh-model-think-level/key-route-core
 */

import type { RouteProtocol } from './key-refs.js'

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
  const eligible = keys.filter(key => canServe(key, model))
  return eligible.length > 0 ? eligible : [...keys]
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
 * The header names that carry a credential, for the two wire styles the harness
 * speaks: Anthropic Messages uses `x-api-key`, everything else a Bearer
 * `authorization`. Used to (a) overwrite whichever one the SDK already set, and
 * (b) know the name to remove when a request is re-signed with a different key.
 */
const AUTH_HEADERS = ['authorization', 'x-api-key'] as const

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

/** The credential header names, exported for the wire seam's diagnostics. */
export const CREDENTIAL_HEADERS: readonly string[] = AUTH_HEADERS
