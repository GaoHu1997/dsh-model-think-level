/**
 * The plugin's config pane: a floating panel ABOVE the settings dialog
 * (z-index 1010 — the dialog's own opaque mask sits at 1000), opened from the
 * Models-page title-row button.
 *
 * Cards, per the design's folded card-list shape: 「生图」 (enable switch on
 * the head line; the params row and the default-model select in the folded
 * body, plus the host's verbatim reason when `tools.register` threw) and
 * 「自动继续」 (the session watcher switch). The marked image models surface
 * as the select's options; marking itself lives on the Models page (展开模型行
 * → 输入模态 → 勾选「生图」), so the pane keeps no list and no empty state of
 * its own.
 *
 * Esc / backdrop / ✕ close it; the wrapper unmounts and the page keeps
 * whatever the pane saved.
 *
 * @module dsh-model-think-level/client/ConfigPane
 */

import { createElement, useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react'
import type { ChangeEvent, MouseEvent as ReactMouseEvent } from 'react'
import { createRoot } from 'react-dom/client'
import type { ReactNode } from 'react'
import { canonicalSize, IMAGE_SIZE_TIERS } from '../image/sizes.js'
import {
  autoContinueEnabled,
  autoContinueConfig,
  AUTO_CONTINUE_WAIT_MIN,
  AUTO_CONTINUE_WAIT_MAX,
  AUTO_CONTINUE_RETRIES_MIN,
  AUTO_CONTINUE_RETRIES_MAX,
  setAutoContinueEnabled,
  setAutoContinueConfig,
  subscribeAutoContinueEnabled,
  subscribeAutoContinueConfig,
} from './auto-continue-pref.js'
import {
  DEFAULT_AUTO_CONTINUE_POLICY,
  KNOWN_ERROR_CODES,
  OTHER_ERROR_CODES,
  TRANSIENT_ERROR_CODES,
  type AutoContinuePolicy,
} from './auto-continue-rules.js'
import { EffortBoundary, mountReact, unmountReact } from './injection/mount.js'
import {
  errorDetailEnabled,
  setErrorDetailEnabled,
  subscribeErrorDetailEnabled,
} from './error-detail-pref.js'
import {
  cachedImageConfigView,
  readImageConfigView,
  saveImageConfig,
  type ImageConfigView,
} from './image-config-client.js'
import { describeNamespace, providersOf } from './ops.js'
import type { RemoteApi } from './types.js'

/** The pane's deps: the settings write/read face and the plugin translator. */
export interface ConfigPaneProps {
  readonly api: RemoteApi
  readonly t: (key: string, params?: Record<string, unknown>) => string
  readonly onClose: () => void
}

/** The timeout steps, in minutes: the five the pane offers. */
const TIMEOUT_MINUTES: readonly number[] = [5, 10, 15, 30, 60]

/**
 * The timeout menu, in milliseconds. A stored value outside the five steps
 * (say the older 2-minute default) keeps its own first entry, so the select
 * never shows a step the user did not pick.
 */
function timeoutOptions(storedMs: number): readonly number[] {
  const steps = TIMEOUT_MINUTES.map(minutes => minutes * 60_000)
  return steps.includes(storedMs) ? steps : [storedMs, ...steps]
}

/** The 「生图」 card. */
export function ImageGenCard(props: { api: RemoteApi; t: (key: string, params?: Record<string, unknown>) => string }): ReactNode {
  const { api, t } = props
  // A warmed cache (the Models page prefetches on mount) paints on the first
  // frame; the effect below refreshes it behind the paint instead of gating it.
  const [view, setView] = useState<ImageConfigView | undefined>(() => cachedImageConfigView())
  const [loadError, setLoadError] = useState<string | undefined>(undefined)
  const [busyId, setBusyId] = useState<string | undefined>(undefined)
  const [notice, setNotice] = useState<string | undefined>(undefined)
  // Folded by default: this card is one entry in a list of settings, not the
  // whole pane. The switch sits on the head line, outside the folded body.
  const [open, setOpen] = useState(false)

  useEffect(() => {
    let alive = true
    void readImageConfigView().then(answer => {
      if (!alive) return
      if (answer.ok) setView(answer.data)
      else setLoadError(answer.error)
    })
    return () => { alive = false }
  }, [])

  // route → the provider's display name (`providers.<route>.displayName`),
  // read from the live settings document. The host already stamps it on each
  // row as `providerLabel`; this keeps the default-model menu readable even
  // when the running host or a stored image.json predates that field.
  const [routeNames, setRouteNames] = useState<Record<string, string>>({})
  useEffect(() => {
    let alive = true
    void describeNamespace(api).then(join => {
      const names: Record<string, string> = {}
      for (const [route, profile] of Object.entries(providersOf(join.namespace))) {
        const displayName = typeof profile['displayName'] === 'string' ? profile['displayName'].trim() : ''
        if (displayName.length > 0) names[route] = displayName
      }
      if (alive) setRouteNames(names)
    }).catch(() => {
      // Unreadable settings only cost the pretty provider name; options fall
      // back to `providerLabel` and then the route.
    })
    return () => { alive = false }
  }, [api])

  /** Refresh after any write; a failed re-read keeps the last view visible. */
  const reload = useCallback((): void => {
    void readImageConfigView().then(answer => {
      if (answer.ok) setView(answer.data)
    })
  }, [])

  /** The default-model select: one save, then the options render from the answer. */
  const setDefault = useCallback((id: string): void => {
    if (id.length === 0) return
    setBusyId('default')
    void saveImageConfig({ defaultModel: id }).then(answer => {
      setBusyId(undefined)
      if (answer.ok) { setNotice(undefined); reload() } else setNotice(answer.error)
    })
  }, [reload])

  /**
   * The service switch. Off unregisters the tool and refuses every generation
   * entry on the host, while the models and params stay stored — the pane only
   * flips the single field and re-reads the truth afterwards.
   */
  const setEnabled = useCallback((enabled: boolean): void => {
    setBusyId('enabled')
    void saveImageConfig({ enabled }).then(answer => {
      setBusyId(undefined)
      if (answer.ok) { setNotice(undefined); reload() } else setNotice(answer.error)
    })
  }, [reload])

  /**
   * The per-request timeout. Stored in milliseconds; edited as one of five
   * minute steps (5/10/15/30/60), the range the host clamps to. Committed when
   * the pick changes — a half-typed value can no longer become a setting.
   */
  const commitTimeout = useCallback((raw: string): void => {
    if (view === undefined) return
    const ms = Number(raw)
    if (!Number.isFinite(ms) || ms < 60_000 || ms > 3_600_000) return
    if (ms === view.defaults.timeoutMs) return
    void saveImageConfig({ defaults: { timeoutMs: ms } }).then(answer => {
      if (answer.ok) { setNotice(undefined); reload() } else setNotice(answer.error)
    })
  }, [view, reload])

  if (view === undefined) {
    // A skeleton, not a blank box: the pane structure is on screen from the
    // first frame, so a slow host read never looks like a dead button.
    return createElement('div', { className: 'bre-config-loading', 'aria-busy': true },
      createElement('div', { className: 'bre-config-loading-text' },
        loadError === undefined ? t('imagegenLoading') : `${t('imagegenLoadFailed')}: ${loadError}`),
      createElement('div', { className: 'bre-config-skeleton' },
        ...[0, 1, 2].map(index => createElement('div', { key: index, className: 'bre-config-skeleton-row' }))),
    )
  }

  const models = view.models
  const empty = models.length === 0
  // The card is ONE settings entry that starts folded: closed, it is a single
  // line — the name, its state and the switch. The model/params controls only
  // exist while it is open, so the pane stays a short list as it grows.
  const bodyId = 'bre-config-imagegen-body'
  // The host records why a failed `tools.register` threw; without it the only
  // symptom is a model that never asks for a picture, so the card says it out
  // loud. A registered tool (or one never attempted) leaves this undefined.
  // A switched-off service registers nothing on purpose, which is not a fault.
  const toolError = view.enabled ? view.tool.error : undefined
  // A label shared by two routes (the same model behind two providers) would
  // read as one row in the menu; the provider name disambiguates only those.
  const labelCounts = new Map<string, number>()
  for (const model of models) labelCounts.set(model.label, (labelCounts.get(model.label) ?? 0) + 1)
  const modelOptionText = (model: ImageConfigView['models'][number]): string => {
    if ((labelCounts.get(model.label) ?? 0) < 2) return model.label
    const provider = routeNames[model.route] ?? model.providerLabel ?? model.route
    return `${model.label} · ${provider}`
  }
  return createElement('div', { className: 'bre-config-card' },
    // The head line: name and description on the left (they are the expand
    // button), the state word, the switch and the chevron on the right. The
    // switch and the chevron are siblings of the button, so flipping the
    // switch never toggles the card.
    createElement('div', { className: 'bre-config-card-head' },
      createElement('button', {
        type: 'button',
        className: 'bre-config-expand',
        'aria-expanded': open,
        'aria-controls': bodyId,
        title: open ? t('imagegenCollapse') : t('imagegenExpand'),
        onClick: () => setOpen(current => !current),
      },
        createElement('span', { className: 'bre-config-card-title' }, t('imagegenSectionTitle')),
        // The one-line description, always visible: the folded card still has
        // to say what the switch turns on.
        createElement('span', { className: 'bre-config-card-hint' },
          view.enabled ? t('imagegenEnabledHint') : t('imagegenDisabledHint')),
      ),
      createElement('span', { className: 'bre-config-card-state' }, view.enabled ? t('cardStateOn') : t('cardStateOff')),
      createElement('label', { className: 'bre-config-switch', title: t('imagegenEnable') },
        createElement('input', {
          type: 'checkbox',
          className: 'bre-config-switch-input',
          role: 'switch',
          'aria-label': t('imagegenEnable'),
          checked: view.enabled,
          disabled: busyId === 'enabled',
          onChange: (event: ChangeEvent<HTMLInputElement>) => setEnabled((event.target as HTMLInputElement).checked),
        }),
        createElement('span', { className: 'bre-config-switch-track', 'aria-hidden': true }),
      ),
      createElement('span', {
        className: 'bre-config-chevron',
        'aria-hidden': true,
        'data-open': String(open),
        onClick: () => setOpen(current => !current),
      }, '›'),
    ),
    // A save failure must stay visible while the card is folded: the switch is
    // on the head line, so its error cannot live in the body.
    notice !== undefined && createElement('div', { className: 'bre-config-notice' }, notice),
    open && createElement('div', { className: 'bre-config-card-body', id: bodyId },
      toolError !== undefined && createElement('div', { className: 'bre-config-notice bre-config-notice-warn' },
        createElement('div', null, t('imagegenToolMissing')),
        createElement('div', { className: 'bre-config-notice-why' }, t('imagegenToolMissingWhy', { reason: toolError }))),
      createElement('div', { className: 'bre-config-defaults' },
        createElement('label', null, t('imagegenDefaultsLabel')),
        createElement('select', {
          className: 'bre-config-select',
          value: canonicalSize(view.defaults.size),
          'aria-label': t('imagegenSizeLabel'),
          onChange: (event: ChangeEvent<HTMLSelectElement>) => {
            void saveImageConfig({ defaults: { size: (event.target as HTMLSelectElement).value } }).then(reload)
          },
        }, IMAGE_SIZE_TIERS.map(tier => createElement('option', { key: tier.label, value: tier.value }, tier.label))),
        createElement('select', {
          className: 'bre-config-select',
          value: view.defaults.quality,
          'aria-label': t('imagegenQualityLabel'),
          onChange: (event: ChangeEvent<HTMLSelectElement>) => {
            void saveImageConfig({ defaults: { quality: (event.target as HTMLSelectElement).value } }).then(reload)
          },
        }, ['low', 'medium', 'high', 'auto'].map(quality => createElement('option', { key: quality, value: quality }, quality))),
        createElement('select', {
          className: 'bre-config-select',
          value: String(view.defaults.n),
          'aria-label': t('imagegenCountLabel'),
          onChange: (event: ChangeEvent<HTMLSelectElement>) => {
            void saveImageConfig({ defaults: { n: Number((event.target as HTMLSelectElement).value) } }).then(reload)
          },
        }, [1, 2, 3, 4].map(count => createElement('option', { key: count, value: String(count) }, `n=${count}`))),
        // The timeout the failure copy already pointed at: the value lives in
        // `defaults.timeoutMs` (ms) and is picked here from five minute steps.
        createElement('label', { className: 'bre-config-timeout', title: t('imagegenTimeoutHint') },
          createElement('span', { className: 'bre-config-timeout-label' }, t('imagegenTimeoutLabel')),
          createElement('select', {
            className: 'bre-config-select',
            value: String(view.defaults.timeoutMs),
            'aria-label': t('imagegenTimeoutLabel'),
            onChange: (event: ChangeEvent<HTMLSelectElement>) => {
              commitTimeout((event.target as HTMLSelectElement).value)
            },
          }, timeoutOptions(view.defaults.timeoutMs).map(ms => createElement(
            'option',
            { key: ms, value: String(ms) },
            t('imagegenTimeoutMinutes', { minutes: Math.round(ms / 60_000) }),
          ))),
        ),
      ),
      // The default-model picker: its own row under the params, so the choice
      // is one menu instead of a radio buried among the per-row controls.
      !empty && createElement('div', { className: 'bre-config-default-row' },
        createElement('label', { className: 'bre-config-default-label' }, t('imagegenDefaultModelLabel')),
        createElement('select', {
          className: 'bre-config-select bre-config-default-select',
          value: view.defaultModel ?? '',
          'aria-label': t('imagegenDefaultModelLabel'),
          disabled: busyId === 'default',
          onChange: (event: ChangeEvent<HTMLSelectElement>) => setDefault((event.target as HTMLSelectElement).value),
        },
        view.defaultModel === null && createElement('option', { value: '', disabled: true }, t('imagegenDefaultModelNone')),
        models.map(model => createElement('option', { key: model.id, value: model.id }, modelOptionText(model)))),
      ),
    ),
  )
}

/** How the card frames each interruption class. */
const CODE_TAG: Record<string, 'continue' | 'useless' | 'depends'> = {
  EMPTY_RESPONSE: 'continue',
  RATE_LIMIT: 'continue',
  SERVER: 'continue',
  TIMEOUT: 'continue',
  TRANSPORT: 'continue',
  INVALID_REQUEST: 'useless',
  AUTH: 'useless',
  UNKNOWN_MODEL: 'useless',
  UNSUPPORTED_REASONING_EFFORT: 'useless',
  PI_AI_ERROR: 'depends',
  MALFORMED_RESPONSE: 'depends',
  LEGACY_CLI_OUTCOME_UNKNOWN: 'depends',
}

const TAG_KEY: Record<'continue' | 'useless' | 'depends', string> = {
  continue: 'autoContinueTagContinue',
  useless: 'autoContinueTagUseless',
  depends: 'autoContinueTagDepends',
}

interface TriggerSelectProps {
  t: (key: string, params?: Record<string, unknown>) => string
  policy: AutoContinuePolicy
  onFlag: (flag: 'maxTokens' | 'httpStatus', on: boolean) => void
  onToggle: (code: string, on: boolean) => void
  onBulk: (on: boolean) => void
  onRestore: () => void
}

/**
 * One control for everything that can make a turn worth continuing: the two
 * built-in triggers and the error codes sit in the same checklist, so the card
 * never shows a trigger half inside and half outside the picker. Closed, the
 * chosen ones read back as chips. Plain elements — the pane lives in the host
 * document and pulls in no UI library.
 */
function TriggerSelect(props: TriggerSelectProps): ReactNode {
  const { t, policy } = props
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement | null>(null)
  const buttonRef = useRef<HTMLButtonElement | null>(null)
  // The settings pane clips its own overflow, so the checklist is fixed to the
  // viewport and pinned to the button we measured on open.
  const [box, setBox] = useState<{ left: number; width: number; top?: number; bottom?: number } | null>(null)
  useEffect(() => {
    if (!open) return undefined
    const onDown = (event: globalThis.MouseEvent): void => {
      const root = rootRef.current
      if (root !== null && event.target instanceof Node && !root.contains(event.target)) setOpen(false)
    }
    const dismiss = (): void => setOpen(false)
    document.addEventListener('mousedown', onDown)
    window.addEventListener('resize', dismiss)
    window.addEventListener('scroll', dismiss, true)
    return () => {
      document.removeEventListener('mousedown', onDown)
      window.removeEventListener('resize', dismiss)
      window.removeEventListener('scroll', dismiss, true)
    }
  }, [open])
  const toggle = (): void => {
    if (open) {
      setOpen(false)
      return
    }
    const button = buttonRef.current
    if (button === null) {
      setOpen(true)
      return
    }
    const rect = button.getBoundingClientRect()
    const width = Math.min(Math.max(rect.width, 400), window.innerWidth - 24)
    const left = Math.min(Math.max(8, rect.right - width), window.innerWidth - width - 8)
    const below = window.innerHeight - rect.bottom - 12
    const tallest = 470
    setBox(below >= tallest
      ? { left, width, top: rect.bottom + 6 }
      : rect.top > tallest
        ? { left, width, bottom: window.innerHeight - rect.top + 6 }
        : { left, width, top: Math.max(8, window.innerHeight - 8 - 460) })
    setOpen(true)
  }
  const chosenCodes = KNOWN_ERROR_CODES.filter(code => policy.codes[code] === true)
  const chips: ReactNode[] = []
  if (policy.maxTokens) chips.push(createElement('span', { className: 'bre-config-chip', key: 'max-tokens' }, t('autoContinueMaxTokens')))
  if (policy.httpStatus) chips.push(createElement('span', { className: 'bre-config-chip', key: 'http' }, t('autoContinueChipHttp')))
  for (const code of chosenCodes) chips.push(createElement('span', { className: 'bre-config-chip', key: code }, code))
  const shown = chips.slice(0, 3)
  const hidden = chips.length - shown.length
  const row = (key: string, checked: boolean, name: ReactNode, why: string, tag: string, onChange: (on: boolean) => void): ReactNode =>
    createElement('label', { className: 'bre-config-code-row', key },
      createElement('input', {
        type: 'checkbox',
        className: 'bre-config-code-input',
        checked,
        onChange: (event: ChangeEvent<HTMLInputElement>) => onChange(event.target.checked),
      }),
      createElement('span', { className: `bre-config-check${checked ? ' bre-config-check-on' : ''}`, 'aria-hidden': true }),
      createElement('span', { className: 'bre-config-code-name' }, name),
      createElement('span', { className: 'bre-config-code-why', title: why }, why),
      createElement('span', { className: `bre-config-code-tag bre-config-code-tag-${tag}` }, t(TAG_KEY[tag as 'continue' | 'useless' | 'depends'])),
    )
  const group = (title: string, rows: ReactNode[]): ReactNode =>
    createElement('div', { className: 'bre-config-code-group', key: title },
      createElement('div', { className: 'bre-config-code-group-title' }, t(title)),
      rows,
    )
  return createElement('div', { className: 'bre-config-trigger-control', ref: rootRef },
    createElement('button', {
      type: 'button',
      className: 'bre-config-trigger-button',
      ref: buttonRef,
      'aria-expanded': open,
      'aria-label': t('autoContinueTriggers'),
      onClick: toggle,
    },
      shown,
      hidden > 0 && createElement('span', { className: 'bre-config-chip bre-config-chip-more' }, t('autoContinueCodesMore', { count: hidden })),
      chips.length === 0 && createElement('span', { className: 'bre-config-multiselect-empty' }, '—'),
      createElement('span', { className: 'bre-config-multiselect-caret', 'aria-hidden': true }, '▾'),
    ),
    open && createElement('div', {
      className: 'bre-config-multiselect-pop',
      role: 'group',
      'aria-label': t('autoContinueErrorTypes'),
      style: box === null
        ? undefined
        : {
          left: `${box.left}px`,
          width: `${box.width}px`,
          ...(box.top === undefined ? {} : { top: `${box.top}px` }),
          ...(box.bottom === undefined ? {} : { bottom: `${box.bottom}px` }),
        },
    },
      group('autoContinueGroupFlags', [
        row('flag:max-tokens', policy.maxTokens,
          t('autoContinueMaxTokens'),
          t('autoContinueWhyMaxTokens'), 'continue',
          on => props.onFlag('maxTokens', on)),
        row('flag:http', policy.httpStatus,
          t('autoContinueHttpStatus'),
          t('autoContinueWhyHttpStatus'), 'continue',
          on => props.onFlag('httpStatus', on)),
      ]),
      group('autoContinueGroupTransient', TRANSIENT_ERROR_CODES.map(code =>
        row(code, policy.codes[code] === true,
          createElement('code', { className: 'bre-config-code-name-inner' }, code),
          t(`autoContinueWhy${code}`), CODE_TAG[code] ?? 'depends',
          on => props.onToggle(code, on)))),
      group('autoContinueGroupOther', OTHER_ERROR_CODES.map(code =>
        row(code, policy.codes[code] === true,
          createElement('code', { className: 'bre-config-code-name-inner' }, code),
          t(`autoContinueWhy${code}`), CODE_TAG[code] ?? 'depends',
          on => props.onToggle(code, on)))),
      createElement('div', { className: 'bre-config-multiselect-foot' },
        createElement('button', { type: 'button', className: 'bre-config-link', onClick: () => props.onBulk(true) }, t('autoContinueCodesAll')),
        createElement('button', { type: 'button', className: 'bre-config-link', onClick: () => props.onBulk(false) }, t('autoContinueCodesNone')),
        createElement('button', { type: 'button', className: 'bre-config-link bre-config-link-quiet', onClick: props.onRestore }, t('autoContinueRestore')),
      ),
    ),
  )
}

/**
 * The 「自动继续」 card: one folded settings entry with a quiet summary.
 * The expanded card holds the timing controls and the trigger conditions.
 */
export function AutoContinueCard(props: { t: (key: string, params?: Record<string, unknown>) => string }): ReactNode {
  const { t } = props
  const enabled = useSyncExternalStore(subscribeAutoContinueEnabled, autoContinueEnabled)
  const config = useSyncExternalStore(subscribeAutoContinueConfig, autoContinueConfig)
  const [waitDraft, setWaitDraft] = useState(String(config.waitSeconds))
  const [retriesDraft, setRetriesDraft] = useState(String(config.maxRetries))
  useEffect(() => { setWaitDraft(String(config.waitSeconds)) }, [config.waitSeconds])
  useEffect(() => { setRetriesDraft(String(config.maxRetries)) }, [config.maxRetries])
  const saveWait = (): void => {
    setAutoContinueConfig({ waitSeconds: waitDraft.trim() === '' ? config.waitSeconds : Number(waitDraft) })
    setWaitDraft(String(autoContinueConfig().waitSeconds))
  }
  const saveRetries = (): void => {
    setAutoContinueConfig({ maxRetries: retriesDraft.trim() === '' ? config.maxRetries : Number(retriesDraft) })
    setRetriesDraft(String(autoContinueConfig().maxRetries))
  }
  const [open, setOpen] = useState(false)
  const bodyId = 'bre-config-auto-continue-body'
  const policy = config.policy
  const setPolicyFlags = (patch: Partial<Pick<AutoContinuePolicy, 'maxTokens' | 'httpStatus'>>): void => {
    setAutoContinueConfig({ policy: { ...policy, ...patch } })
  }
  const toggleCode = (code: string, on: boolean): void => {
    setAutoContinueConfig({ policy: { ...policy, codes: { ...policy.codes, [code]: on } } })
  }
  const setAllCodes = (on: boolean): void => {
    const codes: Record<string, boolean> = { ...policy.codes }
    for (const code of KNOWN_ERROR_CODES) codes[code] = on
    setAutoContinueConfig({ policy: { ...policy, codes } })
  }
  const restorePolicy = (): void => {
    setAutoContinueConfig({ policy: DEFAULT_AUTO_CONTINUE_POLICY })
  }
  return createElement('div', { className: 'bre-config-card bre-config-auto-card' },
    createElement('div', { className: 'bre-config-card-head' },
      createElement('button', {
        type: 'button',
        className: 'bre-config-expand',
        'aria-expanded': open,
        'aria-controls': bodyId,
        title: open ? t('autoContinueCollapse') : t('autoContinueExpand'),
        onClick: () => setOpen(current => !current),
      },
        createElement('span', { className: 'bre-config-card-title' }, t('autoContinueSectionTitle')),
        // The folded summary only: once the two controls are on screen they
        // say the same thing, and repeating it would be a third copy.
        !open && createElement('span', { className: 'bre-config-card-hint bre-config-auto-summary' },
          t('autoContinueHint', { seconds: config.waitSeconds, count: config.maxRetries })),
      ),
      createElement('span', { className: 'bre-config-card-state' }, enabled ? t('cardStateOn') : t('cardStateOff')),
      createElement('label', { className: 'bre-config-switch', title: t('autoContinueAria') },
        createElement('input', {
          type: 'checkbox',
          className: 'bre-config-switch-input',
          role: 'switch',
          'aria-label': t('autoContinueAria'),
          checked: enabled,
          onChange: (event: ChangeEvent<HTMLInputElement>) => {
            setAutoContinueEnabled((event.target as HTMLInputElement).checked)
          },
        }),
        createElement('span', { className: 'bre-config-switch-track', 'aria-hidden': true }),
      ),
      createElement('span', {
        className: 'bre-config-chevron',
        'aria-hidden': true,
        'data-open': String(open),
        onClick: () => setOpen(current => !current),
      }, '›'),
    ),
    open && createElement('div', { className: 'bre-config-card-body', id: bodyId },
      createElement('div', { className: 'bre-config-auto-fields' },
        createElement('label', { className: 'bre-config-auto-field' },
          createElement('span', { className: 'bre-config-auto-label' }, t('autoContinueWaitLabel')),
          createElement('span', { className: 'bre-config-auto-control' },
            createElement('input', {
              type: 'number',
              className: 'bre-config-auto-input',
              min: AUTO_CONTINUE_WAIT_MIN,
              max: AUTO_CONTINUE_WAIT_MAX,
              step: 1,
              value: waitDraft,
              'aria-label': `${t('autoContinueWaitLabel')} (${t('autoContinueSecondsUnit')})`,
              title: `${AUTO_CONTINUE_WAIT_MIN}–${AUTO_CONTINUE_WAIT_MAX} ${t('autoContinueSecondsUnit')}`,
              onChange: (event: ChangeEvent<HTMLInputElement>) => setWaitDraft(event.target.value),
              onBlur: saveWait,
              onKeyDown: (event) => { if (event.key === 'Enter') event.currentTarget.blur() },
            }),
            createElement('span', { className: 'bre-config-auto-unit', 'aria-hidden': true }, t('autoContinueSecondsUnit')),
          ),
        ),
        createElement('label', { className: 'bre-config-auto-field' },
          createElement('span', { className: 'bre-config-auto-label' }, t('autoContinueRetriesLabel')),
          createElement('span', { className: 'bre-config-auto-control' },
            createElement('input', {
              type: 'number',
              className: 'bre-config-auto-input',
              min: AUTO_CONTINUE_RETRIES_MIN,
              max: AUTO_CONTINUE_RETRIES_MAX,
              step: 1,
              value: retriesDraft,
              'aria-label': `${t('autoContinueRetriesLabel')} (${t('autoContinueRetriesUnit')})`,
              title: `${AUTO_CONTINUE_RETRIES_MIN}–${AUTO_CONTINUE_RETRIES_MAX} ${t('autoContinueRetriesUnit')}`,
              onChange: (event: ChangeEvent<HTMLInputElement>) => setRetriesDraft(event.target.value),
              onBlur: saveRetries,
              onKeyDown: (event) => { if (event.key === 'Enter') event.currentTarget.blur() },
            }),
            createElement('span', { className: 'bre-config-auto-unit', 'aria-hidden': true }, t('autoContinueRetriesUnit')),
          ),
        ),
      ),
      createElement('div', { className: 'bre-config-trigger-field' },
        createElement('span', { className: 'bre-config-auto-label' }, t('autoContinueTriggers')),
        createElement(TriggerSelect, {
          t,
          policy,
          onFlag: (flag, on) => setPolicyFlags({ [flag]: on } as Partial<Pick<AutoContinuePolicy, 'maxTokens' | 'httpStatus'>>),
          onToggle: toggleCode,
          onBulk: setAllCodes,
          onRestore: restorePolicy,
        }),
      ),
    ),
  )
}

/**
 * The 「失败详情」 card: the switch that decides whether a failed turn grows the
 * 「查看详情」 seat. Default ON — the seat only ever ADDS information, so the
 * off state is the exception, and the folded body says what it adds.
 */
export function ErrorDetailCard(props: { t: (key: string, params?: Record<string, unknown>) => string }): ReactNode {
  const { t } = props
  const enabled = useSyncExternalStore(subscribeErrorDetailEnabled, errorDetailEnabled)
  const [open, setOpen] = useState(false)
  const bodyId = 'bre-config-error-detail-body'
  return createElement('div', { className: 'bre-config-card' },
    createElement('div', { className: 'bre-config-card-head' },
      createElement('button', {
        type: 'button',
        className: 'bre-config-expand',
        'aria-expanded': open,
        'aria-controls': bodyId,
        title: open ? t('autoContinueCollapse') : t('autoContinueExpand'),
        onClick: () => setOpen(current => !current),
      },
        createElement('span', { className: 'bre-config-card-title' }, t('errorDetailSectionTitle')),
        // The folded summary only: the switch beside it already says on/off,
        // and the explanation belongs to the body once it is open.
        !open && createElement('span', { className: 'bre-config-card-hint' }, t('errorDetailSummary')),
      ),
      createElement('span', { className: 'bre-config-card-state' }, enabled ? t('cardStateOn') : t('cardStateOff')),
      createElement('label', { className: 'bre-config-switch', title: t('errorDetailAria') },
        createElement('input', {
          type: 'checkbox',
          className: 'bre-config-switch-input',
          role: 'switch',
          'aria-label': t('errorDetailAria'),
          checked: enabled,
          onChange: (event: ChangeEvent<HTMLInputElement>) => {
            setErrorDetailEnabled((event.target as HTMLInputElement).checked)
          },
        }),
        createElement('span', { className: 'bre-config-switch-track', 'aria-hidden': true }),
      ),
      createElement('span', {
        className: 'bre-config-chevron',
        'aria-hidden': true,
        'data-open': String(open),
        onClick: () => setOpen(current => !current),
      }, '›'),
    ),
    open && createElement('div', { className: 'bre-config-card-body', id: bodyId },
      createElement('p', { className: 'bre-config-card-hint bre-config-error-detail-copy' }, t('errorDetailHint')),
    ),
  )
}

/**
 * The floating pane. Exported for tests: render it inside a chosen container.
 */
export function ConfigPane(props: ConfigPaneProps): ReactNode {
  const { t, onClose } = props
  const paneRef = useRef<HTMLDivElement | null>(null)
  useEffect(() => {
    const onKey = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])
  return createElement('div', {
    className: 'bre-config-backdrop',
    // z-index 1010: the settings dialog's own opaque mask sits at 1000
    // (styles.ts) — anything lower would render underneath it.
    onMouseDown: (event: ReactMouseEvent<HTMLDivElement>) => { if (event.target === event.currentTarget) onClose() },
  },
  createElement('div', { className: 'bre-config-pane', ref: paneRef },
    createElement('div', { className: 'bre-config-head' },
      createElement('span', { className: 'bre-config-title' }, t('configPaneTitle')),
      createElement('button', {
        className: 'bre-config-close',
        type: 'button',
        'aria-label': t('configPaneClose'),
        onClick: onClose,
      }, '✕'),
    ),
    createElement('div', { className: 'bre-config-body' },
      createElement(EffortBoundary, { fallbackText: t('configPaneFailed') },
        createElement(ImageGenCard, { api: props.api, t: props.t }),
      ),
      createElement(EffortBoundary, { fallbackText: t('configPaneFailed') },
        createElement(AutoContinueCard, { t: props.t }),
      ),
      createElement(EffortBoundary, { fallbackText: t('configPaneFailed') },
        createElement(ErrorDetailCard, { t: props.t }),
      ),
    ),
  ),
  )
}

/** The pane's mount face: a disposer that closes and unmounts. */
export interface ConfigPaneMount {
  close(): void
}

/**
 * Mount the pane at body level (the same shape the other floating seats use).
 * @returns a disposer; the pane also disposes itself on Esc/backdrop/✕.
 */
export function mountConfigPane(deps: { api: RemoteApi; t: (key: string, params?: Record<string, unknown>) => string }): ConfigPaneMount {
  const host = document.createElement('div')
  host.className = 'bre-config-pane-host'
  document.body.appendChild(host)
  const root = createRoot(host)
  let live = true
  const close = (): void => {
    if (!live) return
    live = false
    unmountReact({ wrapper: host, root })
  }
  root.render(createElement(ConfigPane, {
    api: deps.api,
    t: deps.t,
    onClose: close,
  }))
  return { close }
}
