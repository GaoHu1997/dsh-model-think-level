/**
 * The providers the user switched OFF on the Models settings page.
 *
 * The stored value is the DISABLED set, not the enabled one, so an empty — or
 * absent — preference means "everything is on". That direction matters for more
 * than brevity: a route that appears AFTER this preference was written is
 * enabled by default, instead of being hidden by an omission nobody made.
 *
 * The composer's Model switcher reads it to leave those providers out of its
 * provider column; the settings page reads it to draw each row's switch.
 *
 * @module dsh-model-think-level/client/provider-enabled
 */
/** Where the disabled provider ids live. */
export declare const PROVIDER_DISABLED_KEY = "dsh-model-think-level.providers.disabled";
/**
 * Parse a stored value. The shape is the provider order's — a deduped list of
 * non-empty ids — so the one parser serves both.
 */
export declare function parseDisabledProviders(raw: string | null): readonly string[];
/** The disabled provider ids. */
export declare function disabledProviders(): readonly string[];
/** Whether one provider is switched on — the default for anything unnamed. */
export declare function isProviderEnabled(id: string): boolean;
/** Switch one provider on or off, and persist the new set. */
export declare function setProviderEnabled(id: string, enabled: boolean): void;
/** Apply an external (cross-tab) value without writing it back. */
export declare function syncDisabledProviders(next: readonly string[]): void;
/** Listen for a switch, from this tab or another; returns the unsubscribe. */
export declare function subscribeDisabledProviders(listener: () => void): () => void;
