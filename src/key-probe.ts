/**
 * Shared facts and target derivation of per-key model probing.
 *
 * A key is not tied to one protocol: a route can answer on an OpenAI-family
 * address and an Anthropic-family one, and each key may
 * pin a protocol of its own. Asking every key against the route's default wire
 * would therefore ask half of them a question their credential cannot answer —
 * an Anthropic-pinned key returns `401` from an OpenAI gateway. The probe
 * targets a key may be asked of are derived from the same facts routing uses
 * (the pin, the route's api, and the stored endpoints), so a probe is only
 * sent where a request would go — wherever a per-key listing is wanted, from
 * the fetch overlay that assembles a provider's catalogue to the post-save
 * probe that auto-checks each key's scope.
 *
 * The exact rules live on {@link listingTargetsOf}, the one derivation every
 * caller shares.
 *
 * @module dsh-model-think-level/key-probe
 */

import type { EndpointFamily, RouteEndpoints, RouteProtocol } from './key-refs.js'
import { endpointFamilyOf } from './key-refs.js'
import { LISTABLE_PROTOCOLS, probeListingUrl } from './listing.js'

export type { EndpointFamily }

/** The protocol a probe speaks on a family when it has no more specific pin. */
export const FAMILY_PROTOCOL: Readonly<Record<EndpointFamily, RouteProtocol>> = {
  openai: 'openai-completions',
  anthropic: 'anthropic-messages',
}

/** One address a key's listing may be asked on. */
export interface ProbeTarget {
  readonly api: RouteProtocol
  readonly baseURL: string
}

/**
 * What one key's probe learned, as the catalogue merge reads it.
 */
export interface KeyProbeResult {
  readonly ref: string
  /**
   * The key's scope: the union of every address that answered. Undefined when
   * no address answered — the caller must then keep the previous scope rather
   * than recording "serves nothing".
   */
  readonly models: string[] | undefined
}

/** The per-key probe facts a target derivation reads (the routing scope's shape). */
export interface ProbeKeyShape {
  /** The wire this key pins, when it pins one. */
  readonly protocol?: RouteProtocol
  /** The base URL a pinned key signs against (its family's address). */
  readonly endpoint?: string
  /** The family addresses an UNPINNED key may dispatch on. */
  readonly endpoints?: RouteEndpoints
}

/**
 * The addresses one key's listing may be asked on, deduplicated by listing URL.
 *
 * The rules mirror routing (key-route-core):
 * - a pin is honoured only through its own wire; its address is the family's
 *   stored endpoint when the route configured one, the route's own URL
 *   otherwise (a same-family pin rides the route's address — only the wire
 *   changes, and the route's URL serves that family);
 * - an unpinned key is AUTOMATIC (the request speaks the model family's own
 *   wire where the provider addressed it), so it is asked on the route's wire
 *   plus every cross-family address the route configured — the only way to
 *   learn that the key also reaches those families' models;
 * - targets whose listing this plugin cannot read, and addresses that are
 *   empty, are dropped; a gateway that spells one listing under two protocols
 *   is asked once.
 */
export function listingTargetsOf(
  key: ProbeKeyShape,
  routeAPI: RouteProtocol,
  routeBaseURL: string,
): ProbeTarget[] {
  const wanted: ProbeTarget[] = key.protocol !== undefined
    ? [{ api: key.protocol, baseURL: key.endpoint ?? routeBaseURL }]
    : [
      { api: routeAPI, baseURL: routeBaseURL },
      ...Object.entries(key.endpoints ?? {})
        .filter(([family]) => family !== endpointFamilyOf(routeAPI))
        .map(([family, url]) => ({ api: FAMILY_PROTOCOL[family as EndpointFamily], baseURL: url ?? '' })),
    ]
  const asked = new Set<string>()
  const distinct: ProbeTarget[] = []
  for (const target of wanted) {
    if (!LISTABLE_PROTOCOLS.has(target.api) || target.baseURL.length === 0) continue
    const url = probeListingUrl(target.baseURL, target.api)
    if (asked.has(url)) continue
    asked.add(url)
    distinct.push(target)
  }
  return distinct
}
