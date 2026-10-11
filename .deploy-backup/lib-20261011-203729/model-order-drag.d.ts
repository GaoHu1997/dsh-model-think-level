/**
 * Model-row drag reordering inside one provider's editor on the official Models
 * settings page.
 *
 * The official editor renders a provider's models as
 * `div.modelList > div.modelEntry > div.modelRow` (a four-column grid: id,
 * display name, and two icon buttons), straight from
 * `models.map((model, index) => …)`. React owns those children, so — exactly as
 * for the provider rows — a model is moved with a CSS `order`, and the id
 * sequence that results is stored per provider by `../model-order.js`.
 *
 * Two differences from the provider list, and both are in the adapter:
 *   - the row is a grid of INPUTS, so only the grip drags. A drag that began on
 *     the row body has to stay a text selection, which is why `seatDrags` is
 *     false here and true for a provider header;
 *   - the model list lives inside the provider's own `li.rowCard`, so the
 *     provider id — and with it which stored sequence to read and to write — is
 *     recovered from the enclosing row on every call rather than captured, and
 *     a list whose provider cannot be named is left completely alone.
 *
 * A model's id is the value of its own "Model ID" input, not its position: the
 * official `aria-label`s carry `position` (`Model ID 1`), and a reorder that
 * renumbered them would rename every field on the page. A row whose id input is
 * still blank (a model just added, not yet named) gets no grip and is never
 * moved.
 *
 * @module dsh-model-think-level/client/injection/model-order-drag
 */
import type { DragState } from './row-drag.js';
import { type HostLabels } from './models-page-editor.js';
/** Per-scan bookkeeping (one instance lives in `models-page.ts`). */
export type ModelOrderState = DragState;
export interface ModelOrderDeps {
    /** The plugin's own translator, for the grip's label and tooltip. */
    t: (key: string, params?: Record<string, string | number>) => string;
    /** The official `settings.models` label sets, resolved fresh on every scan. */
    labels: () => HostLabels;
}
export declare function createModelOrderState(): ModelOrderState;
/**
 * Every model list under `root`.
 *
 * Probed by class-name fragment, like the official anchors elsewhere: the
 * bundle's names are CSS-module hashes. The fragment alone is too loose —
 * `modelListHead` and any future sibling share it — so a hit only counts when
 * its DIRECT children are the model entries, which is what the official
 * `.modelList { display: flex; flex-direction: column; gap: 8px }` lays out.
 */
export declare function modelListsOf(root: HTMLElement): HTMLElement[];
/**
 * Whether a mutation burst added or removed model ROWS.
 *
 * The official editor keys its model rows by ARRAY INDEX (`models.map((model,
 * index) => <ModelRow ... />, index)`), so deleting one model commits as the
 * LAST row element leaving the list and every row after the deleted one
 * swapping its contents INSIDE its existing element. Those elements keep the
 * CSS `order` this module wrote for the model that moved out of them: the
 * list paints its tail shifted into the wrong slots, and re-sorts itself
 * when the debounced scan finally corrects the order a frame or more later —
 * the "delete one model and the whole list flashes" report. The observer
 * answers that burst with an order pass in its own microtask, before the
 * first painted frame; the same reasoning that made the tab pass synchronous.
 */
export declare function modelListMutation(records: readonly MutationRecord[]): boolean;
/**
 * One pass over the page: name every model row in every provider editor, mount a
 * grip in its grid, and place the rows in the order the user stored for that
 * provider.
 *
 * A provider whose id cannot be recovered is skipped whole — reading a sequence
 * that might belong to another provider, or writing one there, is worse than
 * leaving that editor without grips for a scan.
 */
export declare function reconcileModelOrder(root: HTMLElement, deps: ModelOrderDeps, state: ModelOrderState): void;
/**
 * Undo everything this module put on the page. A plugin disable or an HMR
 * replace unmounts React trees on its own, but the grips, the widened grids and
 * the stamps are raw DOM: left behind, a grip would keep reordering rows — and
 * persisting that order — on behalf of a fiber that no longer exists.
 */
export declare function teardownModelOrder(state: ModelOrderState): void;
