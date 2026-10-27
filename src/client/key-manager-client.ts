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
   * The wire protocol this key pins. Absent means "follow the provider's own
   * protocol". A pinned protocol makes this key speak a different API shape than
   * the rest of the route (e.g. one Anthropic key on an OpenAI route).
   */
  readonly protocol?: RouteProtocol
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
  readonly gemini: string | null
}

/** A successful answer: the whole list, in the host's order. */
export interface KeyState {
  readonly ok: true
  readonly route: string
  readonly entries: readonly KeyRow[]
  /**
   * The models this route actually offers — the universe a key's scope is
   * chosen from (the models already added to the provider, never its whole
   * catalog). Absent when the route declares none yet.
   */
  readonly models?: readonly string[]
  /**
   * The provider's catalogue merged across its keys: every model any key
   * advertises, in first-advertised order. Absent when no key has been detected
   * yet or the route itself declares no models.
   */
  readonly mergedModels?: readonly string[]
  /**
   * The part of {@link mergedModels} the route's own `models` does not declare
   * yet — what the panel offers to add. Absent when there is nothing to add.
   */
  readonly unmergedModels?: readonly string[]
  /** The provider's two base URLs, keyed by protocol family. */
  readonly endpoints: KeyEndpoints
}

/** A refused answer, carrying the host's own words when it sent any. */
export interface KeyFailure {
  readonly ok: false
  readonly error?: string
}

/** What one call to the key route answers. */
export type KeyAnswer = KeyState | KeyFailure

/** The manager's transport, injectable so the panel can be tested without one. */
export interface KeyManagerClient {
  /** Read the provider's whole key list. */
  list(route: string): Promise<KeyAnswer>
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
  setEndpoints(route: string, openai: string | undefined, anthropic: string | undefined, gemini: string | undefined): Promise<KeyAnswer>
  /**
   * Append the models the keys advertise but the provider does not declare yet
   * to the provider's own model list — one click, never an automatic write.
   * Declared models are untouched.
   */
  applyMerged(route: string): Promise<KeyAnswer>
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
  const protocol = value['protocol']
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
    ...(isRouteProtocol(protocol) ? { protocol } : {}),
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
  const route = body['route']
  const routeModels = modelsOf(body['models'])
  const mergedModels = modelsOf(body['mergedModels'])
  const unmergedModels = modelsOf(body['unmergedModels'])
  const endpoints = body['endpoints']
  const openai = isRecord(endpoints) && typeof endpoints['openai'] === 'string' ? endpoints['openai'] : null
  const anthropic = isRecord(endpoints) && typeof endpoints['anthropic'] === 'string' ? endpoints['anthropic'] : null
  const gemini = isRecord(endpoints) && typeof endpoints['gemini'] === 'string' ? endpoints['gemini'] : null
  return {
    ok: true,
    route: typeof route === 'string' ? route : '',
    entries: rows,
    ...(routeModels === undefined ? {} : { models: routeModels }),
    ...(mergedModels === undefined ? {} : { mergedModels }),
    ...(unmergedModels === undefined || unmergedModels.length === 0 ? {} : { unmergedModels }),
    endpoints: { openai, anthropic, gemini },
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

/** The live client: same-origin fetch against the host's route. */
export const httpKeyManagerClient: KeyManagerClient = {
  list: route => request(route),
  add: (route, value, alias) => request(route, { op: 'add', value, ...(alias === undefined ? {} : { alias }) }),
  rename: (route, ref, alias) => request(route, { op: 'rename', ref, ...(alias === undefined ? {} : { alias }) }),
  remove: (route, ref) => request(route, { op: 'remove', ref }),
  replace: (route, ref, value) => request(route, { op: 'value', ref, value }),
  setScope: (route, ref, models) =>
    request(route, { op: 'scope', ref, ...(models === undefined ? {} : { models }) }),
  setEnabled: (route, ref, enabled) => request(route, { op: 'enable', ref, enabled }),
  setProtocol: (route, ref, protocol) =>
    request(route, { op: 'protocol', ref, ...(protocol === undefined ? {} : { protocol }) }),
  setEndpoints: (route, openai, anthropic, gemini) =>
    request(route, { op: 'endpoints', openai: openai ?? '', anthropic: anthropic ?? '', gemini: gemini ?? '' }),
  applyMerged: route => request(route, { op: 'applyMerged' }),
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
