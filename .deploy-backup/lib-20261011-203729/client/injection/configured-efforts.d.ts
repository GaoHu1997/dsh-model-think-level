/**
 * The browser-side cache of the settings document's per-model `defaultEffort`
 * field (issue #4).
 *
 * The composer effort chain reads it through {@link ConfiguredEfforts.of}; a
 * pushed document update or a connection reset invalidates it and the next read
 * re-describes. A refused or empty read is deliberately NOT cached, so a
 * gateway hiccup cannot silently disable the configured layer until the next
 * invalidation.
 *
 * @module dsh-model-think-level/client/injection/configured-efforts
 */
import type { RemoteApi } from '../types.js';
/** What the cache reads through. */
export interface ConfiguredEffortsDeps {
    /** The settings remote. */
    api: RemoteApi;
}
/** The cache's face. */
export interface ConfiguredEfforts {
    /** The configured pick for one model, after the cache has settled. */
    of: (provider: string, model: string) => Promise<string | undefined>;
    /** Drop the cache; the next read re-describes. */
    invalidate: () => void;
}
/**
 * Build the configured-pick cache.
 * @param deps - the settings remote.
 * @returns the cache's {@link ConfiguredEfforts} face.
 */
export declare function createConfiguredEfforts(deps: ConfiguredEffortsDeps): ConfiguredEfforts;
