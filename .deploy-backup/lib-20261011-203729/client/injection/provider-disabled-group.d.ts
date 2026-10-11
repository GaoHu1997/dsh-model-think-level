/**
 * The folded group of switched-off providers on the official Models page.
 *
 * A switched-off provider is not deleted: its row is the only place it can be
 * switched back on, and its configuration is still the user's. It does not
 * belong in the list the user reads either — a page whose built-in providers all
 * stay in the way makes the two or three real ones hard to find. So the rows of
 * the switched-off providers fold away, and one control at the end of the list
 * says how many are folded and unfolds them again.
 *
 * The rows are never moved or rebuilt: this pass only toggles a class on them
 * (`display: none`), so the official React tree — and the drag pass's own slots,
 * which are read back out of the DOM — stay exactly where the host put them. The
 * control is placed against the list, as a list-level action rather than one more
 * card, and both the class writes and the insertion are guarded on the state they
 * would produce: a scan that changes nothing writes nothing, because every write
 * here would otherwise feed the observer that scheduled the scan.
 *
 * The folded state is per session and deliberately not stored. The point of the
 * group is that the switched-off providers are out of the way, and a reload
 * showing them folded again is the behaviour that was asked for.
 *
 * @module dsh-model-think-level/client/injection/provider-disabled-group
 */
import type { HostLabels } from './models-page-editor.js';
/** Per-scan bookkeeping (one instance lives in `models-page.ts`). */
export interface ProviderDisabledGroupState {
    /** Whether the folded rows are currently unfolded. */
    expanded: boolean;
}
export interface ProviderDisabledGroupDeps {
    /** The plugin's own translator, for the control's label and tooltip. */
    t: (key: string, params?: Record<string, string | number>) => string;
    /** The official `settings.models` label sets, resolved fresh on every scan. */
    labels: () => HostLabels;
}
export declare function createProviderDisabledGroupState(): ProviderDisabledGroupState;
/**
 * Fold the switched-off providers away — or put them back when the control says
 * so — and keep the control's own label, count and position in step.
 *
 * Idempotent: a row already folded stays folded, and the control is only ever
 * written when a value genuinely changed, so a scan never mutates the page on
 * behalf of a state that is already on it.
 */
export declare function reconcileProviderDisabledGroup(root: HTMLElement, deps: ProviderDisabledGroupDeps, state: ProviderDisabledGroupState): void;
/** Remove the control and unfold every row it hid. */
export declare function teardownProviderDisabledGroup(): void;
