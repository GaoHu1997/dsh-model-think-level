// @vitest-environment jsdom
/**
 * The imagegen client entry: the completion candidates (pure), the registered
 * input-trigger source over a fake host service, and the switcher regression
 * the design pins — the badge order 视觉 → 思考 → 生图, and the point-select
 * behavior staying `directory.select` (zero interception).
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  imagegenCandidates,
  imagegenCommandCandidate,
} from '../src/client/injection/imagegen-completion.js'
import {
  invalidateImagegenModels,
  registerImagegenCompletion,
} from '../src/client/injection/imagegen-entry.js'
import { modelTags } from '../src/client/ComposerSlider.js'
import { createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { act } from 'react'
import { IMAGE_CONFIG_PATH } from '../src/constants.js'

const MODELS = [
  { id: 'openai/gpt-image-1', label: 'GPT-Image-1', isDefault: true },
  { id: 'zhipu/cogview-3-plus', label: 'CogView-3-Plus', isDefault: false },
]

beforeEach(() => {
  invalidateImagegenModels()
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('imagegenCandidates (pure, model-level 一期)', () => {
  it('an empty first token offers every model, default marked', () => {
    const candidates = imagegenCandidates('', MODELS)
    expect(candidates).toHaveLength(2)
    expect(candidates[0]).toMatchObject({ label: 'GPT-Image-1（默认）', insertText: 'openai/gpt-image-1', kind: 'model' })
    expect(candidates[1]!.label).toBe('CogView-3-Plus')
  })

  it('a prefix completes over both the id and the label, case-insensitively', () => {
    expect(imagegenCandidates('gpt', MODELS)).toHaveLength(1)
    expect(imagegenCandidates('cogview', MODELS).map(candidate => candidate.insertText)).toEqual(['zhipu/cogview-3-plus'])
    expect(imagegenCandidates('GPT-IMAGE', MODELS)).toHaveLength(1)
    expect(imagegenCandidates('nope', MODELS)).toEqual([])
  })

  it('the first token keeps completing even when it already names a full model', () => {
    // The menu completes the FIRST token only: the rest of the line is the
    // prompt, and picking a candidate replaces just that token.
    const candidates = imagegenCandidates('openai/gpt-image-1 一只戴帽子的猫', MODELS)
    expect(candidates).toHaveLength(1)
    expect(candidates[0]!.insertText).toBe('openai/gpt-image-1')
  })

  it('the command word candidate (menu display) is stable', () => {
    expect(imagegenCommandCandidate()).toMatchObject({ label: '生图', kind: 'param' })
  })
})

describe('registerImagegenCompletion', () => {
  it('registers one source with the / trigger and model candidates from the config route', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({
      ok: true,
      models: [
        { id: 'openai/gpt-image-1', label: 'GPT-Image-1', route: 'openai', modelId: 'gpt-image-1', api: 'images', baseURL: '', endpoint: { kind: 'images', status: 'unverified', checkedAt: null }, params: { sizes: [], qualities: [], maxN: 4, responseFormat: 'b64_json' }, lastGoodParams: null },
        { id: 'zhipu/cogview-3-plus', label: 'CogView', route: 'zhipu', modelId: 'cogview-3-plus', api: 'images', baseURL: '', endpoint: { kind: 'images', status: 'unverified', checkedAt: null }, params: { sizes: [], qualities: [], maxN: 4, responseFormat: 'b64_json' }, lastGoodParams: null },
      ],
      defaultModel: 'openai/gpt-image-1',
      defaults: {}, outputDir: '', mcp: { installed: false, serverName: '', toolName: '', restartRequired: false, diagnostics: { lastCheckAt: null, ok: false, error: null } },
    }), { status: 200 })) as unknown as typeof globalThis.fetch)
    const sources: Record<string, unknown>[] = []
    const ctx = {
      inputTriggers: { registerSource: (source: Record<string, unknown>) => { sources.push(source) } },
    }
    const dispose = registerImagegenCompletion(ctx as never)
    expect(sources).toHaveLength(1)
    expect(sources[0]).toMatchObject({ trigger: '/', name: 'imagegen' })
    const candidates = await (sources[0]!['candidates'] as (projection: { text?: string }) => Promise<unknown[]>)({ text: '/生图 ' })
    expect(candidates).toHaveLength(2)
    expect((candidates[0] as { label: string }).label).toContain('GPT-Image-1')
    // Not our command: silence.
    const others = await (sources[0]!['candidates'] as (projection: { text?: string }) => Promise<unknown[]>)({ text: '/effort high' })
    expect(others).toEqual([])
    dispose()
  })

  it('stays silent on a host without the input-trigger service', () => {
    expect(() => registerImagegenCompletion({} as never)).not.toThrow()
  })

  it('survives a cordis context that THROWS on an undeclared service read', () => {
    // Real cordis rejects `ctx.<service>` for any name absent from the module's
    // `inject` list ("cannot get property \"inputTriggers\" without inject").
    // This plugin does not declare inputTriggers, so the lookup must be fenced —
    // an unguarded read took the whole client entry down at boot.
    const throwingCtx = new Proxy({}, {
      get(_target, key) {
        throw new Error(`cannot get property "${String(key)}" without inject`)
      },
    })
    expect(() => registerImagegenCompletion(throwingCtx as never)).not.toThrow()
    const dispose = registerImagegenCompletion(throwingCtx as never)
    expect(typeof dispose).toBe('function')
    expect(() => dispose()).not.toThrow()
  })

  it('the completion cache invalidates (a settings change must not answer stale rows)', async () => {
    let payload = { models: [{ id: 'a/x', label: 'A' }], defaultModel: null }
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({
      ok: true, ...payload, defaults: {}, outputDir: '',
      mcp: { installed: false, serverName: '', toolName: '', restartRequired: false, diagnostics: { lastCheckAt: null, ok: false, error: null } },
    }), { status: 200 })) as unknown as typeof globalThis.fetch)
    const sources: Record<string, unknown>[] = []
    registerImagegenCompletion({ inputTriggers: { registerSource: (s: Record<string, unknown>) => { sources.push(s) } } } as never)
    const candidatesOf = sources[0]!['candidates'] as (projection: { text?: string }) => Promise<unknown[]>
    expect(await candidatesOf({ text: '/生图 ' })).toHaveLength(1)
    invalidateImagegenModels()
    payload = { models: [{ id: 'a/x', label: 'A' }, { id: 'b/y', label: 'B' }], defaultModel: null }
    expect(await candidatesOf({ text: '/生图 ' })).toHaveLength(2)
  })
})

describe('switcher regression (the v3 contract)', () => {
  /** Mount modelTags and read the badge class order back. */
  function badgeOrder(imageGen: boolean, model: Record<string, unknown> = { id: 'm', name: 'M', reasoning: { efforts: ['high'] }, input: ['image'] }): string[] {
    const host = document.createElement('div')
    document.body.appendChild(host)
    let root: Root | null = null
    const read = (): string[] =>
      [...host.querySelectorAll('.bre-tag')].map(tag => tag.querySelector('svg')?.getAttribute('aria-label') ?? '')
    act(() => {
      root = createRoot(host)
      root.render(createElement('div', null, modelTags(
        model as never,
        (key: string) => key,
        undefined,
        imageGen,
      )))
    })
    const order = read()
    act(() => { root?.unmount() })
    host.remove()
    return order
  }

  it('the badges keep the shipped order 视觉 → 思考 → 生图 (no regrouping)', () => {
    expect(badgeOrder(true)).toEqual(['tagVision', 'tagThinking', 'tagImageGen'])
  })

  it('a chat model without capabilities renders no badges at all', () => {
    expect(badgeOrder(false, { id: 'plain', name: 'Plain' })).toEqual([])
  })
})
