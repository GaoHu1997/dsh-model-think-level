/**
 * The running auto-fill complement (issue #7).
 *
 * The host fills once at boot. Everything a session adds afterwards is filled
 * HERE, on the idle pass: that is the only moment no official card is holding a
 * revision baseline a write would invalidate.
 *
 * @module dsh-model-think-level/client/injection/autofill-run
 */
import type { RemoteApi } from '../types.js';
/** What the complement needs from its host. */
export interface IdleAutofillDeps {
    /** The settings remote. */
    api: RemoteApi;
}
/** The complement's face. */
export interface IdleAutofill {
    /** Run the complement; fire-and-forget on the injector's idle pass. */
    run: () => void;
}
/**
 * Build the auto-fill complement.
 * @param deps - the settings remote.
 * @returns the complement's {@link IdleAutofill} face.
 */
export declare function createIdleAutofill(deps: IdleAutofillDeps): IdleAutofill;
