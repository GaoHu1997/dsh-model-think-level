/**
 * The image-generation core: request construction for generations and edits
 * (hand-built multipart), the param fallback chain, the n clamp, the
 * never-overwrite file naming, and the error taxonomy — sanitized, classified,
 * never "invalid key" for an image-only permission refusal.
 */

import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { GenerateError, buildMultipart, generateImage, promptSlug, type GenerateDeps } from '../src/image/generate.js'
import { emptyImageConfig, syncImageConfig, writeImageConfig } from '../src/image/config.js'

let home = ''
let file: string

beforeEach(() => {
  home = mkdtempSync(join(tmpdir(), 'bre-image-generate-'))
  file = join(home, 'dsh-model-think-level', 'image.json')
})

afterEach(() => {
  rmSync(home, { recursive: true, force: true })
})

const KEY = 'sk-test-abcdef0123456789'
const PNG_B64 = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).toString('base64')

const PROVIDERS = {
  openai: {
    api: 'openai-completions',
    baseURL: 'https://api.example/v1/',
    apiKeyEnv: 'OPENAI_API_KEY',
    models: [{ id: 'gpt-image-1', name: 'GPT-Image-1', inputImageGen: true }],
  },
}

function depsWith(overrides: Partial<GenerateDeps> & { send: GenerateDeps['send'] }): GenerateDeps {
  return {
    config: () => {
      // A config synced from the fixture providers, on disk.
      try {
        const stored = JSON.parse(readFileSync(file, 'utf8')) as object
        return { ...stored } as ReturnType<typeof emptyImageConfig>
      } catch {
        const config = syncImageConfig(emptyImageConfig(), PROVIDERS)
        return config
      }
    },
    resolveKey: async () => KEY,
    home: () => home,
    ...overrides,
  }
}

interface Captured {
  url: string
  init: RequestInit
}

/** A send that answers one JSON images answer and records the call. */
function jsonSend(status: number, body: unknown, captured: Captured[] = [], sequence?: { status: number; body: unknown }[]): typeof fetch {
  let index = 0
  return (async (input: RequestInfo | URL, init?: RequestInit) => {
    captured.push({ url: String(input), init: init ?? {} })
    const step = sequence !== undefined && index < sequence.length ? sequence[index]! : { status, body }
    index += 1
    return new Response(JSON.stringify(step.body), { status: step.status, headers: { 'content-type': 'application/json' } })
  }) as typeof fetch
}

describe('generations request construction', () => {
  it('sends model/prompt/n/size/response_format with the bearer key, on the stripped base URL', async () => {
    writeImageConfig(syncImageConfig(emptyImageConfig(), PROVIDERS), file)
    const captured: Captured[] = []
    const deps = depsWith({ send: jsonSend(200, { data: [{ b64_json: PNG_B64 }] }, captured) })
    const result = await generateImage(deps, { prompt: 'a red apple' })
    expect(captured).toHaveLength(1)
    expect(captured[0]!.url).toBe('https://api.example/v1/images/generations')
    const body = JSON.parse(String(captured[0]!.init.body)) as Record<string, unknown>
    expect(body['model']).toBe('gpt-image-1')
    expect(body['prompt']).toBe('a red apple')
    expect(body['n']).toBe(1)
    expect(body['size']).toBe('1024x1024')
    expect(body['response_format']).toBe('b64_json')
    const headers = new Headers(captured[0]!.init.headers)
    expect(headers.get('authorization')).toBe(`Bearer ${KEY}`)
    // The file landed under the configured outputDir, and the result names it.
    const first = result.images[0]!
    expect(existsSync(first.filePath)).toBe(true)
    expect(first.filePath.startsWith(join(home, 'dsh-model-think-level'))).toBe(true)
    expect(result.mime).toBe('image/png')
    expect(result.model).toBe('openai/gpt-image-1')
    expect(first.data).toBe(PNG_B64)
  })

  it('keeps the file bytes equal to the decoded b64', async () => {
    writeImageConfig(syncImageConfig(emptyImageConfig(), PROVIDERS), file)
    const deps = depsWith({ send: jsonSend(200, { data: [{ b64_json: PNG_B64 }] }) })
    const result = await generateImage(deps, { prompt: 'a red apple' })
    expect(readFileSync(result.images[0]!.filePath).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))).toBe(true)
  })

  it('follows a url answer when the relay sends links instead of b64', async () => {
    writeImageConfig(syncImageConfig(emptyImageConfig(), PROVIDERS), file)
    const calls: string[] = []
    const send: typeof fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      calls.push(String(input))
      if (calls.length === 1) return new Response(JSON.stringify({ data: [{ url: 'https://cdn.example/img.png' }] }), { status: 200 })
      return new Response(Buffer.from([1, 2, 3]), { status: 200 })
    }) as typeof fetch
    const result = await generateImage(depsWith({ send }), { prompt: 'x' })
    expect(calls[1]).toBe('https://cdn.example/img.png')
    expect(readFileSync(result.images[0]!.filePath).equals(Buffer.from([1, 2, 3]))).toBe(true)
  })
})

describe('param fallback chain (one 4xx pass)', () => {
  it('drops response_format when the error names it, then succeeds', async () => {
    writeImageConfig(syncImageConfig(emptyImageConfig(), PROVIDERS), file)
    const captured: Captured[] = []
    const deps = depsWith({
      send: jsonSend(400, {}, captured, [
        { status: 400, body: { error: { message: 'Unknown parameter: response_format' } } },
        { status: 200, body: { data: [{ b64_json: PNG_B64 }] } },
      ]),
    })
    const result = await generateImage(deps, { prompt: 'a cat' })
    expect(captured).toHaveLength(2)
    const second = JSON.parse(String(captured[1]!.init.body)) as Record<string, unknown>
    expect(second['response_format']).toBeUndefined()
    expect(result.revisions).toEqual(['removed response_format'])
  })

  it('lowers quality, then resets size, then sets n=1 — each named in the revisions', async () => {
    writeImageConfig(syncImageConfig(emptyImageConfig(), PROVIDERS), file)
    const captured: Captured[] = []
    const deps = depsWith({
      send: jsonSend(400, {}, captured, [
        { status: 400, body: { error: { message: 'quality not supported' } } },
        { status: 400, body: { error: { message: 'size not supported' } } },
        { status: 200, body: { data: [{ b64_json: PNG_B64 }] } },
      ]),
    })
    const result = await generateImage(deps, { prompt: 'a cat', quality: 'high', size: '1536x1024' })
    expect(result.revisions).toEqual(['lowered quality', 'reset size to 1024x1024'])
    const last = JSON.parse(String(captured[2]!.init.body)) as Record<string, unknown>
    // One 4xx lowers quality ONE rung (high → medium); the size error moved on.
    expect(last['quality']).toBe('medium')
    expect(last['size']).toBe('1024x1024')
  })

  it('persists the surviving response_format via persistLastGood', async () => {
    writeImageConfig(syncImageConfig(emptyImageConfig(), PROVIDERS), file)
    const persisted: { id: string; responseFormat: string | null }[] = []
    const deps = depsWith({
      send: jsonSend(400, {}, undefined, [
        { status: 400, body: { error: { message: 'response_format unsupported' } } },
        { status: 200, body: { data: [{ b64_json: PNG_B64 }] } },
      ]),
      persistLastGood: (id, params) => {
        persisted.push({ id, responseFormat: params?.responseFormat ?? null })
      },
    })
    await generateImage(deps, { prompt: 'a cat' })
    expect(persisted).toEqual([{ id: 'openai/gpt-image-1', responseFormat: 'none' }])
  })
})

describe('n clamp and config errors', () => {
  it('clamps n to the model ability table before firing', async () => {
    writeImageConfig(syncImageConfig(emptyImageConfig(), PROVIDERS), file)
    const captured: Captured[] = []
    const deps = depsWith({ send: jsonSend(200, { data: [{ b64_json: PNG_B64 }] }, captured) })
    await generateImage(deps, { prompt: 'x', n: 99 })
    const body = JSON.parse(String(captured[0]!.init.body)) as Record<string, unknown>
    expect(body['n']).toBe(4) // the fallback table's maxN
  })

  it('no image models → an actionable config error', async () => {
    const deps = depsWith({ config: () => emptyImageConfig(), send: jsonSend(200, {}) })
    await expect(generateImage(deps, { prompt: 'x' })).rejects.toThrow(/没有已配置的生图模型/)
  })

  it('missing key → names the route and the reference, never a fake 401', async () => {
    writeImageConfig(syncImageConfig(emptyImageConfig(), PROVIDERS), file)
    const deps = depsWith({ resolveKey: async () => undefined, send: jsonSend(200, {}) })
    await expect(generateImage(deps, { prompt: 'x' })).rejects.toThrow(/未配置密钥/)
  })

  it('a non-images api is refused as endpoint', async () => {
    writeImageConfig(syncImageConfig(emptyImageConfig(), {
      mj: { api: 'anthropic-messages', baseURL: 'https://mj.example/v1', models: [{ id: 'mj-v6', inputImageGen: true }] },
    }), file)
    const deps = depsWith({ send: jsonSend(200, {}) })
    await expect(generateImage(deps, { prompt: 'x' })).rejects.toThrow(GenerateError)
    await expect(generateImage(deps, { prompt: 'x' })).rejects.toMatchObject({ kind: 'endpoint' })
  })
})

describe('edits (multipart)', () => {
  it('builds the multipart boundary body with prompt/model/n/size fields and the image part', async () => {
    writeImageConfig(syncImageConfig(emptyImageConfig(), PROVIDERS), file)
    const reference = join(home, 'ref.png')
    writeFileSync(reference, Buffer.from([1, 2, 3, 4]), 'utf8')
    const captured: Captured[] = []
    const deps = depsWith({ send: jsonSend(200, { data: [{ b64_json: PNG_B64 }] }, captured) })
    await generateImage(deps, { prompt: 'make it red', referenceImages: [reference] })
    expect(captured).toHaveLength(1)
    expect(captured[0]!.url).toBe('https://api.example/v1/images/edits')
    const contentType = new Headers(captured[0]!.init.headers).get('content-type') ?? ''
    expect(contentType.startsWith('multipart/form-data; boundary=')).toBe(true)
    const boundary = contentType.split('boundary=')[1]!
    const body = Buffer.from(captured[0]!.init.body as Uint8Array).toString('latin1')
    expect(body).toContain(`--${boundary}`)
    expect(body).toContain('name="prompt"\r\n\r\nmake it red')
    expect(body).toContain('name="model"\r\n\r\ngpt-image-1')
    expect(body).toContain('name="size"\r\n\r\n1024x1024')
    expect(body).toContain('name="image[]"')
    expect(body).toContain('filename="ref.png"')
    // The binary part carries the reference bytes (checked as latin1).
    expect(body).toContain('\x01\x02\x03\x04')
    expect(body.endsWith(`--${boundary}--\r\n`)).toBe(true)
  })

  it('a missing reference image is a reference error, before any wire call', async () => {
    writeImageConfig(syncImageConfig(emptyImageConfig(), PROVIDERS), file)
    const deps = depsWith({ send: jsonSend(200, {}) })
    await expect(generateImage(deps, { prompt: 'x', referenceImages: [join(home, 'nope.png')] }))
      .rejects.toMatchObject({ kind: 'reference' })
  })
})

describe('file naming', () => {
  it('never overwrites: the same stamp gets a -2 suffix', async () => {
    writeImageConfig(syncImageConfig(emptyImageConfig(), PROVIDERS), file)
    let stamp = 1_000
    const deps = depsWith({
      send: jsonSend(200, { data: [{ b64_json: PNG_B64 }] }),
      now: () => stamp,
    })
    const first = await generateImage(deps, { prompt: 'same prompt' })
    const second = await generateImage(deps, { prompt: 'same prompt' })
    const firstPath = first.images[0]!.filePath
    const secondPath = second.images[0]!.filePath
    expect(firstPath).not.toBe(secondPath)
    expect(existsSync(firstPath)).toBe(true)
    expect(existsSync(secondPath)).toBe(true)
    expect(secondPath).toBe(firstPath.replace(/\.png$/, '-2.png'))
    void stamp
  })

  it('promptSlug keeps CJK, folds filesystem-unsafe characters', () => {
    expect(promptSlug('一只红色的苹果')).toBe('一只红色的苹果')
    expect(promptSlug('a: b/c?d*e')).toBe('a-bcde')
    expect(promptSlug('   ')).toBe('image')
  })
})

describe('error taxonomy and sanitization', () => {
  it('401 reads as an auth problem', async () => {
    writeImageConfig(syncImageConfig(emptyImageConfig(), PROVIDERS), file)
    const deps = depsWith({ send: jsonSend(401, { error: { message: 'invalid api key' } }) })
    await expect(generateImage(deps, { prompt: 'x' })).rejects.toMatchObject({ kind: 'auth' })
  })

  it('403 permission_denied is the image-endpoint refusal — never "invalid key"', async () => {
    writeImageConfig(syncImageConfig(emptyImageConfig(), PROVIDERS), file)
    const deps = depsWith({ send: jsonSend(403, { error: { message: 'permission_denied: 站点用户 API 仅开放图片接口' } }) })
    await expect(generateImage(deps, { prompt: 'x' })).rejects.toMatchObject({ kind: 'permission' })
    try {
      await generateImage(deps, { prompt: 'x' })
    } catch (error) {
      expect((error as Error).message).not.toMatch(/密钥无效/)
      expect((error as Error).message).toMatch(/图片接口/)
    }
  })

  it('a 404 marks the endpoint missing (persistLastGood null → unsupported)', async () => {
    writeImageConfig(syncImageConfig(emptyImageConfig(), PROVIDERS), file)
    const persisted: (string | null)[] = []
    const deps = depsWith({
      send: jsonSend(404, { error: { message: 'not found' } }),
      persistLastGood: (id, params) => { persisted.push(params === null ? null : id) },
    })
    await expect(generateImage(deps, { prompt: 'x' })).rejects.toMatchObject({ kind: 'endpoint' })
    expect(persisted).toEqual([null])
  })

  it('the key value never survives into any error text, whatever the upstream echoes', async () => {
    writeImageConfig(syncImageConfig(emptyImageConfig(), PROVIDERS), file)
    // A 4xx whose message echoes the credential: the param class keeps the
    // upstream sentence, so the sanitizer is the only thing between it and UI.
    const deps = depsWith({ send: jsonSend(400, { error: { message: `bad key ${KEY} (Bearer ${KEY})` } }) })
    try {
      await generateImage(deps, { prompt: 'x' })
      expect.unreachable()
    } catch (error) {
      const message = (error as Error).message
      expect(message).not.toContain(KEY)
      expect(message).toContain('***')
    }
    // And the 401 classification never spells "invalid key" for an image-only
    // permission refusal — checked above; here just the key-echo path again
    // with a 403 (the user's incident shape).
    const deps403 = depsWith({ send: jsonSend(403, { error: { message: `permission_denied for ${KEY}` } }) })
    try {
      await generateImage(deps403, { prompt: 'x' })
      expect.unreachable()
    } catch (error) {
      expect((error as Error).message).not.toContain(KEY)
    }
  })
})

describe('outputPath (the tool path argument)', () => {
  it('a .png path is honored exactly, and an existing one gains -2 (never overwritten)', async () => {
    writeImageConfig(syncImageConfig(emptyImageConfig(), PROVIDERS), file)
    const target = join(home, 'custom', 'picture.png')
    const deps = depsWith({ send: jsonSend(200, { data: [{ b64_json: PNG_B64 }] }), now: () => 1 })
    const first = await generateImage(deps, { prompt: 'x', outputPath: target })
    expect(first.images[0]!.filePath).toBe(target)
    const second = await generateImage(deps, { prompt: 'x', outputPath: target })
    expect(second.images[0]!.filePath).toBe(join(home, 'custom', 'picture-2.png'))
    expect(existsSync(target)).toBe(true)
    expect(existsSync(second.images[0]!.filePath)).toBe(true)
  })

  it('an existing directory (or any non-.png spelling) receives the slug-timestamp naming', async () => {
    writeImageConfig(syncImageConfig(emptyImageConfig(), PROVIDERS), file)
    const dir = join(home, 'albums')
    const deps = depsWith({ send: jsonSend(200, { data: [{ b64_json: PNG_B64 }] }) })
    const result = await generateImage(deps, { prompt: '一只橘猫', outputPath: dir })
    expect(dirname(result.images[0]!.filePath)).toBe(dir)
    expect(result.images[0]!.filePath).toMatch(/一只橘猫-\d+\.png$/)
    // A non-png name is a DIRECTORY per the contract (png bytes never masquerade
    // under another extension), and the file lands inside it.
    const odd = join(home, 'weird-name')
    const oddResult = await generateImage(deps, { prompt: 'x', outputPath: odd })
    expect(dirname(oddResult.images[0]!.filePath)).toBe(odd)
    // A trailing separator also reads as a directory, even when absent.
    const trailing = join(home, 'made', 'up') + (process.platform === 'win32' ? '\\' : '/')
    const trailingResult = await generateImage(deps, { prompt: 'x', outputPath: trailing })
    expect(dirname(trailingResult.images[0]!.filePath)).toBe(join(home, 'made', 'up'))
  })

  it('absent outputPath keeps the config outputDir behavior', async () => {
    writeImageConfig(syncImageConfig(emptyImageConfig(), PROVIDERS), file)
    const deps = depsWith({ send: jsonSend(200, { data: [{ b64_json: PNG_B64 }] }) })
    const result = await generateImage(deps, { prompt: 'x' })
    expect(result.images[0]!.filePath.startsWith(join(home, 'dsh-model-think-level', 'generated-images'))).toBe(true)
  })
})

describe('caller cancellation (the user pressed stop)', () => {
  it('aborts the in-flight images request and classifies it as aborted, not timeout', async () => {
    writeImageConfig(syncImageConfig(emptyImageConfig(), PROVIDERS), file)
    const controller = new AbortController()
    const captured: Captured[] = []
    const send = (async (input: RequestInfo | URL, init?: RequestInit) => {
      captured.push({ url: String(input), init: init ?? {} })
      const signal = init?.signal as AbortSignal | undefined
      // The user's stop lands while the upstream is still painting.
      setTimeout(() => controller.abort(), 5)
      await new Promise((_resolve, reject) => {
        signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')), { once: true })
        setTimeout(() => reject(new Error('the stop never reached the wire')), 1000)
      })
      return new Response('{}', { status: 200 })
    }) as typeof fetch
    const deps = depsWith({ send })
    const error = await generateImage(deps, { prompt: 'a red apple', signal: controller.signal }).catch((caught: unknown) => caught)
    expect(error).toBeInstanceOf(GenerateError)
    expect((error as GenerateError).kind).toBe('aborted')
    // The stop reached the wire; no fallback attempt was started behind it.
    expect(captured).toHaveLength(1)
  })

  it('a signal already aborted sends nothing at all', async () => {
    writeImageConfig(syncImageConfig(emptyImageConfig(), PROVIDERS), file)
    const controller = new AbortController()
    controller.abort()
    const captured: Captured[] = []
    const deps = depsWith({ send: jsonSend(200, { data: [{ b64_json: PNG_B64 }] }, captured) })
    const error = await generateImage(deps, { prompt: 'a red apple', signal: controller.signal }).catch((caught: unknown) => caught)
    expect((error as GenerateError).kind).toBe('aborted')
    expect(captured).toHaveLength(0)
  })
})

describe('multi-image (every answered entry lands)', () => {
  it('writes one file per returned image, in order, with advancing suffixes', async () => {
    writeImageConfig(syncImageConfig(emptyImageConfig(), PROVIDERS), file)
    const deps = depsWith({
      send: jsonSend(200, { data: [{ b64_json: PNG_B64 }, { b64_json: PNG_B64 }, { b64_json: PNG_B64 }] }),
      now: () => 1,
    })
    const result = await generateImage(deps, { prompt: 'a cat row', n: 3 })
    expect(result.images).toHaveLength(3)
    for (const image of result.images) expect(existsSync(image.filePath)).toBe(true)
    expect(new Set(result.images.map(image => image.filePath)).size).toBe(3)
    // One slug, one stamp: the never-overwrite rule advances -2, -3 in order.
    const first = result.images[0]!.filePath
    expect(result.images[1]!.filePath).toBe(first.replace(/\.png$/, '-2.png'))
    expect(result.images[2]!.filePath).toBe(first.replace(/\.png$/, '-3.png'))
  })

  it('a relay answering fewer images than n yields exactly what arrived', async () => {
    writeImageConfig(syncImageConfig(emptyImageConfig(), PROVIDERS), file)
    const deps = depsWith({ send: jsonSend(200, { data: [{ b64_json: PNG_B64 }] }) })
    const result = await generateImage(deps, { prompt: 'x', n: 4 })
    expect(result.images).toHaveLength(1)
    expect(result.paramsUsed.n).toBe(4)
  })
})

describe('referenceFiles (the attachment-backed reference channel)', () => {
  it('rides the edits endpoint beside local paths, with its own filename and mime', async () => {
    writeImageConfig(syncImageConfig(emptyImageConfig(), PROVIDERS), file)
    const reference = join(home, 'ref.png')
    writeFileSync(reference, Buffer.from([1, 2, 3, 4]), 'utf8')
    const captured: Captured[] = []
    const deps = depsWith({ send: jsonSend(200, { data: [{ b64_json: PNG_B64 }] }, captured) })
    await generateImage(deps, {
      prompt: 'combine',
      referenceImages: [reference],
      referenceFiles: [{ name: 'from-chat.png', mime: 'image/jpeg', bytes: Uint8Array.from([5, 6, 7]) }],
    })
    expect(captured[0]!.url).toBe('https://api.example/v1/images/edits')
    const body = Buffer.from(captured[0]!.init.body as Uint8Array).toString('latin1')
    expect(body).toContain('filename="ref.png"')
    expect(body).toContain('filename="from-chat.png"')
    expect(body).toContain('Content-Type: image/jpeg')
    expect(body).toContain('')
  })

  it('referenceFiles alone switch to the edits endpoint', async () => {
    writeImageConfig(syncImageConfig(emptyImageConfig(), PROVIDERS), file)
    const captured: Captured[] = []
    const deps = depsWith({ send: jsonSend(200, { data: [{ b64_json: PNG_B64 }] }, captured) })
    await generateImage(deps, { prompt: 'x', referenceFiles: [{ name: 'a.png', mime: 'image/png', bytes: Uint8Array.from([1]) }] })
    expect(captured).toHaveLength(1)
    expect(captured[0]!.url).toBe('https://api.example/v1/images/edits')
  })
})

describe('buildMultipart', () => {
  it('joins fields and binary parts with one boundary, CRLF-framed', () => {
    const { body, contentType } = buildMultipart('BOUNDARY', { prompt: 'hi' }, [
      { name: 'a.png', bytes: Uint8Array.from([9, 9]), mime: 'image/png' },
    ])
    expect(contentType).toBe('multipart/form-data; boundary=BOUNDARY')
    const text = Buffer.from(body).toString('latin1')
    expect(text).toBe(
      '--BOUNDARY\r\nContent-Disposition: form-data; name="prompt"\r\n\r\nhi\r\n'
      + '--BOUNDARY\r\nContent-Disposition: form-data; name="image[]"; filename="a.png"\r\nContent-Type: image/png\r\n\r\n\x09\x09\r\n'
      + '--BOUNDARY--\r\n',
    )
  })
})
