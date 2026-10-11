/**
 * The API-key list: one provider's keys, which one is in use, and the one
 * inline form that adds, relabels or replaces a key.
 *
 * Rendered inline under the official key field (see `injection/key-manager`),
 * not as a floating panel: the field's label already says "API key", so its list
 * belongs directly beneath it, inside the card that owns the profile — the list
 * reads as part of the field rather than as a surface that has to be opened,
 * positioned and dismissed.
 *
 * The list is a view over host state and holds no truth of its own — every
 * mutation answers with the whole list, and the list is adopted as it arrives
 * (`adopt`), so the GUI can never drift from what the settings document and the
 * credential store actually say. Three facts it deliberately reflects:
 *
 *   - **the key in use is the profile's reference.** Choosing a row writes
 *     `providers.<route>.apiKeyEnv`, so it holds for every request the route
 *     makes, not only the ones this GUI starts. Exactly one key is in use per
 *     provider, which is why the mark at the head of a row is a radio.
 *   - **a value is shown masked, or not at all.** The host reads the stored
 *     secret and answers a head-and-tail preview; the middle never leaves it,
 *     and the eye beside the field stays the one gesture that reveals a value.
 *   - **one form serves all three edits.** Adding, relabelling and replacing a
 *     value differ only in which fields it shows, so they share a form rendered
 *     as the row below the row they act on — for an add, the list's last row.
 *
 * @module dsh-model-think-level/client/KeyManager
 */
import type { ReactNode } from 'react';
import { type KeyManagerClient } from './key-manager-client.js';
/** The repo's inline translator shape. */
type Translate = (key: string, params?: Record<string, string | number>) => string;
/** Props of {@link KeyManager}. */
export interface KeyManagerProps {
    /** The provider route whose keys this list manages. */
    readonly route: string;
    /** Copy for the list's labels. */
    readonly t: Translate;
    /** Transport; injectable for tests. */
    readonly client?: KeyManagerClient | undefined;
}
/**
 * Render the key list for one provider route.
 * @param props - see {@link KeyManagerProps}.
 * @returns the list's root element.
 */
export declare function KeyManager(props: KeyManagerProps): ReactNode;
export {};
