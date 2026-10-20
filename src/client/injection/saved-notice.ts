/**
 * The official "Saved &lt;provider&gt;." line, taken out of the flow and
 * answered by a bubble at the top of the window instead.
 *
 * The host confirms a save by inserting a paragraph above the provider list
 * (`ModelsSection`'s `savedNotice`, `role="status"`) that stays there until the
 * next edit, remove or add clears it. It is feedback, not state — the row it
 * names is on screen and shows the save itself — but it holds a whole line of
 * the panel's height the whole time the user works in the card, which is the
 * "the hint eats space" report. So the line is hidden (never removed: React
 * owns it, and it must survive the page's own re-renders) and the same words go
 * up as the plugin's fixed top-centre bubble, which takes itself away after
 * {@link NOTE_TTL_MS} — the treatment the auto-adapt seat's verdict already
 * gets, and the one the host's own toast uses.
 *
 * The pass owns no wire and no state of its own: it is DOM-only, idempotent and
 * compare-before-write, so a settled page emits no mutation of its own.
 *
 * @module dsh-model-think-level/client/injection/saved-notice
 */

/**
 * How long the bubble stays up.
 *
 * A save confirmation is feedback: it answers the click the user just made and
 * the provider row already shows the result. It must not outlive the moment, or
 * it sits over the card the user is now working in.
 */
const NOTE_TTL_MS = 3000

/** The official line, probed by class-name fragment (a CSS-module hash). */
const SAVED_NOTICE_PROBE = 'p[class*="savedNotice"]'

/** Marks a line this pass has taken out of the flow. */
const HIDDEN_ATTR = 'data-bre-saved-hidden'

/**
 * The bubble's classes and phase attribute.
 *
 * The auto-adapt seat's own bubble class, deliberately: one shape for "something
 * happened at the top of the window and went away", and its `done` phase is the
 * host's own success green, which is what the line it replaces was painted.
 */
const NOTE_CLASS = 'bre-auto-effort-note'
const NOTE_PHASE_ATTR = 'data-bre-auto-effort-phase'
const NOTE_TEXT_CLASS = 'bre-auto-effort-note-text'

/** The lines this pass has hidden, each with the display it had to put back. */
const hidden = new Map<HTMLElement, string>()

/**
 * The text last raised for a line, per line.
 *
 * The bubble is raised on a change of words, not on the line being present: the
 * official page keeps the line mounted until the next edit, and this pass runs
 * again on every mutation burst — including the ones its own bubble's appending
 * and dismissal cause. A new save is the same node with new text, so the key is
 * the TEXT rather than the sighting.
 */
const raised = new WeakMap<HTMLElement, string>()

/** The bubble currently up, and the timer that will take it down. */
let bubble: HTMLElement | null = null
let timer: ReturnType<typeof setTimeout> | null = null

/**
 * Hide every official saved line inside the panel, and put up a bubble for the
 * one that just appeared.
 * @param root - the Models panel the passes all decorate.
 */
export function reconcileSavedNotice(root: HTMLElement): void {
  const notices = Array.from(root.querySelectorAll<HTMLElement>(SAVED_NOTICE_PROBE))
  for (const notice of notices) {
    // The bubble is raised on a CHANGE of the line's words, which is the save.
    // Checked on every pass rather than only on a first sighting: the host
    // reuses this very element for the NEXT save (React reconciles the same
    // position), so a second save is the same node with new text — a
    // first-sighting-only pass would silence it.
    const text = notice.textContent?.trim() ?? ''
    if (raised.get(notice) !== text) {
      raised.set(notice, text)
      if (text.length > 0) raise(text)
    }
    // Compare-before-write: the observer watches the whole panel, and a blind
    // style write on every scan would feed the scan it came from.
    if (hidden.has(notice)) continue
    hidden.set(notice, notice.style.display)
    notice.setAttribute(HIDDEN_ATTR, '')
    notice.style.display = 'none'
  }
  // A line the host cleared (its `savedTarget` went back to undefined, or the
  // page re-rendered without it) is put back the way it was found, so a plugin
  // disable leaves the official page exactly as it was.
  for (const [notice, display] of Array.from(hidden)) {
    if (notice.isConnected && notices.includes(notice)) continue
    restore(notice, display)
    hidden.delete(notice)
  }
}

/** Put every official line back and take the bubble down (plugin dispose). */
export function teardownSavedNotice(): void {
  for (const [notice, display] of Array.from(hidden)) restore(notice, display)
  hidden.clear()
  dismissBubble()
}

/** Undo this pass's one write to an official line. */
function restore(notice: HTMLElement, display: string): void {
  notice.style.display = display
  notice.removeAttribute(HIDDEN_ATTR)
}

/**
 * Raise the top bubble for a save this plugin made itself.
 *
 * The official line answers the host's own commits; a pane that writes through
 * `settings.mutate` produces none, and the pane closes the card on success, so
 * its inline message would go down with the card. The bubble is what carries
 * the confirmation there — with the same words a host save would have used, so
 * the two paths look like one.
 * @param text - the confirmation sentence to show.
 */
export function announceSavedNotice(text: string): void {
  raise(text)
}

/**
 * Raise (or replace) the bubble at the top of the window and arrange for it to
 * retire.
 *
 * A bubble already up for the SAME words is left alone — the host's line stays
 * mounted after the save, so a fresh timer here would keep it alive as long as
 * the panel stayed quiet. Different words replace it, so the bubble always says
 * what the last save was.
 */
function raise(text: string): void {
  if (bubble !== null && bubble.isConnected && bubble.textContent === text) return
  dismissBubble()
  const note = document.createElement('div')
  note.className = NOTE_CLASS
  // Announced, because the line this replaces stays in the accessibility tree
  // only as a silent, invisible node: this is the answer a reader hears.
  note.setAttribute('role', 'status')
  note.setAttribute('aria-live', 'polite')
  note.setAttribute(NOTE_PHASE_ATTR, 'done')
  note.innerHTML = `<span class="${NOTE_TEXT_CLASS}"></span>`
  const line = note.querySelector<HTMLElement>(`.${NOTE_TEXT_CLASS}`)
  if (line !== null) line.textContent = text
  // The fade is declared in the sheet and timed from here, so the two can never
  // disagree — the same pairing the auto-adapt verdict uses.
  note.style.setProperty('--bre-note-hold', `${NOTE_TTL_MS}ms`)
  document.body.append(note)
  bubble = note
  timer = setTimeout(() => { dismissBubble() }, NOTE_TTL_MS)
}

/** Take the bubble down and cancel its pending dismissal. */
function dismissBubble(): void {
  if (timer !== null) {
    clearTimeout(timer)
    timer = null
  }
  // The bubble is this plugin's own DOM outside the panel — nothing else would
  // ever unmount it.
  bubble?.remove()
  bubble = null
}