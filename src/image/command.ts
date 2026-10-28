/**
 * The `/生图` host command (the explicit entry beside the wire dispatch).
 *
 * Registered on the HOST side on purpose: the client's `commandUi.register`
 * can only run a no-argument action — a command that reads parameters would
 * fall through to `remote.commands.execute` and answer "unknown or malformed
 * command". The host-side `ctx.commands.register` with an `input.hint` is the
 * shape the built-in command plugins use (the dsh-command-goal precedent).
 *
 * The handler is a thin argument parser over the SHARED generation core —
 * the same `generateImage` the dispatch and the `/image-generate` route call.
 *
 * @module dsh-model-think-level/image/command
 */

import { GenerateError, generateImage, type GenerateDeps, type GenerateResult } from './generate.js'

/** The host `commands` service, typed structurally (no new dependency). */
export interface CommandsServiceLike {
  register(contribution: {
    definitionId: string
    name: string
    description: string
    input?: { hint?: string; attachments?: boolean }
    handler: (invocation: unknown) => Promise<unknown>
  }): unknown
}

/** The plugin's command definition id (the built-ins' `@deepseek-ai/<pkg>:<name>` spelling). */
export const IMAGEGEN_DEFINITION_ID = '@deepseek-ai/dsh-model-think-level:imagegen'

/** The hint the slash menu shows under the command. */
export const IMAGEGEN_HINT = '[<模型>] [--size 1024x1024] [--quality high] [--n 1] [--参考图 <路径>] <提示词>'

/** One parsed invocation. */
export interface ImagegenArgs {
  readonly model?: string
  readonly size?: string
  readonly quality?: string
  readonly n?: number
  readonly referenceImages: readonly string[]
  readonly prompt: string
}

/**
 * Parse one `/生图` argument string. Tolerant on purpose: the model may be
 * omitted (the config default applies), an unknown option is reported (with
 * the accepted spellings — never silently ignored), and everything that is
 * neither option nor model is the prompt.
 * @throws Error naming the mistake and the accepted options.
 */
export function parseImagegenArgs(text: string, knownModels: readonly string[] = []): ImagegenArgs {
  const options = new Set(['--size', '--quality', '--n', '--参考图', '--ref'])
  const tokens = text.trim().split(/\s+/).filter(token => token.length > 0)
  let model: string | undefined
  const size: string[] = []
  const quality: string[] = []
  const referenceImages: string[] = []
  let n: number | undefined
  const prompt: string[] = []
  for (let index = 0; index < tokens.length; index += 1) {
    const token = tokens[index]!
    if (token.startsWith('--')) {
      const lower = token.toLowerCase()
      if (!options.has(lower)) {
        throw new Error(`未知选项 ${token}。可用：--size <宽x高> --quality <档位> --n <张数> --参考图 <路径>`)
      }
      const value = tokens[index + 1]
      if (value === undefined || value.startsWith('--')) {
        throw new Error(`选项 ${token} 缺少取值。可用：--size <宽x高> --quality <档位> --n <张数> --参考图 <路径>`)
      }
      index += 1
      if (lower === '--size') size.push(value)
      else if (lower === '--quality') quality.push(value)
      else if (lower === '--n') {
        const parsed = Number(value)
        if (!Number.isInteger(parsed) || parsed < 1 || parsed > 16) {
          throw new Error(`--n 需要 1–16 的整数，收到：${value}`)
        }
        n = parsed
      } else {
        referenceImages.push(value)
      }
      continue
    }
    // The first bare token is the model when it names one in the list; a
    // bare token that names nothing falls into the prompt either way (a
    // mistyped model must not swallow the prompt into a command error).
    if (model === undefined && prompt.length === 0 && knownModels.includes(token)) {
      model = token
      continue
    }
    prompt.push(token)
  }
  const joined = prompt.join(' ').trim()
  if (joined.length === 0) {
    throw new Error('缺少提示词。用法：/生图 [<模型>] [--size 1024x1024] [--quality high] [--n 1] [--参考图 <路径>] <提示词>')
  }
  return {
    ...(model === undefined ? {} : { model }),
    ...(size.length > 0 ? { size: size[size.length - 1]! } : {}),
    ...(quality.length > 0 ? { quality: quality[quality.length - 1]! } : {}),
    ...(n === undefined ? {} : { n }),
    referenceImages,
    prompt: joined,
  }
}

/**
 * What the handler needs: the live model ids (for argument disambiguation),
 * the generation deps, and an optional echo face for the session the command
 * ran in. The echo is best-effort — the command's return value is the
 * contract the host consumes; a session write is attempted only when the
 * invocation carries a session that exposes one.
 */
export interface ImagegenDeps {
  readonly modelIds: () => readonly string[]
  readonly generate: typeof generateImage
  readonly generateDeps: GenerateDeps
  /** Best-effort session echo (guarded; never throws into the command). */
  readonly echo?: (invocation: unknown, text: string, filePath: string) => void
}

/** Run one parsed invocation through the shared core and shape the result. */
export async function executeImagegen(
  deps: ImagegenDeps,
  parsed: ImagegenArgs,
): Promise<{ ok: true; filePath: string; mime: string; model: string; paramsUsed: GenerateResult['paramsUsed']; text: string; warning?: string } | { ok: false; error: string }> {
  try {
    const result = await deps.generate(deps.generateDeps, {
      ...(parsed.model === undefined ? {} : { model: parsed.model }),
      prompt: parsed.prompt,
      ...(parsed.size === undefined ? {} : { size: parsed.size }),
      ...(parsed.quality === undefined ? {} : { quality: parsed.quality }),
      ...(parsed.n === undefined ? {} : { n: parsed.n }),
      ...(parsed.referenceImages.length > 0 ? { referenceImages: parsed.referenceImages } : {}),
    })
    const text = [
      `已生成：${result.filePath}`,
      `模型 ${result.model} · size ${result.paramsUsed.size} · quality ${result.paramsUsed.quality} · n ${result.paramsUsed.n}`,
      result.revisions.length > 0 ? `参数回退：${result.revisions.join('、')}` : '',
    ].filter(line => line.length > 0).join('\n')
    return {
      ok: true,
      filePath: result.filePath,
      mime: result.mime,
      model: result.model,
      paramsUsed: result.paramsUsed,
      text,
      ...(result.revisions.length > 0 ? { warning: `参数回退：${result.revisions.join('、')}` } : {}),
    }
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) }
  }
}

/**
 * The invocation face the host hands the handler, narrowed to what this
 * command reads. `text` carries the arguments after the command word; the
 * exact field is spelled several ways across host versions, so each common
 * one is tried (in order) and the first non-empty wins.
 */
export function invocationTextOf(invocation: unknown): string {
  if (typeof invocation === 'object' && invocation !== null) {
    for (const key of ['args', 'argument', 'input', 'text', 'value'] as const) {
      const value = (invocation as Record<string, unknown>)[key]
      if (typeof value === 'string' && value.trim().length > 0) return value
    }
  }
  return ''
}

/** Register the command. @returns undefined when the host has no commands service. */
export function registerImagegenCommand(
  commands: CommandsServiceLike | undefined,
  deps: ImagegenDeps,
): void {
  if (commands === undefined || typeof commands.register !== 'function') return
  try {
    commands.register({
      definitionId: IMAGEGEN_DEFINITION_ID,
      name: '生图',
      description: '用生图模型生成图片',
      input: { hint: IMAGEGEN_HINT, attachments: true },
      handler: async invocation => {
        const known = deps.modelIds()
        let parsed: ImagegenArgs
        try {
          parsed = parseImagegenArgs(invocationTextOf(invocation), known)
        } catch (error) {
          return { ok: false, error: error instanceof Error ? error.message : String(error) }
        }
        const answer = await executeImagegen(deps, parsed)
        if (answer.ok) {
          // Best-effort in-session echo; the return value stays authoritative.
          try {
            deps.echo?.(invocation, answer.text, answer.filePath)
          } catch {
            // An echo face that throws must never fail a finished generation.
          }
        }
        return answer
      },
    })
  } catch {
    // A host whose command registry rejects the contribution keeps working:
    // the dispatch and the route remain.
  }
}
