/**
 * The provider list's buttons, held still while the host reloads the Models
 * section after one of this plugin's own settings writes.
 *
 * A write through `settings.mutate` invalidates the settings document, and the
 * official section answers by re-describing the namespace before it paints the
 * new value. While that reload runs the section's own state is not `ready`, and
 * every closed row renders its 编辑/删除 buttons `disabled` — the host's busy
 * state, not a plugin decoration, and it lands a beat AFTER the save resolves
 * (the wire is fast; the re-describe is not). The list then paints at 40% for a
 * second or two and comes back, which is the "the provider list buttons flicker
 * after saving" report: the buttons were usable, went pale, and returned.
 *
 * The plugin cannot shorten that reload — it is the host's own post-apply pass,
 * and the wait is the describe round trip, not anything this code owns. Nor does
 * it fake the disable away: the attributes stay, so the buttons are inert for
 * exactly as long as the host means them to be, and a reader is told nothing
 * different. What it does is keep the PAINTED opacity of the buttons that were
 * usable when the write was armed, and release them the moment the host
 * re-enables them. Nothing else about the row changes, so the save's own
 * confirmation is what the user sees instead of the whole list blinking.
 *
 * The watch is armed by the write, not by the reload: the reload is a
 * consequence of the write and carries no marker of its own. What is remembered
 * at arm time is a ROLE per row (this row's 编辑, this row's 删除) and whether it
 * was usable then; the mark is re-applied to whatever element fills that role in
 * that row whenever the pass runs. That indirection is what the close of a card
 * needs: saving from the advanced pane closes the provider card, the host
 * re-renders the row (new button elements), and a set of nodes taken before the
 * write would be gone by the time the reload disables the replacements. Only
 * roles that were usable at arm time are ever held, so a permanently disabled
 * control (a built-in provider's 删除, a read-only row) keeps its ordinary look,
 * and a row that unmounts simply leaves the watch.
 *
 * @module dsh-model-think-level/client/injection/settle-guard
 */

/**
 * The mark that keeps one button's painted opacity at full.
 *
 * `styles.ts` answers it with `opacity: 1 !important`, which is what a
 * `disabled` button's own rule (`opacity: .4`) cannot outrank.
 */
const GUARD_ATTR = 'data-bre-settle'

/**
 * The row's action buttons: the host's own action container, whose class is a
 * CSS-module hash, hence the fragment probe. 编辑 and 删除 are its children; the
 * enable switch this plugin injects is one too, so it is excluded by its own
 * class — its enabled state is the plugin's, and a held opacity there would
 * hide the plugin's own busy or off state.
 */
const ROW_ACTION_PROBE = '[class*="rowActions"] > button:not(.bre-provider-switch)'

/** How long one write is allowed to explain a disable. */
const SETTLE_WINDOW_MS = 8000

/**
 * How long a write may still turn into a reload.
 *
 * The invalidation travels back over the wire and the describe round trip
 * follows; in the page that is hundreds of milliseconds. A write that has caused
 * no disable by the end of this grace was refused or changed nothing, and the
 * marks come off then rather than sitting on enabled buttons for the full
 * window.
 */
const SETTLE_GRACE_MS = 1500

/** One row's action, identified by the role the host gave it. */
type ActionRole = 'edit' | 'remove'

/** A control the write could have affected: which row, which role. */
interface Watch {
  /** The row element; it outlives the buttons the host re-renders. */
  readonly row: Element
  /** Which of the row's actions this was. */
  readonly role: ActionRole
}

/** The watches one armed write took, and their window. */
let watches: Watch[] | null = null

/** When the armed write stops explaining disables. */
let deadline = 0

/** When the write was armed, for the grace before a reload shows up. */
let armedAt = 0

/** Whether the reload has been seen disabling one of the watched actions. */
let sawDisabled = false

/** The pending frame poll, while one is scheduled; `null` when the watch is idle. */
let poll: number | null = null

/**
 * Which role the host gave this button. 删除 is its danger button; everything
 * else in the action group is the plain one.
 */
function roleOf(button: HTMLButtonElement): ActionRole {
  return button.className.includes('dangerButton') ? 'remove' : 'edit'
}

/** The button currently filling one role in one row, if it is still there. */
function roleButton(row: Element, role: ActionRole): HTMLButtonElement | null {
  const buttons = Array.from(row.querySelectorAll<HTMLButtonElement>(ROW_ACTION_PROBE))
  return buttons.find(button => roleOf(button) === role) ?? null
}

/**
 * One frame's delay, for the poll. A poll is what notices the host re-enabling
 * the buttons: that is a React commit of the section's own, with no mutation
 * burst of this plugin's to ride, so the release would otherwise wait for the
 * next unrelated pass.
 */
function scheduleFrame(callback: () => void): number {
  if (typeof requestAnimationFrame === 'function') return requestAnimationFrame(callback)
  return setTimeout(callback, 16) as unknown as number
}

/** Cancel one scheduled frame poll. */
function cancelFrame(handle: number): void {
  if (typeof cancelAnimationFrame === 'function') cancelAnimationFrame(handle)
  else clearTimeout(handle)
}

/**
 * Start watching the list for the reload one settings write is about to cause.
 *
 * Called BEFORE the write: the section re-renders off the invalidation the
 * write itself raises, so a guard armed after the reply can arrive with the
 * buttons already disabled and nothing left to hold.
 * @param root - the container the row actions live in, `document` in the page.
 */
export function armSettleGuard(root: ParentNode = document): void {
  release()
  const taken: Watch[] = []
  for (const button of Array.from(root.querySelectorAll<HTMLButtonElement>(ROW_ACTION_PROBE))) {
    // Only what was usable: a control that was already disabled when the write
    // left is disabled for reasons the write did not cause, and holding it would
    // paint an unusable button as usable for the whole window.
    if (button.disabled) continue
    const row = button.closest('li') ?? button.parentElement
    if (row === null) continue
    const role = roleOf(button)
    if (taken.some(watch => watch.row === row && watch.role === role)) continue
    taken.push({ row, role })
  }
  if (taken.length === 0) return
  watches = taken
  armedAt = Date.now()
  deadline = armedAt + SETTLE_WINDOW_MS
  // Hold them from now on: the mark paints the opacity an enabled button
  // already has, so arming is invisible, and the disable that arrives a frame
  // later finds the answer already in place.
  holdAll()
  schedulePoll()
}

/**
 * Re-apply the marks to whatever elements fill the watched roles, let go of the
 * ones the host has re-enabled, and stop watching once the reload is over.
 *
 * Runs on every decoration pass (the panel's mutation burst — including the one
 * that re-renders a row when the card closes) and once a frame while the watch
 * is armed. Compare-before-write on both edges, so a settled page feeds no
 * mutation back into the pass that just ran.
 */
export function reconcileSettleGuard(): void {
  if (watches === null) return
  const now = Date.now()
  if (now > deadline) {
    release()
    return
  }
  let pending = 0
  watches = watches.filter((watch) => {
    if (!watch.row.isConnected) return false
    const button = roleButton(watch.row, watch.role)
    if (button === null) return true
    if (button.disabled) {
      sawDisabled = true
      pending += 1
      if (!button.hasAttribute(GUARD_ATTR)) button.setAttribute(GUARD_ATTR, '')
    } else if (sawDisabled && button.hasAttribute(GUARD_ATTR)) {
      // The host is done with the reload for this control. Once one of them
      // comes back the section is out of its busy state, and every other
      // watched button comes back in the same commit.
      button.removeAttribute(GUARD_ATTR)
    }
    return true
  })
  if (sawDisabled && pending === 0) {
    release()
    return
  }
  // No reload has shown up: a refusal or a write that changed nothing. Stop
  // holding rather than sit on the marks for the rest of the window.
  if (!sawDisabled && now - armedAt > SETTLE_GRACE_MS) {
    release()
    return
  }
  schedulePoll()
}

/** Queue the next frame poll, unless one is already queued or the watch ended. */
function schedulePoll(): void {
  if (poll !== null || watches === null) return
  poll = scheduleFrame(() => {
    poll = null
    reconcileSettleGuard()
  })
}

/** Put the mark on every watched role's current element. */
function holdAll(): void {
  if (watches === null) return
  for (const watch of watches) {
    const button = roleButton(watch.row, watch.role)
    if (button !== null && !button.hasAttribute(GUARD_ATTR)) button.setAttribute(GUARD_ATTR, '')
  }
}

/** Drop every held button and stop watching (plugin dispose). */
export function teardownSettleGuard(): void {
  release()
}

/** Undo this pass's marks and forget the armed write. */
function release(): void {
  if (poll !== null) {
    cancelFrame(poll)
    poll = null
  }
  if (watches !== null) {
    for (const watch of watches) {
      const button = roleButton(watch.row, watch.role)
      if (button !== null) button.removeAttribute(GUARD_ATTR)
    }
  }
  watches = null
  sawDisabled = false
  deadline = 0
  armedAt = 0
}
