/**
 * The fetch-layer installer for provider request-header overrides. The decision of
 * WHAT to override lives in `headers-core.ts`; this module owns the global seam.
 *
 * Shape of the seam: one process-wide wrapper owns `globalThis.fetch`, and
 * every activation is an ENTRY inside it. That is what makes the plugin safe
 * next to itself (an HMR remount, a second composer, two plugin instances) and
 * what makes unloading exact: an entry leaves the registry and the wrapper is
 * restored only once the last entry is gone — never a blind
 * `globalThis.fetch = original` that would clobber a wrapper installed after
 * this one, and never a wrapper left behind holding the process's fetch.
 *
 * The wrapper is deliberately narrow: a request whose URL is not in the index
 * passes through with its ORIGINAL arguments (same object identity), so
 * unconfigured traffic pays exactly one URL classification and one index
 * lookup — no allocation beyond that, and no way for a bug in the merge path
 * to alter a request that never matched.
 *
 * Why fetch rather than the pi-ai `transformHeaders` option, which would be
 * narrower: reaching that option means holding the adapter's private `models`
 * collection, and every sanctioned seam (`llm/stream` waterfall,
 * `registerAdapter`) stops at the stream, above the wire. Fetch is the only
 * public surface that sees the merged headers. Both were probed against the
 * real runtime — see `.tmp-rel/headers-probe/`.
 *
 * @module dsh-model-think-level/headers-fetch
 */
import { emptyIndex, type HeaderIndex } from './headers-core.js';
/** Handle one activation keeps; `dispose` is idempotent. */
export interface HeaderOverlayHandle {
    /** Remove this activation's entry, restoring the original fetch when it was the last. */
    dispose(): void;
}
/** Handle for tests and the caller to swap the index a live activation reads. */
export interface HeaderOverlay extends HeaderOverlayHandle {
    /** Whether this activation's entry is still installed. */
    readonly active: boolean;
}
/** A mutable index source an activation reads on every request. */
export interface OverlaySource {
    current: HeaderIndex;
}
/**
 * Install (or join) the process-wide header wrapper.
 * @param source - the live index this activation contributes.
 * @returns a handle whose `dispose` removes exactly this activation.
 */
export declare function installHeaderOverlay(source: OverlaySource): HeaderOverlay;
/** Whether this plugin's wrapper currently owns the global fetch (diagnostics). */
export declare function headerOverlayInstalled(): boolean;
/** The empty index, re-exported so callers building one need a single import. */
export { emptyIndex };
