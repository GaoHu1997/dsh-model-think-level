/**
 * The pure half of multi-key routing.
 *
 * These tests pin the Scheme A rules directly, without a wire, a store, or a
 * settings document: which key signs a model both keys serve (the first), which
 * key a model only one key serves uses (that key), and when a failed request is
 * retried on the next key.
 */

import { describe, expect, it } from 'vitest'
import {
  CREDENTIAL_HEADERS,
  applyKeyToHeaders,
  canServe,
  classifyFailure,
  cooldownFor,
  keysForModel,
  shouldFailover,
  type KeyCandidate,
  type ServingKnowledge,
} from '../src/key-route-core.js'

function key(ref: string, models?: readonly string[]): KeyCandidate {
  return models === undefined ? { ref, value: `secret-${ref}` } : { ref, value: `secret-${ref}`, models }
}

describe('canServe', () => {
  it('treats an unscoped key as a catch-all for any model', () => {
    expect(canServe(key('A'), 'glm-4')).toBe(true)
    expect(canServe(key('A'), undefined)).toBe(true)
  })

  it('serves a model only when a concrete scope lists it', () => {
    const scoped = key('A', ['glm-4', 'glm-4-flash'])
    expect(canServe(scoped, 'glm-4')).toBe(true)
    expect(canServe(scoped, 'kimi-k2')).toBe(false)
  })

  it('cannot exclude a key when the model is unknown', () => {
    // A body the seam could not read must not narrow the candidate set on a guess.
    expect(canServe(key('A', ['glm-4']), undefined)).toBe(true)
    expect(canServe(key('A', []), undefined)).toBe(true)
  })

  it('treats an empty scope as reaching nothing', () => {
    expect(canServe(key('A', []), 'glm-4')).toBe(false)
  })
})

describe('keysForModel', () => {
  it('sends a model both keys serve to the first key, in list order', () => {
    const keys = [key('A', ['glm-4']), key('B', ['glm-4'])]
    expect(keysForModel(keys, 'glm-4').map(k => k.ref)).toEqual(['A', 'B'])
  })

  it('binds a model only one key serves to that key', () => {
    const keys = [key('A', ['glm-4']), key('B', ['kimi-k2'])]
    expect(keysForModel(keys, 'glm-4').map(k => k.ref)).toEqual(['A'])
    expect(keysForModel(keys, 'kimi-k2').map(k => k.ref)).toEqual(['B'])
  })

  it('puts a key that names the model ahead of a catch-all key listed before it', () => {
    const keys = [key('A'), key('B', ['glm-4'])]
    expect(keysForModel(keys, 'glm-4').map(k => k.ref)).toEqual(['B', 'A'])
  })

  it('keeps catch-alls in list order after the keys that name the model', () => {
    const keys = [key('A'), key('B', ['glm-4']), key('C')]
    expect(keysForModel(keys, 'glm-4').map(k => k.ref)).toEqual(['B', 'A', 'C'])
  })

  it('falls back to every key when no scope claims the model, so a stale scope never strands it', () => {
    const keys = [key('A', ['glm-4']), key('B', ['kimi-k2'])]
    expect(keysForModel(keys, 'qwen-max').map(k => k.ref)).toEqual(['A', 'B'])
  })

  it('answers with no key when the route has none', () => {
    expect(keysForModel([], 'glm-4')).toEqual([])
  })

  it('orders purely by list order for an unknown model', () => {
    const keys = [key('A', ['glm-4']), key('B', ['kimi-k2'])]
    expect(keysForModel(keys, undefined).map(k => k.ref)).toEqual(['A', 'B'])
  })
})

describe('shouldFailover', () => {
  it('retries the next key on auth, rate-limit, timeout and server faults', () => {
    for (const status of [401, 403, 408, 429, 500, 502, 503]) {
      expect(shouldFailover(status)).toBe(true)
    }
  })

  it('returns request-shape failures to the caller rather than multiplying them', () => {
    for (const status of [400, 404, 422]) {
      expect(shouldFailover(status)).toBe(false)
    }
  })
})

describe('applyKeyToHeaders', () => {
  it('overwrites a Bearer authorization in place', () => {
    const headers = new Headers({ authorization: 'Bearer old' })
    applyKeyToHeaders(headers, 'new-secret')
    expect(headers.get('authorization')).toBe('Bearer new-secret')
  })

  it('overwrites an x-api-key in place, leaving the scheme untouched', () => {
    const headers = new Headers({ 'x-api-key': 'old', 'anthropic-version': '2023-06-01' })
    applyKeyToHeaders(headers, 'new-secret')
    expect(headers.get('x-api-key')).toBe('new-secret')
    expect(headers.get('authorization')).toBeNull()
    expect(headers.get('anthropic-version')).toBe('2023-06-01')
  })

  it('adds a Bearer credential when the request carried none', () => {
    const headers = new Headers({ 'content-type': 'application/json' })
    applyKeyToHeaders(headers, 'new-secret')
    expect(headers.get('authorization')).toBe('Bearer new-secret')
  })

  it('never lets two credentials ride together', () => {
    // Both credentials present: keep the x-api-key scheme and drop the Bearer.
    const headers = new Headers({ authorization: 'Bearer old', 'x-api-key': 'old' })
    applyKeyToHeaders(headers, 'new-secret')
    expect(headers.get('x-api-key')).toBe('new-secret')
    expect(headers.get('authorization')).toBeNull()
  })

  it('overwrites an x-goog-api-key in place, alone', () => {
    const headers = new Headers({ 'x-goog-api-key': 'AIza-old' })
    applyKeyToHeaders(headers, 'AIza-new')
    expect(headers.get('x-goog-api-key')).toBe('AIza-new')
    expect(headers.get('authorization')).toBeNull()
    expect(headers.get('x-api-key')).toBeNull()
  })

  it('lets the google scheme outrank the other two when all ride along', () => {
    const headers = new Headers({
      authorization: 'Bearer old',
      'x-api-key': 'old',
      'x-goog-api-key': 'AIza-old',
    })
    applyKeyToHeaders(headers, 'AIza-new')
    expect(headers.get('x-goog-api-key')).toBe('AIza-new')
    expect(headers.get('authorization')).toBeNull()
    expect(headers.get('x-api-key')).toBeNull()
  })

  it('names the credential headers it manages', () => {
    expect([...CREDENTIAL_HEADERS].sort()).toEqual(['authorization', 'x-api-key', 'x-goog-api-key'])
  })
})

/**
 * The second kind of knowledge: not what the user assigned, but what each key's
 * own listing said it serves. A relay resolving keys to different upstream
 * groups is the case both of these rules exist for.
 */
describe('canServe with observations', () => {
  const observed = (entries: [string, string[]][]): ServingKnowledge => ({ listed: new Map(entries) })

  it('excludes an unscoped key when a SIBLING lists the model and it does not', () => {
    const knowledge = observed([['A', ['glm-4']], ['B', ['kimi-k2']]])
    expect(canServe(key('A'), 'kimi-k2', knowledge)).toBe(false)
    expect(canServe(key('A'), 'glm-4', knowledge)).toBe(true)
  })

  it('keeps a key whose own list was never read', () => {
    // Unknown is not empty: a failed listing must not bench a working key.
    expect(canServe(key('B'), 'kimi-k2', observed([['A', ['glm-4']]]))).toBe(true)
  })

  it('keeps every key when no list names the model, so an unlisted model is still tried', () => {
    const knowledge = observed([['A', ['glm-4']], ['B', ['kimi-k2']]])
    expect(canServe(key('A'), 'qwen-max', knowledge)).toBe(true)
    expect(canServe(key('B'), 'qwen-max', knowledge)).toBe(true)
  })

  it('lets the manual assignment outrank an observation', () => {
    expect(canServe(key('A', ['glm-4']), 'glm-4', observed([['A', []]]))).toBe(true)
  })

  it('does not read an empty scope as an observation', () => {
    expect(canServe(key('A', []), 'glm-4', observed([['B', ['glm-4']]]))).toBe(false)
  })
})

describe('keysForModel with observations', () => {
  it('drops an unscoped key whose sibling lists the model and it does not', () => {
    const knowledge = { listed: new Map([['A', ['glm-4']], ['B', ['gpt-6.1-sol']]]) }
    expect(keysForModel([key('A'), key('B')], 'gpt-6.1-sol', knowledge).map(k => k.ref)).toEqual(['B'])
  })

  it('still answers with every key when no list names the model', () => {
    const knowledge = { listed: new Map([['A', ['glm-4']], ['B', ['kimi-k2']]]) }
    expect(keysForModel([key('A'), key('B')], 'qwen-max', knowledge).map(k => k.ref)).toEqual(['A', 'B'])
  })

  it('keeps an explicitly scoped key ahead of a listed sibling', () => {
    const knowledge = { listed: new Map([['A', ['glm-4']], ['B', ['glm-4']]]) }
    const keys = [key('A'), key('B', ['glm-4'])]
    expect(keysForModel(keys, 'glm-4', knowledge).map(k => k.ref)).toEqual(['B', 'A'])
  })
})

describe('a model refusal the provider words per account', () => {
  // The exact answer a relay sends when a key's group does not carry the model,
  // and the one that must not be returned to the caller on the first key.
  const body = '{"message":"Model \\"gpt-6.1-sol\\" is not supported by any configured account in this group","type":"model_not_found"}'

  it('failovers to the next key, unlike a bare request-shape 404', () => {
    expect(shouldFailover(404, body)).toBe(true)
    expect(shouldFailover(400, body)).toBe(true)
    expect(shouldFailover(404, '404 page not found')).toBe(false)
    expect(shouldFailover(404, '')).toBe(false)
    expect(shouldFailover(422, 'unprocessable entity')).toBe(false)
  })

  it('classifies as unserved rather than refused, and never as auth', () => {
    expect(classifyFailure(404, body)).toBe('unserved')
    expect(classifyFailure(400, '{"error":{"message":"Model kimi-k2 is not supported"}}')).toBe('unserved')
    expect(classifyFailure(403, '{"message":"Model \\"glm-4\\" not found"}')).toBe('unserved')
    expect(classifyFailure(404, 'not found')).toBeUndefined()
  })

  it('rests for minutes, not for a quota period', () => {
    expect(cooldownFor('unserved')).toBeGreaterThan(cooldownFor('rate'))
    expect(cooldownFor('unserved')).toBeLessThan(cooldownFor('quota'))
  })
})
