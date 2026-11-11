/**
 * Responses history-compatibility tests.
 *
 * Three layers are covered separately: the context degradation (what may and may
 * not be rewritten on the outgoing copy), the fetch-level re-encoding that keeps
 * a `400` refusal's sentence intact, and the store document (only "on" is
 * stored). The replay itself lives in `headers-pi-ai.ts` and is covered by its
 * own spec.
 */

import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  degradeForHistory,
  isHistoryStateMismatch,
  reencodeHistoryRefusal,
} from '../src/history-compat.js'
import {
  historyCompatOf,
  parseHistoryCompat,
  readHistoryCompat,
  setRouteHistoryCompat,
} from '../src/history-compat-store.js'
import { buildHeaderIndex } from '../src/headers-core.js'
import { installHeaderOverlay, type OverlaySource } from '../src/headers-fetch.js'

const MISMATCH = 'OpenAI Responses bad request: The requested item was created under a different '
  + 'Azure OpenAI resource. Use the same resource that created the item to access it.'

/** The other wording of the same condition: a split `fc_`/`rs_` pair. */
const PAIRING = "Item 'fc_04e532402a06567e006af3ab76a0c08190952fb0ab72a95d91' of type 'function_call' "
  + "was provided without its required 'reasoning' item: "
  + "'rs_04e532402a06567e006af3ab71694c819080986fbb3ffc6438'."

/** One request body, used only by the fetch-level re-encoding tests. */
function conversation(): string {
  return JSON.stringify({
    model: 'gpt-test',
    store: false,
    previous_response_id: 'resp_keep',
    input: [
      { type: 'message', role: 'user', id: 'msg_a', content: [{ type: 'input_text', text: 'hi' }] },
      { type: 'reasoning', id: 'rs_a', encrypted_content: 'enc_a', summary: [] },
      { type: 'message', role: 'assistant', id: 'msg_b', content: [{ type: 'output_text', text: 'ok' }] },
    ],
  })
}

/**
 * A pi-ai context shaped the way the provider replays it: the assistant turn
 * carries a serialized reasoning item, a text signature and a `callId|itemId`
 * tool call. All three are bound to the resource that minted them.
 */
function contextWithHistory(): Record<string, unknown> {
  return {
    systemPrompt: 'be brief',
    messages: [
      { role: 'user', content: [{ type: 'text', text: 'hi' }] },
      {
        role: 'assistant',
        content: [
          {
            type: 'thinking',
            thinking: 'because',
            thinkingSignature: JSON.stringify({ id: 'rs_1', encrypted_content: 'enc_1', summary: [] }),
          },
          {
            type: 'text',
            text: 'ok',
            textSignature: JSON.stringify({ id: 'msg_1', phase: 'final_answer' }),
          },
          { type: 'toolCall', id: 'call_1|fc_1', name: 'run', arguments: { x: 1 } },
        ],
      },
      { role: 'user', content: [{ type: 'text', text: 'next' }] },
    ],
    tools: [{ name: 'run' }],
  }
}

function blocksOf(context: Record<string, unknown>): Record<string, unknown>[] {
  const messages = context['messages'] as Record<string, unknown>[]
  return messages[1]?.['content'] as Record<string, unknown>[]
}

describe('isHistoryStateMismatch', () => {
  it('recognizes the Azure resource refusal verbatim', () => {
    expect(isHistoryStateMismatch(MISMATCH)).toBe(true)
  })

  it('recognizes the wording without naming Azure', () => {
    expect(isHistoryStateMismatch('item was created under a different upstream resource')).toBe(true)
  })

  it('recognizes a tool call whose reasoning pair the relay dropped', () => {
    expect(isHistoryStateMismatch(PAIRING)).toBe(true)
    // The relay may prefix it with its own error envelope.
    expect(isHistoryStateMismatch(`openai_responses: ${PAIRING}`)).toBe(true)
  })

  it('keeps the pairing pattern narrow', () => {
    expect(isHistoryStateMismatch('the request was provided without its required header')).toBe(false)
    expect(isHistoryStateMismatch('reasoning effort is not supported by this model')).toBe(false)
    expect(isHistoryStateMismatch('Item was provided without its required field')).toBe(false)
  })

  it('ignores unrelated errors', () => {
    expect(isHistoryStateMismatch('rate limit exceeded')).toBe(false)
    expect(isHistoryStateMismatch('The model does not support store=false')).toBe(false)
    expect(isHistoryStateMismatch('')).toBe(false)
  })
})

describe('degradeForHistory', () => {
  it('portable_ids drops the ids inside signatures and the item half of a tool call', () => {
    const degraded = degradeForHistory(contextWithHistory(), 'portable_ids')
    expect(degraded).toBeDefined()
    const context = degraded as Record<string, unknown>
    // Nothing outside the touched turn is copied or changed.
    expect(context['systemPrompt']).toBe('be brief')
    expect(context['tools']).toEqual([{ name: 'run' }])

    const blocks = blocksOf(context)
    expect(JSON.parse(String(blocks[0]?.['thinkingSignature']))).toEqual({
      encrypted_content: 'enc_1',
      summary: [],
    })
    // The text signature is removed, not reduced to `{phase}`. pi-ai would
    // otherwise send that JSON as the item id.
    expect(Object.hasOwn(blocks[1] ?? {}, 'textSignature')).toBe(false)
    expect(blocks[1]?.['text']).toBe('ok')
    expect(blocks[2]?.['id']).toBe('call_1')
    // The visible thinking text and the call name survive.
    expect(blocks[0]?.['thinking']).toBe('because')
    expect(blocks[2]?.['name']).toBe('run')
  })

  it('drops a v1 commentary signature instead of replaying it as the item id', () => {
    const signature = JSON.stringify({
      v: 1,
      id: 'msg_0a94ca0d243a15dc016af15c57f6288196b87386fe405a26af',
      phase: 'commentary',
    })
    const degraded = degradeForHistory({
      messages: [{
        role: 'assistant',
        content: [{ type: 'text', text: 'thinking aloud', textSignature: signature }],
      }],
    }, 'portable_ids')
    const blocks = ((degraded?.['messages'] as Record<string, unknown>[])[0]?.['content']) as Record<string, unknown>[]
    expect(Object.hasOwn(blocks[0] ?? {}, 'textSignature')).toBe(false)
    expect(blocks[0]?.['text']).toBe('thinking aloud')
  })

  it('drop_reasoning stops replaying the reasoning item but keeps its local text', () => {
    const degraded = degradeForHistory(contextWithHistory(), 'drop_reasoning')
    expect(degraded).toBeDefined()
    const blocks = blocksOf(degraded as Record<string, unknown>)
    expect(Object.hasOwn(blocks[0] ?? {}, 'thinkingSignature')).toBe(false)
    expect(blocks[0]?.['thinking']).toBe('because')
    // The escalation also applies the portable-id stage.
    expect(Object.hasOwn(blocks[1] ?? {}, 'textSignature')).toBe(false)
    expect(blocks[1]?.['text']).toBe('ok')
    expect(blocks[2]?.['id']).toBe('call_1')
  })

  it('reports "no change" rather than replaying an identical context', () => {
    expect(degradeForHistory({
      messages: [{ role: 'assistant', content: [{ type: 'text', text: 'plain' }] }],
    }, 'portable_ids')).toBeUndefined()
    expect(degradeForHistory({
      messages: [{ role: 'assistant', content: [{ type: 'text', text: 'plain', textSignature: '{"phase":"x"}' }] }],
    }, 'drop_reasoning')).toBeUndefined()
    expect(degradeForHistory('not a context', 'portable_ids')).toBeUndefined()
  })

  it('never mutates the caller-owned context', () => {
    const context = contextWithHistory()
    const before = JSON.stringify(context)
    degradeForHistory(context, 'drop_reasoning')
    degradeForHistory(context, 'portable_ids')
    expect(JSON.stringify(context)).toBe(before)
  })
})

describe('reencodeHistoryRefusal', () => {
  it('re-encodes a 400 refusal as JSON, keeping its status', async () => {
    const original = new Response(`data: ${JSON.stringify({ error: { message: MISMATCH } })}`, {
      status: 400,
      headers: { 'content-type': 'text/event-stream', 'x-oneapi-request-id': 'r-1' },
    })
    const replacement = await reencodeHistoryRefusal(original)
    expect(replacement).toBeDefined()
    expect(replacement?.status).toBe(400)
    expect(replacement?.headers.get('content-type')).toContain('application/json')
    const body = await replacement?.json() as { error: { type: string; message: string } }
    expect(body.error.type).toBe('invalid_request_error')
    expect(body.error.message).toContain('different Azure OpenAI resource')
    // The clone was read; the original is still intact for the error path.
    expect(await original.text()).toContain('different Azure OpenAI resource')
  })

  it('keeps a 5xx status when the same sentence arrives there', async () => {
    const replacement = await reencodeHistoryRefusal(new Response(MISMATCH, { status: 502 }))
    expect(replacement?.status).toBe(502)
    const body = await replacement?.json() as { error: { type: string } }
    expect(body.error.type).toBe('server_error')
  })

  it('re-encodes the split-pair refusal the same way', async () => {
    // A relay that answers the pairing refusal as a JSON error body: the
    // sentence has to survive into the stream error for the replay to start.
    const original = new Response(JSON.stringify({ error: { message: PAIRING } }), {
      status: 400,
      headers: { 'content-type': 'application/json' },
    })
    const replacement = await reencodeHistoryRefusal(original)
    expect(replacement?.status).toBe(400)
    const body = await replacement?.json() as { error: { type: string; message: string } }
    expect(body.error.type).toBe('invalid_request_error')
    expect(body.error.message).toContain('without its required')
  })

  it('passes every other response through untouched', async () => {
    expect(await reencodeHistoryRefusal(new Response(
      JSON.stringify({ error: { message: 'invalid model' } }),
      { status: 400, headers: { 'content-type': 'application/json' } },
    ))).toBeUndefined()
    expect(await reencodeHistoryRefusal(new Response(MISMATCH, { status: 200 }))).toBeUndefined()
    expect(await reencodeHistoryRefusal(new Response(MISMATCH, { status: 401 }))).toBeUndefined()
  })
})

describe('history-compat store', () => {
  let home: string

  beforeEach(() => {
    home = mkdtempSync(join(tmpdir(), 'bre-history-compat-'))
  })

  afterEach(() => {
    rmSync(home, { recursive: true, force: true })
  })

  it('stores only the routes that are on', () => {
    const file = join(home, 'topic-recovery.json')
    setRouteHistoryCompat('relay', true, file)
    const document = setRouteHistoryCompat('other', true, file)
    expect(historyCompatOf(document, 'relay')).toBe(true)
    expect(JSON.parse(readFileSync(file, 'utf8'))).toEqual({
      version: 1,
      providers: { relay: true, other: true },
    })
    const off = setRouteHistoryCompat('relay', false, file)
    expect(historyCompatOf(off, 'relay')).toBe(false)
    expect(Object.keys(off.providers)).toEqual(['other'])
  })

  it('migrates the pre-sync file name on first read', () => {
    const legacy = join(home, 'history-compat.json')
    const file = join(home, 'topic-recovery.json')
    writeFileSync(legacy, JSON.stringify({ version: 1, providers: { relay: true } }), 'utf8')
    // The switch saved by an earlier build is still on...
    expect(historyCompatOf(readHistoryCompat(file), 'relay')).toBe(true)
    // ...and the document now lives under the name the sync layer accepts.
    expect(JSON.parse(readFileSync(file, 'utf8'))).toEqual({ version: 1, providers: { relay: true } })
  })

  it('refuses a document that says anything but "on"', () => {
    expect(parseHistoryCompat({ providers: { a: true, b: 'yes', c: 1 } }).providers).toEqual({ a: true })
    expect(readHistoryCompat(join(home, 'absent.json')).providers).toEqual({})
  })
})

describe('installHeaderOverlay history re-encoding', () => {
  const original = globalThis.fetch

  interface Recorded {
    input: unknown
    init: RequestInit | undefined
  }

  let calls: Recorded[]
  let handles: { dispose(): void }[]
  let baseHandler: (init: RequestInit | undefined, index: number) => Response

  /** Install the wrapper under test with one indexed route that recovers history. */
  function install(historyCompat = true): void {
    const handler = () => baseHandler(calls[calls.length - 1]?.init, calls.length - 1)
    globalThis.fetch = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      calls.push({ input, init })
      return Promise.resolve(handler())
    }) as unknown as typeof globalThis.fetch
    const source: OverlaySource = {
      current: buildHeaderIndex(
        { relay: { baseURL: 'https://relay.example.com', models: [{ id: 'gpt-test' }] } },
        undefined,
        historyCompat ? { relay: true } : undefined,
      ),
    }
    handles.push(installHeaderOverlay(source))
  }

  beforeEach(() => {
    calls = []
    handles = []
  })

  afterEach(() => {
    for (const handle of handles) handle.dispose()
    globalThis.fetch = original
  })

  it('re-encodes a marked SSE 400 refusal so the stream seam can see it', async () => {
    install()
    baseHandler = () => new Response(JSON.stringify({ error: { message: MISMATCH } }), {
      status: 400,
      headers: { 'content-type': 'text/event-stream', 'x-oneapi-request-id': 'req-1' },
    })
    const response = await globalThis.fetch('https://relay.example.com/v1/responses', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: conversation(),
    })
    // One upstream call: the repair belongs to the stream seam, not the fetch.
    expect(calls).toHaveLength(1)
    expect(response.status).toBe(400)
    expect(response.headers.get('content-type')).toContain('application/json')
    expect(await response.text()).toContain('different Azure OpenAI resource')
  })

  it('re-encodes an SSE refusal the relay did not mark', async () => {
    install()
    baseHandler = () => new Response(JSON.stringify({ error: { message: MISMATCH } }), {
      status: 400,
      headers: { 'content-type': 'text/event-stream' },
    })
    const response = await globalThis.fetch('https://relay.example.com/v1/responses', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: conversation(),
    })
    expect(response.status).toBe(400)
    expect(await response.text()).toContain('different Azure OpenAI resource')
  })

  it('passes a 400 that is not the refusal through with its body', async () => {
    install()
    baseHandler = () => new Response(JSON.stringify({ error: { message: 'invalid model' } }), {
      status: 400,
      headers: { 'content-type': 'application/json' },
    })
    const response = await globalThis.fetch('https://relay.example.com/v1/responses', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: conversation(),
    })
    expect(response.status).toBe(400)
    expect(calls).toHaveLength(1)
    expect(await response.text()).toContain('invalid model')
  })

  it('does not touch a route that did not opt in', async () => {
    install(false)
    baseHandler = () => new Response(MISMATCH, { status: 400 })
    const response = await globalThis.fetch('https://relay.example.com/v1/responses', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: conversation(),
    })
    expect(calls).toHaveLength(1)
    expect(await response.text()).toBe(MISMATCH)
  })

  it('never reads a successful response', async () => {
    install()
    baseHandler = () => new Response('{"ok":true}', { status: 200 })
    const response = await globalThis.fetch('https://relay.example.com/v1/responses', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: conversation(),
    })
    expect(response.status).toBe(200)
    expect(await response.text()).toBe('{"ok":true}')
  })
})
