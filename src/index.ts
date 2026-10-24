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
import {
  endpointFamilyOf,
  isLegalKeyValue,
  maskKeyValue,
  nextKeyRef,
  normalizeKeyAlias,
  normalizeKeyModels,
  normalizeKeyProtocol,
  normalizeRouteEndpoints,
  type RouteEndpoints,
  type RouteProtocol,
} from './key-refs.js'
import {
  hasKeyEntry,
  keyEntriesOf,
  keyIndexFilePath,
  readKeyIndex,
  updateKeyIndex,
  withKeyAlias,
  withKeyDisabled,
  withKeyEntry,
  withKeyModels,
  withKeyProtocol,
  withRouteEndpoints,
  withoutKeyEntry,
} from './key-index.js'
import { keyRest, keysForModel, restKeyOf, type KeyCandidate } from './key-route-core.js'
import { suggestEfforts } from './knowledge.js'
import type { ReasoningEfforts } from './knowledge.js'
import { resolveGuardEffort } from './guard.js'
import { isRecord, looksLikeCompatRefusal, modelsOf, routeFactsOf } from './shared.js'
import {
  ANTHROPIC_VERSION,
  LISTABLE_PROTOCOLS,
  composeProbeHeaders,
  displayUrl,
  listingEntries,
  probeListingUrl,
  readBounded,
  type ListedModel,
} from './listing.js'
import { probeListing } from './discovery-merge.js'
import { FAMILY_PROTOCOL, probeKeyModels, type KeyProbeResult } from './key-probe.js'
import type { EndpointFamily } from './key-refs.js'
import { collectKeyListings, mergeKeyListings, type MergedListing } from './multi-key-listing.js'
import { buildHeaderIndex, emptyIndex, type UserAgentIndex } from './headers-core.js'
import { headerOverlayBypass, headerOverlayInstalled, installHeaderOverlay, type OverlaySource } from './headers-fetch.js'
import { describePiAiHeaderState, installPiAiHeaderTransforms } from './headers-pi-ai.js'
import { detectHeaderConflicts, type HeaderConflictReport } from './headers-conflict.js'
// The knowledge-base patch builder lives in its own module: the browser half
// builds the SAME patch from its own idle-time read, so one suggestion can
// never produce two different documents.
import { buildAutofillPatch, stripNewCompatKeysDeep } from './autofill.js'

/** Re-exported so the package entry keeps naming the patch builder. */
export { buildAutofillPatch }

/** Re-exported so the package entry keeps naming the probe-header composer. */
export { composeProbeHeaders }

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
  /** Whether the key is switched into the routing pool (its check is lit). */
  enabled: boolean
  /** Whether the store holds a value; null when the store cannot say. */
  configured: boolean | null
  /** The value in its display form, when the store let it be read. */
  masked?: string
  /** Model ids this key was discovered to serve; absent means "unscoped". */
  models?: readonly string[]
  /** The protocol this key pins, when it pins one (else the route's own). */
  protocol?: RouteProtocol
  /**
   * The key's cooldown, when it is resting after a failure: how long until it
   * is a normal candidate again, and how many consecutive failures produced
   * the period. Absent means the key is a normal candidate right now.
   */
  rest?: { readonly kind: string; readonly remainingMs: number; readonly failures: number }
}

/**
 * One key's routing scope as the fetch seam needs it: the reference and the
 * models it may serve, WITHOUT the secret (the seam resolves a value only for
 * the keys a request can actually reach). Kept in a small in-memory snapshot so
 * the per-request path pays no disk read.
 */
interface RouteKeyScope {
  readonly ref: string
  readonly models?: readonly string[]
  /** The protocol this key pins, when it pins one (else resolved per model). */
  readonly protocol?: RouteProtocol
  /** Base URL this key must use, resolved for its protocol family. */
  readonly endpoint?: string
  /**
   * The route's family addresses, carried by an UNPINNED key: its wire is
   * resolved per model (`autoWireOf`), and a model whose family names one of
   * these addresses is dispatched there. A pinned key does not need the map —
   * its endpoint is already resolved above.
   */
  readonly endpoints?: RouteEndpoints
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

/**
 * Read the key index into the per-route scope snapshot the fetch seam reads.
 * This is metadata only — references and their discovered model lists, never a
 * secret — so it is safe to hold in memory across requests. A malformed or
 * missing index degrades to "no scopes", which leaves every request on the
 * adapter's own single-key path (exactly today's behaviour).
 *
 * Preference order IS the list order, so the FIRST key is the default: a model
 * every key can serve signs with it and fails over to the next (user rule A).
 * The profile's `apiKeyEnv` (the key the official page configured) is appended
 * last, unscoped, when the index has never listed it — it is a real key the
 * store holds, so it must stay reachable, but as a catch-all fallback.
 * @param providers - the live pi-ai providers map (per route's `apiKeyEnv`).
 */
function readRouteKeyScopes(
  providers: Record<string, Record<string, unknown>>,
): Record<string, readonly RouteKeyScope[]> {
  let document: ReturnType<typeof readKeyIndex>
  try {
    document = readKeyIndex(keyIndexFilePath())
  } catch {
    return {}
  }
  const scopes: Record<string, readonly RouteKeyScope[]> = {}
  const routes = new Set<string>(Object.keys(document.providers))
  for (const route of Object.keys(providers)) routes.add(route)
  for (const route of routes) {
    const endpoints = document.endpoints?.[route]
    const listed = keyEntriesOf(document, route)
    // A switched-off key leaves the pool entirely: its metadata stays on the
    // list (so switching it back on restores exactly what it served), but no
    // request may be signed with it while it is off.
    const active = listed.filter(entry => entry.disabled !== true)
    const ordered: RouteKeyScope[] = active.map(entry => {
      const scope: RouteKeyScope = { ref: entry.ref }
      if (entry.models !== undefined) (scope as { models?: readonly string[] }).models = entry.models
      if (entry.protocol !== undefined) {
        ;(scope as { protocol?: RouteProtocol }).protocol = entry.protocol
        // A key that pins a protocol also pins the endpoint of that family: the
        // provider keeps one URL per family (OpenAI, Anthropic, Gemini), and the
        // key states which wire it speaks, so the matching URL must ride along.
        const family = endpointFamilyOf(entry.protocol)
        const endpoint = endpoints?.[family]
        if (endpoint !== undefined) (scope as { endpoint?: string }).endpoint = endpoint
      } else if (endpoints !== undefined) {
        // An unpinned key is automatic: its wire is chosen per model from the
        // families the provider addressed, so the whole map rides along.
        ;(scope as { endpoints?: RouteEndpoints }).endpoints = endpoints
      }
      return scope
    })
    const seat = enabledRefOf(isRecord(providers[route]) ? providers[route] : undefined)
    // The seat joins only when the index has never listed it: a listed seat
    // speaks through its own entry, on or off — appending a switched-off seat
    // here would put the very key the user disabled back on the wire.
    if (seat !== undefined && !listed.some(entry => entry.ref === seat)) {
      // The seat is an automatic key like any listed unpinned one: it resolves
      // its wire per model family, so the route's family addresses ride along.
      // Without them a single-key provider (the key never listed in the panel)
      // would neither route to nor list the models of the families whose
      // addresses the user configured.
      const seatScope: RouteKeyScope = { ref: seat }
      if (endpoints !== undefined) (seatScope as { endpoints?: RouteEndpoints }).endpoints = endpoints
      ordered.push(seatScope)
    }
    if (ordered.length > 0) scopes[route] = ordered
  }
  return scopes
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

/** A host dependency failed to answer a read; never report this as absence. */
class HostReadError extends Error {}

async function resolveCredential(credentials: CredentialsService | undefined, ref: string): Promise<string | undefined> {
  if (credentials === undefined || typeof credentials.resolve !== 'function') {
    throw new HostReadError('the credential store is unavailable')
  }
  let hit: unknown
  try {
    hit = await credentials.resolve(ref)
  } catch {
    throw new HostReadError('the credential store could not read the reference')
  }
  if (isRefusal(hit) || (hit !== undefined && !isRecord(hit))) {
    throw new HostReadError('the credential store could not read the reference')
  }
  if (hit === undefined) return undefined
  const value = (hit as Record<string, unknown>)['value']
  if (value !== undefined && typeof value !== 'string') {
    throw new HostReadError('the credential store returned an invalid value')
  }
  return typeof value === 'string' && value.length > 0 ? value : undefined
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
      const answer = await describe.call(credentials, [...refs])
      const records = isRefusal(answer) ? undefined : describeRecords(answer)
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
  for (const ref of refs) {
    try {
      const value = await resolveCredential(credentials, ref)
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
  const piSection = (required = false): unknown => {
    if (piSectionCached) return piSectionCache
    let value: unknown
    try {
      value = settings.describe().find(entry => entry.ns === PI_NS)?.value
    } catch {
      if (required) throw new HostReadError('the llm-pi-ai settings could not be read')
      // Dispatch guards remain advisory while interactive routes report errors.
      return undefined
    }
    // A missing namespace is expected during boot and must be retried.
    if (value === undefined) {
      if (required) throw new HostReadError('the llm-pi-ai settings entry is unavailable')
      return undefined
    }
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
      let disposed = false
      const prepare: LlmDispatchLike['prepareCall'] = (callConfig, signal) =>
        origPrepare.call(llm, disposed ? callConfig : guardCallConfig(callConfig, piSection()), signal)
      const stream: LlmDispatchLike['stream'] = (options) =>
        origStream.call(llm, disposed ? options : guardCallConfig(options, piSection()))
      llm.prepareCall = prepare
      llm.stream = stream
      ctx.effect(() => () => {
        disposed = true
        if (llm.prepareCall === prepare) llm.prepareCall = origPrepare
        if (llm.stream === stream) llm.stream = origStream
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
  // Per-route key scopes (references + discovered model lists, never secrets)
  // the fetch seam uses to choose and fail over across keys. Kept as a live
  // snapshot so the hot request path reads memory, not disk.
  const keyScopes: { current: Record<string, readonly RouteKeyScope[]> } = { current: {} }
  const providersOf = (): Record<string, Record<string, unknown>> => {
    const section = piSection()
    return isRecord(section) && isRecord(section['providers'])
      ? (section['providers'] as Record<string, Record<string, unknown>>)
      : {}
  }
  const refreshKeyScopes = (): void => { keyScopes.current = readRouteKeyScopes(providersOf()) }
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
  refreshKeyScopes()
  ctx.effect(() => () => stopHeaderRetries(), 'dsh-model-think-level: header retries')
  ctx.on('settings/document-updated', (ns) => {
    if (ns === PI_NS) {
      refreshHeaders()
      refreshKeyScopes()
    }
  })
  /**
   * Resolve the ordered keys that may sign one matched request. The preference
   * order is the key index's list order; `keysForModel` narrows to the keys
   * whose scope can serve this model, falling back to the full list so a stale
   * or over-eager scope can never strand a model that some key can reach. Each
   * candidate's value is resolved fresh (a rotated/replaced key is honoured on
   * the next request); a reference whose value the store cannot confirm is
   * skipped, leaving the remaining keys — and, if none resolve, the adapter's
   * own single-key path — to serve.
   */
  overlaySource.keys = async ({ route, model }) => {
    const scopes = keyScopes.current[route] ?? []
    if (scopes.length === 0) return []
    const ordered = keysForModel(
      scopes.map(scope => ({ ref: scope.ref, value: '', models: scope.models })),
      model,
    )
    // Resolve every reference in parallel (this sits on the request hot path:
    // sequential IPC per key would stack latency per key) and keep the planned
    // order; a reference whose value the store cannot confirm resolves to
    // undefined and is skipped, leaving the remaining keys — and, if none
    // resolve, the adapter's own single-key path — to serve.
    const credentials = ctx.get('credentials') as CredentialsService | undefined
    const values = await Promise.all(ordered.map(async candidate => {
      try {
        return await resolveCredential(credentials, candidate.ref)
      } catch {
        return undefined
      }
    }))
    const candidates: KeyCandidate[] = []
    for (let index = 0; index < ordered.length; index += 1) {
      const value = values[index]
      if (value === undefined) continue
      const candidate = ordered[index]
      const scope = scopes.find(entry => entry.ref === candidate.ref)
      const resolved: KeyCandidate = { ref: candidate.ref, value, models: candidate.models }
      if (scope?.protocol !== undefined) (resolved as { protocol?: RouteProtocol }).protocol = scope.protocol
      if (scope?.endpoint !== undefined) (resolved as { endpoint?: string }).endpoint = scope.endpoint
      // An unpinned key is automatic: it carries the family addresses its wire
      // resolution (`wireOf`) may pick from, one per endpoint family.
      if (scope?.endpoints !== undefined) (resolved as { endpoints?: KeyCandidate['endpoints'] }).endpoints = scope.endpoints
      candidates.push(resolved)
    }
    return candidates
  }
  overlaySource.modelListing = async ({ route, headers, keys, signal, send }) => {
    const profile = providerProfileOf(piSection(), route)
    const api = normalizeKeyProtocol(profile?.['api'])
    const baseURL = typeof profile?.['baseURL'] === 'string' ? profile['baseURL'].trim() : ''
    if (api === undefined || !LISTABLE_PROTOCOLS.has(api) || baseURL.length === 0) return undefined

    // Shares the probe-and-merge the panel and the `discover` operation use, so
    // the catalogue the host's own discovery sees is the census the plugin would
    // report: bounded concurrency, and one key's refusal never drops the others.
    // A listing record carries more than its id (display name, limits), so the
    // full records are kept per key and stitched back in merged order below.
    const recordsByRef = new Map<string, ListedModel[]>()
    const { results } = await collectKeyListings({
      keys,
      refOf: key => key.ref,
      probe: async key => {
        // A pinned key is asked on its own wire; an automatic key is asked on
        // every wire it could dispatch on — the route's wire, plus each
        // cross-family address it carries — so the catalogue covers the models
        // of all of them, the same union `probeKeyModels` records for the key
        // panel. A same-family address is skipped: the route's own URL serves
        // that family, and requests would never be dispatched elsewhere.
        const targets: { api: RouteProtocol; baseURL: string }[] = key.protocol !== undefined
          ? [{ api: key.protocol, baseURL: key.endpoint ?? baseURL }]
          : [
            { api, baseURL },
            ...Object.entries(key.endpoints ?? {})
              .filter(([family]) => family !== endpointFamilyOf(api))
              .map(([family, url]) => ({ api: FAMILY_PROTOCOL[family as EndpointFamily], baseURL: url ?? '' })),
          ]
        const sendListing = (url: string, init: RequestInit): Promise<Response> => {
          const requestHeaders = new Headers(headers)
          requestHeaders.delete('authorization')
          requestHeaders.delete('x-api-key')
          requestHeaders.delete('x-goog-api-key')
          new Headers(init.headers).forEach((value, name) => requestHeaders.set(name, value))
          const requestSignal = signal == null
            ? init.signal
            : init.signal == null
              ? signal
              : AbortSignal.any([signal, init.signal])
          return send(url, { ...init, headers: requestHeaders, signal: requestSignal })
        }
        const asked = new Set<string>()
        const records: ListedModel[] = []
        for (const target of targets) {
          if (!LISTABLE_PROTOCOLS.has(target.api) || target.baseURL.length === 0) continue
          const url = probeListingUrl(target.baseURL, target.api)
          // A gateway that spells one listing under two protocols is asked once.
          if (asked.has(url)) continue
          asked.add(url)
          const listing = await probeListing({
            baseURL: target.baseURL,
            api: target.api,
            apiKey: key.value,
            headers: profile?.['headers'],
            timeoutMs: resolved.probeTimeoutMs,
            send: sendListing,
          })
          if (listing === undefined) continue
          for (const model of listing) {
            if (records.some(existing => existing.id === model.id)) continue
            records.push(model)
          }
        }
        if (records.length === 0) return { ref: key.ref, models: undefined, targets: [] }
        recordsByRef.set(key.ref, records)
        return {
          ref: key.ref,
          models: records.map(model => model.id),
          targets: [],
        }
      },
    })
    const records = new Map<string, ListedModel>()
    for (const result of results) {
      for (const model of recordsByRef.get(result.ref) ?? []) {
        if (!records.has(model.id)) records.set(model.id, model)
      }
    }
    const models = mergeKeyListings(results).ids
      .map(id => records.get(id))
      .filter((model): model is ListedModel => model !== undefined)
    if (models.length === 0) return undefined
    return new Response(JSON.stringify({ data: models }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    })
  }
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
  const environmentConflicts: HeaderConflictReport = detectHeaderConflicts()

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
            let section: unknown
            try {
              section = piSection(true)
            } catch {
              sendJson(res, 502, { ok: false, error: 'the llm-pi-ai settings could not be read' })
              return
            }
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
                apiKey = await resolveCredential(ctx.get('credentials') as CredentialsService | undefined, apiKeyEnv)
              } catch {
                sendJson(res, 502, { ok: false, error: 'the credential store could not read the reference' })
                return
              }
            }
            try {
              // This probe composes its own auth from the profile's reference, so
              // it must bypass the key-routing wrapper: that wrapper would re-sign
              // the request with the route's first key, probing the wrong credential.
              const upstream = await headerOverlayBypass()(listingURL, {
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
            let section: unknown
            try {
              section = piSection(true)
            } catch {
              sendJson(res, 502, { ok: false, error: 'the llm-pi-ai settings could not be read' })
              return
            }
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
            let ref: string | undefined
            try {
              ref = named.length > 0
                ? (named === apiKeyEnv || hasKeyEntry(readKeyIndex(keyIndexFilePath()), route, named) ? named : undefined)
                : apiKeyEnv
            } catch {
              sendJson(res, 500, { ok: false, error: 'the key index could not be read' })
              return
            }
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
              value = await resolveCredential(ctx.get('credentials') as CredentialsService | undefined, ref)
            } catch {
              sendJson(res, 502, { ok: false, error: 'the credential store could not read the reference' })
              return
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
    let keyMutationTail = Promise.resolve()
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
            let releaseMutation: (() => void) | undefined
            try {
              if (req.method === 'POST') {
                // Routes can share credential refs, including normalized names.
                // Keep each write/rollback sequence together; reads never queue.
                const previous = keyMutationTail
                keyMutationTail = new Promise<void>(resolve => { releaseMutation = resolve })
                await previous
              }
              // Read the entry fresh rather than through the cached section: this
              // route writes to it, and an answer built from a pre-write snapshot
              // would show the user the state they just changed away from.
              const entryOf = (): { value: unknown; revision: number } | undefined => {
                try {
                  const found = settings.describe().find(candidate => candidate.ns === PI_NS)
                  if (found === undefined) throw new HostReadError('the llm-pi-ai settings entry is unavailable')
                  return { value: found.value, revision: found.revision }
                } catch {
                  throw new HostReadError('the llm-pi-ai settings could not be read')
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
                // One disk read answers the entries, the endpoints and (with the
                // section) the seat context below; re-reading the file per field
                // would triple the I/O of every list request.
                const document = readKeyIndex(indexFile)
                const seat = enabledNow()
                const listed = keyEntriesOf(document, route)
                const refs = listed.map(entry => entry.ref)
                // The seat (the reference the adapter itself resolves) is always
                // on the list, even when the official page wrote it and this
                // plugin has never listed it — the adapter still needs it.
                if (seat !== undefined && !refs.includes(seat)) refs.push(seat)
                const facts = await credentialFacts(credentials, refs)
                const now = Date.now()
                const entries: KeyEntryView[] = refs.map(ref => {
                  const fact = facts[ref]
                  const stored = listed.find(candidate => candidate.ref === ref)
                  const view: KeyEntryView = {
                    ref,
                    // Being switched on is the default: a key the index has
                    // never described (the seat) reads as in use.
                    enabled: stored?.disabled !== true,
                    configured: fact?.configured ?? null,
                  }
                  if (fact?.masked !== undefined) view.masked = fact.masked
                  if (stored?.alias !== undefined) view.alias = stored.alias
                  if (stored?.models !== undefined) (view as { models?: readonly string[] }).models = stored.models
                  if (stored?.protocol !== undefined) (view as { protocol?: RouteProtocol }).protocol = stored.protocol
                  // The cooldown memory is the one source of the 冷却 state the
                  // row paints: a resting key reads "cooling for Ns" instead of
                  // healthy, so the panel says why a key is not signing.
                  const rest = keyRest.stateOf(restKeyOf(route, ref), now)
                  if (rest !== undefined) {
                    ;(view as { rest?: KeyEntryView['rest'] }).rest = {
                      kind: rest.kind,
                      remainingMs: Math.max(0, rest.until - now),
                      failures: rest.failures,
                    }
                  }
                  return view
                })
                const endpoints = document.endpoints?.[route]
                // The models this route actually offers — the universe a key's
                // scope is chosen from (user rule: pick from the models already
                // added, never the provider's whole catalog).
                const routeModels = modelsOf(providersOf(), route)
                  .map(model => (typeof model['id'] === 'string' ? model['id'] : ''))
                  .filter(id => id.length > 0)
                // What the provider serves ACROSS its keys: one catalogue, each
                // model naming the keys that advertise it. The picker only knows
                // the route's own `models`, so `unmergedModels` is the part of
                // that catalogue it cannot see yet — the panel offers to add it,
                // and no write happens without that click.
                const merged = mergeKeyListings(
                  listed.map(entry => ({
                    ref: entry.ref,
                    targets: [],
                    models: entry.models === undefined ? undefined : [...entry.models],
                  })),
                )
                const declaredModels = new Set(routeModels)
                const unmergedModels = merged.ids.filter(id => !declaredModels.has(id))
                return {
                  ok: true,
                  route,
                  entries,
                  models: routeModels,
                  ...merged.ids.length === 0 ? {} : { mergedModels: merged.ids },
                  ...unmergedModels.length === 0 ? {} : { unmergedModels },
                  endpoints: {
                    openai: endpoints?.openai ?? null,
                    anthropic: endpoints?.anthropic ?? null,
                    gemini: endpoints?.gemini ?? null,
                  },
                }
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
              // Validate each operation before its first write and compensate
              // later failures across the independent settings and key stores.
              const refuse = (error: string): void => sendJson(res, 400, { ok: false, error })
              // The per-key outcome of a `discover` op, echoed beside the payload
              // so the panel can say which protocol each key was asked on.
              let probeReport: KeyProbeResult[] | undefined

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
                let created = nextKeyRef(route, taken)
                // Metadata cannot enumerate the credential store. Check each
                // candidate against both read faces before writing a new value.
                for (;;) {
                  const facts = await credentialFacts(credentials, [created])
                  const configured = facts[created]?.configured
                  if (configured === undefined) throw new HostReadError('the credential store could not confirm a free reference')
                  if (!configured && await resolveCredential(credentials, created) === undefined) break
                  taken.push(created)
                  created = nextKeyRef(route, taken)
                }
                // The value goes into the store first: a reference the index
                // lists but the store cannot hold would render as a key the
                // user can never reveal, enable or remove.
                const refused = await storeCredential(credentials, created, value)
                if (refused !== undefined) {
                  refuse(refused)
                  return
                }
                let indexed = false
                try {
                  updateKeyIndex(document => withKeyEntry(document, route, created, alias), indexFile)
                  indexed = true
                  // Adding the first key also configures the route.
                  if (enabledNow() === undefined) {
                    const failed = await setEnabledKey(created)
                    if (failed !== undefined) throw new Error(failed)
                  }
                } catch (error) {
                  const rollback = await forgetCredential(credentials, created)
                  // Keep metadata if cleanup failed, so the retained secret can
                  // still be found and removed by a later manager request.
                  if (rollback === undefined && indexed) {
                    updateKeyIndex(document => withoutKeyEntry(document, route, created), indexFile)
                  }
                  if (rollback !== undefined) {
                    throw new Error(`${error instanceof Error ? error.message : String(error)}; credential rollback failed for ${created}: ${rollback}`)
                  }
                  throw error
                }
              } else if (op === 'scope') {
                // Record which models one key serves (the manual override; the
                // `discover` op fills it automatically). Absent/empty models
                // clears the scope, making the key an unscoped catch-all again.
                const document = readKeyIndex(indexFile)
                const known = ref !== undefined && (hasKeyEntry(document, route, ref) || ref === enabledNow())
                if (ref === undefined || !known) {
                  refuse('that key is not listed for this provider')
                  return
                }
                const scope = isRecord(body) ? normalizeKeyModels(body['models']) : undefined
                const target = ref
                updateKeyIndex(
                  document2 =>
                    hasKeyEntry(document2, route, target)
                      ? withKeyModels(document2, route, target, scope)
                      : withKeyEntry(document2, route, target, undefined),
                  indexFile,
                )
              } else if (op === 'protocol') {
                // Pin which wire protocol one key speaks (the per-key protocol
                // picker). Absent/blank clears the pin, returning the key to the
                // AUTOMATIC wire: each request speaks the protocol the model's
                // own family names where the provider addressed it, and the
                // route's own protocol otherwise.
                const document = readKeyIndex(indexFile)
                const known = ref !== undefined && (hasKeyEntry(document, route, ref) || ref === enabledNow())
                if (ref === undefined || !known) {
                  refuse('that key is not listed for this provider')
                  return
                }
                const protocol = isRecord(body) ? normalizeKeyProtocol(body['protocol']) : undefined
                if (isRecord(body) && body['protocol'] !== undefined && body['protocol'] !== null && protocol === undefined) {
                  refuse('that protocol is not supported')
                  return
                }
                // A pinned protocol rides its own family's base URL when the
                // provider configured one (readRouteKeyScopes), and otherwise
                // falls back to the provider's own address with that wire — which
                // is how a key switches between Responses and Chat Completions on
                // ONE URL. Refusing the pin without that address (the old rule)
                // made the picker look dead (user item 3), so the pin is stored as
                // stated and the request path decides which URL it goes to.
                const target = ref
                updateKeyIndex(
                  document2 =>
                    hasKeyEntry(document2, route, target)
                      ? withKeyProtocol(document2, route, target, protocol)
                      : withKeyEntry(document2, route, target, undefined),
                  indexFile,
                )
              } else if (op === 'enable') {
                // Switch one key into or out of the routing pool (the circular
                // check on each row). Everything else about the key — label,
                // scope, protocol pin — stays, so switching it back on restores
                // exactly what it served. The last enabled key cannot be
                // switched off: an empty pool would send the request down the
                // adapter's own single-key path, which signs with the very key
                // the user just switched off.
                const document = readKeyIndex(indexFile)
                const known = ref !== undefined && (hasKeyEntry(document, route, ref) || ref === enabledNow())
                if (ref === undefined || !known) {
                  refuse('that key is not listed for this provider')
                  return
                }
                const enabling = !(isRecord(body) && body['enabled'] === false)
                if (!enabling) {
                  const listed = keyEntriesOf(document, route)
                  const seat = enabledNow()
                  const others = listed.filter(entry => entry.ref !== ref && entry.disabled !== true)
                  // The unlisted seat (the profile's own reference) stays a
                  // fallback key — unless it is the one being switched off.
                  const seatRemains =
                    seat !== undefined && seat !== ref && !listed.some(entry => entry.ref === seat)
                  if (others.length === 0 && !seatRemains) {
                    refuse('the last enabled key cannot be switched off')
                    return
                  }
                }
                const target = ref
                updateKeyIndex(
                  document2 => {
                    const indexed = hasKeyEntry(document2, route, target)
                    // Switching ON a reference the index has never listed (the
                    // unlisted seat) is already the state of the world.
                    if (!indexed && enabling) return document2
                    return withKeyDisabled(
                      indexed ? document2 : withKeyEntry(document2, route, target, undefined),
                      route,
                      target,
                      !enabling,
                    )
                  },
                  indexFile,
                )
              } else if (op === 'endpoints') {
                // The provider's base URLs, one per protocol family: the
                // ChatGPT/OpenAI wire, the Anthropic wire and the Gemini one.
                // A key that pins a protocol uses the matching URL; each is
                // optional and an empty value clears that side.
                const endpoints = isRecord(body)
                  ? normalizeRouteEndpoints({
                    openai: body['openai'],
                    anthropic: body['anthropic'],
                    gemini: body['gemini'],
                  })
                  : undefined
                updateKeyIndex(document => withRouteEndpoints(document, route, endpoints), indexFile)
              } else if (op === 'discover') {
                // Probe EACH listed key for the models it actually serves. A key
                // is only asked on the protocols and addresses it would be used
                // with (see key-probe.ts): its own pin when it has one, and both
                // families when the provider configured both. A key whose
                // listing cannot be read keeps its previous scope rather than
                // being wiped.
                const document = readKeyIndex(indexFile)
                const profile = providerProfileOf(entryOf()?.value, route)
                const baseURL = typeof profile?.['baseURL'] === 'string' ? profile['baseURL'] : ''
                const api = typeof profile?.['api'] === 'string' ? profile['api'] : ''
                if (baseURL.length === 0) {
                  refuse('this provider has no address to interrogate; set each key\'s models by hand')
                  return
                }
                const seat = enabledNow()
                const listedEntries = keyEntriesOf(document, route)
                const listedRefs = listedEntries.map(candidate => candidate.ref)
                if (seat !== undefined && !listedRefs.includes(seat)) listedRefs.push(seat)
                if (listedRefs.length === 0) {
                  refuse('add a key before detecting its models')
                  return
                }
                const endpoints = document.endpoints?.[route]
                // Resolve every credential BEFORE probing: a key whose value
                // cannot be read is not asked at all, and the pass still runs
                // for the rest instead of stopping at the first unreadable one.
                const asks: { ref: string; apiKey: string; pinned?: RouteProtocol }[] = []
                for (const listed of listedRefs) {
                  let apiKey: string | undefined
                  try {
                    apiKey = await resolveCredential(credentials, listed)
                  } catch {
                    continue
                  }
                  if (apiKey === undefined) continue
                  const pinned = listedEntries.find(candidate => candidate.ref === listed)?.protocol
                  asks.push({
                    ref: listed,
                    apiKey,
                    ...pinned === undefined ? {} : { pinned },
                  })
                }
                // The scopes the keys were last seen serving. A key whose listing
                // cannot be read this pass keeps these models: a provider-wide
                // catalogue must not shrink because one key was rate-limited
                // (the rule magpie's per-key fetch applies too).
                const lastKnown = new Map<string, readonly string[]>(
                  listedEntries
                    .filter(candidate => candidate.models !== undefined)
                    .map(candidate => [candidate.ref, candidate.models as readonly string[]]),
                )
                // Bounded concurrency: asking every key at once can trip a
                // provider's per-account rate limit with its own catalogue read.
                const { results } = await collectKeyListings({
                  keys: asks,
                  lastKnown,
                  refOf: ask => ask.ref,
                  probe: async ask => probeKeyModels({
                    ref: ask.ref,
                    intent: {
                      api,
                      baseURL,
                      ...ask.pinned === undefined ? {} : { pinned: ask.pinned },
                      ...endpoints === undefined ? {} : { endpoints },
                    },
                    apiKey: ask.apiKey,
                    profileHeaders: profile?.['headers'],
                    timeoutMs: resolved.probeTimeoutMs,
                    // Each key probes its OWN credential, so bypass the key-routing
                    // wrapper (which would otherwise sign every probe with the first key).
                    send: headerOverlayBypass(),
                    headersFor: composeProbeHeaders,
                    read: readBounded,
                    entries: listingEntries,
                  }),
                })
                for (const result of results) {
                  if (result.models === undefined) continue
                  updateKeyIndex(
                    document2 =>
                      hasKeyEntry(document2, route, result.ref)
                        ? withKeyModels(document2, route, result.ref, result.models as readonly string[])
                        : withKeyEntry(document2, route, result.ref, undefined),
                    indexFile,
                  )
                }
                if (results.every(result => result.targets.length === 0)) {
                  refuse(
                    results.find(result => result.skipped !== undefined)?.skipped ??
                      'this provider cannot be interrogated; set each key\'s models by hand',
                  )
                  return
                }
                probeReport = results
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
                const configured = (await credentialConfigured(credentials, [ref]))[ref]
                if (configured === undefined) throw new HostReadError('the credential store could not read the reference')
                const wasEnabled = ref === enabledNow()
                const remaining = keyEntriesOf(document, route)
                  .map(candidate => candidate.ref)
                  .filter(candidate => candidate !== ref)
                const replacement = remaining[0]
                if (wasEnabled) {
                  // Move the profile before forgetting its credential.
                  const failed = await setEnabledKey(replacement)
                  if (failed !== undefined) {
                    refuse(failed)
                    return
                  }
                }
                try {
                  // Commit metadata before deleting the secret: a disk failure
                  // must leave the original credential available for rollback.
                  updateKeyIndex(document2 => withoutKeyEntry(document2, route, ref), indexFile)
                  if (configured) {
                    const refused = await forgetCredential(credentials, ref)
                    if (refused !== undefined) throw new Error(refused)
                  }
                } catch (error) {
                  const failures: string[] = []
                  try {
                    updateKeyIndex(current => {
                      const providers = { ...current.providers }
                      const original = document.providers[route]
                      if (original === undefined) delete providers[route]
                      else providers[route] = original
                      return { ...current, providers }
                    }, indexFile)
                  } catch {
                    failures.push('key index rollback failed')
                  }
                  // Do not undo a later profile change by another writer.
                  if (wasEnabled && enabledNow() === replacement) {
                    const failed = await setEnabledKey(ref)
                    if (failed !== undefined) failures.push(`profile rollback failed: ${failed}`)
                  }
                  throw new Error([error instanceof Error ? error.message : String(error), ...failures].join('; '))
                }
              } else if (op === 'applyMerged') {
                // Offer the provider-wide catalogue to the picker. Only models the
                // keys advertise that the route does NOT declare yet are appended:
                // nothing already declared is renamed, reordered or removed, so a
                // hand-written entry (a display name, a context window) is never
                // rewritten by a scope probe. The panel asks first, and this op is
                // the only path that writes a provider's models on a probe's
                // behalf; nothing here runs on its own.
                const merged = mergeKeyListings(
                  keyEntriesOf(readKeyIndex(indexFile), route).map(candidate => ({
                    ref: candidate.ref,
                    targets: [],
                    models: candidate.models === undefined ? undefined : [...candidate.models],
                  })),
                )
                if (merged.ids.length === 0) {
                  refuse('no key models have been detected yet; detect them first')
                  return
                }
                /**
                 * Append the undeclared ids to the RAW user models array (never the
                 * resolved view: materializing schema defaults into the user layer
                 * is what the autofill pass works hard to avoid).
                 * @returns undefined when the write landed or nothing was missing,
                 *   otherwise the refusal and whether it was a revision conflict.
                 */
                const appendMerged = async (): Promise<{ conflict: boolean; error: string } | undefined> => {
                  const descriptor = settings.describe().find(candidate => candidate.ns === PI_NS)
                  const user = isRecord(descriptor?.['user']) ? descriptor['user'] : undefined
                  const userProviders = isRecord(user) && isRecord(user['providers']) ? user['providers'] : undefined
                  const profile = isRecord(userProviders) ? userProviders[route] : undefined
                  const rawModels: unknown[] = isRecord(profile) && Array.isArray(profile['models'])
                    ? profile['models']
                    : []
                  const declared = new Set(
                    rawModels
                      .filter(isRecord)
                      .map(model => (typeof model['id'] === 'string' ? model['id'].trim() : ''))
                      .filter(id => id.length > 0),
                  )
                  const additions = merged.ids.filter(id => !declared.has(id))
                  if (additions.length === 0) return undefined
                  try {
                    await settings.mutate(
                      PI_NS,
                      [{
                        op: 'set',
                        path: ['providers', route, 'models'],
                        value: [...rawModels, ...additions.map(id => ({ id }))],
                      }],
                      descriptor?.revision,
                    )
                    return undefined
                  } catch (error) {
                    return {
                      conflict: isConflictError(error),
                      error: error instanceof Error ? error.message : String(error),
                    }
                  }
                }
                for (let attempt = 0; attempt < 2; attempt += 1) {
                  const failed = await appendMerged()
                  if (failed === undefined) break
                  // The document moved between the read and the write (the official
                  // card, another tab, the autofill pass): re-read once and retry.
                  if (attempt === 0 && failed.conflict) continue
                  refuse(failed.error)
                  return
                }
                // The answer below re-reads the namespace, and our own write is the
                // freshest thing in it: drop the cached section instead of waiting
                // for a document-updated event this handler cannot observe.
                piSectionCached = false
              } else {
                refuse(`unknown key operation "${op}"`)
                return
              }
              // The key index is this plugin's own file, so a write to it fires no
              // settings event. Refresh the live routing snapshot here or a key
              // added/scoped/detected just now would not sign a request until some
              // unrelated settings change happened to refresh it.
              refreshKeyScopes()
              const answer = await payload()
              // `payload()` is `unknown` by contract (the browser narrows it), so
              // the probe report is attached without spreading that type.
              sendJson(
                res,
                200,
                probeReport === undefined || !isRecord(answer) ? answer : { ...answer, probe: probeReport },
              )
            } catch (error) {
              sendJson(res, error instanceof HostReadError ? 502 : 500, {
                ok: false, error: error instanceof Error ? error.message : String(error),
              })
            } finally {
              releaseMutation?.()
            }
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
                environment: environmentConflicts,
              },
            })
          },
        }),
      'dsh-model-think-level: headers config route',
    )
  })
}
