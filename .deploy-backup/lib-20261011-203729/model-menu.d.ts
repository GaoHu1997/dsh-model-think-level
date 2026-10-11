/**
 * Locating the official composer model seat — the ONE surface this plugin may
 * decorate with a provider prefix.
 *
 * Everything in this module is scoped to the composer card
 * (`[data-composer-card]`, owned by InputBar) and, inside it, to the model
 * seat's own slot anchor. That scope is not a convenience: the shell renders
 * several `button[aria-haspopup="menu"]` elements (the settings sidebar's
 * account button, the composer's permission selector, …), so a document-wide
 * search hands back a button this plugin does not own and paints the provider
 * prefix on a host surface's label. When the seat cannot be identified the
 * finders return undefined — the prefix is simply not shown, never stamped on
 * someone else's control.
 *
 * @module dsh-model-think-level/client/injection/model-menu
 */
/**
 * The official composer model menu: the seat root's open popover.
 *
 * Shape-tolerant across kernels: newer kernels portal the menu to
 * document.body and link it from the seat trigger via aria-controls, while
 * older kernels render it inline right after the trigger. Both shapes keep
 * aria-haspopup="menu" on the trigger and role="menu" on the menu, so the
 * controls link is the primary route and the sibling check stays the fallback.
 *
 * The search NEVER leaves the composer card. When no card is mounted there is
 * no model seat, and answering with some other surface's menu is exactly the
 * cross-surface confusion this scoping exists to prevent.
 *
 * @param doc - the document to search.
 * @returns the open model menu, or undefined while it is closed.
 */
export declare function findModelMenu(doc?: Document): HTMLElement | undefined;
/**
 * The official composer model trigger.
 *
 * The trigger stays in the card while its menu is closed, so this finder keeps
 * the menu lookup's linked and inline checks and then falls back to the seat
 * the closed card still renders:
 *
 *   - inside the seat's anchor, every candidate IS the seat;
 *   - without an anchor, the seat is the LAST menu trigger of the card, since
 *     the shell renders it at the end of the composer's trailing control row
 *     (after the tools row that hosts the permission selector).
 *
 * @param doc - the document to search.
 * @returns the composer's model trigger, or undefined while no composer exists.
 */
export declare function findModelTrigger(doc?: Document): HTMLButtonElement | undefined;
/** The official composer model menu: the seat root's open popover. */
export declare function modelMenuOf(): HTMLElement | undefined;
/** The official composer model trigger, or undefined while the seat is absent. */
export declare function modelTriggerOf(): HTMLButtonElement | undefined;
