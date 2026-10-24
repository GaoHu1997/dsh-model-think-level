/**
 * The create-provider card's API-key list: the SAME card list the edit card
 * runs ({@link KeyManager}), over a DRAFT store instead of the host's.
 *
 * The provider this list edits does not exist yet — the id the user is typing
 * is declared by the card's own 保存 — so the host's key route would refuse
 * every call. The list therefore runs on {@link createDraftKeyClient}, whose
 * answers come from an in-memory store the seat seeds, and every change is
 * filed with the session ledger (`staged-keys`) the moment there is a route to
 * file it under. The ledger — not this pane — decides when those drafts may be
 * written: the create landing is the only thing that may trigger the write,
 * and it is also the proof the write is allowed.
 *
 * The route plumbing mirrors the card's 高级配置 pane (`create-card-pane`)
 * exactly, because it solves the same problem against the same field: the id
 * belongs to the official form's React state, so the DOM input event is the
 * only notice this pane gets, the read is by label, and a retyped id MOVES the
 * held list (the old key never comes back — the user is declaring the provider
 * they ended up naming).
 *
 * @module dsh-model-think-level/client/injection/create-keys-pane
 */

import { useEffect, useMemo, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import type { Translate } from '@deepseek-ai/dsh-client-ui-slots'
import { KeyManager } from '../KeyManager.js'
import { describeNamespace, routeIsDeclared } from '../ops.js'
import type { RemoteApi } from '../types.js'
import { readRoute, routeScopeOf } from './create-card-pane.js'
import {
  createDraftKeyClient,
  markKeysRouteBaseline,
  needsKeysRouteBaseline,
  releaseKeys,
  stageKeys,
  withdrawKeys,
  type DraftKeyStore,
  type StagedKeysState,
} from './staged-keys.js'

export interface CreateKeysPaneProps {
  /** The plugin's seat right after the official key field; the id read and the
   * input listener both resolve the card from it. */
  host: { readonly current: HTMLDivElement | null }
  /** The working store the seat created (and seeded with a value the user had
   * already typed into the official box, if there was one). */
  store: DraftKeyStore
  /** The write seam, for the route-baseline reads. */
  api: RemoteApi
  /** The plugin's translator. */
  t: Translate
  /** The official labels of the form's provider-id field, by locale. */
  routeIdLabels: () => readonly string[]
  /** The session's deferred-key ledger. */
  staged: StagedKeysState
}

/** One create card's key list: the draft list itself, wired to the live id. */
export function CreateKeysPane({ host, store, api, t, routeIdLabels, staged }: CreateKeysPaneProps): ReactNode {
  const [route, setRoute] = useState<string>(() => readRoute(host.current, routeIdLabels))
  /** The route the ledger currently holds drafts under. */
  const routeRef = useRef(route)
  /** Routes whose baseline read this mount has already started. */
  const asking = useRef<Set<string>>(new Set())
  /** Whether this mount has already said that drafts are waiting on an id. */
  const heldNotice = useRef(false)

  /**
   * The draft store's transport. Created once: it closes over the store and
   * the refs, so a stable identity is what keeps the list's read effect from
   * re-running on every keystroke of the CARD.
   */
  const client = useMemo(
    () =>
      createDraftKeyClient(store, {
        t,
        onChange: (drafts): void => {
          const current = routeRef.current
          if (current.length === 0) {
            // The one pane-side state that would otherwise end in silence:
            // keys added while the id field is still empty have no route to be
            // filed under, so the drain never hears about them. Said once per
            // mount, exactly the way the headers pane says it.
            if (!heldNotice.current && drafts.length > 0) {
              heldNotice.current = true
              console.info('[bre] deferred api keys: holding the list until the provider id is typed')
            }
            return
          }
          stageKeys(staged, current, drafts)
        },
      }),
    [staged, store, t],
  )

  // The id field belongs to the official form's React state, so the DOM event
  // it commits is the only notice this pane gets (see create-card-pane).
  useEffect(() => {
    const scope = routeScopeOf(host.current)
    if (scope === null) return
    const onInput = (): void => { setRoute(readRoute(host.current, routeIdLabels)) }
    scope.addEventListener('input', onInput, true)
    return () => { scope.removeEventListener('input', onInput, true) }
  }, [host, routeIdLabels])

  // The baseline has to be known BEFORE the card's 保存 can declare the route
  // (see staged-keys): asked on every route this pane sees.
  useEffect(() => {
    if (route.length > 0) askKeysBaseline(api, staged, route, asking.current)
  }, [api, staged, route])

  // A retyped id moves the drafts: the old key never comes back, and the new
  // key starts out holding what the store already has.
  useEffect(() => {
    const previous = routeRef.current
    if (previous === route) return
    withdrawKeys(staged, previous)
    routeRef.current = route
    if (store.drafts.length > 0 && route.length > 0) stageKeys(staged, route, store.drafts)
  }, [route, staged, store])

  // Leaving the DOM cannot tell a create that landed from a card that was
  // abandoned, so the drafts are RELEASED: they are written as soon as their
  // route appears, and retired once the grace window says it never will.
  useEffect(() => () => { releaseKeys(staged, routeRef.current) }, [staged])

  return <KeyManager route={route} t={t} client={client} draft />
}

/**
 * Ask the settings document whether `route` was already declared, and record
 * the answer on the session's ledger (see staged-keys). Mirrors the headers
 * pane's own ask: a route already answered for is never asked twice, and a
 * read that fails leaves the route unanswered.
 */
function askKeysBaseline(
  api: RemoteApi,
  staged: StagedKeysState,
  route: string,
  asking: Set<string>,
): void {
  if (!needsKeysRouteBaseline(staged, route) || asking.has(route)) return
  asking.add(route)
  void (async () => {
    try {
      const join = await describeNamespace(api)
      markKeysRouteBaseline(staged, route, routeIsDeclared(join.namespace, route))
    } catch (error) {
      asking.delete(route)
      console.warn('[bre] deferred api keys: could not read the settings document for this route:', error)
    }
  })()
}
