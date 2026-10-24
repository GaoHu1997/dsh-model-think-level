/**
 * The composer model menu injection: the reasoning-effort slider AND the model
 * search box, both mounted inside the OFFICIAL model menu opened from the
 * bottom-right seat. The official menu body remains host-owned apart from the
 * replicated rows; its trigger keeps its own children and receives only a
 * provider prefix through a plugin-owned data attribute.
 *
 * This module is the single place that decides which pane the menu is showing,
 * where each foreign body sits, and when each one retires. The pane probes look
 * alike but answer different questions, and must NOT be merged:
 *
 *   - the surface probe — `role="group"` — asks "did the popover OPEN in the
 *     model list pane?". Upstream sets the surface role from the pane it shows
 *     (`role: pane === "model" ? "group" : "menu"`) and opens straight into the
 *     list whenever it cannot name the session's current model
 *     (`currentChoice === void 0`). That is the HISTORICAL-session shape — the
 *     saved selection no longer resolves in today's catalog, or the session's
 *     projection had not landed when the popover was first opened. This plugin
 *     owns that pane too, so those sessions get the replica switcher instead of
 *     the bare official list they used to be left with.
 *   - the slider's retire probe — `[role="menuitemradio"]` outside our own
 *     wrapper — asks "did the official drill-in replace my replica body?". It
 *     only governs surfaces that still carry `role="menu"` (the root pane and
 *     the effort pane on kernels that keep one role for every pane).
 *   - the search's probe — `section[role="group"]` — asks "is there a
 *     filterable model list here?". The effort pane has no groups, so a
 *     role-based probe would mount a search box over a list it cannot filter.
 *     It is skipped entirely on a surface upstream opened in its model-list
 *     pane: that pane already carries the host's own search row, so a second
 *     box would only duplicate it (and filter a list the replica replaced).
 *
 * @module dsh-model-think-level/client/injection/composer-menu
 */

import { createElement } from 'react'
import { flushSync } from 'react-dom'
import type { ReactNode } from 'react'
import type { Translate } from '@deepseek-ai/dsh-client-ui-slots'
import { PLUGIN_ID } from '../../constants.js'
import { ComposerSlider, providerLabelOf } from '../ComposerSlider.js'
import { ModelSearch, isModelPane } from '../ModelSearch.js'
import type { ConfiguredInputs } from '../configured-inputs.js'
import type { ModelDirectoryLike } from '../types.js'
import { EffortBoundary, mountReact, unmountReact, type ForeignMount } from './mount.js'
import { isDrilledModelPane } from './model-menu.js'

/** Everything the composer injection needs from its host. */
export interface ComposerMenuDeps {
  /** The official menu element, or undefined while it is closed. */
  menuOf: () => HTMLElement | undefined
  /** The official model trigger, present even while the menu is closed. */
  triggerOf: () => HTMLElement | undefined
  /** The plugin's locale-bound translator. */
  t: Translate
  /** Wrap a subtree so it re-translates on a language switch. */
  refreshed: (children: () => ReactNode) => ReactNode
  /** Whether the composer slider preference is on. */
  sliderEnabled: () => boolean
  /** The current session's model directory, or undefined in the boot window. */
  directory: () => ModelDirectoryLike | undefined
  /** Saved input declarations, independent of the host catalog projection. */
  configuredInputs?: ConfiguredInputs
}

/** The composer injection's face: one reconcile per scan, one dispose per fiber. */
export interface ComposerMenuInjection {
  /** Mount/reposition/retire both foreign roots (idempotent, mutation-cheap). */
  reconcile: () => void
  /** Unmount both roots; the fiber is going away. */
  dispose: () => void
}

/**
 * Re-run the official placement inside the CURRENT frame.
 *
 * The card anchors itself in a layout effect (ModelSelect.tsx:163-188) that
 * runs BEFORE this module's MutationObserver injection, so its `top` is
 * computed from the PRE-injection height: the slider replica is still shown
 * and the search box not yet mounted, which floated the card ~56px above the
 * trigger. Both edits are done synchronously by the callers (the injected
 * roots commit inside `flushSync`, the replica is hidden inline), so this
 * flushSync-wrapped `resize` lets the official `place()` re-measure and commit
 * BEFORE the browser paints — no intermediate frame is ever shown. Waiting for
 * a later frame (the previous implementation) is exactly what made the menu
 * visibly jump.
 *
 * Only the official effect ever writes the card's position: this module still
 * adds no class and no inline style of its own.
 *
 * COUPLING (deliberate, and the reason there is no geometry code here): this
 * works only because the official card re-runs its `place()` on a window
 * `resize` and commits the result through React state. A kernel that switches
 * to `requestAnimationFrame` placement or writes the position outside React
 * would leave this a no-op — the menu would keep the pre-injection `top`
 * instead of jumping, i.e. it would degrade back to the mis-anchored (not
 * broken) state the earlier fixes describe, never to a crash.
 */
const rePlaceInFrame = (): void => {
  flushSync(() => { window.dispatchEvent(new Event('resize')) })
}

/**
 * Build the composer menu injection.
 * @param deps - menu lookup, copy, locale refresh, preference and directory.
 * @returns the injection's {@link ComposerMenuInjection} face.
 */
export function createComposerMenu(deps: ComposerMenuDeps): ComposerMenuInjection {
  const { menuOf, triggerOf, t, refreshed, sliderEnabled, directory } = deps
  let sliderMount: ForeignMount | undefined
  let searchMount: ForeignMount | undefined
  let lastModelPane: boolean | undefined
  let lastOwnedSurface: boolean | undefined
  let triggerDirectory: ModelDirectoryLike | undefined
  let triggerUnsubscribe: (() => void) | undefined
  let decoratedTrigger: HTMLElement | undefined

  const clearTriggerDecoration = (): void => {
    decoratedTrigger?.removeAttribute('data-bre-provider')
    decoratedTrigger = undefined
  }

  /** Update the provider prefix without changing the host-owned trigger children. */
  const updateTriggerDecoration = (): void => {
    const trigger = triggerOf()
    if (decoratedTrigger !== undefined && decoratedTrigger !== trigger) {
      clearTriggerDecoration()
    }
    const state = triggerDirectory?.store.getSnapshot()
    const current = state?.current
    if (trigger === undefined || current === null || current === undefined) {
      if (trigger === decoratedTrigger) clearTriggerDecoration()
      return
    }
    const group = state?.groups.find(candidate => candidate.id === current.provider)
    const provider = group === undefined ? current.provider : providerLabelOf(group)
    if (provider.trim() === '') {
      if (trigger === decoratedTrigger) clearTriggerDecoration()
      return
    }
    trigger.dataset['breProvider'] = provider
    decoratedTrigger = trigger
  }

  /** Follow whichever session directory the official composer currently owns. */
  const syncTriggerDirectory = (): void => {
    const next = directory()
    if (next !== triggerDirectory) {
      triggerUnsubscribe?.()
      triggerUnsubscribe = undefined
      triggerDirectory = next
      if (next !== undefined) triggerUnsubscribe = next.store.subscribe(updateTriggerDecoration)
    }
    updateTriggerDecoration()
  }

  const unmountSearch = (): void => {
    unmountReact(searchMount)
    searchMount = undefined
  }

  /**
   * The official children this module hid while it owned the popover surface,
   * with the inline `display` each of them had before. Restoring the RECORDED
   * value (instead of a bare `''`) keeps a host-owned inline display intact,
   * and keeping the record per node makes the hide/restore cycle idempotent
   * across the many reconcile passes an open menu receives.
   */
  const hidOfficial = new Map<HTMLElement, string>()

  /** Put back every official child this module hid (idempotent). */
  const restoreOfficialBody = (): void => {
    for (const [node, display] of hidOfficial) node.style.display = display
    hidOfficial.clear()
  }

  /**
   * Whether a child of the surface is the shell's MATERIAL layer rather than
   * pane content.
   *
   * `MenuSurface` renders the popover's fill and backdrop blur into an
   * `aria-hidden="true"`, empty FIRST child (its `--dsw-menu-surface-fill`
   * background plus `backdrop-filter: var(--dsw-menu-backdrop-filter)`, both
   * behind `z-index: -1`). It is chrome, not body: taking it down with the
   * official list leaves a popover with NO background at all — the chat behind
   * it reads straight through the panel, because the fill itself is only ~58%
   * opaque and the blur is what makes it look solid. Structure is the identity
   * here (the class name is a CSS-module hash), and an empty `aria-hidden`
   * element is exactly what the shell paints into.
   */
  const isSurfaceMaterial = (el: HTMLElement): boolean => {
    if (el.getAttribute('aria-hidden') !== 'true') return false
    if (el.childElementCount > 0) return false
    return (el.textContent ?? '').trim() === ''
  }

  /**
   * Hide the official pane body a surface this plugin took over would duplicate.
   *
   * Upstream renders the whole model list — its own search row, load notices
   * and the provider `section[role="group"]` blocks — into the SAME popover
   * that hosts the replica. When upstream opens in that pane (a HISTORICAL
   * session, see {@link isDrilledModelPane}), the replica's two rows ARE the
   * switcher, so the list behind them is hidden rather than shown twice.
   *
   * Node identity is what gets recorded, because a React re-render replaces
   * these children: disconnected records are pruned first, and the fresh nodes
   * are hidden by the next pass (every re-render is a DOM mutation, and every
   * mutation re-enters this module).
   */
  const hideOfficialBody = (menu: HTMLElement, wrapper: HTMLElement): void => {
    for (const node of Array.from(hidOfficial.keys())) {
      if (!node.isConnected || node.parentElement !== menu) hidOfficial.delete(node)
    }
    const targets: HTMLElement[] = []
    for (const el of Array.from(menu.children)) {
      if (el === wrapper) continue
      // Never the menu's own material layer: see {@link isSurfaceMaterial}.
      // Hiding it blanks the panel instead of removing a duplicate list.
      if (isSurfaceMaterial(el as HTMLElement)) continue
      targets.push(el as HTMLElement)
    }
    // Upstream focuses its own search input (or a row) when it opens in this
    // pane, so the node about to disappear can BE the active element. A focused
    // element that becomes display:none drops focus to <body>, and the shell
    // reads that as "focus left the seat" and closes the menu instantly — the
    // flash-out issue #13 describes. Hand focus to the card FIRST (tabindex -1:
    // no Tab stop, no focus ring), keeping it inside the seat; Tab then reaches
    // the replica's rows.
    const active = document.activeElement
    if (active !== null && active !== wrapper && !wrapper.contains(active)) {
      if (targets.some(node => node.contains(active))) {
        menu.tabIndex = -1
        menu.focus({ preventScroll: true })
      }
    }
    for (const node of targets) {
      if (!hidOfficial.has(node)) hidOfficial.set(node, node.style.display)
      if (node.style.display !== 'none') node.style.display = 'none'
    }
  }

  /**
   * Reconcile the search box into the official model menu (idempotent).
   *
   * Deliberately NO class on the menu and NO width/height of our own: the
   * official card measures itself in a layout effect whose deps
   * ([open, pane, state], ModelSelect.tsx:163-188) a later injection cannot
   * invalidate, so any resize from here would leave the card anchored to its
   * pre-injection height (and no longer right-aligned with its trigger). The
   * official box already caps itself (max-height) and scrolls its groups
   * container, so it needs no help.
   */
  const reconcileSearch = (menu: HTMLElement): void => {
    // Positioned from STRUCTURE, not class names: the group sections' parent
    // IS the official scrolling container, while the `groups` class on it is a
    // CSS-module hash (`Uc5hea_groups`) that a literal `.groups` selector never
    // matches. Inserting before that container keeps the official load notices
    // on top and leaves the slider wrapper as the menu's first child.
    const group = menu.querySelector<HTMLElement>('section[role="group"]')
    const container = group?.parentElement
    const referenceNode = (container !== null && container !== undefined && container.parentElement === menu)
      ? container
      : group

    if (searchMount === undefined) {
      const wrapper = document.createElement('div')
      wrapper.dataset['plugin'] = PLUGIN_ID
      wrapper.dataset['breSearch'] = '1'
      menu.insertBefore(wrapper, referenceNode)
      searchMount = mountReact(
        wrapper,
        createElement(EffortBoundary, {
          fallbackText: t('modelSearchFailed'),
          children: refreshed(() => createElement(ModelSearch, { menu, t })),
        }),
        // Sync: the card is measured right after this, so the input must
        // already contribute its height (see rePlaceInFrame).
        { sync: true },
      )
      return
    }
    if (searchMount.wrapper.parentElement !== menu) {
      menu.insertBefore(searchMount.wrapper, referenceNode)
      return
    }
    if (referenceNode !== null && searchMount.wrapper.nextSibling !== referenceNode) {
      menu.insertBefore(searchMount.wrapper, referenceNode)
    }
  }

  /** Reconcile the slider into the official model menu (idempotent). */
  const reconcileSliderInto = (menu: HTMLElement): void => {
    if (!sliderEnabled()) {
      unmountReact(sliderMount)
      sliderMount = undefined
      // The preference flipped off while the menu stayed open: the host menu
      // must go back to the official content-sized box AND its root cells
      // must become visible again (the active branch hides them inline).
      menu.classList.remove('bre-model-menu-host')
      restoreOfficialBody()
      for (const el of Array.from(menu.children)) {
        // Attribute-only probe on purpose: `instanceof HTMLButtonElement` is
        // realm-bound and silently fails when the official card is rendered
        // from another realm (it then never matched, so the root cells stayed
        // hidden after the preference was switched off).
        if (el.getAttribute('role') === 'menuitem') {
          // `menu.children` is an Element collection; the cells are buttons.
          ;(el as HTMLElement).style.display = ''
        }
      }
      return
    }
    const resolved = directory()
    if (resolved === undefined) {
      // Transient boot window only: the seat itself cannot mount before the
      // directory service resolves, so a menu open here is momentary. The
      // next DOM mutation re-enters (the mounted slider keeps its face).
      return
    }
    // React re-renders the menu around a foreign node; keep our wrapper as the
    // menu's FIRST child by re-inserting it whenever a re-render displaced it.
    // The React root survives DOM moves (the fiber tree is position-independent),
    // so a displaced slider is re-attached, never re-created.
    if (sliderMount === undefined) {
      const wrapper = document.createElement('div')
      wrapper.dataset['plugin'] = PLUGIN_ID
      wrapper.dataset['breSlider'] = '1'
      menu.insertBefore(wrapper, menu.firstChild)
      sliderMount = mountReact(wrapper,
        createElement(EffortBoundary, {
          fallbackText: t('renderFailed'),
          children: refreshed(() => createElement(ComposerSlider, {
            directory: resolved,
            configuredInputs: deps.configuredInputs,
            t,
            // The replicated body keeps its columns and level footer ALWAYS
            // visible — no panel opens or closes inside it — so its height is
            // settled once at mount, which this sync commit + the reconcile's
            // rePlaceInFrame (below, on the pane transition) already covers.
          })),
        }),
        // Sync: the replica changes the menu's height, so it must be committed
        // before rePlaceInFrame re-measures (same-frame, no visible jump).
        { sync: true },
      )
    } else if (sliderMount.wrapper.parentElement !== menu || menu.firstChild !== sliderMount.wrapper) {
      menu.insertBefore(sliderMount.wrapper, menu.firstChild)
    }
    // The replicated popover body takes the upstream .re-model-menu box.
    menu.classList.add('bre-model-menu-host')
    // Popover replication rules, mirroring upstream's pane behaviour:
    //  - A surface upstream OPENED IN THE MODEL LIST pane (`role="group"`, see
    //    {@link isDrilledModelPane}) is this plugin's too: the replica's two
    //    rows replace the list, exactly as in a root-pane session. Otherwise a
    //    HISTORICAL session — upstream cannot name its current model, so it
    //    skips the root pane — would keep the official switcher while a new
    //    session shows the replica. Everything upstream rendered into that
    //    surface (its own search row, load notices, the provider sections) is
    //    hidden and restored when this branch is left.
    //  - ROOT pane: our body (slider + separator + model row) IS the content;
    //    the official menu's root cells (role=menuitem direct children —
    //    "Model" and "Effort") are duplicated and hidden. A pane switch
    //    re-creates them and the next scan re-applies.
    //  - Effort-pane drill-in (menuitemradio rows on a role="menu" surface):
    //    upstream shows ONLY the pane, so our body retires while it is open.
    // Known tradeoff (a11y): the official shell's Arrow-key roving focus walks
    // the hidden cells — focus() on a display:none node is a no-op — so
    // keyboard users reach the replica via Tab; the replica row's Enter opens
    // the replica's own provider/model lists, keeping model switching
    // keyboard-reachable.
    const cells = Array.from(menu.children)
      .filter((el): el is HTMLElement => el.getAttribute('role') === 'menuitem')
    // Only a NON-descendant radio counts as the official drill-in. A plain
    // descendant test would be tripped by any menuitemradio the replica itself
    // renders, which would make the replica hide itself. The wrapper is hoisted
    // into a const first: `sliderMount`'s narrowing does not survive into the
    // predicate's closure.
    const wrapper = sliderMount.wrapper
    if (isDrilledModelPane(menu)) {
      wrapper.style.display = ''
      hideOfficialBody(menu, wrapper)
      return
    }
    restoreOfficialBody()
    const officialPane = Array.from(menu.querySelectorAll('[role="menuitemradio"]'))
      .some(el => !wrapper.contains(el))
    if (officialPane) {
      // Focus handoff BEFORE hiding: the replica row (possibly focused) is
      // about to become display:none. Without moving focus first the browser
      // drops it to <body>, the official shell's onBlur reads that as "focus
      // left the seat" and closes the menu instantly — the flash-out that
      // made the model list unusable. The menu itself sits inside the seat
      // root, so focusing it keeps the blur inside (tabindex -1: no Tab
      // stop, no focus ring for programmatic focus).
      if (sliderMount.wrapper.contains(document.activeElement)) {
        menu.tabIndex = -1
        menu.focus({ preventScroll: true })
      }
      sliderMount.wrapper.style.display = 'none'
    } else {
      sliderMount.wrapper.style.display = ''
      for (const cell of cells) cell.style.display = 'none'
    }
  }

  const reconcile = (): void => {
    syncTriggerDirectory()
    const menu = menuOf()
    if (menu === undefined) {
      unmountReact(sliderMount)
      sliderMount = undefined
      unmountSearch()
      lastModelPane = undefined
      lastOwnedSurface = undefined
      restoreOfficialBody()
      return
    }
    // Upstream opened straight into the model list (`role="group"`) AND this
    // plugin's replica is enabled: the replica owns the surface (see
    // reconcileSliderInto), so the official list — and the search box that
    // filters it — must go.
    //
    // On that surface the plugin's own search box is NEVER mounted, owned or
    // not: upstream's model list comes with a search row of its own (it shows
    // one as soon as it has more than a handful of choices), so a mounted
    // replica box would sit directly under the host's and filter nothing while
    // the replica owns the pane. With the replica switched OFF the pane stays
    // upstream's end to end — the host's search box included.
    const drilled = isDrilledModelPane(menu)
    const owned = drilled && sliderEnabled()
    const modelPane = !drilled && isModelPane(menu)
    // The search box is unconditional: it does not follow the slider
    // preference (see the spec's "搜索恒开" decision).
    if (modelPane) reconcileSearch(menu)
    else unmountSearch()

    reconcileSliderInto(menu)

    // A pane switch is exactly when this module rewrites the menu's contents
    // (the slider replica hides, the search box mounts or unmounts, the
    // official list gives way to the replica), so the card's already-computed
    // `top` is stale. Both edits above are synchronous (the roots commit inside
    // flushSync, the replica toggles inline), so the official placement can be
    // re-run in THIS frame — no jump is ever painted. Filtering and scrolling
    // only toggle row visibility and never reach here.
    if (modelPane !== lastModelPane || owned !== lastOwnedSurface) {
      lastModelPane = modelPane
      lastOwnedSurface = owned
      if (modelPane || owned || sliderEnabled()) rePlaceInFrame()
    }
  }

  const dispose = (): void => {
    triggerUnsubscribe?.()
    triggerUnsubscribe = undefined
    triggerDirectory = undefined
    clearTriggerDecoration()
    unmountReact(sliderMount)
    sliderMount = undefined
    unmountSearch()
    // The fiber is going away while the popover may still be open: the host
    // must get its own children back, not a body hidden by a dead injection.
    restoreOfficialBody()
    lastModelPane = undefined
    lastOwnedSurface = undefined
  }

  return { reconcile, dispose }
}
