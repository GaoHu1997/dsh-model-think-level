/**
 * 指纹检测页签的面板：一家供应商的可检测模型清单、每行的状态徽章、逐行检测
 * 与一键全测。
 *
 * 三条硬约束（m00702）在这里落成三件事：
 *  1. **只认 GPT / Claude**：`isEligibleModel` 是唯一的闸，不在此列的模型连
 *     行都不出现 —— 不给一个必然点不动的灰按钮。一个都没有就整页不显示。
 *  2. **后台跑、不留进度**：没有浮层、没有 toast、没有遮罩、没有进度条。进
 *     度只落在行徽章的 `检测中 · 2/3` 上；任务活在 `fingerprint-runner` 里，
 *     这个组件只是订阅者，卸载时不中止任何东西。
 *  3. **不进新增供应商卡片**：`isCreateProviderCard` 为真就整个渲染 null。
 *
 * 还有一条来自 m00883：指纹检测不与思考强度混在一行 —— 它有自己的页签、
 * 自己的行、自己的结果卡，`.bre-model-grid` 一列都不动。
 *
 * @module dsh-model-think-level/client/FingerprintPane
 */

import { createElement, useCallback, useEffect, useMemo, useState, useSyncExternalStore, type ReactNode } from 'react'
import type { Translate } from '@deepseek-ai/dsh-client-ui-slots'
import { isEligibleModel } from '../fingerprint/eligibility.js'
import { FULL_RUN_QUERIES, type FingerprintRecord } from '../fingerprint/verdict.js'
import { modelsOf } from '../shared.js'
import { describeNamespace } from './ops.js'
import { isCreateProviderCard } from './injection/editor-tabs.js'
import {
  fingerprintRunner,
  readFingerprints,
  type FingerprintRunnerState,
} from './fingerprint-runner.js'
import type { ClientContext, RemoteApi } from './types.js'

export interface FingerprintPaneProps {
  /** 供应商的设置键。 */
  route: string
  /** 设置 Remote（外加可选的 scope 镜像）。 */
  api: RemoteApi
  /** 插件自己的翻译函数。 */
  t: Translate
  /** 客户端根上下文；用于订阅设置文档变化。可选，缺了就只在挂载时读一次。 */
  ctx?: ClientContext
  /** 挂载点：判定是不是新增供应商卡片用。 */
  host: { readonly current: HTMLElement | null }
}

/** 一行要显示的东西。 */
interface Row {
  model: string
}

const EMPTY_STATE: FingerprintRunnerState = { running: new Map(), queued: [] }

function percent(value: number | undefined): string {
  if (typeof value !== 'number' || !Number.isFinite(value)) return '—'
  return `${Math.round(value * 100)}%`
}

function clock(ms: number): string {
  if (!Number.isFinite(ms) || ms <= 0) return '—'
  return new Date(ms).toLocaleString()
}

/** 一家供应商的指纹检测面板。 */
export function FingerprintPane({ route, api, t, ctx, host }: FingerprintPaneProps): ReactNode {
  // 新增供应商卡片整个不出现（m00883）。判定放在这里而不是只放在页签可用性
  // 里：不渲染 = 不发那次 settings 读 = 草稿卡片连一次多余请求都不产生。
  const [create] = useState(() => isCreateProviderCard(host.current))

  const [rows, setRows] = useState<readonly Row[]>([])
  const [records, setRecords] = useState<ReadonlyMap<string, FingerprintRecord>>(new Map())
  const [loadError, setLoadError] = useState<string | undefined>(undefined)

  const runner = useMemo(() => (create ? undefined : fingerprintRunner(route)), [create, route])
  const runnerState = useSyncExternalStore(
    useCallback((listener: () => void) => (runner?.subscribe(listener) ?? (() => {})), [runner]),
    useCallback(() => runner?.getState() ?? EMPTY_STATE, [runner]),
    useCallback(() => EMPTY_STATE, []),
  )

  // 结论落盘就并进来。订阅挂在 runner 上而不是自己再拉一次：runner 是唯一
  // 知道"刚才那次跑完了吗"的人，多拉一次会读到还没写的中间态。
  useEffect(() => {
    if (runner === undefined) return
    return runner.onRecord((record) => {
      setRecords((current) => {
        const next = new Map(current)
        next.set(record.model, record)
        return next
      })
    })
  }, [runner])

  // 模型清单：供应商存了什么就显示什么，滤完只剩 GPT / Claude。
  const reload = useCallback(async (): Promise<void> => {
    if (create) return
    const join = await describeNamespace(api)
    const providers = (join.namespace?.value as { providers?: unknown } | undefined)?.providers
    const ids = modelsOf(providers, route)
      .map((model) => model['id'])
      .filter((id): id is string => typeof id === 'string' && id.length > 0)
      .filter(isEligibleModel)
    setRows(ids.map((model) => ({ model })))
    const stored = await readFingerprints(route)
    if (stored.ok) {
      setLoadError(undefined)
      setRecords(new Map(stored.data.records.map((record) => [record.model, record])))
    } else {
      setLoadError(stored.error)
    }
  }, [api, create, route])

  useEffect(() => {
    if (create) return
    void reload()
  }, [create, reload])

  // 设置文档变了（用户存了卡片、加了模型）就重读清单。挂不到 ctx 上时只在
  // 挂载时读一次 —— 少一个订阅不是错误，是少一次刷新。
  useEffect(() => {
    if (create || ctx === undefined) return
    return ctx.remote.$on('settings/document-updated', () => {
      void reload()
    })
  }, [create, ctx, reload])

  if (create) return null

  const eligible = rows.length
  const detected = rows.filter((row) => records.has(row.model)).length
  const identified = rows.filter((row) => records.get(row.model)?.status === 'identified').length
  const doubtful = rows.filter((row) => records.get(row.model)?.status === 'doubtful').length
  const failed = rows.filter((row) => records.get(row.model)?.status === 'failed').length
  const busy = runnerState.running.size > 0
  const pending = runnerState.running.size + runnerState.queued.length

  return createElement(
    'div',
    {
      className: 'bre-fingerprint',
      // 页签可用性就看这一位：`ready` = 有可检测模型，`none` = 一个都没有。
      'data-bre-fingerprint': eligible > 0 ? 'ready' : 'none',
    },
    createElement(
      'div',
      { className: 'bre-fp-head' },
      createElement('span', { className: 'bre-fp-title' }, t('fpTitle')),
      createElement('span', { className: 'bre-fp-count' }, t('fpCount', { count: eligible })),
      createElement(
        'span',
        { className: 'bre-fp-summary', role: 'status', 'aria-live': 'polite' },
        busy
          ? t('fpRunning', { done: runnerState.running.size, total: pending })
          : detected === 0
            ? t('fpSummaryNone')
            : t('fpSummary', { identified, doubtful, failed }),
      ),
      createElement('span', { className: 'grow' }),
      createElement(
        'button',
        {
          type: 'button',
          className: 'bre-fp-all',
          // 批量期间只置灰：不换文案、不换颜色。一个强调色只表达状态，而
          // "正在跑"这件事已经在徽章和状态行上说了两遍了。
          disabled: busy || eligible === 0,
          onClick: (): void => {
            runner?.checkAll(rows.map((row) => row.model))
          },
        },
        t('fpDetectAll'),
      ),
    ),
    createElement('p', { className: 'bre-fp-intro' }, t('fpIntro')),
    loadError !== undefined
      ? createElement('p', { className: 'bre-fp-error' }, t('fpLoadFailed', { error: loadError }))
      : null,
    createElement(
      'div',
      { className: 'bre-fp-rows' },
      ...rows.map((row) => renderRow(row, { t, runner, runnerState, records, route })),
    ),
  )
}

interface RowDeps {
  t: Translate
  runner: ReturnType<typeof fingerprintRunner> | undefined
  runnerState: FingerprintRunnerState
  records: ReadonlyMap<string, FingerprintRecord>
  route: string
}

function renderRow(row: Row, deps: RowDeps): ReactNode {
  const { t, runner, runnerState, records } = deps
  const record = records.get(row.model)
  const done = runnerState.running.get(row.model)
  const position = runnerState.queued.indexOf(row.model)
  const running = done !== undefined
  const queued = position >= 0

  const badge = running
    ? { className: 'is-running', text: t('fpStateRunning', { done, total: FULL_RUN_QUERIES }) }
    : queued
      ? { className: 'is-queued', text: t('fpQueued', { position: position + 1 }) }
      : record === undefined
        ? { className: 'is-idle', text: t('fpStateUnchecked') }
        : record.status === 'failed'
          ? { className: 'is-failed', text: t('fpStateFailed') }
          : record.status === 'doubtful'
            ? {
                className: 'is-doubtful',
                text: t('fpStateDoubtful', { probability: percent(record.probability) }),
              }
            : {
                className: 'is-identified',
                text: t('fpStateIdentified', {
                  model: record.predictionName ?? record.prediction ?? row.model,
                  probability: percent(record.probability),
                }),
              }

  const action = record === undefined ? 'fpDetect' : record.status === 'failed' ? 'fpRetry' : 'fpRetest'

  return createElement(
    'div',
    { className: 'bre-fp-row', key: row.model },
    createElement(
      'div',
      { className: 'bre-fp-row-head' },
      createElement('span', { className: 'bre-fp-model' }, row.model),
      createElement('span', { className: `bre-fp-badge ${badge.className}` }, badge.text),
      createElement('span', { className: 'grow' }),
      createElement(
        'span',
        { className: 'bre-fp-evidence' },
        record === undefined
          ? t('fpCost', { count: FULL_RUN_QUERIES, seconds: 15 })
          : t('fpEvidence', {
              used: record.usedOutputs,
              total: FULL_RUN_QUERIES,
              similarity: percent(record.top?.[0]?.similarity),
            }),
      ),
      createElement(
        'button',
        {
          type: 'button',
          className: 'bre-fp-action',
          disabled: running || queued,
          onClick: (): void => {
            runner?.check(row.model)
          },
        },
        t(action),
      ),
    ),
    record !== undefined && record.status !== 'failed'
      ? renderResult(record, t)
      : record !== undefined && record.error !== undefined
        ? createElement('div', { className: 'bre-fp-body' }, createElement('p', { className: 'bre-fp-error' }, record.error))
        : null,
  )
}

/** 结果卡：家族占比、前三候选、闭集告警。 */
function renderResult(record: FingerprintRecord, t: Translate): ReactNode {
  const top = record.top ?? []
  return createElement(
    'div',
    { className: 'bre-fp-body' },
    createElement(
      'div',
      { className: 'bre-fp-family' },
      createElement('span', { className: 'bre-fp-k' }, t('fpFamily')),
      createElement(
        'span',
        { className: 'bre-fp-v' },
        `${record.familyPrediction ?? '—'} · ${percent(record.familyProbability)}`,
      ),
      createElement('span', { className: 'grow' }),
      createElement('span', { className: 'bre-fp-k' }, t('fpCheckedAt', { time: clock(record.checkedAt) })),
    ),
    createElement('div', { className: 'bre-fp-k', style: { marginTop: '8px' } }, t('fpCandidates')),
    createElement(
      'div',
      { className: 'bre-fp-bars' },
      ...top.map((entry, index) =>
        createElement(
          'div',
          { className: 'bre-fp-bar', key: entry.model },
          createElement('span', { className: 'bre-fp-bar-name' }, entry.model),
          createElement(
            'span',
            { className: `bre-fp-bar-fill${index === 0 ? ' is-top' : ''}`, style: { width: `${Math.max(2, Math.round(entry.probability * 100))}%` } },
          ),
          createElement('span', { className: 'bre-fp-bar-value' }, percent(entry.probability)),
        ),
      ),
    ),
    createElement('p', { className: 'bre-fp-note' }, t('fpClosedSet')),
  )
}
