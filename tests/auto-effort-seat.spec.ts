/**
 * Auto-adapt seat tests (user request ⑤).
 *
 * The official catalogue head renders "fetch available models" — and nothing
 * beside it. The plugin seats one more control there, "auto-detect thinking
 * levels", which adapts EVERY model of that provider instead of the one row
 * the user opened.
 *
 * What matters here is that the seat is the DOM's own state (idempotent by
 * presence, so the page observer is not fed by its own reconciles), that it
 * sits beside the host's own link rather than inside it, and that a click
 * publishes the route the seat was LAST seated with — the create card lets the
 * user retype its Provider ID after the seat already exists.
 */

// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { AUTO_EFFORT_EVENT, type AutoEffortDetail } from '../src/client/auto-effort.js'
import { cataloguesOf, reconcileAutoEffortSeats, teardownAutoEffortSeats, type AutoAdaptAnswer, type AutoEffortSeatTarget } from '../src/client/injection/auto-effort-seat.js'
import { STYLES } from '../src/client/styles.js'

afterEach(() => { document.body.innerHTML = ''; teardownAutoEffortSeats() })

/** The seat module's translator, echoing its key so the assertions can name it. */
const deps = {
  t: (key: string): string => key,
}

/** The official catalogue, with the host's own fetch link(s) in its head. */
function catalogue(links: readonly string[] = ['获取可用模型']): { section: HTMLElement; head: HTMLElement } {
  const section = document.createElement('section')
  section.className = '_3nPmjq_modelCatalog'
  const head = document.createElement('div')
  head.className = '_3nPmjq_modelListHead'
  for (const label of links) {
    const button = document.createElement('button')
    button.type = 'button'
    button.className = '_3nPmjq_linkButton'
    button.textContent = label
    head.append(button)
  }
  section.append(head)
  section.insertAdjacentHTML('beforeend', '<div class="_3nPmjq_modelList"></div>')
  document.body.append(section)
  return { section, head }
}

/**
 * The catalogue AS THE HOST REALLY RENDERS IT (client.js ModelsSection): the
 * head carries a heading box whose title and meta are class-name matches of
 * `modelCatalog` themselves. The plain {@link catalogue} fixture above omits
 * them, which is exactly why the four-match bug went unnoticed — every
 * enumeration of `[class*="modelCatalog"]` saw only the section.
 */
function headingCatalogue(): { section: HTMLElement; head: HTMLElement; heading: HTMLElement } {
  const section = document.createElement('section')
  section.className = '_3nPmjq_modelCatalog'
  section.setAttribute('aria-label', '模型目录')
  section.innerHTML = `
    <div class="_3nPmjq_modelListHead">
      <div class="_3nPmjq_modelCatalogHeading">
        <span class="_3nPmjq_modelCatalogTitle">模型目录</span>
        <span class="_3nPmjq_modelCatalogMeta">已自定义模型目录</span>
      </div>
      <button type="button" class="_3nPmjq_linkButton">恢复默认模型</button>
      <button type="button" class="_3nPmjq_linkButton">获取可用模型</button>
    </div>
    <p class="_3nPmjq_modelEmpty">模型选择器中将不显示任何模型；目录外 ID 仍可直接发送。</p>`
  document.body.append(section)
  return {
    section,
    head: section.querySelector<HTMLElement>('._3nPmjq_modelListHead')!,
    heading: section.querySelector<HTMLElement>('._3nPmjq_modelCatalogHeading')!,
  }
}

const seats = (): HTMLButtonElement[] => Array.from(document.querySelectorAll<HTMLButtonElement>('.bre-auto-effort'))
const seat = (): HTMLButtonElement => {
  const [only] = seats()
  if (only === undefined) throw new Error('no seat')
  return only
}

/** Every mutation a pass produced, so a settled pass can be proven silent. */
async function mutationsOf(target: Node, run: () => void): Promise<MutationRecord[]> {
  const records: MutationRecord[] = []
  const observer = new MutationObserver(list => { records.push(...list) })
  observer.observe(target, { childList: true, subtree: true, characterData: true, attributes: true })
  run()
  await new Promise(resolve => { setTimeout(resolve, 0) })
  observer.disconnect()
  return records
}

describe('reconcileAutoEffortSeats', () => {
  it('seats one control after the host\'s own fetch link', () => {
    const { section, head } = catalogue()
    reconcileAutoEffortSeats(section, [{ catalogue: section, route: 'aliyun' }], deps)
    expect(seats()).toHaveLength(1)
    const only = seat()
    expect(only.className).toBe('bre-link-button bre-auto-effort')
    expect(only.type).toBe('button')
    expect(only.textContent).toBe('autoAdaptAll')
    // Beside the link, not inside it: the link's own click must stay the host's.
    expect(head.lastElementChild).toBe(only)
    expect(only.previousElementSibling?.className).toBe('_3nPmjq_linkButton')
  })

  it('anchors to the LAST link, not the first', () => {
    // The head's trailing control is the one the user asked to sit beside, and
    // the official labels are localized/swapped, so the anchor is positional.
    const { section, head } = catalogue(['刷新', '获取可用模型'])
    reconcileAutoEffortSeats(section, [{ catalogue: section, route: 'aliyun' }], deps)
    expect(head.lastElementChild).toBe(seat())
    expect(head.children).toHaveLength(3)
  })

  it('names the action for the reader, not just the eye', () => {
    const { section } = catalogue()
    reconcileAutoEffortSeats(section, [{ catalogue: section, route: 'aliyun' }], deps)
    const only = seat()
    // The text content IS the accessible name, and it stays the visible word.
    expect(only.textContent).toBe('autoAdaptAll')
    expect(only.getAttribute('aria-label')).toBeNull()
    // The scope (every model of this provider, not just this card) is a tooltip.
    expect(only.getAttribute('title')).toBe('autoAdaptAllHint')
  })

  it('is idempotent: a settled second pass writes nothing at all', async () => {
    const { section } = catalogue()
    const targets: AutoEffortSeatTarget[] = [{ catalogue: section, route: 'aliyun' }]
    reconcileAutoEffortSeats(section, targets, deps)
    const after = section.outerHTML
    const records = await mutationsOf(section, () => { reconcileAutoEffortSeats(section, targets, deps) })
    // The page's observer watches childList+subtree: a pass that re-wrote the
    // seat's text or moved it would make every scan feed the next one.
    expect(records).toEqual([])
    expect(section.outerHTML).toBe(after)
    expect(seats()).toHaveLength(1)
  })

  it('re-seats itself when the host appends a control after it', () => {
    const { section, head } = catalogue()
    reconcileAutoEffortSeats(section, [{ catalogue: section, route: 'aliyun' }], deps)
    const extra = document.createElement('button')
    extra.className = '_3nPmjq_linkButton'
    extra.textContent = '刷新'
    head.append(extra)
    reconcileAutoEffortSeats(section, [{ catalogue: section, route: 'aliyun' }], deps)
    expect(seats()).toHaveLength(1)
    expect(head.lastElementChild).toBe(seat())
    expect(seat().previousElementSibling).toBe(extra)
  })

  it('follows its route when the create card is retyped', () => {
    const { section } = catalogue()
    reconcileAutoEffortSeats(section, [{ catalogue: section, route: 'acme-gateway' }], deps)
    reconcileAutoEffortSeats(section, [{ catalogue: section, route: 'acme-gateway-2' }], deps)
    const heard: string[] = []
    const listener = (event: Event): void => { heard.push((event as CustomEvent<AutoEffortDetail>).detail.route) }
    document.addEventListener(AUTO_EFFORT_EVENT, listener)
    try {
      seat().click()
    } finally {
      document.removeEventListener(AUTO_EFFORT_EVENT, listener)
    }
    // Read off the attribute at click time, so no stale closure survives.
    expect(heard).toEqual(['acme-gateway-2'])
  })

  it('publishes the route of the provider whose head it sits in', () => {
    const first = catalogue()
    const second = catalogue()
    reconcileAutoEffortSeats(document.body, [
      { catalogue: first.section, route: 'aliyun' },
      { catalogue: second.section, route: 'ofox' },
    ], deps)
    expect(seats()).toHaveLength(2)
    const heard: string[] = []
    const listener = (event: Event): void => { heard.push((event as CustomEvent<AutoEffortDetail>).detail.route) }
    document.addEventListener(AUTO_EFFORT_EVENT, listener)
    try {
      first.head.querySelector<HTMLButtonElement>('.bre-auto-effort')!.click()
      second.head.querySelector<HTMLButtonElement>('.bre-auto-effort')!.click()
    } finally {
      document.removeEventListener(AUTO_EFFORT_EVENT, listener)
    }
    expect(heard).toEqual(['aliyun', 'ofox'])
  })

  it('falls back to the catalogue when it has no head of its own', () => {
    const section = document.createElement('section')
    section.className = '_3nPmjq_modelCatalog'
    document.body.append(section)
    reconcileAutoEffortSeats(section, [{ catalogue: section, route: 'aliyun' }], deps)
    expect(seats()).toHaveLength(1)
    expect(section.lastElementChild).toBe(seat())
  })

  it('never seats a control it cannot name a route for', () => {
    const { section } = catalogue()
    reconcileAutoEffortSeats(section, [{ catalogue: section, route: '' }], deps)
    expect(seats()).toHaveLength(0)
  })

  it('skips a catalogue that is no longer in the document', () => {
    const { section } = catalogue()
    const detached = document.createElement('section')
    detached.className = '_3nPmjq_modelCatalog'
    reconcileAutoEffortSeats(section, [{ catalogue: detached, route: 'aliyun' }], deps)
    expect(seats()).toHaveLength(0)
  })

  it('takes the seat away when the card closes', () => {
    const { section } = catalogue()
    reconcileAutoEffortSeats(section, [{ catalogue: section, route: 'aliyun' }], deps)
    expect(seats()).toHaveLength(1)
    // No targets: the card closed, so the head is the host's again.
    reconcileAutoEffortSeats(section, [], deps)
    expect(seats()).toHaveLength(0)
  })

  it('takes the seat away when its catalogue is no longer a target', () => {
    const first = catalogue()
    const second = catalogue()
    reconcileAutoEffortSeats(document.body, [
      { catalogue: first.section, route: 'aliyun' },
      { catalogue: second.section, route: 'ofox' },
    ], deps)
    expect(seats()).toHaveLength(2)
    // One card closed: its seat is this plugin's OWN DOM, so nothing would ever
    // unmount it — the pass that stops naming its catalogue has to sweep it.
    reconcileAutoEffortSeats(document.body, [{ catalogue: first.section, route: 'aliyun' }], deps)
    expect(seats()).toHaveLength(1)
    expect(first.head.querySelector('.bre-auto-effort')).not.toBeNull()
    expect(second.head.querySelector('.bre-auto-effort')).toBeNull()
  })

  it('teardown removes every seat it ever placed', () => {
    const first = catalogue()
    const second = catalogue()
    reconcileAutoEffortSeats(document.body, [
      { catalogue: first.section, route: 'aliyun' },
      { catalogue: second.section, route: 'ofox' },
    ], deps)
    expect(seats()).toHaveLength(2)
    teardownAutoEffortSeats()
    expect(seats()).toHaveLength(0)
  })

  it('finds the catalogue CONTAINER, not the heading nested inside it', () => {
    // The class-name stem is a SUBSTRING probe, and the official heading, its
    // title and its meta all carry it too. Only the outermost element is a
    // catalogue: enumerating the rest seats controls inside the heading, and
    // the official column-flex text then collapses to a character per line —
    // the empty-catalogue layout break (deleting a provider's last model).
    const { section, heading } = headingCatalogue()
    // Scoped from an ancestor (the panel root, a card) the section is the ONE
    // container; the three nested matches are dropped.
    expect(cataloguesOf(document.body)).toEqual([section])
    // The nested matches are real: this is exactly what the old probe
    // enumerated, three of them inside the heading box.
    expect(section.querySelectorAll('[class*="modelCatalog"]')).toHaveLength(3)
    expect(heading.querySelectorAll('[class*="modelCatalog"]')).toHaveLength(2)
    // A scope that IS the catalogue finds no container: the probe looks at
    // descendants, and callers pass a card or the panel root, never a section.
    expect(cataloguesOf(section)).toEqual([])
  })

  it('seats ONE control beside the head controls of a real heading catalogue', () => {
    const { section, head, heading } = headingCatalogue()
    reconcileAutoEffortSeats(section, [{ catalogue: section, route: 'aliyun' }], deps)
    // One seat for the card — not four, one per class-name match.
    expect(seats()).toHaveLength(1)
    // Beside the host's own links, in the head, and OUTSIDE the heading box
    // whose text must stay at its natural width.
    expect(head.lastElementChild).toBe(seat())
    expect(heading.querySelector('.bre-auto-effort')).toBeNull()
    expect(seat().previousElementSibling?.className).toBe('_3nPmjq_linkButton')
    expect(seat().textContent).toBe('autoAdaptAll')
  })

  it('reduces an already-broken card to one seat and takes the nested ones out', () => {
    // A card a previous build broke holds four seats, three of them inside the
    // heading. The head-level seat is re-used, so a pass that only re-seated
    // would leave the nested ones beside it — the sweep has to enforce one
    // seat per catalogue.
    const { section, head, heading } = headingCatalogue()
    for (const nested of [heading, heading.firstElementChild!, heading.lastElementChild!]) {
      const stray = document.createElement('button')
      stray.className = 'bre-link-button bre-auto-effort'
      stray.setAttribute('data-bre-auto-effort', 'aliyun')
      stray.textContent = '自动获取思考等级'
      nested.append(stray)
    }
    expect(seats()).toHaveLength(3)

    reconcileAutoEffortSeats(section, [{ catalogue: section, route: 'aliyun' }], deps)

    expect(seats()).toHaveLength(1)
    expect(head.lastElementChild).toBe(seat())
    expect(heading.querySelector('.bre-auto-effort')).toBeNull()
  })

  it('styles the seat as one more control of the official head', () => {
    expect(STYLES).toContain('.bre-auto-effort {')
    expect(STYLES).toContain('margin-left: 4px;')
  })

  it('hides the official catalogue heading, and leaves the head controls in place', () => {
    // "模型目录" names the pane the Models tab has already named, and
    // "已自定义模型目录" says nothing at all — the rows below ARE the
    // customized catalogue. Both are the host's own strings, so they go by
    // class stem; the heading takes its title and meta with it.
    expect(STYLES).toContain(
      ".bre-tabbed[data-bre-tab='models'] [data-bre-editor-body] [class*='modelCatalogHeading'] {\n" +
      '  display: none;\n' +
      '}',
    )
    // 恢复默认模型 / 获取可用模型 are the heading's SIBLINGS, not its children,
    // so the rule above cannot take them — and the seat is anchored to them.
    expect(STYLES).not.toContain("[class*='modelCatalogTitle']")
    expect(STYLES).not.toContain("[class*='modelCatalogMeta']")
    // With the heading gone the head holds only controls, and they read as TWO
    // ENDS: 恢复默认模型 at the left edge, and 获取可用模型 with the seat beside
    // it at the right. The official `space-between` cannot express that once
    // there are three children (it would strand the fetch link mid-card), so
    // the free space goes to the fetch link's own auto margin.
    expect(STYLES).toContain("[class*='modelListHead'] > button:has(+ .bre-auto-effort)")
    expect(STYLES).toContain('  margin-left: auto;\n')
  })
})

/**
 * The click's answer (user request: "点击自动获取思考等级没有反馈", then
 * "点击反馈浮动提示即可，不要变更按钮本身", then "直接在顶部气泡提示，然后消失即可").
 *
 * The seat has no message area of its own and its work happens in another
 * module, so the answer is a BUBBLE at the top of the window — the control
 * itself keeps its label, its tooltip and its enabledness, because a button
 * that rewrites itself is a different control every time the user looks at it.
 * These tests drive `onRequest` by hand: the injector's own suite covers what
 * the pass counts.
 */
describe('auto-adapt seat feedback', () => {
  /** A translator that keeps the params visible, so a count can be asserted. */
  const reporting: { t: (key: string, params?: Record<string, string | number>) => string; onRequest: (route: string) => AutoAdaptAnswer } = {
    t: (key, params) => (params === undefined ? key : `${key}:${String(params['count'] ?? params['message'] ?? '')}`),
    onRequest: () => undefined,
  }

  /** The one bubble on the page, or a throw — every case here expects exactly one. */
  const note = (): HTMLElement => {
    const [only] = Array.from(document.querySelectorAll<HTMLElement>('.bre-auto-effort-note'))
    if (only === undefined) throw new Error('no bubble')
    return only
  }
  const notes = (): HTMLElement[] => Array.from(document.querySelectorAll<HTMLElement>('.bre-auto-effort-note'))
  /** The bubble's headline (its first line). */
  const said = (): string => note().querySelector<HTMLElement>('.bre-auto-effort-note-text')?.textContent ?? ''
  /** The bubble's detail line, or '' when it is hidden. */
  const detail = (): string => {
    const line = note().querySelector<HTMLElement>('.bre-auto-effort-note-detail')
    if (line === null || line.hidden) return ''
    return line.textContent ?? ''
  }

  /** Let a click's async arm run to its paint. */
  const flush = async (): Promise<void> => { await new Promise(resolve => { setTimeout(resolve, 0) }) }

  it('says it is working, then how many models it adapted — without touching the button', async () => {
    let release = (): void => {}
    const gate = new Promise<void>(resolve => { release = resolve })
    const seen: string[] = []
    reporting.onRequest = async () => {
      seen.push(said())
      await gate
      return { held: 3, unsuggested: 0 }
    }
    const { section } = catalogue()
    reconcileAutoEffortSeats(section, [{ catalogue: section, route: 'aliyun' }], reporting)
    seat().click()
    await flush()
    // The pass is a document read plus one probe per model: long enough that a
    // silent click reads as a dead one.
    expect(seen).toEqual(['autoAdaptWorking'])
    expect(note().getAttribute('data-bre-auto-effort-phase')).toBe('working')
    release()
    await flush()
    expect(said()).toBe('autoAdaptDone:3')
    // The detail carries what the headline cannot: these writes are HELD, and
    // they land only when the user saves the card.
    expect(detail()).toBe('autoAdaptDoneHint:3')
    expect(note().getAttribute('data-bre-auto-effort-phase')).toBe('done')
    // The control the user aimed at is EXACTLY as it was.
    expect(seat().textContent).toBe('autoAdaptAll')
    expect(seat().getAttribute('title')).toBe('autoAdaptAllHint')
    expect(seat().disabled).toBe(false)
  })

  it('tells a fully configured provider apart from one it could not read', async () => {
    reporting.onRequest = () => ({ held: 0, unsuggested: 0 })
    const { section } = catalogue()
    reconcileAutoEffortSeats(section, [{ catalogue: section, route: 'aliyun' }], reporting)
    seat().click()
    await flush()
    // "nothing to do" is the pass SUCCEEDING. Reporting it as a refusal — or
    // saying nothing at all — is the silence this control exists to end.
    expect(said()).toBe('autoAdaptEmpty')
    expect(detail()).toBe('autoAdaptEmptyHint')

    reporting.onRequest = () => ({ held: 0, unsuggested: 0, blocked: 'unwritable' })
    seat().click()
    await flush()
    // A second click REPLACES the note rather than stacking a second one over
    // the same card, and a refusal must not read as "already configured".
    expect(notes()).toHaveLength(1)
    expect(said()).toBe('autoAdaptBlocked')
    expect(detail()).toBe('autoAdaptBlockedHint')
  })

  it('says so when no model of the route had a suggestion', async () => {
    reporting.onRequest = () => ({ held: 0, unsuggested: 4 })
    const { section } = catalogue()
    reconcileAutoEffortSeats(section, [{ catalogue: section, route: 'aliyun' }], reporting)
    seat().click()
    await flush()
    expect(said()).toBe('autoAdaptUnsuggested')
    expect(detail()).toBe('autoAdaptUnsuggestedHint')
  })

  it('names what some models of a partly successful pass were left out of', async () => {
    reporting.onRequest = () => ({ held: 2, unsuggested: 1 })
    const { section } = catalogue()
    reconcileAutoEffortSeats(section, [{ catalogue: section, route: 'aliyun' }], reporting)
    seat().click()
    await flush()
    expect(said()).toBe('autoAdaptDone:2')
    // Both halves: the writes are held, AND one model had nothing to offer.
    expect(detail()).toContain('autoAdaptDoneHint:2')
    expect(detail()).toContain('autoAdaptUnsuggestedHint')
  })

  it('reports a thrown pass instead of leaving the click silent', async () => {
    reporting.onRequest = () => { throw new Error('wire down') }
    const { section } = catalogue()
    reconcileAutoEffortSeats(section, [{ catalogue: section, route: 'aliyun' }], reporting)
    seat().click()
    await flush()
    expect(said()).toBe('autoAdaptFailed:Error: wire down')
    expect(note().getAttribute('data-bre-auto-effort-phase')).toBe('failed')
    expect(seat().disabled).toBe(false)
  })

  it('replaces the note when the official page re-renders the head', async () => {
    reporting.onRequest = () => ({ held: 2, unsuggested: 0 })
    const { section, head } = catalogue()
    reconcileAutoEffortSeats(section, [{ catalogue: section, route: 'aliyun' }], reporting)
    seat().click()
    await flush()
    expect(said()).toBe('autoAdaptDone:2')
    // React owns the head: the next render drops this plugin's node entirely.
    head.innerHTML = '<button type="button" class="_3nPmjq_linkButton">获取可用模型</button>'
    reconcileAutoEffortSeats(section, [{ catalogue: section, route: 'aliyun' }], reporting)
    // The note is keyed by ROUTE and lives outside the head, so the answer the
    // user waited for does not vanish with the node that asked for it.
    expect(said()).toBe('autoAdaptDone:2')
    expect(notes()).toHaveLength(1)
  })

  it('does not erase a running pass when a second click is refused', async () => {
    let release = (): void => {}
    const gate = new Promise<void>(resolve => { release = resolve })
    reporting.onRequest = async () => {
      await gate
      return { held: 1, unsuggested: 0 }
    }
    const { section } = catalogue()
    reconcileAutoEffortSeats(section, [{ catalogue: section, route: 'aliyun' }], reporting)
    seat().click()
    await flush()
    // The injector refuses the second click with `busy`: the note stays on the
    // pass that is still running rather than blanking or double-stacking.
    reporting.onRequest = () => ({ held: 0, unsuggested: 0, blocked: 'busy' })
    seat().click()
    await flush()
    expect(said()).toBe('autoAdaptWorking')
    expect(notes()).toHaveLength(1)
    release()
    await flush()
    expect(said()).toBe('autoAdaptDone:1')
  })

  it('takes the note away once the verdict has been read', async () => {
    vi.useFakeTimers()
    try {
      reporting.onRequest = () => ({ held: 1, unsuggested: 0 })
      const { section } = catalogue()
      reconcileAutoEffortSeats(section, [{ catalogue: section, route: 'aliyun' }], reporting)
      seat().click()
      await vi.advanceTimersByTimeAsync(0)
      expect(said()).toBe('autoAdaptDone:1')
      // The result is feedback, not state: a chip left floating over the card
      // the user has moved on to would be in the way of the work.
      await vi.advanceTimersByTimeAsync(8000)
      expect(notes()).toHaveLength(0)
      expect(seat().textContent).toBe('autoAdaptAll')
    } finally {
      vi.useRealTimers()
    }
  })

  it('takes the note down with the card that asked for it', () => {
    reporting.onRequest = () => ({ held: 1, unsuggested: 0 })
    const { section } = catalogue()
    reconcileAutoEffortSeats(section, [{ catalogue: section, route: 'aliyun' }], reporting)
    seat().click()
    expect(notes()).toHaveLength(1)
    // The card closed: its route is no longer named by any target, so the
    // verdict goes with it instead of floating over unrelated rows.
    reconcileAutoEffortSeats(section, [], reporting)
    expect(notes()).toHaveLength(0)
  })

  it('says nothing at all when nobody is reporting', async () => {
    // Placement-only deps (and any host that mounted the seat alone): there is
    // no verdict to show, so nothing may be invented.
    const { section } = catalogue()
    reconcileAutoEffortSeats(section, [{ catalogue: section, route: 'aliyun' }], deps)
    seat().click()
    await flush()
    expect(notes()).toHaveLength(0)
    expect(seat().textContent).toBe('autoAdaptAll')
    expect(seat().getAttribute('title')).toBe('autoAdaptAllHint')
    expect(seat().disabled).toBe(false)
  })

  it('takes every bubble down on teardown, since nothing else owns them', async () => {
    reporting.onRequest = () => ({ held: 1, unsuggested: 0 })
    const { section } = catalogue()
    reconcileAutoEffortSeats(section, [{ catalogue: section, route: 'aliyun' }], reporting)
    seat().click()
    await flush()
    expect(notes()).toHaveLength(1)
    // The bubble is this plugin's own DOM OUTSIDE the seat: a dispose that only
    // removed seats would leave it on the page forever.
    teardownAutoEffortSeats()
    expect(notes()).toHaveLength(0)
  })

  it('raises the bubble at the top of the page rather than beside the control', async () => {
    reporting.onRequest = () => ({ held: 1, unsuggested: 0 })
    const { section, head } = catalogue()
    reconcileAutoEffortSeats(section, [{ catalogue: section, route: 'aliyun' }], reporting)
    seat().click()
    await flush()
    // The host's head is a flex row: a fourth child there would be a fourth
    // item in its layout, so the answer hangs off the body instead.
    expect(note().parentElement).toBe(document.body)
    expect(head.contains(note())).toBe(false)
    expect(seat().nextElementSibling).toBeNull()
    // The scroll/resize following that a seat-anchored note needed is gone with
    // it: the placement is the sheet's, not measured per click.
    expect(STYLES).toContain('.bre-auto-effort-note {')
    expect(STYLES).toContain('  top: 40px;\n')
    expect(STYLES).toContain('  left: 50%;\n')
    expect(STYLES).toContain('  transform: translateX(-50%);\n')
    // Raised from inside the settings dialog, whose overlay is z-index 1000:
    // the host's own toast layer (1100) would be drawn behind it.
    expect(STYLES).toContain('  z-index: 1200;\n')
  })
})
