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
 * The declared slot whose single entry is the model seat (ModelSelect).
 *
 * `renderSlot` wraps every entry in an addressable anchor div (`data-slot` =
 * the slot key, `display: contents`), which the shell documents as "purely
 * addressable surface". The anchor therefore names the seat independently of
 * its translated copy, and it is the identity to trust whenever the shell
 * renders it.
 */
const MODEL_SEAT_SLOT = 'conversation.input.model'

/**
 * The composer card: the shell's single owner of the model seat.
 *
 * The card is both the search scope and the proof that a candidate button
 * belongs to this plugin's seat at all. The shell renders ONE card (the
 * composer input surface, `data-composer-card` on InputBar's card div).
 *
 * @param doc - the document to search.
 * @returns the card element, or undefined when no composer is mounted.
 */
function composerCardOf(doc: Document): HTMLElement | undefined {
  return doc.querySelector<HTMLElement>('[data-composer-card]') ?? undefined
}

/**
 * The model seat's own subtree inside the card.
 *
 * @param card - the composer card.
 * @returns the seat's slot anchor, or undefined on a shell that renders none.
 */
function seatAnchorOf(card: HTMLElement): HTMLElement | undefined {
  return card.querySelector<HTMLElement>(`[data-slot="${MODEL_SEAT_SLOT}"]`) ?? undefined
}

/**
 * The menu-trigger buttons that may belong to the model seat.
 *
 * Scoped to the seat's anchor when it exists, so the composer's permission
 * selector (rendered earlier in the card, also `aria-haspopup="menu"`) is never
 * a candidate. Without an anchor the whole card is the scope, and the ordering
 * rules in the finders below pick the seat out of it.
 *
 * @param card - the composer card.
 * @returns the candidate triggers, in document order.
 */
function seatTriggerCandidates(card: HTMLElement): HTMLButtonElement[] {
  const scope = seatAnchorOf(card) ?? card
  return Array.from(scope.querySelectorAll<HTMLButtonElement>('button[aria-haspopup="menu"]'))
}

/**
 * Whether an element is the seat's popover surface.
 *
 * The SAME portalled card carries two roles, because upstream derives it from
 * the pane it is showing (`role: pane === "model" ? "group" : "menu"`):
 *
 *   - `menu` — the root pane (the "Model" / "Effort" cells, or this plugin's
 *     replica once it is mounted);
 *   - `group` — upstream opened STRAIGHT into the model list. That is what a
 *     session whose saved selection does not resolve in the current catalog
 *     gets (a HISTORICAL session whose provider or model id was renamed or
 *     removed since it was saved, or one whose projection had not landed yet
 *     when the menu was first opened), because upstream only shows the root
 *     pane when it can name the session's current model.
 *
 * Only the seat's own `aria-controls` target is ever tested with this, so the
 * role is a pane marker rather than a guess: an element with no role at all is
 * still not a popover, and never becomes one here.
 *
 * @param el - the candidate element (an `aria-controls` target or a sibling).
 * @returns whether the element is the seat's popover surface.
 */
function isMenuSurface(el: Element | null | undefined): el is HTMLElement {
  if (el === null || el === undefined) return false
  const role = el.getAttribute('role')
  return role === 'menu' || role === 'group'
}

/**
 * Whether the seat's popover is showing upstream's DRILLED-IN model list.
 *
 * Upstream derives the surface role from the pane (`role: pane === "model" ?
 * "group" : "menu"`), so this single attribute answers "which pane did the
 * popover open in?". It opens in the list pane whenever it cannot name the
 * session's current model (`currentChoice === void 0`) — the HISTORICAL-session
 * shape, where the saved selection no longer resolves in today's catalog (a
 * provider or model id that was renamed or removed) or the session's projection
 * had not landed when the popover was first opened.
 *
 * The distinction matters to injection, not just to discovery: in that pane the
 * official list IS the switcher, so the plugin has to replace it to give the
 * session the same two-row body a new session gets.
 *
 * @param surface - the element {@link findModelMenu} returned.
 * @returns whether upstream is showing its model list rather than the root pane.
 */
export function isDrilledModelPane(surface: HTMLElement): boolean {
  return surface.getAttribute('role') === 'group'
}

/**
 * The menu a trigger points at through `aria-controls`, when it is one.
 *
 * This is the primary route because a portaled popover leaves the card while
 * the control keeps naming it, so the link is what survives the move. A
 * controls id that names nothing, or names an element that is not a popover, is
 * not a menu.
 *
 * @param trigger - the candidate button.
 * @param doc - the document the linked element lives in.
 * @returns the linked menu, or undefined.
 */
function linkedMenuOf(trigger: HTMLButtonElement, doc: Document): HTMLElement | undefined {
  const id = trigger.getAttribute('aria-controls')
  if (id === null || id.length === 0) return undefined
  const menu = doc.getElementById(id)
  return isMenuSurface(menu) ? menu : undefined
}

/**
 * The official composer model menu: the seat root's open popover.
 *
 * Shape-tolerant across kernels: newer kernels portal the menu to
 * document.body and link it from the seat trigger via aria-controls, while
 * older kernels render it inline right after the trigger. Both shapes keep
 * aria-haspopup="menu" on the trigger, so the controls link is the primary
 * route and the sibling check stays the fallback.
 *
 * The SURFACE role is NOT stable: upstream sets `role="menu"` on the root pane
 * and `role="group"` while it shows the model list (see {@link isMenuSurface}).
 * Requiring `role="menu"` therefore lost the seat exactly for the sessions that
 * open straight into the model list — most visibly a HISTORICAL session, whose
 * saved selection no longer resolves in the current catalog. Both roles are
 * accepted here; what still has to hold is that the element IS the seat's
 * `aria-controls` target (or its inline sibling), so no other surface's popover
 * is ever mistaken for the model menu.
 *
 * The search NEVER leaves the composer card. When no card is mounted there is
 * no model seat, and answering with some other surface's menu is exactly the
 * cross-surface confusion this scoping exists to prevent.
 *
 * @param doc - the document to search.
 * @returns the open model menu, or undefined while it is closed.
 */
export function findModelMenu(doc: Document = document): HTMLElement | undefined {
  const card = composerCardOf(doc)
  if (card === undefined) return undefined

  for (const trigger of seatTriggerCandidates(card)) {
    const menu = linkedMenuOf(trigger, doc)
    if (menu !== undefined) return menu
  }

  // Pre-portal inline shape: the menu sits right after its trigger button.
  // Scoped like the candidates, so another seat's inline menu is not mistaken
  // for the model seat's. A `role="group"` candidate must ALSO carry the model
  // list's own content: the inline fallback has no `aria-controls` link to lean
  // on, so structure is the only thing standing between it and an unrelated
  // `role="group"` block that happens to sit after a menu trigger.
  const scope = seatAnchorOf(card) ?? card
  for (const menu of Array.from(scope.querySelectorAll<HTMLElement>('[role="menu"], [role="group"]'))) {
    if (!menu.previousElementSibling?.matches('button[aria-haspopup="menu"]')) continue
    if (!isMenuSurface(menu)) continue
    if (menu.getAttribute('role') === 'group'
      && menu.querySelector('[role="menuitemradio"], section[role="group"]') === null) continue
    return menu
  }
  return undefined
}

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
export function findModelTrigger(doc: Document = document): HTMLButtonElement | undefined {
  const card = composerCardOf(doc)
  if (card === undefined) return undefined

  const anchor = seatAnchorOf(card)
  const candidates = seatTriggerCandidates(card)
  const seat = candidates[0]
  if (seat === undefined) return undefined

  // Prefer the trigger whose controls link resolves to the currently open
  // model menu. This disambiguates a card that holds another menu trigger.
  for (const trigger of candidates) {
    if (linkedMenuOf(trigger, doc) !== undefined) return trigger
  }

  // Pre-portal inline shape: the menu follows its trigger in the card. The
  // surface role follows the pane (see {@link isMenuSurface}), so both shapes
  // count here as well.
  for (const trigger of candidates) {
    if (isMenuSurface(trigger.nextElementSibling)) return trigger
  }

  return anchor === undefined ? candidates.at(-1) : seat
}

/** The official composer model menu: the seat root's open popover. */
export function modelMenuOf(): HTMLElement | undefined {
  return findModelMenu()
}

/** The official composer model trigger, or undefined while the seat is absent. */
export function modelTriggerOf(): HTMLButtonElement | undefined {
  return findModelTrigger()
}
