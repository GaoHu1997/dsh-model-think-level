/**
 * Reading one provider's raw model listing.
 *
 * The same rules govern every place this plugin interrogates an endpoint: the
 * probe route (the browser half's auto-adapt), the key panel's discover op, and
 * the merged model discovery the provider card performs. The listing URL,
 * the request headers, the response ceiling, and the one parser for both reply
 * shapes therefore live here once, and mirror the harness's own discovery
 * (`@deepseek-ai/dsh-llm-pi-ai`) exactly — a listing this module reads is a
 * listing the official fetch reads, character for character.
 *
 * @module dsh-model-think-level/listing
 */

import { isRecord } from './shared.js'

/** Stable API version required by Anthropic's model-listing endpoint. */
export const ANTHROPIC_VERSION = '2023-06-01'

/** Largest model-list page accepted by Anthropic's public endpoint. */
export const ANTHROPIC_MODEL_LIMIT = 1000

/** Largest model-list page requested of Gemini's native endpoint. */
export const GEMINI_MODEL_LIMIT = 1000

/** Largest listing reply a probe accepts (the official discovery's bound). */
export const MAX_RESPONSE_BYTES = 4 * 1024 * 1024

/** Protocols whose model listing this module can read (the harness discovery set, plus the plugin's pinned Gemini). */
export const LISTABLE_PROTOCOLS: ReadonlySet<string> = new Set([
  'anthropic-messages',
  'openai-completions',
  'openai-responses',
  'google-generative-ai',
])

/**
 * A URL safe to echo in responses: a baseURL may carry userinfo
 * (https://user:pass@host), and failure messages must never repeat it.
 */
export function displayUrl(raw: string): string {
  try {
    const url = new URL(raw)
    url.username = ''
    url.password = ''
    return url.toString()
  } catch {
    return raw
  }
}

/**
 * Probe-listing URL, mirroring the harness's own model discovery:
 * OpenAI-compatible protocols list at `{baseURL}/models`; Anthropic Messages
 * uses its native route at `{root}/v1/models?limit=1000`, where the root is the
 * base without trailing slashes and without one trailing `/v1` segment
 * (gateway documentation publishes both spellings of the same root). Gemini's
 * native protocol lists at `{base}/v1beta/models?pageSize=1000` on the same
 * version-qualified base its requests speak (see {@link geminiRequestBaseUrl}).
 */
export function probeListingUrl(baseURL: string, api: string): string {
  const base = baseURL.replace(/\/+$/, '')
  if (api === 'google-generative-ai') return `${geminiRequestBaseUrl(base)}/models?pageSize=${String(GEMINI_MODEL_LIMIT)}`
  if (api !== 'anthropic-messages') return `${base}/models`
  const root = base.endsWith('/v1') ? base.slice(0, -3) : base
  return `${root}/v1/models?limit=${String(ANTHROPIC_MODEL_LIMIT)}`
}

/**
 * pi-ai's Anthropic SDK appends `/v1/messages` to the model base URL. Accept
 * either gateway spelling (`https://host` or `https://host/v1`) while keeping
 * the request endpoint at exactly `/v1/messages`.
 */
export function anthropicRequestBaseUrl(baseURL: string): string {
  const base = baseURL.replace(/\/+$/, '')
  return base.endsWith('/v1') ? base.slice(0, -3) : base
}

/**
 * The base URL a Gemini-native request needs. pi-ai's Google client takes
 * `model.baseUrl` verbatim with `apiVersion: ''`, so the version segment must
 * already sit in the path; a bare origin is completed with `/v1beta` (the
 * official spelling), while a path the user spelled out is kept as the
 * gateway's own.
 */
export function geminiRequestBaseUrl(baseURL: string): string {
  const base = baseURL.replace(/\/+$/, '')
  try {
    return new URL(base).pathname === '/' ? `${base}/v1beta` : base
  } catch {
    return base
  }
}

/**
 * Compose the raw-models probe request's headers, mirroring the discipline of
 * the harness's own model discovery: the provider
 * profile's configured request headers form the base (deployment-owned
 * credentials like `x-api-key` ride along), `accept` is always JSON, and a
 * resolved credential's Bearer overwrites a profile `authorization` — which
 * survives only when no credential resolves (a route may authenticate through
 * its configured headers alone). Anthropic Messages answers through
 * `x-api-key` plus a fixed `anthropic-version`, and its Bearer arm is never
 * used (a profile `authorization` survives untouched there, exactly as the
 * official discovery leaves it). Entries Fetch would refuse are dropped
 * rather than failing the probe. Harness attribution headers are deliberately
 * not sent — this is a same-origin diagnostic, not a harness request.
 * @param profileHeaders - the profile's raw `headers` dict (simply absent
 *   on older documents).
 * @param apiKey - the resolved credential, when one resolved.
 * @param api - the profile's wire protocol.
 */
export function composeProbeHeaders(
  profileHeaders: unknown,
  apiKey: string | undefined,
  api: string,
): Record<string, string> {
  const headers = new Headers()
  if (isRecord(profileHeaders)) {
    for (const [name, value] of Object.entries(profileHeaders)) {
      if (typeof value !== 'string') continue
      try {
        headers.set(name, value)
      } catch {
        // Unrepresentable as a Fetch header: skip the entry, keep probing.
      }
    }
  }
  headers.set('accept', 'application/json')
  if (api === 'anthropic-messages') {
    headers.set('anthropic-version', ANTHROPIC_VERSION)
    if (apiKey !== undefined) headers.set('x-api-key', apiKey)
  } else if (api === 'google-generative-ai') {
    // The native Google wire authenticates through its own header and no
    // Bearer, exactly as the official client signs; a profile `authorization`
    // survives untouched, the same courtesy the Anthropic arm extends.
    if (apiKey !== undefined) headers.set('x-goog-api-key', apiKey)
  } else if (apiKey !== undefined) {
    headers.set('authorization', `Bearer ${apiKey}`)
  }
  return Object.fromEntries(headers.entries())
}

/**
 * Read a listing reply body, refusing one that outgrows the ceiling (the same
 * bound the official discovery applies). A declared length is checked first
 * so an honest server is turned away without transferring anything; the
 * accumulated total is what actually enforces the bound.
 */
export async function readBounded(response: Response, url: string): Promise<string> {
  const declared = Number(response.headers.get('content-length') ?? Number.NaN)
  if (Number.isFinite(declared) && declared > MAX_RESPONSE_BYTES) {
    await response.body?.cancel()
    throw new Error(`${displayUrl(url)} overshoots the ${MAX_RESPONSE_BYTES}-byte listing ceiling`)
  }
  if (response.body === null) return ''
  const reader = response.body.getReader()
  const chunks: Uint8Array[] = []
  let total = 0
  try {
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      total += value.byteLength
      if (total > MAX_RESPONSE_BYTES) throw new Error(`${displayUrl(url)} overshoots the ${MAX_RESPONSE_BYTES}-byte listing ceiling`)
      chunks.push(value)
    }
  } finally {
    await reader.cancel().catch(() => {
      // Cancel after a drained read, or after this function walked away from
      // an oversized one, is cleanup; the reply is already decided either way.
    })
  }
  const body = new Uint8Array(total)
  let offset = 0
  for (const chunk of chunks) {
    body.set(chunk, offset)
    offset += chunk.byteLength
  }
  return new TextDecoder().decode(body)
}

/**
 * Normalize a supported listing reply into one entry array, mirroring the
 * official parser: the standard `data` array takes precedence; the
 * enriched `models` map uses each property key as the endpoint-facing id
 * (the nested `id` only falls back for an empty key — gateways may put a
 * canonical identity there instead of the alias they accept on requests);
 * Gemini's native `models` ARRAY unwraps each `models/<id>` resource name into
 * the bare id the request path needs, keeps only entries a chat request can
 * address (`generateContent`), and reads the display label from
 * `displayName` (the raw `name` is the resource path, not a label). Only
 * object-valued entries are models, and entries without a usable id are
 * dropped. Returns undefined when the listing names none of these shapes.
 */
export function listingEntries(body: unknown): Record<string, unknown>[] | undefined {
  const listing = isRecord(body) ? body : {}
  const data = listing['data']
  if (Array.isArray(data)) return data.filter(isRecord)
  const models = listing['models']
  if (Array.isArray(models)) {
    const out: Record<string, unknown>[] = []
    for (const raw of models) {
      if (!isRecord(raw)) continue
      const resource = typeof raw['name'] === 'string' ? raw['name'] : ''
      const id = resource.startsWith('models/') ? resource.slice('models/'.length) : resource
      if (id.length === 0) continue
      const methods = raw['supportedGenerationMethods']
      // A methods list names what the model can serve; without one there is
      // nothing to exclude and the entry keeps the benefit of the doubt.
      if (Array.isArray(methods) && !methods.includes('generateContent')) continue
      const display = typeof raw['displayName'] === 'string' ? raw['displayName'] : undefined
      const entry: Record<string, unknown> = { ...raw, id }
      if (display !== undefined && display.trim().length > 0) entry['name'] = display
      else delete entry['name']
      out.push(entry)
    }
    return out
  }
  if (isRecord(models)) {
    return Object.entries(models)
      .filter(([, raw]) => isRecord(raw))
      .map(([key, raw]) => {
        // The map key is the endpoint-facing id, but an EMPTY key falls back
        // to the entry's own id exactly as the official parser's
        // label(key, entry.id) does — gateways may put the canonical identity
        // there instead of the alias they accept on requests.
        const entry = raw as Record<string, unknown>
        const ownId = typeof entry['id'] === 'string' && entry['id'].length > 0 ? entry['id'] : ''
        return { ...entry, id: key.length > 0 ? key : ownId }
      })
      .filter(entry => typeof entry['id'] === 'string' && entry['id'].length > 0)
  }
  return undefined
}

/**
 * One model a listing advertises, in the shape the harness's model discovery
 * reports: the endpoint-facing id, and whatever presentation metadata the
 * endpoint offered. A source without the optional fields yields just the id,
 * which every consumer (`adopt()` on the Models card) treats as complete.
 */
export interface ListedModel {
  id: string
  name?: string
  contextWindow?: number
  maxTokens?: number
  /** Textual inputs a model advertises, when the endpoint names them. */
  inputModalities?: string[]
}

/** The first non-blank string among several candidate fields. */
function label(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined
  const trimmed = value.trim()
  return trimmed.length === 0 ? undefined : trimmed
}

/** A positive capacity figure, or undefined when the value is not one. */
function capacity(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? Math.floor(value) : undefined
}

/** One listing entry's capacity hint, read from every spelling gateways use. */
function capacities(entry: Record<string, unknown>, keys: readonly string[]): number | undefined {
  const limit = isRecord(entry['limit']) ? entry['limit'] : undefined
  const top = isRecord(entry['top_provider']) ? entry['top_provider'] : undefined
  for (const key of keys) {
    const direct = capacity(entry[key])
    if (direct !== undefined) return direct
  }
  const tokenWindow = capacity(limit?.['context'])
  if (tokenWindow !== undefined) return tokenWindow
  return capacity(top?.['max_completion_tokens'])
}

/** Context-window field names, in the official parser's priority order (Gemini's native spelling included). */
const CONTEXT_WINDOW_KEYS = ['contextWindow', 'context_window', 'context_length', 'max_input_tokens', 'inputTokenLimit'] as const

/** Output-limit field names, in the official parser's priority order (Gemini's native spelling included). */
const MAX_TOKENS_KEYS = ['maxOutputTokens', 'max_output_tokens', 'maxTokens', 'max_tokens', 'outputTokenLimit'] as const

/**
 * Read a listing reply into the models it advertises, in endpoint order.
 *
 * This is the mirror of the official `readListing`, extended with the idle
 * metadata the Models page can adopt: a name/display label, a context window,
 * an output ceiling, and input modalities when the endpoint names them. Ids are
 * trimmed and de-duplicated because the merged discovery appends one endpoint's
 * list to another's, and a duplicate row would render twice in the picker.
 * @param body - the decoded JSON reply.
 * @returns the models, or undefined when the reply names neither listing shape.
 */
export function modelsFromListing(body: unknown): ListedModel[] | undefined {
  const entries = listingEntries(body)
  if (entries === undefined) return undefined
  const out: ListedModel[] = []
  const seen = new Set<string>()
  for (const entry of entries) {
    const id = label(entry['id'])
    if (id === undefined || seen.has(id)) continue
    seen.add(id)
    const model: ListedModel = { id }
    const name = label(entry['name']) ?? label(entry['display_name']) ?? label(entry['displayName'])
    if (name !== undefined) model.name = name
    const contextWindow = capacities(entry, CONTEXT_WINDOW_KEYS)
    if (contextWindow !== undefined) model.contextWindow = contextWindow
    const maxTokens = capacities(entry, MAX_TOKENS_KEYS)
    if (maxTokens !== undefined) model.maxTokens = maxTokens
    const input = entry['input']
    if (Array.isArray(input)) {
      const modalities = [...new Set(input.filter((item): item is string => typeof item === 'string' && item.length > 0))]
      if (modalities.length > 0) model.inputModalities = modalities
    }
    out.push(model)
  }
  return out
}
