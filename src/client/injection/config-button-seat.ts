/**
 * The Models-page title-row seat: the 「生图服务」 button at the right end of
 * the 「模型」 heading line, opening the plugin's image-service config pane.
 *
 * The official `settings.action` slot lands in the DIALOG's top bar (beside
 * 「打开配置文件」), not on the heading — and the Models page itself exposes
 * only footer/provider-card/sign-in slots. So the seat is built the way
 * add-card.ts builds its pane host: a plugin-owned `div.bre-config-host`
 * appended to the heading's row, compare-before-write, idempotent via the
 * host node's presence.
 *
 * The heading anchor is deliberately a pure function ({@link findModelsTitleRow})
 * with fixture tests, and it FAILS CLOSED: on any structural drift it returns
 * null and the button does not render — a wrong element must never receive a
 * plugin button.
 *
 * This anchor rides a DOM coincidence (the host's Models page heading is the
 * sole element whose whole text reads 「模型」/“Models” in the section that
 * carries the provider row cards). The host nests the cards in a `ul` and
 * puts the heading as its SIBLING in `div.jrmgQW_section`; an earlier host
 * version kept both as direct children of the content column. The anchor
 * therefore climbs from the cards to the nearest scope that holds the heading,
 * instead of assuming the cards' parent is the content column. The coincidence
 * is asserted by tests/fixtures; when a host change breaks it, the function
 * returns null and the fallback is the `settings.action` slot (see the design's
 * §4.1 备选).
 *
 * @module dsh-model-think-level/client/injection/config-button-seat
 */

import { createElement, useEffect } from 'react'
import { prefetchImageConfigView } from '../image-config-client.js'
import { unmountReact, mountReact, type ForeignMount } from './mount.js'

/** The title copies the Models page renders (both shipped languages). */
const TITLE_CANDIDATES: readonly string[] = ['模型', 'Models', 'models']

/** The provider-row-card family that identifies the Models page. */
const CARD_SELECTOR = '[class*="rowCard"], [class*="setupCard"], [class*="addCard"]'

/** Semantic heading tags/roles (the host renders the title as `h2`). */
const HEADING_SELECTOR = 'h1,h2,h3,h4,h5,h6,[role="heading"]'

/** Hashed heading classes (`jrmgQW_title`, `_2Abc_pageTitle`). */
const HEADING_CLASS = /title|heading/i

/** Labels that only LOOK like the title: a provider row's name, a nav cell, a
 * menu item. The scope climb must never anchor on one of these. */
const LABEL_CONTEXT = 'nav, button, [role="menu"], [role="menuitem"], [class*="rowName"], [class*="rowCard"]'

/** `Node.DOCUMENT_POSITION_FOLLOWING` (kept numeric: ParentNode roots need no
 * global `Node`). */
const FOLLOWING = 4

/** Whether this element's OWN text (ignoring child elements) equals the title.
 * The seat's own host subtree is skipped, so a mounted button never breaks the
 * anchor it was found through. */
function isLeafText(element: Element, text: string): boolean {
  let own = ''
  for (const node of element.childNodes) {
    if (node.nodeType === node.TEXT_NODE) own += node.textContent ?? ''
    else if (node.nodeType === node.ELEMENT_NODE) {
      if ((node as Element).classList?.contains(CONFIG_HOST_CLASS)) continue
      return false
    }
  }
  return own.replace(/\s+/g, ' ').trim() === text
}

/** Whether an element is (or sits inside) the heading, not merely a node whose
 * text happens to equal the copy. */
function headingOf(leaf: Element, scope: Element): Element | null {
  for (let node: Element | null = leaf; node !== null; node = node.parentElement) {
    if (node.matches(HEADING_SELECTOR) || HEADING_CLASS.test(String(node.className ?? ''))) return node
    if (node === scope) break
  }
  return null
}

/** The heading element inside `scope`, before the cards and outside labels. */
function headingIn(scope: Element, cards: Element): Element | null {
  for (const candidate of TITLE_CANDIDATES) {
    for (const element of scope.querySelectorAll<HTMLElement>('*')) {
      if (!isLeafText(element, candidate)) continue
      if (element.closest(LABEL_CONTEXT) !== null) continue
      // A heading after the cards (a footer section title) is not this page's:
      // `element` must precede `cards` in document order.
      if ((element.compareDocumentPosition(cards) & FOLLOWING) === 0) continue
      const heading = headingOf(element, scope)
      if (heading !== null) return heading
    }
  }
  return null
}

/**
 * Locate the Models page's title LINE, or null. Two gates, both required:
 * 1. the current surface carries the provider-row-card family (the Models
 *    page's own anchors — a dialog or panel without them is another page);
 * 2. climbing from the cards to the nearest ancestor that also holds the
 *    heading (the host puts `h2.jrmgQW_title` beside `ul.jrmgQW_rows` inside
 *    `div.jrmgQW_section`), exactly one element reads as the heading copy and
 *    is not a row/nav label.
 * Returns the heading's line element (the heading itself when the host gives
 * it no wrapper), so the seat can append to the line's right end.
 */
export function findModelsTitleRow(root: ParentNode): HTMLElement | null {
  // Gate 1: the Models page's row-card family is present.
  const cards = root.querySelector<HTMLElement>(CARD_SELECTOR)
  if (cards === null) return null
  const body = cards.ownerDocument?.body ?? null
  // Gate 2: climb from the cards' parent — NOT the cards' parent as a fixed
  // content column — to the nearest scope that carries the heading. The first
  // hit is the section the line lives in; stopping there keeps the dialog's
  // nav 「模型」 label out of the search.
  for (let scope = cards.parentElement; scope !== null && scope !== body; scope = scope.parentElement) {
    const heading = headingIn(scope, cards)
    if (heading !== null) return titleRowOf(heading, scope)
  }
  return null
}

/**
 * The line a heading belongs to: climb from the heading through PURE wrappers
 * (one element child, no own text) until the first ancestor that has
 * siblings — that ancestor is the title line. The scope is the boundary: a
 * heading whose every wrapper up to it is pure (a title-only row) returns the
 * outermost pure wrapper, never the scope itself. A leaf directly in the scope
 * returns itself (the host's bare `h2` case).
 *
 * Never returns a container that holds the card family: a scope that also
 * carries the rows must not be restyled as a title line.
 */
function titleRowOf(heading: Element, boundary: Element): HTMLElement | null {
  let current: HTMLElement = heading as HTMLElement
  let parent = current.parentElement
  while (parent !== null && parent !== boundary) {
    const ownText = Array.from(parent.childNodes)
      .filter(node => node.nodeType === node.TEXT_NODE)
      .map(node => node.textContent ?? '')
      .join('')
      .replace(/\s+/g, ' ')
      .trim()
    const elementChildren = Array.from(parent.children)
      .filter(child => !child.classList?.contains(CONFIG_HOST_CLASS))
    if (elementChildren.length > 1 || ownText.length > 0) {
      if (parent.querySelector(CARD_SELECTOR) !== null) return current
      return parent
    }
    current = parent
    parent = parent.parentElement
  }
  return parent === boundary ? current : null
}

/** The seat's host class (one per Models page, like add-card's pane host). */
export const CONFIG_HOST_CLASS = 'bre-config-host'

/**
 * The class that turns the anchor into the title LINE (flex + vertical
 * centring), so the seat sits at the line's right end via `margin-left:auto`
 * even when the host gives the heading no wrapper of its own. Plugin-owned and
 * removed with the seat.
 */
export const CONFIG_TITLE_LINE_CLASS = 'bre-config-title-line'

/** What the seat needs. `onOpen` opens the config pane. */
export interface ConfigButtonSeatDeps {
  /** The plugin's translator. */
  readonly t: (key: string, params?: Record<string, unknown>) => string
  /** Open the config pane (the button's single job). */
  readonly onOpen: () => void
}

/** One scan's seat state: the row the seat lives on and its React root. */
export interface ConfigButtonSeatState {
  readonly mounts: Map<HTMLElement, ForeignMount>
}

export function createConfigButtonSeatState(): ConfigButtonSeatState {
  return { mounts: new Map() }
}

/**
 * Ensure the title line carries the button. Idempotent: the settled case (the
 * line already hosts this module's seat) writes nothing — not even the flex
 * class, which the same settled seat implies.
 */
export function ensureConfigButtonSeat(
  row: HTMLElement,
  deps: ConfigButtonSeatDeps,
  state: ConfigButtonSeatState,
): void {
  const known = state.mounts.get(row)
  const existing = row.querySelector<HTMLElement>(`:scope > .${CONFIG_HOST_CLASS}`)
  if (existing !== null && known !== undefined && known.wrapper === existing) return
  // A re-rendered row left a stray seat behind: take both down, remount fresh.
  dropSeat(row, state)
  existing?.remove()
  // The host gives a bare `h2` no wrapper to append beside, so the plugin
  // supplies the missing line mechanics: flex + vertical centring. The seat's
  // `.bre-config-host { margin-left: auto }` then holds the right edge.
  row.classList.add(CONFIG_TITLE_LINE_CLASS)
  const host = row.ownerDocument.createElement('div')
  host.className = CONFIG_HOST_CLASS
  row.appendChild(host)
  // `sync`: the seat rides the synchronous decoration pass, so the button is
  // committed in the same frame the page painted the row.
  const mount = mountReact(host, createElement(ConfigButton, { t: deps.t, onOpen: deps.onOpen }), { sync: true })
  state.mounts.set(row, mount)
}

/** Take one line's seat down (restoring the host's own line styling). */
export function dropSeat(row: HTMLElement, state: ConfigButtonSeatState): void {
  row.classList.remove(CONFIG_TITLE_LINE_CLASS)
  const known = state.mounts.get(row)
  if (known === undefined) return
  state.mounts.delete(row)
  unmountReact(known)
}

/** Take every seat down, including strays a dead fiber left behind. */
export function teardownConfigButtonSeats(state: ConfigButtonSeatState): void {
  for (const row of Array.from(state.mounts.keys())) dropSeat(row, state)
  for (const host of Array.from(document.querySelectorAll<HTMLElement>(`.${CONFIG_HOST_CLASS}`))) {
    host.parentElement?.classList.remove(CONFIG_TITLE_LINE_CLASS)
    host.remove()
  }
}

/**
 * The service icon: a picture frame with a sun and a mountain line — the
 * 「生图服务」 button opens the image-generation service, so the gear that used
 * to stand for "settings" is replaced by the thing being configured (14px,
 * the plugin's shared stroke style).
 */
function imageServiceIcon(label: string): ReturnType<typeof createElement> {
  return createElement(
    'svg',
    {
      className: 'bre-config-btn-icon',
      width: 14,
      height: 14,
      viewBox: '0 0 24 24',
      fill: 'none',
      stroke: 'currentColor',
      strokeWidth: 2,
      strokeLinecap: 'round',
      strokeLinejoin: 'round',
      role: 'img',
      'aria-label': label,
    },
    createElement('rect', { x: 3, y: 4, width: 18, height: 16, rx: 2.5 }),
    createElement('circle', { cx: 8.5, cy: 9.5, r: 1.6 }),
    createElement('path', { d: 'M3.6 17.6 9 12.2l4.4 4.4 3-3 4 4' }),
  )
}

/** The 「生图服务」 button: icon and text on one midline (inline-flex). */
export function ConfigButton(props: { t: (key: string) => string; onOpen: () => void }): ReturnType<typeof createElement> {
  // The button only exists while the Models page is on screen, which is exactly
  // the moment the user is a click away from the pane: warm the config snapshot
  // here so 「生图服务」 paints from cache instead of waiting for the host.
  useEffect(() => { prefetchImageConfigView() }, [])
  return createElement(
    'button',
    {
      className: 'bre-config-btn',
      type: 'button',
      title: props.t('configButtonHint'),
      onClick: () => props.onOpen(),
    },
    imageServiceIcon(props.t('configButtonHint')),
    props.t('configButton'),
  )
}
