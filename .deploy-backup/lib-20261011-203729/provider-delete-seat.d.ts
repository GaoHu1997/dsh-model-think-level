/**
 * The reserved delete seat on a provider row of the official Models page.
 *
 * The official row renders its destructive button only for a provider the host
 * still considers removable (`row.removable`); a built-in provider such as
 * deepseek renders nothing there at all. The action group is `margin-left: auto`,
 * so the rows that keep the button are wider than the rows that do not and the
 * whole column of buttons lines up raggedly against the card's right edge.
 *
 * The seat is therefore kept warm: a row the host left without a delete button
 * gets a disabled one of the same metrics, which is enough for every row's
 * actions to start at the same place. It is `disabled`, so it takes no click,
 * no focus and no keyboard activation — the button is the alignment, not an
 * action — and it still owns its gesture as far as the drag engine is concerned,
 * because that engine refuses a drag beginning on any `button`.
 *
 * Its word is the host's own: the label is read off a delete button the page
 * still renders, so the odd row out is not the one row written in another
 * language. A page that renders none at all (every provider built in) falls back
 * to this plugin's dictionary.
 *
 * @module dsh-model-think-level/client/injection/provider-delete-seat
 */
import type { HostLabels } from './models-page-editor.js';
export interface ProviderDeleteDeps {
    /** The plugin's own translator, for the tooltip and the fallback label. */
    t: (key: string, params?: Record<string, string | number>) => string;
    /** The official `settings.models` label sets, resolved fresh on every scan. */
    labels: () => HostLabels;
}
/**
 * Give every provider row the delete seat the host left out. Idempotent: a row
 * that already has one is only relabelled, and a row whose provider became
 * removable hands the seat back to the host's own button.
 */
export declare function reconcileProviderDeleteSeat(root: HTMLElement, deps: ProviderDeleteDeps): void;
/** Take every seat out again (plugin dispose, HMR teardown). */
export declare function teardownProviderDeleteSeats(): void;
