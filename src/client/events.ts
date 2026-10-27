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
