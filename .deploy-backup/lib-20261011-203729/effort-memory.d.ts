import type { ModelDirectoryLike } from './types.js';
/**
 * The wiring-provided read of the per-model configured pick (the settings
 * document's `defaultEffort` field). Async because it lives in the pi-ai
 * document, not in localStorage; the wiring owns the caching describe.
 * Absent (tests, or a wiring that does not supply it) skips the layer.
 */
export interface EffortMemoryDeps {
    configuredEffort?: (provider: string, model: string) => Promise<string | undefined>;
}
/**
 * Whether a `select` outcome is a refusal.
 *
 * Kernels through 0.1.6-alpha.1 reject by THROWING; 0.1.6-alpha.2 resolves the
 * wire's `RemoteResult` (`{ok:false}`) instead. Normalizing both shapes here
 * keeps the memory discipline identical on either kernel.
 * @param outcome - the value `select` resolved with (or undefined on success).
 * @returns whether the host refused the selection.
 */
export declare function isSelectRefusal(outcome: unknown): boolean;
/**
 * The user-facing message of a refusal result, or undefined when the outcome
 * was accepted. Only 0.1.6-alpha.2's resolved shape carries one; a kernel that
 * rejects by throwing never reaches here.
 * @param outcome - the value `select` resolved with.
 * @returns `code: message`, or undefined when accepted.
 */
export declare function selectRefusalMessage(outcome: unknown): string | undefined;
/** Record the level the user explicitly picked for one model. */
export declare function rememberEffort(provider: string, model: string, id: string): void;
/** The level explicitly picked for one model, or undefined when none was. */
export declare function rememberedEffort(provider: string, model: string): string | undefined;
/**
 * Wire one directory with the effort-memory discipline: wrap its `select`
 * (model-switch path) and watch its store (projection-restore path).
 * Idempotent: an already-wired directory is left alone and the returned
 * disposer is a no-op. The disposer unsubscribes the watcher and restores
 * the original `select` (the directory instance outlives the plugin fiber
 * on disable/HMR).
 * @param directory - the shared per-session directory to wire.
 * @param deps - optional wiring face (the configured-pick read).
 * @returns the disposer restoring the original `select` and the watcher.
 */
export declare function wireEffortMemory(directory: ModelDirectoryLike, deps?: EffortMemoryDeps): () => void;
