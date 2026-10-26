// @vitest-environment jsdom
/**
 * @file The directory the composer's model picker SUBMITS to.
 *
 * The React root holding `ComposerSlider` outlives a menu close: the wrapper is
 * DETACHED, not unmounted (see the close branch of `reconcile` in
 * `src/client/injection/composer-menu.ts`), so the `directory` the slider was
 * mounted with survives as a captured prop. `directory()` re-resolves the
 * CURRENT session's directory on every reconcile, but an already-mounted root
 * never heard about it — a menu reopened in session B re-inserted session A's
 * wrapper, and a pick went to A's directory while B's real prompt model never
 * moved. That is the "I picked a new model but the session did not switch" bug.
 *
 * These tests drive that exact sequence — mount in A, close, switch to B,
 * reopen, pick — and assert the pick lands on B.
 *
 * NOTE ON COUNTING: `wireEffortMemory` (see `src/client/effort-memory.ts`)
 * settles a level on its own whenever the directory's `current` moves, which
 * calls the underlying `select` WITHOUT any user pick. Counting `select` calls
 * therefore over-counts. The assertions below key on WHICH MODELS each
 * directory was asked for instead: A and B are given disjoint pick targets, so
 * a call naming the other session's target is exactly the stale-root leak.
 */
import { describe, expect, it, vi } from 'vitest'
import { directoryFixture, fakeApi, JOIN_FIXTURE, makeCtx, makeJoin, waitFor } from './support/composer-fixture.js'

/** The `apply()` context shape, mirroring tests/composer-menu.spec.tsx. */
type Ctx = Parameters<typeof import('../src/client/index.js').apply>[0]

/** The models both directories advertise. A and B pick from this one list. */
const MODELS = [
  { id: 'qwen-max', name: 'Qwen Max' },
  { id: 'qwen-plus', name: 'Qwen Plus' },
  { id: 'qwen-turbo', name: 'Qwen Turbo' },
] as const

/** The model session A picks, and the one session B picks — never the same. */
const PICK_A = 'Qwen Plus'
const PICK_B = 'Qwen Turbo'

/** Open the official composer popover: the chrome `menuOf()`/`triggerOf()` find. */
function openMenu(): HTMLElement {
  document.body.insertAdjacentHTML('beforeend', `
    <div data-composer-card>
      <button aria-haspopup="menu" aria-controls="seat-menu">DeepSeek V4 · High</button>
    </div>`)
  const card = document.querySelector('[data-composer-card]')!
  card.insertAdjacentHTML('beforeend', '<div id="seat-menu" role="menu"></div>')
  const menu = card.querySelector<HTMLElement>('#seat-menu')!
  // The shell's MenuSurface chrome — an empty aria-hidden FIRST child. Kept so
  // the replica lands where the real one does (see composer-menu.spec.tsx).
  menu.insertAdjacentHTML('beforeend', '<div aria-hidden="true" class="mc_material"></div>')
  return menu
}

/** The host closes the popover: every menu node leaves the document. */
function closeMenu(): void {
  document.body.innerHTML = ''
}

/**
 * A directory listing {@link MODELS} and resting on `currentModel` — a pick of
 * another model is a real switch, so it must reach `select` (a pick of the
 * model already current early-returns in the component and proves nothing).
 */
function modelDirectory(currentModel: string): ReturnType<typeof directoryFixture> {
  const dir = directoryFixture()
  const base = dir.store.getSnapshot()
  dir.update({
    ...base,
    current: { provider: 'aliyun', model: currentModel },
    groups: [{ ...base.groups[0], models: MODELS.map(model => ({ ...base.groups[0].models[0], ...model })) }],
  })
  return dir
}

/** Click a model row in the replica's model column. */
function pickModel(menu: HTMLElement, name: string): void {
  const options = Array.from(menu.querySelectorAll<HTMLButtonElement>('.bre-provider-models .bre-option'))
  const option = options.find(candidate => candidate.textContent?.includes(name))
  if (option === undefined) throw new Error(`the replica shows no option named ${name}`)
  option.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }))
}

/** The models a directory's underlying `select` was asked for, in order. */
function modelsOf(spy: ReturnType<typeof vi.fn>): string[] {
  return spy.mock.calls.map(call => (call[0] as { model: string }).model)
}

/** The picker must submit to the session's own directory and never another's. */
function expectPickRouted(own: ReturnType<typeof vi.fn>, other: ReturnType<typeof vi.fn>, ownPick: string, otherPick: string): void {
  expect(modelsOf(own), `the directory must be asked for ${ownPick}`).toContain(ownPick)
  expect(modelsOf(other), `the other directory must NOT be asked for ${ownPick}`).not.toContain(ownPick)
  // And the reciprocal, so a swap of the two directories is caught too.
  expect(modelsOf(other), `the directory must be asked for ${otherPick}`).toContain(otherPick)
  expect(modelsOf(own), `the other directory must NOT be asked for ${otherPick}`).not.toContain(otherPick)
}

describe('the directory the composer picker submits to', () => {
  it('follows the session across a menu close: a pick in B lands on B, never on A', async () => {
    document.body.innerHTML = ''
    const dirA = modelDirectory('qwen-max')
    const dirB = modelDirectory('qwen-max')
    // `wireEffortMemory` REPLACES `directory.select` with its own wrapper once
    // the session tracker resolves the instance, so hold the underlying spies
    // here — they are what the wrapper eventually calls.
    const pickedA = dirA.select as unknown as ReturnType<typeof vi.fn>
    const pickedB = dirB.select as unknown as ReturnType<typeof vi.fn>
    let sessionId = 's1'

    const { apply } = await import('../src/client/index.js')
    const api = fakeApi(() => Promise.resolve(makeJoin(structuredClone(JOIN_FIXTURE))))
    const h = makeCtx(api, {
      services: {
        sessions: { list: { getSnapshot: () => ({ current: sessionId }) } },
        modelDirectories: { directoryFor: (id: string) => (id === 's1' ? dirA : dirB) },
      },
    })
    apply(h.ctx as unknown as Ctx)
    try {
      // Session A: open the picker and switch model. It lands on A's directory.
      const first = openMenu()
      await waitFor(() => first.querySelector('[data-bre-slider="1"] .bre-provider-models .bre-option') !== null)
      pickModel(first, PICK_A)
      await waitFor(() => modelsOf(pickedA).includes('qwen-plus'))

      // The host closes the popover after a successful pick; the user moves to
      // session B and opens the picker again. `directory()` now resolves B.
      closeMenu()
      sessionId = 's2'

      const second = openMenu()
      await waitFor(() => second.querySelector('[data-bre-slider="1"] .bre-provider-models .bre-option') !== null)
      pickModel(second, PICK_B)

      // Best-effort settle time: a stale root routes the pick to A (or nowhere,
      // since A already rests on that model) and never reaches B, so the
      // assertions below name what actually landed rather than a bare count.
      await waitFor(() => modelsOf(pickedB).includes('qwen-turbo'), 1200).catch(() => undefined)
      expectPickRouted(pickedB, pickedA, 'qwen-turbo', 'qwen-plus')
    } finally {
      h.disposeAll()
      document.body.innerHTML = ''
    }
  })

  it('follows a rebuilt directory even when the session id does not change', async () => {
    // Same bug, second shape: `directoryFor` returns a NEW instance for the same
    // session id (the tracker re-resolves on every ensure). The root must not
    // keep submitting to the instance it was mounted with.
    document.body.innerHTML = ''
    const dirA = modelDirectory('qwen-max')
    const dirB = modelDirectory('qwen-max')
    const pickedA = dirA.select as unknown as ReturnType<typeof vi.fn>
    const pickedB = dirB.select as unknown as ReturnType<typeof vi.fn>
    let current = dirA

    const { apply } = await import('../src/client/index.js')
    const api = fakeApi(() => Promise.resolve(makeJoin(structuredClone(JOIN_FIXTURE))))
    const h = makeCtx(api, {
      services: {
        sessions: { list: { getSnapshot: () => ({ current: 's1' }) } },
        modelDirectories: { directoryFor: () => current },
      },
    })
    apply(h.ctx as unknown as Ctx)
    try {
      const first = openMenu()
      await waitFor(() => first.querySelector('[data-bre-slider="1"] .bre-provider-models .bre-option') !== null)
      pickModel(first, PICK_A)
      await waitFor(() => modelsOf(pickedA).includes('qwen-plus'))

      closeMenu()
      current = dirB

      const second = openMenu()
      await waitFor(() => second.querySelector('[data-bre-slider="1"] .bre-provider-models .bre-option') !== null)
      pickModel(second, PICK_B)

      await waitFor(() => modelsOf(pickedB).includes('qwen-turbo'), 1200).catch(() => undefined)
      expectPickRouted(pickedB, pickedA, 'qwen-turbo', 'qwen-plus')
    } finally {
      h.disposeAll()
      document.body.innerHTML = ''
    }
  })

  it('re-attaches a stable root instead of rebuilding it on every observer pass', async () => {
    // The other half of the same contract: the root is rebuilt on a directory
    // IDENTITY change, so a host that resolves one instance per call (instead
    // of memoizing per session, as the kernel does) would rebuild on EVERY
    // reconcile — and each rebuild is a childList mutation that re-enters the
    // Models-page observer. That feedback loop is what exhausted the CI worker's
    // heap, so the stable case is pinned here: same instance in, same wrapper out.
    document.body.innerHTML = ''
    const dir = modelDirectory('qwen-max')

    const { apply } = await import('../src/client/index.js')
    const api = fakeApi(() => Promise.resolve(makeJoin(structuredClone(JOIN_FIXTURE))))
    const h = makeCtx(api, {
      services: {
        sessions: { list: { getSnapshot: () => ({ current: 's1' }) } },
        modelDirectories: { directoryFor: () => dir },
      },
    })
    apply(h.ctx as unknown as Ctx)
    try {
      const menu = openMenu()
      await waitFor(() => menu.querySelector('[data-bre-slider="1"] .bre-provider-models .bre-option') !== null)
      const wrapper = menu.querySelector<HTMLElement>('[data-bre-slider="1"]')!

      // Unrelated document mutations: each one drives a reconcile pass, which
      // re-resolves the directory. None of them may replace the mounted root.
      for (let pass = 0; pass < 5; pass += 1) {
        document.body.insertAdjacentHTML('beforeend', '<div data-noise="1"></div>')
        await new Promise(resolve => setTimeout(resolve, 20))
      }

      expect(menu.querySelector('[data-bre-slider="1"]')).toBe(wrapper)
      expect(wrapper.isConnected).toBe(true)
      expect(wrapper.parentElement).toBe(menu)
    } finally {
      h.disposeAll()
      document.body.innerHTML = ''
    }
  })
})
