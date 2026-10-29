/**
 * The image-generation config: `<DSH_HOME>/dsh-model-think-level/image.json`.
 *
 * The file holds no secrets — credential references only — which is what makes
 * it safe to keep in plain text and to hand to the MCP subprocess through one
 * `DSH_IMAGE_CONFIG` env var. Its `models[]` is a DERIVED SNAPSHOT: the source
 * of truth is the `llm-pi-ai` settings document's `inputImageGen` rows (the
 * same marker the Models page and the auto-fill write), and this file layers
 * the user's per-model overrides (endpoint verdict, param abilities, picked
 * size/quality/n) on top. Syncing keeps every override keyed by model id, so a
 * model that leaves the settings document drops out and one that comes back
 * keeps its overrides.
 *
 * Parsing follows `key-index.ts`: read-never-throw for absent files, defensive
 * field-by-field drops for malformed content, and an atomic temp-then-rename
 * write so a crash mid-write cannot leave a half-parsed config behind.
 *
 * @module dsh-model-think-level/image/config
 */

import { mkdirSync, readFileSync, renameSync, unlinkSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { IMAGE_CONFIG_FILE } from '../constants.js'
import { harnessHome } from '../key-index.js'
import { IMAGE_SIZE_TIERS } from './sizes.js'

/** Endpoint verdict of one image model. `unverified` is the honest default. */
export type EndpointStatus = 'unverified' | 'ok' | 'unsupported'

/** Wire shape the model row speaks. Only OpenAI-compatible images is wired up. */
export type ImageApi = 'images' | 'none'

/** The conservative ability table every freshly derived row starts with. */
export interface ImageParams {
  readonly sizes: readonly string[]
  readonly qualities: readonly string[]
  readonly maxN: number
  /** How the endpoint wants its answer: b64 inline, an output_format field, or nothing. */
  readonly responseFormat: 'b64_json' | 'output_format' | 'none'
}

/** One derived model row, before user overrides. */
export interface ImageModelSeed {
  readonly id: string
  readonly route: string
  readonly modelId: string
  readonly label: string
  /** The route profile's `displayName` (the provider name the Models page
   * shows), when the profile has one; absent when the profile does not. */
  readonly providerLabel?: string
  readonly api: ImageApi
  readonly baseURL: string
  readonly keyRef?: string
}

/** One image model as the config stores it: derived facts + user overrides. */
export interface ImageModel {
  readonly id: string
  readonly route: string
  readonly modelId: string
  readonly label: string
  readonly providerLabel?: string
  readonly api: ImageApi
  readonly baseURL: string
  readonly keyRef?: string
  readonly endpoint: { readonly kind: 'images'; readonly status: EndpointStatus; readonly checkedAt: string | null }
  readonly params: ImageParams
  readonly lastGoodParams: ImageParams | null
}

/** The defaults every model row inherits when it does not override. */
export interface ImageDefaults {
  readonly size: string
  readonly quality: string
  readonly n: number
  readonly timeoutMs: number
}

/** The whole config document, exactly as it sits on disk. */
export interface ImageConfig {
  readonly version: 2
  /** When `models[]` was last re-derived from the settings document. */
  readonly syncedAt: string
  /** `"<route>/<modelId>"` of the default model, when the user picked one. */
  readonly defaultModel: string | null
  readonly defaults: ImageDefaults
  readonly outputDir: string
  readonly models: readonly ImageModel[]
}

/** A mutable view of the config the writers build from. */
export type ImageConfigDraft = {
  -readonly [K in keyof ImageConfig]: ImageConfig[K]
}

/** Conservative defaults: nothing here assumes a capability the API may not have. */
export const IMAGE_FALLBACK_PARAMS: ImageParams = {
  sizes: IMAGE_SIZE_TIERS.map(tier => tier.value),
  qualities: ['low', 'medium', 'high', 'auto'],
  maxN: 4,
  responseFormat: 'b64_json',
}

/** Absolute path of the image config. */
export function imageConfigFilePath(home: string = harnessHome()): string {
  return join(home, 'dsh-model-think-level', IMAGE_CONFIG_FILE)
}

/** A fresh, empty config. */
export function emptyImageConfig(now: () => Date = () => new Date()): ImageConfig {
  return {
    version: 2,
    syncedAt: now().toISOString(),
    defaultModel: null,
    defaults: { size: '1024x1024', quality: 'high', n: 1, timeoutMs: 300_000 },
    outputDir: 'generated-images',
    models: [],
  }
}

/** Whether a value is a plain-ish object (not null, not an array). */
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isSize(value: unknown): value is string {
  return typeof value === 'string' && /^\d{2,5}x\d{2,5}$/.test(value)
}

function stringList(value: unknown, limit = 32): string[] | undefined {
  if (!Array.isArray(value)) return undefined
  const out = value.filter((entry): entry is string => typeof entry === 'string' && entry.length > 0).slice(0, limit)
  return out.length > 0 ? out : undefined
}

function parseParams(raw: unknown): ImageParams | undefined {
  if (!isRecord(raw)) return undefined
  const sizes = stringList(raw['sizes'])?.filter(isSize)
  const qualities = stringList(raw['qualities'])
  const maxN = typeof raw['maxN'] === 'number' && Number.isInteger(raw['maxN']) && raw['maxN'] >= 1
    ? Math.min(raw['maxN'], 16)
    : undefined
  const responseFormat = raw['responseFormat'] === 'output_format' || raw['responseFormat'] === 'none'
    ? raw['responseFormat']
    : raw['responseFormat'] === 'b64_json' ? 'b64_json' as const : undefined
  if (sizes === undefined && qualities === undefined && maxN === undefined && responseFormat === undefined) return undefined
  return {
    sizes: sizes ?? IMAGE_FALLBACK_PARAMS.sizes,
    qualities: qualities ?? IMAGE_FALLBACK_PARAMS.qualities,
    maxN: maxN ?? IMAGE_FALLBACK_PARAMS.maxN,
    responseFormat: responseFormat ?? IMAGE_FALLBACK_PARAMS.responseFormat,
  }
}

/**
 * Parse an already-decoded config document. Never throws and never trusts the
 * input: anything unrecognisable is dropped field by field, so a hand-edited
 * or truncated file costs at most the fields it got wrong. Overrides of model
 * rows this document does not know are kept — the next sync may re-derive them.
 */
export function parseImageConfig(raw: unknown, now: () => Date = () => new Date()): ImageConfig {
  const base = emptyImageConfig(now)
  if (!isRecord(raw)) return base
  const defaultsRaw = isRecord(raw['defaults']) ? raw['defaults'] : {}
  const defaults: ImageDefaults = {
    size: isSize(defaultsRaw['size']) ? defaultsRaw['size'] : base.defaults.size,
    quality: typeof defaultsRaw['quality'] === 'string' && defaultsRaw['quality'].length > 0
      ? defaultsRaw['quality']
      : base.defaults.quality,
    n: typeof defaultsRaw['n'] === 'number' && Number.isInteger(defaultsRaw['n']) && defaultsRaw['n'] >= 1
      ? Math.min(defaultsRaw['n'], 16)
      : base.defaults.n,
    timeoutMs: typeof defaultsRaw['timeoutMs'] === 'number' && defaultsRaw['timeoutMs'] >= 60_000
      ? Math.min(defaultsRaw['timeoutMs'], 3_600_000)
      : base.defaults.timeoutMs,
  }
  // A leftover `mcp` block from the retired stdio server is dropped by the
  // field-by-field parse: only known keys are read, so the stale state on
  // disk costs nothing and is rewritten away on the next save.
  const models: ImageModel[] = []
  const seen = new Set<string>()
  if (Array.isArray(raw['models'])) {
    for (const entry of raw['models']) {
      if (!isRecord(entry)) continue
      const model = parseImageModel(entry)
      if (model === undefined || seen.has(model.id)) continue
      seen.add(model.id)
      models.push(model)
    }
  }
  return {
    version: 2,
    syncedAt: typeof raw['syncedAt'] === 'string' ? raw['syncedAt'] : base.syncedAt,
    defaultModel: typeof raw['defaultModel'] === 'string' && raw['defaultModel'].length > 0 ? raw['defaultModel'] : null,
    defaults,
    outputDir: typeof raw['outputDir'] === 'string' && raw['outputDir'].length > 0 ? raw['outputDir'] : base.outputDir,
    models,
  }
}

function parseImageModel(raw: Record<string, unknown>): ImageModel | undefined {
  const id = typeof raw['id'] === 'string' && raw['id'].length > 0 ? raw['id'] : undefined
  const route = typeof raw['route'] === 'string' && raw['route'].length > 0 ? raw['route'] : undefined
  const modelId = typeof raw['modelId'] === 'string' && raw['modelId'].length > 0 ? raw['modelId'] : undefined
  if (id === undefined || route === undefined || modelId === undefined) return undefined
  const api: ImageApi = raw['api'] === 'images' ? 'images' : 'none'
  const endpointRaw = isRecord(raw['endpoint']) ? raw['endpoint'] : {}
  const status: EndpointStatus = endpointRaw['status'] === 'ok' || endpointRaw['status'] === 'unsupported'
    ? endpointRaw['status']
    : 'unverified'
  const params = parseParams(raw['params']) ?? { ...IMAGE_FALLBACK_PARAMS }
  return {
    id,
    route,
    modelId,
    label: typeof raw['label'] === 'string' && raw['label'].length > 0 ? raw['label'] : modelId,
    ...(typeof raw['providerLabel'] === 'string' && raw['providerLabel'].length > 0 ? { providerLabel: raw['providerLabel'] } : {}),
    api,
    baseURL: typeof raw['baseURL'] === 'string' ? raw['baseURL'] : '',
    ...(typeof raw['keyRef'] === 'string' && raw['keyRef'].length > 0 ? { keyRef: raw['keyRef'] } : {}),
    endpoint: {
      kind: 'images',
      status,
      checkedAt: typeof endpointRaw['checkedAt'] === 'string' ? endpointRaw['checkedAt'] : null,
    },
    params,
    lastGoodParams: parseParams(raw['lastGoodParams']) ?? null,
  }
}

/** Read the config; an absent or unreadable file means a fresh, empty one. */
export function readImageConfig(file: string = imageConfigFilePath()): ImageConfig {
  let text: string
  try {
    text = readFileSync(file, 'utf8')
  } catch {
    return emptyImageConfig()
  }
  try {
    return parseImageConfig(JSON.parse(text) as unknown)
  } catch {
    // A corrupt file must not take the config surface down: start over (the
    // next sync rewrites the file with the derived snapshot).
    return emptyImageConfig()
  }
}

/** Write the config at one path, atomically (sibling temp file, then rename). */
export function writeImageConfig(document: ImageConfig, file: string = imageConfigFilePath()): void {
  mkdirSync(dirname(file), { recursive: true })
  const temporary = `${file}.${process.pid}.tmp`
  writeFileSync(temporary, `${JSON.stringify(document, null, 2)}\n`, 'utf8')
  try {
    renameSync(temporary, file)
  } catch (error) {
    try {
      unlinkSync(temporary)
    } catch {
      // The temp file is best-effort cleanup; the rename failure is the news.
    }
    throw error
  }
}

/**
 * Derive the image-model seeds from a resolved `llm-pi-ai` providers map: every
 * route's `models[]` row carrying `inputImageGen === true`, with the route's
 * api/baseURL/credential reference (and its displayName, the provider name the
 * list shows) attached. This is the SAME marker the Models
 * page editor and the auto-fill write, so both writers feed this list.
 *
 * A route whose protocol cannot carry an OpenAI-compatible images call still
 * lists its rows — marked `api: 'none'` so the UI can badge "no compatible
 * endpoint" and refuse generation.
 */
export function deriveImageSeeds(providers: Record<string, Record<string, unknown>>): ImageModelSeed[] {
  const seeds: ImageModelSeed[] = []
  for (const [route, profile] of Object.entries(providers)) {
    if (!isRecord(profile) || !Array.isArray(profile['models'])) continue
    const apiRaw = typeof profile['api'] === 'string' ? profile['api'] : ''
    // OpenAI-compatible wires can carry an images call on the same base URL;
    // Anthropic's cannot (its wire has no images endpoint at all).
    const api: ImageApi = apiRaw === 'openai-completions' || apiRaw === 'openai-responses' || apiRaw === 'openai' || apiRaw === ''
      ? 'images'
      : 'none'
    const baseURL = typeof profile['baseURL'] === 'string' ? profile['baseURL'].trim() : ''
    const keyRef = typeof profile['apiKeyEnv'] === 'string' && profile['apiKeyEnv'].length > 0 ? profile['apiKeyEnv'] : undefined
    const providerLabel = typeof profile['displayName'] === 'string' ? profile['displayName'].trim() : ''
    for (const row of profile['models']) {
      if (!isRecord(row) || row['inputImageGen'] !== true) continue
      const modelId = typeof row['id'] === 'string' ? row['id'].trim() : ''
      if (modelId.length === 0) continue
      const label = typeof row['name'] === 'string' && row['name'].trim().length > 0 ? row['name'].trim() : modelId
      const seed: ImageModelSeed = {
        id: `${route}/${modelId}`,
        route,
        modelId,
        label,
        api,
        baseURL,
        ...(providerLabel.length === 0 ? {} : { providerLabel }),
        ...(keyRef === undefined ? {} : { keyRef }),
      }
      if (!seeds.some(existing => existing.id === seed.id)) seeds.push(seed)
    }
  }
  return seeds
}

/**
 * Re-derive `models[]` from the settings document while keeping every stored
 * override keyed by model id. A derived row starts from the conservative
 * ability table; a stored row of the same id hands its overrides (endpoint
 * verdict, params, lastGoodParams) forward. Rows the settings document no
 * longer declares are dropped; defaultModel that points at a dropped model is
 * cleared.
 *
 * The old per-row size/quality/n picks are gone on purpose: the pane's params
 * row is the single place those are chosen, so a leftover pick from an older
 * build must not quietly outrank it. They are simply not carried forward.
 */
export function syncImageConfig(
  stored: ImageConfig,
  providers: Record<string, Record<string, unknown>>,
  now: () => Date = () => new Date(),
): ImageConfig {
  const seeds = deriveImageSeeds(providers)
  const previous = new Map(stored.models.map(model => [model.id, model]))
  const models: ImageModel[] = seeds.map(seed => {
    const kept = previous.get(seed.id)
    const params = kept !== undefined ? kept.params : { ...IMAGE_FALLBACK_PARAMS }
    return {
      ...seed,
      endpoint: kept?.endpoint ?? { kind: 'images' as const, status: 'unverified' as const, checkedAt: null },
      params,
      lastGoodParams: kept?.lastGoodParams ?? null,
    }
  })
  const ids = new Set(models.map(model => model.id))
  return {
    ...stored,
    syncedAt: now().toISOString(),
    defaultModel: stored.defaultModel !== null && ids.has(stored.defaultModel) ? stored.defaultModel : null,
    models,
  }
}

/**
 * Resolve the model a generation should use, per the design's priority:
 * an explicit pick (the dialog's current model, or a call's `model` argument)
 * wins; then the config's defaultModel; then the sole candidate when exactly
 * one exists. `undefined` when nothing resolves.
 */
export function resolveImageModel(
  config: ImageConfig,
  explicit?: string | undefined,
): ImageModel | undefined {
  if (explicit !== undefined && explicit.length > 0) {
    const direct = config.models.find(model => model.id === explicit)
    if (direct !== undefined) return direct
    const byModelId = config.models.filter(model => model.modelId === explicit)
    if (byModelId.length === 1) return byModelId[0]
    const byLabel = config.models.filter(model => model.label === explicit)
    if (byLabel.length === 1) return byLabel[0]
    return undefined
  }
  if (config.defaultModel !== null) {
    const named = config.models.find(model => model.id === config.defaultModel)
    if (named !== undefined) return named
  }
  return config.models.length === 1 ? config.models[0] : undefined
}

/**
 * The params one generation uses: the call's explicit values win, then the
 * config defaults (the pane's params row). `n` is additionally clamped to the
 * model's ability table (a row that says maxN 2 never fires 8 requests).
 * `referenceImages` never comes from config — it is per-call.
 */
export function effectiveParams(
  config: ImageConfig,
  model: ImageModel | undefined,
  request: { size?: string; quality?: string; n?: number },
): { size: string; quality: string; n: number } {
  const n = Math.max(1, Math.min(16, request.n ?? config.defaults.n))
  return {
    size: request.size ?? config.defaults.size,
    quality: request.quality ?? config.defaults.quality,
    n: model === undefined ? n : Math.min(n, model.params.maxN),
  }
}

/** One synchronous read-modify-write of the config file. */
export function updateImageConfig(
  mutate: (document: ImageConfig) => ImageConfig,
  file: string = imageConfigFilePath(),
): ImageConfig {
  const next = mutate(readImageConfig(file))
  writeImageConfig(next, file)
  return next
}
