/**
 * ComposerSlider unit tests: level resolution against the directory snapshot,
 * the two replicated rows (provider → model picker + reasoning-level list), the
 * commit path (optimistic select with rollback) and the capability badges —
 * without the DOM injector.
 */

// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createElement } from 'react'
import { createRoot } from 'react-dom/client'
import { ComposerSlider, effectiveEffortIndex, sliderLevels } from '../src/client/ComposerSlider.js'
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

/** Extra props a case wants on the body. */
interface MountOptions {
  onLayoutChange?: () => void
}

async function mount(directory: ModelDirectoryLike, options: MountOptions = {}): Promise<{ root: ReturnType<typeof createRoot>; container: HTMLElement }> {
  return mountIn(directory, options)
}

/** Mount inside a fake official menu so the commit's focus handoff has a target. */
async function mountIn(directory: ModelDirectoryLike, options: MountOptions = {}): Promise<{ root: ReturnType<typeof createRoot>; container: HTMLElement; menu: HTMLElement }> {
  const menu = document.createElement('div')
  menu.setAttribute('role', 'menu')
  document.body.appendChild(menu)
  const container = document.createElement('div')
  menu.appendChild(container)
  const root = createRoot(container)
  root.render(createElement(ComposerSlider, {
    directory,
    t: (key: string) => key,
    onLayoutChange: options.onLayoutChange,
  }))
  // createRoot renders are scheduled; give the initial commit a tick.
  await new Promise(resolve => setTimeout(resolve, 0))
  return { root, container, menu }
}

/** The two always-visible row controls, in DOM order (model, then level). */
function rows(container: HTMLElement): HTMLButtonElement[] {
  return Array.from(container.querySelectorAll<HTMLButtonElement>('.bre-row-control'))
}

/** The visible value of one row. */
function rowValue(container: HTMLElement, index: number): string | undefined {
  return rows(container)[index]?.querySelector('.bre-row-value')?.textContent ?? undefined
}

/** Fire a real click, which is what the rows and the options listen for. */
function click(el: Element | null | undefined): void {
  if (el === null || el === undefined) throw new Error('nothing to click')
  ;(el as HTMLElement).click()
}

/** The level list's options, in declaration order. */
function levelOptions(container: HTMLElement): HTMLButtonElement[] {
  return Array.from(container.querySelectorAll<HTMLButtonElement>('.bre-panel .bre-option'))
}

/** The model column's options, in provider order. */
function modelOptions(container: HTMLElement): HTMLButtonElement[] {
  return Array.from(container.querySelectorAll<HTMLButtonElement>('.bre-provider-models .bre-option'))
}

/** The option whose visible name is `name`. */
function optionNamed(list: HTMLButtonElement[], name: string): HTMLButtonElement | undefined {
  return list.find(el => el.querySelector('.bre-option-name')?.textContent === name)
}

/** Open the level list and return its options once they exist. */
async function openLevels(container: HTMLElement): Promise<HTMLButtonElement[]> {
  click(rows(container)[1])
  await vi.waitFor(() => expect(container.querySelector('.bre-panel')).not.toBeNull())
  return levelOptions(container)
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

describe('ComposerSlider rows', () => {
  it('renders a model row and a reasoning-level row, resting on the session level', async () => {
    const { directory } = fixture()
    const { root, container } = await mount(directory)
    const controls = rows(container)
    expect(controls).toHaveLength(2)
    expect(controls[0]?.querySelector('.bre-row-label')?.textContent).toBe('modelRowLabel')
    expect(controls[1]?.querySelector('.bre-row-label')?.textContent).toBe('effortRowLabel')
    // The model row names the current model; the level row follows the
    // mount-sync effect onto the session's medium. Passive effects flush
    // asynchronously, so wait for the rest position instead of racing it.
    expect(controls[0]?.querySelector('.bre-row-value')?.textContent).toBe('Aliyun · Qwen Max')
    await vi.waitFor(() => expect(rowValue(container, 1)).toBe('Medium'))
    // The radiation slider is gone: nothing renders a range input or a track.
    expect(container.querySelector('input[type="range"]')).toBeNull()
    expect(container.querySelector('.bre-effort-track')).toBeNull()
    expect(container.querySelector('.bre-slider-hint')).toBeNull()
    root.unmount()
  })

  it('turns the level row inert when the model exposes fewer than two levels', async () => {
    const one = fixture({
      current: { provider: 'aliyun', model: 'qwen-lite' },
      groups: onlyModel({ id: 'qwen-lite', name: 'Qwen Lite', reasoning: { efforts: [{ id: 'off', name: 'Off' }] } }),
    })
    const { root, container } = await mount(one.directory)
    const controls = rows(container)
    expect(controls).toHaveLength(2)
    expect(controls[1]?.disabled).toBe(true)
    expect(rowValue(container, 1)).toBe('sliderNoLevels')
    // A row with nothing to list opens nothing (a disabled button fires no click).
    click(controls[1])
    expect(container.querySelector('.bre-panel')).toBeNull()
    root.unmount()
  })
})

describe('ComposerSlider model picker', () => {
  it('opens as a provider column beside that provider\'s models', async () => {
    const { directory, selectSpy } = fixture()
    const { root, container } = await mount(directory)
    click(rows(container)[0])
    await vi.waitFor(() => expect(container.querySelector('.bre-panel-models')).not.toBeNull())
    const providers = Array.from(container.querySelectorAll<HTMLButtonElement>('.bre-provider'))
    expect(providers.map(el => el.querySelector('.bre-option-name')?.textContent)).toEqual(['Aliyun'])
    expect(providers[0]?.classList.contains('is-open')).toBe(true)
    // The current model's provider keeps the accent, so the column says where
    // the selection lives.
    expect(providers[0]?.classList.contains('is-current')).toBe(true)
    expect(modelOptions(container).map(el => el.querySelector('.bre-option-name')?.textContent)).toEqual(['Qwen Max', 'Qwen Plus'])
    // Clicking a provider only re-fills the right column; it never selects.
    click(providers[0])
    expect(selectSpy).not.toHaveBeenCalled()
    root.unmount()
  })

  it('marks the current model by colour alone, never with a tick beside the badges', async () => {
    const { directory } = fixture()
    const { root, container } = await mount(directory)
    click(rows(container)[0])
    await vi.waitFor(() => expect(container.querySelector('.bre-panel-models')).not.toBeNull())
    const active = container.querySelectorAll('.bre-provider-models .bre-option.is-active')
    expect(active).toHaveLength(1)
    expect(active[0]?.querySelector('.bre-option-name')?.textContent).toBe('Qwen Max')
    expect(active[0]?.querySelector('.bre-option-check')).toBeNull()
    root.unmount()
  })

  it('switches model without an effort and collapses only the list', async () => {
    const { directory, selectSpy } = fixture()
    const { root, container } = await mount(directory)
    click(rows(container)[0])
    await vi.waitFor(() => expect(container.querySelector('.bre-panel-models')).not.toBeNull())
    click(optionNamed(modelOptions(container), 'Qwen Plus'))
    // No reasoningEffort on a model switch: the level resets with the model and
    // the effort-memory wiretap restores the one remembered for it.
    await vi.waitFor(() => expect(selectSpy).toHaveBeenCalledWith({ provider: 'aliyun', model: 'qwen-plus' }))
    expect(selectSpy.mock.calls[0]?.[0]).not.toHaveProperty('reasoningEffort')
    // The list closes, but the popover body stays: the level row is still there
    // to be picked next.
    await vi.waitFor(() => expect(container.querySelector('.bre-panel-models')).toBeNull())
    expect(rows(container)).toHaveLength(2)
    await vi.waitFor(() => expect(rowValue(container, 0)).toBe('Aliyun · Qwen Plus'))
    root.unmount()
  })

  it('badges a model with vision and thinking icons only when it declares them', async () => {
    const { directory } = fixture()
    const { root, container } = await mount(directory)
    click(rows(container)[0])
    await vi.waitFor(() => expect(container.querySelector('.bre-panel-models')).not.toBeNull())
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
})

describe('ComposerSlider commit', () => {
  it('lists the current model\'s levels and commits one through directory.select', async () => {
    const { directory, selectSpy } = fixture()
    const { root, container } = await mount(directory)
    const options = await openLevels(container)
    expect(options.map(el => el.querySelector('.bre-option-name')?.textContent)).toEqual(['Off', 'Low', 'Medium', 'High', 'Max'])
    const current = options.find(el => el.classList.contains('is-active'))
    expect(current?.querySelector('.bre-option-name')?.textContent).toBe('Medium')
    expect(current?.querySelector('.bre-option-check')).not.toBeNull()
    click(optionNamed(options, 'High'))
    await vi.waitFor(() => expect(selectSpy).toHaveBeenCalledWith({ provider: 'aliyun', model: 'qwen-max', reasoningEffort: 'high' }))
    await vi.waitFor(() => expect(container.querySelector('.bre-panel')).toBeNull())
    await vi.waitFor(() => expect(rowValue(container, 1)).toBe('High'))
    root.unmount()
  })

  it('ignores a repick of the level already committed', async () => {
    const { directory, selectSpy } = fixture()
    const { root, container } = await mount(directory)
    const options = await openLevels(container)
    click(optionNamed(options, 'Medium'))
    await vi.waitFor(() => expect(selectSpy).not.toHaveBeenCalled())
    root.unmount()
  })

  it('commits a level the row only PREDICTED on the first use of a model', async () => {
    // A model switch lands with no effort, and `effectiveEffortIndex` fills the
    // row from the adapter default so the body is not blank. The seat trigger
    // still reads Default, so the displayed level is a PREDICTION, not a
    // commitment: re-picking it must submit instead of being swallowed (the
    // reported "pick another level or Medium never applies").
    const { directory, selectSpy } = fixture({ current: { provider: 'aliyun', model: 'qwen-max' } })
    const { root, container } = await mount(directory)
    expect(directory.store.getSnapshot().current?.reasoningEffort).toBeUndefined()
    // The adapter default (medium) is what the row predicts before any pick.
    await vi.waitFor(() => expect(rowValue(container, 1)).toBe('Medium'))
    const options = await openLevels(container)
    click(optionNamed(options, 'Medium'))
    await vi.waitFor(() => expect(selectSpy).toHaveBeenCalledWith({ provider: 'aliyun', model: 'qwen-max', reasoningEffort: 'medium' }))
    await vi.waitFor(() => expect(rowValue(container, 1)).toBe('Medium'))
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
    await vi.waitFor(() => expect(rowValue(container, 1)).toBe('Low'))
    const options = await openLevels(container)
    click(optionNamed(options, 'Low'))
    await vi.waitFor(() => expect(selectSpy).toHaveBeenCalledWith({ provider: 'aliyun', model: 'qwen-plus', reasoningEffort: 'low' }))
    root.unmount()
  })

  it('rolls back to the committed level when the select rejects', async () => {
    const { directory, selectSpy, update } = fixture()
    // Faithful to the real ModelDirectory: a refused selection surfaces on the
    // store (status/error) and rethrows — the row rests on the committed level
    // while the store's error line shows.
    selectSpy.mockImplementationOnce(async () => {
      update({
        ...directory.store.getSnapshot(),
        status: 'error',
        error: 'refused',
      })
      throw new Error('refused')
    })
    const { root, container } = await mount(directory)
    const options = await openLevels(container)
    click(optionNamed(options, 'High'))
    await vi.waitFor(() => {
      expect(container.querySelector('.bre-model-error')?.textContent).toContain('refused')
      expect(rowValue(container, 1)).toBe('Medium')
    })
    root.unmount()
  })

  it('rolls back when the directory resolves the refusal as a result (0.1.6-alpha.2)', async () => {
    // 0.1.6-alpha.2 RESOLVES {ok:false} on refusal instead of throwing. This
    // fixture's committed selection carries no explicit effort, so the
    // post-await store read cannot recover the rollback on its own: without
    // normalizing the refusal the row stays on the failed level.
    const { directory, selectSpy, update } = fixture({ current: { provider: 'aliyun', model: 'qwen-max' } })
    selectSpy.mockImplementationOnce(async () => {
      update({ ...directory.store.getSnapshot(), status: 'error', error: 'session/invalid: no such effort' })
      return { ok: false, error: { code: 'session/invalid', message: 'no such effort' } }
    })
    const { root, container } = await mount(directory)
    // The adapter default (medium) is the rest position before any pick.
    await vi.waitFor(() => expect(rowValue(container, 1)).toBe('Medium'))
    const options = await openLevels(container)
    click(optionNamed(options, 'High'))
    await vi.waitFor(() => {
      expect(container.querySelector('.bre-model-error')?.textContent).toContain('no such effort')
      expect(rowValue(container, 1)).toBe('Medium')
    })
    root.unmount()
  })

  it('hands focus to the menu as the clicked option is unmounted (issue #13)', async () => {
    // The official shell closes the menu when a blur leaves the card: collapsing
    // the list unmounts the focused option, which would drop focus onto <body>.
    // The commit must move focus onto the menu element itself in the same task
    // — the handoff the pane switch performs — so the menu stays open.
    const { directory, selectSpy } = fixture()
    const { root, container, menu } = await mountIn(directory)
    const options = await openLevels(container)
    click(optionNamed(options, 'High'))
    // Synchronous: the handoff runs in the commit's sync section, before the
    // first await, so the unmounted option never owns the focus.
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
    await vi.waitFor(() => expect(rowValue(container, 1)).toBe('Medium'))
    loadSpy.mockClear()
    const options = await openLevels(container)
    click(optionNamed(options, 'High'))
    await vi.waitFor(() => expect(selectSpy).toHaveBeenCalledWith({ provider: 'aliyun', model: 'qwen-max', reasoningEffort: 'high' }))
    expect(loadSpy).not.toHaveBeenCalled()
    root.unmount()
  })
})

describe('ComposerSlider layout handoff', () => {
  it('asks the host to re-place the card whenever a list opens or closes', async () => {
    // The official card only re-measures on a window resize, so the body has to
    // request one whenever its height changes — and in the same frame, or the
    // list is painted once at the stale position.
    const { directory } = fixture()
    const onLayoutChange = vi.fn()
    const { root, container } = await mount(directory, { onLayoutChange })
    expect(onLayoutChange).not.toHaveBeenCalled()
    click(rows(container)[0])
    expect(onLayoutChange).toHaveBeenCalledTimes(1)
    click(rows(container)[0])
    expect(onLayoutChange).toHaveBeenCalledTimes(2)
    // Committing a level collapses the list, which is another height change.
    await vi.waitFor(() => expect(container.querySelector('.bre-panel')).toBeNull())
    const options = await openLevels(container)
    click(optionNamed(options, 'High'))
    expect(onLayoutChange).toHaveBeenCalledTimes(4)
    root.unmount()
  })
})
