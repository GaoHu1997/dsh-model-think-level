/**
 * Provider-row drag reordering for the official Models settings page.
 *
 * The official section renders one `<li>` per provider inside a `<ul>` that is
 * already a flex column, and React owns those children — so rows are never
 * moved in the DOM. Each row is given a CSS `order` instead, which reorders the
 * screen without touching React's child list, and the resulting id sequence is
 * stored by `../provider-order.js` for the composer model switcher to read.
 *
 * The interaction itself — the grip, the drag session, the insertion line, the
 * FLIP slide, the edge auto-scroll — lives in `./row-drag.js`, which the model
 * rows inside a provider use too. This module is the provider list's adapter
 * onto it: it names each row (the plugin's `data-bre-provider` stamp, or the
 * official Edit button's label parsed back through `editProvider`), mounts the
 * grip in the row's own header (`[class*="rowHead"]`), and lets the WHOLE header
 * drag — a 18px grip is a poor thing to have to hit. The card's own buttons keep
 * their behaviour, because the engine cancels a drag that begins on one, and
 * everything the page renders below the header is untouched.
 *
 * @module dsh-model-think-level/client/injection/provider-order-drag
 */

import type { HostLabels } from './models-page-editor.js'
import { resolveProviderOrder, setProviderOrder } from '../provider-order.js'
import {
  applyIdOrder,
  clearRowOrder,
  createDragState,
  orderedIds,
  reconcileRows,
  rowElements,
  teardownDrags,
} from './row-drag.js'
import type { DragAdapter, DragState } from './row-drag.js'

// The engine's helpers are part of this module's surface: the provider tests
// exercise them here, and callers that only know this list should not have to
// reach into the shared engine to reach them.
export {
  dropIndex,
  dropLineTop,
  edgeScrollStep,
  makeGhost,
  nearestRow,
  placeRows,
  rowElements,
  scrollHostOf,
  visualRows,
} from './row-drag.js'

/** Per-scan bookkeeping (one instance lives in `models-page.ts`). */
export type ProviderOrderState = DragState

export interface ProviderOrderDeps {
  /** The plugin's own translator, for the grip's label and tooltip. */
  t: (key: string, params?: Record<string, string | number>) => string
  /** The official `settings.models` label sets, resolved fresh on every scan. */
  labels: () => HostLabels
}

/** Marks the row with the provider id it belongs to (ours to add and to read). */
const ROW_ID_ATTR = 'data-bre-row-provider'
/** The `{provider}` slot of the official `providerCopy` templates. */
const PROVIDER_TOKEN = '{provider}'
/** Class-name fragments of the official provider rows, probed by substring. */
const ROW_CLASS_PROBES = ['rowCard', 'setupCard'] as const

export function createProviderOrderState(): ProviderOrderState {
  return createDragState()
}

/**
 * The official provider-row list: the `<ul>` that holds the row cards. Probed by
 * class-name fragment because the page's class names are CSS-module hashes
 * (`_3nPmjq_rows` today, something else tomorrow).
 */
export function rowsListOf(root: HTMLElement): HTMLElement | undefined {
  for (const probe of ROW_CLASS_PROBES) {
    for (const hit of Array.from(root.querySelectorAll<HTMLElement>(`[class*="${probe}"]`))) {
      const parent = hit.parentElement
      if (parent === null || parent.tagName !== 'UL') continue
      if (rowElements(parent).length === 0) continue
      return parent
    }
  }
  return undefined
}

/**
 * The row's own header — the seat the grip is mounted into, and the drag source.
 * Exported because the enable switch mounts into the same seat and must agree
 * with this module about where that seat is.
 */
export function rowHeadOf(row: HTMLElement): HTMLElement | undefined {
  return row.querySelector<HTMLElement>('[class*="rowHead"]') ?? undefined
}

/**
 * The row's displayed provider name, for the grip's label, the drag chip and
 * the switch's label.
 */
export function rowNameOf(row: HTMLElement): string | undefined {
  const name = row.querySelector<HTMLElement>('[class*="rowName"]')?.textContent?.trim()
  return name !== undefined && name.length > 0 ? name : undefined
}

/** The `{provider}` slot split out of one official template. */
function templateParts(template: string): { prefix: string; suffix: string } | undefined {
  const at = template.indexOf(PROVIDER_TOKEN)
  if (at < 0) return undefined
  return { prefix: template.slice(0, at), suffix: template.slice(at + PROVIDER_TOKEN.length) }
}

/**
 * Recover the provider id from an official `providerTargetLabel`: `Name (route)`
 * — the form used whenever the display name differs from the route — or the
 * bare route when the two are equal. The id is the LAST parenthesized group, so
 * a display name that itself carries parentheses still splits correctly.
 */
export function idFromTargetLabel(label: string): string | undefined {
  const trimmed = label.trim()
  if (trimmed.length === 0) return undefined
  const parenthesized = /^(.*) \(([^()]*)\)$/.exec(trimmed)
  if (parenthesized !== null) {
    const route = parenthesized[2] as string
    return route.length === 0 ? undefined : route
  }
  // A route whose display name IS the route is the whole label — and a route
  // never carries whitespace.
  return /\s/.test(trimmed) ? undefined : trimmed
}

/** Whether a node belongs to this plugin (or any other `bre-`-prefixed seat). */
function isForeign(node: Element): boolean {
  return node.closest('[data-plugin], [class*="bre-"]') !== null
}

/**
 * The provider id of one row: the stamp our own slot carries when the row has
 * one (every llm-pi-ai row does), else the official Edit button's aria-label
 * parsed back through the localized `editProvider` template.
 */
export function providerIdOfRow(row: HTMLElement, labels: HostLabels): string | undefined {
  const stamped = row.querySelector<HTMLElement>('[data-bre-provider]')?.getAttribute('data-bre-provider')
  if (typeof stamped === 'string' && stamped.length > 0) return stamped
  for (const template of labels.editProvider) {
    const parts = templateParts(template)
    if (parts === undefined) continue
    for (const button of Array.from(row.querySelectorAll<HTMLElement>('button[aria-label]'))) {
      if (isForeign(button)) continue
      const label = button.getAttribute('aria-label') ?? ''
      if (label.length <= parts.prefix.length + parts.suffix.length) continue
      if (!label.startsWith(parts.prefix) || !label.endsWith(parts.suffix)) continue
      const id = idFromTargetLabel(label.slice(parts.prefix.length, label.length - parts.suffix.length))
      if (id !== undefined) return id
    }
  }
  return undefined
}

/** The id this module stamped on a row, if any. */
function rowIdOf(row: HTMLElement): string | undefined {
  const value = row.getAttribute(ROW_ID_ATTR)
  return value === null || value.length === 0 ? undefined : value
}

/** The stamped ids of the rows that have one, in the order they screen. */
export function orderedRowIds(list: HTMLElement): string[] {
  return orderedIds(list, rowIdOf)
}

/** Place the rows in the stored order; rows we could not name are left alone. */
export function applyRowOrder(list: HTMLElement, ids: readonly string[]): void {
  applyIdOrder(list, ids, rowIdOf)
}

/**
 * One pass over the document: name every provider row, mount a grip in each
 * row's header, make that header a drag source, and place the rows in the order
 * the preference asks for.
 *
 * Runs on every scan (the official editor's own pass bails out when no card is
 * open, so this cannot ride along with it) and is idempotent by DOM presence —
 * the same guard the editor injector uses, which keeps the insertion from
 * re-triggering the scan that found it.
 */
export function reconcileProviderOrder(
  root: HTMLElement,
  deps: ProviderOrderDeps,
  state: ProviderOrderState,
): void {
  if (!root.isConnected) return
  const list = rowsListOf(root)
  if (list === undefined) return
  const labels = deps.labels()
  // Name the rows before the engine looks at them: a row without a stamp has no
  // id, and a row the engine cannot name gets no grip and is never moved.
  for (const row of rowElements(list)) {
    const id = providerIdOfRow(row, labels)
    if (id === undefined) {
      row.removeAttribute(ROW_ID_ATTR)
      continue
    }
    if (rowIdOf(row) !== id) row.setAttribute(ROW_ID_ATTR, id)
  }
  reconcileRows(root, list, providerAdapter(deps), state)
}

/** The provider list as the engine needs to see it. */
function providerAdapter(deps: ProviderOrderDeps): DragAdapter {
  return {
    // A provider row is the `<li>` a descendant belongs to — the engine checks
    // that it really is one of the list's own rows.
    rowOf: (node) => {
      const row = node.closest('li')
      return row instanceof HTMLElement ? row : undefined
    },
    idOf: rowIdOf,
    labelOf: rowNameOf,
    order: (ids) => resolveProviderOrder(ids),
    commit: (list) => { setProviderOrder(orderedRowIds(list)) },
    seatOf: rowHeadOf,
    // The header drags, not just the grip: the header is the row's own seat, and
    // a provider card is a large target that no text selection competes for.
    seatDrags: true,
    gripLabel: (row, id) => deps.t('providerReorderAria', { provider: rowNameOf(row) ?? id }),
    gripHint: () => deps.t('providerReorderHint'),
  }
}

/**
 * Undo everything this module put on the official page. A plugin disable or an
 * HMR replace unmounts React trees on its own, but the grips, the draggable
 * headers and the insertion line are raw DOM with listeners attached to
 * themselves — left behind they would keep reordering the rows (and persisting
 * that order) on behalf of a fiber that no longer exists.
 */
export function teardownProviderOrder(state: ProviderOrderState): void {
  teardownDrags(state)
  const stamped = Array.from(document.querySelectorAll<HTMLElement>(`[${ROW_ID_ATTR}]`))
  clearRowOrder(stamped)
  for (const row of stamped) row.removeAttribute(ROW_ID_ATTR)
}
