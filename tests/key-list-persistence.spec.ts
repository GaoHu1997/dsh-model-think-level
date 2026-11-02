/**
 * The whole promise of the stored list, end to end: a page that already has
 * one paints it before the network is touched, even though the module's
 * in-memory cache — the thing that used to carry the list — is gone.
 *
 * `vi.resetModules()` is the closest thing a test has to closing the window and
 * starting dsh again: the JavaScript module graph dies, the browser's storage
 * does not. If the rows survive that, they survive a restart.
 */

// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const ANSWER = {
  ok: true,
  route: 'abinin',
  entries: [
    { ref: 'abinin/1', alias: 'Team', enabled: true, configured: true, masked: 'sk-…9f2c' },
    { ref: 'abinin/2', enabled: true, configured: true },
  ],
  endpoints: { openai: 'https://direct.ab-in.cn/v1', anthropic: null },
}

function stubFetch(calls: string[]): void {
  vi.stubGlobal('fetch', async (url: unknown) => {
    calls.push(String(url))
    return { ok: true, status: 200, json: async () => ANSWER } as unknown as Response
  })
}

beforeEach(() => {
  window.localStorage.clear()
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.resetModules()
})

describe('a page that already has a list', () => {
  it('paints it without asking the host, after the module cache is gone', async () => {
    const calls: string[] = []
    stubFetch(calls)

    let client = (await import('../src/client/key-manager-client.js')).httpKeyManagerClient
    await client.list('abinin')
    expect(calls).toHaveLength(1)

    // Restart: the in-memory cache dies with the module, the storage does not.
    vi.resetModules()
    client = (await import('../src/client/key-manager-client.js')).httpKeyManagerClient

    const painted = client.cached?.('abinin')
    expect(painted?.entries).toHaveLength(2)
    expect(painted?.entries[0]?.alias).toBe('Team')
    expect(painted?.endpoints.openai).toBe('https://direct.ab-in.cn/v1')
    // Nothing was read for the first paint.
    expect(calls).toHaveLength(1)
  })

  it('still revalidates behind the painted rows', async () => {
    const calls: string[] = []
    stubFetch(calls)

    let client = (await import('../src/client/key-manager-client.js')).httpKeyManagerClient
    await client.list('abinin')

    vi.resetModules()
    client = (await import('../src/client/key-manager-client.js')).httpKeyManagerClient
    // The panel's mount read asks the host even when something is painted:
    // preferCache must not short-circuit across a restart.
    await client.list('abinin', { preferCache: true })
    expect(calls).toHaveLength(2)
  })
})
