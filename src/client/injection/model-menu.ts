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
 * The menu a trigger points at through `aria-controls`, when it is one.
 *
 * This is the primary route because a portaled popover leaves the card while
 * the control keeps naming it, so the link is what survives the move. A
 * controls id that names nothing, or names a non-menu element, is not a menu.
 *
 * @param trigger - the candidate button.
 * @param doc - the document the linked element lives in.
 * @returns the linked menu, or undefined.
 */
function linkedMenuOf(trigger: HTMLButtonElement, doc: Document): HTMLElement | undefined {
  const id = trigger.getAttribute('aria-controls')
  if (id === null || id.length === 0) return undefined
  const menu = doc.getElementById(id)
  if (menu === null) return undefined
  return menu.getAttribute('role') === 'menu' ? menu : undefined
}

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
export function findModelMenu(doc: Document = document): HTMLElement | undefined {
  const card = composerCardOf(doc)
  if (card === undefined) return undefined

  for (const trigger of seatTriggerCandidates(card)) {
    const menu = linkedMenuOf(trigger, doc)
    if (menu !== undefined) return menu
  }

  // Pre-portal inline shape: the menu sits right after its trigger button.
  // Scoped like the candidates, so another seat's inline menu is not mistaken
  // for the model seat's.
  const scope = seatAnchorOf(card) ?? card
  for (const menu of Array.from(scope.querySelectorAll<HTMLElement>('[role="menu"]'))) {
    if (menu.previousElementSibling?.matches('button[aria-haspopup="menu"]')) return menu
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

  // Pre-portal inline shape: the menu follows its trigger in the card.
  for (const trigger of candidates) {
    if (trigger.nextElementSibling?.matches('[role="menu"]')) return trigger
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
