/**
 * The browser half's client for one provider's balance.
 *
 * The request itself is host-side ({@link BALANCE_PATH}): the balance URL is a
 * third-party origin that the page could not read through CORS, and the call is
 * signed with a key only the host can resolve. This module only carries the
 * route name and the host's answer.
 *
 * `configured: false` is a SUCCESS: it means the provider has no balance
 * endpoint, which is the normal state for most routes and the reason no chip is
 * painted. A refusal (`ok: false`) is kept separate so a broken endpoint never
 * reads as "never configured" and the next scan can try again.
 *
 * @module dsh-model-think-level/client/balance-client
 */

import { BALANCE_PATH } from '../constants.js'
import { isRecord } from '../shared.js'

/** The host's answer for one route. */
export interface ProviderBalanceAnswer {
  readonly ok: boolean
  /** False when the route has no balance endpoint at all. */
  readonly configured?: boolean
  /** The parsed amount, when the endpoint answered one. */
  readonly amount?: number
  /** ISO code or symbol the endpoint named. */
  readonly currency?: string
  /** The host's wording when the read failed. */
  readonly error?: string
}

/** The transport, injectable so the row can be tested without a host. */
export interface BalanceClient {
  /** Read one route's balance from the host. */
  read(route: string): Promise<ProviderBalanceAnswer>
}

/** Read one route's balance from the host's route. */
async function readBalance(route: string): Promise<ProviderBalanceAnswer> {
  try {
    const response = await fetch(
      `${BALANCE_PATH}?route=${encodeURIComponent(route)}`,
      { method: 'GET', cache: 'no-store', credentials: 'same-origin' },
    )
    // Refusals are 4xx/5xx with a JSON body, so read the body whatever the
    // status was: the status alone would discard the host's reason.
    let body: unknown
    try {
      body = await response.json()
    } catch {
      body = undefined
    }
    if (!isRecord(body)) return { ok: false }
    if (body['ok'] === true) {
      const configured = body['configured'] !== false
      const amount = typeof body['amount'] === 'number' && Number.isFinite(body['amount'])
        ? body['amount']
        : undefined
      const currency = typeof body['currency'] === 'string' && body['currency'].length > 0
        ? body['currency']
        : undefined
      return {
        ok: true,
        configured,
        ...(amount === undefined ? {} : { amount }),
        ...(currency === undefined ? {} : { currency }),
      }
    }
    const error = typeof body['error'] === 'string' && body['error'].length > 0
      ? body['error']
      : undefined
    // The host says whether the route HAD a configured URL even on failure, so
    // the row can tell "your endpoint failed" from "you never set one".
    const configured = typeof body['configured'] === 'boolean' ? body['configured'] : undefined
    return {
      ok: false,
      ...(configured === undefined ? {} : { configured }),
      ...(error === undefined ? {} : { error }),
    }
  } catch {
    return { ok: false }
  }
}

/** The live client: same-origin fetch against the host's balance route. */
export const httpBalanceClient: BalanceClient = { read: readBalance }
