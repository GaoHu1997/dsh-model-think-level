/** Live-source projection, strict preference reads and v2→v3 migration. */
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { emptyImageConfig, imageConfigFilePath, syncImageConfig } from '../src/image/config.js'
import { ImageConfiguration, ImageConfigurationError } from '../src/image/state.js'

let home: string
let file: string
beforeEach(() => {
  home = mkdtempSync(join(tmpdir(), 'image-live-state-'))
  file = imageConfigFilePath(home)
})
afterEach(() => rmSync(home, { recursive: true, force: true }))

function providers(baseURL = 'https://images.example/v1', keyRef = 'IMAGE_KEY') {
  return { images: { api: 'openai-completions', baseURL, apiKeyEnv: keyRef, models: [{ id: 'portrait', inputImageGen: true }] } }
}
function make(section: unknown = { providers: providers() }) {
  let value = section
  let unavailable = false
  const describe = vi.fn(() => unavailable ? [] : [{ ns: 'llm-pi-ai', value }])
  const configuration = new ImageConfiguration({ describe, file, now: () => new Date('2026-11-09T12:00:00Z') })
  return {
    configuration, describe,
    set: (next: unknown) => { value = next },
    unavailable: (next: boolean) => { unavailable = next },
  }
}
function saveRaw(raw: unknown) {
  mkdirSync(dirname(file), { recursive: true })
  writeFileSync(file, JSON.stringify(raw))
}
function raw(): Record<string, unknown> {
  return JSON.parse(readFileSync(file, 'utf8')) as Record<string, unknown>
}

const EMPTY_SECTIONS = [
  {},
  { providers: {} },
  { providers: { images: {} } },
  { providers: { images: { models: [] } } },
  { providers: { images: { models: [{ id: 'portrait', inputImageGen: false }] } } },
]

describe('one live model source', () => {
  it.each(EMPTY_SECTIONS)('a resolved empty section is authoritative: %j', section => {
    const source = make(section)
    expect(source.configuration.read().models).toEqual([])
    expect(existsSync(file)).toBe(false)
    source.set({ providers: providers() })
    expect(source.configuration.read().models.map(model => model.id)).toEqual(['images/portrait'])
  })

  it('recovers from a missing namespace without a settings event, file or restart', () => {
    const source = make()
    source.unavailable(true)
    expect(() => source.configuration.read()).toThrow(/生图配置尚未就绪/)
    source.unavailable(false)
    expect(source.configuration.read().models).toHaveLength(1)
    expect(existsSync(file)).toBe(false)
  })

  it('reads current base URL, key reference and membership without invalidation', () => {
    const source = make()
    const first = source.configuration.read()
    source.set({ providers: providers('https://new.example/v1', 'NEW_KEY') })
    const second = source.configuration.read()
    expect(second.models[0]).toMatchObject({ baseURL: 'https://new.example/v1', keyRef: 'NEW_KEY' })
    expect(first.models[0]).toMatchObject({ baseURL: 'https://images.example/v1', keyRef: 'IMAGE_KEY' })
    source.set({ providers: {} })
    expect(source.configuration.read().models).toEqual([])
    expect(first.models).toHaveLength(1)
  })

  it.each([null, [], 'bad', { providers: null }, { providers: [] }])('rejects malformed live settings: %j', section => {
    const source = make(section)
    expect(() => source.configuration.read()).toThrow(/生图配置无效/)
  })

  it('does not leak settings-read errors or use the previous configuration', () => {
    const source = make()
    expect(source.configuration.read().models).toHaveLength(1)
    source.describe.mockImplementation(() => { throw new Error('upstream SECRET_TOKEN') })
    expect(() => source.configuration.read()).toThrow(ImageConfigurationError)
    expect(() => source.configuration.read()).toThrow(/宿主模型设置读取失败/)
    try { source.configuration.read() } catch (error) {
      expect((error as Error).message).not.toContain('SECRET_TOKEN')
    }
    source.describe.mockImplementation(() => [{ ns: 'llm-pi-ai', value: { providers: providers() } }])
    expect(source.configuration.read().models).toHaveLength(1)
  })
})

describe('preferences are independent and reads never write', () => {
  it('keeps the selected default when the model disappears and returns', () => {
    const source = make()
    source.configuration.update(document => ({ ...document, defaultModel: 'images/portrait' }))
    const text = readFileSync(file, 'utf8')
    const stamp = statSync(file).mtimeMs
    source.set({ providers: {} })
    expect(source.configuration.read()).toMatchObject({ defaultModel: 'images/portrait', models: [] })
    source.set({ providers: providers() })
    expect(source.configuration.read().defaultModel).toBe('images/portrait')
    expect(readFileSync(file, 'utf8')).toBe(text)
    expect(statSync(file).mtimeMs).toBe(stamp)
  })

  it('closing the switch wins even when settings are unavailable', () => {
    const source = make()
    source.configuration.update(document => ({ ...document, enabled: false }))
    source.unavailable(true)
    expect(source.configuration.forGeneration()).toMatchObject({ enabled: false, models: [] })
    expect(source.describe).not.toHaveBeenCalled()
    source.configuration.update(document => ({ ...document, enabled: true }))
    expect(() => source.configuration.forGeneration()).toThrow(/生图配置尚未就绪/)
  })

  it('captures preferences and settings only once for a generation', () => {
    const source = make()
    const read = vi.spyOn(source.configuration, 'preferences')
    expect(source.configuration.forGeneration().models).toHaveLength(1)
    expect(read).toHaveBeenCalledTimes(1)
    expect(source.describe).toHaveBeenCalledTimes(1)
  })

  it.each(['{broken', 'null', '[]', '{"version":999}', '"bad"'])('fails closed on corrupt/unsupported preferences: %s', text => {
    mkdirSync(dirname(file), { recursive: true })
    writeFileSync(file, text)
    const source = make()
    expect(() => source.configuration.forGeneration()).toThrow(/生图配置偏好文件/)
    expect(() => source.configuration.update(document => ({ ...document, enabled: true }))).toThrow(/生图配置偏好文件/)
    expect(readFileSync(file, 'utf8')).toBe(text)
  })

  it('does not turn an unreadable file into defaults and permits recovery', () => {
    mkdirSync(file, { recursive: true })
    const source = make()
    expect(() => source.configuration.read()).toThrow(/生图配置偏好文件/)
    rmSync(file, { recursive: true })
    expect(source.configuration.read().models).toHaveLength(1)
    expect(existsSync(file)).toBe(false)
  })

  it('commits separate mutations without overwriting previously saved preferences', () => {
    const first = make().configuration
    const second = make().configuration
    first.update(document => ({ ...document, defaultModel: 'images/portrait' }))
    second.update(document => ({ ...document, enabled: false }))
    first.update(document => ({ ...document, outputDir: 'portraits' }))
    expect(second.preferences()).toMatchObject({ version: 3, enabled: false, defaultModel: 'images/portrait', outputDir: 'portraits' })
  })
})

describe('migration and connection-scoped observations', () => {
  it('legacy rows never authorize generation; migration is lazy and backed up', () => {
    const legacy = {
      ...syncImageConfig(emptyImageConfig(), providers()),
      defaultModel: 'images/portrait',
      defaults: { size: '1024x1536', quality: 'medium', n: 2, timeoutMs: 600_000 },
      outputDir: 'portraits',
    }
    saveRaw(legacy)
    const original = readFileSync(file, 'utf8')
    const source = make({ providers: {} })
    expect(source.configuration.read()).toMatchObject({ models: [], defaultModel: 'images/portrait', outputDir: 'portraits', defaults: legacy.defaults })
    source.unavailable(true)
    expect(() => source.configuration.read()).toThrow(/生图配置尚未就绪/)
    expect(readFileSync(file, 'utf8')).toBe(original)
    source.configuration.update(document => ({ ...document, enabled: false }))
    expect(raw()['version']).toBe(3)
    expect(raw()).not.toHaveProperty('models')
    expect(raw()).not.toHaveProperty('syncedAt')
    expect(readFileSync(`${file}.v2.bak`, 'utf8')).toBe(original)
    const stored = readFileSync(file, 'utf8')
    expect(stored).not.toContain('images.example')
    expect(stored).not.toContain('IMAGE_KEY')
  })

  it('ignores injected models even in a v3 preference document', () => {
    saveRaw({ version: 3, models: syncImageConfig(emptyImageConfig(), providers()).models })
    const source = make({ providers: {} })
    expect(source.configuration.read().models).toEqual([])
    source.configuration.update(document => document)
    expect(raw()).not.toHaveProperty('models')
  })

  it('retains observations only on the exact recorded connection', () => {
    const source = make()
    const model = source.configuration.read().models[0]!
    source.configuration.record(model, { ...model.params, responseFormat: 'none' })
    expect(source.configuration.read().models[0]).toMatchObject({ endpoint: { status: 'ok' }, lastGoodParams: { responseFormat: 'none' } })
    source.set({ providers: providers('https://other.example/v1') })
    expect(source.configuration.read().models[0]).toMatchObject({ endpoint: { status: 'unverified' }, lastGoodParams: null })
    source.set({ providers: providers('https://images.example/v1', 'OTHER_KEY') })
    expect(source.configuration.read().models[0]!.lastGoodParams).toBeNull()
  })

  it('an in-flight diagnostic belongs to its captured model, not a new same-ID connection', () => {
    const source = make()
    const old = source.configuration.read().models[0]!
    source.set({ providers: providers('https://replacement.example/v1') })
    source.configuration.record(old, { ...old.params, responseFormat: 'none' })
    expect(source.configuration.read().models[0]!.lastGoodParams).toBeNull()
    source.set({ providers: providers() })
    expect(source.configuration.read().models[0]!.lastGoodParams?.responseFormat).toBe('none')
  })

  it('migrates valid legacy diagnostics only when the host connection matches', () => {
    const legacy = syncImageConfig(emptyImageConfig(), providers())
    saveRaw({ ...legacy, models: legacy.models.map(model => ({ ...model, lastGoodParams: { ...model.params, responseFormat: 'none' } })) })
    const source = make()
    expect(source.configuration.read().models[0]!.lastGoodParams?.responseFormat).toBe('none')
    source.set({ providers: providers('https://replacement.example/v1') })
    expect(source.configuration.read().models[0]!.lastGoodParams).toBeNull()
  })

  it('records terminal unsupported endpoints without removing the live model', () => {
    const source = make()
    source.configuration.record(source.configuration.read().models[0]!, null)
    expect(source.configuration.read().models[0]).toMatchObject({ id: 'images/portrait', endpoint: { status: 'unsupported' }, lastGoodParams: null })
  })

  it('new adapter instances use live settings, never a previous instance catalogue', () => {
    const first = make()
    const model = first.configuration.read().models[0]!
    first.configuration.record(model, model.params)
    const reloaded = make({ providers: {} })
    expect(reloaded.configuration.read().models).toEqual([])
    reloaded.set({ providers: providers() })
    expect(reloaded.configuration.read().models).toHaveLength(1)
  })
})
