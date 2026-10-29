/**
 * The native `generate_image` tool — the conversation model's entry to the
 * shared generation core, registered through the host's own `tools` service
 * (the same in-process shape dsh-image-gen uses). Replaces the retired stdio
 * MCP server: no subprocess, no patch-file entry, no env plumbing — the tool
 * runs inside this plugin and reaches the attachment store and the credential
 * service directly.
 *
 * Contract notes that are easy to get wrong:
 *  - `ctx.tools.register` REQUIRES `output: { schema, render }` — the schema
 *    is enforced against the canonical value `execute` returns, so the shape
 *    here and the value built below must agree exactly.
 *  - image blocks ride the result CONTENT (`{type:'image', attachment}`), and
 *    the host projects them to a text handle for models without image input
 *    (dsh-llm `projectImagesForTextModel`) — a text-only chat model calling
 *    this tool never breaks.
 *  - `exec.signal` MUST reach the core: a user stop must abort the paid
 *    upstream request, not just abandon the tool call.
 *
 * @module dsh-model-think-level/image/tool
 */

import type { Context } from '@deepseek-ai/cordis'
import { generateImage, type GenerateDeps } from './generate.js'
import type { ImageConfig } from './config.js'

/** The attachment-store face this tool needs, typed structurally. */
export interface ImageAttachmentsLike {
  saveImage(input: { data: Uint8Array; mediaType: string; name?: string }):
    Promise<{ attachmentId: string; mediaType: string; bytes: number; width: number; height: number; name?: string }>
  readImage(ref: { attachmentId: string }, signal?: AbortSignal):
    Promise<{ data: Uint8Array; ref?: { name?: string; mediaType?: string } }>
}

/** The host tools service face: register and enumerate (for collision checks). */
export interface ImageToolsLike {
  register(definition: unknown): unknown
  schemas?: () => readonly { name: string }[]
}

/** The image-block value shape the tool's canonical value carries per image. */
export interface ImageToolImage {
  readonly attachment: {
    readonly attachmentId: string
    readonly mediaType: string
    readonly bytes: number
    readonly width: number
    readonly height: number
    readonly name?: string
  }
  readonly filePath: string
}

/** The tool's canonical output value (enforced by `OUTPUT_SCHEMA`). */
export interface ImageToolValue {
  readonly images: readonly ImageToolImage[]
  readonly model: string
  readonly prompt: string
  readonly paramsUsed: { readonly size: string; readonly quality: string; readonly n: number }
  readonly revisions: readonly string[]
}

/** The faces the tool needs. All injectable for tests. */
export interface ImageToolDeps {
  readonly generateDeps: GenerateDeps
  readonly attachments: ImageAttachmentsLike
  /** The live config, for the params the hint and the defaults describe. */
  readonly readConfig: () => ImageConfig
  readonly logger?: { warn(message: string): void }
}

/** The primary tool name; the fallback keeps a dsh-image-gen install working. */
export const IMAGE_TOOL_NAME = 'generate_image'
export const IMAGE_TOOL_NAME_FALLBACK = 'dsh_image_generate'

/** The attachment-id spellings both accepted: canonical `sha256:…` or bare digest. */
function attachmentRefOf(id: string): { attachmentId: string } {
  const trimmed = id.trim()
  return { attachmentId: trimmed.startsWith('sha256:') ? trimmed : `sha256:${trimmed}` }
}

/** The model-facing JSON schema of the canonical value (harness dialect). */
const OUTPUT_SCHEMA = {
  type: 'object', additionalProperties: false, properties: {
    images: {
      type: 'array', required: true, items: {
        type: 'object', additionalProperties: false, properties: {
          attachment: { type: 'object', required: true, additionalProperties: false, properties: {
            attachmentId: { type: 'string', required: true },
            mediaType: { type: 'string', required: true },
            bytes: { type: 'integer', required: true },
            width: { type: 'integer', required: true },
            height: { type: 'integer', required: true },
            name: { type: 'string' },
            originalDimensions: { type: 'object', additionalProperties: false, properties: {
              width: { type: 'integer', required: true }, height: { type: 'integer', required: true },
            } },
          } },
          filePath: { type: 'string', required: true },
        },
      },
    },
    model: { type: 'string', required: true },
    prompt: { type: 'string', required: true },
    paramsUsed: { type: 'object', required: true, additionalProperties: false, properties: {
      size: { type: 'string', required: true }, quality: { type: 'string', required: true }, n: { type: 'integer', required: true },
    } },
    revisions: { type: 'array', items: { type: 'string' } },
  },
}

const TOOL_PARAMETERS = {
  prompt: { type: 'string', required: true, description: '完整画面描述：主体、构图、风格、光照，以及需要出现的文字。' },
  model: { type: 'string', description: '生图模型（route/modelId 或显示名）；缺省用配置页的默认模型，用户没有点名时省略。' },
  size: { type: 'string', description: '如 1024x1024；缺省取模型行 → 默认参数。用户没有点名时省略。' },
  quality: { type: 'string', description: '如 high；缺省取模型行 → 默认参数。用户没有点名时省略。' },
  n: { type: 'number', description: '生成张数；缺省取模型行 → 默认参数，超过该模型上限时报错并列出允许值。' },
  reference_images: { type: 'array', items: { type: 'string' }, description: '本地参考图路径；非空走 /images/edits。' },
  reference_attachments: { type: 'array', items: { type: 'string' }, description: '对话内图片的附件 ID（sha256:… 或裸摘要）；与本地路径可混用。' },
  path: { type: 'string', description: '落盘文件（以 .png 结尾，存在则自动加 -2 后缀，不覆盖）或目录；缺省 generated-images/<slug>-<ts>.png。' },
}

/** One args record narrowed from the model's JSON. Everything but prompt is optional. */
interface ToolArgs {
  readonly prompt: string
  readonly model?: string
  readonly size?: string
  readonly quality?: string
  readonly n?: number
  readonly referenceImages?: readonly string[]
  readonly referenceAttachments?: readonly string[]
  readonly outputPath?: string
}

/** Defensive arg narrowing: the model's JSON is untrusted, drop bad fields. */
function parseArgs(raw: unknown): ToolArgs | string {
  if (typeof raw !== 'object' || raw === null) return '参数不是对象；prompt 为必填字符串'
  const record = raw as Record<string, unknown>
  const prompt = typeof record['prompt'] === 'string' ? record['prompt'].trim() : ''
  if (prompt.length === 0) return 'prompt 为必填字符串且不能为空'
  const list = (key: string): readonly string[] | undefined => {
    const value = record[key]
    if (!Array.isArray(value)) return undefined
    const out = value.filter((entry): entry is string => typeof entry === 'string' && entry.trim().length > 0)
    return out.length > 0 ? out : undefined
  }
  const n = record['n']
  return {
    prompt,
    ...(typeof record['model'] === 'string' && record['model'].trim().length > 0 ? { model: (record['model'] as string).trim() } : {}),
    ...(typeof record['size'] === 'string' && record['size'].trim().length > 0 ? { size: (record['size'] as string).trim() } : {}),
    ...(typeof record['quality'] === 'string' && record['quality'].trim().length > 0 ? { quality: (record['quality'] as string).trim() } : {}),
    ...(typeof n === 'number' && Number.isInteger(n) && n >= 1 ? { n } : {}),
    ...(list('reference_images') === undefined ? {} : { referenceImages: list('reference_images') }),
    ...(list('reference_attachments') === undefined ? {} : { referenceAttachments: list('reference_attachments') }),
    ...(typeof record['path'] === 'string' && record['path'].trim().length > 0 ? { outputPath: (record['path'] as string).trim() } : {}),
  }
}

/** The plain-JSON attachment projection the canonical value carries. */
function attachmentValueOf(ref: Awaited<ReturnType<ImageAttachmentsLike['saveImage']>>): ImageToolImage['attachment'] {
  return {
    attachmentId: String(ref.attachmentId),
    mediaType: ref.mediaType,
    bytes: ref.bytes,
    width: ref.width,
    height: ref.height,
    ...(ref.name === undefined ? {} : { name: ref.name }),
  }
}

/** The model-facing text beside the image blocks. */
function summaryText(value: ImageToolValue): string {
  const paths = value.images.map(image => image.filePath)
  const lines = [
    value.images.length === 1
      ? `已生成 1 张图片（${value.model}），已附到对话。`
      : `已生成 ${value.images.length} 张图片（${value.model}），已全部附到对话。`,
    `size ${value.paramsUsed.size} · quality ${value.paramsUsed.quality} · n ${value.paramsUsed.n}`,
    `落盘：${paths.join('、')}`,
    value.revisions.length > 0 ? `参数回退：${value.revisions.join('、')}` : '',
    '图片已在对话里，直接回复用户即可，不要调用 read、glob 或其他工具去找或验证图片。',
  ]
  return lines.filter(line => line.length > 0).join('\n')
}

/**
 * Register the native tool. The registration goes through the host's
 * `tools.register` under the primary name; a name that is already taken
 * (a dsh-image-gen install owns `generate_image`) falls back to
 * `dsh_image_generate` with one warning — a hard failure here would take the
 * whole plugin down over a name.
 * @returns the registered name (the client's keyed image card reads it back
 *   over the config route) and the disposer that unregisters the tool.
 */
export function registerGenerateImageTool(ctx: Context, deps: ImageToolDeps): { readonly name: string; readonly dispose: () => void } {
  const tools = (ctx as unknown as { tools: ImageToolsLike }).tools
  const definitionFor = (name: string): unknown => ({
    name,
    description: '用当前配置的生图模型生成图片并直接附到对话。用户要画图、生成、出图时调用；改图请带参考图。参数一律缺省（读配置默认），除非用户明确点名。不要虚构图片 URL。',
    parameters: TOOL_PARAMETERS,
    output: {
      schema: OUTPUT_SCHEMA,
      render: (_args: unknown, value: ImageToolValue) => [
        { type: 'text' as const, text: summaryText(value) },
        ...value.images.map(image => ({ type: 'image' as const, attachment: image.attachment })),
      ],
      presentationMeta: (_args: unknown, value: ImageToolValue) => ({
        kind: 'dsh-model-think-level-image',
        model: value.model,
        prompt: value.prompt,
        paramsUsed: value.paramsUsed,
        revisions: [...value.revisions],
        images: value.images.map(image => ({ attachment: image.attachment, filePath: image.filePath })),
      }),
    },
    async execute(rawArgs: unknown, exec: { signal: AbortSignal }): Promise<ImageToolValue> {
      const parsed = parseArgs(rawArgs)
      if (typeof parsed === 'string') throw new Error(parsed)
      // Conversation attachments become reference BYTES through the attachment
      // store — never a temp file, never a path the model could get wrong.
      const referenceFiles = []
      for (const [index, id] of (parsed.referenceAttachments ?? []).entries()) {
        try {
          const stored = await deps.attachments.readImage(attachmentRefOf(id), exec.signal)
          const name = stored.ref?.name ?? `reference-${index + 1}.png`
          referenceFiles.push({ name, mime: stored.ref?.mediaType ?? 'image/png', bytes: stored.data })
        } catch (error) {
          throw new Error(`参考图（附件 ${id}）不可读：${error instanceof Error ? error.message : String(error)}`)
        }
      }
      const result = await generateImage(deps.generateDeps, {
        prompt: parsed.prompt,
        ...(parsed.model === undefined ? {} : { model: parsed.model }),
        ...(parsed.size === undefined ? {} : { size: parsed.size }),
        ...(parsed.quality === undefined ? {} : { quality: parsed.quality }),
        ...(parsed.n === undefined ? {} : { n: parsed.n }),
        ...(parsed.referenceImages === undefined ? {} : { referenceImages: parsed.referenceImages }),
        ...(referenceFiles.length > 0 ? { referenceFiles } : {}),
        ...(parsed.outputPath === undefined ? {} : { outputPath: parsed.outputPath }),
        signal: exec.signal,
      })
      const images: ImageToolImage[] = []
      for (const image of result.images) {
        const bytes = Uint8Array.from(atob(image.data), ch => ch.charCodeAt(0))
        const attachment = await deps.attachments.saveImage({ data: bytes, mediaType: result.mime, name: 'generated-image' })
        images.push({ attachment: attachmentValueOf(attachment), filePath: image.filePath })
      }
      return {
        images,
        model: result.model,
        prompt: result.prompt,
        paramsUsed: result.paramsUsed,
        revisions: result.revisions,
      }
    },
    presentCall: (args: unknown) => {
      const record = typeof args === 'object' && args !== null ? (args as Record<string, unknown>) : {}
      return {
        card: 'generic' as const,
        title: '生成图片',
        kind: 'other' as const,
        rawInput: {
          prompt: typeof record['prompt'] === 'string' ? record['prompt'] : '',
          ...(typeof record['model'] === 'string' ? { model: record['model'] } : {}),
        },
      }
    },
    presentResult: (_args: unknown, result: { meta?: unknown }) => {
      const meta = result.meta as { images?: readonly { attachment: ImageToolImage['attachment'] }[] } | undefined
      const attachments = (meta?.images ?? []).map(entry => entry.attachment)
      if (attachments.length === 0) return undefined
      return {
        card: 'generic' as const,
        title: attachments.length === 1 ? '生成的图片' : `生成的图片（${attachments.length} 张）`,
        content: attachments.map(attachment => ({ type: 'image' as const, attachment })),
      }
    },
  })

  // Collision-safe naming: the primary name first, the prefixed fallback only
  // when the registry refuses (a dsh-image-gen install owns the plain name).
  let name = IMAGE_TOOL_NAME
  let disposer: unknown
  try {
    disposer = tools.register(definitionFor(name))
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    if (!/already registered/i.test(message)) throw error
    name = IMAGE_TOOL_NAME_FALLBACK
    deps.logger?.warn(`dsh-model-think-level: tool name "${IMAGE_TOOL_NAME}" is taken — registering the image tool as "${name}"`)
    disposer = tools.register(definitionFor(name))
  }
  return {
    name,
    dispose: () => {
      if (typeof disposer === 'function') (disposer as () => void)()
    },
  }
}

/** The system-prompt hint: which tool to call, what the defaults are. */
export function imageToolHint(config: ImageConfig): string {
  if (config.models.length === 0) return ''
  const defaultModel = config.defaultModel ?? config.models[0]?.id
  const lines = [
    `生图请调用 generate_image 工具（缺省参数即可：默认模型 ${String(defaultModel)}，size ${config.defaults.size}，quality ${config.defaults.quality}，n ${config.defaults.n}）。`,
    '用户没有点名模型或参数时，不要填 model/size/quality/n；改图用对话内图片的附件 ID 填 reference_attachments，本地文件填 reference_images。',
    '不要自己编造图片 URL，也不要用别的工具找生成的图片——成功后图片直接附在对话里。',
  ]
  return lines.join('\n')
}
