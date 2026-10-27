import { describe, expect, it, vi } from 'vitest'
import { createConfiguredInputs, EMPTY_CONFIGURED_INPUTS } from '../src/client/configured-inputs.js'
import type { SettingsJoin } from '../src/client/types.js'
import { fakeApi, makeJoin } from './support/composer-fixture.js'

function deferred<T>(): { promise: Promise<T>; resolve(value: T): void } {
  let resolve!: (value: T) => void
  const promise = new Promise<T>(accept => { resolve = accept })
  return { promise, resolve }
}

const modelId = 'agentrouter/deepseek-v4-flash'
const inputsJoin = (input: string[]): SettingsJoin => makeJoin({ free: { models: [{ id: modelId, input }] } })

describe('saved model input declarations', () => {
  it('keeps explicit declarations per provider and leaves empty defaults inheritable', async () => {
    const api = fakeApi(async () => makeJoin({
      free: { models: [
        { id: modelId, input: ['text', 'image'] },
        { id: 'empty', input: [] },
        { id: 'undeclared' },
        { id: 'invalid', input: [null, 42] },
        null,
      ] },
      textOnly: { models: [{ id: modelId, input: ['text'] }] },
    }))
    const inputs = createConfiguredInputs(api)
    expect(inputs.getSnapshot()).toBe(EMPTY_CONFIGURED_INPUTS)
    await inputs.load()
    const snapshot = inputs.getSnapshot()
    expect(snapshot.get('free')?.get(modelId)).toEqual({ input: ['text', 'image'] })
    expect(snapshot.get('textOnly')?.get(modelId)).toEqual({ input: ['text'] })
    expect([...snapshot.get('free')!.keys()]).toEqual([modelId])
    await inputs.load()
    expect(inputs.getSnapshot()).toBe(snapshot)
    expect(api.describeSpy).toHaveBeenCalledTimes(1)
    expect(api.settings.mutate).not.toHaveBeenCalled()
  })

  it('carries the image-generation marker and a positive context window per model', async () => {
    const api = fakeApi(async () => makeJoin({
      free: { models: [
        { id: 'gen', inputImageGen: true },
        { id: 'windowed', contextWindow: 131072 },
        { id: 'both', inputImageGen: true, contextWindow: 1_048_576 },
        // A non-positive window is "nothing declared", as is a falsy marker.
        { id: 'zero', contextWindow: 0 },
        { id: 'negative', contextWindow: -5 },
        { id: 'false-marker', inputImageGen: false },
        { id: 'plain' },
      ] },
    }))
    const inputs = createConfiguredInputs(api)
    await inputs.load()
    const free = inputs.getSnapshot().get('free')!
    expect(free.get('gen')).toEqual({ imageGen: true })
    expect(free.get('windowed')).toEqual({ contextWindow: 131072 })
    expect(free.get('both')).toEqual({ imageGen: true, contextWindow: 1_048_576 })
    expect(free.has('zero')).toBe(false)
    expect(free.has('negative')).toBe(false)
    expect(free.has('false-marker')).toBe(false)
    expect(free.has('plain')).toBe(false)
  })

  it('refreshes subscribed menus and ignores reads that finish after an invalidation', async () => {
    const stale = deferred<SettingsJoin>()
    const fresh = deferred<SettingsJoin>()
    const describe = vi.fn<() => Promise<SettingsJoin>>()
      .mockResolvedValueOnce(inputsJoin(['text', 'image']))
      .mockImplementationOnce(() => stale.promise)
      .mockImplementationOnce(() => fresh.promise)
      .mockResolvedValueOnce(makeJoin({}))
    const inputs = createConfiguredInputs(fakeApi(describe))
    const notify = vi.fn()
    const unsubscribe = inputs.subscribe(notify)
    try {
      await inputs.load()
      const accepted = inputs.getSnapshot()
      inputs.invalidate()
      const oldRead = inputs.load()
      inputs.invalidate()
      const newRead = inputs.load()
      expect(inputs.getSnapshot()).toBe(accepted)
      fresh.resolve(inputsJoin(['text']))
      await newRead
      stale.resolve(inputsJoin(['text', 'image']))
      await oldRead
      expect(inputs.getSnapshot().get('free')?.get(modelId)).toEqual({ input: ['text'] })
      expect(notify).toHaveBeenCalledTimes(2)
      // Removing the declaration discards the old value too.
      inputs.invalidate()
      await inputs.load()
      expect(inputs.getSnapshot().size).toBe(0)
      unsubscribe()
      inputs.invalidate()
      expect(describe).toHaveBeenCalledTimes(4)
    } finally {
      unsubscribe()
    }
  })

  it('retries failed and missing reads on the next menu load', async () => {
    const describe = vi.fn<() => Promise<SettingsJoin>>()
      .mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValueOnce({ namespace: undefined, writable: false })
      .mockResolvedValueOnce(inputsJoin(['text', 'image']))
    const inputs = createConfiguredInputs(fakeApi(describe))
    await inputs.load()
    expect(inputs.getSnapshot()).toBe(EMPTY_CONFIGURED_INPUTS)
    await inputs.load()
    expect(inputs.getSnapshot()).toBe(EMPTY_CONFIGURED_INPUTS)
    await inputs.load()
    expect(inputs.getSnapshot().get('free')?.get(modelId)).toEqual({ input: ['text', 'image'] })
  })
})
