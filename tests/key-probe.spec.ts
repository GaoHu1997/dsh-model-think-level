import { describe, expect, it } from 'vitest'
import { probeKeyModels, probePlanFor, type ProbeKeyOptions } from '../src/key-probe.js'
import { anthropicRequestBaseUrl, geminiRequestBaseUrl, listingEntries, modelsFromListing, probeListingUrl } from '../src/listing.js'

const intent = (over: Partial<Parameters<typeof probePlanFor>[0]> = {}): Parameters<typeof probePlanFor>[0] => ({
  api: 'openai-completions',
  baseURL: 'https://relay.example.com/v1',
  ...over,
})

const endpoints = {
  openai: 'https://relay.example.com/v1',
  anthropic: 'https://relay.example.com/anthropic',
}

const triEndpoints = {
  ...endpoints,
  gemini: 'https://relay.example.com/v1beta',
}

describe('probePlanFor', () => {
  it('asks an unpinned key on the route wire', () => {
    const plan = probePlanFor(intent())
    expect(plan.targets).toEqual([
      { api: 'openai-completions', baseURL: 'https://relay.example.com/v1', family: 'openai' },
    ])
    expect(plan.skipped).toBeUndefined()
  })

  it('asks an unpinned key on both families when the provider has both addresses', () => {
    const plan = probePlanFor(intent({ endpoints }))
    expect(plan.targets.map(target => [target.api, target.baseURL])).toEqual([
      ['openai-completions', 'https://relay.example.com/v1'],
      ['anthropic-messages', 'https://relay.example.com/anthropic'],
    ])
  })

  it('keeps a same-family pin on the route address and asks that wire', () => {
    const plan = probePlanFor(intent({ pinned: 'openai-responses', endpoints }))
    expect(plan.targets).toEqual([
      { api: 'openai-responses', baseURL: 'https://relay.example.com/v1', family: 'openai' },
    ])
  })

  it('asks a cross-family pin on its own family address, not the route address', () => {
    const plan = probePlanFor(intent({ pinned: 'anthropic-messages', endpoints }))
    expect(plan.targets).toEqual([
      { api: 'anthropic-messages', baseURL: 'https://relay.example.com/anthropic', family: 'anthropic' },
    ])
  })

  it('asks a gemini pin on the gemini family address', () => {
    const plan = probePlanFor(intent({ pinned: 'google-generative-ai', endpoints: triEndpoints }))
    expect(plan.targets).toEqual([
      { api: 'google-generative-ai', baseURL: 'https://relay.example.com/v1beta', family: 'gemini' },
    ])
  })

  it('skips a gemini pin the provider has no gemini address for', () => {
    const plan = probePlanFor(intent({ pinned: 'google-generative-ai', endpoints }))
    expect(plan.targets).toEqual([])
    expect(plan.skipped).toContain('no gemini address')
  })

  it('asks an unpinned key on every family the provider addressed', () => {
    const plan = probePlanFor(intent({ endpoints: triEndpoints }))
    expect(plan.targets.map(target => [target.api, target.baseURL])).toEqual([
      ['openai-completions', 'https://relay.example.com/v1'],
      ['anthropic-messages', 'https://relay.example.com/anthropic'],
      ['google-generative-ai', 'https://relay.example.com/v1beta'],
    ])
  })

  it('skips a cross-family pin the provider has no address for', () => {
    const plan = probePlanFor(intent({ pinned: 'anthropic-messages' }))
    expect(plan.targets).toEqual([])
    expect(plan.skipped).toContain('no anthropic address')
  })

  it('skips a route with no address of its own', () => {
    const plan = probePlanFor(intent({ baseURL: '   ' }))
    expect(plan.targets).toEqual([])
  })

  it('does not ask one URL twice when both families share it', () => {
    const plan = probePlanFor(intent({ pinned: 'openai-completions', endpoints }))
    expect(plan.targets).toHaveLength(1)
  })

  it('asks the anthropic route on the openai address when only that one is set', () => {
    const plan = probePlanFor(intent({ api: 'anthropic-messages', baseURL: 'https://relay.example.com/anthropic', endpoints }))
    expect(plan.targets.map(target => target.api)).toEqual(['anthropic-messages', 'openai-completions'])
  })

  it('refuses to probe a wire it cannot speak, so no address is guessed', () => {
    const plan = probePlanFor(intent({ api: 'not-a-wire' as never }))
    expect(plan.targets).toEqual([])
    expect(plan.skipped).toContain('cannot be interrogated on not-a-wire')
  })

  it('asks the families a provider explicitly addressed even when its own wire is unknown', () => {
    const plan = probePlanFor(intent({ api: 'not-a-wire' as never, endpoints }))
    expect(plan.targets.map(target => [target.api, target.baseURL])).toEqual([
      ['openai-completions', 'https://relay.example.com/v1'],
      ['anthropic-messages', 'https://relay.example.com/anthropic'],
    ])
  })
})

describe('Anthropic endpoint paths', () => {
  it.each([
    ['https://anth.example.com', 'https://anth.example.com/v1/messages'],
    ['https://anth.example.com/v1', 'https://anth.example.com/v1/messages'],
    ['https://anth.example.com/v1/', 'https://anth.example.com/v1/messages'],
  ])('uses one /v1 segment for request base %s', (baseURL, expected) => {
    expect(`${anthropicRequestBaseUrl(baseURL)}/v1/messages`).toBe(expected)
  })

  it('keeps listing and request URL rules distinct', () => {
    expect(probeListingUrl('https://anth.example.com/v1', 'anthropic-messages'))
      .toBe('https://anth.example.com/v1/models?limit=1000')
    expect(anthropicRequestBaseUrl('https://anth.example.com/v1'))
      .toBe('https://anth.example.com')
  })
})

describe('Gemini endpoint paths', () => {
  it.each([
    // The Google client takes baseUrl verbatim with no apiVersion, so a bare
    // origin gains /v1beta and a spelled-out path is the gateway's own.
    ['https://gem.example.com', 'https://gem.example.com/v1beta'],
    ['https://gem.example.com/', 'https://gem.example.com/v1beta'],
    ['https://gem.example.com/v1beta', 'https://gem.example.com/v1beta'],
    ['https://gem.example.com/v1beta/', 'https://gem.example.com/v1beta'],
    ['https://gem.example.com/api/gemini', 'https://gem.example.com/api/gemini'],
  ])('derives the version-qualified base from %s', (baseURL, expected) => {
    expect(geminiRequestBaseUrl(baseURL)).toBe(expected)
  })

  it('lists at the native models route with one bounded page', () => {
    expect(probeListingUrl('https://gem.example.com/v1beta', 'google-generative-ai'))
      .toBe('https://gem.example.com/v1beta/models?pageSize=1000')
    // A bare origin still asks a valid URL, the same one a request would use.
    expect(probeListingUrl('https://gem.example.com', 'google-generative-ai'))
      .toBe('https://gem.example.com/v1beta/models?pageSize=1000')
  })
})

describe('Gemini native listing shape', () => {
  it('unwraps models/<id> resource names and keeps only generative entries', () => {
    const entries = listingEntries({
      models: [
        { name: 'models/gemini-2.5-flash', displayName: 'Gemini 2.5 Flash', inputTokenLimit: 1_048_576, outputTokenLimit: 65_536, supportedGenerationMethods: ['generateContent', 'countTokens'] },
        { name: 'models/text-embedding-004', supportedGenerationMethods: ['embedContent'] },
        { name: 'models/no-methods-declared' },
        { supportedGenerationMethods: ['generateContent'] },
      ],
    })
    expect(entries).not.toBeUndefined()
    expect(entries?.map(entry => entry['id'])).toEqual(['gemini-2.5-flash', 'no-methods-declared'])
  })

  it('reads the display label from displayName, never the resource path', () => {
    const models = modelsFromListing({
      models: [
        { name: 'models/gemini-2.5-pro', displayName: 'Gemini 2.5 Pro', inputTokenLimit: 1_048_576, outputTokenLimit: 65_536, supportedGenerationMethods: ['generateContent'] },
      ],
    })
    expect(models).toEqual([
      {
        id: 'gemini-2.5-pro',
        name: 'Gemini 2.5 Pro',
        contextWindow: 1_048_576,
        maxTokens: 65_536,
      },
    ])
  })

  it('treats an empty models array as a real, empty listing', () => {
    expect(listingEntries({ models: [] })).toEqual([])
  })

  it('still reads the harness shapes unchanged', () => {
    expect(listingEntries({ data: [{ id: 'gpt-x' }] })?.map(entry => entry['id'])).toEqual(['gpt-x'])
    expect(listingEntries({ models: { 'relay/model': { id: 'canonical' } } })?.map(entry => entry['id'])).toEqual(['relay/model'])
  })
})

describe('probeKeyModels', () => {
  const answers = new Map<string, string>()
  const options = (over: Partial<ProbeKeyOptions> = {}): ProbeKeyOptions => ({
    ref: 'A',
    intent: intent({ endpoints }),
    apiKey: 'sk-secret',
    profileHeaders: { 'x-deployment': 'relay' },
    timeoutMs: 1000,
    send: async (url) => {
      const body = answers.get(url)
      if (body === undefined) return new Response('{}', { status: 404 })
      return new Response(body, { status: 200 })
    },
    headersFor: (profileHeaders, apiKey, api) => ({
      ...(profileHeaders as Record<string, string>),
      ...(api === 'anthropic-messages' ? { 'x-api-key': apiKey } : { authorization: `Bearer ${apiKey}` }),
    }),
    read: async response => response.text(),
    entries: listingEntries,
    ...over,
  })

  answers.set('https://relay.example.com/v1/models', JSON.stringify({ data: [{ id: 'gpt-6.1-sol' }] }))
  answers.set(
    'https://relay.example.com/anthropic/v1/models?limit=1000',
    JSON.stringify({ data: [{ id: 'claude-sonnet-5.5' }, { id: 'gpt-6.1-sol' }] }),
  )

  it('unions the models of every family that answers, de-duplicated', async () => {
    const result = await probeKeyModels(options())
    expect(result.models).toEqual(['gpt-6.1-sol', 'claude-sonnet-5.5'])
    expect(result.targets.map(target => target.api)).toEqual(['openai-completions', 'anthropic-messages'])
    expect(result.targets.every(target => target.ok)).toBe(true)
  })

  it('signs each family with its own scheme', async () => {
    const seen: Record<string, string>[] = []
    await probeKeyModels(options({
      headersFor: (_profile, apiKey, api) => {
        const headers: Record<string, string> = {}
        if (api === 'anthropic-messages') headers['x-api-key'] = apiKey
        else headers['authorization'] = `Bearer ${apiKey}`
        seen.push(headers)
        return headers
      },
    }))
    expect(seen).toEqual([
      { authorization: 'Bearer sk-secret' },
      { 'x-api-key': 'sk-secret' },
    ])
  })

  it('keeps the scope undefined when nothing answered, so the previous one survives', async () => {
    const result = await probeKeyModels(options({
      send: async () => new Response('{}', { status: 401 }),
    }))
    expect(result.models).toBeUndefined()
    expect(result.targets.map(target => target.status)).toEqual([401, 401])
  })

  it('records an empty answer as a scope of none', async () => {
    const result = await probeKeyModels(options({
      intent: intent(),
      send: async () => new Response(JSON.stringify({ data: [] }), { status: 200 }),
    }))
    expect(result.models).toEqual([])
  })

  it('reports a skip instead of asking the wrong family', async () => {
    const result = await probeKeyModels(options({ intent: intent({ pinned: 'anthropic-messages' }) }))
    expect(result.models).toBeUndefined()
    expect(result.targets).toEqual([])
    expect(result.skipped).toContain('no anthropic address')
  })

  it('never reports the credential or its userinfo', async () => {
    const result = await probeKeyModels(options({
      intent: intent({ baseURL: 'https://user:pass@relay.example.com/v1' }),
      send: async (url, init) => {
        expect(JSON.stringify(init.headers)).toContain('sk-secret')
        return new Response(JSON.stringify({ data: [{ id: 'model' }] }), { status: 200 })
      },
    }))
    expect(JSON.stringify(result)).not.toContain('user:pass')
    expect(JSON.stringify(result)).not.toContain('sk-secret')
  })

  it('reports a transport failure without cancelling the other family', async () => {
    const result = await probeKeyModels(options({
      send: async (url) => {
        if (url.includes('/anthropic')) throw new Error('connection refused')
        return new Response(JSON.stringify({ data: [{ id: 'gpt-6.1-sol' }] }), { status: 200 })
      },
    }))
    expect(result.models).toEqual(['gpt-6.1-sol'])
    expect(result.targets[1]?.error).toBe('connection refused')
  })
})
