/**
 * The credential-reference vocabulary the API-key manager shares between both
 * halves.
 *
 * A provider's key list is a list of NAMES: every value lives in the harness
 * credential store under its own reference, and the profile records exactly one
 * of those names (`providers.<route>.apiKeyEnv`) as the reference the adapter
 * resolves when it calls the provider. This module owns the naming rules the
 * two halves must agree on — the browser half picks the next free name for a
 * new key, the host half re-validates whatever arrives — so one name can never
 * mean two different things on the two sides of the wire.
 *
 * Deliberately free of `node:` imports: the client bundle imports this module
 * too (the same way `constants.ts` is shared), and a single `node:` import
 * would drag the host into the browser build.
 *
 * @module dsh-model-think-level/key-refs
 */

/** One key the manager lists for a provider route. */
export interface KeyEntry {
  /** Credential reference holding the value. */
  readonly ref: string
  /** User-facing label; absent means "show the reference itself". */
  readonly alias?: string
  /**
   * The model ids this key is known to serve, discovered from the provider's
   * model listing. Absent means "unscoped": the key has not been probed yet, so
   * it acts as a catch-all and serves any model no other key claims. An empty
   * array means the key was probed and reached no models at all.
   *
   * Presence, not order, is what matters here: a model reachable through
   * several keys is served by the first key (in list order) that lists it, so
   * list order doubles as the preference order the user asked for.
   */
  readonly models?: readonly string[]
  /**
   * The wire protocol this key must speak, when it is not the route's own.
   * Absent means "any protocol" — the request keeps the route's default
   * protocol (`providers.<route>.api`). A concrete value re-dispatches the
   * request through that protocol's API implementation AND that key's endpoint,
   * so one provider route can hold a Chat-Completions key and an Anthropic key
   * side by side (a true protocol switch, not just an endpoint swap).
   */
  readonly protocol?: RouteProtocol
}

/**
 * The pi-ai API ids the manager can pin a key to. These are the exact ids
 * `providers.<route>.api` carries, so a key pinned to one speaks the same wire
 * format the official card would have produced for that protocol.
 */
export type RouteProtocol = 'openai-completions' | 'anthropic-messages' | 'openai-responses'

/** Every protocol a key can be pinned to, in the order the picker shows them. */
export const ROUTE_PROTOCOLS: readonly RouteProtocol[] = [
  'anthropic-messages',
  'openai-completions',
  'openai-responses',
]

/** Which endpoint family a protocol draws its base URL from. */
export function endpointFamilyOf(protocol: RouteProtocol): 'openai' | 'anthropic' {
  return protocol === 'anthropic-messages' ? 'anthropic' : 'openai'
}

/** Whether a value is one of the protocol ids this manager understands. */
export function isRouteProtocol(value: unknown): value is RouteProtocol {
  return value === 'openai-completions' || value === 'anthropic-messages' || value === 'openai-responses'
}

/**
 * A stored per-key protocol, or undefined when the value means "any protocol".
 *
 * `any`/`''`/unknown values collapse to undefined so a hand-edited index file
 * cannot pin a key to a protocol the runtime has no implementation for; the
 * request then keeps the route's own protocol, which is always valid.
 * @param value - whatever arrived (a picker choice, or a hand-edited index file).
 * @returns the protocol id, or undefined for "any".
 */
export function normalizeKeyProtocol(value: unknown): RouteProtocol | undefined {
  return isRouteProtocol(value) ? value : undefined
}

/**
 * The two base URLs one provider route can hold: an OpenAI-family endpoint and
 * an Anthropic-family endpoint. A key pinned to a protocol uses the matching
 * one; an "any protocol" key keeps the route's own `providers.<route>.baseURL`.
 */
export interface RouteEndpoints {
  /** Base URL for openai-completions / openai-responses keys. */
  readonly openai?: string
  /** Base URL for anthropic-messages keys. */
  readonly anthropic?: string
}

/** Whether a value looks like an http(s) URL worth storing as an endpoint. */
function isEndpointUrl(value: unknown): value is string {
  if (typeof value !== 'string') return false
  const trimmed = value.trim()
  if (trimmed.length === 0) return false
  return /^https?:\/\/\S+$/i.test(trimmed)
}

/**
 * A stored pair of endpoints, or undefined when neither carries a usable URL.
 *
 * Each URL is trimmed and must look like http(s); a blank or unusable side is
 * dropped rather than stored, so "no Anthropic endpoint configured" stays
 * distinguishable from "an empty string was saved here".
 * @param value - whatever arrived (the endpoints editor, or a hand-edited file).
 * @returns the cleaned pair, or undefined when it holds no endpoint.
 */
export function normalizeRouteEndpoints(value: unknown): RouteEndpoints | undefined {
  if (typeof value !== 'object' || value === null) return undefined
  const record = value as Record<string, unknown>
  const out: { openai?: string; anthropic?: string } = {}
  if (isEndpointUrl(record['openai'])) out.openai = (record['openai'] as string).trim()
  if (isEndpointUrl(record['anthropic'])) out.anthropic = (record['anthropic'] as string).trim()
  return out.openai === undefined && out.anthropic === undefined ? undefined : out
}

/**
 * A stored model-scope list, or undefined when the value carries nothing usable.
 *
 * Model ids are opaque tokens (they may contain `/`, `.`, `:` — `deepseek-ai/DeepSeek-V3`),
 * so they are trimmed but not otherwise rewritten; blank and duplicate ids are
 * dropped, and a value that is not an array collapses to undefined (unscoped).
 * @param value - whatever arrived (a probe result, or a hand-edited index file).
 * @returns the deduplicated id list, or undefined.
 */
export function normalizeKeyModels(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) return undefined
  const seen = new Set<string>()
  const out: string[] = []
  for (const item of value) {
    if (typeof item !== 'string') continue
    const id = item.trim()
    if (id.length === 0 || seen.has(id)) continue
    seen.add(id)
    out.push(id)
  }
  return out
}

/** Longest reference the manager will mint or accept. */
export const KEY_REF_MAX_LENGTH = 80

/** Longest alias the manager stores. A label, never a secret. */
export const KEY_ALIAS_MAX_LENGTH = 40

/**
 * The shape of a reference the manager accepts. Looser than the credential
 * store's own POSIX-ish rule on purpose: a route may legitimately start with a
 * digit (`9router` → `9ROUTER_API_KEY`), and the store stays the authority on
 * what it will hold. This is the plugin's sanity bound, not the validation.
 */
export const KEY_REF_PATTERN = /^[A-Za-z0-9_]{1,80}$/

/**
 * The reference the official Models page derives for a provider route: the
 * route upper-cased with every non-alphanumeric run folded to `_`, plus
 * `_API_KEY`. Mirrors the official page exactly so the first key the manager
 * adds for a provider is the very reference that page would have written.
 * @param route - the provider route key (`ofox`, `aliyun-cn`).
 * @returns the derived reference name.
 */
export function deriveKeyRef(route: string): string {
  return `${route.toUpperCase().replace(/[^A-Z0-9]+/g, '_')}_API_KEY`
}

/** Whether a value is a reference name this manager will pass to the store. */
export function isKeyRefName(value: unknown): value is string {
  return typeof value === 'string' && KEY_REF_PATTERN.test(value)
}

/**
 * The first free name in the sequence `<DERIVED>`, `<DERIVED>_2`, `<DERIVED>_3`…
 * @param route - the provider route key.
 * @param taken - every reference already listed for that route.
 * @returns a reference not in `taken`.
 */
export function nextKeyRef(route: string, taken: readonly string[]): string {
  const used = new Set(taken)
  const base = deriveKeyRef(route)
  if (!used.has(base)) return base
  for (let suffix = 2; suffix <= 999; suffix += 1) {
    const candidate = `${base}_${suffix}`
    if (!used.has(candidate)) return candidate
  }
  // A thousand keys on one route is not a real deployment; stay unique anyway.
  return `${base}_${Date.now()}`
}

/**
 * A stored alias, or undefined when the label carries nothing.
 *
 * Control characters are dropped rather than escaped: an alias is rendered as
 * text on the official page, and a stray newline there is a rendering bug, not
 * data worth keeping.
 * @param value - whatever arrived (user input, or a hand-edited index file).
 * @returns the trimmed label, capped at {@link KEY_ALIAS_MAX_LENGTH}.
 */
export function normalizeKeyAlias(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined
  let cleaned = ''
  for (const char of value) {
    const code = char.codePointAt(0) ?? 0
    if (code < 32 || code === 127) continue
    cleaned += char
  }
  cleaned = cleaned.trim()
  if (cleaned.length === 0) return undefined
  return cleaned.slice(0, KEY_ALIAS_MAX_LENGTH)
}

/**
 * Whether a value is a key the official page would itself accept: printable
 * ASCII with no spaces (its own `LEGAL_API_KEY`). The manager applies the same
 * rule so a key it stores can never be one the official card would refuse.
 */
export function isLegalKeyValue(value: unknown): value is string {
  return typeof value === 'string' && /^[\x21-\x7E]+$/.test(value)
}

/** Shortest value that still gets a head and a tail; below it, a flat mask. */
const KEY_MASK_MIN_LENGTH = 12

/**
 * A stored key's display form: a head, an ellipsis and a tail — enough to tell
 * two look-alike keys apart, never the whole secret.
 *
 * The manager shows every row this way, so a list can say which key a row holds
 * without putting anything usable on the page; the eye beside the field stays
 * the one gesture that reveals a value. A value too short to survive trimming
 * gets a fixed-width mask instead: at that length a head and a tail would be
 * most of the key.
 */
export function maskKeyValue(value: string): string {
  if (value.length === 0) return ''
  if (value.length < KEY_MASK_MIN_LENGTH) return '••••••••'
  return `${value.slice(0, 4)}...${value.slice(-4)}`
}
