/**
 * The generated-image card's registration and its reading of a settled result.
 *
 * The registration must NOT depend on the host's config route naming the tool:
 * the route only names a tool that already registered, so a page loaded while
 * `tools.register` was still failing would otherwise never show a card — the
 * exact silent failure this card exists to prevent. The route's answer instead
 * re-keys the entry when a dsh-image-gen install made the host rename the tool.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { clearImageConfigCache } from '../src/client/image-config-client.js'
import { imageRefsOf, registerImageCard } from '../src/client/injection/image-card.js'
import type { ClientContext } from '../src/client/types.js'

/** One `slots.register` call, as the fake registrar recorded it. */
interface Registration {
  key: string
  disposed: boolean
}

/** A slot face just wide enough for `registerFor`: `inject` runs its callback at once. */
function fakeSlots(registrations: Registration[]): unknown {
  return {
    register(options: Record<string, unknown>): () => void {
      const record: Registration = { key: String(options['key']), disposed: false }
      registrations.push(record)
      return () => { record.disposed = true }
    },
    inject(_name: string, callback: () => unknown): unknown {
      return callback()
    },
  }
}

/** A client context that runs one effect body immediately and forgets it. */
function fakeContext(slots: unknown): ClientContext {
  return {
    slots,
    effect(fn: () => unknown): unknown {
      return fn()
    },
  } as unknown as ClientContext
}

/** Run the registration and hand back what the fake slot face recorded. */
function run(slots: unknown): void {
  registerImageCard(fakeContext(slots), ((key: string) => key) as never)
}

/** Let the config read's promise chain settle. */
async function settle(): Promise<void> {
  await new Promise(resolve => setTimeout(resolve, 0))
}

/** Answer the config route with one `tool` block. */
function answerConfig(tool: unknown): void {
  vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({
    ok: true,
    models: [],
    defaultModel: null,
    defaults: { size: '1024x1024', quality: 'high', n: 1, timeoutMs: 300000 },
    outputDir: 'generated-images',
    tool,
  }), { status: 200 })) as unknown as typeof globalThis.fetch)
}

beforeEach(() => {
  clearImageConfigCache()
})

afterEach(() => {
  vi.unstubAllGlobals()
  clearImageConfigCache()
})

describe('registerImageCard', () => {
  it('registers the plain tool key before any config read answers', () => {
    // A config read that never settles: the card must not wait for it.
    vi.stubGlobal('fetch', vi.fn(() => new Promise(() => {})) as unknown as typeof globalThis.fetch)
    const registrations: Registration[] = []
    run(fakeSlots(registrations))
    expect(registrations.map(entry => entry.key)).toEqual(['generate_image'])
  })

  it('registers the plain key even when the host reports no registered tool', async () => {
    answerConfig({ registered: false, name: null })
    const registrations: Registration[] = []
    run(fakeSlots(registrations))
    await settle()
    expect(registrations.map(entry => entry.key)).toEqual(['generate_image'])
    expect(registrations[0]?.disposed).toBe(false)
  })

  it('re-keys to the name the host actually registered, disposing the plain entry', async () => {
    answerConfig({ registered: true, name: 'dsh-image-gen_generate_image' })
    const registrations: Registration[] = []
    run(fakeSlots(registrations))
    await settle()
    expect(registrations.map(entry => entry.key)).toEqual([
      'generate_image',
      'dsh-image-gen_generate_image',
    ])
    expect(registrations[0]?.disposed).toBe(true)
    expect(registrations[1]?.disposed).toBe(false)
  })

  it('does not re-register when the host reports the plain name', async () => {
    answerConfig({ registered: true, name: 'generate_image' })
    const registrations: Registration[] = []
    run(fakeSlots(registrations))
    await settle()
    expect(registrations.map(entry => entry.key)).toEqual(['generate_image'])
    expect(registrations[0]?.disposed).toBe(false)
  })

  it('keeps the plain entry when the config route cannot be read', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('offline') }) as unknown as typeof globalThis.fetch)
    const registrations: Registration[] = []
    run(fakeSlots(registrations))
    await settle()
    expect(registrations.map(entry => entry.key)).toEqual(['generate_image'])
    expect(registrations[0]?.disposed).toBe(false)
  })
})

describe('imageRefsOf', () => {
  const attachment = {
    attachmentId: 'sha256:abc',
    mediaType: 'image/png',
    bytes: 12,
    width: 4,
    height: 4,
  }

  it('reads the settled result content the host really carries', () => {
    expect(imageRefsOf({
      kind: 'tool-result',
      content: [{ type: 'text', text: '生成完成' }, { type: 'image', attachment }],
    })).toEqual([{ attachment }])
  })

  it('falls back to a legacy resultView only when content is absent', () => {
    expect(imageRefsOf({
      kind: 'tool-result',
      resultView: { content: [{ type: 'image', attachment }] },
    })).toEqual([{ attachment }])

    // content wins when both exist.
    expect(imageRefsOf({
      kind: 'tool-result',
      content: [{ type: 'text', text: '只有文字' }],
      resultView: { content: [{ type: 'image', attachment }] },
    })).toEqual([])
  })

  it('ignores image parts without an attachment id', () => {
    // A malformed record: the attachment id is what the gallery loads by.
    const broken = { mediaType: 'image/png', bytes: 1, width: 1, height: 1 } as never
    expect(imageRefsOf({
      kind: 'tool-result',
      content: [{ type: 'image', attachment: broken }],
    })).toEqual([])
  })
})
