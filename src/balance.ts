/**
 * Reading a provider's balance out of its balance endpoint's answer.
 *
 * Balance APIs are not standardised: a DeepSeek-compatible gateway answers
 * `balance_infos[].total_balance`, an OpenAI-compatible one usually carries
 * `total_available`, a Moonshot-style one nests `available_balance` under
 * `data`, and some return a bare number. The host therefore does not try to
 * understand a vendor: it walks the decoded JSON and picks the first value
 * whose FIELD reads like a balance, preferring the loudest spelling (`balance`)
 * over weaker synonyms (`remaining`, `credit`, `amount`) and shallower values
 * over deeper ones. A response with no recognisable field yields no reading, so
 * the page shows nothing rather than a made-up zero.
 *
 * This module is deliberately free of `node:` imports: the browser half uses
 * {@link formatBalance} to render the chip, and the host half uses
 * {@link parseBalancePayload} on the raw response. Pure functions only, so both
 * sides share one definition of "a balance".
 *
 * @module dsh-model-think-level/balance
 */

/** A balance read from a provider endpoint. */
export interface BalanceReading {
  /** The amount itself, in the endpoint's own currency/unit. */
  readonly amount: number
  /** ISO code or symbol the endpoint named, when it named one. */
  readonly currency?: string
}

/**
 * Field names that mean "balance", strongest first. Keys are compared after
 * {@link normalizeKey}, so `total_balance`, `totalBalance` and `TOTAL-BALANCE`
 * all read as `totalbalance`.
 */
const BALANCE_KEYS: readonly string[] = [
  'balance',
  'totalbalance',
  'availablebalance',
  'remainingbalance',
  'creditbalance',
  'balanceusd',
  'totalavailable',
  'available',
  'remaining',
  'credits',
  'credit',
  'amount',
  'left',
  'remain',
  'remainingquota',
  'quotaremaining',
  'remainquota',
  'availablequota',
  'points',
]

/** The rank of each accepted field name. Lower wins. */
const BALANCE_RANK = new Map(BALANCE_KEYS.map((key, index) => [key, index]))

/**
 * Rank of the `total_credits - total_usage` fallback used by OpenRouter-style
 * credit APIs. It loses to every explicit balance field, wins over nothing.
 */
const CREDIT_PAIR_RANK = (BALANCE_RANK.get('totalavailable') ?? 0) + 0.5

/** The two halves OpenRouter-style credit endpoints split a balance into. */
const TOTAL_CREDIT_KEYS: readonly string[] = ['totalcredits', 'totalgranted']
const USED_CREDIT_KEYS: readonly string[] = ['totalusage', 'totalused']

/** Fields beside the amount that name its currency or unit. */
const CURRENCY_KEYS: readonly string[] = [
  'currency',
  'currencycode',
  'currencyname',
  'unit',
  'unitname',
  'symbol',
]

/** How deep and how wide a response is walked before it is given up on. */
const MAX_DEPTH = 8
const MAX_NODES = 2_000

/** The largest response text worth decoding for a balance. */
const MAX_TEXT_LENGTH = 256_000

/** A candidate value found by the walk. */
interface Candidate {
  readonly reading: BalanceReading
  readonly rank: number
  readonly depth: number
  readonly order: number
}

/** Fold a field name to its comparison form. */
function normalizeKey(key: string): string {
  return key.toLowerCase().replace(/[\s_-]+/g, '')
}

/**
 * Read a numeric amount out of a JSON value or a numeric string.
 *
 * Numbers must be finite; strings may carry thousands separators, a leading
 * currency symbol or a trailing currency code, but nothing else (an HTML page
 * or a date must not read as money). Anything longer than a short label is
 * refused rather than searched for a number.
 * @param value - a number or string from the response.
 * @returns the amount, or undefined when the value is not one.
 */
function amountOf(value: unknown): number | undefined {
  if (typeof value === 'number') return Number.isFinite(value) ? value : undefined
  if (typeof value !== 'string') return undefined
  const text = value.trim().replace(/,/g, '')
  if (text.length === 0 || text.length > 32) return undefined
  const match = /^[\s$¥€£₩]*(-?\d+(?:\.\d+)?)[\sA-Za-z$¥€£₩]*$/.exec(text)
  if (match === null) return undefined
  const amount = Number(match[1])
  return Number.isFinite(amount) ? amount : undefined
}

/** The currency/unit a record names beside its amount, if any. */
function currencyOf(record: Record<string, unknown>): string | undefined {
  for (const key of CURRENCY_KEYS) {
    const normalized = normalizeKey(key)
    for (const [field, value] of Object.entries(record)) {
      if (normalizeKey(field) !== normalized || typeof value !== 'string') continue
      const currency = value.trim()
      if (currency.length === 0 || currency.length > 16) continue
      // A three-letter ISO code is upper-cased so `usd` and `USD` render alike;
      // a symbol is kept verbatim.
      return /^[A-Za-z]{3}$/.test(currency) ? currency.toUpperCase() : currency
    }
  }
  return undefined
}

/** One named numeric field of a record, or undefined when it holds none. */
function numericField(record: Record<string, unknown>, names: readonly string[]): number | undefined {
  for (const [field, value] of Object.entries(record)) {
    if (!names.includes(normalizeKey(field))) continue
    const amount = amountOf(value)
    if (amount !== undefined) return amount
  }
  return undefined
}

/**
 * `total_credits - total_usage`, the shape OpenRouter-style credit APIs use
 * instead of a single remaining-balance field. Only answered when BOTH halves
 * are present, so half a pair never becomes money.
 */
function creditPairOf(record: Record<string, unknown>): number | undefined {
  const total = numericField(record, TOTAL_CREDIT_KEYS)
  const used = numericField(record, USED_CREDIT_KEYS)
  if (total === undefined || used === undefined) return undefined
  return total - used
}

/** Walk one decoded value, collecting every balance-shaped field. */
function collect(
  value: unknown,
  depth: number,
  out: Candidate[],
  budget: { nodes: number },
  order: { next: number },
): void {
  if (depth > MAX_DEPTH || budget.nodes <= 0) return
  budget.nodes -= 1
  if (Array.isArray(value)) {
    for (const item of value) collect(item, depth + 1, out, budget, order)
    return
  }
  if (typeof value !== 'object' || value === null) return
  const record = value as Record<string, unknown>
  const currency = currencyOf(record)
  const pair = creditPairOf(record)
  if (pair !== undefined) {
    out.push({
      reading: currency === undefined ? { amount: pair } : { amount: pair, currency },
      rank: CREDIT_PAIR_RANK,
      depth,
      order: order.next++,
    })
  }
  for (const [key, entry] of Object.entries(record)) {
    const rank = BALANCE_RANK.get(normalizeKey(key))
    if (rank !== undefined) {
      const amount = amountOf(entry)
      if (amount !== undefined) {
        out.push({
          reading: currency === undefined ? { amount } : { amount, currency },
          rank,
          depth,
          order: order.next++,
        })
        // The value is the amount itself; there is nothing below it to read.
        continue
      }
    }
    collect(entry, depth + 1, out, budget, order)
  }
}

/**
 * Pick the most balance-shaped value out of a decoded response.
 * @param body - the decoded JSON value.
 * @returns the chosen reading, or undefined when no field was recognised.
 */
function readingOf(body: unknown): BalanceReading | undefined {
  const out: Candidate[] = []
  collect(body, 0, out, { nodes: MAX_NODES }, { next: 0 })
  if (out.length === 0) return undefined
  // The field name outranks its depth: a shallow `total_available` is a
  // balance, while a deep `remaining` may belong to some unrelated sub-object.
  out.sort((a, b) => a.rank - b.rank || a.depth - b.depth || a.order - b.order)
  return out[0]?.reading
}

/**
 * Read one balance endpoint's raw response body.
 *
 * JSON is preferred; a body that is not JSON is accepted only when the whole
 * (trimmed) body is a number, which covers the plain-text balance endpoints.
 * @param text - the raw response body, as text.
 * @returns the reading, or undefined when nothing in it names a balance.
 */
export function parseBalancePayload(text: string): BalanceReading | undefined {
  const trimmed = text.trim()
  if (trimmed.length === 0 || trimmed.length > MAX_TEXT_LENGTH) return undefined
  let body: unknown
  try {
    body = JSON.parse(trimmed) as unknown
  } catch {
    const amount = amountOf(trimmed)
    return amount === undefined ? undefined : { amount }
  }
  if (typeof body === 'number') return Number.isFinite(body) ? { amount: body } : undefined
  if (typeof body === 'string') {
    const amount = amountOf(body)
    return amount === undefined ? undefined : { amount }
  }
  if (typeof body !== 'object' || body === null) return undefined
  return readingOf(body)
}

/** Currency symbols the chip can show in front of the number. */
const CURRENCY_SYMBOLS = new Map<string, string>([
  ['USD', '$'],
  ['US$', '$'],
  ['$', '$'],
  ['CNY', '¥'],
  ['RMB', '¥'],
  ['¥', '¥'],
  ['EUR', '€'],
  ['€', '€'],
  ['GBP', '£'],
  ['£', '£'],
  ['JPY', '¥'],
  ['KRW', '₩'],
  ['HKD', 'HK$'],
  ['TWD', 'NT$'],
])

/** Format an amount with at most two decimals, grouped by thousands. */
function formatAmount(amount: number): string {
  const sign = amount < 0 ? '-' : ''
  const absolute = Math.abs(amount)
  const fixed = Number.isInteger(absolute)
    ? String(absolute)
    : absolute.toFixed(2).replace(/0+$/, '').replace(/\.$/, '')
  const [whole = '0', fraction] = fixed.split('.')
  const grouped = whole.replace(/\B(?=(\d{3})+(?!\d))/g, ',')
  return `${sign}${grouped}${fraction === undefined ? '' : `.${fraction}`}`
}

/**
 * Render a reading for the provider row: `$12.34` when the endpoint named a
 * currency the plugin knows, `12.34 USD` for other codes, and the bare number
 * when it named no currency at all.
 * @param reading - the parsed balance.
 * @returns the display text, never empty.
 */
export function formatBalance(reading: BalanceReading): string {
  const number = formatAmount(reading.amount)
  const currency = reading.currency?.trim() ?? ''
  if (currency.length === 0) return number
  const symbol = CURRENCY_SYMBOLS.get(currency.toUpperCase())
  if (symbol !== undefined) return `${symbol}${number}`
  return `${number} ${currency}`
}
