/**
 * The session ledger that holds the create-provider card's API keys until the
 * provider they belong to exists — the key-list twin of `staged-headers.spec`.
 *
 * Same question from a different angle: whose keys may the drain write, and
 * when? The baseline decides (an id that named an existing provider gets
 * nothing), the grace window bounds the wait, and — the part unique to keys —
 * a drain that fails half-way RESUMES: the drafts already stored keep their
 * host references, and only the rest are written again. The draft client is
 * here too: the create card's list runs on it, so its answers are the shape
 * the drain will one day be fed from.
 */

import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  RELEASE_GRACE_MS,
  beginKeysRouteBaseline,
  createDraftKeyClient,
  createStagedKeysState,
  failKeysRouteBaseline,
  flushStagedKeys,
  markKeysRouteBaseline,
  needsKeysRouteBaseline,
  releaseKeys,
  stageKeys,
  withdrawKeys,
  type DraftKeyStore,
  type StagedKeyDraft,
  type StagedKeysState,
} from '../src/client/injection/staged-keys.js'
import type { KeyManagerClient, KeyState } from '../src/client/key-manager-client.js'
import type { RemoteApi } from '../src/client/types.js'

const COPY: Record<string, string> = {
  keysAddIllegal: 'A key is printable ASCII without spaces.',
  keysLastEnabledOff: 'The last enabled key cannot be switched off.',
}

const t = (key: string, params?: Record<string, string | number>): string => {
  const text = COPY[key] ?? key
  if (params === undefined) return text
  return Object.entries(params).reduce((carried, [name, value]) => carried.replace(`{${name}}`, String(value)), text)
}

/** The settings Remote the drain's baseline reads ride. */
interface SettingsFake {
  /** Routes the raw layers declare; a test adds to this the way the card's own
   * 保存 does: between two scans. */
  declared: Set<string>
  /** When set, each describe answers (and shifts) one run of routes instead. */
  queue: string[][] | undefined
  broken: boolean
  describes: number
  api: RemoteApi
}

function settingsFake(options: { declared?: string[]; queue?: string[][]; broken?: boolean } = {}): SettingsFake {
  const fake: SettingsFake = {
    declared: new Set(options.declared ?? []),
    queue: options.queue === undefined ? undefined : options.queue.map(routes => [...routes]),
    broken: options.broken === true,
    describes: 0,
    api: undefined as unknown as RemoteApi,
  }
  fake.api = {
    settings: {
      describe: async () => {
        fake.describes += 1
        if (fake.broken) throw new Error('the settings document is unreachable')
        const planned = fake.queue !== undefined && fake.queue.length > 0 ? fake.queue.shift() ?? [] : undefined
        if (planned !== undefined) fake.declared = new Set(planned)
        const providers: Record<string, unknown> = {}
        for (const route of fake.declared) providers[route] = { baseURL: 'https://example.test' }
        return {
          ok: true,
          value: {
            namespaces: [
              { ns: 'llm-pi-ai', revision: fake.describes, value: { providers }, user: { providers }, base: {} },
            ],
            writable: true,
          },
        }
      },
    },
  } as unknown as RemoteApi
  return fake
}

/** One call the key transport received. */
interface Call {
  op: string
  args: unknown[]
}

/** The key transport the drain writes through: records every call, mints a new
 * host reference per add (the way the host's own add does), and can be told to
 * refuse specific values. */
function keysFake(script: {
  refuseValue?: () => string | undefined
  initialRefs?: Readonly<Record<string, readonly string[]>>
  disabledRefs?: readonly string[]
  reuseRefs?: readonly string[]
  beforeAdd?: () => Promise<void>
} = {}): {
  client: KeyManagerClient
  calls: Call[]
} {
  const calls: Call[] = []
  const listed = new Map(Object.entries(script.initialRefs ?? {}).map(([route, refs]) => [route, [...refs]]))
  let addCount = 0
  const stateOf = (route: string): KeyState => ({
    ok: true,
    route,
    entries: (listed.get(route) ?? []).map(ref => ({
      ref,
      enabled: !script.disabledRefs?.includes(ref),
      configured: true,
      masked: 'sk-x...9z',
    })),
    endpoints: { openai: null, anthropic: null },
  })
  const client: KeyManagerClient = {
    list: async route => stateOf(route),
    add: async (route, value, alias) => {
      await script.beforeAdd?.()
      const refusing = script.refuseValue?.()
      if (refusing === value) return { ok: false, error: 'the store refused' }
      // Only landed adds are recorded, so a call list is exactly what the host
      // accepted — the drain's own retries of a refused add stay visible in the
      // intent's attempts instead.
      calls.push({ op: 'add', args: [route, value, alias] })
      const refs = listed.get(route) ?? []
      const addedRef = script.reuseRefs?.[addCount] ?? `${route.toUpperCase()}_KEY_${refs.length + 1}`
      addCount += 1
      if (!refs.includes(addedRef)) refs.push(addedRef)
      listed.set(route, refs)
      return { ...stateOf(route), addedRef }
    },
    rename: async (route, ref, alias) => {
      calls.push({ op: 'rename', args: [route, ref, alias] })
      return stateOf(route)
    },
    replace: async (route, ref, value) => {
      calls.push({ op: 'replace', args: [route, ref, value] })
      return stateOf(route)
    },
    remove: async route => stateOf(route),
    setScope: async route => stateOf(route),
    setEnabled: async (route, ref, enabled) => {
      calls.push({ op: 'setEnabled', args: [route, ref, enabled] })
      return stateOf(route)
    },
    setProtocol: async (route, ref, protocol) => {
      calls.push({ op: 'setProtocol', args: [route, ref, protocol] })
      return stateOf(route)
    },
    setEndpoints: async route => stateOf(route),
    probe: async route => stateOf(route),
    reveal: async () => undefined,
  }
  return { client, calls }
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

let draftCount = 0

/** One draft, with a fresh row identity by default. */
function draft(over: Partial<StagedKeyDraft> = {}): StagedKeyDraft {
  draftCount += 1
  return { ref: `key-${draftCount}`, value: 'sk-live-value-0001', enabled: true, ...over }
}

/**
 * A ledger holding drafts per route, each already answered for the way the
 * pane answers it (`declaredBefore: false` — the card's own route — by default).
 */
function ledger(
  entries: Record<string, readonly StagedKeyDraft[]> = {},
  options: { declaredBefore?: boolean } = {},
): StagedKeysState {
  const state = createStagedKeysState()
  for (const [route, drafts] of Object.entries(entries)) {
    markKeysRouteBaseline(state, route, options.declaredBefore === true)
    stageKeys(state, route, drafts)
  }
  return state
}

/** Only the `add` calls, as (route, value, alias) triples. */
function addsOf(calls: readonly Call[]): unknown[][] {
  return calls.filter(call => call.op === 'add').map(call => call.args)
}

afterEach(() => {
  vi.restoreAllMocks()
})

describe('stage', () => {
  it('holds drafts under the route the id field reads', () => {
    const state = ledger()
    const drafts = [draft()]

    stageKeys(state, 'my-api', drafts)

    expect(state.intents.get('my-api')?.drafts).toEqual(drafts)
    // A copy: a later edit of the pane's own array must not rewrite what the
    // session is holding.
    expect(state.intents.get('my-api')?.drafts).not.toBe(drafts)
  })

  it('ignores a change with no route to hang on', () => {
    const state = ledger()

    stageKeys(state, '', [draft()])

    expect(state.intents.size).toBe(0)
  })

  it('withdraws an emptied list rather than arming a write that changes nothing', () => {
    const state = ledger({ 'my-api': [draft()] })

    stageKeys(state, 'my-api', [])

    expect(state.intents.size).toBe(0)
  })

  it('drops the list the pane cancelled', () => {
    const state = ledger({ 'my-api': [draft()] })

    withdrawKeys(state, 'my-api')

    expect(state.intents.size).toBe(0)
  })
})

describe('baseline', () => {
  it('marks a list that was staged before its answer arrived', () => {
    const state = createStagedKeysState()
    stageKeys(state, 'my-api', [draft()])

    expect(state.intents.get('my-api')?.declaredBefore).toBeUndefined()

    markKeysRouteBaseline(state, 'my-api', false)

    expect(state.intents.get('my-api')?.declaredBefore).toBe(false)
  })

  it('asks once per route and remembers the answer for a restaged list', () => {
    const state = createStagedKeysState()

    expect(needsKeysRouteBaseline(state, 'my-api')).toBe(true)
    expect(needsKeysRouteBaseline(state, '')).toBe(false)

    markKeysRouteBaseline(state, 'my-api', false)
    expect(needsKeysRouteBaseline(state, 'my-api')).toBe(false)

    withdrawKeys(state, 'my-api')
    stageKeys(state, 'my-api', [draft()])

    expect(state.intents.get('my-api')?.declaredBefore).toBe(false)
  })

  it('records nothing for an empty route', () => {
    const state = createStagedKeysState()

    markKeysRouteBaseline(state, '', true)

    expect(state.baseline.size).toBe(0)
  })
})

describe('the draft client', () => {
  /** A client over a fresh store, recording how often it reported a change. */
  function pane(): { store: DraftKeyStore; client: KeyManagerClient; changes: () => number } {
    const store: DraftKeyStore = { drafts: [] }
    let reported = 0
    const client = createDraftKeyClient(store, {
      t,
      onChange: () => {
        reported += 1
      },
    })
    return { store, client, changes: () => reported }
  }

  /** The one row identity a freshly-seeded store holds. */
  async function onlyRef(client: KeyManagerClient, route: string): Promise<string> {
    const answer = await client.list(route)
    if (!answer.ok) throw new Error('the draft client refused its own list')
    return answer.entries[0]!.ref
  }

  it('answers an empty list first, and a masked row after an add', async () => {
    const { store, client, changes } = pane()

    const empty = await client.list('my-api')
    expect(empty.ok && empty.entries).toHaveLength(0)

    const answer = await client.add('my-api', 'sk-very-long-secret-1', undefined)
    if (!answer.ok) throw new Error('the draft client refused a valid key')
    expect(answer.entries).toHaveLength(1)
    expect(answer.addedRef).toBe(answer.entries[0]?.ref)
    // The mask is the head-and-tail form the host uses — the row a user sees
    // before the create is the row they will see after it.
    expect(answer.entries[0]?.masked).toBe('sk-v...et-1')
    expect(answer.entries[0]?.enabled).toBe(true)
    expect(store.drafts).toHaveLength(1)
    expect(changes()).toBe(1)
  })

  it('reports the whole list after every change', async () => {
    const { client } = pane()

    await client.add('my-api', 'sk-very-long-secret-1', undefined)
    await client.add('my-api', 'sk-very-long-secret-2', 'Team')

    const answer = await client.list('my-api')
    expect(answer.ok && answer.entries.map(entry => entry.alias)).toEqual([undefined, 'Team'])
  })

  it('refuses an illegal value with the copy the form itself uses', async () => {
    const { client } = pane()

    const answer = await client.add('my-api', 'has space', undefined)

    expect(answer).toEqual({ ok: false, error: COPY.keysAddIllegal })
  })

  it('clears a label and a protocol pin when undefined arrives', async () => {
    const { client } = pane()
    await client.add('my-api', 'sk-very-long-secret-1', 'Team')
    const ref = await onlyRef(client, 'my-api')

    await client.rename('my-api', ref, undefined)
    let answer = await client.list('my-api')
    expect(answer.ok && 'alias' in (answer.entries[0] ?? {})).toBe(false)

    await client.setProtocol('my-api', ref, 'anthropic-messages')
    answer = await client.list('my-api')
    expect(answer.ok && answer.entries[0]?.protocol).toBe('anthropic-messages')

    await client.setProtocol('my-api', ref, undefined)
    answer = await client.list('my-api')
    expect(answer.ok && 'protocol' in (answer.entries[0] ?? {})).toBe(false)
  })

  it('keeps the host’s own rule: the last enabled key stays on', async () => {
    const { client } = pane()
    await client.add('my-api', 'sk-very-long-secret-1', undefined)
    await client.add('my-api', 'sk-very-long-secret-2', undefined)
    const answer = await client.list('my-api')
    if (!answer.ok) throw new Error('the draft client refused its own list')
    const first = answer.entries[0]!.ref
    const second = answer.entries[1]!.ref

    // Two on: switching the first off is fine.
    expect((await client.setEnabled('my-api', first, false)).ok).toBe(true)

    // Now only the second is on: switching IT off is the host's own refusal.
    const refused = await client.setEnabled('my-api', second, false)
    expect(refused).toEqual({ ok: false, error: COPY.keysLastEnabledOff })
  })

  it('reveals the stored value of its own rows', async () => {
    const { client } = pane()
    await client.add('my-api', 'sk-very-long-secret-1', undefined)
    const ref = await onlyRef(client, 'my-api')

    expect(await client.reveal('my-api', ref)).toBe('sk-very-long-secret-1')
  })
})

describe('flush', () => {
  it('writes nothing while the route is not declared, then adds every draft in order', async () => {
    const fake = settingsFake()
    const keys = keysFake()
    const one = draft({ value: 'sk-first-key-0001', alias: 'Team' })
    const two = draft({ value: 'sk-second-key-002' })
    const state = ledger({ 'my-api': [one, two] })

    await flushStagedKeys(state, fake.api, keys.client)
    expect(keys.calls).toHaveLength(0)
    expect(state.intents.size).toBe(1)

    fake.declared.add('my-api')
    await flushStagedKeys(state, fake.api, keys.client)

    expect(addsOf(keys.calls)).toEqual([
      ['my-api', 'sk-first-key-0001', 'Team'],
      ['my-api', 'sk-second-key-002', undefined],
    ])
    expect(state.intents.size).toBe(0)
  })

  it('pins and switch-offs land after every value, on the reference each add minted', async () => {
    const fake = settingsFake({ declared: ['my-api'] })
    const keys = keysFake()
    const one = draft({ protocol: 'anthropic-messages' })
    const two = draft({ enabled: false })
    const state = ledger({ 'my-api': [one, two] })

    await flushStagedKeys(state, fake.api, keys.client)

    // The whole-value phase precedes the metadata phase, so a switch-off never
    // races the arrival of the key that would make it legal.
    expect(keys.calls.map(call => call.op)).toEqual(['add', 'add', 'setProtocol', 'setEnabled'])
    expect(keys.calls[2]?.args).toEqual(['my-api', 'MY-API_KEY_1', 'anthropic-messages'])
    expect(keys.calls[3]?.args).toEqual(['my-api', 'MY-API_KEY_2', false])
    expect(state.intents.size).toBe(0)
  })

  it('prefers the host-added reference over earlier entries in the returned list', async () => {
    const fake = settingsFake({ declared: ['my-api'] })
    const keys = keysFake({ initialRefs: { 'my-api': ['EXISTING'] }, reuseRefs: ['ADDED'] })
    const state = ledger({ 'my-api': [draft({ protocol: 'anthropic-messages' })] })

    await flushStagedKeys(state, fake.api, keys.client)

    expect(keys.calls.find(call => call.op === 'setProtocol')?.args)
      .toEqual(['my-api', 'ADDED', 'anthropic-messages'])
    expect(state.intents.size).toBe(0)
  })

  it('reconciles an edit made while add is still pending', async () => {
    const fake = settingsFake({ declared: ['my-api'] })
    let releaseAdd!: () => void
    let reportAddStarted!: () => void
    const addGate = new Promise<void>(resolve => { releaseAdd = resolve })
    const addStarted = new Promise<void>(resolve => { reportAddStarted = resolve })
    const keys = keysFake({
      beforeAdd: async () => {
        reportAddStarted()
        await addGate
      },
    })
    const original = draft({ value: 'sk-original-value-01' })
    const state = ledger({ 'my-api': [original] })

    const flushing = flushStagedKeys(state, fake.api, keys.client)
    await addStarted
    stageKeys(state, 'my-api', [{ ...original, value: 'sk-updated-value-02', protocol: 'anthropic-messages' }])
    releaseAdd()
    await flushing

    expect(addsOf(keys.calls)).toEqual([['my-api', 'sk-original-value-01', undefined]])
    expect(keys.calls.find(call => call.op === 'replace')?.args)
      .toEqual(['my-api', 'MY-API_KEY_1', 'sk-updated-value-02'])
    expect(keys.calls.find(call => call.op === 'setProtocol')?.args)
      .toEqual(['my-api', 'MY-API_KEY_1', 'anthropic-messages'])
    expect(state.intents.size).toBe(0)
  })

  it('stops applying stale metadata when a route is withdrawn during add', async () => {
    const fake = settingsFake({ declared: ['my-api'] })
    let releaseAdd!: () => void
    let reportAddStarted!: () => void
    const addGate = new Promise<void>(resolve => { releaseAdd = resolve })
    const addStarted = new Promise<void>(resolve => { reportAddStarted = resolve })
    const keys = keysFake({
      beforeAdd: async () => {
        reportAddStarted()
        await addGate
      },
    })
    const state = ledger({ 'my-api': [draft({ protocol: 'anthropic-messages' })] })

    const flushing = flushStagedKeys(state, fake.api, keys.client)
    await addStarted
    withdrawKeys(state, 'my-api')
    releaseAdd()
    await flushing

    expect(keys.calls.map(call => call.op)).toEqual(['add'])
    expect(state.intents.size).toBe(0)
  })

  it('resumes a drain that failed half-way without re-adding what landed', async () => {
    const fake = settingsFake({ declared: ['my-api'] })
    // Refuse the second value exactly once — a transient store refusal.
    let refusals = 0
    const keys = keysFake({
      refuseValue: () => (refusals === 0 ? 'sk-second-key-002' : undefined),
    })
    const state = ledger({ 'my-api': [draft({ value: 'sk-first-key-0001' }), draft({ value: 'sk-second-key-002' })] })

    await flushStagedKeys(state, fake.api, keys.client)
    // The first draft landed; the intent keeps waiting.
    expect(addsOf(keys.calls)).toEqual([['my-api', 'sk-first-key-0001', undefined]])
    expect(state.intents.size).toBe(1)

    refusals = 1
    await flushStagedKeys(state, fake.api, keys.client)

    // Only the refused draft is written again — the landed one is not re-added.
    expect(addsOf(keys.calls)).toEqual([
      ['my-api', 'sk-first-key-0001', undefined],
      ['my-api', 'sk-second-key-002', undefined],
    ])
    expect(state.intents.size).toBe(0)
  })

  it('gives up on a list the transport keeps refusing, and says so', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    const fake = settingsFake({ declared: ['my-api'] })
    const keys = keysFake({ refuseValue: () => 'sk-first-key-0001' })
    const state = ledger({ 'my-api': [draft({ value: 'sk-first-key-0001' })] })

    await flushStagedKeys(state, fake.api, keys.client)
    expect(state.intents.size).toBe(1)
    await flushStagedKeys(state, fake.api, keys.client)
    expect(state.intents.size).toBe(1)
    await flushStagedKeys(state, fake.api, keys.client)

    expect(state.intents.size).toBe(0)
    expect(error).toHaveBeenCalledWith(
      '[bre] deferred api keys: the write was refused; giving up on the held key list:',
      'my-api',
    )
  })

  it('does not drain while a route baseline is pending', async () => {
    const fake = settingsFake({ declared: ['my-api'] })
    const keys = keysFake()
    const state = createStagedKeysState()
    beginKeysRouteBaseline(state, 'my-api')
    stageKeys(state, 'my-api', [draft()])
    releaseKeys(state, 'my-api')

    await flushStagedKeys(state, fake.api, keys.client)

    expect(keys.calls).toHaveLength(0)
    expect(state.intents.size).toBe(1)
  })

  it('does not infer ownership from a post-save route after baseline failure', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    const fake = settingsFake({ declared: ['my-api'] })
    const keys = keysFake()
    const state = createStagedKeysState()
    beginKeysRouteBaseline(state, 'my-api')
    stageKeys(state, 'my-api', [draft()])
    failKeysRouteBaseline(state, 'my-api')
    releaseKeys(state, 'my-api')

    await flushStagedKeys(state, fake.api, keys.client)

    expect(keys.calls).toHaveLength(0)
    expect(state.intents.size).toBe(1)
    expect(error).toHaveBeenCalledWith(
      '[bre] deferred api keys: the pre-save baseline failed and this route now exists; refusing to guess ownership:',
      'my-api',
    )
  })

  it('recovers a failed baseline only when the route is still absent', async () => {
    const fake = settingsFake()
    const keys = keysFake()
    const state = createStagedKeysState()
    beginKeysRouteBaseline(state, 'my-api')
    stageKeys(state, 'my-api', [draft()])
    failKeysRouteBaseline(state, 'my-api')
    releaseKeys(state, 'my-api')

    await flushStagedKeys(state, fake.api, keys.client)

    expect(state.baseline.get('my-api')).toBe(false)
    expect(keys.calls).toHaveLength(0)
    fake.declared.add('my-api')
    await flushStagedKeys(state, fake.api, keys.client)

    expect(addsOf(keys.calls)).toHaveLength(1)
    expect(state.intents.size).toBe(0)
  })

  it('holds a list nobody has said a baseline for', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    const fake = settingsFake({ declared: ['my-api'] })
    const keys = keysFake()
    const state = createStagedKeysState()
    stageKeys(state, 'my-api', [draft()])
    releaseKeys(state, 'my-api')

    await flushStagedKeys(state, fake.api, keys.client)
    expect(keys.calls).toHaveLength(0)
    expect(state.intents.size).toBe(1)
    expect(error).toHaveBeenCalledWith(
      '[bre] deferred api keys: no pre-save baseline is available; refusing to write held keys:',
      'my-api',
    )

    markKeysRouteBaseline(state, 'my-api', false)
    await flushStagedKeys(state, fake.api, keys.client)
    expect(addsOf(keys.calls)).toHaveLength(1)
  })

  it('leaves a route that already existed alone', async () => {
    const fake = settingsFake({ declared: ['my-api'] })
    const keys = keysFake()
    const state = ledger({ 'my-api': [draft()] }, { declaredBefore: true })

    await flushStagedKeys(state, fake.api, keys.client)

    expect(keys.calls).toHaveLength(0)
    expect(state.intents.size).toBe(0)
  })

  it('retires a released list whose card never comes back', async () => {
    const clock = clockAt(1_000)
    const fake = settingsFake()
    const keys = keysFake()
    const state = ledger({ 'my-api': [draft()] })
    releaseKeys(state, 'my-api')

    clock.advance(RELEASE_GRACE_MS)
    await flushStagedKeys(state, fake.api, keys.client)
    expect(state.intents.size).toBe(1)

    clock.advance(1)
    await flushStagedKeys(state, fake.api, keys.client)

    expect(state.intents.size).toBe(0)
    expect(keys.calls).toHaveLength(0)
  })

  it('writes through a mirror that has not caught up with the card’s own save', async () => {
    const fake = settingsFake({ queue: [[], ['my-api']] })
    const keys = keysFake()
    const state = ledger({ 'my-api': [draft()] })
    releaseKeys(state, 'my-api')

    await flushStagedKeys(state, fake.api, keys.client)

    expect(addsOf(keys.calls)).toHaveLength(1)
    expect(state.intents.size).toBe(0)
  })

  it('keeps every held list when the settings document cannot be read', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    const fake = settingsFake({ broken: true })
    const keys = keysFake()
    const state = ledger({ 'my-api': [draft()] })

    await flushStagedKeys(state, fake.api, keys.client)

    expect(state.intents.size).toBe(1)
    expect(state.draining).toBe(false)
    expect(error).toHaveBeenCalledWith(
      '[bre] deferred api keys: could not read the settings document:',
      expect.any(Error),
    )
  })

  it('never walks the ledger twice at once', async () => {
    const fake = settingsFake({ declared: ['my-api'] })
    const keys = keysFake()
    const state = ledger({ 'my-api': [draft()] })
    state.draining = true

    await flushStagedKeys(state, fake.api, keys.client)

    expect(fake.describes).toBe(0)
    expect(keys.calls).toHaveLength(0)
    expect(state.intents.size).toBe(1)
  })

  it('reads nothing at all when the session holds nothing', async () => {
    const fake = settingsFake()
    const keys = keysFake()
    const state = ledger()

    await flushStagedKeys(state, fake.api, keys.client)

    expect(fake.describes).toBe(0)
  })
})
