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
 * A second formatter spells a count the way switchers and catalogues do —
 * `200K`, `1M`, `1B` — for the model menu's capacity tag.
 *
 * @module dsh-model-think-level/client/capacity
 */

/** Thousands-grouped token counts, matching the official capacity inputs. */
const COUNT = new Intl.NumberFormat('en-US')

/** `1M`, `128K`, `2B`, `1,048,576`, `1048576` — one optional unit suffix. */
const CAPACITY_PATTERN = /^(\d+(?:\.\d+)?)([kmbt])?$/i

/** The suffix scales, uppercase keys as typed. */
const SCALES: Record<string, number> = { k: 1_000, m: 1_000_000, b: 1_000_000_000, t: 1_000_000_000_000 }

/**
 * Parse a capacity field into a token count.
 *
 * Accepts thousands separators and a `K`/`M`/`B`/`T` suffix (case-insensitive),
 * with or without spaces, e.g. `1M`, `128 K`, `2B`, `1,048,576`. A blank or
 * malformed value is `undefined`: the caller writes an empty official field,
 * which is how a capacity goes back to inheriting the catalogue value.
 * @param text - the field's text as typed.
 * @returns the token count, or undefined when the text is blank/invalid.
 */
export function parseCapacity(text: string): number | undefined {
  const cleaned = text.replace(/[,_\s]/g, '')
  if (cleaned === '') return undefined
  const match = CAPACITY_PATTERN.exec(cleaned)
  if (match === null) return undefined
  const scale = match[2] === undefined ? 1 : SCALES[match[2].toLowerCase()]
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

/**
 * A capacity count as a switcher tag spells it — `200K`, `1M`, `1B` — the way
 * the model catalogues themselves write these numbers.
 *
 * The unit is picked by the value's decimal scale (catalogue numbers are
 * decimal), then the spelling tries the binary units first — `131072` is
 * `128K`, `1048576` is `1M` — before the decimal ones (`272000` is `272K`).
 * A value neither family divides falls back to one binary decimal (`1536` →
 * `1.5K`). Below a thousand the plain digits show.
 * @param value - the token count, or undefined for "nothing declared".
 * @returns the compact spelling, or an empty string.
 */
export function capacityShort(value: number | undefined): string {
  if (value === undefined || !Number.isFinite(value) || value <= 0) return ''
  const K = 1024
  const M = K * 1024
  const B = M * 1024
  const T = B * 1024
  const trim = (n: number): string => {
    if (Number.isInteger(n)) return String(n)
    // A quotient that rounds onto the whole number (999999 → 1000K) must not
    // grow a trailing ".0": catalogues spell those without one.
    return n.toFixed(1).replace(/\.0$/, '')
  }
  const units = [
    { floor: 1e12, binary: T, decimal: 1e12, suffix: 'T' },
    { floor: 1e9, binary: B, decimal: 1e9, suffix: 'B' },
    { floor: 1e6, binary: M, decimal: 1e6, suffix: 'M' },
    { floor: 1e3, binary: K, decimal: 1e3, suffix: 'K' },
  ]
  for (const unit of units) {
    if (value < unit.floor) continue
    if (value % unit.binary === 0) return `${value / unit.binary}${unit.suffix}`
    if (value % unit.decimal === 0) return `${value / unit.decimal}${unit.suffix}`
    // Neither family divides: spell the one-decimal quotient that lands
    // closest to the real number, so 1,572,864 (1.5 binary M) reads 1.5M
    // while 1,500,000,000 (1.5 decimal B) reads 1.5B.
    const round1 = (x: number): number => Math.round(x * 10) / 10
    const bq = value / unit.binary
    const dq = value / unit.decimal
    const binaryError = Math.abs(value - round1(bq) * unit.binary)
    const decimalError = Math.abs(value - round1(dq) * unit.decimal)
    return binaryError <= decimalError
      ? `${trim(bq)}${unit.suffix}`
      : `${trim(dq)}${unit.suffix}`
  }
  return String(value)
}
