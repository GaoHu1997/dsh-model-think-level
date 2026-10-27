// @vitest-environment jsdom
import { createElement } from 'react'
import { createRoot } from 'react-dom/client'
import { flushSync } from 'react-dom'
import { describe, expect, it } from 'vitest'
import { ComposerSlider } from '../src/client/ComposerSlider.js'
import type { ModelFacts, ConfiguredInputs } from '../src/client/configured-inputs.js'
import type { ModelDirectoryLike } from '../src/client/types.js'

describe('ComposerSlider model rows', () => {
  it('puts context size before capability icons so icons share the right edge', () => {
    const snapshot = {
      current: null,
      groups: [{
        id: 'provider',
        name: 'Provider',
        models: [{
          id: 'vision-model',
          name: 'Vision model',
          reasoning: { efforts: [{ id: 'high', name: 'High' }] },
        }],
      }],
      status: 'ready',
      error: null,
    }
    const directory = {
      store: {
        getSnapshot: () => snapshot,
        subscribe: () => () => undefined,
      },
      load: async () => undefined,
      select: async () => ({ ok: true }),
    } as unknown as ModelDirectoryLike
    const facts: ModelFacts = { input: ['image'], contextWindow: 131_072 }
    const configuredSnapshot = new Map<string, ReadonlyMap<string, ModelFacts>>([
      ['provider', new Map([['vision-model', facts]])],
    ])
    const configuredInputs = {
      getSnapshot: () => configuredSnapshot,
      subscribe: () => () => undefined,
      load: async () => undefined,
      invalidate: () => undefined,
    } as ConfiguredInputs

    const container = document.createElement('div')
    document.body.appendChild(container)
    const root = createRoot(container)
    flushSync(() => root.render(createElement(ComposerSlider, {
      directory,
      configuredInputs,
      t: (key: string) => key,
    })))
    const row = container.querySelector('.bre-option')

    expect(row?.children).toHaveLength(3)
    expect(row?.children[0]?.className).toBe('bre-option-name')
    expect(row?.children[1]?.className).toBe('bre-option-cap')
    expect(row?.children[1]?.textContent).toBe('128K')
    expect(row?.children[2]?.className).toBe('bre-option-tags')
    flushSync(() => root.unmount())
    container.remove()
  })
})
