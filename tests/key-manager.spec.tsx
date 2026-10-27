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
  keysEnable: 'Enable {name}',
  keysDisable: 'Disable {name}',
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
  keysModels: 'Models',
  keysScopeAll: 'All models',
  keysScopeNone: 'No models found',
  keysScopeCount: '{count} models',
  keysScopeSaved: 'Models saved.',
  keysScopePlaceholder: 'Model ids, comma separated',
  keysScopeHint: 'Only the ticked models use this key.',
  keysScopeEmpty: 'No models discovered yet.',
  keysDiscover: 'Detect models',
  keysDiscoverHint: 'Probe each key for the models it can reach.',
  keysDiscovered: 'Detected models for {count} keys.',
  keysProtocolLabel: 'Protocol for {name}',
  keysProtocolDefault: 'Default protocol',
  keysProtocolDefaultHint: 'Follows the provider’s own protocol.',
  keysProtocolAny: 'Any protocol',
  keysProtocolAnthropic: 'Anthropic',
  keysProtocolAnthropicHint: 'Anthropic API · Claude models',
  keysProtocolOpenAI: 'Chat Completions',
  keysProtocolOpenAIHint: 'OpenAI API · GPT models, most agents',
  keysProtocolResponses: 'Responses',
  keysProtocolResponsesHint: 'OpenAI API · Codex',
  keysProtocolSaved: 'Protocol saved.',
  keysOpenAIUrl: 'OpenAI base URL',
  keysAnthropicUrl: 'Anthropic base URL',
  keysEndpointPlaceholder: 'https://…',
  keysEndpointsSaved: 'Base URLs saved.',
  keysUnreachable: 'The plugin’s key route did not answer.',
  keysPanelFailed: 'Key manager failed to render',
  keysDraftHint: 'Held by this page and stored when the provider is created.',
}

const t = (key: string, params?: Record<string, string | number>): string => {
  const text = COPY[key] ?? key
  if (params === undefined) return text
  return Object.entries(params).reduce((carried, [name, value]) => carried.replace(`{${name}}`, String(value)), text)
}

function state(over: Partial<KeyState> = {}): KeyState {
  return { ok: true, route: 'ofox', entries: [], endpoints: { openai: null, anthropic: null }, ...over }
}

function row(over: Partial<KeyRow> & { ref: string }): KeyRow {
  return { enabled: true, configured: true, ...over }
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
    rename: async () => state(),
    replace: async () => state(),
    remove: async () => state(),
    setScope: async () => state(),
    setEnabled: async () => state(),
    setProtocol: async () => state(),
    setEndpoints: async () => state(),
    reveal: async () => undefined,
    ...script,
  }
  const client: KeyManagerClient = {
    cached: route => base.cached?.(route),
    list: (route) => {
      calls.push({ op: 'list', args: [route] })
      return base.list(route)
    },
    add: (route, value, alias) => {
      calls.push({ op: 'add', args: [route, value, alias] })
      return base.add(route, value, alias)
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
    setScope: (route, ref, models) => {
      calls.push({ op: 'setScope', args: [route, ref, models] })
      return base.setScope(route, ref, models)
    },
    setEnabled: (route, ref, enabled) => {
      calls.push({ op: 'setEnabled', args: [route, ref, enabled] })
      return base.setEnabled(route, ref, enabled)
    },
    setProtocol: (route, ref, protocol) => {
      calls.push({ op: 'setProtocol', args: [route, ref, protocol] })
      return base.setProtocol(route, ref, protocol)
    },
    setEndpoints: (route, openai, anthropic) => {
      calls.push({ op: 'setEndpoints', args: [route, openai, anthropic] })
      return base.setEndpoints(route, openai, anthropic)
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

/** The action links on a row — the picker is a control, not one of them. */
function actionsOf(row: HTMLElement): string[] {
  return Array.from(row.querySelectorAll<HTMLElement>('.bre-keys-actions .bre-link-button')).map(
    (button) => button.textContent ?? '',
  )
}

/** The values the open protocol menu offers, in its own order. */
function menuValues(): string[] {
  return Array.from(document.querySelectorAll('.bre-protocol-menu .bre-protocol-option')).map(
    (option) => option.getAttribute('data-protocol-value') ?? '',
  )
}

function formRowOf(root: HTMLElement): HTMLElement | null {
  return root.querySelector<HTMLElement>('.bre-keys-form-row')
}

function inputsOf(root: HTMLElement): HTMLInputElement[] {
  const form = formRowOf(root)
  if (form === null) throw new Error('no form is open')
  return Array.from(form.querySelectorAll('input'))
}

/** The chips in the open form, in the order they are drawn. */
function chipsOf(root: HTMLElement): HTMLButtonElement[] {
  const form = formRowOf(root)
  if (form === null) throw new Error('no form is open')
  return Array.from(form.querySelectorAll<HTMLButtonElement>('.bre-keys-chip'))
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
  it('paints cached keys immediately and refreshes them when the read completes', async () => {
    let finish!: (answer: KeyAnswer) => void
    const { client, calls } = recorder({
      cached: () => state({ entries: [row({ ref: 'A', alias: 'Cached' })] }),
      list: () => new Promise(resolve => { finish = resolve }),
    })
    const panel = mount({ client })
    expect(rowOf(panel.root, 'Cached')).toBeDefined()
    expect(panel.root.querySelector('[aria-busy="true"]')).toBeNull()
    await flush()
    expect(calls.filter(call => call.op === 'list')).toHaveLength(1)
    finish(state({ entries: [row({ ref: 'B', alias: 'Fresh' })] }))
    await flush()
    expect(rowOf(panel.root, 'Fresh')).toBeDefined()
    expect(panel.root.textContent).not.toContain('Cached')
  })

  it('shows a loading status on first open and then shows the host list', async () => {
    const { client } = recorder({ list: async () => state({ entries: [row({ ref: 'A' })] }) })
    const panel = mount({ client })
    expect(panel.root.querySelector('[role="status"]')?.textContent).toBe('Loading keys…')
    expect(panel.root.querySelector('.bre-keys')?.getAttribute('aria-busy')).toBe('true')
    expect(panel.root.querySelectorAll('.bre-keys-row')).toHaveLength(0)
    expect(panel.root.querySelector('.bre-keys-add-row')).toBeNull()

    await flush()
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

  it('marks a missing key as such, and opens every row with its enable check', async () => {
    const { client } = recorder({
      list: async () =>
        state({
          entries: [
            row({ ref: 'A', configured: false, masked: 'sk-a...a1', models: ['glm-4'] }),
            row({ ref: 'B', configured: true, masked: 'sk-b...b1' }),
          ],
        }),
    })
    const panel = mount({ client })
    await flush()

    const missing = rowOf(panel.root, 'sk-a...a1')
    const ready = rowOf(panel.root, 'sk-b...b1')
    expect(missing.dataset['state']).toBe('missing')
    expect(ready.dataset['state']).toBe('ready')
    // Every row is in use until switched off, so both checks are lit. The scope
    // rides on its own action button — its label IS the summary, so there is no
    // separate text beside the key any more.
    expect(missing.querySelector('.bre-keys-default')).toBeNull()
    expect(missing.querySelector('.bre-keys-toggle')?.getAttribute('aria-pressed')).toBe('true')
    expect(ready.querySelector('.bre-keys-toggle')?.getAttribute('aria-pressed')).toBe('true')
    expect(buttonByText(missing, '1 models').className).toContain('bre-link-button')
    expect(buttonByText(ready, 'All models').className).toContain('bre-link-button')
    expect(panel.root.querySelector('.bre-keys-scope-label')).toBeNull()
  })
})

describe('the row status', () => {
  it('paints no state word on any row — the row’s space belongs to the name', async () => {
    const { client } = recorder({
      list: async () =>
        state({
          entries: [
            row({ ref: 'A', masked: 'sk-a...a1', models: ['glm-4'] }),
            row({ ref: 'B', masked: 'sk-b...b1', models: ['glm-4'], rest: { remainingMs: 42_000, failures: 2 } }),
            row({ ref: 'C', masked: 'sk-c...c1', models: ['glm-4'], enabled: false }),
            row({ ref: 'D', masked: 'sk-d...d1' }),
          ],
        }),
    })
    const panel = mount({ client })
    await flush()

    // No row paints a status badge, whatever the pool thinks of it — healthy,
    // unprobed, resting or switched off: none is a finding the row owes a word
    // to, and the row's space belongs to the name (状态都移除：东西多了，别名
    // 被省略).
    expect(panel.root.querySelectorAll('.bre-keys-state')).toHaveLength(0)
    for (const name of ['sk-a...a1', 'sk-b...b1', 'sk-c...c1', 'sk-d...d1']) {
      expect(rowOf(panel.root, name).querySelector('.bre-keys-actions')).not.toBeNull()
    }
  })
})

describe('the scope chips', () => {
  it('offers only the models the provider has added', async () => {
    const { client } = recorder({
      list: async () =>
        state({
          entries: [row({ ref: 'A', alias: 'a', masked: 'sk-a...a1' })],
          models: ['qwen-max', 'glm-4-air'],
        }),
    })
    const panel = mount({ client })
    await flush()

    buttonByText(rowOf(panel.root, 'a'), 'All models').click()
    await flush()

    const chips = Array.from(panel.root.querySelectorAll('.bre-keys-chip')).map(chip => chip.textContent?.trim())
    expect(chips).toEqual(['glm-4-air', 'qwen-max'])
  })
})

describe('the enable check and model scope', () => {
  it('switches a key into and out of use from the circular check on its row', async () => {
    const { client, calls } = recorder({
      list: async () =>
        state({
          entries: [
            row({ ref: 'key-1', masked: 'sk-a...a1' }),
            // A key the host says is switched off: grey check, dimmed row.
            row({ ref: 'key-2', masked: 'sk-b...b1', enabled: false }),
          ],
        }),
    })
    const panel = mount({ client })
    await flush()

    const on = rowOf(panel.root, 'sk-a...a1')
    const off = rowOf(panel.root, 'sk-b...b1')
    expect(on.className).not.toContain('is-off')
    expect(off.className).toContain('is-off')
    const onCheck = on.querySelector<HTMLButtonElement>('.bre-keys-toggle')
    const offCheck = off.querySelector<HTMLButtonElement>('.bre-keys-toggle')
    expect(onCheck?.getAttribute('aria-pressed')).toBe('true')
    expect(offCheck?.getAttribute('aria-pressed')).toBe('false')
    // 圆圈加对勾：勾画在标记里，未选中的那份由样式藏掉（jsdom 不套样式，
    // 这里钉住的是"每个开关一枚勾"的结构）；on 行还是"最后一把启用中的
    // 密钥"，它的开关直接站开，而不是等宿主拒绝。
    expect(onCheck?.querySelectorAll('.bre-keys-toggle-mark svg')).toHaveLength(1)
    expect(offCheck?.querySelectorAll('.bre-keys-toggle-mark svg')).toHaveLength(1)
    expect(onCheck?.disabled).toBe(true)
    expect(offCheck?.disabled).toBe(false)

    // Clicking the grey check switches the key back into use; the label names
    // the ACTION, so a lit check offers "Disable" and a grey one "Enable".
    expect(offCheck?.getAttribute('aria-label')).toBe('Enable sk-b...b1')
    offCheck?.click()
    await flush()
    expect(calls.filter((call) => call.op === 'setEnabled')).toEqual([
      { op: 'setEnabled', args: ['ofox', 'key-2', true] },
    ])
  })

  it('frees the check once a second key shares the pool, and stands it down again on the last one', async () => {
    // The scripted answer mutates: the list the host returns after each toggle
    // is the list the rows re-render from, so the check's availability follows
    // the pool the way it does live.
    const entries: KeyRow[] = [
      row({ ref: 'key-1', masked: 'sk-a...a1' }),
      row({ ref: 'key-2', masked: 'sk-b...b1' }),
    ]
    const { client } = recorder({
      list: async () => state({ entries: [...entries] }),
      setEnabled: async (_route, ref, enabled) => {
        entries.forEach((entry) => {
          if (entry.ref === ref) (entry as { enabled: boolean }).enabled = enabled
        })
        return state({ entries: [...entries] })
      },
    })
    const panel = mount({ client })
    await flush()

    // Two enabled keys: either check may be clicked.
    const first = rowOf(panel.root, 'sk-a...a1').querySelector<HTMLButtonElement>('.bre-keys-toggle')
    const second = rowOf(panel.root, 'sk-b...b1').querySelector<HTMLButtonElement>('.bre-keys-toggle')
    expect(first?.disabled).toBe(false)
    expect(second?.disabled).toBe(false)

    first?.click()
    await flush()

    // One enabled key left: ITS check stands down (it is the last enabled one);
    // the benched row's stays clickable — switching it back in is always allowed.
    expect(rowOf(panel.root, 'sk-a...a1').querySelector<HTMLButtonElement>('.bre-keys-toggle')?.disabled).toBe(false)
    expect(rowOf(panel.root, 'sk-b...b1').querySelector<HTMLButtonElement>('.bre-keys-toggle')?.disabled).toBe(true)
  })

  it('offers the model scope on every row', async () => {
    const { client, calls } = recorder({
      list: async () =>
        state({
          // The universe a scope is chosen from is the route's own added models —
          // never the provider's whole catalog.
          models: ['glm-4', 'glm-4-flash', 'glm-4-air'],
          entries: [
            row({ ref: 'key-1', masked: 'sk-a...a1' }),
            row({ ref: 'key-2', masked: 'sk-b...b1', models: ['glm-4', 'glm-4-flash'] }),
          ],
        }),
    })
    const panel = mount({ client })
    await flush()

    expect(rowOf(panel.root, 'sk-a...a1').querySelector('.bre-keys-scope-label')).toBeNull()
    expect(buttonByText(rowOf(panel.root, 'sk-b...b1'), '2 models').className).toContain('bre-link-button')

    // The scope editor opens under the row it edits, as chips of the route's
    // added models, with the row's current scope already ticked.
    buttonByText(rowOf(panel.root, 'sk-b...b1'), '2 models').click()
    await flush()
    const chips = Array.from((formRowOf(panel.root) as HTMLElement).querySelectorAll<HTMLButtonElement>('.bre-keys-chip'))
    expect(chips.map((chip) => chip.textContent)).toEqual(['glm-4', 'glm-4-air', 'glm-4-flash'])
    expect(chips.map((chip) => chip.getAttribute('aria-pressed'))).toEqual(['true', 'false', 'true'])

    // Untick one and save: only the remaining ticked model is sent.
    buttonByText(formRowOf(panel.root) as HTMLElement, 'glm-4-flash').click()
    await flush()
    buttonByText(formRowOf(panel.root) as HTMLElement, 'Save').click()
    await flush()
    expect(calls.filter((call) => call.op === 'setScope')).toEqual([
      { op: 'setScope', args: ['ofox', 'key-2', ['glm-4']] },
    ])
  })

  it('clears a scope to the catch-all when no model stays ticked', async () => {
    const { client, calls } = recorder({
      list: async () =>
        state({ models: ['glm-4'], entries: [row({ ref: 'key-2', masked: 'sk-a...a1', models: ['glm-4'] })] }),
    })
    const panel = mount({ client })
    await flush()

    buttonByText(rowOf(panel.root, 'sk-a...a1'), '1 models').click()
    await flush()
    // The "all models" shortcut empties the selection; saving then clears it.
    buttonByText(formRowOf(panel.root) as HTMLElement, 'All models').click()
    await flush()
    buttonByText(formRowOf(panel.root) as HTMLElement, 'Save').click()
    await flush()
    expect(calls.filter((call) => call.op === 'setScope')).toEqual([
      { op: 'setScope', args: ['ofox', 'key-2', undefined] },
    ])
  })
})

describe('the actions on a row', () => {
  it('places delete last after label, models and edit', async () => {
    const { client } = recorder({ list: async () => state({ entries: [row({ ref: 'key-2', alias: 'key2' })] }) })
    const panel = mount({ client })
    await flush()

    expect(actionsOf(rowOf(panel.root, 'key2'))).toEqual(['Label', 'All models', 'Edit', 'Delete'])
  })

  it('keeps the protocol picker inside the hover action tray, defaulting to the route', async () => {
    const { client, calls } = recorder({
      list: async () =>
        state({
          entries: [row({ ref: 'key-2', alias: 'key2' })],
          endpoints: { openai: null, anthropic: 'https://anthropic.example' },
        }),
    })
    const panel = mount({ client })
    await flush()

    const line = rowOf(panel.root, 'key2')
    // The picker is part of the hover-revealed action tray, not a control sitting
    // on the resting row where it would always show.
    const picker = line.querySelector<HTMLButtonElement>('.bre-keys-actions .bre-keys-protocol')
    expect(picker).not.toBeNull()
    expect(line.querySelector(':scope > .bre-keys-protocol')).toBeNull()
    // It wears its own chevron, and reads as the value in force.
    expect(line.querySelector('.bre-keys-protocol-caret')?.textContent).toBe('›')
    expect(picker?.querySelector('.bre-keys-protocol-label')?.textContent).toBe('Default protocol')
    expect(picker?.getAttribute('aria-haspopup')).toBe('listbox')

    if (picker === null) throw new Error('no protocol picker')
    picker.click()
    await flush()

    // The menu is drawn on <body>, beside the name of each protocol a line that
    // says what it is for — the reason this is not a native select. Only the
    // families with an address are on the list.
    const menu = document.querySelector<HTMLElement>('.bre-protocol-menu')
    expect(menu).not.toBeNull()
    expect(menu?.querySelector('.bre-protocol-menu-title')?.textContent).toBe('Protocol for key2')
    const options = Array.from(menu?.querySelectorAll<HTMLButtonElement>('.bre-protocol-option') ?? [])
    expect(options.map((option) => option.getAttribute('data-protocol-value'))).toEqual(['', 'anthropic-messages'])
    expect(options.map((option) => option.querySelector('.bre-protocol-option-title')?.textContent)).toEqual([
      'Default protocol',
      'Anthropic',
    ])
    expect(options.map((option) => option.querySelector('.bre-protocol-option-hint')?.textContent)).toEqual([
      'Follows the provider’s own protocol.',
      'Anthropic API · Claude models',
    ])
    // The choice in force is worn as a tint, never a tick: a tick would widen
    // the selected row and shift the list under the pointer as it is clicked.
    expect(options.map((option) => option.getAttribute('aria-selected'))).toEqual(['true', 'false'])
    expect(options[0].querySelector('.bre-protocol-option-mark')).toBeNull()
    expect(options[1].querySelector('.bre-protocol-option-mark')).toBeNull()

    options[1].click()
    await flush()
    expect(calls.filter((call) => call.op === 'setProtocol')).toEqual([
      { op: 'setProtocol', args: ['ofox', 'key-2', 'anthropic-messages'] },
    ])
    // Picking closes the menu.
    expect(document.querySelector('.bre-protocol-menu')).toBeNull()
  })

  it('closes the protocol menu on Escape and on an outside press', async () => {
    const { client } = recorder({ list: async () => state({ entries: [row({ ref: 'key-2', alias: 'key2' })] }) })
    const panel = mount({ client })
    await flush()

    const picker = rowOf(panel.root, 'key2').querySelector<HTMLButtonElement>('.bre-keys-protocol')
    if (picker === null) throw new Error('no protocol picker')

    picker.click()
    await flush()
    expect(document.querySelector('.bre-protocol-menu')).not.toBeNull()
    // Escape arrives from the focused option, which is where the menu puts focus.
    const focused = document.activeElement
    if (focused === null) throw new Error('the menu focused nothing')
    focused.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
    await flush()
    expect(document.querySelector('.bre-protocol-menu')).toBeNull()

    picker.click()
    await flush()
    expect(document.querySelector('.bre-protocol-menu')).not.toBeNull()
    document.body.dispatchEvent(new Event('pointerdown', { bubbles: true }))
    await flush()
    expect(document.querySelector('.bre-protocol-menu')).toBeNull()
  })

  it('offers only the protocols whose address the provider configured', async () => {
    // User item 3: a pinned key signs against ITS family's URL, so a family with
    // no address is not a choice — only the default remains.
    const { client } = recorder({
      list: async () => state({ entries: [row({ ref: 'key-2', alias: 'key2' })] }),
    })
    const panel = mount({ client })
    await flush()

    const picker = rowOf(panel.root, 'key2').querySelector<HTMLButtonElement>('.bre-keys-protocol')
    if (picker === null) throw new Error('no protocol picker')
    expect(picker.disabled).toBe(false)
    picker.click()
    await flush()
    expect(menuValues()).toEqual([''])
  })

  it('offers the families that have an address, and keeps a pin that lost its own', async () => {
    const { client } = recorder({
      list: async () =>
        state({
          entries: [row({ ref: 'key-2', alias: 'key2', protocol: 'anthropic-messages' }), row({ ref: 'key-3', alias: 'key3' })],
          endpoints: { openai: 'https://openai.example/v1', anthropic: null },
        }),
    })
    const panel = mount({ client })
    await flush()

    const values = async (ref: string) => {
      const picker = rowOf(panel.root, ref).querySelector<HTMLButtonElement>('.bre-keys-protocol')
      if (picker === null) throw new Error('no protocol picker')
      picker.click()
      await flush()
      const offered = menuValues()
      picker.click()
      await flush()
      return offered
    }
    // Only the OpenAI family has an address, so only its two wires are on offer.
    expect(await values('key3')).toEqual(['', 'openai-completions', 'openai-responses'])
    // The pinned key keeps its own protocol even though that family has no address
    // any more: the row must not come back reading as "Default protocol". It sits
    // last because the offered families come first, in the picker's own order.
    expect(await values('key2')).toEqual(['', 'openai-completions', 'openai-responses', 'anthropic-messages'])
  })

  it('re-reads the addresses when the provider card reports a change', async () => {
    // The card above owns the two base URLs and this list decides its offers from
    // them, so a change there has to reach this list without a reload.
    let endpoints: KeyState['endpoints'] = { openai: null, anthropic: null }
    const { client } = recorder({
      list: async () => state({ entries: [row({ ref: 'key-2', alias: 'key2' })], endpoints }),
    })
    const panel = mount({ client })
    await flush()

    const values = async () => {
      const picker = rowOf(panel.root, 'key2').querySelector<HTMLButtonElement>('.bre-keys-protocol')
      if (picker === null) throw new Error('no protocol picker')
      picker.click()
      await flush()
      const offered = menuValues()
      picker.click()
      await flush()
      return offered
    }
    expect(await values()).toEqual([''])

    endpoints = { openai: 'https://openai.example/v1', anthropic: null }
    document.dispatchEvent(new CustomEvent('bre:endpoints-changed', { detail: { route: 'ofox', openai: 'https://openai.example/v1', anthropic: '' } }))
    await flush()

    expect(await values()).toEqual(['', 'openai-completions', 'openai-responses'])
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
    expect(actionsOf(line)).toEqual(['Label', 'All models', 'Edit', 'Delete'])
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
      state({ entries: [row({ ref: 'key-2', alias, masked: 'sk-a...z9' })] })
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

  it('carries the protocol chosen in the form onto the key it just created', async () => {
    const { client, calls } = recorder({
      list: async () =>
        state({
          entries: [],
          // Both families have an address, so all three wires are on offer:
          // the pin chips follow the addresses the provider actually holds.
          endpoints: {
            openai: 'https://openai.example/v1',
            anthropic: 'https://anthropic.example/v1',
          },
        }),
      add: async () => state({ entries: [row({ ref: 'key-2' })] }),
    })
    const panel = mount({ client })
    await flush()
    buttonByText(panel.root, 'Add another key').click()
    await flush()

    // The chips under the secret name the wires a new key may pin, automatic
    // first, in the order the menu is read.
    expect(chipsOf(panel.root).map((chip) => chip.textContent)).toEqual([
      'Default protocol',
      'Chat Completions',
      'Responses',
      'Anthropic',
    ])
    expect(chipsOf(panel.root).map((chip) => chip.getAttribute('aria-pressed'))).toEqual([
      'true',
      'false',
      'false',
      'false',
    ])

    chipsOf(panel.root)[2]?.click()
    await flush()
    expect(chipsOf(panel.root).map((chip) => chip.getAttribute('aria-pressed'))).toEqual([
      'false',
      'false',
      'true',
      'false',
    ])
    // A tint says which chip is chosen; no tick is drawn, so no chip changes
    // width as the choice moves.
    expect(chipsOf(panel.root)[2]?.className).toContain('is-selected')
    expect(chipsOf(panel.root)[0]?.querySelector('.bre-keys-chip-mark')).toBeNull()

    const secret = inputsOf(panel.root)[1]
    if (secret !== undefined) type(secret, 'sk-live-1234')
    await flush()
    buttonByText(formRowOf(panel.root) as HTMLElement, 'Add').click()
    await flush()

    expect(calls.filter((call) => call.op === 'add')).toEqual([{ op: 'add', args: ['ofox', 'sk-live-1234', undefined] }])
    // The pin rides the create: the reference the host just minted is told the
    // wire the form showed, in the same gesture.
    expect(calls.filter((call) => call.op === 'setProtocol')).toEqual([
      { op: 'setProtocol', args: ['ofox', 'key-2', 'openai-responses'] },
    ])
  })

  it('pins the exact reused key even when every returned reference was already listed', async () => {
    const entries = [row({ ref: 'SPARE', alias: 'Spare' }), row({ ref: 'ACTIVE', alias: 'Active' })]
    const endpoints = { openai: 'https://openai.example/v1', anthropic: null }
    const { client, calls } = recorder({
      list: async () => state({ entries, endpoints }),
      add: async () => state({ entries, endpoints, addedRef: 'ACTIVE' }),
      setProtocol: async () => state({ entries, endpoints }),
    })
    const panel = mount({ client })
    await flush()
    buttonByText(panel.root, 'Add another key').click()
    await flush()
    chipsOf(panel.root)[2]?.click()
    const secret = inputsOf(panel.root)[1]
    if (secret === undefined) throw new Error('no secret field')
    type(secret, 'sk-active')
    await flush()
    buttonByText(formRowOf(panel.root) as HTMLElement, 'Add').click()
    await flush()

    expect(calls.filter(call => call.op === 'setProtocol')).toEqual([
      { op: 'setProtocol', args: ['ofox', 'ACTIVE', 'openai-responses'] },
    ])
    expect(formRowOf(panel.root)).toBeNull()
  })

  it('keeps a successful add when pinning fails and retries through the row without adding again', async () => {
    const added = row({ ref: 'NEW', alias: 'New key', masked: 'sk-n...ew' })
    const endpoints = { openai: 'https://openai.example/v1', anthropic: null }
    let failPin = true
    const { client, calls } = recorder({
      list: async () => state({ entries: [], endpoints }),
      add: async () => state({ entries: [added], endpoints, addedRef: 'NEW' }),
      setProtocol: async () => failPin
        ? { ok: false, error: 'protocol write refused' }
        : state({ entries: [{ ...added, protocol: 'openai-responses' }], endpoints }),
    })
    const panel = mount({ client })
    await flush()
    buttonByText(panel.root, 'Add another key').click()
    await flush()
    chipsOf(panel.root)[2]?.click()
    const secret = inputsOf(panel.root)[1]
    if (secret === undefined) throw new Error('no secret field')
    type(secret, 'sk-new')
    await flush()
    buttonByText(formRowOf(panel.root) as HTMLElement, 'Add').click()
    await flush()

    expect(rowOf(panel.root, 'New key')).not.toBeNull()
    expect(formRowOf(panel.root)).toBeNull()
    expect(panel.root.querySelector('input[type="password"]')).toBeNull()
    expect(panel.root.querySelector('.bre-error')?.textContent).toBe('protocol write refused')
    failPin = false
    const picker = rowOf(panel.root, 'New key').querySelector<HTMLButtonElement>('.bre-keys-protocol')
    if (picker === null) throw new Error('no protocol picker')
    picker.click()
    await flush()
    const option = document.querySelector<HTMLButtonElement>('[data-protocol-value="openai-responses"]')
    if (option === null) throw new Error('no Responses option')
    option.click()
    await flush()
    expect(calls.filter(call => call.op === 'add')).toHaveLength(1)
    expect(calls.filter(call => call.op === 'setProtocol')).toHaveLength(2)
    expect(panel.root.querySelector('.bre-error')).toBeNull()
    expect(rowOf(panel.root, 'New key').querySelector('.bre-keys-protocol-label')?.textContent).toBe('Responses')
  })

  it('creates the key without a pin when the automatic chip stays chosen', async () => {
    const { client, calls } = recorder({
      list: async () => state({ entries: [] }),
      add: async () => state({ entries: [row({ ref: 'key-2' })] }),
    })
    const panel = mount({ client })
    await flush()
    buttonByText(panel.root, 'Add another key').click()
    await flush()

    const secret = inputsOf(panel.root)[1]
    if (secret !== undefined) type(secret, 'sk-live-1234')
    await flush()
    buttonByText(formRowOf(panel.root) as HTMLElement, 'Add').click()
    await flush()

    expect(calls.filter((call) => call.op === 'add')).toHaveLength(1)
    // Automatic is the absence of a pin, not a pin to '' — nothing is written.
    expect(calls.filter((call) => call.op === 'setProtocol')).toEqual([])
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
      list: async () => state({ entries: [row({ ref: 'key-2', alias: 'key2' })] }),
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
    // Nothing that writes is offered until the list answers: no rows, and no
    // "add" entry either — a control whose write would race the read the host is
    // still running would be the only thing on screen while the panel is empty.
    expect(panel.root.querySelector('.bre-keys')?.textContent).toBe('Loading keys…')
    expect(panel.root.querySelectorAll('.bre-keys-row')).toHaveLength(0)
    expect(panel.root.querySelector('.bre-keys-add-row')).toBeNull()

    release?.(state({ entries: [row({ ref: 'key-2', alias: 'key2' })] }))
    await flush()
    expect(panel.root.textContent).toContain('key2')
  })
})

describe('the draft list (the create card)', () => {
  it('paints no state on its rows — the list’s own note says the waiting — and a switched-off row still reads as off', async () => {
    const { client } = recorder({
      list: async () =>
        state({
          entries: [
            row({ ref: 'key-1', masked: 'sk-a...z9' }),
            row({ ref: 'key-2', masked: 'sk-b...y8', enabled: false }),
          ],
        }),
    })
    const panel = mount({ client, draft: true })
    await flush()

    // No row paints a state word: waiting is the whole list's condition, said
    // once by the note below it, and a switched-off row reads as the dimmed
    // row it is (状态都移除：东西多了，别名被省略).
    expect(panel.root.querySelectorAll('.bre-keys-state')).toHaveLength(0)
    expect(rowOf(panel.root, 'sk-b...y8').classList.contains('is-off')).toBe(true)
    // The one line that tells a draft list what it is.
    expect(panel.root.querySelector('.bre-keys-note')?.textContent).toBe(COPY.keysDraftHint)
  })

  it('offers no model-scope action — the provider has no models to pick from', async () => {
    const { client } = recorder({
      list: async () => state({ entries: [row({ ref: 'key-1', masked: 'sk-a...z9' })], models: ['glm-4.6'] }),
    })
    const panel = mount({ client, draft: true })
    await flush()

    const theRow = rowOf(panel.root, 'sk-a...z9')
    expect(actionsOf(theRow)).not.toContain(COPY.keysScopeAll)
    // The edit-side list, same answer, keeps the action.
    const editPanel = mount({ client })
    await flush()
    expect(actionsOf(rowOf(editPanel.root, 'sk-a...z9'))).toContain(COPY.keysScopeAll)
  })

  it('offers every protocol: the address a pin rides is the card’s own Base URL', async () => {
    const { client } = recorder({
      list: async () => state({ entries: [row({ ref: 'key-1', masked: 'sk-a...z9' })] }),
    })
    const panel = mount({ client, draft: true })
    await flush()

    rowOf(panel.root, 'sk-a...z9').querySelector<HTMLButtonElement>('.bre-keys-protocol')?.click()
    await flush()

    // Auto plus all three pins, even though no endpoint family is configured,
    // in the order the picker reads: the two OpenAI wires, then Anthropic.
    expect(menuValues()).toEqual([
      '',
      'openai-completions',
      'openai-responses',
      'anthropic-messages',
    ])
  })

  it('opens its key form by itself — a card with no key still has its one field', async () => {
    const { client } = recorder({ list: async () => state({ entries: [] }) })
    const panel = mount({ client, draft: true })
    await flush()

    expect(formRowOf(panel.root)).not.toBeNull()
    // Closing it stays closed: the unfolded form is a mount-time default, not a
    // mode the list keeps pushing back open.
    buttonByText(panel.root, COPY.keysCancel).click()
    await flush()
    expect(formRowOf(panel.root)).toBeNull()
    expect(panel.root.querySelector('.bre-keys-add-row')).not.toBeNull()
  })
})
