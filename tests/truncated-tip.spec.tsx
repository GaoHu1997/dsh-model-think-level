// @vitest-environment jsdom
/**
 * The truncated-name bubble used to outlive its anchor: when the model menu
 * closed (or a provider switch re-rendered the list) while the pointer still sat
 * on the truncated span, the span's `mouseleave` never fired, the bubble stayed
 * in state, and the zeroed rect of the dead anchor clamped it into the window's
 * top-left corner — a white bar covering the app's left edge.
 *
 * These specs pin the two halves of the fix: the bubble is never drawn for an
 * anchor that lost its layout, and a shown bubble retires on the gestures (and
 * the re-render) that take that anchor away.
 */
import { act, createElement } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ComposerSlider } from '../src/client/ComposerSlider.js'
import type { ConfiguredInputs, ModelFacts } from '../src/client/configured-inputs.js'
import type { ModelDirectoryLike } from '../src/client/types.js'

// React's `act` refuses to flush without this flag in a non-test-renderer host.
;(globalThis as Record<string, unknown>)['IS_REACT_ACT_ENVIRONMENT'] = true

/** The name that overflowed in the field report: 25 chars in a 12px column. */
const LONG_NAME = 'deepseek-v4.1-flash-1017'

/** Mount the popover body over a one-provider directory. */
function mount(): { container: HTMLElement; root: ReturnType<typeof createRoot> } {
  const snapshot = {
    current: { provider: 'provider', model: 'model' },
    groups: [{
      id: 'provider',
      name: 'Provider with a long display name',
      models: [{ id: 'model', name: LONG_NAME, reasoning: { efforts: [{ id: 'high', name: 'High' }] } }],
    }],
    status: 'ready',
    error: null,
  }
  const directory = {
    store: { getSnapshot: () => snapshot, subscribe: () => () => undefined },
    load: async () => undefined,
    select: async () => ({ ok: true }),
  } as unknown as ModelDirectoryLike
  // Stable identities: a fresh Map per call would re-render forever.
  const facts: ModelFacts = { input: ['text'] }
  const configuredSnapshot = new Map<string, ReadonlyMap<string, ModelFacts>>([
    ['provider', new Map([['model', facts]])],
  ])
  const configuredInputs = {
    getSnapshot: () => configuredSnapshot,
    subscribe: () => () => undefined,
    load: async () => undefined,
    invalidate: () => undefined,
  } as unknown as ConfiguredInputs
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)
  act(() => {
    root.render(createElement(ComposerSlider, {
      directory,
      configuredInputs,
      t: (key: string) => key,
    }))
  })
  return { container, root }
}

/** jsdom lays nothing out: give the anchor the geometry a truncated span has. */
function stubGeometry(element: HTMLElement, width = 120, right = 160): void {
  const box = {
    x: right - width, y: 40, left: right - width, top: 40, right, bottom: 56, width, height: 16,
    toJSON: () => undefined,
  } as DOMRect
  element.getBoundingClientRect = () => box
  element.getClientRects = (() => [box]) as unknown as () => DOMRectList
  Object.defineProperty(element, 'scrollWidth', { configurable: true, value: 260 })
  Object.defineProperty(element, 'clientWidth', { configurable: true, value: width })
}

/** Drop the layout a hidden row would have, keeping it in the document. */
function hide(element: HTMLElement): void {
  element.getClientRects = (() => []) as unknown as () => DOMRectList
  element.getBoundingClientRect = (() => ({
    x: 0, y: 0, left: 0, top: 0, right: 0, bottom: 0, width: 0, height: 0,
    toJSON: () => undefined,
  }) as DOMRect)
}

/** Native mouseover with an outside relatedTarget is what React reads as enter. */
function hover(element: HTMLElement): void {
  act(() => {
    element.dispatchEvent(new MouseEvent('mouseover', { bubbles: true, relatedTarget: document.documentElement }))
  })
}

const anchorOf = (container: HTMLElement): HTMLElement => container.querySelector<HTMLElement>('.bre-menu-name')!

const tip = (): HTMLElement | null => document.querySelector('.bre-tip')

/** Run the dwell timer inside act: its `setTip` is a React update. */
async function dwell(ms: number): Promise<void> {
  await act(async () => { await vi.advanceTimersByTimeAsync(ms) })
}

describe('truncated-name bubble', () => {
  let container: HTMLElement | undefined
  let root: ReturnType<typeof createRoot> | undefined

  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
  })

  afterEach(async () => {
    if (root !== undefined) await act(async () => { root!.unmount() })
    container?.remove()
    container = undefined
    root = undefined
    vi.useRealTimers()
  })

  /** Mount, hover the truncated name and let the 300ms dwell elapse. */
  async function open(): Promise<HTMLElement> {
    const mounted = mount()
    container = mounted.container
    root = mounted.root
    const anchor = anchorOf(container)
    stubGeometry(anchor)
    hover(anchor)
    await dwell(320)
    return anchor
  }

  it('opens for a truncated anchor and follows its right edge', async () => {
    await open()
    const bubble = tip()
    // The head's bubble names provider and model, as its aria-label does.
    expect(bubble?.textContent).toContain(LONG_NAME)
    // Clamped to the anchor's right edge, never to the window's left one.
    expect(bubble?.style.right).toBe(`${window.innerWidth - 160}px`)
    expect(bubble?.style.top).toBe('62px')
  })

  it('never opens for an anchor that vanished during the dwell', async () => {
    ;({ container, root } = mount())
    const anchor = anchorOf(container)
    stubGeometry(anchor)
    hover(anchor)
    // The menu closes / the row re-renders before the 300ms timer fires.
    hide(anchor)

    await dwell(320)
    expect(tip()).toBeNull()
  })

  it('drops a shown bubble once its anchor is removed from the document', async () => {
    const anchor = await open()
    expect(tip()).not.toBeNull()

    // The watcher answers on a microtask, and React's follow-up render is a
    // task of its own: both must settle inside act.
    await act(async () => { anchor.remove() })
    expect(tip()).toBeNull()
  })

  it('drops a shown bubble once its anchor loses its layout', async () => {
    const anchor = await open()
    expect(tip()).not.toBeNull()

    // `display:none` is a real attribute mutation, which is what the watcher
    // sees; jsdom computes no layout, so the collapsed rect is stubbed too.
    await act(async () => {
      hide(anchor)
      anchor.style.display = 'none'
    })
    expect(tip()).toBeNull()
  })

  it('retires on a dismissing gesture', async () => {
    await open()
    expect(tip()).not.toBeNull()

    act(() => { window.dispatchEvent(new Event('pointerdown', { bubbles: true })) })
    expect(tip()).toBeNull()
  })

  it('retires on Escape', async () => {
    await open()
    expect(tip()).not.toBeNull()

    act(() => { window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' })) })
    expect(tip()).toBeNull()
  })
})
