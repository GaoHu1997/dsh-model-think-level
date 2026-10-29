/**
 * The native `generate_image` tool: registration (primary name, collision
 * fallback, dispose), the canonical value and content blocks execute builds,
 * the attachment round-trip (conversation images in as bytes, generated images
 * out as durable attachments), the signal contract, and the system-prompt hint.
 */

import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { IMAGE_TOOL_NAME, IMAGE_TOOL_NAME_FALLBACK, imageToolHint, registerGenerateImageTool, type ImageAttachmentsLike } from '../src/image/tool.js'
import { emptyImageConfig, syncImageConfig, writeImageConfig } from '../src/image/config.js'
import type { GenerateDeps } from '../src/image/generate.js'

let home = ''
let file: string

beforeEach(() => {
  home = mkdtempSync(join(tmpdir(), 'bre-image-tool-'))
  file = join(home, 'dsh-model-think-level', 'image.json')
  writeImageConfig(syncImageConfig(emptyImageConfig(), PROVIDERS), file)
})

afterEach(() => {
  rmSync(home, { recursive: true, force: true })
  vi.restoreAllMocks()
})

const PNG_B64 = Buffer.from([0x89, 0x50, 0x4e, 0x47]).toString('base64')
const PNG_BYTES = Buffer.from([0x89, 0x50, 0x4e, 0x47])

const PROVIDERS = {
  openai: {
    api: 'openai-completions',
    baseURL: 'https://api.example/v1/',
    apiKeyEnv: 'OPENAI_API_KEY',
    models: [{ id: 'gpt-image-1', name: 'GPT-Image-1', inputImageGen: true }],
  },
}

interface Captured {
  url: string
  init: RequestInit
}

/** A send answering `answers` images per call and recording the request. */
function jsonSend(captured: Captured[], answers = 1): typeof fetch {
  return (async (input: RequestInfo | URL, init?: RequestInit) => {
    captured.push({ url: String(input), init: init ?? {} })
    const data = Array.from({ length: answers }, () => ({ b64_json: PNG_B64 }))
    return new Response(JSON.stringify({ data }), { status: 200, headers: { 'content-type': 'application/json' } })
  }) as typeof fetch
}

/** The attachment store double: records saves, answers reads. */
function fakeAttachments(saved: { data: Uint8Array; mediaType: string }[] = []): ImageAttachmentsLike {
  return {
    async saveImage(input) {
      saved.push({ data: input.data, mediaType: input.mediaType })
      return { attachmentId: `att-${saved.length}`, mediaType: input.mediaType, bytes: input.data.length, width: 1, height: 1, ...(input.name === undefined ? {} : { name: input.name }) }
    },
    async readImage(ref) {
      return { data: Uint8Array.from([7, 7, 7]), ref: { name: 'chat-image.png', mediaType: 'image/png' } }
    },
  }
}

/** A fake tools registry capturing one registration and its disposer. */
function fakeTools(failNames: readonly string[] = []): { registry: Map<string, unknown>; warnings: string[]; logger: { warn(message: string): void }; ctx: Parameters<typeof registerGenerateImageTool>[0] } {
  const registry = new Map<string, unknown>()
  const warnings: string[] = []
  const logger = { warn: (message: string): void => { warnings.push(message) } }
  const registryFace = {
    register(definition: { name: string }): unknown {
      if (failNames.includes(definition.name)) throw new Error(`tool "${definition.name}" is already registered in this scope`)
      registry.set(definition.name, definition)
      return () => { registry.delete(definition.name) }
    },
  }
  return {
    registry,
    warnings,
    logger,
    /** The ctx face registerGenerateImageTool reads. */
    ctx: { tools: registryFace } as unknown as Parameters<typeof registerGenerateImageTool>[0],
  }
}

function toolDeps(overrides: Partial<Parameters<typeof registerGenerateImageTool>[1]> = {}): Parameters<typeof registerGenerateImageTool>[1] {
  return {
    generateDeps: {
      config: () => {
        const stored = JSON.parse(readFileSync(file, 'utf8')) as object
        return stored as ReturnType<typeof emptyImageConfig>
      },
      resolveKey: async () => 'sk-test-key',
      home: () => home,
      send: jsonSend([], 1),
    },
    attachments: fakeAttachments(),
    readConfig: () => {
      const stored = JSON.parse(readFileSync(file, 'utf8')) as object
      return stored as ReturnType<typeof emptyImageConfig>
    },
    ...overrides,
  }
}

describe('registerGenerateImageTool', () => {
  it('registers under the primary name and the disposer unregisters', () => {
    const fake = fakeTools()
    const { name, dispose } = registerGenerateImageTool(fake.ctx, toolDeps())
    expect(name).toBe(IMAGE_TOOL_NAME)
    expect([...fake.registry.keys()]).toEqual(['generate_image'])
    dispose()
    expect(fake.registry.size).toBe(0)
  })

  it('falls back to dsh_image_generate when the primary name is taken', () => {
    const fake = fakeTools([IMAGE_TOOL_NAME])
    const { name, dispose } = registerGenerateImageTool(fake.ctx, toolDeps({ logger: fake.logger }))
    expect(name).toBe(IMAGE_TOOL_NAME_FALLBACK)
    expect([...fake.registry.keys()]).toEqual([IMAGE_TOOL_NAME_FALLBACK])
    expect(fake.warnings[0]).toMatch(/already registered|taken|dsh_image_generate/)
    dispose()
    expect(fake.registry.size).toBe(0)
  })

  it('a foreign registration error is not swallowed by the fallback', () => {
    const registryFace = {
      register(): unknown {
        throw new Error('disk on fire')
      },
    }
    expect(() => registerGenerateImageTool(
      { tools: registryFace } as unknown as Parameters<typeof registerGenerateImageTool>[0],
      toolDeps(),
    )).toThrow(/disk on fire/)
  })

  it('the definition carries the output contract the registry requires', () => {
    const fake = fakeTools()
    registerGenerateImageTool(fake.ctx, toolDeps())
    const definition = fake.registry.get('generate_image') as {
      name: string
      description: string
      parameters: Record<string, { type: string; required?: boolean }>
      output: { schema: Record<string, unknown>; render: (args: unknown, value: unknown) => unknown[] }
      presentCall: (args: unknown) => unknown
      presentResult: (args: unknown, result: { meta?: unknown }) => unknown
    }
    expect(definition.parameters['prompt']).toMatchObject({ type: 'string', required: true })
    expect(definition.output.schema).toBeDefined()
    expect(typeof definition.output.render).toBe('function')
    expect(definition.presentCall({ prompt: 'a cat' })).toMatchObject({ card: 'generic' })
  })
})

describe('generate_image execute', () => {
  it('saves every generated image as an attachment and returns the canonical value', async () => {
    const fake = fakeTools()
    registerGenerateImageTool(fake.ctx, toolDeps())
    const definition = fake.registry.get('generate_image') as { execute: (args: unknown, exec: { signal: AbortSignal }) => Promise<Record<string, unknown>> }
    const captured: Captured[] = []
    const deps = toolDeps({
      generateDeps: {
        config: () => JSON.parse(readFileSync(file, 'utf8')) as ReturnType<typeof emptyImageConfig>,
        resolveKey: async () => 'sk-test-key',
        home: () => home,
        send: jsonSend(captured, 3),
      },
    })
    // Re-register with the multi-image send (the earlier registration's deps
    // answered one image; the value shape is the same either way).
    fake.registry.clear()
    const { name } = registerGenerateImageTool(fake.ctx, deps)
    const reRegistered = fake.registry.get(name) as typeof definition
    const value = await reRegistered.execute({ prompt: 'a row of cats', n: 3 }, { signal: new AbortController().signal })
    expect(captured[0]!.url).toBe('https://api.example/v1/images/generations')
    const images = value['images'] as { attachment: { attachmentId: string }; filePath: string }[]
    expect(images).toHaveLength(3)
    expect(images.every(image => image.attachment.attachmentId.startsWith('att-'))).toBe(true)
    expect(images.every(image => existsSync(image.filePath))).toBe(true)
    expect(value['model']).toBe('openai/gpt-image-1')
    expect(value['paramsUsed']).toMatchObject({ n: 3 })
  })

  it('render returns one text block plus one image block per image', () => {
    const fake = fakeTools()
    registerGenerateImageTool(fake.ctx, toolDeps())
    const definition = fake.registry.get('generate_image') as { output: { render: (args: unknown, value: unknown) => { type: string }[] } }
    const value = {
      images: [
        { attachment: { attachmentId: 'att-1', mediaType: 'image/png', bytes: 4, width: 1, height: 1 }, filePath: '/out/a.png' },
        { attachment: { attachmentId: 'att-2', mediaType: 'image/png', bytes: 4, width: 1, height: 1 }, filePath: '/out/b.png' },
      ],
      model: 'openai/gpt-image-1',
      prompt: 'x',
      paramsUsed: { size: '1024x1024', quality: 'high', n: 2 },
      revisions: [],
    }
    const blocks = definition.output.render({}, value)
    expect(blocks.filter(block => block.type === 'image')).toHaveLength(2)
    expect(blocks.filter(block => block.type === 'text')).toHaveLength(1)
  })

  it('presentationMeta names the plugin kind and mirrors every image', () => {
    const fake = fakeTools()
    registerGenerateImageTool(fake.ctx, toolDeps())
    const definition = fake.registry.get('generate_image') as { output: { presentationMeta: (args: unknown, value: unknown) => Record<string, unknown> } }
    const value = {
      images: [{ attachment: { attachmentId: 'att-1', mediaType: 'image/png', bytes: 4, width: 1, height: 1 }, filePath: '/out/a.png' }],
      model: 'openai/gpt-image-1',
      prompt: 'x',
      paramsUsed: { size: '1024x1024', quality: 'high', n: 1 },
      revisions: ['lowered quality'],
    }
    const meta = definition.output.presentationMeta({}, value)
    expect(meta['kind']).toBe('dsh-model-think-level-image')
    expect(meta['revisions']).toEqual(['lowered quality'])
  })

  it('presentResult builds the generic card from the meta images', () => {
    const fake = fakeTools()
    registerGenerateImageTool(fake.ctx, toolDeps())
    const definition = fake.registry.get('generate_image') as { presentResult: (args: unknown, result: { meta?: unknown }) => Record<string, unknown> | undefined }
    const card = definition.presentResult({}, {
      meta: { images: [{ attachment: { attachmentId: 'att-1', mediaType: 'image/png', bytes: 4, width: 1, height: 1 }, filePath: '/out/a.png' }] },
    })
    expect(card).toMatchObject({ card: 'generic', title: '生成的图片' })
    expect((card as { content: unknown[] }).content).toHaveLength(1)
    // No meta → no card (the generic row keeps the raw content).
    expect(definition.presentResult({}, {})).toBeUndefined()
  })

  it('empty or blank prompt is a parameter error before any wire call', async () => {
    const fake = fakeTools()
    registerGenerateImageTool(fake.ctx, toolDeps())
    const definition = fake.registry.get('generate_image') as { execute: (args: unknown, exec: { signal: AbortSignal }) => Promise<unknown> }
    await expect(definition.execute({ prompt: '   ' }, { signal: new AbortController().signal })).rejects.toThrow(/prompt/)
    await expect(definition.execute({}, { signal: new AbortController().signal })).rejects.toThrow(/prompt/)
  })

  it('an aborted exec signal reaches the core: nothing is sent and the error says cancelled', async () => {
    const fake = fakeTools()
    const captured: Captured[] = []
    registerGenerateImageTool(fake.ctx, toolDeps({
      generateDeps: {
        config: () => JSON.parse(readFileSync(file, 'utf8')) as ReturnType<typeof emptyImageConfig>,
        resolveKey: async () => 'sk-test-key',
        home: () => home,
        send: jsonSend(captured, 1),
      },
    }))
    const definition = fake.registry.get('generate_image') as { execute: (args: unknown, exec: { signal: AbortSignal }) => Promise<unknown> }
    const controller = new AbortController()
    controller.abort()
    await expect(definition.execute({ prompt: 'x' }, { signal: controller.signal })).rejects.toThrow(/生成已取消/)
    expect(captured).toHaveLength(0)
  })

  it('a failed saveImage surfaces as a tool error, not a silent success', async () => {
    const fake = fakeTools()
    const failing: ImageAttachmentsLike = {
      async saveImage() {
        throw new Error('storage refused')
      },
      async readImage() {
        return { data: Uint8Array.from([1]) }
      },
    }
    registerGenerateImageTool(fake.ctx, toolDeps({ attachments: failing }))
    const definition = fake.registry.get('generate_image') as { execute: (args: unknown, exec: { signal: AbortSignal }) => Promise<unknown> }
    await expect(definition.execute({ prompt: 'x' }, { signal: new AbortController().signal })).rejects.toThrow(/storage refused/)
  })
})

describe('generate_image reference attachments', () => {
  it('resolves conversation attachment IDs to bytes and rides the edits endpoint', async () => {
    const fake = fakeTools()
    const captured: Captured[] = []
    registerGenerateImageTool(fake.ctx, toolDeps({
      generateDeps: {
        config: () => JSON.parse(readFileSync(file, 'utf8')) as ReturnType<typeof emptyImageConfig>,
        resolveKey: async () => 'sk-test-key',
        home: () => home,
        send: jsonSend(captured, 1),
      },
    }))
    const definition = fake.registry.get('generate_image') as { execute: (args: unknown, exec: { signal: AbortSignal }) => Promise<unknown> }
    await definition.execute(
      { prompt: 'make it red', reference_attachments: ['sha256:abc123'] },
      { signal: new AbortController().signal },
    )
    expect(captured[0]!.url).toBe('https://api.example/v1/images/edits')
    const body = Buffer.from(captured[0]!.init.body as Uint8Array).toString('latin1')
    expect(body).toContain('filename="chat-image.png"')
    expect(body).toContain('\x07\x07\x07')
  })

  it('a bare digest is accepted beside the canonical sha256: spelling', async () => {
    const fake = fakeTools()
    const readRefs: string[] = []
    const attachments: ImageAttachmentsLike = {
      async saveImage(input) {
        return { attachmentId: 'att-1', mediaType: input.mediaType, bytes: input.data.length, width: 1, height: 1 }
      },
      async readImage(ref) {
        readRefs.push(ref.attachmentId)
        return { data: Uint8Array.from([1]) }
      },
    }
    registerGenerateImageTool(fake.ctx, toolDeps({ attachments }))
    const definition = fake.registry.get('generate_image') as { execute: (args: unknown, exec: { signal: AbortSignal }) => Promise<unknown> }
    await definition.execute(
      { prompt: 'x', reference_attachments: ['sha256:canon', 'bare42'] },
      { signal: new AbortController().signal },
    )
    expect(readRefs).toEqual(['sha256:canon', 'sha256:bare42'])
  })

  it('an unreadable attachment is a named reference error', async () => {
    const fake = fakeTools()
    const attachments: ImageAttachmentsLike = {
      async saveImage() {
        throw new Error('unreachable')
      },
      async readImage() {
        throw new Error('no such attachment')
      },
    }
    registerGenerateImageTool(fake.ctx, toolDeps({ attachments }))
    const definition = fake.registry.get('generate_image') as { execute: (args: unknown, exec: { signal: AbortSignal }) => Promise<unknown> }
    await expect(definition.execute(
      { prompt: 'x', reference_attachments: ['sha256:gone'] },
      { signal: new AbortController().signal },
    )).rejects.toThrow(/参考图（附件 sha256:gone）不可读/)
  })
})

describe('imageToolHint', () => {
  it('names the default model and the defaults when models exist', () => {
    const config = syncImageConfig(emptyImageConfig(), PROVIDERS)
    const hint = imageToolHint(config)
    expect(hint).toContain('generate_image')
    expect(hint).toContain('openai/gpt-image-1')
    expect(hint).toContain('1024x1024')
  })

  it('is empty without models — no hint for a capability that does not exist', () => {
    expect(imageToolHint(emptyImageConfig())).toBe('')
  })
})
