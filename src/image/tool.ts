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
import { createGenerateDeadline, generateImage, type GenerateDeps } from './generate.js'
import { resolveImageModel, type ImageConfig } from './config.js'

/** The attachment-store face this tool needs, typed structurally. */
export interface ImageAttachmentsLike {
  /** Optional adapter signal; one-argument host stores still require a local deadline race. */
  saveImage(input: { data: Uint8Array; mediaType: string; name?: string }, signal?: AbortSignal):
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

/**
 * The model-facing JSON schema of the canonical value — RAW JSON Schema only.
 *
 * `tools.register` calls `assertSupportedJsonSchema(output.schema)` without any
 * author-dialect conversion (that is `defineTool`'s job, and this plugin
 * registers directly), so the accepted vocabulary is exactly
 * type/oneOf/properties/required/additionalProperties/items/enum/const plus the
 * annotations description/title/default/examples. In particular `required` is
 * an ARRAY OF PROPERTY NAMES on an OBJECT — never a per-node boolean. Writing
 * the harness author dialect here (`required: true` inside a property) throws
 * `JsonSchemaError` out of `register`, which fails the whole tools injection
 * and leaves the tool permanently unregistered.
 */
const OUTPUT_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['images', 'model', 'prompt', 'paramsUsed'],
  properties: {
    images: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['attachment', 'filePath'],
        properties: {
          attachment: {
            type: 'object',
            additionalProperties: false,
            required: ['attachmentId', 'mediaType', 'bytes', 'width', 'height'],
            properties: {
              attachmentId: { type: 'string' },
              mediaType: { type: 'string' },
              bytes: { type: 'integer' },
              width: { type: 'integer' },
              height: { type: 'integer' },
              name: { type: 'string' },
            },
          },
          filePath: { type: 'string' },
        },
      },
    },
    model: { type: 'string' },
    prompt: { type: 'string' },
    paramsUsed: {
      type: 'object',
      additionalProperties: false,
      required: ['size', 'quality', 'n'],
      properties: {
        size: { type: 'string' },
        quality: { type: 'string' },
        n: { type: 'integer' },
      },
    },
    revisions: { type: 'array', items: { type: 'string' } },
  },
}

/** The model-facing argument schema — object-rooted RAW JSON Schema, same rules. */
const TOOL_PARAMETERS = {
  type: 'object',
  additionalProperties: false,
  required: ['prompt'],
  properties: {
    prompt: { type: 'string', description: '完整画面描述：主体、构图、风格、光照，以及需要出现的文字。' },
    model: { type: 'string', description: '生图模型（route/modelId 或显示名）；缺省用配置页的默认模型，用户没有点名时省略。' },
    size: { type: 'string', description: '如 1024x1024；缺省取模型行 → 默认参数。用户没有点名时省略。' },
    quality: { type: 'string', description: '如 high；缺省取模型行 → 默认参数。用户没有点名时省略。' },
    n: { type: 'integer', description: '生成张数；缺省取模型行 → 默认参数，超过该模型上限时报错并列出允许值。' },
    reference_images: { type: 'array', items: { type: 'string' }, description: '本地参考图路径；非空走 /images/edits。' },
    reference_attachments: { type: 'array', items: { type: 'string' }, description: '对话内图片的附件 ID（sha256:… 或裸摘要）；与本地路径可混用。' },
    path: { type: 'string', description: '落盘文件（以 .png 结尾，存在则自动加 -2 后缀，不覆盖）或目录；缺省 generated-images/<slug>-<ts>.png。' },
  },
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

/** Shared by the tool schema, success text and system hint: cards alone are not the final reply. */
const IMAGE_REPLY_HINT = '生图成功后，最终回复必须逐张直接嵌入所有生成的图片：用返回的真实 filePath 写 ![图片说明](<filePath>)，Windows 路径用 /。不能只说“图片已生成/已附到对话”，不能只放文件链接或依赖工具卡片。'

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
    IMAGE_REPLY_HINT,
    '可直接复制到最终回复的图片 Markdown：',
    ...paths.map((path, index) => `![生成的图片 ${index + 1}](<${path.replace(/\\/g, '/')}>)`),
    '不要虚构图片 URL，也不要调用 read、glob 或其他工具去找或验证图片；直接使用上面的真实路径嵌图。',
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
    description: `用当前配置的生图模型生成图片并直接附到对话。用户要画图、生成、出图时调用；改图请带参考图。参数一律缺省（读配置默认），除非用户明确点名。不要虚构图片 URL。${IMAGE_REPLY_HINT}`,
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
      // Snapshot once so references, generation and saves share the SAME budget
      // and config, rather than starting another full timeout inside the core.
      const config = deps.generateDeps.config?.() ?? deps.readConfig()
      const deadline = createGenerateDeadline(deps.generateDeps.timeoutMs ?? config.defaults.timeoutMs, exec.signal)
      try {
        deadline.check()
        // Conversation attachments become bytes, never temporary files.
        const referenceFiles = []
        for (const [index, id] of (parsed.referenceAttachments ?? []).entries()) {
          try {
            const stored = await deadline.run(() => deps.attachments.readImage(attachmentRefOf(id), deadline.signal))
            const name = stored.ref?.name ?? `reference-${index + 1}.png`
            referenceFiles.push({ name, mime: stored.ref?.mediaType ?? 'image/png', bytes: stored.data })
          } catch (error) {
            deadline.check()
            throw new Error(`参考图（附件 ${id}）不可读：${error instanceof Error ? error.message : String(error)}`)
          }
        }
        const result = await generateImage({ ...deps.generateDeps, config: () => config }, {
          prompt: parsed.prompt,
          ...(parsed.model === undefined ? {} : { model: parsed.model }),
          ...(parsed.size === undefined ? {} : { size: parsed.size }),
          ...(parsed.quality === undefined ? {} : { quality: parsed.quality }),
          ...(parsed.n === undefined ? {} : { n: parsed.n }),
          ...(parsed.referenceImages === undefined ? {} : { referenceImages: parsed.referenceImages }),
          ...(referenceFiles.length > 0 ? { referenceFiles } : {}),
          ...(parsed.outputPath === undefined ? {} : { outputPath: parsed.outputPath }),
          signal: deadline.signal,
        }, deadline)
        const images: ImageToolImage[] = []
        for (const image of result.images) {
          deadline.check()
          const bytes = Uint8Array.from(atob(image.data), ch => ch.charCodeAt(0))
          const attachment = await deadline.run(() => deps.attachments.saveImage({ data: bytes, mediaType: result.mime, name: 'generated-image' }, deadline.signal))
          images.push({ attachment: attachmentValueOf(attachment), filePath: image.filePath })
        }
        deadline.check()
        return {
          images,
          model: result.model,
          prompt: result.prompt,
          paramsUsed: result.paramsUsed,
          revisions: result.revisions,
        }
      } catch (error) {
        deadline.check()
        throw error
      } finally {
        deadline.dispose()
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

/**
 * The system-prompt hint: which tool to call, what the defaults are.
 *
 * It must describe the SAME model `resolveImageModel` will pick, or the model
 * follows the hint, omits `model`, and gets a `config` error. So the hint asks
 * the resolver itself instead of guessing `models[0]`: with no default set and
 * several candidates the resolver refuses, and the hint then has to say so —
 * naming a model there is a promise the call cannot keep.
 */
export function imageToolHint(config: ImageConfig): string {
  if (config.models.length === 0) return ''
  const defaults = `size ${config.defaults.size}，quality ${config.defaults.quality}，n ${config.defaults.n}`
  const resolved = resolveImageModel(config)
  const opening = resolved === undefined
    ? `生图请调用 generate_image 工具。当前没有唯一的默认生图模型（共 ${config.models.length} 个候选），调用时必须显式填 model，可选值：${config.models.map((model) => model.id).join('、')}；size/quality/n 可缺省（默认 ${defaults}）。`
    : `生图请调用 generate_image 工具（缺省参数即可：默认模型 ${resolved.id}，${defaults}）。`
  const lines = [
    opening,
    resolved === undefined
      ? '用户没有点名模型时，先问清用哪个模型，不要自己挑一个——猜错的模型会直接生成失败。改图用对话内图片的附件 ID 填 reference_attachments，本地文件填 reference_images。'
      : '用户没有点名模型或参数时，不要填 model/size/quality/n；改图用对话内图片的附件 ID 填 reference_attachments，本地文件填 reference_images。',
    '不要自己编造图片 URL，也不要用别的工具找生成的图片——成功后工具会返回附件和真实 filePath。',
    IMAGE_REPLY_HINT,
  ]
  return lines.join('\n')
}
