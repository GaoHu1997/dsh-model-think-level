/**
 * Client-side declaration write seam over 'settings.mutate', plus the
 * knowledge-base / protocol suggestions. Pure logic --
 * no React, no DOM -- so it stays unit-testable in isolation.
 *
 * @module dsh-model-think-level/client/ops
 */
import { type CompatSuggestion, type InputModalities, type ReasoningEfforts } from '../knowledge.js';
import type { DefaultEffortIntent, EffortEditorApi, EffortWriteIntent, HeldWrite, InputIntent, RemoteApi, SettingsJoin, SettingsNamespaceView } from './types.js';
/** The user-layer providers dict of the pi-ai namespace, as records. */
export declare function providersOf(namespace: SettingsNamespaceView | undefined): Record<string, Record<string, unknown>>;
/**
 * The `models` value a write must be based on, read from the RAW layers: the
 * user section when it declares one, else the composition base. That is the
 * official card's own inheritance rule (`ProviderEditor` seeds its draft from
 * `namespace.user` and its fallback from `namespace.base`).
 *
 * Never the resolved `value`: rebuilding from it materializes every schema
 * default -- `input: []`, an empty `compat`, an absent `models` -- into the
 * stored document, so the user's file grows keys they never chose and a later
 * schema change can no longer reach the row.
 * @param namespace - the namespace view carrying the layers.
 * @param route - the provider route key.
 * @returns the raw `models` value, or undefined when neither layer declares one.
 */
export declare function baselineModelsOf(namespace: SettingsNamespaceView | undefined, route: string): unknown;
/**
 * The RAW USER layer's providers dict, or undefined when the section declares
 * none. The browser half's running auto-fill builds its patch from this --
 * never from the resolved `value`, which would materialize schema defaults
 * into the stored document (the same rule the host's boot pass follows).
 * @param namespace - the namespace view.
 * @returns the user section's providers dict, when it has one.
 */
export declare function userProvidersOf(namespace: SettingsNamespaceView | undefined): Record<string, unknown> | undefined;
/** The reasoningEfforts of one model in a route's models. */
export declare function effortsOf(models: Record<string, unknown>[], modelId: string): false | ReasoningEfforts | undefined;
/** The input-modality declaration of one model in a route's models. Empty
 * mirrors undefined -- the resolved settings layer materializes absent arrays
 * as [] (schemastery), and llm-pi-ai's own declaredInput reads that as "no
 * answer here": an empty list must stay inheritable, never a phantom
 * text-only declaration. */
export declare function inputOf(models: Record<string, unknown>[], modelId: string): InputModalities | undefined;
/** The stored compat block of one model in a route's models (unvalidated passthrough). */
export declare function compatOf(models: Record<string, unknown>[], modelId: string): CompatSuggestion | undefined;
/** The display name of one model in a route's models. */
export declare function nameOf(models: Record<string, unknown>[], modelId: string): string | undefined;
/**
 * The stored per-model default-effort pick of one model in a route's models,
 * or undefined when the user has not picked one. A non-string value degrades
 * to undefined: the field is plugin-owned, and a hostile or stale document
 * must degrade to "no default", never poison the memory chain.
 */
export declare function defaultEffortOf(models: Record<string, unknown>[], modelId: string): string | undefined;
/**
 * Build the write seam over a settings Remote face.
 * @param api - the settings Remote methods.
 * @param describe - how to obtain the pi-ai namespace join (injectable for tests).
 * @param stage - sink for declarations staged against a route that is not
 * saved yet; the injector owns the store and flushes it once the route exists.
 */
export declare function createEditorApi(api: RemoteApi, describe?: () => Promise<SettingsJoin>, stage?: (route: string, modelId: string, efforts: EffortWriteIntent, compat?: CompatSuggestion, input?: InputModalities | null, defaultEffort?: string | null) => void, 
/**
 * Present only on a seam an ON-SCREEN editor drives: while the official card
 * is open its own frozen revision baseline makes any write here break the
 * user's next save in that card, so the seam queues the full intent instead
 * of committing it. The injector replays it once the card is gone.
 */
hold?: (route: string, modelId: string, write: HeldWrite) => void, 
/**
 * Present only on the editor's own seam: forget everything this row reported.
 * The editor's Reset calls it, because the ledger it wrote to outlives the
 * React state — without this a Reset followed by the official Save would
 * still write the discarded edits.
 */
withdraw?: (route: string, modelId: string) => void, 
/**
 * Whether this row's route is still unsaved (the create card's draft route,
 * or a typed-but-unsaved row). The injector knows this per row, so it is told
 * rather than re-derived here: deriving it would cost a wire describe on
 * every keystroke the editor reports.
 */
stagedOf?: () => boolean): EffortEditorApi;
/**
 * One row's intent inside a batch write. `touch` distinguishes "this edit never
 * carried the ladder" (leave it alone) from "unset it durably"; a modality
 * `undefined` likewise leaves the stored declaration untouched.
 */
export interface RowIntent {
    modelId: string;
    /** The ladder part; 'keep' means this edit never carried it. */
    efforts: EffortWriteIntent;
    compat?: CompatSuggestion;
    input?: InputIntent;
    clearCompatKeys?: readonly string[];
    defaultEffort?: DefaultEffortIntent;
}
/** The outcome of one batch write, as the caller's ledgers need it. */
export interface RowWriteResult {
    ok: boolean;
    /**
     * True when the failure is "this row is not (or no longer) in the document":
     * the caller drops the intent instead of retrying it forever.
     */
    modelNotFound?: boolean;
    /**
     * True when the write was abandoned before reaching the wire because an
     * official card opened during the read. Not a failure: the caller keeps the
     * intent and does not back off.
     */
    aborted?: boolean;
    /** The refusal message, when `ok` is false and it is a real failure. */
    error?: string;
}
/**
 * Apply every row of ONE route in a single rebuild + single mutate.
 *
 * This is the write path's core: `writeEfforts` is the one-row case of it, and
 * the injector's ledgers call it with every row they hold for that route. One
 * describe and one `mutate` per route rather than per row -- the official
 * document is a whole-array set, so batching costs no extra semantics.
 *
 * Failing rows are the caller's business: this returns one result per row, all
 * derived from the same response, so a route that refuses keeps every one of
 * its intents for the next pass (never a partial landing).
 * @param api - the settings Remote.
 * @param route - the provider route whose models array to rebuild.
 * @param rows - the intents to apply, in order.
 * @param describe - the read seam; a conflict retry forces the wire read.
 * @param abort - checked after the read and before the mutate: an official
 * card may have opened while we were reading, and writing then would land
 * behind that card's frozen revision baseline (issue #7). An aborted write
 * returns `{ ok: false, aborted: true }` for every row and consumes nothing.
 * @returns one result per row, in the same order.
 */
export declare function writeModelRows(api: RemoteApi, route: string, rows: readonly RowIntent[], describe?: () => Promise<SettingsJoin>, abort?: () => boolean): Promise<RowWriteResult[]>;
/** One result of writing a provider's request headers. */
export type ProviderHeadersReply = {
    ok: true;
} | {
    ok: false;
    error: string;
};
/**
 * The RAW layer's `headers` dict for one route, as the editor seeds its draft.
 *
 * Reads through {@link baselineModelsOf}'s rule (the user section when it
 * declares one, else the composition base) for the same reason: the resolved
 * `value` materializes schema defaults, and a draft seeded from it would write
 * those defaults back on the first save. The run of the layers is "what the
 * user sees is what the user edits", which is the inheritance the official
 * ProviderEditor applies to its own fields.
 * @param namespace - the namespace view carrying the layers.
 * @param route - the provider route key.
 * @returns the stored header pairs, or undefined when no layer declares any.
 */
export declare function providerHeadersOf(namespace: SettingsNamespaceView | undefined, route: string): Record<string, string> | undefined;
/**
 * Write ONE route's request headers through the live settings seam.
 *
 * A whole-dict `set` on `providers.<route>.headers`, so a brother field of the
 * profile (`baseURL`, `apiKeyEnv`, `models`, `compat`…) is never restated and
 * cannot be lost to this write. The settings layer's path write merges into the
 * existing profile, which is why the write does not have to read the profile
 * back and rebuild it the way the models-array write must.
 *
 * The conflict discipline mirrors {@link writeModelRows}: one retry, re-read
 * fresh. A concurrent writer (the official card's own Save, another tab) moving
 * the namespace between the describe and the mutate is a race the user's edit
 * must survive, so the second attempt fences on the NEW revision instead of
 * failing.
 * @param api - the settings Remote (plus the optional scope).
 * @param route - the provider route key.
 * @param headers - the complete header dict to store (`{}` = send none).
 * @returns whether the write landed, and the refusal text when it did not.
 */
export declare function writeProviderHeaders(api: RemoteApi, route: string, headers: Record<string, string>): Promise<ProviderHeadersReply>;
/**
 * Describe the pi-ai namespace plus writability.
 *
 * Prefers the official settings scope's snapshot when the shell provides one:
 * the shared describe mirror already carries this namespace's resolved section
 * together with its RAW layers (user / base) and the revision the settings
 * surface itself fences writes with, so a scan costs no wire round trip.
 * `fresh: true` skips the snapshot and reads the wire -- what a conflict retry
 * needs, because the mirror folds a fresh view in asynchronously and would
 * otherwise hand back the very revision the write just failed against.
 * @param api - the settings Remote (plus the optional scope).
 * @param options - `fresh` forces the wire read.
 */
export declare function describeNamespace(api: RemoteApi, options?: {
    fresh?: boolean;
}): Promise<SettingsJoin>;
