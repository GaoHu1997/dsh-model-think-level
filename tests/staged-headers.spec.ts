/**
 * The session ledger that holds the create-provider card's request headers
 * until the provider they belong to exists.
 *
 * The point of every test here is the same question from a different angle:
 * whose headers may this write touch, and when? The create card's 高级配置 pane
 * edits a route the document does not declare yet, so the draft waits — and the
 * waiting has to be bounded, because a pane's unmount cannot tell "the create
 * landed" from "the user gave up".
 *
 * What the drain goes on is the baseline: whether the route was already declared
 * when this card staged its draft, asked one keystroke into the id field. A route
 * that was not, and now is, was declared BY THE CARD, so the draft lands on that
 * very scan — the header the user typed must not be lost to the card closing
 * first. A route that already was is somebody else's provider, and gets nothing.
 */

import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  RELEASE_GRACE_MS,
  createStagedHeadersState,
  flushStagedRequestHeaders,
  markRouteBaseline,
  needsRouteBaseline,
  releaseRequestHeaders,
  stageRequestHeaders,
  withdrawRequestHeaders,
  type StagedHeadersState,
} from '../src/client/injection/staged-headers.js'
import type { RemoteApi } from '../src/client/types.js'

/** One `set` the ledger performed. */
interface SettingsWrite {
  path: unknown[]
  value: Record<string, string>
}

/** The settings Remote the ledger reads and writes through. */
interface SettingsFake {
  /** Routes the raw layers declare. A test adds to this the way the card's own
   * 保存 does: between two scans. */
  declared: Set<string>
  /** When set, every describe answers this run of declared routes instead
   * (shifted once per describe, falling back to `declared` when exhausted), so
   * a test can make the document change between the drain's own read and the
   * read inside the write. */
  queue: string[][] | undefined
  writable: boolean
  /** When set, mutate answers with this error code instead of writing. */
  refuse: string | undefined
  /** When set, describe throws instead of answering. */
  broken: boolean
  writes: SettingsWrite[]
  describes: number
  api: RemoteApi
}

interface SettingsFakeOptions {
  declared?: string[]
  queue?: string[][]
  writable?: boolean
  refuse?: string
  broken?: boolean
}

function settingsFake(options: SettingsFakeOptions = {}): SettingsFake {
  const fake: SettingsFake = {
    declared: new Set(options.declared ?? []),
    queue: options.queue === undefined ? undefined : options.queue.map(routes => [...routes]),
    writable: options.writable !== false,
    refuse: options.refuse,
    broken: options.broken === true,
    writes: [],
    describes: 0,
    api: undefined as unknown as RemoteApi,
  }
  const layers = (): Record<string, unknown> => {
    const providers: Record<string, unknown> = {}
    for (const route of fake.declared) providers[route] = { baseURL: 'https://example.test' }
    return providers
  }
  fake.api = {
    settings: {
      describe: async () => {
        fake.describes += 1
        if (fake.broken) throw new Error('the settings document is unreachable')
        const planned = fake.queue !== undefined && fake.queue.length > 0 ? fake.queue.shift() ?? [] : undefined
        if (planned !== undefined) fake.declared = new Set(planned)
        const providers = layers()
        return {
          ok: true,
          value: {
            namespaces: [
              { ns: 'llm-pi-ai', revision: fake.describes, value: { providers }, user: { providers }, base: {} },
            ],
            writable: fake.writable,
          },
        }
      },
      mutate: async (_ns: string, ops: unknown[]) => {
        if (fake.refuse !== undefined) return { ok: false, error: { code: fake.refuse, message: 'refused' } }
        for (const op of ops as SettingsWrite[]) fake.writes.push({ path: op.path, value: op.value })
        return { ok: true, value: { revision: fake.describes + 1 } }
      },
    },
  } as unknown as RemoteApi
  return fake
}

/** A clock the tests own: the grace window is measured against `Date.now`. */
function clockAt(start: number): { advance: (ms: number) => void } {
  let now = start
  vi.spyOn(Date, 'now').mockImplementation(() => now)
  return {
    advance: (ms: number): void => {
      now += ms
    },
  }
}

/**
 * A ledger holding one draft per entry, each already answered for the way the
 * pane answers it: `declaredBefore` says whether the id named a provider that
 * existed at the moment the draft was staged (false — the card's own route — by
 * default).
 */
function ledger(
  entries: Record<string, Record<string, string>> = {},
  options: { declaredBefore?: boolean } = {},
): StagedHeadersState {
  const state = createStagedHeadersState()
  for (const [route, headers] of Object.entries(entries)) {
    markRouteBaseline(state, route, options.declaredBefore === true)
    stageRequestHeaders(state, route, headers)
  }
  return state
}

const HEADERS = { 'X-Tenant': 'acme' }

afterEach(() => {
  vi.restoreAllMocks()
})

describe('stage', () => {
  it('holds a draft under the route the id field reads', () => {
    const state = ledger()

    stageRequestHeaders(state, 'my-api', HEADERS)

    expect(state.intents.get('my-api')?.headers).toEqual(HEADERS)
    // A copy: a later edit of the pane's own draft object must not rewrite what
    // the session is holding.
    expect(state.intents.get('my-api')?.headers).not.toBe(HEADERS)
  })

  it('ignores a report with no route to hang on', () => {
    const state = ledger()

    stageRequestHeaders(state, '', HEADERS)

    expect(state.intents.size).toBe(0)
  })

  it('withdraws a blank draft rather than arming a write that changes nothing', () => {
    const state = ledger({ 'my-api': HEADERS })

    // The pane's first report on a card the user cleared: "no headers" is the
    // state the route is already in when the card creates it.
    stageRequestHeaders(state, 'my-api', {})

    expect(state.intents.size).toBe(0)
  })

  it('drops the draft the pane rewrote to nothing or cancelled', () => {
    const state = ledger({ 'my-api': HEADERS })

    withdrawRequestHeaders(state, 'my-api')

    expect(state.intents.size).toBe(0)
  })
})

describe('baseline', () => {
  it('marks a draft that was staged before its answer arrived', () => {
    const state = createStagedHeadersState()
    stageRequestHeaders(state, 'my-api', HEADERS)

    // Nobody has looked yet, and the drain may not guess.
    expect(state.intents.get('my-api')?.declaredBefore).toBeUndefined()

    markRouteBaseline(state, 'my-api', false)

    expect(state.intents.get('my-api')?.declaredBefore).toBe(false)
  })

  it('asks once per route and remembers the answer for a restaged draft', () => {
    const state = createStagedHeadersState()

    expect(needsRouteBaseline(state, 'my-api')).toBe(true)
    // Nothing to ask about without an id, and nothing to read for one.
    expect(needsRouteBaseline(state, '')).toBe(false)

    markRouteBaseline(state, 'my-api', false)
    expect(needsRouteBaseline(state, 'my-api')).toBe(false)

    // The drain retiring an intent, or the pane withdrawing it, does not make
    // the session ask again: the route is the same route.
    withdrawRequestHeaders(state, 'my-api')
    stageRequestHeaders(state, 'my-api', HEADERS)

    expect(state.intents.get('my-api')?.declaredBefore).toBe(false)
  })

  it('records nothing for an empty route', () => {
    const state = createStagedHeadersState()

    markRouteBaseline(state, '', true)

    expect(state.baseline.size).toBe(0)
  })
})

describe('flush', () => {
  it('writes a released draft the moment the card declares its route, and forgets it', async () => {
    const fake = settingsFake()
    const state = ledger({ 'my-api': HEADERS })
    releaseRequestHeaders(state, 'my-api')

    // Nothing declares the id yet: the card is still open and unsaved.
    await flushStagedRequestHeaders(state, fake.api)
    expect(fake.writes).toHaveLength(0)
    expect(state.intents.size).toBe(1)

    // The card's own 保存 lands, and the next scan sees it.
    fake.declared.add('my-api')
    await flushStagedRequestHeaders(state, fake.api)

    expect(fake.writes).toEqual([{ path: ['providers', 'my-api', 'headers'], value: HEADERS }])
    expect(state.intents.size).toBe(0)
  })

  it('writes a draft whose route appears while the card is still open', async () => {
    // The bug this pins: the card's 保存 declares the provider while its own
    // 高级配置 pane is still mounted, so the draft must land on the first scan
    // that sees the declaration — waiting for the card to close loses it.
    const fake = settingsFake()
    const state = ledger({ 'my-api': HEADERS })

    await flushStagedRequestHeaders(state, fake.api)
    expect(fake.writes).toHaveLength(0)

    fake.declared.add('my-api')
    await flushStagedRequestHeaders(state, fake.api)

    expect(fake.writes).toEqual([{ path: ['providers', 'my-api', 'headers'], value: HEADERS }])
    expect(state.intents.size).toBe(0)
  })

  it('writes nothing while nobody has said whether the id existed before', async () => {
    const fake = settingsFake({ declared: ['my-api'] })
    const state = createStagedHeadersState()
    stageRequestHeaders(state, 'my-api', HEADERS)

    // Declared already, but the pane's own read has not answered yet: the drain
    // cannot tell this provider from one the card has just created, so it waits.
    await flushStagedRequestHeaders(state, fake.api)
    expect(fake.writes).toHaveLength(0)
    expect(state.intents.size).toBe(1)

    // This card's own route, the read says — so the declaration the drain sees
    // next is the card's, and the draft is its to write.
    markRouteBaseline(state, 'my-api', false)
    await flushStagedRequestHeaders(state, fake.api)

    expect(fake.writes).toEqual([{ path: ['providers', 'my-api', 'headers'], value: HEADERS }])
  })

  it('leaves a route that already existed alone, because those headers are not this card’s', async () => {
    const fake = settingsFake({ declared: ['my-api'] })
    const state = ledger({ 'my-api': HEADERS }, { declaredBefore: true })

    await flushStagedRequestHeaders(state, fake.api)

    // The user typed the id of a provider that exists: the draft is nobody's to
    // write, and the card's own 保存 can only fail on the duplicate.
    expect(fake.writes).toHaveLength(0)
    expect(state.intents.size).toBe(0)
  })

  it('leaves a released route that already existed alone too', async () => {
    // The same id, abandoned: the grace window is for a create that is still
    // coming, not for a provider that was there before the card was opened.
    const clock = clockAt(1_000)
    const fake = settingsFake({ declared: ['my-api'] })
    const state = ledger({ 'my-api': HEADERS }, { declaredBefore: true })
    releaseRequestHeaders(state, 'my-api')

    clock.advance(RELEASE_GRACE_MS + 1)
    await flushStagedRequestHeaders(state, fake.api)

    expect(fake.writes).toHaveLength(0)
    expect(state.intents.size).toBe(0)
  })

  it('keeps waiting when the write itself says the route is not there yet', async () => {
    // Declared by the drain's own read, gone by the write's read: the create
    // landed and was deleted in between. The draft is not a refusal.
    const fake = settingsFake({ queue: [['my-api'], []] })
    const state = ledger({ 'my-api': HEADERS })
    releaseRequestHeaders(state, 'my-api')

    await flushStagedRequestHeaders(state, fake.api)

    expect(fake.writes).toHaveLength(0)
    expect(state.intents.size).toBe(1)
  })

  it('retires a cancelled card’s draft instead of leaving it for a later provider', async () => {
    const clock = clockAt(1_000)
    const fake = settingsFake()
    const state = ledger({ 'my-api': HEADERS })
    releaseRequestHeaders(state, 'my-api')

    clock.advance(RELEASE_GRACE_MS)
    await flushStagedRequestHeaders(state, fake.api)
    // Still inside the window: the card's 保存 may simply not have been read yet.
    expect(state.intents.size).toBe(1)

    clock.advance(1)
    await flushStagedRequestHeaders(state, fake.api)

    // Past it, the card is not coming back — and if the id is typed again for a
    // different provider, that provider must not inherit these headers.
    expect(state.intents.size).toBe(0)
    expect(fake.writes).toHaveLength(0)
  })

  it('does not restart the grace window when a late report rewrites the draft', async () => {
    const clock = clockAt(1_000)
    const fake = settingsFake()
    const state = ledger({ 'my-api': HEADERS })
    releaseRequestHeaders(state, 'my-api')

    clock.advance(RELEASE_GRACE_MS - 1)
    // A report from the root that is unmounting right now.
    stageRequestHeaders(state, 'my-api', { 'X-Tenant': 'other' })

    clock.advance(2)
    await flushStagedRequestHeaders(state, fake.api)

    expect(state.intents.size).toBe(0)
    expect(fake.writes).toHaveLength(0)
  })

  it('writes through a mirror that has not caught up with the card’s own save', async () => {
    // The declaration the create card committed is in the document before the
    // page's cached view of it folds in — and waiting for the mirror to agree is
    // exactly how the header the user typed got lost: the drain would read a
    // stale snapshot, keep the draft, and retire it at the grace window. A
    // cached "not declared" is therefore never final; the document itself is
    // asked before the draft is told to keep waiting.
    const fake = settingsFake({ queue: [[], ['my-api']] })
    const state = ledger({ 'my-api': HEADERS })
    releaseRequestHeaders(state, 'my-api')

    await flushStagedRequestHeaders(state, fake.api)

    expect(fake.writes).toEqual([{ path: ['providers', 'my-api', 'headers'], value: HEADERS }])
    expect(state.intents.size).toBe(0)
    expect(await flushStagedRequestHeaders(state, fake.api)).toBe(0)
  })

  it('re-asks the document when the write’s own read is the stale one', async () => {
    // The same lag seen from the write's side: the drain's snapshot knew the
    // route, the read inside writeProviderHeaders did not. A mirror-only refusal
    // would strand the first save of a provider that exists.
    const fake = settingsFake({ queue: [['my-api'], [], ['my-api']] })
    const state = ledger({ 'my-api': HEADERS })
    releaseRequestHeaders(state, 'my-api')

    await flushStagedRequestHeaders(state, fake.api)

    expect(fake.writes).toEqual([{ path: ['providers', 'my-api', 'headers'], value: HEADERS }])
    expect(state.intents.size).toBe(0)
  })

  it('drops a draft the settings seam refuses and says which refusal it was', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {})
    const fake = settingsFake({ writable: false, declared: ['my-api'] })
    const state = ledger({ 'my-api': HEADERS })
    releaseRequestHeaders(state, 'my-api')

    await flushStagedRequestHeaders(state, fake.api)

    expect(fake.writes).toHaveLength(0)
    expect(state.intents.size).toBe(0)
    expect(error).toHaveBeenCalledWith(
      '[bre] deferred request headers: the write was refused:',
      'read-only',
      'my-api',
    )
  })

  it('keeps every held draft when the settings document cannot be read', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {})
    const fake = settingsFake({ broken: true })
    const state = ledger({ 'my-api': HEADERS })
    releaseRequestHeaders(state, 'my-api')

    await flushStagedRequestHeaders(state, fake.api)

    expect(state.intents.size).toBe(1)
    expect(state.flushing).toBe(false)
    expect(error).toHaveBeenCalledWith(
      '[bre] deferred request headers: could not read the settings document:',
      expect.any(Error),
    )
  })

  it('never walks the ledger twice at once', async () => {
    const fake = settingsFake({ declared: ['my-api'] })
    const state = ledger({ 'my-api': HEADERS })
    releaseRequestHeaders(state, 'my-api')
    // A drain in flight (an unmount's release racing the scan's).
    state.flushing = true

    await flushStagedRequestHeaders(state, fake.api)

    expect(fake.describes).toBe(0)
    expect(fake.writes).toHaveLength(0)
    expect(state.intents.size).toBe(1)
  })

  it('reads nothing at all when the session holds nothing', async () => {
    const fake = settingsFake()
    const state = ledger()

    await flushStagedRequestHeaders(state, fake.api)

    expect(fake.describes).toBe(0)
  })
})
