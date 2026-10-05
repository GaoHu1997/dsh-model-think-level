/**
 * The replicated composer popover body: a "model" row and a "reasoning level"
 * row, both driven from the official model directory.
 *
 * Presentation follows `dsh-tauri-model-config`: one bordered card, a chevron
 * that rotates as its panel opens, and a selectable list rendered under the row
 * it belongs to. The model list is a provider column with the models of the
 * selected provider beside it. The radiation slider this module shipped with
 * upstream is gone — it was reported as ugly and the reference plugin has none.
 *
 * Four invariants are load-bearing and must survive any edit:
 *   - the body is mounted INSIDE the official model menu, and the shell closes
 *     that menu on any blur that leaves the card, so every commit hands focus to
 *     the menu BEFORE the busy state disables the control that was clicked
 *     (issue #13's snap-shut);
 *   - the levels always come from the model the directory currently reports,
 *     never from a cached label, so a model switch re-reads the ladder;
 *   - picking a model must NOT close the popover: the reasoning level below is
 *     still unpicked, so the list collapses and the rows stay;
 *   - a panel and the card's re-measure must land in the SAME frame (see
 *     {@link ComposerSlider}'s `togglePanel`), or the panel is painted once at
 *     the stale position and the menu visibly jumps.
 *
 * @module dsh-model-think-level/client/ComposerSlider
 */
import {
  createElement,
  useCallback,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from 'react'
import { flushSync } from 'react-dom'
import type { ReactNode } from 'react'
import { inferModalitiesFromName, matchKnowledgeBase } from '../knowledge.js'
import { selectRefusalMessage } from './effort-memory.js'
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
  /** Localized copy (the plugin's bound translator). */
  t: Translator
  /**
   * Re-measure hook. The official card measures itself from its own layout
   * effect (`[open, pane, state]`) and only re-runs on a window `resize`, so a
   * body that grows here must ask the injector to re-place it — in the same
   * frame, never from a deferred task.
   */
  onLayoutChange?: () => void
}

/** Which row has its list open. At most one at a time. */
type Panel = 'model' | 'effort' | null

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

/** The chevron marking a row as drilling into a list; rotates while open. */
function chevron(open: boolean): ReactNode {
  return createElement(
    'span',
    { className: 'bre-row-chevron' + (open ? ' is-open' : ''), 'aria-hidden': true },
    '›',
  )
}

/** The check marking the current entry of an open list. */
function checkIcon(): ReactNode {
  return createElement(
    'svg',
    {
      className: 'bre-option-check',
      width: 14,
      height: 14,
      viewBox: '0 0 16 16',
      fill: 'none',
      'aria-hidden': true,
    },
    createElement('path', {
      d: 'M3.5 8.5l3 3 6-7',
      stroke: 'currentColor',
      strokeWidth: 1.6,
      strokeLinecap: 'round',
      strokeLinejoin: 'round',
    }),
  )
}

/**
 * Capability badge caches. The knowledge lookup is a linear scan with boundary
 * regexes; the model list re-renders on every panel toggle, so the answer is
 * memoized per model id.
 */
const VISION_CACHE = new Map<string, boolean>()

/**
 * Whether the model accepts image input. The declaration the directory carries
 * wins; a model that declares nothing falls back to the plugin's own knowledge
 * base and then to its name heuristic — the same tiers the suggestion engine
 * uses, so the badge can never be more confident than the suggestion it would
 * write.
 */
function supportsVision(model: ModelChoiceLike): boolean {
  if (Array.isArray(model.input)) return model.input.includes('image')
  const cached = VISION_CACHE.get(model.id)
  if (cached !== undefined) return cached
  const known = matchKnowledgeBase(model.id, model.name)?.input
  const verdict = known !== undefined
    ? known.includes('image')
    : (inferModalitiesFromName(model.id) ?? []).includes('image')
  VISION_CACHE.set(model.id, verdict)
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

/** The capability badges of one model, or null when it declares neither. */
function modelTags(model: ModelChoiceLike, t: Translator): ReactNode {
  const badges: ReactNode[] = []
  if (supportsVision(model)) {
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
 * Render the model row and the reasoning-level row. Both values come from the
 * store; the commit travels through {@link ModelDirectoryLike.select}
 * (optimistic, rolled back on refusal).
 */
export function ComposerSlider(props: ComposerSliderProps): ReactNode {
  const { directory, t } = props
  const layoutChange = props.onLayoutChange
  const state = useSyncExternalStore(
    (notify: () => void) => directory.store.subscribe(notify),
    () => directory.store.getSnapshot(),
  )
  const levels = sliderLevels(state)
  const [effort, setEffort] = useState('')
  const [panel, setPanel] = useState<Panel>(null)
  const [openProvider, setOpenProvider] = useState<string | null>(null)
  const [committing, setCommitting] = useState(false)
  const [localError, setLocalError] = useState<string | null>(null)
  const bodyRef = useRef<HTMLDivElement>(null)
  const committedRef = useRef('')
  const committingRef = useRef(false)
  const available = state.current !== null && levels.length >= 2
  const busy = committing || state.status === 'selecting'
  const error = localError ?? state.error
  const select = directory.select as unknown as (
    input: SelectInput,
  ) => Promise<Parameters<typeof selectRefusalMessage>[0]>

  // The store is the single source of truth: every settled snapshot pulls the
  // selection back onto the level the session actually reports. Skipped while a
  // commit is in flight so the optimistic pick is not yanked back mid-round-trip.
  useEffect(() => {
    if (committingRef.current) return
    const index = effectiveEffortIndex(levels, state)
    const next = levels[index]?.id ?? ''
    committedRef.current = next
    setEffort(next)
    setLocalError(null)
  }, [available, levels, state])

  useEffect(() => {
    directory.load().catch(() => undefined)
  }, [directory])

  const current = state.current
  const group = state.groups.find(candidate => candidate.id === current?.provider)
  const model = group?.models.find(candidate => candidate.id === current?.model)
  const modelName = model?.name ?? (current === null ? t('triggerFallback') : current.model)
  const modelLabel = current === null
    ? modelName
    : providerLabelOf(group ?? ({ id: current.provider } as DirectoryGroupLike)) + ' · ' + modelName
  const effortLabel = levels.find(level => level.id === effort)?.name ?? t('effortDefault')

  // The provider order set on the Models settings page, where the rows are
  // draggable: the switcher reports the same sequence so the two views never
  // disagree about where a provider lives. Subscribed rather than read once,
  // because a drag on the settings page has to reach an already-open composer.
  const preferredOrder = useSyncExternalStore(subscribeProviderOrder, providerOrder)

  // The providers switched off on the Models settings page. Hiding one here is
  // the whole point of the switch, and the trigger decoration still keeps the
  // current provider visible so the selected model remains unambiguous.
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
  const shownModels = shownProvider === null
    ? []
    : orderModelEntries(
      modelsOf(state.groups.find(candidate => candidate.id === shownProvider) as DirectoryGroupLike),
      modelOrderByProvider[shownProvider] ?? [],
    )
  const activeKey = current === null ? '' : current.provider + '/' + current.model

  /**
   * Toggle a list. A panel changes the body's height, and the official card only
   * re-measures on a window `resize`, so BOTH steps must land in one frame:
   * commit the DOM synchronously, then let the injector re-place the card before
   * the browser paints. Deferring the re-measure (the previous `setTimeout`)
   * painted the panel once at the stale position — the flash that read as a
   * different page.
   */
  const togglePanel = useCallback((next: Panel): void => {
    if (panel === next) return
    flushSync(() => { setPanel(next) })
    layoutChange?.()
  }, [layoutChange, panel])

  /** Collapse whichever list is open, re-placing the card in the same frame. */
  const collapsePanel = useCallback((): void => {
    if (panel === null) return
    flushSync(() => { setPanel(null) })
    layoutChange?.()
  }, [layoutChange, panel])

  /**
   * Hand focus to the menu before a control this body owns is disabled or
   * unmounted. A focused disabled node drops focus onto <body>, and the shell
   * reads that as "focus left the seat" and closes the menu instantly — the
   * flash-out every commit shipped with (issue #13).
   */
  const focusMenu = useCallback((): void => {
    const menu = bodyRef.current?.closest<HTMLElement>('[role="menu"]')
    if (menu === null || menu === undefined) return
    menu.tabIndex = -1
    menu.focus({ preventScroll: true })
  }, [])

  /** Pick a model. Collapses the list; deliberately leaves the popover open. */
  const chooseModel = useCallback(async (provider: string, id: string): Promise<void> => {
    if (committingRef.current) return
    const now = directory.store.getSnapshot().current
    collapsePanel()
    if (now !== null && now.provider === provider && now.model === id) return
    committingRef.current = true
    focusMenu()
    setCommitting(true)
    setLocalError(null)
    try {
      // No reasoningEffort on purpose: a model switch resets the level, and the
      // effort-memory wiretap then restores the one remembered for that model.
      const outcome = await select({ provider, model: id })
      const refusal = selectRefusalMessage(outcome)
      if (refusal !== undefined) throw new Error(refusal)
    } catch (cause) {
      setLocalError(cause instanceof Error ? cause.message : String(cause))
    } finally {
      committingRef.current = false
      setCommitting(false)
    }
  }, [collapsePanel, directory, focusMenu, select])

  /** Pick a reasoning level. Collapses the list; leaves the popover open. */
  const chooseEffort = useCallback(async (next: string): Promise<void> => {
    if (committingRef.current) return
    collapsePanel()
    // The row's displayed level can be a PREDICTION rather than a commitment:
    // `effectiveEffortIndex` falls back to the adapter default (or the middle of
    // the ladder) when the session carries no effort, so the FIRST use of a
    // model shows "Medium" while the seat trigger still reads Default. Guarding
    // the repick on that displayed level swallowed the very click that would
    // commit it, leaving the level unpickable until another one was chosen.
    // Only the SESSION'S OWN effort is a settled level.
    if (next === state.current?.reasoningEffort && state.status !== 'error') return
    committingRef.current = true
    const previous = committedRef.current
    focusMenu()
    setCommitting(true)
    setLocalError(null)
    // Optimistic pick keeps the row responsive.
    setEffort(next)

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
      committingRef.current = false
      setCommitting(false)
    }
  }, [collapsePanel, directory, focusMenu, levels, select, state.current, state.status, t])

  /** The two rows; each opens its own list underneath. */
  const rows: ReactNode[] = [
    createElement(
      'button',
      {
        key: 'row:model',
        type: 'button',
        role: 'menuitem',
        className: 'bre-row-control' + (panel === 'model' ? ' is-open' : ''),
        disabled: busy,
        'aria-expanded': panel === 'model',
        onClick: () => { togglePanel(panel === 'model' ? null : 'model') },
      },
      createElement('span', { className: 'bre-row-label' }, t('modelRowLabel')),
      createElement('span', { className: 'bre-row-value' }, modelLabel),
      chevron(panel === 'model'),
    ),
    // Provider column + the models of the selected provider, side by side. The
    // panel's height is FIXED (see .bre-panel-models): switching provider must
    // not resize the card, or every provider click would need another re-place.
    panel === 'model'
      ? createElement(
        'div',
        { key: 'panel:model', className: 'bre-panel bre-panel-models' },
        createElement(
          'div',
          { className: 'bre-providers', role: 'group', 'aria-label': t('modelRowLabel') },
          ...providerIds.map(provider => createElement(
            'button',
            {
              key: provider,
              type: 'button',
              className: 'bre-provider'
                + (provider === shownProvider ? ' is-open' : '')
                + (provider === current?.provider ? ' is-current' : ''),
              disabled: busy,
              'aria-expanded': provider === shownProvider,
              onClick: () => { setOpenProvider(provider) },
            },
            createElement(
              'span',
              { className: 'bre-option-name' },
              providerLabelOf(state.groups.find(candidate => candidate.id === provider) as DirectoryGroupLike),
            ),
            chevron(provider === shownProvider),
          )),
          ...(providerIds.length === 0
            ? [createElement('div', { key: 'no-providers', className: 'bre-empty' }, t('sliderNoCurrent'))]
            : []),
        ),
        createElement(
          'div',
          { className: 'bre-provider-models', role: 'group', 'aria-label': t('modelRowLabel') },
          ...(shownModels.length === 0
            ? [createElement('div', { key: 'no-models', className: 'bre-empty' }, t('sliderNoCurrent'))]
            : shownModels.map(choice => {
              const key = shownProvider + '/' + choice.id
              const active = key === activeKey
              return createElement(
                'button',
                {
                  key,
                  type: 'button',
                  className: 'bre-option' + (active ? ' is-active' : ''),
                  disabled: busy,
                  'aria-pressed': active,
                  onClick: () => { void chooseModel(shownProvider as string, choice.id) },
                },
                createElement('span', { className: 'bre-option-name' }, choice.name ?? choice.id),
                // No tick on a model row: it would sit right beside the
                // capability badges and read as one of them. The accent colour
                // (plus the row tint in CSS) is the whole selection signal.
                modelTags(choice, t),
              )
            })),
        ),
      )
      : null,
    createElement('div', { key: 'divider', className: 'bre-divider', 'aria-hidden': true }),
    createElement(
      'button',
      {
        key: 'row:effort',
        type: 'button',
        role: 'menuitem',
        className: 'bre-row-control' + (panel === 'effort' ? ' is-open' : ''),
        disabled: busy || !available,
        'aria-expanded': available ? panel === 'effort' : undefined,
        onClick: () => { togglePanel(panel === 'effort' ? null : 'effort') },
      },
      createElement('span', { className: 'bre-row-label' }, t('effortRowLabel')),
      createElement(
        'span',
        { className: 'bre-row-value' + (available ? '' : ' is-muted') },
        available ? effortLabel : t('sliderNoLevels'),
      ),
      available ? chevron(panel === 'effort') : null,
    ),
    panel === 'effort' && available
      ? createElement(
        'div',
        {
          key: 'panel:effort',
          className: 'bre-panel',
          role: 'group',
          'aria-label': t('effortRowLabel'),
        },
        ...levels.map(level => createElement(
          'button',
          {
            key: level.id,
            type: 'button',
            className: 'bre-option' + (level.id === effort ? ' is-active' : ''),
            disabled: busy,
            'aria-pressed': level.id === effort,
            onClick: () => { void chooseEffort(level.id) },
          },
          createElement('span', { className: 'bre-option-name' }, level.name),
          level.id === effort ? checkIcon() : null,
        )),
      )
      : null,
  ]

  return createElement(
    'div',
    { className: 'bre-slider-body', ref: bodyRef },
    createElement('div', { className: 'bre-card' }, ...rows),
    error === null
      ? null
      : createElement('div', { className: 'bre-model-error', role: 'status' }, error),
  )
}
