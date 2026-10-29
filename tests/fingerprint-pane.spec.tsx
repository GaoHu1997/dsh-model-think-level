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
    // The reason rides the result body, which starts folded (m00003).
    rowOf(pane.root, 'gpt-5.5').querySelector<HTMLButtonElement>('.bre-fp-fold')?.click()
    await flush()
    expect(rowOf(pane.root, 'gpt-5.5').textContent).toContain('the model refused every challenge')
    // A failed check owns no verdict: no bars to draw.
    expect(rowOf(pane.root, 'gpt-5.5').querySelector('.bre-fp-bars')).toBeNull()
  })

  it('starts every result card folded, and unfolds it on its own toggle (user item 2 + m00003)', async () => {
    stubFetch([identified('gpt-5.5'), identified('claude-sonnet-5')])
    const pane = mount()
    await flush()

    // Default is FOLDED (m00003): the head answers "what came out", the card
    // answers "why" — and it stays out of the way until asked for.
    const first = rowOf(pane.root, 'gpt-5.5')
    expect(first.querySelector('.bre-fp-body')).toBeNull()
    // The fold control carries the state and the model it names.
    const fold = first.querySelector<HTMLButtonElement>('.bre-fp-fold')
    expect(fold).not.toBeNull()
    expect(fold?.getAttribute('aria-expanded')).toBe('false')

    fold?.click()
    await flush()
    const unfolded = rowOf(pane.root, 'gpt-5.5')
    expect(unfolded.querySelector('.bre-fp-body')).not.toBeNull()
    expect(unfolded.getAttribute('data-bre-fp-open')).toBe('1')
    expect(unfolded.querySelector('.bre-fp-fold')?.getAttribute('aria-expanded')).toBe('true')
    // Only the toggled row unfolds: its sibling stays folded.
    expect(rowOf(pane.root, 'claude-sonnet-5').querySelector('.bre-fp-body')).toBeNull()

    rowOf(pane.root, 'gpt-5.5').querySelector<HTMLButtonElement>('.bre-fp-fold')?.click()
    await flush()
    expect(rowOf(pane.root, 'gpt-5.5').querySelector('.bre-fp-body')).toBeNull()
  })

  it('keeps the badge, evidence and action on the head while the result is folded', async () => {
    stubFetch([identified('gpt-5.5')])
    const pane = mount()
    await flush()
    // Folded by default (m00003): the head is all there is until the user asks.
    const head = rowOf(pane.root, 'gpt-5.5').querySelector('.bre-fp-row-head')
    expect(head?.textContent).toContain('GPT-5.5 · 82%')
    expect(head?.querySelector('.bre-fp-action')).not.toBeNull()
  })

  it('folds a failed row the same way: the error body goes, the retry stays', async () => {
    stubFetch([identified('gpt-5.5', { status: 'failed', error: 'the relay answered 401 for every prompt' })])
    const pane = mount()
    await flush()
    // The error paragraph is the result body of a failed row: folded with it.
    expect(rowOf(pane.root, 'gpt-5.5').querySelector('.bre-fp-error')).toBeNull()
    rowOf(pane.root, 'gpt-5.5').querySelector<HTMLButtonElement>('.bre-fp-fold')?.click()
    await flush()
    expect(rowOf(pane.root, 'gpt-5.5').querySelector('.bre-fp-error')?.textContent).toContain('401')
    rowOf(pane.root, 'gpt-5.5').querySelector<HTMLButtonElement>('.bre-fp-fold')?.click()
    await flush()
    const folded = rowOf(pane.root, 'gpt-5.5')
    expect(folded.querySelector('.bre-fp-error')).toBeNull()
    expect(folded.querySelector('.bre-fp-fold')?.getAttribute('aria-expanded')).toBe('false')
    // The head keeps its verdict badge and the Retry action.
    expect(folded.querySelector('.bre-fp-row-head')?.textContent).toContain(t('fpStateFailed'))
    expect(folded.querySelector('.bre-fp-action')).not.toBeNull()
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
    // three prompts — and, before anything here has been checked, no invented
    // number of seconds.
    expect(rowOf(pane.root, 'gpt-5.5').textContent).toContain('3 prompts')
    expect(rowOf(pane.root, 'gpt-5.5').textContent).not.toMatch(/about|min/)
  })

  it('estimates the wait from what this route has already measured', async () => {
    // A hardcoded "about 15s" is off by however slow the upstream happens to be
    // today (the real runs take ten to sixty seconds), so the hint follows the
    // durations this provider's finished checks actually recorded.
    stubFetch([identified('claude-sonnet-5', { timing: { durationMs: 41_000 } })])
    const pane = mount()
    await flush()

    expect(rowOf(pane.root, 'gpt-5.5').textContent).toContain('3 prompts · about 40s')
    // The measured row keeps reporting evidence, not a cost estimate.
    expect(rowOf(pane.root, 'claude-sonnet-5').textContent).toContain('3 / 3 prompts')
  })

  it('switches the estimate to whole minutes once the measured wait passes one', async () => {
    stubFetch([identified('claude-sonnet-5', { timing: { durationMs: 95_000 } })])
    const pane = mount()
    await flush()

    expect(rowOf(pane.root, 'gpt-5.5').textContent).toContain('3 prompts · about 2 min')
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

  it('keeps the similarity off the row head and inside the result card (m00003)', async () => {
    // The head used to read "3 / 3 prompts · similarity 71%", and the tail
    // wrapped onto a second line. The similarity is detail about the winner:
    // it belongs to the card, the head keeps only the prompt count.
    stubFetch([identified('gpt-5.5')])
    const pane = mount()
    await flush()

    const head = rowOf(pane.root, 'gpt-5.5').querySelector('.bre-fp-row-head')
    expect(head?.textContent).toContain('3 / 3 prompts')
    expect(head?.textContent).not.toContain('Similarity')

    rowOf(pane.root, 'gpt-5.5').querySelector<HTMLButtonElement>('.bre-fp-fold')?.click()
    await flush()
    const body = rowOf(pane.root, 'gpt-5.5').querySelector('.bre-fp-body')
    expect(body?.textContent).toContain('Similarity')
    expect(body?.textContent).toContain('71%')
  })

  it('draws the result as a family verdict plus three bars, with the closed-set warning always on', async () => {
    stubFetch([identified('gpt-5.5')])
    const pane = mount()
    await flush()
    rowOf(pane.root, 'gpt-5.5').querySelector<HTMLButtonElement>('.bre-fp-fold')?.click()
    await flush()

    const body = rowOf(pane.root, 'gpt-5.5').querySelector('.bre-fp-body')
    expect(body?.textContent).toContain('Family')
    expect(body?.querySelectorAll('.bre-fp-bar')).toHaveLength(3)
    // Only the winner is coloured: the bars are a measurement, not a podium.
    expect(body?.querySelectorAll('.bre-fp-bar-fill.is-top')).toHaveLength(1)
    expect(body?.textContent).toContain('Closed-set')
  })

  it('folds the timing picture into the result card when the verdict carries one', async () => {
    stubFetch([identified('gpt-5.5', {
      timing: { firstTokenMs: 1200, durationMs: 41_000, charsPerSecond: 437.4 },
    })])
    const pane = mount()
    await flush()
    rowOf(pane.root, 'gpt-5.5').querySelector<HTMLButtonElement>('.bre-fp-fold')?.click()
    await flush()

    const timing = rowOf(pane.root, 'gpt-5.5').querySelector('.bre-fp-timing')
    expect(timing?.textContent).toContain('first token 1.2s')
    expect(timing?.textContent).toContain('total 41.0s')
    expect(timing?.textContent).toContain('~437 chars/s')
  })

  it('draws one pill per challenge, right under the family line, saying what each one asked back', async () => {
    // m00136: `2 / 3 prompts` on the head says HOW MANY counted, never WHICH
    // one did not. The pills are that missing half — one per question, in order.
    stubFetch([identified('gpt-5.5', {
      usedOutputs: 2,
      challenges: [
        { index: 1, expected: 312, parsed: 312, accepted: true },
        { index: 2, expected: 332, parsed: 121, accepted: false },
        { index: 3, expected: 315, parsed: 315, accepted: true },
      ],
    })])
    const pane = mount()
    await flush()
    rowOf(pane.root, 'gpt-5.5').querySelector<HTMLButtonElement>('.bre-fp-fold')?.click()
    await flush()

    const body = rowOf(pane.root, 'gpt-5.5').querySelector('.bre-fp-body')
    const pills = Array.from(body?.querySelectorAll('.bre-fp-chal') ?? []).map((node) => node.textContent)
    expect(pills).toEqual([
      'Q1 312 · counted',
      'Q2 121/332 · not counted',
      'Q3 315 · counted',
    ])
    // Under the family line, before anything else in the card.
    const family = body?.querySelector('.bre-fp-family')
    expect(family?.nextElementSibling?.className).toBe('bre-fp-chals')
    // Each outcome owns its own tone, so the row is readable without the words.
    const tones = Array.from(body?.querySelectorAll('.bre-fp-chal') ?? []).map((node) => node.className)
    expect(tones).toEqual([
      'bre-fp-chal is-counted',
      'bre-fp-chal is-rejected',
      'bre-fp-chal is-counted',
    ])
  })

  it('calls an early-stopped challenge skipped instead of not counted', async () => {
    // 两题早停掐掉的第三题没有失败 —— 写成「未计入」会让人去追一个不存在的错。
    stubFetch([identified('gpt-5.5', {
      usedOutputs: 2,
      challenges: [
        { index: 1, expected: 312, parsed: 312, accepted: true },
        { index: 2, expected: 332, parsed: 330, accepted: true },
        { index: 3, expected: 315, parsed: 0, accepted: false, skipped: true },
      ],
    })])
    const pane = mount()
    await flush()
    rowOf(pane.root, 'gpt-5.5').querySelector<HTMLButtonElement>('.bre-fp-fold')?.click()
    await flush()

    const third = rowOf(pane.root, 'gpt-5.5').querySelectorAll('.bre-fp-chal')[2]
    expect(third?.textContent).toBe('Q3 315 · early stop')
    expect(third?.className).toBe('bre-fp-chal is-skipped')
  })

  it('draws no pills at all for a record that predates the per-challenge ledger', async () => {
    // 旧记录没有逐题账本：宁可少一行，也不编一个「0 / 0」出来。
    stubFetch([identified('gpt-5.5')])
    const pane = mount()
    await flush()
    rowOf(pane.root, 'gpt-5.5').querySelector<HTMLButtonElement>('.bre-fp-fold')?.click()
    await flush()

    expect(rowOf(pane.root, 'gpt-5.5').querySelector('.bre-fp-chals')).toBeNull()
  })

  it('shows the ledger on a failed row too, where it matters most', async () => {
    // 三题全废时没有归属结论，但「哪一题没答、答回来多少」恰恰是要看的。
    stubFetch([identified('gpt-5.5', {
      status: 'failed',
      error: 'no usable answer: all three prompts came back short',
      usedOutputs: 0,
      challenges: [
        { index: 1, expected: 312, parsed: 41, accepted: false },
        { index: 2, expected: 332, parsed: 0, accepted: false },
        { index: 3, expected: 315, parsed: 87, accepted: false },
      ],
    })])
    const pane = mount()
    await flush()
    rowOf(pane.root, 'gpt-5.5').querySelector<HTMLButtonElement>('.bre-fp-fold')?.click()
    await flush()

    const body = rowOf(pane.root, 'gpt-5.5').querySelector('.bre-fp-body')
    expect(body?.querySelector('.bre-fp-error')?.textContent).toContain('no usable answer')
    const pills = Array.from(body?.querySelectorAll('.bre-fp-chal') ?? []).map((node) => node.textContent)
    expect(pills).toEqual([
      'Q1 41/312 · not counted',
      'Q2 0/332 · not counted',
      'Q3 87/315 · not counted',
    ])
  })

  it('keeps the bare error line for a failed row that has no ledger', async () => {
    stubFetch([identified('gpt-5.5', { status: 'failed', error: 'the relay answered 401 for every prompt' })])
    const pane = mount()
    await flush()
    rowOf(pane.root, 'gpt-5.5').querySelector<HTMLButtonElement>('.bre-fp-fold')?.click()
    await flush()

    const body = rowOf(pane.root, 'gpt-5.5').querySelector('.bre-fp-body')
    expect(body?.querySelector('.bre-fp-error')?.textContent).toContain('401')
    expect(body?.querySelector('.bre-fp-chals')).toBeNull()
  })

  it('omits the timing line when the verdict carries no timing picture', async () => {
    // Older records predate the field; a verdict that never measured itself
    // must not render an empty "Timing: —" row.
    stubFetch([identified('gpt-5.5')])
    const pane = mount()
    await flush()
    rowOf(pane.root, 'gpt-5.5').querySelector<HTMLButtonElement>('.bre-fp-fold')?.click()
    await flush()

    expect(rowOf(pane.root, 'gpt-5.5').querySelector('.bre-fp-timing')).toBeNull()
  })
})
