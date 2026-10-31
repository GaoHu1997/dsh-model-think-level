/**
 * The auto-continue decision: which ended turns get the automatic 「继续」
 * and which must not.
 *
 * The table drives the whole 分情况 contract: cut-offs (max-tokens, the
 * harness's own retryable failure codes, continuable HTTP statuses) continue;
 * safe ends (completed / aborted / blocked) and unfixable endings (auth,
 * quota, invalid request, context overflow, lifecycle closers, unknown
 * reasons) never do; a turn that logged no input and no activity is never
 * worth continuing whatever the reason says.
 */

import { describe, expect, it } from 'vitest'
import { judgeTurnTail, type DurableEventLike, type TurnTail } from '../src/client/auto-continue-rules.js'

/** One durable event with the minimal shape the rules read. */
function event(type: string, seq: number, data?: unknown): DurableEventLike {
  return { type, seq, time: seq * 1000, ...(data === undefined ? {} : { data }) }
}

/** A turn-end event whose error reason carries one failure. */
function errorEnd(seq: number, failure: Record<string, unknown>): DurableEventLike {
  return event('turn/end', seq, { turn: 1, reason: { kind: 'error', error: failure } })
}

/** A tail of a turn that carried a user message and an assistant message. */
function activeTail(turnEnd: DurableEventLike): TurnTail {
  return {
    turnEnd,
    turnEvents: [
      event('turn/start', turnEnd.seq - 3, { turn: 1 }),
      event('user/message', turnEnd.seq - 2, { message: { content: [{ type: 'text', text: '帮我写个爬虫' }] } }),
      event('assistant/message', turnEnd.seq - 1, { message: { content: [{ type: 'text', text: '好的，我先…' }] } }),
      turnEnd,
    ],
  }
}

/** A tail whose turn closed with nothing under it. */
function emptyTail(turnEnd: DurableEventLike): TurnTail {
  return {
    turnEnd,
    turnEvents: [event('turn/start', turnEnd.seq - 1, { turn: 1 }), turnEnd],
  }
}

describe('auto-continue rules', () => {
  it('continues a max-tokens cut-off', () => {
    const verdict = judgeTurnTail(activeTail(event('turn/end', 10, { turn: 1, reason: { kind: 'max-tokens' } })))
    expect(verdict).toMatchObject({ kind: 'continue', reason: 'max-tokens' })
  })

  it('continues every transient failure code the harness itself retries', () => {
    for (const code of ['TRANSPORT', 'TIMEOUT', 'SERVER', 'RATE_LIMIT', 'EMPTY_RESPONSE']) {
      const verdict = judgeTurnTail(activeTail(errorEnd(10, { message: 'upstream broke', code })))
      expect(verdict, code).toMatchObject({ kind: 'continue', reason: 'transient-error', detail: code })
    }
  })

  it('continues by HTTP status when the code does not classify', () => {
    for (const status of [408, 425, 429, 500, 502, 503]) {
      const verdict = judgeTurnTail(activeTail(errorEnd(10, { message: 'gateway', code: 'PI_AI_ERROR', status })))
      expect(verdict, String(status)).toMatchObject({ kind: 'continue', reason: 'transient-error' })
    }
  })

  it('honors the provider-requested wait of a rate-limited answer', () => {
    const verdict = judgeTurnTail(activeTail(errorEnd(10, { message: 'slow down', code: 'RATE_LIMIT', providerRetryAfterMs: 45_000 })))
    expect(verdict).toMatchObject({ kind: 'continue', waitMs: 45_000 })
  })

  it('refuses failures a 继续 cannot repair', () => {
    const cases: Array<[string, Record<string, unknown>]> = [
      ['auth', { message: '401; check the API key', code: 'AUTH' }],
      ['quota', { message: 'insufficient balance', code: 'QUOTA' }],
      ['account quota', { message: 'account quota', code: 'ACCOUNT_QUOTA' }],
      ['invalid credential', { message: 'bad key', code: 'INVALID_CREDENTIAL' }],
      ['invalid request', { message: '400 bad request', code: 'INVALID_REQUEST' }],
      ['context window', { message: 'context too long', code: 'CONTEXT_WINDOW_EXCEEDED' }],
      ['aborted', { message: 'caller abort', code: 'ABORTED' }],
      ['unclassified', { message: 'weird provider text', code: 'PI_AI_ERROR' }],
      ['unknown code', { message: 'mystery', code: 'UNKNOWN' }],
      ['4xx status', { message: 'forbidden', status: 403 }],
      ['no facts at all', {}],
    ]
    for (const [name, failure] of cases) {
      const verdict = judgeTurnTail(activeTail(errorEnd(10, failure)))
      expect(verdict, name).toMatchObject({ kind: 'refuse' })
    }
  })

  it('settles safe endings and refuses lifecycle closers and unknown reasons', () => {
    expect(judgeTurnTail(activeTail(event('turn/end', 10, { turn: 1, reason: { kind: 'completed' } }))))
      .toMatchObject({ kind: 'settled', detail: 'completed' })
    expect(judgeTurnTail(activeTail(event('turn/end', 10, { turn: 1, reason: { kind: 'aborted', reason: { kind: 'user' } } }))))
      .toMatchObject({ kind: 'settled', detail: 'aborted' })
    expect(judgeTurnTail(activeTail(event('turn/end', 10, { turn: 1, reason: { kind: 'blocked' } }))))
      .toMatchObject({ kind: 'settled', detail: 'blocked' })
    expect(judgeTurnTail(activeTail(event('turn/end', 10, { turn: 1, reason: { kind: 'forked' } }))))
      .toMatchObject({ kind: 'refuse', detail: 'forked' })
    expect(judgeTurnTail(activeTail(event('turn/end', 10, { turn: 1, reason: { kind: 'orphaned' } }))))
      .toMatchObject({ kind: 'refuse', detail: 'orphaned' })
    expect(judgeTurnTail(activeTail(event('turn/end', 10, { turn: 1, reason: { kind: 'cron-parked' } }))))
      .toMatchObject({ kind: 'refuse', detail: 'unknown reason cron-parked' })
  })

  it('never continues a turn that carried no input and no activity', () => {
    // A turn/start closed with nothing under it: whatever the reason says,
    // there is nothing to continue.
    expect(judgeTurnTail(emptyTail(event('turn/end', 10, { turn: 1, reason: { kind: 'max-tokens' } }))))
      .toMatchObject({ kind: 'refuse' })
    expect(judgeTurnTail(emptyTail(errorEnd(10, { message: 'died', code: 'TRANSPORT' }))))
      .toMatchObject({ kind: 'refuse' })
  })

  it('keeps judging a turn whose content sits below the window boundary', () => {
    // The event window is paged: when its oldest boundary falls inside the
    // turn, the tail slice holds the closer alone. That is not an empty turn
    // — the content is below the page — so the normal verdict applies.
    const turnEnd = event('turn/end', 10, { turn: 1, reason: { kind: 'max-tokens' } })
    expect(judgeTurnTail({ turnEnd, turnEvents: [turnEnd] })).toMatchObject({ kind: 'continue' })
  })

  it('counts a developer (injected) message as turn activity', () => {
    const turnEnd = event('turn/end', 10, { turn: 1, reason: { kind: 'max-tokens' } })
    const verdict = judgeTurnTail({
      turnEnd,
      turnEvents: [event('turn/start', 7, { turn: 1 }), event('developer/message', 8, { message: {} }), turnEnd],
    })
    expect(verdict).toMatchObject({ kind: 'continue' })
  })

  it('survives an unreadable reason payload', () => {
    expect(judgeTurnTail({ turnEnd: event('turn/end', 10), turnEvents: [event('user/message', 9)] }))
      .toMatchObject({ kind: 'refuse' })
    expect(judgeTurnTail({ turnEnd: event('turn/end', 10, { turn: 1, reason: 'completed' }), turnEvents: [] }))
      .toMatchObject({ kind: 'settled' })
  })
})
