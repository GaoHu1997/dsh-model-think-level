/**
 * The plugin's config pane: a floating panel ABOVE the settings dialog
 * (z-index 1010 — the dialog's own opaque mask sits at 1000), opened from the
 * Models-page title-row button.
 *
 * One card today, 「生图」, per the design's card-list shape with room for
 * more: the derived image-model list (radio = default model, per-row endpoint
 * badge + params + test), the empty state with one-click marking of suspected
 * image models (written through the SAME settings channel the Models page
 * editor uses — never a raw file edit), and the MCP enable switch whose state
 * is DERIVED from the cordis.patch.yml marker block the host reports.
 *
 * Esc / backdrop / ✕ close it; the wrapper unmounts and the page keeps
 * whatever the pane saved.
 *
 * @module dsh-model-think-level/client/ConfigPane
 */

import { createElement, useCallback, useEffect, useRef, useState } from 'react'
import type { ChangeEvent, MouseEvent as ReactMouseEvent } from 'react'
import { createRoot } from 'react-dom/client'
import type { ReactNode } from 'react'
import { inferImageGenFromName } from '../knowledge.js'
import { canonicalSize, IMAGE_SIZE_TIERS } from '../image/sizes.js'
import { EffortBoundary, mountReact, unmountReact } from './injection/mount.js'
import {
  cachedImageConfigView,
  generateImageDirect,
  imageMcpAction,
  pollMcpStatus,
  readImageConfigView,
  saveImageConfig,
  testImageEndpoint,
  type ImageConfigView,
  type ImageMcpView,
} from './image-config-client.js'
import { describeNamespace, imageGenOf, providersOf, writeModelRows } from './ops.js'
import type { RemoteApi } from './types.js'

/** The pane's deps: the settings write/read face and the plugin translator. */
export interface ConfigPaneProps {
  readonly api: RemoteApi
  readonly t: (key: string, params?: Record<string, unknown>) => string
  readonly onClose: () => void
}

/** One suspected image model, for the empty state's one-click marking. */
interface SuspectModel {
  readonly route: string
  readonly modelId: string
  readonly label: string
}

/** The names one endpoint status badge shows. */
function endpointBadge(t: (key: string) => string, status: string): { className: string; text: string } {
  if (status === 'ok') return { className: 'bre-config-badge bre-config-badge-ok', text: t('imagegenEndpointOk') }
  if (status === 'unsupported') return { className: 'bre-config-badge bre-config-badge-bad', text: t('imagegenEndpointUnsupported') }
  return { className: 'bre-config-badge bre-config-badge-unknown', text: t('imagegenEndpointUnverified') }
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
  const [suspects, setSuspects] = useState<readonly SuspectModel[] | undefined>(undefined)
  const [mcpBusy, setMcpBusy] = useState(false)

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
  // row as `providerLabel`; this keeps the list readable even when the running
  // host or a stored image.json predates that field.
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
      // Unreadable settings only cost the pretty provider name; rows fall back
      // to `providerLabel` and then the route.
    })
    return () => { alive = false }
  }, [api])

  /** Refresh after any write; a failed re-read keeps the last view visible. */
  const reload = useCallback((): void => {
    void readImageConfigView().then(answer => {
      if (answer.ok) setView(answer.data)
    })
  }, [])

  /** The suspected image models the empty state offers to mark. */
  const loadSuspects = useCallback((): void => {
    void describeNamespace(api).then(join => {
      const namespace = join.namespace
      const providers = providersOf(namespace)
      const found: SuspectModel[] = []
      for (const [route, profile] of Object.entries(providers)) {
        const models = Array.isArray(profile['models']) ? profile['models'].filter(entry => typeof entry === 'object' && entry !== null) : []
        for (const row of models as Record<string, unknown>[]) {
          const id = typeof row['id'] === 'string' ? row['id'] : ''
          if (id.length === 0 || imageGenOf(models as Record<string, unknown>[], id)) continue
          if (!inferImageGenFromName(id)) continue
          const label = typeof row['name'] === 'string' && row['name'].trim().length > 0 ? row['name'].trim() : id
          found.push({ route, modelId: id, label })
        }
      }
      setSuspects(found)
    })
  }, [api])

  /** One-click marking: through writeModelRows, the Models page's own channel. */
  const markSuspects = useCallback((): void => {
    const candidates = suspects ?? []
    if (candidates.length === 0) return
    setBusyId('mark')
    const byRoute = new Map<string, SuspectModel[]>()
    for (const suspect of candidates) {
      const list = byRoute.get(suspect.route) ?? []
      list.push(suspect)
      byRoute.set(suspect.route, list)
    }
    void Promise.all([...byRoute.entries()].map(([route, list]) =>
      writeModelRows(api, route, list.map(suspect => ({ modelId: suspect.modelId, efforts: 'keep', imageGen: true }))),
    )).then(results => {
      setBusyId(undefined)
      const ok = results.every(perRoute => perRoute.every(row => row.ok))
      setNotice(ok ? t('imagegenMarked', { count: candidates.length }) : t('writeError', { message: t('imagegenMarkFailed') }))
      // The derive-then-save cycle turns the fresh markers into list rows.
      loadSuspects()
      reload()
    })
  }, [api, suspects, t, loadSuspects, reload])

  /** The default-model radio: one save, then the row renders from the answer. */
  const setDefault = useCallback((id: string): void => {
    setBusyId(id)
    void saveImageConfig({ defaultModel: id }).then(answer => {
      setBusyId(undefined)
      if (answer.ok) { setNotice(undefined); reload() } else setNotice(answer.error)
    })
  }, [reload])

  /** Per-row param override. */
  const setRowParam = useCallback((id: string, field: 'size' | 'quality' | 'n', value: string): void => {
    const numeric = field === 'n' ? Number(value) : undefined
    void saveImageConfig({
      models: [{ id, ...(field === 'size' ? { size: value } : field === 'quality' ? { quality: value } : { n: numeric }) }],
    }).then(answer => {
      if (answer.ok) reload()
      else setNotice(answer.error)
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

  /** The endpoint test: one real request, then the badge re-renders. */
  const testEndpoint = useCallback((id: string): void => {
    setBusyId(id)
    void testImageEndpoint(id).then(answer => {
      setBusyId(undefined)
      if (answer.ok) { setNotice(undefined); reload() } else setNotice(answer.error)
    })
  }, [reload])

  /** MCP switch: install / uninstall, then confirm the hot reload landed.
   * HMR is asynchronous — the first read after the action may still show the
   * old state, so the pane says "submitted, reloading" and POLLS the derived
   * status; a run that exhausts the poll gets the conservative restart hint
   * (the design's 需重启 DSH state, without pretending we can detect HMR). */
  const toggleMcp = useCallback((next: boolean): void => {
    setMcpBusy(true)
    void imageMcpAction(next ? 'install' : 'uninstall').then(answer => {
      setMcpBusy(false)
      if (!answer.ok) {
        setNotice(answer.error)
        return
      }
      setNotice(t('mcpHotReload'))
      void pollMcpStatus(next).then(confirmed => {
        reload()
        setNotice(confirmed ? undefined : t('mcpRestartHint'))
      })
    })
  }, [reload, t])

  const runSelfcheck = useCallback((): void => {
    setMcpBusy(true)
    void imageMcpAction('selfcheck').then(answer => {
      setMcpBusy(false)
      if (answer.ok) reload()
      else setNotice(answer.error)
    })
  }, [reload])

  /** The generate-once probe the pane offers per row (辅通道 demo). */
  const generateProbe = useCallback((id: string): void => {
    setBusyId(id)
    void generateImageDirect({ model: id, prompt: 'a red apple on a white table' }).then(answer => {
      setBusyId(undefined)
      if (answer.ok) setNotice(t('imagegenProbeDone', { path: answer.data.filePath }))
      else setNotice(answer.error)
    })
  }, [t])

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

  const tNoParams = t as (key: string) => string
  const models = view.models
  const empty = models.length === 0
  return createElement('div', { className: 'bre-config-card' },
    createElement('div', { className: 'bre-config-card-head' },
      createElement('span', { className: 'bre-config-card-title' }, t('imagegenSectionTitle')),
      createElement('span', { className: 'bre-config-card-sub' }, t('imagegenSectionSub')),
      createElement('span', { className: 'bre-config-badge' }, t('imagegenModelCount', { count: models.length })),
    ),
    notice !== undefined && createElement('div', { className: 'bre-config-notice' }, notice),
    createElement('div', { className: 'bre-config-defaults' },
      createElement('label', null, t('imagegenDefaultsLabel')),
      createElement('select', {
        className: 'bre-config-select',
        value: canonicalSize(view.defaults.size),
        onChange: (event: ChangeEvent<HTMLSelectElement>) => {
          void saveImageConfig({ defaults: { size: (event.target as HTMLSelectElement).value } }).then(reload)
        },
      }, IMAGE_SIZE_TIERS.map(tier => createElement('option', { key: tier.label, value: tier.value }, tier.label))),
      createElement('select', {
        className: 'bre-config-select',
        value: view.defaults.quality,
        onChange: (event: ChangeEvent<HTMLSelectElement>) => {
          void saveImageConfig({ defaults: { quality: (event.target as HTMLSelectElement).value } }).then(reload)
        },
      }, ['low', 'medium', 'high', 'auto'].map(quality => createElement('option', { key: quality, value: quality }, quality))),
      createElement('select', {
        className: 'bre-config-select',
        value: String(view.defaults.n),
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
    empty
      ? createElement('div', { className: 'bre-config-empty' },
        createElement('div', { className: 'bre-config-empty-text' }, t('imagegenEmptyText')),
        createElement('div', { className: 'bre-config-empty-hint' }, t('imagegenEmptyHint')),
        suspects === undefined
          ? createElement('button', { className: 'bre-config-btn-ghost', type: 'button', onClick: loadSuspects }, t('imagegenFindSuspects'))
          : suspects.length === 0
            ? createElement('div', { className: 'bre-config-empty-hint' }, t('imagegenNoSuspects'))
            : createElement('div', { className: 'bre-config-suspects' },
              suspects.map(suspect => createElement('div', { key: `${suspect.route}/${suspect.modelId}`, className: 'bre-config-suspect' },
                `${suspect.route} · ${suspect.label}`)),
              createElement('button', {
                className: 'bre-config-btn-primary',
                type: 'button',
                disabled: busyId === 'mark',
                onClick: markSuspects,
              }, t('imagegenMarkSuspects', { count: suspects.length })),
              createElement('button', { className: 'bre-config-btn-ghost', type: 'button', onClick: () => setSuspects(undefined) }, t('cancel')),
            ),
      )
      : createElement('div', { className: 'bre-config-rows' },
        models.map(model => {
          const isDefault = view.defaultModel === model.id
          const badge = endpointBadge(tNoParams, model.endpoint.status)
          return createElement('div', { key: model.id, className: 'bre-config-row' },
            createElement('input', {
              type: 'radio',
              name: 'bre-config-default-model',
              className: 'bre-config-radio',
              checked: isDefault,
              disabled: busyId === model.id,
              onChange: () => setDefault(model.id),
              title: t('imagegenSetDefault'),
              'aria-label': t('imagegenSetDefault'),
            }),
            createElement('div', { className: 'bre-config-name' },
              // Row head: the model's display name only — the provider, the
              // route and the key reference move out of the title.
              createElement('div', { className: 'bre-config-name-main' },
                model.label,
                isDefault && createElement('span', { className: 'bre-config-badge bre-config-badge-default' }, t('imagegenDefaultBadge')),
              ),
              // Second line (small, muted): the provider's display name, when
              // the route profile has one; the endpoint verdict rides along.
              createElement('div', { className: 'bre-config-name-sub' },
                routeNames[model.route] ?? model.providerLabel ?? model.route,
                createElement('span', { className: badge.className, title: t('imagegenEndpointBadgeHint') }, badge.text),
              ),
            ),
            model.api !== 'images'
              ? createElement('span', { className: 'bre-config-badge bre-config-badge-bad' }, t('imagegenNoEndpoint'))
              : createElement('div', { className: 'bre-config-row-controls' },
                createElement('select', {
                  className: 'bre-config-select',
                  value: canonicalSize(model.size ?? view.defaults.size),
                  onChange: (event: ChangeEvent<HTMLSelectElement>) => setRowParam(model.id, 'size', (event.target as HTMLSelectElement).value),
                  'aria-label': t('imagegenSizeLabel'),
                }, IMAGE_SIZE_TIERS.map(tier =>
                  createElement('option', { key: tier.label, value: tier.value }, tier.label))),
                createElement('select', {
                  className: 'bre-config-select',
                  value: model.quality ?? view.defaults.quality,
                  onChange: (event: ChangeEvent<HTMLSelectElement>) => setRowParam(model.id, 'quality', (event.target as HTMLSelectElement).value),
                  'aria-label': t('imagegenQualityLabel'),
                }, [...new Set([...model.params.qualities, view.defaults.quality])].map(quality =>
                  createElement('option', { key: quality, value: quality }, quality))),
                createElement('select', {
                  className: 'bre-config-select',
                  value: String(model.n ?? view.defaults.n),
                  onChange: (event: ChangeEvent<HTMLSelectElement>) => setRowParam(model.id, 'n', (event.target as HTMLSelectElement).value),
                  'aria-label': t('imagegenCountLabel'),
                }, [1, 2, 3, 4].map(count => createElement('option', { key: count, value: String(count) }, `n=${count}`))),
                createElement('button', {
                  className: 'bre-config-btn-ghost',
                  type: 'button',
                  disabled: busyId === model.id,
                  onClick: () => testEndpoint(model.id),
                }, t('imagegenTestEndpoint')),
                createElement('button', {
                  className: 'bre-config-btn-ghost',
                  type: 'button',
                  disabled: busyId === model.id,
                  onClick: () => generateProbe(model.id),
                }, t('imagegenProbe')),
              ),
          )
        }),
      ),
    createElement('div', { className: 'bre-config-mcp' },
      createElement('div', { className: 'bre-config-mcp-head' },
        createElement('span', null, t('mcpEnable')),
        createElement('button', {
          className: `bre-config-switch${view.mcp.installed ? ' on' : ''}`,
          type: 'button',
          role: 'switch',
          'aria-checked': view.mcp.installed,
          disabled: mcpBusy,
          onClick: () => toggleMcp(!view.mcp.installed),
        }, createElement('span', { className: 'bre-config-switch-knob' })),
      ),
      createElement('div', { className: 'bre-config-mcp-status' },
        view.mcp.installed
          ? `${t('mcpInstalled')} · ${view.mcp.toolName}`
          : t('mcpNotInstalled'),
      ),
      view.mcp.installed && view.mcp.diagnostics.lastCheckAt !== null && createElement('div', { className: 'bre-config-mcp-status' },
        view.mcp.diagnostics.ok
          ? t('mcpCheckOk')
          : `${t('mcpCheckFailed')}: ${view.mcp.diagnostics.error ?? '?'}`,
      ),
      view.mcp.installed && view.mcp.malformed === true && createElement('div', { className: 'bre-config-mcp-status' },
        t('mcpMalformed'),
      ),
      createElement('div', { className: 'bre-config-mcp-actions' },
        createElement('button', { className: 'bre-config-btn-ghost', type: 'button', disabled: mcpBusy, onClick: () => toggleMcp(true) }, t('mcpReinstall')),
        createElement('button', { className: 'bre-config-btn-ghost', type: 'button', disabled: mcpBusy, onClick: runSelfcheck }, t('mcpTestTool')),
      ),
      createElement('div', { className: 'bre-config-mcp-hint' }, t('mcpHint')),
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
    ),
    createElement('div', { className: 'bre-config-foot' }, t('configPaneFoot')),
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
