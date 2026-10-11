// @vitest-environment jsdom
/**
 * Repro probe (read-only, no production source touched): the seat's verdict on
 * a provider whose model list was just FETCHED into the card and never saved,
 * with every model row left COLLAPSED.
 *
 * The DOM below mirrors the official page as read from the host bundle
 * (`@deepseek-ai/dsh-client-ui-settings-models`, ModelRow): a COLLAPSED row
 * renders the id input, the display-name input, the chevron disclosure button
 * (`aria-label` = t("modelAdvanced") + position) and the trash — and NO
 * disclosure container at all; the container (class stem `modelAdvanced`) is
 * rendered only for an expanded row.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  createScanState,
  inputValueByLabel,
  reconcile,
  type EditorMountProps,
  type InjectorDeps,
  type MountedEditor,
  type SettingsJoin,
} from '../src/client/injection/models-page-editor.js'
import { cataloguesOf, reconcileAutoEffortSeats } from '../src/client/injection/auto-effort-seat.js'
import type { RemoteApi } from '../src/client/types.js'

;(globalThis as Record<string, unknown>)['IS_REACT_ACT_ENVIRONMENT'] = true

process.on('unhandledRejection', reason => {
  console.log('AUDIT_UNHANDLED', String(reason))
})

vi.mock('../src/client/injection/auto-effort-seat.js', async importOriginal => {
  const actual = await importOriginal<typeof import('../src/client/injection/auto-effort-seat.js')>()
  return {
    ...actual,
    reconcileAutoEffortSeats: (
      root: HTMLElement,
      targets: ReadonlyArray<{ catalogue: HTMLElement; route: string }>,
      deps: Parameters<typeof actual.reconcileAutoEffortSeats>[2],
    ) => {
      console.log('AUDIT_EVIDENCE', JSON.stringify({
        kind: 'seats-called',
        targets: targets.map(target => ({ route: target.route, catalogue: target.catalogue.className })),
        site: (new Error().stack ?? '').split('\n').slice(1, 4).map(line => line.trim().replace(/.*models-page-editor\.ts:/, 'models-page-editor.ts:')),
      }))
      return actual.reconcileAutoEffortSeats(root, targets, deps)
    },
  }
})

const LABELS = {
  capacity: ['模型选项', 'Model options', 'Capacities'],
  modelId: ['模型 ID', 'Model ID'],
  modelName: ['显示名称', 'Display name'],
  routeId: ['供应商 ID', 'Provider ID'],
  baseUrl: ['接口地址', 'Base URL'],
  apiProtocol: ['接口协议', 'API protocol'],
  apply: ['保存', 'Apply'],
  cancel: ['取消', 'Cancel'],
  editProvider: ['编辑 {provider}', 'Edit {provider}'],
}

/** One model row exactly as the official editor renders it. */
function row(index: number, id: string, name: string, expanded = false): string {
  return `
    <div class="modelEntry">
      <div class="modelRow">
        <input class="input" aria-label="模型 ID ${index}" value="${id}">
        <input class="input" aria-label="显示名称 ${index}" value="${name}">
        <button class="iconButton" aria-label="模型选项 ${index}" aria-expanded="${String(expanded)}"></button>
        <button class="iconButton iconButtonDanger" aria-label="删除模型 ${index}"></button>
      </div>
      ${expanded ? '<div class="modelAdvanced"><label><span>上下文窗口</span><input aria-label="上下文窗口 x"></label></div>' : ''}
    </div>`
}

/** One provider edit card, as the official ProviderEditor renders it. */
function card(name: string, route: string | undefined, rows: string[]): string {
  const list = document.createElement('ul')
  list.innerHTML = `
    <li class="rowCard">
      <div class="rowHead">
        <span class="rowName">${name}</span>
        <div class="rowActions"><button class="iconButton" aria-label="删除 ${name}"></button></div>
      </div>
      <div class="editor">
        <span class="editorTitle">${name}</span>
        ${route === undefined ? '' : `<span class="editorRoute">${route}</span>`}
        <section class="modelCatalog">
          <div class="modelListHead">
            <div class="modelCatalogHeading">
              <span class="modelCatalogTitle">模型</span>
              <span class="modelCatalogMeta">已自定义</span>
            </div>
            <button class="linkButton">重置</button>
            <button class="linkButton">获取可用模型</button>
          </div>
          <div class="modelList">${rows.join('')}</div>
          <button class="addModelButton">添加模型</button>
        </section>
        <div class="editorActions">
          <button class="secondaryButton">取消</button>
          <button class="primaryButton">保存</button>
        </div>
      </div>
    </li>`
  return list.innerHTML
}

const ladder = { off: null, low: 'low', medium: 'medium', high: 'high' }

/** A saved route whose stored models already declare their ladders. */
function joinWith(models: Array<Record<string, unknown>>): SettingsJoin {
  // The host's namespace `value`/`user` are the namespaced CONFIG SECTIONS:
  // providers live at `value.providers` (that is what providersOf reads).
  const section = {
    providers: {
      free: { displayName: '免费', api: 'openai-responses', baseURL: 'http://127.0.0.1:3425/v1', models },
    },
  }
  return {
    namespace: {
      autoGenerate: true,
      ns: 'llm-pi-ai',
      schema: {},
      value: structuredClone(section),
      user: structuredClone(section),
      revision: 1,
      applies: 'live',
      secrets: [],
    },
    writable: true,
  }
}

function makeDeps(join: () => SettingsJoin): InjectorDeps & { mounts: EditorMountProps[]; tKeys: string[]; labelReads: number; describeCalls: number } {
  const mounts: EditorMountProps[] = []
  const tKeys: string[] = []
  const trace = { mounts, tKeys, labelReads: 0, describeCalls: 0 }
  const api = {
    settings: {
      describe: async () => {
        const local = join()
        return {
          ok: true,
          value: { writable: true, hasDocument: true, namespaces: local.namespace === undefined ? [] : [local.namespace] },
        }
      },
      mutate: vi.fn(async () => ({ ok: true, value: undefined })),
    },
  } as unknown as RemoteApi
  return Object.assign(trace, {
    api,
    describeNamespace: async () => { trace.describeCalls += 1; return join() },
    t: (key: string, params?: Record<string, string | number>) => {
      tKeys.push(key)
      return params === undefined ? key : `${key}:${JSON.stringify(params)}`
    },
    labels: () => { trace.labelReads += 1; return LABELS },
    mount: (container: HTMLElement, props: EditorMountProps): MountedEditor => {
      mounts.push(props)
      const marker = document.createElement('div')
      marker.dataset['plugin'] = 'dsh-model-think-level'
      container.appendChild(marker)
      return { unmount: () => { marker.remove() }, render: () => {} }
    },
  })
}

/** Let every awaited step of the pass settle. */
async function flush(): Promise<void> {
  for (let tick = 0; tick < 12; tick += 1) {
    await Promise.resolve()
    await new Promise(resolve => { setTimeout(resolve, 0) })
  }
}

async function scan(root: HTMLElement, deps: InjectorDeps, state: ReturnType<typeof createScanState>): Promise<void> {
  const errors: string[] = []
  const original = console.error
  console.error = (...args: unknown[]) => { errors.push(args.map(String).join(' ')) }
  try {
    reconcile(root, deps, state)
    await flush()
  } finally {
    console.error = original
  }
  if (errors.length > 0) console.log('AUDIT_EVIDENCE', JSON.stringify({ kind: 'console-error', errors }))
}

function verdict(): { phase: string | null; text: string; detail: string } {
  const note = document.querySelector<HTMLElement>('.bre-auto-effort-note')
  return {
    phase: note?.getAttribute('data-bre-auto-effort-phase') ?? null,
    text: note?.querySelector<HTMLElement>('.bre-auto-effort-note-text')?.textContent ?? '',
    detail: note?.querySelector<HTMLElement>('.bre-auto-effort-note-detail')?.textContent ?? '',
  }
}

beforeEach(() => {
  document.body.innerHTML = ''
  sessionStorage.clear()
  vi.restoreAllMocks()
  vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false })))
})

describe('repro: freshly fetched, unsaved, collapsed model rows', () => {
  it('says what it does when the card holds rows the document has not taken yet', async () => {
    // The document: two saved models, both already declaring a ladder.
    const join = joinWith([
      { id: 'group/auto-hy', name: 'Hy4 preview', reasoningEfforts: { ...ladder } },
      { id: 'agentrouter/deepseek-v4-flash', name: 'DeepSeek V4 Flash', reasoningEfforts: { ...ladder } },
    ])
    const deps = makeDeps(() => join)
    // The card: the two saved rows plus two rows the user just fetched and
    // adopted, every one of them COLLAPSED.
    document.body.innerHTML = card('免费', 'free', [
      row(1, 'group/auto-hy', 'Hy4 preview'),
      row(2, 'agentrouter/deepseek-v4-flash', 'DeepSeek V4 Flash'),
      row(3, 'glm-5.3', 'glm-5.3'),
      row(4, 'kimi-k3', 'kimi-k3'),
    ])
    const root = document.body
    const state = createScanState()
    await scan(root, deps, state)

    // Why is the seat missing? Walk the scan's own steps one by one.
    console.log('AUDIT_EVIDENCE', JSON.stringify({
      kind: 'gate',
      editingFlag: state.editing,
      editorActions: root.querySelector('[class*="editorActions"]')?.className ?? null,
      editorActionsCount: root.querySelectorAll('[class*="editorActions"]').length,
      bodyIsRoot: root === document.body,
    }))
    const cardProbe = root.querySelectorAll('[class*="editorActions"], [class*="modelEntry"]').length
    const triggers = Array.from(root.querySelectorAll<HTMLButtonElement>('button[aria-label]')).map(button => ({
      aria: button.getAttribute('aria-label'),
      card: button.closest<HTMLElement>('[class*="editor"], [class*="rowCard"], [class*="addCard"]')?.className ?? null,
      entry: button.closest<HTMLElement>('[class*="modelEntry"]')?.className ?? null,
      route: button.closest<HTMLElement>('[class*="editor"]')?.querySelector('[class*="editorRoute"]')?.textContent ?? null,
    }))
    const catalogues = cataloguesOf(root).map(element => element.className)
    // Replicate the scan's own row walk (models-page-editor.ts:2255-2281) to see
    // whether `found` can fill up in this DOM.
    const found: Array<{ card: string; entry: string; modelId: string; container: string }> = []
    for (const aria of LABELS.capacity) {
      const hits = Array.from(root.querySelectorAll<HTMLButtonElement>('button[aria-label]'))
        .filter(button => (button.getAttribute('aria-label') ?? '').startsWith(aria))
      for (const trigger of hits) {
        const card = trigger.closest<HTMLElement>('[class*="editor"], [class*="rowCard"], [class*="addCard"]')
        if (card === null) continue
        const entry = trigger.closest<HTMLElement>('[class*="modelEntry"]') ?? card
        const modelId = inputValueByLabel(entry, LABELS.modelId)
        found.push({ card: card.className, entry: entry.className, modelId, container: String(entry.querySelector('[class*="modelAdvanced"]')?.className ?? '') })
      }
    }
    console.log('AUDIT_EVIDENCE', JSON.stringify({ kind: 'found-walk', aria: LABELS.capacity[0], found }))
    const seats = root.querySelectorAll('[data-bre-auto-effort]').length
    const notes = document.querySelectorAll('[class*="bre-auto-effort"]').length
    console.log('AUDIT_EVIDENCE', JSON.stringify({ kind: 'diagnostics', cardProbe, triggers, catalogues, seats, notes, tKeys: deps.tKeys, labelReads: deps.labelReads, describeCalls: deps.describeCalls, mounts: deps.mounts.length }))

    // Control: can a seat land in this DOM at all, when handed a target directly?
    reconcileAutoEffortSeats(root, catalogues.length === 0 ? [] : [{ catalogue: cataloguesOf(root)[0]!, route: 'free' }], {
      t: deps.t,
    })
    console.log('AUDIT_EVIDENCE', JSON.stringify({ kind: 'control', seats: root.querySelectorAll('[data-bre-auto-effort]').length }))

    reconcileAutoEffortSeats(root, [], { t: deps.t })
    await scan(root, deps, state)

    const seat = root.querySelector<HTMLButtonElement>('button.bre-auto-effort')
    expect(seat).not.toBeNull()
    console.log('AUDIT_EVIDENCE', JSON.stringify({ kind: 'seat', label: seat?.textContent, route: seat?.getAttribute('data-bre-auto-effort') }))

    seat!.click()
    await flush()
    const answer = verdict()
    console.log('AUDIT_EVIDENCE', JSON.stringify({ kind: 'verdict-collapsed-unsaved', ...answer }))
    expect(answer.phase).not.toBeNull()
  })

  it('control: an expanded row with the same card markup', async () => {
    const join = joinWith([{ id: 'group/auto-hy', name: 'Hy4 preview', reasoningEfforts: { ...ladder } }])
    const deps = makeDeps(() => join)
    document.body.innerHTML = card('免费', 'free', [row(1, 'group/auto-hy', 'Hy4 preview', true)])
    const state = createScanState()
    await scan(document.body, deps, state)
    console.log('AUDIT_EVIDENCE', JSON.stringify({
      kind: 'expanded-control',
      mounts: deps.mounts.length,
      seats: document.body.querySelectorAll('[data-bre-auto-effort]').length,
      tKeys: deps.tKeys,
      editing: state.editing,
    }))
  })

  it('same card, but no row is saved yet: only the card holds the models', async () => {
    const join = joinWith([])
    const deps = makeDeps(() => join)
    document.body.innerHTML = card('免费', 'free', [
      row(1, 'glm-5.3', 'glm-5.3'),
      row(2, 'kimi-k3', 'kimi-k3'),
    ])
    const state = createScanState()
    await scan(document.body, deps, state)
    const seat = document.body.querySelector<HTMLButtonElement>('button.bre-auto-effort')
    console.log('AUDIT_EVIDENCE', JSON.stringify({ kind: 'seat-empty-doc', present: seat !== null, label: seat?.textContent }))
    seat?.click()
    await flush()
    console.log('AUDIT_EVIDENCE', JSON.stringify({ kind: 'verdict-empty-doc', ...verdict() }))
  })
})
