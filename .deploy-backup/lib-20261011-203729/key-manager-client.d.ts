/**
 * The browser half's client for the host's API-key manager.
 *
 * Every key fact — which references a provider lists, which label each carries,
 * which one is in use, and whether the credential store actually holds a value
 * — is host state: the list is the plugin's own index file, the value lives in
 * the credential store, and the "in use" seat is the profile's `apiKeyEnv`
 * field. All six operations therefore ride ONE same-origin route
 * ({@link KEY_INDEX_PATH}), and the browser half only ever handles references,
 * labels, booleans and masked previews. It never sees a secret it did not
 * explicitly ask for: a key value is fetched one reference at a time through the
 * existing reveal route, on a click, and is never cached.
 *
 * Fails closed. A refused fence, a route that is not in the settings document,
 * a store that cannot be written, a network error — each answers `{ ok: false }`
 * (with the host's own wording when it sent one) and the panel says so; nothing
 * here invents success, and nothing here invents an error message either.
 *
 * @module dsh-model-think-level/client/key-manager-client
 */
/** One key row as the host reports it. */
export interface KeyRow {
    /** Credential reference holding the value. */
    readonly ref: string;
    /** Stored label; absent means "show the reference itself". */
    readonly alias?: string;
    /** Whether this is the reference the profile currently names. */
    readonly enabled: boolean;
    /** Whether the credential store holds a value; null when it could not say. */
    readonly configured: boolean | null;
    /**
     * The stored value in the host's display form — a head, an ellipsis and a
     * tail. Absent when the store would not let the value be read, so a row shows
     * nothing rather than a made-up preview.
     */
    readonly masked?: string;
}
/** A successful answer: the whole list, in the host's order. */
export interface KeyState {
    readonly ok: true;
    readonly route: string;
    /** The reference in use, or null when the provider names none. */
    readonly enabledRef: string | null;
    readonly entries: readonly KeyRow[];
}
/** A refused answer, carrying the host's own words when it sent any. */
export interface KeyFailure {
    readonly ok: false;
    readonly error?: string;
}
/** What one call to the key route answers. */
export type KeyAnswer = KeyState | KeyFailure;
/** The manager's transport, injectable so the panel can be tested without one. */
export interface KeyManagerClient {
    /** Read the provider's whole key list. */
    list(route: string): Promise<KeyAnswer>;
    /** Store a new key and list it, returning the list it produced. */
    add(route: string, value: string, alias: string | undefined): Promise<KeyAnswer>;
    /** Make one listed reference the key in use. */
    enable(route: string, ref: string): Promise<KeyAnswer>;
    /** Relabel one listed reference (undefined clears the label). */
    rename(route: string, ref: string, alias: string | undefined): Promise<KeyAnswer>;
    /** Replace the stored secret of one listed reference, keeping its name. */
    replace(route: string, ref: string, value: string): Promise<KeyAnswer>;
    /** Forget one listed reference and its value. */
    remove(route: string, ref: string): Promise<KeyAnswer>;
    /** The stored value of one listed reference, or undefined. */
    reveal(route: string, ref: string): Promise<string | undefined>;
}
/** The live client: same-origin fetch against the host's route. */
export declare const httpKeyManagerClient: KeyManagerClient;
