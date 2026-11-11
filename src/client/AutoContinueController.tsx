/**
 * The in-session auto-continue controller.
 *
 * A small chip that lives on the composer's stat line — the row that already
 * carries 「5 轮 · 185 步 · 115 tok/s」 and the context meter — and is inserted
 * right of the context pill. It exists ONLY while a continue chain is running:
 *
 *   waiting   → `◔ 自动继续 3s 1/5`, countdown ring, click opens the popover
 *   paused    → `⏸ 自动继续 回到本会话后继续` (the view left this session, so
 *               the countdown is frozen; it resumes from the remaining seconds)
 *   sent      → `✓ 已继续 2/5`
 *   exhausted → `⏱ 已停手 5/5` + an inline 重置
 *   idle      → nothing at all (the chip unmounts, the slot stays empty)
 *
 * The chip answers three questions in that order, at 22px high: who is doing
 * what (a verb, not a counter), how long is left (a ring, then an exact
 * number), and how many tries are left (quiet small type — it is a ceiling,
 * not a reading). The popover carries the one sentence that does not fit:
 * why the chain exists, what it will do, and how the user takes over.
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

/** The composer dock: the row that carries the pills and the context meter. */
const DOCK = '[data-composer-dock]'
/** 0.1 hosts wrap every pill in one element carrying this attribute. */
const STAT_LINE = '[data-composer-stats]'
/** 0.2 hosts tag each pill individually instead. */
const STAT_PILL = '[data-composer-stat]'
/** Marks the element this module owns. */
const SLOT_ATTR = 'data-bre-autocontinue'

/** Circumference of the 13px ring (r = 6 in a 16-unit viewBox). */
const RING_LENGTH = 2 * Math.PI * 6

/**
 * The row the chip belongs to.
 *
 * Hosts divested the stat line of a single wrapper: as of 0.2 the pills are
 * independent slot entries and only each pill's own anchor keeps
 * `data-composer-stat`. So the shared wrapper is gone and the pills' nearest
 * common ancestor is the slot container — appending there would bury the chip
 * between the pills and the context meter. The dock (`data-composer-dock`) is
 * the one element that still spans the whole row, and it is also the row the
 * chip is designed for: last child, right of the context meter.
 *
 * The older shapes stay as fallbacks so a downgrade keeps working.
 */
function anchorRow(): HTMLElement | undefined {
  // Several composer docks can exist at once (a subagent pane, a split view);
  // the user is looking at the last visible one, which is the main composer.
  const docks = Array.from(document.querySelectorAll<HTMLElement>(DOCK))
    .filter(dock => dock.isConnected && dock.getClientRects().length > 0)
  const dock = docks.at(-1)
  if (dock !== undefined) return dock
  const line = document.querySelector<HTMLElement>(STAT_LINE)
  if (line !== null && line.isConnected && line.getClientRects().length > 0) return line
  // Last resort: widen from the first visible pill until it covers them all,
  // so a nesting change upstream cannot pin the chip to half the row.
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

/** A 24-unit line icon; the chip shares no sprite with the host. */
function Glyph(props: { className: string; children: ReactNode }): ReactNode {
  return (
    <svg
      className={props.className}
      viewBox="0 0 24 24"
      aria-hidden="true"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {props.children}
    </svg>
  )
}

/** The countdown ring: the arc is the time that is LEFT, shrinking clockwise. */
function Ring(props: { ratio: number }): ReactNode {
  // A positive offset of C·(1−p) leaves a p-long dash starting at 12 o'clock,
  // so the arc is exactly the time LEFT and it shrinks clockwise.
  const offset = RING_LENGTH * (1 - Math.max(0, Math.min(1, props.ratio)))
  return (
    <span className="bre-ac-ring" aria-hidden="true">
      <svg viewBox="0 0 16 16">
        <circle className="bre-ac-ring-track" cx="8" cy="8" r="6" />
        <circle
          className="bre-ac-ring-fill"
          cx="8"
          cy="8"
          r="6"
          strokeDasharray={RING_LENGTH}
          strokeDashoffset={offset}
        />
      </svg>
    </span>
  )
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

  const max = status.maxRetries
  const attempt = status.phase === 'waiting' ? status.consecutive + 1 : status.consecutive
  const remaining = Math.max(0, status.nextSendAt - now)
  const seconds = Math.ceil(remaining / 1_000)
  // The ring's arc follows the configured wait; a provider's longer delay just
  // makes the last stretch sit still at full, which is honest enough.
  const waitMs = Math.max(1_000, status.waitMs)
  const ratio = status.phase === 'waiting' ? Math.min(1, remaining / waitMs) : 0
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

  // Settings lives in the footer (one entry, always in the same place), so the
  // action list only carries what applies to the current phase.
  const actions: ReactNode[] = []
  if (status.phase === 'waiting') {
    actions.push(action(t('autoContinueControllerResume'), () => runner.resumeNow()))
    actions.push(action(t('autoContinueControllerStop'), () => runner.stop()))
  } else if (status.phase === 'sent') {
    actions.push(action(t('autoContinueControllerStop'), () => runner.stop()))
  }

  const inner = status.phase === 'waiting'
    ? (
      <>
        <Ring ratio={ratio} />
        <span className="bre-ac-text">{t('autoContinueControllerWaiting')}</span>
        <span className="bre-ac-num">{t('autoContinueControllerSeconds', { seconds })}</span>
        <span className="bre-ac-ratio">{t('autoContinueControllerRatio', { n: attempt, max })}</span>
        <Glyph className="bre-ac-caret"><path d="M6.5 9.5 12 15l5.5-5.5" /></Glyph>
      </>
    )
    : status.phase === 'sent'
        ? (
          <>
            <Glyph className="bre-ac-tick"><path d="M4.8 12.5 9.6 17.3 19.2 6.9" /></Glyph>
            <span className="bre-ac-text">{t('autoContinueControllerSent')}</span>
            <span className="bre-ac-ratio">{t('autoContinueControllerRatio', { n: attempt, max })}</span>
          </>
        )
        : (
          <>
            <Glyph className="bre-ac-tick"><circle cx="12" cy="12" r="8.2" /><path d="M12 7.6V12l3 1.9" /></Glyph>
            <span className="bre-ac-text">{t('autoContinueControllerExhausted')}</span>
            <span className="bre-ac-ratio">{t('autoContinueControllerRatio', { n: max, max })}</span>
          </>
        )

  const pop = open
    ? (
      <div className="bre-ac-pop" role="menu">
        <div className="bre-ac-pop-head">
          <span className="bre-ac-pop-title">{t('autoContinueControllerPopTitle')}</span>
          <span className="bre-ac-pop-badge">{t('autoContinueControllerPopBadge', { n: attempt, max })}</span>
        </div>
        <p className="bre-ac-pop-desc">
          {t('autoContinueControllerPopDesc', { seconds, max })}
        </p>
        {actions.length > 0
          ? <div className="bre-ac-pop-actions">{actions}</div>
          : undefined}
        <div className="bre-ac-pop-foot">
          <button
            type="button"
            className="bre-ac-link"
            onClick={() => { setOpen(false); props.onSettings() }}
          >{t('autoContinueControllerSettings')}</button>
          <span className="bre-ac-note">{t('autoContinueControllerPopScope')}</span>
        </div>
      </div>
    )
    : undefined

  if (status.phase === 'exhausted') {
    // Standing down is a settled state: the chip stops being a toggle and the
    // reset sits next to it, one click away instead of three.
    return (
      <span className="bre-ac">
        <span className="bre-ac-group">
          <span
            className="bre-ac-chip bre-ac-chip-exhausted"
            title={detail ?? t('autoContinueControllerAria')}
          >{inner}</span>
          <button
            type="button"
            className="bre-ac-reset"
            onClick={() => runner.reset()}
          >{t('autoContinueControllerReset')}</button>
          <button
            type="button"
            className="bre-ac-more"
            aria-label={t('autoContinueControllerSettings')}
            onClick={() => setOpen(value => !value)}
          >
            <Glyph className="bre-ac-more-icon">
              <circle cx="5.5" cy="12" r="1.4" fill="currentColor" stroke="none" />
              <circle cx="12" cy="12" r="1.4" fill="currentColor" stroke="none" />
              <circle cx="18.5" cy="12" r="1.4" fill="currentColor" stroke="none" />
            </Glyph>
          </button>
        </span>
        {pop}
      </span>
    )
  }

  return (
    <span className="bre-ac">
      <button
        type="button"
        className={`bre-ac-chip bre-ac-chip-${status.phase}`}
        aria-label={t('autoContinueControllerAria')}
        aria-expanded={open}
        title={detail ?? t('autoContinueControllerAria')}
        onClick={() => setOpen(value => !value)}
      >
        {inner}
      </button>
      {pop}
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
    const line = anchorRow()
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
