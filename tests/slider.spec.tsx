/**
 * ComposerSlider unit tests: level resolution against the directory snapshot,
 * the replicated body (head + resident search + always-visible columns + the
 * in-place level footer), the commit path (optimistic select with rollback) and
 * the capability badges — without the DOM injector.
 */

// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createElement } from 'react'
import { createRoot } from 'react-dom/client'
import { ComposerSlider, effectiveEffortIndex, sliderLevels } from '../src/client/ComposerSlider.js'
import { setModelOrder, syncModelOrders } from '../src/client/model-order.js'

import type { ModelDirectoryLike, ModelDirectoryStateLike } from '../src/client/types.js'

/**
 * The fixture's provider groups. Cast through `unknown` because the SDK row
 * type does not promise the optional `input` declaration the body reads (and
 * falls back to the knowledge base when it is absent).
 */
type Groups = ModelDirectoryStateLike['groups']

/** The five-level ladder the fixture's models declare. */
const LADDER = [
  { id: 'off', name: 'Off' },
  { id: 'low', name: 'Low' },
  { id: 'medium', name: 'Medium' },
  { id: 'high', name: 'High' },
  { id: 'max', name: 'Max' },
]

/** One provider holding one model, widened like {@link Groups}. */
function onlyModel(model: Record<string, unknown>): Groups {
  return ([{ id: 'aliyun', name: 'Aliyun', models: [model] }] as unknown) as Groups
}

/** The two-provider-model editing directory: qwen-max (vision + ladder) is current. */
function fixture(state?: Partial<ModelDirectoryStateLike>): {
  directory: ModelDirectoryLike
  selectSpy: ReturnType<typeof vi.fn>
  update: (next: ModelDirectoryStateLike) => void
} {
  let base: ModelDirectoryStateLike = {
    current: { provider: 'aliyun', model: 'qwen-max', reasoningEffort: 'medium' },
    routable: true,
    groups: ([{
      id: 'aliyun',
      name: 'Aliyun',
      models: [
        {
          id: 'qwen-max',
          name: 'Qwen Max',
          input: ['text', 'image'],
          reasoning: { defaultEffort: 'medium', efforts: LADDER },
        },
        {
          id: 'qwen-plus',
          name: 'Qwen Plus',
          input: ['text'],
          reasoning: { efforts: LADDER.slice(0, 4) },
        },
      ],
    }] as unknown) as Groups,
    failures: [],
    status: 'ready',
    pending: null,
    error: null,
    ...state,
  }
  const listeners = new Set<() => void>()
  const selectSpy = vi.fn(async (selection: { provider: string; model: string; reasoningEffort?: string }) => {
    base = { ...base, current: { provider: selection.provider, model: selection.model, ...selection.reasoningEffort === undefined ? {} : { reasoningEffort: selection.reasoningEffort } } }
    for (const listener of [...listeners]) listener()
  })
  return {
    directory: {
      store: {
        getSnapshot: () => base,
        subscribe: (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener) } },
      },
      load: vi.fn(async () => base),
      select: selectSpy,
    },
    selectSpy,
    update: (next: ModelDirectoryStateLike) => {
      base = next
      for (const listener of [...listeners]) listener()
    },
  } as unknown as {
    directory: ModelDirectoryLike
    selectSpy: ReturnType<typeof vi.fn>
    update: (next: ModelDirectoryStateLike) => void
  }
}

import type { ConfiguredInputs, ModelFacts } from '../src/client/configured-inputs.js'

/** A hand-built saved-facts face, shaped like createConfiguredInputs' snapshot. */
function fakeFacts(facts: Record<string, Record<string, ModelFacts>>): ConfiguredInputs {
  const snapshot = new Map(Object.entries(facts).map(([provider, models]) => [provider, new Map(Object.entries(models))]))
  return {
    getSnapshot: () => snapshot,
    subscribe: () => () => {},
    load: async () => {},
    invalidate: () => {},
  }
}

async function mount(directory: ModelDirectoryLike, configuredInputs?: ConfiguredInputs): Promise<{ root: ReturnType<typeof createRoot>; container: HTMLElement; menu: HTMLElement }> {
  const menu = document.createElement('div')
  menu.setAttribute('role', 'menu')
  document.body.appendChild(menu)
  const container = document.createElement('div')
  menu.appendChild(container)
  const root = createRoot(container)
  root.render(createElement(ComposerSlider, {
    directory,
    ...(configuredInputs === undefined ? {} : { configuredInputs }),
    t: (key: string) => key,
  }))
  // createRoot renders are scheduled; give the initial commit a tick.
  await new Promise(resolve => setTimeout(resolve, 0))
  return { root, container, menu }
}

/** Fire a real click, which is what the cells and the segments listen for. */
function click(el: Element | null | undefined): void {
  if (el === null || el === undefined) throw new Error('nothing to click')
  ;(el as HTMLElement).click()
}

/** The head's current-model line. */
function headName(container: HTMLElement): string | undefined {
  return container.querySelector('.bre-menu-name')?.textContent ?? undefined
}

function headProvider(container: HTMLElement): string | undefined {
  return container.querySelector('.bre-menu-prov')?.textContent ?? undefined
}

/** The model column's options, in provider order. */
function modelOptions(container: HTMLElement): HTMLButtonElement[] {
  return Array.from(container.querySelectorAll<HTMLButtonElement>('.bre-provider-models .bre-option'))
}

/** The footer's level slider — the level pick is a draggable track, not a
 *  capsule row. */
function footSlider(container: HTMLElement): HTMLElement {
  const hit = container.querySelector<HTMLElement>('.bre-menu-foot .bre-effort-slider')
  if (hit === null) throw new Error('no footer slider')
  return hit
}

/** The stop names written under the footer's slider track, in order. */
function levelNames(container: HTMLElement): string[] {
  return Array.from(container.querySelectorAll<HTMLElement>('.bre-menu-foot .bre-effort-slider-label'))
    .map(label => label.textContent ?? '')
}

/** The name of the stop the slider rests on (drag preview or committed). */
function activeLevelName(container: HTMLElement): string {
  return footSlider(container).getAttribute('aria-valuetext') ?? ''
}

/** The level value written in the footer's head, above the track. */
function footHeadValue(container: HTMLElement): HTMLElement | null {
  return container.querySelector<HTMLElement>('.bre-menu-foot .bre-effort-slider-head-value')
}

/** Drop the slider's thumb on the named stop: a rect the handler can read, and
 *  a pointer press + release at that stop's position — one gesture, one commit. */
function pickLevel(container: HTMLElement, name: string): void {
  const labels = levelNames(container)
  const at = labels.indexOf(name)
  if (at < 0) throw new Error(`no level stop "${name}"`)
  const track = footSlider(container)
  const rect = { x: 0, y: 0, left: 0, top: 0, right: 100, bottom: 18, width: 100, height: 18, toJSON: () => ({}) } as DOMRect
  const spy = vi.spyOn(track, 'getBoundingClientRect').mockReturnValue(rect)
  const x = labels.length > 1 ? (at / (labels.length - 1)) * 100 : 0
  try {
    track.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true, cancelable: true, clientX: x, clientY: 9 }))
    track.dispatchEvent(new MouseEvent('pointerup', { bubbles: true, cancelable: true, clientX: x, clientY: 9 }))
  } finally {
    spy.mockRestore()
  }
}

/** The option/segment whose visible name is `name`. */
function named<T extends Element>(list: T[], name: string): T | undefined {
  return list.find(el => (el.querySelector('.bre-option-name')?.textContent ?? el.textContent) === name)
}

/** The model option whose visible name is `name` (searched rows carry their provider). */
function optionNamed(list: HTMLButtonElement[], name: string): HTMLButtonElement | undefined {
  return list.find(el => el.querySelector('.bre-option-name')?.textContent === name)
}

/** Type into the resident search box. */
async function search(container: HTMLElement, text: string): Promise<void> {
  const input = container.querySelector<HTMLInputElement>('.bre-menu-search .bre-menu-search-input')
  if (input === null) throw new Error('no search box')
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set
  setter?.call(input, text)
  input.dispatchEvent(new Event('input', { bubbles: true }))
  await new Promise(resolve => setTimeout(resolve, 0))
}

beforeEach(() => {
  document.body.innerHTML = ''
  vi.restoreAllMocks()
})

describe('effectiveEffortIndex', () => {
  const levels = [{ id: 'off', name: 'Off' }, { id: 'low', name: 'Low' }, { id: 'medium', name: 'Medium' }, { id: 'high', name: 'High' }, { id: 'max', name: 'Max' }]
  it('prefers the session effort, then the adapter default, then the middle', () => {
    expect(effectiveEffortIndex(levels, { current: { provider: 'a', model: 'm', reasoningEffort: 'high' }, routable: true, groups: [], failures: [], status: 'ready', pending: null, error: null })).toBe(3)
    expect(effectiveEffortIndex(levels, { current: { provider: 'a', model: 'm' }, routable: true, groups: [{ id: 'a', name: 'A', models: [{ id: 'm', name: 'M', reasoning: { defaultEffort: 'low', efforts: levels } }] }], failures: [], status: 'ready', pending: null, error: null })).toBe(1)
    expect(effectiveEffortIndex(levels, { current: { provider: 'a', model: 'm' }, routable: true, groups: [{ id: 'a', name: 'A', models: [{ id: 'm', name: 'M' }] }], failures: [], status: 'ready', pending: null, error: null })).toBe(2)
  })
  it('reports no levels for a model with fewer than two of them', () => {
    const one = fixture({ groups: onlyModel({ id: 'qwen-max', name: 'Qwen Max', reasoning: { efforts: [{ id: 'off', name: 'Off' }] } }) })
    expect(sliderLevels(one.directory.store.getSnapshot())).toHaveLength(0)
  })
})

describe('ComposerSlider body', () => {
  it('names the current model in the head and rests on the session level', async () => {
    const { directory } = fixture()
    const { root, container } = await mount(directory)
    expect(container.querySelector('.bre-menu-head .bre-row-label')?.textContent).toBe('modelRowLabel')
    expect(headName(container)).toBe('Qwen Max')
    expect(headProvider(container)).toBe('Aliyun')
    // The level is named once, in the footer, and follows the mount-sync effect
    // onto the session's medium. Passive effects flush asynchronously, so wait
    // for the rest position.
    await vi.waitFor(() => expect(footHeadValue(container)?.textContent).toBe('Medium'))
    // The head carries no second copy of it: one level, one place.
    expect(container.querySelector('.bre-menu-head .bre-pill')).toBeNull()
    // The radiation slider is gone: nothing renders a range input or a track.
    expect(container.querySelector('input[type="range"]')).toBeNull()
    expect(container.querySelector('.bre-effort-track')).toBeNull()
    expect(container.querySelector('.bre-slider-hint')).toBeNull()
    root.unmount()
  })

  it('keeps the provider column and the model column always visible', async () => {
    const { directory, selectSpy } = fixture()
    const { root, container } = await mount(directory)
    const providers = Array.from(container.querySelectorAll<HTMLButtonElement>('.bre-provider'))
    expect(providers.map(el => el.querySelector('.bre-option-name')?.textContent)).toEqual(['Aliyun'])
    expect(providers[0]?.classList.contains('is-open')).toBe(true)
    // The current model's provider keeps the accent, so the column says where
    // the selection lives. The count sits where the drill chevron used to.
    expect(providers[0]?.classList.contains('is-current')).toBe(true)
    expect(providers[0]?.querySelector('.bre-provider-count')?.textContent).toBe('2')
    expect(modelOptions(container).map(el => el.querySelector('.bre-option-name')?.textContent)).toEqual(['Qwen Max', 'Qwen Plus'])
    // Clicking a provider only re-fills the right column; it never selects.
    click(providers[0])
    expect(selectSpy).not.toHaveBeenCalled()
    root.unmount()
  })

  it('shows the no-levels line instead of segments when the model cannot reason', async () => {
    const one = fixture({
      current: { provider: 'aliyun', model: 'qwen-lite' },
      groups: onlyModel({ id: 'qwen-lite', name: 'Qwen Lite', reasoning: { efforts: [{ id: 'off', name: 'Off' }] } }),
    })
    const { root, container } = await mount(one.directory)
    expect(container.querySelector('.bre-menu-foot .bre-effort-slider')).toBeNull()
    expect(container.querySelector('.bre-menu-foot .bre-effort-slider-head')).toBeNull()
    expect(container.querySelector('.bre-menu-foot')?.textContent).toContain('sliderNoLevels')
    expect(container.querySelector('.bre-menu-head .bre-pill')).toBeNull()
    root.unmount()
  })

  it('paints the footer as one accent track with a tick per stop, under a head naming the level', async () => {
    const { root, container } = await mount(fixture().directory)
    // The head above the track names the section and carries the level under
    // the thumb (进度条上方：思考等级 + 当前等级).
    expect(container.querySelector('.bre-menu-foot .bre-effort-slider-head-label')?.textContent).toBe('effortRowLabel')
    const headValue = footHeadValue(container)
    expect(headValue).not.toBeNull()
    const fill = container.querySelector<HTMLElement>('.bre-effort-slider-fill')
    const thumb = container.querySelector<HTMLElement>('.bre-effort-slider-thumb')
    expect(fill).not.toBeNull()
    expect(thumb).not.toBeNull()
    // No hue per stop: the accent comes from the stylesheet, and the component
    // writes no colour at all — only the drag preview's reveal.
    await vi.waitFor(() => expect(thumb?.style.left).toBe('50%'))
    expect(fill?.style.background).toBe('')
    expect(thumb?.style.background).toBe('')
    expect(fill?.style.clipPath).toBe('inset(0 50% 0 0)')
    // The head's value settles onto the session's level.
    await vi.waitFor(() => expect(headValue?.textContent).toBe('Medium'))
    expect(headValue?.style.color).toBe('')
    // Every stop but the occupied one is a hole in the track, so the ladder's
    // size is legible without a colour per stop.
    expect(container.querySelectorAll('.bre-effort-slider-tick')).toHaveLength(LADDER.length - 1)
    // The active stop's name is marked on the class, not by colour.
    expect(container.querySelector<HTMLElement>('.bre-effort-slider-label.is-on')?.textContent).toBe('Medium')
    expect(container.querySelector<HTMLElement>('.bre-effort-slider-label.is-on')?.style.color).toBe('')
    root.unmount()
  })
})

describe('ComposerSlider search', () => {
  it('lists matches across every provider and names each by its provider', async () => {
    const two = fixture({
      groups: ([
        {
          id: 'aliyun',
          name: 'Aliyun',
          models: [
            { id: 'qwen-max', name: 'Qwen Max', reasoning: { efforts: LADDER } },
            { id: 'qwen-plus', name: 'Qwen Plus', reasoning: { efforts: LADDER.slice(0, 4) } },
          ],
        },
        { id: 'other', name: 'Other', models: [{ id: 'qwen-lite', name: 'Qwen Lite', reasoning: { efforts: LADDER } }] },
      ] as unknown) as Groups,
    })
    const { root, container } = await mount(two.directory)
    await search(container, 'qwen')
    const names = modelOptions(container).map(el => el.querySelector('.bre-option-name')?.textContent)
    // Matches come from BOTH providers, each named by its own, in provider order.
    expect(names).toEqual(['Aliyun · Qwen Max', 'Aliyun · Qwen Plus', 'Other · Qwen Lite'])
    // The search matches ids too, not only display names.
    await search(container, 'lite')
    expect(modelOptions(container)).toHaveLength(1)
    await search(container, 'zzz')
    expect(container.querySelector('.bre-provider-models')?.textContent).toContain('modelSearchNoMatches')
    root.unmount()
  })

  it('commits a searched model and returns the columns to the per-provider view', async () => {
    const { directory, selectSpy } = fixture()
    const { root, container } = await mount(directory)
    await search(container, 'plus')
    click(optionNamed(modelOptions(container), 'Aliyun · Qwen Plus'))
    // No reasoningEffort on a model switch: the level resets with the model and
    // the effort-memory wiretap restores the one remembered for it.
    await vi.waitFor(() => expect(selectSpy).toHaveBeenCalledWith({ provider: 'aliyun', model: 'qwen-plus' }))
    expect(selectSpy.mock.calls[0]?.[0]).not.toHaveProperty('reasoningEffort')
    // The popover never closes; the search is answered and the head follows.
    await vi.waitFor(() => expect(headName(container)).toBe('Qwen Plus'))
    expect(modelOptions(container).map(el => el.querySelector('.bre-option-name')?.textContent)).toEqual(['Qwen Max', 'Qwen Plus'])
    root.unmount()
  })
})

describe('ComposerSlider search follow-ups', () => {
  it('applies the stored model order to the searched matches too', async () => {
    // The search path runs the SAME orderModelEntries fold the per-provider
    // column runs: a drag on the settings page reorders the flat matches as
    // well, or the two views would disagree about the same models.
    setModelOrder('aliyun', ['qwen-plus', 'qwen-max'])
    try {
      const { directory } = fixture({
        groups: ([
          {
            id: 'aliyun',
            name: 'Aliyun',
            models: [
              { id: 'qwen-max', name: 'Qwen Max', reasoning: { efforts: LADDER } },
              { id: 'qwen-plus', name: 'Qwen Plus', reasoning: { efforts: LADDER.slice(0, 4) } },
            ],
          },
        ] as unknown) as Groups,
      })
      const { root, container } = await mount(directory)
      await search(container, 'qwen')
      expect(modelOptions(container).map(el => el.querySelector('.bre-option-name')?.textContent))
        .toEqual(['Aliyun · Qwen Plus', 'Aliyun · Qwen Max'])
      root.unmount()
    } finally {
      syncModelOrders({})
    }
  })

  it('clears the query on Escape without closing the menu', async () => {
    const { directory } = fixture()
    const { root, container } = await mount(directory)
    await search(container, 'plus')
    expect(modelOptions(container)).toHaveLength(1)
    const input = container.querySelector<HTMLInputElement>('.bre-menu-search .bre-menu-search-input')
    input?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }))
    await new Promise(resolve => setTimeout(resolve, 0))
    // The filter lifts: the per-provider column is back.
    expect(modelOptions(container).map(el => el.querySelector('.bre-option-name')?.textContent))
      .toEqual(['Qwen Max', 'Qwen Plus'])
    root.unmount()
  })
})

describe('ComposerSlider provider column', () => {
  it('switches the right column to the clicked provider without selecting anything', async () => {
    const { directory, selectSpy } = fixture({
      groups: ([
        {
          id: 'aliyun',
          name: 'Aliyun',
          models: [{ id: 'qwen-max', name: 'Qwen Max', reasoning: { defaultEffort: 'medium', efforts: LADDER } }],
        },
        { id: 'openai', name: 'OpenAI', models: [{ id: 'gpt-6.1', name: 'GPT 6.1', reasoning: { efforts: LADDER } }] },
      ] as unknown) as Groups,
    })
    const { root, container } = await mount(directory)
    const providers = () => Array.from(container.querySelectorAll<HTMLButtonElement>('.bre-provider'))
    expect(providers().map(el => el.querySelector('.bre-option-name')?.textContent)).toEqual(['Aliyun', 'OpenAI'])
    // The current model's provider opens first.
    expect(providers()[0]?.classList.contains('is-open')).toBe(true)
    expect(modelOptions(container).map(el => el.querySelector('.bre-option-name')?.textContent)).toEqual(['Qwen Max'])

    click(providers()[1])
    await new Promise(resolve => setTimeout(resolve, 0))
    // The right column now shows the other provider's models; the open accent
    // moved with it; no selection was made.
    expect(modelOptions(container).map(el => el.querySelector('.bre-option-name')?.textContent)).toEqual(['GPT 6.1'])
    expect(providers()[1]?.classList.contains('is-open')).toBe(true)
    expect(providers()[0]?.classList.contains('is-open')).toBe(false)
    expect(selectSpy).not.toHaveBeenCalled()
    root.unmount()
  })

  it('shows the empty state when no provider holds models', async () => {
    const bare = fixture({ current: null, groups: [] })
    const { root, container } = await mount(bare.directory)
    expect(container.querySelectorAll('.bre-provider')).toHaveLength(0)
    expect(container.querySelectorAll('.bre-empty')).toHaveLength(2)
    expect(container.querySelector('.bre-empty')?.textContent).toBe('sliderNoCurrent')
    root.unmount()
  })
})

describe('ComposerSlider model picker', () => {
  it('marks the current model by colour alone, never with a tick beside the badges', async () => {
    const { directory } = fixture()
    const { root, container } = await mount(directory)
    const active = container.querySelectorAll('.bre-provider-models .bre-option.is-active')
    expect(active).toHaveLength(1)
    expect(active[0]?.querySelector('.bre-option-name')?.textContent).toBe('Qwen Max')
    expect(active[0]?.querySelector('.bre-option-check')).toBeNull()
    root.unmount()
  })

  it('switches model without an effort and keeps the popover open', async () => {
    const { directory, selectSpy } = fixture()
    const { root, container } = await mount(directory)
    click(optionNamed(modelOptions(container), 'Qwen Plus'))
    await vi.waitFor(() => expect(selectSpy).toHaveBeenCalledWith({ provider: 'aliyun', model: 'qwen-plus' }))
    expect(selectSpy.mock.calls[0]?.[0]).not.toHaveProperty('reasoningEffort')
    // The columns stay; only the head and the selection move.
    await vi.waitFor(() => expect(headName(container)).toBe('Qwen Plus'))
    expect(container.querySelector('.bre-panel-models')).not.toBeNull()
    root.unmount()
  })

  it('badges a model with vision and thinking icons only when it declares them', async () => {
    const { directory } = fixture()
    const { root, container } = await mount(directory)
    const badges = (name: string): (string | null)[] => {
      const option = optionNamed(modelOptions(container), name)
      return Array.from(option?.querySelectorAll('.bre-tag') ?? []).map(el => el.getAttribute('title'))
    }
    // Declares image input plus a ladder → both badges, each with its icon.
    expect(badges('Qwen Max')).toEqual(['tagVision', 'tagThinking'])
    expect(optionNamed(modelOptions(container), 'Qwen Max')?.querySelectorAll('svg.bre-tag-icon')).toHaveLength(2)
    // Declares text only, but still reasons → the sparkle alone.
    expect(badges('Qwen Plus')).toEqual(['tagThinking'])
    root.unmount()
  })

  it('re-evaluates vision when a relay model keeps its id but changes its name', async () => {
    const modelId = 'relay-shared-vision-alias'
    const { directory, update } = fixture({
      current: { provider: 'aliyun', model: modelId },
      groups: onlyModel({ id: modelId, name: 'DeepSeek V4 Flash' }),
    })
    const { root, container } = await mount(directory)
    try {
      await vi.waitFor(() => expect(modelOptions(container)).toHaveLength(1))
      expect(modelOptions(container)[0]?.querySelector('[title="tagVision"]')).toBeNull()
      update({
        ...directory.store.getSnapshot(),
        groups: onlyModel({ id: modelId, name: 'GPT-4o' }),
      })
      await vi.waitFor(() => expect(modelOptions(container)[0]?.querySelector('[title="tagVision"]')).not.toBeNull())
      update({
        ...directory.store.getSnapshot(),
        groups: onlyModel({ id: modelId, name: 'DeepSeek V4 Flash' }),
      })
      await vi.waitFor(() => expect(modelOptions(container)[0]?.querySelector('[title="tagVision"]')).toBeNull())
    } finally {
      root.unmount()
    }
  })

  it('badges a vision model the catalog row does not describe from the knowledge base', async () => {
    // The Host's catalog rows carry no `input` (id/name/reasoning only), so for
    // a relay's spelling the eye badge rests on the knowledge base alone. The
    // trailing 'x' of 'GLM-5.3-FlashX' is an alnum neighbour that blocks the
    // bare flash needle, and the shorter 'glm-5.3' would read the model as
    // text-only: the failure the user sees as a missing icon.
    const { directory } = fixture({
      current: { provider: 'aliyun', model: 'z-ai/glm-5.3-flashx', reasoningEffort: 'max' },
      groups: onlyModel({
        id: 'z-ai/glm-5.3-flashx',
        name: 'GLM-5.3-FlashX',
        reasoning: { defaultEffort: 'max', efforts: [
          { id: 'low', name: 'Low' },
          { id: 'high', name: 'High' },
          { id: 'max', name: 'Max' },
        ] },
      }),
    })
    const { root, container } = await mount(directory)
    const option = optionNamed(modelOptions(container), 'GLM-5.3-FlashX')
    expect(Array.from(option?.querySelectorAll('.bre-tag') ?? []).map(el => el.getAttribute('title'))).toEqual(['tagVision', 'tagThinking'])
    root.unmount()
  })
})

describe('ComposerSlider commit', () => {
  it('lists the current model\'s levels as slider stops and commits one through directory.select', async () => {
    const { directory, selectSpy } = fixture()
    const { root, container } = await mount(directory)
    expect(levelNames(container)).toEqual(['Off', 'Low', 'Medium', 'High', 'Max'])
    expect(activeLevelName(container)).toBe('Medium')
    pickLevel(container, 'High')
    await vi.waitFor(() => expect(selectSpy).toHaveBeenCalledWith({ provider: 'aliyun', model: 'qwen-max', reasoningEffort: 'high' }))
    // The thumb moves to the committed level; the footer's head and the head's
    // pill both follow it.
    await vi.waitFor(() => expect(activeLevelName(container)).toBe('High'))
    await vi.waitFor(() => expect(footHeadValue(container)?.textContent).toBe('High'))
    await vi.waitFor(() => expect(footHeadValue(container)?.textContent).toBe('High'))
    root.unmount()
  })

  it('ignores a repick of the level already committed', async () => {
    const { directory, selectSpy } = fixture()
    const { root, container } = await mount(directory)
    await vi.waitFor(() => expect(footHeadValue(container)?.textContent).toBe('Medium'))
    pickLevel(container, 'Medium')
    await vi.waitFor(() => expect(selectSpy).not.toHaveBeenCalled())
    root.unmount()
  })

  it('commits a level the footer only PREDICTED on the first use of a model', async () => {
    // A model switch lands with no effort, and `effectiveEffortIndex` fills the
    // footer from the adapter default so the body is not blank. The seat trigger
    // still reads Default, so the displayed level is a PREDICTION, not a
    // commitment: re-picking it must submit instead of being swallowed (the
    // reported "pick another level or Medium never applies").
    const { directory, selectSpy } = fixture({ current: { provider: 'aliyun', model: 'qwen-max' } })
    const { root, container } = await mount(directory)
    expect(directory.store.getSnapshot().current?.reasoningEffort).toBeUndefined()
    // The adapter default (medium) is what the footer predicts before any pick.
    await vi.waitFor(() => expect(footHeadValue(container)?.textContent).toBe('Medium'))
    pickLevel(container, 'Medium')
    await vi.waitFor(() => expect(selectSpy).toHaveBeenCalledWith({ provider: 'aliyun', model: 'qwen-max', reasoningEffort: 'medium' }))
    await vi.waitFor(() => expect(footHeadValue(container)?.textContent).toBe('Medium'))
    root.unmount()
  })

  it('commits a ladder-middle prediction that no adapter default backs', async () => {
    // Same shape without a declared `defaultEffort`: the middle of the ladder is
    // the rest position, and it is equally a prediction.
    const { directory, selectSpy } = fixture({
      current: { provider: 'aliyun', model: 'qwen-plus' },
      groups: onlyModel({ id: 'qwen-plus', name: 'Qwen Plus', reasoning: { efforts: LADDER.slice(0, 4) } }),
    })
    const { root, container } = await mount(directory)
    await vi.waitFor(() => expect(footHeadValue(container)?.textContent).toBe('Low'))
    pickLevel(container, 'Low')
    await vi.waitFor(() => expect(selectSpy).toHaveBeenCalledWith({ provider: 'aliyun', model: 'qwen-plus', reasoningEffort: 'low' }))
    root.unmount()
  })

  it('rolls back to the committed level when the select rejects', async () => {
    const { directory, selectSpy, update } = fixture()
    // Faithful to the real ModelDirectory: a refused selection surfaces on the
    // store (status/error) and rethrows — the footer rests on the committed
    // level while the store's error line shows.
    selectSpy.mockImplementationOnce(async () => {
      update({
        ...directory.store.getSnapshot(),
        status: 'error',
        error: 'refused',
      })
      throw new Error('refused')
    })
    const { root, container } = await mount(directory)
    await vi.waitFor(() => expect(footHeadValue(container)?.textContent).toBe('Medium'))
    pickLevel(container, 'High')
    await vi.waitFor(() => {
      expect(container.querySelector('.bre-model-error')?.textContent).toContain('refused')
      expect(footHeadValue(container)?.textContent).toBe('Medium')
    })
    root.unmount()
  })

  it('rolls back when the directory resolves the refusal as a result (0.1.6-alpha.2)', async () => {
    // 0.1.6-alpha.2 RESOLVES {ok:false} on refusal instead of throwing. This
    // fixture's committed selection carries no explicit effort, so the
    // post-await store read cannot recover the rollback on its own: without
    // normalizing the refusal the footer stays on the failed level.
    const { directory, selectSpy, update } = fixture({ current: { provider: 'aliyun', model: 'qwen-max' } })
    selectSpy.mockImplementationOnce(async () => {
      update({ ...directory.store.getSnapshot(), status: 'error', error: 'session/invalid: no such effort' })
      return { ok: false, error: { code: 'session/invalid', message: 'no such effort' } }
    })
    const { root, container } = await mount(directory)
    // The adapter default (medium) is the rest position before any pick.
    await vi.waitFor(() => expect(footHeadValue(container)?.textContent).toBe('Medium'))
    pickLevel(container, 'High')
    await vi.waitFor(() => {
      expect(container.querySelector('.bre-model-error')?.textContent).toContain('no such effort')
      expect(footHeadValue(container)?.textContent).toBe('Medium')
    })
    root.unmount()
  })

  it('hands focus to the menu as the clicked segment commits (issue #13)', async () => {
    // The official shell closes the menu when a blur leaves the card: the
    // commit disables the busy controls, and a focused disabled node would drop
    // focus onto <body>. The commit must move focus onto the menu element
    // itself in the same task, so the menu stays open.
    const { directory, selectSpy } = fixture()
    const { root, container, menu } = await mount(directory)
    await vi.waitFor(() => expect(footHeadValue(container)?.textContent).toBe('Medium'))
    pickLevel(container, 'High')
    // Synchronous: the handoff runs in the commit's sync section, before the
    // first await, so the disabled segment never owns the focus.
    expect(document.activeElement).toBe(menu)
    expect(selectSpy).toHaveBeenCalled()
    root.unmount()
  })

  it('commits against the live snapshot without re-loading the catalog', async () => {
    // The old commit re-ran directory.load() to revalidate levels; on a cold
    // third-party catalog that swings the shared catalog into its loading state
    // and visually collapses the open menu. The live snapshot's levels are the
    // same data the official reload refreshes on every menu open.
    const { directory, selectSpy } = fixture()
    const loadSpy = directory.load as ReturnType<typeof vi.fn>
    const { root, container } = await mount(directory)
    await vi.waitFor(() => expect(footHeadValue(container)?.textContent).toBe('Medium'))
    loadSpy.mockClear()
    pickLevel(container, 'High')
    await vi.waitFor(() => expect(selectSpy).toHaveBeenCalledWith({ provider: 'aliyun', model: 'qwen-max', reasoningEffort: 'high' }))
    expect(loadSpy).not.toHaveBeenCalled()
    root.unmount()
  })
})

describe('ComposerSlider image-generation rows and capacity tag', () => {
  it('offers a 生图-marked model in the columns, the search and the provider count', async () => {
    // The models page marked wanx-v1 an image generator. It is NOT a chat model,
    // but hiding it here kept it out of reach of the composer altogether (user
    // item: 生图模型需要出现在会话框的切换模型列表中）— it is offered like any
    // other row, with the 生图 badge beside its name.
    const facts = fakeFacts({ aliyun: { 'wanx-v1': { imageGen: true } } })
    const { directory } = fixture({
      groups: ([{
        id: 'aliyun',
        name: 'Aliyun',
        models: [
          { id: 'qwen-max', name: 'Qwen Max', reasoning: { defaultEffort: 'medium', efforts: LADDER } },
          { id: 'qwen-plus', name: 'Qwen Plus', reasoning: { efforts: LADDER.slice(0, 4) } },
          { id: 'wanx-v1', name: 'Wanx v1' },
        ],
      }] as unknown) as Groups,
    })
    const { root, container } = await mount(directory, facts)
    const names = modelOptions(container).map(el => el.querySelector('.bre-option-name')?.textContent)
    expect(names).toEqual(['Qwen Max', 'Qwen Plus', 'Wanx v1'])
    // The provider count answers for every offered model.
    expect(container.querySelector('.bre-provider-count')?.textContent).toBe('3')
    // The search reaches it, too.
    await search(container, 'wanx')
    const hits = modelOptions(container)
    expect(hits).toHaveLength(1)
    expect(hits[0]?.querySelector('.bre-option-name')?.textContent).toContain('Wanx v1')
    root.unmount()
  })

  it('badges exactly the 生图-marked rows, and only those', async () => {
    const facts = fakeFacts({ aliyun: { 'wanx-v1': { imageGen: true } } })
    const { directory } = fixture({
      groups: ([{
        id: 'aliyun',
        name: 'Aliyun',
        models: [
          { id: 'qwen-max', name: 'Qwen Max', reasoning: { defaultEffort: 'medium', efforts: LADDER } },
          { id: 'wanx-v1', name: 'Wanx v1' },
        ],
      }] as unknown) as Groups,
    })
    const { root, container } = await mount(directory, facts)
    const badge = (name: string): string | null =>
      optionNamed(modelOptions(container), name)?.querySelector('.bre-tag[title="tagImageGen"]')?.getAttribute('title') ?? null
    expect(badge('Wanx v1')).toBe('tagImageGen')
    // A chat row is never guessed into a generator by its name or its id.
    expect(badge('Qwen Max')).toBeNull()
    expect(optionNamed(modelOptions(container), 'Wanx v1')?.querySelectorAll('svg.bre-tag-icon')).toHaveLength(1)
    root.unmount()
  })

  it('keeps offering every model when nothing is marked 生图', async () => {
    const { directory } = fixture()
    const { root, container } = await mount(directory, fakeFacts({}))
    expect(modelOptions(container)).toHaveLength(2)
    root.unmount()
  })

  it('tags the declared context window the way catalogues spell it', async () => {
    // Binary-exact values spell in binary units (131072 -> 128K, 1048576 ->
    // 1M); a model with no declared window carries no tag at all.
    const facts = fakeFacts({
      aliyun: {
        'qwen-max': { contextWindow: 131072 },
        'qwen-plus': { contextWindow: 1048576 },
      },
    })
    const { directory } = fixture()
    const { root, container } = await mount(directory, facts)
    const caps = Array.from(container.querySelectorAll<HTMLElement>('.bre-provider-models .bre-option-cap'))
    expect(caps.map(el => el.textContent)).toEqual(['128K', '1M'])
    root.unmount()
  })
})
