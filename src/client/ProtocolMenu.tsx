/**
 * The protocol menu a key's picker opens.
 *
 * A native `<select>` was the first shape of this control, but the OS draws its
 * list and no page can put an explanation beside an option — and these options
 * are not self-describing: "Chat Completions" and "Responses" are the same
 * provider's two wires, and which one a key should use is a question about the
 * models behind it, not about the acronym. The menu therefore renders its own
 * list: one row per protocol, the protocol's name, and the line that says what
 * it is for, with the one in force ticked (user request, 参考图).
 *
 * It is portalled onto `<body>`: the key list clips its own overflow, so a menu
 * drawn inside the row would be cut off by the panel it belongs to. Fixed
 * positioning against the trigger's rect keeps it attached while the settings
 * page scrolls, and it closes on an outside press, on Escape, and on a pick.
 *
 * @module dsh-model-think-level/client/ProtocolMenu
 */

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { createPortal } from 'react-dom'

/** One choice: the protocol's stored value, its name, and what it is for. */
export interface ProtocolOption {
  /** The value written to the key index ('' = follow the provider's own). */
  readonly value: string
  /** The protocol's name, as the row reads it. */
  readonly title: string
  /** One line saying what the protocol is for. */
  readonly hint: string
}

/** Props of {@link ProtocolMenu}. */
export interface ProtocolMenuProps {
  /** The trigger the menu hangs off. */
  readonly anchor: HTMLElement
  /** The menu's own heading. */
  readonly label: string
  /** The choices, in order; the pinned one keeps its own seat (see offeredProtocols). */
  readonly options: readonly ProtocolOption[]
  /** The value currently in force ('' for the provider's own protocol). */
  readonly selected: string
  /** Called with the picked value; the menu closes itself afterwards. */
  readonly onPick: (value: string) => void
  /** Called when the menu wants to close without a pick. */
  readonly onClose: () => void
}

/** The tick drawn on the option in force. */
const CHECK_PATH = 'M3.6 8.4 6.4 11.2 12.4 5.2'

/** The gap between the trigger and the menu, in pixels. */
const MENU_GAP = 6

/** The menu's width; wide enough for the longest hint without wrapping badly. */
const MENU_WIDTH = 292

/** Keep the menu this far from the viewport edges. */
const MENU_MARGIN = 8

/** The room one option takes, used to decide whether the menu fits below. */
const OPTION_HEIGHT = 56

/** One stroke glyph, on the same 16px grid the key list draws on. */
function Glyph({ paths }: { paths: readonly string[] }): ReactNode {
  return (
    <svg
      viewBox="0 0 16 16"
      width={12}
      height={12}
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      {paths.map(d => (
        <path key={d} d={d} />
      ))}
    </svg>
  )
}

/** Where the menu sits: its left edge on the trigger's, below unless it would hang off. */
function place(anchor: HTMLElement, count: number): { left: number; top: number } {
  const rect = anchor.getBoundingClientRect()
  const height = count * OPTION_HEIGHT + 46
  const viewportWidth = window.innerWidth || 0
  const viewportHeight = window.innerHeight || 0
  // Line up with the trigger's LEFT edge (user request): the menu reads as a list
  // growing out of the value it changes. Only a trigger already hard against the
  // right edge pulls the panel back, so the menu itself is never off screen.
  const left = Math.max(
    MENU_MARGIN,
    Math.min(rect.left, viewportWidth - MENU_WIDTH - MENU_MARGIN),
  )
  const below = rect.bottom + MENU_GAP
  const above = rect.top - MENU_GAP - height
  const top = viewportHeight > 0 && below + height > viewportHeight - MENU_MARGIN && above > MENU_MARGIN ? above : below
  return { left, top }
}

/**
 * Render the protocol menu for one key row.
 * @param props - see {@link ProtocolMenuProps}.
 * @returns the menu, portalled onto `<body>`.
 */
export function ProtocolMenu(props: ProtocolMenuProps): ReactNode {
  const { anchor, label, options, selected, onPick, onClose } = props
  const [position, setPosition] = useState(() => place(anchor, options.length))
  const box = useRef<HTMLDivElement | null>(null)
  const items = useRef<Array<HTMLButtonElement | null>>([])

  // The menu stays glued to its trigger: the settings page scrolls and resizes.
  useLayoutEffect(() => {
    const reposition = (): void => {
      setPosition(place(anchor, options.length))
    }
    reposition()
    window.addEventListener('resize', reposition)
    window.addEventListener('scroll', reposition, true)
    return () => {
      window.removeEventListener('resize', reposition)
      window.removeEventListener('scroll', reposition, true)
    }
  }, [anchor, options.length])

  // Open on the choice in force, so arrow keys start where the key stands.
  useEffect(() => {
    const at = Math.max(0, options.findIndex(option => option.value === selected))
    items.current[at]?.focus()
  }, [options, selected])

  // A press anywhere else dismisses the menu, as every other menu in the app does.
  useEffect(() => {
    const onPress = (event: Event): void => {
      const target = event.target
      if (!(target instanceof Node)) return
      if (box.current?.contains(target) === true) return
      if (anchor.contains(target)) return
      onClose()
    }
    document.addEventListener('pointerdown', onPress, true)
    return () => {
      document.removeEventListener('pointerdown', onPress, true)
    }
  }, [anchor, onClose])

  const focusAt = useCallback(
    (index: number): void => {
      if (options.length === 0) return
      const next = (index + options.length) % options.length
      items.current[next]?.focus()
    },
    [options.length],
  )

  const onKeyDown = (event: React.KeyboardEvent<HTMLDivElement>): void => {
    const current = items.current.findIndex(item => item === document.activeElement)
    if (event.key === 'Escape') {
      event.preventDefault()
      event.stopPropagation()
      onClose()
      return
    }
    if (event.key === 'ArrowDown') {
      event.preventDefault()
      focusAt(current + 1)
      return
    }
    if (event.key === 'ArrowUp') {
      event.preventDefault()
      focusAt(current < 0 ? options.length - 1 : current - 1)
      return
    }
    if (event.key === 'Home') {
      event.preventDefault()
      focusAt(0)
      return
    }
    if (event.key === 'End') {
      event.preventDefault()
      focusAt(options.length - 1)
    }
  }

  return createPortal(
    <div
      ref={box}
      className="bre-protocol-menu"
      style={{ left: position.left, top: position.top }}
      onKeyDown={onKeyDown}
    >
      <p className="bre-protocol-menu-title">{label}</p>
      <ul className="bre-protocol-menu-list" role="listbox" aria-label={label}>
        {options.map((option, index) => {
          const active = option.value === selected
          return (
            <li key={option.value}>
              <button
                ref={node => {
                  items.current[index] = node
                }}
                type="button"
                role="option"
                aria-selected={active}
                aria-checked={active}
                data-protocol-value={option.value}
                className="bre-protocol-option"
                tabIndex={-1}
                onClick={() => {
                  onPick(option.value)
                }}
              >
                <span className="bre-protocol-option-mark" aria-hidden="true">
                  {active ? <Glyph paths={[CHECK_PATH]} /> : null}
                </span>
                <span className="bre-protocol-option-text">
                  <span className="bre-protocol-option-title">{option.title}</span>
                  <span className="bre-protocol-option-hint">{option.hint}</span>
                </span>
              </button>
            </li>
          )
        })}
      </ul>
    </div>,
    document.body,
  )
}
