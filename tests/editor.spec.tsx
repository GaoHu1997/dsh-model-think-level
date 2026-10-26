/**
 * EffortEditor render-level tests: the component's visible behavior over a
 * real React root in jsdom — armed level pills, suggestion labeling, failure
 * surfacing, and busy-state disabling. The pure draft/intent rules are
 * covered by effort.spec.ts; this file covers what only exists rendered.
 */

// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act } from 'react'
import { createElement } from 'react'
import { createRoot } from 'react-dom/client'
import type { Root } from 'react-dom/client'
import { EffortEditor, type EffortEditorProps } from '../src/client/EffortEditor.js'
import type { SuggestReply, WriteEffortsReply, EffortEditorApi } from '../src/client/types.js'
import { requestAutoEffort } from '../src/client/auto-effort.js'
import { en } from '../src/client/locales.js'
import type { ReasoningEfforts } from '../src/knowledge.js'

;(globalThis as Record<string, unknown>)['IS_REACT_ACT_ENVIRONMENT'] = true

/** The shell's Translate face, approximated with the en dictionary. */
const t = (key: string, params?: Record<string, string | number>): string => {
  let text = (en as Record<string, string>)[key] ?? key
  for (const [name, value] of Object.entries(params ?? {})) {
    text = text.replaceAll(`{${String(name)}}`, String(value))
  }
  return text
}

function baseApi(): EffortEditorApi & {
  suggest: ReturnType<typeof vi.fn>
  commit: ReturnType<typeof vi.fn>
  withdraw: ReturnType<typeof vi.fn>
  fillCapacities: ReturnType<typeof vi.fn>
  readCapacities: ReturnType<typeof vi.fn>
  setCapacities: ReturnType<typeof vi.fn>
} {
  // The capacity pair is a form, not a store: the mock keeps what was written
  // where the real official inputs would hold it, so a test can assert what the
  // row now says without reaching into a fake DOM twice.
  const capacities: { contextWindow?: number; maxTokens?: number } = {}
  return {
    suggest: vi.fn(async (): Promise<SuggestReply> => ({ ok: false, error: 'no-suggestion' })),
    // Since C2 the editor reports through commit() and the injector decides
    // where the intent lands; writeEfforts/stageEfforts are no longer its path.
    commit: vi.fn((_route: string, _modelId: string, _write: unknown): void => {}),
    withdraw: vi.fn((_route: string, _modelId: string): void => {}),
    fillCapacities: vi.fn((contextWindow?: number, maxTokens?: number): void => {
      if (contextWindow !== undefined) capacities.contextWindow = contextWindow
      if (maxTokens !== undefined) capacities.maxTokens = maxTokens
    }),
    readCapacities: vi.fn((): { contextWindow?: number; maxTokens?: number } => ({ ...capacities })),
    setCapacities: vi.fn((next: { contextWindow?: number | undefined; maxTokens?: number | undefined }): void => {
      if ('contextWindow' in next) {
        if (next.contextWindow === undefined) delete capacities.contextWindow
        else capacities.contextWindow = next.contextWindow
      }
      if ('maxTokens' in next) {
        if (next.maxTokens === undefined) delete capacities.maxTokens
        else capacities.maxTokens = next.maxTokens
      }
    }),
    writeEfforts: vi.fn(async (): Promise<WriteEffortsReply> => ({ ok: true })),
    stageEfforts: vi.fn((_route: string, _modelId: string, _efforts: unknown, _compat?: unknown): void => {}),
  }
}

function baseProps(overrides?: Partial<EffortEditorProps>): EffortEditorProps {
  return {
    route: 'aliyun',
    routeDisplayName: 'Aliyun',
    modelId: 'qwen-max',
    index: 0,
    api: baseApi(),
    readOnly: false,
    t,
    ...overrides,
  }
}

async function renderEditor(props: EffortEditorProps): Promise<{
  container: HTMLElement
  setProps(next: EffortEditorProps): Promise<void>
}> {
  const container = document.createElement('div')
  document.body.appendChild(container)
  let root: Root | undefined
  await act(async () => {
    root = createRoot(container)
    root.render(createElement(EffortEditor, props))
  })
  return {
    container,
    async setProps(next: EffortEditorProps): Promise<void> {
      await act(async () => { root!.render(createElement(EffortEditor, next)) })
    },
  }
}

/**
 * The editor's level pills, in LEVEL_ORDER (off…max). Scoped to the LEVELS
 * group on purpose: the default-pick and modality pill rows live in the same
 * card, and the master Thinking switch outside it (it gates whether the card
 * exists at all).
 */
function levelPills(container: HTMLElement): HTMLButtonElement[] {
  return Array.from(
    container.querySelectorAll<HTMLButtonElement>(
      '.bre-effort-card .bre-pillrow[aria-label="' + t('levelsLabel') + '"] .bre-lvl',
    ),
  )
}

/** The pill of one level, by its localized label. */
function pillFor(container: HTMLElement, label: string): HTMLButtonElement {
  const hit = levelPills(container).find(candidate => candidate.textContent === label)
  if (hit === undefined) throw new Error(`no pill "${label}"`)
  return hit
}

/** The pill of the MODALITY group (Text / Image input). */
function modalityPill(container: HTMLElement, label: string): HTMLButtonElement {
  const hit = pillGroup(container, t('inputModality')).find(candidate => candidate.textContent === label)
  if (hit === undefined) throw new Error(`no modality pill "${label}"`)
  return hit
}

/** One capacity field: the context window or the max output. */
function capacityField(container: HTMLElement, label: string): HTMLInputElement {
  const hit = container.querySelector<HTMLInputElement>(`.bre-effort-card input[aria-label^="${label}"]`)
  if (hit === null) throw new Error(`no capacity field "${label}"`)
  return hit
}

/** The pill's group: the level ladder, the default pick, or the modality. */
function pillGroup(container: HTMLElement, label: string): HTMLButtonElement[] {
  const group = Array.from(container.querySelectorAll<HTMLElement>('.bre-effort-card .bre-pillrow'))
    .find(candidate => candidate.getAttribute('aria-label') === label)
  if (group === undefined) throw new Error(`no pill group "${label}"`)
  return Array.from(group.querySelectorAll<HTMLButtonElement>('.bre-lvl'))
}

/** The armed levels' wire spelling inputs, in LEVEL_ORDER. */
function wires(container: HTMLElement): HTMLInputElement[] {
  return Array.from(container.querySelectorAll<HTMLInputElement>('.bre-effort-card input.bre-effort-wire'))
}

/** The quiet link that unfolds the wire-spelling row (folded by default). */
function wireToggle(container: HTMLElement): HTMLButtonElement {
  const hit = container.querySelector<HTMLButtonElement>('.bre-effort-wiretoggle')
  if (hit === null) throw new Error('no wire toggle')
  return hit
}

/** The master Thinking switch, which lives outside the card it gates. */
function thinkingSwitch(container: HTMLElement): HTMLInputElement {
  const hit = container.querySelector<HTMLInputElement>('.bre-thinking-switch input[type="checkbox"]')
  if (hit === null) throw new Error('no thinking switch')
  return hit
}

/** The default-effort dropdown (the pick is a select, one line whatever the
 *  ladder's size). */
function pickSelect(container: HTMLElement): HTMLSelectElement {
  const hit = container.querySelector<HTMLSelectElement>('.bre-effort-select')
  if (hit === null) throw new Error('no default-effort select')
  return hit
}

/** The dropdown's option labels, in order. */
function pickOptions(container: HTMLElement): string[] {
  return Array.from(pickSelect(container).options).map(option => option.textContent ?? '')
}

/** Choose a value in the React-controlled select, the way a user's pick does. */
async function pickValue(container: HTMLElement, value: string): Promise<void> {
  await act(async () => {
    const select = pickSelect(container)
    Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value')!.set!.call(select, value)
    select.dispatchEvent(new Event('change', { bubbles: true }))
  })
}

function buttonByText(container: HTMLElement, text: string): HTMLButtonElement {
  const hit = Array.from(container.querySelectorAll('button')).find(candidate => candidate.textContent === text)
  if (hit === undefined) throw new Error(`no button "${text}"`)
  return hit
}


/** Whether a button with exactly this text exists (absence is expected sometimes). */
function hasButton(container: HTMLElement, text: string): boolean {
  return Array.from(container.querySelectorAll('button')).some(candidate => candidate.textContent === text)
}

beforeEach(() => {
  document.body.innerHTML = ''
  vi.restoreAllMocks()
})

afterEach(() => {
  document.body.innerHTML = ''
})

describe('EffortEditor', () => {
  it('renders a saved declaration as armed level pills with wire spellings', async () => {
    const { container } = await renderEditor(baseProps({
      efforts: { off: null, high: 'high' },
    }))
    const pills = levelPills(container)
    expect(pills).toHaveLength(7) // off…max
    // off and high armed; everything else not.
    expect(pillFor(container, t('level_off')).classList.contains('is-on')).toBe(true)
    expect(pillFor(container, t('level_off')).getAttribute('aria-pressed')).toBe('true')
    expect(pillFor(container, t('level_high')).classList.contains('is-on')).toBe(true)
    expect(pillFor(container, t('level_low')).classList.contains('is-on')).toBe(false)
    // Every armed spelling is conventional (the id, '' for off), so the wire
    // row is FOLDED at mount — the pills are the decision view. The link
    // unfolds them, and each armed level then exposes its wire input; off
    // takes one too (its spelling is what some formats send to close thinking).
    expect(wires(container)).toHaveLength(0)
    expect(wireToggle(container).getAttribute('aria-expanded')).toBe('false')
    await act(async () => { wireToggle(container).click() })
    const wiresOut = wires(container)
    expect(wiresOut).toHaveLength(2)
    expect(wiresOut[0]!.value).toBe('') // off: null spells as "send nothing"
    expect(wiresOut[1]!.value).toBe('high')
  })

  it('unfolds the wire row on its own when a stored spelling is customized', async () => {
    // off: 'none' is the OpenAI none spelling — a customization the editor must
    // keep in sight rather than folding behind its default (hidden state).
    const { container } = await renderEditor(baseProps({
      efforts: { off: 'none', high: 'high' },
    }))
    expect(wireToggle(container).getAttribute('aria-expanded')).toBe('true')
    const wiresOut = wires(container)
    expect(wiresOut.map(input => input.value)).toEqual(['none', 'high'])
  })

  it('states what the draft declares in the head line', async () => {
    const { container } = await renderEditor(baseProps({
      efforts: { off: null, high: 'high' },
      defaultEffort: 'high',
    }))
    const state = container.querySelector('.bre-effort-state')
    expect(state?.textContent).toBe(t('stateDeclared', { count: 2, default: t('level_high') }))
    // An applied suggestion carries its provenance pill in the same line.
    expect(container.querySelector('.bre-effort-suggest')).toBeNull()
  })

  it('names the bare-relay outcome when clearing a stored declaration', async () => {
    const { container } = await renderEditor(baseProps({
      efforts: { off: null, high: 'high' },
    }))
    // Armed draft: no clearing hint (nothing would be cleared).
    expect(container.textContent).not.toContain(en.bareHint)
    // Disarm every armed level: the save below would write the unset
    // intent (bare provider-default requests, the relay-compat mode).
    // One act per click: act batches the updates inside it, and the second
    // pill's handler would otherwise read the pre-click draft.
    await act(async () => { pillFor(container, t('level_off')).click() })
    await act(async () => { pillFor(container, t('level_high')).click() })
    expect(container.textContent).toContain(en.bareHint)
  })

  it('warns about the Default wire bytes on forced-thinking relay ladders', async () => {
    // Stored glm ladder (no off) on a self-hosted relay: Default sends the
    // disabled object the model rejects (issue #2).
    const { container } = await renderEditor(baseProps({
      routeApi: 'openai-completions',
      routeBaseURL: 'https://api.suiyue.site/v1',
      modelId: 'glm-5.3-flash',
      efforts: { low: 'low', high: 'high', max: 'max' },
    }))
    expect(container.textContent).toContain(en.defaultRiskDisabled)
  })

  it('shows no Default warning for off-capable ladders and official hosts', async () => {
    const off = await renderEditor(baseProps({
      routeApi: 'openai-completions',
      routeBaseURL: 'https://api.suiyue.site/v1',
      efforts: { off: null, high: 'high' },
    }))
    expect(off.container.textContent).not.toContain(en.defaultRiskDisabled)
    expect(off.container.textContent).not.toContain(en.defaultRiskQwen)
    const official = await renderEditor(baseProps({
      routeApi: 'openai-completions',
      routeBaseURL: 'https://open.bigmodel.cn/api/paas/v4',
      modelId: 'glm-5.3-flash',
      efforts: { low: 'low', high: 'high', max: 'max' },
    }))
    // Official hosts keep pi-ai detection default... except the knowledge
    // base still resolves the zai format, whose Default is the disabled
    // object -- the warning correctly stays: format, not host, decides it.
    expect(official.container.textContent).toContain(en.defaultRiskDisabled)
  })

  it('applies an auto-adapt suggestion and labels its source and confidence', async () => {
    const api = baseApi()
    api.suggest.mockResolvedValue({
      ok: true,
      suggestion: {
        efforts: { off: null, low: 'low', medium: 'medium', high: 'high' },
        matched: false,
        source: 'endpoint:supported_features',
        confidence: 'medium',
      },
    } satisfies SuggestReply)
    const { container } = await renderEditor(baseProps({ api }))

    await act(async () => { buttonByText(container, t('autoAdapt')).click() })

    // The provenance lives in the head pill (the redesign's one-line suggestion).
    const pill = container.querySelector('.bre-effort-suggest')
    expect(pill?.textContent).toContain('endpoint:supported_features')
    expect(pill?.textContent).toContain(t('confidence_medium'))
    // The draft followed the suggestion: low is now armed too.
    expect(pillFor(container, t('level_low')).classList.contains('is-on')).toBe(true)
  })

  // The write-failure copy ('boom', 'invalid-models', 'conflict') is no longer
  // this component's to render: since C2 the editor reports through commit()
  // and the injector owns the write, so the refusal surface moved with it (see
  // the injector suite). What stays here is the contract the editor does own.

  it('disables the row controls while a suggestion is in flight', async () => {
    let resolveSuggest!: (reply: SuggestReply) => void
    const api = baseApi()
    api.suggest.mockImplementation(() => new Promise<SuggestReply>(resolve => { resolveSuggest = resolve }))
    const { container } = await renderEditor(baseProps({ api }))

    await act(async () => { buttonByText(container, t('autoAdapt')).click() })
    expect(buttonByText(container, t('autoAdapt')).disabled).toBe(true)
    // The commit path is a pill, not a button-with-state since C2: it has to
    // be held while the suggestion it belongs to is still in flight.
    expect(pillFor(container, t('level_high')).disabled).toBe(true)

    await act(async () => {
      resolveSuggest({ ok: false, error: 'no-suggestion' })
    })
    expect(buttonByText(container, t('autoAdapt')).disabled).toBe(false)
    expect(pillFor(container, t('level_high')).disabled).toBe(false)
  })

  it('keeps in-flight edits when the props re-render with the same declaration', async () => {
    // The injector swaps fresh props in place on settings changes; a user
    // typing mid-flight must not be clobbered by an unchanged declaration.
    const efforts: ReasoningEfforts = { high: 'high' }
    const props = baseProps({ efforts })
    const { container, setProps } = await renderEditor(props)
    // The user disarms high (dirty draft).
    await act(async () => { pillFor(container, t('level_high')).click() })
    expect(pillFor(container, t('level_high')).classList.contains('is-on')).toBe(false)

    await setProps({ ...props, efforts })

    // Still dirty: the user's edit survived the refresh.
    expect(pillFor(container, t('level_high')).classList.contains('is-on')).toBe(false)
  })

  it('staged: a change reports the pending intent and the staged banner stays', async () => {
    const api = baseApi()
    const { container } = await renderEditor(baseProps({ api, staged: true, route: 'acme-gateway' }))
    // The staged banner is present from the start.
    expect(container.textContent).toContain(t('stagedHint'))
    // No commit button of the editor's own exists since C2.
    expect(hasButton(container, t('apply'))).toBe(false)

    await act(async () => { pillFor(container, t('level_high')).click() })

    // One commit, carrying the complete intent; the injector decides whether it
    // stages (unsaved route) or queues (saved row).
    expect(api.commit).toHaveBeenCalledWith('acme-gateway', 'qwen-max', { efforts: { high: 'high' } })
    expect(api.writeEfforts).not.toHaveBeenCalled()
    // The copy says "modified, it lands with the card's save" -- never a
    // "Saved." that would be a lie until the official Save lands.
    expect(container.querySelector('.bre-effort-message')?.textContent).toContain(t('pendingSave'))
  })

  it('staged: auto-adapt feeds the card-typed protocol and endpoint as inference facts', async () => {
    const api = baseApi()
    const compat = { thinkingFormat: 'deepseek' as const, supportsReasoningEffort: true }
    api.suggest.mockResolvedValue({
      ok: true,
      suggestion: {
        efforts: { off: null, low: 'low', high: 'high', max: 'max' },
        compat,
        matched: true,
        source: 'deepseek-v4',
        confidence: 'high',
      },
    } satisfies SuggestReply)
    const { container } = await renderEditor(baseProps({
      api,
      staged: true,
      route: 'acme-gateway',
      routeApi: 'openai-completions',
      routeBaseURL: 'https://api.deepseek.com/v1',
    }))

    await act(async () => { buttonByText(container, t('autoAdapt')).click() })

    expect(api.suggest).toHaveBeenCalledWith('acme-gateway', 'qwen-max', undefined, {
      api: 'openai-completions',
      baseURL: 'https://api.deepseek.com/v1',
    })
    expect(api.commit).toHaveBeenCalledWith('acme-gateway', 'qwen-max', {
      efforts: { off: null, low: 'low', high: 'high', max: 'max' },
      compat,
    })
  })

  it('staged: auto-adapt then arming image input keeps the suggestion compat', async () => {
    // Regression: markDirty() used to clear the applied suggestion's compat
    // block, so staging after ANY tweak lost thinkingFormat -- precisely on
    // the auto-adapt-then-check-image path this editor exists for. The compat
    // describes the wire format and must survive draft tweaks; only Reset or
    // a fresh Auto-adapt replaces it.
    const api = baseApi()
    const compat = { thinkingFormat: 'deepseek' as const, supportsReasoningEffort: true }
    api.suggest.mockResolvedValue({
      ok: true,
      suggestion: {
        efforts: { off: null, low: 'low', high: 'high', max: 'max' },
        compat,
        matched: true,
        source: 'deepseek-v4',
        confidence: 'high',
      },
    } satisfies SuggestReply)
    const { container } = await renderEditor(baseProps({ api, staged: true, route: 'acme-gateway' }))

    await act(async () => { buttonByText(container, t('autoAdapt')).click() })
    await act(async () => { modalityPill(container, t('modalityImage')).click() })

    // The LAST commit carries the suggestion's compat AND the armed
    // modality: the wire format must survive a draft tweak on the path this
    // editor exists for. (The auto-adapt itself commits first.)
    expect(api.commit).toHaveBeenLastCalledWith('acme-gateway', 'qwen-max', {
      efforts: { off: null, low: 'low', high: 'high', max: 'max' },
      compat,
      input: ['text', 'image'],
    })
  })

  it('staged: auto-adapt then tuning levels keeps the suggestion compat', async () => {
    const api = baseApi()
    const compat = { thinkingFormat: 'deepseek' as const, supportsReasoningEffort: true }
    api.suggest.mockResolvedValue({
      ok: true,
      suggestion: {
        efforts: { off: null, low: 'low', high: 'high', max: 'max' },
        compat,
        matched: true,
        source: 'deepseek-v4',
        confidence: 'high',
      },
    } satisfies SuggestReply)
    const { container } = await renderEditor(baseProps({ api, staged: true, route: 'acme-gateway' }))

    await act(async () => { buttonByText(container, t('autoAdapt')).click() })
    // Disarm the "high" level...
    await act(async () => { pillFor(container, t('level_high')).click() })

    expect(api.commit).toHaveBeenLastCalledWith('acme-gateway', 'qwen-max', {
      efforts: { off: null, low: 'low', max: 'max' },
      compat,
    })
  })

  it('reset discards the applied suggestion compat for later applies', async () => {
    const api = baseApi()
    const compat = { thinkingFormat: 'deepseek' as const, supportsReasoningEffort: true }
    api.suggest.mockResolvedValue({
      ok: true,
      suggestion: {
        efforts: { off: null, low: 'low', high: 'high', max: 'max' },
        compat,
        matched: true,
        source: 'deepseek-v4',
        confidence: 'high',
      },
    } satisfies SuggestReply)
    const { container } = await renderEditor(baseProps({ api }))

    await act(async () => { buttonByText(container, t('autoAdapt')).click() })
    await act(async () => { buttonByText(container, t('reset')).click() })
    // Re-arm one level by hand: this edit is the user's own declaration and
    // must travel WITHOUT the discarded suggestion's compat.
    await act(async () => { pillFor(container, t('level_high')).click() })

    // Two commits: the auto-adapt's own, then the user's hand-armed ladder.
    // The LAST one is the user's declaration and must travel WITHOUT the
    // discarded suggestion's compat.
    expect(api.commit).toHaveBeenCalledTimes(2)
    expect(api.commit).toHaveBeenLastCalledWith('aliyun', 'qwen-max', { efforts: { high: 'high' } })
    expect(api.withdraw).toHaveBeenCalledWith('aliyun', 'qwen-max')
  })
})

describe('EffortEditor modality', () => {
  it('reflects a stored declaration and writes through the seam', async () => {
    const api = baseApi()
    const { container } = await renderEditor(baseProps({ api, input: ['text', 'image'] }))
    const modality = pillGroup(container, t('inputModality'))
    expect(modality.find(pill => pill.textContent === t('modalityImage'))?.classList.contains('is-on')).toBe(true)
    expect(container.textContent).not.toContain(t('modalityInherit'))
    // Disarming image narrows the declaration to text-only. The ladder was
    // never declared, so the effort part must travel as 'keep' -- NOT as the
    // unset intent, which would stamp a durable marker onto nothing.
    await act(async () => { modalityPill(container, t('modalityImage')).click() })
    expect(api.commit).toHaveBeenCalledWith('aliyun', 'qwen-max', { efforts: 'keep', input: ['text'] })
  })

  it('clearing the declaration writes the durable unset', async () => {
    const api = baseApi()
    const { container } = await renderEditor(baseProps({ api, input: ['text'] }))
    // The text pill toggles the DECLARATION: declared → click clears it.
    await act(async () => { modalityPill(container, t('modalityText')).click() })
    expect(container.textContent).toContain(t('modalityInherit'))
    // The durable unset travels as the null intent, not as an omission: the
    // injector must record the absence as the user's decision.
    expect(api.commit).toHaveBeenCalledWith('aliyun', 'qwen-max', { efforts: 'keep', input: null })
  })

  it('renders a resolved-layer empty input array as inheriting', async () => {
    // Production descriptors materialize absent arrays as []; that shape must
    // read as undeclared -- inherit note visible, no armed pill.
    const api = baseApi()
    const { container } = await renderEditor(baseProps({ api, input: [] }))
    expect(container.textContent).toContain(t('modalityInherit'))
    expect(modalityPill(container, t('modalityText')).classList.contains('is-on')).toBe(false)
    expect(modalityPill(container, t('modalityImage')).classList.contains('is-on')).toBe(false)
  })

  it('keeps the modality section visible when the official input-types editor is present', async () => {
    // User item 1: the injector hides the official per-row Input-types control
    // and this card always shows its own modality pills beside the default
    // effort pick. Only the official control is hidden — the ladder and the
    // modality stay one editor.
    const api = baseApi()
    const { container } = await renderEditor(baseProps({ api, input: ['text', 'image'], officialInputTypes: true }))
    expect(container.querySelector(`[aria-label^="${t('modalityImage')}"]`)).not.toBeNull()
    expect(container.querySelector(`[aria-label^="${t('modalityText')}"]`)).not.toBeNull()
    // The ladder still commits normally on a row whose modality is official.
    await act(async () => { pillFor(container, t('level_high')).click() })
    expect(api.commit).toHaveBeenCalledWith('aliyun', 'qwen-max', { efforts: { high: 'high' } })
  })

  it('auto-adapt still writes the input declaration when the official editor owns modalities', async () => {
    // Decided scope: the official Input-types control is hidden by the injector
    // and this card keeps its own pills visible; Auto-adapt still carries the
    // input part into the row and the source hint still reports where it came
    // from. The official checkboxes remain the write target through the seam.
    const api = baseApi()
    api.suggest.mockResolvedValue({
      ok: true,
      suggestion: {
        efforts: { high: 'high' },
        matched: true,
        source: 'demo',
        confidence: 'high',
        input: ['text', 'image'],
        inputSource: 'endpoint',
      },
    } satisfies SuggestReply)
    const { container } = await renderEditor(baseProps({ api, officialInputTypes: true }))
    await act(async () => { buttonByText(container, t('autoAdapt')).click() })
    expect(api.commit).toHaveBeenCalledWith(
      'aliyun',
      'qwen-max',
      expect.objectContaining({ efforts: { high: 'high' }, input: ['text', 'image'] }),
    )
    // The modal pills render on the same card; the ladder is not the only part.
    expect(container.querySelector(`[aria-label^="${t('modalityText')}"]`)).not.toBeNull()
    expect(container.textContent).toContain(t('inputHintEndpoint'))
  })

  it('an undeclared row stays untouched by an effort-only apply', async () => {
    const api = baseApi()
    const { container } = await renderEditor(baseProps({ api }))
    expect(container.textContent).toContain(t('modalityInherit'))
    await act(async () => { pillFor(container, t('level_high')).click() })
    // An untouched modality row omits the intent entirely -- an effort-only
    // edit must never stamp inputUnset onto a decision the user never made.
    expect(api.commit).toHaveBeenCalledWith('aliyun', 'qwen-max', { efforts: { high: 'high' } })
  })

  it('auto-adapt renders the footnote reference block and provenance hints', async () => {
    const api = baseApi()
    api.suggest.mockResolvedValue({
      ok: true,
      suggestion: {
        efforts: { off: null, low: 'low', medium: 'medium', high: 'high' },
        matched: true,
        source: 'deepseek-v4',
        confidence: 'high',
        input: ['text'],
        inputSource: 'endpoint',
        contextWindow: 1048576,
        maxTokens: 128000,
      },
    } satisfies SuggestReply)
    const { container } = await renderEditor(baseProps({ api }))

    await act(async () => { buttonByText(container, t('autoAdapt')).click() })

    // The same capacities are offered to the row's official inputs through the
    // seam (the injector's echo is what fills them); a seam without them
    // (embedders) simply never hears the call.
    expect(api.fillCapacities).toHaveBeenCalledWith(1048576, 128000)
    // ...and the editor's own two fields show what those inputs now hold,
    // grouped the way the form prints it.
    expect(capacityField(container, t('contextWindowLabel')).value).toBe('1,048,576')
    expect(capacityField(container, t('maxTokensLabel')).value).toBe('128,000')
    expect(container.textContent).toContain(t('contextWindowLabel'))
    expect(container.textContent).toContain(t('maxTokensLabel'))
    expect(container.textContent).toContain(t('inputHintEndpoint'))
    // The suggestion's text-only advice leaves the image pill disarmed.
    expect(modalityPill(container, t('modalityImage')).classList.contains('is-on')).toBe(false)
  })

  it('a suggestion without capacities never reaches for the official inputs', async () => {
    const api = baseApi()
    api.suggest.mockResolvedValue({
      ok: true,
      suggestion: {
        efforts: { high: 'high' },
        matched: true,
        source: 'demo',
        confidence: 'high',
      },
    } satisfies SuggestReply)
    const { container } = await renderEditor(baseProps({ api }))
    await act(async () => { buttonByText(container, t('autoAdapt')).click() })
    expect(api.fillCapacities).not.toHaveBeenCalled()
  })

  it('heuristic modality advice surfaces the verify hint and arms the pill', async () => {
    const api = baseApi()
    api.suggest.mockResolvedValue({
      ok: true,
      suggestion: {
        efforts: { low: 'low' },
        matched: false,
        source: 'protocol:openai-completions',
        confidence: 'low',
        input: ['text', 'image'],
        inputSource: 'heuristic',
      },
    } satisfies SuggestReply)
    const { container } = await renderEditor(baseProps({ api }))

    await act(async () => { buttonByText(container, t('autoAdapt')).click() })

    expect(container.textContent).toContain(t('inputHintHeuristic'))
    expect(modalityPill(container, t('modalityImage')).classList.contains('is-on')).toBe(true)
    // No capacities in the suggestion: the fields stay blank, which is the
    // catalogue-fallback state rather than a block hidden from the user.
    expect(capacityField(container, t('contextWindowLabel')).value).toBe('')
    expect(capacityField(container, t('contextWindowLabel')).getAttribute('placeholder')).toBe(t('capacityBlank'))  })
})

describe('EffortEditor compat controls', () => {
  it('draws no compat card on any protocol now that every compat control is retired', async () => {
    // The card is gone from the component, not merely unpopulated: nothing
    // renders on the protocol that used to own the budget field and the
    // priority, on the one whose picker was retired first, or without a
    // protocol at all.
    for (const routeApi of ['openai-completions', 'openai-responses', undefined]) {
      const { container } = await renderEditor(baseProps({ routeApi }))
      expect(container.querySelector('.bre-compat')).toBeNull()
      expect(container.querySelector('select.bre-select')).toBeNull()
      expect(container.textContent).not.toContain('thinking_token_budget')
    }
  })
})

describe('EffortEditor default-effort pick', () => {
  it('renders only while the draft declares levels, listing memory plus those levels', async () => {
    // No armed ladder: no pick to make, no section at all.
    const bare = await renderEditor(baseProps())
    expect(bare.container.textContent).not.toContain(t('defaultEffortLabel'))
    const { container } = await renderEditor(baseProps({
      efforts: { off: null, high: 'high' },
      defaultEffort: 'high',
    }))
    expect(container.textContent).toContain(t('defaultEffortLabel'))
    // The dropdown's options: the memory chain first, then the model's OWN
    // declared ladder in order, with the stored pick selected.
    expect(pickOptions(container)).toEqual([t('followMemory'), t('level_off'), t('level_high')])
    expect(pickSelect(container).value).toBe('high')
  })

  it('chooses a level through the seam alongside the ladder', async () => {
    const api = baseApi()
    const { container } = await renderEditor(baseProps({ api, efforts: { high: 'high' } }))
    await pickValue(container, 'high')
    expect(api.commit).toHaveBeenCalledWith('aliyun', 'qwen-max', { efforts: { high: 'high' }, defaultEffort: 'high' })
  })

  it('choosing the memory option clears the pick and writes the durable removal', async () => {
    const api = baseApi()
    const { container } = await renderEditor(baseProps({
      api,
      efforts: { high: 'high' },
      defaultEffort: 'high',
    }))
    // The memory option is the clear affordance (the retired re-pick's job).
    await pickValue(container, '')
    // The ladder draft is untouched, so the only REAL intent is the cleared
    // pick; it travels as null (durable removal), never as an omission.
    expect(api.commit).toHaveBeenCalledWith('aliyun', 'qwen-max', { efforts: { high: 'high' }, defaultEffort: null })
  })

  it('an untouched pick leaves the intent undefined so a ladder-only edit never clears it', async () => {
    const api = baseApi()
    const { container } = await renderEditor(baseProps({
      api,
      efforts: { high: 'high' },
      defaultEffort: 'high',
    }))
    await act(async () => { pillFor(container, t('level_low')).click() })
    expect(api.commit).toHaveBeenCalledWith('aliyun', 'qwen-max', { efforts: { low: 'low', high: 'high' } })
  })

  it('disarming the picked level flags the pick stale and clears it', async () => {
    const api = baseApi()
    const { container } = await renderEditor(baseProps({
      api,
      efforts: { off: null, high: 'high' },
      defaultEffort: 'high',
    }))
    // Disarm "high": the pick names it, so it auto-clears to "follow memory".
    await act(async () => { pillFor(container, t('level_high')).click() })
    expect(pickSelect(container).value).toBe('')
    // The pick is cleared durably (null intent) in the SAME commit that writes
    // the narrowed ladder -- one mutate carries both parts. A ladder holding
    // only `off` is the `false` declaration: the model does not reason.
    expect(api.commit).toHaveBeenCalledWith('aliyun', 'qwen-max', { efforts: false, defaultEffort: null })
  })

  it('follows a pick-only props push — the pick rides the same sync discipline', async () => {
    const { container, setProps } = await renderEditor(baseProps({
      efforts: { high: 'high' },
    }))
    expect(pickSelect(container).value).toBe('')
    // Another tab (or a hand-edited document) sets the pick: the editor's
    // draft must follow it even though nothing else in the props changed.
    await setProps(baseProps({ efforts: { high: 'high' }, defaultEffort: 'high' }))
    expect(pickSelect(container).value).toBe('high')
    // And a pick cleared elsewhere clears here too.
    await setProps(baseProps({ efforts: { high: 'high' } }))
    expect(pickSelect(container).value).toBe('')
  })

  it('reset restores the stored pick', async () => {
    const { container } = await renderEditor(baseProps({
      efforts: { high: 'high' },
      defaultEffort: 'high',
    }))
    await pickValue(container, '')
    await act(async () => { buttonByText(container, t('reset')).click() })
    expect(pickSelect(container).value).toBe('high')
  })
})

describe('EffortEditor thinking switch', () => {
  it('sits outside the effort card and gates the whole card', async () => {
    const { container } = await renderEditor(baseProps({ efforts: { off: null, high: 'high' } }))
    const toggle = thinkingSwitch(container)
    expect(toggle.checked).toBe(true)
    expect(container.querySelector('.bre-effort-card')).not.toBeNull()
    // The switch is NOT inside the card it hides — that is what lets the card
    // disappear entirely while the control that brings it back stays.
    expect(container.querySelector('.bre-effort-card .bre-thinking-switch')).toBeNull()
    await act(async () => { toggle.click() })
    expect(thinkingSwitch(container).checked).toBe(false)
    expect(container.querySelector('.bre-effort-card')).toBeNull()
    expect(levelPills(container)).toHaveLength(0)
    expect(container.textContent).toContain(en.thinkingModeOff)
    expect(container.querySelector('.bre-thinking-switch')).not.toBeNull()
  })

  it('reports the explicit false declaration when switched off', async () => {
    const api = baseApi()
    const { container } = await renderEditor(baseProps({ efforts: { off: null, high: 'high' }, api }))
    await act(async () => { thinkingSwitch(container).click() })
    expect(api.commit).toHaveBeenCalled()
    const write = api.commit.mock.calls.at(-1)?.[2] as { efforts?: unknown }
    expect(write.efforts).toBe(false)
  })

  it('takes the default pick with it when switched off', async () => {
    const api = baseApi()
    const { container } = await renderEditor(baseProps({
      efforts: { off: null, high: 'high' },
      defaultEffort: 'high',
      api,
    }))
    await act(async () => { thinkingSwitch(container).click() })
    const write = api.commit.mock.calls.at(-1)?.[2] as { efforts?: unknown; defaultEffort?: unknown }
    expect(write.efforts).toBe(false)
    // A pick names a level of a ladder that no longer exists.
    expect(write.defaultEffort).toBeNull()
  })

  it('starts off, with no card, for a model already declared as not reasoning', async () => {
    const { container } = await renderEditor(baseProps({ efforts: false }))
    expect(thinkingSwitch(container).checked).toBe(false)
    expect(container.querySelector('.bre-effort-card')).toBeNull()
    expect(container.textContent).toContain(en.thinkingModeOff)
  })

  it('keeps a false row false until a level is actually armed', async () => {
    const api = baseApi()
    const { container } = await renderEditor(baseProps({ efforts: false, api }))
    await act(async () => { thinkingSwitch(container).click() })
    expect(thinkingSwitch(container).checked).toBe(true)
    expect(container.querySelector('.bre-effort-card')).not.toBeNull()
    // A stored `false` spells as "only off armed", so opening the card is not
    // by itself a re-declaration: the row keeps saying "does not reason" until
    // a level is armed.
    const flipped = api.commit.mock.calls.at(-1)?.[2] as { efforts?: unknown }
    expect(flipped.efforts).toBe(false)
    await act(async () => { pillFor(container, t('level_high')).click() })
    const armed = api.commit.mock.calls.at(-1)?.[2] as { efforts?: Record<string, unknown> | false }
    expect(armed.efforts).not.toBe(false)
    expect(armed.efforts as Record<string, unknown>).toMatchObject({ high: 'high' })
  })

  it('keeps the draft across an off/on round trip', async () => {
    const api = baseApi()
    const { container } = await renderEditor(baseProps({ efforts: { off: null, high: 'high' }, api }))
    await act(async () => { thinkingSwitch(container).click() })
    await act(async () => { thinkingSwitch(container).click() })
    // The wire spellings survived: the switch hides the draft, never clears it.
    expect(pillFor(container, t('level_high')).classList.contains('is-on')).toBe(true)
    await act(async () => { wireToggle(container).click() })
    const wiresOut = wires(container)
    expect(wiresOut[1]!.value).toBe('high')
  })
})

/**
 * The provider-wide auto-adapt seat (user request ⑤) hands its work to these
 * components: the catalogue head is plain DOM outside React, so it publishes a
 * document event and each mounted editor answers it for its own route.
 *
 * Every test here uses a route no other test in this file uses. The suite's
 * afterEach clears the body but never unmounts a root, so an editor mounted by
 * an earlier test is still listening — a shared route would make these
 * assertions depend on the rest of the file's run order.
 */
describe('EffortEditor auto-adapt requests', () => {
  const A_LADDER = {
    ok: true,
    suggestion: {
      efforts: { off: null, low: 'low', medium: 'medium', high: 'high' },
      matched: false,
      source: 'endpoint:supported_features',
      confidence: 'medium',
    },
  } satisfies SuggestReply

  /** Let the request's queue chain (and React's own work) run to completion. */
  const settle = async (): Promise<void> => {
    await act(async () => { await new Promise(resolve => { setTimeout(resolve, 0) }) })
  }

  it('adapts the row when the request names its route', async () => {
    const api = baseApi()
    api.suggest.mockResolvedValue(A_LADDER)
    const { container } = await renderEditor(baseProps({ route: 'auto-spec-a', api }))

    await act(async () => { requestAutoEffort('auto-spec-a') })

    expect(api.suggest).toHaveBeenCalledWith('auto-spec-a', 'qwen-max', undefined)
    // The draft followed the suggestion, exactly as a click on the link would.
    expect(pillFor(container, t('level_low')).classList.contains('is-on')).toBe(true)
    expect(container.querySelector('.bre-effort-suggest')?.textContent).toContain('endpoint:supported_features')
  })

  it('leaves every other provider alone', async () => {
    const api = baseApi()
    const { container } = await renderEditor(baseProps({ route: 'auto-spec-b', api }))

    await act(async () => { requestAutoEffort('auto-spec-c') })
    await settle()

    expect(api.suggest).not.toHaveBeenCalled()
    expect(pillFor(container, t('level_low')).classList.contains('is-on')).toBe(false)
  })

  it('does not overwrite a row whose thinking is already configured, even when the switch is off', async () => {
    // `false` is a stored decision ("this model does not reason"), not an
    // empty row. Bulk adapt fills gaps and must leave that decision alone.
    // The row's own link is not rendered while the switch is off; that link
    // is a separate, per-row action and is not what this request is.
    const api = baseApi()
    api.suggest.mockResolvedValue(A_LADDER)
    const { container } = await renderEditor(baseProps({ route: 'auto-spec-d', efforts: false, api }))
    expect(container.querySelector('.bre-effort-card')).toBeNull()
    expect(hasButton(container, t('autoAdapt'))).toBe(false)

    await act(async () => { requestAutoEffort('auto-spec-d') })
    await settle()

    expect(api.suggest).not.toHaveBeenCalled()
    expect(api.commit).not.toHaveBeenCalled()
    expect(thinkingSwitch(container).checked).toBe(false)
  })

  it('preserves an explicitly unset thinking declaration on a mounted row', async () => {
    const api = baseApi()
    api.suggest.mockResolvedValue(A_LADDER)
    await renderEditor(baseProps({ route: 'auto-spec-unset', effortsUnset: true, api }))

    await act(async () => { requestAutoEffort('auto-spec-unset') })
    await settle()

    expect(api.suggest).not.toHaveBeenCalled()
    expect(api.commit).not.toHaveBeenCalled()
  })

  it('never writes a read-only row', async () => {
    // The link is `disabled` for a read-only row, but the request reaches
    // autoAdapt() directly and would otherwise bypass that gate.
    const api = baseApi()
    api.suggest.mockResolvedValue(A_LADDER)
    await renderEditor(baseProps({ route: 'auto-spec-e', api, readOnly: true }))

    await act(async () => { requestAutoEffort('auto-spec-e') })
    await settle()

    expect(api.suggest).not.toHaveBeenCalled()
    expect(api.commit).not.toHaveBeenCalled()
  })

  it('answers for the route it is mounted with NOW, not the one it started with', async () => {
    // A create card lets the user retype its Provider ID while the row is on
    // screen, so the subscription has to follow the prop.
    const api = baseApi()
    api.suggest.mockResolvedValue(A_LADDER)
    const props = baseProps({ route: 'auto-spec-f', api })
    const { setProps } = await renderEditor(props)
    await setProps({ ...props, route: 'auto-spec-g' })

    await act(async () => { requestAutoEffort('auto-spec-f') })
    await settle()
    expect(api.suggest).not.toHaveBeenCalled()

    await act(async () => { requestAutoEffort('auto-spec-g') })
    expect(api.suggest).toHaveBeenCalledWith('auto-spec-g', 'qwen-max', undefined)
  })

  it('answers every request, one after another', async () => {
    // One click of the seat is one request, so a provider whose rows all arrive
    // after the click still adapts completely.
    const api = baseApi()
    api.suggest.mockResolvedValue(A_LADDER)
    await renderEditor(baseProps({ route: 'auto-spec-h', api }))

    await act(async () => {
      requestAutoEffort('auto-spec-h')
      requestAutoEffort('auto-spec-h')
    })
    await settle()

    expect(api.suggest).toHaveBeenCalledTimes(2)
  })
})
