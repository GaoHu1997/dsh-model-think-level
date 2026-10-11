/**
 * The "adapt every model of this provider" seat, beside the official
 * fetch-models link (user request ⑤).
 *
 * The official catalogue head carries exactly one control — the link that
 * fetches the provider's model list — so a provider with twenty models makes
 * the user open twenty rows and click 自动适配 in each. The seat stands next to
 * that link and asks every model of the provider to adapt at once.
 *
 * It is raw DOM inside the host's own head for the same reason the provider
 * delete seat is: the plugin owns no slot there. It never moves a React-owned
 * node — it only inserts itself as the anchor's next sibling and re-inserts
 * itself when a re-render drops it — and every write is compare-before-write,
 * so a settled pass emits no mutation of its own.
 *
 * The click does not write anything itself: it publishes a request on the
 * document (see `../auto-effort.js`), which the per-model editors answer for
 * their own rows, and hands the route to `deps.onRequest`, which answers for
 * the models that have no editor on screen -- a collapsed row renders no
 * disclosure container, so nothing else on the page can serve it. The seat
 * therefore holds no write path of its own, and neither answer stages a
 * document the open card is already holding.
 *
 * What the click DID is reported in a bubble at the top of the window
 * ({@link showNote}), never by rewriting the control: the head's button is the
 * host's layout, and a button whose label and enabledness change under the
 * pointer is a different control every time the user looks at it. The bubble
 * takes itself away again, because a verdict is feedback and not state.
 *
 * @module dsh-model-think-level/client/injection/auto-effort-seat
 */
import { type AutoAdaptReport } from '../auto-effort.js';
/** One card's catalogue, paired with the route that card edits. */
export interface AutoEffortSeatTarget {
    /** The card's catalogue section. */
    readonly catalogue: HTMLElement;
    /** The provider route the card edits. */
    readonly route: string;
}
/**
 * What a reporter may answer with: a report, a promise of one, or nothing at
 * all (a host that cannot say what it did). Both shapes are accepted because
 * the injector's pass is async while a test double is usually not.
 */
export type AutoAdaptAnswer = AutoAdaptReport | void | Promise<AutoAdaptReport | void>;
export interface AutoEffortSeatDeps {
    /** The plugin's own translator, for the label the seat carries. */
    t: (key: string, params?: Record<string, string | number>) => string;
    /**
     * Adapt every model of the route that has no on-screen editor, and REPORT
     * what the pass did: the injector owns the settings writes, so the seat can
     * only ask and then say the answer. Absent in tests that only care where the
     * seat is placed — without it the control keeps its idle label, because
     * there is no truthful verdict to show.
     */
    onRequest?: (route: string) => AutoAdaptAnswer;
}
/**
 * The catalogue CONTAINERS inside a scope: the outermost matches only.
 *
 * {@link CATALOG_PROBE} is a class-name SUBSTRING, and the official catalogue
 * renders three more elements whose class names carry it — the heading, the
 * title and the meta nested inside the section. Only the outermost match IS a
 * catalogue, so the container is defined structurally here instead of by a
 * second list of class names to keep in step: seating a control in one of the
 * other three drops a button inside the heading, and the official
 * column-flex text then collapses to a character per line (the
 * empty-catalogue layout break).
 *
 * The sweep in {@link reconcileAutoEffortSeats} deliberately asks the NEAREST
 * match instead: a seat a previous pass left inside the heading belongs to no
 * catalogue this pass names, so it comes out.
 */
export declare function cataloguesOf(scope: HTMLElement): HTMLElement[];
/**
 * Give every target's catalogue head an auto-adapt seat. Idempotent: a head
 * that already has one is only relabelled and re-seated, and a seat whose
 * catalogue this pass no longer names is taken out.
 */
export declare function reconcileAutoEffortSeats(root: HTMLElement, targets: readonly AutoEffortSeatTarget[], deps: AutoEffortSeatDeps): void;
/** Take every seat out again (plugin dispose, HMR teardown). */
export declare function teardownAutoEffortSeats(): void;
