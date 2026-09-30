/**
 * A stand-in for the piece of the host's Models page the model-order pass
 * reads: one provider row holding a `modelList` of `modelEntry` rows.
 *
 * The class names are the host's own hashed ones, because that is what the
 * probing in `model-order-drag.ts` keys off (`[class*="modelList"]`,
 * `[class*="modelEntry"]`, `[class*="modelRow"]`). Everything the pass ignores
 * is left out; the parts it needs are shaped exactly as the host renders them.
 */
export interface FixtureModel {
  readonly id: string
  readonly name?: string
}

export interface FixtureOptions {
  /** Skip the `[data-bre-provider]` stamp, leaving only the label fallback. */
  readonly stamped?: boolean
  /** Override the provider button's label, e.g. to defeat the label template. */
  readonly editLabel?: string
}

/**
 * Build the page and mount it on `document.body`.
 *
 * `list` is the model list itself — the `modelList` div the pass finds and
 * reorders, whose children are the entries — not the `ul` of provider rows that
 * contains it.
 */
export function officialModelPage(
  provider: string,
  models: readonly FixtureModel[],
  options: FixtureOptions = {},
): { list: HTMLElement } {
  const list = document.createElement('ul')
  list.className = '_3nPmjq_rows'
  const card = document.createElement('li')
  card.className = '_3nPmjq_rowCard'

  const head = document.createElement('div')
  head.className = '_3nPmjq_rowHead'
  const identity = document.createElement('span')
  identity.className = '_3nPmjq_rowIdentity'
  const name = document.createElement('span')
  name.className = '_3nPmjq_rowName'
  name.textContent = provider
  identity.appendChild(name)
  head.appendChild(identity)
  const actions = document.createElement('span')
  actions.className = '_3nPmjq_rowActions'
  const edit = document.createElement('button')
  edit.setAttribute('aria-label', options.editLabel ?? `Edit ${provider} (${provider})`)
  actions.appendChild(edit)
  head.appendChild(actions)
  card.appendChild(head)

  if (options.stamped !== false) {
    const host = document.createElement('div')
    host.className = 'bre-headers-host'
    host.setAttribute('data-bre-provider', provider)
    card.appendChild(host)
  }

  const modelList = document.createElement('div')
  modelList.className = '_3nPmjq_modelList'
  models.forEach((model, index) => {
    const entry = document.createElement('div')
    entry.className = '_3nPmjq_modelEntry'
    const grid = document.createElement('div')
    grid.className = '_3nPmjq_modelRow'
    const position = index + 1
    const idInput = document.createElement('input')
    idInput.setAttribute('aria-label', `Model ID ${position}`)
    idInput.value = model.id
    const nameInput = document.createElement('input')
    nameInput.setAttribute('aria-label', `Display name ${position}`)
    nameInput.value = model.name ?? model.id
    grid.append(idInput, nameInput, document.createElement('button'), document.createElement('button'))
    entry.appendChild(grid)
    const advanced = document.createElement('div')
    advanced.className = '_3nPmjq_modelAdvanced'
    entry.appendChild(advanced)
    modelList.appendChild(entry)
  })
  card.appendChild(modelList)
  list.appendChild(card)
  document.body.appendChild(list)
  return { list: modelList }
}
