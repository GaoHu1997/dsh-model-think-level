/**
 * Shared facts of per-key model probing.
 *
 * A key is not tied to one protocol: a route can answer on an OpenAI-family
 * address and an Anthropic-family one, and each key may
 * pin a protocol of its own. Asking every key against the route's default wire
 * would therefore ask half of them a question their credential cannot answer —
 * an Anthropic-pinned key returns `401` from an OpenAI gateway. The probe
 * targets a key may be asked of are derived from the same facts routing uses
 * (the pin, the route's api, and the stored endpoints), so a probe is only
 * sent where a request would go; the fetch overlay that assembles a provider's
 * catalogue (`modelListing` in the entry module) derives them inline.
 *
 * The rules mirror routing ({@link module:key-route-core}):
 * - a pin is honoured only when its family has an address; a cross-family pin
 *   with no address for that family is NOT probed, because no request could be
 *   served that way either — the key keeps its previous scope;
 * - a same-family pin (Responses vs Chat Completions) rides the route's own
 *   address: only the wire changes, so the listing is asked there;
 * - a key with no pin is AUTOMATIC (the request speaks the model family's own
 *   wire where the provider addressed it), so it is probed on the route's wire
 *   and additionally on every other family's address the route configured —
 *   that is the only way to learn that the key also reaches the models of
 *   those families.
 *
 * @module dsh-model-think-level/key-probe
 */

import type { EndpointFamily, RouteProtocol } from './key-refs.js'

export type { EndpointFamily }

/** The protocol a probe speaks on a family when it has no more specific pin. */
export const FAMILY_PROTOCOL: Readonly<Record<EndpointFamily, RouteProtocol>> = {
  openai: 'openai-completions',
  anthropic: 'anthropic-messages',
}

/** What one key's probe learned, as the catalogue merge reads it. */
export interface KeyProbeResult {
  readonly ref: string
  /**
   * The key's scope: the union of every address that answered. Undefined when
   * no address answered — the caller must then keep the previous scope rather
   * than recording "serves nothing".
   */
  readonly models: string[] | undefined
}
