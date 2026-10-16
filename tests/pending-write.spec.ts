/**
 * Unit tests for the write assembly the ROW editor and the injector's
 * provider-wide adapt SHARE.
 *
 * Both paths apply the same suggestion and must therefore write the same
 * bytes: the mapping lives in these pure functions instead of being repeated
 * per caller, and it is pinned here rather than through either UI, because a
 * divergence between the two is exactly what would make "adapt every model"
 * write something the row's own Auto-adapt would not have.
 */

// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import { ladderIntent, pendingWriteOf } from '../src/client/EffortEditor.js'

describe('ladderIntent', () => {
  it('writes the built ladder when the switch is on', () => {
    expect(ladderIntent(true, { high: 'high' }, undefined)).toEqual({ high: 'high' })
    expect(ladderIntent(true, { off: null }, { off: null })).toEqual({ off: null })
  })

  it('reports the explicit off when the switch is off, whatever was built', () => {
    expect(ladderIntent(false, { high: 'high' }, undefined)).toBe(false)
    expect(ladderIntent(false, undefined, { high: 'high' })).toBe(false)
  })

  it("keeps 'keep' for an untouched row that never declared anything", () => {
    // NOT `undefined`: that is the durable unset marker, and stamping it onto a
    // never-declared model would silence the host's own auto-fill.
    expect(ladderIntent(true, undefined, undefined)).toBe('keep')
  })

  it('reports an unset when a declared row emptied its draft', () => {
    expect(ladderIntent(true, undefined, { high: 'high' })).toBeUndefined()
  })
})

describe('pendingWriteOf', () => {
  it('writes the compat block the applied suggestion carries', () => {
    // Nothing is restated here: the write carries the suggestion's own bytes,
    // and the ledger merges them OVER the row's stored block, so a key this
    // write never names is left exactly as the document held it.
    expect(pendingWriteOf({
      efforts: { high: 'high' },
      appliedCompat: { thinkingFormat: 'qwen', supportsReasoningEffort: true },
      routeApi: 'openai-completions',
    })).toEqual({
      efforts: { high: 'high' },
      compat: { thinkingFormat: 'qwen', supportsReasoningEffort: true },
    })
  })

  it('attaches nothing on a protocol that owns no compat field', () => {
    // openai-responses owned exactly one key, and its control is retired: a
    // write there touches no compat key at all.
    expect(pendingWriteOf({ efforts: 'keep', routeApi: 'openai-responses' })).toEqual({ efforts: 'keep' })
  })

  it('adds the openai-completions budget default an untouched endpoint needs', () => {
    const write = pendingWriteOf({
      efforts: false,
      appliedCompat: { thinkingFormat: 'openai' },
      routeApi: 'openai-completions',
      initialCompat: { supportsThinkingTokenBudget: true },
    })
    expect(write.compat).toEqual({
      thinkingFormat: 'openai',
      thinkingTokenBudgetField: 'thinking_token_budget',
    })
  })

  it('leaves the budget field alone on another protocol', () => {
    const write = pendingWriteOf({
      efforts: false,
      appliedCompat: { thinkingFormat: 'openai' },
      routeApi: 'openai',
      initialCompat: { supportsThinkingTokenBudget: true },
    })
    expect(write.compat).toEqual({ thinkingFormat: 'openai' })
  })

  it('does not invent the default when the applied suggestion already names a field', () => {
    const write = pendingWriteOf({
      efforts: false,
      appliedCompat: { thinkingTokenBudgetField: 'thinking_budget' },
      routeApi: 'openai-completions',
      initialCompat: { supportsThinkingTokenBudget: true },
    })
    expect(write.compat).toEqual({ thinkingTokenBudgetField: 'thinking_budget' })
  })

  it('does not invent the default for an endpoint that never claimed the capability', () => {
    // No capability claim means no budget default -- and no clear list either:
    // the editor owns no compat field any more, so a draft that names none is
    // not a decision to unset anything.
    expect(pendingWriteOf({ efforts: false, routeApi: 'openai-completions' })).toEqual({ efforts: false })
  })

  it('carries only the modality the caller resolved', () => {
    expect(pendingWriteOf({ efforts: false })).toEqual({ efforts: false })
    expect(pendingWriteOf({ efforts: false, input: ['text', 'image'] }))
      .toEqual({ efforts: false, input: ['text', 'image'] })
    // `null` is the durable UNSET and must survive as a value, not as absence.
    expect(pendingWriteOf({ efforts: false, input: null })).toEqual({ efforts: false, input: null })
  })

  it('carries only the default-effort pick the caller resolved', () => {
    expect(pendingWriteOf({ efforts: false })).toEqual({ efforts: false })
    expect(pendingWriteOf({ efforts: false, defaultEffort: null }))
      .toEqual({ efforts: false, defaultEffort: null })
    expect(pendingWriteOf({ efforts: false, defaultEffort: 'high' }))
      .toEqual({ efforts: false, defaultEffort: 'high' })
  })

  it('reports a bare payload for a route that owns no compat field', () => {
    // The whole payload, so the shape a caller spreads into the ledger cannot
    // drift: an unrelated route keeps the shape it always had.
    expect(pendingWriteOf({ efforts: 'keep', routeApi: 'anthropic-messages' })).toEqual({ efforts: 'keep' })
  })
})
