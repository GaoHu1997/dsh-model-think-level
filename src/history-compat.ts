/**
 * Responses history compatibility: replaying a topic whose upstream items were
 * created under a different backend resource.
 *
 * A relay that fans one route out over several upstream accounts mints item IDs
 * and encrypted reasoning under whichever account answered. A conversation that
 * starts on account A and is continued on account B is then refused with
 * `The requested item was created under a different Azure OpenAI resource. Use
 * the same resource that created the item to access it.` — a refusal about the
 * HISTORY, not about the key, the model or the prompt. Re-sending the identical
 * request fails forever, and rotating keys only multiplies failing attempts:
 * every key reaches the same relay, and the relay's own pool decides which
 * resource sees the request.
 *
 * The same fan-out produces a second wording when the pool keeps a tool call's
 * `fc_` handle but not the `rs_` reasoning item minted with it: the server
 * answers `Item 'fc_…' of type 'function_call' was provided without its
 * required 'reasoning' item: 'rs_…'`. That is the same condition — the replayed
 * history and the backend serving it disagree about the items — so it shares
 * one recognition point and one degradation ladder with the resource refusal.
 *
 * Two facts make this module structural rather than a fetch-layer patch:
 *
 * 1. The refusal arrives in more than one shape. A relay may answer `400` with
 *    the sentence in its body, or — much more often with streamed Responses —
 *    answer `200` and emit `response.failed` INSIDE the SSE stream. Both carry
 *    the same sentence, so the recovery must be driven by what the sentence
 *    says, not by which HTTP door it came through.
 * 2. The history the provider replays is assembled from the pi-ai message
 *    context, not from a JSON body this module could safely rewrite. Thinking
 *    blocks persist a serialized reasoning item in `thinkingSignature`, text
 *    blocks persist `{id, phase}` in `textSignature`, and tool calls persist
 *    `callId|itemId` in `id`. Degrading those fields is therefore a context
 *    transformation; the same conversation keeps working on the next turn
 *    because only the copy sent upstream is changed.
 *
 * The stages are the ones the relay world settled on, escalated only as far as
 * the provider demands:
 *
 * 1. `portable_ids` — drop the foreign item handle from every replayable block:
 *    the `id` inside a reasoning signature, the whole `textSignature`, and the
 *    `itemId` half of a tool call's `callId|itemId`. The server then treats the
 *    item as new instead of resolving a foreign handle. A text signature cannot
 *    keep its `phase` once the id is gone: pi-ai only reads `{v:1, id, phase?}`,
 *    and a signature without a string `id` is sent verbatim as the item id.
 *    This is also the repair for a split `fc_`/`rs_` pair: with no item handle
 *    on the function call, the server stops looking for its reasoning sibling.
 * 2. `drop_reasoning` — additionally stop replaying historical reasoning items
 *    altogether (the `thinkingSignature` is removed; the visible thinking text
 *    stays in the local history untouched). Reasoning is the other thing bound
 *    to the minting resource.
 *
 * What is deliberately NOT touched: `call_id` (it pairs a call with its output;
 * breaking the pair corrupts the turn), the thinking text itself, and any part
 * of the caller's stored conversation — cleanup rewrites the OUTGOING copy
 * only.
 *
 * @module dsh-model-think-level/history-compat
 */

import { isRecord } from './shared.js'

/** Upper bound on an error body this module is willing to read, in bytes. */
export const HISTORY_INSPECT_LIMIT = 65_536

/** How long an error body may take before inspection is abandoned. */
export const HISTORY_INSPECT_TIMEOUT_MS = 2_000

/**
 * The refusals this module answers to.
 *
 * Both are the same failure seen from two sides: a replayed item is checked
 * against the backend that minted its siblings, and the check fails.
 *
 * - `RESOURCE_MISMATCH` — the item id itself came from another resource
 *   ("created under a different … resource"). Azure words the sentence slightly
 *   differently across deployments, so the patterns anchor on the two halves
 *   that carry the meaning and nothing broader.
 * - `ITEM_PAIRING_MISMATCH` — the id is accepted, but the reasoning item it was
 *   minted with is missing: `Item 'fc_…' of type 'function_call' was provided
 *   without its required 'reasoning' item: 'rs_…'`. This is what a relay
 *   produces when it keeps a tool call's `fc_` handle while dropping (or failing
 *   to replay) the paired `rs_` reasoning item — the same foreign-history
 *   problem with the handle kept instead of the resource swapped. Removing the
 *   tool call's item half (`portable_ids`) makes the function call look new, so
 *   the server no longer looks for a pair.
 *
 * A generic failure must fall through untouched: silently degrading the history
 * of a request that failed for an unrelated reason would hide the real error and
 * spend attempts on it.
 */
const RESOURCE_MISMATCH: readonly RegExp[] = [
  /created under a different [a-z0-9 ._-]{0,48}?resource/i,
  /same resource that created the item/i,
]

/** A tool-call/reasoning pair split by the relay. See {@link RESOURCE_MISMATCH}. */
const ITEM_PAIRING_MISMATCH: readonly RegExp[] = [
  /provided without its required [^\n]{0,40}?reasoning/i,
]

/**
 * Whether a provider message is one of the foreign-history refusals: an item
 * minted under another backend resource, or a tool call whose paired reasoning
 * item the relay no longer replays.
 * @param text - the error body or stream error message, decoded.
 * @returns whether the history (not the request shape) is what failed.
 */
export function isHistoryStateMismatch(text: string): boolean {
  return RESOURCE_MISMATCH.some(pattern => pattern.test(text))
    || ITEM_PAIRING_MISMATCH.some(pattern => pattern.test(text))
}

/** One recovery step. `drop_reasoning` also applies `portable_ids`. */
export const HISTORY_STAGES = ['portable_ids', 'drop_reasoning'] as const

/** One recovery step. `drop_reasoning` also applies `portable_ids`. */
export type HistoryStage = (typeof HISTORY_STAGES)[number]

/**
 * Rewrite the OUTGOING message context for one recovery stage.
 *
 * The returned context shares every untouched message with the input; only the
 * assistant messages that carry a foreign handle are copied. The caller's own
 * context is never mutated, which is what lets the next turn replay the topic
 * exactly as it was stored.
 *
 * @param context - the pi-ai request context (`{ systemPrompt, messages, tools }`).
 * @param stage - how far the recovery may go.
 * @returns a degraded copy, or undefined when this stage changes nothing.
 */
export function degradeForHistory(context: unknown, stage: HistoryStage): Record<string, unknown> | undefined {
  if (!isRecord(context)) return undefined
  const messages = context['messages']
  if (!Array.isArray(messages)) return undefined

  let changed = 0
  const nextMessages = messages.map(message => {
    if (!isRecord(message) || message['role'] !== 'assistant') return message
    const content = message['content']
    if (!Array.isArray(content)) return message

    let messageChanged = false
    const nextContent = content.map(block => {
      if (!isRecord(block)) return block
      const degraded = degradeBlock(block, stage)
      if (degraded === undefined) return block
      messageChanged = true
      return degraded
    })
    if (!messageChanged) return message
    changed += 1
    return { ...message, content: nextContent }
  })

  if (changed === 0) return undefined
  return { ...context, messages: nextMessages }
}

/**
 * Degrade one content block, following the exact fields pi-ai replays:
 * `thinkingSignature` (a serialized reasoning item), `textSignature`
 * (`{v, id, phase?}`) and the `callId|itemId` pair on tool calls.
 */
function degradeBlock(block: Record<string, unknown>, stage: HistoryStage): Record<string, unknown> | undefined {
  const type = block['type']

  if (type === 'thinking') {
    const signature = block['thinkingSignature']
    if (typeof signature !== 'string') return undefined
    if (stage === 'drop_reasoning') {
      const copy = { ...block }
      delete copy['thinkingSignature']
      return copy
    }
    const stripped = stripSignatureId(signature)
    return stripped === undefined ? undefined : { ...block, thinkingSignature: stripped }
  }

  if (type === 'text') {
    const signature = block['textSignature']
    if (typeof signature !== 'string') return undefined
    // pi-ai's parseTextSignature returns the signature's id only when `v === 1`
    // and `id` is a string. Removing `id` and leaving `{"v":1,"phase":"commentary"}`
    // makes the JSON itself the item id (`__v__1__phase___commentary__`), which
    // the relay rejects. Drop the field so pi-ai assigns `msg_pi_*`.
    if (stripSignatureId(signature) === undefined) return undefined
    const copy = { ...block }
    delete copy['textSignature']
    return copy
  }

  if (type === 'toolCall') {
    const id = block['id']
    if (typeof id !== 'string' || !id.includes('|')) return undefined
    // pi-ai splits `callId|itemId` on replay; without the second half the
    // provider gets no item handle while the call/output pairing survives.
    return { ...block, id: id.slice(0, id.indexOf('|')) }
  }

  return undefined
}

/** Remove the top-level `id` from a serialized signature, if it has one. */
function stripSignatureId(signature: string): string | undefined {
  let parsed: unknown
  try {
    parsed = JSON.parse(signature) as unknown
  } catch {
    // A signature this module cannot parse is not one it may rewrite.
    return undefined
  }
  if (!isRecord(parsed) || !Object.hasOwn(parsed, 'id')) return undefined
  const copy: Record<string, unknown> = { ...parsed }
  delete copy['id']
  return JSON.stringify(copy)
}

/**
 * Whether a response is one this module should read at all.
 *
 * Two doors carry the refusal: `400` (the request-shaped answer) and `5xx` (a
 * relay that wraps the upstream rejection as its own failure). Auth, quota and
 * not-found answers are never this case, and reading them would only delay the
 * ordinary error path.
 */
export function isHistoryRefusalCandidate(response: Response): boolean {
  return response.status === 400 || response.status >= 500
}

/**
 * Re-encode a foreign-history refusal as a JSON provider error.
 *
 * The fetch seam cannot recover the history itself (it only holds bytes), but
 * it is the only layer that sees a non-2xx body before the provider SDK turns
 * it into an opaque message. Wrapping the refusal sentence in a JSON error body
 * keeps the HTTP status intact and guarantees the sentence survives into the
 * stream error, where the request seam recognises it and replays a degraded
 * history.
 *
 * @param response - the provider's error response.
 * @returns the replacement response, or undefined when this is not the refusal.
 */
export async function reencodeHistoryRefusal(response: Response): Promise<Response | undefined> {
  if (!isHistoryRefusalCandidate(response)) return undefined
  const text = await readErrorBody(response)
  if (text === undefined || !isHistoryStateMismatch(text)) return undefined
  return new Response(
    JSON.stringify({
      error: {
        type: response.status === 400 ? 'invalid_request_error' : 'server_error',
        message: text,
      },
    }),
    {
      status: response.status,
      statusText: response.statusText,
      headers: { 'content-type': 'application/json' },
    },
  )
}

/**
 * Read at most {@link HISTORY_INSPECT_LIMIT} bytes of an error body, giving up
 * after {@link HISTORY_INSPECT_TIMEOUT_MS}.
 *
 * The read happens on a CLONE, so the caller still owns the original response.
 * Nothing here throws: an unreadable, oversized or slow body is simply "not
 * inspected", which leaves the request on the ordinary error path.
 */
async function readErrorBody(response: Response): Promise<string | undefined> {
  let clone: Response
  try {
    clone = response.clone()
  } catch {
    return undefined
  }
  const reader = clone.body?.getReader()
  if (reader === undefined) return undefined

  let expired = false
  const timer = setTimeout(() => {
    expired = true
    // Cancelling settles the pending read; the timer exists so a relay that
    // opens the body and stalls cannot hold the request hostage.
    void reader.cancel().catch(() => {
      // Best-effort: the answer is already "not inspected".
    })
  }, HISTORY_INSPECT_TIMEOUT_MS)

  const chunks: Uint8Array[] = []
  let total = 0
  try {
    for (;;) {
      const { done, value } = await reader.read()
      if (expired) return undefined
      if (done) break
      if (value === undefined) continue
      total += value.byteLength
      if (total > HISTORY_INSPECT_LIMIT) {
        // Over budget is NOT the narrow case this module handles; the caller
        // keeps the original response and the ordinary error path.
        return undefined
      }
      chunks.push(value)
    }
  } catch {
    return undefined
  } finally {
    clearTimeout(timer)
  }

  const merged = new Uint8Array(total)
  let offset = 0
  for (const chunk of chunks) {
    merged.set(chunk, offset)
    offset += chunk.byteLength
  }
  return new TextDecoder().decode(merged)
}
