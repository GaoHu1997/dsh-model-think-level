/**
 * The per-provider model-order preference: the sequence the user set by dragging
 * the model rows inside one provider's editor on the official Models page.
 *
 * One storage key holds every provider's sequence, keyed by the provider id the
 * provider rows already use (`data-bre-provider`, or the Edit button's route) —
 * the same id space as `provider-order.ts`, so a provider renamed in the
 * switcher keeps its models' order.
 *
 * localStorage, for the same reason the provider order is: this is a UI
 * ordering, not a wire setting. The official editor renders
 * `models.map((model, index) => <ModelRow position={index + 1} />)`, so the row
 * an index names is not something we can rewrite through the settings API (and
 * a reorder there would renumber every `aria-label` on the page). The rows are
 * placed with CSS `order` instead, and the composer switcher reads the same
 * sequences.
 *
 * @module dsh-model-think-level/client/model-order
 */
/** localStorage key (own namespace; the upstream plugin's keys stay untouched). */
export declare const MODEL_ORDER_KEY = "dsh-model-think-level.model-order";
/** Every provider's stored sequence, by provider id. */
export type ModelOrderMap = Readonly<Record<string, readonly string[]>>;
/** Parse a stored/announced payload into a usable map. */
export declare function parseModelOrders(raw: string | null): ModelOrderMap;
/**
 * Snapshot every stored sequence. The returned object identity is stable until
 * some provider's order changes, which is what makes it a legal
 * `useSyncExternalStore` snapshot for a component that shows one provider.
 */
export declare function modelOrders(): ModelOrderMap;
/** One provider's stored sequence (empty when the user has never dragged its models). */
export declare function modelOrderOf(provider: string): readonly string[];
/** Save one provider's sequence (persisted immediately; a failed write keeps the session value). */
export declare function setModelOrder(provider: string, next: readonly string[]): void;
/** Apply a map incoming from another tab (no persist: the writer already stored it). */
export declare function syncModelOrders(next: ModelOrderMap): void;
/** Subscribe to order changes; returns the disposer. */
export declare function subscribeModelOrders(listener: () => void): () => void;
/**
 * Fold one provider's sequence into the ids the editor currently renders: the
 * ids the preference names are permuted among the slots they occupy, and a model
 * the user has never dragged (a newly added one) keeps the position it holds.
 */
export declare function orderModels(ids: readonly string[], preferred: readonly string[]): readonly string[];
/** The effective order of a provider's `ids`: the dragged sequence where it applies. */
export declare function resolveModelOrder(provider: string, ids: readonly string[]): readonly string[];
/**
 * The same fold for a caller holding whole model entries rather than ids — the
 * composer switcher renders the directory's own objects, and must not rebuild
 * them. An entry whose id the preference does not name keeps its position, so a
 * model the user has never dragged (a newly added one) does not jump.
 */
export declare function orderModelEntries<T extends {
    readonly id: string;
}>(entries: readonly T[], preferred: readonly string[]): readonly T[];
