// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { AutoContinueConfig } from '../src/client/auto-continue-pref.js'
import { DEFAULT_AUTO_CONTINUE_POLICY } from '../src/client/auto-continue-rules.js'

type Preferences = typeof import('../src/client/auto-continue-pref.js')

const ENABLE_KEY = 'dsh-model-think-level.auto-continue.enabled'
const CONFIG_KEY = 'dsh-model-think-level.auto-continue.config'
const cfg = (waitSeconds: unknown, maxRetries: unknown): AutoContinueConfig => ({
  waitSeconds: waitSeconds as number,
  maxRetries: maxRetries as number,
  policy: DEFAULT_AUTO_CONTINUE_POLICY,
})
const DEFAULTS = cfg(2, 5)
const disposers: Array<() => void> = []

// Do not statically import the store: its initial state is read at module load.
// Clearing both storage and the module registry isolates every case, including
// reload tests, from other specs that use this same module-level preference.
const loadPreferences = (): Promise<Preferences> => import('../src/client/auto-continue-pref.js')

beforeEach(() => {
  vi.restoreAllMocks()
  window.localStorage.clear()
  vi.resetModules()
})

afterEach(() => {
  for (const dispose of disposers.splice(0).reverse()) dispose()
  vi.restoreAllMocks()
  window.localStorage.clear()
  vi.resetModules()
})

describe('auto-continue preference defaults and persistence', () => {
  it('keeps the legacy key, defaults OFF, and exposes a stable immutable default snapshot', async () => {
    const write = vi.spyOn(Storage.prototype, 'setItem')
    const prefs = await loadPreferences()

    expect(prefs.AUTO_CONTINUE_PREF_KEY).toBe(ENABLE_KEY)
    expect(prefs.AUTO_CONTINUE_CONFIG_KEY).toBe(CONFIG_KEY)
    expect(prefs.DEFAULT_AUTO_CONTINUE_CONFIG).toEqual(DEFAULTS)
    expect(Object.isFrozen(prefs.DEFAULT_AUTO_CONTINUE_CONFIG)).toBe(true)
    expect(prefs.AUTO_CONTINUE_WAIT_MIN).toBe(1)
    expect(prefs.AUTO_CONTINUE_WAIT_MAX).toBe(3600)
    expect(prefs.AUTO_CONTINUE_RETRIES_MIN).toBe(1)
    expect(prefs.AUTO_CONTINUE_RETRIES_MAX).toBe(100)
    expect(prefs.autoContinueEnabled()).toBe(false)

    const snapshot = prefs.autoContinueConfig()
    expect(snapshot).toEqual(DEFAULTS)
    expect(prefs.autoContinueConfig()).toBe(snapshot)
    expect(Object.isFrozen(snapshot)).toBe(true)
    expect(Reflect.set(snapshot, 'waitSeconds', 99)).toBe(false)
    expect(Reflect.set(snapshot, 'maxRetries', 99)).toBe(false)
    expect(prefs.autoContinueConfig()).toBe(snapshot)
    expect(snapshot).toEqual(DEFAULTS)
    expect(write).not.toHaveBeenCalled()
    expect(window.localStorage.length).toBe(0)
  })

  it.each([
    { stored: 'true', enabled: true },
    { stored: 'false', enabled: false },
    { stored: 'TRUE', enabled: false },
    { stored: '1', enabled: false },
  ])('preserves the existing legacy enable value $stored without writing a migration', async ({ stored, enabled }) => {
    window.localStorage.setItem(ENABLE_KEY, stored)
    const write = vi.spyOn(Storage.prototype, 'setItem')
    const prefs = await loadPreferences()

    expect(prefs.autoContinueEnabled()).toBe(enabled)
    expect(prefs.autoContinueConfig()).toEqual(DEFAULTS)
    expect(window.localStorage.getItem(ENABLE_KEY)).toBe(stored)
    expect(window.localStorage.getItem(CONFIG_KEY)).toBeNull()
    expect(write).not.toHaveBeenCalled()
  })

  it.each([
    { name: 'valid', stored: '{"waitSeconds":17,"maxRetries":9}', expected: cfg(17, 9) },
    { name: 'malformed', stored: '{broken', expected: DEFAULTS },
    { name: 'out of range', stored: '{"waitSeconds":0.9,"maxRetries":1000.5}', expected: cfg(1, 100) },
    { name: 'partially invalid', stored: '{"waitSeconds":"17","maxRetries":9}', expected: cfg(2, 9) },
  ])('safely reads $name stored config without rewriting it or disabling legacy opt-in', async ({ stored, expected }) => {
    window.localStorage.setItem(ENABLE_KEY, 'true')
    window.localStorage.setItem(CONFIG_KEY, stored)
    const write = vi.spyOn(Storage.prototype, 'setItem')
    const prefs = await loadPreferences()

    expect(prefs.autoContinueEnabled()).toBe(true)
    expect(prefs.autoContinueConfig()).toEqual(expected)
    expect(Object.isFrozen(prefs.autoContinueConfig())).toBe(true)
    expect(window.localStorage.getItem(CONFIG_KEY)).toBe(stored)
    expect(window.localStorage.getItem(ENABLE_KEY)).toBe('true')
    expect(write).not.toHaveBeenCalled()
  })

  it('re-imports enabled and disabled preferences from JSON storage after a page refresh', async () => {
    const prefs = await loadPreferences()
    prefs.setAutoContinueConfig(cfg(21, 8))
    prefs.setAutoContinueEnabled(true)
    const previousSnapshot = prefs.autoContinueConfig()
    const stored = window.localStorage.getItem(CONFIG_KEY)
    expect(JSON.parse(stored!)).toEqual(cfg(21, 8))
    expect(window.localStorage.getItem(ENABLE_KEY)).toBe('true')

    vi.resetModules()
    const refreshed = await loadPreferences()
    expect(refreshed).not.toBe(prefs)
    expect(refreshed.autoContinueEnabled()).toBe(true)
    expect(refreshed.autoContinueConfig()).toEqual(previousSnapshot)
    expect(refreshed.autoContinueConfig()).not.toBe(previousSnapshot)
    expect(refreshed.autoContinueConfig()).toBe(refreshed.autoContinueConfig())
    expect(Object.isFrozen(refreshed.autoContinueConfig())).toBe(true)

    refreshed.setAutoContinueEnabled(false)
    vi.resetModules()
    const disabledRefresh = await loadPreferences()
    expect(disabledRefresh.autoContinueEnabled()).toBe(false)
    expect(disabledRefresh.autoContinueConfig()).toEqual(cfg(21, 8))
    expect(window.localStorage.getItem(CONFIG_KEY)).toBe(stored)
    expect(window.localStorage.getItem(ENABLE_KEY)).toBe('false')
  })

  it('defaults safely when localStorage reads throw', async () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new DOMException('Storage is unavailable', 'SecurityError')
    })
    const prefs = await loadPreferences()

    expect(prefs.autoContinueEnabled()).toBe(false)
    expect(prefs.autoContinueConfig()).toEqual(DEFAULTS)
    expect(Object.isFrozen(prefs.autoContinueConfig())).toBe(true)
  })
})

describe('auto-continue config setters and subscriptions', () => {
  it('merges each partial update without losing the other field and persists both fields', async () => {
    const prefs = await loadPreferences()
    prefs.setAutoContinueConfig({ waitSeconds: 13 })
    expect(prefs.autoContinueConfig()).toEqual(cfg(13, 5))
    expect(JSON.parse(window.localStorage.getItem(CONFIG_KEY)!)).toEqual(cfg(13, 5))

    prefs.setAutoContinueConfig({ maxRetries: 7 })
    expect(prefs.autoContinueConfig()).toEqual(cfg(13, 7))
    expect(JSON.parse(window.localStorage.getItem(CONFIG_KEY)!)).toEqual(cfg(13, 7))

    prefs.setAutoContinueConfig({ waitSeconds: 19 })
    expect(prefs.autoContinueConfig()).toEqual(cfg(19, 7))
    expect(JSON.parse(window.localStorage.getItem(CONFIG_KEY)!)).toEqual(cfg(19, 7))
    expect(prefs.autoContinueEnabled()).toBe(false)
    expect(window.localStorage.getItem(ENABLE_KEY)).toBeNull()
  })

  it('notifies and writes only real normalized changes while retaining old immutable snapshots', async () => {
    const prefs = await loadPreferences()
    const original = prefs.autoContinueConfig()
    const observed: AutoContinueConfig[] = []
    const listener = vi.fn(() => { observed.push(prefs.autoContinueConfig()) })
    const enabledListener = vi.fn()
    disposers.push(prefs.subscribeAutoContinueConfig(listener), prefs.subscribeAutoContinueEnabled(enabledListener))
    const write = vi.spyOn(Storage.prototype, 'setItem')

    prefs.setAutoContinueConfig({})
    prefs.setAutoContinueConfig(cfg(2, 5))
    prefs.setAutoContinueConfig(cfg(2.9, 5.9))
    expect(prefs.autoContinueConfig()).toBe(original)
    expect(listener).not.toHaveBeenCalled()
    expect(write).not.toHaveBeenCalled()

    const patch = { waitSeconds: 12 }
    prefs.setAutoContinueConfig(patch)
    const changed = prefs.autoContinueConfig()
    patch.waitSeconds = 99
    expect(changed).toEqual(cfg(12, 5))
    expect(changed).not.toBe(original)
    expect(Object.isFrozen(changed)).toBe(true)
    expect(Reflect.set(changed, 'maxRetries', 99)).toBe(false)
    expect(original).toEqual(DEFAULTS)
    expect(observed).toEqual([changed])
    expect(observed[0]).toBe(changed)
    expect(listener).toHaveBeenCalledTimes(1)
    expect(write).toHaveBeenCalledExactlyOnceWith(CONFIG_KEY, JSON.stringify(changed))

    prefs.setAutoContinueConfig({ waitSeconds: 12.75 })
    expect(prefs.autoContinueConfig()).toBe(changed)
    expect(listener).toHaveBeenCalledTimes(1)
    expect(write).toHaveBeenCalledTimes(1)
    expect(enabledListener).not.toHaveBeenCalled()
  })

  it('clamps and truncates setter values before deciding whether to save or notify', async () => {
    const prefs = await loadPreferences()
    const listener = vi.fn()
    disposers.push(prefs.subscribeAutoContinueConfig(listener))
    const write = vi.spyOn(Storage.prototype, 'setItem')

    prefs.setAutoContinueConfig(cfg(-4.8, 1000.5))
    const snapshot = prefs.autoContinueConfig()
    expect(snapshot).toEqual(cfg(1, 100))
    expect(write).toHaveBeenCalledExactlyOnceWith(CONFIG_KEY, JSON.stringify(cfg(1, 100)))
    expect(listener).toHaveBeenCalledTimes(1)

    prefs.setAutoContinueConfig(cfg(0, 999))
    expect(prefs.autoContinueConfig()).toBe(snapshot)
    expect(write).toHaveBeenCalledTimes(1)
    expect(listener).toHaveBeenCalledTimes(1)

    prefs.setAutoContinueConfig({ waitSeconds: NaN })
    expect(prefs.autoContinueConfig()).toEqual(cfg(2, 100))
    expect(listener).toHaveBeenCalledTimes(2)
  })

  it('does not reset, replace, or notify config when enabling or disabling auto-continue', async () => {
    const prefs = await loadPreferences()
    prefs.setAutoContinueConfig(cfg(11, 7))
    const snapshot = prefs.autoContinueConfig()
    const stored = window.localStorage.getItem(CONFIG_KEY)
    const configListener = vi.fn()
    const enabledListener = vi.fn()
    disposers.push(prefs.subscribeAutoContinueConfig(configListener), prefs.subscribeAutoContinueEnabled(enabledListener))
    const write = vi.spyOn(Storage.prototype, 'setItem')

    prefs.setAutoContinueEnabled(true)
    prefs.setAutoContinueEnabled(true)
    prefs.setAutoContinueEnabled(false)
    prefs.setAutoContinueEnabled(false)

    expect(prefs.autoContinueEnabled()).toBe(false)
    expect(prefs.autoContinueConfig()).toBe(snapshot)
    expect(prefs.autoContinueConfig()).toEqual(cfg(11, 7))
    expect(window.localStorage.getItem(CONFIG_KEY)).toBe(stored)
    expect(window.localStorage.getItem(ENABLE_KEY)).toBe('false')
    expect(write.mock.calls).toEqual([[ENABLE_KEY, 'true'], [ENABLE_KEY, 'false']])
    expect(configListener).not.toHaveBeenCalled()
    expect(enabledListener).toHaveBeenCalledTimes(2)
  })

  it('stops notifying disposed config and enable subscriptions', async () => {
    const prefs = await loadPreferences()
    const configListener = vi.fn()
    const enabledListener = vi.fn()
    const disposeConfig = prefs.subscribeAutoContinueConfig(configListener)
    const disposeEnabled = prefs.subscribeAutoContinueEnabled(enabledListener)
    disposers.push(disposeConfig, disposeEnabled)

    prefs.setAutoContinueConfig({ waitSeconds: 4 })
    prefs.setAutoContinueEnabled(true)
    expect(configListener).toHaveBeenCalledTimes(1)
    expect(enabledListener).toHaveBeenCalledTimes(1)

    disposeConfig()
    disposeEnabled()
    prefs.setAutoContinueConfig({ maxRetries: 6 })
    prefs.setAutoContinueEnabled(false)
    expect(configListener).toHaveBeenCalledTimes(1)
    expect(enabledListener).toHaveBeenCalledTimes(1)
  })
})

describe('untrusted config normalization and parsing', () => {
  it.each([
    { name: 'undefined', input: undefined },
    { name: 'null', input: null },
    { name: 'boolean', input: false },
    { name: 'number', input: 7 },
    { name: 'string', input: 'config' },
    { name: 'array', input: [] },
    { name: 'empty object', input: {} },
  ])('defaults missing or non-record $name input', async ({ input }) => {
    const prefs = await loadPreferences()
    const config = prefs.normalizeAutoContinueConfig(input)
    expect(config).toEqual(DEFAULTS)
    expect(Object.isFrozen(config)).toBe(true)
  })

  it.each([
    { name: 'missing', value: undefined },
    { name: 'null', value: null },
    { name: 'numeric string', value: '17' },
    { name: 'boolean', value: true },
    { name: 'object', value: {} },
    { name: 'array', value: [] },
    { name: 'NaN', value: NaN },
    { name: 'positive Infinity', value: Infinity },
    { name: 'negative Infinity', value: -Infinity },
  ])('defaults each $name field independently, retaining the other valid field', async ({ value }) => {
    const prefs = await loadPreferences()
    expect(prefs.normalizeAutoContinueConfig(cfg(value, 9))).toEqual(cfg(2, 9))
    expect(prefs.normalizeAutoContinueConfig(cfg(17, value))).toEqual(cfg(17, 5))
  })

  it.each([
    { name: 'lower endpoints', input: cfg(1, 1), expected: cfg(1, 1) },
    { name: 'upper endpoints', input: cfg(3600, 100), expected: cfg(3600, 100) },
    { name: 'positive fractions', input: cfg(3.9, 7.9), expected: cfg(3, 7) },
    { name: 'sub-one fractions', input: cfg(0.9, 0.9), expected: cfg(1, 1) },
    { name: 'zero', input: cfg(0, 0), expected: cfg(1, 1) },
    { name: 'negative fractions', input: cfg(-8.9, -3.9), expected: cfg(1, 1) },
    { name: 'above upper bounds', input: cfg(3601.9, 101.9), expected: cfg(3600, 100) },
    { name: 'huge finite numbers', input: cfg(Number.MAX_VALUE, Number.MAX_VALUE), expected: cfg(3600, 100) },
  ])('truncates and clamps $name to whole-number limits', async ({ input, expected }) => {
    const prefs = await loadPreferences()
    const config = prefs.normalizeAutoContinueConfig(input)
    expect(config).toEqual(expected)
    expect(Object.isFrozen(config)).toBe(true)
  })

  it.each([
    null,
    '',
    'not-json',
    '{',
    'null',
    '"text"',
    'true',
    '42',
    '[]',
    '{}',
    '{"waitSeconds":"8","maxRetries":false}',
    '{"waitSeconds":null,"maxRetries":null}',
    '{"waitSeconds":NaN,"maxRetries":Infinity}',
    '{"waitSeconds":1e400,"maxRetries":-1e400}',
  ])('parses missing, malformed, or unusable JSON %j as safe defaults', async (stored) => {
    const prefs = await loadPreferences()
    const config = prefs.parseAutoContinueConfig(stored)
    expect(config).toEqual(DEFAULTS)
    expect(Object.isFrozen(config)).toBe(true)
  })

  it.each([
    { stored: '{"waitSeconds":17}', expected: cfg(17, 5) },
    { stored: '{"maxRetries":9}', expected: cfg(2, 9) },
    { stored: '{"waitSeconds":"bad","maxRetries":9}', expected: cfg(2, 9) },
    { stored: '{"waitSeconds":17,"maxRetries":null}', expected: cfg(17, 5) },
    { stored: '{"waitSeconds":3600.9,"maxRetries":-5.8}', expected: cfg(3600, 1) },
  ])('normalizes partial or bounded JSON $stored field by field', async ({ stored, expected }) => {
    const prefs = await loadPreferences()
    expect(prefs.parseAutoContinueConfig(stored)).toEqual(expected)
  })
})

describe('cross-tab synchronization and unavailable storage', () => {
  it('adopts a separate immutable snapshot without writing back or notifying equal normalized values', async () => {
    const prefs = await loadPreferences()
    const original = prefs.autoContinueConfig()
    const observed: AutoContinueConfig[] = []
    const listener = vi.fn(() => { observed.push(prefs.autoContinueConfig()) })
    const enabledListener = vi.fn()
    disposers.push(prefs.subscribeAutoContinueConfig(listener), prefs.subscribeAutoContinueEnabled(enabledListener))
    const write = vi.spyOn(Storage.prototype, 'setItem')
    const incoming = { waitSeconds: 23, maxRetries: 8 }

    prefs.syncAutoContinueConfig(incoming)
    const adopted = prefs.autoContinueConfig()
    expect(adopted).toEqual({ ...incoming, policy: DEFAULT_AUTO_CONTINUE_POLICY })
    expect(adopted).not.toBe(incoming)
    expect(adopted).not.toBe(original)
    expect(Object.isFrozen(adopted)).toBe(true)
    expect(Object.isFrozen(incoming)).toBe(false)
    expect(observed[0]).toBe(adopted)
    incoming.waitSeconds = 99
    expect(adopted.waitSeconds).toBe(23)

    prefs.syncAutoContinueConfig(cfg(23, 8))
    prefs.syncAutoContinueConfig(cfg(23.9, 8.9))
    expect(prefs.autoContinueConfig()).toBe(adopted)
    expect(listener).toHaveBeenCalledTimes(1)
    expect(enabledListener).not.toHaveBeenCalled()
    expect(prefs.autoContinueEnabled()).toBe(false)
    expect(write).not.toHaveBeenCalled()
    expect(window.localStorage.getItem(CONFIG_KEY)).toBeNull()
  })

  it('normalizes unsafe cross-tab values and missing or malformed records without echoing storage', async () => {
    const prefs = await loadPreferences()
    const listener = vi.fn()
    disposers.push(prefs.subscribeAutoContinueConfig(listener))
    const write = vi.spyOn(Storage.prototype, 'setItem')
    const defaults = prefs.autoContinueConfig()

    prefs.syncAutoContinueConfig(cfg(NaN, Infinity))
    expect(prefs.autoContinueConfig()).toBe(defaults)
    expect(listener).not.toHaveBeenCalled()

    prefs.syncAutoContinueConfig(cfg(-3.9, 999.8))
    const bounded = prefs.autoContinueConfig()
    expect(bounded).toEqual(cfg(1, 100))
    expect(Object.isFrozen(bounded)).toBe(true)
    expect(listener).toHaveBeenCalledTimes(1)
    prefs.syncAutoContinueConfig(cfg(0, 1000))
    expect(prefs.autoContinueConfig()).toBe(bounded)
    expect(listener).toHaveBeenCalledTimes(1)

    prefs.syncAutoContinueConfig(prefs.parseAutoContinueConfig(null))
    const restored = prefs.autoContinueConfig()
    expect(restored).toEqual(DEFAULTS)
    expect(listener).toHaveBeenCalledTimes(2)
    prefs.syncAutoContinueConfig(prefs.parseAutoContinueConfig('{broken'))
    expect(prefs.autoContinueConfig()).toBe(restored)
    expect(listener).toHaveBeenCalledTimes(2)
    expect(write).not.toHaveBeenCalled()
    expect(window.localStorage.getItem(CONFIG_KEY)).toBeNull()
  })

  it('syncs enable changes without a write-back, config reset, or duplicate notification', async () => {
    const prefs = await loadPreferences()
    prefs.setAutoContinueConfig(cfg(16, 6))
    const config = prefs.autoContinueConfig()
    const stored = window.localStorage.getItem(CONFIG_KEY)
    const configListener = vi.fn()
    const enabledListener = vi.fn()
    disposers.push(prefs.subscribeAutoContinueConfig(configListener), prefs.subscribeAutoContinueEnabled(enabledListener))
    const write = vi.spyOn(Storage.prototype, 'setItem')

    prefs.syncAutoContinueEnabled(true)
    expect(prefs.autoContinueEnabled()).toBe(true)
    prefs.syncAutoContinueEnabled(true)
    expect(enabledListener).toHaveBeenCalledTimes(1)
    prefs.syncAutoContinueEnabled(false)
    expect(prefs.autoContinueEnabled()).toBe(false)
    expect(enabledListener).toHaveBeenCalledTimes(2)
    expect(prefs.autoContinueConfig()).toBe(config)
    expect(configListener).not.toHaveBeenCalled()
    expect(write).not.toHaveBeenCalled()
    expect(window.localStorage.getItem(ENABLE_KEY)).toBeNull()
    expect(window.localStorage.getItem(CONFIG_KEY)).toBe(stored)
  })

  it.each(['QuotaExceededError', 'SecurityError'])('retains changed in-memory preferences and notifications when writes fail with %s', async (errorName) => {
    const stored = '{"waitSeconds":17,"maxRetries":9}'
    window.localStorage.setItem(CONFIG_KEY, stored)
    window.localStorage.setItem(ENABLE_KEY, 'false')
    const prefs = await loadPreferences()
    const previous = prefs.autoContinueConfig()
    const configListener = vi.fn()
    const enabledListener = vi.fn()
    disposers.push(prefs.subscribeAutoContinueConfig(configListener), prefs.subscribeAutoContinueEnabled(enabledListener))
    const write = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('Storage write refused', errorName)
    })

    expect(() => prefs.setAutoContinueConfig({ maxRetries: 10 })).not.toThrow()
    expect(() => prefs.setAutoContinueEnabled(true)).not.toThrow()
    const changed = prefs.autoContinueConfig()
    expect(changed).toEqual(cfg(17, 10))
    expect(changed).not.toBe(previous)
    expect(Object.isFrozen(changed)).toBe(true)
    expect(previous).toEqual(cfg(17, 9))
    expect(prefs.autoContinueEnabled()).toBe(true)
    expect(configListener).toHaveBeenCalledTimes(1)
    expect(enabledListener).toHaveBeenCalledTimes(1)
    expect(write.mock.calls).toEqual([[CONFIG_KEY, JSON.stringify(changed)], [ENABLE_KEY, 'true']])
    expect(window.localStorage.getItem(CONFIG_KEY)).toBe(stored)
    expect(window.localStorage.getItem(ENABLE_KEY)).toBe('false')

    prefs.setAutoContinueConfig({ maxRetries: 10 })
    prefs.setAutoContinueEnabled(true)
    expect(prefs.autoContinueConfig()).toBe(changed)
    expect(write).toHaveBeenCalledTimes(2)
    expect(configListener).toHaveBeenCalledTimes(1)
    expect(enabledListener).toHaveBeenCalledTimes(1)
  })
})
