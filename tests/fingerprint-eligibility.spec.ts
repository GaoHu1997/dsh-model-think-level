import { describe, expect, it } from 'vitest'

import {
  bareModelId,
  eligibleModels,
  familyLabelOf,
  isEligibleModel,
} from '../src/fingerprint/eligibility.js'

describe('bareModelId', () => {
  it('strips a vendor prefix', () => {
    expect(bareModelId('anthropic/claude-sonnet-5')).toBe('claude-sonnet-5')
    expect(bareModelId('openai/gpt-5.5')).toBe('gpt-5.5')
    expect(bareModelId('a/b/claude-opus-5')).toBe('claude-opus-5')
  })

  it('leaves bare ids alone and trims surrounding space', () => {
    expect(bareModelId('gpt-5.5')).toBe('gpt-5.5')
    expect(bareModelId('  claude-opus-5  ')).toBe('claude-opus-5')
    expect(bareModelId('')).toBe('')
    expect(bareModelId(undefined as unknown as string)).toBe('')
  })
})

describe('isEligibleModel', () => {
  it.each([
    'gpt-5.5',
    'gpt-5.6-sol',
    'gpt-6-luna',
    'chatgpt-4o-latest',
    'o1',
    'o3',
    'o4-mini',
    'claude-haiku-4-5-20251001',
    'claude-sonnet-5-5',
    'claude-opus-5',
    'anthropic/claude-opus-5',
    'GPT-5.5',
    'Claude-Sonnet-5',
  ])('accepts %s', (modelId) => {
    expect(isEligibleModel(modelId)).toBe(true)
  })

  it.each([
    'gemini-2.5-pro',
    'deepseek-v4',
    'qwen3-max',
    'grok-4',
    'llama-4',
    'mistral-large',
    'o1x',
    'o2',
    'gpto',
    'claude',            // 无连字符，不是系列前缀
    'anthropic-claude-5',// 连字符前缀不算
    'my-gpt-helper',
    '',
    '   ',
  ])('rejects %s', (modelId) => {
    expect(isEligibleModel(modelId)).toBe(false)
  })
})

describe('eligibleModels', () => {
  it('keeps order and drops the rest', () => {
    expect(eligibleModels(['gemini-2.5', 'gpt-5.5', 'qwen3', 'claude-opus-5', 'grok-4']))
      .toEqual(['gpt-5.5', 'claude-opus-5'])
  })

  it('returns nothing when a provider has no supported model', () => {
    expect(eligibleModels(['gemini-2.5', 'qwen3-max'])).toEqual([])
    expect(eligibleModels([])).toEqual([])
  })
})

describe('familyLabelOf', () => {
  it('maps ids to the two bank families', () => {
    expect(familyLabelOf('claude-opus-5')).toBe('Claude')
    expect(familyLabelOf('anthropic/claude-haiku-5-5')).toBe('Claude')
    expect(familyLabelOf('gpt-5.5')).toBe('GPT')
    expect(familyLabelOf('o3-mini')).toBe('GPT')
    expect(familyLabelOf('chatgpt-4o')).toBe('GPT')
  })
})
