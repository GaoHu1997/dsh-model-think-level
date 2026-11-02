/**
 * The boot-time revalidation: the pass that keeps a stored list from quietly
 * becoming last week's answer.
 *
 * The properties worth pinning are the ones that keep it in the background: it
 * waits for the first screen, it reads a bounded few, it never exceeds the
 * host-friendly concurrency, a refusal is not an event, and it can be disposed
 * before it starts.
 */

// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest'
import { warmStoredKeyLists } from '../src/client/key-list-warm.js'
import { saveKeyList, KEY_LIST_STORAGE_KEY } from '../src/client/key-list-store.js'
import type { KeyAnswer } from '../src/client/key-manager-client.js'

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

function stored(route: string, savedAt: number, storage: Storage): void {
  saveKeyList(route, {
    ok: true,
    route,
    entries: [{ ref: `${route}/1`, enabled: true, configured: true }],
    endpoints: { openai: null, anthropic: null },
  })
  // Rewrite the timestamp: saveKeyList always stamps "now".
  const raw = JSON.parse(storage.getItem(KEY_LIST_STORAGE_KEY) ?? '{}') as Record<string, { savedAt: number }>
  raw[route]!.savedAt = savedAt
  storage.setItem(KEY_LIST_STORAGE_KEY, JSON.stringify(raw))
}

/** A transport that records calls and answers however the test says. */
function recordingClient(answer: () => Promise<KeyAnswer> = async () => ({ ok: false })) {
  const reads: string[] = []
  return {
    reads,
    client: {
      list: (route: string) => {
        reads.push(route)
        return answer()
      },
    },
  }
}

afterEach(() => {
  vi.unstubAllGlobals()
  vi.useRealTimers()
})

describe('the boot revalidation', () => {
  it('waits for the first screen before asking anything', async () => {
    vi.useFakeTimers()
    const storage = fakeStorage()
    vi.stubGlobal('localStorage', storage)
    stored('abinin', Date.now() - 10 * 60_000, storage)
    const { reads, client } = recordingClient()
    warmStoredKeyLists(client)
    await vi.advanceTimersByTimeAsync(1_400)
    expect(reads).toEqual([])
    await vi.advanceTimersByTimeAsync(200)
    expect(reads).toEqual(['abinin'])
  })

  it('leaves a list written a moment ago alone', async () => {
    vi.useFakeTimers()
    const storage = fakeStorage()
    vi.stubGlobal('localStorage', storage)
    stored('fresh', Date.now() - 1_000, storage)
    const { reads, client } = recordingClient()
    warmStoredKeyLists(client)
    await vi.advanceTimersByTimeAsync(2_000)
    expect(reads).toEqual([])
  })

  it('reads the newest few, not every route ever visited', async () => {
    vi.useFakeTimers()
    const storage = fakeStorage()
    vi.stubGlobal('localStorage', storage)
    const base = Date.now() - 10 * 60_000
    for (let index = 0; index < 5; index += 1) stored(`route-${index}`, base + index * 1_000, storage)
    const { reads, client } = recordingClient()
    warmStoredKeyLists(client, { limit: 2 })
    await vi.advanceTimersByTimeAsync(2_000)
    expect(reads).toEqual(['route-4', 'route-3'])
  })

  it('stays inside its concurrency, and a refusal does not stall the queue', async () => {
    vi.useFakeTimers()
    const storage = fakeStorage()
    vi.stubGlobal('localStorage', storage)
    const base = Date.now() - 10 * 60_000
    for (let index = 0; index < 4; index += 1) stored(`route-${index}`, base + index * 1_000, storage)
    let inFlight = 0
    let peak = 0
    const reads: string[] = []
    const client = {
      list: async (route: string): Promise<KeyAnswer> => {
        reads.push(route)
        inFlight += 1
        peak = Math.max(peak, inFlight)
        await Promise.resolve()
        inFlight -= 1
        return { ok: false }
      },
    }
    warmStoredKeyLists(client, { concurrency: 2 })
    await vi.advanceTimersByTimeAsync(2_000)
    expect(reads).toHaveLength(4)
    expect(peak).toBeLessThanOrEqual(2)
  })

  it('can be disposed before it starts', async () => {
    vi.useFakeTimers()
    const storage = fakeStorage()
    vi.stubGlobal('localStorage', storage)
    stored('abinin', Date.now() - 10 * 60_000, storage)
    const { reads, client } = recordingClient()
    const stop = warmStoredKeyLists(client)
    stop()
    await vi.advanceTimersByTimeAsync(5_000)
    expect(reads).toEqual([])
  })

  it('says nothing when the transport throws', async () => {
    vi.useFakeTimers()
    const storage = fakeStorage()
    vi.stubGlobal('localStorage', storage)
    stored('abinin', Date.now() - 10 * 60_000, storage)
    const client = { list: () => { throw new Error('older transport') } }
    expect(() => warmStoredKeyLists(client)).not.toThrow()
    await vi.advanceTimersByTimeAsync(2_000)
    // Nothing to assert beyond "no unhandled rejection": reaching here is the test.
    expect(true).toBe(true)
  })
})
