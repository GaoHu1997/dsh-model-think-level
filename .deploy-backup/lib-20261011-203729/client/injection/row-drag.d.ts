/**
 * The drag engine behind both reorderable lists of the Models settings page:
 * the provider rows, and the model rows inside one provider's editor.
 *
 * Neither list is reordered in the DOM — React owns those children — so a row
 * is moved by writing a CSS `order` on it, which reorders the screen (both
 * lists are flex columns) without touching the child list React holds. The id
 * sequence that results is stored by whoever owns the list, through the
 * adapter's `commit`.
 *
 * What the pointer sees while dragging:
 *   - a chip carrying the row's name, instead of the browser's screenshot of
 *     whatever element was grabbed;
 *   - an insertion line between two rows — drawn as a fixed overlay on the
 *     body, never as a child of the list React owns;
 *   - rows that slide (a FLIP pass) instead of jumping;
 *   - the list scrolling on its own while the pointer rests near an edge.
 *
 * The two lists differ in exactly three ways, and all three live in the
 * adapter: where a row's grip is mounted, whether the whole seat drags or only
 * the grip (a model row is a grid of inputs — grabbing it must stay a text
 * selection), and how a row is named and the order stored.
 *
 * @module dsh-model-think-level/client/injection/row-drag
 */
/** One reorderable list, as the engine needs to see it. */
export interface DragAdapter {
    /** How an event target resolves to one of this list's rows, or nothing. */
    rowOf: (node: Element, list: HTMLElement) => HTMLElement | undefined;
    /** The row's stable id. A row that cannot be named is never moved or grabbed. */
    idOf: (row: HTMLElement) => string | undefined;
    /** The text the carried chip shows for a row. */
    labelOf: (row: HTMLElement) => string | undefined;
    /** The stored order applied to the ids now on screen. */
    order: (ids: readonly string[]) => readonly string[];
    /** Persist the order the rows screen in. */
    commit: (list: HTMLElement) => void;
    /** The element a row's grip is mounted into. */
    seatOf: (row: HTMLElement) => HTMLElement | undefined;
    /** Whether the whole seat drags (a provider header) or only the grip does. */
    readonly seatDrags: boolean;
    /** The grip's accessible name. */
    gripLabel: (row: HTMLElement, id: string) => string;
    /** The grip's tooltip. */
    gripHint: () => string;
    /** Extra per-row DOM work, once the row is known to be nameable. */
    decorate?: (row: HTMLElement, seat: HTMLElement) => void;
}
/** The row a drag is currently carrying, plus everything an abandoned drag needs. */
export interface DragSession {
    readonly row: HTMLElement;
    readonly list: HTMLElement;
    /** Every row in screen order when the drag began — an abandoned drag's undo. */
    readonly before: HTMLElement[];
    /** The nearest scroller, for the edge auto-scroll. */
    readonly scroller: HTMLElement | undefined;
    /** The adapter that owned the list when the drag began. */
    readonly adapter: DragAdapter;
    /** Pixels per frame the auto-scroll moves while the pointer rests near an edge. */
    scrollStep: number;
    /** The scheduled auto-scroll frame, while one is pending. */
    frame: number | undefined;
    dropped: boolean;
}
/** What a list looked like the last time a scan read it. */
export interface ListSighting {
    /** The ids in the sequence they screened, in screen order. */
    readonly ids: readonly string[];
    /** The row elements that were on screen. */
    readonly rows: readonly Element[];
}
/** Per-scan bookkeeping; one instance per module that owns a list. */
export interface DragState {
    /** The drag sources already carrying listeners. */
    readonly sources: WeakSet<Element>;
    /** The lists already carrying the delegated dragover/drop listeners. */
    readonly lists: WeakSet<Element>;
    /** The insertion line; created on the first drag and reused until teardown. */
    line: HTMLElement | undefined;
    /**
     * What each list looked like on the last pass, by list element.
     *
     * Needed because a removal cannot be told from a rename or an addition by
     * looking at the current DOM: when the host keys its rows by index, deleting
     * a model leaves every row below it drawn with the next model, so the rows on
     * screen are the same elements holding the same `order`s they always had. See
     * {@link arrangement} for what that does to the screen order.
     */
    readonly sighted: WeakMap<Element, ListSighting>;
    drag: DragSession | undefined;
}
export declare function createDragState(): DragState;
/** A list's child elements, in DOM order. */
export declare function rowElements(parent: HTMLElement): HTMLElement[];
/** The rows in the sequence they currently screen. */
export declare function visualRows(list: HTMLElement): HTMLElement[];
/**
 * Put `sequence` on screen against the order the rows currently screen in.
 *
 * Only for a gesture in flight: the pointer's arrangement IS the screen order,
 * so that is the sequence the rows are placed against. Everything outside a
 * gesture goes through {@link applyIdOrder}, which places against the DOM.
 */
export declare function placeRows(list: HTMLElement, sequence: readonly HTMLElement[]): void;
/**
 * Run `mutate`, then let every row that the mutation moved slide to where it
 * went. A row is pinned to its old offset with a transform, that position is
 * laid out (or the browser animates nothing), and the transform is released
 * under a transition — the standard FLIP pass, measured in layout pixels so a
 * container that cannot be measured (a hidden page) simply does not animate.
 */
export declare function slideIntoPlace(list: HTMLElement, mutate: () => void): void;
/** The ids of the rows that have one, in the order they screen. */
export declare function orderedIds(list: HTMLElement, idOf: (row: HTMLElement) => string | undefined): string[];
/**
 * Place the rows in `ids` order. Rows without a known id are left exactly where
 * they are: a row we cannot name is a row we must not move.
 *
 * The slots come from the DOM order. React owns the child list and keeps it
 * compacted and truthful across a removal, while the inline `order`s still on
 * the survivors describe where those models were before it. Taking the slots
 * from the DOM and the sequence from {@link arrangement} is what lets the two
 * meet: the rows land in the order the user had, in the slots the host now
 * genuinely has, so the gap a deletion left closes instead of leaving a row
 * behind the end of the list.
 */
export declare function applyIdOrder(list: HTMLElement, ids: readonly string[], idOf: (row: HTMLElement) => string | undefined): void;
/** Hand every row back the inline geometry a drag wrote on it. */
export declare function clearRowOrder(rows: Iterable<HTMLElement>): void;
/**
 * Where the carried row has to land to sit before/after `hovered`.
 *
 * The index is read against the sequence WITHOUT the carried row, which is the
 * sequence `moveToIndex` splices into. Reading it against the sequence that
 * still holds the row is what makes a downward drag land one slot too far: the
 * row's own slot is still counted.
 */
export declare function dropIndex(rows: readonly HTMLElement[], carried: HTMLElement, hovered: HTMLElement, after: boolean): number;
/** The row nearest a viewport Y — the fallback while the pointer is between rows. */
export declare function nearestRow(rows: readonly HTMLElement[], clientY: number): HTMLElement | undefined;
/** The viewport Y the insertion line belongs at for `row`. */
export declare function dropLineTop(row: HTMLElement, after: boolean): number;
/**
 * The chip the pointer carries. The browser's own drag image is a screenshot of
 * whatever element was grabbed, which for a grip is nothing and for a row card
 * is an unreadable slab — so we hand it a chip with the row's name.
 */
export declare function makeGhost(row: HTMLElement, label?: string): HTMLElement;
/** The nearest ancestor that actually scrolls, for the edge auto-scroll. */
export declare function scrollHostOf(node: HTMLElement): HTMLElement | undefined;
/** The pixels per frame `host` should scroll while the pointer is at `clientY`. */
export declare function edgeScrollStep(host: HTMLElement, clientY: number): number;
/**
 * One pass over one list: mount a grip in every nameable row, wire the list,
 * and place the rows in the order the adapter's preference asks for.
 *
 * Idempotent by DOM presence — the same guard the editor injector uses, which
 * keeps the insertion from re-triggering the scan that found it.
 */
export declare function reconcileRows(root: HTMLElement, list: HTMLElement, adapter: DragAdapter, state: DragState): void;
/**
 * Undo everything the engine put on the page: the grips, the draggable seats,
 * the insertion line, the chip, and the classes a drag left behind. The inline
 * `order` of a row is the list owner's to clear (it knows which rows are its
 * own), because the engine's grip removal is global by attribute.
 *
 * A plugin disable or an HMR replace unmounts React trees on its own, but the
 * grips and the draggable seats are raw DOM with listeners attached to
 * themselves — left behind they would keep reordering rows (and persisting that
 * order) on behalf of a fiber that no longer exists.
 */
export declare function teardownDrags(state: DragState): void;
