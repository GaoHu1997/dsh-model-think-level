/** Deadline regressions use only injected fetch/credential/attachment doubles. */
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createGenerateDeadline, generateImage, type GenerateDeps } from '../src/image/generate.js'
import { emptyImageConfig, syncImageConfig } from '../src/image/config.js'
import { registerGenerateImageTool, type ImageAttachmentsLike, type ImageToolValue } from '../src/image/tool.js'

const KEY = 'sk-test-abcdef0123456789'
const PNG_B64 = Buffer.from([0x89, 0x50, 0x4e, 0x47]).toString('base64')
const PROVIDERS = { openai: {
  api: 'openai-completions', baseURL: 'https://api.example/v1/', apiKeyEnv: 'OPENAI_API_KEY',
  models: [{ id: 'gpt-image-1', name: 'GPT-Image-1', inputImageGen: true }],
} }
let home: string
beforeEach(() => { vi.useFakeTimers(); home = mkdtempSync(join(tmpdir(), 'bre-image-timeout-')) })
afterEach(() => { rmSync(home, { recursive: true, force: true }); vi.useRealTimers(); vi.restoreAllMocks() })

const success = (): Response => new Response(JSON.stringify({ data: [{ b64_json: PNG_B64 }] }))
function deps(overrides: Partial<GenerateDeps> = {}): GenerateDeps {
  return { config: () => syncImageConfig(emptyImageConfig(), PROVIDERS), resolveKey: async () => KEY,
    home: () => home, timeoutMs: 100, send: async () => success(), ...overrides }
}
function store(): ImageAttachmentsLike {
  return {
    readImage: async () => ({ data: Uint8Array.from([1]), ref: { name: 'reference.png', mediaType: 'image/png' } }),
    saveImage: async input => ({ attachmentId: 'att-1', mediaType: input.mediaType, bytes: input.data.length, width: 1, height: 1 }),
  }
}
function tool(generateDeps: GenerateDeps, attachments = store()): { execute(args: unknown, exec: { signal: AbortSignal }): Promise<ImageToolValue> } {
  let definition: unknown
  const ctx = { tools: { register(value: unknown) { definition = value; return () => {} } } } as unknown as Parameters<typeof registerGenerateImageTool>[0]
  registerGenerateImageTool(ctx, { generateDeps, attachments, readConfig: () => syncImageConfig(emptyImageConfig(), PROVIDERS) })
  return definition as ReturnType<typeof tool>
}

// Intentionally signal-ignoring doubles verify local waiting is bounded, rather
// than only verifying native fetch's cooperative cancellation behavior.
describe('generateImage whole-call deadline', () => {
  it('does not resolve a credential or send a paid request when pre-aborted', async () => {
    const caller = new AbortController(); caller.abort(new Error('user stop'))
    const resolveKey = vi.fn(() => new Promise<string>(() => {}))
    const send = vi.fn(async () => success())
    await expect(generateImage(deps({ send, resolveKey }), { prompt: 'x', signal: caller.signal })).rejects.toMatchObject({ kind: 'aborted' })
    expect(resolveKey).not.toHaveBeenCalled(); expect(send).not.toHaveBeenCalled()
    expect(vi.getTimerCount()).toBe(0)
  })

  it.each(['timeout', 'aborted'] as const)('bounds a hanging credential (%s), consuming late rejection', async kind => {
    const caller = new AbortController()
    let rejectKey!: (error: Error) => void
    let signal: AbortSignal | undefined
    const resolveKey: GenerateDeps['resolveKey'] = (_ref, received) => {
      signal = received; return new Promise((_resolve, reject) => { rejectKey = reject })
    }
    const send = vi.fn(async () => success())
    const outcome = generateImage(deps({ send, resolveKey }), { prompt: 'x', signal: caller.signal }).catch(error => error)
    if (kind === 'aborted') caller.abort(new Error('user stop'))
    else await vi.advanceTimersByTimeAsync(100)
    expect(await outcome).toMatchObject({ kind }); expect(signal?.aborted).toBe(true)
    rejectKey(new Error('late key failure')); await vi.advanceTimersByTimeAsync(0)
    expect(send).not.toHaveBeenCalled(); expect(vi.getTimerCount()).toBe(0)
  })

  it('does not start a paid request after a cancelled key resolves late', async () => {
    const caller = new AbortController()
    let resolveKey!: (key: string) => void
    const send = vi.fn(async () => success())
    const outcome = generateImage(deps({ send, resolveKey: () => new Promise(resolve => { resolveKey = resolve }) }), { prompt: 'x', signal: caller.signal }).catch(error => error)
    caller.abort(); expect(await outcome).toMatchObject({ kind: 'aborted' })
    resolveKey(KEY); await vi.advanceTimersByTimeAsync(0)
    expect(send).not.toHaveBeenCalled()
  })

  it.each(['timeout', 'aborted'] as const)('bounds URL headers ignoring signal (%s), with no late disk write', async kind => {
    const caller = new AbortController()
    const signals: (AbortSignal | null | undefined)[] = []
    let resolveDownload!: (response: Response) => void
    const persistLastGood = vi.fn()
    const target = join(home, 'never.png')
    const send: typeof fetch = async (_input, init) => {
      signals.push(init?.signal)
      if (signals.length === 1) return new Response(JSON.stringify({ result: [{ url: 'https://cdn.example/img.png' }] }))
      return new Promise(resolve => { resolveDownload = resolve })
    }
    const outcome = generateImage(deps({ send, persistLastGood }), { prompt: 'x', signal: caller.signal, outputPath: target }).catch(error => error)
    await vi.advanceTimersByTimeAsync(0)
    expect(signals).toHaveLength(2); expect(signals[1]).toBe(signals[0])
    if (kind === 'aborted') caller.abort(new Error('user stop'))
    else await vi.advanceTimersByTimeAsync(100)
    expect(await outcome).toMatchObject({ kind }); expect(signals[1]?.aborted).toBe(true)
    resolveDownload(new Response(Uint8Array.from([1, 2, 3]))); await vi.advanceTimersByTimeAsync(0)
    expect(existsSync(target)).toBe(false); expect(persistLastGood).not.toHaveBeenCalled()
  })

  it.each([
    ['success body', 200, false], ['error body', 400, false], ['server-error body', 500, false], ['URL body', 200, true],
  ] as const)('times out a non-EOF %s and cancels its reader', async (_phase, status, url) => {
    const cancel = vi.fn()
    const body = new ReadableStream<Uint8Array>({ start(controller) { controller.enqueue(new TextEncoder().encode('{')) }, cancel })
    let calls = 0
    const send: typeof fetch = async () => {
      calls += 1
      if (url && calls === 1) return new Response(JSON.stringify({ data: [{ url: 'https://cdn.example/img.png' }] }))
      return new Response(body, { status })
    }
    const target = join(home, 'never.png')
    const outcome = generateImage(deps({ send }), { prompt: 'x', outputPath: target }).catch(error => error)
    await vi.advanceTimersByTimeAsync(100)
    expect(await outcome).toMatchObject({ kind: 'timeout' }); expect(cancel).toHaveBeenCalledTimes(1)
    expect(body.locked).toBe(false); expect(existsSync(target)).toBe(false); expect(calls).toBe(url ? 2 : 1)
  })

  it('retains caller-aborted classification during successful JSON reading', async () => {
    const caller = new AbortController(); const cancel = vi.fn()
    const send: typeof fetch = async () => new Response(new ReadableStream({ cancel }))
    const outcome = generateImage(deps({ send }), { prompt: 'x', signal: caller.signal }).catch(error => error)
    await vi.advanceTimersByTimeAsync(0); caller.abort(new Error('user stop'))
    expect(await outcome).toMatchObject({ kind: 'aborted' }); expect(cancel).toHaveBeenCalledTimes(1)
  })

  it('does not reset the budget on fallback', async () => {
    const signals: (AbortSignal | null | undefined)[] = []
    const send: typeof fetch = async (_input, init) => {
      signals.push(init?.signal)
      if (signals.length === 1) {
        await new Promise(resolve => setTimeout(resolve, 80))
        return new Response(JSON.stringify({ error: { message: 'Unknown parameter: response_format' } }), { status: 400 })
      }
      return new Promise(() => {})
    }
    const outcome = generateImage(deps({ send }), { prompt: 'x' }).catch(error => error)
    await vi.advanceTimersByTimeAsync(80)
    expect(signals).toHaveLength(2); expect(signals[1]).toBe(signals[0])
    await vi.advanceTimersByTimeAsync(20)
    expect(await outcome).toMatchObject({ kind: 'timeout' }); expect(vi.getTimerCount()).toBe(0)
  })

  it('reads legal JSON larger than the former 262144-character truncation', async () => {
    const data = Buffer.alloc(300_000, 1).toString('base64')
    const json = JSON.stringify({ data: [{ b64_json: data }] })
    expect(json.length).toBeGreaterThan(262_144)
    const result = await generateImage(deps({ send: async () => new Response(json) }), { prompt: 'x' })
    expect(readFileSync(result.images[0]!.filePath)).toHaveLength(300_000)
    expect(result.images[0]!.data).toBe(data); expect(vi.getTimerCount()).toBe(0)
  })

  it('takes a bounded error snippet without waiting for EOF or cancel cleanup', async () => {
    const cancel = vi.fn(() => new Promise<void>(() => {}))
    const send: typeof fetch = async () => new Response(new ReadableStream<Uint8Array>({
      start(controller) { controller.enqueue(new TextEncoder().encode(`bad ${KEY} ` + 'x'.repeat(10_000))) }, cancel,
    }), { status: 500 })
    const error = await generateImage(deps({ send }), { prompt: 'x' }).catch(error => error)
    expect(error).toMatchObject({ kind: 'upstream' }); expect(error.message).not.toContain(KEY)
    expect(error.message).toContain('***'); expect(cancel).toHaveBeenCalledTimes(1); expect(vi.getTimerCount()).toBe(0)
  })

  it('checks cancellation after destination naming and before disk writes', async () => {
    const caller = new AbortController(); const persistLastGood = vi.fn()
    const outcome = generateImage(deps({ persistLastGood, now: () => { caller.abort(); return 1 } }), { prompt: 'x', signal: caller.signal, outputPath: home }).catch(error => error)
    expect(await outcome).toMatchObject({ kind: 'aborted' })
    expect(existsSync(join(home, 'x-1.png'))).toBe(false); expect(persistLastGood).not.toHaveBeenCalled()
  })

  it('sanitizes ordinary nested URL errors with the credential, not the envelope field name', async () => {
    const nestedKey = 'image_only_credential_12345'
    let calls = 0
    const send: typeof fetch = async () => {
      calls += 1
      if (calls === 1) return new Response(JSON.stringify({ images: [{ url: 'https://cdn.example/img.png' }] }))
      throw new Error(`download refused for ${nestedKey}`)
    }
    const error = await generateImage(deps({ send, resolveKey: async () => nestedKey }), { prompt: 'x' }).catch(error => error)
    expect(error).toMatchObject({ kind: 'upstream' }); expect(error.message).not.toContain(nestedKey)
    expect(error.message).toContain('***'); expect(error.message).toContain('download refused')
  })

  it('preserves sanitized ordinary POST connection failures', async () => {
    const send: typeof fetch = async () => { throw new Error(`connection refused ${KEY}`) }
    const error = await generateImage(deps({ send }), { prompt: 'x' }).catch(error => error)
    expect(error).toMatchObject({ kind: 'upstream' }); expect(error.message).toContain('无法连接')
    expect(error.message).not.toContain(KEY)
  })

  it('detects a spent budget after synchronous naming even before its timer runs', async () => {
    const target = join(home, 'x-1.png')
    const outcome = generateImage(deps({ now: () => { vi.setSystemTime(Date.now() + 101); return 1 } }), { prompt: 'x', outputPath: home }).catch(error => error)
    expect(await outcome).toMatchObject({ kind: 'timeout' })
    expect(existsSync(target)).toBe(false); expect(vi.getTimerCount()).toBe(0)
  })

  it('consumes a rejected promise when its factory synchronously aborts', async () => {
    const caller = new AbortController()
    const deadline = createGenerateDeadline(100, caller.signal)
    const outcome = deadline.run(() => { caller.abort(new Error('user stop')); return Promise.reject(new Error('late dependency failure')) }).catch(error => error)
    expect(await outcome).toMatchObject({ kind: 'aborted' })
    await vi.advanceTimersByTimeAsync(0); deadline.dispose(); expect(vi.getTimerCount()).toBe(0)
  })

  it('cleans timers and caller listeners on success and race listeners on rejection', async () => {
    const caller = new AbortController()
    const add = vi.spyOn(caller.signal, 'addEventListener'); const remove = vi.spyOn(caller.signal, 'removeEventListener')
    await generateImage(deps(), { prompt: 'x', signal: caller.signal })
    expect(vi.getTimerCount()).toBe(0); expect(remove).toHaveBeenCalledWith('abort', add.mock.calls[0]![1])
    const deadline = createGenerateDeadline(100, caller.signal)
    const raceAdd = vi.spyOn(deadline.signal, 'addEventListener'); const raceRemove = vi.spyOn(deadline.signal, 'removeEventListener')
    await expect(deadline.run(() => { throw new Error('ordinary failure') })).rejects.toThrow('ordinary failure')
    expect(raceRemove).toHaveBeenCalledWith('abort', raceAdd.mock.calls[0]![1])
    deadline.dispose(); expect(vi.getTimerCount()).toBe(0)
  })
})

describe('generate_image tool shared deadline', () => {
  it('pre-abort starts neither attachment reads, credentials nor paid requests', async () => {
    const caller = new AbortController(); caller.abort()
    const attachments = store(); attachments.readImage = vi.fn(attachments.readImage)
    const resolveKey = vi.fn(async () => KEY); const send = vi.fn(async () => success())
    await expect(tool(deps({ send, resolveKey }), attachments).execute({ prompt: 'x', reference_attachments: ['sha256:ref'] }, { signal: caller.signal })).rejects.toMatchObject({ kind: 'aborted' })
    expect(attachments.readImage).not.toHaveBeenCalled(); expect(resolveKey).not.toHaveBeenCalled(); expect(send).not.toHaveBeenCalled()
    expect(vi.getTimerCount()).toBe(0)
  })

  it.each(['timeout', 'aborted'] as const)('bounds attachment reads ignoring signal (%s), not a reference error', async kind => {
    const caller = new AbortController(); let signal: AbortSignal | undefined
    const attachments = store()
    attachments.readImage = (_ref, received) => { signal = received; return new Promise(() => {}) }
    const send = vi.fn(async () => success()); const resolveKey = vi.fn(async () => KEY)
    const outcome = tool(deps({ send, resolveKey }), attachments).execute({ prompt: 'x', reference_attachments: ['sha256:ref'] }, { signal: caller.signal }).catch(error => error)
    if (kind === 'aborted') caller.abort(new Error('user stop'))
    else await vi.advanceTimersByTimeAsync(100)
    expect(await outcome).toMatchObject({ kind }); expect(signal?.aborted).toBe(true)
    expect(resolveKey).not.toHaveBeenCalled(); expect(send).not.toHaveBeenCalled()
  })

  it.each(['timeout', 'aborted'] as const)('bounds attachment save ignoring signal (%s), consuming late failure', async kind => {
    const caller = new AbortController(); let signal: AbortSignal | undefined
    let rejectSave!: (error: Error) => void
    const attachments = store()
    attachments.saveImage = vi.fn<ImageAttachmentsLike['saveImage']>((_input, received) => { signal = received; return new Promise((_resolve, reject) => { rejectSave = reject }) })
    const send: typeof fetch = async () => new Response(JSON.stringify({ data: [{ b64_json: PNG_B64 }, { b64_json: PNG_B64 }] }))
    const outcome = tool(deps({ send }), attachments).execute({ prompt: 'x' }, { signal: caller.signal }).catch(error => error)
    await vi.advanceTimersByTimeAsync(0); expect(attachments.saveImage).toHaveBeenCalledTimes(1)
    if (kind === 'aborted') caller.abort(new Error('user stop'))
    else await vi.advanceTimersByTimeAsync(100)
    expect(await outcome).toMatchObject({ kind }); expect(signal?.aborted).toBe(true)
    rejectSave(new Error('late storage failure')); await vi.advanceTimersByTimeAsync(0)
    expect(attachments.saveImage).toHaveBeenCalledTimes(1); expect(vi.getTimerCount()).toBe(0)
  })

  it('does not resume a cancelled tool when an ignoring save resolves late', async () => {
    const caller = new AbortController()
    const attachments = store()
    let resolveSave!: (ref: Awaited<ReturnType<ImageAttachmentsLike['saveImage']>>) => void
    attachments.saveImage = vi.fn<ImageAttachmentsLike['saveImage']>(() => new Promise(resolve => { resolveSave = resolve }))
    const send: typeof fetch = async () => new Response(JSON.stringify({ data: [{ b64_json: PNG_B64 }, { b64_json: PNG_B64 }] }))
    const outcome = tool(deps({ send }), attachments).execute({ prompt: 'x' }, { signal: caller.signal }).catch(error => error)
    await vi.advanceTimersByTimeAsync(0); caller.abort()
    expect(await outcome).toMatchObject({ kind: 'aborted' })
    resolveSave({ attachmentId: 'late', mediaType: 'image/png', bytes: 4, width: 1, height: 1 })
    await vi.advanceTimersByTimeAsync(0)
    expect(attachments.saveImage).toHaveBeenCalledTimes(1); expect(await outcome).toMatchObject({ kind: 'aborted' })
  })

  it('shares remaining budget across reference read, core generation and save', async () => {
    const signals: (AbortSignal | null | undefined)[] = []
    const attachments = store()
    const read = attachments.readImage; const save = attachments.saveImage
    attachments.readImage = async (ref, signal) => { signals.push(signal); await new Promise(resolve => setTimeout(resolve, 40)); return read(ref, signal) }
    attachments.saveImage = async (input, signal) => { signals.push(signal); await new Promise(resolve => setTimeout(resolve, 40)); return save(input, signal) }
    const send: typeof fetch = async (_input, init) => { signals.push(init?.signal); await new Promise(resolve => setTimeout(resolve, 40)); return success() }
    const resolveKey: GenerateDeps['resolveKey'] = async (_ref, signal) => { signals.push(signal); return KEY }
    const outcome = tool(deps({ send, resolveKey }), attachments).execute({ prompt: 'x', reference_attachments: ['sha256:ref'] }, { signal: new AbortController().signal }).catch(error => error)
    await vi.advanceTimersByTimeAsync(80); expect(signals).toHaveLength(4)
    expect(signals.every(signal => signal === signals[0])).toBe(true)
    await vi.advanceTimersByTimeAsync(20); expect(await outcome).toMatchObject({ kind: 'timeout' })
    // The mock's own save timer is not physically cancellable; consume its late completion.
    await vi.advanceTimersByTimeAsync(20); expect(vi.getTimerCount()).toBe(0)
  })
})
