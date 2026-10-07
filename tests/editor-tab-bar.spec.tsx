/**
 * The tab bar's own contract: it renders the three segments, and a click on one
 * switches the card it sits in — the only user path into the takeover. The bar
 * is React DOM the plugin owns, which is the point of it living here: the pane
 * switch is the card attribute, so a click needs no React state and no re-render
 * to take effect.
 */

// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, createElement } from 'react'
import { createRoot } from 'react-dom/client'
import type { Translate } from '@deepseek-ai/dsh-client-ui-slots'
import type { Root } from 'react-dom/client'
import { EditorTabBar } from '../src/client/injection/editor-tab-bar.js'
import { EDITOR_TAB_ID_ATTR, EDITOR_TABS_CLASS } from '../src/client/injection/editor-tabs.js'
import { en } from '../src/client/locales.js'
import { STYLES } from '../src/client/styles.js'

;(globalThis as Record<string, unknown>)['IS_REACT_ACT_ENVIRONMENT'] = true

const t = (key: string, params?: Record<string, string | number>): string => {
  let text = (en as Record<string, string>)[key] ?? key
  for (const [name, value] of Object.entries(params ?? {})) {
    text = text.replaceAll(`{${String(name)}}`, String(value))
  }
  return text
}

/**
 * Mount the bar exactly where the slot component mounts it: inside the plugin's
 * request-header wrapper, as a child of a card row. `card` is null for the
 * detached case, where there is no row to switch.
 */
async function renderBar(insideCard = true): Promise<{ card: HTMLElement | null; host: HTMLElement; unmount(): Promise<void> }> {
  const card = insideCard ? document.createElement('li') : null
  if (card !== null) {
    card.className = 'rowCard'
    document.body.appendChild(card)
  }
  const host = document.createElement('div')
  host.className = 'bre-headers-host'
  if (card !== null) card.appendChild(host)
  else document.body.appendChild(host)
  // The component receives the ref the slot puts on this wrapper; the wrapper is
  // what resolves the card, so the stand-in is the element itself.
  const ref = { current: host as HTMLDivElement | null }
  let root: Root | undefined
  await act(async () => {
    root = createRoot(host)
    root.render(createElement(EditorTabBar, { host: ref, t: t as unknown as Translate }))
  })
  return {
    card,
    host,
    async unmount() {
      await act(async () => { root!.unmount() })
      card?.remove()
      host.remove()
    },
  }
}

function barOf(host: HTMLElement): HTMLElement {
  return host.querySelector(`.${EDITOR_TABS_CLASS}`) as HTMLElement
}

function tabOf(host: HTMLElement, id: string): HTMLElement {
  return host.querySelector(`[${EDITOR_TAB_ID_ATTR}="${id}"]`) as HTMLElement
}

async function click(element: HTMLElement): Promise<void> {
  await act(async () => {
    element.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }))
  })
}

afterEach(() => {
  document.body.innerHTML = ''
  vi.restoreAllMocks()
})

describe('EditorTabBar', () => {
  it('renders one labelled segment per tab, in order', async () => {
    const { host, unmount } = await renderBar()
    try {
      const bar = barOf(host)
      expect(bar.getAttribute('role')).toBe('tablist')
      expect(bar.getAttribute('aria-label')).toBe('Editor sections')
      const tabs = Array.from(bar.querySelectorAll<HTMLElement>(`[${EDITOR_TAB_ID_ATTR}]`))
      expect(tabs.map((tab) => tab.getAttribute(EDITOR_TAB_ID_ATTR))).toEqual(['provider', 'models', 'advanced'])
      expect(tabs.map((tab) => tab.textContent)).toEqual(['Provider', 'Models', 'Advanced'])
      // Nothing is selected until the pass labels the card it belongs to: a bar
      // rendered on a card the takeover skipped must not claim a tab.
      expect(tabs.every((tab) => tab.getAttribute('aria-selected') === null)).toBe(true)
    } finally {
      await unmount()
    }
  })

  it('switches the card it sits in on a click', async () => {
    const { card, host, unmount } = await renderBar()
    try {
      await click(tabOf(host, 'models'))
      expect(card?.getAttribute('data-bre-tab')).toBe('models')
      expect(tabOf(host, 'models').getAttribute('aria-selected')).toBe('true')
      expect(tabOf(host, 'provider').getAttribute('aria-selected')).toBe('false')

      await click(tabOf(host, 'advanced'))
      expect(card?.getAttribute('data-bre-tab')).toBe('advanced')
      expect(tabOf(host, 'advanced').getAttribute('aria-selected')).toBe('true')

      await click(tabOf(host, 'provider'))
      expect(card?.getAttribute('data-bre-tab')).toBe('provider')
    } finally {
      await unmount()
    }
  })

  it('keeps the official page out of the gesture', async () => {
    const { card, host, unmount } = await renderBar()
    const seen = vi.fn()
    card?.addEventListener('click', seen)
    try {
      await click(tabOf(host, 'models'))
      // The click rearranges the official editor, so it must not reach whatever
      // handler the row or the page put above this bar.
      expect(seen).not.toHaveBeenCalled()

      // Only the segments are controls; the bar's own padding switches nothing.
      await click(barOf(host))
      expect(card?.getAttribute('data-bre-tab')).toBe('models')
    } finally {
      card?.removeEventListener('click', seen)
      await unmount()
    }
  })

  it('is inert when no card carries it', async () => {
    const { host, unmount } = await renderBar(false)
    try {
      await click(tabOf(host, 'models'))
      expect(document.querySelector('[data-bre-tab]')).toBeNull()
      expect(document.querySelectorAll('[data-bre-tab-id][aria-selected]')).toHaveLength(0)
    } finally {
      await unmount()
    }
  })

  it('is revealed only by the takeover class the pass writes', () => {
    // Measured contract, like the headers host's own: the bar is in the DOM of
    // every provider card while collapsed (a remount-free open), so its
    // visibility must be a stylesheet decision keyed on the card's state.
    expect(STYLES).toContain('.bre-editor-tabs {\n  display: none;')
    expect(STYLES).toContain('.bre-tabbed .bre-editor-tabs { display: flex; }')
    // The mount carries the bar, so the takeover reveals the mount too: gating
    // it on the official-edit probe alone would put the bar inside a
    // display:none parent the moment that probe stopped matching.
    expect(STYLES).toContain('.bre-tabbed .bre-headers-host { display: block; }')
    expect(STYLES).toContain(".bre-tabbed[data-bre-tab='advanced'] .bre-headers { display: flex; }")
    // The pane is a card in its own right: as the only content under the bar the
    // section stops being an appendage and draws the surface instead of a rule
    // dividing it from fields that are not on this tab.
    expect(STYLES).toContain(
      ".bre-tabbed[data-bre-tab='advanced'] .bre-headers {\n  padding: 12px;\n  border-top: none;",
    )
    expect(STYLES).toContain('background: var(--dsw-alias-bg-module-platform, #f5f6f7);')
  })
})
