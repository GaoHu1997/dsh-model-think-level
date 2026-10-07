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
import { compatDraftOf, ladderIntent, pendingWriteOf } from '../src/client/EffortEditor.js'

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

describe('compatDraftOf', () => {
  it('is undefined for a row with no compat block', () => {
    expect(compatDraftOf(undefined)).toBeUndefined()
  })

  it('drops a key the editor does not show', () => {
    // A fresh editor's draft is the stored block restricted to the three fields
    // it renders, so a hand-tuned key is not the draft's to rewrite.
    expect(compatDraftOf({ thinkingFormat: 'qwen', supportsDeveloperRole: false })).toBeUndefined()
  })

  it('mirrors the three visible fields', () => {
    expect(compatDraftOf({
      thinkingTokenBudgetField: 'thinking_budget',
      vllmPriority: 3,
      supportsMaxOutputTokens: true,
    })).toEqual({
      thinkingTokenBudgetField: 'thinking_budget',
      vllmPriority: 3,
      supportsMaxOutputTokens: true,
    })
  })

  it('keeps a meaningful false and a zero priority', () => {
    expect(compatDraftOf({ supportsMaxOutputTokens: false })).toEqual({ supportsMaxOutputTokens: false })
    expect(compatDraftOf({ vllmPriority: 0 })).toEqual({ vllmPriority: 0 })
  })
})

describe('pendingWriteOf', () => {
  it('lets the manual field win while the applied suggestion still contributes', () => {
    expect(pendingWriteOf({
      efforts: { high: 'high' },
      appliedCompat: { thinkingFormat: 'qwen', supportsReasoningEffort: true },
      manualCompat: { supportsMaxOutputTokens: true },
      routeApi: 'openai-responses',
    })).toEqual({
      efforts: { high: 'high' },
      compat: { thinkingFormat: 'qwen', supportsReasoningEffort: true, supportsMaxOutputTokens: true },
      // 'openai-responses' owns supportsMaxOutputTokens, and it is SET.
      clearCompatKeys: [],
    })
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
    // The protocol owns both fields, and this write sets neither.
    expect(write.clearCompatKeys).toEqual(['supportsThinkingTokenBudget', 'vllmPriority'])
  })

  it('leaves the budget field alone on another protocol', () => {
    const write = pendingWriteOf({
      efforts: false,
      appliedCompat: { thinkingFormat: 'openai' },
      routeApi: 'openai',
      initialCompat: { supportsThinkingTokenBudget: true },
    })
    expect(write.compat).toEqual({ thinkingFormat: 'openai' })
    expect(write.clearCompatKeys).toEqual([])
  })

  it('does not invent the default when the draft already names a field', () => {
    const write = pendingWriteOf({
      efforts: false,
      manualCompat: { thinkingTokenBudgetField: 'thinking_budget' },
      routeApi: 'openai-completions',
      initialCompat: { supportsThinkingTokenBudget: true },
    })
    expect(write.compat).toEqual({ thinkingTokenBudgetField: 'thinking_budget' })
  })

  it('does not invent the default for an endpoint that never claimed the capability', () => {
    const write = pendingWriteOf({ efforts: false, routeApi: 'openai-completions' })
    expect(write.compat).toBeUndefined()
    // No capability claim means no budget default. The clear list is still
    // reported: on a protocol that owns fields, an empty draft is a decision to
    // unset them, and the provider-wide path must land on exactly the bytes the
    // row's own editor would have written.
    expect(write.clearCompatKeys).toEqual([
      'thinkingTokenBudgetField',
      'supportsThinkingTokenBudget',
      'vllmPriority',
    ])
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

  it('reports a bare array-free clear list for a route that owns no compat field', () => {
    // The whole payload, so the shape a caller spreads into the ledger cannot
    // drift: an unrelated route keeps the shape it always had.
    expect(pendingWriteOf({ efforts: 'keep', routeApi: 'anthropic-messages' })).toEqual({ efforts: 'keep' })
  })
})
