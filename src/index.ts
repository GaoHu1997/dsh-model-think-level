/**
 * Host half of dsh-model-think-level.
 *
 * One job: settings auto-adaptation. Whenever the `llm-pi-ai` section gains a
 * hand-declared model that carries no `reasoningEfforts`, fill one in from the
 * knowledge base + protocol inference (see {@link suggestEfforts}). The fill
 * is a *suggestion* written to the user layer — the user can still edit it on
 * the Models page — and a model that already declares efforts, or an explicit
 * `false`, is never touched. All interactive editing (per-model editors and
 * per-model auto-adapt) lives in the browser half, which reuses the same
 * knowledge base as a pure module.
 *
 * @module dsh-model-think-level
 */

import type { IncomingMessage, ServerResponse } from 'node:http'
import type { Context } from '@deepseek-ai/cordis'
// Type-only: pulls the webServer service merge into this program's Context.
import type {} from '@deepseek-ai/dsh-host-webserver'
// Type-only: the `declare module '@deepseek-ai/cordis'` merge that types
// `ctx.settings` as the profile-form service. `describe()` returns one
// descriptor per active entry: an ARRAY, not the wire `{namespaces}` envelope.
// The kernel ships no `settingsNamespace` value export (it is a private parse
// + a compile-time SettingsNamespaceInput); the brand is a compile-time
// concept, so a typed constant is enough.
import type { SettingsNamespace } from '@deepseek-ai/dsh-settings'
import Schema from '@deepseek-ai/schemastery'
import {
  AUTOFILL_CONFIG_PATH,
  DIAG_PATH,
  HEADERS_CONFIG_PATH,
  KEY_INDEX_PATH,
  PI_AI_NS,
  PLUGIN_ID,
  PROBE_PATH,
  PROVIDER_KEY_PATH,
} from './constants.js'
import { isLegalKeyValue, maskKeyValue, nextKeyRef, normalizeKeyAlias } from './key-refs.js'
import {
  hasKeyEntry,
  keyEntriesOf,
  keyIndexFilePath,
  readKeyIndex,
  updateKeyIndex,
  withKeyAlias,
  withKeyEntry,
  withoutKeyEntry,
} from './key-index.js'
import { suggestEfforts } from './knowledge.js'
import type { ReasoningEfforts } from './knowledge.js'
import { resolveGuardEffort } from './guard.js'
import { isRecord, looksLikeCompatRefusal, routeFactsOf } from './shared.js'
import { buildHeaderIndex, emptyIndex, type UserAgentIndex } from './headers-core.js'
import { headerOverlayInstalled, installHeaderOverlay, type OverlaySource } from './headers-fetch.js'
import { describePiAiHeaderState, installPiAiHeaderTransforms } from './headers-pi-ai.js'
import { detectHeaderConflicts, type HeaderConflictReport } from './headers-conflict.js'
// The knowledge-base patch builder lives in its own module: the browser half
// builds the SAME patch from its own idle-time read, so one suggestion can
// never produce two different documents.
import { buildAutofillPatch, stripNewCompatKeysDeep } from './autofill.js'

/** Re-exported so the package entry keeps naming the patch builder. */
export { buildAutofillPatch }

/** Stable plugin id, matching the cordis.patch.yml row and the bundle id. */
export const name = PLUGIN_ID

/** Hard dependencies: the loader waits for these before calling apply. */
export const inject = ['settings', 'llm']

/** The branded settings namespace this plugin reads and fills. */
const PI_NS = PI_AI_NS as SettingsNamespace

/**
 * Exponential backoff for the boot fill: llm-pi-ai may register its namespace
 * well after this plugin on a slow start, and registration emits no event of
 * its own — the schedule must outlast a realistically slow profile instead of
 * giving up after a few flat seconds.
 */
const BOOT_RETRY_DELAYS_MS = [1_000, 2_000, 4_000, 8_000, 16_000, 30_000] as const

/** Probe fetch budget: a gateway that cannot answer /models in 15s will not answer the composer either. */
const PROBE_TIMEOUT_MS = 15_000

/**
 * Plugin configuration, supplied through the profile's cordis layer
 * (the row's `config:` block). Every tunable two deployments may want
 * to set differently lives here rather than as a code constant.
 */
export interface Config {
  /** Auto-fill undeclared pi-ai models on boot and after settings updates (default true). */
  autofill?: boolean
  /**
   * Whether the auto-fill above also fills the input-modality declaration
   * (default true). Effort auto-fill is governed by {@link autofill} alone.
   */
  modalityAutofill?: boolean
  /** Upstream fetch timeout for the raw /models probe route, in milliseconds (default 15000). */
  probeTimeoutMs?: number
  /**
   * Boot-fill retry backoff schedule in milliseconds; an empty list means
   * "try exactly once" (default [1000, 2000, 4000, 8000, 16000, 30000]).
   */
  bootRetryDelaysMs?: number[]
  /**
   * Rewrite effort-less calls to forced-thinking ladders into the ladder's
   * vendor default (default true). Only the request class that today becomes
   * `thinking: {type: disabled}` on a ladder that cannot switch thinking off
   * is rewritten (issue #2); everything else passes through byte-identical.
   */
  defaultGuard?: boolean
  /**
   * Take over the configured request headers at the fetch layer for every route
   * whose `headers` declare one (default true). The official adapter may merge
   * attribution headers over profile values, so the overlay reapplies the
   * profile dictionary before the request reaches the wire. The historical
   * `uaOverride` name is retained for configuration compatibility.
   */
  uaOverride?: boolean
}

/** Schemastery schema: Cordis validates the row config and fills defaults before apply(). */
export const Config: Schema<Config> = Schema.object({
  autofill: Schema.boolean().default(true),
  modalityAutofill: Schema.boolean().default(true),
  probeTimeoutMs: Schema.natural().min(1).default(PROBE_TIMEOUT_MS),
  bootRetryDelaysMs: Schema.array(Schema.natural().min(1)).default([...BOOT_RETRY_DELAYS_MS]),
  defaultGuard: Schema.boolean().default(true),
  uaOverride: Schema.boolean().default(true),
})

interface CredentialsService {
  resolve(ref: string): Promise<{ value?: string } | undefined>
  /** Per-reference configuration facts — never the values themselves. */
  describe?(refs: string[]): Promise<unknown>
  /** Store one value under one reference. */
  set?(ref: string, value: string): Promise<unknown>
  /** Forget one reference's value. */
  unset?(ref: string): Promise<unknown>
}

/** One row of the key manager's list, as the browser half reads it. */
interface KeyEntryView {
  /** Credential reference holding the value. */
  ref: string
  /** Stored label, when the user gave one. */
  alias?: string
  /** Whether this is the reference the adapter resolves. */
  enabled: boolean
  /** Whether the store holds a value; null when the store cannot say. */
  configured: boolean | null
  /** The value in its display form, when the store let it be read. */
  masked?: string
}

/** One route's profile inside a pi-ai section value, or undefined. */
function providerProfileOf(section: unknown, route: string): Record<string, unknown> | undefined {
  if (!isRecord(section)) return undefined
  const providers = section['providers']
  if (!isRecord(providers)) return undefined
  const profile = providers[route]
  return isRecord(profile) ? profile : undefined
}

/** The reference one profile names as the key in use, when it names one. */
function enabledRefOf(profile: Record<string, unknown> | undefined): string | undefined {
  const ref = profile?.['apiKeyEnv']
  return typeof ref === 'string' && ref.length > 0 ? ref : undefined
}

/** Whether a host-service answer is the refusal envelope (`{ok: false}`). */
function isRefusal(answer: unknown): boolean {
  return isRecord(answer) && answer['ok'] === false
}

/** The message a host-service answer carries when it refuses. */
function refusalMessage(answer: unknown): string | undefined {
  if (!isRecord(answer)) return undefined
  const error = answer['error']
  if (typeof error === 'string') return error
  if (isRecord(error) && typeof error['message'] === 'string') return error['message']
  return typeof answer['message'] === 'string' ? answer['message'] : undefined
}

/**
 * The per-reference info map a `credentials.describe()` answer carries. The
 * host service is documented to answer the map itself while the Remote face
 * wraps it in the `{ok, value}` envelope; both are read here.
 */
function describeRecords(answer: unknown): Record<string, unknown> | undefined {
  const candidate = isRecord(answer) && answer['value'] !== undefined ? answer['value'] : answer
  return isRecord(candidate) ? candidate : undefined
}

/** Store one value under one reference; the refusal text, or undefined. */
async function storeCredential(
  credentials: CredentialsService | undefined,
  ref: string,
  value: string,
): Promise<string | undefined> {
  const set = credentials?.set
  if (credentials === undefined || typeof set !== 'function') {
    return 'this deployment cannot write the credential store'
  }
  try {
    const answer = await set.call(credentials, ref, value)
    if (!isRefusal(answer)) return undefined
    return refusalMessage(answer) ?? `the credential store refused ${ref}`
  } catch (error) {
    return error instanceof Error ? error.message : String(error)
  }
}

/** Forget one reference's value; the refusal text, or undefined. */
async function forgetCredential(credentials: CredentialsService | undefined, ref: string): Promise<string | undefined> {
  const unset = credentials?.unset
  if (credentials === undefined || typeof unset !== 'function') {
    return 'this deployment cannot write the credential store'
  }
  try {
    const answer = await unset.call(credentials, ref)
    if (!isRefusal(answer)) return undefined
    return refusalMessage(answer) ?? `the credential store refused to forget ${ref}`
  } catch (error) {
    return error instanceof Error ? error.message : String(error)
  }
}

/** What the store will say about one reference: configured, and its masked value. */
interface CredentialFacts {
  configured: boolean
  masked?: string
}

/**
 * What the store will say about each reference: whether it holds a value, and —
 * when the value can be read — the display form the list shows beside it.
 *
 * `describe` answers `configured` without handing the secret over, which is all
 * a badge needs; the masked preview needs the value itself, so it comes from
 * `resolve`, the same call the eye already makes. `describe` stays authoritative
 * about `configured` when both answer. A reference neither can speak about is
 * simply absent from the map.
 */
async function credentialFacts(
  credentials: CredentialsService | undefined,
  refs: readonly string[],
): Promise<Record<string, CredentialFacts>> {
  const out: Record<string, CredentialFacts> = {}
  if (credentials === undefined || refs.length === 0) return out
  const describe = credentials.describe
  if (typeof describe === 'function') {
    try {
      const records = describeRecords(await describe.call(credentials, [...refs]))
      for (const ref of refs) {
        const info = records?.[ref]
        if (isRecord(info) && typeof info['configured'] === 'boolean') {
          out[ref] = { configured: info['configured'] }
        }
      }
    } catch {
      // Unanswered references fall through to resolve() below.
    }
  }
  const resolve = credentials.resolve
  for (const ref of refs) {
    try {
      const hit = await resolve.call(credentials, ref)
      const value = hit !== undefined && typeof hit.value === 'string' ? hit.value : undefined
      const configured = out[ref]?.configured ?? (value !== undefined && value.length > 0)
      const masked = value === undefined ? undefined : maskKeyValue(value)
      out[ref] = masked === undefined || masked.length === 0 ? { configured } : { configured, masked }
    } catch {
      // Leave it unknown: a badge is not worth failing the list over.
    }
  }
  return out
}

/**
 * Which references hold a value, as far as the store will say.
 *
 * Kept as the narrow question for callers that only badge the list; the list
 * itself asks `credentialFacts` so one read answers both.
 */
async function credentialConfigured(
  credentials: CredentialsService | undefined,
  refs: readonly string[],
): Promise<Record<string, boolean>> {
  const facts = await credentialFacts(credentials, refs)
  const out: Record<string, boolean> = {}
  for (const ref of refs) {
    const configured = facts[ref]?.configured
    if (configured !== undefined) out[ref] = configured
  }
  return out
}

/** Whether a settings write was refused because the document moved under it. */
function isConflictError(error: unknown): boolean {
  return isRecord(error) && error['code'] === 'SETTINGS_CONFLICT'
}

/** Read a small JSON request body; undefined when there is nothing to read. */
async function readJsonBody(req: IncomingMessage, limit = 8192): Promise<unknown> {
  const decoder = new TextDecoder()
  let text = ''
  try {
    for await (const chunk of req as AsyncIterable<Uint8Array | string>) {
      text += typeof chunk === 'string' ? chunk : decoder.decode(chunk, { stream: true })
      // A provider key is short; anything larger is not a body this route serves.
      if (text.length > limit) return undefined
    }
  } catch {
    return undefined
  }
  if (text.length === 0) return undefined
  try {
    return JSON.parse(text)
  } catch {
    return undefined
  }
}

function isLoopbackHostname(hostname: string): boolean {
  return hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '::1'
}

/** WHATWG-parse a Host/Origin authority (`host` or `host:port`). */
function parseAuthority(authority: string): URL | undefined {
  try {
    // http: is a WHATWG special scheme: parsing yields a hostname or throws,
    // and normalizes casing the raw header keeps. Note the hostname of an
    // IPv6 authority KEEPS its brackets (`[::1]`) — the literal check below
    // deliberately matches on the colon.
    return new URL(`http://${authority}`)
  } catch {
    return undefined
  }
}

/**
 * Whether a parsed hostname is an IP literal (IPv4 dotted quad, or IPv6 whose
 * brackets URL parsing already stripped). A browser fills Host from the URL it
 * believes it is talking to, so a DNS-rebound page ALWAYS carries the
 * attacker's domain here — it can never produce an IP-literal Host short of
 * the user genuinely navigating to that IP.
 */
function isIpLiteralHostname(hostname: string): boolean {
  return /^\d{1,3}(\.\d{1,3}){3}$/.test(hostname) || hostname.includes(':')
}

/**
 * Browser trust fence for the probe route. It mirrors the core /api fence's
 * DEFENSE (packages/client/connection/src/api-request-trust.ts) minus one
 * feature: there is no `trustedHosts` escape hatch yet.
 *
 *   - Cross-site requests are refused outright; a same-origin/same-site
 *     marker never ADMITS anything by itself.
 *   - An attached Origin must name exactly this authority; the literal
 *     `null` (sandboxed iframe, file: page) is refused.
 *   - The Host fence binds every request and is the rebinding defense:
 *     only loopback names and IP literals are answered. A rebound page
 *     names the attacker's DOMAIN in Host even though the socket lands on
 *     this server, so named hosts are always 403.
 *
 * The route proxies only endpoints the user's own settings already name, but
 * it does so with the stored credential attached — so it must not be callable
 * from elsewhere. LAN deployments serving the GUI under a DOMAIN name get 403
 * here by design (IP-literal LAN hosts keep working); see README known
 * limitations until a trustedHosts seam exists.
 */
function isTrustedRequest(req: IncomingMessage): boolean {
  const host = req.headers.host
  if (typeof host !== 'string' || host.length === 0) return false
  const hostUrl = parseAuthority(host)
  if (hostUrl === undefined) return false
  const secFetchSite = req.headers['sec-fetch-site']
  if (secFetchSite === 'cross-site') return false
  const origin = req.headers.origin
  if (typeof origin === 'string') {
    if (origin === 'null') return false
    try {
      if (new URL(origin).host !== hostUrl.host) return false
    } catch {
      return false
    }
  }
  const hostname = hostUrl.hostname.toLowerCase()
  return isLoopbackHostname(hostname) || isIpLiteralHostname(hostname)
}

function sendJson(res: ServerResponse, status: number, body: unknown): void {
  res.statusCode = status
  res.setHeader('content-type', 'application/json; charset=utf-8')
  res.end(JSON.stringify(body))
}

/**
 * A URL safe to echo in responses: a baseURL may carry userinfo
 * (https://user:pass@host), and failure messages must never repeat it.
 */
function displayUrl(raw: string): string {
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
 * OpenAI-compatible protocols list at
 * `{baseURL}/models`; Anthropic Messages uses its native route at
 * `{root}/v1/models?limit=1000`, where the root is the base without trailing
 * slashes and without one trailing `/v1` segment (gateway documentation
 * publishes both spellings of the same root). Only this listing URL
 * normalizes that segment.
 */
function probeListingUrl(baseURL: string, api: string): string {
  const base = baseURL.replace(/\/+$/, '')
  if (api !== 'anthropic-messages') return `${base}/models`
  const root = base.endsWith('/v1') ? base.slice(0, -3) : base
  return `${root}/v1/models?limit=${String(ANTHROPIC_MODEL_LIMIT)}`
}

/** Protocols whose model listing this module can read (the harness discovery set). */
const LISTABLE_PROTOCOLS: ReadonlySet<string> = new Set([
  'anthropic-messages',
  'openai-completions',
  'openai-responses',
])

/** Stable API version required by Anthropic's model-listing endpoint. */
const ANTHROPIC_VERSION = '2023-06-01'

/** Largest model-list page accepted by Anthropic's public endpoint. */
const ANTHROPIC_MODEL_LIMIT = 1000

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
async function readBounded(response: Response, url: string): Promise<string> {
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

/** Largest listing reply the probe accepts (same bound as official discovery). */
const MAX_RESPONSE_BYTES = 4 * 1024 * 1024

/**
 * Normalize a supported listing reply into one entry array, mirroring the
 * official parser: the standard `data` array takes precedence; the
 * enriched `models` map uses each property key as the endpoint-facing id
 * (the nested `id` only falls back for an empty key — gateways may put a
 * canonical identity there instead of the alias they accept on requests);
 * only object-valued map entries are models, and entries without a usable id
 * are dropped. Returns undefined when the listing names neither shape.
 */
function listingEntries(body: unknown): Record<string, unknown>[] | undefined {
  const listing = isRecord(body) ? body : {}
  const data = listing['data']
  if (Array.isArray(data)) return data.filter(isRecord)
  const models = listing['models']
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
 * The llm-service surface the default-guard wraps: only the two dispatch
 * entries, typed structurally so no new dependency is needed.
 */
interface LlmDispatchLike {
  prepareCall(config: Record<string, unknown>, signal?: unknown): Promise<Record<string, unknown>>
  stream(options: Record<string, unknown>): AsyncIterable<unknown>
}

/**
 * Fill one call config with the vendor default when it names no effort and
 * its declared ladder cannot switch thinking off (issue #2).
 *
 * Reads the resolved pi-ai section (never the user layer -- this only reads).
 * Fails open: any unreadable shape returns the config untouched, reproducing
 * today's behavior exactly.
 */
function guardCallConfig(cfg: Record<string, unknown>, section: unknown): Record<string, unknown> {
  try {
    if (typeof cfg['reasoningEffort'] !== 'undefined') return cfg
    const provider = cfg['provider']
    const modelId = cfg['model']
    if (typeof provider !== 'string' || typeof modelId !== 'string') return cfg
    if (!isRecord(section)) return cfg
    const providers = section['providers']
    if (!isRecord(providers)) return cfg
    const profile = providers[provider]
    if (!isRecord(profile)) return cfg
    const rawModels = profile['models']
    if (!Array.isArray(rawModels)) return cfg
    const row = rawModels.find((candidate): candidate is Record<string, unknown> =>
      isRecord(candidate) && candidate['id'] === modelId)
    if (row === undefined || !isRecord(row['reasoningEfforts'])) return cfg
    const profileDefault = typeof profile['reasoning'] === 'string' ? profile['reasoning'] : undefined
    const facts = routeFactsOf({ providers: { [provider]: profile } }, provider)
    const suggestion = suggestEfforts(modelId, facts)
    const level = resolveGuardEffort({
      declared: row['reasoningEfforts'] as ReasoningEfforts,
      vendorDefault: suggestion.defaultEffort,
      profileDefault,
      requested: undefined,
    })
    return level === undefined ? cfg : { ...cfg, reasoningEffort: level }
  } catch {
    return cfg
  }
}

/**
 * Apply the plugin: autofill undeclared models on boot and after every commit
 * that touches the pi-ai namespace.
 * @param ctx - host context.
 */
export function apply(ctx: Context, config: Config = {}): void {
  // Cordis fills schema defaults; direct calls (tests) may omit fields.
  const resolved = {
    autofill: config.autofill !== false,
    modalityAutofill: config.modalityAutofill !== false,
    probeTimeoutMs: config.probeTimeoutMs ?? PROBE_TIMEOUT_MS,
    bootRetryDelaysMs: config.bootRetryDelaysMs ?? [...BOOT_RETRY_DELAYS_MS],
    defaultGuard: config.defaultGuard !== false,
    uaOverride: config.uaOverride !== false,
  }

  // Module-level `inject` already guarantees the settings service; using it
  // directly (instead of a redundant inner ctx.inject) keeps one dependency
  // declaration as the single source of truth.
  const settings = ctx.settings

  // The guard and probe route read the pi-ai section through this cached
  // closure slot. Describing every active form on every model call is both
  // needless work and, on 0.1.7+, can publish revision invalidation; retain the
  // last resolved section until the settings document reports that it moved.
  let piSectionCache: unknown
  let piSectionCached = false
  const piSection = (): unknown => {
    if (piSectionCached) return piSectionCache
    let value: unknown
    try {
      value = settings.describe().find(entry => entry.ns === PI_NS)?.value
    } catch {
      // The guard and probe are advisory: an unavailable settings form must
      // not turn a model call into a plugin failure.
      return undefined
    }
    // A missing namespace is expected during boot and must be retried.
    if (value === undefined) return undefined
    piSectionCache = value
    piSectionCached = true
    return value
  }
  ctx.on('settings/document-updated', (ns) => {
    if (ns === PI_NS) piSectionCached = false
  })

  if (resolved.autofill) {
    /** One autofill pass; resolves false while the pi-ai namespace is unregistered. */
    const autofillOnce = async (): Promise<boolean> => {
      const descriptor = settings.describe().find(entry => entry.ns === PI_NS)
      if (!isRecord(descriptor?.value)) return false
      // Build the patch from the RAW USER layer, never the resolved value:
      // the fill merges into the user document, and building from the
      // resolved view would materialize schema defaults / composition-base
      // models into it wholesale the moment pi-ai grows such layers for its
      // profile. A namespace whose user section holds no providers has
      // nothing this plugin may fill.
      const user = descriptor?.user
      const userProviders = isRecord(user) && isRecord(user['providers']) ? user['providers'] : undefined
      if (userProviders === undefined) return true
      const fullPatch = buildAutofillPatch(userProviders, () => true, { modalities: resolved.modalityAutofill }, descriptor?.revision ?? 0)
      if (fullPatch === undefined) return true
      // Optimistic lock: only write while the namespace has not moved past
      // this read. The fill is a background suggestion -- losing the race to a
      // user edit is fine; a later boot, or the browser half's idle pass,
      // simply fills whatever is still undeclared. Without the lock every fill
      // would bump the revision and invalidate the one the settings page read,
      // surfacing as SettingsConflictError on the next user save.
      try {
        await settings.update(PI_NS, fullPatch, descriptor?.revision)
      } catch (error) {
        const msg = String(error instanceof Error ? error.message : error)
        if (!looksLikeCompatRefusal(msg)) throw error
        const stripped = stripNewCompatKeysDeep(fullPatch)
        if (stripped === undefined) throw error
        await settings.update(PI_NS, stripped, settings.describe().find(entry => entry.ns === PI_NS)?.revision)
      }
      return true
    }

    /** Auto-fill must never break the settings pipeline; log and move on. */
    const logFailure = (error: unknown): void => {
      console.error(`[dsh-model-think-level] autofill failed: ${error instanceof Error ? error.message : String(error)}`)
    }

    // Pending boot-retry timers, cleared with the fiber (a disposed plugin
    // must not fire into a torn-down service graph).
    const timers = new Set<ReturnType<typeof setTimeout>>()
    ctx.effect(() => () => {
      for (const timer of timers) clearTimeout(timer)
      timers.clear()
    }, 'dsh-model-think-level: boot-fill retries')

    // Fill once at boot for models declared before this plugin was installed,
    // backing off exponentially while llm-pi-ai has not registered yet.
    const bootFill = (attempt: number): void => {
      void autofillOnce().then((ready) => {
        if (ready || attempt >= resolved.bootRetryDelaysMs.length) return
        const timer = setTimeout(() => {
          timers.delete(timer)
          bootFill(attempt + 1)
        }, resolved.bootRetryDelaysMs[attempt])
        timers.add(timer)
      }, logFailure)
    }
    bootFill(0)

    // Deliberately NOT re-run on `settings/document-updated`. The boot pass is safe
    // (no settings surface is open yet); a fill the moment a commit lands is
    // not: the official Models card freezes its own revision baseline while it
    // is open, so a background write there makes the user's very next save in
    // that card fail with `settings/conflict` and their edit reads as lost
    // (issue #7). The browser half carries the running complement instead: it
    // builds this SAME patch and writes it on its idle pass, once no card is
    // open. A headless composition has no editing surface to break and no
    // browser half either -- boot covers it.
  }

  // Default-guard (issue #2): wrap the llm dispatch entries so effort-less
  // calls to forced-thinking ladders ride the ladder's vendor default instead
  // of the wire's off-equivalent. Deferred inject: the wrap lands whenever
  // the llm service registers, and ctx.effect restores the originals on
  // dispose (disable/HMR leaves no trace).
  if (resolved.defaultGuard) {
    ctx.inject(['llm'], (llmCtx) => {
      const llm = (llmCtx as unknown as { llm?: unknown }).llm as LlmDispatchLike | undefined
      if (llm === undefined || typeof llm.prepareCall !== 'function' || typeof llm.stream !== 'function') return
      // Unbound originals: restore assigns back the exact references, and
      // dispatch keeps the service as receiver through .call.
      const origPrepare = llm.prepareCall
      const origStream = llm.stream
      llm.prepareCall = (callConfig, signal) => origPrepare.call(llm, guardCallConfig(callConfig, piSection()), signal)
      llm.stream = (options) => origStream.call(llm, guardCallConfig(options, piSection()))
      ctx.effect(() => () => {
        llm.prepareCall = origPrepare
        llm.stream = origStream
      }, 'dsh-model-think-level: default-guard')
    })
  }

  // Request-header takeover (issue #12): the official adapter can merge
  // attribution headers over the profile's own dictionary, so configured
  // values may be lost before the request reaches the wire. The plugin keeps
  // the fetch overlay as a compatibility fallback and also uses pi-ai's
  // request-level transform, which runs after auth/default headers are merged.
  // This mirrors the request-scoped header handling used by PI-Desktop and
  // covers SDK transports that do not call the current global fetch function.
  //
  // The index is keyed by the endpoint's ORIGIN and rebuilt from the live
  // settings section, so a route added, edited, or removed on the Models page
  // reaches the next request with no reload. `uaOverride: false` empties the
  // index instead of skipping the install: both seams stay installed and
  // simply stop matching anything.
  /** Live index the overlay reads; never undefined once apply has run. */
  const overlaySource: OverlaySource = { current: emptyIndex() }
  const headerRetryTimers = new Set<ReturnType<typeof setTimeout>>()
  let headerRetryAttempt = 0
  const stopHeaderRetries = (): void => {
    for (const timer of headerRetryTimers) clearTimeout(timer)
    headerRetryTimers.clear()
    headerRetryAttempt = 0
  }
  const scheduleHeaderRefresh = (refresh: () => void): void => {
    // A settings event may arrive while a retry is already pending. Keep one
    // timer per activation so repeated document notifications cannot accelerate
    // or multiply the boot retry sequence.
    if (headerRetryTimers.size > 0 || headerRetryAttempt >= resolved.bootRetryDelaysMs.length) return
    const delay = resolved.bootRetryDelaysMs[headerRetryAttempt]
    headerRetryAttempt += 1
    const timer = setTimeout(() => {
      headerRetryTimers.delete(timer)
      refresh()
    }, delay)
    headerRetryTimers.add(timer)
  }
  const refreshHeaders = (): void => {
    if (!resolved.uaOverride) {
      overlaySource.current = emptyIndex()
      stopHeaderRetries()
      return
    }
    const section = piSection()
    if (section === undefined) {
      // llm-pi-ai can register its settings namespace after this plugin. The
      // model probe has an independent direct-header path, but chat needs this
      // index ready before the adapter's first stream reaches fetch().
      overlaySource.current = emptyIndex()
      scheduleHeaderRefresh(refreshHeaders)
      return
    }
    stopHeaderRetries()
    const providers = isRecord(section) && isRecord(section['providers'])
      ? (section['providers'] as Record<string, Record<string, unknown>>)
      : {}
    overlaySource.current = buildHeaderIndex(providers)
  }
  refreshHeaders()
  ctx.effect(() => () => stopHeaderRetries(), 'dsh-model-think-level: header retries')
  ctx.on('settings/document-updated', (ns) => {
    if (ns === PI_NS) refreshHeaders()
  })
  const overlay = installHeaderOverlay(overlaySource)
  ctx.effect(() => () => { overlay.dispose() }, 'dsh-model-think-level: fetch header overlay')

  // `?diag=1` on the probe route reports this without touching the wire, so
  // the request-header takeover is observable from the running host.
  let headerBridgeState: () => unknown = () => ({ stage: 'not-installed' })
  const installPiAiBridge = (llm: unknown): void => {
    const transforms = installPiAiHeaderTransforms(llm, overlaySource)
    transforms.refresh()
    headerBridgeState = () => describePiAiHeaderState(llm, overlaySource)
    ctx.on('llm/adapters-updated', () => transforms.refresh())
    ctx.effect(() => () => transforms.dispose(), 'dsh-model-think-level: pi-ai request headers')
  }
  const availableLlm = (ctx as unknown as { llm?: unknown }).llm
  if (availableLlm === undefined) {
    // Direct callers and older hosts may omit llm from the module-level inject;
    // keep the deferred path as a compatibility fallback for those contexts.
    ctx.inject(['llm'], (llmCtx) => {
      const llm = (llmCtx as unknown as { llm?: unknown }).llm
      if (llm !== undefined) installPiAiBridge(llm)
    })
  } else {
    installPiAiBridge(availableLlm)
  }

  // Read once: what sits on disk changes only when the user installs or patches
  // something, and a restart is the honest moment to re-read it.
  const headerConflicts: HeaderConflictReport = detectHeaderConflicts()

  // Same-origin probe route: the browser half's Auto-adapt asks the endpoint's
  // RAW /models listing through here, because the sanctioned llm wire call
  // strips reasoning signals host-side. The credential resolves server-side
  // and never echoes back; only routes the user's own settings name are
  // reachable, and the trust fence rejects cross-site callers.
  ctx.inject(['webServer'], (webServerCtx) => {
    ctx.effect(
      () =>
        webServerCtx.webServer.register({
          kind: 'exact',
          path: PROBE_PATH,
          handler: async (req, res) => {
            if (!isTrustedRequest(req)) {
              sendJson(res, 403, { ok: false, error: 'forbidden' })
              return
            }
            if (req.method !== 'GET') {
              sendJson(res, 405, { ok: false, error: 'method not allowed' })
              return
            }
            const url = new URL(req.url ?? '/', 'http://x')
            // Read-only diagnostics: makes the request-header takeover
            // observable in the running host (which adapter is patched).
            if (url.searchParams.get('diag') === '1') {
              sendJson(res, 200, {
                ok: true,
                bridge: headerBridgeState(),
                overlay: {
                  routes: overlaySource.current.routes.length,
                  overrides: overlaySource.current.overrides.length,
                },
              })
              return
            }
            const route = url.searchParams.get('route') ?? ''
            const section = piSection()
            const profile = isRecord(section) && isRecord(section['providers'])
              ? section['providers'][route]
              : undefined
            if (!isRecord(profile)) {
              sendJson(res, 400, { ok: false, error: `no llm-pi-ai provider route "${route}"` })
              return
            }
            const baseURL = typeof profile['baseURL'] === 'string' ? profile['baseURL'] : ''
            if (baseURL.length === 0) {
              sendJson(res, 400, { ok: false, error: `provider route "${route}" has no baseURL` })
              return
            }
            // The profile's wire protocol selects the listing route and the
            // credential arm, exactly as the official discovery decides them:
            // only the protocols whose listing this mirror can read are
            // interrogated; everything else reports that it cannot.
            const api = typeof profile['api'] === 'string' ? profile['api'] : ''
            if (api.length === 0) {
              sendJson(res, 400, {
                ok: false,
                error: `provider route "${route}" names no API protocol to interrogate`,
              })
              return
            }
            if (!LISTABLE_PROTOCOLS.has(api)) {
              sendJson(res, 400, {
                ok: false,
                error: `protocol "${api}" cannot be interrogated; enter this provider's models by hand`,
              })
              return
            }
            const apiKeyEnv = typeof profile['apiKeyEnv'] === 'string' ? profile['apiKeyEnv'] : undefined
            const listingURL = probeListingUrl(baseURL, api)
            let apiKey: string | undefined
            if (apiKeyEnv !== undefined) {
              try {
                const credentials = ctx.get('credentials') as CredentialsService | undefined
                const hit = credentials === undefined ? undefined : await credentials.resolve(apiKeyEnv)
                apiKey = hit !== undefined && typeof hit.value === 'string' && hit.value.length > 0
                  ? hit.value
                  : undefined
              } catch {
                // Unresolvable credential: probe unauthenticated rather than fail.
              }
            }
            try {
              const upstream = await fetch(listingURL, {
                method: 'GET',
                // Header composition mirrors the harness's own model discovery:
                // the profile's configured request headers ride
                // along, so a deployment that authenticates through a custom
                // header probes here exactly as it lists officially — and an
                // Anthropic endpoint answers through x-api-key + a fixed
                // anthropic-version instead of a Bearer.
                headers: composeProbeHeaders(profile['headers'], apiKey, api),
                // A probe carries the user's stored credential, so it must
                // reach exactly the authority the profile names: Fetch's
                // default would FOLLOW a cross-origin redirect, and the
                // headers composed here (`x-api-key`, a profile's own auth
                // header) are not stripped on that hop the way `authorization`
                // is. Official discovery keeps the default; this route is
                // stricter on purpose, and the cost is bounded — a gateway
                // that lists only behind a redirect yields no endpoint
                // evidence, so Auto-adapt falls back to the knowledge base /
                // protocol inference, the path every unanswerable endpoint
                // takes.
                redirect: 'error',
                signal: AbortSignal.timeout(resolved.probeTimeoutMs),
              })
              if (!upstream.ok) {
                const hint = upstream.status === 401 || upstream.status === 403 ? '; check the API key' : ''
                sendJson(res, 502, { ok: false, error: `${displayUrl(listingURL)} answered ${upstream.status}${hint}` })
                return
              }
              const text = await readBounded(upstream, listingURL)
              let body: unknown
              try {
                body = JSON.parse(text) as unknown
              } catch {
                sendJson(res, 502, { ok: false, error: `${displayUrl(listingURL)} answered with a malformed JSON body` })
                return
              }
              // The official parser accepts the standard `data` array and the
              // enriched `models` map; entries are passed through verbatim so
              // the browser half sees the raw capability signals the sanctioned
              // wire call strips.
              const entries = listingEntries(body)
              if (entries === undefined) {
                sendJson(res, 502, {
                  ok: false,
                  error: `${displayUrl(listingURL)} model listing has neither a "data" array nor a "models" object`,
                })
                return
              }
              sendJson(res, 200, { ok: true, url: displayUrl(listingURL), data: entries })
            } catch (error) {
              sendJson(res, 502, {
                ok: false,
                error: `could not reach ${displayUrl(listingURL)}: ${error instanceof Error ? error.message : String(error)}`,
              })
            }
          },
        }),
      'dsh-model-think-level: raw-models probe route',
    )

    // Read-only diagnostics for the request-header takeover. A path of its own
    // (rather than a flag on the probe route) so a reloaded plugin can answer
    // even while an older instance still owns the probe path.
    ctx.effect(
      () =>
        webServerCtx.webServer.register({
          kind: 'exact',
          path: DIAG_PATH,
          handler: (req, res) => {
            if (!isTrustedRequest(req)) {
              sendJson(res, 403, { ok: false, error: 'forbidden' })
              return
            }
            sendJson(res, 200, {
              ok: true,
              uaOverride: resolved.uaOverride,
              bridge: headerBridgeState(),
              overlay: {
                routes: overlaySource.current.routes.length,
                overrides: overlaySource.current.overrides.length,
              },
            })
          },
        }),
      'dsh-model-think-level: header diagnostics route',
    )

    // Stored-credential route: the API-key field's eye calls it when the user
    // asks to see a key that is already saved. Every other route here keeps the
    // value host-side; this one hands it to the page on purpose, because the
    // official field is write-only by design — the settings document carries
    // only the profile's `apiKeyEnv` reference — so the affordance would
    // otherwise be a mask toggle with nothing behind it. The same trust fence
    // as the probe gates it, the value is never logged, and every answer is
    // `no-store` so neither the key nor the refusals (which name the route's
    // reference) can sit in a cache. The browser half asks only on a click, and
    // only for a card that names a route.
    ctx.effect(
      () =>
        webServerCtx.webServer.register({
          kind: 'exact',
          path: PROVIDER_KEY_PATH,
          handler: async (req, res) => {
            // Nothing this route answers may sit in a cache: not the key, and
            // not the refusals that name the route's credential reference.
            res.setHeader('cache-control', 'no-store')
            if (!isTrustedRequest(req)) {
              sendJson(res, 403, { ok: false, error: 'forbidden' })
              return
            }
            if (req.method !== 'GET') {
              sendJson(res, 405, { ok: false, error: 'method not allowed' })
              return
            }
            const url = new URL(req.url ?? '/', 'http://x')
            const route = url.searchParams.get('route') ?? ''
            const section = piSection()
            const profile = isRecord(section) && isRecord(section['providers'])
              ? section['providers'][route]
              : undefined
            if (!isRecord(profile)) {
              sendJson(res, 400, { ok: false, error: `no llm-pi-ai provider route "${route}"` })
              return
            }
            const apiKeyEnv = typeof profile['apiKeyEnv'] === 'string' ? profile['apiKeyEnv'] : undefined
            // A key-manager row names its own reference; the field's own eye
            // names none and means "the key this provider is using". A named
            // one is served only when the route's index lists it, so this route
            // can never become a resolver for arbitrary reference names.
            const named = url.searchParams.get('ref') ?? ''
            const ref = named.length > 0
              ? (named === apiKeyEnv || hasKeyEntry(readKeyIndex(keyIndexFilePath()), route, named) ? named : undefined)
              : apiKeyEnv
            if (ref === undefined) {
              sendJson(res, 404, {
                ok: false,
                error: named.length > 0
                  ? `provider route "${route}" lists no key "${named}"`
                  : `provider route "${route}" stores no credential reference`,
              })
              return
            }
            let value: string | undefined
            try {
              const credentials = ctx.get('credentials') as CredentialsService | undefined
              const hit = credentials === undefined ? undefined : await credentials.resolve(ref)
              value = hit !== undefined && typeof hit.value === 'string' && hit.value.length > 0
                ? hit.value
                : undefined
            } catch {
              value = undefined
            }
            if (value === undefined) {
              sendJson(res, 404, { ok: false, error: `no credential is configured for ${ref}` })
              return
            }
            sendJson(res, 200, { ok: true, key: value })
          },
        }),
      'dsh-model-think-level: provider-key route',
    )

    // The API-key manager: one provider's list of keys, and which one is in use.
    //
    // Both halves of that list are host-side already — the values belong to the
    // harness credential store, and the reference the adapter actually resolves
    // is a field of the pi-ai profile — so this route owns the reads AND the
    // writes and the browser half only ever handles references, labels and
    // booleans. That is the same surface the official page works with, and it
    // needs no new Remote face to get it.
    ctx.effect(
      () =>
        webServerCtx.webServer.register({
          kind: 'exact',
          path: KEY_INDEX_PATH,
          handler: async (req, res) => {
            res.setHeader('cache-control', 'no-store')
            if (!isTrustedRequest(req)) {
              sendJson(res, 403, { ok: false, error: 'forbidden' })
              return
            }
            if (req.method !== 'GET' && req.method !== 'POST') {
              sendJson(res, 405, { ok: false, error: 'method not allowed' })
              return
            }
            const url = new URL(req.url ?? '/', 'http://x')
            const route = url.searchParams.get('route') ?? ''
            // Read the entry fresh rather than through the cached section: this
            // route writes to it, and an answer built from a pre-write snapshot
            // would show the user the state they just changed away from.
            const entryOf = (): { value: unknown; revision: number } | undefined => {
              try {
                const found = settings.describe().find(candidate => candidate.ns === PI_NS)
                return found === undefined ? undefined : { value: found.value, revision: found.revision }
              } catch {
                return undefined
              }
            }
            if (route.length === 0 || providerProfileOf(entryOf()?.value, route) === undefined) {
              sendJson(res, 400, { ok: false, error: `no llm-pi-ai provider route "${route}"` })
              return
            }
            const credentials = ctx.get('credentials') as CredentialsService | undefined
            const indexFile = keyIndexFilePath()

            /** The reference the profile names right now, read fresh. */
            const enabledNow = (): string | undefined => enabledRefOf(providerProfileOf(entryOf()?.value, route))

            /**
             * Hand the "in use" seat to one reference; undefined clears it. The
             * seat IS the profile's `apiKeyEnv`, so nothing else has to know
             * which key is active — every consumer of the profile, in the GUI or
             * not, resolves exactly the key the user enabled.
             * @param ref - reference to enable, or undefined to name none.
             * @returns The refusal text, or undefined when the write landed.
             */
            const setEnabledKey = async (ref: string | undefined): Promise<string | undefined> => {
              for (let attempt = 0; attempt < 2; attempt += 1) {
                const entry = entryOf()
                if (entry === undefined) return 'the llm-pi-ai settings entry is unavailable'
                try {
                  await settings.mutate(
                    PI_NS,
                    ref === undefined
                      ? [{ op: 'unset', path: ['providers', route, 'apiKeyEnv'] }]
                      : [{ op: 'set', path: ['providers', route, 'apiKeyEnv'], value: ref }],
                    entry.revision,
                  )
                  return undefined
                } catch (error) {
                  // Another writer (the official card's Save, another tab, the
                  // autofill pass) moved the document between this read and
                  // this write: re-read once and fence on the new revision.
                  if (attempt === 0 && isConflictError(error)) continue
                  return error instanceof Error ? error.message : String(error)
                }
              }
              return 'the settings document kept changing; try again'
            }

            /** The whole list, as the browser half renders it. */
            const payload = async (): Promise<unknown> => {
              const enabledRef = enabledNow()
              const listed = keyEntriesOf(readKeyIndex(indexFile), route)
              const refs = listed.map(entry => entry.ref)
              // The key in use is always on the list, even when it was written
              // by the official page or by hand and this plugin has never seen
              // it: the panel must be able to show and act on what is active.
              if (enabledRef !== undefined && !refs.includes(enabledRef)) refs.push(enabledRef)
              const facts = await credentialFacts(credentials, refs)
              const entries: KeyEntryView[] = refs.map(ref => {
                const fact = facts[ref]
                const view: KeyEntryView = {
                  ref,
                  enabled: ref === enabledRef,
                  configured: fact?.configured ?? null,
                }
                if (fact?.masked !== undefined) view.masked = fact.masked
                const stored = listed.find(candidate => candidate.ref === ref)
                if (stored?.alias !== undefined) view.alias = stored.alias
                return view
              })
              return { ok: true, route, enabledRef: enabledRef ?? null, entries }
            }

            if (req.method === 'GET') {
              sendJson(res, 200, await payload())
              return
            }

            const body = await readJsonBody(req)
            const op = isRecord(body) && typeof body['op'] === 'string' ? body['op'] : ''
            const ref = isRecord(body) && typeof body['ref'] === 'string' ? body['ref'] : undefined
            const alias = isRecord(body) ? normalizeKeyAlias(body['alias']) : undefined
            const value = isRecord(body) && typeof body['value'] === 'string' ? body['value'] : undefined
            // Every mutation is a set of steps that must not half-apply, so each
            // branch refuses BEFORE it writes anything it cannot undo.
            const refuse = (error: string): void => sendJson(res, 400, { ok: false, error })

            try {
              if (op === 'add') {
                if (!isLegalKeyValue(value)) {
                  refuse('a key must be printable ASCII without spaces')
                  return
                }
                const taken = keyEntriesOf(readKeyIndex(indexFile), route).map(candidate => candidate.ref)
                // The reference in use need not be listed — the official card
                // and a hand-edited profile both write one this plugin has never
                // seen — and minting it again would overwrite the very key the
                // provider is running on.
                const active = enabledNow()
                if (active !== undefined && !taken.includes(active)) taken.push(active)
                const created = nextKeyRef(route, taken)
                // The value goes into the store first: a reference the index
                // lists but the store cannot hold would render as a key the
                // user can never reveal, enable or remove.
                const refused = await storeCredential(credentials, created, value)
                if (refused !== undefined) {
                  refuse(refused)
                  return
                }
                updateKeyIndex(document => withKeyEntry(document, route, created, alias), indexFile)
                // The first key on a provider that names none is the key in
                // use: adding it is how a route becomes configured at all.
                if (enabledNow() === undefined) {
                  const failed = await setEnabledKey(created)
                  if (failed !== undefined) {
                    refuse(failed)
                    return
                  }
                }
              } else if (op === 'enable') {
                const listed = readKeyIndex(indexFile)
                if (ref === undefined || !hasKeyEntry(listed, route, ref)) {
                  refuse('that key is not listed for this provider')
                  return
                }
                // Moving the seat must not take the key it leaves off the list:
                // that key was a row a moment ago, and unlisted it would fall out
                // of reach — and let a later add mint its name again, over the
                // value still sitting in the store.
                const previous = enabledNow()
                if (previous !== undefined && previous !== ref && !hasKeyEntry(listed, route, previous)) {
                  const leaving: string = previous
                  updateKeyIndex(
                    document =>
                      hasKeyEntry(document, route, leaving)
                        ? document
                        : withKeyEntry(document, route, leaving, undefined),
                    indexFile,
                  )
                }
                const failed = await setEnabledKey(ref)
                if (failed !== undefined) {
                  refuse(failed)
                  return
                }
              } else if (op === 'rename') {
                // The key the provider is RUNNING on takes a label too: that
                // reference is usually the one the official card wrote, which
                // this plugin has never listed. Writing it here is what puts it
                // on the list, so every later write matches an entry.
                const known =
                  ref !== undefined &&
                  (hasKeyEntry(readKeyIndex(indexFile), route, ref) || ref === enabledNow())
                if (ref === undefined || !known) {
                  refuse('that key is not listed for this provider')
                  return
                }
                const target = ref
                updateKeyIndex(
                  document =>
                    hasKeyEntry(document, route, target)
                      ? withKeyAlias(document, route, target, alias)
                      : withKeyEntry(document, route, target, alias),
                  indexFile,
                )
              } else if (op === 'value') {
                const known =
                  ref !== undefined &&
                  (hasKeyEntry(readKeyIndex(indexFile), route, ref) || ref === enabledNow())
                if (ref === undefined || !known) {
                  refuse('that key is not listed for this provider')
                  return
                }
                if (!isLegalKeyValue(value)) {
                  refuse('a key must be printable ASCII without spaces')
                  return
                }
                // Only the secret moves: the reference keeps its name, its alias
                // and its seat. Removing and re-adding would mint a new ref, so
                // the profile would name a key the store no longer holds and the
                // row would lose everything but its value.
                const refused = await storeCredential(credentials, ref, value)
                if (refused !== undefined) {
                  refuse(refused)
                  return
                }
              } else if (op === 'remove') {
                const document = readKeyIndex(indexFile)
                if (ref === undefined || (!hasKeyEntry(document, route, ref) && ref !== enabledNow())) {
                  refuse('that key is not listed for this provider')
                  return
                }
                if (ref === enabledNow()) {
                  // The seat is handed over BEFORE the value goes, so the
                  // profile never names a key the store has just lost while
                  // another listed key was available to take it. When none is,
                  // the reference is unset rather than left dangling.
                  const remaining = keyEntriesOf(document, route)
                    .map(candidate => candidate.ref)
                    .filter(candidate => candidate !== ref)
                  const failed = await setEnabledKey(remaining[0])
                  if (failed !== undefined) {
                    refuse(failed)
                    return
                  }
                }
                const configured = (await credentialConfigured(credentials, [ref]))[ref]
                if (configured !== false) {
                  const refused = await forgetCredential(credentials, ref)
                  if (refused !== undefined) {
                    refuse(refused)
                    return
                  }
                }
                updateKeyIndex(document2 => withoutKeyEntry(document2, route, ref), indexFile)
              } else {
                refuse(`unknown key operation "${op}"`)
                return
              }
            } catch (error) {
              sendJson(res, 500, { ok: false, error: error instanceof Error ? error.message : String(error) })
              return
            }
            sendJson(res, 200, await payload())
          },
        }),
      'dsh-model-think-level: key index route',
    )

    // The autofill switches, for the browser half that runs the running
    // complement. Read-only and same-origin only, like the probe above: a
    // `dsh.client` declaration carries no plugin config, so without this route
    // a deployment configured `autofill: false` would still be written to from
    // the settings page.
    ctx.effect(
      () =>
        webServerCtx.webServer.register({
          kind: 'exact',
          path: AUTOFILL_CONFIG_PATH,
          handler: async (req, res) => {
            if (!isTrustedRequest(req)) {
              sendJson(res, 403, { ok: false, error: 'forbidden' })
              return
            }
            if (req.method !== 'GET') {
              sendJson(res, 405, { ok: false, error: 'method not allowed' })
              return
            }
            sendJson(res, 200, {
              ok: true,
              data: { autofill: resolved.autofill, modalityAutofill: resolved.modalityAutofill },
            })
          },
        }),
      'dsh-model-think-level: autofill config route',
    )

    // The request-header overlay's status, for the browser half. Same-origin
    // and read-only, like the other two routes: the takeover lives host-side, so
    // the page needs this to say which routes it is changing and to warn about
    // another plugin rewriting the same surface.
    ctx.effect(
      () =>
        webServerCtx.webServer.register({
          kind: 'exact',
          path: HEADERS_CONFIG_PATH,
          handler: async (req, res) => {
            if (!isTrustedRequest(req)) {
              sendJson(res, 403, { ok: false, error: 'forbidden' })
              return
            }
            if (req.method !== 'GET') {
              sendJson(res, 405, { ok: false, error: 'method not allowed' })
              return
            }
            const index = overlaySource.current
            sendJson(res, 200, {
              ok: true,
              data: {
                /** Whether the fetch-layer takeover is enabled in this deployment. */
                enabled: resolved.uaOverride,
                /** Whether this plugin's wrapper currently owns the global fetch. */
                installed: headerOverlayInstalled(),
                /** Routes whose configured request headers are sent, by origin. */
                overrides: index.overrides.map(entry => ({
                  origin: entry.origin,
                  route: entry.route,
                  headers: entry.headers,
                  ...(entry.userAgent === undefined ? {} : { userAgent: entry.userAgent }),
                })),
                /** Same-origin routes with different User-Agent values. */
                conflicts: index.conflicts,
                /** Same-origin differences for any configured request header. */
                headerConflicts: index.headerConflicts,
                /** What was found of the plugins that rewrite the same surface. */
                environment: headerConflicts,
              },
            })
          },
        }),
      'dsh-model-think-level: headers config route',
    )
  })
}
