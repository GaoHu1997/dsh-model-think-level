/**
 * The eye on a provider's API-key field.
 *
 * Two jobs, one control. The official input is `<input type="password">` whose
 * value is React's own draft state (`keyDraft`), and a SAVED key is never part
 * of it: a configured provider shows a placeholder instead, because the harness
 * keeps provider keys write-only (the settings document carries only the
 * profile's `apiKeyEnv` reference, and the credential service reports
 * `{ configured }` — never the value). So on a settled card the eye has nothing
 * to unmask, and the plugin asks its own host for the stored value
 * ({@link loadProviderKey}, the `PROVIDER_KEY_PATH` route) when — and only
 * when — the user clicks it with an empty field. A field holding a draft the
 * user just typed is never touched: the fetch is skipped and the click only
 * swaps the mask.
 *
 * The read is deliberately constrained:
 *
 *   - it happens on an explicit click, never on render, and answers `undefined`
 *     for every failure (no route, refused fence, reference-free profile,
 *     unconfigured credential), which leaves the field masked;
 *   - it is never cached (the request says `no-store` and the route answers
 *     with the same header) and never logged;
 *   - hiding the field again takes the borrowed value back out — the draft
 *     returns to empty, which the official form reads as "keep the stored key",
 *     so revealing can never overwrite the credential by accident. A value the
 *     user edits after revealing is theirs, and is left alone.
 *
 * The button is the one node this plugin inserts into official DOM, and it is
 * inserted deliberately: the affordance only reads as an eye at the END of the
 * input if it sits inside the input's own box, and the official field has no
 * wrapper to hang it on. The trade is contained —
 *
 *   - the field itself is never restructured, and nothing official is moved or
 *     removed: the button is an absolutely positioned LEAF appended last;
 *   - React ignores trailing foreign children when it reconciles the field's
 *     known children, so the node survives every re-render (each keystroke
 *     re-renders this field);
 *   - React never writes the input's `type` back (its props do not change), so
 *     the revealed state survives too;
 *   - the pass removes the button, the marker and the class on cleanup, and
 *     restores the mask, so a withdrawn takeover leaves nothing behind.
 *
 * @module dsh-model-think-level/client/injection/key-reveal
 */
/** Set on the field that carries the key input. */
export declare const KEY_FIELD_CLASS = "bre-key-field";
/** The eye button inside that field. */
export declare const KEY_EYE_CLASS = "bre-key-eye";
/** The repo's inline translator shape (see `HeadersEditor`, `ComposerSlider`). */
export type Translator = (key: string, params?: Record<string, string | number>) => string;
/** What a reconcile tells the field's eye. */
export interface KeyRevealDeps {
    /** Copy for the button's labels and its failure tooltip. */
    readonly t: Translator;
    /**
     * The provider route this card edits, when the card announces one. Absent on
     * the add-provider form (no route exists yet), which is what keeps the eye
     * there a plain mask toggle.
     */
    readonly route?: string | undefined;
    /** How to resolve the stored credential; injectable for tests. */
    readonly loadKey?: ((route: string) => Promise<string | undefined>) | undefined;
}
/**
 * Give an editor field an eye at the end of its input, if it holds the API key.
 *
 * Runs on every reconcile of the card, so it only ever writes what differs; a
 * field with no key input is handed to {@link resetKeyField} instead, which is
 * how a takeover that has moved on (a provider whose key field is gone) drops
 * the affordance it no longer needs.
 */
export declare function revealKeyField(field: HTMLElement, deps: KeyRevealDeps): void;
/** Undo {@link revealKeyField}: drop the button, the class, the marker, and
 * re-mask the input, leaving the official field exactly as it was rendered. */
export declare function resetKeyField(field: HTMLElement): void;
/**
 * Ask the host for the credential a provider profile names.
 *
 * Fails closed by design: every refusal — an unknown route, a profile with no
 * reference, a credential that is not configured, a refused trust fence, a
 * network error — is `undefined`, and the caller leaves the field masked rather
 * than uncovering an empty box.
 */
export declare function loadProviderKey(route: string): Promise<string | undefined>;
