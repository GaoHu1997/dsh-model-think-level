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
  shouldFailover,
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
 * The wrapper: inject the matched route's request headers, sign with the right
 * key, fail over to the next key on a retryable status, and delegate everything
 * else untouched.
 */
function makeWrapper(base: typeof globalThis.fetch, entries: Map<symbol, Entry>): typeof globalThis.fetch {
  return async function fetchWithProviderHeaders(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
    const url = requestUrlOf(input)
    if (url === undefined) return base(input, init)
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
    if (entry === undefined || candidates.length === 0) return base(input, init)

    const keyed = entry.keys !== undefined
    // The body model is needed to disambiguate sibling routes AND to pick a key.
    let model: string | undefined
    if (candidates.length > 1 || keyed) {
      const body = await bodyTextOf(input, init)
      model = body === undefined ? undefined : modelOfJsonBody(body)
    }
    const override = candidates.length === 1 ? candidates[0] : selectOverrideFrom(candidates, model)
    if (override === undefined) return base(input, init)

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

    // The ordered keys that may sign this request. Empty when this activation
    // does not route keys, in which case the request is sent exactly once with
    // only the header patch (preserving the original object identity when there
    // is no patch at all).
    const keyCandidates: readonly KeyCandidate[] = keyed ? await entry.keys!({ route: override.route, model }) : []

    if (!hasPatch && keyCandidates.length === 0) return base(input, init)

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

    if (keyCandidates.length <= 1) {
      return attempt(keyCandidates[0]?.value)
    }
    // Try keys in preference order; a retryable status on a non-final attempt
    // releases the rejected body and moves to the next key. A 400/404/422 is a
    // request-shape failure every key would repeat, so it is returned as-is.
    let response = await attempt(keyCandidates[0].value)
    for (let index = 1; index < keyCandidates.length; index += 1) {
      if (!shouldFailover(response.status)) return response
      await response.body?.cancel().catch(() => {
        // Releasing a rejected attempt's body is best-effort cleanup; the retry
        // decides the outcome either way.
      })
      response = await attempt(keyCandidates[index].value)
    }
    return response
  }
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
