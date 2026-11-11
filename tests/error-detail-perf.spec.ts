/**
 * The failure-detail seat's cost guards.
 *
 * The seat observes `document.body` so a transcript re-render cannot drop its
 * buttons. That observer fires on EVERY keystroke in the composer, so the
 * decoration pass must be free whenever there is no durable failure to pair a
 * row with — otherwise each keypress buys a full-document walk. These tests
 * pin that behaviour: the scan happens when a failure exists, and not before.
 */

// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createErrorDetail, type ErrorDetail, type ErrorDetailContext } from '../src/client/injection/error-detail.js'

const ROW_SELECTOR = '[class*="turnErrorRow"]'
const BUTTON_ATTR = 'data-bre-error-detail'

interface FakeSource {
  getSnapshot(): { entries: unknown[] }
  subscribe(listener: () => void): () => void
  emit(): void
  push(entry: unknown): void
}

function makeSource(entries: unknown[] = []): FakeSource {
  const listeners = new Set<() => void>()
  return {
    getSnapshot: () => ({ entries }),
    subscribe: (listener) => {
      listeners.add(listener)
      return () => { listeners.delete(listener) }
    },
    emit: () => { for (const listener of [...listeners]) listener() },
    push: (entry) => { entries.push(entry); for (const listener of [...listeners]) listener() },
  }
}

function makeContext(source: FakeSource): ErrorDetailContext {
  const sessions = {
    list: { getSnapshot: () => ({ current: 's1' }) },
    binding: () => ({ sessionId: 's1', eventSource: source }),
  }
  return { get: (name: string) => (name === 'sessions' ? sessions : undefined) }
}

function officialRow(): HTMLElement {
  const row = document.createElement('div')
  row.className = 'turnErrorRow turnErrorRow-wrapped'
  row.innerHTML = '<code class="turnErrorCode">AUTH</code><span class="turnErrorMessage">API 密钥无效</span>'
  document.body.append(row)
  return row
}

const failureEntry = {
  type: 'event',
  event: {
    type: 'turn/end',
    seq: 7,
    data: { reason: { kind: 'error', error: { message: '401: {"message":"bad key","code":"INVALID_API_KEY"}', code: 'AUTH' } } },
  },
}

let seat: ErrorDetail | undefined

beforeEach(() => {
  vi.useFakeTimers()
  document.body.innerHTML = ''
})

afterEach(() => {
  seat?.dispose()
  seat = undefined
  vi.useRealTimers()
  vi.restoreAllMocks()
})

describe('failure-detail seat cost guards', () => {
  it('does not walk the document on a keystroke while no failure is known', async () => {
    officialRow()
    const source = makeSource()
    const calls: string[] = []
    const original = Document.prototype.querySelectorAll
    vi.spyOn(Document.prototype, 'querySelectorAll').mockImplementation(function (this: Document, selector: string) {
      calls.push(selector)
      return original.call(this, selector)
    } as typeof Document.prototype.querySelectorAll)

    seat = createErrorDetail({ ctx: makeContext(source), t: (key: string) => key })
    // Boot pass plus the observer-driven pass, exactly what typing produces.
    document.body.append(document.createElement('div'))
    await vi.advanceTimersByTimeAsync(400)
    document.body.append(document.createElement('div'))
    await vi.advanceTimersByTimeAsync(400)

    expect(calls.filter((selector) => selector === ROW_SELECTOR)).toEqual([])
  })

  it('decorates the row once a failure arrives, and still sweeps after that', async () => {
    const row = officialRow()
    const source = makeSource()
    seat = createErrorDetail({ ctx: makeContext(source), t: (key: string) => key })

    source.push(failureEntry)
    await vi.advanceTimersByTimeAsync(200)

    const button = row.querySelector<HTMLButtonElement>(`:scope > [class*="turnErrorMessage"] > button[${BUTTON_ATTR}]`)
      ?? row.querySelector<HTMLButtonElement>(`button[${BUTTON_ATTR}]`)
    expect(button).not.toBeNull()
    expect(button?.textContent).toBe('errorDetailButton')
  })

  it('stops decorating after dispose and removes its buttons', () => {
    const row = officialRow()
    const source = makeSource([failureEntry])
    seat = createErrorDetail({ ctx: makeContext(source), t: (key: string) => key })
    expect(row.querySelector(`[${BUTTON_ATTR}]`)).not.toBeNull()

    seat.dispose()
    seat = undefined
    expect(document.querySelector(`[${BUTTON_ATTR}]`)).toBeNull()
  })
})
