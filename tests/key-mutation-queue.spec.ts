import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { randomUUID } from 'node:crypto'
import { describe, expect, it, vi } from 'vitest'
import { acquireKeyMutation } from '../src/key-mutation-queue.js'

function indexPath(): string {
  return join(tmpdir(), `bre-queue-${randomUUID()}`, 'key-index.json')
}

describe('process-wide key mutation queue', () => {
  it('serializes two consumers of the same index and releases idempotently', async () => {
    const file = indexPath()
    const releaseFirst = await acquireKeyMutation(file)
    let secondEntered = false
    const second = acquireKeyMutation(file).then(release => {
      secondEntered = true
      return release
    })
    await Promise.resolve()
    expect(secondEntered).toBe(false)
    releaseFirst()
    const releaseSecond = await second
    expect(secondEntered).toBe(true)
    releaseFirst()
    releaseSecond()
    releaseSecond()
    const releaseThird = await acquireKeyMutation(file)
    releaseThird()
  })

  it('does not block an independent index', async () => {
    const releaseFirst = await acquireKeyMutation(indexPath())
    const releaseOther = await acquireKeyMutation(indexPath())
    releaseOther()
    releaseFirst()
  })

  it('shares the queue across a module reload instead of reusing a credential slot', async () => {
    const file = indexPath()
    const releaseFirst = await acquireKeyMutation(file)
    vi.resetModules()
    const reloaded = await import('../src/key-mutation-queue.js')
    let entered = false
    const next = reloaded.acquireKeyMutation(file).then(release => {
      entered = true
      return release
    })
    await Promise.resolve()
    expect(entered).toBe(false)
    releaseFirst()
    const releaseNext = await next
    expect(entered).toBe(true)
    releaseNext()
  })
})
