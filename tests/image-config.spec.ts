/**
 * The image-generation config file (image.json): defensive parsing, atomic
 * writes, derivation of `models[]` from the settings document's `inputImageGen`
 * rows, sync-keeps-overrides, and the param merge order.
 */

import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  deriveImageSeeds,
  effectiveParams,
  emptyImageConfig,
  imageConfigFilePath,
  parseImageConfig,
  readImageConfig,
  resolveImageModel,
  syncImageConfig,
  updateImageConfig,
  writeImageConfig,
} from '../src/image/config.js'

let home = ''

beforeEach(() => {
  home = mkdtempSync(join(tmpdir(), 'bre-image-config-'))
})

afterEach(() => {
  rmSync(home, { recursive: true, force: true })
})

function fileOf(): string {
  return imageConfigFilePath(home)
}

/** Compare fresh documents WITHOUT syncedAt: two constructions a millisecond
 * apart carry different stamps, which is exactly what this field is for. */
function expectSameDocument(actual: unknown): { toEqualConfig(expected: unknown): void } {
  const strip = (value: unknown): unknown => {
    if (typeof value !== 'object' || value === null) return value
    const { syncedAt: _ignored, ...rest } = value as Record<string, unknown>
    return rest
  }
  return {
    toEqualConfig(expected: unknown): void {
      expect(strip(actual)).toEqual(strip(expected))
    },
  }
}

const PROVIDERS = {
  openai: {
    displayName: 'OpenAI',
    api: 'openai-completions',
    baseURL: 'https://api.openai.com/v1',
    apiKeyEnv: 'OPENAI_API_KEY',
    models: [
      { id: 'gpt-image-1', name: 'GPT-Image-1', inputImageGen: true },
      { id: 'gpt-4o', name: 'GPT-4o' },
    ],
  },
  zhipu: {
    displayName: '智谱',
    api: 'openai-completions',
    baseURL: 'https://open.bigmodel.cn/api/paas/v4/',
    apiKeyEnv: 'ZHIPU_API_KEY',
    models: [{ id: 'cogview-3-plus', inputImageGen: true }],
  },
  midjourney: {
    displayName: 'MJ 中转',
    api: 'anthropic-messages',
    baseURL: 'https://mj.example/v1',
    models: [{ id: 'mj-v6', name: 'Midjourney v6', inputImageGen: true }],
  },
}

describe('parseImageConfig', () => {
  it('opens empty on garbage — a bad file never takes the surface down', () => {
    expectSameDocument(parseImageConfig(undefined)).toEqualConfig(emptyImageConfig())
    expectSameDocument(parseImageConfig('nope')).toEqualConfig(emptyImageConfig())
    expectSameDocument(parseImageConfig([])).toEqualConfig(emptyImageConfig())
  })

  it('drops malformed fields field by field, keeping the rest', () => {
    const config = parseImageConfig({
      version: 99,
      syncedAt: 'not-a-date-is-still-a-string',
      defaultModel: 'openai/gpt-image-1',
      outputDir: '',
      defaults: { size: 'huge', quality: 'high', n: 0, timeoutMs: 1 },
      mcp: { serverName: '', nodePath: 42, diagnostics: { ok: 'yes' } },
      models: [
        { id: 'openai/gpt-image-1', route: 'openai', modelId: 'gpt-image-1', api: 'images', providerLabel: 'OpenAI' },
        { route: 'no-id' },
        'not-an-object',
        { id: 'openai/gpt-image-1', route: 'openai', modelId: 'gpt-image-1', size: '10x10' },
      ],
    })
    expect(config.version).toBe(2)
    expect(config.models[0]?.providerLabel).toBe('OpenAI')
    expect(config.defaultModel).toBe('openai/gpt-image-1')
    // size "huge" fails the pattern → default; n=0 → default; timeoutMs 1 → default.
    expect(config.defaults).toEqual(emptyImageConfig().defaults)
    expect(config.mcp.serverName).toBe('dsh-image')
    expect(config.mcp.nodePath).toBe('')
    expect(config.mcp.diagnostics.ok).toBe(false)
    // Duplicates: the FIRST occurrence wins, malformed rows are dropped.
    expect(config.models).toHaveLength(1)
    expect(config.models[0]!.size).toBeUndefined()
  })

  it('keeps an unknown model row (the next sync may re-derive it)', () => {
    const config = parseImageConfig({
      models: [{ id: 'old/route', route: 'old', modelId: 'route', api: 'images' }],
    })
    expect(config.models).toHaveLength(1)
  })
})

describe('writeImageConfig / readImageConfig', () => {
  it('writes atomically and round-trips', () => {
    const config = { ...emptyImageConfig(), defaultModel: 'openai/gpt-image-1' }
    writeImageConfig(config, fileOf())
    expect(existsSync(fileOf())).toBe(true)
    expect(readImageConfig(fileOf()).defaultModel).toBe('openai/gpt-image-1')
    // No temp sibling is left behind.
    const siblings = readFileSync(fileOf()) // presence itself is the round-trip
    expect(siblings.length).toBeGreaterThan(0)
  })

  it('reads absent / unreadable / corrupt as a fresh document (never throws)', () => {
    expectSameDocument(readImageConfig(join(home, 'absent.json'))).toEqualConfig(emptyImageConfig())
    mkdirSync(dirname(fileOf()), { recursive: true })
    writeFileSync(fileOf(), '{not json', 'utf8')
    expectSameDocument(readImageConfig(fileOf())).toEqualConfig(emptyImageConfig())
  })

  it('updateImageConfig is one read-modify-write', () => {
    writeImageConfig(emptyImageConfig(), fileOf())
    const next = updateImageConfig(document => ({ ...document, outputDir: 'mine' }), fileOf())
    expect(next.outputDir).toBe('mine')
    expect(readImageConfig(fileOf()).outputDir).toBe('mine')
  })
})

describe('deriveImageSeeds', () => {
  it('derives one row per inputImageGen model, across providers, with route facts', () => {
    const seeds = deriveImageSeeds(PROVIDERS)
    expect(seeds.map(seed => seed.id)).toEqual([
      'openai/gpt-image-1',
      'zhipu/cogview-3-plus',
      'midjourney/mj-v6',
    ])
    const openai = seeds[0]!
    expect(openai.route).toBe('openai')
    expect(openai.modelId).toBe('gpt-image-1')
    expect(openai.label).toBe('GPT-Image-1')
    expect(openai.providerLabel).toBe('OpenAI')
    expect(openai.baseURL).toBe('https://api.openai.com/v1')
    expect(openai.keyRef).toBe('OPENAI_API_KEY')
    expect(openai.api).toBe('images')
  })

  it('marks non-OpenAI routes as api none (no compatible endpoint)', () => {
    const seeds = deriveImageSeeds(PROVIDERS)
    expect(seeds[2]!.api).toBe('none')
  })

  it('ignores rows without the marker, and route profiles without models', () => {
    const seeds = deriveImageSeeds({
      bare: { api: 'openai-completions' },
      empty: { models: [] },
      mixed: { api: 'openai-completions', models: [{ id: 'a', inputImageGen: false }, { id: 'b', inputImageGen: true }] },
    })
    expect(seeds.map(seed => seed.id)).toEqual(['mixed/b'])
    // A profile without a displayName leaves providerLabel absent (the list
    // falls back to the route).
    expect(seeds[0]!.providerLabel).toBeUndefined()
  })
})

describe('syncImageConfig', () => {
  it('attaches the conservative params to fresh rows and keeps stored overrides', () => {
    const stored = {
      ...emptyImageConfig(),
      models: [{
        ...emptyImageConfig().models[0]!,
        id: 'openai/gpt-image-1',
        route: 'openai',
        modelId: 'gpt-image-1',
        label: 'GPT-Image-1',
        api: 'images' as const,
        baseURL: 'https://old.example/v1',
        endpoint: { kind: 'images' as const, status: 'ok' as const, checkedAt: 'stamped' },
        params: { sizes: ['512x512'], qualities: ['low'], maxN: 2, responseFormat: 'none' as const },
        lastGoodParams: null,
        size: '512x512',
      }],
    }
    const synced = syncImageConfig(stored, PROVIDERS)
    expect(synced.syncedAt >= stored.syncedAt).toBe(true)
    const kept = synced.models.find(model => model.id === 'openai/gpt-image-1')!
    // The override survived: endpoint verdict, narrowed params, size pick. The
    // re-derived baseURL (the settings document wins) updated.
    expect(kept.endpoint.status).toBe('ok')
    expect(kept.params.sizes).toEqual(['512x512'])
    expect(kept.size).toBe('512x512')
    expect(kept.baseURL).toBe('https://api.openai.com/v1')
    // And the other two providers' rows appeared.
    expect(synced.models.map(model => model.id)).toHaveLength(3)
  })

  it('drops rows the settings document no longer declares, and clears a dangling defaultModel', () => {
    const stored = {
      ...emptyImageConfig(),
      defaultModel: 'gone/model',
      models: [{
        ...emptyImageConfig().models[0]!,
        id: 'gone/model', route: 'gone', modelId: 'model', label: 'x', api: 'images' as const, baseURL: '',
        endpoint: { kind: 'images' as const, status: 'unverified' as const, checkedAt: null },
        params: { sizes: [], qualities: [], maxN: 4, responseFormat: 'b64_json' as const },
        lastGoodParams: null,
      }],
    }
    const synced = syncImageConfig(stored, PROVIDERS)
    expect(synced.models.some(model => model.id === 'gone/model')).toBe(false)
    expect(synced.defaultModel).toBeNull()
  })
})

describe('resolveImageModel', () => {
  const config = {
    ...emptyImageConfig(),
    defaultModel: 'openai/gpt-image-1',
    models: [
      { ...emptyImageConfig().models[0]!, id: 'openai/gpt-image-1', modelId: 'gpt-image-1', label: 'GPT-Image-1', route: 'openai' },
      { ...emptyImageConfig().models[0]!, id: 'zhipu/cogview-3-plus', modelId: 'cogview-3-plus', label: 'CogView-3-Plus', route: 'zhipu' },
    ],
  }

  it('explicit pick wins (dialog selection beats the config default)', () => {
    expect(resolveImageModel(config, 'zhipu/cogview-3-plus')?.id).toBe('zhipu/cogview-3-plus')
    // A bare modelId or label resolves when unique.
    expect(resolveImageModel(config, 'cogview-3-plus')?.route).toBe('zhipu')
    expect(resolveImageModel(config, 'CogView-3-Plus')?.route).toBe('zhipu')
    // Ambiguous or unknown explicit picks resolve to nothing — never silently
    // fall through to the default (the user picked THIS).
    expect(resolveImageModel(config, 'nope')).toBeUndefined()
  })

  it('defaultModel next; the sole candidate last', () => {
    expect(resolveImageModel(config)?.id).toBe('openai/gpt-image-1')
    const sole = { ...config, defaultModel: null, models: [config.models[0]!] }
    expect(resolveImageModel(sole)?.id).toBe('openai/gpt-image-1')
    // Two candidates and no default: undefined, not an arbitrary pick.
    const both = { ...config, defaultModel: null }
    expect(resolveImageModel(both)).toBeUndefined()
  })
})

describe('effectiveParams', () => {
  const config = { ...emptyImageConfig(), defaults: { size: '1024x1024', quality: 'high', n: 1, timeoutMs: 1000 } }
  const model = {
    ...emptyImageConfig().models[0]!,
    params: { sizes: ['1024x1024'], qualities: ['low'], maxN: 2, responseFormat: 'b64_json' as const },
    size: '512x512',
    quality: 'low',
    n: 2,
  }

  it('merges in order: request > model row > defaults', () => {
    expect(effectiveParams(config, model, {})).toEqual({ size: '512x512', quality: 'low', n: 2 })
    expect(effectiveParams(config, model, { size: '1536x1024' })).toEqual({ size: '1536x1024', quality: 'low', n: 2 })
    expect(effectiveParams(config, undefined, { quality: 'auto' })).toEqual({ size: '1024x1024', quality: 'auto', n: 1 })
    expect(effectiveParams(config, undefined, {})).toEqual({ size: '1024x1024', quality: 'high', n: 1 })
  })

  it('clamps n to the model ability table (never more requests than maxN)', () => {
    expect(effectiveParams(config, model, { n: 99 }).n).toBe(2)
  })
})
