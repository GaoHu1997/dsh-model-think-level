/**
 * The create-provider card's 高级配置 pane: the tab bar and the request-header
 * editor, for a provider that does not exist yet.
 *
 * This is the half {@link add-card} used to leave out. On an existing provider
 * the same editor arrives through the official `settings.models.provider-card`
 * slot, which the official card renders only inside its CATALOGUE half — so the
 * custom-only card this plugin reduces it to had a tab bar whose 高级配置 button
 * could never light up: nothing in that half carried a `.bre-headers` section for
 * the takeover to reveal. This pane is that section, mounted at the same seat
 * the bar is.
 *
 * The route the pane edits is the id the user is TYPING, which is the one thing
 * about this card the settings document does not have yet — the card's own 保存
 * is what declares it. So the pane cannot write as the official card can:
 *
 *  - the id is read off the live form (the panel's own label, never a position)
 *    and re-read on every keystroke, because the form's React state is not ours
 *    to subscribe to;
 *  - the rows are editable whether or not the id has been typed: a draft is held
 *    by the session ledger once it has a route to belong to, and until then it
 *    simply waits for the id — which the pane does NOT announce, because the id
 *    field is on the 供应商配置 tab of this same card and the official form
 *    already speaks for it;
 *  - once there is an id the editor runs in DEFERRED mode: it edits, and reports
 *    the draft to the session ledger, but the write happens when the route
 *    appears in the document — the proof the card's own create landed. The pane
 *    also asks, one keystroke in, whether that id was ALREADY declared, because
 *    only a route that was not can be this card's work. See
 *    {@link staged-headers} for why that is a gate and not a delay.
 *
 * @module dsh-model-think-level/client/injection/create-card-pane
 */

import { useEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import type { Translate } from '@deepseek-ai/dsh-client-ui-slots'
import { HeadersEditor, type DeferredHeaders } from '../HeadersEditor.js'
import { describeNamespace, routeIsDeclared } from '../ops.js'
import type { RemoteApi } from '../types.js'
import { EditorTabBar } from './editor-tab-bar.js'
import { inputValueByLabel } from './models-page-editor.js'
import {
  markRouteBaseline,
  needsRouteBaseline,
  releaseRequestHeaders,
  stageRequestHeaders,
  withdrawRequestHeaders,
  type StagedHeadersState,
} from './staged-headers.js'

export interface CreateCardPaneProps {
  /** The plugin's own mount inside this card; the bar resolves the card from it. */
  host: { readonly current: HTMLDivElement | null }
  /** The write seam, for the editor's own settings read. */
  api: RemoteApi
  /** The plugin's translator. */
  t: Translate
  /** The official labels of the form's provider-id field, by locale. */
  routeIdLabels: () => readonly string[]
  /** The session's deferred-header ledger. */
  staged: StagedHeadersState
}

/** One create card's pane: its bar, and the headers pane once there is a route. */
export function CreateCardPane({ host, api, t, routeIdLabels, staged }: CreateCardPaneProps): ReactNode {
  const [route, setRoute] = useState<string>(() => readRoute(host.current, routeIdLabels))
  /** The route the ledger currently holds a draft under. */
  const routeRef = useRef(route)
  /** The last draft the editor reported, so a route the user retypes keeps it. */
  const draftRef = useRef<Record<string, string> | undefined>(undefined)
  /** Routes whose baseline read this mount has already started. */
  const asking = useRef<Set<string>>(new Set())
  /** Whether this mount has already said that a draft is waiting on an id. */
  const heldNotice = useRef(false)
  /**
   * The editor's callbacks, created once.
   *
   * They close over this component's refs and the session ledger, so they hold
   * no render-time value, and a stable identity is what keeps the editor's
   * report effect from running on every keystroke of the CARD (the pane
   * re-renders on those, the draft does not change).
   */
  const callbacks = useRef<DeferredHeaders | null>(null)
  if (callbacks.current === null) {
    callbacks.current = {
      onDraft: (headers: Record<string, string>): void => {
        draftRef.current = headers
        const current = routeRef.current
        if (current.length === 0) {
          // The one pane-side state that would otherwise end in silence: rows
          // typed while the id field is still empty, so there is no key to file
          // them under and the drain never hears about them. Said once per mount
          // — the drain has its own line for everything it did receive.
          if (!heldNotice.current && Object.keys(headers).length > 0) {
            heldNotice.current = true
            console.info('[bre] deferred request headers: holding a draft until the provider id is typed')
          }
          return
        }
        stageRequestHeaders(staged, current, headers)
        askBaseline(api, staged, current, asking.current)
      },
      onCancel: (): void => {
        draftRef.current = undefined
        withdrawRequestHeaders(staged, routeRef.current)
      },
    }
  }

  // The id field belongs to the official form's React state, so the DOM event it
  // commits is the only notice this pane gets: read the value off the field
  // itself on every input, in the capture phase, before the form's own handler
  // can re-render the field out from under the read. Listened for on the CARD,
  // not just the panel this pane sits in: which half of the official create form
  // holds the id field is the host's business, and a pane that only watches its
  // own half would sit on an empty route while the user typed one next to it.
  useEffect(() => {
    const scope = routeScopeOf(host.current)
    if (scope === null) return
    const onInput = (): void => { setRoute(readRoute(host.current, routeIdLabels)) }
    scope.addEventListener('input', onInput, true)
    return () => { scope.removeEventListener('input', onInput, true) }
  }, [host, routeIdLabels])

  // The draft's route has to be known BEFORE the card's 保存 can declare it, and
  // the id is on screen (and readable) from the first keystroke — so the question
  // is asked here, on every route this pane sees, not when the write is due.
  useEffect(() => {
    if (route.length > 0) askBaseline(api, staged, route, asking.current)
  }, [api, staged, route])

  // A retyped id moves the draft: the old key never comes back (the user is
  // declaring the provider they ended up naming), and the new key starts out
  // holding what is already on screen. A draft that has not been reported yet
  // has nothing to move — the editor reports on mount, before any change.
  useEffect(() => {
    const previous = routeRef.current
    if (previous === route) return
    withdrawRequestHeaders(staged, previous)
    routeRef.current = route
    const draft = draftRef.current
    if (draft !== undefined && route.length > 0) stageRequestHeaders(staged, route, draft)
  }, [route, staged])

  // Leaving the DOM cannot tell a create that landed from a card that was
  // abandoned — the two look identical from here — so the draft is RELEASED: it
  // is written as soon as its route appears (which is how a create that lands
  // after the card closes still gets its headers), and retired once the grace
  // window says the route is never coming.
  useEffect(() => () => { releaseRequestHeaders(staged, routeRef.current) }, [staged])

  return (
    <>
      <EditorTabBar host={host} t={t} />
      {/* The editor is here from the first render, id or no id: a pane that
          withheld its rows until the form above was filled read as a pane with
          no way to add a header at all. The rows take edits either way, and the
          draft is staged the moment the id it belongs to is typed. */}
      <HeadersEditor
        route={route}
        api={api}
        t={t}
        deferred={callbacks.current}
      />
    </>
  )
}

/**
 * Ask the settings document whether `route` was already declared, and record the
 * answer on the session's ledger.
 *
 * The pane asks as soon as the id field holds anything — one keystroke in, long
 * before the card's own 保存 could declare a provider — because that answer is
 * what tells the drain whether a declaration it later sees is this card's doing
 * or another provider's that happens to share the id. A route already answered
 * for is never asked twice; a read that FAILS leaves the route unanswered, so the
 * next stage asks again rather than leaving the draft waiting on a route nobody
 * will vouch for.
 */
function askBaseline(
  api: RemoteApi,
  staged: StagedHeadersState,
  route: string,
  asking: Set<string>,
): void {
  if (!needsRouteBaseline(staged, route) || asking.has(route)) return
  asking.add(route)
  void (async () => {
    try {
      const join = await describeNamespace(api)
      markRouteBaseline(staged, route, routeIsDeclared(join.namespace, route))
    } catch (error) {
      asking.delete(route)
      console.warn('[bre] deferred request headers: could not read the settings document for this route:', error)
    }
  })()
}

/**
 * The element whose typing can change the provider id: the panel this pane is
 * mounted in, widened to the create card around it.
 *
 * The id field is the official form's, and which half of the card renders it is
 * not something this pane may assume: the read is by label (never by position),
 * so the card-wide scope can only ever find the SAME field the panel scope
 * would — the difference is that it still finds it when the host puts that field
 * outside the custom half.
 */
function routeScopeOf(host: HTMLElement | null): HTMLElement | null {
  const panel = host?.parentElement
  if (panel === null || panel === undefined) return null
  return panel.parentElement?.closest<HTMLElement>('[class*="addCard"]') ?? panel
}

/** The provider id the card's form currently holds, read by the official label. */
function readRoute(host: HTMLElement | null, routeIdLabels: () => readonly string[]): string {
  const panel = host?.parentElement
  if (panel === null || panel === undefined) return ''
  const labels = routeIdLabels()
  const own = inputValueByLabel(panel, labels).trim()
  if (own.length > 0) return own
  const card = routeScopeOf(host)
  if (card === null || card === panel) return ''
  return inputValueByLabel(card, labels).trim()
}