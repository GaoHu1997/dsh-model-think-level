import { describe, expect, it } from 'vitest'
import {
  REST_COOLDOWN_CAP_MS,
  classifyFailure,
  cooldownFor,
  createRestStore,
  isHonoured,
  modelWireFamily,
  modelWireHint,
  parseRetryAfter,
  planKeys,
  protocolFit,
  readRoutePlans,
  recordRoutePlan,
  resetRoutePlans,
  restKeyOf,
  wireOf,
  type KeyCandidate,
} from '../src/key-route-core.js'

const openaiKey: KeyCandidate = { ref: 'OPENAI', value: 'sk-openai' }
const chatKey: KeyCandidate = { ref: 'CHAT', value: 'sk-chat', protocol: 'openai-completions' }
const responsesKey: KeyCandidate = { ref: 'RESP', value: 'sk-resp', protocol: 'openai-responses' }
const anthropicKey: KeyCandidate = {
  ref: 'ANTHROPIC',
  value: 'sk-anthropic',
  protocol: 'anthropic-messages',
  endpoint: 'https://api.example.com/anthropic',
}
const barePin: KeyCandidate = { ref: 'BARE', value: 'sk-bare', protocol: 'anthropic-messages' }
const geminiKey: KeyCandidate = {
  ref: 'GOOGLE',
  value: 'AIza-test',
  protocol: 'google-generative-ai',
  endpoint: 'https://gemini.example.com/v1beta',
}
const bareGeminiPin: KeyCandidate = { ref: 'BAREGOOG', value: 'AIza-bare', protocol: 'google-generative-ai' }
/** An unpinned key whose provider addressed the Anthropic and Gemini families. */
const autoKey: KeyCandidate = {
  ref: 'AUTO',
  value: 'sk-auto',
  endpoints: {
    anthropic: 'https://relay.example.com/anthropic',
    gemini: 'https://relay.example.com/v1beta',
  },
}

describe('modelWireFamily', () => {
  it('reads the vendor from a prefixed or bare id', () => {
    expect(modelWireFamily('anthropic/claude-opus-5.5')).toBe('anthropic')
    expect(modelWireFamily('claude-sonnet-5.5')).toBe('anthropic')
    expect(modelWireFamily('gpt-6.1-sol')).toBe('openai')
    expect(modelWireFamily('o3-mini')).toBe('openai')
    expect(modelWireFamily('openai/codex-1')).toBe('openai')
  })

  it('reads the Gemini family from gemini and gemma ids', () => {
    expect(modelWireFamily('gemini-2.5-flash')).toBe('gemini')
    expect(modelWireFamily('gemini-3-pro-preview')).toBe('gemini')
    expect(modelWireFamily('google/gemini-2.5-pro')).toBe('gemini')
    expect(modelWireFamily('gemma-4-31b-it')).toBe('gemini')
    // A look-alike token inside another word is not a family claim.
    expect(modelWireFamily('xgemini-pro')).toBeUndefined()
  })

  it('leaves a relay id that names no vendor unknown', () => {
    expect(modelWireFamily('tierflow_pro')).toBeUndefined()
    expect(modelWireFamily('deepseek-v4.1')).toBeUndefined()
    expect(modelWireFamily(undefined)).toBeUndefined()
  })

  it('hints a concrete wire for each single-wire family', () => {
    expect(modelWireHint('claude-sonnet-5.5')).toBe('anthropic-messages')
    expect(modelWireHint('gemini-2.5-flash')).toBe('google-generative-ai')
    // The OpenAI family has two wires, so no id can single one out.
    expect(modelWireHint('gpt-6.1-sol')).toBeUndefined()
  })
})

describe('wireOf and isHonoured', () => {
  it('keeps the route wire for an unpinned key', () => {
    expect(wireOf(openaiKey, 'openai-completions')).toBe('openai-completions')
    expect(isHonoured(openaiKey, 'openai-completions')).toBe(true)
  })

  it('honours a same-family pin on the route address', () => {
    expect(wireOf(responsesKey, 'openai-completions')).toBe('openai-responses')
    expect(isHonoured(responsesKey, 'openai-completions')).toBe(true)
  })

  it('honours a cross-family pin only when it carries its own endpoint', () => {
    expect(wireOf(anthropicKey, 'openai-completions')).toBe('anthropic-messages')
    expect(isHonoured(anthropicKey, 'openai-completions')).toBe(true)
    // The route base URL owns the route family's paths: an OpenAI body sent
    // there is rejected before the model runs, so the pin cannot be honoured.
    expect(wireOf(barePin, 'openai-completions')).toBe('openai-completions')
    expect(isHonoured(barePin, 'openai-completions')).toBe(false)
  })

  it('honours a gemini pin only with the gemini family address', () => {
    expect(wireOf(geminiKey, 'openai-completions')).toBe('google-generative-ai')
    expect(isHonoured(geminiKey, 'openai-completions')).toBe(true)
    expect(wireOf(bareGeminiPin, 'openai-completions')).toBe('openai-completions')
    expect(isHonoured(bareGeminiPin, 'openai-completions')).toBe(false)
  })
})

describe('automatic wire resolution (no pin)', () => {
  it('sends a claude model through the anthropic address and a gemini model through the gemini one', () => {
    expect(wireOf(autoKey, 'openai-completions', 'claude-sonnet-5.5')).toBe('anthropic-messages')
    expect(wireOf(autoKey, 'openai-completions', 'google/gemini-2.5-pro')).toBe('google-generative-ai')
  })

  it('keeps the route wire for models of the route family and ids that name none', () => {
    expect(wireOf(autoKey, 'openai-completions', 'gpt-6.1-sol')).toBe('openai-completions')
    expect(wireOf(autoKey, 'openai-completions', 'tierflow_pro')).toBe('openai-completions')
    expect(wireOf(autoKey, 'openai-completions', undefined)).toBe('openai-completions')
  })

  it('falls back to the route wire when the model family has no address', () => {
    expect(wireOf(openaiKey, 'openai-completions', 'claude-sonnet-5.5')).toBe('openai-completions')
  })

  it('resolves the openai family to Chat Completions when the route speaks another family', () => {
    const onAnthropicRoute: KeyCandidate = { ...autoKey, endpoints: { openai: 'https://relay.example.com/v1' } }
    expect(wireOf(onAnthropicRoute, 'anthropic-messages', 'gpt-6.1-sol')).toBe('openai-completions')
  })

  it('does not pick a wire that just failed this model, but never second-guesses a pin', () => {
    expect(wireOf(autoKey, 'openai-completions', 'claude-sonnet-5.5', 'anthropic-messages')).toBe('openai-completions')
    expect(wireOf(anthropicKey, 'openai-completions', 'claude-sonnet-5.5', 'anthropic-messages')).toBe('anthropic-messages')
  })

  it('ranks the automatic resolution as native for the model it names', () => {
    expect(protocolFit(autoKey, 'openai-completions', 'claude-sonnet-5.5')).toBe(0)
    // With the failed wire avoided, the resolution falls back to the route wire,
    // which costs a translated round trip for a claude model.
    expect(protocolFit(autoKey, 'openai-completions', 'claude-sonnet-5.5', 'anthropic-messages')).toBe(2)
  })

  it('is honoured whatever it resolves to: the resolution always dispatches', () => {
    expect(isHonoured(autoKey, 'openai-completions')).toBe(true)
  })

  it('plans an automatic key ahead for the model family it can serve natively', () => {
    const plan = planKeys([chatKey, autoKey], { api: 'openai-completions', model: 'claude-sonnet-5.5' })
    expect(plan.ordered.map(key => key.ref)).toEqual(['AUTO', 'CHAT'])
    expect(plan.wire).toBe('anthropic-messages')
  })

  it('falls back to the route wire in the plan when the family wire was refused', () => {
    const plan = planKeys([autoKey], {
      api: 'openai-completions',
      model: 'claude-sonnet-5.5',
      avoidWire: 'anthropic-messages',
    })
    expect(plan.ordered.map(key => key.ref)).toEqual(['AUTO'])
    expect(plan.wire).toBe('openai-completions')
  })
})

describe('protocolFit', () => {
  it('ranks the route wire as native and the model wire as native', () => {
    expect(protocolFit(chatKey, 'openai-completions', 'gpt-6.1-sol')).toBe(0)
    expect(protocolFit(anthropicKey, 'openai-completions', 'claude-sonnet-5.5')).toBe(0)
  })

  it('ranks a gemini pin as native for a gemini model, and as another family otherwise', () => {
    expect(protocolFit(geminiKey, 'openai-completions', 'gemini-2.5-flash')).toBe(0)
    expect(protocolFit(geminiKey, 'openai-completions', 'gpt-6.1-sol')).toBe(2)
  })

  it('ranks a same-family protocol switch as one translation', () => {
    expect(protocolFit(responsesKey, 'openai-completions', 'gpt-6.1-sol')).toBe(1)
  })

  it('ranks another family last', () => {
    expect(protocolFit(anthropicKey, 'openai-completions', 'gpt-6.1-sol')).toBe(2)
    expect(protocolFit(chatKey, 'openai-completions', 'claude-sonnet-5.5')).toBe(2)
  })
})

describe('planKeys', () => {
  it('keeps the resolver order when every key is equally fitted', () => {
    const plan = planKeys([openaiKey, chatKey], { api: 'openai-completions', model: 'tierflow_pro' })
    expect(plan.ordered.map(key => key.ref)).toEqual(['OPENAI', 'CHAT'])
    expect(plan.wire).toBe('openai-completions')
    expect(plan.pool.map(key => key.ref)).toEqual(['OPENAI', 'CHAT'])
    expect(plan.aside).toEqual([])
  })

  it('tries the key on the model wire first and keeps the other wire for later', () => {
    const plan = planKeys([openaiKey, anthropicKey], { api: 'openai-completions', model: 'claude-sonnet-5.5' })
    expect(plan.ordered.map(key => key.ref)).toEqual(['ANTHROPIC', 'OPENAI'])
    expect(plan.pool.map(key => key.ref)).toEqual(['ANTHROPIC'])
    expect(plan.aside.map(key => key.ref)).toEqual(['OPENAI'])
    expect(plan.wire).toBe('anthropic-messages')
    expect(plan.entries[0]?.fit).toBe(0)
    expect(plan.entries[1]?.fit).toBe(2)
  })

  it('drains the starting wire before a better-fitted other wire', () => {
    // Both OpenAI-format keys share the starting wire; the Anthropic key would
    // need a translated round trip, so it is appended after them.
    const plan = planKeys([openaiKey, chatKey, anthropicKey], {
      api: 'openai-completions',
      model: 'tierflow_pro',
    })
    expect(plan.ordered.map(key => key.ref)).toEqual(['OPENAI', 'CHAT', 'ANTHROPIC'])
    expect(plan.pool.map(key => key.ref)).toEqual(['OPENAI', 'CHAT'])
    expect(plan.aside.map(key => key.ref)).toEqual(['ANTHROPIC'])
  })

  it('puts a same-family wire switch behind the pool too', () => {
    // Responses differs from the route's wire: its body shape differs, so it is
    // not drained as "the same attempt"; it follows the pool.
    const plan = planKeys([openaiKey, chatKey, responsesKey], {
      api: 'openai-completions',
      model: 'gpt-6.1-sol',
    })
    expect(plan.pool.map(key => key.ref)).toEqual(['OPENAI', 'CHAT'])
    expect(plan.aside.map(key => key.ref)).toEqual(['RESP'])
    expect(plan.ordered.map(key => key.ref)).toEqual(['OPENAI', 'CHAT', 'RESP'])
  })

  it('lets the wire that served the model beat the model fit', () => {
    // The learned fact overrides the heuristic: an id that names no family must
    // not undo what the previous request established.
    const plan = planKeys([chatKey, anthropicKey], {
      api: 'openai-completions',
      model: 'tierflow_pro',
      preferredWire: 'anthropic-messages',
    })
    expect(plan.ordered.map(key => key.ref)).toEqual(['ANTHROPIC', 'CHAT'])
    expect(plan.wire).toBe('anthropic-messages')
  })

  it('demotes a pin it cannot honour below a key it can', () => {
    const plan = planKeys([barePin, chatKey], { api: 'openai-completions', model: 'tierflow_pro' })
    expect(plan.ordered.map(key => key.ref)).toEqual(['CHAT', 'BARE'])
    expect(plan.entries[1]?.honoured).toBe(false)
    expect(plan.entries[1]?.wire).toBe('openai-completions')
  })

  it('keeps a resting key in the plan, behind every key that is ready', () => {
    const plan = planKeys([chatKey, responsesKey], {
      api: 'openai-completions',
      model: 'tierflow_pro',
      isResting: candidate => candidate.ref === 'CHAT',
    })
    expect(plan.ordered.map(key => key.ref)).toEqual(['RESP', 'CHAT'])
    expect(plan.entries[1]?.resting).toBe(true)
    // Resting reorders, never drops: the last key is still attempted.
    expect(plan.ordered).toHaveLength(2)
  })

  it('returns an idle plan for an empty candidate list', () => {
    const plan = planKeys([], { api: 'openai-completions' })
    expect(plan.ordered).toEqual([])
    expect(plan.wire).toBeUndefined()
  })
})

describe('classifyFailure', () => {
  it('blames the key for the statuses that describe the credential or the account', () => {
    expect(classifyFailure(401)).toBe('auth')
    expect(classifyFailure(403)).toBe('auth')
    expect(classifyFailure(402)).toBe('quota')
    expect(classifyFailure(408)).toBe('timeout')
    expect(classifyFailure(429, '{}')).toBe('rate')
    expect(classifyFailure(500)).toBe('server')
    expect(classifyFailure(503)).toBe('server')
  })

  it('reads a quota body as an exhausted account, not a burst', () => {
    expect(classifyFailure(429, '{"error":{"message":"insufficient_quota"}}')).toBe('quota')
    expect(classifyFailure(429, '余额不足')).toBe('quota')
  })

  it('says nothing for a request-shape failure every key would repeat', () => {
    expect(classifyFailure(400, 'bad body')).toBeUndefined()
    expect(classifyFailure(404)).toBeUndefined()
    expect(classifyFailure(422)).toBeUndefined()
  })

  it('treats a stream that failed without a status as this key refusing', () => {
    expect(classifyFailure(undefined, 'connection reset')).toBe('refused')
  })
})

describe('cooldownFor', () => {
  it('starts each kind at its own baseline', () => {
    expect(cooldownFor('auth')).toBe(300_000)
    expect(cooldownFor('rate')).toBe(60_000)
    expect(cooldownFor('server')).toBe(30_000)
  })

  it('honours a longer provider Retry-After as the floor', () => {
    expect(cooldownFor('rate', 1, 120_000)).toBe(120_000)
    // A shorter one cannot undercut the kind's baseline.
    expect(cooldownFor('rate', 1, 5_000)).toBe(60_000)
  })

  it('doubles on repeated failures and caps the wait', () => {
    expect(cooldownFor('server', 2)).toBe(60_000)
    expect(cooldownFor('server', 3)).toBe(120_000)
    expect(cooldownFor('auth', 12)).toBe(REST_COOLDOWN_CAP_MS)
  })
})

describe('parseRetryAfter', () => {
  it('reads delay-seconds', () => {
    expect(parseRetryAfter('30', 0)).toBe(30_000)
    expect(parseRetryAfter(' 1.5 ', 0)).toBe(1_500)
  })

  it('reads an HTTP date relative to now', () => {
    const now = Date.parse('2026-01-01T00:00:00Z')
    expect(parseRetryAfter('Thu, 01 Jan 2026 00:01:00 GMT', now)).toBe(60_000)
    // A date in the past means "now", not a negative wait.
    expect(parseRetryAfter('Thu, 01 Jan 2025 00:00:00 GMT', now)).toBe(0)
  })

  it('says nothing for a missing or unreadable value', () => {
    expect(parseRetryAfter(undefined, 0)).toBeUndefined()
    expect(parseRetryAfter('', 0)).toBeUndefined()
    expect(parseRetryAfter('soon', 0)).toBeUndefined()
  })
})

describe('createRestStore', () => {
  it('benches a key until its period ends, then lets it back in', () => {
    const store = createRestStore()
    const key = restKeyOf('beta', 'A')
    expect(store.isResting(key, 0)).toBe(false)
    store.note(key, 'auth', { now: 0 })
    expect(store.isResting(key, 1_000)).toBe(true)
    expect(store.isResting(key, 300_001)).toBe(false)
  })

  it('escalates the period while failures keep coming and forgets on success', () => {
    const store = createRestStore()
    const key = restKeyOf('beta', 'A')
    const first = store.note(key, 'rate', { now: 0 })
    // A second failure inside the same window is a repeat offender.
    const second = store.note(key, 'rate', { now: first.until - 1 })
    expect(second.failures).toBe(2)
    expect(second.until).toBeGreaterThan(first.until * 2 - 1)
    store.clear(key)
    expect(store.stateOf(key, second.until - 1)).toBeUndefined()
    expect(store.note(key, 'rate', { now: second.until }).failures).toBe(1)
  })

  it('takes the provider Retry-After into the period', () => {
    const store = createRestStore()
    const key = restKeyOf('beta', 'A')
    const state = store.note(key, 'rate', { now: 0, retryAfterMs: 90_000 })
    expect(state.until).toBe(90_000)
  })

  it('stays bounded when a host churns through keys', () => {
    const store = createRestStore(4)
    for (let index = 0; index < 40; index += 1) store.note(restKeyOf('beta', `K${index}`), 'server', { now: 0 })
    expect(store.size).toBeLessThanOrEqual(4)
  })

  it('forgets everything on reset', () => {
    const store = createRestStore()
    store.note(restKeyOf('beta', 'A'), 'auth', { now: 0 })
    store.reset()
    expect(store.size).toBe(0)
  })
})

describe('route plan trace', () => {
  it('records what a plan decided without recording the secret', () => {
    resetRoutePlans()
    const plan = planKeys([chatKey, anthropicKey], { api: 'openai-completions', model: 'claude-sonnet-5.5' })
    recordRoutePlan('beta', plan, { model: 'claude-sonnet-5.5', now: 1_000 })
    const [trace] = readRoutePlans()
    expect(trace?.route).toBe('beta')
    expect(trace?.wire).toBe('anthropic-messages')
    expect(trace?.keys.map(entry => entry.ref)).toEqual(['ANTHROPIC', 'CHAT'])
    expect(JSON.stringify(trace)).not.toContain('sk-')
    resetRoutePlans()
  })

  it('keeps only the most recent plans, newest last', () => {
    resetRoutePlans()
    const plan = planKeys([chatKey], { api: 'openai-completions' })
    for (let index = 0; index < 20; index += 1) recordRoutePlan(`route-${index}`, plan)
    const traces = readRoutePlans(2)
    expect(traces.map(trace => trace.route)).toEqual(['route-18', 'route-19'])
    resetRoutePlans()
  })
})
