/**
 * FingerprintPane: the fourth editor tab's content.
 *
 * Three hard constraints get a direct guard here, because they are the ones a
 * later change is most likely to break without noticing:
 *   - m00883 指纹检测不出现在新增供应商中 — a create-provider card renders
 *     nothing at all, and never even asks the host for settings;
 *   - 只对 GPT/Claude 系列开放 — a provider whose catalogue is all Qwen gets
 *     no rows and reports `none`, so the tab steps aside instead of offering
 *     a control that can only ever say "failed";
 *   - 后台跑、不留进度浮层 — the badge carries the progress and the head line
 *     is a status line, not a progress bar.
 */

// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createElement } from 'react'
import type { Translate } from '@deepseek-ai/dsh-client-ui-slots'
import { FingerprintPane, type FingerprintPaneProps } from '../src/client/FingerprintPane.js'
import { en } from '../src/client/locales.js'
import { mountReact, unmountReact, type ForeignMount } from '../src/client/injection/mount.js'
import {
  setFingerprintSender,
  teardownFingerprintRunners,
  type FingerprintSender,
} from '../src/client/fingerprint-runner.js'
import type { FingerprintRecord } from '../src/fingerprint/verdict.js'
import { fakeApi, makeJoin } from './support/composer-fixture.js'

/** The shell's Translate interpolates `{name}` placeholders; so does this. */
const t = ((key: string, params?: Record<string, unknown>): string => {
  const raw = (en as Record<string, string>)[key] ?? key
  if (params === undefined) return raw
  return raw.replace(/\{(\w+)\}/g, (whole, name: string) => (name in params ? String(params[name]) : whole))
}) as unknown as Translate

const PROVIDERS: Record<string, unknown> = {
  magpie: {
    displayName: 'Magpie',
    api: 'openai-completions',
    models: [
      { id: 'gpt-5.5' },
      { id: 'claude-sonnet-5' },
      { id: 'qwen-max' },
      { id: 'text-embedding-3-large' },
    ],
  },
}

/** A settled record: identified, with three candidates behind it. */
function identified(model: string, over: Partial<FingerprintRecord> = {}): FingerprintRecord {
  return {
    provider: 'magpie',
    model,
    status: 'identified',
    checkedAt: 1_700_000_000_000,
    usedOutputs: 3,
    prediction: 'gpt-5.5',
    predictionName: 'GPT-5.5',
    probability: 0.82,
    familyPrediction: 'gpt',
    familyProbability: 0.9,
    top: [
      { model: 'gpt-5.5', probability: 0.82, similarity: 0.71 },
      { model: 'gpt-5.4', probability: 0.1, similarity: 0.4 },
      { model: 'gpt-6-sol', probability: 0.05, similarity: 0.3 },
    ],
    calibration: { queries: 3, cvAccuracy: 1 },
    ...over,
  }
}

interface Pane {
  root: HTMLElement
  mount: ForeignMount
  describe: ReturnType<typeof vi.fn>
}

let mounted: Pane | undefined

/** Mount the pane over a card of the requested kind and answer its two reads. */
function mount(
  options: {
    create?: boolean
    providers?: Record<string, unknown>
    records?: FingerprintRecord[]
  } = {},
): Pane {
  const wrapper = document.createElement('div')
  wrapper.innerHTML = options.create === true
    ? '<ul class="rows"><li class="addCard"><div class="addPanel"><div class="bre-create-host"></div></div></li></ul>'
    : '<ul class="rows"><li class="rowCard"><div class="bre-headers-host"></div></li></ul>'
  document.body.append(wrapper)
  const card = wrapper.querySelector<HTMLElement>('.bre-create-host, .bre-headers-host')!
  // The pane takes the mount as a ref, exactly as provider-card-slot hands it.
  const host: { readonly current: HTMLElement | null } = { current: card }

  const api = fakeApi(async () => makeJoin(options.providers ?? PROVIDERS))
  const container = document.createElement('div')
  document.body.append(container)

  const props: FingerprintPaneProps = { route: 'magpie', api, t, host }
  const pane: Pane = {
    root: container,
    describe: api.describeSpy,
    mount: mountReact(container, createElement(FingerprintPane, props), {
      // Committed before mount() returns: the first paint is part of what
      // several tests assert, and a deferred commit would make it a race.
      sync: true,
    }),
  }
  mounted = pane
  return pane
}

/** Answer the pane's store read and its reloads from one fixed document. */
function stubFetch(records: FingerprintRecord[] = []): ReturnType<typeof vi.fn> {
  const call = vi.fn(async () => ({
    ok: true,
    json: async () => ({
      ok: true,
      data: {
        bank: { builtAt: '2026-01-01T00:00:00Z', recommendedQueries: 3 },
        records,
      },
    }),
  }))
  vi.stubGlobal('fetch', call)
  return call
}

/**
 * Let everything settle: React's own scheduled render, the effect that asks
 * the host for the catalogue, the promise that answers it, and the render that
 * adopts it. One macrotask is not enough — each is its own turn.
 */
async function flush(turns = 5): Promise<void> {
  for (let turn = 0; turn < turns; turn += 1) {
    await new Promise((resolve) => setTimeout(resolve, 0))
  }
}

function rowOf(root: HTMLElement, model: string): HTMLElement {
  const found = Array.from(root.querySelectorAll<HTMLElement>('.bre-fp-row')).find(
    (row) => row.querySelector('.bre-fp-model')?.textContent === model,
  )
  if (found === undefined) throw new Error(`no fingerprint row for "${model}"`)
  return found
}

function badgeOf(root: HTMLElement, model: string): string {
  return rowOf(root, model).querySelector('.bre-fp-badge')?.textContent ?? ''
}

function actionOf(root: HTMLElement, model: string): HTMLButtonElement {
  const button = rowOf(root, model).querySelector<HTMLButtonElement>('.bre-fp-action')
  if (button === null) throw new Error(`no action button for "${model}"`)
  return button
}

beforeEach(() => {
  document.body.innerHTML = ''
  teardownFingerprintRunners()
})

afterEach(() => {
  if (mounted !== undefined) {
    unmountReact(mounted.mount)
    mounted = undefined
  }
  teardownFingerprintRunners()
  vi.unstubAllGlobals()
})

describe('FingerprintPane', () => {
  it('renders nothing at all on a create-provider card, and asks the host for nothing', async () => {
    // m00883: 指纹检测不出现在新增供应商中。不渲染 = 不发那次 settings 读,
    // so a draft card costs not even one extra request.
    stubFetch()
    const pane = mount({ create: true })
    await flush()

    expect(pane.root.querySelector('.bre-fingerprint')).toBeNull()
    expect(pane.root.textContent).toBe('')
    expect(pane.describe).not.toHaveBeenCalled()
  })

  it('lists only the GPT and Claude models, and reports ready', async () => {
    stubFetch()
    const pane = mount()
    await flush()

    const section = pane.root.querySelector('.bre-fingerprint')
    expect(section?.getAttribute('data-bre-fingerprint')).toBe('ready')
    const listed = Array.from(pane.root.querySelectorAll('.bre-fp-model')).map((node) => node.textContent)
    expect(listed).toEqual(['gpt-5.5', 'claude-sonnet-5'])
  })

  it('reports none and draws no rows when the catalogue holds no eligible model', async () => {
    // 一个都没有就整页不显示 —— 不给一个必然点不动的灰按钮（m00702 第 1 条）。
    stubFetch()
    const pane = mount({
      providers: { magpie: { models: [{ id: 'qwen-max' }, { id: 'text-embedding-3-large' }] } },
    })
    await flush()

    expect(pane.root.querySelector('.bre-fingerprint')?.getAttribute('data-bre-fingerprint')).toBe('none')
    expect(pane.root.querySelectorAll('.bre-fp-row')).toHaveLength(0)
  })

  it('names each state on its badge, and never on the model id', async () => {
    stubFetch([
      identified('gpt-5.5'),
      identified('claude-sonnet-5', {
        status: 'doubtful',
        probability: 0.41,
        prediction: 'claude-sonnet-5',
        predictionName: 'Claude Sonnet 5',
      }),
    ])
    const pane = mount()
    await flush()

    expect(badgeOf(pane.root, 'gpt-5.5')).toBe('GPT-5.5 · 82%')
    expect(badgeOf(pane.root, 'claude-sonnet-5')).toBe('Doubtful · 41%')
  })

  it('says failed rather than guessing a model, and keeps the reason on the row', async () => {
    stubFetch([
      {
        provider: 'magpie',
        model: 'gpt-5.5',
        status: 'failed',
        checkedAt: 1_700_000_000_000,
        usedOutputs: 0,
        error: 'the model refused every challenge',
      },
    ])
    const pane = mount()
    await flush()

    expect(badgeOf(pane.root, 'gpt-5.5')).toBe('Check failed')
    expect(rowOf(pane.root, 'gpt-5.5').textContent).toContain('the model refused every challenge')
    // A failed check owns no verdict: no bars to draw.
    expect(rowOf(pane.root, 'gpt-5.5').querySelector('.bre-fp-bars')).toBeNull()
  })

  it('offers one action per row, and only one', async () => {
    stubFetch([identified('claude-sonnet-5')])
    const pane = mount()
    await flush()

    expect(actionOf(pane.root, 'gpt-5.5').textContent).toBe('Check')
    expect(actionOf(pane.root, 'claude-sonnet-5').textContent).toBe('Re-check')
    expect(rowOf(pane.root, 'gpt-5.5').querySelectorAll('.bre-fp-action')).toHaveLength(1)
    expect(rowOf(pane.root, 'claude-sonnet-5').querySelectorAll('.bre-fp-action')).toHaveLength(1)
  })

  it('says Retry only for the row that actually failed', async () => {
    stubFetch([
      identified('claude-sonnet-5'),
      {
        provider: 'magpie',
        model: 'gpt-5.5',
        status: 'failed',
        checkedAt: 1_700_000_000_000,
        usedOutputs: 0,
        error: 'rate limited',
      },
    ])
    const pane = mount()
    await flush()

    expect(actionOf(pane.root, 'gpt-5.5').textContent).toBe('Retry')
    expect(actionOf(pane.root, 'claude-sonnet-5').textContent).toBe('Re-check')
  })

  it('sends one request per model on Check all, and only for eligible models', async () => {
    stubFetch()
    const pane = mount()
    await flush()

    const sent: string[] = []
    const sender: FingerprintSender = {
      run: (route, model) => {
        sent.push(model)
        return {
          done: Promise.resolve({
            ok: true,
            record: identified(model),
          }),
          abort: () => {},
        }
      },
    }
    setFingerprintSender('magpie', sender)

    const all = pane.root.querySelector<HTMLButtonElement>('.bre-fp-all')
    expect(all?.textContent).toBe('Check all')
    expect(all).toBeDefined()
    all?.click()
    await flush()

    expect(sent).toEqual(['gpt-5.5', 'claude-sonnet-5'])
  })

  it('keeps the head a status line: the cost is stated up front, never a progress bar', async () => {
    stubFetch()
    const pane = mount()
    await flush()

    const head = pane.root.querySelector('.bre-fp-head')?.textContent ?? ''
    expect(head).toContain('2 probeable')
    expect(head).toContain('Nothing checked yet.')
    // The per-row cost is the pre-flight answer to "what am I about to spend":
    // three prompts, about fifteen seconds.
    expect(rowOf(pane.root, 'gpt-5.5').textContent).toContain('3 prompts · about 15s')
  })

  it('shows a transport failure instead of silently resetting the button', async () => {
    // The route can fail before it has a verdict to persist (a 500 from the
    // bank, a dropped connection). Before this the button spun once and came
    // back unchanged, which reads exactly like "nothing was checked".
    stubFetch()
    const pane = mount()
    await flush()

    setFingerprintSender('magpie', {
      run: () => ({
        done: Promise.resolve({ ok: false, error: 'the fingerprint bank is unavailable' }),
        abort: () => {},
      }),
    })

    actionOf(pane.root, 'gpt-5.5').click()
    await flush()

    expect(pane.root.querySelector('.bre-fp-error')?.textContent).toContain('the fingerprint bank is unavailable')
    expect(pane.root.querySelector('.bre-fp-error')?.textContent).toContain('gpt-5.5')
  })

  it('draws the result as a family verdict plus three bars, with the closed-set warning always on', async () => {
    stubFetch([identified('gpt-5.5')])
    const pane = mount()
    await flush()

    const body = rowOf(pane.root, 'gpt-5.5').querySelector('.bre-fp-body')
    expect(body?.textContent).toContain('Family')
    expect(body?.querySelectorAll('.bre-fp-bar')).toHaveLength(3)
    // Only the winner is coloured: the bars are a measurement, not a podium.
    expect(body?.querySelectorAll('.bre-fp-bar-fill.is-top')).toHaveLength(1)
    expect(body?.textContent).toContain('Closed-set')
  })
})
