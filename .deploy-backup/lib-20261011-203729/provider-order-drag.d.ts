/**
 * Provider-row drag reordering for the official Models settings page.
 *
 * The official section renders one `<li>` per provider inside a `<ul>` that is
 * already a flex column, and React owns those children — so rows are never
 * moved in the DOM. Each row is given a CSS `order` instead, which reorders the
 * screen without touching React's child list, and the resulting id sequence is
 * stored by `../provider-order.js` for the composer model switcher to read.
 *
 * The interaction itself — the grip, the drag session, the insertion line, the
 * FLIP slide, the edge auto-scroll — lives in `./row-drag.js`, which the model
 * rows inside a provider use too. This module is the provider list's adapter
 * onto it: it names each row (the plugin's `data-bre-provider` stamp, or the
 * official Edit button's label parsed back through `editProvider`), mounts the
 * grip in the row's own header (`[class*="rowHead"]`), and lets the WHOLE header
 * drag — a 18px grip is a poor thing to have to hit. The card's own buttons keep
 * their behaviour, because the engine cancels a drag that begins on one, and
 * everything the page renders below the header is untouched.
 *
 * @module dsh-model-think-level/client/injection/provider-order-drag
 */
import type { HostLabels } from './models-page-editor.js';
import type { DragState } from './row-drag.js';
export { dropIndex, dropLineTop, edgeScrollStep, makeGhost, nearestRow, placeRows, rowElements, scrollHostOf, visualRows, } from './row-drag.js';
/** Per-scan bookkeeping (one instance lives in `models-page.ts`). */
export type ProviderOrderState = DragState;
export interface ProviderOrderDeps {
    /** The plugin's own translator, for the grip's label and tooltip. */
    t: (key: string, params?: Record<string, string | number>) => string;
    /** The official `settings.models` label sets, resolved fresh on every scan. */
    labels: () => HostLabels;
}
export declare function createProviderOrderState(): ProviderOrderState;
/**
 * The official provider-row list: the `<ul>` that holds the row cards. Probed by
 * class-name fragment because the page's class names are CSS-module hashes
 * (`_3nPmjq_rows` today, something else tomorrow).
 */
export declare function rowsListOf(root: HTMLElement): HTMLElement | undefined;
/**
 * The row's own header — the seat the grip is mounted into, and the drag source.
 * Exported because the enable switch mounts into the same seat and must agree
 * with this module about where that seat is.
 */
export declare function rowHeadOf(row: HTMLElement): HTMLElement | undefined;
/**
 * The row's displayed provider name, for the grip's label, the drag chip and
 * the switch's label.
 */
export declare function rowNameOf(row: HTMLElement): string | undefined;
/**
 * Recover the provider id from an official `providerTargetLabel`: `Name (route)`
 * — the form used whenever the display name differs from the route — or the
 * bare route when the two are equal. The id is the LAST parenthesized group, so
 * a display name that itself carries parentheses still splits correctly.
 */
export declare function idFromTargetLabel(label: string): string | undefined;
/**
 * The provider id of one row: the stamp our own slot carries when the row has
 * one (every llm-pi-ai row does), else the official Edit button's aria-label
 * parsed back through the localized `editProvider` template.
 */
export declare function providerIdOfRow(row: HTMLElement, labels: HostLabels): string | undefined;
/** The stamped ids of the rows that have one, in the order they screen. */
export declare function orderedRowIds(list: HTMLElement): string[];
/** Place the rows in the stored order; rows we could not name are left alone. */
export declare function applyRowOrder(list: HTMLElement, ids: readonly string[]): void;
/**
 * One pass over the document: name every provider row, mount a grip in each
 * row's header, make that header a drag source, and place the rows in the order
 * the preference asks for.
 *
 * Runs on every scan (the official editor's own pass bails out when no card is
 * open, so this cannot ride along with it) and is idempotent by DOM presence —
 * the same guard the editor injector uses, which keeps the insertion from
 * re-triggering the scan that found it.
 */
export declare function reconcileProviderOrder(root: HTMLElement, deps: ProviderOrderDeps, state: ProviderOrderState): void;
/**
 * Undo everything this module put on the official page. A plugin disable or an
 * HMR replace unmounts React trees on its own, but the grips, the draggable
 * headers and the insertion line are raw DOM with listeners attached to
 * themselves — left behind they would keep reordering the rows (and persisting
 * that order) on behalf of a fiber that no longer exists.
 */
export declare function teardownProviderOrder(state: ProviderOrderState): void;
