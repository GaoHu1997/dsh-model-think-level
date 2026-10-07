/**
 * The key list's seat.
 *
 * The list is rendered by React into a plugin-owned host, so what is worth
 * pinning is the React-safety and layout of that host: it is the field's NEXT
 * SIBLING — a child would grow the field's box, and the reveal eye is measured
 * against that box, so it would ride down onto the list's last row — a settled
 * pass writes nothing at all, the host is reused when the card switches
 * provider, and every way out (a reset, the takeover's teardown, a re-render that
 * took the host with it) leaves the official field exactly as the page rendered
 * it.
 */

// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { KeyState, KeyManagerClient } from '../src/client/key-manager-client.js'
import { STYLES } from '../src/client/styles.js'
import {
  KEY_MANAGED_CLASS,
  type KeyManagerFieldDeps,
  enhanceKeyManagerField,
  keyManagerRoute,
  resetKeyManagerField,
  teardownKeyManager,
} from '../src/client/injection/key-manager.js'

const COPY: Record<string, string> = {
  keysLoading: 'Loading keys…',
  keysAdd: 'Add another key',
  keysPanelFailed: 'The key list could not be shown',
}

const t = (key: string, params?: Record<string, string | number>): string => {
  const text = COPY[key] ?? key
  if (params === undefined) return text
  return Object.entries(params).reduce((carried, [name, value]) => carried.replace(`{${name}}`, String(value)), text)
}

const EMPTY: KeyState = { ok: true, route: 'ofox', enabledRef: null, entries: [] }

/** A transport that answers instantly with an empty list. */
function stubClient(): KeyManagerClient {
  return {
    list: async () => EMPTY,
    add: async () => EMPTY,
    enable: async () => EMPTY,
    rename: async () => EMPTY,
    replace: async () => EMPTY,
    remove: async () => EMPTY,
    reveal: async () => undefined,
  }
}

function deps(over: Partial<KeyManagerFieldDeps> = {}): KeyManagerFieldDeps {
  return { t, route: 'ofox', client: stubClient(), ...over }
}

/** The official key field: a label and one masked input, and nothing else. */
function keyField(region?: string): { field: HTMLElement; label: HTMLElement; input: HTMLInputElement } {
  const field = document.createElement('div')
  field.className = 'field'
  if (region !== undefined) field.setAttribute('data-bre-region', region)
  const label = document.createElement('span')
  label.className = 'fieldLabel'
  label.textContent = 'API key'
  const input = document.createElement('input')
  input.className = 'input'
  input.type = 'password'
  field.append(label, input)
  document.body.appendChild(field)
  return { field, label, input }
}

function hosts(): HTMLElement[] {
  return Array.from(document.querySelectorAll<HTMLElement>('[data-bre-key-host]'))
}

function hostOf(field: HTMLElement): HTMLElement {
  const next = field.nextElementSibling
  if (!(next instanceof HTMLElement) || !next.hasAttribute('data-bre-key-host')) {
    throw new Error('the field has no host after it')
  }
  return next
}

/** The official children of the field, as a test can see them. */
function childrenOf(field: HTMLElement): string[] {
  return Array.from(field.children).map(child => child.className)
}

/** Let a promise, React's effects and an observer's microtask all land. */
async function flush(): Promise<void> {
  // React schedules a state update on its own task, so one turn is not enough:
  // each await gives the scheduler and the promises between them a turn.
  for (let turn = 0; turn < 3; turn += 1) await new Promise((resolve) => setTimeout(resolve, 0))
}

beforeEach(() => {
  document.body.innerHTML = ''
})

afterEach(() => {
  teardownKeyManager()
})

describe('enhanceKeyManagerField', () => {
  it('puts the host right after the field, never inside it', async () => {
    const { field } = keyField()
    const before = childrenOf(field)

    enhanceKeyManagerField(field, deps())
    await flush()

    const host = hostOf(field)
    expect(host.className).toBe('bre-keys-host')
    // The official box is untouched: the eye is positioned against the field's
    // own bottom edge, so a child here would move it.
    expect(childrenOf(field)).toEqual(before)
    expect(field.querySelector('.bre-keys-host')).toBeNull()
    // The stylesheet hides this input through a direct-child rule, so the
    // premise that rule rests on — the field owns its input — is pinned here.
    expect(field.querySelector('input')?.parentElement).toBe(field)
    // The list itself is what the host holds.
    expect(host.querySelector('.bre-keys')).not.toBeNull()
    expect(host.textContent).toContain('Add another key')
  })

  it('marks the field it took over, and reads the route back off the host', async () => {
    const { field } = keyField()
    enhanceKeyManagerField(field, deps())
    await flush()

    expect(field.classList.contains(KEY_MANAGED_CLASS)).toBe(true)
    expect(keyManagerRoute(field)).toBe('ofox')
    expect(hostOf(field).getAttribute('data-bre-key-host')).toBe('ofox')
  })

  it('mirrors the field’s pane so a tab hides the list with the field', async () => {
    const { field } = keyField('provider')
    enhanceKeyManagerField(field, deps())
    await flush()

    expect(hostOf(field).getAttribute('data-bre-region')).toBe('provider')
  })

  it('writes nothing at all on a settled pass', async () => {
    const { field } = keyField('provider')
    const same = deps()
    enhanceKeyManagerField(field, same)
    await flush()

    // A blind append or a blind setAttribute would feed the models-page observer
    // its own tail and spin the reconcile forever.
    const seen: MutationRecord[] = []
    const observer = new MutationObserver(records => seen.push(...records))
    observer.observe(document.body, { childList: true, subtree: true, attributes: true, characterData: true })

    enhanceKeyManagerField(field, same)
    await flush()
    observer.disconnect()

    expect(seen).toEqual([])
  })

  it('reuses the one host when the card switches provider', async () => {
    const { field } = keyField()
    enhanceKeyManagerField(field, deps())
    await flush()
    const first = hostOf(field)

    enhanceKeyManagerField(field, deps({ route: 'wb' }))
    await flush()

    expect(hosts()).toEqual([first])
    expect(keyManagerRoute(field)).toBe('wb')
  })

  it('mounts a fresh host when the page took the old one away', async () => {
    const { field } = keyField()
    enhanceKeyManagerField(field, deps())
    await flush()
    const first = hostOf(field)
    first.remove()

    enhanceKeyManagerField(field, deps())
    await flush()

    const second = hostOf(field)
    expect(second).not.toBe(first)
    expect(hosts()).toEqual([second])
    expect(second.querySelector('.bre-keys')).not.toBeNull()
  })

  it('leaves a field alone when it is not a key field', async () => {
    const field = document.createElement('div')
    const input = document.createElement('input')
    input.type = 'text'
    field.append(input)
    document.body.appendChild(field)

    enhanceKeyManagerField(field, deps())
    await flush()

    expect(hosts()).toEqual([])
    expect(field.classList.contains(KEY_MANAGED_CLASS)).toBe(false)
    expect(keyManagerRoute(field)).toBeUndefined()
  })

  it('leaves the add-provider form alone: it has no route yet', async () => {
    const { field } = keyField()
    enhanceKeyManagerField(field, deps({ route: undefined }))

    expect(hosts()).toEqual([])
    expect(field.classList.contains(KEY_MANAGED_CLASS)).toBe(false)
  })

  it('takes the list down when the field is already out of the page', async () => {
    const { field } = keyField()
    field.remove()

    enhanceKeyManagerField(field, deps())

    expect(hosts()).toEqual([])
  })
})

describe('resetKeyManagerField', () => {
  it('gives the field back exactly as the page rendered it', async () => {
    const { field } = keyField()
    const before = childrenOf(field)
    enhanceKeyManagerField(field, deps())
    await flush()

    resetKeyManagerField(field)

    expect(hosts()).toEqual([])
    expect(childrenOf(field)).toEqual(before)
    expect(field.classList.contains(KEY_MANAGED_CLASS)).toBe(false)
    expect(keyManagerRoute(field)).toBeUndefined()
  })

  it('is not an event on a field that never had a list', () => {
    const { field } = keyField()
    expect(() => resetKeyManagerField(field)).not.toThrow()
    expect(hosts()).toEqual([])
  })
})

describe('teardownKeyManager', () => {
  it('sweeps every list, including one whose field is already gone', async () => {
    const { field: first } = keyField()
    const { field: second } = keyField()
    enhanceKeyManagerField(first, deps())
    enhanceKeyManagerField(second, deps({ route: 'wb' }))
    await flush()
    expect(hosts()).toHaveLength(2)

    // The card was dropped from the page, leaving its host behind.
    second.remove()

    teardownKeyManager()

    expect(hosts()).toEqual([])
    expect(first.classList.contains(KEY_MANAGED_CLASS)).toBe(false)
  })

  it('is not an event when nothing was mounted', () => {
    expect(() => {
      teardownKeyManager()
      teardownKeyManager()
    }).not.toThrow()
  })
})

describe('the key list contract with the stylesheet', () => {
  it('seats the host under the field without touching the field’s own box', () => {
    expect(STYLES).toContain('.bre-keys-host {')
    // The eye's own rules survive the seat: they are what the seat must not
    // disturb, so their absence would be the bug.
    expect(STYLES).toContain('.bre-key-field { position: relative; }')
    expect(STYLES).toContain('.bre-key-field > input { padding-right: 34px; }')
  })

  it('draws the keys and the add entry as one ruled list', () => {
    expect(STYLES).toContain('.bre-keys-list {')
    expect(STYLES).toContain(
      '.bre-keys-list > li + li { border-top: 0.5px solid var(--dsw-alias-border-l2, #d5d7dd); }',
    )
    expect(STYLES).toContain('border: 0.5px solid var(--dsw-alias-border-l2, #d5d7dd);')
  })

  it('makes the enable control a real radio behind the check circle', () => {
    expect(STYLES).toContain('.bre-keys-enable {')
    expect(STYLES).toContain('.bre-keys-enabled {')
    expect(STYLES).toContain('.bre-keys-enabled:checked + .bre-keys-mark {')
    expect(STYLES).toContain('.bre-keys-enabled:focus-visible + .bre-keys-mark {')
  })

  it('hands the field’s input to the list while the list manages the field', () => {
    // Two ways to write one provider's key on one card read as a conflict, so
    // the managed field keeps its input in the DOM but out of sight, and the
    // list below is the one place a key is written.
    expect(STYLES).toContain('.bre-key-managed [data-bre-key-input],')
    expect(STYLES).toContain('.bre-key-managed > input,')
    expect(STYLES).toContain('.bre-key-managed .bre-key-eye { display: none; }')
    expect(STYLES).not.toContain('.bre-keys-pick')
    expect(STYLES).not.toContain('.bre-keys-preferred')
  })

  it('reveals the three actions on hover and focus, and never hides them from a pointer that cannot hover', () => {
    expect(STYLES).toContain('.bre-keys-row:hover .bre-keys-actions,')
    expect(STYLES).toContain('.bre-keys-row:focus-within .bre-keys-actions {')
    expect(STYLES).toContain('@media (hover: none) {')
  })

  it('spans the row when the form holds one field, and carries its own primary button', () => {
    expect(STYLES).toContain('.bre-keys-form-fields > :only-child { grid-column: 1 / -1; }')
    expect(STYLES).toContain('.bre-keys-form-actions .bre-primary-button {')
  })

  it('has dropped the floating panel and the label controls it replaced', () => {
    expect(STYLES).not.toContain('.bre-key-layer')
    expect(STYLES).not.toContain('.bre-key-alias')
    expect(STYLES).not.toContain('.bre-key-add ')
    expect(STYLES).not.toContain('.bre-keys-head')
    expect(STYLES).not.toContain('.bre-keys-rename')
  })
})
