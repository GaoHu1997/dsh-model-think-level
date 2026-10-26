/**
 * The replicated composer popover body: the model switcher and the reasoning
 * level, both driven from the official model directory.
 *
 * Presentation follows the plugin's UI redesign: one quiet head naming the
 * current model and its level, the provider column and the models of the
 * selection beside it ALWAYS visible (no drill-in row), a resident search box
 * above the columns, and the reasoning level switched IN PLACE as a segmented
 * footer — no second-level panel anywhere, so the body's height never changes
 * after the mount and the commit paths carry no re-measure dance.
 *
 * Load-bearing invariants that must survive any edit:
 *   - the body is mounted INSIDE the official model menu, and the shell closes
 *     that menu on any blur that leaves the card, so every commit hands focus to
 *     the menu BEFORE the busy state disables the control that was clicked
 *     (issue #13's snap-shut);
 *   - the levels always come from the model the directory currently reports,
 *     never from a cached label, so a model switch re-reads the ladder;
 *   - picking a model must NOT close the popover: the level footer is still
 *     there to be picked next.
 *
 * @module dsh-model-think-level/client/ComposerSlider
 */
import {
  createElement,
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from 'react'
import { createPortal } from 'react-dom'
import type { ReactNode } from 'react'
import { inferModalitiesFromName, matchKnowledgeBase } from '../knowledge.js'
import { selectRefusalMessage } from './effort-memory.js'
import { EMPTY_CONFIGURED_INPUTS, type ConfiguredInputs } from './configured-inputs.js'
import {
  disabledProviders,
  subscribeDisabledProviders,
} from './provider-enabled.js'
import {
  baseProviderOrder,
  mergeProviderOrder,
  providerOrder,
  subscribeProviderOrder,
} from './provider-order.js'
import {
  modelOrders,
  orderModelEntries,
  subscribeModelOrders,
} from './model-order.js'
import type {
  DirectoryCurrentLike,
  DirectoryGroupLike,
  EffortLevelLike,
  ModelDirectoryLike,
  ModelDirectoryStateLike,
} from './types.js'

/**
 * How long a pick may hold the menu's commit lock before it is released.
 *
 * A pick is one host round trip (a model switch, or a level switch). Ten
 * seconds covers a slow settings write and a cold host, and still bounds the
 * damage of a round trip that never answers: the lock must not outlive the
 * click that took it, because a held lock turns every further click into a
 * silent no-op.
 */
const COMMIT_WATCHDOG_MS = 10_000

/** The model's declared effort levels, when there are at least two to choose from. */
export function sliderLevels(state: ModelDirectoryStateLike): readonly EffortLevelLike[] {
  if (state.current === null) return []
  const group = state.groups.find(candidate => candidate.id === state.current?.provider)
  const model = group?.models.find(candidate => candidate.id === state.current?.model)
  const efforts = model?.reasoning?.efforts
  return efforts !== undefined && efforts.length >= 2 ? efforts : []
}

/** The current model of a directory snapshot. */
export function currentModelOf(state: ModelDirectoryStateLike): DirectoryCurrentLike | null {
  return state.current
}

/**
 * Level index the body should report as current: the session's current effort
 * when the model still offers it, else the adapter default, else the middle.
 */
export function effectiveEffortIndex(
  levels: readonly EffortLevelLike[],
  state: ModelDirectoryStateLike,
): number {
  const model = currentModelOf(state)
  const current = levels.findIndex(level => level.id === model?.reasoningEffort)
  if (current >= 0) return current
  const group = state.groups.find(candidate => candidate.id === model?.provider)
  const fallback = group?.models.find(candidate => candidate.id === model?.model)
    ?.reasoning?.defaultEffort
  const at = fallback === undefined ? -1 : levels.findIndex(level => level.id === fallback)
  if (at >= 0) return at
  return Math.floor((levels.length - 1) / 2)
}

/** The plugin's bound translator (the props face, named for reuse below). */
type Translator = (key: string, params?: Record<string, string | number>) => string

/** Props of {@link ComposerSlider}. */
export interface ComposerSliderProps {
  /** The session's shared model directory (load + select ride the official seam). */
  directory: ModelDirectoryLike
  /** Saved provider/model inputs; the host catalog may omit modalities. */
  configuredInputs?: ConfiguredInputs
  /** Localized copy (the plugin's bound translator). */
  t: Translator
}

/** A model row of one provider group, as the directory exposes it. */
interface ModelChoiceLike {
  id: string
  name?: string
  /** The declared effort ladder; present when the model reasons at all. */
  reasoning?: { efforts?: readonly unknown[]; defaultEffort?: string }
  /** Declared request modalities in core vocabulary (`image` = vision). */
  input?: readonly string[]
}

/** The models of one provider group (the SDK type leaves the element open). */
function modelsOf(group: DirectoryGroupLike): readonly ModelChoiceLike[] {
  return (group.models ?? []) as unknown as readonly ModelChoiceLike[]
}

/** Provider label: the SDK face names it differently across kernel lines. */
export function providerLabelOf(group: DirectoryGroupLike): string {
  const named = group as unknown as { name?: string; label?: string; title?: string }
  return named.name ?? named.label ?? named.title ?? group.id
}

/**
 * A truncated span carries its full text in a custom tooltip instead of the
 * native `title` bubble, which the page cannot style and which reads harsh
 * next to the menu.
 */
interface TruncatedTipState {
  /** The element that is truncating its text. */
  target: HTMLElement
  /** The full text to show. */
  text: string
}

/**
 * The tip is only for spans that ACTUALLY truncate: the check is
 * `scrollWidth > clientWidth` on enter, so a short provider or model name never
 * pops a bubble. Positioning happens at show time, under the span, aligned to
 * its right edge — the truncated end — and clamped to the viewport.
 */
function useTruncatedTip(): {
  tip: TruncatedTipState | null
  /** onMouseEnter handler for a possibly-truncating span. */
  onEnter: (event: { currentTarget: HTMLElement }, text: string) => void
  onLeave: () => void
} {
  const [tip, setTip] = useState<TruncatedTipState | null>(null)
  const timerRef = useRef<number>(0)
  useEffect(() => () => { window.clearTimeout(timerRef.current) }, [])
  const onLeave = useCallback((): void => {
    window.clearTimeout(timerRef.current)
    setTip(null)
  }, [])
  const onEnter = useCallback((event: { currentTarget: HTMLElement }, text: string): void => {
    window.clearTimeout(timerRef.current)
    const target = event.currentTarget
    // Truncation check first: nothing to show for a name that fits.
    if (target.scrollWidth <= target.clientWidth + 1) return
    timerRef.current = window.setTimeout(() => {
      setTip({ target, text })
    }, 300)
  }, [])
  return { tip, onEnter, onLeave }
}

/** The mouse-enter face the DOM hands a React handler (the only field we read). */
type EnterEvent = { currentTarget: HTMLElement }

/** The pointer gestures the footer's slider listens for (jsdom dispatches bare
 *  MouseEvents under these types, so only what the handlers read is named). */
type PointerEventLike = {
  currentTarget: HTMLElement & {
    setPointerCapture?: (pointerId: number) => void
    releasePointerCapture?: (pointerId: number) => void
    hasPointerCapture?: (pointerId: number) => boolean
  }
  pointerId: number
  clientX: number
  preventDefault: () => void
}

/** The keys the slider answers; same shape discipline as {@link PointerEventLike}. */
type KeyboardEventLike = { key: string; preventDefault: () => void }

/**
 * Render the tip bubble on <body> (fixed positioning escapes the menu's
 * overflow clip and stacking context), under the truncated span and aligned to
 * its right edge — the end the ellipsis sits at — clamped into the viewport.
 * The span keeps its label as an aria-label so screen readers still get the
 * full name without a hover.
 */
function TruncatedTip({ state }: { state: TruncatedTipState }): ReactNode {
  if (typeof document === 'undefined') return null
  const box = state.target.getBoundingClientRect()
  const left = Math.max(12, Math.min(box.right, window.innerWidth - 12))
  return createPortal(
    createElement(
      'div',
      {
        className: 'bre-tip',
        role: 'tooltip',
        style: {
          top: Math.min(box.bottom + 6, window.innerHeight - 40),
          right: Math.max(12, window.innerWidth - left),
        },
      },
      state.text,
    ),
    document.body,
  )
}

/**
 * The knowledge lookup scans boundary regexes, so cache fallback answers by
 * both lookup inputs. Relays can share an id but use different display names.
 */
const VISION_CACHE = new Map<string, boolean>()

/** Saved settings win over a directory declaration, then knowledge/name guesses. */
function supportsVision(model: ModelChoiceLike, configuredInput?: readonly string[]): boolean {
  const declared = configuredInput ?? model.input
  if (Array.isArray(declared) && declared.length > 0) return declared.includes('image')
  const key = JSON.stringify([model.id, model.name])
  const cached = VISION_CACHE.get(key)
  if (cached !== undefined) return cached
  const known = matchKnowledgeBase(model.id, model.name)?.input
  const verdict = known !== undefined
    ? known.includes('image')
    : (inferModalitiesFromName(model.id) ?? []).includes('image')
  VISION_CACHE.set(key, verdict)
  return verdict
}

/** Whether the model reasons at all (any declared effort level). */
function supportsThinking(model: ModelChoiceLike): boolean {
  const efforts = model.reasoning?.efforts
  return Array.isArray(efforts) && efforts.length > 0
}

/** The image-input badge: an eye, shown only when the model accepts images. */
function visionIcon(label: string): ReactNode {
  return createElement(
    'svg',
    {
      className: 'bre-tag-icon',
      width: 13,
      height: 13,
      viewBox: '0 0 16 16',
      fill: 'none',
      role: 'img',
      'aria-label': label,
    },
    createElement('path', {
      d: 'M1.8 8s2.4-4.2 6.2-4.2S14.2 8 14.2 8s-2.4 4.2-6.2 4.2S1.8 8 1.8 8z',
      stroke: 'currentColor',
      strokeWidth: 1.3,
      strokeLinejoin: 'round',
    }),
    createElement('circle', { cx: 8, cy: 8, r: 1.8, fill: 'currentColor' }),
  )
}

/** The thinking badge: a sparkle, shown only when the model reasons. */
function thinkingIcon(label: string): ReactNode {
  return createElement(
    'svg',
    {
      className: 'bre-tag-icon',
      width: 13,
      height: 13,
      viewBox: '0 0 16 16',
      fill: 'none',
      role: 'img',
      'aria-label': label,
    },
    createElement('path', {
      d: 'M8 1.9l1.35 3.75L13.1 7l-3.75 1.35L8 12.1 6.65 8.35 2.9 7l3.75-1.35z',
      fill: 'currentColor',
    }),
  )
}

/** The gradient's anchor hues, cool to hot: the ladder's own intensity scale,
 *  so a stop's colour IS its position on this ramp (进度条渐变色，不同的等级
 *  不同的颜色). */
const EFFORT_RAMP = ['#22c55e', '#a3e635', '#eab308', '#f97316', '#ef4444']

/** The anchors parsed to RGB once; the per-render work is a channel lerp. */
const EFFORT_RAMP_RGB = EFFORT_RAMP.map(hex => [
  parseInt(hex.slice(1, 3), 16),
  parseInt(hex.slice(3, 5), 16),
  parseInt(hex.slice(5, 7), 16),
] as const)

/**
 * The ramp colour at `t` in 0..1 — the hue a ladder stop at that fraction of
 * the track wears. Every stop of every ladder length lands on the same
 * continuous cool→hot scale, so the colour alone reads as the effort's
 * intensity whatever the ladder spells its levels.
 */
export function effortRampColor(t: number): string {
  const at = Math.min(1, Math.max(0, t)) * (EFFORT_RAMP_RGB.length - 1)
  const index = Math.min(EFFORT_RAMP_RGB.length - 2, Math.floor(at))
  const from = EFFORT_RAMP_RGB[index]
  const to = EFFORT_RAMP_RGB[index + 1]
  const mix = at - index
  const channel = (a: number, b: number): number => Math.round(a + (b - a) * mix)
  return `rgb(${channel(from[0], to[0])}, ${channel(from[1], to[1])}, ${channel(from[2], to[2])})`
}

/** The capability badges of one model, or null when it declares neither. */
function modelTags(model: ModelChoiceLike, t: Translator, configuredInput?: readonly string[]): ReactNode {
  const badges: ReactNode[] = []
  if (supportsVision(model, configuredInput)) {
    badges.push(createElement(
      'span',
      { key: 'vision', className: 'bre-tag', title: t('tagVision') },
      visionIcon(t('tagVision')),
    ))
  }
  if (supportsThinking(model)) {
    badges.push(createElement(
      'span',
      { key: 'thinking', className: 'bre-tag', title: t('tagThinking') },
      thinkingIcon(t('tagThinking')),
    ))
  }
  if (badges.length === 0) return null
  return createElement('span', { className: 'bre-option-tags' }, ...badges)
}

/** The official directory selection input this body speaks. */
interface SelectInput {
  provider: string
  model: string
  reasoningEffort?: string
}

/**
 * Render the model switcher and the reasoning-level footer. Both values come
 * from the store; the commit travels through {@link ModelDirectoryLike.select}
 * (optimistic, rolled back on refusal).
 */
export function ComposerSlider(props: ComposerSliderProps): ReactNode {
  const { directory, t, configuredInputs } = props
  const state = useSyncExternalStore(
    (notify: () => void) => directory.store.subscribe(notify),
    () => directory.store.getSnapshot(),
  )
  const inputDeclarations = useSyncExternalStore(
    notify => configuredInputs?.subscribe(notify) ?? (() => undefined),
    () => configuredInputs?.getSnapshot() ?? EMPTY_CONFIGURED_INPUTS,
  )
  const levels = sliderLevels(state)
  // User item 4 (level switching jumped): the footer used to seed itself EMPTY
  // and paint the thumb at stop 0 until a post-paint effect corrected it. That
  // first frame is the jump — worst on a remount, where every fresh root started
  // the ladder's thumb at its left end. The store already knows the answer when
  // the body mounts, so it is taken from there instead.
  const [effort, setEffort] = useState(() => {
    const snapshot = directory.store.getSnapshot()
    const ladder = sliderLevels(snapshot)
    return ladder[effectiveEffortIndex(ladder, snapshot)]?.id ?? ''
  })
  const [query, setQuery] = useState('')
  const [openProvider, setOpenProvider] = useState<string | null>(null)
  const [committing, setCommitting] = useState(false)
  const [localError, setLocalError] = useState<string | null>(null)
  const bodyRef = useRef<HTMLDivElement>(null)
  const committedRef = useRef('')
  const committingRef = useRef(false)
  const available = state.current !== null && levels.length >= 2
  // The two columns go quiet only while THIS body is committing a pick. The
  // host's own `selecting` status used to dim them too, and the host dims on
  // every wire step (including the effort-memory restore that follows a model
  // switch), so one pick produced dim/undim/dim/undim — the blink user item 4
  // reports. What the columns must not do is accept a second pick while one is
  // in flight, and that is exactly what `committing` says.
  const locked = committing
  const error = localError ?? state.error
  const select = directory.select as unknown as (
    input: SelectInput,
  ) => Promise<Parameters<typeof selectRefusalMessage>[0]>

  /**
   * Release the commit lock if a pick's round trip never settles.
   *
   * The lock exists to stop a second pick landing on top of the first, and it is
   * normally released by the same promise that took it. A round trip that never
   * answers — a hung host call, a dropped RPC — would keep the whole menu
   * read-only for the rest of the session: rows stay `disabled`, so every click
   * is silently swallowed with no error line to explain it. The watchdog frees
   * the lock and says so; the request itself stays the host's to finish, and a
   * late settle is still reflected by the store.
   * @returns the timer handle to clear once the round trip settles.
   */
  const armCommitWatchdog = useCallback((): ReturnType<typeof setTimeout> => setTimeout(() => {
    if (!committingRef.current) return
    committingRef.current = false
    setCommitting(false)
    setLocalError(t('sliderCommitSlow'))
  }, COMMIT_WATCHDOG_MS), [t])

  // The store is the single source of truth: every settled snapshot pulls the
  // selection back onto the level the session actually reports. Skipped while a
  // commit is in flight (the optimistic pick must not be yanked back mid-round
  // trip) and while the pointer holds the thumb (the drag owns the position).
  //
  // User item 4: this used to run in `useEffect`, i.e. after paint — a fresh
  // mount painted its first frame from whatever the initializer said and only
  // then corrected itself, which is the visible jump. A layout effect settles the
  // level in the same commit, so no wrong frame is ever painted.
  useLayoutEffect(() => {
    if (committingRef.current || effortDraggingRef.current) return
    const index = effectiveEffortIndex(levels, state)
    const next = levels[index]?.id ?? ''
    committedRef.current = next
    setEffort(current => (current === next ? current : next))
    setLocalError(null)
  }, [available, levels, state])

  useEffect(() => {
    directory.load().catch(() => undefined)
  }, [directory])

  useEffect(() => {
    configuredInputs?.load().catch(() => undefined)
  }, [configuredInputs])

  const current = state.current
  const group = state.groups.find(candidate => candidate.id === current?.provider)
  const model = group?.models.find(candidate => candidate.id === current?.model)
  const modelName = model?.name ?? (current === null ? t('triggerFallback') : current.model)
  const providerName = current === null
    ? ''
    : providerLabelOf(group ?? ({ id: current.provider } as DirectoryGroupLike))
  const effortLabel = levels.find(level => level.id === effort)?.name ?? t('effortDefault')

  // The provider order set on the Models settings page, where the rows are
  // draggable: the switcher reports the same sequence so the two views never
  // disagree about where a provider lives. Subscribed rather than read once,
  // because a drag on the settings page has to reach an already-open composer.
  const preferredOrder = useSyncExternalStore(subscribeProviderOrder, providerOrder)

  // The providers switched off on the Models settings page. Hiding one here is
  // the whole point of the switch, and the head still keeps the current
  // provider visible so the selected model remains unambiguous.
  const disabled = useSyncExternalStore(subscribeDisabledProviders, disabledProviders)

  // The model order set inside each provider's editor on the settings page: the
  // right column reports the same sequence, per provider. Subscribed for the
  // same reason as the provider order — a drag has to reach an open composer.
  const modelOrderByProvider = useSyncExternalStore(subscribeModelOrders, modelOrders)

  // Providers that actually hold models; the one whose models the right column
  // shows follows the current model until the user picks another column entry.
  const providerCatalog = state.groups
    .filter(candidate => modelsOf(candidate).length > 0 && !disabled.includes(candidate.id))
    .map(candidate => candidate.id)
  const providerIds = mergeProviderOrder(baseProviderOrder(providerCatalog), preferredOrder)
  const shownProvider = openProvider !== null && providerIds.includes(openProvider)
    ? openProvider
    : (current !== null && providerIds.includes(current.provider)
      ? current.provider
      : providerIds[0] ?? null)

  // The resident search: a non-empty query searches EVERY provider's models and
  // the right column lists the matches flat, each named by its provider; an
  // empty one restores the per-provider column. Matching is a case-insensitive
  // substring over the display name and the id, the same two strings the
  // official pane's search filters.
  const needle = query.trim().toLowerCase()
  const searching = needle !== ''
  const matches: Array<{ provider: string; choice: ModelChoiceLike }> = searching
    ? providerIds.flatMap(provider => orderModelEntries(
        modelsOf(state.groups.find(candidate => candidate.id === provider) as DirectoryGroupLike),
        modelOrderByProvider[provider] ?? [],
      )
        .filter(choice => (choice.name ?? choice.id).toLowerCase().includes(needle)
          || choice.id.toLowerCase().includes(needle))
        .map(choice => ({ provider, choice })))
    : []
  const shownModels: Array<{ provider: string; choice: ModelChoiceLike }> = searching
    ? matches
    : (shownProvider === null
      ? []
      : orderModelEntries(
        modelsOf(state.groups.find(candidate => candidate.id === shownProvider) as DirectoryGroupLike),
        modelOrderByProvider[shownProvider] ?? [],
      ).map(choice => ({ provider: shownProvider as string, choice })))
  const activeKey = current === null ? '' : current.provider + '/' + current.model

  /**
   * Hand focus to the menu before a control this body owns is disabled or
   * unmounted. A focused disabled node drops focus onto <body>, and the shell
   * reads that as "focus left the seat" and closes the menu instantly — the
   * flash-out every commit shipped with (issue #13).
   */
  const focusMenu = useCallback((): void => {
    // The popover's role follows the pane upstream shows (`group` while the
    // model list is open, `menu` everywhere else) — see model-menu.ts. Match
    // both, or a HISTORICAL session (which opens straight into the list pane)
    // would drop focus onto <body> and get its menu closed mid-commit.
    const menu = bodyRef.current?.closest<HTMLElement>('[role="menu"], [role="group"]')
    if (menu === null || menu === undefined) return
    menu.tabIndex = -1
    menu.focus({ preventScroll: true })
  }, [])

  /** Pick a model. Deliberately leaves the popover open. */
  const chooseModel = useCallback(async (provider: string, id: string): Promise<void> => {
    if (committingRef.current) return
    const now = directory.store.getSnapshot().current
    // A pick answers the search: the columns go back to the per-provider view.
    if (searching) setQuery('')
    if (now !== null && now.provider === provider && now.model === id) return
    committingRef.current = true
    focusMenu()
    setCommitting(true)
    setLocalError(null)
    const watchdog = armCommitWatchdog()
    try {
      // No reasoningEffort on purpose: a model switch resets the level, and the
      // effort-memory wiretap then restores the one remembered for that model.
      const outcome = await select({ provider, model: id })
      const refusal = selectRefusalMessage(outcome)
      if (refusal !== undefined) throw new Error(refusal)
    } catch (cause) {
      setLocalError(cause instanceof Error ? cause.message : String(cause))
    } finally {
      clearTimeout(watchdog)
      committingRef.current = false
      setCommitting(false)
    }
  }, [armCommitWatchdog, directory, focusMenu, searching, select])

  /** Pick a reasoning level. Leaves the popover open. */
  const chooseEffort = useCallback(async (next: string): Promise<void> => {
    if (committingRef.current) return
    // The footer's displayed level can be a PREDICTION rather than a
    // commitment: `effectiveEffortIndex` falls back to the adapter default (or
    // the middle of the ladder) when the session carries no effort, so the
    // FIRST use of a model shows "Medium" while the seat trigger still reads
    // Default. Guarding the repick on that displayed level swallowed the very
    // click that would commit it, leaving the level unpickable until another
    // one was chosen. Only the SESSION'S OWN effort is a settled level.
    if (next === state.current?.reasoningEffort && state.status !== 'error') return
    committingRef.current = true
    const previous = committedRef.current
    focusMenu()
    setCommitting(true)
    setLocalError(null)
    // Optimistic pick keeps the footer responsive.
    setEffort(next)

    const watchdog = armCommitWatchdog()
    try {
      const now = state.current
      if (now === null) throw new Error(t('sliderNoCurrent'))
      const outcome = await select({
        provider: now.provider,
        model: now.model,
        reasoningEffort: next,
      })
      // Kernels through 0.1.6-alpha.1 reject by throwing; 0.1.6-alpha.2
      // resolves the refusal result instead. Normalizing it into a throw keeps
      // the optimistic rollback and the in-menu error line identical.
      const refusal = selectRefusalMessage(outcome)
      if (refusal !== undefined) throw new Error(refusal)

      const snapshot = directory.store.getSnapshot()
      const accepted = levels.find(level => level.id === snapshot.current?.reasoningEffort)?.id
      const settled = accepted ?? next
      committedRef.current = settled
      setEffort(settled)
    } catch (cause) {
      committedRef.current = previous
      setEffort(previous)
      setLocalError(cause instanceof Error ? cause.message : String(cause))
    } finally {
      clearTimeout(watchdog)
      committingRef.current = false
      setCommitting(false)
    }
  }, [armCommitWatchdog, directory, focusMenu, levels, select, state.current, state.status, t])

  // The footer's level pick is a SLIDER, not a row of capsules: a long ladder
  // (off…max is seven) wrapped its row inside the popover (思考等级选择换成进度
  // 条样式), and a track is fixed-length whatever the ladder's size. Dragging
  // only moves a PREVIEW stop; the commit fires on release, so one drag is one
  // select() round-trip, exactly one capsule click used to be.
  //
  // User item 4 (the slider was not smooth): the preview used to be an integer
  // stop held in React state, re-rendered on every `pointermove` — so the thumb
  // could only sit at N positions and moved at React's rate, not the pointer's.
  // The preview is now a continuous RATIO painted straight onto the two nodes
  // through their refs, coalesced into one animation frame; React state is only
  // touched when the pointer crosses onto a different stop, which is all the
  // ticks, the head label and the ARIA value need.
  const effortTrackRef = useRef<HTMLDivElement | null>(null)
  const effortFillRef = useRef<HTMLSpanElement | null>(null)
  const effortThumbRef = useRef<HTMLSpanElement | null>(null)
  const effortDraggingRef = useRef(false)
  const dragStopRef = useRef<number | null>(null)
  const dragRatioRef = useRef<number | null>(null)
  const dragFrameRef = useRef<number | null>(null)
  const [dragStop, setDragStop] = useState<number | null>(null)
  const [dragRatio, setDragRatio] = useState<number | null>(null)
  const effortIndex = Math.max(0, levels.findIndex(level => level.id === effort))
  const shownStop = dragStop ?? effortIndex
  const effortPct = (dragRatio ?? (levels.length > 1 ? shownStop / (levels.length - 1) : 0)) * 100

  /** Where along the track a client X sits, as a fraction of its width. */
  const ratioFromX = (clientX: number): number => {
    const track = effortTrackRef.current
    if (track === null) return 0
    const rect = track.getBoundingClientRect()
    if (rect.width <= 0) return 0
    return Math.min(1, Math.max(0, (clientX - rect.left) / rect.width))
  }

  /** The stop a fraction of the track lands on. */
  const stopOfRatio = (ratio: number): number =>
    levels.length > 1 ? Math.round(ratio * (levels.length - 1)) : 0

  /** Paint one preview frame without a React render: the two nodes move. */
  const paintPreview = (ratio: number): void => {
    dragRatioRef.current = ratio
    const pct = ratio * 100
    if (effortFillRef.current !== null) {
      effortFillRef.current.style.clipPath = `inset(0 ${100 - pct}% 0 0)`
    }
    if (effortThumbRef.current !== null) effortThumbRef.current.style.left = `${pct}%`
  }

  const previewFromX = (clientX: number): void => {
    if (levels.length === 0) return
    const ratio = ratioFromX(clientX)
    // One paint per frame, whatever the pointer's rate is.
    if (dragFrameRef.current === null) {
      dragFrameRef.current = requestAnimationFrame(() => {
        dragFrameRef.current = null
        if (effortDraggingRef.current && dragRatioRef.current !== null) paintPreview(dragRatioRef.current)
      })
    }
    dragRatioRef.current = ratio
    // React state only when the crossed stop changes: that is what the ticks,
    // the head label and the ARIA value read.
    const stop = stopOfRatio(ratio)
    if (stop !== dragStopRef.current) {
      dragStopRef.current = stop
      setDragStop(stop)
      setDragRatio(ratio)
    }
  }

  /** Drop the preview and let the settled level take the thumb back. */
  const clearPreview = (): void => {
    dragStopRef.current = null
    dragRatioRef.current = null
    if (dragFrameRef.current !== null) {
      cancelAnimationFrame(dragFrameRef.current)
      dragFrameRef.current = null
    }
    setDragStop(null)
    setDragRatio(null)
  }

  const onEffortPointerDown = (event: PointerEventLike): void => {
    if (!available) return
    event.preventDefault()
    effortDraggingRef.current = true
    if (typeof event.currentTarget.setPointerCapture === 'function') {
      try { event.currentTarget.setPointerCapture(event.pointerId) } catch { /* capture is best-effort */ }
    }
    dragStopRef.current = stopOfRatio(ratioFromX(event.clientX))
    previewFromX(event.clientX)
    setDragStop(dragStopRef.current)
    setDragRatio(dragRatioRef.current)
  }
  const onEffortPointerMove = (event: PointerEventLike): void => {
    // No `busy` here: a store notification mid-drag used to freeze the thumb
    // under the finger. The commit paths guard themselves.
    if (!effortDraggingRef.current) return
    previewFromX(event.clientX)
  }
  const onEffortPointerUp = (event: PointerEventLike): void => {
    if (!effortDraggingRef.current) return
    effortDraggingRef.current = false
    if (typeof event.currentTarget.releasePointerCapture === 'function'
      && event.currentTarget.hasPointerCapture?.(event.pointerId) === true) {
      try { event.currentTarget.releasePointerCapture(event.pointerId) } catch { /* capture is best-effort */ }
    }
    const at = stopOfRatio(ratioFromX(event.clientX))
    const next = levels[at]
    if (next === undefined) {
      clearPreview()
      return
    }
    // The preview stays up until the commit settles: dropping it first made a
    // guarded no-op snap the thumb back to where it started.
    void chooseEffort(next.id).finally(clearPreview)
  }
  const onEffortKeyDown = (event: KeyboardEventLike): void => {
    if (!available) return
    let at: number | undefined
    if (event.key === 'ArrowRight' || event.key === 'ArrowUp') at = Math.min(levels.length - 1, shownStop + 1)
    else if (event.key === 'ArrowLeft' || event.key === 'ArrowDown') at = Math.max(0, shownStop - 1)
    else if (event.key === 'Home') at = 0
    else if (event.key === 'End') at = levels.length - 1
    if (at === undefined) return
    event.preventDefault()
    const next = levels[at]
    if (next !== undefined) void chooseEffort(next.id)
  }

  /** The truncated-name tooltip wiring, shared by the head and the columns. */
  const { tip, onEnter, onLeave } = useTruncatedTip()

  // The head: the label, the current model and its provider pushed right. The
  // level used to be repeated here as a pill; it now appears once, in the
  // footer, where it can also be changed.
  const head = createElement(
    'div',
    { className: 'bre-menu-head' },
    createElement('span', { className: 'bre-row-label' }, t('modelRowLabel')),
    createElement(
      'span',
      { className: 'bre-menu-cur' },
      createElement(
        'span',
        {
          className: 'bre-menu-name',
          'aria-label': current === null ? modelName : providerName + ' · ' + modelName,
          onMouseEnter: (event: EnterEvent) => {
            onEnter(event, current === null ? modelName : providerName + ' · ' + modelName)
          },
          onMouseLeave: onLeave,
        },
        modelName,
      ),
      providerName === '' ? null : createElement('span', { className: 'bre-menu-prov' }, providerName),
    ),
  )
  // The resident search box, the same shape the official pane's search wears.
  const search = createElement(
    'div',
    { className: 'bre-menu-search' },
    createElement(
      'div',
      { className: 'bre-menu-search-box' },
      createElement(
        'span',
        { className: 'bre-menu-search-icon', 'aria-hidden': true },
        createElement(
          'svg',
          { viewBox: '0 0 16 16', fill: 'none', stroke: 'currentColor', strokeWidth: '1.5' },
          createElement('circle', { cx: '7', cy: '7', r: '4.5' }),
          createElement('path', { d: 'M10.5 10.5L14 14', strokeLinecap: 'round' }),
        ),
      ),
      createElement('input', {
        type: 'text',
        className: 'bre-menu-search-input',
        role: 'searchbox',
        placeholder: t('modelSearchPlaceholder'),
        'aria-label': t('modelSearchPlaceholder'),
        value: query,
        spellCheck: false,
        autoComplete: 'off',
        onChange: (event: { currentTarget: HTMLInputElement }) => {
          setQuery(event.currentTarget.value)
        },
      }),
      query === ''
        ? null
        : createElement(
          'button',
          {
            type: 'button',
            className: 'bre-menu-search-clear',
            title: t('modelSearchClear'),
            'aria-label': t('modelSearchClear'),
            onClick: () => { setQuery('') },
          },
          createElement(
            'svg',
            { viewBox: '0 0 16 16', fill: 'none', stroke: 'currentColor', strokeWidth: '1.5' },
            createElement('path', { d: 'M4 4L12 12M12 4L4 12', strokeLinecap: 'round' }),
          ),
        ),
    ),
  )

  // The provider column: one cell per provider, the count where the drill
  // chevron used to be (the columns are always open; there is nothing to
  // drill into). Clicking a provider narrows the right column and answers any
  // active search.
  const providerColumn = createElement(
    'div',
    { className: 'bre-providers', role: 'group', 'aria-label': t('modelRowLabel') },
    ...providerIds.map(provider => {
      const providerGroup = state.groups.find(candidate => candidate.id === provider) as DirectoryGroupLike
      return createElement(
        'button',
        {
          key: provider,
          type: 'button',
          className: 'bre-provider'
            + (provider === shownProvider ? ' is-open' : '')
            + (provider === current?.provider ? ' is-current' : ''),
          disabled: locked,
          'aria-expanded': provider === shownProvider,
          onMouseLeave: onLeave,
          onClick: () => { setOpenProvider(provider); setQuery('') },
        },
        createElement(
          'span',
          {
            className: 'bre-option-name',
            'aria-label': providerLabelOf(providerGroup),
            onMouseEnter: (event: EnterEvent) => { onEnter(event, providerLabelOf(providerGroup)) },
          },
          providerLabelOf(providerGroup),
        ),
        createElement('span', { className: 'bre-provider-count' }, String(modelsOf(providerGroup).length)),
      )
    }),
    ...(providerIds.length === 0
      ? [createElement('div', { key: 'no-providers', className: 'bre-empty' }, t('sliderNoCurrent'))]
      : []),
  )

  // The model column: the selected provider's models, or — while the search
  // holds a query — the flat list of matches across every provider, each named
  // by its provider. The height is FIXED either way (see .bre-panel-models), so
  // neither typing nor a provider switch ever resizes the card.
  const modelColumn = createElement(
    'div',
    { className: 'bre-provider-models', role: 'group', 'aria-label': t('modelRowLabel') },
    ...(shownModels.length === 0
      ? [createElement(
        'div',
        { key: 'no-models', className: 'bre-empty' },
        searching ? t('modelSearchNoMatches') : t('sliderNoCurrent'),
      )]
      : shownModels.map(({ provider, choice }) => {
        const key = provider + '/' + choice.id
        const active = key === activeKey
        const label = choice.name ?? choice.id
        const fullLabel = searching
          ? providerLabelOf(state.groups.find(candidate => candidate.id === provider) as DirectoryGroupLike) + ' · ' + label
          : label
        return createElement(
          'button',
          {
            key,
            type: 'button',
            className: 'bre-option' + (active ? ' is-active' : ''),
            disabled: locked,
            'aria-pressed': active,
            onMouseLeave: onLeave,
            onClick: () => { void chooseModel(provider, choice.id) },
          },
          createElement(
            'span',
            {
              className: 'bre-option-name',
              'aria-label': fullLabel,
              onMouseEnter: (event: EnterEvent) => { onEnter(event, fullLabel) },
            },
            searching
              ? createElement(
                'span',
                { className: 'bre-option-origin' },
                providerLabelOf(state.groups.find(candidate => candidate.id === provider) as DirectoryGroupLike) + ' · ',
              )
              : null,
            label,
          ),
          // No tick on a model row: it would sit right beside the capability
          // badges and read as one of them. The accent colour (plus the row
          // tint in CSS) is the whole selection signal.
          modelTags(choice, t, inputDeclarations.get(provider)?.get(choice.id)),
        )
      })),
  )

  // The footer: the level switched IN PLACE — a head naming the section and the
  // level under the thumb (进度条上方：思考等级 + 当前等级), then the draggable
  // slider whose stops are the declared levels, the committed one under the
  // thumb, the names written below the track. Fixed-length whatever the
  // ladder's size, so a seven-level ladder never wraps the popover's foot.
  const footer = createElement(
    'div',
    { className: 'bre-menu-foot' },
    available
      ? createElement(
        'div',
        { className: 'bre-menu-slider' },
        // The head echoes what the slider itself announces (its aria-label and
        // valuetext), so it is hidden from assistive tech like the stop names
        // below the track; the value follows the drag preview, not only the
        // committed level.
        createElement(
          'div',
          { className: 'bre-effort-slider-head', 'aria-hidden': true },
          createElement('span', { className: 'bre-effort-slider-head-label' }, t('effortRowLabel')),
          createElement(
            'span',
            { className: 'bre-effort-slider-head-value' },
            levels[shownStop]?.name ?? effortLabel,
          ),
        ),
        createElement(
          'div',
          {
            className: 'bre-effort-slider',
            ref: effortTrackRef,
            role: 'slider',
            tabIndex: 0,
            'aria-label': t('effortRowLabel'),
            'aria-valuemin': 0,
            'aria-valuemax': levels.length - 1,
            'aria-valuenow': shownStop,
            'aria-valuetext': levels[shownStop]?.name,
            'aria-disabled': locked || undefined,
            // The drag owns the thumb while it is held: the stylesheet reads
            // this to switch off the settle transition (user item 4).
            'data-bre-dragging': dragStop === null ? undefined : 'true',
            onPointerDown: onEffortPointerDown,
            onPointerMove: onEffortPointerMove,
            onPointerUp: onEffortPointerUp,
            onPointerCancel: onEffortPointerUp,
            onKeyDown: onEffortKeyDown,
          },
          createElement('span', {
            className: 'bre-effort-slider-fill',
            ref: effortFillRef,
            style: { clipPath: `inset(0 ${100 - effortPct}% 0 0)` },
          }),
          // Every stop but the one under the thumb: a 2px hole in the track, so
          // the ladder's size is legible without a hue per stop.
          ...levels.map((level, at) => at === shownStop
            ? null
            : createElement('span', {
              key: 'tick-' + level.id,
              className: 'bre-effort-slider-tick',
              style: { left: levels.length > 1 ? `${(at / (levels.length - 1)) * 100}%` : '0%' },
            })),
          createElement('span', {
            className: 'bre-effort-slider-thumb',
            ref: effortThumbRef,
            style: { left: `${effortPct}%` },
          }),
        ),
        createElement(
          'div',
          { className: 'bre-effort-slider-labels', 'aria-hidden': true },
          ...levels.map((level, at) => createElement(
            'span',
            {
              key: level.id,
              className: 'bre-effort-slider-label'
                + (at === 0 ? ' is-first' : '')
                + (at === levels.length - 1 ? ' is-last' : '')
                + (at === shownStop ? ' is-on' : ''),
              style: { left: levels.length > 1 ? `${(at / (levels.length - 1)) * 100}%` : '0%' },
            },
            level.name,
          )),
        ),
      )
      : createElement('span', { className: 'bre-row-value is-muted' }, t('sliderNoLevels')),
  )

  return createElement(
    'div',
    { className: 'bre-slider-body', ref: bodyRef },
    createElement(
      'div',
      { className: 'bre-card' },
      head,
      search,
      // The columns live in the fixed-height panel wrapper (.bre-panel-models):
      // switching provider must not resize the card, and the search must not
      // either — the list scrolls inside the same box whatever it shows.
      createElement('div', { className: 'bre-panel bre-panel-models' }, providerColumn, modelColumn),
      footer,
    ),
    error === null
      ? null
      : createElement('div', { className: 'bre-model-error', role: 'status' }, error),
    tip === null ? null : createElement(TruncatedTip, { key: 'tip', state: tip }),
  )
}
