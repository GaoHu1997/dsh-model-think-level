// 后台指纹检测的队列：**一个供应商一个，活在页签外面**。
//
// 为什么不是页签的 React state：用户切到模型配置、切到别的供应商、切到别的
// 页都不该打断检测（m00702 第 2 条）。页签只是订阅者 —— 挂载时订阅、卸载时
// 退订，但绝不动队列。只有两件事会中止：供应商被删除、页面 `pagehide`。
//
// 并发是**有界**的（默认 2）：一键全测如果模型一个一个来，一家中转站跑十个
// 模型就是十倍单模型时间；全开又会同时打十几个请求，正好踩它自己的限流。
// 两个并发是折中 —— 遇到限流应答（429 / rate limit）就再降成 1 并退避一段
// 时间，缓过来才继续。单模型内 3 题仍然并行（并行在宿主那边做）。
//
// 见 docs/fingerprint-design.md §5.3（并发）与 §5.4（后台执行模型）。

import type { FingerprintRecord } from '../fingerprint/verdict.js'
import { readFingerprints, runFingerprint, type FingerprintLine } from './fingerprint-client.js'

/** 一次检测的题数。宿主用同一个数生成挑战。 */
const QUERIES = 3

/** 默认同时检测几个模型。 */
export const DEFAULT_FINGERPRINT_CONCURRENCY = 2

/** 命中限流后的退避时长。 */
export const RATE_LIMIT_BACKOFF_MS = 15_000

/** 传输层或宿主报上来的限流措辞：429、rate limit、too many requests。 */
const RATE_LIMIT_PATTERN = /\b429\b|rate.?limit|too many requests/i

/** Runner 的可调参数；测试用它注入假时钟与假并发。 */
export interface FingerprintRunnerOptions {
  /** 同时检测的模型数上限，默认 {@link DEFAULT_FINGERPRINT_CONCURRENCY}。 */
  concurrency?: number
  /** 限流退避时长，默认 {@link RATE_LIMIT_BACKOFF_MS}。 */
  backoffMs?: number
}

/** 一个面板订阅到的、可安全渲染的快照（引用稳定，改了才换）。 */
export interface FingerprintRunnerState {
  /** 正在跑的模型 → 已完成的题数。 */
  readonly running: ReadonlyMap<string, number>
  /** 排队中的模型，按顺序。 */
  readonly queued: readonly string[]
}

export interface FingerprintRunner {
  /** 当前快照。 */
  getState(): FingerprintRunnerState
  /** 订阅状态变化；返回退订函数。 */
  subscribe(listener: () => void): () => void
  /** 订阅"某个模型的结论落盘了"；返回退订函数。 */
  onRecord(listener: (record: FingerprintRecord) => void): () => void
  /**
   * 订阅"这次检测根本没跑成"（500、断网、流断在半路）。与落盘的 `failed`
   * 记录不同：那不是模型的结论，是一次没有结论的尝试，面板要把它说出来，
   * 否则按钮转一圈就复位，用户看不出有没有真的测过。
   */
  onFailure(listener: (model: string, error: string) => void): () => void
  /** 排队一个模型。已经在跑或已排队就什么都不做。 */
  check(model: string): void
  /** 按顺序排队一批模型。 */
  checkAll(models: readonly string[]): void
  /** 没有等待的或正在跑的检测。 */
  idle(): boolean
  /** 中止整批：清队列、掐正在跑的。已落盘的不撤。 */
  abort(): void
  /** 供应商被删掉 / 页面要走了：停干净并把自己忘掉。 */
  dispose(): void
}

interface Runner extends FingerprintRunner {
  setSender(sender: FingerprintSender | undefined): void
}

/** 面板挂上来的传输缝，方便测试换成假的。 */
export interface FingerprintSender {
  run(route: string, model: string, onLine: (line: FingerprintLine) => void): {
    done: Promise<{ ok: true; record: FingerprintRecord } | { ok: false; error: string }>
    abort(): void
  }
}

const SENDERS = new Map<string, FingerprintSender | undefined>()

function senderOf(route: string): FingerprintSender {
  return SENDERS.get(route) ?? {
    run: (target, model, onLine) => runFingerprint(target, model, onLine),
  }
}

class RouteRunner implements Runner {
  private readonly listeners = new Set<() => void>()
  private readonly recordListeners = new Set<(record: FingerprintRecord) => void>()
  private readonly failureListeners = new Set<(model: string, error: string) => void>()
  private state: FingerprintRunnerState = {
    running: new Map(),
    queued: [],
  }
  /** 正在跑的那几次传输句柄，用来中止。 */
  private readonly handles = new Set<{ abort(): void }>()
  private draining = false
  private disposed = false
  /** 一次检测失败且带限流措辞后置位：本轮只许 1 并发，队列排空前一直生效。 */
  private throttled = false
  /** 退避截止时刻；在此之前不发起下一次检测。 */
  private backoffUntil = 0

  constructor(
    private readonly route: string,
    private readonly concurrency: number = DEFAULT_FINGERPRINT_CONCURRENCY,
    private readonly backoffMs: number = RATE_LIMIT_BACKOFF_MS,
  ) {}

  getState(): FingerprintRunnerState {
    return this.state
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener)
    return () => {
      this.listeners.delete(listener)
    }
  }

  onRecord(listener: (record: FingerprintRecord) => void): () => void {
    this.recordListeners.add(listener)
    return () => {
      this.recordListeners.delete(listener)
    }
  }

  onFailure(listener: (model: string, error: string) => void): () => void {
    this.failureListeners.add(listener)
    return () => {
      this.failureListeners.delete(listener)
    }
  }

  idle(): boolean {
    return this.state.running.size === 0 && this.state.queued.length === 0
  }

  check(model: string): void {
    this.checkAll([model])
  }

  checkAll(models: readonly string[]): void {
    if (this.disposed) return
    const queued = [...this.state.queued]
    for (const model of models) {
      if (queued.includes(model)) continue
      if (this.state.running.has(model)) continue
      queued.push(model)
    }
    if (queued.length === this.state.queued.length) return
    this.publish({ ...this.state, queued })
    void this.drain()
  }

  abort(): void {
    this.publish({ running: new Map(), queued: [] })
    for (const handle of [...this.handles]) handle.abort()
    this.handles.clear()
    this.throttled = false
    this.backoffUntil = 0
  }

  dispose(): void {
    if (this.disposed) return
    this.disposed = true
    this.abort()
    this.listeners.clear()
    this.recordListeners.clear()
    this.failureListeners.clear()
    RUNNERS.delete(this.route)
    SENDERS.delete(this.route)
  }

  setSender(sender: FingerprintSender | undefined): void {
    SENDERS.set(this.route, sender)
  }

  private publish(next: FingerprintRunnerState): void {
    this.state = next
    for (const listener of [...this.listeners]) listener()
  }

  /** 本轮允许的并发上限；限流后收敛到 1。 */
  private limit(): number {
    return this.throttled ? 1 : Math.max(1, this.concurrency)
  }

  /**
   * 把队列灌满到并发上限，等最先落地的一个，再灌、再等；限流退避窗口没过就
   * 不发新的。一轮队列跑完把限流状态清掉，下一批从头算。
   */
  private async drain(): Promise<void> {
    if (this.draining || this.disposed) return
    this.draining = true
    const inflight = new Set<Promise<void>>()
    try {
      while (!this.disposed) {
        while (
          !this.disposed &&
          inflight.size < this.limit() &&
          this.state.queued.length > 0 &&
          Date.now() >= this.backoffUntil
        ) {
          const next = this.state.queued[0]
          if (next === undefined) break
          this.publish({
            running: new Map(this.state.running).set(next, 0),
            queued: this.state.queued.slice(1),
          })
          const run = this.runOne(next).finally(() => {
            inflight.delete(run)
          })
          inflight.add(run)
        }
        if (this.disposed || inflight.size === 0) break
        await Promise.race(inflight)
        if (this.disposed) break
        // 退避窗口没过就等它过去；窗口内已出发的请求照跑，不打断。
        const wait = this.backoffUntil - Date.now()
        if (wait > 0) await new Promise(resolve => setTimeout(resolve, wait))
      }
    } finally {
      inflight.clear()
      // 队列排空（或整批被中止）：限流状态作废，下一批按默认并发从头来。
      this.throttled = false
      this.backoffUntil = 0
      this.draining = false
    }
  }

  private async runOne(model: string): Promise<void> {
    const sender = senderOf(this.route)
    let done = 0
    const handle = sender.run(this.route, model, (line) => {
      if (line.type !== 'progress') return
      done += 1
      // 每题一行，按到达次序计数：面板显示的是"三题里跑完了几题"，不是第几题。
      // 早停的批次宿主不再为被放弃的题发 progress，徽章停在 2/3 等结论行接管。
      this.publish({
        running: new Map(this.state.running).set(model, Math.min(done, QUERIES)),
        queued: this.state.queued,
      })
    })
    this.handles.add(handle)
    try {
      const answer = await handle.done
      if (this.disposed) return

      if (answer.ok) {
        for (const listener of [...this.recordListeners]) listener(answer.record)
      } else {
        // 限流是整个批次的信号：接下来的模型降成 1 并发、退避一会儿再发。
        // 失败本身不打断整批：下一个模型照跑。
        if (RATE_LIMIT_PATTERN.test(answer.error)) {
          this.throttled = true
          this.backoffUntil = Date.now() + this.backoffMs
        }
        // 静默复位会让"点了没反应"和"测完了没结果"长得一模一样，必须说出来。
        for (const listener of [...this.failureListeners]) listener(model, answer.error)
      }
      // 模型本身测出 `failed` 时宿主仍会落盘并 emit result，那条走 onRecord，
      // 面板按结论卡显示 record.error，不经过这里。
    } finally {
      this.handles.delete(handle)
      if (this.state.running.has(model)) {
        const running = new Map(this.state.running)
        running.delete(model)
        this.publish({ running, queued: this.state.queued })
      }
    }
  }
}

const RUNNERS = new Map<string, RouteRunner>()

/**
 * 取（或建）一个供应商的后台检测器。同一路由永远同一个实例，所以页签来回
 * 挂载不会把队列弄丢。
 * @param route - 供应商的设置键。
 * @param options - 并发与退避的可调参数；只在实例首次创建时生效。
 */
export function fingerprintRunner(route: string, options?: FingerprintRunnerOptions): FingerprintRunner {
  let runner = RUNNERS.get(route)
  if (runner === undefined) {
    runner = new RouteRunner(route, options?.concurrency, options?.backoffMs)
    RUNNERS.set(route, runner)
  }
  return runner
}

/**
 * 测试接缝：给一条路由换上传输实现。传 undefined 恢复真实传输。
 * @param route - 供应商的设置键。
 * @param sender - 假的传输。
 */
export function setFingerprintSender(route: string, sender: FingerprintSender | undefined): void {
  SENDERS.set(route, sender)
  const runner = RUNNERS.get(route)
  if (runner !== undefined && sender !== undefined) runner.setSender(sender)
}

/** 页面要走了：把所有还在跑的掐掉。已落盘的不撤。 */
export function teardownFingerprintRunners(): void {
  for (const runner of [...RUNNERS.values()]) runner.dispose()
}

export { readFingerprints }
