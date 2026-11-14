// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest'
import {
  createOfficialRetryPolicyState,
  OFFICIAL_RETRY_POLICY_HIDDEN_ATTR,
  reconcileOfficialRetryPolicy,
  teardownOfficialRetryPolicy,
} from '../src/client/injection/official-retry-policy.js'

const retryFixture = (provider = 'acme', display = ''): HTMLElement => {
  const editor = document.createElement('div')
  editor.className = 'editor'
  editor.innerHTML = `<details class="customized"><summary>Customized</summary><div class="customizedBody">
    <div class="field" role="group" aria-labelledby="${provider}-retry-failure-label">
      <span id="${provider}-retry-failure-label" class="fieldLabel">Retry policy / 重试策略</span>
      <select class="input selectInput" aria-labelledby="${provider}-retry-failure-label">
        <option value="">Default</option><option value="normal">Normal</option><option value="always">Always</option>
      </select>
    </div>
    <div class="field" role="group" aria-labelledby="${provider}-timeout-label">
      <span id="${provider}-timeout-label" class="fieldLabel">Timeout</span>
      <select class="input selectInput" aria-labelledby="${provider}-timeout-label"><option value="">Default</option><option value="normal">Normal</option><option value="always">Always</option></select>
    </div>
    <div class="field" role="group" aria-labelledby="${provider}-retry-failure-label-extra">
      <span id="${provider}-retry-failure-label-extra" class="fieldLabel">Other field</span>
      <select class="input selectInput" aria-labelledby="${provider}-retry-failure-label-extra"><option value="">Default</option><option value="normal">Normal</option><option value="always">Always</option></select>
    </div>
  </div></details>`
  const group = editor.querySelector<HTMLElement>('[role="group"]')!
  if (display !== '') group.style.setProperty('display', display, 'important')
  return editor
}

const card = (editor: HTMLElement, className = 'rowCard'): HTMLElement => {
  const wrapper = document.createElement('div')
  wrapper.className = className
  wrapper.append(editor)
  return wrapper
}

afterEach(() => { document.body.replaceChildren() })

describe('official provider retry-policy UI adapter', () => {
  it('hides only the specifically identified official retry field and restores exact styles', () => {
    const host = card(retryFixture())
    document.body.append(host)
    const groups = host.querySelectorAll<HTMLElement>('[role="group"]')
    groups[1]!.style.setProperty('display', 'grid', 'important')
    const state = createOfficialRetryPolicyState()

    reconcileOfficialRetryPolicy(document.body, state)
    expect(groups[0]!.style.getPropertyValue('display')).toBe('none')
    expect(groups[0]!.getAttribute(OFFICIAL_RETRY_POLICY_HIDDEN_ATTR)).toBe('1')
    expect(groups[1]!.style.getPropertyValue('display')).toBe('grid')
    expect(groups[2]!.style.display).toBe('')
    expect(state.hidden.size).toBe(1)

    teardownOfficialRetryPolicy(state)
    expect(groups[0]!.style.display).toBe('')
    expect(groups[0]!.hasAttribute(OFFICIAL_RETRY_POLICY_HIDDEN_ATTR)).toBe(false)
    expect(groups[1]!.style.getPropertyValue('display')).toBe('grid')
    expect(groups[1]!.style.getPropertyPriority('display')).toBe('important')
  })

  it('handles English and Chinese labels without matching the label copy', () => {
    for (const copy of ['Retry policy', '重试策略']) {
      const host = card(retryFixture(copy))
      host.querySelector('.fieldLabel')!.textContent = copy
      document.body.append(host)
      const state = createOfficialRetryPolicyState()
      reconcileOfficialRetryPolicy(document.body, state)
      expect(host.querySelector<HTMLElement>('[role="group"]')!.style.display).toBe('none')
      teardownOfficialRetryPolicy(state)
      host.remove()
    }
  })

  it('leaves plugin roots, unrelated forms, incomplete modes, and host-hidden nodes alone', () => {
    const own = card(retryFixture(), 'rowCard')
    own.querySelector('.editor')!.classList.add('bre-create-host')
    const noncard = retryFixture()
    const incomplete = card(retryFixture())
    const select = incomplete.querySelector('select')!
    select.querySelector('option[value="always"]')!.remove()
    const hostHidden = card(retryFixture())
    const hostGroup = hostHidden.querySelector<HTMLElement>('[role="group"]')!
    hostGroup.style.display = 'none'
    document.body.append(own, card(noncard, 'unrelated'), incomplete, hostHidden)

    const state = createOfficialRetryPolicyState()
    reconcileOfficialRetryPolicy(document.body, state)
    expect(own.querySelector('[role="group"]')!.hasAttribute(OFFICIAL_RETRY_POLICY_HIDDEN_ATTR)).toBe(false)
    expect(noncard.querySelector<HTMLElement>('[role="group"]')!.style.display).toBe('')
    expect(incomplete.querySelector<HTMLElement>('[role="group"]')!.style.display).toBe('')
    expect(hostGroup.style.display).toBe('none')
    expect(state.hidden.size).toBe(0)
    teardownOfficialRetryPolicy(state)
    expect(hostGroup.style.display).toBe('none')
  })

  it('covers catalog-add forms and themes without changing values or emitting events', () => {
    const host = card(retryFixture('catalog'), 'addCard')
    const panel = document.createElement('div')
    panel.className = 'addPanel'
    panel.hidden = true
    panel.append(host.firstElementChild!)
    host.append(panel)
    document.body.append(host)
    const group = host.querySelector<HTMLElement>('[role="group"]')!
    const select = group.querySelector('select')!
    select.value = 'always'
    const before = group.innerHTML
    let events = 0
    select.addEventListener('change', () => { events++ })
    select.addEventListener('input', () => { events++ })
    const state = createOfficialRetryPolicyState()
    for (const theme of ['light', 'dark']) {
      document.documentElement.dataset['theme'] = theme
      reconcileOfficialRetryPolicy(document.body, state)
      expect(group.style.display).toBe('none')
      panel.hidden = false
      reconcileOfficialRetryPolicy(document.body, state)
      expect(group.style.display).toBe('none')
      expect(group.innerHTML).toBe(before)
      expect(select.value).toBe('always')
      expect(select.disabled).toBe(false)
    }
    expect(events).toBe(0)
    teardownOfficialRetryPolicy(state)
    expect(group.style.display).toBe('')
    delete document.documentElement.dataset['theme']
  })

  it('preserves display priorities, respects later host writes, and restores detached nodes', () => {
    const host = card(retryFixture('restored', 'grid'))
    document.body.append(host)
    const state = createOfficialRetryPolicyState()
    const group = host.querySelector<HTMLElement>('[role="group"]')!
    reconcileOfficialRetryPolicy(document.body, state)
    reconcileOfficialRetryPolicy(document.body, state)
    host.remove()
    teardownOfficialRetryPolicy(state)
    expect(group.style.getPropertyValue('display')).toBe('grid')
    expect(group.style.getPropertyPriority('display')).toBe('important')
    document.body.append(host)
    reconcileOfficialRetryPolicy(document.body, state)
    group.style.setProperty('display', 'flex')
    teardownOfficialRetryPolicy(state)
    expect(group.style.display).toBe('flex')
  })

  it('reconciles replaced fields and restores detached nodes during teardown', () => {
    const host = card(retryFixture())
    document.body.append(host)
    const state = createOfficialRetryPolicyState()
    reconcileOfficialRetryPolicy(document.body, state)
    const oldGroup = host.querySelector<HTMLElement>('[role="group"]')!
    const replacement = retryFixture()
    oldGroup.parentElement!.replaceChild(replacement.querySelector('[role="group"]')!, oldGroup)
    reconcileOfficialRetryPolicy(document.body, state)
    const newGroup = host.querySelector<HTMLElement>('[role="group"]')!
    expect(newGroup.style.display).toBe('none')
    expect(oldGroup.style.display).toBe('')
    expect(state.hidden.size).toBe(1)
    teardownOfficialRetryPolicy(state)
    expect(newGroup.style.display).toBe('')
  })
})
