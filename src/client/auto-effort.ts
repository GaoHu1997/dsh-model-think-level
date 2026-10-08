/**
 * The "adapt every model of this provider" request (user request ⑤).
 *
 * The seat beside the official fetch-models link and the per-row reasoning
 * editor are two DIFFERENT React roots: the seat is raw DOM this plugin writes
 * into the official catalogue head, while the editor is a root the injector
 * mounts into each model row's disclosure. They share no props, so the request
 * travels as one document event, and every editor whose own route matches
 * answers it by running the very same `autoAdapt()` its own 自动适配 link runs.
 *
 * That indirection is the point: adapting N models this way is byte-identical
 * to clicking that link N times, so the seat cannot drift from the control the
 * user already trusts — and it still reaches the models whose thinking switch
 * is OFF, which the link itself cannot (with the switch off the whole effort
 * card, link included, is not rendered at all).
 *
 * @module dsh-model-think-level/client/auto-effort
 */

/** The event a seat dispatches and every mounted editor listens for. */
export const AUTO_EFFORT_EVENT = 'bre:auto-effort'

/** The event's payload: the provider route whose models are to be adapted. */
export interface AutoEffortDetail {
  /** The provider route the request belongs to. */
  readonly route: string
}

/**
 * What one provider-wide adapt did, so the seat that asked can SAY so.
 *
 * The seat used to be a fire-and-forget control: the click held writes in a
 * ledger the user never saw, so "did that work?" had no answer on screen. The
 * counts below are the settings-document walk's own report — the arm that can
 * see every model of the route, which is exactly the set the click is about.
 */
export interface AutoAdaptReport {
  /** Unconfigured models this pass held an adaptation for. */
  readonly held: number
  /** Unconfigured models that had no suggestion to offer. */
  readonly unsuggested: number
  /**
   * Why the pass could not run at all, when it could not: another pass is in
   * flight, the document is not writable, the route is not saved yet, or the
   * route declares no models. Every one of those is "nothing was held", which
   * must not read as "already configured".
   */
  readonly blocked?: 'busy' | 'unwritable' | 'unknown-route' | 'no-models'
  /** The failure text when the pass threw before it could report counts. */
  readonly failed?: string
}

/**
 * The tail of the one-at-a-time queue. A catalogue can carry dozens of models
 * and every adapt reads the provider's own model list, so the requests must not
 * all be in flight at once. The chain never rejects: a failed adapt reports
 * itself inside its own editor (the editor owns that message), and one bad row
 * must not strand the rows queued behind it.
 */
let tail: Promise<void> = Promise.resolve()

/** Run one auto-adapt after every earlier one settled. */
export function queueAutoEffort(run: () => Promise<void> | void): void {
  tail = tail.then(run, run).then(() => undefined, () => undefined)
}

/** Ask every editor of `route` on this document to adapt its own model. */
export function requestAutoEffort(route: string, target: Document = document): void {
  target.dispatchEvent(new CustomEvent<AutoEffortDetail>(AUTO_EFFORT_EVENT, { detail: { route } }))
}

/**
 * Answer this document's auto-adapt requests until the returned disposer runs.
 * A request naming another route is ignored — one card is open at a time, but a
 * re-render can leave a previous card's rows mounted for a scan.
 */
export function listenAutoEffort(handler: (route: string) => void, target: Document = document): () => void {
  const listener = (event: Event): void => {
    const detail = (event as CustomEvent<AutoEffortDetail>).detail
    if (typeof detail?.route !== 'string' || detail.route.length === 0) return
    handler(detail.route)
  }
  target.addEventListener(AUTO_EFFORT_EVENT, listener)
  return () => { target.removeEventListener(AUTO_EFFORT_EVENT, listener) }
}
