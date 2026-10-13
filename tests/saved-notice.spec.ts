/**
 * The official "Saved &lt;provider&gt;." line: taken out of the panel's flow and
 * answered by a bubble at the top of the window that takes itself away.
 *
 * The line belongs to the host (`ModelsSection`'s `savedNotice`, a CSS-module
 * class, so it is probed by fragment) and stays mounted after the save until
 * the next edit, remove or add clears it — a whole line of panel height held
 * for as long as the user works in the card. The pass therefore hides it (never
 * removes it: React owns the node) and raises the plugin's own fixed bubble
 * with the same words, on every save, for three seconds.
 *
 * The fixture is the section as the host renders it: the read-only notice, the
 * saved line, then the provider list. The saved line is driven the way the page
 * drives it — the same element reconciled with new text — because that is what
 * a SECOND save looks like.
 */

// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { reconcileSavedNotice, teardownSavedNotice } from '../src/client/injection/saved-notice.js'
import { STYLES } from '../src/client/styles.js'

/** The official saved line, with the CSS-module hash of the shipped bundle. */
const SAVED_CLASS = '_3nPmjq_savedNotice'

interface Fixture {
  /** The Models section the pass is given. */
  readonly root: HTMLElement
  /** The official saved line inside it. */
  readonly notice: HTMLElement
  /** Save a provider the way the page does: same element, new words. */
  readonly save: (text: string) => void
}

/**
 * A Models section holding one saved line, exactly where the host puts it:
 * after the read-only notice and before the provider list.
 */
function buildSection(): Fixture {
  const root = document.createElement('div')
  root.innerHTML = `
    <p class="_3nPmjq_notice">Settings are read-only.</p>
    <p class="${SAVED_CLASS}" role="status" aria-live="polite"></p>
    <ul class="_3nPmjq_rows"><li class="_3nPmjq_row">abin</li></ul>`
  const notice = root.querySelector<HTMLElement>('p[class*="savedNotice"]')!
  return {
    root,
    notice,
    // React reconciles this very node with new children on the next save.
    save: (text: string) => { notice.textContent = text },
  }
}

/** The bubble currently on the page, or a throw — every case expects one. */
function note(): HTMLElement {
  const [only] = Array.from(document.querySelectorAll<HTMLElement>('.bre-auto-effort-note'))
  if (only === undefined) throw new Error('no bubble')
  return only
}

const notes = (): HTMLElement[] =>
  Array.from(document.querySelectorAll<HTMLElement>('.bre-auto-effort-note'))

/** The bubble's headline — for this pass, the host's own words. */
const said = (): string => note().querySelector<HTMLElement>('.bre-auto-effort-note-text')?.textContent ?? ''

describe('official saved notice', () => {
  let fixture: Fixture

  beforeEach(() => {
    fixture = buildSection()
    document.body.append(fixture.root)
  })

  afterEach(() => {
    // The pass holds its state on the module, so every case starts clean.
    teardownSavedNotice()
    fixture.root.remove()
    vi.useRealTimers()
  })

  it('takes the official line out of the flow and says it at the top instead', () => {
    fixture.save('已保存 Abin (abin)。')
    reconcileSavedNotice(fixture.root)
    // The space the user reported is the line's own height: it is not removed
    // (React owns the node and would put it back on the next render) but taken
    // out of the flow, and marked so a later pass knows this node is ours.
    expect(fixture.notice.style.display).toBe('none')
    expect(fixture.notice.hasAttribute('data-bre-saved-hidden')).toBe(true)
    // The words are the HOST's, not ours — no second wording to keep in step.
    expect(said()).toBe('已保存 Abin (abin)。')
    expect(note().parentElement).toBe(document.body)
  })

  it('paints the bubble in the host success green and announces it', () => {
    fixture.save('已保存 Abin (abin)。')
    reconcileSavedNotice(fixture.root)
    // The `done` phase is the sheet's success green — the colour the line it
    // replaces was painted, so the bubble says the same thing in another place.
    expect(note().getAttribute('data-bre-auto-effort-phase')).toBe('done')
    // The line this replaces is now an invisible node: for a reader that cannot
    // see the bubble, this live region is the only answer to the save.
    expect(note().getAttribute('role')).toBe('status')
    expect(note().getAttribute('aria-live')).toBe('polite')
  })

  it('goes away on its own after three seconds', async () => {
    vi.useFakeTimers()
    fixture.save('已保存 Abin (abin)。')
    reconcileSavedNotice(fixture.root)
    expect(notes()).toHaveLength(1)
    // The stylesheet times its fade from the same number the script dismisses
    // on, so the bubble can neither fade early nor linger faded.
    expect(note().style.getPropertyValue('--bre-note-hold')).toBe('3000ms')
    await vi.advanceTimersByTimeAsync(2999)
    expect(notes()).toHaveLength(1)
    await vi.advanceTimersByTimeAsync(1)
    expect(notes()).toHaveLength(0)
  })

  it('answers the NEXT save on the very same node', () => {
    vi.useFakeTimers()
    fixture.save('已保存 Abin (abin)。')
    reconcileSavedNotice(fixture.root)
    // The host keeps one line mounted: a second save is this element with new
    // text. A pass that only reported a line's FIRST sighting would silence
    // every save after the first.
    fixture.save('已保存 Foo (foo)。')
    reconcileSavedNotice(fixture.root)
    expect(said()).toBe('已保存 Foo (foo)。')
    // Replaced, not stacked: one bubble says one thing.
    expect(notes()).toHaveLength(1)
    expect(fixture.notice.style.display).toBe('none')
  })

  it('does not re-raise for the settled line it already answered', () => {
    vi.useFakeTimers()
    fixture.save('已保存 Abin (abin)。')
    reconcileSavedNotice(fixture.root)
    // Every pass runs again on every mutation burst — including the ones this
    // bubble's own appending and dismissal cause. Same words, nothing to say, or
    // the line the user already dismissed would never be allowed to stay gone.
    reconcileSavedNotice(fixture.root)
    reconcileSavedNotice(fixture.root)
    expect(notes()).toHaveLength(1)
  })

  it('writes nothing at all on a page that has saved nothing', () => {
    // The host renders the line only once a save exists, so the quiet page has
    // no line at all. The pass must then emit no mutation of its own: the
    // observer watches the whole panel, and a write per scan would feed the
    // scan it came from.
    const quiet = document.createElement('div')
    quiet.innerHTML = '<p class="_3nPmjq_notice">Settings are read-only.</p><ul class="_3nPmjq_rows"></ul>'
    document.body.append(quiet)
    reconcileSavedNotice(quiet)
    expect(notes()).toHaveLength(0)
    expect(quiet.querySelector('[data-bre-saved-hidden]')).toBeNull()
    quiet.remove()
  })

  it('restores the line and drops the bubble on teardown', () => {
    vi.useFakeTimers()
    fixture.save('已保存 Abin (abin)。')
    reconcileSavedNotice(fixture.root)
    expect(notes()).toHaveLength(1)
    // The line belongs to the host: a plugin disable must leave the official
    // page exactly as it was, and the bubble is this plugin's own DOM.
    teardownSavedNotice()
    expect(fixture.notice.style.display).toBe('')
    expect(fixture.notice.hasAttribute('data-bre-saved-hidden')).toBe(false)
    expect(notes()).toHaveLength(0)
  })

  it('puts a cleared line back the way it was found', () => {
    fixture.save('已保存 Abin (abin)。')
    reconcileSavedNotice(fixture.root)
    expect(fixture.notice.style.display).toBe('none')
    // The next edit or remove clears the host's own target, so the line leaves
    // the DOM: the pass must forget it rather than keep writing to a node it no
    // longer sees, and the styles it recorded must not leak to its next life.
    fixture.notice.remove()
    reconcileSavedNotice(fixture.root)
    const again = buildSection()
    document.body.append(again.root)
    reconcileSavedNotice(again.root)
    expect(again.notice.style.display).toBe('none')
    again.root.remove()
    teardownSavedNotice()
    expect(fixture.notice.style.display).toBe('')
  })

  it('rides the sheet the auto-adapt verdict already uses', () => {
    // One shape for "something happened at the top of the window and went away":
    // fixed at the top, outranking the settings dialog's overlay, and fading
    // inside the hold the script sets.
    expect(STYLES).toContain('.bre-auto-effort-note {')
    expect(STYLES).toContain('  top: 40px;\n')
    expect(STYLES).toContain('  z-index: 1200;\n')
    expect(STYLES).toContain('calc(var(--bre-note-hold, 3000ms) - 400ms)')
    expect(STYLES).toContain(".bre-auto-effort-note[data-bre-auto-effort-phase='done']")
  })
})