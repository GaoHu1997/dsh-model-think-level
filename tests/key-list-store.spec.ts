/**
 * The list that survives the page.
 *
 * The panel's first paint comes from here, so what this store promises is the
 * whole point: the exact masked answer the last session saw, never a secret,
 * never a probe in flight, and silence (not a throw) whenever the browser
 * refuses storage. The one thing that must never happen is a stale entry being
 * painted as current — hence the age gate and the route check.
 */

// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  KEY_LIST_STORAGE_KEY,
  clearKeyLists,
  dropKeyList,
  loadKeyList,
  saveKeyList,
} from '../src/client/key-list-store.js'
import type { KeyState } from '../src/client/key-manager-client.js'

/** A stand-in for the browser's storage: a Map with the Storage surface. */
function fakeStorage(): Storage {
  const entries = new Map<string, string>()
  return {
    get length() { return entries.size },
    clear: () => { entries.clear() },
    getItem: (key: string) => entries.get(key) ?? null,
    key: (index: number) => [...entries.keys()][index] ?? null,
    removeItem: (key: string) => { entries.delete(key) },
    setItem: (key: string, value: string) => { entries.set(key, value) },
  } as Storage
}

function list(overrides: Partial<KeyState> = {}): KeyState {
  return {
    ok: true,
    route: 'abinin',
    entries: [
      { ref: 'abinin/1', alias: 'Team', enabled: true, configured: true, masked: 'sk-…9f2c' },
      { ref: 'abinin/2', enabled: false, configured: null },
    ],
    models: ['gpt-5'],
    endpoints: { openai: 'https://direct.ab-in.cn/v1', anthropic: null },
    ...overrides,
  }
}

afterEach(() => {
  vi.unstubAllGlobals()
  vi.useRealTimers()
})

describe('what the store remembers', () => {
  it('hands back the masked rows the last session saw', () => {
    vi.stubGlobal('localStorage', fakeStorage())
    saveKeyList('abinin', list())
    expect(loadKeyList('abinin')?.entries).toEqual(list().entries)
  })

  it('strips the probe flag and the ref an add produced', () => {
    vi.stubGlobal('localStorage', fakeStorage())
    saveKeyList('abinin', { ...list(), probing: true, addedRef: 'abinin/1' })
    const restored = loadKeyList('abinin')
    expect(restored?.probing).toBeUndefined()
    expect(restored?.addedRef).toBeUndefined()
  })

  it('keeps routes apart', () => {
    vi.stubGlobal('localStorage', fakeStorage())
    saveKeyList('abinin', list())
    expect(loadKeyList('other')).toBeUndefined()
  })

  it('forgets one route without touching the others', () => {
    vi.stubGlobal('localStorage', fakeStorage())
    saveKeyList('abinin', list())
    saveKeyList('other', list({ route: 'other', entries: [] }))
    dropKeyList('abinin')
    expect(loadKeyList('abinin')).toBeUndefined()
    expect(loadKeyList('other')?.route).toBe('other')
  })

  it('clears every route at once', () => {
    const storage = fakeStorage()
    vi.stubGlobal('localStorage', storage)
    saveKeyList('abinin', list())
    clearKeyLists()
    expect(storage.getItem(KEY_LIST_STORAGE_KEY)).toBeNull()
    expect(loadKeyList('abinin')).toBeUndefined()
  })
})

describe('what it refuses to paint', () => {
  it('ignores an entry older than the age gate', () => {
    const storage = fakeStorage()
    vi.stubGlobal('localStorage', storage)
    saveKeyList('abinin', list())
    const raw = JSON.parse(storage.getItem(KEY_LIST_STORAGE_KEY) ?? '{}') as Record<string, { savedAt: number }>
    raw['abinin']!.savedAt = Date.now() - 31 * 24 * 60 * 60 * 1000
    storage.setItem(KEY_LIST_STORAGE_KEY, JSON.stringify(raw))
    expect(loadKeyList('abinin')).toBeUndefined()
    expect(storage.getItem(KEY_LIST_STORAGE_KEY)).not.toContain('abinin')
  })

  it('survives a corrupted document', () => {
    const storage = fakeStorage()
    storage.setItem(KEY_LIST_STORAGE_KEY, '{not json')
    vi.stubGlobal('localStorage', storage)
    expect(loadKeyList('abinin')).toBeUndefined()
    saveKeyList('abinin', list())
    expect(loadKeyList('abinin')?.route).toBe('abinin')
  })

  it('ignores an entry whose route does not match its slot', () => {
    const storage = fakeStorage()
    vi.stubGlobal('localStorage', storage)
    saveKeyList('abinin', list())
    const raw = JSON.parse(storage.getItem(KEY_LIST_STORAGE_KEY) ?? '{}') as Record<string, { state: KeyState }>
    raw['abinin']!.state = list({ route: 'somewhere-else' })
    storage.setItem(KEY_LIST_STORAGE_KEY, JSON.stringify(raw))
    expect(loadKeyList('abinin')).toBeUndefined()
  })

  it('says nothing when the browser has no storage at all', () => {
    expect(() => saveKeyList('abinin', list())).not.toThrow()
    expect(loadKeyList('abinin')).toBeUndefined()
    expect(() => clearKeyLists()).not.toThrow()
  })
})
