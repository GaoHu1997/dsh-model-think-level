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
import { estimateRun, type RunEstimate } from '../fingerprint/estimate.js'
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

/** 毫秒 → 一位小数的秒；没有就给占位符。 */
function seconds(ms: number | undefined): string {
  if (typeof ms !== 'number' || !Number.isFinite(ms) || ms < 0) return '—'
  return (Math.round(ms / 100) / 10).toFixed(1)
}

/**
 * 未检测行的成本提示：题数 + 这家供应商测过之后的大致耗时。
 *
 * 没有历史就只说题数（`fpCostUnknown`）—— 没测过却报一个秒数，是在替上游
 * 打包票，而这次可能正是排队高峰。
 */
function cost(t: Translate, estimate: RunEstimate | undefined): string {
  if (estimate === undefined) return t('fpCostUnknown', { count: FULL_RUN_QUERIES })
  if (estimate.unit === 'minutes') return t('fpCostMinutes', { count: FULL_RUN_QUERIES, minutes: estimate.value })
  return t('fpCost', { count: FULL_RUN_QUERIES, seconds: estimate.value })
}

/** 一家供应商的指纹检测面板。 */
export function FingerprintPane({ route, api, t, ctx, host }: FingerprintPaneProps): ReactNode {
  // 新增供应商卡片整个不出现（m00883）。判定放在这里而不是只放在页签可用性
  // 里：不渲染 = 不发那次 settings 读 = 草稿卡片连一次多余请求都不产生。
  const [create] = useState(() => isCreateProviderCard(host.current))

  const [rows, setRows] = useState<readonly Row[]>([])
  const [records, setRecords] = useState<ReadonlyMap<string, FingerprintRecord>>(new Map())
  const [loadError, setLoadError] = useState<string | undefined>(undefined)
  /** 运输层失败：没有记录可看，只能把原因说出来。 */
  const [runError, setRunError] = useState<{ model: string; error: string } | undefined>(undefined)
  /**
   * 每行结果卡的展开状态（用户需求 2：检测结果需要可以折叠；m00003：相似度
   * 移进展开内容，且默认不展开）。默认全部收起 —— 行头一行就够回答「测出来
   * 了吗」，相似度等明细住在展开的结果卡里；逐行展开是显式动作。收起的只是
   * 结果卡：行头的徽章、证据行与检测按钮始终在场。
   */
  const [expanded, setExpanded] = useState<ReadonlySet<string>>(new Set())
  const toggleRow = useCallback((model: string): void => {
    setExpanded((current) => {
      const next = new Set(current)
      if (next.has(model)) next.delete(model)
      else next.add(model)
      return next
    })
  }, [])

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
      setRunError(undefined)
      setRecords((current) => {
        const next = new Map(current)
        next.set(record.model, record)
        return next
      })
    })
  }, [runner])

  // 500 / 断网 / 流半路断掉：这次没有结论。把原因留在页面上，直到下一次成功
  // 或下一次点击；否则按钮转一圈复位，用户无法区分"没跑"和"没测出来"。
  useEffect(() => {
    if (runner === undefined) return
    return runner.onFailure((model, error) => {
      setRunError({ model, error })
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
  /** 未检测行的「约 X 秒」：按这家供应商已测出的耗时估，没测过就不报秒数。 */
  const estimate = useMemo(() => estimateRun([...records.values()]), [records])

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
    runError !== undefined
      ? createElement(
          'p',
          { className: 'bre-fp-error', role: 'alert' },
          t('fpRunFailed', { error: `${runError.model}: ${runError.error}` }),
        )
      : null,
    createElement(
      'div',
      { className: 'bre-fp-rows' },
      ...rows.map((row) => renderRow(row, { t, runner, runnerState, records, route, expanded, estimate, onToggle: toggleRow })),
    ),
  )
}

interface RowDeps {
  t: Translate
  runner: ReturnType<typeof fingerprintRunner> | undefined
  runnerState: FingerprintRunnerState
  records: ReadonlyMap<string, FingerprintRecord>
  route: string
  /** The models whose result card is unfolded. */
  expanded: ReadonlySet<string>
  /** 这家供应商已测出的大致耗时，提示未检测行要等多久。 */
  estimate: RunEstimate | undefined
  /** Fold or unfold one model's result card. */
  onToggle: (model: string) => void
}

/** The disclosure chevron of a result card, on the row head's 12px grid. */
function chevron(open: boolean): ReactNode {
  return createElement(
    'svg',
    {
      className: 'bre-fp-chev' + (open ? ' is-open' : ''),
      viewBox: '0 0 16 16',
      width: 12,
      height: 12,
      fill: 'none',
      stroke: 'currentColor',
      strokeWidth: 1.5,
      strokeLinecap: 'round',
      strokeLinejoin: 'round',
      'aria-hidden': true,
      focusable: false,
    },
    createElement('path', { d: open ? 'M4.5 6.5 8 10 11.5 6.5' : 'M6.5 4.5 10 8 6.5 11.5' }),
  )
}

function renderRow(row: Row, deps: RowDeps): ReactNode {
  const { t, runner, runnerState, records, expanded, estimate, onToggle } = deps
  const record = records.get(row.model)
  const done = runnerState.running.get(row.model)
  const position = runnerState.queued.indexOf(row.model)
  const running = done !== undefined
  const queued = position >= 0
  const open = expanded.has(row.model)

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
    { className: 'bre-fp-row', key: row.model, 'data-bre-fp-open': open ? '1' : undefined },
    createElement(
      'div',
      { className: 'bre-fp-row-head' },
      // The fold control: the chevron carries the state, and the whole toggle
      // (chevron + model id) is one button — a bigger target than the 12px
      // glyph alone, and the row's keyboard path to its own result card.
      createElement(
        'button',
        {
          type: 'button',
          className: 'bre-fp-fold',
          'aria-expanded': open,
          'aria-label': (open ? t('fpDetailHide') : t('fpDetailShow')) + ' ' + row.model,
          title: open ? t('fpDetailHide') : t('fpDetailShow'),
          onClick: (): void => { onToggle(row.model) },
        },
        chevron(open),
        createElement('span', { className: 'bre-fp-model' }, row.model),
      ),
      createElement('span', { className: `bre-fp-badge ${badge.className}` }, badge.text),
      createElement('span', { className: 'grow' }),
      createElement(
        'span',
        { className: 'bre-fp-evidence' },
        record === undefined
          ? cost(t, estimate)
          : t('fpEvidence', {
              used: record.usedOutputs,
              total: FULL_RUN_QUERIES,
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
    !open || record === undefined
      ? null
      : record.status !== 'failed'
        ? renderResult(record, t)
        : record.error !== undefined
          ? createElement('div', { className: 'bre-fp-body' }, createElement('p', { className: 'bre-fp-error' }, record.error))
          : null,
  )
}

/** 结果卡：家族占比、相似度、前三候选、耗时画像、闭集告警。 */
function renderResult(record: FingerprintRecord, t: Translate): ReactNode {
  const top = record.top ?? []
  const timing = record.timing
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
      // 相似度住在结果卡里（m00003）：行头一行放不下它，而它是"第一名像到
      // 什么程度"的明细，展开后才需要读。
      createElement('span', { className: 'bre-fp-k' }, t('fpSimilarity')),
      createElement('span', { className: 'bre-fp-v' }, percent(record.top?.[0]?.similarity)),
      createElement('span', { className: 'grow' }),
      createElement('span', { className: 'bre-fp-k' }, t('fpCheckedAt', { time: clock(record.checkedAt) })),
    ),
    timing !== undefined
      ? createElement('p', { className: 'bre-fp-timing' },
          t('fpTiming', {
            first: seconds(timing.firstTokenMs),
            total: seconds(timing.durationMs),
            rate: timing.charsPerSecond === undefined ? '—' : String(Math.round(timing.charsPerSecond)),
          }))
      : null,
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
