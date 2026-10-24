/**
 * One provider listing probe: ask an endpoint for the models it advertises.
 *
 * The same discipline governs every place this plugin interrogates an endpoint
 * — the probe route, the key panel's discover op, the per-key discovery pass
 * and the fetch overlay's aggregated catalogue — so the one bounded, signed,
 * redirect-refusing read lives here once: the profile's configured request
 * headers ride along, the credential is signed the way the protocol expects, a
 * listing is never a place to be forwarded, and the reply is bounded before it
 * is parsed.
 *
 * @module dsh-model-think-level/discovery-merge
 */

import { composeProbeHeaders, modelsFromListing, probeListingUrl, readBounded, type ListedModel } from './listing.js'
import type { RouteProtocol } from './key-refs.js'

/** One listing request: where to ask, and which credential to sign it with. */
export interface ListingProbe {
  readonly baseURL: string
  readonly api: RouteProtocol
  readonly apiKey?: string | undefined
  readonly headers?: unknown
  readonly timeoutMs: number
  /** Transport override: the tests' stub, and the plugin's own fetch seam. */
  readonly send?: (url: string, init: RequestInit) => Promise<Response>
}

/**
 * Ask one endpoint for the models it advertises.
 *
 * A probe that cannot be read — network, status, malformed body — answers
 * undefined instead of throwing: a listing probe is always an enrichment,
 * never a precondition of the caller's own work.
 * @param probe - the endpoint, protocol, credential, and transport.
 * @returns the listing's models, or undefined when it could not be read.
 */
export async function probeListing(probe: ListingProbe): Promise<ListedModel[] | undefined> {
  const url = probeListingUrl(probe.baseURL, probe.api)
  const send = probe.send ?? ((input: string, init: RequestInit) => fetch(input, init))
  try {
    const response = await send(url, {
      method: 'GET',
      headers: composeProbeHeaders(probe.headers, probe.apiKey, probe.api),
      redirect: 'error',
      signal: AbortSignal.timeout(probe.timeoutMs),
    })
    if (!response.ok) {
      await response.body?.cancel().catch(() => {
        // The reply is already discarded; cancelling is cleanup only.
      })
      return undefined
    }
    const text = await readBounded(response, url)
    return modelsFromListing(JSON.parse(text) as unknown)
  } catch {
    return undefined
  }
}
