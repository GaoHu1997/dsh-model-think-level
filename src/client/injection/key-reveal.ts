/**
 * The eye on a provider's API-key field.
 *
 * Two jobs, one control. The official input is `<input type="password">` whose
 * value is React's own draft state (`keyDraft`), and a SAVED key is never part
 * of it: a configured provider shows a placeholder instead, because the harness
 * keeps provider keys write-only (the settings document carries only the
 * profile's `apiKeyEnv` reference, and the credential service reports
 * `{ configured }` — never the value). So on a settled card the eye has nothing
 * to unmask, and the plugin asks its own host for the stored value
 * ({@link loadProviderKey}, the `PROVIDER_KEY_PATH` route) when — and only
 * when — the user clicks it with an empty field. A field holding a draft the
 * user just typed is never touched: the fetch is skipped and the click only
 * swaps the mask.
 *
 * The read is deliberately constrained:
 *
 *   - it happens on an explicit click, never on render, and answers `undefined`
 *     for every failure (no route, refused fence, reference-free profile,
 *     unconfigured credential), which leaves the field masked;
 *   - it is never cached (the request says `no-store` and the route answers
 *     with the same header) and never logged;
 *   - hiding the field again takes the borrowed value back out — the draft
 *     returns to empty, which the official form reads as "keep the stored key",
 *     so revealing can never overwrite the credential by accident. A value the
 *     user edits after revealing is theirs, and is left alone.
 *
 * The button is the one node this plugin inserts into official DOM, and it is
 * inserted deliberately: the affordance only reads as an eye at the END of the
 * input if it sits inside the input's own box, and the official field has no
 * wrapper to hang it on. The trade is contained —
 *
 *   - the field itself is never restructured, and nothing official is moved or
 *     removed: the button is an absolutely positioned LEAF appended last;
 *   - React ignores trailing foreign children when it reconciles the field's
 *     known children, so the node survives every re-render (each keystroke
 *     re-renders this field);
 *   - React never writes the input's `type` back (its props do not change), so
 *     the revealed state survives too;
 *   - the pass removes the button, the marker and the class on cleanup, and
 *     restores the mask, so a withdrawn takeover leaves nothing behind.
 *
 * @module dsh-model-think-level/client/injection/key-reveal
 */

import { PROVIDER_KEY_PATH } from '../../constants.js'
import { setAttr, setClass, setHidden } from './dom.js'
import { svgGlyph } from './icon.js'

/** Set on the field that carries the key input. */
export const KEY_FIELD_CLASS = 'bre-key-field'

/** The eye button inside that field. */
export const KEY_EYE_CLASS = 'bre-key-eye'

/** Set on the key input, so it is still findable once it is unmasked. */
const KEY_INPUT_ATTR = 'data-bre-key-input'

/** The button's label while the key is masked, and while it is revealed. The
 * pass writes both on every reconcile, so a click only has to pick one and the
 * copy stays current across a language switch without a re-render. */
const SHOW_LABEL_ATTR = 'data-bre-eye-show'
const HIDE_LABEL_ATTR = 'data-bre-eye-hide'

/** The two glyphs the eye swaps between, in the shared 16px grid. */
const EYE_PATHS = [
  'M1.5 8S4 3.75 8 3.75 14.5 8 14.5 8 12 12.25 8 12.25 1.5 8 1.5 8Z',
  'M6.2 8a1.8 1.8 0 1 0 3.6 0 1.8 1.8 0 0 0-3.6 0Z',
]

/** The repo's inline translator shape (see `HeadersEditor`, `ComposerSlider`). */
export type Translator = (key: string, params?: Record<string, string | number>) => string

/** What a reconcile tells the field's eye. */
export interface KeyRevealDeps {
  /** Copy for the button's labels and its failure tooltip. */
  readonly t: Translator
  /**
   * The provider route this card edits, when the card announces one. Absent on
   * the add-provider form (no route exists yet), which is what keeps the eye
   * there a plain mask toggle.
   */
  readonly route?: string | undefined
  /** How to resolve the stored credential; injectable for tests. */
  readonly loadKey?: ((route: string) => Promise<string | undefined>) | undefined
}

/**
 * The latest deps of each dressed field.
 *
 * The eye's click handler is created once and then lives as long as the field,
 * while the pass re-visits it with fresh deps (a language switch, a route that
 * changed). Keeping them here means the handler always reads the CURRENT copy
 * and route instead of the ones captured when the button appeared.
 */
const DEPS = new WeakMap<HTMLElement, KeyRevealDeps>()

/** The key input of a field, when the field is the key field: the masked input
 * on a first pass, and — once revealed, where a `[type=password]` probe would
 * no longer find it — the input this pass marked. */
function keyInputOf(field: HTMLElement): HTMLInputElement | undefined {
  const marked = field.querySelector(`input[${KEY_INPUT_ATTR}]`)
  if (marked instanceof HTMLInputElement) return marked
  const masked = field.querySelector('input[type="password"]')
  return masked instanceof HTMLInputElement ? masked : undefined
}

/** The eye this pass put in a field, matched by class and by being a direct
 * child, so a nested button of the official page can never be mistaken for it. */
function eyeOf(field: HTMLElement): HTMLButtonElement | undefined {
  for (const child of Array.from(field.children)) {
    if (child instanceof HTMLButtonElement && child.classList.contains(KEY_EYE_CLASS)) return child
  }
  return undefined
}

/**
 * Give an editor field an eye at the end of its input, if it holds the API key.
 *
 * Runs on every reconcile of the card, so it only ever writes what differs; a
 * field with no key input is handed to {@link resetKeyField} instead, which is
 * how a takeover that has moved on (a provider whose key field is gone) drops
 * the affordance it no longer needs.
 */
export function revealKeyField(field: HTMLElement, deps: KeyRevealDeps): void {
  const input = keyInputOf(field)
  if (input === undefined) {
    resetKeyField(field)
    return
  }
  DEPS.set(field, deps)
  setAttr(input, KEY_INPUT_ATTR, '')
  setClass(field, KEY_FIELD_CLASS, true)
  const eye = eyeOf(field) ?? createEye(field)
  setAttr(eye, SHOW_LABEL_ATTR, deps.t('keyRevealShow'))
  setAttr(eye, HIDE_LABEL_ATTR, deps.t('keyRevealHide'))
  syncEye(eye, input)
}

/** Undo {@link revealKeyField}: drop the button, the class, the marker, and
 * re-mask the input, leaving the official field exactly as it was rendered. */
export function resetKeyField(field: HTMLElement): void {
  const eye = eyeOf(field)
  if (eye !== undefined) eye.remove()
  DEPS.delete(field)
  setClass(field, KEY_FIELD_CLASS, false)
  const input = field.querySelector(`input[${KEY_INPUT_ATTR}]`)
  if (input instanceof HTMLInputElement) {
    input.removeAttribute(KEY_INPUT_ATTR)
    input.type = 'password'
  }
}

/**
 * Ask the host for the credential a provider profile names.
 *
 * Fails closed by design: every refusal — an unknown route, a profile with no
 * reference, a credential that is not configured, a refused trust fence, a
 * network error — is `undefined`, and the caller leaves the field masked rather
 * than uncovering an empty box.
 */
export async function loadProviderKey(route: string): Promise<string | undefined> {
  try {
    const response = await fetch(`${PROVIDER_KEY_PATH}?route=${encodeURIComponent(route)}`, {
      method: 'GET',
      // A secret must not sit in the HTTP cache.
      cache: 'no-store',
      // The route is same-origin; sending credentials would add nothing and
      // keeps the request a plain GET.
      credentials: 'same-origin',
    })
    if (!response.ok) return undefined
    const body = (await response.json()) as { ok?: unknown; key?: unknown }
    if (body === null || typeof body !== 'object' || body.ok !== true) return undefined
    return typeof body.key === 'string' && body.key.length > 0 ? body.key : undefined
  } catch {
    return undefined
  }
}

/** State only, never structure: the button exists by then. Reads the labels
 * off the button rather than taking a translator, so the click handler does
 * not hold a stale copy of the copy. */
function syncEye(eye: HTMLButtonElement, input: HTMLInputElement): void {
  const revealed = input.type !== 'password'
  setAttr(eye, 'aria-pressed', revealed ? 'true' : 'false')
  const label = eye.getAttribute(revealed ? HIDE_LABEL_ATTR : SHOW_LABEL_ATTR)
  if (label !== null) {
    setAttr(eye, 'aria-label', label)
    // Same idiom as the drag grip and the provider switch: a tooltip for a
    // control whose state only an icon shows.
    setAttr(eye, 'title', label)
  }
  // A disabled input cannot be edited, so the eye has nothing to reveal.
  setHidden(eye, input.disabled)
}

/**
 * Write into a React-controlled input the way the user's own typing would: the
 * prototype setter bypasses React's value tracker (an instance-level override),
 * and the bubbling `input` event then lets the official component take the
 * value into its draft state — so a re-render keeps it instead of reverting to
 * the empty draft.
 */
function writeInputValue(input: HTMLInputElement, value: string): void {
  const descriptor = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')
  if (descriptor?.set === undefined) input.value = value
  else descriptor.set.call(input, value)
  input.dispatchEvent(new Event('input', { bubbles: true }))
}

function createEye(field: HTMLElement): HTMLButtonElement {
  const eye = document.createElement('button')
  eye.type = 'button'
  eye.className = KEY_EYE_CLASS
  eye.append(svgIcon('eye'), svgIcon('eye-off'))
  /** The stored value this eye wrote into the field, so hiding can take it
   * back out. Held in the closure, not in an attribute: the value is already in
   * the input, and a second copy in the DOM would outlive the reveal. */
  let borrowed: string | undefined

  const toggle = async (): Promise<void> => {
    const input = keyInputOf(field)
    const deps = DEPS.get(field)
    if (input === undefined || deps === undefined) return
    if (input.type !== 'password') {
      // Hiding: give back a value this eye borrowed. A value the user edited
      // after revealing is theirs, and stays.
      if (borrowed !== undefined && input.value === borrowed) writeInputValue(input, '')
      borrowed = undefined
      input.type = 'password'
      syncEye(eye, input)
      return
    }
    const route = deps.route
    if (route !== undefined && borrowed === undefined && input.value.length === 0) {
      setAttr(eye, 'aria-busy', 'true')
      let key: string | undefined
      try {
        key = await (deps.loadKey ?? loadProviderKey)(route)
      } catch {
        key = undefined
      }
      if (eye.hasAttribute('aria-busy')) eye.removeAttribute('aria-busy')
      if (key === undefined) {
        // Nothing to show: stay masked and say so in the tooltip, rather than
        // flipping an empty box to plain text and pretending it worked.
        const failed = deps.t('keyRevealFailed')
        setAttr(eye, 'aria-label', failed)
        setAttr(eye, 'title', failed)
        return
      }
      // A draft typed while the host was answering wins over the stored key.
      if (keyInputOf(field) === input && input.value.length === 0) {
        borrowed = key
        writeInputValue(input, key)
      }
    }
    input.type = 'text'
    syncEye(eye, input)
  }

  eye.addEventListener('click', (event: MouseEvent): void => {
    // The eye is this plugin's own control inside a form the official page
    // owns: keep the gesture from reaching their handlers and from submitting.
    event.preventDefault()
    event.stopPropagation()
    void toggle()
  })
  field.append(eye)
  return eye
}

/** A stroke-only 16px glyph that inherits the button's colour. */
function svgIcon(kind: 'eye' | 'eye-off'): SVGElement {
  const paths = kind === 'eye-off' ? [...EYE_PATHS, 'M2.5 13.5 13.5 2.5'] : EYE_PATHS
  return svgGlyph(kind, paths)
}
