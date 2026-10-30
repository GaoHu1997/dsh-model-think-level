import { PLUGIN_ID } from '../../constants.js'

/** Host-owned anchors, including older hosts that render model rows without cards. */
const MODELS_ANCHOR = [
  '[class*="rowCard"]', '[class*="setupCard"]', '[class*="addCard"]',
  '[class*="modelEntry"]', '[class*="modelAdvanced"]', '[class*="modelList"]',
  '[class*="addBlock"]', 'p[class*="savedNotice"]',
].join(',')

/** Only genuinely foreign roots: never bre-tabbed/model-grid/key-field, which wrap host DOM. */
const OWN_ROOT = [
  `[data-plugin="${PLUGIN_ID}"]`, '.bre-effort-slot', '.bre-keys-host',
  '.bre-create-host', '.bre-editor-tabs', '.bre-provider-balance',
  '.bre-auto-effort', '.bre-auto-effort-note', '.bre-config-host',
  '.bre-drag-ghost', '.bre-drop-line', '.bre-drag-grip', '.bre-provider-switch',
].join(',')

function elementOf(node: Node): Element | null {
  return node.nodeType === Node.ELEMENT_NODE ? node as Element : node.parentElement
}

function owned(node: Node): boolean {
  const element = elementOf(node)
  return element !== null && element.closest(OWN_ROOT) !== null
}

function carriesModels(node: Node): boolean {
  if (node.nodeType !== Node.ELEMENT_NODE) return false
  const element = node as Element
  if (owned(element)) return false
  return element.matches(MODELS_ANCHOR) || element.querySelector(MODELS_ANCHOR) !== null
}

/**
 * Chat streaming and foreign-root renders must not wake every Models-page seam.
 * Inspect the mutation's subtree, not document.body. Removed subtrees are kept
 * in the records too, so navigation away still releases page-opening sessions.
 */
export function modelsPageMutation(records: readonly MutationRecord[]): boolean {
  return records.some(record => {
    if (owned(record.target)) return false
    const target = elementOf(record.target)
    if (record.type === 'childList') {
      const changed = [...Array.from(record.addedNodes), ...Array.from(record.removedNodes)]
      // A React commit inside a foreign root (or insertion of one into a host
      // disclosure) doesn't change the host anchors. Don't feed it back into a scan.
      if (changed.length > 0 && changed.every(owned)) return false
      if (target !== null && target.closest(MODELS_ANCHOR) !== null) return true
      return changed.some(carriesModels)
    }
    if (target !== null && target.closest(MODELS_ANCHOR) !== null) return true
    // `hidden` may flip on an ancestor of the page/create card.
    return record.type === 'attributes' && carriesModels(record.target)
  })
}
