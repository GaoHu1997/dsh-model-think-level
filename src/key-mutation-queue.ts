/**
 * A process-wide key-mutation queue, shared by all plugin instances and HMR
 * generations. Reference allocation, credential writes and compensation must
 * not interleave merely because two apply() calls have different closures.
 * This is not a cross-process lock; external writers still need reconciliation.
 */
import { resolve } from 'node:path'
import { keyIndexFilePath } from './key-index.js'

const KEY_MUTATION_QUEUES = Symbol.for('dsh-model-think-level.key-mutation-queues')
type QueueRegistry = typeof globalThis & {
  [KEY_MUTATION_QUEUES]?: Map<string, Promise<void>>
}
const registry = globalThis as QueueRegistry
const queues = registry[KEY_MUTATION_QUEUES] ??= new Map<string, Promise<void>>()

/** Acquire one index's mutation turn; release in finally, even on failures. */
export async function acquireKeyMutation(file: string = keyIndexFilePath()): Promise<() => void> {
  const absolute = resolve(file)
  const key = process.platform === 'win32' ? absolute.toLowerCase() : absolute
  const previous = queues.get(key) ?? Promise.resolve()
  let releaseTurn: () => void = () => {}
  const turn = new Promise<void>(done => { releaseTurn = done })
  queues.set(key, turn)
  await previous
  let released = false
  return () => {
    if (released) return
    released = true
    if (queues.get(key) === turn) queues.delete(key)
    releaseTurn()
  }
}
