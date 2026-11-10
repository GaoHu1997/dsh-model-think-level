/**
 * Live image configuration. Model membership and connection facts come only
 * from an active llm-pi-ai settings descriptor. image.json stores preferences
 * and connection-scoped observations, never an executable model catalogue.
 * Reads have no writes, subscriptions, boot order or cache invalidation needs.
 */
import { createHash, randomUUID } from 'node:crypto'
import { mkdirSync, readFileSync, renameSync, unlinkSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'
import {
  deriveImageSeeds,
  emptyImageConfig,
  IMAGE_FALLBACK_PARAMS,
  imageConfigFilePath,
  parseImageConfig,
  parseImageParams,
  type ImageConfig,
  type ImageDefaults,
  type ImageModel,
  type ImageModelSeed,
  type ImageParams,
} from './config.js'

export interface ImageObservation {
  /** Hash of the connection that produced this observation; contains no URL or key. */
  readonly source: string
  readonly endpoint: ImageModel['endpoint']
  readonly lastGoodParams: ImageParams | null
}

export interface ImagePreferences {
  readonly version: 3
  readonly enabled: boolean
  readonly defaultModel: string | null
  readonly defaults: ImageDefaults
  readonly outputDir: string
  readonly observations: Readonly<Record<string, ImageObservation>>
}

interface SettingsDescriptor {
  readonly ns: string
  readonly value?: unknown
  readonly revision?: number
}

export class ImageConfigurationError extends Error {
  constructor(readonly code: 'settings-unavailable' | 'settings-invalid' | 'preferences-unreadable', message: string) {
    super(message)
    this.name = 'ImageConfigurationError'
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function sourceOf(model: ImageModelSeed): string {
  return createHash('sha256').update(JSON.stringify([
    model.route, model.modelId, model.api, model.baseURL, model.keyRef ?? null,
  ])).digest('hex')
}

function preferencesOf(raw: Record<string, unknown>): ImagePreferences {
  const parsed = parseImageConfig(raw)
  const observations: Record<string, ImageObservation> = Object.create(null) as Record<string, ImageObservation>
  if (raw['version'] === 3) {
    if (isRecord(raw['observations'])) {
      for (const [id, value] of Object.entries(raw['observations'])) {
        if (!isRecord(value) || typeof value['source'] !== 'string' || !/^[a-f0-9]{64}$/.test(value['source'])) continue
        const endpoint = isRecord(value['endpoint']) ? value['endpoint'] : {}
        observations[id] = {
          source: value['source'],
          endpoint: {
            kind: 'images',
            status: endpoint['status'] === 'ok' || endpoint['status'] === 'unsupported' ? endpoint['status'] : 'unverified',
            checkedAt: typeof endpoint['checkedAt'] === 'string' ? endpoint['checkedAt'] : null,
          },
          lastGoodParams: parseImageParams(value['lastGoodParams']) ?? null,
        }
      }
    }
  } else {
    // Legacy rows contribute diagnostics only. They can never introduce a model
    // or supply a connection to read(), even when the host is unavailable.
    for (const model of parsed.models) {
      observations[model.id] = {
        source: sourceOf(model),
        endpoint: model.endpoint,
        lastGoodParams: model.lastGoodParams,
      }
    }
  }
  return {
    version: 3,
    enabled: parsed.enabled,
    defaultModel: parsed.defaultModel,
    defaults: parsed.defaults,
    outputDir: parsed.outputDir,
    observations,
  }
}

interface PreferenceRead {
  readonly document: ImagePreferences
  readonly legacyText?: string
}

/** One source adapter for every consumer; an operation captures one read(). */
export class ImageConfiguration {
  private readonly file: string
  private readonly now: () => Date

  constructor(private readonly deps: {
    readonly describe: () => readonly SettingsDescriptor[]
    readonly file?: string
    readonly now?: () => Date
  }) {
    this.file = deps.file ?? imageConfigFilePath()
    this.now = deps.now ?? (() => new Date())
  }

  private load(): PreferenceRead {
    let text: string
    try {
      text = readFileSync(this.file, 'utf8')
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return { document: preferencesOf({}) }
      throw new ImageConfigurationError('preferences-unreadable', '生图配置偏好文件不可读，请检查文件权限或存储状态')
    }
    let raw: unknown
    try {
      raw = JSON.parse(text) as unknown
    } catch {
      throw new ImageConfigurationError('preferences-unreadable', '生图配置偏好文件格式损坏，原文件已保留，请修复后重试')
    }
    if (!isRecord(raw) || (raw['version'] !== undefined && raw['version'] !== 1 && raw['version'] !== 2 && raw['version'] !== 3)) {
      throw new ImageConfigurationError('preferences-unreadable', '生图配置偏好文件版本或结构无效，原文件已保留')
    }
    return { document: preferencesOf(raw), ...(raw['version'] === 3 ? {} : { legacyText: text }) }
  }

  preferences(): ImagePreferences {
    return this.load().document
  }

  private base(preferences: ImagePreferences): ImageConfig {
    return {
      ...emptyImageConfig(this.now),
      enabled: preferences.enabled,
      defaultModel: preferences.defaultModel,
      defaults: preferences.defaults,
      outputDir: preferences.outputDir,
    }
  }

  read(): ImageConfig {
    return this.project(this.preferences())
  }

  private project(preferences: ImagePreferences): ImageConfig {
    let descriptor: SettingsDescriptor | undefined
    try {
      descriptor = this.deps.describe().find(entry => entry.ns === 'llm-pi-ai')
    } catch {
      throw new ImageConfigurationError('settings-unavailable', '生图配置暂不可用：宿主模型设置读取失败，请恢复设置服务后重试')
    }
    if (descriptor === undefined) {
      throw new ImageConfigurationError('settings-unavailable', '生图配置尚未就绪：llm-pi-ai 尚未运行或正在重载，请稍后重试')
    }
    const section = descriptor.value
    if (!isRecord(section) || (section['providers'] !== undefined && !isRecord(section['providers']))) {
      throw new ImageConfigurationError('settings-invalid', '生图配置无效：宿主模型设置结构异常，请检查 llm-pi-ai 配置')
    }
    // A returned descriptor belongs to a running fiber and is a full resolved
    // configuration. Empty providers and providers without models are valid.
    const providers = (section['providers'] ?? {}) as Record<string, Record<string, unknown>>
    const models = deriveImageSeeds(providers).map((seed): ImageModel => {
      const recorded = preferences.observations[seed.id]
      const observation = recorded?.source === sourceOf(seed) ? recorded : undefined
      return {
        ...seed,
        params: { ...IMAGE_FALLBACK_PARAMS },
        endpoint: observation?.endpoint ?? { kind: 'images', status: 'unverified', checkedAt: null },
        lastGoodParams: observation?.lastGoodParams ?? null,
      }
    })
    return { ...this.base(preferences), models }
  }

  /** The saved switch wins even while the model provider is unavailable. */
  forGeneration(): ImageConfig {
    const preferences = this.preferences()
    return preferences.enabled ? this.project(preferences) : this.base(preferences)
  }

  update(mutate: (preferences: ImagePreferences) => ImagePreferences): ImagePreferences {
    // Synchronous read-modify-rename: async requests cannot interleave between
    // reading the current preferences and committing this local mutation.
    const current = this.load()
    const next = preferencesOf(mutate(current.document) as unknown as Record<string, unknown>)
    mkdirSync(dirname(this.file), { recursive: true })
    if (current.legacyText !== undefined) {
      try {
        writeFileSync(`${this.file}.v2.bak`, current.legacyText, { encoding: 'utf8', flag: 'wx', mode: 0o600 })
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error
      }
    }
    const temporary = `${this.file}.${process.pid}.${randomUUID()}.tmp`
    try {
      writeFileSync(temporary, `${JSON.stringify(next, null, 2)}\n`, { encoding: 'utf8', flag: 'wx', mode: 0o600 })
      renameSync(temporary, this.file)
    } catch (error) {
      try { unlinkSync(temporary) } catch { /* Preserve the original write error. */ }
      throw error
    }
    return next
  }

  record(model: ImageModel, params: ImageParams | null): void {
    this.update(document => ({
      ...document,
      observations: {
        ...document.observations,
        [model.id]: {
          source: sourceOf(model),
          endpoint: {
            kind: 'images',
            status: params === null ? 'unsupported' : 'ok',
            checkedAt: this.now().toISOString(),
          },
          lastGoodParams: params,
        },
      },
    }))
  }
}
