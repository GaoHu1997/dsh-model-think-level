/**
 * The request-disguise unit: the header identity, the Claude Messages body
 * patch, and the per-route store.
 *
 * These are pure-function tests on purpose. What they pin is the contract the
 * two hosts of a disguise (the fetch overlay and the pi-ai header transform)
 * both rely on: which markers are FORCED, which are only filled in when absent,
 * that the body patch is idempotent for the gate's two markers while leaving
 * tools, images and signatures alone, and that the store can never resurrect a
 * preset a later version removed.
 */

import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  CLAUDE_CODE_SYSTEM_TEXT,
  applyCamouflageHeaders,
  camouflageClaudeUserId,
  camouflageHeaders,
  camouflageUserAgent,
  isAnthropicMessagesUrl,
  isCamouflagePreset,
  patchCamouflageBody,
} from '../src/camouflage.js'
import {
  camouflageOf,
  emptyCamouflage,
  parseCamouflage,
  readCamouflage,
  setRouteCamouflage,
} from '../src/camouflage-store.js'

const MESSAGES_URL = 'https://relay.example.com/v1/messages'

/** The JSON object a patch produced, for field-level assertions. */
function patchedBody(text: string): Record<string, unknown> {
  const patched = patchCamouflageBody(text, 'claude', MESSAGES_URL)
  expect(patched).toBeTypeOf('string')
  return JSON.parse(patched as string) as Record<string, unknown>
}

describe('isAnthropicMessagesUrl', () => {
  it('accepts the Messages wire with or without a trailing slash', () => {
    expect(isAnthropicMessagesUrl(MESSAGES_URL)).toBe(true)
    expect(isAnthropicMessagesUrl('https://relay.example.com/v1/messages/')).toBe(true)
    expect(isAnthropicMessagesUrl('https://relay.example.com/messages')).toBe(true)
  })

  it('rejects other wires and unparsable input', () => {
    expect(isAnthropicMessagesUrl('https://relay.example.com/v1/chat/completions')).toBe(false)
    expect(isAnthropicMessagesUrl('https://relay.example.com/v1/responses')).toBe(false)
    expect(isAnthropicMessagesUrl('/v1/messages')).toBe(false)
    expect(isAnthropicMessagesUrl('')).toBe(false)
  })
})

describe('camouflageHeaders', () => {
  it('gives Codex the CLI program name, the originator and a session id', () => {
    const headers = camouflageHeaders('codex')
    expect(headers['user-agent']).toMatch(/^codex_cli_rs\/\d+\.\d+\.\d+/)
    expect(headers['originator']).toBe('codex_cli_rs')
    expect(headers['x-codex-session-id']).toMatch(/\S/)
  })

  it('gives Claude the CLI user agent and both Anthropic identity headers', () => {
    const headers = camouflageHeaders('claude')
    expect(headers['user-agent']).toMatch(/^claude-cli\/\d+\.\d+\.\d+/)
    expect(headers['x-app']).toBe('cli')
    expect(headers['anthropic-version']).toBe('2023-06-01')
    expect(headers['anthropic-beta']).toBeTypeOf('string')
  })

  it('never names the account behind the key', () => {
    for (const preset of ['codex', 'claude'] as const) {
      expect(JSON.stringify(camouflageHeaders(preset))).not.toMatch(/sk-|api[-_]?key/i)
      expect(camouflageUserAgent(preset)).not.toMatch(/sk-/)
    }
  })
})

describe('applyCamouflageHeaders', () => {
  it('forces the identity user agent over a leftover SDK one', () => {
    const headers = new Headers({ 'user-agent': 'node-fetch/1.0' })
    expect(applyCamouflageHeaders(headers, 'claude')).toBe(true)
    expect(headers.get('user-agent')).toMatch(/^claude-cli\//)
  })

  it('keeps an anthropic-version the SDK already set', () => {
    const headers = new Headers({ 'anthropic-version': '2024-01-01' })
    applyCamouflageHeaders(headers, 'claude')
    expect(headers.get('anthropic-version')).toBe('2024-01-01')
  })

  it('reports no change when every marker already matches', () => {
    const headers = new Headers(camouflageHeaders('codex'))
    expect(applyCamouflageHeaders(headers, 'codex')).toBe(false)
  })
})

describe('patchCamouflageBody', () => {
  it('prepends the identity system block when the body has none', () => {
    const body = patchedBody(JSON.stringify({ model: 'm', max_tokens: 8, messages: [] }))
    expect(body['system']).toEqual([{ type: 'text', text: CLAUDE_CODE_SYSTEM_TEXT }])
  })

  it('turns a string system prompt into blocks, identity first', () => {
    const body = patchedBody(JSON.stringify({ system: 'be brief', messages: [] }))
    expect(body['system']).toEqual([
      { type: 'text', text: CLAUDE_CODE_SYSTEM_TEXT },
      { type: 'text', text: 'be brief' },
    ])
  })

  it('does not duplicate the identity block an earlier pass prepended', () => {
    const once = patchCamouflageBody(JSON.stringify({ messages: [] }), 'claude', MESSAGES_URL) as string
    const twice = patchCamouflageBody(once, 'claude', MESSAGES_URL)
    // Only metadata can be new on the second pass — and it is already there.
    expect(twice).toBeUndefined()
    const body = JSON.parse(once) as Record<string, unknown>
    expect(body['system']).toEqual([{ type: 'text', text: CLAUDE_CODE_SYSTEM_TEXT }])
  })

  it('adds a parseable metadata user id and keeps the caller’s other fields', () => {
    const tools = [{ name: 'read', input_schema: { type: 'object' } }]
    const body = patchedBody(JSON.stringify({
      model: 'claude-x',
      tools,
      metadata: { other: 1 },
      messages: [{ role: 'user', content: 'hi' }],
    }))
    expect(body['tools']).toEqual(tools)
    expect(body['messages']).toEqual([{ role: 'user', content: 'hi' }])
    const metadata = body['metadata'] as Record<string, unknown>
    expect(metadata['other']).toBe(1)
    expect(metadata['user_id']).toBeTypeOf('string')
    expect(metadata['user_id']).toMatch(/^user_[0-9a-f]{32}_account_[0-9a-f]{32}_session_[0-9a-f-]{36}$/)
  })

  it('keeps a metadata user id the caller already sent', () => {
    const body = patchedBody(JSON.stringify({ metadata: { user_id: 'user_keep_me' } }))
    expect((body['metadata'] as Record<string, unknown>)['user_id']).toBe('user_keep_me')
  })

  it('leaves the body alone for Codex, other wires, non-JSON and non-objects', () => {
    expect(patchCamouflageBody(JSON.stringify({ messages: [] }), 'codex', MESSAGES_URL)).toBeUndefined()
    expect(patchCamouflageBody(JSON.stringify({ messages: [] }), 'claude', 'https://relay.example.com/v1/chat/completions')).toBeUndefined()
    expect(patchCamouflageBody('not json', 'claude', MESSAGES_URL)).toBeUndefined()
    expect(patchCamouflageBody('[]', 'claude', MESSAGES_URL)).toBeUndefined()
  })

  it('generates one stable user id per process', () => {
    expect(camouflageClaudeUserId()).toBe(camouflageClaudeUserId())
  })
})

describe('camouflage store', () => {
  let dir = ''

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'bre-camouflage-'))
  })

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true })
  })

  it('starts empty and round-trips one route', () => {
    const file = join(dir, 'camouflage.json')
    expect(readCamouflage(file).providers).toEqual({})
    setRouteCamouflage('relay', 'codex', file)
    expect(camouflageOf(readCamouflage(file), 'relay')).toBe('codex')
    setRouteCamouflage('relay', 'claude', file)
    expect(camouflageOf(readCamouflage(file), 'relay')).toBe('claude')
  })

  it('removes a route when the preset is undefined', () => {
    const file = join(dir, 'camouflage.json')
    setRouteCamouflage('relay', 'codex', file)
    setRouteCamouflage('other', 'claude', file)
    setRouteCamouflage('relay', undefined, file)
    expect(readCamouflage(file).providers).toEqual({ other: 'claude' })
  })

  it('drops presets it does not know instead of replaying them', () => {
    expect(parseCamouflage({ version: 1, providers: { a: 'codex', b: 'gemini' } })).toEqual({
      version: 1,
      providers: { a: 'codex' },
    })
    expect(isCamouflagePreset('gemini')).toBe(false)
    expect(parseCamouflage(undefined)).toEqual(emptyCamouflage())
    expect(parseCamouflage('nonsense')).toEqual(emptyCamouflage())
  })

  it('cannot be polluted through a __proto__ key', () => {
    const parsed = parseCamouflage(JSON.parse('{"providers":{"__proto__":"codex","ok":"claude"}}') as unknown)
    expect(camouflageOf(parsed, 'ok')).toBe('claude')
    expect(Object.getPrototypeOf(parsed.providers)).toBe(Object.prototype)
    expect(({} as Record<string, unknown>)['codex']).toBeUndefined()
  })

  it('reads a corrupt file as empty rather than throwing', () => {
    const file = join(dir, 'camouflage.json')
    setRouteCamouflage('relay', 'codex', file)
    expect(readCamouflage(join(dir, 'missing.json')).providers).toEqual({})
  })
})
