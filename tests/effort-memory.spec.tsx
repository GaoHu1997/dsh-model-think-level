/**
 * Effort-memory tests: the wire's full discipline — per-model memory, the
 * knowledge base's vendor-default fallback for models without one, respect
 * for explicit picks (a level, or a same-model "follow the provider
 * default"), the projection-restore watcher for level-less session restores,
 * the slider gate, defensive storage reads, and fiber-dispose restoration.
 */

// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  rememberEffort,
  rememberedEffort,
  wireEffortMemory,
} from '../src/client/effort-memory.js'
import { setSliderEnabled } from '../src/client/slider-pref.js'
import type {
  DirectoryCurrentLike,
  ModelDirectoryLike,
  ModelDirectoryStateLike,
} from '../src/client/types.js'

const LEVELS = (...ids: string[]) => ids.map(id => ({ id, name: id.charAt(0).toUpperCase() + id.slice(1) }))

/**
 * A directory snapshot spanning the fallback cases: two knowledge-base
 * families with DIFFERENT vendor defaults (gpt-5.6 → medium, kimi-k3 → max),
 * one unknown id (protocol inference → medium), a one-level ladder carrying
 * no memory and no vendor default, and one model with no reasoning metadata
 * at all. A non-null current carries `medium` unless `restore` asks for the
 * level-less shape a restored projection arrives in — otherwise wiring the
 * snapshot would immediately trigger (and pollute) the restore watcher.
 */
function stateWith(
  current: DirectoryCurrentLike | null,
  opts?: { restore?: boolean },
): ModelDirectoryStateLike {
  return {
    current: current === null || opts?.restore === true
      ? current
      : { ...current, reasoningEffort: 'medium' },
    routable: true,
    groups: [
      {
        id: 'openai',
        name: 'OpenAI',
        models: [
          { id: 'gpt-5.6', name: 'GPT-5.6', reasoning: { efforts: LEVELS('low', 'medium', 'high', 'xhigh', 'max') } },
          { id: 'gpt-6-astra', name: 'GPT-6 Astra', reasoning: { efforts: LEVELS('low', 'medium', 'high', 'xhigh', 'max') } },
        ],
      },
      {
        id: 'moonshot',
        name: 'Moonshot',
        models: [{ id: 'kimi-k3', name: 'Kimi K3', reasoning: { efforts: LEVELS('low', 'high', 'max') } }],
      },
      {
        id: 'generic',
        name: 'Gateway',
        models: [{ id: 'gateway-xyz-pro', name: 'Gateway Pro', reasoning: { efforts: LEVELS('low', 'medium', 'high') } }],
      },
      {
        // A directory whose one-model ladder carries neither a memory nor the
        // vendor default: the switch must stand down entirely.
        id: 'narrow',
        name: 'Narrow',
        models: [{ id: 'narrow-max', name: 'Narrow', reasoning: { efforts: LEVELS('xhigh') } }],
      },
      {
        id: 'plain',
        name: 'Plain',
        models: [{ id: 'plain-chat-9', name: 'Plain Chat' }],
      },
    ],
    failures: [],
    status: 'ready',
    pending: null,
    error: null,
  }
}

type Selection = Parameters<ModelDirectoryLike['select']>[0]

/** A directory fake whose submissions are recorded; `state` is swappable. */
function fakeDirectory(
  initial: ModelDirectoryStateLike,
  opts?: {
    rejectSelects?: boolean
    /** Reject the first N submissions (a session mid-initialization), then accept. */
    rejectFirst?: number
    /**
     * How a refusal arrives. 'throw' is the <= 0.1.6-alpha.1 directory;
     * 'value' is 0.1.6-alpha.2, whose `select` resolves a `{ok:false}` result
     * instead of throwing.
     */
    rejectShape?: 'throw' | 'value'
  },
): {
  directory: ModelDirectoryLike
  submitted: Selection[]
  /** How many times `select` was invoked, refusals included. */
  attempts: () => number
  update(next: ModelDirectoryStateLike): void
} {
  let state = initial
  let selectCalls = 0
  const submitted: Selection[] = []
  const listeners = new Set<() => void>()
  const directory = {
    store: {
      getSnapshot: (): ModelDirectoryStateLike => state,
      subscribe(listener: () => void): () => void {
        listeners.add(listener)
        return () => { listeners.delete(listener) }
      },
    },
    load: async (): Promise<ModelDirectoryStateLike> => state,
    select: async (selection: Selection): Promise<unknown> => {
      // The real directory throws on a rejected selection (directory.ts) —
      // AFTER surfacing the refusal through the store, which notifies the
      // watcher SYNCHRONOUSLY (dsh-client-store flushes 'sync').
      if (opts?.rejectSelects === true || selectCalls < (opts?.rejectFirst ?? 0)) {
        selectCalls += 1
        state = { ...state, status: 'error', error: 'session/invalid: no such effort' }
        for (const listener of [...listeners]) listener()
        if (opts?.rejectShape === 'value') {
          return { ok: false, error: { code: 'session/invalid', message: 'no such effort' } }
        }
        throw new Error('session.selectModel failed: session/invalid: no such effort')
      }
      selectCalls += 1
      submitted.push(selection)
      // The real directory's confirmed selection lands in the store (and
      // re-notifies the watcher), which is what makes "switch away and back"
      // read as a model switch at all.
      state = {
        ...state,
        current: {
          provider: selection.provider,
          model: selection.model,
          ...(selection.reasoningEffort === undefined ? {} : { reasoningEffort: selection.reasoningEffort }),
        },
      }
      for (const listener of [...listeners]) listener()
      return undefined
    },
  }
  return {
    directory: directory as unknown as ModelDirectoryLike,
    submitted,
    attempts: () => selectCalls,
    update(next: ModelDirectoryStateLike): void {
      state = next
      for (const listener of [...listeners]) listener()
    },
  }
}

beforeEach(() => {
  window.localStorage.clear()
  setSliderEnabled(true)
})

describe('effort memory storage', () => {
  it('round-trips per provider/model and degrades malformed documents to no memory', () => {
    expect(rememberedEffort('openai', 'gpt-5.6')).toBeUndefined()
    rememberEffort('openai', 'gpt-5.6', 'high')
    rememberEffort('moonshot', 'kimi-k3', 'off')
    expect(rememberedEffort('openai', 'gpt-5.6')).toBe('high')
    expect(rememberedEffort('moonshot', 'kimi-k3')).toBe('off')
    // The same model id under another provider is a DIFFERENT memory slot.
    expect(rememberedEffort('gateway', 'gpt-5.6')).toBeUndefined()

    window.localStorage.setItem('dsh-model-think-level.slider.efforts', 'not-json')
    expect(rememberedEffort('openai', 'gpt-5.6')).toBeUndefined()
    window.localStorage.setItem('dsh-model-think-level.slider.efforts', '{"openai/gpt-5.6":42,"": "x"}')
    expect(rememberedEffort('openai', 'gpt-5.6')).toBeUndefined()
  })
})

describe('wireEffortMemory: model switches', () => {
  it('records an explicit level for its exact model and submits untouched', async () => {
    const fake = fakeDirectory(stateWith({ provider: 'openai', model: 'gpt-5.6' }))
    const restore = wireEffortMemory(fake.directory)
    try {
      await fake.directory.select({ provider: 'openai', model: 'gpt-5.6', reasoningEffort: 'high' })
      expect(fake.submitted).toEqual([{ provider: 'openai', model: 'gpt-5.6', reasoningEffort: 'high' }])
      expect(rememberedEffort('openai', 'gpt-5.6')).toBe('high')
    } finally {
      restore()
    }
  })

  it('does not remember a REFUSED explicit pick', async () => {
    const fake = fakeDirectory(stateWith({ provider: 'openai', model: 'gpt-5.6' }), { rejectSelects: true })
    const restore = wireEffortMemory(fake.directory)
    try {
      await expect(
        fake.directory.select({ provider: 'openai', model: 'gpt-5.6', reasoningEffort: 'xhigh' }),
      ).rejects.toThrow('session.selectModel failed')
      // A refused pick must not poison the memory for every later switch.
      expect(rememberedEffort('openai', 'gpt-5.6')).toBeUndefined()
    } finally {
      restore()
    }
  })

  it('does not remember an explicit pick the host refuses as a result (0.1.6-alpha.2)', async () => {
    // 0.1.6-alpha.2's directory RESOLVES a {ok:false} result on refusal instead
    // of throwing; the memory must treat it exactly like the thrown refusal.
    const fake = fakeDirectory(
      stateWith({ provider: 'openai', model: 'gpt-5.6' }),
      { rejectSelects: true, rejectShape: 'value' },
    )
    const restore = wireEffortMemory(fake.directory)
    try {
      const outcome = await fake.directory.select({ provider: 'openai', model: 'gpt-5.6', reasoningEffort: 'xhigh' })
      expect(outcome).toMatchObject({ ok: false })
      expect(rememberedEffort('openai', 'gpt-5.6')).toBeUndefined()
    } finally {
      restore()
    }
  })

  it('re-applies the target model\'s own remembered level on a switch', async () => {
    rememberEffort('moonshot', 'kimi-k3', 'low')
    const fake = fakeDirectory(stateWith({ provider: 'openai', model: 'gpt-5.6' }))
    const restore = wireEffortMemory(fake.directory)
    try {
      await fake.directory.select({ provider: 'moonshot', model: 'kimi-k3' })
      expect(fake.submitted).toEqual([{ provider: 'moonshot', model: 'kimi-k3', reasoningEffort: 'low' }])
    } finally {
      restore()
    }
  })

  it('applies the fallback on the first model selection from an empty session', async () => {
    const fake = fakeDirectory(stateWith(null))
    const restore = wireEffortMemory(fake.directory)
    try {
      await fake.directory.select({ provider: 'openai', model: 'gpt-5.6' })
      expect(fake.submitted).toEqual([{
        provider: 'openai',
        model: 'gpt-5.6',
        reasoningEffort: 'medium',
      }])
    } finally {
      restore()
    }
  })

  it('commits the displayed middle level on first use when the model has no declared default', async () => {
    const fake = fakeDirectory(stateWith({ provider: 'plain', model: 'plain-chat-9' }))
    const restore = wireEffortMemory(fake.directory)
    try {
      // GPT-6 Astra has a thinking ladder but no documented/default effort. The
      // composer previews the middle option (High for this five-level ladder),
      // so the native selection must receive that same level on the first model
      // switch.
      await fake.directory.select({ provider: 'openai', model: 'gpt-6-astra' })
      expect(fake.submitted).toEqual([{
        provider: 'openai',
        model: 'gpt-6-astra',
        reasoningEffort: 'high',
      }])
    } finally {
      restore()
    }
  })

  it('falls back to the vendor default when the target model has no memory', async () => {
    const fake = fakeDirectory(stateWith({ provider: 'plain', model: 'plain-chat-9' }))
    const restore = wireEffortMemory(fake.directory)
    try {
      // Knowledge base family: the vendor's own documented default.
      await fake.directory.select({ provider: 'openai', model: 'gpt-5.6' })
      expect(fake.submitted).toEqual([{ provider: 'openai', model: 'gpt-5.6', reasoningEffort: 'medium' }])
      // Another family with a different vendor default.
      await fake.directory.select({ provider: 'moonshot', model: 'kimi-k3' })
      expect(fake.submitted[1]).toEqual({ provider: 'moonshot', model: 'kimi-k3', reasoningEffort: 'max' })
      // Unknown id: the inferred generic ladder's medium.
      await fake.directory.select({ provider: 'generic', model: 'gateway-xyz-pro' })
      expect(fake.submitted[2]).toEqual({ provider: 'generic', model: 'gateway-xyz-pro', reasoningEffort: 'medium' })
    } finally {
      restore()
    }
  })

  it('falls back to the vendor default when the remembered level is off the target ladder', async () => {
    // 'minimal' was picked on some other model; gpt-5.6's ladder lacks it.
    rememberEffort('openai', 'gpt-5.6', 'minimal')
    const fake = fakeDirectory(stateWith({ provider: 'moonshot', model: 'kimi-k3' }))
    const restore = wireEffortMemory(fake.directory)
    try {
      await fake.directory.select({ provider: 'openai', model: 'gpt-5.6' })
      expect(fake.submitted).toEqual([{ provider: 'openai', model: 'gpt-5.6', reasoningEffort: 'medium' }])
    } finally {
      restore()
    }
  })

  it('leaves the switch untouched when no fallback lands on the advertised ladder', async () => {
    const fake = fakeDirectory(stateWith({ provider: 'openai', model: 'gpt-5.6' }))
    const restore = wireEffortMemory(fake.directory)
    try {
      // The advertised ladder carries neither a memory nor the vendor
      // default: the official behaviour stands.
      await fake.directory.select({ provider: 'narrow', model: 'narrow-max' })
      expect(fake.submitted).toEqual([{ provider: 'narrow', model: 'narrow-max' }])
      // No reasoning metadata at all: nothing to speak.
      await fake.directory.select({ provider: 'plain', model: 'plain-chat-9' })
      expect(fake.submitted[1]).toEqual({ provider: 'plain', model: 'plain-chat-9' })
    } finally {
      restore()
    }
  })

  it('passes through a same-model effort-less selection (explicit provider default)', async () => {
    rememberEffort('openai', 'gpt-5.6', 'high')
    const fake = fakeDirectory(stateWith({ provider: 'openai', model: 'gpt-5.6' }))
    const restore = wireEffortMemory(fake.directory)
    try {
      await fake.directory.select({ provider: 'openai', model: 'gpt-5.6' })
      expect(fake.submitted).toEqual([{ provider: 'openai', model: 'gpt-5.6' }])
    } finally {
      restore()
    }
  })

  it('gates the injection on the slider preference', async () => {
    rememberEffort('moonshot', 'kimi-k3', 'low')
    const fake = fakeDirectory(stateWith({ provider: 'openai', model: 'gpt-5.6' }))
    const restore = wireEffortMemory(fake.directory)
    try {
      setSliderEnabled(false)
      await fake.directory.select({ provider: 'moonshot', model: 'kimi-k3' })
      expect(fake.submitted).toEqual([{ provider: 'moonshot', model: 'kimi-k3' }])
    } finally {
      restore()
    }
  })

  it('records nothing while the slider is off — the wrap is a pure pass-through', async () => {
    const fake = fakeDirectory(stateWith({ provider: 'openai', model: 'gpt-5.6' }))
    const restore = wireEffortMemory(fake.directory)
    try {
      setSliderEnabled(false)
      // An explicit pick with the slider off must not enter the memory: the
      // plugin is absent, and its bookkeeping dies with it.
      await fake.directory.select({ provider: 'moonshot', model: 'kimi-k3', reasoningEffort: 'low' })
      expect(fake.submitted).toEqual([{ provider: 'moonshot', model: 'kimi-k3', reasoningEffort: 'low' }])
      expect(rememberedEffort('moonshot', 'kimi-k3')).toBeUndefined()
      // ... and a same-model effort-less pick must not spend the restore
      // attempt either, so re-enabling the slider restores full behaviour.
      await fake.directory.select({ provider: 'moonshot', model: 'kimi-k3' })
      setSliderEnabled(true)
      rememberEffort('moonshot', 'kimi-k3', 'high')
      fake.update(stateWith({ provider: 'moonshot', model: 'kimi-k3' }, { restore: true }))
      await vi.waitFor(() => expect(fake.submitted[2]).toEqual({ provider: 'moonshot', model: 'kimi-k3', reasoningEffort: 'high' }))
    } finally {
      restore()
    }
  })

  it('is idempotent per instance and restores the original select on dispose', async () => {
    const fake = fakeDirectory(stateWith({ provider: 'openai', model: 'gpt-5.6' }))
    const original = fake.directory.select
    const restore = wireEffortMemory(fake.directory)
    const noop = wireEffortMemory(fake.directory)
    try {
      expect(noop).not.toBe(restore)
      restore()
      // The original method is back: a switch no longer carries a level.
      expect(fake.directory.select).toBe(original)
      await fake.directory.select({ provider: 'moonshot', model: 'kimi-k3' })
      expect(fake.submitted).toEqual([{ provider: 'moonshot', model: 'kimi-k3' }])
    } finally {
      restore()
      // A second dispose stays harmless.
      restore()
    }
  })
})

describe('wireEffortMemory: restored projections', () => {
  it('re-applies the chain to a level-less projection resident at wire time', async () => {
    // A restored session's projection lands WITHOUT going through select;
    // no memory for kimi-k3, so the vendor default (max) applies.
    const fake = fakeDirectory(stateWith({ provider: 'moonshot', model: 'kimi-k3' }, { restore: true }))
    const restore = wireEffortMemory(fake.directory)
    try {
      // The chain is async (the configured layer reads the settings
      // document), so the re-apply settles on a microtask.
      await vi.waitFor(() => expect(fake.submitted).toEqual([{ provider: 'moonshot', model: 'kimi-k3', reasoningEffort: 'max' }]))
      // The watcher's own re-apply is a memory READ, not a user pick.
      expect(rememberedEffort('moonshot', 'kimi-k3')).toBeUndefined()
    } finally {
      restore()
    }
  })

  it('commits the displayed middle level for a level-less first-use projection', async () => {
    const fake = fakeDirectory(stateWith({ provider: 'openai', model: 'gpt-6-astra' }, { restore: true }))
    const restore = wireEffortMemory(fake.directory)
    try {
      await vi.waitFor(() => expect(fake.submitted).toEqual([{
        provider: 'openai',
        model: 'gpt-6-astra',
        reasoningEffort: 'high',
      }]))
    } finally {
      restore()
    }
  })

  it('prefers the model memory, then never fights an explicit provider default', async () => {
    rememberEffort('moonshot', 'kimi-k3', 'low')
    const fake = fakeDirectory(stateWith({ provider: 'plain', model: 'plain-chat-9' }))
    const restore = wireEffortMemory(fake.directory)
    try {
      // The restored projection arrives after wiring (history load).
      fake.update(stateWith({ provider: 'moonshot', model: 'kimi-k3' }, { restore: true }))
      await vi.waitFor(() => expect(fake.submitted).toEqual([{ provider: 'moonshot', model: 'kimi-k3', reasoningEffort: 'low' }]))
      // The session then goes level-less again (an explicit provider-default
      // pick landed): the spent attempt must NOT re-fight the user.
      fake.update(stateWith({ provider: 'moonshot', model: 'kimi-k3' }, { restore: true }))
      await new Promise(resolve => setTimeout(resolve, 0))
      expect(fake.submitted).toHaveLength(1)
    } finally {
      restore()
    }
  })

  it('leaves restored projections alone when gated or already levelled', () => {
    // A projection carrying its own level is respected as-is.
    const levelled = fakeDirectory(stateWith({ provider: 'openai', model: 'gpt-5.6' }))
    const restoreLevelled = wireEffortMemory(levelled.directory)
    try {
      expect(levelled.submitted).toHaveLength(0)
    } finally {
      restoreLevelled()
    }
    // Slider preference off: no restore at all.
    rememberEffort('moonshot', 'kimi-k3', 'low')
    setSliderEnabled(false)
    const gated = fakeDirectory(stateWith({ provider: 'moonshot', model: 'kimi-k3' }, { restore: true }))
    const restoreGated = wireEffortMemory(gated.directory)
    try {
      expect(gated.submitted).toHaveLength(0)
      // A later store update stays quiet too (the gate is checked first).
      gated.update(stateWith({ provider: 'moonshot', model: 'kimi-k3' }, { restore: true }))
      expect(gated.submitted).toHaveLength(0)
    } finally {
      restoreGated()
    }
  })

  it('retries refused restores across store updates until the memory lands', async () => {
    rememberEffort('moonshot', 'kimi-k3', 'low')
    const fake = fakeDirectory(
      stateWith({ provider: 'moonshot', model: 'kimi-k3' }, { restore: true }),
      { rejectFirst: 2 },
    )
    const restore = wireEffortMemory(fake.directory)
    try {
      // The wire-time attempt is refused (a session mid-initialization); the
      // refund re-kicks the watcher itself, and later store updates retry the
      // refunded attempt too, until one lands the remembered level.
      fake.update(stateWith({ provider: 'moonshot', model: 'kimi-k3' }, { restore: true }))
      await vi.waitFor(() => expect(fake.submitted).toEqual([
        { provider: 'moonshot', model: 'kimi-k3', reasoningEffort: 'low' },
      ]))
      // The successful attempt is final: later updates stay quiet.
      fake.update(stateWith({ provider: 'moonshot', model: 'kimi-k3' }, { restore: true }))
      await new Promise(resolve => setTimeout(resolve, 0))
      expect(fake.attempts()).toBe(3)
    } finally {
      restore()
    }
  })

  it('retries refused restores when the host returns the refusal as a result (0.1.6-alpha.2)', async () => {
    // 0.1.6-alpha.2's refusal is a RESOLVED {ok:false}, not a throw: without
    // normalizing it the refund/retry path is dead and a session mid-init
    // would lose its remembered level for good.
    rememberEffort('moonshot', 'kimi-k3', 'low')
    const fake = fakeDirectory(
      stateWith({ provider: 'moonshot', model: 'kimi-k3' }, { restore: true }),
      { rejectFirst: 2, rejectShape: 'value' },
    )
    const restore = wireEffortMemory(fake.directory)
    try {
      fake.update(stateWith({ provider: 'moonshot', model: 'kimi-k3' }, { restore: true }))
      await vi.waitFor(() => expect(fake.submitted).toEqual([
        { provider: 'moonshot', model: 'kimi-k3', reasoningEffort: 'low' },
      ]))
      expect(fake.attempts()).toBe(3)
    } finally {
      restore()
    }
  })

  it('gives up on one model after the retry ceiling and stays quiet', async () => {
    rememberEffort('moonshot', 'kimi-k3', 'low')
    const fake = fakeDirectory(
      stateWith({ provider: 'moonshot', model: 'kimi-k3' }, { restore: true }),
      { rejectSelects: true },
    )
    const restore = wireEffortMemory(fake.directory)
    try {
      // Exactly the ceiling's worth of attempts — the wire-time attempt plus
      // the self-re-kicked refunds — then the watcher stands down for this
      // directory instead of retrying forever.
      await vi.waitFor(() => expect(fake.attempts()).toBe(3))
      // The ceiling is reached: later store updates attempt nothing more.
      fake.update(stateWith({ provider: 'moonshot', model: 'kimi-k3' }, { restore: true }))
      await new Promise(resolve => setTimeout(resolve, 0))
      expect(fake.attempts()).toBe(3)
    } finally {
      restore()
    }
  })

  it('refunds a chain miss so a later document change can answer', async () => {
    // narrow-max has a one-level ladder and no memory, native sighting or
    // vendor default: with no configured pick either the chain misses. The
    // configured layer reads LIVE settings, so the miss must NOT spend the
    // model's restore — a pick added later (a settings document push) lands.
    let configured: string | undefined = undefined
    const fake = fakeDirectory(stateWith({ provider: 'narrow', model: 'narrow-max' }, { restore: true }))
    const restore = wireEffortMemory(fake.directory, { configuredEffort: async () => configured })
    try {
      fake.update(stateWith({ provider: 'narrow', model: 'narrow-max' }, { restore: true }))
      await new Promise(resolve => setTimeout(resolve, 0))
      expect(fake.submitted).toHaveLength(0)
      // The user saves a default-effort pick; the next store update retries.
      configured = 'xhigh'
      fake.update(stateWith({ provider: 'narrow', model: 'narrow-max' }, { restore: true }))
      await vi.waitFor(() => expect(fake.submitted).toEqual([{ provider: 'narrow', model: 'narrow-max', reasoningEffort: 'xhigh' }]))
    } finally {
      restore()
    }
  })
})

describe('wireEffortMemory: configured per-model pick', () => {
  it('outranks the cross-session memory when set', async () => {
    rememberEffort('moonshot', 'kimi-k3', 'low')
    // The current selection is a DIFFERENT model, so the switch injection
    // path (the one that reads the chain) runs.
    const fake = fakeDirectory(stateWith({ provider: 'openai', model: 'gpt-5.6' }))
    const restore = wireEffortMemory(fake.directory, { configuredEffort: async () => 'high' })
    try {
      await fake.directory.select({ provider: 'moonshot', model: 'kimi-k3' })
      expect(fake.submitted).toEqual([{ provider: 'moonshot', model: 'kimi-k3', reasoningEffort: 'high' }])
    } finally {
      restore()
    }
  })

  it('degrades to the memory when unset and when off the advertised ladder', async () => {
    rememberEffort('moonshot', 'kimi-k3', 'low')
    const fake = fakeDirectory(stateWith({ provider: 'openai', model: 'gpt-5.6' }))
    const restore = wireEffortMemory(fake.directory, { configuredEffort: async () => undefined })
    try {
      await fake.directory.select({ provider: 'moonshot', model: 'kimi-k3' })
      expect(fake.submitted).toEqual([{ provider: 'moonshot', model: 'kimi-k3', reasoningEffort: 'low' }])
    } finally {
      restore()
    }
    // kimi-k3's ladder lacks 'medium': a pick naming it must not be spoken.
    const offLadder = fakeDirectory(stateWith({ provider: 'openai', model: 'gpt-5.6' }))
    const restoreOff = wireEffortMemory(offLadder.directory, { configuredEffort: async () => 'medium' })
    try {
      await offLadder.directory.select({ provider: 'moonshot', model: 'kimi-k3' })
      expect(offLadder.submitted).toEqual([{ provider: 'moonshot', model: 'kimi-k3', reasoningEffort: 'low' }])
    } finally {
      restoreOff()
    }
  })

  it('never waits on the configured pick: a hung settings read still commits the switch', async () => {
    // The configured layer reads the whole settings document, which is slow
    // (and can hang) right after a reconnect or a config sync. A model switch
    // must not wait for it: the click commits on the bounded wait, and the
    // level lands through the projection watcher instead of being lost.
    const fake = fakeDirectory(stateWith({ provider: 'openai', model: 'gpt-5.6' }))
    const restore = wireEffortMemory(fake.directory, {
      configuredEffort: () => new Promise<string | undefined>(() => undefined),
    })
    try {
      await fake.directory.select({ provider: 'moonshot', model: 'kimi-k3' })
      expect(fake.attempts()).toBe(1)
      // The chain continues past the hung read and answers from the vendor
      // default, so the switch carries a level instead of stalling on it.
      expect(fake.submitted).toEqual([{ provider: 'moonshot', model: 'kimi-k3', reasoningEffort: 'max' }])
    } finally {
      restore()
    }
  })

  it('applies the configured pick to a level-less restored projection', async () => {
    const fake = fakeDirectory(stateWith({ provider: 'moonshot', model: 'kimi-k3' }, { restore: true }))
    const restore = wireEffortMemory(fake.directory, { configuredEffort: async () => 'high' })
    try {
      await vi.waitFor(() => expect(fake.submitted).toEqual([{ provider: 'moonshot', model: 'kimi-k3', reasoningEffort: 'high' }]))
      // The watcher's re-apply is a memory READ, not a user pick.
      expect(rememberedEffort('moonshot', 'kimi-k3')).toBeUndefined()
    } finally {
      restore()
    }
  })

  it('retries a refusal without needing an external store update', async () => {
    // The refusal's own error update reaches the watcher synchronously, while
    // the refund is a microtask — the refund must re-kick the watcher itself
    // or a quiet session would never retry.
    rememberEffort('moonshot', 'kimi-k3', 'low')
    const fake = fakeDirectory(
      stateWith({ provider: 'moonshot', model: 'kimi-k3' }, { restore: true }),
      { rejectFirst: 1 },
    )
    const restore = wireEffortMemory(fake.directory)
    try {
      await vi.waitFor(() => expect(fake.submitted).toEqual([{ provider: 'moonshot', model: 'kimi-k3', reasoningEffort: 'low' }]))
    } finally {
      restore()
    }
  })

  it('submits the switch bare when the slider flips off during the chain await', async () => {
    // Hold the configured layer in flight so the switch parks inside its
    // post-await window; the gate is re-checked THERE, not only at entry.
    let release!: (level: string | undefined) => void
    const gate = new Promise<string | undefined>(resolve => { release = resolve })
    const fake = fakeDirectory(stateWith({ provider: 'openai', model: 'gpt-5.6' }))
    const restore = wireEffortMemory(fake.directory, { configuredEffort: () => gate })
    try {
      const switchCall = fake.directory.select({ provider: 'moonshot', model: 'kimi-k3' })
      // The toggle lands while the chain is still in flight: the plugin is
      // absent at submission time.
      setSliderEnabled(false)
      release('high')
      await switchCall
      // The switch itself must still land -- as the plain pass-through the
      // unwired directory would have performed, with nothing recorded.
      expect(fake.submitted).toEqual([{ provider: 'moonshot', model: 'kimi-k3' }])
      expect(rememberedEffort('moonshot', 'kimi-k3')).toBeUndefined()
    } finally {
      restore()
    }
  })

  it('never overrides a newer user action that lands during the chain await', async () => {
    // Hold the configured layer in flight so the switch path parks inside
    // its post-await window; a user utterance landing there is final.
    let release!: (level: string | undefined) => void
    const gate = new Promise<string | undefined>(resolve => { release = resolve })
    const fake = fakeDirectory(stateWith({ provider: 'openai', model: 'gpt-5.6' }))
    const restore = wireEffortMemory(fake.directory, { configuredEffort: () => gate })
    try {
      const switchCall = fake.directory.select({ provider: 'moonshot', model: 'kimi-k3' })
      // A user utterance lands while the switch's chain is still in flight.
      await fake.directory.select({ provider: 'moonshot', model: 'kimi-k3', reasoningEffort: 'low' })
      release('high')
      await switchCall
      // The stale switch submission was dropped entirely: the user's pick stands.
      expect(fake.submitted).toEqual([{ provider: 'moonshot', model: 'kimi-k3', reasoningEffort: 'low' }])
    } finally {
      restore()
    }
  })

  it('refunds the restore attempt when the slider flips off during the chain await', async () => {
    let release!: (level: string | undefined) => void
    const gate = new Promise<string | undefined>(resolve => { release = resolve })
    const fake = fakeDirectory(stateWith({ provider: 'moonshot', model: 'kimi-k3' }, { restore: true }))
    const restore = wireEffortMemory(fake.directory, { configuredEffort: () => gate })
    try {
      // The wire-time restore parks inside the configured read; the toggle
      // lands there, before the watcher had its say.
      setSliderEnabled(false)
      release('high')
      await new Promise(resolve => setTimeout(resolve, 0))
      // Absent at decision time: nothing was spoken...
      expect(fake.attempts()).toBe(0)
      // ...and the attempt was REFUNDED -- the watcher is silent while the
      // slider is off, so a spent attempt could never be re-kicked; with the
      // refund, re-enabling the slider and nudging the store lands the memory.
      setSliderEnabled(true)
      fake.update(stateWith({ provider: 'moonshot', model: 'kimi-k3' }, { restore: true }))
      await vi.waitFor(() => expect(fake.submitted).toEqual([{ provider: 'moonshot', model: 'kimi-k3', reasoningEffort: 'high' }]))
    } finally {
      restore()
    }
  })

  it('never overrides an explicit follow-the-default that lands during the restore await', async () => {
    let release!: (level: string | undefined) => void
    const gate = new Promise<string | undefined>(resolve => { release = resolve })
    const fake = fakeDirectory(stateWith({ provider: 'moonshot', model: 'kimi-k3' }, { restore: true }))
    const restore = wireEffortMemory(fake.directory, { configuredEffort: () => gate })
    try {
      // The wire-time restore attempt parks inside the configured read
      // (before reaching select: attempts stays 0), and the user re-submits
      // the same model WITHOUT a level — an explicit "follow the provider
      // default", the final word for this session.
      await fake.directory.select({ provider: 'moonshot', model: 'kimi-k3' })
      release('high')
      await new Promise(resolve => setTimeout(resolve, 0))
      // The watcher's stale injection never happened: the only select call
      // is the user's own follow-the-default pick (no level attached).
      expect(fake.attempts()).toBe(1)
      expect(fake.submitted).toEqual([{ provider: 'moonshot', model: 'kimi-k3' }])
    } finally {
      restore()
    }
  })
})

describe('wireEffortMemory: watcher vs an in-flight pick', () => {
  /**
   * A directory whose underlying select HANGS until the test releases it, with
   * the real host's generation discipline: the LAST submitter wins, and an
   * earlier in-flight response is discarded — returning a fake
   * `{ok: true, value: undefined}` on success, indistinguishable from an
   * accepted pick. That fake-ok is what let a watcher re-select silently
   * swallow the user's pick (the session model switch that "did not switch").
   */
  function gatedDirectory(initial: ModelDirectoryStateLike, opts?: { refuseFirst?: number }) {
    let state = initial
    const submitted: Selection[] = []
    const resolvers: Array<(value: unknown) => void> = []
    const listeners = new Set<() => void>()
    const notify = (): void => { for (const listener of [...listeners]) listener() }
    const directory = {
      store: {
        getSnapshot: (): ModelDirectoryStateLike => state,
        subscribe(listener: () => void): () => void {
          listeners.add(listener)
          return () => { listeners.delete(listener) }
        },
      },
      load: async (): Promise<ModelDirectoryStateLike> => state,
      select: async (selection: Selection): Promise<unknown> => {
        const at = submitted.length
        submitted.push(selection)
        // Hold on the "wire": the caller settles each submission explicitly.
        const outcome = await new Promise<unknown>(resolve => { resolvers[at] = resolve })
        if (at < (opts?.refuseFirst ?? 0)) {
          state = { ...state, status: 'error', error: 'session/invalid: refused' }
          notify()
          return { ok: false, error: { code: 'session/invalid', message: 'refused' } }
        }
        state = {
          ...state,
          current: {
            provider: selection.provider,
            model: selection.model,
            ...(selection.reasoningEffort === undefined ? {} : { reasoningEffort: selection.reasoningEffort }),
          },
        }
        notify()
        return undefined
      },
    }
    return {
      directory: directory as unknown as ModelDirectoryLike,
      submitted,
      /** Settle the Nth (0-based) in-flight submission. */
      settle(at: number, value: unknown = undefined): void { resolvers[at]?.(value) },
      update(next: ModelDirectoryStateLike): void { state = next; notify() },
      get current(): DirectoryCurrentLike | null { return state.current },
    }
  }

  /** Flush every microtask the fixture chain needs before the next step. */
  const tick = (): Promise<void> => new Promise(resolve => { setTimeout(resolve, 0) })

  /** Per-call configured gates, in call order: the memory chain's pacing points. */
  function configuredGates(): {
    configuredEffort: (provider: string, model: string) => Promise<string | undefined>
    release(at: number, level: string | undefined): void
    calls(): number
  } {
    const gates: Array<(level: string | undefined) => void> = []
    let calls = 0
    return {
      configuredEffort: () => new Promise<string | undefined>(resolve => { gates[calls] = resolve; calls += 1 }),
      release: (at, level) => { gates[at]?.(level) },
      calls: () => calls,
    }
  }

  it('does not speak over an in-flight pick: the watcher refunds and waits for its settle', async () => {
    // The reported sequence: the session's durable projection has not landed
    // yet when the user picks (current null), the pick parks in the chain
    // wait, the projection lands mid-flight (a level-less current with an
    // unspent restore key), and the watcher's chain resolves while the pick is
    // still on the wire. Speaking there won the host's generation race,
    // discarded the user's response with a fake-ok and left the session on the
    // old model — the pick looked accepted and did nothing.
    const fake = gatedDirectory(stateWith(null))
    const chain = configuredGates()
    const restore = wireEffortMemory(fake.directory, { configuredEffort: chain.configuredEffort })
    try {
      // The user picks gpt-5.6; the chain parks on configured gate 0.
      const pick = fake.directory.select({ provider: 'openai', model: 'gpt-5.6' })
      await tick()
      expect(chain.calls()).toBe(1)

      // The projection lands mid-flight: kimi-k3, level-less, key unspent.
      fake.update(stateWith({ provider: 'moonshot', model: 'kimi-k3' }, { restore: true }))
      await tick()
      expect(chain.calls()).toBe(2)

      // The user's chain answers; the pick reaches the wire and hangs there.
      chain.release(0, 'medium')
      await tick()
      expect(fake.submitted).toEqual([{ provider: 'openai', model: 'gpt-5.6', reasoningEffort: 'medium' }])

      // The watcher's chain answers while the pick is unsettled: it must
      // REFUND, not submit — a kimi-k3 re-select here would be the last
      // submitter and silently discard the user's pick.
      chain.release(1, 'max')
      await tick()
      expect(fake.submitted).toEqual([{ provider: 'openai', model: 'gpt-5.6', reasoningEffort: 'medium' }])

      // The pick settles accepted; the re-kick finds a level-full current and
      // stays quiet (no further configured read). The session rests on the
      // user's model.
      fake.settle(0)
      await pick
      await tick()
      expect(fake.submitted).toEqual([{ provider: 'openai', model: 'gpt-5.6', reasoningEffort: 'medium' }])
      expect(chain.calls()).toBe(2)
      expect(fake.current).toEqual({ provider: 'openai', model: 'gpt-5.6', reasoningEffort: 'medium' })
    } finally {
      restore()
    }
  })

  it('does not speak over an in-flight EXPLICIT pick either (watcher started after it)', async () => {
    // Same race, explicit-level shape: the pick skips the chain and is on the
    // wire immediately, and the watcher starts afterwards — the older
    // utterance fence cannot see it, so only the settle marker can.
    const fake = gatedDirectory(stateWith(null))
    const chain = configuredGates()
    const restore = wireEffortMemory(fake.directory, { configuredEffort: chain.configuredEffort })
    try {
      const pick = fake.directory.select({ provider: 'openai', model: 'gpt-5.6', reasoningEffort: 'high' })
      await tick()
      expect(fake.submitted).toEqual([{ provider: 'openai', model: 'gpt-5.6', reasoningEffort: 'high' }])

      // The projection lands while the pick is in flight; the watcher parks.
      fake.update(stateWith({ provider: 'moonshot', model: 'kimi-k3' }, { restore: true }))
      await tick()
      expect(chain.calls()).toBe(1)

      // The watcher's chain answers: the pick is unsettled → refund, silence.
      chain.release(0, 'max')
      await tick()
      expect(fake.submitted).toHaveLength(1)

      // The pick settles; the re-kick finds a level-full current, stays quiet.
      fake.settle(0)
      await pick
      await tick()
      expect(fake.submitted).toHaveLength(1)
      expect(fake.current).toEqual({ provider: 'openai', model: 'gpt-5.6', reasoningEffort: 'high' })
    } finally {
      restore()
    }
  })

  it('re-kicks after the in-flight pick settles refused and restores the level', async () => {
    // The refund must not dead-end: a refused pick (a session still
    // initializing) re-kicks the watcher, whose attempt was refunded, so the
    // level still lands on the model the session actually rests on.
    const fake = gatedDirectory(stateWith(null), { refuseFirst: 1 })
    const chain = configuredGates()
    const restore = wireEffortMemory(fake.directory, { configuredEffort: chain.configuredEffort })
    try {
      // The user's explicit pick is on the wire and will be refused.
      const pick = fake.directory.select({ provider: 'openai', model: 'gpt-5.6', reasoningEffort: 'high' })
      await tick()

      // The projection lands mid-flight; the watcher starts and parks.
      fake.update(stateWith({ provider: 'moonshot', model: 'kimi-k3' }, { restore: true }))
      await tick()
      expect(chain.calls()).toBe(1)

      // The watcher's chain answers: the pick is unsettled → refund, silence.
      chain.release(0, 'max')
      await tick()
      expect(fake.submitted).toHaveLength(1)

      // The pick settles REFUSED: the error update re-kicks the watcher, whose
      // refunded attempt now runs against the settled projection (the current
      // is the level-less kimi-k3) and restores the level.
      fake.settle(0)
      await pick
      await tick()
      expect(chain.calls()).toBe(2)
      chain.release(1, undefined)
      await tick()
      // No memory and no configured pick → the vendor default answers.
      expect(fake.submitted[1]).toEqual({ provider: 'moonshot', model: 'kimi-k3', reasoningEffort: 'max' })
      fake.settle(1)
      await tick()
      expect(fake.current).toEqual({ provider: 'moonshot', model: 'kimi-k3', reasoningEffort: 'max' })
    } finally {
      restore()
    }
  })
})

describe('wireEffortMemory: session sightings', () => {
  it('keeps a pick made in the session across switches, over the configured layer', async () => {
    const fake = fakeDirectory(stateWith({ provider: 'moonshot', model: 'kimi-k3' }))
    const restore = wireEffortMemory(fake.directory, { configuredEffort: async () => 'high' })
    try {
      // The user picks low in this session: recorded as a session sighting.
      await fake.directory.select({ provider: 'moonshot', model: 'kimi-k3', reasoningEffort: 'low' })
      expect(fake.submitted[0]).toMatchObject({ reasoningEffort: 'low' })
      // Switching away and back must not lose the pick to the configured
      // layer — the sighting outranks it for the rest of the session.
      await fake.directory.select({ provider: 'openai', model: 'gpt-5.6' })
      await fake.directory.select({ provider: 'moonshot', model: 'kimi-k3' })
      expect(fake.submitted[2]).toEqual({ provider: 'moonshot', model: 'kimi-k3', reasoningEffort: 'low' })
    } finally {
      restore()
    }
  })

  it('an explicit follow-the-default pick clears the session sighting', async () => {
    const fake = fakeDirectory(stateWith({ provider: 'moonshot', model: 'kimi-k3' }))
    const restore = wireEffortMemory(fake.directory, { configuredEffort: async () => 'high' })
    try {
      await fake.directory.select({ provider: 'moonshot', model: 'kimi-k3', reasoningEffort: 'low' })
      // Same model, no level: an explicit provider-default pick. The
      // session's sighting dies with it, so this session keeps honoring it.
      await fake.directory.select({ provider: 'moonshot', model: 'kimi-k3' })
      expect(fake.submitted[1]).toEqual({ provider: 'moonshot', model: 'kimi-k3' })
      // Away and back: the configured layer answers again (high).
      await fake.directory.select({ provider: 'openai', model: 'gpt-5.6' })
      await fake.directory.select({ provider: 'moonshot', model: 'kimi-k3' })
      expect(fake.submitted[3]).toEqual({ provider: 'moonshot', model: 'kimi-k3', reasoningEffort: 'high' })
    } finally {
      restore()
    }
  })
})
