/**
 * The auto-continue chip's anchor cost guard.
 *
 * The chip's observer fires for every childList mutation of the composer, and
 * re-resolving the anchor ends in `getClientRects()` — a forced layout once the
 * transcript is dirty, which is exactly what typing produces. The fast path
 * exists so a single-dock page answers "nothing to do" without a layout; these
 * tests pin the condition that fast path is allowed to trust.
 */

// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { chipInPlace } from '../src/client/AutoContinueController.js'

const DOCK = '[data-composer-dock]'

const docks = (): NodeListOf<HTMLElement> => document.querySelectorAll<HTMLElement>(DOCK)

beforeEach(() => {
  document.body.innerHTML = ''
})

afterEach(() => {
  document.body.innerHTML = ''
})

describe('chipInPlace', () => {
  it('accepts a chip that already sits in the only dock', () => {
    const dock = document.createElement('div')
    dock.setAttribute('data-composer-dock', '')
    document.body.append(dock)
    const host = document.createElement('span')
    dock.append(host)

    expect(chipInPlace(host, docks())).toBe(true)
  })

  it('defers to the slow path when several docks are on the page', () => {
    const first = document.createElement('div')
    first.setAttribute('data-composer-dock', '')
    const second = document.createElement('div')
    second.setAttribute('data-composer-dock', '')
    document.body.append(first, second)
    const host = document.createElement('span')
    first.append(host)

    expect(chipInPlace(host, docks())).toBe(false)
  })

  it('defers when the chip is not a direct child of the dock', () => {
    const dock = document.createElement('div')
    dock.setAttribute('data-composer-dock', '')
    document.body.append(dock)
    const line = document.createElement('div')
    dock.append(line)
    const host = document.createElement('span')
    line.append(host)

    expect(chipInPlace(host, docks())).toBe(false)
  })

  it('defers when the chip was detached or never mounted', () => {
    const dock = document.createElement('div')
    dock.setAttribute('data-composer-dock', '')
    document.body.append(dock)
    const host = document.createElement('span')
    host.remove()

    expect(chipInPlace(host, docks())).toBe(false)
    expect(chipInPlace(undefined, docks())).toBe(false)
  })

  it('defers when the dock is missing entirely', () => {
    const host = document.createElement('span')

    expect(chipInPlace(host, docks())).toBe(false)
  })
})
