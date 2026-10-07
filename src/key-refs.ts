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
