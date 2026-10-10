/**
 * Model-row drag reordering inside one provider's editor on the official Models
 * settings page.
 *
 * The official editor renders a provider's models as
 * `div.modelList > div.modelEntry > div.modelRow` (a four-column grid: id,
 * display name, and two icon buttons), straight from
 * `models.map((model, index) => …)`. React owns those children, so — exactly as
 * for the provider rows — a model is moved with a CSS `order`, and the id
 * sequence that results is stored per provider by `../model-order.js`.
 *
 * Two differences from the provider list, and both are in the adapter:
 *   - the row is a grid of INPUTS, so only the grip drags. A drag that began on
 *     the row body has to stay a text selection, which is why `seatDrags` is
 *     false here and true for a provider header;
 *   - the model list lives inside the provider's own `li.rowCard`, so the
 *     provider id — and with it which stored sequence to read and to write — is
 *     recovered from the enclosing row on every call rather than captured, and
 *     a list whose provider cannot be named is left completely alone.
 *
 * A model's id is the value of its own "Model ID" input, not its position: the
 * official `aria-label`s carry `position` (`Model ID 1`), and a reorder that
 * renumbered them would rename every field on the page. A row whose id input is
 * still blank (a model just added, not yet named) gets no grip and is never
 * moved.
 *
 * @module dsh-model-think-level/client/injection/model-order-drag
 */

import { orderedIds, reconcileRows, rowElements, teardownDrags, createDragState, clearRowOrder } from './row-drag.js'
import type { DragAdapter, DragState } from './row-drag.js'
import { setModelOrder, resolveModelOrder, modelOrderOf } from '../model-order.js'
import { inputValueByLabel, type HostLabels } from './models-page-editor.js'
import { providerIdOfRow } from './provider-order-drag.js'

/** Marks the entry with the model id it holds (ours to add and to read). */
const ROW_ID_ATTR = 'data-bre-row-model'
/**
 * Marks the grid we widened to make room for the grip.
 *
 * Deliberately NOT `bre-model-row`: that name is already the plugin's own
 * composer row (`.bre-model-row` in `../styles.ts`), and a class borrowed onto
 * the host's grid would drag that row's `padding`, `gap`, `min-height` and
 * hover fill along with it.
 */
const MODEL_ROW_CLASS = 'bre-model-grid'

/** Per-scan bookkeeping (one instance lives in `models-page.ts`). */
export type ModelOrderState = DragState

export interface ModelOrderDeps {
  /** The plugin's own translator, for the grip's label and tooltip. */
  t: (key: string, params?: Record<string, string | number>) => string
  /** The official `settings.models` label sets, resolved fresh on every scan. */
  labels: () => HostLabels
}

export function createModelOrderState(): ModelOrderState {
  return createDragState()
}

/**
 * Every model list under `root`.
 *
 * Probed by class-name fragment, like the official anchors elsewhere: the
 * bundle's names are CSS-module hashes. The fragment alone is too loose —
 * `modelListHead` and any future sibling share it — so a hit only counts when
 * its DIRECT children are the model entries, which is what the official
 * `.modelList { display: flex; flex-direction: column; gap: 8px }` lays out.
 */
export function modelListsOf(root: HTMLElement): HTMLElement[] {
  const lists: HTMLElement[] = []
  for (const hit of Array.from(root.querySelectorAll<HTMLElement>('[class*="modelList"]'))) {
    const entries = rowElements(hit).filter(child => child.matches('[class*="modelEntry"]'))
    if (entries.length === 0) continue
    lists.push(hit)
  }
  return lists
}

/**
 * Whether a mutation burst added or removed model ROWS.
 *
 * The official editor keys its model rows by ARRAY INDEX (`models.map((model,
 * index) => <ModelRow ... />, index)`), so deleting one model commits as the
 * LAST row element leaving the list and every row after the deleted one
 * swapping its contents INSIDE its existing element. Those elements keep the
 * CSS `order` this module wrote for the model that moved out of them: the
 * list paints its tail shifted into the wrong slots, and re-sorts itself
 * when the debounced scan finally corrects the order a frame or more later —
 * the "delete one model and the whole list flashes" report. The observer
 * answers that burst with an order pass in its own microtask, before the
 * first painted frame; the same reasoning that made the tab pass synchronous.
 */
export function modelListMutation(records: readonly MutationRecord[]): boolean {
  for (const record of records) {
    if (record.type !== 'childList') continue
    // The list itself gaining or losing a row — the host's own add/remove.
    // (`modelListsOf`'s direct-children check also excludes the head, whose
    // class shares the `modelList` fragment.)
    const target = record.target
    if (target instanceof HTMLElement
      && target.matches('[class*="modelList"]')
      && rowElements(target).some(child => child.matches('[class*="modelEntry"]'))) return true
    // Or one of the changed nodes being a row: the list check misses the
    // removal that empties the list, and the node check reaches an add whose
    // record names the entry directly.
    for (const nodes of [record.addedNodes, record.removedNodes]) {
      for (const node of Array.from(nodes)) {
        if (node instanceof HTMLElement && node.matches('[class*="modelEntry"]')) return true
      }
    }
  }
  return false
}

/** The model id this module stamped on an entry, if any. */
function modelIdOf(entry: HTMLElement): string | undefined {
  const value = entry.getAttribute(ROW_ID_ATTR)
  return value === null || value.length === 0 ? undefined : value
}

/** The provider whose editor holds `list` — the key its models' order is stored under. */
function providerOfList(list: HTMLElement, deps: ModelOrderDeps): string | undefined {
  const row = list.closest('li')
  if (row === null) return undefined
  return providerIdOfRow(row, deps.labels())
}

/** What the user sees for one model: its display name, else its id. */
function modelLabelOf(entry: HTMLElement, deps: ModelOrderDeps): string | undefined {
  const name = inputValueByLabel(entry, deps.labels().modelName)
  if (name.length > 0) return name
  return modelIdOf(entry)
}

/** One model list, as the engine needs to see it. */
function modelAdapter(list: HTMLElement, deps: ModelOrderDeps): DragAdapter {
  return {
    // A model row is the `modelEntry` a descendant belongs to; the engine checks
    // that it really is one of this list's own rows.
    rowOf: (node) => {
      const entry = node.closest('[class*="modelEntry"]')
      return entry instanceof HTMLElement ? entry : undefined
    },
    idOf: modelIdOf,
    labelOf: (entry) => modelLabelOf(entry, deps),
    // Read and write the provider at CALL time: the row this list sits in is the
    // only authority on which sequence applies, and a rescan can move the list
    // to another provider's card.
    order: (ids) => {
      const provider = providerOfList(list, deps)
      return provider === undefined ? ids : resolveModelOrder(provider, ids)
    },
    commit: (target) => {
      const provider = providerOfList(target, deps)
      if (provider === undefined) return
      setModelOrder(provider, orderedIds(target, modelIdOf))
    },
    seatOf: (entry) => entry.querySelector<HTMLElement>('[class*="modelRow"]') ?? undefined,
    // Only the grip drags: the row is a grid of inputs.
    seatDrags: false,
    gripLabel: (entry, id) => deps.t('modelReorderAria', { model: modelLabelOf(entry, deps) ?? id }),
    gripHint: () => deps.t('modelReorderHint'),
    // The official grid is `minmax(0,1.4fr) minmax(0,1fr) auto auto`. The grip
    // becomes a fifth child, so the grid needs a leading track to hold it —
    // added by our own class, because the official rule is a single class
    // selector and ours has to win on specificity, not on load order.
    decorate: (_entry, seat) => { seat.classList.add(MODEL_ROW_CLASS) },
  }
}

/**
 * One pass over the page: name every model row in every provider editor, mount a
 * grip in its grid, and place the rows in the order the user stored for that
 * provider.
 *
 * A provider whose id cannot be recovered is skipped whole — reading a sequence
 * that might belong to another provider, or writing one there, is worse than
 * leaving that editor without grips for a scan.
 */
export function reconcileModelOrder(
  root: HTMLElement,
  deps: ModelOrderDeps,
  state: ModelOrderState,
): void {
  if (!root.isConnected) return
  const labels = deps.labels()
  for (const list of modelListsOf(root)) {
    if (providerOfList(list, deps) === undefined) continue
    // Name the rows before the engine looks at them: a row with a blank id input
    // has no name, gets no grip, and is never moved.
    for (const entry of rowElements(list)) {
      const id = inputValueByLabel(entry, labels.modelId)
      if (id.length === 0) {
        entry.removeAttribute(ROW_ID_ATTR)
        continue
      }
      if (modelIdOf(entry) !== id) entry.setAttribute(ROW_ID_ATTR, id)
    }
    reconcileRows(root, list, modelAdapter(list, deps), state)
  }
}

/**
 * Undo everything this module put on the page. A plugin disable or an HMR
 * replace unmounts React trees on its own, but the grips, the widened grids and
 * the stamps are raw DOM: left behind, a grip would keep reordering rows — and
 * persisting that order — on behalf of a fiber that no longer exists.
 */
export function teardownModelOrder(state: ModelOrderState): void {
  teardownDrags(state)
  for (const seat of Array.from(document.querySelectorAll<HTMLElement>(`.${MODEL_ROW_CLASS}`))) {
    seat.classList.remove(MODEL_ROW_CLASS)
  }
  const stamped = Array.from(document.querySelectorAll<HTMLElement>(`[${ROW_ID_ATTR}]`))
  clearRowOrder(stamped)
  for (const entry of stamped) entry.removeAttribute(ROW_ID_ATTR)
}

/** The stored sequence for one provider, for callers that only need to read it. */
export function storedModelOrder(provider: string): readonly string[] {
  return modelOrderOf(provider)
}
