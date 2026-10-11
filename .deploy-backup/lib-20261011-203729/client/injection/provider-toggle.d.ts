/**
 * Per-provider enable switch for the official Models settings page.
 *
 * A provider that is switched off stays listed — that is the only place it can
 * be switched back on — but leaves the composer's provider column, which reads
 * the same store (`../provider-enabled.js`). The stored value is the set of
 * DISABLED ids, so an unknown or newly added route is enabled by default.
 *
 * The switch is a `role="switch"` button appended to the row's action group (or
 * to the header when the official row has no action group), which leaves the
 * header's own flex layout — identity on one side, actions on the other — with
 * the same children it had. `role="switch"` is already in the drag module's list
 * of controls that own their gesture, so a drag started on the switch is refused
 * and the click can only mean "toggle".
 *
 * Nothing here waits for the next scan to look right: the debounced scan is
 * 120ms away, and a switch whose knob only moves a beat later reads as a missed
 * click — so the click paints the new state itself.
 *
 * @module dsh-model-think-level/client/injection/provider-toggle
 */
import type { HostLabels } from './models-page-editor.js';
/** Per-scan bookkeeping (one instance lives in `models-page.ts`). */
export interface ProviderToggleState {
    /** Switches that already carry their click listener. */
    readonly switches: WeakSet<Element>;
}
export interface ProviderToggleDeps {
    /** The plugin's own translator, for the switch's label and tooltip. */
    t: (key: string, params?: Record<string, string | number>) => string;
    /** The official `settings.models` label sets, resolved fresh on every scan. */
    labels: () => HostLabels;
}
export declare function createProviderToggleState(): ProviderToggleState;
/**
 * Visit every provider row and make sure it shows a switch carrying its own
 * state. Idempotent: a row that already has one is only relabelled, which is
 * also how a language switch and an external toggle reach the page.
 */
export declare function reconcileProviderEnabled(root: HTMLElement, deps: ProviderToggleDeps, state: ProviderToggleState): void;
/** Remove every switch and every dimmed row. */
export declare function teardownProviderEnabled(): void;
