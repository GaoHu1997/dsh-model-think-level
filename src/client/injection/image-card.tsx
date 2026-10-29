/**
 * The keyed image card: the `tool.call.toolview` entry that renders the
 * `generate_image` tool's result as actual pictures in the conversation.
 *
 * Without this entry the generic tool row shows only the result's TEXT — its
 * image body (`imageCardModel`) is hard-wired to `read_image` — so the
 * generated image would never be visible even though the durable result
 * carries it. The card therefore reads the image blocks straight from the
 * persisted result content and renders them through the OFFICIAL
 * `tool.call.images` child slot (`dsh-client-ui-attachment`'s gallery), which
 * needs no plugin-owned fetch route: the bytes load through the host's own
 * attachment pipeline. Declaring `tool.call.images` under `children` is what
 * authorizes the entry's `renderSlot` to dispatch it.
 *
 * The card is registered under the tool name the HOST reports (the config
 * route's `tool.name`), because a dsh-image-gen install can own the plain
 * `generate_image` key — the host then registers this plugin's tool under the
 * fallback name, and the card must follow the tool, never the wishful name.
 *
 * @module dsh-model-think-level/client/injection/image-card
 */

import { createElement } from 'react'
import type { ReactNode } from 'react'
import { cachedImageConfigView, readImageConfigView } from '../image-config-client.js'
import type { ClientContext, SlotRegistrarFace } from '../types.js'
import type { Translate } from '@deepseek-ai/dsh-client-ui-slots'

/** The slot name the official gallery renders under. */
const IMAGES_SLOT = 'tool.call.images'

/** One attachment reference as the official gallery consumes it. */
interface ImageRefLike {
  readonly attachment: {
    readonly attachmentId: string
    readonly mediaType: string
    readonly bytes: number
    readonly width: number
    readonly height: number
    readonly name?: string
  }
}

/** The block face the toolview slot occurrence carries, narrowed to what this card reads. */
interface ToolBlockLike {
  /** Settled marker: a running call carries `phase` instead. */
  readonly kind?: string
  readonly phase?: string
  readonly content?: readonly { readonly type: string; readonly text?: string; readonly attachment?: ImageRefLike['attachment'] }[]
  readonly resultView?: {
    readonly content?: readonly { readonly type: string; readonly text?: string; readonly attachment?: ImageRefLike['attachment'] }[]
  }
  readonly meta?: {
    readonly model?: string
    readonly paramsUsed?: { readonly size?: string; readonly quality?: string; readonly n?: number }
    readonly revisions?: readonly string[]
    readonly images?: readonly { readonly filePath?: string }[]
  }
}

/** The occurrence props the Tool row hands a keyed toolview entry. */
interface ImageCardProps {
  readonly block?: ToolBlockLike
  readonly renderSlot?: (name: string, props: Record<string, unknown>) => ReactNode
  readonly loadImage?: (ref: ImageRefLike['attachment']) => unknown
}

/** The image attachments one settled result carries, in order. */
export function imageRefsOf(block: ToolBlockLike | undefined): readonly ImageRefLike[] {
  if (block === undefined || typeof block !== 'object') return []
  const content = block.resultView?.content ?? block.content
  if (!Array.isArray(content)) return []
  const refs: ImageRefLike[] = []
  for (const part of content) {
    if (part !== null && typeof part === 'object' && (part as { type?: string }).type === 'image') {
      const attachment = (part as { attachment?: ImageRefLike['attachment'] }).attachment
      if (attachment !== undefined && typeof attachment.attachmentId === 'string') refs.push({ attachment })
    }
  }
  return refs
}

/** The first text block of one settled result (the error sentence on failure). */
function textOf(block: ToolBlockLike): string | null {
  const content = Array.isArray(block.content) ? block.content : []
  for (const part of content) {
    if (part !== null && typeof part === 'object' && part.type === 'text' && typeof part.text === 'string') return part.text
  }
  return null
}

/** The one-line caption under the gallery: model, effective params, file paths. */
function captionOf(block: ToolBlockLike): string | null {
  const meta = block.meta
  if (meta === undefined || typeof meta !== 'object') return null
  const lines: string[] = []
  const params = meta.paramsUsed
  if (typeof meta.model === 'string' && meta.model.length > 0) {
    lines.push(params === undefined ? meta.model : `${meta.model} · ${params.size} · ${params.quality} · n ${params.n}`)
  }
  const paths = (meta.images ?? []).map(entry => entry.filePath).filter((path): path is string => typeof path === 'string')
  if (paths.length > 0) lines.push(paths.join('\n'))
  if (Array.isArray(meta.revisions) && meta.revisions.length > 0) lines.push(meta.revisions.join('、'))
  return lines.length > 0 ? lines.join('\n') : null
}

/** The card component: gallery through the official slot, caption under it. */
export function ImageToolCard(props: ImageCardProps & { t: Translate }): ReactNode {
  const block = props.block
  const settled = block !== undefined && typeof block === 'object' && 'kind' in block
  if (!settled) {
    return createElement('div', { className: 'bre-image-card', 'aria-busy': true },
      createElement('span', { className: 'bre-image-card-running' }, props.t('imagegenCardRunning')),
    )
  }
  const images = imageRefsOf(block)
  if (images.length === 0) {
    const text = textOf(block)
    return createElement('div', { className: 'bre-image-card' },
      text === null ? null : createElement('div', { className: 'bre-image-card-caption' }, text),
    )
  }
  const caption = captionOf(block)
  return createElement('div', { className: 'bre-image-card' },
    typeof props.renderSlot === 'function' && typeof props.loadImage === 'function'
      ? props.renderSlot(IMAGES_SLOT, { images, loadImage: props.loadImage, align: 'start' })
      : null,
    caption === null ? null : createElement('div', { className: 'bre-image-card-caption' }, caption),
  )
}

/** Register one keyed entry under `name`. @returns the disposer. */
function registerFor(slots: SlotRegistrarFace | undefined, name: string, t: Translate): () => void {
  if (slots === undefined) return () => {}
  let dispose: (() => void) | undefined
  try {
    const registrar = slots.register.bind(slots) as (options: Record<string, unknown>, component: unknown) => () => void
    const injected = slots.inject('tool.call.toolview', () => registrar({
      name: 'tool.call.toolview',
      key: name,
      // Declaring the official gallery as a child slot is what authorizes this
      // entry's renderSlot to dispatch it (the read_image row's precedent).
      children: { [IMAGES_SLOT]: { kind: 'single', scope: 'session' } },
    }, (occurrence: ImageCardProps) => ImageToolCard({ ...occurrence, t })))
    if (typeof injected === 'function') dispose = injected as () => void
  } catch {
    // A host without the toolview slot keeps the generic text row.
    return () => {}
  }
  return () => { dispose?.() }
}

/**
 * Register the image card under the tool name the host reports. The name is
 * a host-side fact (the collision fallback may have renamed the tool), so the
 * registration waits for one config read when the cache is cold; a host that
 * never answers leaves no card and the generic row stays.
 */
export function registerImageCard(ctx: ClientContext, t: Translate): void {
  const slots = (ctx as unknown as { slots?: SlotRegistrarFace }).slots
  ctx.effect(() => {
    let disposeCard: (() => void) | undefined
    let alive = true
    const tryRegister = (name: unknown): void => {
      if (!alive || disposeCard !== undefined) return
      if (typeof name !== 'string' || name.length === 0) return
      disposeCard = registerFor(slots, name, t)
    }
    tryRegister(cachedImageConfigView()?.tool.name)
    if (disposeCard === undefined) {
      void readImageConfigView().then(answer => {
        if (answer.ok) tryRegister(answer.data.tool.name)
      }).catch(() => {
        // No config read, no card: the generic row keeps showing the text.
      })
    }
    return () => {
      alive = false
      disposeCard?.()
    }
  }, 'dsh-model-think-level: image tool card')
}
