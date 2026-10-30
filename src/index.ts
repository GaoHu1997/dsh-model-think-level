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
  BALANCE_PATH,
  DIAG_PATH,
  FINGERPRINT_PATH,
  HEADERS_CONFIG_PATH,
  IMAGE_CONFIG_PATH,
  KEY_INDEX_PATH,
  ORDER_PATH,
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
  withKeyAutoScope,
  withKeyDisabled,
  withKeyEntry,
  withKeyModels,
  withKeyProtocol,
  withRouteBalance,
  withRouteEndpoints,
  withoutKeyEntry,
  withoutRoute,
  writeKeyIndex,
  type KeyIndexEntry,
} from './key-index.js'
import { keyRest, keysForModel, restKeyOf, type KeyCandidate, type ServingKnowledge } from './key-route-core.js'
import { keyServesFilePath, readKeyServes, servesOfRoute, withServes, withoutServes, writeKeyServes, type KeyServesDocument } from './key-serves.js'
import { commitUiOrderGuarded, readUiOrder, uiOrderFilePath } from './order-store.js'
import { collectKeyListings, mergeKeyListings } from './multi-key-listing.js'
import { listingTargetsOf, type ProbeTarget } from './key-probe.js'
import { probeListing } from './discovery-merge.js'
import { suggestEfforts } from './knowledge.js'
import type { ReasoningEfforts } from './knowledge.js'
import { resolveGuardEffort } from './guard.js'
import { parseBalancePayload } from './balance.js'
import { isRecord, looksLikeCompatRefusal, modelsOf, routeFactsOf } from './shared.js'
import {
  ANTHROPIC_VERSION,
  LISTABLE_PROTOCOLS,
  composeProbeHeaders,
  displayUrl,
  listingEntries,
  probeListingUrl,
  readBounded,
  redactUrlSecrets,
  type ListedModel,
} from './listing.js'
import { buildHeaderIndex, emptyIndex, type UserAgentIndex } from './headers-core.js'
import { headerOverlayBypass, headerOverlayInstalled, installHeaderOverlay, type OverlaySource } from './headers-fetch.js'
import { describePiAiHeaderState, installPiAiHeaderTransforms } from './headers-pi-ai.js'
import { detectHeaderConflicts, type HeaderConflictReport } from './headers-conflict.js'
// Image generation (生图): one config file, one generation core behind two
// entries — the `generate_image` native tool (主通道) and the /生图 host
// command — plus the boot-time removal of the retired MCP patch entry.
import {
  deriveImageSeeds,
  emptyImageConfig,
  readImageConfig,
  syncImageConfig,
  updateImageConfig,
  type ImageConfig,
} from './image/config.js'
import { generateImage, type GenerateDeps } from './image/generate.js'
import { registerImagegenCommand, type CommandsServiceLike } from './image/command.js'
import { imageToolHint, registerGenerateImageTool } from './image/tool.js'
import { removeLegacyImageMcpPatch } from './image/legacy-cleanup.js'
// The knowledge-base patch builder lives in its own module: the browser half
// builds the SAME patch from its own idle-time read, so one suggestion can
// never produce two different documents.
import { buildAutofillPatch, buildCompatCleanupPatch, stripNewCompatKeysDeep } from './autofill.js'
// Model fingerprint attribution (ModelTrace). The math is a pure port of
// upstream `fingerprint-core.js` over a vendored bank; only the routing below
// touches the llm service, so the whole attribution path stays unit-testable.
import { bankBuiltAt, loadBankSync, summarizeBank } from './fingerprint/bank.js'
import { generateChallenges } from './fingerprint/challenges.js'
import { analyzeGlobalOutputs, NO_USABLE_OUTPUT, type AttributionResult } from './fingerprint/core.js'
import { isEligibleModel } from './fingerprint/eligibility.js'
import { runProbe, type ProbeOutcome, type ProbeRunResult } from './fingerprint/run.js'
import {
  fingerprintFilePath,
  providerRecords,
  readFingerprintStore,
  updateFingerprintStore,
  withRecord,
  withoutRecord,
  type FingerprintRecord,
  type FingerprintChallenge,
  type FingerprintTiming,
} from './fingerprint/store.js'
import { statusOf, topEntriesOf, EARLY_IDENTIFIED_PROBABILITY } from './fingerprint/verdict.js'

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
 * Balance fetch budget. One read per provider per page opening — but the read
 * runs on the host's web server, and a dead balance endpoint must not hold a
 * socket (and the page's chip, which spins until the answer) for the better
 * part of half a minute. A billing API that needs more than 8s will not get
 * faster on a retry either; the chip keeps the last reading meanwhile.
 */
const BALANCE_TIMEOUT_MS = 8_000

/**
 * Bound on one credential-store IPC a KEY MUTATION waits on. The store is
 * local, so an answer normally lands in milliseconds — but a stalled store
 * (a hung keychain daemon, a wedged host service) must not hang the manager's
 * own route for ever: a mutation that cannot be pre-checked within this
 * budget refuses with a clear message the user can retry, and a forget that
 * outlives it rolls the metadata back the same way a refused forget does.
 */
const CREDENTIAL_IPC_BUDGET_MS = 10_000

/**
 * Per-challenge budget for one fingerprint probe. Deliberately NOT derived from
 * `probeTimeoutMs`: that one bounds a tiny /models read (15s default), while a
 * challenge asks for ~300 integers and the answer alone is several hundred
 * tokens. A provider that cannot answer in two minutes is a `failed` row, not a
 * reason to widen the listing probe.
 */
const FINGERPRINT_CHALLENGE_TIMEOUT_MS = 120_000

/**
 * Fold the accepted challenges' timings into one picture for the result card:
 * the wall clock and first-token wait of the SLOWEST accepted challenge (that
 * is what the user actually waited for), plus the characters-per-second the
 * provider pushed once text started flowing. Throughput counts only the
 * generation window (total minus the first-token wait) so a long thinking
 * preamble shows up as a first-token wait, not as slow streaming. Pure
 * statistics only — the answer text itself is never stored (design §4.2).
 */
function fingerprintTimingOf(outcomes: readonly ProbeOutcome[]): FingerprintTiming | undefined {
  const accepted = outcomes.filter(outcome => outcome.ok && typeof outcome.durationMs === 'number')
  if (accepted.length === 0) return undefined
  const durationMs = Math.max(...accepted.map(outcome => outcome.durationMs ?? 0))
  const firstTokenMs = Math.max(...accepted.map(outcome => outcome.firstTokenMs ?? outcome.durationMs ?? 0))
  let characters = 0
  let generatingMs = 0
  for (const outcome of accepted) {
    const total = outcome.durationMs ?? 0
    const first = Math.min(outcome.firstTokenMs ?? total, total)
    const generating = total - first
    if (generating > 0) {
      characters += outcome.text.length
      generatingMs += generating
    }
  }
  return {
    durationMs,
    ...(firstTokenMs > 0 ? { firstTokenMs } : {}),
    ...(generatingMs > 0 ? { charsPerSecond: characters / (generatingMs / 1000) } : {}),
  }
}

/**
 * Fold each challenge's outcome into the per-question ledger the result card
 * draws as pills: how many integers this one asked for, how many came back,
 * and whether that counted. The accepted flag is NOT recomputed here — it is
 * read from the attribution's own diagnostics when there is one, so the pill
 * and the verdict can never disagree about which answers were pooled. Only the
 * floor rule is duplicated, and only for the no-attribution case (every call
 * died), where there is nothing to read.
 *
 * `diagnostics` is indexed by position in `run.outputs`, which holds ONLY the
 * challenges that answered — so a dead challenge shifts every later entry by
 * one. The running `pooled` counter is what keeps a pill from borrowing its
 * neighbour's number.
 *
 * `skipped` marks the challenge an early exit aborted: it never answered, and
 * calling that "未计入" would send the user chasing a failure that did not
 * happen. Statistics only — no answer text (design §4.2).
 */
function fingerprintChallengesOf(
  outcomes: readonly ProbeOutcome[],
  attribution: AttributionResult | null,
): FingerprintChallenge[] {
  const diagnostics = attribution?.diagnostics
  let pooled = -1
  return outcomes.map((outcome, position) => {
    if (outcome.ok) pooled += 1
    const diagnostic = outcome.ok ? diagnostics?.[pooled] : undefined
    const parsed = diagnostic?.parsed_numbers ?? 0
    return {
      index: position + 1,
      expected: outcome.expectedCount,
      parsed,
      accepted: diagnostic?.accepted ?? false,
      ...(outcome.skipped === true ? { skipped: true } : {}),
    }
  })
}

/**
 * How long ONE raw listing probe may take while Auto-adapt is waiting on it.
 * The wire read it bounds is one tiny `/models` read per endpoint family; a
 * gateway slower than this still answers the next attempt, and the cached
 * answer keeps a whole pass from re-reading it per model.
 */
const LISTING_PROBE_BUDGET_MS = 6_000

/**
 * How long a raw probe answer is reused before the next request re-reads it.
 * Auto-adapt asks per model; a bounded window keeps those repeats off the wire
 * without ever pinning a stale listing on the user.
 */
const LISTING_CACHE_MS = 30_000

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
  /** Manual assignment, restricted to the models this route has added. */
  models?: readonly string[]
  /**
   * What this key's own listing last advertised (observed, not assigned). The
   * panel offers it as a one-click scope: an unscoped key that lists only part of
   * the catalogue silently refuses the rest, and this is the list that makes the
   * split visible. Absent means the key was never listed successfully.
   */
  observed?: readonly string[]
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
 * This is metadata only — references and manual assignments, never a
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
        // provider keeps one URL per family (OpenAI and Anthropic), and the
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
  invalidateCredentialDisplay(credentials, ref)
  try {
    const answer = await set.call(credentials, ref, value)
    if (!isRefusal(answer)) return undefined
    return refusalMessage(answer) ?? `the credential store refused ${ref}`
  } catch (error) {
    return error instanceof Error ? error.message : String(error)
  } finally {
    invalidateCredentialDisplay(credentials, ref)
  }
}

/**
 * Forget one reference's value; the refusal text, or undefined.
 * @param budgetMs - when given, a store that has not answered within the
 *   budget reads as a refusal: the caller rolls its metadata back, exactly as
 *   for an explicit refusal. The underlying unset may still land after the
 *   timeout — the same uncertainty a mid-flight store error already carries —
 *   so the row keeps its reference and a later remove (or a re-save of the
 *   value) repairs it.
 */
async function forgetCredential(credentials: CredentialsService | undefined, ref: string, budgetMs?: number): Promise<string | undefined> {
  const unset = credentials?.unset
  if (credentials === undefined || typeof unset !== 'function') {
    return 'this deployment cannot write the credential store'
  }
  invalidateCredentialDisplay(credentials, ref)
  let timer: ReturnType<typeof setTimeout> | undefined
  try {
    const answer = await Promise.race([
      unset.call(credentials, ref),
      budgetMs === undefined
        ? new Promise<never>(() => {})
        : new Promise<never>((_, reject) => {
            timer = setTimeout(
              () => reject(new Error(`the credential store did not answer within ${Math.round(budgetMs / 1000)}s`)),
              budgetMs,
            )
          }),
    ])
    if (!isRefusal(answer)) return undefined
    return refusalMessage(answer) ?? `the credential store refused to forget ${ref}`
  } catch (error) {
    return error instanceof Error ? error.message : String(error)
  } finally {
    if (timer !== undefined) clearTimeout(timer)
    invalidateCredentialDisplay(credentials, ref)
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

/**
 * Whether the store positively holds NOTHING under one reference.
 *
 * Both faces must agree: `describe` says unconfigured AND no value could be
 * read. A `configured: false` contradicted by a readable value is a stale
 * metadata face, not an empty credential, and an absent entry means the store
 * could not answer at all — unknown, never empty. Callers that must not
 * overwrite a key lean on exactly this distinction.
 * @param fact - what {@link credentialFacts} answered for the reference.
 * @returns true only for a confirmed empty reference.
 */
function holdsNothing(fact: CredentialFacts | undefined): boolean {
  return fact !== undefined && fact.configured === false && fact.masked === undefined
}

/** What the store will say about one reference: configured, and its masked value. */
interface CredentialFacts {
  configured: boolean
  masked?: string
}

const CREDENTIAL_DISPLAY_TTL_MS = 5_000
const CREDENTIAL_DISPLAY_MAX_REFS = 512

/** Only display facts live here; secrets and mutation preconditions never do. */
interface CredentialDisplayRead {
  expiresAt: number
  resolved?: CredentialFacts
  described?: boolean
  settled: Promise<void>
}
const credentialDisplayReads = new WeakMap<CredentialsService, Map<string, CredentialDisplayRead>>()

function invalidateCredentialDisplay(credentials: CredentialsService | undefined, ref: string): void {
  if (credentials !== undefined) credentialDisplayReads.get(credentials)?.delete(ref)
}

/** Short-lived per-ref singleflight for list previews, not authoritative reads. */
async function displayCredentialFacts(
  credentials: CredentialsService | undefined,
  refs: readonly string[],
  budgetMs: number,
): Promise<Record<string, CredentialFacts>> {
  if (credentials === undefined || refs.length === 0) return {}
  let cache = credentialDisplayReads.get(credentials)
  if (cache === undefined) {
    cache = new Map()
    credentialDisplayReads.set(credentials, cache)
  }
  const now = Date.now()
  // Expire stalled flights too: a broken IPC read must not pin a ref forever.
  for (const [ref, read] of cache) if (read.expiresAt <= now) cache.delete(ref)
  const selected = new Map<string, CredentialDisplayRead>()
  const missing: string[] = []
  for (const ref of new Set(refs)) {
    let read = cache.get(ref)
    if (read === undefined) {
      read = { expiresAt: now + CREDENTIAL_DISPLAY_TTL_MS, settled: Promise.resolve() }
      cache.set(ref, read)
      missing.push(ref)
    }
    selected.set(ref, read)
  }
  // Keep describe batched while overlapping lists share each reference's flight.
  const described = missing.length === 0 || typeof credentials.describe !== 'function'
    ? Promise.resolve(undefined)
    : (async () => {
        try {
          const answer = await credentials.describe?.(missing)
          return isRefusal(answer) ? undefined : describeRecords(answer)
        } catch {
          return undefined
        }
      })()
  for (const ref of missing) {
    const read = selected.get(ref)!
    const resolved = (async (): Promise<boolean> => {
      try {
        const value = await resolveCredential(credentials, ref)
        const masked = value === undefined ? undefined : maskKeyValue(value)
        read.resolved = masked === undefined || masked.length === 0
          ? { configured: value !== undefined }
          : { configured: true, masked }
        return true
      } catch {
        return false
      }
    })()
    const metadata = described.then(records => {
      const info = records?.[ref]
      if (isRecord(info) && typeof info['configured'] === 'boolean') read.described = info['configured']
      return typeof credentials.describe !== 'function' || read.described !== undefined
    })
    read.settled = Promise.all([resolved, metadata]).then(([resolvedOK, describedOK]) => {
      // Delete/replacement invalidates the identity, so an old flight cannot
      // repopulate a ref after a credential write (including a rollback).
      if (cache.get(ref) !== read) return
      // Partial answers can paint this response but failures are never cached.
      read.expiresAt = resolvedOK && describedOK ? Date.now() + CREDENTIAL_DISPLAY_TTL_MS : 0
    })
  }
  while (cache.size > CREDENTIAL_DISPLAY_MAX_REFS) {
    const oldest = cache.keys().next().value
    if (oldest === undefined) break
    cache.delete(oldest)
  }
  let timer: ReturnType<typeof setTimeout> | undefined
  try {
    await Promise.race([
      Promise.all([...selected.values()].map(read => read.settled)),
      new Promise<void>(resolve => { timer = setTimeout(resolve, budgetMs) }),
    ])
  } finally {
    if (timer !== undefined) clearTimeout(timer)
  }
  const out: Record<string, CredentialFacts> = {}
  for (const [ref, read] of selected) {
    if (cache.get(ref) !== read) continue
    const configured = read.described ?? read.resolved?.configured
    if (configured === undefined) continue
    out[ref] = read.resolved?.masked === undefined ? { configured } : { configured, masked: read.resolved.masked }
  }
  return out
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
  budgetMs?: number,
): Promise<Record<string, CredentialFacts>> {
  const described: Record<string, boolean> = {}
  const resolvedFacts: Record<string, CredentialFacts> = {}
  if (credentials === undefined || refs.length === 0) return {}
  // Metadata and preview reads are independent IPC calls. Neither a slow
  // describe nor an earlier reference should hold every remaining row up.
  const reads: Promise<void>[] = refs.map(async ref => {
    try {
      const value = await resolveCredential(credentials, ref)
      const masked = value === undefined ? undefined : maskKeyValue(value)
      resolvedFacts[ref] = masked === undefined || masked.length === 0
        ? { configured: value !== undefined }
        : { configured: true, masked }
    } catch {
      // Unavailable is unknown, never an empty credential.
    }
  })
  if (typeof credentials.describe === 'function') {
    reads.push((async () => {
      try {
        const answer = await credentials.describe?.([...refs])
        const records = isRefusal(answer) ? undefined : describeRecords(answer)
        for (const ref of refs) {
          const info = records?.[ref]
          if (isRecord(info) && typeof info['configured'] === 'boolean') described[ref] = info['configured']
        }
      } catch {
        // Resolved previews can still answer without describe.
      }
    })())
  }
  const settled = Promise.all(reads)
  let timer: ReturnType<typeof setTimeout> | undefined
  try {
    // Only display callers use this bound; mutation preconditions still wait
    // for an authoritative answer and fail closed when the store cannot read.
    if (budgetMs === undefined) await settled
    else await Promise.race([settled, new Promise<void>(resolve => { timer = setTimeout(resolve, budgetMs) })])
  } finally {
    if (timer !== undefined) clearTimeout(timer)
  }
  const out: Record<string, CredentialFacts> = {}
  for (const ref of refs) {
    const fact = resolvedFacts[ref]
    const configured = described[ref] ?? fact?.configured
    if (configured === undefined) continue
    out[ref] = fact?.masked === undefined ? { configured } : { configured, masked: fact.masked }
  }
  return out
}

/**
 * Which references hold a value, as far as the store will say.
 *
 * Kept as the narrow question for callers that only badge the list; the list
 * itself asks `credentialFacts` so one read answers both. A mutation
 * precondition passes a budget: a store that cannot answer within it leaves
 * the reference out of the map, which every mutation reads as "unknown" and
 * refuses — fail closed, but bounded, instead of hanging the manager route.
 */
async function credentialConfigured(
  credentials: CredentialsService | undefined,
  refs: readonly string[],
  budgetMs?: number,
): Promise<Record<string, boolean>> {
  const facts = await credentialFacts(credentials, refs, budgetMs)
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

/** What a masked credential header value reads as in diagnostics responses. */
const SENSITIVE_HEADER_MASK = '[stored, not echoed]'

/** Whether a header name is credential-shaped (auth keys, tokens, cookies). */
function sensitiveHeader(name: string): boolean {
  return /authorization|api-?key|token|secret|cookie|session/i.test(name)
}

/** Copy a headers dict with credential-shaped values masked. */
function maskSensitiveHeaders(headers: Record<string, string>): Record<string, string> {
  const masked: Record<string, string> = {}
  for (const [name, value] of Object.entries(headers)) {
    masked[name] = sensitiveHeader(name) ? SENSITIVE_HEADER_MASK : value
  }
  return masked
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
  // needless work and, on 0.1.7+, can publish revision invalidation; retain
  // the last resolved section until the settings document reports that it
  // moved. The descriptor (resolved value + raw user layer + revision) is
  // what is cached, so every boot-time consumer — the dispatch guard's
  // section, the autofill's fill, and the compat guard's sweep — shares ONE
  // describe per document generation.
  let piDescriptorCache: ReturnType<typeof settings.describe>[number] | undefined
  let piDescriptorCached = false
  const piDescriptor = (required = false): ReturnType<typeof settings.describe>[number] | undefined => {
    if (piDescriptorCached) return piDescriptorCache
    let descriptor: ReturnType<typeof settings.describe>[number] | undefined
    try {
      descriptor = settings.describe().find(entry => entry.ns === PI_NS)
    } catch {
      if (required) throw new HostReadError('the llm-pi-ai settings could not be read')
      // Dispatch guards remain advisory while interactive routes report errors.
      return undefined
    }
    // A missing namespace is expected during boot and must be retried -- so a
    // not-ready read is never cached: the retry must reach the wire again.
    if (descriptor === undefined || !isRecord(descriptor.value)) {
      if (required) throw new HostReadError('the llm-pi-ai settings entry is unavailable')
      return undefined
    }
    piDescriptorCache = descriptor
    piDescriptorCached = true
    return descriptor
  }
  const piSection = (required = false): unknown => piDescriptor(required)?.value
  ctx.on('settings/document-updated', (ns) => {
    if (ns === PI_NS) piDescriptorCached = false
  })

  if (resolved.autofill) {
    /** One autofill pass; resolves false while the pi-ai namespace is unregistered. */
    const autofillOnce = async (): Promise<boolean> => {
      const descriptor = piDescriptor()
      if (descriptor === undefined) return false
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

  // Compat guard (boot sweep): a wire protocol switched after compat switches
  // were written leaves the old keys behind on the route's models, and the
  // kernel then refuses every model that still carries one -- the route serves
  // nothing until the keys are gone. This pass heals what is already stored
  // (and covers headless compositions, which have no browser half); the
  // browser half repairs what a session changes on its idle pass. Also
  // deliberately NEVER on `settings/document-updated`: the issue #7 rule
  // holds here too.
  {
    const logGuardFailure = (error: unknown): void => {
      console.error(`[dsh-model-think-level] compat cleanup failed: ${error instanceof Error ? error.message : String(error)}`)
    }
    const guardTimers = new Set<ReturnType<typeof setTimeout>>()
    ctx.effect(() => () => {
      for (const timer of guardTimers) clearTimeout(timer)
      guardTimers.clear()
    }, 'dsh-model-think-level: compat-guard boot retries')

    /** One sweep; resolves false while the pi-ai namespace is unregistered. */
    const sweepOnce = async (): Promise<boolean> => {
      const descriptor = piDescriptor()
      if (descriptor === undefined) return false
      const user = descriptor.user
      const userProviders = isRecord(user) && isRecord((user as Record<string, unknown>)['providers'])
        ? (user as Record<string, unknown>)['providers'] as Record<string, unknown>
        : undefined
      if (userProviders === undefined) return true
      const patch = buildCompatCleanupPatch(userProviders)
      if (patch === undefined) return true
      try {
        await settings.update(PI_NS, patch, descriptor.revision)
      } catch (error) {
        // A conflict with the boot fill's own write (both read the shared
        // descriptor) retries on the boot backoff — against a FRESH read, so
        // the cache that just lost the race is dropped. Anything else is
        // logged and left to the next boot or the browser half's idle pass.
        logGuardFailure(error)
        piDescriptorCached = false
        return false
      }
      return true
    }
    const bootSweep = (attempt: number): void => {
      void sweepOnce().then((ready) => {
        if (ready || attempt >= resolved.bootRetryDelaysMs.length) return
        const timer = setTimeout(() => {
          guardTimers.delete(timer)
          bootSweep(attempt + 1)
        }, resolved.bootRetryDelaysMs[attempt])
        guardTimers.add(timer)
      }, logGuardFailure)
    }
    bootSweep(0)
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
  // Per-route key metadata (references and manual assignments; never secrets)
  // the fetch seam uses to choose and fail over across keys. Kept as a live
  // snapshot so the hot request path reads memory, not disk.
  const keyScopes: { current: Record<string, readonly RouteKeyScope[]> } = { current: {} }
  // The most recent per-key listing this process obtained, by reference. It is
  // the fallback that keeps a key's models in the catalogue when its next probe
  // fails (a timeout, a 429, a gateway hiccup): without it one slow request
  // silently shrinks a two-key route to one key's models until the next
  // successful pass, which is exactly the "one key's models disappeared"
  // symptom. `mergeKeyListings` reports such keys as `retained`.
  const lastKnownScopes = new Map<string, readonly string[]>()
  // The full listing records behind those ids (display name, limits, effort
  // ladder). A retained id must still resolve to its record when the catalogue
  // is rebuilt, or the merge would drop the very models it just kept.
  const lastKnownRecords = new Map<string, ListedModel[]>()
  // Merged catalogues, shortest-lived first: the harness re-requests `/models`
  // on refresh and on every reconnect, and the probe behind it can take
  // seconds per key. A short window turns those repeats into memory reads
  // without ever serving a catalogue the user cannot refresh.
  const listingCache = new Map<string, { at: number; body: string }>()
  // What each key's last successful listing advertised, persisted across restarts
  // (key-serves.ts). The overlay reads it to order keys by "lists this model" and
  // to guard an explicit model scope; the write is debounced because the hot path
  // that fills it runs inside a `/models` answer.
  const keyServes: { current: KeyServesDocument | undefined } = { current: undefined }
  const servesDocument = (): KeyServesDocument => (keyServes.current ??= readKeyServes(keyServesFilePath()))
  let servesTimer: ReturnType<typeof setTimeout> | undefined
  const flushServes = (): void => {
    servesTimer = undefined
    try {
      writeKeyServes(servesDocument(), keyServesFilePath())
    } catch {
      // Observations are a cache: a failed write costs one round of retries after
      // a restart, never an answer.
    }
  }
  const recordServes = (route: string, ref: string, models: readonly string[]): void => {
    // A listing with no ids asserts "serves nothing"; keep what was known instead.
    // The same rule as `withServes`, applied before the document is touched.
    const live = servesDocument()
    if (models.length === 0) return
    keyServes.current = withServes(live, route, ref, models, Date.now())
    if (servesTimer === undefined) servesTimer = setTimeout(flushServes, 200)
  }
  /** The serving knowledge of one route, or undefined when nothing is known yet. */
  const servingKnowledgeOf = (route: string): ServingKnowledge | undefined => {
    const listed = servesOfRoute(servesDocument(), route)
    return listed.size === 0 ? undefined : { listed }
  }
  /**
   * Forget what a key's listing said. Called when the key's VALUE changes (a
   * different credential is a different upstream account, so the old catalogue
   * describes nothing) and when it is removed. Written through immediately: these
   * are rare, user-initiated operations, and a stale observation outliving a
   * replaced key would send the next request to the wrong account.
   */
  const forgetServes = (route: string, ref: string): void => {
    keyServes.current = withoutServes(servesDocument(), route, ref)
    try {
      writeKeyServes(keyServes.current, keyServesFilePath())
    } catch {
      // Observations are a cache; the in-memory copy is already correct.
    }
  }
  // Raw listing answers for the probe route, by target. Auto-adapt asks for the
  // same route once per model, so this is what turns a whole pass into one
  // wire read; `?refresh=1` (and the TTL above) keeps it from going stale.
  const probeRouteCache = new Map<string, { at: number; data: Record<string, unknown>[] }>()
  const providersOf = (): Record<string, Record<string, unknown>> => {
    const section = piSection()
    return isRecord(section) && isRecord(section['providers'])
      ? (section['providers'] as Record<string, Record<string, unknown>>)
      : {}
  }
  const refreshKeyScopes = (): void => { keyScopes.current = readRouteKeyScopes(providersOf()) }
  // Names and declared model edits do not change the upstream catalogue. A
  // Save followed by adapter refresh can reuse it without remote detection.
  // A half-written document can park `null` on a provider slot; skipped here,
  // or the boot read would throw before the routes even register.
  const catalogueSource = (): string => JSON.stringify(Object.entries(providersOf())
    .filter(([, profile]) => isRecord(profile))
    .map(([route, profile]) => [
      route, profile['api'], profile['baseURL'], profile['apiKeyEnv'], profile['headers'],
    ]).sort(([a], [b]) => String(a).localeCompare(String(b))))
  let catalogueSourceStamp = catalogueSource()
  /**
   * Drop the cached upstream catalogues.
   *
   * With a route: only that route's overlay answers go — its key list (or wire)
   * changed, and every OTHER route's keys and wires did not, so their answers
   * are still true. Clearing everything here made one provider's key edit
   * re-probe every provider on the next `/models`, seconds per key inside an
   * answer the caller is waiting on.
   *
   * Without a route (the settings catalogue itself changed — providers added,
   * re-pointed, re-credentialed): the whole cache, because which routes exist
   * and what they point at is no longer the one it was cached under.
   */
  const invalidateListings = (route?: string): void => {
    if (route === undefined) {
      probeRouteCache.clear()
      listingCache.clear()
      return
    }
    const prefix = `${route}\u0000`
    for (const key of Array.from(listingCache.keys())) {
      if (key.startsWith(prefix)) listingCache.delete(key)
    }
  }

  /**
   * Retire every key-index route the settings document no longer has.
   *
   * The host deletes a provider by removing `providers.<route>` from the
   * settings document; the key index is this plugin's own file and hears
   * nothing about it, so the route's keys, extra endpoints and balance URL
   * would otherwise sit in the file for ever — reappearing wholesale if the
   * user ever re-creates a provider under the same id, and feeding stale
   * endpoints to a route that can no longer serve. The document update that
   * the deletion commits is the sweep's trigger (and boot its second one, for
   * deletions that happened while this plugin was not running).
   *
   * Guards, in the order they matter:
   * - the pi-ai section must be readable: before it registers, "the document
   *   lists no providers" is the boot window, not a mass deletion, and this
   *   must not read it as one (every route would be swept);
   * - a malformed index fails closed — a sweep the user did not ask for never
   *   rewrites metadata it could not parse;
   * - a reference a SURVIVING route still names keeps its secret: two routes
   *   may point at one credential (a shared `apiKeyEnv` seat), and the index
   *   is the only enumeration the store has.
   *
   * The index write is one synchronous read-modify-write per route — atomic
   * against a concurrent key POST the same way every other write here is —
   * and the credential forgets ride behind it fire-and-forget, each within
   * {@link CREDENTIAL_IPC_BUDGET_MS}, so a slow store cannot stall the
   * document-update path this runs on.
   * @returns whether the pi-ai document was readable (the caller's boot
   *   backoff keeps retrying until it is).
   */
  const sweepVanishedRoutes = (): boolean => {
    if (piSection() === undefined) return false
    const live = providersOf()
    const indexFile = keyIndexFilePath()
    let index: ReturnType<typeof readKeyIndex>
    try {
      index = readKeyIndex(indexFile)
    } catch {
      return true
    }
    const stale = new Set<string>()
    for (const route of Object.keys(index.providers)) if (!(route in live)) stale.add(route)
    for (const route of Object.keys(index.endpoints ?? {})) if (!(route in live)) stale.add(route)
    for (const route of Object.keys(index.balances ?? {})) if (!(route in live)) stale.add(route)
    if (stale.size === 0) return true
    const survivors = new Set<string>()
    for (const [route, entries] of Object.entries(index.providers)) {
      if (stale.has(route)) continue
      for (const entry of entries) survivors.add(entry.ref)
    }
    for (const profile of Object.values(live)) {
      if (!isRecord(profile)) continue
      const seat = enabledRefOf(profile)
      if (seat !== undefined) survivors.add(seat)
    }
    const credentials = ctx.get('credentials') as CredentialsService | undefined
    let swept = false
    for (const route of stale) {
      const refs = keyEntriesOf(index, route).map(entry => entry.ref)
      try {
        updateKeyIndex(current => withoutRoute(current, route), indexFile)
      } catch (error) {
        console.error(`[dsh-model-think-level] key route cleanup for "${route}" failed: ${error instanceof Error ? error.message : String(error)}`)
        continue
      }
      swept = true
      for (const ref of refs) {
        forgetServes(route, ref)
        const here = `${route}\u0000${ref}`
        lastKnownScopes.delete(here)
        lastKnownRecords.delete(here)
        if (survivors.has(ref)) continue
        void forgetCredential(credentials, ref, CREDENTIAL_IPC_BUDGET_MS).then(refused => {
          if (refused !== undefined) {
            console.error(`[dsh-model-think-level] credential cleanup for "${ref}" failed: ${refused}`)
          }
        })
      }
      invalidateListings(route)
    }
    if (swept) refreshKeyScopes()
    return true
  }

  // ---- Scope probe: what each key serves, asked on demand ----
  //
  // A relay resolves each key to a different upstream account with its own
  // catalogue, so the models a route declares are not the models every key
  // serves — requests discover the difference the hard way, one refusal per
  // model per key, until someone narrows each key's scope by hand. The probe
  // asks instead: on the key panel's 自动探测 button, every listed key of a
  // MULTI-KEY route is asked for its own listing on the wires it could serve
  // on, the answers are recorded as observations (key-serves.ts), and each
  // key's model scope is checked to the models it actually listed within the
  // set the route declares.
  //
  // The check only claims scopes nobody has claimed: a manual assignment (an
  // entry without the `auto` mark) is never rewritten. Nothing here runs on a
  // timer or a save — the button is the only trigger, so a listing sweep only
  // ever happens when the user asked for one.

  /** In-flight probe runs, by route; the list payload reports this as `probing`. */
  const keyProbeRuns = new Map<string, Promise<void>>()

  /**
   * Probe one route now: resolve every listed key (and the profile's own seat,
   * when the index has never listed it), ask each on the wires a request could
   * take, record the observations, and check the auto-maintained scopes to what
   * each key listed within the route's declared set. A route with fewer than
   * two keys has nothing to divide — one key serves whatever it serves — so
   * the sweep is refused before the wire is touched.
   */
  const probeRouteKeys = async (route: string): Promise<void> => {
    let profile: Record<string, unknown> | undefined
    try {
      profile = providerProfileOf(piSection(true), route)
    } catch {
      return
    }
    if (profile === undefined) return
    const api = normalizeKeyProtocol(profile['api'])
    const baseURL = typeof profile['baseURL'] === 'string' ? profile['baseURL'].trim() : ''
    if (api === undefined || !LISTABLE_PROTOCOLS.has(api) || baseURL.length === 0) return
    let document: ReturnType<typeof readKeyIndex>
    try {
      document = readKeyIndex(keyIndexFilePath())
    } catch {
      // A malformed index is the key route's complaint to make, not the probe's.
      return
    }
    const endpoints = document.endpoints?.[route]
    const listed = keyEntriesOf(document, route)
    const seat = enabledRefOf(profile)
    const keys: { ref: string; entry: KeyIndexEntry | undefined }[] = listed.map(entry => ({ ref: entry.ref, entry }))
    if (seat !== undefined && !listed.some(entry => entry.ref === seat)) keys.push({ ref: seat, entry: undefined })
    // One key serves whatever it serves: the scope check exists to divide a
    // route's models across keys, and a single-key route has no division.
    if (keys.length < 2) return
    const credentials = ctx.get('credentials') as CredentialsService | undefined
    const values = await Promise.all(keys.map(async key => {
      try {
        return await resolveCredential(credentials, key.ref)
      } catch {
        return undefined
      }
    }))
    const askable = keys.flatMap((key, index) => {
      const value = values[index]
      return value === undefined || value.length === 0 ? [] : [{ ...key, value }]
    })
    if (askable.length === 0) return
    // Background work nobody waits on: each listing gets the FULL probe budget
    // (the catalogue overlay caps at LISTING_PROBE_BUDGET_MS because it runs
    // inside the host's own /models answer; this probe has no such caller, so
    // a slow gateway just takes longer to be observed, never blocks anyone).
    const timeoutMs = resolved.probeTimeoutMs
    const send = headerOverlayBypass()
    const targetsOf = (entry: KeyIndexEntry | undefined): ProbeTarget[] =>
      entry?.protocol !== undefined
        ? listingTargetsOf({ protocol: entry.protocol, endpoint: endpoints?.[endpointFamilyOf(entry.protocol)] }, api, baseURL)
        : listingTargetsOf({ endpoints }, api, baseURL)
    const served = new Map<string, readonly string[]>()
    await collectKeyListings({
      keys: askable,
      refOf: key => key.ref,
      probe: async key => {
        // A key's targets are independent listings; they run together and fold
        // in target order, exactly as the catalogue overlay folds them.
        const listings = await Promise.all(targetsOf(key.entry).map(target => probeListing({
          baseURL: target.baseURL,
          api: target.api,
          apiKey: key.value,
          headers: profile?.['headers'],
          timeoutMs,
          send,
        })))
        const ids: string[] = []
        for (const listing of listings) {
          if (listing === undefined) continue
          for (const model of listing) {
            if (!ids.includes(model.id)) ids.push(model.id)
          }
        }
        if (ids.length === 0) return { ref: key.ref, models: undefined }
        served.set(key.ref, ids)
        // The observations are the routing half of the answer: a later listing
        // keeps them, and the pool prefers a key that listed the model.
        lastKnownScopes.set(`${route}\u0000${key.ref}`, ids)
        recordServes(route, key.ref, ids)
        return { ref: key.ref, models: ids }
      },
    })
    if (served.size === 0) return
    // The declared set is the universe a scope may name — the models already
    // added to the provider, never its whole catalogue. Without it there is
    // nothing to check the observations against.
    const declared = Array.isArray(profile['models'])
      ? profile['models'].filter(isRecord).map(model => typeof model['id'] === 'string' ? model['id'].trim() : '').filter(Boolean)
      : []
    if (declared.length === 0) return
    // Re-read before writing: keys may have been added or replaced while the
    // listings were on the wire.
    let next = readKeyIndex(keyIndexFilePath())
    let mutated = false
    for (const [ref, ids] of served) {
      const entry = keyEntriesOf(next, route).find(candidate => candidate.ref === ref)
      // The unlisted seat has no entry to scope; it keeps its catch-all and
      // its recorded observations.
      if (entry === undefined) continue
      // A manual assignment is a claim: the user chose what this key serves,
      // and the probe never rewrites it.
      if (entry.models !== undefined && entry.auto !== true) continue
      const target = declared.filter(id => ids.includes(id))
      // A key that serves every declared model keeps the catch-all it already
      // reads as — the assignment that keeps serving models added later.
      const scope = target.length === declared.length ? undefined : target
      const unchanged = scope === undefined
        ? entry.models === undefined
        : entry.models !== undefined && entry.models.length === scope.length && scope.every(id => entry.models?.includes(id))
      if (unchanged) continue
      next = withKeyAutoScope(next, route, ref, scope)
      mutated = true
    }
    if (!mutated) return
    try {
      writeKeyIndex(next, keyIndexFilePath())
    } catch {
      // A failed write costs one round of re-probing after the next save.
      return
    }
    refreshKeyScopes()
  }

  /** Probe one route, queueing behind the run already in flight, if any. */
  const runKeyProbe = (route: string): Promise<void> => {
    const previous = keyProbeRuns.get(route) ?? Promise.resolve()
    const run = previous
      .then(() => probeRouteKeys(route))
      .catch(() => {
        // A probe never surfaces: the panel's next button press is the retry.
      })
      .finally(() => {
        if (keyProbeRuns.get(route) === run) keyProbeRuns.delete(route)
      })
    keyProbeRuns.set(route, run)
    return run
  }
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
      // A provider deleted on the Models page is a removal from THIS document,
      // and the key index is plugin state that would otherwise keep the route
      // for ever: drop its keys, endpoints, balance URL and orphaned
      // credentials now that the document is authoritative about what exists.
      sweepVanishedRoutes()
      // The image side rides the same events: the config file's derived
      // models[] re-derives from this document (config page, MCP, command).
      syncImageConfigNow()
      const source = catalogueSource()
      if (source !== catalogueSourceStamp) {
        catalogueSourceStamp = source
        invalidateListings()
      }
    }
  })
  // Boot covers the deletions that happened while this plugin was not
  // running (disable, HMR, a crash): the same sweep, retried on the shared
  // backoff until the pi-ai document is readable. A settled index costs one
  // file read and one comparison.
  {
    const sweepTimers = new Set<ReturnType<typeof setTimeout>>()
    ctx.effect(() => () => {
      for (const timer of sweepTimers) clearTimeout(timer)
      sweepTimers.clear()
    }, 'dsh-model-think-level: route-sweep boot retries')
    const bootRouteSweep = (attempt: number): void => {
      void Promise.resolve().then(() => sweepVanishedRoutes()).then((ready) => {
        if (ready || attempt >= resolved.bootRetryDelaysMs.length) return
        const timer = setTimeout(() => {
          sweepTimers.delete(timer)
          bootRouteSweep(attempt + 1)
        }, resolved.bootRetryDelaysMs[attempt])
        sweepTimers.add(timer)
      }, (error: unknown) => {
        console.error(`[dsh-model-think-level] route sweep failed: ${error instanceof Error ? error.message : String(error)}`)
      })
    }
    bootRouteSweep(0)
  }
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
      servingKnowledgeOf(route),
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

    // Which keys a catalogue was merged from decides what the cache may answer:
    // adding, removing or reordering a key changes the answer, so it changes
    // the key too. A hit skips the wire entirely — the same refresh (and the
    // many Auto-adapt probes) then costs nothing.
    const cacheKey = `${route}\u0000${keys.map(key => key.ref).join(',')}`
    const cached = listingCache.get(cacheKey)
    if (cached !== undefined && Date.now() - cached.at < LISTING_CACHE_MS) {
      return new Response(cached.body, { status: 200, headers: { 'content-type': 'application/json' } })
    }

    // Shares the probe-and-merge the panel and the `discover` operation use, so
    // the catalogue the host's own discovery sees is the census the plugin would
    // report: bounded concurrency across keys, and one key's refusal never drops
    // the others — a key that cannot answer keeps the models it was last seen
    // serving (`lastKnownScopes`), so one slow request cannot shrink a two-key
    // route to one key's models until the next pass.
    // A listing record carries more than its id (display name, limits), so the
    // full records are kept per key and stitched back in merged order below.
    const recordsByRef = new Map<string, ListedModel[]>()
    // One budget for the whole catalogue, not one per target: this runs INSIDE
    // the host's own `/models` GET, so the caller is waiting on it.
    const probeTimeoutMs = Math.min(resolved.probeTimeoutMs, LISTING_PROBE_BUDGET_MS)
    // The memory is stored per ROUTE and reference (two routes may name the same
    // `apiKeyEnv`), while the merge speaks one reference space. Narrow it here.
    const here = (ref: string): string => `${route}\u0000${ref}`
    const knownHere = new Map<string, readonly string[]>()
    for (const key of keys) {
      const remembered = lastKnownScopes.get(here(key.ref))
      if (remembered !== undefined) knownHere.set(key.ref, remembered)
    }
    const { results } = await collectKeyListings({
      keys,
      refOf: key => key.ref,
      lastKnown: knownHere,
      probe: async key => {
        // A pinned key is asked on its own wire; an automatic key is asked on
        // every wire it could dispatch on — the route's wire, plus each
        // cross-family address it carries — so the catalogue covers the models
        // of all of them. The same union the post-save scope probe records.
        const distinct = listingTargetsOf(key, api, baseURL)
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
        // The targets of ONE key are independent listings: asking them one after
        // another made a key with two addresses cost two timeouts in series
        // while the host's `/models` GET waited. They run together, and the
        // answers are folded in target order so the catalogue stays stable.
        const answered = await Promise.all(distinct.map(target => probeListing({
          baseURL: target.baseURL,
          api: target.api,
          apiKey: key.value,
          headers: profile?.['headers'],
          timeoutMs: probeTimeoutMs,
          send: sendListing,
        })))
        const records: ListedModel[] = []
        for (const listing of answered) {
          if (listing === undefined) continue
          for (const model of listing) {
            if (records.some(existing => existing.id === model.id)) continue
            records.push(model)
          }
        }
        if (records.length === 0) return { ref: key.ref, models: undefined }
        recordsByRef.set(key.ref, records)
        const ids = records.map(model => model.id)
        // Remember what this key serves, so a later failed probe retains it.
        lastKnownScopes.set(here(key.ref), ids)
        lastKnownRecords.set(here(key.ref), records)
        // And record it across restarts: routing prefers the key whose group
        // listed a model over one that did not (key-serves.ts).
        recordServes(route, key.ref, ids)
        return {
          ref: key.ref,
          models: ids,
        }
      },
    })
    const records = new Map<string, ListedModel>()
    for (const result of results) {
      // A key that could not answer contributes the records it was last seen
      // serving: the merge kept its ids, so their full records must be kept too.
      const owned = recordsByRef.get(result.ref) ?? lastKnownRecords.get(here(result.ref)) ?? []
      for (const model of owned) {
        if (!records.has(model.id)) records.set(model.id, model)
      }
    }
    const census = servesOfRoute(servesDocument(), route)
    // Only a COMPLETE census may hide a model: every key answered its listing, so
    // a model none of them advertises is one no key's upstream group carries —
    // offering it would offer a request the provider answers with "not supported
    // by any configured account in this group" on every key. A key that could not
    // be listed is unknown, not empty: with one unknown, nothing is hidden.
    const censusComplete = keys.length > 0 && keys.every(key => census.has(key.ref))
    const models = mergeKeyListings(results, knownHere).ids
      .filter(id => !censusComplete || [...census.values()].some(served => served.includes(id)))
      .map(id => records.get(id))
      .filter((model): model is ListedModel => model !== undefined)
    if (models.length === 0) return undefined
    const body = JSON.stringify({ data: models })
    listingCache.set(cacheKey, { at: Date.now(), body })
    return new Response(body, {
      status: 200,
      headers: { 'content-type': 'application/json' },
    })
  }
  const overlay = installHeaderOverlay(overlaySource)
  ctx.effect(() => () => { overlay.dispose() }, 'dsh-model-think-level: fetch header overlay')

  // ---- Image generation (生图): config sync, native tool, `/生图` command ----

  // One-time migration: the retired stdio MCP server's patch entry must go,
  // or every boot would spawn a `lib/image-mcp.mjs` that no longer exists and
  // the profile would keep a duplicate `mcp__dsh-image__generate_image` beside
  // the native tool. Best-effort: a read-only file only costs the cleanup, and
  // the next boot retries.
  try {
    const removed = removeLegacyImageMcpPatch()
    if (removed !== undefined) {
      console.warn(`[dsh-model-think-level] 已自动移除旧版生图 MCP 的补丁条目（${removed}）——重启 DSH 后完全生效`)
    }
  } catch (error) {
    console.warn(`[dsh-model-think-level] 旧版生图 MCP 补丁条目自动移除失败（可手动删除标记块）：${error instanceof Error ? error.message : String(error)}`)
  }
  //
  // There is NO wire interception any more: a chat model asks for a picture by
  // CALLING the MCP tool (`mcp__dsh-image__generate_image`), so image models
  // stay out of the composer's switcher and nothing rewrites an outbound
  // chat/completions request.

  /**
   * Re-derive the config file's `models[]` from the settings document, keeping
   * every stored override. Runs on boot and on every pi-ai document update, so
   * the config page, the MCP server and the command all read one snapshot.
   * Skipped while llm-pi-ai has not registered (an empty providers
   * map at boot must not wipe a config the previous run wrote).
   */
  const syncImageConfigNow = (): void => {
    try {
      if (piSection() === undefined) return
      const providers = providersOf()
      // An EMPTY providers map is not the user deleting their models: it is what
      // the document looks like before it is readable (boot, HMR, a reload that
      // re-registers the section before its value lands). Syncing it would write
      // models: [] and stamp defaultModel to null, and no later pass recovers the
      // pick. Only a populated document may prune rows.
      if (Object.keys(providers).length === 0) return
      updateImageConfig(document => syncImageConfig(document, providers))
    } catch {
      // The config file is best-effort state: a failed sync leaves the last
      // snapshot on disk, which the next successful sync replaces wholesale.
    }
  }
  syncImageConfigNow()

  /** The generation deps the host serves the core with (credentials via the store). */
  const imageGenerateDeps: GenerateDeps = {
    config: () => readImageConfig(),
    resolveKey: async ref => {
      try {
        return await resolveCredential(ctx.get('credentials') as CredentialsService | undefined, ref)
      } catch {
        return undefined
      }
    },
    // Beneath the wrapper: the images call composes its own auth from the
    // model row's reference, exactly like the listing probe above.
    send: headerOverlayBypass(),
    persistLastGood: (modelId, params) => {
      try {
        updateImageConfig(document => ({
          ...document,
          models: document.models.map(model => {
            if (model.id !== modelId) return model
            if (params === null) {
              return { ...model, endpoint: { ...model.endpoint, status: 'unsupported' as const } }
            }
            return { ...model, lastGoodParams: params }
          }),
        }))
      } catch {
        // A diagnostics write must never fail the generation that earned it.
      }
    },
  }

  // The `/生图` host command. Registered only when the context carries a
  // commands service (a headless composition may not) — cordis THROWS on an
  // undeclared service read, so the lookup is fenced.
  let commandsService: CommandsServiceLike | undefined
  try {
    commandsService = (ctx as unknown as { commands?: CommandsServiceLike }).commands
  } catch {
    commandsService = undefined
  }
  registerImagegenCommand(
    commandsService,
    {
      modelIds: () => readImageConfig().models.map(model => model.id),
      generate: generateImage,
      generateDeps: imageGenerateDeps,
    },
  )

  // The native `generate_image` tool: the conversation model's primary entry.
  // Deferred on purpose — a host without the tools or attachments service
  // (headless, sdk) keeps every other feature and simply gets no image tool;
  // a hard `inject` entry would refuse to apply the whole plugin there.
  // The registration state feeds the client's keyed image-card registration,
  // which reads the name back over the config route.
  const imageToolState: { name: string | undefined; error: string | undefined } = { name: undefined, error: undefined }
  ctx.inject(['tools', 'attachments'], (toolCtx: Context) => {
    toolCtx.effect(
      () => {
        // A throwing effect is logged and swallowed by the host, leaving the
        // pane with a bare "未注册" and no reason. Record the message as well:
        // the config route reports it, so a schema/host-version mismatch is
        // diagnosable from the UI instead of only from a startup log line.
        let registered: { readonly name: string; readonly dispose: () => void }
        try {
          registered = registerGenerateImageTool(toolCtx, {
            generateDeps: imageGenerateDeps,
            attachments: (toolCtx as unknown as { attachments: unknown }).attachments as Parameters<typeof registerGenerateImageTool>[1]['attachments'],
            readConfig: () => readImageConfig(),
          })
        } catch (error) {
          imageToolState.name = undefined
          imageToolState.error = error instanceof Error ? error.message : String(error)
          console.warn(`[dsh-model-think-level] 内建生图工具注册失败（诊断路由 ${IMAGE_CONFIG_PATH} 的 tool.error 会带回这条原因）：${imageToolState.error}`)
          throw error
        }
        const { name, dispose } = registered
        imageToolState.name = name
        imageToolState.error = undefined
        return () => {
          imageToolState.name = undefined
          dispose()
        }
      },
      'dsh-model-think-level: generate_image tool',
    )
    // A few lines of live defaults per model request, so the tool is called
    // with omitted params instead of guessed ones (the dsh-image-gen
    // precedent). Optional: hosts without the system-prompt service boot
    // unchanged and the tool description alone still guides the model.
    ctx.inject(['systemPrompt'], (promptCtx: Context) => {
      promptCtx.effect(
        () => (promptCtx as unknown as { systemPrompt: { context(contribution: { name: string; order: number; text: () => string }): () => void } }).systemPrompt.context({
          name: 'dsh-model-think-level:image-tool',
          order: 61,
          text: () => imageToolHint(readImageConfig()),
        }),
        'dsh-model-think-level: image tool hint',
      )
    })
  })


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
  // The fingerprint route dispatches through the same service, discovered the
  // same way: whichever of the two shapes supplied it, and re-read at request
  // time so a late registration is picked up.
  let fingerprintDispatch: LlmDispatchLike | undefined = availableLlm as LlmDispatchLike | undefined
  if (availableLlm === undefined) {
    // Direct callers and older hosts may omit llm from the module-level inject;
    // keep the deferred path as a compatibility fallback for those contexts.
    ctx.inject(['llm'], (llmCtx) => {
      const llm = (llmCtx as unknown as { llm?: unknown }).llm
      if (llm !== undefined) {
        fingerprintDispatch = llm as LlmDispatchLike
        installPiAiBridge(llm)
      }
    })
  } else {
    installPiAiBridge(availableLlm)
  }

  // Read once: what sits on disk changes only when the user installs or patches
  // something, and a restart is the honest moment to re-read it.
  const environmentConflicts: HeaderConflictReport = detectHeaderConflicts()

  // Serializes fingerprint store writes (POST and DELETE) so two clicks cannot
  // interleave a read-modify-write. Reads stay unqueued, exactly like
  // `keyMutationTail` below.
  let fingerprintMutationTail = Promise.resolve()

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
            // One listing read answers a whole Auto-adapt pass (it asks per
            // model) and every key-panel probe of the same route inside the
            // window. The identity of a read is the target plus the credential
            // reference it was composed from, so re-pointing a route or swapping
            // its `apiKeyEnv` never serves the previous answer; `?refresh=1`
            // forces the wire instead of waiting out the window.
            const listingKey = `${listingURL}\u0000${apiKeyEnv ?? ''}`
            const cacheable = url.searchParams.get('refresh') !== '1'
            const remembered = cacheable ? probeRouteCache.get(listingKey) : undefined
            if (remembered !== undefined && Date.now() - remembered.at < LISTING_CACHE_MS) {
              sendJson(res, 200, { ok: true, url: displayUrl(listingURL), data: remembered.data })
              return
            }
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
                // This probe waits on an interactive pass (Auto-adapt asks for
                // it per model), so it gets the catalogue budget rather than the
                // diagnostic one: a gateway that cannot list within it yields no
                // endpoint evidence, and the pass moves on to the knowledge base.
                signal: AbortSignal.timeout(Math.min(resolved.probeTimeoutMs, LISTING_PROBE_BUDGET_MS)),
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
              probeRouteCache.set(listingKey, { at: Date.now(), data: entries })
              sendJson(res, 200, { ok: true, url: displayUrl(listingURL), data: entries })
            } catch (error) {
              // undici's own failure texts quote the original URL verbatim
              // ("Request cannot be constructed from a URL that includes
              // credentials: http://user:sekrit@…") — the message loses its
              // secrets before it reaches the response body.
              sendJson(res, 502, {
                ok: false,
                error: `could not reach ${displayUrl(listingURL)}: ${redactUrlSecrets(error instanceof Error ? error.message : String(error))}`,
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
            if (req.method !== 'GET') {
              sendJson(res, 405, { ok: false, error: 'method not allowed' })
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
              // The endpoint pair a provider card paints, answered from the index
              // file alone.
              //
              // The page hydrates this once per card per second (see the client's
              // `readEndpoints`) just to show two URLs. It used to pull the whole
              // key list for it -- a settings read plus one credential resolve per
              // key, on a service that serialises -- so an opened card's own list
              // queued behind dozens of those and the panel showed its loader for
              // seconds. This branch touches no settings and no credential.
              if (req.method === 'GET' && url.searchParams.get('op') === 'endpoints') {
                if (route.length === 0) {
                  sendJson(res, 400, { ok: false, error: 'a route is required' })
                  return
                }
                const endpoints = readKeyIndex(keyIndexFilePath()).endpoints?.[route]
                sendJson(res, 200, {
                  ok: true,
                  route,
                  endpoints: {
                    openai: endpoints?.openai ?? null,
                    anthropic: endpoints?.anthropic ?? null,
                  },
                })
                return
              }
              if (req.method === 'GET' && url.searchParams.get('op') === 'balance') {
                if (route.length === 0) {
                  sendJson(res, 400, { ok: false, error: 'a route is required' })
                  return
                }
                const endpoint = readKeyIndex(keyIndexFilePath()).balances?.[route]
                sendJson(res, 200, { ok: true, route, endpoint: endpoint ?? null })
                return
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
              /**
               * The profile a READ renders, from the section the guard and probe
               * routes already cache.
               *
               * This list is repainted constantly -- one GET per provider card
               * per second, plus one per invalidation -- and every one of them
               * used to call `settings.describe()`, a call the settings service
               * serialises across the whole host: that queue, not the list
               * itself, is what made an opened card wait seconds for its first
               * answer. The cache is dropped on `settings/document-updated`, so a
               * write from anywhere (this route, the official card's Save, the
               * autofill pass) still reaches the next read. Writes keep their own
               * fresh read below: a precondition decided from a snapshot is how a
               * route moves a key it no longer owns.
               */
              const readProfile = (): Record<string, unknown> | undefined =>
                providerProfileOf(piSection(true), route)
              /** The profile this request may fence a write on. */
              const writeProfile = (): Record<string, unknown> | undefined =>
                providerProfileOf(entryOf()?.value, route)
              const profileOf = (): Record<string, unknown> | undefined =>
                req.method === 'POST' ? writeProfile() : readProfile()
              if (route.length === 0 || profileOf() === undefined) {
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
              const payload = async (): Promise<Record<string, unknown>> => {
                // One disk read answers the entries, the endpoints and (with the
                // section) the seat context below; re-reading the file per field
                // would triple the I/O of every list request.
                const document = readKeyIndex(indexFile)
                // Reads render from the cached section; a POST renders what it
                // just wrote, so it reads the document again (see `profileOf`).
                const profile = profileOf()
                const seat = enabledRefOf(profile)
                const routeModels = Array.isArray(profile?.['models'])
                  ? profile['models'].filter(isRecord).map(model => typeof model['id'] === 'string' ? model['id'].trim() : '').filter(Boolean)
                  : []
                const declaredModels = new Set(routeModels)
                const listed = keyEntriesOf(document, route)
                const refs = listed.map(entry => entry.ref)
                // The seat (the reference the adapter itself resolves) joins the
                // list when it can answer for itself: the index lists it, or the
                // store holds a value for it — the adapter still needs that one.
                // A profile can also name a reference nothing was ever stored
                // under (`apiKeyEnv: MAGPIE_GATEWAY_KEY` written by a shipped
                // patch, with no such variable in the environment). That is a
                // route waiting for its first key, not a key: painting it as a
                // "not stored" row put a phantom beside the official warning
                // that already says the variable is missing. Only a store that
                // positively answers "nothing, and no value to read" hides it —
                // a store that cannot answer is unknown, not empty.
                const probed = seat !== undefined && !refs.includes(seat) ? [...refs, seat] : refs
                const facts = await displayCredentialFacts(credentials, probed, 250)
                if (seat !== undefined && !refs.includes(seat) && !holdsNothing(facts[seat])) refs.push(seat)
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
                  if (stored?.models !== undefined) view.models = stored.models.filter(id => declaredModels.has(id))
                  // What the key's own listing said, when it ever answered one:
                  // the observed half of the routing decision, shown so the user
                  // can adopt it as a scope with one click. Filtered to the models
                  // this route added (the scope universe) and omitted when that
                  // leaves nothing, so an empty list can never read as "serves
                  // nothing".
                  const observed = servesOfRoute(servesDocument(), route).get(ref)?.filter(id => declaredModels.has(id))
                  if (observed !== undefined && observed.length > 0) {
                    ;(view as { observed?: readonly string[] }).observed = observed
                  }
                  if (stored?.protocol !== undefined) (view as { protocol?: RouteProtocol }).protocol = stored.protocol
                  // The cooldown memory rides the view even though no row paints
                  // a badge from it any more: the routing pool is the state's
                  // source of truth, and the field carries what it sees.
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
                // An in-flight scope probe rides along, so an open panel can
                // follow the assignments the probe writes — the button starts
                // it, and the assignments are the only thing that shows up.
                const probing = keyProbeRuns.has(route)
                return {
                  ok: true,
                  route,
                  entries,
                  models: routeModels,
                  ...(probing ? { probing: true } : {}),
                  endpoints: {
                    openai: endpoints?.openai ?? null,
                    anthropic: endpoints?.anthropic ?? null,
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
              let addedRef: string | undefined
              // Validate each operation before its first write and compensate
              // later failures across the independent settings and key stores.
              const refuse = (error: string): void => sendJson(res, 400, { ok: false, error })

              if (op === 'add') {
                if (!isLegalKeyValue(value)) {
                  refuse('a key must be printable ASCII without spaces')
                  return
                }
                const activeSeat = enabledNow()
                // The official create form has already stored its first key.
                // Reuse that exact value during draft drain instead of minting
                // a duplicate credential and losing the user's first-key label.
                if (activeSeat !== undefined && await resolveCredential(credentials, activeSeat) === value) {
                  updateKeyIndex(document => withKeyEntry(document, route, activeSeat, alias), indexFile)
                  refreshKeyScopes()
                  releaseMutation?.()
                  releaseMutation = undefined
                  sendJson(res, 200, { ...await payload(), addedRef: activeSeat })
                  return
                }
                const taken = keyEntriesOf(readKeyIndex(indexFile), route).map(candidate => candidate.ref)
                // The reference in use need not be listed — the official card
                // and a hand-edited profile both write one this plugin has never
                // seen — and minting it again would overwrite the very key the
                // provider is running on.
                const active = enabledNow()
                if (active !== undefined && !taken.includes(active)) taken.push(active)
                // A reference this route already lists may hold this very value
                // under a name the seat does not use. The create card is the
                // ordinary way there: the official form stores its key under the
                // profile's `apiKeyEnv`, then this drain adds the SAME secret
                // again, and without this check the second copy became a second
                // row with an identical mask — two keys that are one. Reusing the
                // holder keeps the list honest; the label the user typed rides
                // onto that row (it is the same secret, so it is the same key).
                // Only a reference whose readable value EQUALS the incoming one
                // qualifies; a store that cannot be read never matches.
                for (const ref of taken) {
                  let held: string | undefined
                  try {
                    held = await resolveCredential(credentials, ref)
                  } catch {
                    continue
                  }
                  if (held !== value) continue
                  // One write: an unlisted holder joins the list, a listed one
                  // keeps its own scope and protocol pin (the label is the only
                  // thing an add carries for it).
                  updateKeyIndex(document => withKeyEntry(document, route, ref, alias), indexFile)
                  // The profile may still name an empty reference (the shipped
                  // patch's `apiKeyEnv`, or a seat that lost its value). The key
                  // the user just added is this one, so it takes the seat;
                  // otherwise the official card keeps warning about the old name
                  // while a working key sits right below it.
                  if (active !== ref) {
                    let seatEmpty = false
                    if (active !== undefined) {
                      try {
                        seatEmpty = holdsNothing((await credentialFacts(credentials, [active], CREDENTIAL_IPC_BUDGET_MS))[active])
                      } catch {
                        seatEmpty = false
                      }
                    }
                    if (active === undefined || seatEmpty) {
                      const failed = await setEnabledKey(ref)
                      if (failed !== undefined) throw new Error(failed)
                    }
                  }
                  refreshKeyScopes()
                  releaseMutation?.()
                  releaseMutation = undefined
                  sendJson(res, 200, { ...await payload(), addedRef: ref })
                  return
                }
                // A listed row the store positively holds NOTHING under is an
                // empty slot, not a taken name. Filling it keeps the reference
                // the profile — and any other computer that synced that
                // profile — already uses; minting `_3` beside an empty `_2` is
                // what made a re-fill after a sync drift away from the name the
                // seat resolves and leave a "not stored" row behind.
                //
                // The seat comes first (storing there needs no re-point at
                // all), then the remaining rows in the order the page shows
                // them. Only a store that answered "nothing, and no value to
                // read" qualifies — an unreadable store is unknown, and this
                // path must never overwrite a key it could not see. The
                // readable face gets the final word, because metadata can
                // outlive the value it describes.
                const listedRefs = keyEntriesOf(readKeyIndex(indexFile), route).map(entry => entry.ref)
                const slotCandidates = active !== undefined && listedRefs.includes(active)
                  ? [active, ...listedRefs.filter(candidate => candidate !== active)]
                  : listedRefs
                const slotFacts = slotCandidates.length > 0
                  ? await credentialFacts(credentials, slotCandidates, CREDENTIAL_IPC_BUDGET_MS)
                  : {}
                const emptySlot = slotCandidates.find(candidate => holdsNothing(slotFacts[candidate]))
                let created = emptySlot !== undefined
                  && await resolveCredential(credentials, emptySlot) === undefined
                  ? emptySlot
                  : undefined
                if (created === undefined) {
                  created = nextKeyRef(route, taken)
                  // Metadata cannot enumerate the credential store. Check each
                  // candidate against both read faces before writing a new value.
                  for (;;) {
                    const facts = await credentialFacts(credentials, [created], CREDENTIAL_IPC_BUDGET_MS)
                    const configured = facts[created]?.configured
                    if (configured === undefined) throw new HostReadError('the credential store could not confirm a free reference')
                    if (!configured && await resolveCredential(credentials, created) === undefined) break
                    taken.push(created)
                    created = nextKeyRef(route, taken)
                  }
                }
                // A profile can name a reference the store holds NOTHING under:
                // a shipped patch writes `apiKeyEnv: MAGPIE_GATEWAY_KEY` ahead of
                // any key, and the official card then warns that the variable is
                // missing. Such a route has no working key at all — the same
                // state as a profile naming no reference — so this add takes the
                // seat, or the warning would outlive the key that fixed it and
                // the adapter would keep resolving an empty name. Only a store
                // that POSITIVELY holds nothing hands the seat over: an
                // unreadable store is unknown, and re-pointing a working key on
                // a bad read is the one mistake this must not make.
                const seatBefore = active
                const seatIsEmpty = seatBefore !== undefined
                  && seatBefore !== created
                  && holdsNothing((await credentialFacts(credentials, [seatBefore], CREDENTIAL_IPC_BUDGET_MS))[seatBefore])
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
                  if (seatBefore === undefined || seatIsEmpty) {
                    const failed = await setEnabledKey(created)
                    if (failed !== undefined) throw new Error(failed)
                  }
                } catch (error) {
                  const rollback = await forgetCredential(credentials, created, CREDENTIAL_IPC_BUDGET_MS)
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
                addedRef = created
              } else if (op === 'scope') {
                // Store the manual assignment from the provider's added models.
                // Omission clears it to catch-all; [] is an explicit empty
                // assignment. Anything else that is not an array — a comma
                // string above all — is refused: silently widening a narrowed
                // key to catch-all is the one direction a typo must not go.
                if (isRecord(body) && body['models'] !== undefined && !Array.isArray(body['models'])) {
                  refuse('model assignments must be an array of model ids')
                  return
                }
                const document = readKeyIndex(indexFile)
                const known = ref !== undefined && (hasKeyEntry(document, route, ref) || ref === enabledNow())
                if (ref === undefined || !known) {
                  refuse('that key is not listed for this provider')
                  return
                }
                const scope = isRecord(body) ? normalizeKeyModels(body['models']) : undefined
                const profile = providerProfileOf(entryOf()?.value, route)
                const declared = new Set(Array.isArray(profile?.['models'])
                  ? profile['models'].filter(isRecord).map(model => model['id']) : [])
                if (scope?.some(id => !declared.has(id))) {
                  refuse('model assignments must use models already added to this provider')
                  return
                }
                const target = ref
                updateKeyIndex(
                  document2 =>
                    withKeyModels(
                      hasKeyEntry(document2, route, target) ? document2 : withKeyEntry(document2, route, target),
                      route, target, scope,
                    ),
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
                    withKeyProtocol(
                      hasKeyEntry(document2, route, target) ? document2 : withKeyEntry(document2, route, target),
                      route, target, protocol,
                    ),
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
                // ChatGPT/OpenAI wire and the Anthropic wire.
                // A key that pins a protocol uses the matching URL; each is
                // optional and an empty value clears that side.
                const endpoints = isRecord(body)
                  ? normalizeRouteEndpoints({
                    openai: body['openai'],
                    anthropic: body['anthropic'],
                  })
                  : undefined
                updateKeyIndex(document => withRouteEndpoints(document, route, endpoints), indexFile)
              } else if (op === 'balance') {
                // The one URL a provider's balance is read from. It is display
                // only and independent of the protocol-family addresses: an
                // empty value clears it, and a route without one shows no
                // balance on the Models page.
                const endpoint = isRecord(body) && typeof body['endpoint'] === 'string'
                  ? body['endpoint']
                  : ''
                updateKeyIndex(document => withRouteBalance(document, route, endpoint), indexFile)
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
                forgetServes(route, ref)
                // A new value is a new upstream account: whatever the old one
                // refused says nothing about this one.
                keyRest.clear(restKeyOf(route, ref))
              } else if (op === 'remove') {
                const document = readKeyIndex(indexFile)
                if (ref === undefined || (!hasKeyEntry(document, route, ref) && ref !== enabledNow())) {
                  refuse('that key is not listed for this provider')
                  return
                }
                const configured = (await credentialConfigured(credentials, [ref], CREDENTIAL_IPC_BUDGET_MS))[ref]
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
                  forgetServes(route, ref)
                  invalidateCredentialDisplay(credentials, ref)
                  if (configured) {
                    const refused = await forgetCredential(credentials, ref, CREDENTIAL_IPC_BUDGET_MS)
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
              } else if (op === 'probe') {
                // The key panel's 自动探测 button: ask every listed key of a
                // multi-key route what its own listing advertises, and check
                // the probe-maintained scopes to the models each key actually
                // serves within the route's declared set. A single-key route
                // has nothing to divide — one key serves whatever it serves —
                // so the refusal says so instead of running a sweep that can
                // only confirm what the row already reads.
                const listed = keyEntriesOf(readKeyIndex(indexFile), route)
                const seat = enabledNow()
                const distinct = new Set(listed.map(entry => entry.ref))
                if (seat !== undefined) distinct.add(seat)
                if (distinct.size < 2) {
                  refuse('a scope probe needs a second key; a single key serves whatever it serves')
                  return
                }
                // Fire and forget: the probe answers through the list's
                // `probing` flag and the scope writes it lands, never through
                // this request, which returns as soon as the run is queued.
                void runKeyProbe(route)
              } else {
                refuse(`unknown key operation "${op}"`)
                return
              }
              // The key index is this plugin's own file, so a write to it fires no
              // settings event. Refresh the live routing snapshot here or a key
              // added or scoped just now would not sign a request until some
              // unrelated settings change happened to refresh it.
              refreshKeyScopes()
              if (['add', 'remove', 'value', 'protocol', 'endpoints', 'enable'].includes(op)) {
                invalidateListings(route)
              }
              // The transaction is committed. Slow display-only credential reads
              // must not hold the next unrelated mutation in the global queue.
              releaseMutation?.()
              releaseMutation = undefined
              const answer = await payload()
              sendJson(res, 200, addedRef === undefined ? answer : { ...answer, addedRef })
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

    // One provider's balance, fetched from the URL that provider configured.
    //
    // The browser half cannot make this call itself: the balance API is a
    // third-party origin (CORS), and the request is signed with a stored key
    // that only the host can resolve. The URL itself is plugin state in the key
    // index (`balances`), written from the provider card's balance row. A route
    // with no URL answers `configured:false` — the Models page shows nothing in
    // that case — while a configured route that fails answers an error, so a
    // broken endpoint does not masquerade as "not configured".
    ctx.effect(
      () =>
        webServerCtx.webServer.register({
          kind: 'exact',
          path: BALANCE_PATH,
          handler: async (req, res) => {
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
            if (route.length === 0) {
              sendJson(res, 400, { ok: false, error: 'a route is required' })
              return
            }
            let document: ReturnType<typeof readKeyIndex>
            try {
              document = readKeyIndex(keyIndexFilePath())
            } catch (error) {
              sendJson(res, 500, { ok: false, error: error instanceof Error ? error.message : String(error) })
              return
            }
            const endpoint = document.balances?.[route]
            if (endpoint === undefined) {
              sendJson(res, 200, { ok: true, route, configured: false })
              return
            }
            let profile: Record<string, unknown> | undefined
            try {
              profile = providerProfileOf(piSection(true), route)
            } catch {
              sendJson(res, 502, { ok: false, configured: true, error: 'the llm-pi-ai settings could not be read' })
              return
            }
            if (profile === undefined) {
              sendJson(res, 400, {
                ok: false,
                configured: true,
                error: `no llm-pi-ai provider route "${route}"`,
              })
              return
            }
            // Only the FIRST key of the provider is asked for a balance.
            // Further keys may resolve to different upstream accounts, but the
            // row shows one amount per provider, so asking them would multiply
            // traffic for values nobody sees. A route whose key list is empty
            // falls back to the profile's seat (the only key it can have); a
            // route with no key at all still gets the call, because some
            // balance endpoints are public.
            const credentials = ctx.get('credentials') as CredentialsService | undefined
            const ref = keyEntriesOf(document, route)[0]?.ref ?? enabledRefOf(profile)
            let apiKey: string | undefined
            if (ref !== undefined) {
              try {
                apiKey = await resolveCredential(credentials, ref)
              } catch {
                sendJson(res, 502, {
                  ok: false,
                  configured: true,
                  error: 'the credential store could not read the reference',
                })
                return
              }
            }
            try {
              const headers: Record<string, string> = { accept: 'application/json' }
              if (apiKey !== undefined) {
                // The upstream protocol family decides the header the provider
                // expects for an account-level call; the two are not combined,
                // so an endpoint that rejects the other family's header (or a
                // WAF that flags it) is not handed a credential it never asked
                // for. Redirects are refused for the same reason: the key must
                // only reach the authority the user typed.
                const api = typeof profile['api'] === 'string' ? profile['api'] : ''
                if (api === 'anthropic-messages') headers['x-api-key'] = apiKey
                else headers['authorization'] = `Bearer ${apiKey}`
              }
              const upstream = await headerOverlayBypass()(endpoint, {
                method: 'GET',
                headers,
                redirect: 'error',
                signal: AbortSignal.timeout(BALANCE_TIMEOUT_MS),
              })
              if (!upstream.ok) {
                const hint = upstream.status === 401 || upstream.status === 403 ? '; check the API key' : ''
                sendJson(res, 502, {
                  ok: false,
                  configured: true,
                  error: `${displayUrl(endpoint)} answered ${upstream.status}${hint}`,
                })
                return
              }
              const text = await readBounded(upstream, endpoint)
              const reading = parseBalancePayload(text)
              if (reading === undefined) {
                sendJson(res, 502, {
                  ok: false,
                  configured: true,
                  error: `${displayUrl(endpoint)} answered no recognisable balance`,
                })
                return
              }
              sendJson(res, 200, {
                ok: true,
                route,
                configured: true,
                amount: reading.amount,
                ...(reading.currency === undefined ? {} : { currency: reading.currency }),
              })
            } catch (error) {
              // undici's own failure texts quote the original URL verbatim;
              // strip credentials before the reason reaches the page.
              sendJson(res, 502, {
                ok: false,
                configured: true,
                error: `could not reach ${displayUrl(endpoint)}: ${redactUrlSecrets(error instanceof Error ? error.message : String(error))}`,
              })
            }
          },
        }),
      'dsh-model-think-level: balance route',
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

    // The UI-order document: the provider-row sequence and every provider's
    // model-row sequence the user set by dragging on the official Models page.
    //
    // The browser half keeps the live preference in localStorage — fast, and
    // shared across tabs through storage events — but localStorage does not
    // travel between machines, and the orderings are exactly what a user wants
    // everywhere. This route owns the synced copy (`ui-order.json` beside the
    // key index): the client pulls at boot and pushes every drag, arbitrated
    // last-writer-wins by the `savedAt` stamp each side carries; the host only
    // folds what arrives over what is stored, so a partial or buggy payload
    // cannot blank a good file. No secrets — provider routes and model ids
    // only — which is what makes the file safe to point a sync tool at.
    ctx.effect(
      () =>
        webServerCtx.webServer.register({
          kind: 'exact',
          path: ORDER_PATH,
          handler: async (req, res) => {
            res.setHeader('cache-control', 'no-store')
            if (!isTrustedRequest(req)) {
              sendJson(res, 403, { ok: false, error: 'forbidden' })
              return
            }
            if (req.method === 'GET') {
              // An absent or malformed file is an EMPTY document, never an
              // error: the client decides whether to adopt or to seed it.
              sendJson(res, 200, { ok: true, data: readUiOrder(uiOrderFilePath()) })
              return
            }
            if (req.method !== 'POST') {
              sendJson(res, 405, { ok: false, error: 'method not allowed' })
              return
            }
            // One document per deployment: a provider order plus every
            // provider's model order. 64KiB covers a hundred routes with
            // hundred-row model lists several times over.
            const body = await readJsonBody(req, 65_536)
            if (body === undefined) {
              sendJson(res, 400, { ok: false, error: 'the body is not a JSON document' })
              return
            }
            try {
              // Read-fold-write is synchronous (order-store is), so two
              // overlapping pushes cannot interleave the read-modify-write.
              // A payload no newer than the stored document is refused with
              // 409: it is a page that never saw the newer file, and letting it
              // win would roll the order and the switches back.
              const { document, stale } = commitUiOrderGuarded(body, Date.now())
              if (stale) {
                sendJson(res, 409, { ok: false, error: 'stale', data: document })
                return
              }
              sendJson(res, 200, { ok: true, data: document })
            } catch (error) {
              sendJson(res, 500, { ok: false, error: error instanceof Error ? error.message : String(error) })
            }
          },
        }),
      'dsh-model-think-level: ui-order route',
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
            // The override map can carry credential headers the user configured
            // for a gateway (an `authorization`, an `x-api-key`); nothing this
            // answers may sit in a cache, and those values must not echo.
            res.setHeader('cache-control', 'no-store')
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
                /** Routes whose configured request headers are sent, by origin.
                 *  Credential-shaped values are masked: this is a status report,
                 *  not the editor's data source (the editor reads the settings
                 *  document through its own face), so no consumer needs them. */
                overrides: index.overrides.map(entry => ({
                  origin: entry.origin,
                  route: entry.route,
                  headers: maskSensitiveHeaders(entry.headers),
                  ...(entry.userAgent === undefined ? {} : { userAgent: entry.userAgent }),
                })),
                /** Same-origin routes with different User-Agent values. */
                conflicts: index.conflicts,
                /** Same-origin differences for any configured request header,
                 *  with credential-shaped values masked the same way. */
                headerConflicts: index.headerConflicts.map(conflict => ({
                  ...conflict,
                  values: sensitiveHeader(conflict.header)
                    ? conflict.values.map(() => SENSITIVE_HEADER_MASK)
                    : conflict.values,
                })),
                /** What was found of the plugins that rewrite the same surface. */
                environment: environmentConflicts,
              },
            })
          },
        }),
      'dsh-model-think-level: headers config route',
    )

    // Model fingerprint attribution (ModelTrace). One path, three verbs: GET
    // reads the stored verdicts for a provider, POST runs one model's three
    // challenges and stores the verdict, DELETE forgets one model.
    //
    // The POST answers as NDJSON -- one `progress` line per finished challenge,
    // then one `result` line -- because the page shows `检测中 · n/3` and only
    // the host knows when a challenge lands. A proxy that buffers the whole
    // response degrades this safely: the progress lines just arrive late, the
    // page falls back to an indeterminate badge, and the final line is still
    // the truth. Raw answer text never leaves this process; only statistics
    // are stored (design §4.2).
    //
    // Early exit rides on `runProbe.shouldStop` below: two confident answers
    // close the run before the slowest challenge lands, and the verdict is
    // graded on the bank's own 2-query calibration (verdict.ts).
    ctx.effect(
      () =>
        webServerCtx.webServer.register({
          kind: 'exact',
          path: FINGERPRINT_PATH,
          handler: async (req, res) => {
            // Verdicts are per-model state the page re-reads: nothing this
            // route answers belongs in a cache (the NDJSON POST branch used to
            // set this only for itself; GET/DELETE were cacheable).
            res.setHeader('cache-control', 'no-store')
            if (!isTrustedRequest(req)) {
              sendJson(res, 403, { ok: false, error: 'forbidden' })
              return
            }
            const method = req.method ?? 'GET'
            if (method !== 'GET' && method !== 'POST' && method !== 'DELETE') {
              sendJson(res, 405, { ok: false, error: 'method not allowed' })
              return
            }
            const url = new URL(req.url ?? '/', 'http://x')
            const route = url.searchParams.get('route') ?? ''
            if (route.length === 0) {
              sendJson(res, 400, { ok: false, error: 'a provider route is required' })
              return
            }
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
            let bank: ReturnType<typeof loadBankSync>
            try {
              bank = loadBankSync()
            } catch (error) {
              sendJson(res, 500, {
                ok: false,
                error: error instanceof Error ? error.message : String(error),
              })
              return
            }
            const file = fingerprintFilePath()
            const stamp = bankBuiltAt(bank)

            if (method === 'GET') {
              const document = readFingerprintStore(stamp, file)
              sendJson(res, 200, {
                ok: true,
                data: {
                  bank: summarizeBank(bank),
                  records: providerRecords(document, route),
                },
              })
              return
            }

            // Both writers go through one tail so two clicks cannot interleave a
            // read-modify-write on the same file. Reads stay unqueued.
            let releaseMutation: (() => void) | undefined
            const previous = fingerprintMutationTail
            fingerprintMutationTail = new Promise<void>(resolve => {
              releaseMutation = resolve
            })
            await previous
            try {
              if (method === 'DELETE') {
                const model = url.searchParams.get('model') ?? ''
                if (model.length === 0) {
                  sendJson(res, 400, { ok: false, error: 'a model id is required' })
                  return
                }
                updateFingerprintStore(
                  document => withoutRecord(document, route, model),
                  stamp,
                  file,
                )
                sendJson(res, 200, { ok: true })
                return
              }

              const body = await readJsonBody(req, 2048)
              const model = isRecord(body) && typeof body['model'] === 'string' ? body['model'] : ''
              if (model.length === 0) {
                sendJson(res, 400, { ok: false, error: 'a model id is required' })
                return
              }
              // Eligibility is a page-level rule (design §0.1): a model outside
              // the two families cannot produce a verdict this bank can express,
              // so the route refuses instead of spending three calls to say
              // "failed".
              if (!isEligibleModel(model)) {
                sendJson(res, 400, {
                  ok: false,
                  error: `model "${model}" is not a GPT or Claude model`,
                })
                return
              }

              const llm = (fingerprintDispatch ?? (ctx as unknown as { llm?: unknown }).llm) as
                | LlmDispatchLike
                | undefined
              if (llm === undefined || typeof llm.prepareCall !== 'function') {
                sendJson(res, 503, { ok: false, error: 'the llm service is unavailable' })
                return
              }

              res.statusCode = 200
              res.setHeader('content-type', 'application/x-ndjson; charset=utf-8')
              res.setHeader('cache-control', 'no-store')
              // Tell any reverse proxy in front of us not to sit on the lines.
              res.setHeader('x-accel-buffering', 'no')
              const emit = (line: Record<string, unknown>): void => {
                res.write(`${JSON.stringify(line)}\n`)
              }

              const challenges = generateChallenges(3)
              const controller = new AbortController()
              res.on('close', () => {
                if (!res.writableEnded) controller.abort()
              })

              let run: ProbeRunResult
              try {
                run = await runProbe({
                  provider: route,
                  model,
                  challenges,
                  llm,
                  signal: controller.signal,
                  timeoutMs: FINGERPRINT_CHALLENGE_TIMEOUT_MS,
                  onOutcome: outcome => {
                    emit({
                      type: 'progress',
                      index: outcome.index,
                      ok: outcome.ok,
                      ...(outcome.error === undefined ? {} : { error: outcome.error }),
                    })
                  },
                  // Early exit (design §5.3): the bank's 2-query calibration
                  // carries 99.7% cross-validated accuracy, so two confident
                  // answers may close the run before the slowest challenge
                  // lands. The gate is deliberately double: the POOLED pair
                  // must clear the 2-query probability bar, AND each answer
                  // on its own must name the same winner — two answers biting
                  // different candidates must not fuse into a lucky spike.
                  shouldStop: settled => {
                    const accepted = settled.filter(outcome => outcome.ok)
                    if (accepted.length < 2) return false
                    try {
                      const outputs = accepted.map(outcome => ({
                        text: outcome.text,
                        expected_count: outcome.expectedCount,
                      }))
                      const pooled = analyzeGlobalOutputs(outputs, bank)
                      if (pooled.probability < EARLY_IDENTIFIED_PROBABILITY) return false
                      const first = analyzeGlobalOutputs(outputs.slice(0, 1), bank)
                      const second = analyzeGlobalOutputs(outputs.slice(1), bank)
                      return first.prediction === second.prediction
                    } catch {
                      return false
                    }
                  },
                })
              } catch (error) {
                emit({
                  type: 'error',
                  error: error instanceof Error ? error.message : String(error),
                })
                res.end()
                return
              }

              let attribution: AttributionResult | null = null
              let failure: string | undefined
              try {
                attribution = analyzeGlobalOutputs(run.outputs, bank)
              } catch (error) {
                failure = error instanceof Error ? error.message : String(error)
              }
              // `analyzeGlobalOutputs` throws only when nothing was accepted, so
              // the failure case is exactly "no usable answer". When every call
              // died before producing text, say what actually went wrong.
              const usedOutputs = attribution === null ? 0 : attribution.used_outputs
              const record: FingerprintRecord = {
                provider: route,
                model,
                status: statusOf(attribution, usedOutputs),
                checkedAt: Date.now(),
                usedOutputs,
              }
              // 逐题记账在两种结局下都写：三题全废时，「是哪一题没答、答回来
              // 多少」正是用户接着要问的那句。它记的是尝试，不是结论，所以不
              // 跟着 failed 清空。
              record.challenges = fingerprintChallengesOf(run.outcomes, attribution)
              if (attribution === null) {
                const firstFailure = run.outcomes.find(outcome => !outcome.ok)
                record.error =
                  run.outputs.length === 0 && firstFailure?.error !== undefined
                    ? firstFailure.error
                    : (failure ?? NO_USABLE_OUTPUT)
              } else {
                record.prediction = attribution.prediction
                record.predictionName = attribution.prediction_name
                record.probability = attribution.probability
                record.familyPrediction = attribution.family_prediction
                record.familyProbability = attribution.family_probability
                record.top = topEntriesOf(attribution.results, 3)
                record.calibration = {
                  queries: attribution.calibration.queries,
                  cvAccuracy: attribution.calibration.cv_accuracy,
                }
                const timing = fingerprintTimingOf(run.outcomes)
                if (timing !== undefined) record.timing = timing
              }

              updateFingerprintStore(
                document => withRecord(document, record),
                stamp,
                file,
              )
              emit({ type: 'result', record })
              res.end()
            } catch (error) {
              sendJson(res, 500, {
                ok: false,
                error: error instanceof Error ? error.message : String(error),
              })
            } finally {
              releaseMutation?.()
            }
          },
        }),
      'dsh-model-think-level: fingerprint route',
    )

    // Image-generation config: GET answers the derived list merged with the
    // stored overrides (re-syncing first, so the snapshot is never stale), POST
    // saves the defaults and the default model.
    ctx.effect(
      () =>
        webServerCtx.webServer.register({
          kind: 'exact',
          path: IMAGE_CONFIG_PATH,
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
            if (req.method === 'GET') {
              // A GET re-syncs first (an expired snapshot must not be served as
              // fresh); a failed sync leaves the stored document, still useful.
              syncImageConfigNow()
              const config = readImageConfig()
              sendJson(res, 200, {
                ok: true,
                models: config.models,
                defaultModel: config.defaultModel,
                defaults: config.defaults,
                outputDir: config.outputDir,
                syncedAt: config.syncedAt,
                // The native tool's registration state: the pane's status card
                // and the client's keyed image card both read this name back.
                tool: {
                  registered: imageToolState.name !== undefined,
                  name: imageToolState.name ?? null,
                  ...(imageToolState.error === undefined ? {} : { error: imageToolState.error }),
                },
              })
              return
            }
            const body = await readJsonBody(req, 65_536)
            if (!isRecord(body)) {
              sendJson(res, 400, { ok: false, error: 'a JSON body is required' })
              return
            }
            // Save: defaults, output dir, default model, per-model row overrides.
            try {
              updateImageConfig(document => {
                let next: ImageConfig = document
                if (typeof body['defaultModel'] === 'string' && body['defaultModel'].length > 0) {
                  next = { ...next, defaultModel: body['defaultModel'] }
                }
                if (body['defaultModel'] === null) next = { ...next, defaultModel: null }
                if (typeof body['outputDir'] === 'string' && body['outputDir'].length > 0) {
                  next = { ...next, outputDir: body['outputDir'] }
                }
                if (isRecord(body['defaults'])) {
                  const raw = body['defaults']
                  next = {
                    ...next,
                    defaults: {
                      size: typeof raw['size'] === 'string' && raw['size'].length > 0 ? raw['size'] : next.defaults.size,
                      quality: typeof raw['quality'] === 'string' && raw['quality'].length > 0 ? raw['quality'] : next.defaults.quality,
                      n: typeof raw['n'] === 'number' && Number.isInteger(raw['n']) && raw['n'] >= 1 ? Math.min(raw['n'], 16) : next.defaults.n,
                      timeoutMs: typeof raw['timeoutMs'] === 'number' && raw['timeoutMs'] >= 60_000
                        ? Math.min(raw['timeoutMs'], 3_600_000)
                        : next.defaults.timeoutMs,
                    },
                  }
                }
                // A `models` row in the body (older clients send per-row param
                // overrides) is accepted and ignored: those overrides were
                // removed with the pane's row controls, so the params row is
                // now the only place size/quality/n are picked.
                return next
              })
              syncImageConfigNow()
              sendJson(res, 200, { ok: true })
            } catch (error) {
              sendJson(res, 500, { ok: false, error: error instanceof Error ? error.message : String(error) })
            }
          },
        }),
      'dsh-model-think-level: image config route',
    )
  })
}
