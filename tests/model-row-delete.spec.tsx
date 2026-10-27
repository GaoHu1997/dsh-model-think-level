// @vitest-environment jsdom
/**
 * What deleting a model does to the rows around it, against a faithful stand-in
 * for the official ModelListEditor rather than a hand-built DOM.
 *
 * The host keys its model rows BY INDEX (`models.map((model, index) =>
 * <ModelRow key={index} />)`) and reindexes its own `expanded` set when a model
 * is removed. Both facts matter here, and neither shows up in a fixture that
 * rebuilds the list by hand:
 *
 * - Deleting a model does not remove the element that model was drawn in. Every
 *   element from the deleted position down is redrawn with the NEXT model and the
 *   last element is destroyed, so each survivor keeps another model's inline
 *   `order`.
 * - The `Model options` block is a CHILD of `modelEntry`, so it travels with
 *   whichever model the element now holds.
 *
 * That is the mechanism behind both reported symptoms: rows above the deletion
 * jump, rows below move down, and the list order scrambles — all because the
 * screen order after a removal describes the arrangement as it was BEFORE it.
 */
import { beforeEach, describe, it, expect } from 'vitest'
import { act, createElement, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { modelOrderOf, setModelOrder, syncModelOrders } from '../src/client/model-order.js'
import { createModelOrderState, reconcileModelOrder } from '../src/client/injection/model-order-drag.js'
import type { HostLabels } from '../src/client/injection/models-page-editor.js'

;(globalThis as Record<string, unknown>)['IS_REACT_ACT_ENVIRONMENT'] = true

const LABELS: HostLabels = {
  capacity: ['Capacities'], modelId: ['Model ID'], modelName: ['Display name'], routeId: ['Provider ID'],
  baseUrl: ['Base URL'], apiProtocol: ['API protocol'], apply: ['Apply'], cancel: ['Cancel'],
  editProvider: ['Edit {provider}'],

  inputImage: ['Image'],
  contextWindow: ['Context window'],
  maxOutput: ['Max output'],
  addModel: ['Add model', '添加模型'],
}
const deps = (): { t: (k: string) => string; labels: () => HostLabels } => ({ t: (k: string) => k, labels: () => LABELS })
const PROVIDER = 'aliyun'

interface Model { id: string; name: string }

/** The host's `ModelRow`: `modelEntry` > [`modelRow` grid, `modelAdvanced` when expanded]. */
function ModelRow(props: {
  model: Model; position: number; expanded: boolean
  onToggle: () => void; onRemove: () => void
}): ReturnType<typeof createElement> {
  const { model, position } = props
  return createElement('div', { className: '_3nPmjq_modelEntry' },
    createElement('div', { className: '_3nPmjq_modelRow' },
      createElement('input', {
        className: '_3nPmjq_input', type: 'text', value: model.id, readOnly: true,
        'aria-label': `Model ID ${String(position)}`,
      }),
      createElement('input', {
        className: '_3nPmjq_input', type: 'text', value: model.name, readOnly: true,
        'aria-label': `Display name ${String(position)}`,
      }),
      createElement('button', {
        type: 'button', className: '_3nPmjq_iconButton',
        'aria-label': `Model options ${String(position)}`,
        'aria-expanded': props.expanded, title: 'Model options', onClick: props.onToggle,
      }, 'v'),
      createElement('button', {
        type: 'button', className: '_3nPmjq_iconButton _3nPmjq_iconButtonDanger',
        'aria-label': `Delete model ${String(position)}`, title: 'Delete model', onClick: props.onRemove,
      }, 'x')),
    props.expanded
      ? createElement('div', { className: '_3nPmjq_modelAdvanced' },
        createElement('input', {
          className: '_3nPmjq_input', type: 'text', readOnly: true,
          'aria-label': `Context window ${String(position)}`,
        }),
        createElement('div', { className: '_3nPmjq_modelInputTypes' }))
      : null)
}

/** The host's `ModelListEditor`: rows keyed by index; a removal reindexes `expanded`. */
function Editor(props: { models: Model[]; onDelete: (index: number) => void }): ReturnType<typeof createElement> {
  const [expanded, setExpanded] = useState<Set<number>>(() => new Set())
  return createElement('ul', { className: '_3nPmjq_rows' },
    createElement('li', { className: '_3nPmjq_rowCard' },
      createElement('div', { className: '_3nPmjq_rowHead' },
        createElement('span', { className: '_3nPmjq_rowIdentity' },
          createElement('span', { className: '_3nPmjq_rowName' }, PROVIDER)),
        createElement('span', { className: '_3nPmjq_rowActions' },
          createElement('button', { type: 'button', 'aria-label': `Edit ${PROVIDER} (${PROVIDER})` }, 'Edit'))),
      createElement('div', { className: 'bre-headers-host', 'data-bre-provider': PROVIDER }),
      createElement('div', { className: '_3nPmjq_modelList' },
        props.models.map((model, index) => createElement(ModelRow, {
          key: index,
          model,
          position: index + 1,
          expanded: expanded.has(index),
          onToggle: () => setExpanded(current => {
            const next = new Set(current)
            if (!next.delete(index)) next.add(index)
            return next
          }),
          onRemove: () => {
            props.onDelete(index)
            setExpanded(current => {
              const next = new Set<number>()
              for (const at of current) {
                if (at < index) next.add(at)
                else if (at > index) next.add(at - 1)
              }
              return next
            })
          },
        }, index)))))
}

interface HostApi {
  models: () => Model[]
  add: (id: string) => Promise<void>
  rename: (index: number, id: string) => Promise<void>
}

/** The host's own state around the editor: the model list, and nothing of ours. */
function Harness(props: { initial: Model[]; onReady: (api: HostApi) => void }): ReturnType<typeof createElement> {
  const [models, setModels] = useState(props.initial)
  props.onReady({
    models: () => models,
    add: async (id: string) => { await act(async () => { setModels(current => [...current, { id, name: id }]) }) },
    rename: async (index: number, id: string) => {
      await act(async () => { setModels(current => current.map((m, at) => (at === index ? { ...m, id } : m))) })
    },
  })
  return createElement(Editor, {
    models,
    onDelete: (index: number) => { setModels(current => current.filter((_m, at) => at !== index)) },
  })
}

function modelList(): HTMLElement { return document.querySelector('._3nPmjq_modelList') as HTMLElement }

function entries(list: HTMLElement): HTMLElement[] { return Array.from(list.children) as HTMLElement[] }

/** A row's screen position: its own `order` when it has one, else where it sits. */
function keyOf(row: HTMLElement, index: number): number {
  if (row.style.order === '') return index
  const parsed = Number.parseInt(row.style.order, 10)
  return Number.isNaN(parsed) ? index : parsed
}

/** The rows of a list in the sequence they screen, with their DOM index. */
function shownRows(list: HTMLElement): { row: HTMLElement; at: number }[] {
  return entries(list)
    .map((row, index) => ({ row, key: keyOf(row, index), index }))
    .sort((left, right) => left.key - right.key || left.index - right.index)
    .map(entry => ({ row: entry.row, at: entry.index }))
}

/** The model ids in the sequence they screen. */
function screen(list: HTMLElement): string[] { return shownRows(list).map(entry => idIn(entry.row)) }

/** The ids whose Model options block is expanded, in screen order. */
function expandedScreen(list: HTMLElement): string[] {
  return shownRows(list)
    .filter(entry => entry.row.querySelector('._3nPmjq_modelAdvanced') !== null)
    .map(entry => idIn(entry.row))
}

function idIn(row: HTMLElement): string {
  return (row.querySelector('input[aria-label^="Model ID"]') as HTMLInputElement).value
}

beforeEach(() => {
  document.body.innerHTML = ''
  window.localStorage.clear()
  syncModelOrders({})
})

async function mount(initial: Model[]): Promise<{
  state: ReturnType<typeof createModelOrderState>
  host: HostApi
  root: ReturnType<typeof createRoot>
  scan: () => void
}> {
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)
  const state = createModelOrderState()
  let host: HostApi | undefined
  await act(async () => { root.render(createElement(Harness, { initial, onReady: api => { host = api } })) })
  const scan = (): void => { act(() => { reconcileModelOrder(document.body, deps(), state) }) }
  scan()
  return { state, host: host as HostApi, root, scan }
}

/** Delete the row the user sees at `position`, whatever its DOM index is. */
async function deleteScreenRow(list: HTMLElement, position: number): Promise<string> {
  const row = (shownRows(list)[position] as { row: HTMLElement }).row
  const id = idIn(row)
  await act(async () => { (row.querySelector('[aria-label^="Delete model"]') as HTMLElement).click() })
  return id
}

/** Expand / collapse the Model options block of the row at `position` (screen). */
async function toggleScreenRow(list: HTMLElement, position: number): Promise<void> {
  const row = (shownRows(list)[position] as { row: HTMLElement }).row
  await act(async () => { (row.querySelector('[aria-label^="Model options"]') as HTMLElement).click() })
}

/**
 * Drag the row at screen position `from` to `to`, the way a drop does: the screen
 * sequence is what gets committed, and the pass then places the rows.
 */
async function dragScreenRow(list: HTMLElement, from: number, to: number): Promise<string[]> {
  const shown = screen(list)
  const moved = shown[from] as string
  const next = shown.slice()
  next.splice(from, 1)
  next.splice(to, 0, moved)
  const domRows = entries(list)
  const slotOf = new Map<string, number>()
  domRows.forEach((row, index) => { slotOf.set(idIn(row), index) })
  next.forEach((id, position) => {
    const row = domRows[slotOf.get(id) as number] as HTMLElement
    row.style.order = String(position)
  })
  act(() => { setModelOrder(PROVIDER, next) })
  return next
}

const three = (...ids: string[]): Model[] => ids.map(id => ({ id, name: id }))

describe('deleting a model in the official editor', () => {
  it('leaves the rows above it alone and closes the gap below', async () => {
    const { root, scan } = await mount(three('a', 'b', 'c', 'd'))
    const list = modelList()
    expect(screen(list)).toEqual(['a', 'b', 'c', 'd'])
    expect(await deleteScreenRow(list, 1)).toBe('b')
    scan()
    expect(screen(list)).toEqual(['a', 'c', 'd'])
    await act(async () => { root.unmount() })
  })

  it('keeps the order the user dragged when a model is deleted', async () => {
    const { root, scan } = await mount(three('a', 'b', 'c', 'd'))
    const list = modelList()
    const dragged = await dragScreenRow(list, 2, 0)
    scan()
    expect(screen(list)).toEqual(dragged)
    expect(await deleteScreenRow(list, 0)).toBe('c')
    scan()
    expect(screen(list)).toEqual(['a', 'b', 'd'])
    await act(async () => { root.unmount() })
  })

  it('leaves the Model options block on the model it belongs to', async () => {
    const { root, scan } = await mount(three('a', 'b', 'c'))
    const list = modelList()
    await toggleScreenRow(list, 1)
    await toggleScreenRow(list, 2)
    scan()
    expect(expandedScreen(list)).toEqual(['b', 'c'])
    expect(await deleteScreenRow(list, 0)).toBe('a')
    scan()
    expect(screen(list)).toEqual(['b', 'c'])
    expect(expandedScreen(list)).toEqual(['b', 'c'])
    await act(async () => { root.unmount() })
  })

  it('leaves the Model options block on the model it was opened for', async () => {
    const { root, scan } = await mount(three('a', 'b', 'c'))
    const list = modelList()
    await toggleScreenRow(list, 2)
    scan()
    expect(expandedScreen(list)).toEqual(['c'])
    // Deleting a row ABOVE the open one: the panel belongs to c, not to whatever
    // ends up in the slot it was opened at.
    expect(await deleteScreenRow(list, 0)).toBe('a')
    scan()
    expect(screen(list)).toEqual(['b', 'c'])
    expect(expandedScreen(list)).toEqual(['c'])
    await act(async () => { root.unmount() })
  })

  it('takes the model out of the stored sequence without disturbing the rest', async () => {
    const { root, scan } = await mount(three('a', 'b', 'c'))
    const list = modelList()
    const dragged = await dragScreenRow(list, 0, 2)
    scan()
    expect(screen(list)).toEqual(dragged)
    // `dragged` is [b, c, a], so screen position 1 is c.
    expect(await deleteScreenRow(list, 1)).toBe('c')
    scan()
    expect(screen(list)).toEqual(['b', 'a'])
    await act(async () => { root.unmount() })
  })

  it('survives several deletions inside one pass, whatever the order', async () => {
    // Two models deleted before the debounced scan runs: the pass has to
    // reconstruct both edits at once.
    const { root, scan } = await mount(three('a', 'b', 'c', 'd', 'e'))
    const list = modelList()
    const before = screen(list)
    const gone = [await deleteScreenRow(list, 1), await deleteScreenRow(list, 0)]
    scan()
    expect(screen(list)).toEqual(before.filter(id => !gone.includes(id)))
    await act(async () => { root.unmount() })
  })

  it('leaves a renamed row where the user put it', async () => {
    const { root, host, scan } = await mount(three('a', 'b'))
    const list = modelList()
    const dragged = await dragScreenRow(list, 0, 1)
    scan()
    expect(screen(list)).toEqual(dragged)
    // Rename whichever row the user now sees last, whatever its DOM index is.
    const last = shownRows(list)[shownRows(list).length - 1] as { row: HTMLElement; at: number }
    const was = idIn(last.row)
    const id = `${was}-renamed`
    await host.rename(last.at, id)
    scan()
    const want = dragged.map(other => (other === was ? id : other))
    expect(screen(list)).toEqual(want)
    await act(async () => { root.unmount() })
  })

  it.each([
    { from: 0, to: 2, cut: 1 },
    { from: 1, to: 3, cut: 0 },
    { from: 2, to: 0, cut: 1 },
    { from: 3, to: 1, cut: 2 },
    { from: 1, to: 0, cut: 3 },
  ])('holds the dragged order when a delete follows drag $from->$to at $cut', async ({ from, to, cut }) => {
    // The rows only carry a stale order once the user has rearranged them, so
    // every arrangement is walked with a deletion at each position in turn.
    const { root, scan } = await mount(three('a', 'b', 'c', 'd'))
    const list = modelList()
    const dragged = await dragScreenRow(list, from, to)
    scan()
    expect(screen(list)).toEqual(dragged)
    const removed = await deleteScreenRow(list, cut)
    scan()
    expect(screen(list)).toEqual(dragged.filter(id => id !== removed))
    await act(async () => { root.unmount() })
  })

  it('keeps the visible sequence under a long walk of edits', async () => {
    let seed = 987654321
    const random = (): number => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed / 2147483648 }
    const failures: string[] = []
    let deletes = 0
    let nextId = 0
    /** Set when the host commits again before the debounced pass runs. */
    let holdPass = false
    let pass = (): void => {}
    const scan = (): void => {
      if (holdPass) { holdPass = false; return }
      pass()
    }
    for (let trial = 0; trial < 40; trial += 1) {
      nextId += 3
      const { root, host, scan: scanNow } = await mount(three(`m${String(nextId - 2)}`, `m${String(nextId - 1)}`, `m${String(nextId)}`))
      pass = scanNow
      holdPass = false
      const log: string[] = []
      for (let step = 0; step < 12; step += 1) {
        const list = modelList()
        const count = entries(list).length
        const roll = random()
        if (roll < 0.3 && count >= 2) {
          const next = await dragScreenRow(list, Math.floor(random() * count), Math.floor(random() * count))
          scan()
          if (screen(list).join(',') !== next.join(',')) {
            failures.push(`trial ${String(trial)} step ${String(step)}: drag wanted [${next.join(' ')}] got [${screen(list).join(' ')}]\n  ${log.join('\n  ')}`)
            break
          }
          log.push(`drag = [${next.join(' ')}]`)
        } else if (roll < 0.4) {
          nextId += 1
          const id = `m${String(nextId)}`
          await host.add(id)
          scan()
          log.push(`add ${id}`)
        } else if (roll < 0.48 && count >= 2) {
          const target = shownRows(list)[Math.floor(random() * count)] as { row: HTMLElement; at: number }
          const was = idIn(target.row)
          const before = screen(list)
          nextId += 1
          const id = `m${String(nextId)}`
          await host.rename(target.at, id)
          scan()
          // A rename redraws the input in the same element: nothing may move.
          if (screen(list).join(',') !== before.join(',').replace(was, id)) {
            failures.push(
              `trial ${String(trial)} step ${String(step)}: rename ${was} -> ${id} moved the row`
              + `\n  before=[${before.join(' ')}] got=[${screen(list).join(' ')}]\n  ${log.join('\n  ')}`,
            )
            break
          }
          log.push(`rename ${was} -> ${id}`)
        } else if (roll < 0.58 && count >= 2) {
          // A delete and an add inside one debounce window: the pass sees both.
          const before = screen(list)
          const removed = await deleteScreenRow(list, Math.floor(random() * count))
          nextId += 1
          const id = `m${String(nextId)}`
          await host.add(id)
          holdPass = true
          scan()
          holdPass = false
          scan()
          const want = [...before.filter(other => other !== removed), id]
          deletes += 1
          if (screen(list).join(',') !== want.join(',')) {
            failures.push(
              `trial ${String(trial)} step ${String(step)} delete+add in one window\n  ${log.join('\n  ')}`
              + `\n  before=[${before.join(' ')}] want=[${want.join(' ')}] got=[${screen(list).join(' ')}]`,
            )
            break
          }
          log.push(`delete+add ${String(removed)} -> [${want.join(' ')}]`)
        } else if (count >= 2) {
          const before = screen(list)
          const removed = await deleteScreenRow(list, Math.floor(random() * count))
          holdPass = random() < 0.25
          scan()
          holdPass = false
          scan()
          const want = before.filter(other => other !== removed)
          deletes += 1
          if (screen(list).join(',') !== want.join(',')) {
            failures.push(
              `trial ${String(trial)} step ${String(step)}\n  ${log.join('\n  ')} stored=[${modelOrderOf(PROVIDER).join(' ')}]`
              + `\n  before=[${before.join(' ')}] want=[${want.join(' ')}] got=[${screen(list).join(' ')}]`,
            )
            break
          }
          log.push(`delete ${String(removed)} = [${want.join(' ')}]`)
        }
      }
      await act(async () => { root.unmount() })
    }
    expect(failures).toEqual([])
    expect(deletes).toBeGreaterThan(0)
  })
})