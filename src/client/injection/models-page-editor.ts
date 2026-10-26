/**
 * The DOM bypass injector: the piece that makes reasoning effort editable
 * *inside* the official Models page's model rows.
 *
 * The official Models-page slot contract's two sanctioned seats are both
 * coarser than a model row: the keyed `settings.models.provider-card`
 * renders per provider card and `settings.models.footer`
 * renders after the rows — neither reaches a single model row's editor
 * internals, so this plugin mounts its editor as a DOM contribution next to
 * the official per-model capacity disclosure. The anchor is the official
 * disclosure chevron button, found by aria-label in both locales (the
 * `modelAdvanced` dictionary value: "Capacities"/容量 through 0.1.6-alpha.1,
 * "Model options"/模型选项 from 0.1.6-alpha.2); the editor is inserted into the
 * same disclosure container that holds the official context-window / max
 * tokens fields. A kernel that ships its OWN reasoning-levels group in that
 * same disclosure (0.2.1-rc.2's `ModelReasoningEfforts`) would leave the row
 * showing two controls for one declaration, so the official group is stood down
 * on exactly the rows this editor owns — and handed back when the editor goes
 * away. See {@link hideOfficialReasoning}.
 *
 * Because this walks the official page's rendered DOM (class names and
 * structure that the harness can change), the injector is defensive by
 * construction:
 *   - it re-scans on every DOM mutation (a routed page, an open editor, an
 *     applied form all re-render), and every scan reconciles idempotently;
 *   - a model row that carries no disclosure yet is left alone and picked up
 *     on the next mutation;
 *   - if the official structure it depends on ever stops appearing, it simply
 *     stops injecting — the settings page remains untouched.
 *
 * @module dsh-model-think-level/client/injection/models-page-editor
 */

import { AUTOFILL_MARKER, INPUT_UNSET_MARKER, PLUGIN_ID, UNSET_MARKER } from '../../constants.js'
import { suggestEfforts, type CompatSuggestion, type InputModalities, type ReasoningEfforts } from '../../knowledge.js'
import { modelsOf, routeFactsOf, isRecord } from '../../shared.js'
import { buildIntent, draftFrom, sameEfforts } from '../effort.js'
import { parseCapacity } from '../capacity.js'
import {
  buildModalityIntent,
  ladderIntent,
  modalityFrom,
  pendingWriteOf,
  sameModality,
} from '../EffortEditor.js'
import { compatOf, createEditorApi, defaultEffortOf, effortsOf, inputOf, invalidateProbeCache, nameOf, providersOf, writeModelRows, type RowIntent } from '../ops.js'
import type { EffortEditorApi, EffortWriteIntent, HeldWrite, RemoteApi, SettingsJoin } from '../types.js'
import { cataloguesOf, reconcileAutoEffortSeats, type AutoEffortSeatTarget } from './auto-effort-seat.js'
import type { AutoAdaptReport } from '../auto-effort.js'
import { panelRoot } from './mount.js'
import { scrollChainOf } from './row-drag.js'
import { decorateProviderCard, type EndpointLabels } from './provider-endpoints.js'

export type { SettingsJoin }

/**
 * Own-property membership over the providers dict. Plain `in` would answer
 * true for inherited names ('constructor', 'toString', '__proto__'…), so a
 * route typed as one of those in the create card would resolve against
 * prototype members instead of being treated as unsaved.
 */
function hasOwn(object: Record<string, unknown>, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(object, key)
}

/**
 * Localized aria-labels of the official settings controls this injector
 * anchors to, in the language the host is currently rendering.
 *
 * The host renders these labels from its own `settings.models` dictionary
 * (`ui-settings-models`), so the plugin must read them through the same
 * channel instead of pinning the two languages it knows about: a host
 * language pack that adds, say, Japanese would otherwise relabel every
 * control and leave the injector unable to find a single model row. Each
 * field carries the active language first and English last — English is the
 * host's own fallback floor, so it doubles as ours.
 *
 * Every field is a LIST because the official labels are numbered per row
 * ("Model ID 1", "モデル ID 2", …) and are matched by prefix.
 */
export interface HostLabels {
  /** The per-row disclosure button ("Model options", "模型选项", "Capacities", "容量", …). */
  capacity: readonly string[]
  /** The model-id input. */
  modelId: readonly string[]
  /** The per-row display-name input. */
  modelName: readonly string[]
  /** The create card's route-id input. */
  routeId: readonly string[]
  /** The create card's endpoint input. */
  baseUrl: readonly string[]
  /** The create card's protocol select. */
  apiProtocol: readonly string[]
  /**
   * The editing card's commit button. C2 drives the plugin's landing write off
   * the official Save, so the button is resolved when the action row's own
   * structure cannot be read (the buttons ARE the last child pair of
   * `[class*="editorActions"]`; the copy is the fallback).
   */
  apply: readonly string[]
  /** The editing card's dismiss button (the commit's left-hand sibling). */
  cancel: readonly string[]
  /**
   * A provider row's edit button, as the official `providerCopy` template
   * ("Edit {provider}" / "编辑 {provider}"). Its `{provider}` slot carries
   * `Name (route)`, which is how a row names its provider even when the row
   * offers this plugin no seat to stamp that name on.
   */
  editProvider: readonly string[]
  /**
   * The official input-types control's image choice ("Image" / "图片"). When a
   * row ships that control, it — not the plugin's ledger — is what tells the
   * user (and the official Save) that a model takes images, so the copy is the
   * anchor that finds the box a verdict belongs in: see
   * {@link echoOfficialModality}.
   */
  inputImage: readonly string[]
  /**
   * The disclosure's context-window input ("Context window" / "上下文窗口").
   * Matched against the input's own aria-label when it carries one, else
   * against the text of the label wrapping it — the DSH host renders the field
   * label-wrapped with no aria-label of its own. The first copy is what a
   * suggestion's capacities echo into: see {@link echoOfficialCapacities}.
   */
  contextWindow: readonly string[]
  /** The disclosure's max-output input ("Max output" / "最大输出"). */
  maxOutput: readonly string[]
}

/** A row's identity as found on the page, resolved from the settings join. */
interface FoundModel {
  /**
   * The official disclosure container that holds the capacity fields, when the
   * row is EXPANDED. A collapsed row renders no such container at all (the
   * official editor returns null for it), so a row the user has not unfolded
   * still counts as found: it is a model of the provider and everything that
   * works per PROVIDER (the auto-adapt seat, the provider-wide adapt) must see
   * it. Only the per-row editor mount needs the container.
   */
  container?: HTMLElement
  /** The trigger's OWN model row element (row-scoped input reads). */
  row: HTMLElement
  /** The model id read from the row's "Model ID" input. */
  modelId: string
  /** The nearest card element (for route resolution). */
  card: HTMLElement
}

/** The join the injector renders from. */
export interface InjectorDeps {
  /**
   * The settings Remote face for THIS scan/write. The kernel mounts
   * `remote.settings` as an injectable service, so the plugin's own top-level
   * `inject` declaration guarantees it before apply runs — no runtime seat
   * probing remains.
   */
  api: RemoteApi
  /** Read the pi-ai namespace plus writability from the settings join. */
  describeNamespace(): Promise<SettingsJoin>
  /** Localized copy. */
  t: (key: string, params?: Record<string, string | number>) => string
  /**
   * The official controls' aria-labels in the ACTIVE language. A thunk, not a
   * value: the host resolves labels through the same fallback chain it renders
   * from, so re-reading per scan is what keeps a language switch (and a late
   * language pack) in step with the page it has to find controls on.
   */
  labels(): HostLabels
  /** Mount one editor into a container (React); render() updates its props in place. */
  mount(container: HTMLElement, props: EditorMountProps): MountedEditor
  /**
   * Runs after an idle pass landed everything the session held back. The
   * browser half hangs its autofill complement here: "the user stopped
   * editing" is the only moment this side may safely write the document.
   */
  onIdle?(): void
  /** Wake the debounced scan after provider-wide adaptation stages a row. */
  onPendingChanged?(): void
  /**
   * Arm a timed retry after a failed idle pass. The backoff clock only helps
   * if something wakes the injector when it expires; a settled page has no DOM
   * mutation to schedule the next scan. Optional so tests drive passes by hand.
   */
  onBackoff?(delayMs: number): void
}

/** One mounted editor: unmount disposes the React root; render swaps props in place. */
export interface MountedEditor {
  unmount(): void
  render(props: EditorMountProps): void
}

/** Props handed to the editor mount for one model row. */
export interface EditorMountProps {
  /** The route being edited. */
  route: string
  /** Route display name (shown in the editor header). */
  routeDisplayName: string
  /** Route wire protocol, when configured. */
  routeApi?: string
  /** Route endpoint, when configured. */
  routeBaseURL?: string
  /** Model id. */
  modelId: string
  /** Model display name, when one is set. */
  modelName?: string
  /** The model's current reasoningEfforts declaration. */
  efforts?: false | ReasoningEfforts
  /** Whether the saved model explicitly opted out of an effort declaration. */
  effortsUnset?: boolean
  /** The model's current input-modality declaration. */
  input?: InputModalities
  /** The model's stored compat block (passthrough; the editor merges suggestions over it). */
  compat?: CompatSuggestion
  /** The model's stored per-model default-effort pick, when one is set. */
  defaultEffort?: string
  /** Row ordinal among the models found in this scan (for aria labels). */
  index: number
  /** True while the row is unsaved (a create card's draft route, or a new
   * model row on a saved route): Apply stages the declaration instead of
   * writing, and the injector lands it once the row is saved. */
  staged?: boolean
  /**
   * Whether the official Models page owns input types for this row: 0.1.6-alpha.2
   * renders its own ModelInputTypes control inside the disclosure. When true,
   * the editor hides its modality section — a CAPABILITY sniffed from the row
   * DOM, never a kernel version.
   */
  officialInputTypes?: boolean
  /** The card reports whether it still covers the official capacity and
   * input-type fields: it does while its thinking switch is on, and steps
   * aside when the switch turns the card off. */
  onCoverageChange?: (covered: boolean) => void
  api: EffortEditorApi
  readOnly: boolean
  t: (key: string, params?: Record<string, string | number>) => string
}

/** Mutable scan state kept across reconcile invocations. */
export interface ScanState {
  /** The owning page was torn down; late reads must not mount new roots. */
  disposed: boolean
  /** Currently mounted editors, keyed by their container element. */
  mounted: Map<HTMLElement, { editor: MountedEditor; props: EditorMountProps }>
  /** The last describe promise, folded so scans never stack reads. */
  describePromise: Promise<SettingsJoin> | undefined
  /**
   * Declarations staged against routes that do not exist in the settings
   * document yet (the create card's typed route id), keyed route → model id.
   * Flushed automatically once a route appears. Mirrored into `sessionStorage`
   * so a same-document fiber cycle (HMR, disable-then-enable) keeps the user's
   * mid-edit staging; a real reload discards it (see {@link restoreLedger}).
   */
  pending: Map<string, Map<string, StagedDeclaration>>
  /**
   * Staged models that looked ghosted on the last scan (their route is saved,
   * but no matching row exists on the page anymore). Withdrawn once they miss
   * TWO consecutive scans, so one transient re-render gap cannot drop real
   * mid-edit staging. Mirrors {@link pending}'s key shape.
   */
  missedScans: Map<string, Set<string>>
  /**
   * Writes an ON-SCREEN editor asked for while the official card held the
   * document, keyed route → model id. Kept verbatim (this is the user's own
   * declaration, so no suggestion arbitration applies) and replayed the
   * moment the card is gone. Persisted beside its commit evidence, so a
   * same-document fiber cycle still lands a write the official Save
   * authorized, while a reload or a dismissed card drops it (see
   * {@link restoreLedger} / {@link forgetRoute}).
   */
  queued: Map<string, Map<string, HeldWrite>>
  /**
   * Whether an official editing card was on the page at the last reconcile.
   * `undefined` until the first scan. The `!== false` test is what makes the
   * idle pass run exactly once per editing session -- and once for a page
   * that loads straight into the models section without ever editing.
   */
  editing: boolean | undefined
  /**
   * Whether an idle pass is in flight. One pass at a time: two overlapping
   * passes would describe the same revision and then fight over it, turning a
   * clean replay into a self-inflicted `settings/conflict`.
   */
  flushing: boolean
  /** Consecutive failed idle passes; the backoff exponent. Reset on success. */
  flushFailures: number
  /** Earliest `Date.now()` at which the next retry may run (0 = any time). */
  nextFlushAt: number
  /**
   * Routes whose OFFICIAL card committed in this session (the user pressed its
   * commit button). The held ledgers land per route: only the routes the user
   * actually saved are written, because the official card's Save is now what
   * commits this plugin's edits too (issue #7 / C2). An intent the user
   * dismissed without saving is dropped, exactly like the card's own fields.
   */
  committing: Set<string>
  /**
   * Routes with a provider-wide adapt in flight (the auto-adapt seat's click).
   * Nothing debounces that click: a second one arriving while the first pass is
   * still describing and suggesting would re-ask every model and re-commit the
   * same bytes, so the route is simply not re-entered until its pass ends.
   */
  adapting: Set<string>
  /**
   * Whether the official action row has failed to yield usable buttons for
   * every card seen so far. When it has, the landing decision degrades to
   * "the card went away, so write it" -- writing too much is recoverable,
   * silently losing the user's declaration is not.
   */
  signalsUnavailable: boolean
  /** Commit buttons already wired, so a re-scan never double-registers. */
  submitWired: WeakSet<Element>
  /** Cancel buttons already wired. */
  cancelWired: WeakSet<Element>
  /** Disclosure chevrons already wired for the top re-pin, so a re-scan
   * never double-registers. */
  disclosureWired: WeakSet<Element>
  /** Provider-row Edit buttons already wired for the top re-pin. */
  editWired: WeakSet<Element>
}

/**
 * One staged declaration: the level set plus the suggestion's compat block and
 * modalities. A 'keep' effort travels untouched to the flush write. The
 * per-model default-effort pick (issue #4) rides along: a string to write,
 * null to clear, absent to touch nothing.
 *
 * Design note: staging cannot express a deliberate UNSET. An all-clear draft
 * stages `keep`/no-input, whose flush resolves to null and withdraws the
 * whole staging -- host autofill then fills its suggestion back in. To record
 * "declare nothing" durably, save the row first and apply an all-clear write
 * through the saved-row seam (the durable unset marker).
 */
export interface StagedDeclaration {
  efforts: Exclude<EffortWriteIntent, undefined>
  compat?: CompatSuggestion
  input?: InputModalities
  defaultEffort?: string | null
}

/**
 * The held-write ledgers as `sessionStorage` keeps them: the two maps, plus the
 * document identity and the commit evidence a same-document restore needs.
 * Every entry is the user's own declaration, already JSON-shaped, so the file
 * IS the intent (no derivation on the way back in).
 */
interface LedgerFile {
  /** Identity of the document that wrote the file; a different one is a reload. */
  document: string
  /**
   * Routes whose held write had COMMIT EVIDENCE when persisted (the user
   * pressed the official Save). A restored queued entry without its route here
   * is an abandoned edit and is dropped, matching the official draft.
   */
  committed: string[]
  pending: [string, [string, StagedDeclaration][]][]
  queued: [string, [string, HeldWrite][]][]
}

/**
 * The `sessionStorage` ledger key, and the module-local sentinel identifying
 * the CURRENT document across a same-page fiber cycle. The sentinel lives on
 * the window, so a real reload (a fresh window) reads a different id and the
 * old file is discarded; HMR / disable-enable keeps it.
 */
const LEDGER_DOCUMENT_KEY = '__breLedgerDocument'

/** The current document's ledger identity, minting one on first use. */
function documentId(): string {
  const holder = globalThis as { [LEDGER_DOCUMENT_KEY]?: string }
  return (holder[LEDGER_DOCUMENT_KEY] ??= `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`)
}

/**
 * The `sessionStorage` slot holding both ledgers. Session-scoped on purpose:
 * the intents belong to the card session the user was working in, and a NEW
 * tab must not inherit another tab's half-finished edit.
 */
const LEDGER_KEY = 'bre:held-writes:v1'

/** `sessionStorage`, or undefined when the environment has none (node, privacy mode). */
function ledgerStorage(): Storage | undefined {
  try {
    return typeof sessionStorage === 'undefined' ? undefined : sessionStorage
  } catch {
    return undefined
  }
}

/**
 * Mirror both ledgers into `sessionStorage`. Called after every change and
 * best-effort by nature: an unavailable or full storage keeps the ledgers in
 * memory alone (the behaviour before they were persisted), never an error the
 * user has to see.
 */
function persistLedger(state: ScanState): void {
  const store = ledgerStorage()
  if (store === undefined) return
  try {
    if (state.pending.size === 0 && state.queued.size === 0) {
      store.removeItem(LEDGER_KEY)
      return
    }
    const file: LedgerFile = {
      document: documentId(),
      // Only routes that still hold a write matter: a spent marker is never
      // restored (and flushQueued prunes it).
      committed: [...state.committing].filter(route => state.queued.has(route)),
      pending: [...state.pending].map(([route, models]) => [route, [...models]]),
      queued: [...state.queued].map(([route, models]) => [route, [...models]]),
    }
    store.setItem(LEDGER_KEY, JSON.stringify(file))
  } catch {
    // Quota / disabled storage: the in-memory ledgers remain authoritative.
  }
}

/** One ledger entry as the file carries it, or undefined when malformed. */
function ledgerEntry<T>(value: unknown, validate?: (write: unknown) => boolean): [string, [string, T][]][] | undefined {
  if (!Array.isArray(value)) return undefined
  const routes: [string, [string, T][]][] = []
  for (const row of value) {
    if (!Array.isArray(row) || row.length !== 2) return undefined
    const [route, models] = row as [unknown, unknown]
    if (typeof route !== 'string' || !Array.isArray(models)) return undefined
    const entries: [string, T][] = []
    for (const entry of models) {
      if (!Array.isArray(entry) || entry.length !== 2) return undefined
      const [modelId, write] = entry as [unknown, unknown]
      if (typeof modelId !== 'string' || !isRecord(write)) return undefined
      if (validate !== undefined && !validate(write)) return undefined
      entries.push([modelId, write as T])
    }
    routes.push([route, entries])
  }
  return routes
}

/**
 * Restore the ledgers from `sessionStorage`.
 *
 * A file written by a PREVIOUS document is a reload: the official card's own
 * draft would have died with it, so both ledgers are discarded outright. A
 * same-document file (HMR / disable-enable) comes back, but a held write is
 * restored ONLY with commit evidence -- an edit the user never saved must not
 * be resurrected behind a later Save. A malformed or foreign file is ignored
 * wholesale rather than partially applied: a half-read intent is worse than a
 * dropped one on a document the user can edit by hand.
 * @param state - the fresh scan state to fill.
 */
function restoreLedger(state: ScanState): void {
  const store = ledgerStorage()
  if (store === undefined) return
  try {
    const raw = store.getItem(LEDGER_KEY)
    if (raw === null) return
    const parsed = JSON.parse(raw) as Partial<LedgerFile>
    if (parsed.document !== documentId()) return
    const pending = ledgerEntry<StagedDeclaration>(parsed.pending)
    const queued = ledgerEntry<HeldWrite>(parsed.queued, isHeldWrite)
    if (pending === undefined || queued === undefined) return
    const committed = Array.isArray(parsed.committed)
      ? parsed.committed.filter((route): route is string => typeof route === 'string')
      : []
    for (const [route, models] of pending) state.pending.set(route, new Map(models))
    for (const [route, models] of queued) {
      // No evidence = the user never saved this route: drop it.
      if (!committed.includes(route)) continue
      state.queued.set(route, new Map(models))
      state.committing.add(route)
    }
  } catch {
    // Unreadable file: start clean.
  }
}

/**
 * Land whatever the session held back, best effort, when the fiber is about to
 * go away (plugin disable / HMR). The ledgers STAY in `sessionStorage` (with
 * their commit evidence), so the next fiber in the same document picks the work
 * up; a flush the runtime cuts short is simply retried by that fiber.
 * @param state - the scan state whose ledgers to drain.
 * @param deps - the injection dependencies.
 */
export function flushOnTeardown(state: ScanState, deps: InjectorDeps): void {
  void (async () => {
    try {
      await flushQueued(deps, state)
      await flushPending(deps, state)
    } catch (error) {
      console.error(`[bre] teardown flush failed: ${error instanceof Error ? error.message : String(error)}`)
    }
  })()
}

/**
 * The page is going away: land the committed intents best effort, then CLEAR
 * the ledger. Unlike a fiber cycle, a reload discards the official card's own
 * draft, so the plugin's must go too -- anything the cut-short flush could not
 * land must not be resurrected by the next document. (The window sentinel
 * covers the case pagehide never fires: crash / plugin already disabled.)
 * @param state - the scan state whose ledgers to drain.
 * @param deps - the injection dependencies.
 */
export function flushOnUnload(state: ScanState, deps: InjectorDeps): void {
  // The page is going away: an open card's frozen baseline no longer matters,
  // so the in-flight fence must not block this last best-effort landing.
  void (async () => {
    try {
      await flushQueued(deps, state, true)
      await flushPending(deps, state, true)
    } catch (error) {
      console.error(`[bre] unload flush failed: ${error instanceof Error ? error.message : String(error)}`)
    } finally {
      try {
        ledgerStorage()?.removeItem(LEDGER_KEY)
      } catch {
        // Disabled storage: nothing to clear.
      }
    }
  })()
}

export function createScanState(): ScanState {
  const state: ScanState = {
    disposed: false,
    mounted: new Map(),
    describePromise: undefined,
    pending: new Map(),
    missedScans: new Map(),
    queued: new Map(),
    editing: undefined,
    flushing: false,
    flushFailures: 0,
    nextFlushAt: 0,
    committing: new Set(),
    adapting: new Set(),
    signalsUnavailable: false,
    submitWired: new WeakSet(),
    cancelWired: new WeakSet(),
    disclosureWired: new WeakSet(),
    editWired: new WeakSet(),
  }
  restoreLedger(state)
  return state
}

/**
 * Land everything the session held back, one pass at a time.
 *
 * A refusal keeps its intent in the ledger and pushes the next attempt out on
 * a backoff, so a settled document is not hammered while a genuinely stuck
 * write (a refused compat key, a vanished route) is retried indefinitely
 * instead of being lost on the first failure.
 * @param deps - the injection dependencies.
 * @param state - mutable scan state.
 */
async function runIdlePass(deps: InjectorDeps, state: ScanState): Promise<void> {
  if (state.flushing) return
  state.flushing = true
  try {
    const queuedFailed = await flushQueued(deps, state)
    const pendingFailed = await flushPending(deps, state)
    if (queuedFailed || pendingFailed) {
      // A refusal arrives as a VALUE, not a throw: folding it into the same
      // backoff keeps a doomed route from being re-mutated on every scan, and
      // puts both failure shapes (refused, unreachable) on one clock.
      armBackoff(deps, state)
    } else {
      state.flushFailures = 0
      state.nextFlushAt = 0
    }
  } catch (error) {
    armBackoff(deps, state)
    console.error(`[bre] idle flush failed: ${error instanceof Error ? error.message : String(error)}`)
  } finally {
    state.flushing = false
  }
  // The hook is a courtesy seat for the browser half's autofill: a fault in
  // it must not reject the pass (the caller void-s the promise) and become an
  // unhandled rejection.
  try {
    deps.onIdle?.()
  } catch (error) {
    console.error(`[bre] idle hook failed: ${error instanceof Error ? error.message : String(error)}`)
  }
}

/**
 * Push the next attempt out on the exponential backoff and tell the host to
 * wake the injector when it expires (a settled page has no DOM mutation).
 */
function armBackoff(deps: InjectorDeps, state: ScanState): void {
  state.flushFailures += 1
  const delay = Math.min(2 ** state.flushFailures * 500, 30_000)
  state.nextFlushAt = Date.now() + delay
  deps.onBackoff?.(delay)
}

/** Whether either ledger still holds work the idle pass has to land. */
function hasOutstanding(state: ScanState): boolean {
  return state.queued.size > 0 || state.pending.size > 0
}

/**
 * Record (or, for `undefined`, withdraw) one staged declaration. A route with
 * no staged models left leaves the store entirely.
 */
export function stageEffortsInto(
  state: ScanState,
  route: string,
  modelId: string,
  efforts: EffortWriteIntent,
  compat?: CompatSuggestion,
  /**
   * The modality part. `null` is a deliberate unset (the editor's "clear
   * declaration" on an unsaved route) and stores as such: the staged flush
   * reads it back verbatim, exactly like the saved-row seam does.
   */
  input?: InputModalities | null,
  defaultEffort?: string | null,
): void {
  try {
    const models = state.pending.get(route)
    if (efforts === undefined) {
      if (models === undefined) return
      models.delete(modelId)
      if (models.size === 0) state.pending.delete(route)
      return
    }
    // 'keep' is storable: a modality-only staging must survive the flush as a
    // declaration that touches everything EXCEPT the ladder.
    state.pending.set(route, (models ?? new Map()).set(modelId, {
      efforts,
      ...(compat === undefined ? {} : { compat }),
      ...(input === undefined ? {} : { input }),
      ...(defaultEffort === undefined ? {} : { defaultEffort }),
    }))
  } finally {
    // Both arms changed the ledger (or provably did not): persisting here
    // keeps the early returns from having to remember it.
    persistLedger(state)
  }
}

/**
 * Record (or replace) the write an on-screen editor asked for while the
 * official card held the document. The latest intent for a row wins: the user
 * may apply twice before closing the card.
 * @param state - mutable scan state.
 * @param route - the route being edited.
 * @param modelId - the model id being edited.
 * @param write - the full intent, kept verbatim for the replay.
 */
export function queueWriteInto(state: ScanState, route: string, modelId: string, write: HeldWrite): void {
  state.queued.set(route, (state.queued.get(route) ?? new Map()).set(modelId, write))
  persistLedger(state)
}

/**
 * Withdraw one row's staged intent (the create card's erase-that-row flow, and
 * the editor's Reset on a route the document does not hold yet). Idempotent,
 * and it clears the route entry once its last model is gone.
 * @param state - mutable scan state.
 * @param route - the route the staging was made against.
 * @param modelId - the model whose intent to drop.
 */
export function withdrawStaged(state: ScanState, route: string, modelId: string): void {
  const models = state.pending.get(route)
  if (models === undefined) return
  models.delete(modelId)
  if (models.size === 0) state.pending.delete(route)
  persistLedger(state)
}

/**
 * Withdraw one row's held intent (the editor's own Reset, or any later
 * "discard this edit"). Idempotent, and it clears the route entry once its
 * last model is gone.
 * @param state - mutable scan state.
 * @param route - the route the editor was editing.
 * @param modelId - the model whose intent to drop.
 */
export function withdrawHeldWrite(state: ScanState, route: string, modelId: string): void {
  const models = state.queued.get(route)
  if (models === undefined) return
  models.delete(modelId)
  if (models.size === 0) state.queued.delete(route)
  persistLedger(state)
}

/**
 * Withdraw a row's intent wherever it landed.
 *
 * The editor's Reset is the caller and it does not know which ledger its own
 * `commit` fed — the create card stages, a saved row queues, and the same row
 * can move between the two as the user edits the route id. Discarding only one
 * of them would leave the Reset cosmetic on the other: the official Save would
 * still write edits the user explicitly threw away.
 * @param state - mutable scan state.
 * @param route - the route the editor was editing.
 * @param modelId - the model whose intent to drop.
 */
export function withdrawIntent(state: ScanState, route: string, modelId: string): void {
  withdrawStaged(state, route, modelId)
  withdrawHeldWrite(state, route, modelId)
}

/**
 * Drop every intent one route holds, right now: the official card's cancel.
 *
 * The card's own fields die with the dismissal, so the plugin's must too -- and
 * they must die at the CLICK, not on some later scan. A deferred "discarded"
 * marker would outlive the card that set it (a dismiss carrying no plugin edit
 * leaves nothing for a later pass to drain), and the next card for that same
 * route would then be read as already-dismissed: its Save would never be
 * wired, and the user's fresh edit would be dropped silently. Clearing the
 * ledgers here leaves no state at all to misinterpret -- including the staged
 * declaration a dismissed CREATE card was holding for a route that does not
 * exist yet, which would otherwise land the moment that route appeared.
 *
 * Safe by construction: the official page keeps ONE editing card at a time
 * (create and edit mutually exclusive), so the route this resolves is the only
 * card that could own these entries.
 * @param state - mutable scan state.
 * @param route - the route whose official card was dismissed.
 */
export function forgetRoute(state: ScanState, route: string): void {
  state.queued.delete(route)
  state.pending.delete(route)
  state.missedScans.delete(route)
  state.committing.delete(route)
  persistLedger(state)
}

/**
 * The write intents one staged declaration survives against the SAVED row,
 * decided PER PART: staging never overwrites what the document already says,
 * but a part the document took over must not silence its sibling. Returns
 * null when nothing is left to write (the model vanished from the card, or
 * every part was taken over / is a keep) -- the caller withdraws the staging.
 */
export interface EffectiveStagedIntents {
  efforts: EffortWriteIntent
  compat?: CompatSuggestion
  input?: InputModalities
  /** The staged default-effort pick, when the staging carried one. */
  defaultEffort?: string | null
}

export function effectiveStagedIntents(
  declaration: StagedDeclaration,
  current: Record<string, unknown> | undefined,
  autofill?: AutofillFootprint,
): EffectiveStagedIntents | null {
  if (current === undefined) return null
  // Ladder part: a declaration or a deliberate-unset marker on the row owns
  // it — EXCEPT when the stored declaration is this plugin's own host autofill
  // (the knowledge base proposal it lays down in the route-creation window).
  // That is a suggestion, not a user decision, so a staged intent outranks it;
  // anything else (a hand-tuned ladder, a marker) is a real takeover. 'keep'
  // means the staging never carried the ladder anyway.
  //
  // Provenance first: a ladder carrying the host autofill's marker IS the
  // knowledge base's proposal, whatever its bytes are. The host fills
  // in-process the instant a provider is committed, so by the time this flush
  // runs its own suggestion is already in the document — byte equality alone
  // then reads the user's staged intent as a document takeover and silently
  // drops it (the reported "configured it on the card, saved, and it is gone").
  const ladderMarked =
    current[UNSET_MARKER] !== true
    && current['reasoningEfforts'] !== undefined
    && typeof current[AUTOFILL_MARKER] === 'number'
  const ladderAutofilled =
    ladderMarked
    || (current[UNSET_MARKER] !== true
      && autofill?.efforts !== undefined
      && sameEffortsValue(current['reasoningEfforts'], autofill.efforts))
  const ladderTaken = ladderAutofilled
    ? false
    : current['reasoningEfforts'] !== undefined
      || current[UNSET_MARKER] === true
      || declaration.efforts === 'keep'
  // Modality part: the same provenance rule, decided per part. The knowledge
  // base disclosure the autofill wrote does not answer over a staged choice,
  // while a disclosure that differs from the footprint is a hand-made one and
  // stands. A ladder-only 'keep' staging leaves the stored modality alone, just
  // as before — the staging never carried a modality in that case.
  const inputAutofilled =
    current[INPUT_UNSET_MARKER] !== true
    && autofill?.input !== undefined
    && sameInputList(current['input'], autofill.input)
  const inputTaken = inputAutofilled
    ? false
    : (Array.isArray(current['input']) && current['input'].length > 0)
      || current[INPUT_UNSET_MARKER] === true
  const efforts: EffortWriteIntent = ladderTaken ? 'keep' : declaration.efforts
  const input = inputTaken ? undefined : declaration.input
  // The default-effort pick has no takeover question: host autofill never
  // writes this field, so whatever the document holds is a user decision and
  // the staged intent (write or clear) passes through untouched.
  const defaultEffort = declaration.defaultEffort
  if (efforts === 'keep' && input === undefined && defaultEffort === undefined) return null
  return {
    efforts,
    ...(declaration.compat === undefined ? {} : { compat: declaration.compat }),
    ...(input === undefined ? {} : { input }),
    ...(defaultEffort === undefined ? {} : { defaultEffort }),
  }
}

/** What this plugin's host autofill would write for one model, as the flush compares it. */
export interface AutofillFootprint {
  efforts?: ReasoningEfforts | false
  input?: InputModalities
}

/** Semantic equality of two reasoningEfforts dict values (key set + wire strings). */
function sameEffortsValue(a: unknown, b: ReasoningEfforts | false): boolean {
  if (a === b) return true
  if (!isRecord(a) || !isRecord(b)) return false
  const keys = Object.keys(b)
  if (Object.keys(a).length !== keys.length) return false
  const other = b as Record<string, unknown>
  return keys.every(key => a[key] === other[key])
}

/** Semantic equality of a raw input value with a modality list (order-insensitive). */
function sameInputList(a: unknown, b: InputModalities): boolean {
  if (!Array.isArray(a) || a.length !== b.length) return false
  const set = new Set<string>(b)
  return a.every(member => typeof member === 'string' && set.has(member))
}

/**
 * Shape guard for a restored held write. The ledger is `sessionStorage`, so a
 * foreign or half-written file must be rejected before its entries reach
 * `writeModelRows` (a schema-level refusal there is noisy and late).
 */
function isHeldWrite(value: unknown): value is HeldWrite {
  if (!isRecord(value)) return false
  const efforts = value['efforts']
  return efforts === false || efforts === 'keep' || isRecord(efforts)
}

/**
 * Flush staged declarations for routes that now exist, writing each model's
 * declaration through the live write seam. A model the saved profile does not
 * carry yet keeps its staging (the row may still be mid-creation -- the user
 * edits the card after staging -- and the declaration lands whenever the row
 * first appears); each PART is decided against the saved row via
 * {@link effectiveStagedIntents}, with the host autofill's knowledge-base
 * footprint passed in so the plugin's own proposal never outranks a staged
 * user intent. A write that still fails (conflict retry exhausted) stays
 * staged; the write's own document-updated invalidation re-scans and
 * re-flushes it.
 * @returns whether a write of this route was refused and left unlanded.
 */
async function flushRoute(
  deps: InjectorDeps,
  state: ScanState,
  route: string,
  models: ReadonlyMap<string, StagedDeclaration>,
  ignoreFence = false,
): Promise<boolean> {
  // ONE read for the whole route: the rows all live in the same array, so a
  // per-model read was pure repetition. Every arbitration below still runs
  // per model against this same snapshot -- the write is one whole-array set.
  const join = await deps.describeNamespace()
  const providers = providersOf(join.namespace)
  // Snapshot: the loop below withdraws entries whose edit proved empty, and
  // the batch then reports back per model as its results land.
  const intents: RowIntent[] = []
  for (const [modelId, declaration] of [...models]) {
    const current = modelsOf(providers, route).find(model => model['id'] === modelId)
    // The row is not saved yet (mid-edit card, or the user renamed it):
    // keep the staging instead of dropping it -- it lands when a row with
    // this id first appears; the scan's ghost pass withdraws staging whose
    // row is provably gone.
    if (current === undefined) continue
    // A concurrent scan may have withdrawn this staging while our read was
    // in flight (the two-scan ghost pass): writing it anyway would resurrect
    // a declaration nothing on the page owns anymore.
    if (state.pending.get(route)?.get(modelId) !== declaration) continue
    // Mirror the host autofill's suggestion for this exact row (same facts,
    // same knowledge base) so {@link effectiveStagedIntents} can tell the
    // plugin's own proposal apart from a user decision.
    const routeInfo = routeFactsOf(providers, route)
    const name = typeof current['name'] === 'string' ? current['name'] : undefined
    const suggestion = suggestEfforts(modelId, name === undefined ? routeInfo : { ...routeInfo, displayName: name })
    const effective = effectiveStagedIntents(declaration, current, {
      ...(suggestion.efforts === undefined ? {} : { efforts: suggestion.efforts }),
      ...(suggestion.input === undefined ? {} : { input: suggestion.input }),
    })
    if (effective === null) {
      stageEffortsInto(state, route, modelId, undefined)
      continue
    }
    intents.push({
      modelId,
      efforts: effective.efforts,
      ...(effective.compat === undefined ? {} : { compat: effective.compat }),
      ...(effective.input === undefined ? {} : { input: effective.input }),
      ...(effective.defaultEffort === undefined ? {} : { defaultEffort: effective.defaultEffort }),
    })
  }
  if (intents.length === 0) return false
  // Seed the write's FIRST read with the snapshot this pass already took: one
  // read per route instead of two. A conflict retry re-describes fresh through
  // the live seam, so the seed never costs the write its recovery path.
  let seeded = false
  const results = await writeModelRows(deps.api, route, intents, () => {
    if (!seeded) {
      seeded = true
      return Promise.resolve(join)
    }
    return deps.describeNamespace()
  }, ignoreFence ? undefined : officialCardOpen)
  let failed = false
  intents.forEach((intent, at) => {
    const result = results[at]
    // A card opened during the read: keep the staging, do not back off.
    if (result?.aborted === true) return
    if (result?.ok === true || result?.modelNotFound === true) {
      stageEffortsInto(state, route, intent.modelId, undefined)
      return
    }
    // Anything else keeps the staging (the next scan retries it), but a
    // silent keep is unobservable -- surface the failure for diagnostics, and
    // report it so the pass can back off instead of hammering.
    failed = true
    console.error(`[bre] staged flush write failed for "${route}"/"${intent.modelId}": ${result?.error ?? 'unknown'}`)
  })
  return failed
}

/**
 * Replay every editor-held write through a HOLDER-LESS seam, so the very call
 * that would have fought the official card now commits. A row that vanished
 * meanwhile drops its entry instead of retrying forever; any other failure
 * stays queued for the next idle pass.
 *
 * The LANDING DECISION lives here (issue #7 / C2), per route, because this
 * ledger is the one the official card's Save governs:
 *   - the user committed -> write it, now that the card is gone;
 *   - the official action row was never readable in this session -> the signal
 *     cannot be trusted, so degrade to "the card went away, write it": writing
 *     too much is recoverable, losing the declaration is not;
 *   - otherwise the card closed with neither signal (the user just walked
 *     away) -> the intent waits rather than landing behind a frozen baseline.
 *
 * A DISMISSED card has no branch here on purpose: its cancel clears the ledger
 * the moment it is pressed ({@link forgetRoute}), so "dismissed" can never
 * outlive the card it belonged to and swallow a later save of the same route.
 * @param deps - the injection dependencies.
 * @param state - mutable scan state.
 * @returns whether this pass left a write unlanded (the caller backs off).
 */
async function flushQueued(deps: InjectorDeps, state: ScanState, ignoreFence = false): Promise<boolean> {
  // A commit marker with nothing queued is SPENT: the official Save carried no
  // plugin edit (or the route was already landed). Dropping it here keeps it
  // from authorizing a later edit the user never saved.
  for (const route of [...state.committing]) {
    if (!state.queued.has(route)) state.committing.delete(route)
  }
  // Writability is the document's call, not the commit signal's: a memory /
  // non-loopback page refuses writes, and the held ledger obeys the same gate
  // the staged ledger already does. Wait for a landable route before paying
  // for the read, so a page whose intents are all uncommitted costs nothing.
  const landable = [...state.queued.keys()]
    .some(route => state.committing.has(route) || state.signalsUnavailable)
  if (!landable) {
    persistLedger(state)
    return false
  }
  const join = await deps.describeNamespace()
  if (join.writable !== true) {
    persistLedger(state)
    return false
  }
  let failed = false
  for (const [route, models] of [...state.queued]) {
    // The staged ledger has no official row whose Save could commit it; this
    // one does, so an uncommitted route waits instead of landing behind that
    // card's frozen revision baseline.
    const committed = state.committing.has(route)
    if (!committed && !state.signalsUnavailable) continue
    // One read, one mutate for the whole route: the held intents are per model
    // but the document is a single models array, so a per-model write was
    // rebuilding and rewriting that same array N times.
    const intents: RowIntent[] = [...models].map(([modelId, write]) => ({
      modelId,
      efforts: write.efforts,
      ...(write.compat === undefined ? {} : { compat: write.compat }),
      ...(write.input === undefined ? {} : { input: write.input }),
      ...(write.defaultEffort === undefined ? {} : { defaultEffort: write.defaultEffort }),
    }))
    const results = await writeModelRows(deps.api, route, intents, undefined, ignoreFence ? undefined : officialCardOpen)
    let aborted = false
    intents.forEach((intent, at) => {
      const result = results[at]
      // A card opened during the read: keep every intent, do not back off.
      if (result?.aborted === true) { aborted = true; return }
      if (result?.ok === true || result?.modelNotFound === true) {
        models.delete(intent.modelId)
        return
      }
      console.error(`[bre] held write failed for "${route}"/"${intent.modelId}": ${result?.error ?? 'unknown'}`)
    })
    if (models.size === 0) {
      state.queued.delete(route)
      // The marker is what authorizes the landing, so it is dropped only once
      // every intent of the route made it -- a refusal keeps both the intent
      // and the authority to retry it on the next pass.
      state.committing.delete(route)
    } else if (!aborted) {
      failed = true
    }
  }
  // The queue just shrank (landed intents) or stayed as it was (a route still
  // waiting for its card): either way the stored file must match what is left.
  persistLedger(state)
  return failed
}

/**
 * Land the create-card declarations whose route has appeared. Each route goes
 * through its own live describe, so one refused route cannot poison a sibling
 * that would have landed.
 * @param deps - the injection dependencies.
 * @param state - mutable scan state.
 * @returns whether a write was refused and left unlanded.
 */
async function flushPending(deps: InjectorDeps, state: ScanState, ignoreFence = false): Promise<boolean> {
  if (state.pending.size === 0) return false
  const join = await deps.describeNamespace()
  if (join.writable !== true) return false
  const providers = providersOf(join.namespace)
  let failed = false
  for (const [route, models] of [...state.pending]) {
    if (models.size === 0) {
      state.pending.delete(route)
      continue
    }
    // A create card still owns a route the document has not taken yet.
    if (!hasOwn(providers, route)) continue
    if (await flushRoute(deps, state, route, models, ignoreFence)) failed = true
  }
  persistLedger(state)
  return failed
}

/**
 * Find the first input/select whose aria-label starts with one of the labels.
 * Exported because the model-order pass reads a row's id and display name the
 * same way the editor reads them: by the official label stem, never by
 * position (the label's trailing number IS the position).
 */
export function inputValueByLabel(card: HTMLElement, labels: readonly string[]): string {
  for (const label of labels) {
    const input = Array.from(card.querySelectorAll<HTMLInputElement | HTMLSelectElement>('input[aria-label], select[aria-label]'))
      .find(candidate => (candidate.getAttribute('aria-label') ?? '').startsWith(label))
    if (input !== undefined && input.value.trim().length > 0) return input.value.trim()
  }
  return ''
}

/** The nearest editor card element of a trigger. */
function cardOf(trigger: Element): HTMLElement | undefined {
  return trigger.closest<HTMLElement>('[class*="editor"], [class*="rowCard"], [class*="addCard"]') ?? undefined
}

/**
 * The official per-row disclosure container (holds the capacity fields), or
 * undefined while that row is COLLAPSED: the official editor renders the
 * container only for an expanded row, so an untouched provider shows nothing
 * for its models to mount into.
 */
function disclosureOf(trigger: Element): HTMLElement | undefined {
  // The disclosure lives inside the trigger's own model row, not elsewhere in
  // the card: scoping to the row keeps each trigger's container distinct even
  // when several rows are expanded at once.
  const row = trigger.closest<HTMLElement>('[class*="modelEntry"]')
  if (row === null) {
    // Fall back to the card scope (stale or unusual structure).
    const card = cardOf(trigger)
    if (card === undefined) return undefined
    const candidates = Array.from(card.querySelectorAll<HTMLElement>('[class*="modelAdvanced"]'))
    return candidates.find(candidate => candidate.offsetParent !== null) ?? candidates[0]
  }
  const candidates = Array.from(row.querySelectorAll<HTMLElement>('[class*="modelAdvanced"]'))
  return candidates.find(candidate => candidate.offsetParent !== null) ?? candidates[0]
}

/**
 * The official disclosure trigger of one model row: the chevron whose own
 * aria-label carries the row's capacity copy ("Capacities 2" / "容量 2"). The
 * same prefix match the scan finds a row's trigger by — never a position.
 */
function disclosureTriggerOf(row: HTMLElement, capacityLabels: readonly string[]): HTMLButtonElement | undefined {
  return Array.from(row.querySelectorAll<HTMLButtonElement>('button[aria-label]'))
    .find(button => capacityLabels.some(label => (button.getAttribute('aria-label') ?? '').startsWith(label)))
}

/** Wait for a render, with a timer bound for tabs that suspend animation frames. */
function nextFrame(): Promise<void> {
  return new Promise<void>(resolve => {
    if (typeof window.requestAnimationFrame !== 'function') {
      resolve()
      return
    }
    let frame: number | undefined
    const finish = (): void => {
      window.clearTimeout(timer)
      if (frame !== undefined) window.cancelAnimationFrame(frame)
      resolve()
    }
    // One completion owns both handles, so neither winner leaves work behind.
    const timer = window.setTimeout(finish, 100)
    frame = window.requestAnimationFrame(finish)
  })
}

/**
 * Whether the official page ships its own input-types editor inside this
 * row's disclosure (0.1.6-alpha.2's `ModelInputTypes` fieldset). This is the
 * CAPABILITY signal the plugin sniffs to stand its own modality section down:
 * a DOM fact, matched by the official class-name stem the same way the
 * `modelAdvanced` anchor is — never a kernel version number.
 */
function officialInputTypesOf(container: HTMLElement): boolean {
  return container.querySelector('[class*="modelInputTypes"]') !== null
}

/** The official reasoning group's class-name stem (see {@link officialReasoningOf}). */
const OFFICIAL_REASONING_STEM = 'modelReasoning'

/**
 * Marks the official reasoning group THIS plugin stood down, so a later scan
 * lifts that plugin's hide and nothing else's (see {@link showOfficialReasoning}).
 */
const REASONING_HIDDEN_ATTR = 'data-bre-reasoning-hidden'

/**
 * The official page's own per-model reasoning-levels group inside this row's
 * disclosure (0.2.1-rc.2's `ModelReasoningEfforts`), or undefined on a kernel
 * that ships none.
 *
 * Matched the way every other anchor here is — by the official class-name stem,
 * never by a kernel version. Every class in that subtree is a LONGER stem
 * (`modelReasoningHead`, `modelReasoningLabel`, `modelReasoningRow`, …) and the
 * group is the row's only such subtree, so the container's first match in
 * document order is the group root: standing it down takes the official head,
 * its switch and all of its level rows with it in one write.
 */
export function officialReasoningOf(container: HTMLElement): HTMLElement | undefined {
  return container.querySelector<HTMLElement>(`[class*="${OFFICIAL_REASONING_STEM}"]`) ?? undefined
}

/**
 * Stand the official reasoning-levels group down for a row whose levels this
 * plugin's own editor now owns.
 *
 * The host renders BOTH controls for one field — its own 推理等级 group beside
 * this plugin's 思考等级 editor — which is two editors for the same declaration,
 * and the plugin's is the one that stays: it is the surface that also carries
 * the modality echo, the remembered level and the compat fields, none of which
 * the official group knows about. A row whose document is not writable is
 * covered too: the official group is disabled by that same state, so hiding it
 * costs no editing path the plugin's read-only editor does not already stand in
 * for.
 *
 * The hide is the element's OWN inline `display`, written only when it differs
 * (compare-before-write, like every other DOM write here): the host renders this
 * element from props that carry no `display`, so React never writes the property
 * back, and no stylesheet of ours has to know the official class hash. The
 * marker attribute is what later lets {@link showOfficialReasoning} tell a hide
 * of ours from one the host wrote itself.
 */
export function hideOfficialReasoning(container: HTMLElement): void {
  const group = officialReasoningOf(container)
  if (group === undefined) return
  // Already off screen — the host's own doing, e.g. a card that renders this
  // group hidden. There is nothing to stand down, and nothing to MARK: claiming
  // it here is what would let a later show lift a hide this plugin never made.
  if (group.style.display === 'none') return
  group.setAttribute(REASONING_HIDDEN_ATTR, '1')
  group.style.display = 'none'
}

/**
 * Hand the official reasoning group back: the row's editor is going away, so the
 * plugin no longer stands in for that control and must not leave the field
 * hidden on the page the user still has open.
 *
 * Only a group THIS plugin stood down is restored — the marker attribute is what
 * proves it — so an inline `display` the host wrote itself is left as it is.
 */
export function showOfficialReasoning(container: HTMLElement): void {
  const group = officialReasoningOf(container)
  if (group === undefined) return
  if (group.getAttribute(REASONING_HIDDEN_ATTR) !== '1') return
  group.removeAttribute(REASONING_HIDDEN_ATTR)
  if (group.style.display === 'none') group.style.display = ''
}

/**
 * The official capacity/input-type chrome THIS plugin stood down. The editor
 * carries both decisions now (the design board puts 文本/图片 beside 默认思考
 * 强度 and the two token counts inside the same card), so the official copies
 * would be a second, smaller surface for the same fields.
 */
const CAPACITY_HIDDEN_ATTR = 'data-bre-capacity-hidden'

/** The official disclosure's capacity labels and the input-types fieldset. */
function capacityChromeOf(container: HTMLElement): HTMLElement[] {
  return Array.from(container.children).filter((child): child is HTMLElement => {
    if (child.nodeType !== 1) return false
    const element = child as HTMLElement
    return element.matches('[class*="modelField"]') || element.matches('[class*="modelInputTypes"]')
  })
}

/**
 * Stand the official context-window / max-output labels and the input-types
 * fieldset down for a row whose editor renders those same decisions.
 *
 * Only DIRECT children of the disclosure are touched: the editor's own inputs
 * (and its own modality pills) live inside `.bre-effort-slot`, which carries
 * neither class stem. The marker attribute distinguishes this hide from one the
 * host wrote itself, exactly like {@link hideOfficialReasoning}.
 */
export function hideOfficialCapacityChrome(container: HTMLElement): void {
  for (const element of capacityChromeOf(container)) {
    if (element.style.display === 'none') continue
    element.setAttribute(CAPACITY_HIDDEN_ATTR, '1')
    element.style.display = 'none'
  }
}

/** Hand the official capacity/input-type chrome back when the editor goes. */
export function showOfficialCapacityChrome(container: HTMLElement): void {
  for (const element of capacityChromeOf(container)) {
    if (element.getAttribute(CAPACITY_HIDDEN_ATTR) !== '1') continue
    element.removeAttribute(CAPACITY_HIDDEN_ATTR)
    if (element.style.display === 'none') element.style.display = ''
  }
}

/** The official input-types checkbox an image verdict belongs to, or undefined
 * when this row ships no such control (a legacy kernel) — or ships one whose
 * boxes cannot be told apart.
 *
 * The official fieldset maps its two choices in a fixed order (`["text",
 * "image"]`) and labels each one, so the image box is the one whose own label
 * carries the image copy — matched like every other anchor, by copy, with the
 * second box as the fallback for a host whose copy is in a language neither
 * this plugin's locale nor its English floor knows: the order still identifies
 * it.
 */
export function officialImageCheckboxOf(container: HTMLElement, imageLabels: readonly string[]): HTMLInputElement | undefined {
  const fieldset = container.querySelector<HTMLElement>('[class*="modelInputTypes"]')
  if (fieldset === null) return undefined
  const boxes = Array.from(fieldset.querySelectorAll<HTMLInputElement>('input[type="checkbox"]'))
  const labelled = boxes.find(box => {
    const text = box.closest('label')?.textContent?.trim()
    return text !== undefined && imageLabels.includes(text)
  })
  if (labelled !== undefined) return labelled
  return boxes.length === 2 ? boxes[1] : undefined
}

/**
 * Print a verdict about images on the OFFICIAL input-types control, and report
 * whether that control now owns the row's modality.
 *
 * The official checkbox renders the official card's own DRAFT, not the
 * settings document, so a document write of the plugin's can never tick it
 * before the card is saved and reopened — the gap the user hit. Clicking the
 * box is a real user-equivalent edit: the official form holds the tick in its
 * draft and its own Save is what persists it. That is also why a row reaching
 * this path must keep the modality OUT of its own write (see
 * {@link officialModalityIntent}): two writers for one field would let this
 * plugin's held write land after that Save and revert whatever the user chose
 * in the meantime.
 *
 * A missing box, or a DISABLED one (a read-only card, which will not carry the
 * click anywhere), reports `false` so the caller keeps its own write — the
 * only remaining way the verdict can reach the document.
 */
export function echoOfficialModality(container: HTMLElement, image: boolean, imageLabels: readonly string[]): boolean {
  const box = officialImageCheckboxOf(container, imageLabels)
  if (box === undefined || box.disabled) return false
  if (box.checked !== image) box.click()
  return true
}

/**
 * The modality intent a row's own write may carry, once the official
 * input-types control has been offered the verdict.
 *
 * `undefined` out means the write states nothing about the modality: either it
 * never carried one, or the official control took the verdict over. A row with
 * no such control — a legacy kernel, or a row the user has left folded — hands
 * its intent through unchanged, which keeps the document write as the way the
 * verdict travels.
 *
 * `null` is the plugin's deliberate UNSET, which the official control cannot
 * express at all (it knows only text and text+image): it passes through
 * untouched.
 */
export function officialModalityIntent(
  container: HTMLElement | undefined,
  input: InputModalities | null | undefined,
  imageLabels: readonly string[],
): InputModalities | null | undefined {
  if (input === undefined || input === null || container === undefined) return input
  return echoOfficialModality(container, input.includes('image'), imageLabels) ? undefined : input
}

/**
 * The official capacity inputs of one row's disclosure (context window, max
 * output), or whatever of them could be identified.
 *
 * Two anchors, most specific first, plus a positional floor:
 *   1. an input whose own aria-label starts with the field's copy — the same
 *      prefix match every other official control is found by;
 *   2. an input whose WRAPPING LABEL's text carries the copy — the DSH host
 *      renders these fields label-wrapped with no aria-label of their own;
 *   3. the disclosure's remaining plain inputs in document order, first =
 *      context window, second = max output. The floor only answers for a row
 *      whose labels matched nothing (an unnamed host variant); the DSH
 *      disclosure holds exactly these two inputs.
 *
 * The plugin's own editor sits inside the same disclosure, and a folded-row
 * visit scopes the search to the whole row (head inputs included), so both are
 * kept out of the candidate set: the editor by its `data-plugin` root, the row
 * head's Model ID / Display name by their aria-labels.
 */
export interface OfficialCapacityInputs {
  contextWindow?: HTMLInputElement
  maxOutput?: HTMLInputElement
}

/** Whether one input answers to a field's copy (aria-label prefix or wrapping-label text). */
function inputLabelledBy(input: HTMLInputElement, labels: readonly string[]): boolean {
  const aria = input.getAttribute('aria-label') ?? ''
  if (labels.some(label => aria.startsWith(label))) return true
  const text = input.closest('label')?.textContent?.trim() ?? ''
  return text.length > 0 && labels.some(label => text.includes(label))
}

export function officialCapacityInputsOf(scope: HTMLElement, labels: HostLabels): OfficialCapacityInputs {
  const named = [...labels.modelId, ...labels.modelName]
  const candidates = Array.from(scope.querySelectorAll<HTMLInputElement>('input'))
    .filter(input => input.type !== 'checkbox' && input.type !== 'radio')
    .filter(input => input.closest('[data-plugin]') === null)
    .filter(input => !named.some(label => (input.getAttribute('aria-label') ?? '').startsWith(label)))
  const contextWindow = candidates.find(input => inputLabelledBy(input, labels.contextWindow))
  const maxOutput = candidates.find(input => inputLabelledBy(input, labels.maxOutput))
  if (contextWindow !== undefined && maxOutput !== undefined) return { contextWindow, maxOutput }
  const unnamed = candidates.filter(input => input !== contextWindow && input !== maxOutput)
  return {
    contextWindow: contextWindow ?? unnamed[0],
    maxOutput: maxOutput ?? (contextWindow !== undefined ? unnamed[0] : unnamed[1]),
  }
}

/**
 * Print a suggestion's reference capacities on the official inputs of one row.
 *
 * Like the modality echo, this edits the official form's own DRAFT — the inputs
 * render the card's state, not the settings document, so writing the document
 * could never show a value in them before the card is saved and reopened. The
 * value goes through the native setter and a bubbled `input` event so React's
 * controlled input carries it into the draft, and the card's own Save is what
 * persists it. That is also why the capacities never ride the plugin's document
 * write: two writers for one field would let a held write land after that Save
 * and revert whatever the user chose in the meantime.
 *
 * FILL-ONLY: an input that already holds a positive number is a user decision
 * and keeps its place — auto-adapt fills blanks, it does not overwrite.
 * @returns which of the two fields actually landed a value.
 */
export function echoOfficialCapacities(
  scope: HTMLElement,
  labels: HostLabels,
  values: { contextWindow?: number; maxTokens?: number },
): { contextWindow: boolean; maxOutput: boolean } {
  const inputs = officialCapacityInputsOf(scope, labels)
  const fill = (input: HTMLInputElement | undefined, value: number | undefined): boolean => {
    if (input === undefined || input.disabled) return false
    if (value === undefined || !Number.isFinite(value) || value <= 0) return false
    // A filled field is a decision, even when the catalogue spells it "1M".
    if (parseCapacity(input.value) !== undefined) return false
    return landCapacity(input, String(value))
  }
  return {
    contextWindow: fill(inputs.contextWindow, values.contextWindow),
    maxOutput: fill(inputs.maxOutput, values.maxTokens),
  }
}

/**
 * Put one text into an official capacity input through React's own path.
 *
 * React controls these inputs: assigning `value` directly would be undone by the
 * next render, so the write goes through the prototype's setter and a bubbled
 * input event — the change reaches the card's draft and stays.
 */
function landCapacity(input: HTMLInputElement, next: string): boolean {
  if (input.disabled) return false
  if (input.value === next) return true
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set
  setter?.call(input, next)
  input.dispatchEvent(new Event('input', { bubbles: true }))
  return true
}

/**
 * Read the official capacity inputs as the row's form currently holds them.
 *
 * The editor's two fields seed from this rather than from a suggestion: the
 * numbers belong to the form's draft (the catalogue's value, the user's own
 * typing, or a suggestion already echoed into it), and the draft is the only
 * place they exist before the card is saved.
 */
export function readOfficialCapacities(
  scope: HTMLElement,
  labels: HostLabels,
): { contextWindow?: number; maxTokens?: number } {
  const inputs = officialCapacityInputsOf(scope, labels)
  const read = (input: HTMLInputElement | undefined): number | undefined => {
    if (input === undefined) return undefined
    // The official draft may hold the catalogue's shorthand ("1M", "128K"),
    // not only digits; one parser with the editor's fields keeps both in sync.
    return parseCapacity(input.value)
  }
  const contextWindow = read(inputs.contextWindow)
  const maxTokens = read(inputs.maxOutput)
  return {
    ...(contextWindow === undefined ? {} : { contextWindow }),
    ...(maxTokens === undefined ? {} : { maxTokens }),
  }
}

/**
 * Write the editor's capacity fields into the official inputs — the USER's own
 * typing, so unlike {@link echoOfficialCapacities} this one overwrites, and
 * `undefined` empties the field (a capacity that inherits the catalogue value
 * again instead of being pinned). A key the caller omits is left untouched.
 * @returns which of the two fields the write actually changed.
 */
export function writeOfficialCapacities(
  scope: HTMLElement,
  labels: HostLabels,
  next: { contextWindow?: number | undefined; maxTokens?: number | undefined },
): { contextWindow: boolean; maxOutput: boolean } {
  const inputs = officialCapacityInputsOf(scope, labels)
  const write = (input: HTMLInputElement | undefined, value: number | undefined): boolean => {
    if (input === undefined) return false
    return landCapacity(input, value === undefined || !Number.isFinite(value) || value <= 0 ? '' : String(value))
  }
  return {
    contextWindow: 'contextWindow' in next ? write(inputs.contextWindow, next.contextWindow) : false,
    maxOutput: 'maxTokens' in next ? write(inputs.maxOutput, next.maxTokens) : false,
  }
}

/**
 * Print a verdict about images on the OFFICIAL input-types control of ONE row.
 *
 * The official fieldset exists for an OPENED row only, and the fold belongs to
 * the user: a bulk adapt that clicked rows open and left them that way unfolded
 * every model of the provider, which is the first report this answers. Leaving
 * them shut was the second: the box then never got its tick at all, because the
 * control renders the card's DRAFT and no document write of this plugin's can
 * reach it before the card is saved and reopened.
 *
 * So a folded row is visited, not unfolded: the row is opened for exactly as
 * long as it takes to click the box and is closed again on the way out. Both
 * clicks land in the same task, so the browser never paints the opened row —
 * what the user sees at rest is their own fold, and the tick they were missing
 * is inside it, held by the card's draft for the card's own Save to persist.
 *
 * `false` out means the official control does not own the row's modality — no
 * such control (a legacy kernel), a disabled one (a read-only card), or a visit
 * that found nothing to click — and the caller keeps its own write.
 */
async function imprintModality(
  container: HTMLElement | undefined,
  labels: HostLabels,
  settle: () => Promise<void>,
): Promise<boolean> {
  if (container === undefined) return false
  const imageLabels = labels.inputImage
  // Already on screen: print the verdict on it, nothing to open.
  if (officialInputTypesOf(container)) return echoOfficialModality(container, true, imageLabels)
  const row = container.closest<HTMLElement>('[class*="modelEntry"]') ?? container
  // Open, but with no input-types control inside it: this host ships none for
  // this row (a legacy kernel), so there is nothing to tick and nothing to
  // visit — the caller's own write is what carries the verdict.
  if (row.querySelector('[class*="modelAdvanced"]') !== null) return false
  const trigger = disclosureTriggerOf(row, labels.capacity)
  if (trigger === undefined || trigger.disabled) return false
  trigger.click()
  if (!officialInputTypesOf(row)) await settle()
  try {
    return officialInputTypesOf(row) && echoOfficialModality(row, true, imageLabels)
  } finally {
    // Restore the fold the user owns, whether or not there was a box to tick,
    // and never leave a row this pass opened standing open.
    trigger.click()
  }
}

/**
 * Visit ONE row's disclosure and run an action inside it: the verdicts a FOLDED
 * row can only receive through its own official controls (the input-types
 * checkbox, the capacity inputs) render the card's draft, so they have to be
 * printed on the controls themselves — and the controls do not exist until the
 * row is opened.
 *
 * A folded row is opened for exactly as long as the action needs and closed on
 * the way out; both clicks land in the same task, so the browser never paints
 * the opened row and what the user sees at rest is their own fold. An ALREADY
 * open row — the mounted editor's own disclosure container, or a row the user
 * unfolded — is acted on in place, with nothing to visit.
 *
 * `false` out means the disclosure could not be reached at all (no trigger, a
 * disabled one, or a visit that never opened anything); whatever the action
 * itself reports travels back otherwise.
 */
async function visitRowDisclosure<T>(
  seat: HTMLElement,
  labels: HostLabels,
  settle: () => Promise<void>,
  act: (scope: HTMLElement) => T,
): Promise<T | false> {
  if (seat.matches('[class*="modelAdvanced"]')) return act(seat)
  const row = seat.closest<HTMLElement>('[class*="modelEntry"]') ?? seat
  if (row.querySelector('[class*="modelAdvanced"]') !== null) return act(row)
  const trigger = disclosureTriggerOf(row, labels.capacity)
  if (trigger === undefined || trigger.disabled) return false
  trigger.click()
  if (row.querySelector('[class*="modelAdvanced"]') === null) await settle()
  try {
    return row.querySelector('[class*="modelAdvanced"]') !== null ? act(row) : false
  } finally {
    // Restore the fold the user owns, and never leave a row this pass opened
    // standing open.
    trigger.click()
  }
}

/**
 * One auto-adapt seat per card that has models on screen: the card's own
 * catalogue, paired with the route that card edits. Deduped by card, because
 * every model row of a card shares the one catalogue head.
 */
/**
 * Seat the auto-adapt control on an open card whose model list is empty.
 *
 * The host keeps the catalogue head (获取可用模型) after the last row is
 * deleted. The seat has to stay beside that link, or the link jumps. A card
 * whose route cannot be read keeps whatever seat the previous pass left: a
 * settings read that has not landed yet must not flash the control away.
 */
function seatEmptyCatalog(
  root: HTMLElement,
  deps: InjectorDeps,
  state: ScanState,
  join: SettingsJoin,
  labels: HostLabels,
): void {
  if (state.disposed || !root.isConnected) return
  if (officialCardOf(root) === undefined) return
  const stillEmpty = !Array.from(root.querySelectorAll<HTMLButtonElement>('button[aria-label]'))
    .some(button => labels.capacity.some(label => (button.getAttribute('aria-label') ?? '').startsWith(label)))
  if (!stillEmpty) return
  reconcileAutoEffortSeats(root, emptyCatalogTargets(root, providersOf(join.namespace), labels), {
    t: deps.t,
    onRequest: route => adaptEveryModel(state, deps, route),
  })
}

/** One seat per catalogue whose card still has a head and a readable route. */
function emptyCatalogTargets(
  root: HTMLElement,
  providers: Record<string, Record<string, unknown>>,
  labels: HostLabels,
): AutoEffortSeatTarget[] {
  const targets: AutoEffortSeatTarget[] = []
  // The CONTAINERS, not every element whose class name carries the stem: the
  // heading, the title and the meta are matches too, and seating inside them
  // collapses the official heading to one character per line. See
  // {@link cataloguesOf}.
  for (const catalogue of cataloguesOf(root)) {
    const card = cardOf(catalogue)
    if (card === undefined) continue
    const resolved = routeOfCard(card, providers, labels)
    if (resolved === undefined || resolved.staged) continue
    targets.push({ catalogue, route: resolved.route })
  }
  return targets
}

function autoEffortTargets(
  found: readonly FoundModel[],
  providers: Record<string, Record<string, unknown>>,
  labels: HostLabels,
): AutoEffortSeatTarget[] {
  const targets: AutoEffortSeatTarget[] = []
  const seen = new Set<HTMLElement>()
  for (const model of found) {
    if (seen.has(model.card)) continue
    seen.add(model.card)
    const resolved = routeOfCard(model.card, providers, labels)
    if (resolved === undefined) continue
    const [catalogue] = cataloguesOf(model.card)
    if (catalogue === undefined) continue
    targets.push({ catalogue, route: resolved.route })
  }
  return targets
}

/**
 * One model row a card shows on screen: what the walk needs to name it, plus
 * the row element itself, so a verdict about its modality can be printed on
 * the row's own official control (which lives inside the row, collapsed or
 * not). The element is optional because a caller may know the rows only by
 * their ids.
 */
export interface ScreenModel {
  readonly id: string
  readonly name: string
  readonly row?: HTMLElement
}

/**
 * The models one route's card shows on screen, from the scan's own rows.
 *
 * The provider-wide adapt reads the settings document, which cannot know the
 * rows the card holds but has not saved yet; this list is what the pass
 * extends its walk with, so a card the user is still editing is adapted in the
 * same click instead of being deferred behind a save. Rows the scan could not
 * name (a model id still being typed) and rows whose card resolves to another
 * route are left out: a write must only ever be held for a row it could see.
 */
function screenModels(
  found: readonly FoundModel[],
  route: string,
  providers: Record<string, Record<string, unknown>>,
  labels: HostLabels,
): ScreenModel[] {
  const rows: ScreenModel[] = []
  const seen = new Set<string>()
  for (const model of found) {
    if (model.modelId.length === 0 || seen.has(model.modelId)) continue
    if (routeOfCard(model.card, providers, labels)?.route !== route) continue
    seen.add(model.modelId)
    rows.push({ id: model.modelId, name: inputValueByLabel(model.row, labels.modelName), row: model.row })
  }
  return rows
}

function screenModelsLive(
  root: HTMLElement,
  route: string,
  providers: Record<string, Record<string, unknown>>,
  labels: HostLabels,
): ScreenModel[] {
  const rows: ScreenModel[] = []
  const seen = new Set<string>()
  for (const aria of labels.capacity) {
    const triggers = Array.from(root.querySelectorAll<HTMLButtonElement>('button[aria-label]'))
      .filter(button => (button.getAttribute('aria-label') ?? '').startsWith(aria))
    for (const trigger of triggers) {
      const card = cardOf(trigger)
      if (card === undefined) continue
      const row = trigger.closest<HTMLElement>('[class*="modelEntry"]') ?? card
      const modelId = inputValueByLabel(row, labels.modelId)
      if (modelId.length === 0 || seen.has(modelId)) continue
      if (routeOfCard(card, providers, labels)?.route !== route) continue
      seen.add(modelId)
      rows.push({ id: modelId, name: inputValueByLabel(row, labels.modelName), row })
    }
  }
  return rows
}

/**
 * Adapt every model of one provider, the rows the user never unfolded
 * included.
 *
 * The seat's click reaches the per-row editors through a document event, but
 * an editor only exists for a row with a disclosure container, and a collapsed
 * row renders none — so the visible answer is structurally incomplete. This
 * routine answers from the settings DOCUMENT instead of the DOM: every model
 * the provider declares goes through the same suggestion the row's own
 * auto-adapt would have asked for, is mapped by the same pure functions
 * ({@link ladderIntent}, {@link pendingWriteOf}) so both
 * paths write identical bytes, and lands by the same rule — nothing is written
 * while an official card holds the document; the write is held on the route
 * and the card's own Save commits it (issue #7 / C2).
 *
 * An expanded row answers for itself when its editor is mounted. A row the
 * user already configured (a stored ladder, an explicit "does not reason",
 * or a deliberate unset) is left alone — bulk adapt must not overwrite that.
 * A row that is expanded but still has no thinking-level declaration is not
 * configured: this walk adapts it too. Two writers never share one row,
 * because a configured expanded row is skipped here and an unconfigured one
 * has no in-flight ladder draft to protect.
 * @param state - mutable scan state: the adapting guard and the held ledger.
 * @param deps - the injection dependencies.
 * @param route - the provider route whose models are adapted.
 * @param state - mutable scan state: the adapting guard and the held ledger.
 * @param deps - the injection dependencies.
 * @param route - the provider route whose models are adapted.
 * @param visibleRows - the models the route's card shows on screen, from the
 *   scan's own rows (id and display name). The document cannot know the rows
 *   the card holds but has not saved yet, so the pass extends its walk with
 *   them: their holds land with the card's own Save, exactly like a row's own
 *   auto-adapt.
 * @returns what the pass did, so the seat can say something true about the
 *   click: how many models it held an adaptation for, how many had no
 *   suggestion, and -- when nothing could be adapted at all -- why.
 */
export async function adaptEveryModel(
  state: ScanState,
  deps: InjectorDeps,
  route: string,
  visibleRows: readonly ScreenModel[] = [],
): Promise<AutoAdaptReport> {
  // A second click while a pass is in flight is not a no-op the user should
  // read as success: 'busy' travels back so the seat keeps the verdict the
  // running pass is about to publish.
  if (route.length === 0) return { held: 0, unsuggested: 0, blocked: 'unknown-route' }
  if (state.adapting.has(route)) return { held: 0, unsuggested: 0, blocked: 'busy' }
  state.adapting.add(route)
  let held = 0
  let unsuggested = 0
  try {
    // A pass is a fresh judgement of the route's endpoints: start from the wire,
    // not from an answer a previous pass (or a probe of the key panel) left in
    // the probe cache. Within the pass, every model of the route shares one
    // read, which is what makes the walk cost one listing instead of one per
    // model.
    invalidateProbeCache()
    // One read for the whole run: `suggest` only ever READS the namespace here
    // (its endpoint probe is a read-only GET, it never resolves a credential),
    // the holds below change nothing the read depends on, and every model of
    // the route needs the same provider facts anyway.
    let join: Promise<SettingsJoin> | undefined
    const describe = (): Promise<SettingsJoin> => (join ??= deps.describeNamespace())
    const seen = await describe()
    const providers = providersOf(seen.namespace)
    // A read-only page has nothing to adapt. A route the document does not hold
    // YET is the create card's own typed id -- a card the user is filling in.
    // Its rows are still adapt-worthy: they are on screen, the user asked for
    // them, and every write this walk makes for such a row travels the STAGING
    // ledger, which lands with the card's own Save (and a cancelled card drops
    // it). Only a route with nothing on screen has nothing to adapt, and that
    // is reported as blocked -- never as "already configured", which the user
    // would read as a completed pass.
    if (seen.writable !== true) return { held: 0, unsuggested: 0, blocked: 'unwritable' }
    const known = hasOwn(providers, route)
    if (!known && visibleRows.length === 0) return { held: 0, unsuggested: 0, blocked: 'unknown-route' }
    // The ids the DOCUMENT knows, so the card's own unsaved rows can be told
    // apart from the ones it has already saved.
    const docModels = modelsOf(providers, route)
    const docIds = new Set<string>()
    for (const model of docModels) {
      const modelId = typeof model['id'] === 'string' ? model['id'] : ''
      if (modelId.length > 0) docIds.add(modelId)
    }
    // The card's own unsaved rows join the walk as fresh models: the document
    // cannot know a row the card holds but has not saved yet, yet the intent it
    // needs is exactly the intent the row's own auto-adapt makes -- it rides
    // the ledger and lands when the card's Save carries the row into the
    // document, and a card the user cancelled drops it with the card
    // ({@link forgetRoute}). A card the user is still editing is therefore
    // adapted in one click, not deferred behind a save. Synthetic entries carry
    // only id and name, so the lookups below read them as a fresh editor would:
    // no ladder, no modalities, nothing to preserve.
    const models = docModels.slice()
    for (const visible of visibleRows) {
      if (visible.id.length === 0 || docIds.has(visible.id)) continue
      models.push({ id: visible.id, name: visible.name })
    }
    if (models.length === 0) return { held: 0, unsuggested: 0, blocked: 'no-models' }
    const profile = providers[route] ?? {}
    const routeApi = typeof profile['api'] === 'string' ? profile['api'] as string : undefined
    // Expanded rows whose stored ladder is already a decision. An expanded row
    // with no declaration is NOT covered: the user asked bulk adapt to fill
    // exactly those, the same as a collapsed row.
    const covered = new Set<string>()
    // Every row of this route that is on screen, by the container it is mounted
    // in. A verdict about such a row's modality may have to be printed ON the
    // row's own official input-types control instead of written into the
    // document: that control renders the card's draft, so a document write
    // could never tick it before the card is saved and reopened. See
    // {@link officialModalityIntent}.
    const mountedContainers = new Map<string, HTMLElement>()
    for (const [container, entry] of state.mounted) {
      if (entry.props.route !== route) continue
      mountedContainers.set(entry.props.modelId, container)
      if (entry.props.efforts !== undefined) covered.add(entry.props.modelId)
    }
    // Every row of this route the scan put on screen, COLLAPSED ones included.
    // A collapsed row mounts no editor, so it never reaches `mountedContainers`
    // -- and it is exactly the row a card the user is still filling in shows.
    // Carrying its element here is what lets a modality verdict reach the
    // row's own official control (see {@link imprintModality}).
    const rowElements = new Map<string, HTMLElement>()
    for (const visible of visibleRows) {
      if (visible.row !== undefined) rowElements.set(visible.id, visible.row)
    }
    // Both arms are wired, and {@link stagedRow} picks per row -- the same rule
    // a row's own editor follows: a row the document already holds is a HOLD
    // that the official Save commits, a row the card has only fetched (and that
    // the Save still has to carry into the document) STAGES. Staging is the
    // only safe ledger for the second kind: {@link flushRoute} keeps a staged
    // declaration until a row with that id appears, while the queued ledger
    // DROPS a write whose row is missing at landing time. That drop is silent,
    // so a read that still lags the official Save -- exactly what the settings
    // mirror does -- would leave the ladder unwritten while the seat had already
    // reported the row as adapted, which is the user-visible lie this arm
    // removes.
    let stagedRow = false
    // Every write the walk lands for a row that is ON SCREEN goes through the
    // official input-types control first (see {@link officialModalityIntent}):
    // the walk must not race the official Save for the one field the user can
    // see and edit in the official form itself.
    const modalityIntent = (modelId: string, input: InputModalities | null | undefined): InputModalities | null | undefined =>
      officialModalityIntent(mountedContainers.get(modelId), input, deps.labels().inputImage)
    // The same offer, made BEFORE a row's write is committed. `true` out means
    // the official control carries the verdict, and the caller then keeps the
    // modality out of its own write -- the same single-writer rule
    // {@link officialModalityIntent} enforces for a row already unfolded. A row
    // with no such control answers `false`, and so does a row whose control
    // could not be reached: the document write is then what carries its verdict
    // (see {@link imprintModality}).
    const imprintFor = async (modelId: string, nextModality: { readonly image: boolean }): Promise<boolean> => {
      if (nextModality.image !== true) return false
      const container = mountedContainers.get(modelId) ?? rowElements.get(modelId)
      if (container === undefined) return false
      return imprintModality(container, deps.labels(), nextFrame)
    }
    /**
     * The same offer as {@link imprintFor}, made for BOTH halves a fresh
     * suggestion carries — the image verdict and the reference capacities — in
     * ONE disclosure visit ({@link visitRowDisclosure}), so a folded row is
     * opened once, not once per field. The capacities are a fill-only courtesy
     * ({@link echoOfficialCapacities}) and never part of the write; the
     * modality half answers whether the official input-types control took the
     * verdict over, which is what decides if the write still carries it.
     */
    const imprintRow = async (
      modelId: string,
      nextModality: { readonly image: boolean },
      values: { contextWindow?: number; maxTokens?: number },
    ): Promise<{ modality: boolean; capacities: boolean } | false> => {
      const wantsModality = nextModality.image === true
      const wantsCapacities = values.contextWindow !== undefined || values.maxTokens !== undefined
      if (!wantsModality && !wantsCapacities) return false
      const container = mountedContainers.get(modelId) ?? rowElements.get(modelId)
      if (container === undefined) return false
      const labels = deps.labels()
      return visitRowDisclosure(container, labels, nextFrame, scope => {
        const modality = wantsModality && officialInputTypesOf(scope) && echoOfficialModality(scope, true, labels.inputImage)
        const landed = wantsCapacities
          ? echoOfficialCapacities(scope, labels, values)
          : { contextWindow: false, maxOutput: false }
        return { modality, capacities: landed.contextWindow || landed.maxOutput }
      })
    }
    const api = createEditorApi(
      deps.api,
      describe,
      (stagedRoute, modelId, efforts, compat, input, defaultEffort) => {
        stageEffortsInto(state, stagedRoute, modelId, efforts, compat, modalityIntent(modelId, input), defaultEffort)
      },
      (heldRoute, modelId, write) => {
        queueWriteInto(state, heldRoute, modelId, { ...write, input: modalityIntent(modelId, write.input) })
      },
      undefined,
      () => stagedRow,
    )
    for (const model of models) {
      const modelId = typeof model['id'] === 'string' ? model['id'] : ''
      if (modelId.length === 0) continue
      const initialEfforts = effortsOf(models, modelId)
      const initialInput = inputOf(models, modelId)
      // A collapsed row has no editor, so the document is the only record.
      // Same rule as the expanded skip above: a stored ladder, `false`, or the
      // durable unset marker is a decision and must survive this click.
      const settledLadder = initialEfforts !== undefined || model[UNSET_MARKER] === true
      // The modality is the SECOND half of a declaration and is judged on its
      // own: a row whose ladder is a hand edit (or an earlier pass) and which
      // never said anything about images still lacks its vision flag -- and a
      // seat that reports the provider as configured while that flag stays off
      // is the same silent lie in a smaller place. So the statement about
      // images rides a ladder-less write of its own (`efforts: 'keep'`), see
      // {@link mergeRowIntent}.
      const settledModality = (Array.isArray(initialInput) && initialInput.length > 0)
        || model[INPUT_UNSET_MARKER] === true
      // An expanded row's mounted editor owns its LADDER: it answers this same
      // click through its own listener, so the walk stays out of that half. Its
      // modality gap is nobody's -- that listener refuses a row whose ladder is
      // already declared, which is exactly the row that still needs the image
      // flag. A row the editor has already reported an edit for IS left alone:
      // that queued intent is the user's latest word on the row.
      if (covered.has(modelId) && !settledLadder) continue
      if (settledLadder && settledModality) {
        // A fully settled row can STILL disagree with the control the user is
        // looking at: the official input-types fieldset renders the card's draft,
        // frozen when the card opened, so a modality written after that (this
        // seat's own earlier click, or the idle pass behind it) leaves the box
        // unticked until the card is saved and reopened -- the report that the
        // tick only shows up on the second visit. That control is the surface the
        // user reads, and clicking it is a user-equivalent edit, so a STORED
        // image declaration is echoed on it here too.
        //
        // Deliberately narrow: only a row whose fieldset is already ON SCREEN (a
        // collapsed row is a row the user is not reading, and unfolding it would
        // be a side effect this pass owes nobody), and only one-way -- a text-only
        // declaration is left alone and nothing here ever UNTICKS.
        //
        // It does not count as adapted: the declaration is already stored, so
        // there is nothing to write and the 'done' copy's promise ("save to
        // write") would be a lie. The verdict stays 'every model of this
        // provider already declares its levels', which is what is true while the
        // tick the user was missing appears.
        const visible = mountedContainers.get(modelId) ?? rowElements.get(modelId)
        if (Array.isArray(initialInput) && initialInput.includes('image') && visible !== undefined) {
          const imageLabels = deps.labels().inputImage
          const box = officialImageCheckboxOf(visible, imageLabels)
          if (box !== undefined && !box.disabled && !box.checked) {
            echoOfficialModality(visible, true, imageLabels)
          }
        }
        continue
      }
      const initialCompat = compatOf(models, modelId)
      const initialDefault = defaultEffortOf(models, modelId) ?? ''
      const reply = await api.suggest(route, modelId, nameOf(models, modelId))
      // 'no-suggestion' is the normal outcome for a model with no knowledge
      // match (the seat is a bulk convenience, not a promise): leave that row
      // exactly as it is, but COUNT it -- a pass that matched nothing at all
      // must not be indistinguishable from a provider that needs nothing.
      if (!reply.ok) {
        unsuggested += 1
        continue
      }
      const parts = reply.suggestion
      const nextThinking = parts.efforts !== false
      // The draft a fresh editor would hold, mapped exactly as its own commit
      // maps it: an untouched ladder and an untouched modality stay out of the
      // write rather than stamping an unset marker onto the row. The vendor
      // default travels the same way the row's own auto-adapt does: a fresh
      // editor starts from the stored pick and only reports a change.
      const nextModality = parts.input === undefined ? modalityFrom(initialInput) : modalityFrom(parts.input)
      if (settledLadder) {
        // The row's ladder is a decision, so this write states nothing about it
        // ('keep') and only fills the modality gap. A suggestion that names no
        // image is deliberately not written here: a text-only declaration adds
        // nothing the row lacks while silencing the host's own auto-fill.
        if (!nextModality.image) continue
        // The row's editor reported something for it: never overrule the user's
        // latest word with a suggestion (the held ledger keeps one write per
        // row, so this one would replace theirs).
        if (state.queued.get(route)?.has(modelId) === true) continue
        // This row's own control is on screen. The official input-types
        // checkbox renders the card's DRAFT, not the settings document, so a
        // write of ours could never tick it before the card is saved and
        // reopened — the user's report exactly. Print the verdict on the control
        // instead: the tick is immediate, the official Save is what persists it,
        // and a write that kept the modality would land after that Save and
        // could revert whatever the user chose in the meantime. The row still
        // counts as adapted — the verdict reached the only surface that can hold
        // it before the Save — and no write is queued at all, because with
        // `efforts: 'keep'` the modality WAS the whole message.
        //
        // A row whose control could not be reached is not left unfolded for this
        // (see {@link imprintModality}): `imprintFor` answers `false` and the
        // verdict rides the write below instead.
        if (await imprintFor(modelId, nextModality)) {
          held += 1
          continue
        }
        stagedRow = !docIds.has(modelId)
        api.commit(route, modelId, pendingWriteOf({
          efforts: 'keep',
          input: buildModalityIntent(nextModality),
        }))
        if (stagedRow) deps.onPendingChanged?.()
        stagedRow = false
        held += 1
        continue
      }
      const nextDefault = parts.defaultEffort ?? initialDefault
      const defaultEffort = nextDefault === initialDefault
        ? undefined
        : nextDefault === '' ? null : nextDefault
      // A row the document does not hold yet stages; a saved row holds.
      stagedRow = !docIds.has(modelId)
      // The modality AND the capacities go to the row's own official controls
      // first — folded row included, through ONE transient visit
      // ({@link visitRowDisclosure}) that puts the fold back — so both are in
      // the card's draft the moment the click lands. Neither rides the document
      // write: those controls render the card's draft, and a held write landing
      // after the Save would revert whatever the user changed in the meantime.
      const imprint = await imprintRow(modelId, nextModality, {
        ...(parts.contextWindow === undefined ? {} : { contextWindow: parts.contextWindow }),
        ...(parts.maxTokens === undefined ? {} : { maxTokens: parts.maxTokens }),
      })
      const imprinted = imprint !== false && imprint.modality
      api.commit(route, modelId, pendingWriteOf({
        efforts: ladderIntent(nextThinking, buildIntent(draftFrom(parts.efforts)), initialEfforts),
        input: imprinted || sameModality(nextModality, initialInput) ? undefined : buildModalityIntent(nextModality),
        defaultEffort,
        appliedCompat: parts.compat,
        routeApi,
        initialCompat,
      }))
      if (stagedRow) deps.onPendingChanged?.()
      stagedRow = false
      held += 1
    }
    return { held, unsuggested }
  } catch (error) {
    // The seat has no message area of its own, and one row's refusal must not
    // strand the rows behind it: report, keep whatever holds already landed.
    console.warn('[bre] provider-wide adapt failed:', error)
    return { held, unsuggested, failed: error instanceof Error ? error.message : String(error) }
  } finally {
    state.adapting.delete(route)
  }
}

/** Whether an editor is already mounted in a container (idempotency guard). */
function hasEditor(container: HTMLElement): boolean {
  return container.querySelector(`[data-plugin="${PLUGIN_ID}"]`) !== null
}

/**
 * Semantic equality of two mount-prop sets, so a scan only re-renders an
 * existing editor when the settings document actually moved under it. The
 * guard is what makes refresh safe under the MutationObserver: render mutates
 * DOM, DOM mutations schedule scans, and a no-op comparison ends the cycle.
 */
function sameProps(a: EditorMountProps, b: EditorMountProps): boolean {
  return a.route === b.route
    && a.routeDisplayName === b.routeDisplayName
    && a.routeApi === b.routeApi
    && a.routeBaseURL === b.routeBaseURL
    && a.modelId === b.modelId
    && a.modelName === b.modelName
    && a.index === b.index
    && a.readOnly === b.readOnly
    && a.defaultEffort === b.defaultEffort
    // A create card's container surviving its own save must flip the editor
    // to write mode: staged changes the Apply button's whole contract, so it
    // participates in the diff like any other prop.
    && a.staged === b.staged
    // The official capability can appear/disappear across an HMR or host
    // update; the modality section must follow it.
    && a.officialInputTypes === b.officialInputTypes
    && a.effortsUnset === b.effortsUnset
    && sameEfforts(a.efforts, b.efforts)
    && sameInput(a.input, b.input)
    && sameCompat(a.compat, b.compat)
}

/** Semantic equality of two compat blocks (key-order-insensitive). */
function sameCompat(a: CompatSuggestion | undefined, b: CompatSuggestion | undefined): boolean {
  if (a === b) return true
  if (a === undefined || b === undefined) return false
  return JSON.stringify({ ...a }, Object.keys({ ...a, ...b }).sort()) === JSON.stringify({ ...b }, Object.keys({ ...a, ...b }).sort())
}

/** Semantic equality of two modality declarations (order-insensitive). */
function sameInput(a: InputModalities | undefined, b: InputModalities | undefined): boolean {
  if (a === b) return true
  if (a === undefined || b === undefined) return false
  const setA = new Set(a)
  return a.length === b.length && b.every(item => setA.has(item))
}

/** Whether the card carries any input/select labeled with one of the labels. */
function hasLabeledInput(card: HTMLElement, labels: readonly string[]): boolean {
  return Array.from(card.querySelectorAll<HTMLInputElement | HTMLSelectElement>('input[aria-label], select[aria-label]'))
    .some(candidate => labels.some(label => (candidate.getAttribute('aria-label') ?? '').startsWith(label)))
}

/**
 * The route token of a card, resolved against the joined providers. The
 * official edit card prints the route key as the `.editorRoute` tag next to
 * the display-name title; the create card prints a fixed heading with no key,
 * but its "Provider ID" input carries the route id being chosen — a route not
 * in the settings document yet. Match the key first (exact, unambiguous),
 * then the create card's typed id, then the display name (a create card never
 * reaches the name arm: its Provider ID input marks it, and its fixed heading
 * could otherwise collide with a provider's display name), and finally the
 * title itself as a route key: a provider that never set a display name
 * renders the route id as its title and hides the `.editorRoute` tag (the
 * two are then equal), so only this last arm can resolve it. A create card
 * never reaches the last arm either — its Provider ID input already returned.
 */
function routeOfCard(
  card: HTMLElement,
  providers: Record<string, Record<string, unknown>>,
  labels: HostLabels,
): { route: string; staged: boolean } | undefined {
  const key = card.querySelector<HTMLElement>('[class*="editorRoute"]')?.textContent?.trim()
  if (key !== undefined && key.length > 0 && hasOwn(providers, key)) return { route: key, staged: false }
  if (hasLabeledInput(card, labels.routeId)) {
    const typed = inputValueByLabel(card, labels.routeId)
    return typed.length > 0 && !hasOwn(providers, typed) ? { route: typed, staged: true } : undefined
  }
  const title = card.querySelector<HTMLElement>('[class*="editorTitle"], [class*="rowName"]')?.textContent?.trim()
  if (title === undefined || title.length === 0) return undefined
  const byName = Object.entries(providers).find(([, profile]) => profile['displayName'] === title)
  if (byName !== undefined) return { route: byName[0], staged: false }
  // A provider that never set a display name resolves to its route key, and
  // the host hides the .editorRoute tag while that key equals the title
  // (ProviderEditor renders it only when the name differs) — so neither arm
  // above can find the route. The title is then the route key itself, which
  // is exact: resolve it directly. A create card never reaches this arm (its
  // Provider ID input already returned), so an editor-title/key collision
  // with the fixed create heading cannot occur.
  if (hasOwn(providers, title)) return { route: title, staged: false }
  return undefined
}

/**
 * The commit/cancel pair of one card's official action row, or undefined when
 * the row cannot be read.
 *
 * Three tiers, most structural first, because this is the signal the plugin's
 * landing write hangs on and the official page is free to restyle it:
 *   1. the last two buttons of `[class*="editorActions"]` -- the commit is the
 *      rightmost, its dismiss the one before it (`EditorFooter.tsx`: the row is
 *      a plain two-button div, cancel first, commit last);
 *   2. the declared CSS Modules classes `primaryButton` / `secondaryButton`
 *      (they carry a hash suffix, so only the prefix can match);
 *   3. the host's own copy for that row, resolved through the dictionary it
 *      renders from (`apply` is 'Apply' in English and '保存' in Chinese, so
 *      pinning either language would strand one of them).
 *
 * A row whose buttons no tier can identify returns undefined, which is what
 * makes {@link ScanState.signalsUnavailable} trip and the landing decision
 * degrade to "the card went away, write it" rather than dropping the edit.
 */
function actionsOf(card: HTMLElement, labels: HostLabels): { submit: HTMLElement; cancel: HTMLElement } | undefined {
  const row = card.querySelector<HTMLElement>('[class*="editorActions"]')
  if (row === null) return undefined
  const buttons = Array.from(row.querySelectorAll<HTMLElement>('button'))
  if (buttons.length < 2) return undefined
  const matches = (node: HTMLElement, label: string): boolean =>
    (node.textContent ?? '').trim() === label
  const primary = row.querySelector<HTMLElement>('[class*="primaryButton"]')
  const secondary = row.querySelector<HTMLElement>('[class*="secondaryButton"]')
  if (primary !== null && secondary !== null) return { submit: primary, cancel: secondary }
  const submit = [...buttons].reverse().find(node => labels.apply.some(label => matches(node, label)))
  const cancel = [...buttons].reverse().find(node => labels.cancel.some(label => matches(node, label)))
  if (submit !== undefined && cancel !== undefined) return { submit, cancel }
  // Structural last resort: the rightmost button commits, its left sibling
  // dismisses. Used only when neither the classes nor the copy resolve, so a
  // one-button row (a future layout) still yields a commit.
  const last = buttons[buttons.length - 1]
  const previous = buttons[buttons.length - 2]
  if (last === undefined || previous === undefined) return undefined
  return { submit: last, cancel: previous }
}

/**
 * Wire one button's click ONCE, in the capture phase.
 *
 * Capture, not bubble: the marker has to be recorded before the official
 * React handler runs and tears the card down, and React's own listeners sit
 * on the root container. Capture also makes this independent of whether the
 * official handler stops propagation.
 */
function wireOnce(
  node: HTMLElement,
  wired: WeakSet<Element>,
  onHit: () => void,
): void {
  if (wired.has(node)) return
  wired.add(node)
  node.addEventListener('click', onHit, { capture: true })
}

/**
 * One re-pin window, as it stands on its scroll host.
 *
 * `deadline` is EXTENDABLE: a second request on the same host lengthens the
 * running window instead of starting a second loop, so two overlapping height
 * changes (the official disclosure opening, then the injected editor mounting a
 * scan later) share ONE pinned position — the one measured when the first of
 * them arrived — and one suppression.
 *
 * The pinned element is whichever one the FIRST request named: the disclosure
 * path names the row card, the mount path the official editing box it found the
 * container in. Both sit above the growth either way, so the card cannot walk
 * up whichever of the two is being watched.
 */
interface RepinWindow {
  /** When the window closes, on the `performance.now()` clock. */
  deadline: number
  /** When the window opened, which bounds every extension of it. */
  startedAt: number
  /** The frame this window is waiting on, while one is pending. */
  frame: number | undefined
  /** Give the scroll host back to the browser and forget the window. */
  release(): void
}

/** The window running on each scroll host, so at most one ever fights the anchoring. */
const REPINS = new WeakMap<HTMLElement, RepinWindow>()
const LIVE_REPINS = new Set<RepinWindow>()

/** Restore anchoring and remove every live re-pin window's frame and listeners. */
export function releaseModelListRepins(): void {
  for (const pin of Array.from(LIVE_REPINS)) pin.release()
}

/**
 * How long each source of height change keeps its card pinned.
 *
 * Both cover the injector's own debounced scan (`SCAN_DEBOUNCE_MS`, 120ms) plus
 * the async `createRoot` render that follows it: the click's window has to
 * survive the official render AND the editor mount that follows a scan later,
 * and the mount's own window has to survive React's render.
 */
const REPIN_CLICK_MS = 420
const REPIN_MOUNT_MS = 320

/**
 * How long a window keeps holding after the card last CHANGED HEIGHT.
 *
 * The clocks above are budgets measured from the event that opened the window,
 * and the card can still be growing when they run out — a slow settings read
 * puts the editor mount later, and React can land its render in more than one
 * commit. A window that is still watching a moving card is therefore extended
 * to this quiet period, so it lets go after the growth has STOPPED rather than
 * after a fixed guess at when it would.
 */
const REPIN_QUIET_MS = 160

/**
 * The ceiling on one window, extensions included.
 *
 * The quiet period above is only pushed out while the card moves, so this is
 * what keeps a card that keeps growing (an endlessly re-rendering editor) from
 * pinning the page forever. It is also generous enough to cover a settings read
 * that answers a second late.
 */
const REPIN_MAX_MS = 2000

/**
 * A hard frame ceiling for one window, as a stopgap beside the clock.
 *
 * The deadline is wall-clock, and a clock that stops advancing while frames
 * keep arriving (a fake one under test, a throttled tab that has stopped
 * painting) would leave the loop running for as long as frames do. ~2.5s at
 * 60fps clears {@link REPIN_MAX_MS} with room to spare.
 */
const REPIN_MAX_FRAMES = 150

/**
 * The keys that scroll the page rather than edit a field.
 *
 * The stand-down above fires on a user's INPUT, and a keydown is the one input
 * that is mostly typing: releasing the pin because someone typed a letter into
 * the editor that just mounted would hand the page back to its anchoring
 * mid-growth. Only the keys that actually move a scrollport count.
 */
const SCROLL_KEYS = new Set(['PageUp', 'PageDown', 'Home', 'End', 'ArrowUp', 'ArrowDown', ' '])

/**
 * Hold one card's viewport position while its content changes height.
 *
 * Growing a card below the header makes the browser's scroll anchoring keep a
 * node near the GROWING part visually stable, which walks the card's header —
 * and everything above it — up the viewport. Suppressing anchoring for the
 * duration and re-pinning the card's top every frame turns that into the card
 * growing DOWNWARD instead.
 *
 * The card does not reach its final height at once, which is what a
 * stability-bounded loop got wrong: the official React commit renders the
 * disclosure container on the click, and this plugin's editor mounts a
 * debounced scan later through an async render. Measured on the live page with
 * the settings list scrolled to its end, the first change lands in the click's
 * own frame and the second ~100ms later: a loop that stopped three stable
 * frames after the click (~50ms) had already handed anchoring back, and the
 * second change then walked the card 587px up the viewport.
 *
 * So the window is TIME-bounded, and a window that is still watching the card
 * grow is pushed out to {@link REPIN_QUIET_MS} past the last change it saw — it
 * releases when the growth STOPS, not when a fixed guess says it should have.
 * {@link REPIN_MAX_MS} bounds that.
 *
 * The window stands down early on two conditions, both of which mean the
 * measurement it is working from is no longer valid: the USER scrolled (their
 * scroll must not be fought), or the card left the document (React replaced
 * it — a detached box measures 0, and correcting against that would throw the
 * view somewhere arbitrary).
 *
 * "The user scrolled" is read from their INPUT — a wheel, a touch, a pointer
 * press or a scrolling key — and NOT from the scroll offset, which is the one
 * thing the page itself also moves: the browser clamps it when a card above
 * collapses, and this loop moves it on purpose. Watching the offset called
 * every one of those a user scroll and abandoned the pin, which is exactly
 * what opening a provider card needs: one official editor at a time means the
 * card that was open closes in the same commit, the content above the clicked
 * row shrinks by the closing editor's height, and the row has to be held where
 * the user left it rather than walk off the top of the view.
 *
 * The correction itself adds the delta to the offset because the offset and the
 * viewport are inverse: a card that has moved DOWN the screen (a positive
 * delta) is brought back by scrolling DOWN the document, and one that has moved
 * up by scrolling up. Subtracting it — as this did while the suppression was
 * doing all the work and the delta was always 0 — drives the card the wrong way
 * whenever the page really did move it.
 */
/**
 * Let a growing card keep its place on screen without the browser buying the
 * growth back.
 *
 * User item 1: opening 添加供应商 makes three things taller at once — the
 * official page opens the first provider's editor above the new card, the
 * create-card pass adds the tab bar, and the card's own key list lands a moment
 * later. Scroll anchoring answers any of those by scrolling the page by the
 * height that grew, which reads as the new card jumping and shoving the
 * configured provider above it upward. Anchoring is switched off for a short
 * window instead: no scroll write of ours, no compensation by the browser, and
 * the card simply extends downward.
 *
 * Unlike {@link pinCardTop} this never writes a scroll offset — it only stops
 * the browser from writing one — so it cannot fight a pin that is already
 * running, and it releases itself on the same deadline a mount pin uses.
 * @param node - an element whose ancestors' scroll containers should hold still.
 * @param windowMs - how long to hold them still.
 */
export function suppressScrollAnchoring(node: HTMLElement, windowMs: number = REPIN_MOUNT_MS): void {
  for (const target of scrollChainOf(node)) {
    const known = ANCHOR_HOLDS.get(target)
    if (known !== undefined) {
      window.clearTimeout(known.timer)
      known.timer = window.setTimeout(() => releaseAnchoring(target), windowMs)
      continue
    }
    ANCHOR_HOLDS.set(target, {
      saved: target.style.overflowAnchor,
      timer: window.setTimeout(() => releaseAnchoring(target), windowMs),
    })
    target.style.overflowAnchor = 'none'
  }
}

/** One held scroll container: its own value, and the deadline that gives it back. */
const ANCHOR_HOLDS = new Map<HTMLElement, { saved: string; timer: number }>()

function releaseAnchoring(target: HTMLElement): void {
  const known = ANCHOR_HOLDS.get(target)
  if (known === undefined) return
  ANCHOR_HOLDS.delete(target)
  target.style.overflowAnchor = known.saved
}

function pinCardTop(card: HTMLElement, windowMs: number): void {
  // The whole chain, not just the nearest scrollable ancestor: a card's place
  // on screen is the sum of every offset between it and the document, and a
  // deletion near the bottom of a long page moves the PAGE's offset, not the
  // panel's. The nearest one still names the window (that is what the
  // de-duplication and the "one card at a time" rule key on).
  const chain = scrollChainOf(card)
  const host = chain[0]
  if (host === undefined || !card.isConnected) return
  const now = performance.now()
  const running = REPINS.get(host)
  if (running !== undefined) {
    // Same host: keep the position the first request measured and just hold on
    // longer, so the two height changes are pinned against one origin. The
    // extension is still bounded by the ceiling measured from the first
    // request, so two windows can never chain into an unbounded one.
    running.deadline = Math.min(Math.max(running.deadline, now + windowMs), running.startedAt + REPIN_MAX_MS)
    return
  }
  const rectBefore = card.getBoundingClientRect()
  const topBefore = rectBefore.top
  let heightBefore = rectBefore.height
  // The offsets this loop itself last left, so its own writes are never
  // mistaken for somebody else's scroll. Anchoring goes off on EVERY container
  // in the chain for the life of the window: the browser picks the scroll box
  // it anchors within, and on a page that scrolls as a whole that box is the
  // document's, where switching it off on the panel alone does nothing.
  const lastSet = new Map<HTMLElement, number>()
  const anchors = new Map<HTMLElement, string>()
  for (const target of chain) {
    lastSet.set(target, target.scrollTop)
    anchors.set(target, target.style.overflowAnchor)
    target.style.overflowAnchor = 'none'
  }
  // Every container in the chain counts as watched: a movement of any of them
  // that this window did not make is somebody else's scroll — the user dragging
  // a scrollbar, a lazy element above the card settling — and a window that
  // kept pinning through it would move a DIFFERENT container to compensate,
  // fighting the movement instead of standing down. Anchoring is off on all of
  // them for the life of the window, so the shift this window exists to answer
  // cannot arrive this way in the first place.
  const watched = new Set<HTMLElement>(chain)
  // Named `pin`, not `window`: this module runs in the browser, and a local
  // called `window` would shadow the global the frame APIs come from.
  const pin: RepinWindow = { deadline: now + windowMs, startedAt: now, frame: undefined, release: () => {} }
  const release = (): void => {
    if (!LIVE_REPINS.delete(pin)) return
    if (pin.frame !== undefined) {
      window.cancelAnimationFrame(pin.frame)
      pin.frame = undefined
    }
    for (const [target, anchor] of anchors) target.style.overflowAnchor = anchor
    REPINS.delete(host)
    document.removeEventListener('wheel', onUserInput, true)
    document.removeEventListener('touchstart', onUserInput, true)
    document.removeEventListener('pointerdown', onUserInput, true)
    document.removeEventListener('keydown', onKeyScroll, true)
  }
  function onUserInput(): void {
    release()
  }
  function onKeyScroll(event: KeyboardEvent): void {
    if (SCROLL_KEYS.has(event.key)) release()
  }
  pin.release = release
  REPINS.set(host, pin)
  LIVE_REPINS.add(pin)
  document.addEventListener('wheel', onUserInput, { capture: true, passive: true })
  document.addEventListener('touchstart', onUserInput, { capture: true, passive: true })
  document.addEventListener('pointerdown', onUserInput, { capture: true })
  document.addEventListener('keydown', onKeyScroll, { capture: true })
  let frames = 0
  const tick = (): void => {
    pin.frame = undefined
    frames += 1
    if (!card.isConnected || frames >= REPIN_MAX_FRAMES) {
      release()
      return
    }
    const rect = card.getBoundingClientRect()
    // Still growing: the height change that follows has to stay inside this
    // window, so the release is pushed back to a quiet period after it.
    const grew = Math.abs(rect.height - heightBefore) > 0.5
    // An offset this loop did not write, in a frame where nothing changed
    // height, is a scroll of somebody else's — a scrollbar drag is the one
    // gesture the input listeners above cannot see. A frame that DID change
    // height is the page rebuilding the card, and its offset move is the one
    // this window exists to undo.
    if (!grew && [...watched].some((target) => target.scrollTop !== lastSet.get(target))) {
      release()
      return
    }
    const delta = rect.top - topBefore
    if (delta !== 0) absorbDelta(chain, watched, lastSet, delta)
    const at = performance.now()
    if (grew) {
      heightBefore = rect.height
      pin.deadline = Math.min(Math.max(pin.deadline, at + REPIN_QUIET_MS), pin.startedAt + REPIN_MAX_MS)
    }
    if (at >= pin.deadline) {
      release()
      return
    }
    pin.frame = window.requestAnimationFrame(tick)
  }
  pin.frame = window.requestAnimationFrame(tick)
}

/**
 * Hand a viewport delta back to whichever container actually moved the card.
 *
 * The card's distance from the top of the viewport is the sum of every scroll
 * offset between it and the document, so the correction belongs to the
 * container that really moved: usually the nearest scrollable one, but a
 * deletion near the bottom of a long page moves the PAGE's offset instead. Each
 * container is asked for as much of the delta as it can still give, the ones
 * this window has already written first and the rest from the inside out, and
 * every container that answers is watched from then on. A container whose
 * offset is no longer the one this loop left is being scrolled by somebody
 * else, and is skipped rather than fought.
 */
export function absorbDelta(
  chain: readonly HTMLElement[],
  watched: Set<HTMLElement>,
  lastSet: Map<HTMLElement, number>,
  delta: number,
): void {
  let remaining = delta
  for (const target of [...watched, ...chain]) {
    if (remaining === 0) break
    const before = target.scrollTop
    if (before !== lastSet.get(target)) continue
    target.scrollTop = before + remaining
    const after = target.scrollTop
    if (after === before) continue
    lastSet.set(target, after)
    watched.add(target)
    remaining -= after - before
  }
}

/** The selector every pass in this module reaches a model list through. */
const MODEL_LIST_SELECTOR = '[class*="modelList"]'

/** The class of the blank element that holds a scroll host's range open. */
const LIST_SLACK_CLASS = 'bre-list-slack'

/**
 * How long a position recorded by a click inside a list stays usable.
 *
 * The deletion this exists for commits in the click's own task, so the window
 * is only ever stretched by a host that renders late. Anything longer is a
 * different interaction, and the position recorded for the click the user made
 * before it is no longer the position they are looking at.
 */
const LIST_OFFSET_TTL_MS = 3000

/** Where one list's scroll containers stood when a click inside that list arrived. */
interface ListOffset {
  /**
   * Each container that could be holding the position, nearest first, with the
   * offset it carried before the change. Any of them can be the box the browser
   * clamps, so each one gets its own offset handed back.
   */
  targets: Array<{ host: HTMLElement; top: number }>
  /** When they were read, on the `performance.now()` clock. */
  at: number
}

/**
 * The last click's position, or nothing once the user has moved the view.
 *
 * ONE slot is enough: a deletion is caused by the click that just landed, so
 * the newest record always names the interaction in flight. It is cleared by
 * the inputs that move a scrollport rather than by watching the offset itself,
 * for the same reason {@link pinCardTop} watches input: the page moves the
 * offset on its own, and that move is the very thing this module exists to
 * undo.
 */
let listOffset: ListOffset | undefined

/** The blank one scroll host's range is held open with. */
interface ListSlack {
  /** The container whose scroll range this blank holds open. */
  host: HTMLElement
  /** The element appended to that container's content, sized to the range held. */
  spacer: HTMLElement
  /** Its height in pixels, as last written. */
  height: number
  /** The host's own release check, removed along with the spacer. */
  onScroll: () => void
  /** Where that check listens: the host itself, or the document for a page scroller. */
  scrollTarget: EventTarget
}

/** The slack held on each host, by host. */
const LIST_SLACKS = new WeakMap<HTMLElement, ListSlack>()

/**
 * Every blank currently in the page, so a later pass can revisit them.
 *
 * The blanks are held by entry rather than by element: a page's own blank is
 * appended to the body, so the element can no longer be used to find the
 * container whose range it is holding open.
 */
const LIVE_SLACKS = new Set<ListSlack>()

/**
 * Read one list's scroll position out of the click that is about to change it.
 *
 * The clamp cannot be undone after the fact. The browser folds a scroll
 * container's offset down to its new maximum as soon as ANY layout flush sees
 * the shorter content — and this injector's mutation microtask is such a flush
 * (measured on the live page, removing the last row by hand: the offset had
 * already gone 809 -> 755 in the same task, before a single frame was
 * painted). A position that is gone cannot be measured back, so the only
 * moment it can be read is the event that starts the deletion, while it is
 * still the user's own position.
 */
function recordListOffset(target: EventTarget | null): void {
  if (!(target instanceof Element)) return
  const list = target.closest<HTMLElement>(MODEL_LIST_SELECTOR)
  if (list === null) return
  // Every container that could be holding this position, not just the nearest
  // one. The browser clamps whichever box owns the scroll RANGE the deletion
  // shortens, and on a long settings page that is the page's own scroller —
  // the one box a local pass never names, and the one `scrollHostOf` only
  // falls back to when nothing inside scrolls at all. Reading only the nearest
  // container left that case with no record to hold the view against: the
  // offset was simply gone before the frame that could have measured it.
  const targets = scrollChainOf(list).map((host) => ({ host, top: host.scrollTop }))
  if (targets.length === 0) return
  listOffset = { targets, at: performance.now() }
}

/** Drop the recorded position: the user is moving the view themselves. */
function forgetListOffset(): void {
  listOffset = undefined
}

function onListClick(event: Event): void {
  recordListOffset(event.target)
}

/**
 * Keys, split by what they do: the scrolling ones release the record (the user
 * is moving the view), every other one is a possible activation of a control
 * inside the list and records like a click does.
 */
function onListKey(event: KeyboardEvent): void {
  if (SCROLL_KEYS.has(event.key)) {
    forgetListOffset()
    return
  }
  recordListOffset(event.target)
}

/** How many live fibers have asked for the offset to be watched. */
let offsetWatchers = 0

/**
 * Start recording where a click inside a model list leaves its scroll host.
 *
 * Document-level and capture-phase, like the stand-down listeners a re-pin
 * window installs: the position has to be read before the official handler
 * (and React's commit behind it) can shorten the list. Reference counted, so
 * a reload that lands a second fiber over a page that already has one does not
 * take the listeners away from the first.
 */
export function watchModelListOffsets(): void {
  offsetWatchers += 1
  if (offsetWatchers > 1) return
  document.addEventListener('click', onListClick, true)
  document.addEventListener('keydown', onListKey, true)
  // Clearing on the gestures that move a scrollport: a click in one list must
  // not leave a position behind that a burst somewhere else could be held at.
  // (A pointerdown always precedes its own click, and this clears BEFORE it,
  // so the click's record survives.)
  document.addEventListener('focusin', forgetListOffset, true)
  document.addEventListener('pointerdown', forgetListOffset, true)
  document.addEventListener('wheel', forgetListOffset, { capture: true, passive: true })
  document.addEventListener('touchstart', forgetListOffset, { capture: true, passive: true })
}

/**
 * Give one host back the scroll range its blank was holding open.
 *
 * Only ever called when the view does not need it: see {@link sweepListSlacks}.
 */
function releaseListSlack(host: HTMLElement): void {
  const slack = LIST_SLACKS.get(host)
  if (slack === undefined) return
  LIST_SLACKS.delete(host)
  LIVE_SLACKS.delete(slack)
  slack.scrollTarget.removeEventListener('scroll', slack.onScroll)
  slack.spacer.remove()
}

/**
 * Where a host announces its own scrolls.
 *
 * The page's scroller is the exception: the element that carries the offset is
 * the document element, but the event is fired on the DOCUMENT, so a listener
 * on the element itself never hears the page move and the blank would have to
 * wait for the next mutation to be swept.
 */
function scrollEventTarget(host: HTMLElement): EventTarget {
  return host === document.scrollingElement ? document : host
}

/**
 * Let go of every blank the page no longer needs.
 *
 * A blank is load-bearing only while the viewport is sitting on top of it: if
 * the offset the host holds fits inside the REAL content, removing it moves
 * nothing on screen — what is below the viewport is the same either way — and
 * the page gets its own scroll range back. That is also how the space is given
 * back when the list grows again (an editor reopening, a model added): the
 * content reaches past the view again, and the next pass drops the blank.
 */
function sweepListSlacks(): void {
  if (LIVE_SLACKS.size === 0) return
  for (const slack of Array.from(LIVE_SLACKS)) {
    const host = slack.host
    if (!slack.spacer.isConnected) {
      // Something else took the blank out of the page (React re-rendering the
      // card it was appended to, a teardown): the record goes with it rather
      // than holding a position with a blank that is no longer there.
      LIST_SLACKS.delete(host)
      LIVE_SLACKS.delete(slack)
      slack.scrollTarget.removeEventListener('scroll', slack.onScroll)
      continue
    }
    if (host.scrollTop <= host.scrollHeight - host.clientHeight - slack.height) releaseListSlack(host)
  }
}

/** Whether the offset `host` is holding needs the blank to survive. */
function slackNeeded(host: HTMLElement, height: number): boolean {
  return host.scrollTop > host.scrollHeight - host.clientHeight - height
}

/**
 * Hold the position the last click inside a model list was made from.
 *
 * Deleting a row makes the list shorter, and a scroll container holding an
 * offset past the new maximum is CLAMPED down to it by the browser's own
 * layout: the view drops by exactly the height the list lost, which is what
 * "the top slides down instead of the content below contracting upward"
 * describes. Suppressing anchoring cannot answer it (this is not anchoring,
 * the range itself is gone) and neither can a later correction (the offset was
 * already gone before this pass could read it — see {@link recordListOffset}).
 *
 * So this puts the range back instead: a `data-plugin` blank appended to the end
 * of what that container scrolls, exactly as tall as the offset the user was
 * holding needs it to be, and the recorded offset restored on top of it. The
 * tail then contracts upward
 * into the hole the row left, exactly as if the row had been at the end, and
 * the panel gives the space back through {@link sweepListSlacks} as soon as
 * the view no longer sits on it.
 *
 * EVERY container the click's position was recorded on is visited, not just the
 * nearest one. A deletion inside a panel takes that panel's range away; the same
 * deletion near the bottom of a long page takes the PAGE's range away, and the
 * two are not distinguishable from the outside — so whichever container's
 * recorded offset no longer fits inside its real content gets the blank it
 * needs, and the ones that still fit keep nothing.
 *
 * Repeated deletions accumulate by construction: the sum below is recomputed
 * from the REAL content every time (the blank this module added is taken back
 * out of it), so the blank ends up as tall as the newest shrink needs, not as
 * tall as the last two put together.
 */
function holdListSlack(now: number = performance.now()): void {
  const recorded = listOffset
  if (recorded === undefined || now - recorded.at > LIST_OFFSET_TTL_MS) return
  for (const target of recorded.targets) {
    const host = target.host
    if (!host.isConnected) continue
    const slack = LIST_SLACKS.get(host)
    const held = slack === undefined ? 0 : slack.height
    // The offset the REAL content allows: every sum the host reports includes
    // the blank, so it comes back out before the position is compared to it.
    const reach = host.scrollHeight - host.clientHeight - held
    const needed = target.top - reach
    if (needed <= 0) {
      // Nothing to hold: the content still reaches past the position. The blank
      // may still exist from an earlier burst, and goes as soon as the view does
      // not sit on it. A container whose offset was never the one clamped
      // reports this on every pass, which is what keeps the page's own scroller
      // from being padded when the deletion only shortened a panel inside it.
      if (slack !== undefined && !slackNeeded(host, slack.height)) releaseListSlack(host)
      continue
    }
    let entry = slack
    if (entry === undefined) {
      const spacer = document.createElement('div')
      spacer.className = LIST_SLACK_CLASS
      spacer.dataset['plugin'] = PLUGIN_ID
      spacer.setAttribute('aria-hidden', 'true')
      spacer.style.height = '0px'
      // A blank belongs at the END of the content its container scrolls, where
      // it lengthens the range without moving a single thing: inside a panel
      // that is the host itself, and for the page's scroller it is the body,
      // which is the page's own content area.
      const holder = host === document.scrollingElement ? (document.body ?? host) : host
      holder.appendChild(spacer)
      // The scroll listener is the release for every move that is NOT a burst:
      // the user scrolling up off the blank frees it mid-gesture, without
      // waiting for the next mutation.
      const onScroll = (): void => {
        const current = LIST_SLACKS.get(host)
        if (current !== undefined && !slackNeeded(host, current.height)) releaseListSlack(host)
      }
      entry = { host, spacer, height: 0, onScroll, scrollTarget: scrollEventTarget(host) }
      LIST_SLACKS.set(host, entry)
      LIVE_SLACKS.add(entry)
      entry.scrollTarget.addEventListener('scroll', onScroll, { passive: true })
    }
    if (entry.height !== needed) {
      entry.height = needed
      entry.spacer.style.height = `${needed}px`
    }
    // The clamp is the only thing that can have moved this offset since the
    // click (a scroll gesture would have dropped the record), so handing the
    // recorded position back is handing the user's own view back.
    if (host.scrollTop !== target.top) host.scrollTop = target.top
  }
}

/**
 * Stop watching, drop every blank, and forget the last position.
 *
 * The blanks are elements this plugin owns inside the official page: a fiber
 * that goes away must not leave a scroll container holding a gap nothing
 * maintains. Removing one can move the view (the range it held goes with it),
 * which is the right thing to do to a page whose watcher is gone.
 */
export function unwatchModelListOffsets(): void {
  offsetWatchers = Math.max(0, offsetWatchers - 1)
  if (offsetWatchers > 0) return
  document.removeEventListener('click', onListClick, true)
  document.removeEventListener('keydown', onListKey, true)
  document.removeEventListener('focusin', forgetListOffset, true)
  document.removeEventListener('pointerdown', forgetListOffset, true)
  document.removeEventListener('wheel', forgetListOffset, true)
  document.removeEventListener('touchstart', forgetListOffset, true)
  listOffset = undefined
  for (const slack of Array.from(LIVE_SLACKS)) releaseListSlack(slack.host)
}

/**
 * Hold every open provider card's top across a model row burst, and hold the
 * scroll host's own range open while it does.
 *
 * The official list keys rows by array index, so a deletion removes the LAST
 * element and re-fills the survivors: the card loses a row's height INSIDE
 * itself, above whatever its tail holds. Left to its anchoring the browser
 * keeps a node near the hole visually stable instead — it buys the shrink
 * back by moving the whole view, and deleting a model slides the page DOWN
 * rather than letting the content below the list contract upward into the
 * hole it opened. Suppressing anchoring from the burst's own microtask (the
 * injector runs this before the browser has laid the deletion out) holds the
 * card's top where it was: the header does not move, and the tail rises.
 *
 * Anchoring is only half of it, and the half that shows up when the list is
 * scrolled near its end. There the shrink also takes the scroll RANGE away,
 * and the browser clamps the offset down to the new maximum on the first
 * flush that sees the shorter content — which is this very microtask.
 * Measured on the live page (list scrolled to its end, eight deletions): every
 * step moved the card's top by exactly the amount the clamp took, 54px per
 * row, and no anchor suppression could stop it because nothing was anchoring:
 * the range was simply gone. {@link holdListSlack} is what gives it back, from
 * the position the row's own click recorded before the change.
 *
 * The window also covers the burst's second height change. The re-filled rows
 * leave the mounted editor of the model that moved out of them STALE, and the
 * debounced scan re-renders (or mounts) it a frame or two after the deletion
 * itself — the same two-stage change {@link pinCardTop} was built for, now
 * opened by the mutation rather than by a click.
 *
 * The card vocabulary is the same three flavours {@link wireEditRepin} knows:
 * a deletion inside a NEW provider's setup card (or the add card) has no
 * rowCard to climb into at all, and a pin that names only saved providers
 * silently skips the very card the user is editing.
 *
 * @param root - the panel to search for model lists.
 * @param windowMs - how long each found card stays pinned.
 */
export function pinModelListCards(root: HTMLElement, windowMs: number = REPIN_CLICK_MS): void {
  // The range first, the cards after it: a pin measures its card's top on the
  // first tick, and a pin that measured the clamped position would hold the
  // view there — pushing the restoration back out frame by frame.
  holdListSlack()
  sweepListSlacks()
  const pinned = new Set<HTMLElement>()
  for (const list of Array.from(root.querySelectorAll<HTMLElement>(MODEL_LIST_SELECTOR))) {
    const card = list.closest<HTMLElement>('[class*="rowCard"], [class*="setupCard"], [class*="addCard"]')
    if (card === null || pinned.has(card)) continue
    pinned.add(card)
    pinCardTop(card, windowMs)
  }
}

/**
 * Wire one model row's disclosure chevron so its toggle cannot walk the card
 * up the viewport ({@link pinCardTop}).
 *
 * Capture phase, before the official handler: the click's own height change has
 * to be inside the window, and it is the click that opens the window.
 */
function wireDisclosureRepin(
  trigger: HTMLElement,
  wired: WeakSet<Element>,
): void {
  wireOnce(trigger, wired, () => {
    const row = trigger.closest<HTMLElement>('[class*="modelEntry"]') ?? trigger.closest<HTMLElement>('[class*="rowCard"]')
    if (row === null) return
    pinCardTop(trigger.closest<HTMLElement>('[class*="rowCard"]') ?? row, REPIN_CLICK_MS)
  })
}

/** The `{provider}` slot inside one official aria-label template. */
const PROVIDER_TOKEN = '{provider}'

/**
 * The official Edit button of one provider row, found through the host's own
 * `editProvider` template (`编辑 {provider}` / `Edit {provider}`).
 *
 * Matched by template rather than by class: the label is the one thing the
 * official rows and this plugin's seats cannot both carry, whereas
 * `secondaryButton` is shared with every other secondary control on the page.
 * Buttons inside our own DOM are skipped anyway, so a future label of ours that
 * happened to read like this one could never be pinned as an official control.
 * @param row - one provider row to search.
 * @param labels - the host label anchors in the active language.
 * @returns the row's official Edit buttons, one per template that matches.
 */
function editTriggersOf(row: HTMLElement, labels: HostLabels): HTMLElement[] {
  const templates = labels.editProvider.map(template => {
    const at = template.indexOf(PROVIDER_TOKEN)
    return at < 0 ? undefined : { prefix: template.slice(0, at), suffix: template.slice(at + PROVIDER_TOKEN.length) }
  }).filter((parts): parts is { prefix: string; suffix: string } => parts !== undefined)
  if (templates.length === 0) return []
  const found: HTMLElement[] = []
  for (const button of Array.from(row.querySelectorAll<HTMLElement>('button[aria-label]'))) {
    const label = button.getAttribute('aria-label') ?? ''
    if (!templates.some(parts => label.length > parts.prefix.length + parts.suffix.length
      && label.startsWith(parts.prefix) && label.endsWith(parts.suffix))) continue
    if (button.closest('[data-plugin]') !== null) continue
    found.push(button)
  }
  return found
}

/**
 * Wire one provider row's Edit button so opening its card cannot walk the row
 * up the viewport ({@link pinCardTop}).
 *
 * This is the page's largest single height change, and the only one whose
 * growth is matched by a collapse ABOVE it: the official page edits one
 * provider at a time, so the card that was open closes in the same commit. The
 * closing editor is also the browser's own anchor node, so anchoring has
 * nothing left to hold and the view is not compensated — measured on the live
 * page, the row the user clicked walked 474px up the viewport, exactly the
 * height of the editor that closed. Capture phase, like the chevrons, so the
 * window is open before the official handler commits.
 */
function wireEditRepin(trigger: HTMLElement, wired: WeakSet<Element>): void {
  wireOnce(trigger, wired, () => {
    const card = trigger.closest<HTMLElement>('[class*="rowCard"], [class*="setupCard"], [class*="addCard"]')
    if (card === null) return
    pinCardTop(card, REPIN_CLICK_MS)
  })
}

/**
 * Whether an official editing card is open on the page, told from the card's
 * own action row (its Cancel/commit pair) with the model-row containers as a
 * fallback signal.
 *
 * The distinction matters: an ON-SCREEN card holds a frozen revision baseline,
 * so a write landing while it is open is refused on the user's next save --
 * issue #7. Judging "is a card open" from the capacity buttons alone answers
 * "is a model row expanded", which is not the same question: an open card with
 * an empty model list would read as idle and let exactly that write through.
 */
function officialCardOf(root: HTMLElement): HTMLElement | undefined {
  return root.querySelector<HTMLElement>('[class*="editorActions"]')
    ?? root.querySelector<HTMLElement>('[class*="modelEntry"]')
    ?? undefined
}

/**
 * The LIVE form of the write fence: whether an official card is open in the
 * CURRENT DOM.
 *
 * The scan's own boolean lags by `SCAN_DEBOUNCE_MS`, so a write that started
 * during that window would still see "no card" and land behind the card's
 * frozen revision baseline — issue #7 again. `writeModelRows` already probes
 * this at the last possible moment (after its read, before its mutate); this
 * helper makes that probe read the DOM instead of the last scan's snapshot.
 */
function officialCardOpen(): boolean {
  return officialCardOf(panelRoot()) !== undefined
}

/**
 * Reshape every provider card on the page: the official edit card AND the add
 * card, which share the display-name / base-URL / API-protocol fields.
 *
 * Scoped to card containers rather than the whole document, so a card that has
 * scrolled out or a different pane's look-alike form is never touched. The work
 * itself is idempotent, which is what makes running it on every scan safe: a
 * React re-render that restores the host's field order is repaired next pass.
 * @param root - the settings panel root.
 * @param labels - the host's resolved label anchors.
 * @param t - the injected copy.
 */
function decorateCards(root: HTMLElement, labels: HostLabels, t: InjectorDeps['t']): void {
  const endpoints: EndpointLabels = {
    routeId: labels.routeId,
    modelName: labels.modelName,
    baseUrl: labels.baseUrl,
    apiProtocol: labels.apiProtocol,
  }
  const cards = new Set<HTMLElement>()
  for (const node of Array.from(root.querySelectorAll<HTMLElement>('[class*="editor"], [class*="addCard"], [class*="rowCard"]'))) {
    // Only a card that actually carries the protocol and address is ours to
    // reshape; a model row's own inputs sit inside the editor container and
    // would otherwise match the broad selector above. The display name is NOT
    // required: the add-provider card has no such field and must get the same
    // treatment (user item 6).
    if (hasLabeledInput(node, labels.apiProtocol) && hasLabeledInput(node, labels.baseUrl)) {
      cards.add(node)
    }
  }
  for (const card of cards) decorateProviderCard(card, endpoints, { t })
}

/**
 * Scan the settings DOM for official model rows and reconcile the injected
 * editors. Idempotent: existing editors are left alone, new disclosures get
 * one, and removed ones are unmounted.
 * @param root - the settings panel root to scan.
 * @param deps - the injection dependencies.
 * @param state - mutable scan state shared across invocations.
 */
export function reconcile(root: HTMLElement, deps: InjectorDeps, state: ScanState): void {
  // Cheap DOM gate BEFORE the wire read: most mutations in a running app
  // (chat streaming, typing anywhere) fire while no model row exists at
  // all. One prefix query per locale answers "is the Models page here?" —
  // when it is not and nothing is mounted, the scan costs nothing more.
  if (state.disposed || !root.isConnected) return
  // One label read per scan, taken before the cheap DOM gate below: the gate
  // itself matches on them, and reading lazily is what keeps a language switch
  // in step with the page (the labels the host renders change with it).
  const labels = deps.labels()
  // "Is an official editing card open?" is the gate that decides whether this
  // plugin may write at all. The card's own action row answers it structurally,
  // with the model-row containers as a second signal: an open card whose model
  // list happens to be empty carries no capacity button, and judging idleness
  // from those buttons alone would let a write slip into that card's frozen
  // revision baseline -- issue #7 again, under a rarer trigger.
  const cardOpen = officialCardOf(root) !== undefined
  // The provider rows' OWN Edit buttons are wired BEFORE every gate below, and
  // that placement is the point: opening a card is the page's largest height
  // change, and it happens exactly when NO card is open — the branch that
  // returns early below — so a pin wired any later would only ever be in place
  // for the second card the user opens. Scoped to the rows themselves, so the
  // document-wide scan this rides never goes looking for Edit buttons in the
  // rest of the app. See {@link wireEditRepin}.
  for (const row of Array.from(root.querySelectorAll<HTMLElement>('[class*="rowCard"], [class*="setupCard"]'))) {
    for (const trigger of editTriggersOf(row, labels)) wireEditRepin(trigger, state.editWired)
  }
  // The provider card's own layout (display name → API protocol → base URL, the
  // protocol-labelled address, the 更多端点 second endpoint). Wired before every
  // gate below and applied to BOTH the edit card and the add card, so 添加供应商
  // is not left in the old shape. Idempotent per card, so re-running on every
  // scan is what repairs a React re-render that put the fields back.
  decorateCards(root, labels, deps.t)
  // Match on the attribute VALUE, never through a selector built out of host
  // copy: a language pack whose label carries a quote or a bracket would make
  // `querySelector` throw, and this scan has no try/catch around it, so the
  // settings injection would stall for that language.
  const hasCapacityRows = Array.from(root.querySelectorAll<HTMLButtonElement>('button[aria-label]'))
    .some(button => labels.capacity.some(label => (button.getAttribute('aria-label') ?? '').startsWith(label)))
  if (!cardOpen) {
    // No card is open, so no catalogue is either — but the seat is this
    // plugin's OWN DOM inside the host's head, and only a scan can take it
    // out, so every path that skips the row scan also has to clear the seats.
    reconcileAutoEffortSeats(root, [], { t: deps.t })
    if (state.mounted.size > 0) {
      for (const [container, entry] of state.mounted) {
        // The card (and with it every expanded row) is gone, but the official
        // group was hidden by a DOM write of ours and must not outlive the
        // editor that stood in for it.
        showOfficialReasoning(container)
        showOfficialCapacityChrome(container)
        entry.editor.unmount()
      }
      state.mounted.clear()
    }
    // No editing card is on the page, so no on-screen revision baseline can be
    // invalidated by a write: THIS is the moment to land everything the
    // session held back. `!== false` also covers the first scan (undefined) --
    // and a page that reloaded onto restored ledgers -- so outstanding work
    // always gets its pass; the second arm only fires while intents wait, so a
    // settled page costs nothing beyond the check.
    const wasEditing = state.editing
    state.editing = false
    if (wasEditing !== false || (hasOutstanding(state) && Date.now() >= state.nextFlushAt)) {
      void runIdlePass(deps, state).catch(error => {
        console.error(`[bre] idle pass failed: ${error instanceof Error ? error.message : String(error)}`)
      })
    }
    return
  }
  state.editing = true
  // An open card showing no model row has nothing to equip: the idle pass
  // stays fenced until the card goes away (or a row appears). The catalogue
  // head stays, though — the host still renders 获取可用模型 there — so the
  // auto-adapt seat stays beside it. Taking the seat out is what made that
  // link jump the moment the last model was deleted.
  if (!hasCapacityRows) {
    for (const [container, entry] of state.mounted) {
      showOfficialReasoning(container)
      showOfficialCapacityChrome(container)
      entry.editor.unmount()
    }
    state.mounted.clear()
    state.describePromise ??= deps.describeNamespace()
    const seatLabels = labels
    void state.describePromise.then(join => {
      seatEmptyCatalog(root, deps, state, join, seatLabels)
    }).catch(error => {
      // Same invariant as the folded read below: a rejected describe must be
      // forgotten, or every later scan `??=`-reuses the rejection and the seat
      // never appears (while the error log repeats forever).
      state.describePromise = undefined
      console.error(`[bre] empty-catalog seat failed: ${error instanceof Error ? error.message : String(error)}`)
    })
    return
  }
  // The chevrons are wired HERE, not inside the describe callback below.
  // Re-pinning a card's top needs no settings data — only the click and the DOM
  // — while the row scan below is downstream of `describeNamespace()`. A read
  // that is slow, refused or retrying therefore used to leave every chevron
  // unwired, and an unwired chevron means the card walks up the viewport on
  // every expand: the exact symptom, appearing only on the occasions a settings
  // read was unhappy. Idempotent by node (wireOnce), so it costs one query.
  for (const aria of labels.capacity) {
    for (const trigger of Array.from(root.querySelectorAll<HTMLButtonElement>('button[aria-label]'))) {
      if ((trigger.getAttribute('aria-label') ?? '').startsWith(aria)) wireDisclosureRepin(trigger, state.disclosureWired)
    }
  }
  // Fold the describe request across scans (one wire read per wave). A
  // promise's .then ALWAYS runs asynchronously (microtask), even when already
  // resolved — the fold just keeps concurrent scans from stacking wire reads.
  // The holder clears this field on rejection (retry the read next scan) and
  // on pushed invalidations (settings/document-updated, connection/reset —
  // see apply()), so a stale snapshot never outlives the change that made it
  // stale.
  state.describePromise ??= deps.describeNamespace()
  const run = (join: SettingsJoin): void => {
    if (state.disposed || !root.isConnected) return
    const namespace = join.namespace
    const providers = providersOf(namespace)

    // Staged declarations land on the IDLE pass, never from an open card:
    // writing while the official editor holds the document is exactly what
    // made the user's own save in that card fail with `settings/conflict`.

    const found: FoundModel[] = []
    for (const aria of labels.capacity) {
      // The official disclosure buttons carry a numbered aria-label
      // ("Capacities 1", "容量 2", …), so match by prefix.
      const triggers = Array.from(root.querySelectorAll<HTMLButtonElement>('button[aria-label]'))
        .filter(button => (button.getAttribute('aria-label') ?? '').startsWith(aria))
      for (const trigger of triggers) {
        // The chevron's re-pin is wired above, ahead of this read (see the
        // pass in `reconcile`): it needs no settings data, and keeping it here
        // would make the page's scroll behaviour depend on a wire read.
        const card = cardOf(trigger)
        if (card === undefined) continue
        // The model id lives on the trigger's OWN row, not elsewhere in the
        // card: reading the card would return the first row's id for every
        // trigger once more than one model is present.
        const row = trigger.closest<HTMLElement>('[class*="modelEntry"]') ?? card
        const modelId = inputValueByLabel(row, labels.modelId)
        if (modelId.length === 0) continue
        // The container is OPTIONAL: a collapsed row renders no disclosure at
        // all, and skipping it here was what kept the provider-wide seat (and
        // every provider-wide decision) blind until the user unfolded a model.
        // A row with no container is still a model of this provider -- it
        // contributes to what the seat adapts, and only its own editor mount
        // waits for the container the chevron will render.
        found.push({ container: disclosureOf(trigger), row, modelId, card })
      }
    }
    // The "adapt every model of this provider" seat (user request ⑤) rides the
    // same scan that found the rows: one seat per card, seated in that card's
    // catalogue head beside the official fetch link. The rows' own editors
    // answer the click through the document event, but only for a row that is
    // EXPANDED (only it has a container to mount into), so the seat also hands
    // the route to the provider-wide adapt, which reads the settings document
    // and covers exactly the rows nothing on screen can answer for.
    reconcileAutoEffortSeats(root, autoEffortTargets(found, providers, labels), {
      t: deps.t,
      onRequest: route => adaptEveryModel(state, deps, route, screenModelsLive(root, route, providers, labels)),
    })

    // Unmount editors whose rows are gone (the page re-rendered).
    for (const [key, entry] of state.mounted) {
      if (!found.some(candidate => candidate.container === key)) {
        showOfficialReasoning(key)
        showOfficialCapacityChrome(key)
        entry.editor.unmount()
        state.mounted.delete(key)
      }
    }

    // Ghosted staging: the route IS saved but its staged model row is no
    // longer anywhere on the page (renamed away, or the row/card deleted).
    // One missing scan can be a transient re-render gap, so staging is
    // withdrawn only after missing TWO consecutive scans; routes that do not
    // exist yet are never touched here -- an open create card still owns those.
    if (state.pending.size > 0) {
      const onPage = new Map<string, Set<string>>()
      for (const target of found) {
        const resolved = routeOfCard(target.card, providers, labels)
        if (resolved === undefined) continue
        let ids = onPage.get(resolved.route)
        if (ids === undefined) onPage.set(resolved.route, ids = new Set())
        ids.add(target.modelId)
      }
      const missing = new Map<string, Set<string>>()
      for (const [route, models] of state.pending) {
        if (!hasOwn(providers, route)) continue
        const present = onPage.get(route)
        const stale = [...models.keys()].filter(id => !present?.has(id))
        if (stale.length > 0) missing.set(route, new Set(stale))
      }
      for (const [route, ids] of missing) {
        const prior = state.missedScans.get(route)
        if (prior === undefined) continue
        for (const id of ids) {
          if (!prior.has(id)) continue
          stageEffortsInto(state, route, id, undefined)
          // Withdraw from BOTH snapshots: the id must not survive inside
          // `missing` (which becomes the next scan's `prior`), or an intent
          // staged again after the withdrawal is retired after missing just
          // ONE scan instead of two.
          prior.delete(id)
          ids.delete(id)
        }
      }
      state.missedScans = missing
    } else {
      // Nothing staged: the withdrawal bookkeeping protects nothing, and a
      // stale snapshot would mis-age the next wave of staged intents.
      state.missedScans = new Map()
    }

    // The action row belongs to the CARD, not to an expanded model disclosure.
    // Wire it even when every model is collapsed: the provider-wide button can
    // hold declarations for those models, and only the official Save may land
    // them once the card releases its frozen settings revision.
    const cards = new Set(found.map(target => target.card))
    for (const card of cards) {
      const resolved = routeOfCard(card, providers, labels)
      if (resolved === undefined) continue
      const route = resolved.route
      const actions = actionsOf(card, labels)
      if (actions === undefined) {
        state.signalsUnavailable = true
      } else {
        // A readable row is positive evidence the signal works: clear the
        // degrade flag so one transient unreadable card does not disable the
        // "commits with the official Save" gate for the rest of the session.
        state.signalsUnavailable = false
        // Resolve the route AT CLICK TIME: a create card's Provider ID can be
        // (re)typed after the buttons were first wired, and React reuses the
        // button element -- a captured route would mark / clear the wrong one.
        wireOnce(actions.submit, state.submitWired, () => {
          const live = routeOfCard(card, providers, labels)?.route ?? route
          state.committing.add(live)
          persistLedger(state)
        })
        wireOnce(actions.cancel, state.cancelWired, () => {
          const live = routeOfCard(card, providers, labels)?.route ?? route
          forgetRoute(state, live)
        })
      }
    }

    found.forEach((target, index) => {
      // A collapsed row has nowhere to mount: its editor appears the moment
      // the official chevron unfolds it and the next scan sees the container.
      // Everything below assumes one, so the row bows out here -- after it has
      // already served the provider-wide side of the scan above.
      const container = target.container
      if (container === undefined) return
      const resolved = routeOfCard(target.card, providers, labels)
      if (resolved === undefined) return
      const { route, staged: routeStaged } = resolved
      const profile = providers[route] ?? {}
      const models = modelsOf(providers, route)
      // Staged covers TWO unsaved shapes: the create card's draft route, and
      // a typed-but-unsaved model row on a SAVED route. Writing the latter
      // would bounce model-not-found (the row is not in the document yet);
      // staging rides the same flush-on-save path as the create card.
      const savedModelIds = new Set(models.map(model => model['id']))
      const staged = routeStaged || !savedModelIds.has(target.modelId)
      // A staged row's baseline is the pending store (the settings document
      // holds nothing for the model yet); the create card's typed protocol
      // and endpoint stand in for the stored profile facts, both for the
      // editor's display and for suggestion inference.
      const stagedEfforts = staged ? state.pending.get(route)?.get(target.modelId)?.efforts : undefined
      const efforts = staged
        ? (stagedEfforts === 'keep' ? undefined : stagedEfforts)
        : effortsOf(models, target.modelId)
      const effortsUnset = !staged && models.some(model => model['id'] === target.modelId && model[UNSET_MARKER] === true)
      const input = staged
        ? state.pending.get(route)?.get(target.modelId)?.input
        : inputOf(models, target.modelId)
      const compat = staged
        ? state.pending.get(route)?.get(target.modelId)?.compat
        : compatOf(models, target.modelId)
      const defaultEffort = staged
        ? (state.pending.get(route)?.get(target.modelId)?.defaultEffort ?? undefined)
        : defaultEffortOf(models, target.modelId)
      // An unsaved row has no stored declaration to name it, but the user may
      // have typed a Display name on the row already -- suggestion inference
      // and knowledge-base matching lose that signal without it. The read is
      // ROW-scoped (the same multi-row trap the model id above avoids).
      const typedName = staged ? inputValueByLabel(target.row, labels.modelName) : ''
      const modelName = staged ? (typedName.length > 0 ? typedName : undefined) : nameOf(models, target.modelId)
      const typedApi = routeStaged ? inputValueByLabel(target.card, labels.apiProtocol) : ''
      const typedBaseURL = routeStaged ? inputValueByLabel(target.card, labels.baseUrl) : ''
      const routeApi = routeStaged && typedApi.length > 0
        ? typedApi
        : typeof profile['api'] === 'string' ? profile['api'] as string : undefined
      const routeBaseURL = routeStaged && typedBaseURL.length > 0
        ? typedBaseURL
        : typeof profile['baseURL'] === 'string' ? profile['baseURL'] as string : undefined
      // The editor's write seam reads the namespace LIVE through its own
      // describe (not this scan's snapshot): a conflict retry must re-read a
      // fresh revision to have any chance of succeeding. Staged rows stage
      // into this scan state's pending store instead of writing settings.
      const next: EditorMountProps = {
        route,
        routeDisplayName: routeStaged ? route : typeof profile['displayName'] === 'string' ? profile['displayName'] as string : route,
        ...routeApi === undefined ? {} : { routeApi },
        ...routeBaseURL === undefined ? {} : { routeBaseURL },
        modelId: target.modelId,
        ...modelName === undefined ? {} : { modelName },
        ...efforts === undefined ? {} : { efforts },
        ...effortsUnset ? { effortsUnset } : {},
        ...input === undefined ? {} : { input },
        ...compat === undefined ? {} : { compat },
        ...defaultEffort === undefined ? {} : { defaultEffort },
        index,
        staged,
        officialInputTypes: officialInputTypesOf(container),
        // The card covers these controls only while its thinking switch is on;
        // it reports every flip so an off row gets its own fields back.
        onCoverageChange: covered => {
          if (covered) hideOfficialCapacityChrome(container)
          else showOfficialCapacityChrome(container)
        },
        api: {
          ...createEditorApi(
            deps.api,
            undefined,
            (r, m, e, c, i, de) => {
              stageEffortsInto(state, r, m, e, c, officialModalityIntent(container, i, labels.inputImage), de)
            },
            // This row is on screen: it ALWAYS holds the document. The card it
            // lives in froze its revision baseline, so the intent is queued and
            // the official card's own Save is what commits it (issue #7 / C2).
            //
            // Its MODALITY is the one part that control does not carry: this row
            // ships the official input-types checkbox whenever `officialInputTypes`
            // is set, and that box renders the card's draft, so the plugin offers
            // the intent to the box itself and drops it from the write when the
            // official form takes it. See {@link officialModalityIntent}.
            (r, m, w) => {
              queueWriteInto(state, r, m, { ...w, input: officialModalityIntent(container, w.input, labels.inputImage) })
            },
            // The editor's Reset drops wherever this row's intent landed.
            r => { withdrawIntent(state, r, target.modelId) },
            // Re-resolve the card's staged-ness at CALL time, not at mount time:
            // the same DOM row moves between unsaved and saved as the user types
            // a route id (or adds a model row), and the scan snapshot behind this
            // closure lags that by up to one debounce window. The saved-model arm
            // still reads the snapshot: the settings document only changes when a
            // describe does.
            () => (routeOfCard(target.card, providers, labels)?.staged ?? routeStaged) || !savedModelIds.has(target.modelId),
          ),
          // The capacities an applied suggestion carries are printed on this
          // row's own official inputs — the disclosure this editor is mounted
          // in holds them — so the numbers reach the form whose Save persists
          // them. Fill-only ({@link echoOfficialCapacities}), and deliberately
          // never part of the ledgers' document write: two writers for one
          // field is the trap the modality echo above exists to avoid.
          fillCapacities: (contextWindow, maxTokens) => {
            echoOfficialCapacities(container, labels, {
              ...(contextWindow === undefined ? {} : { contextWindow }),
              ...(maxTokens === undefined ? {} : { maxTokens }),
            })
          },
          // The editor's own two capacity fields read and write THESE inputs:
          // the official form stays the single writer, so its Save remains the
          // only persistence path and the plugin's document write never grows a
          // second writer for the same field.
          readCapacities: () => readOfficialCapacities(container, labels),
          setCapacities: next => { writeOfficialCapacities(container, labels, next) },
        },
        readOnly: join.writable !== true,
        t: deps.t,
      }
      // This container is getting (or already has) the plugin's own level
      // editor, so the official page's copy of the same control is stood down
      // here. Asserted on every scan rather than once per row: the official page
      // re-creates that group whenever the row's saved levels change (a save
      // that finally gives the model a ladder), under a container whose editor
      // has long been mounted.
      hideOfficialReasoning(container)
      // The official copy of both capacity fields and of the input-types
      // checkbox follows the card's own switch: with thinking on the card
      // renders those decisions, so the row's smaller controls stand down.
      // With it off the card disappears, and leaving its stand-in hidden would
      // take away every way to edit the model's window. Asserted every scan for
      // the same re-render reason as the reasoning group.
      if (efforts === false) showOfficialCapacityChrome(container)
      else hideOfficialCapacityChrome(container)
      const existing = state.mounted.get(container)
      if (existing !== undefined) {
        // The official page kept the container but moved the document under
        // it (an apply from this editor or elsewhere): swap the fresh props
        // in place so the editor never shows a stale saved declaration. The
        // sameProps guard keeps unchanged rows from re-rendering.
        if (!sameProps(existing.props, next)) {
          existing.props = next
          existing.editor.render(next)
        }
        return
      }
      if (hasEditor(container)) return
      // Mounting the editor is a height change of its own — a debounced scan
      // after the disclosure opened, and a re-render is one more — so the card
      // is pinned across it too. Without this the click's window (which ends
      // before a scan's mount arrives) hands the browser back to its anchoring
      // just in time for the editor to grow the card and walk the header up.
      pinCardTop(cardOf(container) ?? target.card, REPIN_MOUNT_MS)
      const editor = deps.mount(container, next)
      state.mounted.set(container, { editor, props: next })
    })
  }
  // A rejected describe must not permanently disable the injector: clear the
  // folded promise so the next scan retries the read. `run` itself is sync DOM
  // work — a throw inside it rejects the DERIVED promise, so the tail catch
  // reports it with context instead of leaving a silent unhandled rejection
  // over a half-mounted round (the next scan repairs the DOM).
  void state.describePromise.then(run, () => {
    state.describePromise = undefined
  }).catch(error => {
    console.error(`[bre] editor reconcile failed: ${error instanceof Error ? error.message : String(error)}`)
  })
}
