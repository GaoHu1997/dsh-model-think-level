/**
 * The `/生图` completion source's pure candidate logic (§4.8, 一期 = model-level).
 *
 * Two levels after the `/生图` trigger:
 *  1. the first token completes to an image model (label and full id, fuzzy
 *     over both, the default marked);
 *  2. after a model token (一期 stub): the param candidates arrive in 二期 —
 *     an empty list keeps the menu from showing a stale "nothing".
 *
 * Pure string logic — no DOM, no services — so the candidates are unit-testable
 * against the exact strings the menu will render.
 *
 * @module dsh-model-think-level/client/injection/imagegen-completion
 */

/** One completion candidate as the menu renders it. */
export interface ImagegenCandidate {
  /** The rendered line (what the user sees). */
  readonly label: string
  /** What lands in the draft when picked. */
  readonly insertText: string
  /** The candidate's class of thing (model | param) — ordering/uses tests. */
  readonly kind: 'model' | 'param'
  /** Extra hint shown beside the label, when one exists. */
  readonly hint?: string
}

/** A model the completion offers, straight from the config view's rows. */
export interface CompletionModel {
  readonly id: string
  readonly label: string
  readonly isDefault: boolean
}

/** Case-insensitive substring match over the haystack's words. */
function fuzzyMatch(haystack: string, needle: string): boolean {
  const lower = haystack.toLowerCase()
  const query = needle.toLowerCase()
  return query.length === 0 || lower.includes(query)
}

/**
 * The candidates for the text after `/生图`. A leading model token (or its
 * prefix) completes to models; everything else is the prompt — no candidates
 * (the command itself runs without completion noise over free text).
 */
export function imagegenCandidates(
  text: string,
  models: readonly CompletionModel[],
): readonly ImagegenCandidate[] {
  // Trim ONE leading space the menu usually leaves after the command word.
  const rest = text.replace(/^\s+/, '')
  if (rest.length === 0) {
    return models.map(model => ({
      label: model.isDefault ? `${model.label}（默认）` : model.label,
      insertText: model.id,
      kind: 'model',
      hint: model.id,
    }))
  }
  // Only the FIRST token is completable: after whitespace separates it from
  // the rest, the user is writing the prompt.
  const split = rest.match(/^(\S+)(\s+[\s\S]*)?$/)
  if (split === null) return []
  const token = split[1]!
  const matched = models.filter(model => fuzzyMatch(model.id, token) || fuzzyMatch(model.label, token))
  return matched.map(model => ({
    label: model.isDefault ? `${model.label}（默认）` : model.label,
    insertText: model.id,
    kind: 'model',
    hint: model.id,
  }))
}

/**
 * The `/生图` word itself, as the top-level slash completion shows it (the
 * menu that lists commands). Kept beside the candidates so the command's
 * display and its completion can never drift apart.
 */
export function imagegenCommandCandidate(): ImagegenCandidate {
  return { label: '生图', insertText: '生图 ', kind: 'param', hint: '用生图模型生成图片' }
}
