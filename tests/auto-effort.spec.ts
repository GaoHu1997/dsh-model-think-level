/**
 * Auto-adapt request bus tests.
 *
 * The catalogue head's "adapt every model" seat (user request ⑤) cannot reach
 * the model rows itself: the rows' editors own their own auto-adapt, and the
 * seat is plain DOM outside React. So the seat publishes a document event and
 * every mounted editor answers it for its own route.
 *
 * What matters here is that the hand-off is real but bounded: an editor only
 * answers a request naming its own route, a malformed request is ignored
 * rather than thrown, and the adapts run one at a time — each one lists the
 * provider's models over the network, so a burst of them would be a burst of
 * round trips for no gain.
 */

// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { AUTO_EFFORT_EVENT, listenAutoEffort, queueAutoEffort, requestAutoEffort } from '../src/client/auto-effort.js'

/** Let every pending microtask (and the queue's own chains) settle. */
const settle = async (): Promise<void> => { await new Promise(resolve => { setTimeout(resolve, 0) }) }

afterEach(() => { vi.restoreAllMocks() })

describe('queueAutoEffort', () => {
  it('runs one request at a time, in the order they arrived', async () => {
    const order: string[] = []
    let release: (() => void) | undefined
    const gate = new Promise<void>(resolve => { release = resolve })
    queueAutoEffort(async () => {
      order.push('first:start')
      await gate
      order.push('first:end')
    })
    queueAutoEffort(() => { order.push('second') })
    await settle()
    // The second request must not have started while the first still lists.
    expect(order).toEqual(['first:start'])
    release!()
    await settle()
    expect(order).toEqual(['first:start', 'first:end', 'second'])
  })

  it('keeps going after a request fails', async () => {
    const order: string[] = []
    queueAutoEffort(() => { order.push('throws'); throw new Error('nope') })
    queueAutoEffort(() => { order.push('rejects'); return Promise.reject(new Error('nope')) })
    queueAutoEffort(() => { order.push('last') })
    await settle()
    // A rejected adapt reports itself inside its own editor; it must not strand
    // the rows queued behind it.
    expect(order).toEqual(['throws', 'rejects', 'last'])
  })

  it('does not hand the caller a promise to reject', () => {
    // The seat's click handler is the caller: a rejected promise it never
    // awaited would surface as an unhandled rejection.
    expect(queueAutoEffort(() => {})).toBeUndefined()
  })
})

describe('requestAutoEffort', () => {
  it('publishes the provider route on the document', () => {
    const seen: unknown[] = []
    const listener = (event: Event): void => { seen.push((event as CustomEvent).detail) }
    document.addEventListener(AUTO_EFFORT_EVENT, listener)
    try {
      requestAutoEffort('aliyun')
      expect(seen).toEqual([{ route: 'aliyun' }])
    } finally {
      document.removeEventListener(AUTO_EFFORT_EVENT, listener)
    }
  })

  it('answers on the target it was given', () => {
    const other = document.createElement('div')
    const seen: string[] = []
    const listener = (event: Event): void => { seen.push((event as CustomEvent<{ route: string }>).detail.route) }
    other.addEventListener(AUTO_EFFORT_EVENT, listener as EventListener)
    requestAutoEffort('aliyun', other as unknown as Document)
    expect(seen).toEqual(['aliyun'])
  })
})

describe('listenAutoEffort', () => {
  it('hands each request to the handler', () => {
    const routes: string[] = []
    const stop = listenAutoEffort(route => { routes.push(route) })
    requestAutoEffort('aliyun')
    requestAutoEffort('ofox')
    stop()
    expect(routes).toEqual(['aliyun', 'ofox'])
  })

  it('stops answering once disposed', () => {
    const routes: string[] = []
    const stop = listenAutoEffort(route => { routes.push(route) })
    stop()
    requestAutoEffort('aliyun')
    expect(routes).toEqual([])
  })

  it('ignores a request it cannot name a route from', () => {
    const routes: string[] = []
    const stop = listenAutoEffort(route => { routes.push(route) })
    // The bus is document-wide, so anything can dispatch under this name: a
    // bare Event, a detail-less event and a non-string route are all ignored
    // rather than handed on as `undefined`.
    document.dispatchEvent(new Event(AUTO_EFFORT_EVENT))
    document.dispatchEvent(new CustomEvent(AUTO_EFFORT_EVENT))
    document.dispatchEvent(new CustomEvent(AUTO_EFFORT_EVENT, { detail: { route: '' } }))
    document.dispatchEvent(new CustomEvent(AUTO_EFFORT_EVENT, { detail: { route: 42 } }))
    document.dispatchEvent(new CustomEvent(AUTO_EFFORT_EVENT, { detail: null }))
    stop()
    expect(routes).toEqual([])
  })
})
