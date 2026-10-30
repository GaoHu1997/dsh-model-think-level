/**
 * Deferred API keys: the create-provider card's key list, held until the
 * provider it belongs to exists.
 *
 * The edit card's key list ({@link KeyManager}) is a view over HOST state —
 * every mutation rides the key route, and that route refuses a provider the
 * settings document does not declare. The create card's list edits exactly
 * such a route: the id the user is TYPING is the one thing about the card the
 * document does not have yet, and the card's own 保存 is what declares it. So
 * the list on that card runs over a DRAFT store this module owns (see
 * {@link createDraftKeyClient}), and the drafts wait here as an INTENT until
 * the route really is declared — the same contract the card's request headers
 * already follow (see `staged-headers`), for the same reason: the host's
 * fail-closed fence on the key route is what keeps a stray profile out of the
 * document, and it stays exactly as it is.
 *
 * The wait is bounded the same way: a pane's unmount cannot tell "the create
 * landed and the card closed" from "the user gave up", so an intent is
 * RELEASED at unmount and retired after {@link RELEASE_GRACE_MS}. And what
 * decides whether an intent may write is the BASELINE — whether the route was
 * already declared when the intent was staged — because an id that names an
 * existing provider belongs to that provider, not to this card's drafts.
 *
 * The draft VALUES live in this page's memory only. They are never persisted,
 * never sent anywhere but the eventual writes, and a reload discards them
 * exactly as it discards the card's own unsaved fields — the contract the
 * pane's copy states.
 *
 * @module dsh-model-think-level/client/injection/staged-keys
 */

import { isLegalKeyValue, maskKeyValue, normalizeKeyAlias, type RouteProtocol } from '../../key-refs.js'
import type { KeyAnswer, KeyManagerClient, KeyRow, KeyState } from '../key-manager-client.js'
import { describeNamespace, routeIsDeclared } from '../ops.js'
import type { RemoteApi } from '../types.js'

/**
 * How long a released intent keeps waiting for its route to appear. The same
 * window the headers ledger uses, and for the same reason: it only has to
 * cover the gap between the card's own 保存 landing and the next scan reading
 * it.
 */
export const RELEASE_GRACE_MS = 15_000

/**
 * How many drain passes an intent may fail before its drafts are given up on.
 * A key draft is unrecoverable once dropped (the card it came from is gone),
 * so a transient refusal gets retried rather than dropped at once — but a
 * write the host keeps refusing must not keep the scan coming for ever.
 */
const MAX_DRAIN_ATTEMPTS = 3

/** One draft key as the create card's list holds it. The value never leaves
 * this page until the drain writes it. */
export interface StagedKeyDraft {
  /** Browser-side row identity; the host mints its own references on write. */
  readonly ref: string
  /** The secret itself, held in memory until the drain stores it. */
  readonly value: string
  /** Stored label; absent means the row shows its masked value. */
  readonly alias?: string
  /** Wire protocol this key pins; absent follows the provider's own. */
  readonly protocol?: RouteProtocol
  /** Whether the key is switched into the routing pool. */
  readonly enabled: boolean
}

/** How far the drain got with one draft: its host reference once the value
 * landed, and the draft fields the host currently holds for it. */
interface StagedKeyLanding {
  /** The draft this landing belongs to ({@link StagedKeyDraft.ref}). */
  readonly ref: string
  /** The reference the host minted or reused when it stored the value. */
  readonly hostRef: string
  /** Snapshot of the fields currently applied to the host reference. */
  draft: StagedKeyDraft
}

/** One pane's held key list, keyed by the route it will be written to. */
export interface StagedKeyIntent {
  /** The complete draft list — the same whole-list value the pane renders. */
  drafts: readonly StagedKeyDraft[]
  /** Which drafts have already landed, with the host references they landed as. */
  readonly landed: StagedKeyLanding[]
  /** Changes whenever the pane replaces this intent's desired draft list. */
  revision: number
  /** Whether this route was already declared when this card first asked. */
  declaredBefore?: boolean
  /** When the pane that staged this intent unmounted, if it has. */
  releasedAt?: number
  /** Whether a missing pre-save baseline has already been reported. */
  noted?: boolean
  /** A post-save route exists, but its pre-save ownership is unknown. */
  baselineMissing?: boolean
  /** Failed drain passes since the last one that wrote something. */
  attempts: number
}

/** The session's deferred-key ledger. */
export interface StagedKeysState {
  /** Held drafts, by route. Readable so a test (and the console) can see what
   * the session is still holding. */
  readonly intents: Map<string, StagedKeyIntent>
  /** The first successful pre-save answer for each route. */
  readonly baseline: Map<string, boolean>
  /** Baseline reads currently in flight. */
  readonly baselinePending: Set<string>
  /** Baseline reads that failed before producing a pre-save answer. */
  readonly baselineFailures: Set<string>
  /** Active intents keep late add references available to a restaged route. */
  readonly activeIntents: Map<string, StagedKeyIntent>
  /** One drain at a time, with another pass requested on concurrent edits. */
  draining: boolean
  drainAgain: boolean
}

/** A fresh, empty ledger. */
export function createStagedKeysState(): StagedKeysState {
  return {
    intents: new Map(),
    baseline: new Map(),
    baselinePending: new Set(),
    baselineFailures: new Set(),
    activeIntents: new Map(),
    draining: false,
    drainAgain: false,
  }
}

/**
 * Hold one pane's draft list for a route that is not declared yet.
 *
 * An empty list WITHDRAWS instead of staging: "no keys" is the state the route
 * is already in, so staging it would only arm a write that changes nothing.
 * The stamps of a known intent are kept: a list that changes after the pane is
 * gone must not restart the grace window, and a list that changes after its
 * route was already declared is still one that route never belonged to.
 * @param state - the session's ledger.
 * @param route - the route the pane's id field currently reads.
 * @param drafts - the complete draft list.
 */
export function stageKeys(state: StagedKeysState, route: string, drafts: readonly StagedKeyDraft[]): void {
  if (route.length === 0) return
  if (drafts.length === 0) {
    withdrawKeys(state, route)
    return
  }
  const known = state.intents.get(route)
  if (known === undefined) {
    const active = state.activeIntents.get(route)
    state.intents.set(route, {
      drafts: [...drafts],
      landed: active?.landed ?? [],
      revision: 0,
      declaredBefore: state.baseline.get(route),
      attempts: 0,
    })
    if (state.draining) state.drainAgain = true
    return
  }
  if (sameDrafts(known.drafts, drafts)) return
  known.drafts = [...drafts]
  known.revision += 1
  known.baselineMissing = false
  if (state.draining) state.drainAgain = true
}

function sameDrafts(left: readonly StagedKeyDraft[], right: readonly StagedKeyDraft[]): boolean {
  return left.length === right.length && left.every((draft, index) => {
    const next = right[index]
    return next !== undefined
      && draft.ref === next.ref
      && draft.value === next.value
      && draft.alias === next.alias
      && draft.protocol === next.protocol
      && draft.enabled === next.enabled
  })
}

/** Drop the drafts for a route; an active request will stop after it settles. */
export function withdrawKeys(state: StagedKeysState, route: string): void {
  state.intents.delete(route)
  if (state.draining) state.drainAgain = true
}

/**
 * Mark one route's drafts as orphaned: the pane that staged them is gone and
 * the card's own 保存 has already been pressed or will never be.
 */
export function releaseKeys(state: StagedKeysState, route: string): void {
  const known = state.intents.get(route)
  if (known === undefined) return
  known.releasedAt = Date.now()
}

/**
 * Record whether `route` was already declared when this card's drafts were
 * staged. Kept per session, so a list restaged after the drain retired its
 * intent does not ask twice.
 */
export function markKeysRouteBaseline(state: StagedKeysState, route: string, declared: boolean): void {
  if (route.length === 0) return
  // The first successful answer belongs to the card's pre-save decision; later
  // reads must not replace it with a route declaration created by this card.
  if (!state.baseline.has(route)) state.baseline.set(route, declared)
  state.baselinePending.delete(route)
  state.baselineFailures.delete(route)
  const known = state.intents.get(route)
  if (known !== undefined) {
    known.declaredBefore = state.baseline.get(route)
    known.baselineMissing = false
  }
  if (state.draining) state.drainAgain = true
}

/** Mark a baseline read as in flight before issuing the pre-save request. */
export function beginKeysRouteBaseline(state: StagedKeysState, route: string): boolean {
  if (!needsKeysRouteBaseline(state, route)) return false
  state.baselinePending.add(route)
  return true
}

/** Record a failed baseline read without allowing a later route state to replace it. */
export function failKeysRouteBaseline(state: StagedKeysState, route: string): void {
  state.baselinePending.delete(route)
  if (!state.baseline.has(route)) state.baselineFailures.add(route)
  if (state.draining) state.drainAgain = true
}

/**
 * Whether `route` still needs its baseline read.
 * @returns True when the pane should ask the settings document.
 */
export function needsKeysRouteBaseline(state: StagedKeysState, route: string): boolean {
  return route.length > 0
    && !state.baseline.has(route)
    && !state.baselinePending.has(route)
    && !state.baselineFailures.has(route)
}

/**
 * Write every held draft list whose route is now declared.
 *
 * Runs on the debounced scan, beside the headers drain, which is the only
 * place that already does wire work. Each intent lands in two phases — every
 * value first, then each row's protocol pin and switch-off — because the host
 * refuses to switch off the last enabled key, and a switch-off on the FIRST
 * key would race the second one's arrival. Which drafts have already landed
 * is remembered between passes, so a pass that fails half-way resumes without
 * re-adding what the host already stored.
 * @param state - the session's ledger.
 * @param api - the settings Remote the baseline reads ride.
 * @param client - the live key transport the writes ride.
 * @returns How many RELEASED intents are still waiting for their route, so the
 * caller keeps the scan coming while that is non-zero.
 */
export async function flushStagedKeys(
  state: StagedKeysState,
  api: RemoteApi,
  client: KeyManagerClient,
): Promise<number> {
  if (state.draining) return waitingCount(state)
  if (state.intents.size === 0) return 0
  state.draining = true
  try {
    do {
      state.drainAgain = false
      const join = await describeNamespace(api)
      // The mirror can lag a write, so confirm a missing route against the document.
      let wire: Awaited<ReturnType<typeof describeNamespace>> | undefined
      const declaredNow = async (route: string): Promise<boolean> => {
        if (routeIsDeclared(join.namespace, route)) return true
        wire ??= await describeNamespace(api, { fresh: true })
        return routeIsDeclared(wire.namespace, route)
      }
      const now = Date.now()
      for (const [route, intent] of Array.from(state.intents)) {
        if (state.intents.get(route) !== intent) continue
        const revision = intent.revision
        state.activeIntents.set(route, intent)
        try {
          if (intent.declaredBefore === undefined) {
            if (state.baselinePending.has(route)) {
              if (intent.releasedAt !== undefined && now - intent.releasedAt > RELEASE_GRACE_MS) {
                state.intents.delete(route)
                console.error('[bre] deferred api keys: the pre-save baseline timed out; refusing to write held keys:', route)
              }
              continue
            }
            if (state.baselineFailures.has(route)) {
              // A retry may record a route as new only while it is still absent.
              // If it is present, that may be this card's save, so ownership is unknown.
              const exists = await declaredNow(route)
              if (state.intents.get(route) !== intent) continue
              if (intent.revision !== revision || intent.declaredBefore !== undefined) {
                state.drainAgain = true
                continue
              }
              if (!exists) {
                markKeysRouteBaseline(state, route, false)
                if (intent.releasedAt !== undefined && now - intent.releasedAt > RELEASE_GRACE_MS) {
                  state.intents.delete(route)
                  console.info('[bre] deferred api keys: gave up on drafts whose card closed first:', route)
                }
              } else {
                intent.baselineMissing = true
                if (intent.noted !== true) {
                  intent.noted = true
                  console.error('[bre] deferred api keys: the pre-save baseline failed and this route now exists; refusing to guess ownership:', route)
                }
                if (intent.releasedAt !== undefined && now - intent.releasedAt > RELEASE_GRACE_MS) {
                  state.intents.delete(route)
                  console.error('[bre] deferred api keys: the pre-save baseline remained unknown; refusing to write held keys:', route)
                }
              }
              continue
            }
            intent.baselineMissing = true
            if (intent.noted !== true) {
              intent.noted = true
              console.error('[bre] deferred api keys: no pre-save baseline is available; refusing to write held keys:', route)
            }
            if (intent.releasedAt !== undefined && now - intent.releasedAt > RELEASE_GRACE_MS) {
              state.intents.delete(route)
            }
            continue
          }
          if (intent.declaredBefore) {
            // This route belonged to an existing provider before the card opened.
            state.intents.delete(route)
            continue
          }
          const exists = await declaredNow(route)
          if (state.intents.get(route) !== intent) continue
          if (intent.revision !== revision) {
            state.drainAgain = true
            continue
          }
          if (!exists) {
            if (intent.releasedAt !== undefined && now - intent.releasedAt > RELEASE_GRACE_MS) {
              state.intents.delete(route)
              console.info('[bre] deferred api keys: gave up on drafts whose card closed first:', route)
            }
            continue
          }
          const landed = await drainIntent(state, route, intent, client)
          if (state.intents.get(route) !== intent || intent.revision !== revision) continue
          if (landed) {
            state.intents.delete(route)
            console.info('[bre] deferred api keys: the route is declared, saved the held key list:', route)
          }
        } finally {
          if (state.activeIntents.get(route) === intent) state.activeIntents.delete(route)
        }
      }
    } while (state.drainAgain && state.intents.size > 0)
  } catch (error) {
    // A scan that cannot read settings must not cost the session its held drafts.
    console.error('[bre] deferred api keys: could not read the settings document:', error)
  } finally {
    state.draining = false
  }
  return waitingCount(state)
}

async function drainIntent(
  state: StagedKeysState,
  route: string,
  intent: StagedKeyIntent,
  client: KeyManagerClient,
): Promise<boolean> {
  const revision = intent.revision
  const drafts = [...intent.drafts]
  let failed = false
  let progressed = false
  const stopIfStale = (): boolean => {
    if (state.intents.get(route) !== intent) return true
    if (intent.revision !== revision) {
      state.drainAgain = true
      return true
    }
    return false
  }
  const refuse = (): void => {
    failed = true
    intent.attempts += 1
  }

  // Phase one: all values and aliases land before any key is switched off.
  for (const draft of drafts) {
    if (stopIfStale()) return false
    let landing = intent.landed.find(entry => entry.ref === draft.ref)
    if (landing === undefined) {
      const answer = await client.add(route, draft.value, draft.alias)
      if (!answer.ok) {
        if (stopIfStale()) return false
        refuse()
        break
      }
      const explicitRef = answer.addedRef !== undefined
        && answer.entries.some(entry => entry.ref === answer.addedRef)
        ? answer.addedRef
        : undefined
      const hostRef = explicitRef ?? answer.entries.map(entry => entry.ref).find(
        ref => !intent.landed.some(entry => entry.hostRef === ref),
      )
      if (hostRef === undefined) {
        if (stopIfStale()) return false
        refuse()
        break
      }
      const hostEntry = answer.entries.find(entry => entry.ref === hostRef)
      const { alias: _desiredAlias, protocol: _desiredProtocol, ...draftBase } = draft
      landing = {
        ref: draft.ref,
        hostRef,
        draft: {
          ...draftBase,
          ...(hostEntry?.alias === undefined ? {} : { alias: hostEntry.alias }),
          ...(hostEntry?.protocol === undefined ? {} : { protocol: hostEntry.protocol }),
          enabled: hostEntry?.enabled ?? true,
        },
      }
      intent.landed.push(landing)
      progressed = true
      if (stopIfStale()) return false
      continue
    }

    if (landing.draft.value !== draft.value) {
      const answer = await client.replace(route, landing.hostRef, draft.value)
      if (!answer.ok) {
        if (stopIfStale()) return false
        refuse()
        break
      }
      landing.draft = { ...landing.draft, value: draft.value }
      progressed = true
      if (stopIfStale()) return false
    }
    if (landing.draft.alias !== draft.alias) {
      const { alias: _previous, ...rest } = landing.draft
      const answer = await client.rename(route, landing.hostRef, draft.alias)
      if (!answer.ok) {
        if (stopIfStale()) return false
        refuse()
        break
      }
      landing.draft = { ...rest, ...(draft.alias === undefined ? {} : { alias: draft.alias }) }
      progressed = true
      if (stopIfStale()) return false
    }
  }
  if (!failed) {
    // Phase two: apply all protocol pins, then enable before switching anything off.
    for (const draft of drafts) {
      if (stopIfStale()) return false
      const landing = intent.landed.find(entry => entry.ref === draft.ref)
      if (landing === undefined || landing.draft.protocol === draft.protocol) continue
      const answer = await client.setProtocol(route, landing.hostRef, draft.protocol)
      if (!answer.ok) {
        if (stopIfStale()) return false
        refuse()
        break
      }
      const { protocol: _previous, ...rest } = landing.draft
      landing.draft = { ...rest, ...(draft.protocol === undefined ? {} : { protocol: draft.protocol }) }
      progressed = true
      if (stopIfStale()) return false
    }
  }
  if (!failed) {
    for (const enabled of [true, false]) {
      for (const draft of drafts) {
        if (stopIfStale()) return false
        if (draft.enabled !== enabled) continue
        const landing = intent.landed.find(entry => entry.ref === draft.ref)
        if (landing === undefined || landing.draft.enabled === enabled) continue
        const answer = await client.setEnabled(route, landing.hostRef, enabled)
        if (!answer.ok) {
          if (stopIfStale()) return false
          refuse()
          break
        }
        landing.draft = { ...landing.draft, enabled }
        progressed = true
        if (stopIfStale()) return false
      }
      if (failed) break
    }
  }
  if (!failed) {
    intent.attempts = 0
    return !stopIfStale()
  }
  // Progress buys another retry; a pass that only failed counts toward the bound.
  if (progressed) intent.attempts = 0
  if (intent.attempts >= MAX_DRAIN_ATTEMPTS) {
    console.error('[bre] deferred api keys: the write was refused; giving up on the held key list:', route)
    return true
  }
  return false
}

/** How many held intents are released and therefore need the scan to keep
 * coming. */
function waitingCount(state: StagedKeysState): number {
  let waiting = 0
  for (const intent of state.intents.values()) {
    if (intent.releasedAt !== undefined) waiting += 1
  }
  return waiting
}

/** The working store one draft pane edits: a plain mutable box the client and
 * the pane both close over. */
export interface DraftKeyStore {
  drafts: StagedKeyDraft[]
}

/** The repo's inline translator shape (see `KeyManager`). */
type Translator = (key: string, params?: Record<string, string | number>) => string

/** What a draft client needs besides the store it edits. */
export interface DraftKeyClientDeps {
  /** Copy for the one refusal the host would word itself on the edit card. */
  readonly t: Translator
  /** Called with the complete list after every change. */
  readonly onChange: (drafts: readonly StagedKeyDraft[]) => void
}

/** The addresses a draft knows: none — the provider's own form fields carry
 * them, and the route does not exist to hold them yet. */
const NO_ENDPOINTS: KeyState['endpoints'] = { openai: null, anthropic: null }

/** The first free draft row name in the sequence `key-1`, `key-2`… */
function nextDraftRef(drafts: readonly StagedKeyDraft[]): string {
  const taken = new Set(drafts.map(draft => draft.ref))
  for (let n = 1; n <= 999; n += 1) {
    const candidate = `key-${n}`
    if (!taken.has(candidate)) return candidate
  }
  return `key-${Date.now()}`
}

/**
 * The {@link KeyManagerClient} the create card's list runs on: every op edits
 * the in-memory draft store and answers the whole list, so the card list the
 * user sees is the same machinery the edit card runs over the host. Only the
 * writes that need a route of their own (scope, endpoints, the merged-models
 * offer) are no-ops here — the card has no models to scope by and no route to
 * address.
 * @param store - the pane's working store, shared by identity.
 * @param deps - copy, and the change sink the pane stages through.
 * @returns the client, stable for as long as the store is.
 */
export function createDraftKeyClient(store: DraftKeyStore, deps: DraftKeyClientDeps): KeyManagerClient {
  /** The whole list, as the pane renders it. */
  const answer = (): KeyState => ({
    ok: true,
    route: '',
    entries: store.drafts.map((draft): KeyRow => ({
      ref: draft.ref,
      ...(draft.alias === undefined ? {} : { alias: draft.alias }),
      enabled: draft.enabled,
      configured: true,
      masked: maskKeyValue(draft.value),
      ...(draft.protocol === undefined ? {} : { protocol: draft.protocol }),
    })),
    endpoints: NO_ENDPOINTS,
  })

  /** Adopt a change and report the list it produced. */
  const changed = (addedRef?: string): KeyAnswer => {
    deps.onChange(store.drafts)
    return { ...answer(), ...(addedRef === undefined ? {} : { addedRef }) }
  }

  const findDraft = (ref: string): StagedKeyDraft | undefined =>
    store.drafts.find(draft => draft.ref === ref)

  const replaceAt = (ref: string, next: StagedKeyDraft): KeyAnswer => {
    store.drafts = store.drafts.map(draft => (draft.ref === ref ? next : draft))
    return changed()
  }

  return {
    list: async () => answer(),
    cached: () => answer(),
    add: async (_route, value, alias) => {
      if (!isLegalKeyValue(value)) return { ok: false, error: deps.t('keysAddIllegal') }
      const ref = nextDraftRef(store.drafts)
      store.drafts = [...store.drafts, { ref, value, enabled: true, ...(alias === undefined ? {} : { alias }) }]
      return changed(ref)
    },
    rename: async (_route, ref, alias) => {
      const draft = findDraft(ref)
      if (draft === undefined) return { ok: false }
      // undefined clears the label, so the old key comes OFF the draft.
      const { alias: _previous, ...rest } = draft
      return replaceAt(ref, { ...rest, ...(alias === undefined ? {} : { alias }) })
    },
    replace: async (_route, ref, value) => {
      const draft = findDraft(ref)
      if (draft === undefined || !isLegalKeyValue(value)) return { ok: false, error: deps.t('keysAddIllegal') }
      return replaceAt(ref, { ...draft, value })
    },
    remove: async (_route, ref) => {
      store.drafts = store.drafts.filter(draft => draft.ref !== ref)
      return changed()
    },
    // No route exists to scope a key by: the models the chips would offer are
    // the provider's own, and the provider does not exist yet.
    setScope: async () => answer(),
    setEnabled: async (_route, ref, enabled) => {
      const draft = findDraft(ref)
      if (draft === undefined) return { ok: false }
      // The host's own rule, kept here so the draft cannot stage a list the
      // drain could only half-write: the last enabled key stays on.
      if (!enabled && !store.drafts.some(other => other.ref !== ref && other.enabled)) {
        return { ok: false, error: deps.t('keysLastEnabledOff') }
      }
      return replaceAt(ref, { ...draft, enabled })
    },
    setProtocol: async (_route, ref, protocol) => {
      const draft = findDraft(ref)
      if (draft === undefined) return { ok: false }
      // undefined restores the automatic wire, so the old pin comes OFF the draft.
      const { protocol: _previous, ...rest } = draft
      return replaceAt(ref, { ...rest, ...(protocol === undefined ? {} : { protocol }) })
    },
    setEndpoints: async () => answer(),
    // A draft has no route, so there is nothing to probe; the panel hides the
    // button on a draft list and never asks.
    probe: async () => answer(),
    reveal: async (_route, ref) => findDraft(ref)?.value,
  }
}
