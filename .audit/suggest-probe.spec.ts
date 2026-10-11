import { describe, expect, it } from 'vitest'
import { suggestEfforts } from '../src/knowledge.js'

/**
 * Read-only probe: what the suggestion engine answers for the user's real model
 * inventory (settings.yaml.imported). Purpose: find out whether the missing
 * image toggle is "the engine declares text-only / nothing" or "the pass never
 * asked because the row already had a ladder".
 */
const ROUTES: Array<{ api: string; baseURL?: string; ids: string[] }> = [
  { api: 'anthropic-messages', baseURL: 'https://api.ofox.io/anthropic', ids: ['anthropic/claude-fable-5', 'anthropic/claude-opus-5.5', 'openai/gpt-5.6-sol', 'openai/gpt-6-astra'] },
  { api: 'openai-responses', baseURL: 'https://www.waibibabo.com/v1', ids: ['gpt-5.6-sol', 'gpt-5.6-terra', 'gpt-6-astra'] },
  { api: 'openai-responses', baseURL: 'https://api.senseaudio.cn/v1', ids: ['glm-5.3-flash', 'deepseek-v4.1-flash'] },
  { api: 'openai-responses', baseURL: 'https://direct.abinapi.com/v1', ids: ['grok-4.6', 'grok-4.7'] },
  { api: 'openai-completions', baseURL: 'https://tokenrhythm.studio/v1', ids: ['qwen3.8-max', 'glm-5.3', 'kimi-k3', 'glm-5.3-flash', 'deepseek-flash', 'glm-5.3-flashx', 'neohorse-1-9b'] },
  { api: 'openai-responses', baseURL: 'http://127.0.0.1:10100/v1', ids: ['F/kimi-k3', 'Q/qwen3.8', 'D/gpt-5.6-luna', 'D/gpt-6-luna'] },
  { api: 'openai-responses', baseURL: 'https://ps.air-outer.com/v1', ids: ['gpt-6-astra', 'deepseek-v4-flash'] },
  { api: 'openai-completions', baseURL: 'https://token-plan-cn.xiaomimimo.com/v1', ids: ['mimo-v2.6-flash', 'mimo-v2.6-pro', 'mimo-v2.5-pro'] },
  { api: 'anthropic-messages', baseURL: 'https://tierflow.cn', ids: ['DeepSeek-V4.1-Flash', 'GLM-5.3', 'GLM-5.3-Flash', 'GLM-5.3-FlashX', 'Qwen3.8-Flash'] },
]

describe('suggestion probe', () => {
  it('prints what the engine answers', () => {
    const lines: string[] = []
    for (const route of ROUTES) {
      for (const id of route.ids) {
        const facts = { api: route.api, ...(route.baseURL === undefined ? {} : { baseURL: route.baseURL }) }
        const found = suggestEfforts(id, facts)
        lines.push(JSON.stringify({
          id,
          api: route.api,
          efforts: found.efforts === undefined ? 'none' : found.efforts === false ? 'false' : Object.keys(found.efforts).join('/'),
          input: found.input === undefined ? 'none' : found.input.join('+'),
          inputSource: found.inputSource ?? '',
          source: found.source,
          confidence: found.confidence,
        }))
      }
    }
    console.log(lines.join('\n'))
    expect(lines.length).toBeGreaterThan(0)
  })
})
