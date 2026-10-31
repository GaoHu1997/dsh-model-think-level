/**
 * The auto-continue watcher: replies 「继续」 to the current session's turn
 * when it ended in a way worth continuing, and stays silent otherwise.
 *
 * The decision is {@link judgeTurnTail} (auto-continue-rules.ts); this module
 * owns the OBSERVATION and the GUARDS around it:
 *
 *   - Only the CURRENT session is watched, and only LIVE endings: the running
 *     edge (`running` true → false) must be observed on the attached session
 *     before anything is evaluated. A page that loads into a session whose
 *     last turn failed yesterday does nothing — auto-continuing stale
 *     failures is exactly the mindless behaviour the switch must not have.
 *   - The durable `turn/end` is what is judged, not the running edge, so the
 *     evaluation waits briefly for the settlement to reach the event window.
 *   - Guards at send time: the switch still on, the turn still ended, nothing
 *     the user submitted pending, the session still the one on screen.
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
} from '../auto-continue-pref.js'
import {
  judgeTurnTail,
  MAX_CONSECUTIVE,
  type DurableEventLike,
} from '../auto-continue-rules.js'
import { currentSessionId, type SessionsLike, type UiSessionLike } from './session-directory.js'

/** How often the current-session binding is re-resolved. */
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

/** Delay before the FIRST automatic reply of a chain. */
const SEND_BASE_DELAY_MS = 2_000

/** Ceiling of one send delay, with or without a provider-requested wait. */
const SEND_DELAY_MAX_MS = 30_000

/** Ceiling for a provider-requested `providerRetryAfterMs`. */
const RETRY_AFTER_MAX_MS = 120_000

/** How far a user event may sit from the auto-send and still be attributed to it. */
const AUTO_SEND_ECHO_TOLERANCE_MS = 30_000

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

/** The `sessions` service face the watcher needs, beyond {@link SessionsLike}. */
interface SessionsServiceLike extends SessionsLike {
  binding?(id: string): SessionBindingLike | undefined
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
}

/** One attached session's live state. */
interface Attached {
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
  /** Whether the initial history page has landed; everything before it is baseline. */
  historyReady: boolean
  /** The turn/end seq the pending send timer belongs to, if one is queued. */
  pendingSendTurnEndSeq: number | undefined
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
  /** The one currently watched session, undefined while nothing is open. */
  let attached: Attached | undefined
  let disposed = false
  const timers = new Set<ReturnType<typeof setTimeout>>()

  const later = (fn: () => void, ms: number): void => {
    const timer = setTimeout(() => {
      timers.delete(timer)
      fn()
    }, ms)
    timers.add(timer)
  }

  // ---- Event-window reads ----

  /** The attachment's durable events, oldest first. */
  const durableEventsOf = (state: Attached): DurableEventLike[] => {
    let entries: readonly { readonly type?: string; readonly event?: DurableEventLike }[] = []
    try {
      entries = state.eventSource.getSnapshot().entries ?? []
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

  /**
   * Fold the window's new user messages into the streak: anything the USER
   * sent by hand resets it. A user message is attributed to this watcher's
   * own reply when its text matches what was sent and it arrived within the
   * echo tolerance — a manual 「继续」 typed in that window reads as a reset,
   * which is the conservative direction (the streak shrinks, never grows).
   */
  const scanUserEvents = (state: Attached): void => {
    const events = durableEventsOf(state)
    for (let index = events.length - 1; index >= 0; index -= 1) {
      const event = events[index]!
      // Walk past every non-user event: a message that was admitted together
      // with the step it started still resets the streak. Monotonic seqs make
      // the first already-seen user message the stop.
      if (event.type !== 'user/message') continue
      if (event.seq <= state.lastUserSeq) break
      if (isOwnEcho(state, event)) {
        state.lastUserSeq = event.seq
        continue
      }
      state.lastUserSeq = event.seq
      state.consecutive = 0
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

  /** Send delay for the next automatic reply of the streak. */
  const sendDelayOf = (consecutive: number, waitMs: number | undefined): number => {
    const ladder = Math.min(SEND_BASE_DELAY_MS * 2 ** consecutive, SEND_DELAY_MAX_MS)
    if (waitMs === undefined) return ladder
    return Math.min(Math.max(ladder, waitMs), RETRY_AFTER_MAX_MS)
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

  /** Whether the current session on screen is still this one. */
  const stillCurrent = (state: Attached): boolean => {
    const sessions = ctx.get?.('sessions') as SessionsServiceLike | undefined
    const uiSession = ctx.get?.('uiSession') as UiSessionLike | undefined
    return currentSessionId(sessions, uiSession) === state.sessionId
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
    if (disposed || attached !== state) return
    state.evalTimer = setTimeout(() => {
      state.evalTimer = undefined
      evaluate(state)
    }, delay)
    timers.add(state.evalTimer)
  }

  /**
   * Arm the evaluation loop when a NEW durable `turn/end` is visible and the
   * session already reads as idle. Reached from BOTH triggers:
   *
   *   - the event-window subscription (synchronous, per append): the durable
   *     settlement itself is the authoritative "a turn ended" signal;
   *   - the snapshot's running edge.
   *
   * Two triggers because neither alone is reliable. The snapshot notifier
   * COALESCES flushes into one microtask, so a turn that starts and ends
   * within one flush never shows the watcher a true→false edge; and the
   * settlement can land while the running bit still reads true (the bit rides
   * a separate wire frame), where the event alone must not arm yet. The event
   * trigger fires only when the snapshot already reads idle; the edge trigger
   * covers the settlement-first order.
   */
  /**
   * Flip the attachment to history-ready the first time the session's window
   * IS the truth (`open`). Everything the initial page carried - including a
   * failure the session already ended before the page arrived - becomes
   * baseline at that moment: only endings appended AFTER the page are live.
   */
  const ensureHistoryReady = (state: Attached): void => {
    if (state.historyReady) return
    const snap = snapshotOf(state.session)
    if (snap === undefined || !snap.open) return
    state.historyReady = true
    state.lastHandledTurnEndSeq = Math.max(state.lastHandledTurnEndSeq, newestSeqOf(state.eventSource, 'turn/end'))
  }

  const armForNewTurnEnd = (state: Attached): void => {
    if (!state.historyReady) return
    const snap = snapshotOf(state.session)
    if (snap === undefined || snap.running) return
    const events = durableEventsOf(state)
    for (let index = events.length - 1; index >= 0; index -= 1) {
      const event = events[index]!
      if (event.type !== 'turn/end') continue
      if (event.seq > state.lastHandledTurnEndSeq) armEvaluation(state)
      return
    }
  }

  const evaluate = (state: Attached): void => {
    if (disposed || attached !== state) return
    // No judgements before the history page lands: its endings are baseline.
    // The switch is consulted per evaluation: turning it off stops the loop
    // mid-wait, and turning it on only affects the NEXT ending.
    if (!autoContinueEnabled()) return
    const snap = snapshotOf(state.session)
    if (!state.historyReady) return
    if (snap === undefined || snap.running || snap.pending > 0) return
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
    const verdict = judgeTurnTail({ turnEnd, turnEvents: tailOf(events, turnEndIndex) })
    if (verdict.kind === 'settled') {
      // A completed / aborted / blocked turn is evidence the session is not
      // stuck: the streak resets even though nothing is sent.
      state.consecutive = 0
      return
    }
    if (verdict.kind === 'refuse') return
    if (state.consecutive >= MAX_CONSECUTIVE) {
      console.info(`[dsh-model-think-level] auto-continue: streak cap (${MAX_CONSECUTIVE}) reached, standing down (${verdict.detail})`)
      return
    }
    if (!claimTurn(state.sessionId, turnEnd.seq)) return
    const text = t('autoContinueMessage')
    const delay = sendDelayOf(state.consecutive, verdict.waitMs)
    state.pendingSendTurnEndSeq = turnEnd.seq
    state.sendTimer = setTimeout(() => {
      state.sendTimer = undefined
      void send(state, text)
    }, delay)
    timers.add(state.sendTimer)
  }

  const send = async (state: Attached, text: string): Promise<void> => {
    if (disposed || attached !== state) return
    // A newer turn/end took over the attachment since this send was armed:
    // the older reply would answer a turn that has already moved on.
    const armedSeq = state.pendingSendTurnEndSeq
    state.pendingSendTurnEndSeq = undefined
    if (armedSeq === undefined || armedSeq !== state.lastHandledTurnEndSeq) return
    if (!autoContinueEnabled()) return
    const snap = snapshotOf(state.session)
    // Re-checks at fire time: the user may have queued something, the model
    // may have resumed itself, or the view may have moved on.
    if (snap === undefined || snap.running || snap.pending > 0) return
    if (!stillCurrent(state)) return
    try {
      const answer = await state.session.prompt([{ type: 'text', text }], 'queue')
      if (answer?.ok !== true) {
        // A refused prompt counts toward the streak: a transport that just
        // failed the turn must not be hammered by the continuation either.
        state.consecutive += 1
        console.warn(`[dsh-model-think-level] auto-continue: prompt refused ${describeError(answer)}`)
        return
      }
      state.consecutive += 1
      state.lastAutoSentAt = Date.now()
      state.lastAutoSentText = text
    } catch (error) {
      state.consecutive += 1
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
    const snap = snapshotOf(state.session)
    if (snap === undefined) return
    ensureHistoryReady(state)
    if (state.wasRunning && !snap.running) armEvaluation(state)
    state.wasRunning = snap.running
  }

  const detach = (): void => {
    const state = attached
    if (state === undefined) return
    attached = undefined
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
  }

  const attach = (binding: SessionBindingLike): void => {
    // A subagent view is watched by nobody: skip before any listener exists.
    const first = snapshotOf(binding.session)
    if (first === undefined || first.subagent) return
    const state: Attached = {
      sessionId: binding.sessionId,
      session: binding.session,
      eventSource: binding.eventSource,
      // Recording the live value WITHOUT an edge: a session that was already
      // running when attached, or already ended before it, is never judged.
      wasRunning: readRunning(binding.session),
      lastUserSeq: newestSeqOf(binding.eventSource, 'user/message'),
      // Pre-existing endings are invisible to this attachment: only endings
      // observed live are judged. While the history page has not landed yet
      // the window holds nothing, so the baseline waits for it (see
      // ensureHistoryReady) instead of treating the page's endings as live.
      historyReady: first.open,
      lastHandledTurnEndSeq: first.open ? newestSeqOf(binding.eventSource, 'turn/end') : 0,
      consecutive: 0,
      pendingSendTurnEndSeq: undefined,
      lastAutoSentAt: 0,
      lastAutoSentText: undefined,
      unsubs: [],
      evalDeadline: 0,
      evalTimer: undefined,
      sendTimer: undefined,
    }
    attached = state
    try {
      state.unsubs.push(binding.session.subscribe(() => onSnapshot(state)))
    } catch {
      detach()
      return
    }
    try {
      state.unsubs.push(binding.eventSource.subscribe(() => {
        scanUserEvents(state)
        ensureHistoryReady(state)
        armForNewTurnEnd(state)
      }))
    } catch (error) {
      detach()
      console.warn('[dsh-model-think-level] auto-continue: event source unusable:', error)
      return
    }
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

  /** One poll: re-resolve the current session and swap the attachment when it moved. */
  const track = (): void => {
    if (disposed) return
    const sessions = ctx.get?.('sessions') as SessionsServiceLike | undefined
    const uiSession = ctx.get?.('uiSession') as UiSessionLike | undefined
    const id = currentSessionId(sessions, uiSession)
    if (id === undefined || sessions === undefined || typeof sessions.binding !== 'function') {
      detach()
      return
    }
    let binding: SessionBindingLike | undefined
    try {
      binding = sessions.binding(id)
    } catch {
      binding = undefined
    }
    if (binding === undefined || binding.session === undefined) {
      detach()
      return
    }
    if (attached !== undefined && attached.session === binding.session) return
    detach()
    attach(binding)
  }

  const interval = setInterval(track, TICK_MS)
  track()

  // A connection reset replaces every binding: the old attachment's objects
  // are dead and its subscriptions must go before the next poll re-attaches.
  try {
    ctx.on?.('connection/reset', () => { detach() })
  } catch {
    // The connection event is an optimization here; the poll heals regardless.
  }

  return {
    dispose: (): void => {
      disposed = true
      clearInterval(interval)
      detach()
      for (const timer of timers) clearTimeout(timer)
      timers.clear()
    },
  }
}
