/**
 * The settle guard: the provider list's row actions, held at full opacity while
 * the host's post-apply reload disables them after one of the plugin's writes.
 *
 * The reload is the host's own (`state.status` is not `ready` until the
 * namespace is re-described), so this pass never touches the disabled state —
 * only the painted opacity — and it must let go the moment the host re-enables
 * the controls. The fixture is a provider row exactly as the host renders it:
 * the action span carries a CSS-module class, so the probe is by fragment, and
 * a permanently disabled control (a built-in provider's 删除) sits beside the
 * live ones to prove the pass only holds what the write could have affected.
 */

// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { armSettleGuard, reconcileSettleGuard, teardownSettleGuard } from '../src/client/injection/settle-guard.js'
import { STYLES } from '../src/client/styles.js'

/** The mark the pass puts on a held button. */
const GUARD_ATTR = 'data-bre-settle'

/** How long a write gets to turn into a reload before its marks are dropped. */
const SETTLE_GRACE_MS = 1500

interface Fixture {
  /** The Models section the pass is handed. */
  readonly root: HTMLElement
  /** The closed row's live 编辑 button. */
  readonly edit: HTMLButtonElement
  /** The closed row's live 删除 button. */
  readonly remove: HTMLButtonElement
  /** A built-in provider's 删除: disabled for reasons no write causes. */
  readonly locked: HTMLButtonElement
  /** The switch this plugin injects INSIDE the actions: never held. */
  readonly toggle: HTMLButtonElement
}

/** A Models section holding a closed provider row and a built-in one. */
function buildSection(): Fixture {
  const root = document.createElement('div')
  root.innerHTML = `
    <ul class="_3nPmjq_rows">
      <li class="_3nPmjq_rowCard">
        <div class="_3nPmjq_rowHead">
          <span class="_3nPmjq_rowActions">
            <button class="bre-provider-switch" aria-label="启用 abin" role="switch">启用</button>
            <button class="_3nPmjq_secondaryButton" aria-label="编辑 abin">编辑</button>
            <button class="_3nPmjq_dangerButton" aria-label="删除 abin">删除</button>
          </span>
        </div>
      </li>
      <li class="_3nPmjq_rowCard">
        <div class="_3nPmjq_rowHead">
          <span class="_3nPmjq_rowActions">
            <button class="_3nPmjq_secondaryButton" aria-label="编辑 deepseek">编辑</button>
            <button class="_3nPmjq_dangerButton" aria-label="删除 deepseek" disabled>删除</button>
          </span>
        </div>
      </li>
    </ul>`
  const buttons = Array.from(root.querySelectorAll<HTMLButtonElement>('button'))
  return {
    root,
    edit: buttons[1]!,
    remove: buttons[2]!,
    locked: buttons[4]!,
    toggle: buttons[0]!,
  }
}

describe('settle guard', () => {
  let fixture: Fixture

  beforeEach(() => {
    fixture = buildSection()
    document.body.append(fixture.root)
  })

  afterEach(() => {
    // The pass keeps its watch on the module: every case starts unarmed.
    teardownSettleGuard()
    fixture.root.remove()
    vi.useRealTimers()
  })

  it('marks the usable buttons as it arms, before the reload disables them', () => {
    // The mark is put on while every watched button is still enabled: it paints
    // the opacity they already have, so arming changes no pixel, and the disable
    // that arrives a frame later finds the answer already in place.
    armSettleGuard(document)
    expect(fixture.edit.getAttribute(GUARD_ATTR)).toBe('')
    expect(fixture.remove.getAttribute(GUARD_ATTR)).toBe('')
    expect(fixture.locked.hasAttribute(GUARD_ATTR)).toBe(false)
  })

  it('holds a usable button at full while the reload disables it, then lets go', () => {
    armSettleGuard(document)
    // The reload lands a beat after the write: the host disables the closed
    // row's actions. Their paint does not change, because the mark is already
    // there.
    fixture.edit.disabled = true
    fixture.remove.disabled = true
    reconcileSettleGuard()
    expect(fixture.edit.getAttribute(GUARD_ATTR)).toBe('')
    expect(fixture.remove.getAttribute(GUARD_ATTR)).toBe('')

    // The reload settles: the host re-enables them, and the mark comes off in
    // the same pass — so the release is not a visible change either.
    fixture.edit.disabled = false
    fixture.remove.disabled = false
    reconcileSettleGuard()
    expect(fixture.edit.hasAttribute(GUARD_ATTR)).toBe(false)
    expect(fixture.remove.hasAttribute(GUARD_ATTR)).toBe(false)
  })

  it('lets go on its own when the host re-enables between decoration bursts', async () => {
    // The release side is the section's own commit, not one of the panel's
    // bursts: without the frame poll the marks would survive until the next
    // unrelated pass.
    armSettleGuard(document)
    fixture.edit.disabled = true
    reconcileSettleGuard()
    fixture.edit.disabled = false
    await new Promise((resolve) => setTimeout(resolve, 80))
    expect(fixture.edit.hasAttribute(GUARD_ATTR)).toBe(false)
  })

  it('drops its marks when the write turns out to cause no reload', async () => {
    // A refused or no-op write leaves the list alone; the marks must not sit on
    // enabled buttons for the life of the window.
    armSettleGuard(document)
    expect(fixture.edit.hasAttribute(GUARD_ATTR)).toBe(true)
    await new Promise((resolve) => setTimeout(resolve, SETTLE_GRACE_MS + 120))
    expect(fixture.edit.hasAttribute(GUARD_ATTR)).toBe(false)
  })

  it('follows the row when the host re-renders its buttons', () => {
    // Saving from the advanced pane closes the card, and the host re-renders
    // that row on the way: the button the watch saw is gone by the time the
    // reload disables the replacement. The watch is held per row and role, so
    // the new element is the one that gets held.
    armSettleGuard(document)
    const replacement = document.createElement('button')
    replacement.className = '_3nPmjq_secondaryButton'
    replacement.setAttribute('aria-label', '编辑 abin')
    replacement.textContent = '编辑'
    fixture.edit.replaceWith(replacement)

    replacement.disabled = true
    reconcileSettleGuard()
    expect(replacement.getAttribute(GUARD_ATTR)).toBe('')
  })

  it('never holds a control that was already disabled when the write was armed', () => {
    // A built-in provider's 删除 is disabled for the life of the page, and a
    // held mark would paint it as usable for the whole window.
    armSettleGuard(document)
    reconcileSettleGuard()
    expect(fixture.locked.hasAttribute(GUARD_ATTR)).toBe(false)
    // And it is not adopted later, either: the watch was taken at arm time.
    reconcileSettleGuard()
    expect(fixture.locked.hasAttribute(GUARD_ATTR)).toBe(false)
  })

  it('leaves the enable switch this plugin injects alone', () => {
    // The switch is the plugin's own control inside the action group, not one
    // of the host's row actions: holding it would cover a state of its own.
    armSettleGuard(document)
    fixture.toggle.disabled = true
    reconcileSettleGuard()
    expect(fixture.toggle.hasAttribute(GUARD_ATTR)).toBe(false)
  })

  it('does nothing until a write arms it', () => {
    // Every decoration pass calls the reconcile, most of them with no write in
    // flight: an unarmed pass must not touch the host's buttons at all.
    fixture.edit.disabled = true
    reconcileSettleGuard()
    expect(fixture.edit.hasAttribute(GUARD_ATTR)).toBe(false)
  })

  it('stops holding after its window, so a control never stays lit for ever', async () => {
    vi.useFakeTimers()
    armSettleGuard(document)
    // The window bounds a reload that never re-enables: the mark is dropped on
    // the first pass past it, and the ordinary disabled look comes back.
    await vi.advanceTimersByTimeAsync(8001)
    fixture.edit.disabled = true
    reconcileSettleGuard()
    expect(fixture.edit.hasAttribute(GUARD_ATTR)).toBe(false)
  })

  it('undoes its marks on teardown', () => {
    armSettleGuard(document)
    fixture.edit.disabled = true
    reconcileSettleGuard()
    expect(fixture.edit.getAttribute(GUARD_ATTR)).toBe('')

    teardownSettleGuard()
    expect(fixture.edit.hasAttribute(GUARD_ATTR)).toBe(false)
  })

  it('styles the held button back to full opacity', () => {
    // The mark only works because the sheet answers it: the official disabled
    // rule is what paints the .4, and an `!important` of this stylesheet's own
    // is the one thing that outranks it.
    expect(STYLES).toContain(`[${GUARD_ATTR}] { opacity: 1 !important; }`)
  })
})
