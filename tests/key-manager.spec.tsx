/**
 * The key list itself: the rows it draws, the pick it offers on them, and the
 * one inline form that adding, relabelling and replacing all share.
 *
 * The component is a leaf rendered into a host the injection pass owns, so the
 * properties worth pinning are the ones a user can see and act on — and, just as
 * much, the ones the design deliberately left out: there is no dialog (the form
 * opens in the list, under the row it edits), and a row carries exactly three
 * actions, no more.
 */

// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createElement } from 'react'
import { KeyManager, type KeyManagerProps } from '../src/client/KeyManager.js'
import type { KeyAnswer, KeyManagerClient, KeyRow, KeyState } from '../src/client/key-manager-client.js'
import { mountReact, unmountReact, type ForeignMount } from '../src/client/injection/mount.js'

/** The English copy the component is handed, keyed as the locales are. */
const COPY: Record<string, string> = {
  keysLoading: 'Loading keys…',
  keysAdd: 'Add another key',
  keysAddConfirm: 'Add',
  keysEnable: 'Use {name}',
  keysEnabled: 'Enabled',
  keysMissing: 'Not stored',
  keysEdit: 'Edit',
  keysRemove: 'Delete',
  keysConfirmRemove: 'Confirm delete',
  keysCancel: 'Cancel',
  keysSave: 'Save',
  keysAlias: 'Label',
  keysAliasPlaceholder: 'Name (optional), e.g. Team',
  keysValue: 'Key',
  keysValuePlaceholder: 'Paste the API key',
  keysNewValuePlaceholder: 'Paste the new API key',
  keysAddIllegal: 'A key is printable ASCII without spaces.',
  keysAdded: 'Key stored.',
  keysRenamed: 'Label saved.',
  keysReplaced: 'Key replaced.',
  keysRemoved: 'Key removed.',
  keysEnabledNote: '{name} is now in use.',
  keysUnreachable: 'The plugin’s key route did not answer.',
  keysPanelFailed: 'Key manager failed to render',
}

const t = (key: string, params?: Record<string, string | number>): string => {
  const text = COPY[key] ?? key
  if (params === undefined) return text
  return Object.entries(params).reduce((carried, [name, value]) => carried.replace(`{${name}}`, String(value)), text)
}

function state(over: Partial<KeyState> = {}): KeyState {
  return { ok: true, route: 'ofox', enabledRef: null, entries: [], ...over }
}

function row(over: Partial<KeyRow> & { ref: string }): KeyRow {
  return { enabled: false, configured: true, ...over }
}

/** A transport that records what it was asked, and answers what the test says. */
function recorder(script: Partial<KeyManagerClient> = {}): {
  client: KeyManagerClient
  calls: Array<{ op: string; args: unknown[] }>
} {
  const calls: Array<{ op: string; args: unknown[] }> = []
  const base: KeyManagerClient = {
    list: async () => state(),
    add: async () => state(),
    enable: async () => state(),
    rename: async () => state(),
    replace: async () => state(),
    remove: async () => state(),
    reveal: async () => undefined,
    ...script,
  }
  const client: KeyManagerClient = {
    list: (route) => {
      calls.push({ op: 'list', args: [route] })
      return base.list(route)
    },
    add: (route, value, alias) => {
      calls.push({ op: 'add', args: [route, value, alias] })
      return base.add(route, value, alias)
    },
    enable: (route, ref) => {
      calls.push({ op: 'enable', args: [route, ref] })
      return base.enable(route, ref)
    },
    rename: (route, ref, alias) => {
      calls.push({ op: 'rename', args: [route, ref, alias] })
      return base.rename(route, ref, alias)
    },
    replace: (route, ref, value) => {
      calls.push({ op: 'replace', args: [route, ref, value] })
      return base.replace(route, ref, value)
    },
    remove: (route, ref) => {
      calls.push({ op: 'remove', args: [route, ref] })
      return base.remove(route, ref)
    },
    reveal: (route, ref) => {
      calls.push({ op: 'reveal', args: [route, ref] })
      return base.reveal(route, ref)
    },
  }
  return { client, calls }
}

interface Panel {
  root: HTMLElement
  mount: ForeignMount
}

let mounted: Panel | undefined

function mount(props: Partial<KeyManagerProps> = {}): Panel {
  const container = document.createElement('div')
  document.body.append(container)
  const panel: Panel = {
    root: container,
    mount: mountReact(
      container,
      createElement(KeyManager, { route: 'ofox', t, client: recorder().client, ...props }),
      // Committed before mount() returns: the first paint is part of what
      // several tests assert, and a deferred commit would make it a race.
      { sync: true },
    ),
  }
  mounted = panel
  return panel
}

/**
 * Let everything settle: React's own scheduled render, the effect that asks the
 * host for the list, the promise that answers it, and the render that adopts it.
 * One macrotask is not enough — each of those is its own turn.
 */
async function flush(turns = 5): Promise<void> {
  for (let turn = 0; turn < turns; turn += 1) {
    await new Promise((resolve) => setTimeout(resolve, 0))
  }
}

function buttonByText(root: HTMLElement, text: string): HTMLButtonElement {
  const found = Array.from(root.querySelectorAll('button')).find((button) => button.textContent === text)
  if (found === undefined) throw new Error(`no button "${text}"`)
  return found
}

/** The row a name identifies: its label when it has one, its mask otherwise. */
function rowOf(root: HTMLElement, name: string): HTMLElement {
  const found = Array.from(root.querySelectorAll<HTMLElement>('.bre-keys-row')).find(
    (element) =>
      element.querySelector('.bre-keys-alias')?.textContent === name ||
      element.querySelector('.bre-keys-mask')?.textContent === name,
  )
  if (found === undefined) throw new Error(`no row for ${name}`)
  return found
}

function actionsOf(row: HTMLElement): string[] {
  return Array.from(row.querySelectorAll('.bre-keys-actions button')).map((button) => button.textContent ?? '')
}

function formRowOf(root: HTMLElement): HTMLElement | null {
  return root.querySelector<HTMLElement>('.bre-keys-form-row')
}

function inputsOf(root: HTMLElement): HTMLInputElement[] {
  const form = formRowOf(root)
  if (form === null) throw new Error('no form is open')
  return Array.from(form.querySelectorAll('input'))
}

/** Type into a React-controlled input the way a browser does. */
function type(input: HTMLInputElement, value: string): void {
  const descriptor = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')
  descriptor?.set?.call(input, value)
  input.dispatchEvent(new Event('input', { bubbles: true }))
}

beforeEach(() => {
  document.body.innerHTML = ''
  mounted = undefined
})

afterEach(() => {
  if (mounted !== undefined) unmountReact(mounted.mount)
  vi.restoreAllMocks()
})

describe('the list', () => {
  it('opens on a loading line and then shows what the host answered', async () => {
    const { client } = recorder({ list: async () => state({ entries: [row({ ref: 'A' })] }) })
    const panel = mount({ client })
    expect(panel.root.textContent).toContain('Loading keys…')

    await flush()
    expect(panel.root.textContent).not.toContain('Loading keys…')
    expect(panel.root.querySelectorAll('.bre-keys-row')).toHaveLength(1)
  })

  it('names a row by its label, and follows the label with the masked key', async () => {
    const { client } = recorder({
      list: async () =>
        state({ entries: [row({ ref: 'key-2', alias: 'key2', masked: 'sk-a...z9' })] }),
    })
    const panel = mount({ client })
    await flush()

    const line = rowOf(panel.root, 'key2')
    const mask = line.querySelector('.bre-keys-mask')
    expect(mask?.textContent).toBe('sk-a...z9')
    // With a label the mask is a quiet code pill, not the row's name.
    expect(mask?.classList.contains('bre-keys-mask-plain')).toBe(false)
  })

  it('names a row by the masked key itself when it has no label', async () => {
    const { client } = recorder({ list: async () => state({ entries: [row({ ref: 'key-1', masked: 'sk-v...6pQ2' })] }) })
    const panel = mount({ client })
    await flush()

    const line = rowOf(panel.root, 'sk-v...6pQ2')
    expect(line.querySelector('.bre-keys-alias')).toBeNull()
    expect(line.querySelector('.bre-keys-mask')?.classList.contains('bre-keys-mask-plain')).toBe(true)
    // The reference itself is never what the row shows.
    expect(line.textContent).not.toContain('key-1')
  })

  it('never guesses a key it was not told about, and says when one is not stored', async () => {
    const { client } = recorder({
      list: async () =>
        state({
          entries: [
            row({ ref: 'A', configured: true, masked: 'sk-a...a1' }),
            // No mask and not configured: the row must say so rather than draw
            // an all-dots preview that would claim a key is sitting there.
            row({ ref: 'B', configured: false }),
            row({ ref: 'C', configured: true }),
            row({ ref: 'D', configured: false, masked: 'sk-d...d1' }),
          ],
        }),
    })
    const panel = mount({ client })
    await flush()

    const masks = Array.from(panel.root.querySelectorAll<HTMLElement>('.bre-keys-mask')).map(
      (element) => element.textContent,
    )
    expect(masks).toEqual(['sk-a...a1', 'Not stored', '••••••••', 'sk-d...d1'])
    // The preview and the state marker are separate facts: a key the host says
    // is gone can still have a mask on file.
    expect(rowOf(panel.root, 'sk-d...d1').dataset['state']).toBe('missing')
  })

  it('marks a missing key as such, and names the enable control on every row', async () => {
    const { client } = recorder({
      list: async () =>
        state({
          entries: [
            row({ ref: 'A', enabled: false, configured: false, masked: 'sk-a...a1' }),
            row({ ref: 'B', enabled: true, configured: true, masked: 'sk-b...b1' }),
          ],
        }),
    })
    const panel = mount({ client })
    await flush()

    const missing = rowOf(panel.root, 'sk-a...a1')
    const ready = rowOf(panel.root, 'sk-b...b1')
    expect(missing.dataset['state']).toBe('missing')
    expect(ready.dataset['state']).toBe('ready')
    // The control says what it does on every row, so the word no longer comes
    // and goes with the state; which key is in use is the checked radio and the
    // tick beside it.
    expect(missing.querySelector('.bre-keys-enable-text')?.textContent).toBe('Enabled')
    expect(ready.querySelector('.bre-keys-enable-text')?.textContent).toBe('Enabled')
    expect(missing.querySelector<HTMLInputElement>('input.bre-keys-enabled')?.checked).toBe(false)
    expect(ready.querySelector<HTMLInputElement>('input.bre-keys-enabled')?.checked).toBe(true)
    expect(missing.querySelector('.bre-keys-mark svg')).toBeNull()
    expect(ready.querySelector('.bre-keys-mark svg')).not.toBeNull()
  })
})

describe('the enable control', () => {
  it('is a radio group: exactly one key, and picking another uses it', async () => {
    const { client, calls } = recorder({
      list: async () =>
        state({
          entries: [row({ ref: 'key-1', masked: 'sk-a...a1' }), row({ ref: 'key-2', masked: 'sk-b...b1', enabled: true })],
          enabledRef: 'key-2',
        }),
    })
    const panel = mount({ client })
    await flush()

    const radios = Array.from(panel.root.querySelectorAll<HTMLInputElement>('input.bre-keys-enabled'))
    expect(radios).toHaveLength(2)
    expect(radios.filter((radio) => radio.checked)).toHaveLength(1)

    radios[0]?.click()
    await flush()

    expect(calls.filter((call) => call.op === 'enable')).toEqual([{ op: 'enable', args: ['ofox', 'key-1'] }])
  })

  it('closes the row, so the choice reads as the row it applies to', async () => {
    const { client } = recorder({
      list: async () =>
        state({
          entries: [
            row({ ref: 'key-1', masked: 'sk-a...a1' }),
            row({ ref: 'key-2', alias: 'key2', masked: 'sk-b...b1', enabled: true }),
          ],
          enabledRef: 'key-2',
        }),
    })
    const panel = mount({ client })
    await flush()

    // Both row shapes — with an alias and without — end on the control, so the
    // choice is read once, at the point the row finishes saying what it offers.
    for (const name of ['sk-a...a1', 'key2']) {
      const line = rowOf(panel.root, name)
      expect(line.lastElementChild?.classList.contains('bre-keys-enable')).toBe(true)
      expect(line.querySelector('.bre-keys-enable-text')?.textContent).toBe('Enabled')
    }
    expect(rowOf(panel.root, 'key2').querySelector<HTMLInputElement>('input.bre-keys-enabled')?.checked).toBe(true)
  })
})

describe('the actions on a row', () => {
  it('offers exactly delete, label and edit — and nothing else', async () => {
    const { client } = recorder({ list: async () => state({ entries: [row({ ref: 'key-2', alias: 'key2' })] }) })
    const panel = mount({ client })
    await flush()

    expect(actionsOf(rowOf(panel.root, 'key2'))).toEqual(['Delete', 'Label', 'Edit'])
  })

  it('asks twice before deleting, and can be talked out of it', async () => {
    const { client, calls } = recorder({ list: async () => state({ entries: [row({ ref: 'key-2', alias: 'key2' })] }) })
    const panel = mount({ client })
    await flush()

    const line = rowOf(panel.root, 'key2')
    buttonByText(line, 'Delete').click()
    await flush()
    expect(actionsOf(line)).toEqual(['Confirm delete', 'Cancel'])

    buttonByText(line, 'Cancel').click()
    await flush()
    expect(actionsOf(line)).toEqual(['Delete', 'Label', 'Edit'])
    expect(calls.some((call) => call.op === 'remove')).toBe(false)

    buttonByText(line, 'Delete').click()
    await flush()
    buttonByText(line, 'Confirm delete').click()
    await flush()
    expect(calls.filter((call) => call.op === 'remove')).toEqual([{ op: 'remove', args: ['ofox', 'key-2'] }])
  })

  it('replaces the secret in place, under the row it edits', async () => {
    const { client, calls } = recorder({ list: async () => state({ entries: [row({ ref: 'key-2', alias: 'key2' })] }) })
    const panel = mount({ client })
    await flush()

    const line = rowOf(panel.root, 'key2')
    buttonByText(line, 'Edit').click()
    await flush()

    // In the list, directly under its own row: no dialog is opened, and nothing
    // is dispatched to the document body.
    const form = formRowOf(panel.root)
    expect(form).not.toBeNull()
    expect(line.nextElementSibling).toBe(form)
    expect(document.querySelector('.bre-key-layer')).toBeNull()
    expect(panel.root.contains(form)).toBe(true)

    // A replace touches the secret only, so the label field is not even there.
    const inputs = inputsOf(panel.root)
    expect(inputs).toHaveLength(1)
    expect(inputs[0]?.className).toContain('bre-keys-secret')
    expect(inputs[0]?.getAttribute('type')).toBe('password')
    expect(document.activeElement).toBe(inputs[0])

    if (inputs[0] !== undefined) type(inputs[0], 'sk-brand-new-key')
    await flush()
    buttonByText(form as HTMLElement, 'Save').click()
    await flush()

    expect(calls.filter((call) => call.op === 'replace')).toEqual([
      { op: 'replace', args: ['ofox', 'key-2', 'sk-brand-new-key'] },
    ])
    expect(formRowOf(panel.root)).toBeNull()
  })

  it('relabels from the label it already has, and can clear it', async () => {
    const listed = (alias: string | undefined) =>
      state({ entries: [row({ ref: 'key-2', alias, masked: 'sk-a...z9' })], enabledRef: 'key-2' })
    const { client, calls } = recorder({
      list: async () => listed('key2'),
      // Answer like the host does: the list it returns is what the rows follow.
      rename: async (_route, _ref, alias) => listed(alias),
    })
    const panel = mount({ client })
    await flush()

    buttonByText(rowOf(panel.root, 'key2'), 'Label').click()
    await flush()

    const inputs = inputsOf(panel.root)
    expect(inputs).toHaveLength(1)
    expect(inputs[0]?.className).toContain('bre-keys-name')
    // Prefilled: relabelling starts from the label in force, not from nothing.
    expect(inputs[0]?.value).toBe('key2')
    expect(inputs[0]?.getAttribute('placeholder')).toBe('Name (optional), e.g. Team')

    if (inputs[0] !== undefined) type(inputs[0], '  Team  ')
    await flush()
    buttonByText(formRowOf(panel.root) as HTMLElement, 'Save').click()
    await flush()
    // Normalised on the way out: trimmed.
    expect(calls.filter((call) => call.op === 'rename')).toEqual([{ op: 'rename', args: ['ofox', 'key-2', 'Team'] }])
    // The row follows the host's answer, not the draft, and says it saved.
    expect(rowOf(panel.root, 'Team').querySelector('.bre-keys-alias')?.textContent).toBe('Team')
    expect(panel.root.querySelector('.bre-status')?.textContent).toBe('Label saved.')

    buttonByText(rowOf(panel.root, 'Team'), 'Label').click()
    await flush()
    const again = inputsOf(panel.root)
    expect(again[0]?.value).toBe('Team')
    if (again[0] !== undefined) type(again[0], '')
    await flush()
    buttonByText(formRowOf(panel.root) as HTMLElement, 'Save').click()
    await flush()
    // An emptied field clears the label rather than storing an empty one, and the
    // row goes back to naming itself by its mask.
    expect(calls.filter((call) => call.op === 'rename')[1]).toEqual({ op: 'rename', args: ['ofox', 'key-2', undefined] })
    expect(rowOf(panel.root, 'sk-a...z9').querySelector('.bre-keys-alias')).toBeNull()
  })
})

describe('adding a key', () => {
  it('opens the form as the list’s own last item, not as a dialog', async () => {
    const panel = mount()
    await flush()

    // The entry is a row of the list, at the end of it.
    const addRow = panel.root.querySelector('.bre-keys-add-row')
    expect(addRow).not.toBeNull()
    expect(panel.root.querySelector('.bre-keys-list')?.lastElementChild).toBe(addRow)

    buttonByText(panel.root, 'Add another key').click()
    await flush()

    expect(panel.root.querySelector('.bre-keys-add-row')).toBeNull()
    const form = formRowOf(panel.root)
    expect(panel.root.querySelector('.bre-keys-list')?.lastElementChild).toBe(form)
    expect(panel.root.querySelectorAll('li')).toHaveLength(1)

    // Both fields are offered, and the secret is the one waiting for the paste.
    const inputs = inputsOf(panel.root)
    expect(inputs).toHaveLength(2)
    expect(inputs[0]?.className).toContain('bre-keys-name')
    expect(inputs[0]?.getAttribute('placeholder')).toBe('Name (optional), e.g. Team')
    expect(inputs[1]?.className).toContain('bre-keys-secret')
    expect(inputs[1]?.getAttribute('placeholder')).toBe('Paste the API key')
    expect(document.activeElement).toBe(inputs[1])
  })

  it('refuses a value the official card would refuse, before sending it', async () => {
    const { client, calls } = recorder()
    const panel = mount({ client })
    await flush()
    buttonByText(panel.root, 'Add another key').click()
    await flush()

    const form = formRowOf(panel.root) as HTMLElement
    const secret = inputsOf(panel.root)[1]
    if (secret === undefined) throw new Error('no secret field')
    type(secret, 'sk with a space')
    await flush()

    expect(form.textContent).toContain('A key is printable ASCII without spaces.')
    expect(buttonByText(form, 'Add').disabled).toBe(true)
    expect(calls.some((call) => call.op === 'add')).toBe(false)

    type(secret, 'sk-legal')
    await flush()
    expect(form.textContent).not.toContain('A key is printable ASCII without spaces.')
    expect(buttonByText(form, 'Add').disabled).toBe(false)
  })

  it('sends the value with the label that was typed', async () => {
    const { client, calls } = recorder()
    const panel = mount({ client })
    await flush()
    buttonByText(panel.root, 'Add another key').click()
    await flush()

    const inputs = inputsOf(panel.root)
    if (inputs[0] !== undefined) type(inputs[0], '  Team  ')
    if (inputs[1] !== undefined) type(inputs[1], 'sk-live-1234')
    await flush()
    buttonByText(formRowOf(panel.root) as HTMLElement, 'Add').click()
    await flush()

    expect(calls.filter((call) => call.op === 'add')).toEqual([{ op: 'add', args: ['ofox', 'sk-live-1234', 'Team'] }])
    // Stored: the form closes, the entry comes back, and the host's own line is
    // shown in the list's own notice.
    expect(formRowOf(panel.root)).toBeNull()
    expect(panel.root.querySelector('.bre-keys-add-row')).not.toBeNull()
    expect(panel.root.querySelector('.bre-status')?.textContent).toBe('Key stored.')
  })

  it('leaves the label out when only a value was given', async () => {
    const { client, calls } = recorder()
    const panel = mount({ client })
    await flush()
    buttonByText(panel.root, 'Add another key').click()
    await flush()

    const secret = inputsOf(panel.root)[1]
    if (secret !== undefined) type(secret, 'sk-live-1234')
    await flush()
    buttonByText(formRowOf(panel.root) as HTMLElement, 'Add').click()
    await flush()

    expect(calls.filter((call) => call.op === 'add')).toEqual([{ op: 'add', args: ['ofox', 'sk-live-1234', undefined] }])
  })

  it('keeps the form, and the value typed into it, when the host refuses', async () => {
    const { client } = recorder({ add: async () => ({ ok: false, error: 'that reference is taken' }) })
    const panel = mount({ client })
    await flush()
    buttonByText(panel.root, 'Add another key').click()
    await flush()

    const secret = inputsOf(panel.root)[1]
    if (secret !== undefined) type(secret, 'sk-live-1234')
    await flush()
    buttonByText(formRowOf(panel.root) as HTMLElement, 'Add').click()
    await flush()

    expect(formRowOf(panel.root)).not.toBeNull()
    expect(panel.root.querySelector('.bre-error')?.textContent).toBe('that reference is taken')
    expect(inputsOf(panel.root)[1]?.value).toBe('sk-live-1234')
  })

  it('can close the add form without adding anything', async () => {
    const { client, calls } = recorder()
    const panel = mount({ client })
    await flush()
    buttonByText(panel.root, 'Add another key').click()
    await flush()

    buttonByText(formRowOf(panel.root) as HTMLElement, 'Cancel').click()
    await flush()

    expect(formRowOf(panel.root)).toBeNull()
    expect(panel.root.querySelector('.bre-keys-add-row')).not.toBeNull()
    expect(calls.some((call) => call.op === 'add')).toBe(false)
  })
})

describe('refusals', () => {
  it('keeps the list it already had when a write is refused', async () => {
    const { client } = recorder({
      list: async () => state({ entries: [row({ ref: 'key-2', alias: 'key2' })], enabledRef: 'key-2' }),
      remove: async () => ({ ok: false, error: 'the settings document kept changing; try again' }),
    })
    const panel = mount({ client })
    await flush()

    const line = rowOf(panel.root, 'key2')
    buttonByText(line, 'Delete').click()
    await flush()
    buttonByText(line, 'Confirm delete').click()
    await flush()

    expect(panel.root.querySelectorAll('.bre-keys-row')).toHaveLength(1)
    expect(panel.root.querySelector('.bre-error')?.textContent).toBe('the settings document kept changing; try again')
  })

  it('falls back to its own wording when the host sent none', async () => {
    const { client } = recorder({
      list: async () => state({ entries: [row({ ref: 'key-2', alias: 'key2' })] }),
      remove: async () => ({ ok: false }),
    })
    const panel = mount({ client })
    await flush()

    const line = rowOf(panel.root, 'key2')
    buttonByText(line, 'Delete').click()
    await flush()
    buttonByText(line, 'Confirm delete').click()
    await flush()

    expect(panel.root.querySelector('.bre-error')?.textContent).toBe('The plugin’s key route did not answer.')
  })

  it('reports an unreachable list without pretending the provider has no keys', async () => {
    const { client } = recorder({ list: async () => ({ ok: false, error: 'no route' }) })
    const panel = mount({ client })
    await flush()

    expect(panel.root.querySelector('.bre-keys-add-row')).not.toBeNull()
    expect(panel.root.querySelector('.bre-error')?.textContent).toBe('no route')
  })
})

describe('the read-only list', () => {
  it('shows nothing that writes while the host is mid-flight', async () => {
    let release: ((answer: KeyAnswer) => void) | undefined
    const { client } = recorder({
      list: () =>
        new Promise<KeyAnswer>((resolve) => {
          release = resolve
        }),
    })
    const panel = mount({ client })
    expect(panel.root.textContent).toContain('Loading keys…')

    release?.(state({ entries: [row({ ref: 'key-2', alias: 'key2' })] }))
    await flush()
    expect(panel.root.textContent).toContain('key2')
  })
})
