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
import { flushSync } from 'react-dom'
import { createRoot } from 'react-dom/client'
import type { Translate } from '@deepseek-ai/dsh-client-ui-slots'
import { PLUGIN_ID } from '../../constants.js'
import { EffortEditor } from '../EffortEditor.tsx'
import {
  createScanState, flushOnTeardown, flushOnUnload, hideOfficialReasoning, pinModelListCards, reconcile,
  releaseModelListRepins, showOfficialReasoning, unwatchModelListOffsets, watchModelListOffsets,
  type HostLabels, type InjectorDeps, type ScanState,
} from './models-page-editor.js'
import { teardownProviderEndpoints } from './provider-endpoints.js'
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
  createAddCardState,
  reconcileAddCards,
  teardownAddCards,
  type AddCardDeps,
} from './add-card.js'
import { createStagedHeadersState, flushStagedRequestHeaders } from './staged-headers.js'
import { createStagedKeysState, flushStagedKeys } from './staged-keys.js'
import { httpKeyManagerClient } from '../key-manager-client.js'
import {
  createProviderOrderState,
  reconcileProviderOrder,
  rowsListOf,
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
import {
  createProviderDisabledGroupState,
  reconcileProviderDisabledGroup,
  teardownProviderDisabledGroup,
  type ProviderDisabledGroupDeps,
} from './provider-disabled-group.js'
import { teardownAutoEffortSeats } from './auto-effort-seat.js'
import { reconcileSavedNotice, teardownSavedNotice } from './saved-notice.js'
import { reconcileSettleGuard, teardownSettleGuard } from './settle-guard.js'
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
  // The official input-types control's image choice. Its sibling (`Text`) is
  // never matched: the box this plugin prints a verdict on is the image one.
  inputImage: ['modelInputImage', 'Image'],
  // The disclosure's capacity inputs. Each carries TWO dictionary candidates —
  // the host line has named these fields differently across versions — and both
  // languages' copy as anchors, because the match runs against the wrapping
  // label's text (the inputs themselves carry no aria-label on the DSH host).
  contextWindow: ['modelContextWindow', 'contextWindow', 'Context window', '上下文窗口'],
  maxOutput: ['modelMaxOutput', 'maxOutput', 'maxTokens', 'Max output', '最大输出'],
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
    // Every entry is tried as a dictionary key, in order — the capacity fields
    // below carry TWO candidate keys apiece, because the host line has named
    // them differently across versions. Whatever resolves is pinned first, and
    // every entry stays as a copy anchor, so a host that ships no such
    // namespace (or none of the keys) still matches by its rendered English /
    // Chinese copy. A host without the namespace echoes every key back, which
    // is what keeps this the "no dictionary" fallback of old.
    const resolve = (entries: readonly string[]): readonly string[] => {
      const resolved: string[] = []
      for (const entry of entries) {
        const value = translate(entry)
        if (value !== entry && value.trim() !== '' && !resolved.includes(value)) resolved.push(value)
      }
      if (resolved.length === 0) return entries
      return [...resolved, ...entries.filter(entry => !resolved.includes(entry))]
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
      inputImage: resolve(HOST_LABEL_KEYS.inputImage),
      contextWindow: resolve(HOST_LABEL_KEYS.contextWindow),
      maxOutput: resolve(HOST_LABEL_KEYS.maxOutput),
    }
  }

  /** Debounce window for DOM-mutation scans (one scan per render burst). */
  const SCAN_DEBOUNCE_MS = 120

  /**
   * Gap between scans while a released request-header draft waits for the route
   * its card was still creating when it closed. Deliberately unhurried: the
   * write it is waiting for is the card's own, so a slow second beats a scan
   * storm on a page nobody is touching.
   */
  const DEFERRED_RETRY_MS = 1_000
  const scanState = createScanState()
  const providerOrderState = createProviderOrderState()
  const providerOrderDeps: ProviderOrderDeps = { t, labels }
  const providerToggleState = createProviderToggleState()
  const providerToggleDeps: ProviderToggleDeps = { t, labels }
  // No per-scan state: the seat IS the DOM node, and the pass is idempotent by
  // its presence, so nothing has to be remembered between scans.
  const providerDeleteDeps: ProviderDeleteDeps = { t, labels }
  // The folded group keeps one thing between scans — whether it is unfolded —
  // and that is a session preference, not a stored one (see the module note).
  const providerDisabledState = createProviderDisabledGroupState()
  const providerDisabledDeps: ProviderDisabledGroupDeps = { t, labels }
  const modelOrderState = createModelOrderState()
  const modelOrderDeps: ModelOrderDeps = { t, labels }
  const editorTabsState = createEditorTabsState()
  const editorTabsDeps: EditorTabsDeps = { t }
  // The create-provider card is the one card with two forms; this pass reduces
  // it to the custom one and hangs the pane the official card does not render
  // there. It runs BEFORE the tab pass at every call site, because the half the
  // tab pass may dress is the half this pass decides.
  //
  // That pane edits headers for a route the card's own 保存 has not declared
  // yet, so its drafts wait in the session ledger below until the route shows up
  // in the document — the create landing is the only thing that may trigger the
  // write, and it is also the proof the write is allowed.
  const addCardState = createAddCardState()
  const stagedHeadersState = createStagedHeadersState()
  // The same contract for the card's key list: drafts staged against a route
  // the card has not declared yet, landed by the drain below the moment the
  // create commits.
  const stagedKeysState = createStagedKeysState()
  const addCardDeps: AddCardDeps = {
    t,
    api,
    routeIdLabels: () => labels().routeId,
    staged: stagedHeadersState,
    stagedKeys: stagedKeysState,
    // Same seam the injector mounts its editors through: the pane's copy has to
    // follow a language switch, and a foreign root only hears about one through
    // the locale refresh wrapper.
    refreshed,
  }
  let scanTimer: number | undefined
  let retryTimer: number | undefined
  let observer: MutationObserver | undefined
  let composerMutation: (() => void) | undefined

  /**
   * The early half of the reasoning-control takeover: every disclosure
   * container a mutation burst ADDED has its official reasoning group hidden
   * at once. Runs in the observer's microtask, so the group never reaches a
   * paint; the scan re-asserts the same hide when it mounts the editor.
   */
  const earlyHideOfficialReasoning = (records: readonly MutationRecord[]): void => {
    for (const record of records) {
      for (const node of Array.from(record.addedNodes)) {
        if (!(node instanceof HTMLElement)) continue
        const containers = node.matches('[class*="modelAdvanced"]')
          ? [node]
          : Array.from(node.querySelectorAll<HTMLElement>('[class*="modelAdvanced"]'))
        for (const container of containers) hideOfficialReasoning(container)
      }
    }
  }
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
    onPendingChanged: () => { schedule() },
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
      // The FIRST render is synchronous: the row was painted open this frame,
      // and an async commit would leave the slot empty for a frame more —
      // the "old page first, covered later" flash (展开模型详细配置先出现
      // 之前的页面). The scan's hideOfficialReasoning has already stood the
      // official control down in this same task, so a sync commit means the
      // user's next paint shows the plugin editor and nothing else.
      flushSync(() => { renderEditor(props) })
      return {
        unmount: () => {
          try {
            reactRoot.unmount()
          } finally {
            // The synchronous hasEditor marker belongs to this mount as well.
            rootEl.remove()
          }
        },
        render: renderEditor,
      }
    },
  }

  /**
   * Wake the injector when a failed idle pass's backoff expires: a settled
   * settings page emits no DOM mutation, so without this the held intent would
   * wait for a scan that never comes. One timer at a time, and a SHORTER
   * request always wins — a pending long backoff must not swallow the 1s
   * deferred-headers wake-up that arrives after it; the fired timer re-runs
   * the scan, which re-arms the next backoff if the write is refused.
   */
  let retryAt = 0
  function scheduleRetry(delayMs: number): void {
    if (stopped) return
    const at = Date.now() + delayMs
    if (retryTimer !== undefined && at >= retryAt) return
    if (retryTimer !== undefined) window.clearTimeout(retryTimer)
    retryAt = at
    retryTimer = window.setTimeout(() => {
      retryTimer = undefined
      retryAt = 0
      schedule()
    }, delayMs)
  }

  /**
   * Apply every decoration that only needs the current DOM. Keeping this pass
   * synchronous with the host's mutation commit prevents the first Models-page
   * paint from showing the undecorated provider list and then shifting when the
   * debounced scan catches up. The data-aware editor reconcile stays deferred
   * below because it may read the settings wire.
   */
  const reconcileDom = (): void => {
    const root = panelRoot()
    if (rowsListOf(root) === undefined) return
    reconcileProviderOrder(root, providerOrderDeps, providerOrderState)
    reconcileProviderEnabled(root, providerToggleDeps, providerToggleState)
    reconcileProviderDeleteSeat(root, providerDeleteDeps)
    reconcileProviderDisabledGroup(root, providerDisabledDeps, providerDisabledState)
    reconcileModelOrder(root, modelOrderDeps, modelOrderState)
    // The row actions a plugin write's post-apply reload disables: held at full
    // opacity so the list does not blink under the save. It runs in this pass
    // because the disable lands in the same mutation burst the pass answers.
    reconcileSettleGuard()
    // Last: the official save line, which this pass takes out of the flow and
    // answers with a bubble. It runs last because it watches the panel for text
    // the save has just produced, and every pass above may still move a node
    // that lands in the same burst.
    reconcileSavedNotice(root)
  }

  const safely = (phase: string, run: () => void): void => {
    try {
      run()
    } catch (error) {
      console.error(`[bre] ${phase} failed:`, error)
    }
  }

  function schedule(): void {
    if (stopped || scanTimer !== undefined) return
    // Debounce: the official page re-renders in bursts (typing, expanding,
    // applying); one scan per frame keeps the editor stable mid-keystroke.
    scanTimer = window.setTimeout(() => {
      scanTimer = undefined
      // The composer path rides along: the debounced scan is the only thing
      // that covers the paths no mutation carries — apply boot and a slider
      // preference flip. Every pass is fenced with `safely` so one throwing
      // cannot cost the page the rounds that follow it in the same scan.
      safely('composer mutation', () => { composerMutation?.() })
      // The editor injector is the data-aware reconcile; its own promise tail
      // is caught (see models-page-editor), and this fence covers its sync
      // scan head.
      safely('editor reconcile', () => { reconcile(panelRoot(), injectorDeps, scanState) })
      // The create-provider card is reduced to its custom form first: the tab
      // pass below dresses the half this pass leaves showing.
      safely('add-card reconcile', () => { reconcileAddCards(panelRoot(), addCardDeps, addCardState) })
      // The tab pass rides the settled scan as well, after the editor injector
      // has stocked the open card. Its reactive path is the observer above; this
      // one covers the paths no mutation carries — a boot over an editor that
      // is already open, and a retry whose scan re-arms without a re-render.
      // Its own writes are guarded, so no scan ever chases its own tail.
      safely('editor tabs reconcile', () => { reconcileEditorTabs(panelRoot(), editorTabsDeps, editorTabsState) })
      // These passes are also run synchronously by the observer. Repeating them
      // here covers preference flips and retry scans that have no DOM mutation.
      safely('dom decorations', () => { reconcileDom() })
      // LAST, and only here: the create card's held drafts drain on the scan
      // that finds their route declared. This is the one scan with wire work
      // already in it — the observer's synchronous pass must stay wire-free,
      // and the drain is a settings write of its own. A draft whose card is
      // already gone gets no further mutation to ride, so the scan keeps coming
      // until both ledgers are empty (the held grace windows bound that).
      void flushStagedRequestHeaders(stagedHeadersState, api).then((waiting) => {
        if (waiting > 0) scheduleRetry(DEFERRED_RETRY_MS)
      })
      void flushStagedKeys(stagedKeysState, api, httpKeyManagerClient).then((waiting) => {
        if (waiting > 0) scheduleRetry(DEFERRED_RETRY_MS)
      })
    }, SCAN_DEBOUNCE_MS)
  }

  const start = (onComposerMutation: () => void): void => {
    if (stopped || observer !== undefined) return
    composerMutation = onComposerMutation
    // A session may already be resident when the fiber starts (page reload,
    // HMR): wire it before the first mutation has a chance to land.
    safely('models page startup', () => {
      onComposerMutation()
      reconcileDom()
    })
    // Where a click inside a model list leaves the scroll position: the row
    // deletion's clamp takes that position away before any later pass can read
    // it, so it has to be recorded from the event that starts the deletion.
    watchModelListOffsets()
    const onMutation = (records: MutationRecord[]): void => {
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
      // User item 5: the editor injector runs HERE too, synchronously. Its scan
      // head is DOM-only work — the label read, the row query, the provider
      // card's field order, the disclosure buttons' re-pins — and it was left
      // in the debounced scan only, so a card opened by a click painted in the
      // official shape and then had its fields re-sorted a frame or more later.
      // That re-sort is the "click Edit and the provider card flickers" report.
      // Its wire reads are folded behind ??= and land in a later microtask, so
      // nothing here waits on the network, and it leads the tab pass below
      // because that pass classifies the fields this one has just ordered.
      safely('editor reconcile', () => { reconcile(panelRoot(), injectorDeps, scanState) })
      // The tab pass runs HERE too, synchronously, for the same reason: it is
      // pure DOM work (attribute writes, no wire reads), and it must land in
      // the microtask that carries the official commit. Deferred to the
      // debounced scan below, the opened editor would paint as the official
      // one long column and then visibly re-sort itself a frame or more later
      // — the "click Edit and the tabbed editor flickers in" report.
      // The create-provider card's pass leads the tab pass here for the same
      // reason, and one more: it is what SWITCHES the card to its custom form,
      // and the official control commits that synchronously, so the tab pass
      // that follows in this very microtask already sees the half to dress.
      reconcileAddCards(panelRoot(), addCardDeps, addCardState)
      reconcileEditorTabs(panelRoot(), editorTabsDeps, editorTabsState)
      // All other page decorations are DOM-only as well. They must land in this
      // same microtask, otherwise navigating to Models first paints the official
      // list and then visibly inserts/reorders the plugin controls.
      reconcileDom()
      // A model-list mutation needs the scroll pin before layout. The model-order
      // pass above has already stamped the surviving rows before this pin runs.
      if (modelListMutation(records)) {
        // The same burst shrinks one card by a row's height INSIDE it, and the
        // browser's scroll anchoring buys that shrink back by moving the whole
        // view: the "delete one model and the window jumps down" report.
        // Pinning the card's top from this microtask suppresses the anchoring
        // before the deletion is ever laid out, so the tail contracts upward
        // into the hole instead — and the window outlives the burst to cover
        // the stale editor's re-render by the debounced scan below.
        pinModelListCards(panelRoot())
      }
    }
    observer = new MutationObserver((records) => {
      safely('models mutation', () => { onMutation(records) })
      // Stand the official per-model reasoning control down in the SAME
      // microtask the disclosure appears in, before the browser can paint the
      // opened row: the debounced scan that also hides it runs frames later,
      // and that gap is exactly the "old page first, covered later" flash
      // (展开模型详细配置先出现之前的页面). Idempotent with the scan's own
      // hide — same marker, same guard.
      safely('early reasoning hide', () => { earlyHideOfficialReasoning(records) })
      schedule()
    })
    // `hidden` flips are observed too: the official create card switches its
    // two halves by attribute only, and the passes that key on which half is
    // showing would otherwise sleep until some unrelated childList mutation.
    observer.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['hidden'],
    })
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
    if (scanState.disposed) return
    stopObserver()
    scanState.disposed = true
    releaseModelListRepins()
    // Land what the session held back before the fiber goes away: a plugin
    // disable or HMR must not strand the user's intent in memory alone. The
    // ledgers stay in sessionStorage WITH their commit evidence, so the next
    // fiber in this document retries a flush the runtime cut short.
    flushOnTeardown(scanState, injectorDeps)
    // Orphaned editors must not outlive the fiber: on plugin disable or HMR
    // they would keep rendering with a stale api face, failing every write
    // visibly. Unmount every React root this plugin created — restoring the
    // official reasoning group each editor stood down FIRST, or the field it
    // covered stays hidden on a page this plugin no longer decorates.
    for (const [container, entry] of scanState.mounted) {
      showOfficialReasoning(container)
      entry.editor.unmount()
    }
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
    // And for the folded group: the control and the hidden rows are raw DOM this
    // plugin owns on the official list, and a dead fiber must not leave provider
    // rows invisible with nothing left to unfold them.
    teardownProviderDisabledGroup()
    // And for the auto-adapt seats: raw DOM this plugin put in the official
    // catalogue head, which a dead fiber must not leave clickable-looking.
    teardownAutoEffortSeats()
    // And for the official save line: it is the HOST's own node, and a dead
    // fiber must not leave a provider saved with the page saying nothing.
    teardownSavedNotice()
    // And for the row actions a write's reload was holding: the attribute is raw
    // DOM on the host's own buttons, and a dead fiber must not leave one looking
    // usable for ever.
    teardownSettleGuard()
    // And for the model grips inside an open editor, whose own lists live
    // outside the provider rows' seat.
    teardownModelOrder(modelOrderState)
    // And for the create-provider card: the bar mount is raw DOM this plugin
    // put inside an official form, and the switch it hid stands for a control
    // the page owns.
    teardownAddCards(addCardState)
    // And for the editor tabs: the bar and the region tags are raw DOM and
    // attributes this plugin owns inside the official card — a dead fiber must
    // not leave the page keyed to tabs nothing maintains anymore.
    teardownEditorTabs()
    // And for the provider cards' dual-endpoint dressing: the second address
    // rows, the family tags, the 更多端点 toggle and the hidden protocol
    // selects are this plugin's — a dead fiber hands the official card back
    // exactly as the page built it.
    teardownProviderEndpoints()
    // Last, the deletion guard: the recorded positions are THIS fiber's
    // listeners, and the blanks holding scroll ranges open are raw DOM inside
    // the official panel, which a dead fiber must not leave behind either.
    unwatchModelListOffsets()
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
