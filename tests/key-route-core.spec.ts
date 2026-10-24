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
  keysForModel,
  shouldFailover,
  type KeyCandidate,
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

  it('names the credential headers it manages', () => {
    expect([...CREDENTIAL_HEADERS].sort()).toEqual(['authorization', 'x-api-key'])
  })
})
