/**
 * The thinking-effort + input-modality editor injected into the official
 * Models page's model rows. Rendered with ReactDOM.createRoot into a DOM
 * container the injector creates, it needs no harness services of its own:
 * everything arrives through a plain props face, so it stays testable in
 * isolation. The draft/intent rules live in the client/effort module.
 *
 * The shape is the design board's: one head line (the switch and the
 * "declared N · default X" state) over a sunk
 * panel with no outline of its own. Inside it, each decision is a section — a
 * label row with its trailing action, the hint on its own line, and the control
 * group under both: the level ladder as 28px chips, the armed levels' wire
 * spellings folded behind a link into their own white sheet, then the default
 * pick and the input modality side by side, then the two capacity fields. A
 * hairline separates the declaration from the numbers. The only action is
 * 放弃修改: the edits land with the official card's own Save, so this panel
 * never grows a second commit button.
 */

import { Fragment, useEffect, useMemo, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { PLUGIN_ID } from '../constants.js'
import type {
  CompatSuggestion,
  InputModalities,
  InputSource,
  ReasoningEfforts,
} from '../knowledge.js'
import {
  buildIntent,
  draftFrom,
  LEVEL_ORDER,
  sameEfforts,
  type DraftLevels,
  type EffortIntent,
} from './effort.js'
import { defaultWireRisk } from './wire-preview.js'
import { suggestEfforts } from '../knowledge.js'
import { listenAutoEffort, queueAutoEffort } from './auto-effort.js'
import { capacityText, parseCapacity } from './capacity.js'
import type { EffortEditorApi, EffortWriteIntent, PendingWrite, PendingWriteParts } from './types.js'

/** The glyphs this editor draws, on the 16px grid the injected controls use. */
const TEXT_PATHS: readonly string[] = ['M3.4 4.2h9.2', 'M8 4.2v8.2', 'M5.9 12.4h4.2']
const IMAGE_PATHS: readonly string[] = [
  'M4.4 3.4h7.2a1.9 1.9 0 0 1 1.9 1.9v5.4a1.9 1.9 0 0 1-1.9 1.9H4.4a1.9 1.9 0 0 1-1.9-1.9V5.3a1.9 1.9 0 0 1 1.9-1.9Z',
  'M6.2 7.2a.9.9 0 1 0 0-1.8.9.9 0 0 0 0 1.8Z',
  'M2.9 11.2 6.1 8.4l2.1 1.9 1.8-1.5 2.7 2.4',
]
/** 生图: a picture frame with a sparkle — generation, not reception. */
const IMAGE_GEN_PATHS: readonly string[] = [
  'M9.4 12.7H3.6a1.7 1.7 0 0 1-1.7-1.7V5.1a1.7 1.7 0 0 1 1.7-1.7h4.2',
  'M2.6 10.6 5.3 8.5l1.8 1.5 1.6-1.3 2.3 2',
  'M12.4 2.2l.75 2.05L15.2 5l-2.05.75L12.4 7.8l-.75-2.05L9.6 5l2.05-.75Z',
]
const WARN_PATHS: readonly string[] = ['M8 3.2 13.6 12.8H2.4L8 3.2Z', 'M8 6.9v2.5', 'M8 11.3h.01']
/** The sparkle on 自动适配, and the chevrons on the wire block's disclosure. */
const SPARK_PATHS: readonly string[] = [
  'M8 2.6 9.1 6.4 12.9 7.5 9.1 8.6 8 12.4 6.9 8.6 3.1 7.5 6.9 6.4Z',
  'M12.3 2.4v1.9M11.35 3.35h1.9',
]
const CHEV_DOWN_PATHS: readonly string[] = ['M4.5 6.5 8 10 11.5 6.5']
const CHEV_RIGHT_PATHS: readonly string[] = ['M6.5 4.5 10 8 6.5 11.5']

/** One 12px stroke glyph, beside a modality pill's name or a warning note. */
function Glyph({ paths }: { paths: readonly string[] }): ReactNode {
  return (
    <svg
      viewBox="0 0 16 16"
      width={12}
      height={12}
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      {paths.map(d => (
        <path key={d} d={d} />
      ))}
    </svg>
  )
}

/** One model row's data the editor needs. */
export interface EffortModel {
  /** Model id (the settings key). */
  id: string
  /** Display name, when one is set. */
  name?: string
  /** The model's current reasoningEfforts declaration. */
  efforts?: false | ReasoningEfforts
}

/** Props of {@link EffortEditor}. */
export interface EffortEditorProps {
  /** Route key. */
  route: string
  /**
   * Route display name. Part of the mount contract but never rendered here:
   * this editor lives inside ONE model row, whose provider card already
   * carries the name, so the component does not even destructure it. The
   * injector keeps it in the prop set and its sameProps diff compares it, which
   * is what catches a provider rename under an already-mounted editor.
   */
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
  /** A deliberate unset is also a configured decision bulk adapt must preserve. */
  effortsUnset?: boolean
  /** The model's current input-modality declaration. */
  input?: InputModalities
  /** Whether the model is declared an image generator (生图). */
  imageGen?: boolean
  /** The model's stored compat block (passthrough; suggestions merge over it). */
  compat?: CompatSuggestion
  /** The model's stored per-model default-effort pick, when one is set. */
  defaultEffort?: string
  /** Model row index (for aria labels). */
  index: number
  /**
   * The model row is not saved yet (a create card's draft route, or a new
   * model row on a saved route). Apply then stages the declaration instead
   * of writing settings; the injector applies staged declarations
   * automatically once the row is saved.
   */
  staged?: boolean
  /**
   * Whether the official Models page owns input types for this row. The
   * injector now hides that official control and always shows this card's
   * modality section, so the prop is kept only to document the old kernel
   * split and is no longer read.
   */
  officialInputTypes?: boolean
  /**
   * Report whether this card currently covers the official capacity and
   * input-type chrome. The card exists only while the thinking switch is on;
   * when it is off the row's own official controls have to come back, or a
   * model that declares no reasoning would lose every way to edit its window.
   */
  onCoverageChange?: (covered: boolean) => void
  /** The write seam (settings.mutate plus the suggestion engine). */
  api: EffortEditorApi
  /** Read-only (settings document not writable). */
  readOnly: boolean
  /** Localized copy. */
  t: (key: string, params?: Record<string, string | number>) => string
}

/**
 * Draft state of the modality part. The three pills are mutually exclusive
 * by construction: 生图 (`imageGen`) stands alone — an image generator is a
 * different kind of model, not a request-modality answer — while the 文本/图片
 * pair is the ordinary chat-input declaration (`declared`).
 */
export interface DraftModality {
  /** The 文本/图片 declaration is made (text always, image when `image`). */
  declared: boolean
  /** The declared pair takes images. Meaningful only while `declared`. */
  image: boolean
  /** The row is an image generator; text/image carry no answer beside it. */
  imageGen: boolean
}

/** Read the stored declaration into a draft. Empty mirrors undefined: the
 * resolved settings layer materializes absent arrays as [], and core reads
 * that as "no answer here" -- never as a phantom text-only declaration. */
export function modalityFrom(input: InputModalities | undefined, imageGen?: boolean): DraftModality {
  if (imageGen === true) return { declared: false, image: false, imageGen: true }
  if (input === undefined || input.length === 0) return { declared: false, image: false, imageGen: false }
  return { declared: true, image: input.includes('image'), imageGen: false }
}

/**
 * The modality part of a write, from a draft. The parts are exact: a declared
 * pair also clears the image-generation marker, and marking the row an image
 * generator also unsets the chat-input declaration (its `null` — the durable
 * unset — which is what keeps host auto-fill from refilling text/image under a
 * model that cannot serve a chat turn). `undefined` members mean "touch
 * nothing", which {@link sameModality} is what decides.
 */
export function buildModalityWrite(draft: DraftModality): { input?: InputModalities | null; imageGen?: boolean } {
  if (draft.imageGen) return { input: null, imageGen: true }
  if (draft.declared) return { input: draft.image ? ['text', 'image'] : ['text'], imageGen: false }
  return { input: null, imageGen: false }
}

/**
 * Semantic equality between a modality draft and the row's stored state: the
 * declaration AND the image-generation marker must both agree, or the draft is
 * an edit.
 */
export function sameModality(draft: DraftModality, stored: InputModalities | undefined, storedImageGen?: boolean): boolean {
  if (draft.imageGen !== (storedImageGen === true)) return false
  if (draft.imageGen) return true
  if (!draft.declared) return stored === undefined
  if (stored === undefined) return false
  return draft.image ? stored.includes('image') : !stored.includes('image')
}

/**
 * The ladder part of a write, from a switch state and the draft it resolves to.
 *
 * `'keep'` when nothing is armed and nothing is stored: that is a no-op, NOT an
 * unset — an undefined there would stamp the durable unset marker onto a
 * never-declared model and silence host auto-fill.
 * @param nextThinking - the (pre-update) switch state the edit resolved to.
 * @param built - `buildIntent` of the draft the edit resolved to, which is the
 *   explicit `false` when the only armed level is 'off'.
 * @param initialEfforts - the row's stored declaration.
 * @returns the ladder intent to write.
 */
export function ladderIntent(
  nextThinking: boolean,
  built: EffortIntent,
  initialEfforts: EffortWriteIntent | undefined,
): EffortWriteIntent {
  const next = nextThinking ? built : false
  return nextThinking && next === undefined && initialEfforts === undefined ? 'keep' : next
}

/**
 * Assemble one complete pending write from the parts a caller resolved: the
 * applied suggestion's compat block and the thinking-budget default an
 * openai-completions endpoint needs.
 *
 * The single implementation of that assembly: the row's own editor reports the
 * user's edits through it, and the injector's provider-wide adapt reports
 * collapsed rows through it, so the same suggestion always writes the same
 * bytes whichever path applied it.
 * @param parts - the resolved parts (see {@link PendingWriteParts}).
 * @returns the write to hand the injector's ledger.
 */
export function pendingWriteOf(parts: PendingWriteParts): PendingWrite {
  // Only the applied suggestion writes compat bytes. A stored block the UI no
  // longer shows is not this write's to restate -- or to drop: the ledger
  // merges these bytes OVER the stored block, so an omitted key survives.
  let writeCompat = parts.appliedCompat
  if (
    parts.initialCompat?.supportsThinkingTokenBudget === true
    && parts.initialCompat?.thinkingTokenBudgetField === undefined
    && writeCompat?.thinkingTokenBudgetField === undefined
    && (parts.routeApi ?? '').toLowerCase() === 'openai-completions'
  ) {
    writeCompat = { ...(writeCompat ?? {}), thinkingTokenBudgetField: 'thinking_token_budget' }
  }
  return {
    efforts: parts.efforts,
    ...(writeCompat === undefined ? {} : { compat: writeCompat }),
    ...(parts.input === undefined ? {} : { input: parts.input }),
    ...(parts.imageGen === undefined ? {} : { imageGen: parts.imageGen }),
    ...(parts.defaultEffort === undefined ? {} : { defaultEffort: parts.defaultEffort }),
  }
}

/**
 * Render one model's thinking-effort + input-modality editor: the level
 * checkboxes, the modality toggle, the auto-adapt action, and the
 * apply/reset actions that own both sections.
 */
export function EffortEditor({ route, routeApi, routeBaseURL, modelId, modelName, efforts: initialEfforts, effortsUnset = false, input: initialInput, imageGen: initialImageGen, compat: initialCompat, defaultEffort: initialDefaultEffort, index, staged = false, officialInputTypes = false, onCoverageChange, api, readOnly, t }: EffortEditorProps): ReactNode {
  const [draft, setDraft] = useState<DraftLevels>(() => draftFrom(initialEfforts))
  const [modality, setModality] = useState<DraftModality>(() => modalityFrom(initialInput, initialImageGen))
  // The master thinking switch. OFF reports the ladder as `false` — the row's
  // own "declares no reasoning-effort control" — which is what makes the level
  // grid below unnecessary; ON keeps every edit byte-for-byte as before. It
  // starts ON unless the stored row already says `false`, so a row nobody
  // touches never gains a declaration it did not have.
  const [thinking, setThinking] = useState<boolean>(() => initialEfforts !== false)
  // The host owns the official capacity/input-type fields; this card stands in
  // for them only while the thinking switch is on. Report the switch so the
  // injector can hand them back the moment the card steps aside, and take them
  // over again when it returns. A ref keeps the effect keyed on the switch
  // alone: the injector rebuilds its callbacks on every scan.
  const coverageRef = useRef(onCoverageChange)
  coverageRef.current = onCoverageChange
  useEffect(() => {
    coverageRef.current?.(thinking)
  }, [thinking])
  // The per-model default-effort pick (issue #4), as the level id or '' for
  // "follow the memory chain". The pick lives in the same Apply as the ladder
  // so one mutate carries both.
  const [defaultEffort, setDefaultEffort] = useState<string>(() => initialDefaultEffort ?? '')
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<{ kind: 'success' | 'error' | 'info'; text: string } | undefined>(undefined)
  // The wire-spelling row starts FOLDED when every armed level carries its
  // conventional spelling (the id itself, '' for off): prefilled spellings
  // under the decision pills are noise (模型思考等级也混乱了). Any spelling
  // that differs opens the row — a customization must stay in sight.
  const [wireOpen, setWireOpen] = useState(() =>
    LEVEL_ORDER.some(level =>
      draft[level].on && draft[level].wire.trim() !== (level === 'off' ? '' : level)))
  // The compat block the applied suggestion carries, kept in a REF on purpose:
  // it describes the wire format, not the level set, so level/image tweaks must
  // NOT clear it -- markDirty() resets the user-facing draft context, and a
  // state here would wipe the very bytes Apply/stage needs to reproduce what
  // the host autofill writes. Only a fresh Auto-adapt replaces it; Reset
  // discards it along with everything else.
  const appliedCompatRef = useRef<CompatSuggestion | undefined>(undefined)
  // The official capacity inputs' draft, mirrored here so the two numbers can be
  // edited from THIS card (user request: they must be configurable, not a
  // read-only footnote). The official form stays the single writer -- the mirror
  // seeds once from it and writes straight back through setCapacities -- so its
  // own Save is still what persists, and the plugin's document write never grows
  // a second writer for the same field.
  const initialCapacity = useRef<{ contextWindow?: number; maxTokens?: number } | undefined>(undefined)
  if (initialCapacity.current === undefined) initialCapacity.current = api.readCapacities?.() ?? {}
  const [capacityContext, setCapacityContext] = useState<string>(() => capacityText(initialCapacity.current?.contextWindow))
  const [capacityMax, setCapacityMax] = useState<string>(() => capacityText(initialCapacity.current?.maxTokens))
  // Which field the caret is in: the focused one shows the digits alone, so a
  // grouped value never fights the keyboard.
  const [capacityFocus, setCapacityFocus] = useState<'context' | 'output' | undefined>(undefined)
  // Once the user edits, the drafts own the row: a re-render that changes
  // the initial props (the official page re-renders on its own edits and on
  // apply) must not overwrite in-flight input. Before any edit the drafts
  // simply follow the props.
  const dirtyRef = useRef(false)
  const previousEfforts = useRef<false | ReasoningEfforts | undefined>(initialEfforts)
  const previousInput = useRef<InputModalities | undefined>(initialInput)
  const previousImageGen = useRef<boolean | undefined>(initialImageGen)
  const previousDefaultEffort = useRef<string | undefined>(initialDefaultEffort)
  // The auto-adapt closure of the LATEST render, for the listener below: that
  // closure reads this render's props and state, but the subscription has to
  // outlive them, so the listener reaches it through a ref instead of
  // re-subscribing on every render.
  const autoAdaptRef = useRef<(() => Promise<void>) | undefined>(undefined)
  // The SAVED ladder, not the in-flight draft. Bulk adapt must not overwrite a
  // model whose thinking levels are already configured; the row's own 自动适配
  // link still may, because that click is about this one row.
  const savedEffortsRef = useRef(initialEfforts)
  savedEffortsRef.current = initialEfforts
  const effortsUnsetRef = useRef(effortsUnset)
  effortsUnsetRef.current = effortsUnset

  // The catalogue head's "adapt every model" seat (user request ⑤) publishes
  // one request per provider. An unconfigured row answers it with the same
  // autoAdapt() its own link runs. A row that already has a stored ladder
  // (including an explicit "does not reason" or a durable unset) does not:
  // bulk adapt fills gaps and leaves configured levels alone. The row's own
  // link is unaffected.
  useEffect(() => listenAutoEffort((target) => {
    if (target !== route) return
    if (savedEffortsRef.current !== undefined || effortsUnsetRef.current) return
    const run = autoAdaptRef.current
    if (run !== undefined) queueAutoEffort(run)
  }), [route])

  useEffect(() => {
    if (!sameEfforts(previousEfforts.current, initialEfforts)) {
      previousEfforts.current = initialEfforts
      if (!dirtyRef.current) {
        setDraft(draftFrom(initialEfforts))
        setThinking(initialEfforts !== false)
      }
    }
    if (previousInput.current !== initialInput || previousImageGen.current !== initialImageGen) {
      previousInput.current = initialInput
      previousImageGen.current = initialImageGen
      // A push that lands while the user is mid-edit must not clobber the
      // draft -- same contract as the level grid above.
      if (!dirtyRef.current) setModality(modalityFrom(initialInput, initialImageGen))
    }
    if (previousDefaultEffort.current !== initialDefaultEffort) {
      previousDefaultEffort.current = initialDefaultEffort
      if (!dirtyRef.current) setDefaultEffort(initialDefaultEffort ?? '')
    }
  }, [initialEfforts, initialInput, initialImageGen, initialDefaultEffort])

  // The declared levels of this draft: the pick's value domain.
  const armedLevels = LEVEL_ORDER.filter(level => draft[level].on)
  const defaultEffortIntent = defaultEffort === (initialDefaultEffort ?? '')
    ? undefined
    : defaultEffort === '' ? null : defaultEffort

  // What the row would report right now: the switch OFF *is* the `false`
  // declaration, so it participates in the dirty comparison like any other part.
  const effectiveEfforts: false | ReasoningEfforts | undefined = thinking ? buildIntent(draft) : false
  const changed = !sameEfforts(effectiveEfforts, initialEfforts)
    || !sameModality(modality, initialInput, initialImageGen)
    || defaultEffortIntent !== undefined

  /**
   * What this editor last handed the injector, serialized for idempotency.
   *
   * The editor has no commit action of its own since C2: every change reports
   * itself, and the injector decides where the intent lands. React's state
   * updates are asynchronous, so each change point computes its OWN next value
   * and passes it down — nothing here reads a state value the current event has
   * not yet committed to. The ref then collapses repeat reports: a controlled
   * text input fires on every keystroke, and the wire value only moves on some
   * of them.
   */
  const lastCommitRef = useRef<string | undefined>(undefined)

  const markDirty = (): void => {
    dirtyRef.current = true
    // appliedCompatRef deliberately SURVIVES this (see its declaration) --
    // the commit still has to write the applied suggestion's compat bytes.
    // Reference capacities SURVIVE tweaks too: they are read-only context about
    // the model, not part of the applied suggestion -- only Reset or a fresh
    // Auto-adapt replaces them.
  }

  /**
   * Report the row's complete pending edit to the injector.
   *
   * The whole intent is recomputed from the values handed in, never from the
   * stored state: the caller has just computed them, and reading `draft` here
   * would see the pre-update value on the reporting turn.
   *
   * The ladder part travels as `'keep'` when nothing is armed and nothing is
   * stored: that is a no-op, NOT an unset -- sending `undefined` would stamp
   * the durable unset marker onto a never-declared model and silence host
   * auto-fill.
   */
  const commitPending = (
    nextDraft: DraftLevels,
    nextModality: DraftModality,
    nextDefaultEffort: string,
    // The switch's pre-update value: a toggle computes its own next value and
    // hands it in, exactly like the three parts above.
    nextThinking: boolean = thinking,
  ): void => {
    // OFF is the explicit `false` declaration, whatever the draft still holds
    // (the draft is deliberately left alone, so flipping back loses no edits).
    const effortsIntent = ladderIntent(nextThinking, buildIntent(nextDraft), initialEfforts)
    // The modality part travels ONLY when this edit actually changed it: an
    // untouched row must omit the intent entirely -- a null would stamp the
    // durable inputUnset marker onto modalities the user never decided about.
    const modalityChanged = !sameModality(nextModality, initialInput, initialImageGen)
    const modalityWrite = modalityChanged ? buildModalityWrite(nextModality) : undefined
    const defaultEffortOut = nextDefaultEffort === (initialDefaultEffort ?? '')
      ? undefined
      : nextDefaultEffort === '' ? null : nextDefaultEffort
    // The compat bytes and the thinking-budget default live in ONE place
    // ({@link pendingWriteOf}), shared with the injector's provider-wide
    // adapt: a suggestion must write the same bytes whichever path applied it.
    const write = pendingWriteOf({
      efforts: effortsIntent,
      input: modalityWrite?.input,
      imageGen: modalityWrite?.imageGen,
      defaultEffort: defaultEffortOut,
      appliedCompat: appliedCompatRef.current,
      routeApi,
      initialCompat,
    })
    // The payload IS the identity: two edits that resolve to the same write are
    // the same report, whatever draft states produced them.
    const signature = JSON.stringify(write)
    if (lastCommitRef.current === signature) return
    lastCommitRef.current = signature
    api.commit(route, modelId, write)
    // "Modified" is DERIVED, never messaged: every handler below clears the
    // message in the same batch, so a pending-save message set here would be
    // overwritten on the very turn it became true (React folds both updates).
    // It renders from `changed` instead — see the message block.
  }

  const patchLevel = (level: (typeof LEVEL_ORDER)[number], on: boolean): void => {
    markDirty()
    // Disarming the level the pick names clears the pick with it: the pick is
    // a level of the declared ladder, and a stale one must not survive.
    const nextDefaultEffort = !on && defaultEffort === level ? '' : defaultEffort
    if (nextDefaultEffort !== defaultEffort) setDefaultEffort(nextDefaultEffort)
    // The next draft is built OUTSIDE the state updater, exactly like
    // patchThinking: an updater must stay pure (React may double-invoke it in
    // StrictMode or discard a speculative render), and the ledger commit below
    // is a side effect by definition. These handlers run once per user event,
    // so the render-scope draft is current.
    const next = { ...draft, [level]: { ...draft[level], on } }
    // Enabling a thinking level pre-fills the conventional spelling.
    if (on && level !== 'off' && next[level].wire.trim().length === 0) {
      next[level] = { ...next[level], wire: level }
    }
    setDraft(next)
    commitPending(next, modality, nextDefaultEffort)
    setMessage(undefined)
  }

  /**
   * The master switch. ON restores the ordinary ladder editing; OFF reports the
   * explicit `false` declaration and takes the default pick with it (a pick
   * names a level of a ladder that no longer exists). The DRAFT is deliberately
   * left untouched: flipping back and forth loses no wire spellings.
   */
  const patchThinking = (on: boolean): void => {
    markDirty()
    setThinking(on)
    const nextDefaultEffort = on ? defaultEffort : ''
    if (nextDefaultEffort !== defaultEffort) setDefaultEffort(nextDefaultEffort)
    commitPending(draft, modality, nextDefaultEffort, on)
    setMessage(undefined)
  }

  const patchWire = (level: (typeof LEVEL_ORDER)[number], wire: string): void => {
    markDirty()
    // Same purity rule as patchLevel: compute, set, then commit.
    const next = { ...draft, [level]: { ...draft[level], wire } }
    setDraft(next)
    commitPending(next, modality, defaultEffort)
    setMessage(undefined)
  }

  /** Declare the chat-input pair: text always, image per `on`. Replaces 生图 —
   * the three pills are mutually exclusive by construction. */
  const patchImage = (on: boolean): void => {
    markDirty()
    const nextModality: DraftModality = { declared: true, image: on, imageGen: false }
    setModality(nextModality)
    commitPending(draft, nextModality, defaultEffort)
    setMessage(undefined)
  }

  /** Clear the whole declaration (the 文本 pill's click while declared). */
  const clearModality = (): void => {
    markDirty()
    const nextModality: DraftModality = { declared: false, image: false, imageGen: false }
    setModality(nextModality)
    commitPending(draft, nextModality, defaultEffort)
    setMessage(undefined)
  }

  /** Toggle the image-generator state. Replaces any 文本/图片 declaration —
   * an image generator carries no chat-input answer beside it. */
  const patchImageGen = (on: boolean): void => {
    markDirty()
    const nextModality: DraftModality = on
      ? { declared: false, image: false, imageGen: true }
      : { declared: false, image: false, imageGen: false }
    setModality(nextModality)
    commitPending(draft, nextModality, defaultEffort)
    setMessage(undefined)
  }

  const patchDefaultEffort = (value: string): void => {
    markDirty()
    setDefaultEffort(value)
    commitPending(draft, modality, value)
    setMessage(undefined)
  }

  /**
   * Type into one capacity field.
   *
   * Write-through, not a draft: the two fields ARE the official form's fields,
   * so every keystroke becomes that form's value and the card's own Save
   * persists it. The text is kept verbatim while the caret is in the field, so
   * the catalogue's `1M`/`128K` shorthand survives typing and is expanded to
   * the plain token count only on the way into the official form.
   */
  const patchCapacity = (which: 'context' | 'output', text: string): void => {
    const typed = text.slice(0, 20)
    const nextContext = which === 'context' ? typed : capacityContext
    const nextMax = which === 'output' ? typed : capacityMax
    setCapacityFocus(which)
    if (which === 'context') setCapacityContext(typed)
    else setCapacityMax(typed)
    api.setCapacities?.({ contextWindow: parseCapacity(nextContext), maxTokens: parseCapacity(nextMax) })
  }

  /** Leave a field: fold the typed shorthand back into grouped digits. */
  const normalizeCapacity = (which: 'context' | 'output'): void => {
    if (which === 'context') setCapacityContext((current) => capacityText(parseCapacity(current)))
    else setCapacityMax((current) => capacityText(parseCapacity(current)))
    setCapacityFocus(undefined)
  }

  const applySuggestion = (
    parts: {
      efforts: ReasoningEfforts | false
      source: string
      confidence: 'high' | 'medium' | 'low'
      compat?: CompatSuggestion
      input?: InputModalities
      inputSource?: InputSource
      imageGen?: boolean
      contextWindow?: number
      maxTokens?: number
      defaultEffort?: string
    },
  ): void => {
    markDirty()
    // A suggestion carries a verdict about reasoning: arm the switch to match
    // it, or applying a ladder while the switch is OFF would report `false`
    // and write the ladder nowhere.
    const nextThinking = parts.efforts !== false
    setThinking(nextThinking)
    const nextDraft = draftFrom(parts.efforts)
    setDraft(nextDraft)
    // The suggestion's own modality, when it carries one; else the draft's.
    // An image-generation verdict stands alone: it replaces the pair.
    const nextModality = parts.imageGen === true
      ? modalityFrom(undefined, true)
      : parts.input === undefined ? modality : modalityFrom(parts.input)
    if (nextModality !== modality) setModality(nextModality)
    // A blank pick takes the vendor default. A pick the user already chose
    // stays: auto-adapt must not overwrite a level they set by hand.
    const nextDefault = defaultEffort === '' && parts.defaultEffort !== undefined
      ? parts.defaultEffort
      : defaultEffort
    if (nextDefault !== defaultEffort) setDefaultEffort(nextDefault)
    appliedCompatRef.current = parts.compat
    // The capacities also reach the row's own official inputs (fill-only, so a
    // number the user typed keeps its place): the official form's draft holds
    // them and its own Save persists them — the same single-writer rule the
    // modality echo follows, which is why they never ride the document write.
    // A suggestion carrying none is not worth a visit to the row's disclosure.
    // The fields are then re-read rather than copied from the suggestion: what
    // the official form actually holds is what this row shows.
    if (parts.contextWindow !== undefined || parts.maxTokens !== undefined) {
      api.fillCapacities?.(parts.contextWindow, parts.maxTokens)
      const echoed = api.readCapacities?.()
      setCapacityContext(capacityText(echoed?.contextWindow))
      setCapacityMax(capacityText(echoed?.maxTokens))
    }
    // A successful adapt says nothing on its own: the draft IS the report, and
    // the only messages this card shows are failures (user request: the
    // provenance/confidence copy is noise).
    setMessage(undefined)
    // One commit for the whole suggestion, so the ledger never holds the
    // ladder without the compat block that makes its wire spellings work.
    commitPending(nextDraft, nextModality, nextDefault, nextThinking)
  }

  const autoAdapt = async (): Promise<void> => {
    // The link that normally calls this is `disabled` while the row is
    // read-only or already working, so the gate had to be the button's. The
    // provider-wide seat request (user request ⑤) calls THIS directly and
    // bypasses the button entirely, so the same gate has to live here or a
    // read-only row would be written.
    if (readOnly || busy) return
    setBusy(true)
    setMessage(undefined)
    try {
      // A staged route has no stored profile yet; the card's own typed
      // protocol/endpoint are the facts inference has to work with.
      const reply = staged
        ? await api.suggest(route, modelId, modelName, { ...(routeApi === undefined ? {} : { api: routeApi }), ...(routeBaseURL === undefined ? {} : { baseURL: routeBaseURL }) })
        : await api.suggest(route, modelId, modelName)
      if (!reply.ok) {
        setMessage({ kind: 'error', text: reply.error === 'no-suggestion' ? t('noSuggestion') : reply.error })
        return
      }
      applySuggestion(reply.suggestion)
    } catch (error) {
      setMessage({ kind: 'error', text: t('writeError', { message: String(error) }) })
    } finally {
      setBusy(false)
    }
  }

  // Hand the listener above the closure of this render. An effect rather than a
  // write during render: React may discard a render it never commits.
  useEffect(() => { autoAdaptRef.current = autoAdapt })

  const reset = (): void => {
    // Back to the SAVED declarations, not to "everything off": Reset means
    // "discard my edits". Clearing a declaration is still one flow away --
    // uncheck everything (the unset intent).
    dirtyRef.current = false
    // The ledger outlives this component's state: without withdrawing, the
    // discard is cosmetic and the official Save writes the edits anyway.
    api.withdraw(route, modelId)
    setDraft(draftFrom(initialEfforts))
    setThinking(initialEfforts !== false)
    setModality(modalityFrom(initialInput, initialImageGen))
    setDefaultEffort(initialDefaultEffort ?? '')
    appliedCompatRef.current = undefined
    // The capacities are the official form's draft, which this card edits
    // directly: discarding hands the row the values it mounted with, cleared
    // fields included (a clear is how a field goes back to inheriting).
    const seed = initialCapacity.current ?? {}
    setCapacityContext(capacityText(seed.contextWindow))
    setCapacityMax(capacityText(seed.maxTokens))
    setCapacityFocus(undefined)
    api.setCapacities?.({ contextWindow: seed.contextWindow, maxTokens: seed.maxTokens })
    setMessage(undefined)
    // Let the next edit report itself again: the collapsed signature belongs
    // to the intent that was just withdrawn.
    lastCommitRef.current = undefined
  }

  // Default-wire warning (issue #2): a stored forced-thinking ladder sends
  // an off-equivalent on Default/test calls. The format prefers the just
  // applied suggestion, else the knowledge base for this route. The knowledge
  // scan is memoised on its inputs: every keystroke in a wire input re-renders
  // this editor, and the match is a full knowledge-table pass.
  const routeWireFormat = useMemo(() => suggestEfforts(modelId, {
    ...(routeApi === undefined ? {} : { api: routeApi }),
    ...(routeBaseURL === undefined ? {} : { baseURL: routeBaseURL }),
  }).compat?.thinkingFormat, [modelId, routeApi, routeBaseURL])
  const wireFormat = appliedCompatRef.current?.thinkingFormat ?? routeWireFormat
  const wireRisk = defaultWireRisk(initialEfforts, wireFormat)

  const disabled = readOnly || busy

  // The one-line state, in the redesign's "declared N · default X" form: what
  // the draft says right now, readable without opening anything.
  const stateText = !thinking
    ? t('thinkingModeOff')
    : armedLevels.length === 0
      ? t('stateUndeclared')
      : t('stateDeclared', {
        count: armedLevels.length,
        default: defaultEffort === '' ? t('defaultEffortUnset') : t('level_' + defaultEffort),
      })

  // The default pick's value domain: the armed levels, plus a pick pushed from
  // outside the draft (a hand-edited document) that names a level the draft no
  // longer declares — rendered anyway, so the real state shows instead of
  // silently dropping the pick.
  const pickLevels = defaultEffort !== '' && !armedLevels.includes(defaultEffort as (typeof LEVEL_ORDER)[number])
    ? [...armedLevels, defaultEffort as (typeof LEVEL_ORDER)[number]]
    : armedLevels

  // Output above the window is the upstream's refusal to make, not a rule this
  // editor can enforce: the numbers are still written, and the note says why the
  // save may bounce instead of silently correcting the user's arithmetic.
  const capacityContextValue = parseCapacity(capacityContext)
  const capacityMaxValue = parseCapacity(capacityMax)
  const capacityWarn = capacityContextValue !== undefined
    && capacityMaxValue !== undefined
    && capacityMaxValue > capacityContextValue
  return (
    <div className="bre-effort-editor" data-plugin={PLUGIN_ID}>
      {/* The one-line head: the master switch, the state it implies, and the
          applied suggestion's provenance pill. With the switch off there is no
          ladder to configure, so the card below is not rendered at all — one
          row is everything an un-thinking model shows. The switch is the board's
          28x16 track; the native checkbox rides on top of it, transparent, so
          the row stays keyboard-operable and the drawn knob follows :checked. */}
      <div className="bre-effort-top">
        <label className="bre-thinking-switch">
          <input
            type="checkbox"
            checked={thinking}
            disabled={disabled}
            aria-label={t('thinkingMode') + ' ' + String(index + 1)}
            onChange={(event) => { patchThinking(event.target.checked) }}
          />
          <span className="bre-effort-switch-track" aria-hidden="true" />
          <span className="bre-effort-title">{t('thinkingMode')}</span>
        </label>
        <span className="bre-effort-state">{stateText}</span>
      </div>
      {thinking ? (
        <div className="bre-effort-card">
          <div className="bre-effort-sec">
            <div className="bre-effort-labelrow">
              <span className="bre-effort-label">{t('levelsLabel')}</span>
              <span className="bre-effort-grow" />
              <button
                type="button"
                className="bre-effort-adapt"
                disabled={disabled}
                onClick={() => { void autoAdapt() }}
              >
                <Glyph paths={SPARK_PATHS} />
                {t('autoAdapt')}
              </button>
            </div>
            {/* The explanation owns its line. Wedged into the label row as an
                ellipsised fragment it was unreadable at the disclosure's width. */}
            <p className="bre-effort-hint">{t('levelsHint')}</p>
            <div className="bre-pillrow" role="group" aria-label={t('levelsLabel')}>
              {LEVEL_ORDER.map(level => {
                const cell = draft[level]
                return (
                  <button
                    key={level}
                    type="button"
                    className={cell.on ? 'bre-lvl is-on' : 'bre-lvl'}
                    disabled={disabled}
                    aria-pressed={cell.on}
                    aria-label={t('level_' + level) + ' ' + String(index + 1)}
                    title={t('level_' + level)}
                    onClick={() => { patchLevel(level, !cell.on) }}
                  >
                    {t('level_' + level)}
                  </button>
                )
              })}
            </div>
            {/* Every armed level takes a wire input, off included: a non-null
                off spelling is what some formats send to close thinking (the
                OpenAI none spelling, or the deepseek/zai explicit disabled
                object); an empty one sends nothing. Conventional spellings are
                folded behind the link — the pills are the decision, the wire
                block is the bytes, and the bytes only interest an editor who
                changed them. */}
            {armedLevels.length === 0 ? null : (
              <button
                type="button"
                className="bre-effort-wiretoggle"
                disabled={disabled}
                aria-expanded={wireOpen}
                onClick={() => { setWireOpen(!wireOpen) }}
              >
                <Glyph paths={wireOpen ? CHEV_DOWN_PATHS : CHEV_RIGHT_PATHS} />
                {wireOpen ? t('wireHide') : t('wireShow')}
              </button>
            )}
            {armedLevels.length === 0 || !wireOpen ? null : (
              <div className="bre-wire">
                <div className="bre-wire-grid">
                  {armedLevels.map(level => (
                    <Fragment key={level}>
                      <span className="bre-wire-name">{t('level_' + level)}</span>
                      <input
                        type="text"
                        className="bre-effort-wire"
                        value={draft[level].wire}
                        disabled={disabled}
                        placeholder={t('wirePlaceholder')}
                        aria-label={t('level_' + level) + ' ' + t('wireValue')}
                        onChange={(event) => { patchWire(level, event.target.value) }}
                      />
                    </Fragment>
                  ))}
                </div>
                <p className="bre-effort-note">{t('wireHint')}</p>
              </div>
            )}
          </div>
          <div className="bre-effort-cols">
            {armedLevels.length === 0 ? null : (
              <div className="bre-effort-sec">
                {/* Label above the pick, as the board draws a section's control:
                    the label row is the section's heading, and the pick is its
                    body. The pick stays a real dropdown — one line however long
                    the ladder — whose leading option is the memory chain itself
                    (跟随记忆), so clearing it is an ordinary selection. */}
                <span className="bre-effort-label">{t('defaultEffortLabel')}</span>
                <select
                  className="bre-effort-select"
                  value={defaultEffort}
                  disabled={disabled}
                  aria-label={t('defaultEffortLabel')}
                  onChange={(event) => { patchDefaultEffort(event.target.value) }}
                >
                  <option value="">{t('followMemory')}</option>
                  {pickLevels.map(level => (
                    <option key={level} value={level}>{t('level_' + level)}</option>
                  ))}
                </select>
                <p className="bre-effort-note">{t('defaultEffortHint')}</p>
              </div>
            )}
            {/* The injector hides the official ModelInputTypes control and
                keeps exactly one modality surface: this one. It writes both the
                legacy document declaration and the official checkbox state. */}
            <div className="bre-effort-sec">
                <span className="bre-effort-label">{t('inputModality')}</span>
                <div className="bre-pillrow" role="group" aria-label={t('inputModality')}>
                  {/* Text is the declaration's floor: a declared row always
                      carries it, so the pill toggles DECLARED — clicking it
                      when undeclared declares text-only, clicking it when
                      declared clears the declaration entirely. */}
                  <button
                    type="button"
                    className={modality.declared ? 'bre-lvl bre-lvl--opt is-on' : 'bre-lvl bre-lvl--opt'}
                    disabled={disabled}
                    aria-pressed={modality.declared}
                    aria-label={t('modalityText') + ' ' + String(index + 1)}
                    title={t('modalityText')}
                    onClick={() => { if (modality.declared) clearModality(); else patchImage(false) }}
                  >
                    <Glyph paths={TEXT_PATHS} />
                    {t('modalityText')}
                  </button>
                  <button
                    type="button"
                    className={modality.declared && modality.image ? 'bre-lvl bre-lvl--opt is-on' : 'bre-lvl bre-lvl--opt'}
                    disabled={disabled}
                    aria-pressed={modality.declared && modality.image}
                    aria-label={t('modalityImage') + ' ' + String(index + 1)}
                    title={t('modalityImage')}
                    onClick={() => { patchImage(!(modality.declared && modality.image)) }}
                  >
                    <Glyph paths={IMAGE_PATHS} />
                    {t('modalityImage')}
                  </button>
                  {/* 生图 stands outside the chat-input pair: an image generator
                      is a different kind of model (the composer's switcher hides
                      it), so the three pills are mutually exclusive and
                      selecting this one clears the 文本/图片 declaration. */}
                  <button
                    type="button"
                    className={modality.imageGen ? 'bre-lvl bre-lvl--opt is-on' : 'bre-lvl bre-lvl--opt'}
                    disabled={disabled}
                    aria-pressed={modality.imageGen}
                    aria-label={t('modalityImageGen') + ' ' + String(index + 1)}
                    title={t('modalityImageGen')}
                    onClick={() => { patchImageGen(!modality.imageGen) }}
                  >
                    <Glyph paths={IMAGE_GEN_PATHS} />
                    {t('modalityImageGen')}
                  </button>
                </div>
                <p className="bre-effort-note">
                  {modality.imageGen
                    ? t('modalityImageGenHint')
                    : modality.declared ? t('modalityDeclared') : t('modalityInherit')}
                </p>
              </div>
          </div>
          <span className="bre-effort-sep" />
          {staged ? <p className="bre-effort-note">{t('stagedHint')}</p> : null}
          {capacityWarn
            ? (
              <p className="bre-effort-note bre-warn">
                <Glyph paths={WARN_PATHS} />
                {t('capacityRule')}
              </p>
            )
            : null}
          {initialEfforts === false ? <p className="bre-effort-note">{t('reasoningDisabled')}</p> : null}
          {wireRisk === undefined
            ? null
            : <p className="bre-effort-note">{t(wireRisk === 'thinking-disabled' ? 'defaultRiskDisabled' : 'defaultRiskQwen')}</p>}
          {/* Unsetting says what it does: the save path below turns an
              all-off draft over a stored declaration into the durable unset
              marker, i.e. bare provider-default requests (the relay-compat
              mode of issue #2). Never-declared rows map to keep, so the hint
              stays hidden there exactly as the write does. */}
          {buildIntent(draft) === undefined && initialEfforts !== undefined
            ? <p className="bre-effort-note">{t('bareHint')}</p> : null}
          <div className="bre-effort-cols">
            <div className="bre-effort-sec">
              <span className="bre-effort-label">{t('contextWindowLabel')}</span>
              <span className="bre-cap-box">
                <input
                  type="text"
                  inputMode="text"
                  className="bre-cap-input"
                  value={capacityFocus === 'context' ? capacityContext : capacityText(capacityContextValue)}
                  disabled={disabled}
                  placeholder={t('capacityBlank')}
                  aria-label={t('contextWindowLabel') + ' ' + String(index + 1)}
                  onFocus={() => { setCapacityFocus('context') }}
                  onBlur={() => { normalizeCapacity('context') }}
                  onChange={(event) => { patchCapacity('context', event.target.value) }}
                />
                <span className="bre-cap-unit">{t('tokensUnit')}</span>
              </span>
              <p className="bre-effort-note">{t('capacityInherit')}</p>
            </div>
            <div className="bre-effort-sec">
              <span className="bre-effort-label">{t('maxTokensLabel')}</span>
              <span className="bre-cap-box">
                <input
                  type="text"
                  inputMode="text"
                  className="bre-cap-input"
                  value={capacityFocus === 'output' ? capacityMax : capacityText(capacityMaxValue)}
                  disabled={disabled}
                  placeholder={t('capacityBlank')}
                  aria-label={t('maxTokensLabel') + ' ' + String(index + 1)}
                  onFocus={() => { setCapacityFocus('output') }}
                  onBlur={() => { normalizeCapacity('output') }}
                  onChange={(event) => { patchCapacity('output', event.target.value) }}
                />
                <span className="bre-cap-unit">{t('tokensUnit')}</span>
              </span>
              <p className="bre-effort-note">{t('capacityUnitsHint')}</p>
            </div>
          </div>
          {message === undefined ? null : (
            <p className={'bre-effort-message bre-' + message.kind} role={message.kind === 'error' ? 'alert' : 'status'}>
              {message.text}
            </p>
          )}
          {/* No "modified — saves with the card" copy: the Reset button is the
              only affordance whose enabled state reports it, and the provenance
              copy (applied suggestion / modality source / pending-save note)
              was noise the user asked removed (user item 3). The draft is the
              report; the official Save is the commit. */}
          {/* No commit button since C2: the row's edits land with the official
              card's own Save (issue #7), so the only action left is discarding
              them. A card-level commit would ride the frozen revision baseline
              that made that Save fail in the first place. */}
          <div className="bre-effort-actions">
            <button
              type="button"
              className="bre-secondary-button"
              disabled={disabled || !changed}
              onClick={reset}
            >
              {t('reset')}
            </button>
          </div>
        </div>
      ) : null}
    </div>
  )
}

export type { DraftLevels }
