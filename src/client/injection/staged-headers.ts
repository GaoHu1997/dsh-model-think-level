/**
 * Deferred request headers: the create-provider card's 高级配置 draft, held
 * until the provider it belongs to exists.
 *
 * The create card's 高级配置 pane edits a route the settings document does not
 * declare — the card's own 保存 is what declares it. So there is nothing this
 * plugin may write at the moment the user types: `writeProviderHeaders` refuses
 * a route no raw layer declares, and for a good reason (the write would leave a
 * stray profile carrying nothing but headers). The pane's draft therefore waits
 * here as an INTENT, and lands on the first scan that finds the route really
 * declared. That finding is also the proof the creation succeeded: it is the
 * card's own commit, never this plugin's, that puts the route in the document.
 *
 * The wait is bounded, and deliberately so. A pane's unmount cannot tell "the
 * create landed and the card closed" from "the user gave up", so an intent is
 * RELEASED at unmount rather than dropped, and a released intent whose route
 * never appears is retired after {@link RELEASE_GRACE_MS} — which is what keeps
 * an abandoned card's headers from being inherited by a later provider that
 * happens to take the same id.
 *
 * What decides whether the draft may be written is not the route appearing on its
 * own — a card whose id names a provider that ALREADY exists sees its route
 * declared from the first keystroke, and those headers are that provider's, not
 * this draft's. So each route carries a BASELINE: whether it was already declared
 * when this card's draft was staged. A route that was not, and now is, was
 * declared by the card (that is the only thing that could have declared it) and
 * the draft lands — on the very scan that reads it, whether or not the card has
 * closed yet. A route that already was gets nothing, exactly as before.
 *
 * Nothing is persisted. A reload discards a held intent exactly as it discards
 * the card's own unsaved fields, which is the contract the pane's copy states.
 *
 * @module dsh-model-think-level/client/injection/staged-headers
 */

import { describeNamespace, routeIsDeclared, writeProviderHeaders, type ProviderHeadersReply } from '../ops.js'
import type { RemoteApi } from '../types.js'

/**
 * How long a released intent keeps waiting for its route to appear.
 *
 * The window only has to cover the gap between the card's own 保存 landing and
 * the next scan reading it — a mutation schedules that scan within the debounce
 * window, so this is generous by two orders of magnitude. It is a window and not
 * a deadline: a draft whose route never appears is dropped, because after that
 * long the card it belonged to is not coming back.
 */
export const RELEASE_GRACE_MS = 15_000

/** One pane's held draft, keyed by the route it will be written to. */
export interface StagedHeaderIntent {
  /** The complete dict the pane holds — the same whole-dict value the editor's
   * own Save writes, so the two commit paths cannot write different shapes. */
  headers: Record<string, string>
  /** Whether this route was already declared when the draft was staged; see the
   * module doc. Left undefined while that read is in flight — the drain cannot
   * tell a typed id from a created one until it knows, so it waits. */
  declaredBefore?: boolean
  /** When the pane that staged this intent unmounted, if it has. */
  releasedAt?: number
  /** Whether the drain has already said — once — that this route has no
   * baseline, which is the one holding state that ends in silence. */
  noted?: boolean
}

/** The session's deferred-header ledger. */
export interface StagedHeadersState {
  /** Held drafts, by route. Readable so a test (and the console) can see what
   * the session is still holding. */
  readonly intents: Map<string, StagedHeaderIntent>
  /** What each route's baseline read found, kept for the session so a draft
   * restaged after the drain retired its intent does not have to ask again. */
  readonly baseline: Map<string, boolean>
  /** One drain at a time: an unmount's release-triggered flush and a scan's
   * drain must not both walk the ledger and write the same route. */
  flushing: boolean
}

/** A fresh, empty ledger. */
export function createStagedHeadersState(): StagedHeadersState {
  return { intents: new Map(), baseline: new Map(), flushing: false }
}

/**
 * Hold one pane's draft for a route that is not declared yet.
 *
 * An empty draft WITHDRAWS instead of staging: "no headers" is the same state
 * the route is already in (a card that creates a provider with no headers), so
 * staging it would only arm a write that changes nothing — and it would make the
 * pane's first, still-blank report look like an edit.
 * @param state - the session's ledger.
 * @param route - the route the pane's id field currently reads.
 * @param headers - the complete draft dict.
 */
export function stageRequestHeaders(
  state: StagedHeadersState,
  route: string,
  headers: Record<string, string>,
): void {
  if (route.length === 0) return
  const next = { ...headers }
  if (Object.keys(next).length === 0) {
    state.intents.delete(route)
    return
  }
  const known = state.intents.get(route)
  if (known === undefined) {
    state.intents.set(route, { headers: next, declaredBefore: state.baseline.get(route) })
    return
  }
  // The stamps are kept: a draft that changes after the pane is gone (a late
  // report from an unmounting root) must not restart the grace window, and a
  // draft that changes after its route was already declared is still one that
  // route never belonged to.
  known.headers = next
}

/** Drop the draft held for one route. */
export function withdrawRequestHeaders(state: StagedHeadersState, route: string): void {
  state.intents.delete(route)
}

/**
 * Mark one route's draft as orphaned: the pane that staged it is gone and the
 * card's own 保存 has already been pressed or will never be.
 * @param state - the session's ledger.
 * @param route - the route the pane last read.
 */
export function releaseRequestHeaders(state: StagedHeadersState, route: string): void {
  const known = state.intents.get(route)
  if (known === undefined) return
  known.releasedAt = Date.now()
}

/**
 * Record whether `route` was already declared when this card's draft was staged.
 *
 * The pane reads this off the settings document as soon as it has a route to ask
 * about, which is long before the card's own 保存 can declare anything — so the
 * answer tells the drain whether the declaration it later sees is this card's
 * doing or someone else's provider. Kept per session, so a draft restaged after
 * the drain retired its intent does not ask twice.
 * @param state - the session's ledger.
 * @param route - the route to record.
 * @param declared - whether the route was declared at that moment.
 */
export function markRouteBaseline(state: StagedHeadersState, route: string, declared: boolean): void {
  if (route.length === 0) return
  state.baseline.set(route, declared)
  const known = state.intents.get(route)
  if (known !== undefined) known.declaredBefore = declared
}

/**
 * Whether `route` still needs its baseline read, and has no draft to wait on.
 * @param state - the session's ledger.
 * @param route - the route the pane's id field currently reads.
 * @returns True when the pane should ask the settings document.
 */
export function needsRouteBaseline(state: StagedHeadersState, route: string): boolean {
  return route.length > 0 && !state.baseline.has(route)
}

/**
 * Write every held draft whose route is now declared.
 *
 * Runs on the debounced scan, which is the only place that already does wire
 * work — the synchronous pass in the mutation microtask must stay wire-free.
 * @param state - the session's ledger.
 * @param api - the settings Remote.
 * @returns How many RELEASED drafts are still waiting for their route. The
 * caller keeps the scan coming while that is non-zero: the card's own 保存 may
 * declare the route after the card — and its pane — are gone, and by then no
 * further DOM mutation is left to trigger a scan.
 */
export async function flushStagedRequestHeaders(state: StagedHeadersState, api: RemoteApi): Promise<number> {
  if (state.flushing) return waitingCount(state)
  if (state.intents.size === 0) return 0
  state.flushing = true
  try {
    const join = await describeNamespace(api)
    // The mirror lags a write that has just landed -- the provider the user
    // created a moment ago is exactly that -- and a draft that waits on a stale
    // read waits forever. One fresh read per scan answers for every held route.
    let wire: Awaited<ReturnType<typeof describeNamespace>> | undefined
    const declaredNow = async (route: string): Promise<boolean> => {
      if (routeIsDeclared(join.namespace, route)) return true
      wire ??= await describeNamespace(api, { fresh: true })
      return routeIsDeclared(wire.namespace, route)
    }
    const now = Date.now()
    for (const [route, intent] of Array.from(state.intents)) {
      if (intent.declaredBefore === undefined) {
        // Nobody has said whether this id was already a provider, so the drain
        // cannot tell the card's own provider from a stranger's. Said once —
        // every scan would otherwise repeat it — because a draft that only ever
        // holds is the one failure with no other trace.
        if (intent.releasedAt !== undefined && intent.noted !== true) {
          intent.noted = true
          console.warn(
            '[bre] deferred request headers: nobody said whether this id existed before, so the draft is held:',
            route,
          )
        }
        continue
      }
      if (intent.declaredBefore) {
        // The id named a provider that already existed: whatever is declared
        // under it is not this card's, so the draft is written nowhere. Nothing
        // will ever change that, so it goes now rather than waiting.
        state.intents.delete(route)
        continue
      }
      if (!(await declaredNow(route))) {
        // A route of this card's own: not in the document yet, so the card has
        // not been saved — kept while it is open, and retired past the grace
        // window once the pane is gone, because after that long the create it
        // was waiting on is not coming.
        if (intent.releasedAt !== undefined && now - intent.releasedAt > RELEASE_GRACE_MS) {
          state.intents.delete(route)
          console.info('[bre] deferred request headers: gave up on a draft whose card closed first:', route)
        } else if (intent.releasedAt !== undefined) {
          console.info('[bre] deferred request headers: waiting for the closed card to declare', route)
        }
        continue
      }
      console.info('[bre] deferred request headers: the route is declared, writing the held draft:', route)
      let reply: ProviderHeadersReply
      try {
        reply = await writeProviderHeaders(api, route, intent.headers)
      } catch (error) {
        reply = { ok: false, error: error instanceof Error ? error.message : String(error) }
      }
      if (reply.ok) {
        state.intents.delete(route)
        console.info('[bre] deferred request headers: saved', route, Object.keys(intent.headers).length, 'header(s)')
        continue
      }
      // 'no-route' is not a refusal: it is the card's own write not having
      // landed yet (or the route having been deleted in the meantime), so the
      // intent keeps waiting for the next scan. Anything else is the settings
      // seam saying no — read-only, or a conflict two attempts could not win —
      // and the intent goes with the console line that says so.
      if (reply.error === 'no-route') continue
      state.intents.delete(route)
      console.error('[bre] deferred request headers: the write was refused:', reply.error, route)
    }
  } catch (error) {
    // A scan that cannot read the settings document must not cost the session
    // its held drafts: they stay for the next scan.
    console.error('[bre] deferred request headers: could not read the settings document:', error)
  } finally {
    state.flushing = false
  }
  return waitingCount(state)
}

/**
 * How many held drafts are released and therefore need the scan to keep coming.
 * @param state - the session's ledger.
 * @returns The number of intents whose pane is already gone.
 */
function waitingCount(state: StagedHeadersState): number {
  let waiting = 0
  for (const intent of state.intents.values()) {
    if (intent.releasedAt !== undefined) waiting += 1
  }
  return waiting
}
