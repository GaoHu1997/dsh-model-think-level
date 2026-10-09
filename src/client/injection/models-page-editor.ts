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
 * tokens fields.
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
import {
  buildModalityIntent,
  compatDraftOf,
  ladderIntent,
  modalityFrom,
  pendingWriteOf,
  sameModality,
} from '../EffortEditor.js'
import { compatOf, createEditorApi, defaultEffortOf, effortsOf, inputOf, nameOf, providersOf, writeModelRows, type RowIntent } from '../ops.js'
import type { EffortEditorApi, EffortWriteIntent, HeldWrite, RemoteApi, SettingsJoin } from '../types.js'
import { cataloguesOf, reconcileAutoEffortSeats, type AutoEffortSeatTarget } from './auto-effort-seat.js'
import type { AutoAdaptReport } from '../auto-effort.js'
import { panelRoot } from './mount.js'
import { scrollHostOf } from './row-drag.js'

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
  api: EffortEditorApi
  readOnly: boolean
  t: (key: string, params?: Record<string, string | number>) => string
}

/** Mutable scan state kept across reconcile invocations. */
export interface ScanState {
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
  /**
   * Compat fields the edit OWNS and left empty, so "unset" can mean unset
   * instead of keeping the last choice forever. Computed by the editor's own
   * `clearedCompatKeys` against the route's protocol, never against the whole
   * stored block: a hand-tuned field the editor never showed survives.
   *
   * A STAGED flush never sets this. Staging carries a ladder and a modality,
   * not a compat decision, and the host autofill writes the knowledge base's
   * compat block into the very row it fills -- so clearing here would delete
   * the suggestion the row is supposed to start from (the same "the plugin's
   * own proposal is not a user decision" rule the ladder follows).
   */
  clearCompatKeys?: readonly string[]
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
  if (efforts !== false && efforts !== 'keep' && !isRecord(efforts)) return false
  const clear = value['clearCompatKeys']
  return clear === undefined || (Array.isArray(clear) && clear.every(key => typeof key === 'string'))
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
      ...(write.clearCompatKeys === undefined ? {} : { clearCompatKeys: write.clearCompatKeys }),
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
 * Whether the official page ships its own input-types editor inside this
 * row's disclosure (0.1.6-alpha.2's `ModelInputTypes` fieldset). This is the
 * CAPABILITY signal the plugin sniffs to stand its own modality section down:
 * a DOM fact, matched by the official class-name stem the same way the
 * `modelAdvanced` anchor is — never a kernel version number.
 */
function officialInputTypesOf(container: HTMLElement): boolean {
  return container.querySelector('[class*="modelInputTypes"]') !== null
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
  if (!root.isConnected) return
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
 * Adapt every model of one provider, the rows the user never unfolded
 * included.
 *
 * The seat's click reaches the per-row editors through a document event, but
 * an editor only exists for a row with a disclosure container, and a collapsed
 * row renders none — so the visible answer is structurally incomplete. This
 * routine answers from the settings DOCUMENT instead of the DOM: every model
 * the provider declares goes through the same suggestion the row's own
 * auto-adapt would have asked for, is mapped by the same pure functions
 * ({@link ladderIntent}, {@link compatDraftOf}, {@link pendingWriteOf}) so both
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
 * @returns what the pass did, so the seat can say something true about the
 *   click: how many models it held an adaptation for, how many had no
 *   suggestion, and -- when nothing could be adapted at all -- why.
 */
export async function adaptEveryModel(state: ScanState, deps: InjectorDeps, route: string): Promise<AutoAdaptReport> {
  // A second click while a pass is in flight is not a no-op the user should
  // read as success: 'busy' travels back so the seat keeps the verdict the
  // running pass is about to publish.
  if (route.length === 0) return { held: 0, unsuggested: 0, blocked: 'unknown-route' }
  if (state.adapting.has(route)) return { held: 0, unsuggested: 0, blocked: 'busy' }
  state.adapting.add(route)
  let held = 0
  let unsuggested = 0
  try {
    // One read for the whole run: `suggest` only ever READS the namespace here
    // (its endpoint probe is a read-only GET, it never resolves a credential),
    // the holds below change nothing the read depends on, and every model of
    // the route needs the same provider facts anyway.
    let join: Promise<SettingsJoin> | undefined
    const describe = (): Promise<SettingsJoin> => (join ??= deps.describeNamespace())
    const seen = await describe()
    const providers = providersOf(seen.namespace)
    // A read-only page and a route that is not in the document yet (a create
    // card's typed id) have nothing to adapt: the card's own rows stage their
    // work and it lands with the route. Both are reported as blocked, never as
    // "already configured" -- the user would read that as a completed pass.
    if (seen.writable !== true) return { held: 0, unsuggested: 0, blocked: 'unwritable' }
    if (!hasOwn(providers, route)) return { held: 0, unsuggested: 0, blocked: 'unknown-route' }
    const models = modelsOf(providers, route)
    if (models.length === 0) return { held: 0, unsuggested: 0, blocked: 'no-models' }
    const profile = providers[route] ?? {}
    const routeApi = typeof profile['api'] === 'string' ? profile['api'] as string : undefined
    // Expanded rows whose stored ladder is already a decision. An expanded row
    // with no declaration is NOT covered: the user asked bulk adapt to fill
    // exactly those, the same as a collapsed row.
    const covered = new Set<string>()
    for (const entry of state.mounted.values()) {
      if (entry.props.route !== route) continue
      if (entry.props.efforts !== undefined) covered.add(entry.props.modelId)
    }
    const api = createEditorApi(
      deps.api,
      describe,
      // No stage arm: this routine only runs while the page is up, and a write
      // made then is always a HOLD that the official Save lands.
      undefined,
      (heldRoute, modelId, write) => { queueWriteInto(state, heldRoute, modelId, write) },
    )
    for (const model of models) {
      const modelId = typeof model['id'] === 'string' ? model['id'] : ''
      if (modelId.length === 0 || covered.has(modelId)) continue
      const initialEfforts = effortsOf(models, modelId)
      // A collapsed row has no editor, so the document is the only record.
      // Same rule as the expanded skip above: a stored ladder, `false`, or the
      // durable unset marker is a decision and must survive this click.
      if (initialEfforts !== undefined || model[UNSET_MARKER] === true) continue
      const initialInput = inputOf(models, modelId)
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
      const nextDefault = parts.defaultEffort ?? initialDefault
      const defaultEffort = nextDefault === initialDefault
        ? undefined
        : nextDefault === '' ? null : nextDefault
      api.commit(route, modelId, pendingWriteOf({
        efforts: ladderIntent(nextThinking, buildIntent(draftFrom(parts.efforts)), initialEfforts),
        input: sameModality(nextModality, initialInput) ? undefined : buildModalityIntent(nextModality),
        defaultEffort,
        manualCompat: compatDraftOf(initialCompat),
        appliedCompat: parts.compat,
        routeApi,
        initialCompat,
      }))
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
function pinCardTop(card: HTMLElement, windowMs: number): void {
  const host = scrollHostOf(card)
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
  // The offset this loop itself last left, so its own writes are never mistaken
  // for somebody else's scroll.
  let lastSet = host.scrollTop
  host.style.overflowAnchor = 'none'
  // Named `pin`, not `window`: this module runs in the browser, and a local
  // called `window` would shadow the global the frame APIs come from.
  const pin: RepinWindow = { deadline: now + windowMs, startedAt: now, frame: undefined, release: () => {} }
  const release = (): void => {
    if (pin.frame !== undefined) {
      window.cancelAnimationFrame(pin.frame)
      pin.frame = undefined
    }
    host.style.overflowAnchor = ''
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
    if (!grew && host.scrollTop !== lastSet) {
      release()
      return
    }
    const delta = rect.top - topBefore
    if (delta !== 0) {
      host.scrollTop += delta
      lastSet = host.scrollTop
    }
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
  if (!root.isConnected) return
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
      for (const [, entry] of state.mounted) entry.editor.unmount()
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
    for (const [, entry] of state.mounted) entry.editor.unmount()
    state.mounted.clear()
    state.describePromise ??= deps.describeNamespace()
    const seatLabels = labels
    void state.describePromise.then(join => {
      seatEmptyCatalog(root, deps, state, join, seatLabels)
    }).catch(error => {
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
    if (!root.isConnected) return
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
      onRequest: route => adaptEveryModel(state, deps, route),
    })

    // Unmount editors whose rows are gone (the page re-rendered).
    for (const [key, entry] of state.mounted) {
      if (!found.some(candidate => candidate.container === key)) {
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
          prior.delete(id)
        }
      }
      state.missedScans = missing
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
        api: createEditorApi(
          deps.api,
          undefined,
          (r, m, e, c, i, de) => { stageEffortsInto(state, r, m, e, c, i, de) },
          // This row is on screen: it ALWAYS holds the document. The card it
          // lives in froze its revision baseline, so the intent is queued and
          // the official card's own Save is what commits it (issue #7 / C2).
          (r, m, w) => { queueWriteInto(state, r, m, w) },
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
        readOnly: join.writable !== true,
        t: deps.t,
      }
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
  // folded promise so the next scan retries the read.
  void state.describePromise.then(run, () => {
    state.describePromise = undefined
  })
}
