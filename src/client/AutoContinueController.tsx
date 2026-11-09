/**
 * The in-session auto-continue controller.
 *
 * A small chip that lives on the composer's stat line — the row that already
 * carries 「5 轮 · 185 步 · 115 tok/s」 and the context meter — and is inserted
 * right of the context pill. It exists ONLY while a continue chain is running:
 *
 *   waiting   → `第 2/5 次 · 21s`, countdown, 停止 available
 *   sent      → `已发送「继续」 第 2/5 次`
 *   exhausted → `连续 5 次后停手`, 重置 available
 *   idle      → nothing at all (the chip unmounts, the slot stays empty)
 *
 * Every action is scoped to the CURRENT session: 「停止」 ends this chain and
 * mutes the session until the user posts again; the global switch and the
 * policy live in the settings pane, which 「设置…」 opens.
 *
 * Mounting is a foreign React root appended to the host's stat line. React owns
 * that line, so a re-render removes unknown children; a MutationObserver plus a
 * slow tick put the slot back (idempotent, and throttled so streaming cannot
 * turn into a render storm).
 *
 * @module dsh-model-think-level/client/AutoContinueController
 */

import { useEffect, useState, useSyncExternalStore } from 'react'
import type { ReactNode } from 'react'
import { mountReact, unmountReact, type ForeignMount } from './injection/mount.js'
import type { AutoContinueRunner } from './injection/auto-continue-run.js'

type Translate = (key: string, params?: Record<string, unknown>) => string

/** The host tags every composer stat pill with this attribute. */
const STAT_PILL = '[data-composer-stat]'
/** Marks the element this module owns. */
const SLOT_ATTR = 'data-bre-autocontinue'

/**
 * The stat line: the deepest element that still contains every visible pill.
 * Widen from the first pill's parent until it covers them all, so a nesting
 * change upstream cannot pin the chip to half the row.
 */
function statsLine(): HTMLElement | undefined {
  const pills = Array.from(document.querySelectorAll<HTMLElement>(STAT_PILL))
    .filter(pill => pill.isConnected && pill.getClientRects().length > 0)
  const first = pills[0]
  if (first === undefined) return undefined
  let row: HTMLElement | undefined = first.parentElement ?? undefined
  for (let depth = 0; row !== undefined && depth < 8; depth += 1) {
    if (pills.every(pill => row !== undefined && row.contains(pill))) break
    row = row.parentElement ?? undefined
  }
  return row
}

/** The chip itself; renders nothing unless a chain is live. */
function Chip(props: { runner: AutoContinueRunner; t: Translate; onSettings: () => void }): ReactNode {
  const { runner, t } = props
  const status = useSyncExternalStore(runner.subscribe, runner.status)
  const [open, setOpen] = useState(false)
  const [now, setNow] = useState(() => Date.now())

  useEffect(() => {
    if (status.phase !== 'waiting') return undefined
    setNow(Date.now())
    const timer = window.setInterval(() => setNow(Date.now()), 500)
    return () => window.clearInterval(timer)
  }, [status.phase, status.nextSendAt])

  useEffect(() => {
    if (status.phase === 'idle') setOpen(false)
  }, [status.phase])

  if (status.sessionId === undefined || status.phase === 'idle') return null

  const seconds = Math.max(0, Math.ceil((status.nextSendAt - now) / 1000))
  const label = status.phase === 'waiting'
    ? t('autoContinueControllerWaiting', { n: status.consecutive + 1, max: status.maxRetries, seconds })
    : status.phase === 'sent'
      ? t('autoContinueControllerSent', { n: status.consecutive, max: status.maxRetries })
      : t('autoContinueControllerExhausted', { max: status.maxRetries })
  const detail = status.detail === ''
    ? undefined
    : t('autoContinueControllerDetail', { detail: status.detail })

  const action = (text: string, run: () => void): ReactNode => (
    <button
      key={text}
      type="button"
      role="menuitem"
      className="bre-ac-action"
      onClick={() => { setOpen(false); run() }}
    >{text}</button>
  )

  const actions: ReactNode[] = []
  if (status.phase === 'waiting') actions.push(action(t('autoContinueControllerResume'), () => runner.resumeNow()))
  if (status.phase === 'waiting' || status.phase === 'sent') actions.push(action(t('autoContinueControllerStop'), () => runner.stop()))
  if (status.phase === 'exhausted') actions.push(action(t('autoContinueControllerReset'), () => runner.reset()))
  actions.push(action(t('autoContinueControllerSettings'), props.onSettings))

  return (
    <span className="bre-ac">
      <button
        type="button"
        className={`bre-ac-chip bre-ac-chip-${status.phase}`}
        aria-label={t('autoContinueControllerAria')}
        aria-expanded={open}
        title={detail ?? label}
        onClick={() => setOpen(value => !value)}
      >
        <span className="bre-ac-dot" aria-hidden="true" />
        <span className="bre-ac-text">{label}</span>
      </button>
      {open && <div className="bre-ac-pop" role="menu">{actions}</div>}
    </span>
  )
}

/** What {@link mountAutoContinueController} needs. */
export interface AutoContinueControllerDeps {
  runner: AutoContinueRunner
  t: Translate
  /** Open the settings pane (the auto-continue card lives there). */
  onSettings: () => void
}

/**
 * Mount the chip on the composer stat line and keep it there.
 * @returns a disposer that unmounts the root and stops observing.
 */
export function mountAutoContinueController(deps: AutoContinueControllerDeps): () => void {
  let host: HTMLElement | undefined
  let mounted: ForeignMount | undefined
  let scheduled = 0
  let lastCheck = 0

  const detach = (): void => {
    unmountReact(mounted)
    mounted = undefined
    host?.remove()
    host = undefined
  }

  const ensure = (): void => {
    const line = statsLine()
    if (line === undefined) { detach(); return }
    if (host !== undefined && host.parentElement === line && host.isConnected) return
    detach()
    host = document.createElement('span')
    host.className = 'bre-ac-host'
    host.setAttribute(SLOT_ATTR, '')
    line.append(host)
    mounted = mountReact(host, <Chip runner={deps.runner} t={deps.t} onSettings={deps.onSettings} />)
  }

  // Streaming mutates the dock constantly: coalesce to at most one check per
  // 400 ms so a long answer cannot turn the observer into a render storm.
  const schedule = (): void => {
    if (scheduled !== 0) return
    const wait = Math.max(0, 400 - (Date.now() - lastCheck))
    scheduled = window.setTimeout(() => {
      scheduled = 0
      lastCheck = Date.now()
      ensure()
    }, wait)
  }

  const observer = new MutationObserver(schedule)
  observer.observe(document.body, { childList: true, subtree: true })
  // Safety net for a dock re-render that produces no childList burst we see.
  const tick = window.setInterval(ensure, 2000)
  ensure()

  return () => {
    observer.disconnect()
    window.clearInterval(tick)
    if (scheduled !== 0) window.clearTimeout(scheduled)
    detach()
  }
}
