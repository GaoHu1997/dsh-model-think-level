/**
 * The Models-page DOM injection.
 *
 * Owns the document-wide MutationObserver, the debounced scan, the retry
 * backoff, the editor mounts, the host-label anchors and the ledger teardown.
 * The scan itself is `reconcile()` from the editor injector; this module is the
 * wiring and the lifecycle around it.
 *
 * The composer path is NOT this module's business: the caller hands `start()`
 * a synchronous hook that runs on every mutation burst BEFORE the debounced
 * scan, because the composer body must land before the first paint while the
 * settings-page scan does heavy wire reads.
 *
 * @module dsh-model-think-level/client/injection/models-page
 */

import { createElement } from 'react'
import type { ReactNode } from 'react'
import { createRoot } from 'react-dom/client'
import type { Translate } from '@deepseek-ai/dsh-client-ui-slots'
import { PLUGIN_ID } from '../../constants.js'
import { EffortEditor } from '../EffortEditor.tsx'
import {
  createScanState, flushOnTeardown, flushOnUnload, reconcile,
  type HostLabels, type InjectorDeps, type ScanState,
} from './models-page-editor.js'
import { describeNamespace } from '../ops.ts'
import type { ClientContext, RemoteApi } from '../types.js'
import { EffortBoundary, panelRoot } from './mount.js'
import {
  createEditorTabsState,
  reconcileEditorTabs,
  teardownEditorTabs,
  type EditorTabsDeps,
} from './editor-tabs.js'
import {
  createProviderOrderState,
  reconcileProviderOrder,
  teardownProviderOrder,
  type ProviderOrderDeps,
} from './provider-order-drag.js'
import {
  createProviderToggleState,
  reconcileProviderEnabled,
  teardownProviderEnabled,
  type ProviderToggleDeps,
} from './provider-toggle.js'
import {
  reconcileProviderDeleteSeat,
  teardownProviderDeleteSeats,
  type ProviderDeleteDeps,
} from './provider-delete-seat.js'
import { teardownAutoEffortSeats } from './auto-effort-seat.js'
import {
  createModelOrderState,
  modelListMutation,
  reconcileModelOrder,
  teardownModelOrder,
  type ModelOrderDeps,
} from './model-order-drag.js'

/** Dictionary namespace owning the Models page's copy (ui-settings-models). */
const HOST_MODELS_NS = 'settings.models'

/**
 * The official Models-page controls this plugin anchors to, as
 * (dictionary key, English copy) pairs — the English copy is both the anchor
 * for a host that ships no such namespace and the language the host itself
 * falls back to, so it stays valid in every configuration. Resolved through
 * the host's own dictionary so a third language (or a late language pack)
 * relabels the page and the anchors together.
 */
const HOST_LABEL_KEYS = {
  // The disclosure copy was renamed `Capacities`/`容量` → `Model options`/
  // `模型选项` in 0.1.6-alpha.2, so the no-dictionary fallback carries BOTH
  // English labels (newest first). The dictionary key resolves first on every
  // host that ships one.
  capacity: ['modelAdvanced', 'Model options', 'Capacities'],
  modelId: ['modelId', 'Model ID'],
  modelName: ['modelName', 'Display name'],
  routeId: ['customRoute', 'Provider ID'],
  baseUrl: ['baseUrl', 'Base URL'],
  apiProtocol: ['customApi', 'API protocol'],
  // The editing card's action row. `apply` is the commit (en 'Apply' / zh
  // '保存'), `cancel` the dismiss; the busy copy is 'applying' and needs no
  // anchor of its own: the button keeps its position in the row.
  apply: ['apply', 'Apply'],
  cancel: ['cancel', 'Cancel'],
  // A provider row's edit button. The row order pass reads the provider id out
  // of this label's `{provider}` slot for every row this plugin gets no seat in
  // (the DeepSeek rows), so the template must be resolved in the page's own
  // language rather than assumed.
  editProvider: ['editProvider', 'Edit {provider}'],
} as const satisfies Record<keyof HostLabels, readonly [string, string, ...string[]]>

/** What the Models-page injection needs from its host. */
export interface ModelsPageDeps {
  /** The client root context. */
  ctx: ClientContext
  /** The settings remote the editors read and write through. */
  api: RemoteApi
  /** The plugin's locale-bound translator. */
  t: Translate
  /** Run once per idle pass, after everything the session held back landed. */
  onIdle: () => void
  /** Wrap a subtree so it re-translates on a language switch. */
  refreshed: (children: () => ReactNode) => ReactNode
}

/** The Models-page injection's face. */
export interface ModelsPageInjection {
  /** The live scan state (the ledger teardown drains it). */
  readonly state: ScanState
  /** The host label anchors in the host's ACTIVE language. */
  labels: () => HostLabels
  /**
   * Begin observing. `onComposerMutation` runs synchronously on every mutation
   * burst, before the debounced scan.
   */
  start: (onComposerMutation: () => void) => void
  /** Disconnect the observer, cancel pending timers, stop the scan chain. */
  stopObserver: () => void
  /** Land the held writes and unmount every editor; the fiber is going away. */
  teardown: () => void
  /** Land only the committed writes and discard the rest (page unload). */
  flushOnUnload: () => void
  /** Force a rescan (document update, connection reset, preference flip). */
  schedule: () => void
}

/**
 * Build the Models-page injection.
 * @param deps - context, settings remote, copy, idle hook and locale refresh.
 * @returns the injection's {@link ModelsPageInjection} face.
 */
export function createModelsPage(deps: ModelsPageDeps): ModelsPageInjection {
  const { ctx, api, t, onIdle, refreshed } = deps

  /**
   * The official controls' aria-labels in the host's ACTIVE language.
   *
   * A thunk, never a cached value: the host renders those labels from its own
   * dictionary through its own fallback chain, so re-reading per scan is what
   * keeps a language switch (or a late language pack) from stranding the
   * anchors on words the page no longer prints.
   */
  const labels = (): HostLabels => {
    const translate = ctx.locale.bind(HOST_MODELS_NS) as (key: string) => string
    const resolve = ([key, ...fallbacks]: readonly [string, string, ...string[]]): readonly string[] => {
      const value = translate(key)
      // A host with no such namespace makes translate() echo the key back.
      return value === key || value.trim() === '' ? fallbacks : [value, ...fallbacks]
    }
    return {
      capacity: resolve(HOST_LABEL_KEYS.capacity),
      modelId: resolve(HOST_LABEL_KEYS.modelId),
      modelName: resolve(HOST_LABEL_KEYS.modelName),
      routeId: resolve(HOST_LABEL_KEYS.routeId),
      baseUrl: resolve(HOST_LABEL_KEYS.baseUrl),
      apiProtocol: resolve(HOST_LABEL_KEYS.apiProtocol),
      apply: resolve(HOST_LABEL_KEYS.apply),
      cancel: resolve(HOST_LABEL_KEYS.cancel),
      editProvider: resolve(HOST_LABEL_KEYS.editProvider),
    }
  }

  /** Debounce window for DOM-mutation scans (one scan per render burst). */
  const SCAN_DEBOUNCE_MS = 120
  const scanState = createScanState()
  const providerOrderState = createProviderOrderState()
  const providerOrderDeps: ProviderOrderDeps = { t, labels }
  const providerToggleState = createProviderToggleState()
  const providerToggleDeps: ProviderToggleDeps = { t, labels }
  // No per-scan state: the seat IS the DOM node, and the pass is idempotent by
  // its presence, so nothing has to be remembered between scans.
  const providerDeleteDeps: ProviderDeleteDeps = { t, labels }
  const modelOrderState = createModelOrderState()
  const modelOrderDeps: ModelOrderDeps = { t, labels }
  const editorTabsState = createEditorTabsState()
  const editorTabsDeps: EditorTabsDeps = { t }
  let scanTimer: number | undefined
  let retryTimer: number | undefined
  let observer: MutationObserver | undefined
  let composerMutation: (() => void) | undefined
  // Set on dispose. An idle pass already in flight can still call onBackoff
  // after stopObserver cleared the timer; without this gate that would re-arm
  // a retry timer on a dead fiber, restarting the scan chain (and re-mounting
  // editors nothing will ever unmount).
  let stopped = false

  /**
   * The injector's dependencies, built ONCE outside the debounced scan: the
   * teardown path (plugin dispose, page unload) drains the ledgers through the
   * very same seam a live scan uses, so a landing write can never take a
   * different path than an in-session one.
   */
  const injectorDeps: InjectorDeps = {
    api,
    describeNamespace: () => describeNamespace(api),
    t,
    labels,
    // The idle pass landed everything the session held back; the caller's
    // complement rides the same moment.
    onIdle,
    // A refused held write arms a backoff; nothing on a settled page would
    // schedule the retry scan, so the injector asks for a timer.
    onBackoff: (delayMs) => { scheduleRetry(delayMs) },
    mount(container, props) {
      const rootEl = document.createElement('div')
      // The slot class carries the grid-column span: this wrapper — not
      // the React editor inside it — is the item the official disclosure
      // grid places (see STYLES).
      rootEl.className = 'bre-effort-slot'
      // Mark the container synchronously — before React renders — so the
      // idempotency guard (hasEditor) holds from the very first scan.
      // Without this, the appendChild-triggered MutationObserver scan can
      // run while React's async render has not produced the editor div
      // yet, misjudge the row as unmounted, and mount again — an infinite
      // loop that grows the container without bound.
      rootEl.dataset['plugin'] = PLUGIN_ID
      container.appendChild(rootEl)
      const reactRoot = createRoot(rootEl)
      const renderEditor = (p: typeof props): void => {
        reactRoot.render(createElement(
          EffortBoundary,
          {
            fallbackText: t('renderFailed'),
            // Same seat as the composer bodies: without the locale
            // subscription a language switch re-renders the official page
            // but not this editor — sameProps compares only document data,
            // so the copy would stay in the language it rendered in.
            children: refreshed(() => createElement(EffortEditor, p)),
          },
        ))
      }
      renderEditor(props)
      return {
        unmount: () => { reactRoot.unmount() },
        render: renderEditor,
      }
    },
  }

  /**
   * Wake the injector when a failed idle pass's backoff expires: a settled
   * settings page emits no DOM mutation, so without this the held intent would
   * wait for a scan that never comes. One timer at a time; the fired timer
   * re-runs the scan, which re-arms the next backoff if the write is refused.
   */
  function scheduleRetry(delayMs: number): void {
    if (stopped || retryTimer !== undefined) return
    retryTimer = window.setTimeout(() => {
      retryTimer = undefined
      schedule()
    }, delayMs)
  }

  function schedule(): void {
    if (stopped || scanTimer !== undefined) return
    // Debounce: the official page re-renders in bursts (typing, expanding,
    // applying); one scan per frame keeps the editor stable mid-keystroke.
    scanTimer = window.setTimeout(() => {
      scanTimer = undefined
      // The composer path rides along: the debounced scan is the only thing
      // that covers the paths no mutation carries — apply boot and a slider
      // preference flip.
      composerMutation?.()
      reconcile(panelRoot(), injectorDeps, scanState)
      // The tab pass rides the settled scan as well, after the editor injector
      // has stocked the open card. Its reactive path is the observer above; this
      // one covers the paths no mutation carries — a boot over an editor that
      // is already open, and a retry whose scan re-arms without a re-render.
      // Its own writes are guarded, so no scan ever chases its own tail.
      reconcileEditorTabs(panelRoot(), editorTabsDeps, editorTabsState)
      // The row order pass rides the same scan but NOT the editor reconcile:
      // `reconcile` bails out whenever no editing card is open, and the
      // provider rows are on the page precisely when nothing is being edited.
      reconcileProviderOrder(panelRoot(), providerOrderDeps, providerOrderState)
      // The switch pass follows the order pass: it reads the same row ids, and
      // it must see the rows where that pass left them.
      reconcileProviderEnabled(panelRoot(), providerToggleDeps, providerToggleState)
      // The delete seat follows the switch pass: it reads the same rows, and it
      // fills the hole the host leaves in an unremovable row's action group.
      reconcileProviderDeleteSeat(panelRoot(), providerDeleteDeps)
      // The model pass comes last and covers a different list entirely: the
      // model rows inside whichever provider editor is open. Its own lists are
      // absent unless a card is expanded, so it no-ops on a collapsed page.
      reconcileModelOrder(panelRoot(), modelOrderDeps, modelOrderState)
    }, SCAN_DEBOUNCE_MS)
  }

  const start = (onComposerMutation: () => void): void => {
    if (stopped || observer !== undefined) return
    composerMutation = onComposerMutation
    // A session may already be resident when the fiber starts (page reload,
    // HMR): wire it before the first mutation has a chance to land.
    onComposerMutation()
    observer = new MutationObserver((records) => {
      // The composer path runs SYNCHRONOUSLY on the mutation microtask: the
      // React commit that opens the menu and this callback are delivered
      // before the browser's next paint, so the FIRST painted frame already
      // carries the replicated popover — the official menu never flashes and
      // is never "covered". The settings-page editor/toggle reconciles stay
      // debounced below (they do heavy wire reads).
      // The effort-memory wiring leads the callback for the same reason: a
      // session switch lands as a DOM mutation, and the new session's
      // directory must be watched before its projection can read as Default.
      onComposerMutation()
      // The tab pass runs HERE too, synchronously, for the same reason: it is
      // pure DOM work (attribute writes, no wire reads), and it must land in
      // the microtask that carries the official commit. Deferred to the
      // debounced scan below, the opened editor would paint as the official
      // one long column and then visibly re-sort itself a frame or more later
      // — the "click Edit and the tabbed editor flickers in" report.
      reconcileEditorTabs(panelRoot(), editorTabsDeps, editorTabsState)
      // And the model order pass joins the synchronous pair for exactly one
      // kind of burst: the host adding or removing a model row. The official
      // list keys its rows by array index, so a deletion re-fills the
      // surviving elements with the next models' contents while they still
      // carry the CSS `order` of the model that moved out of them — deferred
      // to the debounced scan below, the whole tail of the list paints
      // scrambled and then re-sorts itself: the "delete one model and the
      // list flashes" report. This pass is pure DOM work too (id re-stamps,
      // grip copy, order writes — no wire reads), so it lands before the
      // first painted frame. The debounced scan runs it again a moment later
      // and the pass is idempotent, so nothing else shifts.
      if (modelListMutation(records)) {
        reconcileModelOrder(panelRoot(), modelOrderDeps, modelOrderState)
      }
      schedule()
    })
    observer.observe(document.body, { childList: true, subtree: true })
    schedule()
  }

  const stopObserver = (): void => {
    stopped = true
    if (scanTimer !== undefined) {
      window.clearTimeout(scanTimer)
      scanTimer = undefined
    }
    if (retryTimer !== undefined) {
      window.clearTimeout(retryTimer)
      retryTimer = undefined
    }
    observer?.disconnect()
    observer = undefined
  }

  const teardown = (): void => {
    stopObserver()
    // Land what the session held back before the fiber goes away: a plugin
    // disable or HMR must not strand the user's intent in memory alone. The
    // ledgers stay in sessionStorage WITH their commit evidence, so the next
    // fiber in this document retries a flush the runtime cut short.
    flushOnTeardown(scanState, injectorDeps)
    // Orphaned editors must not outlive the fiber: on plugin disable or HMR
    // they would keep rendering with a stale api face, failing every write
    // visibly. Unmount every React root this plugin created.
    for (const [, entry] of scanState.mounted) entry.editor.unmount()
    scanState.mounted.clear()
    // The grips are raw DOM this plugin owns inside the official page: leaving
    // them behind would keep a dead fiber's listeners live on a live page.
    teardownProviderOrder(providerOrderState)
    // Same for the enable switches: a live listener on a dead fiber would keep
    // toggling providers the user can no longer see the state of.
    teardownProviderEnabled()
    // The delete seats are raw DOM as well, and they stand for a control the
    // page owns: a dead fiber must not leave a row reading as unavailable.
    teardownProviderDeleteSeats()
    // And for the auto-adapt seats: raw DOM this plugin put in the official
    // catalogue head, which a dead fiber must not leave clickable-looking.
    teardownAutoEffortSeats()
    // And for the model grips inside an open editor, whose own lists live
    // outside the provider rows' seat.
    teardownModelOrder(modelOrderState)
    // And for the editor tabs: the bar and the region tags are raw DOM and
    // attributes this plugin owns inside the official card — a dead fiber must
    // not leave the page keyed to tabs nothing maintains anymore.
    teardownEditorTabs()
  }

  const flushOnUnloadNow = (): void => { flushOnUnload(scanState, injectorDeps) }

  return {
    state: scanState,
    labels,
    start,
    stopObserver,
    teardown,
    flushOnUnload: flushOnUnloadNow,
    schedule,
  }
}
