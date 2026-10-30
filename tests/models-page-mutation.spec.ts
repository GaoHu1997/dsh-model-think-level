// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest'
import { modelsPageMutation } from '../src/client/injection/models-page-mutation.js'

function changes(run: () => void): MutationRecord[] {
  const observer = new MutationObserver(() => {})
  observer.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['hidden'] })
  run()
  const records = observer.takeRecords()
  observer.disconnect()
  return records
}

afterEach(() => { document.body.innerHTML = '' })

describe('Models-page mutation routing', () => {
  it('ignores streaming outside a resident provider list without querying the whole body', () => {
    document.body.innerHTML = '<section><ul><li class="hash_rowCard">provider</li></ul></section><article>chat</article>'
    const chat = document.querySelector('article')!
    expect(modelsPageMutation(changes(() => { chat.textContent = 'next token' }))).toBe(false)
  })

  it('detects page entry and removal from their changed subtrees', () => {
    const page = document.createElement('section')
    page.innerHTML = '<ul><li class="hash_rowCard">provider</li></ul>'
    expect(modelsPageMutation(changes(() => { document.body.append(page) }))).toBe(true)
    expect(modelsPageMutation(changes(() => { page.remove() }))).toBe(true)
  })

  it('ignores a foreign React mount, its renders, and its removal inside a host disclosure', () => {
    document.body.innerHTML = '<div class="hash_rowCard bre-tabbed"><div class="modelAdvanced"></div></div>'
    const disclosure = document.querySelector('.modelAdvanced')!
    const slot = document.createElement('div')
    slot.className = 'bre-effort-slot'
    expect(modelsPageMutation(changes(() => { disclosure.append(slot) }))).toBe(false)
    expect(modelsPageMutation(changes(() => { slot.innerHTML = '<span>saved</span>' }))).toBe(false)
    expect(modelsPageMutation(changes(() => { slot.remove() }))).toBe(false)
  })

  it('does not mistake decorated official wrappers or endpoint cards for foreign roots', () => {
    document.body.innerHTML = '<div class="rowCard bre-tabbed"><div class="bre-key-field"></div><div class="bre-protocol-cards"></div></div>'
    for (const wrapper of document.querySelectorAll('.bre-key-field, .bre-protocol-cards')) {
      expect(modelsPageMutation(changes(() => { wrapper.append(document.createElement('input')) }))).toBe(true)
    }
  })

  it('keeps the host change in a mixed foreign/host commit', () => {
    document.body.innerHTML = '<div class="rowCard"><div class="modelAdvanced"><div class="bre-effort-slot"></div></div></div>'
    const advanced = document.querySelector('.modelAdvanced')!
    const slot = document.querySelector('.bre-effort-slot')!
    expect(modelsPageMutation(changes(() => {
      slot.textContent = 'plugin'
      advanced.append(document.createElement('label'))
    }))).toBe(true)
  })

  it('detects hidden flips on a page ancestor and the create card', () => {
    document.body.innerHTML = '<section><div class="addCard"><div class="addBlock"></div></div></section>'
    const section = document.querySelector('section')!
    expect(modelsPageMutation(changes(() => { section.hidden = true }))).toBe(true)
    expect(modelsPageMutation(changes(() => { document.querySelector<HTMLElement>('.addBlock')!.hidden = true }))).toBe(true)
  })

  it('supports older standalone model rows and sibling save notices', () => {
    document.body.innerHTML = '<div class="modelEntry"><div class="modelAdvanced"></div></div><p class="hash_savedNotice">old</p>'
    expect(modelsPageMutation(changes(() => { document.querySelector('.modelAdvanced')!.append(document.createElement('input')) }))).toBe(true)
    expect(modelsPageMutation(changes(() => { document.querySelector('p')!.textContent = 'Saved provider' }))).toBe(true)
    expect(modelsPageMutation([])).toBe(false)
  })
})
