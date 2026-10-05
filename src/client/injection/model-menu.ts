/**
 * Locating the official composer model menu — the seat root's open popover.
 *
 * @module dsh-model-think-level/client/injection/model-menu
 */

/**
 * The official composer model menu: the seat root's open popover.
 *
 * Shape-tolerant across kernels: 0.1.5 portals the menu to document.body
 * and links it from the seat trigger via aria-controls, while older kernels
 * render it inline right after the trigger. Both shapes keep
 * aria-haspopup="menu" on the trigger and role="menu" on the menu, so the
 * controls link is the primary route and the sibling check stays as the
 * fallback. Trigger search stays scoped to the composer card, so other
 * seats' menus never match; no copy text is read, so every locale matches.
 */
export function findModelMenu(doc: Document = document): HTMLElement | undefined {
  const card = doc.querySelector('[data-composer-card]')
  const scope: ParentNode = card ?? doc
  for (const trigger of Array.from(scope.querySelectorAll<HTMLElement>('button[aria-haspopup="menu"][aria-controls]'))) {
    const id = trigger.getAttribute('aria-controls')
    if (id === null || id.length === 0) continue
    const menu = doc.getElementById(id)
    if (menu !== null && menu.getAttribute('role') === 'menu') return menu
  }
  // Fallback: the pre-portal inline shape — the menu sits right after its
  // trigger button, which disambiguates it from other menus in the card.
  const menus = card === null
    ? Array.from(doc.querySelectorAll<HTMLElement>('[role="menu"]'))
    : Array.from(card.querySelectorAll<HTMLElement>('[role="menu"]'))
  for (const menu of menus) {
    if (menu.previousElementSibling?.matches('button[aria-haspopup="menu"]')) return menu
  }
  return undefined
}

/**
 * The official composer model trigger.
 *
 * The trigger remains in the composer card while its menu is closed, so this
 * finder keeps the menu lookup's linked and inline checks for an open menu but
 * falls back to the card's model-menu trigger when the popover is absent.
 */
export function findModelTrigger(doc: Document = document): HTMLButtonElement | undefined {
  const card = doc.querySelector('[data-composer-card]')
  const scope: ParentNode = card ?? doc
  const triggers = Array.from(scope.querySelectorAll<HTMLButtonElement>('button[aria-haspopup="menu"]'))

  // Prefer the trigger whose controls link resolves to the currently open
  // model menu. This disambiguates cards that contain another menu trigger.
  for (const trigger of triggers) {
    const id = trigger.getAttribute('aria-controls')
    if (id === null || id.length === 0) continue
    const menu = doc.getElementById(id)
    if (menu !== null && menu.getAttribute('role') === 'menu') return trigger
  }

  // Pre-portal inline shape: the menu follows its trigger in the card.
  for (const trigger of triggers) {
    if (trigger.nextElementSibling?.matches('[role="menu"]')) return trigger
  }

  // Closed menus are not in the DOM. The composer card owns this seat, so its
  // first menu trigger is the stable host control to decorate.
  return triggers[0]
}

/** The official composer model menu: the seat root's open popover. */
export function modelMenuOf(): HTMLElement | undefined {
  return findModelMenu()
}

/** The official composer model trigger, or undefined while the seat is absent. */
export function modelTriggerOf(): HTMLButtonElement | undefined {
  return findModelTrigger()
}
