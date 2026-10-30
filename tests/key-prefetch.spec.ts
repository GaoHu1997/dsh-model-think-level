/**
 * The key-list prefetch: one read per provider per page opening, fired the
 * moment the provider list first shows, so an opened card paints its keys from
 * the cache instead of waiting on the wire.
 *
 * The contract worth pinning: one ask per route per opening (the scan runs on
 * every mutation burst and must not multiply it), and a closed page ends the
 * opening so the next one re-asks — the same session shape the balance chip
 * keeps.
 */

// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import {
  createKeyPrefetchState,
  reconcileKeyPrefetch,
  type KeyPrefetchDeps,
} from '../src/client/injection/key-prefetch.js'
import type { HostLabels } from '../src/client/injection/models-page-editor.js'
import type { KeyAnswer, KeyManagerClient } from '../src/client/key-manager-client.js'

function state(route: string): KeyAnswer {
  return { ok: true, route, entries: [], endpoints: { openai: null, anthropic: null } }
}

/** A Models-page provider list: one stamped row per route. */
function listRoot(routes: readonly string[]): HTMLElement {
  const root = document.createElement('div')
  const list = document.createElement('ul')
  for (const route of routes) {
    const row = document.createElement('li')
    row.className = 'rowCard'
    const stamp = document.createElement('span')
    stamp.setAttribute('data-bre-provider', route)
    row.append(stamp)
    list.append(row)
  }
  root.append(list)
  return root
}

const labels = (): HostLabels => ({ editProvider: ['Edit {provider}'] }) as unknown as HostLabels

function recorder(): { client: KeyManagerClient; asked: string[] } {
  const asked: string[] = []
  const client = {
    list: async (route: string) => {
      asked.push(route)
      return state(route)
    },
  } as unknown as KeyManagerClient
  return { client, asked }
}

function deps(client: KeyManagerClient): KeyPrefetchDeps {
  return { labels, client }
}

/** Flush the background start, answer and queue-slot release microtasks. */
async function settle(): Promise<void> {
  for (let turn = 0; turn < 8; turn += 1) await Promise.resolve()
}

describe('the key-list prefetch', () => {
  it('asks once per provider per page opening, and again when the page reopens', async () => {
    const { client, asked } = recorder()
    const prefetch = createKeyPrefetchState()
    const depsWithClient = deps(client)
    const root = listRoot(['a', 'b'])

    reconcileKeyPrefetch(root, depsWithClient, prefetch)
    await settle()
    expect(asked.slice().sort()).toEqual(['a', 'b'])

    // A settled page rescans on every mutation burst: no route is asked twice
    // within one opening.
    reconcileKeyPrefetch(root, depsWithClient, prefetch)
    reconcileKeyPrefetch(root, depsWithClient, prefetch)
    expect(asked).toHaveLength(2)

    // The list disappearing is the page closing: the next presence is a new
    // opening, and each provider is asked once in it.
    reconcileKeyPrefetch(listRoot([]), depsWithClient, prefetch)
    reconcileKeyPrefetch(root, depsWithClient, prefetch)
    await settle()
    expect(asked.slice().sort()).toEqual(['a', 'a', 'b', 'b'])
  })

  it('caps background work at two and clears pending work when the page leaves', async () => {
    const asked: string[] = []
    const finish = new Map<string, (answer: KeyAnswer) => void>()
    let active = 0
    let peak = 0
    const client = { list: (route: string, options: unknown) => {
      expect(options).toEqual({ preferCache: true })
      asked.push(route)
      active += 1
      peak = Math.max(peak, active)
      return new Promise<KeyAnswer>(resolve => {
        finish.set(route, answer => { active -= 1; resolve(answer) })
      })
    } } as unknown as KeyManagerClient
    const prefetch = createKeyPrefetchState()
    const root = listRoot(['a', 'b', 'c', 'd', 'e'])
    reconcileKeyPrefetch(root, deps(client), prefetch)
    await settle()
    expect(asked).toEqual(['a', 'b'])
    expect(prefetch.pending.map(item => item.route)).toEqual(['c', 'd', 'e'])
    finish.get('a')!(state('a'))
    await settle()
    expect(asked).toEqual(['a', 'b', 'c'])
    expect(peak).toBe(2)
    reconcileKeyPrefetch(listRoot([]), deps(client), prefetch)
    expect(prefetch.pending).toHaveLength(0)
    finish.get('b')!(state('b'))
    finish.get('c')!(state('c'))
    await settle()
    expect(asked).toEqual(['a', 'b', 'c'])
    expect(prefetch.running.size).toBe(0)
  })

  it('retains running slots across reopen instead of starting old two plus new two', async () => {
    const asked: string[] = []
    const finish = new Map<string, (answer: KeyAnswer) => void>()
    const client = { list: (route: string) => {
      asked.push(route)
      return new Promise<KeyAnswer>(resolve => { finish.set(route, resolve) })
    } } as unknown as KeyManagerClient
    const prefetch = createKeyPrefetchState()
    reconcileKeyPrefetch(listRoot(['a', 'b', 'old-pending']), deps(client), prefetch)
    await settle()
    reconcileKeyPrefetch(listRoot([]), deps(client), prefetch)
    reconcileKeyPrefetch(listRoot(['a', 'b', 'new-c', 'new-d']), deps(client), prefetch)
    await settle()
    expect(asked).toEqual(['a', 'b'])
    expect(prefetch.running.size).toBe(2)
    expect(prefetch.pending.map(item => item.route)).toEqual(['new-c', 'new-d'])
    finish.get('a')!(state('a'))
    await settle()
    expect(asked).toEqual(['a', 'b', 'new-c'])
    expect(prefetch.running.size).toBe(2)
    finish.get('b')!(state('b'))
    await settle()
    expect(asked).toEqual(['a', 'b', 'new-c', 'new-d'])
    finish.get('new-c')!(state('new-c'))
    finish.get('new-d')!(state('new-d'))
    await settle()
    expect(prefetch.running.size).toBe(0)
  })

  it('releases both synchronous throws and rejected reads so queued routes still warm', async () => {
    const asked: string[] = []
    const client = { list: (route: string) => {
      asked.push(route)
      if (route === 'throw') throw new Error('mock synchronous throw')
      if (route === 'reject') return Promise.reject(new Error('mock rejection'))
      return Promise.resolve(state(route))
    } } as unknown as KeyManagerClient
    const prefetch = createKeyPrefetchState()
    reconcileKeyPrefetch(listRoot(['throw', 'reject', 'c', 'd']), deps(client), prefetch)
    await settle()
    await settle()
    expect(asked).toEqual(['throw', 'reject', 'c', 'd'])
    expect(prefetch.running.size).toBe(0)
    expect(prefetch.pending).toHaveLength(0)
  })

  it('does not queue a foreground editor list behind the two warm-up slots', async () => {
    const asked: string[] = []
    const finish = new Map<string, (answer: KeyAnswer) => void>()
    const client = { list: (route: string) => {
      asked.push(route)
      return new Promise<KeyAnswer>(resolve => { finish.set(route, resolve) })
    } } as unknown as KeyManagerClient
    const prefetch = createKeyPrefetchState()
    reconcileKeyPrefetch(listRoot(['a', 'b', 'edit-me']), deps(client), prefetch)
    await settle()
    expect(asked).toEqual(['a', 'b'])
    // KeyManager calls its transport directly, with preferCache, not this queue.
    const editing = client.list('edit-me', { preferCache: true })
    expect(asked).toEqual(['a', 'b', 'edit-me'])
    expect(prefetch.running.size).toBe(2)
    finish.get('edit-me')!(state('edit-me'))
    await editing
    reconcileKeyPrefetch(listRoot([]), deps(client), prefetch)
    finish.get('a')!(state('a'))
    finish.get('b')!(state('b'))
    await settle()
    expect(prefetch.running.size).toBe(0)
  })

  it('asks nothing while the Models page is closed', () => {
    const { client, asked } = recorder()
    const prefetch = createKeyPrefetchState()
    const depsWithClient = deps(client)

    reconcileKeyPrefetch(listRoot([]), depsWithClient, prefetch)
    reconcileKeyPrefetch(document.createElement('div'), depsWithClient, prefetch)
    expect(asked).toEqual([])
  })
})
