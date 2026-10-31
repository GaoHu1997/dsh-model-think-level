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
import { MAX_CONSECUTIVE } from './auto-continue-rules.js'
import {
  autoContinueEnabled,
  setAutoContinueEnabled,
  subscribeAutoContinueEnabled,
} from './auto-continue-pref.js'
import { EffortBoundary, mountReact, unmountReact } from './injection/mount.js'
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
    // One line while folded: caret + name, the state word, and the switch. The
    // switch is a sibling of the expand button, so flipping it never toggles.
    createElement('div', { className: 'bre-config-card-head' },
      createElement('button', {
        type: 'button',
        className: 'bre-config-expand',
        'aria-expanded': open,
        'aria-controls': bodyId,
        title: open ? t('imagegenCollapse') : t('imagegenExpand'),
        onClick: () => setOpen(current => !current),
      },
        createElement('span', { className: 'bre-config-caret', 'aria-hidden': true }, open ? '▾' : '▸'),
        createElement('span', { className: 'bre-config-card-title' }, t('imagegenSectionTitle')),
      ),
      createElement('span', { className: 'bre-config-card-state' }, view.enabled ? t('imagegenEnabled') : t('imagegenDisabled')),
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
    ),
    // A save failure must stay visible while the card is folded: the switch is
    // on the head line, so its error cannot live in the body.
    notice !== undefined && createElement('div', { className: 'bre-config-notice' }, notice),
    createElement('div', { className: 'bre-config-card-hint' },
      view.enabled ? t('imagegenEnabledHint') : t('imagegenDisabledHint')),
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

/**
 * The 「自动继续」 card: one folded settings entry — the switch sits on the
 * head line (flipping it never unfolds the card). The one-line streak cap
 * stays under the head, so the folded card keeps the same height as the
 * 「生图」 card; the full what-triggers description folds into the body.
 */
export function AutoContinueCard(props: { t: (key: string, params?: Record<string, unknown>) => string }): ReactNode {
  const { t } = props
  const enabled = useSyncExternalStore(subscribeAutoContinueEnabled, autoContinueEnabled)
  const [open, setOpen] = useState(false)
  const bodyId = 'bre-config-auto-continue-body'
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
        createElement('span', { className: 'bre-config-caret', 'aria-hidden': true }, open ? '▾' : '▸'),
        createElement('span', { className: 'bre-config-card-title' }, t('autoContinueSectionTitle')),
      ),
      createElement('span', { className: 'bre-config-card-state' }, enabled ? t('settingOn') : t('settingOff')),
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
    ),
    createElement('div', { className: 'bre-config-card-hint' },
      t('autoContinueHint', { count: MAX_CONSECUTIVE })),
    open && createElement('div', { className: 'bre-config-card-body', id: bodyId },
      createElement('div', { className: 'bre-config-card-hint' }, t('autoContinueDescription')),
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
