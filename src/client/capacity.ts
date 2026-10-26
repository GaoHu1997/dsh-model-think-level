/**
 * Capacity fields: the two token counts the official model row calls
 * "context window" and "max output".
 *
 * The official inputs accept plain digits, but users write `1M` and `128K` —
 * the catalogue itself shows those spellings — so one parser owns both the
 * user's shorthand and the grouped digit string the form holds. The display
 * side always groups the plain number: the value that reaches the official
 * form is `1048576`, not `1M`, because that form's own parser only knows
 * digits and its Save is what persists.
 *
 * @module dsh-model-think-level/client/capacity
 */

/** Thousands-grouped token counts, matching the official capacity inputs. */
const COUNT = new Intl.NumberFormat('en-US')

/** `1M`, `128K`, `1,048,576`, `1048576` — one optional unit suffix. */
const CAPACITY_PATTERN = /^(\d+(?:\.\d+)?)([km])?$/i

/**
 * Parse a capacity field into a token count.
 *
 * Accepts thousands separators and a `K`/`M` suffix (case-insensitive), with
 * or without spaces, e.g. `1M`, `128 K`, `1,048,576`. A blank or malformed
 * value is `undefined`: the caller writes an empty official field, which is
 * how a capacity goes back to inheriting the catalogue value.
 * @param text - the field's text as typed.
 * @returns the token count, or undefined when the text is blank/invalid.
 */
export function parseCapacity(text: string): number | undefined {
  const cleaned = text.replace(/[,_\s]/g, '')
  if (cleaned === '') return undefined
  const match = CAPACITY_PATTERN.exec(cleaned)
  if (match === null) return undefined
  const scale = match[2] === undefined ? 1 : match[2].toLowerCase() === 'm' ? 1_000_000 : 1_000
  const value = Math.round(Number(match[1]) * scale)
  return Number.isFinite(value) && value > 0 ? value : undefined
}

/**
 * A capacity count as the field shows it when it is not being typed into.
 * @param value - the token count, or undefined for a blank field.
 * @returns the grouped digits, or an empty string.
 */
export function capacityText(value: number | undefined): string {
  return value === undefined ? '' : COUNT.format(value)
}
