/**
 * The knowledge-base auto-fill: build the settings patch that declares
 * `reasoningEfforts` -- and, unless declined, the input-modality declaration --
 * on every undeclared model of a providers dict.
 *
 * Shared by BOTH halves on purpose. The host builds its boot fill with it, and
 * the browser half builds the very same patch from its own read, so one
 * suggestion can never produce two different documents. Pure data logic: no
 * harness package, no node or DOM API.
 *
 * @module dsh-model-think-level/autofill
 */
/** A JSON object patch. */
type JsonObject = Record<string, unknown>;
/**
 * Build a patch that adds reasoningEfforts -- and, unless declined, the
 * input-modality declaration -- to every undeclared model of the given
 * routes, from the knowledge base / protocol inference. Returns the partial
 * providers patch, or undefined when nothing needs filling.
 * @param providers - the resolved providers dict.
 * @param routeFilter - optional route filter (defaults to all routes).
 * @param options - fill switches; both default on.
 * @param revision - settings revision this read is based on; recorded as the
 *   provenance marker of every ladder filled here (see {@link AUTOFILL_MARKER}).
 */
export declare function buildAutofillPatch(providers: unknown, routeFilter?: (route: string) => boolean, options?: {
    efforts?: boolean;
    modalities?: boolean;
}, revision?: number): JsonObject | undefined;
/** Strip newer-only compat keys from an autofill patch (older-kernel downgrade). */
export declare function stripNewCompatKeysDeep(patch: JsonObject): JsonObject | undefined;
export {};
