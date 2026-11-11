/**
 * The failure-detail seat: re-reads the session's durable events and puts a
 * quiet 「查看详情」 button at the end of each OFFICIAL failure row.
 *
 * Why the seat exists at all: the Chat row for a failed turn is drawn from a
 * projection that deliberately blanks the provider message for `AUTH`
 * (`displayFailure()` in `dsh-client-ui-trajectory` — "safe for Chat"), and the
 * DSH error code is then swapped for a fixed label. The ORIGINAL text is still
 * in the stream this page already holds — `turn/end → data.reason.error.
 * {message, code}` — so nothing here guesses: the popover shows exactly what
 * the provider answered, including the HTTP status and traceId.
 *
 * Two rules keep this neighbouring the official row instead of fighting it:
 *   - the button rides the row's message span as a text run (a grid item would
 *     be pushed onto a second line by the row's three-column template);
 *   - every colour comes from this plugin's `--bre-*` theme vars, so the seat
 *     and the popover follow whichever theme the shell is in.
 *
 * @module dsh-model-think-level/client/injection/error-detail
 */

import { currentSessionId, type SessionsLike, type UiSessionLike } from './session-directory.js'

/** The copy face this module needs (a keyed translator). */
type Copy = (key: string, params?: Record<string, unknown>) => string

/** Structural faces: the client kernel is not imported at runtime. */
interface DurableEventLike {
  readonly type?: string
  readonly seq?: number
  readonly data?: unknown
}

interface EventEntryLike {
  readonly type?: string
  readonly event?: DurableEventLike
}

interface EventSourceLike {
  getSnapshot(): { entries?: readonly EventEntryLike[] }
  subscribe(listener: () => void): () => void
}

interface BindingLike {
  readonly sessionId?: string
  readonly eventSource?: EventSourceLike
}

interface SessionsBindingLike extends SessionsLike {
  binding?(id: string): BindingLike | undefined
}

/** What this module needs from the plugin context. */
export interface ErrorDetailContext {
  get?(name: string): unknown
}

/** Dependencies of the seat. */
export interface ErrorDetailDeps {
  /** The client root context (only `get` is used). */
  ctx: ErrorDetailContext
  /** The bound translator. */
  t: Copy
}

/** The seat's face. */
export interface ErrorDetail {
  /** Remove the buttons, the popover and every listener. */
  dispose: () => void
}

/** One failure, reduced to what the popover shows. */
interface FailureView {
  sessionId: string
  seq: number
  /** DSH's own classification (AUTH / QUOTA / RATE_LIMIT / …). */
  code: string
  /** HTTP status parsed off the provider message, when it carries one. */
  http?: number
  /** The provider's human message. */
  reason: string
  /** The provider's machine code (MODEL_ACCESS_DENIED, …). */
  providerCode?: string
  traceId?: string
  /** The untouched upstream text. */
  raw: string
}

const SECRET_PATTERNS: readonly [RegExp, string][] = [
  [/\b(sk|rk|ak)-[A-Za-z0-9_-]{8,}/g, '$1-***'],
  [/("?(?:api[_-]?key|apikey|authorization|access[_-]?token|token|x-api-key)"?\s*[:=]\s*"?)[^",}\s]+/gi, '$1***'],
  [/\bBearer\s+[A-Za-z0-9._-]{10,}/gi, 'Bearer ***'],
]

/**
 * Mask anything key-shaped: this seat shows text the product chose to hide, and
 * the reason it hid it (a provider echoing the credential back) is real.
 * @param text - the upstream message.
 * @returns the message with credential-shaped runs replaced.
 */
export function redact(text: string): string {
  let out = String(text ?? '')
  for (const [pattern, replacement] of SECRET_PATTERNS) out = out.replace(pattern, replacement)
  return out
}

/**
 * Split `403: {"code":…}` into status / payload / readable reason.
 * @param error - the durable `reason.error`.
 * @param sessionId - owning session.
 * @param seq - the `turn/end` sequence.
 * @returns the projected failure.
 */
export function projectFailure(
  error: { message?: unknown; code?: unknown },
  sessionId: string,
  seq: number,
): FailureView {
  const raw = redact(typeof error.message === 'string' ? error.message : JSON.stringify(error))
  let http: number | undefined
  let body = raw
  const status = /^\s*(\d{3})\s*:\s*([\s\S]*)$/.exec(raw)
  if (status !== null) {
    http = Number(status[1])
    body = status[2] ?? ''
  }
  let payload: { code?: unknown; message?: unknown; traceId?: unknown } | undefined
  try {
    const parsed: unknown = JSON.parse(body)
    if (parsed !== null && typeof parsed === 'object') payload = parsed as typeof payload
  } catch {
    payload = undefined
  }
  const reason =
    typeof payload?.message === 'string' && payload.message.length > 0
      ? payload.message
      : body.trim().length > 0
        ? body.trim()
        : raw
  return {
    sessionId,
    seq,
    code: typeof error.code === 'string' ? error.code : 'UNKNOWN',
    http,
    reason,
    providerCode: typeof payload?.code === 'string' ? payload.code : undefined,
    traceId: typeof payload?.traceId === 'string' ? payload.traceId : undefined,
    raw,
  }
}

const keyOf = (failure: FailureView): string => `${failure.sessionId}:${failure.seq}`

/** Every `turn/end` failure of one event window, oldest first. */
function collectFailures(source: EventSourceLike, sessionId: string): FailureView[] {
  let entries: readonly EventEntryLike[] = []
  try {
    entries = source.getSnapshot().entries ?? []
  } catch {
    return []
  }
  const failures: FailureView[] = []
  const seen = new Set<number>()
  for (const entry of entries) {
    if (entry?.type !== 'event' || entry.event === undefined) continue
    const event = entry.event
    if (event.type !== 'turn/end') continue
    const reason = (event.data as {
      reason?: { kind?: string; error?: { message?: unknown; code?: unknown } }
    } | undefined)?.reason
    if (reason?.kind !== 'error' || reason.error === undefined) continue
    const seq = event.seq ?? 0
    if (seen.has(seq)) continue
    seen.add(seq)
    failures.push(projectFailure(reason.error, sessionId, seq))
  }
  return failures
}

// ---------------------------------------------------------------------------
// Official row decoration
// ---------------------------------------------------------------------------

const ROW_SELECTOR = '[class*="turnErrorRow"]'
const CODE_SELECTOR = 'code[class*="turnErrorCode"]'
const MESSAGE_SELECTOR = '[class*="turnErrorMessage"]'
const BUTTON_ATTR = 'data-bre-error-detail'

/**
 * The fixed labels the client substitutes for these codes. Used to recognise a
 * wrapped row (its message span shows exactly this and nothing else).
 */
const OFFICIAL_LABELS: Readonly<Record<string, string>> = {
  AUTH: 'API 密钥无效',
  QUOTA: '额度不足',
  ACCOUNT_QUOTA: '额度不足',
  ACCOUNT_SIGNED_OUT: '账号已退出',
  ACCOUNT_SIGN_IN_REQUIRED: '需要登录',
  INTERRUPTED: '已中断',
}

function textOf(row: HTMLElement, selector: string): string {
  const node = row.querySelector(selector)
  return (node?.textContent ?? '').trim()
}

/** The row's own message text, with our appended button label excluded. */
function messageText(row: HTMLElement): string {
  const node = row.querySelector<HTMLElement>(MESSAGE_SELECTOR)
  if (node === null) return ''
  let out = ''
  for (const child of node.childNodes) {
    if (child instanceof HTMLElement && child.hasAttribute(BUTTON_ATTR)) continue
    out += child.textContent ?? ''
  }
  return out.trim()
}

/** Pair one official row with one durable failure; a row is used at most once. */
function matchFailure(row: HTMLElement, failures: readonly FailureView[], used: ReadonlySet<string>): FailureView | undefined {
  if (failures.length === 0) return undefined
  const code = textOf(row, CODE_SELECTOR)
  const shown = textOf(row, MESSAGE_SELECTOR)
  const pool = failures.filter((failure) => !used.has(keyOf(failure)))
  const sameCode = code.length === 0 ? pool : pool.filter((failure) => failure.code === code)
  if (sameCode.length === 0) return undefined
  // A wrapped row shows the fixed label; the oldest unused failure of that code wins.
  const label = OFFICIAL_LABELS[code]
  if (label !== undefined && shown === label) return sameCode[0]
  // An unwrapped row shows the provider text (usually clipped to the first line).
  const exact = sameCode.find((failure) => {
    if (failure.http !== undefined && shown.startsWith(`${failure.http}:`)) return true
    const raw = failure.raw
    if (raw.length === 0 || shown.length === 0) return false
    return raw.startsWith(shown.slice(0, 40)) || shown.startsWith(raw.slice(0, 40))
  })
  return exact ?? sameCode[0]
}

// ---------------------------------------------------------------------------
// Popover
// ---------------------------------------------------------------------------

const POPOVER_ID = 'bre-error-detail-popover'

function el<K extends keyof HTMLElementTagNameMap>(tag: K, className?: string, text?: string): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag)
  if (className !== undefined) node.className = className
  if (text !== undefined) node.textContent = text
  return node
}

async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text)
    return true
  } catch {
    try {
      const area = document.createElement('textarea')
      area.value = text
      area.style.position = 'fixed'
      area.style.opacity = '0'
      document.body.append(area)
      area.select()
      const ok = document.execCommand('copy')
      area.remove()
      return ok
    } catch {
      return false
    }
  }
}

/**
 * Build the seat.
 * @param deps - the plugin context and translator.
 * @returns the {@link ErrorDetail} face.
 */
export function createErrorDetail(deps: ErrorDetailDeps): ErrorDetail {
  const { ctx, t } = deps
  let failures: readonly FailureView[] = []
  let disposed = false
  let decorateTimer: number | undefined

  const copyButton = (text: string, label: string): HTMLButtonElement => {
    const button = el('button', 'bre-ed-copy', label)
    button.type = 'button'
    button.addEventListener('click', () => {
      void copyText(text).then((ok) => {
        if (!ok) return
        button.textContent = t('errorDetailCopied')
        window.setTimeout(() => { button.textContent = label }, 1400)
      })
    })
    return button
  }

  const detailRow = (
    label: string,
    value: string | undefined,
    options: { mono?: boolean; muted?: boolean; copy?: boolean } = {},
  ): HTMLElement | null => {
    if (value === undefined || value.length === 0) return null
    const row = el('div', 'bre-ed-row')
    row.append(el('span', 'bre-ed-label', label))
    const classes = ['bre-ed-value']
    if (options.mono === true) classes.push('bre-ed-mono')
    if (options.muted === true) classes.push('bre-ed-muted')
    row.append(el('span', classes.join(' '), value))
    if (options.copy === true) row.append(copyButton(value, t('errorDetailCopy')))
    return row
  }

  /** The official row's own wording, quoted back so the wrap is obvious. */
  const officialText = (code: string, shown: string): string => {
    const known = OFFICIAL_LABELS[code]
    if (known === undefined) return `${shown} — ${t('errorDetailUnwrapped')}`
    if (shown === known) return `${shown} — ${t('errorDetailFixedLabel')}`
    return known
  }

  const ensurePopover = (): HTMLDivElement => {
    const existing = document.getElementById(POPOVER_ID)
    if (existing instanceof HTMLDivElement) return existing
    const popover = el('div', 'bre-ed-pop')
    popover.id = POPOVER_ID
    popover.setAttribute('role', 'dialog')
    popover.setAttribute('aria-label', t('errorDetailTitle'))
    document.body.append(popover)
    return popover
  }

  const closePopover = (): void => {
    const popover = document.getElementById(POPOVER_ID)
    if (popover !== null) popover.style.display = 'none'
    document.removeEventListener('pointerdown', onOutsidePointer, true)
    document.removeEventListener('keydown', onEscape, true)
    window.removeEventListener('scroll', closePopover, true)
    window.removeEventListener('resize', closePopover, true)
  }

  function onOutsidePointer(event: PointerEvent): void {
    const popover = document.getElementById(POPOVER_ID)
    if (popover === null) return
    if (event.target instanceof Node && popover.contains(event.target)) return
    if (event.target instanceof Element && event.target.closest(`[${BUTTON_ATTR}]`) !== null) return
    closePopover()
  }

  function onEscape(event: KeyboardEvent): void {
    if (event.key === 'Escape') closePopover()
  }

  const placePopover = (popover: HTMLElement, anchor: HTMLElement): void => {
    const rect = anchor.getBoundingClientRect()
    popover.style.visibility = 'hidden'
    popover.style.left = '0px'
    popover.style.top = '0px'
    const width = popover.offsetWidth
    const height = popover.offsetHeight
    const margin = 8
    // Anchor scrolled out of sight (long thread, list jumped): center instead of
    // floating off-screen.
    if (rect.bottom < margin || rect.top > window.innerHeight - margin) {
      const centeredLeft = Math.max(margin, (window.innerWidth - width) / 2)
      const centeredTop = Math.max(margin, (window.innerHeight - height) / 2)
      popover.style.left = `${Math.round(centeredLeft)}px`
      popover.style.top = `${Math.round(centeredTop)}px`
      popover.style.visibility = ''
      return
    }
    const left = Math.min(Math.max(margin, rect.left), Math.max(margin, window.innerWidth - width - margin))
    let top = rect.bottom + margin
    if (top + height > window.innerHeight - margin) top = Math.max(margin, rect.top - height - margin)
    popover.style.left = `${Math.round(left)}px`
    popover.style.top = `${Math.round(top)}px`
    popover.style.visibility = ''
  }

  const openPopover = (failure: FailureView, anchor: HTMLElement, shown: string): void => {
    const popover = ensurePopover()
    popover.textContent = ''

    const head = el('div', 'bre-ed-head')
    head.append(el('span', 'bre-ed-dot'))
    head.append(el('span', 'bre-ed-title', t('errorDetailTitle')))
    const chips = el('span', 'bre-ed-chips')
    if (failure.http !== undefined) chips.append(el('code', 'bre-ed-chip', `HTTP ${failure.http}`))
    if (failure.providerCode !== undefined) {
      chips.append(el('code', 'bre-ed-chip bre-ed-chip-strong', failure.providerCode))
    }
    head.append(chips)
    const close = el('button', 'bre-ed-x', '×')
    close.type = 'button'
    close.setAttribute('aria-label', t('errorDetailClose'))
    close.addEventListener('click', () => closePopover())
    head.append(close)
    popover.append(head)

    const body = el('div', 'bre-ed-body')
    const rows: Array<HTMLElement | null> = [
      detailRow(t('errorDetailReason'), failure.reason),
      detailRow(t('errorDetailTrace'), failure.traceId, { mono: true, copy: true }),
      detailRow(t('errorDetailCode'), failure.code, { mono: true }),
      detailRow(t('errorDetailShown'), officialText(failure.code, shown), { muted: true }),
    ]
    for (const row of rows) if (row !== null) body.append(row)
    popover.append(body)

    const rawWrap = el('div', 'bre-ed-raw')
    const toggle = el('button', 'bre-ed-raw-toggle', `▸ ${t('errorDetailRaw')}`)
    toggle.type = 'button'
    const pre = el('pre', 'bre-ed-pre', failure.raw)
    pre.hidden = true
    toggle.addEventListener('click', () => {
      pre.hidden = !pre.hidden
      toggle.textContent = `${pre.hidden ? '▸' : '▾'} ${t('errorDetailRaw')}`
    })
    rawWrap.append(toggle, pre)
    popover.append(rawWrap)

    const foot = el('div', 'bre-ed-foot')
    foot.append(el('span', 'bre-ed-src', t('errorDetailSource')))
    foot.append(copyButton(failure.raw, t('errorDetailCopyRaw')))
    popover.append(foot)

    popover.style.display = 'block'
    placePopover(popover, anchor)
    document.addEventListener('pointerdown', onOutsidePointer, true)
    document.addEventListener('keydown', onEscape, true)
    window.addEventListener('scroll', closePopover, true)
    window.addEventListener('resize', closePopover, true)
  }

  // -------------------------------------------------------------------------
  // Decoration
  // -------------------------------------------------------------------------

  /**
   * A row can only be dressed when there is a failure to pair it with: with an
   * empty `failures` list the scan below cannot add, update or remove anything,
   * so the whole pass is dead work. That matters because `scheduleDecorate` is
   * fed by a `document.body` observer, which fires on every keystroke in the
   * composer — the fast return keeps typing off the document walk entirely, and
   * the sweep is O(1) on a transcript with no failures.
   *
   * The live-button check covers the one case where an empty `failures` list
   * still has DOM to look at: a switch of session leaves our buttons behind in
   * a transcript the client has not repainted yet. It reads this module's own
   * set rather than `querySelector('[data-bre-error-detail]')`, because that
   * attribute selector still walks every element (0.3–0.7 ms on a long chat).
   */
  const buttons = new Set<HTMLButtonElement>()

  /** Whether a button this module inserted is still in the document. */
  const hasLiveButton = (): boolean => {
    for (const button of buttons) if (button.isConnected) return true
    // Every one was detached by an official repaint: forget them for good.
    buttons.clear()
    return false
  }

  const decorate = (): void => {
    if (failures.length === 0 && !hasLiveButton()) return
    const rows = document.querySelectorAll<HTMLElement>(ROW_SELECTOR)
    if (rows.length === 0) return
    const used = new Set<string>()
    const label = t('errorDetailButton')
    for (const row of rows) {
      const failure = matchFailure(row, failures, used)
      if (failure === undefined) continue
      used.add(keyOf(failure))
      const shown = messageText(row)
      const host = row.querySelector<HTMLElement>(MESSAGE_SELECTOR) ?? row
      let button = host.querySelector<HTMLButtonElement>(`:scope > button[${BUTTON_ATTR}]`)
      if (button === null) {
        button = document.createElement('button')
        button.type = 'button'
        button.className = 'bre-ed-view'
        button.setAttribute(BUTTON_ATTR, '1')
        host.append(button)
        buttons.add(button)
      }
      if (button.textContent !== label) button.textContent = label
      button.onclick = (event) => {
        event.preventDefault()
        event.stopPropagation()
        openPopover(failure, button as HTMLButtonElement, shown)
      }
    }
  }

  /** Coalesce burst mutations from the transcript renderer. */
  const scheduleDecorate = (): void => {
    if (decorateTimer !== undefined) return
    decorateTimer = window.setTimeout(() => {
      decorateTimer = undefined
      decorate()
    }, 120)
  }

  // -------------------------------------------------------------------------
  // Session tracking
  // -------------------------------------------------------------------------

  let currentId: string | undefined
  let unbind: (() => void) | undefined

  const scan = (sessionId: string, source: EventSourceLike): void => {
    if (disposed) return
    const next = collectFailures(source, sessionId)
    const same = next.length === failures.length
      && next.every((failure, index) => keyOf(failure) === keyOf(failures[index]!))
    if (same) return
    failures = next
    scheduleDecorate()
  }

  const detach = (): void => {
    unbind?.()
    unbind = undefined
  }

  const attach = (sessionId: string): void => {
    const sessions = ctx.get?.('sessions') as SessionsBindingLike | undefined
    let binding: BindingLike | undefined
    try {
      binding = sessions?.binding?.(sessionId)
    } catch {
      binding = undefined
    }
    const source = binding?.eventSource
    if (source === undefined) return
    try {
      scan(sessionId, source)
      unbind = source.subscribe(() => {
        try {
          scan(sessionId, source)
        } catch {
          // A torn-down binding must not take the watcher down with it.
        }
      })
    } catch {
      unbind = undefined
    }
  }

  const tick = (): void => {
    if (disposed) return
    const sessions = ctx.get?.('sessions') as SessionsLike | undefined
    const uiSession = ctx.get?.('uiSession') as UiSessionLike | undefined
    const id = currentSessionId(sessions, uiSession)
    if (id === currentId && unbind !== undefined) return
    if (id !== currentId) {
      detach()
      currentId = id
      failures = []
      closePopover()
      scheduleDecorate()
    }
    if (id !== undefined) attach(id)
  }

  const poll = window.setInterval(tick, 1000)
  tick()

  const observer = new MutationObserver(scheduleDecorate)
  observer.observe(document.body, { childList: true, subtree: true })
  // The observer misses text-only updates the transcript applies in place, so a
  // slow sweep backs it up; both settle on the same idempotent decorate().
  const sweep = window.setInterval(decorate, 1500)
  decorate()

  return {
    dispose: (): void => {
      disposed = true
      window.clearInterval(poll)
      window.clearInterval(sweep)
      if (decorateTimer !== undefined) window.clearTimeout(decorateTimer)
      decorateTimer = undefined
      observer.disconnect()
      detach()
      currentId = undefined
      failures = []
      closePopover()
      for (const button of document.querySelectorAll<HTMLElement>(`[${BUTTON_ATTR}]`)) button.remove()
      buttons.clear()
      document.getElementById(POPOVER_ID)?.remove()
    },
  }
}
