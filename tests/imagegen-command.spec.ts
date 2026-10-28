/**
 * The `/生图` host command: the registration shape (definitionId/name/hint,
 * the dsh-command-goal shape), the argument parser (model omission, options,
 * unknown-option refusal, missing-prompt refusal), and the handler routing
 * into the SAME generation core.
 */

import { describe, expect, it, vi } from 'vitest'
import {
  IMAGEGEN_DEFINITION_ID,
  IMAGEGEN_HINT,
  executeImagegen,
  invocationTextOf,
  parseImagegenArgs,
  registerImagegenCommand,
  type ImagegenDeps,
} from '../src/image/command.js'
import type { GenerateDeps, GenerateResult } from '../src/image/generate.js'
import { GenerateError } from '../src/image/generate.js'

const generate = vi.fn(async (): Promise<GenerateResult> => ({
  filePath: '/out/a-cat-1.png',
  mime: 'image/png',
  model: 'openai/gpt-image-1',
  prompt: 'a cat',
  paramsUsed: { size: '1024x1024', quality: 'high', n: 1 },
  revisions: [],
  data: 'aGk=',
}))

const deps: ImagegenDeps = {
  modelIds: () => ['openai/gpt-image-1', 'zhipu/cogview-3-plus'],
  generate: generate as unknown as ImagegenDeps['generate'],
  generateDeps: { resolveKey: async () => 'k', send: (async () => new Response('{}')) as typeof fetch },
}

describe('registerImagegenCommand', () => {
  it('registers on the host side with the goal-command shape (hint + attachments)', () => {
    const registered: Record<string, unknown>[] = []
    registerImagegenCommand(
      { register: (contribution: Record<string, unknown>) => { registered.push(contribution) } },
      deps,
    )
    expect(registered).toHaveLength(1)
    const contribution = registered[0]!
    expect(contribution['definitionId']).toBe(IMAGEGEN_DEFINITION_ID)
    expect(contribution['name']).toBe('生图')
    expect(typeof contribution['description']).toBe('string')
    expect(contribution['input']).toMatchObject({ hint: IMAGEGEN_HINT, attachments: true })
    expect(typeof contribution['handler']).toBe('function')
  })

  it('stays silent (no throw) when the host has no commands service', () => {
    expect(() => registerImagegenCommand(undefined, deps)).not.toThrow()
    expect(() => registerImagegenCommand({} as never, deps)).not.toThrow()
    expect(() => registerImagegenCommand({ register: () => { throw new Error('duplicate') } }, deps)).not.toThrow()
  })
})

describe('parseImagegenArgs', () => {
  it('parses the model, options and the prompt', () => {
    const parsed = parseImagegenArgs(
      'zhipu/cogview-3-plus --size 1024x1024 --quality high --n 2 --参考图 /tmp/a.png --ref /tmp/b.png a red apple',
      deps.modelIds(),
    )
    expect(parsed.model).toBe('zhipu/cogview-3-plus')
    expect(parsed.size).toBe('1024x1024')
    expect(parsed.quality).toBe('high')
    expect(parsed.n).toBe(2)
    expect(parsed.referenceImages).toEqual(['/tmp/a.png', '/tmp/b.png'])
    expect(parsed.prompt).toBe('a red apple')
  })

  it('the model may be omitted — the whole bare text is the prompt', () => {
    const parsed = parseImagegenArgs('a red apple', deps.modelIds())
    expect(parsed.model).toBeUndefined()
    expect(parsed.prompt).toBe('a red apple')
  })

  it('a bare token that is NOT a model falls into the prompt (never swallowed)', () => {
    const parsed = parseImagegenArgs('not-a-model a red apple', deps.modelIds())
    expect(parsed.model).toBeUndefined()
    expect(parsed.prompt).toBe('not-a-model a red apple')
  })

  it('an unknown option is refused WITH the accepted spellings', () => {
    expect(() => parseImagegenArgs('--style vivid a cat', deps.modelIds()))
      .toThrow(/未知选项 --style/)
    expect(() => parseImagegenArgs('--style vivid a cat', deps.modelIds()))
      .toThrow(/--size/)
  })

  it('an option without a value, and an out-of-range n, are refused', () => {
    expect(() => parseImagegenArgs('--size', deps.modelIds())).toThrow(/--size/)
    expect(() => parseImagegenArgs('--n 0 a cat', deps.modelIds())).toThrow(/--n 需要/)
    expect(() => parseImagegenArgs('--n x a cat', deps.modelIds())).toThrow(/--n 需要/)
  })

  it('a missing prompt is refused with the usage line', () => {
    expect(() => parseImagegenArgs('', deps.modelIds())).toThrow(/缺少提示词/)
    expect(() => parseImagegenArgs('--size 1024x1024', deps.modelIds())).toThrow(/缺少提示词/)
  })
})

describe('handler', () => {
  it('routes into the SAME generation core and echoes the result', async () => {
    const registered: Record<string, unknown>[] = []
    const echo = vi.fn()
    registerImagegenCommand(
      { register: (contribution: Record<string, unknown>) => { registered.push(contribution) } },
      { ...deps, echo },
    )
    const handler = registered[0]!['handler'] as (invocation: unknown) => Promise<unknown>
    const answer = await handler({ args: 'openai/gpt-image-1 --size 1024x1024 a cat' }) as { ok: boolean; filePath?: string; model?: string }
    expect(answer.ok).toBe(true)
    expect(answer.filePath).toBe('/out/a-cat-1.png')
    expect(answer.model).toBe('openai/gpt-image-1')
    expect(generate).toHaveBeenCalledWith(
      deps.generateDeps,
      expect.objectContaining({ model: 'openai/gpt-image-1', prompt: 'a cat', size: '1024x1024' }),
    )
    expect(echo).toHaveBeenCalledWith(expect.objectContaining({ args: 'openai/gpt-image-1 --size 1024x1024 a cat' }), expect.stringContaining('/out/a-cat-1.png'), '/out/a-cat-1.png')
  })

  it('a parse failure is an ok:false answer, not a throw', async () => {
    const registered: Record<string, unknown>[] = []
    registerImagegenCommand(
      { register: (contribution: Record<string, unknown>) => { registered.push(contribution) } },
      deps,
    )
    const handler = registered[0]!['handler'] as (invocation: unknown) => Promise<unknown>
    const answer = await handler({ args: '--nope x' }) as { ok: boolean; error: string }
    expect(answer.ok).toBe(false)
    expect(answer.error).toMatch(/未知选项/)
  })

  it('a generation failure is an ok:false answer carrying the classified text', async () => {
    const failing: ImagegenDeps = {
      ...deps,
      generate: (async () => {
        throw new GenerateError('permission', '该密钥被限制为该站点的图片接口专用')
      }) as unknown as ImagegenDeps['generate'],
    }
    const answer = await executeImagegen(failing, { prompt: 'x', referenceImages: [] })
    expect(answer.ok).toBe(false)
    expect(answer.ok === false && answer.error).toMatch(/图片接口专用/)
  })
})

describe('invocationTextOf', () => {
  it('reads the common invocation field spellings, first non-empty wins', () => {
    expect(invocationTextOf({ args: 'a cat' })).toBe('a cat')
    expect(invocationTextOf({ argument: 'b' })).toBe('b')
    expect(invocationTextOf({ input: 'c' })).toBe('c')
    expect(invocationTextOf({ text: 'd' })).toBe('d')
    expect(invocationTextOf({ args: '', text: 'e' })).toBe('e')
    expect(invocationTextOf(undefined)).toBe('')
    expect(invocationTextOf('raw string')).toBe('')
  })
})
