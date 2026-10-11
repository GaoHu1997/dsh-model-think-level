/**
 * Per-session model directory resolution and the effort-memory wiretap ledger.
 *
 * Deliberately menu-INDEPENDENT: the directory is a per-session instance, and a
 * brand-new session's durable projection lands without going through `select`,
 * so the watcher is the only thing that can re-apply the remembered level to it
 * — it must be in place from the session's birth, not from the first time the
 * user opens the model menu (issue #4: every new session otherwise read as
 * Default until a manual pick). The caller therefore drives `ensure()` on every
 * mutation and scan; the per-session cache makes the hot path one snapshot read.
 *
 * @module dsh-model-think-level/client/injection/session-directory
 */
import type { ModelDirectoryLike } from '../types.js';
/** What the tracker needs from its host. */
export interface SessionDirectoryDeps {
    /** The client root context, probed lazily for its service seats. */
    ctx: unknown;
    /** The configured-pick reader layering the effort chain (issue #4). */
    configuredEffort: (provider: string, model: string) => Promise<string | undefined>;
}
/** The tracker's face. */
export interface SessionDirectoryTracker {
    /** Resolve (and wire) the current session's directory; undefined in the boot window. */
    ensure: () => ModelDirectoryLike | undefined;
    /** Restore every wrapped directory's original select; the fiber is going away. */
    dispose: () => void;
}
/**
 * Build the session-directory tracker.
 * @param deps - the client context and the configured-pick reader.
 * @returns the tracker's {@link SessionDirectoryTracker} face.
 */
export declare function createSessionDirectoryTracker(deps: SessionDirectoryDeps): SessionDirectoryTracker;
