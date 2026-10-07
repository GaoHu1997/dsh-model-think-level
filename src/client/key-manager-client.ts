/**
 * The browser half's client for the host's API-key manager.
 *
 * Every key fact — which references a provider lists, which label each carries,
 * which one is in use, and whether the credential store actually holds a value
 * — is host state: the list is the plugin's own index file, the value lives in
 * the credential store, and the "in use" seat is the profile's `apiKeyEnv`
 * field. All six operations therefore ride ONE same-origin route
 * ({@link KEY_INDEX_PATH}), and the browser half only ever handles references,
 * labels, booleans and masked previews. It never sees a secret it did not
 * explicitly ask for: a key value is fetched one reference at a time through the
 * existing reveal route, on a click, and is never cached.
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

/** One key row as the host reports it. */
export interface KeyRow {
  /** Credential reference holding the value. */
  readonly ref: string
  /** Stored label; absent means "show the reference itself". */
  readonly alias?: string
  /** Whether this is the reference the profile currently names. */
  readonly enabled: boolean
  /** Whether the credential store holds a value; null when it could not say. */
  readonly configured: boolean | null
  /**
   * The stored value in the host's display form — a head, an ellipsis and a
   * tail. Absent when the store would not let the value be read, so a row shows
   * nothing rather than a made-up preview.
   */
  readonly masked?: string
}

/** A successful answer: the whole list, in the host's order. */
export interface KeyState {
  readonly ok: true
  readonly route: string
  /** The reference in use, or null when the provider names none. */
  readonly enabledRef: string | null
  readonly entries: readonly KeyRow[]
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
  /** Make one listed reference the key in use. */
  enable(route: string, ref: string): Promise<KeyAnswer>
  /** Relabel one listed reference (undefined clears the label). */
  rename(route: string, ref: string, alias: string | undefined): Promise<KeyAnswer>
  /** Replace the stored secret of one listed reference, keeping its name. */
  replace(route: string, ref: string, value: string): Promise<KeyAnswer>
  /** Forget one listed reference and its value. */
  remove(route: string, ref: string): Promise<KeyAnswer>
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

/** One row, or undefined when the payload is not one. */
function rowOf(value: unknown): KeyRow | undefined {
  if (!isRecord(value)) return undefined
  const ref = value['ref']
  if (typeof ref !== 'string' || ref.length === 0) return undefined
  const alias = value['alias']
  const configured = value['configured']
  const masked = value['masked']
  return {
    ref,
    ...(typeof alias === 'string' && alias.length > 0 ? { alias } : {}),
    enabled: value['enabled'] === true,
    configured: typeof configured === 'boolean' ? configured : null,
    ...(typeof masked === 'string' && masked.length > 0 ? { masked } : {}),
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
  const enabledRef = body['enabledRef']
  const route = body['route']
  return {
    ok: true,
    route: typeof route === 'string' ? route : '',
    enabledRef: typeof enabledRef === 'string' && enabledRef.length > 0 ? enabledRef : null,
    entries: rows,
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
  enable: (route, ref) => request(route, { op: 'enable', ref }),
  rename: (route, ref, alias) => request(route, { op: 'rename', ref, ...(alias === undefined ? {} : { alias }) }),
  remove: (route, ref) => request(route, { op: 'remove', ref }),
  replace: (route, ref, value) => request(route, { op: 'value', ref, value }),
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
