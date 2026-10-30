/**
 * The browser half's client for the host's API-key manager.
 *
 * Every key fact — which references a provider lists, which label each carries,
 * which models each may serve, and whether the credential store actually holds a
 * value — is host state: the list is the plugin's own index file, the values live
 * in the credential store, and each key's model scope is the `models` field on
 * its index entry. All operations therefore ride ONE same-origin route
 * ({@link KEY_INDEX_PATH}), and the browser half only ever handles references,
 * labels, model ids, booleans and masked previews. It never sees a secret it did
 * not explicitly ask for: a key value is fetched one reference at a time through
 * the existing reveal route, on a click, and is never cached.
 *
 * Keys are listed in preference order, and every key that is switched ON is
 * active: a model reachable through several keys goes to the first one that
 * can serve it, a model only one key lists sticks to that key, and a failed
 * request fails over to the next capable key. The per-key check on each row
 * ({@link KeyRow.enabled}) switches a key into or out of that pool — off is a
 * pause, not a deletion: the label, scope and protocol pin all stay.
 * A key's model scope is chosen from the models the route already offers
 * (never the provider's whole catalog), so no auto-discovery step is needed.
 *
 * Fails closed. A refused fence, a route that is not in the settings document,
 * a store that cannot be written, a network error — each answers `{ ok: false }`
 * (with the host's own wording when it sent one) and the panel says so; nothing
 * here invents success, and nothing here invents an error message either.
 *
 * @module dsh-model-think-level/client/key-manager-client
 */

import { KEY_INDEX_PATH, PROVIDER_KEY_PATH } from '../constants.js'
import { isRecord } from '../shared.js'
import { isRouteProtocol, type RouteProtocol } from '../key-refs.js'

/** One key row as the host reports it. */
export interface KeyRow {
  /** Credential reference holding the value. */
  readonly ref: string
  /** Stored label; absent means "show the reference itself". */
  readonly alias?: string
  /**
   * Whether this key is switched into the routing pool (its row's circular
   * check is lit). A switched-off key keeps its label, scope and protocol pin
   * but signs nothing; being on is the default, so an answer without the
   * field reads as on.
   */
  readonly enabled: boolean
  /** Whether the credential store holds a value; null when it could not say. */
  readonly configured: boolean | null
  /**
   * The stored value in the host's display form — a head, an ellipsis and a
   * tail. Absent when the store would not let the value be read, so a row shows
   * nothing rather than a made-up preview.
   */
  readonly masked?: string
  /**
   * The model ids this key serves, picked from the route's own added models.
   * Absent means "unscoped": a catch-all that serves whatever is left.
   */
  readonly models?: readonly string[]
  /**
   * The model ids this key's OWN listing advertised the last time it answered —
   * observed by the host, not assigned by the user. A relay may resolve each key
   * to a different upstream account with its own catalogue, so one key's list can
   * be smaller than the route's; the panel offers this list as a one-click scope
   * so "this key only carries half the models" can be made explicit instead of
   * being discovered as a 404 at request time. Absent means never listed (or the
   * list named none of the route's models), which is unknown, not empty.
   */
  readonly observed?: readonly string[]
  /**
   * The wire protocol this key pins. Absent means "follow the provider's own
   * protocol". A pinned protocol makes this key speak a different API shape than
   * the rest of the route (e.g. one Anthropic key on an OpenAI route).
   */
  readonly protocol?: RouteProtocol
  /**
   * Whether the key's model scope is the probe's assignment rather than a
   * manual one — the panel shows it so a scope edit knows the checked chips
   * will keep being rewritten on every probe run until the user saves one by
   * hand.
   */
  readonly auto?: boolean
  /**
   * The key's cooldown, when it is resting after a failure: how long until it
   * is a normal candidate again, and how many consecutive failures produced
   * the period. Absent means the key is a normal candidate right now — the
   * state the routing pool sees as healthy. (No row paints it any more; the
   * field carries what the pool sees.)
   */
  readonly rest?: {
    /** Milliseconds until the key is a normal candidate again (>= 0). */
    readonly remainingMs: number
    /** Consecutive failures that produced this period. */
    readonly failures: number
  }
}

/** A protocol family's base URL as the host stores it (empty means unset). */
export interface KeyEndpoints {
  readonly openai: string | null
  readonly anthropic: string | null
}

/** A successful answer: the whole list, in the host's order. */
export interface KeyState {
  readonly ok: true
  readonly route: string
  readonly entries: readonly KeyRow[]
  /** The exact reference added or reused by an add operation. */
  readonly addedRef?: string
  /**
   * The models this route actually offers — the universe a key's scope is
   * chosen from (the models already added to the provider, never its whole
   * catalog). Absent when the route declares none yet.
   */
  readonly models?: readonly string[]
  /** The provider's two base URLs, keyed by protocol family. */
  readonly endpoints: KeyEndpoints
  /**
   * Whether the host is probing this route's keys right now (the panel button's
   * scope check). The panel follows it with a quiet poll until it clears, so
   * the assignments the probe writes land on screen without a reopen.
   */
  readonly probing?: boolean
}

/** A refused answer, carrying the host's own words when it sent any. */
export interface KeyFailure {
  readonly ok: false
  readonly error?: string
}

/** What one call to the key route answers. */
export type KeyAnswer = KeyState | KeyFailure

/** A route's two base URLs, as the index file stores them (null when unset). */
export interface RouteEndpointsAnswer {
  readonly ok: boolean
  readonly endpoints?: { readonly openai: string | null; readonly anthropic: string | null }
}

/** A route's balance endpoint, as the index file stores it (null when unset). */
export interface RouteBalanceAnswer {
  readonly ok: boolean
  readonly endpoint?: string | null
  /** The host's wording when the read was refused. */
  readonly error?: string
}

/** Read policy for the masked key list; omitted options always revalidate. */
export interface KeyListOptions {
  /** Reuse a successful masked answer for up to five seconds. */
  readonly preferCache?: boolean
}

/** The manager's transport, injectable so the panel can be tested without one. */
export interface KeyManagerClient {
  /** Read the provider's whole key list (fresh unless cache reuse is requested). */
  list(route: string, options?: KeyListOptions): Promise<KeyAnswer>
  /**
   * Read only the route's two addresses.
   *
   * The page's endpoint hydration needs nothing else, and asking for the whole
   * list for it cost a settings read plus one credential resolve per key on
   * every hydration -- once per provider card per second -- which is what put
   * an opened card's own list behind that queue. Optional so a test double (or
   * an older host) can keep answering from `list`.
   */
  endpoints?(route: string): Promise<RouteEndpointsAnswer>
  /**
   * Read the route's configured balance endpoint.
   *
   * The provider card's balance row hydrates from this without touching the
   * settings document or the credential store: it is one key-index read. A
   * successful answer with `null`/no endpoint means "not configured", which is
   * what keeps the provider row's balance chip absent.
   */
  balanceEndpoint?(route: string): Promise<RouteBalanceAnswer>
  /** The last successful masked list, for an immediate re-open paint. */
  cached?(route: string): KeyState | undefined
  /** Store a new key and list it, returning the list it produced. */
  add(route: string, value: string, alias: string | undefined): Promise<KeyAnswer>
  /** Relabel one listed reference (undefined clears the label). */
  rename(route: string, ref: string, alias: string | undefined): Promise<KeyAnswer>
  /** Replace the stored secret of one listed reference, keeping its name. */
  replace(route: string, ref: string, value: string): Promise<KeyAnswer>
  /** Forget one listed reference and its value. */
  remove(route: string, ref: string): Promise<KeyAnswer>
  /** Set one key's model scope (undefined clears it back to the catch-all). */
  setScope(route: string, ref: string, models: readonly string[] | undefined): Promise<KeyAnswer>
  /** Switch one key into or out of the routing pool. */
  setEnabled(route: string, ref: string, enabled: boolean): Promise<KeyAnswer>
  /** Pin one key's wire protocol (undefined clears it back to the route's own). */
  setProtocol(route: string, ref: string, protocol: RouteProtocol | undefined): Promise<KeyAnswer>
  /**
   * Set the protocol families' base URLs (undefined/empty clears that side).
   * The whole set travels together — the host stores it as one replacement —
   * so callers merge with what the store holds first.
   */
  setEndpoints(route: string, openai: string | undefined, anthropic: string | undefined): Promise<KeyAnswer>
  /**
   * Set (or clear, when blank) the route's balance endpoint.
   *
   * Kept apart from {@link setEndpoints}: the balance URL is display-only and
   * must survive an address write from another card, just as the addresses must
   * survive a balance edit.
   */
  setBalanceEndpoint?(route: string, endpoint: string): Promise<KeyAnswer>
  /**
   * Ask the host to probe every key of a multi-key route and check the
   * probe-maintained scopes to what each key actually serves. The answer is
   * the list as it stands when the run was queued — `probing` says the run is
   * on, and the panel follows it to the assignments it writes.
   */
  probe(route: string): Promise<KeyAnswer>
  /** The stored value of one listed reference, or undefined. */
  reveal(route: string, ref: string): Promise<string | undefined>
}

/** The host's wording for a refusal, if it sent one. */
function messageOf(body: Record<string, unknown>): string | undefined {
  for (const field of ['error', 'message'] as const) {
    const value = body[field]
    if (typeof value === 'string' && value.length > 0) return value
  }
  return undefined
}

/** The model ids on one row, or undefined when the host reported none. */
function modelsOf(value: unknown): readonly string[] | undefined {
  if (!Array.isArray(value)) return undefined
  const models: string[] = []
  for (const model of value) {
    if (typeof model === 'string' && model.length > 0) models.push(model)
  }
  return models
}

/** One row, or undefined when the payload is not one. */
function rowOf(value: unknown): KeyRow | undefined {
  if (!isRecord(value)) return undefined
  const ref = value['ref']
  if (typeof ref !== 'string' || ref.length === 0) return undefined
  const alias = value['alias']
  const configured = value['configured']
  const masked = value['masked']
  const models = modelsOf(value['models'])
  const observed = modelsOf(value['observed'])
  const protocol = value['protocol']
  const auto = value['auto']
  const rest = value['rest']
  const remainingMs = isRecord(rest) && typeof rest['remainingMs'] === 'number' ? rest['remainingMs'] : undefined
  const failures = isRecord(rest) && typeof rest['failures'] === 'number' ? rest['failures'] : undefined
  return {
    ref,
    ...(typeof alias === 'string' && alias.length > 0 ? { alias } : {}),
    enabled: value['enabled'] !== false,
    configured: typeof configured === 'boolean' ? configured : null,
    ...(typeof masked === 'string' && masked.length > 0 ? { masked } : {}),
    ...(models === undefined ? {} : { models }),
    ...(observed === undefined || observed.length === 0 ? {} : { observed }),
    ...(isRouteProtocol(protocol) ? { protocol } : {}),
    ...(auto === true ? { auto: true } : {}),
    ...(remainingMs !== undefined && remainingMs >= 0 && failures !== undefined
      ? { rest: { remainingMs, failures } }
      : {}),
  }
}

/** A list answer, or undefined when the payload is not one. */
function stateOf(body: Record<string, unknown>): KeyState | undefined {
  const entries = body['entries']
  if (!Array.isArray(entries)) return undefined
  const rows: KeyRow[] = []
  for (const entry of entries) {
    const row = rowOf(entry)
    if (row !== undefined) rows.push(row)
  }
  const addedRef = body['addedRef']
  const route = body['route']
  const routeModels = modelsOf(body['models'])
  const endpoints = body['endpoints']
  const openai = isRecord(endpoints) && typeof endpoints['openai'] === 'string' ? endpoints['openai'] : null
  const anthropic = isRecord(endpoints) && typeof endpoints['anthropic'] === 'string' ? endpoints['anthropic'] : null
  return {
    ok: true,
    route: typeof route === 'string' ? route : '',
    entries: rows,
    ...(typeof addedRef === 'string' && rows.some(row => row.ref === addedRef) ? { addedRef } : {}),
    ...(routeModels === undefined ? {} : { models: routeModels }),
    ...(body['probing'] === true ? { probing: true } : {}),
    endpoints: { openai, anthropic },
  }
}

/**
 * Read one answer, whatever the status was.
 *
 * The host answers its refusals with a 4xx and a body, so the body is read
 * either way: the status alone would throw away the only copy of the reason.
 */
async function answerOf(response: Response): Promise<KeyAnswer> {
  let body: unknown
  try {
    body = await response.json()
  } catch {
    body = undefined
  }
  if (!isRecord(body)) return { ok: false }
  if (body['ok'] === true) {
    const state = stateOf(body)
    if (state !== undefined) return state
  }
  const error = messageOf(body)
  return error === undefined ? { ok: false } : { ok: false, error }
}

/** One call to the key route: a GET with no payload, a POST with one. */
async function request(route: string, payload?: Record<string, unknown>): Promise<KeyAnswer> {
  const url = `${KEY_INDEX_PATH}?route=${encodeURIComponent(route)}`
  try {
    const response = await fetch(
      url,
      payload === undefined
        ? { method: 'GET', cache: 'no-store', credentials: 'same-origin' }
        : {
            method: 'POST',
            cache: 'no-store',
            credentials: 'same-origin',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify(payload),
          },
    )
    return await answerOf(response)
  } catch {
    return { ok: false }
  }
}

interface KeyListCache {
  state?: KeyState
  read?: Promise<KeyAnswer> | undefined
  updatedAt: number
  revision: number
}

/** Only normalised, masked list answers live here; revealed values never do. */
const KEY_LISTS = new Map<string, KeyListCache>()
const KEY_LIST_CACHE_LIMIT = 64
const KEY_LIST_FRESH_MS = 5_000

function listCache(route: string): KeyListCache {
  const known = KEY_LISTS.get(route)
  if (known !== undefined) return known
  if (KEY_LISTS.size >= KEY_LIST_CACHE_LIMIT) {
    const oldest = KEY_LISTS.keys().next().value
    if (oldest !== undefined) KEY_LISTS.delete(oldest)
  }
  const fresh: KeyListCache = { updatedAt: 0, revision: 0 }
  KEY_LISTS.set(route, fresh)
  return fresh
}

/**
 * The last successful list, whatever its age.
 *
 * The panel paints this on mount and revalidates in the background, so a
 * re-opened card never waits on a fresh read to show something. Age is
 * deliberately not consulted: a 60-second gate here is what left an expansion
 * past it staring at the loading line for as long as the fresh read took, when
 * the list it painted a minute ago is still the best available answer.
 */
function cachedList(route: string): KeyState | undefined {
  return KEY_LISTS.get(route)?.state
}

function listKeys(route: string, options?: KeyListOptions): Promise<KeyAnswer> {
  const cached = listCache(route)
  const age = Date.now() - cached.updatedAt
  if (options?.preferCache === true && cached.state !== undefined && age >= 0 && age < KEY_LIST_FRESH_MS) {
    return Promise.resolve(cached.state)
  }
  if (cached.read !== undefined) return cached.read
  const revision = cached.revision
  const reading = request(route).then(answer => {
    // A read started before a write must never replace its successful answer.
    if (cached.revision !== revision) return cached.state ?? answer
    if (answer.ok) {
      cached.state = answer
      cached.updatedAt = Date.now()
    }
    return answer
  }).finally(() => {
    if (cached.read === reading) cached.read = undefined
  })
  cached.read = reading
  return reading
}

async function changeKeys(route: string, payload: Record<string, unknown>): Promise<KeyAnswer> {
  const cached = listCache(route)
  const revision = ++cached.revision
  cached.read = undefined
  const answer = await request(route, payload)
  if (answer.ok && cached.revision === revision) {
    cached.revision += 1
    cached.read = undefined
    cached.state = answer
    cached.updatedAt = Date.now()
  }
  return answer
}

/**
 * Ask the host for one route's two addresses and nothing else.
 *
 * Costs the host a single index-file read: no settings describe, no credential
 * resolve. The endpoint hydration runs this once per visible card per second,
 * so what it leaves out matters more than what it asks for.
 */
async function routeEndpoints(route: string): Promise<RouteEndpointsAnswer> {
  try {
    const response = await fetch(
      `${KEY_INDEX_PATH}?route=${encodeURIComponent(route)}&op=endpoints`,
      { method: 'GET', cache: 'no-store', credentials: 'same-origin' },
    )
    if (!response.ok) return { ok: false }
    const body: unknown = await response.json().catch(() => undefined)
    if (!isRecord(body) || body['ok'] !== true) return { ok: false }
    const endpoints = body['endpoints']
    if (!isRecord(endpoints)) return { ok: true }
    return {
      ok: true,
      endpoints: {
        openai: typeof endpoints['openai'] === 'string' ? endpoints['openai'] : null,
        anthropic: typeof endpoints['anthropic'] === 'string' ? endpoints['anthropic'] : null,
      },
    }
  } catch {
    return { ok: false }
  }
}

/**
 * Ask the host for one route's balance endpoint and nothing else.
 *
 * One index-file read and no credential work, so the provider card can hydrate
 * its balance row on the same throttle as the address rows.
 */
async function routeBalance(route: string): Promise<RouteBalanceAnswer> {
  try {
    const response = await fetch(
      `${KEY_INDEX_PATH}?route=${encodeURIComponent(route)}&op=balance`,
      { method: 'GET', cache: 'no-store', credentials: 'same-origin' },
    )
    const body: unknown = await response.json().catch(() => undefined)
    if (!isRecord(body) || body['ok'] !== true) {
      const error = isRecord(body) ? messageOf(body) : undefined
      return error === undefined ? { ok: false } : { ok: false, error }
    }
    const endpoint = body['endpoint']
    return { ok: true, endpoint: typeof endpoint === 'string' && endpoint.length > 0 ? endpoint : null }
  } catch {
    return { ok: false }
  }
}

/** The live client: same-origin fetch against the host's route. */
export const httpKeyManagerClient: KeyManagerClient = {
  list: listKeys,
  endpoints: routeEndpoints,
  balanceEndpoint: routeBalance,
  cached: cachedList,
  add: (route, value, alias) => changeKeys(route, { op: 'add', value, ...(alias === undefined ? {} : { alias }) }),
  rename: (route, ref, alias) => changeKeys(route, { op: 'rename', ref, ...(alias === undefined ? {} : { alias }) }),
  remove: (route, ref) => changeKeys(route, { op: 'remove', ref }),
  replace: (route, ref, value) => changeKeys(route, { op: 'value', ref, value }),
  setScope: (route, ref, models) =>
    changeKeys(route, { op: 'scope', ref, ...(models === undefined ? {} : { models }) }),
  setEnabled: (route, ref, enabled) => changeKeys(route, { op: 'enable', ref, enabled }),
  setProtocol: (route, ref, protocol) =>
    changeKeys(route, { op: 'protocol', ref, ...(protocol === undefined ? {} : { protocol }) }),
  setEndpoints: (route, openai, anthropic) =>
    changeKeys(route, { op: 'endpoints', openai: openai ?? '', anthropic: anthropic ?? '' }),
  setBalanceEndpoint: (route, endpoint) => changeKeys(route, { op: 'balance', endpoint }),
  probe: route => changeKeys(route, { op: 'probe' }),
  async reveal(route, ref) {
    try {
      const response = await fetch(
        `${PROVIDER_KEY_PATH}?route=${encodeURIComponent(route)}&ref=${encodeURIComponent(ref)}`,
        {
          method: 'GET',
          // A secret must not sit in the HTTP cache.
          cache: 'no-store',
          credentials: 'same-origin',
        },
      )
      if (!response.ok) return undefined
      const body = (await response.json()) as { ok?: unknown; key?: unknown }
      if (!isRecord(body) || body['ok'] !== true) return undefined
      const key = body['key']
      return typeof key === 'string' && key.length > 0 ? key : undefined
    } catch {
      return undefined
    }
  },
}
