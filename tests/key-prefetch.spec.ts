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

describe('the key-list prefetch', () => {
  it('asks once per provider per page opening, and again when the page reopens', () => {
    const { client, asked } = recorder()
    const prefetch = createKeyPrefetchState()
    const depsWithClient = deps(client)
    const root = listRoot(['a', 'b'])

    reconcileKeyPrefetch(root, depsWithClient, prefetch)
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
    expect(asked.slice().sort()).toEqual(['a', 'a', 'b', 'b'])
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
