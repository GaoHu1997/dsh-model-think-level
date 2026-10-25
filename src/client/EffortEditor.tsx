/**
 * The thinking-effort + input-modality editor injected into the official
 * Models page's model rows. Rendered with ReactDOM.createRoot into a DOM
 * container the injector creates, it needs no harness services of its own:
 * everything arrives through a plain props face, so it stays testable in
 * isolation. The draft/intent rules live in the client/effort module.
 *
 * The shape is the design board's: one head line (the switch, the "declared N ·
 * default X" state, and the applied suggestion's provenance pill) over a sunk
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
import type { EffortEditorApi, EffortWriteIntent, PendingWrite, PendingWriteParts } from './types.js'

/** Thousands-grouped token counts, matching the official capacity inputs. */
const COUNT = new Intl.NumberFormat('en-US')

/** The glyphs this editor draws, on the 16px grid the injected controls use. */
const TEXT_PATHS: readonly string[] = ['M3.4 4.2h9.2', 'M8 4.2v8.2', 'M5.9 12.4h4.2']
const IMAGE_PATHS: readonly string[] = [
  'M4.4 3.4h7.2a1.9 1.9 0 0 1 1.9 1.9v5.4a1.9 1.9 0 0 1-1.9 1.9H4.4a1.9 1.9 0 0 1-1.9-1.9V5.3a1.9 1.9 0 0 1 1.9-1.9Z',
  'M6.2 7.2a.9.9 0 1 0 0-1.8.9.9 0 0 0 0 1.8Z',
  'M2.9 11.2 6.1 8.4l2.1 1.9 1.8-1.5 2.7 2.4',
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

/**
 * A capacity field's token count, or `undefined` for a blank field.
 *
 * The official inputs take plain digits, so the draft keeps the digits alone and
 * the display groups them: one parser for both directions keeps "1,048,576"
 * the number the official form already held.
 */
function parseCapacity(text: string): number | undefined {
  const digits = text.replace(/\D/g, '')
  if (digits === '') return undefined
  const value = Number(digits)
  return Number.isFinite(value) && value > 0 ? value : undefined
}

/** A capacity count as the field shows it when it is not being typed into. */
function capacityText(value: number | undefined): string {
  return value === undefined ? '' : COUNT.format(value)
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
   * Whether the official Models page owns input types for this row (the
   * 0.1.6-alpha.2 `ModelInputTypes` control was sniffed in the disclosure).
   * True hides the modality section: the official editor is the single
   * surface, so showing a second one would be duplicate UI. Older kernels
   * have no such control and keep the section.
   */
  officialInputTypes?: boolean
  /** The write seam (settings.mutate plus the suggestion engine). */
  api: EffortEditorApi
  /** Read-only (settings document not writable). */
  readOnly: boolean
  /** Localized copy. */
  t: (key: string, params?: Record<string, string | number>) => string
}

/** Draft state of the modality part: declared or inheriting, image or not. */
export interface DraftModality {
  declared: boolean
  image: boolean
}

/** Read the stored declaration into a draft. Empty mirrors undefined: the
 * resolved settings layer materializes absent arrays as [], and core reads
 * that as "no answer here" -- never as a phantom text-only declaration. */
export function modalityFrom(input: InputModalities | undefined): DraftModality {
  if (input === undefined || input.length === 0) return { declared: false, image: false }
  return { declared: true, image: input.includes('image') }
}

/** Resolve a modality draft to the write intent (null = durably unset). */
export function buildModalityIntent(draft: DraftModality): InputModalities | null {
  if (!draft.declared) return null
  return draft.image ? ['text', 'image'] : ['text']
}

/** Semantic equality between a modality draft and a stored declaration. */
export function sameModality(draft: DraftModality, stored: InputModalities | undefined): boolean {
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
    ...(parts.defaultEffort === undefined ? {} : { defaultEffort: parts.defaultEffort }),
  }
}

/**
 * Render one model's thinking-effort + input-modality editor: the level
 * checkboxes, the modality toggle, the auto-adapt action, and the
 * apply/reset actions that own both sections.
 */
export function EffortEditor({ route, routeApi, routeBaseURL, modelId, modelName, efforts: initialEfforts, effortsUnset = false, input: initialInput, compat: initialCompat, defaultEffort: initialDefaultEffort, index, staged = false, officialInputTypes = false, api, readOnly, t }: EffortEditorProps): ReactNode {
  const [draft, setDraft] = useState<DraftLevels>(() => draftFrom(initialEfforts))
  const [modality, setModality] = useState<DraftModality>(() => modalityFrom(initialInput))
  // The master thinking switch. OFF reports the ladder as `false` — the row's
  // own "declares no reasoning-effort control" — which is what makes the level
  // grid below unnecessary; ON keeps every edit byte-for-byte as before. It
  // starts ON unless the stored row already says `false`, so a row nobody
  // touches never gains a declaration it did not have.
  const [thinking, setThinking] = useState<boolean>(() => initialEfforts !== false)
  // The per-model default-effort pick (issue #4), as the level id or '' for
  // "follow the memory chain". The pick lives in the same Apply as the ladder
  // so one mutate carries both.
  const [defaultEffort, setDefaultEffort] = useState<string>(() => initialDefaultEffort ?? '')
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<{ kind: 'success' | 'error' | 'info'; text: string } | undefined>(undefined)
  const [suggested, setSuggested] = useState<ReasoningEfforts | false | undefined>(undefined)
  const [suggestedSource, setSuggestedSource] = useState('')
  const [suggestedConfidence, setSuggestedConfidence] = useState<'high' | 'medium' | 'low'>('low')
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
  // Modality part of the applied suggestion.
  const [suggestedInputSource, setSuggestedInputSource] = useState<InputSource | undefined>(undefined)
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
    if (previousInput.current !== initialInput) {
      previousInput.current = initialInput
      // A push that lands while the user is mid-edit must not clobber the
      // draft -- same contract as the level grid above.
      if (!dirtyRef.current) setModality(modalityFrom(initialInput))
    }
    if (previousDefaultEffort.current !== initialDefaultEffort) {
      previousDefaultEffort.current = initialDefaultEffort
      if (!dirtyRef.current) setDefaultEffort(initialDefaultEffort ?? '')
    }
  }, [initialEfforts, initialInput, initialDefaultEffort])

  // The declared levels of this draft: the pick's value domain.
  const armedLevels = LEVEL_ORDER.filter(level => draft[level].on)
  const defaultEffortIntent = defaultEffort === (initialDefaultEffort ?? '')
    ? undefined
    : defaultEffort === '' ? null : defaultEffort

  // What the row would report right now: the switch OFF *is* the `false`
  // declaration, so it participates in the dirty comparison like any other part.
  const effectiveEfforts: false | ReasoningEfforts | undefined = thinking ? buildIntent(draft) : false
  const changed = !sameEfforts(effectiveEfforts, initialEfforts)
    || !sameModality(modality, initialInput)
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
    setSuggested(undefined)
    setSuggestedSource('')
    setSuggestedConfidence('low')
    setSuggestedInputSource(undefined)
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
    const nextInput = sameModality(nextModality, initialInput) ? undefined : buildModalityIntent(nextModality)
    const defaultEffortOut = nextDefaultEffort === (initialDefaultEffort ?? '')
      ? undefined
      : nextDefaultEffort === '' ? null : nextDefaultEffort
    // The compat bytes and the thinking-budget default live in ONE place
    // ({@link pendingWriteOf}), shared with the injector's provider-wide
    // adapt: a suggestion must write the same bytes whichever path applied it.
    const write = pendingWriteOf({
      efforts: effortsIntent,
      input: nextInput,
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

  const patchImage = (on: boolean): void => {
    markDirty()
    const nextModality = { declared: true, image: on }
    setModality(nextModality)
    commitPending(draft, nextModality, defaultEffort)
    setMessage(undefined)
  }

  const clearModality = (): void => {
    markDirty()
    const nextModality = { declared: false, image: false }
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
   * persists it. A cleared field hands the number back to the catalogue (the
   * official input is emptied rather than pinned to the old value).
   */
  const patchCapacity = (which: 'context' | 'output', text: string): void => {
    const digits = text.replace(/\D/g, '').slice(0, 12)
    const nextContext = which === 'context' ? digits : capacityContext
    const nextMax = which === 'output' ? digits : capacityMax
    setCapacityFocus(which)
    if (which === 'context') setCapacityContext(digits)
    else setCapacityMax(digits)
    api.setCapacities?.({ contextWindow: parseCapacity(nextContext), maxTokens: parseCapacity(nextMax) })
  }

  const applySuggestion = (
    parts: {
      efforts: ReasoningEfforts | false
      source: string
      confidence: 'high' | 'medium' | 'low'
      compat?: CompatSuggestion
      input?: InputModalities
      inputSource?: InputSource
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
    const nextModality = parts.input === undefined ? modality : modalityFrom(parts.input)
    if (parts.input !== undefined) setModality(nextModality)
    // A blank pick takes the vendor default. A pick the user already chose
    // stays: auto-adapt must not overwrite a level they set by hand.
    const nextDefault = defaultEffort === '' && parts.defaultEffort !== undefined
      ? parts.defaultEffort
      : defaultEffort
    if (nextDefault !== defaultEffort) setDefaultEffort(nextDefault)
    setSuggested(parts.efforts)
    setSuggestedSource(parts.source)
    setSuggestedConfidence(parts.confidence)
    appliedCompatRef.current = parts.compat
    setSuggestedInputSource(parts.inputSource)
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
    setMessage({
      kind: 'info',
      text: t('appliedHint', { source: parts.source, confidence: t('confidence_' + parts.confidence) }),
    })
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
    setModality(modalityFrom(initialInput))
    setDefaultEffort(initialDefaultEffort ?? '')
    setSuggested(undefined)
    setSuggestedSource('')
    setSuggestedConfidence('low')
    appliedCompatRef.current = undefined
    setSuggestedInputSource(undefined)
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
        {suggested === undefined ? null : (
          <span className="bre-effort-suggest" role="status">
            {t('appliedHint', { source: suggestedSource, confidence: t('confidence_' + suggestedConfidence) })}
          </span>
        )}
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
            {/* The official page owns input types from 0.1.6-alpha.2 on (its
                ModelInputTypes control was sniffed in this row's disclosure):
                the official editor is the single surface then, so this section
                stands down. Older kernels keep it. */}
            {officialInputTypes ? null : (
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
                </div>
                <p className="bre-effort-note">{modality.declared ? t('modalityDeclared') : t('modalityInherit')}</p>
              </div>
            )}
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
                  inputMode="numeric"
                  className="bre-cap-input"
                  value={capacityFocus === 'context' ? capacityContext : capacityText(capacityContextValue)}
                  disabled={disabled}
                  placeholder={t('capacityBlank')}
                  aria-label={t('contextWindowLabel') + ' ' + String(index + 1)}
                  onFocus={() => { setCapacityFocus('context') }}
                  onBlur={() => { setCapacityFocus(undefined) }}
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
                  inputMode="numeric"
                  className="bre-cap-input"
                  value={capacityFocus === 'output' ? capacityMax : capacityText(capacityMaxValue)}
                  disabled={disabled}
                  placeholder={t('capacityBlank')}
                  aria-label={t('maxTokensLabel') + ' ' + String(index + 1)}
                  onFocus={() => { setCapacityFocus('output') }}
                  onBlur={() => { setCapacityFocus(undefined) }}
                  onChange={(event) => { patchCapacity('output', event.target.value) }}
                />
                <span className="bre-cap-unit">{t('tokensUnit')}</span>
              </span>
              <p className="bre-effort-note">{t('capacityRule')}</p>
            </div>
          </div>
          {suggested === undefined ? null : (
            <div className="bre-suggestion">
              {suggestedInputSource === undefined
                ? null
                : (
                  <p className="bre-effort-note">
                    {suggestedInputSource === 'endpoint'
                      ? t('inputHintEndpoint')
                      : suggestedInputSource === 'knowledge'
                        ? t('inputHintKnowledge')
                        : t('inputHintHeuristic')}
                  </p>
                )}
            </div>
          )}
          {message === undefined ? null : (
            <p className={'bre-effort-message bre-' + message.kind} role={message.kind === 'error' ? 'alert' : 'status'}>
              {message.text}
            </p>
          )}
          {!changed
            ? null
            : (
              <p className="bre-effort-message bre-info" role="status">
                {t('pendingSave')}
              </p>
            )}
          {!changed ? null : <p className="bre-effort-note">{t('pendingHint')}</p>}
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
