// @vitest-environment jsdom
/**
 * The Models-page title-row seat: the `findModelsTitleRow()` anchor (hit /
 * other page / structural drift), the seat's idempotence, and its teardown —
 * the anchor is a DOM coincidence on purpose, so the fixtures are shaped
 * exactly like the host renders it. The host nests `ul.jrmgQW_rows` (the
 * provider cards) SIBLING to `h2.jrmgQW_title` inside `div.jrmgQW_section`;
 * an earlier host version kept both as direct children of the content column,
 * so both shapes are pinned here.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  CONFIG_HOST_CLASS,
  CONFIG_TITLE_LINE_CLASS,
  createConfigButtonSeatState,
  ensureConfigButtonSeat,
  findModelsTitleRow,
  teardownConfigButtonSeats,
} from '../src/client/injection/config-button-seat.js'

let t: (key: string) => string

beforeEach(() => {
  t = key => key
})

afterEach(() => {
  document.body.innerHTML = ''
  vi.restoreAllMocks()
})

/** The host's real shape: section > h2.title + p.intro + ul.rows > li.rowCard.
 * Returns the heading, which IS the anchor (and the line the seat joins). */
function mountModelsPage(): { content: HTMLElement; section: HTMLElement; row: HTMLElement; list: HTMLElement } {
  const content = document.createElement('div')
  content.className = 'AnXs9G_options'
  const column = document.createElement('div')
  const section = document.createElement('div')
  section.className = 'jrmgQW_section'
  const row = document.createElement('h2')
  row.className = 'jrmgQW_title'
  row.textContent = '模型'
  const intro = document.createElement('p')
  intro.className = 'jrmgQW_intro'
  intro.textContent = '填入各提供商的 API 密钥即可使用其模型。'
  const list = document.createElement('ul')
  list.className = 'jrmgQW_rows'
  const card = document.createElement('li')
  card.className = 'jrmgQW_rowCard'
  card.textContent = 'OpenAI'
  list.appendChild(card)
  section.append(row, intro, list)
  column.append(section)
  content.append(column)
  document.body.appendChild(content)
  return { content, section, row, list }
}

/** The earlier host shape: title row (title + spacer) and cards as siblings
 * directly in the content column. */
function mountLegacyTitleRow(): { content: HTMLElement; row: HTMLElement; title: HTMLElement } {
  const content = document.createElement('div')
  content.className = '_2Abc_content'
  const row = document.createElement('div')
  row.className = '_2Abc_pageHeader'
  const title = document.createElement('div')
  title.className = '_2Abc_pageTitle'
  title.textContent = '模型'
  const spacer = document.createElement('div')
  spacer.style.flex = '1'
  row.append(title, spacer)
  const card = document.createElement('div')
  card.className = '_3nPmjq_rowCard'
  card.textContent = 'OpenAI'
  content.append(row, card)
  document.body.appendChild(content)
  return { content, row, title }
}

describe('findModelsTitleRow', () => {
  it('hits on the real Models page: the heading itself is returned, never its section or the card list', () => {
    const { row, section, list } = mountModelsPage()
    expect(findModelsTitleRow(document.body)).toBe(row)
    expect(findModelsTitleRow(document.body)).not.toBe(section)
    expect(findModelsTitleRow(document.body)).not.toBe(list)
  })

  it('hits the English copy too', () => {
    const { row } = mountModelsPage()
    row.textContent = 'Models'
    expect(findModelsTitleRow(document.body)).toBe(row)
  })

  it('still resolves the earlier title-row wrapper (title + spacer beside the cards)', () => {
    const { row } = mountLegacyTitleRow()
    expect(findModelsTitleRow(document.body)).toBe(row)
  })

  it('refuses a page without the provider-row-card family (another settings page)', () => {
    const content = document.createElement('div')
    const title = document.createElement('h2')
    title.textContent = '模型'
    content.appendChild(title)
    document.body.appendChild(content)
    expect(findModelsTitleRow(document.body)).toBeNull()
  })

  it('refuses when the heading lives outside the scopes climbed from the cards', () => {
    const page = document.createElement('div')
    const cards = document.createElement('div')
    const card = document.createElement('div')
    card.className = '_3nPmjq_rowCard'
    cards.appendChild(card)
    page.appendChild(cards)
    document.body.appendChild(page)
    // A heading elsewhere in the document is never consulted.
    const elsewhere = document.createElement('div')
    const title = document.createElement('h2')
    title.textContent = '模型'
    elsewhere.appendChild(title)
    document.body.appendChild(elsewhere)
    expect(findModelsTitleRow(document.body)).toBeNull()
  })

  it('never hijacks a provider row literally named 模型', () => {
    const { list } = mountModelsPage()
    // No page heading: only a row whose name happens to be the copy.
    const section = list.parentElement!
    section.querySelector('h2')!.remove()
    const rowCard = list.querySelector('li')!
    rowCard.textContent = ''
    const name = document.createElement('span')
    name.className = 'jrmgQW_rowName'
    name.textContent = '模型'
    rowCard.appendChild(name)
    expect(findModelsTitleRow(document.body)).toBeNull()
  })

  it('survives a nested heading and ignores its own seat', () => {
    const { row } = mountModelsPage()
    // The host wraps the copy in a span one level down: headingOf() climbs to
    // the semantic heading, and the seat still resolves to that same line.
    const inner = document.createElement('span')
    inner.textContent = '模型'
    row.textContent = ''
    row.appendChild(inner)
    expect(findModelsTitleRow(document.body)).toBe(row)
    const state = createConfigButtonSeatState()
    ensureConfigButtonSeat(row, { t, onOpen: () => {} }, state)
    expect(findModelsTitleRow(document.body)).toBe(row)
  })
})

describe('ensureConfigButtonSeat', () => {
  it('mounts the 「配置」 button at the heading line\'s right end, idempotently', () => {
    const { row } = mountModelsPage()
    const onOpen = vi.fn()
    const state = createConfigButtonSeatState()
    ensureConfigButtonSeat(row, { t, onOpen }, state)
    const host = row.querySelector(`:scope > .${CONFIG_HOST_CLASS}`)
    expect(host).not.toBeNull()
    const button = host!.querySelector('button.bre-config-btn')
    expect(button).not.toBeNull()
    // Icon-only circle: no text node at all, the copy rides on the attributes.
    expect(button!.textContent).toBe('')
    expect(button!.querySelector('svg')).not.toBeNull()
    expect(button!.getAttribute('aria-label')).toBe('configButton')
    expect(button!.getAttribute('title')).toBe('configButtonHint')
    expect(row.lastElementChild).toBe(host)
    // The line mechanics that right-align the seat are plugin-owned on the
    // heading; the card list never receives them. They ride BOTH the class and
    // the inline style: the host re-renders the heading with a fresh className.
    expect(row.classList.contains(CONFIG_TITLE_LINE_CLASS)).toBe(true)
    expect(row.style.display).toBe('flex')
    expect(row.style.alignItems).toBe('center')

    // A second pass over the settled page writes nothing new.
    ensureConfigButtonSeat(row, { t, onOpen }, state)
    expect(row.querySelectorAll(`.${CONFIG_HOST_CLASS}`)).toHaveLength(1)
    expect(document.querySelectorAll(`.${CONFIG_TITLE_LINE_CLASS}`)).toHaveLength(1)

    // The click opens the pane.
    ;(button as HTMLButtonElement).click()
    expect(onOpen).toHaveBeenCalledTimes(1)
  })

  it('keeps the line right-aligned when the host re-render resets className', () => {
    const { row } = mountModelsPage()
    const state = createConfigButtonSeatState()
    ensureConfigButtonSeat(row, { t, onOpen: () => {} }, state)
    // What React writes on every render of the heading: the host's own class
    // list, with the plugin's flex class gone.
    row.className = 'jrmgQW_title'
    ensureConfigButtonSeat(row, { t, onOpen: () => {} }, state)
    expect(row.querySelectorAll(`.${CONFIG_HOST_CLASS}`)).toHaveLength(1)
    expect(row.classList.contains(CONFIG_TITLE_LINE_CLASS)).toBe(true)
    expect(row.style.display).toBe('flex')
  })

  it('remounts fresh when the page re-rendered the line under the seat', () => {
    const { row } = mountModelsPage()
    const onOpen = vi.fn()
    const state = createConfigButtonSeatState()
    ensureConfigButtonSeat(row, { t, onOpen }, state)
    const firstHost = row.querySelector(`.${CONFIG_HOST_CLASS}`)!
    // The official page re-created the line's children: the host node in the
    // DOM is no longer the one the module mounted (a stray copy is left).
    const stray = firstHost.cloneNode(true) as HTMLElement
    firstHost.remove()
    row.appendChild(stray)
    ensureConfigButtonSeat(row, { t, onOpen }, state)
    expect(row.querySelectorAll(`.${CONFIG_HOST_CLASS}`)).toHaveLength(1)
    expect(row.querySelector(`.${CONFIG_HOST_CLASS}`)).not.toBe(stray)
    expect(row.classList.contains(CONFIG_TITLE_LINE_CLASS)).toBe(true)
  })

  it('teardown removes every seat and restores the line styles, strays included', () => {
    const { row } = mountModelsPage()
    const state = createConfigButtonSeatState()
    ensureConfigButtonSeat(row, { t, onOpen: () => {} }, state)
    const strayLine = document.createElement('div')
    strayLine.className = CONFIG_TITLE_LINE_CLASS
    const stray = document.createElement('div')
    stray.className = CONFIG_HOST_CLASS
    strayLine.appendChild(stray)
    document.body.appendChild(strayLine)
    teardownConfigButtonSeats(state)
    expect(document.querySelectorAll(`.${CONFIG_HOST_CLASS}`)).toHaveLength(0)
    expect(document.querySelectorAll(`.${CONFIG_TITLE_LINE_CLASS}`)).toHaveLength(0)
    expect(row.classList.contains(CONFIG_TITLE_LINE_CLASS)).toBe(false)
    // The inline line mechanics leave with the seat, so the host's heading is
    // exactly the element it rendered.
    expect(row.style.display).toBe('')
    expect(row.style.alignItems).toBe('')
  })
})
