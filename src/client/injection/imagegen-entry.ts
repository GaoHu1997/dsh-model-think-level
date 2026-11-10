/**
 * `/生图` 的客户端补全：每次读取宿主的当前模型，只有同时在途的 GET
 * 可以共享。成功、失败、空列表都不保留完成后的模型缓存。
 */

import { imagegenCandidates, type CompletionModel } from './imagegen-completion.js'
import { onImageConfigChanged, readImageConfigView } from '../image-config-client.js'
import type { ClientContext } from '../types.js'

interface InputTriggersLike {
  registerSource(source: {
    trigger: string
    name: string
    order?: number
    candidates: (projection: { text?: string }, context: { signal?: AbortSignal }) =>
      readonly unknown[] | Promise<readonly unknown[]>
  }): unknown
}

let modelRead: Promise<readonly CompletionModel[]> | undefined
let modelReadVersion = 0

/** 保存偏好或宿主事件发生后，新的补全不复用旧的在途 GET。 */
export function invalidateImagegenModels(): void {
  modelRead = undefined
  modelReadVersion += 1
}

function completionModels(): Promise<readonly CompletionModel[]> {
  if (modelRead !== undefined) return modelRead
  const version = modelReadVersion
  const pending = readImageConfigView().then(answer => version === modelReadVersion && answer.ok && answer.data.enabled
    ? answer.data.models.map(model => ({
      id: model.id,
      label: model.label,
      isDefault: answer.data.defaultModel === model.id,
    }))
    : []).catch(() => []).finally(() => {
    if (modelRead === pending) modelRead = undefined
  })
  modelRead = pending
  return pending
}

/** Register the optional input-trigger source. */
export function registerImagegenCompletion(ctx: ClientContext): () => void {
  // Cordis throws when an undeclared optional service is read.
  let inputTriggers: InputTriggersLike | undefined
  try {
    inputTriggers = (ctx as unknown as { inputTriggers?: InputTriggersLike }).inputTriggers
  } catch {
    inputTriggers = undefined
  }
  const unsubscribe = onImageConfigChanged(invalidateImagegenModels)
  if (inputTriggers === undefined || typeof inputTriggers.registerSource !== 'function') return unsubscribe
  let registered = true
  try {
    inputTriggers.registerSource({
      trigger: '/', name: 'imagegen', order: 900,
      candidates: (projection: { text?: string }, context: { signal?: AbortSignal } = {}) => {
        if (!registered || context.signal?.aborted) return []
        const text = typeof projection?.text === 'string' ? projection.text : ''
        if (!/^\/?生图(?:\s|$)/.test(text)) return []
        return completionModels().then(models => registered && !context.signal?.aborted
          ? imagegenCandidates(text.replace(/^\/?生图/, ''), models)
          : [])
      },
    })
  } catch {
    registered = false
  }
  return () => {
    // Older hosts expose no source unregister method.
    registered = false
    unsubscribe()
  }
}
