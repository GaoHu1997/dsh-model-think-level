/**
 * The one document-level event the browser half uses to keep its two separate
 * React roots in step.
 *
 * The provider card and the key list are mounted independently: the card owns the
 * two base URLs (`endpoints`) of a route, and the key list decides which protocols
 * a key may pin from those very addresses. Neither can call the other, so the card
 * says what changed and the list re-reads.
 *
 * A plain string, so the host half can import it too without pulling in DOM code.
 *
 * @module dsh-model-think-level/client/events
 */

/** Fired on `document` when a route's two base URLs changed. */
export const ENDPOINTS_CHANGED_EVENT = 'bre:endpoints-changed'

/** What {@link ENDPOINTS_CHANGED_EVENT} carries. */
export interface EndpointsChangedDetail {
  /** The route whose addresses moved. */
  readonly route: string
  /** Its OpenAI-family base URL, '' when unset. */
  readonly openai: string
  /** Its Anthropic-family base URL, '' when unset. */
  readonly anthropic: string
}

/**
 * Fired on `document` when the settings document moved (the pi-ai namespace,
 * whose provider routes this page edits).
 *
 * The key panels are separate mounts from the page's scan, and a save is
 * exactly the moment their route's facts changed: the panel re-reads on this
 * event instead of waiting for a remount, which is also how the host's silent
 * post-save scope probe reaches an already-open panel.
 */
export const SETTINGS_CHANGED_EVENT = 'bre:settings-changed'

/** What {@link SETTINGS_CHANGED_EVENT} carries. */
export interface SettingsChangedDetail {
  /** The namespace that moved. */
  readonly ns: unknown
}

/**
 * Fired on `document` when a route's BALANCE endpoint moved.
 *
 * The URL is written from the provider card's balance row, which lives in a
 * different mount from the provider list that shows the amount. The card cannot
 * reach that list, so it says the URL changed and the Models page re-reads the
 * route immediately instead of waiting out the chip's refresh window.
 */
export const BALANCE_CHANGED_EVENT = 'bre:balance-changed'

/** What {@link BALANCE_CHANGED_EVENT} carries. */
export interface BalanceChangedDetail {
  /** The route whose balance endpoint moved. */
  readonly route: string
  /** The stored URL, '' when the row was cleared. */
  readonly endpoint: string
}
