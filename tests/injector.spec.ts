/**
 * DOM bypass injector tests: anchor discovery, idempotent mounting, unmount
 * on row removal, full-document scanning (the plugin scans document.body),
 * remounts, and describe-failure recovery. Runs against jsdom with a
 * hand-built approximation of the official Models page DOM.
 */

// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { adaptEveryModel, createScanState, effectiveStagedIntents, flushOnUnload, pinModelListCards, queueWriteInto, reconcile, stageEffortsInto, unwatchModelListOffsets, watchModelListOffsets, type EditorMountProps, type InjectorDeps, type MountedEditor, type SettingsJoin } from '../src/client/injection/models-page-editor.js'
import { suggestEfforts, type ReasoningEfforts } from '../src/knowledge.js'
import type { RemoteApi } from '../src/client/types.js'

/** Build an approximation of the official models page section. */
function buildModelsDom(): HTMLElement {
  const section = document.createElement('div')
  section.className = 'section'
  section.innerHTML = `
    <h2>Models</h2>
    <ul class="rows">
      <li class="rowCard">
        <div class="rowHead">
          <span class="rowName">Aliyun</span>
        </div>
        <div class="editor">
          <span class="editorTitle">Aliyun</span>
          <div class="modelCatalog">
            <div class="modelEntry">
              <div class="modelRow">
                <input aria-label="Model ID" value="qwen-max" />
                <input aria-label="Display name" value="Qwen Max" />
                <button aria-label="Capacities 1"></button>
              </div>
              <div class="modelAdvanced" style="display:block">
                <label><span>Context window</span><input /></label>
              </div>
            </div>
            <div class="modelEntry">
              <div class="modelRow">
                <input aria-label="Model ID" value="qwen-turbo" />
                <button aria-label="Capacities 2"></button>
              </div>
              <div class="modelAdvanced" style="display:block">
                <label><span>Context window</span><input /></label>
              </div>
            </div>
          </div>
        </div>
      </li>
    </ul>
  `
  document.body.appendChild(section)
  return section
}

/**
 * The one declared route BOTH layers carry. The write baseline is the RAW user
 * layer (the official card's own rule), so a fixture whose user section is
 * empty reads as "no such model" to every write.
 */
const aliyunProviders: NonNullable<SettingsJoin['namespace']>['value'] = {
  aliyun: {
    displayName: 'Aliyun',
    api: 'openai',
    models: [
      { id: 'qwen-max', name: 'Qwen Max' },
      { id: 'qwen-turbo' },
    ],
  },
}

const join: SettingsJoin = {
  namespace: {
    autoGenerate: true,
    ns: 'llm-pi-ai',
    schema: {},
    value: { providers: aliyunProviders },
    user: { providers: aliyunProviders },
    revision: 1,
    applies: 'live',
    secrets: [],
  },
  writable: true,
}

/**
 * Declare a route in BOTH layers of a join, the way a real save does: facts are
 * read from the resolved `value`, writes land in the raw `user` section, so a
 * fixture that moves only one of them tests nothing.
 * @param local - the join to mutate.
 * @param route - the route key to declare.
 * @param profile - the profile to store.
 */
function declareRoute(local: SettingsJoin, route: string, profile: Record<string, unknown>): void {
  for (const layer of ['value', 'user'] as const) {
    ;(local.namespace![layer] as { providers: Record<string, unknown> }).providers[route] = profile
  }
}

/** One handle reconcile received back from mount(), with its spies. */
interface FakeEditor {
  unmount: ReturnType<typeof vi.fn>
  render: ReturnType<typeof vi.fn>
}

function makeDeps(overrides?: Partial<InjectorDeps>): InjectorDeps & {
  editors: FakeEditor[]
  mutate: ReturnType<typeof vi.fn>
} {
  const editors: FakeEditor[] = []
  const mount = vi.fn<(container: HTMLElement, props: EditorMountProps) => MountedEditor>((container, _props) => {
    // Mirror the real mount: the editor DOM carries the plugin marker, which
    // is what the idempotency guard checks.
    const marker = document.createElement('div')
    marker.dataset['plugin'] = 'dsh-model-think-level'
    container.appendChild(marker)
    const editor: FakeEditor = {
      unmount: vi.fn(() => { marker.remove() }),
      render: vi.fn(),
    }
    editors.push(editor)
    return editor as unknown as MountedEditor
  })
  const mutate = vi.fn(async (_ns: string, _ops: unknown[], _rev?: number) => ({ ok: true, value: undefined }))
  // The write seam describes through api.settings.describe, not through the
  // injector's describeNamespace — wire both to the same (overridable) read
  // so a test's dynamic document is what a flush sees too.
  const describeNamespace = overrides?.describeNamespace ?? (async () => join)
  const apiFace = {
    settings: {
      describe: async () => {
        const local = await describeNamespace()
        return { ok: true, value: { writable: true, hasDocument: true, namespaces: local.namespace === undefined ? [] : [local.namespace] } }
      },
      mutate,
    },
  } as unknown as RemoteApi
  return {
    api: apiFace,
    describeNamespace,
    t: (key: string) => key,
    // The English anchors, as the real hostLabels() resolves them against the
    // host's 'settings.models' dictionary while English is active (the test
    // DOM below renders the official page in English).
    labels: () => ({
      capacity: ['Capacities'],
      modelId: ['Model ID'],
      modelName: ['Display name'],
      routeId: ['Provider ID'],
      baseUrl: ['Base URL'],
      apiProtocol: ['API protocol'],
      apply: ['Apply'],
      cancel: ['Cancel'],
      editProvider: ['Edit {provider}'],
    }),
    mount,
    editors,
    mutate,
    ...overrides,
  }
}

beforeEach(() => {
  document.body.innerHTML = ''
  vi.restoreAllMocks()
  // The held-write ledgers ride sessionStorage: without this, one case's
  // queued intent would be restored into the next case's scan state.
  sessionStorage.clear()
})

/** Run reconcile then flush the describe-then-mount microtask chain. */
async function settle(reconcileFn: () => void, state: ReturnType<typeof createScanState>): Promise<void> {
  reconcileFn()
  // The describe promise resolves in a microtask; its .then mounts editors
  // in another. Two ticks cover both.
  await state.describePromise
  await Promise.resolve()
  await Promise.resolve()
}

/**
 * Close the editing surface, then run the IDLE pass. The plugin lands what it
 * held back only once no official card is on the page: writing while one is
 * open is exactly what made the user's own save in that card fail with
 * `settings/conflict`.
 * @param deps - the injection dependencies.
 * @param state - mutable scan state.
 */
async function settleIdle(deps: InjectorDeps, state: ReturnType<typeof createScanState>): Promise<void> {
  document.body.innerHTML = ''
  reconcile(document.body, deps, state)
  // The idle pass drains the queued writes and then the pending flush, each
  // through its own describe → mutate round trip; a macrotask turn lets that
  // whole microtask chain settle.
  await new Promise(resolve => { setTimeout(resolve, 0) })
  await new Promise(resolve => { setTimeout(resolve, 0) })
}

/** Build an approximation of the official create card, typed and draftable. */
function buildCreateDom(route = 'acme-gateway'): HTMLElement {
  const section = document.createElement('div')
  section.className = 'section'
  section.innerHTML = `
    <div class="editor">
      <div class="editorHeader"><span class="editorTitle">Custom provider</span></div>
      <div class="field"><input aria-label="Provider ID" value="${route}" /></div>
      <div class="field"><input aria-label="Base URL" value="https://gw.example.com/v1" /></div>
      <div class="field"><select aria-label="API protocol"><option selected>openai-completions</option></select></div>
      <div class="modelCatalog">
        <div class="modelEntry">
          <div class="modelRow">
            <input aria-label="Model ID" value="deepseek-v4-flash-free" />
            <button aria-label="Capacities 1"></button>
          </div>
          <div class="modelAdvanced" style="display:block">
            <label><span>Context window</span><input /></label>
            <label><span>Max tokens</span><input /></label>
          </div>
        </div>
      </div>
    </div>`
  document.body.appendChild(section)
  return section
}

describe('reconcile', () => {
  it('mounts one editor per model row with the right props', async () => {
    const deps = makeDeps()
    const state = createScanState()
    const root = buildModelsDom()
    await settle(() => reconcile(root, deps, state), state)
    expect(deps.mount).toHaveBeenCalledTimes(2)
    const calls = vi.mocked(deps.mount).mock.calls
    const firstProps = calls[0][1] as EditorMountProps
    expect(firstProps.modelId).toBe('qwen-max')
    expect(firstProps.route).toBe('aliyun')
    expect(firstProps.efforts).toBeUndefined()
    expect(firstProps.readOnly).toBe(false)
    // Row ordinals are real indexes, not a hardcoded 0.
    expect(firstProps.index).toBe(0)
    const secondProps = calls[1][1] as EditorMountProps
    expect(secondProps.modelId).toBe('qwen-turbo')
    expect(secondProps.index).toBe(1)
  })

  it('sniffs the official input-types capability per row from the disclosure DOM', async () => {
    // 0.1.6-alpha.2 renders its own ModelInputTypes control inside the
    // expanded disclosure. The plugin reads that DOM fact as the CAPABILITY
    // (never a version number) so its own modality section can stand down on
    // exactly the rows the official editor owns.
    const deps = makeDeps()
    const state = createScanState()
    const root = buildModelsDom()
    root.querySelectorAll('.modelAdvanced')[0]!.insertAdjacentHTML(
      'beforeend',
      '<fieldset class="ModelsSection_modelInputTypes__hash" aria-label="Input types 1"><legend>Input types</legend></fieldset>',
    )
    await settle(() => reconcile(root, deps, state), state)
    const calls = vi.mocked(deps.mount).mock.calls
    expect((calls[0]![1] as EditorMountProps).officialInputTypes).toBe(true)
    expect((calls[1]![1] as EditorMountProps).officialInputTypes).toBe(false)
  })

  it('is idempotent: a second scan does not double-mount', async () => {
    const deps = makeDeps()
    const state = createScanState()
    const root = buildModelsDom()
    await settle(() => reconcile(root, deps, state), state)
    expect(deps.mount).toHaveBeenCalledTimes(2)
    await settle(() => reconcile(root, deps, state), state)
    expect(deps.mount).toHaveBeenCalledTimes(2)
  })

  it('refreshes an existing editor when the saved declaration changes under it', async () => {
    // The official page may keep the container node and only move the
    // document under it; the editor must not keep showing a stale saved
    // declaration (its Apply button would never reset).
    const localJoin: SettingsJoin = structuredClone(join)
    const deps = makeDeps({ describeNamespace: async () => localJoin })
    const state = createScanState()
    const root = buildModelsDom()
    await settle(() => reconcile(root, deps, state), state)
    expect(deps.mount).toHaveBeenCalledTimes(2)
    expect(deps.editors[0]!.render).not.toHaveBeenCalled()

    const providers = (localJoin.namespace!.value as { providers: Record<string, { models: Array<Record<string, unknown>> }> }).providers
    providers.aliyun.models[0]!['reasoningEfforts'] = { high: 'high' }
    // The apply()-level invalidation clears the folded snapshot; the next
    // scan re-describes and swaps the fresh props in place.
    state.describePromise = undefined
    await settle(() => reconcile(root, deps, state), state)

    expect(deps.mount).toHaveBeenCalledTimes(2)
    expect(deps.editors[0]!.render).toHaveBeenCalledTimes(1)
    const refreshed = vi.mocked(deps.editors[0]!.render).mock.calls[0]![0] as EditorMountProps
    expect(refreshed.efforts).toEqual({ high: 'high' })
    // The untouched row is not re-rendered.
    expect(deps.editors[1]!.render).not.toHaveBeenCalled()
  })

  it('does not re-render editors whose props did not change', async () => {
    // render mutates DOM and DOM mutations schedule scans: without a no-op
    // guard the refresh would feed itself forever.
    const deps = makeDeps()
    const state = createScanState()
    const root = buildModelsDom()
    await settle(() => reconcile(root, deps, state), state)
    state.describePromise = undefined
    await settle(() => reconcile(root, deps, state), state)
    expect(deps.mount).toHaveBeenCalledTimes(2)
    for (const editor of deps.editors) expect(editor.render).not.toHaveBeenCalled()
  })

  it('unmounts editors whose rows disappeared', async () => {
    const deps = makeDeps()
    const state = createScanState()
    const root = buildModelsDom()
    await settle(() => reconcile(root, deps, state), state)
    expect(state.mounted.size).toBe(2)
    // Remove one model row entirely.
    root.querySelectorAll('.modelEntry')[1]?.remove()
    await settle(() => reconcile(root, deps, state), state)
    expect(state.mounted.size).toBe(1)
  })

  it('does not mount when the model id is still empty (mid-edit)', async () => {
    const deps = makeDeps()
    const state = createScanState()
    document.body.innerHTML = `
      <div class="section"><h2>Models</h2>
        <div class="editor"><span class="editorTitle">Aliyun</span>
          <div class="modelEntry">
            <div class="modelRow">
              <input aria-label="Model ID" value="" />
              <button aria-label="Capacities 1"></button>
            </div>
            <div class="modelAdvanced"><label><span>Context window</span><input /></label></div>
          </div>
        </div>
      </div>`
    const root = document.querySelector('.section') as HTMLElement
    await settle(() => reconcile(root, deps, state), state)
    expect(deps.mount).not.toHaveBeenCalled()
  })

  it('skips a row whose route cannot be resolved', async () => {
    const deps = makeDeps({
      describeNamespace: async () => ({ namespace: undefined, writable: true }),
    })
    const state = createScanState()
    const root = buildModelsDom()
    await settle(() => reconcile(root, deps, state), state)
    expect(deps.mount).not.toHaveBeenCalled()
  })

  it('resolves the route from the editorRoute tag first, then the title', async () => {
    // The official edit card prints the route key as `.editorRoute` beside the
    // display-name title; the create card prints a fixed heading with no key.
    const dom = document.createElement('div')
    dom.className = 'section'
    dom.innerHTML = `
      <div class="editor">
        <div class="editorHeader">
          <span class="editorTitle">Aliyun</span>
          <span class="editorRoute">aliyun</span>
        </div>
        <div class="modelEntry">
          <div class="modelRow">
            <input aria-label="Model ID" value="qwen-max" />
            <button aria-label="Capacities 1"></button>
          </div>
          <div class="modelAdvanced"><label><span>Context window</span><input /></label></div>
        </div>
      </div>
      <div class="editor">
        <div class="editorHeader">
          <span class="editorTitle">Custom provider</span>
        </div>
        <div class="modelEntry">
          <div class="modelRow">
            <input aria-label="Model ID" value="mystery" />
            <button aria-label="Capacities 2"></button>
          </div>
          <div class="modelAdvanced"><label><span>Context window</span><input /></label></div>
        </div>
      </div>`
    document.body.appendChild(dom)
    const root = document.querySelector('.section') as HTMLElement
    const deps = makeDeps()
    const state = createScanState()
    await settle(() => reconcile(root, deps, state), state)
    // The edit card resolves to 'aliyun'; the second card (fixed heading, no
    // key, no Provider ID input) cannot resolve a route and stays unmounted.
    const props = vi.mocked(deps.mount).mock.calls.map(call => call[1] as EditorMountProps)
    expect(props).toHaveLength(1)
    expect(props[0].route).toBe('aliyun')
  })

  it('mounts a provider that never set a display name by its route-key title', async () => {
    // A nameless provider renders its ROUTE KEY as the card title AND hides
    // the .editorRoute tag (the host falls back to the key and only prints the
    // tag while the name differs), so the display-name arm alone can never
    // resolve it: the route must fall back to the title as a route key.
    const nameless: SettingsJoin = structuredClone(join)
    const providers = (nameless.namespace!.value as { providers: Record<string, unknown> }).providers
    delete providers['aliyun']
    providers['opencode-zen'] = {
      api: 'openai-responses',
      baseURL: 'https://opencode.ai/zen/v1',
      models: [{ id: 'muse-spark-1.3-contributor-free' }],
    }
    const deps = makeDeps({ describeNamespace: async () => nameless })
    const state = createScanState()
    document.body.innerHTML = `
      <div class="section">
        <div class="editor">
          <div class="editorHeader"><span class="editorTitle">opencode-zen</span></div>
          <div class="modelCatalog">
            <div class="modelEntry">
              <div class="modelRow">
                <input aria-label="Model ID" value="muse-spark-1.3-contributor-free" />
                <button aria-label="Capacities 1"></button>
              </div>
              <div class="modelAdvanced" style="display:block">
                <label><span>Context window</span><input /></label>
              </div>
            </div>
          </div>
        </div>
      </div>`
    const root = document.querySelector('.section') as HTMLElement
    await settle(() => reconcile(root, deps, state), state)
    expect(deps.mount).toHaveBeenCalledTimes(1)
    const props = vi.mocked(deps.mount).mock.calls[0]![1] as EditorMountProps
    expect(props.route).toBe('opencode-zen')
    expect(props.staged).toBe(false)
    expect(props.modelId).toBe('muse-spark-1.3-contributor-free')
    expect(props.routeDisplayName).toBe('opencode-zen')
  })

  it('still refuses a title that is neither a route key nor a display name', async () => {
    const deps = makeDeps()
    const state = createScanState()
    document.body.innerHTML = `
      <div class="section">
        <div class="editor">
          <div class="editorHeader"><span class="editorTitle">ghost</span></div>
          <div class="modelCatalog">
            <div class="modelEntry">
              <div class="modelRow">
                <input aria-label="Model ID" value="qwen-max" />
                <button aria-label="Capacities 1"></button>
              </div>
              <div class="modelAdvanced" style="display:block">
                <label><span>Context window</span><input /></label>
              </div>
            </div>
          </div>
        </div>
      </div>`
    const root = document.querySelector('.section') as HTMLElement
    await settle(() => reconcile(root, deps, state), state)
    expect(deps.mount).not.toHaveBeenCalled()
  })

  it('skips the describe read while no capacity rows are present', async () => {
    // Most mutations in a running app fire nowhere near the Models page;
    // the scan gate must not spend a wire read on them.
    const describe = vi.fn(async () => join)
    const deps = makeDeps({ describeNamespace: describe })
    const state = createScanState()
    document.body.innerHTML = '<div class="chat"><p>streaming…</p></div>'
    reconcile(document.body, deps, state)
    await Promise.resolve()
    await Promise.resolve()
    expect(describe).not.toHaveBeenCalled()
    expect(state.mounted.size).toBe(0)
  })

  it('unmounts editors when the models page disappears, without a wire read', async () => {
    const deps = makeDeps()
    const state = createScanState()
    const root = buildModelsDom()
    await settle(() => reconcile(root, deps, state), state)
    expect(state.mounted.size).toBe(2)
    // Navigation replaces the whole section with something else.
    document.body.innerHTML = '<div class="chat"><p>hello</p></div>'
    await settle(() => reconcile(document.body, deps, state), state)
    expect(state.mounted.size).toBe(0)
    for (const editor of deps.editors) expect(editor.unmount).toHaveBeenCalled()
  })

  it('scans a document.body root, matching the plugin\'s real panel root', async () => {
    const deps = makeDeps()
    const state = createScanState()
    buildModelsDom() // appends the section to document.body
    await settle(() => reconcile(document.body, deps, state), state)
    expect(deps.mount).toHaveBeenCalledTimes(2)
  })

  it('retries the describe read after a rejection instead of staying disabled', async () => {
    let healthy = false
    const describe = vi.fn(async () => {
      if (!healthy) throw new Error('wire down')
      return join
    })
    const deps = makeDeps({ describeNamespace: describe })
    const state = createScanState()
    const root = buildModelsDom()
    reconcile(root, deps, state)
    // reconcile's own rejection handler clears the folded promise.
    await Promise.resolve()
    await Promise.resolve()
    expect(state.describePromise).toBeUndefined()
    expect(deps.mount).not.toHaveBeenCalled()
    // The next scan retries and succeeds.
    healthy = true
    await settle(() => reconcile(root, deps, state), state)
    expect(deps.mount).toHaveBeenCalledTimes(2)
  })

  it('re-describes after a pushed invalidation clears the folded snapshot', async () => {
    const describe = vi.fn(async () => join)
    const deps = makeDeps({ describeNamespace: describe })
    const state = createScanState()
    const root = buildModelsDom()
    await settle(() => reconcile(root, deps, state), state)
    expect(describe).toHaveBeenCalledTimes(1)
    // The apply()-level refresh (settings/document-updated, connection/reset)
    // clears the fold; the next scan must re-read, not reuse the stale join.
    state.describePromise = undefined
    await settle(() => reconcile(root, deps, state), state)
    expect(describe).toHaveBeenCalledTimes(2)
  })

  it('mounts again when a removed row reappears with a fresh container', async () => {
    const deps = makeDeps()
    const state = createScanState()
    const root = buildModelsDom()
    await settle(() => reconcile(root, deps, state), state)
    expect(state.mounted.size).toBe(2)
    root.querySelectorAll('.modelEntry')[0]?.remove()
    await settle(() => reconcile(root, deps, state), state)
    expect(state.mounted.size).toBe(1)
    // A fresh row with the same model id appears.
    const replacement = document.createElement('div')
    replacement.className = 'modelEntry'
    replacement.innerHTML = `
      <div class="modelRow">
        <input aria-label="Model ID" value="qwen-max" />
        <button aria-label="Capacities 1"></button>
      </div>
      <div class="modelAdvanced"><label><span>Context window</span><input /></label></div>`
    root.querySelector('.modelCatalog')?.appendChild(replacement)
    await settle(() => reconcile(root, deps, state), state)
    expect(state.mounted.size).toBe(2)
  })

  it('mounts a staged editor on the create card from its typed route id', async () => {
    const deps = makeDeps()
    const state = createScanState()
    const root = buildCreateDom('acme-gateway')
    await settle(() => reconcile(root, deps, state), state)
    expect(deps.mount).toHaveBeenCalledTimes(1)
    const props = vi.mocked(deps.mount).mock.calls[0]![1] as EditorMountProps
    expect(props.route).toBe('acme-gateway')
    expect(props.staged).toBe(true)
    expect(props.modelId).toBe('deepseek-v4-flash-free')
    // The create card's typed facts stand in for the (absent) stored profile.
    expect(props.routeApi).toBe('openai-completions')
    expect(props.routeBaseURL).toBe('https://gw.example.com/v1')
  })

  it('leaves the create card unmounted while its route id is still blank', async () => {
    const deps = makeDeps()
    const state = createScanState()
    const root = buildCreateDom('')
    await settle(() => reconcile(root, deps, state), state)
    expect(deps.mount).not.toHaveBeenCalled()
  })

  it('never mistakes a create card for an edit card over a colliding title', async () => {
    // A provider whose display name is literally "Custom provider" must not
    // capture the create card's rows (the create card is marked by its
    // Provider ID input, and wins over the display-name arm).
    const colliding: SettingsJoin = structuredClone(join)
    ;(colliding.namespace!.value as { providers: Record<string, unknown> }).providers['acme'] = {
      displayName: 'Custom provider',
      models: [{ id: 'deepseek-v4-flash-free' }],
    }
    const deps = makeDeps({ describeNamespace: async () => colliding })
    const state = createScanState()
    const root = buildCreateDom('')
    await settle(() => reconcile(root, deps, state), state)
    expect(deps.mount).not.toHaveBeenCalled()
  })

  it('reads a staged row\'s baseline from the pending store', async () => {
    const deps = makeDeps()
    const state = createScanState()
    stageEffortsInto(state, 'acme-gateway', 'deepseek-v4-flash-free', { off: null, low: 'low', high: 'high', max: 'max' })
    const root = buildCreateDom('acme-gateway')
    await settle(() => reconcile(root, deps, state), state)
    const props = vi.mocked(deps.mount).mock.calls[0]![1] as EditorMountProps
    expect(props.efforts).toEqual({ off: null, low: 'low', high: 'high', max: 'max' })
  })

  it('flushes staged declarations once the route appears in the document', async () => {
    let saved = false
    const describe = vi.fn(async (): Promise<SettingsJoin> => {
      const local = structuredClone(join)
      if (saved) {
        declareRoute(local, 'acme-gateway', {
          api: 'openai-completions',
          models: [{ id: 'deepseek-v4-flash-free' }],
        })
      }
      return local
    })
    const deps = makeDeps({ describeNamespace: describe })
    const state = createScanState()
    stageEffortsInto(state, 'acme-gateway', 'deepseek-v4-flash-free', { off: null, low: 'low', high: 'high', max: 'max' }, {
      thinkingFormat: 'deepseek',
      supportsReasoningEffort: true,
    })
    // The create card is open (route unsaved): one scan stages, nothing writes.
    const root = buildCreateDom('acme-gateway')
    await settle(() => reconcile(root, deps, state), state)
    expect(deps.mutate).not.toHaveBeenCalled()

    // The official save lands the route, but the card is still open: nothing
    // may be written while it holds the document.
    saved = true
    state.describePromise = undefined
    await settle(() => reconcile(root, deps, state), state)
    expect(deps.mutate).not.toHaveBeenCalled()

    // Closing the card is the idle pass -- now the declaration lands.
    await settleIdle(deps, state)
    expect(deps.mutate).toHaveBeenCalledTimes(1)
    const op = deps.mutate.mock.calls[0]![1][0]
    expect(op.path).toEqual(['providers', 'acme-gateway', 'models'])
    const flushed = op.value as Array<Record<string, unknown>>
    expect(flushed[0]!['reasoningEfforts']).toEqual({ off: null, low: 'low', high: 'high', max: 'max' })
    // The staged compat flushed beside the declaration — the same bytes the
    // host autofill writes.
    expect(flushed[0]!['compat']).toEqual({ thinkingFormat: 'deepseek', supportsReasoningEffort: true })
    // The landed declaration left the pending store.
    expect(state.pending.size).toBe(0)
  })

  it('flips a mounted staged editor to write mode once its route is saved', async () => {
    // A create card whose disclosure container survives the save transition
    // must not keep its editor in staging mode: sameProps compares `staged`
    // so the refresh swaps fresh props (and the Apply contract) in place.
    let saved = false
    const describe = vi.fn(async (): Promise<SettingsJoin> => {
      if (!saved) return join
      const local = structuredClone(join)
      declareRoute(local, 'acme-gateway', {
        displayName: 'acme-gateway',
        api: 'openai-completions',
        models: [{ id: 'deepseek-v4-flash-free' }],
      })
      return local
    })
    const deps = makeDeps({ describeNamespace: describe })
    const state = createScanState()
    stageEffortsInto(state, 'acme-gateway', 'deepseek-v4-flash-free', { high: 'high' })
    const root = buildCreateDom('acme-gateway')
    await settle(() => reconcile(root, deps, state), state)
    expect(deps.mount).toHaveBeenCalledTimes(1)
    expect((vi.mocked(deps.mount).mock.calls[0]![1] as EditorMountProps).staged).toBe(true)
    expect(deps.editors[0]!.render).not.toHaveBeenCalled()

    // The save lands under the SAME container and the card morphs into its
    // edit view (the Provider ID input is replaced by the printed route tag):
    // the next scan must re-render with staged=false even though every other
    // prop is identical.
    saved = true
    const providerField = Array.from(root.querySelectorAll('.field'))
      .find(field => field.querySelector('input[aria-label="Provider ID"]'))
    providerField?.remove()
    root.querySelector('.editorHeader')?.insertAdjacentHTML('beforeend', '<span class="editorRoute">acme-gateway</span>')
    state.describePromise = undefined
    await settle(() => reconcile(root, deps, state), state)
    await Promise.resolve()
    await Promise.resolve()
    // Not remounted — refreshed in place, out of staging mode.
    expect(deps.mount).toHaveBeenCalledTimes(1)
    expect(deps.editors[0]!.render).toHaveBeenCalledTimes(1)
    const refreshed = vi.mocked(deps.editors[0]!.render).mock.calls[0]![0] as EditorMountProps
    expect(refreshed.staged).toBe(false)
    expect(refreshed.route).toBe('acme-gateway')
    // The staged declaration waits for the card to close: writing while it is
    // open is what used to break the user's own save in that very card.
    expect(deps.mutate).not.toHaveBeenCalled()
    await settleIdle(deps, state)
    expect(deps.mutate).toHaveBeenCalled()
  })

  it('keeps staged declarations staged when a flush read fails', async () => {
    // flushRoute reads the wire through the live describe seam; when that
    // read rejects (transport down), the rejection must be contained — the
    // declarations stay staged and the next scan retries.
    let calls = 0
    const describe = vi.fn(async (): Promise<SettingsJoin> => {
      calls += 1
      if (calls >= 3) throw new Error('wire down')
      if (calls === 2) {
        const local = structuredClone(join)
        declareRoute(local, 'acme-gateway', {
          api: 'openai-completions',
          models: [{ id: 'deepseek-v4-flash-free' }],
        })
        return local
      }
      return join
    })
    const deps = makeDeps({ describeNamespace: describe })
    const state = createScanState()
    stageEffortsInto(state, 'acme-gateway', 'deepseek-v4-flash-free', { high: 'high' })
    const root = buildCreateDom('acme-gateway')
    // Scan one: the route is unsaved — stages, no flush, no write.
    await settle(() => reconcile(root, deps, state), state)
    expect(deps.mutate).not.toHaveBeenCalled()
    // Scan two sees the saved route, but the card is still open so the flush
    // waits. Closing it triggers the idle pass, whose own live read rejects
    // (transport down): the rejection must be contained, and the declaration
    // stays staged for the next pass.
    state.describePromise = undefined
    await settle(() => reconcile(root, deps, state), state)
    expect(deps.mutate).not.toHaveBeenCalled()
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    await settleIdle(deps, state)
    expect(deps.mutate).not.toHaveBeenCalled()
    expect(state.pending.size).toBe(1)
    expect(errorSpy.mock.calls[0]![0]).toContain('idle flush failed')
    errorSpy.mockRestore()
  })

  it('drops empty pending routes instead of rescanning them forever', async () => {
    const deps = makeDeps()
    const state = createScanState()
    state.pending.set('acme-gateway', new Map())
    const root = buildCreateDom('acme-gateway')
    await settle(() => reconcile(root, deps, state), state)
    await settleIdle(deps, state)
    expect(state.pending.has('acme-gateway')).toBe(false)
  })

  it('drops a staged declaration the saved profile already answers', async () => {
    // "Never silently overwrite": a model carrying a declaration (or an unset
    // marker) when its route appears keeps what the document says.
    const answered: SettingsJoin = structuredClone(join)
    declareRoute(answered, 'acme-gateway', {
      api: 'openai-completions',
      models: [{ id: 'deepseek-v4-flash-free', reasoningEfforts: { high: 'high' } }],
    })
    const deps = makeDeps({ describeNamespace: async () => answered })
    const state = createScanState()
    stageEffortsInto(state, 'acme-gateway', 'deepseek-v4-flash-free', { low: 'low' })
    const root = buildCreateDom('acme-gateway')
    await settle(() => reconcile(root, deps, state), state)
    await settleIdle(deps, state)
    expect(deps.mutate).not.toHaveBeenCalled()
    expect(state.pending.size).toBe(0)
  })

  it('holds an editor Apply while the card is open and lands it on the idle pass', async () => {
    // The regression behind issue #7: a write from inside the open card rides
    // the card's own frozen revision baseline, so the user's NEXT save in that
    // card is refused with `settings/conflict` and their edit reads as lost.
    // The mounted seam therefore queues the intent and nothing commits until
    // the card is gone.
    const deps = makeDeps()
    const state = createScanState()
    const root = buildModelsDom()
    await settle(() => reconcile(root, deps, state), state)
    const props = vi.mocked(deps.mount).mock.calls[0]![1] as EditorMountProps

    const reply = await props.api.writeEfforts('aliyun', 'qwen-max', { high: 'high' })
    expect(reply).toEqual({ ok: true, staged: true })
    expect(deps.mutate).not.toHaveBeenCalled()
    expect(state.queued.get('aliyun')?.get('qwen-max')).toEqual({ efforts: { high: 'high' } })

    // Closing the card replays the very same intent through a holder-less seam.
    await settleIdle(deps, state)
    expect(deps.mutate).toHaveBeenCalledTimes(1)
    const op = deps.mutate.mock.calls[0]![1][0]
    expect(op.path).toEqual(['providers', 'aliyun', 'models'])
    const flushed = (op.value as Array<Record<string, unknown>>).find(model => model['id'] === 'qwen-max')
    expect(flushed!['reasoningEfforts']).toEqual({ high: 'high' })
    // The sibling row rode along untouched, and the queue drained.
    expect((op.value as Array<Record<string, unknown>>).find(model => model['id'] === 'qwen-turbo'))
      .toEqual({ id: 'qwen-turbo' })
    expect(state.queued.size).toBe(0)
  })
})

describe('effectiveStagedIntents (per-part flush decisions)', () => {
  it('keeps the modality part alive when the ladder was taken over mid-window', () => {
    // The realistic race: this plugin's own autofill declares the ladder on
    // the route-creation update -- the staged image toggle must survive it.
    const effective = effectiveStagedIntents(
      { efforts: 'keep', input: ['text', 'image'] },
      { id: 'x', reasoningEfforts: { high: 'high' } },
    )
    expect(effective).toEqual({ efforts: 'keep', input: ['text', 'image'] })
  })

  it('keeps the ladder part alive when modalities were deliberately unset', () => {
    const effective = effectiveStagedIntents(
      { efforts: { high: 'high' }, input: ['text'] },
      { id: 'x', inputUnset: true },
    )
    expect(effective).toEqual({ efforts: { high: 'high' } })
  })

  it('returns null when the model vanished from the saved card', () => {
    expect(effectiveStagedIntents({ efforts: 'keep', input: ['text'] }, undefined)).toBeNull()
  })

  it('returns null when every part was taken over or is a keep', () => {
    expect(
      effectiveStagedIntents(
        { efforts: 'keep', input: ['text'] },
        { id: 'x', reasoningEfforts: false, input: ['text'] },
      ),
    ).toBeNull()
  })

  it('passes a full staged declaration through untouched on a bare row', () => {
    const effective = effectiveStagedIntents(
      { efforts: { high: 'high' }, compat: { thinkingFormat: 'deepseek', supportsReasoningEffort: true }, input: ['text', 'image'] },
      { id: 'x' },
    )
    expect(effective).toEqual({
      efforts: { high: 'high' },
      compat: { thinkingFormat: 'deepseek', supportsReasoningEffort: true },
      input: ['text', 'image'],
    })
  })

  it('treats a declaration equal to the autofill footprint as not taken over', () => {
    // The host autofill writes the knowledge base's own suggestion in the
    // route-creation window; those bytes are this plugin's PROPOSAL, not a
    // user decision, so a staged intent must outrank them instead of being
    // withdrawn as "already answered".
    const kb: ReasoningEfforts = { off: 'none', low: 'low', high: 'high', max: 'max' }
    const effective = effectiveStagedIntents(
      { efforts: 'keep', input: ['text', 'image'] },
      { id: 'x', reasoningEfforts: { ...kb }, input: ['text'] },
      { efforts: kb, input: ['text'] },
    )
    expect(effective).toEqual({ efforts: 'keep', input: ['text', 'image'] })
  })

  it('still yields to a hand-tuned declaration that differs from the footprint', () => {
    const effective = effectiveStagedIntents(
      { efforts: { low: 'low' }, input: ['text', 'image'] },
      { id: 'x', reasoningEfforts: { high: 'high' }, input: ['text'] },
      { efforts: { off: 'none', low: 'low', high: 'high', max: 'max' }, input: ['text'] },
    )
    expect(effective).toEqual({ efforts: 'keep', input: ['text', 'image'] })
  })
})

describe('unsaved model rows on a saved route (the model-not-found flow)', () => {
  it('mounts a staged editor for a typed-but-unsaved model row on a saved route', async () => {
    // Adding a model to an EXISTING provider: the row is not in the document
    // yet, so a direct write bounces model-not-found. The editor must stage
    // instead, exactly like the create card, and the flush lands the
    // declaration once the row is saved.
    let saved = false
    const describe = vi.fn(async (): Promise<SettingsJoin> => {
      const local = structuredClone(join)
      if (saved) {
        for (const layer of ['value', 'user'] as const) {
          ;(local.namespace![layer] as { providers: { aliyun: { models: Array<Record<string, unknown>> } } })
            .providers.aliyun.models.push({ id: 'qwen-new' })
        }
      }
      return local
    })
    const deps = makeDeps({ describeNamespace: describe })
    const state = createScanState()
    const root = buildModelsDom()
    const row = [
      '<div class="modelEntry">',
      '  <div class="modelRow">',
      '    <input aria-label="Model ID" value="qwen-new" />',
      '    <input aria-label="Display name" value="Qwen New Display" />',
      '    <button aria-label="Capacities 3"></button>',
      '  </div>',
      '  <div class="modelAdvanced" style="display:block"><label><span>Context window</span><input /></label></div>',
      '</div>',
    ].join('\n')
    root.querySelector('.modelCatalog')?.insertAdjacentHTML('beforeend', row)
    await settle(() => reconcile(root, deps, state), state)
    const props = vi.mocked(deps.mount).mock.calls.map(call => call[1] as EditorMountProps)
    const unsaved = props.find(candidate => candidate.modelId === 'qwen-new')
    expect(unsaved?.staged).toBe(true)
    // The typed Display name rides along: suggestion inference (knowledge-base
    // matching + heuristics) reads it even before the row is saved.
    expect(unsaved?.modelName).toBe('Qwen New Display')

    // The user clicks Apply: the declaration stages; no settings write yet.
    stageEffortsInto(state, 'aliyun', 'qwen-new', { low: 'low' }, undefined, ['text', 'image'])
    // An intermediate scan (the user still editing the card) must NOT
    // withdraw the staging just because the row is not saved yet.
    state.describePromise = undefined
    await settle(() => reconcile(root, deps, state), state)
    await Promise.resolve()
    await Promise.resolve()
    expect(deps.mutate).not.toHaveBeenCalled()
    expect(state.pending.get('aliyun')?.has('qwen-new')).toBe(true)

    // The official save lands the row; the card is still open, so the staged
    // parts wait for the idle pass.
    saved = true
    state.describePromise = undefined
    await settle(() => reconcile(root, deps, state), state)
    expect(deps.mutate).not.toHaveBeenCalled()
    await settleIdle(deps, state)
    expect(deps.mutate).toHaveBeenCalledTimes(1)
    const op = deps.mutate.mock.calls[0]![1][0]
    const flushed = (op.value as Array<Record<string, unknown>>).find(model => model['id'] === 'qwen-new')
    expect(flushed!['reasoningEfforts']).toEqual({ low: 'low' })
    expect(flushed!['input']).toEqual(['text', 'image'])
    expect(state.pending.size).toBe(0)
  })

  it("lets a staged modality choice overwrite the plugin's own autofill footprint", async () => {
    // The realistic loss behind the disappearing image toggle: the host
    // autofill fills the fresh row with the knowledge base's text-only
    // declaration within the route-creation window, and the staged image
    // choice used to be withdrawn as "already answered" a moment later.
    const suggestion = suggestEfforts('deepseek-v4-flash-free', { api: 'openai-completions' })
    expect(suggestion.input).toEqual(['text'])
    const autofilled: SettingsJoin = structuredClone(join)
    declareRoute(autofilled, 'acme-gateway', {
      api: 'openai-completions',
      models: [{
        id: 'deepseek-v4-flash-free',
        reasoningEfforts: suggestion.efforts,
        input: suggestion.input,
        compat: { thinkingFormat: 'deepseek', supportsReasoningEffort: true },
      }],
    })
    const deps = makeDeps({ describeNamespace: async () => autofilled })
    const state = createScanState()
    stageEffortsInto(state, 'acme-gateway', 'deepseek-v4-flash-free', 'keep', undefined, ['text', 'image'])
    const root = buildCreateDom('acme-gateway')
    await settle(() => reconcile(root, deps, state), state)
    await settleIdle(deps, state)
    expect(deps.mutate).toHaveBeenCalledTimes(1)
    const op = deps.mutate.mock.calls[0]![1][0]
    const flushed = (op.value as Array<Record<string, unknown>>)[0]!
    // The staged image choice overwrote the autofill's text-only input...
    expect(flushed['input']).toEqual(['text', 'image'])
    // ...while the 'keep' ladder left the autofilled declaration untouched.
    expect(flushed['reasoningEfforts']).toEqual(suggestion.efforts)
    expect(state.pending.size).toBe(0)
  })
})

describe('ghosted staging recycling', () => {
  it('withdraws staging whose saved-route row disappeared for two consecutive scans', async () => {
    const deps = makeDeps()
    const state = createScanState()
    const root = buildModelsDom()
    root.querySelector('.modelCatalog')?.insertAdjacentHTML('beforeend', [
      '<div class="modelEntry">',
      '  <div class="modelRow">',
      '    <input aria-label="Model ID" value="qwen-new" />',
      '    <button aria-label="Capacities 3"></button>',
      '  </div>',
      '  <div class="modelAdvanced" style="display:block"><label><span>Context window</span><input /></label></div>',
      '</div>',
    ].join('\n'))
    stageEffortsInto(state, 'aliyun', 'qwen-new', { low: 'low' }, undefined, ['text'])

    // Scan 1 -- the row is still on the page: no miss, and no flush write
    // (the settings document does not carry the row yet).
    await settle(() => reconcile(root, deps, state), state)
    expect(deps.mutate).not.toHaveBeenCalled()
    expect(state.pending.get('aliyun')?.has('qwen-new')).toBe(true)

    // Scan 2 -- FIRST missing scan (the row was removed from the page): the
    // grace round keeps the staging against transient re-render gaps.
    ;(root.querySelectorAll('.modelEntry')[2] as HTMLElement).remove()
    state.describePromise = undefined
    await settle(() => reconcile(root, deps, state), state)
    expect(state.pending.get('aliyun')?.has('qwen-new')).toBe(true)
    expect(deps.mutate).not.toHaveBeenCalled()

    // Scan 3 -- SECOND consecutive missing scan: the ghost is withdrawn,
    // silently and without any wire write behind it.
    state.describePromise = undefined
    await settle(() => reconcile(root, deps, state), state)
    expect(state.pending.get('aliyun')).toBeUndefined()
    expect(deps.mutate).not.toHaveBeenCalled()
  })

  it('never recycles staging on routes that do not exist yet (an open create card)', async () => {
    const deps = makeDeps()
    const state = createScanState()
    const root = buildCreateDom('acme-gateway')
    stageEffortsInto(state, 'acme-gateway', 'deepseek-v4-flash-free', { low: 'low' }, undefined, undefined)

    // Three scans pass while the create card sits mid-edit: its route is not
    // in the document yet, so every scan "misses" it -- but only SAVED routes
    // are eligible for ghost recycling.
    for (let i = 0; i < 3; i++) {
      await settle(() => reconcile(root, deps, state), state)
      state.describePromise = undefined
    }
    expect(state.pending.get('acme-gateway')?.has('deepseek-v4-flash-free')).toBe(true)
    expect(deps.mutate).not.toHaveBeenCalled()
  })
})

describe('held-write ledgers (persistence, retry, the card fence)', () => {
  it('persists both ledgers and restores them into a same-document scan state', () => {
    const state = createScanState()
    stageEffortsInto(state, 'acme-gateway', 'new-model', { high: 'high' })
    // The commit evidence must be persisted WITH the held write: the ledger
    // can now carry the premise it previously could not.
    state.committing.add('aliyun')
    queueWriteInto(state, 'aliyun', 'qwen-max', { efforts: { high: 'high' } })

    // A plugin-HMR cycle (same document) builds a new scan state: the intents
    // must come back, commit evidence included.
    const restored = createScanState()
    expect(restored.pending.get('acme-gateway')?.get('new-model')).toEqual({ efforts: { high: 'high' } })
    expect(restored.queued.get('aliyun')?.get('qwen-max')).toEqual({ efforts: { high: 'high' } })
    expect(restored.committing.has('aliyun')).toBe(true)
  })

  it('drops a restored held write that carries no commit evidence', () => {
    // A queued edit the user never saved dies with the card (official draft
    // semantics): restoring it without evidence would later resurrect an
    // abandoned edit behind the next Save.
    const state = createScanState()
    queueWriteInto(state, 'aliyun', 'qwen-max', { efforts: { high: 'high' } })
    const restored = createScanState()
    expect(restored.queued.size).toBe(0)
    expect(restored.committing.size).toBe(0)
  })

  it('discards a ledger written by a previous document (a reload)', () => {
    const state = createScanState()
    stageEffortsInto(state, 'acme-gateway', 'new-model', { high: 'high' })
    state.committing.add('aliyun')
    queueWriteInto(state, 'aliyun', 'qwen-max', { efforts: { high: 'high' } })

    // A NEW document: the page reloaded, so both ledgers are gone -- the
    // official card's draft would be gone too.
    delete (globalThis as Record<string, unknown>)['__breLedgerDocument']
    const reloaded = createScanState()
    expect(reloaded.pending.size).toBe(0)
    expect(reloaded.queued.size).toBe(0)
  })

  it('lands a restored, committed intent on the first idle pass after an HMR', async () => {
    const seeded = createScanState()
    seeded.committing.add('aliyun')
    queueWriteInto(seeded, 'aliyun', 'qwen-max', { efforts: { high: 'high' } })

    const deps = makeDeps()
    // Same document: the evidence itself restores the authority to land.
    const reloaded = createScanState()
    await settleIdle(deps, reloaded)

    expect(deps.mutate).toHaveBeenCalledTimes(1)
    expect(reloaded.queued.size).toBe(0)
  })

  it('flushOnUnload lands the committed intents and clears the ledger', async () => {
    const state = createScanState()
    state.committing.add('aliyun')
    queueWriteInto(state, 'aliyun', 'qwen-max', { efforts: { high: 'high' } })

    const deps = makeDeps()
    flushOnUnload(state, deps)
    await new Promise(resolve => { setTimeout(resolve, 0) })

    expect(deps.mutate).toHaveBeenCalledTimes(1)
    // The FILE is gone: a fresh state restores nothing (even though the
    // landed route had commit evidence).
    expect(createScanState().queued.size).toBe(0)
  })

  it('flushOnUnload lands even while a card is open', async () => {
    const state = createScanState()
    state.committing.add('aliyun')
    queueWriteInto(state, 'aliyun', 'qwen-max', { efforts: { high: 'high' } })
    // A card is on the page and the page is going away: its frozen baseline no
    // longer matters, so the last landing must not be fenced.
    const card = document.createElement('div')
    card.className = 'editorActions'
    document.body.appendChild(card)
    try {
      const deps = makeDeps()
      flushOnUnload(state, deps)
      await new Promise(resolve => { setTimeout(resolve, 0) })

      expect(deps.mutate).toHaveBeenCalledTimes(1)
    } finally {
      card.remove()
    }
  })

  it('keeps working when sessionStorage refuses the write', () => {
    const refusing = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('quota exceeded')
    })
    try {
      const state = createScanState()
      expect(() => { queueWriteInto(state, 'aliyun', 'qwen-max', { efforts: { high: 'high' } }) }).not.toThrow()
      expect(state.queued.get('aliyun')?.get('qwen-max')).toEqual({ efforts: { high: 'high' } })
    } finally {
      refusing.mockRestore()
    }
  })

  it('fences the idle pass while a card with no model row is open', async () => {
    const deps = makeDeps()
    const state = createScanState()
    queueWriteInto(state, 'aliyun', 'qwen-max', { efforts: { high: 'high' } })

    // An open provider card whose model list is empty: no capacity button
    // exists, but the card's action row does -- and that card still holds a
    // frozen revision baseline (the rarer half of issue #7).
    const root = document.createElement('div')
    root.innerHTML = `
      <div class="editor">
        <div class="modelCatalog"></div>
        <div class="editorActions">
          <button type="button">Cancel</button>
          <button type="button">Apply</button>
        </div>
      </div>
    `
    document.body.appendChild(root)
    await settle(() => reconcile(root, deps, state), state)
    await new Promise(resolve => { setTimeout(resolve, 0) })

    expect(deps.mutate).not.toHaveBeenCalled()
    expect(state.queued.size).toBe(1)
  })

  it('aborts an in-flight landing when a card opens during the read', async () => {
    const state = createScanState()
    // The card opens in the window between our read and our mutate: landing
    // now would sit behind its frozen revision baseline (issue #7), so the
    // write must abort and keep the intent for a later pass. The fence probes
    // the LIVE DOM, so appending the card during the read is what it sees.
    let card: HTMLElement | undefined
    const deps = makeDeps({
      describeNamespace: async () => {
        card = document.createElement('div')
        card.className = 'editorActions'
        document.body.appendChild(card)
        return join
      },
    })
    queueWriteInto(state, 'aliyun', 'qwen-max', { efforts: { high: 'high' } })
    state.committing.add('aliyun')

    try {
      await settleIdle(deps, state)
      expect(deps.mutate).not.toHaveBeenCalled()
      expect(state.queued.size).toBe(1)
      expect(state.committing.has('aliyun')).toBe(true)
    } finally {
      card?.remove()
    }
  })

  it('keeps the commit marker when a flush is refused, so the retry can happen', async () => {
    const deps = makeDeps()
    deps.mutate.mockResolvedValueOnce({
      ok: false,
      error: { code: 'settings/rejected', message: 'refused' },
    })
    const state = createScanState()
    queueWriteInto(state, 'aliyun', 'qwen-max', { efforts: { high: 'high' } })
    state.committing.add('aliyun')

    await settleIdle(deps, state)
    // A refusal arrives as a value, not a throw: the intent stays for the
    // retry -- and so must the commit marker that authorizes it. Dropping the
    // marker here is what made a refused write wait forever: the next pass
    // reads the route as "never committed" and lands nothing.
    expect(state.queued.size).toBe(1)
    expect(state.committing.has('aliyun')).toBe(true)

    // The refused pass armed a backoff; let it expire and the retry lands.
    state.nextFlushAt = 0
    await settleIdle(deps, state)
    expect(state.queued.size).toBe(0)
    expect(state.committing.has('aliyun')).toBe(false)
    expect(deps.mutate).toHaveBeenCalledTimes(2)
  })

  it('does not let a spent commit marker authorize a later uncommitted edit', async () => {
    const deps = makeDeps()
    const state = createScanState()
    // The user pressed the official Save but had no plugin edit: the marker is
    // spent. Left behind, it would silently land a LATER edit the user never
    // saved -- the card's Save is the contract, and it must stay spent.
    state.committing.add('aliyun')
    await settleIdle(deps, state)
    expect(state.committing.has('aliyun')).toBe(false)

    queueWriteInto(state, 'aliyun', 'qwen-max', { efforts: { high: 'high' } })
    await settleIdle(deps, state)
    expect(deps.mutate).not.toHaveBeenCalled()
    expect(state.queued.size).toBe(1)
  })

  it('backs off after a refused write instead of hammering the wire', async () => {
    const deps = makeDeps()
    deps.mutate.mockResolvedValue({
      ok: false,
      error: { code: 'settings/rejected', message: 'refused' },
    })
    const state = createScanState()
    queueWriteInto(state, 'aliyun', 'qwen-max', { efforts: { high: 'high' } })
    state.committing.add('aliyun')

    await settleIdle(deps, state)
    expect(deps.mutate).toHaveBeenCalledTimes(1)
    // A refusal is a failure of the PASS, not just of the row: without this
    // counter every later scan retries the same doomed write immediately.
    expect(state.flushFailures).toBeGreaterThan(0)
    expect(state.nextFlushAt).toBeGreaterThan(Date.now())

    // A scan inside the backoff window must not write again.
    await settleIdle(deps, state)
    expect(deps.mutate).toHaveBeenCalledTimes(1)
    expect(state.queued.size).toBe(1)
  })

  it('never lands the held ledger on a read-only document', async () => {
    // A commit signal is not permission: a memory / non-loopback document
    // refuses writes, and the held ledger must obey the same writability gate
    // the staged ledger already does.
    const deps = makeDeps({ describeNamespace: async () => ({ ...join, writable: false }) })
    const state = createScanState()
    queueWriteInto(state, 'aliyun', 'qwen-max', { efforts: { high: 'high' } })
    state.committing.add('aliyun')

    await settleIdle(deps, state)
    expect(deps.mutate).not.toHaveBeenCalled()
    expect(state.queued.size).toBe(1)
  })

  it('signals a timed retry when a pass arms a backoff', async () => {
    // The backoff clock only helps if something wakes the injector when it
    // expires; a static page has no DOM mutation to trigger the next scan.
    const backoffs: number[] = []
    const deps = makeDeps({ onBackoff: (delay: number) => { backoffs.push(delay) } })
    deps.mutate.mockResolvedValue({ ok: false, error: { code: 'settings/rejected', message: 'refused' } })
    const state = createScanState()
    queueWriteInto(state, 'aliyun', 'qwen-max', { efforts: { high: 'high' } })
    state.committing.add('aliyun')

    await settleIdle(deps, state)
    expect(backoffs.length).toBeGreaterThan(0)
    expect(backoffs[0]).toBeGreaterThan(0)
  })

  it('isolates a throwing onIdle hook instead of rejecting the pass', async () => {
    const errors: unknown[][] = []
    const spy = vi.spyOn(console, 'error').mockImplementation((...args: unknown[]) => { errors.push(args) })
    const deps = makeDeps({ onIdle: () => { throw new Error('hook blew up') } })
    const state = createScanState()
    queueWriteInto(state, 'aliyun', 'qwen-max', { efforts: { high: 'high' } })
    state.committing.add('aliyun')

    await settleIdle(deps, state)
    // The write still landed, and the hook failure was reported, not thrown
    // into an unhandled rejection (the pass is void-ed by reconcile).
    expect(state.queued.size).toBe(0)
    expect(errors.some(args => String(args[0]).includes('idle hook failed'))).toBe(true)
    spy.mockRestore()
  })

  it('backs the next attempt off when a whole idle pass throws', async () => {
    const deps = makeDeps({
      describeNamespace: async () => { throw new Error('wire down') },
    })
    const state = createScanState()
    // A staged route the document does not hold yet: the pass reads the
    // namespace first, and that read is what throws here.
    stageEffortsInto(state, 'acme-gateway', 'new-model', { high: 'high' })

    await settleIdle(deps, state)
    expect(state.flushFailures).toBe(1)
    expect(state.nextFlushAt).toBeGreaterThan(0)
    expect(state.pending.size).toBe(1)
  })
})

describe('the official commit signal (C2)', () => {
  /**
   * The official editing card's own DOM shape: the model row (whose capacity
   * button the injector anchors on), then the action row `EditorFooter`
   * renders -- cancel first, commit last.
   */
  function buildActionCardDom(buttons: string): HTMLElement {
    const section = document.createElement('div')
    section.innerHTML = `
      <li class="rowCard">
        <div class="editor">
          <span class="editorTitle">Aliyun</span>
          <div class="modelEntry">
            <div class="modelRow">
              <input aria-label="Model ID" value="qwen-max" />
              <button aria-label="Capacities 1"></button>
            </div>
            <div class="modelAdvanced" style="display:block">
              <label><span>Context window</span><input /></label>
            </div>
          </div>
          <div class="editorActions">${buttons}</div>
        </div>
      </li>`
    document.body.appendChild(section)
    return section
  }

  /** Let the click's ledger marker land, then let the scan chain settle. */
  async function tick(): Promise<void> {
    await new Promise(resolve => { setTimeout(resolve, 0) })
  }

  /** Run an idle pass WITHOUT tearing the card down (the fence has to hold). */
  async function settleIdleKeepDom(deps: InjectorDeps, state: ReturnType<typeof createScanState>, root: HTMLElement): Promise<void> {
    reconcile(root, deps, state)
    await tick()
    await tick()
  }

  it('lands the held write once the official commit button was pressed', async () => {
    const deps = makeDeps()
    const state = createScanState()
    const root = buildActionCardDom(`
      <button type="button" class="secondaryButton">Cancel</button>
      <button type="button" class="primaryButton">Apply</button>`)
    await settle(() => reconcile(root, deps, state), state)
    queueWriteInto(state, 'aliyun', 'qwen-max', { efforts: { high: 'high' } })
    expect(deps.mutate).not.toHaveBeenCalled()

    // A readable card closed WITHOUT its commit: the user just walked away, so
    // the intent waits rather than landing behind that card's frozen revision
    // baseline. (This is the direction "committed with the official Save"
    // means; the case below pins the other one.)
    document.body.innerHTML = ''
    await settleIdle(deps, state)
    expect(deps.mutate).not.toHaveBeenCalled()
    expect(state.queued.size).toBe(1)

    // Now the user really commits: the card reopens and its commit is pressed.
    const reopened = buildActionCardDom(`
      <button type="button" class="secondaryButton">Cancel</button>
      <button type="button" class="primaryButton">Apply</button>`)
    await settle(() => reconcile(reopened, deps, state), state)
    reopened.querySelectorAll<HTMLButtonElement>('div.editorActions button')[1]!.click()
    await tick()

    document.body.innerHTML = ''
    await settleIdle(deps, state)
    expect(deps.mutate).toHaveBeenCalledTimes(1)
    expect(state.queued.size).toBe(0)
  })

  it('drops the held write when the card was dismissed', async () => {
    const deps = makeDeps()
    const state = createScanState()
    const root = buildActionCardDom(`
      <button type="button" class="secondaryButton">Cancel</button>
      <button type="button" class="primaryButton">Apply</button>`)
    await settle(() => reconcile(root, deps, state), state)
    queueWriteInto(state, 'aliyun', 'qwen-max', { efforts: { high: 'high' } })

    // The user dismisses the card: its own fields are discarded, and so is the
    // plugin's intent -- committed with the official Save means dropped with
    // the official Cancel.
    root.querySelectorAll<HTMLButtonElement>('div.editorActions button')[0]!.click()
    await tick()
    document.body.innerHTML = ''
    await settleIdle(deps, state)

    expect(deps.mutate).not.toHaveBeenCalled()
    expect(state.queued.size).toBe(0)
  })

  it('does not let a plain dismiss poison the next save of the same route', async () => {
    const deps = makeDeps()
    const state = createScanState()
    // Card 1: opened and dismissed WITHOUT touching the plugin editor, so the
    // cancel lands with no held write to drain.
    const first = buildActionCardDom(`
      <button type="button" class="secondaryButton">Cancel</button>
      <button type="button" class="primaryButton">Apply</button>`)
    await settle(() => reconcile(first, deps, state), state)
    first.querySelectorAll<HTMLButtonElement>('div.editorActions button')[0]!.click()
    await tick()
    document.body.innerHTML = ''
    await settleIdle(deps, state)

    // Card 2: the same route again, this time edited and SAVED. The dismiss
    // above must not have left a marker that swallows this save.
    const second = buildActionCardDom(`
      <button type="button" class="secondaryButton">Cancel</button>
      <button type="button" class="primaryButton">Apply</button>`)
    await settle(() => reconcile(second, deps, state), state)
    queueWriteInto(state, 'aliyun', 'qwen-max', { efforts: { high: 'high' } })
    second.querySelectorAll<HTMLButtonElement>('div.editorActions button')[1]!.click()
    await tick()
    document.body.innerHTML = ''
    await settleIdle(deps, state)

    expect(deps.mutate).toHaveBeenCalledTimes(1)
    expect(state.queued.size).toBe(0)
  })

  it('withdraws a dismissed create card\'s staged declaration', async () => {
    const deps = makeDeps()
    const state = createScanState()
    const root = buildCreateDom()
    root.querySelector('.editor')!.insertAdjacentHTML('beforeend', `
      <div class="editorActions">
        <button type="button" class="secondaryButton">Cancel</button>
        <button type="button" class="primaryButton">Apply</button>
      </div>`)
    await settle(() => reconcile(root, deps, state), state)
    stageEffortsInto(state, 'acme-gateway', 'deepseek-v4-flash-free', { high: 'high' })

    // The user dismisses the create card: its own fields go away, and the
    // declaration staged against its route must go with them.
    root.querySelectorAll<HTMLButtonElement>('div.editorActions button')[0]!.click()
    await tick()
    document.body.innerHTML = ''
    await settleIdle(deps, state)

    expect(state.pending.size).toBe(0)
    expect(deps.mutate).not.toHaveBeenCalled()
  })

  it('resolves the create card route at CLICK time, not first-wire time', async () => {
    const deps = makeDeps()
    const state = createScanState()
    const root = buildCreateDom('acme-one')
    root.querySelector('.editor')!.insertAdjacentHTML('beforeend', `
      <div class="editorActions">
        <button type="button" class="secondaryButton">Cancel</button>
        <button type="button" class="primaryButton">Apply</button>
      </div>`)
    await settle(() => reconcile(root, deps, state), state)

    // The user finishes typing a DIFFERENT provider id after the buttons were
    // first wired. React reuses the button element, so a closure captured at
    // wiring time would clear the wrong route and leave this edit staged.
    const input = root.querySelector<HTMLInputElement>('input[aria-label="Provider ID"]')!
    input.value = 'acme-two'
    await settle(() => reconcile(root, deps, state), state)
    stageEffortsInto(state, 'acme-two', 'deepseek-v4-flash-free', { high: 'high' })

    root.querySelectorAll<HTMLButtonElement>('div.editorActions button')[0]!.click()
    await tick()
    document.body.innerHTML = ''
    await settleIdle(deps, state)

    expect(state.pending.size).toBe(0)
    expect(deps.mutate).not.toHaveBeenCalled()
  })

  it('degrades to landing on unmount when the action row yields no buttons', async () => {
    const deps = makeDeps()
    const state = createScanState()
    // A one-button row no tier can name: the commit cannot be observed at all,
    // so the plugin never drops the user's declaration on a signal it could
    // not read (writing too much stays recoverable).
    const root = buildActionCardDom('<button type="button">Frobnicate</button>')
    await settle(() => reconcile(root, deps, state), state)
    queueWriteInto(state, 'aliyun', 'qwen-max', { efforts: { high: 'high' } })

    document.body.innerHTML = ''
    await settleIdle(deps, state)

    expect(deps.mutate).toHaveBeenCalledTimes(1)
    expect(state.queued.size).toBe(0)
  })

  it('recovers the official save signal once a readable action row appears', async () => {
    const deps = makeDeps()
    const state = createScanState()
    // Card 1 has no nameable button pair: the degrade flag trips.
    const broken = buildActionCardDom('<button type="button">Frobnicate</button>')
    await settle(() => reconcile(broken, deps, state), state)
    expect(state.signalsUnavailable).toBe(true)
    document.body.innerHTML = ''
    await settleIdle(deps, state)

    // A later normal card proves the signal works again: the latch is not a
    // one-way door for the rest of the session.
    const good = buildActionCardDom(`
      <button type="button" class="secondaryButton">Cancel</button>
      <button type="button" class="primaryButton">Apply</button>`)
    await settle(() => reconcile(good, deps, state), state)
    expect(state.signalsUnavailable).toBe(false)
  })

  it('fences the idle pass while a readable card is open, with no signal yet', async () => {
    const deps = makeDeps()
    const state = createScanState()
    const root = buildActionCardDom(`
      <button type="button" class="secondaryButton">Cancel</button>
      <button type="button" class="primaryButton">Apply</button>`)
    await settle(() => reconcile(root, deps, state), state)
    queueWriteInto(state, 'aliyun', 'qwen-max', { efforts: { high: 'high' } })

    // An idle pass while the card is still open writes nothing: landing there
    // is exactly the frozen-revision write issue #7 is about.
    await settleIdleKeepDom(deps, state, root)
    expect(deps.mutate).not.toHaveBeenCalled()
    expect(state.queued.size).toBe(1)
  })
})

describe('batch writes (one route, one mutate)', () => {
  it('lands every held row of a route in a single mutate', async () => {
    const deps = makeDeps()
    const state = createScanState()
    // No official action row exists in this fixture, so the signal degrades to
    // "the card went away, write it" -- which is what this case needs: it is
    // about the write SHAPE, not the commit signal.
    state.signalsUnavailable = true

    queueWriteInto(state, 'aliyun', 'qwen-max', { efforts: { high: 'high' } })
    queueWriteInto(state, 'aliyun', 'qwen-turbo', { efforts: { low: 'low' } })
    await settleIdle(deps, state)

    // ONE describe + ONE mutate for the whole route: the document is a single
    // models array, so a per-row write was rebuilding and rewriting it twice.
    expect(deps.mutate).toHaveBeenCalledTimes(1)
    const ops = deps.mutate.mock.calls[0]![1] as Array<{ path: string[]; value: Array<Record<string, unknown>> }>
    expect(ops).toHaveLength(1)
    expect(ops[0]!.path).toEqual(['providers', 'aliyun', 'models'])
    // BOTH rows carry their own declaration in that one array.
    const models = ops[0]!.value
    expect(models.find(model => model['id'] === 'qwen-max')?.['reasoningEfforts']).toEqual({ high: 'high' })
    expect(models.find(model => model['id'] === 'qwen-turbo')?.['reasoningEfforts']).toEqual({ low: 'low' })
    expect(state.queued.size).toBe(0)
  })

  it('keeps every row of a route when the batch is refused', async () => {
    const deps = makeDeps()
    deps.mutate.mockResolvedValueOnce({
      ok: false,
      error: { code: 'settings/rejected', message: 'refused' },
    })
    const state = createScanState()
    queueWriteInto(state, 'aliyun', 'qwen-max', { efforts: { high: 'high' } })
    queueWriteInto(state, 'aliyun', 'qwen-turbo', { efforts: { low: 'low' } })
    // The premise the ledger cannot carry: the user had committed this card.
    state.committing.add('aliyun')

    await settleIdle(deps, state)

    // A refused route keeps EVERY intent -- never a partial landing, so the
    // retry re-sends the same complete array.
    expect(deps.mutate).toHaveBeenCalledTimes(1)
    expect(state.queued.get('aliyun')?.size).toBe(2)
  })
})

/**
 * The provider-wide auto-adapt seat (user request ⑤) rides the same scan that
 * finds the model rows: one control per card, seated in that card's catalogue
 * head, naming the route the card edits. What happens on a click is the
 * editors' business (see editor.spec.tsx); what the injector owes is a seat
 * that shows up with the rows, is not duplicated by its own reconciles, and
 * leaves when the rows do.
 */
describe('the auto-adapt seat', () => {
  it('seats one control per card, naming the route that card edits', async () => {
    const deps = makeDeps()
    const state = createScanState()
    const root = buildModelsDom()

    await settle(() => reconcile(root, deps, state), state)

    const seats = Array.from(root.querySelectorAll<HTMLButtonElement>('.bre-auto-effort'))
    // Two model rows, one catalogue: exactly one control.
    expect(seats).toHaveLength(1)
    expect(seats[0]!.getAttribute('data-bre-auto-effort')).toBe('aliyun')
    expect(seats[0]!.textContent).toBe('autoAdaptAll')
    // No tooltip: the seat reads as one more control of the host's own head.
    expect(seats[0]!.getAttribute('title')).toBeNull()
    // This fixture's catalogue renders no head, so it becomes the head.
    expect(seats[0]!.parentElement?.className).toBe('modelCatalog')
  })

  it('seats beside the official fetch link when the head renders one', async () => {
    const deps = makeDeps()
    const state = createScanState()
    const root = buildModelsDom()
    root.querySelector('.modelCatalog')!.insertAdjacentHTML(
      'afterbegin',
      '<div class="modelListHead"><button class="linkButton" type="button">获取可用模型</button></div>',
    )

    await settle(() => reconcile(root, deps, state), state)

    const head = root.querySelector('.modelListHead')!
    expect(head.lastElementChild?.className).toBe('bre-auto-effort')
    expect(head.lastElementChild?.previousElementSibling?.className).toBe('linkButton')
  })

  it('is idempotent: its own scan does not seat a second control', async () => {
    const deps = makeDeps()
    const state = createScanState()
    const root = buildModelsDom()
    await settle(() => reconcile(root, deps, state), state)
    await settle(() => reconcile(root, deps, state), state)
    expect(root.querySelectorAll('.bre-auto-effort')).toHaveLength(1)
  })

  it('keeps the seat when the open card has no models left', async () => {
    const deps = makeDeps()
    const state = createScanState()
    const root = buildModelsDom()
    // The card has to stay OPEN across the second pass, and the host's own
    // action row is what says so: with the models gone and no action row, the
    // scan reads the page as "no card" and takes the seat out.
    root.querySelector('.editor')!.insertAdjacentHTML(
      'beforeend',
      '<div class="editorActions"><button type="button">Apply</button></div>',
    )
    const catalog = root.querySelector('.modelCatalog')!
    catalog.insertAdjacentHTML(
      'afterbegin',
      '<div class="modelListHead"><button class="linkButton" type="button">获取可用模型</button></div>',
    )
    await settle(() => reconcile(root, deps, state), state)
    expect(root.querySelectorAll('.bre-auto-effort')).toHaveLength(1)

    // The host keeps the catalogue head after the last row is deleted. The
    // seat has to stay beside 获取可用模型, or that link jumps.
    for (const entry of Array.from(root.querySelectorAll('.modelEntry'))) entry.remove()
    await settle(() => reconcile(root, deps, state), state)
    expect(root.querySelectorAll('.bre-auto-effort')).toHaveLength(1)
    expect(root.querySelector('.modelListHead')?.lastElementChild?.classList.contains('bre-auto-effort')).toBe(true)
  })

  it('seats ONE control when the empty card renders the real catalogue heading', async () => {
    // The regression this covers: the official heading, its title and its meta
    // are class-name matches of `modelCatalog` themselves, so the
    // empty-catalogue enumeration saw FOUR "catalogues" per card and seated a
    // control inside each — which collapsed the heading to one character per
    // line and strung the extra seats across the card. It only fired on the
    // empty-catalogue branch, i.e. exactly when the last model was deleted.
    const deps = makeDeps()
    const state = createScanState()
    const root = buildModelsDom()
    root.querySelector('.editor')!.insertAdjacentHTML(
      'beforeend',
      '<div class="editorActions"><button type="button">Apply</button></div>',
    )
    const catalog = root.querySelector('.modelCatalog')!
    catalog.insertAdjacentHTML(
      'afterbegin',
      '<div class="modelListHead">' +
        '<div class="modelCatalogHeading">' +
        '<span class="modelCatalogTitle">模型目录</span>' +
        '<span class="modelCatalogMeta">已自定义模型目录</span>' +
        '</div>' +
        '<button class="linkButton" type="button">恢复默认模型</button>' +
        '<button class="linkButton" type="button">获取可用模型</button>' +
        '</div>',
    )
    // Delete every model: the host keeps the head, drops the rows.
    for (const entry of Array.from(root.querySelectorAll('.modelEntry'))) entry.remove()

    await settle(() => reconcile(root, deps, state), state)

    expect(root.querySelectorAll('.bre-auto-effort')).toHaveLength(1)
    const head = root.querySelector('.modelListHead')!
    const heading = root.querySelector('.modelCatalogHeading')!
    // Beside the host's links, in the head, and OUTSIDE the heading box whose
    // text must keep its natural width.
    expect(head.lastElementChild?.classList.contains('bre-auto-effort')).toBe(true)
    expect(heading.querySelector('.bre-auto-effort')).toBeNull()
    // A settled second pass stays idempotent with the heading present.
    await settle(() => reconcile(root, deps, state), state)
    expect(root.querySelectorAll('.bre-auto-effort')).toHaveLength(1)
  })

  it('keeps the seat while every model row is collapsed', async () => {
    // The regression this covers (m04987): a collapsed row renders no
    // `modelAdvanced` container, and the scan used to drop every row that had
    // none — so the provider-wide control appeared only AFTER the user
    // unfolded a model, which is the opposite of what it is for.
    const deps = makeDeps()
    const state = createScanState()
    const root = buildModelsDom()
    for (const advanced of Array.from(root.querySelectorAll('.modelAdvanced'))) advanced.remove()

    await settle(() => reconcile(root, deps, state), state)

    expect(root.querySelectorAll('.bre-auto-effort')).toHaveLength(1)
    // There is nowhere to mount yet: the editors arrive the moment a chevron
    // renders a container, and the next scan picks them up.
    expect(deps.mount).not.toHaveBeenCalled()
  })

  it('adapts every model of the provider on one click, collapsed rows included', async () => {
    const deps = makeDeps()
    const state = createScanState()
    const root = buildModelsDom()
    for (const advanced of Array.from(root.querySelectorAll('.modelAdvanced'))) advanced.remove()
    await settle(() => reconcile(root, deps, state), state)

    // The click has to reach the rows nothing on screen can answer for: the
    // seat publishes the document request (the mounted editors' channel) AND
    // hands the route to the settings-document walk.
    root.querySelector<HTMLButtonElement>('.bre-auto-effort')!.click()
    for (let tick = 0; tick < 40 && (state.queued.get('aliyun')?.size ?? 0) < 2; tick += 1) {
      await new Promise(resolve => { setTimeout(resolve, 0) })
    }

    const held = state.queued.get('aliyun')
    expect(held?.size).toBe(2)
    // The knowledge base's generic `qwen` entry: an off/high ladder, text-only.
    expect(held?.get('qwen-max')?.efforts).toEqual({ off: null, high: 'high' })
    expect(held?.get('qwen-turbo')?.efforts).toEqual({ off: null, high: 'high' })
    expect(held?.get('qwen-turbo')?.input).toEqual(['text'])
    // Held, not written: an open official card owns the document, and its own
    // Save is what lands this (issue #7 / C2).
    expect(deps.mutate).not.toHaveBeenCalled()
    // And the seat says so: the click used to be completely silent, which is
    // indistinguishable from a control that does nothing at all. The answer is
    // a floating note beside the control (the control itself is never touched).
    const seat = root.querySelector<HTMLButtonElement>('.bre-auto-effort')!
    expect(seat.textContent).toBe('autoAdaptAll')
    expect(seat.disabled).toBe(false)
    const said = document.querySelector('.bre-auto-effort-note-text')
    expect(said?.textContent).toBe('autoAdaptDone')
    expect(document.querySelector('.bre-auto-effort-note')?.getAttribute('data-bre-auto-effort-phase')).toBe('done')
  })

  it('answers a click with nothing to adapt instead of staying silent', async () => {
    // Every model already declares its levels: the pass SUCCEEDED and did
    // nothing, which must not read like a refusal or a dead button.
    const configured = structuredClone(join)
    for (const layer of ['value', 'user'] as const) {
      const models = (configured.namespace![layer] as { providers: { aliyun: { models: Array<Record<string, unknown>> } } }).providers.aliyun.models
      for (const model of models) model['reasoningEfforts'] = { high: 'high' }
    }
    const deps = makeDeps({ describeNamespace: async () => configured })
    const state = createScanState()
    const root = buildModelsDom()
    await settle(() => reconcile(root, deps, state), state)

    root.querySelector<HTMLButtonElement>('.bre-auto-effort')!.click()
    for (let tick = 0; tick < 40 && state.queued.size === 0; tick += 1) {
      await new Promise(resolve => { setTimeout(resolve, 0) })
    }

    expect(state.queued.size).toBe(0)
    const seat = root.querySelector<HTMLButtonElement>('.bre-auto-effort')!
    expect(seat.textContent).toBe('autoAdaptAll')
    const said = document.querySelector('.bre-auto-effort-note-text')
    expect(said?.textContent).toBe('autoAdaptEmpty')
    expect(document.querySelector('.bre-auto-effort-note-detail')?.textContent).toBe('autoAdaptEmptyHint')
  })

  it('reports a read-only click as blocked rather than as already configured', async () => {
    // The two read the same on screen ("nothing was written") and mean opposite
    // things: one is the pass working, the other is the pass refusing.
    const deps = makeDeps({ describeNamespace: async () => ({ ...join, writable: false }) })
    const state = createScanState()
    const root = buildModelsDom()
    await settle(() => reconcile(root, deps, state), state)

    root.querySelector<HTMLButtonElement>('.bre-auto-effort')!.click()
    for (let tick = 0; tick < 40 && state.queued.size === 0; tick += 1) {
      await new Promise(resolve => { setTimeout(resolve, 0) })
    }

    const seat = root.querySelector<HTMLButtonElement>('.bre-auto-effort')!
    expect(seat.textContent).toBe('autoAdaptAll')
    expect(document.querySelector('.bre-auto-effort-note-text')?.textContent).toBe('autoAdaptBlocked')
    expect(document.querySelector('.bre-auto-effort-note-detail')?.textContent).toBe('autoAdaptBlockedHint')
  })

  it('saves every unconfigured collapsed model with thinking and vision while preserving configured models', async () => {
    const configured = structuredClone(join)
    for (const layer of ['value', 'user'] as const) {
      const models = (configured.namespace![layer] as { providers: { aliyun: { models: Array<Record<string, unknown>> } } }).providers.aliyun.models
      models[0] = { ...models[0], reasoningEfforts: { high: 'high' }, input: ['text'] }
      models.push(
        { id: 'gpt-4o-mini' },
        { id: 'deepseek-flash' },
        { id: 'gpt-4.1', reasoningEfforts: false, input: ['text', 'image'] },
        { id: 'gpt-4.1-mini', reasoningEffortsUnset: true, input: ['text'] },
      )
    }
    const deps = makeDeps({ describeNamespace: async () => configured })
    const state = createScanState()
    const root = buildModelsDom()
    for (const advanced of Array.from(root.querySelectorAll('.modelAdvanced'))) advanced.remove()
    root.querySelector('.editor')!.insertAdjacentHTML('beforeend', `
      <div class="editorActions">
        <button type="button" class="secondaryButton">Cancel</button>
        <button type="button" class="primaryButton">Apply</button>
      </div>`)
    await settle(() => reconcile(root, deps, state), state)

    root.querySelector<HTMLButtonElement>('.bre-auto-effort')!.click()
    for (let tick = 0; tick < 40 && (state.queued.get('aliyun')?.size ?? 0) < 3; tick += 1) {
      await new Promise(resolve => { setTimeout(resolve, 0) })
    }
    const held = state.queued.get('aliyun')
    expect([...held!.keys()]).toEqual(['qwen-turbo', 'gpt-4o-mini', 'deepseek-flash'])
    expect(held?.get('qwen-turbo')?.input).toEqual(['text'])
    expect(held?.get('gpt-4o-mini')?.efforts).toBe(false)
    expect(held?.get('gpt-4o-mini')?.input).toEqual(['text', 'image'])
    expect(held?.get('deepseek-flash')?.efforts).toEqual({ off: 'none', low: 'low', high: 'high', max: 'max' })
    expect(held?.get('deepseek-flash')?.input).toEqual(['text', 'image'])
    expect(deps.mutate).not.toHaveBeenCalled()
    expect(state.signalsUnavailable).toBe(false)

    // No expanded disclosure is available to wire the official Save button.
    // The provider-wide action must still authorize the queued write.
    root.querySelector<HTMLButtonElement>('.editorActions .primaryButton')!.click()
    expect(state.committing.has('aliyun')).toBe(true)
    await settleIdle(deps, state)
    expect(deps.mutate).toHaveBeenCalledTimes(1)
    const ops = deps.mutate.mock.calls[0]![1] as Array<{ path: string[]; value: Array<Record<string, unknown>> }>
    expect(ops[0]!.path).toEqual(['providers', 'aliyun', 'models'])
    const saved = ops[0]!.value
    expect(saved.find(model => model['id'] === 'qwen-turbo')?.['input']).toEqual(['text'])
    expect(saved.find(model => model['id'] === 'gpt-4o-mini')).toMatchObject({ reasoningEfforts: false, input: ['text', 'image'] })
    expect(saved.find(model => model['id'] === 'deepseek-flash')).toMatchObject({
      reasoningEfforts: { off: 'none', low: 'low', high: 'high', max: 'max' }, input: ['text', 'image'],
    })
    expect(saved.find(model => model['id'] === 'qwen-max')).toEqual({ id: 'qwen-max', name: 'Qwen Max', reasoningEfforts: { high: 'high' }, input: ['text'] })
    expect(saved.find(model => model['id'] === 'gpt-4.1')).toEqual({ id: 'gpt-4.1', reasoningEfforts: false, input: ['text', 'image'] })
    expect(saved.find(model => model['id'] === 'gpt-4.1-mini')).toEqual({ id: 'gpt-4.1-mini', reasoningEffortsUnset: true, input: ['text'] })
    expect(state.queued.size).toBe(0)
  })

  it('adapts an expanded row that has no thinking levels yet, and leaves a configured one', async () => {
    const deps = makeDeps()
    const state = createScanState()
    const root = buildModelsDom()
    // Unfold ONLY the first row. It is on screen, but the document still has
    // no ladder for it, so bulk adapt must fill it — an expanded-but-empty
    // editor is not a configured model.
    root.querySelectorAll('.modelAdvanced')[1]!.remove()
    await settle(() => reconcile(root, deps, state), state)
    expect(deps.mount).toHaveBeenCalledTimes(1)

    const report = await adaptEveryModel(state, deps, 'aliyun')

    const held = state.queued.get('aliyun')
    expect(held?.has('qwen-turbo')).toBe(true)
    expect(held?.has('qwen-max')).toBe(true)
    // The seat's label counts what the pass HELD: the walk is the only thing
    // that knows, so the caller gets a tally rather than a bare resolve.
    expect(report).toEqual({ held: 2, unsuggested: 0 })
  })

  it('does not overwrite a model whose thinking levels are already configured', async () => {
    const configured = structuredClone(join)
    const layers = [
      configured.namespace!.value as { providers: { aliyun: { models: Array<Record<string, unknown>> } } },
      configured.namespace!.user as { providers: { aliyun: { models: Array<Record<string, unknown>> } } },
    ]
    for (const layer of layers) {
      layer.providers.aliyun.models[0] = { ...layer.providers.aliyun.models[0], reasoningEfforts: { high: 'high' } }
    }
    const deps = makeDeps({ describeNamespace: async () => configured })
    const state = createScanState()
    const root = buildModelsDom()
    await settle(() => reconcile(root, deps, state), state)

    await adaptEveryModel(state, deps, 'aliyun')

    const held = state.queued.get('aliyun')
    expect(held?.has('qwen-max')).toBe(false)
    expect(held?.has('qwen-turbo')).toBe(true)
  })

  it('adapts nothing on a read-only page', async () => {
    const deps = makeDeps({ describeNamespace: async () => ({ ...join, writable: false }) })
    const state = createScanState()

    const report = await adaptEveryModel(state, deps, 'aliyun')

    expect(state.queued.size).toBe(0)
    // Reported as blocked, never as `{held: 0}`: the seat would render an empty
    // tally as "已全部配置", which is a lie about a page that refuses writes.
    expect(report).toEqual({ held: 0, unsuggested: 0, blocked: 'unwritable' })
  })

  it('ignores a route the settings document does not declare', async () => {
    // A create card's typed Provider ID names a route nothing can be held
    // against yet: its own rows stage, and the staging lands with the route.
    const deps = makeDeps()
    const state = createScanState()

    const report = await adaptEveryModel(state, deps, 'acme-gateway')

    expect(state.queued.size).toBe(0)
    expect(report).toEqual({ held: 0, unsuggested: 0, blocked: 'unknown-route' })
  })

  it('adapts the card\'s unsaved rows in the same click, held for the card\'s save', async () => {
    // Every SAVED model is configured, but the card holds rows the document
    // does not know: the head's click walks the screen's rows too, so a card
    // the user is still editing is adapted in one click instead of being
    // deferred behind a save. The draft's hold lands when the Save carries the
    // row into the document -- the same channel a row's own auto-adapt uses.
    const configured = structuredClone(join)
    const userLayer = configured.namespace!.user as { providers: { aliyun: { models: Array<Record<string, unknown>> } } }
    const layers = [
      configured.namespace!.value as { providers: { aliyun: { models: Array<Record<string, unknown>> } } },
      userLayer,
    ]
    for (const layer of layers) {
      layer.providers.aliyun.models = layer.providers.aliyun.models
        .map(model => ({ ...model, reasoningEfforts: { high: 'high' } }))
    }
    const deps = makeDeps({ describeNamespace: async () => configured })
    const state = createScanState()

    const report = await adaptEveryModel(state, deps, 'aliyun', [
      { id: 'qwen-max', name: 'Qwen Max' },
      { id: 'qwen-turbo', name: 'Qwen Turbo' },
      { id: 'my-draft-row', name: 'My Draft Row' },
    ])

    expect(state.queued.size).toBe(1)
    expect(state.queued.get('aliyun')?.has('my-draft-row')).toBe(true)
    expect(report).toEqual({ held: 1, unsuggested: 0 })
    // ...and once the card is saved (the draft id is the document's own), the
    // same pass finds the row configured and holds nothing more.
    userLayer.providers.aliyun.models.push({ id: 'my-draft-row', reasoningEfforts: { high: 'high' } })
    const clean = await adaptEveryModel(state, deps, 'aliyun', [
      { id: 'qwen-max', name: 'Qwen Max' },
      { id: 'qwen-turbo', name: 'Qwen Turbo' },
      { id: 'my-draft-row', name: 'My Draft Row' },
    ])
    expect(clean).toEqual({ held: 0, unsuggested: 0 })
  })

  it('answers a second click while a pass is running with busy, not with a tally', async () => {
    // The re-entrancy guard used to return silently, so a double click looked
    // like an instant success: the seat would paint "已全部配置" over a pass
    // that had not finished reading the document yet.
    let release = (): void => {}
    const gate = new Promise<void>(resolve => { release = resolve })
    const deps = makeDeps({
      describeNamespace: async () => { await gate; return join },
    })
    const state = createScanState()

    const first = adaptEveryModel(state, deps, 'aliyun')
    const second = await adaptEveryModel(state, deps, 'aliyun')
    expect(second).toEqual({ held: 0, unsuggested: 0, blocked: 'busy' })
    release()
    // The pass that owns the route still reports its own result.
    expect((await first).held).toBeGreaterThan(0)
  })
})

/**
 * Re-pinning a card's top across a model row's disclosure toggle.
 *
 * The card grows in TWO stages: the official React commit renders the
 * disclosure container in the click's own frame, and the injected editor mounts
 * a debounced scan later. Measured on the live page (settings list scrolled to
 * its end), the second stage lands ~100ms after the click and moved the card
 * 587px up the viewport whenever the window had already let go — which is what
 * a loop that released three stable frames after the click did.
 */
describe('disclosure re-pin', () => {
  /** A scroll host the injector can find, carrying the metrics jsdom lacks. */
  function scrollHostAround(section: HTMLElement): HTMLElement {
    const host = document.createElement('div')
    host.style.overflowY = 'auto'
    Object.defineProperty(host, 'scrollHeight', { value: 2000, configurable: true })
    Object.defineProperty(host, 'clientHeight', { value: 600, configurable: true })
    host.appendChild(section)
    document.body.appendChild(host)
    return host
  }

  /**
   * Pin the card's box to whatever `height` reports, so the loop sees growth.
   *
   * Both elements a re-pin window can be opened on are stubbed: the disclosure
   * path pins the row card, the editor mount pins the official editing box it
   * found the container in. One window runs per scroll host, so whichever of
   * the two opened first is the element the loop measures — and both of them sit
   * above the growth either way.
   */
  function stubCardBox(card: Element, height: () => number): void {
    const box = (): DOMRect => ({
      top: 100, bottom: 100 + height(), left: 0, right: 600, width: 600, height: height(),
      x: 0, y: 100, toJSON: () => ({}),
    }) as DOMRect
    card.getBoundingClientRect = box
    for (const inner of Array.from(card.querySelectorAll('[class*="editor"]'))) {
      inner.getBoundingClientRect = box
    }
  }

  const wait = (ms: number): Promise<void> => new Promise(resolve => { setTimeout(resolve, ms) })

  it('still holds the host when the editor mounts a scan after the click', async () => {
    const section = buildModelsDom()
    const host = scrollHostAround(section)
    const deps = makeDeps()
    const state = createScanState()
    await settle(() => { reconcile(document.body, deps, state) }, state)

    const chevron = section.querySelector<HTMLElement>('button[aria-label="Capacities 1"]')
    expect(chevron).not.toBeNull()
    chevron?.click()

    // Suppressed in the click's own capture phase, before the official handler.
    expect(host.style.overflowAnchor).toBe('none')
    // The window has to OUTLIVE the click's frame: the editor mount that grows
    // the card again arrives with the injector's 120ms debounced scan.
    await wait(150)
    expect(host.style.overflowAnchor).toBe('none')
    // ...and it lets go on its own once the card has stopped moving.
    await wait(700)
    expect(host.style.overflowAnchor).toBe('')
  })

  it('holds the card across a model row burst so the tail contracts upward', async () => {
    const section = buildModelsDom()
    const host = scrollHostAround(section)
    // The shape the burst guard sees on the live page: the host's hashed
    // module classes wrap the model entries in a `modelList` INSIDE a
    // provider card. A deletion removes the LAST element — the survivors
    // re-fill in place, which is the part the pin does not care about.
    const card = section.querySelector<HTMLElement>('.rowCard')
    expect(card).not.toBeNull()
    if (card === null) return
    const list = document.createElement('div')
    list.className = 'modelList'
    const gone = document.createElement('div')
    gone.className = 'modelEntry'
    list.appendChild(gone)
    card.appendChild(list)
    gone.remove()

    pinModelListCards(document.body)

    expect(host.style.overflowAnchor).toBe('none')
    // The window has to outlive the burst's own frames: the re-filled rows
    // leave a stale editor that the injector's 120ms debounced scan re-renders
    // or mounts after the deletion, and that is the second height change.
    await wait(150)
    expect(host.style.overflowAnchor).toBe('none')
    // ...and it lets go on its own once the card has stopped moving.
    await wait(700)
    expect(host.style.overflowAnchor).toBe('')
  })

  it('pins a setup card too — the card the user is actually editing', async () => {
    const section = buildModelsDom()
    const host = scrollHostAround(section)
    // A NEW provider's card carries no rowCard at all; a pin that names only
    // saved providers silently skips the card deletions happen on.
    const setup = document.createElement('div')
    setup.className = 'setupCard'
    const list = document.createElement('div')
    list.className = 'modelList'
    setup.appendChild(list)
    section.appendChild(setup)

    pinModelListCards(document.body)

    expect(host.style.overflowAnchor).toBe('none')
    await wait(700)
    expect(host.style.overflowAnchor).toBe('')
  })

  it('extends the window while the card keeps growing, then releases', async () => {
    const section = buildModelsDom()
    const card = section.querySelector<HTMLElement>('.rowCard')
    const host = scrollHostAround(section)
    expect(card).not.toBeNull()
    if (card === null) return
    // A second growth just inside the click's budget: React can land the mount
    // in more than one commit, and the window has to cover what follows it —
    // not stop on the clock while the card is still moving.
    const started = Date.now()
    stubCardBox(card, () => (Date.now() - started > 350 ? 900 : 300))

    const deps = makeDeps()
    const state = createScanState()
    await settle(() => { reconcile(document.body, deps, state) }, state)

    section.querySelector<HTMLElement>('button[aria-label="Capacities 1"]')?.click()
    await wait(460)
    // Past the click's own 420ms budget, but the growth pushed the release out.
    expect(host.style.overflowAnchor).toBe('none')
    await wait(400)
    expect(host.style.overflowAnchor).toBe('')
  })

  it('corrects the view the page moved, without mistaking it for a scroll', async () => {
    const section = buildModelsDom()
    const card = section.querySelector<HTMLElement>('.rowCard')
    const host = scrollHostAround(section)
    expect(card).not.toBeNull()
    if (card === null) return
    // jsdom has no layout: give the host a real offset and make the card's
    // viewport position FOLLOW it, the way a browser's does.
    let contentTop = 400
    Object.defineProperty(host, 'scrollTop', { value: 300, writable: true, configurable: true })
    const box = (): DOMRect => ({
      top: contentTop - host.scrollTop, bottom: contentTop - host.scrollTop + 300,
      left: 0, right: 600, width: 600, height: 300, x: 0, y: contentTop - host.scrollTop, toJSON: () => ({}),
    }) as DOMRect
    card.getBoundingClientRect = box
    for (const inner of Array.from(card.querySelectorAll('[class*="editor"]'))) inner.getBoundingClientRect = box

    const deps = makeDeps()
    const state = createScanState()
    await settle(() => { reconcile(document.body, deps, state) }, state)

    section.querySelector<HTMLElement>('button[aria-label="Capacities 1"]')?.click()
    expect(host.style.overflowAnchor).toBe('none')

    // The page's own doing: the editor above this card closed, so the content
    // above shrank and the card's content position moved up 40px. The window
    // has to put the card back where the user saw it — NOT treat the moved
    // offset as a user scroll and stand down, and NOT drive it further off.
    contentTop = 360
    await wait(80)

    expect(host.style.overflowAnchor).toBe('none')
    expect(host.scrollTop).toBe(260)
    expect(Math.round(card.getBoundingClientRect().top)).toBe(100)
  })

  it('still stands down on a real user scroll', async () => {
    const section = buildModelsDom()
    const card = section.querySelector<HTMLElement>('.rowCard')
    const host = scrollHostAround(section)
    expect(card).not.toBeNull()
    if (card === null) return
    Object.defineProperty(host, 'scrollTop', { value: 300, writable: true, configurable: true })
    stubCardBox(card, () => 300)

    const deps = makeDeps()
    const state = createScanState()
    await settle(() => { reconcile(document.body, deps, state) }, state)

    section.querySelector<HTMLElement>('button[aria-label="Capacities 1"]')?.click()
    expect(host.style.overflowAnchor).toBe('none')
    document.dispatchEvent(new WheelEvent('wheel', { bubbles: true }))
    expect(host.style.overflowAnchor).toBe('')
  })
})

/**
 * Re-pinning a card's top across the provider row's OWN Edit button.
 *
 * The official page edits one provider at a time, so opening a card closes the
 * one that was open. The closing editor is the browser's anchor node, so
 * anchoring has nothing left to hold: measured on the live page with a card
 * already open and the list scrolled to its end, clicking another row's 编辑
 * walked that row 474px up the viewport — exactly the height of the editor that
 * closed — with the scroll offset net unchanged.
 */
describe('provider Edit re-pin', () => {
  /** A row card whose header carries the official Edit button. */
  function buildRowDom(extra: string): HTMLElement {
    const section = document.createElement('div')
    section.className = 'section'
    section.innerHTML = `
      <ul class="rows">
        <li class="rowCard">
          <div class="rowHead">
            <span class="rowName">Aliyun</span>
            <div class="rowActions">
              <button class="secondaryButton" aria-label="Edit aliyun">编辑</button>
              ${extra}
            </div>
          </div>
          <div class="editor">
            <div class="modelCatalog">
              <div class="modelEntry">
                <div class="modelRow"><input aria-label="Model ID" value="qwen-max" /></div>
                <div class="modelAdvanced"><label><span>Context window</span><input /></label></div>
              </div>
            </div>
          </div>
        </li>
      </ul>
    `
    document.body.appendChild(section)
    return section
  }

  function scrollHostAround(section: HTMLElement): HTMLElement {
    const host = document.createElement('div')
    host.style.overflowY = 'auto'
    Object.defineProperty(host, 'scrollHeight', { value: 2000, configurable: true })
    Object.defineProperty(host, 'clientHeight', { value: 600, configurable: true })
    host.appendChild(section)
    document.body.appendChild(host)
    return host
  }

  it('pins the card on the official Edit button, before the official handler', async () => {
    const section = buildRowDom('')
    const host = scrollHostAround(section)
    const deps = makeDeps()
    const state = createScanState()
    await settle(() => { reconcile(document.body, deps, state) }, state)

    const edit = section.querySelector<HTMLElement>('button[aria-label="Edit aliyun"]')
    expect(edit).not.toBeNull()
    edit?.click()
    expect(host.style.overflowAnchor).toBe('none')
  })

  it('leaves our own seats alone, whatever they are labelled', async () => {
    // A control of ours that reads like the official one: the wiring matches by
    // template alone, so only the plugin-subtree guard keeps it out.
    const section = buildRowDom('<span data-plugin="dsh-model-think-level"><button aria-label="Edit aliyun">编辑</button></span>')
    const host = scrollHostAround(section)
    const deps = makeDeps()
    const state = createScanState()
    await settle(() => { reconcile(document.body, deps, state) }, state)

    const foreign = section.querySelector<HTMLElement>('[data-plugin] button')
    foreign?.click()
    expect(host.style.overflowAnchor).toBe('')

    const official = section.querySelector<HTMLElement>('.rowActions > button[aria-label="Edit aliyun"]')
    official?.click()
    expect(host.style.overflowAnchor).toBe('none')
  })
})

/**
 * Holding a shrinking model list's scroll RANGE open across a deletion.
 *
 * The official panel is a fixed-height card with one scrolling body, so a list
 * losing a row does not resize anything: it shortens the body's content, and an
 * offset past the new maximum is folded down to it (the browser's scroll clamp).
 * Measured on the live page with the list scrolled to its end and eight rows
 * deleted: every step moved the view by exactly that clamp, 54px per row — the
 * "the top slides down instead of the list contracting upward" report. Scroll
 * anchoring cannot answer it (there is no longer a position to anchor to; the
 * range itself is gone), so the position is recorded from the click that starts
 * the deletion and the range is bought back with a blank appended to the host.
 */
describe('model list deletion range', () => {
  afterEach(() => { unwatchModelListOffsets() })

  interface Page {
    host: HTMLElement
    /** The live page's own content height, which a deletion shrinks. */
    content: { height: number }
    deleteButton: HTMLElement
  }

  /** The blank this plugin appends, and the height it holds. */
  function slackHeight(host: HTMLElement): number {
    const spacer = host.querySelector<HTMLElement>('.bre-list-slack')
    return spacer === null ? 0 : Number.parseFloat(spacer.style.height)
  }

  /**
   * A panel-shaped page: one provider card whose list holds the model rows.
   *
   * The host reports the SUM a real layout would — the blank included — and
   * `scrollTop` is a plain value, so the test performs the clamp the browser
   * would do instead of jsdom inventing one out of a stub.
   */
  function buildPage(contentHeight: number): Page {
    const section = document.createElement('div')
    section.className = 'section'
    section.innerHTML = `
      <ul class="rows">
        <li class="rowCard">
          <div class="rowHead"><span class="rowName">Aliyun</span></div>
          <div class="editor">
            <div class="modelCatalog">
              <div class="modelList">
                <div class="modelEntry">
                  <div class="modelRow">
                    <input aria-label="Model ID" value="qwen-max" />
                    <button class="secondaryButton" aria-label="删除模型 1">删除</button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </li>
      </ul>
    `
    const content = { height: contentHeight }
    const host = document.createElement('div')
    host.style.overflowY = 'auto'
    host.appendChild(section)
    document.body.appendChild(host)
    Object.defineProperty(host, 'scrollHeight', {
      get: () => content.height + slackHeight(host),
      configurable: true,
    })
    Object.defineProperty(host, 'clientHeight', { value: 746, configurable: true })
    Object.defineProperty(host, 'scrollTop', { value: 0, writable: true, configurable: true })

    const deleteButton = section.querySelector<HTMLElement>('.secondaryButton')
    expect(deleteButton).not.toBeNull()
    watchModelListOffsets()
    return { host, content, deleteButton: deleteButton as HTMLElement }
  }

  /**
   * What the browser's layout does when the content shrinks: an offset past the
   * new maximum is folded down to it, and nothing else moves.
   * @param page - the page under test.
   */
  function clampNow(page: Page): void {
    const reach = Math.max(0, page.host.scrollHeight - page.host.clientHeight)
    page.host.scrollTop = Math.min(page.host.scrollTop, reach)
  }

  it('gives the host back the range a deletion takes, so the tail rises instead', () => {
    const page = buildPage(1555)
    page.host.scrollTop = 809
    page.deleteButton.click()

    // The commit lands a row shorter and the browser clamps what it held.
    page.content.height = 1501
    clampNow(page)
    expect(page.host.scrollTop).toBe(755)

    pinModelListCards(document.body)

    // The offset the user's click was made from holds again, one row of blank
    // below the real content is what holds it, and it is OURS.
    expect(page.host.scrollTop).toBe(809)
    expect(slackHeight(page.host)).toBe(54)
    const spacer = page.host.querySelector<HTMLElement>('.bre-list-slack')
    expect(spacer?.dataset['plugin']).toBe('dsh-model-think-level')
  })

  it('sizes the blank to the newest shrink rather than stacking one per row', () => {
    const page = buildPage(1555)
    page.host.scrollTop = 809
    page.deleteButton.click()
    page.content.height = 1501
    clampNow(page)
    pinModelListCards(document.body)
    expect(slackHeight(page.host)).toBe(54)

    // A second deletion, clicked from the position the first one holds.
    expect(page.host.scrollTop).toBe(809)
    page.deleteButton.click()
    page.content.height = 1447
    clampNow(page)
    pinModelListCards(document.body)

    // Two rows gone, one blank — computed from the real content each time.
    expect(slackHeight(page.host)).toBe(108)
    expect(page.host.querySelectorAll('.bre-list-slack').length).toBe(1)
    expect(page.host.scrollTop).toBe(809)
  })

  it('leaves a list that is nowhere near its end alone', () => {
    const page = buildPage(1555)
    page.host.scrollTop = 300
    page.deleteButton.click()
    page.content.height = 1501
    clampNow(page)

    pinModelListCards(document.body)

    // The content still reaches past the position: nothing was taken away, so
    // nothing is held open and the offset stays where the user put it.
    expect(slackHeight(page.host)).toBe(0)
    expect(page.host.scrollTop).toBe(300)
  })

  it('forgets the position once the user moves the view themselves', () => {
    const page = buildPage(1555)
    page.host.scrollTop = 809
    page.deleteButton.click()
    // A wheel before the commit lands: a position the user has left is not a
    // position to hold the view at.
    document.dispatchEvent(new WheelEvent('wheel', { bubbles: true }))
    page.content.height = 1501
    clampNow(page)

    pinModelListCards(document.body)

    expect(slackHeight(page.host)).toBe(0)
    expect(page.host.scrollTop).toBe(755)
  })

  it('lets the blank go once the view is off it', () => {
    const page = buildPage(1555)
    page.host.scrollTop = 809
    page.deleteButton.click()
    page.content.height = 1501
    clampNow(page)
    pinModelListCards(document.body)
    expect(slackHeight(page.host)).toBe(54)

    // Scrolling back up puts the blank below the view, where its removal moves
    // nothing.
    page.host.scrollTop = 100
    page.host.dispatchEvent(new Event('scroll'))

    expect(slackHeight(page.host)).toBe(0)
    expect(page.host.scrollTop).toBe(100)
  })

  it('drops every blank when the fiber goes away', () => {
    const page = buildPage(1555)
    page.host.scrollTop = 809
    page.deleteButton.click()
    page.content.height = 1501
    clampNow(page)
    pinModelListCards(document.body)
    expect(slackHeight(page.host)).toBe(54)

    // A dead fiber's blank is raw DOM inside the official panel: it leaves with
    // the listeners that would have swept it.
    unwatchModelListOffsets()

    expect(page.host.querySelector('.bre-list-slack')).toBeNull()
  })
})
