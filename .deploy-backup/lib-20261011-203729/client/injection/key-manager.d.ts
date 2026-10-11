/**
 * The key list's seat: the official key field grows a plugin-owned host, and the
 * list is rendered inline into it, directly under the input.
 *
 * The field is not reachable from the settings page's React tree — the plugin
 * only gets keyed slots, and none of them sits beside a form field — so the seat
 * is a DOM leaf inserted directly AFTER the field. The list then falls under the
 * input, which is where a provider's keys belong: the label above already says
 * "API key", and the list reads as part of the field rather than as a surface
 * that has to be opened, positioned and dismissed.
 *
 * A sibling rather than a last child: the reveal eye hangs on the field's own
 * bottom edge (`bottom: 0` against the field, which its validation-message rule
 * also measures from), so a list inside the field would carry the eye down with
 * it and leave it sitting on the list's last row. React tolerates the foreign
 * sibling — it resolves a node's next sibling by walking past nodes it does not
 * own — and the list mirrors the field's region, so a pane hides it along with
 * the field it belongs to.
 *
 * The host carries the route its list was built for — that attribute is how the
 * pass knows whether the mounted list still belongs to the field it follows, and
 * how a test asks what is mounted there.
 *
 * The whole seat is skipped when the field is not a key field, or when its card
 * announces no route: the add-provider form has no route yet, and keys belong to
 * a route that exists.
 *
 * @module dsh-model-think-level/client/injection/key-manager
 */
import type { KeyManagerClient } from '../key-manager-client.js';
/** Set on a field whose keys the plugin lists. */
export declare const KEY_MANAGED_CLASS = "bre-key-managed";
/** The repo's inline translator shape. */
export type Translator = (key: string, params?: Record<string, string | number>) => string;
/** What a reconcile tells the field's key list. */
export interface KeyManagerFieldDeps {
    /** Copy for the list and its form. */
    readonly t: Translator;
    /** The provider route this card edits; absent on the add-provider form. */
    readonly route?: string | undefined;
    /** List transport; injectable for tests. */
    readonly client?: KeyManagerClient | undefined;
}
/**
 * Mount the key list into a field, replacing whatever this module mounted there
 * before. Idempotent: a field whose list is already up and current is left
 * exactly as it is, so a settled page sees no write at all.
 */
export declare function enhanceKeyManagerField(field: HTMLElement, deps: KeyManagerFieldDeps): void;
/**
 * Drop the list of one field, leaving the official field exactly as the page
 * rendered it. Called when the takeover ends, and for the stray sweep of a page
 * that is being torn down.
 */
export declare function resetKeyManagerField(field: HTMLElement): void;
/** Drop every list this module mounted. */
export declare function teardownKeyManager(): void;
/**
 * The route a field's list was built for, or undefined when it has none.
 *
 * A test hook: the route lives on the host, so what the pass decided can be read
 * back from the DOM alone.
 */
export declare function keyManagerRoute(field: HTMLElement): string | undefined;
