/**
 * The provider-order preference: the sequence the user set by dragging the
 * provider rows on the official Models settings page.
 *
 * Deliberately localStorage, like the slider preference and for the same
 * reason: this is a UI ordering, not a wire setting. It is also the ONLY place
 * the order can live. The Models page's row order is not the `providers` key
 * order — `dsh-llm-pi-ai`'s `directoryEntries()` builds the configurable-
 * provider directory as "every installed catalog route, then the routes the
 * profiles declare", and the page keeps that declaration order (pinning
 * `deepseek-account`/`deepseek-official` first). Rewriting the dict would not
 * move a single row, and the settings write vocabulary
 * (`{ op: 'set' | 'unset' }`) has no reorder op to rewrite it with. So the
 * order lives beside the page: the rows are placed with CSS `order`, and the
 * composer model switcher reads the very same sequence.
 *
 * @module dsh-model-think-level/client/provider-order
 */
/** localStorage key (own namespace; the upstream plugin's keys stay untouched). */
export declare const PROVIDER_ORDER_KEY = "dsh-model-think-level.provider-order";
/** Parse a stored/announced payload into a usable id sequence. */
export declare function parseProviderOrder(raw: string | null): readonly string[];
/**
 * Snapshot the current sequence. The returned array identity is stable until
 * the order changes, which is what makes it a legal `useSyncExternalStore`
 * snapshot.
 */
export declare function providerOrder(): readonly string[];
/** Save the sequence (persisted immediately; a failed write keeps the session value). */
export declare function setProviderOrder(next: readonly string[]): void;
/** Apply a sequence incoming from another tab (no persist: the writer already stored it). */
export declare function syncProviderOrder(next: readonly string[]): void;
/** Subscribe to order changes; returns the disposer. */
export declare function subscribeProviderOrder(listener: () => void): () => void;
/**
 * The order the official Models page itself renders `ids` in: the two pinned
 * routes first, everything else in the order it arrived (a stable sort, exactly
 * like the page's `toSorted`).
 */
export declare function baseProviderOrder(ids: readonly string[]): readonly string[];
/**
 * Fold the user's sequence into a base order: the ids the preference names are
 * permuted among the slots they occupy, and every other id keeps the slot it
 * already had. A provider the user has never seen therefore keeps its natural
 * position instead of being exiled to the end.
 */
export declare function mergeProviderOrder(base: readonly string[], preferred: readonly string[]): readonly string[];
/**
 * The effective order of `ids`: the dragged sequence where it applies, the
 * official page's own order everywhere else.
 */
export declare function resolveProviderOrder(ids: readonly string[]): readonly string[];
/**
 * Move `item` so it ends up at index `toIndex` of the result. The index is
 * interpreted against the RESULT, not the input, so a caller that derived it
 * from the row the pointer is over lands where the user pointed.
 */
export declare function moveToIndex<T>(items: readonly T[], item: T, toIndex: number): T[];
