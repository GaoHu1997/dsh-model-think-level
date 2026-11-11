/**
 * The auto-continue watcher: replies 「继续」 to interrupted live sessions
 * when it ended in a way worth continuing, and stays silent otherwise.
 *
 * The decision is {@link judgeTurnTail} (auto-continue-rules.ts); this module
 * owns the OBSERVATION and the GUARDS around it:
 *
 *   - The selected session and running root sessions from the catalog are
 *     watched. On reference-owning kernels each live chain retains its exact
 *     session generation: a borrowed binding alone cannot keep history alive.
 *     Idle unopened history is never scanned en masse. On first attachment,
 *     only a recent unanswered failure is recoverable (within a day); any
 *     newer user intent/run or stale ending makes it history.
 *   - The durable `turn/end` is what is judged, not the running edge, so the
 *     evaluation waits briefly for the settlement to reach the event window.
 *   - Guards at send time: the switch still on, the turn still ended, nothing
 *     the user submitted pending, the retained session generation still live.
 *   - A streak cap bounds every chain of automatic replies (a dead provider
 *     or a model looping on the ceiling must not be fed forever); anything
 *     the user sends by hand, and every turn that ends completed / aborted /
 *     blocked, resets it.
 *   - A per-turn claim (auto-continue-pref.ts) keeps a second open tab from
 *     double-answering the same ending.
 *
 * The services are probed structurally and lazily exactly like the
 * session-directory tracker does: a kernel without the session-controller
 * client layer simply never arms the watcher.
 *
 * @module dsh-model-think-level/client/injection/auto-continue-run
 */

import {
  claimTurn,
  autoContinueEnabled,
  autoContinueConfig,
  subscribeAutoContinueEnabled,
  subscribeAutoContinueConfig,
} from '../auto-continue-pref.js'
import {
  judgeTurnTail,
  type DurableEventLike,
  type TurnEndClass,
} from '../auto-continue-rules.js'
import { currentSessionId, type SessionsLike, type UiSessionLike } from './session-directory.js'

/** How often bindings, running catalog roots and background chains are inspected. */
const TICK_MS = 1_000

/** First evaluation after the running edge: let the settlement land. */
const EVAL_FIRST_DELAY_MS = 500

/** Subsequent polling while the `turn/end` has not reached the window yet. */
const EVAL_RETRY_DELAY_MS = 600

/**
 * How long after the running edge the window is waited on for a NEW
 * `turn/end`. The settlement is durable and should beat this by far; the
 * bound just stops a tail-less ending (an edge without a logged closer)
 * from polling forever.
 */
const EVAL_WINDOW_MS = 6_000

/** Ceiling for a provider-requested `providerRetryAfterMs`. */
const RETRY_AFTER_MAX_MS = 120_000

/** How far a user event may sit from the auto-send and still be attributed to it. */
const AUTO_SEND_ECHO_TOLERANCE_MS = 30_000

/**
 * How long an unanswered failure stays resumable when the watcher first sees
 * it (a session opened later, a view reopened after a restart, or a return
 * from another session). Measured on the `turn/end`'s own timestamp and only
 * while no user message or new run sits after it, so work the user already
 * moved past stays history.
 */
const RECOVERY_WINDOW_MS = 24 * 60 * 60 * 1_000

/** The session face the watcher needs, structurally (the official Session). */
interface SessionFaceLike {
  getSnapshot(): {
    running?: boolean
    blank?: boolean
    pendingSubmissions?: readonly unknown[]
    /** Present when the session belongs to subagent routing (never continued). */
    subagent?: unknown
    /** History-open lifecycle; `cold`/`loading` mean the window is not the truth yet. */
    openState?: string
  }
  subscribe(listener: () => void): () => void
  prompt(content: readonly { readonly type: 'text'; readonly text: string }[], mode: 'queue' | 'steer'): Promise<{
    ok?: boolean
    error?: { readonly code?: unknown; readonly message?: unknown }
  }>
}

/** The binding's event window source, structurally. */
interface EventSourceLike {
  getSnapshot(): {
    entries?: readonly {
      readonly type?: string
      readonly event?: DurableEventLike
    }[]
    hasMore?: boolean
  }
  subscribe(listener: () => void): () => void
}

/** One `sessions.binding(id)` answer, structurally. */
interface SessionBindingLike {
  readonly sessionId: string
  readonly session: SessionFaceLike
  readonly eventSource: EventSourceLike
}

/** Owning reference: borrowing a binding does NOT keep its history stream alive. */
interface SessionReferenceLike {
  readonly binding: SessionBindingLike
  readonly ready: Promise<SessionBindingLike>
  release(): void
}

/** Dedicated consumer label, never a main-view/navigation reference. */
const REFERENCE_SOURCE = 'dshModelThinkLevelAutoContinue'

/** The sessions service; older kernels only expose the borrowed binding. */
interface SessionsServiceLike extends SessionsLike {
  binding?(id: string): SessionBindingLike | undefined
  retain?(id: string, options: { source: typeof REFERENCE_SOURCE }): SessionReferenceLike
}

/** The context seats the watcher probes, lazily (services mount after boot). */
interface WatcherContext {
  get?(name: string): unknown
  on?(event: string, listener: () => void): () => void
}

/** What the watcher needs from its host. */
export interface AutoContinueDeps {
  /** The client root context, probed lazily for its service seats. */
  ctx: WatcherContext
  /** The plugin translator, for the reply text (`autoContinueMessage`). */
  t: (key: string, params?: Record<string, unknown>) => string
}

/** The watcher's face. */
export interface AutoContinueRunner {
  /** Stop the poll, detach every listener and cancel every pending send. */
  dispose: () => void
  /** What the in-session controller should render right now. */
  status: () => AutoContinueStatus
  /** Subscribe to status changes; returns the disposer. */
  subscribe: (listener: () => void) => () => void
  /** Stand down for THIS session: cancel the wait, hide the controller, stay quiet. */
  stop: () => void
  /** Clear a stood-down chain so the next ending starts again at one. */
  reset: () => void
  /** Skip the wait and reply now. */
  resumeNow: () => void
}

/**
 * One session's auto-continue chain, as the controller renders it.
 * `idle` is never shown; the chip only exists while a chain is running.
 */
export interface AutoContinueStatus {
  /** The watched session, undefined while nothing is open. */
  readonly sessionId: string | undefined
  readonly phase: 'idle' | 'waiting' | 'sent' | 'exhausted'
  /** Automatic replies already sent in THIS chain. */
  readonly consecutive: number
  readonly maxRetries: number
  /** Epoch ms the pending reply fires at; 0 when no timer is armed. */
  readonly nextSendAt: number
  /** Length of the armed wait in ms; the chip draws the ring against it. */
  readonly waitMs: number
  /** The judged interruption, e.g. `RATE_LIMIT` or `max-tokens` (tooltip only). */
  readonly detail: string
  /** Whether the user stopped this session's chain. */
  readonly muted: boolean
}

/** One attached session's live state. */
interface Attached {
  /** Independent ownership of this exact client generation, while enabled. */
  reference: SessionReferenceLike | undefined
  readonly sessionId: string
  readonly session: SessionFaceLike
  readonly eventSource: EventSourceLike
  /** Snapshot listener state: the last running value seen on THIS attachment. */
  wasRunning: boolean
  /** Seq of the newest durable user/message attributed to a scan so far. */
  lastUserSeq: number
  /** Seq of the newest turn/end this attachment has judged or skipped. */
  lastHandledTurnEndSeq: number
  /** Consecutive automatic replies since the last reset. */
  consecutive: number
  /** What the controller shows: the chain's phase on this attachment. */
  phase: 'idle' | 'waiting' | 'sent' | 'exhausted'
  /** Invalidates prompt acknowledgements after this chain is settled or superseded. */
  sendEpoch: number
  /** Epoch ms the armed reply fires at; 0 when none (and while frozen). */
  nextSendAt: number
  /** Length of the current wait in ms; the ring's denominator. */
  waitMs: number
  /** The interruption class that armed the chain (tooltip only). */
  detail: string
  /** Whether the initial history page has landed; everything before it is baseline. */
  historyReady: boolean
  /** The turn/end seq the pending send timer belongs to, if one is queued. */
  pendingSendTurnEndSeq: number | undefined
  /** Start of the configurable wait, retained when settings change mid-wait. */
  pendingSendScheduledAt: number
  pendingRetryAfterMs: number | undefined
  /** When the last automatic reply was sent (client clock), for echo attribution. */
  lastAutoSentAt: number
  /** The exact text the last automatic reply carried. */
  lastAutoSentText: string | undefined
  /** Live listeners, torn down on detach. */
  readonly unsubs: (() => void)[]
  /** The pending evaluation loop's deadline, 0 when idle. */
  evalDeadline: number
  /** The evaluation's scheduled timer, if one is queued. */
  evalTimer: ReturnType<typeof setTimeout> | undefined
  /** The scheduled send timer, if one is queued. */
  sendTimer: ReturnType<typeof setTimeout> | undefined
}

/**
 * Build the watcher. The poll runs for the fiber's whole life (memory-only
 * reads while idle); the switch is only consulted when a turn ends, so
 * enabling it mid-session takes effect from the NEXT ending.
 */
export function createAutoContinue(deps: AutoContinueDeps): AutoContinueRunner {
  const { ctx, t } = deps
  /** The chain of the session on screen; the chip renders THIS one. */
  let current: Attached | undefined
  /**
   * Every session that still owns a chain. A chain outlives the pane: the user
   * switching sessions must not cancel a reply that was already decided, so the
   * timer keeps running and fires against its own session.
   */
  const chains = new Map<string, Attached>()
  let disposed = false
  const timers = new Set<ReturnType<typeof setTimeout>>()
  /** Sessions the user stopped: quiet until they post in this session again. */
  const muted = new Set<string>()
  const statusListeners = new Set<() => void>()

  /**
   * One cached snapshot. React's useSyncExternalStore re-reads getSnapshot on
   * every render and during subscription checks, so it MUST return the same
   * object until something really changed (otherwise React loops).
   */
  let statusCache: AutoContinueStatus | undefined

  const buildStatus = (): AutoContinueStatus => {
    const state = current
    const config = autoContinueConfig()
    if (state === undefined) {
      return {
        sessionId: undefined,
        phase: 'idle',
        consecutive: 0,
        maxRetries: config.maxRetries,
        nextSendAt: 0,
        waitMs: config.waitSeconds * 1_000,
        detail: '',
        muted: false,
      }
    }
    return {
      sessionId: state.sessionId,
      phase: state.phase,
      consecutive: state.consecutive,
      maxRetries: config.maxRetries,
      nextSendAt: state.nextSendAt,
      waitMs: state.waitMs,
      detail: state.detail,
      muted: muted.has(state.sessionId),
    }
  }

  const sameStatus = (a: AutoContinueStatus, b: AutoContinueStatus): boolean =>
    a.sessionId === b.sessionId
    && a.phase === b.phase
    && a.consecutive === b.consecutive
    && a.maxRetries === b.maxRetries
    && a.nextSendAt === b.nextSendAt
    && a.waitMs === b.waitMs
    && a.detail === b.detail
    && a.muted === b.muted

  const notifyStatus = (): void => {
    const next = buildStatus()
    if (statusCache !== undefined && sameStatus(statusCache, next)) return
    statusCache = next
    for (const listener of [...statusListeners]) listener()
  }

  const status = (): AutoContinueStatus => {
    statusCache ??= buildStatus()
    return statusCache
  }

  /** Clear the scheduled send without publishing an intermediate phase. */
  const clearPendingSend = (state: Attached): void => {
    if (state.sendTimer !== undefined) {
      clearTimeout(state.sendTimer)
      timers.delete(state.sendTimer)
      state.sendTimer = undefined
    }
    state.pendingSendTurnEndSeq = undefined
    state.pendingSendScheduledAt = 0
    state.pendingRetryAfterMs = undefined
  }

  /** Back to invisible; neither a timer nor a late acknowledgement may revive it. */
  const settleChain = (state: Attached): void => {
    clearPendingSend(state)
    state.sendEpoch += 1
    state.phase = 'idle'
    state.nextSendAt = 0
    state.waitMs = 0
    state.detail = ''
    notifyStatus()
  }

  const later = (fn: () => void, ms: number): void => {
    const timer = setTimeout(() => {
      timers.delete(timer)
      fn()
    }, ms)
    timers.add(timer)
  }

  // ---- Event-window reads ----

  /** The durable events of one window, oldest first. */
  const durableEventsOfSource = (source: EventSourceLike): DurableEventLike[] => {
    let entries: readonly { readonly type?: string; readonly event?: DurableEventLike }[] = []
    try {
      entries = source.getSnapshot().entries ?? []
    } catch {
      return []
    }
    const out: DurableEventLike[] = []
    for (const entry of entries) {
      if (entry.type !== 'event' || entry.event === undefined) continue
      out.push(entry.event)
    }
    return out
  }

  /** The attachment's durable events, oldest first. */
  const durableEventsOf = (state: Attached): DurableEventLike[] => durableEventsOfSource(state.eventSource)

  /** Host context notices are user/message events, but do not express new intent. */
  const isIntentMessage = (event: DurableEventLike): boolean => {
    if (event.type !== 'user/message') return false
    const data = event.data
    if (typeof data !== 'object' || data === null) return true
    const message = (data as { message?: unknown }).message ?? data
    if (typeof message !== 'object' || message === null) return true
    const source = (message as { source?: unknown }).source
    // Legacy, unknown, scheduled and question-reply sources keep their guards.
    if (typeof source !== 'object' || source === null) return true
    const kind = (source as { kind?: unknown }).kind
    return kind !== 'model-selection' && kind !== 'time-context'
  }

  /** Consume at most one matching submitted message per automatic send. */
  const scanUserEvents = (state: Attached): void => {
    const events = durableEventsOf(state)
    const seenSeq = state.lastUserSeq
    for (const event of events) {
      if (event.type !== 'user/message' || event.seq <= seenSeq) continue
      state.lastUserSeq = Math.max(state.lastUserSeq, event.seq)
      // Model-selection notices and time snapshots must not consume our echo
      // attribution, clear the streak, or lift a user-requested stop.
      if (!isIntentMessage(event)) continue
      const ownEcho = isOwnEcho(state, event)
      state.lastAutoSentText = undefined
      if (ownEcho) continue
      // A hand-typed message is intent: the streak resets and a session the
      // user stopped starts listening again (from the next ending, at one).
      muted.delete(state.sessionId)
      state.consecutive = 0
      cancelPendingSend(state)
      settleChain(state)
    }
  }

  /** Whether one user/message event is this watcher's own reply.
   * The durable event's data IS the UserMessage (`{ id, role, content, source }`),
   * not a wrapper — read `content` off it directly. */
  const isOwnEcho = (state: Attached, event: DurableEventLike): boolean => {
    if (state.lastAutoSentText === undefined) return false
    const data = event.data
    if (typeof data !== 'object' || data === null) return false
    const content = (data as { content?: unknown })['content']
      ?? ((data as { message?: unknown })['message'] as { content?: unknown } | undefined)?.content
    if (!Array.isArray(content)) return false
    const text = content
      .map(part => typeof part === 'object' && part !== null && (part as { type?: unknown })['type'] === 'text'
        ? (part as { text?: unknown })['text']
        : undefined)
      .filter((value): value is string => typeof value === 'string')
      .join('')
    if (text !== state.lastAutoSentText) return false
    const time = typeof event.time === 'number' ? event.time : state.lastAutoSentAt
    return Math.abs(time - state.lastAutoSentAt) <= AUTO_SEND_ECHO_TOLERANCE_MS
  }

  // ---- Evaluation ----

  /** Cut the final turn's events out: everything after the previous turn/end. */
  const tailOf = (events: readonly DurableEventLike[], turnEndIndex: number): DurableEventLike[] => {
    let previous = -1
    for (let index = turnEndIndex - 1; index >= 0; index -= 1) {
      if (events[index]!.type === 'turn/end') {
        previous = index
        break
      }
    }
    return events.slice(previous + 1, turnEndIndex + 1)
  }

  /** Every retry uses the configured wait; a provider may request a longer delay. */
  const sendDelayOf = (waitMs: number | undefined): number => {
    const configured = autoContinueConfig().waitSeconds * 1_000
    return waitMs === undefined ? configured : Math.max(configured, Math.min(waitMs, RETRY_AFTER_MAX_MS))
  }

  const cancelPendingSend = (state: Attached): void => {
    const armed = state.sendTimer !== undefined || state.pendingSendTurnEndSeq !== undefined
    clearPendingSend(state)
    if (!armed) return
    state.nextSendAt = 0
    // Only a cancelled WAIT closes the chain; a 'sent' chain keeps showing
    // while the continued turn runs.
    if (state.phase === 'waiting') settleChain(state)
  }

  /** Arm the reply `remaining` ms out and publish the waiting phase. */
  const armSend = (state: Attached, remaining: number): void => {
    const timer = setTimeout(() => {
      timers.delete(timer)
      state.sendTimer = undefined
      void send(state, t('autoContinueMessage'))
    }, remaining)
    state.sendTimer = timer
    state.nextSendAt = Date.now() + remaining
    state.phase = 'waiting'
    notifyStatus()
    timers.add(timer)
  }

  /** Recompute an already-armed wait from its original start, not from the edit. */
  const scheduleSend = (state: Attached): void => {
    // A newer wait owns the chain now; an older prompt reply must not overwrite it.
    state.sendEpoch += 1
    if (state.sendTimer !== undefined) {
      clearTimeout(state.sendTimer)
      timers.delete(state.sendTimer)
    }
    const delay = sendDelayOf(state.pendingRetryAfterMs)
    state.waitMs = delay
    const remaining = Math.max(0, delay - (Date.now() - state.pendingSendScheduledAt))
    armSend(state, remaining)
  }

  /** Snapshot facts the guards read; undefined when the session is unreadable. */
  const snapshotOf = (session: SessionFaceLike): { running: boolean; open: boolean; pending: number; subagent: boolean } | undefined => {
    try {
      const snap = session.getSnapshot()
      return {
        running: snap.running === true,
        // A kernel that does not report the lifecycle reads as ready; a real
        // one must be `open` before its window is the session's truth.
        open: snap.openState === undefined || snap.openState === 'open',
        pending: snap.pendingSubmissions?.length ?? 0,
        // A subagent inspection view is never auto-continued: its turns belong
        // to the parent agent's routing, and a prompt from here would land as
        // a continuation of somebody else's work.
        subagent: snap.subagent != null,
      }
    } catch {
      return undefined
    }
  }

  /** A disposed generation can retain an apparently open snapshot and frozen window. */
  const snapshotOfState = (state: Attached): ReturnType<typeof snapshotOf> => {
    try {
      const binding = state.reference?.binding
      if (binding !== undefined && (binding.session !== state.session || binding.eventSource !== state.eventSource)) return undefined
    } catch { return undefined }
    return snapshotOf(state.session)
  }

  const armEvaluation = (state: Attached): void => {
    if (state.evalTimer !== undefined) {
      // A loop is already waiting (a burst of edges): just extend its window.
      state.evalDeadline = Date.now() + EVAL_WINDOW_MS
      return
    }
    state.evalDeadline = Date.now() + EVAL_WINDOW_MS
    scheduleEvaluate(state, EVAL_FIRST_DELAY_MS)
  }

  const scheduleEvaluate = (state: Attached, delay: number): void => {
    if (disposed || chains.get(state.sessionId) !== state) return
    state.evalTimer = setTimeout(() => {
      if (state.evalTimer !== undefined) timers.delete(state.evalTimer)
      state.evalTimer = undefined
      evaluate(state)
    }, delay)
    timers.add(state.evalTimer)
  }

  /**
   * Flip the attachment to history-ready the first time the session's window
   * IS the truth (`open`). Everything the initial page carried becomes
   * baseline at that moment, except one unanswered failure inside the recovery
   * window — that ending stays live so it can be judged once.
   */
  const ensureHistoryReady = (state: Attached): void => {
    if (state.historyReady) return
    const snap = snapshotOfState(state)
    if (snap === undefined || !snap.open) return
    state.historyReady = true
    const recoveredBaseline = recoverableBaselineOf(state.eventSource)
    state.lastHandledTurnEndSeq = Math.max(
      state.lastHandledTurnEndSeq,
      recoveredBaseline ?? newestSeqOf(state.eventSource, 'turn/end'),
    )
  }

  /** Terminal verdicts clear waits even if the running snapshot is a frame behind. */
  const settleVerdict = (state: Attached, verdict: Exclude<TurnEndClass, { kind: 'continue' }>): void => {
    if (verdict.kind === 'settled') {
      state.consecutive = 0
      settleChain(state)
    } else {
      cancelPendingSend(state)
      // A stood-down chain remains visible until reset, as before.
      if (state.phase !== 'exhausted') settleChain(state)
    }
  }

  /**
   * Observe NEW durable endings from the event window as well as snapshot
   * changes: a short turn's running edge can be coalesced away. Terminal
   * endings settle immediately, even if the running frame is still behind;
   * retryable endings only arm evaluation once the session reads idle.
   */
  const armForNewTurnEnd = (state: Attached): void => {
    if (!state.historyReady) return
    const events = durableEventsOf(state)
    const pendingSeq = state.pendingSendTurnEndSeq
    if (pendingSeq !== undefined && events.some(event => event.seq > pendingSeq
      && (event.type === 'turn/start' || event.type === 'turn/end'))) {
      cancelPendingSend(state)
    }
    for (let index = events.length - 1; index >= 0; index -= 1) {
      const event = events[index]!
      if (event.type !== 'turn/end') continue
      if (event.seq <= state.lastHandledTurnEndSeq) return
      const verdict = judgeTurnTail({ turnEnd: event, turnEvents: tailOf(events, index) }, autoContinueConfig().policy)
      if (verdict.kind !== 'continue') {
        state.lastHandledTurnEndSeq = event.seq
        settleVerdict(state, verdict)
        return
      }
      const snap = snapshotOfState(state)
      if (snap !== undefined && !snap.running) armEvaluation(state)
      return
    }
  }

  const evaluate = (state: Attached): void => {
    if (disposed || chains.get(state.sessionId) !== state) return
    // No judgements before the history page lands: its endings are baseline.
    // The switch is consulted per evaluation: turning it off stops the loop
    // mid-wait, and turning it on only affects the NEXT ending.
    if (!autoContinueEnabled()) return
    // Stopped for THIS session: the user said no; wait for a hand-typed message.
    if (muted.has(state.sessionId)) return
    const snap = snapshotOfState(state)
    if (!state.historyReady) return
    if (snap === undefined || !snap.open || snap.subagent || snap.running || snap.pending > 0) return
    const events = durableEventsOf(state)
    let turnEndIndex = -1
    for (let index = events.length - 1; index >= 0; index -= 1) {
      const event = events[index]!
      if (event.type === 'turn/end' && event.seq > state.lastHandledTurnEndSeq) {
        turnEndIndex = index
        break
      }
    }
    if (turnEndIndex < 0) {
      // The settlement has not reached the window yet (or there is none);
      // keep polling briefly, then give up quietly.
      if (Date.now() < state.evalDeadline) scheduleEvaluate(state, EVAL_RETRY_DELAY_MS)
      return
    }
    const turnEnd = events[turnEndIndex]!
    // Handled BEFORE the async path: one ending is judged exactly once.
    state.lastHandledTurnEndSeq = turnEnd.seq
    scanUserEvents(state)
    if (events.some(event => event.seq > turnEnd.seq && (isIntentMessage(event) || event.type === 'turn/start'))) return
    const verdict = judgeTurnTail({ turnEnd, turnEvents: tailOf(events, turnEndIndex) }, autoContinueConfig().policy)
    if (verdict.kind !== 'continue') {
      settleVerdict(state, verdict)
      return
    }
    const maxRetries = autoContinueConfig().maxRetries
    if (state.consecutive >= maxRetries) {
      clearPendingSend(state)
      state.sendEpoch += 1
      console.info(`[dsh-model-think-level] auto-continue: streak cap (${maxRetries}) reached, standing down (${verdict.detail})`)
      state.phase = 'exhausted'
      state.nextSendAt = 0
      state.detail = verdict.detail
      notifyStatus()
      return
    }
    if (!claimTurn(state.sessionId, turnEnd.seq)) return
    state.pendingSendTurnEndSeq = turnEnd.seq
    state.pendingSendScheduledAt = Date.now()
    state.pendingRetryAfterMs = verdict.waitMs
    state.detail = verdict.detail
    scheduleSend(state)
  }

  const send = async (state: Attached, text: string): Promise<void> => {
    if (disposed || chains.get(state.sessionId) !== state) return
    scanUserEvents(state)
    // A newer ending or user intent makes this wait obsolete. Even a refused
    // fire-time guard must remove the expired countdown, not leave it at zero.
    const armedSeq = state.pendingSendTurnEndSeq
    state.pendingSendTurnEndSeq = undefined
    const abandonWait = (): void => {
      if (state.phase === 'waiting') settleChain(state)
    }
    if (armedSeq === undefined || armedSeq !== state.lastHandledTurnEndSeq) { abandonWait(); return }
    if (!autoContinueEnabled() || muted.has(state.sessionId) || state.consecutive >= autoContinueConfig().maxRetries) { abandonWait(); return }
    const snap = snapshotOfState(state)
    // The reply belongs to THIS session, not to the pane the user is looking
    // at: leaving the session must not swallow a wait that was already armed.
    if (snap === undefined || !snap.open || snap.subagent || snap.running || snap.pending > 0) { abandonWait(); return }
    const events = durableEventsOf(state)
    if (events.some(event => event.seq > armedSeq && (isIntentMessage(event) || event.type === 'turn/start' || event.type === 'turn/end'))) { abandonWait(); return }
    clearPendingSend(state)
    const epoch = ++state.sendEpoch
    state.lastAutoSentAt = Date.now()
    state.lastAutoSentText = text
    // Count the attempt before awaiting admission. Durable echoes, terminal
    // endings and even the next failure can arrive before the RPC response.
    state.consecutive += 1
    state.phase = 'sent'
    state.nextSendAt = 0
    notifyStatus()
    const ownsSend = (): boolean => !disposed && chains.get(state.sessionId) === state && state.sendEpoch === epoch
    if (!ownsSend()) return
    try {
      const answer = await state.session.prompt([{ type: 'text', text }], 'queue')
      if (!ownsSend()) return
      if (answer?.ok !== true) {
        // Refusal already counts as an attempt, but a late reply belongs to
        // its old chain and must not mutate a completed or newer one.
        state.lastAutoSentText = undefined
        state.phase = state.consecutive >= autoContinueConfig().maxRetries ? 'exhausted' : 'idle'
        notifyStatus()
        console.warn(`[dsh-model-think-level] auto-continue: prompt refused ${describeError(answer)}`)
      }
    } catch (error) {
      if (!ownsSend()) return
      state.lastAutoSentText = undefined
      state.phase = state.consecutive >= autoContinueConfig().maxRetries ? 'exhausted' : 'idle'
      notifyStatus()
      console.warn('[dsh-model-think-level] auto-continue: prompt failed:', error)
    }
  }

  const describeError = (answer: { ok?: boolean; error?: { readonly code?: unknown; readonly message?: unknown } } | undefined): string => {
    const error = answer?.error
    if (error === undefined) return 'without an error'
    const code = typeof error.code === 'string' ? error.code : 'unknown'
    const message = typeof error.message === 'string' ? error.message : ''
    return message.length > 0 ? `${code}: ${message}` : code
  }

  // ---- Attachment ----

  const onSnapshot = (state: Attached): void => {
    const snap = snapshotOfState(state)
    if (snap === undefined) return
    ensureHistoryReady(state)
    if (!snap.open || snap.subagent || snap.running || snap.pending > 0) cancelPendingSend(state)
    if (snap.pending > 0) {
      // Admission is already user intent even before its durable message lands.
      state.lastHandledTurnEndSeq = Math.max(state.lastHandledTurnEndSeq, newestSeqOf(state.eventSource, 'turn/end'))
      if (state.evalTimer !== undefined) {
        clearTimeout(state.evalTimer)
        timers.delete(state.evalTimer)
        state.evalTimer = undefined
      }
      state.evalDeadline = 0
    }
    if (state.wasRunning && !snap.running) armEvaluation(state)
    state.wasRunning = snap.running
  }

  /** The turn/end seq just before the newest one, 0 when there is none. */
  const previousTurnEndSeqOf = (source: EventSourceLike): number => {
    const seqs: number[] = []
    for (const event of durableEventsOfSource(source)) {
      if (event.type === 'turn/end') seqs.push(event.seq)
    }
    if (seqs.length < 2) return 0
    seqs.sort((a, b) => a - b)
    return seqs[seqs.length - 2]!
  }

  /**
   * The baseline to start from when the newest ending is a failure nobody
   * answered: keep that ending ABOVE the baseline so the first evaluation
   * judges it. Undefined for an ending that is stale, already answered, or not
   * worth continuing — those stay history.
   */
  const recoverableBaselineOf = (source: EventSourceLike): number | undefined => {
    const events = durableEventsOfSource(source)
    let index = -1
    for (let i = events.length - 1; i >= 0; i -= 1) {
      if (events[i]!.type === 'turn/end') {
        index = i
        break
      }
    }
    if (index < 0) return undefined
    const ending = events[index]!
    const endedAt = typeof ending.time === 'number' ? ending.time : Date.now()
    if (Date.now() - endedAt > RECOVERY_WINDOW_MS) return undefined
    // Anything the user typed or any run that started after the ending means
    // the failure was already dealt with; it must never be replayed.
    if (events.some(event => event.seq > ending.seq && (isIntentMessage(event) || event.type === 'turn/start'))) {
      return undefined
    }
    return judgeTurnTail({ turnEnd: ending, turnEvents: tailOf(events, index) }, autoContinueConfig().policy).kind === 'continue'
      ? previousTurnEndSeqOf(source)
      : undefined
  }

  /**
   * Self-healing poll: when the session is idle and an unjudged `turn/end`
   * sits in the window, arm the evaluation. This recovers endings whose
   * running edge was never delivered and the one kept by a re-attach; it never
   * invents work, because anything already judged (or baselined) sits at or
   * below {@link Attached.lastHandledTurnEndSeq}.
   */
  const sweep = (state: Attached): void => {
    if (disposed || chains.get(state.sessionId) !== state) return
    if (state.evalTimer !== undefined) return
    if (!autoContinueEnabled() || muted.has(state.sessionId)) return
    if (!state.historyReady) return
    const snap = snapshotOfState(state)
    if (snap === undefined || !snap.open || snap.subagent || snap.running || snap.pending > 0) return
    const events = durableEventsOf(state)
    for (let index = events.length - 1; index >= 0; index -= 1) {
      const event = events[index]!
      if (event.type === 'turn/end' && event.seq > state.lastHandledTurnEndSeq) {
        armEvaluation(state)
        return
      }
    }
  }

  /** Drop one session's chain: its timers, its subscriptions, its map slot. */
  const dropChain = (state: Attached): void => {
    for (const unsub of state.unsubs) {
      try {
        unsub()
      } catch {
        // A binding from a torn-down generation may already be dead.
      }
    }
    if (state.evalTimer !== undefined) {
      clearTimeout(state.evalTimer)
      timers.delete(state.evalTimer)
      state.evalTimer = undefined
    }
    if (state.sendTimer !== undefined) {
      clearTimeout(state.sendTimer)
      timers.delete(state.sendTimer)
      state.sendTimer = undefined
    }
    // Remove ownership before releasing: host teardown can publish synchronously.
    chains.delete(state.sessionId)
    const reference = state.reference
    state.reference = undefined
    try { reference?.release() } catch { /* Already disposed host generation. */ }
    if (current === state) current = undefined
    notifyStatus()
  }

  /** A connection reset replaces every binding: all chains start over. */
  const dropAllChains = (): void => {
    for (const state of [...chains.values()]) dropChain(state)
    current = undefined
    notifyStatus()
  }

  /** Attach readiness to the exact reference, fencing late released generations. */
  const watchReady = (state: Attached, reference: SessionReferenceLike): void => {
    void reference.ready.then(() => {
      if (disposed || chains.get(state.sessionId) !== state || state.reference !== reference) return
      ensureHistoryReady(state)
      sweep(state)
    }, () => {
      if (chains.get(state.sessionId) === state && state.reference === reference) dropChain(state)
    })
  }

  /** Borrow on old kernels; on new kernels retain BEFORE the pane releases its use. */
  const ensureChain = (sessions: SessionsServiceLike, id: string): Attached | undefined => {
    const existing = chains.get(id)
    let binding: SessionBindingLike | undefined
    let reference: SessionReferenceLike | undefined
    try {
      binding = sessions.binding?.(id)
      if (existing !== undefined && binding?.session === existing.session && binding.eventSource === existing.eventSource
        && (!autoContinueEnabled() || existing.reference !== undefined || typeof sessions.retain !== 'function')) return existing
      if (binding !== undefined && snapshotOf(binding.session)?.subagent) {
        if (existing !== undefined) dropChain(existing)
        return undefined
      }
      if (autoContinueEnabled() && typeof sessions.retain === 'function') {
        reference = sessions.retain(id, { source: REFERENCE_SOURCE })
        // Handle ready rejection even when reading a released binding throws.
        void reference.ready.catch(() => {})
        binding = reference.binding
      }
    } catch {
      try { reference?.release() } catch { /* Dead generation. */ }
      if (existing !== undefined) dropChain(existing)
      return undefined
    }
    if (binding === undefined) {
      if (existing !== undefined) dropChain(existing)
      return undefined
    }
    if (existing !== undefined) {
      if (existing.session === binding.session && existing.eventSource === binding.eventSource) {
        existing.reference = reference
        if (reference !== undefined) watchReady(existing, reference)
        return existing
      }
      dropChain(existing)
    }
    // A subagent view is watched by nobody: release before any listener exists.
    const first = snapshotOf(binding.session)
    if (first === undefined || first.subagent) {
      try { reference?.release() } catch { /* Dead generation. */ }
      return undefined
    }
    // An unanswered failure keeps its ending above the baseline; every other
    // pre-existing ending stays history.
    const recoveredBaseline = first.open ? recoverableBaselineOf(binding.eventSource) : undefined
    const state: Attached = {
      reference,
      sessionId: binding.sessionId,
      session: binding.session,
      eventSource: binding.eventSource,
      // Recording the live value WITHOUT an edge: a session that was already
      // running when attached is never judged from that edge alone.
      wasRunning: readRunning(binding.session),
      lastUserSeq: newestSeqOf(binding.eventSource, 'user/message'),
      // Pre-existing endings are invisible to this chain, except an
      // unanswered failure inside the recovery window. While the history page
      // has not landed yet the window holds nothing, so the baseline waits for
      // it (see ensureHistoryReady) instead of treating its endings as live.
      historyReady: first.open,
      lastHandledTurnEndSeq: first.open
        ? recoveredBaseline ?? newestSeqOf(binding.eventSource, 'turn/end')
        : 0,
      consecutive: 0,
      phase: 'idle',
      sendEpoch: 0,
      nextSendAt: 0,
      waitMs: 0,
      detail: '',
      pendingSendTurnEndSeq: undefined,
      pendingSendScheduledAt: 0,
      pendingRetryAfterMs: undefined,
      lastAutoSentAt: 0,
      lastAutoSentText: undefined,
      unsubs: [],
      evalDeadline: 0,
      evalTimer: undefined,
      sendTimer: undefined,
    }
    chains.set(state.sessionId, state)
    try {
      state.unsubs.push(binding.session.subscribe(() => onSnapshot(state)))
    } catch {
      dropChain(state)
      return undefined
    }
    try {
      state.unsubs.push(binding.eventSource.subscribe(() => {
        scanUserEvents(state)
        ensureHistoryReady(state)
        armForNewTurnEnd(state)
      }))
    } catch (error) {
      dropChain(state)
      console.warn('[dsh-model-think-level] auto-continue: event source unusable:', error)
      return undefined
    }
    if (reference !== undefined) watchReady(state, reference)
    return state
  }

  const readRunning = (session: SessionFaceLike): boolean => {
    try {
      return session.getSnapshot().running === true
    } catch {
      return false
    }
  }

  /** The newest durable seq of one event type, 0 when the window has none. */
  const newestSeqOf = (source: EventSourceLike, type: string): number => {
    let newest = 0
    let entries: readonly { readonly type?: string; readonly event?: DurableEventLike }[] = []
    try {
      entries = source.getSnapshot().entries ?? []
    } catch {
      return 0
    }
    for (const entry of entries) {
      if (entry.type !== 'event' || entry.event === undefined) continue
      if (entry.event.type === type && entry.event.seq > newest) newest = entry.event.seq
    }
    return newest
  }

  /** Inspect every live chain, not just the selected pane. Never open idle history en masse. */
  const track = (): void => {
    if (disposed) return
    const sessions = ctx.get?.('sessions') as SessionsServiceLike | undefined
    const uiSession = ctx.get?.('uiSession') as UiSessionLike | undefined
    const id = currentSessionId(sessions, uiSession)
    if (sessions === undefined) { dropAllChains(); return }
    current = id === undefined ? undefined : ensureChain(sessions, id)
    const catalog = sessions.list?.getSnapshot()
    const runningIds = new Set<string>()
    if (autoContinueEnabled()) {
      for (const key of catalog?.ids ?? Object.keys(catalog?.byId ?? {})) {
        const row = catalog?.byId?.[key]
        if (row?.running !== true || row.origin === 'subagent') continue
        const runningId = row.id ?? key
        runningIds.add(runningId)
        if (runningId !== id) ensureChain(sessions, runningId)
      }
    }
    for (const previous of [...chains.values()]) {
      const state = previous === current ? previous : ensureChain(sessions, previous.sessionId)
      if (state === undefined) continue
      // Poll snapshot AND window: an event publication or running edge may be coalesced.
      onSnapshot(state)
      scanUserEvents(state)
      sweep(state)
      if (state === current) continue
      const snap = snapshotOfState(state)
      if (snap?.running || snap?.pending || runningIds.has(state.sessionId)) continue
      if (state.phase !== 'idle' || state.evalTimer !== undefined || state.evalDeadline > Date.now()) continue
      dropChain(state)
    }
    notifyStatus()
  }

  const interval = setInterval(track, TICK_MS)
  track()

  // A connection reset replaces every binding: the old attachment's objects
  // are dead and its subscriptions must go before the next poll re-attaches.
  let disposeReset: (() => void) | undefined
  try {
    disposeReset = ctx.on?.('connection/reset', () => { dropAllChains() })
  } catch {
    // The connection event is an optimization here; the poll heals regardless.
  }

  const disposeEnabled = subscribeAutoContinueEnabled(() => {
    if (autoContinueEnabled()) { track(); return }
    // The switch is global: cancel and release ALL background work immediately.
    for (const state of [...chains.values()]) {
      cancelPendingSend(state)
      settleChain(state)
      if (state.evalTimer !== undefined) {
        clearTimeout(state.evalTimer)
        timers.delete(state.evalTimer)
        state.evalTimer = undefined
      }
      state.evalDeadline = 0
      if (state !== current) { dropChain(state); continue }
      const reference = state.reference
      state.reference = undefined
      try { reference?.release() } catch { /* Already disposed host generation. */ }
    }
  })
  const disposeConfig = subscribeAutoContinueConfig(() => {
    for (const state of chains.values()) {
      if (state.pendingSendTurnEndSeq === undefined) continue
      if (!autoContinueEnabled() || state.consecutive >= autoContinueConfig().maxRetries) cancelPendingSend(state)
      else scheduleSend(state)
    }
    notifyStatus()
  })

  /** Stand down for this session only: hide the chip and stop judging endings. */
  const stop = (): void => {
    const state = current
    if (state === undefined) return
    cancelPendingSend(state)
    if (state.evalTimer !== undefined) {
      clearTimeout(state.evalTimer)
      timers.delete(state.evalTimer)
      state.evalTimer = undefined
    }
    state.evalDeadline = 0
    state.consecutive = 0
    muted.add(state.sessionId)
    settleChain(state)
  }

  /** Clear a stood-down chain so the next ending starts again at one. */
  const reset = (): void => {
    const state = current
    if (state === undefined) return
    state.consecutive = 0
    muted.delete(state.sessionId)
    settleChain(state)
  }

  /** Skip the remaining wait and reply now. */
  const resumeNow = (): void => {
    const state = current
    if (state === undefined) return
    if (state.pendingSendTurnEndSeq === undefined) return
    if (state.sendTimer !== undefined) {
      clearTimeout(state.sendTimer)
      timers.delete(state.sendTimer)
      state.sendTimer = undefined
    }
    void send(state, t('autoContinueMessage'))
  }

  return {
    status,
    subscribe: (listener: () => void): (() => void) => {
      statusListeners.add(listener)
      return () => { statusListeners.delete(listener) }
    },
    stop,
    reset,
    resumeNow,
    dispose: (): void => {
      disposed = true
      disposeEnabled()
      disposeConfig()
      disposeReset?.()
      clearInterval(interval)
      dropAllChains()
      statusListeners.clear()
      for (const timer of timers) clearTimeout(timer)
      timers.clear()
    },
  }
}
