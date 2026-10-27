/**
 * The fetch-layer installer for provider request-header overrides AND multi-key
 * request signing. The decision of WHAT to send lives in `headers-core.ts` (which
 * headers a route declares) and `key-route-core.ts` (which key a route should
 * sign with, and whether a failed attempt deserves the next key); this module
 * owns the global seam and performs the retries.
 *
 * Shape of the seam: one process-wide wrapper owns `globalThis.fetch`, and
 * every activation is an ENTRY inside it. That is what makes the plugin safe
 * next to itself (an HMR remount, a second composer, two plugin instances) and
 * what makes unloading exact: an entry leaves the registry and the wrapper is
 * restored only once the last entry is gone — never a blind
 * `globalThis.fetch = original` that would clobber a wrapper installed after
 * this one, and never a wrapper left behind holding the process's fetch.
 *
 * The wrapper is deliberately narrow: a request whose URL is not in the index
 * passes through with its ORIGINAL arguments (same object identity), so
 * unconfigured traffic pays exactly one URL classification and one index
 * lookup — no allocation beyond that, and no way for a bug in the merge path
 * to alter a request that never matched.
 *
 * Why fetch rather than the pi-ai `transformHeaders` option, which would be
 * narrower: reaching that option means holding the adapter's private `models`
 * collection, and every sanctioned seam (`llm/stream` waterfall,
 * `registerAdapter`) stops at the stream, above the wire. Fetch is the only
 * public surface that sees the merged headers. Both were probed against the
 * real runtime — see `.tmp-rel/headers-probe/`.
 *
 * Why fetch is ALSO where multi-key failover lives: the provider pushes its
 * `start` event only after a successful HTTP response and turns a bad key
 * (401/403) or rate limit (429) into a thrown error, so by the time pi-ai sees
 * a failure the request has already been spent. This wrapper holds the raw
 * `Response` — status included — before the SDK interprets it, so it can cancel
 * a rejected attempt and re-issue it with the next key while the request body
 * is still available.
 *
 * @module dsh-model-think-level/headers-fetch
 */

import {
  emptyIndex,
  modelOfJsonBody,
  pathCandidatesOf,
  requestUrlOf,
  selectOverrideFrom,
  type HeaderIndex,
  type HeaderOverride,
} from './headers-core.js'
import {
  applyKeyToHeaders,
  classifyFailure,
  clearRest,
  isRestingFor,
  keyRest,
  parseRetryAfter,
  restKeyOf,
  restLast,
  shouldFailover,
  WIRE_DISPATCH_HEADER,
  type FailureKind,
  type KeyCandidate,
} from './key-route-core.js'

/** Registry key on `globalThis`, so a second plugin load shares the one wrapper. */
const REGISTRY = Symbol.for('dsh-model-think-level.fetch-overrides')

/** What a key resolver is told about the request it must sign. */
export interface KeyRouteContext {
  /** The provider route whose profile matched the request URL. */
  readonly route: string
  /** The model id the request body named, when it could be read. */
  readonly model: string | undefined
}

/** Context for aggregating a provider's model listing across its keys. */
export interface ModelListingContext {
  readonly route: string
  readonly url: string
  readonly headers: Headers
  readonly keys: readonly KeyCandidate[]
  readonly signal?: AbortSignal | null
  /** The fetch below this plugin's wrapper, avoiding recursive interception. */
  readonly send: typeof globalThis.fetch
}

/** One activation's contribution to the process-wide wrapper. */
interface Entry {
  /**
   * Reads the current index. A source rather than a value because the settings
   * document is live: a route added, edited, or removed on the Models page must
   * reach the next request without a plugin reload.
   */
  index: () => HeaderIndex
  /**
   * Orders the keys this route may sign with, most-preferred first, each with
   * its secret already resolved. Absent when this activation does not route
   * keys. A live closure so a key added or re-scoped later is honoured without
   * reinstalling the wrapper.
   */
  keys?: (context: KeyRouteContext) => Promise<readonly KeyCandidate[]>
  /** Combines a GET model listing across the resolved key candidates. */
  modelListing?: (context: ModelListingContext) => Promise<Response | undefined>
}

/** The process-wide wrapper state. */
interface Registry {
  base: typeof globalThis.fetch
  wrapper: typeof globalThis.fetch
  entries: Map<symbol, Entry>
}

function registryOf(): Registry | undefined {
  const holder = globalThis as unknown as Record<symbol, Registry | undefined>
  return holder[REGISTRY]
}

/**
 * Read a request body as text without consuming the request itself.
 *
 * The body is only read when the URL alone leaves the route ambiguous, or when
 * a key resolver needs the model to pick a key — so the common single-route,
 * no-keys case still pays nothing. A `Request` is cloned (its stream must
 * survive for the real send); an `init.body` string is used directly, and any
 * other body shape (stream, FormData) yields undefined rather than being
 * disturbed.
 */
async function bodyTextOf(input: unknown, init: RequestInit | undefined): Promise<string | undefined> {
  if (typeof init?.body === 'string') return init.body
  if (typeof Request !== 'undefined' && input instanceof Request) {
    try {
      return await input.clone().text()
    } catch {
      // A body that cannot be cloned (already disturbed, or streamed) simply
      // leaves the route ambiguous and the first declarer serves.
      return undefined
    }
  }
  return undefined
}

/** Whether this matched route request is asking for its model catalogue. */
function isModelListingRequest(url: string, method: string | undefined): boolean {
  if ((method ?? 'GET').toUpperCase() !== 'GET') return false
  try {
    return new URL(url).pathname.endsWith('/models')
  } catch {
    return false
  }
}

/**
 * Whether aggregating the model listing could answer more than the plain
 * request would.
 *
 * The merge began as a multi-key feature, but a SINGLE key can also reach
 * beyond the one URL the plain GET asks: an automatic key carries the
 * cross-family addresses the provider configured (更多端点), and a pinned key
 * dials its own family's address. In both cases the catalogue the merge
 * returns is the union of addresses, while the plain request would report
 * only the route's own protocol's models — so the merge runs for one key too.
 * A lone key with no extra address keeps the ordinary path, where the
 * endpoint's own response passes through verbatim.
 */
function listingCouldExceedPlainRequest(keys: readonly KeyCandidate[]): boolean {
  if (keys.length > 1) return true
  return keys.some(candidate =>
    candidate.endpoint !== undefined ||
    (candidate.endpoints !== undefined && Object.keys(candidate.endpoints).length > 0))
}

/**
 * Read at most `limit` characters of a response body WITHOUT pulling the rest.
 *
 * `response.clone().text()` would read the whole reply into one branch and tee
 * the entire remainder into memory for the other; a provider that answers a
 * failure with a page-sized body must not cost that. Reading the clone's
 * reader up to the limit and cancelling bounds the buffered bytes to what was
 * asked for.
 */
async function readBoundedText(response: Response, limit: number): Promise<string> {
  const body = response.clone().body
  if (body === null) return ''
  const reader = body.getReader()
  const decoder = new TextDecoder()
  let text = ''
  try {
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      text += decoder.decode(value, { stream: true })
      if (text.length >= limit) break
    }
  } finally {
    await reader.cancel().catch(() => {
      // The answer is already decided; releasing the stream is cleanup only.
    })
  }
  return text.slice(0, limit)
}

/**
 * The caller's request headers as a mutable copy, seeded the way Fetch itself
 * resolves them: an explicit `init.headers` replaces a `Request`'s own headers,
 * and the `Request`'s are inherited only when the init names none. Seeding from
 * the wrong one would either drop the caller's headers or resurrect the ones
 * the caller replaced.
 */
function seedHeaders(input: unknown, init: RequestInit | undefined): Headers {
  if (init?.headers !== undefined && init.headers !== null) return new Headers(init.headers as HeadersInit)
  if (typeof Request !== 'undefined' && input instanceof Request) return new Headers(input.headers)
  return new Headers()
}

/**
 * The caller's request as it should leave the wrapper when this layer does NOT
 * claim it: identical to what came in, except an internal wire-dispatch marker
 * (see WIRE_DISPATCH_HEADER) is stripped. The wire seam marks the requests it
 * has already signed — including ones this layer will never match (a key
 * endpoint on another origin than the route's base URL leaves the index
 * empty) — and a marker that survives a passthrough ships an internal
 * identifier upstream. Unmarked requests come back untouched, so the plain
 * passthrough keeps the caller's exact object identity.
 */
function passthroughInit(input: RequestInfo | URL, init: RequestInit | undefined): RequestInit | undefined {
  if (init?.headers === undefined || init.headers === null) return init
  const headers = new Headers(init.headers as HeadersInit)
  if (headers.get(WIRE_DISPATCH_HEADER) !== '1') return init
  headers.delete(WIRE_DISPATCH_HEADER)
  return { ...init, headers }
}

/**
 * The wrapper: inject the matched route's request headers, sign with the right
 * key, fail over to the next key on a retryable status, and delegate everything
 * else untouched.
 */
function makeWrapper(base: typeof globalThis.fetch, entries: Map<symbol, Entry>): typeof globalThis.fetch {
  return async function fetchWithProviderHeaders(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
    const url = requestUrlOf(input)
    if (url === undefined) return base(input, passthroughInit(input, init))
    // The URL (origin + endpoint path) narrows the route. Only when it leaves
    // several candidates does the request body's `model` have to decide -- so a
    // single-route deployment keeps the zero-read, zero-allocation fast path.
    let entry: Entry | undefined
    let candidates: HeaderOverride[] = []
    for (const candidate of entries.values()) {
      const found = pathCandidatesOf(candidate.index(), url)
      if (found.length > 0) {
        entry = candidate
        candidates = found
        break
      }
    }
    if (entry === undefined || candidates.length === 0) return base(input, passthroughInit(input, init))

    const keyed = entry.keys !== undefined
    // The body model is needed to disambiguate sibling routes AND to pick a key.
    let model: string | undefined
    if (candidates.length > 1 || keyed) {
      const body = await bodyTextOf(input, init)
      model = body === undefined ? undefined : modelOfJsonBody(body)
    }
    const override = candidates.length === 1 ? candidates[0] : selectOverrideFrom(candidates, model)
    if (override === undefined) return base(input, passthroughInit(input, init))

    // The route's stored request headers (static strings only). A route that
    // claims the request but declares none is a deliberate "send nothing": its
    // patch is simply empty, which is different from "no route matched".
    const patched = seedHeaders(input, init)
    let hasPatch = false
    if (override.hasHeaders) {
      for (const [name, value] of Object.entries(override.headers)) {
        // The index already filters invalid entries. Keep the seam defensive for
        // a live source supplied by another caller or a stale settings snapshot.
        try {
          patched.set(name, value)
          hasPatch = true
        } catch {
          // A malformed stored pair must not prevent the remaining headers or
          // the underlying request from being sent.
        }
      }
    }

    /**
     * Send one attempt, optionally re-signed with `keyValue`. A fresh `Headers`
     * is built per attempt so a rejected attempt's header tweaks never leak into
     * the retry, and a `Request` input is cloned so its body survives every
     * attempt (the first failed send consumed the clone, not the caller's
     * request).
     */
    const attempt = (keyValue: string | undefined): Promise<Response> => {
      const headers = new Headers(patched)
      if (keyValue !== undefined) applyKeyToHeaders(headers, keyValue)
      if (typeof Request !== 'undefined' && input instanceof Request) {
        return base(new Request(input.clone(), { headers }), { ...init, headers })
      }
      return base(input, { ...init, headers })
    }

    // A request the wire seam (headers-pi-ai) already dispatched: it chose the
    // key, the wire and the endpoint, and it owns the failover for them (see
    // WIRE_DISPATCH_HEADER). Strip the marker, send exactly once with the
    // signature already on the headers, and charge nothing — the wire seam
    // benches its own keys from the stream events it sees. The marker is
    // stripped from a COPY either way: a route that declares no headers of its
    // own (the common shape) has `hasPatch === false`, and returning the
    // original input/init here would ship the internal marker upstream.
    if (patched.get(WIRE_DISPATCH_HEADER) === '1') {
      patched.delete(WIRE_DISPATCH_HEADER)
      return attempt(undefined)
    }

    // The ordered keys that may sign this request. Empty when this activation
    // does not route keys, in which case the request is sent exactly once with
    // only the header patch (preserving the original object identity when there
    // is no patch at all).
    //
    // This seam can neither switch a protocol nor choose another URL, so it does
    // NOT rank by wire: that ranking belongs to the request seam, which can act
    // on it, and a second opinion here could only contradict the wire actually
    // chosen there. What it does share is the cooldown memory — a key that was
    // just charged a rejection is deferred here too, because the failure happened
    // on a request that passed through both seams.
    const resolved = keyed ? await entry.keys!({ route: override.route, model }) : []
    const keyCandidates: readonly KeyCandidate[] = restLast(
      resolved,
      // A key may be benched as a whole (auth, quota, a server fault) or for this
      // model alone (a group whose plan does not carry it); either defers it.
      candidate => isRestingFor(keyRest, override.route, candidate.ref, model, Date.now()),
    )

    const method = init?.method ?? (typeof Request !== 'undefined' && input instanceof Request ? input.method : undefined)
    const listingRequest = isModelListingRequest(url, method)
    if (listingRequest && keyed) {
      // The create/edit form may be trying a new key against an address an
      // existing route already uses. Its explicit signature belongs to this
      // listing; replacing it with saved keys would test the wrong credential.
      const supplied = seedHeaders(input, init)
      const authNames = ['authorization', 'x-api-key', 'x-goog-api-key'] as const
      const suppliedKeys = authNames.map(name => {
        const value = supplied.get(name)
        return name === 'authorization' ? value?.replace(/^Bearer\s+/i, '').trim() : value?.trim()
      }).filter((value): value is string => value !== undefined && value.length > 0)
      if (suppliedKeys.some(value => !keyCandidates.some(candidate => candidate.value === value))) {
        for (const name of authNames) {
          const value = supplied.get(name)
          if (value === null) patched.delete(name)
          else patched.set(name, value)
        }
        return attempt(undefined)
      }
    }

    if (entry.modelListing !== undefined && listingRequest && listingCouldExceedPlainRequest(keyCandidates)) {
      const signal = init?.signal ?? (typeof Request !== 'undefined' && input instanceof Request ? input.signal : undefined)
      try {
        const listing = await entry.modelListing({
          route: override.route,
          url,
          headers: new Headers(patched),
          keys: keyCandidates,
          ...(signal === undefined ? {} : { signal }),
          send: base,
        })
        if (listing !== undefined) return listing
      } catch {
        // Aggregation is an enrichment: the ordinary request path remains the
        // fallback when no aggregate listing can be produced.
      }
    }

    if (!hasPatch && keyCandidates.length === 0) return base(input, passthroughInit(input, init))

    /**
     * Read a failed attempt's body, bounded: enough to tell "out of quota" and
     * "this account does not carry the model" from "too fast". Best effort — a
     * body that cannot be read still leaves the status, which is the part that
     * matters.
     */
    const failureBody = async (response: Response): Promise<string> => {
      try {
        return await readBoundedText(response, 4096)
      } catch {
        return ''
      }
    }

    /**
     * Charge one rejected attempt to the key that placed it: the status, the
     * provider's `Retry-After` and the body decide how long it rests — and WHAT
     * rests. An `unserved` refusal names the model, so it benches the (key,
     * model) pair and leaves the key free for the models its group does carry; a
     * refusal whose model could not be read benches nothing, because the KEY is
     * not what is known to have failed.
     */
    const chargeFailure = (candidate: KeyCandidate, response: Response, kind: FailureKind | undefined): void => {
      if (kind === undefined) return
      if (kind === 'unserved' && model === undefined) return
      const retryAfterMs = parseRetryAfter(response.headers.get('retry-after'), Date.now())
      const restKey = kind === 'unserved'
        ? restKeyOf(override.route, candidate.ref, model)
        : restKeyOf(override.route, candidate.ref)
      keyRest.note(restKey, kind, retryAfterMs === undefined ? undefined : { retryAfterMs })
    }

    /** Whether the caller walked away; a cancelled request is not a key failure. */
    const callerAborted = (): boolean =>
      init?.signal?.aborted === true ||
      (typeof Request !== 'undefined' && input instanceof Request && input.signal.aborted)

    if (keyCandidates.length <= 1) {
      const solo = keyCandidates[0]
      const response = await attempt(solo?.value)
      if (solo !== undefined) {
        if (response.status < 400) {
          clearRest(keyRest, override.route, solo.ref, model)
          return response
        }
        const bodyText = await failureBody(response)
        if (shouldFailover(response.status, bodyText)) {
          chargeFailure(solo, response, classifyFailure(response.status, bodyText))
        } else {
          clearRest(keyRest, override.route, solo.ref, model)
        }
      }
      return response
    }
    // Try keys in preference order; a retryable status on a non-final attempt
    // releases the rejected body and moves to the next key. A 400/404/422 is a
    // request-shape failure every key would repeat, so it is returned as-is —
    // UNLESS its body names the model, which makes it a fact about this key's
    // upstream group instead (see `shouldFailover`): a relay answering "this
    // model is not supported by any configured account in this group" for one
    // account must be asked of the next.
    let lastFailure: unknown
    let unserved = 0
    for (let index = 0; index < keyCandidates.length; index += 1) {
      const candidate = keyCandidates[index]
      let response: Response
      try {
        response = await attempt(candidate.value)
      } catch (error) {
        // A transport failure (connection refused, DNS, a dropped connection) is
        // this attempt's failure too: the next key may still reach the provider.
        if (callerAborted()) throw error
        lastFailure = error
        keyRest.note(restKeyOf(override.route, candidate.ref), 'refused')
        continue
      }
      if (response.status < 400) {
        clearRest(keyRest, override.route, candidate.ref, model)
        return response
      }
      const bodyText = await failureBody(response)
      if (!shouldFailover(response.status, bodyText)) {
        clearRest(keyRest, override.route, candidate.ref, model)
        return response
      }
      const kind = classifyFailure(response.status, bodyText)
      if (kind === 'unserved') unserved += 1
      chargeFailure(candidate, response, kind)
      if (index === keyCandidates.length - 1) {
        // Every key refused the same model: the provider's own error is the
        // truth but not the whole story, so the answer names what the plugin
        // found (see `withUnservedNote`).
        return unserved === keyCandidates.length && model !== undefined
          ? await withUnservedNote(response, bodyText, model, unserved)
          : response
      }
      await response.body?.cancel().catch(() => {
        // Releasing a rejected attempt's body is best-effort cleanup; the retry
        // decides the outcome either way.
      })
    }
    throw lastFailure ?? new Error('no key could place the request')
  }
}

/** A plain JSON object, for reading an error envelope without a shape assumption. */
function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/**
 * The sentence appended to a route-wide model refusal: the provider's own error
 * says which group refused it, this says what that means and what to do.
 * @param model - the model every key refused.
 * @param tried - how many keys were tried.
 */
function unservedNote(model: string, tried: number): string {
  return ` [dsh-model-think-level: all ${tried} keys of this provider refused model "${model}" — `
    + 'none of their upstream groups carries it. Add a key whose group does, or assign the model '
    + 'to a key\'s scope in the provider\'s Keys panel.]'
}

/**
 * Append the unserved note to the first message field of a JSON error body.
 * @returns the rewritten payload, or undefined when the body has no field to
 * append to (a shape this module does not know stays untouched).
 */
function noteInto(payload: unknown, note: string): Record<string, unknown> | undefined {
  if (!isPlainObject(payload)) return undefined
  const message = payload['message']
  if (typeof message === 'string' && message.length > 0) return { ...payload, message: `${message}${note}` }
  const error = payload['error']
  if (isPlainObject(error) && typeof error['message'] === 'string' && error['message'].length > 0) {
    return { ...payload, error: { ...error, message: `${error['message']}${note}` } }
  }
  if (typeof error === 'string' && error.length > 0) return { ...payload, error: `${error}${note}` }
  return undefined
}

/**
 * The final answer when every key of a route refused the same model: the
 * provider's error, plus one sentence naming the real cause.
 *
 * A relay that fans one route out over several upstream accounts answers "this
 * model is not supported by any configured account in this group" per ACCOUNT,
 * so the user reads a 404 that looks like a typo in the model id while the model
 * is simply on a group another key holds. Only a JSON error body with a message
 * field is rewritten; any other shape is returned exactly as the provider sent it.
 * @param response - the last attempt's response.
 * @param bodyText - its body, already read (bounded) by the caller.
 * @param model - the model every key refused.
 * @param tried - how many keys were tried.
 */
async function withUnservedNote(
  response: Response,
  bodyText: string,
  model: string,
  tried: number,
): Promise<Response> {
  const text = bodyText.length > 0 ? bodyText : await response.text().catch(() => '')
  let payload: unknown
  try {
    payload = JSON.parse(text)
  } catch {
    return response
  }
  const patched = noteInto(payload, unservedNote(model, tried))
  if (patched === undefined) return response
  const headers = new Headers(response.headers)
  // The body is re-encoded: its old length and encoding no longer describe it.
  headers.delete('content-length')
  headers.delete('content-encoding')
  headers.set('content-type', 'application/json')
  return new Response(JSON.stringify(patched), {
    status: response.status,
    statusText: response.statusText,
    headers,
  })
}

/** Handle one activation keeps; `dispose` is idempotent. */
export interface HeaderOverlayHandle {
  /** Remove this activation's entry, restoring the original fetch when it was the last. */
  dispose(): void
}

/** Handle for tests and the caller to swap the index a live activation reads. */
export interface HeaderOverlay extends HeaderOverlayHandle {
  /** Whether this activation's entry is still installed. */
  readonly active: boolean
}

/** A mutable index source an activation reads on every request. */
export interface OverlaySource {
  /** The live header index this activation contributes. */
  current: HeaderIndex
  /**
   * Optional live key resolver. When present, requests to a matched route are
   * signed with the returned keys in order and failed over across them. Read as
   * a live property so an activation can begin routing keys after install.
   */
  keys?: (context: KeyRouteContext) => Promise<readonly KeyCandidate[]>
  /** Combines a GET model listing across the resolved key candidates. */
  modelListing?: (context: ModelListingContext) => Promise<Response | undefined>
}

/**
 * Install (or join) the process-wide header wrapper.
 * @param source - the live index (and optional key resolver) this activation contributes.
 * @returns a handle whose `dispose` removes exactly this activation.
 */
export function installHeaderOverlay(source: OverlaySource): HeaderOverlay {
  const holder = globalThis as unknown as Record<symbol, Registry | undefined>
  let registry = holder[REGISTRY]
  const token = Symbol('bre-header-overlay')
  if (registry === undefined) {
    const base = globalThis.fetch
    const entries = new Map<symbol, Entry>()
    const wrapper = makeWrapper(base, entries)
    registry = { base, wrapper, entries }
    holder[REGISTRY] = registry
    globalThis.fetch = wrapper
  }
  registry.entries.set(token, {
    index: () => source.current,
    // Delegate through the live source property so a resolver attached after
    // install is honoured, and its internal data stays current.
    keys: source.keys === undefined ? undefined : context => source.keys!(context),
    modelListing: source.modelListing === undefined ? undefined : context => source.modelListing!(context),
  })
  const owned = registry
  return {
    get active(): boolean {
      return owned.entries.has(token)
    },
    dispose(): void {
      owned.entries.delete(token)
      if (owned.entries.size > 0) return
      // Last one out restores the ORIGINAL function, and only when this
      // wrapper still holds the global: a later installer's wrapper must not be
      // clobbered by our teardown.
      if (globalThis.fetch === owned.wrapper) globalThis.fetch = owned.base
      if (holder[REGISTRY] === owned) delete holder[REGISTRY]
    },
  }
}

/** Whether this plugin's wrapper currently owns the global fetch (diagnostics). */
export function headerOverlayInstalled(): boolean {
  const registry = registryOf()
  return registry !== undefined && globalThis.fetch === registry.wrapper
}

/**
 * The fetch beneath this plugin's wrapper.
 *
 * Used by callers that compose their OWN credential for a request — the model
 * probe and the per-key discovery pass build the auth header from a specific
 * reference, so letting the wrapper re-sign them with the route's FIRST key
 * would probe the wrong credential. Reaching for the function under the wrapper
 * keeps their composed headers exactly as built, while still honouring any
 * wrapper some other plugin installed first. When this plugin's wrapper is not
 * the live global (nothing to bypass), the live fetch is returned unchanged.
 */
export function headerOverlayBypass(): typeof globalThis.fetch {
  const registry = registryOf()
  if (registry !== undefined && globalThis.fetch === registry.wrapper) return registry.base
  return globalThis.fetch
}

/** The empty index, re-exported so callers building one need a single import. */
export { emptyIndex }
