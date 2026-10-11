/**
 * The provider editor's three-tab takeover for the official Models settings
 * page.
 *
 * The official editor presents one provider as a single long column — identity
 * fields, then the model list, then (one section further up the card) this
 * plugin's request-header editor — and the column keeps growing with every
 * feature. This pass re-presents the same content as three tabs:
 *
 *   `provider` — the official identity fields (display name, key, base URL,
 *                protocol); the editor's own header and action row stay put.
 *   `models`   — the official model list, the rows the effort editor seats
 *                into.
 *   `advanced` — the plugin's request-header section, which the provider-card
 *                slot already mounts and which owns its own save/cancel.
 *
 * The takeover is pure CSS, by the same iron rule every pass here follows:
 * React owns the official children, so none of them move. The card carries the
 * active tab (`data-bre-tab`), each region carries its tab membership
 * (`data-bre-region`), and the stylesheet — not this module — decides what is
 * visible.
 *
 * The bar is NOT part of that DOM, and this module never inserts it. It is
 * React-rendered by {@link EditorTabBar} inside the plugin's own request-header
 * mount, which the provider-card slot already guarantees is a child of the
 * card; the stylesheet reveals it the moment the card carries the takeover
 * class. An earlier revision inserted the bar straight into the official child
 * list from here, which made it a foreign node in a React-reconciled list: it
 * was at the mercy of the next render, and the insertion itself needed the
 * headers mount to be a DIRECT child of the card — an anchor this module cannot
 * verify and which threw (aborting the whole scan) when it did not hold. Owning
 * the bar inside our own subtree removes both hazards: the pass below only ever
 * writes attributes, and the slot component publishes the card's open state the
 * same way.
 *
 * Everything degrades to the official page: a card whose structure this pass
 * cannot recognise (host redesign, partial render) is left exactly as the
 * official page built it, a card whose takeover throws is rolled back the same
 * way, and every attribute write is compared before it lands so the scan never
 * feeds the MutationObserver its own tail.
 *
 * The same visit also dresses the provider's API-key field with its reveal eye
 * ({@link revealKeyField}) and its key controls ({@link enhanceKeyManagerField}),
 * because that field's shape is decided by exactly the same classification and
 * its affordances have to come and go with the takeover.
 *
 * @module dsh-model-think-level/client/injection/editor-tabs
 */
declare const TAB_IDS: readonly ["provider", "models", "advanced"];
/** A tab id, as both the bar and the card attribute spell it. */
export type EditorTabId = (typeof TAB_IDS)[number];
/** The tab ids, in display order, for the tab-bar component. */
export declare const EDITOR_TAB_IDS: readonly EditorTabId[];
/** The bar's class, a button's class and a button's tab-id attribute, exported
 * so the component that renders the bar and the pass that labels it spell the
 * contract once. */
export declare const EDITOR_TABS_CLASS = "bre-editor-tabs";
export declare const EDITOR_TAB_BUTTON_CLASS = "bre-editor-tab";
export declare const EDITOR_TAB_ID_ATTR = "data-bre-tab-id";
/** Per-scan bookkeeping (one instance lives in `models-page.ts`). */
export interface EditorTabsState {
    /** Cards whose takeover threw and had to be rolled back. A card that cannot
     * be taken over must not repeat its complaint on every scan. */
    readonly warned: WeakSet<Element>;
}
export interface EditorTabsDeps {
    /** The plugin's own translator, for the tab labels. */
    t: (key: string, params?: Record<string, string | number>) => string;
}
export declare function createEditorTabsState(): EditorTabsState;
/**
 * The card a plugin mount sits in. Both the slot component (publishing the
 * card's open state, switching tabs) and this pass resolve the card through
 * this one rule, so a card can never be taken over by one and addressed by the
 * other.
 */
export declare function editorCardOf(element: Element | null): HTMLElement | null;
/**
 * Switch one card to a tab. The card attribute is the single source of truth:
 * the stylesheet swaps the pane on the attribute alone, and the bar's buttons
 * follow it here.
 *
 * Switching panes changes the card's height (the model list is far taller than
 * the identity fields), and the browser's scroll anchoring then keeps a node
 * near the card's BOTTOM visually stable — the card's header walks up the
 * viewport. The card's top is re-pinned here instead: the scroll host's offset
 * is measured against the card's viewport position before the switch and
 * restored against it after, so the header stays put and the card grows
 * DOWNWARD.
 *
 * The restore ADDS the delta to the offset, the way {@link pinCardTop} does:
 * a card that has moved down the screen is brought back by scrolling down the
 * document. Subtracting it works only while the delta is 0 — which is the
 * common case here, because the suppression below is what stops the browser
 * from moving the offset in the first place — and drives the card the wrong way
 * on the occasion the swap really did move it.
 */
export declare function selectEditorTab(card: HTMLElement, id: EditorTabId): void;
/**
 * Visit every open provider editor and make sure it presents as tabs.
 * Idempotent: a card that already carries the takeover is only relabelled,
 * which is also how a language switch reaches the page. Cards the pass no
 * longer recognises as open fall back to the official one-column layout.
 */
export declare function reconcileEditorTabs(root: HTMLElement, deps: EditorTabsDeps, state: EditorTabsState): void;
/** Remove every takeover mark. The bar is the tab-bar component's own DOM and
 * is hidden, not removed, by dropping the class it is revealed under. */
export declare function teardownEditorTabs(): void;
export {};
