/**
 * Key-reveal tests: the eye on the official provider's API-key field.
 *
 * The field belongs to the official page and the button is the one node this
 * plugin adds to it, so three layers are pinned here: what the button does to
 * the input (the mask, the labels, the state), what it asks the host for (the
 * stored key, on a click and only then), and what it leaves behind (nothing,
 * once the takeover withdraws). Placement itself is a stylesheet decision, so
 * it is asserted as a contract — the same way the tab bar asserts its own rules.
 */

// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { PROVIDER_KEY_PATH } from '../src/constants.js'
import { STYLES } from '../src/client/styles.js'
import {
  KEY_EYE_CLASS,
  KEY_FIELD_CLASS,
  loadProviderKey,
  resetKeyField,
  revealKeyField,
  type KeyRevealDeps,
} from '../src/client/injection/key-reveal.js'

const COPY: Record<string, string> = {
  keyRevealShow: 'Show key',
  keyRevealHide: 'Hide key',
  keyRevealFailed: 'Stored key unavailable',
}

const t = (key: string): string => COPY[key] ?? key

/** The deps a card hands the field, with only the interesting part spelled out. */
function deps(over: Partial<KeyRevealDeps> = {}): KeyRevealDeps {
  return { t, ...over }
}

/** The official key field: a label and one input, and nothing else. */
function keyField(type: 'password' | 'text' = 'password'): HTMLElement {
  const field = document.createElement('div')
  field.className = 'field'
  const label = document.createElement('span')
  label.className = 'fieldLabel'
  label.textContent = 'API key'
  const input = document.createElement('input')
  input.className = 'input'
  input.type = type
  field.append(label, input)
  document.body.appendChild(field)
  return field
}

function eyeOf(field: HTMLElement): HTMLButtonElement | null {
  return field.querySelector<HTMLButtonElement>(`.${KEY_EYE_CLASS}`)
}

function inputOf(field: HTMLElement): HTMLInputElement {
  return field.querySelector('input') as HTMLInputElement
}

function click(button: HTMLElement): MouseEvent {
  const event = new MouseEvent('click', { bubbles: true, cancelable: true })
  button.dispatchEvent(event)
  return event
}

/** The click handler awaits the host, so let its microtasks and its timer land. */
function flush(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0))
}

beforeEach(() => {
  document.body.innerHTML = ''
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('revealKeyField', () => {
  it('hangs one eye on the field and names it for the masked state', () => {
    const field = keyField()
    revealKeyField(field, deps())

    const eye = eyeOf(field)
    expect(field.classList.contains(KEY_FIELD_CLASS)).toBe(true)
    expect(eye).not.toBeNull()
    expect(eye?.parentElement).toBe(field)
    expect(eye?.tagName).toBe('BUTTON')
    expect(eye?.getAttribute('type')).toBe('button')
    expect(eye?.getAttribute('aria-pressed')).toBe('false')
    expect(eye?.getAttribute('aria-label')).toBe('Show key')
    expect(eye?.getAttribute('title')).toBe('Show key')
    expect(eye?.hidden).toBe(false)
    // The input is left exactly as the host rendered it.
    expect(inputOf(field).type).toBe('password')
    expect(inputOf(field).className).toBe('input')
    // Both glyphs ship inside the button; the stylesheet shows one of them.
    expect(eye?.querySelectorAll('svg[data-bre-icon]')).toHaveLength(2)
    expect(eye?.querySelector('svg[data-bre-icon="eye"]')).not.toBeNull()
    expect(eye?.querySelector('svg[data-bre-icon="eye-off"]')).not.toBeNull()
  })

  it('reveals on one click and masks again on the next, labels included', () => {
    const field = keyField()
    revealKeyField(field, deps())
    const eye = eyeOf(field) as HTMLButtonElement
    const input = inputOf(field)

    click(eye)
    expect(input.type).toBe('text')
    expect(eye.getAttribute('aria-pressed')).toBe('true')
    expect(eye.getAttribute('aria-label')).toBe('Hide key')
    expect(eye.getAttribute('title')).toBe('Hide key')

    click(eye)
    expect(input.type).toBe('password')
    expect(eye.getAttribute('aria-pressed')).toBe('false')
    expect(eye.getAttribute('aria-label')).toBe('Show key')
  })

  it('keeps its gesture inside the button', () => {
    const field = keyField()
    revealKeyField(field, deps())
    const eye = eyeOf(field) as HTMLButtonElement
    const onField = vi.fn()
    field.addEventListener('click', onField)

    const event = click(eye)

    expect(onField).not.toHaveBeenCalled()
    expect(event.defaultPrevented).toBe(true)
  })

  it('is idempotent across reconciles, revealed state included', () => {
    const field = keyField()
    revealKeyField(field, deps())
    click(eyeOf(field) as HTMLButtonElement)

    // The pass visits the field again on every mutation of the page.
    revealKeyField(field, deps())
    revealKeyField(field, deps())

    expect(field.querySelectorAll(`.${KEY_EYE_CLASS}`)).toHaveLength(1)
    expect(inputOf(field).type).toBe('text')
  })

  it('settles: a second pass over a dressed field writes nothing', async () => {
    const field = keyField()
    revealKeyField(field, deps())
    const records: MutationRecord[] = []
    const observer = new MutationObserver((list) => {
      records.push(...list)
    })
    observer.observe(field, { attributes: true, childList: true, subtree: true })

    revealKeyField(field, deps())
    await flush()

    observer.disconnect()
    // The pass listens for mutations across the whole panel, so a blind write
    // here would have the scan chasing its own tail: dress → record → rescan.
    expect(records).toHaveLength(0)
  })

  it('leaves a field whose input is not the masked key alone', () => {
    const field = keyField('text')
    revealKeyField(field, deps())

    expect(eyeOf(field)).toBeNull()
    expect(field.classList.contains(KEY_FIELD_CLASS)).toBe(false)
  })

  it('steps aside while the input is disabled, and comes back', () => {
    const field = keyField()
    revealKeyField(field, deps())
    const eye = eyeOf(field) as HTMLButtonElement
    const input = inputOf(field)

    input.disabled = true
    revealKeyField(field, deps())
    expect(eye.hidden).toBe(true)

    input.disabled = false
    revealKeyField(field, deps())
    expect(eye.hidden).toBe(false)
  })

  it('drops the affordance when the key input is gone', () => {
    const field = keyField()
    revealKeyField(field, deps())
    inputOf(field).remove()

    revealKeyField(field, deps())

    expect(eyeOf(field)).toBeNull()
    expect(field.classList.contains(KEY_FIELD_CLASS)).toBe(false)
  })
})

describe('the eye and a key that is already stored', () => {
  it('asks the host for the stored key and fills the empty field with it', async () => {
    const field = keyField()
    const loadKey = vi.fn(async () => 'sk-stored')
    revealKeyField(field, deps({ route: 'aliyun', loadKey }))
    const eye = eyeOf(field) as HTMLButtonElement
    const input = inputOf(field)

    click(eye)
    await flush()

    expect(loadKey).toHaveBeenCalledTimes(1)
    expect(loadKey).toHaveBeenCalledWith('aliyun')
    expect(input.value).toBe('sk-stored')
    expect(input.type).toBe('text')
    expect(eye.getAttribute('aria-pressed')).toBe('true')
    expect(eye.hasAttribute('aria-busy')).toBe(false)
  })

  it('lets the official component see the filled value through a bubbling input event', async () => {
    const field = keyField()
    const onInput = vi.fn()
    document.body.addEventListener('input', onInput)
    revealKeyField(field, deps({ route: 'aliyun', loadKey: async () => 'sk-stored' }))

    click(eyeOf(field) as HTMLButtonElement)
    await flush()

    // React's own listener sits at the root and takes the value into the draft
    // state from this event; without it, the next render would empty the box.
    expect(onInput).toHaveBeenCalledTimes(1)
    expect(inputOf(field).value).toBe('sk-stored')
    document.body.removeEventListener('input', onInput)
  })

  it('dims in place while the host answers', async () => {
    const field = keyField()
    let release: ((value: string | undefined) => void) | undefined
    const loadKey = (): Promise<string | undefined> =>
      new Promise<string | undefined>((resolve) => {
        release = resolve
      })
    revealKeyField(field, deps({ route: 'aliyun', loadKey }))
    const eye = eyeOf(field) as HTMLButtonElement

    click(eye)
    await flush()
    expect(eye.getAttribute('aria-busy')).toBe('true')

    release?.('sk-stored')
    await flush()
    expect(eye.hasAttribute('aria-busy')).toBe(false)
    expect(inputOf(field).value).toBe('sk-stored')
  })

  it('takes the borrowed value back out on hide, leaving the field as found', async () => {
    const field = keyField()
    revealKeyField(field, deps({ route: 'aliyun', loadKey: async () => 'sk-stored' }))
    const eye = eyeOf(field) as HTMLButtonElement
    const input = inputOf(field)

    click(eye)
    await flush()
    click(eye)

    // Empty is what the official form reads as "keep the stored key", so a
    // reveal can never overwrite the credential by hiding again.
    expect(input.value).toBe('')
    expect(input.type).toBe('password')
  })

  it('never asks the host over a draft the user typed', async () => {
    const field = keyField()
    const loadKey = vi.fn(async () => 'sk-stored')
    revealKeyField(field, deps({ route: 'aliyun', loadKey }))
    const input = inputOf(field)
    input.value = 'sk-typed'

    click(eyeOf(field) as HTMLButtonElement)
    await flush()

    expect(loadKey).not.toHaveBeenCalled()
    expect(input.value).toBe('sk-typed')
    expect(input.type).toBe('text')
  })

  it('leaves a value the user edits after revealing alone', async () => {
    const field = keyField()
    revealKeyField(field, deps({ route: 'aliyun', loadKey: async () => 'sk-stored' }))
    const eye = eyeOf(field) as HTMLButtonElement
    const input = inputOf(field)

    click(eye)
    await flush()
    input.value = 'sk-edited'
    click(eye)

    expect(input.value).toBe('sk-edited')
    expect(input.type).toBe('password')
  })

  it('stays masked and names the failure when the host has no key', async () => {
    const field = keyField()
    revealKeyField(field, deps({ route: 'aliyun', loadKey: async () => undefined }))
    const eye = eyeOf(field) as HTMLButtonElement
    const input = inputOf(field)

    click(eye)
    await flush()

    // Nothing was uncovered, so nothing is claimed to have been uncovered.
    expect(input.type).toBe('password')
    expect(eye.getAttribute('aria-pressed')).toBe('false')
    expect(eye.getAttribute('aria-label')).toBe('Stored key unavailable')
    expect(eye.getAttribute('title')).toBe('Stored key unavailable')
    expect(eye.hasAttribute('aria-busy')).toBe(false)
  })

  it('is a plain mask toggle on a card that names no route', async () => {
    const field = keyField()
    const loadKey = vi.fn(async () => 'sk-stored')
    revealKeyField(field, deps({ loadKey }))

    click(eyeOf(field) as HTMLButtonElement)
    await flush()

    expect(loadKey).not.toHaveBeenCalled()
    expect(inputOf(field).type).toBe('text')
  })

  it('uses the route and the copy of the latest reconcile', async () => {
    const field = keyField()
    const first = vi.fn(async () => 'sk-first')
    const second = vi.fn(async () => 'sk-second')
    revealKeyField(field, deps({ route: 'first', loadKey: first }))
    // The card can be re-visited with another route (or another language); the
    // handler is created once, so it must read what the pass last wrote.
    revealKeyField(field, deps({ route: 'second', loadKey: second }))

    click(eyeOf(field) as HTMLButtonElement)
    await flush()

    expect(first).not.toHaveBeenCalled()
    expect(second).toHaveBeenCalledWith('second')
    expect(inputOf(field).value).toBe('sk-second')
  })
})

describe('loadProviderKey', () => {
  it('asks the host route for one route, uncached and same-origin', async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ ok: true, key: 'sk-stored' }), { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)

    await expect(loadProviderKey('ali yun/1')).resolves.toBe('sk-stored')

    // The path is a contract with the host half; pin it here so a rename on one
    // side cannot silently ship a dead route.
    expect(PROVIDER_KEY_PATH).toBe('/dsh-model-think-level/provider-key')
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe(`${PROVIDER_KEY_PATH}?route=ali%20yun%2F1`)
    expect(init.cache).toBe('no-store')
    expect(init.method).toBe('GET')
  })

  it('fails closed on every refusal', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('nope', { status: 404 })))
    await expect(loadProviderKey('aliyun')).resolves.toBeUndefined()

    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ ok: false, error: 'forbidden' }), { status: 200 })))
    await expect(loadProviderKey('aliyun')).resolves.toBeUndefined()

    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ ok: true, key: '' }), { status: 200 })))
    await expect(loadProviderKey('aliyun')).resolves.toBeUndefined()

    vi.stubGlobal('fetch', vi.fn(async () => new Response('not json', { status: 200 })))
    await expect(loadProviderKey('aliyun')).resolves.toBeUndefined()

    vi.stubGlobal('fetch', vi.fn(async () => {
      throw new Error('offline')
    }))
    await expect(loadProviderKey('aliyun')).resolves.toBeUndefined()
  })
})

describe('resetKeyField', () => {
  it('takes the button, the class and the marker back and restores the mask', async () => {
    const field = keyField()
    revealKeyField(field, deps({ route: 'aliyun', loadKey: async () => 'sk-stored' }))
    click(eyeOf(field) as HTMLButtonElement)
    await flush()
    expect(inputOf(field).type).toBe('text')

    resetKeyField(field)

    expect(eyeOf(field)).toBeNull()
    expect(field.classList.contains(KEY_FIELD_CLASS)).toBe(false)
    expect(field.querySelector('[data-bre-key-input]')).toBeNull()
    expect(inputOf(field).type).toBe('password')
    // Nothing official was moved or dropped on the way out.
    expect(field.querySelector('.fieldLabel')).not.toBeNull()
    expect(field.children).toHaveLength(2)
  })

  it('forgets the card, so a click after the takeover cannot fetch again', async () => {
    const field = keyField()
    const loadKey = vi.fn(async () => 'sk-stored')
    revealKeyField(field, deps({ route: 'aliyun', loadKey }))
    const eye = eyeOf(field) as HTMLButtonElement

    resetKeyField(field)
    click(eye)
    await flush()

    expect(loadKey).not.toHaveBeenCalled()
    // The button the gesture was aimed at is gone from the page.
    expect(eye.isConnected).toBe(false)
    expect(inputOf(field).type).toBe('password')
  })
})

describe('the eye contract with the stylesheet', () => {
  it('places the button on the field box and swaps one glyph for the other', () => {
    // The field is the official flex column, so the button is measured against
    // the input's own 32px row rather than against a wrapper that does not exist.
    expect(STYLES).toContain('.bre-key-field { position: relative; }')
    expect(STYLES).toContain('.bre-key-field > input { padding-right: 34px; }')
    expect(STYLES).toContain('.bre-key-eye {\n  position: absolute;\n  right: 4px;\n  bottom: 0;')
    // A failed validation adds a message line under the input and the eye rides
    // above it, so it never covers the message it belongs to.
    expect(STYLES).toContain('.bre-key-field:has(> p) .bre-key-eye { bottom: 24px; }')
    // Waiting on the host dims the button in place: no size change, no vanish.
    expect(STYLES).toContain(".bre-key-eye[aria-busy='true'] {\n  opacity: 0.55;\n  cursor: progress;\n}")
    // `hidden` has to win the display fight against the button's own display.
    expect(STYLES).toContain('.bre-key-eye[hidden] { display: none; }')
    expect(STYLES).toContain(".bre-key-eye[aria-pressed='false'] svg[data-bre-icon='eye'],")
    expect(STYLES).toContain(".bre-key-eye[aria-pressed='true'] svg[data-bre-icon='eye-off'] { display: block; }")
    expect(STYLES).toContain('.bre-key-eye { transition: none; }')
  })
})
