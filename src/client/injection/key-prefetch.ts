/**
 * Warming the key lists before any card opens.
 *
 * The key panel paints its rows from the last successful read and revalidates
 * in the background, so an expansion is instant exactly as long as the route's
 * list has been read once on this page. Nothing reads it before the first
 * expansion, though — the user's first 编辑 on a freshly opened Models page
 * paid the whole read latency (a settings read plus one credential resolve per
 * key, behind the host's serialised settings service) as a visible "正在读取密
 * 钥…" line, every session, on every route.
 *
 * This pass asks once per provider per page opening, fire-and-forget, the same
 * moment the page's provider list first shows: the read is what an expansion
 * would have asked for anyway, only earlier and off the critical path. It is
 * the balance chip's timing contract (one read per provider per opening), put
 * to work for the key panel. No interval, no polling — a failed warm-up is
 * simply retried by the panel's own mount read when the card opens.
 *
 * @module dsh-model-think-level/client/injection/key-prefetch
 */

import type { KeyManagerClient } from '../key-manager-client.js'
import type { HostLabels } from './models-page-editor.js'
import { providerIdOfRow, rowsListOf } from './provider-order-drag.js'

interface PendingKeyList {
  readonly route: string
  readonly client: KeyManagerClient
}

/** Per-session bookkeeping (one instance lives in `models-page.ts`). */
export interface KeyPrefetchState {
  /** Routes already asked during THIS page opening. */
  readonly requested: Set<string>
  /** Work not yet started; discarded when the provider list disappears. */
  readonly pending: PendingKeyList[]
  /** In-flight reads survive page reopen, keeping the shared limit at two. */
  readonly running: Set<string>
  /** Whether the provider list was present in the previous pass. */
  visible: boolean
}

/** A fresh state for one page instance. */
export function createKeyPrefetchState(): KeyPrefetchState {
  return { requested: new Set(), pending: [], running: new Set(), visible: false }
}

const KEY_PREFETCH_CONCURRENCY = 2

/** Background warm-ups only; an editor's direct list read never waits here. */
function drainKeyPrefetch(state: KeyPrefetchState): void {
  while (state.visible && state.running.size < KEY_PREFETCH_CONCURRENCY) {
    const next = state.pending.shift()
    if (next === undefined) return
    state.running.add(next.route)
    // Starting in a promise also catches a synchronous throw from a test/older
    // client; both thrown and rejected reads release their queue slot.
    void Promise.resolve().then(() => next.client.list(next.route, { preferCache: true }))
      .catch(() => undefined)
      .finally(() => {
        state.running.delete(next.route)
        drainKeyPrefetch(state)
      })
  }
}

/** What the pass needs from its host. */
export interface KeyPrefetchDeps {
  /** The official `settings.models` label sets, resolved fresh on every scan. */
  readonly labels: () => HostLabels
  /** Transport; injectable for tests. */
  readonly client?: KeyManagerClient
}

/**
 * Visit the provider list once per scan: on a (re)opened page, ask the host for
 * each visible provider's key list, once, and let the panel's cache hold the
 * answer until an expansion needs it.
 * @param list - the provider list already resolved by the caller's scan (see
 *   `reconcileProviderOrder`); re-deriving it here costs a document-wide walk
 *   per pass, and one burst runs several passes.
 */
export function reconcileKeyPrefetch(
  root: HTMLElement,
  deps: KeyPrefetchDeps,
  state: KeyPrefetchState,
  list: HTMLElement | undefined = rowsListOf(root),
): void {
  if (list === undefined) {
    // The Models page is gone: the opening is over, the next one re-asks.
    state.visible = false
    state.pending.length = 0
    return
  }
  if (!state.visible) {
    state.visible = true
    state.requested.clear()
  }
  const client = deps.client
  if (client === undefined) return
  const labels = deps.labels()
  for (const child of Array.from(list.children)) {
    if (!(child instanceof HTMLElement)) continue
    const id = providerIdOfRow(child, labels)
    if (id === undefined || state.requested.has(id)) continue
    state.requested.add(id)
    if (!state.running.has(id)) state.pending.push({ route: id, client })
  }
  drainKeyPrefetch(state)
}
